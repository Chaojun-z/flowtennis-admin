const assert = require('assert');
const fs = require('fs');
const path = require('path');

const publicDir = path.join(__dirname, '../public');
const studentsSource = fs.readFileSync(path.join(publicDir, 'assets/scripts/pages/students.js'), 'utf8');
const bootstrapSource = fs.readFileSync(path.join(publicDir, 'assets/scripts/core/bootstrap.js'), 'utf8');
const html = fs.readFileSync(path.join(publicDir, 'index.html'), 'utf8');

function fnBodyFrom(source, name){
  const starts = [`function ${name}(`, `async function ${name}(`]
    .map(pattern => source.indexOf(pattern))
    .filter(index => index !== -1);
  assert.ok(starts.length, `${name} should exist`);
  const start = Math.min(...starts);
  const nextFunction = source.indexOf('\nfunction ', start + 1);
  const nextAsync = source.indexOf('\nasync function ', start + 1);
  const candidates = [nextFunction, nextAsync].filter(index => index !== -1);
  const next = candidates.length ? Math.min(...candidates) : source.length;
  return source.slice(start, next);
}

const saveStudentBody = fnBodyFrom(studentsSource, 'saveStudent');
const saveStudentOptions = saveStudentBody.match(/successText:[\s\S]*?\n  \}\);/)?.[0] || '';
assert.match(saveStudentOptions, /refresh:\(\)=>\{[\s\S]*renderStudents\(\)/, 'student save should update the visible student page immediately');
assert.match(saveStudentOptions, /refreshReadModelsInBackground\(\['customerCenterPage','lifecycleMetricsPage','packageCenterPage','purchasesPage'\]/, 'student save should refresh related read models in the background');
assert.doesNotMatch(saveStudentOptions, /refresh:async/, 'student save should not make the standard button flow wait on the refresh hook');
assert.doesNotMatch(saveStudentOptions, /await ensureDatasetsByName\(/, 'student save should not wait for global read models after API success');

const doDeleteBody = fnBodyFrom(bootstrapSource, 'doDelete');
assert.match(doDeleteBody, /if\(currentDelType==='student'\)\{[\s\S]*renderStudentsIfVisible\(\)[\s\S]*refreshReadModelsInBackground\(\['customerCenterPage','lifecycleMetricsPage','packageCenterPage','financePage','purchasesPage'\]/, 'student delete should refresh the visible student page first and refresh read models in the background');
assert.match(doDeleteBody, /if\(currentDelType==='student'\)\{[\s\S]*return;\s*\}\s*if\(!result\?\.purchaseVoid\)renderAll\(\);/, 'student delete should return before the full app render path');

assert.match(html, /assets\/scripts\/core\/bootstrap\.js\?v=20260807-schedule-speed-feedback-v1/, 'index should bust stale cached bootstrap.js after schedule speed feedback fixes');
assert.match(html, /assets\/scripts\/pages\/students\.js\?v=20260809-student-lesson-fact-guard-v1/, 'index should bust stale cached students.js after student lesson fact guard fixes');

console.log('student speed feedback tests passed');
