const assert = require('assert');
const { IDS, buildPlan } = require('../scripts/repair-six-package-ledgers-20260601');

const now = '2026-06-01 13:00:00';
const operationId = 'op-six-package-test';

const deleteLedgerIds = [
  'private_lesson_csv_import_20260519_BATCH1_10_LIVE_FIX:ledger:葡萄:2026-05',
  '3a25ddfd-52fc-4272-87f6-9b05f639fa89',
  '571d7ac6-dd07-43ad-a39b-9038a969f37a',
  '861bb362-3c13-49c5-9b24-7a52fe2737fb',
  'private_lesson_csv_import_20260519_BATCH3_15_LIVE-ledger-a9fafdba-6341-e6ae-cd53-dd459cd091d3',
  'private_lesson_csv_import_20260519_BATCH3_15_LIVE-ledger-101352a9-785b-97d1-a26c-155f2f4e4a45'
];

const deleteScheduleIds = [
  'c4ca51f9-609e-4645-9b1d-97217830ae0f',
  'private_lesson_csv_import_20260524-schedule-1943-朦朦',
  'private_lesson_csv_import_20260524-schedule-1944-j',
  '8725972c-08ab-4cc1-85ca-d9a7db99d944',
  '0c218f60-041f-474e-97d6-d9f5356301b3'
];

const lessonFixScheduleIds = [
  'private_lesson_csv_import_20260527:schedule:63f7c27d28aa',
  'private_lesson_csv_import_20260527:schedule:94dd93bd3c0c',
  'private_lesson_csv_import_20260527:schedule:5613583e1774',
  'private_lesson_csv_import_20260527:schedule:c19450bf7bab',
  'private_lesson_csv_import_20260527:schedule:eee68628d59e',
  'private_lesson_csv_import_20260527:schedule:5dce18484ade',
  'private_lesson_csv_import_20260527:schedule:80c001c5a670',
  'private_lesson_csv_import_20260527:schedule:2ce1e7efd741',
  'private_lesson_csv_import_20260527:schedule:aed9e382b35f',
  'private_lesson_csv_import_20260527:schedule:c878fdc881ff',
  'private_lesson_csv_import_20260527:schedule:8a30bfbb4c5a'
];

const sharedScheduleIds = [
  'private_lesson_csv_import_20260527:schedule:5e3b3b1bfc25',
  'private_lesson_csv_import_20260527:schedule:db91c4fd5d3d',
  'private_lesson_csv_import_20260527:schedule:e74352625afb',
  'private_lesson_csv_import_20260527:schedule:dc89ec5d617d',
  'private_lesson_csv_import_20260527:schedule:ecc2bf166fd6',
  'private_lesson_csv_import_20260527:schedule:cb0385926ae7',
  'private_lesson_csv_import_20260527:schedule:85c0572ec0bb',
  'private_lesson_csv_import_20260527:schedule:7516ee0a9fed',
  'private_lesson_csv_import_20260527:schedule:d704f82cb0ad',
  'private_lesson_csv_import_20260527:schedule:4f8c3a4d4b30',
  'private_lesson_csv_import_20260527:schedule:436513ba5113',
  'private_lesson_csv_import_20260527:schedule:78f9c41a2299',
  'private_lesson_csv_import_20260527:schedule:455da551d229',
  'private_lesson_csv_import_20260527:schedule:61bcf94ce176',
  'private_lesson_csv_import_20260527:schedule:008fccd9ac75',
  'private_lesson_csv_import_20260527:schedule:56ad6659fd9a',
  'private_lesson_csv_import_20260527:schedule:8ce3d4835db0',
  'c2435fed-7909-4ebe-849d-4eeead19f8d5'
];

const purchases = [
  { id: IDS.jPurchase, studentId: 'seed-student-020', packageLessons: 10, finalAmount: 5000 },
  { id: IDS.mishaPurchase, studentId: 'seed-student-002', packageLessons: 10, finalAmount: 6000 },
  { id: IDS.huangPurchase, studentId: 'seed-student-003', packageLessons: 10, finalAmount: 6000 },
  { id: IDS.wjFriendPurchase, studentId: 'seed-student-039', packageLessons: 10, finalAmount: 4000 }
];

const entitlements = [
  { id: IDS.jEnt, studentId: 'seed-student-020', totalLessons: 10, usedLessons: 9.5, remainingLessons: 0.5, status: 'active' },
  { id: IDS.mishaEnt, studentId: 'seed-student-002', totalLessons: 12, usedLessons: 12, remainingLessons: 0, status: 'depleted' },
  { id: IDS.huangEnt, studentId: 'seed-student-003', totalLessons: 12, usedLessons: 8, remainingLessons: 4, status: 'active' },
  { id: IDS.wjFriendEnt, studentId: 'seed-student-039', totalLessons: 10, usedLessons: 8, remainingLessons: 2, status: 'active' }
];

const scheduleIds = [...deleteScheduleIds, ...lessonFixScheduleIds, ...sharedScheduleIds];
const schedules = scheduleIds.map((id) => ({
  id,
  studentId: 'seed-student-020',
  studentIds: ['seed-student-020'],
  studentName: '原学员',
  entitlementId: IDS.jEnt,
  entitlementIds: [IDS.jEnt],
  purchaseId: IDS.jPurchase,
  lessonCount: 2,
  notes: '原记录'
}));

const ledgerIds = [
  ...deleteLedgerIds,
  ...lessonFixScheduleIds.map((id) => id.replace(':schedule:', ':ledger:')),
  'private_lesson_csv_import_20260527:ledger:dc89ec5d617d',
  ...sharedScheduleIds
    .filter((id) => !['c2435fed-7909-4ebe-849d-4eeead19f8d5'].includes(id))
    .filter((id) => !['private_lesson_csv_import_20260527:schedule:5e3b3b1bfc25', 'private_lesson_csv_import_20260527:schedule:db91c4fd5d3d', 'private_lesson_csv_import_20260527:schedule:e74352625afb'].includes(id))
    .map((id) => id.replace(':schedule:', ':ledger:')),
  '2cd544cf-6517-45a2-abae-c5982db98c86'
];
const entitlementLedger = ledgerIds.map((id) => ({
  id,
  scheduleId: id.replace(':ledger:', ':schedule:'),
  studentId: 'seed-student-020',
  entitlementId: IDS.jEnt,
  purchaseId: IDS.jPurchase,
  lessonDelta: -2,
  notes: '原流水'
}));

const plan = buildPlan({ purchases, entitlements, entitlementLedger, schedule: schedules }, { now, operationId });

assert.deepStrictEqual(plan.blockers, [], 'all required rows should be present in the fixture');
assert.deepStrictEqual(plan.deleteLedgers.sort(), deleteLedgerIds.sort(), 'script should delete only the known wrong ledger rows');
assert.deepStrictEqual(plan.deleteSchedules.sort(), deleteScheduleIds.sort(), 'script should delete only the known wrong schedule rows');
assert.strictEqual(plan.putSchedules.length, 30, 'script should update 29 schedules and add J 2026-05-23');
assert.strictEqual(plan.putLedgers.length, 22, 'script should update 21 ledgers and add J 2026-05-23 ledger');

const entitlementById = new Map(plan.putEntitlements.map((row) => [row.id, row]));
assert.deepStrictEqual(
  [entitlementById.get(IDS.jEnt).totalLessons, entitlementById.get(IDS.jEnt).usedLessons, entitlementById.get(IDS.jEnt).remainingLessons],
  [11, 11, 0],
  'J package should be corrected to 11/11/0'
);
assert.deepStrictEqual(
  [entitlementById.get(IDS.mishaEnt).totalLessons, entitlementById.get(IDS.mishaEnt).usedLessons, entitlementById.get(IDS.mishaEnt).remainingLessons],
  [12, 11, 1],
  'misha package should be corrected to 12/11/1'
);
assert.deepStrictEqual(
  [entitlementById.get(IDS.huangEnt).totalLessons, entitlementById.get(IDS.huangEnt).usedLessons, entitlementById.get(IDS.huangEnt).remainingLessons],
  [12, 9, 3],
  'Huang package should be corrected to 12/9/3'
);
assert.deepStrictEqual(
  [entitlementById.get(IDS.wjFriendEnt).totalLessons, entitlementById.get(IDS.wjFriendEnt).usedLessons, entitlementById.get(IDS.wjFriendEnt).remainingLessons],
  [10, 10, 0],
  'W.Jing friend package should be corrected to 10/10/0'
);
const purchaseById = new Map(plan.putPurchases.map((row) => [row.id, row]));
assert.strictEqual(purchaseById.get(IDS.jPurchase).totalLessons, 11, 'J purchase totalLessons should match packageLessons');
assert.strictEqual(purchaseById.get(IDS.mishaPurchase).totalLessons, 12, 'misha purchase totalLessons should match gifted package total');
assert.strictEqual(purchaseById.get(IDS.huangPurchase).totalLessons, 12, 'Huang purchase totalLessons should match gifted package total');

const addedJSchedule = plan.putSchedules.find((row) => row.id === 'repair-20260601-schedule-j-20260523-1130');
const addedJLedger = plan.putLedgers.find((row) => row.id === 'repair-20260601-ledger-j-20260523-1130');
assert.ok(addedJSchedule, 'script should add missing J 2026-05-23 schedule');
assert.strictEqual(addedJSchedule.lessonCount, 1.5, 'J 2026-05-23 schedule should consume 1.5 lessons');
assert.ok(addedJLedger, 'script should add missing J 2026-05-23 ledger');
assert.strictEqual(addedJLedger.lessonDelta, -1.5, 'J 2026-05-23 ledger should consume 1.5 lessons');

const wjFriendLedger = plan.putLedgers.find((row) => row.id === 'private_lesson_csv_import_20260527:ledger:4f8c3a4d4b30');
assert.strictEqual(wjFriendLedger.entitlementId, IDS.wjFriendEnt, 'W.Jing shared May records should use friend package');
assert.strictEqual(wjFriendLedger.studentId, 'seed-student-039', 'W.Jing friend package ledger should belong to the payer package owner');

assert.ok(plan.putSchedules.every((row) => row.operationId === operationId), 'updated schedules should carry operation trace');
assert.ok(plan.putLedgers.every((row) => row.operationId === operationId), 'updated ledgers should carry operation trace');

const rerunWithoutDeletedRows = buildPlan({
  purchases,
  entitlements,
  entitlementLedger: entitlementLedger.filter((row) => !deleteLedgerIds.includes(row.id)),
  schedule: schedules.filter((row) => !deleteScheduleIds.includes(row.id))
}, { now, operationId });
assert.deepStrictEqual(rerunWithoutDeletedRows.blockers, [], 'script should be safe to rerun after delete steps already succeeded');
assert.deepStrictEqual(rerunWithoutDeletedRows.deleteLedgers, [], 'rerun should skip ledger rows that are already deleted');
assert.deepStrictEqual(rerunWithoutDeletedRows.deleteSchedules, [], 'rerun should skip schedule rows that are already deleted');

console.log('six package ledger repair script tests passed');
