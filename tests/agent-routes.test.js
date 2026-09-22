const assert = require('assert');
const { createAgentRoutes } = require('../server/agent-routes');
const permissions = require('../server/permissions');

const TABLES = {
  leads: 'ft_leads',
  students: 'ft_students',
  schedule: 'ft_schedule',
  campuses: 'ft_campuses',
  coaches: 'ft_coaches',
  courts: 'ft_courts'
};

const rows = {
  [TABLES.leads]: [
    { id: 'lead-today', name: '今日线索', phone: '13800000001', campus: 'shunyi_mapo', source: '微信', status: 'active', createdAt: '2026-09-20T16:30:00Z' },
    { id: 'lead-old', name: '历史线索', phone: '13800000002', campus: 'shunyi_mapo', status: 'active', createdAt: '2026-09-20T15:00:00Z' },
    { id: 'lead-other', name: '其他校区', phone: '13800000003', campus: 'shilipu', status: 'active', createdAt: '2026-09-20T16:30:00Z' },
    { id: 'lead-void', name: '作废线索', phone: '13800000004', campus: 'shunyi_mapo', status: 'voided', createdAt: '2026-09-20T16:30:00Z' }
  ],
  [TABLES.students]: [
    { id: 'student-1', name: '李明', phone: '13800000011', campus: 'shunyi_mapo', primaryCoach: '教练甲', status: 'active' },
    { id: 'student-2', name: '李明', phone: '13800000012', campus: 'shunyi_mapo', primaryCoach: '教练乙', status: 'active' },
    { id: 'student-3', name: '王五', phone: '13900000013', campus: 'shilipu', status: 'active' }
  ],
  [TABLES.schedule]: [
    { id: 'schedule-1', startTime: '2026-09-21 10:00:00', endTime: '2026-09-21 11:00:00', campus: 'shunyi_mapo', coach: '教练甲', coachId: 'coach-1', venue: '1号场', studentIds: ['student-1'], courseType: '私教', status: 'confirmed' },
    { id: 'schedule-2', startTime: '2026-09-21 12:00:00', endTime: '2026-09-21 13:00:00', campus: 'shilipu', coach: '教练乙', coachId: 'coach-2', venue: '2号场', studentIds: ['student-3'], courseType: '私教', status: 'confirmed' },
    { id: 'schedule-3', startTime: '2026-09-22 10:00:00', endTime: '2026-09-22 11:00:00', campus: 'shunyi_mapo', coach: '教练甲', coachId: 'coach-1', venue: '1号场', studentIds: ['student-1'], courseType: '私教', status: 'confirmed' }
  ],
  [TABLES.campuses]: [{ id: 'shunyi_mapo', code: 'shunyi_mapo', name: '顺义马坡' }, { id: 'shilipu', code: 'shilipu', name: '朝阳十里堡' }],
  [TABLES.coaches]: [{ id: 'coach-1', name: '教练甲', campus: 'shunyi_mapo' }, { id: 'coach-2', name: '教练乙', campus: 'shilipu' }],
  [TABLES.courts]: [{ id: 'court-1', name: '1号场', campus: 'shunyi_mapo' }, { id: 'court-2', name: '2号场', campus: 'shilipu' }]
};

function makeResponse() {
  let statusCode = 200;
  let payload;
  return {
    status(code) { statusCode = code; return this; },
    json(body) { payload = body; return this; },
    get result() { return { statusCode, payload }; }
  };
}

function makeRoute() {
  return createAgentRoutes({
    sendJson(res, body, status) { res.status(status || 200).json(body); return true; },
    getCachedScan: async table => rows[table] || [],
    getFastStudentsRead: async () => rows[TABLES.students],
    getScheduleListRows: async () => rows[TABLES.schedule],
    listCampusesWithDefaults: async () => rows[TABLES.campuses],
    tables: TABLES,
    now: () => new Date('2026-09-21T00:00:00+08:00')
  });
}

async function request(route, path, user, query = new URLSearchParams(), body = {}) {
  const res = makeResponse();
  const handled = await route({ path, method: 'GET', body, user, query, req: { headers: {} }, res });
  assert.strictEqual(handled, true, `route should handle ${path}`);
  return res.result;
}

const agentPermissions = [
  'agent_auth_read',
  'agent_lead_read',
  'agent_student_read',
  'agent_schedule_read',
  'agent_reference_read'
];
const mapoOperator = {
  id: 'operator-1',
  name: '运营甲',
  role: 'operator',
  dataScope: 'campus',
  campusIds: ['shunyi_mapo'],
  featurePermissions: agentPermissions
};

assert.strictEqual(permissions.normalizePermissionProfile({ role: 'operator', campusIds: ['shunyi_mapo'] }).role, 'operator');
assert.notStrictEqual(permissions.normalizePermissionProfile({ role: 'operator' }).role, 'admin');

(async () => {
  const route = makeRoute();

  const unauthenticated = await request(route, '/agent/v1/auth/me', null);
  assert.strictEqual(unauthenticated.statusCode, 401);
  assert.strictEqual(unauthenticated.payload.ok, false);
  assert.strictEqual(unauthenticated.payload.error.code, 'AGENT_AUTH_REQUIRED');

  const me = await request(route, '/agent/v1/auth/me', mapoOperator, new URLSearchParams(), { operatorId: 'someone-else' });
  assert.strictEqual(me.statusCode, 200);
  assert.strictEqual(me.payload.ok, true);
  assert.strictEqual(me.payload.data.operatorId, 'operator-1');
  assert.strictEqual(me.payload.data.campusIds[0], 'shunyi_mapo');
  assert.ok(me.payload.requestId);

  const leads = await request(route, '/agent/v1/leads/today-new', mapoOperator);
  assert.strictEqual(leads.payload.ok, true);
  assert.strictEqual(leads.payload.data.todayNewCount, 1, 'today-new must use createdAt in Asia/Shanghai');
  assert.strictEqual(leads.payload.data.activeTotal, 2, 'today-new and active total must be separate');
  assert.strictEqual(leads.payload.data.items[0].phone, '138****0001');
  assert.ok(!('password' in leads.payload.data.items[0]));

  const studentsByName = await request(route, '/agent/v1/students/search', mapoOperator, new URLSearchParams('name=李明'));
  assert.strictEqual(studentsByName.payload.data.total, 2, 'same-name students must remain as candidates');
  assert.deepStrictEqual(studentsByName.payload.data.items.map(item => item.id), ['student-1', 'student-2']);
  assert.strictEqual(studentsByName.payload.data.items[0].phone, '138****0011');

  const studentsByPhone = await request(route, '/agent/v1/students/search', mapoOperator, new URLSearchParams('phone=13800000012'));
  assert.strictEqual(studentsByPhone.payload.data.total, 1);
  assert.strictEqual(studentsByPhone.payload.data.items[0].id, 'student-2');

  const schedules = await request(route, '/agent/v1/schedules', mapoOperator, new URLSearchParams('date=2026-09-21&coachId=coach-1'));
  assert.strictEqual(schedules.payload.data.total, 1);
  assert.strictEqual(schedules.payload.data.items[0].id, 'schedule-1');
  assert.match(schedules.payload.data.items[0].startTime, /\+08:00$/);

  const refs = await request(route, '/agent/v1/references', mapoOperator);
  assert.deepStrictEqual(refs.payload.data.campuses.map(item => item.id), ['shunyi_mapo']);
  assert.deepStrictEqual(refs.payload.data.coaches.map(item => item.id), ['coach-1']);
  assert.deepStrictEqual(refs.payload.data.courts.map(item => item.id), ['court-1']);

  const forbiddenCampus = await request(route, '/agent/v1/schedules', mapoOperator, new URLSearchParams('date=2026-09-21&campusId=shilipu'));
  assert.strictEqual(forbiddenCampus.statusCode, 403);
  assert.strictEqual(forbiddenCampus.payload.error.code, 'AGENT_CAMPUS_FORBIDDEN');
  assert.ok(forbiddenCampus.payload.requestId);

  const noPermission = await request(route, '/agent/v1/students/search', { ...mapoOperator, featurePermissions: [] }, new URLSearchParams('name=李明'));
  assert.strictEqual(noPermission.statusCode, 403);
  assert.strictEqual(noPermission.payload.error.code, 'AGENT_PERMISSION_DENIED');

  const invalid = await request(route, '/agent/v1/schedules', mapoOperator, new URLSearchParams('date=bad-date'));
  assert.strictEqual(invalid.statusCode, 400);
  assert.strictEqual(invalid.payload.error.code, 'AGENT_INVALID_PARAMETER');

  console.log('agent routes tests passed');
})().catch(error => {
  console.error(error);
  process.exitCode = 1;
});
