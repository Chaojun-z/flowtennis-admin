const assert = require('assert');
const { buildPlan } = require('../scripts/repair-yaya-xiaoman-20260522.js');

const plan = buildPlan({
  purchases: [
    { id: 'seed-purchase-007', studentId: 'seed-student-007', packageLessons: 10, amountPaid: 4000, status: 'active' },
    { id: 'seed-renewal-007', studentId: 'seed-student-007', packageLessons: 10, amountPaid: 4800, status: 'active' }
  ],
  entitlements: [
    { id: 'seed-entitlement-007', purchaseId: 'seed-purchase-007', studentId: 'seed-student-007', totalLessons: 10, usedLessons: 10, remainingLessons: 10, status: 'active' },
    { id: 'seed-renewal-entitlement-007', purchaseId: 'seed-renewal-007', studentId: 'seed-student-007', totalLessons: 10, usedLessons: 15, remainingLessons: 0, status: 'voided' },
    { id: 'gold', studentId: 'seed-student-007', remainingLessons: 13, status: 'active' },
    { id: 'nonprime', studentId: 'seed-student-007', remainingLessons: 13, status: 'active' }
  ],
  entitlementLedger: [
    { id: 'old-yaya', studentId: 'seed-student-007', entitlementId: 'seed-entitlement-007', purchaseId: 'seed-purchase-007' },
    { id: 'old-xiaoman', studentId: 'a4fa15c6-f8b6-4dab-aa69-cc4e472f9d98', entitlementId: '14dae6fd-8a77-48cd-83b8-8b7f5f41aada', scheduleId: '9fe725d8-c2dd-4240-91ec-fb72c4689442' }
  ],
  schedule: [{ id: '9fe725d8-c2dd-4240-91ec-fb72c4689442' }],
  feedbacks: [{ id: 'feedback-xiaoman', scheduleId: '9fe725d8-c2dd-4240-91ec-fb72c4689442' }]
});

assert.strictEqual(plan.putPurchases.find(row => row.id === 'seed-purchase-007').status, 'voided');
assert.deepStrictEqual(
  plan.putEntitlements.find(row => row.id === 'seed-entitlement-007'),
  {
    id: 'seed-entitlement-007',
    purchaseId: 'seed-purchase-007',
    studentId: 'seed-student-007',
    totalLessons: 20,
    usedLessons: 20,
    remainingLessons: 0,
    status: 'voided',
    voidReason: '2026-01-19 首包20课时已用完，隐藏历史余额',
    updatedAt: plan.putEntitlements.find(row => row.id === 'seed-entitlement-007').updatedAt,
    notes: '2026/01/19 首次购买20课时，已用完'
  }
);
assert.ok(plan.deleteLedger.includes('old-yaya'));
assert.ok(plan.deleteLedger.includes('old-xiaoman'));
assert.ok(plan.deleteSchedule.includes('9fe725d8-c2dd-4240-91ec-fb72c4689442'));
assert.ok(plan.deleteFeedbacks.includes('feedback-xiaoman'));
assert.deepStrictEqual(plan.putIndexes[0].entitlementIds.sort(), ['gold', 'nonprime']);

console.log('repair yaya xiaoman script tests passed');
