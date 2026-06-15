const assert = require('assert');
const fs = require('fs');
const path = require('path');

const root = path.join(__dirname, '..');
const apiIndexPath = path.join(root, 'api', 'index.js');
const apiDir = path.join(root, 'api');
const budgetPath = path.join(root, 'config', 'api-index-budget.json');

assert.ok(fs.existsSync(budgetPath), 'api/index.js must have an explicit line budget');

const budget = JSON.parse(fs.readFileSync(budgetPath, 'utf8'));
const apiIndexLineCount = fs.readFileSync(apiIndexPath, 'utf8').split(/\r?\n/).length;
const apiFunctionFiles = fs
  .readdirSync(apiDir, { withFileTypes: true })
  .filter((entry) => entry.isFile() && entry.name.endsWith('.js'))
  .map((entry) => entry.name)
  .sort();

assert.deepStrictEqual(
  apiFunctionFiles,
  ['index.js'],
  `Vercel Hobby only allows 12 serverless functions; keep backend modules outside api/. Found: ${apiFunctionFiles.join(', ')}`
);

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
