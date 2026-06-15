const assert = require('assert');

const policy = require('../scripts/lib/finance-baseline-policy');

assert.ok(policy.assertCodeGuardBaseline, 'finance baseline policy should expose code guard validation');
assert.ok(policy.assertOperatingFinanceSnapshot, 'finance baseline policy should expose operating snapshot validation');
assert.ok(policy.resolveFinanceBaselineForMode, 'finance baseline policy should expose mode resolver');

assert.doesNotThrow(() => policy.assertCodeGuardBaseline({
  baselineId: 'finance-baseline-v2',
  purpose: 'code_regression_guard',
  notOperatingTruth: true,
  notice: '代码门禁固定样本，不是线上经营真实数'
}));

assert.throws(
  () => policy.assertCodeGuardBaseline({
    baselineId: 'bad-baseline',
    metrics: { membershipRecharge: 79000 }
  }),
  /代码门禁固定样本/,
  'code guard baseline must explicitly declare its purpose'
);

assert.doesNotThrow(() => policy.assertOperatingFinanceSnapshot({
  baselineType: 'operating_finance_snapshot',
  sourceOfTruth: 'online_readonly_snapshot',
  snapshotDate: '2026-06-15',
  generatedAt: '2026-06-15T15:30:00.000Z',
  summary: { financeOverview: { storedValueIncome: 137000 } }
}));

assert.throws(
  () => policy.assertOperatingFinanceSnapshot({
    baselineId: 'finance-baseline-v2',
    purpose: 'code_regression_guard',
    notOperatingTruth: true
  }),
  /经营财务每日快照/,
  'operating checks must reject the fixed code guard baseline'
);

assert.strictEqual(
  policy.resolveFinanceBaselineForMode({
    mode: 'code',
    codeBaseline: {
      baselineId: 'finance-baseline-v2',
      purpose: 'code_regression_guard',
      notOperatingTruth: true,
      notice: '不是线上经营真实数'
    }
  }).baselineId,
  'finance-baseline-v2'
);

assert.strictEqual(
  policy.resolveFinanceBaselineForMode({
    mode: 'operating',
    operatingSnapshot: {
      baselineType: 'operating_finance_snapshot',
      sourceOfTruth: 'online_readonly_snapshot',
      snapshotDate: '2026-06-15',
      generatedAt: '2026-06-15T15:30:00.000Z',
      summary: { financeOverview: { storedValueIncome: 137000 } }
    }
  }).snapshotDate,
  '2026-06-15'
);

assert.throws(
  () => policy.resolveFinanceBaselineForMode({
    mode: 'operating',
    codeBaseline: {
      baselineId: 'finance-baseline-v2',
      purpose: 'code_regression_guard',
      notOperatingTruth: true,
      notice: '不是线上经营真实数'
    }
  }),
  /不能用代码门禁基线对照经营真实数/,
  'resolver should prevent comparing operating finance against code guard baseline'
);

console.log('finance baseline policy tests passed');
