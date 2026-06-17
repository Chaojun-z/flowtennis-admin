const assert = require('assert');
const fs = require('fs');
const path = require('path');

const repoRoot = path.resolve(__dirname, '..');
const apiSource = fs.readFileSync(path.join(repoRoot, 'api/index.js'), 'utf8');
const routesPath = path.join(repoRoot, 'server/feedbacks-routes.js');

assert.ok(fs.existsSync(routesPath), 'server/feedbacks-routes.js should own feedback routes');

const routesSource = fs.readFileSync(routesPath, 'utf8');

assert.match(apiSource, /require\('\.\.\/server\/feedbacks-routes'\)/, 'api/index.js should import feedback routes from server/feedbacks-routes.js');
assert.match(routesSource, /function createFeedbackRoutes/, 'feedback routes module should expose a route factory');
assert.match(routesSource, /path==='\/feedbacks'/, 'feedback routes module should own /feedbacks');
assert.match(routesSource, /const fbM=path\.match\(\^?/, 'feedback routes module should own /feedbacks/:id handling');
assert.match(routesSource, /timedEndpointMetric\('feedback\.save'/, 'feedback save should keep performance metric');
assert.match(routesSource, /assertCanWriteFeedback\(user,schedule,buildCoachRefs\(\{coaches,users\}\)\)/, 'feedback write guard should stay unchanged');
assert.match(routesSource, /buildFeedbackRecord\(/, 'feedback save should still use feedback record builder');
assert.match(apiSource, /if\(await handleFeedbackRoutes\(\{path,method,body,user,res\}\)\)return;/, 'api/index.js should call feedback routes');
assert.doesNotMatch(apiSource, /if\(path==='\/feedbacks'\)/, 'api/index.js should not keep /feedbacks route inline');
assert.doesNotMatch(apiSource, /const fbM=path\.match\(\^?/, 'api/index.js should not keep /feedbacks/:id route inline');

console.log('feedbacks routes layer split tests passed');
