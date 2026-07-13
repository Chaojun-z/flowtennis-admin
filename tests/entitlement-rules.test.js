const assert = require('assert');
const api = require('../api/index.js');

const rules = api._test;

assert.ok(rules, 'api._test should expose entitlement rule helpers');
assert.ok(rules.collectShunyiMapoSeedStaleRowIds, 'api._test should expose shunyi_mapo seed stale row cleanup helper');
assert.ok(rules.collectShunyiMapoSeedImportedLedgerReplacementIds, 'api._test should expose imported ledger replacement cleanup helper');
assert.ok(rules.collectDuplicateImportedLedgerIds, 'api._test should expose generic duplicate imported ledger cleanup helper');
assert.ok(rules.normalizeEntitlementLedgerRowsForView, 'api._test should expose ledger view normalization helper');
assert.ok(rules.normalizeEntitlementLedgerRowsForDetailView, 'api._test should expose ledger detail view normalization helper');
assert.ok(rules.userCanManageManualEntitlementAdjustment, 'api._test should expose manual entitlement campus permission helper');
assert.ok(rules.validateManualEntitlementAdjustment, 'api._test should expose manual entitlement adjustment validator');
assert.ok(rules.buildManualEntitlementLedgerRecord, 'api._test should expose manual entitlement ledger builder');

const pkg = {
  id: 'pkg-1',
  name: '五一私教非黄金课包',
  productId: 'prod-1',
  productName: '成人私教',
  courseType: '私教课',
  price: 1000,
  lessons: 5,
  validDays: 60,
  usageStartDate: '2026-05-01',
  usageEndDate: '2026-07-01',
  dailyTimeWindows: [{ label: '非黄金时段', startTime: '07:00', endTime: '17:00', daysOfWeek: [1, 2, 3, 4, 5] }],
  timeBand: '非黄金时段',
  coachIds: ['coach-1'],
  coachNames: ['朝珺'],
  campusIds: ['shunyi_mapo'],
  maxStudents: 1
};

const purchase = {
  id: 'pur-1',
  studentId: 'stu-1',
  studentName: '张三',
  purchaseDate: '2026-05-02',
  amountPaid: 1000,
  payMethod: '微信',
  ownerCoach: '朝珺',
  allowedCoaches: ['mira', '小舟']
};

const entitlement = rules.buildEntitlementFromPurchase(pkg, purchase, { id: 'stu-1', name: '张三' }, 'ent-1', '2026-04-12 00:00:00');
const legacyMapoCode = ['ma', 'bao'].join('');

const oldImportedLedger = {
  id: 'old-2',
  entitlementId: 'ent-import',
  purchaseId: 'pur-import',
  scheduleId: '',
  lessonDelta: -2,
  reason: '历史导入 2月消课',
  relatedDate: '2026-02-28'
};
const currentImportedLedger = {
  id: 'new-2',
  entitlementId: 'ent-import',
  purchaseId: 'pur-import',
  studentId: 'stu-import',
  scheduleId: '',
  lessonDelta: -1.5,
  action: 'consume',
  reason: '历史导入 2月消课',
  relatedDate: '2026-02-28',
  sourceMonth: '2026-02',
  seedTag: 'shunyi_mapo-finance-seed-v8'
};

assert.deepStrictEqual(
  rules.collectDuplicateImportedLedgerIds([oldImportedLedger, currentImportedLedger]),
  ['old-2'],
  'current monthly imported ledger should replace older partial rows even when lesson counts differ'
);

assert.deepStrictEqual(
  rules.normalizeEntitlementLedgerRowsForView([oldImportedLedger, currentImportedLedger]).map(row => ({ id: row.id, lessonDelta: row.lessonDelta })),
  [{ id: 'new-2', lessonDelta: -1.5 }],
  'ledger view should ignore older monthly rows when a current monthly import row exists'
);

assert.deepStrictEqual(
  rules.normalizeEntitlementLedgerRowsForDetailView([
    { ...currentImportedLedger, id: 'lesson-1', lessonDelta: -1, relatedDate: '2026-02-07', notes: '2026-02-07 10:00-11:00' },
    { ...currentImportedLedger, id: 'lesson-2', lessonDelta: -1, relatedDate: '2026-02-14', notes: '2026-02-14 10:00-11:00' }
  ]).map(row => row.id),
  ['lesson-1', 'lesson-2'],
  'student detail ledger should keep imported lesson rows one by one'
);

assert.strictEqual(
  rules.userCanManageManualEntitlementAdjustment(
    { role: 'admin', dataScope: 'campus', campusIds: ['shunyi_mapo'] },
    {
      entitlement: { campusIds: ['shunyi_mapo'] },
      purchase: { campusIds: ['shilipu'] },
      packageRow: { campusIds: ['shunyi_mapo'] },
      student: { campus: 'shilipu' }
    }
  ),
  true,
  'campus admin should manage manual lesson adjustments when package campus matches'
);

assert.strictEqual(
  rules.userCanManageManualEntitlementAdjustment(
    { role: 'admin', dataScope: 'campus', campusIds: ['shunyi_mapo'] },
    {
      entitlement: { campusIds: [] },
      purchase: { campusIds: ['shilipu'] },
      packageRow: { campusIds: [] },
      student: { campus: 'shunyi_mapo' }
    }
  ),
  false,
  'purchase campus should restrict manual adjustments before student campus when package has no campus'
);

assert.strictEqual(
  rules.userCanManageManualEntitlementAdjustment(
    { role: 'admin', dataScope: 'campus', campusIds: ['shunyi_mapo'] },
    {
      entitlement: { campusIds: [] },
      purchase: {},
      packageRow: { campusIds: [] },
      student: {}
    }
  ),
  true,
  'campus admins may manage manual adjustments only when no package, purchase, student, or entitlement campus is known'
);

assert.doesNotThrow(
  () => rules.validateManualEntitlementAdjustment({
    entitlement: { id: 'ent-1', status: 'active', remainingLessons: 5, usedLessons: 5, totalLessons: 10, validFrom: '2026-03-01', validUntil: '2026-06-30' },
    purchase: { id: 'pur-1' },
    packageRow: { id: 'pkg-1', campusIds: ['shunyi_mapo'] },
    student: { id: 'stu-1' },
    user: { role: 'admin', dataScope: 'campus', campusIds: ['shunyi_mapo'] },
    lessonDelta: -5,
    relatedDate: '2026-04-10',
    reason: '补录历史训练营课时'
  }),
  'manual consume should allow an authorized campus admin to consume available lessons'
);

assert.throws(
  () => rules.validateManualEntitlementAdjustment({
    entitlement: { id: 'ent-1', status: 'active', remainingLessons: 4, usedLessons: 6, totalLessons: 10, validFrom: '2026-03-01', validUntil: '2026-06-30' },
    purchase: { id: 'pur-1' },
    packageRow: { id: 'pkg-1', campusIds: ['shunyi_mapo'] },
    student: { id: 'stu-1' },
    user: { role: 'admin', dataScope: 'campus', campusIds: ['shunyi_mapo'] },
    lessonDelta: -5,
    relatedDate: '2026-04-10',
    reason: '补录历史训练营课时'
  }),
  /课包剩余课时不足/,
  'manual consume should reject consuming more than the remaining balance'
);

assert.throws(
  () => rules.validateManualEntitlementAdjustment({
    entitlement: { id: 'ent-1', status: 'active', remainingLessons: 5, usedLessons: 5, totalLessons: 10, validFrom: '2026-03-01', validUntil: '2026-06-30' },
    purchase: { id: 'pur-1' },
    packageRow: { id: 'pkg-1', campusIds: ['shunyi_mapo'] },
    student: { id: 'stu-1' },
    user: { role: 'admin', dataScope: 'campus', campusIds: ['shilipu'] },
    lessonDelta: -1,
    relatedDate: '2026-04-10',
    reason: '补录历史训练营课时'
  }),
  /无权限操作该课包/,
  'manual consume should reject campus admins outside the package scope'
);

assert.throws(
  () => rules.validateManualEntitlementAdjustment({
    entitlement: { id: 'ent-1', status: 'active', remainingLessons: 5, usedLessons: 5, totalLessons: 10, validFrom: '2026-03-01', validUntil: '2026-06-30' },
    purchase: { id: 'pur-1' },
    packageRow: { id: 'pkg-1', campusIds: ['shunyi_mapo'] },
    student: { id: 'stu-1' },
    user: { role: 'admin', dataScope: 'campus', campusIds: ['shunyi_mapo'] },
    lessonDelta: -1,
    relatedDate: '2026-07-10',
    reason: '补录历史训练营课时'
  }),
  /不在课包可用日期范围/,
  'manual consume should use the lesson date to validate package availability'
);

assert.deepStrictEqual(
  rules.buildManualEntitlementLedgerRecord({
    entitlement: { id: 'ent-1', studentId: 'stu-1', purchaseId: 'pur-1', packageName: '小班训练营', ownerCoach: '朝珺' },
    lessonDelta: -5,
    relatedDate: '2026-04-10',
    reason: '补录历史训练营课时',
    user: { name: '马坡管理员' },
    operationTrace: { operationId: 'op-manual-1', batchId: 'batch-op-manual-1' }
  }, { id: 'ledger-manual-1', now: '2026-06-12 10:00:00' }),
  {
    id: 'ledger-manual-1',
    entitlementId: 'ent-1',
    studentId: 'stu-1',
    purchaseId: 'pur-1',
    scheduleId: '',
    lessonDelta: -5,
    action: 'manual_consume',
    reason: '管理员手动消课：补录历史训练营课时',
    notes: '补录历史训练营课时',
    relatedDate: '2026-04-10',
    sourceDate: '2026-04-10',
    operator: '马坡管理员',
    createdAt: '2026-06-12 10:00:00',
    packageName: '小班训练营',
    coach: '朝珺',
    operationId: 'op-manual-1',
    batchId: 'batch-op-manual-1'
  },
  'manual consume should write a schedule-less ledger row with operation trace'
);

assert.deepStrictEqual(
  {
    id: entitlement.id,
    studentId: entitlement.studentId,
    packageName: entitlement.packageName,
    courseType: entitlement.courseType,
    totalLessons: entitlement.totalLessons,
    usedLessons: entitlement.usedLessons,
    remainingLessons: entitlement.remainingLessons,
    validFrom: entitlement.validFrom,
    validUntil: entitlement.validUntil,
    timeBand: entitlement.timeBand,
    ownerCoach: entitlement.ownerCoach,
    allowedCoaches: entitlement.allowedCoaches
  },
  {
    id: 'ent-1',
    studentId: 'stu-1',
    packageName: '五一私教非黄金课包',
    courseType: '私教课',
    totalLessons: 5,
    usedLessons: 0,
    remainingLessons: 5,
    validFrom: '2026-05-02',
    validUntil: '',
    timeBand: '非黄金时段',
    ownerCoach: '朝珺',
    allowedCoaches: ['mira', '小舟']
  },
  'purchase should create a matching entitlement account'
);

assert.deepStrictEqual(
  rules.buildPurchaseRecord(pkg, purchase, { id: 'stu-1', name: '张三', phone: '13800000000' }, { id: 'pur-1', now: '2026-04-12 00:00:00', operator: '管理员' }),
  {
    id: 'pur-1',
    studentId: 'stu-1',
    studentName: '张三',
    studentPhone: '13800000000',
    packageId: 'pkg-1',
    packageName: '五一私教非黄金课包',
    productId: 'prod-1',
    productName: '成人私教',
    courseType: '私教课',
    packageLessons: 5,
    packagePrice: 1000,
    packageTimeBand: '非黄金时段',
    dailyTimeWindows: [{ label: '非黄金时段', startTime: '07:00', endTime: '17:00', daysOfWeek: [1, 2, 3, 4, 5] }],
    coachIds: ['coach-1'],
    coachNames: ['朝珺'],
    campusIds: ['shunyi_mapo'],
    ownerCoach: '朝珺',
    allowedCoaches: ['mira', '小舟'],
    priceSource: 'package',
    priceSourceId: 'pkg-1',
    priceSourceName: '五一私教非黄金课包',
    systemAmount: 1000,
    finalAmount: 1000,
    priceOverridden: false,
    overrideReason: '',
    usageStartDate: '2026-05-01',
    usageEndDate: '2026-07-01',
    purchaseDate: '2026-05-02',
    amountPaid: 1000,
    payMethod: '微信',
    operator: '管理员',
    status: 'active',
    createdAt: '2026-04-12 00:00:00',
    updatedAt: '2026-04-12 00:00:00'
  },
  'purchase should store immutable package and student snapshots'
);

assert.deepStrictEqual(
  {
    systemAmount: rules.buildPurchaseRecord(
      pkg,
      { ...purchase, amountPaid: 880, overrideReason: '老客补差优惠' },
      { id: 'stu-1', name: '张三', phone: '13800000000' },
      { id: 'pur-override', now: '2026-04-12 00:00:00', operator: '管理员' }
    ).systemAmount,
    finalAmount: rules.buildPurchaseRecord(
      pkg,
      { ...purchase, amountPaid: 880, overrideReason: '老客补差优惠' },
      { id: 'stu-1', name: '张三', phone: '13800000000' },
      { id: 'pur-override', now: '2026-04-12 00:00:00', operator: '管理员' }
    ).finalAmount,
    priceOverridden: rules.buildPurchaseRecord(
      pkg,
      { ...purchase, amountPaid: 880, overrideReason: '老客补差优惠' },
      { id: 'stu-1', name: '张三', phone: '13800000000' },
      { id: 'pur-override', now: '2026-04-12 00:00:00', operator: '管理员' }
    ).priceOverridden,
    overrideReason: rules.buildPurchaseRecord(
      pkg,
      { ...purchase, amountPaid: 880, overrideReason: '老客补差优惠' },
      { id: 'stu-1', name: '张三', phone: '13800000000' },
      { id: 'pur-override', now: '2026-04-12 00:00:00', operator: '管理员' }
    ).overrideReason
  },
  {
    systemAmount: 1000,
    finalAmount: 880,
    priceOverridden: true,
    overrideReason: '老客补差优惠'
  },
  'purchase snapshot should keep system price, final deal price and override reason'
);

assert.throws(
  () => rules.buildPurchaseRecord(
    pkg,
    { ...purchase, amountPaid: 880, overrideReason: '' },
    { id: 'stu-1', name: '张三', phone: '13800000000' },
    { id: 'pur-override', now: '2026-04-12 00:00:00', operator: '管理员' }
  ),
  /请填写改价原因/,
  'purchase snapshot should require override reason when final deal price differs from system price'
);

assert.throws(
  () => rules.validateProductInput({ name: '', type: '私教', maxStudents: 1, price: 0, lessons: 0 }),
  /请填写课程名称/,
  'product name is required'
);

assert.throws(
  () => rules.validateProductInput({ name: '成人私教', type: '', maxStudents: 1, price: 0, lessons: 0 }),
  /请选择课程类型/,
  'product type is required'
);

assert.throws(
  () => rules.validateProductInput({ name: '成人私教', type: '私教', maxStudents: 0, price: 0, lessons: 0 }),
  /人数必须大于 0/,
  'product max students must be positive'
);

assert.throws(
  () => rules.validateProductInput({ name: '成人私教', type: '私教', maxStudents: 1, price: -1, lessons: 0 }),
  /价格不能小于 0/,
  'product price cannot be negative'
);

assert.throws(
  () => rules.validateProductInput({ name: '成人私教', type: '私教', maxStudents: 1, price: 0, lessons: -1 }),
  /课时不能小于 0/,
  'product lessons cannot be negative'
);

assert.throws(
  () => rules.validatePackageInput({ ...pkg, productId: 'missing' }, { products: [{ id: 'prod-1' }], coaches: [{ name: '朝珺' }], campuses: [{ id: 'shunyi_mapo' }] }),
  /课程产品不存在/,
  'package must reference an existing product'
);

assert.doesNotThrow(
  () => rules.validatePackageInput({ ...pkg, productId: '', productName: '' }, { products: [{ id: 'prod-1' }], coaches: [{ id: 'coach-1', name: '朝珺' }], campuses: [{ id: 'shunyi_mapo' }] }),
  'package-only rule should allow package without product id when course type is present'
);

assert.throws(
  () => rules.validatePackageInput({ ...pkg, courseType: '', type: '' }, { products: [{ id: 'prod-1' }], coaches: [{ id: 'coach-1', name: '朝珺' }], campuses: [{ id: 'shunyi_mapo' }] }),
  /请填写课程类型/,
  'package should require course type even when product still exists'
);

assert.throws(
  () => rules.validatePackageInput({ ...pkg, saleStartDate: '2026-06-01', saleEndDate: '2026-05-01' }, { products: [{ id: 'prod-1' }], coaches: [{ name: '朝珺' }], campuses: [{ id: 'shunyi_mapo' }] }),
  /活动结束时间不能早于活动开始时间/,
  'package sale date range must be valid'
);

assert.throws(
  () => rules.validatePackageInput({ ...pkg, price: 0 }, { products: [{ id: 'prod-1' }], coaches: [{ name: '朝珺' }], campuses: [{ id: 'shunyi_mapo' }] }),
  /价格必须大于 0/,
  'package price must be positive'
);

assert.throws(
  () => rules.validatePackageInput({ ...pkg, dailyTimeWindows: [{ startTime: '10:00', endTime: '09:00' }] }, { products: [{ id: 'prod-1' }], coaches: [{ name: '朝珺' }], campuses: [{ id: 'shunyi_mapo' }] }),
  /可用结束时间必须晚于开始时间/,
  'package daily time windows must be valid'
);

assert.throws(
  () => rules.validatePurchaseInputForPackage({ ...pkg, status: 'inactive' }, purchase),
  /该课包已停用/,
  'inactive package cannot be newly purchased'
);

const smallGroupBootcampPackage = {
  ...pkg,
  id: 'pkg-small-bootcamp',
  name: '小班训练营',
  productId: '',
  productName: '',
  courseType: '小班课',
  smallClassType: 'bootcamp',
  price: 1888,
  lessons: 10,
  timeBand: '黄金时段',
  maxStudents: 4,
  fixedStudentCount: 4,
  minAttendStudents: 2,
  freeAbsenceLimit: 1
};

assert.doesNotThrow(
  () => rules.validatePackageInput(smallGroupBootcampPackage, { products: [], coaches: [{ id: 'coach-1', name: '朝珺' }], campuses: [{ id: 'shunyi_mapo' }] }),
  'small group bootcamp package should be a valid package-only small class product'
);

for(const lessons of [10,20,12]){
  assert.doesNotThrow(
    () => rules.validatePackageInput({ ...smallGroupBootcampPackage, lessons }, { products: [], coaches: [{ id: 'coach-1', name: '朝珺' }], campuses: [{ id: 'shunyi_mapo' }] }),
    `small group bootcamp should allow ${lessons} lessons`
  );
}

for(const smallClassPackage of [
  { ...smallGroupBootcampPackage, smallClassType: 'single', price: 199, lessons: 1, timeBand: '全天', fixedStudentCount: 0 },
  { ...smallGroupBootcampPackage, smallClassType: 'bootcamp', price: 2888, lessons: 10 },
  { ...smallGroupBootcampPackage, smallClassType: 'dropin', price: 999, lessons: 6, timeBand: '全天', fixedStudentCount: 0, freeAbsenceLimit: 0 }
]){
  assert.doesNotThrow(
    () => rules.validatePackageInput(smallClassPackage, { products: [], coaches: [{ id: 'coach-1', name: '朝珺' }], campuses: [{ id: 'shunyi_mapo' }] }),
    `${smallClassPackage.smallClassType} small group package should allow custom price`
  );
}

assert.strictEqual(
  rules.normalizePackageRecord(
    { ...smallGroupBootcampPackage, smallClassType: 'single', name: '小班单次课 · 12次 · 全天', price: 1499, lessons: 6, timeBand: '全天', fixedStudentCount: 0, freeAbsenceLimit: 0 },
    null,
    { products: [], coaches: [{ id: 'coach-1', name: '朝珺' }], campuses: [{ id: 'shunyi_mapo' }] }
  ).smallClassType,
  'dropin',
  '1499 small group package should be corrected to dropin when changing the count back to 6'
);

const smallGroupPurchase = rules.buildPurchaseRecord(
  smallGroupBootcampPackage,
  { ...purchase, id: 'pur-small-1', amountPaid: 1888 },
  { id: 'stu-small-1', name: '小班学员', phone: '13800000001' },
  { id: 'pur-small-1', now: '2026-04-12 00:00:00', operator: '管理员' }
);

assert.deepStrictEqual(
  {
    courseType: smallGroupPurchase.courseType,
    smallClassType: smallGroupPurchase.smallClassType,
    packageLessons: smallGroupPurchase.packageLessons,
    packagePrice: smallGroupPurchase.packagePrice,
    maxStudents: smallGroupPurchase.maxStudents,
    fixedStudentCount: smallGroupPurchase.fixedStudentCount,
    minAttendStudents: smallGroupPurchase.minAttendStudents,
    freeAbsenceLimit: smallGroupPurchase.freeAbsenceLimit
  },
  {
    courseType: '小班课',
    smallClassType: 'bootcamp',
    packageLessons: 10,
    packagePrice: 1888,
    maxStudents: 4,
    fixedStudentCount: 4,
    minAttendStudents: 2,
    freeAbsenceLimit: 1
  },
  'small group purchase should keep the bootcamp rule snapshot'
);

const smallGroupEntitlement = rules.buildEntitlementFromPurchase(
  smallGroupBootcampPackage,
  smallGroupPurchase,
  { id: 'stu-small-1', name: '小班学员' },
  'ent-small-1',
  '2026-04-12 00:00:00'
);

assert.deepStrictEqual(
  {
    courseType: smallGroupEntitlement.courseType,
    smallClassType: smallGroupEntitlement.smallClassType,
    totalLessons: smallGroupEntitlement.totalLessons,
    freeAbsenceLimit: smallGroupEntitlement.freeAbsenceLimit,
    freeAbsenceUsed: smallGroupEntitlement.freeAbsenceUsed,
    minAttendStudents: smallGroupEntitlement.minAttendStudents
  },
  {
    courseType: '小班课',
    smallClassType: 'bootcamp',
    totalLessons: 10,
    freeAbsenceLimit: 1,
    freeAbsenceUsed: 0,
    minAttendStudents: 2
  },
  'small group entitlement should initialize free absence counters'
);

const smallTrialEntitlement = {
  ...entitlement,
  id: 'ent-small-trial',
  studentId: 'stu-small-trial',
  courseType: '体验课',
  experienceType: '小班体验课',
  packageName: '小班体验课 · 成人 · 2次 · 全天',
  totalLessons: 2,
  usedLessons: 0,
  remainingLessons: 2,
  maxStudents: 4,
  timeBand: '全天',
  dailyTimeWindows: [],
  campusIds: ['shunyi_mapo']
};
const smallTrialSchedule = {
  id: 'sch-small-trial',
  studentIds: ['stu-small-trial'],
  courseType: '体验课',
  experienceType: '小班体验课',
  entitlementId: 'ent-small-trial',
  settlementType: 'package',
  startTime: '2026-06-04 14:00',
  endTime: '2026-06-04 15:30',
  campus: 'shunyi_mapo',
  lessonCount: 1.5,
  status: '已排课'
};

assert.doesNotThrow(
  () => rules.validateEntitlementForSchedule(smallTrialEntitlement, smallTrialSchedule),
  'small group trial lesson should validate against one remaining package count even when scheduled for 1.5 hours'
);

assert.deepStrictEqual(
  rules.scheduleEntitlementDeltas(smallTrialSchedule),
  [{ entitlementId: 'ent-small-trial', delta: 1 }],
  'small group trial lesson should consume one package count, not scheduled hours'
);

assert.deepStrictEqual(
  rules.collectShunyiMapoSeedStaleRowIds(
    [
      { id: 'seed-ledger-old', seedTag: 'shunyi_mapo-finance-seed-v7' },
      { id: 'seed-ledger-keep', seedTag: 'shunyi_mapo-finance-seed-v8' },
      { id: 'manual-ledger', seedTag: '' }
    ],
    [{ id: 'seed-ledger-keep' }],
    'shunyi_mapo-finance-seed-v8'
  ),
  ['seed-ledger-old'],
  'seed bootstrap should clean old shunyi_mapo finance rows that are no longer in the current seed set'
);

assert.deepStrictEqual(
  rules.collectShunyiMapoSeedImportedLedgerReplacementIds(
    [
      { id: 'legacy-month-1', entitlementId: 'seed-entitlement-001', purchaseId: 'seed-purchase-001', studentId: 'seed-student-001', scheduleId: '', lessonDelta: -5, reason: '历史导入 1月消课', relatedDate: '2026-01-28', sourceMonth: '', seedTag: '' },
      { id: 'legacy-month-2', entitlementId: 'seed-entitlement-001', purchaseId: 'seed-purchase-001', studentId: 'seed-student-001', scheduleId: '', lessonDelta: -2, reason: '历史导入 2月消课', relatedDate: '2026-02-28', sourceMonth: '', seedTag: '' },
      { id: 'manual-adjust', entitlementId: 'seed-entitlement-001', purchaseId: 'seed-purchase-001', studentId: 'seed-student-001', scheduleId: '', lessonDelta: -1, reason: '人工补扣', relatedDate: '2026-03-28', sourceMonth: '', seedTag: '' },
      { id: 'other-student', entitlementId: 'seed-entitlement-999', purchaseId: 'seed-purchase-999', studentId: 'seed-student-999', scheduleId: '', lessonDelta: -5, reason: '历史导入 1月消课', relatedDate: '2026-01-31', sourceMonth: '', seedTag: '' }
    ],
    [
      { id: 'seed-ledger-001-01-1', entitlementId: 'seed-entitlement-001', purchaseId: 'seed-purchase-001', studentId: 'seed-student-001', scheduleId: '', lessonDelta: -5, reason: '历史导入 1月消课', sourceMonth: '2026-01', seedTag: 'shunyi_mapo-finance-seed-v8' },
      { id: 'seed-ledger-001-02-1', entitlementId: 'seed-entitlement-001', purchaseId: 'seed-purchase-001', studentId: 'seed-student-001', scheduleId: '', lessonDelta: -2, reason: '历史导入 2月消课', sourceMonth: '2026-02', seedTag: 'shunyi_mapo-finance-seed-v8' }
    ]
  ),
  ['legacy-month-1', 'legacy-month-2'],
  'seed bootstrap should replace old imported monthly ledger rows for the same seeded purchase even when those rows were written without seedTag'
);

assert.deepStrictEqual(
  rules.collectDuplicateImportedLedgerIds(
    [
      { id: 'legacy-1', entitlementId: 'ent-1', purchaseId: 'pur-1', studentId: 'stu-1', scheduleId: '', lessonDelta: -5, reason: '历史导入 1月消课', relatedDate: '2026-01-28', sourceMonth: '', notes: '固定周六', seedTag: '' },
      { id: 'seed-1', entitlementId: 'ent-1', purchaseId: 'pur-1', studentId: 'stu-1', scheduleId: '', lessonDelta: -5, reason: '历史导入 1月消课', relatedDate: '2026-01-31', sourceMonth: '2026-01', notes: '固定周六', seedTag: 'shunyi_mapo-finance-seed-v8' },
      { id: 'legacy-2', entitlementId: 'ent-1', purchaseId: 'pur-1', studentId: 'stu-1', scheduleId: '', lessonDelta: -2, reason: '历史导入 2月消课', relatedDate: '2026-02-28', sourceMonth: '', notes: '固定周六', seedTag: '' },
      { id: 'manual-adjust', entitlementId: 'ent-1', purchaseId: 'pur-1', studentId: 'stu-1', scheduleId: '', lessonDelta: -1, reason: '人工补扣', relatedDate: '2026-02-28', sourceMonth: '', notes: '异常处理', seedTag: '' },
      { id: 'different-delta', entitlementId: 'ent-1', purchaseId: 'pur-1', studentId: 'stu-1', scheduleId: '', lessonDelta: -1, reason: '历史导入 1月消课', relatedDate: '2026-01-31', sourceMonth: '', notes: '固定周六', seedTag: '' }
    ]
  ),
  ['legacy-1', 'different-delta'],
  'generic imported ledger cleanup should let current monthly imports replace old rows for the same package month and keep unrelated adjustments'
);

assert.throws(
  () => rules.validatePurchaseInputForPackage({ ...pkg, saleStartDate: '2026-06-01', saleEndDate: '2026-06-30' }, purchase),
  /不在课包活动购买时间内/,
  'purchase date must be inside sale window'
);

const packageOnlyPurchase = rules.buildPurchaseRecord(
  { ...pkg, productId: '', productName: '' },
  purchase,
  { id: 'stu-1', name: '张三', phone: '13800000000' },
  { id: 'pur-package-only', now: '2026-04-12 00:00:00', operator: '管理员' }
);

const packageOnlyEntitlement = rules.buildEntitlementFromPurchase(
  { ...pkg, productId: '', productName: '' },
  { ...purchase, id: 'pur-package-only' },
  { id: 'stu-1', name: '张三' },
  'ent-package-only',
  '2026-04-12 00:00:00'
);

assert.deepStrictEqual(
  {
    purchaseProductId: packageOnlyPurchase.productId,
    purchaseCourseType: packageOnlyPurchase.courseType,
    entitlementProductId: packageOnlyEntitlement.productId,
    entitlementCourseType: packageOnlyEntitlement.courseType
  },
  {
    purchaseProductId: '',
    purchaseCourseType: '私教课',
    entitlementProductId: '',
    entitlementCourseType: '私教课'
  },
  'package-only purchase chain should keep empty product id while preserving required course type'
);

assert.doesNotThrow(
  () => rules.validateEntitlementForSchedule(entitlement, {
    id: 'sch-1',
    studentIds: ['stu-1'],
    courseType: '私教课',
    coachId: 'coach-1',
    coach: '朝珺',
    campus: 'shunyi_mapo',
    startTime: '2026-05-04 09:00',
    endTime: '2026-05-04 10:00',
    lessonCount: 1,
    status: '已排课'
  }),
  'matching non-prime package can be consumed'
);

assert.doesNotThrow(
  () => rules.validateEntitlementForSchedule(entitlement, {
    id: 'sch-campus-name',
    studentIds: ['stu-1'],
    courseType: '私教课',
    coachId: 'coach-1',
    coach: '朝珺',
    campus: '顺义马坡',
    startTime: '2026-05-04 09:00',
    endTime: '2026-05-04 10:00',
    lessonCount: 1,
    status: '已排课'
  }),
  'campus display name should match the same stored campus code'
);

assert.strictEqual(
  rules.normalizeCampusValue(legacyMapoCode),
  'shunyi_mapo',
  'legacy mapo campus code should normalize to shunyi_mapo on backend'
);

assert.doesNotThrow(
  () => rules.validateEntitlementForSchedule({ ...entitlement, campusIds: [legacyMapoCode] }, {
    id: 'sch-campus-legacy-mapo',
    studentIds: ['stu-1'],
    courseType: '私教课',
    coachId: 'coach-1',
    coach: '朝珺',
    campus: 'shunyi_mapo',
    startTime: '2026-05-04 09:00',
    endTime: '2026-05-04 10:00',
    lessonCount: 1,
    status: '已排课'
  }),
  'legacy mapo package campus should be usable for shunyi_mapo schedules'
);

assert.doesNotThrow(
  () => rules.validateEntitlementForSchedule({ ...entitlement, ownerCoach: '朝珺', allowedCoaches: ['mira'] }, {
    id: 'sch-owner-allowed',
    studentIds: ['stu-1'],
    courseType: '私教课',
    coach: 'mira',
    campus: 'shunyi_mapo',
    startTime: '2026-05-04 09:00',
    endTime: '2026-05-04 10:00',
    lessonCount: 1,
    status: '已排课'
  }),
  'sold package allowed coaches should be usable in scheduling'
);

assert.doesNotThrow(
  () => rules.validateEntitlementForSchedule({ ...entitlement, coachIds: [], coachNames: [], ownerCoach: 'chaojun', allowedCoaches: [] }, {
    id: 'sch-owner-alias',
    studentIds: ['stu-1'],
    courseType: '私教课',
    coach: '朝珺',
    coachRefs: [{ id: 'chaojun', name: '朝珺' }],
    campus: 'shunyi_mapo',
    startTime: '2026-05-04 09:00',
    endTime: '2026-05-04 10:00',
    lessonCount: 1,
    status: '已排课'
  }),
  'owner coach id should match the same coach display name during scheduling'
);

assert.doesNotThrow(
  () => rules.validateEntitlementForSchedule({ ...entitlement, coachIds: [], coachNames: [], ownerCoach: '朝珺', allowedCoaches: ['mira'] }, {
    id: 'sch-owner-block',
    studentIds: ['stu-1'],
    courseType: '私教课',
    coach: '小舟',
    campus: 'shunyi_mapo',
    startTime: '2026-05-04 09:00',
    endTime: '2026-05-04 10:00',
    lessonCount: 1,
    status: '已排课'
  }),
  'sold package should allow any coach to teach when the owner coach is unavailable'
);

const legacyMapoPackageRecommendation = rules.recommendEntitlements([
  {
    ...entitlement,
    id: 'ent-mz-legacy-mapo',
    packageName: '成人1v1 朝珺非黄金10课时',
    ownerCoach: '朝珺教练',
    allowedCoaches: ['岳克舟教练'],
    coachNames: ['岳克舟教练'],
    coachIds: ['coach-yuekezhou'],
    campusIds: [legacyMapoCode],
    remainingLessons: 2
  }
], {
  studentIds: ['stu-1'],
  courseType: '私教课',
  coachId: 'coach-yuekezhou',
  coach: '岳克舟教练',
  campus: 'shunyi_mapo',
  startTime: '2026-06-19 11:00',
  endTime: '2026-06-19 12:00',
  lessonCount: 1,
  status: '已排课',
  coachRefs: [{ id: 'coach-yuekezhou', name: '岳克舟教练' }]
});
assert.strictEqual(
  legacyMapoPackageRecommendation.recommended.entitlementId,
  'ent-mz-legacy-mapo',
  'legacy M.Z mapo package should remain selectable for shunyi_mapo and the actual allowed coach'
);

assert.doesNotThrow(
  () => rules.validateEntitlementForSchedule(entitlement, {
    id: 'sch-2',
    studentIds: ['stu-1'],
    courseType: '私教课',
    coachId: 'coach-1',
    coach: '朝珺',
    campus: 'shunyi_mapo',
    startTime: '2026-05-04 18:00',
    endTime: '2026-05-04 19:00',
    lessonCount: 1,
    status: '已排课'
  }),
  'non-prime package should still be schedulable during prime time with field fee flag'
);

assert.doesNotThrow(
  () => rules.validateEntitlementForSchedule(entitlement, {
    id: 'sch-3',
    studentIds: ['stu-1'],
    courseType: '私教课',
    coachId: 'coach-1',
    coach: '朝珺',
    campus: 'shunyi_mapo',
    startTime: '2026-05-04 16:30',
    endTime: '2026-05-04 17:30',
    lessonCount: 1,
    status: '已排课'
  }),
  'non-prime package should allow schedules outside the window with field fee flag'
);

assert.doesNotThrow(
  () => rules.validateEntitlementForSchedule({ ...entitlement, timeBand: '黄金时间', packageName: '黄金课包', dailyTimeWindows: [
    { label: '黄金时段', startTime: '16:00', endTime: '22:00', daysOfWeek: [1, 2, 3, 4, 5] },
    { label: '黄金时段', startTime: '09:00', endTime: '22:00', daysOfWeek: [6, 7] }
  ] }, {
    id: 'sch-weekend-prime',
    studentIds: ['stu-1'],
    courseType: '私教课',
    coachId: 'coach-1',
    coach: '朝珺',
    campus: 'shunyi_mapo',
    startTime: '2026-05-09 09:00',
    endTime: '2026-05-09 10:00',
    lessonCount: 1,
    status: '已排课'
  }),
  'prime package should support weekend 09:00-22:00 windows'
);

assert.doesNotThrow(
  () => rules.validateEntitlementForSchedule({ ...entitlement, timeBand: '黄金时间', packageName: '黄金课包', dailyTimeWindows: [
    { label: '黄金时段', startTime: '16:00', endTime: '22:00', daysOfWeek: [1, 2, 3, 4, 5] },
    { label: '黄金时段', startTime: '09:00', endTime: '22:00', daysOfWeek: [6, 7] }
  ] }, {
    id: 'sch-weekday-not-prime',
    studentIds: ['stu-1'],
    courseType: '私教课',
    coachId: 'coach-1',
    coach: '朝珺',
    campus: 'shunyi_mapo',
    startTime: '2026-05-06 09:00',
    endTime: '2026-05-06 10:00',
    lessonCount: 1,
    status: '已排课'
  }),
  'prime package should also cover weekday non-prime time without field fee'
);

assert.throws(
  () => rules.validateEntitlementForSchedule(entitlement, {
    id: 'sch-4',
    studentIds: ['stu-1'],
    courseType: '团课',
    coachId: 'coach-1',
    coach: '朝珺',
    campus: 'shunyi_mapo',
    startTime: '2026-05-04 09:00',
    endTime: '2026-05-04 10:00',
    lessonCount: 1,
    status: '已排课'
  }),
  /课程类型不匹配/,
  'private package should not pay for group class'
);

assert.throws(
  () => rules.validateEntitlementForSchedule({ ...entitlement, remainingLessons: 0 }, {
    id: 'sch-5',
    studentIds: ['stu-1'],
    courseType: '私教课',
    coachId: 'coach-1',
    coach: '朝珺',
    campus: 'shunyi_mapo',
    startTime: '2026-05-04 09:00',
    endTime: '2026-05-04 10:00',
    lessonCount: 1,
    status: '已排课'
  }),
  /剩余课时不足/,
  'depleted package cannot be consumed'
);

assert.deepStrictEqual(
  rules.recommendEntitlements([
    { ...entitlement, id: 'ent-late', packageName: '六一私教非黄金课包', validUntil: '2026-08-01', remainingLessons: 5 },
    { ...entitlement, id: 'ent-soon', packageName: '五一私教非黄金课包', validUntil: '2026-07-01', remainingLessons: 3 }
  ], {
    studentIds: ['stu-1'],
    courseType: '私教课',
    coachId: 'coach-1',
    coach: '朝珺',
    campus: 'shunyi_mapo',
    startTime: '2026-05-04 09:00',
    endTime: '2026-05-04 10:00',
    lessonCount: 1,
    status: '已排课'
  }).recommended.id,
  'ent-soon',
  'system should recommend the soonest expiring matching package'
);

const primeTimeRecommendation = rules.recommendEntitlements([
  { ...entitlement, id: 'ent-non-prime', packageName: '私教非黄金课包', validUntil: '2026-07-01', remainingLessons: 3 }
], {
  studentIds: ['stu-1'],
  courseType: '私教课',
  coachId: 'coach-1',
  coach: '朝珺',
  campus: '顺义马坡',
  startTime: '2026-05-04 18:00',
  endTime: '2026-05-04 19:00',
  lessonCount: 1,
  status: '已排课'
});
assert.strictEqual(primeTimeRecommendation.recommended.entitlementId, 'ent-non-prime');
assert.strictEqual(primeTimeRecommendation.recommended.requiresFieldFee, true, 'prime-time use of non-prime package should be marked for field fee');

const staleWindowGoldRecommendation = rules.recommendEntitlements([
  {
    ...entitlement,
    id: 'ent-gold-stale-window',
    packageName: '成人1v1 黄金时间10课时',
    timeBand: '黄金时间',
    remainingLessons: 3,
    dailyTimeWindows: [{ label: '旧非黄窗口', startTime: '09:00', endTime: '16:00', daysOfWeek: [1, 2, 3, 4, 5] }]
  }
], {
  studentIds: ['stu-1'],
  courseType: '私教课',
  coachId: 'coach-1',
  coach: '朝珺',
  campus: 'shunyi_mapo',
  startTime: '2026-05-04 18:00',
  endTime: '2026-05-04 19:00',
  lessonCount: 1,
  status: '已排课'
});
assert.strictEqual(staleWindowGoldRecommendation.recommended.entitlementId, 'ent-gold-stale-window', 'gold package should use gold time-band rules even when stale non-prime windows remain');
assert.strictEqual(staleWindowGoldRecommendation.options[0].requiresFieldFee, false, 'gold package in gold time should not require field fee');

const goldToNonPrimeRecommendation = rules.recommendEntitlements([
  {
    ...entitlement,
    id: 'ent-gold-to-nonprime',
    packageName: '成人1v1 黄金时间10课时',
    timeBand: '黄金时间',
    remainingLessons: 3,
    dailyTimeWindows: [
      { label: '黄金时段', startTime: '16:00', endTime: '22:00', daysOfWeek: [1, 2, 3, 4, 5] },
      { label: '黄金时段', startTime: '09:00', endTime: '22:00', daysOfWeek: [6, 7] }
    ]
  }
], {
  studentIds: ['stu-1'],
  courseType: '私教课',
  coachId: 'coach-1',
  coach: '朝珺',
  campus: 'shunyi_mapo',
  startTime: '2026-05-06 09:00',
  endTime: '2026-05-06 10:00',
  lessonCount: 1,
  status: '已排课'
});
assert.strictEqual(goldToNonPrimeRecommendation.recommended.entitlementId, 'ent-gold-to-nonprime', 'gold package should be selectable in weekday non-prime time');
assert.strictEqual(goldToNonPrimeRecommendation.options[0].requiresFieldFee, false, 'gold package in non-prime time should not require field fee');

const compoundCoachSlashRecommendation = rules.recommendEntitlements([
  {
    ...entitlement,
    id: 'ent-compound-slash-coach',
    packageName: '成人1v1 朝珺非黄金10课时',
    ownerCoach: 'Siren/天昊',
    allowedCoaches: ['Siren/天昊'],
    coachIds: ['Siren/天昊'],
    coachNames: ['Siren/天昊'],
    remainingLessons: 5
  }
], {
  studentIds: ['stu-1'],
  courseType: '私教课',
  coachId: 'Rive 天昊教练',
  coach: 'Rive 天昊教练',
  campus: 'shunyi_mapo',
  startTime: '2026-05-04 18:00',
  endTime: '2026-05-04 19:00',
  lessonCount: 1,
  status: '已排课'
});
assert.strictEqual(compoundCoachSlashRecommendation.recommended.entitlementId, 'ent-compound-slash-coach', 'slash-separated legacy coach names should match the selected coach');
assert.strictEqual(compoundCoachSlashRecommendation.recommended.requiresFieldFee, true, 'slash-separated coach package should keep non-prime to prime field-fee flag');

const compoundCoachPlusRecommendation = rules.recommendEntitlements([
  {
    ...entitlement,
    id: 'ent-compound-plus-coach',
    packageName: '成人1v1 朝珺黄金10课时（历史）',
    timeBand: '黄金时段',
    ownerCoach: 'Siren+老吴',
    allowedCoaches: ['Siren+老吴'],
    coachIds: ['Siren+老吴'],
    coachNames: ['Siren+老吴'],
    remainingLessons: 3
  }
], {
  studentIds: ['stu-1'],
  courseType: '私教课',
  coachId: '刘润扬教练',
  coach: '刘润扬教练',
  campus: 'shunyi_mapo',
  startTime: '2026-05-09 16:00',
  endTime: '2026-05-09 17:00',
  lessonCount: 1,
  status: '已排课',
  coachRefs: [
    { id: 'c69e1bae-1d14-4be3-bb61-64755e4ccd55', name: '刘润扬教练' },
    { id: '老吴', name: '刘润扬教练' }
  ]
});
assert.strictEqual(compoundCoachPlusRecommendation.recommended.entitlementId, 'ent-compound-plus-coach', 'plus-separated legacy coach names should match coach aliases from refs');

const coachSuffixRecommendation = rules.recommendEntitlements([
  {
    ...entitlement,
    id: 'ent-coach-suffix',
    packageName: '成人1v1 黄金时间10课时',
    timeBand: '黄金时段',
    ownerCoach: '晓哲教练',
    allowedCoaches: ['晓哲教练'],
    coachIds: ['晓哲教练'],
    coachNames: ['晓哲教练'],
    remainingLessons: 3,
    dailyTimeWindows: [
      { label: '工作日', startTime: '16:00', endTime: '22:00', daysOfWeek: [1, 2, 3, 4, 5] },
      { label: '周六日', startTime: '09:00', endTime: '22:00', daysOfWeek: [6, 7] }
    ]
  }
], {
  studentIds: ['stu-1'],
  courseType: '私教课',
  coachId: '晓哲',
  coach: '晓哲',
  campus: 'shunyi_mapo',
  startTime: '2026-05-16 10:00',
  endTime: '2026-05-16 11:30',
  lessonCount: 1.5,
  status: '已排课'
});
assert.strictEqual(coachSuffixRecommendation.recommended.entitlementId, 'ent-coach-suffix', 'coach name with 教练 suffix should match the same selected coach');

const coachUuidRecommendation = rules.recommendEntitlements([
  {
    ...entitlement,
    id: 'ent-coach-uuid',
    packageName: '成人1v1 UUID 教练课包',
    ownerCoach: 'Siren 教练',
    allowedCoaches: ['Siren 教练'],
    coachIds: ['coach-siren-uuid'],
    coachNames: ['Siren 教练'],
    remainingLessons: 6,
    campusIds: ['shunyi_mapo'],
    timeBand: '非黄金时段'
  }
], {
  studentIds: ['stu-1'],
  courseType: '私教课',
  coachId: 'Siren 教练',
  coach: 'Siren 教练',
  campus: 'shunyi_mapo',
  startTime: '2026-05-26 10:00',
  endTime: '2026-05-26 11:00',
  lessonCount: 1,
  status: '已排课',
  coachRefs: [{ id: 'coach-siren-uuid', name: 'Siren 教练' }]
});
assert.strictEqual(coachUuidRecommendation.recommended.entitlementId, 'ent-coach-uuid', 'coach uuid should match the selected coach display name when coach refs are available');

const anyCoachRecommendation = rules.recommendEntitlements([
  {
    ...entitlement,
    id: 'ent-any-coach',
    packageName: '成人1v1 非黄时间20课时',
    timeBand: '非黄金时段',
    ownerCoach: '不固定',
    allowedCoaches: ['不固定'],
    coachIds: ['不固定'],
    coachNames: ['不固定'],
    remainingLessons: 8
  }
], {
  studentIds: ['stu-1'],
  courseType: '私教课',
  coachId: '晓哲',
  coach: '晓哲',
  campus: 'shunyi_mapo',
  startTime: '2026-05-26 10:00',
  endTime: '2026-05-26 11:00',
  lessonCount: 1,
  status: '已排课'
});
assert.strictEqual(anyCoachRecommendation.recommended.entitlementId, 'ent-any-coach', '不固定 coach packages should match any selected coach');

assert.strictEqual(
  rules.applyEntitlementLessonDelta({ ...entitlement, usedLessons: 1, remainingLessons: 4 }, -1).remainingLessons,
  3,
  'consume should reduce remaining lessons'
);

assert.strictEqual(
  rules.applyEntitlementLessonDelta({ ...entitlement, usedLessons: 2, remainingLessons: 3 }, 1).remainingLessons,
  4,
  'cancelled schedule should return lessons'
);

assert.deepStrictEqual(
  rules.diffScheduleEntitlementDeltas(
    [{ entitlementId: 'ent-1', delta: 2 }],
    [{ entitlementId: 'ent-1', delta: 2 }]
  ),
  { returns: [], consumes: [] },
  'unchanged schedule entitlement should not write duplicate return and consume ledger rows'
);

assert.deepStrictEqual(
  rules.diffScheduleEntitlementDeltas(
    [{ entitlementId: 'ent-old', delta: 1 }],
    [{ entitlementId: 'ent-new', delta: 1 }]
  ),
  {
    returns: [{ entitlementId: 'ent-old', delta: 1 }],
    consumes: [{ entitlementId: 'ent-new', delta: 1 }]
  },
  'changed schedule entitlement should return old package and consume new package'
);

assert.deepStrictEqual(
  rules.syncEntitlementFromPurchase(
    { ...pkg, id: 'pkg-2', name: '新课包', lessons: 8, usageEndDate: '2026-08-01' },
    { ...purchase, id: 'pur-1', packageId: 'pkg-2', packageName: '新课包', purchaseDate: '2026-05-03' },
    { id: 'stu-1', name: '张三' },
    { ...entitlement, id: 'ent-1', usedLessons: 2, remainingLessons: 3, createdAt: '2026-04-01 00:00:00' },
    '2026-04-12 00:00:00'
  ).remainingLessons,
  6,
  'editing purchase should rebuild entitlement snapshot while preserving used lessons'
);

assert.doesNotThrow(
  () => rules.assertCanEditPackageWithPurchases(
    pkg,
    { ...pkg, lessons: 8 },
    [{ id: 'pur-1', packageId: 'pkg-1' }]
  ),
  'sold package should allow changing core lesson count'
);

assert.doesNotThrow(
  () => rules.assertCanEditPackageWithPurchases(
    pkg,
    { ...pkg, price: 1200, status: 'inactive' },
    [{ id: 'pur-1', packageId: 'pkg-1' }]
  ),
  'sold package should allow changing price and sale status'
);

assert.doesNotThrow(
  () => rules.assertCanEditPackageWithPurchases(
    pkg,
    { ...pkg, dailyTimeWindows: [{ label: '非黄金时段', startTime: '08:00', endTime: '17:00', daysOfWeek: [1, 2, 3, 4, 5] }] },
    [{ id: 'pur-1', packageId: 'pkg-1' }]
  ),
  'sold package should allow changing available time windows'
);

assert.doesNotThrow(
  () => rules.assertCanEditPackageWithPurchases(
    pkg,
    { ...pkg, courseType: '体验课', ownerCoach: 'mira', timeBand: '全天', validDays: 90, saleStartDate: '2026-05-01', saleEndDate: '2026-06-01', usageStartDate: '2026-05-10', usageEndDate: '2026-08-10' },
    [{ id: 'pur-1', packageId: 'pkg-1' }]
  ),
  'sold package should allow changing course type, owner coach, time band and date ranges'
);

assert.deepStrictEqual(
  rules.buildPackageDeactivateUpdate(
    { ...pkg, validDays: undefined, status: 'active', updatedAt: '2026-05-01 00:00:00' },
    { ...pkg, validDays: undefined, status: 'inactive' },
    '2026-06-04 00:00:00'
  ),
  { ...pkg, validDays: undefined, status: 'inactive', updatedAt: '2026-06-04 00:00:00' },
  'deactivating a legacy package should only change sale status even when validDays is missing'
);

assert.deepStrictEqual(
  rules.syncSoldPackageRuleSnapshots(
    {
      ...pkg,
      courseType: '体验课',
      ownerCoach: 'mira',
      timeBand: '全天',
      validDays: 0,
      saleStartDate: '2026-05-01',
      saleEndDate: '2026-06-01',
      usageStartDate: '2026-05-10',
      usageEndDate: '',
      dailyTimeWindows: [{ label: '全天', startTime: '08:00', endTime: '20:00', daysOfWeek: [] }]
    },
    [
      { id: 'pur-1', packageId: 'pkg-1', purchaseDate: '2026-05-02', courseType: '私教课', packageTimeBand: '非黄金时段', dailyTimeWindows: pkg.dailyTimeWindows, ownerCoach: '朝珺', status: 'active' },
      { id: 'pur-voided', packageId: 'pkg-1', status: 'voided' },
      { id: 'pur-other', packageId: 'pkg-other', status: 'active' }
    ],
    [
      { id: 'ent-1', packageId: 'pkg-1', purchaseId: 'pur-1', validFrom: '2026-05-02', validUntil: '2026-07-01', usageStartDate: '2026-05-01', usageEndDate: '2026-07-01', courseType: '私教课', timeBand: '非黄金时段', dailyTimeWindows: pkg.dailyTimeWindows, ownerCoach: '朝珺', status: 'active' },
      { id: 'ent-voided', packageId: 'pkg-1', status: 'voided' },
      { id: 'ent-other', packageId: 'pkg-other', status: 'active' }
    ],
    '2026-05-20 00:00:00'
  ),
  {
    purchases: [{
      id: 'pur-1',
      packageId: 'pkg-1',
      courseType: '体验课',
      packageLessons: 5,
      packageTimeBand: '全天',
      dailyTimeWindows: [{ label: '全天', startTime: '08:00', endTime: '20:00', daysOfWeek: [] }],
      ownerCoach: 'mira',
      packagePrice: 1000,
      systemAmount: 1000,
      validDays: 0,
      saleStartDate: '2026-05-01',
      saleEndDate: '2026-06-01',
      usageStartDate: '2026-05-10',
      usageEndDate: '',
      purchaseDate: '2026-05-02',
      status: 'active',
      updatedAt: '2026-05-20 00:00:00'
    }],
    entitlements: [{
      id: 'ent-1',
      packageId: 'pkg-1',
      courseType: '体验课',
      totalLessons: 5,
      usedLessons: 0,
      remainingLessons: 5,
      timeBand: '全天',
      dailyTimeWindows: [{ label: '全天', startTime: '08:00', endTime: '20:00', daysOfWeek: [] }],
      ownerCoach: 'mira',
      purchaseId: 'pur-1',
      validFrom: '2026-05-02',
      validUntil: '',
      usageStartDate: '2026-05-10',
      usageEndDate: '',
      status: 'active',
      updatedAt: '2026-05-20 00:00:00'
    }]
  },
  'editing sold package usage rules should sync active purchase and entitlement snapshots without expiry'
);

assert.strictEqual(
  rules.syncSoldPackageRuleSnapshots(
    { ...pkg, usageEndDate: '', validDays: 90 },
    [{ id: 'pur-1', packageId: 'pkg-1', purchaseDate: '2026-05-02', status: 'active' }],
    [{ id: 'ent-1', packageId: 'pkg-1', purchaseId: 'pur-1', validFrom: '2026-05-02', validUntil: '2026-07-01', status: 'active' }],
    '2026-05-20 00:00:00'
  ).entitlements[0].validUntil,
  '',
  'editing sold package valid days should not create entitlement expiry'
);

assert.doesNotThrow(
  () => rules.assertCanEditPackageWithPurchases(
    pkg,
    { ...pkg, notes: '只改内部备注', status: 'active' },
    [{ id: 'pur-1', packageId: 'pkg-1' }]
  ),
  'sold package can still edit non-core fields'
);

assert.throws(
  () => rules.assertCanEditPurchaseWithLedger(
    { ...purchase, packageId: 'pkg-1', notes: '' },
    { ...purchase, packageId: 'pkg-1', amountPaid: 1200, notes: '' },
    [{ id: 'ent-1', purchaseId: 'pur-1' }],
    [{ id: 'led-1', entitlementId: 'ent-1', lessonDelta: -1 }]
  ),
  /已有课时消耗，只能修改备注/,
  'consumed purchase should not allow changing payment amount'
);

assert.doesNotThrow(
  () => rules.assertCanEditPurchaseWithLedger(
    { ...purchase, packageId: 'pkg-1', notes: '' },
    { ...purchase, packageId: 'pkg-1', notes: '补充备注' },
    [{ id: 'ent-1', purchaseId: 'pur-1' }],
    [{ id: 'led-1', entitlementId: 'ent-1', lessonDelta: -1 }]
  ),
  'consumed purchase can still edit notes'
);

assert.throws(
  () => rules.assertCanDeleteEntitlement('ent-1', [], [{ id: 'ent-1', purchaseId: 'pur-1' }]),
  /来自购买记录，不能删除/,
  'purchase-generated entitlement should not be physically deleted'
);

(async()=>{
  const writes=[];
  const store={
    put:async(table,id,row)=>{writes.push([table,id,row]);if(table==='entitlements')throw new Error('entitlement write failed');},
    del:async(table,id)=>writes.push(['del',table,id])
  };
  await assert.rejects(
    () => rules.writePurchaseAndEntitlementAtomic(store,'purchases','entitlements',{ id:'pur-x' },{ id:'ent-x' }),
    /entitlement write failed/,
    'purchase and entitlement atomic writer should expose entitlement write failure'
  );
  assert.deepStrictEqual(
    writes.map(x=>x.slice(0,3)),
    [['purchases','pur-x',{ id:'pur-x' }],['entitlements','ent-x',{ id:'ent-x' }],['del','purchases','pur-x']],
    'failed entitlement write should roll back purchase write'
  );
})().then(()=>console.log('entitlement async rules tests passed'));

console.log('entitlement rules tests passed');
