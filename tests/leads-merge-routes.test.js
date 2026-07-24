const assert = require('assert');
const api = require('../api/index.js');
const { createLeadsRoutes } = require('../server/leads-routes.js');

const rules = api._test;

function clone(value) {
  return value ? JSON.parse(JSON.stringify(value)) : value;
}

function makeRes() {
  return { statusCode: 200, body: null };
}

function createHarness(seedRows) {
  const rows = clone(seedRows);
  const writes = [];
  const deletes = [];
  const handle = createLeadsRoutes({
    init: async () => {},
    sendJson: (res, payload, status = 200) => {
      res.statusCode = status;
      res.body = payload;
      return payload;
    },
    getCachedScan: async table => clone(rows[table] || []),
    get: async (table, id) => clone((rows[table] || []).find(row => String(row.id) === String(id)) || null),
    scan: async table => clone(rows[table] || []),
    put: async (table, id, row) => {
      writes.push({ table, id, row: clone(row) });
      const list = rows[table] || (rows[table] = []);
      const index = list.findIndex(item => String(item.id) === String(id));
      if (index >= 0) list[index] = clone(row);
      else list.push(clone(row));
    },
    del: async (table, id) => {
      deletes.push({ table, id });
      rows[table] = (rows[table] || []).filter(row => String(row.id) !== String(id));
    },
    ensureLeadTables: async () => {},
    isProductionRuntime: () => false,
    filterLoadAllForUser: payload => payload,
    cleanLeadText: value => String(value || '').trim(),
    mergeDuplicateLeadRows: rules.mergeDuplicateLeadRows,
    normalizeLeadRecord: rules.normalizeLeadRecord,
    normalizeLeadFollowupRecord: rules.normalizeLeadFollowupRecord,
    applyLeadFollowupSnapshot: rules.applyLeadFollowupSnapshot,
    applyLeadFollowupsSnapshot: rules.applyLeadFollowupsSnapshot,
    buildLeadInitialFollowup: rules.buildLeadInitialFollowup,
    buildLeadMergePlan: rules.buildLeadMergePlan,
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
  return { rows, writes, deletes, handle };
}

async function request(handle, path, method, body = {}) {
  const res = makeRes();
  await handle({
    path,
    method,
    body,
    user: { role: 'admin', name: 'Mira' },
    res,
    query: new URLSearchParams()
  });
  return res;
}

async function main() {
  assert.ok(rules.buildLeadMergePlan, 'api._test should expose lead merge plan builder');

  const sameNameCreateHarness = createHarness({
    ft_leads: [{
      id: 'lead-existing',
      displayName: '景涵（ -Jinghan-）',
      wechatName: '景涵（ -Jinghan-）',
      phone: '13800000001',
      leadDate: '2026-07-16',
      createdAt: '2026-07-16',
      updatedAt: '2026-07-16'
    }],
    ft_lead_followups: [],
    ft_students: [],
    ft_courts: [],
    ft_membership_accounts: [],
    ft_purchases: [],
    ft_entitlements: [],
    ft_schedule: [],
    ft_membership_orders: []
  });
  const createSameNameRes = await request(sameNameCreateHarness.handle, '/leads', 'POST', {
    id: 'lead-new-same-name',
    displayName: '景涵（ -Jinghan-）',
    wechatName: '景涵（ -Jinghan-）',
    phone: '13900000002',
    leadDate: '2026-07-16',
    createInitialFollowup: false
  });
  assert.strictEqual(createSameNameRes.statusCode, 200);
  assert.strictEqual(createSameNameRes.body.merged, undefined, 'same-name lead create should not auto merge');
  assert.strictEqual(sameNameCreateHarness.rows.ft_leads.length, 2, 'same-name lead create should keep a separate row');
  const sameNameListRes = await request(sameNameCreateHarness.handle, '/leads', 'GET');
  assert.strictEqual(sameNameListRes.statusCode, 200);
  assert.strictEqual(sameNameListRes.body.filter(row => row.displayName === '景涵（ -Jinghan-）').length, 2, 'same-name leads should both appear in the list');

  const seedRows = {
    ft_leads: [{
      id: 'lead-main',
      displayName: '今今',
      phone: '13800000001',
      leadDate: '2026-06-26',
      source: '大众点评',
      demandProduct: '私教课',
      owner: 'Mira',
      leadStage: '跟进中',
      createdAt: '2026-06-26',
      updatedAt: '2026-06-26'
    }, {
      id: 'lead-dup',
      displayName: '今今（旺旺小兮）',
      phone: '13800000001',
      leadDate: '2026-06-27',
      source: '大众点评',
      demandProduct: '私教课',
      owner: '吴敌',
      leadStage: '已体验待成交',
      studentId: 'student-1',
      courtId: 'court-1',
      membershipAccountId: 'member-1',
      createdAt: '2026-06-27',
      updatedAt: '2026-06-28'
    }],
    ft_lead_followups: [{
      id: 'fu-main',
      leadId: 'lead-main',
      followupAt: '2026-06-26',
      followupBy: 'Mira',
      statusAfter: '跟进中',
      communicationNote: '咨询私教课价格'
    }, {
      id: 'fu-dup',
      leadId: 'lead-dup',
      followupAt: '2026-06-29',
      followupBy: '吴敌',
      statusAfter: '已体验待成交',
      communicationNote: '觉得体验课价格贵'
    }],
    ft_students: [{ id: 'student-1', name: '今今', phone: '13800000001', sourceLeadId: 'lead-dup' }],
    ft_courts: [{ id: 'court-1', name: '今今订场', phone: '13800000001', sourceLeadId: 'lead-dup' }],
    ft_membership_accounts: [{ id: 'member-1', courtId: 'court-1', sourceLeadId: 'lead-dup', status: 'active' }],
    ft_purchases: [],
    ft_entitlements: [],
    ft_schedule: [],
    ft_membership_orders: []
  };

  const previewHarness = createHarness(seedRows);
  const previewRes = await request(previewHarness.handle, '/leads/merge-preview', 'POST', {
    primaryLeadId: 'lead-main',
    mergeLeadIds: ['lead-dup']
  });
  assert.strictEqual(previewRes.statusCode, 200);
  assert.strictEqual(previewRes.body.primaryLeadId, 'lead-main');
  assert.deepStrictEqual(previewRes.body.mergeLeadIds, ['lead-dup']);
  assert.strictEqual(previewRes.body.counts.followupsToMove, 1);
  assert.strictEqual(previewRes.body.counts.studentSourceLinks, 1);
  assert.ok(previewRes.body.conflicts.some(item => item.field === 'owner'), 'preview should expose owner conflict');
  assert.ok(!previewHarness.writes.length, 'preview must not write data');

  const mergeHarness = createHarness(seedRows);
  const mergeRes = await request(mergeHarness.handle, '/leads/merge', 'POST', {
    primaryLeadId: 'lead-main',
    mergeLeadIds: ['lead-dup'],
    finalLeadStage: '已体验待成交'
  });
  assert.strictEqual(mergeRes.statusCode, 200);
  assert.strictEqual(mergeRes.body.primaryLead.id, 'lead-main');
  assert.strictEqual(mergeRes.body.primaryLead.leadStage, '跟进中', 'manual merge should keep the primary lead stage and ignore duplicate/legacy final stage input');
  assert.strictEqual(mergeHarness.rows.ft_lead_followups.find(row => row.id === 'fu-dup').leadId, 'lead-main');
  assert.strictEqual(mergeHarness.rows.ft_lead_followups.find(row => row.id === 'fu-dup').originalLeadId, 'lead-dup');
  assert.strictEqual(mergeHarness.rows.ft_students[0].sourceLeadId, 'lead-main');
  assert.strictEqual(mergeHarness.rows.ft_courts[0].sourceLeadId, 'lead-main');
  assert.strictEqual(mergeHarness.rows.ft_membership_accounts[0].sourceLeadId, 'lead-main');
  const dupLead = mergeHarness.rows.ft_leads.find(row => row.id === 'lead-dup');
  assert.strictEqual(dupLead.status, 'merged');
  assert.strictEqual(dupLead.mergedIntoLeadId, 'lead-main');

  const listRes = await request(mergeHarness.handle, '/leads', 'GET');
  assert.ok(listRes.body.find(row => row.id === 'lead-main'), 'primary lead remains visible');
  assert.ok(!listRes.body.find(row => row.id === 'lead-dup'), 'merged duplicate lead should be hidden from default list');

  const studentMergeHarness = createHarness({
    ...seedRows,
    ft_leads: [
      { id: 'lead-a', displayName: '客户A', phone: '13800000001', studentId: 'student-a' },
      { id: 'lead-b', displayName: '客户B', phone: '13900000002', studentId: 'student-b' }
    ],
    ft_students: [
      { id: 'student-a', name: '客户A', phone: '13800000001', sourceLeadId: 'lead-a' },
      { id: 'student-b', name: '客户B', phone: '13900000002', sourceLeadId: 'lead-b' }
    ]
  });
  const studentMergePreviewRes = await request(studentMergeHarness.handle, '/leads/merge-preview', 'POST', {
    primaryLeadId: 'lead-a',
    mergeLeadIds: ['lead-b']
  });
  assert.strictEqual(studentMergePreviewRes.statusCode, 200);
  assert.strictEqual(studentMergePreviewRes.body.counts.studentProfilesMerged, 1, 'empty duplicate student profile should be included in lead merge preview');
  const studentMergeRes = await request(studentMergeHarness.handle, '/leads/merge', 'POST', {
    primaryLeadId: 'lead-a',
    mergeLeadIds: ['lead-b']
  });
  assert.strictEqual(studentMergeRes.statusCode, 200);
  assert.strictEqual(studentMergeHarness.rows.ft_leads.find(row => row.id === 'lead-a').studentId, 'student-a', 'primary lead should keep target student');
  const mergedStudent = studentMergeHarness.rows.ft_students.find(row => row.id === 'student-b');
  assert.strictEqual(mergedStudent.status, 'merged');
  assert.strictEqual(mergedStudent.mergedIntoStudentId, 'student-a');

  const blockedStudentMergeHarness = createHarness({
    ...seedRows,
    ft_leads: [
      { id: 'lead-a', displayName: '客户A', phone: '13800000001', studentId: 'student-a' },
      { id: 'lead-b', displayName: '客户B', phone: '13900000002', studentId: 'student-b' }
    ],
    ft_students: [
      { id: 'student-a', name: '客户A', phone: '13800000001', sourceLeadId: 'lead-a' },
      { id: 'student-b', name: '客户B', phone: '13900000002', sourceLeadId: 'lead-b' }
    ],
    ft_purchases: [{ id: 'purchase-b', studentId: 'student-b', amountPaid: 1000 }]
  });
  const conflictRes = await request(blockedStudentMergeHarness.handle, '/leads/merge-preview', 'POST', {
    primaryLeadId: 'lead-a',
    mergeLeadIds: ['lead-b']
  });
  assert.strictEqual(conflictRes.statusCode, 409);
  assert.match(conflictRes.body.error, /副学员已有/);

  const deleteHarness = createHarness({
    ft_leads: [{ id: 'lead-delete', displayName: '可删除线索', phone: '13800000003', leadStage: '跟进中' }],
    ft_lead_followups: [
      { id: 'fu-delete-1', leadId: 'lead-delete', communicationNote: '首次沟通' },
      { id: 'fu-keep', leadId: 'other-lead', communicationNote: '其他线索' }
    ],
    ft_students: [],
    ft_courts: [],
    ft_membership_accounts: [],
    ft_purchases: [],
    ft_entitlements: [],
    ft_schedule: [],
    ft_membership_orders: []
  });
  const deleteRes = await request(deleteHarness.handle, '/leads/lead-delete', 'DELETE');
  assert.strictEqual(deleteRes.statusCode, 200);
  assert.strictEqual(deleteRes.body.deleted, true);
  assert.ok(!deleteHarness.rows.ft_leads.find(row => row.id === 'lead-delete'), 'unlinked unconverted lead should be physically deleted');
  assert.ok(!deleteHarness.rows.ft_lead_followups.find(row => row.id === 'fu-delete-1'), 'lead followups should be deleted with a physical lead delete');
  assert.ok(deleteHarness.rows.ft_lead_followups.find(row => row.id === 'fu-keep'), 'other lead followups should stay');

  const voidHarness = createHarness({
    ft_leads: [{ id: 'lead-void', displayName: '有关联线索', phone: '13800000004', studentId: 'student-void', leadStage: '已成交', dealType: '课程' }],
    ft_lead_followups: [{ id: 'fu-void', leadId: 'lead-void', communicationNote: '成交沟通' }],
    ft_students: [{ id: 'student-void', name: '有关联线索', sourceLeadId: 'lead-void' }],
    ft_courts: [],
    ft_membership_accounts: [],
    ft_purchases: [],
    ft_entitlements: [],
    ft_schedule: [],
    ft_membership_orders: []
  });
  const voidRes = await request(voidHarness.handle, '/leads/lead-void', 'DELETE', { reason: '重复录入' });
  assert.strictEqual(voidRes.statusCode, 200);
  assert.strictEqual(voidRes.body.archived, true);
  assert.strictEqual(voidHarness.rows.ft_leads.find(row => row.id === 'lead-void').status, 'voided');
  assert.ok(voidHarness.rows.ft_lead_followups.find(row => row.id === 'fu-void'), 'voided lead should keep followups for history');
  const voidListRes = await request(voidHarness.handle, '/leads', 'GET');
  assert.ok(!voidListRes.body.find(row => row.id === 'lead-void'), 'voided lead should be hidden from default list');

  console.log('leads merge routes tests passed');
}

main().catch(error => {
  console.error(error && error.stack ? error.stack : String(error));
  process.exit(1);
});
