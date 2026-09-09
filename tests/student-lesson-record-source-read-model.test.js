const assert = require('assert');

const { buildTeachingStudentViews, TEACHING_LESSON_DETAIL_SOURCE_VERSION } = require('../server/read-models/platform-metrics.js');

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
  row.detailPackageOrderRows.map(item => [item.packageRecordKey, item.entitlementId, item.remainingLessons, item.totalLessons]),
  [
    ['ent:ent-private-new', 'ent-private-new', 8, 10],
    ['ent:ent-special', 'ent-special', 3, 4],
    ['ent:ent-small', 'ent-small', 6, 8],
    ['ent:ent-private-old', 'ent-private-old', 1, 10]
  ],
  'package order rows should keep every package balance correct and newest first'
);

const byScheduleId = new Map(row.detailLessonRecordRows.map(item => [item.scheduleId, item]));
assert.strictEqual(
  byScheduleId.get('sch-private-new-2')?.packageRecordKey,
  'ent:ent-private-new',
  'package-backed lesson records should carry the same strict package record key as the package card'
);
assert.deepStrictEqual(
  row.detailLessonRecordRows
    .filter(item => item.packageRecordKey === 'ent:ent-private-new')
    .map(item => item.scheduleId),
  ['sch-private-new-2', 'sch-private-new-1'],
  'strict package filtering should only return records that belong to the clicked package'
);
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

const overflowSchedules = Array.from({ length: 18 }, (_, index) => ({
  id: `sch-wjing-overflow-${index + 1}`,
  entitlementId: 'ent-wjing-ten',
  purchaseId: 'pur-wjing-ten',
  studentId: 'wjing-overflow',
  startTime: `2026-06-${String(index + 1).padStart(2, '0')} 09:00:00`,
  endTime: `2026-06-${String(index + 1).padStart(2, '0')} 10:00:00`,
  status: '已结束',
  courseType: index >= 10 ? '专项课' : '私教课',
  venue: `${(index % 3) + 1}号场`,
  coach: index >= 10 ? '其他教练' : 'Siren 教练',
  lessonCount: 1
}));
const overflowViews = buildTeachingStudentViews([{
  customerKey: 'student:wjing-overflow',
  studentId: 'wjing-overflow',
  displayName: 'W.Jing',
  studentStage: 'formal'
}], {
  students: [{ id: 'wjing-overflow', name: 'W.Jing', type: '成人', campus: 'shunyi_mapo', primaryCoach: 'Siren 教练' }],
  purchases: [{ id: 'pur-wjing-ten', studentId: 'wjing-overflow', packageName: '成人1v1 朝珺非黄金10课时', courseType: '私教课', status: 'active', purchaseDate: '2026-04-05', actualAmount: 3500 }],
  entitlements: [{ id: 'ent-wjing-ten', purchaseId: 'pur-wjing-ten', studentId: 'wjing-overflow', packageName: '成人1v1 朝珺非黄金10课时', courseType: '私教课', totalLessons: 10, usedLessons: 10, remainingLessons: 0, status: 'depleted', ownerCoach: 'Siren 教练' }],
  entitlementLedger: overflowSchedules.map((schedule, index) => ({
    id: `ledger-wjing-overflow-${index + 1}`,
    entitlementId: 'ent-wjing-ten',
    purchaseId: 'pur-wjing-ten',
    studentId: 'wjing-overflow',
    scheduleId: schedule.id,
    lessonDelta: -1,
    relatedDate: schedule.startTime.slice(0, 10),
    reason: '上课消耗'
  })),
  schedule: overflowSchedules,
  now
});
const overflowStudent = overflowViews.historicalStudents.find(item => item.studentId === 'wjing-overflow');
assert.ok(overflowStudent, 'W.Jing-style overflow student should be present');
const filteredOverflowRows = overflowStudent.detailLessonRecordRows.filter(item => item.packageRecordKey === 'ent:ent-wjing-ten');
assert.strictEqual(
  filteredOverflowRows.reduce((sum, item) => sum + Math.abs(Number(item.lessonDelta) || 0), 0),
  10,
  'a 10-hour package filter must never show more than 10 consumed hours'
);
assert.strictEqual(filteredOverflowRows.length, 10, 'a 10-hour package filter must not return 18 mixed lesson rows');
assert.ok(
  overflowStudent.detailLessonRecordRows.filter(item => String(item.lessonSourceText || '') === '待核对｜课包超额').every(item => item.packageRecordKey !== 'ent:ent-wjing-ten'),
  'overflow lesson rows should stay out of the clicked package filter'
);
assert.ok(
  overflowStudent.detailLessonRecordRows.filter(item => String(item.lessonSourceText || '') === '待核对｜课包超额').length === 8,
  'the eight extra W.Jing-style rows should be marked for data audit'
);
assert.ok(
  !overflowStudent.detailLessonRecordRows.some(item => /第1[1-8]\/10/.test(String(item.lessonSourceText || ''))),
  'package progress must not display impossible 11-18/10 labels'
);

const manualConsumeViews = buildTeachingStudentViews([{
  customerKey: 'student:manual-ledger-student',
  studentId: 'manual-ledger-student',
  displayName: '手动消课学员',
  studentStage: 'formal'
}], {
  students: [{ id: 'manual-ledger-student', name: '手动消课学员', type: '成人', campus: 'shunyi_mapo', primaryCoach: 'Siren 教练' }],
  purchases: [{ id: 'pur-manual-ledger', studentId: 'manual-ledger-student', packageName: '成人1v1 10课时', courseType: '私教课', status: 'active', purchaseDate: '2026-05-01', actualAmount: 5000 }],
  entitlements: [{ id: 'ent-manual-ledger', purchaseId: 'pur-manual-ledger', studentId: 'manual-ledger-student', packageName: '成人1v1 10课时', courseType: '私教课', totalLessons: 10, usedLessons: 1, remainingLessons: 9, status: 'active', ownerCoach: 'Siren 教练' }],
  entitlementLedger: [{
    id: 'ledger-manual-stale-schedule',
    entitlementId: 'ent-manual-ledger',
    purchaseId: 'pur-manual-ledger',
    studentId: 'manual-ledger-student',
    scheduleId: 'missing-old-schedule-id',
    lessonDelta: -1,
    relatedDate: '2026-06-01',
    reason: '手动消课'
  }],
  schedule: [],
  now
});
const manualConsumeStudent = manualConsumeViews.historicalStudents.find(item => item.studentId === 'manual-ledger-student');
assert.ok(manualConsumeStudent, 'manual consume student should be present');
assert.strictEqual(
  manualConsumeStudent.completedLessons,
  1,
  'manual consumed package hours must count in the same cumulative lesson model even when the old schedule row is missing'
);
assert.deepStrictEqual(
  manualConsumeStudent.detailLessonRecordRows.map(item => [item.packageRecordKey, item.studentLessonSequenceText, item.lessonSourceText]),
  [['ent:ent-manual-ledger', '[累计第01节]', '课包扣课｜第1/10节｜剩9节']],
  'manual consumed package hours must stay visible in the package filter instead of disappearing from the drawer'
);

const editedConsumeViews = buildTeachingStudentViews([{
  customerKey: 'student:edited-ledger-student',
  studentId: 'edited-ledger-student',
  displayName: '编辑消课学员',
  studentStage: 'formal'
}], {
  students: [{ id: 'edited-ledger-student', name: '编辑消课学员', type: '成人', campus: 'shunyi_mapo', primaryCoach: 'Siren 教练' }],
  purchases: [{ id: 'pur-edited-ledger', studentId: 'edited-ledger-student', packageName: '成人1v1 10课时', courseType: '私教课', status: 'active', purchaseDate: '2026-05-01', actualAmount: 5000 }],
  entitlements: [{ id: 'ent-edited-ledger', purchaseId: 'pur-edited-ledger', studentId: 'edited-ledger-student', packageName: '成人1v1 10课时', courseType: '私教课', totalLessons: 10, usedLessons: 1, remainingLessons: 9, status: 'active', ownerCoach: 'Siren 教练' }],
  entitlementLedger: [
    {
      id: 'ledger-edited-original',
      entitlementId: 'ent-edited-ledger',
      purchaseId: 'pur-edited-ledger',
      studentId: 'edited-ledger-student',
      scheduleId: 'schedule-edited-ledger',
      lessonDelta: -2,
      relatedDate: '2026-06-02T10:00:00.000Z',
      reason: '排课消课'
    },
    {
      id: 'ledger-edited-final',
      entitlementId: 'ent-edited-ledger',
      purchaseId: 'pur-edited-ledger',
      studentId: 'edited-ledger-student',
      scheduleId: 'schedule-edited-ledger',
      lessonDelta: -1,
      relatedDate: '2026-06-02T10:05:00.000Z',
      reason: '编辑排课消课'
    },
    {
      id: 'ledger-edited-partial-return',
      entitlementId: 'ent-edited-ledger',
      purchaseId: 'pur-edited-ledger',
      studentId: 'edited-ledger-student',
      scheduleId: 'schedule-edited-partial-return',
      lessonDelta: 1,
      relatedDate: '2026-06-03T10:04:00.000Z',
      reason: '编辑排课退回旧权益'
    },
    {
      id: 'ledger-edited-partial-final',
      entitlementId: 'ent-edited-ledger',
      purchaseId: 'pur-edited-ledger',
      studentId: 'edited-ledger-student',
      scheduleId: 'schedule-edited-partial-return',
      lessonDelta: -2,
      relatedDate: '2026-06-03T10:05:00.000Z',
      reason: '编辑排课消课'
    }
  ],
  schedule: [
    {
      id: 'schedule-edited-ledger',
      studentId: 'edited-ledger-student',
      studentIds: ['edited-ledger-student'],
      startTime: '2026-06-02 10:00:00',
      endTime: '2026-06-02 11:00:00',
      status: '已排课',
      courseType: '私教课',
      venue: '3号场',
      coach: 'Siren 教练'
    },
    {
      id: 'schedule-edited-partial-return',
      studentId: 'edited-ledger-student',
      studentIds: ['edited-ledger-student'],
      startTime: '2026-06-03 10:00:00',
      endTime: '2026-06-03 12:00:00',
      status: '已排课',
      courseType: '私教课',
      venue: '3号场',
      coach: 'Siren 教练'
    }
  ],
  now
});
const editedConsumeStudent = editedConsumeViews.historicalStudents.find(item => item.studentId === 'edited-ledger-student');
assert.ok(editedConsumeStudent, 'edited consume student should be present');
assert.strictEqual(
  editedConsumeStudent.completedLessons,
  3,
  'edited consume rows must use the final edited deduction, including W.Jing-style partial return rows'
);
assert.deepStrictEqual(
  editedConsumeStudent.detailLessonRecordRows.map(item => [item.lessonDelta, item.studentLessonSequenceText, item.lessonSourceText]),
  [
    [-2, '[累计第02-03节]', '课包扣课｜第2-3/10节｜剩7节'],
    [-1, '[累计第01节]', '课包扣课｜第1/10节｜剩9节']
  ],
  'the drawer should show the edited final consume row once, not duplicate old and new deductions'
);

const pendingCumulativeViews = buildTeachingStudentViews([{
  customerKey: 'student:pending-cumulative-student',
  studentId: 'pending-cumulative-student',
  displayName: '待上课累计学员',
  studentStage: 'formal'
}], {
  students: [{ id: 'pending-cumulative-student', name: '待上课累计学员', type: '成人', campus: 'shunyi_mapo', primaryCoach: 'Siren 教练' }],
  purchases: [
    { id: 'pur-pending-old', studentId: 'pending-cumulative-student', packageName: '旧课包', courseType: '私教课', status: 'active', purchaseDate: '2026-05-01', actualAmount: 4500 },
    { id: 'pur-pending-new', studentId: 'pending-cumulative-student', packageName: '新课包', courseType: '私教课', status: 'active', purchaseDate: '2026-09-09', actualAmount: 4500 }
  ],
  entitlements: [
    { id: 'ent-pending-old', purchaseId: 'pur-pending-old', studentId: 'pending-cumulative-student', packageName: '旧课包', courseType: '私教课', totalLessons: 30, usedLessons: 27.5, remainingLessons: 2.5, status: 'active', ownerCoach: 'Siren 教练' },
    { id: 'ent-pending-new', purchaseId: 'pur-pending-new', studentId: 'pending-cumulative-student', packageName: '新课包', courseType: '私教课', totalLessons: 10, usedLessons: 1.5, remainingLessons: 8.5, status: 'active', ownerCoach: 'Siren 教练' }
  ],
  entitlementLedger: [
    ...Array.from({ length: 27 }, (_, index) => ({
      id: `ledger-pending-old-${index + 1}`,
      entitlementId: 'ent-pending-old',
      purchaseId: 'pur-pending-old',
      studentId: 'pending-cumulative-student',
      scheduleId: `schedule-pending-old-${index + 1}`,
      lessonDelta: -1,
      relatedDate: `2026-08-${String(index + 1).padStart(2, '0')}`,
      reason: '上课消耗'
    })),
    {
      id: 'ledger-pending-old-half',
      entitlementId: 'ent-pending-old',
      purchaseId: 'pur-pending-old',
      studentId: 'pending-cumulative-student',
      scheduleId: 'schedule-pending-old-half',
      lessonDelta: -0.5,
      relatedDate: '2026-08-28',
      reason: '上课消耗'
    },
    {
      id: 'ledger-pending-future',
      entitlementId: 'ent-pending-new',
      purchaseId: 'pur-pending-new',
      studentId: 'pending-cumulative-student',
      scheduleId: 'schedule-pending-future',
      lessonDelta: -1.5,
      relatedDate: '2026-09-10',
      reason: '未来预约占用'
    }
  ],
  schedule: [
    ...Array.from({ length: 27 }, (_, index) => ({
      id: `schedule-pending-old-${index + 1}`,
      studentId: 'pending-cumulative-student',
      startTime: `2026-08-${String(index + 1).padStart(2, '0')} 15:30:00`,
      endTime: `2026-08-${String(index + 1).padStart(2, '0')} 16:30:00`,
      status: '已结束',
      courseType: '私教课',
      venue: '2号场',
      coach: 'Siren 教练',
      lessonCount: 1
    })),
    {
      id: 'schedule-pending-old-half',
      studentId: 'pending-cumulative-student',
      startTime: '2026-08-28 15:30:00',
      endTime: '2026-08-28 16:00:00',
      status: '已结束',
      courseType: '私教课',
      venue: '2号场',
      coach: 'Siren 教练',
      lessonCount: 0.5
    },
    {
      id: 'schedule-pending-future',
      studentId: 'pending-cumulative-student',
      entitlementId: 'ent-pending-new',
      purchaseId: 'pur-pending-new',
      startTime: '2026-09-10 15:30:00',
      endTime: '2026-09-10 17:00:00',
      status: '已排课',
      courseType: '私教课',
      venue: '2号场',
      coach: 'Siren 教练',
      lessonCount: 1.5
    }
  ],
  now: new Date('2026-09-09 12:00:00')
});
const pendingCumulativeStudent = pendingCumulativeViews.historicalStudents.find(item => item.studentId === 'pending-cumulative-student')
  || pendingCumulativeViews.activeStudents.find(item => item.studentId === 'pending-cumulative-student');
assert.ok(pendingCumulativeStudent, 'pending cumulative student should be present');
const pendingFutureRow = pendingCumulativeStudent.detailLessonRecordRows.find(item => item.scheduleId === 'schedule-pending-future');
assert.strictEqual(pendingCumulativeStudent.completedLessons, 27.5, 'future package occupations must not change completed cumulative lessons');
assert.strictEqual(pendingCumulativeStudent.detailRecentLessonDate, '2026-08-28', 'future package occupations must not replace the latest completed lesson date');
assert.strictEqual(pendingFutureRow?.studentLessonSequenceText, '', 'future package occupations must not consume the completed cumulative sequence field');
assert.strictEqual(pendingFutureRow?.pendingStudentLessonSequenceText, '[待上课｜预计累计第28-29节]', 'future package occupations should show a separate estimated cumulative sequence for operators');
assert.strictEqual(pendingFutureRow?.lessonSourceText, '课包占用｜第1-1.5/10节｜预计剩8.5节', 'future package occupations should keep current-package progress separate from estimated cumulative sequence');
assert.strictEqual(TEACHING_LESSON_DETAIL_SOURCE_VERSION, 'lesson-record-v8', 'adding pendingStudentLessonSequenceText changes summary shape and must invalidate lesson-record-v7 cached summaries');

console.log('student lesson record source read model tests passed');
