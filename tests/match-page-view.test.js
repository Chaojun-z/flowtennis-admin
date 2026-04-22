const assert = require('assert');
const fs = require('fs');
const path = require('path');

const root = path.join(__dirname, '..');
const html = fs.readFileSync(path.join(root, 'public', 'index.html'), 'utf8');
const state = fs.readFileSync(path.join(root, 'public', 'assets', 'scripts', 'core', 'state.js'), 'utf8');

assert.match(html, /goPage\('matches'/, 'sidebar should expose match management');
assert.match(html, /id="page-matches"/, 'admin should include match page section');
assert.match(html, /id="matchFinanceStats"/, 'match page should expose finance stats row');
assert.match(html, /id="matchTbody"/, 'match page should include a table body');
assert.match(html, /assets\/scripts\/pages\/matches\.js/, 'index should load match page script');
assert.match(state, /matches:\['matchesPage'\]/, 'match page should load match API data');
assert.match(state, /matchesPage:\(\)=>apiCall\('GET','\/admin\/matches'\)/, 'match dataset loader should call admin match API');
assert.match(state, /if\(pg==='matches'\)renderMatches\(\);/, 'router should render matches page');

const page = fs.readFileSync(path.join(root, 'public', 'assets', 'scripts', 'pages', 'matches.js'), 'utf8');
assert.match(page, /function renderMatches\(/, 'match page should render match rows');
assert.match(page, /function matchFinanceSummary\(/, 'match page should compute finance summary');
assert.match(page, /function renderMatchFinanceStats\(/, 'match page should render finance summary cards');
assert.match(page, /待收/, 'match finance stats should expose pending amount');
assert.match(page, /异常/, 'match finance stats should expose abnormal amount');
assert.match(page, /function openMatchBookingModal\(/, 'match page should support booking action');
assert.match(page, /function openMatchAttendanceModal\(/, 'match page should support attendance action');
assert.match(page, /function confirmMatchFees\(/, 'match page should support AA fee generation');
assert.match(page, /function openMatchFeeModal\(/, 'match page should support fee split management');
assert.match(page, /function updateMatchFeeSplit\(/, 'match page should support marking fee split status');
assert.match(page, /function openMatchWithdrawalModal\(/, 'match page should support booked withdrawal handling');
assert.match(page, /\/registrations\/\$\{userId\}\/withdrawal/, 'booked withdrawal should call admin withdrawal API');
assert.match(page, /约球订场收入/, 'match page should explain paid AA syncs into court finance');
assert.match(page, /'refunded'/, 'fee split modal should support refund status');
assert.match(page, /约球订场总账/, 'match page should provide a match booking ledger entry');
assert.match(page, /matchFeeNote/, 'fee split updates should collect note for risky statuses');
assert.match(page, /请填写原因/, 'fee split refunds and exceptions should require reason on admin page');
assert.match(page, /function openMatchLogModal\(/, 'match page should show operation logs');
assert.match(page, /match_operation_logs|operationLogs|操作日志/, 'match page should render operation logs');

console.log('match page view tests passed');
