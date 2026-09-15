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

  console.log('student server list sort pagination tests passed');
}

main();
