const crypto = require('crypto');
const { effectiveScheduleStatus } = require('./schedule.js');
const { bookingDurationHours, normalizeCourtHistory, courtHistoryBusinessDate } = require('./page-data/court-account-read-model.js');
const businessTaxonomy = require('../public/assets/scripts/core/business-taxonomy.js');
const { normalizeCampusValue } = require('../public/assets/scripts/core/campus.js');

const WEEKLY_REPORT_CAMPUS_NAME = '顺义马坡';
const WEEKLY_REPORT_TIMEZONE = 'Asia/Shanghai';
const WEEKLY_REPORT_TABLE = 'ft_weekly_business_reports';

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

function isActiveCoach(row = {}) {
  return String(row.status || 'active').trim() === 'active';
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

function isValidSchedule(row = {}, period = {}) {
  return inPeriod(row.startTime, period) && campusMatches(row) && effectiveScheduleStatus(row) !== '已取消';
}

function isPrivateCoursePurchase(row = {}) {
  if (['voided', 'refunded', 'deleted'].includes(String(row.status || '').trim())) return false;
  const raw = `${row.courseType || ''} ${row.packageName || ''} ${row.productName || ''}`;
  return /私教/.test(raw) && !/体验/.test(raw);
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

function buildCourseRevenueFromRaw(raw = {}, period = {}, previousRaw = {}) {
  const privatePurchases = normalizeRows(raw.purchases).filter(row => campusMatches(row) && isPrivateCoursePurchase(row));
  const currentPurchases = privatePurchases.filter(row => inPeriod(row.purchaseDate || row.createdAt, period));
  const previousPeriod = { startDate: period.previousStartDate, endDate: period.previousEndDate };
  const previousPurchases = normalizeRows(previousRaw.purchases || raw.purchases).filter(row => campusMatches(row) && isPrivateCoursePurchase(row) && inPeriod(row.purchaseDate || row.createdAt, previousPeriod));
  const firstRows = currentPurchases.filter(row => isFirstPurchase(row, privatePurchases));
  const renewalRows = currentPurchases.filter(row => !isFirstPurchase(row, privatePurchases));
  const consumedRows = normalizeRows(raw.financeNormalizedRows).filter(row => {
    const type = String(row.businessType || row.displayBusinessType || '').trim();
    const action = String(row.action || row.transactionType || '').trim();
    return inPeriod(row.businessDate || row.date || row.createdAt, period) && /课程/.test(type) && /消耗|入账/.test(action);
  });
  const previousConsumedRows = normalizeRows(previousRaw.financeNormalizedRows || raw.financeNormalizedRows).filter(row => {
    const type = String(row.businessType || row.displayBusinessType || '').trim();
    const action = String(row.action || row.transactionType || '').trim();
    return inPeriod(row.businessDate || row.date || row.createdAt, previousPeriod) && /课程/.test(type) && /消耗|入账/.test(action);
  });
  const currentAmount = currentPurchases.reduce((sum, row) => sum + purchaseAmount(row), 0);
  const previousAmount = previousPurchases.reduce((sum, row) => sum + purchaseAmount(row), 0);
  const consumedAmount = consumedRows.reduce((sum, row) => sum + Math.abs(fieldNumber(row, ['recognizedRevenueDelta', 'amount', 'cashDelta'])), 0);
  const previousConsumedAmount = previousConsumedRows.reduce((sum, row) => sum + Math.abs(fieldNumber(row, ['recognizedRevenueDelta', 'amount', 'cashDelta'])), 0);
  const depletedEntitlements = normalizeRows(raw.entitlements).filter(row => {
    if (!campusMatches(row)) return false;
    const remaining = optionalNumber(row.remainingLessons);
    if (remaining === null || remaining > 0) return false;
    return inPeriod(row.depletedAt || row.updatedAt || row.lastConsumedAt || row.createdAt, period);
  });
  return {
    totalPeople: new Set(privatePurchases.map(purchaseStudentKey).filter(Boolean)).size,
    totalAmount: privatePurchases.reduce((sum, row) => sum + purchaseAmount(row), 0),
    newPeople: new Set(firstRows.map(purchaseStudentKey).filter(Boolean)).size,
    newAmount: firstRows.reduce((sum, row) => sum + purchaseAmount(row), 0),
    consumedAmount: numberValue(consumedAmount),
    renewalPeople: new Set(renewalRows.map(purchaseStudentKey).filter(Boolean)).size,
    renewalAmount: renewalRows.reduce((sum, row) => sum + purchaseAmount(row), 0),
    expiringPeople: new Set(depletedEntitlements.map(purchaseStudentKey).filter(Boolean)).size,
    compare: {
      people: compareValue(firstRows.length, previousPurchases.filter(row => isFirstPurchase(row, privatePurchases)).length),
      amount: compareValue(currentAmount, previousAmount),
      consumedAmount: compareValue(consumedAmount, previousConsumedAmount)
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
      if (!clean || (activeNames.size && !activeNames.has(clean))) return;
      const coach = normalizeCoachDisplayName(clean);
      const current = map.get(coach) || { coach, privateHours: 0, smallClassHours: 0, trialHours: 0, specialHours: 0, sparringHours: 0 };
      current[scheduleCourseBucket(row)] += scheduleHours(row);
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

function buildCourtUsageFromRaw(raw = {}, period = {}, previousRaw = {}) {
  const previousPeriod = { startDate: period.previousStartDate, endDate: period.previousEndDate };
  const activeNames = new Set(normalizeRows(raw.coaches).filter(isActiveCoach).map(row => cleanCoachName(row.name || row.coachName)).filter(Boolean));
  const scheduleBelongsToActiveCoach = row => {
    const clean = cleanCoachName(row.coach || row.coachName);
    return !activeNames.size || !clean || activeNames.has(clean);
  };
  const scheduleRows = normalizeRows(raw.schedule).filter(row => isValidSchedule(row, period) && scheduleBelongsToActiveCoach(row));
  const previousScheduleRows = normalizeRows(previousRaw.schedule || raw.schedule).filter(row => isValidSchedule(row, previousPeriod) && scheduleBelongsToActiveCoach(row));
  const historyRows = courtHistoryRows(raw, period);
  const previousHistoryRows = courtHistoryRows(previousRaw, previousPeriod);
  const labels = [
    { key: 'guest', label: '散客场地使用', tests: [/散客/, /约球局/] },
    { key: 'member', label: '会员场地使用', tests: [/会员/] },
    { key: 'course', label: '课程场地使用', tests: [/课程/] },
    { key: 'free', label: '免费场地使用', tests: [/免费/, /内部使用/, /领导/] }
  ];
  const sumHistory = (rows, meta) => rows.filter(row => meta.tests.some(test => test.test(rowLabel(row, ['businessType', 'displayBusinessType', 'category', 'type', 'name', 'label'], ''))))
    .reduce((acc, row) => ({
      count: acc.count + 1,
      hours: acc.hours + bookingDurationHours(row),
      amount: acc.amount + (meta.key === 'free' ? 0 : fieldNumber(row, ['amount', 'actualAmount', 'cashAmount'])),
      receivableAmount: acc.receivableAmount + fieldNumber(row, ['receivableAmount', 'originalAmount', 'concessionAmount', 'discountAmount', 'amount'])
    }), { count: 0, hours: 0, amount: 0, receivableAmount: 0 });
  const courseHours = scheduleRows.reduce((sum, row) => sum + scheduleHours(row), 0);
  const previousCourseHours = previousScheduleRows.reduce((sum, row) => sum + scheduleHours(row), 0);
  const result = labels.map(meta => {
    const current = sumHistory(historyRows, meta);
    const previous = sumHistory(previousHistoryRows, meta);
    if (meta.key === 'course') {
      current.count += scheduleRows.length;
      current.hours += courseHours;
      previous.count += previousScheduleRows.length;
      previous.hours += previousCourseHours;
    }
    if (meta.key === 'free') current.amount = 0;
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
  const totalHours = result.filter(row => row.key !== 'free').reduce((sum, row) => sum + row.hours, 0);
  return {
    totalAvailableHours: 392,
    actualUsedHours: numberValue(totalHours),
    utilizationRate: numberValue(totalHours * 100 / 392),
    usageRows: result.map(row => ({ ...row, share: percent(row.hours, result.reduce((sum, item) => sum + item.hours, 0)) })),
    freeUsage: result.find(row => row.key === 'free') || { count: 0, hours: 0, amount: 0, receivableAmount: 0 }
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

function buildWeeklyBusinessReportSnapshot({
  period,
  campusName = WEEKLY_REPORT_CAMPUS_NAME,
  operationsPayload = {},
  previousOperationsPayload = {},
  shareToken = '',
  baseUrl = 'https://www.flowtennis.cn',
  generatedAt = new Date().toISOString(),
  generationMode = 'auto'
} = {}) {
  const operations = operationsPayload.operations || {};
  const previous = previousOperationsPayload.operations || {};
  const raw = operationsPayload.weeklyReportRaw || {};
  const previousRaw = previousOperationsPayload.weeklyReportRaw || {};
  const token = String(shareToken || crypto.randomBytes(16).toString('hex')).trim();
  const totalIncome = cardValue(operations, ['overview', 'cards', 'totalIncome']);
  const previousTotalIncome = cardValue(previous, ['overview', 'cards', 'totalIncome']);
  const totalLeads = cardValue(operations, ['conversion', 'cards', 'totalLeads']);
  const reportSections = buildWeeklyReportSections(operations, previous, { period, raw, previousRaw });
  const utilizationRate = numberValue(reportSections.court?.utilizationRate ?? cardValue(operations, ['court', 'cards', 'utilizationRate']));
  const coachHours = numberValue(reportSections.coach?.totalHours ?? cardValue(operations, ['coach', 'cards', 'usedHours']));
  return {
    id: buildReportId(period),
    campusName,
    period,
    weekNumber: isoWeekNumber(period.endDate),
    generatedAt,
    generationMode,
    shareToken: token,
    shareUrl: `${normalizeBaseUrl(baseUrl)}/weekly-reports/${encodeURIComponent(token)}`,
    summary: {
      totalIncome: { value: totalIncome, compare: compareMetric(totalIncome, previousTotalIncome) },
      recognizedRevenue: { value: cardValue(operations, ['overview', 'cards', 'recognizedRevenue']) },
      courtUtilizationRate: { value: utilizationRate, compare: compareMetric(utilizationRate, cardValue(previous, ['court', 'cards', 'utilizationRate'])) },
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
  const labels = [
    { key: 'guest', label: '散客场地使用', tests: [/散客/, /非会员/] },
    { key: 'member', label: '会员场地使用', tests: [/会员/] },
    { key: 'course', label: '课程场地使用', tests: [/课程/] },
    { key: 'free', label: '免费场地使用', tests: [/免费/] }
  ];
  const sumBy = (sourceRows, meta) => sourceRows.filter(row => meta.tests.some(test => test.test(rowLabel(row, ['type', 'category', 'name', 'label'], ''))))
    .reduce((acc, row) => ({
      count: acc.count + fieldNumber(row, ['count', 'times', 'bookingCount', 'usageCount']),
      hours: acc.hours + fieldNumber(row, ['hours', 'durationHours', 'bookingHours', 'occupiedHours']),
      amount: acc.amount + fieldNumber(row, ['amount', 'actualAmount', 'cashAmount', 'bookingAmount']),
      receivableAmount: acc.receivableAmount + fieldNumber(row, ['receivableAmount', 'originalAmount', 'concessionAmount', 'discountAmount'])
    }), { count: 0, hours: 0, amount: 0, receivableAmount: 0 });
  const result = labels.map(meta => {
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
  const courseAmount = findRevenueMixValue(revenueMix, ['课程']) ?? optionalCardNumber(overview, ['courseIncome']);
  const prevCourseAmount = findRevenueMixValue(prevRevenueMix, ['课程']) ?? optionalCardNumber(prevOverview, ['courseIncome']);
  const courseConsumedAmount = optionalCardNumber(overview, ['courseRecognized']);
  const prevCourseConsumedAmount = optionalCardNumber(prevOverview, ['courseRecognized']);
  const totalAvailableHours = optionalCardNumber(court, ['totalAvailableHours', 'availableHours', 'capacityHours']);
  const currentCoachTotals = coachCourseTotals(coach.rows);
  const previousCoachTotals = coachCourseTotals(prevCoach.rows);
  const totalScheduled = numberValue(currentCoachTotals.privateHours + currentCoachTotals.smallClassHours + currentCoachTotals.trialHours + currentCoachTotals.specialHours + currentCoachTotals.sparringHours);
  const previousTotalScheduled = numberValue(previousCoachTotals.privateHours + previousCoachTotals.smallClassHours + previousCoachTotals.trialHours + previousCoachTotals.specialHours + previousCoachTotals.sparringHours);
  const rawCourseRevenue = raw.purchases ? buildCourseRevenueFromRaw(raw, period, previousRaw) : null;
  const rawCourt = raw.courts || raw.schedule ? buildCourtUsageFromRaw(raw, period, previousRaw) : null;
  const rawCoach = raw.schedule ? buildCoachFromSchedules(raw, period, previousRaw) : null;
  const allLeadSources = businessTaxonomy.LEAD_SOURCE_OPTIONS.map(item => item.value);
  const leadSourceRows = normalizeLeadSourceRows(normalizeRows(conversion.sourceRows), normalizeRows(prevConversion.sourceRows), allLeadSources);
  const leadSourceDeals = leadSourceRows.reduce((sum, row) => sum + numberValue(row.deals), 0);
  return {
    revenue: {
      total: {
        totalIncome: cardNumber(overview, ['totalIncome']),
        recognizedRevenue: cardNumber(overview, ['recognizedRevenue']),
        pendingRevenue: cardNumber(overview, ['pendingRevenue']),
        tradeCount: cardNumber(overview, ['tradeCount'])
      },
      storedValue: {
        totalMembers: optionalCardNumber(overview, ['storedValueMembers', 'membershipStoredValueMembers']),
        newMembers: optionalCardNumber(overview, ['newStoredValueMembers', 'newMembershipStoredValueMembers']),
        totalAmount: storedValueAmount,
        newAmount: storedValueAmount,
        compare: storedValueAmount === null ? null : compareValue(storedValueAmount, prevStoredValueAmount || 0),
        typeRows: storedValueAmount === null ? [] : [{ type: '会员储值', amount: storedValueAmount, share: percent(storedValueAmount, cardNumber(overview, ['totalIncome'])) }]
      },
      course: {
        totalPeople: rawCourseRevenue?.totalPeople ?? optionalCardNumber(overview, ['courseIncomePeople', 'courseStudents']),
        totalAmount: rawCourseRevenue?.totalAmount ?? courseAmount,
        newPeople: rawCourseRevenue?.newPeople ?? optionalCardNumber(overview, ['newCourseIncomePeople', 'newCourseStudents']),
        newAmount: rawCourseRevenue?.newAmount ?? courseAmount,
        consumedAmount: rawCourseRevenue?.consumedAmount ?? courseConsumedAmount,
        renewalPeople: rawCourseRevenue?.renewalPeople ?? optionalCardNumber(overview, ['renewalPeople', 'courseRenewalPeople']),
        renewalAmount: rawCourseRevenue?.renewalAmount ?? optionalCardNumber(overview, ['renewalAmount', 'courseRenewalAmount']),
        expiringPeople: rawCourseRevenue?.expiringPeople ?? optionalCardNumber(overview, ['expiringPeople', 'courseExpiringPeople']),
        expiringAmount: optionalCardNumber(overview, ['expiringAmount', 'courseExpiringAmount']),
        compare: {
          people: rawCourseRevenue?.compare?.people ?? null,
          amount: rawCourseRevenue?.compare?.amount ?? (courseAmount === null ? null : compareValue(courseAmount, prevCourseAmount || 0)),
          consumedAmount: rawCourseRevenue?.compare?.consumedAmount ?? (courseConsumedAmount === null ? null : compareValue(courseConsumedAmount, prevCourseConsumedAmount || 0))
        }
      },
      mixRows: revenueMix
    },
    court: {
      totalAvailableHours: rawCourt?.totalAvailableHours ?? totalAvailableHours,
      actualUsedHours: rawCourt?.actualUsedHours ?? cardNumber(court, ['bookingHours']),
      utilizationRate: rawCourt?.utilizationRate ?? cardNumber(court, ['utilizationRate']),
      usageRows: rawCourt?.usageRows ?? normalizeCourtUsageRows(court, prevCourt),
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

function metricBlock(label, value, suffix = '') {
  return `<section class="metric"><span>${escapeHtml(label)}</span><strong>${escapeHtml(value)}${escapeHtml(suffix)}</strong></section>`;
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

function reportMetric(label, value, unit = '', compare = null) {
  const empty = value === null || value === undefined || value === '';
  return `<section class="metric"><span>${escapeHtml(label)}</span><strong>${escapeHtml(displayMetricValue(value))}${empty ? '' : escapeHtml(unit)}</strong>${compare ? `<em>${escapeHtml(trendText(compare))}</em>` : ''}</section>`;
}

function barChart(rows = [], { labelKey = 'name', valueKey = 'value', unit = '' } = {}) {
  const clean = normalizeRows(rows).filter(row => fieldNumber(row, [valueKey]) > 0);
  if (!clean.length) return '<p class="empty">暂无可绘制数据</p>';
  const max = Math.max(...clean.map(row => fieldNumber(row, [valueKey])), 1);
  return `<div class="bars">${clean.map(row => {
    const value = fieldNumber(row, [valueKey]);
    return `<div class="bar-row"><span>${escapeHtml(rowLabel(row, [labelKey, 'label', 'type']))}</span><i><b style="width:${Math.max(4, percent(value, max))}%"></b></i><strong>${escapeHtml(value)}${escapeHtml(unit)}</strong></div>`;
  }).join('')}</div>`;
}

function donutChart(rows = [], { labelKey = 'name', valueKey = 'value' } = {}) {
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
  return `<div class="donut-wrap"><div class="donut" style="background:conic-gradient(${stops})"></div><div class="legend">${clean.map((row, index) => `<span><i style="background:${colors[index % colors.length]}"></i>${escapeHtml(rowLabel(row, [labelKey, 'label', 'type']))} ${percent(fieldNumber(row, [valueKey]), total)}%</span>`).join('')}</div></div>`;
}

function lineChart(rows = [], { valueKey = 'value', unit = '%' } = {}) {
  const clean = normalizeRows(rows).filter(row => row.label || row.date);
  if (!clean.length) return '<p class="empty">暂无可绘制数据</p>';
  const max = Math.max(...clean.map(row => fieldNumber(row, [valueKey])), 1);
  const points = clean.map((row, index) => {
    const x = clean.length === 1 ? 50 : 8 + index * (84 / (clean.length - 1));
    const y = 92 - (fieldNumber(row, [valueKey]) / max) * 76;
    return { x, y, row };
  });
  return `<div class="line-chart"><svg viewBox="0 0 100 100" role="img" aria-label="趋势图"><polyline points="${points.map(p => `${p.x},${p.y}`).join(' ')}" fill="none" stroke="#7CFF44" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/>${points.map(p => `<circle cx="${p.x}" cy="${p.y}" r="2.3" fill="#070A08" stroke="#7CFF44" stroke-width="1.4"/>`).join('')}</svg><div class="line-labels">${points.map(p => `<span>${escapeHtml(p.row.label || String(p.row.date || '').slice(5))}<b>${escapeHtml(fieldNumber(p.row, [valueKey]))}${escapeHtml(unit)}</b></span>`).join('')}</div></div>`;
}

function progressPanel(rows = [], { labelKey = 'label', valueKey = 'hours', unit = '' } = {}) {
  const clean = normalizeRows(rows);
  if (!clean.length) return '<p class="empty">暂无可绘制数据</p>';
  const max = Math.max(...clean.map(row => fieldNumber(row, [valueKey])), 1);
  return `<div class="progress-list">${clean.map(row => {
    const value = fieldNumber(row, [valueKey]);
    return `<div class="progress-item"><div><span>${escapeHtml(rowLabel(row, [labelKey, 'name', 'type']))}</span><strong>${escapeHtml(value)}${escapeHtml(unit)}</strong></div><i><b style="width:${Math.max(2, percent(value, max))}%"></b></i></div>`;
  }).join('')}</div>`;
}

function ringPanel(value = 0, label = '') {
  const safe = Math.max(0, Math.min(100, numberValue(value)));
  return `<div class="ring-panel"><div class="ring" style="--p:${safe}"><span>${escapeHtml(safe)}%</span></div><p>${escapeHtml(label)}</p></div>`;
}

function renderRows(rows = [], columns = []) {
  if (!rows.length) return '<p class="empty">暂无数据</p>';
  return `<table><thead><tr>${columns.map(col => `<th>${escapeHtml(col.label)}</th>`).join('')}</tr></thead><tbody>${rows.map(row => `<tr>${columns.map(col => `<td>${escapeHtml(typeof col.render === 'function' ? col.render(row) : (row[col.key] ?? '-'))}</td>`).join('')}</tr>`).join('')}</tbody></table>`;
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
  return `<!doctype html>
<html lang="zh-CN">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width,initial-scale=1">
  <title>${escapeHtml(snapshot.campusName || WEEKLY_REPORT_CAMPUS_NAME)}周报</title>
  <style>
    *{box-sizing:border-box}body{margin:0;background:#070A08;color:#fff;font-family:Inter,-apple-system,BlinkMacSystemFont,"PingFang SC","Microsoft YaHei",sans-serif;background-image:linear-gradient(to right,#111813 1px,transparent 1px),linear-gradient(to bottom,#111813 1px,transparent 1px);background-size:40px 40px}
    header{position:sticky;top:0;z-index:2;border-bottom:1px solid #18221B;background:rgba(7,10,8,.94);backdrop-filter:blur(12px)}.topbar{max-width:1600px;height:64px;margin:0 auto;padding:0 24px;display:flex;align-items:center;justify-content:space-between;gap:20px}.tag{background:#7CFF44;color:#070A08;border-radius:4px;padding:6px 10px;font:700 12px ui-monospace,SFMono-Regular,monospace;letter-spacing:.04em}.path{color:#889E8D;font:12px ui-monospace,SFMono-Regular,monospace;text-transform:uppercase}.live{border:1px solid #18221B;background:rgba(0,0,0,.3);border-radius:8px;color:#7CFF44;padding:7px 12px;font:12px ui-monospace,SFMono-Regular,monospace}
    main{max-width:1600px;margin:0 auto;padding:32px 24px 56px}.hero{display:grid;grid-template-columns:7fr 5fr;gap:20px;align-items:end;margin-bottom:22px}.eyebrow{color:#7CFF44;font:12px ui-monospace,SFMono-Regular,monospace;letter-spacing:.12em;text-transform:uppercase}h1{font-size:38px;line-height:1.15;margin:12px 0 10px;letter-spacing:0}h2{font-size:15px;margin:0;color:#fff}.muted{color:#889E8D}.hero-copy{color:#889E8D;margin:0}.section-title{margin:26px 0 12px;padding-top:10px;border-top:1px solid rgba(24,34,27,.6);display:flex;align-items:center;justify-content:space-between}.section-title span{color:#7CFF44;font:12px ui-monospace,SFMono-Regular,monospace;letter-spacing:.12em;text-transform:uppercase}
    .grid{display:grid;grid-template-columns:repeat(4,minmax(0,1fr));gap:14px}.grid.five{grid-template-columns:repeat(5,minmax(0,1fr))}.split{display:grid;grid-template-columns:1fr 1fr;gap:14px}.panel,.metric{background:#0D120F;border:1px solid #18221B;border-radius:12px;padding:18px}.panel{margin-top:14px}.panel:hover,.metric:hover{border-color:#2C3D2F}.metric span{display:block;color:#889E8D;font-size:12px}.metric strong{display:block;margin-top:8px;font:700 30px ui-monospace,SFMono-Regular,monospace;color:#fff;letter-spacing:0}.metric em{display:block;margin-top:8px;color:#7CFF44;font-size:12px;font-style:normal}
    .hero-kpis{background:#0D120F;border:1px solid #18221B;border-radius:12px;padding:18px;display:grid;grid-template-columns:repeat(3,1fr);gap:12px}.hero-kpis .metric{border:0;border-right:1px solid rgba(24,34,27,.8);border-radius:0;padding:4px 12px}.hero-kpis .metric:last-child{border-right:0}.hero-kpis .metric strong{font-size:32px}
    table{width:100%;border-collapse:collapse;background:#0D120F;border:1px solid #18221B;border-radius:12px;overflow:hidden;margin-top:14px}th,td{text-align:left;padding:11px 12px;border-bottom:1px solid rgba(24,34,27,.8);font-size:13px}th{color:#889E8D;background:#111813;font-weight:600}td{color:#fff}tr:last-child td{border-bottom:0}.remark{white-space:pre-wrap;background:#0D120F;border:1px solid #18221B;border-radius:12px;padding:14px;color:#889E8D}.empty{color:#889E8D}
    .bars{display:grid;gap:11px}.bar-row{display:grid;grid-template-columns:132px 1fr 92px;gap:12px;align-items:center;font-size:13px}.bar-row span{color:#889E8D}.bar-row i{height:10px;background:#18221B;border-radius:3px;overflow:hidden}.bar-row b{display:block;height:100%;background:#7CFF44;border-radius:3px}.bar-row strong{font-family:ui-monospace,SFMono-Regular,monospace;color:#fff}
    .donut-wrap{display:flex;align-items:center;gap:20px}.donut{width:150px;height:150px;border-radius:50%;position:relative}.donut:after{content:"";position:absolute;inset:35px;border-radius:50%;background:#0D120F}.legend{display:grid;gap:9px;font-size:13px}.legend span{display:flex;align-items:center;gap:8px;color:#889E8D}.legend i{width:10px;height:10px;border-radius:50%}
    .line-chart svg{width:100%;height:210px;background:#070A08;border:1px solid #18221B;border-radius:8px;background-image:linear-gradient(to right,rgba(24,34,27,.55) 1px,transparent 1px),linear-gradient(to bottom,rgba(24,34,27,.55) 1px,transparent 1px);background-size:44px 44px}.line-labels{display:grid;grid-template-columns:repeat(7,1fr);gap:6px;margin-top:10px;color:#3E5244;font:12px ui-monospace,SFMono-Regular,monospace}.line-labels b{display:block;color:#889E8D;margin-top:3px}
    .progress-list{display:grid;gap:14px}.progress-item div{display:flex;justify-content:space-between;color:#889E8D;font-size:12px;margin-bottom:6px}.progress-item strong{color:#fff;font-family:ui-monospace,SFMono-Regular,monospace}.progress-item i{display:block;height:10px;background:#18221B;border-radius:3px;overflow:hidden}.progress-item b{display:block;height:100%;background:#7CFF44}.ring-panel{display:grid;place-items:center;gap:12px;padding:18px}.ring{--p:0;width:150px;height:150px;border-radius:50%;display:grid;place-items:center;background:conic-gradient(#7CFF44 calc(var(--p)*1%),#18221B 0);position:relative}.ring:after{content:"";position:absolute;inset:28px;border-radius:50%;background:#0D120F}.ring span{position:relative;z-index:1;font:700 30px ui-monospace,SFMono-Regular,monospace}.ring-panel p{margin:0;color:#889E8D;font-size:12px}
    @media(max-width:900px){.hero,.split{grid-template-columns:1fr}.grid,.grid.five{grid-template-columns:repeat(2,minmax(0,1fr))}.hero-kpis{grid-template-columns:1fr}.hero-kpis .metric{border-right:0;border-bottom:1px solid rgba(24,34,27,.8)}.hero-kpis .metric:last-child{border-bottom:0}.topbar{padding:0 14px}.path{display:none}main{padding:24px 14px}.metric strong{font-size:22px}.line-labels{grid-template-columns:repeat(2,1fr)}.bar-row{grid-template-columns:96px 1fr 74px}}
  </style>
</head>
<body>
<header><div class="topbar"><div><span class="tag">FLOWTENNIS</span> <span class="path">// WEEKLY BUSINESS REPORT</span></div><div class="live">● ${escapeHtml(period.startDate)} - ${escapeHtml(period.endDate)}</div></div></header>
<main>
  <section class="hero">
    <div>
      <div class="eyebrow">// SHUNYI MAPO OVERVIEW</div>
      <h1>${escapeHtml(snapshot.campusName || WEEKLY_REPORT_CAMPUS_NAME)}周报</h1>
      <p class="hero-copy">${escapeHtml(period.startDate)} 至 ${escapeHtml(period.endDate)}${snapshot.weekNumber ? `（第 ${escapeHtml(snapshot.weekNumber)} 周）` : ''}</p>
    </div>
    <div class="hero-kpis">
      ${metricBlock('总收入', summary.totalIncome?.value || 0, ' 元')}
      ${metricBlock('场地利用率', summary.courtUtilizationRate?.value || 0, '%')}
      ${metricBlock('线索数', summary.totalLeads?.value || 0, ' 条')}
    </div>
  </section>
  <div class="grid five">
    ${metricBlock('总收入', summary.totalIncome?.value || 0, ' 元')}
    ${metricBlock('已入账', summary.recognizedRevenue?.value || 0, ' 元')}
    ${metricBlock('场地利用率', summary.courtUtilizationRate?.value || 0, '%')}
    ${metricBlock('教练课时', summary.coachHours?.value || 0, ' 小时')}
    ${metricBlock('线索数', summary.totalLeads?.value || 0, ' 条')}
  </div>

  <div class="section-title"><h2>1、收入数据</h2><span>// REVENUE</span></div>
  <h3>1.1 储值会员</h3>
  <div class="grid">
    ${reportMetric('储值会员总数', revenue.storedValue?.totalMembers, ' 人')}
    ${reportMetric('本周新增会员', revenue.storedValue?.newMembers, ' 人')}
    ${reportMetric('总储值金额', revenue.storedValue?.totalAmount, ' 元')}
    ${reportMetric('本周新增储值', revenue.storedValue?.newAmount, ' 元', revenue.storedValue?.compare)}
  </div>
  <div class="split"><div class="panel">${donutChart(revenue.storedValue?.typeRows || [], { labelKey: 'type', valueKey: 'amount' })}</div><div class="panel">${progressPanel(revenue.storedValue?.typeRows || [], { labelKey: 'type', valueKey: 'amount', unit: '元' })}</div></div>
  <h3>1.2 课程收入</h3>
  <div class="grid">
    ${reportMetric('总人数', revenue.course?.totalPeople, ' 人')}
    ${reportMetric('总收入', revenue.course?.totalAmount, ' 元')}
    ${reportMetric('本周新增人数', revenue.course?.newPeople, ' 人', revenue.course?.compare?.people)}
    ${reportMetric('本周新增收入', revenue.course?.newAmount, ' 元', revenue.course?.compare?.amount)}
    ${reportMetric('本周新增消耗', revenue.course?.consumedAmount, ' 元', revenue.course?.compare?.consumedAmount)}
    ${reportMetric('续费人数', revenue.course?.renewalPeople, ' 人')}
    ${reportMetric('续费收入', revenue.course?.renewalAmount, ' 元')}
    ${reportMetric('到期人数', revenue.course?.expiringPeople, ' 人')}
  </div>
  <div class="split"><div class="panel">${donutChart(revenue.mixRows || [], { labelKey: 'name', valueKey: 'value' })}</div><div class="panel">${progressPanel(revenue.mixRows || [], { labelKey: 'name', valueKey: 'value', unit: '元' })}</div></div>

  <div class="section-title"><h2>2、场地数据</h2><span>// COURT USAGE</span></div>
  <div class="grid">
    ${reportMetric('总可用时长', court.totalAvailableHours, ' 小时')}
    ${reportMetric('实际使用时长', court.actualUsedHours || 0, ' 小时')}
    ${reportMetric('场地利用率', court.utilizationRate || 0, '%')}
    ${reportMetric('免费应收让利', court.freeUsage?.receivableAmount || 0, ' 元')}
  </div>
  <div class="split">
    <div class="panel"><h3>每天利用率</h3>${lineChart(court.weekdayRows || [], { valueKey: 'value', unit: '%' })}</div>
    <div class="panel"><h3>类型占比</h3>${ringPanel(court.utilizationRate || 0, '本周场地利用率')}${donutChart(court.usageRows || [], { labelKey: 'label', valueKey: 'hours' })}</div>
  </div>
  ${renderRows(court.usageRows || [], [
    { key: 'label', label: '类型' },
    { key: 'count', label: '次数' },
    { key: 'hours', label: '时长' },
    { key: 'amount', label: '金额' },
    { key: 'share', label: '占比', render: row => `${row.share || 0}%` },
    { key: 'compare', label: '环比', render: row => trendText(row.compare?.hours) }
  ])}

  <div class="section-title"><h2>3、教练课时</h2><span>// COACH HOURS</span></div>
  <div class="grid five">
    ${reportMetric('排课课时', coach.totalScheduled || 0, ' 小时', coach.compare?.totalScheduled)}
    ${reportMetric('私教课', coach.privateHours || 0, ' 小时')}
    ${reportMetric('小班课', coach.smallClassHours || 0, ' 小时')}
    ${reportMetric('体验课', coach.trialHours || 0, ' 小时')}
    ${reportMetric('专项课', coach.specialHours || 0, ' 小时')}
    ${reportMetric('陪打', coach.sparringHours || 0, ' 小时')}
  </div>
  <div class="split"><div class="panel">${barChart(coachRows, { labelKey: 'coach', valueKey: 'totalHours', unit: '小时' })}</div><div class="panel">${progressPanel([
    { label: '私教课', hours: coach.privateHours || 0 },
    { label: '小班课', hours: coach.smallClassHours || 0 },
    { label: '体验课', hours: coach.trialHours || 0 },
    { label: '专项课', hours: coach.specialHours || 0 },
    { label: '陪打', hours: coach.sparringHours || 0 }
  ], { labelKey: 'label', valueKey: 'hours', unit: '小时' })}</div></div>
  ${renderRows(coachRows, [
    { key: 'coach', label: '教练' },
    { key: 'scheduledCount', label: '本周排课量/上周排课量', render: row => `${row.scheduledCount || 0} / ${row.previousHours || 0}` },
    { key: 'compare', label: '环比', render: row => comparePercentText(row.compare) },
    { key: 'privateHours', label: '私教课' },
    { key: 'smallClassHours', label: '小班课' },
    { key: 'trialHours', label: '体验课' },
    { key: 'specialHours', label: '专项课' },
    { key: 'sparringHours', label: '陪打' }
  ])}

  <div class="section-title"><h2>4、线索转化</h2><span>// LEAD CONVERSION</span></div>
  <div class="grid">
    ${reportMetric('总线索数', conversion.totalLeads || 0, ' 条')}
    ${reportMetric('本周新增线索', conversion.newLeads || 0, ' 条', conversion.compare?.newLeads)}
    ${reportMetric('本周体验线索', conversion.trialLeads || 0, ' 条', conversion.compare?.trialLeads)}
    ${reportMetric('体验后报名', conversion.trialDeals || 0, ' 人', conversion.compare?.trialDeals)}
  </div>
  <div class="split"><div class="panel">${barChart(sourceRows.map(row => ({ name: row.source, value: row.leads })), { labelKey: 'name', valueKey: 'value', unit: '条' })}</div><div class="panel">${progressPanel(sourceRows.map(row => ({ label: row.source, value: row.deals })), { labelKey: 'label', valueKey: 'value', unit: '人' })}</div></div>
  ${renderRows(sourceRows, [
    { key: 'source', label: '渠道' },
    { key: 'leads', label: '线索数' },
    { key: 'trial', label: '体验线索' },
    { key: 'deals', label: '体验后报名' },
    { key: 'compare', label: '环比', render: row => trendText(row.compare?.leads) }
  ])}
  <div class="section-title"><h2>备注</h2><span>// REMARK</span></div>
  <p class="remark">${escapeHtml(remark || '暂无备注')}</p>
</main>
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

async function generateWeeklyBusinessReport({
  loadOperationsPayload,
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
    includeWeeklyReportRaw: true,
    dateRange: { startDate: period.startDate, endDate: period.endDate },
    metricScope: { campusName: WEEKLY_REPORT_CAMPUS_NAME, startDate: period.startDate, endDate: period.endDate }
  };
  const previousScope = {
    campusName: WEEKLY_REPORT_CAMPUS_NAME,
    includeWeeklyReportRaw: true,
    dateRange: { startDate: period.previousStartDate, endDate: period.previousEndDate },
    metricScope: { campusName: WEEKLY_REPORT_CAMPUS_NAME, startDate: period.previousStartDate, endDate: period.previousEndDate }
  };
  const existing = get ? await get(table, buildReportId(period)).catch(() => null) : null;
  const [operationsPayload, previousOperationsPayload] = await Promise.all([
    loadOperationsPayload({ user, scope }),
    loadOperationsPayload({ user, scope: previousScope })
  ]);
  const snapshot = buildWeeklyBusinessReportSnapshot({
    period,
    operationsPayload,
    previousOperationsPayload,
    shareToken: existing?.shareToken || '',
    baseUrl,
    generationMode
  });
  const row = {
    ...snapshot,
    status: 'success',
    remark: existing?.remark || '',
    html: renderWeeklyBusinessReportHtml(snapshot, { remark: existing?.remark || '' })
  };
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
  generateWeeklyBusinessReport
};
