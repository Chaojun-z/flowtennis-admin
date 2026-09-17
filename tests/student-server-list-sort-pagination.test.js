const assert = require('assert');
const { buildCustomerCenterPagePayload } = require('../server/page-data/student-roster-index-reader.js');

function studentRow(index) {
  const completedLessons = index + 1;
  return {
    id: `stu-${String(index + 1).padStart(2, '0')}`,
    studentId: `stu-${String(index + 1).padStart(2, '0')}`,
    name: `学员${index + 1}`,
    displayName: `学员${index + 1}`,
    type: index < 12 ? '成人' : '青少年',
    source: index % 2 ? '转介绍' : '小红书',
    primaryCoach: index % 4 === 0 ? '' : '汤教练',
    isActiveStudentRoster: true,
    isHistoricalStudentRoster: true,
    completedLessons,
    packageBalanceRemaining: index % 6,
    packageBalanceTotal: 20,
    detailRecentLessonDate: `2026-09-${String((index % 20) + 1).padStart(2, '0')}`,
    lastFormalLessonAt: `2026-09-${String((index % 20) + 1).padStart(2, '0')}`,
    packageStatusLabel: index % 3 === 0 ? '课包即将耗尽' : '课包有余额',
    paymentModeLabel: index % 5 === 0 ? '单次付费学员' : '课包学员',
    activityStatusLabel: '近30天活跃',
    lessonVolumeLabel: completedLessons >= 10 ? '历史课时30+' : '',
    studentStatusLabel: index % 3 === 0 ? '课包待续费' : '课包活跃中'
  };
}

function main() {
  const rows = Array.from({ length: 20 }, (_, index) => studentRow(index));
  const payload = buildCustomerCenterPagePayload({
    summaryRows: rows,
    prebuiltTeachingStudentViews: {
      summary: { activeStudentCount: rows.length, historicalStudentCount: rows.length },
      activeStudents: rows,
      historicalStudents: rows
    },
    prebuiltStandardLifecycleMetrics: {
      teachingSummary: { activeStudentCount: rows.length, historicalStudentCount: rows.length }
    },
    query: new URLSearchParams('view=activeStudents&paged=1&page=2&pageSize=5&sortKey=completedLessons&sortDir=desc')
  });

  assert.strictEqual(payload.listPage.total, 20, '后端分页 total 必须是完整集合，不是当前页 5 条');
  assert.deepStrictEqual(
    payload.listPage.rows.map(row => row.completedLessons),
    [15, 14, 13, 12, 11],
    '排序必须先作用于完整 20 条，再返回第 2 页'
  );
  assert.strictEqual(payload.listPage.facets.total, 20, '筛选“全部”计数必须来自完整集合');
  assert.strictEqual(payload.listPage.facets.type['成人'], 12, '类型筛选计数必须来自完整集合');
  assert.strictEqual(payload.listPage.facets.type['青少年'], 8, '类型筛选计数必须来自完整集合');
  assert.strictEqual(payload.listPage.facets.coach['__unassigned__'], 5, '未分配教练计数必须来自完整集合');
  assert.strictEqual(payload.listPage.facets.tags.packageStatus['课包有余额'], 13, '标签筛选计数必须来自完整集合');

  const courseRows = [
    {
      ...studentRow(100),
      id: 'course-private',
      studentId: 'course-private',
      name: '私教学员',
      displayName: '私教学员',
      detailPackageOrderRows: [{ courseType: '私教课', packageName: '成人私教正式课包', totalLessons: 10, remainingLessons: 8 }]
    },
    {
      ...studentRow(101),
      id: 'course-small',
      studentId: 'course-small',
      name: '小班学员',
      displayName: '小班学员',
      detailPackageOrderRows: [{ courseType: '小班课', courseTypeLevel2: '训练营', packageName: '青少年小班训练营课包', totalLessons: 12, remainingLessons: 10 }]
    },
    {
      ...studentRow(102),
      id: 'course-trial',
      studentId: 'course-trial',
      name: '体验学员',
      displayName: '体验学员',
      detailPackageOrderRows: [{ courseType: '体验课', experienceType: '私教体验课', packageName: '私教体验课', totalLessons: 1, remainingLessons: 0 }]
    },
    {
      ...studentRow(103),
      id: 'course-single',
      studentId: 'course-single',
      name: '单次学员',
      displayName: '单次学员',
      detailPackageOrderRows: [{ courseType: '小班课', courseTypeLevel2: '单次', packageName: '小班课单次', totalLessons: 1, remainingLessons: 0 }]
    }
  ];
  const coursePayload = buildCustomerCenterPagePayload({
    summaryRows: courseRows,
    query: new URLSearchParams('view=activeStudents&paged=1&page=1&pageSize=10&formalCourseType=私教课')
  });
  assert.deepStrictEqual(
    coursePayload.listPage.rows.map(row => row.studentId),
    ['course-private'],
    '课程类目筛选必须只命中买过对应正式课包的在期学员，并排除体验课和单次付费'
  );
  assert.strictEqual(coursePayload.listPage.facets.courseTypes['私教课'], 1, '课程类目筛选计数必须来自筛选后的完整集合');
  assert.strictEqual(coursePayload.listPage.facets.courseTypes['小班课'] || 0, 0, '已选择私教课时小班课不应混入当前筛选结果');

  console.log('student server list sort pagination tests passed');
}

main();
