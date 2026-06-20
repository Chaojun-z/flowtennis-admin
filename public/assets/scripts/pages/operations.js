let operationsActiveTab = 'court';
let operationsConversionFilters = { source: '', campus: '', coach: '' };
let operationsActiveCourtHeatCampus = '顺义马坡';
const operationsCourtHeatCampusTabs = ['顺义马坡', '朝阳十里堡', '蓝色港湾', '国网', '朝珺私教'];

function operationsMetricCards(cards = {}) {
  return Object.values(cards || {}).map(item => ({
    title: item.title,
    valueHtml: `${fmt(item.value)}${item.unit ? `<span class="tms-stat-percent">${esc(item.unit)}</span>` : ''}`,
    caption: item.caption || ''
  }));
}

function operationsSection(title, body) {
  return `<section class="operations-section"><div class="tms-section-header">${esc(title)}</div>${body}</section>`;
}

function operationsChartCard(title, id, height = 260) {
  return `<div class="operations-chart-card"><div class="operations-card-title">${esc(title)}</div><div class="operations-chart-host" id="${esc(id)}" style="height:${height}px"></div></div>`;
}

function operationsRateTone(value) {
  const percent = Number(value) || 0;
  if (percent < 40) return 'danger';
  if (percent < 70) return 'warn';
  return 'good';
}

function operationsPercentBar(value) {
  const percent = Math.max(0, Math.min(100, Number(value) || 0));
  return `<div class="operations-rate-cell"><span class="operations-rate-track ${operationsRateTone(percent)}"><i style="width:${percent}%"></i></span><strong>${fmt(percent)}%</strong></div>`;
}

function operationsCourtStatus(row = {}, averages = {}) {
  const amount = Number(row.bookingAmount) || 0;
  const count = Number(row.bookingCount) || 0;
  const utilization = Number(row.utilizationRate) || 0;
  const trial = Number(row.trialConversionRate) || 0;
  const repeat = Number(row.repeatCustomerConversionRate) || 0;
  if (!(amount || count || utilization || trial || repeat)) return { label: '', tone: 'idle' };
  if (amount >= (averages.revenue || 0) && utilization >= (averages.utilization || 0)) return { label: '核心标杆', tone: 'good' };
  if (amount >= (averages.revenue || 0)) return { label: '收入主力', tone: 'revenue' };
  if (utilization >= (averages.utilization || 0)) return { label: '效率潜力', tone: 'potential' };
  return { label: '需关注', tone: 'watch' };
}

function operationsCourtAverages(rows = []) {
  const active = (rows || []).filter(row => (
    (Number(row.bookingAmount) || 0) ||
    (Number(row.bookingCount) || 0) ||
    (Number(row.utilizationRate) || 0) ||
    (Number(row.trialConversionRate) || 0) ||
    (Number(row.repeatCustomerConversionRate) || 0)
  ));
  if (!active.length) return { revenue: 0, utilization: 0 };
  return {
    revenue: active.reduce((sum, row) => sum + (Number(row.bookingAmount) || 0), 0) / active.length,
    utilization: active.reduce((sum, row) => sum + (Number(row.utilizationRate) || 0), 0) / active.length
  };
}

function operationsRankingMetric(label, value, maxValue, type, tone) {
  const raw = Number(value) || 0;
  const percent = type === 'rate'
    ? Math.max(0, Math.min(100, raw))
    : Math.max(0, Math.min(100, maxValue ? (raw * 100 / maxValue) : 0));
  const text = type === 'money' ? operationsMoneyText(raw) : type === 'count' ? fmt(raw) : `${fmt(raw)}%`;
  return `<div class="operations-court-ranking-metric ${esc(tone)}">
    <div class="operations-court-ranking-label"><span>${esc(label)}</span><strong>${esc(text)}</strong></div>
    <span class="operations-court-ranking-track"><i style="width:${percent}%"></i></span>
  </div>`;
}

function operationsAttributeMetric(label, value) {
  const percent = Math.max(0, Math.min(100, Number(value) || 0));
  return `<div class="operations-attribute-metric">
    <div class="operations-attribute-metric-head"><span>${esc(label)}</span><strong>${fmt(percent)}%</strong></div>
    <span class="operations-rate-track ${operationsRateTone(percent)}"><i style="width:${percent}%"></i></span>
  </div>`;
}

function operationsSimpleTable(columns = [], rows = [], emptyText = '暂无数据') {
  const header = columns.map(col => `<th>${esc(col.label)}</th>`).join('');
  const body = rows.length ? rows.map(row => `<tr>${columns.map(col => {
    const value = typeof col.render === 'function' ? col.render(row) : row[col.key];
    return `<td>${col.html ? value : renderStandardCellText(value, false)}</td>`;
  }).join('')}</tr>`).join('') : `<tr><td colspan="${columns.length}"><div class="tms-empty-state"><div class="tms-empty-title">${esc(emptyText)}</div></div></td></tr>`;
  return `<div class="tms-table-card"><div class="tms-table-wrapper"><table class="tms-table"><thead><tr>${header}</tr></thead><tbody>${body}</tbody></table></div></div>`;
}

function setOperationsTab(tab) {
  operationsActiveTab = tab === 'court' ? 'court' : 'court';
  if (currentPage === 'operations') {
    document.querySelectorAll('.sb-item[data-nav-page="operations"]').forEach(item => {
      item.classList.toggle('active', item.dataset.operationsTab === operationsActiveTab);
    });
    const topTitle = document.getElementById('topTitle');
    if (topTitle && typeof renderTopTitleHtml === 'function') topTitle.innerHTML = renderTopTitleHtml('operations');
    renderOperations();
  }
}

function setOperationsConversionFilter() {
  operationsConversionFilters = {
    source: document.getElementById('operationsConversionSource')?.value || '',
    campus: document.getElementById('operationsConversionCampus')?.value || '',
    coach: document.getElementById('operationsConversionCoach')?.value || ''
  };
  renderOperations();
}

function renderOperationsLoading() {
  const host = document.getElementById('page-operations');
  if (!host) return;
  if (operationsActiveTab === 'court') {
    host.innerHTML = `<div class="operations-page">
      <div class="operations-court-skeleton-grid">
        <div class="operations-skeleton-panel"></div>
        <div class="operations-skeleton-panel"></div>
      </div>
      <div class="operations-skeleton-panel operations-court-skeleton-heat"></div>
    </div>`;
    return;
  }
  host.innerHTML = `<div class="operations-page"><div class="operations-skeleton-grid">
    ${[1,2,3,4].map(() => '<div class="operations-skeleton-card"><span></span><strong></strong></div>').join('')}
  </div><div class="operations-chart-grid">
    <div class="operations-skeleton-panel"></div><div class="operations-skeleton-panel"></div>
  </div></div>`;
}

function renderOperationsOverview(data) {
  const cards = renderStandardDataCards(operationsMetricCards(data.overview?.cards));
  return `${operationsSection('关键指标', `<div class="tms-stats-row">${cards}</div>`)}
  <div class="operations-chart-grid">
    ${operationsChartCard('收入结构', 'operationsRevenueMixChart')}
    ${operationsChartCard('线索转化漏斗', 'operationsLeadFunnelChart')}
  </div>`;
}

function operationsMoneyText(value) {
  return `¥${fmt(Number(value) || 0)}`;
}

function operationsCourtHeatTone(value, minutes = 0) {
  const rate = Number(value) || 0;
  const usedMinutes = Number(minutes) || 0;
  if (rate >= 80) return 'full';
  if (rate >= 60) return 'steady';
  if (rate >= 35) return 'medium';
  if (usedMinutes > 0) return 'low';
  return 'idle';
}

function operationsCourtHeatStyle(value, minutes = 0) {
  const rate = Math.max(0, Math.min(100, Number(value) || 0));
  const usedMinutes = Number(minutes) || 0;
  if (!usedMinutes) return '';
  const lightness = Math.round(88 - rate * 0.5);
  const borderLightness = Math.max(34, lightness - 8);
  return `background:hsl(214 86% ${lightness}%);border-color:hsl(214 76% ${borderLightness}%);`;
}

function operationsCourtHeatVenueName(venue = {}) {
  const raw = String(venue.venueName || '').trim();
  const legacyUnmatchedVenueNames = ['历史' + '未匹配场地'];
  if (venue.isUnmatched || raw === '未匹配' || legacyUnmatchedVenueNames.includes(raw)) return '未匹配';
  return raw || '-';
}

function renderOperationsCourtComparison(data) {
  return `<section class="operations-section">
    <div class="operations-module-head"><div><h3>校区经营象限</h3><span>收入、利用率与转化表现综合定位</span></div></div>
    <div class="operations-chart-host operations-court-comparison-chart" id="operationsCourtComparisonChart"></div>
  </section>`;
}

function renderOperationsCourtCampusOverview(data) {
  const rows = data.court?.campusRows || [];
  const averages = operationsCourtAverages(rows);
  const maxRevenue = Math.max(1, ...rows.map(row => Number(row.bookingAmount) || 0));
  const maxCount = Math.max(1, ...rows.map(row => Number(row.bookingCount) || 0));
  const sortedRows = [...rows].sort((a, b) => (Number(b.bookingAmount) || 0) - (Number(a.bookingAmount) || 0) || (Number(b.utilizationRate) || 0) - (Number(a.utilizationRate) || 0));
  const body = sortedRows.length ? `<div class="operations-court-ranking-matrix">
    ${sortedRows.map(row => {
      const status = operationsCourtStatus(row, averages);
      return `<div class="operations-court-ranking-row">
        <div class="operations-court-ranking-campus">
          <strong>${esc(row.campusName || '-')}</strong>
          ${status.label ? `<span class="operations-court-status-badge ${esc(status.tone)}">${esc(status.label)}</span>` : ''}
        </div>
        <div class="operations-court-ranking-bars">
          ${operationsRankingMetric('订场收入', row.bookingAmount, maxRevenue, 'money', 'revenue')}
          ${operationsRankingMetric('订场场次', row.bookingCount, maxCount, 'count', 'count')}
          ${operationsRankingMetric('场地利用率', row.utilizationRate, 100, 'rate', 'utilization')}
          ${operationsRankingMetric('体验转化', row.trialConversionRate, 100, 'rate', 'trial')}
          ${operationsRankingMetric('老客转化', row.repeatCustomerConversionRate, 100, 'rate', 'repeat')}
        </div>
      </div>`;
    }).join('')}
  </div>` : `<div class="tms-empty-state"><div class="tms-empty-title">暂无校区场地数据</div></div>`;
  return `<section class="operations-section">
    <div class="operations-module-head"><div><h3>校区指标排行</h3><span>用条形强弱替代表格阅读</span></div></div>
    ${body}
  </section>`;
}

function renderOperationsCourtHeatCell(slot = {}, venue = {}, options = {}) {
  const rate = Math.max(0, Math.min(100, Number(slot.utilizationRate) || 0));
  const toneRate = Math.max(0, Math.min(100, Number(slot.heatRate ?? slot.utilizationRate) || 0));
  const hour = slot.hour || '';
  const venueName = operationsCourtHeatVenueName(venue);
  const usedMinutes = Math.max(0, Number(slot.bookedMinutes) || 0);
  const capacityMinutes = Math.max(0, Number(slot.capacityMinutes) || 0);
  const occupiedCount = Math.max(0, Number(slot.occupiedCount) || 0);
  const dayCount = Math.max(0, Number(slot.dayCount) || 0);
  const label = `${venueName} ${hour}｜占用 ${fmt(occupiedCount)}次 / ${fmt(dayCount)}天｜时长 ${fmt(usedMinutes)} / ${fmt(capacityMinutes)}分钟｜利用率 ${fmt(rate)}%`;
  const firstRowClass = options.firstRow ? ' is-first-row' : '';
  return `<span class="operations-court-heat-cell ${operationsCourtHeatTone(toneRate, usedMinutes)}${firstRowClass}" style="${esc(operationsCourtHeatStyle(toneRate, usedMinutes))}" aria-label="${esc(venueName)} ${esc(hour)} 利用率 ${fmt(rate)}%，占用 ${fmt(usedMinutes)}分钟" data-rate="${fmt(rate)}" data-heat="${fmt(toneRate)}" data-minutes="${fmt(usedMinutes)}"><span class="operations-court-heat-tooltip">${esc(label)}</span></span>`;
}

function renderOperationsCourtHeatVenueRow(venue = {}, index = 0) {
  const venueName = operationsCourtHeatVenueName(venue);
  const unmatched = venueName === '未匹配';
  return `<div class="operations-court-heat-venue ${unmatched ? 'is-unmatched' : ''}">${esc(venueName)}</div>${(venue.slots || []).map(slot => renderOperationsCourtHeatCell(slot, { ...venue, venueName }, { firstRow: index === 0 })).join('')}`;
}

function setOperationsCourtHeatCampus(campusName) {
  operationsActiveCourtHeatCampus = String(campusName || '顺义马坡').trim() || '顺义马坡';
  if (currentPage === 'operations') renderOperations();
}

function renderOperationsCourtHeatCampusTabs(heatmaps = []) {
  const extraTabs = heatmaps
    .map(item => String(item?.campusName || '').trim())
    .filter(name => name && !operationsCourtHeatCampusTabs.includes(name));
  const tabs = [...operationsCourtHeatCampusTabs, ...extraTabs];
  return `<div class="operations-court-heat-campus-tabs">
    ${tabs.map(name => `<button type="button" class="${name === operationsActiveCourtHeatCampus ? 'active' : ''}" onclick="setOperationsCourtHeatCampus('${esc(name)}')">${esc(name)}</button>`).join('')}
  </div>`;
}

function renderOperationsCourtHeatmap(campus = {}, heatmaps = []) {
  const venues = campus.venues || [];
  const hours = campus.hours || [];
  const heatBody = venues.length ? `<div class="operations-court-heat-scroll">
      <div class="operations-court-heat-grid" style="grid-template-columns:86px repeat(${Math.max(hours.length, 1)}, minmax(0, 1fr));">
        <div></div>
        ${hours.map(hour => `<div class="operations-court-heat-hour">${esc(hour)}</div>`).join('')}
        ${venues.map((venue, index) => renderOperationsCourtHeatVenueRow(venue, index)).join('')}
      </div>
    </div>
    <div class="operations-court-heat-legend">
      <span><i class="idle"></i>闲置</span>
      <span><i class="low"></i>较低</span>
      <span><i class="medium"></i>中等</span>
      <span><i class="steady"></i>较高</span>
      <span><i class="full"></i>高热</span>
    </div>` : `<div class="operations-court-empty-heat">
      <strong>暂无启用场地</strong>
      <span>请先在校区管理里维护该校区的启用场地</span>
    </div>`;
  return `<section class="operations-section operations-court-heatmap-card">
    <div class="operations-module-head">
      <div><h3>校区热力看板</h3><span>通过深浅直观暴露空闲时段，辅助制定特价/引流策略</span></div>
    </div>
    ${renderOperationsCourtHeatCampusTabs(heatmaps)}
    <div class="operations-court-heat-kpis">
      <div><span>黄金时段利用率（16:00-22:00）</span><strong>${fmt(campus.goldenUtilizationRate || 0)}%</strong></div>
      <div><span>非黄金时段利用率（07:00-16:00）</span><strong>${fmt(campus.offPeakUtilizationRate || 0)}%</strong></div>
    </div>
    ${heatBody}
  </section>`;
}

function renderOperationsCourtHeatmaps(data) {
  const heatmaps = data.court?.campusHeatmaps || [];
  const active = heatmaps.find(item => item.campusName === operationsActiveCourtHeatCampus) || { campusName: operationsActiveCourtHeatCampus, venues: [], hours: [] };
  return heatmaps.length
    ? renderOperationsCourtHeatmap(active, heatmaps)
    : `<section class="operations-section"><div class="tms-empty-state"><div class="tms-empty-title">暂无场地热力数据</div></div></section>`;
}

function renderOperationsCourt(data) {
  return `<div class="operations-court-top-grid">
    ${renderOperationsCourtComparison(data)}
    ${renderOperationsCourtCampusOverview(data)}
  </div>
  ${renderOperationsCourtHeatmaps(data)}`;
}

function renderOperationsConversion(data) {
  const conversion = operationsConversionView(data);
  return `${renderConversionCommandCenter(data, conversion)}
  <div class="operations-conversion-monitor-grid">
    ${renderConversionFunnelModule(data, conversion)}
    ${renderConversionInsightModule(conversion)}
  </div>
  ${renderConversionChannelEfficiencyModule(conversion)}
  ${renderConversionAttributeModule(conversion)}`;
}

function renderOperationsCoach(data) {
  const rows = data.coach?.rows || [];
  return `${operationsSection('人效指标', `<div class="tms-stats-row">${renderStandardDataCards(operationsMetricCards(data.coach?.cards))}</div>`)}
  ${operationsChartCard('教练工时利用率', 'operationsCoachChart')}
  ${operationsSimpleTable([
    { label: '教练', key: 'coach' },
    { label: '已排课时', key: 'usedHours' },
    { label: '本周可排', key: 'availableHours' },
    { label: '利用率', render: row => `${fmt(row.utilizationRate)}%` }
  ], rows)}`;
}

function operationsRate(part, total) {
  return total ? Math.round((Number(part) || 0) * 1000 / (Number(total) || 1)) / 10 : 0;
}

function operationsTrialDone(row = {}) {
  const now = Date.now();
  return ['trialAtRaw', 'trialLessonAt', 'trialAt'].some(key => {
    const date = row[key] ? new Date(row[key]) : null;
    return date && !Number.isNaN(date.getTime()) && date.getTime() <= now;
  });
}

function operationsHasAttendance(row = {}) {
  if (row.hasAttendance) return true;
  const text = `${row.stage || ''} ${row.rawStatus || ''} ${row.status || ''} ${row.statusAfter || ''} ${row.trialStatus || ''}`;
  return operationsTrialDone(row) || /已体验待转化|课程转化|课程\+|已体验|实到|到课|体验课完成/.test(text);
}

function operationsHasAppointment(row = {}) {
  if (row.hasAppointment || operationsHasAttendance(row) || row.hasTrialDeal) return true;
  const text = `${row.stage || ''} ${row.rawStatus || ''} ${row.status || ''} ${row.statusAfter || ''} ${row.trialStatus || ''}`;
  return /已约体验|已体验待转化|课程转化|课程\+|约体验|预约/.test(text);
}

function operationsGroupRows(rows, key) {
  const grouped = new Map();
  (rows || []).forEach(row => {
    const name = String(row?.[key] || '未记录').trim() || '未记录';
    if (!grouped.has(name)) grouped.set(name, []);
    grouped.get(name).push(row);
  });
  return grouped;
}

function operationsBuildCourseFunnel(rows = []) {
  const total = rows.length;
  const steps = [
    { stage: '线索量', count: total },
    { stage: '预约体验客户', count: rows.filter(row => operationsHasAppointment(row)).length },
    { stage: '体验课实到人数', count: rows.filter(row => operationsHasAttendance(row)).length },
    { stage: '体验后成交人数', count: rows.filter(row => row.hasTrialDeal).length },
    { stage: '成交后续费人数', count: rows.filter(row => row.hasRenewal).length }
  ];
  return steps.map((row, index) => ({
    ...row,
    percentOfTotal: operationsRate(row.count, total),
    transitionRate: index === 0 ? 100 : operationsRate(row.count, steps[index - 1].count),
    lossRate: index === 0 ? 0 : Math.round((100 - operationsRate(row.count, steps[index - 1].count)) * 10) / 10
  }));
}

function operationsBuildSourceRanking(rows = []) {
  const totalDeals = rows.filter(row => row.hasTrialDeal).length;
  return [...operationsGroupRows(rows, 'source').entries()]
    .map(([source, items]) => {
      const deals = items.filter(row => row.hasTrialDeal).length;
      return { source, deals, dealShare: operationsRate(deals, totalDeals) };
    })
    .filter(row => row.deals > 0)
    .sort((a, b) => b.deals - a.deals || a.source.localeCompare(b.source, 'zh-Hans-CN'));
}

function operationsBuildChannelEfficiencyRows(rows = []) {
  return [...operationsGroupRows(rows, 'source').entries()]
    .map(([source, items]) => {
      const deals = items.filter(row => row.hasTrialDeal).length;
      const attendanceCount = items.filter(row => operationsHasAttendance(row)).length;
      return {
        source,
        leads: items.length,
        trialConversionRate: operationsRate(attendanceCount, items.length),
        dealConversionRate: operationsRate(deals, items.length),
        deals,
        finalConversionRate: operationsRate(deals, items.length)
      };
    })
    .sort((a, b) => b.finalConversionRate - a.finalConversionRate || b.deals - a.deals || b.leads - a.leads);
}

function operationsExtractPersonas(row = {}) {
  const text = `${row.level || ''} ${row.consultType || ''} ${row.studentType || ''} ${row.type || ''} ${row.gender || ''}`.trim();
  const personas = new Set();
  if (/零基础|小白|初学|新手/.test(text)) personas.add('零基础');
  if (/进阶|提升|提高|提高班|强化/.test(text)) personas.add('进阶提升');
  if (/成人/.test(text)) personas.add('成人');
  if (/青少年|少儿|儿童|孩子|中小学生|学生/.test(text)) personas.add('青少年');
  if (/女|female/i.test(text) && personas.has('成人')) personas.add('成人女性');
  if (/男|male/i.test(text) && personas.has('成人')) personas.add('成人男性');
  if (/女|female/i.test(text) && personas.has('青少年')) personas.add('青少年女性');
  if (/男|male/i.test(text) && personas.has('青少年')) personas.add('青少年男性');
  if (/私教/.test(text)) personas.add('私教课');
  if (/私教体验|体验.*私教|私教.*体验/.test(text)) personas.add('体验私教课');
  if (/小班|班课|训练营|随到随学/.test(text)) personas.add('小班课');
  if (/小班体验|体验.*小班|小班.*体验/.test(text)) personas.add('体验小班课');
  return [...personas];
}

function operationsRowPersonas(row = {}) {
  const personas = (row.personas || []).map(item => String(item || '').trim()).filter(Boolean);
  if (personas.length) return personas;
  const extracted = operationsExtractPersonas(row);
  return extracted.length ? extracted : ['未标注人群'];
}

function operationsBuildAttributeRows(rows = []) {
  const grouped = new Map();
  rows.forEach(row => operationsRowPersonas(row).forEach(attribute => {
    const current = grouped.get(attribute) || { attribute, base: 0, attendance: 0, deals: 0, renewals: 0 };
    current.base += 1;
    if (operationsHasAttendance(row)) current.attendance += 1;
    if (row.hasTrialDeal) current.deals += 1;
    if (row.hasRenewal) current.renewals += 1;
    grouped.set(attribute, current);
  }));
  return [...grouped.values()]
    .map(row => ({
      ...row,
      trialConversionRate: operationsRate(row.attendance, row.base),
      dealConversionRate: operationsRate(row.deals, row.base),
      renewalRate: operationsRate(row.renewals, row.deals)
    }))
    .sort((a, b) => b.trialConversionRate - a.trialConversionRate || b.renewalRate - a.renewalRate || b.base - a.base);
}

function operationsFunnelDropRows(funnel = []) {
  return (funnel || []).slice(1).map((row, index) => ({
    from: funnel[index]?.stage || '',
    to: row.stage || '',
    count: Number(row.count) || 0,
    transitionRate: Number(row.transitionRate) || 0,
    lossRate: Number(row.lossRate) || 0
  }));
}

function operationsFunnelSummary(funnel = []) {
  const drops = operationsFunnelDropRows(funnel);
  const worst = drops.reduce((best, row) => (!best || row.lossRate > best.lossRate ? row : best), null);
  const stable = drops.reduce((best, row) => (!best || row.transitionRate > best.transitionRate ? row : best), null);
  const renewal = drops[drops.length - 1] || null;
  return { worst, stable, renewal };
}

function operationsFunnelStep(funnel = [], index) {
  return (funnel || [])[index] || {};
}

function operationsConversionKpiCards(funnel = []) {
  const total = operationsFunnelStep(funnel, 0);
  const appointment = operationsFunnelStep(funnel, 1);
  const attendance = operationsFunnelStep(funnel, 2);
  const deal = operationsFunnelStep(funnel, 3);
  const renewal = operationsFunnelStep(funnel, 4);
  return [
    { label: '线索量', value: fmt(total.count || 0), unit: '人', caption: '转化基准流量' },
    { label: '预约率', value: `${fmt(appointment.percentOfTotal || 0)}%`, caption: `${fmt(appointment.count || 0)} 人已预约` },
    { label: '到课率', value: `${fmt(attendance.transitionRate || 0)}%`, caption: `${fmt(attendance.count || 0)} 人实到` },
    { label: '成交率', value: `${fmt(deal.transitionRate || 0)}%`, caption: `${fmt(deal.count || 0)} 人成交` },
    { label: '续费率', value: `${fmt(renewal.transitionRate || 0)}%`, caption: `${fmt(renewal.count || 0)} 人续费` }
  ];
}

function operationsInsightCard(tone, label, title, caption) {
  return `<div class="operations-insight-card ${esc(tone)}">
    <span>${esc(label)}</span>
    <strong>${esc(title)}</strong>
    <p>${esc(caption)}</p>
  </div>`;
}

function operationsChannelMetric(label, value) {
  return `<div class="operations-channel-metric">
    <span>${esc(label)}</span>
    ${operationsPercentBar(value)}
  </div>`;
}

function operationsBuildChannelGroups(rows = []) {
  const sorted = rows || [];
  const highValue = sorted.filter(row => row.deals > 0 && row.dealConversionRate >= 15).slice(0, 4);
  const highTrafficLowConversion = sorted
    .filter(row => row.leads >= 10 && row.dealConversionRate > 0 && row.dealConversionRate < 15)
    .slice(0, 4);
  const lowEfficiency = sorted.filter(row => row.leads > 0 && row.deals === 0).slice(0, 4);
  return [
    { title: '高价值渠道', caption: '成交率较高，适合继续投入', rows: highValue },
    { title: '高流量低转化', caption: '有线索但成交偏弱，需要优化跟进', rows: highTrafficLowConversion },
    { title: '低效渠道', caption: '当前没有成交，先观察或降权', rows: lowEfficiency }
  ];
}

function operationsChannelCard(row) {
  return `<div class="operations-channel-card">
    <div class="operations-channel-head"><strong>${esc(row.source)}</strong><span>线索 ${fmt(row.leads)}｜成交 ${fmt(row.deals)}</span></div>
    ${operationsChannelMetric('体验课转化率', row.trialConversionRate)}
    ${operationsChannelMetric('成交转化率', row.dealConversionRate)}
  </div>`;
}

function operationsRiskRows(rows = []) {
  return (rows || [])
    .filter(row => row.deals > 0)
    .sort((a, b) => a.renewalRate - b.renewalRate || b.deals - a.deals)
    .slice(0, 5);
}

function operationsFallbackCourseRows(data) {
  const stageRows = data.conversion?.stageRows || [];
  const sourceRows = data.conversion?.sourceRows || [];
  const rows = [];
  sourceRows.forEach(source => {
    const leads = Number(source.leads) || 0;
    const converted = Number(source.converted) || 0;
    for (let i = 0; i < leads; i += 1) {
      rows.push({
        source: source.source || '未记录',
        campus: '未记录',
        coach: '未记录',
        hasAppointment: i < converted,
        hasAttendance: i < converted,
        hasTrialDeal: i < converted,
        hasRenewal: false,
        personas: []
      });
    }
  });
  if (rows.length) return rows;
  const total = Number(data.conversion?.cards?.totalLeads?.value) || stageRows.reduce((sum, row) => sum + (Number(row.count) || 0), 0);
  const courseDeals = stageRows
    .filter(row => /课程|直接成交/.test(String(row.stage || '')) && !/订场|会员/.test(String(row.stage || '')))
    .reduce((sum, row) => sum + (Number(row.count) || 0), 0);
  for (let i = 0; i < total; i += 1) {
    rows.push({
      source: '未记录',
      campus: '未记录',
      coach: '未记录',
      hasAppointment: i < courseDeals,
      hasAttendance: i < courseDeals,
      hasTrialDeal: i < courseDeals,
      hasRenewal: false,
      personas: []
    });
  }
  return rows;
}

function operationsFilteredCourseRows(data) {
  const rows = (data.conversion?.courseRows || []).length ? data.conversion.courseRows : operationsFallbackCourseRows(data);
  return rows.filter(row => {
    if (operationsConversionFilters.source && row.source !== operationsConversionFilters.source) return false;
    if (operationsConversionFilters.campus && row.campus !== operationsConversionFilters.campus) return false;
    if (operationsConversionFilters.coach && row.coach !== operationsConversionFilters.coach) return false;
    return true;
  });
}

function operationsConversionView(data) {
  const rows = operationsFilteredCourseRows(data);
  if (!rows.length && !(data.conversion?.courseRows || []).length && !(data.conversion?.stageRows || []).length && !(data.conversion?.sourceRows || []).length) {
    return {
      courseFunnel: data.conversion?.courseFunnel || [],
      sourceRanking: data.conversion?.sourceRanking || [],
      channelEfficiencyRows: data.conversion?.channelEfficiencyRows || [],
      studentAttributeRows: data.conversion?.studentAttributeRows || []
    };
  }
  return {
    courseFunnel: operationsBuildCourseFunnel(rows),
    sourceRanking: operationsBuildSourceRanking(rows),
    channelEfficiencyRows: operationsBuildChannelEfficiencyRows(rows),
    studentAttributeRows: operationsBuildAttributeRows(rows)
  };
}

function operationsFilterDropdown(id, label, values, value) {
  return renderStandardDropdownHtml(id, label, [{ value: '', label }, ...(values || []).map(item => ({ value: item, label: item }))], value, false, 'setOperationsConversionFilter');
}

function operationsConversionFilterOptions(data) {
  const rows = (data.conversion?.courseRows || []).length ? data.conversion.courseRows : operationsFallbackCourseRows(data);
  const values = key => [...new Set(rows.map(row => String(row[key] || '').trim()).filter(Boolean).filter(item => item !== '未记录'))].sort((a, b) => a.localeCompare(b, 'zh-Hans-CN'));
  const apiOptions = data.conversion?.filterOptions || {};
  return {
    sources: (apiOptions.sources || []).length ? apiOptions.sources : values('source'),
    campuses: (apiOptions.campuses || []).length ? apiOptions.campuses : values('campus'),
    coaches: (apiOptions.coaches || []).length ? apiOptions.coaches : values('coach')
  };
}

function renderConversionFunnelModule(data, conversion) {
  return `<section class="operations-section operations-funnel-card">
    <div class="operations-module-head">
      <div><h3>全局转化漏斗</h3><span>转化节点与流失监控</span></div>
    </div>
    <div class="operations-funnel-host" id="operationsCourseFunnel"></div>
  </section>`;
}

function renderConversionCommandCenter(data, conversion) {
  const options = operationsConversionFilterOptions(data);
  const summary = operationsFunnelSummary(conversion.courseFunnel || []);
  const filters = `<div class="operations-filter-row">
    ${operationsFilterDropdown('operationsConversionSource', '全部渠道', options.sources || [], operationsConversionFilters.source)}
    ${operationsFilterDropdown('operationsConversionCampus', '全部校区', options.campuses || [], operationsConversionFilters.campus)}
    ${operationsFilterDropdown('operationsConversionCoach', '全部教练', options.coaches || [], operationsConversionFilters.coach)}
  </div>`;
  return `<section class="operations-command-center">
    <div class="operations-command-head">
      <div>
        <h2>转化与留存数据中心</h2>
        <p>通过线索、预约、到课、成交、续费，定位每个环节的流失和高价值渠道</p>
      </div>
      ${filters}
    </div>
    <div class="operations-kpi-row">
      ${operationsConversionKpiCards(conversion.courseFunnel || []).map(card => `<div class="operations-kpi-card">
        <span>${esc(card.label)}</span>
        <strong>${esc(card.value)}${card.unit ? `<em>${esc(card.unit)}</em>` : ''}</strong>
        <p>${esc(card.caption)}</p>
      </div>`).join('')}
    </div>
    <div class="operations-loss-summary">最大流失环节：${esc(summary.worst?.from || '-')} → ${esc(summary.worst?.to || '-')}，流失 ${fmt(summary.worst?.lossRate || 0)}%</div>
  </section>`;
}

function renderConversionInsightModule(conversion) {
  const summary = operationsFunnelSummary(conversion.courseFunnel || []);
  return `<section class="operations-section operations-insight-panel">
    <div class="operations-module-head"><div><h3>关键洞察</h3><span>把数据翻译成经营动作</span></div></div>
    <div class="operations-insight-list">
      ${operationsInsightCard('danger', '最大问题', `${summary.worst?.from || '-'} → ${summary.worst?.to || '-'}`, `该环节流失 ${fmt(summary.worst?.lossRate || 0)}%，优先检查触达和预约话术`)}
      ${operationsInsightCard('good', '最稳环节', `${summary.stable?.from || '-'} → ${summary.stable?.to || '-'}`, `该环节转化 ${fmt(summary.stable?.transitionRate || 0)}%，可以沉淀为标准动作`)}
      ${operationsInsightCard('warn', '续费风险', `${summary.renewal?.from || '-'} → ${summary.renewal?.to || '-'}`, `续费转化 ${fmt(summary.renewal?.transitionRate || 0)}%，建议对已成交学员提前跟进`)}
    </div>
  </section>`;
}

function renderConversionChannelEfficiencyModule(conversion) {
  return `<section class="operations-section">
    <div class="operations-module-head"><div><h3>渠道效率监控</h3><span>按经营价值分组看渠道，而不是堆表格</span></div></div>
    <div class="operations-channel-grid">
      ${operationsBuildChannelGroups(conversion.channelEfficiencyRows || []).map(group => `<div class="operations-channel-group">
        <div class="operations-channel-group-head"><strong>${esc(group.title)}</strong><span>${esc(group.caption)}</span></div>
        <div class="operations-channel-list">
          ${group.rows.length ? group.rows.map(operationsChannelCard).join('') : '<div class="operations-channel-empty">暂无符合条件渠道</div>'}
        </div>
      </div>`).join('')}
    </div>
  </section>`;
}

function renderConversionAttributeModule(conversion) {
  const rows = conversion.studentAttributeRows || [];
  const risks = operationsRiskRows(rows);
  const body = rows.length ? `<div class="operations-attribute-layout">
  <div class="operations-attribute-grid">${rows.map(row => `<div class="operations-attribute-card">
    <div class="operations-attribute-head"><strong>${esc(row.attribute)}</strong><span>基数: ${fmt(row.base)}</span></div>
    ${operationsAttributeMetric('体验转化', row.trialConversionRate)}
    ${operationsAttributeMetric(`到期续费（首购 ${fmt(row.deals)}）`, row.renewalRate)}
  </div>`).join('')}</div>
  <aside class="operations-retention-risk">
    <div class="operations-risk-head"><strong>留存/续费风险榜</strong><span>续费偏低的人群</span></div>
    ${risks.length ? risks.map(row => `<div class="operations-risk-row">
      <span>${esc(row.attribute)}</span>
      <strong>${fmt(row.renewalRate)}%</strong>
    </div>`).join('') : '<div class="operations-channel-empty">暂无续费风险数据</div>'}
  </aside>
  </div>` : `<div class="tms-empty-state"><div class="tms-empty-title">暂无学员属性数据</div></div>`;
  return `<section class="operations-section">
    <div class="operations-module-head"><div><h3>学员属性与转化</h3><span>不同人群的商业表现</span></div></div>
    ${body}
  </section>`;
}

function renderOperationsCharts(data) {
  const conversion = operationsConversionView(data);
  renderStandardChart('operationsRevenueMixChart', buildStandardPieChartOption({ rows: data.overview?.revenueMix || [], name: '收入结构' }));
  renderStandardChart('operationsLeadFunnelChart', buildStandardFunnelChartOption({ rows: data.conversion?.stageRows || [], name: '线索阶段' }));
  renderStandardChart('operationsCourtComparisonChart', buildOperationsCourtQuadrantChartOption({
    rows: (data.court?.campusRows || []).length ? data.court.campusRows : (data.court?.campusComparison || [])
  }), { height: 296 });
  renderProgressFunnel('operationsCourseFunnel', conversion.courseFunnel || []);
  renderStandardChart('operationsSourceRankingChart', buildStandardBarChartOption({
    labels: (conversion.sourceRanking || []).map(row => row.source),
    values: (conversion.sourceRanking || []).map(row => row.deals),
    name: '成交人数'
  }));
  renderStandardChart('operationsCoachChart', buildStandardBarChartOption({
    labels: (data.coach?.rows || []).map(row => row.coach),
    values: (data.coach?.rows || []).map(row => row.utilizationRate),
    name: '利用率'
  }));
}

function renderOperations() {
  const host = document.getElementById('page-operations');
  if (!host) return;
  const data = operationsPageData || {};
  if (!data.overview) {
    host.innerHTML = `<div class="tms-empty-state"><div class="tms-empty-title">暂无经营分析数据</div></div>`;
    return;
  }
  const panels = {
    overview: renderOperationsOverview,
    court: renderOperationsCourt,
    conversion: renderOperationsConversion,
    coach: renderOperationsCoach
  };
  host.innerHTML = `<div class="operations-page">${panels[operationsActiveTab](data)}</div>`;
  requestAnimationFrame(() => renderOperationsCharts(data));
}
