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
    ft_leads: [
      { id: 'lead-1', displayName: '小成', wechatName: '小成', createdAt: '2026-06-17 00:00:00' },
      {
        id: 'lead-from-student-student-4',
        displayName: '丫丫',
        wechatName: '丫丫',
        studentId: 'student-4',
        leadDate: '2026-06-26 03:37:16',
        createdAt: '2026-06-26 03:37:16'
      },
      {
        id: 'lead-from-student-student-missing',
        displayName: '董凡轩',
        wechatName: '董凡轩',
        studentId: 'student-missing',
        source: '小红书',
        customerType: '成人',
        demandProduct: '其他',
        leadStage: '已成交',
        conversionType: '课程',
        dealType: '课程',
        leadDate: '2026-06-26 03:37:16',
        createdAt: '2026-06-26 03:37:16'
      },
      {
        id: 'lead-from-student-student-shell',
        displayName: '学生壳',
        wechatName: '学生壳',
        studentId: '',
        source: '小红书',
        customerType: '成人',
        demandProduct: '其他',
        leadStage: '已成交',
        systemStatus: '已成交',
        conversionType: '课程',
        dealType: '课程',
        isCourseConverted: true,
        leadDate: '',
        createdAt: '2026-06-26 03:37:16'
      }
    ],
    ft_students: [
      { id: 'student-1', name: '小成' },
      { id: 'student-2', name: '可搜学员', phone: '13900000002', createdAt: '2026-06-26 03:37:16' },
      { id: 'student-3', name: '污染学员', phone: '13900000003', sourceLeadId: 'lead-polluted', createdAt: '2026-06-26 03:37:16' },
      { id: 'student-4', name: '丫丫', phone: '13900000004', createdAt: '2026-06-26 03:37:16' },
      { id: 'student-shell', name: '学生壳', phone: '', campus: 'chaojun', sourceLeadId: 'lead-from-student-student-shell', updatedAt: '2026-06-01 09:51:06' }
    ],
    ft_courts: [{ id: 'court-1', name: '小成', status: 'active' }],
    ft_purchases: [{
      id: 'purchase-1',
      studentId: 'student-2',
      packageName: '正式课包',
      status: 'active',
      purchaseDate: '2026-04-15',
      notes: '来源价格1：课包消耗记录#281；1；余额9/10'
    }, {
      id: 'purchase-2',
      studentId: 'student-3',
      packageName: '正式课包',
      status: 'active',
      purchaseDate: '2026-04-18'
    }, {
      id: 'purchase-3',
      studentId: 'student-4',
      packageName: '正式课包',
      status: 'active',
      purchaseDate: '2026-03-21'
    }],
    ft_entitlements: [],
    ft_schedule: [],
    ft_membership_orders: [],
    ft_membership_accounts: []
  };
  const handle = createLeadsRoutes({
    init: async () => {},
    sendJson: (res, payload, status = 200) => {
      res.status(status).json(payload);
      return true;
    },
    getCachedScan: async (table) => rows[table] || [],
    get: async (table, id) => (rows[table] || []).find((row) => row.id === id) || null,
    scan: async (table) => rows[table] || [],
    put: async (table, id, row) => {
      writes.push({ table, id, row });
      const list = rows[table] || [];
      const index = list.findIndex((item) => item.id === id);
      if (index >= 0) list[index] = row;
      else list.push(row);
      rows[table] = list;
    },
    ensureLeadTables: async () => {},
    isProductionRuntime: () => false,
    filterLoadAllForUser: (payload) => payload,
    cleanLeadText: (value) => String(value || '').trim(),
    mergeDuplicateLeadRows: (items) => items,
    normalizeLeadRecord: (row) => row,
    buildLeadStudentRecord: () => ({ id: 'new-student', name: '小成' }),
    buildLeadCourtRecord: () => ({ id: 'new-court', name: '小成' }),
    matchLeadToStudent: (lead, students) => ({ matchType: 'possible', record: students.find((row) => row.name === lead.displayName) || null }),
    matchLeadToCourt: (lead, courts) => ({ matchType: 'possible', record: courts.find((row) => row.name === lead.displayName) || null }),
    T_LEADS: 'ft_leads',
    T_STUDENTS: 'ft_students',
    T_COURTS: 'ft_courts',
    T_MEMBERSHIP_ACCOUNTS: 'ft_membership_accounts',
    T_PURCHASES: 'ft_purchases',
    T_ENTITLEMENTS: 'ft_entitlements',
    T_SCHEDULE: 'ft_schedule',
    T_MEMBERSHIP_ORDERS: 'ft_membership_orders'
  });

  const listRes = makeRes();
  await handle({ path: '/leads', method: 'GET', body: {}, user: { role: 'admin' }, res: listRes, query: new URLSearchParams() });
  const materializedStudentLead = listRes.body.find((row) => row.displayName === '可搜学员');
  assert.ok(materializedStudentLead, '线索池默认列表必须补入缺少真实线索绑定的学员');
  assert.strictEqual(materializedStudentLead.id, 'lead-from-student-student-2', '学员倒推进入线索池时必须返回真实线索 ID');
  assert.strictEqual(materializedStudentLead.sourceLeadId, 'lead-from-student-student-2', '学员倒推线索必须能通过 sourceLeadId 回写真实线索');
  assert.strictEqual(materializedStudentLead.leadDate, '2026-04-15', '学员倒推线索必须用最早业务时间作为线索时间，不能显示落表当天');
  assert.strictEqual(materializedStudentLead.profileNote, '', '学员倒推线索不能把课包消耗记录、余额等系统流水塞进基本信息');
  const existingBadDateLead = listRes.body.find((row) => row.displayName === '丫丫');
  assert.strictEqual(existingBadDateLead.leadDate, '2026-03-21', '已落表的学员倒推线索如果错误显示 6 月 26，必须用学员最早业务时间纠正展示');
  const missingStudentLead = listRes.body.find((row) => row.displayName === '董凡轩');
  assert.ok(missingStudentLead, '已落表但没有学员事实的线索仍应出现在原始线索池');
  assert.notStrictEqual(String(missingStudentLead.leadDate || '').slice(0, 10), '2026-06-26', '找不到学员事实的倒推线索不能继续展示错误落表日期 6 月 26');
  assert.notStrictEqual(missingStudentLead.leadStage, '已成交', '找不到学员/购课/上课事实时不能仅凭旧状态显示已成交');
  assert.strictEqual(missingStudentLead.dealType, '', '找不到学员/购课/上课事实时不能仅凭旧字段显示已成交课程');
  const shellStudentLead = listRes.body.find((row) => row.displayName === '学生壳');
  assert.ok(shellStudentLead, '有学生壳但没有购课/排课事实的倒推线索仍应出现在列表，方便后续人工处理');
  assert.strictEqual(shellStudentLead.leadDate, '', '学生壳没有业务事实时不能用合成线索 createdAt 显示为 6 月 26');
  assert.strictEqual(shellStudentLead.leadStage, '已成交', '已成交课程线索即使还没购课/排课，也应保留成交阶段');
  assert.strictEqual(shellStudentLead.dealType, '课程', '已成交课程线索应保留课程成交类型');
  assert.strictEqual(shellStudentLead.studentId, 'student-shell', '已成交课程线索应补齐学员身份，后续才能排课');
  assert.ok(!String(materializedStudentLead.id).startsWith('student:'), '线索池列表不能把 student: 临时 ID 暴露给编辑保存');
  assert.ok(
    !writes.some((item) => item.table === 'ft_leads' && item.id === 'lead-from-student-student-2'),
    '线索池 GET 列表只能展示统一读模型补入的学员线索，不能顺手写入 ft_leads 导致线索数越读越多'
  );
  rows.ft_leads.push({
    id: 'lead-polluted',
    displayName: '污染学员',
    studentId: 'student-3',
    profileNote: '来源价格1：课包消耗记录#281；1；余额9/10',
    leadDate: '2026-04-18',
    createdAt: '2026-06-26 03:37:16'
  });
  const pollutedRes = makeRes();
  await handle({ path: '/leads', method: 'GET', body: {}, user: { role: 'admin' }, res: pollutedRes, query: new URLSearchParams() });
  const pollutedLead = pollutedRes.body.find((row) => row.displayName === '污染学员');
  assert.strictEqual(pollutedLead.profileNote, '', '已落表的系统流水备注也不能继续展示在线索基本信息里');
  assert.ok(!listRes.body.find((row) => row.courtId === 'court-1'), '线索池课程默认列表不能把订场用户也混入课程线索总数');

  const searchRes = makeRes();
  await handle({ path: '/leads', method: 'GET', body: {}, user: { role: 'admin' }, res: searchRes, query: new URLSearchParams('q=小成') });
  assert.ok(searchRes.body.find((row) => row.courtId === 'court-1'), '线索池搜索应能扩展到订场用户生命周期');

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
