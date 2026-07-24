const { normalizeCampusValue } = require('../../public/assets/scripts/core/campus.js');

function money(value) {
  return Math.round((Number(value) || 0) * 100) / 100;
}

function campusKey(value) {
  return normalizeCampusValue(value);
}

function financeBusinessRows(rows = []) {
  return (rows || []).filter(row => !row?.differenceReason);
}

function sumFinanceRows(rows = [], field) {
  return money((rows || []).reduce((sum, row) => sum + (Number(row?.[field]) || 0), 0));
}

function financeCourseRows(rows = []) {
  return (rows || []).filter(row => row.businessType === '课程' || row.businessTypeLevel1 === '课程');
}

function financePackageReceiptRows(rows = []) {
  return financeCourseRows(rows).filter(row => row.action === '收款' && String(row.sourceDocument || '').startsWith('购买记录'));
}

function financePackageRecognizedRows(rows = []) {
  return financeCourseRows(rows).filter(row => (
    ['消耗', '回退', '已入账'].includes(String(row.action || row.transactionType || '')) &&
    String(row.paymentChannel || row.normalizedPaymentMethod || row.payMethod || '') === '课包划扣'
  ));
}

function financeDirectCourseRows(rows = []) {
  return financeCourseRows(rows).filter(row => row.action === '收款' && String(row.sourceDocument || '').startsWith('排课'));
}

function financeStoredValueRows(rows = []) {
  return (rows || []).filter(row => row.businessType === '会员储值' || row.businessTypeLevel1 === '储值');
}

function financeStoredValueConsumedRows(rows = []) {
  return (rows || []).filter(row => row.businessType === '会员订场' || (row.businessTypeLevel1 === '场地' && row.businessTypeLevel2 === '会员订场'));
}

function financeBookingRows(rows = []) {
  return (rows || []).filter(row => ['散客订场', '约球局', '课程订场'].includes(String(row.businessType || row.displayBusinessType || '').trim()));
}

function financeReceiptRows(rows = []) {
  return (rows || []).filter(row => String(row.action || row.transactionType || '') === '收款' && Number(row.cashDelta) > 0);
}

function financeDateKey(value) {
  const text = String(value || '').trim();
  if (!text) return '';
  const normalized = text.replace(/\//g, '-').replace(/\./g, '-');
  return normalized.slice(0, 10);
}

function financeRowMatchesScope(row = {}, scope = {}) {
  const campusValues = [scope.campusName, scope.campus, scope.campusCode]
    .map(campusKey)
    .filter(value => value && value !== 'all');
  if (campusValues.length) {
    const rowCampusValues = [row.campusName, row.campus, row.campusCode]
      .map(campusKey)
      .filter(Boolean);
    if (!campusValues.some(value => rowCampusValues.includes(value))) return false;
  }
  const day = financeDateKey(row.businessDate || row.purchaseDate || row.relatedDate || row.createdAt);
  const start = financeDateKey(scope.startDate);
  const end = financeDateKey(scope.endDate);
  if (start && day && day < start) return false;
  if (end && day && day > end) return false;
  return true;
}

function financeRowsInScope(rows = [], scope = {}) {
  if (!scope || (!scope.campusName && !scope.campus && !scope.startDate && !scope.endDate)) return rows || [];
  return (rows || []).filter(row => financeRowMatchesScope(row, scope));
}

function buildFinanceOverviewAllFromRows(rows = [], scope = {}) {
  const businessRows = financeBusinessRows(financeRowsInScope(rows, scope));
  const courseRows = financeCourseRows(businessRows);
  const bookingRows = financeBookingRows(businessRows);
  return {
    cash: sumFinanceRows(businessRows, 'cashDelta'),
    recognized: sumFinanceRows(businessRows, 'recognizedRevenueDelta'),
    deferred: sumFinanceRows(businessRows, 'deferredRevenueDelta'),
    courseIncome: sumFinanceRows(courseRows, 'cashDelta'),
    courseRecognized: sumFinanceRows(courseRows, 'recognizedRevenueDelta'),
    directCourseIncome: sumFinanceRows(financeDirectCourseRows(businessRows), 'cashDelta'),
    directCourseRecognized: sumFinanceRows(financeDirectCourseRows(businessRows), 'recognizedRevenueDelta'),
    packageIncome: sumFinanceRows(financePackageReceiptRows(businessRows), 'cashDelta'),
    packageRecognized: sumFinanceRows(financePackageRecognizedRows(businessRows), 'recognizedRevenueDelta'),
    storedValueIncome: sumFinanceRows(financeStoredValueRows(businessRows), 'cashDelta'),
    storedValueConsumed: sumFinanceRows(financeStoredValueConsumedRows(businessRows), 'recognizedRevenueDelta'),
    bookingIncome: sumFinanceRows(bookingRows, 'cashDelta'),
    bookingRecognized: sumFinanceRows(bookingRows, 'recognizedRevenueDelta'),
    courtIncome: sumFinanceRows(bookingRows, 'cashDelta'),
    courtRecognized: sumFinanceRows(bookingRows, 'recognizedRevenueDelta'),
    tradeCount: financeReceiptRows(businessRows).length
  };
}

function buildFinanceOverviewDataFromRows(rows = [], scope = {}) {
  return {
    all: buildFinanceOverviewAllFromRows(rows, scope),
    campuses: []
  };
}

function financeAll(financeOverviewData = {}) {
  return financeOverviewData.all && typeof financeOverviewData.all === 'object'
    ? financeOverviewData.all
    : financeOverviewData;
}

function financeNumber(financeOverviewData = {}, keys = []) {
  const all = financeAll(financeOverviewData);
  for (const key of keys) {
    if (!Object.prototype.hasOwnProperty.call(all || {}, key) || all[key] == null) continue;
    const value = Number(all?.[key]);
    if (Number.isFinite(value)) return money(value);
  }
  return 0;
}

function buildFinanceOverviewSummaryFromData(financeOverviewData = {}) {
  const all = financeAll(financeOverviewData);
  return {
    hasRows: Object.keys(all || {}).length > 0,
    totalIncome: financeNumber(financeOverviewData, ['cash', 'totalIncome']),
    recognizedRevenue: financeNumber(financeOverviewData, ['recognized', 'recognizedRevenue']),
    pendingRevenue: financeNumber(financeOverviewData, ['deferred', 'pendingRevenue']),
    courseIncome: financeNumber(financeOverviewData, ['courseIncome']),
    courseRecognized: financeNumber(financeOverviewData, ['courseRecognized']),
    directCourseIncome: financeNumber(financeOverviewData, ['directCourseIncome']),
    directCourseRecognized: financeNumber(financeOverviewData, ['directCourseRecognized']),
    packageIncome: financeNumber(financeOverviewData, ['packageIncome']),
    packageRecognized: financeNumber(financeOverviewData, ['packageRecognized']),
    bookingIncome: financeNumber(financeOverviewData, ['bookingIncome', 'courtIncome']),
    bookingRecognized: financeNumber(financeOverviewData, ['bookingRecognized', 'courtRecognized']),
    storedValueIncome: financeNumber(financeOverviewData, ['storedValueIncome']),
    storedValueConsumed: financeNumber(financeOverviewData, ['storedValueConsumed']),
    tradeCount: financeNumber(financeOverviewData, ['tradeCount'])
  };
}

function buildFinanceOverviewSummaryFromRows(rows = []) {
  const overviewData = buildFinanceOverviewDataFromRows(rows);
  const summary = buildFinanceOverviewSummaryFromData(overviewData);
  return {
    ...summary,
    hasRows: financeBusinessRows(rows).length > 0
  };
}

function mergeFinanceOverviewDataWithRows(baseOverviewData = {}, incrementRows = []) {
  const base = { ...(financeAll(baseOverviewData) || {}) };
  const delta = buildFinanceOverviewDataFromRows(incrementRows).all;
  const all = {
    ...base,
    cash: money((Number(base.cash ?? base.totalIncome) || 0) + delta.cash),
    recognized: money((Number(base.recognized ?? base.recognizedRevenue) || 0) + delta.recognized),
    deferred: money((Number(base.deferred ?? base.pendingRevenue) || 0) + delta.deferred),
    courseIncome: money((Number(base.courseIncome ?? base.packageIncome) || 0) + delta.courseIncome),
    courseRecognized: money((Number(base.courseRecognized ?? base.packageRecognized) || 0) + delta.courseRecognized),
    directCourseIncome: money((Number(base.directCourseIncome) || 0) + delta.directCourseIncome),
    directCourseRecognized: money((Number(base.directCourseRecognized) || 0) + delta.directCourseRecognized),
    packageIncome: money((Number(base.packageIncome) || 0) + delta.packageIncome),
    packageRecognized: money((Number(base.packageRecognized) || 0) + delta.packageRecognized),
    storedValueIncome: money((Number(base.storedValueIncome) || 0) + delta.storedValueIncome),
    storedValueConsumed: money((Number(base.storedValueConsumed) || 0) + delta.storedValueConsumed),
    bookingIncome: money((Number(base.bookingIncome ?? base.courtIncome) || 0) + delta.bookingIncome),
    bookingRecognized: money((Number(base.bookingRecognized ?? base.courtRecognized) || 0) + delta.bookingRecognized),
    courtIncome: money((Number(base.courtIncome ?? base.bookingIncome) || 0) + delta.courtIncome),
    courtRecognized: money((Number(base.courtRecognized ?? base.bookingRecognized) || 0) + delta.courtRecognized),
    tradeCount: (Number(base.tradeCount) || 0) + delta.tradeCount
  };
  return { ...baseOverviewData, all };
}

module.exports = {
  buildFinanceOverviewDataFromRows,
  buildFinanceOverviewSummaryFromRows,
  buildFinanceOverviewSummaryFromData,
  mergeFinanceOverviewDataWithRows,
  financeRowsInScope
};
