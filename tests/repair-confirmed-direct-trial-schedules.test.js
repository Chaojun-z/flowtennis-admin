const assert = require('assert');
const repair = require('../scripts/repair-confirmed-direct-trial-schedules-20260920.js');

assert.strictEqual(repair.TARGETS.length, 22, '必须只包含用户确认的 22 条体验课');
assert.strictEqual(repair.TARGETS.filter(item => item.gift).length, 1, '只有黄深是免费体验并单独收场地费');
assert.strictEqual(repair.TARGETS.filter(item => !item.gift).reduce((sum, item) => sum + item.amount, 0), 4859, '直接收款金额合计必须与用户确认一致');

const schedule = (id, studentId, overrides = {}) => ({
  id,
  studentId,
  studentIds: [studentId],
  studentName: '测试学员',
  courseType: '体验课',
  settlementType: 'package',
  paymentType: 'package',
  packageName: '错误课包绑定',
  entitlementId: 'wrong-entitlement',
  entitlementIds: ['wrong-entitlement'],
  purchaseId: 'wrong-purchase',
  studentSettlementRows: [{ studentId, settlementType: 'package', entitlementId: 'wrong-entitlement' }],
  startTime: '2026-04-02 12:00',
  endTime: '2026-04-02 13:00',
  status: '已结束',
  ...overrides
});

const directTarget = repair.TARGETS.find(item => !item.gift);
const giftTarget = repair.TARGETS.find(item => item.gift);
const plan = repair.buildPlan({
  schedules: [schedule(directTarget.scheduleId, directTarget.studentId), schedule(giftTarget.scheduleId, giftTarget.studentId)],
  ledgers: [],
  financialLedgers: [],
  now: '2026-09-20T00:00:00.000Z',
  targets: [directTarget, giftTarget]
});
assert.deepStrictEqual(plan.blockers, []);
assert.strictEqual(plan.schedulePuts.length, 2);
const direct = plan.schedulePuts.find(item => item.id === directTarget.scheduleId).after;
assert.strictEqual(direct.settlementType, 'direct');
assert.strictEqual(direct.payMethod, '大众点评');
assert.strictEqual(direct.paidAmount, directTarget.amount);
assert.deepStrictEqual(direct.entitlementIds, []);
assert.strictEqual(direct.studentSettlementRows[0].entitlementId, '');
const gift = plan.schedulePuts.find(item => item.id === giftTarget.scheduleId).after;
assert.strictEqual(gift.settlementType, 'gift');
assert.strictEqual(gift.requiresFieldFee, true);
assert.strictEqual(gift.fieldFeeAmount, 220);
assert.strictEqual(gift.studentSettlementRows[0].fieldFeeMode, 'separate');
assert.strictEqual(plan.financialLedgerPuts.length, 1);
assert.strictEqual(plan.financialLedgerPuts[0].after.cashDelta, 22000);

const blocked = repair.buildPlan({
  schedules: [schedule(directTarget.scheduleId, directTarget.studentId)],
  ledgers: [{ scheduleId: directTarget.scheduleId, lessonDelta: -1 }],
  financialLedgers: [],
  now: '2026-09-20T00:00:00.000Z',
  targets: [directTarget]
});
assert.match(blocked.blockers.join('；'), /已有消课流水/);

console.log('repair confirmed direct trial schedules tests passed');
