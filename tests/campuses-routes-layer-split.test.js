const assert = require('assert');
const fs = require('fs');
const path = require('path');

const repoRoot = path.resolve(__dirname, '..');
const apiSource = fs.readFileSync(path.join(repoRoot, 'api/index.js'), 'utf8');
const routesPath = path.join(repoRoot, 'server/campuses-routes.js');

assert.ok(fs.existsSync(routesPath), 'server/campuses-routes.js should own campus routes');

const routesSource = fs.readFileSync(routesPath, 'utf8');

assert.match(apiSource, /require\('\.\.\/server\/campuses-routes'\)/, 'api/index.js should import campus routes from server/campuses-routes.js');
assert.match(routesSource, /function createCampusRoutes/, 'campus routes module should expose a route factory');
assert.match(routesSource, /path==='\/campuses'/, 'campus routes module should own /campuses');
assert.match(routesSource, /path\.match\(\^?/, 'campus routes module should own /campuses/:id handling');
assert.match(apiSource, /if\(await handleCampusRoutes\(\{path,method,body,user,res\}\)\)return;/, 'api/index.js should call campus routes before falling through to Not found');
assert.doesNotMatch(apiSource, /if\(path==='\/campuses'\)\{[\s\S]*await init\(\);[\s\S]*if\(method==='POST'\)/, 'api/index.js should not keep authenticated /campuses route inline');
assert.doesNotMatch(apiSource, /const caM=path\.match\(\^?/, 'api/index.js should not keep /campuses/:id route inline');

console.log('campuses routes layer split tests passed');
