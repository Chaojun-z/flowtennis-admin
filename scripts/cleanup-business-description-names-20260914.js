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
const SOURCE_LIST = path.join(REPORT_DIR, 'business-description-name-cleanup-local-list-20260914.json');
const TABLES = {
  courts: 'ft_courts',
  index: 'ft_court_account_list_index',
  snapshot: 'ft_court_account_list_snapshot'
};
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

function decodeRow(row) {
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
        resolve((data.tables?.[0] || []).map(decodeRow).filter(Boolean));
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
  const baseRows = decodeSnapshotPayload(bundle.payload);
  return { meta, delta, bundle, baseRows, visibleRows: applyDelta(baseRows, delta || {}) };
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

function normalizeHistoryForMerge(court) {
  const history = Array.isArray(court?.history) ? court.history : [];
  return {
    ...court,
    history: history.map(row => {
      const systemAmount = money(row?.systemAmount);
      const finalAmount = money(row?.finalAmount !== undefined ? row.finalAmount : row?.amount);
      const needsReason = row?.category === '订场' && systemAmount > 0 && systemAmount !== finalAmount && !text(row?.overrideReason);
      return needsReason ? { ...row, overrideReason: '历史订场用户合并补齐' } : row;
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

function summarize(row) {
  return {
    id: text(row?.id),
    name: text(row?.item?.displayName),
    phone: text(row?.item?.phone),
    bookingCount: Number(row?.item?.bookingCount) || 0,
    totalSpent: money(row?.item?.totalSpent),
    totalReceived: money(row?.item?.totalReceived),
    balance: money(row?.item?.balance)
  };
}

async function run() {
  loadEnv();
  const now = new Date().toISOString();
  const trace = {
    operationId: `court-business-description-name-cleanup-20260914-${stampOf(now)}`,
    batchId: `batch-court-business-description-name-cleanup-20260914-${stampOf(now)}`
  };
  const reportPath = path.join(REPORT_DIR, `${trace.operationId}-write.json`);
  const target = await assertProductionWriteTarget();
  assertProductionWriteTrace({ operationId: trace.operationId, batchId: trace.batchId, reportPath });
  const source = JSON.parse(fs.readFileSync(SOURCE_LIST, 'utf8'));
  const client = createClientFromEnv();
  const snapshot = await readSnapshotRows(client);

  const desired = [];
  Object.entries(source.groups || {}).forEach(([targetName, items]) => {
    (items || []).forEach(item => desired.push({ targetName, sourceName: text(item.sourceName) }));
  });
  const names = new Set(desired.flatMap(item => [item.targetName, item.sourceName]).map(text).filter(Boolean));
  const visibleCandidateRows = snapshot.visibleRows.filter(row => names.has(text(row?.item?.displayName)));
  const activeIndexRows = await batchGetAll(client, TABLES.index, visibleCandidateRows.map(row => row.id || row.courtId));
  const indexById = new Map(activeIndexRows.map(row => [text(row.id), row]));
  const rowsByName = new Map();
  activeIndexRows.forEach(row => {
    const name = text(row?.item?.displayName);
    if (!rowsByName.has(name)) rowsByName.set(name, []);
    rowsByName.get(name).push(row);
  });

  const groups = new Map();
  for (const item of desired) {
    if (!groups.has(item.targetName)) groups.set(item.targetName, new Set());
    (rowsByName.get(item.sourceName) || []).forEach(row => groups.get(item.targetName).add(text(row.id)));
  }

  const targetRows = new Map();
  for (const targetName of groups.keys()) {
    const candidates = rowsByName.get(targetName) || [];
    if (!candidates.length) throw new Error(`找不到保留账号：${targetName}`);
    targetRows.set(targetName, candidates.slice().sort((a, b) => {
      const memberDelta = Number(text(b?.item?.accountType) === '会员账户') - Number(text(a?.item?.accountType) === '会员账户');
      if (memberDelta) return memberDelta;
      return (Number(b?.item?.bookingCount) || 0) - (Number(a?.item?.bookingCount) || 0);
    })[0]);
  }

  const sourceIds = [];
  const items = [];
  for (const [targetName, sourceSet] of groups.entries()) {
    const targetRow = targetRows.get(targetName);
    const ids = [...sourceSet].filter(id => id && id !== text(targetRow.id));
    ids.forEach(id => sourceIds.push(id));
    items.push({
      targetName,
      target: summarize(targetRow),
      sourceCount: ids.length,
      sources: ids.map(id => summarize(indexById.get(id)))
    });
  }

  const affectedIds = [...new Set([...sourceIds, ...[...targetRows.values()].map(row => text(row.id))])];
  const courtRows = await batchGetAll(client, TABLES.courts, affectedIds);
  const courtById = new Map(courtRows.map(row => [text(row.id), row]));
  const courtUpdates = new Map();
  const indexUpserts = new Map();
  const indexDeletes = new Set();

  for (const [targetName, sourceSet] of groups.entries()) {
    const targetIndex = targetRows.get(targetName);
    let targetCourt = normalizeHistoryForMerge({ ...courtById.get(text(targetIndex.id)), name: targetName });
    for (const sourceId of [...sourceSet]) {
      if (sourceId === text(targetIndex.id)) continue;
      const sourceCourt = normalizeHistoryForMerge(courtById.get(sourceId));
      if (!sourceCourt) continue;
      const merged = courtRules.mergeCourtRecords({
        targetCourt,
        sourceCourt,
        membershipAccounts: [],
        membershipOrders: [],
        membershipBenefitLedger: [],
        membershipAccountEvents: [],
        now
      });
      targetCourt = { ...merged.targetCourt, name: targetName };
      courtUpdates.set(text(merged.sourceCourt.id), { ...merged.sourceCourt, operationId: trace.operationId, batchId: trace.batchId, updatedAt: now });
      indexDeletes.add(text(merged.sourceCourt.id));
    }
    courtUpdates.set(text(targetCourt.id), { ...targetCourt, operationId: trace.operationId, batchId: trace.batchId, updatedAt: now });
    indexUpserts.set(text(targetCourt.id), buildIndexRow(targetCourt, targetIndex, now));
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
      requestedRows: desired.length,
      groups: items.length,
      activeSourceRows: sourceIds.length,
      affectedCourts: affectedIds.length,
      courtWrites: courtUpdates.size,
      indexUpserts: indexUpserts.size,
      indexDeletes: indexDeletes.size,
      snapshotWrites: 1
    },
    items,
    backupBefore: {
      indexRows: affectedIds.map(id => indexById.get(id)).filter(Boolean),
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
  for (const row of report.plannedWrites.snapshotUpdates) await putRow(client, TABLES.snapshot, row);

  console.log(JSON.stringify({
    reportPath,
    summary: report.summary,
    items: items.map(item => ({ targetName: item.targetName, sourceCount: item.sourceCount }))
  }, null, 2));
}

run().catch(err => {
  console.error(err);
  process.exit(1);
});
