const assert = require('assert');

const {
  buildCoachDailyMonthPackPayload,
  buildOperationsSnapshot,
  cloneCoachDailyMonthPackScope,
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
const composeScope = {
  ...scope,
  view: 'coach',
  dateRange: { startDate: '2026-09-01', endDate: '2026-09-30' },
  metricScope: { campus: 'shunyi_mapo', campusName: '顺义马坡', startDate: '2026-09-01', endDate: '2026-09-30' }
};
const monthDailyPayloads = [];
for (let day = 1; day <= 30; day += 1) {
  const date = `2026-09-${String(day).padStart(2, '0')}`;
  monthDailyPayloads.push({
    day: date,
    payload: {
      campuses: payload.campuses,
      operations: {
        overview: { cards: { totalIncome: { title: '总收入', value: 100, unit: '元' }, recognizedRevenue: { title: '已入账', value: 0, unit: '元' }, pendingRevenue: { title: '未入账', value: 100, unit: '元' }, tradeCount: { title: '成交笔数', value: 1, unit: '笔' } } },
        coach: { rows: coachRows.slice(0, 100).map(row => ({ ...row, coach: row.coachName, usedHours: 1, teachingHours: 1, teachingStudentCount: 1, availableHours: 6.9, revenue: 10, courseMix: [{ type: '私教课', hours: 1 }] })) }
      },
      generatedAt: `${date}T00:00:00.000Z`
    }
  });
}
const monthPackScope = cloneCoachDailyMonthPackScope(composeScope, '2026-09');
const monthPackBuilt = buildOperationsSnapshot({
  payload: buildCoachDailyMonthPackPayload({ month: '2026-09', dailyPayloads: monthDailyPayloads }),
  user,
  scope: monthPackScope,
  batchId: 'daily-month-2026-09',
  completedAt: '2026-09-30T00:00:00.000Z',
  sourceSnapshotAt: '2026-09-30T00:00:00.000Z'
});
rows.set(monthPackBuilt.meta.id, monthPackBuilt.meta);
rows.set(monthPackBuilt.bundle.id, monthPackBuilt.bundle);
const previousMonthDailyPayloads = [];
for (let day = 1; day <= 31; day += 1) {
  const date = `2026-08-${String(day).padStart(2, '0')}`;
  previousMonthDailyPayloads.push({
    day: date,
    payload: {
      campuses: payload.campuses,
      operations: {
        overview: { cards: { totalIncome: { value: 0 }, recognizedRevenue: { value: 0 }, pendingRevenue: { value: 0 }, tradeCount: { value: 0 } } },
        coach: { rows: coachRows.slice(0, 100).map(row => ({ ...row, coach: row.coachName, usedHours: 2, teachingHours: 2, teachingStudentCount: 1, availableHours: 6.9, revenue: 0, courseMix: [{ type: '私教课', hours: 2 }] })) }
      },
      generatedAt: `${date}T00:00:00.000Z`
    }
  });
}
const previousMonthPackBuilt = buildOperationsSnapshot({
  payload: buildCoachDailyMonthPackPayload({ month: '2026-08', dailyPayloads: previousMonthDailyPayloads }),
  user,
  scope: cloneCoachDailyMonthPackScope(composeScope, '2026-08'),
  batchId: 'daily-month-2026-08',
  completedAt: '2026-09-30T00:00:00.000Z',
  sourceSnapshotAt: '2026-09-30T00:00:00.000Z'
});
rows.set(previousMonthPackBuilt.meta.id, previousMonthPackBuilt.meta);
rows.set(previousMonthPackBuilt.bundle.id, previousMonthPackBuilt.bundle);
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
  const composeStarted = Date.now();
  const composed = await loader({ user, scope: composeScope });
  const composeElapsed = Date.now() - composeStarted;
  assert.ok(composeElapsed < 1000, `自定义日期段教练月包组合必须 1s 内完成，实际 ${composeElapsed}ms`);
  assert.strictEqual(composed.snapshot.source, 'operations-coach-daily-month-pack', '自定义日期段硬测必须走教练月包组合');
  assert.strictEqual(composed.operations.coach.rows[0].usedHours, 30, '30 天日快照组合后教练课时必须正确累加');
  assert.strictEqual(scanCalled, false, '经营页快照读取链路不得调用 scan');
  console.log(`operations snapshot performance tests passed\n${times.join('ms / ')}ms; month pack compose ${composeElapsed}ms`);
})().catch((error) => {
  console.error(error);
  process.exit(1);
});
