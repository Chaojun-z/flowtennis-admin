const assert = require('assert');

const { buildPlan } = require('../scripts/repair-lead-pool-visible-dirty-names-20260826.js');

const plan = buildPlan({
  leads: [
    { id: 'lead-ideal', displayName: '理想团课', status: 'active', createdAt: '2026-06-04' },
    { id: 'lead-ideal-employee', displayName: '理想员工团课', status: 'active', createdAt: '2026-07-25' },
    { id: 'lead-eat-main', displayName: '吃很多饭', status: 'active', createdAt: '2026-06-23' },
    { id: 'lead-eat-friend', displayName: '吃很多饭朋友', status: 'active', createdAt: '2026-08-26' },
    { id: 'lead-eat-friend-dirty', displayName: '吃很多饭的朋友', status: 'active', createdAt: '2026-08-26' },
    { id: 'lead-edge-1', displayName: '、暖暖爸爸、', status: 'active', createdAt: '2026-07-23' },
    { id: 'lead-edge-2', displayName: '、apple不是🍎、', status: 'active', createdAt: '2026-07-23' }
  ],
  students: [
    { id: 'student-ideal-group-enterprise', name: '理想团课', status: 'active', createdAt: '2026-06-04' },
    { id: 'student-eat-friend', name: '吃很多饭朋友', status: 'active', createdAt: '2026-08-26' },
    { id: 'student-eat-friend-dirty', name: '吃很多饭的朋友', status: 'active', createdAt: '2026-08-26' },
    { id: 'student-edge', name: '、李俊泽、', status: 'active', createdAt: '2026-07-23' }
  ],
  leadFollowups: [
    { id: 'followup-1', leadId: 'lead-eat-friend-dirty', remark: 'test' }
  ],
  schedule: [
    { id: 'schedule-1', studentId: 'student-eat-friend-dirty', studentIds: ['student-eat-friend-dirty'], studentName: '吃很多饭的朋友', status: '已排课' }
  ]
});

assert.ok(plan.puts.length > 0, 'dry-run should produce writes for dirty names');
const leadPuts = plan.puts.filter(item => item.table === 'ft_leads');
const studentPuts = plan.puts.filter(item => item.table === 'ft_students');

assert.ok(leadPuts.some(item => item.before.id === 'lead-ideal-employee' && item.after.status === 'merged' && item.after.mergedIntoLeadId === 'lead-ideal'), '理想员工团课 should merge into 理想团课');
assert.ok(leadPuts.some(item => item.before.id === 'lead-eat-friend-dirty' && item.after.status === 'merged' && item.after.mergedIntoLeadId === 'lead-eat-friend'), '吃很多饭的朋友 should merge into 吃很多饭朋友');
assert.ok(leadPuts.some(item => item.before.id === 'lead-edge-1' && item.after.displayName === '暖暖爸爸'), 'leading/trailing punctuation should be removed from lead names');
assert.ok(leadPuts.some(item => item.before.id === 'lead-edge-2' && item.after.displayName === 'apple不是🍎'), 'trailing punctuation should be removed from lead names');
assert.ok(!studentPuts.some(item => item.before.id === 'student-ideal-group-enterprise'), 'canonical 理想团课 student should stay unchanged');
assert.ok(studentPuts.some(item => item.before.id === 'student-eat-friend-dirty' && item.after.status === 'merged' && item.after.mergedIntoStudentId === 'student-eat-friend'), 'dirty duplicate student should merge into the canonical friend record');
assert.ok(studentPuts.some(item => item.before.id === 'student-edge' && item.after.displayName === '李俊泽' && item.after.name === '李俊泽'), 'student punctuation should be removed from the edges');

console.log('repair lead pool visible dirty names tests passed');
