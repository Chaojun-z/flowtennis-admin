const assert = require('assert');
const { appSource: source } = require('./helpers/read-index-bundle');

assert.match(source, /体验学员[\s\S]*正式学员/, 'admin sidebar should split student management into trial and official student pages');
assert.match(source, /function isStudentListPage\(/, 'student split pages should share the existing student list shell');
assert.match(source, /package-students[\s\S]*trial-students/, 'student split pages should expose dedicated routes');
assert.match(source, /function studentHasNonTrialPackage\(/, 'student split pages should identify non-trial package students');
assert.match(source, /function studentHasTrialPath\(/, 'trial student page should identify students who have entered the trial path');
assert.match(source, /studentListViewMode\(\)==='trial'\?studentHasTrialPath\(stu\):hasPackage/, 'trial student page should keep converted official students if they had a trial path');
assert.match(source, /function studentDealPathText\(/, 'official student page should expose a deal path helper');
assert.match(source, /体验转化[\s\S]*直接成交[\s\S]*老客续费/, 'official student deal path should cover trial conversion, direct deal, and renewal');
assert.match(source, /'package-students':\['campuses','students','purchasesPage'\][\s\S]*'trial-students':\['campuses','students','purchasesPage'\]/, 'student split pages should load package data before first render');

console.log('student split pages tests passed');
