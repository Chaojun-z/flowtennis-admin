const assert = require('assert');
const { buildPlan, TARGETS, PACKAGE_NAME } = require('../scripts/repair-small-trial-count-orders-20260606');

const data = {
  purchases: TARGETS.map(t => ({ id: t.purchaseId, studentId: t.studentId, studentName: t.studentName, courseType: '体验课', packageName: '体验课 · 2课时 · 全天', packageLessons: 2 })),
  entitlements: TARGETS.map(t => ({ id: t.entitlementId, purchaseId: t.purchaseId, studentId: t.studentId, studentName: t.studentName, courseType: '体验课', packageName: '体验课 · 2课时 · 全天', totalLessons: 2, usedLessons: 0, remainingLessons: 2 })),
  entitlementLedger: TARGETS.filter(t => t.ledgerId).map(t => ({ id: t.ledgerId, entitlementId: t.entitlementId, studentId: t.studentId, scheduleId: t.scheduleId, lessonDelta: -1.5 })),
  schedule: TARGETS.filter(t => t.scheduleId).map(t => ({ id: t.scheduleId, studentIds: [t.studentId], studentName: t.studentName, courseType: '体验课', experienceType: '私教体验课', lessonCount: 1.5, packageName: '私教体验课 · 2课时 · 全天' })),
  activeEntitlementIndex: TARGETS.map(t => ({ id: t.studentId, studentId: t.studentId, entitlementIds: [t.entitlementId] }))
};

const plan = buildPlan(data, '2026-06-06T00:00:00.000Z');

assert.deepStrictEqual(
  plan.putPurchases.map(row => ({ studentName: row.studentName, packageName: row.packageName, experienceType: row.experienceType, total: row.totalLessons })),
  TARGETS.map(t => ({ studentName: t.studentName, packageName: PACKAGE_NAME, experienceType: '小班体验课', total: 2 }))
);

assert.deepStrictEqual(
  plan.putEntitlements.map(row => ({ studentName: row.studentName, packageName: row.packageName, experienceType: row.experienceType, used: row.usedLessons, remaining: row.remainingLessons, total: row.totalLessons })),
  TARGETS.map(t => ({ studentName: t.studentName, packageName: PACKAGE_NAME, experienceType: '小班体验课', used: t.usedLessons, remaining: t.remainingLessons, total: 2 }))
);

assert.deepStrictEqual(plan.putLedger.map(row => ({ studentName: row.studentName, delta: row.lessonDelta })), [{ studentName: '九妹', delta: -1 }]);
assert.deepStrictEqual(plan.putSchedule.map(row => ({ studentName: row.studentName, experienceType: row.experienceType, lessonCount: row.lessonCount })), [{ studentName: '九妹', experienceType: '小班体验课', lessonCount: 1.5 }]);
assert.deepStrictEqual(plan.putIndexes.map(row => row.entitlementIds[0]), TARGETS.map(t => t.entitlementId));

console.log('small trial count orders repair script tests passed');
