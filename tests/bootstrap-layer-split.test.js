const assert = require('assert');
const fs = require('fs');
const path = require('path');

const repoRoot = path.resolve(__dirname, '..');
const apiSource = fs.readFileSync(path.join(repoRoot, 'api/index.js'), 'utf8');
const bootstrapPath = path.join(repoRoot, 'server/bootstrap.js');

assert.ok(fs.existsSync(bootstrapPath), 'server/bootstrap.js should own startup and auto-repair logic');

const bootstrapSource = fs.readFileSync(bootstrapPath, 'utf8');

assert.match(apiSource, /require\('\.\.\/server\/bootstrap'\)/, 'api/index.js should import bootstrap runtime from server/bootstrap.js');
assert.match(bootstrapSource, /function createBootstrapRuntime/, 'bootstrap module should expose a runtime factory');
assert.match(bootstrapSource, /function buildBootstrapSafetyFlags/, 'bootstrap module should own bootstrap safety flags');
assert.match(bootstrapSource, /async function init/, 'bootstrap module should own init');
assert.match(bootstrapSource, /async function bootstrapMabaoFinanceSeed/, 'bootstrap module should own mabao finance seed bootstrap');
assert.match(bootstrapSource, /async function repairImportedLedgerDuplicates/, 'bootstrap module should own imported ledger repair');
assert.doesNotMatch(apiSource, /async function bootstrapMabaoFinanceSeed/, 'api/index.js should not keep mabao finance seed bootstrap inline');
assert.doesNotMatch(apiSource, /async function repairImportedLedgerDuplicates/, 'api/index.js should not keep imported ledger repair inline');

console.log('bootstrap-layer-split tests passed');
