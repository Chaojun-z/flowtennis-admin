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
  miniRoster.items.map(item => [item.id, item.studentTabKey, item.type, item.packageText]).sort((a, b) => a[0].localeCompare(b[0])),
  [
    ['owned-active', 'active', '归属', '7/10'],
    ['owned-ended', 'ended', '归属', '0/10'],
    ['substitute', 'substitute', '代课', ''],
    ['trial-only', 'trial', '归属', '']
  ],
  'mini roster items should exclude empty shells and keep substitute students separate from owned students'
);

console.log('miniprogram student detail read model tests passed');
