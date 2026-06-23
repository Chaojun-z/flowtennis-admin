const assert = require('assert');
const fs = require('fs');
const path = require('path');
const vm = require('vm');

const repoRoot = path.join(__dirname, '..');
const chartsSource = fs.readFileSync(path.join(repoRoot, 'public/assets/scripts/standard/charts.js'), 'utf8');

const context = {
  console,
  window: { addEventListener() {} },
  esc(value) {
    return String(value ?? '');
  },
  fmt(value) {
    return String(value ?? 0);
  }
};

vm.createContext(context);
vm.runInContext(chartsSource, context, { filename: 'charts.js' });

function nonZeroTickCount(axis) {
  return Math.round((Number(axis.max) || 0) / (Number(axis.interval) || 1));
}

const coachOption = context.buildOperationsCoachCapabilityChartOption({
  rows: [
    { coach: 'Big', trialConversionRate: 0, trialBase: 100, trialConverted: 0, renewalRate: 0, oldCustomerBase: 100, renewalCount: 0 },
    { coach: 'Small', trialConversionRate: 10, trialBase: 1, trialConverted: 0, renewalRate: 10, oldCustomerBase: 1, renewalCount: 0 }
  ]
});
const coachSeries = coachOption.series[0];
const bigPoint = coachSeries.data.find(row => row.name === 'Big');
const smallPoint = coachSeries.data.find(row => row.name === 'Small');

assert.ok(bigPoint.symbolSize > smallPoint.symbolSize, 'larger samples should still produce larger bubbles');
assert.ok(bigPoint.symbolSize <= 34, 'coach capability bubbles should cap large samples to avoid blocking nearby points');
assert.ok(smallPoint.symbolSize >= 12, 'small samples should remain tappable');
assert.ok(bigPoint.symbolSize - smallPoint.symbolSize < 18, 'bubble size should use area-style sqrt scaling instead of exaggerated linear diameter scaling');
assert.strictEqual(coachSeries.data[0].name, 'Big', 'large bubbles should be drawn first so smaller bubbles stay clickable above them');
assert.strictEqual(coachSeries.data[1].name, 'Small', 'small bubbles should be drawn after large bubbles');
assert.strictEqual(coachSeries.emphasis.scale, false, 'bubble hover should not enlarge points and block nearby small bubbles');
assert.strictEqual(nonZeroTickCount(coachOption.xAxis), 5, 'coach capability x axis should show five non-zero ticks');
assert.strictEqual(nonZeroTickCount(coachOption.yAxis), 5, 'coach capability y axis should show five non-zero ticks');
assert.match(
  coachOption.tooltip.formatter({ data: bigPoint, name: bigPoint.name }),
  /样本量：体验课 100 人 \/ 老客 100 人 \/ 合计 200 人/,
  'coach capability tooltip should explain the sample size behind bubble area'
);

const courtOption = context.buildOperationsCourtQuadrantChartOption({
  rows: [
    { campusName: '顺义马坡', bookingAmount: 295302, utilizationRate: 9, bookingCount: 352 }
  ]
});

assert.ok(courtOption.grid.right >= 12, 'court matrix should reserve room for the rightmost tick label');
assert.ok(courtOption.grid.left >= 32, 'court matrix should reserve room for y-axis tick labels');
assert.ok(courtOption.grid.bottom <= 32, 'court matrix should not waste a large bottom gutter inside the canvas');
assert.ok(!courtOption.yAxis.name, 'court matrix should not reserve space for a vertical y-axis title');
assert.ok(!courtOption.xAxis.name, 'court matrix should not reserve space for a bottom x-axis title');
assert.strictEqual(courtOption.yAxis.max, 400000, 'court revenue axis should fit the current data instead of staying fixed at 100万');
assert.strictEqual(nonZeroTickCount(courtOption.yAxis), 5, 'court revenue axis should show five non-zero ticks');
assert.strictEqual(courtOption.xAxis.max, 50, 'court utilization axis should default to 0-50% for stable comparison');
assert.strictEqual(nonZeroTickCount(courtOption.xAxis), 5, 'court utilization axis should show five non-zero ticks');

const coachMatrixOption = context.buildOperationsCoachMatrixChartOption({
  rows: [
    { coach: 'Siren教练', utilizationRate: 30, revenue: 466200, lessonCount: 48, availableHours: 100, usedHours: 30 },
    { coach: '朝珺教练', utilizationRate: 14, revenue: 150000, lessonCount: 20, availableHours: 100, usedHours: 14 }
  ]
});

assert.strictEqual(coachMatrixOption.yAxis.max, 500000, 'coach revenue axis should fit current revenue instead of staying fixed at 100万');
assert.strictEqual(nonZeroTickCount(coachMatrixOption.yAxis), 5, 'coach revenue axis should show five non-zero ticks');
assert.strictEqual(coachMatrixOption.xAxis.max, 75, 'coach utilization axis should default to 0-75% for stable comparison');
assert.strictEqual(nonZeroTickCount(coachMatrixOption.xAxis), 5, 'coach utilization axis should show five non-zero ticks');
assert.ok(coachMatrixOption.grid.left >= 32, 'coach matrix should reserve room for y-axis tick labels');
assert.ok(!coachMatrixOption.yAxis.name, 'coach matrix should not reserve space for a vertical y-axis title');
assert.ok(!coachMatrixOption.xAxis.name, 'coach matrix should not reserve space for a bottom x-axis title');

const channelOption = context.buildOperationsChannelQualityChartOption({
  rows: [
    { source: 'BigSource', leads: 100, trialCount: 20, deals: 100, trialConversionRate: 20, dealConversionRate: 10, statusLabel: '正常' },
    { source: 'SmallSource', leads: 5, trialCount: 1, deals: 1, trialConversionRate: 20, dealConversionRate: 20, statusLabel: '正常' }
  ]
});
const channelSeries = channelOption.series[0];
const channelBig = channelSeries.data.find(row => row.name === 'BigSource');
const channelSmall = channelSeries.data.find(row => row.name === 'SmallSource');

assert.ok(channelBig.symbolSize <= 36, 'channel bubbles should cap large deal counts to avoid crowding');
assert.ok(channelBig.symbolSize - channelSmall.symbolSize < 20, 'channel bubble diameter should not scale linearly with deal count');
assert.strictEqual(channelSeries.data[0].name, 'BigSource', 'channel large bubbles should be drawn first');
assert.match(
  channelOption.tooltip.formatter({ data: channelBig, name: channelBig.name }),
  /圆点大小：成交人数/,
  'channel tooltip should say what bubble size represents'
);

console.log('operations bubble chart tests passed');
