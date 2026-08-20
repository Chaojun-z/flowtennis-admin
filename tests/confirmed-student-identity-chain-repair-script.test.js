const assert = require('assert');

const {
  IDS,
  WANG_TRIAL,
  WANG_PACKAGE,
  CHENXI_SCHEDULE_IDS,
  buildPlan
} = require('../scripts/repair-confirmed-student-identity-chain-20260820');

const now = '2026-08-20T12:00:00.000Z';

function schedule(id, patch = {}) {
  return {
    id,
    startTime: patch.startTime || '2026-08-15 13:00',
    endTime: patch.endTime || '2026-08-15 14:00',
    status: '已排课',
    coach: patch.coach || '岳克舟教练',
    studentName: patch.studentName || '王先生（阿萌）',
    studentIds: patch.studentIds || [IDS.amengStudent],
    expectedStudentIds: patch.studentIds || [IDS.amengStudent],
    purchaseId: patch.purchaseId || '',
    entitlementId: patch.entitlementId || '',
    entitlementIds: patch.entitlementId ? [patch.entitlementId] : [],
    courseType: patch.courseType || '私教课',
    venue: patch.venue || '1号场',
    settlementType: 'package',
    lessonCount: 1
  };
}

const data = {
  students: [
    { id: IDS.amengStudent, name: '王先生（阿萌）' },
    { id: IDS.wenStudent, name: '文大妞' },
    { id: IDS.xixiStudent, name: '曦曦🐳', sourceLeadId: 'lead-xixi' },
    { id: IDS.hammerFakeStudent, name: '捶捶' },
    { id: 'seed-student-040', name: '是锤锤呀' }
  ],
  leads: [
    { id: IDS.nonoLead, displayName: '王先生（nono）', wechatName: '王先生（nono）', campus: 'shunyi_mapo', customerType: '成人', source: '线下到店' },
    { id: IDS.hammerFakeLead, displayName: '捶捶', studentId: IDS.hammerFakeStudent }
  ],
  schedule: [
    schedule(WANG_TRIAL.scheduleId, { courseType: '体验课', purchaseId: WANG_TRIAL.purchaseId, entitlementId: WANG_TRIAL.entitlementId, venue: '2号场' }),
    ...WANG_PACKAGE.scheduleIds.map((id, index) => schedule(id, {
      startTime: `2026-08-${16 + index * 2} 12:00`,
      purchaseId: WANG_PACKAGE.sourcePurchaseId,
      entitlementId: WANG_PACKAGE.sourceEntitlementId
    })),
    ...CHENXI_SCHEDULE_IDS.map((id) => schedule(id, {
      studentName: '晨曦',
      studentIds: [IDS.xixiStudent],
      purchaseId: 'xixi-purchase',
      entitlementId: 'xixi-entitlement'
    })),
    schedule(IDS.hammerDirtySchedule, {
      coach: '林铭教练',
      studentName: '锤锤（非黄2.5）',
      studentIds: [IDS.hammerFakeStudent],
      courseType: '私教课',
      venue: '2号场'
    }),
    schedule('53729bce-92f7-48f1-a00b-0922d033ee1f', {
      coach: '林铭教练',
      studentName: '是锤锤呀',
      studentIds: ['seed-student-040'],
      venue: '3号场'
    })
  ],
  purchases: [
    { id: WANG_TRIAL.purchaseId, studentId: IDS.amengStudent, studentName: '王先生（阿萌）', packageName: '私教体验课 · 1课时 · 全天', amountPaid: 239 },
    { id: WANG_PACKAGE.sourcePurchaseId, studentId: IDS.amengStudent, studentName: '王先生（阿萌）', packageName: '1v2私教课 · 10课时 · 非黄金', amountPaid: 4500, totalLessons: 10 }
  ],
  entitlements: [
    { id: WANG_TRIAL.entitlementId, purchaseId: WANG_TRIAL.purchaseId, studentId: IDS.amengStudent, studentName: '王先生（阿萌）', totalLessons: 1, usedLessons: 1, remainingLessons: 0, status: 'depleted' },
    { id: WANG_PACKAGE.sourceEntitlementId, purchaseId: WANG_PACKAGE.sourcePurchaseId, studentId: IDS.amengStudent, studentName: '王先生（阿萌）', totalLessons: 10, usedLessons: 10, remainingLessons: 0, status: 'depleted' },
    { id: 'xixi-entitlement', purchaseId: 'xixi-purchase', studentId: IDS.xixiStudent, studentName: '曦曦🐳', totalLessons: 10, usedLessons: 8, remainingLessons: 2, status: 'active' }
  ],
  entitlementLedger: [
    { id: WANG_TRIAL.ledgerId, scheduleId: WANG_TRIAL.scheduleId, purchaseId: WANG_TRIAL.purchaseId, entitlementId: WANG_TRIAL.entitlementId, studentId: IDS.amengStudent, lessonDelta: -1 },
    ...WANG_PACKAGE.ledgerIds.map((id, index) => ({ id, scheduleId: WANG_PACKAGE.scheduleIds[index], purchaseId: WANG_PACKAGE.sourcePurchaseId, entitlementId: WANG_PACKAGE.sourceEntitlementId, studentId: IDS.amengStudent, lessonDelta: -1 }))
  ],
  studentSummary: [
    { id: IDS.wenStudent, studentId: IDS.wenStudent, completedLessons: 0, detailLessonRecordRows: [], detailPackageOrderRows: [] },
    { id: IDS.hammerFakeStudent, studentId: IDS.hammerFakeStudent, completedLessons: 1 }
  ],
  conflictIndex: [
    { id: 'conflict-wang', scheduleId: WANG_TRIAL.scheduleId },
    { id: 'conflict-hammer', scheduleId: IDS.hammerDirtySchedule }
  ]
};

const plan = buildPlan(data, now);
assert.deepStrictEqual(plan.blockers, [], 'confirmed repair plan should have no blockers');
assert.strictEqual(plan.studentPuts.length, 1, 'nono formal student should be created once');
assert.strictEqual(plan.studentPuts[0].id, IDS.nonoStudent);
assert.strictEqual(plan.leadPuts[0].studentId, IDS.nonoStudent);
assert.strictEqual(plan.schedulePuts.filter(row => row.studentId === IDS.nonoStudent).length, 3, 'three Yue Wang schedules should move to nono');
assert.strictEqual(plan.schedulePuts.filter(row => row.studentId === IDS.xixiStudent && row.studentName === '曦曦🐳').length, CHENXI_SCHEDULE_IDS.length, 'six Chenxi rows should display Xixi');

const sourcePurchase = plan.purchasePuts.find(row => row.id === WANG_PACKAGE.sourcePurchaseId);
const splitPurchase = plan.purchasePuts.find(row => row.id === WANG_PACKAGE.splitPurchaseId);
assert.strictEqual(sourcePurchase.amountPaid + splitPurchase.amountPaid, 4500, 'Wang package split should keep total paid amount unchanged');
assert.strictEqual(sourcePurchase.totalLessons + splitPurchase.totalLessons, 10, 'Wang package split should keep total lessons unchanged');
assert.strictEqual(plan.entitlementPuts.find(row => row.id === WANG_PACKAGE.splitEntitlementId).studentId, IDS.nonoStudent);
assert.ok(plan.ledgerPuts.every(row => row.studentId === IDS.nonoStudent), 'all moved ledgers should belong to nono');

assert.ok(plan.deleteRows.some(row => row.table === 'ft_student_teaching_summary' && row.id === IDS.wenStudent), 'Wen empty cache should be deleted');
assert.ok(plan.deleteRows.some(row => row.table === 'ft_schedule' && row.id === IDS.hammerDirtySchedule), 'dirty hammer schedule should be deleted');
assert.ok(plan.deleteRows.some(row => row.table === 'ft_students' && row.id === IDS.hammerFakeStudent), 'dirty hammer student should be deleted');
assert.ok(plan.conflictIndex.staleConflictIndexIds.includes('conflict-wang'), 'changed schedules should refresh conflict index');

const blocked = buildPlan({
  ...data,
  entitlementLedger: data.entitlementLedger.concat({ id: 'extra-fake-ledger', studentId: IDS.hammerFakeStudent })
}, now);
assert.strictEqual(blocked.blockers.length, 1, 'script should block when fake student has unexpected business references');

console.log('confirmed student identity chain repair script tests passed');
