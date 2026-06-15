const fs = require('fs');
const path = require('path');

const DEFAULT_BASELINE_PATH = path.join(__dirname, '..', 'config', 'finance-baseline.v2.json');
const CONFIRMED_STATUSES = new Set(['confirmed', 'settled']);

function loadJsonFile(filePath) {
  return JSON.parse(fs.readFileSync(filePath, 'utf8'));
}

function normalizeNumber(value) {
  const num = Number(value);
  return Number.isFinite(num) ? num : 0;
}

function normalizeCount(value) {
  const count = Number(value);
  if (Number.isInteger(count) && count >= 0) return count;
  return 0;
}

function collectCategoryMetrics(rows = []) {
  const includedRows = (Array.isArray(rows) ? rows : []).filter((row) =>
    CONFIRMED_STATUSES.has(String(row?.status || '').trim().toLowerCase())
  );
  return includedRows.reduce(
    (acc, row) => {
      acc.revenue += normalizeNumber(row.recognizedRevenue);
      acc.transactionCount += normalizeCount(row.transactionCount);
      return acc;
    },
    { revenue: 0, transactionCount: 0 }
  );
}

function computeFinanceMetrics(snapshot = {}) {
  const packageMetrics = collectCategoryMetrics(snapshot.packageRevenueRows);
  const courtMetrics = collectCategoryMetrics(snapshot.courtRevenueRows);
  const membershipMetrics = collectCategoryMetrics(snapshot.membershipRechargeRows);
  return {
    totalRevenue: packageMetrics.revenue + courtMetrics.revenue + membershipMetrics.revenue,
    packageRevenue: packageMetrics.revenue,
    courtRevenue: courtMetrics.revenue,
    membershipRecharge: membershipMetrics.revenue,
    transactionCount:
      packageMetrics.transactionCount +
      courtMetrics.transactionCount +
      membershipMetrics.transactionCount
  };
}

function compareMetrics(actual = {}, expected = {}) {
  const metricNames = ['totalRevenue', 'packageRevenue', 'courtRevenue', 'membershipRecharge', 'transactionCount'];
  return metricNames
    .map((metric) => {
      const actualValue = normalizeNumber(actual[metric]);
      const expectedValue = normalizeNumber(expected[metric]);
      if (actualValue === expectedValue) return null;
      return {
        metric,
        expected: expectedValue,
        actual: actualValue,
        delta: actualValue - expectedValue
      };
    })
    .filter(Boolean);
}

function resolveArgs(argv = []) {
  const args = { baseline: DEFAULT_BASELINE_PATH, snapshot: '' };
  for (let i = 0; i < argv.length; i += 1) {
    const token = argv[i];
    if (token === '--baseline') args.baseline = path.resolve(argv[i + 1]);
    if (token === '--snapshot') args.snapshot = path.resolve(argv[i + 1]);
  }
  return args;
}

function resolveSnapshotPath(args, baseline) {
  if (args.snapshot) return args.snapshot;
  const configuredPath = String(baseline?.snapshotPath || '').trim();
  if (!configuredPath) {
    throw new Error('财务基准未配置 snapshotPath，无法执行固定快照回归');
  }
  return path.resolve(path.dirname(args.baseline), '..', configuredPath);
}

function formatDiffs(diffs = []) {
  return diffs
    .map((diff) => `${diff.metric}: expected=${diff.expected}, actual=${diff.actual}, delta=${diff.delta}`)
    .join('\n');
}

function runFinanceRegression({ baselinePath = DEFAULT_BASELINE_PATH, snapshotPath } = {}) {
  const baseline = loadJsonFile(baselinePath);
  const resolvedSnapshotPath = snapshotPath || resolveSnapshotPath({ baseline: baselinePath, snapshot: '' }, baseline);
  const snapshot = loadJsonFile(resolvedSnapshotPath);
  const metrics = computeFinanceMetrics(snapshot);
  const diffs = compareMetrics(metrics, baseline.metrics || {});
  return {
    baseline,
    snapshot,
    metrics,
    diffs,
    passed: diffs.length === 0,
    baselinePath,
    snapshotPath: resolvedSnapshotPath
  };
}

function main() {
  const args = resolveArgs(process.argv.slice(2));
  try {
    const result = runFinanceRegression({
      baselinePath: args.baseline,
      snapshotPath: args.snapshot || undefined
    });
    if (!result.passed) {
      console.error('finance regression failed');
      console.error(formatDiffs(result.diffs));
      process.exit(1);
    }
    console.log('finance regression passed');
    console.log(JSON.stringify({
      baselineId: result.baseline.baselineId,
      purpose: result.baseline.purpose || 'code_regression_guard',
      purposeLabel: result.baseline.purposeLabel || '代码门禁固定样本',
      notice: result.baseline.notice || '本结果只表示固定样本没有漂移，不是线上经营真实数。',
      metrics: result.metrics
    }, null, 2));
  } catch (error) {
    console.error(`finance regression failed: ${error.message}`);
    process.exit(1);
  }
}

if (require.main === module) {
  main();
}

module.exports = {
  DEFAULT_BASELINE_PATH,
  loadJsonFile,
  computeFinanceMetrics,
  compareMetrics,
  runFinanceRegression
};
