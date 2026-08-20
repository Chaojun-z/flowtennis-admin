const assert = require('assert');

const {
  DUPLICATE_MEMBERSHIP_TARGETS,
  buildDuplicateMembershipCleanupPlan
} = require('../scripts/cleanup-duplicate-memberships-20260820.js');

assert.deepStrictEqual(
  DUPLICATE_MEMBERSHIP_TARGETS.map((item) => item.courtId),
  ['member-reconcile-court-f5998ae128e29ffc', 'c0c73176-1e1c-4fc8-849e-b821789da154'],
  'cleanup should be locked to the two confirmed duplicate membership rows'
);

const now = '2026-08-20T09:30:00.000Z';
const plan = buildDuplicateMembershipCleanupPlan({
  now,
  courts: [
    { id: 'member-reconcile-court-f5998ae128e29ffc', name: '秋明', phone: '13911851999', status: 'active', cachedBalance: 0 },
    { id: 'c0c73176-1e1c-4fc8-849e-b821789da154', name: '许女士', phone: '15101648989', status: 'active', cachedBalance: 0 }
  ],
  membershipAccounts: [
    { id: 'account-qm', courtId: 'member-reconcile-court-f5998ae128e29ffc', status: 'active' },
    { id: 'account-xu', courtId: 'c0c73176-1e1c-4fc8-849e-b821789da154', status: 'active' },
    { id: 'account-xu-old', courtId: 'c0c73176-1e1c-4fc8-849e-b821789da154', status: 'voided' }
  ],
  membershipOrders: [
    { id: 'order-xu', courtId: 'c0c73176-1e1c-4fc8-849e-b821789da154', membershipAccountId: 'account-xu', status: 'active' }
  ],
  membershipAccountEvents: []
});

assert.strictEqual(plan.ok, true);
assert.deepStrictEqual(plan.errors, []);
assert.deepStrictEqual(plan.courtUpdates.map((item) => item.id).sort(), DUPLICATE_MEMBERSHIP_TARGETS.map((item) => item.courtId).sort());
assert.ok(plan.courtUpdates.every((item) => item.after.status === 'inactive' && item.after.deletedAt === now));
assert.deepStrictEqual(plan.accountUpdates.map((item) => item.id).sort(), ['account-qm', 'account-xu']);
assert.ok(plan.accountUpdates.every((item) => item.after.status === 'cleared'));
assert.deepStrictEqual(plan.orderUpdates.map((item) => item.id), ['order-xu']);
assert.strictEqual(plan.orderUpdates[0].after.status, 'voided');
assert.deepStrictEqual(plan.indexDeletes.sort(), DUPLICATE_MEMBERSHIP_TARGETS.map((item) => item.courtId).sort());
assert.strictEqual(plan.eventCreates.length, 2);

console.log('cleanup duplicate memberships script tests passed');
