const assert = require('assert');
const fs = require('fs');
const path = require('path');

const repoRoot = path.resolve(__dirname, '..');
const apiSource = fs.readFileSync(path.join(repoRoot, 'api/index.js'), 'utf8');
const routesPath = path.join(repoRoot, 'server/coach-proposals-routes.js');

assert.ok(fs.existsSync(routesPath), 'server/coach-proposals-routes.js should own coach proposal routes');

const routesSource = fs.readFileSync(routesPath, 'utf8');

assert.match(apiSource, /require\('\.\.\/server\/coach-proposals-routes'\)/, 'api/index.js should import coach proposal routes from server/coach-proposals-routes.js');
assert.match(routesSource, /function createCoachProposalRoutes/, 'coach proposal routes module should expose a route factory');
assert.match(routesSource, /path==='\/coach-proposals'/, 'coach proposal routes module should own /coach-proposals');
assert.match(routesSource, /const cpM=path\.match\(\^?/, 'coach proposal routes module should own /coach-proposals/:id handling');
assert.match(routesSource, /assertCanWriteCoachProposal\(user,schedule,buildCoachRefs\(\{coaches,users\}\)\)/, 'coach proposal write guard should stay unchanged');
assert.match(routesSource, /buildCoachProposalRecord\(/, 'coach proposal save should still use record builder');
assert.match(apiSource, /if\(await handleCoachProposalRoutes\(\{path,method,body,user,res\}\)\)return;/, 'api/index.js should call coach proposal routes');
assert.doesNotMatch(apiSource, /if\(path==='\/coach-proposals'\)/, 'api/index.js should not keep /coach-proposals route inline');
assert.doesNotMatch(apiSource, /const cpM=path\.match\(\^?/, 'api/index.js should not keep /coach-proposals/:id route inline');

console.log('coach proposals routes layer split tests passed');
