const assert = require('assert');
const fs = require('fs');
const path = require('path');

const repoRoot = path.resolve(__dirname, '..');
const apiSource = fs.readFileSync(path.join(repoRoot, 'api/index.js'), 'utf8');
const routesPath = path.join(repoRoot, 'server/courts-routes.js');

assert.ok(fs.existsSync(routesPath), 'server/courts-routes.js should own court write/import/merge routes');

const routesSource = fs.readFileSync(routesPath, 'utf8');

assert.match(apiSource, /require\('\.\.\/server\/courts-routes'\)/, 'api/index.js should import court routes from server/courts-routes.js');
assert.match(routesSource, /function createCourtRoutes/, 'court routes module should expose a route factory');
assert.match(routesSource, /path==='\/courts'/, 'court routes module should own /courts');
assert.match(routesSource, /path==='\/courts\/import'/, 'court routes module should own /courts/import');
assert.match(routesSource, /path==='\/courts\/merge'/, 'court routes module should own /courts/merge');
assert.match(routesSource, /\/\^\\\/courts\\\/\(\.\+\)\$\/|path\.match\(\^?/, 'court routes module should own /courts/:id handling');
assert.doesNotMatch(apiSource, /if\(path==='\/courts'\)/, 'api/index.js should not keep /courts route inline');
assert.doesNotMatch(apiSource, /if\(path==='\/courts\/import'/, 'api/index.js should not keep court import inline');
assert.doesNotMatch(apiSource, /if\(path==='\/courts\/merge'/, 'api/index.js should not keep court merge inline');

console.log('courts routes layer split tests passed');
