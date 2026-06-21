const { buildOperationsMetrics } = require('../metrics/operations-metrics.js');

const OPERATIONS_LEAD_FIELDS = [
  'id', 'displayName', 'name', 'source', 'campus', 'campusName', 'owner', 'coach', 'coachName',
  'primaryCoach', 'formalCoach', 'level', 'gender', 'sex', 'studentType', 'type', 'ageGroup', 'age', 'birthDate',
  'consultType', 'leadStage', 'systemStatus', 'stage', 'rawStatus',
  'status', 'statusAfter', 'trialStatus', 'studentId', 'formalStudentId',
  'courseStudentId', 'courtId', 'bookingCourtId', 'membershipAccountId', 'memberId',
  'trialAtRaw', 'trialLessonAt', 'trialAt', 'leadDate', 'createdAt'
];
const OPERATIONS_STUDENT_FIELDS = [
  'id', 'name', 'source', 'campus', 'campusName', 'sourceLeadId', 'leadId', 'fromLeadId',
  'dealPath', 'primaryCoach', 'coach', 'coachName', 'level', 'gender', 'sex',
  'studentType', 'type', 'ageGroup', 'age', 'birthDate'
];
const OPERATIONS_PURCHASE_FIELDS = [
  'id', 'studentId', 'studentName', 'ownerCoach', 'primaryCoach', 'coach', 'coachName',
  'packageId', 'productId', 'packageName', 'productName',
  'courseType', 'status', 'purchaseDate', 'createdAt', 'amountPaid',
  'actualAmount', 'finalAmount', 'amount', 'price', 'packagePrice', 'systemAmount',
  'paidAmount', 'receivedAmount', 'cashDelta', 'payMethod',
  'coachPriceName', 'coachPriceSnapshot', 'coachNames', 'allowedCoaches', 'campusIds'
];
const OPERATIONS_ENTITLEMENT_FIELDS = [
  'id', 'studentId', 'purchaseId', 'packageId', 'campus', 'campusName', 'campusIds'
];
const OPERATIONS_ENTITLEMENT_LEDGER_FIELDS = [
  'id', 'entitlementId', 'studentId', 'purchaseId', 'scheduleId',
  'lessonDelta', 'action', 'createdAt', 'relatedDate',
  'sourceDate', 'sourceTimeBand', 'sourceLocation', 'sourceVenue',
  'campus', 'campusName', 'venue', 'courtName', 'court'
];
const OPERATIONS_COURT_FIELDS = [
  'name', 'courtName', 'campus', 'campusName', 'sourceLeadId', 'leadId',
  'fromLeadId', 'courtId', 'bookingCourtId', 'membershipAccountId', 'memberId',
  'status', 'cachedTotalSpent', 'cachedTotalReceived', 'spentAmount', 'receivedAmount',
  'storedValueSpent', 'directPaidSpent', 'bookingCount', 'bookingAmount', 'bookingHours',
  'memberBookingCount', 'memberBookingAmount', 'guestBookingCount', 'guestBookingAmount', 'history'
];
const OPERATIONS_MEMBERSHIP_ACCOUNT_FIELDS = ['courtId', 'sourceLeadId', 'leadId', 'fromLeadId', 'status'];
const OPERATIONS_MEMBERSHIP_ORDER_FIELDS = ['courtId', 'rechargeAmount', 'amount', 'status', 'purchaseDate', 'createdAt'];
const OPERATIONS_COACH_FIELDS = ['name', 'coachName', 'status', 'campus'];
const OPERATIONS_SCHEDULE_FIELDS = [
  'id', 'studentId', 'studentIds', 'studentName', 'studentNames',
  'coach', 'coachName', 'primaryCoach', 'teacher', 'startTime', 'endTime',
  'status', 'systemStatus', 'state', 'lessonCount', 'durationHours', 'hours',
  'courseType', 'standardCourseType', 'experienceType', 'packageName', 'productName',
  'campus', 'campusName', 'venue', 'venueId', 'venueSpaceType',
  'locationType', 'externalVenueName', 'externalCourtName'
];
const OPERATIONS_CACHE_TTL_MS = 60 * 1000;
const OPERATIONS_RESULT_CACHE_TTL_MS = 60 * 1000;
const operationsRowsCache = new Map();
const operationsResultCache = new Map();

async function readOperationsRows({ table, getCachedScan, scanFirstRows, columns, limit = 1000 }) {
  if (typeof scanFirstRows === 'function') {
    return scanFirstRows(table, { limit, columns, detectOverflow: false });
  }
  return getCachedScan(table, { columns });
}

function getOperationsRowsCacheKey(user = {}) {
  return JSON.stringify({
    id: user.id || user.userId || user.username || '',
    role: user.role || '',
    dataScope: user.dataScope || '',
    campusIds: Array.isArray(user.campusIds) ? [...user.campusIds].sort() : []
  });
}

function getOperationsDateRange(query) {
  return {
    startDate: String(query?.get?.('startDate') || '').slice(0, 10),
    endDate: String(query?.get?.('endDate') || '').slice(0, 10)
  };
}

function getOperationsResultCacheKey(user = {}, dateRange = {}) {
  return JSON.stringify({
    user: JSON.parse(getOperationsRowsCacheKey(user)),
    startDate: dateRange.startDate || '',
    endDate: dateRange.endDate || ''
  });
}

function readOperationsResultCache(resultCacheKey) {
  const cachedOperations = operationsResultCache.get(resultCacheKey);
  if (cachedOperations && Date.now() - cachedOperations.createdAt < OPERATIONS_RESULT_CACHE_TTL_MS) {
    return cachedOperations.payload;
  }
  operationsResultCache.delete(resultCacheKey);
  return null;
}

async function getOperationsBaseRows({
  user,
  useGlobalFinanceSnapshot,
  listCampusesWithDefaults,
  getCachedScan,
  scanFirstRows,
  mergeDuplicateLeadRows,
  getFinancePageSnapshotIfCached,
  tables
}) {
  const cacheKey = getOperationsRowsCacheKey(user);
  const cached = operationsRowsCache.get(cacheKey);
  if (cached && Date.now() - cached.createdAt < OPERATIONS_CACHE_TTL_MS) return cached.rows;
  const {
    T_LEADS,
    T_STUDENTS,
    T_PURCHASES,
    T_ENTITLEMENTS,
    T_ENTITLEMENT_LEDGER,
    T_COURTS,
    T_MEMBERSHIP_ORDERS,
    T_MEMBERSHIP_ACCOUNTS,
    T_COACHES,
    T_SCHEDULE
  } = tables;
  const [
    campuses,
    leads,
    students,
    purchases,
    entitlements,
    entitlementLedger,
    courts,
    membershipAccounts,
    membershipOrders,
    coaches,
    schedule,
    cachedFinanceSnapshot
  ] = await Promise.all([
    listCampusesWithDefaults(),
    readOperationsRows({ table: T_LEADS, getCachedScan, scanFirstRows, columns: OPERATIONS_LEAD_FIELDS, limit: 600 }).catch(() => []),
    readOperationsRows({ table: T_STUDENTS, getCachedScan, scanFirstRows, columns: OPERATIONS_STUDENT_FIELDS, limit: 1000 }).catch(() => []),
    readOperationsRows({ table: T_PURCHASES, getCachedScan, scanFirstRows, columns: OPERATIONS_PURCHASE_FIELDS, limit: 1000 }).catch(() => []),
    readOperationsRows({ table: T_ENTITLEMENTS, getCachedScan, scanFirstRows, columns: OPERATIONS_ENTITLEMENT_FIELDS, limit: 1200 }).catch(() => []),
    readOperationsRows({ table: T_ENTITLEMENT_LEDGER, getCachedScan, scanFirstRows, columns: OPERATIONS_ENTITLEMENT_LEDGER_FIELDS, limit: 2000 }).catch(() => []),
    readOperationsRows({ table: T_COURTS, getCachedScan, scanFirstRows, columns: OPERATIONS_COURT_FIELDS, limit: 500 }).catch(() => []),
    readOperationsRows({ table: T_MEMBERSHIP_ACCOUNTS, getCachedScan, scanFirstRows, columns: OPERATIONS_MEMBERSHIP_ACCOUNT_FIELDS, limit: 1000 }).catch(() => []),
    readOperationsRows({ table: T_MEMBERSHIP_ORDERS, getCachedScan, scanFirstRows, columns: OPERATIONS_MEMBERSHIP_ORDER_FIELDS, limit: 1000 }).catch(() => []),
    getCachedScan(T_COACHES, { columns: OPERATIONS_COACH_FIELDS }).catch(() => []),
    readOperationsRows({ table: T_SCHEDULE, getCachedScan, scanFirstRows, columns: OPERATIONS_SCHEDULE_FIELDS, limit: 700 }).catch(() => []),
    useGlobalFinanceSnapshot && typeof getFinancePageSnapshotIfCached === 'function'
      ? Promise.resolve(getFinancePageSnapshotIfCached()).catch(() => null)
      : Promise.resolve(null)
  ]);
  const rows = {
    campuses,
    leads: typeof mergeDuplicateLeadRows === 'function' ? mergeDuplicateLeadRows(leads) : leads,
    students,
    purchases,
    entitlements,
    entitlementLedger,
    courts,
    membershipAccounts,
    membershipOrders,
    coaches,
    schedule,
    cachedFinanceSnapshot
  };
  operationsRowsCache.set(cacheKey, { createdAt: Date.now(), rows });
  return rows;
}

async function handleOperationsPageData({
  query,
  user,
  res,
  sendJson,
  init,
  listCampusesWithDefaults,
  getCachedScan,
  scanFirstRows,
  getFinancePageScheduleRows,
  filterLoadAllForUser,
  mergeDuplicateLeadRows,
  buildFinancePageSnapshot,
  getFinancePageSnapshotIfCached,
  FINANCE_PAGE_COURT_PROJECTION_FIELDS,
  tables
}) {
  if (user.role !== 'admin') return sendJson(res, { error: '无权限' }, 403);
  await init();
  const dateRange = getOperationsDateRange(query);
  const resultCacheKey = getOperationsResultCacheKey(user, dateRange);
  const cachedPayload = readOperationsResultCache(resultCacheKey);
  if (cachedPayload) return sendJson(res, cachedPayload);

  const useGlobalFinanceSnapshot = String(user.dataScope || '').trim() !== 'campus' && !(Array.isArray(user.campusIds) && user.campusIds.length);
  const baseRows = await getOperationsBaseRows({
    user,
    useGlobalFinanceSnapshot,
    listCampusesWithDefaults,
    getCachedScan,
    scanFirstRows,
    mergeDuplicateLeadRows,
    getFinancePageSnapshotIfCached,
    tables
  });

  const scoped = filterLoadAllForUser({
    campuses: baseRows.campuses,
    leads: baseRows.leads,
    students: baseRows.students,
    purchases: baseRows.purchases,
    entitlements: baseRows.entitlements,
    entitlementLedger: baseRows.entitlementLedger,
    courts: baseRows.courts,
    membershipOrders: baseRows.membershipOrders,
    membershipAccounts: baseRows.membershipAccounts,
    coaches: baseRows.coaches,
    schedule: baseRows.schedule
  }, user);

  const scopedFinanceSnapshot = baseRows.cachedFinanceSnapshot || buildFinancePageSnapshot({
    campuses: scoped.campuses,
    students: scoped.students,
    purchases: scoped.purchases,
    courts: scoped.courts,
    membershipOrders: scoped.membershipOrders,
    membershipAccounts: scoped.membershipAccounts,
    schedule: scoped.schedule
  });
  const financeOverviewData = baseRows.cachedFinanceSnapshot
    ? scopedFinanceSnapshot.financeOverviewData
    : { ...(scopedFinanceSnapshot.financeOverviewData || {}), __partial: true };

  const operations = buildOperationsMetrics({
    ...scoped,
    financeOverviewData,
    financeNormalizedRows: scopedFinanceSnapshot.financeNormalizedRows
  }, { dateRange });

  const payload = {
    campuses: scoped.campuses,
    operations,
    generatedAt: operations.generatedAt
  };
  operationsResultCache.set(resultCacheKey, { createdAt: Date.now(), payload });
  return sendJson(res, payload);
}

module.exports = { handleOperationsPageData };
