#!/usr/bin/env node

const { _test: rules } = require('../api/index.js');
const {
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

function applyPlan(plan, refs, now) {
  let targetCourt = plan.target;
  const courtUpdates = [];
  let membershipAccounts = refs.membershipAccounts;
  let membershipOrders = refs.membershipOrders;
  let membershipBenefitLedger = refs.membershipBenefitLedger;
  let membershipAccountEvents = refs.membershipAccountEvents;

  for (const sourceCourt of plan.sources) {
    const merged = rules.mergeCourtRecords({
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

async function main() {
  const args = parseArgs(process.argv.slice(2));
  loadEnv();
  const target = await assertProductionTarget();
  const client = createClientFromEnv();
  const [courts, membershipAccounts, membershipOrders, membershipBenefitLedger, membershipAccountEvents] = await Promise.all([
    scanTable(client, TABLES.courts),
    scanTable(client, EXTRA_TABLES.membershipAccounts).catch(() => []),
    scanTable(client, EXTRA_TABLES.membershipOrders).catch(() => []),
    scanTable(client, EXTRA_TABLES.membershipBenefitLedger).catch(() => []),
    scanTable(client, EXTRA_TABLES.membershipAccountEvents).catch(() => [])
  ]);
  const data = { courts, membershipAccounts, membershipOrders, membershipBenefitLedger, membershipAccountEvents };
  const now = new Date().toISOString();
  const plans = buildDuplicatePlan(data);
  const membershipCourtIds = new Set(membershipOrders.map((row) => String(row.courtId || '')).filter(Boolean));
  const applied = [];
  const skipped = [];
  for (const plan of plans) {
    try {
      const result = applyPlan(plan, data, now);
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
    for (const row of item.result.courtUpdates) courtUpdatesById.set(String(row.id), row);
  }
  const summary = {
    ok: true,
    mode: args.dryRun ? 'dry-run-only' : 'write',
    target,
    groups: applied.length,
    skippedGroups: skipped.length,
    sourceCourtsToArchive: applied.reduce((sum, item) => sum + item.before.sources.length, 0),
    courtUpdates: courtUpdatesById.size,
    items: applied.map(({ key, before, after }) => ({ key, before, after })),
    skipped
  };

  if (args.dryRun) {
    console.log(JSON.stringify(summary, null, 2));
    return;
  }

  for (const row of courtUpdatesById.values()) await putRow(client, TABLES.courts, row);
  console.log(JSON.stringify(summary, null, 2));
}

if (require.main === module) {
  main().catch((err) => {
    console.error(err && err.stack ? err.stack : String(err));
    process.exit(1);
  });
}
