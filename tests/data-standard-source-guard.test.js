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
  required: [/studentLifecycleStats\(base\)/, /studentFinanceStatsForBase\(base\)/],
  forbidden: [/aggregateHistoricalMonthlyLedgerRows/, /deferredRevenueDelta/, /recognizedRevenueDelta/]
});

[
  'renderMembershipStats',
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
  required: [/financeCurrentMetrics\(financeLedgerRows\(\)\)/],
  forbidden: [/purchases\b/, /courts\b/, /entitlementLedger\b/, /membershipOrders\b/, /amountPaid/, /finalAmount/]
});

console.log('data standard source guard tests passed');
