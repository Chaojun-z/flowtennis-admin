const { buildOperationsMetrics } = require('../metrics/operations-metrics.js');
const { buildCustomerLifecycleRows } = require('../read-models/customer-lifecycle.js');
const {
  getOperationsRowsCacheKey,
  getOperationsBaseRows,
  getOperationsCoachBaseRows,
  getOperationsWeeklyReportBaseRows
} = require('../read-models/operations-source.js');
const { OPERATIONS_SNAPSHOT_NOT_READY_CODE } = require('./operations-snapshot.js');
const { normalizeCampusValue } = require('../../public/assets/scripts/core/campus.js');

function getOperationsDateRange(query) {
  return {
    startDate: String(query?.get?.('startDate') || '').slice(0, 10),
    endDate: String(query?.get?.('endDate') || '').slice(0, 10)
  };
}

function getOperationsPageScope(query) {
  const dateRange = getOperationsDateRange(query);
  const view = String(query?.get?.('view') || '').trim();
  return {
    campus: String(query?.get?.('campus') || '').trim(),
    campusName: String(query?.get?.('campusName') || '').trim(),
    view: view === 'weekly-report' ? 'weekly-report' : view === 'coach' ? 'coach' : '',
    dateRange,
    metricScope: {
      campus: String(query?.get?.('campus') || '').trim(),
      campusName: String(query?.get?.('campusName') || '').trim(),
      startDate: dateRange.startDate || '',
      endDate: dateRange.endDate || ''
    }
  };
}

function projectOperationsPagePayload(payload = {}, view = '') {
  if (view !== 'coach') return payload;
  const operations = payload.operations || {};
  return {
    ...payload,
    operations: {
      generatedAt: operations.generatedAt,
      overview: { cards: operations.overview?.cards || {} },
      coach: operations.coach || {}
    }
  };
}

function getOperationsResultCacheKey(user = {}, scope = {}) {
  const dateRange = scope.dateRange || scope;
  return JSON.stringify({
    user: JSON.parse(getOperationsRowsCacheKey(user)),
    campus: scope.campus || '',
    campusName: scope.campusName || '',
    view: scope.view || '',
    startDate: dateRange.startDate || '',
    endDate: dateRange.endDate || ''
  });
}

function buildOperationsFinanceScope(scope = {}, campuses = []) {
  const dateRange = scope.dateRange || {};
  const financeScope = {
    campus: String(scope.campus || '').trim(),
    campusName: String(scope.campusName || '').trim(),
    startDate: String(dateRange.startDate || '').trim(),
    endDate: String(dateRange.endDate || '').trim()
  };
  if (financeScope.campus && financeScope.campus !== 'all') {
    const campusKey = normalizeCampusValue(financeScope.campus);
    const campusRow = (campuses || []).find(row => [row?.code, row?.id, row?.name].map(normalizeCampusValue).includes(campusKey));
    if (campusRow) financeScope.campusName = String(campusRow.name || campusRow.code || campusRow.id || financeScope.campusName).trim();
  }
  return financeScope;
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
  tables,
  baseRowsOverride = null
}) {
  const isCoachView = scope?.view === 'coach';
  const isWeeklyReportView = scope?.view === 'weekly-report';
  const useGlobalFinanceSnapshot = !isCoachView && !isWeeklyReportView && String(user.dataScope || '').trim() !== 'campus' && !(Array.isArray(user.campusIds) && user.campusIds.length);
  const loadBaseRows = scope?.view === 'weekly-report' ? getOperationsWeeklyReportBaseRows : scope?.view === 'coach' ? getOperationsCoachBaseRows : getOperationsBaseRows;
  const baseRows = baseRowsOverride || await loadBaseRows({
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
    membershipPlans: baseRows.membershipPlans,
    membershipBenefitLedger: baseRows.membershipBenefitLedger,
    membershipAccountEvents: baseRows.membershipAccountEvents,
    coaches: baseRows.coaches,
    schedule: baseRows.schedule,
    feedbacks: baseRows.feedbacks
  }, user);
  const customerLifecycleRows=buildCustomerLifecycleRows(scoped);

  const financeScope = buildOperationsFinanceScope(scope, scoped.campuses || []);
  const scopedFinanceSnapshot = fullFinanceSnapshot || baseRows.cachedFinanceSnapshot || buildFinancePageSnapshot({
    campuses: scoped.campuses,
    students: scoped.students,
    purchases: scoped.purchases,
    courts: scoped.courts,
    courtAccountListIndexRows: baseRows.courtAccountListIndexRows || [],
    membershipOrders: scoped.membershipOrders,
    membershipAccounts: scoped.membershipAccounts,
    schedule: scoped.schedule
  }, financeScope);
  const financeOverviewData = fullFinanceSnapshot || baseRows.cachedFinanceSnapshot
    ? scopedFinanceSnapshot.financeOverviewData
    : { ...(scopedFinanceSnapshot.financeOverviewData || {}), __partial: true };

  const operations = buildOperationsMetrics({
    ...scoped,
    customerLifecycleRows,
    financeOverviewData,
    financeNormalizedRows: scopedFinanceSnapshot.financeNormalizedRows
  }, { dateRange, metricScope: scope?.metricScope || {} });
  const includeWeeklyReportRaw = Boolean(scope?.includeWeeklyReportRaw);

  return {
    campuses: scoped.campuses,
    operations: projectOperationsPagePayload({ operations }, scope?.view || '').operations,
    weeklyReportRaw: includeWeeklyReportRaw ? {
      campuses: scoped.campuses,
      leads: scoped.leads,
      leadFollowups: scoped.leadFollowups,
      students: scoped.students,
      purchases: scoped.purchases,
      entitlements: scoped.entitlements,
      entitlementLedger: scoped.entitlementLedger,
      courts: scoped.courts,
      courtAccountListIndexRows: baseRows.courtAccountListIndexRows || [],
      membershipOrders: scoped.membershipOrders,
      membershipAccounts: scoped.membershipAccounts,
      membershipPlans: scoped.membershipPlans,
      membershipBenefitLedger: scoped.membershipBenefitLedger,
      membershipAccountEvents: scoped.membershipAccountEvents,
      coaches: scoped.coaches,
      schedule: scoped.schedule,
      financeNormalizedRows: scopedFinanceSnapshot.financeNormalizedRows || []
    } : undefined,
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
    if (payload?.snapshot?.refreshing && operationsSnapshotSync?.enqueueRebuildTask) {
      await operationsSnapshotSync.enqueueRebuildTask({ user, scope, reason: 'stale-page-hit' }).catch(() => null);
    }
    return sendJson(res, payload);
  } catch (err) {
    if (err?.code === OPERATIONS_SNAPSHOT_NOT_READY_CODE) {
      if (operationsSnapshotSync?.enqueueRebuildTask) {
        await operationsSnapshotSync.enqueueRebuildTask({ user, scope, reason: 'page-miss' }).catch(() => null);
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
  invalidateOperationsPageDataCache,
  projectOperationsPagePayload
};
