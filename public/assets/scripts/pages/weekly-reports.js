let weeklyReportsRows = [];

function weeklyReportMoney(value) {
  return `¥${fmt(Number(value) || 0)}`;
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
            <table class="tms-table weekly-report-table" style="width:1180px;min-width:1180px;table-layout:fixed">
              <colgroup><col style="width:220px"><col style="width:88px"><col style="width:156px"><col style="width:120px"><col style="width:128px"><col style="width:116px"><col style="width:96px"><col style="width:80px"><col style="width:176px"></colgroup>
              <thead><tr><th style="padding-left:20px">周期</th><th>周次</th><th>生成时间</th><th>总收入</th><th>场地使用时长</th><th>场地利用率</th><th>教练课时</th><th>线索数</th><th class="tms-sticky-r" style="width:176px;padding-right:12px;text-align:right">操作</th></tr></thead>
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
    <td>${weeklyReportMoney(weeklyReportSummaryValue(row, 'totalIncome'))}</td>
    <td>${fmt(weeklyReportSummaryValue(row, 'courtUsageHours'))} 小时</td>
    <td>${fmt(weeklyReportSummaryValue(row, 'courtUtilizationRate'))}%</td>
    <td>${fmt(weeklyReportSummaryValue(row, 'coachHours'))}</td>
    <td>${fmt(weeklyReportSummaryValue(row, 'totalLeads'))}</td>
    <td class="tms-sticky-r tms-action-cell" style="width:176px;padding-right:12px;text-align:right">
      <button type="button" class="tms-btn tms-btn-ghost" onclick="openWeeklyReport('${esc(row.shareUrl || '')}')">查看</button>
      <button type="button" class="tms-btn tms-btn-ghost" onclick="copyWeeklyReportLink('${esc(row.shareUrl || '')}')">复制链接</button>
      <button type="button" class="tms-btn tms-btn-ghost" onclick="regenerateWeeklyReport('${esc(row.id || '')}')">重新生成</button>
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
  const pendingToast = toast('正在生成周报...', '', { sticky: true });
  try {
    await apiCall('POST', '/admin/weekly-business-reports/regenerate', { reportId: row.id, period: row.period || {} }, 10000);
    pendingToast.update('周报已生成', 'success');
    setTimeout(() => pendingToast.close(), 3000);
    renderWeeklyReports();
  } catch (e) {
    pendingToast.update(`生成失败：${e.message || e}`, 'error');
    setTimeout(() => pendingToast.close(), 5000);
  }
}
