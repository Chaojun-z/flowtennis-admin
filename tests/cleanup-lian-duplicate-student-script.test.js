const assert = require('assert');
const { buildCleanupPlan } = require('../scripts/cleanup-lian-duplicate-student-20260710');

const baseData = {
  students: [
    { id: 'import-student-dffc7714-0c0f-e3a5-ab90-a9cfbad91d24', name: '莲儿（连女士）', campus: 'shunyi_mapo' },
    { id: 'a255bd93-4eb7-4a4d-bb9c-b86a1681702d', name: '莲儿', campus: 'shunyi_mapo' }
  ],
  leads: [
    {
      id: 'a7049269-4cd9-4a4f-ae9a-6d920fbc5da1',
      displayName: '莲儿',
      wechatName: '莲儿',
      studentName: '莲儿（连女士）',
      studentId: 'import-student-dffc7714-0c0f-e3a5-ab90-a9cfbad91d24',
      isCourseConverted: true
    },
    {
      id: 'lead-from-student-a255bd93-4eb7-4a4d-bb9c-b86a1681702d',
      displayName: '莲儿',
      studentId: 'a255bd93-4eb7-4a4d-bb9c-b86a1681702d'
    },
    {
      id: 'lead-from-student-import-student-dffc7714-0c0f-e3a5-ab90-a9cfbad91d24',
      displayName: '莲儿（连女士）',
      studentId: 'import-student-dffc7714-0c0f-e3a5-ab90-a9cfbad91d24'
    }
  ],
  purchases: [],
  entitlements: [],
  entitlementLedger: [],
  schedule: [
    {
      id: 'schedule-lian',
      studentIds: ['import-student-dffc7714-0c0f-e3a5-ab90-a9cfbad91d24'],
      studentName: '莲儿'
    }
  ],
  plans: [],
  feedbacks: []
};

const plan = buildCleanupPlan(baseData, '2026-07-10T08:00:00.000Z');
assert.strictEqual(plan.canonicalLeadUpdate.displayName, '莲儿（连女士）', 'canonical lead display name should be normalized to the real student name');
assert.strictEqual(plan.canonicalLeadUpdate.wechatName, '莲儿（连女士）', 'canonical lead wechat name should not keep the shorter alias');
assert.deepStrictEqual(plan.deleteLeadIds.sort(), [
  'lead-from-student-a255bd93-4eb7-4a4d-bb9c-b86a1681702d',
  'lead-from-student-import-student-dffc7714-0c0f-e3a5-ab90-a9cfbad91d24'
].sort(), 'cleanup should delete both duplicate materialized leads');
assert.strictEqual(plan.deleteStudentId, 'a255bd93-4eb7-4a4d-bb9c-b86a1681702d', 'cleanup should delete the empty duplicate student');
assert.strictEqual(plan.scheduleUpdates.length, 1, 'cleanup should normalize stale schedule studentName snapshots');
assert.strictEqual(plan.scheduleUpdates[0].studentName, '莲儿（连女士）');

assert.throws(() => buildCleanupPlan({
  ...baseData,
  purchases: [{ id: 'purchase-bad', studentId: 'a255bd93-4eb7-4a4d-bb9c-b86a1681702d' }]
}), /重复空学员仍被业务表引用/, 'cleanup must stop if the duplicate student has business references');

console.log('cleanup lian duplicate student script tests passed');
