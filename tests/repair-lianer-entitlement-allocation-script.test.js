const assert = require('assert');
const repair = require('../scripts/repair-lianer-entitlement-allocation-20260725');

const now = '2026-07-25 12:00:00';
const secondEntitlement = {
  id: repair.SECOND_ENTITLEMENT_ID,
  studentId: repair.STUDENT_ID,
  purchaseId: 'purchase-second',
  packageName: '成人1v1 黄金时间10课时',
  totalLessons: 10,
  usedLessons: 7,
  remainingLessons: 3,
  status: 'active'
};
const latestEntitlement = {
  id: repair.LATEST_ENTITLEMENT_ID,
  studentId: repair.STUDENT_ID,
  purchaseId: 'purchase-latest',
  packageName: '1v1私教课 · 10课时 · 黄金',
  totalLessons: 10,
  usedLessons: 6,
  remainingLessons: 4,
  status: 'active'
};

const moveToSecond = [...repair.MOVE_TO_SECOND].map((id, index) => ({
  id,
  studentId: repair.STUDENT_ID,
  entitlementId: repair.LATEST_ENTITLEMENT_ID,
  lessonDelta: -1,
  action: 'consume',
  scheduleId: `schedule-second-${index + 1}`
}));
const moveToLatest = [...repair.MOVE_TO_LATEST].map((id, index) => ({
  id,
  studentId: repair.STUDENT_ID,
  entitlementId: repair.SECOND_ENTITLEMENT_ID,
  lessonDelta: -1,
  action: 'consume',
  scheduleId: `schedule-latest-${index + 1}`
}));
const stableSecond = [1, 2, 3, 4, 5].map((n) => ({
  id: `stable-second-${n}`,
  studentId: repair.STUDENT_ID,
  entitlementId: repair.SECOND_ENTITLEMENT_ID,
  lessonDelta: -1,
  action: 'consume',
  scheduleId: `stable-second-schedule-${n}`
}));
const stableLatest = [{
  id: 'stable-latest-1',
  studentId: repair.STUDENT_ID,
  entitlementId: repair.LATEST_ENTITLEMENT_ID,
  lessonDelta: -1,
  action: 'consume',
  scheduleId: 'stable-latest-schedule-1'
}];
const entitlementLedger = [...moveToSecond, ...moveToLatest, ...stableSecond, ...stableLatest];
const schedule = entitlementLedger.map((row) => ({
  id: row.scheduleId,
  studentIds: [repair.STUDENT_ID],
  entitlementId: row.entitlementId,
  entitlementIds: [row.entitlementId],
  purchaseId: row.entitlementId === repair.SECOND_ENTITLEMENT_ID ? 'purchase-second' : 'purchase-latest',
  packageName: '旧快照'
}));

const plan = repair.buildRepairPlan({
  entitlements: [secondEntitlement, latestEntitlement],
  entitlementLedger,
  schedule,
  now,
  operationId: 'op-lianer-test'
});

assert.strictEqual(plan.blockers.length, 0, 'matching live rows should not block the repair');
assert.strictEqual(plan.ledgerUpdates.length, 7, 'repair should move exactly seven ledger rows');
assert.strictEqual(plan.scheduleUpdates.length, 7, 'repair should update the seven matching schedule snapshots');
assert.deepStrictEqual(
  plan.entitlementUpdates.map((item) => [item.after.id, item.after.usedLessons, item.after.remainingLessons, item.after.status]),
  [
    [repair.SECOND_ENTITLEMENT_ID, 10, 0, 'depleted'],
    [repair.LATEST_ENTITLEMENT_ID, 3, 7, 'active']
  ],
  'repair should deplete the second package and leave seven lessons on the latest package'
);
assert.deepStrictEqual(plan.activeEntitlementIndex.entitlementIds, [repair.LATEST_ENTITLEMENT_ID], 'only the latest package should remain active for schedule selection');
assert.ok(
  plan.scheduleUpdates.every((item) => item.after.entitlementIds.length === 1 && item.after.operationType === 'entitlement-allocation-repair'),
  'schedule snapshots should carry the corrected single entitlement and operation trace'
);

const stalePlan = repair.buildRepairPlan({
  entitlements: [{ ...secondEntitlement, remainingLessons: 2 }, latestEntitlement],
  entitlementLedger,
  schedule,
  now
});
assert.ok(stalePlan.blockers.some((item) => item.id === repair.SECOND_ENTITLEMENT_ID), 'repair should block if the second package balance changed after dry-run');

console.log('lianer entitlement allocation repair script tests passed');
