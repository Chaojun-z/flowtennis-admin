const assert = require('assert');
const fs = require('fs');
const os = require('os');
const path = require('path');

const {
  parseArgs,
  run
} = require('../scripts/repair-shunyi_mapo-court-history-import-20260524');

const now = '2026-06-14 10:00:00';
const target = {
  onlineEndpoint: 'https://flowtennis-ue.us-east-1.ots.aliyuncs.com',
  onlineInstance: 'flowtennis-ue',
  localEndpoint: 'https://flowtennis-ue.us-east-1.ots.aliyuncs.com',
  localInstance: 'flowtennis-ue'
};

const tables = {
  courts: [
    { id: 'court-existing', name: '散客王', campus: 'shunyi_mapo', status: 'active', history: [] }
  ]
};

const sourceRows = [
  {
    __rowNo: 201,
    日期: '2026-05-24',
    时间: '12:00-13:00',
    '客户/学员': '散客王',
    收入类型: '订场',
    支付方式: '微信',
    '实收/核销': '200',
    导入动作: '订场补账',
    最终备注: '测试订场'
  }
];

function makeDeps(overrides = {}) {
  const writes = [];
  const reportDir = fs.mkdtempSync(path.join(os.tmpdir(), 'shunyi_mapo-court-history-report-'));
  return {
    writes,
    deps: {
      now,
      loadEnv: () => {},
      assertProductionTarget: async () => target,
      createClientFromEnv: () => ({ fake: true }),
      scanImportTables: async () => tables,
      loadSourceRows: () => sourceRows,
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
  assert.strictEqual(writes.length, 1, '--write should write planned court row');
  assert.strictEqual(writes[0].tableName, 'ft_courts');
  assert.strictEqual(writes[0].row.operationId, result.report.operationId);
  assert.strictEqual(writes[0].row.batchId, result.report.batchId);
  assert.ok(writes[0].row.history.some((row) => row.operationId === result.report.operationId && row.batchId === result.report.batchId), 'history row should carry trace');
  assert.strictEqual(result.report.tables.ft_courts, 1);
  assert.strictEqual(JSON.parse(fs.readFileSync(result.reportPath, 'utf8')).batchId, result.report.batchId);
}

async function main() {
  assert.deepStrictEqual(parseArgs([]), { write: false, dryRun: true });
  assert.deepStrictEqual(parseArgs(['--write']), { write: true, dryRun: false });
  await testDefaultDryRunDoesNotWrite();
  await testWriteAddsHistoryTraceAndReport();
  console.log('shunyi_mapo court history import repair script tests passed');
}

main().catch((err) => {
  console.error(err && err.stack ? err.stack : String(err));
  process.exit(1);
});
