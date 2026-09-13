const assert = require('assert');
const fs = require('fs');
const path = require('path');

const repoRoot = path.resolve(__dirname, '..');
const apiSource = fs.readFileSync(path.join(repoRoot, 'api/index.js'), 'utf8');
const routesPath = path.join(repoRoot, 'server/schedule-routes.js');

assert.ok(fs.existsSync(routesPath), 'server/schedule-routes.js should own schedule routes');

const routesSource = fs.readFileSync(routesPath, 'utf8');
function sourceFunctionBody(source, name) {
  const start = source.indexOf(`async function ${name}(`);
  assert.notStrictEqual(start, -1, `${name} should exist`);
  const nextAsync = source.indexOf('\nasync function ', start + 1);
  const nextFunction = source.indexOf('\nfunction ', start + 1);
  const candidates = [nextAsync, nextFunction].filter((index) => index !== -1);
  const end = candidates.length ? Math.min(...candidates) : source.length;
  return source.slice(start, end);
}

assert.match(apiSource, /require\('\.\.\/server\/schedule-routes'\)/, 'api/index.js should import schedule routes from server/schedule-routes.js');
assert.match(routesSource, /function createScheduleRoutes/, 'schedule routes module should expose a route factory');
assert.match(routesSource, /path==='\/schedule'/, 'schedule routes module should own /schedule');
assert.match(routesSource, /path\.match\(\^?/, 'schedule routes module should own /schedule/:id handling');
assert.match(apiSource, /if\(await handleScheduleRoutes\(\{path,method,body,user,res\}\)\)return;/, 'api/index.js should call schedule routes before coach routes');
assert.doesNotMatch(apiSource, /if\(path==='\/schedule'\)\{[\s\S]*timedEndpointMetric\('schedule\.save'/, 'api/index.js should not keep /schedule route inline');
assert.doesNotMatch(apiSource, /const schM=path\.match\(\^?/, 'api/index.js should not keep /schedule/:id route inline');
assert.match(sourceFunctionBody(apiSource, 'persistScheduleStoredValueCourts'), /courtAccountListIndexSync\.rebuildCourt/, 'schedule stored-value writes should refresh the court account read-model index for the affected member');

console.log('schedule routes layer split tests passed');
