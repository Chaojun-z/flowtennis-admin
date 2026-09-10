#!/usr/bin/env node

const path = require('path');
const assert = require('assert');
const dotenv = require('dotenv');

dotenv.config({ path: path.join(__dirname, '..', '.env') });
dotenv.config({ path: path.join(__dirname, '..', '.env.local'), override: true });

process.env.DISABLE_HOT_SCAN_PREWARM = process.env.DISABLE_HOT_SCAN_PREWARM || 'true';
process.env.STORAGE_OPERATION_TIMEOUT_MS = process.env.STORAGE_OPERATION_TIMEOUT_MS || '60000';

const { createStorageServices } = require('../server/storage.js');
const { DEFAULT_CAMPUSES } = require('../server/bootstrap.js');
const { buildOperationsPagePayload } = require('../server/page-data/operations-page.js');
const { generateWeeklyBusinessReport } = require('../server/weekly-business-report.js');
const { fetchOnlineDiag, readDiagEnv, normalizeTarget, REQUIRED_PRODUCTION_INSTANCE } = require('./lib/production-write-guard.js');
const { _test: apiTest } = require('../api/index.js');

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
  T_FINANCIAL_LEDGER: 'ft_financial_ledger',
  T_COURT_ACCOUNT_LIST_INDEX: 'ft_court_account_list_index',
  T_COACHES: 'ft_coaches',
  T_USERS: 'ft_users',
  T_SCHEDULE: 'ft_schedule',
  T_FEEDBACKS: 'ft_feedbacks',
  T_CAMPUSES: 'ft_campuses'
};

const PERIOD = {
  startDate: '2026-08-27',
  endDate: '2026-09-03',
  previousStartDate: '2026-08-19',
  previousEndDate: '2026-08-26',
  timezone: 'Asia/Shanghai'
};

const EXPECTED = {
  cashReceived: 49295.99,
  businessRevenue: 38511.4,
  courseConsumedRevenue: 26650.4,
  memberBookingConsumedRevenue: 4557,
  bookingReceipts: 7304,
  storedValueReceipts: 4000,
  completedHours: 82.5,
  lifetimeIncome: 1746191.23
};

function money(value) {
  return Math.round((Number(value) || 0) * 100) / 100;
}

function collectEqual(failures, label, actual, expected) {
  const normalizedActual = money(actual);
  const normalizedExpected = money(expected);
  if (normalizedActual !== normalizedExpected) {
    failures.push(`${label}: actual=${normalizedActual} expected=${normalizedExpected}`);
  }
}

async function assertProductionReadTarget() {
  const diag = await fetchOnlineDiag({ env: process.env });
  const online = readDiagEnv(diag);
  const local = normalizeTarget(process.env);
  assert.strictEqual(local.localEndpoint, online.TS_ENDPOINT, '本地 TS_ENDPOINT 必须等于线上 /api/diag');
  assert.strictEqual(local.localInstance, online.TS_INSTANCE, '本地 TS_INSTANCE 必须等于线上 /api/diag');
  assert.strictEqual(online.TS_INSTANCE, REQUIRED_PRODUCTION_INSTANCE, '线上实例必须是 flowtennis-ue');
  return { endpoint: online.TS_ENDPOINT, instance: online.TS_INSTANCE };
}

function createStorage() {
  const allTables = new Set(Object.values(TABLES));
  return createStorageServices({
    tableStoreConfig: {
      accessKeyId: process.env.ALIBABA_CLOUD_ACCESS_KEY_ID,
      secretAccessKey: process.env.ALIBABA_CLOUD_ACCESS_KEY_SECRET,
      endpoint: process.env.TS_ENDPOINT,
      instanceName: process.env.TS_INSTANCE
    },
    hotScanTables: new Map([...allTables].map(table => [table, { ttlMs: 1 }])),
    hotGetTables: new Map()
  });
}

async function main() {
  const target = await assertProductionReadTarget();
  const storage = createStorage();
  const user = { id: 'weekly-report-live-hard-gate', role: 'admin', dataScope: 'all', campusIds: [] };
  const fullScan = (table, options = {}) => storage.getCachedScan(table, { ...options, pageLimit: 500, fresh: true });
  const listCampusesWithDefaults = async () => {
    const rows = await fullScan(TABLES.T_CAMPUSES).catch(() => []);
    return rows.length ? rows : DEFAULT_CAMPUSES.map(campus => ({ ...campus }));
  };
  const buildLivePayload = ({ scope, baseRowsOverride = null }) => buildOperationsPagePayload({
    scope,
    dateRange: scope?.dateRange || {},
    user,
    listCampusesWithDefaults,
    getCachedScan: fullScan,
    scanFirstRows: fullScan,
    getScheduleListRows: null,
    isProductionRuntime: () => true,
    filterLoadAllForUser: apiTest.filterLoadAllForUser,
    mergeDuplicateLeadRows: apiTest.mergeDuplicateLeadRows,
    buildFinancePageSnapshot: apiTest.buildFinancePageSnapshot,
    getFinancePageSnapshot: () => null,
    getFinancePageSnapshotIfCached: () => null,
    tables: TABLES,
    baseRowsOverride
  });

  let saved = null;
  const startedAt = Date.now();
  const report = await generateWeeklyBusinessReport({
    period: PERIOD,
    generationMode: 'manual',
    baseUrl: 'https://www.flowtennis.cn',
    mkTable: async () => {},
    get: async () => ({ shareToken: 'live-hard-gate-token' }),
    put: async (_table, _id, row) => { saved = row; },
    loadOperationsPayload: buildLivePayload,
    loadOperationsSnapshot: async () => {
      const err = new Error('hard gate forces live source fallback');
      err.code = 'OPERATIONS_SNAPSHOT_NOT_READY';
      err.statusCode = 503;
      throw err;
    }
  });
  assert.ok(saved, '硬测试必须走到保存前结果');
  assert.strictEqual(saved.id, report.id, '保存结果必须和生成结果一致');
  const failures = [];
  collectEqual(failures, '本周收款', report.summary.cashReceived.value, EXPECTED.cashReceived);
  collectEqual(failures, '营业收入', report.summary.totalIncome.value, EXPECTED.businessRevenue);
  collectEqual(failures, '课程核销入账', report.sections.revenue.recognized.courseConsumedRevenue, EXPECTED.courseConsumedRevenue);
  collectEqual(failures, '会员订场消耗收入', report.sections.revenue.recognized.memberBookingConsumedRevenue, EXPECTED.memberBookingConsumedRevenue);
  collectEqual(failures, '本周订场收款', report.sections.revenue.receipts.bookingAmount, EXPECTED.bookingReceipts);
  collectEqual(failures, '本周储值收款', report.sections.revenue.receipts.storedValueAmount, EXPECTED.storedValueReceipts);
  collectEqual(failures, '完成课时', report.summary.coachHours.value, EXPECTED.completedHours);
  collectEqual(failures, '历史累计收入', report.lifetimeSummary.totalIncome.value, EXPECTED.lifetimeIncome);
  assert.strictEqual(report.sections.trends.length, 8, '经营趋势必须有最近 8 周');
  report.sections.trends.forEach(row => {
    ['businessRevenue', 'cashReceived', 'courtUtilizationRate', 'coachHours'].forEach(key => {
      assert.ok(Number(row[key]) > 0, `经营趋势 ${row.label} 的 ${key} 不能为 0`);
    });
  });
  if (failures.length) {
    console.error(JSON.stringify({
      ok: false,
      target,
      period: PERIOD,
      elapsedMs: Date.now() - startedAt,
      actual: {
        cashReceived: money(report.summary.cashReceived.value),
        businessRevenue: money(report.summary.totalIncome.value),
        courseConsumedRevenue: money(report.sections.revenue.recognized.courseConsumedRevenue),
        memberBookingConsumedRevenue: money(report.sections.revenue.recognized.memberBookingConsumedRevenue),
        bookingReceipts: money(report.sections.revenue.receipts.bookingAmount),
        storedValueReceipts: money(report.sections.revenue.receipts.storedValueAmount),
        completedHours: money(report.summary.coachHours.value),
        lifetimeIncome: money(report.lifetimeSummary.totalIncome.value),
        trendCount: report.sections.trends.length
      },
      expected: EXPECTED,
      failures
    }, null, 2));
    throw new Error(`线上周报硬测试失败：${failures.join('；')}`);
  }
  console.log(JSON.stringify({
    ok: true,
    target,
    period: PERIOD,
    elapsedMs: Date.now() - startedAt,
    summary: {
      cashReceived: report.summary.cashReceived.value,
      businessRevenue: report.summary.totalIncome.value,
      completedHours: report.summary.coachHours.value,
      lifetimeIncome: report.lifetimeSummary.totalIncome.value,
      trendCount: report.sections.trends.length
    }
  }, null, 2));
}

main().catch(err => {
  console.error(err && err.stack ? err.stack : String(err));
  process.exit(1);
});
