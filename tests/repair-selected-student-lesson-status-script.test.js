const assert = require('assert');

const cache = require('../server/read-models/student-teaching-summary-cache');
const { buildPlan, ledgerId } = require('../scripts/repair-selected-student-lesson-status-20260913');

const schedule = {
  id: 'c850691d-f94e-48e7-a7de-dc710085b5c4',
  date: '2026-07-31',
  startTime: '2026-07-31 12:00',
  endTime: '2026-07-31 13:00',
  status: '已排课',
  state: '已排课',
  systemStatus: '已排课',
  confirmStatus: '待确认',
  courseType: '小班课',
  campus: 'shunyi_mapo',
  campusName: '顺义马坡',
  venue: '1号场',
  coach: '杨教练',
  coachName: '杨教练',
  studentIds: [
    '5db707b6-4e1f-499d-ab09-889ff7598d97',
    'b38a521d-7fc2-4e53-9e59-4224d530e680'
  ],
  studentNames: ['Jay', '阳光正好'],
  entitlementIds: [
    'a27fb3d3-d426-47f7-946b-baf67253d48c',
    '70859839-61a9-443c-bb7b-f1e6b4a5fc58'
  ]
};

const otherSchedules = [
  {
    id: '247ef588-fa56-4706-ab2d-6b808bdd2739',
    startTime: '2026-07-26 15:00',
    endTime: '2026-07-26 16:00',
    status: '已排课',
    systemStatus: '已排课',
    confirmStatus: '待确认'
  },
  {
    id: '8c45afc7-eaf0-4af0-84bd-04004e49449c',
    startTime: '2026-07-26 12:00',
    endTime: '2026-07-26 13:30',
    status: '已排课',
    systemStatus: '已排课',
    confirmStatus: '待确认'
  }
];

const entitlements = [
  {
    id: 'a27fb3d3-d426-47f7-946b-baf67253d48c',
    studentId: '5db707b6-4e1f-499d-ab09-889ff7598d97',
    studentName: 'Jay',
    purchaseId: '9ca7e066-54aa-4699-8093-9ada120ea89e',
    packageName: '专项课 · 1次',
    totalLessons: 1,
    usedLessons: 0,
    remainingLessons: 1,
    status: 'active'
  },
  {
    id: '70859839-61a9-443c-bb7b-f1e6b4a5fc58',
    studentId: 'b38a521d-7fc2-4e53-9e59-4224d530e680',
    studentName: '阳光正好',
    purchaseId: '6b2f2c6a-953a-446e-907a-26d8c565d87f',
    packageName: '专项课 · 1次',
    totalLessons: 1,
    usedLessons: 0,
    remainingLessons: 1,
    status: 'active'
  }
];

const purchases = [
  { id: '9ca7e066-54aa-4699-8093-9ada120ea89e', purchaseDate: '2026-07-31' },
  { id: '6b2f2c6a-953a-446e-907a-26d8c565d87f', purchaseDate: '2026-07-31' }
];

const students = [
  '5db707b6-4e1f-499d-ab09-889ff7598d97',
  'b38a521d-7fc2-4e53-9e59-4224d530e680',
  'cf5c0cc0-b758-45d4-a18a-a8bcf5f6e486',
  '05379b34-dc4b-476e-88c7-af248fc6e79f',
  'ed545b83-cfd0-4d39-894b-d5ddfb7a3b0e',
  'seed-student-041',
  '1bd6c3ab-c787-485c-85b2-d6f7cda7b31d'
];
const summaryRows = students.map(studentId => ({
  id: studentId,
  studentId,
  displayName: studentId,
  studentStatusLabel: studentId === '1bd6c3ab-c787-485c-85b2-d6f7cda7b31d' ? '已排课未上课' : '-',
  hasFormalAttended: false,
  completedLessons: 0,
  detailPackageOrderRows: studentId === '5db707b6-4e1f-499d-ab09-889ff7598d97'
    ? [{ entitlementId: entitlements[0].id, purchaseDate: '2026-08-01', totalLessons: 1, usedLessons: 0, remainingLessons: 1 }]
    : studentId === 'b38a521d-7fc2-4e53-9e59-4224d530e680'
      ? [{ entitlementId: entitlements[1].id, purchaseDate: '2026-08-01', totalLessons: 1, usedLessons: 0, remainingLessons: 1 }]
      : [],
  packageListRows: [],
  detailLessonRecordRows: studentId === '5db707b6-4e1f-499d-ab09-889ff7598d97'
    ? [{ kind: 'schedule', scheduleId: schedule.id, entitlementId: entitlements[0].id, sortTime: schedule.startTime, time: '2026-07-31 12:00-13:00', countAsCompletedLesson: false, lessonDelta: 0 }]
    : studentId === 'b38a521d-7fc2-4e53-9e59-4224d530e680'
      ? [{ kind: 'schedule', scheduleId: schedule.id, entitlementId: entitlements[1].id, sortTime: schedule.startTime, time: '2026-07-31 12:00-13:00', countAsCompletedLesson: false, lessonDelta: 0 }]
      : []
}));

const summaryMeta = {
  id: cache.STUDENT_TEACHING_SUMMARY_META_ID,
  status: 'ready',
  generation: 10,
  rowCount: summaryRows.length,
  activeVersion: 'student-teaching-summary-before-repair'
};
const summaryBundle = cache.buildStudentTeachingSummaryBundleRow(summaryRows, summaryMeta.activeVersion);
const summaryListBundle = cache.buildStudentTeachingSummaryListBundleRow(summaryRows, summaryMeta.activeVersion);

const plan = buildPlan({
  schedules: [schedule, ...otherSchedules],
  entitlements,
  purchases,
  ledgers: [],
  indexRows: [
    { id: entitlements[0].studentId, studentId: entitlements[0].studentId, entitlementIds: [entitlements[0].id] },
    { id: entitlements[1].studentId, studentId: entitlements[1].studentId, entitlementIds: [entitlements[1].id] }
  ],
  summaryMeta,
  summaryRows,
  summaryBundle,
  summaryListBundle,
  now: '2026-09-13T05:00:00.000Z'
});

assert.strictEqual(plan.ledgerCreates.length, 2, '两位学员各补一条消课流水');
assert.strictEqual(plan.entitlementUpdates.length, 2, '两条课包各更新一次余额');
assert.strictEqual(plan.scheduleUpdates.length, 3, '三条历史排课统一收口');
assert.strictEqual(plan.indexUpdates.length, 2, '两条已用完课包从可用索引移除');
assert.strictEqual(plan.changedSummaryRows.length, 7, '只更新这 7 个目标学员摘要');
assert.strictEqual(plan.ledgerCreates[0].after.id, ledgerId(schedule.id, entitlements[0].id));
assert.strictEqual(plan.changedSummaryRows[0].after.detailLessonRecordRows[0].kind, 'ledger');
assert.strictEqual(plan.changedSummaryRows[0].after.detailLessonRecordRows[0].lessonDelta, -1);
assert.strictEqual(plan.changedSummaryRows[0].after.detailPackageOrderRows[0].purchaseDate, '2026-07-31');
assert.strictEqual(plan.changedSummaryRows.find(item => item.id === '1bd6c3ab-c787-485c-85b2-d6f7cda7b31d').after.studentStatusLabel, '-');
assert.strictEqual(plan.nextSummaryMeta.previousActiveVersion, summaryMeta.activeVersion);

console.log('repair-selected-student-lesson-status script tests passed');
