const assert = require('assert');
const { createLeadsRoutes } = require('../server/leads-routes');

function makeRes() {
  return {
    statusCode: 200,
    body: null,
    status(code) {
      this.statusCode = code;
      return this;
    },
    json(payload) {
      this.body = payload;
      return this;
    }
  };
}

async function main() {
  const writes = [];
  const rows = {
    ft_leads: [{ id: 'lead-1', displayName: '小成', wechatName: '小成', createdAt: '2026-06-17T00:00:00.000Z' }],
    ft_students: [{ id: 'student-1', name: '小成' }],
    ft_courts: [{ id: 'court-1', name: '小成', status: 'active' }],
    ft_membership_accounts: []
  };
  const handle = createLeadsRoutes({
    init: async () => {},
    sendJson: (res, payload, status = 200) => {
      res.status(status).json(payload);
      return true;
    },
    get: async (table, id) => (rows[table] || []).find((row) => row.id === id) || null,
    scan: async (table) => rows[table] || [],
    put: async (table, id, row) => {
      writes.push({ table, id, row });
    },
    ensureLeadTables: async () => {},
    cleanLeadText: (value) => String(value || '').trim(),
    normalizeLeadRecord: (row) => row,
    buildLeadStudentRecord: () => ({ id: 'new-student', name: '小成' }),
    buildLeadCourtRecord: () => ({ id: 'new-court', name: '小成' }),
    matchLeadToStudent: (lead, students) => ({ matchType: 'possible', record: students.find((row) => row.name === lead.displayName) || null }),
    matchLeadToCourt: (lead, courts) => ({ matchType: 'possible', record: courts.find((row) => row.name === lead.displayName) || null }),
    T_LEADS: 'ft_leads',
    T_STUDENTS: 'ft_students',
    T_COURTS: 'ft_courts',
    T_MEMBERSHIP_ACCOUNTS: 'ft_membership_accounts'
  });

  const studentRes = makeRes();
  await handle({ path: '/leads/lead-1/convert-student', method: 'POST', body: {}, user: { role: 'admin' }, res: studentRes, query: new URLSearchParams() });
  assert.strictEqual(studentRes.body.student.id, 'student-1');
  assert.ok(!writes.some((item) => item.table === 'ft_students' && item.id === 'new-student'), '同名学员存在时不应新建学员');
  assert.ok(
    writes.some((item) => item.table === 'ft_students' && item.id === 'student-1' && item.row.sourceLeadId === 'lead-1'),
    '复用同名学员时也要补齐线索来源链路'
  );

  const courtRes = makeRes();
  await handle({ path: '/leads/lead-1/convert-court', method: 'POST', body: {}, user: { role: 'admin' }, res: courtRes, query: new URLSearchParams() });
  assert.strictEqual(courtRes.body.court.id, 'court-1');
  assert.ok(!writes.some((item) => item.table === 'ft_courts' && item.id === 'new-court'), '同名订场用户存在时不应新建订场用户');
  assert.ok(
    writes.some((item) => item.table === 'ft_courts' && item.id === 'court-1' && item.row.sourceLeadId === 'lead-1'),
    '复用同名订场用户时也要补齐线索来源链路'
  );

  console.log('leads convert dedupe tests passed');
}

main().catch((err) => {
  console.error(err && err.stack ? err.stack : String(err));
  process.exit(1);
});
