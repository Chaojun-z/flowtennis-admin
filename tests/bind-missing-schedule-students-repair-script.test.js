const assert = require('assert');

const {
  OPERATION_ID,
  buildPlan,
  remainingUnboundTeachingSchedules
} = require('../scripts/repair-bind-missing-schedule-students-20260818');

const now = '2026-08-18T04:24:21.000Z';
const baseData = {
  students: [
    { id: 'seed-student-041', name: '张昊', campus: '顺义马坡', primaryCoach: 'Siren 教练' },
    { id: 'seed-student-009', name: '简先生', campus: '顺义马坡', primaryCoach: 'Siren 教练' },
    { id: 'f4d9aeed-2d5b-4790-8351-00e83dc89bee', name: '张先生（张昊然）', campus: '', primaryCoach: '' }
  ],
  schedule: [
    { id: 'sch-zhanghao', startTime: '2026-07-11 17:00', endTime: '2026-07-11 18:00', status: '已排课', studentName: '张昊', studentIds: [], expectedStudentIds: [], courseType: '私教课', coach: '杨教练', campus: 'shunyi_mapo', venue: '2号场' },
    { id: 'sch-you', startTime: '2026-07-12 14:00', endTime: '2026-07-12 15:00', status: '已排课', studentName: 'you', studentIds: [], expectedStudentIds: [], courseType: '体验课', coach: '杨教练', campus: 'shunyi_mapo', venue: '1号场' },
    { id: 'sch-zhang', startTime: '2026-07-25 19:00', endTime: '2026-07-25 20:00', status: '已排课', studentName: '张先生', studentIds: [], expectedStudentIds: [], courseType: '私教课', coach: '杨教练', campus: 'shunyi_mapo', venue: '3号场' },
    { id: 'sch-cancelled', startTime: '2026-07-12 16:00', endTime: '2026-07-12 17:00', status: '已取消', studentName: '取消学员', studentIds: [], courseType: '私教课' },
    { id: 'sch-bound', startTime: '2026-07-12 18:00', endTime: '2026-07-12 19:00', status: '已排课', studentName: '简先生', studentIds: ['seed-student-009'], courseType: '私教课' },
    { id: 'sch-future', startTime: '2026-08-19 18:00', endTime: '2026-08-19 19:00', status: '已排课', studentName: '未来学员', studentIds: [], courseType: '私教课' }
  ],
  conflictIndex: [
    { id: '2026-07-11|coach|%E6%9D%A8%E6%95%99%E7%BB%83|sch-zhanghao', scheduleId: 'sch-zhanghao', indexType: 'coach' }
  ]
};

const plan = buildPlan(baseData, now, { expectedUnboundCount: 3 });
assert.strictEqual(plan.blockers.length, 0, 'known unbound schedules should be repairable');
assert.strictEqual(plan.scheduleUpdates.length, 3, 'three unbound schedules should be updated');
assert.strictEqual(plan.studentPuts.length, 1, 'missing you profile should be created once');
assert.strictEqual(plan.studentPuts[0].id, `${OPERATION_ID}-student-you`);
assert.strictEqual(plan.studentPuts[0].name, 'you');

const zhanghao = plan.scheduleUpdates.find(item => item.id === 'sch-zhanghao').after;
assert.deepStrictEqual(zhanghao.studentIds, ['seed-student-041']);
assert.deepStrictEqual(zhanghao.expectedStudentIds, ['seed-student-041']);
assert.strictEqual(zhanghao.studentId, 'seed-student-041');
assert.strictEqual(zhanghao.repairReason, '绑定缺失学员ID：张昊 -> seed-student-041');

const you = plan.scheduleUpdates.find(item => item.id === 'sch-you').after;
assert.deepStrictEqual(you.studentIds, [`${OPERATION_ID}-student-you`]);
assert.strictEqual(you.sourceLeadId, `lead-from-student-${OPERATION_ID}-student-you`);

const zhang = plan.scheduleUpdates.find(item => item.id === 'sch-zhang').after;
assert.deepStrictEqual(zhang.studentIds, ['f4d9aeed-2d5b-4790-8351-00e83dc89bee']);

const afterData = {
  ...baseData,
  students: baseData.students.concat(plan.studentPuts),
  schedule: baseData.schedule.map(row => plan.scheduleUpdates.find(item => item.id === row.id)?.after || row),
  conflictIndex: plan.conflictIndexPuts
};
assert.strictEqual(remainingUnboundTeachingSchedules(afterData, now).length, 0, 'no searchable teaching schedule should remain without student id');
assert.strictEqual(buildPlan(afterData, now, { expectedUnboundCount: 0 }).scheduleUpdates.length, 0, 'repair should be idempotent');

const unexpected = buildPlan(baseData, now, { expectedUnboundCount: 18 });
assert.strictEqual(unexpected.blockers.length, 1, 'script should stop if production count changed');

console.log('bind missing schedule students repair script tests passed');
