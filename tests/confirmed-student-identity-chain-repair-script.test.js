const assert = require('assert');

const {
  IDS,
  WANG_TRIAL,
  WANG_PACKAGE,
  CHENXI_SCHEDULE_IDS,
  buildPlan
} = require('../scripts/repair-confirmed-student-identity-chain-20260820');

const now = '2026-08-20T12:00:00.000Z';
const AMENG_PACKAGE_SCHEDULE_IDS = [
  'repair-20260813-schedule-wang-ameng-20260814-1500',
  'cd6491eb-4fd5-459f-9fb3-87258d46db52',
  '21239414-c981-4581-8c15-34edaf1ddc42',
  '1880d61a-905f-4886-bf16-3733b0c31bf5',
  '59ec39f0-d9ea-401a-8968-80fa175db8f6',
  '9cda9e18-4dd6-41d1-8382-024b447b0903',
  'c73e9448-27d1-4053-a0a8-9b3acb5c546e',
  'fb1835f4-4bb5-42e3-b681-752dcf437939'
];
const NONO_PACKAGE_SCHEDULE_IDS = [
  'f9c52aa7-01c4-4f7b-a90f-391c56ead3d7',
  'repair-20260818-schedule-wang-ameng-20260818-1100'
];
const NONO_LEDGER_IDS = [
  '6b4e28b3-0462-4c00-9e69-465cbe7f865c',
  'repair-20260818-ledger-wang-ameng-20260818-1100'
];

function schedule(id, patch = {}) {
  return {
    id,
    startTime: patch.startTime || '2026-08-15 13:00',
    endTime: patch.endTime || '2026-08-15 14:00',
    status: '已排课',
    coach: patch.coach || '岳克舟教练',
    studentName: patch.studentName || '王先生（阿萌）',
    studentId: patch.studentId || (patch.studentIds && patch.studentIds[0]) || IDS.amengStudent,
    studentIds: patch.studentIds || [IDS.amengStudent],
    expectedStudentIds: patch.studentIds || [IDS.amengStudent],
    purchaseId: patch.purchaseId || '',
    entitlementId: patch.entitlementId || '',
    entitlementIds: patch.entitlementId ? [patch.entitlementId] : [],
    courseType: patch.courseType || '私教课',
    venue: patch.venue || '1号场',
    settlementType: 'package',
    lessonCount: 1,
    packageName: patch.packageName || ''
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
    ...AMENG_PACKAGE_SCHEDULE_IDS.map((id, index) => schedule(id, {
      startTime: `2026-08-${16 + index * 2} 12:00`,
      purchaseId: WANG_PACKAGE.sourcePurchaseId,
      entitlementId: WANG_PACKAGE.sourceEntitlementId,
      packageName: '1v2私教课 · 8课时 · 非黄金'
    })),
    ...NONO_PACKAGE_SCHEDULE_IDS.map((id, index) => schedule(id, {
      startTime: index === 0 ? '2026-08-16 12:00' : '2026-08-18 11:00',
      studentName: '王先生（nono）',
      studentIds: [IDS.nonoStudent],
      purchaseId: WANG_PACKAGE.dirtySplitPurchaseId,
      entitlementId: WANG_PACKAGE.dirtySplitEntitlementId,
      packageName: '1v1私教课 · 2课时 · 黄金'
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
    { id: WANG_PACKAGE.sourcePurchaseId, studentId: IDS.amengStudent, studentName: '王先生（阿萌）', packageName: '1v2私教课 · 8课时 · 非黄金', amountPaid: 3600, totalLessons: 8 },
    { id: WANG_PACKAGE.dirtySplitPurchaseId, studentId: IDS.nonoStudent, studentName: '王先生（nono）', packageName: '1v1私教课 · 2课时 · 黄金', amountPaid: 900, totalLessons: 2 }
  ],
  entitlements: [
    { id: WANG_TRIAL.entitlementId, purchaseId: WANG_TRIAL.purchaseId, studentId: IDS.amengStudent, studentName: '王先生（阿萌）', totalLessons: 1, usedLessons: 1, remainingLessons: 0, status: 'depleted' },
    { id: WANG_PACKAGE.sourceEntitlementId, purchaseId: WANG_PACKAGE.sourcePurchaseId, studentId: IDS.amengStudent, studentName: '王先生（阿萌）', totalLessons: 8, usedLessons: 8, remainingLessons: 0, status: 'depleted' },
    { id: WANG_PACKAGE.dirtySplitEntitlementId, purchaseId: WANG_PACKAGE.dirtySplitPurchaseId, studentId: IDS.nonoStudent, studentName: '王先生（nono）', totalLessons: 2, usedLessons: 2, remainingLessons: 0, status: 'depleted' },
    { id: 'xixi-entitlement', purchaseId: 'xixi-purchase', studentId: IDS.xixiStudent, studentName: '曦曦🐳', totalLessons: 10, usedLessons: 8, remainingLessons: 2, status: 'active' }
  ],
  entitlementLedger: [
    { id: WANG_TRIAL.ledgerId, scheduleId: WANG_TRIAL.scheduleId, purchaseId: WANG_TRIAL.purchaseId, entitlementId: WANG_TRIAL.entitlementId, studentId: IDS.amengStudent, lessonDelta: -1 },
    ...NONO_LEDGER_IDS.map((id, index) => ({ id, scheduleId: NONO_PACKAGE_SCHEDULE_IDS[index], purchaseId: WANG_PACKAGE.dirtySplitPurchaseId, entitlementId: WANG_PACKAGE.dirtySplitEntitlementId, studentId: IDS.nonoStudent, lessonDelta: -1 }))
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
assert.strictEqual(plan.schedulePuts.filter(row => row.studentId === IDS.amengStudent && row.packageName === '1v2私教课 · 10课时 · 非黄金').length, AMENG_PACKAGE_SCHEDULE_IDS.length, 'Ameng package schedules should restore to a full 10-course order');
assert.strictEqual(plan.schedulePuts.filter(row => row.studentId === IDS.nonoStudent && row.packageName === '1v1私教课 · 10课时 · 黄金').length, NONO_PACKAGE_SCHEDULE_IDS.length, 'nono package schedules should become an independent full 10-course order');
assert.strictEqual(plan.schedulePuts.filter(row => row.studentId === IDS.nonoStudent).length, NONO_PACKAGE_SCHEDULE_IDS.length + 1, 'nono should keep trial plus package schedules');
assert.strictEqual(plan.schedulePuts.filter(row => row.studentId === IDS.xixiStudent && row.studentName === '曦曦🐳').length, CHENXI_SCHEDULE_IDS.length, 'six Chenxi rows should display Xixi');

const sourcePurchase = plan.purchasePuts.find(row => row.id === WANG_PACKAGE.sourcePurchaseId);
const nonoPurchase = plan.purchasePuts.find(row => row.id === WANG_PACKAGE.nonoPurchaseId);
assert.strictEqual(sourcePurchase.amountPaid, 4500, 'Ameng purchase should be restored to 4500');
assert.strictEqual(sourcePurchase.totalLessons, 10, 'Ameng purchase should be restored to 10 lessons');
assert.strictEqual(nonoPurchase.amountPaid, 4500, 'nono purchase should be restored to 4500');
assert.strictEqual(nonoPurchase.totalLessons, 10, 'nono purchase should be restored to 10 lessons');
assert.strictEqual(plan.entitlementPuts.find(row => row.id === WANG_PACKAGE.sourceEntitlementId).usedLessons, 8, 'Ameng entitlement should keep 8 used lessons');
assert.strictEqual(plan.entitlementPuts.find(row => row.id === WANG_PACKAGE.nonoEntitlementId).usedLessons, 2, 'nono entitlement should keep 2 used lessons');
assert.strictEqual(plan.entitlementPuts.find(row => row.id === WANG_PACKAGE.nonoEntitlementId).studentId, IDS.nonoStudent);
assert.strictEqual(plan.ledgerPuts.filter(row => row.studentId === IDS.nonoStudent).length, NONO_LEDGER_IDS.length + 1, 'nono should keep the trial ledger plus two package ledgers');
assert.ok(plan.deleteRows.some(row => row.table === 'ft_purchases' && row.id === WANG_PACKAGE.dirtySplitPurchaseId), 'dirty nono split purchase should be deleted');
assert.ok(plan.deleteRows.some(row => row.table === 'ft_entitlements' && row.id === WANG_PACKAGE.dirtySplitEntitlementId), 'dirty nono split entitlement should be deleted');

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
