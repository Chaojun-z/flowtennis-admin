function money(value) {
  return Math.round((Number(value) || 0) * 100) / 100;
}

function dateKey(input) {
  const text = String(input || '').trim();
  const match = text.match(/^(\d{4}-\d{2}-\d{2})/);
  if (match) return match[1];
  if (!text) return '';
  const date = new Date(text);
  if (Number.isNaN(date.getTime())) return '';
  return date.toISOString().slice(0, 10);
}

function addDays(day, amount) {
  const date = new Date(`${day}T00:00:00Z`);
  date.setUTCDate(date.getUTCDate() + amount);
  return date.toISOString().slice(0, 10);
}

function monthStart(day) {
  return `${String(day || '').slice(0, 7)}-01`;
}

function inRange(day, start, end) {
  return !!day && (!start || day >= start) && (!end || day <= end);
}

function businessRows(rows = []) {
  return (rows || []).filter((row) => !row?.differenceReason);
}

function rowsForDate(rows = [], day) {
  return businessRows(rows).filter((row) => dateKey(row.businessDate) === day);
}

function rowsForRange(rows = [], start, end) {
  return businessRows(rows).filter((row) => inRange(dateKey(row.businessDate), start, end));
}

function sumRows(rows = [], field) {
  return money((rows || []).reduce((sum, row) => sum + (Number(row?.[field]) || 0), 0));
}

function receiptCount(rows = []) {
  return (rows || []).filter((row) => String(row.action || row.transactionType || '') === '收款' && Number(row.cashDelta) > 0).length;
}

function isPackageReceipt(row = {}) {
  return (row.businessType === '课程' || row.businessTypeLevel1 === '课程') &&
    String(row.action || '') === '收款' &&
    String(row.sourceDocument || '').startsWith('购买记录');
}

function isBookingRow(row = {}) {
  return ['散客订场', '约球局', '课程订场'].includes(String(row.businessType || row.displayBusinessType || '').trim());
}

function isStoredValueReceipt(row = {}) {
  return row.businessType === '会员储值' || row.businessTypeLevel1 === '储值';
}

function isCourseRecognized(row = {}) {
  return (row.businessType === '课程' || row.businessTypeLevel1 === '课程') && Number(row.recognizedRevenueDelta) !== 0;
}

function isStoredValueRecognized(row = {}) {
  return row.businessType === '会员订场' || (row.businessTypeLevel1 === '场地' && row.businessTypeLevel2 === '会员订场');
}

function campusLabelMap(campuses = []) {
  const map = new Map();
  (campuses || []).forEach((campus) => {
    const name = String(campus?.name || campus?.code || campus?.id || '').trim();
    [campus?.id, campus?.code, campus?.name].forEach((key) => {
      const text = String(key || '').trim();
      if (text) map.set(text, name);
    });
  });
  return map;
}

function scheduleMapById(scheduleRows = []) {
  return new Map((scheduleRows || []).map((row) => [String(row?.id || ''), row]));
}

function lessonRedemptionRows({ entitlementLedger = [], scheduleRows = [], campuses = [], targetDate = '' } = {}) {
  const schedules = scheduleMapById(scheduleRows);
  const campusMap = campusLabelMap(campuses);
  return (entitlementLedger || [])
    .filter((row) => Number(row?.lessonDelta) < 0 && dateKey(row.relatedDate || row.createdAt || row.sourceDate) === targetDate)
    .map((row) => {
      const schedule = schedules.get(String(row.scheduleId || '')) || {};
      const campusRaw = row.campus || row.campusName || schedule.campus || schedule.campusName || '';
      return {
        studentId: String(row.studentId || schedule.studentId || '').trim(),
        campusName: campusMap.get(String(campusRaw || '').trim()) || String(campusRaw || '').trim() || '未归属校区',
        lessonUnits: Math.abs(Number(row.lessonDelta) || 0)
      };
    });
}

function lessonSummary(rows = []) {
  return {
    todayStudents: new Set((rows || []).map((row) => row.studentId).filter(Boolean)).size,
    todayLessonUnits: money((rows || []).reduce((sum, row) => sum + (Number(row.lessonUnits) || 0), 0))
  };
}

function metricBlock(rows, field, targetDate) {
  const todayRows = rowsForDate(rows, targetDate);
  const yesterday = addDays(targetDate, -1);
  const sevenStart = addDays(targetDate, -6);
  const monthStartDate = monthStart(targetDate);
  return {
    today: sumRows(todayRows, field),
    yesterday: sumRows(rowsForDate(rows, yesterday), field),
    sevenDayAverage: money(sumRows(rowsForRange(rows, sevenStart, targetDate), field) / 7),
    monthToDate: sumRows(rowsForRange(rows, monthStartDate, targetDate), field)
  };
}

function currentPendingRows(rows = [], endDate = '') {
  return rowsForRange(rows, '', endDate);
}

function studentIdsForSchedule(row = {}) {
  const ids = []
    .concat(Array.isArray(row.studentIds) ? row.studentIds : [])
    .concat(row.studentId || '')
    .map((item) => String(item || '').trim())
    .filter(Boolean);
  return Array.from(new Set(ids));
}

function tomorrowScheduleSummary(scheduleRows = [], targetDate = '') {
  const tomorrow = addDays(targetDate, 1);
  const rows = (scheduleRows || []).filter((row) => dateKey(row.startTime || row.date) === tomorrow && String(row.status || '') !== '已取消');
  const studentIds = new Set();
  rows.forEach((row) => studentIdsForSchedule(row).forEach((id) => studentIds.add(id)));
  return {
    lessonCount: rows.length,
    studentCount: studentIds.size,
    trialLessonCount: rows.filter((row) => String(row.courseType || row.standardCourseType || '').includes('体验')).length
  };
}

function buildCampusRows({ campuses = [], financeNormalizedRows = [], redemptionRows = [], targetDate = '' } = {}) {
  const todayRows = rowsForDate(financeNormalizedRows, targetDate);
  const pendingRows = currentPendingRows(financeNormalizedRows, targetDate);
  const campusNames = new Set((campuses || []).map((campus) => String(campus?.name || campus?.code || campus?.id || '').trim()).filter(Boolean));
  todayRows.forEach((row) => campusNames.add(String(row.campusName || '').trim() || '未归属校区'));
  redemptionRows.forEach((row) => campusNames.add(row.campusName || '未归属校区'));
  return [...campusNames].map((campusName) => {
    const matchedTodayRows = todayRows.filter((row) => (String(row.campusName || '').trim() || '未归属校区') === campusName);
    const matchedPendingRows = pendingRows.filter((row) => (String(row.campusName || '').trim() || '未归属校区') === campusName);
    const matchedRedemptions = redemptionRows.filter((row) => row.campusName === campusName);
    return {
      campusName,
      cash: sumRows(matchedTodayRows, 'cashDelta'),
      recognized: sumRows(matchedTodayRows, 'recognizedRevenueDelta'),
      tradeCount: receiptCount(matchedTodayRows),
      lessonStudents: new Set(matchedRedemptions.map((row) => row.studentId).filter(Boolean)).size,
      lessonUnits: money(matchedRedemptions.reduce((sum, row) => sum + (Number(row.lessonUnits) || 0), 0)),
      pendingRevenue: sumRows(matchedPendingRows, 'deferredRevenueDelta')
    };
  }).filter((row) => row.cash || row.recognized || row.tradeCount || row.lessonStudents || row.lessonUnits || row.pendingRevenue)
    .sort((a, b) => b.cash - a.cash || String(a.campusName).localeCompare(String(b.campusName), 'zh-Hans-CN'));
}

function buildBusinessDailyReportSnapshot({
  targetDate = '',
  generatedAt = new Date().toISOString(),
  financeNormalizedRows = [],
  entitlementLedger = [],
  scheduleRows = [],
  campuses = []
} = {}) {
  const today = targetDate || dateKey(generatedAt);
  const todayRows = rowsForDate(financeNormalizedRows, today);
  const redemptionRows = lessonRedemptionRows({ entitlementLedger, scheduleRows, campuses, targetDate: today });
  return {
    schemaVersion: 'business-daily-report-v1',
    generatedAt,
    today,
    overall: {
      cash: metricBlock(financeNormalizedRows, 'cashDelta', today),
      recognized: metricBlock(financeNormalizedRows, 'recognizedRevenueDelta', today),
      tradeCount: {
        today: receiptCount(todayRows)
      },
      lessonRedemption: lessonSummary(redemptionRows),
      pendingRevenue: {
        current: sumRows(currentPendingRows(financeNormalizedRows, today), 'deferredRevenueDelta')
      }
    },
    campusRows: buildCampusRows({ campuses, financeNormalizedRows, redemptionRows, targetDate: today }),
    incomeStructure: {
      packageIncome: sumRows(todayRows.filter(isPackageReceipt), 'cashDelta'),
      bookingIncome: sumRows(todayRows.filter(isBookingRow), 'cashDelta'),
      storedValueIncome: sumRows(todayRows.filter(isStoredValueReceipt), 'cashDelta')
    },
    recognitionStructure: {
      courseRecognized: sumRows(todayRows.filter(isCourseRecognized), 'recognizedRevenueDelta'),
      bookingRecognized: sumRows(todayRows.filter(isBookingRow), 'recognizedRevenueDelta'),
      storedValueRecognized: sumRows(todayRows.filter(isStoredValueRecognized), 'recognizedRevenueDelta')
    },
    tomorrowSchedule: tomorrowScheduleSummary(scheduleRows, today)
  };
}

module.exports = {
  addDays,
  buildBusinessDailyReportSnapshot,
  dateKey,
  money
};
