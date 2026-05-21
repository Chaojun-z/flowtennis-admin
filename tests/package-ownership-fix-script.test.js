const assert = require('assert');
const fix = require('../scripts/fix-package-ownership-20260521.js');

const now = '2026-05-21T12:00:00.000Z';
const oldPackage = { id: 'seed-package-adult-1v1-history', name: '成人1v1 历史特殊课包' };
const targetPackage = {
  id: 'pkg-gold-10',
  name: '成人1v1 黄金时间10课时（历史）',
  productId: 'seed-product-adult-1v1',
  productName: '成人1v1私教课',
  courseType: '私教课',
  price: 6000,
  timeBand: '黄金时间',
  dailyTimeWindows: [],
  coachIds: [],
  coachNames: [],
  campusIds: ['mabao'],
  maxStudents: 1
};

const packages = [
  oldPackage,
  { id: 'seed-package-youth-1v2-20', name: '青少年1v2 20节课包' },
  targetPackage,
  {
    id: 'pkg-nonprime-10',
    name: '成人1v1 非黄时间10课时（历史）',
    productId: 'seed-product-adult-1v1',
    productName: '成人1v1私教课',
    courseType: '私教课',
    price: 5000,
    timeBand: '非黄时间',
    dailyTimeWindows: [],
    coachIds: [],
    coachNames: [],
    campusIds: ['mabao'],
    maxStudents: 1
  }
];

const purchases = [
  { id: 'seed-purchase-010', studentName: '朦朦', packageId: oldPackage.id, packageName: oldPackage.name, packageLessons: 15, amountPaid: 5000 },
  { id: 'seed-purchase-009', studentName: '简先生', packageId: oldPackage.id, packageName: oldPackage.name, packageLessons: 15, amountPaid: 4000 },
  { id: 'seed-purchase-012', studentName: 'Halena、Willian', packageId: 'seed-package-youth-1v2-40', packageName: '青少年1v2 40节课包', packageLessons: 40 },
  { id: 'seed-purchase-004', studentName: '赵雨桐、赵雨晴', packageId: 'seed-package-youth-1v2-20', packageName: '青少年1v2 20节课包', packageLessons: 20 }
];

const entitlements = [
  { id: 'ent-meng', purchaseId: 'seed-purchase-010', packageId: oldPackage.id, packageName: oldPackage.name, totalLessons: 15, usedLessons: 2, remainingLessons: 13 },
  { id: 'ent-jian', purchaseId: 'seed-purchase-009', packageId: oldPackage.id, packageName: oldPackage.name, totalLessons: 15, usedLessons: 1, remainingLessons: 14 }
];

const plan = fix.buildPackageOwnershipPlan({ packages, purchases, entitlements, now });

const mengPurchase = plan.purchaseUpdates.find((row) => row.id === 'seed-purchase-010');
assert.strictEqual(mengPurchase.packageName, '成人1v1 黄金时间10课时（历史）');
assert.strictEqual(mengPurchase.packageLessons, 15, '朦朦订单课时应保留 15');

const jianEntitlement = plan.entitlementUpdates.find((row) => row.id === 'ent-jian');
assert.strictEqual(jianEntitlement.packageName, '成人1v1 非黄时间10课时（历史）');
assert.strictEqual(jianEntitlement.totalLessons, 15, '简先生权益课时应保留 15');

assert.ok(plan.skips.some((item) => item.includes('Halena、Willian')), '不进系统名单应跳过');
assert.ok(plan.blockers.some((item) => item.includes('赵雨桐、赵雨晴')), '赵雨桐、赵雨晴需要拆单，不能静默处理');
assert.ok(plan.blockers.some((item) => item.includes('旧课包仍有引用')), '旧包仍被引用时不能删除');

const touchedTables = ['ft_packages', 'ft_purchases', 'ft_entitlements'];
assert.ok(!touchedTables.includes('ft_entitlement_ledger'), '脚本不应写消课流水表');

console.log('package ownership fix script tests passed');
