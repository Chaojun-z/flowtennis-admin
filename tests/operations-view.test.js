const assert = require('assert');
const fs = require('fs');
const path = require('path');
const vm = require('vm');

const repoRoot = path.join(__dirname, '..');
const indexSource = fs.readFileSync(path.join(repoRoot, 'public/index.html'), 'utf8');
const componentsSource = fs.readFileSync(path.join(repoRoot, 'public/assets/scripts/core/components.js'), 'utf8');
const standardComponentsSource = fs.readFileSync(path.join(repoRoot, 'public/assets/scripts/standard/components.js'), 'utf8');
const bootstrapSource = fs.readFileSync(path.join(repoRoot, 'public/assets/scripts/core/bootstrap.js'), 'utf8');
const stateSource = fs.readFileSync(path.join(repoRoot, 'public/assets/scripts/core/state.js'), 'utf8');
const chartsPath = path.join(repoRoot, 'public/assets/scripts/standard/charts.js');
const operationsPath = path.join(repoRoot, 'public/assets/scripts/pages/operations.js');
const operationsMetricsPath = path.join(repoRoot, 'server/metrics/operations-metrics.js');
const operationsSourcePath = path.join(repoRoot, 'server/read-models/operations-source.js');
const apiIndexPath = path.join(repoRoot, 'api/index.js');
const residualPagesPath = path.join(repoRoot, 'server/page-data/residual-pages.js');
const stylesPath = path.join(repoRoot, 'public/assets/styles/pages.css');

assert.ok(fs.existsSync(chartsPath), 'global chart wrapper should live in public/assets/scripts/standard/charts.js');
assert.ok(fs.existsSync(operationsPath), 'operations page should live in public/assets/scripts/pages/operations.js');
assert.ok(fs.existsSync(operationsMetricsPath), 'operations standard metrics should live in server/metrics/operations-metrics.js');
assert.ok(fs.existsSync(operationsSourcePath), 'operations page source projection should live in server/read-models/operations-source.js');
assert.ok(fs.existsSync(stylesPath), 'operations page styles should live in public/assets/styles/pages.css');

const chartsSource = fs.readFileSync(chartsPath, 'utf8');
const operationsSource = fs.readFileSync(operationsPath, 'utf8');
const operationsMetricsSource = fs.readFileSync(operationsMetricsPath, 'utf8');
const operationsSourceReadModel = fs.readFileSync(operationsSourcePath, 'utf8');
const apiIndexSource = fs.readFileSync(apiIndexPath, 'utf8');
const residualPagesSource = fs.readFileSync(residualPagesPath, 'utf8');
const stylesSource = fs.readFileSync(stylesPath, 'utf8');
const operationsRuntime = {
  console,
  localStorage: { getItem: () => '', setItem: () => {} },
  window: {},
  esc: value => String(value ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;'),
  fmt: value => {
    const num = Number(value) || 0;
    return Number.isInteger(num) ? String(num) : String(Math.round(num * 10) / 10);
  },
  dateKey: date => {
    const d = new Date(date);
    return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
  },
  activeGlobalDateRange: () => ({ startDate: '2026-07-01', endDate: '2026-07-12' })
};
vm.createContext(operationsRuntime);
vm.runInContext(operationsSource, operationsRuntime);

function countClass(html, className) {
  return (html.match(new RegExp(`class="[^"]*${className}(?:\\s|")`, 'g')) || []).length;
}

function functionBody(source, name) {
  const start = source.indexOf(`function ${name}(`);
  assert.notStrictEqual(start, -1, `${name} should exist`);
  const nextFunction = source.indexOf('\nfunction ', start + 1);
  const nextAsyncFunction = source.indexOf('\nasync function ', start + 1);
  const candidates = [nextFunction, nextAsyncFunction].filter(index => index !== -1);
  const end = candidates.length ? Math.min(...candidates) : source.length;
  return source.slice(start, end);
}

const operationsKpiSample = {
  overview: {
    cards: {
      totalIncome: { value: 993300 },
      recognizedRevenue: { value: 672500 },
      pendingRevenue: { value: 320800 },
      tradeCount: { value: 1392 }
    },
    trends: [
      { date: '2026-07-01', totalIncome: 239, recognizedRevenue: 180, pendingRevenue: 59, tradeCount: 12, utilizationRate: 5 },
      { date: '2026-07-02', totalIncome: 310, recognizedRevenue: 220, pendingRevenue: 90, tradeCount: 16, utilizationRate: 7 },
      { date: '2026-07-03', totalIncome: 280, recognizedRevenue: 240, pendingRevenue: 40, tradeCount: 13, utilizationRate: 9 }
    ],
    trendComparisons: {}
  },
  court: {
    cards: {
      bookingAmount: { value: 188000 },
      bookingHours: { value: 320 },
      utilizationRate: { value: 9 },
      goldenUtilizationRate: { value: 16 },
      offPeakUtilizationRate: { value: 5 }
    },
    trends: [
      { date: '2026-07-01', bookingAmount: 1200, bookingHours: 20, utilizationRate: 5, goldenUtilizationRate: 10, offPeakUtilizationRate: 2 },
      { date: '2026-07-02', bookingAmount: 1500, bookingHours: 24, utilizationRate: 7, goldenUtilizationRate: 14, offPeakUtilizationRate: 4 },
      { date: '2026-07-03', bookingAmount: 1800, bookingHours: 30, utilizationRate: 9, goldenUtilizationRate: 16, offPeakUtilizationRate: 5 }
    ],
    trendComparisons: {}
  },
  conversion: {
    cards: {
      totalLeads: { value: 268 }
    },
    standardLifecycleMetrics: {
      metrics: {
        validLeads: { value: 268, rate: 100 },
        historicalStudents: { value: 118, rate: 44 },
        activeStudents: { value: 42, rate: 36 },
        trialAttendedStudents: { value: 78, rate: 29 },
        trialAttendedToFormalPurchase: { value: 32, rate: 41 },
        totalDeals: { value: 86, rate: 32 },
        trialPathDeals: { value: 28, rate: 41 },
        courseRepeatBuyers: { value: 19, rate: 27 }
      }
    },
    courtChain: { courtRepeatRate: 24 },
    trends: [
      { date: '2026-07-01', validLeads: 180, historicalStudents: 72, activeStudents: 28, trialAttendedStudents: 40, trialAttendedToFormalPurchase: 16, totalDealRate: 20, trialPathDealRate: 30, courseRepeatRate: 14, courtRepeatRate: 18 },
      { date: '2026-07-02', validLeads: 220, historicalStudents: 96, activeStudents: 35, trialAttendedStudents: 60, trialAttendedToFormalPurchase: 24, totalDealRate: 26, trialPathDealRate: 34, courseRepeatRate: 20, courtRepeatRate: 21 },
      { date: '2026-07-03', validLeads: 268, historicalStudents: 118, activeStudents: 42, trialAttendedStudents: 78, trialAttendedToFormalPurchase: 32, totalDealRate: 32, trialPathDealRate: 41, courseRepeatRate: 27, courtRepeatRate: 24 }
    ],
    trendComparisons: {}
  },
  coach: {
    rows: [{ coach: 'Siren 教练', usedHours: 10, availableHours: 20, revenue: 8000 }],
    cards: {
      activeCoaches: { value: 6 },
      utilizationRate: { value: 58 },
      revenue: { value: 88000 },
      trialConversionRate: { value: 45 },
      renewalRate: { value: 36 }
    },
    trends: [
      { date: '2026-07-01', activeCoaches: 5, utilizationRate: 44, revenue: 52000, trialConversionRate: 35, renewalRate: 28 },
      { date: '2026-07-02', activeCoaches: 6, utilizationRate: 52, revenue: 76000, trialConversionRate: 40, renewalRate: 32 },
      { date: '2026-07-03', activeCoaches: 6, utilizationRate: 58, revenue: 88000, trialConversionRate: 45, renewalRate: 36 }
    ],
    trendComparisons: {}
  }
};
const courtOverviewSource = operationsSource.slice(
  operationsSource.indexOf('function renderOperationsCourtCampusOverview'),
  operationsSource.indexOf('function renderOperationsCourtHeatCell')
);
const channelQualityChartSource = chartsSource.slice(
  chartsSource.indexOf('function buildOperationsChannelQualityChartOption'),
  chartsSource.indexOf('function operationsCourtQuadrantColor')
);

assert.match(indexSource, /id="page-operations"/, 'index.html should contain the operations page section');
assert.match(indexSource, /cdn\.jsdelivr\.net\/npm\/echarts/, 'index.html should load Apache ECharts from a CDN');
assert.match(indexSource, /\/assets\/scripts\/standard\/charts\.js/, 'index.html should load the global chart wrapper');
assert.match(indexSource, /\/assets\/scripts\/pages\/operations\.js/, 'index.html should load the operations page script');
assert.match(apiIndexSource, /handleResidualPageDataRoutes=createResidualPageDataRoutes\([\s\S]*tables:\{[\s\S]*T_FEEDBACKS[\s\S]*\}/, 'operations page-data route should pass T_FEEDBACKS into the shared read model');
assert.match(residualPagesSource, /handleOperationsPageData\([\s\S]*tables:\{[\s\S]*T_FEEDBACKS[\s\S]*\}/, 'operations residual page handler should include feedback table when building coach metrics');
assert.match(componentsSource, /setOperationsTab\('overview'\);goPage\('operations',this\)[\s\S]*经营总览/, 'sidebar should expose operations overview as a left menu item');
assert.match(componentsSource, /setOperationsTab\('court'\);goPage\('operations',this\)[\s\S]*场地运转/, 'sidebar should expose court operations as a left menu item');
assert.match(componentsSource, /setOperationsTab\('conversion'\);goPage\('operations',this\)[\s\S]*转化与留存/, 'sidebar should expose conversion and retention as a left menu item');
assert.match(componentsSource, /setOperationsTab\('coach'\);goPage\('operations',this\)[\s\S]*教练人效/, 'sidebar should expose coach efficiency as a left menu item');
assert.match(componentsSource, /data-nav-page="operations" data-operations-tab="overview"/, 'operations overview should be a left menu item');
assert.match(componentsSource, /data-nav-page="operations" data-operations-tab="conversion"/, 'operations conversion should be a left menu item');
assert.match(componentsSource, /<div class="sb-sec">财务中心<\/div>[\s\S]*财务总览[\s\S]*收款流水[\s\S]*入账流水/, 'finance menu should remain as an independent module');
assert.match(componentsSource, /<div class="sb-sec">财务中心<\/div>[\s\S]*<div class="sb-sec">经营分析<\/div>[\s\S]*<div class="sb-sec">基础设置<\/div>/, 'operations menu should sit between finance center and basic settings');
assert.match(bootstrapSource, /operations:'经营分析'/, 'page title map should include operations');
assert.match(bootstrapSource, /OPERATIONS_TITLE_MAP=\{overview:'经营总览',court:'场地运转',conversion:'转化与留存',coach:'教练人效'\}/, 'operations page title should expose all four dashboards');
assert.match(bootstrapSource, /n\.dataset\.operationsTab===tab/, 'operations sidebar should only highlight the selected sub menu item');
assert.doesNotMatch(bootstrapSource, /function scrollActiveSidebarItemIntoView\(/, 'sidebar should not auto-scroll the active menu item on page navigation');
assert.doesNotMatch(bootstrapSource, /scrollActiveSidebarItemIntoView\(\)/, 'page navigation should keep the current sidebar scroll position');
assert.match(bootstrapSource, /adminPages=\[[^\]]*'operations'/, 'operations should be admin-only');
assert.match(stateSource, /if\(pg==='operations'\)renderOperations\(\)/, 'renderPageData should render operations');
assert.match(operationsSource, /const OPERATIONS_TAB_KEY='ft_operations_active_tab'/, 'operations should persist the selected dashboard tab');
assert.match(operationsSource, /function readOperationsActiveTab\(\)[\s\S]*localStorage\.getItem\(OPERATIONS_TAB_KEY\)[\s\S]*return 'overview'/, 'operations should restore the last selected dashboard tab and fall back to overview');
assert.match(operationsSource, /let operationsActiveTab = readOperationsActiveTab\(\)/, 'operations should initialize the active tab from persisted state');
assert.match(operationsSource, /localStorage\.setItem\(OPERATIONS_TAB_KEY,operationsActiveTab\)/, 'operations should save tab changes so refresh stays on the same dashboard');
assert.match(operationsSource, /\['overview', 'court', 'conversion', 'coach'\]\.includes\(tab\)/, 'operations should allow overview, court, conversion and coach dashboards');
assert.match(componentsSource, /globalTopFilterPages\(\)\{[\s\S]*'operations'/, 'operations page should reuse the global top date filter');
assert.match(componentsSource, /renderStandardTopDropdown\('globalTopCampus'/, 'operations H5 top filter should keep the shared campus icon entry');
assert.match(componentsSource, /renderStandardTopDropdown\('globalTopDate'/, 'operations H5 top filter should keep the shared date icon entry');
assert.match(componentsSource, /if\(currentPage==='operations'\)reloadOperationsPageDataWithInlineLoading\(\)/, 'operations page should reload aggregate data through inline skeletons when the global date filter changes');
assert.match(stateSource, /async function reloadOperationsPageDataWithInlineLoading\(\)/, 'operations page should have a dedicated inline refresh path');
assert.match(stateSource, /reloadOperationsPageDataWithInlineLoading[\s\S]*renderOperationsLoading\(\)[\s\S]*ensureDatasetsByName\(\['operationsPage'\],\{force:true\}\)/, 'operations inline refresh should show local skeleton and refresh only operations data');
assert.doesNotMatch(stateSource, /reloadOperationsPageDataWithInlineLoading[\s\S]{0,500}pageLoading/, 'operations inline refresh should not show the global loading overlay');
assert.match(standardComponentsSource, /function renderStandardPageSkeleton\(/, 'standard components should expose a global page skeleton renderer');
assert.match(standardComponentsSource, /function renderStandardSkeletonKpiCard\(/, 'global page skeleton should render metric cards with title, value and supporting lines');
assert.match(standardComponentsSource, /function renderStandardSkeletonChartPanel\(/, 'global page skeleton should render chart panels with realistic chart placeholders');
assert.match(standardComponentsSource, /function standardPageSkeletonConfigs\(\)[\s\S]*page:'products'[\s\S]*variant:'cards'[\s\S]*page:'packages'[\s\S]*variant:'board'[\s\S]*page:'finance'[\s\S]*page:'workbench'[\s\S]*page:'postfeedback'/, 'global skeleton configs should cover non-table, complex and dashboard pages');
assert.match(standardComponentsSource, /function renderStandardPageLoading\(pageKey\)[\s\S]*standardPageSkeletonConfigForPage\(pageKey\)[\s\S]*renderStandardPageSkeleton\(config\)/, 'page loading should route through the shared page skeleton renderer');
assert.match(stateSource, /if\(typeof renderStandardPageLoading==='function'&&renderStandardPageLoading\(pg\)\)return;/, 'page loading should first try the shared real-layout skeleton');
assert.doesNotMatch(stateSource, /if\(pg==='packages'\)renderBlockLoading/, 'packages loading should not use a fake text block');
assert.doesNotMatch(stateSource, /if\(pg==='workbench'\)renderBlockLoading/, 'workbench loading should not use a fake text block');
assert.doesNotMatch(stateSource, /if\(pg==='postfeedback'\)renderBlockLoading/, 'postfeedback loading should not use a fake text block');
assert.match(stateSource, /const OPERATIONS_PAGE_CACHE_VERSION='2026-07-12-conversion-lifecycle-v2'/, 'operations client cache must be versioned after conversion lifecycle payload shape changes');
assert.match(stateSource, /function operationsPageCachePayloadIsCompatible\(/, 'operations client cache must validate payload shape before first paint');
assert.match(functionBody(stateSource, 'hydrateOperationsPageFromClientCache'), /operationsPageCachePayloadIsCompatible\(data\)/, 'operations page must not hydrate stale cache that lacks new lifecycle metrics');
assert.match(stateSource, /function operationsPageDataUrl\(\)/, 'state loader should build an operations endpoint URL with date range params');
assert.match(functionBody(stateSource, 'operationsPageDataUrl'), /scopedPageDataUrl\('\/page-data\/operations'\)/, 'operations dashboard should request operations data with the same campus and date scope as lifecycle metrics');
assert.match(stateSource, /function loadOperationsPageDataset\(\)[\s\S]*const url=operationsPageDataUrl\(\)[\s\S]*apiCall\('GET',url\)/, 'state loader should call the operations aggregate endpoint with the selected date range');
assert.match(stateSource, /operationsPage:\(\)=>loadOperationsPageDataset\(\)/, 'operations dataset loader should use the date-aware loader');
assert.match(stateSource, /function operationsPageDatasetRequestKey\(\)/, 'operations requests should use a date-aware request key');
assert.match(stateSource, /operationsPageDatasetRequestKey\(\)[\s\S]*operationsPageDataUrl\(\)/, 'operations request key should include the active date range URL');
assert.match(stateSource, /function operationsPageClientCacheKey\(\)[\s\S]*operationsPageDataUrl\(\)/, 'operations client cache should be scoped by the active date range URL');
assert.match(stateSource, /const OPERATIONS_PAGE_CACHE_VERSION='2026-07-12-conversion-lifecycle-v2'/, 'operations client cache should invalidate stale conversion lifecycle payloads');
assert.match(stateSource, /function operationsPageClientCacheKey\(\)[\s\S]*OPERATIONS_PAGE_CACHE_VERSION[\s\S]*operationsPageDataUrl\(\)/, 'operations client cache key should include the cache version');
assert.match(stateSource, /function readOperationsPageClientCache\(\)[\s\S]*operationsPageClientCacheKey\(\)/, 'operations should read a cached view model before waiting for the slow aggregate endpoint');
assert.match(stateSource, /function persistOperationsPageClientCache\([\s\S]*cacheVersion:OPERATIONS_PAGE_CACHE_VERSION[\s\S]*operationsPageClientCacheKey\(\)/, 'operations should persist the latest versioned view model for fast repeat entry');
assert.match(stateSource, /function hydrateOperationsPageFromClientCache\(\)[\s\S]*operationsPageData=data\.operations[\s\S]*renderOperations\(\)/, 'operations should render cached data immediately while fresh data loads in the background');
assert.match(stateSource, /if\(pg==='operations'&&hydrateOperationsPageFromClientCache\(\)\)return;/, 'operations loading should skip skeleton when a cached view model is available');
assert.match(stateSource, /persistOperationsPageClientCache\(data\)/, 'operations refresh should update the client view-model cache after a successful response');
assert.match(stateSource, /const requestKey=datasetRequestKey\(name\)/, 'dataset request de-duplication should be scoped by request key');
assert.match(stateSource, /datasetLoadPromises\.has\(requestKey\)/, 'in-flight operations requests should not reuse a stale all-time request after date changes');
assert.match(stateSource, /if\(name==='operationsPage'\)[\s\S]*operationsPageRequestSeq/, 'operations refresh should only accept the latest response');
assert.match(stateSource, /operations:\['operationsPage'\]/, 'operations page should rely on the aggregate endpoint only');
assert.match(stateSource, /markDatasetLoaded\('operationsPage',requestKey\)/, 'operations aggregate data should be tracked as loaded');
assert.match(chartsSource, /echarts\.init/, 'only the standard chart wrapper should initialize ECharts');
assert.match(chartsSource, /renderStandardChart/, 'standard chart wrapper should expose renderStandardChart');
assert.match(chartsSource, /buildStandardPieChartOption/, 'standard chart wrapper should expose a reusable pie chart option builder');
assert.match(chartsSource, /renderProgressFunnel/, 'standard chart wrapper should expose the Gemini-style progress funnel component');
assert.match(chartsSource, /operations-funnel-node[\s\S]*operations-funnel-volume[\s\S]*style="width:\$\{Math\.max\(1, percent\)\}%"/, 'progress funnel should render each stage as a soft width-aware data node');
assert.match(chartsSource, /operations-funnel-transition[\s\S]*operations-funnel-conversion[\s\S]*operations-funnel-drop/, 'progress funnel should put conversion and loss on one transition row');
assert.match(chartsSource, /流失 \$\{fmt\(loss\)\}% · \$\{fmt\(lossCount\)\} 人/, 'progress funnel should show loss rate and lost people together on the right');
assert.doesNotMatch(chartsSource, /累计 \$\{fmt\(percent\)\}%/, 'progress funnel should not repeat cumulative rate below each bar');
assert.doesNotMatch(chartsSource, /占总线索/, 'progress funnel should no longer show overall total-lead rate');
assert.doesNotMatch(chartsSource, /operations-funnel-total-rate/, 'progress funnel should remove the external total-rate line');
assert.doesNotMatch(chartsSource, /operations-funnel-scale|25%[\s\S]*50%[\s\S]*75%[\s\S]*100%/, 'progress funnel should remove noisy percentage scale marks');
assert.doesNotMatch(chartsSource, /operations-funnel-loss-badge/, 'progress funnel should remove loud loss badges');
assert.match(stylesSource, /operations-funnel-card\{[^}]*min-height:0[^}]*padding:24px 26px 22px/, 'funnel card should not leave a large fixed blank area below the rows');
assert.match(stylesSource, /operations-funnel-host\{min-height:0\}/, 'funnel host should shrink to the actual funnel content');
assert.match(stylesSource, /operations-funnel-node\{[^}]*min-height:44px[\s\S]*operations-funnel-volume\{[^}]*background:color-mix\(in srgb,var\(--ops-blue\) 10%,transparent\)/, 'funnel nodes should use a restrained theme-color volume background');
assert.match(stylesSource, /operations-funnel-conversion\{[^}]*color:var\(--ops-blue\)[\s\S]*operations-funnel-drop\{[^}]*color:#87909D/, 'conversion should use the theme color while loss stays gray');
assert.doesNotMatch(stylesSource, /operations-funnel-transition-label|operations-funnel-track|operations-funnel-fill/, 'funnel should remove old bar labels, tracks, and gradient fills');
assert.match(stylesSource, /operations-conversion-kpi-row\{[^}]*grid-template-columns:repeat\(5,minmax\(0,1fr\)\)/, 'conversion top KPI row should show five non-duplicated cards in one row');
assert.match(stylesSource, /operations-conversion-funnel-grid\{[^}]*grid-template-columns:repeat\(3,minmax\(0,1fr\)\)/, 'conversion funnels should show three peer cards in one row');
assert.match(stylesSource, /operations-channel-diagnostics-grid\{[^}]*grid-template-columns:repeat\(2,minmax\(0,1fr\)\)/, 'channel diagnostics should show chart and table as two peer cards');
assert.match(stylesSource, /operations-channel-quality-chart\{[^}]*border:0/, 'channel quality chart should not render a nested border inside the card');
assert.match(stylesSource, /operations-persona-grid\{[^}]*grid-template-columns:repeat\(2,minmax\(0,1fr\)\)/, 'people profile dashboard should show conversion and retention ranking cards in one row');
assert.match(chartsSource, /emphasis[\s\S]*focus/, 'ECharts series should expose hover emphasis');
assert.match(chartsSource, /function buildStandardBubbleMatrixChartOption/, 'standard charts should expose a shared bubble matrix base builder');
assert.match(chartsSource, /function buildStandardBusinessBubbleMatrixChartOption/, 'standard charts should expose the shared business bubble matrix builder');
assert.match(chartsSource, /function buildStandardQuadrantBubbleMatrixChartOption/, 'standard charts should expose the shared quadrant bubble matrix builder');
assert.match(chartsSource, /buildOperationsCourtQuadrantChartOption/, 'court comparison should use a dedicated quadrant bubble chart builder');
assert.match(chartsSource, /buildOperationsCoachMatrixChartOption/, 'coach dashboard should use a dedicated coach revenue-utilization matrix builder');
assert.match(chartsSource, /buildOperationsCoachParetoChartOption/, 'coach dashboard should use a dedicated pareto contribution builder');
assert.match(chartsSource, /buildOperationsCoachCapabilityChartOption/, 'coach dashboard should use a dedicated conversion-renewal capability builder');
assert.match(chartsSource, /function operationsCoachShortName[\s\S]*replace\(\/教练\$\/, ''\)/, 'coach chart labels should shorten names like 朝珺教练 to 朝珺');
assert.match(chartsSource, /buildOperationsCoachMatrixChartOption[\s\S]*label: \{ show: !!bubbleLabel\.text, fontSize: bubbleLabel\.fontSize \}[\s\S]*formatter: item => operationsCoachBubbleLabel\(item\)\.text/, 'coach matrix should show dynamic short-name labels instead of raw numeric values');
assert.match(chartsSource, /buildOperationsCoachCapabilityChartOption[\s\S]*label: \{ show: !!bubbleLabel\.text, fontSize: bubbleLabel\.fontSize \}[\s\S]*formatter: item => operationsCoachBubbleLabel\(item\)\.text/, 'coach capability matrix should show dynamic short-name labels instead of raw numeric values');
assert.match(chartsSource, /operationsPremiumMatrixQuadrantColors[\s\S]*q1: '#B58B4C'[\s\S]*q2: '#6B8E9B'[\s\S]*q3: '#A75D5D'[\s\S]*q4: '#7C8B6F'/, 'same-type matrix charts should use the shared Gemini quadrant color palette');
assert.match(chartsSource, /operationsPercentAxisRange\(source\.map\(row => row\.utilizationRate\), \{ defaultMax: 75, max: 100 \}/, 'coach matrix x axis should default to 0-75% and expand up to 100% when data breaks through');
assert.match(chartsSource, /operationsMoneyAxisRange\(source\.map\(row => row\.revenue\), \{ defaultMax: 500000 \}/, 'coach matrix y axis should default to 0-50万 and expand when revenue breaks through');
assert.doesNotMatch(chartsSource, /buildOperationsCoachMatrixChartOption[\s\S]*markArea/, 'coach matrix should not paint pale background bands');
assert.match(chartsSource, /operationsCoachQuadrantColor\(row\.utilizationRate, row\.revenue, avgUtilization, avgRevenue\)/, 'coach matrix bubbles should color by the quadrant they land in');
assert.doesNotMatch(chartsSource, /buildOperationsCoachMatrixChartOption[\s\S]*健康线 75%/, 'coach matrix should not show the old 75% health marker');
assert.match(chartsSource, /buildOperationsCoachMatrixChartOption[\s\S]*xAxis: avgUtilization[\s\S]*formatter: '均值'[\s\S]*yAxis: avgRevenue[\s\S]*formatter: '均值'/, 'coach matrix should show compact Gemini-style average crosshair lines');
assert.match(chartsSource, /const utilizationAxis = operationsPercentAxisRange\([\s\S]*utilizationRate/, 'coach matrix x axis should fit current utilization data');
assert.match(chartsSource, /const revenueAxis = operationsMoneyAxisRange\([\s\S]*row\.revenue/, 'coach matrix y axis should fit current revenue data');
assert.match(chartsSource, /max: utilizationAxis\.max[\s\S]*interval: utilizationAxis\.interval/, 'coach matrix x axis should use the dynamic utilization range');
assert.match(chartsSource, /const hasRevenue = source\.some\(row => \(Number\(row\.revenue\) \|\| 0\) > 0\)[\s\S]*const revenueLabel = value => hasRevenue[\s\S]*max: revenueAxis\.max[\s\S]*interval: revenueAxis\.interval[\s\S]*formatter: revenueLabel/, 'coach matrix y axis should use the dynamic revenue range and hide negative visual padding labels');
assert.doesNotMatch(chartsSource, /buildOperationsCoachMatrixChartOption[\s\S]*name: '归属实收'[\s\S]*seriesName: '教练经营位置'/, 'coach matrix should not reserve left gutter for a vertical y-axis title');
assert.doesNotMatch(chartsSource, /buildOperationsCoachMatrixChartOption[\s\S]*name: '工时利用率'[\s\S]*yAxis:/, 'coach matrix should not reserve bottom space for an x-axis title');
assert.match(chartsSource, /工时利用率：\$\{fmt\(row\.utilizationRate \|\| 0\)\}%[\s\S]*可排\/已排：\$\{fmt\(row\.availableHours \|\| 0\)\} \/ \$\{fmt\(row\.usedHours \|\| 0\)\} 小时[\s\S]*归属课程实收：¥\$\{fmt\(row\.revenue \|\| 0\)\}/, 'coach matrix hover should only show the approved fields');
assert.match(chartsSource, /体验课转化率：\$\{fmt\(row\.trialConversionRate \|\| 0\)\}%[\s\S]*老客续费率：\$\{fmt\(row\.renewalRate \|\| 0\)\}%/, 'coach capability hover should only show conversion and renewal rates');
assert.match(chartsSource, /function operationsCoachCapabilityColor[\s\S]*trial >= 50 && renewal >= 50[\s\S]*trial < 50 && renewal >= 50[\s\S]*trial < 50 && renewal < 50/, 'coach capability matrix should color bubbles by 50/50 quadrants');
assert.match(chartsSource, /const maxSample = Math\.max\(1,[\s\S]*trialBase[\s\S]*oldCustomerBase/, 'coach capability bubble size should follow effective sample size');
assert.doesNotMatch(chartsSource, /buildOperationsCoachCapabilityChartOption[\s\S]*markArea/, 'coach capability matrix should not paint background quadrants');
[
  'buildOperationsChannelQualityChartOption',
  'buildOperationsCourtQuadrantChartOption',
  'buildOperationsCoachMatrixChartOption'
].forEach(name => {
  assert.match(chartsSource, new RegExp(`function ${name}\\([\\s\\S]*buildStandardBusinessBubbleMatrixChartOption`), `${name} should use the shared business bubble matrix base`);
});
assert.match(chartsSource, /function buildOperationsCoachCapabilityChartOption\([\s\S]*buildStandardQuadrantBubbleMatrixChartOption/, 'coach capability matrix should use the shared quadrant bubble matrix base');
assert.doesNotMatch(operationsSource, /function renderOperationsCoachUtilizationBands|renderOperationsCoachUtilizationBands\(/, 'coach utilization distribution renderer should be removed with the card');
assert.doesNotMatch(operationsSource, /renderStandardChart\('operationsCoachUtilizationBandsChart'/, 'coach utilization distribution should not use the old ECharts bar chart renderer');
assert.match(chartsSource, /type:\s*'scatter'/, 'court comparison should render as a scatter bubble chart');
assert.match(chartsSource, /markLine[\s\S]*平均利用率[\s\S]*平均收入/, 'court quadrant should show average lines for business positioning');
assert.match(chartsSource, /symbolSize[\s\S]*bookingCount/, 'court quadrant bubble size should express booking count');
assert.match(chartsSource, /operationsCourtQuadrantColor\(row, utilizationAxis\)/, 'court quadrant bubbles should use the same current x-axis interval color as the background band');
assert.match(chartsSource, /function operationsMatrixGrid\(/, 'bubble matrices should share one grid padding helper');
assert.match(chartsSource, /operationsMatrixGrid\(\{/, 'bubble matrices should use the shared measured grid helper');
assert.doesNotMatch(chartsSource, /function operationsMatrixGrid\(\) \{\s*return \{[^}]*right: 44[^}]*bottom: 42/, 'bubble matrices should not keep the old oversized right and bottom gutters');
assert.match(chartsSource, /const utilizationAxis = operationsPercentAxisRange\([\s\S]*utilizationRate/, 'court quadrant x axis should fit current utilization data');
assert.match(chartsSource, /const revenueAxis = operationsMoneyAxisRange\([\s\S]*bookingAmount/, 'court quadrant y axis should fit current revenue data');
assert.match(chartsSource, /operationsPercentAxisRange\(source\.map\(row => row\.utilizationRate\), \{ defaultMax: 50, max: 100 \}/, 'court quadrant x axis should default to 0-50% and expand when utilization breaks through');
assert.match(chartsSource, /const utilizationLabel = value => `\$\{fmt\(value\)\}%`[\s\S]*max: utilizationAxis\.max[\s\S]*interval: utilizationAxis\.interval[\s\S]*formatter: utilizationLabel/, 'court quadrant x axis should use the dynamic utilization range');
assert.match(chartsSource, /const revenueLabel = value => `\$\{fmt\(value \/ 10000\)\}万`[\s\S]*max: revenueAxis\.max[\s\S]*interval: revenueAxis\.interval[\s\S]*formatter: revenueLabel/, 'court quadrant y axis should use the dynamic revenue range');
assert.doesNotMatch(chartsSource, /max: 1000000[\s\S]*interval: 200000[\s\S]*formatter: value => `\$\{fmt\(value \/ 10000\)\}万`/, 'court quadrant y axis should not be fixed at 100万');
assert.doesNotMatch(chartsSource, /buildOperationsCourtQuadrantChartOption[\s\S]*name: '订场收入'[\s\S]*seriesName: '校区经营位置'/, 'court quadrant should not reserve left gutter for a vertical y-axis title');
assert.doesNotMatch(chartsSource, /buildOperationsCourtQuadrantChartOption[\s\S]*name: '场地利用率'[\s\S]*yAxis:/, 'court quadrant should not reserve bottom space for an x-axis title');
assert.match(chartsSource, /operationsCourtBandFills[\s\S]*'#FFF1F2'[\s\S]*'#FFFBEB'[\s\S]*'#EFF6FF'[\s\S]*'#ECFDF5'/, 'court quadrant background should use pale capability-style fill colors');
assert.match(chartsSource, /operationsAxisBandMarkAreas\(utilizationAxis, operationsCourtBandFills\)/, 'court quadrant should fill each current x-axis interval with pale background bands');
assert.match(chartsSource, /const source = rawRows\.filter\(row => row\.hasData\)/, 'court quadrant should only plot campuses that already have data');
assert.doesNotMatch(chartsSource, /label: \{ color: row\.hasData \?/, 'court quadrant should not style or label no-data campuses in the plot');
assert.match(chartsSource, /position: 'inside'/, 'court quadrant should put campus names inside bubbles');
assert.match(chartsSource, /operationsCourtBubbleLabelSize[\s\S]*fontSize: operationsCourtBubbleLabelSize/, 'court quadrant should adapt campus label size by bubble size');
assert.match(stylesSource, /operations-funnel-row:hover \.operations-funnel-node/, 'custom funnel should have visible hover interaction');
assert.match(stylesSource, /operations-channel-ranking-row:hover[\s\S]*background/, 'channel ranking rows should have visible hover interaction');
assert.match(stylesSource, /operations-attribute-card:hover[\s\S]*transform:translateY/, 'attribute cards should have visible hover interaction');
assert.match(stylesSource, /operations-court-top-grid\{display:grid;grid-template-columns:minmax\(0,1\.65fr\) minmax\(320px,\.9fr\);gap:14px\}/, 'court quadrant should get the primary visual area beside a ranking matrix');
assert.match(stylesSource, /operations-court-top-grid \.operations-section\{min-height:380px;padding:18px;overflow:hidden\}/, 'court top cards should have enough height for a professional dashboard chart');
assert.match(stylesSource, /#page-operations\{[^}]*background:var\(--shell-app-bg\)/, 'operations content area should inherit the global shell background');
assert.doesNotMatch(stylesSource, /#page-operations\{[^}]*--ops-page-bg|background:var\(--ops-page-bg\)|background:#855B3C/, 'operations page must not override the global top/sidebar/content background palette');
assert.match(stylesSource, /operations-section\{[^}]*background:#FBF7F4[^}]*padding:18px/, 'operations cards should use the requested surface and padding');
assert.match(stylesSource, /operations-module-head h3\{[^}]*color:#887565[^}]*font-size:15px[^}]*font-weight:700/, 'operations module titles should use the requested title style');
assert.match(stylesSource, /operations-module-head>div:first-child>span\{[^}]*display:none/, 'operations module subtitles should be visually removed without hiding title legends');
assert.match(stylesSource, /operations-court-ranking-matrix/, 'court overview should render as a dashboard ranking matrix');
assert.match(stylesSource, /operations-court-comparison-chart\{height:296px;min-height:296px\}/, 'court quadrant chart should have enough vertical room');
assert.match(stylesSource, /operations-court-ranking-card\{[^}]*display:flex;flex-direction:column/, 'ranking cards should use a visual dashboard card layout');
assert.match(stylesSource, /operations-court-ranking-facts\{[^}]*display:grid;grid-template-columns:repeat\(2,minmax\(0,1fr\)\)/, 'ranking cards should show revenue and hours as support facts');
assert.match(stylesSource, /operations-court-status-badge/, 'ranking matrix should expose business status badges');
assert.match(stylesSource, /operations-rate-cell strong\{[^}]*font-size:12px[^}]*font-weight:400/, 'court overview progress numbers should use 12px normal text');
assert.doesNotMatch(stylesSource, /@media\(max-width:1500px\)\{[\s\S]*operations-court-top-grid\{grid-template-columns:1fr\}/, 'court comparison and overview should stay side by side on normal desktop widths');
assert.doesNotMatch(stylesSource, /operations-court-overview-table/, 'court overview should no longer use a table shell');
assert.match(stylesSource, /operations-court-heat-cell:hover[\s\S]*transform:translateY[\s\S]*box-shadow[\s\S]*z-index/, 'court heat cells should lift and highlight on hover');
assert.match(stylesSource, /operations-court-heat-floating-tooltip\{[\s\S]*position:fixed[\s\S]*pointer-events:none/, 'court heat cells should use a floating custom tooltip instead of the browser title bubble');
assert.match(operationsSource, /function bindOperationsHeatTooltips\(\)[\s\S]*mouseenter[\s\S]*mousemove[\s\S]*mouseleave/, 'court heat tooltip should be bound after render and follow hovered cells');
assert.match(stylesSource, /operations-court-heat-scroll\{[^}]*scrollbar-width:none/, 'court heatmap horizontal scroll should stay usable with an invisible scrollbar');
assert.match(stylesSource, /operations-court-heat-scroll::-webkit-scrollbar\{display:none\}/, 'court heatmap should hide the WebKit scrollbar track');
assert.match(stylesSource, /operations-court-heatmap-card\{gap:12px;background:#FBF7F4;border-color:#E3E8F2\}/, 'court heatmap should share the requested dashboard card surface as the top charts');
assert.match(stylesSource, /operations-court-heatmap-card \.operations-module-head\{margin-bottom:8px;padding-bottom:0\}/, 'court heatmap header should not render title divider spacing');
assert.match(stylesSource, /operations-court-heat-campus-tabs\{[^}]*padding:4px[^}]*background:#F8FAFC/, 'court heatmap tabs should use a restrained segmented-control style');
assert.match(stylesSource, /operations-court-heat-hour\{[^}]*font-size:10px/, 'court heatmap hour labels should be 10px');
assert.match(stylesSource, /operations-court-heat-cell\{[^}]*height:24px/, 'court heatmap cells should be compact and aligned with the dashboard style');
assert.match(stylesSource, /operations-court-heat-legend\{[^}]*gap:16px[^}]*padding-top:12px[^}]*font-size:11px/, 'court heatmap legend should be smaller and tighter');
assert.match(stylesSource, /operations-court-heat-legend i\{[^}]*width:14px[^}]*height:14px/, 'court heatmap legend squares should be smaller');
assert.match(stylesSource, /operations-court-heat-kpis div\{[^}]*display:flex[^}]*min-height:52px/, 'court heatmap KPI blocks should be compact horizontal metric bars');
assert.match(stylesSource, /operations-court-empty-heat/, 'empty campus heatmaps should render a clear empty state instead of blank space');
assert.match(stylesSource, /\.operations-page\{display:flex;flex-direction:column;gap:16px;background:transparent;border-radius:0;padding:0/, 'operations page should not render an extra large outer background frame');
assert.match(stylesSource, /operations-court-skeleton-grid\{display:grid;grid-template-columns:repeat\(2,minmax\(0,1fr\)\);gap:14px\}/, 'court loading skeleton should match the real court layout');
assert.match(stylesSource, /operations-funnel-node strong\{[^}]*font-size:14px[^}]*font-weight:800/, 'funnel step labels should sit inside the stage node with clear weight');
assert.match(operationsSource, /renderStandardChart/, 'operations page should use standard chart wrapper');
assert.match(operationsSource, /renderOperationsOverview[\s\S]*operations-kpi-row[\s\S]*收入结构图[\s\S]*现金与核销关系[\s\S]*教练经营效率[\s\S]*场地经营效率[\s\S]*转化留存风险[\s\S]*经营问题优先级/, 'overview page should render KPI cards directly before the chart cards');
assert.doesNotMatch(operationsSource, /公司经营总盘|转化与留存数据中心/, 'operations data cards should not sit inside a top title/subtitle command card');
assert.doesNotMatch(operationsSource, /operationsOverviewFunnel/, 'overview should not duplicate the conversion page funnel');
assert.match(operationsSource, /renderStandardChart\('operationsOverviewRevenueMixChart'[\s\S]*buildStandardPieChartOption/, 'overview revenue mix should render as a chart instead of a table-like bar list');
assert.match(operationsSource, /renderStandardChart\('operationsOverviewCashChart'[\s\S]*buildOperationsOverviewCashChartOption/, 'overview cash and recognition should render as a dedicated chart');
assert.match(operationsSource, /renderStandardChart\('operationsOverviewCoachMatrixChart'[\s\S]*buildOperationsCoachMatrixChartOption/, 'overview should reuse the coach efficiency matrix for global coach status');
assert.match(operationsSource, /renderStandardChart\('operationsOverviewCourtQuadrantChart'[\s\S]*buildOperationsCourtQuadrantChartOption/, 'overview should reuse the court quadrant chart for global venue status');
assert.match(operationsSource, /function operationsOverviewCourtSummary[\s\S]*data\.court\?\.cards[\s\S]*bookingAmount[\s\S]*bookingCount[\s\S]*utilizationRate/, 'overview court summary should reuse operations.court.cards from the court dashboard');
assert.match(operationsSource, /renderOperationsOverview[\s\S]*operationsOverviewCourtSummary\(data\)/, 'overview should embed the unified court summary instead of recalculating court metrics');
assert.match(chartsSource, /function buildOperationsOverviewCashChartOption[\s\S]*已入账[\s\S]*未入账[\s\S]*待履约/, 'standard charts should expose a cash-recognition chart for the overview');
assert.match(operationsSource, /renderProgressFunnel/, 'conversion page should use the Gemini-style progress funnel component');
assert.match(operationsSource, /renderOperationsCourtComparison[\s\S]*校区收入 x 场地利用率/, 'court page should render a business quadrant chart');
assert.match(operationsSource, /renderOperationsCourtCampusOverview[\s\S]*校区指标排行/, 'court page should render the ranking matrix');
assert.match(operationsSource, /const rows = data\.court\?\.campusRows \|\| \[\]/, 'court overview should render campus rows');
assert.match(operationsSource, /operationsCourtRankingRows[\s\S]*operationsCourtHeatCampusTabs[\s\S]*朝珺私教/, 'court ranking should reuse heatmap campus order and filter private training campus');
assert.match(courtOverviewSource, /const sortedRows = operationsCourtRankingRows\(rows\)/, 'court ranking should render in the heatmap campus order');
assert.match(operationsSource, /renderOperationsCourtKpis[\s\S]*订场收入[\s\S]*订场小时[\s\S]*场地利用率[\s\S]*黄金时段利用率[\s\S]*非黄金时段利用率/, 'court page should render five top KPI cards for the approved venue metrics');
assert.doesNotMatch(operationsSource, /function operationsShouldShowTrend\(\)[\s\S]*range\?\.startDate && range\.startDate === range\.endDate/, 'operations KPI cards should not hide real backend trends just because the selected filter is one day');
assert.match(operationsSource, /function operationsCourtTrendValues[\s\S]*return values\.length \? values : \[\]/, 'court KPI cards should render real backend trend points when present');
assert.doesNotMatch(operationsSource, /return value \? \[value, value\] : \[\]/, 'court KPI cards must not fake a flat trend from the current value');
assert.match(operationsSource, /function operationsCourtSparklineSvg[\s\S]*operationsKpiSparklineSvg[\s\S]*operations-court-kpi-sparkline/, 'court KPI cards should reuse the shared professional inline sparkline with hover point context');
assert.match(operationsSource, /operations-court-ranking-card[\s\S]*场地利用率 = 已用小时 \/ 可用小时[\s\S]*已用 \$\{fmt\(bookingHours\)\} 小时 \/ 可用约 \$\{fmt\(capacityHours\)\} 小时[\s\S]*平均每小时收入/, 'court ranking should explain the primary utilization number with numerator and denominator');
assert.doesNotMatch(operationsSource, /operationsRankingMetric\('体验转化'|operationsRankingMetric\('老客转化'/, 'court ranking should not repeat conversion progress bars in the right-side card');
assert.match(operationsSource, /operations-court-ranking-campus[\s\S]*场地利用率 = 已用小时 \/ 可用小时[\s\S]*operations-court-ranking-rate/, 'court ranking should explain that the primary number is utilization');
assert.doesNotMatch(operationsSource, /status\.label \? `<span class="operations-court-status-badge/, 'court ranking should not render business status badges like core benchmark');
assert.doesNotMatch(operationsSource, /待录入/, 'operations court dashboard should not render pending-input labels');
assert.match(operationsSource, /\{ height: 296 \}/, 'court comparison render height should match the quadrant chart CSS height');
assert.doesNotMatch(courtOverviewSource, /片场地|次使用|venueCount|usageCount/, 'court overview should only show the requested fields');
assert.match(operationsSource, /renderOperationsCourtHeatmap[\s\S]*校区热力看板/, 'court page should render the renamed heatmap board');
assert.match(operationsSource, /operationsCourtHeatCampusTabs[\s\S]*顺义马坡[\s\S]*朝阳十里堡[\s\S]*蓝色港湾[\s\S]*国网[\s\S]*朝珺私教/, 'court heatmap should expose campus tabs with the requested default campus order');
assert.match(operationsSource, /operationsActiveCourtHeatCampus\s*=\s*'顺义马坡'/, 'court heatmap should default to Shunyi Mapo');
assert.match(operationsSource, /setOperationsCourtHeatCampus\(campusName\)/, 'court heatmap campus tabs should switch inside the shared heatmap card');
assert.doesNotMatch(operationsSource, /operationsHelpMark|operations-help-mark|\?<\/span>/, 'court modules should not render question mark help icons');
assert.doesNotMatch(courtOverviewSource, /operationsSimpleTable/, 'court overview should not use the standard table component');
assert.match(operationsSource, /operations-court-ranking-matrix[\s\S]*operations-court-ranking-card/, 'court overview should render as one-card-per-active-campus ranking board');
assert.match(operationsSource, /renderOperationsCourt[\s\S]*renderOperationsCourtKpis[\s\S]*operations-court-top-grid[\s\S]*renderOperationsCourtComparison[\s\S]*renderOperationsCourtCampusOverview[\s\S]*renderOperationsCourtHeatmaps/, 'court KPI cards should render before the comparison and heatmap');
assert.match(operationsSource, /renderOperationsLoading[\s\S]*renderStandardPageSkeleton[\s\S]*operations-court-skeleton-grid/, 'court loading skeleton should use the global skeleton renderer with the court layout');
assert.match(operationsSource, /renderOperationsLoading[\s\S]*renderStandardPageSkeleton[\s\S]*operations-coach-kpi-strip[\s\S]*operations-coach-hero-grid[\s\S]*operations-coach-secondary-grid/, 'coach loading skeleton should use the global skeleton renderer with the real coach dashboard layout');
assert.match(operationsSource, /renderOperationsCourtHeatCell\(slot = \{\}, venue = \{\}, options = \{\}\)/, 'court heat cell should receive venue context and row options for hover detail');
assert.match(operationsSource, /slot\.heatRate[\s\S]*operationsCourtHeatStyle\(toneRate, usedMinutes\)/, 'court heat cell color should use a continuous relative heat scale while keeping true utilization in the label');
assert.doesNotMatch(operationsSource, /data-utilization|data-load|data-used-minutes/, 'court heat cell should not expose internal debug data attributes');
assert.match(operationsSource, /operationsCourtHeatNextHour\(hour\)/, 'court heat tooltip should show a half-hour time range');
assert.match(operationsSource, /inferredCapacity[\s\S]*capacityMinutes[\s\S]*occupiedText[\s\S]*dayText/, 'court heat tooltip should avoid showing zero denominators when the API provides utilization but omits numerator fields');
assert.match(operationsSource, /data-tip="\$\{esc\(label\)\}"/, 'court heat tooltip should render usage detail from a data attribute with numerator/denominator');
assert.match(operationsSource, /operationsCourtHeatVenueName[\s\S]*legacyUnmatchedVenueNames[\s\S]*未匹配/, 'court heatmap should normalize legacy unmatched names at render time');
assert.match(operationsSource, /aria-label="[^"]*\$\{esc\(venueName\)\}[\s\S]*\$\{esc\(hour\)\}-\$\{esc\(endHour\)\}[\s\S]*\$\{fmt\(rate\)\}%[\s\S]*使用时长 \$\{fmt\(usedMinutes\)\} \/ \$\{fmt\(capacityMinutes\)\}分钟/, 'court heat cell should expose venue, time range, utilization and occupied minutes for hover/accessibility');
assert.doesNotMatch(operationsSource, /title="\$\{esc\(label\)\}"/, 'court heat cell should not rely on the browser native tooltip');
assert.doesNotMatch(operationsSource, /data-utilization="\$\{fmt\(rate\)\}"/, 'court heat cell should not expose utilization debug data');
assert.match(operationsSource, /operations-court-empty-heat[\s\S]*暂无启用场地/, 'campus heatmap should show a clear empty state when no active venues exist');
assert.match(operationsSource, /operationsCourtHeatTone\(value, minutes = 0\)[\s\S]*usedMinutes > 0[\s\S]*return 'low'/, 'court heatmap should show any occupied slot as low load instead of looking empty');
assert.match(operationsSource, /黄金时段利用率[\s\S]*非黄金时段利用率/, 'court heatmap should expose golden and off-peak utilization rates');
assert.match(operationsSource, /grid-template-columns:86px repeat[\s\S]*minmax\(0, 1fr\)/, 'court heatmap time cells should stretch to align with the KPI blocks');
assert.match(operationsSource, /空闲[\s\S]*低利用[\s\S]*中等[\s\S]*健康[\s\S]*高热/, 'court heat legend should use the approved five-level labels');
assert.doesNotMatch(operationsSource, /历史未匹配场地/, 'court heatmap UI should rename historical unmatched venues to unmatched');
assert.doesNotMatch(operationsSource, /场地使用排行/, 'court page should remove the old venue ranking card');
assert.doesNotMatch(operationsSource, /场地时段热力/, 'court page should remove the old single heatmap chart card');
assert.doesNotMatch(operationsSource, /operationsFallbackCourseRows/, 'conversion page must not fabricate course rows from summary data');
assert.doesNotMatch(operationsSource, /courseFunnel: data\.conversion\?\.courseFunnel/, 'conversion page must not keep the legacy courseFunnel fallback when no local filter is active');
assert.match(operationsSource, /function operationsConversionView\(data\)[\s\S]*standardLifecycleMetrics:\s*data\.conversion\?\.standardLifecycleMetrics/, 'conversion page should pass backend standard metrics directly without local filter views');
assert.doesNotMatch(operationsSource, /standard\.funnels\?\.courseChain \|\| conversion\.courseFunnel/, 'conversion funnels must not fall back to the legacy courseFunnel');
assert.doesNotMatch(operationsSource, /echarts\.init/, 'operations page should not initialize ECharts directly');
assert.doesNotMatch(operationsSource, /schedule-detail-tabs|schedule-detail-tab/, 'operations page should not reuse schedule detail tabs as its top navigation');
assert.doesNotMatch(operationsSource, /operationsTabsHtml|operations-tabs|operations-tab/, 'operations page should not render page-level horizontal tabs');
assert.match(operationsSource, /renderConversionCommandCenter[\s\S]*operations-conversion-kpi-row/, 'conversion page should render trend KPI cards without an extra title card');
assert.doesNotMatch(operationsSource, /function renderConversionCommandCenter[\s\S]*operations-loss-summary[\s\S]*function renderConversionInsightModule/, 'conversion page should not duplicate the worst-loss insight above the funnel');
assert.match(operationsSource, /operationsConversionKpiCards[\s\S]*线索数[\s\S]*历史学员[\s\S]*在期学员[\s\S]*上过体验课[\s\S]*体验后买正式课/, 'conversion page should render the same top KPI cards as lead and student pages');
assert.match(functionBody(operationsSource, 'operationsConversionKpiCards'), /metricCard\('validLeads', '线索数', '条', 'validLeads'/, 'lead KPI sparkline must use the unified validLeads trend key');
assert.doesNotMatch(functionBody(operationsSource, 'operationsConversionKpiCards'), /'线索数', '条', 'leads'/, 'lead KPI sparkline must not keep the old local leads trend key');
assert.doesNotMatch(operationsSource, /operationsConversionKpiCards[\s\S]*待转化体验学员/, 'conversion page should remove the pending trial-student KPI card from the top row');
assert.doesNotMatch(operationsSource, /operationsConversionKpiCards[\s\S]*课程成交率/, 'conversion page should not show course deal rate when it duplicates total deal rate');
assert.doesNotMatch(operationsSource, /operationsConversionKpiCards[\s\S]*预约率[\s\S]*到课率[\s\S]*成交率[\s\S]*续费率/, 'conversion page should not keep the legacy five-step local KPI formula');
assert.match(operationsSource, /function renderOperationsConversionKpi[\s\S]*operations-court-kpi[\s\S]*operationsConversionSparklineSvg/, 'conversion top KPI cards should reuse the court dashboard trend-card standard');
assert.match(operationsSource, /function operationsTrendToday[\s\S]*activeGlobalDateRange[\s\S]*new Date/, 'operations trend helpers should resolve a real today boundary for all dashboards');
assert.match(operationsSource, /operationsMatrixTitleLegend\('工时利用率', '归属实收', '课数'/, 'coach matrices should show x axis, y axis and bubble-size copy in the title bar');
assert.match(operationsSource, /校区收入 x 场地利用率/, 'court quadrant card should use the requested chart name');
assert.match(operationsSource, /operationsMatrixTitleLegend\('场地利用率', '订场收入', '订场次数'/, 'court matrices should show x axis, y axis and bubble-size copy in the title bar');
assert.match(operationsSource, /operationsMatrixTitleLegend\('体验转化率', '老客续费率', '样本量'/, 'capability matrix should show x axis, y axis and bubble-size copy in the title bar');
assert.match(operationsSource, /X轴：\$\{esc\(xAxis\)\}[\s\S]*Y轴：\$\{esc\(yAxis\)\}[\s\S]*圆点大小 = \$\{esc\(bubble\)\}/, 'matrix title legend should render axis meanings outside the plot');
assert.match(stylesSource, /operations-coach-title-legend i\{[^}]*width:10px[^}]*height:10px[^}]*border-radius:50%/, 'matrix legend marker should be a dot instead of a long rectangle');
assert.match(operationsSource, /function operationsTrendComparisonForDisplay[\s\S]*points[\s\S]*length >= 2[\s\S]*mode: 'none'/, 'single-day operation ranges should hide misleading previous-period change text');
assert.doesNotMatch(operationsSource, /function operationsBuildConversionTrendRows/, 'conversion trend rows should be generated by the backend instead of being rebuilt in the browser');
assert.match(operationsSource, /trendRows:\s*data\.conversion\?\.trends \|\| \[\]/, 'conversion view should use backend-generated trend rows');
assert.doesNotMatch(operationsSource, /function operationsBuildCourseFunnel|function operationsBuildSourceRanking|function operationsBuildChannelEfficiencyRows|function operationsBuildAttributeRows/, 'conversion filtered views should not rebuild standard metrics in the browser');
assert.doesNotMatch(operationsSource, /function operationsConversionTrendPoints[\s\S]*Math\.min\(\.\.\.values\)[\s\S]*Math\.max\(\.\.\.values\)[\s\S]*return \[\]/, 'conversion KPI sparklines should draw real flat trends instead of hiding them');
assert.match(operationsSource, /function operationsConversionTrendPoints[\s\S]*return points/, 'conversion KPI sparklines should return real backend trend points whenever at least one point exists');
assert.match(operationsSource, /function operationsOverviewTrendPoints[\s\S]*return points\.length \? points : \[\]/, 'overview KPI sparklines should keep a single real trend point instead of rendering an empty card bottom');
assert.match(operationsSource, /function operationsKpiSparklineSvg[\s\S]*drawablePoints[\s\S]*list\.length === 1[\s\S]*\.\.\.list\[0\]/, 'KPI sparklines should draw a horizontal line when only one real trend point exists');
assert.doesNotMatch(operationsSource, /function operationsTrendPointsWithFallback[\s\S]*fallbackValue[\s\S]*operationsTrendToday\(\)/, 'KPI sparklines should not fake a trend from the current metric when backend trend rows are empty');
assert.match(operationsSource, /renderOperationsOverviewKpis[\s\S]*trendValue:[\s\S]*totalIncome[\s\S]*trendPoints: operationsTrendPointsWithFallback\(trends, card\.trendKey\)/, 'overview KPI cards should only use backend trend rows');
assert.match(operationsSource, /renderConversionCommandCenter[\s\S]*trendValue:[\s\S]*card\.trendValue[\s\S]*trendPoints: operationsTrendPointsWithFallback\(conversion\.trendRows \|\| \[\], card\.trendKey\)/, 'conversion KPI cards should only use backend trend rows');
const topKpiRenderCases = [
  {
    name: 'overview',
    html: operationsRuntime.renderOperationsOverviewKpis(operationsKpiSample),
    cardClass: 'operations-court-kpi',
    expectedCount: 5,
    labels: ['总收入', '入账流水', '待履约余额', '成交笔数', '场地利用率'],
    values: ['¥993.3K', '¥672.5K', '¥320.8K', '1392', '9']
  },
  {
    name: 'court',
    html: operationsRuntime.renderOperationsCourtKpis(operationsKpiSample),
    cardClass: 'operations-court-kpi',
    expectedCount: 5,
    labels: ['订场收入', '订场小时', '场地利用率', '黄金时段利用率', '非黄金时段利用率'],
    values: ['¥188K', '320', '9', '16', '5']
  },
  {
    name: 'conversion',
    html: operationsRuntime.renderConversionCommandCenter(operationsKpiSample, operationsRuntime.operationsConversionView(operationsKpiSample)),
    cardClass: 'operations-court-kpi',
    expectedCount: 5,
    labels: ['线索数', '历史学员', '在期学员', '上过体验课', '体验后买正式课'],
    values: ['268', '118', '42', '78', '32']
  },
  {
    name: 'coach',
    html: operationsRuntime.renderOperationsCoach(operationsKpiSample),
    cardClass: 'operations-coach-kpi',
    expectedCount: 5,
    labels: ['在岗教练', '工时利用率', '归属课程实收', '体验课转化率', '老客续费率'],
    values: ['6', '58%', '¥88K', '45%', '36%']
  }
];
topKpiRenderCases.forEach(testCase => {
  assert.strictEqual(countClass(testCase.html, testCase.cardClass), testCase.expectedCount, `${testCase.name} top KPI row should render ${testCase.expectedCount} cards`);
  testCase.labels.forEach(label => assert.match(testCase.html, new RegExp(label.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')), `${testCase.name} top KPI should render ${label}`));
  testCase.values.forEach(value => assert.match(testCase.html, new RegExp(value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')), `${testCase.name} top KPI should render non-zero value ${value}`));
  assert.doesNotMatch(testCase.html, /<strong>\s*(?:0|0%|¥0|NaN|undefined|null)\s*(?:<em>[^<]*<\/em>)?\s*<\/strong>/, `${testCase.name} top KPI cards should not render empty, zero or invalid primary values with healthy sample data`);
  assert.match(testCase.html, /operations-kpi-hover-point[\s\S]*width:[\s\S]*--point-x:[\s\S]*--point-y:/, `${testCase.name} KPI sparkline should render spatial hover bands that map to the nearest point`);
});
assert.match(stylesSource, /operations-kpi-hover-point\{[^}]*top:0[^}]*height:100%[^}]*transform:none/, 'KPI hover target should cover the full sparkline height instead of only the line point');
assert.match(stylesSource, /operations-kpi-hover-point:hover::before\{[^}]*left:var\(--point-x[^}]*top:var\(--point-y/, 'KPI hover highlight should stay on the current data point inside the spatial hover band');
assert.match(stylesSource, /operations-kpi-hover-point:hover::after\{[^}]*left:var\(--point-x[^}]*top:calc\(var\(--point-y/, 'KPI hover tooltip should anchor to the highlighted data point inside the spatial hover band');
assert.doesNotMatch(operationsSource, /function renderConversionCommandCenter[\s\S]*operations-filter-row[\s\S]*function renderConversionInsightModule/, 'conversion filters should not float above the KPI cards');
assert.match(chartsSource, /operations-funnel-transition[\s\S]*\$\{fmt\(transition\)\}%/, 'conversion funnel rows should focus on previous-step conversion rate');
assert.doesNotMatch(stylesSource, /operations-conversion-kpi-sparkline \.operations-kpi-dot\{opacity:1/, 'conversion KPI sparklines should not show every point marker by default');
assert.doesNotMatch(operationsSource, /function renderConversionInsightModule/, 'conversion page should move insight copy out of the conversion dashboard');
assert.match(operationsSource, /renderConversionFunnelModule[\s\S]*线索与学员漏斗[\s\S]*体验课上课漏斗[\s\S]*订场链漏斗[\s\S]*operations-conversion-funnel-grid/, 'conversion page should render three peer funnel cards in one row');
assert.match(functionBody(operationsSource, 'operationsFunnelRows'), /standard\.funnels\?\.trialLeadPath/, 'trial funnel should use the unified lead-to-trial-to-package backend funnel');
assert.doesNotMatch(functionBody(operationsSource, 'operationsFunnelRows'), /standard\.funnels\?\.trialPath[\s\S]*filter/, 'trial funnel must not keep the old two-step attended-to-formal local filter');
assert.doesNotMatch(operationsSource, /const moduleTitle = '转化漏斗'|<h3>\$\{moduleTitle\}<\/h3>|<h3>转化漏斗<\/h3>/, 'conversion page should not render the extra conversion funnel section title');
assert.doesNotMatch(operationsSource, /renderOperationsConversion[\s\S]*renderConversionRetentionModule/, 'conversion page should remove the retention trend module from the page');
assert.doesNotMatch(operationsSource, /operations-funnel-filter-row|operationsFilterDropdown\('operationsConversionSource'|operationsFilterDropdown\('operationsConversionCampus'|operationsFilterDropdown\('operationsConversionCoach'/, 'conversion funnel should not keep local source/campus/coach filters');
assert.doesNotMatch(operationsSource, /filteredViews|operationsConversionFilterViewKey|buildConversionFilteredViews/, 'conversion page should not expose locally filtered conversion read models');
assert.doesNotMatch(operationsSource, /留存趋势|人群画像|成交画像图/, 'conversion page should not render removed retention trend, people profile wrapper, or old deal profile title');
assert.match(operationsSource, /renderConversionChannelQualityModule[\s\S]*渠道质量象限图/, 'conversion page should render the channel quality chart as its own card');
assert.match(operationsSource, /renderConversionChannelActionModule[\s\S]*渠道动作表/, 'conversion page should render the channel action table as its own card');
assert.match(operationsSource, /operationsChannelQualityRows[\s\S]*高价值[\s\S]*待优化[\s\S]*低效[\s\S]*statusLabel/, 'channel efficiency should classify every channel with a compact business status tag');
assert.match(operationsSource, /operationsChannelQualityRows[\s\S]*sort\(\(a, b\) => b\.leads - a\.leads \|\| b\.dealConversionRate - a\.dealConversionRate/, 'channel ranking should prioritize higher lead volume, then better conversion');
assert.match(operationsSource, /operations-channel-quality-chart[\s\S]*id="operationsChannelQualityChart"/, 'channel efficiency should use a quadrant chart as the primary visual');
assert.match(operationsSource, /operations-channel-ranking-table[\s\S]*渠道[\s\S]*线索[\s\S]*成交[\s\S]*成交转化率[\s\S]*样本可信度[\s\S]*建议动作/, 'channel action table should use CRM action columns');
assert.doesNotMatch(operationsSource, /operationsBuildChannelGroups|operations-channel-group|operationsChannelCard/, 'channel efficiency should remove the old three-level grouped card layout');
assert.match(operationsSource, /col\.html/, 'operations simple table should allow trusted HTML cells for progress bars');
assert.doesNotMatch(operationsSource, /体验到课率/, 'channel efficiency table should not show attendance rate');
assert.match(operationsSource, /operationsMatrixTitleLegend\('成交转化率', '线索量', '成交人数'\)/, 'channel quality chart should show x axis, y axis and bubble-size copy in the title bar');
assert.match(channelQualityChartSource, /seriesName: '成交人数'[\s\S]*value: \[Number\(row\.dealConversionRate\) \|\| 0, Number\(row\.leads\) \|\| 0, deals\][\s\S]*symbolSize: value =>[\s\S]*value\?\.\[2\]/, 'channel quality chart should map x to deal conversion, y to leads, and bubble size to deals');
assert.match(channelQualityChartSource, /hoverStyle: 'subtle'/, 'channel quality chart should use the shared premium bubble hover standard');
assert.match(channelQualityChartSource, /operationsPremiumMatrixQuadrantColor\(row\.dealConversionRate, row\.leads, avgRate, avgLeads\)/, 'channel quality chart should reuse the shared quadrant color standard');
assert.match(channelQualityChartSource, /splitLine: \{ show: false \}/, 'channel quality chart should remove grid lines like the core matrix standard');
assert.match(channelQualityChartSource, /lineStyle: \{ color: '#D6D3D1', type: 'dashed', width: 1 \}/, 'channel quality chart should use the shared subtle average crosshair');
assert.match(channelQualityChartSource, /label:\s*\{[\s\S]*position: 'top'[\s\S]*color: '#57534E'/, 'channel quality chart should place labels above points like the core matrix standard');
assert.doesNotMatch(channelQualityChartSource, /position: 'inside'[\s\S]*color: '#FFFFFF'/, 'channel quality chart should not put white labels inside bubbles');
assert.match(stylesSource, /operations-channel-quality-chart\{height:360px;min-height:360px/, 'channel matrix should have a fixed professional panel height');
assert.match(stylesSource, /operations-channel-ranking-table\{[^}]*height:360px[^}]*overflow-y:auto/, 'channel ranking should match matrix height and scroll internally');
assert.match(operationsSource, /renderStandardChart\('operationsChannelQualityChart'[\s\S]*buildOperationsChannelQualityChartOption[\s\S]*renderer: 'svg'/, 'conversion charts should render the channel quality quadrant through the standard SVG wrapper');
assert.match(operationsSource, /operationsRateTone[\s\S]*<\s*40[\s\S]*danger/, 'conversion progress bars should show low rates in red');
assert.match(operationsSource, /renderConversionAttributeModule[\s\S]*转化画像图[\s\S]*留存画像图[\s\S]*operationsPersonaBars/, 'conversion page should render conversion and retention profile charts without a wrapper title');
assert.doesNotMatch(operationsSource, /留存\/续费风险榜[\s\S]*续费偏低/, 'conversion page should not render a text-heavy retention risk list');
assert.match(operationsMetricsSource, /profilePersonas[\s\S]*私教课[\s\S]*小班课/, 'student attributes should derive lesson demand tags in the backend metric model');
assert.match(operationsMetricsSource, /profilePersonas[\s\S]*未标注人群/, 'student attributes should keep the untagged fallback in the backend metric model');
assert.match(operationsSourceReadModel, /OPERATIONS_COACH_FIELDS = \[[^\]]*'sortOrder'/, 'operations page should fetch coach sortOrder so coach detail rows follow calendar order');
assert.match(operationsSourceReadModel, /OPERATIONS_SCHEDULE_FIELDS = \[[\s\S]*'feedbackId'[\s\S]*'feedbackAt'[\s\S]*'feedbackStatus'[\s\S]*'hasFeedback'/, 'operations page should fetch schedule feedback flags for coach detail feedback counts');
assert.doesNotMatch(operationsSource, /转化指标/, 'conversion page should remove the old conversion metrics header');
assert.doesNotMatch(operationsSource, /renderOperationsConversion[\s\S]{0,240}renderStandardDataCards/, 'conversion page should not render the old top four metric cards');
const coachDashboardSource = operationsSource.slice(
  operationsSource.indexOf('function renderOperationsCoach'),
  operationsSource.indexOf('function operationsRate(part')
);
assert.doesNotMatch(coachDashboardSource, /<h2>教练经营效率驾驶舱<\/h2>/, 'coach page should not render a separate command-center title above KPI cards');
assert.doesNotMatch(coachDashboardSource, /当前周期：[\s\S]*可排小时：/, 'coach page should not render the period text above KPI cards');
assert.match(coachDashboardSource, /operations-coach-hero-grid[\s\S]*operationsCoachMatrixChart[\s\S]*operationsCoachCapabilityChart/, 'coach page should place the conversion-renewal matrix next to the primary matrix');
assert.doesNotMatch(coachDashboardSource, /operations-coach-alert-panel|经营预警|operations-coach-alert-list/, 'coach page should remove the diagnostic alert card');
assert.match(coachDashboardSource, /operationsCoachMatrixChart[\s\S]*operationsCoachCapabilityChart[\s\S]*operationsCoachParetoChart[\s\S]*operationsCoachCourseMixChart/, 'coach page should place course mix beside the coach contribution ranking');
assert.doesNotMatch(coachDashboardSource, /利用率五档分布|operationsCoachUtilizationBandsChart/, 'coach page should remove the utilization distribution card');
assert.doesNotMatch(coachDashboardSource, /operations-coach-band-legend/, 'coach matrix should not render a separate utilization legend');
assert.match(coachDashboardSource, /const kpis = \[[\s\S]*归属课程实收[\s\S]*体验课转化率[\s\S]*老客续费率[\s\S]*operations-coach-kpi-strip/, 'coach page should render dedicated dashboard KPI strips instead of old generic cards');
assert.doesNotMatch(coachDashboardSource, /help:/, 'coach KPI cards should not define question-mark help text');
assert.match(coachDashboardSource, /operationsCoachChartHeader\('产值 × 工时利用率矩阵'[\s\S]*operationsCoachChartHeader\('转化 × 续费能力矩阵'/, 'coach chart headers should use compact title-only headers');
assert.doesNotMatch(coachDashboardSource, /横轴越右越饱和|只在有体验\/续费基数时展示|柱子是归属实收|看团队整体是闲置|体验课、私教课、小班课按课时拆分/, 'coach chart cards should not render subtitles under titles');
assert.match(coachDashboardSource, /renderOperationsCoachDetailTable\(rows\)/, 'coach page should render the coach workload detail table at the bottom');
assert.match(coachDashboardSource, /教练课时详细统计[\s\S]*教学课时\/人数[\s\S]*体验课转化[\s\S]*课程结构（课时）[\s\S]*课程反馈（课次）[\s\S]*校区结构（课时）/, 'coach detail table should use the compact coach metric columns');
assert.match(coachDashboardSource, /<colgroup>[\s\S]*width:12%[\s\S]*width:14%[\s\S]*width:10%[\s\S]*width:22%[\s\S]*width:10%[\s\S]*width:32%[\s\S]*<\/colgroup>/, 'coach detail table should use proportional non-pixel columns that give long text more room');
assert.doesNotMatch(stylesSource, /operations-coach-detail-table[\s\S]*th:nth-child\(\d+\)\{width:/, 'coach detail table should distribute columns evenly instead of hardcoding individual column widths');
assert.doesNotMatch(coachDashboardSource, /<th>体验转化率<\/th>/, 'coach detail table should not render trial conversion rate as a separate column');
assert.doesNotMatch(coachDashboardSource, /已反馈|未反馈|时间段/, 'coach detail table should merge feedback columns and remove time-band distribution');
assert.match(operationsSource, /function operationsCoachUsedHoursCell[\s\S]*teachingStudentCount[\s\S]*\$\{fmt\(teachingHours\)\} \/ \$\{fmt\(teachingStudentCount\)\}[\s\S]*operationsCoachDetailChangeText\(row\.usedHoursComparison\)/, 'coach detail table should show teaching hours and unique student count with spaced slash formatting');
assert.doesNotMatch(operationsSource, /function operationsCoachDetailChangeText[\s\S]*较上期[\s\S]*function operationsCoachUsedHoursCell/, 'coach detail lesson-hour change should omit previous-period label in the compact table');
assert.doesNotMatch(operationsSource, /const icon = change > 0 \? '↑' : '↓'/, 'coach detail lesson-hour change should not use raw text arrows');
assert.match(operationsSource, /function operationsCoachDetailTrendIcon[\s\S]*operations-coach-detail-icon/, 'coach detail lesson-hour change should render a standard inline icon');
assert.match(operationsSource, /function operationsCoachFeedbackText[\s\S]*feedbackCompleted[\s\S]*feedbackRequired[\s\S]* \/ \$\{fmt\(required\)\}/, 'coach detail table should render feedback as completed over required with spaced slash formatting');
assert.match(operationsSource, /function operationsCoachTrialConversionText[\s\S]*trialConverted[\s\S]*trialBase[\s\S]*trialConversionRate[\s\S]*\$\{fmt\(converted\)\} \/ \$\{fmt\(total\)\} \$\{fmt\(rate\)\}%/, 'coach detail table should render trial conversion as converted over total with rate and spaced slash formatting');
assert.match(operationsRuntime.operationsCoachUsedHoursCell({ teachingHours: 5, teachingStudentCount: 8, usedHoursComparison: { mode: 'previous_period', changeValue: -4 } }), /5 \/ 8[\s\S]*-4 课时/, 'coach detail workload cell should match compact slash and change copy');
assert.doesNotMatch(operationsRuntime.operationsCoachUsedHoursCell({ teachingHours: 5, teachingStudentCount: 8, usedHoursComparison: { mode: 'previous_period', changeValue: -4 } }), /较上期/, 'coach detail workload cell should not show previous-period label');
assert.strictEqual(operationsRuntime.operationsCoachTrialConversionText({ trialConverted: 5, trialBase: 8, trialConversionRate: 62.5 }), '5 / 8 62.5%', 'coach trial conversion should use spaced slash formatting');
assert.strictEqual(operationsRuntime.operationsCoachFeedbackText({ feedbackCompleted: 0, feedbackRequired: 4 }), '0 / 4', 'coach feedback count should use spaced slash formatting');
assert.doesNotMatch(operationsSource, /function operationsCoachTrialRateCell/, 'coach detail table should remove the separate trial conversion rate renderer');
assert.match(operationsSource, /function operationsCoachDetailTooltipText[\s\S]*tms-tooltip-text[\s\S]*data-tooltip/, 'coach detail long text should reuse the standard lead-style hover tooltip');
assert.match(coachDashboardSource, /operationsCoachDetailTooltipText\(operationsCoachCourseMixText\(row\)\)[\s\S]*operationsCoachDetailTooltipText\(operationsCoachCampusDistributionText\(row\)\)/, 'coach detail course and campus distribution columns should show full text on hover');
assert.match(operationsSource, /function renderOperationsCoachKpi[\s\S]*operations-coach-kpi-change[\s\S]*operationsCoachSparklineSvg/, 'coach KPI cards should render title, value, sparkline and change value only');
assert.doesNotMatch(operationsSource, /operations-coach-kpi-help|\?<\/button>/, 'KPI cards should not render question marks');
assert.doesNotMatch(operationsSource, /function renderOperationsCourtKpi[\s\S]*<p>[\s\S]*function renderOperationsCourtKpis/, 'court KPI cards should not render subtitle explanations');
assert.doesNotMatch(operationsSource, /function renderOperationsCoachKpi[\s\S]*<p>[\s\S]*function operationsCoachTrendValues/, 'coach KPI cards should not render subtitle explanations');
assert.match(operationsSource, /function operationsKpiSparklineSvg[\s\S]*<svg[\s\S]*linearGradient[\s\S]*<path class="operations-kpi-area"[\s\S]*<path class="operations-kpi-line"/, 'KPI sparklines should keep the line and matching gradient area in SVG');
assert.doesNotMatch(operationsSource, /function operationsKpiSparklineSvg[\s\S]*<circle[\s\S]*function operationsCoachSparklineSvg/, 'KPI sparklines should not render SVG circles because preserveAspectRatio can stretch them into ovals');
assert.doesNotMatch(operationsSource, /operations-kpi-hit|operations-kpi-dot/, 'KPI sparklines should not keep SVG hit or dot classes in the renderer');
assert.match(operationsSource, /function operationsKpiSparklineSvg[\s\S]*operations-kpi-hover-point[\s\S]*data-tip/, 'KPI sparklines should use HTML hover points so tooltips and dots do not distort inside SVG');
assert.doesNotMatch(operationsSource, /foreignObject/, 'KPI sparklines should not use SVG foreignObject tooltips that stretch with preserveAspectRatio');
assert.doesNotMatch(operationsSource, /<polyline|return value \? \[value, value\] : \[\]/, 'KPI sparklines must not use SVG polylines or old value-only fake trends');
assert.match(operationsSource, /let operationsSparklineUid = 0/, 'KPI sparkline gradients should have a per-render unique id source');
assert.match(operationsSource, /const gradientId = `operationsSpark\$\{\+\+operationsSparklineUid\}/, 'KPI sparkline gradients should not reuse ids across cards');
assert.match(operationsSource, /const operationsTrendDefaultColor = '#2F72B8'/, 'KPI sparklines should use one calm default trend color instead of one color per card');
assert.match(operationsSource, /const operationsTrendWarningKeys = new Set\(\['pendingRevenue'\]\)/, 'pending fulfillment balance should be the only warning-colored top KPI by default');
assert.match(operationsSource, /function operationsTrendColor[\s\S]*operationsTrendWarningKeys\.has\(key\)[\s\S]*operationsTrendWarningColor[\s\S]*return operationsTrendDefaultColor/, 'KPI line, area and hover colors should come from a centralized restrained color rule');
const trendColorSource = operationsSource.slice(
  operationsSource.indexOf('function operationsTrendColor'),
  operationsSource.indexOf('function operationsCoachTrendToneColor')
);
assert.doesNotMatch(trendColorSource, /bookingAmount'\) return '#E05252'|dealRate'\) return '#8B5E3C'|renewalRate'\) return '#D89135'/, 'KPI sparklines should not assign loud per-card colors for neutral or positive metrics');
assert.match(operationsSource, /function operationsSmoothPath[\s\S]* C /, 'KPI sparklines should be lightly smoothed instead of hard zigzags');
assert.doesNotMatch(operationsSource, /operationsSmoothPath[\s\S]*=> `\$\{path\} L \$\{point\.x\}/, 'KPI sparklines should not draw raw straight-line zigzags');
assert.match(operationsSource, /function operationsPointDateSerial[\s\S]*Date\.UTC/, 'KPI sparklines should place points by real calendar distance instead of equal spacing');
assert.match(operationsSource, /function operationsSparklineSegments[\s\S]*return coords\.length \? \[coords\] : \[\]/, 'KPI sparklines should render one continuous backend-provided trend line');
assert.doesNotMatch(operationsSource, /point\.dateSerial - previous\.dateSerial > 1/, 'KPI sparklines should not break weekly or monthly backend trend buckets');
assert.match(operationsSource, /function operationsKpiPointList[\s\S]*rawValue === null \|\| rawValue === undefined \|\| rawValue === ''[\s\S]*return null[\s\S]*targetCount = 60[\s\S]*Math\.round\(index \* step\)/, 'KPI sparklines should skip missing values instead of drawing them as zero and keep more real points');
assert.match(operationsSource, /operationsKpiPointTip[\s\S]*date[\s\S]*value/, 'KPI sparkline hover text should describe the point date and value');
assert.match(operationsSource, /appointmentRate[\s\S]*attendanceRate[\s\S]*dealRate[\s\S]*renewalRate[\s\S]*return `\$\{fmt\(number\)\}%`/, 'conversion KPI hover values should render percentage units for appointment, attendance, deal and renewal rates');
assert.match(operationsSource, /function operationsTrendPoints[\s\S]*numerator: row\[\`\$\{key\}Numerator`\][\s\S]*denominator: row\[\`\$\{key\}Denominator`\]/, 'KPI trend points should keep backend numerator and denominator for hover details');
assert.match(operationsSource, /function operationsKpiRatioText[\s\S]*point\.numerator[\s\S]*point\.denominator[\s\S]*\/[\s\S]*function operationsKpiPointLabel[\s\S]*operationsKpiRatioText\(point, key\)/, 'KPI hover labels should show numerator and denominator when backend provides them');
assert.match(operationsSource, /operations-kpi-hover-point" style="--trend-color:\$\{esc\(color\)\}/, 'KPI hover points should receive the current line color');
assert.doesNotMatch(operationsSource, /持平/, 'KPI cards should never render flat wording');
assert.doesNotMatch(operationsSource, /较期初|较周初|较月初|较首日/, 'KPI change values should not show comparison scope text in compact cards');
assert.match(operationsSource, /operations-coach-kpi-value[\s\S]*operations-coach-kpi-change/, 'coach KPI change value should sit next to the main number');
assert.doesNotMatch(operationsSource, /renderOperationsCoachTrendCharts/, 'coach KPI sparklines should not depend on async ECharts rendering');
assert.match(operationsSource, /function operationsCoachTrendValues[\s\S]*return values\.length \? values : \[\]/, 'coach KPI sparklines should render real backend trend points when present');
assert.doesNotMatch(coachDashboardSource, /operationsSimpleTable/, 'coach page should not use a table as the main display');
assert.doesNotMatch(coachDashboardSource, /renderStandardDataCards/, 'coach page should not reuse the old generic data-card block');
assert.doesNotMatch(coachDashboardSource, /教练工时利用率[\s\S]*operationsCoachChart/, 'coach page should remove the old single utilization bar chart');
assert.doesNotMatch(stylesSource, /operations-coach-kpi::before\{content:/, 'coach KPI cards should not render top color strips');
const trendChangeSource = operationsSource.slice(
  operationsSource.indexOf('function operationsTrendChangeText'),
  operationsSource.indexOf('function operationsSmoothPath')
);
assert.match(trendChangeSource, /comparison[\s\S]*changeValue/, 'KPI cards should show backend-generated previous-period comparison values');
assert.doesNotMatch(trendChangeSource, /first[\s\S]*last[\s\S]*change/, 'KPI comparison values should not be calculated from the first and last sparkline points');
assert.match(stylesSource, /operations-coach-kpi-strip\{display:grid;grid-template-columns:repeat\(5,minmax\(0,1fr\)\)/, 'coach dashboard KPI strip should be a dense five-column monitor row');
assert.match(stylesSource, /operations-coach-detail-table \.tms-table\{[^}]*min-width:980px/, 'coach detail table should use a compact Gemini-style table width');
assert.match(stylesSource, /operations-coach-detail-table \.tms-table th\{[^}]*height:42px[^}]*color:#887565[^}]*font-size:12px[^}]*font-weight:400/, 'coach detail table headers should use 42px height and 12px normal text');
assert.match(stylesSource, /operations-coach-detail-table \.tms-table td\{[^}]*height:42px[^}]*color:#887565[^}]*font-size:12px[^}]*font-weight:400/, 'coach detail table body cells should use 42px height and 12px normal text by default');
assert.doesNotMatch(stylesSource, /operations-coach-detail-table \.tms-table th:nth-child\(\d+\)\{width:/, 'coach detail columns should share the table width without individual fixed widths');
assert.match(stylesSource, /operations-coach-name-cell\{[^}]*font-weight:700[^}]*color:#887565/, 'coach detail coach name can be bold while keeping the same text color');
assert.match(stylesSource, /operations-coach-detail-hours>span:first-child\{[^}]*font-size:12px[^}]*font-weight:400[^}]*color:#887565/, 'coach detail lesson-hour value should use the normal table style');
assert.match(stylesSource, /operations-coach-detail-change\{[^}]*display:inline-flex[^}]*align-items:center[^}]*font-weight:400/, 'coach detail lesson-hour change should be vertically centered and normal weight');
assert.match(stylesSource, /operations-coach-detail-icon\{[^}]*width:12px[^}]*height:12px/, 'coach detail lesson-hour change should use a fixed-size icon');
assert.match(stylesSource, /operations-coach-detail-change\.up\{color:#D64545\}/, 'coach detail table should show rising lesson hours in red');
assert.match(stylesSource, /operations-coach-detail-change\.down\{color:#087A35\}/, 'coach detail table should show falling lesson hours in green');
assert.match(stylesSource, /operations-coach-feedback\{[^}]*color:#887565/, 'coach detail feedback text should use the same color as course mix text');
assert.doesNotMatch(stylesSource, /operations-coach-trial-rate/, 'coach detail trial conversion should not use label-like styles');
assert.match(stylesSource, /#page-operations\{[^}]*--ops-card-bg:#FFFDFC[^}]*--ops-card-border:rgba\(91,63,42,\.12\)[^}]*--ops-card-shadow:0 1px 2px rgba\(37,24,15,\.018\),0 8px 20px rgba\(37,24,15,\.03\)/, 'operations cards should use a lighter warm-white surface with a softer border and shadow');
assert.match(stylesSource, /operations-coach-kpi\{[^}]*min-height:142px[^}]*padding:14px 18px 11px 20px/, 'coach KPI cards should use the refined Apple-like spacing and lower chart area');
assert.match(operationsSource, /operationsMoneyCompactText|operationsCompactNumber/, 'top KPI cards should shorten large values before placing change values beside them');
assert.doesNotMatch(stylesSource, /operations-coach-kpi-help/, 'coach KPI help icon styles should be removed');
assert.match(stylesSource, /operations-court-kpi-head span,#page-operations \.operations-coach-kpi-head span\{[^}]*font-size:14px[^}]*line-height:18px[^}]*font-weight:700/, 'KPI titles should be slightly smaller and calmer than the main number');
assert.match(stylesSource, /operations-court-kpi-main strong,#page-operations \.operations-coach-kpi strong\{[^}]*font-size:34px[^}]*line-height:39px[^}]*font-weight:750/, 'KPI main numbers should carry the card with Apple-like scale and weight');
assert.match(stylesSource, /operations-coach-kpi-sparkline\{[^}]*height:66px/, 'coach KPI sparkline wrappers should fill the lower card area like the reference');
assert.doesNotMatch(stylesSource, /operations-kpi-hit|operations-kpi-dot/, 'KPI hover dots should be HTML elements only, not SVG dots that can stretch');
assert.match(stylesSource, /operations-court-kpi-sparkline,#page-operations \.operations-conversion-kpi-sparkline,#page-operations \.operations-coach-kpi-sparkline\{[^}]*margin-left:-20px[^}]*width:calc\(100% \+ 38px\)[^}]*margin-bottom:-11px/, 'KPI sparkline wrappers should reclaim the card side and bottom padding');
assert.match(stylesSource, /operations-kpi-hover-point:hover::after[\s\S]*content:attr\(data-tip\)/, 'KPI sparkline hover should show an undistorted HTML tooltip for each point');
assert.match(stylesSource, /operations-kpi-hover-point:hover::before[\s\S]*border:1\.5px solid var\(--trend-color/, 'KPI hover point highlight should follow the current sparkline color without feeling heavy');
assert.match(stylesSource, /operations-kpi-line\{[^}]*stroke-width:1\.8/, 'KPI sparkline should use a thinner Apple-like curve');
assert.match(operationsSource, /stop-opacity="\.12"[\s\S]*stop-opacity="\.035"[\s\S]*stop-opacity="0"/, 'KPI sparkline area gradient should be lighter and less muddy');
assert.doesNotMatch(stylesSource, /operations-(court|coach)-kpi\.[^{]+ \.operations-kpi-line/, 'KPI sparkline colors must not be overridden in CSS because that desynchronizes line, area and hover colors');
assert.match(stylesSource, /operations-coach-kpi-head\{[^}]*justify-content:flex-start/, 'KPI title row should no longer reserve space for the change value');
assert.match(stylesSource, /operations-coach-kpi-change\{[^}]*max-width:88px[^}]*text-align:left/, 'KPI change value should sit compactly beside the main number without crushing long percentages');
assert.match(stylesSource, /operations-court-kpi\{[^}]*min-height:142px[^}]*display:flex;flex-direction:column/, 'court KPI cards should use the same refined card layout as coach KPI cards');
assert.match(stylesSource, /operations-court-ranking-card\{[^}]*border:1px solid #E7EEF8[^}]*border-radius:8px/, 'court ranking should use dashboard cards instead of table rows');
assert.match(stylesSource, /operations-court-ranking-mainbar\{[^}]*height:12px/, 'court ranking should use one strong utilization bar');
assert.match(stylesSource, /operations-court-ranking-capacity\{[^}]*font-size:12px/, 'court ranking should show the utilization denominator as readable text');
assert.match(stylesSource, /operations-skeleton-line\{[^}]*#E6D8CD[\s\S]*#F4EAE3[\s\S]*#E6D8CD/, 'operations skeleton shimmer should use the warm page palette instead of cold silver');
assert.doesNotMatch(stylesSource, /operations-skeleton-line\{[^}]*#E8EEF7[\s\S]*#F8FAFE/, 'operations skeleton shimmer should not use the old silver-blue gradient');
assert.doesNotMatch(standardComponentsSource, /tms-skeleton-spark/, 'KPI skeletons should not draw fake trend charts');
assert.match(standardComponentsSource, /is-label[\s\S]*is-value[\s\S]*is-meta/, 'KPI skeletons should keep title, number and support-line hierarchy');
assert.match(stylesSource, /\.tms-skeleton-chart-surface\{[^}]*linear-gradient\(180deg,rgba\(160,143,128,\.08\) 1px,transparent 1px\)/, 'chart skeleton should use a subtle structural surface');
assert.doesNotMatch(stylesSource, /\.tms-skeleton-chart-body i\{/, 'chart skeleton should not style fake bar charts');
assert.match(stylesSource, /operations-coach-hero-grid\{display:grid;grid-template-columns:repeat\(2,minmax\(0,1fr\)\);gap:14px/, 'coach dashboard should place the two matrix charts side by side');
assert.doesNotMatch(stylesSource, /operations-coach-alert-card/, 'coach dashboard should remove diagnostic alert card styles from the target surface');
assert.doesNotMatch(coachDashboardSource, /operations-coach-band-legend/, 'coach dashboard should not render the removed utilization band legend');
assert.match(stylesSource, /operations-coach-command-skeleton/, 'coach loading skeleton should have its own layout class');
assert.match(stylesSource, /operations-module-head\{[^}]*border-bottom:0/, 'operations chart headers should not render a divider line between title and chart');
assert.match(stylesSource, /operations-module-head h3\{[^}]*color:#887565[^}]*font-size:15px[^}]*font-weight:700/, 'operations card titles should use the requested color and size');
assert.match(stylesSource, /operations-module-head>div:first-child>span\{[^}]*display:none/, 'operations card subtitles should be removed without hiding title legends');
assert.match(coachDashboardSource, /教练产值贡献排行[\s\S]*归属实收[\s\S]*归属实收占比[\s\S]*体验课[\s\S]*私教课[\s\S]*小班课/, 'coach chart legends should render attributed receipt share in the card title bar');
assert.match(stylesSource, /operations-coach-title-legend\{[^}]*justify-content:flex-end/, 'coach title legends should be right aligned in card headers');
assert.match(stylesSource, /operations-coach-title-legend\{[^}]*color:#A19080[^}]*font-size:11px[^}]*font-weight:400/, 'coach chart legends should use the requested axis-like label style');
assert.match(operationsSource, /operationsCoachChartHeader\('教练产值贡献排行'[\s\S]*color: '#A67B5B'[\s\S]*color: '#0F766E', line: true/, 'coach contribution legend should match the Gemini bar-line colors');
assert.match(operationsSource, /operationsCoachChartHeader\('课程结构占比'[\s\S]*color: '#D97706'[\s\S]*color: '#0F766E'[\s\S]*color: '#E7E5E4'/, 'coach course mix legend should match the Gemini stacked-bar colors');
assert.match(stylesSource, /#page-operations\{[^}]*--ops-number-font:var\(--ft-number-font\)/, 'operations should use the shared platform numeric font stack');
assert.match(stylesSource, /operations-coach-kpi strong\{[^}]*font-family:var\(--ops-number-font\)/, 'coach KPI values should use the local numeric font stack');
assert.match(stylesSource, /operations-coach-kpi-change\{[^}]*font-family:var\(--ops-number-font\)/, 'coach KPI comparison values should use the local numeric font stack');
assert.doesNotMatch(stylesSource, /operations-utilization-gemini|operations-utilization-track|operations-utilization-row/, 'coach utilization distribution styles should be removed with the card');
assert.match(chartsSource, /归属实收占比：\$\{fmt\(share\)\}%/, 'coach contribution tooltip should show attributed receipt share');
assert.match(chartsSource, /legend: \{ show: false \}[\s\S]*name: '归属实收占比'[\s\S]*source\.map\(row => row\.revenueShare\)/, 'coach contribution line should use attributed receipt share and hide the internal chart legend');
assert.match(chartsSource, /const bubbleColor = operationsCourtQuadrantColor\(row, utilizationAxis\)[\s\S]*shadowColor: `\$\{bubbleColor\}33`/, 'court quadrant bubble shadow should follow the bubble color instead of using a green glow');
assert.match(operationsSource, /data-tip="\$\{esc\(label\)\}"/, 'court heatmap hover should render tooltip text from a cell data attribute');
assert.doesNotMatch(operationsSource, /operations-court-heat-tooltip/, 'court heatmap should not render tooltips as clipped children inside the scroll grid');
assert.match(stylesSource, /operations-court-heat-floating-tooltip\.show\{display:block\}/, 'court heatmap hover tooltip should render as a floating layer outside the scroll grid');
assert.match(stylesSource, /operations-court-heat-kpis div:hover\{border-color:var\(--ops-card-border\);background:var\(--ops-card-bg\)\}/, 'court heat KPI cards should keep the unified operations card hover style');
assert.match(chartsSource, /buildOperationsCoachMatrixChartOption[\s\S]*grid: operationsMatrixGrid\(\{[\s\S]*axisLabel: \{ \.\.\.operationsCoachAxisLabel, formatter: revenueLabel[\s\S]*showMinLabel: true, showMaxLabel: true \}[\s\S]*axisTick: \{ show: false \}/, 'coach matrix should keep edge labels visible, use the numeric font style and remove crowded y-axis tick marks');
assert.match(chartsSource, /buildOperationsCoachCapabilityChartOption[\s\S]*grid: operationsMatrixGrid\(\{[\s\S]*yAxis: \{ type: 'value'[\s\S]*formatter: percentLabel[\s\S]*axisTick: \{ show: false \}/, 'coach capability matrix should keep edge labels visible, show zero and remove crowded tick marks');
assert.doesNotMatch(chartsSource, /buildOperationsCoachCapabilityChartOption[\s\S]*name: '老客续费率'[\s\S]*seriesName: '转化续费能力'/, 'coach capability matrix should not reserve left gutter for a vertical y-axis title');
assert.doesNotMatch(chartsSource, /buildOperationsCoachMatrixChartOption[\s\S]*inside: true[\s\S]*buildOperationsCoachParetoChartOption/, 'coach matrix y-axis labels should not be placed inside the plot');
assert.doesNotMatch(chartsSource, /buildOperationsCoachCapabilityChartOption[\s\S]*inside: true[\s\S]*window\.addEventListener/, 'coach capability y-axis labels should not be placed inside the plot');
assert.match(chartsSource, /function operationsPremiumMatrixQuadrantColor\(x = 0, y = 0, xMid = 50, yMid = 50\)[\s\S]*operationsPremiumMatrixQuadrantColors\.q1[\s\S]*operationsPremiumMatrixQuadrantColors\.q2[\s\S]*operationsPremiumMatrixQuadrantColors\.q3[\s\S]*operationsPremiumMatrixQuadrantColors\.q4/, 'matrix point colors should follow the Gemini quadrant they land in');
assert.doesNotMatch(chartsSource, /buildOperationsCoachMatrixChartOption[\s\S]*operationsAxisBandMarkAreas\(utilizationAxis, operationsCoachBandFills\)/, 'coach matrix background should not use five equal pale status bands');
assert.match(chartsSource, /buildOperationsCoachMatrixChartOption[\s\S]*axisTick: \{ show: false \}[\s\S]*buildOperationsCoachParetoChartOption/, 'coach matrix y-axis tick marks should be hidden to avoid overlapping labels');
assert.match(chartsSource, /function operationsCoachCourseColor[\s\S]*if \(type === '体验课'\) return '#D97706'[\s\S]*if \(type === '私教课'\) return '#0F766E'[\s\S]*if \(type === '小班课'\) return '#E7E5E4'[\s\S]*if \(type === '陪打'\) return '#7C3AED'/, 'coach course mix should use the Gemini course colors');
assert.match(chartsSource, /buildOperationsCoachParetoChartOption[\s\S]*xAxis: \{ type: 'category'[\s\S]*data: source\.map\(row => operationsCoachShortName\(row\.coach\)\)[\s\S]*rotate: 30/, 'coach contribution chart should stay vertical with Gemini angled short-name x-axis labels');
assert.match(chartsSource, /buildOperationsCoachCourseMixChartOption[\s\S]*data: displayRows\.map\(row => operationsCoachShortName\(row\.coach\)\)/, 'coach course mix y-axis should remove the coach suffix');
assert.match(chartsSource, /buildOperationsCoachParetoChartOption[\s\S]*grid: \{ top: 10, right: 35, bottom: 45, left: 35, containLabel: false \}/, 'coach contribution chart should use Gemini manual grid spacing');
assert.match(chartsSource, /const operationsCoachChartTextStyle = \{ color: '#57534E', fontFamily: 'var\(--ops-number-font\)' \}/, 'coach charts should use the local numeric font stack for chart numbers');
assert.match(chartsSource, /const operationsPremiumMatrixAxisLabel = \{[\s\S]*fontFamily: 'var\(--ops-number-font\)'[\s\S]*fontSize: 11[\s\S]*const operationsCoachAxisLabel = operationsPremiumMatrixAxisLabel/, 'same-type matrix axis labels should share the numeric font style');
assert.match(chartsSource, /buildOperationsCoachMatrixChartOption[\s\S]*label: \{\s*show: true,[\s\S]*position: 'top'[\s\S]*color: '#57534E'[\s\S]*labelLayout: \{ hideOverlap: true \}/, 'coach matrix should use Gemini-style top labels with overlap hiding');
assert.match(chartsSource, /buildOperationsCoachCapabilityChartOption[\s\S]*label: \{\s*show: true,[\s\S]*position: 'top'[\s\S]*color: '#57534E'[\s\S]*labelLayout: \{ hideOverlap: true \}/, 'coach capability matrix should use Gemini-style top labels with overlap hiding');
assert.match(chartsSource, /buildOperationsCoachParetoChartOption[\s\S]*barWidth: 12[\s\S]*borderRadius: \[2, 2, 0, 0\][\s\S]*smooth: false[\s\S]*lineStyle: \{ width: 2, color: '#0F766E' \}/, 'coach contribution bars and line should use the Gemini density');
assert.match(chartsSource, /buildOperationsCoachCourseMixChartOption[\s\S]*barWidth: 6[\s\S]*borderRadius: \[2, 0, 0, 2\]/, 'coach course mix should use Gemini slimmer stacked bars with subtle rounding');
assert.match(chartsSource, /buildOperationsCoachCourseMixChartOption[\s\S]*grid: \{ top: 0, right: 20, bottom: 20, left: 55, containLabel: false \}/, 'coach course mix chart should use Gemini spacing');
assert.match(chartsSource, /function operationsCoachBubbleLabel[\s\S]*symbolSize < 22[\s\S]*return \{ text: '', fontSize: 0 \}[\s\S]*label: \{ show: !!bubbleLabel\.text, fontSize: bubbleLabel\.fontSize \}/, 'coach matrix labels should shrink with bubble size and hide on tiny bubbles');
assert.match(chartsSource, /function operationsCoachMatrixSymbolSize[\s\S]*operationsBubbleSize\(lessons, maxLessons, \{ min: 14, max: 33 \}/, 'coach matrix bubbles should use compact area-scaled sizing');
assert.match(chartsSource, /function operationsCoachCapabilitySymbolSize[\s\S]*operationsBubbleSize\(sample, maxSample, \{ min: 14, max: 33 \}/, 'coach capability bubbles should use compact area-scaled sizing');
assert.match(chartsSource, /buildOperationsCoachParetoChartOption[\s\S]*filter\(row => row && row\.coach\)/, 'coach contribution chart should keep coach rows even when revenue is zero so the card does not render blank');
assert.match(chartsSource, /slice\(0, 10\)/, 'coach contribution chart should cap visible coach count to avoid crowded vertical labels');
assert.match(chartsSource, /yAxis: \[[\s\S]*\{ type: 'value'[\s\S]*\{ type: 'value', min: 0, max: 100/, 'coach contribution chart should keep amount and share axes for the vertical layout');
assert.match(chartsSource, /operationsCoachBandColors[\s\S]*'#5CC8A0'[\s\S]*'#1F8A5B'/, 'coach high utilization bands should be visually distinct');
assert.match(chartsSource, /function operationsMatrixGrid\(\{ xLabels = \[\], yLabels = \[\] \} = \{\}\)/, 'coach matrix should calculate grid from actual tick labels');
assert.match(chartsSource, /operationsTextWidth[\s\S]*yLabels[\s\S]*xLabels/, 'matrix grid should measure labels to avoid clipping without manual oversized gutters');
assert.match(stylesSource, /operations-coach-primary-card\{padding:14px 16px 12px\}/, 'coach matrix cards should reduce inner padding');
assert.match(stylesSource, /operations-coach-matrix-chart\{height:360px;min-height:360px/, 'coach matrix charts should get enough height after tighter padding');
assert.match(operationsSource, /renderStandardChart\('operationsCoachMatrixChart'[\s\S]*\{ height: 360, renderer: 'svg' \}/, 'coach matrix render height should match the tighter chart container');
assert.match(operationsSource, /renderStandardChart\('operationsCoachCapabilityChart'[\s\S]*\{ height: 360, renderer: 'svg', emptyText:/, 'coach capability render height should match the tighter chart container');
assert.match(operationsSource, /renderStandardChart\('operationsCoachMatrixChart'[\s\S]*renderer: 'svg'/, 'coach matrix should render with SVG so axis labels and bubbles stay crisp');
assert.match(operationsSource, /renderStandardChart\('operationsCoachParetoChart'[\s\S]*renderer: 'svg'/, 'coach contribution chart should render with SVG so bars, line and labels stay crisp');
assert.match(operationsSource, /renderStandardChart\('operationsCoachCourseMixChart'[\s\S]*renderer: 'svg'/, 'coach course mix chart should render with SVG so bars and labels stay crisp');
assert.match(operationsSource, /renderStandardChart\('operationsCoachCapabilityChart'[\s\S]*renderer: 'svg'/, 'coach capability matrix should render with SVG so axis labels and bubbles stay crisp');
assert.match(chartsSource, /hoverStyle = 'default'[\s\S]*hoverStyle === 'subtle'[\s\S]*scaleSize: 3/, 'bubble matrix base should expose a subtle hover mode for premium coach charts');
assert.match(chartsSource, /buildOperationsCoachMatrixChartOption[\s\S]*hoverStyle: 'subtle'/, 'coach revenue-utilization matrix should use subtle hover without heavy border or shadow');
assert.match(chartsSource, /buildOperationsCoachCapabilityChartOption[\s\S]*hoverStyle: 'subtle'/, 'coach conversion-renewal matrix should use subtle hover without fading peer points');
assert.match(stylesSource, /body\.admin-mobile #page-operations \.operations-kpi-row,body\.admin-mobile #page-operations \.operations-coach-kpi-strip\{[^}]*grid-template-columns:repeat\(3,minmax\(0,1fr\)\)/, 'operations H5 KPI rows should keep three compact cards per row');
assert.match(stylesSource, /body\.admin-mobile #page-operations \.operations-court-kpi,body\.admin-mobile #page-operations \.operations-coach-kpi\{height:92px;min-height:92px[^}]*overflow:hidden/, 'operations H5 KPI cards should stay compact instead of taking the full screen');
assert.match(stylesSource, /body\.admin-mobile #page-operations \.operations-court-kpi-sparkline,body\.admin-mobile #page-operations \.operations-conversion-kpi-sparkline,body\.admin-mobile #page-operations \.operations-coach-kpi-sparkline\{height:28px;min-height:28px/, 'operations H5 sparklines should be compressed inside compact KPI cards');
assert.match(stylesSource, /body\.admin-mobile #page-operations \.operations-chart-host\{min-width:0;overflow:hidden\}/, 'operations H5 charts should not force horizontal page overflow');

console.log('operations view tests passed');
