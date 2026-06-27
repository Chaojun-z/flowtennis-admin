const assert = require('assert');
const fs = require('fs');
const os = require('os');
const path = require('path');
const { spawnSync } = require('child_process');

const repoRoot = path.join(__dirname, '..');
const scriptPath = path.join(repoRoot, 'scripts', 'render-finance-ledger-compare-report.js');
const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'finance-ledger-compare-report-'));
const snapshotPath = path.join(tmpDir, 'snapshot.json');

fs.writeFileSync(snapshotPath, JSON.stringify({
  snapshotDate: '2026-06-14',
  generatedAt: '2026-06-14 10:00:00',
  financePage: {
    normalizedRows: [{
      id: 'finance-row-1',
      businessType: '课程',
      action: '收款',
      cashDelta: 1000,
      recognizedRevenueDelta: 0,
      deferredRevenueDelta: 1000,
      sourceDocument: '购买记录 purchase-1',
      operationId: 'op-purchase-1',
      batchId: 'batch-purchase-1'
    }]
  },
  shadowLedgerRows: [{
    id: 'shadow-finance-row-1',
    status: 'active',
    operationId: 'op-purchase-1',
    batchId: 'batch-purchase-1',
    businessType: '课程',
    actionType: '收款',
    ledgerType: 'package_receipt',
    sourceType: 'purchase',
    sourceId: 'purchase-1',
    sourceSubId: '',
    cashDelta: 90000,
    recognizedRevenueDelta: 10000,
    deferredRevenueDelta: 80000,
    sourceSnapshot: {
      financeNormalizedRowId: 'finance-row-1',
      sourceDocument: '购买记录 purchase-1'
    },
    idempotencyKey: 'purchase|purchase-1||package_receipt'
  }],
  shadowLedgerCompareReport: {
    ok: false,
    legacySummary: { cash: 1000, recognized: 0, deferred: 1000 },
    shadowSummary: { cash: 900, recognized: 100, deferred: 800 },
    summaryDifference: { cash: -100, recognized: 100, deferred: -200 },
    details: [{
      type: 'amount_mismatch',
      key: 'purchase|purchase-1||package_receipt',
      amountDifference: { cash: -100, recognized: 100, deferred: -200 },
      legacy: { cash: 1000, recognized: 0, deferred: 1000 },
      ledger: { cash: 900, recognized: 100, deferred: 800 }
    }, {
      type: 'missing_ledger',
      key: 'schedule|schedule-1||lesson_consume',
      legacy: {
        operationId: 'op-schedule-1',
        batchId: 'batch-schedule-1'
      }
    }],
    warnings: [{
      type: 'missing_legacy',
      key: 'opening|balance||opening_balance_gap',
      reason: 'opening_balance_gap',
      ledger: {
        operationId: 'op-opening',
        batchId: 'batch-opening'
      }
    }]
  }
}, null, 2));

const missingArgs = spawnSync('node', [scriptPath], { cwd: repoRoot, encoding: 'utf8' });
assert.notStrictEqual(missingArgs.status, 0, 'script should fail without --snapshot');
assert.match(missingArgs.stderr || missingArgs.stdout, /--snapshot/);

const run = spawnSync('node', [scriptPath, '--snapshot', snapshotPath], { cwd: repoRoot, encoding: 'utf8' });
assert.strictEqual(run.status, 1, 'script should exit 1 when compare report is not ok');
assert.match(run.stdout, /# 财务影子账差异报告/);
assert.match(run.stdout, /是否通过：未通过/);
assert.match(run.stdout, /旧账总额/);
assert.match(run.stdout, /影子账总额/);
assert.match(run.stdout, /差异金额/);
assert.match(run.stdout, /\| amount_mismatch \| 1 \|/);
assert.match(run.stdout, /\| missing_ledger \| 1 \|/);
assert.match(run.stdout, /op-purchase-1/);
assert.match(run.stdout, /batch-purchase-1/);
assert.match(run.stdout, /op-schedule-1/);
assert.match(run.stdout, /batch-schedule-1/);
assert.match(run.stdout, /建议阻断发布，暂不切换/);
assert.match(run.stdout, /opening_balance_gap/);

const okPath = path.join(tmpDir, 'ok-snapshot.json');
fs.writeFileSync(okPath, JSON.stringify({
  snapshotDate: '2026-06-14',
  shadowLedgerCompareReport: {
    ok: true,
    legacySummary: { cash: 1000, recognized: 300, deferred: 700 },
    shadowSummary: { cash: 1000, recognized: 300, deferred: 700 },
    summaryDifference: { cash: 0, recognized: 0, deferred: 0 },
    details: [],
    warnings: []
  }
}, null, 2));

const okRun = spawnSync('node', [scriptPath, '--snapshot', okPath], { cwd: repoRoot, encoding: 'utf8' });
assert.strictEqual(okRun.status, 0, okRun.stderr || okRun.stdout);
assert.match(okRun.stdout, /是否通过：通过/);
assert.match(okRun.stdout, /不阻断发布，可继续观察后再切换/);

const scriptSource = fs.readFileSync(scriptPath, 'utf8');
assert.doesNotMatch(scriptSource, /\bput\s*\(/, 'report script must not write rows');
assert.doesNotMatch(scriptSource, /\bdel\s*\(/, 'report script must not delete rows');
assert.doesNotMatch(scriptSource, /updateRow/, 'report script must not update rows');
assert.doesNotMatch(scriptSource, /require\(['"](?:tablestore|axios|express|pg)['"]\)/, 'report script must not import online or database clients');

console.log('finance ledger compare report tests passed');
