const assert = require('assert');
const { html, appSource: source } = require('./helpers/read-index-bundle');

function fnBody(name){
  const start = source.indexOf(`function ${name}(`);
  assert.notStrictEqual(start, -1, `${name} should exist`);
  const nextFunction = source.indexOf('\nfunction ', start + 1);
  const nextAsync = source.indexOf('\nasync function ', start + 1);
  const candidates = [nextFunction, nextAsync].filter(i => i !== -1);
  const next = candidates.length ? Math.min(...candidates) : -1;
  return source.slice(start, next === -1 ? source.length : next);
}

assert.match(source, /id="campusTabs"/, 'top bar should provide the shared campus tabs host');
assert.match(fnBody('renderCourtTopFilters'), /renderStandardTopDropdown\('courtTopCampus'/, 'court top filters should render the campus dropdown through standard components');
assert.match(fnBody('renderCourtTopFilters'), /renderStandardTopDropdown\('courtTopDate'/, 'court top filters should render the date dropdown through standard components');
assert.match(fnBody('buildCampusTabs'), /currentPage==='courts'[\s\S]*renderCourtTopFilters\(\)/, 'courts page should replace top campus tabs with custom top filters');
assert.match(fnBody('courtDateFilterQuickOptions'), /全部[\s\S]*今日[\s\S]*本周[\s\S]*本月[\s\S]*自定义/, 'court date range filter should expose the required quick ranges');
assert.match(fnBody('currentCourtDateRangeLabel'), /resolveCourtDatePresetRange\(courtDateRangeFilterValue\)[\s\S]*formatCourtDateRangeValue\(preset\.startDate,preset\.endDate\)/, 'quick date ranges should display as concrete start/end dates in the top bar');
assert.match(fnBody('renderCourtDateRangeCalendarCells'), /is-muted[\s\S]*while\(cells\.length%7!==0\)/, 'calendar should render muted adjacent-month cells so every row keeps seven even date blocks');
assert.match(fnBody('renderCourtDateRangePanel'), /选择日期范围/, 'court custom date range panel should show the range heading');
assert.match(fnBody('renderCourtDateRangePanel'), /清空[\s\S]*确定/, 'court custom date range panel should provide clear and confirm actions');
assert.match(source, /function renderCourtDateRangeFilter\(/, 'court page should expose a dedicated date range filter renderer');
assert.match(source, /function applyCourtDateRangeFilter\(/, 'court page should expose a shared date range filter helper');
assert.match(source, /function onCourtDateRangeFilterChange\(/, 'court page should expose a date range filter change handler');
assert.match(fnBody('renderCourts'), /applyCourtDateRangeFilter/, 'legacy court rendering should apply the shared date range filter');
assert.match(fnBody('renderCourtAccountListView'), /applyCourtDateRangeFilter/, 'read-model court rendering should apply the shared date range filter');
assert.match(fnBody('renderCourtAccountListView'), /summarizeCourtAccountListItems\(list\)/, 'read-model court stats should refresh from the filtered date-range list');

console.log('court date filter ui tests passed');
