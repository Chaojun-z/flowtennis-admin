const { buildTeachingStudentViews, buildStandardLifecycleMetrics, buildScopedStandardLifecycleMetrics } = require('../read-models/platform-metrics.js');
const { readReadyStudentTeachingSummaryRows } = require('../read-models/student-teaching-summary-cache.js');

function pageDataScopeFromQuery(query) {
  return {
    campus: String(query?.get('campus') || '').trim(),
    campusName: String(query?.get('campusName') || '').trim(),
    startDate: String(query?.get('startDate') || '').trim(),
    endDate: String(query?.get('endDate') || '').trim()
  };
}

function hasPageDataScope(scope = {}) {
  return !!(scope.campus && scope.campus !== 'all' || scope.campusName && scope.campusName !== 'all' || scope.startDate || scope.endDate);
}

function parseSnapshotArray(value) {
  if (Array.isArray(value)) return value;
  if (typeof value === 'string' && value.trim()) {
    try {
      const parsed = JSON.parse(value);
      return Array.isArray(parsed) ? parsed : [];
    } catch (e) {
      return [];
    }
  }
  return [];
}

function textSearchHit(q, ...values) {
  const keyword = String(q || '').trim().toLowerCase();
  if (!keyword) return true;
  return values.some(value => String(value || '').toLowerCase().includes(keyword));
}

function normalizedText(value) {
  return String(value || '').trim();
}

function normalizedKey(value) {
  return normalizedText(value).toLowerCase();
}

function summaryRowDateValue(row = {}) {
  return normalizedText(row.packagePurchaseDate || row.lastFormalLessonAt || row.detailRecentLessonDate || row.summaryUpdatedAt || row.updatedAt).slice(0, 10);
}

function summaryRowMatchesDate(row = {}, query) {
  const day = summaryRowDateValue(row);
  const start = normalizedText(query?.get('startDate')).slice(0, 10);
  const end = normalizedText(query?.get('endDate')).slice(0, 10);
  if (start && day && day < start) return false;
  if (end && day && day > end) return false;
  return true;
}

function summaryRowMatchesCampus(row = {}, query) {
  const expected = [query?.get('campus'), query?.get('campusName')]
    .map(normalizedKey)
    .filter(value => value && value !== 'all');
  if (!expected.length) return true;
  const actual = [row.campus, row.campusId, row.campusName, ...parseSnapshotArray(row.campusIds)]
    .map(normalizedKey)
    .filter(Boolean);
  return expected.some(value => actual.includes(value));
}

function parseTagFilterQuery(value) {
  const raw = normalizedText(value);
  if (!raw) return {};
  try {
    const parsed = JSON.parse(raw);
    return parsed && typeof parsed === 'object' && !Array.isArray(parsed) ? parsed : {};
  } catch (e) {
    return {};
  }
}

function summaryRowLabelForTag(row = {}, key = '') {
  if (key === 'packageStatus') return normalizedText(row.packageStatusLabel || row.packageStatusText);
  if (key === 'paymentMode') return normalizedText(row.paymentModeLabel || row.paymentModeText);
  if (key === 'activityStatus') return normalizedText(row.activityStatusLabel || row.activityStatusText);
  if (key === 'lessonVolume') return normalizedText(row.lessonVolumeLabel || row.lessonVolumeText);
  if (key === 'lifecycleStatus') return normalizedText(row.studentStatusLabel || row.lifecycleStatusLabel || row.lifecycleStatusText);
  return '';
}

function summaryRowMatchesTags(row = {}, query) {
  const tagFilters = parseTagFilterQuery(query?.get('tagFilters') || query?.get('tags'));
  return Object.entries(tagFilters).every(([key, values]) => {
    const selected = Array.isArray(values) ? values.map(normalizedText).filter(Boolean) : [];
    if (!selected.length) return true;
    return selected.includes(summaryRowLabelForTag(row, key));
  });
}

function summaryRowMatchesToolbar(row = {}, query) {
  const type = normalizedText(query?.get('type'));
  const source = normalizedText(query?.get('source'));
  const coach = normalizedText(query?.get('coach'));
  if (type && normalizedText(row.type) !== type) return false;
  if (source && normalizedText(row.source) !== source) return false;
  const primaryCoach = normalizedText(row.primaryCoach);
  if (coach === '__unassigned__' && primaryCoach) return false;
  if (coach && coach !== '__unassigned__' && primaryCoach !== coach) return false;
  return true;
}

function summaryRowMatchesSearch(row = {}, query) {
  const q = normalizedText(query?.get('q'));
  return textSearchHit(q, row.name, row.displayName, row.studentName, row.wechatName, row.nickName, row.nickname, row.phone);
}

function filterSummaryRowsForQuery(rows = [], query) {
  return (Array.isArray(rows) ? rows : []).filter(row => (
    summaryRowMatchesCampus(row, query)
    && summaryRowMatchesDate(row, query)
    && summaryRowMatchesToolbar(row, query)
    && summaryRowMatchesTags(row, query)
    && summaryRowMatchesSearch(row, query)
  ));
}

function parseListPaging(query) {
  const enabled = query?.get('paged') === '1' || query?.get('page') || query?.get('pageSize');
  if (!enabled) return null;
  const page = Math.max(1, parseInt(query?.get('page') || '1', 10) || 1);
  const pageSize = Math.max(1, Math.min(parseInt(query?.get('pageSize') || '15', 10) || 15, 100));
  return { page, pageSize };
}

function buildListPage(rows = [], paging = null) {
  const list = Array.isArray(rows) ? rows : [];
  if (!paging) return null;
  const total = list.length;
  const pages = Math.max(1, Math.ceil(total / paging.pageSize));
  const page = Math.min(paging.page, pages);
  const start = (page - 1) * paging.pageSize;
  return { rows: list.slice(start, start + paging.pageSize), total, page, pageSize: paging.pageSize, pages };
}

function summaryRowHasTrialLesson(row = {}) {
  return parseSnapshotArray(row.detailLessonRecordRows).some(item => /体验/.test(String([
    item.courseType,
    item.standardCourseType,
    item.packageName,
    item.productName,
    item.className,
    item.courseName
  ].filter(Boolean).join(' '))));
}

function summaryRowHasConsumedTrialPackage(row = {}) {
  return parseSnapshotArray(row.detailPackageOrderRows).concat(parseSnapshotArray(row.packageListRows)).some(item => {
    const label = String([
      item.courseType,
      item.standardCourseType,
      item.packageName,
      item.productName
    ].filter(Boolean).join(' '));
    if (!/体验/.test(label)) return false;
    const total = Number(item.totalLessons) || 0;
    const used = Number(item.usedLessons) || 0;
    const remaining = Number(item.remainingLessons);
    return used > 0 || (total > 0 && Number.isFinite(remaining) && remaining <= 0) || /已用完|已核销|已消课/.test(String(item.statusText || item.status || ''));
  });
}

function summaryRowExplicitBool(row = {}, field = '') {
  if (!Object.prototype.hasOwnProperty.call(row, field)) return undefined;
  if (row[field] === true || row[field] === false) return row[field];
  const raw = String(row[field] || '').trim().toLowerCase();
  if (raw === 'true') return true;
  if (raw === 'false') return false;
  return undefined;
}

function summaryRowDateMs(value) {
  const raw = String(value || '').trim().replace(' ', 'T');
  const parsed = Date.parse(raw);
  return Number.isFinite(parsed) ? parsed : 0;
}

function summaryRowIsActiveStudentRoster(row = {}) {
  if (row.isActiveStudentRoster === true || String(row.isActiveStudentRoster).toLowerCase() === 'true') return true;
  if ((Number(row.packageBalanceRemaining) || 0) > 0) return true;
  const activityLabel = String(row.activityStatusLabel || '').trim();
  if (['近30天活跃', '31-90天活跃', '课包活跃中', '有余额未活跃'].includes(activityLabel)) return true;
  const studentStatusLabel = String(row.studentStatusLabel || '').trim();
  if (['课包活跃中', '有余额未活跃'].includes(studentStatusLabel)) return true;
  const packageStatusLabel = String(row.packageStatusLabel || '').trim();
  if (['课包有余额', '课包即将耗尽'].includes(packageStatusLabel)) return true;
  const recentLessonAt = String(row.detailRecentLessonDate || row.lastFormalLessonAt || '').trim();
  if (!recentLessonAt) return false;
  const days = Math.floor((Date.now() - summaryRowDateMs(recentLessonAt)) / 86400000);
  return Number.isFinite(days) && days >= 0 && days <= 90;
}

function buildCustomerCenterSummaryLifecycleRows(summaryRows = []) {
  return (Array.isArray(summaryRows) ? summaryRows : []).map(row => {
    const studentId = String(row.studentId || row.id || '').trim();
    if (!studentId) return null;
    const explicitTrialAttended = summaryRowExplicitBool(row, 'hasTrialAttended');
    const explicitFormalAttended = summaryRowExplicitBool(row, 'hasFormalAttended');
    const hasTrialAttended = explicitTrialAttended !== undefined ? explicitTrialAttended : (summaryRowHasTrialLesson(row) || summaryRowHasConsumedTrialPackage(row));
    const hasFormalAttended = explicitFormalAttended !== undefined ? explicitFormalAttended : false;
    const isActiveStudentRoster = summaryRowIsActiveStudentRoster(row);
    return {
      customerKey: `teaching-summary:${studentId}`,
      sourceLeadId: String(row.sourceLeadId || '').trim(),
      leadId: '',
      studentId,
      displayName: String(row.displayName || row.name || studentId).trim(),
      phone: String(row.phone || '').trim(),
      source: String(row.source || '').trim(),
      campus: String(row.campus || '').trim(),
      owner: String(row.primaryCoach || '').trim(),
      customerType: String(row.type || '').trim(),
      demandProduct: '',
      trialAtRaw: '',
      trialBookedAt: '',
      trialAttendedAt: '',
      courseFirstPurchaseAt: String(row.packagePurchaseDate || '').trim(),
      conversionAt: String(row.packagePurchaseDate || '').trim(),
      formalCoach: String(row.primaryCoach || '').trim(),
      profileNote: String(row.profileNote || row.notes || '').trim(),
      notes: String(row.notes || row.profileNote || '').trim(),
      studentStage: String(row.studentStage || (hasFormalAttended ? 'formal' : (hasTrialAttended ? 'trial' : 'student'))).trim(),
      courseDealPath: String(row.courseDealPath || '').trim(),
      trialStatus: String(row.trialStatus || '').trim(),
      coursePurchaseCount: Number(row.coursePurchaseCount) || 0,
      hasCourseRepeatPurchase: String(row.courseDealPath || '').trim() === '老客续费',
      hasTrialToCourseConversion: String(row.courseDealPath || '').trim() === '体验转化',
      courtStage: 'none',
      membershipStatus: '',
      hasTrialExperience: hasTrialAttended,
      hasTeachingSummarySnapshot: true,
      hasTrialAttended,
      hasFormalAttended,
      hasScheduleRecord: true,
      hasCourseStudentEntry: true,
      hasFreeCourseFollowup: true,
      detailLessonRecordRows: Array.isArray(row.detailLessonRecordRows) ? row.detailLessonRecordRows : [],
      detailPackageOrderRows: Array.isArray(row.detailPackageOrderRows) ? row.detailPackageOrderRows : [],
      packageListRows: Array.isArray(row.packageListRows) ? row.packageListRows : [],
      lastFormalLessonAt: String(row.lastFormalLessonAt || row.detailRecentLessonDate || '').trim(),
      detailRecentLessonDate: String(row.detailRecentLessonDate || row.lastFormalLessonAt || '').trim(),
      packageBalanceRemaining: Number(row.packageBalanceRemaining) || 0,
      packageBalanceTotal: Number(row.packageBalanceTotal) || 0,
      packageBalanceText: String(row.packageBalanceText || '').trim(),
      packageBalancePercent: Number(row.packageBalancePercent) || 0,
      activityStatusLabel: String(row.activityStatusLabel || '').trim(),
      studentStatusLabel: String(row.studentStatusLabel || '').trim(),
      packageStatusLabel: String(row.packageStatusLabel || '').trim(),
      paymentModeLabel: String(row.paymentModeLabel || '').trim(),
      lessonVolumeLabel: String(row.lessonVolumeLabel || '').trim(),
      isHistoricalStudentRoster: hasTrialAttended || hasFormalAttended || isActiveStudentRoster,
      isActiveStudentRoster,
      leadDate: String(row.trialAtRaw || row.trialBookedAt || row.trialAttendedAt || row.packagePurchaseDate || row.courseFirstPurchaseAt || row.lastFormalLessonAt || row.detailRecentLessonDate || row.conversionAt || '').trim(),
      createdAt: String(row.summaryUpdatedAt || row.updatedAt || '').trim(),
      hasCourseConversion: String(row.studentStage || '').trim() === 'formal',
      hasBookingConversion: false,
      hasMembershipConversion: false
    };
  }).filter(Boolean);
}

function buildCustomerCenterListPage(teachingStudentViews = {}, query) {
  const paging = parseListPaging(query);
  const view = String(query?.get('view') || '').trim();
  const q = String(query?.get('q') || '').trim();
  const studentRows = Array.isArray(teachingStudentViews[view]) ? teachingStudentViews[view] : [];
  if (!paging || !view) return null;
  const page = buildListPage(studentRows.filter(row => textSearchHit(q, row.name, row.displayName, row.studentName, row.wechatName, row.nickName, row.nickname, row.phone)), paging);
  return { view, ...page, rows: page.rows.map(projectCustomerCenterStudentRow) };
}

function projectCustomerCenterStudentRow(row = {}) {
  return {
    id: String(row.id || row.studentId || '').trim(),
    studentId: String(row.studentId || row.id || '').trim(),
    sourceLeadId: String(row.sourceLeadId || '').trim(),
    name: String(row.name || row.displayName || '').trim(),
    displayName: String(row.displayName || row.name || '').trim(),
    phone: String(row.phone || '').trim(),
    type: String(row.type || '').trim(),
    source: String(row.source || '').trim(),
    campus: String(row.campus || '').trim(),
    primaryCoach: String(row.primaryCoach || '').trim(),
    notes: String(row.notes || '').trim(),
    profileNote: String(row.profileNote || '').trim(),
    searchText: String(row.searchText || '').trim(),
    studentStage: String(row.studentStage || '').trim(),
    trialStatus: String(row.trialStatus || '').trim(),
    courseDealPath: String(row.courseDealPath || '').trim(),
    lastFormalLessonAt: String(row.lastFormalLessonAt || '').trim(),
    detailRecentLessonDate: String(row.detailRecentLessonDate || '').trim(),
    completedLessons: Number(row.completedLessons) || 0,
    coursePurchaseCount: Number(row.coursePurchaseCount) || 0,
    hasTrialExperience: !!row.hasTrialExperience,
    hasTrialAttended: !!row.hasTrialAttended,
    hasFormalAttended: !!row.hasFormalAttended,
    hasCourseConversion: !!row.hasCourseConversion,
    isHistoricalStudentRoster: !!row.isHistoricalStudentRoster,
    isActiveStudentRoster: !!row.isActiveStudentRoster,
    packageBalanceRemaining: Number(row.packageBalanceRemaining) || 0,
    packageBalanceTotal: Number(row.packageBalanceTotal) || 0,
    packageBalanceText: String(row.packageBalanceText || '').trim(),
    packageBalancePercent: Number(row.packageBalancePercent) || 0,
    detailPackageBalanceRemaining: Number(row.detailPackageBalanceRemaining) || 0,
    detailPackageBalanceTotal: Number(row.detailPackageBalanceTotal) || 0,
    detailPackageBalanceText: String(row.detailPackageBalanceText || row.packageBalanceText || '').trim(),
    detailPackageBalancePercent: Number(row.detailPackageBalancePercent) || 0,
    cumulativeCoursePaidAmount: Number(row.cumulativeCoursePaidAmount) || 0,
    cumulativeCoursePaidText: String(row.cumulativeCoursePaidText || '').trim(),
    packageStatusLabel: String(row.packageStatusLabel || '').trim(),
    paymentModeLabel: String(row.paymentModeLabel || '').trim(),
    activityStatusLabel: String(row.activityStatusLabel || '').trim(),
    lessonVolumeLabel: String(row.lessonVolumeLabel || '').trim(),
    studentStatusLabel: String(row.studentStatusLabel || '').trim()
  };
}

function projectCustomerCenterLifecycleRow(row = {}) {
  const projected = projectCustomerCenterStudentRow({
    ...row,
    id: row.studentId || row.id,
    primaryCoach: row.formalCoach || row.owner || row.primaryCoach,
    type: row.customerType || row.type,
    name: row.displayName || row.name
  });
  return {
    ...projected,
    customerKey: String(row.customerKey || '').trim(),
    leadId: String(row.leadId || '').trim(),
    owner: String(row.owner || row.primaryCoach || '').trim(),
    customerType: String(row.customerType || row.type || '').trim(),
    demandProduct: String(row.demandProduct || '').trim(),
    trialAtRaw: String(row.trialAtRaw || '').trim(),
    trialBookedAt: String(row.trialBookedAt || '').trim(),
    trialAttendedAt: String(row.trialAttendedAt || '').trim(),
    courseFirstPurchaseAt: String(row.courseFirstPurchaseAt || '').trim(),
    conversionAt: String(row.conversionAt || '').trim(),
    formalCoach: String(row.formalCoach || row.primaryCoach || '').trim(),
    courtStage: String(row.courtStage || '').trim(),
    membershipStatus: String(row.membershipStatus || '').trim(),
    leadDate: String(row.leadDate || '').trim(),
    createdAt: String(row.createdAt || '').trim(),
    hasCourseRepeatPurchase: !!row.hasCourseRepeatPurchase,
    hasTrialToCourseConversion: !!row.hasTrialToCourseConversion,
    hasScheduleRecord: !!row.hasScheduleRecord,
    hasCourseStudentEntry: !!row.hasCourseStudentEntry,
    hasFreeCourseFollowup: !!row.hasFreeCourseFollowup,
    hasBookingConversion: !!row.hasBookingConversion,
    hasMembershipConversion: !!row.hasMembershipConversion,
    hasTeachingSummarySnapshot: !!row.hasTeachingSummarySnapshot
  };
}

function projectCustomerCenterTeachingViews(views = {}) {
  const next = {};
  Object.keys(views || {}).forEach(key => {
    const value = views[key];
    next[key] = Array.isArray(value) ? value.map(projectCustomerCenterStudentRow) : value;
  });
  return next;
}

function buildCustomerCenterPagePayload({ summaryRows = [], query, prebuiltTeachingStudentViews = null, prebuiltStandardLifecycleMetrics = null } = {}) {
  const customerLifecycleRows = buildCustomerCenterSummaryLifecycleRows(summaryRows);
  const teachingData = { teachingStudentSummaryRows: summaryRows };
  const metricScope = pageDataScopeFromQuery(query);
  const teachingStudentViews = prebuiltTeachingStudentViews || buildTeachingStudentViews(customerLifecycleRows, teachingData);
  const standardLifecycleMetrics = prebuiltStandardLifecycleMetrics || (hasPageDataScope(metricScope)
    ? buildScopedStandardLifecycleMetrics({ ...teachingData, customerLifecycleRows }, metricScope)
    : buildStandardLifecycleMetrics({ ...teachingData, customerLifecycleRows }));
  const listPage = buildCustomerCenterListPage(teachingStudentViews, query);
  return {
    customerLifecycleRows: customerLifecycleRows.map(projectCustomerCenterLifecycleRow),
    teachingStudentViews: projectCustomerCenterTeachingViews(teachingStudentViews),
    standardLifecycleMetrics,
    listPage
  };
}

function createStudentRosterIndexReader({ tableName, getCachedScan, getCachedRow, scanByIdPrefix, filterLoadAllForUser = data => data } = {}) {
  return {
    async readCustomerCenterList({ user = {}, query } = {}) {
      const studentTeachingSummaries = await readReadyStudentTeachingSummaryRows({ tableName, getCachedScan, getCachedRow, scanByIdPrefix });
      const scoped = filterLoadAllForUser({ studentTeachingSummaries }, user);
      const summaryRows = filterSummaryRowsForQuery(scoped.studentTeachingSummaries || [], query);
      return buildCustomerCenterPagePayload({
        summaryRows,
        query
      });
    }
  };
}

module.exports = {
  createStudentRosterIndexReader,
  buildCustomerCenterSummaryLifecycleRows,
  buildCustomerCenterPagePayload,
  filterSummaryRowsForQuery
};
