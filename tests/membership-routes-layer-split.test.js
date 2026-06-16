const assert = require('assert');
const fs = require('fs');
const path = require('path');

const repoRoot = path.resolve(__dirname, '..');
const apiSource = fs.readFileSync(path.join(repoRoot, 'api/index.js'), 'utf8');
const routesPath = path.join(repoRoot, 'server/membership-routes.js');

assert.ok(fs.existsSync(routesPath), 'server/membership-routes.js should own membership write routes');

const routesSource = fs.readFileSync(routesPath, 'utf8');

assert.match(apiSource, /require\('\.\.\/server\/membership-routes'\)/, 'api/index.js should import membership routes from server/membership-routes.js');
assert.match(routesSource, /function createMembershipRoutes/, 'membership routes module should expose a route factory');
assert.match(routesSource, /path==='\/membership-plans'/, 'membership routes module should own membership plan routes');
assert.match(apiSource, /if\(await handleMembershipRoutes\(\{path,method,body,user,res,query\}\)\)return;/, 'api/index.js should call membership routes before falling through to Not found');
assert.match(routesSource, /path==='\/membership-orders'/, 'membership routes module should own membership order routes');
assert.match(routesSource, /path==='\/membership-benefit-ledger'/, 'membership routes module should own membership benefit ledger routes');
assert.doesNotMatch(apiSource, /if\(path==='\/membership-plans'\)/, 'api/index.js should not keep membership plans inline');
assert.doesNotMatch(apiSource, /if\(path==='\/membership-orders'\)/, 'api/index.js should not keep membership orders inline');
assert.doesNotMatch(apiSource, /if\(path==='\/membership-benefit-ledger'\)/, 'api/index.js should not keep membership benefit ledger inline');

console.log('membership routes layer split tests passed');
