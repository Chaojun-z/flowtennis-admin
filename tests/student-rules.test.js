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
  feedbacks: [{ id: 'fb-1', studentId: 'stu-1', studentName: '张三' }],
  courts: [{ id: 'court-1', name: '张三', phone: '13800000000', studentId: '', studentIds: [], history: [] }]
};

const updates = rules.buildStudentIdentityUpdates(oldStudent,nextStudent,data,'2026-04-12T00:00:00.000Z');

assert.deepStrictEqual(updates.plans.map(x=>[x.id,x.studentName,x.studentPhone,x.updatedAt]), [['plan-1','张三丰','13900000000','2026-04-12T00:00:00.000Z']]);
assert.deepStrictEqual(updates.schedule.map(x=>[x.id,x.studentName,x.updatedAt]), [['sch-1','张三丰','2026-04-12T00:00:00.000Z']]);
assert.deepStrictEqual(updates.purchases.map(x=>[x.id,x.studentName,x.studentPhone,x.updatedAt]), [['pur-1','张三丰','13900000000','2026-04-12T00:00:00.000Z']]);
assert.deepStrictEqual(updates.entitlements.map(x=>[x.id,x.studentName,x.updatedAt]), [['ent-1','张三丰','2026-04-12T00:00:00.000Z']]);
assert.deepStrictEqual(updates.feedbacks.map(x=>[x.id,x.studentName,x.updatedAt]), [['fb-1','张三丰','2026-04-12T00:00:00.000Z']]);
assert.deepStrictEqual(updates.courts.map(x=>[x.id,x.studentId,x.studentIds,x.updatedAt]), [['court-1','stu-1',['stu-1'],'2026-04-12T00:00:00.000Z']]);

const cascadePlan = rules.buildStudentCascadeDeletePlan('stu-1',{
  classes: [
    { id: 'class-solo', studentIds: ['stu-1'] },
    { id: 'class-shared', studentIds: ['stu-1','stu-2'] }
  ],
  schedule: [
    { id: 'sch-solo', studentIds: ['stu-1'], expectedStudentIds: ['stu-1'], absentStudentIds: ['stu-1'], studentName: '张三' },
    { id: 'sch-shared', studentIds: ['stu-1','stu-2'], expectedStudentIds: ['stu-1','stu-2'], absentStudentIds: ['stu-1'], studentName: '张三、李四' }
  ],
  plans: [{ id: 'plan-1', studentId: 'stu-1' }],
  purchases: [{ id: 'pur-1', studentId: 'stu-1' }],
  entitlements: [{ id: 'ent-1', studentId: 'stu-1', purchaseId: 'pur-1' }],
  entitlementLedger: [
    { id: 'ledger-by-student', studentId: 'stu-1' },
    { id: 'ledger-by-ent', entitlementId: 'ent-1' },
    { id: 'ledger-other', studentId: 'stu-2' }
  ],
  membershipBenefitLedger: [{ id: 'benefit-1', studentId: 'stu-1' }],
  financialLedger: [
    { id: 'finance-student', userId: 'stu-1' },
    { id: 'finance-schedule', sourceId: 'sch-solo' },
    { id: 'finance-other', userId: 'stu-2' }
  ],
  feedbacks: [
    { id: 'fb-student', studentId: 'stu-1' },
    { id: 'fb-schedule', scheduleId: 'sch-solo' },
    { id: 'fb-other', studentId: 'stu-2' }
  ],
  courts: [
    { id: 'court-1', studentId: 'stu-1', studentIds: ['stu-1','stu-2'], history: [{ id: 'h1', studentId: 'stu-1' }, { id: 'h2', studentId: 'stu-2' }] }
  ],
  leads: [{ id: 'lead-1', studentId: 'stu-1', isCourseConverted: true }],
  leadFollowups: [{ id: 'lf-1', studentId: 'stu-1', studentName: '张三' }],
  students: [{ id: 'stu-2', name: '李四' }]
},'2026-06-12T00:00:00.000Z');

assert.deepStrictEqual(cascadePlan.deletes.classes, ['class-solo']);
assert.deepStrictEqual(cascadePlan.updates.classes.map(x=>[x.id,x.studentIds,x.updatedAt]), [['class-shared',['stu-2'],'2026-06-12T00:00:00.000Z']]);
assert.deepStrictEqual(cascadePlan.deletes.schedule, ['sch-solo']);
assert.deepStrictEqual(cascadePlan.updates.schedule.map(x=>[x.id,x.studentIds,x.expectedStudentIds,x.absentStudentIds,x.studentName]), [['sch-shared',['stu-2'],['stu-2'],[],'李四']]);
assert.deepStrictEqual(cascadePlan.deletes.plans, ['plan-1']);
assert.deepStrictEqual(cascadePlan.deletes.purchases, ['pur-1']);
assert.deepStrictEqual(cascadePlan.deletes.entitlements, ['ent-1']);
assert.deepStrictEqual(cascadePlan.deletes.entitlementLedger.sort(), ['ledger-by-ent','ledger-by-student']);
assert.deepStrictEqual(cascadePlan.deletes.membershipBenefitLedger, ['benefit-1']);
assert.deepStrictEqual(cascadePlan.deletes.financialLedger.sort(), ['finance-schedule','finance-student']);
assert.deepStrictEqual(cascadePlan.deletes.feedbacks.sort(), ['fb-schedule','fb-student']);
assert.deepStrictEqual(cascadePlan.updates.courts.map(x=>[x.id,x.studentId,x.studentIds,x.history.map(h=>h.id)]), [['court-1','stu-2',['stu-2'],['h2']]]);
assert.deepStrictEqual(cascadePlan.updates.leads.map(x=>[x.id,x.studentId,x.isCourseConverted]), [['lead-1','',false]]);
assert.deepStrictEqual(cascadePlan.updates.leadFollowups.map(x=>[x.id,x.studentId,x.studentName]), [['lf-1','','']]);

console.log('student rules tests passed');
