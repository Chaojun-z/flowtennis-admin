const assert = require('assert');
const { appSource: source } = require('./helpers/read-index-bundle');

assert.match(source, /普通学员[\s\S]*正式学员/, 'admin sidebar should split student management into normal and official student pages');
assert.match(source, /function isStudentListPage\(/, 'student split pages should share the existing student list shell');
assert.match(source, /package-students[\s\S]*trial-students/, 'student split pages should expose dedicated routes');
assert.match(source, /function studentHasNonTrialPackage\([\s\S]*customerLifecycleText\(studentLifecycleStage\(stu\)\)==='formal'/, 'student split pages should identify formal students from the unified lifecycle stage');
assert.match(source, /function studentHasTrialPath\([\s\S]*studentLifecycleRow\(stu\)/, 'trial student page should identify trial-path students from the unified lifecycle row');
assert.match(source, /customerLifecycleRows=\[\]/, 'student split pages should receive the unified customer lifecycle rows');
assert.match(source, /function studentLifecycleRow\(stu\)/, 'student split pages should lookup the unified lifecycle row for a student');
assert.match(source, /function studentLifecycleStage\(stu\)/, 'student split pages should read the standard studentStage field');
assert.match(source, /function studentUnifiedViewRows\(/, 'student split pages should read backend unified teaching student views first');
assert.match(source, /const viewRows=studentUnifiedViewRows\(\);[\s\S]*if\(viewRows\.length\)return viewRows\.filter/, 'student base list should use backend unified views before local fallback');
assert.match(source, /if\(lifecycleStage\)return studentListViewMode\(\)==='trial'\?\['trial','formal'\]\.includes\(lifecycleStage\):lifecycleStage==='formal';/, 'normal student page should include all course-chain students, including official students');
assert.match(source, /function studentDealPathText\(/, 'official student page should expose a deal path helper');
assert.match(source, /体验转化[\s\S]*直接成交[\s\S]*老客续费/, 'official student deal path should cover trial conversion, direct deal, and renewal');
assert.match(source, /'package-students':\['campuses','students','lifecycleMetricsPage'\][\s\S]*'trial-students':\['campuses','students','lifecycleMetricsPage'\]/, 'student split pages should load lifecycle metrics before first render without pulling the full purchases aggregate');
assert.doesNotMatch(source, /当前列表课程成交/, 'normal student page must use course-chain funnel cards instead of the old local course-deal card');

console.log('student split pages tests passed');
