const assert = require('assert');

const { buildCustomerLifecycleRows } = require('../server/read-models/customer-lifecycle.js');
const { buildStandardLifecycleMetrics } = require('../server/read-models/platform-metrics.js');
const { buildOperationsMetrics } = require('../server/metrics/operations-metrics.js');

const sample = {
  leads: [
    { id: 'manual-trial-only', displayName: '只有手工体验时间', leadDate: '2026-06-01', trialAtRaw: '2026-06-05 10:00' },
    { id: 'direct-course', displayName: '直接成交', leadDate: '2026-06-01' },
    { id: 'manual-course-converted', displayName: '手工课程成交', leadDate: '2026-06-01', leadStage: '已成交', dealType: '课程' },
    { id: 'formal-schedule-only', displayName: '正式课排课', leadDate: '2026-06-01' },
    { id: 'real-trial-pending', displayName: '真实体验未成交', leadDate: '2026-06-02' },
    { id: 'real-trial-deal', displayName: '真实体验成交', leadDate: '2026-06-03' }
  ],
  students: [
    { id: 'student-direct-course', name: '直接成交', sourceLeadId: 'direct-course' },
    { id: 'student-manual-course-converted', name: '手工课程成交', sourceLeadId: 'manual-course-converted' },
    { id: 'student-formal-schedule-only', name: '正式课排课', sourceLeadId: 'formal-schedule-only' },
    { id: 'student-real-trial-pending', name: '真实体验未成交', sourceLeadId: 'real-trial-pending' },
    { id: 'student-real-trial-deal', name: '真实体验成交', sourceLeadId: 'real-trial-deal' }
  ],
  purchases: [
    { id: 'purchase-direct-course', studentId: 'student-direct-course', courseType: '私教课', actualAmount: 6000, status: 'active', purchaseDate: '2026-06-04' },
    { id: 'purchase-real-trial-pending', studentId: 'student-real-trial-pending', courseType: '体验课', packageName: '体验课', amountPaid: 100, actualAmount: 100, status: 'active', purchaseDate: '2026-06-05' },
    { id: 'purchase-real-trial-deal', studentId: 'student-real-trial-deal', courseType: '私教课', amountPaid: 6000, actualAmount: 6000, status: 'active', purchaseDate: '2026-06-08', notes: '体验后购买，备注不是体验证据' },
    { id: 'purchase-real-trial-renewal', studentId: 'student-real-trial-deal', courseType: '小班课', amountPaid: 3000, actualAmount: 3000, status: 'active', purchaseDate: '2026-06-09' }
  ],
  entitlements: [
    { id: 'ent-real-trial-pending', studentId: 'student-real-trial-pending', purchaseId: 'purchase-real-trial-pending', courseType: '体验课', packageName: '体验课', totalLessons: 1, remainingLessons: 0, status: 'depleted' },
    { id: 'ent-real-trial-deal', studentId: 'student-real-trial-deal', purchaseId: 'purchase-real-trial-deal', courseType: '私教课', totalLessons: 10, remainingLessons: 7, status: 'active' },
    { id: 'ent-real-trial-renewal', studentId: 'student-real-trial-deal', purchaseId: 'purchase-real-trial-renewal', courseType: '小班课', totalLessons: 6, remainingLessons: 0, status: 'depleted' }
  ],
  entitlementLedger: [
    { id: 'ledger-real-trial-deal-1', studentId: 'student-real-trial-deal', entitlementId: 'ent-real-trial-deal', purchaseId: 'purchase-real-trial-deal', lessonDelta: -2, relatedDate: '2026-06-10' },
    { id: 'ledger-real-trial-renewal-1', studentId: 'student-real-trial-deal', entitlementId: 'ent-real-trial-renewal', purchaseId: 'purchase-real-trial-renewal', lessonDelta: -6, relatedDate: '2026-06-12' }
  ],
  schedule: [
    { id: 'schedule-formal-only', studentId: 'student-formal-schedule-only', courseType: '私教课', startTime: '2026-06-06 09:00:00', status: '已排课' },
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

assert.strictEqual(standard.metrics.validLeads.value, 6, '有效线索必须按统一自然人线索池统计');
assert.strictEqual(standard.metrics.courseChainStudents.value, 5, '普通学员必须包含已转化学员和有排课记录学员');
assert.strictEqual(standard.metrics.formalStudents.value, 2, '正式学员必须来自统一教学链视图');
assert.strictEqual(standard.metrics.trialPathStudents.value, 2, '体验路径不能把只有手工体验时间的线索算进去');
assert.strictEqual(standard.metrics.trialPathDeals.value, 1, '体验路径成交只统计真实体验路径中的正式成交');
assert.strictEqual(standard.metrics.trialPathPending.value, 1, '体验路径未成交来自统一体验路径集合');
assert.strictEqual(standard.metrics.directCourseDeals.value, 1, '直接成交只统计没有真实体验路径的正式成交');
assert.strictEqual(standard.teachingSummary.coursePurchaseCount, 3, '正式学员购买次数必须累加正式课包购买笔数，不能用成交人数替代');
assert.strictEqual(standard.teachingSummary.activePackageStudentCount, 1, '有效课包学员必须只统计仍有剩余正式课包的人');
assert.strictEqual(standard.teachingSummary.totalIncome, 15000, '课包实收金额必须来自正式课包实收');
assert.strictEqual(standard.teachingSummary.recognized, 4200, '已履约金额必须来自正式课包核销金额');
assert.strictEqual(standard.teachingSummary.packageBalance, 10800, '待履约金额必须等于课包实收减已履约');
const courseViewRow = standard.views.courseChainStudents.find(row => row.studentId === 'student-real-trial-pending');
assert.ok(courseViewRow, '普通学员列表行必须来自统一教学链视图');
assert.deepStrictEqual(
  courseViewRow.packageListRows.map(row => [row.packageName, row.remainingLessons, row.totalLessons]),
  [['体验课', 0, 1]],
  '普通学员课包列表必须由后端统一读模型整理体验课包'
);
assert.strictEqual(courseViewRow.packagePurchaseDate, '2026-06-05', '普通学员课包购买时间必须由后端统一读模型给出');
const formalViewRow = standard.views.formalStudents.find(row => row.studentId === 'student-real-trial-deal');
assert.ok(formalViewRow, '正式学员列表行必须来自统一教学链视图');
assert.deepStrictEqual(
  formalViewRow.packageListRows.map(row => [row.packageName, row.remainingLessons, row.totalLessons]),
  [['私教课', 7, 10]],
  '正式学员课包列表必须由后端统一读模型只展示仍有余额的正式课包'
);
assert.strictEqual(formalViewRow.packageBalanceText, '7/10', '正式学员课包余额必须由后端统一读模型按展示课包汇总');
assert.strictEqual(formalViewRow.completedLessons, 9, '正式学员累计上课必须由后端统一读模型汇总，且包含已完成体验课');
assert.strictEqual(formalViewRow.packagePurchaseDate, '2026-06-08', '正式学员课包购买时间必须由后端统一读模型按首次正式课包给出');
assert.deepStrictEqual(
  standard.funnels.courseChain.map(row => [row.stage, row.count]),
  [
    ['有效线索', 6],
    ['普通学员', 5],
    ['正式学员', 2],
    ['课包复购', 1]
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
