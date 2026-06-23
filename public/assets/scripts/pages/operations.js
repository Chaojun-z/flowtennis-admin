const OPERATIONS_TAB_KEY='ft_operations_active_tab';
function readOperationsActiveTab(){
  try{
    const tab=localStorage.getItem(OPERATIONS_TAB_KEY);
    if(['overview', 'court', 'conversion', 'coach'].includes(tab))return tab;
  }catch(e){}
  return 'overview';
}
let operationsActiveTab = readOperationsActiveTab();
let operationsConversionFilters = { source: '', campus: '', coach: '' };
let operationsActiveCourtHeatCampus = '顺义马坡';
let operationsSparklineUid = 0;
const operationsCourtHeatCampusTabs = ['顺义马坡', '朝阳十里堡', '蓝色港湾', '国网', '朝珺私教'];
const operationsTrendDefaultColor = '#2F72B8';
const operationsTrendWarningColor = '#D89135';
const operationsTrendRiskColor = '#E05252';
const operationsTrendPositiveColor = '#1F8A68';
const operationsTrendWarningKeys = new Set(['pendingRevenue']);
const operationsTrendNegativeKeys = new Set([]);
const operationsTrendPositiveKeys = new Set(['totalIncome', 'recognizedRevenue', 'revenue', 'bookingAmount', 'bookingHours', 'utilizationRate', 'goldenUtilizationRate', 'offPeakUtilizationRate', 'tradeCount', 'leads', 'activeCoaches', 'appointmentRate', 'attendanceRate', 'dealRate', 'trialConversionRate', 'renewalRate']);

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

function operationsCardNumber(card = {}) {
  return Number(card?.value) || 0;
}

function operationsCompactNumber(value, digits = 1) {
  const number = Number(value) || 0;
  const abs = Math.abs(number);
  const sign = number < 0 ? '-' : '';
  if (abs >= 1000000) {
    const text = (abs / 1000000).toFixed(digits).replace(/\.0$/, '');
    return `${sign}${text}M`;
  }
  if (abs >= 10000) {
    const text = (abs / 1000).toFixed(digits).replace(/\.0$/, '');
    return `${sign}${text}K`;
  }
  return `${sign}${fmt(abs)}`;
}

function operationsMoneyCompactText(value) {
  return `¥${operationsCompactNumber(value)}`;
}

function operationsCardText(card = {}, fallbackUnit = '') {
  const unit = card?.unit || fallbackUnit;
  return `${fmt(operationsCardNumber(card))}${unit ? `<em>${esc(unit)}</em>` : ''}`;
}

function operationsMoneyMetric(label, value, caption = '') {
  return `<div class="operations-overview-metric">
    <span>${esc(label)}</span>
    <strong>${operationsMoneyText(value)}</strong>
    ${caption ? `<p>${esc(caption)}</p>` : ''}
  </div>`;
}

function operationsPlainMetric(label, value, caption = '') {
  return `<div class="operations-overview-metric">
    <span>${esc(label)}</span>
    <strong>${value}</strong>
    ${caption ? `<p>${esc(caption)}</p>` : ''}
  </div>`;
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

function operationsCourtRankingRows(rows = []) {
  const displayRows = (rows || []).filter(row => row?.campusName && row.campusName !== '朝珺私教');
  const byCampus = new Map(displayRows.map(row => [row.campusName, row]));
  const ordered = operationsCourtHeatCampusTabs
    .filter(campusName => campusName !== '朝珺私教')
    .map(campusName => byCampus.get(campusName))
    .filter(Boolean);
  const extras = displayRows.filter(row => !operationsCourtHeatCampusTabs.includes(row.campusName));
  return [...ordered, ...extras];
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

function operationsTrendValues(trends = [], key = '') {
  return operationsTrendPoints(trends, key).map(point => point.value);
}

function operationsTrendPoints(trends = [], key = '') {
  const today = operationsTrendToday();
  return (trends || [])
    .filter(row => row && row.date && Object.prototype.hasOwnProperty.call(row, key))
    .filter(row => row.date <= today)
    .filter(row => row[key] !== null && row[key] !== undefined && row[key] !== '')
    .map(row => ({
      date: row.date,
      value: Number(row[key]),
      numerator: row[`${key}Numerator`],
      denominator: row[`${key}Denominator`]
    }))
    .filter(point => Number.isFinite(point.value));
}

function operationsTrendToday() {
  const today = dateKey(new Date());
  const range = typeof activeGlobalDateRange === 'function' ? activeGlobalDateRange() : {};
  const endDate = String(range?.endDate || '').slice(0, 10);
  return endDate && endDate < today ? endDate : today;
}

function operationsShouldShowTrend() {
  return true;
}

function operationsTrendPointsWithFallback(trends = [], key = '') {
  const points = operationsTrendPoints(trends, key);
  if (!operationsShouldShowTrend()) return [];
  if (points.length) return points;
  return [];
}

function operationsTrendComparisonForDisplay(comparison = {}, points = []) {
  return Array.isArray(points) && points.length >= 2 ? comparison : { mode: 'none' };
}

function operationsCourtTrendValues(trends = [], key = '') {
  const values = operationsTrendValues(trends, key);
  if (!operationsShouldShowTrend()) return [];
  return values.length ? values : [];
}

function operationsCourtTrendPoints(trends = [], key = '') {
  const points = operationsTrendPoints(trends, key);
  if (!operationsShouldShowTrend()) return [];
  return points.length ? points : [];
}

function operationsCourtSparklineSvg(points = [], key = '') {
  return operationsKpiSparklineSvg(points, key, 'operations-court-kpi-sparkline');
}

function renderOperationsCourtKpi(card = {}) {
  const displayComparison = operationsTrendComparisonForDisplay(card.trendComparison, card.trendPoints);
  return `<div class="operations-court-kpi ${esc(card.tone || 'neutral')}">
    <div class="operations-court-kpi-main">
      <div class="operations-court-kpi-head">
        <span>${esc(card.label || '')}</span>
      </div>
      <div class="operations-court-kpi-value">
        <strong>${esc(card.value ?? '')}${card.unit ? `<em>${esc(card.unit)}</em>` : ''}</strong>
        <small class="operations-court-kpi-change ${esc(operationsTrendChangeClass(displayComparison))}">${esc(operationsTrendChangeText(displayComparison, card.trendKey || ''))}</small>
      </div>
    </div>
    ${operationsCourtSparklineSvg(card.trendPoints || [], card.trendKey || '')}
  </div>`;
}

function renderOperationsCourtKpis(data = {}) {
  const cards = data.court?.cards || {};
  const trends = data.court?.trends || [];
  const comparisons = data.court?.trendComparisons || {};
  const goldenRate = operationsCardNumber(cards.goldenUtilizationRate) || operationsCourtAverageRate(data.court?.campusRows || [], 'goldenUtilizationRate');
  const offPeakRate = operationsCardNumber(cards.offPeakUtilizationRate) || operationsCourtAverageRate(data.court?.campusRows || [], 'offPeakUtilizationRate');
  const kpis = [
    { label: '订场收入', value: operationsMoneyCompactText(operationsCardNumber(cards.bookingAmount)), trendValue: operationsCardNumber(cards.bookingAmount), trendKey: 'bookingAmount', tone: 'revenue' },
    { label: '订场小时', value: fmt(operationsCardNumber(cards.bookingHours)), unit: '小时', trendValue: operationsCardNumber(cards.bookingHours), trendKey: 'bookingHours', tone: 'hours' },
    { label: '场地利用率', value: `${fmt(operationsCardNumber(cards.utilizationRate))}%`, trendValue: operationsCardNumber(cards.utilizationRate), trendKey: 'utilizationRate', tone: 'utilization' },
    { label: '黄金时段利用率', value: `${fmt(goldenRate)}%`, trendValue: goldenRate, trendKey: 'goldenUtilizationRate', tone: 'golden' },
    { label: '非黄金时段利用率', value: `${fmt(offPeakRate)}%`, trendValue: offPeakRate, trendKey: 'offPeakUtilizationRate', tone: 'offpeak' }
  ];
  return `<div class="operations-kpi-row operations-court-kpi-row">
    ${kpis.map(card => renderOperationsCourtKpi({
      ...card,
      trendValues: operationsCourtTrendValues(trends, card.trendKey),
      trendPoints: operationsTrendPointsWithFallback(trends, card.trendKey),
      trendComparison: comparisons[card.trendKey]
    })).join('')}
  </div>`;
}

function operationsCourtAverageRate(rows = [], key = '') {
  const active = (rows || []).filter(row => (
    (Number(row.bookingAmount) || 0) ||
    (Number(row.bookingHours) || 0) ||
    (Number(row.utilizationRate) || 0) ||
    (Number(row[key]) || 0)
  ));
  if (!active.length) return 0;
  return Math.round(active.reduce((sum, row) => sum + (Number(row[key]) || 0), 0) * 10 / active.length) / 10;
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
  operationsActiveTab = ['overview', 'court', 'conversion', 'coach'].includes(tab) ? tab : 'overview';
  try{localStorage.setItem(OPERATIONS_TAB_KEY,operationsActiveTab);}catch(e){}
  if (currentPage === 'operations') {
    document.querySelectorAll('.sb-item[data-nav-page="operations"]').forEach(item => {
      item.classList.toggle('active', item.dataset.operationsTab === operationsActiveTab);
    });
    if (typeof scrollActiveSidebarItemIntoView === 'function') scrollActiveSidebarItemIntoView();
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
  if (typeof renderStandardPageSkeleton !== 'function') {
    host.innerHTML = '<div class="operations-page"><div class="empty"><p>经营分析加载中...</p></div></div>';
    return;
  }
  if (operationsActiveTab === 'overview') {
    host.innerHTML = renderStandardPageSkeleton({
      className: 'operations-page',
      sections: [
        { type: 'kpis', className: 'operations-kpi-row operations-overview-kpi-row operations-court-kpi-row', count: 5 },
        { type: 'grid', className: 'operations-overview-grid', panels: [{ className: 'operations-overview-chart' }, { className: 'operations-overview-chart' }] },
        { type: 'grid', className: 'operations-overview-grid operations-overview-visual-grid', panels: [{ className: 'operations-overview-matrix-chart' }, { className: 'operations-overview-matrix-chart' }] },
        { type: 'grid', className: 'operations-overview-grid', panels: [{}, {}] }
      ]
    });
    return;
  }
  if (operationsActiveTab === 'coach') {
    host.innerHTML = renderStandardPageSkeleton({
      className: 'operations-page',
      sections: [
        { type: 'kpis', className: 'operations-coach-kpi-strip', count: 5 },
        { type: 'grid', className: 'operations-coach-hero-grid', panels: [{ className: 'operations-coach-matrix-skeleton' }, { className: 'operations-coach-matrix-skeleton' }] },
        { type: 'grid', className: 'operations-coach-secondary-grid', panels: [{}, {}] }
      ]
    });
    return;
  }
  if (operationsActiveTab === 'court') {
    host.innerHTML = renderStandardPageSkeleton({
      className: 'operations-page',
      sections: [
        { type: 'kpis', className: 'operations-kpi-row operations-court-kpi-row', count: 5 },
        { type: 'grid', className: 'operations-court-skeleton-grid', panels: [{}, {}] },
        { type: 'grid', className: 'operations-court-heatmap-card', panels: [{ className: 'operations-court-skeleton-heat', variant: 'heatmap' }] }
      ]
    });
    return;
  }
  host.innerHTML = renderStandardPageSkeleton({
    className: 'operations-page',
    sections: [
      { type: 'kpis', className: 'operations-kpi-row operations-conversion-kpi-row operations-court-kpi-row', count: 5 },
      { type: 'grid', className: 'operations-conversion-monitor-grid', panels: [{}, {}] },
      { type: 'grid', className: 'operations-channel-quality-layout', panels: [{}, { variant: 'table' }] },
      { type: 'grid', className: 'operations-attribute-layout', panels: [{}, {}] }
    ]
  });
}

function renderOperationsOverview(data) {
  const overview = data.overview || {};
  const cards = overview.cards || {};
  const totalIncome = operationsCardNumber(cards.totalIncome);
  const recognizedRevenue = operationsCardNumber(cards.recognizedRevenue);
  const pendingRevenue = operationsCardNumber(cards.pendingRevenue);
  const conversion = operationsConversionView(data);
  return `${renderOperationsOverviewKpis(data)}
  <div class="operations-overview-grid">
    ${operationsOverviewRevenueMix(data)}
    ${operationsOverviewCashQuality(totalIncome, recognizedRevenue, pendingRevenue)}
  </div>
  <div class="operations-overview-grid operations-overview-visual-grid">
    ${operationsOverviewCoachSummary(data)}
    ${operationsOverviewCourtSummary(data)}
  </div>
  <div class="operations-overview-grid">
    ${operationsOverviewConversionRisk(conversion)}
    ${operationsOverviewWarnings(data, conversion)}
  </div>`;
}

function operationsOverviewTrendPoints(trends = [], key = '') {
  const points = operationsTrendPoints(trends, key);
  if (!operationsShouldShowTrend()) return [];
  return points.length ? points : [];
}

function renderOperationsOverviewKpis(data = {}) {
  const cards = data.overview?.cards || {};
  const trends = data.overview?.trends || [];
  const comparisons = data.overview?.trendComparisons || {};
  const courtCards = data.court?.cards || {};
  const totalIncome = operationsCardNumber(cards.totalIncome);
  const recognizedRevenue = operationsCardNumber(cards.recognizedRevenue);
  const pendingRevenue = operationsCardNumber(cards.pendingRevenue);
  const tradeCount = operationsCardNumber(cards.tradeCount);
  const utilizationRate = operationsCardNumber(courtCards.utilizationRate);
  const kpis = [
    { label: '总收入', value: operationsMoneyCompactText(totalIncome), trendValue: totalIncome, trendKey: 'totalIncome', tone: 'revenue' },
    { label: '入账流水', value: operationsMoneyCompactText(recognizedRevenue), trendValue: recognizedRevenue, trendKey: 'recognizedRevenue', tone: 'good' },
    { label: '待履约余额', value: operationsMoneyCompactText(pendingRevenue), trendValue: pendingRevenue, trendKey: 'pendingRevenue', tone: 'warn' },
    { label: '成交笔数', value: operationsCompactNumber(tradeCount), unit: '笔', trendValue: tradeCount, trendKey: 'tradeCount', tone: 'lead' },
    { label: '场地利用率', value: fmt(utilizationRate), unit: '%', trendValue: utilizationRate, trendKey: 'utilizationRate', tone: 'utilization' }
  ];
  return `<div class="operations-kpi-row operations-overview-kpi-row operations-court-kpi-row">
    ${kpis.map(card => renderOperationsCourtKpi({
      ...card,
      trendPoints: operationsTrendPointsWithFallback(trends, card.trendKey),
      trendComparison: comparisons[card.trendKey]
    })).join('')}
  </div>`;
}

function operationsOverviewRevenueMix(data = {}) {
  return `<section class="operations-section">
    <div class="operations-module-head"><div><h3>收入结构图</h3><span>看公司收入主要由课程、订场还是会员储值驱动</span></div></div>
    <div class="operations-chart-host operations-overview-chart" id="operationsOverviewRevenueMixChart"></div>
  </section>`;
}

function operationsOverviewCashQuality(totalIncome, recognizedRevenue, pendingRevenue) {
  const recognizedRate = totalIncome ? Math.round(recognizedRevenue * 1000 / totalIncome) / 10 : 0;
  return `<section class="operations-section">
    <div class="operations-module-head"><div><h3>现金与核销关系</h3><span>总收入、已入账、待履约同财务聚合口径</span></div></div>
    <div class="operations-chart-host operations-overview-chart" id="operationsOverviewCashChart"></div>
    <div class="operations-overview-cash-note">已入账率 ${fmt(recognizedRate)}%，待履约 ${operationsMoneyText(pendingRevenue)}</div>
  </section>`;
}

function operationsOverviewCoachSummary(data = {}) {
  const cards = data.coach?.cards || {};
  return `<section class="operations-section">
    <div class="operations-module-head"><div><h3>教练经营效率</h3><span>复用教练人效的产值、工时利用率和课时量口径</span></div>${operationsMatrixTitleLegend('工时利用率', '归属实收', '课数')}</div>
    <div class="operations-overview-inline-kpis">
      <span>在岗 <strong>${operationsCardText(cards.activeCoaches)}</strong></span>
      <span>归属实收 <strong>${operationsMoneyText(operationsCardNumber(cards.revenue))}</strong></span>
      <span>工时利用率 <strong>${operationsCardText(cards.utilizationRate)}</strong></span>
    </div>
    <div class="operations-chart-host operations-overview-matrix-chart" id="operationsOverviewCoachMatrixChart"></div>
  </section>`;
}

function operationsOverviewCourtSummary(data = {}) {
  const cards = data.court?.cards || {};
  return `<section class="operations-section operations-overview-court-card">
    <div class="operations-module-head"><div><h3>场地经营效率</h3><span>复用场地运转的订场收入、次数、利用率口径</span></div>${operationsMatrixTitleLegend('场地利用率', '订场收入', '订场次数')}</div>
    <div class="operations-overview-inline-kpis">
      <span>订场收入 <strong>${operationsMoneyText(operationsCardNumber(cards.bookingAmount))}</strong></span>
      <span>订场次数 <strong>${operationsCardText(cards.bookingCount)}</strong></span>
      <span>利用率 <strong>${operationsCardText(cards.utilizationRate)}</strong></span>
    </div>
    <div class="operations-chart-host operations-overview-matrix-chart" id="operationsOverviewCourtQuadrantChart"></div>
  </section>`;
}

function operationsOverviewConversionRisk(conversion = {}) {
  const summary = operationsFunnelSummary(conversion.courseFunnel || []);
  const renewal = summary.renewal || {};
  return `<section class="operations-section">
    <div class="operations-module-head"><div><h3>转化留存风险</h3><span>首页只看风险位置，完整漏斗在转化与留存页</span></div></div>
    <div class="operations-overview-risk-board">
      ${operationsInsightCard('danger', '最大流失', `${summary.worst?.from || '-'} → ${summary.worst?.to || '-'}`, `流失 ${fmt(summary.worst?.lossRate || 0)}%`)}
      ${operationsInsightCard('warn', '续费环节', `${renewal.from || '-'} → ${renewal.to || '-'}`, `转化 ${fmt(renewal.transitionRate || 0)}%`)}
      ${operationsInsightCard('good', '最稳环节', `${summary.stable?.from || '-'} → ${summary.stable?.to || '-'}`, `转化 ${fmt(summary.stable?.transitionRate || 0)}%`)}
    </div>
  </section>`;
}

function operationsOverviewWarnings(data = {}, conversion = {}) {
  const overviewCards = data.overview?.cards || {};
  const warnings = [];
  const pending = operationsCardNumber(overviewCards.pendingRevenue);
  if (pending > 0) warnings.push({ tone: 'warn', title: '待履约余额较高', detail: `${operationsMoneyText(pending)} 未入账/待核销，需关注交付消耗速度`, value: pending });
  const summary = operationsFunnelSummary(conversion.courseFunnel || []);
  if (summary.worst?.to) warnings.push({ tone: 'danger', title: '最大流失环节', detail: `${summary.worst.from} → ${summary.worst.to}，流失 ${fmt(summary.worst.lossRate)}%`, value: summary.worst.lossRate });
  const unmatched = (data.court?.campusHeatmaps || []).some(campus => (campus.venues || []).some(venue => venue.isUnmatched));
  if (unmatched) warnings.push({ tone: 'warn', title: '存在未匹配场地数据', detail: '场地热力中有历史未匹配记录，需到场地运转继续核对', value: 1 });
  if (!warnings.length) warnings.push({ tone: 'good', title: '暂无明确预警', detail: '只展示能被现有口径明确判断的问题', value: 0 });
  const maxValue = Math.max(1, ...warnings.map(row => Number(row.value) || 0));
  return `<section class="operations-section">
    <div class="operations-module-head"><div><h3>经营问题优先级</h3><span>只展示能解释、能下钻的问题</span></div></div>
    <div class="operations-overview-priority-list">${warnings.map(row => {
      const width = Math.max(8, Math.min(100, ((Number(row.value) || 0) * 100 / maxValue)));
      return `<div class="operations-overview-priority ${esc(row.tone)}">
        <div><span>${esc(row.title)}</span><strong>${esc(row.detail)}</strong></div>
        <i style="width:${width}%"></i>
      </div>`;
    }).join('')}</div>
  </section>`;
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
    <div class="operations-module-head"><div><h3>校区经营象限</h3><span>收入、利用率与转化表现综合定位</span></div>${operationsMatrixTitleLegend('场地利用率', '订场收入', '订场次数')}</div>
    <div class="operations-chart-host operations-court-comparison-chart" id="operationsCourtComparisonChart"></div>
  </section>`;
}

function renderOperationsCourtCampusOverview(data) {
  const rows = data.court?.campusRows || [];
  const averages = operationsCourtAverages(rows);
  const sortedRows = operationsCourtRankingRows(rows);
  const activeRows = sortedRows.filter(row => (
    (Number(row.bookingAmount) || 0) ||
    (Number(row.bookingHours) || 0) ||
    (Number(row.utilizationRate) || 0)
  ));
  const emptyRows = sortedRows.filter(row => !activeRows.includes(row));
  const body = sortedRows.length ? `<div class="operations-court-ranking-matrix">
    ${activeRows.map(row => {
      const utilization = Math.max(0, Math.min(100, Number(row.utilizationRate) || 0));
      const bookingHours = Number(row.bookingHours) || 0;
      const capacityHours = utilization ? Math.round((bookingHours * 100 / utilization) * 10) / 10 : 0;
      return `<div class="operations-court-ranking-card">
        <div class="operations-court-ranking-head">
          <div class="operations-court-ranking-campus">
            <strong>${esc(row.campusName || '-')}</strong>
            <span>场地利用率 = 已用小时 / 可用小时</span>
          </div>
          <strong class="operations-court-ranking-rate">${fmt(utilization)}%</strong>
        </div>
        <div class="operations-court-ranking-mainbar"><i style="width:${utilization}%"></i></div>
        <div class="operations-court-ranking-capacity">
          已用 ${fmt(bookingHours)} 小时 / 可用约 ${fmt(capacityHours)} 小时
        </div>
        <div class="operations-court-ranking-facts">
          <span>订场收入 <strong>${operationsMoneyText(row.bookingAmount)}</strong></span>
          <span>平均每小时收入 <strong>${operationsMoneyText(bookingHours ? (Number(row.bookingAmount) || 0) / bookingHours : 0)}</strong></span>
        </div>
      </div>`;
    }).join('')}
    ${emptyRows.length ? `<div class="operations-court-ranking-empty">${fmt(emptyRows.length)} 个校区暂无订场数据：${esc(emptyRows.map(row => row.campusName).join('、'))}</div>` : ''}
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
  const endHour = operationsCourtHeatNextHour(hour);
  const venueName = operationsCourtHeatVenueName(venue);
  const usedMinutes = Math.max(0, Number(slot.bookedMinutes ?? slot.occupiedMinutes ?? slot.usedMinutes) || 0);
  const inferredCapacity = rate > 0 && usedMinutes > 0 ? Math.round(usedMinutes * 100 / rate) : 0;
  const capacityMinutes = Math.max(0, Number(slot.capacityMinutes) || inferredCapacity);
  const occupiedRaw = Number(slot.occupiedCount ?? slot.usageCount ?? slot.count);
  const dayRaw = Number(slot.dayCount ?? slot.days);
  const occupiedText = Number.isFinite(occupiedRaw) && occupiedRaw >= 0 ? fmt(occupiedRaw) : '-';
  const dayText = Number.isFinite(dayRaw) && dayRaw > 0 ? fmt(dayRaw) : (capacityMinutes ? fmt(Math.round(capacityMinutes / 30)) : '-');
  const label = `${venueName} ${hour}-${endHour}\n使用：${occupiedText} 次 / ${dayText} 天\n使用时长：${fmt(usedMinutes)} / ${fmt(capacityMinutes)} 分钟\n利用率：${fmt(rate)}%`;
  const firstRowClass = options.firstRow ? ' is-first-row' : '';
  return `<span class="operations-court-heat-cell ${operationsCourtHeatTone(toneRate, usedMinutes)}${firstRowClass}" style="${esc(operationsCourtHeatStyle(toneRate, usedMinutes))}" aria-label="${esc(venueName)} ${esc(hour)}-${esc(endHour)} 利用率 ${fmt(rate)}%，使用时长 ${fmt(usedMinutes)} / ${fmt(capacityMinutes)}分钟" data-rate="${fmt(rate)}" data-heat="${fmt(toneRate)}" data-minutes="${fmt(usedMinutes)}" data-tip="${esc(label)}"></span>`;
}

function operationsHeatTooltipEl() {
  let el = document.getElementById('operationsCourtHeatTooltip');
  if (!el) {
    el = document.createElement('div');
    el.id = 'operationsCourtHeatTooltip';
    el.className = 'operations-court-heat-floating-tooltip';
    document.body.appendChild(el);
  }
  return el;
}

function showOperationsHeatTooltip(cell) {
  const text = cell?.dataset?.tip || '';
  if (!text) return;
  const el = operationsHeatTooltipEl();
  el.textContent = text;
  el.classList.add('show');
  moveOperationsHeatTooltip(cell);
}

function moveOperationsHeatTooltip(cell) {
  const el = document.getElementById('operationsCourtHeatTooltip');
  if (!el || !cell) return;
  const rect = cell.getBoundingClientRect();
  const tooltipRect = el.getBoundingClientRect();
  const top = Math.max(8, rect.top - tooltipRect.height - 10);
  const left = Math.min(window.innerWidth - tooltipRect.width - 8, Math.max(8, rect.left + rect.width / 2 - tooltipRect.width / 2));
  el.style.top = `${Math.round(top)}px`;
  el.style.left = `${Math.round(left)}px`;
}

function hideOperationsHeatTooltip() {
  const el = document.getElementById('operationsCourtHeatTooltip');
  if (el) el.classList.remove('show');
}

function bindOperationsHeatTooltips() {
  document.querySelectorAll('#page-operations .operations-court-heat-cell[data-tip]').forEach(cell => {
    cell.addEventListener('mouseenter', () => showOperationsHeatTooltip(cell));
    cell.addEventListener('mousemove', () => moveOperationsHeatTooltip(cell));
    cell.addEventListener('mouseleave', hideOperationsHeatTooltip);
  });
}

function operationsCourtHeatNextHour(hour = '') {
  const match = String(hour || '').match(/^(\d{1,2}):(\d{2})$/);
  if (!match) return '';
  const total = Number(match[1]) * 60 + Number(match[2]) + 30;
  const h = String(Math.floor(total / 60)).padStart(2, '0');
  const m = String(total % 60).padStart(2, '0');
  return `${h}:${m}`;
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
      <span><i class="idle"></i>空闲</span>
      <span><i class="low"></i>低利用</span>
      <span><i class="medium"></i>中等</span>
      <span><i class="steady"></i>健康</span>
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
  return `${renderOperationsCourtKpis(data)}
  <div class="operations-court-top-grid">
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
  const coach = data.coach || {};
  const rows = coach.rows || [];
  const cards = coach.cards || {};
  const trends = coach.trends || [];
  const comparisons = coach.trendComparisons || {};
  const used = Number(cards.usedHours?.value) || rows.reduce((sum, row) => sum + (Number(row.usedHours) || 0), 0);
  const available = Number(cards.availableHoursThisWeek?.value) || rows.reduce((sum, row) => sum + (Number(row.availableHours) || 0), 0);
  const revenue = Number(cards.revenue?.value) || rows.reduce((sum, row) => sum + (Number(row.revenue) || 0), 0);
  const kpis = [
    { label: '在岗教练', value: cards.activeCoaches?.value || rows.length, unit: '人', rawValue: cards.activeCoaches?.value || rows.length, trendKey: 'activeCoaches', tone: 'neutral' },
    { label: '工时利用率', value: `${fmt(cards.utilizationRate?.value || 0)}%`, rawValue: cards.utilizationRate?.value || 0, trendKey: 'utilizationRate', tone: operationsCoachKpiTone(cards.utilizationRate?.value || 0) },
    { label: '归属课程实收', value: operationsMoneyCompactText(revenue), rawValue: revenue, trendKey: 'revenue', tone: revenue > 0 ? 'revenue' : 'warn' },
    { label: '体验课转化率', value: `${fmt(cards.trialConversionRate?.value || 0)}%`, rawValue: cards.trialConversionRate?.value || 0, trendKey: 'trialConversionRate', tone: 'good' },
    { label: '老客续费率', value: `${fmt(cards.renewalRate?.value || 0)}%`, rawValue: cards.renewalRate?.value || 0, trendKey: 'renewalRate', tone: 'good' }
  ];
  return `<div class="operations-coach-kpi-strip" data-trend-count="${trends.length}">${kpis.map(card => renderOperationsCoachKpi({
    ...card,
    trendValues: operationsCoachTrendValues(trends, card.trendKey, card.rawValue),
    trendPoints: operationsTrendPointsWithFallback(trends, card.trendKey),
    trendComparison: comparisons[card.trendKey]
  })).join('')}</div>
  <div class="operations-coach-hero-grid">
    <section class="operations-section operations-coach-primary-card">
      ${operationsCoachChartHeader('产值 × 工时利用率矩阵', operationsMatrixTitleLegend('工时利用率', '归属实收', '课数'))}
      <div class="operations-chart-host operations-coach-matrix-chart" id="operationsCoachMatrixChart"></div>
    </section>
    <section class="operations-section operations-coach-primary-card">
      ${operationsCoachChartHeader('转化 × 续费能力矩阵', operationsMatrixTitleLegend('体验转化率', '老客续费率', '样本量'))}
      <div class="operations-chart-host operations-coach-matrix-chart" id="operationsCoachCapabilityChart"></div>
    </section>
  </div>
  <div class="operations-coach-secondary-grid">
    <section class="operations-section">
      ${operationsCoachChartHeader('教练产值贡献排行', operationsCoachTitleLegend([
        { label: '归属实收', color: '#8B5E3C' },
        { label: '归属实收占比', color: '#3B6EA8', line: true }
      ]))}
      <div class="operations-chart-host operations-coach-chart" id="operationsCoachParetoChart"></div>
    </section>
    <section class="operations-section">
      ${operationsCoachChartHeader('课程结构占比', operationsCoachTitleLegend([
        { label: '体验课', color: '#F59E0B' },
        { label: '私教课', color: '#4F81FF' },
        { label: '小班课', color: '#10B981' }
      ]))}
      <div class="operations-chart-host operations-coach-chart" id="operationsCoachCourseMixChart"></div>
    </section>
  </div>`;
}

function operationsCoachChartHeader(title, extra = '') {
  return `<div class="operations-module-head"><div><h3>${esc(title)}</h3></div>${extra || ''}</div>`;
}

function operationsCoachTitleLegend(items = []) {
  return `<div class="operations-coach-title-legend">${items.map(item => `<span>${item.color ? `<i class="${item.line ? 'line' : ''}" style="background:${esc(item.color)}"></i>` : ''}${esc(item.label)}</span>`).join('')}</div>`;
}

function operationsMatrixTitleLegend(xAxis, yAxis, bubble) {
  return operationsCoachTitleLegend([
    { label: `X轴：${esc(xAxis)}` },
    { label: `Y轴：${esc(yAxis)}` },
    { label: `圆点大小 = ${esc(bubble)}`, color: '#8EA0B8' }
  ]);
}

function operationsCoachKpiTone(value) {
  const rate = Number(value) || 0;
  if (rate < 40) return 'danger';
  if (rate < 60) return 'warn';
  if (rate < 75) return 'mid';
  if (rate < 90) return 'good';
  return 'overload';
}

function renderOperationsCoachKpi(card = {}) {
  const displayComparison = operationsTrendComparisonForDisplay(card.trendComparison, card.trendPoints);
  return `<div class="operations-coach-kpi ${esc(card.tone || 'neutral')}">
    <div class="operations-coach-kpi-main">
      <div class="operations-coach-kpi-head">
        <span>${esc(card.label || '')}</span>
      </div>
      <div class="operations-coach-kpi-value">
        <strong>${esc(card.value ?? '')}${card.unit ? `<em>${esc(card.unit)}</em>` : ''}</strong>
        <small class="operations-coach-kpi-change ${esc(operationsTrendChangeClass(displayComparison))}">${esc(operationsTrendChangeText(displayComparison, card.trendKey || ''))}</small>
      </div>
    </div>
    ${operationsCoachSparklineSvg(card.trendPoints || [], card.trendKey)}
  </div>`;
}

function operationsCoachTrendValues(trends = [], key = '') {
  const values = operationsTrendValues(trends, key);
  if (!operationsShouldShowTrend()) return [];
  return values.length ? values : [];
}

function operationsCoachTrendPoints(trends = [], key = '') {
  const points = operationsTrendPoints(trends, key);
  if (!operationsShouldShowTrend()) return [];
  return points.length ? points : [];
}

function operationsTrendColor(key, values = []) {
  const first = Number(values[0]) || 0;
  const last = Number(values[values.length - 1]) || 0;
  if (operationsTrendWarningKeys.has(key)) return operationsTrendWarningColor;
  if (operationsTrendNegativeKeys.has(key)) return last > first ? operationsTrendRiskColor : operationsTrendPositiveColor;
  if (operationsTrendPositiveKeys.has(key)) return operationsTrendDefaultColor;
  return operationsTrendDefaultColor;
}

function operationsCoachTrendToneColor(key, values = []) {
  return operationsTrendColor(key, values);
}

function operationsCoachSparklineValues(values = []) {
  const source = (values || []).map(value => Number(value) || 0).filter(value => Number.isFinite(value));
  if (source.length <= 12) return source;
  const targetCount = 12;
  const step = (source.length - 1) / (targetCount - 1);
  return Array.from({ length: targetCount }, (_, index) => source[Math.round(index * step)]);
}

function operationsKpiPointList(points = []) {
  const source = (points || []).map((point, index) => {
    if (typeof point === 'object' && point) {
      const rawValue = point.value;
      if (rawValue === null || rawValue === undefined || rawValue === '') return null;
      const value = Number(rawValue);
      if (!Number.isFinite(value)) return null;
      return {
        date: point.date || `第${index + 1}点`,
        value,
        numerator: point.numerator,
        denominator: point.denominator
      };
    }
    const rawValue = point;
    if (rawValue === null || rawValue === undefined || rawValue === '') return null;
    const value = Number(rawValue);
    if (!Number.isFinite(value)) return null;
    return { date: `第${index + 1}点`, value };
  }).filter(Boolean);
  if (source.length <= 60) return source;
  const targetCount = 60;
  const step = (source.length - 1) / (targetCount - 1);
  return Array.from({ length: targetCount }, (_, index) => source[Math.round(index * step)]);
}

function operationsPointDateSerial(date = '') {
  const match = String(date || '').slice(0, 10).match(/^(\d{4})-(\d{2})-(\d{2})$/);
  if (!match) return null;
  return Math.round(Date.UTC(Number(match[1]), Number(match[2]) - 1, Number(match[3])) / 86400000);
}

function operationsSparklineSegments(coords = []) {
  return coords.length ? [coords] : [];
}

function operationsAreaPath(linePath = '', segment = [], height = 0) {
  if (!linePath || !segment.length) return '';
  const first = segment[0];
  const last = segment[segment.length - 1];
  return `${linePath} L ${last.x} ${height} L ${first.x} ${height} Z`;
}

function operationsKpiValueText(value = 0, key = '') {
  const number = Number(value) || 0;
  if (key === 'revenue' || key === 'bookingAmount') return `¥${fmt(number)}`;
  if (key === 'bookingHours') return `${fmt(number)}小时`;
  if (key === 'activeCoaches') return `${fmt(number)}人`;
  if (['appointmentRate', 'attendanceRate', 'dealRate', 'utilizationRate', 'trialConversionRate', 'renewalRate', 'goldenUtilizationRate', 'offPeakUtilizationRate'].includes(key)) return `${fmt(number)}%`;
  return fmt(number);
}

function operationsKpiSignedValueText(value = 0, key = '') {
  const number = Number(value) || 0;
  if (number === 0) return '';
  const abs = Math.abs(number);
  const sign = number > 0 ? '+' : number < 0 ? '-' : '';
  if (key === 'revenue' || key === 'bookingAmount' || key === 'totalIncome' || key === 'recognizedRevenue' || key === 'pendingRevenue') return `${sign}¥${operationsCompactNumber(abs)}`;
  if (key === 'bookingHours') return `${sign}${fmt(abs)}小时`;
  if (key === 'activeCoaches') return `${sign}${fmt(abs)}人`;
  if (['appointmentRate', 'attendanceRate', 'dealRate', 'utilizationRate', 'trialConversionRate', 'renewalRate', 'goldenUtilizationRate', 'offPeakUtilizationRate'].includes(key)) return `${sign}${fmt(abs)}%`;
  return `${sign}${operationsCompactNumber(abs)}`;
}

function operationsKpiChangeRateText(value = 0) {
  const number = Number(value);
  if (!Number.isFinite(number) || number === 0) return '';
  const sign = number > 0 ? '+' : '';
  return `${sign}${fmt(number)}%`;
}

function operationsKpiRatioText(point = {}, key = '') {
  const numerator = Number(point.numerator);
  const denominator = Number(point.denominator);
  if (!Number.isFinite(numerator) || !Number.isFinite(denominator) || denominator <= 0) return '';
  if (key === 'appointmentRate') return `预约 ${fmt(numerator)} / 线索 ${fmt(denominator)}`;
  if (key === 'attendanceRate') return `到课 ${fmt(numerator)} / 预约 ${fmt(denominator)}`;
  if (key === 'dealRate') return `成交 ${fmt(numerator)} / 到课 ${fmt(denominator)}`;
  if (key === 'renewalRate') return `复购 ${fmt(numerator)} / 付费 ${fmt(denominator)}`;
  return `${fmt(numerator)} / ${fmt(denominator)}`;
}

function operationsKpiPointTip(point = {}, key = '') {
  const ratio = operationsKpiRatioText(point, key);
  return `${point.date || ''} ${operationsKpiValueText(point.value, key)}${ratio ? `（${ratio}）` : ''}`.trim();
}

function operationsKpiPointLabel(point = {}, key = '') {
  const date = String(point.date || '').slice(5).replace('-', '/');
  const ratio = operationsKpiRatioText(point, key);
  return `${date} ${operationsKpiValueText(point.value, key)}${ratio ? `（${ratio}）` : ''}`.trim();
}

function operationsTrendChangeText(comparison = {}, key = '') {
  if (!comparison || comparison.mode !== 'previous_period') return '';
  const rateText = operationsKpiChangeRateText(comparison.changeRate);
  if (rateText) return rateText;
  return operationsKpiSignedValueText(comparison.changeValue, key);
}

function operationsTrendChangeClass(comparison = {}) {
  if (!comparison || comparison.mode !== 'previous_period') return 'muted';
  const change = Number(comparison.changeValue) || 0;
  if (change > 0) return 'up';
  if (change < 0) return 'down';
  return 'muted';
}

function operationsSmoothPath(coords = []) {
  if (!coords.length) return '';
  if (coords.length === 1) return `M ${coords[0].x} ${coords[0].y}`;
  return coords.slice(1).reduce((path, point, index) => {
    const previous = coords[index];
    const distance = point.x - previous.x;
    const cp1x = Math.round((previous.x + distance * 0.18) * 10) / 10;
    const cp2x = Math.round((point.x - distance * 0.18) * 10) / 10;
    return `${path} C ${cp1x} ${previous.y}, ${cp2x} ${point.y}, ${point.x} ${point.y}`;
  }, `M ${coords[0].x} ${coords[0].y}`);
}

function operationsKpiSparklineSvg(points = [], key = '', className = 'operations-coach-kpi-sparkline') {
  const list = operationsKpiPointList(points);
  if (!list.length) return `<div class="${esc(className)}"></div>`;
  const drawablePoints = list.length === 1 ? [list[0], { ...list[0] }] : list;
  const color = operationsTrendColor(key, drawablePoints.map(point => point.value));
  const values = drawablePoints.map(point => point.value);
  const min = Math.min(...values);
  const max = Math.max(...values);
  const isFlat = max === min;
  const range = Math.max(1, max - min);
  const width = 132;
  const height = 64;
  const dateSerials = drawablePoints.map(point => operationsPointDateSerial(point.date)).filter(Number.isFinite);
  const minDateSerial = dateSerials.length === drawablePoints.length ? Math.min(...dateSerials) : null;
  const maxDateSerial = dateSerials.length === drawablePoints.length ? Math.max(...dateSerials) : null;
  const coords = drawablePoints.map((point, index) => {
    const dateSerial = operationsPointDateSerial(point.date);
    const hasDateX = minDateSerial != null && maxDateSerial != null && maxDateSerial > minDateSerial && Number.isFinite(dateSerial);
    const x = hasDateX ? Math.round((dateSerial - minDateSerial) * width / (maxDateSerial - minDateSerial)) : Math.round(index * width / Math.max(1, drawablePoints.length - 1));
    const y = isFlat ? Math.round(height / 2) : Math.round(8 + (height - 18) * (1 - ((point.value - min) / range)));
    return { ...point, dateSerial, x, y };
  });
  const segments = operationsSparklineSegments(coords);
  const paths = segments.map(segment => {
    const linePath = operationsSmoothPath(segment);
    return { linePath, areaPath: operationsAreaPath(linePath, segment, height) };
  }).filter(path => path.linePath);
  const safeGradientKey = String(`${className}-${key || 'line'}`).replace(/[^a-zA-Z0-9_-]/g, '');
  const gradientId = `operationsSpark${++operationsSparklineUid}${safeGradientKey}`;
  return `<div class="${esc(className)}">
    <svg viewBox="0 0 ${width} ${height}" preserveAspectRatio="none">
      <defs><linearGradient id="${esc(gradientId)}" x1="0" x2="0" y1="0" y2="1"><stop offset="0%" stop-color="${esc(color)}" stop-opacity=".12"/><stop offset="72%" stop-color="${esc(color)}" stop-opacity=".035"/><stop offset="100%" stop-color="${esc(color)}" stop-opacity="0"/></linearGradient></defs>
      ${paths.map(path => `<path class="operations-kpi-area" d="${esc(path.areaPath)}" fill="url(#${esc(gradientId)})"></path>`).join('')}
      ${paths.map(path => `<path class="operations-kpi-line" d="${esc(path.linePath)}" fill="none" stroke="${esc(color)}" stroke-linecap="round" stroke-linejoin="round"></path>`).join('')}
    </svg>
    ${coords.map(point => `<span class="operations-kpi-hover-point" style="--trend-color:${esc(color)};left:${Math.round(point.x * 10000 / width) / 100}%;top:${Math.round(point.y * 10000 / height) / 100}%" data-tip="${esc(operationsKpiPointLabel(point, key))}"></span>`).join('')}
  </div>`;
}

function operationsCoachSparklineSvg(points = [], key = '') {
  return operationsKpiSparklineSvg(points, key, 'operations-coach-kpi-sparkline');
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

function operationsConversionRowDate(row = {}) {
  const value = row.leadDate || row.createdAt || row.trialAtRaw || row.trialLessonAt || row.trialAt || '';
  if (!value) return '';
  const parsed = value instanceof Date ? value : new Date(String(value).replace(' ', 'T'));
  if (!parsed || Number.isNaN(parsed.getTime())) return '';
  return dateKey(parsed);
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
        trialCount: attendanceCount,
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

function operationsConversionKpiCards(funnel = [], standardRates = {}) {
  const total = operationsFunnelStep(funnel, 0);
  const appointment = operationsFunnelStep(funnel, 1);
  const attendance = operationsFunnelStep(funnel, 2);
  const deal = operationsFunnelStep(funnel, 3);
  const renewal = operationsFunnelStep(funnel, 4);
  const standardTrial = Number(standardRates.trialConversionRate);
  const standardRenewal = Number(standardRates.renewalRate);
  return [
    { label: '线索量', value: fmt(total.count || 0), unit: '人', trendValue: total.count || 0, trendKey: 'leads', tone: 'lead' },
    { label: '预约率', value: `${fmt(appointment.percentOfTotal || 0)}%`, trendValue: appointment.percentOfTotal || 0, trendKey: 'appointmentRate', tone: 'conversion' },
    { label: '到课率', value: `${fmt(attendance.transitionRate || 0)}%`, trendValue: attendance.transitionRate || 0, trendKey: 'attendanceRate', tone: 'conversion' },
    { label: '成交率', value: `${fmt(Number.isFinite(standardTrial) ? standardTrial : (deal.transitionRate || 0))}%`, trendValue: Number.isFinite(standardTrial) ? standardTrial : (deal.transitionRate || 0), trendKey: 'dealRate', tone: 'conversion' },
    { label: '续费率', value: `${fmt(Number.isFinite(standardRenewal) ? standardRenewal : (renewal.transitionRate || 0))}%`, trendValue: Number.isFinite(standardRenewal) ? standardRenewal : (renewal.transitionRate || 0), trendKey: 'renewalRate', tone: 'retention' }
  ];
}

function operationsConversionTrendPoints(trends = [], key = '') {
  const points = operationsTrendPoints(trends, key);
  if (!operationsShouldShowTrend()) return [];
  return points;
}

function operationsConversionSparklineSvg(points = [], key = '') {
  return operationsKpiSparklineSvg(points, key, 'operations-conversion-kpi-sparkline');
}

function renderOperationsConversionKpi(card = {}) {
  const displayComparison = operationsTrendComparisonForDisplay(card.trendComparison, card.trendPoints);
  return `<div class="operations-court-kpi operations-conversion-kpi ${esc(card.tone || 'neutral')}">
    <div class="operations-court-kpi-main">
      <div class="operations-court-kpi-head">
        <span>${esc(card.label || '')}</span>
      </div>
      <div class="operations-court-kpi-value">
        <strong>${esc(card.value ?? '')}${card.unit ? `<em>${esc(card.unit)}</em>` : ''}</strong>
        <small class="operations-court-kpi-change ${esc(operationsTrendChangeClass(displayComparison))}">${esc(operationsTrendChangeText(displayComparison, card.trendKey || ''))}</small>
      </div>
    </div>
    ${operationsConversionSparklineSvg(card.trendPoints || [], card.trendKey || '')}
  </div>`;
}

function operationsInsightCard(tone, label, title, caption) {
  return `<div class="operations-insight-card ${esc(tone)}">
    <span>${esc(label)}</span>
    <strong>${esc(title)}</strong>
    <p>${esc(caption)}</p>
  </div>`;
}

function operationsChannelQualityRows(rows = []) {
  const labels = { good: '高价值', warn: '待优化', danger: '低效' };
  return (rows || []).map(row => {
    const leads = Number(row.leads) || 0;
    const deals = Number(row.deals) || 0;
    const trialConversionRate = Number(row.trialConversionRate) || 0;
    const dealConversionRate = Number(row.dealConversionRate) || 0;
    const trialCount = Number(row.trialCount ?? row.attendanceCount ?? row.trials) || Math.round(leads * trialConversionRate / 100);
    let statusLabel = labels.danger;
    let statusTone = 'danger';
    if (deals > 0 && dealConversionRate >= 15) {
      statusLabel = labels.good;
      statusTone = 'good';
    } else if (deals > 0) {
      statusLabel = labels.warn;
      statusTone = 'warn';
    }
    return {
      source: row.source || '未记录',
      leads,
      trialCount,
      deals,
      trialConversionRate,
      dealConversionRate,
      statusLabel,
      statusTone
    };
  }).filter(row => row.leads > 0)
    .sort((a, b) => b.leads - a.leads || b.dealConversionRate - a.dealConversionRate || b.deals - a.deals);
}

function operationsChannelStatusTag(row = {}) {
  return `<span class="operations-channel-status ${esc(row.statusTone || 'danger')}">${esc(row.statusLabel || '低效')}</span>`;
}

function operationsChannelRankingTable(rows = []) {
  if (!rows.length) return '<div class="operations-channel-empty">暂无渠道数据</div>';
  return `<div class="operations-channel-ranking-table">
    <div class="operations-channel-ranking-head">
      <span>渠道</span><span>线索</span><span>体验</span><span>成交</span><span>体验转化</span><span>成交转化</span><span>判断</span>
    </div>
    ${rows.map(row => `<div class="operations-channel-ranking-row">
      <strong>${esc(row.source)}</strong>
      <span>${fmt(row.leads)}</span>
      <span>${fmt(row.trialCount)}</span>
      <span>${fmt(row.deals)}</span>
      <span>${fmt(row.trialConversionRate)}%</span>
      <span>${fmt(row.dealConversionRate)}%</span>
      ${operationsChannelStatusTag(row)}
    </div>`).join('')}
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
      studentAttributeRows: data.conversion?.studentAttributeRows || [],
      courseRows: [],
      trendRows: data.conversion?.trends || []
    };
  }
  return {
    courseFunnel: operationsBuildCourseFunnel(rows),
    sourceRanking: operationsBuildSourceRanking(rows),
    channelEfficiencyRows: operationsBuildChannelEfficiencyRows(rows),
    studentAttributeRows: operationsBuildAttributeRows(rows),
    courseRows: rows,
    trendRows: data.conversion?.trends || []
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
  const options = operationsConversionFilterOptions(data);
  return `<section class="operations-section operations-funnel-card">
    <div class="operations-module-head">
      <div><h3>全局转化漏斗</h3><span>转化节点与流失监控</span></div>
      <div class="operations-funnel-filter-row">
        ${operationsFilterDropdown('operationsConversionSource', '全部渠道', options.sources || [], operationsConversionFilters.source)}
        ${operationsFilterDropdown('operationsConversionCampus', '全部校区', options.campuses || [], operationsConversionFilters.campus)}
        ${operationsFilterDropdown('operationsConversionCoach', '全部教练', options.coaches || [], operationsConversionFilters.coach)}
      </div>
    </div>
    <div class="operations-funnel-host" id="operationsCourseFunnel"></div>
  </section>`;
}

function renderConversionCommandCenter(data, conversion) {
  const comparisons = data.conversion?.trendComparisons || {};
  return `<div class="operations-kpi-row operations-court-kpi-row operations-conversion-kpi-row">
      ${operationsConversionKpiCards(conversion.courseFunnel || [], data.conversion?.standardRates || {}).map(card => renderOperationsConversionKpi({
        ...card,
        trendValue: card.trendValue,
        trendPoints: operationsTrendPointsWithFallback(conversion.trendRows || [], card.trendKey),
        trendComparison: comparisons[card.trendKey]
      })).join('')}
    </div>`;
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
  const rows = operationsChannelQualityRows(conversion.channelEfficiencyRows || []);
  return `<section class="operations-section">
    <div class="operations-module-head"><div><h3>渠道效率监控</h3><span>用象限图先判断渠道质量，再看排行明细</span></div>${operationsMatrixTitleLegend('成交转化率', '线索量', '成交人数')}</div>
    <div class="operations-channel-quality-layout">
      <div class="operations-channel-quality-chart" id="operationsChannelQualityChart"></div>
      ${operationsChannelRankingTable(rows)}
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
    ${operationsAttributeMetric(`首购后续费率`, row.renewalRate)}
    <div class="operations-attribute-note">首购 ${fmt(row.deals)} 人 / 续费 ${fmt(row.renewals)} 人</div>
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
  const overview = data.overview || {};
  const cards = overview.cards || {};
  renderStandardChart('operationsOverviewRevenueMixChart', buildStandardPieChartOption({ rows: overview.revenueMix || [], name: '收入结构' }), { height: 260 });
  renderStandardChart('operationsOverviewCashChart', buildOperationsOverviewCashChartOption({
    totalIncome: operationsCardNumber(cards.totalIncome),
    recognizedRevenue: operationsCardNumber(cards.recognizedRevenue),
    pendingRevenue: operationsCardNumber(cards.pendingRevenue)
  }), { height: 260 });
  renderStandardChart('operationsOverviewCoachMatrixChart', buildOperationsCoachMatrixChartOption({ rows: data.coach?.rows || [] }), { height: 300 });
  renderStandardChart('operationsOverviewCourtQuadrantChart', buildOperationsCourtQuadrantChartOption({
    rows: (data.court?.campusRows || []).length ? data.court.campusRows : (data.court?.campusComparison || [])
  }), { height: 300 });
  renderStandardChart('operationsCourtComparisonChart', buildOperationsCourtQuadrantChartOption({
    rows: (data.court?.campusRows || []).length ? data.court.campusRows : (data.court?.campusComparison || [])
  }), { height: 296 });
  renderProgressFunnel('operationsCourseFunnel', conversion.courseFunnel || []);
  renderStandardChart('operationsChannelQualityChart', buildOperationsChannelQualityChartOption({
    rows: operationsChannelQualityRows(conversion.channelEfficiencyRows || [])
  }), { height: 360, emptyText: '暂无渠道数据' });
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
  renderStandardChart('operationsCoachMatrixChart', buildOperationsCoachMatrixChartOption({ rows: data.coach?.rows || [] }), { height: 360 });
  renderStandardChart('operationsCoachParetoChart', buildOperationsCoachParetoChartOption({ rows: data.coach?.revenueParetoRows || [] }), { height: 280 });
  renderStandardChart('operationsCoachCourseMixChart', buildOperationsCoachCourseMixChartOption({ rows: data.coach?.courseMixRows || [] }), { height: 280 });
  renderStandardChart('operationsCoachCapabilityChart', buildOperationsCoachCapabilityChartOption({ rows: data.coach?.capabilityRows || [] }), { height: 360, emptyText: '暂无老客续费基数，暂不生成能力矩阵' });
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
  const renderPanel = panels[operationsActiveTab] || panels.overview;
  host.innerHTML = `<div class="operations-page">${renderPanel(data)}</div>`;
  requestAnimationFrame(() => {
    bindOperationsHeatTooltips();
    renderOperationsCharts(data);
  });
}
