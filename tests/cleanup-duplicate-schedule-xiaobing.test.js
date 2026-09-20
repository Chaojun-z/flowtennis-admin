const assert = require('assert');
const repair = require('../scripts/cleanup-duplicate-schedule-xiaobing-20260920.js');

const base = {
  studentIds: ['student-xiaobing'],
  startTime: '2026-07-12 09:30',
  endTime: '2026-07-12 11:00',
  courseType: '小班课',
  standardCourseType: '假期成人训练营',
  coach: '岳克舟教练',
  status: '已排课'
};
const keep = { id: 'cxe-thirdparty-schedule-cxe_lock_2026-07-12_200', ...base, venue: '1号场' };
const duplicate = { id: 'cxe-thirdparty-schedule-cxe_lock_2026-07-12_211', ...base, venue: '2号场' };

assert.strictEqual(repair.duplicateKey(keep), repair.duplicateKey(duplicate));
assert.strictEqual(repair.isVoided({ status: 'voided' }), true);
assert.strictEqual(repair.isVoided({ systemStatus: '已作废' }), true);
assert.strictEqual(repair.isVoided({ status: '已排课' }), false);

const plan = repair.buildPlan({
  schedules: [
    { ...keep, studentIds: ['7f908ef3-329a-4b42-9fd3-c3daea6e8965'] },
    { ...duplicate, studentIds: ['7f908ef3-329a-4b42-9fd3-c3daea6e8965'] }
  ],
  ledgers: [],
  feedbacks: [],
  conflictIndex: [{ id: 'idx-duplicate', scheduleId: duplicate.id }],
  now: '2026-09-20T00:00:00.000Z'
});
assert.deepStrictEqual(plan.blockers, []);
assert.strictEqual(plan.update.id, duplicate.id);
assert.strictEqual(plan.update.after.status, 'voided');
assert.strictEqual(plan.update.after.systemStatus, 'voided');
assert.deepStrictEqual(plan.indexDeletes, ['idx-duplicate']);

const blockedByLedger = repair.buildPlan({
  schedules: [
    { ...keep, studentIds: ['7f908ef3-329a-4b42-9fd3-c3daea6e8965'] },
    { ...duplicate, studentIds: ['7f908ef3-329a-4b42-9fd3-c3daea6e8965'] }
  ],
  ledgers: [{ id: 'ledger-1', scheduleId: duplicate.id, lessonDelta: -1 }],
  feedbacks: [],
  conflictIndex: [],
  now: '2026-09-20T00:00:00.000Z'
});
assert.match(blockedByLedger.blockers.join('；'), /消课流水/);

const blockedByMismatch = repair.buildPlan({
  schedules: [
    { ...keep, studentIds: ['7f908ef3-329a-4b42-9fd3-c3daea6e8965'] },
    { ...duplicate, studentIds: ['7f908ef3-329a-4b42-9fd3-c3daea6e8965'], startTime: '2026-07-12 10:00' }
  ],
  ledgers: [],
  feedbacks: [],
  conflictIndex: [],
  now: '2026-09-20T00:00:00.000Z'
});
assert.match(blockedByMismatch.blockers.join('；'), /时间|课程|教练/);

console.log('cleanup duplicate schedule xiaobing tests passed');
