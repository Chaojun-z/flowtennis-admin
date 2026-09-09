const assert = require('assert');

const { buildCoachCompletedLessonStats } = require('../server/read-models/coach-completed-lesson-stats.js');

const now = new Date('2026-09-08T12:00:00');
const schedule = [
  {
    id: 'private-1',
    coach: '朝珺',
    studentName: '王同学',
    startTime: '2026-09-07 10:00:00',
    endTime: '2026-09-07 11:00:00',
    status: '已排课',
    courseType: '私教课',
    campusName: '顺义马坡',
    venue: '3号场',
    lessonCount: 1
  },
  {
    id: 'small-1',
    coach: '朝珺',
    studentNames: ['李同学', '张同学'],
    startTime: '2026-09-08 09:00:00',
    endTime: '2026-09-08 10:30:00',
    status: '已排课',
    courseType: '大师课',
    standardCourseType: '大师课',
    campus: 'shunyi_mapo',
    venue: '1号场',
    lessonCount: 1
  },
  {
    id: 'trial-1',
    coach: '朝珺教练',
    studentName: '赵同学',
    startTime: '2026-09-08 10:30:00',
    endTime: '2026-09-08 11:00:00',
    status: '已结束',
    courseType: '体验课',
    experienceType: '小班体验课',
    campusName: '朝阳十里堡',
    venue: '2号场',
    lessonCount: 0.5
  },
  {
    id: 'cancelled',
    coach: '朝珺',
    studentName: '取消课',
    startTime: '2026-09-08 08:00:00',
    endTime: '2026-09-08 09:00:00',
    status: '已取消',
    courseType: '私教课',
    lessonCount: 1
  },
  {
    id: 'future',
    coach: '朝珺',
    studentName: '未来课',
    startTime: '2026-09-08 18:00:00',
    endTime: '2026-09-08 19:00:00',
    status: '已排课',
    courseType: '私教课',
    lessonCount: 1
  },
  {
    id: 'other-coach',
    coach: '其他教练',
    studentName: '其他学员',
    startTime: '2026-09-08 10:00:00',
    endTime: '2026-09-08 11:00:00',
    status: '已结束',
    courseType: '私教课',
    lessonCount: 1
  },
  {
    id: 'coach-id-only',
    coachId: 'coach-001',
    studentName: 'ID 教练学员',
    startTime: '2026-09-08 11:00:00',
    endTime: '2026-09-08 12:00:00',
    status: '已结束',
    courseType: '私教课',
    lessonCount: 1
  },
  {
    id: 'lesson-count-priority',
    coach: '朝珺',
    studentName: '课时优先学员',
    startTime: '2026-09-08 07:30:00',
    endTime: '2026-09-08 09:00:00',
    status: '已结束',
    courseType: '私教课',
    lessonCount: 1
  }
];

const result = buildCoachCompletedLessonStats({
  schedule,
  user: { role: 'editor', name: '朝珺', coachName: '朝珺', coachId: 'coach-001' },
  view: 'week',
  startDate: '2026-09-07',
  endDate: '2026-09-13',
  now
});

assert.strictEqual(result.metricSource.matchesAdminMetric, true, 'stats should declare admin metric alignment');
assert.strictEqual(result.summary.totalLessonUnits, 4.5, 'total should sum lessonCount first and only fall back to duration when lessonCount is missing');
assert.deepStrictEqual(
  result.summary.typeHighlights,
  [
    { type: '私教课', lessonUnits: 3 },
    { type: '小班课', lessonUnits: 1 },
    { type: '体验课', lessonUnits: 0.5 }
  ],
  'type highlights should use admin coach course grouping and lesson units'
);
assert.deepStrictEqual(
  result.byType.map(row => ({ type: row.type, lessonUnits: row.lessonUnits, percent: row.percent })),
  [
    { type: '私教课', lessonUnits: 3, percent: 66.7 },
    { type: '小班课', lessonUnits: 1, percent: 22.2 },
    { type: '体验课', lessonUnits: 0.5, percent: 11.1 }
  ],
  'byType should expose admin grouped course mix'
);
assert.deepStrictEqual(
  result.trend.map(row => ({ key: row.key, lessonUnits: row.lessonUnits })),
  [
    { key: '2026-09-07', lessonUnits: 1 },
    { key: '2026-09-08', lessonUnits: 3.5 },
    { key: '2026-09-09', lessonUnits: 0 },
    { key: '2026-09-10', lessonUnits: 0 },
    { key: '2026-09-11', lessonUnits: 0 },
    { key: '2026-09-12', lessonUnits: 0 },
    { key: '2026-09-13', lessonUnits: 0 }
  ],
  'weekly trend should include every day in range'
);
assert.deepStrictEqual(
  result.detailGroups.map(group => ({ key: group.key, lessonUnits: group.lessonUnits, count: group.items.length })),
  [
    { key: '2026-09-08', lessonUnits: 3.5, count: 4 },
    { key: '2026-09-07', lessonUnits: 1, count: 1 }
  ],
  'detail groups should be ordered newest date first and include completed lessons only'
);
assert.strictEqual(
  result.detailGroups[0].items.find(item => item.courseTypeText === '体验课').locationText,
  '朝阳十里堡 · 2号场',
  'detail should reuse cleaned location text'
);
assert.strictEqual(
  result.detailGroups[0].items.find(item => item.courseTypeText === '大师课').courseTypeText,
  '大师课',
  'detail can show the precise course type while summary groups as 小班课'
);

console.log('coach completed lesson stats tests passed');
