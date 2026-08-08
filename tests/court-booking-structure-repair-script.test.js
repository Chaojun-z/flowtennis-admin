const assert = require('assert');
const fs = require('fs');
const os = require('os');
const path = require('path');

const {
  buildPlan,
  run
} = require('../scripts/repair-court-booking-structure-fields-20260808');

const now = '2026-08-08T10:00:00+08:00';
const target = {
  onlineEndpoint: 'https://flowtennis-ue.us-east-1.ots.aliyuncs.com',
  onlineInstance: 'flowtennis-ue',
  localEndpoint: 'https://flowtennis-ue.us-east-1.ots.aliyuncs.com',
  localInstance: 'flowtennis-ue'
};

const courts = [{
  id: 'court-1',
  name: '蓝星灿',
  history: [
    { id: 'need-repair', type: '消费', category: '订场', payMethod: '微信转账', amount: 120, note: '2026-08-05；室内2；12:00-13:00；历史导入' },
    { id: 'need-range-merge', type: '消费', category: '订场', payMethod: '微信转账', amount: 320, note: '2026-08-05；室内1号；[\"19:30-20:00\",\"19:00-19:30\",\"20:00-20:30\",\"20:30-21:00\"]' },
    { id: 'already-ok', type: '消费', category: '订场', payMethod: '微信转账', amount: 140, date: '2026-08-05', startTime: '13:00', endTime: '14:00', venue: '1号场' },
    { id: 'course-row', type: '消费', category: '排课私教课', payMethod: '课包核销', amount: 0, note: '2026-08-05；室内3；14:00-15:00' },
    { id: 'unresolved', type: '消费', category: '订场', payMethod: '微信转账', amount: 80, note: '只有备注没有时间场地' }
  ]
}];

function makeDeps() {
  const writes = [];
  const reportDir = fs.mkdtempSync(path.join(os.tmpdir(), 'court-booking-structure-repair-'));
  return {
    writes,
    reportPath: path.join(reportDir, 'report.json'),
    deps: {
      now,
      loadEnv: () => {},
      assertProductionWriteTarget: async () => target,
      createClientFromEnv: () => ({ fake: true }),
      scanTable: async (client, tableName) => tableName === 'ft_courts' ? courts : [],
      putRow: async (client, tableName, row) => writes.push({ tableName, row }),
      reportPath: path.join(reportDir, 'report.json')
    }
  };
}

const plan = buildPlan(courts, now);
assert.strictEqual(plan.missingBefore, 3, '应统计可修复订场里缺结构字段的记录');
assert.strictEqual(plan.repairedHistoryCount, 2, '应只自动修复能从备注识别日期、时间段、场地的记录');
assert.strictEqual(plan.unresolvedCount, 1, '无法识别的记录必须留给人工处理');
assert.strictEqual(plan.courtWrites, 1, '同一个订场用户只应写回一次');
const repaired = plan.updates[0].after.history.find(row => row.id === 'need-repair');
assert.strictEqual(repaired.date, '2026-08-05');
assert.strictEqual(repaired.occurredDate, '2026-08-05');
assert.strictEqual(repaired.startTime, '12:00');
assert.strictEqual(repaired.endTime, '13:00');
assert.strictEqual(repaired.venue, '2号场');
assert.strictEqual(repaired.amount, 120, '修复脚本不得改金额');
assert.strictEqual(repaired.payMethod, '微信转账', '修复脚本不得改支付方式');
const rangeMerged = plan.updates[0].after.history.find(row => row.id === 'need-range-merge');
assert.strictEqual(rangeMerged.startTime, '19:00', '多段半小时订场应取最早开始时间');
assert.strictEqual(rangeMerged.endTime, '21:00', '多段半小时订场应取最晚结束时间');
assert.ok(!plan.updates[0].after.history.find(row => row.id === 'course-row').structureRepairOperationId, '排课/课程记录不应被订场修复脚本改写');

async function testDryRunDoesNotWrite() {
  const { writes, reportPath, deps } = makeDeps();
  const result = await run(['--dry-run'], deps);
  assert.strictEqual(result.report.mode, 'dry-run');
  assert.strictEqual(writes.length, 0, 'dry-run 不能写生产数据');
  assert.strictEqual(result.summary.repairedHistoryCount, 2);
  assert.ok(fs.existsSync(reportPath), 'dry-run 应输出审计报告');
}

async function testWriteOnlyChangedCourt() {
  const { writes, deps } = makeDeps();
  const result = await run(['--write'], deps);
  assert.strictEqual(result.report.mode, 'write');
  assert.strictEqual(writes.length, 1, 'write 只写有变化的订场用户');
  assert.strictEqual(writes[0].tableName, 'ft_courts');
  const fixed = writes[0].row.history.find(row => row.id === 'need-repair');
  assert.strictEqual(fixed.startTime, '12:00');
  assert.strictEqual(fixed.endTime, '13:00');
  assert.strictEqual(fixed.venue, '2号场');
}

async function main() {
  await testDryRunDoesNotWrite();
  await testWriteOnlyChangedCourt();
  console.log('court booking structure repair script tests passed');
}

main().catch(err => {
  console.error(err && err.stack ? err.stack : String(err));
  process.exit(1);
});
