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
    { id: 'single-pay-active', displayName: '单次付费活跃', leadDate: '2026-06-01' },
    { id: 'single-pay-31days', displayName: '单次付费31天', leadDate: '2026-06-01' },
    { id: 'single-pay-91days', displayName: '单次付费91天', leadDate: '2026-06-01' },
    { id: 'single-pay-sleeping', displayName: '单次付费沉睡', leadDate: '2026-06-01' },
    { id: 'real-trial-pending', displayName: '真实体验未成交', leadDate: '2026-06-02' },
    { id: 'real-trial-deal', displayName: '真实体验成交', leadDate: '2026-06-03' }
  ],
  students: [
    { id: 'student-direct-course', name: '直接成交', sourceLeadId: 'direct-course' },
    { id: 'student-manual-course-converted', name: '手工课程成交', sourceLeadId: 'manual-course-converted' },
    { id: 'student-formal-schedule-only', name: '正式课排课', sourceLeadId: 'formal-schedule-only' },
    { id: 'student-single-pay-active', name: '单次付费活跃', sourceLeadId: 'single-pay-active' },
    { id: 'student-single-pay-sleeping', name: '单次付费沉睡', sourceLeadId: 'single-pay-sleeping' },
    { id: 'student-single-pay-31days', name: '单次付费31天', sourceLeadId: 'single-pay-31days' },
    { id: 'student-single-pay-91days', name: '单次付费91天', sourceLeadId: 'single-pay-91days' },
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
    { id: 'schedule-single-pay-active', studentId: 'student-single-pay-active', courseType: '私教课', startTime: '2026-06-20 09:00:00', endTime: '2026-06-20 10:00:00', status: '已结束', settlementType: 'single' },
    { id: 'schedule-single-pay-sleeping', studentId: 'student-single-pay-sleeping', courseType: '私教课', startTime: '2025-12-01 09:00:00', endTime: '2025-12-01 10:00:00', status: '已结束', settlementType: 'single' },
    { id: 'schedule-single-pay-31days', studentId: 'student-single-pay-31days', courseType: '私教课', startTime: '2026-06-08 09:00:00', endTime: '2026-06-08 10:00:00', status: '已结束', settlementType: 'single' },
    { id: 'schedule-single-pay-91days', studentId: 'student-single-pay-91days', courseType: '私教课', startTime: '2026-04-09 09:00:00', endTime: '2026-04-09 10:00:00', status: '已结束', settlementType: 'single' },
    { id: 'schedule-orphan-formal', studentId: 'student-orphan-schedule', studentName: '排课无档案', courseType: '私教课', startTime: '2026-06-18 09:00:00', endTime: '2026-06-18 10:00:00', status: '已结束', settlementType: 'single' },
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
const standard = buildStandardLifecycleMetrics({ ...sample, customerLifecycleRows, now: new Date('2026-07-09 00:00:00') });
const operations = buildOperationsMetrics({ ...sample, customerLifecycleRows }, {
  now: new Date('2026-06-18 00:00:00'),
  dateRange: { startDate: '2026-06-01', endDate: '2026-06-30' }
});

assert.strictEqual(standard.metrics.validLeads.value, 10, '有效线索必须按统一自然人线索池统计');
assert.strictEqual(standard.metrics.courseChainStudents.value, 10, '普通学员必须包含已转化学员和有排课记录学员');
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
  standard.views.historicalStudents.map(row => row.studentId).sort(),
  ['student-formal-schedule-only', 'student-orphan-schedule', 'student-real-trial-deal', 'student-single-pay-31days', 'student-single-pay-91days', 'student-single-pay-active', 'student-single-pay-sleeping'],
  '历史学员必须按有效排课事实返回，包含已排课、无档案排课、体验课、正式课包课和单次付费正式课'
);
assert.deepStrictEqual(
  standard.views.activeStudents.map(row => row.studentId).sort(),
  ['student-formal-schedule-only', 'student-orphan-schedule', 'student-real-trial-deal', 'student-single-pay-31days', 'student-single-pay-active'],
  '在期学员必须按课包有余额或近90天正式课活跃返回，必须包含未取消且时间已过去的已排课记录'
);
assert.strictEqual(
  standard.teachingSummary.historicalStudentCount,
  7,
  '历史学员顶部总数必须来自历史学员新视图'
);
assert.strictEqual(
  standard.teachingSummary.activeStudentCount,
  5,
  '在期学员顶部总数必须来自在期学员新视图'
);
assert.ok(
  standard.views.activeStudents.some(row => row.studentId === 'student-single-pay-active' && row.packageBalanceText === '-'),
  '单次付费活跃学员必须进入在期学员，但课包余额展示为空'
);
assert.deepStrictEqual(
  standard.funnels.courseChain.map(row => [row.stage, row.count]),
  [
    ['有效线索', 10],
    ['普通学员', 10],
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

const hardCase = {
  leads: [],
  students: [
    { id: 'hard-past-scheduled', name: '已排课已上课单次' },
    { id: 'hard-package-cn', name: '中文课包划扣' },
    { id: 'hard-single-recent', name: '近期单次付费' },
    { id: 'hard-single-old', name: '超90天单次付费' }
  ],
  purchases: [
    { id: 'hard-purchase-package-cn', studentId: 'hard-package-cn', courseType: '私教课', packageLessons: 10, amountPaid: 5000, status: 'active', purchaseDate: '2026-06-01' }
  ],
  entitlements: [
    { id: 'hard-ent-package-cn', studentId: 'hard-package-cn', purchaseId: 'hard-purchase-package-cn', courseType: '私教课', totalLessons: 10, remainingLessons: 6, status: 'active' }
  ],
  entitlementLedger: [
    { id: 'hard-ledger-package-cn-1', studentId: 'hard-package-cn', entitlementId: 'hard-ent-package-cn', purchaseId: 'hard-purchase-package-cn', lessonDelta: -1, relatedDate: '2026-07-03', courseType: '私教课' }
  ],
  schedule: [
    { id: 'hard-schedule-past', studentId: 'hard-past-scheduled', studentName: '已排课已上课单次', courseType: '私教课', startTime: '2026-07-01 10:00:00', endTime: '2026-07-01 11:00:00', status: '已排课', settlementType: 'single' },
    { id: 'hard-schedule-package-cn', studentId: 'hard-package-cn', studentName: '中文课包划扣', courseType: '私教课', startTime: '2026-07-03 10:00:00', endTime: '2026-07-03 11:00:00', status: '已下课', settlementType: '课包划扣' },
    { id: 'hard-schedule-single-recent', studentId: 'hard-single-recent', studentName: '近期单次付费', courseType: '私教课', startTime: '2026-07-04 10:00:00', endTime: '2026-07-04 11:00:00', status: '已下课', settlementType: 'single' },
    { id: 'hard-schedule-single-old', studentId: 'hard-single-old', studentName: '超90天单次付费', courseType: '私教课', startTime: '2026-03-01 10:00:00', endTime: '2026-03-01 11:00:00', status: '已下课', settlementType: 'single' }
  ],
  courts: [],
  membershipAccounts: [],
  membershipOrders: [],
  coaches: [],
  financeNormalizedRows: [],
  financeOverviewData: {}
};
const hardLifecycleRows = buildCustomerLifecycleRows(hardCase);
const hardStandard = buildStandardLifecycleMetrics({ ...hardCase, customerLifecycleRows: hardLifecycleRows, now: new Date('2026-07-09 00:00:00') });
const hardHistoricalIds = hardStandard.views.historicalStudents.map(row => row.studentId).sort();
const hardActiveIds = hardStandard.views.activeStudents.map(row => row.studentId).sort();
assert.deepStrictEqual(
  hardHistoricalIds,
  ['hard-package-cn', 'hard-past-scheduled', 'hard-single-old', 'hard-single-recent'],
  '历史学员必须把未取消且时间已过去的已排课记录视为上课事实'
);
assert.deepStrictEqual(
  hardActiveIds,
  ['hard-package-cn', 'hard-past-scheduled', 'hard-single-recent'],
  '在期学员必须是历史学员的子集，并包含课包有余额或90天内上过正式课的人'
);
assert.ok(
  hardActiveIds.every(id => hardHistoricalIds.includes(id)),
  '在期学员必须完全包含在历史学员中，两个列表必须是漏斗关系'
);
const cnPackageRow = hardStandard.views.activeStudents.find(row => row.studentId === 'hard-package-cn');
assert.ok(cnPackageRow, '中文课包划扣学员必须进入在期学员');
assert.strictEqual(cnPackageRow.packageStatusLabel, '课包有余额', '课包状态必须由后端统一输出');
assert.strictEqual(cnPackageRow.paymentModeLabel, '课包学员', '中文“课包划扣”不能被误判为单次付费');
assert.strictEqual(cnPackageRow.activityStatusLabel, '近30天活跃', '活跃状态必须由后端统一输出并识别课包核销上课事实');
assert.notStrictEqual(cnPackageRow.studentStatusLabel, '稳定单次付费', '只有课包上课记录的学员不能被标成稳定单次付费');
assert.strictEqual(cnPackageRow.lessonVolumeLabel, '-', '历史课时标签必须由后端统一输出');
assert.strictEqual(
  hardStandard.teachingSummary.historicalTagCounts.packageStatus['课包有余额'],
  hardStandard.teachingSummary.activeTagCounts.packageStatus['课包有余额'],
  '课包有余额是包含关系内的统一口径，历史页和在期页顶部数字必须一致'
);
assert.strictEqual(
  hardStandard.teachingSummary.historicalTagCounts.activityStatus['近30天活跃'],
  hardStandard.teachingSummary.activeTagCounts.activityStatus['近30天活跃'],
  '近30天活跃是包含关系内的统一口径，历史页和在期页顶部数字必须一致'
);

console.log('lifecycle standard metrics tests passed');
