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

const standardsSource = read('public/assets/scripts/core/platform-data-standards.js');
const leadsSource = read('public/assets/scripts/pages/leads.js');
const studentsSource = read('public/assets/scripts/pages/students.js');
const courtsSource = read('public/assets/scripts/pages/courts.js');
const matchesSource = read('public/assets/scripts/pages/matches.js');
const standardShellSource = read('public/assets/scripts/standard/components.js');
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
  /FlowTennisPlatformDataStandards\.currentLeadSummary\(list,\s*leadStandardMetrics\(\)\)/,
  '线索池顶部必须基于当前筛选后的列表和统一生命周期视图汇总'
);
assert.doesNotMatch(
  functionBody(leadsSource, 'leadStatsData'),
  /leadTeachingSummaryValue\(/,
  '线索池顶部不得继续读取全局 teachingSummary 作为当前筛选结果'
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
  /const summary=FlowTennisPlatformDataStandards\.currentCourtAccountSummary\(list\);[\s\S]*renderCourtStatsCards\(summary\);/,
  '订场用户顶部必须基于当前筛选后的订场用户列表汇总'
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
  /const stats=FlowTennisPlatformDataStandards\.currentMembershipSummary\(rows\);[\s\S]*renderMembershipStats\(stats\);/,
  '会员管理顶部必须基于当前筛选后的会员列表汇总'
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

assert.ok(
  packageJson.scripts.test.includes('node tests/customer-center-filter-consistency.test.js'),
  'npm test must include customer-center-filter-consistency.test.js'
);

console.log('customer center filter consistency tests passed');
