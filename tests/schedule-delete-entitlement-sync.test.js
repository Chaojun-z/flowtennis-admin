const assert = require('assert');
const { createScheduleRoutes } = require('../server/schedule-routes');
const { createPurchaseEntitlementRoutes } = require('../server/purchase-entitlement-routes');
const api = require('../api/index.js');

const rules = api._test;

async function run(){
  await runEditEntitlementChangeTest();
  await runCancelEntitlementSummarySyncTest();
  await runDeleteEntitlementSyncTest();
  await runManualEntitlementSummarySyncTest('manual_consume', -1);
  await runManualEntitlementSummarySyncTest('manual_return', 1);
}

async function runEditEntitlementChangeTest(){
  const persisted = [];
  const summarySyncCalls = [];
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
    syncStudentTeachingSummaryDelta: async payload => {
      summarySyncCalls.push(payload);
      return { synced: true, affectedStudentIds: ['stu-brother'] };
    },
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
  assert.strictEqual(summarySyncCalls.length, 1, 'schedule edit should synchronously point-sync the teaching summary once');
  assert.strictEqual(summarySyncCalls[0].previousSchedule.id, 'sch-edit-1');
  assert.strictEqual(summarySyncCalls[0].nextSchedule.id, 'sch-edit-1');
  assert.strictEqual(summarySyncCalls[0].operationId, 'op-edit-test');
}

async function runCancelEntitlementSummarySyncTest(){
  const calls = [];
  const response = {};
  const oldSchedule = {
    id: 'sch-cancel-1',
    status: '已排课',
    settlementType: 'package',
    studentIds: ['stu-cancel'],
    entitlementId: 'ent-cancel',
    entitlementIds: ['ent-cancel'],
    lessonCount: 1
  };
  const handler = createScheduleRoutes({
    init: async () => {},
    sendJson: (res, payload, status = 200) => {
      res.status = status;
      res.payload = payload;
      return true;
    },
    get: async () => oldSchedule,
    scan: async () => [],
    scanFeedbacks: async () => [],
    timedEndpointMetric: async (label, fn) => fn(),
    assertCanWriteSchedule: () => {},
    buildOperationTrace: ({ now }) => ({ operationId: 'op-cancel-test', operationAt: now }),
    withOperationTrace: (row, trace) => ({ ...row, ...trace }),
    normalizeCoachLateInfo: () => ({}),
    normalizeScheduleFieldFee: () => ({}),
    parseArr: (value) => Array.isArray(value) ? value : [],
    normalizeVenue: value => value,
    timed: async (label, fn) => fn(),
    assertScheduleEditableAfterFeedback: () => {},
    withTimeout: promise => promise,
    scheduleEntitlementDeltas: () => [{ entitlementId: 'ent-cancel', delta: 1 }],
    scheduleLessonDelta: () => null,
    applyEntitlementDelta: async (entitlementId, scheduleId, delta, action) => ({
      entitlement: { id: entitlementId, studentId: 'stu-cancel', remainingLessons: 10, totalLessons: 10 },
      ledger: { id: `ledger-${action}-${entitlementId}`, entitlementId, studentId: 'stu-cancel', scheduleId, lessonDelta: delta, action }
    }),
    scheduleStoredValuePaymentAmount: () => 0,
    put: async () => {},
    applyLessonDelta: async () => null,
    persistScheduleStoredValueCourts: async () => [],
    syncCoachScheduleIndexes: async () => {},
    syncScheduleConflictIndexes: async () => {},
    rollbackScheduleStoredValueCourts: async () => {},
    rollbackSmallGroupFreeAbsences: async () => {},
    restoreSmallGroupFreeAbsenceLedgerRows: async () => {},
    syncStudentTeachingSummaryDelta: async payload => {
      calls.push(['summaryDelta', payload.previousSchedule?.id, payload.nextSchedule?.status, payload.changedLedgers?.[0]?.lessonDelta]);
      return { synced: false, reason: 'bundle-not-ready' };
    },
    refreshStudentTeachingSummaryRows: async () => {
      throw new Error('schedule cancel must not synchronously rebuild teaching summary');
    },
    queueStudentTeachingSummaryRefresh: async (table, meta) => calls.push(['queueSummary', table, meta.writeReason]),
    T_SCHEDULE: 'ft_schedule',
    T_ENTITLEMENT_LEDGER: 'ft_entitlement_ledger'
  });

  await handler({
    path: '/schedule/sch-cancel-1',
    method: 'PUT',
    body: { status: '已取消', cancelReason: '测试取消' },
    user: { role: 'admin', name: '测试运营' },
    res: response
  });

  assert.strictEqual(response.status, 200, 'cancel route should return success');
  assert.deepStrictEqual(
    calls.filter(row => row[0] === 'summaryDelta'),
    [['summaryDelta', 'sch-cancel-1', '已取消', 1]],
    'schedule cancel should point-sync old schedule removal and returned entitlement'
  );
  assert.deepStrictEqual(
    calls.filter(row => row[0] === 'queueSummary'),
    [['queueSummary', 'ft_schedule', 'schedule-delta-fallback']],
    'failed schedule cancel point-sync should only queue async retry, not rebuild during save'
  );
}

async function runDeleteEntitlementSyncTest(){
  const calls = [];
  const summarySyncCalls = [];
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
    syncStudentTeachingSummaryDelta: async payload => {
      summarySyncCalls.push(payload);
      return { synced: true };
    },
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
  assert.strictEqual(summarySyncCalls.length, 1, 'schedule delete should point-sync the teaching summary once');
  assert.strictEqual(summarySyncCalls[0].previousSchedule.id, 'sch-1');
  assert.strictEqual(summarySyncCalls[0].nextSchedule, null);
  assert.deepStrictEqual(
    summarySyncCalls[0].changedLedgers.map(row => row.id).sort(),
    ['ledger-consume-1', 'ledger-return-1'],
    'schedule delete summary sync should see both removed consume and generated return ledgers'
  );
}

async function runManualEntitlementSummarySyncTest(action, expectedDelta){
  const calls = [];
  const response = {};
  const oldEntitlement = {
    id: `ent-${action}`,
    studentId: `stu-${action}`,
    purchaseId: `pur-${action}`,
    packageName: '成人1v1 10课时',
    courseType: '私教课',
    totalLessons: 10,
    usedLessons: action === 'manual_return' ? 2 : 1,
    remainingLessons: action === 'manual_return' ? 8 : 9,
    status: 'active'
  };
  const handler = createPurchaseEntitlementRoutes({
    init: async () => {},
    sendJson: (res, payload, status = 200) => {
      res.status = status;
      res.payload = payload;
      return true;
    },
    get: async (table, id) => {
      if (table === 'ft_entitlements' && id === oldEntitlement.id) return oldEntitlement;
      if (table === 'ft_purchases') return { id: oldEntitlement.purchaseId, studentId: oldEntitlement.studentId };
      if (table === 'ft_packages') return { id: 'pkg-1', packageName: oldEntitlement.packageName };
      if (table === 'ft_students') return { id: oldEntitlement.studentId, name: '测试学员' };
      return null;
    },
    put: async (table, id, row) => calls.push(['put', table, id, row.lessonDelta ?? row.remainingLessons]),
    del: async (table, id) => calls.push(['del', table, id]),
    parseLessonValue: (value) => Number(value) || 0,
    validateManualEntitlementAdjustment: () => {},
    applyEntitlementLessonDelta: rules.applyEntitlementLessonDelta,
    buildManualEntitlementLedgerRecord: ({ entitlement, lessonDelta, relatedDate, reason, operationTrace }, { now }) => ({
      id: `ledger-${action}`,
      entitlementId: entitlement.id,
      studentId: entitlement.studentId,
      purchaseId: entitlement.purchaseId,
      scheduleId: '',
      lessonDelta,
      action,
      reason,
      relatedDate,
      createdAt: now,
      ...operationTrace
    }),
    buildOperationTrace: ({ now }) => ({ operationId: `op-${action}`, operationAt: now }),
    withOperationTrace: (row, trace) => ({ ...row, ...trace }),
    syncStudentActiveEntitlementIndexes: async () => {},
    syncStudentTeachingSummaryDelta: async payload => {
      calls.push(['summaryDelta', payload.changedLedgers[0].lessonDelta, payload.changedEntitlements[0].remainingLessons]);
      return { synced: false, reason: 'summary-not-ready' };
    },
    refreshStudentTeachingSummaryRows: async () => {
      throw new Error('manual adjustment must not synchronously rebuild teaching summary');
    },
    queueStudentTeachingSummaryRefresh: async (table, meta) => calls.push(['queueSummary', table, meta.writeReason]),
    T_PURCHASES: 'ft_purchases',
    T_PACKAGES: 'ft_packages',
    T_STUDENTS: 'ft_students',
    T_ENTITLEMENTS: 'ft_entitlements',
    T_ENTITLEMENT_LEDGER: 'ft_entitlement_ledger'
  });

  await handler({
    path: `/entitlements/${oldEntitlement.id}/manual-adjust`,
    method: 'POST',
    body: { action, count: 1, relatedDate: '2026-09-13', reason: '路由反例测试' },
    user: { role: 'admin', name: '测试运营' },
    res: response,
    query: new URLSearchParams()
  });

  assert.strictEqual(response.status, 200, `manual ${action} should return success`);
  assert.ok(calls.some(row => row[0] === 'summaryDelta' && row[1] === expectedDelta), `manual ${action} should point-sync the ledger delta`);
  assert.deepStrictEqual(
    calls.filter(row => row[0] === 'queueSummary'),
    [['queueSummary', 'ft_entitlements', 'manual-entitlement-delta-fallback']],
    `manual ${action} failed point-sync should only queue async retry`
  );
}

run()
  .then(() => console.log('schedule delete entitlement sync tests passed'))
  .catch((err) => {
    console.error(err);
    process.exit(1);
  });
