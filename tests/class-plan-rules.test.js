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
  /该班次已有排课，不能直接修改教练或学员/,
  'class with schedules should not allow changing coach'
);

assert.doesNotThrow(
  () => rules.assertCanEditClassWithSchedules(
    { id: 'class-a', coach: '朝珺', studentIds: ['stu-1'] },
    { id: 'class-a', coach: '朝珺', studentIds: ['stu-1'], totalLessons: 12 },
    [{ id: 'sch-1', classId: 'class-a' }]
  ),
  'class with schedules can still edit unrelated fields'
);

console.log('class plan rules tests passed');
