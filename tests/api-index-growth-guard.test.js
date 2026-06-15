const assert = require('assert');
const fs = require('fs');
const path = require('path');

const root = path.join(__dirname, '..');
const apiIndexPath = path.join(root, 'api', 'index.js');
const budgetPath = path.join(root, 'config', 'api-index-budget.json');

assert.ok(fs.existsSync(budgetPath), 'api/index.js must have an explicit line budget');

const budget = JSON.parse(fs.readFileSync(budgetPath, 'utf8'));
const apiIndexLineCount = fs.readFileSync(apiIndexPath, 'utf8').split(/\r?\n/).length;

assert.strictEqual(typeof budget.maxLines, 'number', 'api/index.js line budget must define maxLines');
assert.ok(budget.maxLines <= 11250, 'api/index.js line budget must not grow beyond the current safety ceiling');
assert.ok(
  apiIndexLineCount <= budget.maxLines,
  `api/index.js has ${apiIndexLineCount} lines, exceeding budget ${budget.maxLines}`
);

assert.ok(
  Array.isArray(budget.extractedModules) && budget.extractedModules.length >= 4,
  'api/index.js budget must list extracted ownership modules'
);

for (const modulePath of budget.extractedModules) {
  assert.ok(fs.existsSync(path.join(root, modulePath)), `expected extracted module to exist: ${modulePath}`);
}
