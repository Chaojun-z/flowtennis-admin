const assert = require('assert');
const api = require('../api/index.js');

const rules = api._test;

const masterPackage = {
  id: 'pkg-a',
  name: '成人1v1 10节课包',
  productId: '',
  productName: '',
  courseType: '私教课',
  price: 4800,
  lessons: 10,
  validDays: 120,
  saleStartDate: '',
  saleEndDate: '',
  usageStartDate: '',
  usageEndDate: '',
  dailyTimeWindows: [{ label: '非黄金时段', startTime: '08:00', endTime: '17:00', daysOfWeek: [] }],
  timeBand: '非黄金时段',
  ownerCoach: '朝珺',
  coachIds: ['朝珺'],
  coachNames: ['朝珺'],
  campusIds: ['shunyi_mapo'],
  maxStudents: 1,
  status: 'active'
};

const sourcePackage = {
  ...masterPackage,
  id: 'pkg-b',
  name: '成人1v1 10课时非黄金时间课包'
};

const now = '2026-05-19 10:00:00';

const purchase = {
  id: 'pur-b',
  packageId: 'pkg-b',
  packageName: sourcePackage.name,
  priceSourceId: 'pkg-b',
  priceSourceName: sourcePackage.name,
  productId: '',
  productName: '',
  courseType: '私教课',
  packageLessons: 10,
  packagePrice: 4800,
  packageTimeBand: '非黄金时段',
  updatedAt: '2026-05-01 00:00:00'
};

const entitlement = {
  id: 'ent-b',
  purchaseId: 'pur-b',
  packageId: 'pkg-b',
  packageName: sourcePackage.name,
  productId: '',
  productName: '',
  courseType: '私教课',
  totalLessons: 10,
  usedLessons: 2,
  remainingLessons: 8,
  timeBand: '非黄金时段',
  updatedAt: '2026-05-01 00:00:00'
};

const schedule = {
  id: 'sch-b',
  entitlementId: 'ent-b',
  packageName: sourcePackage.name,
  purchaseId: 'pur-b',
  timeBand: '非黄金时段',
  updatedAt: '2026-05-01 00:00:00'
};

assert.ok(rules.assertCanMergePackages, 'api._test should expose package merge validation');
assert.ok(rules.buildPackageMergeUpdates, 'api._test should expose package merge update builder');

const normalizedSpecialProduct = rules.normalizeProductRecord({
  id: 'special-product',
  name: '【2.0】击球位置优化',
  type: '专项课',
  skillLevelMin: 2,
  skillLevelMax: 2,
  specialTopic: '击球位置优化',
  maxStudents: 4,
  price: 260,
  lessons: 1
}, null, now);
assert.strictEqual(normalizedSpecialProduct.skillLevelMin, '2.0', 'special course product should normalize numeric min level to standard label');
assert.strictEqual(normalizedSpecialProduct.skillLevelMax, '2.0', 'special course product should normalize numeric max level to standard label');

assert.doesNotThrow(
  () => rules.assertCanEditProductWithReferences(
    { id: 'special-product', type: '专项课', maxStudents: 4, lessons: 1, price: 0 },
    { id: 'special-product', type: '专项课', maxStudents: 4, lessons: 1, price: 260 },
    { packages: [{ productId: 'special-product', courseType: '专项课', price: 260 }], classes: [] }
  ),
  'referenced special course products should allow correcting zero default price to the linked package price'
);

assert.throws(
  () => rules.assertCanEditProductWithReferences(
    { id: 'special-product', type: '专项课', maxStudents: 4, lessons: 1, price: 0 },
    { id: 'special-product', type: '专项课', maxStudents: 4, lessons: 2, price: 260 },
    { packages: [{ productId: 'special-product', courseType: '专项课', price: 260 }], classes: [] }
  ),
  /不能修改核心字段/,
  'referenced special course product correction should not allow changing lesson count'
);

assert.doesNotThrow(
  () => rules.assertCanMergePackages(masterPackage, sourcePackage),
  'matching packages should be mergeable'
);

assert.throws(
  () => rules.assertCanMergePackages(masterPackage, { ...sourcePackage, price: 5000 }),
  /课包规则不一致，不能合并/,
  'different core rules should not be mergeable'
);

assert.throws(
  () => rules.assertCanMergePackages(masterPackage, { ...sourcePackage, ownerCoach: '其他教练' }),
  /课包规则不一致，不能合并/,
  'different main coach should not be mergeable'
);

const result = rules.buildPackageMergeUpdates({
  masterPackage,
  sourcePackage,
  purchases: [purchase],
  entitlements: [entitlement],
  schedules: [schedule],
  now,
  operator: '管理员'
});

assert.deepStrictEqual(
  result.sourcePackage,
  {
    ...sourcePackage,
    status: 'merged',
    mergedIntoPackageId: 'pkg-a',
    mergedIntoPackageName: '成人1v1 10节课包',
    mergedAt: now,
    mergedBy: '管理员',
    updatedAt: now
  },
  'source package should be hidden as merged instead of deleted'
);

assert.deepStrictEqual(
  result.purchases,
  [{
    ...purchase,
    packageId: 'pkg-a',
    packageName: '成人1v1 10节课包',
    priceSourceId: 'pkg-a',
    priceSourceName: '成人1v1 10节课包',
    originalPackageId: 'pkg-b',
    originalPackageName: '成人1v1 10课时非黄金时间课包',
    packageMergedAt: now,
    updatedAt: now
  }],
  'purchase display fields should move to master package with hidden original trace'
);

assert.deepStrictEqual(
  result.entitlements,
  [{
    ...entitlement,
    packageId: 'pkg-a',
    packageName: '成人1v1 10节课包',
    originalPackageId: 'pkg-b',
    originalPackageName: '成人1v1 10课时非黄金时间课包',
    packageMergedAt: now,
    updatedAt: now
  }],
  'entitlement display fields should move to master package with hidden original trace'
);

assert.deepStrictEqual(
  result.schedules,
  [{
    ...schedule,
    packageName: '成人1v1 10节课包',
    originalPackageId: 'pkg-b',
    originalPackageName: '成人1v1 10课时非黄金时间课包',
    packageMergedAt: now,
    updatedAt: now
  }],
  'schedule cached package name should move to master package'
);

console.log('package merge rules tests passed');
