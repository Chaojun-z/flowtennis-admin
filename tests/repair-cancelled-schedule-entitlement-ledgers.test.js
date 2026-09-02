const assert = require('assert');
const { buildPlan } = require('../scripts/repair-cancelled-schedule-entitlement-ledgers');

const now = '2026-09-02T12:00:00.000Z';
const operationId = 'repair-cancelled-schedule-entitlement-ledgers-test';

const plan = buildPlan({
  schedules: [
    { id: 'schedule-dirty-cancelled', status: '已取消', studentId: 'stu-a', studentIds: ['stu-a'], startTime: '2026-08-20 13:00:00', endTime: '2026-08-20 14:00:00', courseType: '私教课' },
    { id: 'schedule-balanced-cancelled', status: '已取消', studentId: 'stu-b', studentIds: ['stu-b'], startTime: '2026-08-21 13:00:00', endTime: '2026-08-21 14:00:00', courseType: '私教课' },
    { id: 'schedule-active', status: '已结束', studentId: 'stu-a', studentIds: ['stu-a'], startTime: '2026-08-22 13:00:00', endTime: '2026-08-22 14:00:00', courseType: '私教课' }
  ],
  entitlements: [
    { id: 'ent-a', studentId: 'stu-a', purchaseId: 'purchase-a', totalLessons: 10, usedLessons: 2, remainingLessons: 8, status: 'active' },
    { id: 'ent-b', studentId: 'stu-b', purchaseId: 'purchase-b', totalLessons: 10, usedLessons: 1, remainingLessons: 9, status: 'active' }
  ],
  entitlementLedger: [
    { id: 'ledger-dirty-consume', scheduleId: 'schedule-dirty-cancelled', entitlementId: 'ent-a', purchaseId: 'purchase-a', studentId: 'stu-a', lessonDelta: -1, action: 'consume', relatedDate: '2026-08-20' },
    { id: 'ledger-balanced-consume', scheduleId: 'schedule-balanced-cancelled', entitlementId: 'ent-b', purchaseId: 'purchase-b', studentId: 'stu-b', lessonDelta: -1, action: 'consume', relatedDate: '2026-08-21' },
    { id: 'ledger-balanced-return', scheduleId: 'schedule-balanced-cancelled', entitlementId: 'ent-b', purchaseId: 'purchase-b', studentId: 'stu-b', lessonDelta: 1, action: 'return', relatedDate: '2026-08-21' },
    { id: 'ledger-active-consume', scheduleId: 'schedule-active', entitlementId: 'ent-a', purchaseId: 'purchase-a', studentId: 'stu-a', lessonDelta: -1, action: 'consume', relatedDate: '2026-08-22' }
  ]
}, { now, operationId });

assert.deepStrictEqual(plan.blockers, [], '可识别课包的已取消扣课脏数据不应阻塞生成修复计划');
assert.deepStrictEqual(
  plan.returnLedgers.map(row => [row.scheduleId, row.entitlementId, row.studentId, row.lessonDelta, row.action]),
  [['schedule-dirty-cancelled', 'ent-a', 'stu-a', 1, 'return']],
  '只给未被退回抵消的已取消排课补退回流水'
);
assert.deepStrictEqual(
  plan.putEntitlements.map(row => [row.id, row.usedLessons, row.remainingLessons, row.status]),
  [['ent-a', 1, 9, 'active']],
  '修复计划必须同步回退课包已用和剩余课时'
);
assert.strictEqual(plan.backups.entitlements.length, 1, '写入前必须保留课包原始快照');
assert.strictEqual(plan.backups.entitlementLedger.length, 1, '写入前必须保留问题流水原始快照');
assert.strictEqual(plan.summary.dirtyCancelledSchedules, 1, '摘要应统计需要修复的取消排课数量');

const rerun = buildPlan({
  schedules: [{ id: 'schedule-dirty-cancelled', status: '已取消', studentId: 'stu-a', studentIds: ['stu-a'] }],
  entitlements: [{ id: 'ent-a', studentId: 'stu-a', purchaseId: 'purchase-a', totalLessons: 10, usedLessons: 1, remainingLessons: 9, status: 'active' }],
  entitlementLedger: [
    { id: 'ledger-dirty-consume', scheduleId: 'schedule-dirty-cancelled', entitlementId: 'ent-a', purchaseId: 'purchase-a', studentId: 'stu-a', lessonDelta: -1, action: 'consume', relatedDate: '2026-08-20' },
    { id: 'repair-cancelled-schedule-entitlement-ledgers-test:return:schedule-dirty-cancelled:ent-a:stu-a', scheduleId: 'schedule-dirty-cancelled', entitlementId: 'ent-a', purchaseId: 'purchase-a', studentId: 'stu-a', lessonDelta: 1, action: 'return', relatedDate: '2026-08-20' }
  ]
}, { now, operationId });

assert.strictEqual(rerun.returnLedgers.length, 0, '修复脚本必须可重复执行，已补退回的记录不能重复补');

console.log('repair cancelled schedule entitlement ledgers tests passed');
