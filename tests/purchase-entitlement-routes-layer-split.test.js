const assert = require('assert');
const fs = require('fs');
const path = require('path');

const repoRoot = path.resolve(__dirname, '..');
const apiSource = fs.readFileSync(path.join(repoRoot, 'api/index.js'), 'utf8');
const routesPath = path.join(repoRoot, 'api/purchase-entitlement-routes.js');

assert.ok(fs.existsSync(routesPath), 'api/purchase-entitlement-routes.js should own purchase and entitlement write routes');

const routesSource = fs.readFileSync(routesPath, 'utf8');

assert.match(apiSource, /require\('\.\/purchase-entitlement-routes'\)/, 'api/index.js should import purchase entitlement routes');
assert.match(routesSource, /function createPurchaseEntitlementRoutes/, 'purchase entitlement routes module should expose a route factory');
assert.match(routesSource, /path==='\/purchases'/, 'purchase entitlement routes should own /purchases');
assert.match(routesSource, /path==='\/entitlements'/, 'purchase entitlement routes should own /entitlements');
assert.match(routesSource, /manual-adjust/, 'purchase entitlement routes should own manual entitlement adjustment');
assert.match(routesSource, /buildOperationTrace\(\{operationType:'package-purchase'/, 'purchase route should keep operation trace');
assert.match(routesSource, /buildOperationTrace\(\{operationType:delta<0\?'manual-lesson-consume':'manual-lesson-return'/, 'manual entitlement adjustment should keep operation trace');
assert.doesNotMatch(apiSource, /if\(path==='\/purchases'\)/, 'api/index.js should not keep /purchases inline');
assert.doesNotMatch(apiSource, /if\(path==='\/entitlements'\)/, 'api/index.js should not keep /entitlements inline');
assert.doesNotMatch(apiSource, /manual-adjust/, 'api/index.js should not keep manual entitlement adjustment inline');

console.log('purchase entitlement routes layer split tests passed');
