#!/usr/bin/env node

const path = require('path');
const dotenv = require('dotenv');
const {
  assertExplicitWrite,
  assertProductionWriteTarget,
  parseWriteFlags
} = require('./lib/production-write-guard.js');

dotenv.config({ path: path.join(__dirname, '..', '.env') });
dotenv.config({ path: path.join(__dirname, '..', '.env.local'), override: true });
process.env.DISABLE_HOT_SCAN_PREWARM = process.env.DISABLE_HOT_SCAN_PREWARM || 'true';
process.env.STORAGE_OPERATION_TIMEOUT_MS = process.env.STORAGE_OPERATION_TIMEOUT_MS || '60000';
process.env.OPERATIONS_CACHE_TTL_MS = process.env.OPERATIONS_CACHE_TTL_MS || String(60 * 60 * 1000);

const { createStorageServices } = require('../server/storage.js');
const { DEFAULT_CAMPUSES } = require('../server/bootstrap.js');
const { buildOperationsPagePayload, getOperationsPageScope } = require('../server/page-data/operations-page.js');
const { COACH_DAILY_MONTH_PACK_VIEW, createOperationsSnapshotSync } = require('../server/page-data/operations-snapshot.js');
const { WEEKLY_REPORT_CAMPUS_NAME, resolveWeeklyBusinessReportPeriod } = require('../server/weekly-business-report.js');
const { normalizeCampusValue, displayCampusName } = require('../public/assets/scripts/core/campus.js');

const TABLES = {
  T_LEADS: 'ft_leads',
  T_LEAD_FOLLOWUPS: 'ft_lead_followups',
  T_STUDENTS: 'ft_students',
  T_PURCHASES: 'ft_purchases',
  T_ENTITLEMENTS: 'ft_entitlements',
  T_ENTITLEMENT_LEDGER: 'ft_entitlement_ledger',
  T_COURTS: 'ft_courts',
  T_MEMBERSHIP_ORDERS: 'ft_membership_orders',
  T_MEMBERSHIP_ACCOUNTS: 'ft_membership_accounts',
  T_MEMBERSHIP_PLANS: 'ft_membership_plans',
  T_MEMBERSHIP_BENEFIT_LEDGER: 'ft_membership_benefit_ledger',
  T_MEMBERSHIP_ACCOUNT_EVENTS: 'ft_membership_account_events',
  T_COACHES: 'ft_coaches',
  T_USERS: 'ft_users',
  T_SCHEDULE: 'ft_schedule',
  T_FEEDBACKS: 'ft_feedbacks',
  T_CAMPUSES: 'ft_campuses'
};
const T_OPERATIONS_SNAPSHOT = 'ft_operations_snapshot';
const T_OPERATIONS_SNAPSHOT_TASKS = 'ft_operations_snapshot_tasks';

function requireEnv(name, fallbackName = '') {
  const value = String(process.env[name] || (fallbackName ? process.env[fallbackName] : '') || '').trim();
  if (!value) throw new Error(`缺少环境变量: ${name}${fallbackName ? `/${fallbackName}` : ''}`);
  return value;
}

function parseArgs(argv = []) {
  const flags = parseWriteFlags(argv);
  const value = (name) => {
    const index = argv.indexOf(name);
    return index >= 0 ? String(argv[index + 1] || '').trim() : '';
  };
  return {
    ...flags,
    campus: value('--campus'),
    campusName: value('--campusName'),
    startDate: value('--startDate'),
    endDate: value('--endDate'),
    view: value('--view'),
    commonScopes: argv.includes('--common-scopes'),
    dailyScopes: argv.includes('--daily-scopes'),
    dailyMonthScopes: argv.includes('--daily-month-scopes'),
    weeklyReportScopes: argv.includes('--weekly-report-scopes'),
    includeWeeklyReportRaw: argv.includes('--include-weekly-report-raw'),
    skipDefaultScope: argv.includes('--skip-default-scope'),
    dailyFrom: value('--daily-from'),
    dailyTo: value('--daily-to'),
    processQueued: argv.includes('--process-queued'),
    limit: Math.max(1, Math.min(parseInt(value('--limit') || '1', 10) || 1, 5)),
    shardCount: Math.max(1, Math.min(parseInt(value('--shard-count') || '1', 10) || 1, 20)),
    shardIndex: Math.max(0, parseInt(value('--shard-index') || '0', 10) || 0)
  };
}

function chinaDateKey(date = new Date()) {
  const parts = Object.fromEntries(new Intl.DateTimeFormat('en-CA', {
    timeZone: 'Asia/Shanghai',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit'
  }).formatToParts(date).filter((item) => item.type !== 'literal').map((item) => [item.type, item.value]));
  return `${parts.year}-${parts.month}-${parts.day}`;
}

function addDays(dateKey, amount) {
  const base = new Date(`${dateKey}T00:00:00+08:00`);
  base.setUTCDate(base.getUTCDate() + amount);
  return chinaDateKey(base);
}

function monthBounds(dateKey) {
  const [year, month] = String(dateKey || '').split('-').map((item) => parseInt(item, 10));
  const start = `${year}-${String(month).padStart(2, '0')}-01`;
  const end = `${year}-${String(month).padStart(2, '0')}-${String(new Date(Date.UTC(year, month, 0)).getUTCDate()).padStart(2, '0')}`;
  return { startDate: start, endDate: end };
}

function previousMonthBounds(dateKey) {
  const [year, month] = String(dateKey || '').split('-').map((item) => parseInt(item, 10));
  const previousMonth = month === 1 ? 12 : month - 1;
  const previousYear = month === 1 ? year - 1 : year;
  return monthBounds(`${previousYear}-${String(previousMonth).padStart(2, '0')}-01`);
}

function weekBounds(dateKey) {
  const base = new Date(`${dateKey}T00:00:00+08:00`);
  const day = base.getUTCDay() || 7;
  const start = addDays(dateKey, 1 - day);
  return { startDate: start, endDate: addDays(start, 6) };
}

function validDateKey(value) {
  const text = String(value || '').trim();
  return /^\d{4}-\d{2}-\d{2}/.test(text) ? text.slice(0, 10) : '';
}

function enumerateDays(startDate, endDate) {
  const start = validDateKey(startDate);
  const end = validDateKey(endDate);
  if (!start || !end || end < start) return [];
  const days = [];
  for (let day = start; day && day <= end; day = addDays(day, 1)) days.push(day);
  return days;
}

function sourceDay(row = {}) {
  return validDateKey(row.startTime || row.date || row.businessDate || row.purchaseDate || row.createdAt || row.updatedAt);
}

async function inferDailySnapshotBounds({ args = {}, storage } = {}) {
  const explicitFrom = validDateKey(args.dailyFrom);
  const explicitTo = validDateKey(args.dailyTo);
  if (explicitFrom && explicitTo) return { startDate: explicitFrom, endDate: explicitTo };
  const [scheduleRows, purchaseRows] = await Promise.all([
    storage.getCachedScan(TABLES.T_SCHEDULE, { columns: ['startTime', 'date', 'createdAt', 'updatedAt'] }).catch(() => []),
    storage.getCachedScan(TABLES.T_PURCHASES, { columns: ['purchaseDate', 'createdAt', 'updatedAt'] }).catch(() => [])
  ]);
  const days = [...scheduleRows, ...purchaseRows].map(sourceDay).filter(Boolean).sort();
  const today = chinaDateKey(new Date());
  const startDate = explicitFrom || days[0] || today;
  const latestSourceDay = days[days.length - 1] || today;
  const endDate = explicitTo || [latestSourceDay, today, addDays(today, 90)].sort()[2];
  return { startDate, endDate };
}

function normalizedCampusScope(campus = {}) {
  const id = normalizeCampusValue(campus.id || campus.code || campus.campus || campus.name || '');
  const name = displayCampusName(campus.name || campus.campusName || id);
  if (!id && !name) return null;
  return { campus: id, campusName: name };
}

function buildCommonScopeArgs(args = {}, now = new Date(), campuses = []) {
  if (!args.commonScopes) return [args];
  const today = chinaDateKey(now);
  const dateScopes = [
    { startDate: '', endDate: '' },
    { startDate: today, endDate: today },
    weekBounds(today),
    monthBounds(today),
    previousMonthBounds(today)
  ];
  const campusScopes = [{ campus: args.campus || '', campusName: args.campusName || '' }];
  if (!args.campus && !args.campusName) {
    campuses.map(normalizedCampusScope).filter(Boolean).forEach((campus) => campusScopes.push(campus));
  }
  const scopes = campusScopes.flatMap((campusScope) => dateScopes.map((dateScope) => ({ ...args, ...campusScope, ...dateScope })));
  const seen = new Set();
  const uniqueScopes = scopes.filter((item) => {
    const key = [item.campus || '', item.campusName || '', item.startDate || '', item.endDate || '', item.view || ''].join('|');
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
  const shardCount = Math.max(1, parseInt(args.shardCount || '1', 10) || 1);
  const shardIndex = Math.max(0, parseInt(args.shardIndex || '0', 10) || 0);
  if (shardCount <= 1) return uniqueScopes;
  return uniqueScopes.filter((_, index) => index % shardCount === shardIndex % shardCount);
}

function buildDailyScopeArgs(args = {}, bounds = {}, campuses = []) {
  if (!args.dailyScopes) return [];
  const days = enumerateDays(bounds.startDate, bounds.endDate);
  const campusScopes = [{ campus: args.campus || '', campusName: args.campusName || '' }];
  if (!args.campus && !args.campusName) {
    campuses.map(normalizedCampusScope).filter(Boolean).forEach((campus) => campusScopes.push(campus));
  }
  return campusScopes.flatMap((campusScope) => days.map(day => ({
    ...args,
    ...campusScope,
    startDate: day,
    endDate: day,
    view: 'coach'
  })));
}

function enumerateMonths(startDate, endDate) {
  const days = enumerateDays(startDate, endDate);
  const seen = new Set();
  return days.map(day => day.slice(0, 7)).filter(month => {
    if (seen.has(month)) return false;
    seen.add(month);
    return true;
  });
}

function monthBoundsFromMonth(month = '') {
  return monthBounds(`${String(month || '').slice(0, 7)}-01`);
}

function buildDailyMonthScopeArgs(args = {}, bounds = {}, campuses = []) {
  if (!args.dailyMonthScopes) return [];
  const months = enumerateMonths(bounds.startDate, bounds.endDate);
  const campusScopes = [{ campus: args.campus || '', campusName: args.campusName || '' }];
  if (!args.campus && !args.campusName) {
    campuses.map(normalizedCampusScope).filter(Boolean).forEach((campus) => campusScopes.push(campus));
  }
  return campusScopes.flatMap((campusScope) => months.map(month => ({
    ...args,
    ...campusScope,
    ...monthBoundsFromMonth(month),
    view: COACH_DAILY_MONTH_PACK_VIEW
  })));
}

function shardScopeArgs(scopes = [], args = {}) {
  const seen = new Set();
  const uniqueScopes = scopes.filter((item) => {
    const key = [item.campus || '', item.campusName || '', item.startDate || '', item.endDate || '', item.view || '', item.includeWeeklyReportRaw ? 'raw' : ''].join('|');
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
  const shardCount = Math.max(1, parseInt(args.shardCount || '1', 10) || 1);
  const shardIndex = Math.max(0, parseInt(args.shardIndex || '0', 10) || 0);
  if (shardCount <= 1) return uniqueScopes;
  return uniqueScopes.filter((_, index) => index % shardCount === shardIndex % shardCount);
}

function buildWeeklyReportScopeArgs(args = {}, now = new Date()) {
  if (!args.weeklyReportScopes) return [];
  const period = resolveWeeklyBusinessReportPeriod(now);
  const campusName = args.campusName || WEEKLY_REPORT_CAMPUS_NAME;
  const campus = args.campus || '';
  return [
    { ...args, campus, campusName, startDate: period.startDate, endDate: period.endDate, view: 'weekly-report', includeWeeklyReportRaw: true },
    { ...args, campus, campusName, startDate: period.previousStartDate, endDate: period.previousEndDate, view: 'weekly-report', includeWeeklyReportRaw: true },
    { ...args, campus, campusName, startDate: '', endDate: '', view: 'weekly-report', includeWeeklyReportRaw: false }
  ];
}

function createSnapshotStorage() {
  return createStorageServices({
    tableStoreConfig: {
      accessKeyId: requireEnv('ALIBABA_CLOUD_ACCESS_KEY_ID', 'TS_KEY_ID'),
      secretAccessKey: requireEnv('ALIBABA_CLOUD_ACCESS_KEY_SECRET', 'TS_KEY_SEC'),
      endpoint: requireEnv('TS_ENDPOINT'),
      instanceName: requireEnv('TS_INSTANCE')
    },
    hotScanTables: new Map(Object.values(TABLES).map((table) => [table, { ttlMs: 60000 }])),
    hotGetTables: new Map([
      [T_OPERATIONS_SNAPSHOT, { ttlMs: 60000 }],
      [T_OPERATIONS_SNAPSHOT_TASKS, { ttlMs: 60000 }]
    ])
  });
}

function buildScope(args = {}) {
  const query = new URLSearchParams();
  ['campus', 'campusName', 'startDate', 'endDate', 'view'].forEach((key) => {
    if (args[key]) query.set(key, args[key]);
  });
  const scope = getOperationsPageScope(query);
  if (args.view && args.view !== 'coach') scope.view = args.view;
  if (args.includeWeeklyReportRaw) scope.includeWeeklyReportRaw = true;
  return scope;
}

function loadOperationsHelpers() {
  const api = require('../api/index.js');
  const helpers = api?._test || {};
  ['filterLoadAllForUser', 'mergeDuplicateLeadRows', 'buildFinancePageSnapshot'].forEach((name) => {
    if (typeof helpers[name] !== 'function') throw new Error(`缺少经营分析统一口径函数: ${name}`);
  });
  return helpers;
}

async function run(options = {}) {
  const args = { ...parseArgs([]), ...options };
  assertExplicitWrite({ write: args.write, scriptName: 'rebuild-operations-snapshot' });
  const target = await assertProductionWriteTarget();
  const storage = createSnapshotStorage();
  const helpers = loadOperationsHelpers();
  const user = { id: 'system-operations-snapshot', role: 'admin', dataScope: 'all', campusIds: [] };
  const listCampusesWithDefaults = async () => {
    const rows = await storage.getCachedScan(TABLES.T_CAMPUSES).catch(() => []);
    return rows.length ? rows : DEFAULT_CAMPUSES.map((campus) => ({ ...campus }));
  };
  const weeklyReportScanOptions = (table, options = {}) => ({
    ...options,
    pageLimit: 500
  });
  const buildPayload = ({ scope }) => buildOperationsPagePayload({
    scope,
    dateRange: scope?.dateRange || {},
    user,
    listCampusesWithDefaults,
    getCachedScan: (table, options = {}) => storage.getCachedScan(table, scope?.view === 'weekly-report' ? weeklyReportScanOptions(table, options) : options),
    scanFirstRows: scope?.view === 'weekly-report'
      ? (table, options = {}) => storage.getCachedScan(table, weeklyReportScanOptions(table, options))
      : storage.scanFirstRows,
    getScheduleListRows: null,
    isProductionRuntime: () => true,
    filterLoadAllForUser: helpers.filterLoadAllForUser,
    mergeDuplicateLeadRows: helpers.mergeDuplicateLeadRows,
    buildFinancePageSnapshot: helpers.buildFinancePageSnapshot,
    getFinancePageSnapshot: () => null,
    getFinancePageSnapshotIfCached: () => null,
    tables: TABLES
  });
  const sync = createOperationsSnapshotSync({
    getCachedRow: storage.getCachedRow,
    put: storage.put,
    mkTable: storage.mkTable,
    scanByIdPrefix: storage.scanByIdPrefix,
    buildPayload,
    tables: { operationsSnapshot: T_OPERATIONS_SNAPSHOT, operationsSnapshotTasks: T_OPERATIONS_SNAPSHOT_TASKS }
  });
  const rebuilt = [];
  const campusRows = (args.commonScopes || args.dailyScopes || args.dailyMonthScopes) && !args.campus && !args.campusName ? await listCampusesWithDefaults() : [];
  const dailyBounds = (args.dailyScopes || args.dailyMonthScopes) ? await inferDailySnapshotBounds({ args, storage }) : null;
  const scopeArgsList = shardScopeArgs([
    ...(args.skipDefaultScope ? [] : buildCommonScopeArgs({ ...args, shardCount: 1, shardIndex: 0 }, new Date(), campusRows)),
    ...buildDailyScopeArgs(args, dailyBounds || {}, campusRows),
    ...buildDailyMonthScopeArgs(args, dailyBounds || {}, campusRows),
    ...buildWeeklyReportScopeArgs(args, new Date())
  ], args);
  console.error(`[operations-snapshot] rebuilding ${scopeArgsList.length} scope(s), shard ${args.shardIndex + 1}/${args.shardCount}`);
  for (const scopeArgs of scopeArgsList) {
    console.error(`[operations-snapshot] scope campus=${scopeArgs.campus || 'all'} start=${scopeArgs.startDate || 'all'} end=${scopeArgs.endDate || 'all'} view=${scopeArgs.view || 'all'}`);
    rebuilt.push(await sync.rebuildScope({ user, scope: buildScope(scopeArgs), reason: args.commonScopes ? 'script-common-scope' : 'script-default' }));
  }
  const queued = args.processQueued ? await sync.processQueuedRebuilds({ limit: args.limit, includeFailed: false }) : { processed: 0, tasks: [] };
  return { ok: true, target, queued, rebuilt };
}

async function main() {
  const args = parseArgs(process.argv.slice(2));
  const result = await run(args);
  console.log(JSON.stringify({
    ok: result.ok,
    target: result.target,
    queued: { processed: result.queued.processed, tasks: result.queued.tasks },
    rebuilt: result.rebuilt
  }, null, 2));
}

if (require.main === module) {
  main().then(() => process.exit(0)).catch((error) => {
    console.error(error && error.message ? error.message : String(error));
    process.exit(1);
  });
}

module.exports = {
  buildCommonScopeArgs,
  buildDailyScopeArgs,
  buildDailyMonthScopeArgs,
  buildWeeklyReportScopeArgs,
  buildScope,
  enumerateMonths,
  enumerateDays,
  parseArgs,
  run
};
