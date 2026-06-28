const assert = require('assert');
const fs = require('fs');
const path = require('path');

const repoRoot = path.join(__dirname, '..');
const read = file => fs.readFileSync(path.join(repoRoot, file), 'utf8');

function functionSource(source, name) {
  const start = source.indexOf(`function ${name}(`);
  assert.notStrictEqual(start, -1, `${name} should exist`);
  const bodyStart = source.indexOf('{', source.indexOf(')', start));
  assert.notStrictEqual(bodyStart, -1, `${name} should have a body`);
  let depth = 0;
  let opened = false;
  for (let i = bodyStart; i < source.length; i += 1) {
    if (source[i] === '{') {
      depth += 1;
      opened = true;
    } else if (source[i] === '}') {
      depth -= 1;
      if (opened && depth === 0) return source.slice(start, i + 1);
    }
  }
  throw new Error(`${name} body should be complete`);
}

function assertFunctionGuard({ file, name, required = [], forbidden = [] }) {
  const body = functionSource(read(file), name);
  required.forEach(pattern => {
    assert.match(body, pattern, `${file}:${name} should use the unified standard source ${pattern}`);
  });
  forbidden.forEach(pattern => {
    assert.doesNotMatch(body, pattern, `${file}:${name} must not create a page-local metric from ${pattern}`);
  });
}

const rawFinanceFacts = [
  /purchases\b/,
  /entitlementLedger\b/,
  /membershipOrders\b/,
  /courtFinanceLocal\(/,
  /aggregateHistoricalMonthlyLedgerRows/,
  /amountPaid\s*\?\?/,
  /finalAmount\s*\?\?/,
  /remainingLessons[\s\S]{0,160}actualAmount/,
  /deferredRevenueDelta[\s\S]{0,120}reduce\(/,
  /recognizedRevenueDelta[\s\S]{0,120}reduce\(/
];

[
  'renderOperationsOverview',
  'renderOperationsOverviewKpis',
  'operationsOverviewWarnings'
].forEach(name => assertFunctionGuard({
  file: 'public/assets/scripts/pages/operations.js',
  name,
  required: [/data\.overview|overviewCards|cards/],
  forbidden: [/financeNormalizedRows/, /cashDelta/, /recognizedRevenueDelta/, /deferredRevenueDelta/, ...rawFinanceFacts]
}));
assertFunctionGuard({
  file: 'public/assets/scripts/pages/operations.js',
  name: 'operationsOverviewCashQuality',
  forbidden: [/financeNormalizedRows/, /cashDelta/, /recognizedRevenueDelta/, /deferredRevenueDelta/, ...rawFinanceFacts]
});

assertFunctionGuard({
  file: 'public/assets/scripts/pages/students.js',
  name: 'studentPageStats',
  required: [/studentStandardSummaryForMode\(\)/],
  forbidden: [/studentFinanceStatsForBase\(base\)/, /purchases\.filter/, /entitlements\.filter/, /aggregateHistoricalMonthlyLedgerRows/, /deferredRevenueDelta/, /recognizedRevenueDelta/, /amountPaid/, /finalAmount/]
});
assert.doesNotMatch(
  read('public/assets/scripts/pages/students.js'),
  /function studentFinanceStatsForBase\(|function studentLifecycleStats\(/,
  'student page must not keep alternate local calculators for top card metrics'
);

[
  'studentPackageRecordIsTrial',
  'studentHasNonTrialPackage',
  'studentHasTrialPath'
].forEach(name => assertFunctionGuard({
  file: 'public/assets/scripts/pages/students.js',
  name,
  required: [/customerLifecycle|teachingStudentViews|standardLifecycleMetrics/],
  forbidden: [/\/体验\/\.test/, /purchases\.some/, /schedules\.some/, /studentActiveEntitlementRows/]
}));

assertFunctionGuard({
  file: 'public/assets/scripts/pages/courts.js',
  name: 'renderMembershipStats',
  required: [/membershipFinanceSummary/],
  forbidden: [/courtFinanceLocal\(/, /normalizeCourtHistoryLocal\(/, /history\.reduce\(/, /membershipOrders\.filter/, /totalDeposit/]
});

[
  'membershipSortMetric',
  'renderMemberships',
  'courtMembershipPanelHtml'
].forEach(name => assertFunctionGuard({
  file: 'public/assets/scripts/pages/courts.js',
  name,
  required: [/membershipReadModel/],
  forbidden: [/courtFinanceLocal\(/, /normalizeCourtHistoryLocal\(/, /history\.reduce\(/]
}));

[
  ['financeRevenueBaseRows', /financeUnifiedRows\(\)/],
  ['financeRecognizedRows', /financeUnifiedRows\(\)/],
  ['financePrepaidRows', /financeDeferredRowsFromUnifiedLedger\(\)/],
  ['renderFinancePrepaidBalance', /financeDeferredRowsFromUnifiedLedger\(\)/]
].forEach(([name, sourcePattern]) => assertFunctionGuard({
  file: 'public/assets/scripts/pages/coachops.js',
  name,
  required: [sourcePattern],
  forbidden: [/purchases\b/, /courts\b/, /entitlementLedger\b/, /courtFinanceLocal\(/, /aggregateHistoricalMonthlyLedgerRows/]
}));

assertFunctionGuard({
  file: 'public/assets/scripts/pages/coachops.js',
  name: 'renderFinanceOverview',
  required: [/financeStandardOverviewMetrics\(\)/],
  forbidden: [/financeCurrentMetrics\(financeLedgerRows\(\)\)/, /purchases\b/, /courts\b/, /entitlementLedger\b/, /membershipOrders\b/, /amountPaid/, /finalAmount/, /cashDelta[\s\S]{0,120}reduce\(/, /recognizedRevenueDelta[\s\S]{0,120}reduce\(/]
});

[
  /function financeCurrentMetrics\(/,
  /function financeCoursePackageMetrics\(/,
  /function financeLegacyUnifiedRows\(/,
  /function financeCourseRevenueRows\(/,
  /function financeConsumeRows\(/
].forEach(pattern => {
  assert.doesNotMatch(
    read('public/assets/scripts/pages/coachops.js'),
    pattern,
    `finance page must not keep legacy frontend finance calculator ${pattern}`
  );
});

assert.doesNotMatch(
  functionSource(read('public/assets/scripts/pages/coachops.js'), 'financeStandardNumber'),
  /value\s*!==\s*0/,
  'frontend standard finance number must treat 0 as a valid backend value instead of falling back'
);

[
  'renderFinanceRevenueReport',
  'renderFinanceConsumeReport'
].forEach(name => assertFunctionGuard({
  file: 'public/assets/scripts/pages/coachops.js',
  name,
  required: [/financeStandard/],
  forbidden: [/actualAmount[\s\S]{0,160}reduce\(/, /cashDelta[\s\S]{0,160}reduce\(/, /recognizedRevenueDelta[\s\S]{0,160}reduce\(/]
}));

assertFunctionGuard({
  file: 'public/assets/scripts/pages/coachops.js',
  name: 'operationsCoachTrialConversionText',
  required: [/operationsPageData\?\.coach\?\.rows/],
  forbidden: [/purchases\.some/, /scheduleIsTrial/, /purchaseMatchesCoachTrialStudent/, /converted\s*\/\s*total\s*\*\s*100/]
});

assertFunctionGuard({
  file: 'public/assets/scripts/pages/operations.js',
  name: 'operationsFunnelRows',
  required: [/standard\.funnels/],
  forbidden: [/conversion\.courseFunnel/]
});

const operationsMetricsSource = read('server/metrics/operations-metrics.js');
assert.doesNotMatch(
  operationsMetricsSource,
  /function buildStandardLifecycleMetricsFromConversionRows\(/,
  'operations metrics must not define a second standard lifecycle algorithm'
);
assert.doesNotMatch(
  operationsMetricsSource,
  /function buildFinanceOverviewFromNormalizedRows\(/,
  'operations metrics must not define a second finance overview algorithm'
);
assert.match(
  operationsMetricsSource,
  /buildFinanceOverviewSummaryFromRows/,
  'operations metrics should call the shared finance summary read model'
);
assert.match(
  operationsMetricsSource,
  /const coachFinancePurchases = financeRowsAsCoachPurchases\(rangedData\.financeNormalizedRows \|\| \[\]\);[\s\S]{0,360}const coachRows = buildCoachRows\(\{[\s\S]{0,180}purchases: coachFinancePurchases/,
  'coach dashboard revenue should pass standard finance rows into coach metrics'
);
assert.match(
  operationsMetricsSource,
  /const previousCoachRows = previousRangedData \? buildCoachRows\(\{[\s\S]{0,220}purchases: financeRowsAsCoachPurchases\(previousRangedData\.financeNormalizedRows \|\| \[\]\)/,
  'previous-period coach revenue should pass standard finance rows into coach metrics'
);

const financeSnapshotSource = read('server/page-data/finance-snapshot.js');
assert.doesNotMatch(
  financeSnapshotSource,
  /function buildFinanceOverviewDataFromRows\(/,
  'finance snapshot should import the shared finance summary read model instead of owning another finance formula'
);
assert.match(
  financeSnapshotSource,
  /buildFinanceOverviewDataFromRows/,
  'finance snapshot should still expose financeOverviewData from the shared helper'
);
assert.doesNotMatch(
  read('server/read-models/finance-summary.js'),
  /value\s*!==\s*0/,
  'backend finance summary must treat 0 as a valid standard value instead of falling back'
);
assertFunctionGuard({
  file: 'public/assets/scripts/pages/coachops.js',
  name: 'renderCoachOps',
  required: [/operationsCoachTrialConversionText\(r\.name\)/],
  forbidden: [/coachTrialConversionText\(r\.name,r\.rangeRows\)/]
});

assertFunctionGuard({
  file: 'public/assets/scripts/pages/leads.js',
  name: 'leadStatsData',
  required: [/leadStandardMetricValue\('validLeads'\)/, /leadStandardMetricValue\('courseChainStudents'\)/, /leadStandardMetricValue\('formalStudents'\)/],
  forbidden: [/FlowTennisPlatformDataStandards\.leadFunnelStats\(base,/, /base\.filter\(leadTrialBooked\)/, /base\.filter\(leadTrialDone\)/, /base\.filter\(leadConverted\)/]
});

[
  ['public/assets/scripts/pages/admin-users.js', 'adminUserAccountFormCardHtml', [/optionList\('adminUserRoles'\)/, /optionList\('adminUserDataScopes'\)/], [/const roleOptions=\[/, /const dataScopeOptions=\[/]],
  ['public/assets/scripts/pages/coaches.js', 'openCoachModal', [/optionList\('coachStatuses'\)/], [/const statusOptions=\[/]],
  ['public/assets/scripts/pages/schedule.js', 'openScheduleModal', [/optionList\('scheduleSettlementTypes'\)/, /optionList\('scheduleFieldFeeModes'\)/], [/const settlementOptions=\[/, /const fieldFeeModeOptions=\[/]],
  ['public/assets/scripts/pages/prices.js', 'openPriceModal', [/optionList\('priceVenueSpaceTypes'\)/, /optionList\('priceDateTypes'\)/], [/\{value:'室内',label:'室内'\}/, /\{value:'工作日',label:'工作日'\}/]],
  ['public/assets/scripts/pages/packages.js', 'packageTimeScopeOptions', [/optionList\('packageTimeScopes'\)/], [/\{value:'weekday',label:'工作日'\}/]],
  ['public/assets/scripts/pages/packages.js', 'openPackageModal', [/optionList\('packageClassSizes'\)/], [/const classSizeOptions=\[/]]
].forEach(([file, name, required, forbidden]) => assertFunctionGuard({ file, name, required, forbidden }));

console.log('data standard source guard tests passed');
