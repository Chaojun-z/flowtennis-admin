const assert = require('assert');
const fs = require('fs');
const path = require('path');

const repoRoot = path.join(__dirname, '..');

function read(rel) {
  return fs.readFileSync(path.join(repoRoot, rel), 'utf8');
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

function assertNoLocalCoreMetric(rel, functionName, patterns) {
  const body = functionBody(read(rel), functionName);
  for (const [pattern, message] of patterns) {
    assert.doesNotMatch(body, pattern, `${rel} ${functionName}: ${message}`);
  }
}

assertNoLocalCoreMetric('public/assets/scripts/pages/leads.js', 'leadStatsData', [
  [/FlowTennisPlatformDataStandards\.leadFunnelStats/, '线索池顶部核心指标不得再使用前端兜底漏斗算法'],
  [/\bteachingSummary\b/, '线索池顶部不得绕过统一标准指标读取 teachingStudentViews 重新拼数'],
  [/leadStandardMetricValue\('courseChainStudents'\)/, '线索池顶部不得继续把普通学员作为历史学员展示'],
  [/leadStandardMetricValue\('formalStudents'\)/, '线索池顶部不得继续把正式学员作为在期学员展示'],
  [/\bleadTrialBooked\b/, '线索池顶部不得在页面内判断预约体验客户'],
  [/\bleadRateText\b/, '线索池顶部不得在页面内重新计算转化率文本']
]);

assertNoLocalCoreMetric('public/assets/scripts/pages/students.js', 'studentPageStats', [
  [/base\.filter\(s=>studentTrialPathStatusText\(s\)===/, '普通/正式学员顶部不得按当前列表本地统计体验阶段'],
  [/base\.filter\(studentHasTrialPathEvidence\)/, '普通/正式学员顶部不得本地统计体验路径学员'],
  [/studentHasTrialPathEvidence\(s\)&&studentIsFormalCourseDeal\(s\)/, '普通/正式学员顶部不得本地统计体验路径成交'],
  [/!studentHasTrialPathEvidence\(s\)&&studentIsFormalCourseDeal\(s\)/, '普通/正式学员顶部不得本地统计直接成交学员'],
  [/studentStatsDirectCourseRows\(\)/, '普通/正式学员顶部不得本地聚合直接收款课程收入'],
  [/studentTrialStats\(\)/, '普通/正式学员顶部不得使用本地体验课统计兜底']
]);

assertNoLocalCoreMetric('public/assets/scripts/pages/operations.js', 'renderConversionFunnelModule', [
  [/operationsFunnelSummary\(conversion\.courseFunnel\s*\|\|\s*\[\]\)/, '转化与留存漏斗不得继续读取旧 courseFunnel 重新算百分比'],
  [/\(conversion\.courseFunnel\s*\|\|\s*\[\]\)\.length/, '转化与留存漏斗不得用旧 courseFunnel 判断是否有数据']
]);

const operationsMetricsSource = read('server/metrics/operations-metrics.js');
assert.match(
  functionBody(operationsMetricsSource, 'isValidCoursePurchase'),
  /体验\|赠课\|赠送\|测试/,
  '经营分析课包复购必须排除体验、赠课、测试类购买'
);
assert.match(
  functionBody(operationsMetricsSource, 'buildPeriodRepurchaseMetrics'),
  /\.filter\(isValidCoursePurchase\)/,
  '经营分析课包复购必须复用正式课包有效购买过滤器'
);
assert.doesNotMatch(
  functionBody(operationsMetricsSource, 'buildConversionTrendDailyRows'),
  /totalDealRate:\s*rate\(formalRows\.length,\s*cumulativeRows\.length\)[\s\S]*courseDealRate:\s*rate\(formalRows\.length,\s*cumulativeRows\.length\)/,
  '总成交转化率趋势不得和课程成交率趋势共用同一个正式学员/线索公式'
);
assert.match(
  functionBody(operationsMetricsSource, 'buildConversionTrendDailyRows'),
  /const cohortRows = rows \|\| \[\];[\s\S]*totalDealRateDenominator:\s*cohortRows\.length/,
  '转化趋势必须使用固定线索样本池作为分母'
);
assert.doesNotMatch(
  functionBody(operationsMetricsSource, 'buildConversionTrendDailyRows'),
  /totalDealRateDenominator:\s*cumulativeRows\.length|courseDealRateDenominator:\s*cumulativeRows\.length/,
  '转化趋势不得退回“截至当天出现过的线索数”作为分母'
);
assert.match(
  functionBody(operationsMetricsSource, 'buildCoachTrendSet'),
  /rateFields:\s*\[[\s\S]*trialConversionRateNumerator[\s\S]*trialConversionRateDenominator[\s\S]*renewalRateNumerator[\s\S]*renewalRateDenominator/,
  '教练人效率类趋势必须用分子分母重算，不能平均每日百分比'
);
assert.doesNotMatch(
  functionBody(operationsMetricsSource, 'buildCoachTrendSet'),
  /averageKeys:\s*\[[^\]]*trialConversionRate|averageKeys:\s*\[[^\]]*renewalRate/,
  '教练人效体验转化率和续费率不得退回日百分比平均'
);
assert.doesNotMatch(
  operationsMetricsSource,
  /function buildCourtChainMetrics\(/,
  '经营分析订场链不得保留自己扫描 courts/membershipAccounts/membershipOrders 的第二套公式'
);
assert.match(
  functionBody(operationsMetricsSource, 'buildCourtChainFromSource'),
  /buildCourtChainMetricsFromItems\(buildCourtAccountListViewFromData\(source\)\.items/,
  '经营分析订场链必须从统一订场/会员读模型派生'
);
assert.doesNotMatch(
  operationsMetricsSource,
  /function buildConversionFilteredViews|filteredViews:\s*buildConversionFilteredViews|filterOptions:\s*buildConversionFilterOptions|studentAttributeRows:/,
  '转化与留存不得再输出局部筛选或人群画像自算读模型'
);
assert.match(
  functionBody(operationsMetricsSource, 'buildOperationsMetrics'),
  /teachingStandardLifecycleMetrics[\s\S]*buildStandardLifecycleMetrics\(\{[\s\S]*customerLifecycleRows:\s*teachingCustomerLifecycleRows/,
  '转化与留存课程漏斗必须从客户中心教学读模型生成'
);
assert.doesNotMatch(
  functionBody(operationsMetricsSource, 'buildOperationsMetrics'),
  /standardLifecycleMetrics:\s*\{[\s\S]*\.\.\.standardLifecycleMetrics/,
  '转化与留存不能把 operations 自己的生命周期指标作为课程漏斗输出'
);

const packageJson = JSON.parse(read('package.json'));
assert.ok(
  packageJson.scripts.test.includes('node tests/platform-core-metric-hard-gate.test.js'),
  'npm test must include platform-core-metric-hard-gate.test.js'
);
assert.ok(
  packageJson.scripts.test.includes('node tests/conversion-retention-cross-page-hard-gate.test.js'),
  'npm test must include conversion-retention-cross-page-hard-gate.test.js'
);
assert.ok(
  packageJson.scripts['guard:release'].includes('npm test'),
  'release guard must include npm test so the core metric hard gate runs in CI'
);

console.log('platform core metric hard gate tests passed');
