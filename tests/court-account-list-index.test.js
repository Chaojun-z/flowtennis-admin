const assert = require('assert');

const {
  buildCourtAccountListViewFromData
} = require('../server/page-data/court-account-read-model.js');
const {
  buildCourtAccountListIndexRowsFromData,
  buildCourtAccountListViewFromIndexRows,
  createCourtAccountListIndexLoader,
  createCourtAccountListIndexSync
} = require('../server/page-data/court-account-list-index.js');

const source = {
  campuses: [{ code: 'shunyi_mapo', name: '马坡' }],
  students: [],
  leads: [
    { id: 'lead-1', courtId: 'court-new', owner: '跟进人甲' },
    { id: 'lead-2', courtId: 'court-old', owner: '跟进人乙' },
    { id: 'lead-3', courtId: 'court-search-a', owner: '跟进人乙' },
    { id: 'lead-4', courtId: 'court-search-b', owner: '跟进人乙' }
  ],
  courts: [{
    id: 'court-new',
    name: '最新订场用户',
    campus: 'shunyi_mapo',
    history: [
      { type: '消费', amount: 100, payMethod: '微信', category: '订场', date: '2026-08-03', startTime: '10:00', endTime: '11:00', venue: '1号场' },
      { type: '退款', amount: 20, payMethod: '微信', category: '订场', date: '2026-08-03', startTime: '10:00', endTime: '11:00', venue: '1号场' }
    ],
    updatedAt: '2026-01-01 10:00:00'
  }, {
    id: 'court-old',
    name: '旧订场用户',
    campus: 'shunyi_mapo',
    history: [{ type: '消费', amount: 100, payMethod: '微信', category: '订场', date: '2026-01-01', startTime: '10:00', endTime: '11:00', venue: '1号场' }],
    updatedAt: '2026-08-05 10:00:00'
  }, {
    id: 'court-search-a',
    name: '搜索目标甲',
    campus: 'shunyi_mapo',
    history: [{ type: '消费', amount: 100, payMethod: '微信', category: '订场', date: '2026-08-02', startTime: '10:00', endTime: '11:00', venue: '1号场' }],
    updatedAt: '2026-08-04 10:00:00'
  }, {
    id: 'court-search-b',
    name: '搜索目标乙',
    campus: 'shunyi_mapo',
    history: [{ type: '消费', amount: 100, payMethod: '微信', category: '订场', date: '2026-08-01', startTime: '10:00', endTime: '11:00', venue: '1号场' }],
    updatedAt: '2026-08-03 10:00:00'
  }, {
    id: 'member-new',
    name: '新会员',
    campus: 'shunyi_mapo',
    history: [],
    updatedAt: '2026-01-01 10:00:00'
  }],
  membershipAccounts: [{ id: 'account-new', courtId: 'member-new', status: 'active' }],
  membershipOrders: [{ id: 'order-new', courtId: 'member-new', membershipAccountId: 'account-new', status: 'paid', rechargeAmount: 1000, purchaseDate: '2026-08-01' }],
  membershipPlans: [],
  membershipBenefitLedger: [],
  membershipAccountEvents: []
};

function comparable(view) {
  return {
    ids: (view.items || []).map((item) => item.id),
    total: view.pagination?.total || 0,
    summary: {
      totalCount: view.summary.totalCount,
      totalBookingCount: view.summary.totalBookingCount,
      totalBookingAmount: view.summary.totalBookingAmount,
      totalMemberCount: view.summary.totalMemberCount,
      membershipFinanceSummary: view.summary.membershipFinanceSummary
    }
  };
}

async function main() {
  const indexRows = buildCourtAccountListIndexRowsFromData(source);
  assert.strictEqual(indexRows.length, 5, '索引应从事实源重建全部有效订场用户');
  assert.ok(!indexRows.some((row) => row.item.bookingRows || row.item.rechargeRows || row.item.benefitRows), '列表索引不应保存详情抽屉完整明细');
  assert.ok(indexRows.some((row) => row.id === 'member-new' && row.membershipFinanceStats?.paidAmount === 1000), '列表索引应保存会员顶部统计需要的轻量口径字段');

  const cases = [
    { page: 1, pageSize: 2, sortKey: 'lastBookingDate', sortDir: 'desc' },
    { page: 1, pageSize: 1, q: '搜索目标', sortKey: 'lastBookingDate', sortDir: 'desc' },
    { page: 1, pageSize: 1, owner: '跟进人乙', sortKey: 'lastBookingDate', sortDir: 'desc' },
    { page: 1, pageSize: 2, startDate: '2026-08-01', endDate: '2026-08-31', sortKey: 'lastBookingDate', sortDir: 'desc' },
    { page: 1, pageSize: 1, accountType: '会员账户', sortKey: 'firstOpenDate', sortDir: 'desc' }
  ];
  cases.forEach((options) => {
    const factsView = buildCourtAccountListViewFromData(source, options);
    const indexView = buildCourtAccountListViewFromIndexRows(indexRows, options);
    assert.deepStrictEqual(comparable(indexView), comparable(factsView), `索引列表应和事实表现算一致：${JSON.stringify(options)}`);
    assert.ok(!indexView.items.some((item) => item.membershipFinanceStats), '列表返回项不应暴露索引内部会员统计字段');
  });

  const pages = [1, 2, 3, 4].map((page) => buildCourtAccountListViewFromIndexRows(indexRows, { page, pageSize: 1, sortKey: 'lastBookingDate', sortDir: 'desc' }));
  assert.deepStrictEqual(pages.map((view) => view.items[0].id), ['court-new', 'court-search-a', 'court-search-b', 'court-old'], '索引翻页应不丢、不重、不乱序');

  const writes = [];
  const sync = createCourtAccountListIndexSync({
    listCampusesWithDefaults: async () => source.campuses,
    getCachedRow: async (table, id) => source.courts.find((row) => row.id === id) || null,
    getCachedScan: async (table) => source[table] || [],
    put: async (table, id, row) => { writes.push({ table, id, row }); return row; },
    del: async (table, id) => { writes.push({ table, id, deleted: true }); },
    tables: {
      courts: 'courts',
      students: 'students',
      leads: 'leads',
      membershipAccounts: 'membershipAccounts',
      membershipOrders: 'membershipOrders',
      membershipPlans: 'membershipPlans',
      membershipBenefitLedger: 'membershipBenefitLedger',
      membershipAccountEvents: 'membershipAccountEvents',
      courtAccountListIndex: 'courtAccountListIndex',
      courtAccountListIndexTasks: 'courtAccountListIndexTasks'
    }
  });
  await sync.rebuildCourt('court-new', 'test-sync');
  assert.ok(writes.some((row) => row.table === 'courtAccountListIndex' && row.id === 'court-new'), '写入后应同步重建单个订场用户索引');

  const failedWrites = [];
  const failingSync = createCourtAccountListIndexSync({
    listCampusesWithDefaults: async () => source.campuses,
    getCachedRow: async (table, id) => source.courts.find((row) => row.id === id) || null,
    getCachedScan: async (table) => source[table] || [],
    put: async (table, id, row) => {
      if (table === 'courtAccountListIndex') throw new Error('index write failed');
      failedWrites.push({ table, id, row });
      return row;
    },
    del: async () => {},
    tables: {
      courts: 'courts',
      courtAccountListIndex: 'courtAccountListIndex',
      courtAccountListIndexTasks: 'courtAccountListIndexTasks'
    }
  });
  await failingSync.rebuildCourt('court-new', 'test-failed-sync');
  assert.ok(failedWrites.some((row) => row.table === 'courtAccountListIndexTasks' && row.row.status === 'pending'), '索引同步失败应留下补偿任务');

  const rebuildWrites = [];
  const rebuildReads = [];
  const rebuildSync = createCourtAccountListIndexSync({
    listCampusesWithDefaults: async () => source.campuses,
    getCachedRow: async (table, id) => {
      rebuildReads.push({ op: 'getRow', table, id });
      return source[table]?.find((row) => row.id === id) || null;
    },
    getCachedScan: async (table, options = {}) => {
      rebuildReads.push({ op: 'scan', table, columns: options.columns || [] });
      if (table === 'courts') return (source.courts || []).map(({ history, ...row }) => row);
      return source[table] || [];
    },
    mkTable: async (table) => { rebuildWrites.push({ op: 'mkTable', table }); },
    put: async (table, id, row) => { rebuildWrites.push({ op: 'put', table, id, row }); return row; },
    del: async () => {},
    tables: {
      courts: 'courts',
      students: 'students',
      leads: 'leads',
      membershipAccounts: 'membershipAccounts',
      membershipOrders: 'membershipOrders',
      membershipPlans: 'membershipPlans',
      membershipBenefitLedger: 'membershipBenefitLedger',
      membershipAccountEvents: 'membershipAccountEvents',
      courtAccountListIndex: 'courtAccountListIndex',
      courtAccountListIndexTasks: 'courtAccountListIndexTasks'
    }
  });
  const dryRows = await rebuildSync.loadAllRowsFromFacts();
  assert.strictEqual(dryRows.length, 5, 'dry-run 应只从事实源生成可校验索引行');
  assert.deepStrictEqual(rebuildWrites, [], 'dry-run 不应建表或写索引');
  const courtScan = rebuildReads.find((row) => row.op === 'scan' && row.table === 'courts');
  assert.ok(courtScan && !courtScan.columns.includes('history'), '全量重建应先轻扫订场用户，避免范围扫描一次拉多条 history');
  assert.strictEqual(rebuildReads.filter((row) => row.op === 'getRow' && row.table === 'courts').length, 5, '全量重建应按单个订场用户回源完整 history');
  const rebuildResult = await rebuildSync.rebuildAllFromFacts();
  assert.strictEqual(rebuildResult.total, 5, '正式重建应返回索引总数');
  assert.deepStrictEqual(rebuildWrites.slice(0, 2).map((row) => `${row.op}:${row.table}`), ['mkTable:courtAccountListIndex', 'mkTable:courtAccountListIndexTasks'], '正式重建写入前应先确保索引表存在');
  assert.strictEqual(rebuildWrites.filter((row) => row.op === 'put' && row.table === 'courtAccountListIndex').length, 5, '正式重建应把完整索引行写入索引表');

  const failingDryRunSync = createCourtAccountListIndexSync({
    listCampusesWithDefaults: async () => source.campuses,
    getCachedRow: async () => null,
    getCachedScan: async (table) => {
      if (table === 'courts') throw new Error('storage timeout');
      return source[table] || [];
    },
    put: async () => {},
    del: async () => {},
    tables: {
      courts: 'courts',
      students: 'students',
      leads: 'leads',
      membershipAccounts: 'membershipAccounts',
      membershipOrders: 'membershipOrders',
      membershipPlans: 'membershipPlans',
      membershipBenefitLedger: 'membershipBenefitLedger',
      membershipAccountEvents: 'membershipAccountEvents',
      courtAccountListIndex: 'courtAccountListIndex'
    }
  });
  await assert.rejects(
    () => failingDryRunSync.loadAllRowsFromFacts(),
    /订场会员列表索引重建读取失败：订场用户表/,
    'dry-run 不能把事实表读取失败吞成 0 条索引'
  );

  let emptyScanCount = 0;
  const emptyLoader = createCourtAccountListIndexLoader({
    getCachedScan: async () => {
      emptyScanCount += 1;
      return [];
    },
    tables: { courtAccountListIndex: 'courtAccountListIndex' }
  });
  await assert.rejects(
    () => emptyLoader({ page: 1, pageSize: 15 }),
    (err) => err.code === 'COURT_ACCOUNT_LIST_INDEX_NOT_READY' && err.statusCode === 503,
    '索引为空时列表应快速失败，不能慢扫事实大表冒充可用'
  );
  await assert.rejects(
    () => emptyLoader({ page: 1, pageSize: 15 }),
    (err) => err.code === 'COURT_ACCOUNT_LIST_INDEX_NOT_READY' && err.statusCode === 503,
    '索引为空进入短缓存后仍应快速失败'
  );
  assert.strictEqual(emptyScanCount, 1, '索引未就绪短缓存期间不应重复扫描索引表');

  let missingScanCount = 0;
  const missingTableLoader = createCourtAccountListIndexLoader({
    getCachedScan: async () => {
      missingScanCount += 1;
      const err = new Error('Request table not exist');
      err.code = 400;
      throw err;
    },
    tables: { courtAccountListIndex: 'courtAccountListIndex' }
  });
  await assert.rejects(
    () => missingTableLoader({ page: 1, pageSize: 15 }),
    (err) => err.code === 'COURT_ACCOUNT_LIST_INDEX_NOT_READY' && err.statusCode === 503,
    '索引表不存在时列表应快速失败，不能退回 20 秒级事实表扫描'
  );
  await assert.rejects(
    () => missingTableLoader({ page: 1, pageSize: 15 }),
    (err) => err.code === 'COURT_ACCOUNT_LIST_INDEX_NOT_READY' && err.statusCode === 503,
    '索引表不存在进入短缓存后仍应快速失败'
  );
  assert.strictEqual(missingScanCount, 1, '索引表不存在短缓存期间不应重复扫描索引表');

  const partialLoader = createCourtAccountListIndexLoader({
    getCachedRow: async () => ({ id: '__last_full_rebuild__', status: 'done', total: 5 }),
    getCachedScan: async () => indexRows.slice(0, 2),
    tables: { courtAccountListIndex: 'courtAccountListIndex', courtAccountListIndexTasks: 'courtAccountListIndexTasks' }
  });
  await assert.rejects(
    () => partialLoader({ page: 1, pageSize: 15 }),
    (err) => err.code === 'COURT_ACCOUNT_LIST_INDEX_NOT_READY' && /2\/5/.test(err.message),
    '索引部分写入时不能启用列表，防止只显示部分旧数据'
  );

  const readyLoader = createCourtAccountListIndexLoader({
    getCachedRow: async () => ({ id: '__last_full_rebuild__', status: 'done', total: indexRows.length }),
    getCachedScan: async () => indexRows,
    tables: { courtAccountListIndex: 'courtAccountListIndex', courtAccountListIndexTasks: 'courtAccountListIndexTasks' }
  });
  const readyView = await readyLoader({ page: 1, pageSize: 2, sortKey: 'lastBookingDate', sortDir: 'desc' });
  assert.strictEqual(readyView.pagination.total, 5, '索引完整且有完成标记时才可启用列表');
}

main()
  .then(() => console.log('court account list index tests passed'))
  .catch((error) => {
    console.error(error);
    process.exit(1);
  });
