const crypto = require('crypto');
const axios = require('axios');
const { parseBookingStructureFromText, enrichCourtBookingStructure, missingCourtBookingStructure } = require('./booking-structure-parser.js');

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
const T_COACHES = 'ft_coaches';
const T_STUDENTS = 'ft_students';
const THIRD_PARTY_SCHEDULE_DEFAULT_CAMPUS = 'shunyi_mapo';
const THIRD_PARTY_SCHEDULE_DEFAULT_CAMPUS_NAME = '顺义马坡';
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
const THIRD_PARTY_LOCK_RULES = Object.freeze([
  { id: 'internal-occupancy', pattern: /清洗|打扫|维修|维护|施工|领导|内部使用/, finalType: '内部占用', businessCategory: '内部占用', processLayer: 'occupancy', paymentMethod: '不涉及支付' },
  { id: 'coach-booking-xiaozhe', pattern: /晓哲|小哲/, requirePattern: /定场|订场/, finalType: '教练代订场', businessCategory: '教练代订场', processLayer: 'booking_finance', paymentMethod: '微信转账' },
  { id: 'ball-machine', pattern: /发球机/, finalType: '订场+发球机', businessCategory: '订场+发球机', processLayer: 'booking_extra_service', serviceType: '发球机' },
  { id: 'companion', pattern: /陪打/, finalType: '订场陪打', businessCategory: '订场陪打', processLayer: 'booking_extra_service', serviceType: '陪打' },
  { id: 'changda', pattern: /畅打|4人畅打|四人畅打/, finalType: '畅打活动', businessCategory: '畅打活动', processLayer: 'activity_occupancy', paymentMethod: '微信转账' },
  { id: 'schedule-occupancy', pattern: /私教课|体验课|亲子课|上课|小班|训练营|训练课|小朋友|成人课|成人\s*$/, finalType: '排课占场', businessCategory: '排课占场', processLayer: 'schedule', paymentMethod: '不涉及支付' },
  { id: 'voucher-booking', pattern: /大众点评|大众券码|点评券|大众券|美团券|团购|核销|券/, finalType: '大众点评券码订场', businessCategory: '第三方券码订场', processLayer: 'booking_finance', paymentMethod: '大众点评券码' }
]);

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

function defaultDailyRange(now = new Date()) {
  const today = chinaDateKey(now);
  const yesterday = addDays(today, -1);
  return {
    rangeStart: `${yesterday} 00:00:00`,
    rangeEnd: `${today} 00:00:00`
  };
}

function normalizeSourceType(value) {
  const text = cleanText(value).toLowerCase();
  if (['order', 'lock', 'member', 'refund', 'member-ledger-gap'].includes(text)) return text;
  return text || 'other';
}

function isBookingSourceType(sourceType = '') {
  return ['order', 'lock'].includes(normalizeSourceType(sourceType));
}

function isSyncGapSourceType(sourceType = '') {
  return /-gap$/.test(normalizeSourceType(sourceType));
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

function periodInfoItems(record = {}) {
  const info = record.periodsInfo || record.periodInfo || record.periods;
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
  return cleanText(orderInfoDate(record) || record.usageDate || record.bookingDate || record.useDate || record.date || record.startDate || parsedBookingStructureOf(record).date || '').slice(0, 10);
}

function venueOf(record = {}) {
  const orderPlace = orderInfoItems(record).map(item => item?.priceBasicsInfo?.placeName || item?.placeName || item?.courtName).find(Boolean);
  const periodPlace = periodInfoItems(record).map(item => item?.priceBasicsInfo?.placeName || item?.placeName || item?.courtName).find(Boolean);
  const spacePlace = record.space && typeof record.space === 'object' ? record.space.placeName || record.space.courtName : '';
  const raw = cleanText(record.venue || record.court || record.courtName || orderPlace || periodPlace || spacePlace || record.spaceName || record.placeName);
  if (!raw) return parsedBookingStructureOf(record).venue || '';
  if (/^\d+$/.test(raw)) return `${raw}号场`;
  if (/^\d+号$/.test(raw)) return `${raw}场`;
  if (/室内\s*(\d+)/.test(raw)) return raw.replace(/.*室内\s*(\d+).*/, '$1号场');
  return raw;
}

function startTimeOf(record = {}) {
  const regions = orderInfoRegions(record);
  if (regions.length) return regions.map(row => row.start).sort()[0] || '';
  const periods = periodInfoItems(record).map(item => cleanText(item.startTime || item.startClock || item.beginTime)).filter(Boolean);
  if (periods.length) return periods.map(value => value.match(/(\d{1,2}:\d{2})/)?.[1]?.padStart(5, '0')).filter(Boolean).sort()[0] || '';
  const value = cleanText(record.startTime || record.startClock || record.beginTime || '');
  const m = value.match(/(\d{1,2}:\d{2})/);
  return m ? m[1].padStart(5, '0') : parsedBookingStructureOf(record).startTime;
}

function endTimeOf(record = {}) {
  const regions = orderInfoRegions(record);
  if (regions.length) return regions.map(row => row.end).sort().slice(-1)[0] || '';
  const periods = periodInfoItems(record).map(item => cleanText(item.endTime || item.endClock || item.finishTime)).filter(Boolean);
  if (periods.length) return periods.map(value => value.match(/(\d{1,2}:\d{2})/)?.[1]?.padStart(5, '0')).filter(Boolean).sort().slice(-1)[0] || '';
  const value = cleanText(record.endTime || record.endClock || record.finishTime || '');
  const m = value.match(/(\d{1,2}:\d{2})/);
  return m ? m[1].padStart(5, '0') : parsedBookingStructureOf(record).endTime;
}

function customerNameOf(record = {}) {
  return cleanText(record.customerName || record.userName || record.memberName || record.realName || record.name || record.contactName || record.nickName || record.customer?.customerName || record.customer?.name);
}

function normalizeThirdPartyPhone(value = '') {
  const digits = cleanText(value).replace(/[^\d]/g, '');
  if (/^86(1[3-9]\d{9})$/.test(digits)) return digits.slice(2);
  return digits || cleanText(value);
}

function phoneOf(record = {}) {
  return normalizeThirdPartyPhone(record.phone || record.mobile || record.userPhone || record.memberPhone || record.contactPhone || record.customer?.phoneNumber?.phoneNumber || record.customer?.phoneNumber || record.customer?.phone);
}

function remarkOf(record = {}) {
  const orderRemark = orderInfoItems(record).map(item => item.remark || item.userRemark || item.note || item.description).find(Boolean);
  return cleanText(record.remark || record.userRemark || record.note || record.description || record.memo || record.reason || record.occupyReason || record.lockReason || orderRemark);
}

function parsedBookingStructureOf(record = {}) {
  return parseBookingStructureFromText([
    remarkOf(record),
    record.time,
    record.timeRegion,
    record.period,
    record.sourceTimeBand,
    record.sourceVenue,
    record.spaceName,
    record.placeName
  ].map(cleanText).filter(Boolean).join('；'));
}

function bookingModeOf(record = {}) {
  const sourceType = normalizeSourceType(record.sourceType);
  if (sourceType === 'lock') return '运营锁场';
  if (sourceType === 'order') return '用户自助订场';
  return '第三方记录';
}

function operatorAccountOf(record = {}) {
  const operator = record.operator && typeof record.operator === 'object' ? record.operator.operatorName || record.operator.name : record.operator;
  return cleanText(record.operatorName || operator || record.adminName || record.creatorName || record.createdByName || record.createName || record.accountName || record.userAccount || record.createUserName || record.staffName);
}

function amountOf(record = {}) {
  const raw = Number(record.amount || record.siteAmount || record.paidAmount || record.actualAmount || record.payAmount || 0) || 0;
  const looksLikeCentAmount = raw >= 1000 && (Array.isArray(record.orderInfo) || record.siteAmount != null || record.wechatPaymentAmount != null || record.balancePaymentAmount != null);
  return looksLikeCentAmount ? Math.round(raw) / 100 : raw;
}

function moneyValueFromText(text = '', labels = []) {
  const source = cleanText(text);
  for (const label of labels) {
    const after = source.match(new RegExp(`${label}[^0-9]{0,12}(\\d+(?:\\.\\d+)?)\\s*元?`));
    if (after) return Number(after[1]) || 0;
    const before = source.match(new RegExp(`(\\d+(?:\\.\\d+)?)\\s*元?[^0-9]{0,12}${label}`));
    if (before) return Number(before[1]) || 0;
  }
  return 0;
}

function extraServiceBreakdown(record = {}, finalType = '') {
  const total = amountOf(record);
  const text = [remarkOf(record), cleanText(record.payRemark || record.paymentRemark || record.description)].filter(Boolean).join(' ');
  const serviceLabels = finalType === '订场+发球机' ? ['发球机'] : finalType === '订场陪打' ? ['陪打'] : [];
  if (!serviceLabels.length || total <= 0) return null;
  const serviceAmount = moneyValueFromText(text, serviceLabels);
  const bookingAmount = moneyValueFromText(text, ['订场', '定场', '场地', '场地费']);
  if (serviceAmount > 0 && bookingAmount > 0 && Math.round((serviceAmount + bookingAmount) * 100) <= Math.round(total * 100)) {
    return {
      bookingAmount,
      serviceAmount,
      serviceType: serviceLabels[0],
      totalAmount: Math.round((bookingAmount + serviceAmount) * 100) / 100
    };
  }
  return null;
}

function recordWithinRange(record = {}, rangeStart = '', rangeEnd = '') {
  const date = bookingDateOf(record);
  const start = cleanText(rangeStart).slice(0, 10);
  const end = cleanText(rangeEnd).slice(0, 10);
  if (!date || !start || !end) return true;
  if (/00:00(?::00)?$/.test(cleanText(rangeEnd)) && end > start) return date >= start && date < end;
  return date >= start && date <= end;
}

function uniqueBookingKey(record = {}) {
  const date = bookingDateOf(record);
  const venue = venueOf(record);
  const start = startTimeOf(record);
  const end = endTimeOf(record);
  return date && venue && start && end ? `${date}|${venue}|${start}|${end}` : '';
}

function ruleBasePayload(record = {}, overrides = {}) {
  return {
    businessCategory: overrides.businessCategory || '',
    processLayer: overrides.processLayer || '',
    suggestedFinalType: overrides.suggestedFinalType || '',
    paymentMethod: overrides.paymentMethod || '',
    amountBreakdown: overrides.amountBreakdown || null,
    ...overrides
  };
}

function lockRuleText(record = {}) {
  return [remarkOf(record), customerNameOf(record), operatorAccountOf(record)].filter(Boolean).join(' ');
}

function timeMinutes(value = '') {
  const m = cleanText(value).match(/(\d{1,2}):(\d{2})/);
  return m ? Number(m[1]) * 60 + Number(m[2]) : 0;
}

function isRepairInternalWindow(record = {}) {
  const date = bookingDateOf(record);
  if (date === '2026-08-03' || date === '2026-08-04') return true;
  if (date !== '2026-08-05') return false;
  const end = timeMinutes(endTimeOf(record));
  return end > 0 && end <= 12 * 60;
}

function isOperatorName(value = '') {
  return /运营|前台|管理员|客服/.test(cleanText(value));
}

function compactName(value = '') {
  return cleanText(value).replace(/\s+/g, '').toLowerCase();
}

function nameTokens(value = '') {
  return cleanText(value)
    .split(/[\s、,，/|;；:：()（）【】\[\]{}<>《》]+/)
    .map(compactName)
    .filter(Boolean);
}

function rowName(row = {}) {
  return cleanText(row.name || row.coachName || row.studentName || row.realName || row.nickname || row.displayName);
}

function rowIsActive(row = {}) {
  return !/inactive|disabled|deleted|voided|停用|删除|离职/.test(cleanText(row.status || row.state));
}

function textHasName(text = '', name = '') {
  const target = compactName(name);
  if (!target || !clearThirdPartyStudentNameForAutoMatch(name)) return false;
  return nameTokens(text).includes(target);
}

function clearThirdPartyStudentNameForAutoMatch(rawName = '') {
  const name = cleanText(rawName);
  const key = compactName(name);
  if (!key) return false;
  if (/^\d+人?$/.test(key)) return false;
  if (['朋友', '家长', '学员', '多人', '待定', '未知', '随到随学', '随到随学小班课', '多球课', '零基础'].includes(key)) return false;
  if (/畅打/.test(key)) return false;
  if (/[?？]/.test(name)) return false;
  if (/[、,，/&]/.test(name)) return false;
  return true;
}

function isOperatorAssistedBookingLock(record = {}) {
  const name = customerNameOf(record);
  const operator = operatorAccountOf(record);
  if (!name || !operator || remarkOf(record)) return false;
  if (name === operator) return false;
  if (isOperatorName(name)) return false;
  return isOperatorName(operator);
}

function classifyRecord(record = {}, duplicateKeys = new Set()) {
  const sourceType = normalizeSourceType(record.sourceType);
  const key = uniqueBookingKey(record);
  if (sourceType === 'member-ledger-gap') {
    return ruleBasePayload(record, { recommendedType: 'high_risk_exception', plannedAction: '暂不导入', confidence: 0, riskReason: '会员流水批量接口缺口', needsConfirmation: true, businessCategory: '会员流水缺口', processLayer: 'membership_ledger' });
  }
  if (['order', 'lock'].includes(sourceType) && (!bookingDateOf(record) || !venueOf(record) || !startTimeOf(record) || !endTimeOf(record))) {
    return ruleBasePayload(record, { recommendedType: 'high_risk_exception', plannedAction: '暂不导入', confidence: 0, riskReason: '缺日期/时间/场地', needsConfirmation: true, businessCategory: sourceType === 'lock' ? '运营锁场待补字段' : '订场待补字段', processLayer: 'booking' });
  }
  if (key && duplicateKeys.has(key)) {
    return ruleBasePayload(record, { recommendedType: 'duplicate_skip', plannedAction: '重复跳过', confidence: 0.9, riskReason: '同一日期场地时段重复', needsConfirmation: false, businessCategory: '重复占场', processLayer: 'booking' });
  }
  const remark = remarkOf(record);
  if (sourceType === 'lock') {
    const ruleText = lockRuleText(record);
    if (isRepairInternalWindow(record)) return ruleBasePayload(record, { recommendedType: 'auto_import', plannedAction: '按场地维修自动标记内部占用', confidence: 0.95, riskReason: '', needsConfirmation: false, businessCategory: '内部占用', processLayer: 'occupancy', suggestedFinalType: '内部占用', paymentMethod: '不涉及支付' });
    const rule = THIRD_PARTY_LOCK_RULES.find(item => item.pattern.test(item.id === 'coach-booking-xiaozhe' ? ruleText : remark) && (!item.requirePattern || item.requirePattern.test(ruleText)));
    if (rule?.id === 'internal-occupancy') return ruleBasePayload(record, { recommendedType: 'auto_import', plannedAction: '自动标记内部占场', confidence: 0.9, riskReason: '', needsConfirmation: false, businessCategory: rule.businessCategory, processLayer: rule.processLayer, suggestedFinalType: rule.finalType, paymentMethod: rule.paymentMethod });
    if (rule?.id === 'schedule-occupancy') return ruleBasePayload(record, { recommendedType: 'auto_import', plannedAction: '自动匹配已有排课，匹配不到则创建第三方同步排课', confidence: 0.85, riskReason: '', needsConfirmation: false, businessCategory: rule.businessCategory, processLayer: rule.processLayer, suggestedFinalType: rule.finalType, paymentMethod: rule.paymentMethod });
    if (rule?.id === 'changda') return ruleBasePayload(record, { recommendedType: 'auto_import', plannedAction: amountOf(record) > 0 ? '自动写畅打占场和活动收入' : '自动写畅打占场', confidence: 0.82, riskReason: '', needsConfirmation: false, businessCategory: rule.businessCategory, processLayer: rule.processLayer, suggestedFinalType: rule.finalType, paymentMethod: rule.paymentMethod });
    if (rule?.id === 'ball-machine' || rule?.id === 'companion') {
      const amountBreakdown = extraServiceBreakdown(record, rule.finalType);
      if (rule.id === 'ball-machine' && !amountBreakdown && /订场|定场/.test(ruleText) && amountOf(record) > 0) {
        return ruleBasePayload(record, {
          recommendedType: 'auto_import',
          plannedAction: '按订场导入，发球机免费赠送',
          confidence: 0.82,
          riskReason: '',
          needsConfirmation: false,
          businessCategory: '运营代订场',
          processLayer: 'booking_finance',
          suggestedFinalType: '散客微信转账订场',
          paymentMethod: '微信转账'
        });
      }
      return ruleBasePayload(record, {
        recommendedType: amountBreakdown ? 'auto_import' : 'needs_confirmation',
        plannedAction: amountBreakdown ? `自动拆分场地费和${rule.serviceType}费` : `确认场地费和${rule.serviceType}费拆分`,
        confidence: amountBreakdown ? 0.86 : 0.6,
        riskReason: amountBreakdown ? '' : `${rule.serviceType}额外服务需确认金额拆分`,
        needsConfirmation: !amountBreakdown,
        businessCategory: rule.businessCategory,
        processLayer: rule.processLayer,
        suggestedFinalType: rule.finalType,
        paymentMethod: '微信转账',
        amountBreakdown
      });
    }
    if (/晓哲|小哲/.test(ruleText) && /定场|订场/.test(ruleText)) {
      const hasAmount = amountOf(record) > 0;
      return ruleBasePayload(record, {
        recommendedType: hasAmount ? 'auto_import' : 'needs_confirmation',
        plannedAction: '按教练订场8折微信导入',
        confidence: hasAmount ? 0.9 : 0.65,
        riskReason: hasAmount ? '' : '教练代订场缺少确认金额',
        needsConfirmation: !hasAmount,
        businessCategory: '教练代订场',
        processLayer: 'booking_finance',
        suggestedFinalType: '教练代订场',
        paymentMethod: '微信转账'
      });
    }
    if (rule?.id === 'voucher-booking') return ruleBasePayload(record, { recommendedType: 'needs_confirmation', plannedAction: '确认券码来源和结算金额', confidence: 0.65, riskReason: '第三方券码结算金额需确认', needsConfirmation: true, businessCategory: rule.businessCategory, processLayer: rule.processLayer, suggestedFinalType: rule.finalType, paymentMethod: rule.paymentMethod });
    if (/订场|定场/.test(ruleText) && amountOf(record) > 0) return ruleBasePayload(record, { recommendedType: 'auto_import', plannedAction: '按第三方金额自动导入订场', confidence: 0.82, riskReason: '', needsConfirmation: false, businessCategory: '运营代订场', processLayer: 'booking_finance', suggestedFinalType: '散客微信转账订场', paymentMethod: '微信转账' });
    if (isOperatorAssistedBookingLock(record)) return ruleBasePayload(record, { recommendedType: 'auto_import', plannedAction: '按运营代订场写入订场用户，不自动补财务金额', confidence: 0.78, riskReason: '', needsConfirmation: false, businessCategory: '运营代订场', processLayer: 'booking', suggestedFinalType: '运营代订场', paymentMethod: amountOf(record) > 0 ? '微信转账' : '不涉及支付' });
    return ruleBasePayload(record, { recommendedType: 'needs_confirmation', plannedAction: '运营确认锁场类型', confidence: 0.45, riskReason: remark ? '锁场需确认业务归属' : '备注为空', needsConfirmation: true, businessCategory: '运营锁场待确认', processLayer: 'booking' });
  }
  if (sourceType === 'order') {
    const status = cleanText(record.status || record.orderStatus);
    if (/取消|退款|作废/.test(status)) return ruleBasePayload(record, { recommendedType: 'do_not_import', plannedAction: '暂不导入', confidence: 0.8, riskReason: '取消/退款订单', needsConfirmation: false, businessCategory: '取消/退款订场', processLayer: 'refund' });
    const payMethod = cleanText(record.payMethod || record.paymentMethod);
    const voucher = /大众点评|大众券码|点评券|大众券|美团券|团购|核销|券/.test(`${remark} ${payMethod}`);
    return ruleBasePayload(record, { recommendedType: 'auto_import', plannedAction: '生成导入计划', confidence: 0.85, riskReason: '', needsConfirmation: false, businessCategory: voucher ? '第三方券码订场' : '普通订场', processLayer: 'booking_finance', suggestedFinalType: voucher ? '大众点评券码订场' : '散客微信转账订场', paymentMethod: voucher ? '大众点评券码' : payMethod });
  }
  if (sourceType === 'member') {
    return ruleBasePayload(record, { recommendedType: 'needs_confirmation', plannedAction: '会员资料待核对', confidence: 0.5, riskReason: '会员流水未自动获取', needsConfirmation: true, businessCategory: '会员资料变更', processLayer: 'member_profile' });
  }
  return ruleBasePayload(record, { recommendedType: 'needs_confirmation', plannedAction: '运营确认', confidence: 0.3, riskReason: '来源类型不明', needsConfirmation: true, businessCategory: '未知第三方记录', processLayer: 'unknown' });
}

function financeImpactFor(record = {}, classification = {}) {
  if (!['auto_import', 'needs_confirmation'].includes(classification.recommendedType)) return { cashDelta: 0, recognizedRevenueDelta: 0, deferredRevenueDelta: 0 };
  const amount = amountOf(record);
  const payMethod = cleanText(record.payMethod || record.paymentMethod);
  if (classification.suggestedFinalType === '内部占用' || classification.businessCategory === '内部占用') return { cashDelta: 0, recognizedRevenueDelta: 0, deferredRevenueDelta: 0 };
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
      bookingMode: bookingModeOf(record),
      operatorAccount: operatorAccountOf(record),
      remark: remarkOf(record),
      amount: amountOf(record),
      amountBreakdown: classification.amountBreakdown,
      businessCategory: classification.businessCategory,
      processLayer: classification.processLayer,
      suggestedFinalType: classification.suggestedFinalType,
      paymentMethod: classification.paymentMethod || cleanText(record.payMethod || record.paymentMethod),
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
  return ['会员余额订场', '散客微信转账订场', '散客现金订场', '大众点评券码订场', '教练代订场', '订场陪打', '订场+发球机'].includes(cleanText(finalType));
}

function importTargetsFor({ sourceType = '', finalType = '', recommendedType = '', amount = 0 } = {}) {
  const type = cleanText(finalType);
  if (type === '排课占场') return [T_SCHEDULE];
  if (type === '内部占用') return [T_COURTS];
  if (type === '运营代订场') return Number(amount || 0) > 0 ? [T_COURTS, T_FINANCIAL_LEDGER] : [T_COURTS];
  if (type === '畅打活动') return Number(amount || 0) > 0 ? [T_COURTS, T_FINANCIAL_LEDGER] : [T_COURTS];
  if (type === '订场陪打') return [T_COURTS, T_FINANCIAL_LEDGER, T_SCHEDULE];
  if (['散客微信转账订场', '散客现金订场', '大众点评券码订场', '教练代订场', '订场+发球机'].includes(type)) return [T_COURTS, T_FINANCIAL_LEDGER];
  if (recommendedType === 'auto_import' && sourceType === 'lock') return [T_COURTS];
  if (recommendedType === 'auto_import' && sourceType === 'order') return [T_COURTS, T_FINANCIAL_LEDGER];
  return [];
}

function needsExtraServiceBreakdown(finalType = '') {
  return ['订场陪打', '订场+发球机'].includes(cleanText(finalType));
}

function thirdPartySourceCounts(records = []) {
  return {
    totalSourceCount: (records || []).length,
    bookingOrderCount: (records || []).filter(row => normalizeSourceType(row.sourceType) === 'order').length,
    lockCount: (records || []).filter(row => normalizeSourceType(row.sourceType) === 'lock').length,
    memberProfileCount: (records || []).filter(row => normalizeSourceType(row.sourceType) === 'member').length,
    syncGapCount: (records || []).filter(row => isSyncGapSourceType(row.sourceType)).length
  };
}

function countBy(rows = [], key) {
  return (rows || []).reduce((acc, row) => {
    const value = cleanText(row?.[key]) || '未分类';
    acc[value] = (acc[value] || 0) + 1;
    return acc;
  }, {});
}

function buildThirdPartySyncAuditReport({ batch = {}, precheck = {}, plan = null, changes = [] } = {}) {
  const items = precheck.items || [];
  const sourceCounts = batch.counts?.totalSourceCount ? {
    totalSourceCount: Number(batch.counts.totalSourceCount || 0),
    bookingOrderCount: Number(batch.counts.bookingOrderCount || 0),
    lockCount: Number(batch.counts.lockCount || 0),
    memberProfileCount: Number(batch.counts.memberProfileCount || 0),
    syncGapCount: Number(batch.counts.syncGapCount || 0)
  } : thirdPartySourceCounts(items);
  const importPlan = plan || buildThirdPartyImportPlan({ batchId: batch.batchId || batch.id, prechecks: items, confirmations: [], importResults: [] });
  return {
    ...sourceCounts,
    sourceTotalCount: sourceCounts.totalSourceCount,
    actionableSourceCount: items.filter(row => isBookingSourceType(row.sourceType)).length,
    businessCategoryCounts: countBy(items, 'businessCategory'),
    processLayerCounts: countBy(items, 'processLayer'),
    destinationCounts: {
      autoImport: importPlan.importable.length,
      needsConfirmation: importPlan.blocked.length,
      skipped: importPlan.skipped.length,
      informational: importPlan.informational.length
    },
    changeCount: (changes || []).length,
    unresolvedCount: importPlan.blocked.length + (changes || []).filter(row => String(row.status || 'pending_review') !== 'resolved').length
  };
}

function buildThirdPartyImportPlan({ batchId = '', prechecks = [], confirmations = [], importResults = [] } = {}) {
  const scoped = (prechecks || []).filter(row => !batchId || String(row.batchId || '') === String(batchId));
  const plan = { batchId, importable: [], blocked: [], skipped: [], informational: [], counts: { importable: 0, blocked: 0, skipped: 0, informational: 0 } };
  for (const precheck of scoped) {
    const sourceRecordId = cleanText(precheck.sourceRecordId);
    if (precheck.sourceType === 'member') {
      plan.informational.push({ ...precheck, sourceRecordId, reason: '会员资料仅同步留档，不进入订场导入' });
      continue;
    }
    if (precheck.riskReason === '会员流水批量接口缺口') {
      plan.informational.push({ ...precheck, sourceRecordId, reason: '会员流水批量接口缺口' });
      continue;
    }
    if (isAlreadyImported(precheck, importResults)) {
      plan.skipped.push({ ...precheck, sourceRecordId, reason: '已导入' });
      continue;
    }
    if (['duplicate_skip', 'do_not_import'].includes(precheck.recommendedType)) {
      plan.skipped.push({ ...precheck, sourceRecordId, reason: precheck.plannedAction || '不导入' });
      continue;
    }
    const confirmation = latestConfirmationFor(precheck, confirmations);
    const finalType = confirmation?.finalType || precheck.suggestedFinalType || (precheck.recommendedType === 'auto_import' ? (precheck.sourceType === 'lock' ? '内部占用' : '散客微信转账订场') : '');
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
    const amountBreakdown = confirmation?.amountBreakdown || precheck.amountBreakdown || null;
    if (needsExtraServiceBreakdown(finalType) && !amountBreakdown) {
      plan.blocked.push({ ...precheck, sourceRecordId, confirmation, finalType, reason: '额外项目缺少场地费和附加项目费拆分' });
      continue;
    }
    if (finalType === '会员余额订场') {
      plan.blocked.push({ ...precheck, sourceRecordId, confirmation, finalType, reason: '会员余额订场需会员流水审计链，暂不支持自动导入' });
      continue;
    }
    const targetTables = importTargetsFor({ sourceType: precheck.sourceType, finalType, recommendedType: precheck.recommendedType, amount });
    if (!targetTables.length) {
      plan.blocked.push({ ...precheck, sourceRecordId, confirmation, finalType, reason: '暂未支持该类型导入' });
      continue;
    }
    plan.importable.push({ ...precheck, sourceRecordId, confirmation, finalType, amount, amountBreakdown, targetTables });
  }
  plan.counts.importable = plan.importable.length;
  plan.counts.blocked = plan.blocked.length;
  plan.counts.skipped = plan.skipped.length;
  plan.counts.informational = plan.informational.length;
  return plan;
}

function rawRecordToSourceRecord(row = {}) {
  const raw = row.rawJson && typeof row.rawJson === 'object' ? row.rawJson : {};
  return {
    ...raw,
    sourceType: raw.sourceType || row.sourceType,
    thirdPartyId: raw.thirdPartyId || row.thirdPartyId || row.sourceRecordId
  };
}

function prechecksFromRawRecordsForBatch({ batchId = '', rawRecords = [], fallbackPrechecks = [], now = new Date().toISOString() } = {}) {
  const scopedRaw = (rawRecords || []).filter(row => String(row.batchId || '') === String(batchId || ''));
  if (!batchId || !scopedRaw.length) return (fallbackPrechecks || []).filter(row => !batchId || String(row.batchId || '') === String(batchId));
  return precheckThirdPartyRecords(scopedRaw.map(rawRecordToSourceRecord), { batchId, now }).items;
}

function refreshPrechecksFromRawRecords({ rawRecords = [], fallbackPrechecks = [], now = new Date().toISOString() } = {}) {
  const batchIds = [...new Set((rawRecords || []).map(row => cleanText(row.batchId)).filter(Boolean))];
  if (!batchIds.length) return fallbackPrechecks || [];
  const batchSet = new Set(batchIds);
  return [
    ...(fallbackPrechecks || []).filter(row => !batchSet.has(cleanText(row.batchId))),
    ...batchIds.flatMap(batchId => prechecksFromRawRecordsForBatch({ batchId, rawRecords, fallbackPrechecks, now }))
  ];
}

function filterAlertsForCurrentPlan(alerts = [], plan = {}) {
  const blockedIds = new Set((plan.blocked || []).map(row => String(row.sourceRecordId || '')));
  return (alerts || []).filter(row => {
    if (!isBookingSourceType(row.sourceType)) return true;
    return blockedIds.has(String(row.sourceRecordId || ''));
  });
}

function payMethodForImport(item = {}) {
  if (item.finalType === '会员余额订场') return '储值扣款';
  const method = cleanText(item.confirmation?.paymentMethod || item.paymentMethod || item.payMethod);
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
  const isActivity = item.finalType === '畅打活动';
  const isExtraService = needsExtraServiceBreakdown(item.finalType);
  const bookingAmount = isExtraService ? Number(item.amountBreakdown?.bookingAmount || 0) : Number(item.amount || 0) || 0;
  const historyRow = enrichCourtBookingStructure({
    id: `third-party-sync-${item.sourceRecordId}`,
    date: item.date,
    occurredDate: item.date,
    type: '消费',
    category: isInternal ? '内部占用' : (isActivity ? '畅打活动' : '订场'),
    payMethod: isInternal ? '不涉及支付' : payMethodForImport(item),
    amount: isInternal ? 0 : bookingAmount,
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
  });
  if (missingCourtBookingStructure(historyRow)) throw new Error('订场结构化字段不完整：缺日期/时间/场地');
  return historyRow;
}

function buildOneFinancialLedgerForImport(item = {}, trace = {}, now = '', overrides = {}) {
  const amount = Number(overrides.amount ?? item.amount ?? 0) || 0;
  const payMethod = payMethodForImport(item);
  const isStoredValue = payMethod === '储值扣款';
  const businessType = overrides.businessType || (isStoredValue ? '会员订场' : (item.finalType === '畅打活动' ? '畅打活动' : '散客订场'));
  const ledgerSuffix = overrides.ledgerSuffix ? `-${overrides.ledgerSuffix}` : '';
  return {
    id: `third-party-sync-finance-${item.sourceRecordId}${ledgerSuffix}`,
    ledgerVersion: 'third-party-sync-v2',
    status: 'active',
    businessDate: item.date || now.slice(0, 10),
    createdAt: now,
    updatedAt: now,
    businessType,
    transactionType: '收款',
    cashDelta: isStoredValue ? 0 : cents(amount),
    recognizedRevenueDelta: cents(amount),
    deferredRevenueDelta: isStoredValue ? -cents(amount) : 0,
    refundDelta: 0,
    paymentMethod: payMethod,
    paymentChannel: payMethod,
    sourceType: 'third-party-sync',
    sourceId: item.sourceRecordId,
    idempotencyKey: `third-party-sync|${item.batchId}|${item.sourceRecordId}${ledgerSuffix}`,
    operator: trace.operationBy || '',
    sourceSnapshot: {
      batchId: item.batchId,
      sourceRecordId: item.sourceRecordId,
      finalType: item.finalType,
      serviceType: overrides.serviceType || '',
      date: item.date,
      startTime: item.startTime,
      endTime: item.endTime,
      venue: item.venue
    },
    ...trace
  };
}

function buildFinancialLedgerRowsForImport(item = {}, trace = {}, now = '') {
  if (!item.targetTables.includes(T_FINANCIAL_LEDGER)) return [];
  if (needsExtraServiceBreakdown(item.finalType)) {
    const bookingAmount = Number(item.amountBreakdown?.bookingAmount || 0);
    const serviceAmount = Number(item.amountBreakdown?.serviceAmount || 0);
    const serviceType = cleanText(item.amountBreakdown?.serviceType) || (item.finalType === '订场+发球机' ? '发球机' : '陪打');
    return [
      buildOneFinancialLedgerForImport(item, trace, now, { amount: bookingAmount, businessType: '散客订场', ledgerSuffix: 'booking', serviceType: '订场' }),
      buildOneFinancialLedgerForImport(item, trace, now, { amount: serviceAmount, businessType: serviceType === '发球机' ? '发球机服务' : '陪打服务', ledgerSuffix: serviceType === '发球机' ? 'ball-machine' : 'companion', serviceType })
    ].filter(row => Number(row.recognizedRevenueDelta || 0) > 0);
  }
  return [buildOneFinancialLedgerForImport(item, trace, now)];
}

function scheduleRowMatchesImportItem(schedule = {}, item = {}) {
  return scheduleDateOf(schedule) === item.date
    && scheduleClockOf(schedule.startTime || schedule.startClock || schedule.beginTime) === item.startTime
    && scheduleClockOf(schedule.endTime || schedule.endClock || schedule.finishTime) === item.endTime
    && (!item.venue || cleanText(schedule.venue || schedule.court || schedule.courtName) === item.venue);
}

function scheduleTimeOverlapsImportItem(schedule = {}, item = {}) {
  if (scheduleDateOf(schedule) !== item.date) return false;
  const itemStartText = scheduleClockOf(item.startTime);
  const itemEndText = scheduleClockOf(item.endTime);
  const scheduleStartText = scheduleClockOf(schedule.startTime || schedule.startClock || schedule.beginTime);
  const scheduleEndText = scheduleClockOf(schedule.endTime || schedule.endClock || schedule.finishTime);
  if (!itemStartText || !itemEndText || !scheduleStartText || !scheduleEndText) return false;
  const itemStart = timeMinutes(itemStartText);
  const itemEnd = timeMinutes(itemEndText);
  const scheduleStart = timeMinutes(scheduleStartText);
  const scheduleEnd = timeMinutes(scheduleEndText);
  return itemStart < scheduleEnd && scheduleStart < itemEnd;
}

function scheduleCoachName(schedule = {}) {
  return cleanText(schedule.coach || schedule.coachName || schedule.teacher || schedule.primaryCoach);
}

function scheduleMatchText(item = {}) {
  return [item.remark, item.customerName, item.operatorAccount, item.phone].filter(Boolean).join(' ');
}

function inferCoachForScheduleImport(item = {}, coaches = [], schedules = []) {
  const text = scheduleMatchText(item);
  const operator = compactName(item.operatorAccount);
  const coach = (coaches || []).find(row => {
    const name = rowName(row);
    if (!rowIsActive(row) || !name || isOperatorName(name) || compactName(name) === operator) return false;
    return textHasName(text, name);
  });
  if (coach) return { id: cleanText(coach.id), name: rowName(coach) };
  return null;
}

function inferStudentForScheduleImport(item = {}, students = []) {
  const text = scheduleMatchText(item);
  const operator = compactName(item.operatorAccount);
  const phone = normalizeThirdPartyPhone(item.phone);
  const byPhone = phone ? (students || []).find(row => {
    const name = rowName(row);
    return rowIsActive(row) && clearThirdPartyStudentNameForAutoMatch(name) && normalizeThirdPartyPhone(row.phone || row.mobile || row.userPhone) === phone && compactName(name) !== operator;
  }) : null;
  if (byPhone) return { id: cleanText(byPhone.id), name: rowName(byPhone), phone };
  const byName = (students || []).find(row => {
    const name = rowName(row);
    if (!rowIsActive(row) || !name || !clearThirdPartyStudentNameForAutoMatch(name) || isOperatorName(name) || compactName(name) === operator) return false;
    return textHasName(text, name);
  });
  return byName ? { id: cleanText(byName.id), name: rowName(byName), phone: normalizeThirdPartyPhone(byName.phone || byName.mobile || byName.userPhone) } : null;
}

function findScheduleForImportItem(item = {}, schedules = [], coaches = []) {
  const candidates = (schedules || []).filter(row => scheduleRowMatchesImportItem(row, item));
  if (!candidates.length) return null;
  const inferredCoach = inferCoachForScheduleImport(item, coaches, candidates);
  if (inferredCoach?.name) {
    const matched = candidates.find(row => compactName(scheduleCoachName(row)) === compactName(inferredCoach.name));
    if (matched) return matched;
  }
  return null;
}

function findScheduleOverlapForImportItem(item = {}, schedules = [], coaches = [], students = []) {
  const inferredCoach = inferCoachForScheduleImport(item, coaches, schedules);
  const inferredStudent = inferStudentForScheduleImport(item, students);
  if (!inferredCoach?.name && !inferredStudent?.id && !inferredStudent?.name) return null;
  return (schedules || []).find(row => {
    if (!scheduleTimeOverlapsImportItem(row, item)) return false;
    if (item.venue && cleanText(row.venue || row.court || row.courtName) !== item.venue) return false;
    const sameCoach = inferredCoach?.name && compactName(scheduleCoachName(row)) === compactName(inferredCoach.name);
    const studentIds = Array.isArray(row.studentIds) ? row.studentIds.map(cleanText) : [];
    const sameStudentId = inferredStudent?.id && studentIds.includes(cleanText(inferredStudent.id));
    const sameStudentName = inferredStudent?.name && textHasName(row.studentName || row.students || row.remark, inferredStudent.name);
    return !!(sameCoach || sameStudentId || sameStudentName);
  }) || null;
}

function scheduleImportBlockReason(item = {}, schedules = [], coaches = [], students = []) {
  if (item.finalType !== '排课占场') return '';
  if (cleanText(item.confirmation?.bindTargetId || item.bindTargetId)) return '';
  if (findScheduleForImportItem(item, schedules, coaches)) return '';
  if (findScheduleOverlapForImportItem(item, schedules, coaches, students)) return '已有重叠排课，请先确认是否重复';
  const coach = inferCoachForScheduleImport(item, coaches, schedules);
  const student = inferStudentForScheduleImport(item, students);
  if (!coach && !student) return '未识别到真实教练和学员，需运营确认';
  if (!coach) return '未识别到教练管理里的真实教练，需运营确认';
  if (!student) return '未识别到真实学员，需运营确认';
  return '';
}

function applyScheduleSafetyToImportPlan(plan = {}, { schedules = [], coaches = [], students = [] } = {}) {
  const safePlan = { ...plan, importable: [], blocked: [...(plan.blocked || [])] };
  for (const item of plan.importable || []) {
    const reason = scheduleImportBlockReason(item, schedules, coaches, students);
    if (reason) safePlan.blocked.push({ ...item, reason, needsConfirmation: true });
    else safePlan.importable.push(item);
  }
  safePlan.counts = {
    ...plan.counts,
    importable: safePlan.importable.length,
    blocked: safePlan.blocked.length,
    skipped: (safePlan.skipped || plan.skipped || []).length,
    informational: (safePlan.informational || plan.informational || []).length
  };
  return safePlan;
}

function scheduleCourseTypeForImport(item = {}) {
  const text = `${item.remark || ''} ${item.customerName || ''}`;
  if (/体验/.test(text)) return '体验课';
  if (/小班/.test(text)) return '小班课';
  if (/训练营/.test(text)) return '训练营';
  return '私教课';
}

function buildScheduleForThirdPartyImport(item = {}, trace = {}, now = '', uuidv4 = () => crypto.randomUUID(), matched = {}) {
  const id = `third-party-schedule-${uuidv4()}`;
  const courseType = scheduleCourseTypeForImport(item);
  const coach = matched.coach || {};
  const student = matched.student || {};
  return {
    id,
    date: item.date,
    startTime: `${item.date} ${item.startTime}:00`,
    endTime: `${item.date} ${item.endTime}:00`,
    studentIds: student.id ? [student.id] : [],
    expectedStudentIds: student.id ? [student.id] : [],
    absentStudentIds: [],
    studentName: student.name || item.customerName || item.remark || '第三方同步排课',
    courseType,
    standardCourseType: courseType,
    coach: coach.name || '',
    coachId: coach.id || '',
    venue: item.venue,
    campus: item.campus || THIRD_PARTY_SCHEDULE_DEFAULT_CAMPUS,
    campusName: item.campusName || THIRD_PARTY_SCHEDULE_DEFAULT_CAMPUS_NAME,
    locationType: 'own',
    lessonCount: 0,
    status: '已排课',
    notifyStatus: '未通知',
    confirmStatus: '待确认',
    scheduleSource: '第三方同步排课',
    notes: item.remark || '第三方同步自动创建排课',
    thirdPartySyncImports: [{ batchId: item.batchId, sourceRecordId: item.sourceRecordId, operationId: trace.operationId || '', importedAt: now }],
    createdBy: trace.operationBy || 'third-party-sync',
    createdAt: now,
    updatedAt: now,
    ...trace
  };
}

async function defaultWriteThirdPartyImportItem(item = {}, context = {}) {
  const { getCachedScan, getCachedRow, put, uuidv4, normalizeCourtRecord = row => row, now = '', trace = {}, tables = {} } = context;
  const written = [];
  if (item.finalType === '会员余额订场') throw new Error('会员余额订场需会员流水审计链，暂不支持自动导入');
  if (item.finalType === '排课占场') {
    const scheduleId = cleanText(item.confirmation?.bindTargetId || item.bindTargetId);
    const table = tables.T_SCHEDULE || T_SCHEDULE;
    const [schedules, coaches, students] = await Promise.all([
      getCachedScan(table).catch(() => []),
      getCachedScan(tables.T_COACHES || T_COACHES).catch(() => []),
      getCachedScan(tables.T_STUDENTS || T_STUDENTS).catch(() => [])
    ]);
    const schedule = scheduleId
      ? await getCachedRow(table, scheduleId).catch(() => null)
      : findScheduleForImportItem(item, schedules, coaches);
    if (scheduleId && !schedule) throw new Error('绑定排课不存在');
    if (schedule) {
      assertScheduleMatchesImportItem(schedule, item);
      const imports = Array.isArray(schedule.thirdPartySyncImports) ? schedule.thirdPartySyncImports : [];
      const next = { ...schedule, campus: schedule.campus || THIRD_PARTY_SCHEDULE_DEFAULT_CAMPUS, campusName: schedule.campusName || THIRD_PARTY_SCHEDULE_DEFAULT_CAMPUS_NAME, locationType: schedule.locationType || 'own', thirdPartySyncImports: [...imports.filter(row => String(row.sourceRecordId || '') !== item.sourceRecordId), { batchId: item.batchId, sourceRecordId: item.sourceRecordId, operationId: trace.operationId || '', importedAt: now }], updatedAt: now, ...trace };
      await put(table, schedule.id, next);
      written.push({ table, id: schedule.id, sourceRecordId: item.sourceRecordId });
      return written;
    }
    const blockReason = scheduleImportBlockReason(item, schedules, coaches, students);
    if (blockReason) throw new Error(blockReason);
    const coach = inferCoachForScheduleImport(item, coaches, schedules);
    const student = inferStudentForScheduleImport(item, students);
    if (!coach || !student) throw new Error(scheduleImportBlockReason(item, schedules, coaches, students) || '未识别到真实教练和学员，需运营确认');
    const nextSchedule = buildScheduleForThirdPartyImport(item, trace, now, uuidv4, { coach, student });
    await put(table, nextSchedule.id, nextSchedule);
    written.push({ table, id: nextSchedule.id, sourceRecordId: item.sourceRecordId });
    return written;
  }
  if (item.finalType === '订场陪打') {
    const table = tables.T_SCHEDULE || T_SCHEDULE;
    const companionSchedule = buildScheduleForThirdPartyImport({ ...item, remark: item.remark || '第三方同步陪打' }, trace, now, uuidv4);
    const nextSchedule = { ...companionSchedule, courseType: '陪打', standardCourseType: '陪打', scheduleSource: '第三方同步陪打', lessonCount: 0 };
    await put(table, nextSchedule.id, nextSchedule);
    written.push({ table, id: nextSchedule.id, sourceRecordId: item.sourceRecordId });
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

  const ledgers = buildFinancialLedgerRowsForImport(item, trace, now);
  for (const ledger of ledgers) {
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

function uniqueSourceCount(rows = []) {
  return new Set((rows || []).map(row => cleanText(row.sourceRecordId)).filter(Boolean)).size;
}

function buildFullDisposition({ sourceTotalCount = 0, plan = {}, writtenIds = [], failed = [] } = {}) {
  const importedSourceCount = uniqueSourceCount((writtenIds || []).filter(row => [T_COURTS, T_SCHEDULE].includes(row.table)));
  const failedCount = uniqueSourceCount(failed);
  const skippedCount = uniqueSourceCount([...(plan.blocked || []), ...(plan.skipped || [])]);
  const informationalCount = uniqueSourceCount(plan.informational || []);
  const total = Number(sourceTotalCount || 0) || (plan.counts.importable + plan.counts.blocked + plan.counts.skipped + plan.counts.informational);
  const accountedCount = importedSourceCount + skippedCount + informationalCount;
  const unresolvedCount = (plan.blocked || []).length + failedCount;
  return {
    total,
    importedSourceCount,
    skippedCount,
    informationalCount,
    failedCount,
    unresolvedCount,
    accountedCount,
    ok: total === accountedCount && unresolvedCount === 0
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
    const dateFrom = cleanText(rangeStart).slice(0, 10);
    const dateTo = /00:00(?::00)?$/.test(cleanText(rangeEnd)) && cleanText(rangeEnd).slice(0, 10) > dateFrom ? addDays(cleanText(rangeEnd).slice(0, 10), -1) : cleanText(rangeEnd).slice(0, 10);
    const pageParams = { ...params, pageNum, pageSize: 100, dateFrom, dateTo };
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

function importResultWriteCount(result = {}) {
  return Array.isArray(result.writtenIds) ? result.writtenIds.length : 0;
}

function importResultFailedCount(result = {}) {
  return Array.isArray(result.failed) ? result.failed.length : 0;
}

function shouldFailCronForImportResult(result = {}) {
  const status = cleanText(result.status);
  if (['failed', 'partial_failed'].includes(status)) return true;
  if (Number(result.fullDisposition?.failedCount || 0) > 0) return true;
  return Number(result.plannedCount || 0) > 0 && importResultWriteCount(result) === 0;
}

function notificationDateText(batch = {}) {
  const start = cleanText(batch.rangeStart).slice(0, 10);
  const end = cleanText(batch.rangeEnd).slice(0, 10);
  if (!start) return '-';
  if (end === addDays(start, 1)) return start;
  return end && end !== start ? `${start} 至 ${end}` : start;
}

function notificationMoneyText(value = 0) {
  const amount = Math.round((Number(value || 0) || 0) * 100) / 100;
  return `¥${amount.toLocaleString('zh-CN')}`;
}

function notificationImportAmount(batch = {}, result = {}) {
  const before = Number(result.financeSnapshot?.before?.cashDelta || 0) || 0;
  const after = Number(result.financeSnapshot?.after?.cashDelta || 0) || 0;
  const delta = Math.max(0, Math.round((after - before) * 100) / 100);
  if (delta) return delta;
  return Number(batch.financeImpact?.cashDelta || 0) || 0;
}

function notificationSuccessBookingCount(result = {}) {
  const ids = new Set();
  for (const row of result.writtenIds || []) {
    if (row.table === T_COURTS || row.table === T_SCHEDULE) {
      const id = cleanText(row.sourceRecordId);
      if (id) ids.add(id);
    }
  }
  return ids.size;
}

function notificationLedgerCount(result = {}) {
  return (result.writtenIds || []).filter(row => row.table === T_FINANCIAL_LEDGER).length;
}

function notificationAlertLabel(row = {}) {
  const time = [row.startTime, row.endTime].filter(Boolean).join('-');
  const main = [row.date, time, row.venue, row.customerName || row.phone].filter(Boolean).join(' ');
  const reason = cleanText(row.reason).replace(/：.+$/, '');
  return main ? `${main}：${reason || '待处理'}` : reason || '待处理';
}

function buildThirdPartySyncNotificationText({ type = 'success', batch = {}, result = {}, alerts = [] } = {}) {
  const failed = Array.isArray(result.failed) ? result.failed : [];
  const skipped = Array.isArray(result.skippedIds) ? result.skippedIds : [];
  const successBookings = notificationSuccessBookingCount(result);
  const planned = Number(result.plannedCount || 0);
  const disposition = result.fullDisposition || {};
  const sourceTotal = Number(disposition.total || batch.counts?.totalSourceCount || result.sourceTotalCount || planned || 0);
  const prefix = type === 'failure' ? '订场数据同步失败' : type === 'needs_attention' ? '订场数据需要处理' : '订场数据同步完成';
  const alertRows = (alerts || []).filter(row => row.reason);
  const memberChangeCount = alertRows.filter(row => normalizeSourceType(row.sourceType) === 'member' || (/^第三方变更/.test(cleanText(row.reason)) && !row.date && !row.venue)).length;
  const memberGapCount = alertRows.filter(row => /会员流水批量接口缺口/.test(cleanText(row.reason))).length;
  const actionAlerts = alertRows.filter(row => {
    if (/会员流水批量接口缺口/.test(cleanText(row.reason))) return false;
    if (normalizeSourceType(row.sourceType) === 'member') return false;
    if (/^第三方变更/.test(cleanText(row.reason)) && !row.date && !row.venue) return false;
    return true;
  });
  const unresolvedCount = Number(disposition.unresolvedCount ?? (skipped.length + failed.length + actionAlerts.length)) || 0;
  const informationalCount = Number(disposition.informationalCount || 0) || 0;
  const skippedOnlyCount = Math.max(0, Number(disposition.skippedCount || skipped.length) - unresolvedCount);
  const lines = [
    `[场小二] ${prefix}`,
    '场馆：网球兄弟 FlowTennis',
    `数据日期：${notificationDateText(batch)}`,
    `第三方数据：共 ${sourceTotal} 条`,
    `自动完成：${successBookings} 条`,
    `财务入账：${notificationLedgerCount(result)} 条流水，合计 ${notificationMoneyText(notificationImportAmount(batch, result))}`,
    `自动留档：${informationalCount} 条`,
    `自动忽略：${skippedOnlyCount} 条`,
    `失败：${importResultFailedCount(result)} 条`,
    `需人工处理：${unresolvedCount} 条`
  ];
  if (failed.length) {
    lines.push('失败明细：');
    lines.push(...failed.slice(0, 8).map(row => `- ${notificationAlertLabel(row)}`));
    if (failed.length > 8) lines.push(`其余 ${failed.length - 8} 条请到第三方同步中心查看。`);
  }
  if (actionAlerts.length) {
    lines.push('需要你处理：');
    lines.push(...actionAlerts.slice(0, 8).map(row => `- ${notificationAlertLabel(row)}`));
    if (actionAlerts.length > 8) lines.push(`其余 ${actionAlerts.length - 8} 条请到第三方同步中心查看。`);
  }
  const reminders = [];
  if (memberChangeCount) reminders.push(`会员资料变更 ${memberChangeCount} 条：仅留档，不影响订场导入`);
  if (memberGapCount) reminders.push('会员流水接口缺口：第三方暂不能批量拉取会员储值流水');
  if (reminders.length) {
    lines.push('提醒：');
    lines.push(...reminders.map(row => `- ${row}`));
  }
  return lines.join('\n');
}

function buildThirdPartySyncNotificationCard({ type = 'success', batch = {}, result = {}, alerts = [] } = {}) {
  const lines = buildThirdPartySyncNotificationText({ type, batch, result, alerts }).split('\n');
  const titleLine = lines[0] || '[场小二] 订场数据同步完成';
  const dateLine = lines.find(line => /^数据日期：/.test(line)) || `数据日期：${notificationDateText(batch)}`;
  const detailLines = lines.filter((line, index) => index > 0 && line !== dateLine);
  return {
    config: {
      wide_screen_mode: true
    },
    header: {
      template: type === 'failure' ? 'red' : 'green',
      title: {
        tag: 'plain_text',
        content: titleLine
      }
    },
    elements: [
      {
        tag: 'div',
        text: {
          tag: 'lark_md',
          content: `**${dateLine}**`
        }
      },
      {
        tag: 'hr'
      },
      {
        tag: 'div',
        text: {
          tag: 'lark_md',
          content: detailLines.join('\n')
        }
      }
    ]
  };
}

async function defaultNotifyThirdPartySyncResult({ type = 'success', batch = {}, result = {}, alerts = [], env = process.env, client = axios } = {}) {
  const webhooks = [
    env.THIRD_PARTY_SYNC_NOTIFY_WEBHOOK,
    env.FEISHU_THIRD_PARTY_SYNC_WEBHOOK,
    env.FEISHU_MONITOR_WEBHOOK_URL,
    env.FEISHU_WEBHOOK_URL
  ].map(cleanText).filter(Boolean);
  const uniqueWebhooks = [...new Set(webhooks)];
  if (!uniqueWebhooks.length) return { skipped: true };
  const card = buildThirdPartySyncNotificationCard({ type, batch, result, alerts });
  const errors = [];
  for (const webhook of uniqueWebhooks) {
    try {
      const res = await client.post(webhook, { msg_type: 'interactive', card }, { timeout: 10000 });
      const code = Number(res.data?.code ?? 0);
      if (code === 0) return { sent: true, code };
      errors.push(res.data?.msg || String(code));
    } catch (err) {
      errors.push(err.message || '飞书群通知失败');
    }
  }
  throw new Error(`飞书群通知失败：${errors.filter(Boolean).join('；') || '未知错误'}`);
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
    notifyThirdPartySyncResult = defaultNotifyThirdPartySyncResult,
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
    const batchCounts = { ...thirdPartySourceCounts(sourceRecords), ...precheck.counts };
    const batch = { ...buildThirdPartySyncBatch({ id: batchId, rangeStart, rangeEnd, now: pulledAt, counts: batchCounts, financeImpact }), changeCount: changes.length, createdBy: operator };
    await put(T_THIRD_PARTY_SYNC_BATCHES, batch.id, batch);
    await Promise.all(sourceRecords.map((record, index) => {
      const row = rawRecordRow(record, { batchId, now: pulledAt, index });
      return put(T_THIRD_PARTY_SYNC_RAW_RECORDS, row.id, row);
    }));
    await Promise.all(precheck.items.map(row => put(T_THIRD_PARTY_SYNC_PRECHECKS, row.id, row)));
    await Promise.all(changes.map(row => put(T_THIRD_PARTY_SYNC_CHANGES, row.id, row)));
    const audit = buildThirdPartySyncAuditReport({ batch, precheck, changes });
    return { batch, precheck, changes, audit };
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
    const alertSourcePayload = source => ({
      sourceRecordId: cleanText(source?.sourceRecordId),
      sourceType: normalizeSourceType(source?.sourceType),
      date: cleanText(source?.date || bookingDateOf(source?.currentRaw || {})),
      startTime: cleanText(source?.startTime || startTimeOf(source?.currentRaw || {})),
      endTime: cleanText(source?.endTime || endTimeOf(source?.currentRaw || {})),
      venue: cleanText(source?.venue || venueOf(source?.currentRaw || {})),
      customerName: cleanText(source?.customerName || customerNameOf(source?.currentRaw || {})),
      phone: normalizeThirdPartyPhone(source?.phone || phoneOf(source?.currentRaw || {})),
      bookingMode: cleanText(source?.bookingMode || bookingModeOf(source?.currentRaw || source || {})),
      operatorAccount: cleanText(source?.operatorAccount || operatorAccountOf(source?.currentRaw || {})),
      remark: cleanText(source?.remark || remarkOf(source?.currentRaw || {}))
    });
    const pushAlert = (reason, source = {}) => {
      const text = cleanText(reason);
      if (!text) return;
      alerts.push({
        id: `cxe-alert-${uuidv4()}`,
        batchId,
        operationId: result?.operationId || '',
        reason: text,
        ...alertSourcePayload(source),
        status: 'open',
        createdAt: nowValue,
        createdBy: operator
      });
    };
    for (const row of plan.blocked || []) pushAlert(row.reason || row.riskReason || '低置信数据待确认', row);
    for (const row of plan.informational || []) {
      if (/缺口/.test(String(row.reason || row.riskReason || ''))) pushAlert(row.reason || row.riskReason, row);
    }
    for (const row of plan.skipped || []) {
      if (/取消|退款|作废/.test(String(row.reason || row.riskReason || row.plannedAction || ''))) pushAlert(row.reason || row.riskReason || row.plannedAction, row);
    }
    for (const row of changes || []) pushAlert(`第三方${row.changeType === 'cancelled' ? '取消' : row.changeType === 'refunded' ? '退款' : '变更'}：${row.sourceRecordId}`, row);
    for (const row of result?.failed || []) {
      const source = (plan.importable || []).find(item => String(item.sourceRecordId || '') === String(row.sourceRecordId || '')) || row;
      pushAlert(row.reason || '导入失败', source);
    }
    await Promise.all(alerts.map(row => put(T_THIRD_PARTY_SYNC_ALERTS, row.id, row)));
    return alerts;
  }

  async function runImportForBatch({ batchId = '', operator = 'admin', importedAt = now() } = {}) {
    const [batches, rawRecords, prechecks, confirmations, importResults] = await Promise.all([
      getCachedScan(T_THIRD_PARTY_SYNC_BATCHES).catch(() => []),
      getCachedScan(T_THIRD_PARTY_SYNC_RAW_RECORDS).catch(() => []),
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
    const currentPrechecks = prechecksFromRawRecordsForBatch({ batchId, rawRecords, fallbackPrechecks: prechecks, now: importedAt });
    let plan = buildThirdPartyImportPlan({ batchId, prechecks: currentPrechecks, confirmations, importResults });
    const [scheduleRows, coachRows, studentRows] = await Promise.all([
      getCachedScan(tables.T_SCHEDULE || T_SCHEDULE).catch(() => []),
      getCachedScan(tables.T_COACHES || T_COACHES).catch(() => []),
      getCachedScan(tables.T_STUDENTS || T_STUDENTS).catch(() => [])
    ]);
    plan = applyScheduleSafetyToImportPlan(plan, { schedules: scheduleRows, coaches: coachRows, students: studentRows });
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
    const fullDisposition = buildFullDisposition({ sourceTotalCount: Number(batch.counts?.totalSourceCount || 0), plan, writtenIds, failed });
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
      sourceTotalCount: Number(batch.counts?.totalSourceCount || 0),
      writtenTables,
      writtenIds,
      skippedIds: [...plan.blocked, ...plan.skipped].map(row => ({ sourceRecordId: row.sourceRecordId, reason: row.reason || row.riskReason || '跳过' })),
      informationalIds: (plan.informational || []).map(row => ({ sourceRecordId: row.sourceRecordId, reason: row.reason || row.riskReason || '仅同步留档' })),
      failed,
      backupFile: `table:${T_THIRD_PARTY_SYNC_IMPORT_BACKUPS}/${backup.backupId}`,
      backup,
      reportFile: `table:${T_THIRD_PARTY_SYNC_IMPORT_RESULTS}`,
      verifiedAt: importedAt,
      verification,
      fullDisposition,
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
      const range = defaultDailyRange(new Date(now()));
      const pulled = await pullAndPrecheck({ ...range, operator: 'daily-auto-sync' });
      const autoImport = await runImportForBatch({ batchId: pulled.batch.batchId, operator: 'daily-auto-sync', importedAt: now() });
      const alerts = await createImportAlerts({ batchId: pulled.batch.batchId, plan: autoImport.plan, changes: pulled.changes, result: autoImport.result, operator: 'daily-auto-sync', nowValue: now() });
      const actionableAlerts = alerts.filter(row => {
        if (/会员流水批量接口缺口/.test(cleanText(row.reason))) return false;
        if (normalizeSourceType(row.sourceType) === 'member') return false;
        if (/^第三方变更/.test(cleanText(row.reason)) && !row.date && !row.venue) return false;
        return true;
      });
      const technicalFailed = shouldFailCronForImportResult(autoImport.result);
      const needsAttention = actionableAlerts.length > 0 || ['partial_completed', 'paused'].includes(cleanText(autoImport.result.status));
      let notification = null;
      try {
        notification = await notifyThirdPartySyncResult({ type: technicalFailed ? 'failure' : needsAttention ? 'needs_attention' : 'success', batch: pulled.batch, result: autoImport.result, alerts, env });
      } catch (err) {
        notification = { sent: false, error: err.message || '飞书通知失败' };
      }
      const payload = { ...pulled, autoImport, alerts, notification };
      if (technicalFailed) return sendJson(res, { ...payload, error: '第三方同步导入失败，已生成报警' }, 500);
      return sendJson(res, payload);
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
      const refreshedPrechecks = refreshPrechecksFromRawRecords({ rawRecords, fallbackPrechecks: prechecks, now: now() });
      const latestBatch = [...batches].sort((a, b) => String(b.pulledAt || '').localeCompare(String(a.pulledAt || '')))[0] || null;
      const latestBatchId = cleanText(latestBatch?.batchId || latestBatch?.id);
      const currentRawRecords = latestBatchId ? rawRecords.filter(row => String(row.batchId || '') === latestBatchId) : rawRecords;
      const currentPrechecks = latestBatchId
        ? refreshedPrechecks.filter(row => String(row.batchId || '') === latestBatchId)
        : refreshedPrechecks;
      const currentImportResults = latestBatchId ? importResults.filter(row => String(row.batchId || '') === latestBatchId) : importResults;
      const currentChanges = latestBatchId ? changes.filter(row => String(row.batchId || '') === latestBatchId) : changes;
      const currentPlan = latestBatchId ? buildThirdPartyImportPlan({ batchId: latestBatchId, prechecks: currentPrechecks, confirmations, importResults }) : null;
      const currentAlertsRaw = latestBatchId ? alerts.filter(row => String(row.batchId || '') === latestBatchId) : alerts;
      const currentAlerts = currentPlan ? filterAlertsForCurrentPlan(currentAlertsRaw, currentPlan) : currentAlertsRaw;
      const currentRollbacks = latestBatchId ? rollbacks.filter(row => String(row.batchId || '') === latestBatchId) : rollbacks;
      const currentBookingPrechecks = currentPrechecks.filter(row => isBookingSourceType(row.sourceType));
      const currentOrderPrechecks = currentPrechecks.filter(row => normalizeSourceType(row.sourceType) === 'order');
      const currentLockPrechecks = currentPrechecks.filter(row => normalizeSourceType(row.sourceType) === 'lock');
      const summary = {
        batchCount: batches.length,
        currentBatchId: latestBatchId,
        rawCount: currentRawRecords.length,
        bookingOrderCount: currentRawRecords.filter(row => normalizeSourceType(row.sourceType) === 'order').length,
        lockCount: currentRawRecords.filter(row => normalizeSourceType(row.sourceType) === 'lock').length,
        actionableSourceCount: currentRawRecords.filter(row => ['order', 'lock'].includes(normalizeSourceType(row.sourceType))).length,
        memberProfileCount: currentRawRecords.filter(row => normalizeSourceType(row.sourceType) === 'member').length,
        syncGapCount: currentRawRecords.filter(row => isSyncGapSourceType(row.sourceType)).length,
        autoImportCount: currentBookingPrechecks.filter(row => row.recommendedType === 'auto_import').length,
        autoBookingOrderCount: currentOrderPrechecks.filter(row => row.recommendedType === 'auto_import').length,
        autoLockCount: currentLockPrechecks.filter(row => row.recommendedType === 'auto_import').length,
        pendingCount: currentBookingPrechecks.filter(row => row.needsConfirmation || row.recommendedType === 'needs_confirmation').length,
        exceptionCount: currentBookingPrechecks.filter(row => row.recommendedType === 'high_risk_exception').length,
        duplicateCount: currentBookingPrechecks.filter(row => row.recommendedType === 'duplicate_skip').length,
        importedCount: currentImportResults.filter(row => ['completed', 'partial_completed'].includes(row.status)).length,
        failedImportCount: currentImportResults.filter(row => row.status === 'partial_failed' || row.status === 'failed').length,
        changeCount: currentChanges.length,
        openAlertCount: currentAlerts.filter(row => row.status !== 'closed').length,
        rollbackCount: currentRollbacks.length
      };
      const responsePrechecks = refreshedPrechecks;
      const responseAlerts = latestBatchId ? [
        ...alerts.filter(row => String(row.batchId || '') !== latestBatchId),
        ...currentAlerts
      ] : alerts;
      return sendJson(res, { summary, batches, rawRecords, prechecks: responsePrechecks, confirmations, importResults, changes, alerts: responseAlerts, rollbacks });
    }
    if (path === '/third-party-sync/pull' && method === 'POST') {
      const range = body.rangeStart && body.rangeEnd ? { rangeStart: body.rangeStart, rangeEnd: body.rangeEnd } : defaultDailyRange(new Date());
      return sendJson(res, await pullAndPrecheck({ ...range, operator: user.name || 'admin' }));
    }
    if (path === '/third-party-sync/confirmations' && method === 'POST') {
      const rawBreakdown = body.amountBreakdown && typeof body.amountBreakdown === 'object' ? body.amountBreakdown : null;
      const amountBreakdown = rawBreakdown ? {
        bookingAmount: Number(rawBreakdown.bookingAmount || 0) || 0,
        serviceAmount: Number(rawBreakdown.serviceAmount || 0) || 0,
        serviceType: cleanText(rawBreakdown.serviceType),
        totalAmount: Math.round(((Number(rawBreakdown.bookingAmount || 0) || 0) + (Number(rawBreakdown.serviceAmount || 0) || 0)) * 100) / 100
      } : null;
      const confirmation = {
        id: `cxe-confirm-${uuidv4()}`,
        batchId: cleanText(body.batchId),
        sourceRecordId: cleanText(body.sourceRecordId),
        finalType: cleanText(body.finalType),
        processingDecision: cleanText(body.processingDecision),
        importDestination: cleanText(body.importDestination),
        revenueTreatment: cleanText(body.revenueTreatment),
        extraServiceType: cleanText(body.extraServiceType),
        paymentMethod: cleanText(body.paymentMethod),
        amount: Number(body.amount || 0) || 0,
        amountBreakdown,
        bindTargetType: cleanText(body.bindTargetType),
        bindTargetId: cleanText(body.bindTargetId),
        bindTargetLabel: cleanText(body.bindTargetLabel),
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
      const batchId = cleanText(body.batchId);
      const [rawRecords, prechecks, confirmations, importResults] = await Promise.all([
        getCachedScan(T_THIRD_PARTY_SYNC_RAW_RECORDS).catch(() => []),
        getCachedScan(T_THIRD_PARTY_SYNC_PRECHECKS).catch(() => []),
        getCachedScan(T_THIRD_PARTY_SYNC_CONFIRMATIONS).catch(() => []),
        getCachedScan(T_THIRD_PARTY_SYNC_IMPORT_RESULTS).catch(() => [])
      ]);
      const currentPrechecks = prechecksFromRawRecordsForBatch({ batchId, rawRecords, fallbackPrechecks: prechecks, now: now() });
      return sendJson(res, { plan: buildThirdPartyImportPlan({ batchId, prechecks: currentPrechecks, confirmations, importResults }) });
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
  buildThirdPartySyncAuditReport,
  buildThirdPartySyncNotificationText,
  buildThirdPartySyncNotificationCard,
  defaultNotifyThirdPartySyncResult,
  fetchChangxiaoerData,
  defaultDailyRange,
  THIRD_PARTY_SYNC_TABLES,
  T_THIRD_PARTY_SYNC_BATCHES,
  T_THIRD_PARTY_SYNC_RAW_RECORDS,
  T_THIRD_PARTY_SYNC_PRECHECKS,
  T_THIRD_PARTY_SYNC_CONFIRMATIONS,
  T_THIRD_PARTY_SYNC_IMPORT_RESULTS
};
