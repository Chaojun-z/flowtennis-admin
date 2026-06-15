const assert = require('assert');
const fs = require('fs');
const os = require('os');
const path = require('path');
const { spawnSync } = require('child_process');

const repoRoot = path.join(__dirname, '..');
const scriptPath = path.join(repoRoot, 'scripts', 'finance-regression.js');
const baselinePath = path.join(repoRoot, 'config', 'finance-baseline.v2.json');
const snapshotPath = path.join(repoRoot, 'fixtures', 'finance', 'finance-regression-snapshot.v2.json');

const financeRegression = require(scriptPath);

assert.ok(financeRegression.loadJsonFile, 'finance regression script should expose file loader');
assert.ok(financeRegression.computeFinanceMetrics, 'finance regression script should expose metric calculator');
assert.ok(financeRegression.compareMetrics, 'finance regression script should expose metric comparator');

const baseline = financeRegression.loadJsonFile(baselinePath);
const snapshot = financeRegression.loadJsonFile(snapshotPath);
const metrics = financeRegression.computeFinanceMetrics(snapshot);
const comparison = financeRegression.compareMetrics(metrics, baseline.metrics);

assert.strictEqual(baseline.purpose, 'code_regression_guard', 'finance baseline should declare it is a code regression guard sample');
assert.strictEqual(baseline.notOperatingTruth, true, 'finance baseline should not be mistaken for current operating finance truth');
assert.match(
  baseline.notice || '',
  /不是线上经营真实数/,
  'finance baseline notice should warn that fixture numbers are not current operating truth'
);

assert.deepStrictEqual(
  metrics,
  {
    totalRevenue: 978638,
    packageRevenue: 644600,
    courtRevenue: 255038,
    membershipRecharge: 79000,
    transactionCount: 1042
  },
  'finance regression fixture should reproduce the confirmed five finance baseline numbers'
);
assert.deepStrictEqual(comparison, [], 'finance regression fixture should match baseline without drift');

const successRun = spawnSync('node', [scriptPath, '--baseline', baselinePath, '--snapshot', snapshotPath], {
  cwd: repoRoot,
  encoding: 'utf8'
});

assert.strictEqual(successRun.status, 0, `finance regression script should exit 0 on matching fixture: ${successRun.stderr || successRun.stdout}`);
assert.match(successRun.stdout, /finance regression passed/i, 'success output should clearly state pass');
assert.match(successRun.stdout, /代码门禁固定样本/, 'success output should name the baseline as a code guard sample');
assert.match(successRun.stdout, /不是线上经营真实数/, 'success output should warn operators not to read fixture metrics as operating truth');

const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'finance-regression-'));
const mismatchPath = path.join(tmpDir, 'snapshot-mismatch.json');
const mismatchedSnapshot = JSON.parse(JSON.stringify(snapshot));
mismatchedSnapshot.packageRevenueRows[0].recognizedRevenue += 1;
fs.writeFileSync(mismatchPath, JSON.stringify(mismatchedSnapshot, null, 2));

const failedRun = spawnSync('node', [scriptPath, '--baseline', baselinePath, '--snapshot', mismatchPath], {
  cwd: repoRoot,
  encoding: 'utf8'
});

assert.notStrictEqual(failedRun.status, 0, 'finance regression script should exit non-zero on mismatch');
assert.match(failedRun.stderr || failedRun.stdout, /packageRevenue/i, 'mismatch output should identify the drifting metric');

console.log('finance regression script tests passed');
