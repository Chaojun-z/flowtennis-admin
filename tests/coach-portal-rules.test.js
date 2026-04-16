const assert = require('assert');
const api = require('../api/index.js');

const rules = api._test;
assert.ok(rules.filterLoadAllForUser, 'api._test should expose coach filtering helper');

const data = {
  students: [
    { id: 'stu-primary', name: '负责学员', primaryCoach: '朝珺' },
    { id: 'stu-taught', name: '上过课学员' },
    { id: 'stu-owner', name: '归属课包学员' },
    { id: 'stu-allowed', name: '可上课学员' },
    { id: 'stu-other', name: '无关学员' }
  ],
  schedule: [
    { id: 'sch-1', coach: '朝珺', studentIds: ['stu-taught'], status: '已结束', startTime: '2026-04-01 10:00', endTime: '2026-04-01 11:00' },
    { id: 'sch-2', coach: '别人', studentIds: ['stu-other'], status: '已结束', startTime: '2026-04-01 10:00', endTime: '2026-04-01 11:00' }
  ],
  entitlements: [
    { id: 'ent-owner', studentId: 'stu-owner', ownerCoach: '朝珺', allowedCoaches: [], packageName: '主归属课包', totalLessons: 10, usedLessons: 2, remainingLessons: 8 },
    { id: 'ent-allowed', studentId: 'stu-allowed', ownerCoach: '别人', allowedCoaches: ['朝珺'], packageName: '可上课课包', totalLessons: 6, usedLessons: 1, remainingLessons: 5 },
    { id: 'ent-other', studentId: 'stu-other', ownerCoach: '别人', allowedCoaches: [], packageName: '无关课包', totalLessons: 6, usedLessons: 0, remainingLessons: 6 }
  ],
  entitlementLedger: [{ id: 'led-1', entitlementId: 'ent-owner', studentId: 'stu-owner', scheduleId: 'sch-x', lessonDelta: -1 }],
  plans: [
    { id: 'plan-owner', studentId: 'stu-owner', coach: '朝珺', totalLessons: 10, usedLessons: 2 },
    { id: 'plan-other', studentId: 'stu-other', coach: '别人', totalLessons: 10, usedLessons: 0 }
  ],
  classes: [],
  products: [],
  packages: [],
  purchases: [],
  courts: [],
  coaches: [{ id: 'coach-1', name: '朝珺' }],
  campuses: [],
  feedbacks: []
};

const filtered = rules.filterLoadAllForUser(data, { role: 'editor', name: '朝珺', coachName: '朝珺' });
const visibleStudentIds = filtered.students.map(s => s.id).sort();

assert.deepStrictEqual(
  visibleStudentIds,
  ['stu-allowed', 'stu-owner', 'stu-primary', 'stu-taught'],
  'coach should see assigned, taught, owner-package and allowed-package students only'
);

assert.deepStrictEqual(
  filtered.entitlements.map(e => e.id).sort(),
  ['ent-allowed', 'ent-owner'],
  'coach should receive package balances for visible package students'
);

assert.strictEqual(
  filtered.plans.some(p => p.id === 'plan-owner'),
  true,
  'coach should receive learning plans for visible package students'
);

console.log('coach portal rules tests passed');
