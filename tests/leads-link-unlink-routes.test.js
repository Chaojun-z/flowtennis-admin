const assert = require('assert');
const api = require('../api/index.js');
const { createLeadsRoutes } = require('../server/leads-routes.js');

const rules = api._test;
const rows = {
  ft_leads: [{
    id: 'lead-1',
    displayName: '小白',
    wechatName: '小白',
    studentId: 'stu-1',
    courtId: 'court-1',
    membershipAccountId: 'member-1',
    isCourseConverted: true,
    isCourtConverted: true,
    isMembershipConverted: true,
    createdAt: '2026-07-01 10:00:00'
  }],
  ft_students: [{ id: 'stu-1', name: '小白学员', sourceLeadId: 'lead-1' }],
  ft_courts: [{ id: 'court-1', name: '小白订场', sourceLeadId: 'lead-1' }],
  ft_membership_accounts: [{ id: 'member-1', courtId: 'court-1', status: 'active' }]
};
const writes = [];

function clone(row) {
  return row ? JSON.parse(JSON.stringify(row)) : null;
}

function makeRes() {
  return { statusCode: 200, body: null };
}

const handle = createLeadsRoutes({
  init: async () => {},
  sendJson: (res, body, status = 200) => {
    res.statusCode = status;
    res.body = body;
    return body;
  },
  get: async (table, id) => clone((rows[table] || []).find(row => row.id === id)),
  scan: async table => clone(rows[table] || []),
  put: async (table, id, row) => {
    writes.push({ table, id, row: clone(row) });
    const list = rows[table] || (rows[table] = []);
    const index = list.findIndex(item => item.id === id);
    if (index >= 0) list[index] = clone(row);
    else list.push(clone(row));
  },
  ensureLeadTables: async () => {},
  cleanLeadText: value => String(value || '').trim(),
  normalizeLeadRecord: rules.normalizeLeadRecord,
  T_LEADS: 'ft_leads',
  T_STUDENTS: 'ft_students',
  T_COURTS: 'ft_courts',
  T_MEMBERSHIP_ACCOUNTS: 'ft_membership_accounts'
});

(async () => {
  const studentRes = makeRes();
  await handle({
    path: '/leads/lead-1/unlink-student',
    method: 'POST',
    body: {},
    user: { role: 'admin' },
    res: studentRes,
    query: new URLSearchParams()
  });

  assert.strictEqual(studentRes.statusCode, 200);
  assert.strictEqual(studentRes.body.lead.studentId, '', 'unlink student should clear only the lead student link');
  assert.strictEqual(studentRes.body.lead.courtId, 'court-1', 'unlink student should keep the court link');
  assert.strictEqual(studentRes.body.student.id, 'stu-1', 'unlink student should return the untouched student account');
  assert.strictEqual(rows.ft_students.find(row => row.id === 'stu-1').sourceLeadId, '', 'unlink student must clear the reverse sourceLeadId so the link cannot reappear after reopening');
  assert.ok(rows.ft_students.find(row => row.id === 'stu-1'), 'unlink student must not delete the student account');

  const courtRes = makeRes();
  await handle({
    path: '/leads/lead-1/unlink-court',
    method: 'POST',
    body: {},
    user: { role: 'admin' },
    res: courtRes,
    query: new URLSearchParams()
  });

  assert.strictEqual(courtRes.statusCode, 200);
  assert.strictEqual(courtRes.body.lead.courtId, '', 'unlink court should clear the lead court link');
  assert.strictEqual(courtRes.body.lead.membershipAccountId, '', 'unlink court should also clear the derived membership account link');
  assert.strictEqual(courtRes.body.court.id, 'court-1', 'unlink court should return the untouched court account');
  assert.ok(rows.ft_courts.find(row => row.id === 'court-1'), 'unlink court must not delete the court account');
  assert.ok(writes.some(item => item.table === 'ft_leads' && item.id === 'lead-1'), 'unlink should persist the updated lead');

  console.log('leads link unlink routes tests passed');
})().catch(error => {
  console.error(error);
  process.exit(1);
});
