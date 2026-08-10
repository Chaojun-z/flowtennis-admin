const assert = require('assert');

const {
  buildCourtAccountListViewFromIndexRows
} = require('../server/page-data/court-account-list-index.js');
const {
  SNAPSHOT_ACTIVE_META_ID,
  SNAPSHOT_ACTIVE_DELTA_ID,
  SNAPSHOT_DELTA_MERGE_THRESHOLD,
  SNAPSHOT_LAST_MERGE_TASK_ID,
  buildSnapshotRows,
  createCourtAccountListSnapshotLoader,
  createCourtAccountListSnapshotSync,
  snapshotHealth
} = require('../server/page-data/court-account-list-snapshot.js');

function makeRows(count = 120) {
  return Array.from({ length: count }, (_, index) => {
    const n = index + 1;
    const day = String((n % 28) + 1).padStart(2, '0');
    return {
      id: `court-${n}`,
      courtId: `court-${n}`,
      item: {
        id: `court-${n}`,
        displayName: n % 10 === 0 ? `搜索目标${n}` : `订场用户${n}`,
        phone: `138${String(n).padStart(8, '0')}`,
        campusCode: n % 2 === 0 ? 'shunyi_mapo' : 'shilipu',
        campusName: n % 2 === 0 ? '顺义马坡' : '十里堡',
        owner: n % 5 === 0 ? '跟进人甲' : '跟进人乙',
        accountType: n % 3 === 0 ? '会员账户' : '普通账户',
        membershipTierLabel: n % 3 === 0 ? '储值会员' : '-',
        bookingCount: 1,
        bookingAmount: 100 + n,
        bookingHours: 1,
        memberBookingCount: n % 3 === 0 ? 1 : 0,
        memberBookingAmount: n % 3 === 0 ? 100 + n : 0,
        guestBookingCount: n % 3 === 0 ? 0 : 1,
        guestBookingAmount: n % 3 === 0 ? 0 : 100 + n,
        totalReceived: 100 + n,
        totalSpent: 100 + n,
        lastBookingDate: `2026-08-${day}`,
        updatedAt: `2026-08-${day} 10:00:00`,
        createdAt: `2026-01-${day} 10:00:00`
      },
      bookingDayStats: [{
        date: `2026-08-${day}`,
        bookingCount: 1,
        bookingAmount: 100 + n,
        bookingHours: 1,
        memberBookingCount: n % 3 === 0 ? 1 : 0,
        memberBookingAmount: n % 3 === 0 ? 100 + n : 0,
        guestBookingCount: n % 3 === 0 ? 0 : 1,
        guestBookingAmount: n % 3 === 0 ? 0 : 100 + n
      }],
      membershipFinanceStats: n % 3 === 0 ? {
        memberCount: 1,
        rechargeCount: 1,
        paidAmount: 1000,
        bonusAmount: 0,
        consumableAmount: 1000,
        pendingAmount: 500
      } : null
    };
  });
}

async function main() {
  const indexRows = makeRows(120);
  const { meta, bundle } = buildSnapshotRows(indexRows, { versionId: 'test-snapshot' });
  assert.strictEqual(meta.id, SNAPSHOT_ACTIVE_META_ID, '快照应使用 active meta 作为唯一启用开关');
  assert.strictEqual(meta.status, 'done', '快照 meta 必须写 done 后才可用');
  assert.strictEqual(meta.bundleId, bundle.id, 'meta 应指向版本化 bundle');
  assert.ok(bundle.payload.length < JSON.stringify(indexRows).length, '快照包应压缩保存，避免大 JSON 远程传输');

  const rowsById = new Map([
    [meta.id, meta],
    [bundle.id, bundle],
    [SNAPSHOT_ACTIVE_DELTA_ID, {
      id: SNAPSHOT_ACTIVE_DELTA_ID,
      upserts: [{
        ...indexRows[0],
        id: 'court-new-delta',
        courtId: 'court-new-delta',
        item: {
          ...indexRows[0].item,
          id: 'court-new-delta',
          displayName: '今日新增订场用户',
          lastBookingDate: '2026-09-01'
        }
      }],
      deletes: ['court-2'],
      count: 2,
      updatedAt: '2026-09-01T00:00:00.000Z'
    }]
  ]);
  const getCalls = [];
  const loader = createCourtAccountListSnapshotLoader({
    getCachedRow: async (table, id) => {
      getCalls.push({ table, id });
      return rowsById.get(id) || null;
    },
    tables: { courtAccountListSnapshot: 'snapshot' }
  });
  const options = { page: 1, pageSize: 15, sortKey: 'lastBookingDate', sortDir: 'desc' };
  const snapshotView = await loader(options);
  assert.strictEqual(snapshotView.meta.source, 'court-account-list-snapshot', '列表应走快照包');
  assert.strictEqual(snapshotView.items[0].id, 'court-new-delta', 'delta 新增数据应进入首屏最新排序');
  assert.ok(!snapshotView.items.some((item) => item.id === 'court-2'), 'delta 删除数据不应继续展示');
  assert.strictEqual(snapshotView.pagination.total, 120, 'total 应来自完整快照合并结果，不是当前页数量');
  assert.deepStrictEqual(
    getCalls.map((call) => call.id),
    [SNAPSHOT_ACTIVE_META_ID, bundle.id, SNAPSHOT_ACTIVE_DELTA_ID],
    '快照读取只能按固定 id getRow，不能远程扫描索引全表'
  );

  const secondView = await loader({ ...options, page: 2 });
  assert.strictEqual(secondView.meta.source, 'court-account-list-snapshot', '翻页仍应走快照包');
  assert.ok(getCalls.filter((call) => call.id === bundle.id).length === 1, '同进程内翻页应复用内存快照包');

  const factsLike = buildCourtAccountListViewFromIndexRows(indexRows, options);
  const noDeltaRows = new Map([[meta.id, meta], [bundle.id, bundle]]);
  const noDeltaLoader = createCourtAccountListSnapshotLoader({
    getCachedRow: async (table, id) => noDeltaRows.get(id) || null,
    tables: { courtAccountListSnapshot: 'snapshot' }
  });
  const noDeltaView = await noDeltaLoader(options);
  assert.deepStrictEqual(
    noDeltaView.items.map((item) => item.id),
    factsLike.items.map((item) => item.id),
    '无 delta 时快照包排序分页应与行级读模型一致'
  );

  const writes = [];
  const sync = createCourtAccountListSnapshotSync({
    getCachedRow: async () => null,
    mkTable: async (table) => { writes.push({ op: 'mkTable', table }); },
    put: async (table, id, row) => { writes.push({ op: 'put', table, id, row }); return row; },
    tables: { courtAccountListSnapshot: 'snapshot', courtAccountListSnapshotTasks: 'snapshotTasks' }
  });
  const dryRun = await sync.rebuildFromIndexRows(indexRows, { dryRun: true });
  assert.strictEqual(dryRun.total, indexRows.length, 'dry-run 应返回快照总数');
  assert.deepStrictEqual(writes, [], 'dry-run 不应写生产快照表');
  const rebuild = await sync.rebuildFromIndexRows(indexRows);
  assert.strictEqual(rebuild.total, indexRows.length, '正式重建应写完整快照');
  assert.ok(writes.some((row) => row.op === 'put' && row.id === SNAPSHOT_ACTIVE_META_ID), '正式重建最后应写 active meta');
  assert.ok(writes.some((row) => row.op === 'put' && row.id === SNAPSHOT_ACTIVE_DELTA_ID), '正式重建应重置 delta 包');

  const deltaWrites = [];
  const deltaSync = createCourtAccountListSnapshotSync({
    getCachedRow: async () => ({ upserts: [], deletes: [] }),
    put: async (table, id, row) => { deltaWrites.push({ table, id, row }); return row; },
    tables: { courtAccountListSnapshot: 'snapshot', courtAccountListSnapshotTasks: 'snapshotTasks' }
  });
  await deltaSync.recordDelta(indexRows[0], { courtId: indexRows[0].id, reason: 'court-update' });
  assert.ok(deltaWrites.some((row) => row.id === SNAPSHOT_ACTIVE_DELTA_ID && row.row.upserts.length === 1), '单条变更应写入 active delta');

  const staleHealth = snapshotHealth(
    { id: SNAPSHOT_ACTIVE_META_ID, status: 'done', total: 120, generatedAt: '2026-01-01T00:00:00.000Z' },
    { count: SNAPSHOT_DELTA_MERGE_THRESHOLD, updatedAt: '2026-01-02T00:00:00.000Z' },
    null,
    { now: Date.parse('2026-01-03T00:00:00.000Z') }
  );
  assert.strictEqual(staleHealth.needsMerge, true, 'delta 达阈值或快照过期应标记需要自动合并');
  assert.strictEqual(staleHealth.mergeAllowed, true, '未处于冷却期时应允许自动合并');

  const autoRows = makeRows(SNAPSHOT_DELTA_MERGE_THRESHOLD + 1);
  const autoWrites = [];
  const autoSync = createCourtAccountListSnapshotSync({
    getCachedRow: async (table, id) => {
      if (id === SNAPSHOT_ACTIVE_DELTA_ID) {
        return {
          id,
          upserts: autoRows.slice(0, SNAPSHOT_DELTA_MERGE_THRESHOLD - 1),
          deletes: [],
          count: SNAPSHOT_DELTA_MERGE_THRESHOLD - 1,
          updatedAt: '2026-08-01T00:00:00.000Z'
        };
      }
      if (id === SNAPSHOT_ACTIVE_META_ID) return { id, status: 'done', total: 1, generatedAt: '2026-08-01T00:00:00.000Z' };
      return null;
    },
    loadIndexRows: async () => autoRows,
    mkTable: async (table) => { autoWrites.push({ op: 'mkTable', table }); },
    put: async (table, id, row) => { autoWrites.push({ op: 'put', table, id, row }); return row; },
    tables: { courtAccountListSnapshot: 'snapshot', courtAccountListSnapshotTasks: 'snapshotTasks' }
  });
  await autoSync.recordDelta(autoRows[SNAPSHOT_DELTA_MERGE_THRESHOLD], { courtId: autoRows[SNAPSHOT_DELTA_MERGE_THRESHOLD].id, reason: 'threshold-test' });
  await new Promise((resolve) => setTimeout(resolve, 0));
  assert.ok(autoWrites.some((row) => row.id === SNAPSHOT_LAST_MERGE_TASK_ID && row.row.status === 'running'), 'delta 达阈值应自动启动合并任务');
  assert.ok(autoWrites.some((row) => row.id === SNAPSHOT_LAST_MERGE_TASK_ID && row.row.status === 'done'), '自动合并成功应记录 done');
  assert.ok(autoWrites.some((row) => row.id === SNAPSHOT_ACTIVE_META_ID && row.row.total === autoRows.length), '自动合并成功后才切换 active meta');

  const failedWrites = [];
  const failingAutoSync = createCourtAccountListSnapshotSync({
    getCachedRow: async (table, id) => {
      if (id === SNAPSHOT_ACTIVE_META_ID) return { id, status: 'done', total: 1, generatedAt: '2026-08-01T00:00:00.000Z' };
      if (id === SNAPSHOT_ACTIVE_DELTA_ID) return { id, upserts: autoRows.slice(0, SNAPSHOT_DELTA_MERGE_THRESHOLD - 1), deletes: [], count: SNAPSHOT_DELTA_MERGE_THRESHOLD - 1 };
      return null;
    },
    loadIndexRows: async () => { throw new Error('index read failed'); },
    put: async (table, id, row) => { failedWrites.push({ table, id, row }); return row; },
    tables: { courtAccountListSnapshot: 'snapshot', courtAccountListSnapshotTasks: 'snapshotTasks' }
  });
  await failingAutoSync.recordDelta(autoRows[SNAPSHOT_DELTA_MERGE_THRESHOLD], { courtId: autoRows[SNAPSHOT_DELTA_MERGE_THRESHOLD].id, reason: 'threshold-failed-test' });
  await new Promise((resolve) => setTimeout(resolve, 0));
  assert.ok(failedWrites.some((row) => row.id === SNAPSHOT_LAST_MERGE_TASK_ID && row.row.status === 'failed'), '自动合并失败应记录 failed');
  assert.ok(!failedWrites.some((row) => row.id === SNAPSHOT_ACTIVE_META_ID), '自动合并失败不能切换 active meta');
}

main()
  .then(() => console.log('court account list snapshot tests passed'))
  .catch((err) => {
    console.error(err);
    process.exit(1);
  });
