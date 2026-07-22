const assert = require('assert');

const {
  buildCoursePackageKnownIssuesRepairPlan,
  JIAQI_DUPLICATE_PURCHASE_IDS,
  JIAQI_DUPLICATE_ENTITLEMENT_IDS,
  MACHEN_GIFT_ENTITLEMENT_ID
} = require('../server/admin-tools-routes.js');

const now = '2026-07-22T12:00:00.000Z';
const purchases = [
  { id: JIAQI_DUPLICATE_PURCHASE_IDS[0], studentName: '佳琪', packageLessons: 10, amountPaid: 5000, status: 'active' },
  { id: JIAQI_DUPLICATE_PURCHASE_IDS[1], studentName: '佳琪', packageLessons: 10, amountPaid: 4000, status: 'active' },
  { id: 'private_lesson_csv_import_20260524-purchase-2065-佳琪（）', studentName: '佳琪', packageLessons: 20, totalLessons: 20, amountPaid: 9000, status: 'active' },
  { id: 'safe-purchase', studentName: '其他学员', packageLessons: 10, amountPaid: 5000, status: 'active' }
];
const entitlements = [
  { id: JIAQI_DUPLICATE_ENTITLEMENT_IDS[0], studentName: '佳琪', purchaseId: JIAQI_DUPLICATE_PURCHASE_IDS[0], totalLessons: 10, usedLessons: 1, remainingLessons: 9, status: 'active' },
  { id: JIAQI_DUPLICATE_ENTITLEMENT_IDS[1], studentName: '佳琪', purchaseId: JIAQI_DUPLICATE_PURCHASE_IDS[1], totalLessons: 10, usedLessons: 1, remainingLessons: 9, status: 'active' },
  { id: 'private_lesson_csv_import_20260527:entitlement:c27759386c39', studentName: '佳琪', purchaseId: 'private_lesson_csv_import_20260524-purchase-2065-佳琪（）', totalLessons: 20, usedLessons: 11, remainingLessons: 9, status: 'active' },
  { id: MACHEN_GIFT_ENTITLEMENT_ID, studentName: '马晨', totalLessons: 10, usedLessons: 11, remainingLessons: 0, status: 'depleted' },
  { id: 'safe-entitlement', studentName: '其他学员', totalLessons: 10, usedLessons: 0, remainingLessons: 10, status: 'active' }
];

const plan = buildCoursePackageKnownIssuesRepairPlan({ purchases, entitlements }, { now, operator: '管理员', operationId: 'op-test' });

assert.strictEqual(plan.blockers.length, 0, 'known issue repair should not block when fixed rows match expected identities');
assert.deepStrictEqual(
  plan.updates.purchases.map(row => [row.id, row.status, row.voidReason]).sort(),
  JIAQI_DUPLICATE_PURCHASE_IDS.map(id => [id, 'voided', '2026-07-22 确认佳琪只有一笔20课时9000元订单，4000+5000为拆分支付，作废重复10课时订单']).sort(),
  'repair should void only the two duplicate Jiaqi split-payment purchases'
);
assert.deepStrictEqual(
  plan.updates.entitlements.map(row => [row.id, row.status, row.totalLessons, row.usedLessons, row.remainingLessons]).sort(),
  [
    [JIAQI_DUPLICATE_ENTITLEMENT_IDS[0], 'voided', 10, 1, 9],
    [JIAQI_DUPLICATE_ENTITLEMENT_IDS[1], 'voided', 10, 1, 9],
    [MACHEN_GIFT_ENTITLEMENT_ID, 'depleted', 11, 11, 0]
  ].sort(),
  'repair should void Jiaqi duplicate entitlements and set Machen gift entitlement to 11 total lessons'
);
assert.ok(!plan.updates.purchases.some(row => row.id === 'safe-purchase'), 'repair must not touch unrelated purchases');
assert.ok(!plan.updates.entitlements.some(row => row.id === 'safe-entitlement'), 'repair must not touch unrelated entitlements');
assert.strictEqual(plan.backups.purchases.length, 2, 'repair should include purchase backups before write');
assert.strictEqual(plan.backups.entitlements.length, 3, 'repair should include entitlement backups before write');

const blocked = buildCoursePackageKnownIssuesRepairPlan({
  purchases: purchases.filter(row => row.id !== 'private_lesson_csv_import_20260524-purchase-2065-佳琪（）'),
  entitlements
}, { now });
assert.ok(blocked.blockers.some(row => row.reason === '佳琪20课时主订单不存在'), 'repair should block if Jiaqi main 20-lesson purchase is missing');

console.log('course package known issues repair tests passed');
