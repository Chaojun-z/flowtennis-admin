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
assert.match(
  coachOption.tooltip.formatter({ data: bigPoint, name: bigPoint.name }),
  /样本量：体验课 100 人 \/ 老客 100 人 \/ 合计 200 人/,
  'coach capability tooltip should explain the sample size behind bubble area'
);

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
