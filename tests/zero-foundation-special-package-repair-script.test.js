const assert = require('assert');
const repair = require('../scripts/repair-zero-foundation-special-package-20260806');

const master = {
  id: repair.MASTER_PACKAGE_ID,
  name: '专项课 · 【零基础】初阶专项课 · 1次 · 全天',
  courseType: '专项课',
  price: 199,
  lessons: 1,
  timeBand: '全天',
  campusIds: ['shunyi_mapo']
};

const source = {
  ...master,
  id: repair.SOURCE_PACKAGE_ID,
  price: 260
};

const purchases = ['pur-1', 'pur-2', 'pur-3', 'pur-4', 'pur-5'].map((id, index) => ({
  id,
  packageId: repair.SOURCE_PACKAGE_ID,
  packageName: source.name,
  studentId: `stu-${index + 1}`,
  packagePrice: 260,
  systemAmount: 260,
  finalAmount: 260,
  amountPaid: 260,
  priceOverridden: true,
  overrideReason: '价格写错'
}));

const entitlements = purchases.map((purchase, index) => ({
  id: `ent-${index + 1}`,
  purchaseId: purchase.id,
  studentId: purchase.studentId,
  packageId: repair.SOURCE_PACKAGE_ID,
  packageName: source.name,
  totalLessons: 1,
  usedLessons: index === 0 ? 0 : 1,
  remainingLessons: index === 0 ? 1 : 0,
  status: index === 0 ? 'active' : 'depleted'
}));

const plan = repair.buildRepairPlan({
  packages: [master, source],
  purchases,
  entitlements,
  entitlementLedger: [{ id: 'led-1', entitlementId: 'ent-2', purchaseId: 'pur-2', packageName: source.name }],
  schedule: [{ id: 'sch-1', entitlementId: 'ent-1', packageName: source.name }],
  activeEntitlementIndex: []
}, '2026-08-06T08:00:00.000Z');

assert.deepStrictEqual(plan.blockers, [], 'expected package repair plan should not have blockers');
assert.strictEqual(plan.updates.purchases.length, 5, 'all 260 purchases should be repaired');
assert.ok(plan.updates.purchases.every(item => item.after.packageId === repair.MASTER_PACKAGE_ID), 'purchases should move to 199 package');
assert.ok(plan.updates.purchases.every(item => item.after.amountPaid === 199 && item.after.finalAmount === 199 && item.after.systemAmount === 199 && item.after.packagePrice === 199), 'purchase amounts should all become 199');
assert.ok(plan.updates.purchases.every(item => !('priceOverridden' in item.after) && !('overrideReason' in item.after)), 'wrong override fields should be cleared after amount correction');
assert.ok(plan.updates.entitlements.every(item => item.after.packageId === repair.MASTER_PACKAGE_ID), 'entitlements should move to 199 package');
assert.strictEqual(plan.updates.packages[0].after.status, 'merged', 'wrong 260 package should be hidden as merged');
assert.strictEqual(plan.updates.entitlementLedger[0].after.packageId, repair.MASTER_PACKAGE_ID, 'ledger package snapshot should move to 199 package');
assert.strictEqual(plan.updates.schedule[0].after.packageId, repair.MASTER_PACKAGE_ID, 'schedule package snapshot should move to 199 package');
assert.deepStrictEqual(
  plan.updates.activeEntitlementIndex.find(item => item.after.studentId === 'stu-1').after.entitlementIds,
  ['ent-1'],
  'active entitlement index should keep remaining active moved entitlement'
);

console.log('zero foundation special package repair script tests passed');
