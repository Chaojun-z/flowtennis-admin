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
assert.strictEqual(standard.metrics.trialAttendedStudents.value, 1, '上过体验课只认排课表里的有效已发生体验课');
assert.strictEqual(standard.metrics.trialAttendedToFormalPurchase.value, 1, '体验后买正式课只统计上过体验课且买过正式课包的人');
assert.strictEqual(standard.metrics.trialAttendedWithoutFormal.value, 0, '上过体验未买正式课来自同一份上过体验课集合');
assert.strictEqual(standard.metrics.directCourseDeals.value, 1, '直接成交只统计没有上过体验课事实的正式成交');
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
  ['student-direct-course', 'student-formal-schedule-only', 'student-orphan-schedule', 'student-real-trial-deal', 'student-single-pay-31days', 'student-single-pay-91days', 'student-single-pay-active', 'student-single-pay-sleeping'],
  '历史学员必须按有效排课事实或正式课包购买事实返回，包含已买课包未排课、已排课、无档案排课、体验课、正式课包课和单次付费正式课'
);
assert.deepStrictEqual(
  standard.views.activeStudents.map(row => row.studentId).sort(),
  ['student-formal-schedule-only', 'student-orphan-schedule', 'student-real-trial-deal', 'student-single-pay-31days', 'student-single-pay-active'],
  '在期学员必须按课包有余额或近90天正式课活跃返回，必须包含未取消且时间已过去的已排课记录'
);
assert.strictEqual(
  standard.teachingSummary.historicalStudentCount,
  8,
  '历史学员顶部总数必须来自历史学员新视图'
);
assert.strictEqual(
  standard.teachingSummary.historicalTrialAttendedCount,
  1,
  '历史学员上过体验课必须只按排课表体验课事实统计'
);
assert.strictEqual(
  standard.teachingSummary.historicalFormalAttendedCount,
  6,
  '历史学员上过正式课必须只按排课表正式课事实统计，不能把核销流水算成上课'
);
assert.strictEqual(
  standard.teachingSummary.historicalTrialWithoutFormalCount,
  1,
  '上过体验未上正式课必须等于有体验课排课事实且没有正式课排课事实的人'
);
assert.strictEqual(
  standard.teachingSummary.historicalFormalLesson30Count,
  2,
  '历史学员近30天正式课活跃必须只按排课表正式课事实统计'
);
assert.strictEqual(
  standard.teachingSummary.activeStudentCount,
  5,
  '在期学员顶部总数必须来自在期学员新视图'
);
assert.strictEqual(
  standard.teachingSummary.activeFormalLesson30Count,
  2,
  '在期学员近30天正式课活跃必须和排课表正式课事实一致'
);
assert.strictEqual(
  standard.teachingSummary.activeFormalLesson90Count,
  4,
  '在期学员近90天正式课活跃必须和排课表正式课事实一致'
);
assert.strictEqual(
  standard.teachingSummary.activePackageBalanceCount,
  1,
  '在期学员课包有余额必须来自后端统一读模型'
);
assert.strictEqual(
  standard.teachingSummary.activePackageLowCount,
  0,
  '在期学员课包即将耗尽必须来自后端统一读模型'
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
  operations.conversion.standardLifecycleMetrics.funnels.leadStudentRoster.map(row => [row.stage, row.count]),
  [
    ['线索池', operations.conversion.standardLifecycleMetrics.metrics.validLeads.value],
    ['历史学员', operations.conversion.standardLifecycleMetrics.metrics.historicalStudents.value],
    ['在期学员', operations.conversion.standardLifecycleMetrics.metrics.activeStudents.value]
  ],
  '经营分析主漏斗必须使用线索池、历史学员、在期学员同一份标准生命周期口径'
);

const hardCase = {
  leads: [],
  students: [
    { id: 'hard-past-scheduled', name: '已排课已上课单次' },
    { id: 'hard-package-cn', name: '中文课包划扣' },
    { id: 'hard-package-low', name: '即将耗尽课包' },
    { id: 'hard-package-no-lesson', name: '有余额未上课' },
    { id: 'hard-ledger-only-recent', name: '只有核销无排课' },
    { id: 'hard-renewal-due', name: '课包待续费' },
    { id: 'hard-stable-single', name: '稳定单次付费' },
    { id: 'hard-single-recent', name: '近期单次付费' },
    { id: 'hard-single-old', name: '超90天单次付费' },
    { id: 'hard-gift-free', name: '赠送免费正式课' },
    { id: 'hard-package-free-note', name: '课包扣减免费备注' },
    { id: 'hard-package-plus-gift', name: '课包加赠送免费' },
    { id: 'hard-blank-formal', name: '无结算字段正式课' },
    { id: 'hard-package-blank', name: '有课包无结算字段' }
  ],
  purchases: [
    { id: 'hard-purchase-package-cn', studentId: 'hard-package-cn', courseType: '私教课', packageLessons: 10, amountPaid: 5000, status: 'active', purchaseDate: '2026-06-01' },
    { id: 'hard-purchase-package-low', studentId: 'hard-package-low', courseType: '私教课', packageLessons: 10, amountPaid: 5000, status: 'active', purchaseDate: '2026-06-02' },
    { id: 'hard-purchase-package-no-lesson', studentId: 'hard-package-no-lesson', courseType: '私教课', packageLessons: 10, amountPaid: 5000, status: 'active', purchaseDate: '2026-06-03' },
    { id: 'hard-purchase-ledger-only', studentId: 'hard-ledger-only-recent', courseType: '私教课', packageLessons: 10, amountPaid: 5000, status: 'active', purchaseDate: '2026-06-04' },
    { id: 'hard-purchase-renewal-due', studentId: 'hard-renewal-due', courseType: '私教课', packageLessons: 10, amountPaid: 5000, status: 'active', purchaseDate: '2026-06-05' },
    { id: 'hard-purchase-package-free-note', studentId: 'hard-package-free-note', courseType: '私教课', packageLessons: 10, amountPaid: 5000, status: 'active', purchaseDate: '2026-06-06' },
    { id: 'hard-purchase-package-plus-gift', studentId: 'hard-package-plus-gift', courseType: '私教课', packageLessons: 10, amountPaid: 5000, status: 'active', purchaseDate: '2026-06-07' },
    { id: 'hard-purchase-package-blank', studentId: 'hard-package-blank', courseType: '私教课', packageLessons: 10, amountPaid: 5000, status: 'active', purchaseDate: '2026-06-08' }
  ],
  entitlements: [
    { id: 'hard-ent-package-cn', studentId: 'hard-package-cn', purchaseId: 'hard-purchase-package-cn', courseType: '私教课', totalLessons: 10, remainingLessons: 6, status: 'active' },
    { id: 'hard-ent-package-low', studentId: 'hard-package-low', purchaseId: 'hard-purchase-package-low', courseType: '私教课', totalLessons: 10, remainingLessons: 1, status: 'active' },
    { id: 'hard-ent-package-no-lesson', studentId: 'hard-package-no-lesson', purchaseId: 'hard-purchase-package-no-lesson', courseType: '私教课', totalLessons: 10, remainingLessons: 5, status: 'active' },
    { id: 'hard-ent-ledger-only', studentId: 'hard-ledger-only-recent', purchaseId: 'hard-purchase-ledger-only', courseType: '私教课', totalLessons: 10, remainingLessons: 9, status: 'active' },
    { id: 'hard-ent-renewal-due', studentId: 'hard-renewal-due', purchaseId: 'hard-purchase-renewal-due', courseType: '私教课', totalLessons: 10, remainingLessons: 0, status: 'depleted' },
    { id: 'hard-ent-package-free-note', studentId: 'hard-package-free-note', purchaseId: 'hard-purchase-package-free-note', courseType: '私教课', totalLessons: 10, remainingLessons: 6, status: 'active' },
    { id: 'hard-ent-package-plus-gift', studentId: 'hard-package-plus-gift', purchaseId: 'hard-purchase-package-plus-gift', courseType: '私教课', totalLessons: 10, remainingLessons: 6, status: 'active' },
    { id: 'hard-ent-package-blank', studentId: 'hard-package-blank', purchaseId: 'hard-purchase-package-blank', courseType: '私教课', totalLessons: 10, remainingLessons: 6, status: 'active' }
  ],
  entitlementLedger: [
    { id: 'hard-ledger-package-cn-1', studentId: 'hard-package-cn', entitlementId: 'hard-ent-package-cn', purchaseId: 'hard-purchase-package-cn', lessonDelta: -1, relatedDate: '2026-07-03', courseType: '私教课' },
    { id: 'hard-ledger-package-low-1', studentId: 'hard-package-low', entitlementId: 'hard-ent-package-low', purchaseId: 'hard-purchase-package-low', lessonDelta: -1, relatedDate: '2026-07-05', courseType: '私教课' },
    { id: 'hard-ledger-only-1', studentId: 'hard-ledger-only-recent', entitlementId: 'hard-ent-ledger-only', purchaseId: 'hard-purchase-ledger-only', lessonDelta: -1, relatedDate: '2026-07-06', courseType: '私教课' }
  ],
  schedule: [
    { id: 'hard-schedule-past', studentId: 'hard-past-scheduled', studentName: '已排课已上课单次', courseType: '私教课', startTime: '2026-07-01 10:00:00', endTime: '2026-07-01 11:00:00', status: '已排课', settlementType: 'single' },
    { id: 'hard-schedule-package-cn', studentId: 'hard-package-cn', studentName: '中文课包划扣', courseType: '私教课', startTime: '2026-07-03 10:00:00', endTime: '2026-07-03 11:00:00', status: '已下课', settlementType: '课包划扣' },
    { id: 'hard-schedule-package-low', studentId: 'hard-package-low', studentName: '即将耗尽课包', courseType: '私教课', startTime: '2026-07-05 10:00:00', endTime: '2026-07-05 11:00:00', status: '已下课', settlementType: '课包划扣' },
    { id: 'hard-schedule-renewal-due', studentId: 'hard-renewal-due', studentName: '课包待续费', courseType: '私教课', startTime: '2026-07-04 10:00:00', endTime: '2026-07-04 11:00:00', status: '已下课', settlementType: '课包划扣' },
    { id: 'hard-schedule-stable-single-1', studentId: 'hard-stable-single', studentName: '稳定单次付费', courseType: '私教课', startTime: '2026-06-20 10:00:00', endTime: '2026-06-20 11:00:00', status: '已下课', settlementType: 'single' },
    { id: 'hard-schedule-stable-single-2', studentId: 'hard-stable-single', studentName: '稳定单次付费', courseType: '私教课', startTime: '2026-07-02 10:00:00', endTime: '2026-07-02 11:00:00', status: '已下课', settlementType: 'single' },
    { id: 'hard-schedule-single-recent', studentId: 'hard-single-recent', studentName: '近期单次付费', courseType: '私教课', startTime: '2026-07-04 10:00:00', endTime: '2026-07-04 11:00:00', status: '已下课', settlementType: 'single' },
    { id: 'hard-schedule-single-old', studentId: 'hard-single-old', studentName: '超90天单次付费', courseType: '私教课', startTime: '2026-03-01 10:00:00', endTime: '2026-03-01 11:00:00', status: '已下课', settlementType: 'single' },
    { id: 'hard-schedule-gift-free', studentId: 'hard-gift-free', studentName: '赠送免费正式课', courseType: '私教课', startTime: '2026-07-05 10:00:00', endTime: '2026-07-05 11:00:00', status: '已下课', settlementType: 'gift', paymentMethod: '赠送/免费' },
    { id: 'hard-schedule-package-free-note', studentId: 'hard-package-free-note', studentName: '课包扣减免费备注', courseType: '私教课', startTime: '2026-07-05 12:00:00', endTime: '2026-07-05 13:00:00', status: '已下课', settlementType: '课包扣减', notes: '教练迟到，本节课免费' },
    { id: 'hard-schedule-package-plus-gift-1', studentId: 'hard-package-plus-gift', studentName: '课包加赠送免费', courseType: '私教课', startTime: '2026-07-05 14:00:00', endTime: '2026-07-05 15:00:00', status: '已下课', settlementType: '课包扣减' },
    { id: 'hard-schedule-package-plus-gift-2', studentId: 'hard-package-plus-gift', studentName: '课包加赠送免费', courseType: '私教课', startTime: '2026-07-06 14:00:00', endTime: '2026-07-06 15:00:00', status: '已下课', settlementType: 'gift', paymentMethod: '赠送/免费' },
    { id: 'hard-schedule-blank-formal', studentId: 'hard-blank-formal', studentName: '无结算字段正式课', courseType: '私教课', startTime: '2026-07-06 07:00:00', endTime: '2026-07-06 09:00:00', status: '已排课' },
    { id: 'hard-schedule-package-blank', studentId: 'hard-package-blank', studentName: '有课包无结算字段', courseType: '私教课', startTime: '2026-07-06 09:00:00', endTime: '2026-07-06 10:00:00', status: '已排课' }
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
  ['hard-blank-formal', 'hard-gift-free', 'hard-ledger-only-recent', 'hard-package-blank', 'hard-package-cn', 'hard-package-free-note', 'hard-package-low', 'hard-package-no-lesson', 'hard-package-plus-gift', 'hard-past-scheduled', 'hard-renewal-due', 'hard-single-old', 'hard-single-recent', 'hard-stable-single'],
  '历史学员必须按排课表有效上课事实或正式课包购买事实返回，有正式课包但未排课也要进入历史学员'
);
assert.deepStrictEqual(
  hardActiveIds,
  ['hard-blank-formal', 'hard-gift-free', 'hard-ledger-only-recent', 'hard-package-blank', 'hard-package-cn', 'hard-package-free-note', 'hard-package-low', 'hard-package-no-lesson', 'hard-package-plus-gift', 'hard-past-scheduled', 'hard-renewal-due', 'hard-single-recent', 'hard-stable-single'],
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
assert.strictEqual(cnPackageRow.studentStatusLabel, '课包活跃中', '课包有余额且近30天有正式课的学员必须由后端标为课包活跃中');
assert.notStrictEqual(cnPackageRow.studentStatusLabel, '稳定单次付费', '只有课包上课记录的学员不能被标成旧的稳定单次付费');
assert.strictEqual(cnPackageRow.lessonVolumeLabel, '-', '历史课时标签必须由后端统一输出');
assert.strictEqual(
  hardStandard.views.activeStudents.find(row => row.studentId === 'hard-gift-free')?.paymentModeLabel,
  '单次付费学员',
  '排课结算方式为赠送/免费的正式课必须按单次付费学员展示'
);
assert.strictEqual(
  hardStandard.views.activeStudents.find(row => row.studentId === 'hard-package-free-note')?.paymentModeLabel,
  '课包学员',
  '课包扣减正式课即使备注包含免费，也必须优先按课包学员展示'
);
assert.strictEqual(
  hardStandard.views.activeStudents.find(row => row.studentId === 'hard-package-plus-gift')?.paymentModeLabel,
  '课包+单次付费',
  '同一学员既有课包扣减又有赠送/免费正式课，必须按课包+单次付费展示'
);
assert.strictEqual(
  hardStandard.views.activeStudents.find(row => row.studentId === 'hard-blank-formal')?.paymentModeLabel,
  '单次付费学员',
  '没有课包且结算字段为空的正式课排课事实，必须兜底按单次付费学员展示'
);
assert.strictEqual(
  hardStandard.views.activeStudents.find(row => row.studentId === 'hard-package-blank')?.paymentModeLabel,
  '课包学员',
  '有正式课包的历史老排课即使结算字段为空，也不能误判为单次付费'
);
const pastScheduledDetailRow = hardStandard.views.activeStudents.find(row => row.studentId === 'hard-past-scheduled');
assert.deepStrictEqual(
  pastScheduledDetailRow?.detailLessonRecordRows.map(row => [row.kind, row.time, row.courseType, row.lessonDelta]),
  [['schedule', '2026-07-01 10:00-11:00', '私教课', -1]],
  '已过时间且未取消的排课既然计入累计上课，也必须由后端统一明细输出'
);
const stableSingleDetailRow = hardStandard.views.activeStudents.find(row => row.studentId === 'hard-stable-single');
assert.deepStrictEqual(
  stableSingleDetailRow?.detailLessonRecordRows.map(row => [row.kind, row.time, row.courseType, row.lessonDelta]),
  [
    ['schedule', '2026-07-02 10:00-11:00', '私教课', -1],
    ['schedule', '2026-06-20 10:00-11:00', '私教课', -1]
  ],
  '状态为已下课的单次课必须进入后端统一上课明细'
);
assert.strictEqual(
  hardStandard.views.activeStudents.find(row => row.studentId === 'hard-renewal-due')?.studentStatusLabel,
  '课包待续费',
  '课包已用完且近30天仍上课的课包学员必须由后端标为课包待续费'
);
assert.strictEqual(
  hardStandard.views.activeStudents.find(row => row.studentId === 'hard-stable-single')?.studentStatusLabel,
  '稳定单次付费',
  '最近90天有2次及以上单次正式课的学员必须由后端标为稳定单次付费'
);
assert.strictEqual(
  hardStandard.teachingSummary.historicalTagCounts.packageStatus['课包有余额'],
  hardStandard.teachingSummary.activeTagCounts.packageStatus['课包有余额'],
  '课包有余额是包含关系内的统一口径，历史页和在期页顶部数字必须一致'
);
const hardHistoricalPackageBalanceCount = (Number(hardStandard.teachingSummary.historicalTagCounts.packageStatus['课包有余额']) || 0)
  + (Number(hardStandard.teachingSummary.historicalTagCounts.packageStatus['课包即将耗尽']) || 0);
const hardActivePackageBalanceCount = (Number(hardStandard.teachingSummary.activeTagCounts.packageStatus['课包有余额']) || 0)
  + (Number(hardStandard.teachingSummary.activeTagCounts.packageStatus['课包即将耗尽']) || 0);
assert.strictEqual(
  hardHistoricalPackageBalanceCount,
  hardActivePackageBalanceCount,
  '历史学员和在期学员顶部“课包有余额”卡片必须按同一个后端标签合计，人数一致'
);
assert.strictEqual(
  hardStandard.teachingSummary.historicalTagCounts.activityStatus['近30天活跃'],
  hardStandard.teachingSummary.activeTagCounts.activityStatus['近30天活跃'],
  '近30天活跃是包含关系内的统一口径，历史页和在期页顶部数字必须一致'
);
assert.strictEqual(
  hardStandard.teachingSummary.activePackageBalanceCount,
  7,
  '在期学员课包有余额卡片必须由后端统一输出，且只统计在期学员范围内'
);
assert.strictEqual(
  hardStandard.teachingSummary.activePackageLowCount,
  1,
  '在期学员课包即将耗尽卡片必须由后端统一输出'
);
assert.strictEqual(
  hardStandard.teachingSummary.activeFormalLesson30Count,
  11,
  '在期学员近30天正式课活跃必须只按排课表正式课事实输出'
);
assert.strictEqual(
  hardStandard.teachingSummary.activeFormalLesson90Count,
  11,
  '在期学员近90天正式课活跃必须只按排课表正式课事实输出'
);

console.log('lifecycle standard metrics tests passed');
