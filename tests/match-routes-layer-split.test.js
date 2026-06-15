const assert = require('assert');
const fs = require('fs');
const path = require('path');

const repoRoot = path.resolve(__dirname, '..');
const apiSource = fs.readFileSync(path.join(repoRoot, 'api/index.js'), 'utf8');
const routesPath = path.join(repoRoot, 'api/match-routes.js');

assert.ok(fs.existsSync(routesPath), 'api/match-routes.js should own match route entrypoints');

const routesSource = fs.readFileSync(routesPath, 'utf8');

assert.match(apiSource, /require\('\.\/match-routes'\)/, 'api/index.js should import match routes');
assert.match(routesSource, /function createMatchRoutes/, 'match routes module should expose a route factory');

for (const route of [
  '/auth/wechat-mini-login',
  '/matches',
  '/my-matches',
  '/match-profile',
  '/match-profile/phone-code',
  '/match-settings',
  '/match-attendance/creator-confirm',
  '/match-notifications',
  '/match-players',
  '/admin/matches',
  '/admin/matches/settings',
  '/admin/matches/finance-daily'
]) {
  assert.match(routesSource, new RegExp(`path==='${route.replace(/\//g, '\\/')}'`), `match routes module should own ${route}`);
  assert.doesNotMatch(apiSource, new RegExp(`if\\(path==='${route.replace(/\//g, '\\/')}'`), `api/index.js should not keep ${route} inline`);
}

for (const fragment of [
  'cancel-registration',
  'technical-rating',
  'registrations\\/([^/]+)\\/withdrawal',
  'replacements\\/transfer',
  'fees\\/confirm',
  'fees\\/splits'
]) {
  assert.ok(routesSource.includes(fragment), `match routes module should own ${fragment}`);
}

console.log('match routes layer split tests passed');
