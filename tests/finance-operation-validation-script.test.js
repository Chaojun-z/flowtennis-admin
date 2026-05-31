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
      ft_entitlements: { rowCount: purchases.length, rows: purchases.map((row) => ({ id: `ent-${row.id}` })) },
      ft_entitlement_ledger: { rowCount: 0, rows: [] },
      ft_schedule: { rowCount: 0, rows: [] }
    },
    financePage: {
      normalizedRows: purchases.map((row) => ({ id: `finance-${row.id}`, businessType: '课程', action: '收款' }))
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
fs.writeFileSync(afterPath, JSON.stringify(makeSnapshot(1400, [{ id: 'old' }, { id: 'new' }]), null, 2));

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

console.log('finance operation validation script tests passed');
