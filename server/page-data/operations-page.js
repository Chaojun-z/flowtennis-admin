const { buildOperationsMetrics } = require('../metrics/operations-metrics.js');
const { buildCustomerLifecycleRows } = require('../read-models/customer-lifecycle.js');
const {
  getOperationsRowsCacheKey,
  getOperationsBaseRows
} = require('../read-models/operations-source.js');
const { OPERATIONS_SNAPSHOT_NOT_READY_CODE } = require('./operations-snapshot.js');

function getOperationsDateRange(query) {
  return {
    startDate: String(query?.get?.('startDate') || '').slice(0, 10),
    endDate: String(query?.get?.('endDate') || '').slice(0, 10)
  };
}

function getOperationsPageScope(query) {
  const dateRange = getOperationsDateRange(query);
  return {
    campus: String(query?.get?.('campus') || '').trim(),
    campusName: String(query?.get?.('campusName') || '').trim(),
    dateRange,
    metricScope: {
      campus: String(query?.get?.('campus') || '').trim(),
      campusName: String(query?.get?.('campusName') || '').trim(),
      startDate: dateRange.startDate || '',
      endDate: dateRange.endDate || ''
    }
  };
}

function getOperationsResultCacheKey(user = {}, scope = {}) {
  const dateRange = scope.dateRange || scope;
  return JSON.stringify({
    user: JSON.parse(getOperationsRowsCacheKey(user)),
    campus: scope.campus || '',
    campusName: scope.campusName || '',
    startDate: dateRange.startDate || '',
    endDate: dateRange.endDate || ''
  });
}

async function buildOperationsPagePayload({
  scope,
  dateRange,
  user,
  listCampusesWithDefaults,
  getCachedScan,
  scanFirstRows,
  getScheduleListRows,
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
    getScheduleListRows,
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
    schedule: baseRows.schedule,
    feedbacks: baseRows.feedbacks
  }, user);
  const customerLifecycleRows=buildCustomerLifecycleRows(scoped);

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
    customerLifecycleRows,
    financeOverviewData,
    financeNormalizedRows: scopedFinanceSnapshot.financeNormalizedRows
  }, { dateRange, metricScope: scope?.metricScope || {} });

  return {
    campuses: scoped.campuses,
    operations,
    generatedAt: operations.generatedAt
  };
}

function invalidateOperationsPageDataCache() {
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
  getScheduleListRows,
  isProductionRuntime,
  getFinancePageScheduleRows,
  filterLoadAllForUser,
  mergeDuplicateLeadRows,
  buildFinancePageSnapshot,
  getFinancePageSnapshot,
  getFinancePageSnapshotIfCached,
  FINANCE_PAGE_COURT_PROJECTION_FIELDS,
  loadOperationsSnapshot,
  operationsSnapshotSync,
  timedEndpointMetric,
  tables
}) {
  if (user.role !== 'admin') return sendJson(res, { error: '无权限' }, 403);
  await init();
  const scope = getOperationsPageScope(query);
  if (typeof loadOperationsSnapshot !== 'function') {
    return sendJson(res, { error: '经营分析快照未配置', code: OPERATIONS_SNAPSHOT_NOT_READY_CODE }, 503);
  }
  const load = () => loadOperationsSnapshot({
    user,
    scope,
    forceFresh: query?.get?.('fresh') === '1' || query?.get?.('forceFresh') === '1',
    allowRefreshing: true
  });
  try {
    const payload = timedEndpointMetric
      ? await timedEndpointMetric('pageData.operationsSnapshot', load)
      : await load();
    if (payload?.snapshot?.refreshing && operationsSnapshotSync?.queueRebuildScope) {
      await operationsSnapshotSync.queueRebuildScope({ user, scope, reason: 'stale-page-hit' }).catch(() => null);
    }
    return sendJson(res, payload);
  } catch (err) {
    if (err?.code === OPERATIONS_SNAPSHOT_NOT_READY_CODE) {
      if (operationsSnapshotSync?.queueRebuildScope) {
        await operationsSnapshotSync.queueRebuildScope({ user, scope, reason: 'page-miss' }).catch(() => null);
      }
      return sendJson(res, {
        campuses: [],
        operations: null,
        snapshot: {
          source: 'operations-snapshot',
          refreshing: true,
          code: err.code,
          message: err.message || '经营分析快照正在生成'
        }
      }, 202);
    }
    console.warn('[operations-snapshot] failed:', err?.message || err);
    return sendJson(res, { error: err.message || '经营分析快照读取失败', code: err.code || 'OPERATIONS_SNAPSHOT_ERROR' }, err.statusCode || 500);
  }
}

module.exports = {
  buildOperationsPagePayload,
  getOperationsPageScope,
  getOperationsResultCacheKey,
  handleOperationsPageData,
  invalidateOperationsPageDataCache
};
