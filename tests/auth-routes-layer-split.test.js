const assert = require('assert');
const fs = require('fs');
const path = require('path');

const repoRoot = path.resolve(__dirname, '..');
const apiSource = fs.readFileSync(path.join(repoRoot, 'api/index.js'), 'utf8');
const routesPath = path.join(repoRoot, 'server/auth-routes.js');

assert.ok(fs.existsSync(routesPath), 'server/auth-routes.js should own authenticated auth routes');

const routesSource = fs.readFileSync(routesPath, 'utf8');

assert.match(apiSource, /require\('\.\.\/server\/auth-routes'\)/, 'api/index.js should import auth routes');
assert.match(routesSource, /function createAuthRoutes/, 'auth routes module should expose a route factory');
assert.match(routesSource, /path==='\/auth\/wechat-bind'&&method==='POST'/, 'auth routes module should own wechat bind route');
assert.match(routesSource, /path==='\/auth\/me'/, 'auth routes module should own auth me route');
assert.match(routesSource, /await bindWechatUserWithIndex\(stored,openid\);/, 'wechat bind route should keep index sync');
assert.match(apiSource, /if\(await handleAuthRoutes\(\{path,method,body,user,res\}\)\)return;/, 'api/index.js should call auth routes');
assert.doesNotMatch(apiSource, /path==='\/auth\/wechat-bind'|path==='\/auth\/me'/, 'api/index.js should not keep authenticated auth routes inline');

console.log('auth routes layer split tests passed');
