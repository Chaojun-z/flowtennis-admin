const assert = require('assert');
const { createCorePageDataRoutes } = require('../server/page-data/core-pages.js');
const { requireReadyStudentTeachingSummaryRows } = require('../server/read-models/student-teaching-summary-cache.js');

function readyStudentSummaryRows(rows = []) {
  return [
    {
      id: '__student_teaching_summary_meta__',
      kind: 'student-teaching-summary-meta',
      status: 'ready',
      rowCount: rows.length,
      generation: 1
    },
    ...rows
  ];
}

assert.deepStrictEqual(
  requireReadyStudentTeachingSummaryRows([{ id: 'legacy-summary-1', studentId: 'legacy-summary-1', name: '线上旧摘要' }]).map(row => row.id),
  ['legacy-summary-1'],
  '线上已有摘要表如果缺少 meta 但有真实摘要行，线索池和学员页不能直接报 missing-meta'
);
assert.throws(
  () => requireReadyStudentTeachingSummaryRows([]),
  /missing-meta/,
  '摘要表空表仍应拒绝展示，避免页面用空旧数据冒充成功'
);

function makeHandler() {
  const calls = { tableScans: {} };
  const rows = {
    leads: [],
    students: [
      { id: 'stu-trial-1', name: '体验一' },
      { id: 'stu-trial-2', name: '体验二' },
      { id: 'stu-trial-formal', name: '体验成交' }
    ],
    purchases: [
      {
        id: 'purchase-formal',
        studentId: 'stu-trial-formal',
        studentName: '体验成交',
        courseType: '私教课',
        packageName: '10 节私教课包',
        amountPaid: 6000,
        purchaseDate: '2026-08-02'
      }
    ],
    entitlements: [],
    entitlementLedger: [],
    schedule: [
      {
        id: 'trial-1',
        studentId: 'stu-trial-1',
        studentIds: ['stu-trial-1'],
        studentName: '体验一',
        courseType: '体验课',
        startTime: '2026-08-01 10:00:00',
        status: '已排课'
      },
      {
        id: 'trial-2',
        studentId: 'stu-trial-2',
        studentIds: ['stu-trial-2'],
        studentName: '体验二',
        courseType: '体验课',
        startTime: '2026-08-02 10:00:00',
        status: '已排课'
      },
      {
        id: 'trial-formal',
        studentId: 'stu-trial-formal',
        studentIds: ['stu-trial-formal'],
        studentName: '体验成交',
        courseType: '体验课',
        startTime: '2026-08-03 10:00:00',
        status: '已排课'
      },
      {
        id: 'trial-future',
        studentId: 'stu-future',
        studentIds: ['stu-future'],
        studentName: '未来体验',
        courseType: '体验课',
        startTime: '2026-09-03 10:00:00',
        status: '已排课'
      },
      {
        id: 'trial-cancelled',
        studentId: 'stu-cancelled',
        studentIds: ['stu-cancelled'],
        studentName: '取消体验',
        courseType: '体验课',
        startTime: '2026-08-03 10:00:00',
        status: '已取消'
      }
    ],
    feedbacks: [],
    membershipBenefitLedger: [],
    studentSummaries: [
      {
        id: 'stu-trial-1',
        studentId: 'stu-trial-1',
        name: '体验一',
        hasTrialAttended: true,
        hasFormalAttended: false,
        isHistoricalStudentRoster: true,
        isActiveStudentRoster: false
      },
      {
        id: 'stu-active-1',
        studentId: 'stu-active-1',
        name: '活跃一',
        hasTrialAttended: true,
        hasFormalAttended: true,
        isHistoricalStudentRoster: false,
        isActiveStudentRoster: false,
        lastFormalLessonAt: '2026-08-20',
        detailRecentLessonDate: '2026-08-20',
        packageBalanceRemaining: 1,
        activityStatusLabel: '近30天活跃',
        studentStatusLabel: '课包活跃中'
      }
    ]
  };
  const tableRows = {
    ft_leads: rows.leads,
    ft_students: rows.students,
    ft_purchases: rows.purchases,
    ft_entitlements: rows.entitlements,
    ft_entitlement_ledger: rows.entitlementLedger,
    ft_schedule: rows.schedule,
    ft_feedbacks: rows.feedbacks,
    ft_membership_benefit_ledger: rows.membershipBenefitLedger,
    ft_student_teaching_summary: readyStudentSummaryRows(rows.studentSummaries)
  };
  const clone = value => JSON.parse(JSON.stringify(value || []));
  const readTable = async table => {
    calls.tableScans[table] = (calls.tableScans[table] || 0) + 1;
    return clone(tableRows[table]);
  };
  const handler = createCorePageDataRoutes({
    init: async () => {},
    sendJson: (res, body, status = 200) => {
      res.statusCode = status;
      res.body = body;
      return body;
    },
    cappedScan: readTable,
    getCachedScan: readTable,
    getCachedRow: async () => null,
    filterLoadAllForUser: data => data,
    PRODUCTION_PAGE_READ_LIMITS: { schedule: 2000, entitlementLedger: 2000 },
    tables: {
      T_LEADS: 'ft_leads',
      T_STUDENTS: 'ft_students',
      T_PURCHASES: 'ft_purchases',
      T_ENTITLEMENTS: 'ft_entitlements',
      T_ENTITLEMENT_LEDGER: 'ft_entitlement_ledger',
      T_SCHEDULE: 'ft_schedule',
      T_FEEDBACKS: 'ft_feedbacks',
      T_MEMBERSHIP_BENEFIT_LEDGER: 'ft_membership_benefit_ledger',
      T_STUDENT_TEACHING_SUMMARY: 'ft_student_teaching_summary'
    }
  });
  return { handler, calls };
}

function makeIsolatedRouteHandler() {
  const handler = createCorePageDataRoutes({
    init: async () => {},
    sendJson: (res, body, status = 200) => {
      res.statusCode = status;
      res.body = body;
      return body;
    },
    cappedScan: async table => {
      throw new Error(`首屏路由不允许扫描事实表: ${table}`);
    },
    getCachedScan: async table => {
      throw new Error(`首屏路由不允许直接读取表: ${table}`);
    },
    getCachedRow: async table => {
      throw new Error(`首屏路由不允许直接读取单行: ${table}`);
    },
    filterLoadAllForUser: data => data,
    PRODUCTION_PAGE_READ_LIMITS: { schedule: 2000, entitlementLedger: 2000 },
    studentRosterIndexReader: {
      readCustomerCenterList: async () => ({
        customerLifecycleRows: [],
        teachingStudentViews: { historicalStudents: [], activeStudents: [], summary: {} },
        standardLifecycleMetrics: { teachingSummary: { historicalStudentCount: 0, activeStudentCount: 0 }, metrics: {}, funnels: {}, views: {} },
        listPage: null
      })
    },
    tables: {
      T_LEADS: 'ft_leads',
      T_STUDENTS: 'ft_students',
      T_PURCHASES: 'ft_purchases',
      T_ENTITLEMENTS: 'ft_entitlements',
      T_ENTITLEMENT_LEDGER: 'ft_entitlement_ledger',
      T_SCHEDULE: 'ft_schedule',
      T_FEEDBACKS: 'ft_feedbacks',
      T_MEMBERSHIP_BENEFIT_LEDGER: 'ft_membership_benefit_ledger',
      T_STUDENT_TEACHING_SUMMARY: 'ft_student_teaching_summary'
    }
  });
  return handler;
}

function makeBulkSummaryHandler(count = 1200) {
  const calls = { tableScans: {} };
  const summaryRows = Array.from({ length: count }, (_, index) => ({
    id: `bulk-${index}`,
    studentId: `bulk-${index}`,
    name: `学员${index}`,
    displayName: `学员${index}`,
    source: index % 2 ? '小红书' : '大众点评',
    campus: index % 3 ? '朝珺私教' : '顺义马坡',
    type: index % 2 ? '成人' : '青少年',
    primaryCoach: index % 5 ? 'Mira' : '吴敌',
    hasTrialAttended: index % 4 === 0,
    hasFormalAttended: true,
    isHistoricalStudentRoster: true,
    isActiveStudentRoster: index % 3 !== 0,
    packageBalanceRemaining: index % 3 !== 0 ? 3 : 0,
    activityStatusLabel: index % 3 !== 0 ? '近30天活跃' : '91-180天沉默',
    packageStatusLabel: index % 3 !== 0 ? '课包有余额' : '课包已用完',
    studentStatusLabel: index % 3 !== 0 ? '课包活跃中' : '课包待续费',
    searchText: `学员${index} bulk-${index}`
  }));
  const handler = createCorePageDataRoutes({
    init: async () => {},
    sendJson: (res, body, status = 200) => {
      res.statusCode = status;
      res.body = body;
      return body;
    },
    cappedScan: async table => {
      throw new Error(`首屏性能测试不允许扫描事实表: ${table}`);
    },
    getCachedScan: async table => {
      calls.tableScans[table] = (calls.tableScans[table] || 0) + 1;
      if (table === 'ft_student_teaching_summary') return JSON.parse(JSON.stringify(readyStudentSummaryRows(summaryRows)));
      throw new Error(`首屏性能测试不允许读取其他表: ${table}`);
    },
    getCachedRow: async () => null,
    filterLoadAllForUser: data => data,
    PRODUCTION_PAGE_READ_LIMITS: { schedule: 2000, entitlementLedger: 2000 },
    tables: {
      T_LEADS: 'ft_leads',
      T_STUDENTS: 'ft_students',
      T_PURCHASES: 'ft_purchases',
      T_ENTITLEMENTS: 'ft_entitlements',
      T_ENTITLEMENT_LEDGER: 'ft_entitlement_ledger',
      T_SCHEDULE: 'ft_schedule',
      T_FEEDBACKS: 'ft_feedbacks',
      T_MEMBERSHIP_BENEFIT_LEDGER: 'ft_membership_benefit_ledger',
      T_STUDENT_TEACHING_SUMMARY: 'ft_student_teaching_summary'
    }
  });
  return { handler, calls };
}

async function request(queryText = '') {
  const { handler, calls } = makeHandler();
  const res = {};
  await handler({
    path: '/page-data/customer-center-list',
    method: 'GET',
    user: { role: 'admin', name: '管理员' },
    res,
    query: new URLSearchParams(queryText)
  });
  return { res, calls };
}

(async () => {
  const { res, calls } = await request();
  assert.strictEqual(res.statusCode, 200);
  assert.strictEqual(
    res.body.standardLifecycleMetrics.teachingSummary.trialAttendedStudentCount,
    2,
    '客户中心顶部上过体验课必须读取统一教学摘要读模型'
  );
  assert.strictEqual(
    res.body.standardLifecycleMetrics.teachingSummary.trialAttendedToFormalPurchaseCount,
    1,
    '体验后买正式课必须读取统一教学摘要读模型里的体验和正式课事实'
  );
  assert.strictEqual(
    res.body.standardLifecycleMetrics.teachingSummary.trialAttendedWithoutFormalCount,
    1,
    '体验未买正式课必须由同一批统一教学摘要读模型计算'
  );
  assert.strictEqual(
    res.body.standardLifecycleMetrics.teachingSummary.activeStudentCount,
    1,
    '在期学员必须能从摘要行里的最近正式课和课包余额字段稳定还原'
  );
  assert.strictEqual(calls.tableScans.ft_student_teaching_summary, 1, '客户中心首屏必须读取统一教学摘要读模型');
  ['ft_schedule','ft_entitlement_ledger','ft_membership_benefit_ledger','ft_purchases','ft_entitlements','ft_students'].forEach(table => {
    assert.strictEqual(calls.tableScans[table] || 0, 0, `客户中心首屏不能扫描事实大表 ${table}`);
  });

  const fresh = await request('fresh=1');
  assert.strictEqual(
    fresh.res.body.standardLifecycleMetrics.teachingSummary.trialAttendedStudentCount,
    2,
    '强制 fresh 也不能让首屏回退成扫描事实大表'
  );

  const isolatedHandler = makeIsolatedRouteHandler();
  const isolatedRes = {};
  await isolatedHandler({
    path: '/page-data/customer-center-list',
    method: 'GET',
    user: { role: 'admin', name: '管理员' },
    res: isolatedRes,
    query: new URLSearchParams()
  });
  assert.strictEqual(isolatedRes.statusCode, 200, '首屏路由必须只依赖注入的学员 roster reader');

  const bulk = makeBulkSummaryHandler(1200);
  const bulkRes = {};
  const startedAt = Date.now();
  await bulk.handler({
    path: '/page-data/customer-center-list',
    method: 'GET',
    user: { role: 'admin', name: '管理员' },
    res: bulkRes,
    query: new URLSearchParams('view=activeStudents&paged=1&page=1&pageSize=15')
  });
  const elapsedMs = Date.now() - startedAt;
  assert.strictEqual(bulkRes.statusCode, 200);
  assert.ok(elapsedMs < 1000, `1200 条统一摘要下首屏搜索分页应为秒级，当前 ${elapsedMs}ms`);
  assert.strictEqual(bulk.calls.tableScans.ft_student_teaching_summary, 1, '秒级首屏只允许读取一次统一摘要索引');
  assert.strictEqual(bulkRes.body.listPage.rows.length, 15, '默认分页只返回当前页行');
  assert.ok(
    bulkRes.body.standardLifecycleMetrics.teachingSummary.activeStudentCount > bulkRes.body.listPage.rows.length,
    '顶部统计必须来自完整统一集合，不能只统计当前页'
  );
  const searchRes = {};
  await bulk.handler({
    path: '/page-data/customer-center-list',
    method: 'GET',
    user: { role: 'admin', name: '管理员' },
    res: searchRes,
    query: new URLSearchParams('view=activeStudents&paged=1&page=1&pageSize=15&q=学员1199')
  });
  assert.strictEqual(searchRes.body.listPage.rows.length, 1, '搜索分页只返回当前页命中行');
  assert.strictEqual(searchRes.body.standardLifecycleMetrics.teachingSummary.activeStudentCount, 1, '搜索后的顶部统计必须来自搜索后的完整统一集合');

  console.log('customer center summary fact calibration tests passed');
})().catch(err => {
  console.error(err);
  process.exit(1);
});
