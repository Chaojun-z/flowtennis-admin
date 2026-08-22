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

context.datasetHasCurrentRequestKey = () => false;
context.standardLifecycleMetrics = { metrics: {}, views: {} };
const notReadyStats = context.leadStatsData([
  { id: 'lead-pending-1', hasTrialAttended: true, hasCourseConversion: true, hasTrialToCourseConversion: true },
  { id: 'lead-pending-2', isActiveStudentRoster: true }
]);

assert.deepStrictEqual(
  {
    total: notReadyStats.total,
    historicalStudents: notReadyStats.historicalStudents,
    activeStudents: notReadyStats.activeStudents,
    trialAttended: notReadyStats.trialAttended,
    trialAttendedToFormalPurchase: notReadyStats.trialAttendedToFormalPurchase
  },
  {
    total: null,
    historicalStudents: null,
    activeStudents: null,
    trialAttended: null,
    trialAttendedToFormalPurchase: null
  },
  '线索池后端 summary 未就绪时，顶部五张卡必须整体等待，不能用列表字段兜底显示假数字或 0'
);

context.datasetHasCurrentRequestKey = () => true;
context.leadListPageData = {
  summary: {
    total: 10,
    historicalStudents: 315,
    historicalStudentRate: '3150%',
    activeStudents: 0,
    activeStudentRate: '0%',
    trialAttended: 11,
    trialAttendedRate: '110%',
    trialAttendedToFormalPurchase: 4,
    trialAttendedToFormalPurchaseRate: '36.4%'
  }
};
context.standardLifecycleMetrics = {
  teachingSummary: {
    historicalStudentCount: 999,
    activeStudentCount: 888,
    trialAttendedStudentCount: 777,
    trialAttendedToFormalPurchaseCount: 666
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
  },
  views: {
    historicalStudents: [{ id: 'lead-1' }, { id: 'lead-2' }],
    activeStudents: [{ id: 'lead-2' }],
    trialAttendedStudents: [{ id: 'lead-1' }, { id: 'lead-3' }],
    trialAttendedToFormalPurchase: [{ id: 'lead-1' }]
  }
};
context.teachingStudentViews = {
  summary: {
    historicalStudentCount: 999,
    activeStudentCount: 888,
    trialAttendedStudentCount: 777,
    trialAttendedToFormalPurchaseCount: 666
  }
};

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
    total: 10,
    historicalStudents: 315,
    historicalStudentRate: '3150%',
    activeStudents: 0,
    activeStudentRate: '0%',
    trialAttended: 11,
    trialAttendedToFormalPurchase: 4
  },
  '线索池顶部学员指标必须完全使用 /api/leads 返回的 summary，不能再读 customerCenterPage'
);

console.log('leads runtime standard metrics tests passed');
