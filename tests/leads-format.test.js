const assert = require('assert');
const fs = require('fs');
const path = require('path');
const vm = require('vm');

const standardSource = fs.readFileSync(path.join(__dirname, '../public/assets/scripts/core/platform-data-standards.js'), 'utf8');
const source = fs.readFileSync(path.join(__dirname, '../public/assets/scripts/pages/leads.js'), 'utf8');
const context = {
  console,
  purchases: [],
  customerCenterPageReady() {
    return true;
  },
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
vm.runInContext(standardSource, context);
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
  context.leadFormalSignupDateText({ studentId: 'stu-1', dealType: '课程' }),
  '2026-05-10'
);

context.leadListPageData = {
  summary: {
    total: 5,
    historicalStudents: 3,
    historicalStudentRate: '60%',
    activeStudents: 2,
    activeStudentRate: '66.7%',
    trialAttended: 4,
    trialAttendedRate: '80%',
    trialAttendedToFormalPurchase: 1,
    trialAttendedToFormalPurchaseRate: '25%'
  }
};
context.standardLifecycleMetrics = {
  teachingSummary: {
    historicalStudentCount: 3,
    activeStudentCount: 2,
    trialAttendedStudentCount: 4,
    trialAttendedToFormalPurchaseCount: 1
  },
  metrics: {
    historicalStudents: { value: 3, rateText: '60%' },
    activeStudents: { value: 2, rateText: '67%' },
    trialAttendedToFormalPurchase: { value: 1, rateText: '25%' },
    trialPathStudents: { value: 99, rateText: '99%' },
    trialPathDeals: { value: 88, rateText: '88%' }
  },
  views: {
    historicalStudents: [
      { sourceLeadId: 'lead-1' },
      { studentId: 'stu-1' },
      { courtId: 'court-1' }
    ],
    activeStudents: [
      { studentId: 'stu-1' },
      { courtId: 'court-1' }
    ],
    trialAttendedStudents: [
      { sourceLeadId: 'lead-1' },
      { studentId: 'stu-1' },
      { sourceLeadId: 'lead-3' },
      { sourceLeadId: 'lead-4' }
    ],
    trialAttendedToFormalPurchase: [
      { sourceLeadId: 'lead-4' }
    ]
  }
};
context.teachingStudentViews = {
  summary: {
    historicalStudentCount: 3,
    activeStudentCount: 2,
    trialAttendedStudentCount: 4,
    trialAttendedToFormalPurchaseCount: 1
  }
};
assert.deepStrictEqual(
  JSON.parse(JSON.stringify(context.leadStatsData([
    { id: 'lead-1', rawStatus: '体验课完成' },
    { id: 'lead-2', trialAtRaw: '2026-05-20 10:00-11:00', studentId: 'stu-1' },
    { id: 'lead-3', trialAtRaw: '2026-06-01 10:00-11:00' },
    { id: 'lead-4', trialAtRaw: '2026-05-10 10:00-11:00', convertedFlag: true },
    { id: 'lead-5', courtId: 'court-1' }
  ]))),
  {
    total: 5,
    historicalStudents: 3,
    historicalStudentRate: '60%',
    activeStudents: 2,
    activeStudentRate: '66.7%',
    trialAttended: 4,
    trialAttendedRate: '80%',
    trialAttendedToFormalPurchase: 1,
    trialAttendedToFormalPurchaseRate: '25%'
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
assert.deepStrictEqual(
  JSON.parse(JSON.stringify(context.leadDefaultCustomDateRange())),
  { start: '2026-05-21', end: '2026-05-28' }
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
