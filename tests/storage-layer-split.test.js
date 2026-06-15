const assert = require('assert');
const fs = require('fs');
const path = require('path');

const root = path.join(__dirname, '..');
const apiSource = fs.readFileSync(path.join(root, 'api', 'index.js'), 'utf8');
const storagePath = path.join(root, 'api', 'storage.js');

assert.ok(fs.existsSync(storagePath), 'TableStore read/write foundation should live outside api/index.js');

const storageSource = fs.readFileSync(storagePath, 'utf8');

assert.match(apiSource, /require\('\.\/storage'\)/, 'api/index.js should import storage helpers from api/storage.js');
assert.match(storageSource, /function createStorageServices\(/, 'storage module should expose a factory for TableStore helpers');
assert.match(storageSource, /function scan\(t,options=\{\}\)/, 'storage module should own full table scan pagination');
assert.match(storageSource, /function scanFirstRows\(t, \{limit=200, columns=\[\],detectOverflow=false\}=\{\}\)/, 'storage module should own capped production reads');
assert.match(storageSource, /function getCachedScan\(t,options=\{\}\)/, 'storage module should own hot scan cache reads');
assert.match(storageSource, /function getCachedRow\(t,id\)/, 'storage module should own hot row cache reads');
assert.match(storageSource, /function put\(t,id,attrs\)/, 'storage module should own writes and cache invalidation');
assert.match(storageSource, /function del\(t,id\)/, 'storage module should own deletes and cache invalidation');

console.log('storage layer split tests passed');
