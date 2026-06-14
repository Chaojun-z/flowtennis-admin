const assert = require('assert');
const fs = require('fs');
const path = require('path');
const { appSource } = require('./helpers/read-index-bundle');
const coreDir = path.join(__dirname, '..', 'public', 'assets', 'scripts', 'core');
const pageDir = path.join(__dirname, '..', 'public', 'assets', 'scripts', 'pages');
const componentsSource = fs.readFileSync(path.join(coreDir, 'components.js'), 'utf8');
const stateSource = fs.readFileSync(path.join(coreDir, 'state.js'), 'utf8');
const pagesCss = fs.readFileSync(path.join(__dirname, '..', 'public', 'assets', 'styles', 'pages.css'), 'utf8');
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
assert.match(appSource, /assets\/scripts\/core\/components\.js/, 'index should load the shared components entry');
assert.match(componentsSource, /function renderGlobalTopFilters\(/, 'top filter component should live in core components');
assert.doesNotMatch(stateSource, /function renderGlobalTopFilters\(/, 'top filter component should not live in state');
assert.match(source, /function renderGlobalTopFilters\(/, 'target pages should share one top filter component');
assert.match(fnBody('buildCampusTabs'), /renderGlobalTopFilters\(\)/, 'shared top host should render the global component');
assert.match(fnBody('setCampus'), /refreshGlobalTopFilters\(\)/, 'global campus changes should refresh the shared top component');
assert.match(source, /function setGlobalDateRangeFilter\(/, 'global time changes should use one setter');
assert.match(source, /localStorage\.setItem\(GLOBAL_DATE_RANGE_KEY,globalDateRangeFilterValue\)/, 'global time changes should persist to localStorage');
assert.match(fnBody('setGlobalDateRangeFilter'), /renderCurrentGlobalFilterPage\(\)/, 'global time changes should rerender the current page');
assert.match(source, /function beginGlobalCustomDateDraft\(/, 'global custom date should use a draft before confirm');
assert.match(source, /function applyGlobalCustomDateRange\(/, 'global custom date should only apply on confirm');
assert.match(source, /function cancelGlobalCustomDateDraft\(/, 'global custom date draft should be cancellable when dropdown closes');
assert.match(fnBody('setGlobalDateRangeFilter'), /if\(value==='自定义'\)[\s\S]*beginGlobalCustomDateDraft\(\)/, 'clicking custom should only begin a draft');
assert.doesNotMatch(fnBody('setGlobalDateRangeFilter').match(/if\(value==='自定义'\)[\s\S]*?return;/)?.[0]||'', /saveGlobalDateRange|renderCurrentGlobalFilterPage|globalDateRangeFilterValue=value/, 'clicking custom should not save, render data, or change the real filter');
assert.match(fnBody('beginGlobalCustomDateDraft'), /courtDateRangeStart='';[\s\S]*courtDateRangeEnd='';/, 'custom draft should open with no selected dates');
assert.match(fnBody('beginGlobalCustomDateDraft'), /__globalDateRangeDraftViewAnchor/, 'custom draft should use its own temporary month anchor');
assert.doesNotMatch(fnBody('beginGlobalCustomDateDraft'), /__courtDateRangeViewAnchor/, 'custom draft should not overwrite the real month anchor');
assert.match(fnBody('globalTopDateMenuActive'), /if\(globalDateRangeDraftActive\)return label===globalDateRangeFilterValue/, 'custom draft should keep the real quick option checked');
assert.match(fnBody('cancelGlobalCustomDateDraft'), /__globalDateRangeDraftViewAnchor=''/, 'closing custom draft should clear the temporary month anchor');
assert.match(fnBody('clearGlobalDateRange'), /__globalDateRangeDraftViewAnchor=''[\s\S]*__courtDateRangeViewAnchor=''/, 'clearing custom date should reset stale month anchors');
assert.match(fnBody('confirmCourtCustomDateRange'), /applyGlobalCustomDateRange\(\)/, 'global custom date should apply only after confirm');
assert.match(fnBody('clearCourtCustomDateRange'), /clearGlobalDateRange\(/, 'global custom clear should return to all time');
assert.match(fnBody('closeStandardTopDropdowns'), /cancelGlobalCustomDateDraft\(\)/, 'closing the global dropdown should cancel an unconfirmed draft');

[
  'students',
  'leads',
  'schedule',
  'finance'
].forEach(page=>{
  assert.match(
    fnBody('globalTopFilterPages'),
    new RegExp(`'${page}'`),
    `${page} should show the shared top filter`
  );
});
assert.doesNotMatch(fnBody('globalTopFilterPages'), /'admin-users'|'coaches'/, 'account and coach pages should not use global top filters');

assert.match(fnBody('renderGlobalTopFilters'), /renderStandardTopDropdown\('globalTopCampus'/, 'global campus filter should use the standard top dropdown');
assert.match(fnBody('renderGlobalTopFilters'), /renderStandardTopDropdown\('globalTopDate'/, 'global time filter should use the standard top dropdown');
assert.match(fnBody('renderGlobalTopFilters'), /showCustomPanel[\s\S]*renderCourtDateRangePanel\(\)/, 'global time filter should reuse the court custom date panel');
assert.match(pagesCss, /#campusTabs \.court-top-select \.court-top-display\{[^}]*height:32px[^}]*display:inline-flex[^}]*align-items:center[^}]*line-height:1/, 'global top filter should vertically center icon and text');
assert.match(pagesCss, /#campusTabs \.court-top-display-icon svg\{[^}]*vertical-align:middle/, 'global top filter icons should not sit below the text baseline');
assert.match(fnBody('getFilteredSchedules'), /globalDateWithinRange\(s\.startTime\)/, 'schedule rows should follow the global time filter');
assert.match(fnBody('getFilteredStudents'), /globalDateWithinRange\(studentGlobalDateValue\(s\)\)/, 'student rows should follow the global time filter');
assert.match(fnBody('getFilteredLeads'), /globalDateWithinRange\(leadGlobalDateValue\(lead\)\)/, 'lead rows should follow the global time filter');
assert.doesNotMatch(fnBody('getFilteredAdminUsers'), /globalDateWithinRange/, 'account rows should not follow the global time filter');
assert.doesNotMatch(fnBody('getFilteredCoaches'), /globalDateWithinRange/, 'coach rows should not follow the global time filter');
assert.match(fnBody('renderFinanceLedger'), /globalDateWithinRange\(row\.businessDate\)/, 'finance ledger should follow the global time filter');
assert.match(fnBody('financeLedgerRows'), /globalDateWithinRange\(row\.businessDate\)/, 'finance ledger row source should follow the global time filter');
assert.match(fnBody('renderFinanceRevenueReport'), /globalDateWithinRange\(row\.purchaseDate\)/, 'finance revenue should follow the global time filter');
assert.match(fnBody('financeRevenueRows'), /globalDateWithinRange\(row\.purchaseDate\)/, 'finance revenue row source should follow the global time filter');
assert.match(fnBody('financeRecognizedRows'), /globalDateWithinRange\(row\.businessDate\)/, 'recognized revenue should follow the global time filter');
assert.match(fnBody('renderFinanceSettlementSummary'), /financeSettlementMonthWithinGlobalRange\(row\.month\)/, 'coach settlement should follow the global time filter');

console.log('global top filters view tests passed');
