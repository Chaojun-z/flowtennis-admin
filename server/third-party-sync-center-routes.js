const crypto = require('crypto');
const axios = require('axios');

const T_THIRD_PARTY_SYNC_BATCHES = 'ft_third_party_sync_batches';
const T_THIRD_PARTY_SYNC_RAW_RECORDS = 'ft_third_party_sync_raw_records';
const T_THIRD_PARTY_SYNC_PRECHECKS = 'ft_third_party_sync_prechecks';
const T_THIRD_PARTY_SYNC_CONFIRMATIONS = 'ft_third_party_sync_confirmations';
const T_THIRD_PARTY_SYNC_IMPORT_RESULTS = 'ft_third_party_sync_import_results';
const THIRD_PARTY_SYNC_TABLES = [
  T_THIRD_PARTY_SYNC_BATCHES,
  T_THIRD_PARTY_SYNC_RAW_RECORDS,
  T_THIRD_PARTY_SYNC_PRECHECKS,
  T_THIRD_PARTY_SYNC_CONFIRMATIONS,
  T_THIRD_PARTY_SYNC_IMPORT_RESULTS
];

function cleanText(value) {
  return String(value ?? '').trim();
}

function stableHash(value) {
  return crypto.createHash('sha256').update(JSON.stringify(value ?? null)).digest('hex');
}

function chinaDateParts(date = new Date()) {
  const parts = new Intl.DateTimeFormat('en-CA', {
    timeZone: 'Asia/Shanghai',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit'
  }).formatToParts(date).reduce((acc, part) => {
    acc[part.type] = part.value;
    return acc;
  }, {});
  return { year: Number(parts.year), month: Number(parts.month), day: Number(parts.day) };
}

function chinaDateKey(date = new Date()) {
  const p = chinaDateParts(date);
  return `${p.year}-${String(p.month).padStart(2, '0')}-${String(p.day).padStart(2, '0')}`;
}

function addDays(dateKey, delta) {
  const [y, m, d] = String(dateKey).split('-').map(Number);
  const utc = Date.UTC(y, m - 1, d) + delta * 86400000;
  return new Date(utc).toISOString().slice(0, 10);
}

function defaultDailyRange(now = new Date(), lookbackDays = 3) {
  const today = chinaDateKey(now);
  const yesterday = addDays(today, -1);
  const start = addDays(yesterday, -Math.max(0, Number(lookbackDays || 3) - 1));
  return {
    rangeStart: `${start} 00:00:00`,
    rangeEnd: `${yesterday} 23:59:59`
  };
}

function normalizeSourceType(value) {
  const text = cleanText(value).toLowerCase();
  if (['order', 'lock', 'member', 'refund', 'member-ledger-gap'].includes(text)) return text;
  return text || 'other';
}

function recordSourceId(record = {}, index = 0) {
  return cleanText(record.thirdPartyId || record.orderNo || record.orderId || record.id || record.sourceId) || `generated-${stableHash(record).slice(0, 16)}-${index}`;
}

function bookingDateOf(record = {}) {
  return cleanText(record.bookingDate || record.useDate || record.date || record.startDate || '').slice(0, 10);
}

function venueOf(record = {}) {
  const raw = cleanText(record.venue || record.court || record.courtName || record.spaceName || record.placeName);
  if (!raw) return '';
  if (/^\d+$/.test(raw)) return `${raw}号场`;
  if (/^\d+号$/.test(raw)) return `${raw}场`;
  if (/室内\s*(\d+)/.test(raw)) return raw.replace(/.*室内\s*(\d+).*/, '$1号场');
  return raw;
}

function startTimeOf(record = {}) {
  const value = cleanText(record.startTime || record.startClock || record.beginTime || '');
  const m = value.match(/(\d{1,2}:\d{2})/);
  return m ? m[1].padStart(5, '0') : '';
}

function endTimeOf(record = {}) {
  const value = cleanText(record.endTime || record.endClock || record.finishTime || '');
  const m = value.match(/(\d{1,2}:\d{2})/);
  return m ? m[1].padStart(5, '0') : '';
}

function customerNameOf(record = {}) {
  return cleanText(record.customerName || record.userName || record.memberName || record.name || record.contactName || record.nickName);
}

function phoneOf(record = {}) {
  return cleanText(record.phone || record.mobile || record.userPhone || record.memberPhone || record.contactPhone);
}

function remarkOf(record = {}) {
  return cleanText(record.remark || record.note || record.description);
}

function amountOf(record = {}) {
  return Number(record.amount || record.paidAmount || record.actualAmount || record.payAmount || 0) || 0;
}

function uniqueBookingKey(record = {}) {
  const date = bookingDateOf(record);
  const venue = venueOf(record);
  const start = startTimeOf(record);
  const end = endTimeOf(record);
  return date && venue && start && end ? `${date}|${venue}|${start}|${end}` : '';
}

function classifyRecord(record = {}, duplicateKeys = new Set()) {
  const sourceType = normalizeSourceType(record.sourceType);
  const key = uniqueBookingKey(record);
  if (sourceType === 'member-ledger-gap') {
    return { recommendedType: 'high_risk_exception', plannedAction: '暂不导入', confidence: 0, riskReason: '会员流水批量接口缺口', needsConfirmation: true };
  }
  if (['order', 'lock'].includes(sourceType) && (!bookingDateOf(record) || !venueOf(record) || !startTimeOf(record) || !endTimeOf(record))) {
    return { recommendedType: 'high_risk_exception', plannedAction: '暂不导入', confidence: 0, riskReason: '缺日期/时间/场地', needsConfirmation: true };
  }
  if (key && duplicateKeys.has(key)) {
    return { recommendedType: 'duplicate_skip', plannedAction: '重复跳过', confidence: 0.9, riskReason: '同一日期场地时段重复', needsConfirmation: false };
  }
  const remark = remarkOf(record);
  if (sourceType === 'lock') {
    if (/清洗|打扫|维修/.test(remark)) return { recommendedType: 'auto_import', plannedAction: '标记内部占用', confidence: 0.85, riskReason: '', needsConfirmation: false };
    return { recommendedType: 'needs_confirmation', plannedAction: '运营确认锁场类型', confidence: 0.45, riskReason: remark ? '锁场需确认业务归属' : '备注为空', needsConfirmation: true };
  }
  if (sourceType === 'order') {
    const status = cleanText(record.status || record.orderStatus);
    if (/取消|退款|作废/.test(status)) return { recommendedType: 'do_not_import', plannedAction: '暂不导入', confidence: 0.8, riskReason: '取消/退款订单', needsConfirmation: false };
    return { recommendedType: 'auto_import', plannedAction: '生成导入计划', confidence: 0.85, riskReason: '', needsConfirmation: false };
  }
  if (sourceType === 'member') {
    return { recommendedType: 'needs_confirmation', plannedAction: '会员资料待核对', confidence: 0.5, riskReason: '会员流水未自动获取', needsConfirmation: true };
  }
  return { recommendedType: 'needs_confirmation', plannedAction: '运营确认', confidence: 0.3, riskReason: '来源类型不明', needsConfirmation: true };
}

function financeImpactFor(record = {}, classification = {}) {
  if (!['auto_import', 'needs_confirmation'].includes(classification.recommendedType)) return { cashDelta: 0, recognizedRevenueDelta: 0, deferredRevenueDelta: 0 };
  const amount = amountOf(record);
  const payMethod = cleanText(record.payMethod || record.paymentMethod);
  if (classification.plannedAction === '标记内部占用') return { cashDelta: 0, recognizedRevenueDelta: 0, deferredRevenueDelta: 0 };
  if (/余额|储值卡/.test(payMethod)) return { cashDelta: 0, recognizedRevenueDelta: amount, deferredRevenueDelta: -amount };
  return { cashDelta: amount, recognizedRevenueDelta: amount, deferredRevenueDelta: 0 };
}

function precheckThirdPartyRecords(records = [], { batchId = '', now = new Date().toISOString() } = {}) {
  const seen = new Set();
  const items = (records || []).map((record, index) => {
    const sourceRecordId = recordSourceId(record, index);
    const key = uniqueBookingKey(record);
    const duplicate = key && seen.has(key);
    if (key) seen.add(key);
    const classification = classifyRecord(record, duplicate ? new Set([key]) : new Set());
    const financeImpact = financeImpactFor(record, classification);
    return {
      id: `${batchId || 'batch'}-precheck-${stableHash({ sourceRecordId, key }).slice(0, 16)}`,
      batchId,
      sourceRecordId,
      sourceType: normalizeSourceType(record.sourceType),
      uniqueKey: key,
      date: bookingDateOf(record),
      startTime: startTimeOf(record),
      endTime: endTimeOf(record),
      venue: venueOf(record),
      customerName: customerNameOf(record),
      phone: phoneOf(record),
      remark: remarkOf(record),
      amount: amountOf(record),
      recommendedType: classification.recommendedType,
      confidence: classification.confidence,
      riskReason: classification.riskReason,
      plannedAction: classification.plannedAction,
      financeImpact,
      needsConfirmation: classification.needsConfirmation,
      status: classification.needsConfirmation ? 'pending_confirmation' : 'prechecked',
      createdAt: now
    };
  });
  const counts = items.reduce((acc, item) => {
    acc[item.recommendedType] = (acc[item.recommendedType] || 0) + 1;
    return acc;
  }, {});
  return { items, counts };
}

function buildThirdPartySyncBatch({ id = '', rangeStart = '', rangeEnd = '', now = new Date().toISOString(), counts = {}, financeImpact = {} } = {}) {
  const batchId = id || `cxe-sync-${String(rangeStart || now).slice(0, 10).replace(/-/g, '')}-${stableHash({ rangeStart, rangeEnd, now }).slice(0, 8)}`;
  return {
    id: batchId,
    batchId,
    sourceSystem: 'changxiaoer',
    mode: 'readonly',
    rangeStart,
    rangeEnd,
    status: 'prechecked',
    pulledAt: now,
    precheckedAt: now,
    importedAt: '',
    counts,
    financeImpact,
    createdBy: 'system',
    confirmedBy: ''
  };
}

function rawRecordRow(record = {}, { batchId = '', now = new Date().toISOString(), index = 0 } = {}) {
  const sourceType = normalizeSourceType(record.sourceType);
  const sourceId = recordSourceId(record, index);
  return {
    id: `${batchId}-raw-${sourceType}-${stableHash({ sourceId, record }).slice(0, 16)}`,
    batchId,
    sourceSystem: 'changxiaoer',
    sourceType,
    thirdPartyId: sourceId,
    orderNo: cleanText(record.orderNo || record.orderId),
    rawJson: record,
    rawHash: stableHash(record),
    fetchedAt: now
  };
}

async function fetchPaged({ client, method = 'POST', url, token, rangeStart, rangeEnd, body = {}, params = {} }) {
  const rows = [];
  for (let pageNum = 1; pageNum <= 300; pageNum++) {
    const pageBody = { ...body, pageNum, pageSize: 100, dateFrom: rangeStart, dateTo: rangeEnd, startTime: rangeStart, endTime: rangeEnd };
    const pageParams = { ...params, pageNum, pageSize: 100, dateFrom: rangeStart, dateTo: rangeEnd };
    const res = method === 'GET'
      ? await client.get(url, { params: pageParams, headers: cxeHeaders(token) })
      : await client.post(url, pageBody, { headers: cxeHeaders(token) });
    const data = res.data?.data || res.data || {};
    const list = data.list || data.records || data.rows || data.items || [];
    if (!Array.isArray(list) || !list.length) break;
    rows.push(...list);
    const hasNext = data.hasNext ?? data.hasNextPage;
    const totalPage = Number(data.totalPage || data.pages || 0);
    if (hasNext === false || (totalPage && pageNum >= totalPage)) break;
  }
  return rows;
}

function cxeHeaders(token = '') {
  return {
    'content-type': 'application/json;charset=UTF-8',
    'CXE-Console-Channel': 'Web',
    'CXE-Console-Version': '46',
    ...(token ? { token } : {})
  };
}

async function fetchChangxiaoerData({ rangeStart = '', rangeEnd = '', env = process.env, client = axios } = {}) {
  const phone = cleanText(env.CXE_USER);
  const pwd = cleanText(env.CXE_PASS);
  if (!phone || !pwd) throw new Error('缺少 CXE_USER / CXE_PASS，不能拉取第三方数据');
  const login = await client.post('https://api.console.changxiaoer.cn/admin/merchantAdminLogin', { phone, pwd }, { headers: cxeHeaders() });
  const token = cleanText(login.data?.data?.token);
  if (!token) throw new Error('第三方登录未返回 token');
  const [orders, locks, members] = await Promise.all([
    fetchPaged({ client, method: 'POST', url: 'https://api.console.changxiaoer.cn/basic/order', token, rangeStart, rangeEnd }),
    fetchPaged({ client, method: 'GET', url: 'https://api.console.changxiaoer.cn/merchants-management/data-analysis/occupy-space-period-records', token, rangeStart, rangeEnd }),
    fetchPaged({ client, method: 'POST', url: 'https://api.console.changxiaoer.cn/merchantmanage/recharge/userList', token, rangeStart, rangeEnd })
  ]);
  return {
    records: [
      ...orders.map(row => ({ ...row, sourceType: 'order' })),
      ...locks.map(row => ({ ...row, sourceType: 'lock' })),
      ...members.map(row => ({ ...row, sourceType: 'member' }))
    ],
    gaps: ['member-ledger']
  };
}

function requireCronAccess(req, env = process.env) {
  const expected = cleanText(env.CRON_SECRET || env.FLOWTENNIS_ADMIN_TOKEN);
  if (!expected) return false;
  const token = cleanText(req?.headers?.authorization || '').replace(/^Bearer\s+/i, '');
  return token === expected;
}

function createThirdPartySyncCenterRoutes(deps = {}) {
  const {
    init = async () => {},
    sendJson = (res, payload, code = 200) => res.status(code).json(payload),
    getCachedScan = async () => [],
    put = async () => {},
    mkTable = async () => {},
    uuidv4 = () => crypto.randomUUID(),
    fetchThirdPartyData = fetchChangxiaoerData,
    now = () => new Date().toISOString(),
    env = process.env
  } = deps;
  let tablesReady = false;

  async function ensureTables() {
    if (tablesReady) return;
    await Promise.all(THIRD_PARTY_SYNC_TABLES.map(table => mkTable(table).catch(() => null)));
    tablesReady = true;
  }

  async function pullAndPrecheck({ rangeStart, rangeEnd, operator = 'system' } = {}) {
    await ensureTables();
    const pulledAt = now();
    const fetched = await fetchThirdPartyData({ rangeStart, rangeEnd, env });
    const sourceRecords = [
      ...(fetched.records || []),
      ...(fetched.gaps || []).map(gap => ({ sourceType: `${gap}-gap`, thirdPartyId: `${gap}-gap`, riskReason: '会员流水批量接口缺口' }))
    ];
    const batchId = `cxe-sync-${String(rangeStart).slice(0, 10).replace(/-/g, '')}-${uuidv4()}`;
    const precheck = precheckThirdPartyRecords(sourceRecords, { batchId, now: pulledAt });
    const financeImpact = precheck.items.reduce((acc, item) => ({
      cashDelta: acc.cashDelta + Number(item.financeImpact?.cashDelta || 0),
      recognizedRevenueDelta: acc.recognizedRevenueDelta + Number(item.financeImpact?.recognizedRevenueDelta || 0),
      deferredRevenueDelta: acc.deferredRevenueDelta + Number(item.financeImpact?.deferredRevenueDelta || 0)
    }), { cashDelta: 0, recognizedRevenueDelta: 0, deferredRevenueDelta: 0 });
    const batch = { ...buildThirdPartySyncBatch({ id: batchId, rangeStart, rangeEnd, now: pulledAt, counts: precheck.counts, financeImpact }), createdBy: operator };
    await put(T_THIRD_PARTY_SYNC_BATCHES, batch.id, batch);
    await Promise.all(sourceRecords.map((record, index) => {
      const row = rawRecordRow(record, { batchId, now: pulledAt, index });
      return put(T_THIRD_PARTY_SYNC_RAW_RECORDS, row.id, row);
    }));
    await Promise.all(precheck.items.map(row => put(T_THIRD_PARTY_SYNC_PRECHECKS, row.id, row)));
    return { batch, precheck };
  }

  return async function handleThirdPartySyncCenterRoutes({ path, method, body = {}, user, req, res, query = new URLSearchParams() }) {
    if (path === '/cron/third-party-sync-center' && method === 'GET') {
      if (!requireCronAccess(req, env)) return sendJson(res, { error: '无权限' }, 401);
      await init();
      const range = defaultDailyRange(new Date(), Number(query.get('lookbackDays') || 3));
      return sendJson(res, await pullAndPrecheck(range));
    }
    if (!path.startsWith('/third-party-sync')) return false;
    if (user?.role !== 'admin') return sendJson(res, { error: '无权限' }, 403);
    await init();
    await ensureTables();
    if (path === '/third-party-sync/overview' && method === 'GET') {
      const [batches, rawRecords, prechecks, confirmations, importResults] = await Promise.all([
        getCachedScan(T_THIRD_PARTY_SYNC_BATCHES).catch(() => []),
        getCachedScan(T_THIRD_PARTY_SYNC_RAW_RECORDS).catch(() => []),
        getCachedScan(T_THIRD_PARTY_SYNC_PRECHECKS).catch(() => []),
        getCachedScan(T_THIRD_PARTY_SYNC_CONFIRMATIONS).catch(() => []),
        getCachedScan(T_THIRD_PARTY_SYNC_IMPORT_RESULTS).catch(() => [])
      ]);
      const summary = {
        batchCount: batches.length,
        rawCount: rawRecords.length,
        autoImportCount: prechecks.filter(row => row.recommendedType === 'auto_import').length,
        pendingCount: prechecks.filter(row => row.needsConfirmation || row.recommendedType === 'needs_confirmation').length,
        exceptionCount: prechecks.filter(row => row.recommendedType === 'high_risk_exception').length,
        duplicateCount: prechecks.filter(row => row.recommendedType === 'duplicate_skip').length
      };
      return sendJson(res, { summary, batches, rawRecords, prechecks, confirmations, importResults });
    }
    if (path === '/third-party-sync/pull' && method === 'POST') {
      const range = body.rangeStart && body.rangeEnd ? { rangeStart: body.rangeStart, rangeEnd: body.rangeEnd } : defaultDailyRange(new Date(), Number(body.lookbackDays || 3));
      return sendJson(res, await pullAndPrecheck({ ...range, operator: user.name || 'admin' }));
    }
    if (path === '/third-party-sync/confirmations' && method === 'POST') {
      const confirmation = {
        id: `cxe-confirm-${uuidv4()}`,
        batchId: cleanText(body.batchId),
        sourceRecordId: cleanText(body.sourceRecordId),
        finalType: cleanText(body.finalType),
        paymentMethod: cleanText(body.paymentMethod),
        amount: Number(body.amount || 0) || 0,
        bindTargetType: cleanText(body.bindTargetType),
        bindTargetId: cleanText(body.bindTargetId),
        confirmNote: cleanText(body.confirmNote),
        confirmedBy: user.name || user.id || 'admin',
        confirmedAt: now(),
        status: 'confirmed'
      };
      if (!confirmation.batchId || !confirmation.sourceRecordId || !confirmation.finalType) return sendJson(res, { error: '缺少确认信息' }, 400);
      await put(T_THIRD_PARTY_SYNC_CONFIRMATIONS, confirmation.id, confirmation);
      return sendJson(res, { success: true, confirmation });
    }
    return false;
  };
}

module.exports = {
  createThirdPartySyncCenterRoutes,
  buildThirdPartySyncBatch,
  precheckThirdPartyRecords,
  fetchChangxiaoerData,
  defaultDailyRange,
  THIRD_PARTY_SYNC_TABLES,
  T_THIRD_PARTY_SYNC_BATCHES,
  T_THIRD_PARTY_SYNC_RAW_RECORDS,
  T_THIRD_PARTY_SYNC_PRECHECKS,
  T_THIRD_PARTY_SYNC_CONFIRMATIONS,
  T_THIRD_PARTY_SYNC_IMPORT_RESULTS
};
