const assert = require('assert');
const fs = require('fs');
const os = require('os');
const path = require('path');
const { spawnSync } = require('child_process');

function makeSnapshot(cash, purchases) {
  return {
    schemaVersion: 1,
    environment: { tsInstance: 'flowtennis-ue' },
    tables: {
      ft_courts: { rowCount: 0, rows: [] },
      ft_membership_accounts: { rowCount: 0, rows: [] },
      ft_membership_orders: { rowCount: 0, rows: [] },
      ft_membership_benefit_ledger: { rowCount: 0, rows: [] },
      ft_purchases: { rowCount: purchases.length, rows: purchases },
      ft_entitlements: { rowCount: purchases.length, rows: purchases.map((row) => ({ id: `ent-${row.id}`, operationId: row.operationId, batchId: row.batchId })) },
      ft_entitlement_ledger: { rowCount: 0, rows: [] },
      ft_schedule: { rowCount: 0, rows: [] }
    },
    financePage: {
      normalizedRows: purchases.map((row) => ({ id: `finance-${row.id}`, businessType: '课程', action: '收款', operationId: row.operationId, batchId: row.batchId, cashDelta: row.amountPaid || 0, deferredRevenueDelta: row.amountPaid || 0 }))
    },
    summary: {
      financeOverview: {
        cash,
        recognized: 0,
        deferred: cash,
        packageIncome: cash,
        packageRecognized: 0
      }
    }
  };
}

const repoRoot = path.join(__dirname, '..');
const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'finance-operation-validation-'));
const beforePath = path.join(tmpDir, 'before.json');
const afterPath = path.join(tmpDir, 'after.json');

fs.writeFileSync(beforePath, JSON.stringify(makeSnapshot(1000, [{ id: 'old' }]), null, 2));
fs.writeFileSync(afterPath, JSON.stringify(makeSnapshot(1400, [
  { id: 'old' },
  { id: 'new', operationId: 'op-script-1', batchId: 'batch-script-1', amountPaid: 400 }
]), null, 2));

const run = spawnSync('node', [
  'scripts/validate-finance-operation.js',
  '--before', beforePath,
  '--after', afterPath,
  '--type', 'package-purchase',
  '--amount', '400'
], { cwd: repoRoot, encoding: 'utf8' });

assert.strictEqual(run.status, 0, run.stderr || run.stdout);
assert.match(run.stdout, /"ok": true/);
assert.match(run.stdout, /"operationType": "package-purchase"/);

const failRun = spawnSync('node', [
  'scripts/validate-finance-operation.js',
  '--before', beforePath,
  '--after', beforePath,
  '--type', 'package-purchase',
  '--amount', '400'
], { cwd: repoRoot, encoding: 'utf8' });

assert.notStrictEqual(failRun.status, 0, 'validation script should fail when finance and business data did not change');
assert.match(failRun.stderr || failRun.stdout, /ft_purchases|财务流水|cash/);

const operationRun = spawnSync('node', [
  'scripts/validate-finance-operation.js',
  '--before', beforePath,
  '--after', afterPath,
  '--operation-id', 'op-script-1'
], { cwd: repoRoot, encoding: 'utf8' });

assert.strictEqual(operationRun.status, 0, operationRun.stderr || operationRun.stdout);
assert.match(operationRun.stdout, /"ok": true/);
assert.match(operationRun.stdout, /"operationId": "op-script-1"/);
assert.match(operationRun.stdout, /"ft_purchases"[\s\S]*"new"/);
assert.match(operationRun.stdout, /"financePage\.normalizedRows"[\s\S]*"finance-new"/);
assert.match(operationRun.stdout, /"cash": 400/);

const batchRun = spawnSync('node', [
  'scripts/validate-finance-operation.js',
  '--before', beforePath,
  '--after', afterPath,
  '--batch-id', 'batch-script-1'
], { cwd: repoRoot, encoding: 'utf8' });

assert.strictEqual(batchRun.status, 0, batchRun.stderr || batchRun.stdout);
assert.match(batchRun.stdout, /"batchId": "batch-script-1"/);
assert.match(batchRun.stdout, /"ft_purchases"[\s\S]*"new"/);

const missingOperationRun = spawnSync('node', [
  'scripts/validate-finance-operation.js',
  '--before', beforePath,
  '--after', afterPath,
  '--operation-id', 'op-missing'
], { cwd: repoRoot, encoding: 'utf8' });

assert.notStrictEqual(missingOperationRun.status, 0, 'operationId validation should fail when no records match');
assert.match(missingOperationRun.stderr || missingOperationRun.stdout, /找不到 operationId: op-missing[\s\S]*禁止猜测/);

const ambiguousRun = spawnSync('node', [
  'scripts/validate-finance-operation.js',
  '--before', beforePath,
  '--after', afterPath,
  '--operation-id', 'op-script-1',
  '--batch-id', 'batch-script-1'
], { cwd: repoRoot, encoding: 'utf8' });

assert.notStrictEqual(ambiguousRun.status, 0, 'script should reject operationId and batchId together');
assert.match(ambiguousRun.stderr || ambiguousRun.stdout, /operationId 和 batchId 不能同时提供/);

const scriptSource = fs.readFileSync(path.join(repoRoot, 'scripts', 'validate-finance-operation.js'), 'utf8');
assert.doesNotMatch(scriptSource, /require\(['"](?:tablestore|axios|express|pg)['"]\)/, 'validation script must not import online or database clients');

console.log('finance operation validation script tests passed');
