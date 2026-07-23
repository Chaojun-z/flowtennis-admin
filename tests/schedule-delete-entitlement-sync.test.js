const assert = require('assert');
const { createScheduleRoutes } = require('../server/schedule-routes');

async function run(){
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
