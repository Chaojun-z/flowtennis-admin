const assert = require('assert');
const fs = require('fs');
const path = require('path');

const repoRoot = path.resolve(__dirname, '..');
const apiSource = fs.readFileSync(path.join(repoRoot, 'api/index.js'), 'utf8');
const packagesPath = path.join(repoRoot, 'server/packages.js');

assert.ok(fs.existsSync(packagesPath), 'server/packages.js should own package purchase entitlement rules');

const packageSource = fs.readFileSync(packagesPath, 'utf8');

assert.match(apiSource, /require\('\.\.\/server\/packages'\)/, 'api/index.js should import package rules from server/packages.js');
assert.match(packageSource, /function createPackageRules/, 'package module should expose a rule factory');
assert.match(packageSource, /function buildEntitlementFromPurchase/, 'package module should own entitlement creation');
assert.match(packageSource, /function buildPurchaseRecord/, 'package module should own purchase record creation');
assert.match(packageSource, /function buildPackageMergeUpdates/, 'package module should own package merge updates');
assert.doesNotMatch(apiSource, /function buildEntitlementFromPurchase/, 'api/index.js should not keep entitlement creation inline');
assert.doesNotMatch(apiSource, /function buildPurchaseRecord/, 'api/index.js should not keep purchase record creation inline');

console.log('package-layer-split tests passed');
