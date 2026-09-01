const assert = require('assert');
const { createLeadsRoutes } = require('../server/leads-routes.js');
const { buildLeadPoolRows } = require('../server/read-models/platform-metrics.js');
const { buildCustomerLifecycleRows } = require('../server/read-models/customer-lifecycle.js');
const {
  buildStudentTeachingSummaryChecksum,
  buildStudentTeachingSummaryMetaRow,
  buildVersionedStudentTeachingSummaryRow
} = require('../server/read-models/student-teaching-summary-cache.js');

function readySummaryRows(rows = []) {
  const version = 'summary-batch';
  return [
    buildStudentTeachingSummaryMetaRow({
      status: 'ready',
      rowCount: rows.length,
      generation: 1,
      batchId: version,
      activeVersion: version,
      sourceSnapshotAt: '2026-09-01T00:00:00.000Z',
      completedAt: '2026-09-01T00:00:01.000Z',
      checksum: buildStudentTeachingSummaryChecksum(rows)
    }),
    ...rows.map(row => buildVersionedStudentTeachingSummaryRow(row, version))
  ];
}

const realLead = {
  id: 'lead-one1',
  displayName: 'one1',
  wechatName: 'one1',
  leadDate: '2026-08-30',
  createdAt: '2026-08-30 10:00:00',
  source: '大众点评'
};

const summaryLifecycleRows = buildCustomerLifecycleRows({
  students: [
    {
      id: 'student-one1',
      name: 'one1',
      createdAt: '2026-08-30 09:00:00'
    }
  ]
});
const summaryLifecycleRow = {
  ...summaryLifecycleRows[0],
  studentId: 'student-one1',
  displayName: 'one1',
  name: 'one1',
  sourceLeadId: '',
  leadId: '',
  customerKey: 'teaching-summary:student-one1',
  leadDate: '2026-08-30',
  createdAt: '2026-08-30 09:00:00',
  hasTrialExperience: true,
  hasCourseStudentEntry: true,
  hasScheduleRecord: true,
  studentStage: 'trial'
};

const pooledRows = buildLeadPoolRows({
  leads: [realLead],
  customerLifecycleRows: [summaryLifecycleRow]
});
assert.strictEqual(pooledRows.length, 1, '同名真实线索和摘要虚拟线索必须合并成 1 条');
assert.strictEqual(pooledRows[0].id, 'lead-one1', '合并后必须保留真实线索 id，而不是摘要虚拟 id');

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

const handle = createLeadsRoutes({
  init: async () => {},
  sendJson: (res, payload, status = 200) => {
    res.status(status).json(payload);
    return true;
  },
  getCachedScan: async table => {
    const tables = {
      ft_leads: [realLead],
      ft_lead_followups: [],
      ft_students: [],
      ft_courts: [],
      ft_membership_accounts: [],
      ft_purchases: [],
      ft_entitlements: [],
      ft_schedule: [],
      ft_membership_orders: [],
      ft_entitlement_ledger: [],
      ft_membership_benefit_ledger: [],
      ft_membership_account_events: [],
      ft_financial_ledger: [],
      ft_plans: [],
      ft_classes: [],
      ft_feedbacks: [],
      ft_student_teaching_summary: readySummaryRows([
        {
          id: 'student-one1',
          studentId: 'student-one1',
          displayName: 'one1',
          name: 'one1',
          hasTrialAttended: true,
          hasFormalAttended: false,
          isHistoricalStudentRoster: true,
          isActiveStudentRoster: true
        }
      ]),
      ft_court_account_list_index: []
    };
    return tables[table] || [];
  },
  scanFirstRows: async table => {
    const tables = {
      ft_leads: [realLead]
    };
    return tables[table] || [];
  },
  filterLoadAllForUser: payload => payload,
  isProductionRuntime: () => false,
  isCampusScopedAdmin: () => false,
  cleanLeadText: value => String(value || '').trim(),
  ensureLeadTables: async () => {},
  PRODUCTION_PAGE_READ_LIMITS: { leadFollowups: 20, schedule: 20, entitlementLedger: 20 },
  LEAD_FOLLOWUP_LIST_PROJECTION_FIELDS: [],
  LEAD_LIST_PROJECTION_FIELDS: [],
  mergeDuplicateLeadRows: rows => rows,
  normalizeLeadRecord: row => row,
  leadCanonicalNameKey: row => String(row.displayName || row.name || '').trim().toLowerCase(),
  mergeLeadRows: rows => rows,
  buildLeadInitialFollowup: row => row,
  normalizeLeadFollowupRecord: row => row,
  applyLeadFollowupsSnapshot: rows => rows,
  applyLeadFollowupSnapshot: row => row,
  normalizeLeadImportRows: rows => rows,
  buildLeadImportPreviewRows: rows => rows,
  leadImportPreviewSummary: rows => rows,
  dedupeLeadRows: rows => rows,
  buildLeadDedupKey: row => row.id,
  buildLeadStudentRecord: row => row,
  buildLeadCourtRecord: row => row,
  matchLeadToStudent: () => false,
  matchLeadToCourt: () => false,
  uuidv4: () => 'id',
  T_LEADS: 'ft_leads',
  T_LEAD_FOLLOWUPS: 'ft_lead_followups',
  T_LEAD_IMPORT_BATCHES: 'ft_lead_import_batches',
  T_STUDENTS: 'ft_students',
  T_COURTS: 'ft_courts',
  T_MEMBERSHIP_ACCOUNTS: 'ft_membership_accounts',
  T_PURCHASES: 'ft_purchases',
  T_ENTITLEMENTS: 'ft_entitlements',
  T_SCHEDULE: 'ft_schedule',
  T_MEMBERSHIP_ORDERS: 'ft_membership_orders',
  T_ENTITLEMENT_LEDGER: 'ft_entitlement_ledger',
  T_MEMBERSHIP_BENEFIT_LEDGER: 'ft_membership_benefit_ledger',
  T_MEMBERSHIP_ACCOUNT_EVENTS: 'ft_membership_account_events',
  T_FINANCIAL_LEDGER: 'ft_financial_ledger',
  T_PLANS: 'ft_plans',
  T_CLASSES: 'ft_classes',
  T_FEEDBACKS: 'ft_feedbacks',
  T_STUDENT_TEACHING_SUMMARY: 'ft_student_teaching_summary',
  T_COURT_ACCOUNT_LIST_INDEX: 'ft_court_account_list_index'
});

(async () => {
  const res = makeRes();
  await handle({
    path: '/leads',
    method: 'GET',
    body: {},
    user: { role: 'admin', name: '管理员' },
    res,
    query: new URLSearchParams('paged=1&page=1&pageSize=15')
  });
  assert.strictEqual(res.statusCode, 200, '线索池列表应正常返回');
  assert.strictEqual(res.body.total, 1, '线索池列表必须把真实线索和摘要虚拟线索合并成 1 条');
  assert.strictEqual(res.body.rows.length, 1, '线索池首屏只能显示 1 条');
  assert.strictEqual(res.body.rows[0].id, 'lead-one1', '线索池首屏必须保留真实线索 id');

  console.log('leads pool summary dedupe tests passed');
})().catch(error => {
  console.error(error && error.stack ? error.stack : String(error));
  process.exit(1);
});
