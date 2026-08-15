const assert = require('assert');
const api = require('../api/index.js');
const { createLeadsRoutes } = require('../server/leads-routes.js');

const rules = api._test;

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

function makeHarness(rows) {
  return createLeadsRoutes({
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
    isProductionRuntime: () => true,
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
    uuidv4: (() => {
      let seq = 1;
      return () => `id-${seq++}`;
    })(),
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
}

const csv = [
  '序号,线索时间,微信名/电话,基本情况,基本情况,线索渠道,需求产品,意向等级,跟进人,跟进状态,体验课时间,正式课报名时间,跟进沟通信息,跟进沟通信息,是否转化,正式课教练,未成交原因',
  ',,,水平,其他信息（包含年纪等）,,,,,,,,用户顾虑点,沟通情况和方案建议,,,',
  '1,2026/4/7,Leah,未知,咨询孙老师私教课,大众点评,成人私教,低意向,Mira,跟进中,,,价格,介绍了孙老师的私教课价格后，用户未回复,否,,',
  '2,2026/4/7,Leah,未知,咨询孙老师私教课,大众点评,成人私教,低意向,Mira,跟进中,,,价格,介绍了孙老师的私教课价格后，用户未回复,否,,'
].join('\n');

const rows = rules.normalizeLeadImportRows({ csvText: csv });
assert.strictEqual(rows.length, 2);
assert.strictEqual(rows[0].displayName, 'Leah');
assert.strictEqual(rows[0].source, '大众点评');
assert.strictEqual(rows[0].customerType, '成人');
assert.strictEqual(rows[0].demandProduct, '私教课');
assert.strictEqual(rows[0].consultType, '私教课');

const normalizedRows = rules.normalizeLeadImportRows({
  rows: [
    { source: '朋友转介绍', consultType: '成人小班课（专项/训练营）' },
    { source: '直接线下到电', consultType: '青少年小班课（训练营）' },
    { source: '播客', consultType: '合作等' }
  ]
});
assert.deepStrictEqual(normalizedRows.map(row => row.source), ['转介绍', '线下到店', '播客']);
assert.deepStrictEqual(normalizedRows.map(row => row.customerType), ['成人', '青少年', '成人']);
assert.deepStrictEqual(normalizedRows.map(row => row.demandProduct), ['小班课', '小班课', '合作']);
assert.deepStrictEqual(normalizedRows.map(row => row.consultType), ['小班课', '小班课', '合作']);

const deduped = rules.dedupeLeadRows(rows);
assert.strictEqual(deduped.length, 1);

const variantDeduped = rules.dedupeLeadRows([
  { displayName: 'Leah 13800138000', leadDate: '2026/4/7', source: '大众点评', consultType: '成人私教' },
  { wechatName: 'Leah', phone: '13800138000', leadDate: '2026-04-07', source: ' 大众点评 ', consultType: '成人私教 ' }
]);
assert.strictEqual(variantDeduped.length, 1);

const preview = rules.buildLeadImportPreviewRows(deduped, {
  students: [{ id: 'stu-1', name: 'Leah', phone: '' }],
  courts: [],
  membershipAccounts: []
});

assert.strictEqual(preview[0].studentMatchType, 'possible');
assert.strictEqual(preview[0].courtMatchType, 'none');

const summary = rules.leadImportPreviewSummary(preview);
assert.strictEqual(summary.totalRows, 1);
assert.strictEqual(summary.possibleMatches, 1);

const singleCsv = [
  '序号,线索时间,微信名/电话,基本情况,基本情况,线索渠道,需求产品,意向等级,跟进人,跟进状态,体验课时间,正式课报名时间,跟进沟通信息,跟进沟通信息,是否转化,正式课教练,未成交原因',
  ',,,水平,其他信息（包含年纪等）,,,,,,,,用户顾虑点,沟通情况和方案建议,,,',
  '1,2026/4/7,Leah,未知,咨询孙老师私教课,大众点评,成人私教,低意向,Mira,跟进中,,,价格,介绍了孙老师的私教课价格后，用户未回复,否,,'
].join('\n');

(async () => {
  const importRows = {
    ft_leads: [
      rules.normalizeLeadRecord({
        id: 'lead-imported',
        displayName: 'Leah',
        wechatName: 'Leah',
        phone: '',
        leadDate: '2026-04-07',
        source: '大众点评',
        demandProduct: '成人私教'
      }, { id: 'lead-imported', now: '2026-04-07T10:00:00.000Z' })
    ],
    ft_lead_followups: [],
    ft_lead_import_batches: [],
    ft_students: [],
    ft_courts: [],
    ft_membership_accounts: [],
    ft_purchases: [],
    ft_entitlements: [],
    ft_schedule: [],
    ft_membership_orders: []
  };
  const importHandle = makeHarness(importRows);
  const importRes = makeRes();
  await importHandle({
    path: '/leads/import-commit',
    method: 'POST',
    body: { csvText: singleCsv },
    user: { role: 'admin' },
    res: importRes,
    query: new URLSearchParams()
  });
  assert.strictEqual(importRes.statusCode, 200, 'same-name no-phone import commit should succeed');
  assert.strictEqual(importRes.body.leadCount, 0, 'same-name no-phone import commit should not create a second lead');
  assert.strictEqual(importRes.body.skippedDuplicates, 1, 'same-name no-phone import commit should count the reused row as skipped');
  assert.strictEqual(importRows.ft_leads.length, 1, 'same-name no-phone import commit should keep only the existing lead row');

  console.log('leads import tests passed');
})().catch(error => {
  console.error(error && error.stack ? error.stack : String(error));
  process.exit(1);
});
