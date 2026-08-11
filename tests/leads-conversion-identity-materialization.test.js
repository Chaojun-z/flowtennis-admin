const assert = require('assert');
const { createLeadsRoutes } = require('../server/leads-routes');
const rules = require('../api/index.js')._test;

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

function makeHarness() {
  let idSeq = 1;
  const rows = {
    ft_leads: [],
    ft_lead_followups: [],
    ft_students: [],
    ft_courts: [],
    ft_membership_accounts: [],
    ft_purchases: [],
    ft_entitlements: [],
    ft_schedule: [],
    ft_membership_orders: [],
    ft_lead_import_batches: []
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
      const list = rows[table] || [];
      const index = list.findIndex((item) => item.id === id);
      if (index >= 0) list[index] = row;
      else list.push(row);
      rows[table] = list;
    },
    filterLoadAllForUser: (payload) => payload,
    isProductionRuntime: () => false,
    isCampusScopedAdmin: () => false,
    cleanLeadText: (value) => String(value || '').trim(),
    ensureLeadTables: async () => {},
    scanFirstRows: async (table) => rows[table] || [],
    PRODUCTION_PAGE_READ_LIMITS: {},
    LEAD_FOLLOWUP_LIST_PROJECTION_FIELDS: [],
    LEAD_LIST_PROJECTION_FIELDS: [],
    mergeDuplicateLeadRows: rules.mergeDuplicateLeadRows,
    normalizeLeadRecord: rules.normalizeLeadRecord,
    leadCanonicalNameKey: rules.leadCanonicalNameKey,
    mergeLeadRows: rules.mergeLeadRows,
    buildLeadInitialFollowup: rules.buildLeadInitialFollowup,
    normalizeLeadFollowupRecord: rules.normalizeLeadFollowupRecord,
    applyLeadFollowupsSnapshot: rules.applyLeadFollowupsSnapshot,
    applyLeadFollowupSnapshot: rules.applyLeadFollowupSnapshot,
    normalizeLeadImportRows: rules.normalizeLeadImportRows,
    buildLeadImportPreviewRows: rules.buildLeadImportPreviewRows,
    leadImportPreviewSummary: rules.leadImportPreviewSummary,
    dedupeLeadRows: rules.dedupeLeadRows,
    buildLeadDedupKey: rules.buildLeadDedupKey,
    buildLeadStudentRecord: rules.buildLeadStudentRecord,
    buildLeadCourtRecord: rules.buildLeadCourtRecord,
    matchLeadToStudent: rules.matchLeadToStudent,
    matchLeadToCourt: rules.matchLeadToCourt,
    uuidv4: () => `id-${idSeq++}`,
    T_LEADS: 'ft_leads',
    T_LEAD_FOLLOWUPS: 'ft_lead_followups',
    T_LEAD_IMPORT_BATCHES: 'ft_lead_import_batches',
    T_STUDENTS: 'ft_students',
    T_COURTS: 'ft_courts',
    T_MEMBERSHIP_ACCOUNTS: 'ft_membership_accounts',
    T_PURCHASES: 'ft_purchases',
    T_ENTITLEMENTS: 'ft_entitlements',
    T_SCHEDULE: 'ft_schedule',
    T_MEMBERSHIP_ORDERS: 'ft_membership_orders'
  });
  return { rows, handle };
}

async function postFollowup(handle, leadId, dealType) {
  const res = makeRes();
  await handle({
    path: `/leads/${leadId}/followups`,
    method: 'POST',
    body: { statusAfter: '已成交', dealType, followupAt: '2026-07-17' },
    user: { role: 'admin', name: 'Mira' },
    res,
    query: new URLSearchParams()
  });
  assert.strictEqual(res.statusCode, 200, `${dealType} followup should save`);
  return res.body.lead;
}

function assertIdentity(row, expected, label) {
  assert.strictEqual(!!row.studentId, expected.student, `${label} student identity`);
  assert.strictEqual(!!row.courtId, expected.court, `${label} court identity`);
  assert.strictEqual(!!row.membershipAccountId, expected.membership, `${label} membership identity`);
}

async function main() {
  const cases = [
    ['订场', { student: false, court: true, membership: false }],
    ['陪打', { student: true, court: false, membership: false }],
    ['课程', { student: true, court: false, membership: false }],
    ['课程+订场', { student: true, court: true, membership: false }],
    ['课程+订场会员', { student: true, court: true, membership: true }],
    ['订场+订场会员', { student: false, court: true, membership: true }],
    ['订场+陪打', { student: true, court: true, membership: false }],
    ['课程+订场+订场会员', { student: true, court: true, membership: true }]
  ];

  for (const [dealType, expected] of cases) {
    const { rows, handle } = makeHarness();
    const lead = rules.normalizeLeadRecord({
      id: `lead-${dealType}`,
      displayName: `测试${dealType}`,
      wechatName: `测试${dealType}`,
      phone: '',
      leadDate: '2026-07-17'
    }, { id: `lead-${dealType}`, now: '2026-07-17 10:00:00' });
    rows.ft_leads.push(lead);
    const updated = await postFollowup(handle, lead.id, dealType);
    assertIdentity(updated, expected, dealType);
    assert.strictEqual(rows.ft_students.length, expected.student ? 1 : 0, `${dealType} student row count`);
    assert.strictEqual(rows.ft_courts.length, expected.court ? 1 : 0, `${dealType} court row count`);
    assert.strictEqual(rows.ft_membership_accounts.length, expected.membership ? 1 : 0, `${dealType} membership row count`);
  }

  const { rows, handle } = makeHarness();
  rows.ft_leads.push({
    id: 'lead-history',
    displayName: '历史待补齐',
    wechatName: '历史待补齐',
    leadStage: '已成交',
    systemStatus: '已成交',
    dealType: '课程+订场+订场会员',
    conversionType: '课程+订场+订场会员',
    leadDate: '2026-07-01',
    createdAt: '2026-07-01 10:00:00'
  });
  const listRes = makeRes();
  await handle({ path: '/leads', method: 'GET', body: {}, user: { role: 'admin' }, res: listRes, query: new URLSearchParams() });
  assert.strictEqual(listRes.statusCode, 200, 'historical lead list should load');
  const displayedHistoryLead = listRes.body.find((row) => row.id === 'lead-history');
  assertIdentity(displayedHistoryLead, { student: false, court: false, membership: false }, 'historical lazy GET display must not materialize identities');
  const historyLead = rows.ft_leads.find((row) => row.id === 'lead-history');
  assertIdentity(historyLead, { student: false, court: false, membership: false }, 'historical lazy GET must not persist repair');

  console.log('leads conversion identity materialization tests passed');
}

main().catch((err) => {
  console.error(err && err.stack ? err.stack : String(err));
  process.exit(1);
});
