const crypto = require('crypto');

const WEEKLY_REPORT_CAMPUS_NAME = '顺义马坡';
const WEEKLY_REPORT_TIMEZONE = 'Asia/Shanghai';
const WEEKLY_REPORT_TABLE = 'ft_weekly_business_reports';

function dateKeyUtcMs(day) {
  const match = String(day || '').match(/^(\d{4})-(\d{2})-(\d{2})$/);
  if (!match) return null;
  return Date.UTC(Number(match[1]), Number(match[2]) - 1, Number(match[3]));
}

function addUtcDays(day, offset) {
  const ms = dateKeyUtcMs(day);
  if (ms == null) return '';
  return new Date(ms + offset * 86400000).toISOString().slice(0, 10);
}

function beijingDateKey(value = new Date()) {
  const date = value instanceof Date ? value : new Date(value);
  if (Number.isNaN(date.getTime())) return String(value || '').slice(0, 10);
  return new Intl.DateTimeFormat('en-CA', {
    timeZone: WEEKLY_REPORT_TIMEZONE,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit'
  }).format(date);
}

function dayOfWeekUtc(day) {
  const ms = dateKeyUtcMs(day);
  if (ms == null) return 0;
  return new Date(ms).getUTCDay();
}

function resolveWeeklyBusinessReportPeriod(now = new Date()) {
  const today = beijingDateKey(now);
  const weekday = dayOfWeekUtc(today);
  const daysSinceThursday = (weekday - 4 + 7) % 7;
  const endDate = addUtcDays(today, -daysSinceThursday);
  const startDate = addUtcDays(endDate, -7);
  const previousEndDate = addUtcDays(startDate, -1);
  const previousStartDate = addUtcDays(previousEndDate, -7);
  return {
    startDate,
    endDate,
    previousStartDate,
    previousEndDate,
    timezone: WEEKLY_REPORT_TIMEZONE
  };
}

function numberValue(value) {
  const n = Number(value);
  return Number.isFinite(n) ? Math.round(n * 100) / 100 : 0;
}

function cardValue(payload = {}, path = []) {
  let current = payload?.operations || payload;
  for (const key of path) current = current?.[key];
  return numberValue(current?.value ?? current);
}

function compareMetric(currentValue, previousValue) {
  const current = numberValue(currentValue);
  const previous = numberValue(previousValue);
  const changeValue = numberValue(current - previous);
  return {
    currentValue: current,
    previousValue: previous,
    changeValue,
    changeRate: previous ? numberValue(changeValue * 100 / previous) : null
  };
}

function normalizeRows(rows = []) {
  return Array.isArray(rows) ? rows.filter(Boolean) : [];
}

function findFreeCourtUsage(court = {}) {
  const rows = [
    ...normalizeRows(court.usageMixRows),
    ...normalizeRows(court.rows),
    ...normalizeRows(court.typeRows),
    ...normalizeRows(court.categoryRows)
  ];
  const freeRows = rows.filter(row => /免费/.test(String(row.type || row.category || row.name || row.label || '')));
  return freeRows.reduce((acc, row) => ({
    count: acc.count + numberValue(row.count || row.times || row.bookingCount),
    hours: acc.hours + numberValue(row.hours || row.durationHours || row.bookingHours),
    amount: acc.amount + numberValue(row.amount || row.actualAmount || row.cashAmount),
    receivableAmount: acc.receivableAmount + numberValue(row.receivableAmount || row.originalAmount || row.concessionAmount || row.discountAmount)
  }), { count: 0, hours: 0, amount: 0, receivableAmount: 0 });
}

function buildReportId(period = {}) {
  return `weekly:${WEEKLY_REPORT_CAMPUS_NAME}:${period.startDate}:${period.endDate}`;
}

function normalizeBaseUrl(baseUrl = '') {
  return String(baseUrl || 'https://www.flowtennis.cn').trim().replace(/\/+$/, '');
}

function buildWeeklyBusinessReportSnapshot({
  period,
  campusName = WEEKLY_REPORT_CAMPUS_NAME,
  operationsPayload = {},
  previousOperationsPayload = {},
  shareToken = '',
  baseUrl = 'https://www.flowtennis.cn',
  generatedAt = new Date().toISOString(),
  generationMode = 'auto'
} = {}) {
  const operations = operationsPayload.operations || {};
  const previous = previousOperationsPayload.operations || {};
  const token = String(shareToken || crypto.randomBytes(16).toString('hex')).trim();
  const totalIncome = cardValue(operations, ['overview', 'cards', 'totalIncome']);
  const previousTotalIncome = cardValue(previous, ['overview', 'cards', 'totalIncome']);
  const utilizationRate = cardValue(operations, ['court', 'cards', 'utilizationRate']);
  const coachHours = cardValue(operations, ['coach', 'cards', 'usedHours']);
  const totalLeads = cardValue(operations, ['conversion', 'cards', 'totalLeads']);
  return {
    id: buildReportId(period),
    campusName,
    period,
    generatedAt,
    generationMode,
    shareToken: token,
    shareUrl: `${normalizeBaseUrl(baseUrl)}/weekly-reports/${encodeURIComponent(token)}`,
    summary: {
      totalIncome: { value: totalIncome, compare: compareMetric(totalIncome, previousTotalIncome) },
      recognizedRevenue: { value: cardValue(operations, ['overview', 'cards', 'recognizedRevenue']) },
      courtUtilizationRate: { value: utilizationRate, compare: compareMetric(utilizationRate, cardValue(previous, ['court', 'cards', 'utilizationRate'])) },
      coachHours: { value: coachHours, compare: compareMetric(coachHours, cardValue(previous, ['coach', 'cards', 'usedHours'])) },
      totalLeads: { value: totalLeads, compare: compareMetric(totalLeads, cardValue(previous, ['conversion', 'cards', 'totalLeads'])) }
    },
    sections: {
      revenue: operations.overview || {},
      court: {
        ...(operations.court || {}),
        freeUsage: findFreeCourtUsage(operations.court || {})
      },
      coach: operations.coach || {},
      conversion: operations.conversion || {},
      detailsMode: 'summary-only'
    }
  };
}

function escapeHtml(value) {
  return String(value ?? '').replace(/[&<>"']/g, ch => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[ch]));
}

function metricBlock(label, value, suffix = '') {
  return `<section class="metric"><span>${escapeHtml(label)}</span><strong>${escapeHtml(value)}${escapeHtml(suffix)}</strong></section>`;
}

function renderRows(rows = [], columns = []) {
  if (!rows.length) return '<p class="empty">暂无数据</p>';
  return `<table><thead><tr>${columns.map(col => `<th>${escapeHtml(col.label)}</th>`).join('')}</tr></thead><tbody>${rows.map(row => `<tr>${columns.map(col => `<td>${escapeHtml(row[col.key] ?? '-')}</td>`).join('')}</tr>`).join('')}</tbody></table>`;
}

function renderWeeklyBusinessReportHtml(snapshot = {}, { remark = '' } = {}) {
  const period = snapshot.period || {};
  const summary = snapshot.summary || {};
  const sections = snapshot.sections || {};
  const coachRows = normalizeRows(sections.coach?.rows);
  const sourceRows = normalizeRows(sections.conversion?.sourceRows);
  const freeUsage = sections.court?.freeUsage || {};
  return `<!doctype html>
<html lang="zh-CN">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width,initial-scale=1">
  <title>${escapeHtml(snapshot.campusName || WEEKLY_REPORT_CAMPUS_NAME)}周报</title>
  <style>
    body{margin:0;background:#f6f7f9;color:#172033;font-family:-apple-system,BlinkMacSystemFont,"Segoe UI",sans-serif}
    main{max-width:1080px;margin:0 auto;padding:32px 20px 48px}
    h1{font-size:28px;margin:0 0 8px} h2{font-size:18px;margin:28px 0 12px}
    .muted{color:#667085}.grid{display:grid;grid-template-columns:repeat(5,minmax(0,1fr));gap:12px}
    .metric{background:#fff;border:1px solid #e5e7eb;border-radius:8px;padding:14px}
    .metric span{display:block;color:#667085;font-size:13px}.metric strong{display:block;margin-top:8px;font-size:22px}
    table{width:100%;border-collapse:collapse;background:#fff;border:1px solid #e5e7eb;border-radius:8px;overflow:hidden}
    th,td{text-align:left;padding:10px 12px;border-bottom:1px solid #eef0f3;font-size:14px}th{color:#475467;background:#fafafa}
    .remark{white-space:pre-wrap;background:#fff;border:1px solid #e5e7eb;border-radius:8px;padding:14px}.empty{color:#667085}
    @media(max-width:760px){.grid{grid-template-columns:repeat(2,minmax(0,1fr))}main{padding:24px 14px}.metric strong{font-size:19px}}
  </style>
</head>
<body>
<main>
  <h1>${escapeHtml(snapshot.campusName || WEEKLY_REPORT_CAMPUS_NAME)}周报</h1>
  <p class="muted">${escapeHtml(period.startDate)} 至 ${escapeHtml(period.endDate)}</p>
  <div class="grid">
    ${metricBlock('总收入', summary.totalIncome?.value || 0, ' 元')}
    ${metricBlock('已入账', summary.recognizedRevenue?.value || 0, ' 元')}
    ${metricBlock('场地利用率', summary.courtUtilizationRate?.value || 0, '%')}
    ${metricBlock('教练课时', summary.coachHours?.value || 0, ' 小时')}
    ${metricBlock('线索数', summary.totalLeads?.value || 0, ' 条')}
  </div>
  <h2>免费场地</h2>
  <div class="grid">
    ${metricBlock('免费次数', freeUsage.count || 0, ' 次')}
    ${metricBlock('免费时长', freeUsage.hours || 0, ' 小时')}
    ${metricBlock('实收金额', freeUsage.amount || 0, ' 元')}
    ${metricBlock('应收让利', freeUsage.receivableAmount || 0, ' 元')}
  </div>
  <h2>教练课时汇总</h2>
  ${renderRows(coachRows, [
    { key: 'coach', label: '教练' },
    { key: 'privateLessons', label: '私教课' },
    { key: 'smallClassLessons', label: '小班课' },
    { key: 'trialLessons', label: '体验课' },
    { key: 'specialLessons', label: '专项课' },
    { key: 'sparringLessons', label: '陪打' }
  ])}
  <h2>线索渠道汇总</h2>
  ${renderRows(sourceRows, [
    { key: 'source', label: '渠道' },
    { key: 'totalLeads', label: '线索数' },
    { key: 'trialAttended', label: '体验线索' },
    { key: 'trialPathDealCustomers', label: '体验后报名' }
  ])}
  <h2>备注</h2>
  <p class="remark">${escapeHtml(remark || '暂无备注')}</p>
</main>
</body>
</html>`;
}

function buildWeeklyBusinessReportFeishuText({ snapshot = null, period = null, status = 'success', error = '' } = {}) {
  const p = snapshot?.period || period || {};
  if (status === 'failure') {
    return `顺义马坡周报生成失败：${p.startDate || '-'} 至 ${p.endDate || '-'}，原因：${String(error || '未知错误').slice(0, 80)}`;
  }
  return `顺义马坡周报已生成：${p.startDate || '-'} 至 ${p.endDate || '-'}，点击查看：${snapshot?.shareUrl || ''}`;
}

async function sendWeeklyBusinessReportFeishuText({ text = '', webhook = '', fetchImpl = fetch } = {}) {
  const targetWebhook = String(webhook || '').trim();
  if (!targetWebhook) return { sent: false, skipped: true, reason: 'missing_webhook' };
  const response = await fetchImpl(targetWebhook, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ msg_type: 'text', content: { text: String(text || '') } })
  });
  const raw = await response.text();
  let data = null;
  try { data = raw ? JSON.parse(raw) : null; } catch { data = { raw }; }
  if (!response.ok) throw new Error(`飞书接口 HTTP ${response.status}`);
  if (data && data.code !== undefined && data.code !== 0) throw new Error(`飞书接口返回失败：${data.msg || data.message || data.code}`);
  return { sent: true };
}

function reportView(row = {}) {
  return {
    id: row.id,
    campusName: row.campusName || WEEKLY_REPORT_CAMPUS_NAME,
    period: row.period || {},
    generatedAt: row.generatedAt || '',
    generationMode: row.generationMode || '',
    status: row.status || 'success',
    shareUrl: row.shareUrl || '',
    remark: row.remark || '',
    summary: row.summary || {}
  };
}

async function listWeeklyBusinessReports({ scan, table = WEEKLY_REPORT_TABLE } = {}) {
  const rows = await scan(table).catch(() => []);
  return rows
    .filter(row => row && row.status !== 'deleted')
    .sort((a, b) => String(b.period?.endDate || b.generatedAt || '').localeCompare(String(a.period?.endDate || a.generatedAt || '')))
    .map(reportView);
}

async function findWeeklyBusinessReportByToken({ scan, token = '', table = WEEKLY_REPORT_TABLE } = {}) {
  const target = String(token || '').trim();
  if (!target) return null;
  const rows = await scan(table).catch(() => []);
  return rows.find(row => String(row.shareToken || '') === target && row.status !== 'deleted') || null;
}

async function updateWeeklyBusinessReportRemark({ get, put, id = '', remark = '', user = {}, table = WEEKLY_REPORT_TABLE } = {}) {
  const report = await get(table, id);
  if (!report) {
    const err = new Error('周报不存在');
    err.statusCode = 404;
    throw err;
  }
  const next = {
    ...report,
    remark: String(remark || '').slice(0, 2000),
    remarkUpdatedAt: new Date().toISOString(),
    remarkUpdatedBy: user.name || user.id || ''
  };
  await put(table, id, next);
  return reportView(next);
}

async function generateWeeklyBusinessReport({
  loadOperationsPayload,
  get,
  put,
  mkTable = async () => {},
  period = resolveWeeklyBusinessReportPeriod(),
  baseUrl = 'https://www.flowtennis.cn',
  generationMode = 'auto',
  user = { id: 'weekly-report-system', role: 'admin', dataScope: 'all' },
  table = WEEKLY_REPORT_TABLE
} = {}) {
  if (typeof loadOperationsPayload !== 'function') throw new Error('缺少周报数据读取器');
  await mkTable(table).catch(() => null);
  const scope = {
    campusName: WEEKLY_REPORT_CAMPUS_NAME,
    dateRange: { startDate: period.startDate, endDate: period.endDate },
    metricScope: { campusName: WEEKLY_REPORT_CAMPUS_NAME, startDate: period.startDate, endDate: period.endDate }
  };
  const previousScope = {
    campusName: WEEKLY_REPORT_CAMPUS_NAME,
    dateRange: { startDate: period.previousStartDate, endDate: period.previousEndDate },
    metricScope: { campusName: WEEKLY_REPORT_CAMPUS_NAME, startDate: period.previousStartDate, endDate: period.previousEndDate }
  };
  const existing = get ? await get(table, buildReportId(period)).catch(() => null) : null;
  const [operationsPayload, previousOperationsPayload] = await Promise.all([
    loadOperationsPayload({ user, scope }),
    loadOperationsPayload({ user, scope: previousScope })
  ]);
  const snapshot = buildWeeklyBusinessReportSnapshot({
    period,
    operationsPayload,
    previousOperationsPayload,
    shareToken: existing?.shareToken || '',
    baseUrl,
    generationMode
  });
  const row = {
    ...snapshot,
    status: 'success',
    remark: existing?.remark || '',
    html: renderWeeklyBusinessReportHtml(snapshot, { remark: existing?.remark || '' })
  };
  await put(table, row.id, row);
  return row;
}

module.exports = {
  WEEKLY_REPORT_CAMPUS_NAME,
  WEEKLY_REPORT_TABLE,
  resolveWeeklyBusinessReportPeriod,
  buildWeeklyBusinessReportSnapshot,
  renderWeeklyBusinessReportHtml,
  buildWeeklyBusinessReportFeishuText,
  sendWeeklyBusinessReportFeishuText,
  listWeeklyBusinessReports,
  findWeeklyBusinessReportByToken,
  updateWeeklyBusinessReportRemark,
  generateWeeklyBusinessReport
};
