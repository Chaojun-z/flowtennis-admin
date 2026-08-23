const assert = require('assert');

const {
  SCHEDULE_LIST_SNAPSHOT_NOT_READY_CODE,
  SNAPSHOT_ACTIVE_DELTA_ID,
  SNAPSHOT_ACTIVE_META_ID,
  SNAPSHOT_DELTA_MERGE_THRESHOLD,
  buildSnapshotRows,
  createScheduleListSnapshotLoader,
  createScheduleListSnapshotSync,
  snapshotHealth
} = require('../server/page-data/schedule-list-snapshot.js');

function makeSourceData(count = 120) {
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
      notes: n % 11 === 0 ? `搜索目标${n}` : '',
      lessonCount: 1,
      entitlementId: `ent-${n}`,
      updatedAt: `2026-08-${day} 09:00:00`,
      createdAt: `2026-08-${day} 08:00:00`
    };
  });
  const students = schedule.map((row, index) => ({
    id: row.studentIds[0],
    name: `学员${index + 1}`,
    phone: `139${String(index + 1).padStart(8, '0')}`
  }));
  const coaches = [{ id: 'coach-a', name: '教练甲' }, { id: 'coach-b', name: '教练乙' }];
  return {
    schedule,
    students,
    coaches,
    users: [],
    feedbacks: [{ id: 'fb-1', scheduleId: 'schedule-3' }],
    coachProposals: [{ id: 'proposal-1', scheduleId: 'schedule-3' }],
    coachRefs: coaches
  };
}

async function main() {
  const sourceData = makeSourceData(120);
  const { meta, bundle, rows } = buildSnapshotRows(sourceData, {
    batchId: 'test-batch',
    completedAt: '2026-08-23T10:00:00.000Z',
    sourceSnapshotAt: '2026-08-23T09:59:00.000Z'
  });
  assert.strictEqual(meta.id, SNAPSHOT_ACTIVE_META_ID, '快照应使用 active meta 作为启用开关');
  assert.strictEqual(meta.status, 'published', '排课快照只有 published 才能上线读取');
  assert.strictEqual(meta.batchId, 'test-batch', '快照 meta 必须带 batchId');
  assert.strictEqual(meta.completedAt, '2026-08-23T10:00:00.000Z', '快照 meta 必须带 completedAt');
  assert.strictEqual(meta.sourceSnapshotAt, '2026-08-23T09:59:00.000Z', '快照 meta 必须带 sourceSnapshotAt');
  assert.strictEqual(meta.checksum.length, 64, '快照 meta 必须带 checksum');
  assert.ok(bundle.payload.length < JSON.stringify(rows).length, '快照包应压缩保存');

  const tableRows = new Map([
    [meta.id, meta],
    [bundle.id, bundle],
    [SNAPSHOT_ACTIVE_DELTA_ID, {
      id: SNAPSHOT_ACTIVE_DELTA_ID,
      upserts: [{
        ...rows[0],
        id: 'schedule-new',
        startTime: '2026-09-01 08:00',
        studentSummary: '新增学员',
        studentSearchText: '新增学员 13999990000',
        coachName: '教练甲',
        campusCode: 'shunyi_mapo',
        campusName: '顺义马坡'
      }],
      deletes: ['schedule-2'],
      count: 2,
      updatedAt: '2026-09-01T00:00:00.000Z'
    }]
  ]);
  const getCalls = [];
  const loader = createScheduleListSnapshotLoader({
    getCachedRow: async (table, id) => {
      getCalls.push({ table, id });
      return tableRows.get(id) || null;
    },
    getCachedScan: async () => {
      throw new Error('首屏快照读取不得扫描任何表');
    },
    tables: { scheduleListSnapshot: 'snapshot' }
  });
  const view = await loader({ page: 1, pageSize: 15, campus: 'shunyi_mapo' });
  assert.strictEqual(view.meta.source, 'schedule-list-snapshot', '首屏必须走排课快照');
  assert.strictEqual(view.items[0].id, 'schedule-new', 'delta 新增数据应进入筛选后的最新首屏');
  assert.ok(!view.items.some((item) => item.id === 'schedule-2'), 'delta 删除数据不应继续展示');
  assert.ok(view.pagination.total > view.items.length, 'total 应来自完整筛选结果，不是当前页数量');
  assert.deepStrictEqual(
    getCalls.map((call) => call.id),
    [SNAPSHOT_ACTIVE_META_ID, bundle.id, SNAPSHOT_ACTIVE_DELTA_ID],
    '首屏读取只能按固定 id 读快照 meta/bundle/delta'
  );

  const secondPage = await loader({ page: 2, pageSize: 15, campus: 'shunyi_mapo' });
  assert.strictEqual(secondPage.meta.source, 'schedule-list-snapshot', '翻页仍必须走快照');
  assert.strictEqual(getCalls.filter((call) => call.id === bundle.id).length, 1, '同进程翻页应复用内存快照包');

  const searchView = await loader({ page: 1, pageSize: 15, q: '13900000011' });
  assert.strictEqual(searchView.pagination.total, 1, '手机号搜索应基于快照完整结果计算 total');

  const draftRows = new Map([[meta.id, { ...meta, status: 'building' }], [bundle.id, bundle]]);
  const draftLoader = createScheduleListSnapshotLoader({
    getCachedRow: async (table, id) => draftRows.get(id) || null,
    tables: { scheduleListSnapshot: 'snapshot' }
  });
  await assert.rejects(
    () => draftLoader({ page: 1, pageSize: 15 }),
    (err) => err.code === SCHEDULE_LIST_SNAPSHOT_NOT_READY_CODE,
    'building 快照不能被首屏读取'
  );

  const brokenRows = new Map([[meta.id, { ...meta, checksum: 'bad-checksum' }], [bundle.id, bundle]]);
  const brokenLoader = createScheduleListSnapshotLoader({
    getCachedRow: async (table, id) => brokenRows.get(id) || null,
    tables: { scheduleListSnapshot: 'snapshot' }
  });
  await assert.rejects(
    () => brokenLoader({ page: 1, pageSize: 15 }),
    (err) => err.code === SCHEDULE_LIST_SNAPSHOT_NOT_READY_CODE,
    'checksum 不一致时必须拒绝展示'
  );

  const writes = [];
  const sync = createScheduleListSnapshotSync({
    getCachedRow: async () => null,
    mkTable: async (table) => { writes.push({ op: 'mkTable', table }); },
    put: async (table, id, row) => { writes.push({ op: 'put', table, id, row }); return row; },
    tables: { scheduleListSnapshot: 'snapshot', scheduleListSnapshotTasks: 'snapshotTasks' }
  });
  const dryRun = await sync.rebuildFromSourceData(sourceData, { dryRun: true, batchId: 'dry-run' });
  assert.strictEqual(dryRun.total, sourceData.schedule.length, 'dry-run 应返回完整快照数量');
  assert.deepStrictEqual(writes, [], 'dry-run 不能写表');
  const rebuild = await sync.rebuildFromSourceData(sourceData, { dryRun: false, batchId: 'write-run' });
  assert.strictEqual(rebuild.total, sourceData.schedule.length, '正式重建应写完整快照');
  assert.ok(writes.some((row) => row.id === SNAPSHOT_ACTIVE_META_ID && row.row.status === 'published'), '正式重建最后才发布 active meta');

  const deltaWrites = [];
  const deltaSync = createScheduleListSnapshotSync({
    getCachedRow: async () => ({ upserts: [], deletes: [] }),
    put: async (table, id, row) => { deltaWrites.push({ table, id, row }); return row; },
    loadDeltaSourceData: async (row) => ({ ...sourceData, schedule: [row] }),
    tables: { scheduleListSnapshot: 'snapshot', scheduleListSnapshotTasks: 'snapshotTasks' }
  });
  await deltaSync.recordDelta(sourceData.schedule[0], { reason: 'schedule-update' });
  assert.ok(deltaWrites.some((row) => row.id === SNAPSHOT_ACTIVE_DELTA_ID && row.row.upserts.length === 1), '单条变更应写入 active delta');
  await deltaSync.recordDelta(null, { scheduleId: 'schedule-1', deleted: true, reason: 'schedule-delete' });
  assert.ok(deltaWrites.some((row) => row.id === SNAPSHOT_ACTIVE_DELTA_ID && row.row.deletes.includes('schedule-1')), '删除应写入 active delta deletes');

  const forbiddenPartialWrites = [];
  const forbiddenPartialSync = createScheduleListSnapshotSync({
    getCachedRow: async () => ({ upserts: [], deletes: [] }),
    put: async (table, id, row) => { forbiddenPartialWrites.push({ table, id, row }); return row; },
    tables: { scheduleListSnapshot: 'snapshot', scheduleListSnapshotTasks: 'snapshotTasks' }
  });
  await forbiddenPartialSync.recordDelta(sourceData.schedule[0], { reason: 'missing-delta-source' });
  assert.ok(
    forbiddenPartialWrites.some((row) => row.table === 'snapshotTasks' && row.row.status === 'pending'),
    '缺少完整增量数据源时只能记录失败任务，不能只用一条排课拼索引'
  );
  assert.ok(
    !forbiddenPartialWrites.some((row) => row.table === 'snapshot' && row.id === SNAPSHOT_ACTIVE_DELTA_ID),
    '缺少完整增量数据源时不能写 active delta'
  );

  const health = snapshotHealth(
    meta,
    { count: SNAPSHOT_DELTA_MERGE_THRESHOLD, updatedAt: '2026-08-23T11:00:00.000Z' },
    null,
    { now: Date.parse('2026-08-23T12:00:00.000Z') }
  );
  assert.strictEqual(health.ok, true, 'published 且契约完整的快照健康状态应为 ok');
  assert.strictEqual(health.needsMerge, true, 'delta 达阈值应标记需要后台合并');
}

main()
  .then(() => console.log('schedule list snapshot tests passed'))
  .catch((error) => {
    console.error(error);
    process.exit(1);
  });
