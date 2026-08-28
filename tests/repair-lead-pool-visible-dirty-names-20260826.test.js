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

const currentDirtyPlan = buildPlan({
  leads: [
    { id: 'lead-one1', displayName: 'one1', status: 'active', createdAt: '2026-08-26' },
    { id: 'lead-one1-dirty', displayName: 'one1（体验）、陈鹭', status: 'active', createdAt: '2026-08-27' },
    { id: 'lead-ethan', displayName: 'Ethan', status: 'active', createdAt: '2026-08-26' },
    { id: 'lead-ethan-dirty', displayName: 'Ethan（3人）、rzwyyy', status: 'active', createdAt: '2026-08-27' },
    { id: 'lead-yee', displayName: 'Yee', status: 'active', createdAt: '2026-08-26' },
    { id: 'lead-yee-dirty', displayName: 'Yee.等三人', status: 'active', createdAt: '2026-08-27' },
    { id: 'lead-happy', displayName: '开心', status: 'active', createdAt: '2026-08-26' },
    { id: 'lead-happy-dirty', displayName: '开心&朋友', status: 'active', createdAt: '2026-08-27' },
    { id: 'lead-sweet-flour', displayName: '吃糖的麻花', status: 'active', createdAt: '2026-08-26' },
    { id: 'lead-sweet-flour-dirty', displayName: '吃糖的麻花、艾斯', status: 'active', createdAt: '2026-08-27' },
    { id: 'lead-reese', displayName: '拾柒🦄', status: 'active', createdAt: '2026-08-26' },
    { id: 'lead-reese-dirty', displayName: '拾柒🦄（2人）、揭彬', status: 'active', createdAt: '2026-08-27' },
    { id: 'lead-noise-dirty', displayName: '+++++（3人）', status: 'active', createdAt: '2026-08-27' }
  ],
  students: [],
  studentTeachingSummaries: [
    {
      id: '__student_teaching_summary_meta__',
      status: 'ready',
      rowCount: 3,
      checksum: 'old-checksum',
      completedAt: '2026-08-27T11:35:54.810Z'
    },
    {
      id: '05954eae-0601-4b90-ad1f-7b2117f9193a',
      studentId: '05954eae-0601-4b90-ad1f-7b2117f9193a',
      displayName: 'Ethan（3人）、rzwyyy',
      name: 'Ethan（3人）、rzwyyy',
      status: 'active'
    },
    {
      id: 'new-lead-cce87d10b3fa',
      studentId: 'new-lead-cce87d10b3fa',
      displayName: 'one1（体验）、陈鹭、cc z（体验）、Golden.Z™',
      name: 'one1（体验）、陈鹭、cc z（体验）、Golden.Z™',
      status: 'active'
    },
    {
      id: '1ab4ff8e-d4f9-42df-b1e3-1fd0df62a619',
      studentId: '1ab4ff8e-d4f9-42df-b1e3-1fd0df62a619',
      displayName: '+++++（3人）',
      name: '+++++（3人）',
      status: 'voided'
    }
  ]
});

const currentDirtyLeadPuts = currentDirtyPlan.puts.filter(item => item.table === 'ft_leads');
const summaryPuts = currentDirtyPlan.puts.filter(item => item.table === 'ft_student_teaching_summary');
const summaryDeletes = currentDirtyPlan.deletes.filter(item => item.table === 'ft_student_teaching_summary');
assert.ok(currentDirtyLeadPuts.some(item => item.before.id === 'lead-one1-dirty' && item.after.status === 'merged' && item.after.mergedIntoLeadId === 'lead-one1'), 'one1 dirty lead should merge into one1');
assert.ok(currentDirtyLeadPuts.some(item => item.before.id === 'lead-ethan-dirty' && item.after.status === 'merged' && item.after.mergedIntoLeadId === 'lead-ethan'), 'Ethan dirty lead should merge into Ethan');
assert.ok(currentDirtyLeadPuts.some(item => item.before.id === 'lead-yee-dirty' && item.after.status === 'merged' && item.after.mergedIntoLeadId === 'lead-yee'), 'Yee dirty lead should merge into Yee');
assert.ok(currentDirtyLeadPuts.some(item => item.before.id === 'lead-happy-dirty' && item.after.status === 'merged' && item.after.mergedIntoLeadId === 'lead-happy'), '开心&朋友 should merge into 开心');
assert.ok(currentDirtyLeadPuts.some(item => item.before.id === 'lead-sweet-flour-dirty' && item.after.status === 'merged' && item.after.mergedIntoLeadId === 'lead-sweet-flour'), '吃糖的麻花、艾斯 should merge into 吃糖的麻花');
assert.ok(currentDirtyLeadPuts.some(item => item.before.id === 'lead-reese-dirty' && item.after.status === 'merged' && item.after.mergedIntoLeadId === 'lead-reese'), '拾柒🦄（2人）、揭彬 should merge into 拾柒🦄');
assert.ok(currentDirtyLeadPuts.some(item => item.before.id === 'lead-noise-dirty' && item.after.status === 'voided'), '+++++（3人） should be voided as obvious noise');
assert.ok(summaryPuts.some(item => item.before.id === '05954eae-0601-4b90-ad1f-7b2117f9193a' && item.after.displayName === 'Ethan'), 'dirty Ethan teaching summary should be cleaned');
assert.ok(summaryPuts.some(item => item.before.id === 'new-lead-cce87d10b3fa' && item.after.displayName === 'one1'), 'dirty one1 teaching summary should be cleaned');
assert.ok(summaryDeletes.some(item => item.before.id === '1ab4ff8e-d4f9-42df-b1e3-1fd0df62a619'), 'noise teaching summary should be deleted');
assert.ok(summaryPuts.some(item => item.before.id === '__student_teaching_summary_meta__' && item.after.checksum !== 'old-checksum'), 'summary meta checksum should be refreshed');

console.log('repair lead pool visible dirty names tests passed');
