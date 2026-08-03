const assert = require('assert');
const { createScheduleRoutes } = require('../server/schedule-routes');
const api = require('../api/index.js');

const rules = api._test;

async function run(){
  await runEditEntitlementChangeTest();
  await runDeleteEntitlementSyncTest();
}

async function runEditEntitlementChangeTest(){
  const persisted = [];
  const response = {};
  const oldSchedule = {
    id: 'sch-edit-1',
    status: '已排课',
    settlementType: 'package',
    studentIds: ['stu-brother'],
    studentName: 'William弟弟',
    courseType: '体验课',
    experienceType: '私教体验课',
    entitlementId: 'ent-trial',
    entitlementIds: ['ent-trial'],
    lessonCount: 1,
    startTime: '2026-07-19 16:00',
    endTime: '2026-07-19 17:00'
  };
  const entitlements = [
    { id: 'ent-trial', studentId: 'stu-brother', status: 'depleted', courseType: '体验课', experienceType: '私教体验课', totalLessons: 1, remainingLessons: 0 },
    { id: 'ent-private', studentId: 'stu-owner', status: 'active', courseType: '私教课', totalLessons: 10, remainingLessons: 3, isAuthorizedUse: true, authorizationId: 'auth-1', packageOwnerStudentId: 'stu-owner', usedByStudentId: 'stu-brother' }
  ];

  const handler = createScheduleRoutes({
    init: async () => {},
    sendJson: (res, payload, status = 200) => {
      res.status = status;
      res.payload = payload;
      return true;
    },
    get: async (table, id) => (table === 'ft_schedule' && id === 'sch-edit-1' ? oldSchedule : null),
    scan: async () => [],
    scanFeedbacks: async () => [],
    timedEndpointMetric: async (label, fn) => fn(),
    assertCanWriteSchedule: () => {},
    buildOperationTrace: ({ now }) => ({ operationId: 'op-edit-test', operationAt: now }),
    withOperationTrace: (row, trace) => ({ ...row, ...trace }),
    normalizeCoachLateInfo: () => ({}),
    normalizeScheduleFieldFee: () => ({}),
    parseArr: (value) => Array.isArray(value) ? value : [],
    normalizeVenue: value => value,
    timed: async (label, fn) => fn(),
    validateScheduleSave: async () => ({ warnings: [] }),
    assertScheduleEntitlementRequired: () => {},
    assertScheduleFieldFeeInput: () => {},
    assertScheduleEditableAfterFeedback: () => {},
    withRequiredStorageTimeout: promise => promise,
    getCachedScan: async table => table === 'ft_entitlements' ? entitlements : [],
    buildCoachRefs: () => [],
    resolveScheduleEntitlementDeltas: rules.resolveScheduleEntitlementDeltas,
    assertScheduleEntitlementCapacity: async rec => {
      assert.deepStrictEqual(rec.entitlementIds, ['ent-private'], 'editing a schedule should not keep stale old entitlementIds');
      return [];
    },
    scheduleStoredValuePaymentAmount: () => 0,
    getFastStudentsRead: async () => [],
    buildScheduleStoredValueCourtUpdate: ({ nextSchedule }) => ({ schedule: nextSchedule, courts: [], originalCourts: [], historyRows: [] }),
    put: async (table, id, row) => {
      if (table === 'ft_schedule') persisted.push(row);
    },
    scheduleLessonDelta: () => null,
    applyEntitlementDelta: async (entitlementId, scheduleId, delta, action) => ({ entitlement: { id: entitlementId }, ledger: { id: `${action}-${entitlementId}`, entitlementId, scheduleId, lessonDelta: delta, action } }),
    applySmallGroupFreeAbsences: async () => [],
    applyLessonDelta: async () => null,
    syncScheduleFieldFeeFinancialLedger: async () => null,
    persistScheduleStoredValueCourts: async () => [],
    syncCoachScheduleIndexes: async () => {},
    syncScheduleConflictIndexes: async () => {},
    rollbackScheduleStoredValueCourts: async () => {},
    rollbackSmallGroupFreeAbsences: async () => {},
    restoreSmallGroupFreeAbsenceLedgerRows: async () => {},
    scheduleSaveErrorStatus: () => 400,
    withTimeout: promise => promise,
    scheduleEntitlementDeltas: rules.scheduleEntitlementDeltas,
    parseLessonValue: rules.parseLessonValue || (value => Number(value) || 0),
    returnEntitlementFreeAbsence: row => row,
    diffScheduleEntitlementDeltas: rules.diffScheduleEntitlementDeltas,
    T_SCHEDULE: 'ft_schedule',
    T_ENTITLEMENTS: 'ft_entitlements',
    T_ENTITLEMENT_LEDGER: 'ft_entitlement_ledger',
    T_COURTS: 'ft_courts'
  });

  await handler({
    path: '/schedule/sch-edit-1',
    method: 'PUT',
    body: {
      status: '已排课',
      settlementType: 'package',
      studentIds: ['stu-brother'],
      studentName: 'William弟弟',
      courseType: '私教课',
      experienceType: '',
      entitlementId: 'ent-private',
      lessonCount: 1,
      startTime: '2026-07-19 16:00',
      endTime: '2026-07-19 17:00'
    },
    user: { role: 'admin', name: '测试运营' },
    res: response
  });

  assert.strictEqual(response.status, 200, `editing a trial schedule to use a private package should save: ${JSON.stringify(response.payload)}`);
  assert.strictEqual(persisted[0].entitlementId, 'ent-private', 'saved schedule should use the new selected entitlement');
}

async function runDeleteEntitlementSyncTest(){
  const calls = [];
  const response = {};
  const schedule = {
    id: 'sch-1',
    status: '已排课',
    studentIds: ['stu-a'],
    entitlementId: 'ent-b',
    lessonCount: 1,
    settlementType: 'package'
  };
  const existingLedger = {
    id: 'ledger-consume-1',
    scheduleId: 'sch-1',
    entitlementId: 'ent-b',
    lessonDelta: -1,
    action: 'consume'
  };
  const refundLedger = {
    id: 'ledger-return-1',
    scheduleId: 'sch-1',
    entitlementId: 'ent-b',
    lessonDelta: 1,
    action: 'return'
  };

  const handler = createScheduleRoutes({
    init: async () => {},
    sendJson: (res, payload, status = 200) => {
      res.status = status;
      res.payload = payload;
      return true;
    },
    get: async (table, id) => (table === 'ft_schedule' && id === 'sch-1' ? schedule : null),
    scan: async (table) => (table === 'ft_entitlement_ledger' ? [existingLedger] : []),
    scanFeedbacks: async () => [],
    assertCanDeleteSchedule: () => {},
    scheduleLessonDelta: () => null,
    scheduleEntitlementDeltas: () => [{ entitlementId: 'ent-b', delta: 1 }],
    effectiveScheduleStatus: (row) => row.status,
    scheduleStoredValuePaymentAmount: () => 0,
    buildOperationTrace: ({ now }) => ({ operationId: 'op-delete-test', operationAt: now }),
    applyEntitlementDelta: async (entitlementId, scheduleId, delta, action) => {
      calls.push(['applyEntitlementDelta', entitlementId, scheduleId, delta, action]);
      return { entitlement: { id: entitlementId }, ledger: refundLedger };
    },
    rollbackSmallGroupFreeAbsences: async () => {},
    restoreSmallGroupFreeAbsenceLedgerRows: async () => {},
    del: async (table, id) => calls.push(['del', table, id]),
    put: async (table, id) => calls.push(['put', table, id]),
    timed: async (label, fn) => fn(),
    persistScheduleStoredValueCourts: async () => [],
    rollbackScheduleStoredValueCourts: async () => {},
    syncScheduleConflictIndexes: async () => calls.push(['syncScheduleConflictIndexes']),
    syncCoachScheduleIndexes: async () => {},
    parseArr: (value) => Array.isArray(value) ? value : [],
    withRequiredStorageTimeout: (promise) => promise,
    getCachedScan: async () => [],
    getFastStudentsRead: async () => [],
    buildScheduleStoredValueCourtUpdate: () => ({ schedule, courts: [], originalCourts: [], historyRows: [] }),
    T_SCHEDULE: 'ft_schedule',
    T_ENTITLEMENT_LEDGER: 'ft_entitlement_ledger',
    T_COURTS: 'ft_courts'
  });

  await handler({
    path: '/schedule/sch-1',
    method: 'DELETE',
    body: {},
    user: { name: '测试运营' },
    res: response
  });

  assert.strictEqual(response.status, 200, 'delete route should return success');
  assert.deepStrictEqual(
    calls.filter(row => row[0] === 'applyEntitlementDelta'),
    [['applyEntitlementDelta', 'ent-b', 'sch-1', 1, 'return']],
    'active schedule delete should restore the consumed package lesson'
  );
  assert.ok(
    calls.some(row => row[0] === 'del' && row[1] === 'ft_entitlement_ledger' && row[2] === 'ledger-consume-1'),
    'active schedule delete should remove the original consume ledger'
  );
  assert.ok(
    calls.some(row => row[0] === 'del' && row[1] === 'ft_entitlement_ledger' && row[2] === 'ledger-return-1'),
    'active schedule delete should remove the generated return ledger to avoid orphan rows'
  );
  assert.ok(
    calls.some(row => row[0] === 'del' && row[1] === 'ft_schedule' && row[2] === 'sch-1'),
    'active schedule delete should delete the schedule after balance and ledger cleanup'
  );
}

run()
  .then(() => console.log('schedule delete entitlement sync tests passed'))
  .catch((err) => {
    console.error(err);
    process.exit(1);
  });
