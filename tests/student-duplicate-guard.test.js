const assert = require('assert');
const { createStudentRoutes } = require('../server/students-routes');

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
    ft_students: [
      { id: 'student-phone', name: '手机号重复', phone: '13800138000', campus: 'shunyi_mapo' },
      { id: 'student-name-campus', name: '一帆（YING）', phone: '', campus: 'shunyi_mapo' }
    ]
  };
  const handle = createStudentRoutes({
    init: async () => {},
    sendJson: (res, payload, status = 200) => {
      res.status(status).json(payload);
      return true;
    },
    getFastStudentsRead: async () => rows.ft_students,
    getCachedScan: async () => [],
    scan: async (table) => rows[table] || [],
    filterLoadAllForUser: ({ students }) => students,
    buildCoachRefs: () => ({}),
    assertStudentWriteAccess: () => {},
    uuidv4: () => 'new-student',
    assertPhone: (value) => String(value || '').replace(/\s+/g, '').trim(),
    put: async (table, id, row) => {
      writes.push({ table, id, row });
      const list = rows[table] || [];
      const index = list.findIndex((item) => item.id === id);
      if (index >= 0) list[index] = row;
      else list.push(row);
    },
    get: async (table, id) => (rows[table] || []).find((row) => row.id === id) || null,
    applyStudentIdentityUpdate: async () => ({ plans: [], schedule: [], purchases: [], entitlements: [], feedbacks: [] }),
    deleteStudentCascade: async () => ({}),
    T_STUDENTS: 'ft_students',
    T_SCHEDULE: 'ft_schedule',
    T_CLASSES: 'ft_classes',
    T_COACHES: 'ft_coaches',
    T_USERS: 'ft_users'
  });

  const samePhoneRes = makeRes();
  await handle({
    path: '/students',
    method: 'POST',
    body: { name: '另一个人', phone: '138 0013 8000', campus: 'shilipu' },
    user: { role: 'admin' },
    res: samePhoneRes
  });
  assert.strictEqual(samePhoneRes.statusCode, 409, 'same phone should be rejected');
  assert.match(samePhoneRes.body.error, /手机号已存在/);

  const sameNameCampusRes = makeRes();
  await handle({
    path: '/students',
    method: 'POST',
    body: { name: '一帆（YING）', phone: '', campus: 'shunyi_mapo' },
    user: { role: 'admin' },
    res: sameNameCampusRes
  });
  assert.strictEqual(sameNameCampusRes.statusCode, 409, 'same name and same campus without phone should be rejected');
  assert.match(sameNameCampusRes.body.error, /同名同校区学员已存在/);

  const sameNameOtherCampusRes = makeRes();
  await handle({
    path: '/students',
    method: 'POST',
    body: { name: '一帆（YING）', phone: '', campus: 'shilipu' },
    user: { role: 'admin' },
    res: sameNameOtherCampusRes
  });
  assert.strictEqual(sameNameOtherCampusRes.statusCode, 200, 'same name in another campus should still be allowed when phone is empty');

  const skipDuplicateCheckHandle = createStudentRoutes({
    init: async () => {},
    sendJson: (res, payload, status = 200) => {
      res.status(status).json(payload);
      return true;
    },
    getFastStudentsRead: async () => {
      throw new Error('should not read students for quick create');
    },
    getCachedScan: async () => [],
    scan: async (table) => rows[table] || [],
    filterLoadAllForUser: ({ students }) => students,
    buildCoachRefs: () => ({}),
    assertStudentWriteAccess: () => {},
    uuidv4: () => 'quick-create-student',
    assertPhone: (value) => String(value || '').replace(/\s+/g, '').trim(),
    put: async (table, id, row) => {
      writes.push({ table, id, row });
      const list = rows[table] || [];
      const index = list.findIndex((item) => item.id === id);
      if (index >= 0) list[index] = row;
      else list.push(row);
    },
    get: async (table, id) => (rows[table] || []).find((row) => row.id === id) || null,
    applyStudentIdentityUpdate: async () => ({ plans: [], schedule: [], purchases: [], entitlements: [], feedbacks: [] }),
    deleteStudentCascade: async () => ({}),
    T_STUDENTS: 'ft_students',
    T_SCHEDULE: 'ft_schedule',
    T_CLASSES: 'ft_classes',
    T_COACHES: 'ft_coaches',
    T_USERS: 'ft_users'
  });

  const skipDuplicateRes = makeRes();
  await skipDuplicateCheckHandle({
    path: '/students',
    method: 'POST',
    body: { name: '快速建档学员', phone: '', campus: 'shilipu', skipDuplicateCheck: true },
    user: { role: 'admin' },
    res: skipDuplicateRes
  });
  assert.strictEqual(skipDuplicateRes.statusCode, 200, 'quick-create save should bypass duplicate table reads');

  const editSelfRes = makeRes();
  await handle({
    path: '/students/student-name-campus',
    method: 'PUT',
    body: { name: '一帆（YING）', phone: '', campus: 'shunyi_mapo', notes: '更新备注' },
    user: { role: 'admin' },
    res: editSelfRes
  });
  assert.strictEqual(editSelfRes.statusCode, 200, 'editing the same student should not match itself as duplicate');
  assert.strictEqual(editSelfRes.body.id, 'student-name-campus');

  assert.ok(!writes.some((item) => item.id === 'new-student' && item.row.phone === '13800138000'), 'duplicate phone row should not be written');
  assert.ok(!writes.some((item) => item.id === 'new-student' && item.row.campus === 'shunyi_mapo'), 'duplicate name-campus row should not be written');

  console.log('student duplicate guard tests passed');
}

main().catch((err) => {
  console.error(err && err.stack ? err.stack : String(err));
  process.exit(1);
});
