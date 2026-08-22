const assert = require('assert');
const fs = require('fs');
const path = require('path');
const api = require('../api/index.js');
const { createLeadsRoutes } = require('../server/leads-routes.js');

const repoRoot = path.join(__dirname, '..');
const stateSource = fs.readFileSync(path.join(repoRoot, 'public/assets/scripts/core/state.js'), 'utf8');
const leadsSource = fs.readFileSync(path.join(repoRoot, 'public/assets/scripts/pages/leads.js'), 'utf8');
const routesSource = fs.readFileSync(path.join(repoRoot, 'server/leads-routes.js'), 'utf8');
const rules = api._test;

function fnBody(source, name) {
  const starts = [`function ${name}`, `async function ${name}`]
    .map(pattern => source.indexOf(pattern))
    .filter(index => index !== -1);
  assert.ok(starts.length, `${name} should exist`);
  const start = Math.min(...starts);
  const nextFunction = source.indexOf('\nfunction ', start + 1);
  const nextAsync = source.indexOf('\nasync function ', start + 1);
  const candidates = [nextFunction, nextAsync].filter(index => index !== -1);
  const next = candidates.length ? Math.min(...candidates) : source.length;
  return source.slice(start, next);
}

function clone(value) {
  return JSON.parse(JSON.stringify(value || []));
}

function makeRes() {
  return { statusCode: 200, body: null };
}

function createHarness(seedRows, extraDeps = {}) {
  const rows = { ...seedRows };
  const calls = { leadScans: 0, puts: 0, dels: 0, tableScans: {} };
  const scanRows = async table => {
    calls.tableScans[table] = (calls.tableScans[table] || 0) + 1;
    if (table === 'ft_leads') calls.leadScans += 1;
    return clone(rows[table]);
  };
  const handle = createLeadsRoutes({
    init: async () => {},
    sendJson: (res, payload, status = 200) => {
      res.statusCode = status;
      res.body = payload;
      return payload;
    },
    getCachedScan: scanRows,
    scan: async table => clone(rows[table]),
    get: async (table, id) => clone(rows[table]).find(row => String(row.id) === String(id)) || null,
    put: async (table, id, row) => {
      calls.puts += 1;
      const list = Array.isArray(rows[table]) ? rows[table] : [];
      const index = list.findIndex(item => String(item.id) === String(id));
      rows[table] = index === -1 ? [...list, row] : list.map(item => String(item.id) === String(id) ? row : item);
    },
    del: async (table, id) => {
      calls.dels += 1;
      rows[table] = (Array.isArray(rows[table]) ? rows[table] : []).filter(row => String(row.id) !== String(id));
    },
    ensureLeadTables: async () => {},
    isProductionRuntime: () => false,
    isCampusScopedAdmin: () => false,
    filterLoadAllForUser: payload => payload,
    cleanLeadText: value => String(value || '').trim(),
    mergeDuplicateLeadRows: rules.mergeDuplicateLeadRows,
    normalizeLeadRecord: rules.normalizeLeadRecord,
    normalizeLeadFollowupRecord: rules.normalizeLeadFollowupRecord,
    applyLeadFollowupSnapshot: rules.applyLeadFollowupSnapshot,
    applyLeadFollowupsSnapshot: rules.applyLeadFollowupsSnapshot,
    buildLeadInitialFollowup: rules.buildLeadInitialFollowup,
    buildLeadMergePlan: rules.buildLeadMergePlan,
    buildLeadStudentRecord: rules.buildLeadStudentRecord,
    buildLeadCourtRecord: rules.buildLeadCourtRecord,
    matchLeadToStudent: rules.matchLeadToStudent,
    matchLeadToCourt: rules.matchLeadToCourt,
    ...extraDeps,
    T_LEADS: 'ft_leads',
    T_LEAD_FOLLOWUPS: 'ft_lead_followups',
    T_STUDENTS: 'ft_students',
    T_COURTS: 'ft_courts',
    T_MEMBERSHIP_ACCOUNTS: 'ft_membership_accounts',
    T_PURCHASES: 'ft_purchases',
    T_ENTITLEMENTS: 'ft_entitlements',
    T_SCHEDULE: 'ft_schedule',
    T_MEMBERSHIP_ORDERS: 'ft_membership_orders',
    T_ENTITLEMENT_LEDGER: 'ft_entitlement_ledger',
    T_MEMBERSHIP_BENEFIT_LEDGER: 'ft_membership_benefit_ledger',
    T_MEMBERSHIP_ACCOUNT_EVENTS: 'ft_membership_account_events',
    T_FINANCIAL_LEDGER: 'ft_financial_ledger',
    T_PLANS: 'ft_plans',
    T_CLASSES: 'ft_classes',
    T_FEEDBACKS: 'ft_feedbacks',
    T_STUDENT_TEACHING_SUMMARY: 'ft_student_teaching_summary',
    T_COURT_ACCOUNT_LIST_INDEX: 'ft_court_account_list_index'
  });
  return { handle, calls, rows };
}

async function request(handle, queryText = '') {
  const res = makeRes();
  await handle({
    path: '/leads',
    method: 'GET',
    body: {},
    user: { role: 'admin', name: '管理员' },
    res,
    query: new URLSearchParams(queryText)
  });
  return res;
}

async function requestPath(handle, pathName, queryText = '') {
  const res = makeRes();
  await handle({
    path: pathName,
    method: 'GET',
    body: {},
    user: { role: 'admin', name: '管理员' },
    res,
    query: new URLSearchParams(queryText)
  });
  return res;
}

async function main() {
  const loaderBody = fnBody(stateSource, 'leadListPageDataUrl');
  const queryBody = fnBody(stateSource, 'leadListQueryParams');
  const requestKeyBody = fnBody(stateSource, 'datasetRequestKey');
  const setDatasetBody = fnBody(stateSource, 'setDatasetValue');
  const renderBody = fnBody(leadsSource, 'renderLeads');
  const statsBody = fnBody(leadsSource, 'leadStatsData');
  const detailBody = fnBody(stateSource, 'ensureLeadDetailForLead');
  const openDetailBody = fnBody(leadsSource, 'openLeadDetail');

  assert.match(loaderBody, /appendPageDataQuery\('\/leads',leadListQueryParams\(\)\)/, '线索池首屏应请求后端分页列表');
  assert.match(queryBody, /paged:1[\s\S]*page:leadPage[\s\S]*pageSize:leadPageSize/, '线索池请求应带 page/pageSize');
  assert.match(queryBody, /q:document\.getElementById\('leadSearch'\)\?\.value\|\|''[\s\S]*source:document\.getElementById\('leadSourceFilter'\)\?\.value\|\|''[\s\S]*customerType:document\.getElementById\('leadCustomerTypeFilter'\)\?\.value\|\|''[\s\S]*demandProduct:document\.getElementById\('leadConsultFilter'\)\?\.value\|\|''[\s\S]*leadStage:document\.getElementById\('leadStageFilter'\)\?\.value\|\|''[\s\S]*dealType:document\.getElementById\('leadDealTypeFilter'\)\?\.value\|\|''[\s\S]*owner:ownerValue[\s\S]*campus:/, '搜索和筛选参数应进入后端请求');
  assert.match(queryBody, /sortKey:leadSortKey[\s\S]*sortDir:leadSortDir/, '排序参数应进入后端请求，避免当前页内排序');
  assert.match(requestKeyBody, /if\(name==='leads'\)return 'leads:'\+leadListPageDataUrl\(\)/, '线索池缓存 key 应包含分页、筛选和排序参数');
  assert.match(fs.readFileSync(path.join(repoRoot, 'api/index.js'), 'utf8'), /const skipLocalStoredAuthUser=process\.env\.DISABLE_HOT_SCAN_PREWARM==='true'&&!isProductionRuntime\(\);[\s\S]*const storedAuthUser=skipLocalStoredAuthUser\?null:await getCachedRow\(T_USERS,user\.id\)\.catch\(\(\)=>null\)/, '本地预览不能被账号表冷读卡住首屏接口');
  assert.match(routesSource, /const LEAD_LIST_CACHE_TTL_MS=process\.env\.DISABLE_HOT_SCAN_PREWARM==='true'\?300000:30000/, '后端线索分页缓存线上应使用短 TTL，本地预览可延长避免冷读超时');
  assert.match(routesSource, /function isLocalPreviewFastMode\(\)[\s\S]*process\.env\.DISABLE_HOT_SCAN_PREWARM==='true'[\s\S]*!isProductionRuntime\(\)/, '本地预览快速模式只能在非生产环境启用');
  assert.match(routesSource, /isLocalPreviewFastMode\(\)&&typeof getCachedScan==='function'[\s\S]*getCachedScan\(T_LEADS,\{columns:LEAD_LIST_PROJECTION_FIELDS,pageLimit:100\}\)/, '本地预览线索主表应使用小页轻字段完整读取，避免大页冷读超时');
  assert.match(routesSource, /typeof scanFirstRows==='function'[\s\S]*readLeadSourceRows\(\{isProductionRuntime:\(\)=>true,scanFirstRows,getCachedScan,table:T_LEADS,columns:LEAD_LIST_PROJECTION_FIELDS\}\)/, '生产线索主表应优先走轻字段投影读取，避免首屏读取完整详情');
  assert.match(routesSource, /if\(isLocalPreviewFastMode\(\)\)return \[\]/, '本地预览线索列表不应被跟进记录冷读拖到超时');
  assert.doesNotMatch(routesSource, /readLeadOptionalRows\(T_STUDENTS|getCachedScan\(T_PURCHASES|getCachedScan\(T_ENTITLEMENTS|getCachedScan\(T_ENTITLEMENT_LEDGER|getCachedScan\(T_SCHEDULE/, '线索池首屏列表接口不能读取学员、课包、权益、流水、排课事实表');
  assert.match(routesSource, /function leadPagedResponseCacheKey\(query,user\)[\s\S]*leadListQueryCachePart\(query\)[\s\S]*leadListUserCachePart\(user\)/, '后端分页缓存 key 应包含完整查询条件和用户范围');
  assert.match(routesSource, /function leadFilteredResultCacheKey\(query,user\)[\s\S]*leadListQueryCachePart\(query,\{includePaging:false\}\)[\s\S]*leadListUserCachePart\(user\)/, '后端翻页应复用同一筛选排序统计结果，不能每页重新全量计算');
  assert.match(routesSource, /function clearLeadListCaches\(\)[\s\S]*leadSourceRowsCache\.rows=null[\s\S]*leadPagedResponseCache\.clear\(\)[\s\S]*leadFilteredResultCache\.clear\(\)/, '线索写操作后应能清理原始行缓存、分页响应缓存和筛选结果缓存');
  assert.match(routesSource, /if\(path==='\/leads'\)\{[\s\S]*if\(!\(method==='GET'&&isLocalPreviewFastMode\(\)\)\)await init\(\);[\s\S]*if\(method!=='GET'\)await ensureLeadTablesForRequest\(\);[\s\S]*if\(method==='GET'\)/, '本地预览线索池只读首屏不应等待初始化和建表检查，写操作仍保留安全检查');
  assert.match(routesSource, /const filtered=visibleRows\.filter\(row=>leadMatchesListFilter\(row,filterState\)\);[\s\S]*summary:buildLeadListSummary\(filtered\)[\s\S]*buildLeadListPage\(cachedResult\.sorted,paging\)/, '后端必须先完整筛选和列表统计，再分页截取当前页');
  assert.match(routesSource, /buildLeadListFilterState\(query\)[\s\S]*buildLeadListFilterMeta\(visibleRows,filterState\)/, '后端必须用筛选后的完整结果生成下拉计数，不能用当前页 15 条生成');
  assert.match(setDatasetBody, /if\(name==='leads'\)\{[\s\S]*leadListPageData=[\s\S]*summary:data\?\.summary\|\|null/, '线索池应保存后端分页元信息和统计');
  assert.match(setDatasetBody, /filters:data\?\.filters\|\|null/, '线索池应保存后端返回的筛选项计数');
  assert.match(statsBody, /const total=serverSummary\?\.total\?\?null[\s\S]*historicalStudents[\s\S]*activeStudents[\s\S]*trialAttended[\s\S]*trialAttendedToFormalPurchase/, '线索池顶部只能从 /api/leads 取筛选后 summary');
  assert.doesNotMatch(statsBody, /leadCustomerCenterSummaryData\(|leadTeachingSummaryValue\(/, '线索池顶部不能再读 customer center summary');
  assert.match(renderBody, /serverPage\?[\s\S]*total:serverPage\.total[\s\S]*slice:list[\s\S]*standardListSlice/, '线索池列表不应继续只靠本地全量分页');
  assert.match(detailBody, /apiCall\('GET',`\/leads\/\$\{encodeURIComponent\(id\)\}`\)/, '线索详情应按 leadId 回源读取单条完整数据');
  assert.match(openDetailBody, /refreshLeadDetailFromServer\(leadId\)/, '打开线索详情应触发单条详情后台回源');
  assert.doesNotMatch([loaderBody, queryBody, renderBody, statsBody, detailBody, routesSource].join('\n'), /\/load-all/, '线索池首屏和详情链路不应调用 /load-all');

  const mayLeads = Array.from({ length: 15 }, (_, index) => ({
    id: `may-${index + 1}`,
    displayName: `5月线索${index + 1}`,
    wechatName: `5月线索${index + 1}`,
    phone: `138000100${String(index).padStart(2, '0')}`,
    source: '大众点评',
    customerType: '成人',
    demandProduct: '私教课',
    leadStage: '跟进中',
    owner: 'Mira',
    campus: 'shunyi_mapo',
    leadDate: `2026-05-${String(index + 1).padStart(2, '0')}`,
    createdAt: `2026-05-${String(index + 1).padStart(2, '0')} 10:00:00`,
    privateDetailNote: index === 0 ? '5月详情' : ''
  }));
  const augustLeads = Array.from({ length: 5 }, (_, index) => ({
    id: `aug-${index + 1}`,
    displayName: `8月线索${index + 1}`,
    wechatName: `8月线索${index + 1}`,
    phone: `139000100${String(index).padStart(2, '0')}`,
    source: index % 2 ? '小红书' : '大众点评',
    customerType: '成人',
    demandProduct: '私教课',
    leadStage: '跟进中',
    owner: index % 2 ? '吴敌' : 'Mira',
    campus: 'shunyi_mapo',
    leadDate: `2026-08-${String(index + 1).padStart(2, '0')}`,
    createdAt: `2026-08-${String(index + 1).padStart(2, '0')} 10:00:00`,
    studentId: index === 0 || index === 2 ? `stu-aug-${index + 1}` : '',
    isActiveStudentRoster: index === 0,
    hasTrialAttended: index === 0,
    trialAttendedAt: index === 1 ? '2026-08-02' : '',
    hasTrialToCourseConversion: index === 0,
    privateDetailNote: index === 4 ? '8月完整详情字段' : ''
  }));
  const { handle, calls } = createHarness({
    ft_leads: [...mayLeads, ...augustLeads],
    ft_lead_followups: [],
    ft_students: [],
    ft_courts: [],
    ft_membership_accounts: [],
    ft_purchases: [],
    ft_entitlements: [],
    ft_schedule: [],
    ft_membership_orders: [],
    ft_entitlement_ledger: [],
    ft_membership_benefit_ledger: [],
    ft_membership_account_events: [],
    ft_financial_ledger: [],
    ft_plans: [],
    ft_classes: [],
    ft_feedbacks: []
  });

  const firstPage = await request(handle, 'paged=1&page=1&pageSize=5');
  const secondPage = await request(handle, 'paged=1&page=2&pageSize=5');
  assert.strictEqual(firstPage.statusCode, 200, '第一页应加载成功');
  assert.strictEqual(firstPage.body.total, 20, '分页 total 应返回筛选后的全量总数，不是当前页 5 条');
  assert.strictEqual(firstPage.body.summary.total, 20, '顶部统计总数不能被当前页数量污染');
  assert.strictEqual(firstPage.body.summary.historicalStudents, 3, '顶部历史学员应返回当前筛选后的轻量统计');
  assert.strictEqual(firstPage.body.summary.historicalStudentRate, '15%', '顶部历史学员比例应返回可展示值');
  assert.strictEqual(firstPage.body.summary.activeStudents, 1, '顶部在期学员应返回当前筛选后的轻量统计');
  assert.strictEqual(firstPage.body.summary.activeStudentRate, '33.3%', '顶部在期学员比例应返回可展示值');
  assert.strictEqual(firstPage.body.summary.trialAttended, 2, '顶部体验课人数应返回当前筛选后的轻量统计');
  assert.strictEqual(firstPage.body.summary.trialAttendedRate, '10%', '顶部体验课比例应返回可展示值');
  assert.strictEqual(firstPage.body.summary.trialAttendedToFormalPurchase, 1, '顶部体验后买正式课应返回当前筛选后的轻量统计');
  assert.strictEqual(firstPage.body.summary.trialAttendedToFormalPurchaseRate, '50%', '顶部体验后买正式课比例应返回可展示值');
  assert.strictEqual(firstPage.body.filters.source.counts['大众点评'], 18, '来源筛选数量必须按完整筛选结果计算，不能只按当前页 5 条');
  assert.strictEqual(firstPage.body.filters.source.counts['网球兄弟小红书'], 2, '来源筛选数量必须包含当前页之外的匹配线索');
  assert.deepStrictEqual(firstPage.body.rows.map(row => row.id), ['aug-5', 'aug-4', 'aug-3', 'aug-2', 'aug-1'], '后端必须先按最新线索时间倒序，再分页');
  assert.ok(firstPage.body.rows.every(row => String(row.leadDate).startsWith('2026-08')), '首屏不能回到 5 月旧线索');
  const firstIds = new Set(firstPage.body.rows.map(row => row.id));
  const secondIds = new Set(secondPage.body.rows.map(row => row.id));
  assert.strictEqual([...firstIds].filter(id => secondIds.has(id)).length, 0, '翻页不应重复数据');

  const filtered = await request(handle, 'paged=1&page=1&pageSize=10&owner=吴敌&campus=shunyi_mapo&dateFrom=2026-08-01&dateTo=2026-08-31');
  assert.ok(filtered.body.rows.length > 0, '筛选应能返回匹配线索');
  assert.ok(filtered.body.rows.every(row => row.owner === '吴敌' && String(row.leadDate).startsWith('2026-08')), '后端分页应先应用筛选再分页');
  assert.strictEqual(filtered.body.summary.total, filtered.body.total, '顶部统计总数应与筛选后总量一致');
  assert.strictEqual(filtered.body.filters.source.counts['网球兄弟小红书'], 2, '筛选计数应按当前 8 月范围和其他筛选条件计算');
  assert.strictEqual(calls.leadScans, 1, '不同筛选条件应复用短时原始行缓存，避免每次筛选重新扫表');

  const ownerSearch = await request(handle, 'paged=1&page=1&pageSize=10&q=mira');
  assert.strictEqual(ownerSearch.body.total, 0, '搜索 mira 不应命中跟进人 Mira，跟进人必须走单独筛选项');

  const filteredAgain = await request(handle, 'paged=1&page=1&pageSize=10&owner=吴敌&campus=shunyi_mapo&dateFrom=2026-08-01&dateTo=2026-08-31');
  assert.deepStrictEqual(filteredAgain.body.rows.map(row => row.id), filtered.body.rows.map(row => row.id), '相同查询条件应命中分页响应缓存');
  assert.strictEqual(calls.leadScans, 1, '相同查询条件命中分页响应缓存后不应重新扫表');

  const otherCampus = await request(handle, 'paged=1&page=1&pageSize=10&campus=other_campus');
  assert.strictEqual(otherCampus.body.total, 0, '不同校区缓存不能串用已有结果');
  assert.strictEqual(otherCampus.body.summary.total, 0, '不同校区顶部统计不能串用已有结果');

  const deleteRes = makeRes();
  await handle({
    path: '/leads/aug-5',
    method: 'DELETE',
    body: {},
    user: { role: 'admin', name: '管理员' },
    res: deleteRes,
    query: new URLSearchParams()
  });
  assert.strictEqual(deleteRes.statusCode, 200, '线索删除应成功');
  const afterDelete = await request(handle, 'paged=1&page=1&pageSize=5');
  assert.ok(!afterDelete.body.rows.some(row => row.id === 'aug-5'), '写操作后分页缓存必须失效，不能继续返回已删除线索');
  assert.ok(calls.leadScans >= 2, '写操作清缓存后下一次列表请求应重新读取线索行');

  const detail = await requestPath(handle, '/leads/aug-5');
  assert.strictEqual(detail.statusCode, 404, '删除后详情接口不应从分页缓存里返回旧线索');

  const detail2 = await requestPath(handle, '/leads/aug-4');
  assert.strictEqual(detail2.statusCode, 200, '详情接口应能按 id 返回单条线索');
  assert.strictEqual(detail2.body.id, 'aug-4', '详情接口不应返回分页列表');

  const previousPreviewFlag = process.env.DISABLE_HOT_SCAN_PREWARM;
  process.env.DISABLE_HOT_SCAN_PREWARM = 'true';
  try {
    const localHarness = createHarness({
      ft_leads: [{
        id: 'local-new',
        displayName: '本地预览线索',
        leadDate: '2026-08-11',
        createdAt: '2026-08-11 10:00:00',
        campus: 'shunyi_mapo'
      }],
      ft_lead_followups: [{ id: 'fu-local', leadId: 'local-new', followupAt: '2026-08-11' }],
      ft_students: [{ id: 'stu-local', sourceLeadId: 'local-new' }],
      ft_courts: [{ id: 'court-local', sourceLeadId: 'local-new' }],
      ft_membership_accounts: [{ id: 'member-local', sourceLeadId: 'local-new' }],
      ft_purchases: [{ id: 'purchase-local', studentId: 'stu-local' }],
      ft_entitlements: [{ id: 'entitlement-local', studentId: 'stu-local' }],
      ft_schedule: [{ id: 'schedule-local', studentId: 'stu-local' }],
      ft_membership_orders: [],
      ft_entitlement_ledger: [],
      ft_membership_benefit_ledger: [],
      ft_membership_account_events: [],
      ft_financial_ledger: [],
      ft_plans: [],
      ft_classes: [],
      ft_feedbacks: []
    });
    const localPage = await request(localHarness.handle, 'paged=1&page=1&pageSize=15');
    assert.strictEqual(localPage.statusCode, 200, '本地预览快速模式下线索列表也必须返回成功');
    assert.strictEqual(localPage.body.total, 1, '本地预览快速模式不能因为跳过附加表而丢失线索主表数据');
    assert.deepStrictEqual(localHarness.calls.tableScans, { ft_leads: 1 }, '本地预览快速模式只读线索主表，不触发事实表冷读');
  } finally {
    if (previousPreviewFlag === undefined) delete process.env.DISABLE_HOT_SCAN_PREWARM;
    else process.env.DISABLE_HOT_SCAN_PREWARM = previousPreviewFlag;
  }

  const lightHarness = createHarness({
    ft_leads: [{
      id: 'lead-light-active',
      displayName: '轻链路活跃',
      wechatName: '轻链路活跃',
      studentId: 'stu-light-active',
      leadDate: '2026-08-20',
      createdAt: '2026-08-20 10:00:00',
      campus: 'shunyi_mapo'
    }],
    ft_lead_followups: [],
    ft_students: [],
    ft_courts: [],
    ft_membership_accounts: [],
    ft_purchases: [],
    ft_entitlements: [],
    ft_schedule: [],
    ft_membership_orders: [],
    ft_entitlement_ledger: [],
    ft_membership_benefit_ledger: [],
    ft_membership_account_events: [],
    ft_financial_ledger: [],
    ft_plans: [],
    ft_classes: [],
    ft_feedbacks: [],
    ft_student_teaching_summary: [{
      id: 'stu-light-active',
      studentId: 'stu-light-active',
      name: '轻链路活跃',
      displayName: '轻链路活跃',
      sourceLeadId: 'lead-light-active',
      hasTrialAttended: false,
      hasFormalAttended: true,
      isHistoricalStudentRoster: false,
      isActiveStudentRoster: false,
      lastFormalLessonAt: '2026-08-20',
      detailRecentLessonDate: '2026-08-20',
      packageBalanceRemaining: 1,
      packageBalanceTotal: 10,
      packageBalanceText: '1/10',
      packageBalancePercent: 10,
      activityStatusLabel: '近30天活跃',
      studentStatusLabel: '课包活跃中',
      packageStatusLabel: '课包有余额',
      paymentModeLabel: '课包学员',
      lessonVolumeLabel: '-',
      detailLessonRecordRows: [{ time: '2026-08-20' }],
      packageListRows: [{ remainingLessons: 1, totalLessons: 10 }]
    }],
    ft_court_account_list_index: []
  }, {
    buildCourtAccountListViewFromIndexRows: rows => ({ items: Array.isArray(rows) ? rows : [] })
  });
  const lightPage = await request(lightHarness.handle, 'paged=1&page=1&pageSize=15');
  assert.strictEqual(lightPage.statusCode, 200, '轻链路摘要页应正常返回');
  assert.strictEqual(lightPage.body.summary.activeStudents, 1, '轻链路在期学员不能再掉成 0');
  assert.strictEqual(lightPage.body.summary.historicalStudents, 1, '轻链路历史学员应继续按摘要行保持一致');

  console.log('leads safe server pagination tests passed');
}

main().catch(err => {
  console.error(err && err.stack ? err.stack : String(err));
  process.exit(1);
});
