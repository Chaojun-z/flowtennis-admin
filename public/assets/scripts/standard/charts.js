const standardChartInstances = new Map();

// Standard base components stay in standard/components.js:
// function renderStandardDropdownHtml(
// function renderStandardCellText(
// function renderStandardEmptyText(
// function setStandardDropdownValue(

function standardChartEmpty(host, text = '暂无图表数据') {
  host.innerHTML = `<div class="tms-empty-state" style="height:100%;display:flex;align-items:center;justify-content:center"><div class="tms-empty-title">${esc(text)}</div></div>`;
}

function renderProgressFunnel(id, rows = [], { emptyText = '暂无漏斗数据' } = {}) {
  const host = document.getElementById(id);
  if (!host) return;
  const list = (rows || []).filter(row => row && row.stage);
  if (!list.length) {
    standardChartEmpty(host, emptyText);
    return;
  }
  const max = Math.max(1, Number(list[0]?.count) || 0, ...list.map(row => Number(row.count) || 0));
  host.innerHTML = `<div class="operations-progress-funnel">
    <div class="operations-funnel-scale"><span>25%</span><span>50%</span><span>75%</span><span>100%</span></div>
    <div class="operations-funnel-body">
    ${list.map((row, index) => {
      const count = Number(row.count) || 0;
      const percent = Math.max(0, Math.min(100, Number(row.percentOfTotal ?? (count * 100 / max)) || 0));
      const transition = Number(row.transitionRate ?? 0) || 0;
      const loss = Math.max(0, Number(row.lossRate ?? (index > 0 ? 100 - transition : 0)) || 0);
      const stepRate = index > 0 ? transition : percent;
      return `<div class="operations-funnel-row" title="${esc(row.stage)}：${fmt(count)} 人，环节转化 ${fmt(stepRate)}%">
        <div class="operations-funnel-step">
          <div class="operations-funnel-head">
            <strong>${esc(row.stage)}</strong>
            <span>${fmt(count)} 人</span>
          </div>
          <div class="operations-funnel-track">
            <div class="operations-funnel-fill" style="width:${percent}%"></div>
            <span class="operations-funnel-step-rate">环节转化 ${fmt(stepRate)}%</span>
          </div>
        </div>
        <div class="operations-funnel-loss">
          ${index > 0 ? `<strong class="operations-funnel-loss-badge">流失 ${fmt(loss)}%</strong>` : `<strong class="operations-funnel-base-badge">基准流量</strong>`}
        </div>
      </div>`;
    }).join('')}
    </div>
  </div>`;
}

function renderStandardChart(id, option = {}, { height = 260, emptyText = '暂无图表数据' } = {}) {
  const host = document.getElementById(id);
  if (!host) return null;
  host.style.height = `${Number(height) || 260}px`;
  if (!window.echarts) {
    standardChartEmpty(host, '图表组件加载失败');
    return null;
  }
  if (!option || !Array.isArray(option.series) || !option.series.length) {
    standardChartEmpty(host, emptyText);
    return null;
  }
  let chart = standardChartInstances.get(id);
  if (chart && chart.getDom && chart.getDom() !== host) {
    chart.dispose();
    standardChartInstances.delete(id);
    chart = null;
  }
  if (!chart) {
    chart = echarts.init(host);
    standardChartInstances.set(id, chart);
  }
  chart.setOption(option, true);
  chart.resize();
  return chart;
}

function standardChartBaseOption() {
  return {
    color: ['#805435', '#2F7D67', '#C58A3A', '#466A9F', '#9B5E5E', '#6B7280'],
    grid: { left: 36, right: 18, top: 28, bottom: 34, containLabel: true },
    tooltip: { trigger: 'axis' },
    textStyle: { color: '#5F5148', fontFamily: 'inherit' }
  };
}

function formatOperationChartTooltip(params = []) {
  const list = Array.isArray(params) ? params : [params];
  const title = list[0]?.axisValueLabel || list[0]?.name || '';
  const rows = list.map(item => {
    const value = Array.isArray(item.value) ? item.value[item.value.length - 1] : item.value;
    const text = item.seriesType === 'line' ? `${fmt(value)}%` : `¥${fmt(value)}`;
    return `<div style="display:flex;align-items:center;justify-content:space-between;gap:18px;margin-top:4px;font-size:12px;font-weight:400">
      <span>${item.marker || ''}${esc(item.seriesName || '')}</span><span>${text}</span>
    </div>`;
  }).join('');
  return `<div style="min-width:150px;font-size:12px;font-weight:400"><span>${esc(title)}</span>${rows}</div>`;
}

function buildStandardBarChartOption({ labels = [], values = [], name = '' } = {}) {
  if (!labels.length) return { series: [] };
  return {
    ...standardChartBaseOption(),
    xAxis: { type: 'category', data: labels, axisTick: { show: false } },
    yAxis: { type: 'value', splitLine: { lineStyle: { color: '#EEE5DF' } } },
    series: [{
      name,
      type: 'bar',
      data: values,
      barMaxWidth: 34,
      itemStyle: { borderRadius: [6, 6, 0, 0] },
      emphasis: { focus: 'series', itemStyle: { shadowBlur: 12, shadowColor: 'rgba(47,107,255,.18)' } }
    }]
  };
}

function buildStandardBarLineChartOption({ labels = [], barValues = [], lineValues = [], barName = '', lineName = '' } = {}) {
  if (!labels.length) return { series: [] };
  return {
    ...standardChartBaseOption(),
    tooltip: { trigger: 'axis', formatter: formatOperationChartTooltip, textStyle: { fontSize: 12, fontWeight: 400 } },
    legend: { bottom: 4, left: 'center', itemGap: 22, itemWidth: 28, itemHeight: 12, textStyle: { color: '#6E625A', fontSize: 12, fontWeight: 400 } },
    grid: { left: 8, right: 8, top: 16, bottom: 38, containLabel: false },
    xAxis: { type: 'category', data: labels, axisTick: { show: false }, axisLine: { show: false }, axisLabel: { color: '#9CA3AF', fontSize: 11 } },
    yAxis: [
      { type: 'value', splitNumber: 4, axisLine: { show: false }, axisTick: { show: false }, axisLabel: { show: false }, splitLine: { show: false } },
      { type: 'value', splitNumber: 4, min: 0, max: 100, axisLine: { show: false }, axisTick: { show: false }, axisLabel: { show: false }, splitLine: { show: false } }
    ],
    series: [
      {
        name: barName,
        type: 'bar',
        data: barValues,
        barWidth: 30,
        itemStyle: { color: '#8E5A3C', borderRadius: [6, 6, 0, 0] },
        emphasis: { focus: 'series', itemStyle: { shadowBlur: 12, shadowColor: 'rgba(47,107,255,.18)' } }
      },
      {
        name: lineName,
        type: 'line',
        yAxisIndex: 1,
        data: lineValues,
        smooth: true,
        symbolSize: 8,
        itemStyle: { color: '#3B82F6' },
        lineStyle: { width: 3, color: '#3B82F6' },
        emphasis: { focus: 'series', scale: true }
      }
    ]
  };
}

function operationsCourtQuadrantColor(row = {}) {
  if (!row.hasData) return '#CBD5E1';
  const conversion = Number(row.trialConversionRate) || Number(row.repeatCustomerConversionRate) || 0;
  if (conversion >= 70) return '#14B8A6';
  if (conversion >= 35) return '#3B82F6';
  return '#F59E0B';
}

function operationsCourtQuadrantTooltip(item = {}) {
  const row = item.data?.raw || {};
  return `<div style="min-width:176px;font-size:12px;line-height:1.7;color:#172033">
    <div style="font-weight:700;margin-bottom:4px">${esc(row.campusName || item.name || '-')}</div>
    <div>订场收入：¥${fmt(row.bookingAmount || 0)}</div>
    <div>场次利用率：${fmt(row.utilizationRate || 0)}%</div>
    <div>订场次数：${fmt(row.bookingCount || 0)}</div>
    <div>体验转化：${fmt(row.trialConversionRate || 0)}%</div>
    <div>老客转化：${fmt(row.repeatCustomerConversionRate || 0)}%</div>
  </div>`;
}

function buildOperationsCourtQuadrantChartOption({ rows = [] } = {}) {
  const rawRows = (rows || []).map(row => {
    const bookingAmount = Number(row.bookingAmount) || 0;
    const utilizationRate = Number(row.utilizationRate) || 0;
    const bookingCount = Number(row.bookingCount) || 0;
    const trialConversionRate = Number(row.trialConversionRate) || 0;
    const repeatCustomerConversionRate = Number(row.repeatCustomerConversionRate) || 0;
    return {
      campusName: row.campusName || '-',
      bookingAmount,
      utilizationRate,
      bookingCount,
      trialConversionRate,
      repeatCustomerConversionRate,
      hasData: bookingAmount > 0 || utilizationRate > 0 || bookingCount > 0 || trialConversionRate > 0 || repeatCustomerConversionRate > 0
    };
  }).filter(row => row.campusName);
  const source = rawRows.filter(row => row.hasData);
  if (!source.length) return { series: [] };
  const activeRows = source;
  const avgUtilization = activeRows.length ? activeRows.reduce((sum, row) => sum + row.utilizationRate, 0) / activeRows.length : 0;
  const avgRevenue = activeRows.length ? activeRows.reduce((sum, row) => sum + row.bookingAmount, 0) / activeRows.length : 0;
  const maxRevenue = Math.max(1, ...source.map(row => row.bookingAmount), avgRevenue);
  const maxUtilization = Math.max(12, ...source.map(row => row.utilizationRate), avgUtilization);
  const maxBookingCount = Math.max(1, ...source.map(row => row.bookingCount));
  const data = source.map(row => ({
    name: row.campusName,
    raw: row,
    value: [row.utilizationRate, row.bookingAmount, row.bookingCount, row.trialConversionRate],
    itemStyle: {
      color: operationsCourtQuadrantColor(row),
      opacity: 0.82,
      borderColor: '#FFFFFF',
      borderWidth: 2,
      shadowBlur: 14,
      shadowColor: 'rgba(20,184,166,.22)'
    },
    label: { color: '#172033' }
  }));
  return {
    color: ['#14B8A6', '#3B82F6', '#F59E0B', '#CBD5E1'],
    grid: { left: 12, right: 12, top: 28, bottom: 34, containLabel: false },
    tooltip: { trigger: 'item', formatter: operationsCourtQuadrantTooltip, textStyle: { fontSize: 12, fontWeight: 400 } },
    xAxis: {
      type: 'value',
      min: 0,
      max: Math.ceil(Math.min(100, maxUtilization * 1.35)),
      axisLabel: { formatter: '{value}%', color: '#94A3B8', fontSize: 11 },
      axisLine: { lineStyle: { color: '#E2E8F0' } },
      axisTick: { show: false },
      splitLine: { lineStyle: { color: '#EEF2F7', type: 'dashed' } }
    },
    yAxis: {
      type: 'value',
      min: 0,
      max: Math.ceil(maxRevenue * 1.24),
      axisLabel: { inside: true, margin: 8, formatter: value => `¥${fmt(value / 10000)}万`, color: '#94A3B8', fontSize: 11 },
      axisLine: { lineStyle: { color: '#E2E8F0' } },
      axisTick: { show: false },
      splitLine: { lineStyle: { color: '#EEF2F7', type: 'dashed' } }
    },
    series: [{
      name: '校区经营位置',
      type: 'scatter',
      data,
      symbolSize: item => {
        const bookingCount = Number(item?.[2]) || 0;
        return Math.max(18, Math.min(58, 18 + (bookingCount / maxBookingCount) * 40));
      },
      label: {
        show: true,
        position: 'right',
        formatter: item => item.name,
        fontSize: 11,
        fontWeight: 600
      },
      emphasis: { focus: 'self', scale: true, label: { show: true } },
      markLine: {
        silent: true,
        symbol: 'none',
        lineStyle: { color: '#CBD5E1', type: 'dashed', width: 1 },
        label: { color: '#64748B', fontSize: 11 },
        data: [
          { name: '平均利用率', xAxis: avgUtilization, label: { formatter: '平均利用率', position: 'insideEndTop' } },
          { name: '平均收入', yAxis: avgRevenue, label: { formatter: '平均收入', position: 'insideEndTop' } }
        ]
      }
    }]
  };
}

function buildStandardLineChartOption({ labels = [], values = [], name = '' } = {}) {
  if (!labels.length) return { series: [] };
  return {
    ...standardChartBaseOption(),
    xAxis: { type: 'category', data: labels, boundaryGap: false },
    yAxis: { type: 'value', splitLine: { lineStyle: { color: '#EEE5DF' } } },
    series: [{ name, type: 'line', data: values, smooth: true, symbolSize: 6, areaStyle: { opacity: 0.08 }, emphasis: { focus: 'series', scale: true } }]
  };
}

function buildStandardPieChartOption({ rows = [], nameKey = 'name', valueKey = 'value', name = '' } = {}) {
  const data = (rows || [])
    .map(row => ({ name: row[nameKey], value: Number(row[valueKey]) || 0 }))
    .filter(row => row.name && row.value > 0);
  if (!data.length) return { series: [] };
  return {
    tooltip: { trigger: 'item' },
    color: ['#805435', '#2F7D67', '#C58A3A', '#466A9F', '#9B5E5E', '#6B7280'],
    legend: { bottom: 0, left: 'center', textStyle: { color: '#6E625A' } },
    series: [{
      name,
      type: 'pie',
      radius: ['42%', '68%'],
      center: ['50%', '44%'],
      avoidLabelOverlap: true,
      label: { formatter: '{b}\n{d}%' },
      emphasis: { focus: 'self', scale: true, scaleSize: 6 },
      data
    }]
  };
}

function buildStandardFunnelChartOption({ rows = [], nameKey = 'stage', valueKey = 'count', name = '' } = {}) {
  const data = (rows || []).map(row => ({ name: row[nameKey], value: Number(row[valueKey]) || 0 })).filter(row => row.name);
  if (!data.length) return { series: [] };
  return {
    tooltip: { trigger: 'item' },
    color: ['#805435', '#2F7D67', '#C58A3A', '#466A9F', '#9B5E5E', '#6B7280'],
    series: [{
      name,
      type: 'funnel',
      left: 16,
      right: 16,
      top: 18,
      bottom: 18,
      minSize: '20%',
      maxSize: '92%',
      sort: 'none',
      data,
      label: { formatter: '{b} {c}' },
      emphasis: { focus: 'self', itemStyle: { shadowBlur: 12, shadowColor: 'rgba(47,107,255,.18)' } }
    }]
  };
}

function buildStandardHeatmapChartOption({ rows = [] } = {}) {
  const dataRows = (rows || []).filter(row => Array.isArray(row) && row.length >= 3);
  if (!dataRows.length) return { series: [] };
  const venues = [...new Set(dataRows.map(row => row[0]))];
  const times = [...new Set(dataRows.map(row => row[1]))];
  const data = dataRows.map(row => [venues.indexOf(row[0]), times.indexOf(row[1]), Number(row[2]) || 0]);
  return {
    tooltip: { position: 'top' },
    grid: { left: 70, right: 20, top: 24, bottom: 34 },
    xAxis: { type: 'category', data: venues, splitArea: { show: true } },
    yAxis: { type: 'category', data: times, splitArea: { show: true } },
    visualMap: { min: 0, max: Math.max(1, ...data.map(row => row[2])), calculable: false, orient: 'horizontal', left: 'center', bottom: 0 },
    series: [{ type: 'heatmap', data, label: { show: false }, emphasis: { focus: 'self', itemStyle: { shadowBlur: 10, shadowColor: 'rgba(47,107,255,.18)' } } }]
  };
}

window.addEventListener('resize', () => {
  standardChartInstances.forEach(chart => chart.resize());
});
