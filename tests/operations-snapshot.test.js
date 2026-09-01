const assert = require('assert');

const {
  OPERATIONS_SNAPSHOT_NOT_READY_CODE,
  SNAPSHOT_SOURCE_MARKER_ID,
  buildOperationsSnapshot,
  createOperationsSnapshotLoader,
  createOperationsSnapshotSync,
  metaIdForScopeKey,
  scopeKey
} = require('../server/page-data/operations-snapshot.js');

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
    calls.slice(0, 3).map((call) => call.id),
    [augustBuilt.meta.id, SNAPSHOT_SOURCE_MARKER_ID, augustBuilt.bundle.id],
    '首屏只能按固定 id 读 meta/source/bundle，不能扫大表'
  );

  await assert.rejects(
    () => loader({ user, scope: julyScope }),
    (err) => err.code === OPERATIONS_SNAPSHOT_NOT_READY_CODE,
    '7 月没有对应快照时不能返回 8 月朝珺数据'
  );

  tableRows.set(SNAPSHOT_SOURCE_MARKER_ID, {
    id: SNAPSHOT_SOURCE_MARKER_ID,
    changedAt: '2026-09-01T00:00:01.000Z',
    sourceTable: 'ft_schedule',
    op: 'put'
  });
  await assert.rejects(
    () => loader({ user, scope: augustScope, forceFresh: true }),
    (err) => err.code === OPERATIONS_SNAPSHOT_NOT_READY_CODE,
    '源数据比快照新时不能展示旧教练人效'
  );
  const refreshingView = await loader({ user, scope: augustScope, allowRefreshing: true });
  assert.strictEqual(refreshingView.operations.coach.rows[0].coachName, '朝珺', '源数据更新后允许页面快速展示已发布快照');
  assert.strictEqual(refreshingView.snapshot.refreshing, true, '源数据更新后应标记后台刷新中');

  const writes = [];
  const sync = createOperationsSnapshotSync({
    getCachedRow: async (table, id) => tableRows.get(id) || null,
    mkTable: async (table) => { writes.push({ op: 'mkTable', table }); },
    put: async (table, id, row) => {
      writes.push({ op: 'put', table, id, row });
      tableRows.set(id, row);
      return row;
    },
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
}

main()
  .then(() => console.log('operations snapshot tests passed'))
  .catch((error) => {
    console.error(error);
    process.exit(1);
  });
