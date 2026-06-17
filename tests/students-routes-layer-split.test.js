const assert = require('assert');
const fs = require('fs');
const path = require('path');

const repoRoot = path.resolve(__dirname, '..');
const apiSource = fs.readFileSync(path.join(repoRoot, 'api/index.js'), 'utf8');
const routesPath = path.join(repoRoot, 'server/students-routes.js');

assert.ok(fs.existsSync(routesPath), 'server/students-routes.js should own student routes');

const routesSource = fs.readFileSync(routesPath, 'utf8');

assert.match(apiSource, /require\('\.\.\/server\/students-routes'\)/, 'api/index.js should import student routes from server/students-routes.js');
assert.match(routesSource, /function createStudentRoutes/, 'student routes module should expose a route factory');
assert.match(routesSource, /path==='\/students'/, 'student routes module should own /students');
assert.match(routesSource, /studentReminderLinkM/, 'student routes module should own reminder link route');
assert.match(routesSource, /studentReminderSettingsM/, 'student routes module should own reminder settings route');
assert.match(routesSource, /studentReminderUnbindM/, 'student routes module should own reminder unbind route');
assert.match(routesSource, /const sM=path\.match\(\^?/, 'student routes module should own /students/:id handling');
assert.match(routesSource, /applyStudentIdentityUpdate\(old,r\)/, 'student update should still run identity propagation');
assert.match(routesSource, /deleteStudentCascade\(id,\{confirm:body\.confirm,user\}\)/, 'student delete should still use cascade delete helper');
assert.match(apiSource, /if\(await handleStudentRoutes\(\{path,method,body,user,res\}\)\)return;/, 'api/index.js should call student routes');
assert.doesNotMatch(apiSource, /if\(path==='\/students'\)/, 'api/index.js should not keep /students route inline');
assert.doesNotMatch(apiSource, /studentReminderLinkM/, 'api/index.js should not keep reminder link route inline');
assert.doesNotMatch(apiSource, /studentReminderSettingsM/, 'api/index.js should not keep reminder settings route inline');
assert.doesNotMatch(apiSource, /studentReminderUnbindM/, 'api/index.js should not keep reminder unbind route inline');
assert.doesNotMatch(apiSource, /const sM=path\.match\(\^?/, 'api/index.js should not keep /students/:id route inline');

console.log('students routes layer split tests passed');
