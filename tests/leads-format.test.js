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

console.log('leads format tests passed');
