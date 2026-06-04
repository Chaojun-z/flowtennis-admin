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

assert.match(source, /let coachOpsMode='week'/, 'coach operations should default to weekly view');
assert.match(html, /id="page-coachops"[\s\S]*class="tms-table-card"[\s\S]*class="tms-table"[\s\S]*体验课转化率[\s\S]*课程类型分布/, 'coach workload should use the standard table style and expose the new columns');
assert.match(html, /id="page-coachschedule"[\s\S]*id="coachOpsTimeline"/, 'coach schedule should live in its own page');
assert.doesNotMatch(html, /coachOpsTabSchedule|coachOpsTabWorkload|coachOpsStats/, 'coach operations split pages should not keep old tabs or top stats');
assert.match(styles, /#page-coachops \.tms-table/, 'coach operations should have scoped standard table sizing');
assert.match(source, /function coachSortValue\(/, 'coach list ordering should use a persisted sort value');
assert.match(fnBody('activeCoachNames'), /coachSortValue/, 'active coach names should follow persisted coach order');
assert.match(fnBody('coachOpsRows'), /coachSortValue/, 'coach operation rows should follow persisted coach order');
assert.match(source, /function saveCoachOpsOrder\(/, 'coach schedule order should be saveable');
assert.match(fnBody('saveCoachOpsOrder'), /apiCall\('PUT','\/coaches\/'\+coach\.id/, 'coach schedule order should persist through the backend coach record');
assert.match(fnBody('renderCoachOps'), /draggable="true"[\s\S]*ondragstart="coachOpsDragStart/, 'coach schedule rows should support drag sorting');
assert.match(source, /function coachTrialConversionText\(/, 'coach workload should calculate trial conversion by coach');
assert.match(fnBody('coachTrialConversionText'), /ownerCoach/, 'trial conversion should count later purchases by owner coach');
assert.match(source, /function coachCourseTypeDistributionText\(/, 'coach workload should show course type distribution');
assert.match(source, /function coachOpsComparisonText\(/, 'coach workload should show period-over-period comparison');

console.log('coach operations workload view tests passed');
