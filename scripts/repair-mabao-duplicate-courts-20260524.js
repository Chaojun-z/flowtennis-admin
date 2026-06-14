#!/usr/bin/env node

const fs = require('fs');
const path = require('path');
const { _test: rules } = require('../api/index.js');
const {
  REPORT_DIR,
  loadEnv,
  assertProductionTarget,
  createClientFromEnv,
  scanTable,
  putRow,
  TABLES,
  normalizeName,
  normalizeCourtHistory,
  money
} = require('./lib/mabao-import-core');

const EXTRA_TABLES = {
  membershipAccounts: 'ft_membership_accounts',
  membershipOrders: 'ft_membership_orders',
  membershipBenefitLedger: 'ft_membership_benefit_ledger',
  membershipAccountEvents: 'ft_membership_account_events'
};
const IMPORT_TAG = 'mabao-finance-import-20260524';
const IMPORT_COURT_PREFIX = 'private_lesson_csv_import_20260524-court-';
const AMBIGUOUS_KEYS = new Set(['王', '李', '赵', '黄', '先生', '散客']);

function parseArgs(argv) {
  return {
    write: argv.includes('--write'),
    dryRun: argv.includes('--dry-run') || !argv.includes('--write')
  };
}

function makeOperationTrace(now = new Date().toISOString()) {
  const stamp = String(now).replace(/[^0-9]/g, '').slice(0, 17) || String(Date.now());
  const operationId = `mabao-duplicate-courts-repair-20260524-${stamp}`;
  return { operationId, batchId: `batch-${operationId}` };
}

function traceRow(row, trace, now = new Date().toISOString()) {
  if (!row) return row;
  return {
    ...row,
    operationId: trace.operationId,
    batchId: trace.batchId,
    updatedAt: row.updatedAt || now
  };
}

function traceCourtRow(row, trace, now = new Date().toISOString()) {
  const traced = traceRow(row, trace, now);
  return {
    ...traced,
    history: Array.isArray(row.history)
      ? row.history.map((item) => traceRow(item, trace, now))
      : row.history
  };
}

function writeReport(report, reportPath) {
  fs.mkdirSync(path.dirname(reportPath), { recursive: true });
  fs.writeFileSync(reportPath, `${JSON.stringify(report, null, 2)}\n`, 'utf8');
}

function baseName(name) {
  return normalizeName(String(name || '').replace(/定场|订场|\s+/g, ''));
}

function isActiveCourt(court) {
  return String(court?.status || 'active') !== 'inactive' && !court?.mergedIntoCourtId && !court?.deletedAt;
}

function hasImportHistory(court) {
  return normalizeCourtHistory(court?.history).some((row) => String(row.seedTag || '') === IMPORT_TAG);
}

function isImportCourt(court) {
  return String(court?.id || '').startsWith(IMPORT_COURT_PREFIX) || hasImportHistory(court);
}

function chooseTarget(rows, membershipCourtIds) {
  const nonImportRows = rows.filter((row) => !String(row.id || '').startsWith(IMPORT_COURT_PREFIX));
  const candidates = nonImportRows.length ? nonImportRows : rows;
  return candidates.slice().sort((a, b) => {
    const memberDelta = Number(membershipCourtIds.has(String(b.id))) - Number(membershipCourtIds.has(String(a.id)));
    if (memberDelta) return memberDelta;
    const historyDelta = normalizeCourtHistory(b.history).length - normalizeCourtHistory(a.history).length;
    if (historyDelta) return historyDelta;
    return money(b.receivedAmount) - money(a.receivedAmount);
  })[0] || null;
}

function buildDuplicatePlan(data) {
  const membershipCourtIds = new Set((data.membershipOrders || []).map((row) => String(row.courtId || '')).filter(Boolean));
  const groups = new Map();
  for (const court of data.courts || []) {
    if (!isActiveCourt(court)) continue;
    const key = baseName(court.name);
    if (!key || AMBIGUOUS_KEYS.has(key)) continue;
    if (!groups.has(key)) groups.set(key, []);
    groups.get(key).push(court);
  }

  const plans = [];
  for (const [key, rows] of groups) {
    if (rows.length < 2 || !rows.some(isImportCourt)) continue;
    const target = chooseTarget(rows, membershipCourtIds);
    if (!target) continue;
    const sources = rows.filter((row) => String(row.id) !== String(target.id) && isImportCourt(row));
    if (!sources.length) continue;
    plans.push({ key, target, sources });
  }
  return plans;
}

function summarizeCourt(court, membershipCourtIds = new Set()) {
  const history = normalizeCourtHistory(court.history);
  return {
    id: court.id,
    name: court.name,
    isMember: membershipCourtIds.has(String(court.id)),
    history: history.length,
    importHistory: history.filter((row) => String(row.seedTag || '') === IMPORT_TAG).length,
    balance: money(court.balance),
    spent: money(court.spentAmount),
    received: money(court.receivedAmount)
  };
}

function applyPlan(plan, refs, now, mergeCourtRecords = rules.mergeCourtRecords) {
  let targetCourt = plan.target;
  const courtUpdates = [];
  let membershipAccounts = refs.membershipAccounts;
  let membershipOrders = refs.membershipOrders;
  let membershipBenefitLedger = refs.membershipBenefitLedger;
  let membershipAccountEvents = refs.membershipAccountEvents;

  for (const sourceCourt of plan.sources) {
    const merged = mergeCourtRecords({
      targetCourt,
      sourceCourt,
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
  return {
    targetCourt,
    courtUpdates,
    membershipAccounts,
    membershipOrders,
    membershipBenefitLedger,
    membershipAccountEvents
  };
}

async function run(argv = process.argv.slice(2), deps = {}) {
  const args = parseArgs(argv);
  const now = deps.now || new Date().toISOString();
  const trace = deps.trace || makeOperationTrace(now);
  const reportDir = deps.reportDir || path.join(REPORT_DIR, 'duplicate-courts-repair-reports');
  const reportPath = deps.reportPath || path.join(reportDir, `${trace.operationId}.json`);
  const loadEnvironment = deps.loadEnv || loadEnv;
  const assertTarget = deps.assertProductionTarget || assertProductionTarget;
  const createClient = deps.createClientFromEnv || createClientFromEnv;
  const scan = deps.scanTable || scanTable;
  const writeRow = deps.writeRow || putRow;
  const mergeCourtRecords = deps.mergeCourtRecords || rules.mergeCourtRecords;

  loadEnvironment();
  const target = await assertTarget();
  const client = createClient();
  const [courts, membershipAccounts, membershipOrders, membershipBenefitLedger, membershipAccountEvents] = await Promise.all([
    scan(client, TABLES.courts),
    scan(client, EXTRA_TABLES.membershipAccounts).catch(() => []),
    scan(client, EXTRA_TABLES.membershipOrders).catch(() => []),
    scan(client, EXTRA_TABLES.membershipBenefitLedger).catch(() => []),
    scan(client, EXTRA_TABLES.membershipAccountEvents).catch(() => [])
  ]);
  const data = { courts, membershipAccounts, membershipOrders, membershipBenefitLedger, membershipAccountEvents };
  const plans = buildDuplicatePlan(data);
  const membershipCourtIds = new Set(membershipOrders.map((row) => String(row.courtId || '')).filter(Boolean));
  const applied = [];
  const skipped = [];
  for (const plan of plans) {
    try {
      const result = applyPlan(plan, data, now, mergeCourtRecords);
      applied.push({
        key: plan.key,
        before: {
          target: summarizeCourt(plan.target, membershipCourtIds),
          sources: plan.sources.map((row) => summarizeCourt(row, membershipCourtIds))
        },
        after: summarizeCourt(result.targetCourt, membershipCourtIds),
        result
      });
    } catch (err) {
      skipped.push({
        key: plan.key,
        reason: err.message || String(err),
        target: summarizeCourt(plan.target, membershipCourtIds),
        sources: plan.sources.map((row) => summarizeCourt(row, membershipCourtIds))
      });
    }
  }

  const courtUpdatesById = new Map();
  for (const item of applied) {
    for (const row of item.result.courtUpdates) courtUpdatesById.set(String(row.id), traceCourtRow(row, trace, now));
  }
  const report = {
    generatedAt: new Date().toISOString(),
    mode: args.dryRun ? 'dry-run' : 'write',
    operationId: trace.operationId,
    batchId: trace.batchId,
    target,
    reportPath,
    tables: {
      [TABLES.courts]: courtUpdatesById.size
    }
  };
  const summary = {
    ok: true,
    mode: args.dryRun ? 'dry-run-only' : 'write',
    operationId: trace.operationId,
    batchId: trace.batchId,
    target,
    groups: applied.length,
    skippedGroups: skipped.length,
    sourceCourtsToArchive: applied.reduce((sum, item) => sum + item.before.sources.length, 0),
    courtUpdates: courtUpdatesById.size,
    items: applied.map(({ key, before, after }) => ({ key, before, after })),
    skipped,
    report
  };
  writeReport(report, reportPath);

  if (args.dryRun) {
    console.log(JSON.stringify(summary, null, 2));
    return { summary, report, reportPath };
  }

  for (const row of courtUpdatesById.values()) await writeRow(client, TABLES.courts, row);
  console.log(JSON.stringify(summary, null, 2));
  return { summary, report, reportPath };
}

async function main() {
  await run(process.argv.slice(2));
}

if (require.main === module) {
  main().catch((err) => {
    console.error(err && err.stack ? err.stack : String(err));
    process.exit(1);
  });
}

module.exports = {
  parseArgs,
  makeOperationTrace,
  traceRow,
  traceCourtRow,
  buildDuplicatePlan,
  applyPlan,
  run
};
