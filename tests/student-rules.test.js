const assert = require('assert');
const api = require('../api/index.js');

const rules = api._test;

assert.ok(rules, 'api._test should expose student rule helpers');

const oldStudent = { id: 'stu-1', name: '张三', phone: '13800000000' };
const nextStudent = { id: 'stu-1', name: '张三丰', phone: '13900000000' };
const data = {
  plans: [{ id: 'plan-1', studentId: 'stu-1', studentName: '张三', studentPhone: '13800000000' }],
  schedule: [{ id: 'sch-1', studentIds: ['stu-1'], studentName: '张三' }],
  purchases: [{ id: 'pur-1', studentId: 'stu-1', studentName: '张三', studentPhone: '13800000000' }],
  entitlements: [{ id: 'ent-1', studentId: 'stu-1', studentName: '张三' }],
  feedbacks: [{ id: 'fb-1', studentId: 'stu-1', studentName: '张三' }]
};

const updates = rules.buildStudentIdentityUpdates(oldStudent,nextStudent,data,'2026-04-12T00:00:00.000Z');

assert.deepStrictEqual(updates.plans.map(x=>[x.id,x.studentName,x.studentPhone,x.updatedAt]), [['plan-1','张三丰','13900000000','2026-04-12T00:00:00.000Z']]);
assert.deepStrictEqual(updates.schedule.map(x=>[x.id,x.studentName,x.updatedAt]), [['sch-1','张三丰','2026-04-12T00:00:00.000Z']]);
assert.deepStrictEqual(updates.purchases.map(x=>[x.id,x.studentName,x.studentPhone,x.updatedAt]), [['pur-1','张三丰','13900000000','2026-04-12T00:00:00.000Z']]);
assert.deepStrictEqual(updates.entitlements.map(x=>[x.id,x.studentName,x.updatedAt]), [['ent-1','张三丰','2026-04-12T00:00:00.000Z']]);
assert.deepStrictEqual(updates.feedbacks.map(x=>[x.id,x.studentName,x.updatedAt]), [['fb-1','张三丰','2026-04-12T00:00:00.000Z']]);

console.log('student rules tests passed');
