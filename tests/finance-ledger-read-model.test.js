const assert = require('assert');

const {
  buildShadowLedgerRowsFromFinanceNormalizedRows,
  buildFinanceNormalizedRowsFromLedgerRows
} = require('../scripts/lib/finance-ledger-read-model');

const financeRows = [
  {
    id: 'purchase-p1',
    operationId: 'op-p1',
    batchId: 'batch-p1',
    businessDate: '2026-06-14T10:00:00.000Z',
    customer: '张三',
    campusName: '马坡',
    businessType: '课程',
    action: '收款',
    cashDelta: 1200.25,
    recognizedRevenueDelta: 0,
    deferredRevenueDelta: 1200.25,
    paymentChannel: '微信',
    sourceDocument: '购买记录 p1',
    notes: '课包购买',
    incomeType: '青训课包',
    debitTarget: '课包'
  },
  {
    id: 'consume-l1',
    operationId: 'op-l1',
    batchId: 'batch-l1',
    businessDate: '2026-06-14T11:00:00.000Z',
    customer: '李四',
    campusName: '马坡',
    businessType: '课程',
    action: '消耗',
    cashDelta: 0,
    recognizedRevenueDelta: 300,
    deferredRevenueDelta: -300,
    paymentChannel: '课包划扣',
    sourceDocument: '排课 s1',
    notes: '正常消课',
    incomeType: '青训课包',
    debitTarget: '课包'
  },
  {
    id: 'member-c1',
    operationId: 'op-c1',
    batchId: 'batch-c1',
    businessDate: '2026-06-14T12:00:00.000Z',
    customer: '王五',
    campusName: '马坡',
    businessType: '会员订场',
    action: '已入账',
    cashDelta: 0,
    recognizedRevenueDelta: 240,
    deferredRevenueDelta: -240,
    paymentChannel: '储值扣款',
    sourceDocument: '订场账户 c1',
    notes: '会员订场',
    incomeType: '会员订场',
    debitTarget: '会员储值余额'
  }
];

const shadowLedgerRows = buildShadowLedgerRowsFromFinanceNormalizedRows(financeRows);
assert.strictEqual(shadowLedgerRows.length, financeRows.length, 'shadow ledger should keep one row per financeNormalizedRows item');
assert.strictEqual(shadowLedgerRows[0].cashDelta, 120025, 'shadow ledger should store cashDelta in cents');
assert.strictEqual(shadowLedgerRows[0].deferredRevenueDelta, 120025, 'shadow ledger should store deferredRevenueDelta in cents');
assert.strictEqual(shadowLedgerRows[0].operationId, 'op-p1', 'shadow ledger should preserve operationId');
assert.strictEqual(shadowLedgerRows[0].batchId, 'batch-p1', 'shadow ledger should preserve batchId');
assert.strictEqual(shadowLedgerRows[1].ledgerType, 'lesson_consume', 'lesson consume rows should get a ledgerType');
assert.strictEqual(shadowLedgerRows[2].ledgerType, 'member_booking_consume', 'member booking rows should get a ledgerType');

const readModelRows = buildFinanceNormalizedRowsFromLedgerRows([
  ...shadowLedgerRows,
  { ...shadowLedgerRows[0], id: 'voided-row', status: 'voided', cashDelta: 999999 }
]);

assert.strictEqual(readModelRows.length, financeRows.length, 'inactive ledger rows should not enter read model');
financeRows.forEach((expected, index) => {
  const actual = readModelRows[index];
  assert.strictEqual(actual.cashDelta, expected.cashDelta, `cashDelta should match for row ${expected.id}`);
  assert.strictEqual(actual.recognizedRevenueDelta, expected.recognizedRevenueDelta, `recognizedRevenueDelta should match for row ${expected.id}`);
  assert.strictEqual(actual.deferredRevenueDelta, expected.deferredRevenueDelta, `deferredRevenueDelta should match for row ${expected.id}`);
  assert.strictEqual(actual.operationId, expected.operationId, `operationId should match for row ${expected.id}`);
  assert.strictEqual(actual.batchId, expected.batchId, `batchId should match for row ${expected.id}`);
});

console.log('finance ledger read model tests passed');
