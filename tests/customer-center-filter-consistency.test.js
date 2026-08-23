const assert = require('assert');
const fs = require('fs');
const path = require('path');

const repoRoot = path.join(__dirname, '..');

function read(rel) {
  return fs.readFileSync(path.join(repoRoot, rel), 'utf8');
}

function functionBody(source, name) {
  const start = source.indexOf(`function ${name}(`);
  assert.notStrictEqual(start, -1, `${name} should exist`);
  const nextFunction = source.indexOf('\nfunction ', start + 1);
  const nextAsyncFunction = source.indexOf('\nasync function ', start + 1);
  const candidates = [nextFunction, nextAsyncFunction].filter(index => index !== -1);
  const end = candidates.length ? Math.min(...candidates) : source.length;
  return source.slice(start, end);
}

function standardConfigBlock(key) {
  const marker = `key:'${key}'`;
  const start = standardShellSource.indexOf(marker);
  assert.notStrictEqual(start, -1, `${key} should have a standard list config`);
  const rest = standardShellSource.slice(start);
  const next = rest.search(/\n    \{key:|\n  \];/);
  return next === -1 ? rest : rest.slice(0, next);
}

function assertCustomerCenterTableEdgeWidths(label, key) {
  const block = standardConfigBlock(key);
  assert.match(block, /columns:\[\{[\s\S]*style:'[^']*width:130px/, `${label}第一列宽度必须是 130px`);
  assert.match(block, /label:'操作'[\s\S]*style:'width:90px[^']*text-align:right'/, `${label}最后一列宽度必须是 90px`);
}

const standardsSource = read('public/assets/scripts/core/platform-data-standards.js');
const leadsSource = read('public/assets/scripts/pages/leads.js');
const studentsSource = read('public/assets/scripts/pages/students.js');
const courtsSource = read('public/assets/scripts/pages/courts.js');
const matchesSource = read('public/assets/scripts/pages/matches.js');
const leadsRouteSource = read('server/leads-routes.js');
const standardShellSource = read('public/assets/scripts/standard/components.js');
const pagesCss = read('public/assets/styles/pages.css');
const packageJson = JSON.parse(read('package.json'));

[
  'currentLeadSummary',
  'currentStudentSummary',
  'currentCourtAccountSummary',
  'currentMembershipSummary',
  'currentMatchSummary'
].forEach(name => {
  assert.match(
    standardsSource,
    new RegExp(`function ${name}\\(`),
    `${name} must live in the shared platform data standards layer`
  );
});

assert.match(
  functionBody(leadsSource, 'leadStatsData'),
  /leadServerSummaryData\(\)[\s\S]*historicalStudents[\s\S]*activeStudents[\s\S]*trialAttended[\s\S]*trialAttendedToFormalPurchase/,
  '线索池顶部必须完全使用 /api/leads 的 summary，不能再读 customer-center-list'
);
assert.doesNotMatch(
  functionBody(leadsSource, 'leadStatsData'),
  /FlowTennisPlatformDataStandards\.currentLeadSummary|leadTeachingSummaryValue\(|leadStandardMetricValue\(/,
  '线索池顶部不得在页面内另算一套学员指标'
);
assert.ok(
  leadsRouteSource.includes('function leadSummaryCountableRow'),
  '线索池后端必须有独立的 summary 计数过滤，不能直接统计列表行'
);
assert.ok(
  leadsRouteSource.includes("id.startsWith('lead-from-student-')"),
  '线索池 summary 必须排除已物化的学生补行'
);
assert.ok(
  leadsRouteSource.includes('const summaryRows=filtered.filter(leadSummaryCountableRow);'),
  '线索池 summary 必须用剔除生命周期补行后的统计集'
);

assert.match(
  functionBody(studentsSource, 'studentPageStats'),
  /studentStandardSummaryForMode\(\)/,
  '历史学员/在期学员顶部必须读取后端统一排课事实汇总'
);
assert.doesNotMatch(
  functionBody(studentsSource, 'studentPageStats'),
  /FlowTennisPlatformDataStandards\.currentStudentSummary/,
  '历史学员/在期学员顶部不得由前端按当前列表自行汇总排课事实'
);

assert.match(
  functionBody(courtsSource, 'renderCourtAccountListView'),
  /const summary=courtAccountListViewData\?\.summary\|\|FlowTennisPlatformDataStandards\.currentCourtAccountSummary\(list\);[\s\S]*renderCourtStatsCards\(summary\);/,
  '订场用户顶部应优先使用后端按当前筛选返回的 summary，缺省时才用当前列表汇总'
);
assert.doesNotMatch(
  functionBody(courtsSource, 'renderCourtAccountListView'),
  /const summary=courtAccountListViewData\?\.summary\|\|\{\};/,
  '订场用户顶部不得继续直接使用未应用搜索和工具栏筛选的全局 summary'
);
assert.match(
  functionBody(courtsSource, 'exportCourtCSV'),
  /const d=getCurrentCourtAccountRows\(\);/,
  '订场用户导出必须使用当前筛选后的列表结果'
);

assert.match(
  functionBody(courtsSource, 'renderMemberships'),
  /const stats=courtAccountListViewData\?\.summary\?\.membershipFinanceSummary\|\|FlowTennisPlatformDataStandards\.currentMembershipSummary\(rows\);[\s\S]*renderMembershipStats\(stats\);/,
  '会员管理顶部应优先使用后端按当前筛选返回的会员 summary，缺省时才用当前会员列表汇总'
);
assert.doesNotMatch(
  functionBody(courtsSource, 'renderMembershipStats'),
  /courtAccountListViewData\?\.summary\?\.membershipFinanceSummary/,
  '会员管理顶部不得继续读取未应用搜索和会员类型筛选的全局会员汇总'
);

assert.match(
  standardShellSource,
  /key:'matches',statsId:'matchStatsRow'/,
  '约球活动应补齐顶部统计卡入口，和客户中心其他页面保持一致'
);
assert.match(
  functionBody(matchesSource, 'renderMatches'),
  /renderMatchStats\(FlowTennisPlatformDataStandards\.currentMatchSummary\(rows\)\)/,
  '约球活动顶部必须基于当前筛选后的约球列表汇总'
);

[
  ['线索池', 'leads'],
  ['历史学员', 'students'],
  ['在期学员', 'students'],
  ['订场用户', 'courts'],
  ['会员管理', 'memberships'],
  ['约球活动', 'matches']
].forEach(([label, key]) => assertCustomerCenterTableEdgeWidths(label, key));
assert.match(
  functionBody(matchesSource, 'renderMatches'),
  /<td class="tms-sticky-r tms-action-cell" style="width:90px;padding-right:20px;text-align:right">/,
  '约球活动表格行操作列宽度必须是 90px'
);
assert.match(
  pagesCss,
  /#page-courts \.tms-table\{width:1630px;min-width:1630px;table-layout:fixed\}/,
  '订场用户表格总宽度必须等于列宽合计，避免 1992px 强制撑大首尾列'
);

assert.ok(
  packageJson.scripts.test.includes('node tests/customer-center-filter-consistency.test.js'),
  'npm test must include customer-center-filter-consistency.test.js'
);

console.log('customer center filter consistency tests passed');
