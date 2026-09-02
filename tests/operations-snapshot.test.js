const assert = require('assert');
const crypto = require('crypto');

const {
  OPERATIONS_SNAPSHOT_NOT_READY_CODE,
  SNAPSHOT_BUNDLE_INLINE_LIMIT,
  SNAPSHOT_SOURCE_MARKER_ID,
  buildOperationsSnapshot,
  createOperationsSnapshotLoader,
  createOperationsSnapshotSync,
  metaIdForScopeKey,
  scopeKey,
  taskIdForScopeKey
} = require('../server/page-data/operations-snapshot.js');
const { getOperationsRowsCacheKey } = require('../server/read-models/operations-source.js');

const user = { id: 'admin-1', role: 'admin', dataScope: '', campusIds: [] };
const augustScope = {
  campus: 'shunyi_mapo',
  campusName: '顺义马坡',
  dateRange: { startDate: '2026-08-01', endDate: '2026-08-31' },
  metricScope: { campus: 'shunyi_mapo', campusName: '顺义马坡', startDate: '2026-08-01', endDate: '2026-08-31' }
};
const julyScope = {
  ...augustScope,
  dateRange: { startDate: '2026-07-01', endDate: '2026-07-31' },
  metricScope: { campus: 'shunyi_mapo', campusName: '顺义马坡', startDate: '2026-07-01', endDate: '2026-07-31' }
};
const augustCoachScope = { ...augustScope, view: 'coach' };

async function main() {
  const payload = {
    campuses: [{ id: 'shunyi_mapo', name: '顺义马坡' }],
    operations: {
      coach: {
        rows: [{ coachName: '朝珺', privateLessons: 18, revenue: 36000 }]
      }
    },
    generatedAt: '2026-09-01T00:00:00.000Z'
  };
  const augustBuilt = buildOperationsSnapshot({
    payload,
    user,
    scope: augustScope,
    batchId: 'august-batch',
    completedAt: '2026-09-01T00:00:00.000Z',
    sourceSnapshotAt: '2026-09-01T00:00:00.000Z'
  });
  assert.notStrictEqual(
    scopeKey(user, augustScope),
    scopeKey(user, augustCoachScope),
    '教练轻量视图必须使用独立快照 key，不能覆盖经营总览快照'
  );
  assert.strictEqual(
    scopeKey({ id: 'admin-a', role: 'admin', dataScope: '', campusIds: [] }, augustCoachScope),
    scopeKey({ id: 'admin-b', role: 'admin', dataScope: 'all', campusIds: [] }, augustCoachScope),
    '全局管理员不论账号和 dataScope 空值差异，都必须命中同一份教练人效快照'
  );
  assert.strictEqual(
    getOperationsRowsCacheKey({ id: 'admin-a', role: 'admin', dataScope: '', campusIds: [] }),
    getOperationsRowsCacheKey({ id: 'admin-b', role: 'admin', dataScope: 'all', campusIds: [] }),
    '经营分析原始行缓存也必须按权限范围共享，不能按管理员账号拆开'
  );
  const tableRows = new Map([
    [augustBuilt.meta.id, augustBuilt.meta],
    [augustBuilt.bundle.id, augustBuilt.bundle]
  ]);
  const calls = [];
  const loader = createOperationsSnapshotLoader({
    getCachedRow: async (table, id) => {
      calls.push({ table, id });
      return tableRows.get(id) || null;
    },
    getCachedScan: async () => {
      throw new Error('经营页首屏不得扫描事实表');
    },
    tables: { operationsSnapshot: 'snapshot' }
  });
  const view = await loader({ user, scope: augustScope });
  assert.strictEqual(view.snapshot.source, 'operations-snapshot', '经营页必须从快照读取');
  assert.strictEqual(view.operations.coach.rows[0].coachName, '朝珺', '教练人效数据应来自当前范围快照');
  const sharedAdminView = await loader({ user: { id: 'admin-2', role: 'admin', dataScope: '', campusIds: [] }, scope: augustScope });
  assert.strictEqual(sharedAdminView.operations.coach.rows[0].coachName, '朝珺', '同权限管理员应共享同一份经营快照，不能每人首次打开都重建');
  assert.deepStrictEqual(
    calls.slice(0, 1).map((call) => call.id),
    [augustBuilt.meta.id],
    '首屏只能按固定 id 读 meta，不能扫大表或二次读 bundle'
  );

  await assert.rejects(
    () => loader({ user, scope: julyScope }),
    (err) => err.code === OPERATIONS_SNAPSHOT_NOT_READY_CODE,
    '7 月没有对应快照时不能返回 8 月朝珺数据'
  );

  tableRows.set(augustBuilt.meta.id, {
    ...augustBuilt.meta,
    sourceChangedAt: '2026-09-01T00:00:01.000Z'
  });
  await assert.rejects(
    () => loader({ user, scope: augustScope, forceFresh: true }),
    (err) => err.code === OPERATIONS_SNAPSHOT_NOT_READY_CODE,
    '源数据比快照新时不能展示旧教练人效'
  );
  const refreshingView = await loader({ user, scope: augustScope, allowRefreshing: true });
  assert.strictEqual(refreshingView.operations.coach.rows[0].coachName, '朝珺', '源数据更新后允许页面快速展示已发布快照');
  assert.strictEqual(refreshingView.snapshot.refreshing, true, '源数据更新后应标记后台刷新中');

  const largePayload = {
    campuses: payload.campuses,
    operations: {
      overview: { kpis: [] },
      coach: { rows: [{ coachName: '朝珺', raw: crypto.randomBytes(SNAPSHOT_BUNDLE_INLINE_LIMIT + 300000).toString('base64') }] }
    }
  };
  const largeBuilt = buildOperationsSnapshot({
    payload: largePayload,
    user,
    scope: augustScope,
    batchId: 'large-batch',
    completedAt: '2026-09-01T00:00:03.000Z',
    sourceSnapshotAt: '2026-09-01T00:00:03.000Z'
  });
  assert.ok(largeBuilt.bundle.chunkCount > 1, '超过 TableStore 单列上限的大快照必须分片');
  assert.ok(largeBuilt.chunks.every(chunk => chunk.payload.length <= SNAPSHOT_BUNDLE_INLINE_LIMIT), '每个快照分片必须小于安全写入上限');
  tableRows.set(largeBuilt.meta.id, largeBuilt.meta);
  tableRows.set(largeBuilt.bundle.id, largeBuilt.bundle);
  largeBuilt.chunks.forEach(chunk => tableRows.set(chunk.id, chunk));
  const largeView = await loader({ user, scope: augustScope, forceFresh: true });
  assert.strictEqual(largeView.operations.coach.rows[0].coachName, '朝珺', '分片快照读取后仍应还原正确教练数据');

  const writes = [];
  const sync = createOperationsSnapshotSync({
    getCachedRow: async (table, id) => tableRows.get(id) || null,
    mkTable: async (table) => { writes.push({ op: 'mkTable', table }); },
    put: async (table, id, row) => {
      writes.push({ op: 'put', table, id, row });
      tableRows.set(id, row);
      return row;
    },
    scanByIdPrefix: async (table, prefix) => [...tableRows.values()].filter(row => String(row.id || '').startsWith(prefix)),
    buildPayload: async ({ scope }) => ({
      campuses: [],
      operations: { coach: { rows: [{ coachName: '朝珺', range: scope.dateRange.startDate }] } },
      generatedAt: '2026-09-01T00:00:02.000Z'
    }),
    tables: { operationsSnapshot: 'snapshot', operationsSnapshotTasks: 'snapshotTasks' }
  });
  const dryRun = await sync.rebuildScope({ user, scope: julyScope, dryRun: true, batchId: 'dry' });
  assert.strictEqual(dryRun.dryRun, true, 'dry-run 不应写快照');
  assert.ok(!writes.some((row) => row.op === 'put'), 'dry-run 不能写表');
  await sync.rebuildScope({ user, scope: julyScope, dryRun: false, batchId: 'july-batch' });
  const julyKey = scopeKey(user, julyScope);
  assert.ok(tableRows.get(metaIdForScopeKey(julyKey)), '正式重建应写当前校区和日期范围的 active meta');
  assert.ok(writes.some((row) => row.id === 'active:scope-index'), '正式重建应登记范围索引，源数据变化后可自动刷新');

  const queued = await sync.enqueueRebuildTask({ user, scope: augustScope, reason: 'page-miss' });
  assert.strictEqual(queued.taskId, taskIdForScopeKey(scopeKey(user, augustScope)), '缺失快照必须按当前范围生成稳定任务 id');
  assert.strictEqual(tableRows.get(queued.taskId).status, 'pending', '排队动作必须先把待处理任务写入任务表');
  const processed = await sync.processQueuedRebuilds({ limit: 1 });
  assert.strictEqual(processed.processed, 1, 'cron 处理器必须能消费待处理经营快照任务');
  assert.strictEqual(tableRows.get(queued.taskId).status, 'done', '待处理任务跑完后必须标记完成，避免页面一直卡在生成中');

  await sync.recordSourceChange({ sourceTable: 'ft_schedule', op: 'put', id: 'schedule-1' });
  assert.ok(
    writes.some(row => row.id === taskIdForScopeKey(julyKey) && row.row.status === 'pending'),
    '源数据变化必须落待处理任务，不能只依赖 serverless 响应后的后台 Promise'
  );
}

main()
  .then(() => console.log('operations snapshot tests passed'))
  .catch((error) => {
    console.error(error);
    process.exit(1);
  });
