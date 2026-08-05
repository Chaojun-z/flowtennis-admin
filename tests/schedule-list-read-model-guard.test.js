const assert = require('assert');
const fs = require('fs');
const path = require('path');

const modulePath = path.join(__dirname, '../server/page-data/schedule-list-read-model.js');
const samplePath = path.join(__dirname, '../docs/prd/source/08-具体需求/01-管理后台/02-教学与排课/07-排课管理固定验收样本.json');

assert.ok(fs.existsSync(modulePath), '排课列表读模型应拆到独立模块');
assert.ok(fs.existsSync(samplePath), '排课管理固定验收样本应落库');

const sampleRows = JSON.parse(fs.readFileSync(samplePath, 'utf8'));
assert.strictEqual(Array.isArray(sampleRows), true, '排课固定验收样本文件应为数组');
assert.strictEqual(sampleRows.length, 20, '排课固定验收样本应固定为 20 条');
sampleRows.forEach((row, index) => {
  assert.ok(row.id, `样本 ${index + 1} 应有排课 ID`);
  assert.ok(row.maskedName, `样本 ${index + 1} 应保留脱敏姓名`);
  assert.ok(String(row.maskedName).includes('*'), `样本 ${index + 1} 姓名应脱敏`);
  assert.ok(row.scenario, `样本 ${index + 1} 应标记覆盖场景`);
});

const {
  buildScheduleListViewFromData,
  createScheduleListViewLoader,
  createScheduleListCompareLoader
} = require(modulePath);

assert.strictEqual(typeof buildScheduleListViewFromData, 'function', '排课列表读模型模块应导出 buildScheduleListViewFromData');
assert.strictEqual(typeof createScheduleListViewLoader, 'function', '排课列表读模型模块应导出 createScheduleListViewLoader');
assert.strictEqual(typeof createScheduleListCompareLoader, 'function', '排课列表读模型模块应导出 createScheduleListCompareLoader');

async function main() {
  const datasets = {
    schedule: [{
      id: 'schedule-1',
      startTime: '2026-08-09 10:00',
      endTime: '2026-08-09 11:30',
      studentIds: ['stu-1', 'stu-2'],
      courseType: '班课',
      coach: 'coach-1',
      campus: 'shunyi_mapo',
      venue: '1 号场',
      lessonCount: 1.5,
      status: '已排课',
      scheduleSource: '循环排课',
      entitlementId: 'ent-1',
      updatedAt: '2026-08-01 10:00:00',
      createdAt: '2026-08-01 09:00:00'
    }, {
      id: 'schedule-2',
      startTime: '2026-08-02 10:00',
      endTime: '2026-08-02 11:00',
      studentId: 'stu-3',
      studentName: '学员丙',
      courseType: '私教体验课',
      coach: '教练乙',
      campus: 'shunyi_mapo',
      venue: '2号场',
      status: '已取消',
      cancelReason: '误建',
      scheduleSource: '教练运营',
      courts: [{ id: 'should-not-return' }],
      entitlementLedger: [{ id: 'should-not-return' }],
      history: [{ id: 'should-not-return' }],
      feedbacks: [{ id: 'should-not-return' }],
      students: [{ id: 'should-not-return' }]
    }],
    students: [
      { id: 'stu-1', name: '学员甲' },
      { id: 'stu-2', name: '学员乙' },
      { id: 'stu-3', name: '学员丙' }
    ],
    coaches: [{ id: 'coach-1', name: '教练甲' }],
    users: [],
    feedbacks: [{ id: 'fb-1', scheduleId: 'schedule-1' }],
    coachProposals: [
      { id: 'proposal-1', scheduleId: 'schedule-1' },
      { id: 'proposal-orphan', scheduleId: 'missing-schedule' }
    ]
  };
  const view = buildScheduleListViewFromData({
    schedule: datasets.schedule,
    students: datasets.students,
    feedbacks: datasets.feedbacks,
    coachProposals: datasets.coachProposals,
    coachRefs: [{ id: 'coach-1', name: '教练甲' }]
  }, { page: 1, pageSize: 10 });

  assert.deepStrictEqual(Object.keys(view), ['summary', 'filters', 'items', 'pagination', 'meta'], '读模型应返回 summary/filters/items/pagination/meta');
  assert.strictEqual(view.items.length, 2, '读模型应返回可渲染列表项');
  assert.strictEqual(view.items[0].studentSummary, '学员甲 等 2 人');
  assert.strictEqual(view.items[0].coachName, '教练甲');
  assert.strictEqual(view.items[0].courseType, '小班课');
  assert.strictEqual(view.items[0].proposalStatus, '已填写');
  assert.strictEqual(view.items[0].feedbackStatus, '已填写');
  assert.strictEqual(view.items[0].entitlementSummary, '已关联权益 · 1.5课时');
  assert.strictEqual(view.items[1].effectiveStatus, '已取消');
  assert.strictEqual(view.items[1].statusLabel, '已取消');
  assert.strictEqual(view.summary.totalCount, 2);
  assert.strictEqual(view.summary.cancelledCount, 1);

  ['courts', 'entitlementLedger', 'history', 'feedbacks', 'students'].forEach((field) => {
    assert.strictEqual(view.items[1][field], undefined, `默认列表不应返回 ${field} 全量明细`);
  });

  const getCachedScan = async (tableName) => datasets[tableName] || [];
  const loadView = createScheduleListViewLoader({
    getScheduleListRows: async () => datasets.schedule,
    getCachedScan,
    scanCoachProposals: async () => datasets.coachProposals,
    buildCoachRefs: ({ coaches }) => coaches,
    fixedScheduleSamples: sampleRows,
    tables: { students: 'students', coaches: 'coaches', users: 'users', feedbacks: 'feedbacks' }
  });
  const fixedView = await loadView({ sample: 'fixed' });
  assert.strictEqual(fixedView.meta.sampleIds.length, 20, '读模型应支持 sample=fixed');

  const idsView = await loadView({ sampleIds: ['schedule-2'] });
  assert.strictEqual(idsView.items.length, 1, '读模型应支持 ids 样本过滤');
  assert.strictEqual(idsView.items[0].id, 'schedule-2');

  const pagedView = await loadView({ page: 1, pageSize: 1, q: '教练甲' });
  assert.strictEqual(pagedView.items.length, 1, '读模型应支持服务端分页和搜索');
  assert.strictEqual(pagedView.pagination.total, 1, '读模型分页应返回筛选后的总数');

  const loadCompare = createScheduleListCompareLoader({
    getScheduleListRows: async () => datasets.schedule,
    getCachedScan,
    scanCoachProposals: async () => datasets.coachProposals,
    buildCoachRefs: ({ coaches }) => coaches,
    fixedScheduleSamples: sampleRows,
    tables: { students: 'students', coaches: 'coaches', users: 'users', feedbacks: 'feedbacks' }
  });
  const compare = await loadCompare({ sampleIds: ['schedule-1'] });
  assert.deepStrictEqual(Object.keys(compare), ['meta', 'summaryDiffs', 'items'], 'compare 输出应返回 meta/summaryDiffs/items');
  assert.strictEqual(compare.items.length, 1, 'compare 应支持按样本 ID 过滤');
  assert.strictEqual(compare.items[0].id, 'schedule-1');
  assert.ok(Array.isArray(compare.items[0].diffs), 'compare 应输出字段差异数组');
  assert.deepStrictEqual(compare.meta.risks.orphanCoachProposalScheduleIds, ['missing-schedule'], 'compare 应暴露悬空课前教案 scheduleId 风险');
}

main()
  .then(() => console.log('schedule list read model guard tests passed'))
  .catch((error) => {
    console.error(error);
    process.exit(1);
  });
