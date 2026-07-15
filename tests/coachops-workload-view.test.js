const assert = require('assert');
const fs = require('fs');
const path = require('path');
const { appSource: source, html } = require('./helpers/read-index-bundle');

const styles = fs.readFileSync(path.join(__dirname, '..', 'public', 'assets', 'styles', 'pages.css'), 'utf8');

function fnBody(name) {
  const start = source.indexOf(`function ${name}(`);
  assert.notStrictEqual(start, -1, `${name} should exist`);
  const nextFunction = source.indexOf('\nfunction ', start + 1);
  const nextAsync = source.indexOf('\nasync function ', start + 1);
  const candidates = [nextFunction, nextAsync].filter(i => i !== -1);
  const next = candidates.length ? Math.min(...candidates) : -1;
  return source.slice(start, next === -1 ? source.length : next);
}
function standardConfigBlock(key) {
  const marker = `key:'${key}'`;
  const start = source.indexOf(marker);
  assert.notStrictEqual(start, -1, `${key} should have a standard list config`);
  const rest = source.slice(start);
  const next = rest.search(/\n    \{key:|\n  \];/);
  return next === -1 ? rest : rest.slice(0, next);
}

const coachOpsShell = standardConfigBlock('coachops');

assert.match(source, /let coachOpsMode='week'/, 'coach operations should default to weekly view');
assert.match(`${html}\n${coachOpsShell}`, /id="page-coachops" data-standard-list-shell="coachops"[\s\S]*bodyId:'coachOpsTbody'[\s\S]*体验课转化率[\s\S]*课程类型分布/, 'coach workload should use the standard table style and expose the new columns');
assert.doesNotMatch(html, /id="page-coachops"[\s\S]*当前筛选总时长[\s\S]*coachOpsTbody/, 'coach workload should remove current filtered duration column');
assert.match(html, /id="page-coachschedule"[\s\S]*id="coachOpsTimeline"/, 'coach schedule should live in its own page');
assert.doesNotMatch(html, /coachOpsTabSchedule|coachOpsTabWorkload|coachOpsStats/, 'coach operations split pages should not keep old tabs or top stats');
assert.match(styles, /#page-coachops \.tms-table/, 'coach operations should have scoped standard table sizing');
assert.match(source, /function coachSortValue\(/, 'coach list ordering should use a persisted sort value');
assert.match(fnBody('activeCoachNames'), /coachSortValue/, 'active coach names should follow persisted coach order');
assert.match(fnBody('coachOpsRows'), /coachSortValue/, 'coach operation rows should follow persisted coach order');
assert.doesNotMatch(fnBody('coachOpsRows'), /activeCoachNames\(\)\.map\(name=>\(\{name,rows:\[\]\}\)\)/, 'coach workload must not fake empty schedule rows when backend unified rows are missing');
assert.match(source, /function saveCoachOpsOrder\(/, 'coach schedule order should be saveable');
assert.match(fnBody('saveCoachOpsOrder'), /apiCall\('PUT','\/coaches\/'\+coach\.id/, 'coach schedule order should persist through the backend coach record');
assert.match(fnBody('renderCoachOps'), /draggable="true"[\s\S]*ondragstart="coachOpsDragStart/, 'coach schedule rows should support drag sorting');
assert.match(fnBody('renderCoachOpsRangeFilter'), /coach-ops-mode-segment/, 'coach schedule should use the new segmented view switcher');
assert.match(fnBody('renderCoachOps'), /coach-ops-more-btn/, 'coach schedule month cells should expose a more popover trigger');
assert.match(fnBody('renderCoachOps'), /const visibleRows=mode==='week'\?dayRows:dayRows\.slice\(0,3\)/, 'coach schedule week view should list all courses without +more');
assert.match(fnBody('coachOpsScheduleItemText'), /coachOpsScheduleStudentTitle/, 'coach schedule cards should use the cleaned student title');
assert.match(fnBody('openCoachOpsMorePopover'), /coach-ops-more-popover/, 'coach schedule more trigger should render a floating popover');
assert.match(styles, /#page-coachschedule \.coach-ops-head\{[\s\S]*position:sticky[\s\S]*top:var\(--coach-ops-toolbar-h\)/, 'coach schedule time header should stay fixed below the toolbar');
assert.match(styles, /#page-coachschedule \.coach-ops-day-time-axis\{position:sticky;left:0/, 'coach schedule day time axis should stay fixed while horizontally scrolling');
assert.match(source, /function operationsCoachTrialConversionText\(/, 'coach workload should display trial conversion from the unified operations read model');
assert.match(fnBody('operationsCoachTrialConversionText'), /operationsPageData\?\.coach\?\.rows/, 'trial conversion should read the operations coach metrics');
assert.match(source, /function coachCourseTypeDistributionText\(/, 'coach workload should show course type distribution');
assert.match(source, /function coachOpsComparisonText\(/, 'coach workload should show period-over-period comparison');
assert.match(fnBody('operationsCoachTrialConversionText'), /return '-%'/, 'trial conversion should show -% when no trial data exists');
assert.doesNotMatch(fnBody('operationsCoachTrialConversionText'), /coach-workload-rate down/, 'empty trial conversion should not render red');
assert.match(fnBody('coachCourseTypeDistributionText'), /\|\|'-'/, 'empty course type distribution should show short hyphen');
assert.match(fnBody('coachOpsComparisonText'), /row\?\.comparisonText\|\|''/, 'workload comparison should read backend unified comparison text without local recalculation');
assert.match(fnBody('renderCoachOps'), /coach-workload-course-types[\s\S]*coach-workload-campus[\s\S]*coach-workload-timeband/, 'workload should render course, campus and time distribution cells');
assert.match(styles, /#page-coachops \.tms-table-card\{[\s\S]*min-height:calc\(100vh - 180px\)/, 'coach workload table card should fill more vertical space');
assert.match(styles, /#page-coachops \.coach-workload-wrap\{white-space:nowrap/, 'workload distribution cells should stay on one line');

console.log('coach operations workload view tests passed');
