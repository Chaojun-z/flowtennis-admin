let weeklyReportsRows = [];
const weeklyRegenerationJobs = new Set();
const WEEKLY_REPORT_REQUEST_TIMEOUT_MS = 10000;
const WEEKLY_REPORT_RETRY_LIMIT = 120;
const WEEKLY_REPORT_RETRY_DELAY_MS = 5000;

function weeklyReportMoney(value) {
  return `¥${fmt(Number(value) || 0)}`;
}

function weeklyReportHours(value) {
  const number = Number(value) || 0;
  return number.toLocaleString('zh-CN', { maximumFractionDigits: 2 });
}

function weeklyReportPeriodText(row = {}) {
  const period = row.period || {};
  return `${period.startDate || '-'} 至 ${period.endDate || '-'}`;
}

function weeklyReportSummaryValue(row = {}, key = '') {
  return Number(row.summary?.[key]?.value) || 0;
}

function weeklyReportWeekText(row = {}) {
  return row.weekNumber ? `第 ${row.weekNumber} 周` : '-';
}

function weeklyReportGeneratedAtText(value = '') {
  if (!value) return '-';
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return String(value).slice(0, 16).replace('T', ' ');
  return date.toLocaleString('zh-CN', {
    timeZone: 'Asia/Shanghai',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    hour12: false
  }).replace(/\//g, '-');
}

async function loadWeeklyReports() {
  const data = await apiCall('GET', '/weekly-business-reports', null, 20000);
  weeklyReportsRows = Array.isArray(data.reports) ? data.reports : [];
}

async function renderWeeklyReports() {
  const host = document.getElementById('page-weekly-reports');
  if (!host) return;
  host.innerHTML = '<div class="tms-empty-state"><div class="tms-empty-title">周报加载中...</div></div>';
  try {
    await loadWeeklyReports();
    host.innerHTML = `
      <div class="section-stack">
        <div class="tms-table-card">
          <div class="tms-table-wrapper">
            <table class="tms-table weekly-report-table" style="width:100%;min-width:1180px;table-layout:fixed;font-size:12px">
              <colgroup><col style="width:210px"><col style="width:82px"><col style="width:150px"><col style="width:120px"><col style="width:120px"><col style="width:100px"><col style="width:132px"><col style="width:108px"><col style="width:190px"></colgroup>
              <thead><tr><th style="padding-left:20px;font-size:12px">周期</th><th style="font-size:12px">周次</th><th style="font-size:12px">生成时间</th><th style="font-size:12px">本周收款</th><th style="font-size:12px">核销入账</th><th style="font-size:12px">完成课时</th><th style="font-size:12px">场地使用时长</th><th style="font-size:12px">场地利用率</th><th class="tms-sticky-r" style="width:190px;padding-right:12px;text-align:right;font-size:12px">操作</th></tr></thead>
              <tbody>${weeklyReportsRows.length ? weeklyReportsRows.map(weeklyReportRowHtml).join('') : '<tr><td colspan="9"><div class="tms-empty-state"><div class="tms-empty-title">暂无周报</div></div></td></tr>'}</tbody>
            </table>
          </div>
        </div>
      </div>`;
  } catch (e) {
    host.innerHTML = `<div class="tms-empty-state"><div class="tms-empty-title">周报加载失败</div><div class="tms-empty-desc">${esc(e.message || e)}</div></div>`;
  }
}

function weeklyReportRowHtml(row = {}) {
  return `<tr>
    <td style="padding-left:20px">${renderStandardCellText(weeklyReportPeriodText(row), false)}</td>
    <td>${renderStandardCellText(weeklyReportWeekText(row), false)}</td>
    <td>${renderStandardCellText(weeklyReportGeneratedAtText(row.generatedAt), false)}</td>
    <td>${weeklyReportMoney(weeklyReportSummaryValue(row, 'cashReceived'))}</td>
    <td>${weeklyReportMoney(weeklyReportSummaryValue(row, 'totalIncome'))}</td>
    <td>${weeklyReportHours(weeklyReportSummaryValue(row, 'coachHours'))}</td>
    <td>${weeklyReportHours(weeklyReportSummaryValue(row, 'courtUsageHours'))}</td>
    <td>${fmt(weeklyReportSummaryValue(row, 'courtUtilizationRate'))}%</td>
    <td class="tms-sticky-r tms-action-cell" style="width:190px;padding-right:12px;text-align:right;font-size:12px">
      <span class="tms-action-link" onclick="openWeeklyReport('${esc(row.shareUrl || '')}')">查看</span>
      <span class="tms-action-link" onclick="copyWeeklyReportLink('${esc(row.shareUrl || '')}')">复制链接</span>
      <span class="tms-action-link" onclick="regenerateWeeklyReport('${esc(row.id || '')}')">重新生成</span>
    </td>
  </tr>`;
}

function openWeeklyReport(url) {
  if (!url) return toast('周报链接为空', 'error');
  window.open(url, '_blank');
}

async function copyWeeklyReportLink(url) {
  if (!url) return toast('周报链接为空', 'error');
  try {
    await navigator.clipboard.writeText(url);
    toast('链接已复制', 'success');
  } catch (e) {
    toast(url);
  }
}

async function regenerateWeeklyReport(id) {
  const row = weeklyReportsRows.find(item => item.id === id);
  if (!row) return toast('周报不存在', 'error');
  if (weeklyRegenerationJobs.has(id)) return;
  weeklyRegenerationJobs.add(id);
  const toastHandle = toast('正在生成周报...', '', { sticky: true });
  try {
    let result = null;
    for (let attempt = 0; attempt <= WEEKLY_REPORT_RETRY_LIMIT; attempt += 1) {
      try {
        result = await apiCall('POST', '/admin/weekly-business-reports/regenerate', { reportId: row.id, period: row.period || {} }, WEEKLY_REPORT_REQUEST_TIMEOUT_MS);
      } catch (error) {
        if (error?.status !== 202 || !error?.data?.preparing) throw error;
        result = error.data;
      }
      if (!result?.preparing || attempt >= WEEKLY_REPORT_RETRY_LIMIT) break;
      toastHandle.update(`周报数据准备中，${Math.round((attempt + 1) * WEEKLY_REPORT_RETRY_DELAY_MS / 1000)} 秒后自动重试...`);
      await new Promise(resolve => setTimeout(resolve, WEEKLY_REPORT_RETRY_DELAY_MS));
    }
    if (result?.preparing) {
      toastHandle.update('周报数据已进入后台准备，完成后可再次点击重新生成', 'warning');
      setTimeout(() => toastHandle.close(), 5000);
      return;
    }
    if (!result?.success) throw new Error(result?.error || '周报生成失败');
    toastHandle.update('周报已生成', 'success');
    setTimeout(() => toastHandle.close(), 3000);
    await renderWeeklyReports();
  } catch (e) {
    toastHandle.update(`生成失败：${e.message || e}`, 'error');
    setTimeout(() => toastHandle.close(), 5000);
  } finally {
    weeklyRegenerationJobs.delete(id);
  }
}
