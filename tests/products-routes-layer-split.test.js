const assert = require('assert');
const fs = require('fs');
const path = require('path');

const repoRoot = path.resolve(__dirname, '..');
const apiSource = fs.readFileSync(path.join(repoRoot, 'api/index.js'), 'utf8');
const routesPath = path.join(repoRoot, 'server/products-routes.js');

assert.ok(fs.existsSync(routesPath), 'server/products-routes.js should own product routes and product-only guards');

const routesSource = fs.readFileSync(routesPath, 'utf8');

assert.match(apiSource, /require\('\.\.\/server\/products-routes'\)/, 'api/index.js should import product routes from server/products-routes.js');
assert.match(routesSource, /function createProductRoutes/, 'product routes module should expose a route factory');
assert.match(routesSource, /function createProductRouteHelpers/, 'product routes module should expose product route helpers');
assert.match(routesSource, /path==='\/products'/, 'product routes module should own /products');
assert.match(routesSource, /path\.match\(\^?/, 'product routes module should own /products/:id handling');
assert.match(routesSource, /function assertCanEditProductWithReferences/, 'product routes module should own product edit guard');
assert.match(routesSource, /function assertCanDeleteProduct/, 'product routes module should own product delete guard');
assert.match(routesSource, /function buildProductRenameDisplayUpdates/, 'product routes module should own product rename display sync');
assert.match(apiSource, /if\(await handleProductRoutes\(\{path,method,body,user,res\}\)\)return;/, 'api/index.js should call product routes before package routes');
assert.doesNotMatch(apiSource, /if\(path==='\/products'\)/, 'api/index.js should not keep /products route inline');
assert.doesNotMatch(apiSource, /const pM=path\.match\(\^?/, 'api/index.js should not keep /products/:id route inline');
assert.doesNotMatch(apiSource, /function assertCanEditProductWithReferences/, 'api/index.js should not own product edit guard');
assert.doesNotMatch(apiSource, /function assertCanDeleteProduct/, 'api/index.js should not own product delete guard');
assert.doesNotMatch(apiSource, /function buildProductRenameDisplayUpdates/, 'api/index.js should not own product rename display sync');

console.log('products routes layer split tests passed');
