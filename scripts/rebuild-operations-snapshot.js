#!/usr/bin/env node

const path = require('path');
const dotenv = require('dotenv');
const { createStorageServices } = require('../server/storage.js');
const { DEFAULT_CAMPUSES } = require('../server/bootstrap.js');
const { buildOperationsPagePayload, getOperationsPageScope } = require('../server/page-data/operations-page.js');
const { createOperationsSnapshotSync } = require('../server/page-data/operations-snapshot.js');
const {
  assertExplicitWrite,
  assertProductionWriteTarget,
  parseWriteFlags
} = require('./lib/production-write-guard.js');

dotenv.config({ path: path.join(__dirname, '..', '.env') });
dotenv.config({ path: path.join(__dirname, '..', '.env.local'), override: true });
process.env.DISABLE_HOT_SCAN_PREWARM = process.env.DISABLE_HOT_SCAN_PREWARM || 'true';
process.env.STORAGE_OPERATION_TIMEOUT_MS = process.env.STORAGE_OPERATION_TIMEOUT_MS || '60000';

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
    processQueued: argv.includes('--process-queued'),
    limit: Math.max(1, Math.min(parseInt(value('--limit') || '1', 10) || 1, 5))
  };
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
  return getOperationsPageScope(query);
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
  const buildPayload = ({ scope }) => buildOperationsPagePayload({
    scope,
    dateRange: scope?.dateRange || {},
    user,
    listCampusesWithDefaults,
    getCachedScan: storage.getCachedScan,
    scanFirstRows: storage.scanFirstRows,
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
  const rebuilt = await sync.rebuildScope({ user, scope: buildScope(args), reason: 'script-default' });
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
  buildScope,
  parseArgs,
  run
};
