const assert = require('assert');

const {
  createThirdPartySyncCenterRoutes,
  buildThirdPartySyncBatch,
  precheckThirdPartyRecords,
  buildThirdPartyImportPlan,
  defaultDailyRange
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

assert.deepStrictEqual(
  defaultDailyRange(new Date('2026-07-29T16:00:00.000Z')),
  { rangeStart: '2026-07-29 00:00:00', rangeEnd: '2026-07-30 00:00:00' },
  'daily auto sync should only cover the previous Beijing business day'
);

const precheck = precheckThirdPartyRecords([
  { id: 'order-1', sourceType: 'order', orderNo: 'O1', bookingDate: '2026-07-27', venue: '1号场', startTime: '09:00', endTime: '10:00', amount: 100, payMethod: '微信支付', status: '已完成', customerName: '张三', phone: '13800000000', remark: '散客订场' },
  { id: 'lock-1', sourceType: 'lock', bookingDate: '2026-07-27', venue: '1号场', startTime: '09:00', endTime: '10:00', remark: '私教课', operatorName: '前台A' },
  { id: 'lock-2', sourceType: 'lock', bookingDate: '', venue: '2号场', startTime: '10:00', endTime: '11:00', remark: '' },
  { id: 'member-gap', sourceType: 'member-ledger-gap', thirdPartyId: 'member-ledger-gap' }
], { batchId: 'batch-test', now: '2026-07-28T00:00:00+08:00' });

assert.ok(precheck.items.some(item => item.recommendedType === 'auto_import'), 'valid paid order should be auto import candidate');
assert.ok(precheck.items.some(item => item.recommendedType === 'duplicate_skip'), 'same date venue time should be duplicate skip');
assert.ok(precheck.items.some(item => item.recommendedType === 'high_risk_exception'), 'missing date should be high risk exception');
assert.ok(precheck.items.some(item => item.riskReason === '会员流水批量接口缺口'), 'member ledger gap should be recorded as an exception');
assert.ok(precheck.items.some(item => item.customerName === '张三' && item.phone === '13800000000' && item.remark === '散客订场' && item.amount === 100), 'precheck should keep operator-facing third party fields');
assert.ok(precheck.items.some(item => item.sourceRecordId === 'O1' && item.bookingMode === '用户自助订场'), 'precheck should label user self-service bookings');
assert.ok(precheck.items.some(item => item.sourceRecordId === 'lock-1' && item.bookingMode === '运营锁场' && item.operatorAccount === '前台A'), 'precheck should label operator locks with operator account');

const changxiaoerOrderPrecheck = precheckThirdPartyRecords([
  {
    sourceType: 'order',
    orderId: '260729001',
    bookingDate: '2026-07-29',
    amount: 14000,
    realName: '真实订单',
    phone: '13900000000',
    status: '已完成',
    orderInfo: [
      { time: '2026-07-29', region: '10:30-11:00', priceBasicsInfo: { placeName: '室内2号' } },
      { time: '2026-07-29', region: '09:30-10:00', priceBasicsInfo: { placeName: '室内2号' } },
      { time: '2026-07-29', region: '10:00-10:30', priceBasicsInfo: { placeName: '室内2号' } }
    ]
  }
], { batchId: 'batch-cxe-real', now: '2026-07-29T00:00:00+08:00' });
const changxiaoerOrder = changxiaoerOrderPrecheck.items[0];
assert.strictEqual(changxiaoerOrder.date, '2026-07-29', 'changxiaoer order should read booking date from order info');
assert.strictEqual(changxiaoerOrder.startTime, '09:30', 'changxiaoer order should read earliest region start time');
assert.strictEqual(changxiaoerOrder.endTime, '11:00', 'changxiaoer order should read latest region end time');
assert.strictEqual(changxiaoerOrder.venue, '2号场', 'changxiaoer order should read court from order info place name');
assert.strictEqual(changxiaoerOrder.amount, 140, 'changxiaoer cent amounts should display as yuan');
assert.strictEqual(changxiaoerOrder.bookingMode, '用户自助订场', 'changxiaoer order should label self-service booking mode');
assert.strictEqual(changxiaoerOrder.recommendedType, 'auto_import', 'complete changxiaoer order should not be marked high risk');

(async () => {
  const writes = [];
  const scans = {
    ft_third_party_sync_batches: [],
    ft_third_party_sync_raw_records: [],
    ft_third_party_sync_prechecks: [],
    ft_third_party_sync_confirmations: [],
    ft_third_party_sync_import_results: [],
    ft_third_party_sync_import_backups: [],
    ft_third_party_sync_changes: [],
    ft_third_party_sync_alerts: [],
    ft_third_party_sync_rollbacks: [],
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
    del: async (table, id) => {
      writes.push({ table, id, deleted: true });
      scans[table] = (scans[table] || []).filter(item => String(item.id) !== String(id));
    },
    mkTable: async () => 'ok',
    uuidv4: () => 'uuid-1',
    normalizeCourtRecord: row => row,
    fetchThirdPartyData: async () => ({
      records: [
        { sourceType: 'order', orderNo: 'O1', bookingDate: '2026-07-27', venue: '1号场', startTime: '09:00', endTime: '10:00', amount: 100, payMethod: '微信支付', status: '已完成' },
        { sourceType: 'order', orderNo: 'NEXTDAY', bookingDate: '2026-07-28', venue: '1号场', startTime: '09:00', endTime: '10:00', amount: 100, payMethod: '微信支付', status: '已完成' },
        { sourceType: 'member', thirdPartyId: 'M1', memberName: '会员资料A', memberPhone: '13900000000' },
        { sourceType: 'order', orderNo: 'OLD1', bookingDate: '2026-05-27', venue: '2号场', startTime: '09:00', endTime: '10:00', amount: 100, payMethod: '微信支付', status: '已完成' }
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
  assert.strictEqual(listRes.body.summary.rawCount, 3, 'overview should include source and gap raw records');
  assert.strictEqual(listRes.body.summary.bookingOrderCount, 1, 'overview should split booking order count from all pulled records');
  assert.strictEqual(listRes.body.summary.memberProfileCount, 1, 'overview should split member profile count from all pulled records');
  assert.strictEqual(listRes.body.summary.syncGapCount, 1, 'overview should split sync gap count from all pulled records');
  assert.ok(!scans.ft_third_party_sync_prechecks.some(row => row.sourceRecordId === 'OLD1'), 'pull should ignore booking records outside requested date range');
  const pullExclusiveEndRes = await call(handler, { path: '/third-party-sync/pull', method: 'POST', body: { rangeStart: '2026-07-27 00:00:00', rangeEnd: '2026-07-28 00:00:00' } });
  const exclusiveBatchId = pullExclusiveEndRes.body.batch.batchId;
  assert.ok(scans.ft_third_party_sync_prechecks.some(row => row.batchId === exclusiveBatchId && row.sourceRecordId === 'O1'), 'previous day half-open range should include the target day');
  assert.ok(!scans.ft_third_party_sync_prechecks.some(row => row.batchId === exclusiveBatchId && row.sourceRecordId === 'NEXTDAY'), 'previous day half-open range should exclude the next day');
  scans.ft_third_party_sync_batches.push({ id: 'old-batch', batchId: 'old-batch', pulledAt: '2026-07-01T00:00:00+08:00', status: 'prechecked' });
  scans.ft_third_party_sync_raw_records.push({ id: 'old-raw-1', batchId: 'old-batch', sourceType: 'order' });
  scans.ft_third_party_sync_prechecks.push({ id: 'old-precheck-1', batchId: 'old-batch', sourceRecordId: 'OLD-RISK', recommendedType: 'high_risk_exception', needsConfirmation: true });
  const scopedOverviewRes = await call(handler, { path: '/third-party-sync/overview', method: 'GET' });
  assert.strictEqual(scopedOverviewRes.body.summary.rawCount, 3, 'overview summary should default to latest batch raw count');
  assert.strictEqual(scopedOverviewRes.body.summary.bookingOrderCount, 1, 'latest batch summary should keep booking order count separate');
  assert.strictEqual(scopedOverviewRes.body.summary.memberProfileCount, 1, 'latest batch summary should keep member profile count separate');
  assert.strictEqual(scopedOverviewRes.body.summary.exceptionCount, 0, 'overview summary should keep sync gaps out of booking high-risk stats');

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
  assert.ok(plan.informational.some(item => item.reason === '会员资料仅同步留档，不进入订场导入'), 'member profiles should stay out of booking import blockers');
  assert.ok(plan.informational.some(item => item.reason === '会员流水批量接口缺口'), 'member ledger gap should be tracked as sync information');
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
  assert.strictEqual(importRes.body.result.status, 'completed', 'member profile information should not make a booking import partial');
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
  assert.ok(writes.some(row => row.table === 'ft_third_party_sync_import_results' && row.row.status === 'completed'), 'import result should be auditable');

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

  const cronScans = {
    ft_third_party_sync_batches: [],
    ft_third_party_sync_raw_records: [{
      id: 'old-raw-order-O9',
      batchId: 'old-batch',
      sourceSystem: 'changxiaoer',
      sourceType: 'order',
      thirdPartyId: 'O9',
      rawJson: { sourceType: 'order', orderNo: 'O9', bookingDate: '2026-07-27', venue: '5号场', startTime: '15:00', endTime: '16:00', amount: 120, status: '已完成', remark: '旧备注' },
      rawHash: 'old-hash',
      fetchedAt: '2026-07-27T00:00:00+08:00'
    }],
    ft_third_party_sync_prechecks: [],
    ft_third_party_sync_confirmations: [],
    ft_third_party_sync_import_results: [],
    ft_third_party_sync_import_backups: [],
    ft_third_party_sync_changes: [],
    ft_third_party_sync_alerts: [],
    ft_third_party_sync_rollbacks: [],
    ft_courts: [],
    ft_financial_ledger: [],
    ft_schedule: [],
    ft_membership_accounts: []
  };
  const cronWrites = [];
  const cronNotifications = [];
  const cronHandler = createThirdPartySyncCenterRoutes({
    init: async () => {},
    sendJson: (res, payload, code = 200) => res.status(code).json(payload),
    getCachedScan: async table => cronScans[table] || [],
    getCachedRow: async (table, id) => (cronScans[table] || []).find(row => String(row.id) === String(id)) || null,
    put: async (table, id, row) => {
      cronWrites.push({ table, id, row });
      cronScans[table] = [...(cronScans[table] || []).filter(item => String(item.id) !== String(id)), row];
    },
    del: async (table, id) => {
      cronWrites.push({ table, id, deleted: true });
      cronScans[table] = (cronScans[table] || []).filter(item => String(item.id) !== String(id));
    },
    mkTable: async () => 'ok',
    uuidv4: (() => {
      let n = 0;
      return () => `cron-uuid-${++n}`;
    })(),
    normalizeCourtRecord: row => row,
    notifyThirdPartySyncResult: async payload => cronNotifications.push(payload),
    fetchThirdPartyData: async () => ({
      records: [
        { sourceType: 'order', orderNo: 'O8', bookingDate: '2026-07-29', venue: '4号场', startTime: '13:00', endTime: '14:00', amount: 90, payMethod: '微信支付', status: '已完成', customerName: '自动订单' },
        { sourceType: 'order', orderNo: 'O9', bookingDate: '2026-07-29', venue: '5号场', startTime: '15:00', endTime: '16:00', amount: 120, payMethod: '微信支付', status: '已取消', remark: '取消订单' },
        { sourceType: 'lock', thirdPartyId: 'L9', bookingDate: '2026-07-29', venue: '6号场', startTime: '17:00', endTime: '18:00', remark: '私教课' }
      ],
      gaps: []
    }),
    now: () => '2026-07-29T00:00:00+08:00',
    env: { CRON_SECRET: 'secret' }
  });
  const cronRes = await call(cronHandler, {
    path: '/cron/third-party-sync-center',
    method: 'GET',
    req: { headers: { authorization: 'Bearer secret' } },
    query: new URLSearchParams('lookbackDays=3')
  });
  assert.strictEqual(cronRes.body.autoImport.result.status, 'partial_completed', 'cron should auto import stable rows and pause unsafe rows');
  assert.ok(cronNotifications.some(item => item.type === 'success' && item.result?.writtenIds?.length > 0), 'cron should notify Feishu group after successful auto import');
  assert.ok(cronWrites.some(row => row.table === 'ft_courts' && row.row.history?.some(history => history.sourceRecordId === 'O8')), 'cron should write stable high-confidence order');
  assert.ok(cronWrites.some(row => row.table === 'ft_third_party_sync_changes' && row.row.sourceRecordId === 'O9' && row.row.changeType === 'cancelled'), 'cron should record third-party cancellation changes');
  assert.ok(cronWrites.some(row => row.table === 'ft_third_party_sync_alerts' && /取消|退款|阻断|低置信/.test(row.row.reason)), 'cron should create alerts for unsafe rows');
  assert.ok(cronRes.body.autoImport.result.financeSnapshot?.before, 'cron import should record a pre-import finance snapshot');
  assert.ok(cronRes.body.autoImport.result.financeSnapshot?.after, 'cron import should record a post-import finance snapshot');

  const importedCourt = cronScans.ft_courts.find(row => row.history?.some(history => history.sourceRecordId === 'O8'));
  cronScans.ft_courts = cronScans.ft_courts.map(row => row.id === importedCourt.id ? {
    ...row,
    name: '运营已修改用户',
    history: [...row.history, { id: 'manual-after-import', date: '2026-07-29', type: '消费', category: '订场', payMethod: '现金', amount: 30, source: 'manual' }],
    updatedAt: '2026-07-29T01:00:00+08:00'
  } : row);
  const unsafeRollbackRes = await call(cronHandler, {
    path: '/third-party-sync/rollback',
    method: 'POST',
    body: { operationId: cronRes.body.autoImport.result.operationId }
  });
  assert.strictEqual(unsafeRollbackRes.statusCode, 409, 'rollback should reject when target row has later manual changes');
  assert.ok(cronScans.ft_courts.some(row => row.id === importedCourt.id && row.history.some(history => history.id === 'manual-after-import')), 'rejected rollback must keep later manual history');
  cronScans.ft_courts = cronScans.ft_courts.map(row => row.id === importedCourt.id ? {
    ...row,
    history: row.history.filter(history => history.id !== 'manual-after-import'),
    updatedAt: cronRes.body.autoImport.result.importedAt
  } : row);

  const rollbackRes = await call(cronHandler, {
    path: '/third-party-sync/rollback',
    method: 'POST',
    body: { operationId: cronRes.body.autoImport.result.operationId }
  });
  assert.strictEqual(rollbackRes.body.success, true, 'rollback should succeed by operation id');
  assert.ok(cronWrites.some(row => row.table === 'ft_third_party_sync_rollbacks'), 'rollback should write an audit row');
  assert.ok(rollbackRes.body.rollback.restored.some(row => row.table === 'ft_courts' && row.action === 'delete_created_empty_court'), 'rollback should delete import-created empty court only after later changes are cleared');
  assert.ok(cronScans.ft_third_party_sync_import_results.some(row => row.operationId === cronRes.body.autoImport.result.operationId && row.status === 'rolled_back'), 'rollback should mark import result rolled back');

  const failedCronScans = {
    ft_third_party_sync_batches: [],
    ft_third_party_sync_raw_records: [],
    ft_third_party_sync_prechecks: [],
    ft_third_party_sync_confirmations: [],
    ft_third_party_sync_import_results: [],
    ft_third_party_sync_import_backups: [],
    ft_third_party_sync_changes: [],
    ft_third_party_sync_alerts: [],
    ft_third_party_sync_rollbacks: [],
    ft_courts: [],
    ft_financial_ledger: [],
    ft_schedule: [],
    ft_membership_accounts: []
  };
  const failedCronWrites = [];
  const failedCronNotifications = [];
  const failedCronHandler = createThirdPartySyncCenterRoutes({
    init: async () => {},
    sendJson: (res, payload, code = 200) => res.status(code).json(payload),
    getCachedScan: async table => failedCronScans[table] || [],
    getCachedRow: async (table, id) => (failedCronScans[table] || []).find(row => String(row.id) === String(id)) || null,
    put: async (table, id, row) => {
      failedCronWrites.push({ table, id, row });
      failedCronScans[table] = [...(failedCronScans[table] || []).filter(item => String(item.id) !== String(id)), row];
    },
    del: async (table, id) => {
      failedCronWrites.push({ table, id, deleted: true });
      failedCronScans[table] = (failedCronScans[table] || []).filter(item => String(item.id) !== String(id));
    },
    mkTable: async () => 'ok',
    uuidv4: (() => {
      let n = 0;
      return () => `failed-cron-uuid-${++n}`;
    })(),
    normalizeCourtRecord: row => row,
    writeImportItem: async () => {
      throw new Error('模拟业务写入失败');
    },
    notifyThirdPartySyncResult: async payload => failedCronNotifications.push(payload),
    fetchThirdPartyData: async () => ({
      records: [
        { sourceType: 'order', orderNo: 'FAIL1', bookingDate: '2026-07-29', venue: '4号场', startTime: '13:00', endTime: '14:00', amount: 90, payMethod: '微信支付', status: '已完成', customerName: '失败订单' }
      ],
      gaps: []
    }),
    now: () => '2026-07-29T00:00:00+08:00',
    env: { CRON_SECRET: 'secret' }
  });
  const failedCronRes = await call(failedCronHandler, {
    path: '/cron/third-party-sync-center',
    method: 'GET',
    req: { headers: { authorization: 'Bearer secret' } },
    query: new URLSearchParams('lookbackDays=3')
  });
  assert.strictEqual(failedCronRes.statusCode, 500, 'cron should fail when stable importable rows all fail to write');
  assert.strictEqual(failedCronRes.body.autoImport.result.status, 'failed', 'cron response should expose the failed import result');
  assert.ok(failedCronWrites.some(row => row.table === 'ft_third_party_sync_alerts' && /模拟业务写入失败/.test(row.row.reason)), 'cron import failure should write an alert row');
  assert.ok(failedCronNotifications.some(item => item.type === 'failure' && /模拟业务写入失败/.test(item.result?.failed?.[0]?.reason || '')), 'cron import failure should notify Feishu group');

  console.log('third-party sync center routes tests passed');
})().catch(err => {
  console.error(err);
  process.exit(1);
});
