const assert = require('assert');

const {
  createThirdPartySyncCenterRoutes,
  buildThirdPartySyncBatch,
  precheckThirdPartyRecords,
  buildThirdPartyImportPlan
} = require('../server/third-party-sync-center-routes');

function createRes() {
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

async function call(handler, req) {
  const res = createRes();
  const handled = await handler({ user: { role: 'admin', name: '运营A' }, query: new URLSearchParams(), body: {}, ...req, res });
  assert.ok(handled, `${req.method} ${req.path} should be handled`);
  return res;
}

assert.strictEqual(
  buildThirdPartySyncBatch({ rangeStart: '2026-07-27 00:00:00', rangeEnd: '2026-07-27 23:59:59', now: '2026-07-28T00:00:00+08:00' }).mode,
  'readonly',
  'new sync batches must default to readonly mode'
);

const precheck = precheckThirdPartyRecords([
  { id: 'order-1', sourceType: 'order', orderNo: 'O1', bookingDate: '2026-07-27', venue: '1号场', startTime: '09:00', endTime: '10:00', amount: 100, payMethod: '微信支付', status: '已完成', customerName: '张三', phone: '13800000000', remark: '散客订场' },
  { id: 'lock-1', sourceType: 'lock', bookingDate: '2026-07-27', venue: '1号场', startTime: '09:00', endTime: '10:00', remark: '私教课' },
  { id: 'lock-2', sourceType: 'lock', bookingDate: '', venue: '2号场', startTime: '10:00', endTime: '11:00', remark: '' },
  { id: 'member-gap', sourceType: 'member-ledger-gap', thirdPartyId: 'member-ledger-gap' }
], { batchId: 'batch-test', now: '2026-07-28T00:00:00+08:00' });

assert.ok(precheck.items.some(item => item.recommendedType === 'auto_import'), 'valid paid order should be auto import candidate');
assert.ok(precheck.items.some(item => item.recommendedType === 'duplicate_skip'), 'same date venue time should be duplicate skip');
assert.ok(precheck.items.some(item => item.recommendedType === 'high_risk_exception'), 'missing date should be high risk exception');
assert.ok(precheck.items.some(item => item.riskReason === '会员流水批量接口缺口'), 'member ledger gap should be recorded as an exception');
assert.ok(precheck.items.some(item => item.customerName === '张三' && item.phone === '13800000000' && item.remark === '散客订场' && item.amount === 100), 'precheck should keep operator-facing third party fields');

(async () => {
  const writes = [];
  const scans = {
    ft_third_party_sync_batches: [],
    ft_third_party_sync_raw_records: [],
    ft_third_party_sync_prechecks: [],
    ft_third_party_sync_confirmations: [],
    ft_third_party_sync_import_results: [],
    ft_third_party_sync_import_backups: [],
    ft_courts: [],
    ft_financial_ledger: [],
    ft_schedule: [],
    ft_membership_accounts: []
  };
  const handler = createThirdPartySyncCenterRoutes({
    init: async () => {},
    sendJson: (res, payload, code = 200) => res.status(code).json(payload),
    getCachedScan: async table => scans[table] || [],
    getCachedRow: async (table, id) => (scans[table] || []).find(row => String(row.id) === String(id)) || null,
    put: async (table, id, row) => {
      writes.push({ table, id, row });
      scans[table] = [...(scans[table] || []).filter(item => String(item.id) !== String(id)), row];
    },
    mkTable: async () => 'ok',
    uuidv4: () => 'uuid-1',
    normalizeCourtRecord: row => row,
    fetchThirdPartyData: async () => ({
      records: [
        { sourceType: 'order', orderNo: 'O1', bookingDate: '2026-07-27', venue: '1号场', startTime: '09:00', endTime: '10:00', amount: 100, payMethod: '微信支付', status: '已完成' }
      ],
      gaps: ['member-ledger']
    }),
    now: () => '2026-07-28T00:00:00+08:00'
  });

  const pullRes = await call(handler, { path: '/third-party-sync/pull', method: 'POST', body: { rangeStart: '2026-07-27 00:00:00', rangeEnd: '2026-07-27 23:59:59' } });
  assert.strictEqual(pullRes.body.batch.mode, 'readonly', 'pull should stay readonly');
  assert.ok(writes.some(row => row.table === 'ft_third_party_sync_batches'), 'pull should write batch table');
  assert.ok(writes.some(row => row.table === 'ft_third_party_sync_raw_records'), 'pull should save raw records');
  assert.ok(writes.some(row => row.table === 'ft_third_party_sync_prechecks'), 'pull should save precheck rows');
  assert.ok(!writes.some(row => ['ft_courts', 'ft_membership_accounts', 'ft_membership_orders', 'ft_financial_ledger'].includes(row.table)), 'pull must not write business or finance tables');

  const listRes = await call(handler, { path: '/third-party-sync/overview', method: 'GET' });
  assert.strictEqual(listRes.body.batches.length, 1, 'overview should return batches');
  assert.strictEqual(listRes.body.summary.rawCount, 2, 'overview should include source and gap raw records');

  const confirmRes = await call(handler, {
    path: '/third-party-sync/confirmations',
    method: 'POST',
    body: { batchId: 'batch-test', sourceRecordId: 'lock-2', finalType: '待老板确认', confirmNote: '先暂停' }
  });
  assert.strictEqual(confirmRes.body.confirmation.status, 'confirmed', 'confirmation should be auditable');
  assert.ok(writes.some(row => row.table === 'ft_third_party_sync_confirmations'), 'confirmation should write confirmation table only');

  const batchId = pullRes.body.batch.batchId;
  const plan = buildThirdPartyImportPlan({
    batchId,
    prechecks: scans.ft_third_party_sync_prechecks,
    confirmations: scans.ft_third_party_sync_confirmations,
    importResults: scans.ft_third_party_sync_import_results
  });
  assert.strictEqual(plan.importable.length, 1, 'high confidence order should be importable');
  assert.ok(plan.blocked.some(item => item.reason === '会员流水批量接口缺口'), 'member ledger gap should stay blocked');
  const unboundMemberPlan = buildThirdPartyImportPlan({
    batchId: 'member-batch',
    prechecks: [{ batchId: 'member-batch', sourceRecordId: 'M1', sourceType: 'order', recommendedType: 'needs_confirmation', needsConfirmation: true, amount: 80 }],
    confirmations: [{ batchId: 'member-batch', sourceRecordId: 'M1', finalType: '会员余额订场', amount: 80 }],
    importResults: []
  });
  assert.ok(unboundMemberPlan.blocked.some(item => item.reason === '会员余额订场需会员流水审计链，暂不支持自动导入'), 'member stored-value booking should stay blocked until member audit chain exists');

  const importRes = await call(handler, {
    path: '/third-party-sync/import',
    method: 'POST',
    body: { batchId }
  });
  assert.strictEqual(importRes.body.result.status, 'partial_completed', 'import should mark partial completion when blocked items remain');
  assert.ok(importRes.body.result.backup?.tables?.ft_courts, 'import should save a pre-write backup snapshot');
  assert.ok(!importRes.body.result.backup.tables.ft_courts.rows, 'import result should keep backup metadata instead of truncating rows inline');
  assert.ok(writes.some(row => row.table === 'ft_third_party_sync_import_backups' && row.row.tableName === 'ft_courts'), 'import should write backup chunks before business writes');
  assert.ok(importRes.body.result.writtenTables.includes('ft_courts'), 'import should write booking users/history');
  assert.ok(importRes.body.result.writtenTables.includes('ft_financial_ledger'), 'import should write finance ledger candidate rows');
  assert.ok(importRes.body.result.verification.finance.ok, 'finance verification should pass');
  assert.ok(importRes.body.result.verification.courts.ok, 'court verification should pass');
  assert.ok(importRes.body.result.verification.membership.checked, 'membership verification should be recorded');
  assert.ok(importRes.body.result.verification.schedule.checked, 'schedule verification should be recorded');
  assert.ok(writes.some(row => row.table === 'ft_courts'), 'business import should write courts table');
  assert.ok(writes.some(row => row.table === 'ft_financial_ledger'), 'business import should write finance ledger table');
  assert.ok(writes.some(row => row.table === 'ft_third_party_sync_import_results' && row.row.status === 'partial_completed'), 'import result should be auditable');

  scans.ft_third_party_sync_batches.push({ id: 'member-batch', batchId: 'member-batch', status: 'prechecked' });
  scans.ft_third_party_sync_prechecks.push({
    id: 'member-precheck-1',
    batchId: 'member-batch',
    sourceRecordId: 'M1',
    sourceType: 'order',
    date: '2026-07-27',
    venue: '2号场',
    startTime: '10:00',
    endTime: '11:00',
    recommendedType: 'needs_confirmation',
    needsConfirmation: true,
    amount: 80,
    phone: '13900000000'
  });
  scans.ft_third_party_sync_confirmations.push({
    id: 'member-confirm-1',
    batchId: 'member-batch',
    sourceRecordId: 'M1',
    finalType: '会员余额订场',
    paymentMethod: '会员余额',
    amount: 80,
    bindTargetId: 'account-1',
    confirmedAt: '2026-07-28T00:00:00+08:00'
  });
  scans.ft_courts.push({ id: 'court-1', name: '会员A', phone: '13900000000', history: [{ id: 'deposit-1', date: '2026-07-01', type: '充值', amount: 200, payMethod: '微信转账' }] });
  scans.ft_membership_accounts.push({ id: 'account-1', courtId: 'court-1', phone: '13900000000', status: 'active' });
  const memberImportRes = await call(handler, {
    path: '/third-party-sync/import',
    method: 'POST',
    body: { batchId: 'member-batch' }
  });
  assert.strictEqual(memberImportRes.body.result.status, 'paused', 'member stored-value booking should not import before member audit chain exists');
  assert.strictEqual(memberImportRes.body.success, false, 'member-only blocked import should not report success');
  assert.strictEqual(memberImportRes.body.result.verification.membership.ok, false, 'member verification should not pass for blocked member bookings');
  assert.ok(!memberImportRes.body.result.writtenTables.includes('ft_membership_accounts'), 'member booking should not directly rewrite membership account rows');
  assert.ok(!writes.some(row => row.table === 'ft_courts' && row.id === 'court-1' && row.row.history?.some(history => history.sourceRecordId === 'M1')), 'blocked member booking must not write court history');

  scans.ft_third_party_sync_batches.push({ id: 'schedule-batch', batchId: 'schedule-batch', status: 'prechecked' });
  scans.ft_third_party_sync_prechecks.push({
    id: 'schedule-precheck-1',
    batchId: 'schedule-batch',
    sourceRecordId: 'S1',
    sourceType: 'lock',
    date: '2026-07-27',
    venue: '3号场',
    startTime: '11:00',
    endTime: '12:00',
    recommendedType: 'needs_confirmation',
    needsConfirmation: true
  });
  scans.ft_third_party_sync_confirmations.push({
    id: 'schedule-confirm-1',
    batchId: 'schedule-batch',
    sourceRecordId: 'S1',
    finalType: '排课占场',
    bindTargetId: 'schedule-1',
    confirmedAt: '2026-07-28T00:00:00+08:00'
  });
  scans.ft_schedule.push({ id: 'schedule-1', date: '2026-07-27', venue: '4号场', startTime: '2026-07-27T11:00:00+08:00', endTime: '2026-07-27T12:00:00+08:00', status: '已排课' });
  const scheduleImportRes = await call(handler, {
    path: '/third-party-sync/import',
    method: 'POST',
    body: { batchId: 'schedule-batch' }
  });
  assert.strictEqual(scheduleImportRes.body.result.status, 'failed', 'mismatched schedule binding should fail');
  assert.ok(scheduleImportRes.body.result.failed.some(row => row.reason.includes('场地不一致')), 'schedule binding should validate venue');

  console.log('third-party sync center routes tests passed');
})().catch(err => {
  console.error(err);
  process.exit(1);
});
