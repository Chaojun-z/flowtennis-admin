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

function makeRes() {
  return { statusCode: 200, body: null };
}

function clone(value) {
  return JSON.parse(JSON.stringify(value || []));
}

function createHarness(seedRows) {
  const rows = { ...seedRows };
  const handle = createLeadsRoutes({
    init: async () => {},
    sendJson: (res, payload, status = 200) => {
      res.statusCode = status;
      res.body = payload;
      return payload;
    },
    getCachedScan: async table => clone(rows[table]),
    scan: async table => clone(rows[table]),
    get: async (table, id) => clone(rows[table]).find(row => String(row.id) === String(id)) || null,
    put: async () => {},
    del: async () => {},
    ensureLeadTables: async () => {},
    isProductionRuntime: () => false,
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
    T_FEEDBACKS: 'ft_feedbacks'
  });
  return { handle };
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

async function requestPath(handle, path, queryText = '') {
  const res = makeRes();
  await handle({
    path,
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
  const ensureDetailBody = fnBody(stateSource, 'ensureLeadDetailForLead');
  const renderBody = fnBody(leadsSource, 'renderLeads');
  const openDetailBody = fnBody(leadsSource, 'openLeadDetail');
  const refreshDetailBody = fnBody(leadsSource, 'refreshLeadDetailFromServer');
  const detailBody = fnBody(stateSource, 'ensureLeadFollowupsForLead');

  assert.match(loaderBody, /appendPageDataQuery\('\/leads',leadListQueryParams\(\)\)/, '线索池首屏应请求后端分页列表');
  assert.match(queryBody, /paged:1[\s\S]*page:leadPage[\s\S]*pageSize:leadPageSize/, '线索池请求应带 page/pageSize');
  assert.match(queryBody, /q:document\.getElementById\('leadSearch'\)\?\.value\|\|''[\s\S]*source:document\.getElementById\('leadSourceFilter'\)\?\.value\|\|''[\s\S]*customerType:document\.getElementById\('leadCustomerTypeFilter'\)\?\.value\|\|''[\s\S]*demandProduct:document\.getElementById\('leadConsultFilter'\)\?\.value\|\|''[\s\S]*leadStage:document\.getElementById\('leadStageFilter'\)\?\.value\|\|''[\s\S]*dealType:document\.getElementById\('leadDealTypeFilter'\)\?\.value\|\|''[\s\S]*owner:ownerValue[\s\S]*campus:/, '搜索和筛选参数应进入后端请求');
  assert.match(requestKeyBody, /if\(name==='leads'\)return 'leads:'\+leadListPageDataUrl\(\)/, '线索池缓存 key 应包含分页和筛选参数');
  assert.match(setDatasetBody, /if\(name==='leads'\)\{[\s\S]*leadListPageData=/, '线索池应保存后端分页元信息');
  assert.match(ensureDetailBody, /apiCall\('GET',`\/leads\/\$\{encodeURIComponent\(id\)\}`\)/, '线索详情应按 leadId 回源读取单条完整数据');
  assert.match(ensureDetailBody, /mergeLeadDetailRow\(lead\)/, '线索详情回源结果应合并进当前本地线索');
  assert.match(openDetailBody, /refreshLeadDetailFromServer\(leadId\)/, '打开线索详情应触发单条详情后台回源');
  assert.match(refreshDetailBody, /leadDetailReady\(leadId\)[\s\S]*ensureLeadDetailForLead\(leadId\)/, '已加载的线索详情不应重复请求');
  assert.match(renderBody, /serverPage\?[\s\S]*total:serverPage\.total[\s\S]*slice:list[\s\S]*standardListSlice/, '线索池列表不应继续只靠本地全量分页');
  assert.match(detailBody, /\/leads\/\$\{encodeURIComponent\(id\)\}\/followups/, '线索详情跟进记录应继续按 leadId 按需完整加载');

  const guardedSources = [loaderBody, queryBody, renderBody, detailBody, routesSource].join('\n');
  assert.doesNotMatch(guardedSources, /\/load-all/, '线索池首屏和详情链路不应调用 /load-all');

  const seedLeads = Array.from({ length: 25 }, (_, index) => {
    const n = index + 1;
    return {
      id: `lead-${String(n).padStart(2, '0')}`,
      displayName: `线索${n}`,
      phone: `138000000${String(n).padStart(2, '0')}`,
      source: n % 2 ? '小红书' : '大众点评',
      customerType: n % 3 ? '成人' : '青少儿',
      demandProduct: n % 2 ? '私教课' : '订场',
      leadStage: n % 5 ? '跟进中' : '已成交',
      dealType: n % 5 ? '' : '课程',
      owner: n % 2 ? 'Mira' : '吴敌',
      campus: n % 2 ? 'shunyi_mapo' : 'chaoyang',
      privateDetailNote: n === 3 ? '列表之外的完整详情字段' : '',
      leadDate: `2026-07-${String(n).padStart(2, '0')}`,
      createdAt: `2026-07-${String(n).padStart(2, '0')}`
    };
  });
  const { handle } = createHarness({
    ft_leads: seedLeads,
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

  const firstPage = await request(handle, 'paged=1&page=1&pageSize=10');
  const secondPage = await request(handle, 'paged=1&page=2&pageSize=10');
  assert.strictEqual(firstPage.body.rows.length, 10, '第一页应只返回 pageSize 条');
  assert.strictEqual(secondPage.body.rows.length, 10, '第二页应只返回 pageSize 条');
  assert.strictEqual(firstPage.body.total, 25, '分页 total 应返回筛选后的总数');
  const firstIds = new Set(firstPage.body.rows.map(row => row.id));
  const secondIds = new Set(secondPage.body.rows.map(row => row.id));
  assert.strictEqual([...firstIds].filter(id => secondIds.has(id)).length, 0, '翻页不应重复数据');

  const filtered = await request(handle, 'paged=1&page=1&pageSize=20&source=网球兄弟小红书&customerType=成人&demandProduct=私教课&owner=Mira&campus=shunyi_mapo');
  assert.ok(filtered.body.rows.length > 0, '组合筛选应能返回匹配线索');
  assert.ok(filtered.body.rows.every(row => row.source === '网球兄弟小红书' && row.customerType === '成人' && row.demandProduct === '私教课' && row.owner === 'Mira' && row.campus === 'shunyi_mapo'), '后端分页应按搜索筛选参数过滤');

  const dealFiltered = await request(handle, 'paged=1&page=1&pageSize=20&leadStage=已成交&dealType=课程');
  assert.ok(dealFiltered.body.rows.length > 0, '阶段和成交类型筛选应能返回匹配线索');
  assert.ok(dealFiltered.body.rows.every(row => row.leadStage === '已成交' && row.dealType === '课程'), '后端应支持阶段和成交类型筛选');

  const detail = await requestPath(handle, '/leads/lead-03');
  assert.strictEqual(detail.statusCode, 200, '详情接口应能按 id 返回单条线索');
  assert.strictEqual(detail.body.id, 'lead-03', '详情接口不应返回分页列表');
  assert.strictEqual(detail.body.privateDetailNote, '列表之外的完整详情字段', '详情接口应从后端单条记录回源拿完整字段');

  console.log('leads server pagination tests passed');
}

main().catch(err => {
  console.error(err && err.stack ? err.stack : String(err));
  process.exit(1);
});
