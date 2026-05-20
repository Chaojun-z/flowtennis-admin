const assert = require('assert');
const fs = require('fs');
const path = require('path');

const workflowPath = path.join(__dirname, '..', '.github', 'workflows', 'ci-guard.yml');
const source = fs.readFileSync(workflowPath, 'utf8');

assert.match(source, /name:\s*Finance regression guard/i, 'workflow should expose a real finance guard step');
assert.match(source, /npm run guard:finance/, 'workflow should execute the real finance regression script');
assert.match(source, /TZ:\s*Asia\/Shanghai/, 'workflow should run the CI guard in Beijing time');
assert.doesNotMatch(source, /Finance guard placeholder|TODO: 接入真实财务回归脚本后替换本步骤/, 'workflow should not keep placeholder finance guard text');

console.log('ci guard workflow tests passed');
