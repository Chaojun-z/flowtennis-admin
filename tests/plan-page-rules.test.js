const assert = require('assert');
const api = require('../api/index.js');

const rules = api._test;

assert.ok(rules, 'api._test should expose helpers');
assert.ok(rules.assertPlanWriteForbidden, 'plan write guard helper should be exposed');

assert.doesNotThrow(
  () => rules.assertPlanWriteForbidden('GET'),
  'GET should stay readable'
);

for (const method of ['POST', 'PUT', 'DELETE']) {
  assert.throws(
    () => rules.assertPlanWriteForbidden(method),
    /学习计划由班次自动生成/,
    `${method} should be blocked for plan writes`
  );
}

console.log('plan page rules tests passed');
