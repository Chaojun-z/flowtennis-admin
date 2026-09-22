const assert = require('assert');
const { createAgentRoutes } = require('../server/agent-routes');
const { validateScheduleConflicts, validateCourtBookingConflicts } = require('../server/schedule');
const { normalizeCampusValue } = require('../public/assets/scripts/core/campus.js');

const TABLES = {
  schedule: 'ft_schedule',
  students: 'ft_students',
  coaches: 'ft_coaches',
  courts: 'ft_courts',
  entitlements: 'ft_entitlements',
  previews: 'ft_agent_schedule_previews',
  operations: 'ft_agent_operations'
};

const students = [
  { id: 'student-1', name: '李明', phone: '13800000001', campus: 'shunyi_mapo', status: 'active' },
  { id: 'student-2', name: '李明', phone: '13800000002', campus: 'shunyi_mapo', status: 'active' }
];
const coaches = [
  { id: 'coach-1', name: '教练甲', campus: 'shunyi_mapo' },
  { id: 'coach-other', name: '教练乙', campus: 'shunyi_mapo' },
  { id: 'coach-cross-campus', name: '教练丙', campus: 'shilipu' }
];
const courts = [{ id: 'court-1', name: '1号场', campus: 'shunyi_mapo' }];
const initialSchedule = [{
  id: 'existing-schedule', startTime: '2026-09-30 10:00:00', endTime: '2026-09-30 11:00:00',
  campus: 'shunyi_mapo', coach: '教练甲', coachId: 'coach-1', venue: '1号场',
  studentIds: ['student-1'], courseType: '私教', settlementType: 'package', status: '已排课'
}];
const entitlements = [{
  id: 'ent-1', studentId: 'student-1', packageName: '私教十次课', courseType: '私教',
  campusIds: ['shunyi_mapo'], remainingLessons: 5, usedLessons: 0, totalLessons: 10,
  status: 'active', validFrom: '2026-01-01', validUntil: '2026-12-31'
}, {
  id: 'ent-zero', studentId: 'student-1', packageName: '私教零次课', courseType: '私教',
  campusIds: ['shunyi_mapo'], remainingLessons: 0, usedLessons: 10, totalLessons: 10,
  status: 'active', validFrom: '2026-01-01', validUntil: '2026-12-31'
}];

function makeResponse() {
  let statusCode = 200;
  let payload;
  return {
    status(code) { statusCode = code; return this; },
    json(body) { payload = body; return this; },
    get result() { return { statusCode, payload }; }
  };
}

function makeRoute(options = {}) {
  const business = {
    schedule: initialSchedule.map(row => ({ ...row })),
    entitlements: entitlements.map(row => ({ ...row })),
    ledger: []
  };
  const persisted = new Map([
    [TABLES.previews, new Map()],
    [TABLES.operations, new Map()]
  ]);
  let now = new Date('2026-09-20T00:00:00+08:00');
  let createCalls = 0;
  let lastCreateContext = null;
  let auditWritesBlocked = false;
  const user = {
    id: 'operator-1', name: '运营甲', role: 'operator', dataScope: 'campus', campusIds: ['shunyi_mapo'],
    featurePermissions: ['agent_schedule_read', 'agent_schedule_write']
  };
  const sendJson = (res, body, status) => { res.status(status || 200).json(body); return true; };
  const getRows = table => {
    if (table === TABLES.schedule) return business.schedule;
    if (table === TABLES.students) return students;
    if (table === TABLES.coaches) return coaches;
    if (table === TABLES.courts) return courts;
    if (table === TABLES.entitlements) return business.entitlements;
    return [...(persisted.get(table)?.values() || [])];
  };
  const getRow = async (table, id) => {
    if (table === TABLES.entitlements) return business.entitlements.find(row => row.id === id) || null;
    if (table === TABLES.schedule) return business.schedule.find(row => row.id === id) || null;
    return persisted.get(table)?.get(id) || null;
  };
  const put = async (table, id, row) => {
    if (table === TABLES.operations && auditWritesBlocked) throw new Error('审计存储暂时不可用');
    if (table === TABLES.entitlements) {
      const index = business.entitlements.findIndex(item => item.id === id);
      if (index >= 0) business.entitlements[index] = { ...row, id };
      else business.entitlements.push({ ...row, id });
      return;
    }
    if (table === TABLES.schedule) {
      business.schedule.push({ ...row, id });
      return;
    }
    if (!persisted.has(table)) persisted.set(table, new Map());
    persisted.get(table).set(id, { ...row, id });
  };
  const putIfAbsent = async (table, id, row) => {
    if (!persisted.has(table)) persisted.set(table, new Map());
    if (persisted.get(table).has(id)) {
      const error = new Error('conditional put failed');
      error.code = 'ROW_EXISTS';
      throw error;
    }
    persisted.get(table).set(id, { ...row, id });
  };
  const createSchedule = async (body, actor, context) => {
    createCalls += 1;
    lastCreateContext = context;
    if (options.failCreate) throw new Error('正式排课写入失败');
    const row = { ...body, id: `created-${createCalls}`, operationId: context.operationId };
    business.schedule.push(row);
    const entitlement = business.entitlements.find(item => item.id === body.entitlementId);
    if (entitlement) entitlement.remainingLessons -= 1;
    business.ledger.push({ scheduleId: row.id, entitlementId: body.entitlementId, lessonDelta: -1, operationId: context.operationId });
    if (options.failAuditWritesAfterBusiness) auditWritesBlocked = true;
    return { schedule: row, entitlement: entitlement ? { ...entitlement } : null, entitlementLedger: business.ledger.slice(-1) };
  };
  const route = createAgentRoutes({
    sendJson,
    getCachedScan: async table => getRows(table),
    getFastStudentsRead: async () => students,
    getScheduleListRows: async () => business.schedule,
    get: getRow,
    put,
    putIfAbsent,
    mkTable: async () => null,
    createSchedule,
    validateScheduleSave: async candidate => {
      validateScheduleConflicts(candidate, business.schedule, candidate.id, normalizeCampusValue);
      validateCourtBookingConflicts(candidate, courts, history => history || [], normalizeCampusValue);
      return { warnings: [] };
    },
    resolveScheduleEntitlementDeltas: (candidate, available) => [{ studentId: candidate.studentIds[0], entitlementId: candidate.entitlementId, delta: candidate.lessonCount }]
      .filter(row => available.some(item => item.id === row.entitlementId)),
    assertScheduleEntitlementDeltasRequired: (candidate, deltas) => {
      if (!deltas.length) throw new Error('课包余额不存在');
    },
    assertScheduleEntitlementCapacity: async candidate => {
      const entitlement = business.entitlements.find(item => item.id === candidate.entitlementId);
      if (!entitlement) throw new Error('课包余额不存在');
      if (entitlement.remainingLessons < candidate.lessonCount) throw new Error('课包剩余课时不足');
      if (entitlement.studentId !== candidate.studentIds[0]) throw new Error('课包所属学员不匹配');
      if (entitlement.courseType !== candidate.courseType) throw new Error('课程类型不匹配');
      if (!entitlement.campusIds.includes(normalizeCampusValue(candidate.campus))) throw new Error('课包可用校区不匹配');
      return [entitlement];
    },
    tables: TABLES,
    now: () => now,
    uuidv4: (() => { let index = 0; return () => `generated-${++index}`; })(),
    user,
    setNow(value) { now = new Date(value); },
    getState() { return { business, persisted, createCalls }; }
  });
  return { route, user, setNow(value) { now = new Date(value); }, getState() { return { business, persisted, createCalls, lastCreateContext }; } };
}

function baseBody(overrides = {}) {
  return {
    campus: 'shunyi_mapo', studentId: 'student-1', coachId: 'coach-1', coach: '教练甲',
    venue: '2号场', startTime: '2026-10-01 10:00:00', endTime: '2026-10-01 11:00:00',
    courseType: '私教', settlementType: 'package', lessonCount: 1, entitlementId: 'ent-1',
    ...overrides
  };
}

async function request(route, path, method, body, user, headers = {}) {
  const res = makeResponse();
  const handled = await route({ path, method, body, user, req: { headers }, query: new URLSearchParams(), res });
  assert.strictEqual(handled, true, `route should handle ${path}`);
  return res.result;
}

(async () => {
  const context = makeRoute();
  const before = JSON.stringify(context.getState().business);
  const preview = await request(context.route, '/agent/v1/schedules/preview', 'POST', baseBody(), context.user);
  assert.strictEqual(preview.statusCode, 200);
  assert.strictEqual(preview.payload.ok, true);
  assert.ok(preview.payload.data.previewId);
  assert.ok(preview.payload.data.previewHash);
  assert.ok(preview.payload.data.expiresAt);
  assert.strictEqual(preview.payload.data.balanceBefore, 5);
  assert.strictEqual(preview.payload.data.balanceAfter, 4);
  assert.strictEqual(JSON.stringify(context.getState().business), before, 'preview must not write business facts');

  const denied = await request(context.route, '/agent/v1/schedules/preview', 'POST', baseBody(), { ...context.user, featurePermissions: ['agent_schedule_read'] });
  assert.strictEqual(denied.statusCode, 403);
  assert.strictEqual(denied.payload.error.code, 'PERMISSION_DENIED');

  const campusDenied = await request(context.route, '/agent/v1/schedules/preview', 'POST', baseBody({ campus: 'shilipu' }), context.user);
  assert.strictEqual(campusDenied.payload.error.code, 'CAMPUS_FORBIDDEN');

  const permissionChanged = makeRoute();
  const permissionPreview = await request(permissionChanged.route, '/agent/v1/schedules/preview', 'POST', baseBody(), permissionChanged.user);
  const permissionConfirm = await request(permissionChanged.route, '/agent/v1/schedules/confirm', 'POST', { previewId: permissionPreview.payload.data.previewId, previewHash: permissionPreview.payload.data.previewHash, operationId: 'op-permission-changed', confirm: true }, { ...permissionChanged.user, featurePermissions: ['agent_schedule_read'] }, { 'idempotency-key': 'idem-permission-changed' });
  assert.strictEqual(permissionConfirm.payload.error.code, 'PERMISSION_DENIED');

  const campusChanged = makeRoute();
  const campusPreview = await request(campusChanged.route, '/agent/v1/schedules/preview', 'POST', baseBody(), campusChanged.user);
  const campusConfirm = await request(campusChanged.route, '/agent/v1/schedules/confirm', 'POST', { previewId: campusPreview.payload.data.previewId, previewHash: campusPreview.payload.data.previewHash, operationId: 'op-campus-changed', confirm: true }, { ...campusChanged.user, campusIds: ['shilipu'] }, { 'idempotency-key': 'idem-campus-changed' });
  assert.strictEqual(campusConfirm.payload.error.code, 'CAMPUS_FORBIDDEN');

  const ambiguous = await request(context.route, '/agent/v1/schedules/preview', 'POST', baseBody({ studentId: '', studentName: '李明' }), context.user);
  assert.strictEqual(ambiguous.payload.error.code, 'STUDENT_AMBIGUOUS');

  const coachConflict = await request(context.route, '/agent/v1/schedules/preview', 'POST', baseBody({ startTime: '2026-09-30 10:30:00', endTime: '2026-09-30 11:30:00' }), context.user);
  assert.strictEqual(coachConflict.payload.error.code, 'SCHEDULE_CONFLICT_COACH');

  const studentConflict = await request(context.route, '/agent/v1/schedules/preview', 'POST', baseBody({ coachId: 'coach-other', coach: '教练乙', startTime: '2026-09-30 10:30:00', endTime: '2026-09-30 11:30:00' }), context.user);
  assert.strictEqual(studentConflict.payload.error.code, 'SCHEDULE_CONFLICT_STUDENT');

  const venueConflict = await request(context.route, '/agent/v1/schedules/preview', 'POST', baseBody({ coachId: 'coach-other', coach: '教练乙', venue: '1号场', startTime: '2026-09-30 10:30:00', endTime: '2026-09-30 11:30:00' }), context.user);
  assert.strictEqual(venueConflict.payload.error.code, 'SCHEDULE_CONFLICT_VENUE');

  const missingStudent = await request(context.route, '/agent/v1/schedules/preview', 'POST', baseBody({ studentId: 'missing-student' }), context.user);
  assert.strictEqual(missingStudent.payload.error.code, 'STUDENT_NOT_FOUND');

  const missingCoach = await request(context.route, '/agent/v1/schedules/preview', 'POST', baseBody({ coachId: 'missing-coach', coach: '不存在的教练' }), context.user);
  assert.strictEqual(missingCoach.payload.error.code, 'COACH_NOT_FOUND');

  const crossCampusCoach = await request(context.route, '/agent/v1/schedules/preview', 'POST', baseBody({ coachId: 'coach-cross-campus', coach: '教练丙' }), context.user);
  assert.strictEqual(crossCampusCoach.payload.error.code, 'CAMPUS_FORBIDDEN');

  const insufficient = await request(context.route, '/agent/v1/schedules/preview', 'POST', baseBody({ entitlementId: 'missing-ent' }), context.user);
  assert.strictEqual(insufficient.payload.error.code, 'ENTITLEMENT_NOT_FOUND');

  const noBalance = await request(context.route, '/agent/v1/schedules/preview', 'POST', baseBody({ entitlementId: 'ent-zero' }), context.user);
  assert.strictEqual(noBalance.payload.error.code, 'ENTITLEMENT_INSUFFICIENT');

  const expires = makeRoute();
  const expPreview = await request(expires.route, '/agent/v1/schedules/preview', 'POST', baseBody(), expires.user);
  expires.setNow('2026-09-20T00:11:00+08:00');
  const expiredConfirm = await request(expires.route, '/agent/v1/schedules/confirm', 'POST', { previewId: expPreview.payload.data.previewId, previewHash: expPreview.payload.data.previewHash, operationId: 'op-expired', confirm: true }, expires.user, { 'idempotency-key': 'idem-expired' });
  assert.strictEqual(expiredConfirm.payload.error.code, 'PREVIEW_EXPIRED');

  const tampered = makeRoute();
  const tamperedPreview = await request(tampered.route, '/agent/v1/schedules/preview', 'POST', baseBody(), tampered.user);
  tampered.getState().persisted.get(TABLES.previews).get(tamperedPreview.payload.data.previewId).request.campus = 'shilipu';
  const tamperedConfirm = await request(tampered.route, '/agent/v1/schedules/confirm', 'POST', { previewId: tamperedPreview.payload.data.previewId, previewHash: tamperedPreview.payload.data.previewHash, operationId: 'op-tampered', confirm: true }, tampered.user, { 'idempotency-key': 'idem-tampered' });
  assert.strictEqual(tamperedConfirm.payload.error.code, 'PREVIEW_STALE');

  const confirmed = await request(context.route, '/agent/v1/schedules/confirm', 'POST', { previewId: preview.payload.data.previewId, previewHash: preview.payload.data.previewHash, operationId: 'op-1', confirm: true }, context.user, { 'idempotency-key': 'idem-1' });
  assert.strictEqual(confirmed.statusCode, 200);
  assert.strictEqual(confirmed.payload.ok, true);
  assert.strictEqual(confirmed.payload.data.operationId, 'op-1');
  assert.strictEqual(context.getState().createCalls, 1);
  assert.deepStrictEqual(context.getState().lastCreateContext, { source: 'agent-confirm', agentWriteAllowed: true, operationId: 'op-1', idempotencyKey: 'idem-1' });
  const repeated = await request(context.route, '/agent/v1/schedules/confirm', 'POST', { previewId: preview.payload.data.previewId, previewHash: preview.payload.data.previewHash, operationId: 'op-1', confirm: true }, context.user, { 'idempotency-key': 'idem-1' });
  assert.strictEqual(repeated.payload.data.schedule.id, confirmed.payload.data.schedule.id);
  assert.strictEqual(context.getState().createCalls, 1, 'same idempotency key must not create twice');

  const operationStatus = await request(context.route, '/agent/v1/operations/op-1', 'GET', {}, context.user);
  assert.strictEqual(operationStatus.statusCode, 200);
  assert.strictEqual(operationStatus.payload.data.status, 'succeeded');
  assert.strictEqual(operationStatus.payload.data.scheduleId, confirmed.payload.data.schedule.id);
  assert.strictEqual(operationStatus.payload.data.canRetry, false);

  const operationForbidden = await request(context.route, '/agent/v1/operations/op-1', 'GET', {}, { ...context.user, campusIds: ['shilipu'] });
  assert.strictEqual(operationForbidden.statusCode, 403);
  assert.strictEqual(operationForbidden.payload.error.code, 'AGENT_CAMPUS_FORBIDDEN');

  const reused = await request(context.route, '/agent/v1/schedules/confirm', 'POST', { previewId: preview.payload.data.previewId, previewHash: preview.payload.data.previewHash, operationId: 'op-2', confirm: true }, context.user, { 'idempotency-key': 'idem-1' });
  assert.strictEqual(reused.payload.error.code, 'IDEMPOTENCY_KEY_REUSED');

  const failed = makeRoute({ failCreate: true });
  const failedPreview = await request(failed.route, '/agent/v1/schedules/preview', 'POST', baseBody(), failed.user);
  const failedBefore = JSON.stringify(failed.getState().business);
  const failedConfirm = await request(failed.route, '/agent/v1/schedules/confirm', 'POST', { previewId: failedPreview.payload.data.previewId, previewHash: failedPreview.payload.data.previewHash, operationId: 'op-fail', confirm: true }, failed.user, { 'idempotency-key': 'idem-fail' });
  assert.strictEqual(failedConfirm.payload.ok, false);
  assert.strictEqual(JSON.stringify(failed.getState().business), failedBefore, 'formal write failure must not leave partial business facts');
  const failedAudit = failed.getState().persisted.get(TABLES.operations).get('op-fail');
  assert.strictEqual(failedAudit.status, 'failed');
  assert.ok(failedAudit.previewSnapshot);
  const failedStatus = await request(failed.route, '/agent/v1/operations/op-fail', 'GET', {}, failed.user);
  assert.strictEqual(failedStatus.payload.data.status, 'failed');
  assert.strictEqual(failedStatus.payload.data.canRetry, true);
  assert.strictEqual(failedStatus.payload.data.error.code, 'AGENT_SYSTEM_ERROR');

  const auditFailure = makeRoute({ failAuditWritesAfterBusiness: true });
  const auditPreview = await request(auditFailure.route, '/agent/v1/schedules/preview', 'POST', baseBody(), auditFailure.user);
  const auditConfirmBody = { previewId: auditPreview.payload.data.previewId, previewHash: auditPreview.payload.data.previewHash, operationId: 'op-audit', confirm: true };
  const auditConfirm = await request(auditFailure.route, '/agent/v1/schedules/confirm', 'POST', auditConfirmBody, auditFailure.user, { 'idempotency-key': 'idem-audit' });
  assert.strictEqual(auditConfirm.statusCode, 503);
  assert.strictEqual(auditConfirm.payload.error.code, 'AUDIT_PENDING');
  assert.strictEqual(auditConfirm.payload.data.canRetry, false);
  assert.strictEqual(auditFailure.getState().createCalls, 1);

  const recoveredStatus = await request(auditFailure.route, '/agent/v1/operations/op-audit', 'GET', {}, auditFailure.user);
  assert.strictEqual(recoveredStatus.statusCode, 200);
  assert.strictEqual(recoveredStatus.payload.data.status, 'succeeded_audit_pending');
  assert.strictEqual(recoveredStatus.payload.data.scheduleId, auditConfirm.payload.data.schedule.id);
  assert.strictEqual(recoveredStatus.payload.data.canRetry, false);

  const auditRetry = await request(auditFailure.route, '/agent/v1/schedules/confirm', 'POST', auditConfirmBody, auditFailure.user, { 'idempotency-key': 'idem-audit' });
  assert.strictEqual(auditRetry.payload.error.code, 'AUDIT_PENDING');
  assert.strictEqual(auditFailure.getState().createCalls, 1, 'audit recovery must not create a duplicate schedule');

  console.log('agent schedule write tests passed');
})().catch(error => {
  console.error(error);
  process.exitCode = 1;
});
