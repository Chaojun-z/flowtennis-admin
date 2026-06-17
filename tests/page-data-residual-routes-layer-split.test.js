const assert = require('assert');
const fs = require('fs');
const path = require('path');

const repoRoot = path.resolve(__dirname, '..');
const apiSource = fs.readFileSync(path.join(repoRoot, 'api/index.js'), 'utf8');
const routesPath = path.join(repoRoot, 'server/page-data/residual-pages.js');

assert.ok(fs.existsSync(routesPath), 'server/page-data/residual-pages.js should own remaining page-data routes');

const routesSource = fs.readFileSync(routesPath, 'utf8');

assert.match(apiSource, /require\('\.\.\/server\/page-data\/residual-pages\.js'\)/, 'api/index.js should import residual page-data routes');
assert.match(routesSource, /function createResidualPageDataRoutes/, 'residual page-data module should expose a route factory');
assert.match(apiSource, /if\(await handleResidualPageDataRoutes\(\{path,method,user,res,query\}\)\)return;/, 'api/index.js should call residual page-data routes after core page-data routes');

for (const route of [
  '/page-data/finance',
  '/page-data/court-account-list-view',
  '/page-data/court-account-list-view-compare'
]) {
  assert.match(routesSource, new RegExp(`path==='${route.replace(/\//g, '\\/')}'`), `residual page-data module should own ${route}`);
  assert.doesNotMatch(apiSource, new RegExp(`if\\(path==='${route.replace(/\//g, '\\/')}'`), `api/index.js should not keep ${route} inline`);
}

assert.match(routesSource, /handleFinancePageData/, 'residual page-data module should delegate finance page data without changing finance logic');
assert.match(routesSource, /loadCourtAccountListView/, 'residual page-data module should own court account list read model route');
assert.match(routesSource, /loadCourtAccountListViewCompare/, 'residual page-data module should own court account compare read model route');

console.log('residual page-data routes layer split tests passed');
