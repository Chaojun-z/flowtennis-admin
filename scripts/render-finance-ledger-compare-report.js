#!/usr/bin/env node

const fs = require('fs');

const {
  buildShadowLedgerRowsFromFinanceNormalizedRows,
  idempotencyKeyFor
} = require('./lib/finance-ledger-read-model');

const MONEY_FIELDS = [
  ['cash', '实收'],
  ['recognized', '已入账'],
  ['deferred', '待确认']
];

function argValue(name) {
  const index = process.argv.indexOf(name);
  if (index === -1) return '';
  return process.argv[index + 1] || '';
}

function readJson(filePath) {
  return JSON.parse(fs.readFileSync(filePath, 'utf8'));
}

function rowsFromSnapshot(snapshot) {
  return {
    legacyRows: snapshot?.financePage?.normalizedRows || snapshot?.financePage?.financeNormalizedRows || [],
    ledgerRows: snapshot?.shadowLedgerRows || snapshot?.tables?.ft_financial_ledger?.rows || []
  };
}

function rowKey(row) {
  if (row?.idempotencyKey) return String(row.idempotencyKey);
  if (row?.sourceType || row?.sourceId || row?.ledgerType) return idempotencyKeyFor(row);
  return buildShadowLedgerRowsFromFinanceNormalizedRows([row])[0]?.idempotencyKey || '';
}

function addTrace(trace, row) {
  const operationId = String(row?.operationId || '').trim();
  const batchId = String(row?.batchId || '').trim();
  if (operationId) trace.operationIds.add(operationId);
  if (batchId) trace.batchIds.add(batchId);
}

function buildTraceIndex(snapshot) {
  const { legacyRows, ledgerRows } = rowsFromSnapshot(snapshot);
  const index = new Map();

  [...legacyRows, ...ledgerRows].forEach((row) => {
    const key = rowKey(row);
    if (!key) return;
    if (!index.has(key)) index.set(key, { operationIds: new Set(), batchIds: new Set() });
    addTrace(index.get(key), row);
  });

  return index;
}

function traceForItem(item, traceIndex) {
  const trace = {
    operationIds: new Set(),
    batchIds: new Set()
  };
  addTrace(trace, item);
  addTrace(trace, item?.legacy);
  addTrace(trace, item?.ledger);

  const indexed = traceIndex.get(String(item?.key || ''));
  if (indexed) {
    indexed.operationIds.forEach((value) => trace.operationIds.add(value));
    indexed.batchIds.forEach((value) => trace.batchIds.add(value));
  }

  return trace;
}

function formatMoney(value) {
  return (Number(value) || 0).toLocaleString('en-US', {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2
  });
}

function formatSummary(summary = {}) {
  return MONEY_FIELDS
    .map(([field, label]) => `${label} ${formatMoney(summary[field])}`)
    .join(' / ');
}

function escapeCell(value) {
  return String(value || '').replace(/\|/g, '\\|').replace(/\n/g, ' ');
}

function groupByType(items) {
  const counts = new Map();
  items.forEach((item) => {
    const type = String(item?.type || 'unknown');
    counts.set(type, (counts.get(type) || 0) + 1);
  });
  return [...counts.entries()].sort((a, b) => a[0].localeCompare(b[0]));
}

function renderTypeGroups(report) {
  const items = [...(report?.details || []), ...(report?.warnings || [])];
  if (!items.length) return '无差异。';

  const lines = [
    '| 差异类型 | 数量 |',
    '|---|---:|'
  ];
  groupByType(items).forEach(([type, count]) => {
    lines.push(`| ${escapeCell(type)} | ${count} |`);
  });
  return lines.join('\n');
}

function renderTraceRows(report, traceIndex) {
  const items = [...(report?.details || []), ...(report?.warnings || [])];
  if (!items.length) return '无涉及 operationId / batchId。';

  const lines = [
    '| 差异类型 | key | operationId | batchId | 备注 |',
    '|---|---|---|---|---|'
  ];

  items.forEach((item) => {
    const trace = traceForItem(item, traceIndex);
    const operationIds = [...trace.operationIds].join(', ') || '未提供';
    const batchIds = [...trace.batchIds].join(', ') || '未提供';
    const note = item?.reason || '';
    lines.push(`| ${escapeCell(item?.type || 'unknown')} | ${escapeCell(item?.key || '')} | ${escapeCell(operationIds)} | ${escapeCell(batchIds)} | ${escapeCell(note)} |`);
  });

  return lines.join('\n');
}

function switchRecommendation(report) {
  const detailCount = Array.isArray(report?.details) ? report.details.length : 0;
  if (report?.ok && detailCount === 0) return '不阻断发布，可继续观察后再切换';
  return '建议阻断发布，暂不切换';
}

function renderMarkdown(snapshot) {
  const report = snapshot?.shadowLedgerCompareReport;
  if (!report) throw new Error('快照缺少 shadowLedgerCompareReport');

  const traceIndex = buildTraceIndex(snapshot);
  const lines = [
    '# 财务影子账差异报告',
    '',
    `快照日期：${snapshot?.snapshotDate || '未提供'}`,
    `生成时间：${snapshot?.generatedAt || '未提供'}`,
    `是否通过：${report.ok ? '通过' : '未通过'}`,
    `旧账总额：${formatSummary(report.legacySummary)}`,
    `影子账总额：${formatSummary(report.shadowSummary)}`,
    `差异金额：${formatSummary(report.summaryDifference)}`,
    `发布/切换建议：${switchRecommendation(report)}`,
    '',
    '## 差异类型分组',
    '',
    renderTypeGroups(report),
    '',
    '## 涉及 operationId / batchId',
    '',
    renderTraceRows(report, traceIndex),
    ''
  ];

  return lines.join('\n');
}

function main() {
  const snapshotPath = argValue('--snapshot');
  if (!snapshotPath) {
    console.error('用法：node scripts/render-finance-ledger-compare-report.js --snapshot <snapshot.json>');
    process.exit(2);
  }

  const snapshot = readJson(snapshotPath);
  const markdown = renderMarkdown(snapshot);
  process.stdout.write(markdown);
  process.exit(snapshot.shadowLedgerCompareReport?.ok ? 0 : 1);
}

if (require.main === module) {
  main();
}

module.exports = {
  renderMarkdown,
  switchRecommendation
};
