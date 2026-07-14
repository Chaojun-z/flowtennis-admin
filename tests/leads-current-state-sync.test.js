const assert = require('assert');
const api = require('../api/index.js');
const { createLeadsRoutes } = require('../server/leads-routes.js');

const rules = api._test;

function clone(row) {
  return row ? JSON.parse(JSON.stringify(row)) : null;
}

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
  const rows = {
    ft_leads: [{
      id: 'lead-wly',
      displayName: '万璐瑶&朱宏',
      wechatName: '万璐瑶&朱宏',
      leadStage: '已成交',
      systemStatus: '已成交',
      rawStatus: '已成交',
      dealType: '',
      conversionType: '',
      studentId: '',
      isCourseConverted: false,
      createdAt: '2026-07-09T09:40:00.000Z',
      updatedAt: '2026-07-09T09:45:18.147Z'
    }],
    ft_lead_followups: [{
      id: 'fu-wly',
      leadId: 'lead-wly',
      statusAfter: '已成交',
      dealType: '课程',
      conversionType: '课程',
      followupAt: '2026-07-09',
      createdAt: '2026-07-09T09:44:01.352Z',
      updatedAt: '2026-07-09T09:44:01.352Z'
    }],
    ft_students: [],
    ft_purchases: [],
    ft_entitlements: [],
    ft_schedule: [],
    ft_courts: [],
    ft_membership_accounts: [],
    ft_membership_orders: []
  };
  const writes = [];

  const handle = createLeadsRoutes({
    init: async () => {},
    sendJson: (res, payload, status = 200) => {
      res.status(status).json(payload);
      return true;
    },
    getCachedScan: async (table) => clone(rows[table] || []),
    get: async (table, id) => clone((rows[table] || []).find(row => row.id === id)),
    scan: async (table) => clone(rows[table] || []),
    put: async (table, id, row) => {
      writes.push({ table, id, row: clone(row) });
      const list = rows[table] || (rows[table] = []);
      const index = list.findIndex(item => item.id === id);
      if (index >= 0) list[index] = clone(row);
      else list.push(clone(row));
    },
    ensureLeadTables: async () => {},
    isProductionRuntime: () => false,
    filterLoadAllForUser: (payload) => payload,
    cleanLeadText: (value) => String(value || '').trim(),
    mergeDuplicateLeadRows: rules.mergeDuplicateLeadRows,
    normalizeLeadRecord: rules.normalizeLeadRecord,
    normalizeLeadFollowupRecord: rules.normalizeLeadFollowupRecord,
    applyLeadFollowupSnapshot: rules.applyLeadFollowupSnapshot,
    applyLeadFollowupsSnapshot: rules.applyLeadFollowupsSnapshot,
    buildLeadStudentRecord: rules.buildLeadStudentRecord,
    buildLeadCourtRecord: rules.buildLeadCourtRecord,
    matchLeadToStudent: rules.matchLeadToStudent,
    matchLeadToCourt: rules.matchLeadToCourt,
    T_LEADS: 'ft_leads',
    T_LEAD_FOLLOWUPS: 'ft_lead_followups',
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
  const leadRow = listRes.body.find(row => row.id === 'lead-wly');
  assert.ok(leadRow, '已成交课程线索必须仍在线索池可见');
  assert.strictEqual(leadRow.leadStage, '已成交', '线索池阶段必须使用最新跟进快照');
  assert.strictEqual(leadRow.dealType, '课程', '线索池成交类型必须使用最新跟进快照，保证创建学员入口出现');

  const updateRes = makeRes();
  await handle({
    path: '/leads/lead-wly',
    method: 'PUT',
    body: { owner: 'Mira' },
    user: { role: 'admin' },
    res: updateRes,
    query: new URLSearchParams()
  });
  assert.strictEqual(updateRes.body.owner, 'Mira');
  assert.strictEqual(updateRes.body.leadStage, '已成交', '保存基础信息后不能把最新成交阶段写丢');
  assert.strictEqual(updateRes.body.dealType, '课程', '保存基础信息后不能把最新成交类型写丢');
  assert.ok(
    writes.some(item => item.table === 'ft_leads' && item.id === 'lead-wly' && item.row.dealType === '课程'),
    '基础信息保存必须把统一后的当前线索状态写回主表'
  );

  console.log('leads current state sync tests passed');
}

main().catch(error => {
  console.error(error && error.stack ? error.stack : String(error));
  process.exit(1);
});
