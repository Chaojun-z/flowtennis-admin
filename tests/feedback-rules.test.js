const assert = require('assert');
const api = require('../api/index.js');

const rules = api._test;

assert.ok(rules, 'api._test should expose helpers');

assert.throws(
  () => rules.buildFeedbackRecord({}, {}, { name: '教练' }),
  /缺少排课ID/,
  'feedback must be linked to a schedule'
);

const record = rules.buildFeedbackRecord(
  {
    scheduleId: 'sch-1',
    studentId: 'stu-1',
    studentIds: ['stu-1', 'stu-2'],
    studentName: '学员A',
    coach: '朝珺',
    startTime: '2026-04-11 09:00',
    campus: 'mabao',
    venue: '1号场',
    lessonCount: 1,
    practicedToday: '底线练习',
    knowledgePoint: '重心转移',
    nextTraining: '脚步移动'
  },
  { id: 'fb-1' },
  { name: '朝珺' }
);

assert.strictEqual(record.id, 'fb-1');
assert.strictEqual(record.scheduleId, 'sch-1');
assert.strictEqual(record.coach, '朝珺');
assert.deepStrictEqual(record.studentIds, ['stu-1', 'stu-2']);
assert.strictEqual(record.practicedToday, '底线练习');
assert.strictEqual(record.knowledgePoint, '重心转移');
assert.strictEqual(record.nextTraining, '脚步移动');

assert.doesNotThrow(
  () => rules.assertCanWriteFeedback(
    { role: 'admin', name: '管理员' },
    { coach: '朝珺' }
  ),
  'admin can write any schedule feedback'
);

assert.doesNotThrow(
  () => rules.assertCanWriteFeedback(
    { role: 'editor', coachName: '朝珺', name: '朝珺' },
    { coach: '朝珺' }
  ),
  'coach can write own schedule feedback'
);

assert.throws(
  () => rules.assertCanWriteFeedback(
    { role: 'editor', coachName: '白杨静', name: '白杨静' },
    { coach: '朝珺' }
  ),
  /只能填写自己的课程反馈/,
  'coach cannot write other coach schedule feedback'
);

const isolated = rules.filterLoadAllForUser(
  {
    courts: [{ id: 'court-1' }],
    students: [{ id: 'stu-1', name: '学员A' }, { id: 'stu-2', name: '学员B' }],
    products: [{ id: 'prod-1' }],
    plans: [{ id: 'plan-1', studentId: 'stu-1', classId: 'class-1' }, { id: 'plan-2', studentId: 'stu-2', classId: 'class-2' }],
    schedule: [{ id: 'sch-1', coach: '朝珺', studentIds: ['stu-1'], classId: 'class-1' }, { id: 'sch-2', coach: '其他教练', studentIds: ['stu-2'], classId: 'class-2' }],
    coaches: [{ id: 'coach-1', name: '朝珺' }, { id: 'coach-2', name: '其他教练' }],
    classes: [{ id: 'class-1', coach: '朝珺', studentIds: ['stu-1'] }, { id: 'class-2', coach: '其他教练', studentIds: ['stu-2'] }],
    campuses: [{ id: 'mabao' }],
    feedbacks: [{ id: 'fb-1', scheduleId: 'sch-1' }, { id: 'fb-2', scheduleId: 'sch-2' }]
  },
  { role: 'editor', coachName: '朝珺', name: '朝珺' }
);
assert.deepStrictEqual(isolated.courts, [], 'coach load-all should not expose court accounts');
assert.deepStrictEqual(isolated.schedule.map(x=>x.id), ['sch-1'], 'coach load-all should only expose own schedule');
assert.deepStrictEqual(isolated.classes.map(x=>x.id), ['class-1'], 'coach load-all should only expose own classes');
assert.deepStrictEqual(isolated.students.map(x=>x.id), ['stu-1'], 'coach load-all should only expose linked students');
assert.deepStrictEqual(isolated.feedbacks.map(x=>x.id), ['fb-1'], 'coach load-all should only expose own feedbacks');

console.log('feedback rules tests passed');
