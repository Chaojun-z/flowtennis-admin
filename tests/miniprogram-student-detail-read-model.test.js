const assert = require('assert');

const { buildTeachingStudentViews, buildCoachMiniStudentRoster } = require('../server/read-models/platform-metrics.js');

const views = buildTeachingStudentViews([{
  customerKey: 'student:student-mini-detail',
  studentId: 'student-mini-detail',
  displayName: '小程序详情学员',
  studentStage: 'formal'
}], {
  students: [{ id: 'student-mini-detail', name: '小程序详情学员' }],
  purchases: [{
    id: 'purchase-mini-detail',
    studentId: 'student-mini-detail',
    packageName: '私教课包',
    status: 'active',
    actualAmount: 1000
  }],
  entitlements: [{
    id: 'entitlement-mini-detail',
    purchaseId: 'purchase-mini-detail',
    studentId: 'student-mini-detail',
    packageName: '私教课包',
    totalLessons: 10,
    remainingLessons: 8,
    usedLessons: 2,
    status: 'active'
  }],
  entitlementLedger: [{
    id: 'ledger-mini-detail',
    entitlementId: 'entitlement-mini-detail',
    purchaseId: 'purchase-mini-detail',
    studentId: 'student-mini-detail',
    scheduleId: 'schedule-ledger-mini-detail',
    lessonDelta: -1,
    relatedDate: '2026-08-10',
    reason: '上课消耗'
  }],
  schedule: [{
    id: 'schedule-ledger-mini-detail',
    studentId: 'student-mini-detail',
    startTime: '2026-08-10 10:00:00',
    endTime: '2026-08-10 11:00:00',
    status: '已结束',
    courseType: '私教课',
    venue: '3号场',
    coach: '林铭教练',
    lessonCount: 1
  }, {
    id: 'schedule-missing-feedback-mini-detail',
    studentId: 'student-mini-detail',
    startTime: '2026-08-12 10:00:00',
    endTime: '2026-08-12 11:00:00',
    status: '已结束',
    courseType: '私教课',
    venue: '4号场',
    coach: '林铭教练',
    lessonCount: 1
  }],
  feedbacks: [{
    id: 'feedback-mini-detail',
    scheduleId: 'schedule-ledger-mini-detail',
    studentId: 'student-mini-detail',
    practicedToday: '正手练习'
  }],
  now: new Date('2026-08-18 12:00:00')
});

const row = views.historicalStudents.find(item => item.studentId === 'student-mini-detail');

assert.deepStrictEqual(
  row.detailLessonRecordRows.map(item => [item.kind, item.scheduleId, item.hasFeedback]),
  [
    ['schedule', 'schedule-missing-feedback-mini-detail', false],
    ['ledger', 'schedule-ledger-mini-detail', true]
  ],
  'mini program student detail lesson rows should carry schedule id and feedback state from the unified read model'
);

const duplicateViews = buildTeachingStudentViews([{
  customerKey: 'student:duplicate-mini-detail',
  studentId: 'duplicate-mini-detail',
  displayName: '重复明细学员',
  studentStage: 'formal'
}], {
  students: [{ id: 'duplicate-mini-detail', name: '重复明细学员' }],
  purchases: [{
    id: 'purchase-duplicate-mini-detail',
    studentId: 'duplicate-mini-detail',
    packageName: '私教课包',
    status: 'active',
    actualAmount: 1000
  }],
  entitlements: [{
    id: 'entitlement-duplicate-mini-detail',
    purchaseId: 'purchase-duplicate-mini-detail',
    studentId: 'duplicate-mini-detail',
    packageName: '私教课包',
    totalLessons: 10,
    remainingLessons: 9,
    usedLessons: 1,
    status: 'active'
  }],
  entitlementLedger: [{
    id: 'ledger-duplicate-mini-detail',
    entitlementId: 'entitlement-duplicate-mini-detail',
    purchaseId: 'purchase-duplicate-mini-detail',
    studentId: 'duplicate-mini-detail',
    scheduleId: 'schedule-duplicate-mini-detail',
    lessonDelta: -1,
    relatedDate: '2026-08-10',
    reason: '上课消耗'
  }],
  schedule: [{
    id: 'schedule-duplicate-mini-detail',
    studentId: 'duplicate-mini-detail',
    startTime: '2026-08-10 10:00:00',
    endTime: '2026-08-10 11:00:00',
    status: '已结束',
    courseType: '私教课',
    venue: '3号场',
    coach: '林铭教练',
    lessonCount: 1
  }],
  now: new Date('2026-08-18 12:00:00')
});
const duplicateRow = duplicateViews.historicalStudents.find(item => item.studentId === 'duplicate-mini-detail');
assert.strictEqual(
  duplicateRow.detailLessonRecordRows.length,
  1,
  'duplicate schedule and ledger facts should merge into one lesson record'
);

const shiLessonDate = (index) => index < 10
  ? `2026-07-${String(index + 1).padStart(2, '0')}`
  : `2026-08-${String(index - 9).padStart(2, '0')}`;
const shiViews = buildTeachingStudentViews([{
  customerKey: 'student:shi-duohao',
  studentId: 'shi-duohao',
  displayName: '史多灏',
  owner: '宋教练',
  formalCoach: '宋教练',
  studentStage: 'formal'
}], {
  students: [{ id: 'shi-duohao', name: '史多灏', primaryCoach: '宋教练', type: '青少年' }],
  purchases: [
    { id: 'shi-pur-1', studentId: 'shi-duohao', packageName: '第一个私教课包', status: 'active', purchaseDate: '2026-05-01', ownerCoach: '宋教练', actualAmount: 1000 },
    { id: 'shi-pur-2', studentId: 'shi-duohao', packageName: '第二个私教课包', status: 'active', purchaseDate: '2026-07-01', ownerCoach: '林铭教练', actualAmount: 1000 }
  ],
  entitlements: [
    { id: 'shi-ent-1', purchaseId: 'shi-pur-1', studentId: 'shi-duohao', packageName: '第一个私教课包', totalLessons: 10, remainingLessons: 0, usedLessons: 10, ownerCoach: '宋教练', status: 'active' },
    { id: 'shi-ent-2', purchaseId: 'shi-pur-2', studentId: 'shi-duohao', packageName: '第二个私教课包', totalLessons: 10, remainingLessons: 2, usedLessons: 8, ownerCoach: '林铭教练', status: 'active' }
  ],
  entitlementLedger: [
    ...Array.from({ length: 19 }, (_, index) => ({
      id: `shi-ledger-${index + 1}`,
      entitlementId: index < 10 ? 'shi-ent-1' : 'shi-ent-2',
      purchaseId: index < 10 ? 'shi-pur-1' : 'shi-pur-2',
      studentId: 'shi-duohao',
      scheduleId: `shi-sch-${index + 1}`,
      lessonDelta: -1,
      relatedDate: shiLessonDate(index),
      reason: '上课消耗'
    })),
    {
      id: 'shi-ledger-future',
      entitlementId: 'shi-ent-2',
      purchaseId: 'shi-pur-2',
      studentId: 'shi-duohao',
      scheduleId: 'shi-sch-future',
      lessonDelta: -1,
      relatedDate: '2026-08-15',
      reason: '未来预约占用'
    }
  ],
  schedule: [
    ...Array.from({ length: 19 }, (_, index) => ({
      id: `shi-sch-${index + 1}`,
      studentId: 'shi-duohao',
      startTime: `${shiLessonDate(index)} 15:00:00`,
      endTime: `${shiLessonDate(index)} 16:00:00`,
      status: '已结束',
      courseType: index === 18 ? '小班课' : '私教课',
      venue: index === 18 ? '3号场' : '2号场',
      coach: '林铭教练',
      lessonCount: 1
    })),
    {
      id: 'shi-sch-trial',
      studentId: 'shi-duohao',
      startTime: '2026-06-06 18:00:00',
      endTime: '2026-06-06 19:00:00',
      status: '已结束',
      courseType: '体验课',
      experienceType: '私教体验课',
      venue: '2号场',
      coach: '宋教练',
      lessonCount: 1
    },
    {
      id: 'shi-sch-future',
      studentId: 'shi-duohao',
      startTime: '2026-08-22 11:00:00',
      endTime: '2026-08-22 12:00:00',
      status: '已排课',
      courseType: '私教课',
      venue: '3号场',
      coach: '林铭教练',
      lessonCount: 1
    }
  ],
  now: new Date('2026-08-19 10:00:00')
});
const shiRow = shiViews.historicalStudents.find(item => item.studentId === 'shi-duohao');
assert.strictEqual(shiRow.completedLessons, 19, 'formal cumulative lessons should exclude trial and future schedules but include formal small-group lessons');
assert.strictEqual(shiRow.detailPackageBalanceRemaining, 1, 'formal package balance should conserve against completed formal package lessons');
assert.strictEqual(shiRow.detailPackageBalanceText, '1/20', 'web and mini detail should share the same conserved formal package balance text');
assert.strictEqual(shiRow.detailPackageProgressText, '1/10,0/10', 'current package progress should show package-level remaining lessons with the newest package first');
assert.strictEqual(shiRow.ownerCoach, '林铭教练', 'latest effective formal package owner coach should override stale profile coach for ownership');
assert.strictEqual(
  shiRow.detailLessonRecordRows.some(item => String(item.scheduleId) === 'shi-sch-trial' || /体验/.test(String(item.courseType || item.packageName || ''))),
  true,
  'trial lessons should stay visible as trial records'
);
assert.strictEqual(
  shiRow.detailLessonRecordRows.some(item => String(item.scheduleId) === 'shi-sch-trial' && String(item.lessonSectionText || '').includes('第')),
  false,
  'trial lessons should not receive package lesson section labels'
);
assert.strictEqual(
  shiRow.detailLessonRecordRows.some(item => String(item.scheduleId) === 'shi-sch-future'),
  false,
  'future schedules must not appear in completed lesson records'
);
assert.strictEqual(
  shiRow.detailLessonRecordRows.find(item => String(item.scheduleId) === 'shi-sch-19')?.lessonSectionText,
  '[第09节]',
  'lesson section labels should be numbered inside the current package'
);

const rosterViews = buildTeachingStudentViews([{
  customerKey: 'student:owned-active',
  studentId: 'owned-active',
  displayName: '归属在期',
  owner: '林铭教练',
  formalCoach: '林铭教练',
  studentStage: 'formal'
}, {
  customerKey: 'student:owned-ended',
  studentId: 'owned-ended',
  displayName: '归属结课',
  owner: '林铭教练',
  formalCoach: '林铭教练',
  studentStage: 'formal'
}, {
  customerKey: 'student:trial-only',
  studentId: 'trial-only',
  displayName: '体验未转',
  owner: '林铭教练',
  formalCoach: '林铭教练',
  studentStage: 'trial',
  hasTrialExperience: true
}, {
  customerKey: 'student:substitute',
  studentId: 'substitute',
  displayName: '代课学员',
  owner: '岳克舟教练',
  formalCoach: '岳克舟教练',
  studentStage: 'formal'
}, {
  customerKey: 'student:empty-shell',
  studentId: 'empty-shell',
  displayName: '空壳学员',
  owner: '林铭教练',
  formalCoach: '林铭教练',
  studentStage: 'student'
}], {
  students: [
    { id: 'owned-active', name: '归属在期', primaryCoach: '林铭教练', type: '青少年' },
    { id: 'owned-ended', name: '归属结课', primaryCoach: '林铭教练', type: '成人' },
    { id: 'trial-only', name: '体验未转', primaryCoach: '林铭教练', type: '青少年' },
    { id: 'substitute', name: '代课学员', primaryCoach: '岳克舟教练', type: '成人' },
    { id: 'empty-shell', name: '空壳学员', primaryCoach: '林铭教练', type: '青少年' }
  ],
  purchases: [
    { id: 'p-owned-active', studentId: 'owned-active', packageName: '青少年私教课包', status: 'active' },
    { id: 'p-owned-ended', studentId: 'owned-ended', packageName: '成人私教课包', status: 'active' },
    { id: 'p-substitute', studentId: 'substitute', packageName: '成人私教课包', ownerCoach: '岳克舟教练', status: 'active' }
  ],
  entitlements: [
    { id: 'e-owned-active', purchaseId: 'p-owned-active', studentId: 'owned-active', packageName: '青少年私教课包', totalLessons: 10, remainingLessons: 7, usedLessons: 3, ownerCoach: '林铭教练', status: 'active' },
    { id: 'e-owned-ended', purchaseId: 'p-owned-ended', studentId: 'owned-ended', packageName: '成人私教课包', totalLessons: 10, remainingLessons: 0, usedLessons: 10, ownerCoach: '林铭教练', status: 'active' },
    { id: 'e-substitute', purchaseId: 'p-substitute', studentId: 'substitute', packageName: '成人私教课包', totalLessons: 10, remainingLessons: 5, usedLessons: 5, ownerCoach: '岳克舟教练', status: 'active' }
  ],
  schedule: [
    { id: 's-owned-week', studentId: 'owned-active', startTime: '2026-08-18 10:00:00', endTime: '2026-08-18 11:00:00', status: '已结束', courseType: '私教课', venue: '3号场', coach: '林铭教练', lessonCount: 1 },
    { id: 's-owned-future', studentId: 'owned-active', startTime: '2026-08-20 10:00:00', endTime: '2026-08-20 11:00:00', status: '已排课', courseType: '私教课', venue: '3号场', coach: '林铭教练', lessonCount: 1 },
    { id: 's-owned-cancelled', studentId: 'owned-ended', startTime: '2026-08-18 12:00:00', endTime: '2026-08-18 13:00:00', status: '已取消', courseType: '私教课', venue: '4号场', coach: '林铭教练', lessonCount: 1 },
    { id: 's-substitute-week', studentId: 'substitute', startTime: '2026-08-18 14:00:00', endTime: '2026-08-18 15:00:00', status: '已结束', courseType: '私教课', venue: '5号场', coach: '林铭教练', lessonCount: 1 },
    { id: 's-trial', studentId: 'trial-only', startTime: '2026-08-18 16:00:00', endTime: '2026-08-18 17:00:00', status: '已结束', courseType: '体验课', venue: '6号场', coach: '林铭教练', lessonCount: 1 }
  ],
  now: new Date('2026-08-19 10:00:00')
});

const miniRoster = buildCoachMiniStudentRoster({
  teachingStudentViews: rosterViews,
  coachName: '林铭教练',
  students: [
    { id: 'owned-active', type: '青少年' },
    { id: 'owned-ended', type: '成人' },
    { id: 'trial-only', type: '青少年' },
    { id: 'substitute', type: '成人' }
  ],
  schedule: [
    { id: 's-owned-week', studentId: 'owned-active', startTime: '2026-08-18 10:00:00', endTime: '2026-08-18 11:00:00', status: '已结束', coach: '林铭教练' },
    { id: 's-owned-future', studentId: 'owned-active', startTime: '2026-08-20 10:00:00', endTime: '2026-08-20 11:00:00', status: '已排课', coach: '林铭教练' },
    { id: 's-owned-cancelled', studentId: 'owned-ended', startTime: '2026-08-18 12:00:00', endTime: '2026-08-18 13:00:00', status: '已取消', coach: '林铭教练' },
    { id: 's-substitute-week', studentId: 'substitute', startTime: '2026-08-18 14:00:00', endTime: '2026-08-18 15:00:00', status: '已结束', coach: '林铭教练' },
    { id: 's-trial', studentId: 'trial-only', startTime: '2026-08-18 16:00:00', endTime: '2026-08-18 17:00:00', status: '已结束', coach: '林铭教练' }
  ],
  now: new Date('2026-08-19 10:00:00')
});

assert.deepStrictEqual(
  miniRoster.stats,
  {
    totalCount: 3,
    weekActiveCount: 2,
    monthActiveCount: 2,
    activeCount: 1,
    trialCount: 1,
    endedCount: 1,
    substituteCount: 1
  },
  'mini roster stats should use owned students and real-time completed schedules only'
);

assert.deepStrictEqual(
  miniRoster.items.map(item => [item.id, item.studentTabKey, item.type, item.relationType, item.packageText]).sort((a, b) => a[0].localeCompare(b[0])),
  [
    ['owned-active', 'active', '青少年', '归属', '7/10'],
    ['owned-ended', 'ended', '成人', '归属', '0/10'],
    ['substitute', 'substitute', '成人', '代课', '5/10'],
    ['trial-only', 'trial', '青少年', '归属', '']
  ],
  'mini roster items should keep student type separate from ownership and show package balance for substitute students'
);

const ownedFallbackRoster = buildCoachMiniStudentRoster({
  teachingStudentViews: {
    courseStudents: [{
      studentId: 'owned-fallback',
      id: 'owned-fallback',
      name: '归属兜底',
      type: '成人',
      primaryCoach: '林铭教练',
      packageBalanceText: '2/10',
      detailPackageBalanceText: '2/10',
      packageBalanceTotal: 10,
      packageBalanceRemaining: 2,
      packageBalancePercent: 20
    }]
  },
  coachName: '林铭教练',
  students: [{ id: 'owned-fallback', type: '成人' }],
  schedule: [{
    id: 's-owned-fallback',
    studentId: 'owned-fallback',
    startTime: '2026-08-18 10:00:00',
    endTime: '2026-08-18 11:00:00',
    status: '已结束',
    coach: '林铭教练'
  }],
  now: new Date('2026-08-19 10:00:00')
});

assert.deepStrictEqual(
  ownedFallbackRoster.stats,
  {
    totalCount: 1,
    weekActiveCount: 1,
    monthActiveCount: 1,
    activeCount: 1,
    trialCount: 0,
    endedCount: 0,
    substituteCount: 0
  },
  'owned students must not fall through the active, trial, and ended tabs'
);

const multiPackageRoster = buildCoachMiniStudentRoster({
  teachingStudentViews: {
    activeStudents: [{
      studentId: 'multi-package-student',
      id: 'multi-package-student',
      name: '多课包学员',
      type: '成人',
      primaryCoach: '林铭教练',
      packageBalanceText: '7/30',
      detailPackageBalanceText: '7/30',
      detailPackageProgressText: '5/10,0/10,2/10',
      packageBalanceTotal: 30,
      packageBalanceRemaining: 7,
      packageBalancePercent: 23,
      completedLessons: 11
    }]
  },
  coachName: '林铭教练',
  students: [{ id: 'multi-package-student', type: '成人' }],
  schedule: [],
  now: new Date('2026-08-19 10:00:00')
});
const multiPackageStudent = multiPackageRoster.items.find(item => item.studentId === 'multi-package-student');
assert.strictEqual(
  multiPackageStudent.packageText,
  '5/10,0/10,2/10',
  'mini roster should show each package balance separately when multiple packages exist'
);

console.log('miniprogram student detail read model tests passed');
