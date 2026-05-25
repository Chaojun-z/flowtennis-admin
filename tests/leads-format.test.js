const assert = require('assert');
const fs = require('fs');
const path = require('path');
const vm = require('vm');

const source = fs.readFileSync(path.join(__dirname, '../public/assets/scripts/pages/leads.js'), 'utf8');
const context = {
  console,
  purchases: [],
  daysAgoText(date) {
    if (date === '2026-05-08') return '2026-05-08 · 16天前';
    if (date === '2026-03-18') return '2026-03-18 · 67天前';
    return `${date} · 0天前`;
  },
  today() {
    return '2026-05-25';
  }
};
vm.createContext(context);
vm.runInContext(source, context);

assert.strictEqual(
  context.leadTrialDateText({ trialAtRaw: '5.8 11-12', leadDate: '2026-05-05' }),
  '2026-05-08 11:00-12:00 16天前'
);
assert.strictEqual(
  context.leadTrialDateText({ trialAtRaw: '3.18 19-2', leadDate: '2026-03-16' }),
  '2026-03-18 19:00-02:00 67天前'
);
assert.strictEqual(
  context.leadFormalSignupDateText({ enrollAtRaw: '3.27', leadDate: '2026-03-16' }),
  '2026-03-27'
);

context.purchases = [
  { id: 'pur-2', studentId: 'stu-1', purchaseDate: '2026-05-12', status: 'active' },
  { id: 'pur-1', studentId: 'stu-1', purchaseDate: '2026-05-10', status: 'active' }
];
assert.strictEqual(
  context.leadFormalSignupDateText({ studentId: 'stu-1', rawStatus: '已报名-私教' }),
  '2026-05-10'
);

assert.deepStrictEqual(
  JSON.parse(JSON.stringify(context.leadStatsData([
    { rawStatus: '体验课完成' },
    { trialAtRaw: '2026-05-20 10:00-11:00', studentId: 'stu-1' },
    { trialAtRaw: '2026-06-01 10:00-11:00' },
    { trialAtRaw: '2026-05-10 10:00-11:00', convertedFlag: true },
    { courtId: 'court-1' }
  ]))),
  {
    total: 5,
    trialDone: 3,
    trialCompletionRate: '60%',
    trialConverted: 2,
    trialConversionRate: '66.7%',
    converted: 3,
    leadConversionRate: '60%',
    trialPendingConversion: 1
  }
);

assert.deepStrictEqual(
  JSON.parse(JSON.stringify(context.leadDateRangeForPreset('week'))),
  { start: '2026-05-25', end: '2026-05-31' }
);
assert.deepStrictEqual(
  JSON.parse(JSON.stringify(context.leadDateRangeForPreset('month'))),
  { start: '2026-05-01', end: '2026-05-31' }
);
assert.strictEqual(
  context.leadInDateRange({ leadDate: '2026-05-26' }, { start: '2026-05-25', end: '2026-05-31' }),
  true
);
assert.strictEqual(
  context.leadInDateRange({ leadDate: '2026-06-01' }, { start: '2026-05-25', end: '2026-05-31' }),
  false
);

console.log('leads format tests passed');
