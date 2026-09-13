const assert = require('assert');

const {
  TARGETS,
  buildExtraMembersCleanupPlan,
  reportSafePlan
} = require('../scripts/cleanup-extra-members-20260913.js');

assert.deepStrictEqual(
  TARGETS.map((item) => item.courtId),
  [
    'third-party-court-a4708ae3-fd29-4b3a-9cfe-ca8ac4f75530',
    '3d9a8fef-bc2c-48de-833f-be807ce21fd7'
  ],
  'cleanup should be locked to the two confirmed extra member rows'
);

const now = '2026-09-13T10:00:00.000Z';
const plan = buildExtraMembersCleanupPlan({
  now,
  courts: [
    { id: TARGETS[0].courtId, name: '翟建阳', phone: '16600221145', status: 'active', cachedBalance: 0 },
    { id: TARGETS[1].courtId, name: '张老师（巡天老鼠）', phone: '', status: 'active', cachedBalance: 0 },
    { id: 'cxe-member-court-cb9470f0184bfd2c56045e28', name: '翟建阳', phone: '16600221145', status: 'active', cachedBalance: 816 },
    { id: 'bee385bd-7e5f-4a1d-8dcb-f3a5797bbd7a', name: '张老师', phone: '13552134770', status: 'active', cachedBalance: 638 }
  ],
  membershipAccounts: [
    { id: TARGETS[0].accountId, courtId: TARGETS[0].courtId, status: 'active' },
    { id: TARGETS[1].accountId, courtId: TARGETS[1].courtId, status: 'active' },
    { id: 'keep-zjy', courtId: 'cxe-member-court-cb9470f0184bfd2c56045e28', status: 'active' },
    { id: 'keep-zhang', courtId: 'bee385bd-7e5f-4a1d-8dcb-f3a5797bbd7a', status: 'active' }
  ],
  membershipOrders: [
    { id: 'order-extra', courtId: TARGETS[0].courtId, membershipAccountId: TARGETS[0].accountId, status: 'active' },
    { id: 'order-keep', courtId: 'bee385bd-7e5f-4a1d-8dcb-f3a5797bbd7a', membershipAccountId: 'keep-zhang', status: 'active' }
  ],
  membershipBenefitLedger: [
    { id: 'benefit-extra', courtId: TARGETS[1].courtId, membershipAccountId: TARGETS[1].accountId, status: 'active' }
  ],
  membershipAccountEvents: []
});

assert.strictEqual(plan.ok, true);
assert.deepStrictEqual(plan.errors, []);
assert.deepStrictEqual(plan.courtUpdates.map((item) => item.id).sort(), TARGETS.map((item) => item.courtId).sort());
assert.ok(plan.courtUpdates.every((item) => item.after.status === 'inactive' && item.after.noRestore === true && item.after.permanentlyVoidedAt === now));
assert.deepStrictEqual(plan.accountUpdates.map((item) => item.id).sort(), TARGETS.map((item) => item.accountId).sort());
assert.ok(plan.accountUpdates.every((item) => item.after.status === 'voided' && item.after.noRestore === true));
assert.deepStrictEqual(plan.orderUpdates.map((item) => item.id), ['order-extra']);
assert.strictEqual(plan.orderUpdates[0].after.status, 'voided');
assert.deepStrictEqual(plan.benefitLedgerUpdates.map((item) => item.id), ['benefit-extra']);
assert.strictEqual(plan.benefitLedgerUpdates[0].after.status, 'voided');
assert.deepStrictEqual(plan.indexDeletes.sort(), TARGETS.map((item) => item.courtId).sort());
assert.strictEqual(plan.eventCreates.length, 2);
assert.ok(!plan.accountUpdates.some((item) => item.id === 'keep-zjy' || item.id === 'keep-zhang'), 'valid member accounts must not be touched');

const safe = reportSafePlan(plan);
assert.strictEqual(safe.courtUpdates[0].noRestore, true);
assert.strictEqual(safe.accountUpdates[0].afterStatus, 'voided');

const blocked = buildExtraMembersCleanupPlan({
  now,
  courts: [{ id: TARGETS[0].courtId, name: '翟建阳', phone: '16600221145' }],
  membershipAccounts: [{ id: TARGETS[0].accountId, courtId: 'wrong-court', status: 'active' }]
});
assert.strictEqual(blocked.ok, false, 'cleanup should block when the account is not bound to the expected court');

console.log('cleanup extra members script tests passed');
