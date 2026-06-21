const assert = require('assert');
const fs = require('fs');
const path = require('path');

const repoRoot = path.join(__dirname, '..');
const operationsPagePath = path.join(repoRoot, 'server/page-data/operations-page.js');
const operationsMetricsPath = path.join(repoRoot, 'server/metrics/operations-metrics.js');
const residualPageDataPath = path.join(repoRoot, 'server/page-data/residual-pages.js');
const courtReadModelPath = path.join(repoRoot, 'server/page-data/court-account-read-model.js');
const apiIndexPath = path.join(repoRoot, 'api/index.js');
const budgetPath = path.join(repoRoot, 'config/api-index-budget.json');

assert.ok(fs.existsSync(operationsPagePath), 'operations page-data route should live in server/page-data/operations-page.js');
assert.ok(fs.existsSync(operationsMetricsPath), 'operations metric calculations should live in server/metrics/operations-metrics.js');

const operationsPageSource = fs.readFileSync(operationsPagePath, 'utf8');
const courtReadModelSource = fs.readFileSync(courtReadModelPath, 'utf8');
const residualSource = fs.readFileSync(residualPageDataPath, 'utf8');
const apiSource = fs.readFileSync(apiIndexPath, 'utf8');
const budget = JSON.parse(fs.readFileSync(budgetPath, 'utf8'));

assert.match(operationsPageSource, /function handleOperationsPageData/, 'operations page-data module should expose handleOperationsPageData');
assert.match(operationsPageSource, /buildOperationsMetrics/, 'operations page-data should delegate calculations to server/metrics/operations-metrics.js');
assert.match(courtReadModelSource, /module\.exports = \{[\s\S]*bookingDurationHours[\s\S]*courtHistoryBusinessDate[\s\S]*isCourtBookingHistoryRow[\s\S]*normalizeCourtHistory/, 'court account read model should export the court history helpers used by operations metrics');
assert.match(operationsPageSource, /getFinancePageSnapshotIfCached/, 'operations page-data should reuse only the cached finance page snapshot when scope allows it');
assert.doesNotMatch(operationsPageSource, /getFinancePageSnapshot\(\)/, 'operations page-data should not cold-build the full finance snapshot');
assert.match(operationsPageSource, /scanFirstRows/, 'operations page-data should use projected first-row reads instead of full raw table scans');
assert.match(operationsPageSource, /OPERATIONS_CACHE_TTL_MS/, 'operations page-data should cache raw read rows briefly so date switches do not rescan every table');
assert.match(operationsPageSource, /getOperationsRowsCacheKey/, 'operations page-data cache should be scoped before reuse');
assert.match(operationsPageSource, /OPERATIONS_RESULT_CACHE_TTL_MS/, 'operations page-data should cache computed dashboard results for fast date switching');
assert.match(operationsPageSource, /getOperationsResultCacheKey[\s\S]*dateRange\.startDate[\s\S]*dateRange\.endDate/, 'computed operations cache should be scoped by selected date range');
assert.match(operationsPageSource, /const cachedOperations = operationsResultCache\.get\(resultCacheKey\)/, 'operations page-data should read the computed result cache before recalculating');
assert.match(operationsPageSource, /operationsResultCache\.set\(resultCacheKey/, 'operations page-data should save computed operations results after calculation');
assert.match(operationsPageSource, /OPERATIONS_LEAD_FIELDS[\s\S]*OPERATIONS_SCHEDULE_FIELDS/, 'operations page-data should keep a dedicated projection field list for the operations read model');
assert.match(operationsPageSource, /OPERATIONS_LEAD_FIELDS[\s\S]*formalCoach/, 'operations page-data should include formalCoach for conversion coach filters');
assert.match(operationsPageSource, /OPERATIONS_PURCHASE_FIELDS[\s\S]*'paidAmount'[\s\S]*'receivedAmount'[\s\S]*'coachPriceName'[\s\S]*'coachPriceSnapshot'/, 'operations page-data should read real coach ownership and receipt fallback fields for coach efficiency');
assert.match(operationsPageSource, /OPERATIONS_COURT_FIELDS[\s\S]*'history'/, 'operations page-data should read court history for campus venue heatmaps');
assert.match(operationsPageSource, /OPERATIONS_SCHEDULE_FIELDS[\s\S]*'venueId'[\s\S]*'locationType'[\s\S]*'externalVenueName'/, 'operations page-data should read schedule venue id and external venue flags for utilization');
assert.match(operationsPageSource, /OPERATIONS_ENTITLEMENT_LEDGER_FIELDS[\s\S]*'sourceDate'[\s\S]*'sourceTimeBand'[\s\S]*'sourceVenue'/, 'operations page-data should read historical course ledger venue and time fields for heatmaps');
assert.match(operationsPageSource, /T_ENTITLEMENT_LEDGER[\s\S]*OPERATIONS_ENTITLEMENT_LEDGER_FIELDS/, 'operations page-data should scan entitlement ledger rows for court heatmaps');
assert.match(operationsPageSource, /mergeDuplicateLeadRows/, 'operations page-data should use the same deduped lead pool as the leads page');
assert.match(residualSource, /require\('\.\/operations-page\.js'\)/, 'residual page-data routes should import operations-page.js');
assert.match(residualSource, /path==='\/page-data\/operations'&&method==='GET'/, 'residual page-data routes should own /page-data/operations');
assert.match(residualSource, /handleOperationsPageData/, 'residual page-data routes should delegate the operations route');
assert.doesNotMatch(apiSource, /\/page-data\/operations[\s\S]{0,300}buildOperationsMetrics/, 'api/index.js should not inline operations calculations');
assert.match(apiSource, /T_LEADS/, 'api/index.js should pass lead tables into extracted page-data routes');
assert.match(apiSource, /getFinancePageSnapshotIfCached/, 'api/index.js should pass the cached finance snapshot accessor into extracted page-data routes');
assert.match(apiSource, /scanFirstRows/, 'api/index.js should pass projected read support into extracted page-data routes');
assert.ok(
  budget.extractedModules.includes('server/page-data/operations-page.js') &&
  budget.extractedModules.includes('server/metrics/operations-metrics.js'),
  'api index budget should track the new extracted operations modules'
);

console.log('operations page-data tests passed');
