const assert = require('assert');
const fs = require('fs');
const path = require('path');

const repoRoot = path.resolve(__dirname, '..');
const budgetPath = path.join(repoRoot, 'config/source-file-budget.json');

assert.ok(fs.existsSync(budgetPath), 'source file budget config should exist');

const budget = JSON.parse(fs.readFileSync(budgetPath, 'utf8'));

assert.ok(Array.isArray(budget.files) && budget.files.length > 0, 'source file budget should list guarded files');

for (const item of budget.files) {
  assert.ok(item.path, 'each budget item should define path');
  assert.strictEqual(typeof item.maxLines, 'number', `${item.path} should define maxLines`);
  assert.ok(item.maxLines > 0, `${item.path} maxLines should be positive`);
  const filePath = path.join(repoRoot, item.path);
  assert.ok(fs.existsSync(filePath), `guarded file should exist: ${item.path}`);
  const lines = fs.readFileSync(filePath, 'utf8').split(/\r?\n/).length;
  assert.ok(lines <= item.maxLines, `${item.path} has ${lines} lines, exceeding budget ${item.maxLines}`);
}

console.log('source file budget tests passed');
