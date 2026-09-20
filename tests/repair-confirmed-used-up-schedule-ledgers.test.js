const assert = require('assert');
const repair = require('../scripts/repair-confirmed-used-up-schedule-ledgers-20260920.js');

const schedule = (id, entitlementId, lessonCount) => ({ id, entitlementId, status: '已排课', lessonCount, startTime: '2026-05-01 10:00', endTime: '2026-05-01 12:00', courseType: '私教课', coach: 'Siren 教练', venue: '3号场', notes: '' });
const ent = { id: 'ent-wj', totalLessons: 10, usedLessons: 10, remainingLessons: 0, status: 'depleted', purchaseId: 'purchase-wj', packageName: '成人1v1', studentId: 'seed-student-038' };
const targets = repair.TARGETS;
const entitlements = [
  { id: targets[0].entitlementId, totalLessons: 1, usedLessons: 1, remainingLessons: 0, status: 'depleted', purchaseId: 'purchase-sun', packageName: '体验课', studentId: targets[0].studentId },
  { ...ent, id: targets[1].entitlementId }
];
const plan = repair.buildPlan({
  schedules: targets.map(item => schedule(item.scheduleId, item.entitlementId, Math.abs(item.lessonDelta))),
  entitlements,
  ledgers: [],
  now: '2026-09-20T00:00:00.000Z'
});
assert.deepStrictEqual(plan.blockers, []);
assert.strictEqual(plan.ledgerPuts.length, targets.length);
assert.strictEqual(plan.ledgerPuts.reduce((sum, row) => sum + row.lessonDelta, 0), -9);
assert.ok(plan.ledgerPuts.every(row => row.action === 'consume' && row.operationId === 'repair-confirmed-used-up-schedule-ledgers-20260920'));

const blocked = repair.buildPlan({
  schedules: targets.map(item => schedule(item.scheduleId, item.entitlementId, Math.abs(item.lessonDelta))),
  entitlements,
  ledgers: [{ id: 'existing', scheduleId: targets[0].scheduleId, lessonDelta: -1 }],
  now: '2026-09-20T00:00:00.000Z'
});
assert.match(blocked.blockers.join('；'), /已有消课流水/);

const notDepleted = repair.buildPlan({
  schedules: targets.map(item => schedule(item.scheduleId, item.entitlementId, Math.abs(item.lessonDelta))),
  entitlements: [
    { ...entitlements[0] },
    { ...ent, id: targets[1].entitlementId, remainingLessons: 1, usedLessons: 9, status: 'active' }
  ],
  ledgers: [],
  now: '2026-09-20T00:00:00.000Z'
});
assert.match(notDepleted.blockers.join('；'), /不是已用完状态/);

console.log('repair confirmed used-up schedule ledgers tests passed');
