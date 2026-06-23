const { buildOperationsMetrics } = require('../metrics/operations-metrics.js');
const {
  getOperationsRowsCacheKey,
  getOperationsBaseRows
} = require('../read-models/operations-source.js');

const OPERATIONS_RESULT_CACHE_TTL_MS = 60 * 1000;
const operationsResultCache = new Map();

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
  return null;
}

async function buildOperationsPagePayload({
  dateRange,
  user,
  listCampusesWithDefaults,
  getCachedScan,
  scanFirstRows,
  isProductionRuntime,
  filterLoadAllForUser,
  mergeDuplicateLeadRows,
  buildFinancePageSnapshot,
  getFinancePageSnapshot,
  getFinancePageSnapshotIfCached,
  tables
}) {
  const useGlobalFinanceSnapshot = String(user.dataScope || '').trim() !== 'campus' && !(Array.isArray(user.campusIds) && user.campusIds.length);
  const baseRows = await getOperationsBaseRows({
    user,
    useGlobalFinanceSnapshot,
    listCampusesWithDefaults,
    getCachedScan,
    scanFirstRows,
    isProductionRuntime,
    mergeDuplicateLeadRows,
    getFinancePageSnapshotIfCached,
    tables
  });
  const fullFinanceSnapshot = useGlobalFinanceSnapshot && typeof getFinancePageSnapshot === 'function'
    ? await getFinancePageSnapshot()
    : null;

  const scoped = filterLoadAllForUser({
    campuses: baseRows.campuses,
    leads: baseRows.leads,
    leadFollowups: baseRows.leadFollowups,
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

  const scopedFinanceSnapshot = fullFinanceSnapshot || baseRows.cachedFinanceSnapshot || buildFinancePageSnapshot({
    campuses: scoped.campuses,
    students: scoped.students,
    purchases: scoped.purchases,
    courts: scoped.courts,
    membershipOrders: scoped.membershipOrders,
    membershipAccounts: scoped.membershipAccounts,
    schedule: scoped.schedule
  });
  const financeOverviewData = fullFinanceSnapshot || baseRows.cachedFinanceSnapshot
    ? scopedFinanceSnapshot.financeOverviewData
    : { ...(scopedFinanceSnapshot.financeOverviewData || {}), __partial: true };

  const operations = buildOperationsMetrics({
    ...scoped,
    financeOverviewData,
    financeNormalizedRows: scopedFinanceSnapshot.financeNormalizedRows
  }, { dateRange });

  return {
    campuses: scoped.campuses,
    operations,
    generatedAt: operations.generatedAt
  };
}

function invalidateOperationsPageDataCache() {
  operationsResultCache.clear();
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
  isProductionRuntime,
  getFinancePageScheduleRows,
  filterLoadAllForUser,
  mergeDuplicateLeadRows,
  buildFinancePageSnapshot,
  getFinancePageSnapshot,
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
  const buildPayload = () => buildOperationsPagePayload({
    dateRange,
    user,
    listCampusesWithDefaults,
    getCachedScan,
    scanFirstRows,
    isProductionRuntime,
    filterLoadAllForUser,
    mergeDuplicateLeadRows,
    buildFinancePageSnapshot,
    getFinancePageSnapshot,
    getFinancePageSnapshotIfCached,
    tables
  });
  const payload = await buildPayload();
  operationsResultCache.set(resultCacheKey, { createdAt: Date.now(), payload });
  return sendJson(res, payload);
}

module.exports = { handleOperationsPageData, invalidateOperationsPageDataCache };
