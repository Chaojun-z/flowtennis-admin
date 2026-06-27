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
  metrics: {
    validLeads: { value: 4 },
    courseChainStudents: { value: 3, rateText: '75%' },
    formalStudents: { value: 2, rateText: '50%' },
    trialPathStudents: { value: 2, rateText: '50%' },
    trialPathDeals: { value: 1, rateText: '50%' },
    trialPathPending: { value: 1, rateText: '50%' }
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
    courseStudents: stats.courseStudents,
    courseStudentRate: stats.courseStudentRate,
    courseConverted: stats.courseConverted,
    trialBooked: stats.trialBooked,
    trialPendingConversion: stats.trialPendingConversion
  },
  {
    total: 4,
    courseStudents: 3,
    courseStudentRate: '75%',
    courseConverted: 2,
    trialBooked: 2,
    trialPendingConversion: 1
  },
  '线索池顶部统计必须真实执行，并优先读取统一标准指标'
);

console.log('leads runtime standard metrics tests passed');
