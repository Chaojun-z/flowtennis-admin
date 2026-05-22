const assert = require('assert');
const merge = require('../scripts/merge-duplicate-students-20260522');

const plan = merge.buildStudentMergePlan({
  keepStudentId: 'keep',
  mergeStudentIds: ['dup'],
  data: {
    students: [
      { id: 'keep', name: '宋缇缇', campus: '顺义马坡', primaryCoach: '甄朝珺' },
      { id: 'dup', name: '宋缇缇', campus: '', primaryCoach: '朝珺' }
    ],
    purchases: [{ id: 'pur-1', studentId: 'dup', studentName: '宋缇缇' }],
    entitlements: [{ id: 'ent-1', studentId: 'dup', studentName: '宋缇缇' }],
    schedules: [{ id: 'sch-1', studentIds: ['dup'], studentName: '宋缇缇' }],
    plans: [{ id: 'plan-1', studentId: 'dup', studentName: '宋缇缇' }],
    feedbacks: [{ id: 'fb-1', studentId: 'dup', studentIds: ['dup'], studentName: '宋缇缇' }]
  },
  now: '2026-05-22T12:00:00.000Z'
});

assert.deepStrictEqual(plan.studentUpdate, {
  id: 'keep',
  name: '宋缇缇',
  campus: '顺义马坡',
  primaryCoach: '甄朝珺',
  updatedAt: '2026-05-22T12:00:00.000Z'
});
assert.strictEqual(plan.purchaseUpdates[0].studentId, 'keep');
assert.strictEqual(plan.entitlementUpdates[0].studentId, 'keep');
assert.deepStrictEqual(plan.scheduleUpdates[0].studentIds, ['keep']);
assert.strictEqual(plan.planUpdates[0].studentId, 'keep');
assert.deepStrictEqual(plan.feedbackUpdates[0].studentIds, ['keep']);
assert.deepStrictEqual(plan.deleteStudentIds, ['dup']);
assert.deepStrictEqual(plan.deleteIndexIds, ['dup']);

console.log('student merge script tests passed');
