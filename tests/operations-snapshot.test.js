const assert = require('assert');
const crypto = require('crypto');

const {
  OPERATIONS_SNAPSHOT_NOT_READY_CODE,
  SNAPSHOT_BUNDLE_INLINE_LIMIT,
  SNAPSHOT_SOURCE_MARKER_ID,
  buildCoachDailyMonthPackPayload,
  buildOperationsSnapshot,
  cloneCoachDailyMonthPackScope,
  composeCoachSnapshotPayloads,
  createOperationsSnapshotLoader,
  createOperationsSnapshotSync,
  metaIdForScopeKey,
  scopeKey,
  taskIdForScopeKey
} = require('../server/page-data/operations-snapshot.js');
const { getOperationsRowsCacheKey } = require('../server/read-models/operations-source.js');
const { buildCommonScopeArgs, buildDailyMonthScopeArgs, buildDailyScopeArgs, buildScope } = require('../scripts/rebuild-operations-snapshot.js');

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

function testDateUtcMs(day) {
  const match = String(day || '').match(/^(\d{4})-(\d{2})-(\d{2})$/);
  if (!match) return null;
  return Date.UTC(Number(match[1]), Number(match[2]) - 1, Number(match[3]));
}

function testAddUtcDays(day, offset) {
  const ms = testDateUtcMs(day);
  if (ms == null) return '';
  return new Date(ms + offset * 86400000).toISOString().slice(0, 10);
}

function enumerateTestDays(startDate, endDate) {
  const days = [];
  for (let day = startDate; day && day <= endDate; day = testAddUtcDays(day, 1)) days.push(day);
  return days;
}

async function main() {
  const commonScopes = buildCommonScopeArgs(
    { write: true, view: 'coach', commonScopes: true },
    new Date('2026-09-02T04:00:00.000Z')
  );
  assert.ok(
    commonScopes.some((row) => row.startDate === '2026-09-01' && row.endDate === '2026-09-30' && row.view === 'coach'),
    '定时快照必须提前生成本月教练人效范围，避免日期筛选后一直加载'
  );
  assert.ok(
    commonScopes.some((row) => row.startDate === '2026-08-01' && row.endDate === '2026-08-31' && row.view === 'coach'),
    '定时快照必须提前生成上月教练人效范围，避免月度复盘筛选后一直加载'
  );
  assert.ok(
    commonScopes.some((row) => row.startDate === '' && row.endDate === '' && row.view === 'coach'),
    '定时快照必须继续生成全部时间教练人效范围，不能破坏首屏'
  );
  const commonCampusScopes = buildCommonScopeArgs(
    { write: true, view: 'coach', commonScopes: true },
    new Date('2026-09-02T04:00:00.000Z'),
    [{ id: 'shunyi_mapo', name: '顺义马坡' }]
  );
  assert.ok(
    commonCampusScopes.some((row) => row.campus === 'shunyi_mapo' && row.campusName === '顺义马坡' && row.startDate === '2026-09-01' && row.endDate === '2026-09-30' && row.view === 'coach'),
    '定时快照必须提前生成校区 + 本月教练人效范围，避免校区筛选后日期筛选一直加载'
  );
  const shardA = buildCommonScopeArgs(
    { write: true, view: 'coach', commonScopes: true, shardCount: 2, shardIndex: 0 },
    new Date('2026-09-02T04:00:00.000Z'),
    [{ id: 'shunyi_mapo', name: '顺义马坡' }]
  );
  const shardB = buildCommonScopeArgs(
    { write: true, view: 'coach', commonScopes: true, shardCount: 2, shardIndex: 1 },
    new Date('2026-09-02T04:00:00.000Z'),
    [{ id: 'shunyi_mapo', name: '顺义马坡' }]
  );
  assert.strictEqual(
    shardA.length + shardB.length,
    commonCampusScopes.length,
    '校区日期快照必须能分片并行生成，避免单个定时任务串行超时'
  );
  const dailyScopes = buildDailyScopeArgs(
    { write: true, view: 'coach', dailyScopes: true },
    { startDate: '2026-09-01', endDate: '2026-09-03' },
    [{ id: 'shunyi_mapo', name: '顺义马坡' }]
  );
  assert.ok(
    dailyScopes.some((row) => row.startDate === '2026-09-02' && row.endDate === '2026-09-02' && row.view === 'coach'),
    '定时快照必须能生成教练日快照，支撑任意日期段 1s 组合返回'
  );
  assert.ok(
    dailyScopes.some((row) => row.campus === 'shunyi_mapo' && row.startDate === '2026-09-03' && row.endDate === '2026-09-03'),
    '教练日快照必须覆盖校区维度，校区 + 自定义日期筛选不能等待现场生成'
  );
  const aliasDailyScopes = buildDailyScopeArgs(
    { write: true, view: 'coach', dailyScopes: true },
    { startDate: '2026-09-01', endDate: '2026-09-01' },
    [{ id: 'mabao', name: '马坡' }]
  );
  assert.ok(
    aliasDailyScopes.some((row) => row.campus === 'shunyi_mapo' && row.campusName === '顺义马坡'),
    '生产历史校区别名必须规范成前端筛选使用的标准校区编码'
  );
  const monthPackScopes = buildDailyMonthScopeArgs(
    { write: true, view: 'coach', dailyMonthScopes: true },
    { startDate: '2026-09-01', endDate: '2026-10-03' },
    [{ id: 'shunyi_mapo', name: '顺义马坡' }]
  );
  assert.ok(
    monthPackScopes.some((row) => row.campus === 'shunyi_mapo' && row.startDate === '2026-09-01' && row.endDate === '2026-09-30' && row.view === 'coach-month-pack'),
    '定时快照必须生成校区月包，任意日期筛选只能读少量月包'
  );
  assert.ok(
    monthPackScopes.some((row) => row.startDate === '2026-10-01' && row.endDate === '2026-10-31' && row.view === 'coach-month-pack'),
    '跨月日期筛选必须有对应月份月包'
  );
  assert.strictEqual(
    buildScope(monthPackScopes.find((row) => row.campus === 'shunyi_mapo' && row.startDate === '2026-09-01')).view,
    'coach-month-pack',
    '月包补建脚本必须保留内部月包视图，不能被页面 view 解析过滤'
  );
  assert.strictEqual(
    scopeKey({ id: 'admin-1', role: 'admin', dataScope: '', campusIds: [] }, {
      campus: 'all',
      campusName: '全部校区',
      view: 'coach',
      dateRange: { startDate: '2026-09-01', endDate: '2026-09-30' },
      metricScope: { campus: 'all', campusName: '全部校区', startDate: '2026-09-01', endDate: '2026-09-30' }
    }),
    scopeKey({ id: 'admin-1', role: 'admin', dataScope: '', campusIds: [] }, {
      campus: '',
      campusName: '',
      view: 'coach',
      dateRange: { startDate: '2026-09-01', endDate: '2026-09-30' },
      metricScope: { campus: '', campusName: '', startDate: '2026-09-01', endDate: '2026-09-30' }
    }),
    '全部校区和空校区必须命中同一份经营月包快照'
  );
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

  const septemberRangeScope = {
    ...augustCoachScope,
    dateRange: { startDate: '2026-09-01', endDate: '2026-09-02' },
    metricScope: { campus: 'shunyi_mapo', campusName: '顺义马坡', startDate: '2026-09-01', endDate: '2026-09-02' }
  };
  const monthDailyPayloads = [
    {
      day: '2026-09-01',
      usedHours: 2,
      revenue: 1000
    },
    {
      day: '2026-09-02',
      usedHours: 3,
      revenue: 1500
    }
  ].map(item => {
    return {
      day: item.day,
      payload: {
        campuses: [{ id: 'shunyi_mapo', name: '顺义马坡' }],
        operations: {
          overview: { cards: { totalIncome: { title: '总收入', value: item.revenue, unit: '元' }, recognizedRevenue: { title: '已入账', value: 0, unit: '元' }, pendingRevenue: { title: '未入账', value: item.revenue, unit: '元' }, tradeCount: { title: '成交笔数', value: 1, unit: '笔' } } },
          coach: {
            rows: [{
              coach: '朝珺教练',
              campus: '顺义马坡',
              usedHours: item.usedHours,
              teachingHours: item.usedHours,
              teachingStudentCount: item.usedHours,
              availableHours: 6.9,
              revenue: item.revenue,
              trialBase: 0,
              trialConverted: 0,
              feedbackRequired: 0,
              feedbackCompleted: 0,
              oldCustomerBase: 0,
              renewalCount: 0,
              courseMix: [{ type: '私教课', hours: item.usedHours }],
              campusDistribution: [{ campusName: '顺义马坡', hours: item.usedHours }]
            }]
          }
        },
        generatedAt: `${item.day}T00:00:00.000Z`
      }
    };
  });
  const monthPackScope = cloneCoachDailyMonthPackScope(septemberRangeScope, '2026-09');
  const monthPackBuilt = buildOperationsSnapshot({
    payload: buildCoachDailyMonthPackPayload({ month: '2026-09', dailyPayloads: monthDailyPayloads }),
    user,
    scope: monthPackScope,
    batchId: 'daily-month-2026-09',
    completedAt: '2026-09-02T00:00:00.000Z',
    sourceSnapshotAt: '2026-09-02T00:00:00.000Z'
  });
  tableRows.set(monthPackBuilt.meta.id, monthPackBuilt.meta);
  tableRows.set(monthPackBuilt.bundle.id, monthPackBuilt.bundle);
  const previousMonthPackBuilt = buildOperationsSnapshot({
    payload: buildCoachDailyMonthPackPayload({
      month: '2026-08',
      dailyPayloads: ['2026-08-30', '2026-08-31'].map(day => ({
        day,
        payload: {
          campuses: [{ id: 'shunyi_mapo', name: '顺义马坡' }],
          operations: {
            overview: { cards: { totalIncome: { value: 0 }, recognizedRevenue: { value: 0 }, pendingRevenue: { value: 0 }, tradeCount: { value: 0 } } },
            coach: { rows: [] }
          }
        }
      }))
    }),
    user,
    scope: cloneCoachDailyMonthPackScope(septemberRangeScope, '2026-08'),
    batchId: 'daily-month-2026-08',
    completedAt: '2026-09-02T00:00:00.000Z',
    sourceSnapshotAt: '2026-09-02T00:00:00.000Z'
  });
  tableRows.set(previousMonthPackBuilt.meta.id, previousMonthPackBuilt.meta);
  tableRows.set(previousMonthPackBuilt.bundle.id, previousMonthPackBuilt.bundle);
  const composedView = await loader({ user, scope: septemberRangeScope });
  assert.strictEqual(composedView.snapshot.source, 'operations-coach-daily-month-pack', '自定义日期段缺少精确范围快照时必须走教练月包组合');
  assert.strictEqual(composedView.operations.coach.cards.usedHours.value, 5, '日快照组合后的课时必须等于所选日期内每天已排课时之和');
  assert.strictEqual(composedView.operations.overview.cards.totalIncome.value, 2500, '顶部数据必须随筛选日期范围由日快照组合');
  const singleDayScope = {
    ...augustCoachScope,
    dateRange: { startDate: '2026-09-01', endDate: '2026-09-01' },
    metricScope: { campus: 'shunyi_mapo', campusName: '顺义马坡', startDate: '2026-09-01', endDate: '2026-09-01' }
  };
  const singleDayView = await loader({ user, scope: singleDayScope });
  assert.strictEqual(singleDayView.snapshot.source, 'operations-coach-daily-month-pack', '单日筛选缺少精确快照时也必须走教练月包组合');
  assert.strictEqual(singleDayView.operations.coach.cards.usedHours.value, 2, '单日筛选后的课时必须只取该天的月包数据');

  const septemberFullMonthScope = {
    ...augustCoachScope,
    dateRange: { startDate: '2026-09-01', endDate: '2026-09-30' },
    metricScope: { campus: 'shunyi_mapo', campusName: '顺义马坡', startDate: '2026-09-01', endDate: '2026-09-30' }
  };
  const septemberFullMonthPack = buildOperationsSnapshot({
    payload: buildCoachDailyMonthPackPayload({
      month: '2026-09',
      dailyPayloads: enumerateTestDays('2026-09-01', '2026-09-30').map(day => ({
        day,
        payload: {
          campuses: [{ id: 'shunyi_mapo', name: '顺义马坡' }],
          operations: {
            overview: { cards: { totalIncome: { value: 0 }, recognizedRevenue: { value: 0 }, pendingRevenue: { value: 0 }, tradeCount: { value: 0 } } },
            coach: {
              rows: day === '2026-09-02' ? [{
                coach: 'Siren 教练',
                usedHours: 17,
                teachingHours: 17,
                availableHours: 6.9,
                revenue: 0,
                trialBase: 2,
                trialConverted: 1,
                courseMix: [{ type: '私教课', hours: 16 }, { type: '体验课', hours: 1 }]
              }] : []
            }
          }
        }
      }))
    }),
    user,
    scope: cloneCoachDailyMonthPackScope(septemberFullMonthScope, '2026-09'),
    batchId: 'daily-month-2026-09-full',
    completedAt: '2026-09-02T00:00:00.000Z',
    sourceSnapshotAt: '2026-09-02T00:00:00.000Z'
  });
  const augustFullMonthPack = buildOperationsSnapshot({
    payload: buildCoachDailyMonthPackPayload({
      month: '2026-08',
      dailyPayloads: enumerateTestDays('2026-08-01', '2026-08-31').map(day => ({
        day,
        payload: {
          campuses: [{ id: 'shunyi_mapo', name: '顺义马坡' }],
          operations: {
            overview: { cards: { totalIncome: { value: 0 }, recognizedRevenue: { value: 0 }, pendingRevenue: { value: 0 }, tradeCount: { value: 0 } } },
            coach: {
              rows: day === '2026-08-08' ? [{
                coach: 'Siren 教练',
                usedHours: 28,
                teachingHours: 28,
                availableHours: 6.9,
                revenue: 0,
                trialBase: 1,
                trialConverted: 1,
                courseMix: [{ type: '私教课', hours: 28 }]
              }] : []
            }
          }
        }
      }))
    }),
    user,
    scope: cloneCoachDailyMonthPackScope(septemberFullMonthScope, '2026-08'),
    batchId: 'daily-month-2026-08-full',
    completedAt: '2026-09-02T00:00:00.000Z',
    sourceSnapshotAt: '2026-09-02T00:00:00.000Z'
  });
  [septemberFullMonthPack, augustFullMonthPack].forEach(built => {
    tableRows.set(built.meta.id, built.meta);
    tableRows.set(built.bundle.id, built.bundle);
  });
  const septemberFullMonthView = await loader({ user, scope: septemberFullMonthScope });
  const fullMonthSiren = septemberFullMonthView.operations.coach.rows.find(row => row.coach === 'Siren 教练');
  assert.strictEqual(fullMonthSiren?.usedHours, 17, '9 月整月快照合成应展示 9 月当前课时');
  assert.strictEqual(fullMonthSiren?.usedHoursComparison?.previousValue, 28, '9 月整月快照合成的环比课时必须来自完整 8 月月包');
  assert.strictEqual(fullMonthSiren?.trialBase, 2, '快照合成不能丢失体验课上课人数');
  assert.strictEqual(fullMonthSiren?.trialConverted, 1, '快照合成不能丢失体验课转化人数');

  const legacyBuilt = buildOperationsSnapshot({
    payload: {
      campuses: [{ id: 'shunyi_mapo', name: '顺义马坡' }],
      operations: {
        coach: {
          rows: [{
            coach: 'Siren 教练',
            usedHours: 17,
            teachingHours: 17,
            trialBase: 2,
            trialConverted: 1,
            usedHoursComparison: { mode: 'previous_period', previousValue: 1 }
          }]
        }
      }
    },
    user,
    scope: septemberFullMonthScope,
    batchId: 'legacy-v2-batch',
    completedAt: '2026-09-01T00:00:00.000Z',
    sourceSnapshotAt: '2026-09-01T00:00:00.000Z'
  });
  tableRows.set(legacyBuilt.meta.id, { ...legacyBuilt.meta, snapshotVersion: 'operations-page-snapshot-v2', version: 'operations-page-snapshot-v2' });
  tableRows.set(legacyBuilt.bundle.id, { ...legacyBuilt.bundle, snapshotVersion: 'operations-page-snapshot-v2' });
  const legacyFallbackView = await loader({ user, scope: septemberFullMonthScope, forceFresh: true });
  const legacyFallbackSiren = legacyFallbackView.operations.coach.rows.find(row => row.coach === 'Siren 教练');
  assert.strictEqual(legacyFallbackView.snapshot.source, 'operations-snapshot', '新版快照重建前应允许旧快照临时兜底，避免页面一直加载');
  assert.strictEqual(legacyFallbackView.snapshot.refreshing, true, '旧快照兜底必须标记刷新中，提示后台继续生成新版快照');
  assert.strictEqual(legacyFallbackSiren?.usedHoursComparison?.previousValue, 28, '旧快照兜底时不能沿用旧环比，必须按完整上期快照重算');
  assert.strictEqual(legacyFallbackSiren?.trialBase, 2, '旧快照兜底不能丢失体验课上课人数');
  assert.strictEqual(legacyFallbackSiren?.trialConverted, 1, '旧快照兜底不能丢失体验课转化人数');

  const directComposed = composeCoachSnapshotPayloads([
    { operations: { overview: { cards: { totalIncome: { value: 1 } } }, coach: { rows: [{ coach: 'A教练', usedHours: 1, teachingHours: 1, availableHours: 6.9, revenue: 10, courseMix: [{ type: '私教课', hours: 1 }] }] } } },
    { operations: { overview: { cards: { totalIncome: { value: 2 } } }, coach: { rows: [{ coach: 'A教练', usedHours: 2, teachingHours: 2, availableHours: 6.9, revenue: 20, courseMix: [{ type: '私教课', hours: 2 }] }] } } }
  ], septemberRangeScope);
  assert.strictEqual(directComposed.operations.coach.rows[0].usedHours, 3, '教练日快照组合函数必须按教练合并课时');

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
