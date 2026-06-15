const assert = require('assert');
const fs = require('fs');
const path = require('path');

const source = fs.readFileSync(path.join(__dirname, '../server/storage.js'), 'utf8');

assert.match(source, /const STORAGE_OPERATION_TIMEOUT_MS = Math\.max\(1000, parseInt\(process\.env\.STORAGE_OPERATION_TIMEOUT_MS \|\| '10000', 10\) \|\| 10000\);/, 'storage operations should have a 10s default hard timeout');
assert.match(source, /function runStorageOperation\(op,meta,executor\)/, 'storage wrapper should centralize timeout handling');
assert.match(source, /\[storage-timeout\] op=\$\{op\}/, 'storage timeout log should record the operation name');
assert.match(source, /\[storage-error\] op=\$\{op\}/, 'storage errors should be logged with operation context');
assert.match(source, /\[storage-retry\] attempt \$\{attempt\}\/\$\{maxAttempts\}/, 'storage retries should emit attempt logs');

console.log('storage timeout logging tests passed');
