function assertCodeGuardBaseline(baseline = {}) {
  if (baseline.purpose !== 'code_regression_guard' || baseline.notOperatingTruth !== true) {
    throw new Error('财务代码门禁基线必须明确标注为代码门禁固定样本，且不能作为线上经营真实数');
  }
  if (!/不是线上经营真实数/.test(String(baseline.notice || ''))) {
    throw new Error('财务代码门禁基线必须写明：不是线上经营真实数');
  }
  return baseline;
}

function assertOperatingFinanceSnapshot(snapshot = {}) {
  if (
    snapshot.baselineType !== 'operating_finance_snapshot' ||
    snapshot.sourceOfTruth !== 'online_readonly_snapshot'
  ) {
    throw new Error('经营财务核对必须使用经营财务每日快照，不能使用代码门禁固定样本');
  }
  if (!snapshot.snapshotDate || !snapshot.generatedAt) {
    throw new Error('经营财务每日快照必须包含 snapshotDate 和 generatedAt');
  }
  if (!snapshot.summary || !snapshot.summary.financeOverview) {
    throw new Error('经营财务每日快照必须包含财务总览汇总');
  }
  return snapshot;
}

function resolveFinanceBaselineForMode({ mode = 'code', codeBaseline = null, operatingSnapshot = null } = {}) {
  if (mode === 'code') return assertCodeGuardBaseline(codeBaseline || {});
  if (mode === 'operating') {
    if (!operatingSnapshot && codeBaseline) throw new Error('不能用代码门禁基线对照经营真实数');
    return assertOperatingFinanceSnapshot(operatingSnapshot || {});
  }
  throw new Error(`未知财务基线模式：${mode}`);
}

module.exports = {
  assertCodeGuardBaseline,
  assertOperatingFinanceSnapshot,
  resolveFinanceBaselineForMode
};
