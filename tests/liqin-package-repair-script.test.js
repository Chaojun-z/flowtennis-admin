const assert = require('assert');

const {
  STUDENT_ID,
  INITIAL_PURCHASE_ID,
  INITIAL_ENTITLEMENT_ID,
  RENEWAL_PURCHASE_ID,
  RENEWAL_ENTITLEMENT_ID,
  CORRECT_LESSONS,
  buildPlan
} = require('../scripts/repair-liqin-package-20260525');

const oldRenewalLedgerId = 'old-renewal-20260323';
const oldWrongRenewalLedgerId = 'old-renewal-20260416';
const plan = buildPlan({
  purchases: [
    { id: INITIAL_PURCHASE_ID, studentId: STUDENT_ID },
    { id: RENEWAL_PURCHASE_ID, studentId: STUDENT_ID }
  ],
  entitlements: [
    { id: INITIAL_ENTITLEMENT_ID, studentId: STUDENT_ID, purchaseId: INITIAL_PURCHASE_ID, totalLessons: 10, usedLessons: 8, remainingLessons: 2 },
    { id: RENEWAL_ENTITLEMENT_ID, studentId: STUDENT_ID, purchaseId: RENEWAL_PURCHASE_ID, totalLessons: 50, usedLessons: 16, remainingLessons: 34 }
  ],
  schedule: [
    { id: CORRECT_LESSONS[0].scheduleId, studentIds: [STUDENT_ID], createdAt: 'keep-created' },
    { id: 'other-schedule', studentIds: [STUDENT_ID], startTime: '2026-04-01 09:00' }
  ],
  entitlementLedger: [
    { id: oldRenewalLedgerId, studentId: STUDENT_ID, entitlementId: RENEWAL_ENTITLEMENT_ID, relatedDate: '2026-03-23', lessonDelta: -1 },
    { id: oldWrongRenewalLedgerId, studentId: STUDENT_ID, entitlementId: RENEWAL_ENTITLEMENT_ID, relatedDate: '2026-04-16', lessonDelta: -1.5 },
    { id: CORRECT_LESSONS[1].id, studentId: STUDENT_ID, entitlementId: INITIAL_ENTITLEMENT_ID, createdAt: 'keep-ledger-created' }
  ]
});

assert.deepStrictEqual(
  plan.putEntitlements.map(row => ({ id: row.id, total: row.totalLessons, used: row.usedLessons, remaining: row.remainingLessons, status: row.status })),
  [
    { id: INITIAL_ENTITLEMENT_ID, total: 10, used: 10, remaining: 0, status: 'depleted' },
    { id: RENEWAL_ENTITLEMENT_ID, total: 50, used: 17, remaining: 33, status: 'active' }
  ]
);

assert.strictEqual(
  CORRECT_LESSONS.filter(row => row.entitlementId === RENEWAL_ENTITLEMENT_ID)
    .reduce((sum, row) => sum + Math.abs(Number(row.lessonDelta) || 0), 0),
  17,
  'renewal package should include every confirmed 50-lesson deduction through 2026-05-21'
);

assert.deepStrictEqual(
  plan.putSchedule.map(row => ({ id: row.id, startTime: row.startTime, endTime: row.endTime, venue: row.venue, entitlementId: row.entitlementId, lessonCount: row.lessonCount })),
  [...new Map(CORRECT_LESSONS.map(row => [row.scheduleId, row])).values()].map(row => ({
    id: row.scheduleId,
    startTime: row.startTime,
    endTime: row.endTime,
    venue: row.venue,
    entitlementId: row.entitlementId,
    lessonCount: CORRECT_LESSONS.filter(item => item.scheduleId === row.scheduleId).reduce((sum, item) => sum + Math.abs(Number(item.lessonDelta) || 0), 0)
  }))
);

assert.deepStrictEqual(
  plan.putLedger.map(row => ({ id: row.id, entitlementId: row.entitlementId, scheduleId: row.scheduleId, date: row.relatedDate, band: row.sourceTimeBand, delta: row.lessonDelta, venue: row.sourceVenue })),
  CORRECT_LESSONS.map(row => ({
    id: row.id,
    entitlementId: row.entitlementId,
    scheduleId: row.scheduleId,
    date: row.relatedDate,
    band: row.sourceTimeBand,
    delta: row.lessonDelta,
    venue: row.venue
  }))
);

assert.ok(plan.deleteLedger.includes(oldRenewalLedgerId), 'old 2026-03-23 renewal-only ledger should be removed before split rewrite');
assert.ok(plan.deleteLedger.includes(oldWrongRenewalLedgerId), 'old renewal ledger in the corrected date range should be rewritten from confirmed rows');
assert.deepStrictEqual(plan.putIndexes[0].entitlementIds, [RENEWAL_ENTITLEMENT_ID]);

console.log('liqin package repair script tests passed');
