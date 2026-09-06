const crypto = require('crypto');
const { effectiveScheduleStatus } = require('./schedule.js');
const { bookingDurationHours, normalizeCourtHistory, courtHistoryBusinessDate, buildCourtAccountListViewFromData } = require('./page-data/court-account-read-model.js');
const { buildCourtAccountListViewFromIndexRows } = require('./page-data/court-account-list-index.js');
const businessTaxonomy = require('../public/assets/scripts/core/business-taxonomy.js');
const { normalizeCampusValue } = require('../public/assets/scripts/core/campus.js');

const WEEKLY_REPORT_CAMPUS_NAME = '顺义马坡';
const WEEKLY_REPORT_TIMEZONE = 'Asia/Shanghai';
const WEEKLY_REPORT_TABLE = 'ft_weekly_business_reports';
const WEEKLY_REPORT_OPERATIONS_VIEW = 'weekly-report';
const COURT_USAGE_TYPES = [
  { key: 'member', label: '会员订场' },
  { key: 'guest', label: '散客订场' },
  { key: 'course', label: '课程订场' },
  { key: 'leader', label: '领导订场' },
  { key: 'free', label: '内部使用' },
  { key: 'match', label: '约球局' }
];

function dateKeyUtcMs(day) {
  const match = String(day || '').match(/^(\d{4})-(\d{2})-(\d{2})$/);
  if (!match) return null;
  return Date.UTC(Number(match[1]), Number(match[2]) - 1, Number(match[3]));
}

function addUtcDays(day, offset) {
  const ms = dateKeyUtcMs(day);
  if (ms == null) return '';
  return new Date(ms + offset * 86400000).toISOString().slice(0, 10);
}

function isoWeekNumber(day = '') {
  const ms = dateKeyUtcMs(day);
  if (ms == null) return '';
  const date = new Date(ms);
  date.setUTCDate(date.getUTCDate() + 4 - (date.getUTCDay() || 7));
  const yearStart = Date.UTC(date.getUTCFullYear(), 0, 1);
  return Math.ceil((((date.getTime() - yearStart) / 86400000) + 1) / 7);
}

function beijingDateKey(value = new Date()) {
  const date = value instanceof Date ? value : new Date(value);
  if (Number.isNaN(date.getTime())) return String(value || '').slice(0, 10);
  return new Intl.DateTimeFormat('en-CA', {
    timeZone: WEEKLY_REPORT_TIMEZONE,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit'
  }).format(date);
}

function dayOfWeekUtc(day) {
  const ms = dateKeyUtcMs(day);
  if (ms == null) return 0;
  return new Date(ms).getUTCDay();
}

function resolveWeeklyBusinessReportPeriod(now = new Date()) {
  const today = beijingDateKey(now);
  const weekday = dayOfWeekUtc(today);
  const daysSinceThursday = (weekday - 4 + 7) % 7;
  const endDate = addUtcDays(today, -daysSinceThursday);
  const startDate = addUtcDays(endDate, -7);
  const previousEndDate = addUtcDays(startDate, -1);
  const previousStartDate = addUtcDays(previousEndDate, -7);
  return {
    startDate,
    endDate,
    previousStartDate,
    previousEndDate,
    timezone: WEEKLY_REPORT_TIMEZONE
  };
}

function numberValue(value) {
  const n = Number(value);
  return Number.isFinite(n) ? Math.round(n * 100) / 100 : 0;
}

function optionalNumber(value) {
  if (value === undefined || value === null || value === '') return null;
  const n = Number(value);
  return Number.isFinite(n) ? Math.round(n * 100) / 100 : null;
}

function cardValue(payload = {}, path = []) {
  let current = payload?.operations || payload;
  for (const key of path) current = current?.[key];
  return numberValue(current?.value ?? current);
}

function compareMetric(currentValue, previousValue) {
  const current = numberValue(currentValue);
  const previous = numberValue(previousValue);
  const changeValue = numberValue(current - previous);
  return {
    currentValue: current,
    previousValue: previous,
    changeValue,
    changeRate: previous ? numberValue(changeValue * 100 / previous) : null
  };
}

function compareValue(current, previous) {
  return compareMetric(current, previous);
}

function percent(part, total) {
  const base = numberValue(total);
  return base ? numberValue(numberValue(part) * 100 / base) : 0;
}

function cappedPercent(part, total) {
  return Math.max(0, Math.min(100, percent(part, total)));
}

function fieldNumber(row = {}, keys = []) {
  for (const key of keys) {
    if (row?.[key] !== undefined && row?.[key] !== null && row?.[key] !== '') return numberValue(row[key]);
  }
  return 0;
}

function textValue(row = {}, keys = []) {
  for (const key of keys) {
    const value = String(row?.[key] ?? '').trim();
    if (value) return value;
  }
  return '';
}

function inPeriod(day = '', period = {}) {
  const value = String(day || '').slice(0, 10);
  if (!value) return false;
  if (period.startDate && value < period.startDate) return false;
  if (period.endDate && value > period.endDate) return false;
  return true;
}

function inOptionalPeriod(day = '', period = {}) {
  if (!period?.startDate && !period?.endDate) return true;
  return inPeriod(day, period);
}

function periodDayCount(period = {}) {
  const start = dateKeyUtcMs(period.startDate);
  const end = dateKeyUtcMs(period.endDate);
  if (start == null || end == null || end < start) return 0;
  return Math.floor((end - start) / 86400000) + 1;
}

function campusMatches(row = {}) {
  const keys = [
    row.campus,
    row.campusName,
    row.campusCode,
    row.sourceCampus,
    row.location,
    row.venue
  ].map(normalizeCampusValue).filter(Boolean);
  const target = normalizeCampusValue(WEEKLY_REPORT_CAMPUS_NAME);
  return !keys.length || keys.includes(target) || keys.includes('shunyi_mapo');
}

function weeklyCampusMatchesStrict(row = {}) {
  const keys = [
    row.campus,
    row.campusName,
    row.campusCode,
    row.sourceCampus,
    row.location,
    row.venue
  ].map(normalizeCampusValue).filter(Boolean);
  const target = normalizeCampusValue(WEEKLY_REPORT_CAMPUS_NAME);
  return keys.includes(target) || keys.includes('shunyi_mapo');
}

function isActiveCoach(row = {}) {
  const status = String(row.status || row.employmentStatus || row.coachStatus || 'active').trim();
  if (!status) return true;
  return /^(active|enabled|在职|启用|正常)$/i.test(status);
}

function cleanCoachName(value = '') {
  return String(value || '').trim().replace(/\s*教练$/, '');
}

function normalizeCoachDisplayName(value = '') {
  const name = cleanCoachName(value);
  return name ? `${name}教练` : '';
}

function scheduleHours(row = {}) {
  const explicit = optionalNumber(row.durationHours ?? row.hours);
  if (explicit !== null && explicit > 0) return explicit;
  const start = new Date(String(row.startTime || '').replace(' ', 'T'));
  const end = new Date(String(row.endTime || '').replace(' ', 'T'));
  if (!Number.isNaN(start.getTime()) && !Number.isNaN(end.getTime()) && end > start) return numberValue((end - start) / 3600000);
  return fieldNumber(row, ['lessonCount']);
}

function scheduleCourseBucket(row = {}) {
  const raw = `${row.courseType || ''} ${row.experienceType || ''} ${row.productName || ''} ${row.packageName || ''}`;
  if (/陪打/.test(raw)) return 'sparringHours';
  if (/专项/.test(raw)) return 'specialHours';
  if (/体验/.test(raw)) return 'trialHours';
  if (/小班/.test(raw)) return 'smallClassHours';
  return 'privateHours';
}

function scheduleHasCourseEvidence(row = {}) {
  return Boolean(textValue(row, ['courseType', 'experienceType', 'productName', 'packageName', 'className', 'studentName', 'studentId', 'leadName']));
}

function isValidSchedule(row = {}, period = {}) {
  return inPeriod(row.startTime, period) && campusMatches(row) && effectiveScheduleStatus(row) !== '已取消' && scheduleHasCourseEvidence(row);
}

function isPrivateCoursePurchase(row = {}) {
  if (['voided', 'refunded', 'deleted'].includes(String(row.status || '').trim())) return false;
  const raw = `${row.courseType || ''} ${row.packageName || ''} ${row.productName || ''}`;
  return /私教/.test(raw) && !/体验/.test(raw);
}

function invalidBusinessStatus(value = '') {
  return ['voided', 'refunded', 'deleted', 'cancelled', 'canceled', 'cleared', 'inactive'].includes(String(value || '').trim().toLowerCase());
}

function membershipOrderAmount(row = {}) {
  return fieldNumber(row, ['rechargeAmount', 'finalAmount', 'amount', 'paidAmount', 'actualAmount']);
}

function membershipOrderKey(row = {}) {
  return textValue(row, ['membershipAccountId', 'courtId', 'courtName', 'id']);
}

function membershipOrderDate(row = {}) {
  return textValue(row, ['purchaseDate', 'paidAt', 'paymentTime', 'createdAt']).slice(0, 10);
}

function membershipAccountDate(row = {}) {
  return textValue(row, ['firstOpenDate', 'openedAt', 'cycleStartDate', 'createdAt']).slice(0, 10);
}

function isStoredValueBookingPayment(value = '') {
  const method = String(value || '').trim();
  return method === '储值扣款' || method === '储值卡' || method.includes('储值');
}

function buildStoredValueReadModel(raw = {}, period = {}, previousRaw = {}) {
  const source = (sourceRaw = {}) => {
    const courts = normalizeRows(sourceRaw.courts).filter(row => weeklyCampusMatchesStrict(row));
    const courtIds = new Set(courts.map(row => String(row?.id || '').trim()).filter(Boolean));
    return {
      campuses: normalizeRows(sourceRaw.campuses),
      students: normalizeRows(sourceRaw.students),
      leads: normalizeRows(sourceRaw.leads),
      courts,
      membershipAccounts: normalizeRows(sourceRaw.membershipAccounts).filter(row => {
        const courtId = String(row?.courtId || '').trim();
        return (courtId && courtIds.has(courtId)) || weeklyCampusMatchesStrict(row);
      }),
      membershipOrders: normalizeRows(sourceRaw.membershipOrders),
      membershipPlans: normalizeRows(sourceRaw.membershipPlans),
      membershipBenefitLedger: normalizeRows(sourceRaw.membershipBenefitLedger),
      membershipAccountEvents: normalizeRows(sourceRaw.membershipAccountEvents)
    };
  };
  const indexedView = (sourceRaw = {}) => {
    const rows = normalizeRows(sourceRaw.courtAccountListIndexRows);
    return rows.length ? buildCourtAccountListViewFromIndexRows(rows, { accountType: '会员账户' }) : null;
  };
  const view = indexedView(raw) || buildCourtAccountListViewFromData(source(raw), { includeDetails: true, accountType: '会员账户' });
  const previousView = indexedView(previousRaw) || buildCourtAccountListViewFromData(source(previousRaw), { includeDetails: true, accountType: '会员账户' });
  const memberItems = normalizeRows(view.items);
  const previousPeriod = { startDate: period.previousStartDate, endDate: period.previousEndDate };
  const financeRedemptionAmount = (sourceRaw, targetPeriod) => {
    const rows = normalizeRows(sourceRaw.financeNormalizedRows).filter(row => {
      const type = String(row.businessType || row.displayBusinessType || '').trim();
      return inPeriod(row.businessDate || row.date || row.createdAt, targetPeriod)
        && weeklyCampusMatchesStrict(row)
        && (type === '会员订场' || (String(row.businessTypeLevel1 || '') === '场地' && String(row.businessTypeLevel2 || '') === '会员订场'));
    });
    return rows.length ? numberValue(rows.reduce((sum, row) => sum + fieldNumber(row, ['recognizedRevenueDelta', 'amount']), 0)) : null;
  };
  const historyRedemptionAmount = (items, targetPeriod) => numberValue(normalizeRows(items).reduce((sum, item) => sum + normalizeRows(item.bookingRows)
    .filter(row => isStoredValueBookingPayment(row.payMethod) && inPeriod(row.bookingDate || row.date || row.createdAt, targetPeriod))
    .reduce((rowSum, row) => {
      const sign = row.type === '退款' || row.type === '冲正' ? -1 : row.type === '消费' ? 1 : 0;
      return rowSum + sign * fieldNumber(row, ['amount']);
    }, 0), 0));
  const indexedRedemptionAmount = (sourceRaw, targetPeriod) => numberValue(normalizeRows(sourceRaw.courtAccountListIndexRows)
    .filter(row => weeklyCampusMatchesStrict(row.item || row))
    .flatMap(row => normalizeRows(row.bookingDayStats))
    .filter(row => inPeriod(row.date, targetPeriod))
    .reduce((sum, row) => sum + fieldNumber(row, ['memberBookingAmount']), 0));
  const ordersByAccountOrCourt = (sourceRaw = {}) => {
    const map = new Map();
    normalizeRows(sourceRaw.membershipOrders).forEach(order => {
      [order.membershipAccountId, order.courtId].map(value => String(value || '').trim()).filter(Boolean).forEach(key => {
        const rows = map.get(key) || [];
        rows.push(order);
        map.set(key, rows);
      });
    });
    return map;
  };
  const currentOrderMap = ordersByAccountOrCourt(raw);
  const buildNewMemberRows = (items = [], targetPeriod = {}, orderMap = new Map()) => normalizeRows(items)
    .filter(item => inPeriod(item.firstOpenDate, targetPeriod))
    .map(item => {
      const accountId = String(item.membershipAccount?.id || item.membershipAccountId || '').trim();
      const courtId = String(item.id || item.courtId || '').trim();
      const fallbackRechargeRows = [...new Map([...(orderMap.get(accountId) || []), ...(orderMap.get(courtId) || [])]
        .map(row => [String(row?.id || `${row?.membershipAccountId || ''}:${row?.courtId || ''}:${row?.purchaseDate || row?.createdAt || ''}`), row])).values()];
      const currentRechargeRows = normalizeRows(item.rechargeRows?.length ? item.rechargeRows : fallbackRechargeRows)
        .filter(row => inPeriod(row.purchaseDate || row.paidAt || row.paymentTime || row.createdAt, targetPeriod));
      return {
        name: item.displayName || '-',
        firstOpenDate: String(item.firstOpenDate || '').slice(0, 10) || '-',
        tier: item.membershipTierLabel || '-',
        amount: numberValue(currentRechargeRows.reduce((sum, row) => sum + fieldNumber(row, ['paidAmount', 'rechargeAmount', 'finalAmount', 'amount']), 0))
      };
    })
    .sort((a, b) => String(a.firstOpenDate || '').localeCompare(String(b.firstOpenDate || '')) || String(a.name || '').localeCompare(String(b.name || ''), 'zh-CN'));
  const previousOrderMap = ordersByAccountOrCourt(previousRaw);
  const newMemberRows = buildNewMemberRows(memberItems, period, currentOrderMap);
  const previousNewMemberRows = buildNewMemberRows(previousView.items || [], previousPeriod, previousOrderMap);
  const summary = view.summary?.membershipFinanceSummary || {};
  const previousHistoryRedeemed = historyRedemptionAmount(previousView.items || [], previousPeriod);
  const currentHistoryRedeemed = historyRedemptionAmount(memberItems, period);
  const previousRedeemedAmount = financeRedemptionAmount(previousRaw, previousPeriod) ?? (previousHistoryRedeemed || indexedRedemptionAmount(previousRaw, previousPeriod));
  const redeemedAmount = financeRedemptionAmount(raw, period) ?? (currentHistoryRedeemed || indexedRedemptionAmount(raw, period));
  const currentRechargeAmount = numberValue(newMemberRows.reduce((sum, row) => sum + fieldNumber(row, ['amount']), 0));
  const previousRechargeAmount = numberValue(previousNewMemberRows.reduce((sum, row) => sum + fieldNumber(row, ['amount']), 0));
  return {
    totalMembers: numberValue(summary.memberCount),
    newMembers: newMemberRows.length,
    totalAmount: numberValue(summary.paidAmount),
    newAmount: currentRechargeAmount,
    redeemedAmount,
    compare: {
      newMembers: compareValue(newMemberRows.length, previousNewMemberRows.length),
      newAmount: compareValue(currentRechargeAmount, previousRechargeAmount),
      redeemedAmount: compareValue(redeemedAmount, previousRedeemedAmount)
    },
    newMemberRows,
    typeRows: []
  };
}

function buildStoredValueFromRaw(raw = {}, period = {}, previousRaw = {}) {
  const readModel = buildStoredValueReadModel(raw, period, previousRaw);
  return readModel;
}

function purchaseAmount(row = {}) {
  return fieldNumber(row, ['finalAmount', 'amountPaid', 'actualAmount', 'paidAmount', 'receivedAmount', 'amount']);
}

function purchaseStudentKey(row = {}) {
  return textValue(row, ['studentId', 'studentName', 'customerName', 'name']) || textValue(row, ['id']);
}

function isFirstPurchase(row = {}, allRows = []) {
  const explicit = String(row.firstPurchase || row.isFirstPurchase || row.paidStatus || row.courseDealPath || '').trim();
  if (/首次/.test(explicit) || explicit === 'true' || explicit === '1') return true;
  if (/续/.test(explicit) || explicit === 'false') return false;
  const key = purchaseStudentKey(row);
  const date = String(row.purchaseDate || row.createdAt || '').slice(0, 10);
  if (!key || !date) return false;
  return !allRows.some(item => item !== row && purchaseStudentKey(item) === key && String(item.purchaseDate || item.createdAt || '').slice(0, 10) < date);
}

function studentTypeMaps(raw = {}) {
  const byId = new Map();
  const byName = new Map();
  normalizeRows(raw.students).forEach(row => {
    const type = textValue(row, ['type', 'customerType']);
    if (!type) return;
    const id = String(row.id || '').trim();
    const name = String(row.name || row.studentName || row.customerName || '').trim();
    if (id) byId.set(id, type);
    if (name) byName.set(name, type);
  });
  return { byId, byName };
}

function customerTypeForRow(row = {}, maps = { byId: new Map(), byName: new Map() }) {
  const explicit = textValue(row, ['customerType', 'studentType', 'type']);
  if (/青少年|少儿|儿童|孩子|小朋友/.test(explicit)) return '青少年';
  if (/成人/.test(explicit)) return '成人';
  const id = String(row.studentId || row.customerId || '').trim();
  const name = String(row.studentName || row.customerName || row.name || '').trim();
  const mapped = (id && maps.byId.get(id)) || (name && maps.byName.get(name)) || '';
  if (/青少年|少儿|儿童|孩子|小朋友/.test(mapped)) return '青少年';
  return '成人';
}

function completedCourseScheduleRows(raw = {}, period = {}) {
  return normalizeRows(raw.schedule)
    .filter(row => isValidSchedule(row, period))
    .filter(row => effectiveScheduleStatus(row) === '已结束');
}

function scheduleStudentKey(row = {}) {
  return textValue(row, ['studentId', 'studentName', 'leadName', 'customerName', 'name']);
}

function buildCourseRevenueFromRaw(raw = {}, period = {}, previousRaw = {}) {
  const maps = studentTypeMaps(raw);
  const privatePurchases = normalizeRows(raw.purchases).filter(row => campusMatches(row) && isPrivateCoursePurchase(row));
  const currentPurchases = privatePurchases.filter(row => inPeriod(row.purchaseDate || row.createdAt, period));
  const previousPeriod = { startDate: period.previousStartDate, endDate: period.previousEndDate };
  const previousPurchases = normalizeRows(previousRaw.purchases || raw.purchases).filter(row => campusMatches(row) && isPrivateCoursePurchase(row) && inPeriod(row.purchaseDate || row.createdAt, previousPeriod));
  const firstRows = currentPurchases.filter(row => isFirstPurchase(row, privatePurchases));
  const renewalRows = currentPurchases.filter(row => !isFirstPurchase(row, privatePurchases));
  const totalFirstRows = privatePurchases.filter(row => isFirstPurchase(row, privatePurchases));
  const totalRenewalRows = privatePurchases.filter(row => !isFirstPurchase(row, privatePurchases));
  const previousFirstRows = previousPurchases.filter(row => isFirstPurchase(row, privatePurchases));
  const previousRenewalRows = previousPurchases.filter(row => !isFirstPurchase(row, privatePurchases));
  const paidPeople = new Set(currentPurchases.map(purchaseStudentKey).filter(Boolean)).size;
  const previousPaidPeople = new Set(previousPurchases.map(purchaseStudentKey).filter(Boolean)).size;
  const allFinanceRows = weeklyFinanceRows(raw, {});
  const financeRows = weeklyFinanceRows(raw, period);
  const previousFinanceRows = weeklyFinanceRows(previousRaw, previousPeriod);
  const courseReceiptRows = financeRows.filter(row => isCourseFinanceRow(row) && isFinanceReceipt(row));
  const previousCourseReceiptRows = previousFinanceRows.filter(row => isCourseFinanceRow(row) && isFinanceReceipt(row));
  const allCourseReceiptRows = allFinanceRows.filter(row => isCourseFinanceRow(row) && isFinanceReceipt(row));
  const consumedRows = financeRows.filter(row => isCourseFinanceRow(row) && fieldNumber(row, ['recognizedRevenueDelta']) !== 0);
  const totalConsumedRows = allFinanceRows.filter(row => isCourseFinanceRow(row) && fieldNumber(row, ['recognizedRevenueDelta']) !== 0);
  const previousConsumedRows = previousFinanceRows.filter(row => isCourseFinanceRow(row) && fieldNumber(row, ['recognizedRevenueDelta']) !== 0);
  const currentAmount = courseReceiptRows.length ? financeSum(courseReceiptRows, 'cashDelta') : currentPurchases.reduce((sum, row) => sum + purchaseAmount(row), 0);
  const previousAmount = previousCourseReceiptRows.length ? financeSum(previousCourseReceiptRows, 'cashDelta') : previousPurchases.reduce((sum, row) => sum + purchaseAmount(row), 0);
  const totalReceiptAmount = allCourseReceiptRows.length ? financeSum(allCourseReceiptRows, 'cashDelta') : privatePurchases.reduce((sum, row) => sum + purchaseAmount(row), 0);
  const consumedAmount = financeSum(consumedRows, 'recognizedRevenueDelta');
  const totalConsumedAmount = financeSum(totalConsumedRows, 'recognizedRevenueDelta');
  const previousConsumedAmount = financeSum(previousConsumedRows, 'recognizedRevenueDelta');
  const lessonRows = completedCourseScheduleRows(raw, period);
  const previousLessonRows = completedCourseScheduleRows(previousRaw, previousPeriod);
  const lessonPeople = new Set(lessonRows.map(scheduleStudentKey).filter(Boolean)).size;
  const previousLessonPeople = new Set(previousLessonRows.map(scheduleStudentKey).filter(Boolean)).size;
  const completedHours = numberValue(lessonRows.reduce((sum, row) => sum + scheduleHours(row), 0));
  const previousCompletedHours = numberValue(previousLessonRows.reduce((sum, row) => sum + scheduleHours(row), 0));
  const depletedEntitlements = normalizeRows(raw.entitlements).filter(row => {
    if (!campusMatches(row)) return false;
    const remaining = optionalNumber(row.remainingLessons);
    if (remaining === null || remaining > 0) return false;
    return inPeriod(row.depletedAt || row.updatedAt || row.lastConsumedAt || row.createdAt, period);
  });
  const buildTypeRow = type => {
    const purchaseRows = currentPurchases.filter(row => customerTypeForRow(row, maps) === type);
    const typeLessonRows = lessonRows.filter(row => customerTypeForRow(row, maps) === type);
    const typeReceiptRows = courseReceiptRows.filter(row => customerTypeForRow(row, maps) === type);
    const typeConsumedRows = consumedRows.filter(row => customerTypeForRow(row, maps) === type);
    return {
      type,
      paidPeople: new Set(purchaseRows.map(purchaseStudentKey).filter(Boolean)).size,
      newAmount: financeSum(typeReceiptRows, 'cashDelta') || purchaseRows.reduce((sum, row) => sum + purchaseAmount(row), 0),
      lessonPeople: new Set(typeLessonRows.map(scheduleStudentKey).filter(Boolean)).size,
      completedHours: numberValue(typeLessonRows.reduce((sum, row) => sum + scheduleHours(row), 0)),
      consumedAmount: financeSum(typeConsumedRows, 'recognizedRevenueDelta')
    };
  };
  return {
    totalPeople: new Set(privatePurchases.map(purchaseStudentKey).filter(Boolean)).size,
    totalAmount: totalReceiptAmount,
    totalConsumedAmount: numberValue(totalConsumedAmount || consumedAmount),
    totalRepeatRate: percent(new Set(totalRenewalRows.map(purchaseStudentKey).filter(Boolean)).size, new Set(totalFirstRows.map(purchaseStudentKey).filter(Boolean)).size),
    paidPeople,
    newPeople: new Set(firstRows.map(purchaseStudentKey).filter(Boolean)).size,
    newAmount: currentAmount,
    lessonPeople,
    completedHours,
    consumedAmount: numberValue(consumedAmount),
    renewalPeople: new Set(renewalRows.map(purchaseStudentKey).filter(Boolean)).size,
    renewalAmount: renewalRows.reduce((sum, row) => sum + purchaseAmount(row), 0),
    expiringPeople: new Set(depletedEntitlements.map(purchaseStudentKey).filter(Boolean)).size,
    typeRows: ['成人', '青少年'].map(buildTypeRow),
    compare: {
      people: compareValue(firstRows.length, previousFirstRows.length),
      paidPeople: compareValue(paidPeople, previousPaidPeople),
      amount: compareValue(currentAmount, previousAmount),
      lessonPeople: compareValue(lessonPeople, previousLessonPeople),
      completedHours: compareValue(completedHours, previousCompletedHours),
      consumedAmount: compareValue(consumedAmount, previousConsumedAmount),
      renewalPeople: compareValue(new Set(renewalRows.map(purchaseStudentKey).filter(Boolean)).size, new Set(previousRenewalRows.map(purchaseStudentKey).filter(Boolean)).size)
    }
  };
}

function buildCoachFromSchedules(raw = {}, period = {}, previousRaw = {}) {
  const activeNames = new Set(normalizeRows(raw.coaches).filter(isActiveCoach).map(row => cleanCoachName(row.name || row.coachName)).filter(Boolean));
  const previousPeriod = { startDate: period.previousStartDate, endDate: period.previousEndDate };
  const build = (rows = [], targetPeriod = {}) => {
    const map = new Map();
    normalizeRows(rows).filter(row => isValidSchedule(row, targetPeriod)).forEach(row => {
      const clean = cleanCoachName(row.coach || row.coachName);
      if (!clean || clean === '小鹿' || (activeNames.size && !activeNames.has(clean))) return;
      const coach = normalizeCoachDisplayName(clean);
      const current = map.get(coach) || { coach, privateHours: 0, smallClassHours: 0, trialHours: 0, specialHours: 0, sparringHours: 0, lessonRows: [] };
      current[scheduleCourseBucket(row)] += scheduleHours(row);
      current.lessonRows.push({
        date: String(row.startTime || '').slice(0, 10),
        time: `${String(row.startTime || '').slice(11, 16)}-${String(row.endTime || '').slice(11, 16)}`,
        student: row.studentName || row.leadName || '-',
        courseType: row.courseType || row.experienceType || row.productName || row.packageName || '-',
        hours: scheduleHours(row),
        court: row.courtName || row.venue || row.location || row.court || '-'
      });
      map.set(coach, current);
    });
    return Array.from(map.values()).map(row => {
      const total = numberValue(row.privateHours + row.smallClassHours + row.trialHours + row.specialHours + row.sparringHours);
      return { ...row, totalHours: total, scheduledCount: total };
    }).filter(row => row.totalHours > 0);
  };
  const rows = build(raw.schedule, period);
  const prevRows = build(previousRaw.schedule || raw.schedule, previousPeriod);
  const prevMap = new Map(prevRows.map(row => [row.coach, row]));
  const rowsWithCompare = rows.map(row => ({ ...row, compare: compareValue(row.totalHours, prevMap.get(row.coach)?.totalHours || 0), previousHours: prevMap.get(row.coach)?.totalHours || 0 }));
  const total = rowsWithCompare.reduce((acc, row) => {
    acc.privateHours += row.privateHours;
    acc.smallClassHours += row.smallClassHours;
    acc.trialHours += row.trialHours;
    acc.specialHours += row.specialHours;
    acc.sparringHours += row.sparringHours;
    return acc;
  }, { privateHours: 0, smallClassHours: 0, trialHours: 0, specialHours: 0, sparringHours: 0 });
  const totalScheduled = numberValue(total.privateHours + total.smallClassHours + total.trialHours + total.specialHours + total.sparringHours);
  const previousTotalScheduled = numberValue(prevRows.reduce((sum, row) => sum + row.totalHours, 0));
  return {
    totalScheduled,
    totalHours: totalScheduled,
    privateHours: numberValue(total.privateHours),
    smallClassHours: numberValue(total.smallClassHours),
    trialHours: numberValue(total.trialHours),
    specialHours: numberValue(total.specialHours),
    sparringHours: numberValue(total.sparringHours),
    compare: {
      totalHours: compareValue(totalScheduled, previousTotalScheduled),
      totalScheduled: compareValue(totalScheduled, previousTotalScheduled)
    },
    rows: rowsWithCompare
  };
}

function courtHistoryRows(raw = {}, period = {}) {
  return normalizeRows(raw.courts).flatMap(court => normalizeCourtHistory(court.history).map(row => ({ ...row, court })))
    .filter(row => inPeriod(courtHistoryBusinessDate(row) || row.date || row.createdAt, period) && campusMatches(row.court || row));
}

function clockMinutes(value = '') {
  const match = String(value || '').match(/(\d{1,2}):(\d{2})/);
  if (!match) return null;
  return Number(match[1]) * 60 + Number(match[2]);
}

function durationFromClockRange(startValue = '', endValue = '') {
  const start = clockMinutes(startValue);
  const end = clockMinutes(endValue);
  if (start === null || end === null || end <= start) return 0;
  return numberValue((end - start) / 60);
}

function financeRowDurationHours(row = {}) {
  const explicit = fieldNumber(row, ['durationHours', 'hours', 'bookingHours', 'occupiedHours']);
  if (explicit > 0) return explicit;
  const text = String(row.timeText || row.time || '').trim();
  const range = text.match(/(\d{1,2}:\d{2})\s*[-至~]\s*(\d{1,2}:\d{2})/);
  if (range) return durationFromClockRange(range[1], range[2]);
  return durationFromClockRange(row.startTime, row.endTime);
}

function financeCourtAmount(row = {}) {
  return Math.abs(
    Number(row.transactionAmount)
    || Number(row.cashDelta)
    || Number(row.recognizedRevenueDelta)
    || Number(row.amount)
    || 0
  );
}

function standardCourtUsageType(row = {}) {
  const direct = String(row.businessTypeLevel2 || row.businessType || '').trim();
  if (COURT_USAGE_TYPES.some(item => item.label === direct)) return direct;
  const normalized = businessTaxonomy.normalizeBusinessType({
    businessType: row.businessType,
    category: row.category || row.displayBusinessType || row.incomeType || row.sourceProject || row.name || row.label || row.businessName,
    paymentChannel: row.paymentChannel || row.payMethod
  });
  if (COURT_USAGE_TYPES.some(item => item.label === normalized.level2)) return normalized.level2;
  const text = rowLabel(row, ['displayBusinessType', 'category', 'type', 'name', 'label', 'businessName', 'sourceProject', 'sourceCategory'], '');
  if (/免费/.test(text)) return '内部使用';
  const match = COURT_USAGE_TYPES.find(item => text.includes(item.label) || text.includes(item.label.replace('订场', '场地使用')));
  return match?.label || '';
}

function financeCampusMatches(row = {}) {
  const campusFields = [row.campus, row.campusName, row.campusCode, row.sourceCampus, row.location, row.venue]
    .map(value => String(value || '').trim())
    .filter(Boolean);
  return !campusFields.length || weeklyCampusMatchesStrict(row);
}

function weeklyFinanceRows(raw = {}, period = {}) {
  return normalizeRows(raw.financeNormalizedRows)
    .filter(row => !row.differenceReason)
    .filter(row => financeCampusMatches(row))
    .filter(row => inOptionalPeriod(row.businessDate || row.date || row.purchaseDate || row.relatedDate || row.createdAt, period));
}

function financeAction(row = {}) {
  return String(row.action || row.transactionType || '').trim();
}

function financeTypeText(row = {}) {
  return String(row.businessType || row.displayBusinessType || row.businessTypeLevel2 || row.businessTypeLevel1 || '').trim();
}

function isFinanceReceipt(row = {}) {
  return financeAction(row) === '收款' && fieldNumber(row, ['cashDelta']) > 0;
}

function isCourseFinanceRow(row = {}) {
  return financeTypeText(row) === '课程' || String(row.businessTypeLevel1 || '').trim() === '课程';
}

function isStoredValueFinanceRow(row = {}) {
  return financeTypeText(row) === '会员储值' || String(row.businessTypeLevel1 || '').trim() === '储值';
}

function isMemberBookingFinanceRow(row = {}) {
  return financeTypeText(row) === '会员订场' || (String(row.businessTypeLevel1 || '') === '场地' && String(row.businessTypeLevel2 || '') === '会员订场');
}

function isGuestBookingFinanceRow(row = {}) {
  const type = financeTypeText(row);
  return type === '散客订场' || type === '约球局' || standardCourtUsageType(row) === '散客订场' || standardCourtUsageType(row) === '约球局';
}

function financeSum(rows = [], key = '') {
  return numberValue(normalizeRows(rows).reduce((sum, row) => sum + (Number(row?.[key]) || 0), 0));
}

function buildWeeklyFinanceSummary(raw = {}, period = {}, previousRaw = {}, operations = {}, previous = {}) {
  const currentRows = weeklyFinanceRows(raw, period);
  const previousRows = weeklyFinanceRows(previousRaw, { startDate: period.previousStartDate, endDate: period.previousEndDate });
  const hasFinanceRows = currentRows.length > 0;
  const hasPreviousFinanceRows = previousRows.length > 0;
  const receiptRows = currentRows.filter(isFinanceReceipt);
  const previousReceiptRows = previousRows.filter(isFinanceReceipt);
  const courseReceiptRows = receiptRows.filter(isCourseFinanceRow);
  const previousCourseReceiptRows = previousReceiptRows.filter(isCourseFinanceRow);
  const storedValueReceiptRows = receiptRows.filter(isStoredValueFinanceRow);
  const previousStoredValueReceiptRows = previousReceiptRows.filter(isStoredValueFinanceRow);
  const bookingReceiptRows = receiptRows.filter(isGuestBookingFinanceRow);
  const previousBookingReceiptRows = previousReceiptRows.filter(isGuestBookingFinanceRow);
  const currentRecognizedRows = currentRows.filter(row => fieldNumber(row, ['recognizedRevenueDelta']) !== 0);
  const previousRecognizedRows = previousRows.filter(row => fieldNumber(row, ['recognizedRevenueDelta']) !== 0);
  const courseRecognizedRows = currentRows.filter(row => isCourseFinanceRow(row) && fieldNumber(row, ['recognizedRevenueDelta']) !== 0);
  const previousCourseRecognizedRows = previousRows.filter(row => isCourseFinanceRow(row) && fieldNumber(row, ['recognizedRevenueDelta']) !== 0);
  const memberBookingRecognizedRows = currentRows.filter(row => isMemberBookingFinanceRow(row) && fieldNumber(row, ['recognizedRevenueDelta']) !== 0);
  const previousMemberBookingRecognizedRows = previousRows.filter(row => isMemberBookingFinanceRow(row) && fieldNumber(row, ['recognizedRevenueDelta']) !== 0);
  const guestBookingRecognizedRows = currentRows.filter(row => isGuestBookingFinanceRow(row) && fieldNumber(row, ['recognizedRevenueDelta']) !== 0);
  const previousGuestBookingRecognizedRows = previousRows.filter(row => isGuestBookingFinanceRow(row) && fieldNumber(row, ['recognizedRevenueDelta']) !== 0);
  const cashReceived = hasFinanceRows ? financeSum(receiptRows, 'cashDelta') : cardNumber(operations.overview || {}, ['totalIncome']);
  const previousCashReceived = hasPreviousFinanceRows ? financeSum(previousReceiptRows, 'cashDelta') : cardNumber(previous.overview || {}, ['totalIncome']);
  const businessRevenue = hasFinanceRows ? financeSum(currentRecognizedRows, 'recognizedRevenueDelta') : cardNumber(operations.overview || {}, ['recognizedRevenue']);
  const previousBusinessRevenue = hasPreviousFinanceRows ? financeSum(previousRecognizedRows, 'recognizedRevenueDelta') : cardNumber(previous.overview || {}, ['recognizedRevenue']);
  return {
    businessRevenue,
    cashReceived,
    receipts: {
      totalAmount: cashReceived,
      courseAmount: hasFinanceRows ? financeSum(courseReceiptRows, 'cashDelta') : optionalCardNumber(operations.overview || {}, ['courseIncome']),
      bookingAmount: hasFinanceRows ? financeSum(bookingReceiptRows, 'cashDelta') : optionalCardNumber(operations.overview || {}, ['bookingIncome', 'courtIncome']),
      storedValueAmount: hasFinanceRows ? financeSum(storedValueReceiptRows, 'cashDelta') : optionalCardNumber(operations.overview || {}, ['storedValueIncome']),
      compare: {
        totalAmount: compareValue(cashReceived, previousCashReceived),
        courseAmount: compareValue(hasFinanceRows ? financeSum(courseReceiptRows, 'cashDelta') : 0, hasPreviousFinanceRows ? financeSum(previousCourseReceiptRows, 'cashDelta') : 0),
        bookingAmount: compareValue(hasFinanceRows ? financeSum(bookingReceiptRows, 'cashDelta') : 0, hasPreviousFinanceRows ? financeSum(previousBookingReceiptRows, 'cashDelta') : 0),
        storedValueAmount: compareValue(hasFinanceRows ? financeSum(storedValueReceiptRows, 'cashDelta') : 0, hasPreviousFinanceRows ? financeSum(previousStoredValueReceiptRows, 'cashDelta') : 0)
      }
    },
    recognized: {
      businessRevenue,
      courseConsumedRevenue: hasFinanceRows ? financeSum(courseRecognizedRows, 'recognizedRevenueDelta') : optionalCardNumber(operations.overview || {}, ['courseRecognized']),
      memberBookingConsumedRevenue: hasFinanceRows ? financeSum(memberBookingRecognizedRows, 'recognizedRevenueDelta') : optionalCardNumber(operations.overview || {}, ['storedValueConsumed', 'membershipStoredValueConsumed']),
      guestBookingRevenue: hasFinanceRows ? financeSum(guestBookingRecognizedRows, 'recognizedRevenueDelta') : optionalCardNumber(operations.overview || {}, ['bookingRecognized', 'courtRecognized']),
      compare: {
        businessRevenue: compareValue(businessRevenue, previousBusinessRevenue),
        courseConsumedRevenue: compareValue(hasFinanceRows ? financeSum(courseRecognizedRows, 'recognizedRevenueDelta') : 0, hasPreviousFinanceRows ? financeSum(previousCourseRecognizedRows, 'recognizedRevenueDelta') : 0),
        memberBookingConsumedRevenue: compareValue(hasFinanceRows ? financeSum(memberBookingRecognizedRows, 'recognizedRevenueDelta') : 0, hasPreviousFinanceRows ? financeSum(previousMemberBookingRecognizedRows, 'recognizedRevenueDelta') : 0),
        guestBookingRevenue: compareValue(hasFinanceRows ? financeSum(guestBookingRecognizedRows, 'recognizedRevenueDelta') : 0, hasPreviousFinanceRows ? financeSum(previousGuestBookingRecognizedRows, 'recognizedRevenueDelta') : 0)
      }
    },
    compare: {
      businessRevenue: compareValue(businessRevenue, previousBusinessRevenue),
      cashReceived: compareValue(cashReceived, previousCashReceived)
    }
  };
}

function courtUsageIndexStats(raw = {}, period = {}) {
  return normalizeRows(raw.courtAccountListIndexRows)
    .filter(row => weeklyCampusMatchesStrict(row.item || row))
    .flatMap(row => normalizeRows(row.bookingDayStats))
    .filter(row => inPeriod(row.date, period))
    .reduce((acc, row) => {
      const bookingCount = fieldNumber(row, ['bookingCount']);
      const bookingHours = fieldNumber(row, ['bookingHours']);
      const memberCount = fieldNumber(row, ['memberBookingCount']);
      const guestCount = fieldNumber(row, ['guestBookingCount']);
      const memberHours = fieldNumber(row, ['memberBookingHours']) || (memberCount > 0 && memberCount === bookingCount ? bookingHours : 0);
      const guestHours = fieldNumber(row, ['guestBookingHours']) || (guestCount > 0 && guestCount === bookingCount ? bookingHours : 0);
      acc.member.count += memberCount;
      acc.member.hours += memberHours;
      acc.member.amount += fieldNumber(row, ['memberBookingAmount']);
      acc.guest.count += guestCount;
      acc.guest.hours += guestHours;
      acc.guest.amount += fieldNumber(row, ['guestBookingAmount']);
      acc.daily.set(row.date, numberValue((acc.daily.get(row.date) || 0) + fieldNumber(row, ['bookingHours'])));
      return acc;
    }, {
      member: { count: 0, hours: 0, amount: 0, receivableAmount: 0 },
      guest: { count: 0, hours: 0, amount: 0, receivableAmount: 0 },
      daily: new Map()
    });
}

function buildCourtUsageFromRaw(raw = {}, period = {}, previousRaw = {}) {
  const previousPeriod = { startDate: period.previousStartDate, endDate: period.previousEndDate };
  const historyRows = courtHistoryRows(raw, period);
  const previousHistoryRows = courtHistoryRows(previousRaw, previousPeriod);
  const courtFinanceRow = row => /场地|订场|约球|内部使用|领导/.test(String(`${row.businessType || ''} ${row.displayBusinessType || ''} ${row.category || ''}`));
  const financeRows = weeklyFinanceRows(raw, period).filter(courtFinanceRow);
  const previousFinanceRows = weeklyFinanceRows(previousRaw, previousPeriod).filter(courtFinanceRow);
  const indexStats = courtUsageIndexStats(raw, period);
  const previousIndexStats = courtUsageIndexStats(previousRaw, previousPeriod);
  const paidCourtUsageType = row => !['领导订场', '内部使用'].includes(standardCourtUsageType(row));
  const sumHistory = (rows, meta) => rows.filter(row => standardCourtUsageType(row) === meta.label)
    .reduce((acc, row) => ({
      count: acc.count + 1,
      hours: acc.hours + bookingDurationHours(row),
      amount: acc.amount + (['free', 'leader'].includes(meta.key) ? 0 : fieldNumber(row, ['amount', 'actualAmount', 'cashAmount'])),
      receivableAmount: acc.receivableAmount + fieldNumber(row, ['receivableAmount', 'originalAmount', 'concessionAmount', 'discountAmount', 'amount'])
    }), { count: 0, hours: 0, amount: 0, receivableAmount: 0 });
  const sumFinance = (rows, meta) => rows.filter(row => standardCourtUsageType(row) === meta.label)
    .reduce((acc, row) => ({
      count: acc.count + 1,
      hours: acc.hours + financeRowDurationHours(row),
      amount: acc.amount + (['free', 'leader'].includes(meta.key) ? 0 : financeCourtAmount(row)),
      receivableAmount: acc.receivableAmount + fieldNumber(row, ['receivableAmount', 'originalAmount', 'concessionAmount', 'discountAmount'])
    }), { count: 0, hours: 0, amount: 0, receivableAmount: 0 });
  const dailyUsedHours = new Map();
  const previousDailyUsedHours = new Map();
  const historyTypeLabels = new Set(historyRows.map(standardCourtUsageType).filter(Boolean));
  const previousHistoryTypeLabels = new Set(previousHistoryRows.map(standardCourtUsageType).filter(Boolean));
  historyRows.forEach(row => {
    const day = courtHistoryBusinessDate(row) || String(row.date || row.createdAt || '').slice(0, 10);
    if (day && paidCourtUsageType(row)) dailyUsedHours.set(day, numberValue((dailyUsedHours.get(day) || 0) + bookingDurationHours(row)));
  });
  financeRows
    .filter(row => paidCourtUsageType(row) && !historyTypeLabels.has(standardCourtUsageType(row)))
    .forEach(row => {
      const day = String(row.businessDate || row.date || row.createdAt || '').slice(0, 10);
      if (day) dailyUsedHours.set(day, numberValue((dailyUsedHours.get(day) || 0) + financeRowDurationHours(row)));
    });
  if (!historyRows.length && indexStats.daily.size) {
    indexStats.daily.forEach((hours, day) => dailyUsedHours.set(day, numberValue((dailyUsedHours.get(day) || 0) + hours)));
  }
  previousHistoryRows.forEach(row => {
    const day = courtHistoryBusinessDate(row) || String(row.date || row.createdAt || '').slice(0, 10);
    if (day && paidCourtUsageType(row)) previousDailyUsedHours.set(day, numberValue((previousDailyUsedHours.get(day) || 0) + bookingDurationHours(row)));
  });
  previousFinanceRows
    .filter(row => paidCourtUsageType(row) && !previousHistoryTypeLabels.has(standardCourtUsageType(row)))
    .forEach(row => {
      const day = String(row.businessDate || row.date || row.createdAt || '').slice(0, 10);
      if (day) previousDailyUsedHours.set(day, numberValue((previousDailyUsedHours.get(day) || 0) + financeRowDurationHours(row)));
    });
  if (!previousHistoryRows.length && previousIndexStats.daily.size) {
    previousIndexStats.daily.forEach((hours, day) => previousDailyUsedHours.set(day, numberValue((previousDailyUsedHours.get(day) || 0) + hours)));
  }
  const dailyRows = buildDailyCourtRows(raw, period, dailyUsedHours);
  const previousDailyRows = buildDailyCourtRows(previousRaw, previousPeriod, previousDailyUsedHours);
  const result = COURT_USAGE_TYPES.map(meta => {
    const current = sumHistory(historyRows, meta);
    const previous = sumHistory(previousHistoryRows, meta);
    const financeCurrent = sumFinance(financeRows, meta);
    const financePrevious = sumFinance(previousFinanceRows, meta);
    const indexedCurrent = indexStats[meta.key] || {};
    const indexedPrevious = previousIndexStats[meta.key] || {};
    if (!current.count && financeCurrent.count) current.count = financeCurrent.count;
    if (!current.hours && financeCurrent.hours) current.hours = financeCurrent.hours;
    if (!current.amount && financeCurrent.amount) current.amount = financeCurrent.amount;
    if (!current.receivableAmount && financeCurrent.receivableAmount) current.receivableAmount = financeCurrent.receivableAmount;
    if (!current.count && indexedCurrent.count) current.count = indexedCurrent.count;
    if (!current.hours && indexedCurrent.hours) current.hours = indexedCurrent.hours;
    if (!current.amount && indexedCurrent.amount) current.amount = indexedCurrent.amount;
    if (!current.receivableAmount && indexedCurrent.receivableAmount) current.receivableAmount = indexedCurrent.receivableAmount;
    if (!previous.count && financePrevious.count) previous.count = financePrevious.count;
    if (!previous.hours && financePrevious.hours) previous.hours = financePrevious.hours;
    if (!previous.amount && financePrevious.amount) previous.amount = financePrevious.amount;
    if (!previous.receivableAmount && financePrevious.receivableAmount) previous.receivableAmount = financePrevious.receivableAmount;
    if (!previous.count && indexedPrevious.count) previous.count = indexedPrevious.count;
    if (!previous.hours && indexedPrevious.hours) previous.hours = indexedPrevious.hours;
    if (!previous.amount && indexedPrevious.amount) previous.amount = indexedPrevious.amount;
    if (!previous.receivableAmount && indexedPrevious.receivableAmount) previous.receivableAmount = indexedPrevious.receivableAmount;
    if (['free', 'leader'].includes(meta.key)) current.amount = 0;
    return {
      ...meta,
      count: numberValue(current.count),
      hours: numberValue(current.hours),
      amount: numberValue(current.amount),
      receivableAmount: numberValue(current.receivableAmount),
      compare: {
        hours: compareValue(current.hours, previous.hours),
        amount: compareValue(current.amount, previous.amount)
      }
    };
  });
  const totalHours = result.reduce((sum, row) => sum + row.hours, 0);
  const revenueUsageHours = result
    .filter(row => !['free', 'leader'].includes(row.key))
    .reduce((sum, row) => sum + row.hours, 0);
  const previousRevenueUsageHours = COURT_USAGE_TYPES.map(meta => {
    const previous = sumHistory(previousHistoryRows, meta);
    const financePrevious = sumFinance(previousFinanceRows, meta);
    const indexedPrevious = previousIndexStats[meta.key] || {};
    if (!previous.hours && financePrevious.hours) previous.hours = financePrevious.hours;
    if (!previous.hours && indexedPrevious.hours) previous.hours = indexedPrevious.hours;
    return { key: meta.key, hours: previous.hours };
  }).filter(row => !['free', 'leader'].includes(row.key)).reduce((sum, row) => sum + row.hours, 0);
  const totalAvailableHours = numberValue(4 * 14 * (periodDayCount(period) || 7));
  const previousTotalAvailableHours = numberValue(4 * 14 * (periodDayCount(previousPeriod) || 7));
  const utilizationRate = cappedPercent(revenueUsageHours, totalAvailableHours);
  const previousUtilizationRate = cappedPercent(previousRevenueUsageHours, previousTotalAvailableHours);
  const freeUsage = result
    .filter(row => ['free', 'leader'].includes(row.key))
    .reduce((acc, row) => ({
      count: acc.count + row.count,
      hours: numberValue(acc.hours + row.hours),
      amount: 0,
      receivableAmount: numberValue(acc.receivableAmount + row.receivableAmount)
    }), { count: 0, hours: 0, amount: 0, receivableAmount: 0 });
  return {
    totalAvailableHours,
    actualUsedHours: numberValue(totalHours),
    revenueUsageHours: numberValue(revenueUsageHours),
    utilizationRate,
    compare: {
      utilizationRate: compareValue(utilizationRate, previousUtilizationRate)
    },
    usageRows: result.map(row => ({ ...row, share: percent(row.hours, result.reduce((sum, item) => sum + item.hours, 0)) })),
    dailyRows,
    freeUsage
  };
}

function cardNumber(source = {}, keys = []) {
  for (const key of keys) {
    const value = source?.cards?.[key]?.value ?? source?.[key]?.value ?? source?.[key];
    if (value !== undefined && value !== null && value !== '') return numberValue(value);
  }
  return 0;
}

function optionalCardNumber(source = {}, keys = []) {
  for (const key of keys) {
    const value = source?.cards?.[key]?.value ?? source?.[key]?.value ?? source?.[key];
    const normalized = optionalNumber(value);
    if (normalized !== null) return normalized;
  }
  return null;
}

function comparisonFor(current = {}, previous = {}, currentKeys = [], previousKeys = currentKeys) {
  return compareValue(fieldNumber(current, currentKeys), fieldNumber(previous, previousKeys));
}

function normalizeRows(rows = []) {
  return Array.isArray(rows) ? rows.filter(Boolean) : [];
}

function findFreeCourtUsage(court = {}) {
  const rows = [
    ...normalizeRows(court.usageMixRows),
    ...normalizeRows(court.rows),
    ...normalizeRows(court.typeRows),
    ...normalizeRows(court.categoryRows)
  ];
  const freeRows = rows.filter(row => /免费/.test(String(row.type || row.category || row.name || row.label || '')));
  return freeRows.reduce((acc, row) => ({
    count: acc.count + numberValue(row.count || row.times || row.bookingCount),
    hours: acc.hours + numberValue(row.hours || row.durationHours || row.bookingHours),
    amount: acc.amount + numberValue(row.amount || row.actualAmount || row.cashAmount),
    receivableAmount: acc.receivableAmount + numberValue(row.receivableAmount || row.originalAmount || row.concessionAmount || row.discountAmount)
  }), { count: 0, hours: 0, amount: 0, receivableAmount: 0 });
}

function buildReportId(period = {}) {
  return `weekly:${WEEKLY_REPORT_CAMPUS_NAME}:${period.startDate}:${period.endDate}`;
}

function normalizeBaseUrl(baseUrl = '') {
  return String(baseUrl || 'https://www.flowtennis.cn').trim().replace(/\/+$/, '');
}

function buildLifetimePrivateCoursePeople(raw = {}) {
  return new Set(normalizeRows(raw.purchases)
    .filter(row => campusMatches(row) && isPrivateCoursePurchase(row))
    .map(purchaseStudentKey)
    .filter(Boolean)).size;
}

function resolveTrailingWeeklyPeriods(period = {}, count = 8) {
  const rows = [];
  let endDate = period.endDate || '';
  for (let index = 0; index < count && endDate; index += 1) {
    const startDate = addUtcDays(endDate, -7);
    rows.unshift({ startDate, endDate });
    endDate = addUtcDays(startDate, -1);
  }
  return rows;
}

function buildWeeklyTrendRows({ period = {}, operationsPayload = {}, previousOperationsPayload = {}, trendOperationsPayloads = [] } = {}) {
  const byKey = new Map();
  const pushPayload = (targetPeriod = {}, payload = {}) => {
    if (!targetPeriod.startDate || !targetPeriod.endDate || !payload) return;
    const operations = payload.operations || {};
    const raw = payload.weeklyReportRaw || {};
    const finance = buildWeeklyFinanceSummary(raw, targetPeriod, {}, operations, {});
    const sections = buildWeeklyReportSections(operations, {}, { period: targetPeriod, raw, previousRaw: {}, skipTrends: true });
    byKey.set(`${targetPeriod.startDate}:${targetPeriod.endDate}`, {
      label: `${targetPeriod.startDate.slice(5)}-${targetPeriod.endDate.slice(5)}`,
      startDate: targetPeriod.startDate,
      endDate: targetPeriod.endDate,
      businessRevenue: finance.businessRevenue,
      cashReceived: finance.cashReceived,
      courtUtilizationRate: numberValue(sections.court?.utilizationRate || 0),
      coachHours: numberValue(sections.coach?.totalHours || 0)
    });
  };
  pushPayload({ startDate: period.previousStartDate, endDate: period.previousEndDate }, previousOperationsPayload);
  pushPayload(period, operationsPayload);
  normalizeRows(trendOperationsPayloads).forEach(item => pushPayload(item.period || {}, item.payload || item));
  return Array.from(byKey.values()).sort((a, b) => String(a.endDate).localeCompare(String(b.endDate))).slice(-8);
}

function buildWeeklyBusinessReportSnapshot({
  period,
  campusName = WEEKLY_REPORT_CAMPUS_NAME,
  operationsPayload = {},
  previousOperationsPayload = {},
  totalOperationsPayload = null,
  trendOperationsPayloads = [],
  shareToken = '',
  baseUrl = 'https://www.flowtennis.cn',
  generatedAt = new Date().toISOString(),
  generationMode = 'auto'
} = {}) {
  const operations = operationsPayload.operations || {};
  const previous = previousOperationsPayload.operations || {};
  const raw = operationsPayload.weeklyReportRaw || {};
  const previousRaw = previousOperationsPayload.weeklyReportRaw || {};
  const totalOperations = totalOperationsPayload?.operations || operations;
  const totalRaw = totalOperationsPayload?.weeklyReportRaw || raw;
  const token = String(shareToken || crypto.randomBytes(16).toString('hex')).trim();
  const financeSummary = buildWeeklyFinanceSummary(raw, period, previousRaw, operations, previous);
  const totalLeads = cardValue(operations, ['conversion', 'cards', 'totalLeads']);
  const reportSections = buildWeeklyReportSections(operations, previous, { period, raw, previousRaw, financeSummary, trendOperationsPayloads });
  const utilizationRate = numberValue(reportSections.court?.utilizationRate ?? cardValue(operations, ['court', 'cards', 'utilizationRate']));
  const coachHours = numberValue(reportSections.coach?.totalHours ?? cardValue(operations, ['coach', 'cards', 'usedHours']));
  const lifetimeTotalIncome = cardValue(totalOperations, ['overview', 'cards', 'totalIncome']);
  const lifetimeCourtUtilizationRate = cardValue(totalOperations, ['court', 'cards', 'utilizationRate']) || utilizationRate;
  const lifetimePrivateCoursePeople = buildLifetimePrivateCoursePeople(totalRaw)
    || optionalCardNumber(totalOperations.overview || {}, ['courseIncomePeople', 'courseStudents'])
    || reportSections.revenue?.course?.totalPeople
    || 0;
  return {
    id: buildReportId(period),
    campusName,
    period,
    weekNumber: isoWeekNumber(period.endDate),
    generatedAt,
    generationMode,
    shareToken: token,
    shareUrl: `${normalizeBaseUrl(baseUrl)}/weekly-reports/${encodeURIComponent(token)}`,
    lifetimeSummary: {
      totalIncome: { value: lifetimeTotalIncome },
      courtUtilizationRate: { value: lifetimeCourtUtilizationRate },
      privateCoursePeople: { value: lifetimePrivateCoursePeople }
    },
    summary: {
      totalIncome: { value: financeSummary.businessRevenue, compare: financeSummary.compare.businessRevenue },
      cashReceived: { value: financeSummary.cashReceived, compare: financeSummary.compare.cashReceived },
      recognizedRevenue: { value: financeSummary.businessRevenue, compare: financeSummary.compare.businessRevenue },
      courtUsageHours: { value: numberValue(reportSections.court?.actualUsedHours || 0) },
      courtUtilizationRate: { value: utilizationRate, compare: reportSections.court?.compare?.utilizationRate || compareMetric(utilizationRate, cardValue(previous, ['court', 'cards', 'utilizationRate'])) },
      coachHours: { value: coachHours, compare: compareMetric(coachHours, cardValue(previous, ['coach', 'cards', 'usedHours'])) },
      totalLeads: { value: totalLeads, compare: compareMetric(totalLeads, cardValue(previous, ['conversion', 'cards', 'totalLeads'])) }
    },
    sections: {
      ...reportSections,
      detailsMode: 'summary-only'
    }
  };
}

function rowLabel(row = {}, keys = [], fallback = '未记录') {
  for (const key of keys) {
    const value = String(row?.[key] || '').trim();
    if (value) return value;
  }
  return fallback;
}

function courseMixHours(row = {}, names = []) {
  const mix = normalizeRows(row.courseMix);
  return mix
    .filter(item => names.some(name => String(item.type || item.name || item.label || '').includes(name)))
    .reduce((sum, item) => sum + fieldNumber(item, ['hours', 'value', 'count']), 0);
}

function normalizeCoachRows(currentRows = [], previousRows = []) {
  const previousByCoach = new Map(previousRows.map(row => [rowLabel(row, ['coach', 'coachName']), row]));
  return currentRows.map(row => {
    const coach = rowLabel(row, ['coach', 'coachName']);
    const previous = previousByCoach.get(coach) || {};
    const privateHours = fieldNumber(row, ['privateLessons', 'privateHours']) || courseMixHours(row, ['私教']);
    const smallClassHours = fieldNumber(row, ['smallClassLessons', 'smallClassHours', 'smallGroupHours']) || courseMixHours(row, ['小班']);
    const trialHours = fieldNumber(row, ['trialLessons', 'trialHours']) || courseMixHours(row, ['体验']);
    const specialHours = fieldNumber(row, ['specialLessons', 'specialHours']) || courseMixHours(row, ['专项']);
    const sparringHours = fieldNumber(row, ['sparringLessons', 'sparringHours', 'companionHours']) || courseMixHours(row, ['陪打']);
    const totalCourseHours = numberValue(privateHours + smallClassHours + trialHours + specialHours + sparringHours);
    const previousPrivateHours = fieldNumber(previous, ['privateLessons', 'privateHours']) || courseMixHours(previous, ['私教']);
    const previousSmallClassHours = fieldNumber(previous, ['smallClassLessons', 'smallClassHours', 'smallGroupHours']) || courseMixHours(previous, ['小班']);
    const previousTrialHours = fieldNumber(previous, ['trialLessons', 'trialHours']) || courseMixHours(previous, ['体验']);
    const previousSpecialHours = fieldNumber(previous, ['specialLessons', 'specialHours']) || courseMixHours(previous, ['专项']);
    const previousSparringHours = fieldNumber(previous, ['sparringLessons', 'sparringHours', 'companionHours']) || courseMixHours(previous, ['陪打']);
    const previousTotalCourseHours = numberValue(previousPrivateHours + previousSmallClassHours + previousTrialHours + previousSpecialHours + previousSparringHours);
    return {
      coach,
      totalHours: totalCourseHours || fieldNumber(row, ['usedHours', 'teachingHours', 'hours']),
      scheduledCount: totalCourseHours,
      privateHours,
      smallClassHours,
      trialHours,
      specialHours,
      sparringHours,
      compare: compareValue(totalCourseHours || fieldNumber(row, ['usedHours', 'teachingHours', 'hours']), previousTotalCourseHours || fieldNumber(previous, ['usedHours', 'teachingHours', 'hours']))
    };
  });
}

function normalizeLeadSourceRows(currentRows = [], previousRows = [], allSources = []) {
  const previousBySource = new Map(previousRows.map(row => [rowLabel(row, ['source', 'channel']), row]));
  const currentBySource = new Map(currentRows.map(row => [rowLabel(row, ['source', 'channel']), row]));
  const sourceNames = Array.from(new Set([
    ...(allSources.length ? allSources : []),
    ...currentRows.map(row => rowLabel(row, ['source', 'channel'])).filter(Boolean)
  ]));
  return sourceNames.map(sourceName => {
    const row = currentBySource.get(sourceName) || { source: sourceName };
    const source = rowLabel(row, ['source', 'channel']);
    const previous = previousBySource.get(source) || {};
    const leads = fieldNumber(row, ['totalLeads', 'leads', 'count']);
    const trial = fieldNumber(row, ['trialAttended', 'trialPathStudents', 'trialCount', 'attendance']);
    const deals = fieldNumber(row, ['trialPathDealCustomers', 'deals', 'converted']);
    return {
      source,
      leads,
      trial,
      deals,
      compare: {
        leads: comparisonFor(row, previous, ['totalLeads', 'leads', 'count']),
        trial: comparisonFor(row, previous, ['trialAttended', 'trialPathStudents', 'trialCount', 'attendance']),
        deals: comparisonFor(row, previous, ['trialPathDealCustomers', 'deals', 'converted'])
      }
    };
  });
}

function normalizeCourtUsageRows(currentCourt = {}, previousCourt = {}) {
  const rows = [
    ...normalizeRows(currentCourt.usageMixRows),
    ...normalizeRows(currentCourt.typeRows),
    ...normalizeRows(currentCourt.categoryRows)
  ];
  const previousRows = [
    ...normalizeRows(previousCourt.usageMixRows),
    ...normalizeRows(previousCourt.typeRows),
    ...normalizeRows(previousCourt.categoryRows)
  ];
  const sumBy = (sourceRows, meta) => sourceRows.filter(row => standardCourtUsageType(row) === meta.label)
    .reduce((acc, row) => ({
      count: acc.count + fieldNumber(row, ['count', 'times', 'bookingCount', 'usageCount']),
      hours: acc.hours + fieldNumber(row, ['hours', 'durationHours', 'bookingHours', 'occupiedHours']),
      amount: acc.amount + (['free', 'leader'].includes(meta.key) ? 0 : fieldNumber(row, ['amount', 'actualAmount', 'cashAmount', 'bookingAmount'])),
      receivableAmount: acc.receivableAmount + fieldNumber(row, ['receivableAmount', 'originalAmount', 'concessionAmount', 'discountAmount'])
    }), { count: 0, hours: 0, amount: 0, receivableAmount: 0 });
  const result = COURT_USAGE_TYPES.map(meta => {
    const current = sumBy(rows, meta);
    const previous = sumBy(previousRows, meta);
    return {
      ...meta,
      ...current,
      compare: {
        hours: compareValue(current.hours, previous.hours),
        amount: compareValue(current.amount, previous.amount)
      }
    };
  });
  const totalHours = result.reduce((sum, row) => sum + row.hours, 0);
  return result.map(row => ({ ...row, share: percent(row.hours, totalHours) }));
}

function normalizeWeekdayRows(court = {}) {
  const names = ['周日', '周一', '周二', '周三', '周四', '周五', '周六'];
  const trends = normalizeRows(court.trends);
  if (!trends.length) return [];
  const groups = new Map();
  trends.forEach(row => {
    const date = String(row.date || '');
    const weekday = dateKeyUtcMs(date) == null ? date : names[new Date(dateKeyUtcMs(date)).getUTCDay()];
    const current = groups.get(weekday) || { label: weekday, value: 0, count: 0 };
    current.value += fieldNumber(row, ['utilizationRate']);
    current.count += 1;
    groups.set(weekday, current);
  });
  return Array.from(groups.values()).map(row => ({ label: row.label, value: row.count ? numberValue(row.value / row.count) : 0 }));
}

function normalizeDailyCourtRows(court = {}, period = {}) {
  const byDate = new Map(normalizeRows(court.trends).map(row => [String(row.date || '').slice(0, 10), fieldNumber(row, ['utilizationRate'])]));
  if (!period.startDate || !period.endDate) return Array.from(byDate.entries()).map(([date, value]) => ({ date, label: date.slice(5), value }));
  const rows = [];
  const names = ['周日', '周一', '周二', '周三', '周四', '周五', '周六'];
  for (let day = period.startDate; day && day <= period.endDate; day = addUtcDays(day, 1)) {
    rows.push({ date: day, label: `${day.slice(5)} ${names[dayOfWeekUtc(day)]}`, value: numberValue(byDate.get(day) || 0) });
  }
  return rows;
}

function buildDailyCourtRows(raw = {}, period = {}, usedHoursByDate = new Map()) {
  if (!period.startDate || !period.endDate) return [];
  const names = ['周日', '周一', '周二', '周三', '周四', '周五', '周六'];
  const rows = [];
  for (let day = period.startDate; day && day <= period.endDate; day = addUtcDays(day, 1)) {
    const usedHours = numberValue(usedHoursByDate.get(day) || 0);
    const availableHours = 4 * 14;
    rows.push({
      date: day,
      label: `${day.slice(5)} ${names[dayOfWeekUtc(day)]}`,
      value: cappedPercent(usedHours, availableHours),
      usedHours,
      availableHours
    });
  }
  return rows;
}

function findRevenueMixValue(rows = [], names = []) {
  const row = normalizeRows(rows).find(item => names.some(name => String(item.name || item.type || item.label || '').includes(name)));
  return optionalNumber(row?.value ?? row?.amount);
}

function coachCourseTotals(rows = []) {
  return normalizeRows(rows).reduce((acc, row) => {
    acc.privateHours += fieldNumber(row, ['privateLessons', 'privateHours']) || courseMixHours(row, ['私教']);
    acc.smallClassHours += fieldNumber(row, ['smallClassLessons', 'smallClassHours', 'smallGroupHours']) || courseMixHours(row, ['小班']);
    acc.trialHours += fieldNumber(row, ['trialLessons', 'trialHours']) || courseMixHours(row, ['体验']);
    acc.specialHours += fieldNumber(row, ['specialLessons', 'specialHours']) || courseMixHours(row, ['专项']);
    acc.sparringHours += fieldNumber(row, ['sparringLessons', 'sparringHours', 'companionHours']) || courseMixHours(row, ['陪打']);
    return acc;
  }, { privateHours: 0, smallClassHours: 0, trialHours: 0, specialHours: 0, sparringHours: 0 });
}

function buildWeeklyReportSections(operations = {}, previous = {}, context = {}) {
  const period = context.period || {};
  const raw = context.raw || {};
  const previousRaw = context.previousRaw || {};
  const weeklyFinance = context.financeSummary || buildWeeklyFinanceSummary(raw, period, previousRaw, operations, previous);
  const overview = operations.overview || {};
  const prevOverview = previous.overview || {};
  const court = operations.court || {};
  const prevCourt = previous.court || {};
  const coach = operations.coach || {};
  const prevCoach = previous.coach || {};
  const conversion = operations.conversion || {};
  const prevConversion = previous.conversion || {};
  const revenueMix = normalizeRows(overview.revenueMix);
  const prevRevenueMix = normalizeRows(prevOverview.revenueMix);
  const storedValueAmount = findRevenueMixValue(revenueMix, ['会员储值']) ?? optionalCardNumber(overview, ['storedValueIncome']);
  const prevStoredValueAmount = findRevenueMixValue(prevRevenueMix, ['会员储值']) ?? optionalCardNumber(prevOverview, ['storedValueIncome']);
  const rawStoredValue = raw.membershipOrders || raw.membershipAccounts ? buildStoredValueFromRaw(raw, period, previousRaw) : null;
  const courseAmount = findRevenueMixValue(revenueMix, ['课程']) ?? optionalCardNumber(overview, ['courseIncome']);
  const prevCourseAmount = findRevenueMixValue(prevRevenueMix, ['课程']) ?? optionalCardNumber(prevOverview, ['courseIncome']);
  const courseConsumedAmount = optionalCardNumber(overview, ['courseRecognized']);
  const prevCourseConsumedAmount = optionalCardNumber(prevOverview, ['courseRecognized']);
  const totalAvailableHours = optionalCardNumber(court, ['totalAvailableHours', 'availableHours', 'capacityHours']);
  const currentCoachTotals = coachCourseTotals(coach.rows);
  const previousCoachTotals = coachCourseTotals(prevCoach.rows);
  const totalScheduled = numberValue(currentCoachTotals.privateHours + currentCoachTotals.smallClassHours + currentCoachTotals.trialHours + currentCoachTotals.specialHours + currentCoachTotals.sparringHours);
  const previousTotalScheduled = numberValue(previousCoachTotals.privateHours + previousCoachTotals.smallClassHours + previousCoachTotals.trialHours + previousCoachTotals.specialHours + previousCoachTotals.sparringHours);
  const rawCourseRevenue = raw.purchases || raw.financeNormalizedRows || raw.schedule ? buildCourseRevenueFromRaw(raw, period, previousRaw) : null;
  const rawCourt = raw.courts || raw.schedule || raw.financeNormalizedRows ? buildCourtUsageFromRaw(raw, period, previousRaw) : null;
  const rawCoach = raw.schedule ? buildCoachFromSchedules(raw, period, previousRaw) : null;
  const allLeadSources = businessTaxonomy.LEAD_SOURCE_OPTIONS.map(item => item.value);
  const leadSourceRows = normalizeLeadSourceRows(normalizeRows(conversion.sourceRows), normalizeRows(prevConversion.sourceRows), allLeadSources);
  const leadSourceDeals = leadSourceRows.reduce((sum, row) => sum + numberValue(row.deals), 0);
  const trends = context.skipTrends ? [] : buildWeeklyTrendRows({
    period,
    operationsPayload: { operations, weeklyReportRaw: raw },
    previousOperationsPayload: { operations: previous, weeklyReportRaw: previousRaw },
    trendOperationsPayloads: context.trendOperationsPayloads || []
  });
  return {
    trends,
    revenue: {
      total: {
        totalIncome: weeklyFinance.cashReceived,
        recognizedRevenue: weeklyFinance.businessRevenue,
        pendingRevenue: cardNumber(overview, ['pendingRevenue']),
        tradeCount: cardNumber(overview, ['tradeCount'])
      },
      receipts: weeklyFinance.receipts,
      recognized: weeklyFinance.recognized,
      storedValue: {
        totalMembers: rawStoredValue?.totalMembers ?? optionalCardNumber(overview, ['storedValueMembers', 'membershipStoredValueMembers']),
        newMembers: rawStoredValue?.newMembers ?? optionalCardNumber(overview, ['newStoredValueMembers', 'newMembershipStoredValueMembers']),
        totalAmount: rawStoredValue?.totalAmount ?? storedValueAmount,
        newAmount: rawStoredValue?.newAmount ?? storedValueAmount,
        redeemedAmount: rawStoredValue?.redeemedAmount ?? optionalCardNumber(overview, ['storedValueConsumed', 'membershipStoredValueConsumed']),
        compare: rawStoredValue?.compare ?? {
          newMembers: null,
          newAmount: storedValueAmount === null ? null : compareValue(storedValueAmount, prevStoredValueAmount || 0),
          redeemedAmount: null
        },
        newMemberRows: rawStoredValue?.newMemberRows ?? [],
        typeRows: rawStoredValue?.typeRows ?? (storedValueAmount === null ? [] : [{ type: '会员储值', amount: storedValueAmount, share: percent(storedValueAmount, cardNumber(overview, ['totalIncome'])) }])
      },
      course: {
        totalPeople: rawCourseRevenue?.totalPeople ?? optionalCardNumber(overview, ['courseIncomePeople', 'courseStudents']),
        totalAmount: rawCourseRevenue?.totalAmount ?? courseAmount,
        totalConsumedAmount: rawCourseRevenue?.totalConsumedAmount ?? courseConsumedAmount,
        totalRepeatRate: rawCourseRevenue?.totalRepeatRate ?? optionalCardNumber(overview, ['courseRepeatRate', 'packageRepeatRate']),
        paidPeople: rawCourseRevenue?.paidPeople ?? optionalCardNumber(overview, ['paidCoursePeople', 'newCourseIncomePeople', 'newCourseStudents']),
        newPeople: rawCourseRevenue?.newPeople ?? optionalCardNumber(overview, ['newCourseIncomePeople', 'newCourseStudents']),
        newAmount: rawCourseRevenue?.newAmount ?? courseAmount,
        lessonPeople: rawCourseRevenue?.lessonPeople ?? optionalCardNumber(overview, ['courseLessonPeople']),
        completedHours: rawCourseRevenue?.completedHours ?? null,
        consumedAmount: rawCourseRevenue?.consumedAmount ?? courseConsumedAmount,
        renewalPeople: rawCourseRevenue?.renewalPeople ?? optionalCardNumber(overview, ['renewalPeople', 'courseRenewalPeople']),
        renewalAmount: rawCourseRevenue?.renewalAmount ?? optionalCardNumber(overview, ['renewalAmount', 'courseRenewalAmount']),
        expiringPeople: rawCourseRevenue?.expiringPeople ?? optionalCardNumber(overview, ['expiringPeople', 'courseExpiringPeople']),
        expiringAmount: optionalCardNumber(overview, ['expiringAmount', 'courseExpiringAmount']),
        typeRows: rawCourseRevenue?.typeRows ?? [],
        compare: {
          people: rawCourseRevenue?.compare?.people ?? null,
          paidPeople: rawCourseRevenue?.compare?.paidPeople ?? null,
          amount: rawCourseRevenue?.compare?.amount ?? (courseAmount === null ? null : compareValue(courseAmount, prevCourseAmount || 0)),
          lessonPeople: rawCourseRevenue?.compare?.lessonPeople ?? null,
          completedHours: rawCourseRevenue?.compare?.completedHours ?? null,
          consumedAmount: rawCourseRevenue?.compare?.consumedAmount ?? (courseConsumedAmount === null ? null : compareValue(courseConsumedAmount, prevCourseConsumedAmount || 0)),
          renewalPeople: rawCourseRevenue?.compare?.renewalPeople ?? null
        }
      },
      mixRows: revenueMix
    },
    court: {
      totalAvailableHours: rawCourt?.totalAvailableHours ?? totalAvailableHours,
      actualUsedHours: rawCourt?.actualUsedHours ?? cardNumber(court, ['bookingHours']),
      revenueUsageHours: rawCourt?.revenueUsageHours ?? null,
      utilizationRate: rawCourt?.utilizationRate ?? cardNumber(court, ['utilizationRate']),
      compare: rawCourt?.compare ?? {},
      usageRows: rawCourt?.usageRows ?? normalizeCourtUsageRows(court, prevCourt),
      dailyRows: rawCourt?.dailyRows ?? normalizeDailyCourtRows(court, period),
      weekdayRows: normalizeWeekdayRows(court),
      freeUsage: rawCourt?.freeUsage ?? findFreeCourtUsage(court)
    },
    coach: rawCoach || {
      totalScheduled,
      totalHours: totalScheduled || cardNumber(coach, ['usedHours']),
      privateHours: numberValue(currentCoachTotals.privateHours),
      smallClassHours: numberValue(currentCoachTotals.smallClassHours),
      trialHours: numberValue(currentCoachTotals.trialHours),
      specialHours: numberValue(currentCoachTotals.specialHours),
      sparringHours: numberValue(currentCoachTotals.sparringHours),
      compare: {
        totalHours: compareValue(totalScheduled || cardNumber(coach, ['usedHours']), previousTotalScheduled || cardNumber(prevCoach, ['usedHours'])),
        totalScheduled: compareValue(totalScheduled, previousTotalScheduled)
      },
      rows: normalizeCoachRows(normalizeRows(coach.rows), normalizeRows(prevCoach.rows))
    },
    conversion: {
      totalLeads: cardNumber(conversion, ['totalLeads']),
      newLeads: cardNumber(conversion, ['totalLeads']),
      trialLeads: cardNumber(conversion, ['trialPathStudents']),
      trialDeals: leadSourceDeals || cardNumber(conversion, ['trialPathDealCustomers']),
      compare: {
        newLeads: compareValue(cardNumber(conversion, ['totalLeads']), cardNumber(prevConversion, ['totalLeads'])),
        trialLeads: compareValue(cardNumber(conversion, ['trialPathStudents']), cardNumber(prevConversion, ['trialPathStudents'])),
        trialDeals: compareValue(cardNumber(conversion, ['trialPathDealCustomers']), cardNumber(prevConversion, ['trialPathDealCustomers']))
      },
      sourceRows: leadSourceRows
    }
  };
}

function escapeHtml(value) {
  return String(value ?? '').replace(/[&<>"']/g, ch => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[ch]));
}

function formatMetricValue(value, unit = '') {
  if (value === null || value === undefined || value === '') return '-';
  const numeric = optionalNumber(value);
  if (numeric !== null) {
    const fraction = Number.isInteger(numeric) || String(unit).includes('元') || String(unit).includes('人') || String(unit).includes('条') ? 0 : 2;
    return numeric.toLocaleString('en-US', { maximumFractionDigits: fraction, minimumFractionDigits: 0 });
  }
  return String(value);
}

function editableValue(edits = {}, key = '', value = '') {
  const edited = edits && Object.prototype.hasOwnProperty.call(edits, key) ? edits[key] : value;
  return `<span data-edit-key="${escapeHtml(key)}" data-editable="true" contenteditable="true">${escapeHtml(edited)}</span>`;
}

function editableText(edits = {}, key = '', value = '') {
  return key ? editableValue(edits, key, value) : escapeHtml(value);
}

function weeklyCompareText(compare = {}, unit = '') {
  if (!compare || compare.previousValue === undefined) return '上周 - 环比 -';
  const previous = formatMetricValue(compare.previousValue, unit);
  if (compare.changeRate == null) return `上周 ${previous} 环比 -`;
  const rate = numberValue(compare.changeRate);
  const sign = rate > 0 ? '+' : '';
  return `上周 ${previous} 环比 ${sign}${rate}%`;
}

function metricBlock(label, value, suffix = '', edits = {}, key = '') {
  const text = `${formatMetricValue(value, suffix)}${suffix}`;
  const content = key ? editableValue(edits, key, text) : escapeHtml(text);
  return `<section class="metric" data-tooltip="${escapeHtml(label)}"><span>${escapeHtml(label)}</span><strong>${content}</strong></section>`;
}

function displayMetricValue(value) {
  return value === null || value === undefined || value === '' ? '-' : value;
}

function trendText(compare = {}) {
  if (!compare || compare.changeValue === undefined) return '环比 -';
  const value = numberValue(compare.changeValue);
  const sign = value > 0 ? '+' : '';
  const rate = compare.changeRate == null ? '' : ` / ${sign}${numberValue(compare.changeRate)}%`;
  return `环比 ${sign}${value}${rate}`;
}

function comparePercentText(compare = {}) {
  if (!compare || compare.changeRate == null) return '上周无数据';
  const value = numberValue(compare.changeRate);
  if (value > 0) return `上涨 ${value}%`;
  if (value < 0) return `下降 ${Math.abs(value)}%`;
  return '持平 0%';
}

function reportMetric(label, value, unit = '', compare = null, edits = {}, key = '') {
  const empty = value === null || value === undefined || value === '';
  const text = empty ? displayMetricValue(value) : `${formatMetricValue(value, unit)}${unit}`;
  const labelHtml = key ? editableText(edits, `${key}.label`, label) : escapeHtml(label);
  const content = key ? editableText(edits, `${key}.value`, text) : escapeHtml(text);
  const compareHtml = compare ? `<div class="text-[10px] text-cyber-volt mt-1">${key ? editableText(edits, `${key}.compare`, trendText(compare)) : escapeHtml(trendText(compare))}</div>` : '';
  return `<section class="bg-cyber-card rounded-xl border border-cyber-border p-5 hover:border-cyber-borderHover transition-all" data-tooltip="${escapeHtml(label)}"><div class="text-xs text-cyber-muted font-medium mb-1">${labelHtml}</div><div class="text-3xl font-mono font-bold text-white tracking-tight">${content}</div>${compareHtml}</section>`;
}

function templateMetric(label, value, unit = '', compare = null, edits = {}, key = '') {
  const empty = value === null || value === undefined || value === '';
  const text = empty ? '-' : `${formatMetricValue(value, unit)}${unit}`;
  const labelHtml = editableText(edits, `${key}.label`, label);
  const valueHtml = editableText(edits, `${key}.value`, text);
  const compareHtml = compare ? `<div class="text-[10px] text-cyber-volt mt-1">${editableText(edits, `${key}.compare`, weeklyCompareText(compare, unit))}</div>` : '';
  return `<section class="bg-cyber-card rounded-xl border border-cyber-border p-5 hover:border-cyber-borderHover transition-all" data-tooltip="${escapeHtml(label)}"><div class="text-xs text-cyber-muted font-medium mb-1">${labelHtml}</div><div class="text-3xl font-mono font-bold text-white tracking-tight">${valueHtml}</div>${compareHtml}</section>`;
}

function heroOverviewItem(label, value, unit, hint, edits, key) {
  const text = `${formatMetricValue(value, unit)}${unit}`;
  return `<div class="text-center sm:text-left border-r border-cyber-border/40 last:border-none px-2 sm:px-4" data-tooltip="${escapeHtml(label)}"><div class="text-xs text-cyber-muted font-medium mb-1">${editableText(edits, `${key}.label`, label)}</div><div class="text-3xl font-mono font-bold text-white tracking-tight">${editableText(edits, `${key}.value`, text)}</div><div class="text-[10px] text-cyber-darkMuted mt-1">${editableText(edits, `${key}.hint`, hint)}</div></div>`;
}

function summaryChip(label, value, unit, compare, edits, key) {
  const text = `${formatMetricValue(value, unit)}${unit}`;
  const compareHtml = compare ? `<div class="text-[10px] text-cyber-muted mt-1">${editableText(edits, `${key}.compare`, weeklyCompareText(compare, unit))}</div>` : '';
  return `<div class="bg-cyber-pillBg border border-cyber-volt/20 px-3 py-2 rounded-lg" data-tooltip="${escapeHtml(label)}"><div class="flex items-center space-x-2"><span class="text-cyber-muted text-xs">${editableText(edits, `${key}.label`, label)}</span><span class="text-cyber-volt font-mono font-bold text-sm">${editableText(edits, `${key}.value`, text)}</span></div>${compareHtml}</div>`;
}

function barChart(rows = [], { labelKey = 'name', valueKey = 'value', unit = '', edits = {}, keyPrefix = '' } = {}) {
  const clean = normalizeRows(rows).filter(row => fieldNumber(row, [valueKey]) > 0);
  if (!clean.length) return '<p class="empty">暂无可绘制数据</p>';
  const max = Math.max(...clean.map(row => fieldNumber(row, [valueKey])), 1);
  return `<div class="bars">${clean.map((row, index) => {
    const value = fieldNumber(row, [valueKey]);
    const label = rowLabel(row, [labelKey, 'label', 'type']);
    return `<div class="bar-row" data-tooltip="${escapeHtml(`${label} ${formatMetricValue(value, unit)}${unit}`)}"><span>${editableText(edits, keyPrefix ? `${keyPrefix}.${index}.label` : '', label)}</span><i><b style="width:${Math.max(4, percent(value, max))}%"></b></i><strong>${editableText(edits, keyPrefix ? `${keyPrefix}.${index}.value` : '', `${formatMetricValue(value, unit)}${unit}`)}</strong></div>`;
  }).join('')}</div>`;
}

function donutChart(rows = [], { labelKey = 'name', valueKey = 'value', edits = {}, keyPrefix = '' } = {}) {
  const clean = normalizeRows(rows).filter(row => fieldNumber(row, [valueKey]) > 0);
  const total = clean.reduce((sum, row) => sum + fieldNumber(row, [valueKey]), 0);
  if (!total) return '<p class="empty">暂无可绘制数据</p>';
  let acc = 0;
  const colors = ['#7CFF44', '#46A758', '#889E8D', '#3E5244', '#243629'];
  const stops = clean.map((row, index) => {
    const start = acc;
    acc += percent(fieldNumber(row, [valueKey]), total);
    return `${colors[index % colors.length]} ${start}% ${acc}%`;
  }).join(',');
  return `<div class="donut-wrap template-interactive-chart" data-tooltip="类型占比"><div class="donut" style="background:conic-gradient(${stops})"></div><div class="legend">${clean.map((row, index) => {
    const label = rowLabel(row, [labelKey, 'label', 'type']);
    const share = `${percent(fieldNumber(row, [valueKey]), total)}%`;
    return `<span data-tooltip="${escapeHtml(`${label} ${share}`)}"><i style="background:${colors[index % colors.length]}"></i>${editableText(edits, keyPrefix ? `${keyPrefix}.${index}.label` : '', label)} ${editableText(edits, keyPrefix ? `${keyPrefix}.${index}.share` : '', share)}</span>`;
  }).join('')}</div></div>`;
}

function heatmapOpacityClass(value) {
  const safe = Math.max(0, Math.min(100, numberValue(value)));
  if (safe >= 80) return 'bg-opacity-90 text-cyber-black font-bold';
  if (safe >= 60) return 'bg-opacity-70 text-cyber-black';
  if (safe >= 40) return 'bg-opacity-50 text-white';
  if (safe > 0) return 'bg-opacity-30 text-white';
  return 'bg-opacity-10 text-cyber-muted';
}

function courtUsageMatrix(rows = [], edits = {}) {
  const clean = normalizeRows(rows).filter(row => row.label || row.date);
  if (!clean.length) return '<p class="empty">暂无可绘制数据</p>';
  return `<div data-section="court-utilization-heatmap" class="bg-cyber-card rounded-xl border border-cyber-border p-5 hover:border-cyber-borderHover transition-all flex flex-col justify-between"><div><div class="flex justify-between items-center mb-4"><span class="text-xs font-mono text-cyber-muted uppercase tracking-wider">${editableText(edits, 'court.heatmap.eyebrow', '// COURT UTILIZATION HEATMAP')}</span><span class="text-xs font-bold text-white">${editableText(edits, 'court.heatmap.title', '每天利用率')}</span></div><div class="overflow-x-auto"><table class="w-full text-center border-collapse text-[10px] font-mono min-w-[520px]"><thead><tr class="text-cyber-muted border-b border-cyber-border/40"><th class="py-2 text-left font-sans">${editableText(edits, 'court.heatmap.dateHeader', '日期')}</th>${clean.map((row, index) => `<th class="py-2">${editableText(edits, `court.heatmap.header.${index}`, String(row.date || row.label || '').slice(5).replace('-', '.'))}</th>`).join('')}</tr></thead><tbody class="divide-y divide-cyber-border/20 text-white"><tr><td class="py-2 text-left font-sans text-cyber-muted">${editableText(edits, 'court.heatmap.rowLabel', '利用率')}</td>${clean.map((row, index) => {
    const value = fieldNumber(row, ['value', 'utilizationRate']);
    const text = `${formatMetricValue(value, '%')}%`;
    const tooltip = `${row.label || row.date || ''} 使用 ${formatMetricValue(row.usedHours || 0, '小时')}小时 / 可用 ${formatMetricValue(row.availableHours || 0, '小时')}小时 / 利用率 ${text}`;
    return `<td class="py-2 cohort-cell bg-cyber-volt ${heatmapOpacityClass(value)}" data-tooltip="${escapeHtml(tooltip)}">${editableText(edits, `court.heatmap.value.${index}`, text)}</td>`;
  }).join('')}</tr></tbody></table></div></div><div class="text-[10px] text-cyber-darkMuted mt-4 border-t border-cyber-border/40 pt-3">${editableText(edits, 'court.heatmap.note', '* 每天利用率 = 当天收费场地使用小时 / 当天可售小时，不包含内部使用和领导订场，最高按 100% 展示。')}</div></div>`;
}

function lineChart(rows = [], { valueKey = 'value', unit = '%' } = {}) {
  const clean = normalizeRows(rows).filter(row => row.label || row.date);
  if (!clean.length) return '<p class="empty">暂无可绘制数据</p>';
  const payload = clean.map(row => ({ label: row.label || String(row.date || '').slice(5), value: fieldNumber(row, [valueKey]) }));
  return `<div class="line-chart template-interactive-chart" data-unit="${escapeHtml(unit)}" data-points="${escapeHtml(JSON.stringify(payload))}"><svg viewBox="0 0 100 100" role="img" aria-label="趋势图"><defs><linearGradient id="weeklyAreaGlowGradient" x1="0" y1="0" x2="0" y2="1"><stop offset="0%" stop-color="#7CFF44" stop-opacity="0.16"></stop><stop offset="100%" stop-color="#7CFF44" stop-opacity="0"></stop></linearGradient></defs><path class="views-area" fill="url(#weeklyAreaGlowGradient)" d=""></path><path class="views-line" fill="none" stroke="#7CFF44" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" d=""></path><g class="dots"></g></svg><div class="line-labels">${payload.map(row => `<span>${escapeHtml(row.label)}<b>${escapeHtml(row.value)}${escapeHtml(unit)}</b></span>`).join('')}</div></div>`;
}

function trendMetricPanel(title, rows = [], valueKey = 'value', unit = '', edits = {}, key = '') {
  return `<section class="bg-cyber-card rounded-xl border border-cyber-border p-5 hover:border-cyber-borderHover transition-all"><h3 class="text-xs font-bold text-white mb-4">${editableText(edits, `${key}.title`, title)}</h3>${lineChart(rows, { valueKey, unit })}</section>`;
}

function renderCourseTypeRows(rows = [], edits = {}) {
  return renderRows(normalizeRows(rows), [
    { key: 'type', label: '类型' },
    { key: 'paidPeople', label: '本周购课人数', render: row => `${formatMetricValue(row.paidPeople, '人')}人` },
    { key: 'newAmount', label: '本周课程销售收款', highlight: true, render: row => `${formatMetricValue(row.newAmount, '元')}元` },
    { key: 'lessonPeople', label: '本周上课人数', render: row => `${formatMetricValue(row.lessonPeople, '人')}人` },
    { key: 'completedHours', label: '本周完成课时', render: row => `${formatMetricValue(row.completedHours, '小时')}小时` },
    { key: 'consumedAmount', label: '本周课程消耗收入', highlight: true, render: row => `${formatMetricValue(row.consumedAmount, '元')}元` }
  ], { edits, keyPrefix: 'course.typeRows' });
}

function progressPanel(rows = [], { labelKey = 'label', valueKey = 'hours', unit = '', edits = {}, keyPrefix = '' } = {}) {
  const clean = normalizeRows(rows);
  if (!clean.length) return '<p class="empty">暂无可绘制数据</p>';
  const max = Math.max(...clean.map(row => fieldNumber(row, [valueKey])), 1);
  return `<div class="progress-list">${clean.map((row, index) => {
    const value = fieldNumber(row, [valueKey]);
    return `<div class="progress-item"><div><span>${editableText(edits, keyPrefix ? `${keyPrefix}.${index}.label` : '', rowLabel(row, [labelKey, 'name', 'type']))}</span><strong>${editableText(edits, keyPrefix ? `${keyPrefix}.${index}.value` : '', `${formatMetricValue(value, unit)}${unit}`)}</strong></div><i>${value > 0 ? `<b style="width:${Math.max(2, percent(value, max))}%"></b>` : ''}</i></div>`;
  }).join('')}</div>`;
}

function ringPanel(value = 0, label = '') {
  const safe = Math.max(0, Math.min(100, numberValue(value)));
  return `<div class="ring-panel"><div class="ring" style="--p:${safe}"><span>${escapeHtml(safe)}%</span></div><p>${escapeHtml(label)}</p></div>`;
}

function renderRows(rows = [], columns = [], { edits = {}, keyPrefix = '' } = {}) {
  if (!rows.length) return '<p class="empty">暂无数据</p>';
  return `<div class="overflow-x-auto"><table class="w-full text-left border-collapse text-xs font-mono min-w-[720px] bg-cyber-card rounded-xl border border-cyber-border overflow-hidden mt-3"><thead><tr class="text-cyber-muted border-b border-cyber-border/40">${columns.map((col, colIndex) => `<th class="py-2.5 px-3 font-sans ${col.highlight ? 'highlight-col' : ''}">${editableText(edits, keyPrefix ? `${keyPrefix}.header.${colIndex}` : '', col.label)}</th>`).join('')}</tr></thead><tbody class="divide-y divide-cyber-border/20 text-white">${rows.map((row, rowIndex) => `<tr>${columns.map(col => {
    const value = typeof col.render === 'function' ? col.render(row) : (row[col.key] ?? '-');
    return `<td class="py-3 px-3 ${col.highlight ? 'highlight-col' : ''}">${col.html ? value : editableText(edits, keyPrefix ? `${keyPrefix}.${rowIndex}.${col.key}` : '', value)}</td>`;
  }).join('')}</tr>`).join('')}</tbody></table></div>`;
}

function renderStoredValueNewMembers(rows = [], edits = {}) {
  return `<div class="bg-cyber-card rounded-xl border border-cyber-border p-5">
    <div class="flex items-center justify-between mb-3"><h4 class="text-sm font-bold text-white">${editableText(edits, 'storedValue.newMembers.title', '本周新增会员明细')}</h4><span class="text-xs font-mono text-cyber-muted">${editableText(edits, 'storedValue.newMembers.count', `${normalizeRows(rows).length} 人`)}</span></div>
    ${renderRows(normalizeRows(rows), [
      { key: 'name', label: '会员' },
      { key: 'firstOpenDate', label: '开卡日期' },
      { key: 'tier', label: '会员类型' },
      { key: 'amount', label: '本周储值金额', highlight: true, render: row => `${formatMetricValue(row.amount, '元')}元` }
    ], { edits, keyPrefix: 'storedValue.newMembers' })}
  </div>`;
}

function renderCoachLessonRows(rows = [], edits = {}, coachIndex = 0) {
  const clean = normalizeRows(rows);
  if (!clean.length) return '';
  return `<details class="mt-2"><summary class="cursor-pointer text-cyber-volt text-xs">展开上课明细</summary>${renderRows(clean, [
    { key: 'date', label: '日期' },
    { key: 'time', label: '时间' },
    { key: 'student', label: '学员' },
    { key: 'courseType', label: '课程类型' },
    { key: 'hours', label: '课时', render: row => `${formatMetricValue(row.hours, '小时')}小时` },
    { key: 'court', label: '场地' }
  ], { edits, keyPrefix: `coach.lessonRows.${coachIndex}` })}</details>`;
}

function renderWeeklyBusinessReportHtml(snapshot = {}, { remark = '' } = {}) {
  const period = snapshot.period || {};
  const summary = snapshot.summary || {};
  const rawSections = snapshot.sections || {};
  const sections = rawSections.revenue?.storedValue ? rawSections : {
    ...buildWeeklyReportSections({
      overview: rawSections.revenue || {},
      court: rawSections.court || {},
      coach: rawSections.coach || {},
      conversion: rawSections.conversion || {}
    }, {}),
    detailsMode: rawSections.detailsMode || 'summary-only'
  };
  const revenue = sections.revenue || {};
  const court = sections.court || {};
  const coach = sections.coach || {};
  const conversion = sections.conversion || {};
  const coachRows = normalizeRows(coach.rows);
  const sourceRows = normalizeRows(conversion.sourceRows);
  const lifetime = snapshot.lifetimeSummary || {};
  const edits = snapshot.publicEdits || {};
  const editableSectionTitle = (key, text, mark) => `<div id="${escapeHtml(key)}" class="flex justify-between items-center pt-8 scroll-mt-24"><h2 class="text-base font-bold text-white">${editableText(edits, `section.${key}.title`, text)}</h2><span class="text-xs font-mono text-cyber-volt uppercase tracking-wider">${editableText(edits, `section.${key}.mark`, mark)}</span></div>`;
  return `<!DOCTYPE html>
<html lang="zh-CN">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>${escapeHtml(snapshot.campusName || WEEKLY_REPORT_CAMPUS_NAME)}周报</title>
  <script src="https://cdn.tailwindcss.com"></script>
  <link rel="preconnect" href="https://fonts.googleapis.com">
  <link rel="preconnect" href="https://fonts.gstatic.com" crossorigin="">
  <link href="https://fonts.googleapis.com/css2?family=Inter:wght@300;400;500;600;700&amp;family=JetBrains+Mono:wght@400;500;700&amp;display=swap" rel="stylesheet">
  <script>
    tailwind.config = {
      theme: {
        extend: {
          fontFamily: {
            sans: ['Inter', 'PingFang SC', 'Microsoft YaHei', 'sans-serif'],
            mono: ['JetBrains Mono', 'ui-monospace', 'SFMono-Regular', 'monospace'],
          },
          colors: {
            cyber: {
              black: '#070A08',
              grid: '#111813',
              card: '#0D120F',
              border: '#18221B',
              borderHover: '#2C3D2F',
              volt: '#7CFF44',
              muted: '#889E8D',
              darkMuted: '#3E5244',
              pillBg: '#1E351A'
            }
          }
        }
      }
    }
  </script>
  <style>
    html{scroll-behavior:smooth}
    .bg-grid-pattern{background-color:#070A08;background-image:linear-gradient(to right,#111813 1px,transparent 1px),linear-gradient(to bottom,#111813 1px,transparent 1px);background-size:40px 40px}
    ::-webkit-scrollbar{width:6px;height:6px}::-webkit-scrollbar-track{background:#070A08}::-webkit-scrollbar-thumb{background:#18221B;border-radius:3px}::-webkit-scrollbar-thumb:hover{background:#2C3D2F}
    [data-editable="true"]:hover,[data-editable="true"]:focus{outline:1px dashed #7CFF44;background-color:rgba(124,255,68,.05);padding-left:4px;padding-right:4px;border-radius:2px}
    .cohort-cell{transition:all .15s ease-out}.cohort-cell:hover{transform:scale(1.05);z-index:10;box-shadow:0 0 10px rgba(124,255,68,.2)}
    .views-line,.views-area,.rate-line{transition:stroke-dasharray .3s ease}.interactive-dot{transition:r .2s cubic-bezier(.175,.885,.32,1.275),stroke-width .2s ease,fill .2s ease}
    .chart-tooltip{position:fixed;display:none;z-index:20;pointer-events:none;border:1px solid #7CFF44;background:#0D120F;color:#fff;border-radius:6px;padding:7px 9px;font-size:12px;box-shadow:0 8px 30px rgba(0,0,0,.4)}
    .empty{color:#889E8D}.highlight-col{background:rgba(124,255,68,.08);color:#7CFF44}.remark{white-space:pre-wrap}
    .bars{display:grid;gap:11px}.bar-row{display:grid;grid-template-columns:132px 1fr 92px;gap:12px;align-items:center;font-size:13px}.bar-row span{color:#889E8D}.bar-row i{height:10px;background:#18221B;border-radius:3px;overflow:hidden}.bar-row b{display:block;height:100%;background:#7CFF44;border-radius:3px}.bar-row strong{font-family:ui-monospace,SFMono-Regular,monospace;color:#fff}
    .donut-wrap{display:flex;align-items:center;gap:20px}.donut{width:150px;height:150px;border-radius:50%;position:relative}.donut:after{content:"";position:absolute;inset:35px;border-radius:50%;background:#0D120F}.legend{display:grid;gap:9px;font-size:13px}.legend span{display:flex;align-items:center;gap:8px;color:#889E8D}.legend i{width:10px;height:10px;border-radius:50%}
    .progress-list{display:grid;gap:14px}.progress-item div{display:flex;justify-content:space-between;color:#889E8D;font-size:12px;margin-bottom:6px}.progress-item strong{color:#fff;font-family:ui-monospace,SFMono-Regular,monospace}.progress-item i{display:block;height:10px;background:#18221B;border-radius:3px;overflow:hidden}.progress-item b{display:block;height:100%;background:#7CFF44}
  </style>
</head>
<body class="bg-grid-pattern text-white font-sans min-h-screen antialiased flex flex-col pb-16">
<header data-section="global-header" class="border-b border-cyber-border bg-cyber-black/95 sticky top-0 z-50 backdrop-blur-md"><div class="max-w-[1600px] mx-auto px-6 h-16 flex items-center justify-between"><div class="flex items-center space-x-4"><div class="bg-cyber-volt text-cyber-black font-mono font-bold text-xs px-2.5 py-1 rounded tracking-wide uppercase">${editableText(edits, 'nav.brand', 'FLOWTENNIS')}</div><div class="h-4 w-[1px] bg-cyber-border"></div><span class="text-xs font-mono text-cyber-muted tracking-wider uppercase hidden sm:inline">${editableText(edits, 'nav.path', '/ weekly business report / shunyi mapo')}</span></div><nav class="hidden md:flex items-center space-x-1 bg-black/40 p-1 rounded-lg border border-cyber-border" aria-label="周报快速定位"><a href="#overview" class="px-4 py-1.5 rounded-md text-xs font-medium bg-cyber-pillBg text-cyber-volt transition-all duration-150">${editableText(edits, 'nav.dashboard.label', 'Dashboard')}</a><a href="#revenue" class="px-4 py-1.5 rounded-md text-xs font-medium text-cyber-muted hover:text-white transition-all duration-150">${editableText(edits, 'nav.revenue.label', 'Revenue')}</a><a href="#private-course" class="px-4 py-1.5 rounded-md text-xs font-medium text-cyber-muted hover:text-white transition-all duration-150">${editableText(edits, 'nav.course.label', 'Private Course')}</a><a href="#court" class="px-4 py-1.5 rounded-md text-xs font-medium text-cyber-muted hover:text-white transition-all duration-150">${editableText(edits, 'nav.court.label', 'Court Usage')}</a><a href="#coach" class="px-4 py-1.5 rounded-md text-xs font-medium text-cyber-muted hover:text-white transition-all duration-150">${editableText(edits, 'nav.coach.label', 'Coach')}</a></nav><div class="flex items-center space-x-3"><span class="bg-black/30 border border-cyber-border text-cyber-volt font-mono text-xs px-3 py-1.5 rounded-md flex items-center space-x-2"><span class="w-1.5 h-1.5 rounded-full bg-cyber-volt"></span><span>${editableText(edits, 'nav.period', `${period.startDate} - ${period.endDate}${snapshot.weekNumber ? `（第 ${snapshot.weekNumber} 周）` : ''}`)}</span></span><button class="save-edit bg-cyber-volt hover:bg-opacity-90 text-cyber-black font-bold text-xs px-4 py-1.5 rounded transition-all flex items-center space-x-1.5" type="button"><span>保存编辑</span></button></div></div></header>
<main class="max-w-[1600px] w-full mx-auto px-6 mt-8 flex-grow space-y-6">
  <section data-section="hero-summary" class="grid grid-cols-1 lg:grid-cols-12 gap-6 items-end" id="overview">
    <div class="lg:col-span-7 space-y-4">
      <div class="text-xs font-mono text-cyber-volt tracking-wider uppercase">${editableText(edits, 'overview.eyebrow', '// SHUNYI MAPO OVERVIEW')}</div>
      <h1 class="text-3xl sm:text-4xl font-bold tracking-tight text-white leading-tight">${editableText(edits, 'overview.title', `${snapshot.campusName || WEEKLY_REPORT_CAMPUS_NAME}周报`)}</h1>
      <div class="flex flex-wrap gap-3 pt-2">
        ${summaryChip('营业收入', summary.totalIncome?.value || 0, ' 元', summary.totalIncome?.compare, edits, 'summary.totalIncome')}
        ${summaryChip('本周收款', summary.cashReceived?.value || 0, ' 元', summary.cashReceived?.compare, edits, 'summary.cashReceived')}
        ${summaryChip('场地利用率', summary.courtUtilizationRate?.value || 0, '%', summary.courtUtilizationRate?.compare, edits, 'summary.courtUtilizationRate')}
        ${summaryChip('完成课时', summary.coachHours?.value || 0, ' 小时', summary.coachHours?.compare, edits, 'summary.coachHours')}
      </div>
    </div>
    <div data-section="top-kpi-cards" class="lg:col-span-5 grid grid-cols-3 gap-4 bg-cyber-card p-5 rounded-xl border border-cyber-border">
      ${heroOverviewItem('总收入', lifetime.totalIncome?.value || 0, ' 元', '历史累计收入', edits, 'lifetime.totalIncome')}
      ${heroOverviewItem('总场地利用率', lifetime.courtUtilizationRate?.value || 0, '%', '历史平均利用率', edits, 'lifetime.courtUtilizationRate')}
      ${heroOverviewItem('总私教课人数', lifetime.privateCoursePeople?.value || 0, ' 人', '累计私教学员数', edits, 'lifetime.privateCoursePeople')}
    </div>
  </section>

  ${editableSectionTitle('trend', '一、经营趋势', '// 8 WEEK TREND')}
  <div class="grid grid-cols-1 lg:grid-cols-2 gap-4">
    ${trendMetricPanel('营业收入', sections.trends || [], 'businessRevenue', '元', edits, 'trend.businessRevenue')}
    ${trendMetricPanel('本周收款', sections.trends || [], 'cashReceived', '元', edits, 'trend.cashReceived')}
    ${trendMetricPanel('场地利用率', sections.trends || [], 'courtUtilizationRate', '%', edits, 'trend.courtUtilizationRate')}
    ${trendMetricPanel('完成课时', sections.trends || [], 'coachHours', '小时', edits, 'trend.coachHours')}
  </div>

  ${editableSectionTitle('revenue', '二、收入与收款', '// REVENUE')}
  <div class="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
    ${templateMetric('本周收款', revenue.receipts?.totalAmount, ' 元', revenue.receipts?.compare?.totalAmount, edits, 'receipts.totalAmount')}
    ${templateMetric('本周课程收款', revenue.receipts?.courseAmount, ' 元', revenue.receipts?.compare?.courseAmount, edits, 'receipts.courseAmount')}
    ${templateMetric('本周订场收款', revenue.receipts?.bookingAmount, ' 元', revenue.receipts?.compare?.bookingAmount, edits, 'receipts.bookingAmount')}
    ${templateMetric('本周储值收款', revenue.receipts?.storedValueAmount, ' 元', revenue.receipts?.compare?.storedValueAmount, edits, 'receipts.storedValueAmount')}
  </div>
  <div class="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
    ${templateMetric('本周营业收入', revenue.recognized?.businessRevenue, ' 元', revenue.recognized?.compare?.businessRevenue, edits, 'recognized.businessRevenue')}
    ${templateMetric('课程消耗收入', revenue.recognized?.courseConsumedRevenue, ' 元', revenue.recognized?.compare?.courseConsumedRevenue, edits, 'recognized.courseConsumedRevenue')}
    ${templateMetric('会员订场消耗收入', revenue.recognized?.memberBookingConsumedRevenue, ' 元', revenue.recognized?.compare?.memberBookingConsumedRevenue, edits, 'recognized.memberBookingConsumedRevenue')}
    ${templateMetric('散客订场收入', revenue.recognized?.guestBookingRevenue, ' 元', revenue.recognized?.compare?.guestBookingRevenue, edits, 'recognized.guestBookingRevenue')}
  </div>

  <h3 id="private-course" class="text-base font-bold text-white leading-snug scroll-mt-24">${editableText(edits, 'section.course.title', '2.1 课程收款')}</h3>
  <div class="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
    ${templateMetric('私教课人数', revenue.course?.totalPeople, ' 人', null, edits, 'course.totalPeople')}
    ${templateMetric('私教课总收款', revenue.course?.totalAmount, ' 元', null, edits, 'course.totalAmount')}
    ${templateMetric('私教课总消耗金额', revenue.course?.totalConsumedAmount, ' 元', null, edits, 'course.totalConsumedAmount')}
  </div>
  <div data-section="private-course-kpi" class="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-5 gap-4">
    ${templateMetric('本周购课人数', revenue.course?.paidPeople, ' 人', revenue.course?.compare?.paidPeople, edits, 'course.paidPeople')}
    ${templateMetric('本周课程销售收款', revenue.course?.newAmount, ' 元', revenue.course?.compare?.amount, edits, 'course.newAmount')}
    ${templateMetric('本周上课人数', revenue.course?.lessonPeople, ' 人', revenue.course?.compare?.lessonPeople, edits, 'course.lessonPeople')}
    ${templateMetric('本周完成课时', revenue.course?.completedHours, ' 小时', revenue.course?.compare?.completedHours, edits, 'course.completedHours')}
    ${templateMetric('本周课程消耗收入', revenue.course?.consumedAmount, ' 元', revenue.course?.compare?.consumedAmount, edits, 'course.consumedAmount')}
  </div>
  ${renderCourseTypeRows(revenue.course?.typeRows || [], edits)}

  <h3 class="text-base font-bold text-white leading-snug">${editableText(edits, 'section.guestBooking.title', '2.2 订场收款（散客）')}</h3>
  <div class="grid grid-cols-1 md:grid-cols-3 gap-4">
    ${templateMetric('本周订场人数', (court.usageRows || []).find(row => row.key === 'guest')?.count, ' 人', null, edits, 'guestBooking.count')}
    ${templateMetric('本周订场时长', (court.usageRows || []).find(row => row.key === 'guest')?.hours, ' 小时', null, edits, 'guestBooking.hours')}
    ${templateMetric('本周订场收入', (court.usageRows || []).find(row => row.key === 'guest')?.amount, ' 元', null, edits, 'guestBooking.amount')}
  </div>

  <h3 class="text-base font-bold text-white leading-snug">${editableText(edits, 'section.storedValue.title', '2.3 会员收款')}</h3>
  <div class="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
    ${templateMetric('会员总数', revenue.storedValue?.totalMembers, ' 人', null, edits, 'storedValue.totalMembers')}
    ${templateMetric('总储值金额', revenue.storedValue?.totalAmount, ' 元', null, edits, 'storedValue.totalAmount')}
    ${templateMetric('本周新增会员', revenue.storedValue?.newMembers, ' 人', revenue.storedValue?.compare?.newMembers, edits, 'storedValue.newMembers')}
    ${templateMetric('本周充值收款', revenue.storedValue?.newAmount, ' 元', revenue.storedValue?.compare?.newAmount, edits, 'storedValue.newAmount')}
    ${templateMetric('本周订场消耗收入', revenue.storedValue?.redeemedAmount, ' 元', revenue.storedValue?.compare?.redeemedAmount, edits, 'storedValue.redeemedAmount')}
  </div>
  ${renderStoredValueNewMembers(revenue.storedValue?.newMemberRows || [], edits)}

  ${editableSectionTitle('coach', '三、教练经营', '// COACH HOURS')}
  <div class="grid grid-cols-1 md:grid-cols-3 lg:grid-cols-6 gap-4">
    ${reportMetric('完成课时', coach.totalScheduled || 0, ' 小时', coach.compare?.totalScheduled, edits, 'coach.totalScheduled')}
    ${reportMetric('私教课', coach.privateHours || 0, ' 小时', null, edits, 'coach.privateHours')}
    ${reportMetric('小班课', coach.smallClassHours || 0, ' 小时', null, edits, 'coach.smallClassHours')}
    ${reportMetric('体验课', coach.trialHours || 0, ' 小时', null, edits, 'coach.trialHours')}
    ${reportMetric('专项课', coach.specialHours || 0, ' 小时', null, edits, 'coach.specialHours')}
    ${reportMetric('陪打', coach.sparringHours || 0, ' 小时', null, edits, 'coach.sparringHours')}
  </div>
  ${renderRows(coachRows, [
    { key: 'coach', label: '教练' },
    { key: 'previousHours', label: '上周完成课时', render: row => formatMetricValue(row.previousHours || 0, '小时') },
    { key: 'scheduledCount', label: '本周完成课时', highlight: true, render: row => formatMetricValue(row.scheduledCount || 0, '小时') },
    { key: 'compare', label: '课时环比', render: row => comparePercentText(row.compare) },
    { key: 'privateHours', label: '私教课' },
    { key: 'smallClassHours', label: '小班课' },
    { key: 'trialHours', label: '体验课' },
    { key: 'specialHours', label: '专项课' },
    { key: 'sparringHours', label: '陪打' }
  ], { edits, keyPrefix: 'coach.rows' })}
  <div class="grid grid-cols-1 lg:grid-cols-2 gap-4">${coachRows.map((row, index) => `<section class="bg-cyber-card rounded-xl border border-cyber-border p-5"><h3 class="text-sm font-bold text-white">${editableText(edits, `coach.details.${index}.title`, row.coach)}</h3>${renderCoachLessonRows(row.lessonRows || [], edits, index)}</section>`).join('')}</div>

  ${editableSectionTitle('court', '四、场地经营', '// COURT USAGE')}
  <div class="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-5 gap-4">
    ${reportMetric('实际使用时长', court.actualUsedHours || 0, ' 小时', null, edits, 'court.actualUsedHours')}
    ${reportMetric('会员订场时长', (court.usageRows || []).find(row => row.key === 'member')?.hours || 0, ' 小时', null, edits, 'court.memberHours')}
    ${reportMetric('散客订场时长', (court.usageRows || []).find(row => row.key === 'guest')?.hours || 0, ' 小时', null, edits, 'court.guestHours')}
    ${reportMetric('课程订场时长', (court.usageRows || []).find(row => row.key === 'course')?.hours || 0, ' 小时', null, edits, 'court.courseHours')}
    ${reportMetric('内部使用时长', (court.usageRows || []).find(row => row.key === 'free')?.hours || 0, ' 小时', null, edits, 'court.freeHours')}
  </div>
  <div class="grid grid-cols-1 lg:grid-cols-12 gap-6">
    <div class="lg:col-span-7">${courtUsageMatrix(court.dailyRows || [], edits)}</div>
    <div class="lg:col-span-5 bg-cyber-card rounded-xl border border-cyber-border p-5 hover:border-cyber-borderHover transition-all"><h3 class="text-xs font-bold text-white mb-4">${editableText(edits, 'court.type.title', '类型占比')}</h3>${donutChart(court.usageRows || [], { labelKey: 'label', valueKey: 'hours', edits, keyPrefix: 'court.type.donut' })}</div>
  </div>
  ${renderRows(court.usageRows || [], [
    { key: 'label', label: '类型' },
    { key: 'count', label: '次数' },
    { key: 'hours', label: '时长' },
    { key: 'amount', label: '金额' },
    { key: 'share', label: '占比', render: row => `${row.share || 0}%` },
    { key: 'compare', label: '环比', render: row => trendText(row.compare?.hours) }
  ], { edits, keyPrefix: 'court.usage' })}

  ${editableSectionTitle('conversion', '五、线索转化', '// LEAD CONVERSION')}
  <div class="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
    ${reportMetric('总线索数', conversion.totalLeads || 0, ' 条', null, edits, 'conversion.totalLeads')}
    ${reportMetric('本周新增线索', conversion.newLeads || 0, ' 条', conversion.compare?.newLeads, edits, 'conversion.newLeads')}
    ${reportMetric('本周体验线索', conversion.trialLeads || 0, ' 条', conversion.compare?.trialLeads, edits, 'conversion.trialLeads')}
    ${reportMetric('体验后报名', conversion.trialDeals || 0, ' 人', conversion.compare?.trialDeals, edits, 'conversion.trialDeals')}
  </div>
  <div class="grid grid-cols-1 lg:grid-cols-12 gap-6"><div class="lg:col-span-6 bg-cyber-card rounded-xl border border-cyber-border p-5 hover:border-cyber-borderHover transition-all">${barChart(sourceRows.map(row => ({ name: row.source, value: row.leads })), { labelKey: 'name', valueKey: 'value', unit: '条', edits, keyPrefix: 'conversion.leads.bar' })}</div><div class="lg:col-span-6 bg-cyber-card rounded-xl border border-cyber-border p-5 hover:border-cyber-borderHover transition-all">${progressPanel(sourceRows.map(row => ({ label: row.source, value: row.deals })), { labelKey: 'label', valueKey: 'value', unit: '人', edits, keyPrefix: 'conversion.deals.progress' })}</div></div>
  ${renderRows(sourceRows, [
    { key: 'source', label: '渠道' },
    { key: 'leads', label: '线索数' },
    { key: 'trial', label: '体验线索' },
    { key: 'deals', label: '体验后报名' },
    { key: 'compare', label: '环比', render: row => trendText(row.compare?.leads) }
  ], { edits, keyPrefix: 'conversion.source' })}
  ${editableSectionTitle('remark', '备注', '// REMARK')}
  <p class="remark bg-cyber-card rounded-xl border border-cyber-border p-5 text-cyber-muted">${editableValue(edits, 'remark', remark || '暂无备注')}</p>
</main>
<div class="chart-tooltip"></div>
<script>
var tooltip=document.querySelector('.chart-tooltip');
document.querySelectorAll('[data-tooltip]').forEach(function(el){
  el.addEventListener('mousemove',function(e){if(!tooltip)return;tooltip.textContent=el.getAttribute('data-tooltip')||'';tooltip.style.display='block';tooltip.style.left=e.clientX+12+'px';tooltip.style.top=e.clientY+12+'px';});
  el.addEventListener('mouseleave',function(){if(tooltip)tooltip.style.display='none';});
});
document.querySelectorAll('.template-interactive-chart').forEach(function(chart){
  var rows=[];
  try{rows=JSON.parse(chart.getAttribute('data-points')||'[]')}catch(e){}
  var svg=chart.querySelector('svg');
  var line=chart.querySelector('.views-line');
  var area=chart.querySelector('.views-area');
  var dots=chart.querySelector('.dots');
  if(!rows.length||!svg||!line||!area||!dots)return;
  var max=Math.max.apply(null,rows.map(function(row){return Number(row.value)||0}).concat([1]));
  var points=rows.map(function(row,index){
    var x=rows.length===1?50:8+index*(84/(rows.length-1));
    var y=92-((Number(row.value)||0)/max)*76;
    return {x:x,y:y,row:row};
  });
  var path=points.map(function(point,index){return (index?'L':'M')+point.x+' '+point.y}).join(' ');
  var fill='M '+points[0].x+' 92 L '+points.map(function(point){return point.x+' '+point.y}).join(' L ')+' L '+points[points.length-1].x+' 92 Z';
  line.setAttribute('d',path);
  area.setAttribute('d',fill);
  dots.innerHTML=points.map(function(point){
    return '<circle class="interactive-dot" cx="'+point.x+'" cy="'+point.y+'" r="2.8" fill="#070A08" stroke="#7CFF44" stroke-width="1.5"></circle>';
  }).join('');
});
document.querySelector('.save-edit')?.addEventListener('click',async function(){
  var button=this;
  var values={};
  document.querySelectorAll('[data-edit-key]').forEach(function(el){values[el.getAttribute('data-edit-key')]=el.textContent.trim();});
  button.disabled=true;
  button.textContent='保存中';
  try{
    var token=location.pathname.split('/').filter(Boolean).pop();
    var res=await fetch('/api/public/weekly-business-reports/'+encodeURIComponent(token)+'/edits',{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify({edits:values})});
    if(!res.ok)throw new Error('save failed');
    button.textContent='已保存';
  }catch(e){
    button.textContent='保存失败';
  }finally{
    setTimeout(function(){button.disabled=false;button.textContent='保存编辑';},1600);
  }
});
</script>
</body>
</html>`;
}

function buildWeeklyBusinessReportFeishuText({ snapshot = null, period = null, status = 'success', error = '' } = {}) {
  const p = snapshot?.period || period || {};
  if (status === 'failure') {
    return `顺义马坡周报生成失败：${p.startDate || '-'} 至 ${p.endDate || '-'}，原因：${String(error || '未知错误').slice(0, 80)}`;
  }
  return `顺义马坡周报已生成：${p.startDate || '-'} 至 ${p.endDate || '-'}，点击查看：${snapshot?.shareUrl || ''}`;
}

async function sendWeeklyBusinessReportFeishuText({ text = '', webhook = '', fetchImpl = fetch } = {}) {
  const targetWebhook = String(webhook || '').trim();
  if (!targetWebhook) return { sent: false, skipped: true, reason: 'missing_webhook' };
  const response = await fetchImpl(targetWebhook, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ msg_type: 'text', content: { text: String(text || '') } })
  });
  const raw = await response.text();
  let data = null;
  try { data = raw ? JSON.parse(raw) : null; } catch { data = { raw }; }
  if (!response.ok) throw new Error(`飞书接口 HTTP ${response.status}`);
  if (data && data.code !== undefined && data.code !== 0) throw new Error(`飞书接口返回失败：${data.msg || data.message || data.code}`);
  return { sent: true };
}

function reportView(row = {}) {
  return {
    id: row.id,
    campusName: row.campusName || WEEKLY_REPORT_CAMPUS_NAME,
    period: row.period || {},
    weekNumber: row.weekNumber || isoWeekNumber(row.period?.endDate),
    generatedAt: row.generatedAt || '',
    generationMode: row.generationMode || '',
    status: row.status || 'success',
    shareUrl: row.shareUrl || '',
    remark: row.remark || '',
    summary: row.summary || {}
  };
}

async function listWeeklyBusinessReports({ scan, table = WEEKLY_REPORT_TABLE } = {}) {
  const rows = await scan(table).catch(() => []);
  return rows
    .filter(row => row && row.status !== 'deleted')
    .sort((a, b) => String(b.period?.endDate || b.generatedAt || '').localeCompare(String(a.period?.endDate || a.generatedAt || '')))
    .map(reportView);
}

async function findWeeklyBusinessReportByToken({ scan, token = '', table = WEEKLY_REPORT_TABLE } = {}) {
  const target = String(token || '').trim();
  if (!target) return null;
  const rows = await scan(table).catch(() => []);
  return rows.find(row => String(row.shareToken || '') === target && row.status !== 'deleted') || null;
}

async function updateWeeklyBusinessReportRemark({ get, put, id = '', remark = '', user = {}, table = WEEKLY_REPORT_TABLE } = {}) {
  const report = await get(table, id);
  if (!report) {
    const err = new Error('周报不存在');
    err.statusCode = 404;
    throw err;
  }
  const next = {
    ...report,
    remark: String(remark || '').slice(0, 2000),
    remarkUpdatedAt: new Date().toISOString(),
    remarkUpdatedBy: user.name || user.id || ''
  };
  await put(table, id, next);
  return reportView(next);
}

async function updateWeeklyBusinessReportPublicEdits({ scan, put, token = '', edits = {}, table = WEEKLY_REPORT_TABLE } = {}) {
  const report = await findWeeklyBusinessReportByToken({ scan, token, table });
  if (!report) {
    const err = new Error('周报不存在');
    err.statusCode = 404;
    throw err;
  }
  const safeEdits = {};
  Object.entries(edits || {}).forEach(([key, value]) => {
    if (!/^[a-zA-Z0-9_.-]{1,80}$/.test(String(key))) return;
    safeEdits[key] = String(value ?? '').replace(/[<>]/g, '').slice(0, 500);
  });
  const next = {
    ...report,
    publicEdits: safeEdits,
    publicEditsUpdatedAt: new Date().toISOString()
  };
  next.html = renderWeeklyBusinessReportHtml(next, { remark: next.remark || '' });
  await put(table, next.id, next);
  return { success: true };
}

function weeklyRawToBaseRows(raw = {}) {
  return {
    campuses: raw.campuses || [],
    leads: raw.leads || [],
    leadFollowups: raw.leadFollowups || [],
    students: raw.students || [],
    purchases: raw.purchases || [],
    entitlements: raw.entitlements || [],
    entitlementLedger: raw.entitlementLedger || [],
    courts: raw.courts || [],
    membershipOrders: raw.membershipOrders || [],
    membershipAccounts: raw.membershipAccounts || [],
    membershipPlans: raw.membershipPlans || [],
    membershipBenefitLedger: raw.membershipBenefitLedger || [],
    membershipAccountEvents: raw.membershipAccountEvents || [],
    coaches: raw.coaches || [],
    schedule: raw.schedule || [],
    feedbacks: raw.feedbacks || [],
    cachedFinanceSnapshot: null
  };
}

async function generateWeeklyBusinessReport({
  loadOperationsPayload,
  loadOperationsSnapshot,
  get,
  put,
  mkTable = async () => {},
  period = resolveWeeklyBusinessReportPeriod(),
  baseUrl = 'https://www.flowtennis.cn',
  generationMode = 'auto',
  user = { id: 'weekly-report-system', role: 'admin', dataScope: 'all' },
  table = WEEKLY_REPORT_TABLE
} = {}) {
  if (typeof loadOperationsPayload !== 'function') throw new Error('缺少周报数据读取器');
  await mkTable(table).catch(() => null);
  const scope = {
    campusName: WEEKLY_REPORT_CAMPUS_NAME,
    view: WEEKLY_REPORT_OPERATIONS_VIEW,
    includeWeeklyReportRaw: true,
    dateRange: { startDate: period.startDate, endDate: period.endDate },
    metricScope: { campusName: WEEKLY_REPORT_CAMPUS_NAME, startDate: period.startDate, endDate: period.endDate }
  };
  const previousScope = {
    campusName: WEEKLY_REPORT_CAMPUS_NAME,
    view: WEEKLY_REPORT_OPERATIONS_VIEW,
    includeWeeklyReportRaw: true,
    dateRange: { startDate: period.previousStartDate, endDate: period.previousEndDate },
    metricScope: { campusName: WEEKLY_REPORT_CAMPUS_NAME, startDate: period.previousStartDate, endDate: period.previousEndDate }
  };
  const totalScope = {
    campusName: WEEKLY_REPORT_CAMPUS_NAME,
    view: WEEKLY_REPORT_OPERATIONS_VIEW,
    includeWeeklyReportRaw: false,
    dateRange: {},
    metricScope: { campusName: WEEKLY_REPORT_CAMPUS_NAME }
  };
  const existing = get ? await get(table, buildReportId(period)).catch(() => null) : null;
  const loadSnapshotPayload = async targetScope => {
    if (typeof loadOperationsSnapshot !== 'function') return null;
    return loadOperationsSnapshot({ user, scope: targetScope, allowRefreshing: false }).then(payload => {
      if (!payload) throw new Error('经营分析快照为空');
      return payload;
    }).catch(err => {
      const error = new Error(`周报数据快照未就绪，请等待后台快照生成后重试：${err?.message || err}`);
      error.code = err?.code || 'WEEKLY_REPORT_SNAPSHOT_NOT_READY';
      error.statusCode = err?.statusCode || 503;
      throw error;
    });
  };
  const snapshotPayloads = [];
  if (typeof loadOperationsSnapshot === 'function') {
    for (const targetScope of [scope, previousScope, totalScope]) {
      snapshotPayloads.push(await loadSnapshotPayload(targetScope));
    }
  }
  let operationsPayload = snapshotPayloads[0] || null;
  let previousOperationsPayload = snapshotPayloads[1] || null;
  let totalOperationsPayload = snapshotPayloads[2] || null;
  if (!operationsPayload) {
    operationsPayload = await loadOperationsPayload({ user, scope });
  }
  const baseRowsOverride = operationsPayload.weeklyReportRaw ? weeklyRawToBaseRows(operationsPayload.weeklyReportRaw) : null;
  if (!previousOperationsPayload) {
    previousOperationsPayload = await loadOperationsPayload({ user, scope: previousScope, baseRowsOverride });
  }
  if (!totalOperationsPayload) {
    totalOperationsPayload = await loadOperationsPayload({ user, scope: totalScope, baseRowsOverride }).catch(() => null);
  }
  const snapshot = buildWeeklyBusinessReportSnapshot({
    period,
    operationsPayload,
    previousOperationsPayload,
    totalOperationsPayload,
    shareToken: existing?.shareToken || '',
    baseUrl,
    generationMode
  });
  const row = {
    ...snapshot,
    status: 'success',
    remark: existing?.remark || '',
    publicEdits: existing?.publicEdits || {},
    html: ''
  };
  row.html = renderWeeklyBusinessReportHtml(row, { remark: row.remark || '' });
  await put(table, row.id, row);
  return row;
}

module.exports = {
  WEEKLY_REPORT_CAMPUS_NAME,
  WEEKLY_REPORT_TABLE,
  resolveWeeklyBusinessReportPeriod,
  buildWeeklyBusinessReportSnapshot,
  renderWeeklyBusinessReportHtml,
  buildWeeklyBusinessReportFeishuText,
  sendWeeklyBusinessReportFeishuText,
  listWeeklyBusinessReports,
  findWeeklyBusinessReportByToken,
  updateWeeklyBusinessReportRemark,
  updateWeeklyBusinessReportPublicEdits,
  generateWeeklyBusinessReport
};
