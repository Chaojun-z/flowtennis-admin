const assert = require('assert');

const {
  buildOperationsSnapshot,
  createOperationsSnapshotLoader
} = require('../server/page-data/operations-snapshot.js');

const user = { id: 'admin-1', role: 'admin', dataScope: '', campusIds: [] };
const scope = {
  campus: 'shunyi_mapo',
  campusName: '顺义马坡',
  dateRange: { startDate: '2026-08-01', endDate: '2026-08-31' },
  metricScope: { campus: 'shunyi_mapo', campusName: '顺义马坡', startDate: '2026-08-01', endDate: '2026-08-31' }
};
const coachRows = Array.from({ length: 5000 }, (_, index) => ({
  coachId: `coach-${index}`,
  coachName: index === 268 ? '朝珺' : `教练${index}`,
  privateLessons: index % 30,
  groupLessons: index % 12,
  revenue: index * 17,
  utilizationRate: index % 100,
  trialConversionRate: index % 80
}));
const payload = {
  campuses: [{ id: 'shunyi_mapo', name: '顺义马坡' }],
  operations: {
    overview: { kpis: coachRows.slice(0, 20) },
    court: { rows: coachRows.slice(0, 1000) },
    conversion: { trends: coachRows.slice(0, 1000) },
    coach: { rows: coachRows }
  },
  generatedAt: '2026-09-01T00:00:00.000Z'
};
const { meta, bundle } = buildOperationsSnapshot({
  payload,
  user,
  scope,
  batchId: 'perf-batch',
  completedAt: '2026-09-01T00:00:00.000Z',
  sourceSnapshotAt: '2026-09-01T00:00:00.000Z'
});
const rows = new Map([[meta.id, meta], [bundle.id, bundle]]);
let scanCalled = false;
const loader = createOperationsSnapshotLoader({
  getCachedRow: async (table, id) => rows.get(id) || null,
  getCachedScan: async () => {
    scanCalled = true;
    return [];
  },
  tables: { operationsSnapshot: 'snapshot' }
});

(async () => {
  const times = [];
  for (let i = 0; i < 5; i += 1) {
    const started = Date.now();
    const view = await loader({ user, scope });
    const elapsed = Date.now() - started;
    times.push(elapsed);
    assert.ok(elapsed < 1000, `经营页快照读取必须 1s 内完成，实际 ${elapsed}ms`);
    assert.strictEqual(view.operations.coach.rows[268].coachName, '朝珺', '大数据包下仍应返回正确教练数据');
    assert.strictEqual(view.snapshot.source, 'operations-snapshot', '硬测试必须走经营快照');
  }
  assert.strictEqual(scanCalled, false, '经营页快照读取链路不得调用 scan');
  console.log(`operations snapshot performance tests passed\n${times.join('ms / ')}ms`);
})().catch((error) => {
  console.error(error);
  process.exit(1);
});
