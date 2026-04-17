const assert = require('assert');
const fs = require('fs');
const path = require('path');

const apiSource = fs.readFileSync(path.join(__dirname, '../api/index.js'), 'utf8');

assert.match(apiSource, /const ENABLE_RUNTIME_TABLE_ENSURE = process\.env\.ENABLE_RUNTIME_TABLE_ENSURE === 'true';/, 'api should expose a dedicated runtime table ensure switch');
assert.match(apiSource, /if\(ENABLE_RUNTIME_TABLE_ENSURE\|\|ENABLE_TABLE_BOOTSTRAP\)\{\s*for\(const t of RUNTIME_ENSURED_TABLES\)await mkTable\(t\);/s, 'init should only run runtime table ensure when explicit switch is enabled');
assert.doesNotMatch(apiSource, /for\(const t of RUNTIME_ENSURED_TABLES\)await mkTable\(t\);\s*if\(ENABLE_TABLE_BOOTSTRAP\)/, 'init should not unconditionally ensure runtime tables before bootstrap flag check');

console.log('init performance guard tests passed');
