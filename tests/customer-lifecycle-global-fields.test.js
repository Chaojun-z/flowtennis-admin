const assert = require('assert');
const fs = require('fs');
const path = require('path');

const root = path.join(__dirname, '..');
const read = file => fs.readFileSync(path.join(root, file), 'utf8');

const stateSource = read('public/assets/scripts/core/state.js');
const studentsSource = read('public/assets/scripts/pages/students.js');
const courtsSource = read('public/assets/scripts/pages/courts.js');
const purchasesSource = read('public/assets/scripts/pages/purchases.js');
const scheduleSource = read('public/assets/scripts/pages/schedule.js');
const financeSource = read('public/assets/scripts/pages/coachops.js');
const corePageSource = read('server/page-data/core-pages.js');
const financePageSource = read('server/page-data/finance-page.js');
const residualPageSource = read('server/page-data/residual-pages.js');
const leadsRouteSource = read('server/leads-routes.js');
const platformMetricsSource = read('server/read-models/platform-metrics.js');
const apiSource = read('api/index.js');
const agentsSource = read('AGENTS.md');
const businessTaxonomy = require('../public/assets/scripts/core/business-taxonomy.js');
const vm = require('vm');

assert.match(agentsSource, /一个事实源 \+ 一个生命周期口径 \+ 多个页面只做展示/, 'AGENTS should tell new threads to use one fact source and one lifecycle standard');
assert.match(agentsSource, /同一个业务含义只能有：[\s\S]*一个标准字段定义[\s\S]*一个计算规则[\s\S]*一个展示口径[\s\S]*一个权威数据来源/, 'AGENTS should define the platform-wide single field standard');
assert.match(agentsSource, /新增核心字段(?:或指标)?前，必须先补(?:数据口径总表、)?标准字段定义、统一读模型、页面访问器和回归测试/, 'AGENTS should forbid temporary page-level core fields');

[
  'customerLifecycleRowsForRecord',
  'customerLifecycleByStudentId',
  'customerLifecycleByCourtId',
  'customerLifecycleByMembershipAccountId',
  'customerLifecycleForRecord',
  'customerLifecycleSource',
  'customerLifecycleCampus',
  'customerLifecycleOwner',
  'customerLifecycleStudentStage',
  'customerLifecycleStudentDealPath',
  'customerLifecycleStudentTrialStatus',
  'customerLifecycleStudentCoursePurchaseCount',
  'customerLifecycleStudentHasCourseRepeat',
  'customerLifecycleStudentHasTrialToCourseConversion',
  'customerLifecycleCourtStage',
  'customerLifecycleMembershipStatus'
].forEach(name => {
  assert.match(stateSource, new RegExp(`function ${name}\\(`), `${name} should be the single frontend lifecycle field accessor`);
});

assert.match(financePageSource, /require\('\.\.\/read-models\/customer-lifecycle\.js'\)/, 'finance page-data should import the unified customer lifecycle read model');
assert.match(financePageSource, /const customerLifecycleRows=buildCustomerLifecycleRows\(\{[\s\S]*students:scoped\.students[\s\S]*purchases:scoped\.purchases[\s\S]*entitlements:scoped\.entitlements[\s\S]*schedule:scoped\.schedule[\s\S]*courts:scoped\.courts[\s\S]*membershipOrders:scoped\.membershipOrders[\s\S]*membershipAccounts:scoped\.membershipAccounts[\s\S]*\}\);/, 'finance page-data should build lifecycle rows from the same scoped source rows as finance');
assert.match(financePageSource, /customerLifecycleRows/, 'finance page-data should return lifecycle rows with the finance payload');
assert.match(residualPageSource, /T_LEADS[\s\S]*handleFinancePageData/, 'residual finance route should pass the lead table to finance page-data for the lifecycle source chain');

assert.match(corePageSource, /if\(path==='\/page-data\/workbench'&&method==='GET'\)[\s\S]*const customerLifecycleRows=buildCustomerLifecycleRows\(\{[\s\S]*students:scoped\.students[\s\S]*purchases:scoped\.purchases[\s\S]*entitlements:scoped\.entitlements[\s\S]*schedule:scoped\.schedule[\s\S]*\}\);[\s\S]*customerLifecycleRows/, 'workbench page-data should include unified lifecycle rows');

assert.match(apiSource, /require\('\.\.\/server\/read-models\/customer-lifecycle\.js'\)/, 'load-all should import the unified lifecycle read model');
assert.match(apiSource, /const customerLifecycleRows=buildCustomerLifecycleRows\(loaded\);[\s\S]*return sendJson\(res,\{\.\.\.loaded,user,customerLifecycleRows\}\);/, '/load-all should return lifecycle rows built from the same scoped loaded payload');
assert.match(platformMetricsSource, /function buildPlatformMetrics\(data = \{\}\)/, 'platform metrics should own the shared customer/source/stage conversion read model');
assert.match(platformMetricsSource, /function buildLeadPoolRows/, 'platform metrics should expose lifecycle search rows without making them operations conversion totals');
assert.match(platformMetricsSource, /lifecycleScope = 'all'/, 'lead pool rows should support scoped lifecycle expansion');
assert.match(leadsRouteSource, /buildCustomerLifecycleRows/, 'lead pool route should build lifecycle rows before returning list data');
assert.match(leadsRouteSource, /readLeadPoolRows\(\{lifecycleScope:expandLifecycleSearch\?'all':'course'\}\)/, 'lead pool route should include course lifecycle rows by default and expand all lifecycle identities only for search');
assert.match(apiSource, /T_PURCHASES,T_ENTITLEMENTS,T_SCHEDULE,T_MEMBERSHIP_ORDERS/, 'lead pool route should receive course and membership fact tables for lifecycle stages');

assert.match(stateSource, /if\(name==='financePage'\)\{[\s\S]*setDatasetValue\('customerLifecycleRows',data\.customerLifecycleRows\|\|\[\],\{persist:false\}\);/, 'finance aggregate loader should hydrate lifecycle rows');
assert.match(stateSource, /if\(name==='workbenchPage'\)\{[\s\S]*setDatasetValue\('customerLifecycleRows',data\.customerLifecycleRows\|\|\[\],\{persist:false\}\);/, 'workbench aggregate loader should hydrate lifecycle rows');
assert.match(stateSource, /'package-students':\['campuses','coaches','customerCenterPage'\]/, 'package student pages should load the lightweight customer center read model before first render without full students');
assert.match(stateSource, /'trial-students':\['campuses','coaches','customerCenterPage'\]/, 'trial student pages should load the lightweight customer center read model before first render without full students');
assert.doesNotMatch(stateSource, /'package-students':\[[^\]]*'financePage'[^\]]*\]/, 'package student pages should not load finance read model on first-screen/background list load');
assert.doesNotMatch(stateSource, /'trial-students':\[[^\]]*'financePage'[^\]]*\]/, 'trial student pages should not load finance read model on first-screen/background list load');

assert.match(studentsSource, /customerLifecycleByStudentId/, 'student pages should read studentStage/source from the shared lifecycle accessor');
assert.match(studentsSource, /studentDealPathText[\s\S]*customerLifecycleStudentDealPath\(stu\)/, 'student deal path should prefer the unified lifecycle accessor');
assert.match(studentsSource, /studentTrialPathStatusText[\s\S]*customerLifecycleStudentTrialStatus\(stu\)/, 'student trial status should prefer the unified lifecycle accessor');
assert.match(studentsSource, /studentStandardSummaryForMode\(\)/, 'student top conversion stats should start from unified lifecycle facts');
assert.match(studentsSource, /historicalTrialAttendedCount:Number\(summary\.historicalTrialAttendedCount\)/, 'historical student trial-attended card should read the backend teaching summary');
assert.match(studentsSource, /activeFormalLesson90Count:Number\(summary\.activeFormalLesson90Count\)/, 'active student 90-day formal activity card should read the backend teaching summary');
assert.match(courtsSource, /customerLifecycleByCourtId|customerLifecycleByMembershipAccountId/, 'court and membership pages should read courtStage/membershipStatus from the shared lifecycle accessor');
assert.match(purchasesSource, /customerLifecycleCampus/, 'purchase pages should resolve customer campus through the shared lifecycle accessor');
assert.match(scheduleSource, /customerLifecycleCampus[\s\S]*customerLifecycleOwner/, 'schedule pages should resolve student campus and owner through the shared lifecycle accessor');
assert.match(financeSource, /customerLifecycleCampus/, 'finance legacy fallback should resolve customer campus through the shared lifecycle accessor without changing finance math');

[
  'public/assets/scripts/pages/packages.js',
  'public/assets/scripts/pages/products.js',
  'public/assets/scripts/pages/prices.js',
  'public/assets/scripts/pages/campusmgr.js',
  'public/assets/scripts/pages/admin-users.js'
].forEach(file => {
  const source = read(file);
  assert.doesNotMatch(source, /studentStage|courtStage|membershipStatus|sourceLeadId|fromLeadId/, `${file} should not define customer lifecycle meaning locally`);
});

const financeFieldDefinitions = businessTaxonomy.FINANCE_FIELD_DEFINITIONS || {};
[
  'totalIncome',
  'recognizedRevenue',
  'pendingRevenue',
  'storedValueIncome',
  'bookingIncome',
  'packageIncome',
  'cashDelta',
  'recognizedRevenueDelta'
].forEach(field => {
  assert.ok(financeFieldDefinitions[field], `${field} should have one standard finance field definition`);
  assert.strictEqual(typeof financeFieldDefinitions[field].label, 'string', `${field} should expose a stable label`);
  assert.strictEqual(typeof financeFieldDefinitions[field].rule, 'string', `${field} should expose a stable calculation rule`);
});

const localStorageMock = {
  store: {},
  get length() { return Object.keys(this.store).length; },
  getItem(key) { return Object.prototype.hasOwnProperty.call(this.store, key) ? this.store[key] : null; },
  setItem(key, value) { this.store[key] = String(value); },
  removeItem(key) { delete this.store[key]; },
  key(index) { return Object.keys(this.store)[index] || null; }
};
const lifecycleContext = {
  console,
  URLSearchParams,
  localStorage: localStorageMock,
  window: {
    innerWidth: 1280,
    location: { hostname: 'localhost', search: '' },
    coachWorkbenchStats: null,
    addEventListener() {}
  },
  document: {
    hidden: false,
    body: { classList: { toggle() {} } },
    addEventListener() {},
    hasFocus() { return true; },
    getElementById() { return null; }
  },
  setInterval() {},
  FlowTennisBusinessTaxonomy: { normalizeLeadSource(value) { return String(value || '').trim(); } }
};
vm.runInNewContext(`${stateSource}
customerLifecycleRows=[
  {courtId:'same-id',source:'订场来源',campus:'订场校区',owner:'订场负责人',courtStage:'member',membershipStatus:'active'},
  {studentId:'stu-1',source:'学员来源',campus:'学员校区',owner:'学员负责人',studentStage:'formal',courseDealPath:'老客续费',trialStatus:'已成交',coursePurchaseCount:2,hasCourseRepeatPurchase:true,hasTrialToCourseConversion:true}
];
globalThis.__customerLifecycleProbe={
  purchaseCampus:customerLifecycleCampus({id:'same-id',studentId:'stu-1',packageId:'pkg-1'},'兜底校区'),
  purchaseSource:customerLifecycleSource({id:'same-id',studentId:'stu-1',packageId:'pkg-1'},'兜底来源'),
  studentStage:customerLifecycleStudentStage({id:'stu-1',name:'王同学',primaryCoach:'学员负责人'}),
  studentDealPath:customerLifecycleStudentDealPath({id:'stu-1',name:'王同学'}),
  studentTrialStatus:customerLifecycleStudentTrialStatus({id:'stu-1',name:'王同学'}),
  coursePurchaseCount:customerLifecycleStudentCoursePurchaseCount({id:'stu-1',name:'王同学'}),
  hasCourseRepeat:customerLifecycleStudentHasCourseRepeat({id:'stu-1',name:'王同学'}),
  hasTrialToCourseConversion:customerLifecycleStudentHasTrialToCourseConversion({id:'stu-1',name:'王同学'}),
  courtStage:customerLifecycleCourtStage({id:'same-id',name:'订场客户',history:[]})
};`, lifecycleContext);
assert.strictEqual(lifecycleContext.__customerLifecycleProbe.purchaseCampus, '学员校区', 'purchase lookup should prefer explicit studentId over a colliding purchase id');
assert.strictEqual(lifecycleContext.__customerLifecycleProbe.purchaseSource, '学员来源', 'purchase source should not be taken from a colliding court row');
assert.strictEqual(lifecycleContext.__customerLifecycleProbe.studentStage, 'formal', 'student own id should still resolve student lifecycle stage');
assert.strictEqual(lifecycleContext.__customerLifecycleProbe.studentDealPath, '老客续费', 'student deal path should come from lifecycle repeat/course facts');
assert.strictEqual(lifecycleContext.__customerLifecycleProbe.studentTrialStatus, '已成交', 'student trial status should come from lifecycle trial/course facts');
assert.strictEqual(lifecycleContext.__customerLifecycleProbe.coursePurchaseCount, 2, 'student purchase count should come from lifecycle facts');
assert.strictEqual(lifecycleContext.__customerLifecycleProbe.hasCourseRepeat, true, 'student repeat flag should come from lifecycle facts');
assert.strictEqual(lifecycleContext.__customerLifecycleProbe.hasTrialToCourseConversion, true, 'student trial conversion flag should come from lifecycle facts');
assert.strictEqual(lifecycleContext.__customerLifecycleProbe.courtStage, 'member', 'court own id should still resolve court lifecycle stage');

console.log('customer lifecycle global field tests passed');
