const assert = require('assert');
const fs = require('fs');
const path = require('path');

const root = path.join(__dirname, '..');
const html = fs.readFileSync(path.join(root, 'public', 'index.html'), 'utf8');
const components = fs.readFileSync(path.join(root, 'public', 'assets', 'scripts', 'core', 'components.js'), 'utf8');
const state = fs.readFileSync(path.join(root, 'public', 'assets', 'scripts', 'core', 'state.js'), 'utf8');
const bootstrap = fs.readFileSync(path.join(root, 'public', 'assets', 'scripts', 'core', 'bootstrap.js'), 'utf8');
const standard = fs.readFileSync(path.join(root, 'public', 'assets', 'scripts', 'standard', 'components.js'), 'utf8');
const api = fs.readFileSync(path.join(root, 'api', 'index.js'), 'utf8');
const pagesCss = fs.readFileSync(path.join(root, 'public', 'assets', 'styles', 'pages.css'), 'utf8');
function standardConfigBlock(key) {
  const marker = `key:'${key}'`;
  const start = standard.indexOf(marker);
  assert.notStrictEqual(start, -1, `${key} should have a standard list config`);
  const rest = standard.slice(start);
  const next = rest.search(/\n    \{key:|\n  \];/);
  return next === -1 ? rest : rest.slice(0, next);
}
const matchShell = standardConfigBlock('matches');

assert.match(components, /goPage\('matches'/, 'sidebar should expose match management');
assert.match(html, /id="page-matches"/, 'admin should include match page section');
assert.doesNotMatch(html, /这里只看球局、订场、AA 收款和日志/, 'match page should remove the old explanatory copy');
assert.doesNotMatch(html, /id="page-matches"[\s\S]*tms-page-head-title[\s\S]*约球管理/, 'match page should remove the duplicated in-page title above the search box');
assert.match(components, /data-sidebar-icon="matches" width="15" height="15"/, 'match management should use the 15px custom tennis icon');
assert.match(matchShell, /bodyId:'matchTbody'/, 'match page should include a table body');
assert.match(matchShell, /matchStatusFilterHost/, 'match page should keep the shared status filter host');
assert.match(html, /assets\/scripts\/pages\/matches\.js/, 'index should load match page script');
assert.match(state, /matches:\['matchesPage'\]/, 'match page should load match API data');
assert.match(state, /matchesPage:\(\)=>apiCall\('GET','\/admin\/matches'\)/, 'match dataset loader should call admin match API');
assert.match(state, /if\(pg==='matches'\)renderMatches\(\);/, 'router should render matches page');

const page = fs.readFileSync(path.join(root, 'public', 'assets', 'scripts', 'pages', 'matches.js'), 'utf8');
assert.match(page, /function renderMatches\(/, 'match page should render match rows');
assert.match(page, /function syncMatchFilters\(/, 'match page should render the shared dropdown-style status filter');
assert.match(page, /renderStandardDropdownHtml\('matchStatusFilter'/, 'match page status filter should reuse the shared dropdown');
assert.doesNotMatch(bootstrap, /\['coachschedule','coachops','courts','matches','packages','purchases'\]/, 'match page should not render old top campus pills');
assert.doesNotMatch(matchShell, /matchCampusFilterHost/, 'match page should not place campus filter in the list toolbar');
assert.match(page, /function renderMatchTopFilters\(/, 'match page should render campus filter in the topbar');
assert.match(page, /renderStandardTopDropdown\('matchTopCampus'/, 'match page campus filter should use the global top filter style');
assert.match(state, /if\(currentPage==='matches'\)[\s\S]*renderMatchTopFilters/, 'match topbar should mount the match campus filter when entering the page');
assert.match(bootstrap, /globalTopFilterPages\(\)\.includes\(pg\)\|\|\['coachschedule','coachops','courts','packages','purchases','matches'\]\.includes\(pg\)/, 'match page should show the shared topbar filter host');
assert.match(pagesCss, /#page-matches \.tms-toolbar\{[^}]*align-items:center/, 'match toolbar should align filters with the latest page toolbar style');
assert.match(page, /function matchCampusCode\(/, 'match page should expose a campus matcher for global campus tabs');
assert.match(page, /function openMatchBookingModal\(/, 'match page should support booking action');
assert.match(page, /function cancelMatchByAdmin\(/, 'match page should support admin cancel action');
assert.match(page, /\/admin\/matches\/\$\{id\}\/cancel/, 'admin cancel should call the admin match cancel API');
assert.match(page, /function openMatchAttendanceModal\(/, 'match page should support attendance action');
assert.match(page, /function confirmMatchFees\(/, 'match page should support AA fee generation');
assert.match(page, /function openMatchFeeModal\(/, 'match page should support fee split management');
assert.match(page, /function updateMatchFeeSplit\(/, 'match page should support marking fee split status');
assert.match(page, /function editMatchFeeAmount\(/, 'match page should support direct AA amount editing');
assert.match(page, /改金额/, 'fee split modal should expose a direct edit amount action');
assert.match(page, /function openMatchWithdrawalModal\(/, 'match page should support booked withdrawal handling');
assert.match(page, /\/registrations\/\$\{userId\}\/withdrawal/, 'booked withdrawal should call admin withdrawal API');
assert.match(page, /function openMatchReplacementModal\(/, 'match page should support replacement transfer handling');
assert.match(page, /\/replacements\/transfer/, 'replacement transfer should call admin replacement API');
assert.match(page, /替补名额 \/ 订单转让/, 'match page should explain replacement transfer flow');
assert.match(page, /'refunded'/, 'fee split modal should support refund status');
assert.match(page, /matchFeeNote/, 'fee split updates should collect note for risky statuses');
assert.match(page, /请填写原因/, 'fee split refunds and exceptions should require reason on admin page');
assert.match(page, /function openMatchLogModal\(/, 'match page should show operation logs');
assert.match(page, /match_operation_logs|operationLogs|操作日志/, 'match page should render operation logs');
assert.match(page, /replacement_transfer/, 'match log labels should cover replacement transfers');
assert.match(api, /Connection terminated unexpectedly/, 'admin match API should treat transient postgres disconnects as local unavailable fallback');

console.log('match page view tests passed');
