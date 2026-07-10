const assert = require('assert');
const fs = require('fs');
const path = require('path');
const vm = require('vm');

const repoRoot = path.join(__dirname, '..');
const context = {
  console,
  FlowTennisBusinessTaxonomy: {
    optionList: () => [],
    values: () => [],
    normalizeLeadSource: value => value || '',
    normalizeLeadCustomerType: value => value || '',
    normalizeLeadDemandProduct: value => value || ''
  },
  today: () => '2026-06-27'
};
context.window = context;
context.globalThis = context;
vm.createContext(context);

vm.runInContext(fs.readFileSync(path.join(repoRoot, 'public/assets/scripts/core/platform-data-standards.js'), 'utf8'), context);
vm.runInContext(fs.readFileSync(path.join(repoRoot, 'public/assets/scripts/pages/leads.js'), 'utf8'), context);

context.standardLifecycleMetrics = {
  teachingSummary: {
    historicalStudentCount: 5,
    activeStudentCount: 3,
    trialAttendedStudentCount: 2,
    trialAttendedToFormalPurchaseCount: 1
  },
  metrics: {
    validLeads: { value: 5 },
    courseChainStudents: { value: 3, rateText: '75%' },
    formalStudents: { value: 2, rateText: '50%' },
    historicalStudents: { value: 5, rateText: '100%' },
    activeStudents: { value: 3, rateText: '60%' },
    trialPathStudents: { value: 99, rateText: '99%' },
    trialPathDeals: { value: 88, rateText: '88%' },
    trialPathPending: { value: 77, rateText: '77%' }
  }
};
context.teachingStudentViews = { summary: {} };

const stats = context.leadStatsData([
  { id: 'lead-1' },
  { id: 'lead-2' },
  { id: 'lead-3' },
  { id: 'lead-4' }
]);

assert.deepStrictEqual(
  {
    total: stats.total,
    historicalStudents: stats.historicalStudents,
    historicalStudentRate: stats.historicalStudentRate,
    activeStudents: stats.activeStudents,
    activeStudentRate: stats.activeStudentRate,
    trialAttended: stats.trialAttended,
    trialAttendedToFormalPurchase: stats.trialAttendedToFormalPurchase
  },
  {
    total: 4,
    historicalStudents: 5,
    historicalStudentRate: '125%',
    activeStudents: 3,
    activeStudentRate: '60%',
    trialAttended: 2,
    trialAttendedToFormalPurchase: 1
  },
  '线索池顶部必须读后端显式教学汇总字段，不能被旧 validLeads 或 trialPath 指标覆盖'
);

console.log('leads runtime standard metrics tests passed');
