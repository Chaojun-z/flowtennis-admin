const assert = require('assert');
const { createCorePageDataRoutes } = require('../server/page-data/core-pages.js');
const {
  requireReadyStudentTeachingSummaryRows,
  buildStudentTeachingSummaryChecksum,
  buildVersionedStudentTeachingSummaryRow,
  buildStudentTeachingSummaryBundleId
} = require('../server/read-models/student-teaching-summary-cache.js');

function readyStudentSummaryRows(rows = []) {
  return [
    {
      id: '__student_teaching_summary_meta__',
      kind: 'student-teaching-summary-meta',
      status: 'ready',
      rowCount: rows.length,
      generation: 1,
      batchId: 'test-batch',
      sourceSnapshotAt: '2026-08-27T00:00:00.000Z',
      completedAt: '2026-08-27T00:00:01.000Z',
      checksum: buildStudentTeachingSummaryChecksum(rows)
    },
    ...rows
  ];
}

function legacyReadyStudentSummaryRows(rows = []) {
  return [
    {
      id: '__student_teaching_summary_meta__',
      kind: 'student-teaching-summary-meta',
      status: 'ready',
      rowCount: rows.length,
      generation: 1,
      checksum: buildStudentTeachingSummaryChecksum(rows)
    },
    ...rows
  ];
}

assert.throws(
  () => requireReadyStudentTeachingSummaryRows([{ id: 'legacy-summary-1', studentId: 'legacy-summary-1', name: '线上旧摘要' }]),
  /missing-meta/,
  '旧摘要缺少发布元数据时必须拒绝展示，不能把旧数字当成正确数字'
);
assert.throws(
  () => requireReadyStudentTeachingSummaryRows([
    { id: '__student_teaching_summary_meta__', kind: 'student-teaching-summary-meta', status: 'pending', rowCount: '' },
    { id: 'stale-summary-1', studentId: 'stale-summary-1', name: '待刷新期间旧摘要' }
  ]),
  /pending/,
  '刷新中的旧摘要必须拒绝展示，不能让三页继续显示旧数字'
);
assert.throws(
  () => requireReadyStudentTeachingSummaryRows([
    { id: '__student_teaching_summary_meta__', kind: 'student-teaching-summary-meta', status: 'failed', rowCount: '' },
    { id: 'failed-summary-1', studentId: 'failed-summary-1', name: '失败摘要' }
  ]),
  /failed/,
  '摘要刷新明确失败时仍应拒绝展示，避免吞掉真实故障'
);
const legacyReadyRows = requireReadyStudentTeachingSummaryRows(legacyReadyStudentSummaryRows([
  { id: 'legacy-ready-summary-1', studentId: 'legacy-ready-summary-1', name: '旧 ready 摘要' }
]));
assert.strictEqual(legacyReadyRows.length, 1, '旧 ready 摘要缺少发布元数据时也应可读，避免卡死页面');

function makeHandler({ legacyReady = false, mutateSummaryOnWrite = false } = {}) {
  const calls = { tableScans: {}, prefixScans: {}, puts: [], deletes: [] };
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
    ft_student_teaching_summary: legacyReady ? legacyReadyStudentSummaryRows(rows.studentSummaries) : readyStudentSummaryRows(rows.studentSummaries)
  };
  const clone = value => JSON.parse(JSON.stringify(value || []));
  const readTable = async table => {
    calls.tableScans[table] = (calls.tableScans[table] || 0) + 1;
    return clone(tableRows[table]);
  };
  const upsertRow = (table, id, row) => {
    calls.puts.push({ table, id });
    if (!Array.isArray(tableRows[table])) tableRows[table] = [];
    const next = clone(row);
    if (mutateSummaryOnWrite && table === 'ft_student_teaching_summary' && String(id || '') !== '__student_teaching_summary_meta__') {
      if (typeof next.summaryUpdatedAt === 'string' && next.summaryUpdatedAt) next.summaryUpdatedAt = next.summaryUpdatedAt.replace('T', ' ');
      if (typeof next.updatedAt === 'string' && next.updatedAt) next.updatedAt = next.updatedAt.replace('T', ' ');
    }
    const index = tableRows[table].findIndex(item => String(item.id || '') === String(id || ''));
    if (index >= 0) tableRows[table][index] = next;
    else tableRows[table].push(next);
    return next;
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
    getCachedRow: async (table, id) => {
      const list = tableRows[table] || [];
      const found = list.find(item => String(item.id || '') === String(id || ''));
      return found ? clone(found) : null;
    },
    scanByIdPrefix: async (table, prefix) => {
      calls.prefixScans[table] = (calls.prefixScans[table] || 0) + 1;
      const list = tableRows[table] || [];
      return clone(list.filter(item => String(item.id || '').startsWith(prefix)));
    },
    filterLoadAllForUser: data => data,
    PRODUCTION_PAGE_READ_LIMITS: { schedule: 2000, entitlementLedger: 2000 },
    put: async (table, id, row) => upsertRow(table, id, row),
    del: async (table, id) => {
      calls.deletes.push({ table, id });
      if (!Array.isArray(tableRows[table])) return;
      tableRows[table] = tableRows[table].filter(item => String(item.id || '') !== String(id || ''));
    },
    mkTable: async table => {
      if (!Array.isArray(tableRows[table])) tableRows[table] = [];
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
  return { handler, calls, tableRows };
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

async function request(queryText = '', { legacyReady = false } = {}) {
  const { handler, calls } = makeHandler({ legacyReady });
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

  const legacyReady = await request('', { legacyReady: true });
  assert.strictEqual(legacyReady.res.statusCode, 200, '旧 ready 摘要缺少发布元数据时，客户中心仍应可正常加载');

  const rebuildDryRun = makeHandler({ mutateSummaryOnWrite: true });
  const rebuildDryRunRes = {};
  await rebuildDryRun.handler({
    path: '/page-data/customer-center-list/rebuild-summary',
    method: 'POST',
    user: { role: 'admin', name: '管理员' },
    res: rebuildDryRunRes,
    query: new URLSearchParams('dryRun=1')
  });
  assert.strictEqual(rebuildDryRunRes.statusCode, 200, '手工重建摘要 dry-run 应成功返回');
  assert.strictEqual(rebuildDryRunRes.body.dryRun, true, 'dry-run 响应必须明确标记未写入');
  assert.strictEqual(rebuildDryRunRes.body.writePerformed, false, 'dry-run 不得写入摘要表');
  assert.strictEqual(rebuildDryRunRes.body.count, 4, 'dry-run 必须返回将要发布的摘要行数');
  assert.strictEqual(rebuildDryRunRes.body.teachingSummary.historicalStudentCount, 4, 'dry-run 必须返回重建后的历史学员顶部数');
  assert.strictEqual(rebuildDryRunRes.body.teachingSummary.activeStudentCount, 0, 'dry-run 必须返回重建后的在期学员顶部数');
  assert.deepStrictEqual(rebuildDryRun.calls.puts, [], 'dry-run 不能写 meta、版本行或 bundle');
  assert.deepStrictEqual(rebuildDryRun.calls.deletes, [], 'dry-run 不能清理旧版本');

  const rebuild = makeHandler({ mutateSummaryOnWrite: true });
  const rebuildRes = {};
  await rebuild.handler({
    path: '/page-data/customer-center-list/rebuild-summary',
    method: 'POST',
    user: { role: 'admin', name: '管理员' },
    res: rebuildRes,
    query: new URLSearchParams()
  });
  assert.strictEqual(rebuildRes.statusCode, 200, '手工重建摘要应成功返回');
  const rebuiltSummaryRows = requireReadyStudentTeachingSummaryRows(rebuild.tableRows.ft_student_teaching_summary || []);
  const rebuiltMetaRow = (rebuild.tableRows.ft_student_teaching_summary || []).find(row => row.id === '__student_teaching_summary_meta__');
  assert.ok(rebuiltMetaRow, '手工重建后必须写回 meta 行');
  assert.ok(
    (rebuild.tableRows.ft_student_teaching_summary || []).some(row => String(row.id || '').startsWith('__student_teaching_summary_bundle__:')),
    '手工重建必须写入压缩发布包'
  );
  assert.strictEqual(
    rebuiltMetaRow.checksum,
    buildStudentTeachingSummaryChecksum(rebuiltSummaryRows),
    '手工重建写回的 checksum 必须基于 ready 发布包里的摘要行'
  );

  const bundleRows = [
    { id: 'bundle-student-1', studentId: 'bundle-student-1', name: '补包学员一' },
    { id: 'bundle-student-2', studentId: 'bundle-student-2', name: '补包学员二' }
  ];
  const bundleVersion = 'student-teaching-summary-existing-ready';
  const bundleHandler = makeHandler();
  bundleHandler.tableRows.ft_student_teaching_summary = [
    {
      id: '__student_teaching_summary_meta__',
      kind: 'student-teaching-summary-meta',
      status: 'ready',
      rowCount: bundleRows.length,
      generation: 1,
      batchId: bundleVersion,
      activeVersion: bundleVersion,
      sourceSnapshotAt: '2026-08-27T00:00:00.000Z',
      completedAt: '2026-08-27T00:00:01.000Z',
      checksum: buildStudentTeachingSummaryChecksum(bundleRows)
    },
    ...bundleRows.map(row => buildVersionedStudentTeachingSummaryRow(row, bundleVersion))
  ];
  const bundleRes = {};
  await bundleHandler.handler({
    path: '/page-data/customer-center-list/publish-summary-bundle',
    method: 'POST',
    user: { role: 'admin', name: '管理员' },
    res: bundleRes,
    query: new URLSearchParams()
  });
  assert.strictEqual(bundleRes.statusCode, 200, '当前 ready 版本应允许只补写发布包');
  assert.strictEqual(bundleRes.body.count, bundleRows.length, '补写发布包应保持当前 ready 版本行数');
  assert.ok(
    bundleHandler.tableRows.ft_student_teaching_summary.some(row => row.id === buildStudentTeachingSummaryBundleId(bundleVersion)),
    '补写发布包接口必须写入当前 activeVersion 的单行 bundle'
  );
  ['ft_schedule','ft_entitlement_ledger','ft_membership_benefit_ledger','ft_purchases','ft_entitlements','ft_students'].forEach(table => {
    assert.strictEqual(bundleHandler.calls.tableScans[table] || 0, 0, `补写发布包不能扫描事实大表 ${table}`);
  });
  assert.strictEqual(bundleHandler.calls.prefixScans.ft_student_teaching_summary, 1, '补写发布包只能按当前 activeVersion 扫摘要表版本前缀');

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

  const notReadyHandler = createCorePageDataRoutes({
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
      readCustomerCenterList: async () => {
        const err = new Error('教学学员统一摘要未就绪，页面拒绝展示旧数据：pending');
        err.code = 'STUDENT_TEACHING_SUMMARY_NOT_READY';
        err.statusCode = 503;
        throw err;
      }
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
  const notReadyRes = {};
  await notReadyHandler({
    path: '/page-data/customer-center-list',
    method: 'GET',
    user: { role: 'admin', name: '管理员' },
    res: notReadyRes,
    query: new URLSearchParams()
  });
  assert.strictEqual(notReadyRes.statusCode, 200, '统一摘要未就绪时客户中心也必须返回可渲染结构，避免页面 503');
  assert.strictEqual(notReadyRes.body.studentTeachingSummaryUnavailable, true, '摘要不可用时必须显式标记降级状态');
  assert.deepStrictEqual(notReadyRes.body.teachingStudentViews.historicalStudents, [], '摘要不可用时不能回旧数据');

  const fallbackFactRows = {
    ft_leads: [{
    id: 'lead-fallback',
    displayName: '回退学员',
    wechatName: '回退学员',
    studentId: 'stu-fallback',
    leadStage: '已成交',
    dealType: '课程',
    leadDate: '2026-08-20',
    createdAt: '2026-08-20 10:00:00',
    campus: 'shunyi_mapo'
  }],
    ft_students: [{
    id: 'stu-fallback',
    name: '回退学员',
    sourceLeadId: 'lead-fallback',
    campus: 'shunyi_mapo',
    primaryCoach: 'Mira',
    type: '成人',
    status: 'active',
    leadDate: '2026-08-20',
    studentStage: 'formal',
    packageBalanceRemaining: 1,
    packageBalanceTotal: 10,
    packageBalanceText: '1/10',
    packageBalancePercent: 10,
    lastFormalLessonAt: '2026-08-20',
    detailRecentLessonDate: '2026-08-20',
    hasTrialAttended: true,
    hasFormalAttended: true,
    isHistoricalStudentRoster: true,
    isActiveStudentRoster: true,
    detailLessonRecordRows: [{ time: '2026-08-19', courseType: '体验课', kind: 'schedule' }, { time: '2026-08-20', courseType: '私教课', kind: 'schedule' }],
    packageListRows: [{ courseType: '私教课', packageName: '10节私教课包', remainingLessons: 1, totalLessons: 10 }]
  }],
    ft_purchases: [{
    id: 'purchase-fallback',
    studentId: 'stu-fallback',
    studentName: '回退学员',
    courseType: '私教课',
    packageName: '10节私教课包',
    amountPaid: 6000,
    purchaseDate: '2026-08-20',
    status: 'active'
  }],
    ft_schedule: [{
    id: 'trial-fallback',
    studentId: 'stu-fallback',
    studentIds: ['stu-fallback'],
    studentName: '回退学员',
    courseType: '体验课',
    startTime: '2026-08-19 10:00:00',
    status: '已到课'
  }, {
    id: 'formal-fallback',
    studentId: 'stu-fallback',
    studentIds: ['stu-fallback'],
    studentName: '回退学员',
    courseType: '私教课',
    startTime: '2026-08-20 10:00:00',
    status: '已到课'
  }]
  };
  const fallbackHandler = makeHandler();
  Object.assign(fallbackHandler.tableRows, fallbackFactRows, { ft_student_teaching_summary: [] });
  const fallbackRes = {};
  await fallbackHandler.handler({
    path: '/page-data/customer-center-list',
    method: 'GET',
    user: { role: 'admin', name: '管理员' },
    res: fallbackRes,
    query: new URLSearchParams()
  });
  assert.strictEqual(fallbackRes.statusCode, 200, '摘要不可用但事实表可用时客户中心仍应返回 200');
  assert.strictEqual(fallbackRes.body.studentTeachingSummaryUnavailable, true, '摘要不可用但事实表可用时仍要标记降级状态');
  assert.deepStrictEqual(fallbackRes.body.teachingStudentViews.historicalStudents, [], '摘要不可用时不能回扫事实表拼历史学员');
  assert.deepStrictEqual(fallbackRes.body.teachingStudentViews.activeStudents, [], '摘要不可用时不能回扫事实表拼在期学员');
  assert.strictEqual(fallbackRes.body.standardLifecycleMetrics?.teachingSummary?.historicalStudentCount || 0, 0, '摘要不可用时顶部历史学员必须受控降级');
  assert.strictEqual(fallbackRes.body.standardLifecycleMetrics?.teachingSummary?.activeStudentCount || 0, 0, '摘要不可用时顶部在期学员必须受控降级');
  ['ft_schedule','ft_entitlement_ledger','ft_membership_benefit_ledger','ft_purchases','ft_entitlements','ft_students'].forEach(table => {
    assert.strictEqual(fallbackHandler.calls.tableScans[table] || 0, 0, `摘要不可用时客户中心不能回扫事实大表 ${table}`);
  });

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

  const inactiveNameSearchRes = {};
  await bulk.handler({
    path: '/page-data/customer-center-list',
    method: 'GET',
    user: { role: 'admin', name: '管理员' },
    res: inactiveNameSearchRes,
    query: new URLSearchParams('view=activeStudents&paged=1&page=1&pageSize=15&q=学员1197')
  });
  assert.strictEqual(inactiveNameSearchRes.body.listPage.total, 0, '在期学员后端搜索必须锁在在期集合内，不能搜出历史学员');
  assert.strictEqual(inactiveNameSearchRes.body.standardLifecycleMetrics.teachingSummary.activeStudentCount, 0, '在期学员搜索后的顶部统计不能大于在期搜索结果集合');

  const ownerSearchRes = {};
  await bulk.handler({
    path: '/page-data/customer-center-list',
    method: 'GET',
    user: { role: 'admin', name: '管理员' },
    res: ownerSearchRes,
    query: new URLSearchParams('view=activeStudents&paged=1&page=1&pageSize=15&q=Mira')
  });
  assert.strictEqual(ownerSearchRes.body.listPage.total, 0, '学员搜索 Mira 不能命中负责教练/归属人为 Mira 的学员');
  assert.strictEqual(ownerSearchRes.body.standardLifecycleMetrics.teachingSummary.activeStudentCount, 0, '负责人字段命中的 Mira 不能进入在期顶部统计');

  console.log('customer center summary fact calibration tests passed');
})().catch(err => {
  console.error(err);
  process.exit(1);
});
