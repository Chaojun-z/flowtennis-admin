const assert = require('assert');
const fs = require('fs');
const path = require('path');

const repoRoot = path.resolve(__dirname, '..');
const apiSource = fs.readFileSync(path.join(repoRoot, 'api/index.js'), 'utf8');
const routesPath = path.join(repoRoot, 'server/page-data/core-pages.js');

assert.ok(fs.existsSync(routesPath), 'server/page-data/core-pages.js should own core page-data read routes');

const routesSource = fs.readFileSync(routesPath, 'utf8');

assert.match(apiSource, /require\('\.\.\/server\/page-data\/core-pages\.js'\)/, 'api/index.js should import core page-data routes');
assert.match(routesSource, /function createCorePageDataRoutes/, 'core page-data module should expose a route factory');
for (const route of [
  '/page-data/coaches',
  '/page-data/package-center-list',
  '/page-data/customer-center-list',
  '/page-data/purchase-detail',
  '/page-data/student-detail',
  '/page-data/purchases',
  '/page-data/courts',
  '/page-data/memberships',
  '/page-data/coach-schedule',
  '/page-data/workbench'
]) {
  assert.match(routesSource, new RegExp(`path==='${route.replace(/\//g, '\\/')}'`), `core page-data module should own ${route}`);
  assert.doesNotMatch(apiSource, new RegExp(`if\\(path==='${route.replace(/\//g, '\\/')}'`), `api/index.js should not keep ${route} inline`);
}

console.log('core page-data routes layer split tests passed');
