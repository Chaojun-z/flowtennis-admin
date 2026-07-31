const assert = require('assert');
const { appSource: source } = require('./helpers/read-index-bundle');

assert.match(source, /历史学员[\s\S]*在期学员/, 'admin sidebar should split student management into historical and active student pages');
assert.match(source, /function isStudentListPage\(/, 'student split pages should share the existing student list shell');
assert.match(source, /package-students[\s\S]*trial-students/, 'student split pages should expose dedicated routes');
assert.match(source, /function studentHasNonTrialPackage\([\s\S]*customerLifecycleText\(studentLifecycleStage\(stu\)\)==='formal'/, 'student split pages should identify formal students from the unified lifecycle stage');
assert.match(source, /function studentHasTrialPath\([\s\S]*studentLifecycleRow\(stu\)/, 'trial student page should identify trial-path students from the unified lifecycle row');
assert.match(source, /customerLifecycleRows=\[\]/, 'student split pages should receive the unified customer lifecycle rows');
assert.match(source, /function studentLifecycleRow\(stu\)/, 'student split pages should lookup the unified lifecycle row for a student');
assert.match(source, /function studentLifecycleStage\(stu\)/, 'student split pages should read the standard studentStage field');
assert.match(source, /function studentUnifiedViewRows\(/, 'student split pages should read backend unified teaching student views');
assert.match(source, /function teachingStudentViewRows\(mode\)[\s\S]*const key=mode==='trial'\?'historicalStudents':'activeStudents'[\s\S]*if\(Array\.isArray\(rows\)\)return rows/, 'student split pages should read new historical and active backend teaching student views, including legitimate empty arrays');
assert.match(source, /const base=viewRows\.length\?viewRows:students;[\s\S]*studentListViewMode\(\)==='trial'\?studentIsHistoricalRosterRow\(s\):studentIsActiveRosterRow\(s\)/, 'student base list should use historical and active roster scopes');
assert.match(source, /function studentIsHistoricalRosterRow\(/, 'historical student page should use the historical roster helper');
assert.match(source, /function studentIsActiveRosterRow\(/, 'active student page should use the active roster helper');
assert.match(source, /课包学员[\s\S]*单次付费学员[\s\S]*课包\+单次付费/, 'student payment mode should cover package, single-pay, and mixed students');
assert.match(source, /'package-students':\['campuses','coaches','customerCenterPage'\][\s\S]*'trial-students':\['campuses','coaches','customerCenterPage'\]/, 'student split pages should load coaches and the lightweight customer center read model before first render without pulling full student or purchase aggregates');
assert.doesNotMatch(source, /当前列表课程成交/, 'normal student page must use course-chain funnel cards instead of the old local course-deal card');

console.log('student split pages tests passed');
