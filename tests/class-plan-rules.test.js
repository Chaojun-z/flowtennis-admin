const assert = require('assert');
const api = require('../api/index.js');

const rules = api._test;

const cls = {
  id: 'class-a',
  className: 'CLS0001-成人私教10节',
  productName: '成人私教10节',
  coach: '朝珺',
  campus: 'mabao',
  totalLessons: 10,
  usedLessons: 2,
  status: '已排班'
};

const students = [
  { id: 'stu-1', name: '大宝', phone: '13800000001' },
  { id: 'stu-2', name: '二宝', phone: '13800000002' }
];

const plan = rules.buildClassPlanRecord(cls, students[0]);
assert.deepStrictEqual(
  {
    classId: plan.classId,
    studentId: plan.studentId,
    studentName: plan.studentName,
    studentPhone: plan.studentPhone,
    className: plan.className,
    productName: plan.productName,
    coach: plan.coach,
    campus: plan.campus,
    totalLessons: plan.totalLessons,
    usedLessons: plan.usedLessons,
    status: plan.status
  },
  {
    classId: 'class-a',
    studentId: 'stu-1',
    studentName: '大宝',
    studentPhone: '13800000001',
    className: 'CLS0001-成人私教10节',
    productName: '成人私教10节',
    coach: '朝珺',
    campus: 'mabao',
    totalLessons: 10,
    usedLessons: 2,
    status: 'active'
  },
  'active class should create active student plan'
);

assert.strictEqual(
  rules.buildClassPlanRecord({ ...cls, status: '已取消' }, students[0]).status,
  '已取消',
  'cancelled class should create cancelled student plan'
);

assert.strictEqual(
  rules.buildClassPlanRecord({ ...cls, status: '已结课' }, students[0]).status,
  '已结课',
  'finished class should create finished student plan'
);

assert.throws(
  () => rules.assertCanDeleteProduct('prod-a', [{ productId: 'prod-a', className: 'CLS0001' }]),
  /已有班次使用/,
  'product used by classes should not be deletable'
);

assert.throws(
  () => rules.assertCanEditProductWithReferences(
    { id: 'prod-a', type: '私教课', maxStudents: 1, lessons: 10, price: 2000 },
    { id: 'prod-a', type: '团课', maxStudents: 1, lessons: 10, price: 2000 },
    { classes: [{ id: 'class-a', productId: 'prod-a' }], packages: [] }
  ),
  /已有班次或售卖课包使用，不能修改核心字段/,
  'product used by classes should not allow changing course type'
);

assert.doesNotThrow(
  () => rules.assertCanEditProductWithReferences(
    { id: 'prod-a', type: '私教课', maxStudents: 1, lessons: 10, price: 2000, name: '旧名称' },
    { id: 'prod-a', type: '私教课', maxStudents: 1, lessons: 10, price: 2000, name: '新名称', notes: '备注' },
    { classes: [], packages: [{ id: 'pkg-a', productId: 'prod-a' }] }
  ),
  'product used by packages can still edit display fields'
);

assert.throws(
  () => rules.assertCanDeleteClass('class-a', [{ classId: 'class-a' }]),
  /已有排课/,
  'class with schedules should not be deletable'
);

assert.throws(
  () => rules.assertCanDeleteCourt({ id: 'court-a', history: [{ type: '充值', amount: 1000 }] }),
  /已有财务流水/,
  'court account with finance history should not be deletable'
);

assert.throws(
  () => rules.assertCanDeleteCourt({ id: 'court-b', balance: 500, history: [] }),
  /已有财务数据/,
  'legacy court account with non-zero money should not be deletable'
);

assert.doesNotThrow(
  () => rules.assertCanDeleteCourt({ id: 'court-c', balance: 0, totalDeposit: 0, spentAmount: 0, history: [] }),
  'empty court account can be deleted'
);

assert.throws(
  () => rules.assertCanDeleteCampus('mabao', {
    students: [],
    coaches: [],
    classes: [],
    schedule: [],
    courts: [],
    packages: [{ id: 'pkg-1', campusIds: ['mabao'] }],
    entitlements: []
  }),
  /已有学员、教练、班次、排课、课包或权益关联/,
  'campus used by packages should not be deletable'
);

assert.doesNotThrow(
  () => rules.assertCanDeleteCampus('mabao', {
    students: [],
    coaches: [],
    classes: [],
    schedule: [],
    courts: [],
    packages: [{ id: 'pkg-1', campusIds: ['shunyi'] }],
    entitlements: []
  }),
  'unreferenced campus can be deleted'
);

assert.throws(
  () => rules.assertCanDeleteStudent('stu-1', {
    classes: [{ id: 'class-a', studentIds: ['stu-1'] }],
    schedule: [],
    plans: [],
    courts: [],
    feedbacks: []
  }),
  /该学员已有班次、排课、学习计划、订场账户或反馈关联/,
  'student linked to class should not be deletable'
);

assert.throws(
  () => rules.assertCanEditClassWithSchedules(
    { id: 'class-a', coach: '朝珺', studentIds: ['stu-1'] },
    { id: 'class-a', coach: '白杨静', studentIds: ['stu-1'] },
    [{ id: 'sch-1', classId: 'class-a' }]
  ),
  /该班次已有排课，不能直接修改教练/,
  'class with schedules should not allow changing coach'
);

assert.doesNotThrow(
  () => rules.assertCanEditClassWithSchedules(
    { id: 'class-a', coach: '朝珺', studentIds: ['stu-1'] },
    { id: 'class-a', coach: '朝珺', studentIds: ['stu-1'], opsNote: '家长已沟通续班' },
    [{ id: 'sch-1', classId: 'class-a' }]
  ),
  'class with schedules can still edit low-risk notes'
);

assert.throws(
  () => rules.assertCanEditClassWithSchedules(
    { id: 'class-a', productId: 'prod-a', coach: '朝珺', campus: 'mabao', studentIds: ['stu-1'], totalLessons: 10, usedLessons: 2 },
    { id: 'class-a', productId: 'prod-b', coach: '朝珺', campus: 'mabao', studentIds: ['stu-1'], totalLessons: 10, usedLessons: 2 },
    [{ id: 'sch-1', classId: 'class-a' }]
  ),
  /已有排课.*课程产品/,
  'class with schedules should not allow changing product'
);

assert.throws(
  () => rules.assertCanEditClassWithSchedules(
    { id: 'class-a', productId: 'prod-a', coach: '朝珺', campus: 'mabao', studentIds: ['stu-1'], totalLessons: 10, usedLessons: 2 },
    { id: 'class-a', productId: 'prod-a', coach: '朝珺', campus: 'shunyi', studentIds: ['stu-1'], totalLessons: 10, usedLessons: 2 },
    [{ id: 'sch-1', classId: 'class-a' }]
  ),
  /已有排课.*校区/,
  'class with schedules should not allow changing campus'
);

assert.throws(
  () => rules.assertCanEditClassWithSchedules(
    { id: 'class-a', productId: 'prod-a', coach: '朝珺', campus: 'mabao', studentIds: ['stu-1'], totalLessons: 10, usedLessons: 2 },
    { id: 'class-a', productId: 'prod-a', coach: '朝珺', campus: 'mabao', studentIds: ['stu-1'], totalLessons: 12, usedLessons: 2 },
    [{ id: 'sch-1', classId: 'class-a' }]
  ),
  /已有排课.*总课时/,
  'class with schedules should not allow changing total lessons'
);

assert.throws(
  () => rules.assertCanEditClassWithSchedules(
    { id: 'class-a', productId: 'prod-a', coach: '朝珺', campus: 'mabao', studentIds: ['stu-1'], totalLessons: 10, usedLessons: 2 },
    { id: 'class-a', productId: 'prod-a', coach: '朝珺', campus: 'mabao', studentIds: ['stu-1'], totalLessons: 10, usedLessons: 3 },
    [{ id: 'sch-1', classId: 'class-a' }]
  ),
  /已上课时.*排课/,
  'class used lessons should be read-only and driven by schedule'
);

assert.throws(
  () => rules.assertCanEditClassWithSchedules(
    { id: 'class-a', productId: 'prod-a', coach: '朝珺', campus: 'mabao', studentIds: ['stu-1'], totalLessons: 10, usedLessons: 2, status: '已排班' },
    { id: 'class-a', productId: 'prod-a', coach: '朝珺', campus: 'mabao', studentIds: ['stu-1'], totalLessons: 10, usedLessons: 2, status: '已取消' },
    [{ id: 'sch-1', classId: 'class-a', status: '已排课' }]
  ),
  /已有排课.*取消/,
  'class with schedules should not be directly cancelled'
);

assert.throws(
  () => rules.assertCanEditClassWithSchedules(
    { id: 'class-a', productId: 'prod-a', coach: '朝珺', campus: 'mabao', studentIds: ['stu-1'], totalLessons: 10, usedLessons: 2, status: '已排班' },
    { id: 'class-a', productId: 'prod-a', coach: '朝珺', campus: 'mabao', studentIds: ['stu-1'], totalLessons: 10, usedLessons: 2, status: '已结课' },
    [{ id: 'sch-1', classId: 'class-a', status: '已排课' }]
  ),
  /剩余课时.*结课/,
  'class with remaining lessons should not be finished'
);

assert.throws(
  () => rules.assertCanWriteClass({ role: 'editor' }),
  /无权限/,
  'non-admin users should not write classes'
);

assert.doesNotThrow(
  () => rules.assertCanWriteClass({ role: 'admin' }),
  'admin users can write classes'
);

assert.strictEqual(
  rules.nextClassNoFromClasses([{ classNo: 'CLS0003' }, { classNo: 'CLS0010' }, { classNo: 'BAD' }]),
  'CLS0011',
  'class number should be generated from existing classes server-side'
);

assert.strictEqual(
  rules.nextClassNoFromClasses([]),
  'CLS0001',
  'empty class list should start from CLS0001'
);

assert.strictEqual(
  rules.nextClassNoFromClasses([{ classNo: 'CLS0099' }]),
  'CLS0100',
  'class number should keep zero-padding across hundreds'
);

assert.strictEqual(
  rules.isClassNoReservationConflict(new Error('Condition check failed')),
  true,
  'class number reservation should identify conditional write conflicts'
);

assert.deepStrictEqual(
  rules.buildClassCreateRecord(
    {
      productId: 'prod-a',
      productName: '成人私教10节',
      studentIds: ['stu-1'],
      coach: '朝珺',
      campus: 'mabao',
      totalLessons: 10,
      usedLessons: 7,
      startDate: '2026-04-12',
      endDate: '2026-05-12',
      status: '已排班'
    },
    { id: 'class-new', classNo: 'CLS0011', user: { name: '管理员' }, now: '2026-04-12T00:00:00.000Z' }
  ).usedLessons,
  0,
  'creating classes should ignore manually supplied usedLessons'
);

assert.throws(
  () => rules.validateClassInput(
    { productId: 'prod-a', studentIds: ['stu-1', 'stu-2'], totalLessons: 10 },
    { id: 'prod-a', maxStudents: 1 }
  ),
  /超过课程产品人数上限/,
  'class student count should respect product maxStudents'
);

assert.throws(
  () => rules.validateClassInput(
    { productId: 'prod-a', studentIds: ['stu-1'], totalLessons: 10, usedLessons: 11 },
    { id: 'prod-a', maxStudents: 1 }
  ),
  /已上课时不能大于应上课时/,
  'class usedLessons cannot exceed totalLessons'
);

assert.throws(
  () => rules.validateClassInput(
    { productId: 'prod-a', studentIds: ['stu-1'], totalLessons: 10, startDate: '2026-05-12', endDate: '2026-04-12' },
    { id: 'prod-a', maxStudents: 1 }
  ),
  /结束日期不能早于开始日期/,
  'class endDate cannot be before startDate'
);

console.log('class plan rules tests passed');
