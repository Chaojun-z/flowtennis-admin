const assert = require('assert');
const fs = require('fs');
const path = require('path');

const repoRoot = path.resolve(__dirname, '..');
const apiSource = fs.readFileSync(path.join(repoRoot, 'api/index.js'), 'utf8');
const membershipPath = path.join(repoRoot, 'api/membership.js');

assert.ok(fs.existsSync(membershipPath), 'api/membership.js should own membership plans, accounts, orders and benefit ledger rules');

const membershipSource = fs.readFileSync(membershipPath, 'utf8');

assert.match(apiSource, /require\('\.\/membership'\)/, 'api/index.js should import membership rules from api/membership.js');
assert.match(membershipSource, /function createMembershipRules/, 'membership module should expose a rule factory');
assert.match(membershipSource, /function normalizeMembershipBenefitTemplate/, 'membership module should own benefit template normalization');
assert.match(membershipSource, /function buildMembershipPlanRecord/, 'membership module should own plan record creation');
assert.match(membershipSource, /function buildMembershipPurchase/, 'membership module should own order/account/history creation');
assert.match(membershipSource, /function allocateMembershipBenefitUsage/, 'membership module should own benefit ledger consumption');
assert.doesNotMatch(apiSource, /function normalizeMembershipBenefitTemplate/, 'api/index.js should not keep benefit template normalization inline');
assert.doesNotMatch(apiSource, /function buildMembershipPlanRecord/, 'api/index.js should not keep membership plan creation inline');
assert.doesNotMatch(apiSource, /function buildMembershipPurchase/, 'api/index.js should not keep membership purchase creation inline');
assert.doesNotMatch(apiSource, /function allocateMembershipBenefitUsage/, 'api/index.js should not keep benefit ledger consumption inline');

console.log('membership-layer-split tests passed');
