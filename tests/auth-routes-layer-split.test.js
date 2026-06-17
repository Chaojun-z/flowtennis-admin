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
assert.match(routesSource, /path==='\/auth\/login'&&method==='POST'/, 'auth routes module should own password login route');
assert.match(routesSource, /path==='\/auth\/wechat-login'&&method==='POST'/, 'auth routes module should own wechat login route');
assert.match(routesSource, /path==='\/auth\/wechat-bind'&&method==='POST'/, 'auth routes module should own wechat bind route');
assert.match(routesSource, /path==='\/auth\/me'/, 'auth routes module should own auth me route');
assert.match(routesSource, /timedEndpointMetric\('auth\.login'/, 'password login route should keep timing metric');
assert.match(routesSource, /checkLoginRateLimit\(req,username\)/, 'password login route should keep rate limit');
assert.match(routesSource, /jwt\.sign\(payload,JWT_SECRET,\{expiresIn:'7d'\}\)/, 'auth routes should keep token expiry');
assert.match(routesSource, /await bindWechatUserWithIndex\(stored,openid\);/, 'wechat bind route should keep index sync');
assert.match(apiSource, /if\(await handleAuthRoutes\(\{path,method,body,req,user,res\}\)\)return;/, 'api/index.js should call auth routes');
assert.doesNotMatch(apiSource, /path==='\/auth\/login'|path==='\/auth\/wechat-login'|path==='\/auth\/wechat-bind'|path==='\/auth\/me'/, 'api/index.js should not keep auth routes inline');

console.log('auth routes layer split tests passed');
