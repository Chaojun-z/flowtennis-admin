const assert = require('assert');
const fs = require('fs');
const path = require('path');

const repoRoot = path.resolve(__dirname, '..');
const apiSource = fs.readFileSync(path.join(repoRoot, 'api/index.js'), 'utf8');
const routesPath = path.join(repoRoot, 'server/admin-tools-routes.js');

assert.ok(fs.existsSync(routesPath), 'server/admin-tools-routes.js should own admin tool routes');

const routesSource = fs.readFileSync(routesPath, 'utf8');

assert.match(apiSource, /require\('\.\.\/server\/admin-tools-routes'\)/, 'api/index.js should import admin tool routes from server/admin-tools-routes.js');
assert.match(routesSource, /function createAdminToolRoutes/, 'admin tool routes module should expose a route factory');
assert.match(routesSource, /const TEST_DATA_RESET_TABLES=\[/, 'admin tool routes module should own test data reset table list');
assert.match(routesSource, /path==='\/admin\/clear-test-data'/, 'admin tool routes module should own clear test data route');
assert.match(apiSource, /if\(await handleAdminToolRoutes\(\{path,method,body,user,res\}\)\)return;/, 'api/index.js should call admin tool routes');
assert.doesNotMatch(apiSource, /path==='\/admin\/clear-test-data'/, 'api/index.js should not keep clear test data route inline');
assert.doesNotMatch(apiSource, /const TEST_DATA_RESET_TABLES=\[/, 'api/index.js should not own test data reset table list');

console.log('admin tools routes layer split tests passed');
