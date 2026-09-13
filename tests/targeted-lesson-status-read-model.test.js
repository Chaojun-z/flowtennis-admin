const assert = require('assert');

const { buildCustomerLifecycleRows } = require('../server/read-models/customer-lifecycle.js');
const {
  buildStudentTeachingSummaryRows,
  buildTeachingStudentViews
} = require('../server/read-models/platform-metrics.js');

const packageDateRows = buildStudentTeachingSummaryRows([
  {
    customerKey: 'student:package-date',
    studentId: 'student-package-date',
    displayName: '日期学员',
    studentStage: 'formal'
  }
], {
  students: [{ id: 'student-package-date', name: '日期学员' }],
  purchases: [{
    id: 'purchase-package-date',
    studentId: 'student-package-date',
    courseType: '专项课',
    packageName: '专项课 · 1次',
    purchaseDate: '2026-07-31',
    amountPaid: 199,
    status: 'active'
  }],
  entitlements: [{
    id: 'ent-package-date',
    studentId: 'student-package-date',
    purchaseId: 'purchase-package-date',
    courseType: '专项课',
    packageName: '专项课 · 1次',
    totalLessons: 1,
    usedLessons: 0,
    remainingLessons: 1,
    status: 'active',
    createdAt: '2026-08-01T08:40:46.503Z'
  }],
  schedule: [],
  entitlementLedger: [],
  now: new Date('2026-09-13 00:00:00')
});

assert.strictEqual(
  packageDateRows.find((row) => row.studentId === 'student-package-date').detailPackageOrderRows[0].purchaseDate,
  '2026-07-31',
  '课包购买日期必须优先使用订单购买日期，不能被权益创建日期覆盖'
);

const dadaSummaryRow = {
  customerKey: 'student:dada',
  studentId: 'student-dada',
  displayName: '达达',
  studentStage: 'formal',
  studentStatusLabel: '已排课未上课',
  hasFormalAttended: false,
  completedLessons: 2,
  detailRecentLessonDate: '2026-08-18',
  lastFormalLessonAt: '2026-08-18',
  detailLessonRecordRows: [{
    kind: 'ledger',
    scheduleId: 'schedule-dada-formal',
    time: '2026-08-18 10:00-11:00',
    lessonDelta: -1,
    countAsCompletedLesson: true,
    courseType: '私教课',
    status: '已结束'
  }]
};
const dadaViews = buildTeachingStudentViews(
  buildCustomerLifecycleRows({ teachingStudentSummaryRows: [dadaSummaryRow] }),
  { teachingStudentSummaryRows: [dadaSummaryRow], now: new Date('2026-09-13 00:00:00') }
);
const dadaView = dadaViews.activeStudents.find((row) => row.studentId === 'student-dada');

assert.ok(dadaView, '达达必须出现在教学学员视图中');
assert.strictEqual(dadaView.hasFormalAttended, true, '有正式课扣课记录的学员必须识别为已上过正式课');
assert.notStrictEqual(dadaView.studentStatusLabel, '已排课未上课', '达达不能被列表误标为已排课未上课');

console.log('targeted lesson status read-model tests passed');
