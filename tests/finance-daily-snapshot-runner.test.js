const assert = require('assert');
const fs = require('fs');
const os = require('os');
const path = require('path');

const snapshot = require('../scripts/lib/finance-daily-snapshot');

const scanned = [];
const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'flowtennis-finance-snapshot-'));

snapshot.runFinanceDailySnapshot({
  env: {
    TS_ENDPOINT: 'https://flowtennis-ue.us-east-1.ots.aliyuncs.com',
    TS_INSTANCE: 'flowtennis-ue'
  },
  generatedAt: '2026-05-31T10:11:12.000Z',
  snapshotDate: '2026-05-31',
  baseDir: tmpDir,
  fetchImpl: async () => ({
    ok: true,
    json: async () => ({
      env: {
        TS_ENDPOINT: 'https://flowtennis-ue.us-east-1.ots.aliyuncs.com',
        TS_INSTANCE: 'flowtennis-ue'
      }
    })
  }),
  createClientFromEnv: (env) => ({ target: env.TS_INSTANCE }),
  scanTable: async (client, tableName) => {
    scanned.push(`${client.target}:${tableName}`);
    return tableName === 'ft_purchases' ? [{ id: 'purchase-1', amountPaid: 1000 }] : [];
  },
  buildFinancePageSnapshot: (source) => {
    assert.deepStrictEqual(source.purchases, [{ id: 'purchase-1', amountPaid: 1000 }]);
    return {
      generatedAt: '2026-05-31T10:11:12.000Z',
      financeOverviewData: { all: { cash: 1000, recognized: 0, deferred: 1000 } },
      financeNormalizedRows: [{
        id: 'receipt-1',
        businessType: '课程',
        action: '收款',
        sourceDocument: '购买记录 purchase-1',
        cashDelta: 1000,
        recognizedRevenueDelta: 0,
        deferredRevenueDelta: 1000
      }],
      financeSettlementRows: []
    };
  }
}).then((result) => {
  assert.strictEqual(result.ok, true);
  assert.ok(fs.existsSync(result.outputPath), 'snapshot runner should write a local json file');
  assert.ok(scanned.includes('flowtennis-ue:ft_courts'), 'runner should read court records');
  assert.ok(scanned.includes('flowtennis-ue:ft_campuses'), 'runner should read finance source campuses');
  const saved = JSON.parse(fs.readFileSync(result.outputPath, 'utf8'));
  assert.strictEqual(saved.tables.ft_purchases.rowCount, 1);
  assert.strictEqual(saved.financePage.normalizedRowCount, 1);
  assert.strictEqual(saved.summary.financeOverview.cash, 1000);
  assert.strictEqual(saved.shadowLedgerCompareReport.ok, true);
  assert.strictEqual(saved.shadowLedgerRows.length, 1);
  console.log('finance daily snapshot runner tests passed');
}).catch((error) => {
  console.error(error && error.stack ? error.stack : String(error));
  process.exit(1);
});
