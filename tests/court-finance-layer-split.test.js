const assert = require('assert');
const fs = require('fs');
const path = require('path');

const repoRoot = path.resolve(__dirname, '..');
const apiSource = fs.readFileSync(path.join(repoRoot, 'api/index.js'), 'utf8');
const courtFinancePath = path.join(repoRoot, 'api/court-finance.js');

assert.ok(fs.existsSync(courtFinancePath), 'api/court-finance.js should own court account, court history and stored-value finance rules');

const courtFinanceSource = fs.readFileSync(courtFinancePath, 'utf8');

assert.match(apiSource, /require\('\.\/court-finance'\)/, 'api/index.js should import court finance rules from api/court-finance.js');
assert.match(courtFinanceSource, /function createCourtFinanceRules/, 'court finance module should expose a rule factory');
assert.match(courtFinanceSource, /function normalizeCourtHistory/, 'court finance module should own court history normalization');
assert.match(courtFinanceSource, /function computeCourtFinance/, 'court finance module should own court finance calculation');
assert.match(courtFinanceSource, /function normalizeCourtRecord/, 'court finance module should own court account normalization');
assert.match(courtFinanceSource, /function buildScheduleStoredValueCourtUpdate/, 'court finance module should own stored-value schedule court updates');
assert.doesNotMatch(apiSource, /function normalizeCourtHistory/, 'api/index.js should not keep court history normalization inline');
assert.doesNotMatch(apiSource, /function computeCourtFinance/, 'api/index.js should not keep court finance calculation inline');
assert.doesNotMatch(apiSource, /function normalizeCourtRecord/, 'api/index.js should not keep court account normalization inline');
assert.doesNotMatch(apiSource, /function buildScheduleStoredValueCourtUpdate/, 'api/index.js should not keep stored-value schedule court updates inline');

console.log('court-finance-layer-split tests passed');
