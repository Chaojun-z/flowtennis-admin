const assert = require('assert');

const { buildTeachingStudentViews } = require('../server/read-models/platform-metrics.js');

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

console.log('miniprogram student detail read model tests passed');
