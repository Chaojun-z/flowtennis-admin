const assert = require('assert');
const fs = require('fs');
const path = require('path');

const workflowPath = path.join(__dirname, '..', '.github', 'workflows', 'ci-guard.yml');
const packageJsonPath = path.join(__dirname, '..', 'package.json');
const source = fs.readFileSync(workflowPath, 'utf8');
const packageJson = JSON.parse(fs.readFileSync(packageJsonPath, 'utf8'));
const releaseGuard = packageJson.scripts['guard:release'];

const requiredReleaseGuardSteps = [
  'npm test',
  'npm run guard:finance',
  'node tests/page-data-requirements.test.js',
  'node tests/production-read-path-hotfix.test.js',
  'node tests/memberships-page-data-regression.test.js',
  'node tests/coach-page-data-hotfix.test.js',
  'node tests/column-projection-read-path.test.js',
  'node tests/permissions-rules.test.js',
  'node tests/public-bypass-entry.test.js',
  'node tests/full-refresh-guard.test.js',
  'node tests/dataset-overwrite-guard.test.js',
  'node tests/perf-regression-guard.test.js',
  'node tests/secondary-index-guard.test.js',
  'node tests/court-account-guard-switches.test.js',
  'node tests/court-account-read-model-guard.test.js',
  'node tests/court-account-hidden-mode-performance-guard.test.js',
  'node tests/login-timeout-hotfix.test.js'
];

assert.match(source, /name:\s*Finance regression guard/i, 'workflow should expose a real finance guard step');
assert.match(source, /npm run guard:finance/, 'workflow should execute the real finance regression script');
assert.match(source, /TZ:\s*Asia\/Shanghai/, 'workflow should run the CI guard in Beijing time');
assert.doesNotMatch(source, /Finance guard placeholder|TODO: 接入真实财务回归脚本后替换本步骤/, 'workflow should not keep placeholder finance guard text');

assert.ok(releaseGuard, 'package.json should expose npm run guard:release');
for (const step of requiredReleaseGuardSteps) {
  assert.ok(releaseGuard.includes(step), `guard:release should include ${step}`);
}
assert.doesNotMatch(releaseGuard, /guard:api-smoke|test:match-real|match-real-link/, 'guard:release should not run online smoke or real database tests');

console.log('ci guard workflow tests passed');
