const assert = require('assert');
const fs = require('fs');
const os = require('os');
const path = require('path');
const { spawnSync } = require('child_process');

const repoRoot = path.join(__dirname, '..');
const scriptPath = path.join(repoRoot, 'scripts', 'rollback-finance-operation-dry-run.js');
const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'rollback-finance-dry-run-'));
const snapshotPath = path.join(tmpDir, 'snapshot.json');

const snapshot = {
  schemaVersion: 1,
  generatedAt: '2026-06-14 10:00:00',
  tables: {
    ft_purchases: {
      rowCount: 2,
      rows: [
        { id: 'purchase-op-1', operationId: 'op-rollback-1', batchId: 'batch-rollback-1' },
        { id: 'purchase-other', operationId: 'op-other', batchId: 'batch-other' }
      ]
    },
    ft_entitlements: {
      rowCount: 1,
      rows: [
        { id: 'entitlement-op-1', operationId: 'op-rollback-1', batchId: 'batch-rollback-1' }
      ]
    },
    ft_courts: {
      rowCount: 1,
      rows: [
        {
          id: 'court-1',
          history: [
            { id: 'court-history-op-1', operationId: 'op-rollback-1', batchId: 'batch-rollback-1', amount: 100 },
            { id: 'court-history-other', operationId: 'op-other', batchId: 'batch-other' }
          ]
        }
      ]
    },
    ft_membership_orders: { rowCount: 0, rows: [] },
    ft_membership_accounts: { rowCount: 0, rows: [] },
    ft_membership_benefit_ledger: { rowCount: 0, rows: [] },
    ft_entitlement_ledger: { rowCount: 0, rows: [] },
    ft_schedule: { rowCount: 0, rows: [] }
  },
  financePage: {
    normalizedRows: [
      { id: 'finance-row-op-1', operationId: 'op-rollback-1', batchId: 'batch-rollback-1' },
      { id: 'finance-row-other', operationId: 'op-other', batchId: 'batch-other' }
    ]
  }
};

fs.writeFileSync(snapshotPath, `${JSON.stringify(snapshot, null, 2)}\n`);

const byOperation = spawnSync('node', [
  'scripts/rollback-finance-operation-dry-run.js',
  '--snapshot',
  snapshotPath,
  '--operation-id',
  'op-rollback-1'
], { cwd: repoRoot, encoding: 'utf8' });

assert.strictEqual(byOperation.status, 0, byOperation.stderr || byOperation.stdout);
assert.match(byOperation.stdout, /DRY-RUN/);
assert.match(byOperation.stdout, /operationId: op-rollback-1/);
assert.match(byOperation.stdout, /ft_purchases[\s\S]*purchase-op-1/);
assert.match(byOperation.stdout, /ft_entitlements[\s\S]*entitlement-op-1/);
assert.match(byOperation.stdout, /ft_courts\.history[\s\S]*court-1#court-history-op-1/);
assert.match(byOperation.stdout, /financePage\.normalizedRows[\s\S]*finance-row-op-1/);
assert.match(byOperation.stdout, /新增类记录[\s\S]*建议删除或冲正/);
assert.match(byOperation.stdout, /更新类记录[\s\S]*需要从快照\/历史恢复/);
assert.match(byOperation.stdout, /财务流水类记录[\s\S]*禁止直接删除[\s\S]*反向冲正/);
assert.doesNotMatch(byOperation.stdout, /purchase-other|finance-row-other|court-history-other/);

const byBatch = spawnSync('node', [
  'scripts/rollback-finance-operation-dry-run.js',
  '--snapshot',
  snapshotPath,
  '--batch-id',
  'batch-rollback-1'
], { cwd: repoRoot, encoding: 'utf8' });

assert.strictEqual(byBatch.status, 0, byBatch.stderr || byBatch.stdout);
assert.match(byBatch.stdout, /batchId: batch-rollback-1/);
assert.match(byBatch.stdout, /purchase-op-1/);

const notFound = spawnSync('node', [
  'scripts/rollback-finance-operation-dry-run.js',
  '--snapshot',
  snapshotPath,
  '--operation-id',
  'op-missing'
], { cwd: repoRoot, encoding: 'utf8' });

assert.notStrictEqual(notFound.status, 0, 'dry-run should fail when operationId is absent');
assert.match(notFound.stderr || notFound.stdout, /找不到 operationId: op-missing/);
assert.match(notFound.stderr || notFound.stdout, /禁止猜测/);

const source = fs.readFileSync(scriptPath, 'utf8');
assert.doesNotMatch(source, /require\(['"](?:tablestore|axios|express|pg)['"]\)/, 'dry-run script must not import online or database clients');
assert.doesNotMatch(source, /\bput\(|\bdel\(|\bdeleteRow\b|\bupdateRow\b/, 'dry-run script must not contain write helpers');

console.log('rollback finance operation dry-run script tests passed');
