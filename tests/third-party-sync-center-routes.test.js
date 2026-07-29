const assert = require('assert');

const {
  createThirdPartySyncCenterRoutes,
  buildThirdPartySyncBatch,
  precheckThirdPartyRecords
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
    ft_third_party_sync_prechecks: []
  };
  const handler = createThirdPartySyncCenterRoutes({
    init: async () => {},
    sendJson: (res, payload, code = 200) => res.status(code).json(payload),
    getCachedScan: async table => scans[table] || [],
    put: async (table, id, row) => {
      writes.push({ table, id, row });
      scans[table] = [...(scans[table] || []), row];
    },
    mkTable: async () => 'ok',
    uuidv4: () => 'uuid-1',
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

  console.log('third-party sync center routes tests passed');
})().catch(err => {
  console.error(err);
  process.exit(1);
});
