#!/usr/bin/env node

const fs = require('fs');
const path = require('path');
const dotenv = require('dotenv');
const zlib = require('zlib');
const { createCourtFinanceRules } = require('../server/court-finance');
const { buildCourtAccountListIndexRowsFromData } = require('../server/page-data/court-account-list-index');
const { createClientFromEnv, scanTable, getRow, putRow, deleteRow } = require('./lib/staging-data-store');
const { parseWriteFlags, assertProductionWriteTarget, assertProductionWriteTrace } = require('./lib/production-write-guard');

const ROOT = path.join(__dirname, '..');
const REPORT_DIR = path.join(ROOT, 'offline-reports', 'court-user-name-cleanup-20260914');
const CSV_FILES = ['', ' (1)', ' (2)', ' (3)', ' (4)', ' (5)', ' (6)', ' (7)', ' (8)']
  .map(suffix => `/Users/shaobaolu/Downloads/FlowTennis_订场用户_2026-09-14${suffix}.csv`);
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

function operationTrace(now = new Date().toISOString()) {
  const stamp = now.replace(/[^0-9]/g, '').slice(0, 14) || String(Date.now());
  const operationId = `court-user-name-groups-cleanup-20260914-${stamp}`;
  return { operationId, batchId: `batch-${operationId}` };
}

function normalizeName(value) {
  return text(value)
    .toLowerCase()
    .replace(/[（）()\[\]【】{}<>《》,，.。:：;；、\/\\|+＋\-—_~!！?？'"“”‘’]/g, '')
    .replace(/\s+/g, '');
}

function stripBusinessWords(value) {
  let s = normalizeName(value);
  const words = [
    '私教课体验课', '私教体验课', '私教体验', '私教课', '体验课',
    '订场发球机', '订场陪打', '订场', '定场', '发球机', '免费赠送',
    '学生家长', '老师学生家长', '老师学员家长', '学生', '学员', '家长',
    '老师', '教练', '先生', '女士', '用户'
  ];
  let changed = true;
  while (changed) {
    changed = false;
    for (const word of words) {
      const next = s.replaceAll(normalizeName(word), '');
      if (next !== s) {
        s = next;
        changed = true;
      }
    }
  }
  return s;
}

function parseCsv(content) {
  const rows = [];
  let row = [];
  let field = '';
  let inQuotes = false;
  for (let i = 0; i < content.length; i += 1) {
    const ch = content[i];
    const next = content[i + 1];
    if (ch === '"') {
      if (inQuotes && next === '"') {
        field += '"';
        i += 1;
      } else {
        inQuotes = !inQuotes;
      }
      continue;
    }
    if (ch === ',' && !inQuotes) {
      row.push(field);
      field = '';
      continue;
    }
    if ((ch === '\n' || ch === '\r') && !inQuotes) {
      if (ch === '\r' && next === '\n') i += 1;
      row.push(field);
      rows.push(row);
      row = [];
      field = '';
      continue;
    }
    field += ch;
  }
  if (field || row.length) {
    row.push(field);
    rows.push(row);
  }
  const header = (rows.shift() || []).map(text);
  return rows
    .filter(cols => cols.some(value => text(value)))
    .map(cols => Object.fromEntries(header.map((key, index) => [key, cols[index] || ''])));
}

function readLocalCsvRows() {
  return CSV_FILES.flatMap(file => {
    const content = fs.readFileSync(file, 'utf8').replace(/^\uFEFF/, '');
    return parseCsv(content);
  });
}

function buildLocalCandidateNameKeys() {
  const rows = readLocalCsvRows();
  const byExact = new Map();
  const byBase = new Map();
  for (const row of rows) {
    const name = text(row['姓名']);
    if (!name) continue;
    const exactKey = normalizeName(name);
    const base = stripBusinessWords(name);
    if (!byExact.has(exactKey)) byExact.set(exactKey, []);
    byExact.get(exactKey).push(row);
    if (!byBase.has(base)) byBase.set(base, []);
    byBase.get(base).push(row);
  }
  const candidateKeys = new Set();
  let exactGroups = 0;
  let exactRows = 0;
  let similarGroups = 0;
  let similarRows = 0;
  for (const [key, groupRows] of byExact.entries()) {
    if (groupRows.length < 2) continue;
    exactGroups += 1;
    exactRows += groupRows.length;
    candidateKeys.add(key);
  }
  for (const [, groupRows] of byBase.entries()) {
    const names = new Set(groupRows.map(row => normalizeName(row['姓名'])));
    if (groupRows.length < 2 || names.size < 2) continue;
    similarGroups += 1;
    similarRows += groupRows.length;
    names.forEach(name => candidateKeys.add(name));
  }
  return {
    files: CSV_FILES.length,
    rows: rows.length,
    exactGroups,
    exactRows,
    similarGroups,
    similarRows,
    candidateKeys: [...candidateKeys]
  };
}

function decodeSnapshotPayload(payload) {
  if (!payload) return [];
  const json = zlib.gunzipSync(Buffer.from(String(payload), 'base64')).toString('utf8');
  return JSON.parse(json);
}

function applySnapshotDeltaRows(baseRows = [], delta = {}) {
  const byId = new Map((Array.isArray(baseRows) ? baseRows : [])
    .map(row => [text(row?.id || row?.courtId), row])
    .filter(([id]) => id));
  const deletes = [
    ...(Array.isArray(delta.deletes) ? delta.deletes : []),
    ...(Array.isArray(delta?.payload?.deletedIds) ? delta.payload.deletedIds : [])
  ];
  deletes.forEach(id => byId.delete(text(id)));
  const upserts = [
    ...(Array.isArray(delta.upserts) ? delta.upserts : []),
    ...(Array.isArray(delta?.payload?.upserts) ? delta.payload.upserts : []),
    ...(Array.isArray(delta?.payload?.rows) ? delta.payload.rows : [])
  ];
  upserts.forEach(row => {
    const id = text(row?.id || row?.courtId);
    if (id) byId.set(id, { ...row, id, courtId: text(row?.courtId || id) });
  });
  return [...byId.values()];
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
        const rows = (data.tables?.[0] || []).map(decodeTableStoreRow).filter(Boolean);
        resolve(rows);
      }
    );
  });
}

async function readSnapshotIndexRows(client) {
  const [meta, delta] = await Promise.all([
    getRow(client, TABLES.snapshot, 'active:meta'),
    getRow(client, TABLES.snapshot, 'active:delta').catch(() => null)
  ]);
  if (!meta?.bundleId) throw new Error('订场用户列表快照 meta 缺少 bundleId');
  const bundle = await getRow(client, TABLES.snapshot, meta.bundleId);
  if (!bundle?.payload) throw new Error('订场用户列表快照包缺失');
  return {
    meta,
    delta,
    bundle,
    rows: applySnapshotDeltaRows(decodeSnapshotPayload(bundle.payload), delta || {})
  };
}

async function readExistingRows(client, tableName, ids) {
  const uniqueIds = [...new Set(ids.map(String).filter(Boolean))];
  const rows = [];
  for (let i = 0; i < uniqueIds.length; i += 100) {
    const batch = uniqueIds.slice(i, i + 100);
    const batchRows = await batchGetRows(client, tableName, batch);
    rows.push(...batchRows);
  }
  return rows.filter(Boolean);
}

function phone(value) {
  return text(value).replace(/\D/g, '');
}

function isActiveIndexItem(row) {
  const item = row?.item || {};
  return text(row?.id || item.id) && text(item.displayName);
}

function isUnsafeBase(base) {
  if (!base || base.length < 2) return true;
  if (/^\d+$/.test(base)) return true;
  if (!/[a-z0-9\u4e00-\u9fa5]/i.test(base)) return true;
  return new Set([
    '订场', '定场', '散客', '无名', '训练', '陪打', '美团', '领导', '用户',
    '私教', '体验', '私教课', '体验课', '先生', '女士', '畅打', '畅打预留'
  ]).has(base);
}

function dirtyScore(name) {
  const raw = text(name);
  let score = 0;
  if (/订场|定场|私教|体验课|发球机|免费赠送|学生|学员|家长|老师|教练/.test(raw)) score += 5;
  if (/用户|先生|女士/.test(raw)) score += 2;
  if (/^\d+$/.test(normalizeName(raw))) score += 5;
  return score;
}

function rowMetric(row, key) {
  const item = row?.item || {};
  if (key === 'spent') return money(item.totalSpent);
  if (key === 'booking') return Number(item.bookingCount) || 0;
  return text(item.lastBookingDate);
}

function chooseTarget(rows, standardName) {
  const exactClean = rows.find(row => normalizeName(row?.item?.displayName) === normalizeName(standardName) && text(row?.item?.accountType) === '会员账户');
  if (exactClean) return exactClean;
  return rows.slice().sort((a, b) => {
    const memberDelta = Number(text(b?.item?.accountType) === '会员账户') - Number(text(a?.item?.accountType) === '会员账户');
    if (memberDelta) return memberDelta;
    const dirtyDelta = dirtyScore(a?.item?.displayName) - dirtyScore(b?.item?.displayName);
    if (dirtyDelta) return dirtyDelta;
    const bookingDelta = rowMetric(b, 'booking') - rowMetric(a, 'booking');
    if (bookingDelta) return bookingDelta;
    const spentDelta = rowMetric(b, 'spent') - rowMetric(a, 'spent');
    if (spentDelta) return spentDelta;
    return rowMetric(b, 'last').localeCompare(rowMetric(a, 'last'));
  })[0] || null;
}

function hasBusinessSuffix(name) {
  return stripBusinessWords(name) !== normalizeName(name);
}

function buildCandidateGroups(indexRows) {
  const groups = [];
  const skipped = [];
  const usedIds = new Set();
  const rows = indexRows.filter(isActiveIndexItem);

  function addGroup(kind, key, rowsForGroup, standardName) {
    const rowsUnique = rowsForGroup.filter(row => !usedIds.has(text(row.id)));
    if (rowsUnique.length < 2) return;
    const phones = [...new Set(rowsUnique.map(row => phone(row?.item?.phone)).filter(Boolean))];
    const hasGeneric = rowsUnique.some(row => /无名用户|用户|先生|女士/.test(text(row?.item?.displayName)));
    const sourceMembers = rowsUnique.filter(row => text(row?.item?.accountType) === '会员账户');
    if (phones.length > 1 && hasGeneric) {
      skipped.push({ kind, key, reason: '普通称呼且存在多个手机号，跳过', names: rowsUnique.map(row => text(row.item.displayName)) });
      return;
    }
    if (phones.length > 1) {
      skipped.push({ kind, key, reason: '存在多个手机号，跳过', names: rowsUnique.map(row => text(row.item.displayName)) });
      return;
    }
    if (sourceMembers.length > 1) {
      skipped.push({ kind, key, reason: '组内存在多个会员账户，跳过', names: rowsUnique.map(row => text(row.item.displayName)) });
      return;
    }
    const target = chooseTarget(rowsUnique, standardName);
    const sources = rowsUnique.filter(row => text(row.id) !== text(target?.id));
    if (sources.some(row => text(row?.item?.accountType) === '会员账户')) {
      skipped.push({ kind, key, reason: '会员账户不能作为来源隐藏，跳过', names: rowsUnique.map(row => text(row.item.displayName)) });
      return;
    }
    groups.push({ kind, key, standardName, target, sources });
    rowsUnique.forEach(row => usedIds.add(text(row.id)));
  }

  const byBase = new Map();
  for (const row of rows) {
    const base = stripBusinessWords(row?.item?.displayName);
    if (isUnsafeBase(base)) continue;
    if (!hasBusinessSuffix(row?.item?.displayName)) continue;
    if (!byBase.has(base)) byBase.set(base, []);
    byBase.get(base).push(row);
  }
  for (const [base, suffixRows] of byBase.entries()) {
    const related = rows.filter(row => stripBusinessWords(row?.item?.displayName) === base);
    const names = new Set(related.map(row => normalizeName(row?.item?.displayName)));
    if (related.length > 1 && names.size > 1) addGroup('similar-name', base, related, related.find(row => normalizeName(row?.item?.displayName) === base)?.item?.displayName || base);
  }

  const byExact = new Map();
  for (const row of rows) {
    if (usedIds.has(text(row.id))) continue;
    const key = normalizeName(row?.item?.displayName);
    if (isUnsafeBase(stripBusinessWords(row?.item?.displayName))) continue;
    if (!byExact.has(key)) byExact.set(key, []);
    byExact.get(key).push(row);
  }
  for (const [key, exactRows] of byExact.entries()) {
    if (exactRows.length < 2) continue;
    const phones = [...new Set(exactRows.map(row => phone(row?.item?.phone)).filter(Boolean))];
    if (phones.length > 1) {
      skipped.push({ kind: 'exact-name', key, reason: '完全同名但多个手机号，跳过', names: exactRows.map(row => text(row.item.displayName)) });
      continue;
    }
    addGroup('exact-name', key, exactRows, exactRows[0]?.item?.displayName || key);
  }
  return { groups, skipped };
}

async function readCourts(client, ids) {
  const uniqueIds = [...new Set(ids.map(String).filter(Boolean))];
  const rows = [];
  for (let i = 0; i < uniqueIds.length; i += 100) {
    const batch = uniqueIds.slice(i, i + 100);
    const batchRows = await batchGetRows(client, TABLES.courts, batch);
    rows.push(...batchRows);
  }
  const found = new Set(rows.map(row => text(row.id)));
  const missing = uniqueIds.filter(id => !found.has(text(id)));
  if (missing.length) throw new Error(`订场用户不存在：${missing.join(',')}`);
  return rows;
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

function traceRow(row, trace, now) {
  return { ...row, operationId: trace.operationId, batchId: trace.batchId, updatedAt: now };
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

async function readSnapshot(client) {
  const rows = [];
  const meta = await getRow(client, TABLES.snapshot, 'active:meta').catch(() => null);
  const delta = await getRow(client, TABLES.snapshot, 'active:delta').catch(() => null);
  if (meta) rows.push(meta);
  if (delta) rows.push(delta);
  return rows;
}

function parsePayload(row) {
  try { return JSON.parse(text(row?.payload) || '{}'); } catch { return {}; }
}

function updateSnapshotDelta(deltaRow, deletedIds, upsertRows, trace, now) {
  if (!deltaRow) return null;
  const payload = typeof deltaRow.payload === 'object' && deltaRow.payload
    ? deltaRow.payload
    : parsePayload(deltaRow);
  const deleted = new Set([
    ...(Array.isArray(deltaRow.deletes) ? deltaRow.deletes : []).map(String),
    ...(payload.deletedIds || []).map(String),
    ...deletedIds.map(String)
  ]);
  const existingUpserts = [
    ...(Array.isArray(deltaRow.upserts) ? deltaRow.upserts : []),
    ...(payload.upserts || payload.rows || [])
  ];
  const upserts = new Map(existingUpserts.map(row => [text(row?.id), row]).filter(([id]) => id));
  upsertRows.forEach(row => upserts.set(text(row.id), row));
  deletedIds.forEach(id => upserts.delete(String(id)));
  return traceRow({
    ...deltaRow,
    count: upserts.size + deleted.size,
    upserts: [...upserts.values()],
    deletes: [...deleted],
    payload: { ...payload, upserts: [...upserts.values()], deletedIds: [...deleted] }
  }, trace, now);
}

function summarizeIndex(row) {
  const item = row?.item || {};
  return {
    id: text(row?.id || item.id),
    name: text(item.displayName),
    phone: text(item.phone),
    accountType: text(item.accountType),
    bookingCount: Number(item.bookingCount) || 0,
    totalSpent: money(item.totalSpent),
    totalReceived: money(item.totalReceived),
    balance: money(item.balance)
  };
}

async function buildPlan(client, now, trace) {
  const localCsv = buildLocalCandidateNameKeys();
  const localCandidateKeys = new Set(localCsv.candidateKeys);
  const snapshot = await readSnapshotIndexRows(client);
  const snapshotCandidateRows = snapshot.rows.filter(row => localCandidateKeys.has(normalizeName(row?.item?.displayName)));
  const activeCandidateRows = await readExistingRows(client, TABLES.index, snapshotCandidateRows.map(row => row.id || row.courtId));
  const indexRows = activeCandidateRows.filter(row => localCandidateKeys.has(normalizeName(row?.item?.displayName)));
  const { groups, skipped } = buildCandidateGroups(indexRows);
  const ids = [...new Set(groups.flatMap(group => [text(group.target.id), ...group.sources.map(row => text(row.id))]))];
  const courtRows = await readCourts(client, ids);
  const courtById = new Map(courtRows.map(row => [text(row.id), row]));
  const indexById = new Map(activeCandidateRows.map(row => [text(row.id), row]));
  const courtUpdates = new Map();
  const indexUpserts = new Map();
  const indexDeletes = new Set();
  const items = [];
  for (const group of groups) {
    let targetCourt = normalizeHistoryForMerge({ ...courtById.get(text(group.target.id)), name: group.standardName });
    for (const sourceIndex of group.sources) {
      const sourceCourt = normalizeHistoryForMerge(courtById.get(text(sourceIndex.id)));
      const merged = courtRules.mergeCourtRecords({
        targetCourt,
        sourceCourt,
        membershipAccounts: [],
        membershipOrders: [],
        membershipBenefitLedger: [],
        membershipAccountEvents: [],
        now
      });
      targetCourt = { ...merged.targetCourt, name: group.standardName };
      courtUpdates.set(text(merged.sourceCourt.id), traceRow(merged.sourceCourt, trace, now));
      indexDeletes.add(text(merged.sourceCourt.id));
    }
    courtUpdates.set(text(targetCourt.id), traceRow(targetCourt, trace, now));
    indexUpserts.set(text(targetCourt.id), buildIndexRow(targetCourt, indexById.get(text(targetCourt.id)), now));
    items.push({
      kind: group.kind,
      key: group.key,
      standardName: group.standardName,
      target: summarizeIndex(group.target),
      sourceCount: group.sources.length,
      sources: group.sources.map(summarizeIndex)
    });
  }
  const snapshotRows = [snapshot.meta, snapshot.delta, snapshot.bundle].filter(Boolean);
  const deltaAfter = updateSnapshotDelta(snapshot.delta, [...indexDeletes], [...indexUpserts.values()], trace, now);
  return {
    indexRows,
    beforeVisibleRows: snapshot.rows.length,
    groups,
    skipped,
    localCsv,
    affectedIds: ids,
    backupBefore: {
      courts: courtRows,
      indexRows: ids.map(id => indexById.get(id)).filter(Boolean),
      snapshotRows
    },
    plannedWrites: {
      courts: [...courtUpdates.values()],
      indexUpserts: [...indexUpserts.values()],
      indexDeletes: [...indexDeletes],
      snapshotUpdates: deltaAfter ? [deltaAfter] : []
    },
    items
  };
}

function writeReport(report, reportPath) {
  fs.mkdirSync(path.dirname(reportPath), { recursive: true });
  fs.writeFileSync(reportPath, `${JSON.stringify(report, null, 2)}\n`, 'utf8');
}

async function run(argv = process.argv.slice(2)) {
  loadEnv();
  const args = parseWriteFlags(argv);
  const now = new Date().toISOString();
  const trace = operationTrace(now);
  const reportPath = path.join(REPORT_DIR, `${trace.operationId}-${args.dryRun ? 'dry-run' : 'write'}.json`);
  const target = await assertProductionWriteTarget();
  assertProductionWriteTrace({ operationId: trace.operationId, batchId: trace.batchId, reportPath });
  const client = createClientFromEnv();
  const plan = await buildPlan(client, now, trace);
  const report = {
    generatedAt: now,
    mode: args.dryRun ? 'dry-run' : 'write',
    operationId: trace.operationId,
    batchId: trace.batchId,
    target,
    reportPath,
    summary: {
      groups: plan.groups.length,
      affectedCourts: plan.affectedIds.length,
      courtWrites: plan.plannedWrites.courts.length,
      indexUpserts: plan.plannedWrites.indexUpserts.length,
      indexDeletes: plan.plannedWrites.indexDeletes.length,
      snapshotWrites: plan.plannedWrites.snapshotUpdates.length,
      beforeVisibleRows: plan.beforeVisibleRows,
      candidateVisibleRows: plan.indexRows.length,
      afterVisibleRowsExpected: plan.beforeVisibleRows - plan.plannedWrites.indexDeletes.length,
      skippedGroups: plan.skipped.length
    },
    localCsv: plan.localCsv,
    items: plan.items,
    skipped: plan.skipped,
    backupBefore: plan.backupBefore,
    plannedWrites: plan.plannedWrites
  };
  writeReport(report, reportPath);
  if (!args.dryRun) {
    for (const row of plan.plannedWrites.courts) await putRow(client, TABLES.courts, row);
    for (const row of plan.plannedWrites.indexUpserts) await putRow(client, TABLES.index, row);
    for (const id of plan.plannedWrites.indexDeletes) await deleteRow(client, TABLES.index, id);
    for (const row of plan.plannedWrites.snapshotUpdates) await putRow(client, TABLES.snapshot, row);
  }
  console.log(JSON.stringify({
    mode: report.mode,
    reportPath,
    summary: report.summary,
    items: report.items.map(item => ({
      kind: item.kind,
      standardName: item.standardName,
      target: item.target.name,
      sourceCount: item.sourceCount
    })),
    skipped: report.skipped.slice(0, 20)
  }, null, 2));
}

if (require.main === module) {
  run().catch(err => {
    console.error(err);
    process.exit(1);
  });
}

module.exports = { buildCandidateGroups, buildPlan };
