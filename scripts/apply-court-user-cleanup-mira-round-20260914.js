#!/usr/bin/env node

const fs = require('fs');
const path = require('path');
const zlib = require('zlib');
const dotenv = require('dotenv');
const { createCourtFinanceRules } = require('../server/court-finance');
const { buildCourtAccountListIndexRowsFromData } = require('../server/page-data/court-account-list-index');
const { createClientFromEnv, getRow, putRow, deleteRow } = require('./lib/staging-data-store');
const { assertProductionWriteTarget, assertProductionWriteTrace } = require('./lib/production-write-guard');

const ROOT = path.join(__dirname, '..');
const REPORT_DIR = path.join(ROOT, 'offline-reports', 'court-user-name-cleanup-20260914');
const PLAN_FILE = path.join(REPORT_DIR, 'mira-and-next-merge-plan-20260914.json');
const TABLES = {
  courts: 'ft_courts',
  index: 'ft_court_account_list_index',
  snapshot: 'ft_court_account_list_snapshot'
};
const MIRA_NAME = 'Mira（运营代订）';
const MIRA_PHONE = '13651248523';
const courtRules = createCourtFinanceRules();

function loadEnv() {
  dotenv.config({ path: path.join(ROOT, '.env.local'), override: true });
  dotenv.config({ path: path.join(ROOT, '.env'), override: false });
}

function text(value) {
  return String(value || '').trim();
}

function money(value) {
  return Math.round((Number(value) || 0) * 100) / 100;
}

function phone(value) {
  return text(value).replace(/\D/g, '');
}

function stampOf(now = new Date().toISOString()) {
  return now.replace(/[^0-9]/g, '').slice(0, 14);
}

function decodeTableStoreRow(row) {
  if (!row || !row.primaryKey) return null;
  const record = { id: row.primaryKey[0]?.value };
  (row.attributes || []).forEach((attribute) => {
    try {
      record[attribute.columnName] = JSON.parse(attribute.columnValue);
    } catch {
      record[attribute.columnName] = attribute.columnValue;
    }
  });
  return record;
}

function batchGetRows(client, tableName, ids) {
  const uniqueIds = [...new Set(ids.map(String).filter(Boolean))];
  if (!uniqueIds.length) return Promise.resolve([]);
  return new Promise((resolve, reject) => {
    client.batchGetRow(
      {
        tables: [{
          tableName,
          primaryKey: uniqueIds.map(id => [{ id }]),
          maxVersions: 1
        }]
      },
      (err, data) => {
        if (err) return reject(err);
        resolve((data.tables?.[0] || []).map(decodeTableStoreRow).filter(Boolean));
      }
    );
  });
}

async function batchGetAll(client, tableName, ids) {
  const rows = [];
  const uniqueIds = [...new Set(ids.map(String).filter(Boolean))];
  for (let i = 0; i < uniqueIds.length; i += 100) {
    rows.push(...await batchGetRows(client, tableName, uniqueIds.slice(i, i + 100)));
  }
  return rows;
}

function decodeSnapshotPayload(payload) {
  return JSON.parse(zlib.gunzipSync(Buffer.from(String(payload), 'base64')).toString('utf8'));
}

function applyDelta(baseRows = [], delta = {}) {
  const byId = new Map((Array.isArray(baseRows) ? baseRows : [])
    .map(row => [text(row?.id || row?.courtId), row])
    .filter(([id]) => id));
  [
    ...(Array.isArray(delta.deletes) ? delta.deletes : []),
    ...(Array.isArray(delta?.payload?.deletedIds) ? delta.payload.deletedIds : [])
  ].forEach(id => byId.delete(text(id)));
  [
    ...(Array.isArray(delta.upserts) ? delta.upserts : []),
    ...(Array.isArray(delta?.payload?.upserts) ? delta.payload.upserts : [])
  ].forEach(row => {
    const id = text(row?.id || row?.courtId);
    if (id) byId.set(id, { ...row, id, courtId: text(row?.courtId || id) });
  });
  return [...byId.values()];
}

async function readSnapshotRows(client) {
  const meta = await getRow(client, TABLES.snapshot, 'active:meta');
  const delta = await getRow(client, TABLES.snapshot, 'active:delta').catch(() => null);
  const bundle = await getRow(client, TABLES.snapshot, meta.bundleId);
  if (!bundle?.payload) throw new Error('订场用户列表快照包缺失');
  return {
    meta,
    delta,
    bundle,
    visibleRows: applyDelta(decodeSnapshotPayload(bundle.payload), delta || {})
  };
}

function updateSnapshotDelta(deltaRow, deletedIds, upsertRows, trace, now) {
  const payload = typeof deltaRow?.payload === 'object' && deltaRow.payload ? deltaRow.payload : {};
  const deletes = new Set([
    ...(Array.isArray(deltaRow?.deletes) ? deltaRow.deletes : []),
    ...(Array.isArray(payload.deletedIds) ? payload.deletedIds : []),
    ...deletedIds
  ].map(String).filter(Boolean));
  const upserts = new Map([
    ...(Array.isArray(deltaRow?.upserts) ? deltaRow.upserts : []),
    ...(Array.isArray(payload.upserts) ? payload.upserts : [])
  ].map(row => [text(row?.id), row]).filter(([id]) => id));
  upsertRows.forEach(row => upserts.set(text(row.id), row));
  deletedIds.forEach(id => upserts.delete(String(id)));
  const finalUpserts = [...upserts.values()].filter(row => !deletes.has(text(row.id)));
  return {
    ...(deltaRow || {}),
    id: 'active:delta',
    type: 'delta',
    operationId: trace.operationId,
    batchId: trace.batchId,
    updatedAt: now,
    deletes: [...deletes],
    upserts: finalUpserts,
    count: deletes.size + finalUpserts.length,
    payload: { ...payload, deletedIds: [...deletes], upserts: finalUpserts }
  };
}

function normalizeHistoryForMerge(court, sourceName = '') {
  const history = Array.isArray(court?.history) ? court.history : [];
  const note = sourceName ? `原订场用户：${sourceName}` : '';
  return {
    ...court,
    history: history.map(row => {
      const systemAmount = money(row?.systemAmount);
      const finalAmount = money(row?.finalAmount !== undefined ? row.finalAmount : row?.amount);
      const needsReason = row?.category === '订场' && systemAmount > 0 && systemAmount !== finalAmount && !text(row?.overrideReason);
      const next = needsReason ? { ...row, overrideReason: '历史订场用户合并补齐' } : { ...row };
      if (!note) return next;
      if (text(next.remark || next.remarks || next.note || next.memo).includes(note)) return next;
      if (text(next.remark)) next.remark = `${next.remark}；${note}`;
      else if (text(next.remarks)) next.remarks = `${next.remarks}；${note}`;
      else if (text(next.note)) next.note = `${next.note}；${note}`;
      else if (text(next.memo)) next.memo = `${next.memo}；${note}`;
      else next.remark = note;
      return next;
    })
  };
}

function buildIndexRow(targetCourt, previousIndexRow, now) {
  const oldItem = previousIndexRow?.item || {};
  const membershipAccount = oldItem.membershipAccount;
  const row = buildCourtAccountListIndexRowsFromData({
    campuses: [{ code: targetCourt.campus || 'shunyi_mapo', name: '顺义马坡' }],
    courts: [targetCourt],
    membershipAccounts: membershipAccount ? [membershipAccount] : [],
    membershipOrders: [],
    membershipPlans: [],
    membershipBenefitLedger: [],
    membershipAccountEvents: [],
    students: [],
    leads: []
  })[0];
  if (!row) throw new Error(`索引重算失败：${targetCourt.id}`);
  row.item = {
    ...oldItem,
    ...row.item,
    displayName: targetCourt.name,
    phone: String(targetCourt.phone || row.item.phone || ''),
    balance: Number(targetCourt.balance) || 0,
    totalDeposit: Number(targetCourt.totalDeposit) || 0,
    totalSpent: Number(targetCourt.spentAmount) || 0,
    totalReceived: Number(targetCourt.receivedAmount) || 0,
    accountType: oldItem.accountType || row.item.accountType,
    membershipTierLabel: oldItem.membershipTierLabel || row.item.membershipTierLabel,
    membershipStatus: oldItem.membershipStatus || row.item.membershipStatus,
    membershipStatusCode: oldItem.membershipStatusCode || row.item.membershipStatusCode,
    membershipDiscountText: oldItem.membershipDiscountText || row.item.membershipDiscountText,
    membershipValidUntil: oldItem.membershipValidUntil || row.item.membershipValidUntil,
    membershipAccount: oldItem.membershipAccount || row.item.membershipAccount,
    firstOpenDate: oldItem.firstOpenDate || row.item.firstOpenDate
  };
  row.item.exportRow = {
    ...(row.item.exportRow || {}),
    displayName: row.item.displayName,
    phone: row.item.phone,
    balance: row.item.balance,
    totalDeposit: row.item.totalDeposit,
    totalSpent: row.item.totalSpent,
    totalReceived: row.item.totalReceived
  };
  row.generatedAt = now;
  return row;
}

function summarizeIndex(row) {
  return {
    id: text(row?.id),
    name: text(row?.item?.displayName),
    phone: text(row?.item?.phone),
    bookingCount: Number(row?.item?.bookingCount) || 0,
    totalSpent: money(row?.item?.totalSpent),
    balance: money(row?.item?.balance)
  };
}

function findExactVisibleRows(snapshot, names) {
  const wanted = new Set(names.map(text).filter(Boolean));
  return snapshot.visibleRows.filter(row => wanted.has(text(row?.item?.displayName)));
}

function chooseMiraTarget(rows) {
  return rows.find(row => text(row?.item?.displayName) === MIRA_NAME)
    || rows.find(row => /Mira/i.test(text(row?.item?.displayName)) && /运营/.test(text(row?.item?.displayName)))
    || null;
}

async function run() {
  loadEnv();
  const now = new Date().toISOString();
  const stamp = stampOf(now);
  const trace = {
    operationId: `court-mira-cleanup-round-20260914-${stamp}`,
    batchId: `batch-court-mira-cleanup-round-20260914-${stamp}`
  };
  const reportPath = path.join(REPORT_DIR, `${trace.operationId}-write.json`);
  const target = await assertProductionWriteTarget();
  assertProductionWriteTrace({ operationId: trace.operationId, batchId: trace.batchId, reportPath });

  const plan = JSON.parse(fs.readFileSync(PLAN_FILE, 'utf8'));
  const planMiraSourceIds = (plan.mergeList || []).flatMap(group => (group.sources || []).map(source => text(source.id))).filter(Boolean);
  const extraMiraNames = ['曹 八五折订场', '曹 85折订场', '3小时发球机+1小时场地'];
  const wangNames = ['王熙宁 发球机', '王熙宁 订场+球'];
  const phoneRenames = [
    { sourceName: '13451341708 定场', targetName: '订场用户1708', phone: '13451341708' },
    { sourceName: '15110060705 订场', targetName: '订场用户0705', phone: '15110060705' },
    { sourceName: '18101817128 订场', targetName: '订场用户7128', phone: '18101817128' }
  ];

  const client = createClientFromEnv();
  const snapshot = await readSnapshotRows(client);
  const miraTargetVisible = chooseMiraTarget(snapshot.visibleRows);
  if (!miraTargetVisible) throw new Error('找不到 Mira 目标账号');
  const exactExtraMiraRows = findExactVisibleRows(snapshot, extraMiraNames);
  const exactWangRows = findExactVisibleRows(snapshot, [...wangNames, '王熙宁']);
  const exactPhoneRenameRows = findExactVisibleRows(snapshot, phoneRenames.map(row => row.sourceName));
  const wangTargetVisible = exactWangRows.find(row => text(row?.item?.displayName) === '王熙宁')
    || exactWangRows.find(row => text(row?.item?.displayName) === '王熙宁 订场+球')
    || exactWangRows.find(row => text(row?.item?.displayName) === '王熙宁 发球机');
  if (!wangTargetVisible) throw new Error('找不到王熙宁目标账号');

  const miraSourceIds = [...new Set([
    ...planMiraSourceIds,
    ...exactExtraMiraRows.map(row => text(row.id || row.courtId))
  ])].filter(id => id && id !== text(miraTargetVisible.id || miraTargetVisible.courtId));
  const wangSourceIds = exactWangRows
    .filter(row => wangNames.includes(text(row?.item?.displayName)))
    .map(row => text(row.id || row.courtId))
    .filter(id => id && id !== text(wangTargetVisible.id || wangTargetVisible.courtId));
  const phoneRenameIds = exactPhoneRenameRows.map(row => text(row.id || row.courtId)).filter(Boolean);
  const allIds = [...new Set([
    text(miraTargetVisible.id || miraTargetVisible.courtId),
    text(wangTargetVisible.id || wangTargetVisible.courtId),
    ...miraSourceIds,
    ...wangSourceIds,
    ...phoneRenameIds
  ])];
  const indexRows = await batchGetAll(client, TABLES.index, allIds);
  const courtRows = await batchGetAll(client, TABLES.courts, allIds);
  const indexById = new Map(indexRows.map(row => [text(row.id), row]));
  const courtById = new Map(courtRows.map(row => [text(row.id), row]));
  const missingCourtIds = allIds.filter(id => !courtById.has(id));
  if (missingCourtIds.length) throw new Error(`找不到订场用户明细：${missingCourtIds.join(',')}`);

  const courtUpdates = new Map();
  const indexUpserts = new Map();
  const indexDeletes = new Set();
  const items = [];

  function mergeGroup(targetVisible, sourceIds, fixedName, fixedPhone = '') {
    const targetId = text(targetVisible.id || targetVisible.courtId);
    let targetCourt = normalizeHistoryForMerge({
      ...courtById.get(targetId),
      name: fixedName,
      phone: fixedPhone || courtById.get(targetId).phone || ''
    });
    const sources = [];
    for (const sourceId of sourceIds) {
      const sourceCourtRaw = courtById.get(sourceId);
      const sourceIndex = indexById.get(sourceId);
      if (!sourceCourtRaw || !sourceIndex) continue;
      const sourceName = text(sourceIndex?.item?.displayName || sourceCourtRaw.name);
      const sourceCourt = normalizeHistoryForMerge(sourceCourtRaw, sourceName);
      const merged = courtRules.mergeCourtRecords({
        targetCourt,
        sourceCourt,
        membershipAccounts: [],
        membershipOrders: [],
        membershipBenefitLedger: [],
        membershipAccountEvents: [],
        now
      });
      targetCourt = { ...merged.targetCourt, name: fixedName, phone: fixedPhone || merged.targetCourt.phone || '' };
      courtUpdates.set(text(merged.sourceCourt.id), { ...merged.sourceCourt, operationId: trace.operationId, batchId: trace.batchId, updatedAt: now });
      indexDeletes.add(text(merged.sourceCourt.id));
      sources.push(summarizeIndex(sourceIndex));
    }
    courtUpdates.set(text(targetCourt.id), { ...targetCourt, operationId: trace.operationId, batchId: trace.batchId, updatedAt: now });
    indexUpserts.set(text(targetCourt.id), buildIndexRow(targetCourt, indexById.get(text(targetCourt.id)), now));
    items.push({ targetName: fixedName, target: summarizeIndex(indexById.get(text(targetCourt.id))), sourceCount: sources.length, sources });
  }

  mergeGroup(miraTargetVisible, miraSourceIds, MIRA_NAME, MIRA_PHONE);
  mergeGroup(wangTargetVisible, wangSourceIds, '王熙宁');

  const phoneRenameItems = [];
  for (const spec of phoneRenames) {
    const row = exactPhoneRenameRows.find(item => text(item?.item?.displayName) === spec.sourceName);
    if (!row) continue;
    const id = text(row.id || row.courtId);
    const court = courtById.get(id);
    const renamed = {
      ...court,
      name: spec.targetName,
      phone: spec.phone,
      operationId: trace.operationId,
      batchId: trace.batchId,
      updatedAt: now
    };
    courtUpdates.set(id, renamed);
    indexUpserts.set(id, buildIndexRow(renamed, indexById.get(id), now));
    phoneRenameItems.push({ from: spec.sourceName, to: spec.targetName, phone: spec.phone, id });
  }

  const snapshotDelta = updateSnapshotDelta(snapshot.delta, [...indexDeletes], [...indexUpserts.values()], trace, now);
  const report = {
    generatedAt: now,
    mode: 'write',
    operationId: trace.operationId,
    batchId: trace.batchId,
    target,
    reportPath,
    summary: {
      miraSourceRows: miraSourceIds.length,
      wangSourceRows: wangSourceIds.length,
      phoneRenameRows: phoneRenameItems.length,
      affectedCourts: allIds.length,
      courtWrites: courtUpdates.size,
      indexUpserts: indexUpserts.size,
      indexDeletes: indexDeletes.size,
      snapshotWrites: 1
    },
    items,
    phoneRenameItems,
    backupBefore: {
      indexRows,
      courts: courtRows,
      snapshotRows: [snapshot.meta, snapshot.delta, snapshot.bundle].filter(Boolean)
    },
    plannedWrites: {
      courts: [...courtUpdates.values()],
      indexUpserts: [...indexUpserts.values()],
      indexDeletes: [...indexDeletes],
      snapshotUpdates: [snapshotDelta]
    }
  };
  fs.writeFileSync(reportPath, `${JSON.stringify(report, null, 2)}\n`, 'utf8');

  for (const row of report.plannedWrites.courts) await putRow(client, TABLES.courts, row);
  for (const row of report.plannedWrites.indexUpserts) await putRow(client, TABLES.index, row);
  for (const id of report.plannedWrites.indexDeletes) await deleteRow(client, TABLES.index, id);
  await putRow(client, TABLES.snapshot, snapshotDelta);

  const verifySnapshot = await readSnapshotRows(client);
  const visibleById = new Map(verifySnapshot.visibleRows.map(row => [text(row.id || row.courtId), row]));
  const stillVisibleMerged = [...miraSourceIds, ...wangSourceIds].filter(id => visibleById.has(id));
  const visibleRenames = phoneRenameItems.map(item => {
    const row = visibleById.get(item.id);
    return { ...item, visibleName: text(row?.item?.displayName), visiblePhone: text(row?.item?.phone) };
  });
  const verify = {
    mergedSourcesStillVisible: stillVisibleMerged.length,
    phoneRenameVisibleOk: visibleRenames.filter(row => row.visibleName === row.to && phone(row.visiblePhone) === row.phone).length,
    phoneRenameExpected: phoneRenameItems.length,
    miraTargetVisible: text(visibleById.get(text(miraTargetVisible.id || miraTargetVisible.courtId))?.item?.displayName),
    wangTargetVisible: text(visibleById.get(text(wangTargetVisible.id || wangTargetVisible.courtId))?.item?.displayName)
  };
  console.log(JSON.stringify({
    reportPath,
    summary: report.summary,
    items: items.map(item => ({ targetName: item.targetName, sourceCount: item.sourceCount })),
    phoneRenameItems,
    verify
  }, null, 2));
}

run().catch(err => {
  console.error(err);
  process.exit(1);
});
