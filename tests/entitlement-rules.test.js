const assert = require('assert');
const api = require('../api/index.js');

const rules = api._test;

assert.ok(rules, 'api._test should expose entitlement rule helpers');

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
  campusIds: ['mabao'],
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

const entitlement = rules.buildEntitlementFromPurchase(pkg, purchase, { id: 'stu-1', name: '张三' }, 'ent-1', '2026-04-12T00:00:00.000Z');

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
    validUntil: '2026-07-01',
    timeBand: '非黄金时段',
    ownerCoach: '朝珺',
    allowedCoaches: ['mira', '小舟']
  },
  'purchase should create a matching entitlement account'
);

assert.deepStrictEqual(
  rules.buildPurchaseRecord(pkg, purchase, { id: 'stu-1', name: '张三', phone: '13800000000' }, { id: 'pur-1', now: '2026-04-12T00:00:00.000Z', operator: '管理员' }),
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
    campusIds: ['mabao'],
    ownerCoach: '朝珺',
    allowedCoaches: ['mira', '小舟'],
    usageStartDate: '2026-05-01',
    usageEndDate: '2026-07-01',
    purchaseDate: '2026-05-02',
    amountPaid: 1000,
    payMethod: '微信',
    operator: '管理员',
    status: 'active',
    createdAt: '2026-04-12T00:00:00.000Z',
    updatedAt: '2026-04-12T00:00:00.000Z'
  },
  'purchase should store immutable package and student snapshots'
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
  () => rules.validatePackageInput({ ...pkg, productId: 'missing' }, { products: [{ id: 'prod-1' }], coaches: [{ name: '朝珺' }], campuses: [{ id: 'mabao' }] }),
  /课程产品不存在/,
  'package must reference an existing product'
);

assert.throws(
  () => rules.validatePackageInput({ ...pkg, saleStartDate: '2026-06-01', saleEndDate: '2026-05-01' }, { products: [{ id: 'prod-1' }], coaches: [{ name: '朝珺' }], campuses: [{ id: 'mabao' }] }),
  /活动结束时间不能早于活动开始时间/,
  'package sale date range must be valid'
);

assert.throws(
  () => rules.validatePackageInput({ ...pkg, price: 0 }, { products: [{ id: 'prod-1' }], coaches: [{ name: '朝珺' }], campuses: [{ id: 'mabao' }] }),
  /价格必须大于 0/,
  'package price must be positive'
);

assert.throws(
  () => rules.validatePackageInput({ ...pkg, dailyTimeWindows: [{ startTime: '10:00', endTime: '09:00' }] }, { products: [{ id: 'prod-1' }], coaches: [{ name: '朝珺' }], campuses: [{ id: 'mabao' }] }),
  /可用结束时间必须晚于开始时间/,
  'package daily time windows must be valid'
);

assert.throws(
  () => rules.validatePurchaseInputForPackage({ ...pkg, status: 'inactive' }, purchase),
  /该课包已停用/,
  'inactive package cannot be newly purchased'
);

assert.throws(
  () => rules.validatePurchaseInputForPackage({ ...pkg, saleStartDate: '2026-06-01', saleEndDate: '2026-06-30' }, purchase),
  /不在课包活动购买时间内/,
  'purchase date must be inside sale window'
);

assert.doesNotThrow(
  () => rules.validateEntitlementForSchedule(entitlement, {
    id: 'sch-1',
    studentIds: ['stu-1'],
    courseType: '私教课',
    coachId: 'coach-1',
    coach: '朝珺',
    campus: 'mabao',
    startTime: '2026-05-04 09:00',
    endTime: '2026-05-04 10:00',
    lessonCount: 1,
    status: '已排课'
  }),
  'matching non-prime package can be consumed'
);

assert.doesNotThrow(
  () => rules.validateEntitlementForSchedule({ ...entitlement, coachIds: [], coachNames: [], ownerCoach: '朝珺', allowedCoaches: ['mira'] }, {
    id: 'sch-owner-allowed',
    studentIds: ['stu-1'],
    courseType: '私教课',
    coach: 'mira',
    campus: 'mabao',
    startTime: '2026-05-04 09:00',
    endTime: '2026-05-04 10:00',
    lessonCount: 1,
    status: '已排课'
  }),
  'sold package allowed coaches should be usable in scheduling'
);

assert.throws(
  () => rules.validateEntitlementForSchedule({ ...entitlement, coachIds: [], coachNames: [], ownerCoach: '朝珺', allowedCoaches: ['mira'] }, {
    id: 'sch-owner-block',
    studentIds: ['stu-1'],
    courseType: '私教课',
    coach: '小舟',
    campus: 'mabao',
    startTime: '2026-05-04 09:00',
    endTime: '2026-05-04 10:00',
    lessonCount: 1,
    status: '已排课'
  }),
  /课包可上课教练不匹配/,
  'sold package allowed coaches should restrict scheduling'
);

assert.throws(
  () => rules.validateEntitlementForSchedule(entitlement, {
    id: 'sch-2',
    studentIds: ['stu-1'],
    courseType: '私教课',
    coachId: 'coach-1',
    coach: '朝珺',
    campus: 'mabao',
    startTime: '2026-05-04 18:00',
    endTime: '2026-05-04 19:00',
    lessonCount: 1,
    status: '已排课'
  }),
  /不在课包可用时间段/,
  'non-prime package should not be usable during prime time'
);

assert.throws(
  () => rules.validateEntitlementForSchedule(entitlement, {
    id: 'sch-3',
    studentIds: ['stu-1'],
    courseType: '私教课',
    coachId: 'coach-1',
    coach: '朝珺',
    campus: 'mabao',
    startTime: '2026-05-04 16:30',
    endTime: '2026-05-04 17:30',
    lessonCount: 1,
    status: '已排课'
  }),
  /不在课包可用时间段/,
  'schedule must fit fully inside one available time window'
);

assert.throws(
  () => rules.validateEntitlementForSchedule(entitlement, {
    id: 'sch-4',
    studentIds: ['stu-1'],
    courseType: '团课',
    coachId: 'coach-1',
    coach: '朝珺',
    campus: 'mabao',
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
    campus: 'mabao',
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
    campus: 'mabao',
    startTime: '2026-05-04 09:00',
    endTime: '2026-05-04 10:00',
    lessonCount: 1,
    status: '已排课'
  }).recommended.id,
  'ent-soon',
  'system should recommend the soonest expiring matching package'
);

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
  rules.syncEntitlementFromPurchase(
    { ...pkg, id: 'pkg-2', name: '新课包', lessons: 8, usageEndDate: '2026-08-01' },
    { ...purchase, id: 'pur-1', packageId: 'pkg-2', packageName: '新课包', purchaseDate: '2026-05-03' },
    { id: 'stu-1', name: '张三' },
    { ...entitlement, id: 'ent-1', usedLessons: 2, remainingLessons: 3, createdAt: '2026-04-01T00:00:00.000Z' },
    '2026-04-12T00:00:00.000Z'
  ).remainingLessons,
  6,
  'editing purchase should rebuild entitlement snapshot while preserving used lessons'
);

assert.throws(
  () => rules.assertCanEditPackageWithPurchases(
    pkg,
    { ...pkg, lessons: 8 },
    [{ id: 'pur-1', packageId: 'pkg-1' }]
  ),
  /已有购买记录，不能修改核心规则/,
  'sold package should not allow changing core lesson count'
);

assert.throws(
  () => rules.assertCanEditPackageWithPurchases(
    pkg,
    { ...pkg, dailyTimeWindows: [{ label: '非黄金时段', startTime: '08:00', endTime: '17:00', daysOfWeek: [1, 2, 3, 4, 5] }] },
    [{ id: 'pur-1', packageId: 'pkg-1' }]
  ),
  /已有购买记录，不能修改核心规则/,
  'sold package should not allow changing nested time windows'
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
