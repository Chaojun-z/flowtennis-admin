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
    <div class="operations-funnel-body">
    ${list.map((row, index) => {
      const count = Number(row.count) || 0;
      const percent = Math.max(0, Math.min(100, Number(row.percentOfTotal ?? (count * 100 / max)) || 0));
      const next = list[index + 1];
      const transition = next ? (Number(next.transitionRate ?? 0) || 0) : 0;
      const loss = next ? Math.max(0, Number(next.lossRate ?? (100 - transition)) || 0) : 0;
      const nextCount = next ? (Number(next.count) || 0) : count;
      const lossCount = Math.max(0, count - nextCount);
      const transitionHtml = next ? `<div class="operations-funnel-transition" title="${esc(row.stage)} → ${esc(next.stage)}：转化 ${fmt(transition)}%，流失 ${fmt(lossCount)} 人">
        <div class="operations-funnel-conversion">
          <span class="operations-funnel-arrow">↓</span>
          <strong>${fmt(transition)}%</strong>
          <span>转化</span>
        </div>
        <div class="operations-funnel-drop">流失 ${fmt(loss)}% · ${fmt(lossCount)} 人</div>
      </div>` : '';
      return `<div class="operations-funnel-row">
        <div class="operations-funnel-node" title="${esc(row.stage)}：${fmt(count)} 人">
          <div class="operations-funnel-volume" style="width:${Math.max(1, percent)}%"></div>
          <strong>${esc(row.stage)}</strong>
          <span class="operations-funnel-value"><b>${fmt(count)}</b><em>人</em></span>
        </div>
        ${transitionHtml}
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
    xAxis: { type: 'category', data: labels, axisTick: { show: false }, axisLine: { show: false }, axisLabel: { color: '#A19080', fontSize: 11 } },
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

function buildStandardBubbleMatrixChartOption({
  color,
  grid = { left: 18, right: 18, top: 18, bottom: 30, containLabel: true },
  tooltip = { trigger: 'item' },
  xAxis = {},
  yAxis = {},
  seriesName = '',
  data = [],
  symbolSize,
  label = {},
  labelLayout = { hideOverlap: true },
  markLine,
  markArea
} = {}) {
  if (!data.length) return { series: [] };
  const sortedData = operationsBubbleSortData(data);
  return {
    ...(color ? { color } : {}),
    grid,
    tooltip,
    xAxis,
    yAxis,
    series: [{
      name: seriesName,
      type: 'scatter',
      data: sortedData,
      ...(symbolSize ? { symbolSize } : {}),
      label,
      emphasis: { focus: 'self', scale: false, label: { show: true, formatter: label.formatter }, itemStyle: { borderWidth: 3, shadowBlur: 18 } },
      blur: { itemStyle: { opacity: 0.22 } },
      ...(labelLayout ? { labelLayout } : {}),
      ...(markLine ? { markLine } : {}),
      ...(markArea ? { markArea } : {})
    }]
  };
}

function buildStandardBusinessBubbleMatrixChartOption(option = {}) {
  return buildStandardBubbleMatrixChartOption(option);
}

function buildStandardQuadrantBubbleMatrixChartOption(option = {}) {
  return buildStandardBubbleMatrixChartOption(option);
}

function operationsTextWidth(text = '', fontSize = 11) {
  return String(text || '').split('').reduce((sum, char) => {
    if (/[\u4e00-\u9fff]/.test(char)) return sum + fontSize;
    if (/[A-Z0-9%¥]/.test(char)) return sum + fontSize * 0.62;
    return sum + fontSize * 0.52;
  }, 0);
}

function operationsMatrixGrid({ xLabels = [], yLabels = [] } = {}) {
  const yLabelWidth = Math.max(0, ...yLabels.map(label => operationsTextWidth(label, 11)));
  const lastXLabelWidth = operationsTextWidth(xLabels[xLabels.length - 1] || '', 11);
  return {
    left: Math.ceil(yLabelWidth + 14),
    right: Math.ceil(lastXLabelWidth / 2 + 12),
    top: 12,
    bottom: 24,
    containLabel: false
  };
}

function operationsNiceAxisMax(maxValue) {
  const value = Math.max(1, Number(maxValue) || 1);
  const exponent = Math.floor(Math.log10(value));
  const unit = Math.pow(10, exponent);
  const fraction = value / unit;
  const niceFractions = [1, 1.2, 1.5, 2, 2.5, 3, 4, 5, 6, 7.5, 8, 10];
  const niceFraction = niceFractions.find(item => item >= fraction) || 10;
  return niceFraction * unit;
}

function operationsMoneyAxisRange(values = [], { defaultMax = 10000 } = {}) {
  const maxValue = Math.max(0, ...values.map(value => Number(value) || 0));
  const max = maxValue > defaultMax ? operationsNiceAxisMax(maxValue * 1.06) : defaultMax;
  const interval = max / 5;
  return { max, interval };
}

function operationsPercentAxisRange(values = [], { defaultMax = 100, max = 100 } = {}) {
  const maxValue = Math.max(0, ...values.map(value => Number(value) || 0));
  const axisMax = Math.min(max, maxValue > defaultMax ? operationsNiceAxisMax(maxValue * 1.06) : defaultMax);
  return { max: axisMax, interval: axisMax / 5 };
}

function operationsAxisTickLabels(axis = {}, formatter = value => value) {
  const interval = Number(axis.interval) || 0;
  if (!interval) return [];
  return Array.from({ length: 6 }, (_, index) => formatter(interval * index));
}

function operationsAxisBandColor(value, axis = {}, colors = []) {
  const interval = Number(axis.interval) || 0;
  if (!interval || !colors.length) return colors[0] || '#E05252';
  const index = Math.max(0, Math.min(colors.length - 1, Math.floor((Number(value) || 0) / interval)));
  return colors[index];
}

function operationsAxisBandMarkAreas(axis = {}, colors = []) {
  const interval = Number(axis.interval) || 0;
  if (!interval || !colors.length) return [];
  return colors.map((color, index) => [
    { xAxis: interval * index, itemStyle: { color } },
    { xAxis: interval * (index + 1) }
  ]);
}

function operationsBubbleSize(metric, maxMetric, { min = 12, max = 34 } = {}) {
  const value = Math.max(0, Number(metric) || 0);
  const maxValue = Math.max(1, Number(maxMetric) || 1);
  const ratio = Math.min(1, value / maxValue);
  return Math.round((min + Math.sqrt(ratio) * (max - min)) * 10) / 10;
}

function operationsBubblePointSize(point = {}) {
  return Number(point.symbolSize || point.bubbleSize || 0);
}

function operationsBubbleSortData(data = []) {
  return [...data].sort((a, b) => operationsBubblePointSize(b) - operationsBubblePointSize(a));
}

function operationsChannelQualityColor(row = {}) {
  if (row.statusTone === 'good') return '#2E8B6D';
  if (row.statusTone === 'warn') return '#D89135';
  return '#E05252';
}

function operationsChannelQualityTooltip(item = {}) {
  const row = item.data?.raw || {};
  const leads = Number(row.leads) || 0;
  return `<div style="min-width:176px;font-size:12px;line-height:1.75;color:#172033">
    <div style="font-weight:700;margin-bottom:4px">${esc(row.source || item.name || '-')}</div>
    <div>线索量：${fmt(row.leads || 0)} 人</div>
    <div>体验人数：${fmt(row.trialCount || 0)} 人</div>
    <div>成交人数：${fmt(row.deals || 0)} 人</div>
    <div>圆点大小：成交人数</div>
    <div>体验转化率：${fmt(row.trialConversionRate || 0)}%</div>
    <div>成交转化率：${fmt(row.dealConversionRate || 0)}%</div>
    ${leads > 0 && leads < 10 ? '<div style="color:#A16207">线索样本较小，仅作参考</div>' : ''}
    <div>判断：${esc(row.statusLabel || '-')}</div>
  </div>`;
}

function buildOperationsChannelQualityChartOption({ rows = [] } = {}) {
  const source = (rows || []).filter(row => row && row.source && (Number(row.leads) || 0) > 0);
  if (!source.length) return { series: [] };
  const maxLeads = Math.max(1, ...source.map(row => Number(row.leads) || 0));
  const maxDeals = Math.max(1, ...source.map(row => Number(row.deals) || 0));
  const maxRate = Math.max(20, ...source.map(row => Number(row.dealConversionRate) || 0));
  const axisMaxRate = Math.min(100, Math.max(20, Math.ceil(maxRate / 10) * 10));
  const axisMaxLeads = Math.max(10, Math.ceil(maxLeads / 10) * 10);
  const avgRate = source.reduce((sum, row) => sum + (Number(row.dealConversionRate) || 0), 0) / source.length;
  const avgLeads = source.reduce((sum, row) => sum + (Number(row.leads) || 0), 0) / source.length;
  return buildStandardBusinessBubbleMatrixChartOption({
    grid: operationsMatrixGrid({
      xLabels: operationsAxisTickLabels({ max: axisMaxRate, interval: axisMaxRate / 5 }, value => `${fmt(value)}%`),
      yLabels: operationsAxisTickLabels({ max: axisMaxLeads, interval: axisMaxLeads / 5 }, value => fmt(value))
    }),
    tooltip: { trigger: 'item', formatter: operationsChannelQualityTooltip, textStyle: { fontSize: 12, fontWeight: 400 } },
    xAxis: {
      type: 'value',
      nameTextStyle: { color: '#A19080', fontSize: 11, fontWeight: 600 },
      min: 0,
      max: axisMaxRate,
      interval: axisMaxRate / 5,
      axisLabel: { formatter: value => `${fmt(value)}%`, color: '#A19080', fontSize: 11, margin: 6, showMinLabel: true, showMaxLabel: true },
      axisLine: { lineStyle: { color: '#D7DEE8' } },
      axisTick: { show: true, lineStyle: { color: '#D7DEE8' } },
      splitLine: { lineStyle: { color: '#EEF2F7', type: 'dashed' } }
    },
    yAxis: {
      type: 'value',
      nameTextStyle: { color: '#A19080', fontSize: 11, fontWeight: 600 },
      min: 0,
      max: axisMaxLeads,
      interval: axisMaxLeads / 5,
      axisLabel: { formatter: value => fmt(value), color: '#A19080', fontSize: 11, margin: 6, showMinLabel: true, showMaxLabel: true },
      axisLine: { lineStyle: { color: '#D7DEE8' } },
      axisTick: { show: true, lineStyle: { color: '#D7DEE8' } },
      splitLine: { lineStyle: { color: '#EEF2F7', type: 'dashed' } }
    },
    seriesName: '成交人数',
    data: source.map(row => {
      const deals = Number(row.deals) || 0;
      const bubbleSize = operationsBubbleSize(deals, maxDeals, { min: 16, max: 36 });
      const bubbleColor = operationsChannelQualityColor(row);
      return {
        name: row.source,
        raw: row,
        value: [Number(row.dealConversionRate) || 0, Number(row.leads) || 0, deals],
        symbolSize: bubbleSize,
        itemStyle: {
          color: bubbleColor,
          opacity: 0.86,
          borderColor: '#FFFFFF',
          borderWidth: 2,
          shadowBlur: 14,
          shadowColor: `${bubbleColor}33`
        }
      };
    }),
    symbolSize: value => {
      const deals = Number(value?.[2]) || 0;
      return operationsBubbleSize(deals, maxDeals, { min: 16, max: 36 });
    },
    label: {
      show: true,
      position: 'right',
      formatter: item => item.name,
      color: '#172033',
      fontSize: 10,
      fontWeight: 700
    },
    markLine: {
      silent: true,
      symbol: 'none',
      lineStyle: { color: '#CBD5E1', type: 'dashed', width: 1 },
      label: { color: '#64748B', fontSize: 11 },
      data: [
        { name: '平均转化', xAxis: avgRate, label: { formatter: '平均转化', position: 'insideEndTop' } },
        { name: '平均线索', yAxis: avgLeads, label: { formatter: '平均线索', position: 'insideEndTop' } }
      ]
    }
  });
}

const operationsCourtBandColors = ['#E05252', '#D89135', '#3B6EA8', '#2E8B6D', '#14B8A6'];
const operationsCoachBandColors = ['#E05252', '#D89135', '#8EA0B8', '#5CC8A0', '#1F8A5B'];
const operationsCourtBandFills = ['#FFF1F2', '#FFFBEB', '#EFF6FF', '#ECFDF5', '#F0FDFA'];
const operationsCoachBandFills = ['#FFF1F2', '#FFFBEB', '#F3F6FA', '#ECFDF5', '#E5F7EE'];

function operationsCourtQuadrantColor(row = {}, axis = {}) {
  if (!row.hasData) return '#CBD5E1';
  return operationsAxisBandColor(row.utilizationRate, axis, operationsCourtBandColors);
}

function operationsCourtQuadrantTooltip(item = {}) {
  const row = item.data?.raw || {};
  return `<div style="min-width:176px;font-size:12px;line-height:1.7;color:#172033">
    <div style="font-weight:700;margin-bottom:4px">${esc(row.campusName || item.name || '-')}</div>
    <div>订场收入：¥${fmt(row.bookingAmount || 0)}</div>
    <div>场次利用率：${fmt(row.utilizationRate || 0)}%</div>
    <div>订场次数：${fmt(row.bookingCount || 0)}</div>
    <div>圆点大小：订场次数</div>
    <div>体验转化：${fmt(row.trialConversionRate || 0)}%</div>
    <div>老客转化：${fmt(row.repeatCustomerConversionRate || 0)}%</div>
  </div>`;
}

function operationsCourtBubbleLabelSize(name = '', bubbleSize = 18) {
  const length = String(name || '').length;
  if (bubbleSize < 28 || length > 5) return 8;
  if (bubbleSize < 38 || length > 4) return 9;
  return 10;
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
  const maxBookingCount = Math.max(1, ...source.map(row => row.bookingCount));
  const utilizationAxis = operationsPercentAxisRange(source.map(row => row.utilizationRate), { defaultMax: 50, max: 100 });
  const revenueAxis = operationsMoneyAxisRange(source.map(row => row.bookingAmount));
  const utilizationLabel = value => `${fmt(value)}%`;
  const revenueLabel = value => `${fmt(value / 10000)}万`;
  const data = source.map(row => {
    const bubbleSize = operationsBubbleSize(row.bookingCount, maxBookingCount, { min: 16, max: 36 });
    const bubbleColor = operationsCourtQuadrantColor(row, utilizationAxis);
    return {
      name: row.campusName,
      raw: row,
      value: [row.utilizationRate, row.bookingAmount, row.bookingCount, row.trialConversionRate],
      symbolSize: bubbleSize,
      itemStyle: {
        color: bubbleColor,
        opacity: 0.82,
        borderColor: '#FFFFFF',
        borderWidth: 2,
        shadowBlur: 14,
        shadowColor: `${bubbleColor}33`
      },
      label: { color: '#FFFFFF', fontSize: operationsCourtBubbleLabelSize(row.campusName, bubbleSize) }
    };
  });
  return buildStandardBusinessBubbleMatrixChartOption({
    color: operationsCourtBandColors,
    grid: operationsMatrixGrid({
      xLabels: operationsAxisTickLabels(utilizationAxis, utilizationLabel),
      yLabels: operationsAxisTickLabels(revenueAxis, revenueLabel)
    }),
    tooltip: { trigger: 'item', formatter: operationsCourtQuadrantTooltip, textStyle: { fontSize: 12, fontWeight: 400 } },
    xAxis: {
      type: 'value',
      nameTextStyle: { color: '#A19080', fontSize: 11, fontWeight: 600 },
      min: 0,
      max: utilizationAxis.max,
      interval: utilizationAxis.interval,
      axisLabel: { formatter: utilizationLabel, color: '#A19080', fontSize: 11, margin: 6, showMinLabel: true, showMaxLabel: true },
      axisLine: { lineStyle: { color: '#E2E8F0' } },
      axisTick: { show: false },
      splitLine: { lineStyle: { color: '#EEF2F7', type: 'dashed' } }
    },
    yAxis: {
      type: 'value',
      nameTextStyle: { color: '#A19080', fontSize: 11, fontWeight: 600 },
      min: 0,
      max: revenueAxis.max,
      interval: revenueAxis.interval,
      axisLabel: { formatter: revenueLabel, color: '#A19080', fontSize: 11, margin: 6, showMinLabel: true, showMaxLabel: true },
      axisLine: { lineStyle: { color: '#E2E8F0' } },
      axisTick: { show: false },
      splitLine: { lineStyle: { color: '#EEF2F7', type: 'dashed' } }
    },
    seriesName: '校区经营位置',
    data,
    symbolSize: item => {
      const bookingCount = Number(item?.[2]) || 0;
      return operationsBubbleSize(bookingCount, maxBookingCount, { min: 16, max: 36 });
    },
    label: {
      show: true,
      position: 'inside',
      formatter: item => item.name,
      fontSize: 10,
      fontWeight: 600
    },
    markLine: {
      silent: true,
      symbol: 'none',
      lineStyle: { color: '#CBD5E1', type: 'dashed', width: 1 },
      label: { color: '#A19080', fontSize: 11 },
      data: [
        { name: '平均利用率', xAxis: avgUtilization, label: { formatter: '平均利用率', position: 'insideEndTop' } },
        { name: '平均收入', yAxis: avgRevenue, label: { formatter: '平均收入', position: 'insideEndTop' } }
      ]
    },
    markArea: {
      silent: true,
      itemStyle: { opacity: 0.42 },
      label: { show: false },
      data: operationsAxisBandMarkAreas(utilizationAxis, operationsCourtBandFills)
    }
  });
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

function buildOperationsOverviewCashChartOption({ totalIncome = 0, recognizedRevenue = 0, pendingRevenue = 0 } = {}) {
  const total = Number(totalIncome) || 0;
  const recognized = Number(recognizedRevenue) || 0;
  const pending = Number(pendingRevenue) || Math.max(0, total - recognized);
  if (!(total || recognized || pending)) return { series: [] };
  return {
    color: ['#2F7D67', '#C58A3A'],
    tooltip: {
      trigger: 'axis',
      axisPointer: { type: 'shadow' },
      formatter: params => {
        const rows = Array.isArray(params) ? params : [params];
        return `<div style="min-width:148px;font-size:12px;line-height:1.75;color:#172033">
          ${rows.map(item => `<div>${item.marker || ''}${esc(item.seriesName || '')}：¥${fmt(item.value || 0)}</div>`).join('')}
        </div>`;
      },
      textStyle: { fontSize: 12, fontWeight: 400 }
    },
    legend: { bottom: 0, left: 'center', itemWidth: 18, itemHeight: 10, textStyle: { color: '#6E625A', fontSize: 11 } },
    grid: { left: 12, right: 12, top: 28, bottom: 42, containLabel: true },
    xAxis: { type: 'value', axisLabel: { formatter: value => `¥${fmt(value / 10000)}万`, color: '#A19080', fontSize: 11 }, splitLine: { lineStyle: { color: '#EEF2F7' } } },
    yAxis: { type: 'category', data: ['经营收入'], axisTick: { show: false }, axisLabel: { color: '#A19080', fontSize: 11, fontWeight: 400 } },
    series: [
      { name: '已入账', type: 'bar', stack: 'income', data: [recognized], barWidth: 34, itemStyle: { color: '#2F7D67', borderRadius: [6, 0, 0, 6] }, emphasis: { focus: 'series' } },
      { name: '未入账/待履约', type: 'bar', stack: 'income', data: [pending], barWidth: 34, itemStyle: { color: '#C58A3A', borderRadius: [0, 6, 6, 0] }, emphasis: { focus: 'series' } }
    ]
  };
}

function buildStandardFunnelChartOption({ rows = [], nameKey = 'stage', valueKey = 'count', name = '' } = {}) {
  const data = (rows || []).map(row => ({ name: row[nameKey], value: Number(row[valueKey]) || 0 })).filter(row => row.name);
  if (!data.length) return { series: [] };
  return {
    tooltip: { trigger: 'item', formatter: item => `${esc(item.name || '')}<br/>${fmt(item.data?.count ?? item.value)}人` },
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

function operationsCoachBandColor(value, axis = {}) {
  return operationsAxisBandColor(value, axis, operationsCoachBandColors);
}

function operationsCoachShortName(value) {
  return String(value || '').trim().replace(/教练$/, '');
}

function operationsCoachRevenueAxisLabel(value) {
  const amount = Number(value) || 0;
  return `¥${fmt(amount / 10000)}万`;
}

function operationsCoachCourseColor(type = '') {
  if (type === '体验课') return '#F59E0B';
  if (type === '私教课') return '#4F81FF';
  if (type === '小班课') return '#10B981';
  return '#8EA0B8';
}

function operationsCoachCapabilityColor(row = {}) {
  const trial = Number(row.trialConversionRate) || 0;
  const renewal = Number(row.renewalRate) || 0;
  if (trial >= 30 && renewal >= 50) return { label: '双高', color: '#2E8B6D' };
  if (trial >= 30) return { label: '转化高续费低', color: '#D89135' };
  if (renewal >= 50) return { label: '转化低续费高', color: '#3B6EA8' };
  return { label: '双低', color: '#E05252' };
}

function operationsCoachMatrixSymbolSize(value = [], maxLessons = 1) {
  const lessons = Number(value?.[2]) || 0;
  return operationsBubbleSize(lessons, maxLessons, { min: 14, max: 33 });
}

function operationsCoachCapabilitySymbolSize(value = [], maxSample = 1) {
  const sample = Number(value?.[2]) || 0;
  return operationsBubbleSize(sample, maxSample, { min: 14, max: 33 });
}

function operationsCoachBubbleLabel(item = {}) {
  const symbolSize = Number(item.data?.symbolSize || item.data?.bubbleSize || 0);
  if (symbolSize < 22) return { text: '', fontSize: 0 };
  if (symbolSize < 30) return { text: operationsCoachShortName(item.name), fontSize: 8 };
  if (symbolSize < 40) return { text: operationsCoachShortName(item.name), fontSize: 9 };
  return { text: operationsCoachShortName(item.name), fontSize: 10 };
}

function buildOperationsCoachMatrixChartOption({ rows = [] } = {}) {
  const source = (rows || []).filter(row => row && row.coach);
  if (!source.length) return { series: [] };
  const maxLessons = Math.max(1, ...source.map(row => Number(row.lessonCount) || 0));
  const avgUtilization = source.reduce((sum, row) => sum + (Number(row.utilizationRate) || 0), 0) / source.length;
  const avgRevenue = source.reduce((sum, row) => sum + (Number(row.revenue) || 0), 0) / source.length;
  const utilizationAxis = operationsPercentAxisRange(source.map(row => row.utilizationRate), { defaultMax: 75, max: 100 });
  const revenueAxis = operationsMoneyAxisRange(source.map(row => row.revenue), { defaultMax: 500000 });
  const utilizationLabel = value => `${fmt(value)}%`;
  const revenueLabel = value => operationsCoachRevenueAxisLabel(value);
  return buildStandardBusinessBubbleMatrixChartOption({
    grid: operationsMatrixGrid({
      xLabels: operationsAxisTickLabels(utilizationAxis, utilizationLabel),
      yLabels: operationsAxisTickLabels(revenueAxis, revenueLabel)
    }),
    tooltip: {
      trigger: 'item',
      formatter: item => {
        const row = item.data?.raw || {};
        return `<div style="min-width:190px;font-size:12px;line-height:1.75;color:#172033">
          <div style="font-weight:700;margin-bottom:4px">${esc(row.coach || item.name || '-')}</div>
          <div>工时利用率：${fmt(row.utilizationRate || 0)}%</div>
          <div>可排/已排：${fmt(row.availableHours || 0)} / ${fmt(row.usedHours || 0)} 小时</div>
          <div>归属课程实收：¥${fmt(row.revenue || 0)}</div>
          <div>圆点大小：当前筛选课数 ${fmt(row.lessonCount || 0)} 节</div>
        </div>`;
      },
      textStyle: { fontSize: 12, fontWeight: 400 }
    },
    xAxis: {
      type: 'value',
      nameTextStyle: { color: '#A19080', fontSize: 11, fontWeight: 600 },
      min: 0,
      max: utilizationAxis.max,
      interval: utilizationAxis.interval,
      axisLabel: { formatter: utilizationLabel, color: '#A19080', fontSize: 11, margin: 6, showMinLabel: true, showMaxLabel: true },
      axisLine: { lineStyle: { color: '#D7DEE8' } },
      axisTick: { show: true, lineStyle: { color: '#D7DEE8' } },
      splitLine: { lineStyle: { color: '#EEF2F7', type: 'dashed' } }
    },
    yAxis: {
      type: 'value',
      nameTextStyle: { color: '#A19080', fontSize: 11, fontWeight: 600 },
      min: 0,
      max: revenueAxis.max,
      interval: revenueAxis.interval,
      axisLabel: { formatter: revenueLabel, color: '#A19080', fontSize: 11, margin: 6, verticalAlign: 'top', showMinLabel: true, showMaxLabel: true },
      axisLine: { lineStyle: { color: '#D7DEE8' } },
      axisTick: { show: false },
      splitLine: { lineStyle: { color: '#EEF2F7', type: 'dashed' } }
    },
    seriesName: '教练经营位置',
    data: source.map(row => {
      const value = [Number(row.utilizationRate) || 0, Number(row.revenue) || 0, Number(row.lessonCount) || 0];
      const bubbleSize = operationsCoachMatrixSymbolSize(value, maxLessons);
      const bubbleLabel = operationsCoachBubbleLabel({ name: row.coach, data: { symbolSize: bubbleSize } });
      return {
        name: row.coach,
        raw: row,
        value,
        symbolSize: bubbleSize,
        label: { show: !!bubbleLabel.text, fontSize: bubbleLabel.fontSize },
        itemStyle: {
          color: operationsCoachBandColor(row.utilizationRate, utilizationAxis),
          opacity: 0.86,
          borderColor: '#FFFFFF',
          borderWidth: 2,
          shadowBlur: 14,
          shadowColor: 'rgba(128,84,53,.18)'
        }
      };
    }),
    symbolSize: value => operationsCoachMatrixSymbolSize(value, maxLessons),
    label: {
      show: true,
      position: 'inside',
      formatter: item => operationsCoachBubbleLabel(item).text,
      color: '#FFFFFF',
      fontSize: 10,
      fontWeight: 700
    },
    markLine: {
      silent: true,
      symbol: 'none',
      lineStyle: { color: '#CBD5E1', type: 'dashed', width: 1 },
      label: { color: '#64748B', fontSize: 11 },
      data: [
        { name: '平均利用率', xAxis: avgUtilization, label: { formatter: '平均利用率', position: 'insideEndTop' } },
        { name: '平均产值', yAxis: avgRevenue, label: { formatter: '平均产值', position: 'insideEndTop' } }
      ]
    },
    markArea: {
      silent: true,
      itemStyle: { opacity: 0.42 },
      label: { show: false },
      data: operationsAxisBandMarkAreas(utilizationAxis, operationsCoachBandFills)
    }
  });
}

function buildOperationsCoachParetoChartOption({ rows = [] } = {}) {
  const source = (rows || [])
    .filter(row => row && row.coach && ((Number(row.revenue) || 0) > 0 || (Number(row.revenueShare) || 0) > 0))
    .slice(0, 10);
  if (!source.length) return { series: [] };
  return {
    ...standardChartBaseOption(),
    color: ['#8B5E3C', '#3B6EA8'],
    tooltip: {
      trigger: 'axis',
      formatter: params => {
        const rows = Array.isArray(params) ? params : [params];
        const name = esc(rows[0]?.axisValue || '');
        const revenue = rows.find(item => item.seriesName === '归属实收')?.value || 0;
        const share = rows.find(item => item.seriesName === '归属实收占比')?.value || 0;
        return `<div style="min-width:160px;font-size:12px;line-height:1.75;color:#172033">
          <div style="font-weight:700;margin-bottom:4px">${operationsCoachShortName(name)}</div>
          <div>归属实收：¥${fmt(revenue)}</div>
          <div>归属实收占比：${fmt(share)}%</div>
        </div>`;
      },
      textStyle: { fontSize: 12, fontWeight: 400 }
    },
    legend: { show: false },
    grid: { left: 44, right: 44, top: 12, bottom: 38, containLabel: false },
    xAxis: { type: 'category', data: source.map(row => operationsCoachShortName(row.coach)), axisTick: { show: false }, axisLabel: { color: '#A19080', fontSize: 10, interval: 0, rotate: 28, margin: 8 } },
    yAxis: [
      { type: 'value', axisLabel: { formatter: value => `¥${fmt(value / 10000)}万`, color: '#A19080', fontSize: 11 }, splitLine: { lineStyle: { color: '#EEF2F7' } } },
      { type: 'value', min: 0, max: 100, axisLabel: { formatter: '{value}%', color: '#A19080', fontSize: 11 }, splitLine: { show: false } }
    ],
    series: [
      { name: '归属实收', type: 'bar', data: source.map(row => row.revenue), barMaxWidth: 30, itemStyle: { color: '#8B5E3C', borderRadius: [6, 6, 0, 0] }, emphasis: { focus: 'series' } },
      { name: '归属实收占比', type: 'line', yAxisIndex: 1, data: source.map(row => row.revenueShare), smooth: true, symbolSize: 7, lineStyle: { width: 3, color: '#3B6EA8' }, itemStyle: { color: '#3B6EA8' }, emphasis: { focus: 'series' } }
    ]
  };
}

function buildOperationsCoachUtilizationBandsChartOption({ rows = [] } = {}) {
  const source = (rows || []).filter(row => row && row.band);
  if (!source.length) return { series: [] };
  const total = source.reduce((sum, row) => sum + (Number(row.count) || 0), 0);
  const maxCount = Math.max(1, ...source.map(row => Number(row.count) || 0));
  const axisMax = Math.max(3, Math.ceil(maxCount / 3) * 3);
  const chartRows = source.map(row => {
    const count = Number(row.count) || 0;
    return {
      ...row,
      count,
      share: total ? Math.round((count * 100 / total) * 10) / 10 : 0
    };
  });
  return {
    tooltip: {
      trigger: 'axis',
      axisPointer: { type: 'shadow' },
      formatter: params => {
        const item = Array.isArray(params) ? params[0] : params;
        return `${esc(item.name || '')}<br/>${fmt(item.data?.count || 0)}人，占比 ${fmt(item.data?.share || 0)}%`;
      },
      textStyle: { fontSize: 12, fontWeight: 400 }
    },
    grid: { left: 96, right: 64, top: 18, bottom: 30, containLabel: false },
    xAxis: {
      type: 'value',
      min: 0,
      max: axisMax,
      interval: Math.max(1, axisMax / 7),
      position: 'bottom',
      axisLabel: { formatter: '{value}人', color: '#A19080', fontSize: 11, fontWeight: 400 },
      axisLine: { show: false },
      axisTick: { show: false },
      splitLine: { show: true, lineStyle: { color: '#E9EEF6', width: 1 } }
    },
    yAxis: {
      type: 'category',
      data: source.map(row => `${row.band} ${row.label}`),
      axisTick: { show: false },
      axisLine: { show: true, lineStyle: { color: '#5F6673', width: 1.3 } },
      axisLabel: { color: '#A19080', fontSize: 11, fontWeight: 400, margin: 12 },
      splitLine: { show: false }
    },
    series: [{
      name: '教练数',
      type: 'bar',
      barWidth: 18,
      showBackground: false,
      data: chartRows.map((row, index) => ({
        value: row.count,
        count: row.count,
        share: row.share,
        itemStyle: { color: row.color || operationsCoachBandColor(Number(String(row.band || '').split('%')[0]) || 0), borderRadius: [0, 6, 6, 0] }
      })),
      label: {
        show: true,
        position: 'right',
        formatter: item => `${fmt(item.data?.count || 0)}人  ${fmt(item.data?.share || 0)}%`,
        color: '#5F5148',
        fontSize: 12,
        fontWeight: 700
      },
      emphasis: { focus: 'series' }
    }]
  };
}

function buildOperationsCoachCourseMixChartOption({ rows = [] } = {}) {
  const source = (rows || []).filter(row => row && row.coach);
  if (!source.length) return { series: [] };
  const displayRows = source
    .map(row => ({
      ...row,
      totalHours: (Number(row.trialHours) || 0) + (Number(row.privateHours) || 0) + (Number(row.smallGroupHours) || 0)
    }))
    .sort((a, b) => b.totalHours - a.totalHours || a.coach.localeCompare(b.coach, 'zh-Hans-CN'))
    .slice(0, 10);
  return {
    color: [operationsCoachCourseColor('体验课'), operationsCoachCourseColor('私教课'), operationsCoachCourseColor('小班课')],
    tooltip: { trigger: 'axis', axisPointer: { type: 'shadow' }, textStyle: { fontSize: 12, fontWeight: 400 } },
    legend: { show: false },
    grid: { left: 72, right: 14, top: 10, bottom: 20, containLabel: false },
    xAxis: { type: 'value', axisLabel: { formatter: '{value}h', color: '#A19080', fontSize: 11 }, splitLine: { lineStyle: { color: '#EEF2F7' } } },
    yAxis: { type: 'category', data: displayRows.map(row => operationsCoachShortName(row.coach)), axisTick: { show: false }, axisLabel: { color: '#A19080', fontSize: 11, margin: 10 } },
    series: [
      { name: '体验课', type: 'bar', stack: 'hours', data: displayRows.map(row => row.trialHours), itemStyle: { color: operationsCoachCourseColor('体验课') }, emphasis: { focus: 'series' } },
      { name: '私教课', type: 'bar', stack: 'hours', data: displayRows.map(row => row.privateHours), itemStyle: { color: operationsCoachCourseColor('私教课') }, emphasis: { focus: 'series' } },
      { name: '小班课', type: 'bar', stack: 'hours', data: displayRows.map(row => row.smallGroupHours), itemStyle: { color: operationsCoachCourseColor('小班课') }, emphasis: { focus: 'series' } }
    ]
  };
}

function buildOperationsCoachCapabilityChartOption({ rows = [] } = {}) {
  const source = (rows || []).filter(row => row && row.coach);
  if (!source.length) return { series: [] };
  const hasRenewalBase = source.some(row => (Number(row.oldCustomerBase) || 0) > 0);
  if (!hasRenewalBase) return { series: [] };
  const maxSample = Math.max(1, ...source.map(row => (Number(row.trialBase) || 0) + (Number(row.oldCustomerBase) || 0)));
  const percentAxis = { max: 100, interval: 20 };
  const percentLabel = value => `${fmt(value)}%`;
  return buildStandardQuadrantBubbleMatrixChartOption({
    grid: operationsMatrixGrid({
      xLabels: operationsAxisTickLabels(percentAxis, percentLabel),
      yLabels: operationsAxisTickLabels(percentAxis, percentLabel)
    }),
    tooltip: {
      trigger: 'item',
      formatter: item => {
        const row = item.data?.raw || {};
        const trialBase = Number(row.trialBase) || 0;
        const oldCustomerBase = Number(row.oldCustomerBase) || 0;
        const sample = trialBase + oldCustomerBase;
        return `<div style="min-width:160px;font-size:12px;line-height:1.75;color:#172033">
          <div style="font-weight:700;margin-bottom:4px">${esc(operationsCoachShortName(row.coach || '-'))}</div>
          <div>体验课转化率：${fmt(row.trialConversionRate || 0)}%</div>
          <div>老客续费率：${fmt(row.renewalRate || 0)}%</div>
          <div>样本量：体验课 ${fmt(trialBase)} 人 / 老客 ${fmt(oldCustomerBase)} 人 / 合计 ${fmt(sample)} 人</div>
          ${sample > 0 && sample < 10 ? '<div style="color:#A16207">样本较小，仅作参考</div>' : ''}
        </div>`;
      }
    },
    xAxis: { type: 'value', nameTextStyle: { color: '#A19080', fontSize: 11, fontWeight: 600 }, min: 0, max: 100, interval: 20, axisLabel: { formatter: percentLabel, color: '#A19080', fontSize: 11, margin: 6, showMinLabel: true, showMaxLabel: true }, axisLine: { lineStyle: { color: '#D7DEE8' } }, axisTick: { show: true, lineStyle: { color: '#D7DEE8' } }, splitLine: { lineStyle: { color: '#EEF2F7', type: 'dashed' } } },
    yAxis: { type: 'value', nameTextStyle: { color: '#A19080', fontSize: 11, fontWeight: 600 }, min: 0, max: 100, interval: 20, axisLabel: { formatter: percentLabel, color: '#A19080', fontSize: 11, margin: 6, verticalAlign: 'top', showMinLabel: true, showMaxLabel: true }, axisLine: { lineStyle: { color: '#D7DEE8' } }, axisTick: { show: false }, splitLine: { lineStyle: { color: '#EEF2F7', type: 'dashed' } } },
    seriesName: '转化续费能力',
    data: source.map(row => {
      const ability = operationsCoachCapabilityColor(row);
      const sample = (Number(row.trialBase) || 0) + (Number(row.oldCustomerBase) || 0);
      const value = [Number(row.trialConversionRate) || 0, Number(row.renewalRate) || 0, sample];
      const bubbleSize = operationsCoachCapabilitySymbolSize(value, maxSample);
      const bubbleLabel = operationsCoachBubbleLabel({ name: row.coach, data: { symbolSize: bubbleSize } });
      return {
        name: row.coach,
        raw: { ...row, abilityLabel: ability.label },
        value,
        symbolSize: bubbleSize,
        label: { show: !!bubbleLabel.text, fontSize: bubbleLabel.fontSize },
        itemStyle: { color: ability.color, opacity: 0.84, borderColor: '#fff', borderWidth: 2, shadowBlur: 12, shadowColor: `${ability.color}2E` }
      };
    }),
    symbolSize: value => operationsCoachCapabilitySymbolSize(value, maxSample),
    label: {
      show: true,
      position: 'inside',
      formatter: item => operationsCoachBubbleLabel(item).text,
      color: '#FFFFFF',
      fontSize: 10,
      fontWeight: 700
    },
    markLine: {
      silent: true,
      symbol: 'none',
      lineStyle: { color: '#CBD5E1', type: 'dashed', width: 1 },
      label: { color: '#64748B', fontSize: 11 },
      data: [
        { name: '转化均线', xAxis: 50, label: { formatter: '转化 50%', position: 'insideEndTop' } },
        { name: '续费均线', yAxis: 50, label: { formatter: '续费 50%', position: 'insideEndTop' } }
      ]
    },
    markArea: {
      silent: true,
      itemStyle: { opacity: 0.42 },
      label: { show: false },
      data: [
        [{ name: '双低', xAxis: 0, yAxis: 0, itemStyle: { color: '#FFF1F2' } }, { xAxis: 50, yAxis: 50 }],
        [{ name: '转化高续费低', xAxis: 50, yAxis: 0, itemStyle: { color: '#FFFBEB' } }, { xAxis: 100, yAxis: 50 }],
        [{ name: '转化低续费高', xAxis: 0, yAxis: 50, itemStyle: { color: '#EFF6FF' } }, { xAxis: 50, yAxis: 100 }],
        [{ name: '双高', xAxis: 50, yAxis: 50, itemStyle: { color: '#ECFDF5' } }, { xAxis: 100, yAxis: 100 }]
      ]
    }
  });
}

window.addEventListener('resize', () => {
  standardChartInstances.forEach(chart => chart.resize());
});
