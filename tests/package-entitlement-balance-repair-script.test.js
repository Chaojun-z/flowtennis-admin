const assert = require('assert');
const repair = require('../scripts/repair-package-entitlement-balances-20260601');

const now = '2026-06-01 12:00:00';
const reportRows = [
  {
    studentName: '可修一',
    entitlementId: 'ent-1',
    currentUsedLessons: 10,
    currentRemainingLessons: 0,
    targetUsedLessons: 2,
    targetRemainingLessons: 8,
    canFixByEntitlementOnly: true
  },
  {
    studentName: '可修二',
    entitlementId: 'ent-2',
    currentUsedLessons: 2,
    currentRemainingLessons: 8,
    targetUsedLessons: 7,
    targetRemainingLessons: 3,
    canFixByEntitlementOnly: true
  },
  {
    studentName: '先查流水',
    entitlementId: 'ent-3',
    currentUsedLessons: 10,
    currentRemainingLessons: 0,
    targetUsedLessons: 10,
    targetRemainingLessons: 0,
    canFixByEntitlementOnly: false
  }
];

const entitlements = [
  { id: 'ent-1', studentId: 'stu-1', status: 'depleted', usedLessons: 10, remainingLessons: 0 },
  { id: 'ent-2', studentId: 'stu-2', status: 'active', usedLessons: 2, remainingLessons: 8 },
  { id: 'ent-3', studentId: 'stu-3', status: 'active', usedLessons: 10, remainingLessons: 0 }
];

const plan = repair.buildRepairPlan({ reportRows, entitlements, now, operationId: 'op-test' });
assert.strictEqual(plan.updates.length, 2, 'script should only update rows marked fixable by dry-run');
assert.strictEqual(plan.skipped.length, 1, 'script should skip rows that need ledger review');
assert.strictEqual(plan.blockers.length, 0, 'matching dry-run values should not block');
assert.deepStrictEqual(
  plan.updates.map((item) => [item.after.id, item.after.usedLessons, item.after.remainingLessons, item.after.status]),
  [['ent-1', 2, 8, 'active'], ['ent-2', 7, 3, 'active']],
  'script should update used/remaining lessons and active status'
);
assert.ok(plan.updates.every((item) => item.after.operationId === 'op-test' && item.after.operationType === 'package-entitlement-balance-repair'), 'script should stamp operation trace fields');
assert.deepStrictEqual(plan.indexRows.map((row) => row.id).sort(), ['stu-1', 'stu-2'], 'script should refresh affected student active entitlement index rows');

const stalePlan = repair.buildRepairPlan({
  reportRows,
  entitlements: [{ ...entitlements[0], remainingLessons: 1 }, entitlements[1], entitlements[2]],
  now
});
assert.ok(stalePlan.blockers.some((item) => item.entitlementId === 'ent-1'), 'script should block when live entitlement no longer matches dry-run');

console.log('package entitlement balance repair script tests passed');
