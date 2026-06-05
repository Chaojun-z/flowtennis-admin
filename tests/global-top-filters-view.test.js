const assert = require('assert');
const fs = require('fs');
const path = require('path');
const { appSource } = require('./helpers/read-index-bundle');
const pageDir = path.join(__dirname, '..', 'public', 'assets', 'scripts', 'pages');
const source = [
  appSource,
  fs.readFileSync(path.join(pageDir, 'leads.js'), 'utf8')
].join('\n');

function fnBody(name){
  const start = source.indexOf(`function ${name}(`);
  assert.notStrictEqual(start, -1, `${name} should exist`);
  const nextFunction = source.indexOf('\nfunction ', start + 1);
  const nextAsync = source.indexOf('\nasync function ', start + 1);
  const candidates = [nextFunction, nextAsync].filter(i => i !== -1);
  const next = candidates.length ? Math.min(...candidates) : -1;
  return source.slice(start, next === -1 ? source.length : next);
}

assert.match(source, /globalDateRangeFilterValue=localStorage\.getItem\(GLOBAL_DATE_RANGE_KEY\)\|\|'全部'/, 'global time filter should persist one shared value');
assert.match(source, /function renderGlobalTopFilters\(/, 'target pages should share one top filter component');
assert.match(fnBody('buildCampusTabs'), /renderGlobalTopFilters\(\)/, 'shared top host should render the global component');
assert.match(fnBody('setCampus'), /refreshGlobalTopFilters\(\)/, 'global campus changes should refresh the shared top component');
assert.match(source, /function setGlobalDateRangeFilter\(/, 'global time changes should use one setter');
assert.match(source, /localStorage\.setItem\(GLOBAL_DATE_RANGE_KEY,globalDateRangeFilterValue\)/, 'global time changes should persist to localStorage');
assert.match(fnBody('setGlobalDateRangeFilter'), /renderCurrentGlobalFilterPage\(\)/, 'global time changes should rerender the current page');

[
  'students',
  'leads',
  'schedule',
  'admin-users',
  'coaches',
  'finance'
].forEach(page=>{
  assert.match(
    fnBody('goPage'),
    new RegExp(`globalTopFilterPages\\(\\)[\\s\\S]*${page}`),
    `${page} should show the shared top filter`
  );
});

assert.match(fnBody('renderGlobalTopFilters'), /renderCourtTopDropdown\('globalTopCampus'/, 'global campus filter should reuse the court-style dropdown');
assert.match(fnBody('renderGlobalTopFilters'), /renderCourtTopDropdown\('globalTopDate'/, 'global time filter should reuse the court-style dropdown');
assert.match(fnBody('renderGlobalTopFilters'), /globalDateRangeFilterValue==='自定义'[\s\S]*renderCourtDateRangePanel\(\)/, 'global time filter should reuse the court custom date panel');
assert.match(fnBody('getFilteredSchedules'), /globalDateWithinRange\(s\.startTime\)/, 'schedule rows should follow the global time filter');
assert.match(fnBody('getFilteredStudents'), /globalDateWithinRange\(studentGlobalDateValue\(s\)\)/, 'student rows should follow the global time filter');
assert.match(fnBody('getFilteredLeads'), /globalDateWithinRange\(leadGlobalDateValue\(lead\)\)/, 'lead rows should follow the global time filter');
assert.match(fnBody('getFilteredAdminUsers'), /globalDateWithinRange\(adminUserGlobalDateValue\(u\)\)/, 'account rows should follow the global time filter');
assert.match(fnBody('getFilteredCoaches'), /globalDateWithinRange\(coachGlobalDateValue\(c\)\)/, 'coach rows should follow the global time filter');
assert.match(fnBody('renderFinanceLedger'), /globalDateWithinRange\(row\.businessDate\)/, 'finance ledger should follow the global time filter');
assert.match(fnBody('renderFinanceRevenueReport'), /globalDateWithinRange\(row\.purchaseDate\)/, 'finance revenue should follow the global time filter');
assert.match(fnBody('financeRecognizedRows'), /globalDateWithinRange\(row\.businessDate\)/, 'recognized revenue should follow the global time filter');
assert.match(fnBody('renderFinanceSettlementSummary'), /financeSettlementMonthWithinGlobalRange\(row\.month\)/, 'coach settlement should follow the global time filter');

console.log('global top filters view tests passed');
