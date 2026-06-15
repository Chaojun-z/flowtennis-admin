const assert = require('assert');
const fs = require('fs');
const path = require('path');

const repoRoot = path.resolve(__dirname, '..');
const apiSource = fs.readFileSync(path.join(repoRoot, 'api/index.js'), 'utf8');
const routesPath = path.join(repoRoot, 'api/leads-routes.js');

assert.ok(fs.existsSync(routesPath), 'api/leads-routes.js should own leads route entrypoints');

const routesSource = fs.readFileSync(routesPath, 'utf8');

assert.match(apiSource, /require\('\.\/leads-routes'\)/, 'api/index.js should import leads routes');
assert.match(routesSource, /function createLeadsRoutes/, 'leads routes module should expose a route factory');

for (const route of [
  '/lead-followups',
  '/leads',
  '/leads/import-preview',
  '/leads/import-commit'
]) {
  assert.match(routesSource, new RegExp(`path==='${route.replace(/\//g, '\\/')}'`), `leads routes module should own ${route}`);
  assert.doesNotMatch(apiSource, new RegExp(`if\\(path==='${route.replace(/\//g, '\\/')}'`), `api/index.js should not keep ${route} inline`);
}

for (const fragment of [
  'convert-student',
  'convert-court',
  'link-student',
  'link-court',
  'lead-followups\\/([^/]+)',
  'leads\\/([^/]+)\\/followups'
]) {
  assert.ok(routesSource.includes(fragment), `leads routes module should own ${fragment}`);
}

console.log('leads routes layer split tests passed');
