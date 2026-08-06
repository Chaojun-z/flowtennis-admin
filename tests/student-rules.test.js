const assert = require('assert');
const fs = require('fs');
const path = require('path');
const api = require('../api/index.js');

const rules = api._test;
const apiSource = fs.readFileSync(path.join(__dirname, '../api/index.js'), 'utf8');

function fnBody(name){
  const start = apiSource.indexOf(`async function ${name}(`);
  assert.notStrictEqual(start, -1, `${name} should exist`);
  const next = apiSource.indexOf('\nfunction ', start + 1);
  return apiSource.slice(start, next === -1 ? apiSource.length : next);
}

assert.ok(rules, 'api._test should expose student rule helpers');
assert.doesNotMatch(fnBody('deleteStudentCascade'), /scan\(T_(PURCHASES|ENTITLEMENTS|ENTITLEMENT_LEDGER|FINANCIAL_LEDGER|SCHEDULE|CLASSES|COURTS|LEADS|LEAD_FOLLOWUPS)|del\(T_(PURCHASES|ENTITLEMENTS|ENTITLEMENT_LEDGER|FINANCIAL_LEDGER|SCHEDULE|CLASSES|COURTS|LEADS|LEAD_FOLLOWUPS)/, 'student delete should archive the profile without scanning or deleting business fact tables');

const oldStudent = { id: 'stu-1', name: '张三', phone: '13800000000' };
const nextStudent = { id: 'stu-1', name: '张三丰', phone: '13900000000' };
const data = {
  plans: [{ id: 'plan-1', studentId: 'stu-1', studentName: '张三', studentPhone: '13800000000' }],
  schedule: [{ id: 'sch-1', studentIds: ['stu-1'], studentName: '张三' }],
  purchases: [{ id: 'pur-1', studentId: 'stu-1', studentName: '张三', studentPhone: '13800000000' }],
  entitlements: [{ id: 'ent-1', studentId: 'stu-1', studentName: '张三' }],
  feedbacks: [{ id: 'fb-1', studentId: 'stu-1', studentName: '张三' }],
  courts: [{ id: 'court-1', name: '张三', phone: '13800000000', studentId: '', studentIds: [], history: [] }],
  leads: [{ id: 'lead-1', studentId: 'stu-1', studentMatchId: 'stu-1', studentName: '张三', studentMatchName: '张三', isCourseConverted: true }],
  leadFollowups: [{ id: 'lf-1', studentId: 'stu-1', studentName: '张三' }]
};

const updates = rules.buildStudentIdentityUpdates(oldStudent,nextStudent,data,'2026-04-12 00:00:00');

assert.deepStrictEqual(updates.plans.map(x=>[x.id,x.studentName,x.studentPhone,x.updatedAt]), [['plan-1','张三丰','13900000000','2026-04-12 00:00:00']]);
assert.deepStrictEqual(updates.schedule.map(x=>[x.id,x.studentName,x.updatedAt]), [['sch-1','张三丰','2026-04-12 00:00:00']]);
assert.deepStrictEqual(updates.purchases.map(x=>[x.id,x.studentName,x.studentPhone,x.updatedAt]), [['pur-1','张三丰','13900000000','2026-04-12 00:00:00']]);
assert.deepStrictEqual(updates.entitlements.map(x=>[x.id,x.studentName,x.updatedAt]), [['ent-1','张三丰','2026-04-12 00:00:00']]);
assert.deepStrictEqual(updates.feedbacks.map(x=>[x.id,x.studentName,x.updatedAt]), [['fb-1','张三丰','2026-04-12 00:00:00']]);
assert.deepStrictEqual(updates.courts.map(x=>[x.id,x.studentId,x.studentIds,x.updatedAt]), [['court-1','stu-1',['stu-1'],'2026-04-12 00:00:00']]);
assert.deepStrictEqual(updates.leads.map(x=>[x.id,x.studentName,x.studentMatchName,x.updatedAt]), [['lead-1','张三丰','张三丰','2026-04-12 00:00:00']]);
assert.deepStrictEqual(updates.leadFollowups.map(x=>[x.id,x.studentName,x.updatedAt]), [['lf-1','张三丰','2026-04-12 00:00:00']]);

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
  leads: [{ id: 'lead-1', studentId: 'stu-1', studentMatchId: 'stu-1', studentName: '张三', studentMatchName: '张三', isCourseConverted: true }],
  leadFollowups: [{ id: 'lf-1', studentId: 'stu-1', studentName: '张三' }],
  students: [{ id: 'stu-2', name: '李四' }]
},'2026-06-12 00:00:00');

assert.strictEqual(rules.studentCascadeDeletePlanHasHistory(cascadePlan), true, 'student with business history should be archived instead of physically deleted');
assert.deepStrictEqual(cascadePlan.deletes.purchases, ['pur-1']);
assert.deepStrictEqual(cascadePlan.deletes.entitlements, ['ent-1']);
assert.deepStrictEqual(cascadePlan.deletes.entitlementLedger.sort(), ['ledger-by-ent','ledger-by-student']);
assert.deepStrictEqual(cascadePlan.deletes.membershipBenefitLedger, ['benefit-1']);
assert.deepStrictEqual(cascadePlan.deletes.financialLedger.sort(), ['finance-schedule','finance-student']);

const emptyPlan = rules.buildStudentCascadeDeletePlan('stu-empty',{},'2026-06-12 00:00:00');
assert.strictEqual(rules.studentCascadeDeletePlanHasHistory(emptyPlan), false, 'empty mistaken student profile can still be physically deleted');

const archivedStudent = rules.buildArchivedStudentRecord(oldStudent,{name:'管理员'},'2026-06-12 00:00:00');
assert.strictEqual(archivedStudent.status, 'archived');
assert.strictEqual(archivedStudent.deletedAt, '2026-06-12 00:00:00');
assert.strictEqual(archivedStudent.archivedAt, '2026-06-12 00:00:00');
assert.strictEqual(archivedStudent.archivedBy, '管理员');

console.log('student rules tests passed');
