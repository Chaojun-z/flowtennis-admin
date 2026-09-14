#!/usr/bin/env node

const fs = require('fs');
const path = require('path');
const dotenv = require('dotenv');
const { createCourtFinanceRules } = require('../server/court-finance');
const { buildCourtAccountListIndexRowsFromData } = require('../server/page-data/court-account-list-index');
const { createClientFromEnv, scanTable, getRow, putRow, deleteRow } = require('./lib/staging-data-store');
const { parseWriteFlags, assertProductionWriteTarget, assertProductionWriteTrace } = require('./lib/production-write-guard');

const ROOT = path.join(__dirname, '..');
const REPORT_DIR = path.join(ROOT, 'offline-reports', 'court-user-name-cleanup-20260914');
const TABLES = {
  courts: 'ft_courts',
  index: 'ft_court_account_list_index',
  snapshot: 'ft_court_account_list_snapshot'
};
const courtRules = createCourtFinanceRules();

const GROUP_RULES = [
  {
    key: 'zhen-chaojun',
    targetName: '甄朝珺',
    standardName: '甄朝珺',
    names: new Set(['甄朝珺', '朝珺', '朝珺 私教课', '朝珺 私教体验课'])
  },
  {
    key: 'lan-xingcan',
    targetName: '蓝星灿',
    standardName: '蓝星灿',
    names: new Set(['蓝星灿', '蓝星灿 订场'])
  }
];

function loadEnv() {
  dotenv.config({ path: path.join(ROOT, '.env.local'), override: true });
  dotenv.config({ path: path.join(ROOT, '.env'), override: false });
}

function operationTrace(now = new Date().toISOString()) {
  const stamp = now.replace(/[^0-9]/g, '').slice(0, 14) || String(Date.now());
  const operationId = `court-user-name-cleanup-20260914-${stamp}`;
  return { operationId, batchId: `batch-${operationId}` };
}

function text(value) {
  return String(value || '').trim();
}

function money(value) {
  return Math.round((Number(value) || 0) * 100) / 100;
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

function decodeSnapshotPayload(row) {
  const raw = text(row?.payload);
  if (!raw) return null;
  try {
    return JSON.parse(raw);
  } catch {
    return null;
  }
}

function encodeSnapshotPayload(payload) {
  return JSON.stringify(payload || {});
}

function sameJson(a, b) {
  return JSON.stringify(a || null) === JSON.stringify(b || null);
}

function summarizeIndexRow(row) {
  const item = row?.item || {};
  return {
    id: text(row?.id || item.id),
    name: text(item.displayName),
    phone: text(item.phone),
    accountType: text(item.accountType),
    balance: money(item.balance),
    bookingCount: Number(item.bookingCount) || 0,
    totalSpent: money(item.totalSpent),
    lastBookingDate: text(item.lastBookingDate)
  };
}

function pickTarget(rows, rule) {
  const exact = rows.find(row => text(row?.item?.displayName) === rule.targetName);
  if (exact) return exact;
  return rows.slice().sort((a, b) => {
    const memberDelta = Number(text(b?.item?.accountType) === '会员账户') - Number(text(a?.item?.accountType) === '会员账户');
    if (memberDelta) return memberDelta;
    const bookingDelta = (Number(b?.item?.bookingCount) || 0) - (Number(a?.item?.bookingCount) || 0);
    if (bookingDelta) return bookingDelta;
    return text(b?.item?.lastBookingDate).localeCompare(text(a?.item?.lastBookingDate));
  })[0] || null;
}

function buildGroups(indexRows) {
  const groups = [];
  for (const rule of GROUP_RULES) {
    const rows = indexRows.filter(row => rule.names.has(text(row?.item?.displayName)));
    if (rows.length < 2) continue;
    const target = pickTarget(rows, rule);
    const sources = rows.filter(row => text(row?.id) !== text(target?.id));
    groups.push({ rule, target, sources });
  }
  return groups;
}

function assertSafeGroup(group) {
  const unsafeSources = group.sources.filter(row => text(row?.item?.accountType) === '会员账户');
  if (unsafeSources.length) {
    throw new Error(`${group.rule.key} 存在会员账户来源，需单独人工处理：${unsafeSources.map(row => text(row.id)).join(',')}`);
  }
  if (!group.target?.id || !group.sources.length) throw new Error(`${group.rule.key} 缺少目标或来源`);
}

async function readCourts(client, ids) {
  const rows = [];
  for (const id of ids) {
    const row = await getRow(client, TABLES.courts, id);
    if (!row) throw new Error(`订场用户不存在：${id}`);
    rows.push(row);
  }
  return rows;
}

function traceRow(row, trace, now) {
  return {
    ...row,
    operationId: trace.operationId,
    batchId: trace.batchId,
    updatedAt: now
  };
}

function buildIndexRow(targetCourt, previousIndexRow, now) {
  const membershipAccount = previousIndexRow?.item?.membershipAccount;
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
  const oldItem = previousIndexRow?.item || {};
  row.item = {
    ...oldItem,
    ...row.item,
    displayName: targetCourt.name || row.item.displayName,
    phone: targetCourt.phone || row.item.phone,
    accountType: oldItem.accountType || row.item.accountType,
    membershipTierLabel: oldItem.membershipTierLabel || row.item.membershipTierLabel,
    membershipStatus: oldItem.membershipStatus || row.item.membershipStatus,
    membershipStatusCode: oldItem.membershipStatusCode || row.item.membershipStatusCode,
    membershipDiscountText: oldItem.membershipDiscountText || row.item.membershipDiscountText,
    membershipValidUntil: oldItem.membershipValidUntil || row.item.membershipValidUntil,
    membershipAccount: oldItem.membershipAccount || row.item.membershipAccount,
    firstOpenDate: oldItem.firstOpenDate || row.item.firstOpenDate
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

function updateSnapshotDelta(deltaRow, deletedIds, upsertRows, trace, now) {
  if (!deltaRow) return null;
  const payload = decodeSnapshotPayload(deltaRow) || {};
  const deleted = new Set([...(payload.deletedIds || []).map(String), ...deletedIds.map(String)]);
  const upserts = new Map((payload.upserts || payload.rows || []).map(row => [text(row?.id), row]).filter(([id]) => id));
  upsertRows.forEach(row => upserts.set(text(row.id), row));
  deletedIds.forEach(id => upserts.delete(String(id)));
  return traceRow({
    ...deltaRow,
    count: upserts.size + deleted.size,
    payload: encodeSnapshotPayload({
      ...payload,
      upserts: [...upserts.values()],
      deletedIds: [...deleted]
    })
  }, trace, now);
}

async function buildPlan({ client, now, trace }) {
  const indexRows = await scanTable(client, TABLES.index);
  const groups = buildGroups(indexRows);
  groups.forEach(assertSafeGroup);
  const affectedIds = [...new Set(groups.flatMap(group => [text(group.target.id), ...group.sources.map(row => text(row.id))]))];
  const courtRows = await readCourts(client, affectedIds);
  const courtById = new Map(courtRows.map(row => [text(row.id), row]));
  const indexById = new Map(indexRows.map(row => [text(row.id), row]));
  const courtUpdates = new Map();
  const targetIndexUpdates = new Map();
  const sourceIndexDeletes = new Set();
  const items = [];

  for (const group of groups) {
    let targetCourt = normalizeHistoryForMerge({
      ...courtById.get(text(group.target.id)),
      name: group.rule.standardName
    });
    const sourceCourts = group.sources.map(row => normalizeHistoryForMerge(courtById.get(text(row.id))));
    for (const sourceCourt of sourceCourts) {
      const merged = courtRules.mergeCourtRecords({
        targetCourt,
        sourceCourt,
        membershipAccounts: [],
        membershipOrders: [],
        membershipBenefitLedger: [],
        membershipAccountEvents: [],
        now
      });
      targetCourt = {
        ...merged.targetCourt,
        name: group.rule.standardName
      };
      courtUpdates.set(text(merged.sourceCourt.id), traceRow(merged.sourceCourt, trace, now));
      sourceIndexDeletes.add(text(merged.sourceCourt.id));
    }
    courtUpdates.set(text(targetCourt.id), traceRow(targetCourt, trace, now));
    targetIndexUpdates.set(text(targetCourt.id), buildIndexRow(targetCourt, indexById.get(text(targetCourt.id)), now));
    items.push({
      key: group.rule.key,
      standardName: group.rule.standardName,
      targetBefore: summarizeIndexRow(group.target),
      sourceCount: group.sources.length,
      sources: group.sources.map(summarizeIndexRow)
    });
  }

  const snapshotBefore = await readSnapshot(client);
  const deltaBefore = snapshotBefore.find(row => text(row.id) === 'active:delta');
  const deltaAfter = updateSnapshotDelta(deltaBefore, [...sourceIndexDeletes], [...targetIndexUpdates.values()], trace, now);
  const snapshotUpdates = deltaAfter && !sameJson(deltaBefore, deltaAfter) ? [deltaAfter] : [];

  return {
    indexRows,
    affectedIds,
    courtRows,
    groups,
    items,
    plannedWrites: {
      courts: [...courtUpdates.values()],
      indexUpserts: [...targetIndexUpdates.values()],
      indexDeletes: [...sourceIndexDeletes],
      snapshotUpdates
    },
    backupBefore: {
      courts: courtRows,
      indexRows: affectedIds.map(id => indexById.get(id)).filter(Boolean),
      snapshotRows: snapshotBefore
    }
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
  const plan = await buildPlan({ client, now, trace });
  const report = {
    generatedAt: new Date().toISOString(),
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
      beforeVisibleRows: plan.indexRows.length,
      afterVisibleRowsExpected: plan.indexRows.length - plan.plannedWrites.indexDeletes.length
    },
    items: plan.items,
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
      key: item.key,
      standardName: item.standardName,
      target: item.targetBefore,
      sourceCount: item.sourceCount
    }))
  }, null, 2));
}

if (require.main === module) {
  run().catch((err) => {
    console.error(err);
    process.exit(1);
  });
}

module.exports = { buildGroups, buildPlan, GROUP_RULES };
