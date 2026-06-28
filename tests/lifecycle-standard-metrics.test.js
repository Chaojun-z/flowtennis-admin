const assert = require('assert');

const { buildCustomerLifecycleRows } = require('../server/read-models/customer-lifecycle.js');
const { buildStandardLifecycleMetrics } = require('../server/read-models/platform-metrics.js');
const { buildOperationsMetrics } = require('../server/metrics/operations-metrics.js');

const sample = {
  leads: [
    { id: 'manual-trial-only', displayName: '只有手工体验时间', leadDate: '2026-06-01', trialAtRaw: '2026-06-05 10:00' },
    { id: 'direct-course', displayName: '直接成交', leadDate: '2026-06-01' },
    { id: 'real-trial-pending', displayName: '真实体验未成交', leadDate: '2026-06-02' },
    { id: 'real-trial-deal', displayName: '真实体验成交', leadDate: '2026-06-03' }
  ],
  students: [
    { id: 'student-direct-course', name: '直接成交', sourceLeadId: 'direct-course' },
    { id: 'student-real-trial-pending', name: '真实体验未成交', sourceLeadId: 'real-trial-pending' },
    { id: 'student-real-trial-deal', name: '真实体验成交', sourceLeadId: 'real-trial-deal' }
  ],
  purchases: [
    { id: 'purchase-direct-course', studentId: 'student-direct-course', courseType: '私教课', actualAmount: 6000, status: 'active', purchaseDate: '2026-06-04' },
    { id: 'purchase-real-trial-deal', studentId: 'student-real-trial-deal', courseType: '私教课', actualAmount: 6000, status: 'active', purchaseDate: '2026-06-08', notes: '体验后购买，备注不是体验证据' }
  ],
  entitlements: [],
  schedule: [
    { id: 'schedule-real-trial-pending', studentId: 'student-real-trial-pending', courseType: '体验课', startTime: '2026-06-06 10:00:00', status: '待上课' },
    { id: 'schedule-real-trial-deal', studentId: 'student-real-trial-deal', courseType: '体验课', startTime: '2026-06-07 10:00:00', status: '已完成' }
  ],
  courts: [],
  membershipAccounts: [],
  membershipOrders: [],
  coaches: [],
  financeNormalizedRows: [],
  financeOverviewData: {}
};

const customerLifecycleRows = buildCustomerLifecycleRows(sample);
const standard = buildStandardLifecycleMetrics({ ...sample, customerLifecycleRows });
const operations = buildOperationsMetrics({ ...sample, customerLifecycleRows }, {
  now: new Date('2026-06-18 00:00:00'),
  dateRange: { startDate: '2026-06-01', endDate: '2026-06-30' }
});

assert.strictEqual(standard.metrics.validLeads.value, 4, '有效线索必须按统一自然人线索池统计');
assert.strictEqual(standard.metrics.courseChainStudents.value, 3, '普通学员必须来自统一教学链视图');
assert.strictEqual(standard.metrics.formalStudents.value, 2, '正式学员必须来自统一教学链视图');
assert.strictEqual(standard.metrics.trialPathStudents.value, 2, '体验路径不能把只有手工体验时间的线索算进去');
assert.strictEqual(standard.metrics.trialPathDeals.value, 1, '体验路径成交只统计真实体验路径中的正式成交');
assert.strictEqual(standard.metrics.trialPathPending.value, 1, '体验路径未成交来自统一体验路径集合');
assert.strictEqual(standard.metrics.directCourseDeals.value, 1, '直接成交只统计没有真实体验路径的正式成交');
assert.deepStrictEqual(
  standard.funnels.courseChain.map(row => [row.stage, row.count]),
  [
    ['有效线索', 4],
    ['普通学员', 3],
    ['正式学员', 2],
    ['课包复购', 0]
  ],
  '标准课程总漏斗必须按统一口径展示线索、普通学员、正式学员、课包复购'
);

assert.strictEqual(
  operations.conversion.standardLifecycleMetrics.metrics.trialPathStudents.value,
  standard.metrics.trialPathStudents.value,
  '经营分析必须透出同一份标准生命周期指标'
);
assert.deepStrictEqual(
  operations.conversion.courseFunnel.map(row => [row.stage, row.count]),
  standard.funnels.courseChain.map(row => [row.stage, row.count]),
  '经营分析标准漏斗不得继续使用旧 courseFunnel 预约体验口径'
);

console.log('lifecycle standard metrics tests passed');
