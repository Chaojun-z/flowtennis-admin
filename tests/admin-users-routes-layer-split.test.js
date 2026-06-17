const assert = require('assert');
const fs = require('fs');
const path = require('path');

const repoRoot = path.resolve(__dirname, '..');
const apiSource = fs.readFileSync(path.join(repoRoot, 'api/index.js'), 'utf8');
const routesPath = path.join(repoRoot, 'server/admin-users-routes.js');

assert.ok(fs.existsSync(routesPath), 'server/admin-users-routes.js should own admin user routes');

const routesSource = fs.readFileSync(routesPath, 'utf8');

assert.match(apiSource, /require\('\.\.\/server\/admin-users-routes'\)/, 'api/index.js should import admin user routes from server/admin-users-routes.js');
assert.match(routesSource, /function createAdminUserRoutes/, 'admin user routes module should expose a route factory');
assert.match(routesSource, /path==='\/admin\/create-user'/, 'admin user routes module should own create user');
assert.match(routesSource, /path==='\/admin\/update-user'/, 'admin user routes module should own update user');
assert.match(routesSource, /path==='\/admin\/reset-user-password'/, 'admin user routes module should own password reset');
assert.match(routesSource, /path==='\/admin\/users'/, 'admin user routes module should own admin users list');
assert.match(apiSource, /if\(await handleAdminUserRoutes\(\{path,method,body,user,res\}\)\)return;/, 'api/index.js should call admin user routes');
assert.doesNotMatch(apiSource, /path==='\/admin\/create-user'|path==='\/admin\/update-user'|path==='\/admin\/reset-user-password'|path==='\/admin\/users'/, 'api/index.js should not keep admin user routes inline');

console.log('admin users routes layer split tests passed');
