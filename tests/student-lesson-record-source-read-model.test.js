const assert = require('assert');

const { buildTeachingStudentViews } = require('../server/read-models/platform-metrics.js');

const studentId = 'wang-ziru';
const now = new Date('2026-08-11 12:00:00');

const privateOldDates = Array.from({ length: 9 }, (_, index) => `2026-06-${String(index + 1).padStart(2, '0')}`);
const packageSchedules = [
  ...privateOldDates.map((date, index) => ({
    id: `sch-private-old-${index + 1}`,
    entitlementId: 'ent-private-old',
    purchaseId: 'pur-private-old',
    studentId,
    startTime: `${date} 09:00:00`,
    endTime: `${date} 10:00:00`,
    status: '已结束',
    courseType: '私教课',
    venue: '3号场',
    coach: 'Siren 教练',
    lessonCount: 1
  })),
  {
    id: 'sch-small-1',
    entitlementId: 'ent-small',
    purchaseId: 'pur-small',
    studentId,
    startTime: '2026-06-15 10:00:00',
    endTime: '2026-06-15 11:00:00',
    status: '已结束',
    courseType: '小班课',
    venue: '2号场',
    coach: '林铭教练',
    lessonCount: 1
  },
  {
    id: 'sch-small-2',
    entitlementId: 'ent-small',
    purchaseId: 'pur-small',
    studentId,
    startTime: '2026-07-20 10:00:00',
    endTime: '2026-07-20 11:00:00',
    status: '已结束',
    courseType: '小班课',
    venue: '2号场',
    coach: '林铭教练',
    lessonCount: 1
  },
  {
    id: 'sch-special-1',
    entitlementId: 'ent-special',
    purchaseId: 'pur-special',
    studentId,
    startTime: '2026-07-28 15:00:00',
    endTime: '2026-07-28 16:00:00',
    status: '已结束',
    courseType: '专项课',
    venue: '3号场',
    coach: 'Siren 教练',
    lessonCount: 1
  },
  {
    id: 'sch-private-new-1',
    entitlementId: 'ent-private-new',
    purchaseId: 'pur-private-new',
    studentId,
    startTime: '2026-08-02 09:00:00',
    endTime: '2026-08-02 10:00:00',
    status: '已结束',
    courseType: '私教课',
    venue: '3号场',
    coach: 'Siren 教练',
    lessonCount: 1
  },
  {
    id: 'sch-private-new-2',
    entitlementId: 'ent-private-new',
    purchaseId: 'pur-private-new',
    studentId,
    startTime: '2026-08-09 09:00:00',
    endTime: '2026-08-09 10:00:00',
    status: '已结束',
    courseType: '私教课',
    venue: '3号场',
    coach: 'Siren 教练',
    lessonCount: 1
  }
];

const entitlementLedger = packageSchedules.map((schedule, index) => ({
  id: `ledger-${index + 1}`,
  entitlementId: schedule.entitlementId,
  purchaseId: schedule.purchaseId,
  studentId,
  scheduleId: schedule.id,
  lessonDelta: -1,
  relatedDate: schedule.startTime.slice(0, 10),
  reason: '上课消耗'
}));

const views = buildTeachingStudentViews([{
  customerKey: `student:${studentId}`,
  studentId,
  displayName: '王自如',
  studentStage: 'formal'
}], {
  students: [{ id: studentId, name: '王自如', type: '成人', campus: 'shunyi_mapo', primaryCoach: 'Siren 教练' }],
  purchases: [
    { id: 'pur-private-old', studentId, packageName: '私教课包1 · 10课时', courseType: '私教课', status: 'active', purchaseDate: '2026-05-27', actualAmount: 5000, ownerCoach: 'Siren 教练' },
    { id: 'pur-small', studentId, packageName: '成人小班课 · 8课时', courseType: '小班课', status: 'active', purchaseDate: '2026-06-10', actualAmount: 1200 },
    { id: 'pur-special', studentId, packageName: '发球专项课 · 4课时', courseType: '专项课', status: 'active', purchaseDate: '2026-07-20', actualAmount: 800 },
    { id: 'pur-private-new', studentId, packageName: '私教课包2 · 10课时', courseType: '私教课', status: 'active', purchaseDate: '2026-08-01', actualAmount: 5000, ownerCoach: 'Siren 教练' }
  ],
  entitlements: [
    { id: 'ent-private-old', purchaseId: 'pur-private-old', studentId, packageName: '私教课包1 · 10课时', courseType: '私教课', totalLessons: 10, usedLessons: 9, remainingLessons: 1, status: 'active', ownerCoach: 'Siren 教练' },
    { id: 'ent-small', purchaseId: 'pur-small', studentId, packageName: '成人小班课 · 8课时', courseType: '小班课', totalLessons: 8, usedLessons: 2, remainingLessons: 6, status: 'active' },
    { id: 'ent-special', purchaseId: 'pur-special', studentId, packageName: '发球专项课 · 4课时', courseType: '专项课', totalLessons: 4, usedLessons: 1, remainingLessons: 3, status: 'active' },
    { id: 'ent-private-new', purchaseId: 'pur-private-new', studentId, packageName: '私教课包2 · 10课时', courseType: '私教课', totalLessons: 10, usedLessons: 2, remainingLessons: 8, status: 'active', ownerCoach: 'Siren 教练' }
  ],
  entitlementLedger,
  schedule: [
    ...packageSchedules,
    {
      id: 'sch-direct-private',
      studentId,
      startTime: '2026-07-30 09:00:00',
      endTime: '2026-07-30 10:00:00',
      status: '已结束',
      courseType: '私教课',
      settlementType: 'direct',
      paidAmount: 500,
      venue: '3号场',
      coach: 'Siren 教练',
      lessonCount: 1
    },
    {
      id: 'sch-gift-small',
      studentId,
      startTime: '2026-08-10 10:00:00',
      endTime: '2026-08-10 11:00:00',
      status: '已结束',
      courseType: '小班课',
      paymentType: 'gift',
      freeLesson: true,
      venue: '2号场',
      coach: '林铭教练',
      lessonCount: 1
    }
  ],
  now
});

const row = views.historicalStudents.find(item => item.studentId === studentId);
assert.ok(row, 'student should be present in the unified teaching view');

assert.strictEqual(row.completedLessons, 16, 'list and drawer cumulative lessons should use the same all-formal-course count');
assert.strictEqual(row.detailRecentLessonDate, '2026-08-10', 'latest completed formal lesson should drive drawer and list recent lesson');
assert.strictEqual(row.detailPackageBalanceText, '18/32', 'available lessons should include private, small-class and special packages');
assert.deepStrictEqual(
  row.detailPackageOrderRows.map(item => [item.entitlementId, item.remainingLessons, item.totalLessons]),
  [
    ['ent-private-new', 8, 10],
    ['ent-special', 3, 4],
    ['ent-small', 6, 8],
    ['ent-private-old', 1, 10]
  ],
  'package order rows should keep every package balance correct and newest first'
);

const byScheduleId = new Map(row.detailLessonRecordRows.map(item => [item.scheduleId, item]));
assert.deepStrictEqual(
  [
    byScheduleId.get('sch-private-new-2')?.lessonSourceText,
    byScheduleId.get('sch-private-new-2')?.packageLessonProgressText,
    byScheduleId.get('sch-private-new-2')?.packageRemainingAfterText
  ],
  ['课包扣课｜第2/10节｜剩8节', '第2/10节', '剩8节'],
  'package-backed records should expose package progress and remaining lessons for the drawer and mini program'
);
assert.strictEqual(
  byScheduleId.get('sch-direct-private')?.lessonSourceText,
  '单次付费｜¥500',
  'direct paid lessons should show a short source label'
);
assert.strictEqual(
  byScheduleId.get('sch-gift-small')?.lessonSourceText,
  '赠送课｜免费',
  'free gifted lessons should show a short source label'
);

console.log('student lesson record source read model tests passed');
