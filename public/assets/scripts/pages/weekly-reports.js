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

function weeklyReportStatusText(row = {}) {
  return row.status === 'failed' ? '生成失败' : '已生成';
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
        <div class="tms-page-head">
          <div>
            <div class="tms-section-header">顺义马坡每周周报</div>
            <div class="tms-audit-note">每周五 8 点生成，统计上周四到本周四。历史周报保存快照，手动重新生成会覆盖同周期数据。</div>
          </div>
          <button class="tms-btn tms-btn-primary" onclick="regenerateWeeklyReport()">重新生成本周周报</button>
        </div>
        <div class="tms-table-card">
          <div class="tms-table-wrapper">
            <table class="tms-table">
              <thead><tr><th style="padding-left:20px">周期</th><th>状态</th><th>生成时间</th><th>总收入</th><th>场地利用率</th><th>教练课时</th><th>线索数</th><th>备注</th><th>操作</th></tr></thead>
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
    <td><span class="tms-tag">${esc(weeklyReportStatusText(row))}</span></td>
    <td>${renderStandardCellText(String(row.generatedAt || '').slice(0, 16).replace('T', ' '), false)}</td>
    <td>${weeklyReportMoney(weeklyReportSummaryValue(row, 'totalIncome'))}</td>
    <td>${fmt(weeklyReportSummaryValue(row, 'courtUtilizationRate'))}%</td>
    <td>${fmt(weeklyReportSummaryValue(row, 'coachHours'))}</td>
    <td>${fmt(weeklyReportSummaryValue(row, 'totalLeads'))}</td>
    <td><div class="tms-text-remark" title="${esc(row.remark || '')}">${esc(row.remark || '-')}</div></td>
    <td>
      <button class="tms-action-link" onclick="openWeeklyReport('${esc(row.shareUrl || '')}')">查看</button>
      <button class="tms-action-link" onclick="copyWeeklyReportLink('${esc(row.shareUrl || '')}')">复制链接</button>
      <button class="tms-action-link" onclick="editWeeklyReportRemark('${esc(row.id || '')}')">备注</button>
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

async function regenerateWeeklyReport() {
  try {
    toast('正在生成周报...');
    await apiCall('POST', '/admin/weekly-business-reports/regenerate', {}, 60000);
    toast('周报已生成', 'success');
    renderWeeklyReports();
  } catch (e) {
    toast(`生成失败：${e.message || e}`, 'error');
  }
}

function editWeeklyReportRemark(id) {
  const row = weeklyReportsRows.find(item => item.id === id);
  if (!row) return;
  openStandardModal({title:'编辑备注', bodyHtml:`
    <div class="tms-form-grid">
      <div class="tms-form-item" style="grid-column:1/-1">
        <label class="tms-form-label">备注</label>
        <textarea class="finput" id="weeklyReportRemarkInput" rows="5" maxlength="2000">${esc(row.remark || '')}</textarea>
      </div>
    </div>
  `, actionsHtml:`<button class="tms-btn tms-btn-ghost" onclick="closeModal()">取消</button><button class="tms-btn tms-btn-primary" onclick="saveWeeklyReportRemark('${esc(id)}')">保存</button>`});
}

async function saveWeeklyReportRemark(id) {
  const input = document.getElementById('weeklyReportRemarkInput');
  try {
    await apiCall('POST', `/admin/weekly-business-reports/${encodeURIComponent(id)}/remark`, { remark: input ? input.value : '' }, 20000);
    closeModal();
    toast('备注已保存', 'success');
    renderWeeklyReports();
  } catch (e) {
    toast(`保存失败：${e.message || e}`, 'error');
  }
}
