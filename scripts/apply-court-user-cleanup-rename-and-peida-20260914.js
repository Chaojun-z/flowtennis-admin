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
    operationId: `court-rename-peida-cleanup-20260914-${stamp}`,
    batchId: `batch-court-rename-peida-cleanup-20260914-${stamp}`
  };
  const reportPath = path.join(REPORT_DIR, `${trace.operationId}-write.json`);
  const target = await assertProductionWriteTarget();
  assertProductionWriteTrace({ operationId: trace.operationId, batchId: trace.batchId, reportPath });

  const plan = JSON.parse(fs.readFileSync(PLAN_FILE, 'utf8'));
  const client = createClientFromEnv();
  const snapshot = await readSnapshotRows(client);
  const visibleById = new Map(snapshot.visibleRows.map(row => [text(row.id || row.courtId), row]));
  const miraVisible = chooseMiraTarget(snapshot.visibleRows);
  if (!miraVisible) throw new Error('找不到 Mira 目标账号');

  const renameSpecs = (plan.renameOnly || [])
    .map(row => ({ id: text(row.id), from: text(row.name), to: text(row.newName) }))
    .filter(row => row.id && row.to && visibleById.has(row.id));
  const peidaSourceIds = (plan.skip || [])
    .map(row => text(row.id))
    .filter(id => id && visibleById.has(id));

  const allIds = [...new Set([
    text(miraVisible.id || miraVisible.courtId),
    ...renameSpecs.map(row => row.id),
    ...peidaSourceIds
  ])];
  const indexRows = await batchGetAll(client, TABLES.index, allIds);
  const courtRows = await batchGetAll(client, TABLES.courts, allIds);
  const indexById = new Map(indexRows.map(row => [text(row.id), row]));
  const courtById = new Map(courtRows.map(row => [text(row.id), row]));
  const missing = allIds.filter(id => !courtById.has(id));
  if (missing.length) throw new Error(`找不到订场用户明细：${missing.join(',')}`);

  const courtUpdates = new Map();
  const indexUpserts = new Map();
  const indexDeletes = new Set();
  const renameItems = [];

  for (const spec of renameSpecs) {
    const court = courtById.get(spec.id);
    const renamed = {
      ...court,
      name: spec.to,
      operationId: trace.operationId,
      batchId: trace.batchId,
      updatedAt: now
    };
    courtUpdates.set(spec.id, renamed);
    indexUpserts.set(spec.id, buildIndexRow(renamed, indexById.get(spec.id), now));
    renameItems.push({ id: spec.id, from: spec.from, to: spec.to });
  }

  const miraId = text(miraVisible.id || miraVisible.courtId);
  let miraCourt = normalizeHistoryForMerge({
    ...courtById.get(miraId),
    name: MIRA_NAME,
    phone: MIRA_PHONE
  });
  const peidaItems = [];
  for (const sourceId of peidaSourceIds) {
    if (sourceId === miraId) continue;
    const sourceCourtRaw = courtById.get(sourceId);
    const sourceIndex = indexById.get(sourceId);
    const sourceName = text(sourceIndex?.item?.displayName || sourceCourtRaw?.name);
    const sourceCourt = normalizeHistoryForMerge(sourceCourtRaw, sourceName);
    const merged = courtRules.mergeCourtRecords({
      targetCourt: miraCourt,
      sourceCourt,
      membershipAccounts: [],
      membershipOrders: [],
      membershipBenefitLedger: [],
      membershipAccountEvents: [],
      now
    });
    miraCourt = { ...merged.targetCourt, name: MIRA_NAME, phone: MIRA_PHONE };
    courtUpdates.set(text(merged.sourceCourt.id), {
      ...merged.sourceCourt,
      operationId: trace.operationId,
      batchId: trace.batchId,
      updatedAt: now
    });
    indexDeletes.add(text(merged.sourceCourt.id));
    peidaItems.push(summarizeIndex(sourceIndex));
  }
  courtUpdates.set(miraId, {
    ...miraCourt,
    operationId: trace.operationId,
    batchId: trace.batchId,
    updatedAt: now
  });
  indexUpserts.set(miraId, buildIndexRow(miraCourt, indexById.get(miraId), now));

  const snapshotDelta = updateSnapshotDelta(snapshot.delta, [...indexDeletes], [...indexUpserts.values()], trace, now);
  const report = {
    generatedAt: now,
    mode: 'write',
    operationId: trace.operationId,
    batchId: trace.batchId,
    target,
    reportPath,
    summary: {
      renameRows: renameItems.length,
      peidaMergeRows: peidaItems.length,
      affectedCourts: allIds.length,
      courtWrites: courtUpdates.size,
      indexUpserts: indexUpserts.size,
      indexDeletes: indexDeletes.size,
      snapshotWrites: 1
    },
    renameItems,
    peidaTarget: summarizeIndex(indexById.get(miraId)),
    peidaItems,
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
  const verifyById = new Map(verifySnapshot.visibleRows.map(row => [text(row.id || row.courtId), row]));
  const renameOk = renameItems.filter(item => text(verifyById.get(item.id)?.item?.displayName) === item.to).length;
  const peidaStillVisible = peidaSourceIds.filter(id => verifyById.has(id)).length;
  console.log(JSON.stringify({
    reportPath,
    summary: report.summary,
    verify: {
      renameOk,
      renameExpected: renameItems.length,
      peidaSourcesStillVisible: peidaStillVisible,
      miraTargetVisible: text(verifyById.get(miraId)?.item?.displayName)
    }
  }, null, 2));
}

run().catch(err => {
  console.error(err);
  process.exit(1);
});
