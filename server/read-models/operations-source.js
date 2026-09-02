const { readLeadSourceRows } = require('../lead-source-read-model.js');
const { normalizePermissionProfile } = require('../permissions.js');

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
  'leadDate', 'createdAt',
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
  'leadDate', 'createdAt',
  'status', 'cachedTotalSpent', 'cachedTotalReceived', 'spentAmount', 'receivedAmount',
  'storedValueSpent', 'directPaidSpent', 'bookingCount', 'bookingAmount', 'bookingHours',
  'memberBookingCount', 'memberBookingAmount', 'guestBookingCount', 'guestBookingAmount', 'history'
];
const OPERATIONS_FOLLOWUP_FIELDS = [
  'id', 'leadId', 'followupAt', 'createdAt', 'followupBy', 'followupType',
  'communicationNote', 'concern', 'conclusion', 'statusAfter', 'nextFollowupAt', 'nextAction'
];
const OPERATIONS_MEMBERSHIP_ACCOUNT_FIELDS = ['courtId', 'sourceLeadId', 'leadId', 'fromLeadId', 'status', 'createdAt'];
const OPERATIONS_MEMBERSHIP_ORDER_FIELDS = ['courtId', 'rechargeAmount', 'amount', 'status', 'purchaseDate', 'createdAt'];
const OPERATIONS_COACH_FIELDS = ['name', 'coachName', 'status', 'campus', 'sortOrder'];
const OPERATIONS_FEEDBACK_FIELDS = ['id', 'scheduleId', 'studentId', 'studentIds', 'coach', 'coachName', 'createdAt', 'updatedAt'];
const OPERATIONS_SCHEDULE_FIELDS = [
  'id', 'studentId', 'studentIds', 'studentName', 'studentNames',
  'coach', 'coachName', 'primaryCoach', 'teacher', 'startTime', 'endTime', 'date', 'createdAt',
  'status', 'systemStatus', 'state', 'lessonCount', 'durationHours', 'hours',
  'feedbackId', 'feedbackAt', 'feedbackStatus', 'hasFeedback',
  'courseType', 'standardCourseType', 'experienceType', 'packageName', 'productName',
  'campus', 'campusName', 'venue', 'venueId', 'venueSpaceType',
  'locationType', 'externalVenueName', 'externalCourtName'
];

const OPERATIONS_CACHE_TTL_MS = Math.max(60 * 1000, parseInt(process.env.OPERATIONS_CACHE_TTL_MS || '60000', 10) || 60 * 1000);
const operationsRowsCache = new Map();

function invalidateOperationsSourceCache() {
  operationsRowsCache.clear();
}

async function readOperationsRows({ table, getCachedScan, scanFirstRows, columns, limit = 1000 }) {
  if (typeof scanFirstRows === 'function') {
    return scanFirstRows(table, { limit, columns, detectOverflow: true });
  }
  return getCachedScan(table, { columns });
}

async function getOperationsScheduleRows({ getScheduleListRows, getCachedScan, scanFirstRows, table, columns }) {
  if (typeof getScheduleListRows === 'function') return getScheduleListRows();
  if (typeof scanFirstRows === 'function') {
    return scanFirstRows(table, { limit: 5000, columns, detectOverflow: true });
  }
  return getCachedScan(table, { columns });
}

function getOperationsRowsCacheKey(user = {}) {
  const profile = normalizePermissionProfile(user || {});
  const isAdmin = profile.role === 'admin';
  const dataScope = isAdmin && profile.dataScope !== 'campus' ? 'all' : profile.dataScope;
  return JSON.stringify({
    id: isAdmin ? '' : (user.id || user.userId || user.username || ''),
    role: profile.role,
    dataScope,
    campusIds: dataScope === 'campus' ? [...profile.campusIds].sort() : []
  });
}

async function getOperationsBaseRows({
  user,
  useGlobalFinanceSnapshot,
  listCampusesWithDefaults,
  getCachedScan,
  scanFirstRows,
  getScheduleListRows,
  isProductionRuntime,
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
    T_LEAD_FOLLOWUPS,
    T_COURTS,
    T_MEMBERSHIP_ORDERS,
    T_MEMBERSHIP_ACCOUNTS,
    T_COACHES,
    T_SCHEDULE,
    T_FEEDBACKS
  } = tables;
  const [
    campuses,
    leads,
    students,
    purchases,
    entitlements,
    entitlementLedger,
    leadFollowups,
    courts,
    membershipAccounts,
    membershipOrders,
    coaches,
    schedule,
    feedbacks,
    cachedFinanceSnapshot
  ] = await Promise.all([
    listCampusesWithDefaults(),
    readLeadSourceRows({ isProductionRuntime, scanFirstRows, getCachedScan, table: T_LEADS, columns: OPERATIONS_LEAD_FIELDS }),
    readOperationsRows({ table: T_STUDENTS, getCachedScan, scanFirstRows, columns: OPERATIONS_STUDENT_FIELDS, limit: 2000 }),
    readOperationsRows({ table: T_PURCHASES, getCachedScan, scanFirstRows, columns: OPERATIONS_PURCHASE_FIELDS, limit: 2000 }),
    readOperationsRows({ table: T_ENTITLEMENTS, getCachedScan, scanFirstRows, columns: OPERATIONS_ENTITLEMENT_FIELDS, limit: 2000 }),
    readOperationsRows({ table: T_ENTITLEMENT_LEDGER, getCachedScan, scanFirstRows, columns: OPERATIONS_ENTITLEMENT_LEDGER_FIELDS, limit: 2000 }),
    readOperationsRows({ table: T_LEAD_FOLLOWUPS, getCachedScan, scanFirstRows, columns: OPERATIONS_FOLLOWUP_FIELDS, limit: 2000 }),
    readOperationsRows({ table: T_COURTS, getCachedScan, scanFirstRows, columns: OPERATIONS_COURT_FIELDS, limit: 2000 }),
    readOperationsRows({ table: T_MEMBERSHIP_ACCOUNTS, getCachedScan, scanFirstRows, columns: OPERATIONS_MEMBERSHIP_ACCOUNT_FIELDS, limit: 2000 }),
    readOperationsRows({ table: T_MEMBERSHIP_ORDERS, getCachedScan, scanFirstRows, columns: OPERATIONS_MEMBERSHIP_ORDER_FIELDS, limit: 2000 }),
    getCachedScan(T_COACHES, { columns: OPERATIONS_COACH_FIELDS }).catch(() => []),
    getOperationsScheduleRows({ getScheduleListRows, getCachedScan, scanFirstRows, table: T_SCHEDULE, columns: OPERATIONS_SCHEDULE_FIELDS }),
    T_FEEDBACKS ? readOperationsRows({ table: T_FEEDBACKS, getCachedScan, scanFirstRows, columns: OPERATIONS_FEEDBACK_FIELDS, limit: 2000 }) : Promise.resolve([]),
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
    leadFollowups,
    courts,
    membershipAccounts,
    membershipOrders,
    coaches,
    schedule,
    feedbacks,
    cachedFinanceSnapshot
  };
  operationsRowsCache.set(cacheKey, { createdAt: Date.now(), rows });
  return rows;
}

async function getOperationsCoachBaseRows({
  user,
  listCampusesWithDefaults,
  getCachedScan,
  scanFirstRows,
  getScheduleListRows,
  isProductionRuntime,
  mergeDuplicateLeadRows,
  tables
}) {
  const cacheKey = `${getOperationsRowsCacheKey(user)}:coach`;
  const cached = operationsRowsCache.get(cacheKey);
  if (cached && Date.now() - cached.createdAt < OPERATIONS_CACHE_TTL_MS) return cached.rows;
  const {
    T_LEADS,
    T_STUDENTS,
    T_PURCHASES,
    T_LEAD_FOLLOWUPS,
    T_COACHES,
    T_SCHEDULE,
    T_FEEDBACKS
  } = tables;
  const [
    campuses,
    leads,
    students,
    purchases,
    leadFollowups,
    coaches,
    schedule,
    feedbacks
  ] = await Promise.all([
    listCampusesWithDefaults(),
    readLeadSourceRows({ isProductionRuntime, scanFirstRows, getCachedScan, table: T_LEADS, columns: OPERATIONS_LEAD_FIELDS }),
    readOperationsRows({ table: T_STUDENTS, getCachedScan, scanFirstRows, columns: OPERATIONS_STUDENT_FIELDS, limit: 2000 }),
    readOperationsRows({ table: T_PURCHASES, getCachedScan, scanFirstRows, columns: OPERATIONS_PURCHASE_FIELDS, limit: 2000 }),
    readOperationsRows({ table: T_LEAD_FOLLOWUPS, getCachedScan, scanFirstRows, columns: OPERATIONS_FOLLOWUP_FIELDS, limit: 2000 }),
    getCachedScan(T_COACHES, { columns: OPERATIONS_COACH_FIELDS }).catch(() => []),
    getOperationsScheduleRows({ getScheduleListRows, getCachedScan, scanFirstRows, table: T_SCHEDULE, columns: OPERATIONS_SCHEDULE_FIELDS }),
    T_FEEDBACKS ? readOperationsRows({ table: T_FEEDBACKS, getCachedScan, scanFirstRows, columns: OPERATIONS_FEEDBACK_FIELDS, limit: 2000 }) : Promise.resolve([])
  ]);
  const rows = {
    campuses,
    leads: typeof mergeDuplicateLeadRows === 'function' ? mergeDuplicateLeadRows(leads) : leads,
    students,
    purchases,
    entitlements: [],
    entitlementLedger: [],
    leadFollowups,
    courts: [],
    membershipAccounts: [],
    membershipOrders: [],
    coaches,
    schedule,
    feedbacks,
    cachedFinanceSnapshot: null
  };
  operationsRowsCache.set(cacheKey, { createdAt: Date.now(), rows });
  return rows;
}

module.exports = {
  OPERATIONS_CACHE_TTL_MS,
  invalidateOperationsSourceCache,
  getOperationsRowsCacheKey,
  getOperationsBaseRows,
  getOperationsCoachBaseRows
};
