const assert = require('assert');
const api = require('../api/index.js');

const rules = api._test;

assert.ok(rules, 'api._test should expose student page rule helpers');
assert.ok(rules.assertStudentWriteAccess, 'student write access helper should be exposed');

assert.doesNotThrow(
  () => rules.assertStudentWriteAccess({ role: 'admin', name: '管理员' }),
  'admin should be allowed to write student records'
);

assert.throws(
  () => rules.assertStudentWriteAccess({ role: 'editor', name: '教练' }),
  /无权限/,
  'non-admin should not be allowed to write student records'
);

assert.throws(
  () => rules.assertStudentWriteAccess(null),
  /无权限/,
  'anonymous user should not be allowed to write student records'
);

console.log('student page rules tests passed');
