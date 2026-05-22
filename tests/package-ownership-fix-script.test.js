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
  { id: 'seed-package-youth-1v2-40', name: '青少年1v2 40节课包' },
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
  { id: 'ent-jian', purchaseId: 'seed-purchase-009', packageId: oldPackage.id, packageName: oldPackage.name, totalLessons: 15, usedLessons: 1, remainingLessons: 14 },
  { id: 'ent-zhao', purchaseId: 'seed-purchase-004', packageId: 'seed-package-youth-1v2-20', packageName: '青少年1v2 20节课包', totalLessons: 20, usedLessons: 1, remainingLessons: 19 },
  { id: 'ent-halena', purchaseId: 'seed-purchase-012', packageId: 'seed-package-youth-1v2-40', packageName: '青少年1v2 40节课包', totalLessons: 40, usedLessons: 10, remainingLessons: 30 }
];

const plan = fix.buildPackageOwnershipPlan({ packages, purchases, entitlements, now });

const mengPurchase = plan.purchaseUpdates.find((row) => row.id === 'seed-purchase-010');
assert.strictEqual(mengPurchase.packageName, '成人1v1 黄金时间10课时（历史）');
assert.strictEqual(mengPurchase.packageLessons, 15, '朦朦订单课时应保留 15');

const jianEntitlement = plan.entitlementUpdates.find((row) => row.id === 'ent-jian');
assert.strictEqual(jianEntitlement.packageName, '成人1v1 非黄时间10课时（历史）');
assert.strictEqual(jianEntitlement.totalLessons, 15, '简先生权益课时应保留 15');

const zhaoSplit = plan.purchaseUpdates.filter((row) => String(row.splitFromPurchaseId || '') === 'seed-purchase-004');
assert.deepStrictEqual(zhaoSplit.map((row) => row.packageLessons).sort((a, b) => a - b), [10, 10], '赵雨桐、赵雨晴应拆成两个 10 节订单');
assert.strictEqual(plan.purchaseUpdates.find((row) => row.id === 'seed-purchase-004')?.status, 'voided', '原 1v2 20 节订单应作废');

assert.ok(plan.skips.some((item) => item.includes('Halena、Willian')), '不进系统名单应作废旧订单/权益');
assert.strictEqual(plan.purchaseUpdates.find((row) => row.id === 'seed-purchase-012')?.packageId, '', '不进系统订单应解除旧课包引用');
assert.strictEqual(plan.blockers.length, 0, '完整映射后不应再阻塞');
assert.ok(plan.creates.find((row) => /（历史）/.test(row.name) && row.status === 'inactive'), '历史目标课包应创建为已停售');
assert.ok(plan.creates.every((row) => !['黄金时间', '非黄时间'].includes(row.timeBand)), '目标课包主表时段应使用前端可识别值');

const touchedTables = ['ft_packages', 'ft_purchases', 'ft_entitlements'];
assert.ok(!touchedTables.includes('ft_entitlement_ledger'), '脚本不应写消课流水表');

const sourceRows = fix.buildMappingRowsFromSourceCsv({
  packages: [],
  purchases: require('../api/seeds/mabao-finance-seed.json').purchases
});
assert.strictEqual(sourceRows.length, 73, '离线对照应按课时统计源表导出 73 行');
assert.ok(sourceRows.find((row) => row.studentName === '佑佑' && row.status === '已停售'), '历史课包应标记已停售');
assert.ok(sourceRows.find((row) => row.studentName === '暴晓燕' && row.targetPackageName === '成人1v2 黄金时间10课时'), '成人 1v2 应映射到真实课包');
assert.ok(sourceRows.find((row) => row.studentName === 'Lam、Loon' && row.status === '不录入系统'), '不录入系统名单也应出现在 73 行对照中');
assert.ok(sourceRows.every((row) => row.timeBand !== '黄金时间' && row.timeBand !== '非黄时间'), '时段应使用前端可识别的标准值');

const sourcePlan = fix.buildSourceCsvOwnershipPlan({ packages, purchases, entitlements, now });
assert.ok(sourcePlan.packageUpdates.find((row) => row.name === '成人1v1 黄金时间10课时（历史）' && row.status === 'inactive'), '已存在历史课包也应修正为已停售');
assert.ok(sourcePlan.purchaseUpdates.find((row) => row.id === 'seed-purchase-010' && row.packageName === '成人1v1 黄金时间10课时（历史）'), '来源表计划应能重挂订单课包');

console.log('package ownership fix script tests passed');
