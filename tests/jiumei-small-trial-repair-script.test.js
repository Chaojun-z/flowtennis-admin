const assert = require('assert');
const {
  buildPlan,
  STUDENT_ID,
  PURCHASE_ID,
  ENTITLEMENT_ID,
  LEDGER_ID,
  SCHEDULE_ID,
  PACKAGE_NAME
} = require('../scripts/repair-jiumei-small-trial-count-20260606');

const plan = buildPlan({
  purchases: [{ id: PURCHASE_ID, studentId: STUDENT_ID, studentName: '九妹', courseType: '体验课', packageName: '体验课 · 2课时 · 全天', packageLessons: 2 }],
  entitlements: [{ id: ENTITLEMENT_ID, purchaseId: PURCHASE_ID, studentId: STUDENT_ID, studentName: '九妹', courseType: '体验课', packageName: '体验课 · 2课时 · 全天', totalLessons: 2, usedLessons: 1.5, remainingLessons: 0.5 }],
  entitlementLedger: [{ id: LEDGER_ID, entitlementId: ENTITLEMENT_ID, studentId: STUDENT_ID, scheduleId: SCHEDULE_ID, lessonDelta: -1.5 }],
  schedule: [{ id: SCHEDULE_ID, studentIds: [STUDENT_ID], studentName: '九妹', courseType: '体验课', experienceType: '私教体验课', lessonCount: 1.5, packageName: '私教体验课 · 2课时 · 全天' }],
  activeEntitlementIndex: [{ id: STUDENT_ID, studentId: STUDENT_ID, entitlementIds: [ENTITLEMENT_ID] }]
}, '2026-06-06T00:00:00.000Z');

assert.deepStrictEqual(
  plan.putEntitlements.map(row => ({ id: row.id, packageName: row.packageName, experienceType: row.experienceType, used: row.usedLessons, remaining: row.remainingLessons, total: row.totalLessons })),
  [{ id: ENTITLEMENT_ID, packageName: PACKAGE_NAME, experienceType: '小班体验课', used: 1, remaining: 1, total: 2 }]
);

assert.deepStrictEqual(
  plan.putLedger.map(row => ({ id: row.id, scheduleId: row.scheduleId, delta: row.lessonDelta })),
  [{ id: LEDGER_ID, scheduleId: SCHEDULE_ID, delta: -1 }]
);

assert.deepStrictEqual(
  plan.putSchedule.map(row => ({ id: row.id, experienceType: row.experienceType, lessonCount: row.lessonCount, packageName: row.packageName })),
  [{ id: SCHEDULE_ID, experienceType: '小班体验课', lessonCount: 1.5, packageName: PACKAGE_NAME }]
);

assert.strictEqual(plan.putPurchases[0].packageName, PACKAGE_NAME);
assert.deepStrictEqual(plan.putIndexes[0].entitlementIds, [ENTITLEMENT_ID]);

console.log('jiumei small trial repair script tests passed');
