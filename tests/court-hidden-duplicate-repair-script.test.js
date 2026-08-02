const assert = require('assert');
const fs = require('fs');
const os = require('os');
const path = require('path');

const {
  buildRepairPlan,
  writeWithRetry,
  run
} = require('../scripts/repair-court-hidden-duplicate-profiles-20260802');

const now = '2026-08-02 10:00:00';
const target = {
  onlineEndpoint: 'https://flowtennis-ue.us-east-1.ots.aliyuncs.com',
  onlineInstance: 'flowtennis-ue',
  localEndpoint: 'https://flowtennis-ue.us-east-1.ots.aliyuncs.com',
  localInstance: 'flowtennis-ue'
};

const data = {
  courts: [
    { id: 'court-yanuoda-active', name: '呀诺达 订场', campus: 'shunyi_mapo', status: 'active', history: [{ id: 'h-active', date: '2026-02-28', type: '消费', category: '订场', payMethod: '微信', amount: 1240 }] },
    { id: 'court-yanuoda-hidden', name: '呀诺达', campus: 'shunyi_mapo', status: 'inactive', deletedAt: '2026-07-01', history: [{ id: 'h-hidden', date: '2026-02-20', type: '消费', category: '订场', payMethod: '微信', amount: 100 }] },
    { id: 'court-ambiguous-active', name: '王 订场', campus: 'shunyi_mapo', status: 'active', history: [] },
    { id: 'court-ambiguous-hidden', name: '王', campus: 'shunyi_mapo', status: 'inactive', history: [] },
    { id: 'court-two-active-a', name: '张三', campus: 'shunyi_mapo', status: 'active', history: [] },
    { id: 'court-two-active-b', name: '张三 订场', campus: 'shunyi_mapo', status: 'active', history: [] }
  ],
  membershipAccounts: [],
  membershipOrders: [],
  membershipBenefitLedger: [],
  membershipAccountEvents: []
};

function makeDeps(overrides = {}) {
  const writes = [];
  const reportDir = fs.mkdtempSync(path.join(os.tmpdir(), 'court-hidden-duplicate-repair-'));
  const deps = {
    now,
    loadEnv: () => {},
    assertProductionTarget: async () => target,
    createClientFromEnv: () => ({ fake: true }),
    scanTable: async (client, tableName) => {
      if (tableName === 'ft_courts') return data.courts;
      if (tableName === 'ft_membership_accounts') return data.membershipAccounts;
      if (tableName === 'ft_membership_orders') return data.membershipOrders;
      if (tableName === 'ft_membership_benefit_ledger') return data.membershipBenefitLedger;
      if (tableName === 'ft_membership_account_events') return data.membershipAccountEvents;
      return [];
    },
    putRow: async (client, tableName, row) => writes.push({ tableName, row }),
    reportPath: path.join(reportDir, 'report.json'),
    ...overrides
  };
  return { writes, deps };
}

const plan = buildRepairPlan(data);
assert.strictEqual(plan.plans.length, 1, 'only one active + hidden non-ambiguous group should be auto-repairable');
assert.strictEqual(plan.plans[0].target.id, 'court-yanuoda-active', 'active row should stay as the target');
assert.strictEqual(plan.plans[0].sources[0].id, 'court-yanuoda-hidden', 'hidden matching row should be merged into target');
assert.ok(plan.skipped.some(item => item.reason.includes('不是')), 'two-active groups should be skipped');
assert.ok(!plan.plans.some(item => item.key.includes('王')), 'ambiguous one-character names must not be auto-repaired');

const idempotentPlan = buildRepairPlan({
  ...data,
  courts: [
    { id: 'court-yanuoda-active', name: '呀诺达 订场', campus: 'shunyi_mapo', status: 'active', history: [{ id: 'h-active', date: '2026-02-28', type: '消费', category: '订场', payMethod: '微信', amount: 1240 }, { id: 'h-hidden', date: '2026-02-20', type: '消费', category: '订场', payMethod: '微信', amount: 100 }] },
    { id: 'court-yanuoda-hidden', name: '呀诺达', campus: 'shunyi_mapo', status: 'inactive', mergedIntoCourtId: 'court-yanuoda-active', history: [{ id: 'h-hidden', date: '2026-02-20', type: '消费', category: '订场', payMethod: '微信', amount: 100 }] }
  ]
});
assert.strictEqual(idempotentPlan.plans.length, 0, 'already merged hidden profiles must not be repaired again');
assert.ok(idempotentPlan.skipped.some(item => item.reason.includes('无需重复处理')), 'idempotent skip should be explicit');

async function testDryRunDoesNotWrite() {
  const { writes, deps } = makeDeps();
  const result = await run([], deps);
  assert.strictEqual(result.report.mode, 'dry-run');
  assert.strictEqual(writes.length, 0, 'dry-run must not write');
  assert.strictEqual(result.report.summary.safeGroups, 1);
  assert.strictEqual(result.report.summary.sourceCourtsToArchive, 1);
  assert.strictEqual(result.report.backupBefore.courts.length, 2, 'report must keep full before rows for rollback');
  assert.strictEqual(result.report.plannedWrites.courts.length, 2, 'report must keep planned write rows for audit');
  assert.ok(fs.existsSync(result.reportPath), 'dry-run should still write an audit report');
}

async function testWriteTracesEveryChangedRow() {
  const { writes, deps } = makeDeps();
  const result = await run(['--write'], deps);
  assert.strictEqual(result.report.mode, 'write');
  assert.ok(result.report.batchId.startsWith('batch-'));
  assert.strictEqual(writes.length, 2, 'write should update target and archived source court');
  assert.ok(writes.some(item => item.row.id === 'court-yanuoda-active' && item.row.history.some(row => row.id === 'h-hidden')), 'target should receive hidden history');
  assert.ok(writes.some(item => item.row.id === 'court-yanuoda-hidden' && item.row.mergedIntoCourtId === 'court-yanuoda-active'), 'source should be archived into target');
  writes.forEach(item => {
    assert.strictEqual(item.row.operationId, result.report.operationId);
    assert.strictEqual(item.row.batchId, result.report.batchId);
  });
}

async function testWriteRetryForTransientNetworkError() {
  let calls = 0;
  await writeWithRetry(async () => {
    calls += 1;
    if (calls === 1) throw new Error('Client network socket disconnected before secure TLS connection was established');
  }, {}, 'ft_courts', { id: 'retry-row' }, 2);
  assert.strictEqual(calls, 2, 'transient TableStore write errors should retry once');
}

async function main() {
  await testDryRunDoesNotWrite();
  await testWriteTracesEveryChangedRow();
  await testWriteRetryForTransientNetworkError();
  console.log('court hidden duplicate repair script tests passed');
}

main().catch(err => {
  console.error(err && err.stack ? err.stack : String(err));
  process.exit(1);
});
