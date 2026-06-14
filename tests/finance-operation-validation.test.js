const assert = require('assert');

const validation = require('../scripts/lib/finance-operation-validation');

function snapshot({ cash = 0, recognized = 0, deferred = 0, packageIncome = 0, packageRecognized = 0, storedValueIncome = 0, storedValueConsumed = 0, bookingIncome = 0, bookingRecognized = 0, rows = [], tables = {} } = {}) {
  const tableNames = [
    'ft_courts',
    'ft_membership_accounts',
    'ft_membership_orders',
    'ft_membership_benefit_ledger',
    'ft_purchases',
    'ft_entitlements',
    'ft_entitlement_ledger',
    'ft_schedule'
  ];
  const normalizedTables = {};
  tableNames.forEach((tableName) => {
    const tableRows = tables[tableName] || [];
    normalizedTables[tableName] = { rowCount: tableRows.length, rows: tableRows };
  });
  return {
    schemaVersion: 1,
    environment: { tsInstance: 'flowtennis-ue' },
    tables: normalizedTables,
    financePage: {
      normalizedRowCount: rows.length,
      normalizedRows: rows,
      settlementRowCount: 0,
      settlementRows: []
    },
    summary: {
      financeOverview: {
        cash,
        recognized,
        deferred,
        packageIncome,
        packageRecognized,
        storedValueIncome,
        storedValueConsumed,
        bookingIncome,
        bookingRecognized,
        courtIncome: bookingIncome,
        courtRecognized: bookingRecognized
      }
    }
  };
}

const beforePackage = snapshot({
  cash: 1000,
  recognized: 200,
  deferred: 800,
  packageIncome: 1000,
  packageRecognized: 200,
  rows: [{ id: 'old-row' }],
  tables: {
    ft_purchases: [{ id: 'purchase-old' }],
    ft_entitlements: [{ id: 'ent-old', remainingLessons: 8 }]
  }
});

const afterPackage = snapshot({
  cash: 1400,
  recognized: 200,
  deferred: 1200,
  packageIncome: 1400,
  packageRecognized: 200,
  rows: [{ id: 'old-row' }, { id: 'receipt-new', businessType: '课程', action: '收款' }],
  tables: {
    ft_purchases: [{ id: 'purchase-old' }, { id: 'purchase-new', amountPaid: 400 }],
    ft_entitlements: [{ id: 'ent-old', remainingLessons: 8 }, { id: 'ent-new', remainingLessons: 10 }]
  }
});

const packageResult = validation.validateFinanceOperationChange({
  beforeSnapshot: beforePackage,
  afterSnapshot: afterPackage,
  operationType: 'package-purchase',
  amount: 400
});
assert.strictEqual(packageResult.ok, true, 'package purchase should pass when purchase, entitlement, ledger row and overview deltas match');
assert.strictEqual(packageResult.financeDeltas.cash, 400);
assert.strictEqual(packageResult.financeDeltas.deferred, 400);
assert.strictEqual(packageResult.tableChanges.ft_purchases.addedCount, 1);

const brokenPackage = validation.validateFinanceOperationChange({
  beforeSnapshot: beforePackage,
  afterSnapshot: snapshot({
    cash: 1400,
    recognized: 200,
    deferred: 1200,
    packageIncome: 1400,
    packageRecognized: 200,
    rows: [{ id: 'old-row' }, { id: 'receipt-new', businessType: '课程', action: '收款' }],
    tables: {
      ft_purchases: [{ id: 'purchase-old' }, { id: 'purchase-new', amountPaid: 400 }],
      ft_entitlements: [{ id: 'ent-old', remainingLessons: 8 }]
    }
  }),
  operationType: 'package-purchase',
  amount: 400
});
assert.strictEqual(brokenPackage.ok, false, 'package purchase should fail when entitlement did not change');
assert.match(brokenPackage.failures.join('\n'), /ft_entitlements/);

const beforeConsume = snapshot({
  cash: 1400,
  recognized: 200,
  deferred: 1200,
  packageIncome: 1400,
  packageRecognized: 200,
  rows: [{ id: 'old-row' }],
  tables: {
    ft_entitlements: [{ id: 'ent-new', remainingLessons: 10 }],
    ft_entitlement_ledger: [],
    ft_schedule: []
  }
});

const afterConsume = snapshot({
  cash: 1400,
  recognized: 300,
  deferred: 1100,
  packageIncome: 1400,
  packageRecognized: 300,
  rows: [{ id: 'old-row' }, { id: 'consume-new', businessType: '课程', action: '消耗' }],
  tables: {
    ft_entitlements: [{ id: 'ent-new', remainingLessons: 9 }],
    ft_entitlement_ledger: [{ id: 'ledger-new', lessonDelta: -1 }],
    ft_schedule: [{ id: 'schedule-new', status: '已结束' }]
  }
});

const consumeResult = validation.validateFinanceOperationChange({
  beforeSnapshot: beforeConsume,
  afterSnapshot: afterConsume,
  operationType: 'lesson-consume',
  amount: 100
});
assert.strictEqual(consumeResult.ok, true, 'lesson consume should pass when schedule, entitlement ledger and recognized/deferred deltas match');
assert.strictEqual(consumeResult.financeDeltas.recognized, 100);
assert.strictEqual(consumeResult.financeDeltas.deferred, -100);

const beforeTrace = snapshot({
  cash: 1000,
  recognized: 200,
  deferred: 800,
  packageIncome: 1000,
  packageRecognized: 200,
  rows: [{ id: 'finance-old' }],
  tables: {
    ft_purchases: [{ id: 'purchase-old' }],
    ft_entitlements: [{ id: 'ent-old', remainingLessons: 8 }]
  }
});

const afterTrace = snapshot({
  cash: 1400,
  recognized: 200,
  deferred: 1200,
  packageIncome: 1400,
  packageRecognized: 200,
  rows: [
    { id: 'finance-old' },
    { id: 'finance-op-1', operationId: 'op-trace-1', batchId: 'batch-trace-1', cashDelta: 400, deferredRevenueDelta: 400 }
  ],
  tables: {
    ft_purchases: [
      { id: 'purchase-old' },
      { id: 'purchase-op-1', operationId: 'op-trace-1', batchId: 'batch-trace-1', amountPaid: 400 }
    ],
    ft_entitlements: [
      { id: 'ent-old', remainingLessons: 8 },
      { id: 'ent-op-1', operationId: 'op-trace-1', batchId: 'batch-trace-1', remainingLessons: 10 }
    ]
  }
});

const operationTrace = validation.validateFinanceOperationTrace({
  beforeSnapshot: beforeTrace,
  afterSnapshot: afterTrace,
  operationId: 'op-trace-1'
});
assert.strictEqual(operationTrace.ok, true, 'operationId trace validation should pass when records exist');
assert.deepStrictEqual(operationTrace.involvedTables.ft_purchases.recordIds, ['purchase-op-1']);
assert.deepStrictEqual(operationTrace.involvedTables.ft_entitlements.recordIds, ['ent-op-1']);
assert.deepStrictEqual(operationTrace.involvedTables['financePage.normalizedRows'].recordIds, ['finance-op-1']);
assert.strictEqual(operationTrace.financeDeltas.cash, 400);
assert.strictEqual(operationTrace.financeDeltas.deferred, 400);

const batchTrace = validation.validateFinanceOperationTrace({
  beforeSnapshot: beforeTrace,
  afterSnapshot: afterTrace,
  batchId: 'batch-trace-1'
});
assert.strictEqual(batchTrace.ok, true, 'batchId trace validation should pass when records exist');
assert.deepStrictEqual(batchTrace.involvedTables.ft_purchases.recordIds, ['purchase-op-1']);

assert.throws(
  () => validation.validateFinanceOperationTrace({
    beforeSnapshot: beforeTrace,
    afterSnapshot: afterTrace,
    operationId: 'op-missing'
  }),
  /找不到 operationId: op-missing[\s\S]*禁止猜测/,
  'operation trace validation should fail when operationId is absent'
);

assert.throws(
  () => validation.validateFinanceOperationTrace({
    beforeSnapshot: beforeTrace,
    afterSnapshot: afterTrace,
    operationId: 'op-trace-1',
    batchId: 'batch-trace-1'
  }),
  /operationId 和 batchId 不能同时提供/,
  'operation trace validation should reject ambiguous selectors'
);

assert.throws(
  () => validation.validateFinanceOperationChange({
    beforeSnapshot: beforePackage,
    afterSnapshot: afterPackage,
    operationType: 'package-purchase'
  }),
  /amount/,
  'operation validation should require amount for finance delta checks'
);

console.log('finance operation validation tests passed');
