const assert = require('assert');
const { createLeadsRoutes } = require('../server/leads-routes');
const {
  buildStudentTeachingSummaryChecksum,
  buildStudentTeachingSummaryMetaRow,
  STUDENT_TEACHING_SUMMARY_READY
} = require('../server/read-models/student-teaching-summary-cache');

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
  const tableScans = {};
  const studentId = 'student-shadow';
  const syntheticLeadId = `lead-from-student-${studentId}`;
  const summaryRows = [{
    id: studentId,
    studentId,
    displayName: '小5',
    name: '小5',
    phone: '',
    sourceLeadId: '',
    source: '未知',
    campus: 'shunyi_mapo',
    customerType: '成人',
    demandProduct: '其他',
    studentStage: 'formal',
    packagePurchaseDate: '2026-08-29',
    hasTrialAttended: false,
    hasFormalAttended: true,
    isHistoricalStudentRoster: true,
    isActiveStudentRoster: true
  }];
  const rows = {
    ft_leads: [],
    ft_students: [{
      id: studentId,
      name: '小5',
      phone: '',
      source: '未知',
      campus: 'shunyi_mapo',
      createdAt: '2026-09-05T10:00:00.000Z',
      updatedAt: '2026-09-05T10:00:00.000Z'
    }],
    ft_lead_followups: [],
    ft_student_teaching_summary: [
      buildStudentTeachingSummaryMetaRow({
        status: STUDENT_TEACHING_SUMMARY_READY,
        rowCount: summaryRows.length,
        checksum: buildStudentTeachingSummaryChecksum(summaryRows),
        batchId: 'synthetic-student-summary',
        sourceSnapshotAt: '2026-08-29T00:00:00.000Z',
        completedAt: '2026-08-29T00:00:01.000Z'
      }),
      ...summaryRows
    ],
    ft_court_account_list_index: []
  };
  const handle = createLeadsRoutes({
    init: async () => {},
    sendJson: (res, payload, status = 200) => {
      res.status(status).json(payload);
      return true;
    },
    getCachedScan: async table => {
      tableScans[table] = (tableScans[table] || 0) + 1;
      return rows[table] || [];
    },
    getCachedRow: async (table, id) => (rows[table] || []).find(row => String(row.id || '') === String(id || '')) || null,
    scanByIdPrefix: async (table, prefix) => (rows[table] || []).filter(row => String(row.id || '').startsWith(prefix)),
    get: async (table, id) => (rows[table] || []).find(row => String(row.id || '') === String(id || '')) || null,
    scan: async table => rows[table] || [],
    put: async (table, id, row) => {
      writes.push({ table, id, row });
      const list = rows[table] || [];
      const index = list.findIndex(item => String(item.id || '') === String(id || ''));
      rows[table] = index >= 0 ? list.map(item => String(item.id || '') === String(id || '') ? row : item) : [...list, row];
    },
    ensureLeadTables: async () => {},
    isProductionRuntime: () => false,
    filterLoadAllForUser: payload => payload,
    uuidv4: () => 'new-random-id-should-not-be-used',
    cleanLeadText: value => String(value || '').trim(),
    mergeDuplicateLeadRows: items => items,
    normalizeLeadRecord: (row, opts = {}) => ({ ...row, id: row.id || opts.id || 'normalized-id', updatedAt: opts.now || row.updatedAt || '' }),
    applyLeadFollowupsSnapshot: lead => lead,
    buildLeadInitialFollowup: lead => ({ id: `followup-${lead.id}`, leadId: lead.id }),
    buildLeadStudentRecord: () => ({ id: 'unused-student' }),
    buildLeadCourtRecord: () => ({ id: 'unused-court' }),
    matchLeadToStudent: () => ({ matchType: 'none', record: null }),
    matchLeadToCourt: () => ({ matchType: 'none', record: null }),
    T_LEADS: 'ft_leads',
    T_LEAD_FOLLOWUPS: 'ft_lead_followups',
    T_STUDENTS: 'ft_students',
    T_COURTS: 'ft_courts',
    T_MEMBERSHIP_ACCOUNTS: 'ft_membership_accounts',
    T_PURCHASES: 'ft_purchases',
    T_ENTITLEMENTS: 'ft_entitlements',
    T_SCHEDULE: 'ft_schedule',
    T_MEMBERSHIP_ORDERS: 'ft_membership_orders',
    T_STUDENT_TEACHING_SUMMARY: 'ft_student_teaching_summary',
    T_COURT_ACCOUNT_LIST_INDEX: 'ft_court_account_list_index'
  });

  const listRes = makeRes();
  await handle({ path: '/leads', method: 'GET', body: {}, user: { role: 'admin' }, res: listRes, query: new URLSearchParams() });
  const syntheticRow = listRes.body.find(row => row.id === syntheticLeadId);
  assert.ok(syntheticRow, '线索池列表应展示缺少真实线索绑定的学员');
  assert.strictEqual(syntheticRow.leadDate, '2026-08-29', '列表里的影子线索时间必须来自业务日期，不能用摘要更新时间');
  assert.ok(!writes.some(item => item.table === 'ft_leads'), 'GET 线索列表仍然不能自动补写真实线索');

  const detailRes = makeRes();
  await handle({ path: `/leads/${syntheticLeadId}`, method: 'GET', body: {}, user: { role: 'admin' }, res: detailRes, query: new URLSearchParams() });
  assert.strictEqual(detailRes.statusCode, 200, '影子线索详情应可打开，不能返回 404');
  assert.strictEqual(detailRes.body.id, syntheticLeadId, '影子线索详情应保持当前展示 ID，避免前端抽屉错位');
  assert.strictEqual(detailRes.body.displayName, '小5', '影子线索详情应读取对应学员信息');
  assert.strictEqual(detailRes.body.leadDate, '2026-08-29', '影子线索详情不能把学员 createdAt 当成线索时间');

  const saveRes = makeRes();
  await handle({
    path: `/leads/${syntheticLeadId}`,
    method: 'PUT',
    body: {
      displayName: '小5',
      wechatName: '小5',
      phone: '',
      leadDate: '2026-08-29',
      source: '未知',
      campus: 'shunyi_mapo',
      customerType: '成人',
      demandProduct: '其他',
      owner: 'Mira',
      profileNote: ''
    },
    user: { role: 'admin', name: '管理员' },
    res: saveRes,
    query: new URLSearchParams()
  });
  assert.strictEqual(saveRes.statusCode, 200, '影子线索保存应成功，不能提示线索不存在');
  assert.ok(!String(saveRes.body.id || '').startsWith('lead-from-student-'), '保存后应返回真实线索 ID');
  assert.strictEqual(saveRes.body.leadDate, '2026-08-29', '保存影子线索时必须保留用户看到的线索时间');
  const savedLeadWrites = writes.filter(item => item.table === 'ft_leads');
  assert.strictEqual(savedLeadWrites.length, 1, '保存影子线索只能新增或更新这一条真实线索');
  assert.strictEqual(savedLeadWrites[0].id, `lead-${studentId}`, '影子线索应转成稳定真实线索 ID，避免重试重复创建');
  assert.strictEqual(savedLeadWrites[0].row.studentId, studentId, '新真实线索必须绑定原学员');
  assert.strictEqual(savedLeadWrites[0].row.leadDate, '2026-08-29', '写入真实线索时不能改坏线索时间');
  const linkedStudent = rows.ft_students.find(row => row.id === studentId);
  assert.strictEqual(linkedStudent.sourceLeadId, `lead-${studentId}`, '保存后学员必须绑定真实线索，后续同类操作不再报错');
  assert.strictEqual(tableScans.ft_schedule || 0, 0, '影子线索查看/保存不能扫描排课大表');
  assert.strictEqual(tableScans.ft_purchases || 0, 0, '影子线索查看/保存不能扫描课包购买大表');
  assert.strictEqual(tableScans.ft_entitlements || 0, 0, '影子线索查看/保存不能扫描权益大表');

  console.log('leads synthetic student detail/save tests passed');
}

main().catch(error => {
  console.error(error && error.stack ? error.stack : String(error));
  process.exit(1);
});
