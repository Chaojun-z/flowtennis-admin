const assert = require('assert');
const fs = require('fs');
const os = require('os');
const path = require('path');

const {
  parseArgs,
  run
} = require('../scripts/apply-shunyi_mapo-final-import-20260524');

const now = '2026-06-14 09:00:00';
const target = {
  onlineEndpoint: 'https://flowtennis-ue.us-east-1.ots.aliyuncs.com',
  onlineInstance: 'flowtennis-ue',
  localEndpoint: 'https://flowtennis-ue.us-east-1.ots.aliyuncs.com',
  localInstance: 'flowtennis-ue'
};

const context = {
  students: [
    { id: 'student-existing', name: '小明', status: 'active' },
    { id: 'student-ledger', name: '小红', status: 'active' }
  ],
  schedule: [],
  entitlements: [
    {
      id: 'entitlement-ledger',
      studentId: 'student-ledger',
      studentName: '小红',
      purchaseId: 'purchase-ledger',
      packageName: '私教课',
      totalLessons: 10,
      usedLessons: 0,
      remainingLessons: 10,
      status: 'active'
    }
  ],
  entitlementLedger: [],
  courts: [
    { id: 'court-existing', name: '散客王', campus: 'shunyi_mapo', status: 'active', history: [] }
  ],
  purchases: [],
  membershipOrders: []
};

const sourceRows = {
  income: [
    {
      __rowNo: 101,
      日期: '2026-05-24',
      时间: '10:00-11:00',
      '客户/学员': '私教课 小明',
      收入类型: '私教课',
      支付方式: '微信',
      '实收/核销': '300',
      导入动作: '新增课包',
      最终备注: '测试课包'
    },
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
  ],
  schedule: [
    {
      __rowNo: 301,
      收入原表行号: '101',
      日期: '2026-05-24',
      开始: '10:00',
      结束: '11:00',
      学员: '小明',
      教练: '王教练',
      场馆: '马坡',
      场地: '1号场',
      支付方式: '微信',
      课时: '1',
      备注: '测试排课'
    },
    {
      __rowNo: 302,
      收入原表行号: '999',
      日期: '2026-05-25',
      开始: '10:00',
      结束: '11:00',
      学员: '小红',
      教练: '王教练',
      场馆: '马坡',
      场地: '1号场',
      支付方式: '课包划扣',
      课时: '1',
      备注: '测试核销'
    }
  ],
  entitlement: [
    {
      __rowNo: 401,
      收入原表行号: '999',
      日期: '2026-05-25',
      时间: '10:00-11:00',
      学员: '小红',
      教练: '王教练',
      课时变化: '-1',
      核销金额: '100',
      备注: '测试流水'
    }
  ]
};

function makeDeps(overrides = {}) {
  const writes = [];
  const reportDir = fs.mkdtempSync(path.join(os.tmpdir(), 'shunyi_mapo-apply-report-'));
  return {
    writes,
    deps: {
      now,
      loadEnv: () => {},
      assertProductionTarget: async () => target,
      createClientFromEnv: () => ({ fake: true }),
      buildImportContext: async () => context,
      parseSourceRows: () => sourceRows,
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
  assert.strictEqual(writes.length, 0, 'default dry-run must not write rows');
  assert.ok(result.report.operationId, 'dry-run should generate operationId');
  assert.ok(result.report.batchId, 'dry-run should generate batchId');
  assert.ok(fs.existsSync(result.reportPath), 'dry-run should write a report file');
  assert.strictEqual(JSON.parse(fs.readFileSync(result.reportPath, 'utf8')).batchId, result.report.batchId);
}

async function testWriteAddsTraceAndReport() {
  const { writes, deps } = makeDeps();
  const result = await run(['--write'], deps);

  assert.strictEqual(result.report.mode, 'write');
  assert.ok(result.report.operationId.startsWith('shunyi_mapo-final-import-20260524-'));
  assert.strictEqual(result.report.batchId, `batch-${result.report.operationId}`);
  assert.ok(writes.length > 0, 'write mode should write planned rows');

  const tracedTables = new Set([
    'ft_students',
    'ft_purchases',
    'ft_entitlements',
    'ft_schedule',
    'ft_entitlement_ledger',
    'ft_courts',
    'ft_student_active_entitlement_index'
  ]);
  for (const item of writes.filter((entry) => tracedTables.has(entry.tableName))) {
    assert.strictEqual(item.row.operationId, result.report.operationId, `${item.tableName} row should carry operationId`);
    assert.strictEqual(item.row.batchId, result.report.batchId, `${item.tableName} row should carry batchId`);
  }

  const courtWrite = writes.find((entry) => entry.tableName === 'ft_courts');
  assert.ok(courtWrite.row.history.some((row) => row.operationId === result.report.operationId && row.batchId === result.report.batchId), 'court history rows should carry trace');

  assert.strictEqual(result.report.tables.ft_purchases, writes.filter((entry) => entry.tableName === 'ft_purchases').length);
  assert.strictEqual(JSON.parse(fs.readFileSync(result.reportPath, 'utf8')).batchId, result.report.batchId);
}

async function main() {
  assert.deepStrictEqual(parseArgs([]), { write: false, dryRun: true });
  assert.deepStrictEqual(parseArgs(['--write']), { write: true, dryRun: false });
  await testDefaultDryRunDoesNotWrite();
  await testWriteAddsTraceAndReport();
  console.log('shunyi_mapo final import script tests passed');
}

main().catch((err) => {
  console.error(err && err.stack ? err.stack : String(err));
  process.exit(1);
});
