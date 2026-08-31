const assert = require('assert');
const fs = require('fs');
const path = require('path');

const repoRoot = path.resolve(__dirname, '..');
const source = fs.readFileSync(path.join(repoRoot, 'server', 'students-routes.js'), 'utf8');

const start = source.indexOf('async function findStudentDuplicate(');
assert.notStrictEqual(start, -1, 'findStudentDuplicate should exist');
const next = source.indexOf('\n  function studentIdentityChanged', start + 1);
const body = source.slice(start, next === -1 ? source.length : next);

assert.match(body, /getFastStudentsRead\(\)/, 'duplicate lookup should use the fast student read path');
assert.doesNotMatch(body, /scan\(T_STUDENTS\)/, 'duplicate lookup should not scan the full student table');

console.log('student duplicate lookup tests passed');
