const assert = require('assert');

const {
  IDS,
  LIQIN_LESSON_UPDATES,
  buildPlan
} = require('../scripts/repair-course-package-five-students-20260528');

const now = '2026-05-28T12:00:00.000Z';

const entitlements = Object.values(IDS.entitlements).map((id) => ({
  id,
  studentId: id.includes('李嵚') ? IDS.students.liqin : id.includes('丫丫') || id.includes('8caf') ? IDS.students.yaya : '',
  totalLessons: 10,
  usedLessons: 10,
  remainingLessons: 0,
  status: 'active'
}));

entitlements.push(
  { id: IDS.entitlements.yayaGold, studentId: IDS.students.yaya, totalLessons: 20, usedLessons: 14, remainingLessons: 6, status: 'active' },
  { id: IDS.entitlements.yayaNonprime, studentId: IDS.students.yaya, totalLessons: 20, usedLessons: 14, remainingLessons: 6, status: 'active' }
);

const liqinRows = LIQIN_LESSON_UPDATES.map((row) => ({
  id: row.ledgerId,
  scheduleId: row.scheduleId,
  studentId: IDS.students.liqin,
  entitlementId: row.entitlementId,
  purchaseId: row.purchaseId,
  lessonDelta: -999,
  recognizedAmount: 1
}));

const plan = buildPlan({
  purchases: [],
  entitlements,
  entitlementLedger: [
    ...liqinRows,
    { id: IDS.deleteLedger.lianOldMonthly, studentId: IDS.students.lian },
    { id: IDS.deleteLedger.xiaotudouFuture, studentId: IDS.students.xiaotudou },
    { id: IDS.deleteLedger.yayaFutureVoided, studentId: IDS.students.yaya },
    { id: IDS.deleteLedger.yayaMay27, studentId: IDS.students.yaya }
  ],
  schedule: [
    ...LIQIN_LESSON_UPDATES.map((row) => ({
      id: row.scheduleId,
      studentIds: [IDS.students.liqin],
      entitlementId: row.entitlementId,
      entitlementIds: [row.entitlementId],
      lessonCount: -1
    })),
    { id: IDS.deleteSchedule.lianMay18Duplicate },
    { id: IDS.deleteSchedule.lianMay22Duplicate },
    { id: IDS.deleteSchedule.zhangBigMay20Duplicate },
    { id: IDS.deleteSchedule.zhangBigMay27Duplicate },
    { id: IDS.deleteSchedule.zhangSmallMay20Duplicate },
    { id: IDS.deleteSchedule.liqinMay27Duplicate },
    { id: IDS.deleteSchedule.yayaMay20Duplicate },
    { id: IDS.deleteSchedule.yayaMay27 }
  ],
  activeIndexes: []
}, { now });

const entitlementSummary = Object.fromEntries(plan.putEntitlements.map((row) => [row.id, {
  used: row.usedLessons,
  remaining: row.remainingLessons,
  status: row.status
}]));

assert.deepStrictEqual(entitlementSummary[IDS.entitlements.lianRenewal], { used: 0, remaining: 10, status: 'active' });
assert.deepStrictEqual(entitlementSummary[IDS.entitlements.xiaotudouRenewal], { used: 0, remaining: 10, status: 'active' });
assert.deepStrictEqual(entitlementSummary[IDS.entitlements.zhangBigInitial], { used: 10, remaining: 0, status: 'depleted' });
assert.deepStrictEqual(entitlementSummary[IDS.entitlements.zhangSmallInitial], { used: 10, remaining: 0, status: 'depleted' });
assert.deepStrictEqual(entitlementSummary[IDS.entitlements.liqinInitial], { used: 10, remaining: 0, status: 'depleted' });
assert.deepStrictEqual(entitlementSummary[IDS.entitlements.liqinRenewal], { used: 18, remaining: 32, status: 'active' });
assert.deepStrictEqual(entitlementSummary[IDS.entitlements.yayaFirst], { used: 20, remaining: 0, status: 'depleted' });
assert.deepStrictEqual(entitlementSummary[IDS.entitlements.yayaGold], { used: 13, remaining: 7, status: 'active' });
assert.deepStrictEqual(entitlementSummary[IDS.entitlements.yayaNonprime], { used: 0, remaining: 20, status: 'active' });

assert.ok(plan.deleteLedger.includes(IDS.deleteLedger.lianOldMonthly));
assert.ok(plan.deleteLedger.includes(IDS.deleteLedger.xiaotudouFuture));
assert.ok(plan.deleteLedger.includes(IDS.deleteLedger.yayaFutureVoided));
assert.ok(plan.deleteLedger.includes(IDS.deleteLedger.yayaMay27));
assert.ok(plan.deleteSchedule.includes(IDS.deleteSchedule.zhangBigMay20Duplicate));
assert.ok(plan.deleteSchedule.includes(IDS.deleteSchedule.yayaMay27));

const liqinInitialSplit = plan.putLedger.find((row) => row.id === IDS.liqinInitialSplitLedgerId);
assert.strictEqual(liqinInitialSplit.lessonDelta, -0.5);
assert.strictEqual(liqinInitialSplit.entitlementId, IDS.entitlements.liqinInitial);

const liqinRenewalSum = plan.putLedger
  .filter((row) => row.studentId === IDS.students.liqin && row.entitlementId === IDS.entitlements.liqinRenewal)
  .reduce((sum, row) => sum + Math.abs(Number(row.lessonDelta) || 0), 0);
assert.strictEqual(liqinRenewalSum, 18);

const liqinMarch23Schedule = plan.putSchedule.find((row) => row.id === IDS.liqinSplitScheduleId);
assert.strictEqual(liqinMarch23Schedule.lessonCount, 1);
assert.deepStrictEqual(liqinMarch23Schedule.entitlementIds, [IDS.entitlements.liqinInitial, IDS.entitlements.liqinRenewal]);

const yayaIndex = plan.putIndexes.find((row) => row.studentId === IDS.students.yaya);
assert.deepStrictEqual(yayaIndex.entitlementIds, [IDS.entitlements.yayaGold, IDS.entitlements.yayaNonprime]);

console.log('course package five students repair script tests passed');
