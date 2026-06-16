const assert = require('assert');
const fs = require('fs');
const path = require('path');

const repoRoot = path.resolve(__dirname, '..');
const apiSource = fs.readFileSync(path.join(repoRoot, 'api/index.js'), 'utf8');
const routesPath = path.join(repoRoot, 'server/coaches-routes.js');

assert.ok(fs.existsSync(routesPath), 'server/coaches-routes.js should own coach routes and coach-only rules');

const routesSource = fs.readFileSync(routesPath, 'utf8');

assert.match(apiSource, /require\('\.\.\/server\/coaches-routes'\)/, 'api/index.js should import coach routes from server/coaches-routes.js');
assert.match(routesSource, /function createCoachRoutes/, 'coach routes module should expose a route factory');
assert.match(routesSource, /function createCoachRuleHelpers/, 'coach routes module should expose coach rule helpers');
assert.match(routesSource, /path==='\/coaches'/, 'coach routes module should own /coaches');
assert.match(routesSource, /path\.match\(\^?/, 'coach routes module should own /coaches/:id handling');
assert.match(routesSource, /function buildCoachRenameUpdates/, 'coach route module should own coach rename updates');
assert.match(routesSource, /function assertCanDeleteCoachName/, 'coach route module should own coach delete guard');
assert.match(routesSource, /function assertUniqueCoachName/, 'coach route module should own coach duplicate-name guard');
assert.match(apiSource, /if\(await handleCoachRoutes\(\{path,method,body,user,res\}\)\)return;/, 'api/index.js should call coach routes before core page-data routes');
assert.doesNotMatch(apiSource, /if\(path==='\/coaches'\)/, 'api/index.js should not keep /coaches route inline');
assert.doesNotMatch(apiSource, /const coM=path\.match\(\^?/, 'api/index.js should not keep /coaches/:id route inline');
assert.doesNotMatch(apiSource, /function buildCoachRenameUpdates/, 'api/index.js should not own coach rename updates');
assert.doesNotMatch(apiSource, /function assertCanDeleteCoachName/, 'api/index.js should not own coach delete guard');
assert.doesNotMatch(apiSource, /function assertUniqueCoachName/, 'api/index.js should not own coach duplicate-name guard');
assert.doesNotMatch(apiSource, /async function loadCoachReferenceData/, 'api/index.js should not own coach reference loading');
assert.doesNotMatch(apiSource, /async function applyCoachRename/, 'api/index.js should not own coach rename persistence');

console.log('coaches routes layer split tests passed');
