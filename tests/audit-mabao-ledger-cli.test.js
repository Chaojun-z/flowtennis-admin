const assert = require('assert');
const fs = require('fs');
const os = require('os');
const path = require('path');
const { execFileSync } = require('child_process');

const repoRoot = path.join(__dirname, '..');
const scriptPath = path.join(repoRoot, 'scripts/audit-mabao-ledger.js');
const outputDir = fs.mkdtempSync(path.join(os.tmpdir(), 'mabao-audit-test-'));

const runOutput = execFileSync('node', [
  scriptPath,
  '--booking-csv', '/Users/shaobaolu/Downloads/网球兄弟·马坡收入记录 - 底表 (2).csv',
  '--purchase-csv', '/Users/shaobaolu/Downloads/网球兄弟·马坡私教名单 - 私教课学员.csv',
  '--stats-csv', '/Users/shaobaolu/Downloads/网球兄弟·马坡私教名单 - 课时统计.csv',
  '--detail-csv', '/Users/shaobaolu/Downloads/网球兄弟·马坡私教名单 - Halena、Willian.csv',
  '--detail-csv-2', '/Users/shaobaolu/Downloads/网球兄弟·马坡私教名单 - Lam、Loon.csv',
  '--seed-json', path.join(repoRoot, 'api/seeds/mabao-finance-seed.json'),
  '--output-dir', outputDir
], {
  cwd: repoRoot,
  encoding: 'utf8'
});

const summary = JSON.parse(runOutput);
assert.ok(summary.tableFactRows > 0, 'alias csv args should let the script load table rows');
assert.ok(summary.systemFactRows > 0, 'seed json should load system rows');
assert.ok(fs.existsSync(path.join(outputDir, 'summary_diff_by_month_and_type.csv')), 'script should write summary diff csv');

const summaryDiffCsv = fs.readFileSync(path.join(outputDir, 'summary_diff_by_month_and_type.csv'), 'utf8');
assert.doesNotMatch(summaryDiffCsv, /^"周[一二三四五六日天]"/m, 'weekday labels should not leak into month summary');
assert.doesNotMatch(summaryDiffCsv, /^"3月12"/m, 'month summary should normalize purchase dates before grouping');

console.log('audit mabao ledger cli test passed');
