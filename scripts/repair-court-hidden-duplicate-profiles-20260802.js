#!/usr/bin/env node

const fs = require('fs');
const path = require('path');
const dotenv = require('dotenv');
const { _test: rules } = require('../api/index.js');
const { normalizeCampusValue } = require('../public/assets/scripts/core/campus.js');
const { createClientFromEnv, scanTable, putRow } = require('./lib/staging-data-store');
const { parseWriteFlags, assertProductionWriteTarget, assertProductionWriteTrace } = require('./lib/production-write-guard');

const ROOT = path.join(__dirname, '..');
const REPORT_DIR = path.join(ROOT, 'offline-reports', 'court-hidden-duplicate-repair');
const TABLES = {
  courts: 'ft_courts',
  membershipAccounts: 'ft_membership_accounts',
  membershipOrders: 'ft_membership_orders',
  membershipBenefitLedger: 'ft_membership_benefit_ledger',
  membershipAccountEvents: 'ft_membership_account_events'
};
const AMBIGUOUS_BASE_NAMES = new Set(['王', '李', '张', '赵', '刘', '陈', '杨', '黄', '吴', '周', '徐', '孙', '马', '付', '齐', '安', '唐', '曹', '先生', '女士', '定场', '订场', '散客']);

function loadEnv() {
  dotenv.config({ path: path.join(ROOT, '.env'), override: true });
}

function operationTrace(now = new Date().toISOString()) {
  const stamp = String(now).replace(/[^0-9]/g, '').slice(0, 14) || String(Date.now());
  const operationId = `court-hidden-duplicate-repair-20260802-${stamp}`;
  return { operationId, batchId: `batch-${operationId}` };
}

function parseArr(value) {
  if (Array.isArray(value)) return value;
  if (typeof value === 'string' && value.trim()) {
    try {
      const parsed = JSON.parse(value);
      return Array.isArray(parsed) ? parsed : [];
    } catch {
      return value.split(',').map(item => item.trim()).filter(Boolean);
    }
  }
  return [];
}

function normalizePhone(value) {
  return String(value || '').replace(/\D/g, '');
}

function normalizeName(value) {
  return String(value || '')
    .toLowerCase()
    .replace(/[（(]\s*\d+(?:\.\d+)?\s*[)）]/g, '')
    .replace(/\s+/g, '')
    .replace(/[·.。_\-]/g, '')
    .trim();
}

function baseName(value) {
  return normalizeName(String(value || '').replace(/(订场|定场)+$/g, ''));
}

function isActiveCourt(row) {
  const status = String(row?.status || 'active').trim();
  return status !== 'inactive' && status !== 'deleted' && !row?.deletedAt && !row?.mergedIntoCourtId;
}

function historyRows(row) {
  return rules.buildLegacyCourtOpeningHistory(row);
}

function historyKey(row) {
  return String(row?.id || '').trim() || [
    String(row?.date || row?.occurredDate || '').slice(0, 10),
    String(row?.type || ''),
    String(row?.category || ''),
    String(row?.payMethod || ''),
    String(row?.amount || '')
  ].join('|');
}

function missingHistoryRows(target, source) {
  const targetKeys = new Set(historyRows(target).map(historyKey).filter(Boolean));
  return historyRows(source).filter(row => {
    const key = historyKey(row);
    return key && !targetKeys.has(key);
  });
}

function hasRefs(courtId, refs) {
  const id = String(courtId || '');
  return [
    refs.membershipAccounts,
    refs.membershipOrders,
    refs.membershipBenefitLedger,
    refs.membershipAccountEvents
  ].some(rows => (rows || []).some(row => String(row?.courtId || '') === id));
}

function activeMembershipAccountCount(courtId, refs) {
  const id = String(courtId || '');
  return (refs.membershipAccounts || []).filter(row => String(row?.courtId || '') === id && String(row?.status || '') !== 'voided').length;
}

function groupKey(row) {
  const phone = normalizePhone(row?.phone);
  if (phone) return `phone:${phone}`;
  const base = baseName(row?.name);
  const campus = normalizeCampusValue(row?.campus || '');
  if (!base || !campus) return '';
  return `name:${base}|campus:${campus}`;
}

function chooseTarget(rows) {
  return rows.slice().sort((a, b) => {
    const activeDelta = Number(isActiveCourt(b)) - Number(isActiveCourt(a));
    if (activeDelta) return activeDelta;
    const phoneDelta = Number(!!normalizePhone(b.phone)) - Number(!!normalizePhone(a.phone));
    if (phoneDelta) return phoneDelta;
    const historyDelta = historyRows(b).length - historyRows(a).length;
    if (historyDelta) return historyDelta;
    return String(a.createdAt || '').localeCompare(String(b.createdAt || ''));
  })[0] || null;
}

function summarize(row, refs = {}) {
  return {
    id: row.id,
    name: row.name || '',
    phone: row.phone || '',
    campus: normalizeCampusValue(row.campus || ''),
    active: isActiveCourt(row),
    historyCount: historyRows(row).length,
    hasRefs: hasRefs(row.id, refs),
    activeMembershipAccounts: activeMembershipAccountCount(row.id, refs),
    mergedIntoCourtId: row.mergedIntoCourtId || '',
    deletedAt: row.deletedAt || ''
  };
}

function buildRepairPlan(data) {
  const refs = {
    membershipAccounts: data.membershipAccounts || [],
    membershipOrders: data.membershipOrders || [],
    membershipBenefitLedger: data.membershipBenefitLedger || [],
    membershipAccountEvents: data.membershipAccountEvents || []
  };
  const groups = new Map();
  for (const row of data.courts || []) {
    const key = groupKey(row);
    if (!key) continue;
    const nameBase = baseName(row.name);
    if (!normalizePhone(row.phone) && (nameBase.length < 2 || AMBIGUOUS_BASE_NAMES.has(nameBase))) continue;
    if (!groups.has(key)) groups.set(key, []);
    groups.get(key).push(row);
  }

  const plans = [];
  const skipped = [];
  for (const [key, rows] of groups) {
    if (rows.length < 2) continue;
    const activeRows = rows.filter(isActiveCourt);
    const hiddenRows = rows.filter(row => !isActiveCourt(row));
    if (activeRows.length !== 1 || !hiddenRows.length) {
      skipped.push({ key, reason: '不是“一个显示中主档案 + 隐藏档案”的安全形态', rows: rows.map(row => summarize(row, refs)) });
      continue;
    }
    const target = chooseTarget(activeRows);
    if (hiddenRows.some(row => hasRefs(row.id, refs))) {
      skipped.push({ key, reason: '隐藏档案仍有关联引用，需人工确认后合并', rows: rows.map(row => summarize(row, refs)) });
      continue;
    }
    const sources = hiddenRows.filter(row => {
      if (String(row.id) === String(target.id)) return false;
      if (String(row.mergedIntoCourtId || '') !== String(target.id)) return true;
      return missingHistoryRows(target, row).length > 0;
    });
    if (!sources.length) {
      skipped.push({ key, reason: '隐藏档案已合并且没有缺失历史，无需重复处理', rows: rows.map(row => summarize(row, refs)) });
      continue;
    }
    const bothHaveActiveMembership = activeMembershipAccountCount(target.id, refs) > 0 && sources.some(row => activeMembershipAccountCount(row.id, refs) > 0);
    if (bothHaveActiveMembership) {
      skipped.push({ key, reason: '主档案和隐藏档案都有有效会员账户，需人工处理', rows: rows.map(row => summarize(row, refs)) });
      continue;
    }
    plans.push({ key, target, sources });
  }
  return { plans, skipped };
}

function traceRow(row, trace, now) {
  return {
    ...row,
    operationId: trace.operationId,
    batchId: trace.batchId,
    updatedAt: now
  };
}

function traceCourt(row, trace, now) {
  return traceRow({
    ...row,
    history: historyRows(row).map(item => traceRow(item, trace, now))
  }, trace, now);
}

function applyPlans(plans, data, now) {
  let membershipAccounts = data.membershipAccounts || [];
  let membershipOrders = data.membershipOrders || [];
  let membershipBenefitLedger = data.membershipBenefitLedger || [];
  let membershipAccountEvents = data.membershipAccountEvents || [];
  const applied = [];
  const failed = [];
  for (const plan of plans) {
    let targetCourt = plan.target;
    const courtUpdates = [];
    try {
      for (const sourceCourt of plan.sources) {
        const sourceForMerge = { ...sourceCourt, history: missingHistoryRows(targetCourt, sourceCourt) };
        const merged = rules.mergeCourtRecords({
          targetCourt,
          sourceCourt: sourceForMerge,
          membershipAccounts,
          membershipOrders,
          membershipBenefitLedger,
          membershipAccountEvents,
          now
        });
        targetCourt = merged.targetCourt;
        membershipAccounts = merged.membershipAccounts;
        membershipOrders = merged.membershipOrders;
        membershipBenefitLedger = merged.membershipBenefitLedger;
        membershipAccountEvents = merged.membershipAccountEvents;
        courtUpdates.push(merged.sourceCourt);
      }
      courtUpdates.unshift(targetCourt);
      applied.push({ ...plan, result: { courtUpdates, membershipAccounts, membershipOrders, membershipBenefitLedger, membershipAccountEvents } });
    } catch (err) {
      failed.push({ key: plan.key, reason: err.message || String(err), target: summarize(plan.target, data), sources: plan.sources.map(row => summarize(row, data)) });
    }
  }
  return { applied, failed };
}

function changedRefs(originalRows, nextRows) {
  const originalById = new Map((originalRows || []).map(row => [String(row.id), JSON.stringify(row)]));
  return (nextRows || []).filter(row => originalById.get(String(row.id)) !== JSON.stringify(row));
}

function writeReport(report, reportPath) {
  fs.mkdirSync(path.dirname(reportPath), { recursive: true });
  fs.writeFileSync(reportPath, `${JSON.stringify(report, null, 2)}\n`, 'utf8');
}

function isTransientError(err) {
  return /Client network socket disconnected|ECONNRESET|ETIMEDOUT|socket hang up|EAI_AGAIN/i.test(String(err?.message || err || ''));
}

async function writeWithRetry(put, client, tableName, row, attempts = 3) {
  let lastErr;
  for (let attempt = 1; attempt <= attempts; attempt += 1) {
    try {
      await put(client, tableName, row);
      return;
    } catch (err) {
      lastErr = err;
      if (!isTransientError(err) || attempt === attempts) throw err;
      await new Promise(resolve => setTimeout(resolve, attempt * 300));
    }
  }
  throw lastErr;
}

async function run(argv = process.argv.slice(2), deps = {}) {
  const args = parseWriteFlags(argv);
  const now = deps.now || new Date().toISOString();
  const trace = deps.trace || operationTrace(now);
  const reportPath = deps.reportPath || path.join(REPORT_DIR, `${trace.operationId}-${args.dryRun ? 'dry-run' : 'write'}.json`);
  const loadEnvironment = deps.loadEnv || loadEnv;
  const assertTarget = deps.assertProductionTarget || (() => assertProductionWriteTarget());
  const createClient = deps.createClientFromEnv || createClientFromEnv;
  const scan = deps.scanTable || scanTable;
  const put = deps.putRow || putRow;

  loadEnvironment();
  const target = await assertTarget();
  const client = createClient();
  const data = {
    courts: await scan(client, TABLES.courts),
    membershipAccounts: await scan(client, TABLES.membershipAccounts).catch(() => []),
    membershipOrders: await scan(client, TABLES.membershipOrders).catch(() => []),
    membershipBenefitLedger: await scan(client, TABLES.membershipBenefitLedger).catch(() => []),
    membershipAccountEvents: await scan(client, TABLES.membershipAccountEvents).catch(() => [])
  };
  const { plans, skipped } = buildRepairPlan(data);
  const { applied, failed } = applyPlans(plans, data, now);
  const courtUpdates = new Map();
  applied.forEach(item => item.result.courtUpdates.forEach(row => courtUpdates.set(String(row.id), traceCourt(row, trace, now))));
  const affectedCourtIds = new Set();
  applied.forEach(item => {
    affectedCourtIds.add(String(item.target.id));
    item.sources.forEach(row => affectedCourtIds.add(String(row.id)));
  });
  const membershipAccountUpdates = changedRefs(data.membershipAccounts, applied.at(-1)?.result.membershipAccounts || data.membershipAccounts).map(row => traceRow(row, trace, now));
  const membershipOrderUpdates = changedRefs(data.membershipOrders, applied.at(-1)?.result.membershipOrders || data.membershipOrders).map(row => traceRow(row, trace, now));
  const membershipBenefitLedgerUpdates = changedRefs(data.membershipBenefitLedger, applied.at(-1)?.result.membershipBenefitLedger || data.membershipBenefitLedger).map(row => traceRow(row, trace, now));
  const membershipAccountEventUpdates = changedRefs(data.membershipAccountEvents, applied.at(-1)?.result.membershipAccountEvents || data.membershipAccountEvents).map(row => traceRow(row, trace, now));

  const report = {
    generatedAt: new Date().toISOString(),
    mode: args.dryRun ? 'dry-run' : 'write',
    operationId: trace.operationId,
    batchId: trace.batchId,
    target,
    reportPath,
    scanned: {
      courts: data.courts.length,
      membershipAccounts: data.membershipAccounts.length,
      membershipOrders: data.membershipOrders.length,
      membershipBenefitLedger: data.membershipBenefitLedger.length,
      membershipAccountEvents: data.membershipAccountEvents.length
    },
    summary: {
      safeGroups: applied.length,
      sourceCourtsToArchive: applied.reduce((sum, item) => sum + item.sources.length, 0),
      skippedGroups: skipped.length,
      failedGroups: failed.length,
      courtUpdates: courtUpdates.size,
      membershipAccountUpdates: membershipAccountUpdates.length,
      membershipOrderUpdates: membershipOrderUpdates.length,
      membershipBenefitLedgerUpdates: membershipBenefitLedgerUpdates.length,
      membershipAccountEventUpdates: membershipAccountEventUpdates.length
    },
    items: applied.map(item => ({
      key: item.key,
      target: summarize(item.target, data),
      sources: item.sources.map(row => summarize(row, data))
    })),
    backupBefore: {
      courts: data.courts.filter(row => affectedCourtIds.has(String(row.id))),
      membershipAccounts: data.membershipAccounts.filter(row => membershipAccountUpdates.some(next => String(next.id) === String(row.id))),
      membershipOrders: data.membershipOrders.filter(row => membershipOrderUpdates.some(next => String(next.id) === String(row.id))),
      membershipBenefitLedger: data.membershipBenefitLedger.filter(row => membershipBenefitLedgerUpdates.some(next => String(next.id) === String(row.id))),
      membershipAccountEvents: data.membershipAccountEvents.filter(row => membershipAccountEventUpdates.some(next => String(next.id) === String(row.id)))
    },
    plannedWrites: {
      courts: [...courtUpdates.values()],
      membershipAccounts: membershipAccountUpdates,
      membershipOrders: membershipOrderUpdates,
      membershipBenefitLedger: membershipBenefitLedgerUpdates,
      membershipAccountEvents: membershipAccountEventUpdates
    },
    skipped,
    failed
  };
  assertProductionWriteTrace({ operationId: trace.operationId, batchId: trace.batchId, reportPath });
  writeReport(report, reportPath);

  if (!args.dryRun) {
    for (const row of courtUpdates.values()) await writeWithRetry(put, client, TABLES.courts, row);
    for (const row of membershipAccountUpdates) await writeWithRetry(put, client, TABLES.membershipAccounts, row);
    for (const row of membershipOrderUpdates) await writeWithRetry(put, client, TABLES.membershipOrders, row);
    for (const row of membershipBenefitLedgerUpdates) await writeWithRetry(put, client, TABLES.membershipBenefitLedger, row);
    for (const row of membershipAccountEventUpdates) await writeWithRetry(put, client, TABLES.membershipAccountEvents, row);
  }

  console.log(JSON.stringify({
    ok: true,
    mode: report.mode,
    operationId: trace.operationId,
    batchId: trace.batchId,
    reportPath,
    target,
    summary: report.summary
  }, null, 2));
  return { report, reportPath };
}

if (require.main === module) {
  run().catch(err => {
    console.error(err && err.stack ? err.stack : String(err));
    process.exit(1);
  });
}

module.exports = {
  TABLES,
  operationTrace,
  baseName,
  isActiveCourt,
  buildRepairPlan,
  applyPlans,
  writeWithRetry,
  run
};
