const crypto = require('crypto');
const axios = require('axios');

const T_THIRD_PARTY_SYNC_BATCHES = 'ft_third_party_sync_batches';
const T_THIRD_PARTY_SYNC_RAW_RECORDS = 'ft_third_party_sync_raw_records';
const T_THIRD_PARTY_SYNC_PRECHECKS = 'ft_third_party_sync_prechecks';
const T_THIRD_PARTY_SYNC_CONFIRMATIONS = 'ft_third_party_sync_confirmations';
const T_THIRD_PARTY_SYNC_IMPORT_RESULTS = 'ft_third_party_sync_import_results';
const T_THIRD_PARTY_SYNC_IMPORT_BACKUPS = 'ft_third_party_sync_import_backups';
const T_THIRD_PARTY_SYNC_CHANGES = 'ft_third_party_sync_changes';
const T_THIRD_PARTY_SYNC_ALERTS = 'ft_third_party_sync_alerts';
const T_THIRD_PARTY_SYNC_ROLLBACKS = 'ft_third_party_sync_rollbacks';
const T_COURTS = 'ft_courts';
const T_FINANCIAL_LEDGER = 'ft_financial_ledger';
const T_SCHEDULE = 'ft_schedule';
const T_MEMBERSHIP_ACCOUNTS = 'ft_membership_accounts';
const THIRD_PARTY_SYNC_TABLES = [
  T_THIRD_PARTY_SYNC_BATCHES,
  T_THIRD_PARTY_SYNC_RAW_RECORDS,
  T_THIRD_PARTY_SYNC_PRECHECKS,
  T_THIRD_PARTY_SYNC_CONFIRMATIONS,
  T_THIRD_PARTY_SYNC_IMPORT_RESULTS,
  T_THIRD_PARTY_SYNC_IMPORT_BACKUPS,
  T_THIRD_PARTY_SYNC_CHANGES,
  T_THIRD_PARTY_SYNC_ALERTS,
  T_THIRD_PARTY_SYNC_ROLLBACKS
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

function orderInfoItems(record = {}) {
  const info = record.orderInfo;
  if (Array.isArray(info)) return info.filter(Boolean);
  if (info && typeof info === 'object') return [info];
  return [];
}

function orderInfoDate(record = {}) {
  return cleanText(orderInfoItems(record).map(item => item.time || item.date).filter(Boolean).sort()[0] || '').slice(0, 10);
}

function orderInfoRegions(record = {}) {
  return orderInfoItems(record)
    .map(item => cleanText(item.region || item.timeRegion || item.period))
    .map(text => {
      const m = text.match(/(\d{1,2}:\d{2})\s*[-~至]\s*(\d{1,2}:\d{2})/);
      return m ? { start: m[1].padStart(5, '0'), end: m[2].padStart(5, '0') } : null;
    })
    .filter(Boolean);
}

function bookingDateOf(record = {}) {
  return cleanText(orderInfoDate(record) || record.bookingDate || record.useDate || record.date || record.startDate || '').slice(0, 10);
}

function venueOf(record = {}) {
  const orderPlace = orderInfoItems(record).map(item => item?.priceBasicsInfo?.placeName || item?.placeName || item?.courtName).find(Boolean);
  const spacePlace = record.space && typeof record.space === 'object' ? record.space.placeName || record.space.courtName : '';
  const raw = cleanText(record.venue || record.court || record.courtName || orderPlace || spacePlace || record.spaceName || record.placeName);
  if (!raw) return '';
  if (/^\d+$/.test(raw)) return `${raw}号场`;
  if (/^\d+号$/.test(raw)) return `${raw}场`;
  if (/室内\s*(\d+)/.test(raw)) return raw.replace(/.*室内\s*(\d+).*/, '$1号场');
  return raw;
}

function startTimeOf(record = {}) {
  const regions = orderInfoRegions(record);
  if (regions.length) return regions.map(row => row.start).sort()[0] || '';
  const value = cleanText(record.startTime || record.startClock || record.beginTime || '');
  const m = value.match(/(\d{1,2}:\d{2})/);
  return m ? m[1].padStart(5, '0') : '';
}

function endTimeOf(record = {}) {
  const regions = orderInfoRegions(record);
  if (regions.length) return regions.map(row => row.end).sort().slice(-1)[0] || '';
  const value = cleanText(record.endTime || record.endClock || record.finishTime || '');
  const m = value.match(/(\d{1,2}:\d{2})/);
  return m ? m[1].padStart(5, '0') : '';
}

function customerNameOf(record = {}) {
  return cleanText(record.customerName || record.userName || record.memberName || record.realName || record.name || record.contactName || record.nickName);
}

function phoneOf(record = {}) {
  return cleanText(record.phone || record.mobile || record.userPhone || record.memberPhone || record.contactPhone);
}

function remarkOf(record = {}) {
  return cleanText(record.remark || record.userRemark || record.note || record.description);
}

function amountOf(record = {}) {
  const raw = Number(record.amount || record.siteAmount || record.paidAmount || record.actualAmount || record.payAmount || 0) || 0;
  const looksLikeCentAmount = raw >= 1000 && (Array.isArray(record.orderInfo) || record.siteAmount != null || record.wechatPaymentAmount != null || record.balancePaymentAmount != null);
  return looksLikeCentAmount ? Math.round(raw) / 100 : raw;
}

function recordWithinRange(record = {}, rangeStart = '', rangeEnd = '') {
  const date = bookingDateOf(record);
  const start = cleanText(rangeStart).slice(0, 10);
  const end = cleanText(rangeEnd).slice(0, 10);
  if (!date || !start || !end) return true;
  return date >= start && date <= end;
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

function latestConfirmationFor(precheck = {}, confirmations = []) {
  return (confirmations || [])
    .filter(row => String(row.batchId || '') === String(precheck.batchId || '') && String(row.sourceRecordId || '') === String(precheck.sourceRecordId || ''))
    .sort((a, b) => String(b.confirmedAt || '').localeCompare(String(a.confirmedAt || '')))[0] || null;
}

function isAlreadyImported(precheck = {}, importResults = []) {
  return (importResults || []).some(result =>
    ['completed', 'partial_completed', 'partial_failed'].includes(String(result.status || '')) &&
    (result.writtenIds || []).some(row => String(row.sourceRecordId || '') === String(precheck.sourceRecordId || ''))
  );
}

function confirmationIsImportable(confirmation = {}) {
  const finalType = cleanText(confirmation.finalType);
  return !!finalType && !['忽略不导入', '待老板确认'].includes(finalType);
}

function confirmedAmount(precheck = {}, confirmation = {}) {
  return Number(confirmation.amount || precheck.amount || 0) || 0;
}

function needsPositiveAmount(finalType = '') {
  return ['会员余额订场', '散客微信转账订场', '散客现金订场', '大众点评券码订场', '教练代订场', '订场陪打'].includes(cleanText(finalType));
}

function importTargetsFor({ sourceType = '', finalType = '', recommendedType = '' } = {}) {
  const type = cleanText(finalType);
  if (type === '排课占场') return [T_SCHEDULE];
  if (type === '内部占用') return [T_COURTS];
  if (['散客微信转账订场', '散客现金订场', '大众点评券码订场', '教练代订场', '订场陪打'].includes(type)) return [T_COURTS, T_FINANCIAL_LEDGER];
  if (recommendedType === 'auto_import' && sourceType === 'lock') return [T_COURTS];
  if (recommendedType === 'auto_import' && sourceType === 'order') return [T_COURTS, T_FINANCIAL_LEDGER];
  return [];
}

function buildThirdPartyImportPlan({ batchId = '', prechecks = [], confirmations = [], importResults = [] } = {}) {
  const scoped = (prechecks || []).filter(row => !batchId || String(row.batchId || '') === String(batchId));
  const plan = { batchId, importable: [], blocked: [], skipped: [], counts: { importable: 0, blocked: 0, skipped: 0 } };
  for (const precheck of scoped) {
    const sourceRecordId = cleanText(precheck.sourceRecordId);
    if (isAlreadyImported(precheck, importResults)) {
      plan.skipped.push({ ...precheck, sourceRecordId, reason: '已导入' });
      continue;
    }
    if (['duplicate_skip', 'do_not_import'].includes(precheck.recommendedType)) {
      plan.skipped.push({ ...precheck, sourceRecordId, reason: precheck.plannedAction || '不导入' });
      continue;
    }
    if (precheck.riskReason === '会员流水批量接口缺口') {
      plan.blocked.push({ ...precheck, sourceRecordId, reason: '会员流水批量接口缺口' });
      continue;
    }
    const confirmation = latestConfirmationFor(precheck, confirmations);
    const finalType = confirmation?.finalType || (precheck.recommendedType === 'auto_import' ? (precheck.sourceType === 'lock' ? '内部占用' : '散客微信转账订场') : '');
    if (precheck.needsConfirmation && !confirmation) {
      plan.blocked.push({ ...precheck, sourceRecordId, reason: '等待运营确认' });
      continue;
    }
    if (confirmation && !confirmationIsImportable(confirmation)) {
      plan.skipped.push({ ...precheck, sourceRecordId, confirmation, reason: confirmation.finalType || '不导入' });
      continue;
    }
    const amount = confirmedAmount(precheck, confirmation || {});
    if (needsPositiveAmount(finalType) && amount <= 0) {
      plan.blocked.push({ ...precheck, sourceRecordId, confirmation, finalType, reason: '缺少确认金额' });
      continue;
    }
    if (finalType === '排课占场' && !cleanText(confirmation?.bindTargetId || precheck.bindTargetId)) {
      plan.blocked.push({ ...precheck, sourceRecordId, confirmation, finalType, reason: '排课占场缺少绑定排课ID' });
      continue;
    }
    if (finalType === '会员余额订场') {
      plan.blocked.push({ ...precheck, sourceRecordId, confirmation, finalType, reason: '会员余额订场需会员流水审计链，暂不支持自动导入' });
      continue;
    }
    const targetTables = importTargetsFor({ sourceType: precheck.sourceType, finalType, recommendedType: precheck.recommendedType });
    if (!targetTables.length) {
      plan.blocked.push({ ...precheck, sourceRecordId, confirmation, finalType, reason: '暂未支持该类型导入' });
      continue;
    }
    plan.importable.push({ ...precheck, sourceRecordId, confirmation, finalType, amount, targetTables });
  }
  plan.counts.importable = plan.importable.length;
  plan.counts.blocked = plan.blocked.length;
  plan.counts.skipped = plan.skipped.length;
  return plan;
}

function payMethodForImport(item = {}) {
  if (item.finalType === '会员余额订场') return '储值扣款';
  const method = cleanText(item.confirmation?.paymentMethod || item.payMethod);
  if (method === '会员余额') return '储值扣款';
  if (method === '不涉及支付') return '不涉及支付';
  return method || '微信转账';
}

function cents(amount) {
  return Math.round((Number(amount || 0) || 0) * 100);
}

function buildImportTrace({ batchId = '', operationId = '', operator = '', now = '' } = {}) {
  return { operationId, batchId, operationType: 'third-party-sync-import', operationAt: now, operationBy: operator };
}

async function buildImportBackup({ getCachedScan, put, uuidv4, batchId = '', operationId = '', operator = '', tables = [], now = '' } = {}) {
  const backupId = `cxe-backup-${uuidv4()}`;
  const backup = { backupId, batchId, operationId, createdAt: now, createdBy: operator, tables: {}, rowIds: [] };
  for (const table of tables) {
    const rows = await getCachedScan(table).catch(() => []);
    const chunkSize = 100;
    const chunks = Math.max(1, Math.ceil(rows.length / chunkSize));
    backup.tables[table] = { count: rows.length, chunks };
    for (let index = 0; index < chunks; index++) {
      const id = `${backupId}-${table}-${index + 1}`;
      const row = {
        id,
        backupId,
        batchId,
        operationId,
        tableName: table,
        chunkIndex: index + 1,
        chunkCount: chunks,
        rows: rows.slice(index * chunkSize, (index + 1) * chunkSize),
        createdAt: now,
        createdBy: operator
      };
      await put(T_THIRD_PARTY_SYNC_IMPORT_BACKUPS, id, row);
      backup.rowIds.push(id);
    }
  }
  return backup;
}

function latestRawBySource(rawRecords = []) {
  const map = new Map();
  for (const row of rawRecords || []) {
    const key = `${row.sourceType || ''}|${row.thirdPartyId || row.sourceRecordId || row.orderNo || ''}`;
    if (!key.endsWith('|') && String(row.fetchedAt || '').localeCompare(String(map.get(key)?.fetchedAt || '')) >= 0) map.set(key, row);
  }
  return map;
}

function changedFieldsFor(prev = {}, next = {}) {
  const fields = [
    ['status', cleanText(prev.status || prev.orderStatus), cleanText(next.status || next.orderStatus)],
    ['amount', amountOf(prev), amountOf(next)],
    ['remark', remarkOf(prev), remarkOf(next)],
    ['date', bookingDateOf(prev), bookingDateOf(next)],
    ['venue', venueOf(prev), venueOf(next)],
    ['startTime', startTimeOf(prev), startTimeOf(next)],
    ['endTime', endTimeOf(prev), endTimeOf(next)]
  ];
  return fields.filter(([, before, after]) => String(before) !== String(after)).map(([field, before, after]) => ({ field, before, after }));
}

function changeTypeFor(record = {}, fields = []) {
  const status = cleanText(record.status || record.orderStatus);
  if (/退款/.test(status)) return 'refunded';
  if (/取消|作废/.test(status)) return 'cancelled';
  if (fields.some(row => row.field === 'amount')) return 'amount_changed';
  if (fields.some(row => ['date', 'venue', 'startTime', 'endTime'].includes(row.field))) return 'booking_changed';
  if (fields.some(row => row.field === 'remark')) return 'remark_changed';
  return 'updated';
}

function buildThirdPartyChangeRows({ sourceRecords = [], previousRawRecords = [], batchId = '', now = '' } = {}) {
  const previousMap = latestRawBySource(previousRawRecords);
  const rows = [];
  for (const record of sourceRecords || []) {
    const sourceType = normalizeSourceType(record.sourceType);
    const sourceRecordId = recordSourceId(record);
    const previous = previousMap.get(`${sourceType}|${sourceRecordId}`);
    if (!previous) continue;
    const currentHash = stableHash(record);
    if (previous.rawHash === currentHash) continue;
    const previousRaw = previous.rawJson || {};
    const fields = changedFieldsFor(previousRaw, record);
    rows.push({
      id: `${batchId}-change-${stableHash({ sourceRecordId, currentHash }).slice(0, 16)}`,
      batchId,
      sourceSystem: 'changxiaoer',
      sourceType,
      sourceRecordId,
      changeType: changeTypeFor(record, fields),
      changedFields: fields,
      previousRaw,
      currentRaw: record,
      previousBatchId: previous.batchId || '',
      detectedAt: now,
      status: 'pending_review'
    });
  }
  return rows;
}

function buildThirdPartyFinanceSnapshot({ courts = [], financialLedger = [], schedule = [], membershipAccounts = [], now = '' } = {}) {
  const activeLedger = (financialLedger || []).filter(row => !['voided', 'rolled_back'].includes(String(row.status || 'active')));
  const centsToMoney = value => Math.round((Number(value || 0) || 0)) / 100;
  return {
    capturedAt: now,
    courtCount: (courts || []).length,
    courtHistoryCount: (courts || []).reduce((sum, row) => sum + (Array.isArray(row.history) ? row.history.length : 0), 0),
    financialLedgerCount: activeLedger.length,
    cashDelta: centsToMoney(activeLedger.reduce((sum, row) => sum + Number(row.cashDelta || 0), 0)),
    recognizedRevenueDelta: centsToMoney(activeLedger.reduce((sum, row) => sum + Number(row.recognizedRevenueDelta || 0), 0)),
    scheduleCount: (schedule || []).length,
    membershipAccountCount: (membershipAccounts || []).length
  };
}

function hasLaterCourtChange(current = {}, previous = {}, operationId = '') {
  const previousHistory = Array.isArray(previous.history) ? previous.history : [];
  const currentHistory = Array.isArray(current.history) ? current.history : [];
  const previousIds = new Set(previousHistory.map(row => String(row.id || '')));
  return currentHistory.some(row => String(row.operationId || '') !== operationId && !previousIds.has(String(row.id || '')));
}

function rollbackCourtImportRow(current = {}, previous = {}, operationId = '', nowValue = '') {
  if (hasLaterCourtChange(current, previous, operationId)) {
    const err = new Error('订场用户已有后续人工变更，不能自动回滚');
    err.statusCode = 409;
    throw err;
  }
  const currentHistory = Array.isArray(current.history) ? current.history : [];
  return {
    ...current,
    history: currentHistory.filter(row => String(row.operationId || '') !== operationId),
    updatedAt: nowValue
  };
}

function rollbackScheduleImportRow(current = {}, operationId = '', nowValue = '') {
  const imports = Array.isArray(current.thirdPartySyncImports) ? current.thirdPartySyncImports : [];
  return {
    ...current,
    thirdPartySyncImports: imports.filter(row => String(row.operationId || '') !== operationId),
    updatedAt: nowValue
  };
}

function scheduleDateOf(row = {}) {
  return cleanText(row.date || row.scheduleDate || row.startDate || row.startTime).slice(0, 10);
}

function scheduleClockOf(value = '') {
  const m = cleanText(value).match(/(\d{1,2}:\d{2})/);
  return m ? m[1].padStart(5, '0') : '';
}

function assertScheduleMatchesImportItem(schedule = {}, item = {}) {
  const mismatches = [];
  if (item.date && scheduleDateOf(schedule) !== item.date) mismatches.push('日期不一致');
  if (item.startTime && scheduleClockOf(schedule.startTime || schedule.startClock || schedule.beginTime) !== item.startTime) mismatches.push('开始时间不一致');
  if (item.endTime && scheduleClockOf(schedule.endTime || schedule.endClock || schedule.finishTime) !== item.endTime) mismatches.push('结束时间不一致');
  if (item.venue && cleanText(schedule.venue || schedule.court || schedule.courtName) !== item.venue) mismatches.push('场地不一致');
  if (mismatches.length) throw new Error(`绑定排课${mismatches.join('、')}`);
}

function buildCourtHistoryForImport(item = {}, trace = {}, now = '') {
  const isInternal = item.finalType === '内部占用';
  return {
    id: `third-party-sync-${item.sourceRecordId}`,
    date: item.date,
    occurredDate: item.date,
    type: '消费',
    category: isInternal ? '内部占用' : '订场',
    payMethod: isInternal ? '不涉及支付' : payMethodForImport(item),
    amount: isInternal ? 0 : Number(item.amount || 0) || 0,
    venue: item.venue,
    startTime: item.startTime,
    endTime: item.endTime,
    note: item.confirmation?.confirmNote || item.remark || item.plannedAction || '第三方同步导入',
    source: 'third-party-sync',
    sourceSystem: 'changxiaoer',
    sourceRecordId: item.sourceRecordId,
    sourceType: item.sourceType,
    importedAt: now,
    ...trace
  };
}

function buildFinancialLedgerForImport(item = {}, trace = {}, now = '') {
  if (!item.targetTables.includes(T_FINANCIAL_LEDGER)) return null;
  const amount = Number(item.amount || 0) || 0;
  const payMethod = payMethodForImport(item);
  const isStoredValue = payMethod === '储值扣款';
  return {
    id: `third-party-sync-finance-${item.sourceRecordId}`,
    ledgerVersion: 'third-party-sync-v2',
    status: 'active',
    businessDate: item.date || now.slice(0, 10),
    createdAt: now,
    updatedAt: now,
    businessType: isStoredValue ? '会员订场' : '散客订场',
    transactionType: '收款',
    cashDelta: isStoredValue ? 0 : cents(amount),
    recognizedRevenueDelta: cents(amount),
    deferredRevenueDelta: isStoredValue ? -cents(amount) : 0,
    refundDelta: 0,
    paymentMethod: payMethod,
    paymentChannel: payMethod,
    sourceType: 'third-party-sync',
    sourceId: item.sourceRecordId,
    idempotencyKey: `third-party-sync|${item.batchId}|${item.sourceRecordId}`,
    operator: trace.operationBy || '',
    sourceSnapshot: {
      batchId: item.batchId,
      sourceRecordId: item.sourceRecordId,
      finalType: item.finalType,
      date: item.date,
      startTime: item.startTime,
      endTime: item.endTime,
      venue: item.venue
    },
    ...trace
  };
}

async function defaultWriteThirdPartyImportItem(item = {}, context = {}) {
  const { getCachedScan, getCachedRow, put, uuidv4, normalizeCourtRecord = row => row, now = '', trace = {}, tables = {} } = context;
  const written = [];
  if (item.finalType === '会员余额订场') throw new Error('会员余额订场需会员流水审计链，暂不支持自动导入');
  if (item.finalType === '排课占场') {
    const scheduleId = cleanText(item.confirmation?.bindTargetId || item.bindTargetId);
    if (!scheduleId) throw new Error('排课占场缺少绑定排课ID');
    const table = tables.T_SCHEDULE || T_SCHEDULE;
    const schedule = await getCachedRow(table, scheduleId).catch(() => null);
    if (!schedule) throw new Error('绑定排课不存在');
    assertScheduleMatchesImportItem(schedule, item);
    const imports = Array.isArray(schedule.thirdPartySyncImports) ? schedule.thirdPartySyncImports : [];
    const next = { ...schedule, thirdPartySyncImports: [...imports, { batchId: item.batchId, sourceRecordId: item.sourceRecordId, operationId: trace.operationId || '', importedAt: now }], updatedAt: now, ...trace };
    await put(table, schedule.id, next);
    written.push({ table, id: schedule.id, sourceRecordId: item.sourceRecordId });
    return written;
  }

  const courtTable = tables.T_COURTS || T_COURTS;
  const financeTable = tables.T_FINANCIAL_LEDGER || T_FINANCIAL_LEDGER;
  const courts = await getCachedScan(courtTable).catch(() => []);
  const bindId = cleanText(item.confirmation?.bindTargetId || item.bindTargetId);
  const court = courts.find(row => bindId && String(row.id) === bindId)
    || courts.find(row => item.phone && String(row.phone || '').trim() === String(item.phone).trim())
    || { id: bindId || `third-party-court-${uuidv4()}`, name: item.customerName || '第三方订场用户', phone: item.phone || '', status: 'active', history: [], createdAt: now };
  const existingHistory = Array.isArray(court.history) ? court.history : [];
  const historyRow = buildCourtHistoryForImport(item, trace, now);
  const nextCourt = normalizeCourtRecord({ ...court, history: [...existingHistory.filter(row => String(row.sourceRecordId || '') !== item.sourceRecordId), historyRow], updatedAt: now }, { allowNegativeBalance: true });
  await put(courtTable, nextCourt.id, nextCourt);
  written.push({ table: courtTable, id: nextCourt.id, sourceRecordId: item.sourceRecordId });

  const ledger = buildFinancialLedgerForImport(item, trace, now);
  if (ledger) {
    await put(financeTable, ledger.id, ledger);
    written.push({ table: financeTable, id: ledger.id, sourceRecordId: item.sourceRecordId });
  }
  return written;
}

function verifyThirdPartyImportResult({ plan = {}, writtenIds = [], failed = [] } = {}) {
  const tables = new Set(writtenIds.map(row => row.table));
  return {
    finance: { checked: true, ok: !failed.length && (!plan.importable.some(item => item.targetTables.includes(T_FINANCIAL_LEDGER)) || tables.has(T_FINANCIAL_LEDGER)) },
    courts: { checked: true, ok: !failed.length && (!plan.importable.some(item => item.targetTables.includes(T_COURTS)) || tables.has(T_COURTS)) },
    membership: { checked: true, ok: !plan.blocked.some(item => item.finalType === '会员余额订场'), note: plan.blocked.some(item => item.finalType === '会员余额订场') ? '会员余额订场已阻断，等待会员流水审计链' : '本批次无会员余额订场' },
    schedule: { checked: true, ok: !failed.length, note: plan.importable.some(item => item.targetTables.includes(T_SCHEDULE)) ? '已检查排课绑定计划' : '本批次无排课写入' }
  };
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
    getCachedRow = async () => null,
    put = async () => {},
    del = async () => {},
    mkTable = async () => {},
    uuidv4 = () => crypto.randomUUID(),
    normalizeCourtRecord = row => row,
    writeImportItem = defaultWriteThirdPartyImportItem,
    fetchThirdPartyData = fetchChangxiaoerData,
    now = () => new Date().toISOString(),
    env = process.env,
    tables = {}
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
    const scopedRecords = (fetched.records || []).filter(record => recordWithinRange(record, rangeStart, rangeEnd));
    const sourceRecords = [
      ...scopedRecords,
      ...(fetched.gaps || []).map(gap => ({ sourceType: `${gap}-gap`, thirdPartyId: `${gap}-gap`, riskReason: '会员流水批量接口缺口' }))
    ];
    const previousRawRecords = await getCachedScan(T_THIRD_PARTY_SYNC_RAW_RECORDS).catch(() => []);
    const batchId = `cxe-sync-${String(rangeStart).slice(0, 10).replace(/-/g, '')}-${uuidv4()}`;
    const precheck = precheckThirdPartyRecords(sourceRecords, { batchId, now: pulledAt });
    const changes = buildThirdPartyChangeRows({ sourceRecords, previousRawRecords, batchId, now: pulledAt });
    const financeImpact = precheck.items.reduce((acc, item) => ({
      cashDelta: acc.cashDelta + Number(item.financeImpact?.cashDelta || 0),
      recognizedRevenueDelta: acc.recognizedRevenueDelta + Number(item.financeImpact?.recognizedRevenueDelta || 0),
      deferredRevenueDelta: acc.deferredRevenueDelta + Number(item.financeImpact?.deferredRevenueDelta || 0)
    }), { cashDelta: 0, recognizedRevenueDelta: 0, deferredRevenueDelta: 0 });
    const batch = { ...buildThirdPartySyncBatch({ id: batchId, rangeStart, rangeEnd, now: pulledAt, counts: precheck.counts, financeImpact }), changeCount: changes.length, createdBy: operator };
    await put(T_THIRD_PARTY_SYNC_BATCHES, batch.id, batch);
    await Promise.all(sourceRecords.map((record, index) => {
      const row = rawRecordRow(record, { batchId, now: pulledAt, index });
      return put(T_THIRD_PARTY_SYNC_RAW_RECORDS, row.id, row);
    }));
    await Promise.all(precheck.items.map(row => put(T_THIRD_PARTY_SYNC_PRECHECKS, row.id, row)));
    await Promise.all(changes.map(row => put(T_THIRD_PARTY_SYNC_CHANGES, row.id, row)));
    return { batch, precheck, changes };
  }

  async function buildCurrentFinanceSnapshot(importedAt = now()) {
    const [courts, financialLedger, schedule, membershipAccounts] = await Promise.all([
      getCachedScan(tables.T_COURTS || T_COURTS).catch(() => []),
      getCachedScan(tables.T_FINANCIAL_LEDGER || T_FINANCIAL_LEDGER).catch(() => []),
      getCachedScan(tables.T_SCHEDULE || T_SCHEDULE).catch(() => []),
      getCachedScan(tables.T_MEMBERSHIP_ACCOUNTS || T_MEMBERSHIP_ACCOUNTS).catch(() => [])
    ]);
    return buildThirdPartyFinanceSnapshot({ courts, financialLedger, schedule, membershipAccounts, now: importedAt });
  }

  async function createImportAlerts({ batchId = '', plan = {}, changes = [], result = null, operator = 'system', nowValue = now() } = {}) {
    const alerts = [];
    const pushAlert = reason => {
      const text = cleanText(reason);
      if (!text) return;
      alerts.push({
        id: `cxe-alert-${uuidv4()}`,
        batchId,
        operationId: result?.operationId || '',
        reason: text,
        status: 'open',
        createdAt: nowValue,
        createdBy: operator
      });
    };
    for (const row of plan.blocked || []) pushAlert(row.reason || row.riskReason || '低置信数据待确认');
    for (const row of plan.skipped || []) {
      if (/取消|退款|作废/.test(String(row.reason || row.riskReason || row.plannedAction || ''))) pushAlert(row.reason || row.riskReason || row.plannedAction);
    }
    for (const row of changes || []) pushAlert(`第三方${row.changeType === 'cancelled' ? '取消' : row.changeType === 'refunded' ? '退款' : '变更'}：${row.sourceRecordId}`);
    for (const row of result?.failed || []) pushAlert(row.reason || '导入失败');
    await Promise.all(alerts.map(row => put(T_THIRD_PARTY_SYNC_ALERTS, row.id, row)));
    return alerts;
  }

  async function runImportForBatch({ batchId = '', operator = 'admin', importedAt = now() } = {}) {
    const [batches, prechecks, confirmations, importResults] = await Promise.all([
      getCachedScan(T_THIRD_PARTY_SYNC_BATCHES).catch(() => []),
      getCachedScan(T_THIRD_PARTY_SYNC_PRECHECKS).catch(() => []),
      getCachedScan(T_THIRD_PARTY_SYNC_CONFIRMATIONS).catch(() => []),
      getCachedScan(T_THIRD_PARTY_SYNC_IMPORT_RESULTS).catch(() => [])
    ]);
    const batch = batches.find(row => String(row.batchId || row.id || '') === batchId);
    if (!batch) {
      const err = new Error('同步批次不存在');
      err.statusCode = 404;
      throw err;
    }
    const plan = buildThirdPartyImportPlan({ batchId, prechecks, confirmations, importResults });
    const operationId = `third-party-sync-import-${uuidv4()}`;
    const trace = buildImportTrace({ batchId, operationId, operator, now: importedAt });
    const financeBefore = await buildCurrentFinanceSnapshot(importedAt);
    const backupTables = [T_COURTS, T_FINANCIAL_LEDGER, T_SCHEDULE, T_MEMBERSHIP_ACCOUNTS, T_THIRD_PARTY_SYNC_IMPORT_RESULTS];
    const backup = await buildImportBackup({ getCachedScan, put, uuidv4, batchId, operationId, operator: trace.operationBy, tables: backupTables, now: importedAt });
    const writtenIds = [];
    const failed = [];
    for (const item of plan.importable) {
      try {
        const rows = await writeImportItem(item, { getCachedScan, getCachedRow, put, uuidv4, normalizeCourtRecord, now: importedAt, trace, tables });
        writtenIds.push(...(rows || []));
      } catch (err) {
        failed.push({ sourceRecordId: item.sourceRecordId, reason: err.message || '导入失败' });
      }
    }
    const writtenTables = [...new Set(writtenIds.map(row => row.table))];
    const verification = verifyThirdPartyImportResult({ plan, writtenIds, failed });
    const hasBlocked = plan.blocked.length > 0;
    const importStatus = failed.length
      ? (writtenIds.length ? 'partial_failed' : 'failed')
      : (hasBlocked ? (writtenIds.length ? 'partial_completed' : 'paused') : 'completed');
    const financeAfter = await buildCurrentFinanceSnapshot(importedAt);
    const result = {
      id: `cxe-import-${uuidv4()}`,
      batchId,
      operationId,
      status: importStatus,
      importedAt,
      importedBy: operator,
      plannedCount: plan.importable.length,
      writtenTables,
      writtenIds,
      skippedIds: [...plan.blocked, ...plan.skipped].map(row => ({ sourceRecordId: row.sourceRecordId, reason: row.reason || row.riskReason || '跳过' })),
      failed,
      backupFile: `table:${T_THIRD_PARTY_SYNC_IMPORT_BACKUPS}/${backup.backupId}`,
      backup,
      reportFile: `table:${T_THIRD_PARTY_SYNC_IMPORT_RESULTS}`,
      verifiedAt: importedAt,
      verification,
      financeSnapshot: { before: financeBefore, after: financeAfter }
    };
    await put(T_THIRD_PARTY_SYNC_IMPORT_RESULTS, result.id, result);
    await put(T_THIRD_PARTY_SYNC_BATCHES, batch.id || batch.batchId, { ...batch, status: result.status === 'completed' ? 'completed' : 'paused', importedAt, confirmedBy: result.importedBy });
    return { success: ['completed', 'partial_completed'].includes(result.status), plan, result };
  }

  async function rollbackImportOperation({ operationId = '', operator = 'admin', rolledBackAt = now() } = {}) {
    const [importResults, backupRows] = await Promise.all([
      getCachedScan(T_THIRD_PARTY_SYNC_IMPORT_RESULTS).catch(() => []),
      getCachedScan(T_THIRD_PARTY_SYNC_IMPORT_BACKUPS).catch(() => [])
    ]);
    const result = importResults.find(row => String(row.operationId || '') === operationId);
    if (!result) {
      const err = new Error('导入批次不存在');
      err.statusCode = 404;
      throw err;
    }
    if (result.status === 'rolled_back') return { success: true, rollback: null, result };
    const backupId = cleanText(result.backup?.backupId);
    if (!backupId) {
      const err = new Error('缺少导入前备份，不能回滚');
      err.statusCode = 400;
      throw err;
    }
    const restored = [];
    for (const written of result.writtenIds || []) {
      const table = cleanText(written.table);
      const id = cleanText(written.id);
      if (!table || !id) continue;
      const rows = backupRows
        .filter(row => String(row.backupId || '') === backupId && String(row.tableName || '') === table)
        .flatMap(row => Array.isArray(row.rows) ? row.rows : []);
      const previous = rows.find(row => String(row.id || '') === id);
      const current = await getCachedRow(table, id).catch(() => null);
      if (table === (tables.T_COURTS || T_COURTS) && current) {
        const next = rollbackCourtImportRow(current, previous || {}, operationId, rolledBackAt);
        if (next.history.length === 0 && !previous) {
          await del(table, id);
          restored.push({ table, id, action: 'delete_created_empty_court' });
        } else {
          await put(table, id, next);
          restored.push({ table, id, action: 'remove_imported_history' });
        }
      } else if (table === (tables.T_SCHEDULE || T_SCHEDULE) && current) {
        await put(table, id, rollbackScheduleImportRow(current, operationId, rolledBackAt));
        restored.push({ table, id, action: 'remove_schedule_import_mark' });
      } else if (previous) {
        await put(table, id, previous);
        restored.push({ table, id, action: 'restore_snapshot' });
      } else {
        await del(table, id);
        restored.push({ table, id, action: 'delete_created' });
      }
    }
    const rollback = {
      id: `cxe-rollback-${uuidv4()}`,
      batchId: result.batchId,
      operationId,
      rolledBackAt,
      rolledBackBy: operator,
      restored,
      status: 'completed'
    };
    await put(T_THIRD_PARTY_SYNC_ROLLBACKS, rollback.id, rollback);
    const nextResult = { ...result, status: 'rolled_back', rolledBackAt, rolledBackBy: operator };
    await put(T_THIRD_PARTY_SYNC_IMPORT_RESULTS, result.id, nextResult);
    const batches = await getCachedScan(T_THIRD_PARTY_SYNC_BATCHES).catch(() => []);
    const batch = batches.find(row => String(row.batchId || row.id || '') === String(result.batchId || ''));
    if (batch) await put(T_THIRD_PARTY_SYNC_BATCHES, batch.id || batch.batchId, { ...batch, status: 'rolled_back', rolledBackAt });
    return { success: true, rollback, result: nextResult };
  }

  return async function handleThirdPartySyncCenterRoutes({ path, method, body = {}, user, req, res, query = new URLSearchParams() }) {
    if (path === '/cron/third-party-sync-center' && method === 'GET') {
      if (!requireCronAccess(req, env)) return sendJson(res, { error: '无权限' }, 401);
      await init();
      const range = defaultDailyRange(new Date(), Number(query.get('lookbackDays') || 3));
      const pulled = await pullAndPrecheck({ ...range, operator: 'daily-auto-sync' });
      const autoImport = await runImportForBatch({ batchId: pulled.batch.batchId, operator: 'daily-auto-sync', importedAt: now() });
      const alerts = await createImportAlerts({ batchId: pulled.batch.batchId, plan: autoImport.plan, changes: pulled.changes, result: autoImport.result, operator: 'daily-auto-sync', nowValue: now() });
      return sendJson(res, { ...pulled, autoImport, alerts });
    }
    if (!path.startsWith('/third-party-sync')) return false;
    if (user?.role !== 'admin') return sendJson(res, { error: '无权限' }, 403);
    await init();
    await ensureTables();
    if (path === '/third-party-sync/overview' && method === 'GET') {
      const [batches, rawRecords, prechecks, confirmations, importResults, changes, alerts, rollbacks] = await Promise.all([
        getCachedScan(T_THIRD_PARTY_SYNC_BATCHES).catch(() => []),
        getCachedScan(T_THIRD_PARTY_SYNC_RAW_RECORDS).catch(() => []),
        getCachedScan(T_THIRD_PARTY_SYNC_PRECHECKS).catch(() => []),
        getCachedScan(T_THIRD_PARTY_SYNC_CONFIRMATIONS).catch(() => []),
        getCachedScan(T_THIRD_PARTY_SYNC_IMPORT_RESULTS).catch(() => []),
        getCachedScan(T_THIRD_PARTY_SYNC_CHANGES).catch(() => []),
        getCachedScan(T_THIRD_PARTY_SYNC_ALERTS).catch(() => []),
        getCachedScan(T_THIRD_PARTY_SYNC_ROLLBACKS).catch(() => [])
      ]);
      const latestBatch = [...batches].sort((a, b) => String(b.pulledAt || '').localeCompare(String(a.pulledAt || '')))[0] || null;
      const latestBatchId = cleanText(latestBatch?.batchId || latestBatch?.id);
      const currentRawRecords = latestBatchId ? rawRecords.filter(row => String(row.batchId || '') === latestBatchId) : rawRecords;
      const currentPrechecks = latestBatchId ? prechecks.filter(row => String(row.batchId || '') === latestBatchId) : prechecks;
      const currentImportResults = latestBatchId ? importResults.filter(row => String(row.batchId || '') === latestBatchId) : importResults;
      const currentChanges = latestBatchId ? changes.filter(row => String(row.batchId || '') === latestBatchId) : changes;
      const currentAlerts = latestBatchId ? alerts.filter(row => String(row.batchId || '') === latestBatchId) : alerts;
      const currentRollbacks = latestBatchId ? rollbacks.filter(row => String(row.batchId || '') === latestBatchId) : rollbacks;
      const summary = {
        batchCount: batches.length,
        currentBatchId: latestBatchId,
        rawCount: currentRawRecords.length,
        autoImportCount: currentPrechecks.filter(row => row.recommendedType === 'auto_import').length,
        pendingCount: currentPrechecks.filter(row => row.needsConfirmation || row.recommendedType === 'needs_confirmation').length,
        exceptionCount: currentPrechecks.filter(row => row.recommendedType === 'high_risk_exception').length,
        duplicateCount: currentPrechecks.filter(row => row.recommendedType === 'duplicate_skip').length,
        importedCount: currentImportResults.filter(row => ['completed', 'partial_completed'].includes(row.status)).length,
        failedImportCount: currentImportResults.filter(row => row.status === 'partial_failed' || row.status === 'failed').length,
        changeCount: currentChanges.length,
        openAlertCount: currentAlerts.filter(row => row.status !== 'closed').length,
        rollbackCount: currentRollbacks.length
      };
      return sendJson(res, { summary, batches, rawRecords, prechecks, confirmations, importResults, changes, alerts, rollbacks });
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
    if (path === '/third-party-sync/import-plan' && method === 'POST') {
      const [prechecks, confirmations, importResults] = await Promise.all([
        getCachedScan(T_THIRD_PARTY_SYNC_PRECHECKS).catch(() => []),
        getCachedScan(T_THIRD_PARTY_SYNC_CONFIRMATIONS).catch(() => []),
        getCachedScan(T_THIRD_PARTY_SYNC_IMPORT_RESULTS).catch(() => [])
      ]);
      return sendJson(res, { plan: buildThirdPartyImportPlan({ batchId: cleanText(body.batchId), prechecks, confirmations, importResults }) });
    }
    if (path === '/third-party-sync/import' && method === 'POST') {
      const batchId = cleanText(body.batchId);
      if (!batchId) return sendJson(res, { error: '缺少批次 ID' }, 400);
      try {
        const payload = await runImportForBatch({ batchId, operator: user.name || user.id || 'admin', importedAt: now() });
        const changes = await getCachedScan(T_THIRD_PARTY_SYNC_CHANGES).catch(() => []);
        await createImportAlerts({ batchId, plan: payload.plan, changes: changes.filter(row => row.batchId === batchId), result: payload.result, operator: user.name || user.id || 'admin', nowValue: now() });
        return sendJson(res, payload);
      } catch (err) {
        return sendJson(res, { error: err.message || '导入失败' }, err.statusCode || 500);
      }
    }
    if (path === '/third-party-sync/rollback' && method === 'POST') {
      const operationId = cleanText(body.operationId);
      if (!operationId) return sendJson(res, { error: '缺少操作 ID' }, 400);
      try {
        return sendJson(res, await rollbackImportOperation({ operationId, operator: user.name || user.id || 'admin', rolledBackAt: now() }));
      } catch (err) {
        return sendJson(res, { error: err.message || '回滚失败' }, err.statusCode || 500);
      }
    }
    return false;
  };
}

module.exports = {
  createThirdPartySyncCenterRoutes,
  buildThirdPartySyncBatch,
  precheckThirdPartyRecords,
  buildThirdPartyImportPlan,
  fetchChangxiaoerData,
  defaultDailyRange,
  THIRD_PARTY_SYNC_TABLES,
  T_THIRD_PARTY_SYNC_BATCHES,
  T_THIRD_PARTY_SYNC_RAW_RECORDS,
  T_THIRD_PARTY_SYNC_PRECHECKS,
  T_THIRD_PARTY_SYNC_CONFIRMATIONS,
  T_THIRD_PARTY_SYNC_IMPORT_RESULTS
};
