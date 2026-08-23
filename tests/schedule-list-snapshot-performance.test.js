const assert = require('assert');

const {
  SNAPSHOT_ACTIVE_DELTA_ID,
  SNAPSHOT_ACTIVE_META_ID,
  buildSnapshotRows,
  createScheduleListSnapshotLoader
} = require('../server/page-data/schedule-list-snapshot.js');

const count = 5000;
const schedule = Array.from({ length: count }, (_, index) => {
  const n = index + 1;
  const day = String((n % 28) + 1).padStart(2, '0');
  return {
    id: `schedule-${n}`,
    startTime: `2026-08-${day} 10:00`,
    endTime: `2026-08-${day} 11:00`,
    studentIds: [`student-${n}`],
    courseType: n % 3 === 0 ? '班课' : '私教课',
    coach: n % 2 === 0 ? 'coach-a' : 'coach-b',
    campus: n % 2 === 0 ? 'shunyi_mapo' : 'chaoyang_shilibao',
    venue: `${n % 4 + 1}号场`,
    status: n % 10 === 0 ? '已取消' : '已排课',
    notes: n % 9 === 0 ? `搜索目标${n}` : '',
    lessonCount: 1,
    entitlementId: `ent-${n}`,
    updatedAt: `2026-08-${day} 09:00:00`,
    createdAt: `2026-08-${day} 08:00:00`
  };
});
const sourceData = {
  schedule,
  students: schedule.map((row, index) => ({
    id: row.studentIds[0],
    name: `学员${index + 1}`,
    phone: `139${String(index + 1).padStart(8, '0')}`
  })),
  coaches: [{ id: 'coach-a', name: '教练甲' }, { id: 'coach-b', name: '教练乙' }],
  users: [],
  feedbacks: schedule.filter((row, index) => index % 4 === 0).map((row) => ({ id: `fb-${row.id}`, scheduleId: row.id })),
  coachProposals: schedule.filter((row, index) => index % 6 === 0).map((row) => ({ id: `proposal-${row.id}`, scheduleId: row.id })),
  coachRefs: [{ id: 'coach-a', name: '教练甲' }, { id: 'coach-b', name: '教练乙' }]
};

const { meta, bundle } = buildSnapshotRows(sourceData, {
  batchId: 'perf-snapshot',
  completedAt: '2026-08-23T10:00:00.000Z',
  sourceSnapshotAt: '2026-08-23T09:59:00.000Z'
});
const tableRows = new Map([
  [SNAPSHOT_ACTIVE_META_ID, meta],
  [bundle.id, bundle],
  [SNAPSHOT_ACTIVE_DELTA_ID, { id: SNAPSHOT_ACTIVE_DELTA_ID, upserts: [], deletes: [], count: 0 }]
]);
let scanCalled = false;
const loader = createScheduleListSnapshotLoader({
  getCachedRow: async (table, id) => tableRows.get(id) || null,
  getCachedScan: async () => {
    scanCalled = true;
    return [];
  },
  tables: { scheduleListSnapshot: 'snapshot' }
});

const scenarios = [
  ['默认首屏', { page: 1, pageSize: 15 }],
  ['校区筛选', { page: 1, pageSize: 15, campus: 'shunyi_mapo' }],
  ['日期筛选', { page: 1, pageSize: 15, startDate: '2026-08-01', endDate: '2026-08-31' }],
  ['搜索', { page: 1, pageSize: 15, q: '搜索目标' }],
  ['翻页', { page: 2, pageSize: 15, campus: 'shunyi_mapo', startDate: '2026-08-01', endDate: '2026-08-31' }]
];

(async () => {
  const report = [];
  for (const [label, options] of scenarios) {
    const times = [];
    for (let i = 0; i < 3; i += 1) {
      const started = Date.now();
      const view = await loader(options);
      const elapsed = Date.now() - started;
      times.push(elapsed);
      assert.ok(elapsed < 1000, `${label} 5000 条快照筛选统计分页应在 1s 内完成，实际 ${elapsed}ms`);
      assert.strictEqual(view.items.length, 15, `${label} 当前页只应返回 pageSize 条`);
      assert.ok(view.pagination.total > view.items.length, `${label} total 应是完整筛选结果总数`);
      assert.strictEqual(view.meta.source, 'schedule-list-snapshot', `${label} 应走排课快照`);
    }
    report.push(`${label}: ${times.join('ms / ')}ms`);
  }
  assert.strictEqual(scanCalled, false, '快照读取链路不得调用 scan');
  console.log(`schedule list snapshot performance tests passed\n${report.join('\n')}`);
})().catch((error) => {
  console.error(error);
  process.exit(1);
});
