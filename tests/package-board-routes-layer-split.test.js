const assert = require('assert');
const fs = require('fs');
const path = require('path');

const repoRoot = path.resolve(__dirname, '..');
const apiSource = fs.readFileSync(path.join(repoRoot, 'api/index.js'), 'utf8');
const routesPath = path.join(repoRoot, 'server/package-board-routes.js');

assert.ok(fs.existsSync(routesPath), 'server/package-board-routes.js should own package board preference routes');

const routesSource = fs.readFileSync(routesPath, 'utf8');

assert.match(apiSource, /require\('\.\.\/server\/package-board-routes'\)/, 'api/index.js should import package board routes');
assert.match(routesSource, /function createPackageBoardRoutes/, 'package board routes module should expose a route factory');
assert.match(routesSource, /function normalizePackageBoardColumnOrder/, 'package board routes module should own column order normalization');
assert.match(routesSource, /path==='\/package-board-preferences'&&method==='GET'/, 'package board routes module should own preference read route');
assert.match(routesSource, /path==='\/package-board-preferences'&&method==='PUT'/, 'package board routes module should own preference save route');
assert.match(apiSource, /if\(await handlePackageBoardRoutes\(\{path,method,body,user,res\}\)\)return;/, 'api/index.js should call package board routes');
assert.doesNotMatch(apiSource, /path==='\/package-board-preferences'/, 'api/index.js should not keep package board preference routes inline');
assert.doesNotMatch(apiSource, /function normalizePackageBoardColumnOrder/, 'api/index.js should not own package board column order normalization');

console.log('package board routes layer split tests passed');
