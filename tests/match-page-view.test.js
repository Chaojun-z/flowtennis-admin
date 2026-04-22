const assert = require('assert');
const fs = require('fs');
const path = require('path');

const root = path.join(__dirname, '..');
const html = fs.readFileSync(path.join(root, 'public', 'index.html'), 'utf8');
const state = fs.readFileSync(path.join(root, 'public', 'assets', 'scripts', 'core', 'state.js'), 'utf8');

assert.match(html, /goPage\('matches'/, 'sidebar should expose match management');
assert.match(html, /id="page-matches"/, 'admin should include match page section');
assert.match(html, /id="matchTbody"/, 'match page should include a table body');
assert.match(html, /assets\/scripts\/pages\/matches\.js/, 'index should load match page script');
assert.match(state, /matches:\['matchesPage'\]/, 'match page should load match API data');
assert.match(state, /matchesPage:\(\)=>apiCall\('GET','\/admin\/matches'\)/, 'match dataset loader should call admin match API');
assert.match(state, /if\(pg==='matches'\)renderMatches\(\);/, 'router should render matches page');

const page = fs.readFileSync(path.join(root, 'public', 'assets', 'scripts', 'pages', 'matches.js'), 'utf8');
assert.match(page, /function renderMatches\(/, 'match page should render match rows');
assert.match(page, /function openMatchBookingModal\(/, 'match page should support booking action');
assert.match(page, /function openMatchAttendanceModal\(/, 'match page should support attendance action');
assert.match(page, /function confirmMatchFees\(/, 'match page should support AA fee generation');
assert.match(page, /function openMatchFeeModal\(/, 'match page should support fee split management');
assert.match(page, /function updateMatchFeeSplit\(/, 'match page should support marking fee split status');
assert.match(page, /function openMatchWithdrawalModal\(/, 'match page should support booked withdrawal handling');
assert.match(page, /\/registrations\/\$\{userId\}\/withdrawal/, 'booked withdrawal should call admin withdrawal API');
assert.match(page, /约球订场收入/, 'match page should explain paid AA syncs into court finance');
assert.match(page, /'refunded'/, 'fee split modal should support refund status');

console.log('match page view tests passed');
