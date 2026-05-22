const assert = require('assert');

const {
  XIAOMAN_STUDENT_ID,
  ACTIVE_PURCHASE_ID,
  ACTIVE_ENTITLEMENT_ID,
  CORRECT_LESSONS,
  buildPlan
} = require('../scripts/repair-xiaoman-package-20260522');

const plan = buildPlan({
  purchases: [{ id: ACTIVE_PURCHASE_ID, studentId: XIAOMAN_STUDENT_ID, amountPaid: 10400 }],
  entitlements: [{ id: ACTIVE_ENTITLEMENT_ID, studentId: XIAOMAN_STUDENT_ID, purchaseId: ACTIVE_PURCHASE_ID, totalLessons: 20, usedLessons: 10, remainingLessons: 10 }],
  schedule: [
    { id: 'old-wrong', studentIds: [XIAOMAN_STUDENT_ID], entitlementId: 'old-ent' },
    { id: CORRECT_LESSONS[2].scheduleId, studentIds: [XIAOMAN_STUDENT_ID], createdAt: 'keep-created' }
  ],
  entitlementLedger: [
    { id: 'old-ledger', studentId: XIAOMAN_STUDENT_ID, entitlementId: 'old-ent' },
    { id: CORRECT_LESSONS[0].id, studentId: XIAOMAN_STUDENT_ID, entitlementId: ACTIVE_ENTITLEMENT_ID, createdAt: 'keep-ledger-created' }
  ]
});

assert.deepStrictEqual(
  plan.putEntitlements.map(row => ({ id: row.id, total: row.totalLessons, used: row.usedLessons, remaining: row.remainingLessons, status: row.status })),
  [{ id: ACTIVE_ENTITLEMENT_ID, total: 20, used: 6, remaining: 14, status: 'active' }]
);

assert.deepStrictEqual(
  plan.putPurchases.map(row => ({ id: row.id, purchaseDate: row.purchaseDate, systemAmount: row.systemAmount, amountPaid: row.amountPaid, lessons: row.packageLessons, coach: row.ownerCoach })),
  [{ id: ACTIVE_PURCHASE_ID, purchaseDate: '2026-04-21', systemAmount: 12000, amountPaid: 10400, lessons: 20, coach: '朝珺' }]
);

assert.deepStrictEqual(
  plan.putSchedule.map(row => ({ id: row.id, startTime: row.startTime, endTime: row.endTime, venue: row.venue, entitlementId: row.entitlementId })),
  [
    { id: 'xiaoman-correct-schedule-20260426-1300', startTime: '2026-04-26 13:00', endTime: '2026-04-26 15:00', venue: '1号场', entitlementId: ACTIVE_ENTITLEMENT_ID },
    { id: 'xiaoman-correct-schedule-20260510-1230', startTime: '2026-05-10 12:30', endTime: '2026-05-10 14:30', venue: '2号场', entitlementId: ACTIVE_ENTITLEMENT_ID },
    { id: '1544b795-3344-4e64-96ac-c4722b316eca', startTime: '2026-05-17 13:00', endTime: '2026-05-17 15:00', venue: '2号场', entitlementId: ACTIVE_ENTITLEMENT_ID }
  ]
);

assert.deepStrictEqual(
  plan.putLedger.map(row => ({ id: row.id, scheduleId: row.scheduleId, delta: row.lessonDelta, sourceVenue: row.sourceVenue })),
  [
    { id: 'xiaoman-correct-lesson-20260426-1300', scheduleId: 'xiaoman-correct-schedule-20260426-1300', delta: -2, sourceVenue: '1号场' },
    { id: 'xiaoman-correct-lesson-20260510-1230', scheduleId: 'xiaoman-correct-schedule-20260510-1230', delta: -2, sourceVenue: '2号场' },
    { id: 'xiaoman-correct-lesson-20260517-1300', scheduleId: '1544b795-3344-4e64-96ac-c4722b316eca', delta: -2, sourceVenue: '2号场' }
  ]
);

assert.deepStrictEqual(plan.deleteSchedule, ['old-wrong']);
assert.deepStrictEqual(plan.deleteLedger, ['old-ledger']);
assert.deepStrictEqual(plan.putIndexes[0].entitlementIds, [ACTIVE_ENTITLEMENT_ID]);

console.log('xiaoman package repair script tests passed');
