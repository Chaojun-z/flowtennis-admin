const assert = require('assert');
const {
  STUDENT_ID,
  PURCHASE_ID,
  ENTITLEMENT_ID,
  PAID_LESSONS,
  FREE_LESSON,
  buildPlan
} = require('../scripts/repair-songtiti-package-20260523');

const plan = buildPlan({
  purchases: [{ id: PURCHASE_ID, studentId: STUDENT_ID, systemAmount: 0, finalAmount: 0, amountPaid: 0 }],
  entitlements: [{ id: ENTITLEMENT_ID, studentId: STUDENT_ID, purchaseId: PURCHASE_ID, totalLessons: 10, usedLessons: 10, remainingLessons: 0, status: 'depleted' }],
  schedule: [
    { id: '496bfa87-4a32-4f13-b9bb-ce7957ca921c', studentIds: [STUDENT_ID], startTime: '2026-05-22 12:30' },
    { id: 'b4d98154-ebc2-42a8-870d-13b1735b7181', studentIds: [STUDENT_ID], startTime: '2026-04-30 12:30', venue: '1号场' }
  ],
  entitlementLedger: [
    { id: 'wrong-423', studentId: STUDENT_ID, entitlementId: ENTITLEMENT_ID, relatedDate: '2026-04-23', lessonDelta: -2 },
    { id: 'wrong-522', studentId: STUDENT_ID, entitlementId: ENTITLEMENT_ID, scheduleId: '496bfa87-4a32-4f13-b9bb-ce7957ca921c', relatedDate: '2026-05-22', lessonDelta: -1 }
  ]
});

assert.deepStrictEqual(
  plan.putPurchases.map(row => ({ id: row.id, systemAmount: row.systemAmount, finalAmount: row.finalAmount, amountPaid: row.amountPaid })),
  [{ id: PURCHASE_ID, systemAmount: 5000, finalAmount: 4500, amountPaid: 4500 }]
);

assert.deepStrictEqual(
  plan.putEntitlements.map(row => ({ id: row.id, total: row.totalLessons, used: row.usedLessons, remaining: row.remainingLessons, status: row.status })),
  [{ id: ENTITLEMENT_ID, total: 10, used: 10, remaining: 0, status: 'depleted' }]
);

assert.strictEqual(plan.putLedger.filter(row => Number(row.lessonDelta) < 0).length, PAID_LESSONS.length);
assert.ok(plan.putLedger.some(row => row.id === FREE_LESSON.id && row.lessonDelta === 0 && row.action === 'free_lesson' && row.coach === '小宋'));
assert.ok(plan.putLedger.every(row => row.sourceVenue === '2号场'), 'all visible lesson rows should use court 2');
assert.ok(plan.putLedger.some(row => row.relatedDate === '2026-04-23' && row.sourceTimeBand === '12:30-13:30' && row.lessonDelta === -1), '4/23 should be corrected to one hour');
assert.ok(plan.putLedger.some(row => row.relatedDate === '2026-05-15' && row.lessonDelta === -1), '5/15 paid lesson should be added');
assert.ok(plan.putLedger.some(row => row.relatedDate === '2026-05-21' && row.lessonDelta === -1), '5/21 paid lesson should be added');
assert.ok(plan.deleteLedger.includes('wrong-423'), 'old two-hour 4/23 ledger should be removed');
assert.ok(plan.deleteLedger.includes('wrong-522'), '5/22 ledger should be removed');
assert.ok(plan.deleteSchedule.includes('496bfa87-4a32-4f13-b9bb-ce7957ca921c'), '5/22 schedule should be removed');
assert.deepStrictEqual(plan.putIndexes[0].entitlementIds, [], 'depleted package should not stay in active entitlement index');

console.log('songtiti package repair script tests passed');
