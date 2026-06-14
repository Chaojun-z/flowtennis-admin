const assert = require('assert');
const fs = require('fs');
const os = require('os');
const path = require('path');

const {
  parseArgs,
  run
} = require('../scripts/repair-mabao-duplicate-courts-20260524');

const now = '2026-06-14T10:30:00.000Z';
const target = {
  onlineEndpoint: 'https://flowtennis-ue.us-east-1.ots.aliyuncs.com',
  onlineInstance: 'flowtennis-ue',
  localEndpoint: 'https://flowtennis-ue.us-east-1.ots.aliyuncs.com',
  localInstance: 'flowtennis-ue'
};

const data = {
  courts: [
    {
      id: 'court-target',
      name: '散客王',
      status: 'active',
      history: [{ id: 'history-existing', type: '消费', category: '订场', payMethod: '微信', amount: 100 }]
    },
    {
      id: 'private_lesson_csv_import_20260524-court-source',
      name: '散客王',
      status: 'active',
      history: [{ id: 'history-import', type: '消费', category: '订场', payMethod: '微信', amount: 200, seedTag: 'mabao-finance-import-20260524' }]
    }
  ],
  membershipAccounts: [],
  membershipOrders: [],
  membershipBenefitLedger: [],
  membershipAccountEvents: []
};

function fakeMergeCourtRecords({ targetCourt, sourceCourt, now: mergeNow }) {
  return {
    targetCourt: {
      ...targetCourt,
      history: [...(targetCourt.history || []), ...(sourceCourt.history || [])],
      updatedAt: mergeNow
    },
    sourceCourt: {
      ...sourceCourt,
      mergedIntoCourtId: targetCourt.id,
      status: 'inactive',
      updatedAt: mergeNow
    },
    membershipAccounts: [],
    membershipOrders: [],
    membershipBenefitLedger: [],
    membershipAccountEvents: []
  };
}

function makeDeps(overrides = {}) {
  const writes = [];
  const reportDir = fs.mkdtempSync(path.join(os.tmpdir(), 'mabao-duplicate-courts-report-'));
  return {
    writes,
    deps: {
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
      mergeCourtRecords: fakeMergeCourtRecords,
      writeRow: async (client, tableName, row) => {
        writes.push({ tableName, row });
      },
      reportDir,
      ...overrides
    }
  };
}

async function testDefaultDryRunDoesNotWrite() {
  const { writes, deps } = makeDeps();
  const result = await run([], deps);

  assert.strictEqual(result.report.mode, 'dry-run');
  assert.strictEqual(writes.length, 0, 'default dry-run must not write');
  assert.ok(result.report.operationId);
  assert.ok(result.report.batchId);
  assert.strictEqual(JSON.parse(fs.readFileSync(result.reportPath, 'utf8')).batchId, result.report.batchId);
}

async function testWriteAddsHistoryTraceAndReport() {
  const { writes, deps } = makeDeps();
  const result = await run(['--write'], deps);

  assert.strictEqual(result.report.mode, 'write');
  assert.strictEqual(result.report.batchId, `batch-${result.report.operationId}`);
  assert.strictEqual(writes.length, 2, '--write should write target and source court rows');
  for (const item of writes) {
    assert.strictEqual(item.tableName, 'ft_courts');
    assert.strictEqual(item.row.operationId, result.report.operationId);
    assert.strictEqual(item.row.batchId, result.report.batchId);
  }
  assert.ok(writes.some((item) => item.row.history.some((row) => row.id === 'history-import' && row.operationId === result.report.operationId && row.batchId === result.report.batchId)), 'merged history row should carry trace');
  assert.strictEqual(result.report.tables.ft_courts, 2);
  assert.strictEqual(JSON.parse(fs.readFileSync(result.reportPath, 'utf8')).batchId, result.report.batchId);
}

async function main() {
  assert.deepStrictEqual(parseArgs([]), { write: false, dryRun: true });
  assert.deepStrictEqual(parseArgs(['--write']), { write: true, dryRun: false });
  await testDefaultDryRunDoesNotWrite();
  await testWriteAddsHistoryTraceAndReport();
  console.log('mabao duplicate courts repair script tests passed');
}

main().catch((err) => {
  console.error(err && err.stack ? err.stack : String(err));
  process.exit(1);
});
