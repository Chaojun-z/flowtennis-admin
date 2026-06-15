const assert = require('assert');
const fs = require('fs');
const path = require('path');
const api = require('../api/index.js');

const rules = api._test;

assert.ok(rules.buildOperationTrace, 'api._test should expose operation trace builder');
assert.ok(rules.withOperationTrace, 'api._test should expose operation trace applier');
assert.ok(rules.stampCourtHistoryOperationTrace, 'api._test should expose court history operation trace stamper');

const trace = rules.buildOperationTrace({
  operationType: 'package-purchase',
  operator: '管理员',
  now: '2026-05-31T12:00:00.000Z',
  idFactory: () => 'op-001'
});

assert.deepStrictEqual(trace, {
  operationId: 'op-001',
  batchId: 'batch-op-001',
  operationType: 'package-purchase',
  operationAt: '2026-05-31T12:00:00.000Z',
  operationBy: '管理员'
});

const purchase = rules.buildPurchaseRecord(
  { id: 'pkg-1', name: '成人10节', price: 4000, lessons: 10, validDays: 100 },
  { purchaseDate: '2026-05-31', amountPaid: 4000 },
  { id: 'stu-1', name: '学员A', phone: '13800138000' },
  { id: 'pur-1', now: '2026-05-31T12:00:00.000Z', operator: '管理员', operationTrace: trace }
);
const entitlement = rules.buildEntitlementFromPurchase(
  { id: 'pkg-1', name: '成人10节', lessons: 10, validDays: 100 },
  purchase,
  { id: 'stu-1', name: '学员A' },
  'ent-1',
  '2026-05-31T12:00:00.000Z'
);

assert.strictEqual(purchase.operationId, 'op-001');
assert.strictEqual(purchase.batchId, 'batch-op-001');
assert.strictEqual(entitlement.operationId, 'op-001');
assert.strictEqual(entitlement.batchId, 'batch-op-001');

const membership = rules.buildMembershipPurchase({
  court: { id: 'court-1', name: '会员A', phone: '13800138000', history: [] },
  plan: { id: 'mplan-1', name: '黄金卡', rechargeAmount: 5000, discountRate: 0.8, bonusAmount: 498, ballMachineCount: 1, validMonths: 12, maxMonths: 24 },
  body: { purchaseDate: '2026-05-31', operator: '管理员' },
  now: '2026-05-31T12:00:00.000Z',
  accountId: 'macc-1',
  orderId: 'mord-1',
  historyId: 'his-1',
  operationTrace: trace
});
const grantRows = rules.buildMembershipGrantLedgerRows(membership.order, {
  idFactory: () => 'mled-1',
  now: '2026-05-31T12:00:00.000Z'
});

assert.strictEqual(membership.account.operationId, 'op-001');
assert.strictEqual(membership.order.operationId, 'op-001');
assert.strictEqual(membership.historyRow.operationId, 'op-001');
assert.strictEqual(grantRows[0].operationId, 'op-001');
assert.strictEqual(grantRows[0].batchId, 'batch-op-001');

const stampedCourt = rules.stampCourtHistoryOperationTrace({
  previousCourt: {
    id: 'court-1',
    history: [{ id: 'old', type: '消费', category: '订场', amount: 100, operationId: 'existing-op' }]
  },
  nextCourt: {
    id: 'court-1',
    history: [
      { id: 'old', type: '消费', category: '订场', amount: 100, operationId: 'existing-op' },
      { id: 'new', type: '消费', category: '订场', amount: 200 }
    ]
  },
  operationTrace: trace
});

assert.strictEqual(stampedCourt.history[0].operationId, 'existing-op', 'unchanged history rows should keep existing trace');
assert.strictEqual(stampedCourt.history[1].operationId, 'op-001', 'new finance history rows should get operation trace');
assert.strictEqual(stampedCourt.history[1].batchId, 'batch-op-001');

const apiSource = fs.readFileSync(path.join(__dirname, '..', 'api', 'index.js'), 'utf8');
const courtRoutesSource = fs.readFileSync(path.join(__dirname, '..', 'api', 'courts-routes.js'), 'utf8');
const membershipRoutesSource = fs.readFileSync(path.join(__dirname, '..', 'api', 'membership-routes.js'), 'utf8');
assert.match(apiSource, /buildOperationTrace\(\{operationType:'package-purchase'/, 'package purchase route should create operation trace');
assert.match(apiSource, /buildOperationTrace\(\{operationType:'lesson-consume'/, 'schedule write route should create operation trace');
assert.match(membershipRoutesSource, /buildOperationTrace\(\{operationType:'membership-recharge'/, 'membership recharge route should create operation trace');
assert.match(courtRoutesSource, /stampCourtHistoryOperationTrace/, 'court write route should stamp court history operation trace');

console.log('finance operation trace tests passed');
