const assert = require('assert');
const path = require('path');

const snapshot = require('../scripts/lib/finance-daily-snapshot');

assert.deepStrictEqual(
  snapshot.FINANCE_DAILY_SNAPSHOT_TABLES,
  [
    'ft_courts',
    'ft_membership_accounts',
    'ft_membership_orders',
    'ft_membership_benefit_ledger',
    'ft_purchases',
    'ft_entitlements',
    'ft_entitlement_ledger',
    'ft_schedule'
  ],
  'daily finance snapshot should cover every phase-one safety table'
);

const matched = snapshot.assertDiagMatchesLocalTarget({
  onlineDiag: {
    env: {
      TS_ENDPOINT: 'https://flowtennis-ue.us-east-1.ots.aliyuncs.com',
      TS_INSTANCE: 'flowtennis-ue'
    }
  },
  env: {
    TS_ENDPOINT: 'https://flowtennis-ue.us-east-1.ots.aliyuncs.com',
    TS_INSTANCE: 'flowtennis-ue'
  }
});
assert.strictEqual(matched.onlineInstance, 'flowtennis-ue');

let diagRequestHeaders = null;
snapshot.fetchOnlineDiag({
  env: {
    FLOWTENNIS_ADMIN_TOKEN: 'test-token',
    FLOWTENNIS_ADMIN_COOKIE: 'sid=test-cookie'
  },
  fetchImpl: async (url, options) => {
    assert.strictEqual(url, 'https://www.flowtennis.cn/api/diag');
    diagRequestHeaders = options.headers;
    return {
      ok: true,
      json: async () => ({ env: { TS_ENDPOINT: 'endpoint', TS_INSTANCE: 'instance' } })
    };
  }
}).then((diag) => {
  assert.strictEqual(diag.env.TS_INSTANCE, 'instance');
  assert.strictEqual(diagRequestHeaders.Authorization, 'Bearer test-token');
  assert.strictEqual(diagRequestHeaders.Cookie, 'sid=test-cookie');
}).catch((error) => {
  console.error(error && error.stack ? error.stack : String(error));
  process.exit(1);
});

assert.throws(
  () => snapshot.assertDiagMatchesLocalTarget({
    onlineDiag: {
      env: {
        TS_ENDPOINT: 'https://flowtennis-ue.us-east-1.ots.aliyuncs.com',
        TS_INSTANCE: 'flowtennis-ue'
      }
    },
    env: {
      TS_ENDPOINT: 'https://flowtennis.us-east-1.ots.aliyuncs.com',
      TS_INSTANCE: 'flowtennis'
    }
  }),
  /停止快照/,
  'snapshot should stop when local TableStore target differs from production diag'
);

const built = snapshot.buildDailyFinanceSnapshot({
  generatedAt: '2026-05-31T10:00:00.000Z',
  snapshotDate: '2026-05-31',
  diag: {
    env: {
      TS_ENDPOINT: 'https://flowtennis-ue.us-east-1.ots.aliyuncs.com',
      TS_INSTANCE: 'flowtennis-ue'
    }
  },
  tables: {
    ft_courts: [{ id: 'court-1', history: [{ id: 'h1', amount: 100 }] }],
    ft_membership_accounts: [{ id: 'member-1' }],
    ft_membership_orders: [],
    ft_membership_benefit_ledger: [],
    ft_purchases: [{ id: 'purchase-1', amountPaid: 1000 }],
    ft_entitlements: [{ id: 'ent-1', remainingLessons: 9 }],
    ft_entitlement_ledger: [{ id: 'ledger-1', lessonDelta: -1 }],
    ft_schedule: [{ id: 'schedule-1' }]
  },
  financePage: {
    financeOverviewData: {
      all: {
        cash: 1100,
        recognized: 100,
        deferred: 1000,
        courseIncome: 1000,
        courseRecognized: 0,
        packageIncome: 1000,
        packageRecognized: 0,
        storedValueIncome: 0,
        storedValueConsumed: 0,
        bookingIncome: 100,
        bookingRecognized: 100
      }
    },
    financeNormalizedRows: [{
      id: 'finance-row-1',
      businessType: '课程',
      action: '收款',
      sourceDocument: '购买记录 purchase-1',
      cashDelta: 1000,
      recognizedRevenueDelta: 0,
      deferredRevenueDelta: 1000,
      operationId: 'op-snapshot-1',
      batchId: 'batch-snapshot-1'
    }, {
      id: 'finance-row-2',
      businessType: '散客订场',
      action: '收款',
      sourceDocument: '订场账户 court-1',
      cashDelta: 100,
      recognizedRevenueDelta: 100,
      deferredRevenueDelta: 0,
      operationId: 'op-snapshot-2',
      batchId: 'batch-snapshot-2'
    }],
    financeSettlementRows: [{ id: 'settlement-row-1' }]
  }
});

assert.strictEqual(built.schemaVersion, 1);
assert.strictEqual(built.baselineType, 'operating_finance_snapshot');
assert.strictEqual(built.sourceOfTruth, 'online_readonly_snapshot');
assert.strictEqual(built.notCodeRegressionGuard, true);
assert.strictEqual(built.snapshotDate, '2026-05-31');
assert.strictEqual(built.environment.tsInstance, 'flowtennis-ue');
assert.strictEqual(built.tables.ft_courts.rowCount, 1);
assert.strictEqual(built.tables.ft_purchases.rows[0].id, 'purchase-1');
assert.strictEqual(built.summary.tableRowCounts.ft_entitlement_ledger, 1);
assert.deepStrictEqual(built.summary.financeOverview, {
  cash: 1100,
  recognized: 100,
  deferred: 1000,
  courseIncome: 1000,
  courseRecognized: 0,
  packageIncome: 1000,
  packageRecognized: 0,
  storedValueIncome: 0,
  storedValueConsumed: 0,
  bookingIncome: 100,
  bookingRecognized: 100
});
assert.strictEqual(built.financePage.normalizedRowCount, 2);
assert.strictEqual(built.financePage.settlementRowCount, 1);
assert.strictEqual(built.financePage.displayConsistency.ok, true, 'snapshot should verify finance overview against normalized rows');
assert.deepStrictEqual(built.financePage.displayConsistency.metrics, {
  cash: 1100,
  recognized: 100,
  courseIncome: 1000,
  courseRecognized: 0,
  storedValueIncome: 0,
  storedValueConsumed: 0,
  bookingIncome: 100,
  bookingRecognized: 100
});
assert.strictEqual(built.shadowLedgerRows.length, 2, 'snapshot should include generated shadow ledger rows');
assert.strictEqual(built.shadowLedgerRows[0].operationId, 'op-snapshot-1');
assert.strictEqual(built.shadowLedgerRows[0].batchId, 'batch-snapshot-1');
assert.strictEqual(built.shadowLedgerCompareReport.ok, true, 'matching shadow ledger report should be ok');
assert.deepStrictEqual(built.shadowLedgerCompareReport.summaryDifference, { cash: 0, recognized: 0, deferred: 0 });

const mismatchBuilt = snapshot.buildDailyFinanceSnapshot({
  generatedAt: '2026-05-31T10:00:00.000Z',
  snapshotDate: '2026-05-31',
  diag: { env: { TS_ENDPOINT: 'endpoint', TS_INSTANCE: 'instance' } },
  tables: {},
  financePage: {
    financeNormalizedRows: [{
      id: 'finance-row-mismatch',
      businessType: '课程',
      action: '收款',
      sourceDocument: '购买记录 purchase-mismatch',
      cashDelta: 500,
      recognizedRevenueDelta: 0,
      deferredRevenueDelta: 500
    }],
    shadowLedgerRows: [{
      id: 'shadow-finance-row-mismatch',
      ledgerVersion: 'shadow-ledger-v1',
      status: 'active',
      businessType: '课程',
      actionType: '收款',
      ledgerType: 'package_receipt',
      sourceType: 'purchase',
      sourceId: 'purchase-mismatch',
      sourceSubId: '',
      cashDelta: 40000,
      recognizedRevenueDelta: 10000,
      deferredRevenueDelta: 30000,
      sourceSnapshot: {
        financeNormalizedRowId: 'finance-row-mismatch',
        sourceDocument: '购买记录 purchase-mismatch'
      },
      idempotencyKey: 'purchase|purchase-mismatch||package_receipt'
    }]
  }
});
assert.strictEqual(mismatchBuilt.shadowLedgerCompareReport.ok, false, 'snapshot should keep failed compare report without throwing');
assert.ok(mismatchBuilt.shadowLedgerCompareReport.details.some((item) => item.type === 'amount_mismatch'));

const displayMismatchBuilt = snapshot.buildDailyFinanceSnapshot({
  generatedAt: '2026-05-31T10:00:00.000Z',
  snapshotDate: '2026-05-31',
  diag: { env: { TS_ENDPOINT: 'endpoint', TS_INSTANCE: 'instance' } },
  tables: {},
  financePage: {
    financeOverviewData: {
      all: {
        cash: 1000,
        recognized: 800,
        courseIncome: 1000,
        courseRecognized: 800
      }
    },
    financeNormalizedRows: [{
      id: 'course-receipt-display-guard',
      businessType: '课程',
      action: '收款',
      sourceDocument: '购买记录 p-display',
      cashDelta: 1000,
      recognizedRevenueDelta: 0,
      deferredRevenueDelta: 1000
    }, {
      id: 'course-consume-display-guard',
      businessType: '课程',
      action: '消耗',
      paymentChannel: '课包划扣',
      cashDelta: 0,
      recognizedRevenueDelta: 400,
      deferredRevenueDelta: -400
    }]
  }
});
assert.strictEqual(displayMismatchBuilt.financePage.displayConsistency.ok, false, 'snapshot should flag finance overview values that drift from normalized rows');
assert.ok(displayMismatchBuilt.financePage.displayConsistency.details.some((item) => item.metric === 'recognized' && item.expected === 400 && item.actual === 800));
assert.strictEqual(displayMismatchBuilt.summary.displayConsistency.ok, false, 'summary should expose display consistency failures');

const derived = snapshot.buildDailyFinanceSnapshot({
  generatedAt: '2026-05-31T10:00:00.000Z',
  snapshotDate: '2026-05-31',
  diag: { env: { TS_ENDPOINT: 'endpoint', TS_INSTANCE: 'instance' } },
  tables: {},
  financePage: {
    financeNormalizedRows: [{
      id: 'course-receipt',
      businessType: '课程',
      action: '收款',
      sourceDocument: '购买记录 purchase-1',
      cashDelta: 1000,
      recognizedRevenueDelta: 0,
      deferredRevenueDelta: 1000
    }, {
      id: 'course-consume',
      businessType: '课程',
      action: '消耗',
      paymentChannel: '课包划扣',
      cashDelta: 0,
      recognizedRevenueDelta: 100,
      deferredRevenueDelta: -100
    }, {
      id: 'direct-course-receipt',
      businessType: '课程',
      action: '收款',
      sourceDocument: '排课 schedule-1',
      cashDelta: 99,
      recognizedRevenueDelta: 99,
      deferredRevenueDelta: 0
    }, {
      id: 'court-receipt',
      businessType: '散客订场',
      action: '收款',
      cashDelta: 200,
      recognizedRevenueDelta: 200,
      deferredRevenueDelta: 0
    }]
  }
});
assert.deepStrictEqual(derived.summary.financeOverview, {
  cash: 1299,
  recognized: 399,
  deferred: 900,
  courseIncome: 1099,
  courseRecognized: 199,
  directCourseIncome: 99,
  directCourseRecognized: 99,
  packageIncome: 1000,
  packageRecognized: 100,
  storedValueIncome: 0,
  storedValueConsumed: 0,
  bookingIncome: 200,
  bookingRecognized: 200,
  courtIncome: 200,
  courtRecognized: 200,
  tradeCount: 3
});

const outputPath = snapshot.buildSnapshotOutputPath({
  baseDir: '/tmp/flowtennis-snapshots',
  snapshotDate: '2026-05-31',
  generatedAt: '2026-05-31T10:11:12.000Z'
});
assert.strictEqual(
  outputPath,
  path.join('/tmp/flowtennis-snapshots', '2026-05-31', 'finance-daily-snapshot-2026-05-31T10-11-12-000Z.json')
);

console.log('finance daily snapshot tests passed');
