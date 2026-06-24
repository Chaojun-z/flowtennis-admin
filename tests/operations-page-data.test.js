const assert = require('assert');
const fs = require('fs');
const path = require('path');

const repoRoot = path.join(__dirname, '..');
const operationsPagePath = path.join(repoRoot, 'server/page-data/operations-page.js');
const operationsMetricsPath = path.join(repoRoot, 'server/metrics/operations-metrics.js');
const residualPageDataPath = path.join(repoRoot, 'server/page-data/residual-pages.js');
const courtReadModelPath = path.join(repoRoot, 'server/page-data/court-account-read-model.js');
const leadSourceReadModelPath = path.join(repoRoot, 'server/lead-source-read-model.js');
const operationsSourcePath = path.join(repoRoot, 'server/read-models/operations-source.js');
const apiIndexPath = path.join(repoRoot, 'api/index.js');
const budgetPath = path.join(repoRoot, 'config/api-index-budget.json');

assert.ok(fs.existsSync(operationsPagePath), 'operations page-data route should live in server/page-data/operations-page.js');
assert.ok(fs.existsSync(operationsMetricsPath), 'operations metric calculations should live in server/metrics/operations-metrics.js');
assert.ok(fs.existsSync(leadSourceReadModelPath), 'lead list and operations conversion should share one lead source read model');
assert.ok(fs.existsSync(operationsSourcePath), 'all four operations dashboards should read base rows from one operations source model');

const operationsPageSource = fs.readFileSync(operationsPagePath, 'utf8');
const operationsMetricsSource = fs.readFileSync(operationsMetricsPath, 'utf8');
const courtReadModelSource = fs.readFileSync(courtReadModelPath, 'utf8');
const leadSourceReadModelSource = fs.readFileSync(leadSourceReadModelPath, 'utf8');
const operationsSourceModelSource = fs.readFileSync(operationsSourcePath, 'utf8');
const residualSource = fs.readFileSync(residualPageDataPath, 'utf8');
const apiSource = fs.readFileSync(apiIndexPath, 'utf8');
const budget = JSON.parse(fs.readFileSync(budgetPath, 'utf8'));

assert.match(operationsPageSource, /function handleOperationsPageData/, 'operations page-data module should expose handleOperationsPageData');
assert.match(operationsPageSource, /buildOperationsMetrics/, 'operations page-data should delegate calculations to server/metrics/operations-metrics.js');
assert.match(operationsPageSource, /require\('\.\.\/read-models\/customer-lifecycle\.js'\)/, 'operations page-data should import the unified customer lifecycle read model');
assert.match(operationsPageSource, /const customerLifecycleRows=buildCustomerLifecycleRows\(scoped\);[\s\S]*customerLifecycleRows,/, 'operations page-data should pass unified lifecycle rows into operations metrics');
assert.match(courtReadModelSource, /module\.exports = \{[\s\S]*bookingDurationHours[\s\S]*courtHistoryBusinessDate[\s\S]*isCourtBookingHistoryRow[\s\S]*normalizeCourtHistory/, 'court account read model should export the court history helpers used by operations metrics');
assert.match(operationsPageSource, /getFinancePageSnapshot/, 'operations page-data should be able to read the same full finance snapshot as the finance overview');
assert.match(operationsPageSource, /await getFinancePageSnapshot\(\)/, 'operations page-data should cold-build the full finance snapshot instead of depending on a lucky cache hit');
assert.match(operationsPageSource, /scanFirstRows/, 'operations page-data should use projected first-row reads instead of full raw table scans');
assert.match(operationsSourceModelSource, /OPERATIONS_CACHE_TTL_MS/, 'operations source model should cache raw read rows briefly so date switches do not rescan every table');
assert.match(leadSourceReadModelSource, /const LEAD_SOURCE_READ_LIMIT = 2000;/, 'shared lead source should use one current full-pool read limit instead of page-specific 300/600 limits');
assert.match(leadSourceReadModelSource, /detectOverflow:\s*true/, 'shared lead source should fail loudly when the unified read limit is exceeded');
assert.match(operationsSourceModelSource, /readLeadSourceRows/, 'operations conversion should read leads from the shared lead source');
assert.match(operationsSourceModelSource, /detectOverflow:\s*true/, 'operations source reads should fail loudly when a table exceeds the trusted projection limit');
assert.doesNotMatch(operationsPageSource, /T_LEADS[\s\S]{0,160}limit:\s*600/, 'operations conversion must not keep its own 600-row lead source');
assert.match(operationsPageSource, /require\('\.\.\/read-models\/operations-source\.js'\)/, 'operations page-data should depend on the shared operations source model');
assert.match(operationsSourceModelSource, /function getOperationsBaseRows/, 'operations source model should own the shared base row loading');
assert.match(operationsSourceModelSource, /readLeadSourceRows/, 'operations source model should use the same lead source as the leads page');
assert.doesNotMatch(operationsPageSource, /async function getOperationsBaseRows/, 'operations page-data should not keep a second base row loader');
assert.match(operationsPageSource, /getOperationsRowsCacheKey/, 'operations page-data cache should be scoped before reuse');
assert.match(operationsPageSource, /OPERATIONS_RESULT_CACHE_TTL_MS/, 'operations page-data should cache computed dashboard results for fast date switching');
assert.doesNotMatch(operationsPageSource, /OPERATIONS_RESULT_STALE_TTL_MS/, 'operations page-data must not return old stale results as realtime operations data');
assert.match(operationsPageSource, /getOperationsResultCacheKey[\s\S]*dateRange\.startDate[\s\S]*dateRange\.endDate/, 'computed operations cache should be scoped by selected date range');
assert.match(operationsPageSource, /const cachedOperations = operationsResultCache\.get\(resultCacheKey\)/, 'operations page-data should read the computed result cache before recalculating');
assert.match(operationsPageSource, /function invalidateOperationsPageDataCache\(\)[\s\S]*operationsResultCache\.clear\(\)/, 'operations page-data should expose cache invalidation for realtime writes');
assert.doesNotMatch(operationsPageSource, /function readStaleOperationsResultCache/, 'operations page-data should not keep a stale-result read path');
assert.doesNotMatch(operationsPageSource, /return sendJson\(res, stalePayload\)/, 'operations page-data should not answer with stale cached payloads');
assert.match(operationsPageSource, /operationsResultCache\.set\(resultCacheKey/, 'operations page-data should save computed operations results after calculation');
assert.match(operationsSourceModelSource, /OPERATIONS_LEAD_FIELDS[\s\S]*OPERATIONS_SCHEDULE_FIELDS/, 'operations source model should keep a dedicated projection field list for the operations read model');
assert.match(operationsSourceModelSource, /OPERATIONS_LEAD_FIELDS[\s\S]*formalCoach/, 'operations source model should include formalCoach for conversion coach filters');
assert.match(operationsSourceModelSource, /OPERATIONS_PURCHASE_FIELDS[\s\S]*'paidAmount'[\s\S]*'receivedAmount'[\s\S]*'coachPriceName'[\s\S]*'coachPriceSnapshot'/, 'operations source model should read real coach ownership and receipt fallback fields for coach efficiency');
assert.match(operationsSourceModelSource, /OPERATIONS_COURT_FIELDS[\s\S]*'history'/, 'operations source model should read court history for campus venue heatmaps');
assert.match(operationsSourceModelSource, /OPERATIONS_SCHEDULE_FIELDS[\s\S]*'venueId'[\s\S]*'locationType'[\s\S]*'externalVenueName'/, 'operations source model should read schedule venue id and external venue flags for utilization');
assert.match(operationsSourceModelSource, /OPERATIONS_ENTITLEMENT_LEDGER_FIELDS[\s\S]*'sourceDate'[\s\S]*'sourceTimeBand'[\s\S]*'sourceVenue'/, 'operations source model should read historical course ledger venue and time fields for heatmaps');
assert.match(operationsSourceModelSource, /T_ENTITLEMENT_LEDGER[\s\S]*OPERATIONS_ENTITLEMENT_LEDGER_FIELDS/, 'operations source model should scan entitlement ledger rows for court heatmaps');
assert.match(operationsSourceModelSource, /OPERATIONS_FOLLOWUP_FIELDS[\s\S]*'leadId'[\s\S]*'followupAt'[\s\S]*'statusAfter'/, 'operations source model should read lead follow-up event dates for evidence-based conversion trends');
assert.match(operationsSourceModelSource, /T_LEAD_FOLLOWUPS[\s\S]*OPERATIONS_FOLLOWUP_FIELDS/, 'operations source model should scan lead followups for conversion event evidence');
assert.match(operationsMetricsSource, /leadFollowups:\s*filterRowsByDateRange/, 'operations metrics should include lead followups in date-range evidence rows');
assert.match(operationsMetricsSource, /function buildOverviewTrendDailyRows\(\{[\s\S]*financeNormalizedRows[\s\S]*financeCourseRows[\s\S]*financeStoredValueRows/, 'overview KPI trends should aggregate real finance rows when purchase detail rows are unavailable');
assert.match(operationsMetricsSource, /function lifecycleRowsForData\(data = \{\}\)/, 'operations metrics should use one lifecycle row source for conversion calculations');
assert.match(operationsMetricsSource, /if \(Array\.isArray\(data\.customerLifecycleRows\) && data\.customerLifecycleRows\.length\) return data\.customerLifecycleRows;/, 'operations metrics should prefer lifecycle rows already built by page-data');
assert.match(operationsMetricsSource, /function courtTrendDays\(\{[\s\S]*financeNormalizedRows[\s\S]*financeCourtBookingRows/, 'court KPI trends should use real finance booking row dates when court history is unavailable');
assert.match(operationsMetricsSource, /function conversionTrendSourceDates[\s\S]*appointmentEventDate[\s\S]*attendanceEventDate[\s\S]*dealEventDate/, 'conversion KPI trends should use real event evidence dates instead of leadDate only');
assert.match(operationsMetricsSource, /function financeRowsAsCoachPurchases[\s\S]*financeCourseRows[\s\S]*cashDelta[\s\S]*purchaseDate: financeBusinessDate/, 'coach KPI trends should use real course finance rows when purchase detail rows are unavailable');
assert.match(operationsMetricsSource, /function operationsTrendDateRange/, 'operations metrics should derive a real multi-day trend window separately from the selected KPI range');
assert.match(operationsMetricsSource, /function buildTrendDiagnostics/, 'operations metrics should expose trend diagnostics for all four dashboards');
assert.match(operationsMetricsSource, /trendDiagnostics:\s*buildTrendDiagnostics/, 'each operations dashboard should return trend diagnostics');
assert.match(operationsPageSource, /mergeDuplicateLeadRows/, 'operations page-data should use the same deduped lead pool as the leads page');
assert.match(operationsSourceModelSource, /function invalidateOperationsSourceCache\(\)[\s\S]*operationsRowsCache\.clear\(\)/, 'operations source model should expose raw row cache invalidation for realtime writes');
assert.match(apiSource, /OPERATIONS_SOURCE_TABLES=new Set\(\[[\s\S]*T_LEADS[\s\S]*T_LEAD_FOLLOWUPS[\s\S]*T_SCHEDULE[\s\S]*T_COURTS[\s\S]*T_PURCHASES[\s\S]*\]\)/, 'api should list operation source tables that invalidate operations caches');
assert.match(apiSource, /onTableWrite\(t\)\{[\s\S]*OPERATIONS_SOURCE_TABLES\.has\(t\)[\s\S]*invalidateOperationsSourceCache\(\)[\s\S]*invalidateOperationsPageDataCache\(\)/, 'storage writes to operation source tables should invalidate operations caches immediately');
assert.match(residualSource, /require\('\.\/operations-page\.js'\)/, 'residual page-data routes should import operations-page.js');
assert.match(residualSource, /path==='\/page-data\/operations'&&method==='GET'/, 'residual page-data routes should own /page-data/operations');
assert.match(residualSource, /handleOperationsPageData/, 'residual page-data routes should delegate the operations route');
assert.doesNotMatch(apiSource, /\/page-data\/operations[\s\S]{0,300}buildOperationsMetrics/, 'api/index.js should not inline operations calculations');
assert.match(apiSource, /T_LEADS/, 'api/index.js should pass lead tables into extracted page-data routes');
assert.match(apiSource, /getFinancePageSnapshot/, 'api/index.js should pass the full finance snapshot accessor into extracted page-data routes');
assert.match(apiSource, /scanFirstRows/, 'api/index.js should pass projected read support into extracted page-data routes');
assert.ok(
  budget.extractedModules.includes('server/page-data/operations-page.js') &&
  budget.extractedModules.includes('server/metrics/operations-metrics.js'),
  'api index budget should track the new extracted operations modules'
);

console.log('operations page-data tests passed');
