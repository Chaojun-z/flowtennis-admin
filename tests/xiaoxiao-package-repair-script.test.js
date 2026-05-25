const assert = require('assert');

const {
  STUDENT_ID,
  PURCHASE_ID,
  ENTITLEMENT_ID,
  DUPLICATE_LEDGER_ID,
  CORRECT_LESSONS,
  buildPlan
} = require('../scripts/repair-xiaoxiao-package-20260525');

const plan = buildPlan({
  purchases: [{ id: PURCHASE_ID, studentId: STUDENT_ID, studentName: '笑笑' }],
  entitlements: [{ id: ENTITLEMENT_ID, studentId: STUDENT_ID, purchaseId: PURCHASE_ID, totalLessons: 10, usedLessons: 5, remainingLessons: 5, status: 'active' }],
  schedule: [
    { id: 'sch-516', studentIds: [STUDENT_ID], startTime: '2026-05-16 09:00', endTime: '2026-05-16 10:00', venue: '4号场', coach: 'Siren' },
    { id: 'sch-524', studentIds: [STUDENT_ID], startTime: '2026-05-24 15:00', endTime: '2026-05-24 16:00', venue: '3号场', coach: 'Siren' }
  ],
  entitlementLedger: [
    { id: CORRECT_LESSONS[0].id, studentId: STUDENT_ID, entitlementId: ENTITLEMENT_ID, relatedDate: '2026-05-02', sourceTimeBand: '15:00-16:00', lessonDelta: -1 },
    { id: CORRECT_LESSONS[1].id, studentId: STUDENT_ID, entitlementId: ENTITLEMENT_ID, relatedDate: '2026-05-04', sourceTimeBand: '10:00-11:00', lessonDelta: -1 },
    { id: CORRECT_LESSONS[2].id, studentId: STUDENT_ID, entitlementId: ENTITLEMENT_ID, scheduleId: 'sch-516', lessonDelta: -1 },
    { id: CORRECT_LESSONS[3].id, studentId: STUDENT_ID, entitlementId: ENTITLEMENT_ID, scheduleId: 'sch-524', lessonDelta: -1 },
    { id: DUPLICATE_LEDGER_ID, studentId: STUDENT_ID, entitlementId: ENTITLEMENT_ID, relatedDate: '2026-05-16', sourceTimeBand: '9-10点', lessonDelta: -1 }
  ]
});

assert.deepStrictEqual(
  plan.putEntitlements.map(row => ({ id: row.id, total: row.totalLessons, used: row.usedLessons, remaining: row.remainingLessons, status: row.status })),
  [{ id: ENTITLEMENT_ID, total: 10, used: 4, remaining: 6, status: 'active' }]
);

assert.deepStrictEqual(
  plan.putLedger.map(row => ({ id: row.id, date: row.relatedDate, band: row.sourceTimeBand, venue: row.sourceVenue, coach: row.coach, delta: row.lessonDelta })),
  CORRECT_LESSONS.map(row => ({ id: row.id, date: row.relatedDate, band: row.sourceTimeBand, venue: row.venue, coach: 'Siren', delta: -1 }))
);

assert.deepStrictEqual(plan.deleteLedger, [DUPLICATE_LEDGER_ID]);
assert.deepStrictEqual(plan.putIndexes[0].entitlementIds, [ENTITLEMENT_ID]);

console.log('xiaoxiao package repair script tests passed');
