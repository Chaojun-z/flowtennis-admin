const assert = require('assert');
const fs = require('fs');
const path = require('path');

const repoRoot = path.resolve(__dirname, '..');
const apiSource = fs.readFileSync(path.join(repoRoot, 'api/index.js'), 'utf8');
const routesPath = path.join(repoRoot, 'server/packages-routes.js');

assert.ok(fs.existsSync(routesPath), 'server/packages-routes.js should own package routes');

const routesSource = fs.readFileSync(routesPath, 'utf8');

assert.match(apiSource, /require\('\.\.\/server\/packages-routes'\)/, 'api/index.js should import package routes from server/packages-routes.js');
assert.match(routesSource, /function createPackageRoutes/, 'package routes module should expose a route factory');
assert.match(routesSource, /function assertCanDeletePackage/, 'package routes module should own package delete guard');
assert.match(routesSource, /path==='\/packages'/, 'package routes module should own /packages');
assert.match(routesSource, /path==='\/packages\/merge'&&method==='POST'/, 'package routes module should own /packages/merge');
assert.match(routesSource, /path==='\/packages\/order'&&method==='PUT'/, 'package routes module should own /packages/order');
assert.match(routesSource, /path\.match\(\^?/, 'package routes module should own /packages/:id handling');
assert.match(apiSource, /if\(await handlePackageRoutes\(\{path,method,body,user,res\}\)\)return;/, 'api/index.js should call package routes before purchase entitlement routes');
assert.doesNotMatch(apiSource, /if\(path==='\/packages'\)/, 'api/index.js should not keep /packages route inline');
assert.doesNotMatch(apiSource, /if\(path==='\/packages\/merge'&&method==='POST'\)/, 'api/index.js should not keep /packages/merge route inline');
assert.doesNotMatch(apiSource, /if\(path==='\/packages\/order'&&method==='PUT'\)/, 'api/index.js should not keep /packages/order route inline');
assert.doesNotMatch(apiSource, /const pkgM=path\.match\(\^?/, 'api/index.js should not keep /packages/:id route inline');
assert.doesNotMatch(apiSource, /function assertCanDeletePackage/, 'api/index.js should not own package delete guard');

console.log('packages routes layer split tests passed');
