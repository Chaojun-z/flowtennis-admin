const assert = require('assert');
const fs = require('fs');
const os = require('os');
const path = require('path');
const { spawnSync } = require('child_process');

const {
  buildShadowLedgerRowsFromFinanceNormalizedRows
} = require('../scripts/lib/finance-ledger-read-model');

const repoRoot = path.join(__dirname, '..');
const scriptPath = path.join(repoRoot, 'scripts', 'compare-finance-ledger-read-model.js');
const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'finance-ledger-compare-'));
const snapshotPath = path.join(tmpDir, 'snapshot.json');
const mismatchPath = path.join(tmpDir, 'snapshot-mismatch.json');

const financeRows = [
  {
    id: 'finance-row-1',
    businessType: '课程',
    action: '收款',
    cashDelta: 500,
    recognizedRevenueDelta: 0,
    deferredRevenueDelta: 500,
    sourceDocument: '购买记录 p1',
    operationId: 'op-1',
    batchId: 'batch-1'
  }
];

fs.writeFileSync(snapshotPath, JSON.stringify({
  financePage: { normalizedRows: financeRows }
}, null, 2));

const missingArgs = spawnSync('node', [scriptPath], { cwd: repoRoot, encoding: 'utf8' });
assert.notStrictEqual(missingArgs.status, 0, 'script should fail without --snapshot');
assert.match(missingArgs.stderr || missingArgs.stdout, /--snapshot/);

const okRun = spawnSync('node', [scriptPath, '--snapshot', snapshotPath], { cwd: repoRoot, encoding: 'utf8' });
assert.strictEqual(okRun.status, 0, okRun.stderr || okRun.stdout);
const okReport = JSON.parse(okRun.stdout);
assert.strictEqual(okReport.ok, true, 'generated shadow ledger should match legacy rows');
assert.strictEqual(okReport.legacyRowCount, 1);
assert.strictEqual(okReport.shadowLedgerRowCount, 1);

const mismatchedLedgerRows = buildShadowLedgerRowsFromFinanceNormalizedRows(financeRows);
mismatchedLedgerRows[0].cashDelta = 40000;
mismatchedLedgerRows[0].recognizedRevenueDelta = 10000;
mismatchedLedgerRows[0].deferredRevenueDelta = 30000;
fs.writeFileSync(mismatchPath, JSON.stringify({
  financePage: { normalizedRows: financeRows },
  tables: {
    ft_financial_ledger: {
      rows: mismatchedLedgerRows
    }
  }
}, null, 2));

const failedRun = spawnSync('node', [scriptPath, '--snapshot', mismatchPath], { cwd: repoRoot, encoding: 'utf8' });
assert.strictEqual(failedRun.status, 1, 'script should exit 1 when differences exist');
assert.match(failedRun.stdout, /cash/);
assert.match(failedRun.stdout, /recognized/);
assert.match(failedRun.stdout, /deferred/);

const scriptSource = fs.readFileSync(scriptPath, 'utf8');
assert.doesNotMatch(scriptSource, /\bput\s*\(/, 'compare script must not write rows');
assert.doesNotMatch(scriptSource, /\bdel\s*\(/, 'compare script must not delete rows');
assert.doesNotMatch(scriptSource, /updateRow/, 'compare script must not update rows');
assert.doesNotMatch(scriptSource, /require\(['"](?:tablestore|axios|express|pg)['"]\)/, 'compare script must not import online or database clients');

console.log('finance ledger compare script tests passed');
