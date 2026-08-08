const assert = require('assert');

const {
  createThirdPartySyncCenterRoutes,
  buildThirdPartySyncBatch,
  precheckThirdPartyRecords,
  buildThirdPartyImportPlan,
  buildThirdPartySyncNotificationText,
  defaultNotifyThirdPartySyncResult,
  fetchChangxiaoerData,
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
  { id: 'order-dup', sourceType: 'order', orderNo: 'O1-DUP', bookingDate: '2026-07-27', venue: '1号场', startTime: '09:00', endTime: '10:00', amount: 100, payMethod: '微信支付', status: '已完成', customerName: '张三', phone: '13800000000', remark: '重复订场' },
  { id: 'lock-1', sourceType: 'lock', bookingDate: '2026-07-27', venue: '2号场', startTime: '09:00', endTime: '10:00', remark: '私教课', operatorName: '前台A' },
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
assert.ok(precheck.items.some(item => item.sourceRecordId === 'lock-1' && item.businessCategory === '排课占场' && /排课/.test(item.plannedAction)), 'private lesson locks should be classified as schedule occupancy instead of generic lock');
assert.ok(precheck.items.some(item => item.sourceRecordId === 'lock-1' && item.recommendedType === 'auto_import' && item.suggestedFinalType === '排课占场'), 'private lesson locks should become auto importable schedule occupancy rows');
assert.strictEqual(
  precheckThirdPartyRecords([{ sourceType: 'order', orderNo: 'P86', bookingDate: '2026-07-27', venue: '1号场', startTime: '09:00', endTime: '10:00', phone: '8613800000000' }], { batchId: 'phone-batch' }).items[0].phone,
  '13800000000',
  'third-party phone with 86 country code should be normalized before import'
);
const parsedStructPrecheck = precheckThirdPartyRecords([
  { sourceType: 'order', orderNo: 'STRUCT1', remark: '2026-08-05；室内2；12:00-13:00', amount: 140, payMethod: '微信支付', status: '已完成', customerName: '蓝星灿', phone: '15210833095' }
], { batchId: 'struct-batch', now: '2026-08-06T00:00:00+08:00' }).items[0];
assert.strictEqual(parsedStructPrecheck.date, '2026-08-05', 'third-party sync should recover booking date from remark text');
assert.strictEqual(parsedStructPrecheck.startTime, '12:00', 'third-party sync should recover start time from remark text');
assert.strictEqual(parsedStructPrecheck.endTime, '13:00', 'third-party sync should recover end time from remark text');
assert.strictEqual(parsedStructPrecheck.venue, '2号场', 'third-party sync should recover venue from indoor-court remark text');
assert.strictEqual(parsedStructPrecheck.recommendedType, 'auto_import', 'recoverable structure fields should not become manual confirmation');

const historicalRulePrecheck = precheckThirdPartyRecords([
  { id: 'coach-lock', sourceType: 'lock', bookingDate: '2026-07-30', venue: '1号场', startTime: '12:00', endTime: '13:00', customerName: '晓哲', remark: '晓哲 定场', amount: 176 },
  { id: 'companion-lock', sourceType: 'lock', bookingDate: '2026-07-30', venue: '2号场', startTime: '14:00', endTime: '15:00', remark: 'Siren 陪打' },
  { id: 'machine-lock', sourceType: 'lock', bookingDate: '2026-07-30', venue: '3号场', startTime: '16:00', endTime: '17:00', remark: '发球机 1小时' },
  { id: 'machine-free-booking-lock', sourceType: 'lock', bookingDate: '2026-08-05', venue: '1号场', startTime: '12:00', endTime: '13:00', remark: '德德 订场+发球机', amount: 120 },
  { id: 'machine-split-lock', sourceType: 'lock', bookingDate: '2026-07-30', venue: '3号场', startTime: '17:00', endTime: '18:00', remark: '订场120 发球机80', amount: 200 },
  { id: 'companion-split-lock', sourceType: 'lock', bookingDate: '2026-07-30', venue: '2号场', startTime: '15:00', endTime: '16:00', remark: '订场100 陪打300', amount: 400 },
  { id: 'changda-lock', sourceType: 'lock', bookingDate: '2026-07-30', venue: '1号场', startTime: '10:00', endTime: '12:00', remark: '畅打' },
  { id: 'leader-lock', sourceType: 'lock', bookingDate: '2026-07-30', venue: '4号场', startTime: '16:00', endTime: '18:00', remark: '领导' },
  { id: 'construction-lock', sourceType: 'lock', bookingDate: '2026-08-01', venue: '1号场', startTime: '20:00', endTime: '22:00', customerName: '马坡运营', operatorName: '马坡运营', phone: '13651248523', remark: '施工' },
  { id: 'repair-83-lock', sourceType: 'lock', bookingDate: '2026-08-03', venue: '4号场', startTime: '06:00', endTime: '22:00', customerName: '马坡运营', operatorName: '马坡运营', phone: '13651248523', remark: '' },
  { id: 'repair-84-lock', sourceType: 'lock', bookingDate: '2026-08-04', venue: '2号场', startTime: '10:00', endTime: '20:00', customerName: '马坡运营', operatorName: '马坡运营', phone: '13651248523', remark: '' },
  { id: 'repair-85-before-noon-lock', sourceType: 'lock', bookingDate: '2026-08-05', venue: '1号场', startTime: '07:00', endTime: '12:00', customerName: '马坡运营', operatorName: '马坡运营', phone: '13651248523', remark: '' },
  { id: 'family-lesson-lock', sourceType: 'lock', bookingDate: '2026-07-31', venue: '3号场', startTime: '14:00', endTime: '15:00', customerName: '马坡运营', operatorName: '马坡运营', phone: '13651248523', remark: '刘润扬 王老板 亲子课' },
  { id: 'junior-lesson-lock', sourceType: 'lock', bookingDate: '2026-07-31', venue: '3号场', startTime: '18:00', endTime: '19:00', customerName: '马坡运营', operatorName: '马坡运营', phone: '13651248523', remark: '刘润扬 小朋友' },
  { id: 'training-lesson-lock', sourceType: 'lock', bookingDate: '2026-07-31', venue: '1号场', startTime: '12:00', endTime: '13:00', customerName: '马坡运营', operatorName: '马坡运营', phone: '13651248523', remark: '初阶训练课' },
  { id: 'adult-lesson-lock', sourceType: 'lock', bookingDate: '2026-07-31', venue: '4号场', startTime: '18:00', endTime: '19:00', customerName: '马坡运营', operatorName: '马坡运营', phone: '13651248523', remark: '林铭 成人' },
  { id: 'member-booking-lock', sourceType: 'lock', bookingDate: '2026-08-05', venue: '1号场', startTime: '13:00', endTime: '14:00', customerName: '马坡运营', operatorName: '马坡运营', phone: '13651248523', remark: '刘易斯 订场', amount: 96 },
  { id: 'guest-booking-lock', sourceType: 'lock', bookingDate: '2026-08-05', venue: '2号场', startTime: '13:00', endTime: '14:00', customerName: '马坡运营', operatorName: '马坡运营', phone: '13651248523', remark: '李鹏昊 订场', amount: 120 },
  { id: 'ops-assisted-lock', sourceType: 'lock', bookingDate: '2026-07-31', venue: '4号场', startTime: '08:00', endTime: '10:00', customerName: 'Sky', operatorName: '马坡运营', phone: '18813066492', remark: '' },
  { id: 'ops-empty-lock', sourceType: 'lock', bookingDate: '2026-07-31', venue: '3号场', startTime: '07:00', endTime: '09:00', customerName: '马坡运营', operatorName: '马坡运营', phone: '13651248523', remark: '' }
], { batchId: 'historical-rules', now: '2026-07-31T00:00:00+08:00' });
assert.ok(historicalRulePrecheck.items.some(item => item.sourceRecordId === 'coach-lock' && item.businessCategory === '教练代订场' && item.recommendedType === 'auto_import' && item.suggestedFinalType === '教练代订场' && item.paymentMethod === '微信转账' && /8折/.test(item.plannedAction)), 'xiaozhe coach booking rule should be auto importable when amount is known');
assert.ok(historicalRulePrecheck.items.some(item => item.sourceRecordId === 'companion-lock' && item.businessCategory === '订场陪打' && /拆分/.test(item.plannedAction) && item.needsConfirmation), 'companion locks should be classified as booking plus companion service and require confirmation before split import');
assert.ok(historicalRulePrecheck.items.some(item => item.sourceRecordId === 'machine-lock' && item.businessCategory === '订场+发球机' && /发球机/.test(item.plannedAction) && item.needsConfirmation), 'ball-machine locks should be classified as booking plus extra service and require confirmation before split import');
assert.ok(historicalRulePrecheck.items.some(item => item.sourceRecordId === 'machine-free-booking-lock' && item.recommendedType === 'auto_import' && item.suggestedFinalType === '散客微信转账订场' && /免费赠送/.test(item.plannedAction)), 'booking plus free ball-machine gift should import as booking without manual split');
assert.ok(historicalRulePrecheck.items.some(item => item.sourceRecordId === 'machine-split-lock' && item.recommendedType === 'auto_import' && item.amountBreakdown?.bookingAmount === 120 && item.amountBreakdown?.serviceAmount === 80), 'ball-machine locks should auto import when booking and service fees are explicit');
assert.ok(historicalRulePrecheck.items.some(item => item.sourceRecordId === 'companion-split-lock' && item.recommendedType === 'auto_import' && item.amountBreakdown?.bookingAmount === 100 && item.amountBreakdown?.serviceAmount === 300), 'companion locks should auto import when booking and companion fees are explicit');
assert.ok(historicalRulePrecheck.items.some(item => item.sourceRecordId === 'changda-lock' && item.businessCategory === '畅打活动' && item.recommendedType === 'auto_import'), 'changda locks should automatically create an activity occupancy destination');
assert.ok(historicalRulePrecheck.items.some(item => item.sourceRecordId === 'leader-lock' && item.businessCategory === '内部占用' && item.recommendedType === 'auto_import'), 'leader/internal usage locks should be classified as internal occupancy');
assert.ok(historicalRulePrecheck.items.some(item => item.sourceRecordId === 'construction-lock' && item.businessCategory === '内部占用' && item.recommendedType === 'auto_import'), 'construction locks should be classified as internal occupancy');
assert.ok(historicalRulePrecheck.items.some(item => item.sourceRecordId === 'repair-83-lock' && item.businessCategory === '内部占用' && item.recommendedType === 'auto_import'), '2026-08-03 full-court repair locks should be internal occupancy');
assert.ok(historicalRulePrecheck.items.some(item => item.sourceRecordId === 'repair-84-lock' && item.businessCategory === '内部占用' && item.recommendedType === 'auto_import'), '2026-08-04 full-court repair locks should be internal occupancy');
assert.ok(historicalRulePrecheck.items.some(item => item.sourceRecordId === 'repair-85-before-noon-lock' && item.businessCategory === '内部占用' && item.recommendedType === 'auto_import'), '2026-08-05 locks ending by noon should be internal occupancy');
assert.ok(historicalRulePrecheck.items.some(item => item.sourceRecordId === 'family-lesson-lock' && item.businessCategory === '排课占场' && item.recommendedType === 'auto_import'), 'family lesson locks should auto match or create schedule occupancy');
assert.ok(historicalRulePrecheck.items.some(item => item.sourceRecordId === 'junior-lesson-lock' && item.businessCategory === '排课占场' && item.recommendedType === 'auto_import'), 'junior lesson text should auto match schedule occupancy');
assert.ok(historicalRulePrecheck.items.some(item => item.sourceRecordId === 'training-lesson-lock' && item.businessCategory === '排课占场' && item.recommendedType === 'auto_import'), 'training lesson text should auto match schedule occupancy');
assert.ok(historicalRulePrecheck.items.some(item => item.sourceRecordId === 'adult-lesson-lock' && item.businessCategory === '排课占场' && item.recommendedType === 'auto_import'), 'adult lesson text should auto match schedule occupancy');
assert.ok(historicalRulePrecheck.items.some(item => item.sourceRecordId === 'member-booking-lock' && item.businessCategory === '运营代订场' && item.recommendedType === 'auto_import' && item.suggestedFinalType === '散客微信转账订场'), 'operator lock remarks with member booking text should auto import using the third-party amount');
assert.ok(historicalRulePrecheck.items.some(item => item.sourceRecordId === 'guest-booking-lock' && item.businessCategory === '运营代订场' && item.recommendedType === 'auto_import' && item.suggestedFinalType === '散客微信转账订场'), 'operator lock remarks with guest booking text should auto import using the third-party amount');
assert.ok(historicalRulePrecheck.items.some(item => item.sourceRecordId === 'ops-assisted-lock' && item.businessCategory === '运营代订场' && item.recommendedType === 'auto_import' && item.suggestedFinalType === '运营代订场'), 'operator-assisted customer locks should auto import as booking occupancy without finance when amount is empty');
assert.ok(historicalRulePrecheck.items.some(item => item.sourceRecordId === 'ops-empty-lock' && item.needsConfirmation && item.riskReason === '备注为空'), 'operator-only empty locks should still require confirmation');
const historicalRulePlan = buildThirdPartyImportPlan({ batchId: 'historical-rules', prechecks: historicalRulePrecheck.items, confirmations: [], importResults: [] });
assert.ok(historicalRulePlan.importable.some(item => item.sourceRecordId === 'ops-assisted-lock' && item.finalType === '运营代订场' && item.targetTables.length === 1 && item.targetTables[0] === 'ft_courts'), 'operator-assisted empty-amount locks should not create finance ledger rows');

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

const changxiaoerLockPrecheck = precheckThirdPartyRecords([
  {
    sourceType: 'lock',
    usageDate: '2026-07-30',
    customer: { customerName: '马坡运营', phoneNumber: { countryCode: '+86', phoneNumber: '13651248523' } },
    operator: { operatorName: '马坡运营' },
    periodsInfo: [
      { startTime: '18:30', endTime: '19:00', placeName: '室内3号' },
      { startTime: '19:00', endTime: '19:30', placeName: '室内3号' }
    ],
    remark: '刘润扬 马欣 私教体验课'
  }
], { batchId: 'batch-cxe-lock-real', now: '2026-07-31T00:00:00+08:00' });
const changxiaoerLock = changxiaoerLockPrecheck.items[0];
assert.strictEqual(changxiaoerLock.date, '2026-07-30', 'changxiaoer lock should read usageDate as business date');
assert.strictEqual(changxiaoerLock.startTime, '18:30', 'changxiaoer lock should read earliest period start time');
assert.strictEqual(changxiaoerLock.endTime, '19:30', 'changxiaoer lock should read latest period end time');
assert.strictEqual(changxiaoerLock.venue, '3号场', 'changxiaoer lock should read court from periodsInfo placeName');
assert.strictEqual(changxiaoerLock.customerName, '马坡运营', 'changxiaoer lock should read nested customer name');
assert.strictEqual(changxiaoerLock.phone, '13651248523', 'changxiaoer lock should read nested customer phone');
assert.strictEqual(changxiaoerLock.operatorAccount, '马坡运营', 'changxiaoer lock should read nested operator name');
assert.strictEqual(changxiaoerLock.businessCategory, '排课占场', 'changxiaoer private lesson lock should be classified as schedule occupancy');

const notificationText = buildThirdPartySyncNotificationText({
  type: 'success',
  batch: {
    batchId: 'cxe-sync-technical-id',
    rangeStart: '2026-07-30 00:00:00',
    rangeEnd: '2026-07-31 00:00:00',
    financeImpact: { cashDelta: 1350 },
    counts: { totalSourceCount: 61 }
  },
  result: {
    status: 'completed',
    plannedCount: 7,
    fullDisposition: { total: 61, importedSourceCount: 1, informationalCount: 2, skippedCount: 0, unresolvedCount: 0, ok: true },
    writtenIds: [
      { table: 'ft_courts', sourceRecordId: 'order-a' },
      { table: 'ft_financial_ledger', sourceRecordId: 'order-a' }
    ],
    failed: [],
    skippedIds: []
  },
  alerts: [
    { reason: '第三方变更：531449', sourceType: 'member', customerName: '秋明', phone: '18600689666' },
    { reason: '会员流水批量接口缺口', sourceType: 'member-ledger-gap' }
  ]
});
assert.match(notificationText, /^\[场小二\] 订场数据同步完成/, 'notification title should use the requested operator-facing title');
assert.match(notificationText, /场馆：网球兄弟 FlowTennis/, 'notification text should include Feishu bot keywords so keyword-checked bots accept it');
assert.match(notificationText, /数据日期：2026-07-30/, 'notification should show business date');
assert.doesNotMatch(notificationText, /\[场小二\] 长小二订场数据同步完成/, 'notification title should not include the old duplicated product name');
assert.match(notificationText, /第三方数据：共 61 条/, 'notification should show the full third-party source count');
assert.match(notificationText, /自动完成：1 条/, 'notification should show imported business rows without pretending every source row was imported');
assert.doesNotMatch(notificationText, /订场导入：1\/7 条成功/, 'notification must not call partial import success by using only importable rows as denominator');
assert.match(notificationText, /财务入账：1 条流水，合计 ¥1,350/, 'notification should show finance impact in operator language');
assert.match(notificationText, /会员资料变更 1 条：仅留档，不影响订场导入/, 'notification should summarize member profile changes');
assert.doesNotMatch(notificationText, /cxe-sync-technical-id|531449/, 'notification should hide technical batch ids and raw third-party ids');

(async () => {
  const cxeCalls = [];
  const cxeFetched = await fetchChangxiaoerData({
    rangeStart: '2026-07-30 00:00:00',
    rangeEnd: '2026-07-31 00:00:00',
    env: { CXE_USER: 'xiaolu99', CXE_PASS: 'xiaolu99' },
    client: {
      post: async (url, body, options) => {
        cxeCalls.push({ method: 'POST', url, body, options });
        if (/merchantAdminLogin/.test(url)) return { data: { data: { token: 'token-1' } } };
        return { data: { data: { list: [], hasNext: false } } };
      },
      get: async (url, options) => {
        cxeCalls.push({ method: 'GET', url, options });
        return { data: { data: { list: [{ id: 'LOCK-FROM-API' }], hasNext: false } } };
      }
    }
  });
  const lockGetCall = cxeCalls.find(call => call.method === 'GET' && /occupy-space-period-records/.test(call.url));
  assert.strictEqual(lockGetCall.options.params.dateFrom, '2026-07-30', 'lock report fetch should pass date-only dateFrom because the third-party API rejects timestamp ranges');
  assert.strictEqual(lockGetCall.options.params.dateTo, '2026-07-30', 'lock report fetch should pass date-only dateTo because the third-party API rejects timestamp ranges');
  assert.ok(!lockGetCall.options.params.startTime && !lockGetCall.options.params.endTime, 'lock report fetch should not pass startTime/endTime to the third-party lock API');
  assert.ok(cxeFetched.records.some(row => row.sourceType === 'lock' && row.id === 'LOCK-FROM-API'), 'lock report rows should be included in fetched source records');

  const feishuPosts = [];
  const notifyRes = await defaultNotifyThirdPartySyncResult({
    type: 'success',
    batch: {
      batchId: 'cxe-sync-technical-id',
      rangeStart: '2026-07-30 00:00:00',
      rangeEnd: '2026-07-31 00:00:00',
      financeImpact: { cashDelta: 1350 },
      counts: { totalSourceCount: 61 }
    },
    result: {
      plannedCount: 7,
      fullDisposition: { total: 61, importedSourceCount: 1, informationalCount: 2, skippedCount: 0, unresolvedCount: 0, ok: true },
      writtenIds: [
        { table: 'ft_courts', sourceRecordId: 'order-a' },
        { table: 'ft_financial_ledger', sourceRecordId: 'order-a' }
      ],
      failed: [],
      skippedIds: []
    },
    alerts: [
      { reason: '第三方变更：531449', sourceType: 'member' },
      { reason: '会员流水批量接口缺口', sourceType: 'member-ledger-gap' }
    ],
    env: { THIRD_PARTY_SYNC_NOTIFY_WEBHOOK: 'https://example.test/webhook' },
    client: {
      post: async (url, payload, options) => {
        feishuPosts.push({ url, payload, options });
        return { data: { code: 0 } };
      }
    }
  });
  assert.strictEqual(notifyRes.sent, true, 'notification should report sent when Feishu accepts the card');
  assert.strictEqual(feishuPosts[0].payload.msg_type, 'interactive', 'notification should send a Feishu card');
  const cardText = JSON.stringify(feishuPosts[0].payload.card);
  assert.match(cardText, /\[场小二\] 订场数据同步完成/, 'card should include the Feishu bot keyword in the business title');
  assert.match(cardText, /网球兄弟 FlowTennis/, 'card should include Feishu bot keywords outside the technical webhook config');
  assert.match(cardText, /数据日期：2026-07-30/, 'card should highlight the business date');
  assert.match(cardText, /第三方数据：共 61 条/, 'card should show source-total processing result');
  assert.match(cardText, /自动完成：1 条/, 'card should show imported result in operator language');
  assert.match(cardText, /财务入账：1 条流水，合计 ¥1,350/, 'card should show finance result');
  assert.doesNotMatch(cardText, /cxe-sync-technical-id|531449/, 'card should hide technical ids');

  const fallbackPosts = [];
  const fallbackNotifyRes = await defaultNotifyThirdPartySyncResult({
    type: 'success',
    batch: {
      rangeStart: '2026-07-30 00:00:00',
      rangeEnd: '2026-07-31 00:00:00',
      counts: { totalSourceCount: 1 }
    },
    result: {
      plannedCount: 1,
      fullDisposition: { total: 1, unresolvedCount: 0, ok: true },
      writtenIds: [{ table: 'ft_courts', sourceRecordId: 'order-a' }],
      failed: [],
      skippedIds: []
    },
    alerts: [],
    env: {
      THIRD_PARTY_SYNC_NOTIFY_WEBHOOK: 'https://example.test/blocked',
      FEISHU_MONITOR_WEBHOOK_URL: 'https://example.test/monitor'
    },
    client: {
      post: async (url, payload) => {
        fallbackPosts.push({ url, payload });
        return url.includes('blocked') ? { data: { code: 19024, msg: 'Key Words Not Found' } } : { data: { code: 0 } };
      }
    }
  });
  assert.strictEqual(fallbackNotifyRes.sent, true, 'notification should try the fallback webhook when the first Feishu bot rejects keywords');
  assert.deepStrictEqual(fallbackPosts.map(row => row.url), ['https://example.test/blocked', 'https://example.test/monitor'], 'notification should try configured webhooks in order');

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
    ft_coaches: [{ id: 'coach-xiaolu', name: '小鹿', status: 'active' }],
    ft_students: [{ id: 'student-zhangsan', name: '张三', phone: '13911112222', status: 'active' }],
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
        { sourceType: 'lock', thirdPartyId: 'L1', bookingDate: '2026-07-27', venue: '3号场', startTime: '12:00', endTime: '13:00', remark: '小鹿 张三 私教课' },
        { sourceType: 'member', thirdPartyId: 'M1', memberName: '会员资料A', memberPhone: '13900000000' },
        { sourceType: 'order', orderNo: 'OLD1', bookingDate: '2026-05-27', venue: '2号场', startTime: '09:00', endTime: '10:00', amount: 100, payMethod: '微信支付', status: '已完成' }
      ],
      gaps: ['member-ledger']
    }),
    now: () => '2026-07-28T00:00:00+08:00'
  });

  const pullRes = await call(handler, { path: '/third-party-sync/pull', method: 'POST', body: { rangeStart: '2026-07-27 00:00:00', rangeEnd: '2026-07-27 23:59:59' } });
  assert.strictEqual(pullRes.body.batch.mode, 'readonly', 'pull should stay readonly');
  assert.strictEqual(pullRes.body.audit.sourceTotalCount, 4, 'pull audit should count every third-party source row including locks and gaps');
  assert.strictEqual(pullRes.body.audit.lockCount, 1, 'pull audit should expose operator locks separately');
  assert.strictEqual(pullRes.body.audit.businessCategoryCounts['排课占场'], 1, 'pull audit should show private lesson lock category');
  assert.strictEqual(pullRes.body.audit.destinationCounts.needsConfirmation, 0, 'private lesson locks should no longer require manual action when schedule can be auto-created');
  assert.strictEqual(pullRes.body.audit.destinationCounts.autoImport, 2, 'pull audit should count stable orders and schedule occupancy locks as auto-importable source rows');
  assert.ok(writes.some(row => row.table === 'ft_third_party_sync_batches'), 'pull should write batch table');
  assert.ok(writes.some(row => row.table === 'ft_third_party_sync_raw_records'), 'pull should save raw records');
  assert.ok(writes.some(row => row.table === 'ft_third_party_sync_prechecks'), 'pull should save precheck rows');
  assert.ok(!writes.some(row => ['ft_courts', 'ft_membership_accounts', 'ft_membership_orders', 'ft_financial_ledger'].includes(row.table)), 'pull must not write business or finance tables');
  const batchId = pullRes.body.batch.batchId;

  const listRes = await call(handler, { path: '/third-party-sync/overview', method: 'GET' });
  assert.strictEqual(listRes.body.batches.length, 1, 'overview should return batches');
  assert.strictEqual(listRes.body.summary.rawCount, 4, 'overview should include source and gap raw records');
  assert.strictEqual(listRes.body.summary.bookingOrderCount, 1, 'overview should split booking order count from all pulled records');
  assert.strictEqual(listRes.body.summary.lockCount, 1, 'overview should split operator lock count from self-service orders');
  assert.strictEqual(listRes.body.summary.memberProfileCount, 1, 'overview should split member profile count from all pulled records');
  assert.strictEqual(listRes.body.summary.syncGapCount, 1, 'overview should split sync gap count from all pulled records');
  assert.strictEqual(listRes.body.summary.actionableSourceCount, 2, 'overview should show all booking and lock rows that must have a business destination');
  assert.ok(!scans.ft_third_party_sync_prechecks.some(row => row.sourceRecordId === 'OLD1'), 'pull should ignore booking records outside requested date range');
  scans.ft_third_party_sync_prechecks = scans.ft_third_party_sync_prechecks.map(row => row.sourceRecordId === 'L1' ? { ...row, recommendedType: 'needs_confirmation', needsConfirmation: true, riskReason: '旧规则待确认', status: 'pending_confirmation' } : row);
  scans.ft_third_party_sync_alerts.push({ id: 'stale-alert-L1', batchId, sourceType: 'lock', sourceRecordId: 'L1', status: 'open', reason: '等待运营确认' });
  const refreshedOverviewRes = await call(handler, { path: '/third-party-sync/overview', method: 'GET' });
  assert.strictEqual(refreshedOverviewRes.body.summary.pendingCount, 0, 'overview should recompute latest batch prechecks from raw records after rule upgrades');
  assert.ok(refreshedOverviewRes.body.prechecks.some(row => row.sourceRecordId === 'L1' && row.recommendedType === 'auto_import'), 'overview should return refreshed current-rule prechecks for the latest batch');
  assert.ok(!refreshedOverviewRes.body.alerts.some(row => row.id === 'stale-alert-L1'), 'overview should hide stale booking alerts when the current rules make the row importable');
  const refreshedPlanRes = await call(handler, { path: '/third-party-sync/import-plan', method: 'POST', body: { batchId } });
  assert.ok(refreshedPlanRes.body.plan.importable.some(row => row.sourceRecordId === 'L1'), 'import plan should also use refreshed current-rule prechecks');
  const pullExclusiveEndRes = await call(handler, { path: '/third-party-sync/pull', method: 'POST', body: { rangeStart: '2026-07-27 00:00:00', rangeEnd: '2026-07-28 00:00:00' } });
  const exclusiveBatchId = pullExclusiveEndRes.body.batch.batchId;
  assert.ok(scans.ft_third_party_sync_prechecks.some(row => row.batchId === exclusiveBatchId && row.sourceRecordId === 'O1'), 'previous day half-open range should include the target day');
  assert.ok(!scans.ft_third_party_sync_prechecks.some(row => row.batchId === exclusiveBatchId && row.sourceRecordId === 'NEXTDAY'), 'previous day half-open range should exclude the next day');
  scans.ft_third_party_sync_batches.push({ id: 'old-batch', batchId: 'old-batch', pulledAt: '2026-07-01T00:00:00+08:00', status: 'prechecked' });
  scans.ft_third_party_sync_raw_records.push({ id: 'old-raw-1', batchId: 'old-batch', sourceType: 'order' });
  scans.ft_third_party_sync_prechecks.push({ id: 'old-precheck-1', batchId: 'old-batch', sourceRecordId: 'OLD-RISK', recommendedType: 'high_risk_exception', needsConfirmation: true });
  const scopedOverviewRes = await call(handler, { path: '/third-party-sync/overview', method: 'GET' });
  assert.strictEqual(scopedOverviewRes.body.summary.rawCount, 4, 'overview summary should default to latest batch raw count');
  assert.strictEqual(scopedOverviewRes.body.summary.bookingOrderCount, 1, 'latest batch summary should keep booking order count separate');
  assert.strictEqual(scopedOverviewRes.body.summary.lockCount, 1, 'latest batch summary should keep operator locks separate');
  assert.strictEqual(scopedOverviewRes.body.summary.memberProfileCount, 1, 'latest batch summary should keep member profile count separate');
  assert.strictEqual(scopedOverviewRes.body.summary.exceptionCount, 0, 'overview summary should keep sync gaps out of booking high-risk stats');
  scans.ft_third_party_sync_batches.push({ id: 'stale-rule-batch', batchId: 'stale-rule-batch', pulledAt: '2026-08-05T00:00:00+08:00', status: 'prechecked' });
  scans.ft_third_party_sync_raw_records.push({
    id: 'stale-rule-raw-1',
    batchId: 'stale-rule-batch',
    sourceType: 'lock',
    thirdPartyId: 'STALE-MACHINE',
    rawJson: { sourceType: 'lock', thirdPartyId: 'STALE-MACHINE', bookingDate: '2026-08-05', venue: '1号场', startTime: '12:00', endTime: '13:00', customerName: '马坡运营', operatorName: '马坡运营', remark: '德德 订场+发球机', amount: 120 },
    fetchedAt: '2026-08-05T00:00:00+08:00'
  });
  scans.ft_third_party_sync_prechecks.push({ id: 'stale-rule-precheck-1', batchId: 'stale-rule-batch', sourceRecordId: 'STALE-MACHINE', sourceType: 'lock', recommendedType: 'needs_confirmation', needsConfirmation: true, riskReason: '旧规则待确认' });
  const refreshedAllBatchesOverviewRes = await call(handler, { path: '/third-party-sync/overview', method: 'GET' });
  const refreshedMachine = refreshedAllBatchesOverviewRes.body.prechecks.find(row => row.batchId === 'stale-rule-batch' && row.sourceRecordId === 'STALE-MACHINE');
  assert.strictEqual(refreshedMachine.recommendedType, 'auto_import', 'overview should recompute stale stored prechecks from raw records with the latest rules');
  assert.strictEqual(refreshedMachine.needsConfirmation, false, 'overview should remove outdated manual-confirmation flags after rule refresh');

  const confirmRes = await call(handler, {
    path: '/third-party-sync/confirmations',
    method: 'POST',
    body: { batchId: 'batch-test', sourceRecordId: 'lock-2', finalType: '待老板确认', confirmNote: '先暂停' }
  });
  assert.strictEqual(confirmRes.body.confirmation.status, 'confirmed', 'confirmation should be auditable');
  assert.ok(writes.some(row => row.table === 'ft_third_party_sync_confirmations'), 'confirmation should write confirmation table only');

  const plan = buildThirdPartyImportPlan({
    batchId,
    prechecks: scans.ft_third_party_sync_prechecks,
    confirmations: scans.ft_third_party_sync_confirmations,
    importResults: scans.ft_third_party_sync_import_results
  });
  assert.strictEqual(plan.importable.length, 2, 'high confidence order and private lesson occupancy should be importable');
  assert.ok(plan.informational.some(item => item.reason === '会员资料仅同步留档，不进入订场导入'), 'member profiles should stay out of booking import blockers');
  assert.ok(plan.informational.some(item => item.reason === '会员流水批量接口缺口'), 'member ledger gap should be tracked as sync information');
  const unboundMemberPlan = buildThirdPartyImportPlan({
    batchId: 'member-batch',
    prechecks: [{ batchId: 'member-batch', sourceRecordId: 'M1', sourceType: 'order', recommendedType: 'needs_confirmation', needsConfirmation: true, amount: 80 }],
    confirmations: [{ batchId: 'member-batch', sourceRecordId: 'M1', finalType: '会员余额订场', amount: 80 }],
    importResults: []
  });
  assert.ok(unboundMemberPlan.blocked.some(item => item.reason === '会员余额订场需会员流水审计链，暂不支持自动导入'), 'member stored-value booking should stay blocked until member audit chain exists');
  const confirmedCompanionPlan = buildThirdPartyImportPlan({
    batchId: 'manual-companion',
    prechecks: [{
      batchId: 'manual-companion',
      sourceRecordId: 'COMPANION1',
      sourceType: 'lock',
      date: '2026-07-30',
      venue: '2号场',
      startTime: '14:00',
      endTime: '15:00',
      recommendedType: 'needs_confirmation',
      needsConfirmation: true,
      suggestedFinalType: '订场陪打',
      amount: 400
    }],
    confirmations: [{
      batchId: 'manual-companion',
      sourceRecordId: 'COMPANION1',
      finalType: '订场陪打',
      paymentMethod: '微信转账',
      amount: 400,
      amountBreakdown: { bookingAmount: 100, serviceAmount: 300, serviceType: '陪打' }
    }],
    importResults: []
  });
  assert.strictEqual(confirmedCompanionPlan.importable.length, 1, 'operator-confirmed companion fee split should become importable');
  assert.strictEqual(confirmedCompanionPlan.importable[0].amountBreakdown.serviceAmount, 300, 'confirmed companion split should keep service amount for two-ledger import');

  const importRes = await call(handler, {
    path: '/third-party-sync/import',
    method: 'POST',
    body: { batchId }
  });
  assert.strictEqual(importRes.body.result.status, 'completed', 'stable order plus schedule occupancy should complete when every source row has a safe destination');
  assert.ok(importRes.body.result.backup?.tables?.ft_courts, 'import should save a pre-write backup snapshot');
  assert.ok(!importRes.body.result.backup.tables.ft_courts.rows, 'import result should keep backup metadata instead of truncating rows inline');
  assert.ok(writes.some(row => row.table === 'ft_third_party_sync_import_backups' && row.row.tableName === 'ft_courts'), 'import should write backup chunks before business writes');
  assert.ok(importRes.body.result.writtenTables.includes('ft_courts'), 'import should write booking users/history');
  assert.ok(importRes.body.result.writtenTables.includes('ft_financial_ledger'), 'import should write finance ledger candidate rows');
  assert.ok(importRes.body.result.writtenTables.includes('ft_schedule'), 'import should create or bind third-party schedule occupancy rows');
  assert.ok(importRes.body.result.verification.finance.ok, 'finance verification should pass');
  assert.ok(importRes.body.result.verification.courts.ok, 'court verification should pass');
  assert.ok(importRes.body.result.verification.membership.checked, 'membership verification should be recorded');
  assert.ok(importRes.body.result.verification.schedule.checked, 'schedule verification should be recorded');
  assert.ok(writes.some(row => row.table === 'ft_courts'), 'business import should write courts table');
  assert.ok(writes.some(row => row.table === 'ft_financial_ledger'), 'business import should write finance ledger table');
  assert.ok(writes.some(row => row.table === 'ft_schedule' && row.row.scheduleSource === '第三方同步排课' && row.row.coach === '小鹿' && row.row.studentName === '张三'), 'private lesson locks may create a schedule only after matching real coach and student');
  assert.ok(writes.some(row => row.table === 'ft_third_party_sync_import_results' && row.row.status === 'completed' && row.row.fullDisposition?.ok), 'full import result should be auditable');

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

  scans.ft_third_party_sync_batches.push({ id: 'unsafe-schedule-batch', batchId: 'unsafe-schedule-batch', status: 'prechecked' });
  scans.ft_third_party_sync_prechecks.push({
    id: 'unsafe-schedule-precheck-1',
    batchId: 'unsafe-schedule-batch',
    sourceRecordId: 'UNSAFE-SCHEDULE',
    sourceType: 'lock',
    date: '2026-07-31',
    venue: '3号场',
    startTime: '18:00',
    endTime: '19:00',
    customerName: '马坡运营',
    operatorAccount: '马坡运营',
    phone: '13651248523',
    remark: '马坡运营 私教课',
    recommendedType: 'auto_import',
    needsConfirmation: false,
    suggestedFinalType: '排课占场'
  });
  const unsafeScheduleRes = await call(handler, {
    path: '/third-party-sync/import',
    method: 'POST',
    body: { batchId: 'unsafe-schedule-batch' }
  });
  assert.strictEqual(unsafeScheduleRes.body.result.status, 'paused', 'unidentified coach/student schedule rows should wait for operator handling instead of failing as a system error');
  assert.ok(unsafeScheduleRes.body.plan.blocked.some(row => /未识别到真实教练和学员/.test(row.reason)), 'unsafe schedule row should explain the missing real coach/student');
  assert.ok(!scans.ft_schedule.some(row => row.coach === '马坡运营' || row.studentName === '马坡运营'), 'sync must never create fake Mapo operator schedule rows');

  scans.ft_third_party_sync_batches.push({ id: 'existing-schedule-batch', batchId: 'existing-schedule-batch', status: 'prechecked' });
  scans.ft_third_party_sync_prechecks.push({
    id: 'existing-schedule-precheck-1',
    batchId: 'existing-schedule-batch',
    sourceRecordId: 'SIREN-SPECIAL',
    sourceType: 'lock',
    date: '2026-08-02',
    venue: '2号场',
    startTime: '10:00',
    endTime: '11:00',
    customerName: '马坡运营',
    operatorAccount: '马坡运营',
    remark: 'siren 初阶专项课',
    recommendedType: 'auto_import',
    needsConfirmation: false,
    suggestedFinalType: '排课占场'
  });
  scans.ft_coaches.push({ id: 'coach-siren', name: 'siren', status: 'active' });
  scans.ft_schedule.push({ id: 'schedule-siren-special', date: '2026-08-02', venue: '2号场', startTime: '2026-08-02T10:00:00+08:00', endTime: '2026-08-02T11:00:00+08:00', coach: 'siren', studentName: '小鹿、锤锤呀', status: '已排课' });
  const existingScheduleRes = await call(handler, {
    path: '/third-party-sync/import',
    method: 'POST',
    body: { batchId: 'existing-schedule-batch' }
  });
  assert.strictEqual(existingScheduleRes.body.result.status, 'completed', 'same date time venue and coach should bind the existing schedule');
  assert.ok(scans.ft_schedule.some(row => row.id === 'schedule-siren-special' && row.thirdPartySyncImports?.some(item => item.sourceRecordId === 'SIREN-SPECIAL')), 'existing siren schedule should receive the third-party import mark');
  assert.ok(!scans.ft_schedule.some(row => row.id !== 'schedule-siren-special' && row.thirdPartySyncImports?.some(item => item.sourceRecordId === 'SIREN-SPECIAL')), 'existing schedule match should not create a duplicate schedule');

  scans.ft_third_party_sync_batches.push({ id: 'extra-service-batch', batchId: 'extra-service-batch', status: 'prechecked', counts: { totalSourceCount: 2 } });
  const extraServicePrecheck = precheckThirdPartyRecords([
    { id: 'EXTRA1', sourceType: 'lock', bookingDate: '2026-07-30', venue: '2号场', startTime: '14:00', endTime: '15:00', customerName: '陪打客人', phone: '13911112222', remark: '订场100 陪打300', amount: 400 },
    { id: 'EXTRA2', sourceType: 'lock', bookingDate: '2026-07-30', venue: '3号场', startTime: '16:00', endTime: '17:00', customerName: '发球机客人', phone: '13933334444', remark: '订场120 发球机80', amount: 200 }
  ], { batchId: 'extra-service-batch', now: '2026-07-31T00:00:00+08:00' });
  scans.ft_third_party_sync_prechecks.push(...extraServicePrecheck.items);
  const extraServiceImportRes = await call(handler, {
    path: '/third-party-sync/import',
    method: 'POST',
    body: { batchId: 'extra-service-batch' }
  });
  assert.strictEqual(extraServiceImportRes.body.result.status, 'completed', 'explicit companion and ball-machine fee splits should import automatically');
  assert.strictEqual(extraServiceImportRes.body.result.fullDisposition.importedSourceCount, 2, 'extra service sources should count as imported source rows');
  assert.strictEqual(extraServiceImportRes.body.result.fullDisposition.ok, true, 'extra service batch should have a complete disposition');
  assert.ok(extraServiceImportRes.body.result.writtenTables.includes('ft_schedule'), 'companion import should create a companion schedule row');
  assert.ok(scans.ft_financial_ledger.some(row => row.sourceId === 'EXTRA1' && row.businessType === '散客订场' && row.cashDelta === 10000), 'companion import should write booking income');
  assert.ok(scans.ft_financial_ledger.some(row => row.sourceId === 'EXTRA1' && row.businessType === '陪打服务' && row.cashDelta === 30000), 'companion import should write companion service income');
  assert.ok(scans.ft_financial_ledger.some(row => row.sourceId === 'EXTRA2' && row.businessType === '发球机服务' && row.cashDelta === 8000), 'ball-machine import should write ball-machine service income');

  const replay730Records = [
    ...Array.from({ length: 7 }, (_, index) => ({ sourceType: 'order', orderNo: `730-O-${index}`, bookingDate: '2026-07-30', venue: `${index + 1}号场`, startTime: '09:00', endTime: '10:00', amount: 100, payMethod: '微信支付', status: '已完成' })),
    ...Array.from({ length: 14 }, (_, index) => ({ sourceType: 'lock', thirdPartyId: `730-S-${index}`, bookingDate: '2026-07-30', venue: `${index + 10}号场`, startTime: '10:00', endTime: '11:00', remark: '私教课' })),
    { sourceType: 'lock', thirdPartyId: '730-INTERNAL', bookingDate: '2026-07-30', venue: '1号场', startTime: '11:00', endTime: '12:00', remark: '领导内部使用' },
    { sourceType: 'lock', thirdPartyId: '730-COACH', bookingDate: '2026-07-30', venue: '2号场', startTime: '12:00', endTime: '13:00', customerName: '晓哲', remark: '晓哲 定场' },
    { sourceType: 'lock', thirdPartyId: '730-CHANGDA', bookingDate: '2026-07-30', venue: '3号场', startTime: '13:00', endTime: '14:00', remark: '畅打' },
    { sourceType: 'lock', thirdPartyId: '730-COMPANION', bookingDate: '2026-07-30', venue: '4号场', startTime: '14:00', endTime: '15:00', remark: 'Siren 陪打' },
    ...Array.from({ length: 53 }, (_, index) => ({ sourceType: 'member', thirdPartyId: `730-M-${index}`, memberName: `会员${index}`, memberPhone: `1390000${String(index).padStart(4, '0')}` })),
    { sourceType: 'member-ledger-gap', thirdPartyId: 'member-ledger-gap' }
  ];
  const replay730Precheck = precheckThirdPartyRecords(replay730Records, { batchId: 'replay-730', now: '2026-07-31T00:00:00+08:00' });
  const replay730Plan = buildThirdPartyImportPlan({ batchId: 'replay-730', prechecks: replay730Precheck.items, confirmations: [], importResults: [] });
  assert.strictEqual(replay730Records.length, 79, '2026-07-30 replay sample should keep the real source-total shape');
  assert.strictEqual(replay730Precheck.items.filter(row => row.sourceType === 'lock').length, 18, '2026-07-30 replay should include 18 operator lock rows');
  assert.strictEqual(replay730Plan.importable.length, 23, '2026-07-30 replay should auto-import stable orders, private lessons, internal usage, and changda occupancy');
  assert.strictEqual(replay730Plan.blocked.length, 2, '2026-07-30 replay should isolate only the coach booking without amount and companion row without fee split');
  assert.strictEqual(replay730Plan.informational.length, 54, '2026-07-30 replay should keep member profile changes and member ledger gap informational');

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
    ft_coaches: [{ id: 'coach-cron', name: '小鹿', status: 'active' }],
    ft_students: [{ id: 'student-cron', name: '小明', phone: '13922223333', status: 'active' }],
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
        { sourceType: 'lock', thirdPartyId: 'L9', bookingDate: '2026-07-29', venue: '6号场', startTime: '17:00', endTime: '18:00', remark: '小鹿 小明 私教课' }
      ],
      gaps: []
    }),
    now: () => '2026-07-30T00:00:00+08:00',
    env: { CRON_SECRET: 'secret' }
  });
  const cronRes = await call(cronHandler, {
    path: '/cron/third-party-sync-center',
    method: 'GET',
    req: { headers: { authorization: 'Bearer secret' } },
    query: new URLSearchParams('lookbackDays=3')
  });
  assert.strictEqual(cronRes.statusCode, 200, 'cron should not return 500 when auto import succeeds and only business review remains');
  assert.strictEqual(cronRes.body.autoImport.result.status, 'completed', 'cron should auto import stable orders and schedule locks while separately alerting third-party changes');
  assert.ok(cronRes.body.autoImport.result.fullDisposition?.ok, 'source rows should still have a complete import/skip/informational disposition');
  assert.ok(cronNotifications.some(item => item.type === 'needs_attention' && item.result?.writtenIds?.length > 0), 'cron should send a needs-attention business notice when third-party changes need review');
  assert.ok(cronWrites.some(row => row.table === 'ft_courts' && row.row.history?.some(history => history.sourceRecordId === 'O8')), 'cron should write stable high-confidence order');
  assert.ok(cronWrites.some(row => row.table === 'ft_schedule' && row.row.thirdPartySyncImports?.some(item => item.sourceRecordId === 'L9')), 'cron should auto-create schedule occupancy rows for private lesson locks');
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
    now: () => '2026-07-30T00:00:00+08:00',
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
  assert.ok(failedCronWrites.some(row => row.table === 'ft_third_party_sync_alerts' && row.row.sourceRecordId === 'FAIL1' && row.row.date === '2026-07-29' && row.row.venue === '4号场'), 'failure alert should keep source booking fields for operator handling');
  assert.ok(failedCronNotifications.some(item => item.type === 'failure' && /模拟业务写入失败/.test(item.result?.failed?.[0]?.reason || '')), 'cron import failure should notify Feishu group');

  const notifyFailScans = {
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
    ft_coaches: [],
    ft_students: [],
    ft_membership_accounts: []
  };
  const notifyFailHandler = createThirdPartySyncCenterRoutes({
    init: async () => {},
    sendJson: (res, payload, code = 200) => res.status(code).json(payload),
    getCachedScan: async table => notifyFailScans[table] || [],
    getCachedRow: async (table, id) => (notifyFailScans[table] || []).find(row => String(row.id) === String(id)) || null,
    put: async (table, id, row) => {
      notifyFailScans[table] = [...(notifyFailScans[table] || []).filter(item => String(item.id) !== String(id)), row];
    },
    del: async (table, id) => {
      notifyFailScans[table] = (notifyFailScans[table] || []).filter(item => String(item.id) !== String(id));
    },
    mkTable: async () => 'ok',
    uuidv4: (() => {
      let n = 0;
      return () => `notify-fail-uuid-${++n}`;
    })(),
    normalizeCourtRecord: row => row,
    notifyThirdPartySyncResult: async () => {
      throw new Error('模拟飞书发送失败');
    },
    fetchThirdPartyData: async () => ({
      records: [
        { sourceType: 'order', orderNo: 'NOTIFY-FAIL1', bookingDate: '2026-07-29', venue: '4号场', startTime: '13:00', endTime: '14:00', amount: 90, payMethod: '微信支付', status: '已完成', customerName: '通知失败订单' }
      ],
      gaps: []
    }),
    now: () => '2026-07-30T00:00:00+08:00',
    env: { CRON_SECRET: 'secret' }
  });
  const notifyFailRes = await call(notifyFailHandler, {
    path: '/cron/third-party-sync-center',
    method: 'GET',
    req: { headers: { authorization: 'Bearer secret' } }
  });
  assert.strictEqual(notifyFailRes.statusCode, 200, 'cron should not fail only because the Feishu notification chain fails');
  assert.match(notifyFailRes.body.notification.error, /模拟飞书发送失败/, 'cron response should expose notification failure reason');

  const pausedNotifyFailScans = {
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
    ft_coaches: [],
    ft_students: [],
    ft_membership_accounts: []
  };
  const pausedNotifyFailHandler = createThirdPartySyncCenterRoutes({
    init: async () => {},
    sendJson: (res, payload, code = 200) => res.status(code).json(payload),
    getCachedScan: async table => pausedNotifyFailScans[table] || [],
    getCachedRow: async (table, id) => (pausedNotifyFailScans[table] || []).find(row => String(row.id) === String(id)) || null,
    put: async (table, id, row) => {
      pausedNotifyFailScans[table] = [...(pausedNotifyFailScans[table] || []).filter(item => String(item.id) !== String(id)), row];
    },
    del: async (table, id) => {
      pausedNotifyFailScans[table] = (pausedNotifyFailScans[table] || []).filter(item => String(item.id) !== String(id));
    },
    mkTable: async () => 'ok',
    uuidv4: (() => {
      let n = 0;
      return () => `paused-notify-fail-uuid-${++n}`;
    })(),
    normalizeCourtRecord: row => row,
    notifyThirdPartySyncResult: async () => {
      throw new Error('模拟待处理通知发送失败');
    },
    fetchThirdPartyData: async () => ({
      records: [
        { sourceType: 'lock', thirdPartyId: 'PAUSED1', bookingDate: '2026-07-29', venue: '1号场', startTime: '06:00', endTime: '22:00', customerName: '马坡运营', operatorAccount: '马坡运营', remark: '' }
      ],
      gaps: []
    }),
    now: () => '2026-07-30T00:00:00+08:00',
    env: { CRON_SECRET: 'secret' }
  });
  const pausedNotifyFailRes = await call(pausedNotifyFailHandler, {
    path: '/cron/third-party-sync-center',
    method: 'GET',
    req: { headers: { authorization: 'Bearer secret' } }
  });
  assert.strictEqual(pausedNotifyFailRes.statusCode, 200, 'cron should not return 500 for paused business-review batches even when Feishu rejects the notice');
  assert.strictEqual(pausedNotifyFailRes.body.autoImport.result.status, 'paused', 'cron response should expose the business-review paused status');
  assert.match(pausedNotifyFailRes.body.notification.error, /模拟待处理通知发送失败/, 'paused cron response should keep the notification failure reason');

  console.log('third-party sync center routes tests passed');
})().catch(err => {
  console.error(err);
  process.exit(1);
});
