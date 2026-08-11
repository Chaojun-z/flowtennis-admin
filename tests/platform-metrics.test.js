const assert = require('assert');

const { buildPlatformMetrics } = require('../server/read-models/platform-metrics.js');
const { buildOperationsMetrics } = require('../server/metrics/operations-metrics.js');

const source = {
  leads: [
    { id: 'lead-1', displayName: '已有线索', source: '朋友转介绍', leadDate: '2026-06-01' }
  ],
  students: [
    { id: 'student-1', name: '已有线索', sourceLeadId: 'lead-1', source: '朋友转介绍', createdAt: '2026-06-01' },
    { id: 'student-2', name: '无原始线索学员', phone: '13900000002', source: '小红书', createdAt: '2026-06-02' }
  ],
  purchases: [
    { id: 'purchase-1', studentId: 'student-2', packageName: '成人正式课包', actualAmount: 1000, status: 'active', purchaseDate: '2026-06-03' }
  ],
  entitlements: [
    { id: 'entitlement-1', purchaseId: 'purchase-1', studentId: 'student-2', packageName: '成人正式课包', status: 'active', totalLessons: 10, remainingLessons: 6, usedLessons: 4, validFrom: '2026-06-03' }
  ],
  entitlementLedger: [
    { id: 'ledger-1', entitlementId: 'entitlement-1', purchaseId: 'purchase-1', studentId: 'student-2', scheduleId: 'schedule-1', lessonDelta: -1, relatedDate: '2026-06-10', reason: '上课消耗', operator: 'Mira' }
  ],
  schedule: [
    { id: 'schedule-1', studentIds: ['student-2'], startTime: '2026-06-10 10:00:00', endTime: '2026-06-10 11:00:00', status: '已结束', courseType: '私教课', className: '成人私教', campus: 'shunyi_mapo', venue: '1号场', coach: '王教练', lessonCount: 1 },
    { id: 'schedule-direct-1', studentId: 'student-2', startTime: '2026-06-12 10:00:00', endTime: '2026-06-12 11:00:00', status: '已结束', courseType: '私教课', settlementType: 'single', paidAmount: 300, campus: 'shunyi_mapo', coach: '王教练', lessonCount: 1 },
    { id: 'schedule-field-fee-1', studentId: 'student-2', startTime: '2026-06-13 10:00:00', endTime: '2026-06-13 11:00:00', status: '已取消', courseType: '课程订场', paidAmount: 80, fieldFeeAmount: 80, campus: 'shunyi_mapo' }
  ],
  membershipBenefitLedger: [
    { id: 'benefit-grant-1', studentId: 'student-2', benefitCode: 'courtBooking', benefitLabel: '订场', unit: '次', delta: 3, action: 'supplement', reason: '买课包赠送', relatedDate: '2026-06-04', operator: 'Mira', sourcePurchaseId: 'purchase-1', sourcePackageName: '成人正式课包' },
    { id: 'benefit-consume-1', studentId: 'student-2', benefitCode: 'courtBooking', benefitLabel: '订场', unit: '次', delta: -1, action: 'consume', reason: '使用', relatedDate: '2026-06-11', operator: 'Mira' }
  ],
  courts: [
    { id: 'court-1', name: '订场客户', phone: '13900000003', source: '抖音', createdAt: '2026-06-04' }
  ],
  membershipAccounts: [
    { id: 'member-1', courtId: 'court-1', status: 'active', createdAt: '2026-06-05' }
  ],
  membershipOrders: []
};

const platform = buildPlatformMetrics(source);
const manualConvertedPlatform = buildPlatformMetrics({
  leads: [
    { id: 'manual-lead-1', displayName: '手动成交线索', leadStage: '已成交', systemStatus: '已成交', dealType: '课程', studentId: 'manual-student-1', isCourseConverted: true, leadDate: '2026-06-08' }
  ],
  students: [
    { id: 'manual-student-1', name: '手动成交线索', sourceLeadId: 'manual-lead-1', createdAt: '2026-06-08' }
  ],
  purchases: [],
  entitlements: [],
  schedule: [],
  courts: [],
  membershipAccounts: [],
  membershipOrders: []
});
const manualConvertedLead = manualConvertedPlatform.leadPoolRows.find(row => row.id === 'manual-lead-1');
assert.strictEqual(manualConvertedLead?.leadStage, '已成交', 'lead pool should keep manually converted course leads as converted before package purchase');
assert.strictEqual(manualConvertedLead?.systemStatus, '已成交', 'lead pool systemStatus should align with the displayed converted stage');

const notConvertedPlatform = buildPlatformMetrics({
  leads: [
    { id: 'lead-not-converted', displayName: '未转化线索', leadStage: '跟进中', systemStatus: '跟进中', dealType: '未转化', conversionType: '未转化', leadDate: '2026-06-09' }
  ],
  students: [],
  purchases: [],
  entitlements: [],
  schedule: [],
  courts: [],
  membershipAccounts: [],
  membershipOrders: []
});
const notConvertedLead = notConvertedPlatform.leadPoolRows.find(row => row.id === 'lead-not-converted');
assert.strictEqual(notConvertedLead?.leadStage, '跟进中', '未转化 dealType must not force the unified lead stage to 已成交');
assert.strictEqual(notConvertedLead?.dealType, '', '未转化 dealType must not be displayed as a成交类型');

const companionConvertedPlatform = buildPlatformMetrics({
  leads: [
    { id: 'lead-companion', displayName: '陪打线索', leadStage: '已成交', systemStatus: '已成交', dealType: '陪打', leadDate: '2026-06-10' },
    { id: 'lead-booking-companion', displayName: '订场陪打线索', leadStage: '已成交', systemStatus: '已成交', dealType: '订场+陪打', courtId: 'court-companion', leadDate: '2026-06-11' }
  ],
  students: [],
  purchases: [],
  entitlements: [],
  schedule: [
    { id: 'schedule-companion', sourceLeadId: 'lead-companion', courseType: '陪打', standardCourseType: '陪打', scheduleSource: '线索陪打', coach: '王教练', startTime: '2026-06-12 10:00:00', endTime: '2026-06-12 11:00:00', status: '已排课' }
  ],
  courts: [{ id: 'court-companion', sourceLeadId: 'lead-booking-companion', createdAt: '2026-06-11' }],
  membershipAccounts: [],
  membershipOrders: []
});
const companionLead = companionConvertedPlatform.rawLeadPoolRows.find(row => row.id === 'lead-companion');
const bookingCompanionLead = companionConvertedPlatform.rawLeadPoolRows.find(row => row.id === 'lead-booking-companion');
assert.strictEqual(companionLead?.leadStage, '已成交', 'companion lead deal should enter the converted lead stage');
assert.strictEqual(companionLead?.dealType, '陪打', 'companion lead deal type should stay visible');
assert.strictEqual(bookingCompanionLead?.dealType, '订场+陪打', 'booking plus companion should keep both deal axes');
assert.strictEqual(companionConvertedPlatform.conversionMetrics.convertedLeads, 2, 'companion deals should count in raw lead conversion metrics');

const lostAfterTrialPlatform = buildPlatformMetrics({
  leads: [
    { id: 'lead-lost-after-trial', displayName: '体验后流失', leadStage: '已流失', systemStatus: '已流失', trialAtRaw: '2026-06-10', leadDate: '2026-06-01' }
  ],
  students: [],
  purchases: [],
  entitlements: [],
  schedule: [],
  courts: [],
  membershipAccounts: [],
  membershipOrders: []
});
const lostAfterTrialLead = lostAfterTrialPlatform.leadPoolRows.find(row => row.id === 'lead-lost-after-trial');
assert.strictEqual(lostAfterTrialLead?.leadStage, '已流失', 'manual current lead stage should not be overridden by old trial booking facts');

const missingLeadDatePlatform = buildPlatformMetrics({
  leads: [
    { id: 'lead-missing-date', displayName: '缺失线索时间', createdAt: '2026-08-01 09:00:00' }
  ],
  students: [],
  purchases: [],
  entitlements: [],
  schedule: [],
  courts: [],
  membershipAccounts: [],
  membershipOrders: []
});
const missingLeadDateRow = missingLeadDatePlatform.leadPoolRows.find(row => row.id === 'lead-missing-date');
assert.strictEqual(missingLeadDateRow?.leadDate, '2026-08-01 09:00:00', 'lead pool should fill blank lead time from the earliest known business timestamp');

assert.strictEqual(platform.customerLifecycleRows.length, 3, 'lifecycle should contain existing leads, student-only customers and court/member customers');
assert.strictEqual(platform.leadPoolRows.length, 3, 'lead pool should expose every lifecycle customer identity');
assert.ok(platform.leadPoolRows.find(row => row.id === 'student:student-2' && row.displayName === '无原始线索学员'), 'student without ft_leads should still be searchable in the lead pool');
assert.ok(platform.leadPoolRows.find(row => row.id === 'court:court-1' && row.leadStage === '已成交' && row.dealType === '订场+订场会员'), 'member court customer should expose standard lead stage and separate deal type');
assert.strictEqual(platform.conversionMetrics.totalLeads, 1, 'standard conversion total should use raw valid lead cohort only');
assert.strictEqual(platform.conversionMetrics.convertedLeads, 0, 'synthetic searchable customers should not enter raw lead conversion metrics');
assert.strictEqual(platform.rawLeadPoolRows.length, 1, 'platform metrics should expose the raw lead cohort separately from the searchable lead pool');
assert.strictEqual(platform.sourceChannelStats.find(row => row.source === '转介绍')?.leads, 1, 'source stats should use raw lead cohort and one normalized source definition');
assert.strictEqual(platform.sourceChannelStats.find(row => row.source === '网球兄弟小红书'), undefined, 'student-only searchable customers should not enter raw lead source conversion stats');
assert.strictEqual(platform.studentStageStats.find(row => row.stage === 'formal')?.count, 1, 'formal student count should use the lifecycle studentStage');
const formalStudentView = platform.teachingStudentViews.formalStudents.find(row => row.studentId === 'student-2');
assert.ok(formalStudentView, 'formal student unified view should expose student-2');
assert.strictEqual(formalStudentView.packageBalanceText, '6/10', 'student list package balance should come from the backend unified view');
assert.strictEqual(formalStudentView.completedLessons, 2, 'student completed lessons should come from the backend unified view');
assert.strictEqual(formalStudentView.detailRecentLessonDate, '2026-06-12', 'student recent lesson date should come from backend unified lesson detail rows');
assert.strictEqual(formalStudentView.cumulativeCoursePaidAmount, 1300, 'student cumulative course paid amount should equal package paid amount plus direct single-lesson course receipts');
assert.strictEqual(formalStudentView.cumulativeCoursePaidText, '¥1,300', 'student cumulative course paid amount should expose a ready-to-render money text');
assert.deepStrictEqual(
  formalStudentView.detailPackageOrderRows.map(row => [row.packageName, row.purchaseDate, row.remainingLessons, row.totalLessons]),
  [['成人正式课包', '2026-06-03', 6, 10]],
  'student package detail rows should be owned by the backend unified student detail model'
);
assert.deepStrictEqual(
  formalStudentView.detailLessonRecordRows.map(row => [row.kind, row.time, row.courseType, row.coach]),
  [['schedule', '2026-06-12 10:00-11:00', '私教课', '王教练'], ['ledger', '2026-06-10 10:00-11:00', '私教课', '王教练']],
  'student lesson detail rows should be owned by the backend unified student detail model'
);
assert.deepStrictEqual(
  formalStudentView.detailBenefitRows.map(row => [row.benefitCode, row.total, row.used, row.remaining, row.lastAt]),
  [['courtBooking', 3, 1, 2, '2026-06-11']],
  'student benefit summary rows should be owned by the backend unified student detail model'
);
assert.deepStrictEqual(
  formalStudentView.detailBenefitGrantRows.map(row => [row.time, row.label, row.count, row.reason, row.operator, row.sourcePurchaseId, row.sourcePackageName]),
  [['2026-06-04', '订场', '3次', '买课包赠送', 'Mira', 'purchase-1', '成人正式课包']],
  'student benefit grant rows should keep package purchase source for audit and rollback'
);
assert.deepStrictEqual(
  formalStudentView.detailBenefitConsumeRows.map(row => [row.time, row.label, row.count, row.reason, row.operator]),
  [['2026-06-11', '订场', '1次', '使用', 'Mira']],
  'student benefit ledger rows should be owned by the backend unified student detail model'
);

const historicalPackagePlatform = buildPlatformMetrics({
  leads: [],
  students: [{ id: 'student-history-package', name: '历史课包展示' }],
  purchases: [
    { id: 'purchase-history-used', studentId: 'student-history-package', packageName: '历史10课时', courseType: '私教课', packageLessons: 10, amountPaid: 5000, status: 'active', purchaseDate: '2026-02-01' },
    { id: 'purchase-current-active', studentId: 'student-history-package', packageName: '当前10课时', courseType: '私教课', packageLessons: 10, amountPaid: 4500, status: 'active', purchaseDate: '2026-04-18' }
  ],
  entitlements: [
    { id: 'ent-history-used', studentId: 'student-history-package', purchaseId: 'purchase-history-used', packageName: '历史10课时', courseType: '私教课', totalLessons: 10, usedLessons: 10, remainingLessons: 0, status: 'depleted' },
    { id: 'ent-current-active', studentId: 'student-history-package', purchaseId: 'purchase-current-active', packageName: '当前10课时', courseType: '私教课', totalLessons: 10, usedLessons: 5, remainingLessons: 5, status: 'active' }
  ],
  schedule: [],
  courts: [],
  membershipAccounts: [],
  membershipOrders: []
});
const historicalPackageStudent = historicalPackagePlatform.teachingStudentViews.formalStudents.find(row => row.studentId === 'student-history-package');
assert.ok(historicalPackageStudent, 'history package student should enter formal student view');
assert.strictEqual(historicalPackageStudent.packageBalanceText, '5/10', 'student list balance should keep the active package balance');
assert.strictEqual(historicalPackageStudent.detailPackageBalanceText, '5/20', 'student detail balance should summarize all historical non-voided package orders');
assert.deepStrictEqual(
  historicalPackageStudent.detailPackageOrderRows.map(row => [row.packageName, row.remainingLessons, row.totalLessons, row.statusText]),
  [['当前10课时', 5, 10, '正常'], ['历史10课时', 0, 10, '已用完']],
  'student detail package orders should include depleted historical purchases and entitlements'
);

const trialPackagePlatform = buildPlatformMetrics({
  leads: [],
  students: [{ id: 'student-trial-package', name: '体验课学员' }],
  purchases: [
    { id: 'purchase-trial-239', studentId: 'student-trial-package', packageName: '私教课体验课包', courseType: '体验课', packageLessons: 1, amountPaid: 239, status: 'active', purchaseDate: '2026-08-01' }
  ],
  entitlements: [
    { id: 'ent-trial-239', studentId: 'student-trial-package', purchaseId: 'purchase-trial-239', packageName: '私教课体验课包', courseType: '体验课', totalLessons: 1, remainingLessons: 0, usedLessons: 1, status: 'active' }
  ],
  entitlementLedger: [
    { id: 'ledger-trial-239', studentId: 'student-trial-package', entitlementId: 'ent-trial-239', purchaseId: 'purchase-trial-239', scheduleId: 'schedule-trial-239', lessonDelta: -1, relatedDate: '2026-08-02', reason: '体验课核销' }
  ],
  schedule: [
    { id: 'schedule-trial-239', studentId: 'student-trial-package', startTime: '2026-08-02 10:00:00', endTime: '2026-08-02 11:00:00', status: '已结束', courseType: '体验课', coach: '王教练', lessonCount: 1 }
  ],
  courts: [],
  membershipAccounts: [],
  membershipOrders: [],
  now: new Date('2026-08-10 00:00:00')
});
const trialPackageStudent = trialPackagePlatform.teachingStudentViews.courseStudents.find(row => row.studentId === 'student-trial-package');
assert.ok(trialPackageStudent, 'trial package student should enter the course student view');
assert.deepStrictEqual(
  trialPackageStudent.detailPackageOrderRows.map(row => [row.packageName, row.purchaseDate, row.remainingLessons, row.totalLessons, row.paidAmount]),
  [['私教课体验课包', '2026-08-01', 0, 1, 239]],
  'student drawer package orders should include trial package purchases'
);
assert.deepStrictEqual(
  trialPackageStudent.detailLessonRecordRows.map(row => [row.kind, row.time, row.courseType]),
  [['ledger', '2026-08-02 10:00-11:00', '体验课']],
  'student drawer lesson records should include trial package consumption'
);

const textOnlyPackagePlatform = buildPlatformMetrics({
  leads: [],
  students: [{ id: 'student-text-only-package', name: '无权益课包文字' }],
  purchases: [],
  entitlements: [],
  entitlementLedger: [],
  schedule: [
    { id: 'schedule-text-only-package', studentId: 'student-text-only-package', startTime: '2026-08-01 10:00:00', endTime: '2026-08-01 11:00:00', status: '已结束', courseType: '私教课', settlementType: '课包扣减', paidAmount: 3720, lessonCount: 1 }
  ],
  courts: [],
  membershipAccounts: [],
  membershipOrders: [],
  now: new Date('2026-08-10 00:00:00')
});
const textOnlyPackageStudent = textOnlyPackagePlatform.teachingStudentViews.historicalStudents.find(row => row.studentId === 'student-text-only-package');
assert.ok(textOnlyPackageStudent, 'text-only package schedule student should enter the historical view through lesson facts');
assert.strictEqual(textOnlyPackageStudent.packageStatusLabel, '未买过课包', 'package status should stay unpaid when no purchase or entitlement exists');
assert.strictEqual(textOnlyPackageStudent.paymentModeLabel, '单次付费学员', 'payment mode must not use schedule text alone as package fact');

const futureSchedulePlatform = buildPlatformMetrics({
  leads: [],
  students: [{ id: 'student-future-schedule', name: '未来排课学员' }],
  purchases: [
    { id: 'purchase-future-package', studentId: 'student-future-schedule', packageName: '正式课包', courseType: '私教课', packageLessons: 10, amountPaid: 5000, status: 'active', purchaseDate: '2026-08-01' }
  ],
  entitlements: [
    { id: 'ent-future-package', studentId: 'student-future-schedule', purchaseId: 'purchase-future-package', packageName: '正式课包', courseType: '私教课', totalLessons: 10, remainingLessons: 10, status: 'active' }
  ],
  entitlementLedger: [],
  schedule: [
    { id: 'schedule-future-package', studentId: 'student-future-schedule', startTime: '2026-08-17 10:00:00', endTime: '2026-08-17 11:00:00', status: '已排课', courseType: '私教课', settlementType: '课包扣减', lessonCount: 1 }
  ],
  courts: [],
  membershipAccounts: [],
  membershipOrders: [],
  now: new Date('2026-08-10 00:00:00')
});
const futureScheduleStudent = futureSchedulePlatform.teachingStudentViews.formalStudents.find(row => row.studentId === 'student-future-schedule');
assert.ok(futureScheduleStudent, 'future scheduled package student should enter formal student view from the package fact');
assert.strictEqual(futureScheduleStudent.detailRecentLessonDate, '', 'future schedules must not be shown as the recent lesson');
assert.deepStrictEqual(futureScheduleStudent.detailLessonRecordRows, [], 'future schedules must not enter completed lesson records');

const sharedPackagePlatform = buildPlatformMetrics({
  leads: [],
  students: [
    { id: 'student-package-owner', name: '哥哥' },
    { id: 'student-package-user', name: '弟弟' }
  ],
  purchases: [
    { id: 'purchase-owner-package', studentId: 'student-package-owner', packageName: '共享正式课包', courseType: '私教课', packageLessons: 10, amountPaid: 5000, status: 'active', purchaseDate: '2026-07-01' }
  ],
  entitlements: [
    { id: 'ent-owner-package', studentId: 'student-package-owner', purchaseId: 'purchase-owner-package', packageName: '共享正式课包', courseType: '私教课', totalLessons: 10, remainingLessons: 9, usedLessons: 1, status: 'active' }
  ],
  entitlementLedger: [
    { id: 'ledger-shared-package', studentId: 'student-package-user', entitlementId: 'ent-owner-package', purchaseId: 'purchase-owner-package', scheduleId: 'schedule-shared-package', lessonDelta: -1, relatedDate: '2026-08-03', reason: '授权使用' }
  ],
  schedule: [
    { id: 'schedule-shared-package', studentId: 'student-package-user', startTime: '2026-08-03 10:00:00', endTime: '2026-08-03 11:00:00', status: '已结束', courseType: '私教课', coach: '王教练', lessonCount: 1 }
  ],
  courts: [],
  membershipAccounts: [],
  membershipOrders: [],
  now: new Date('2026-08-10 00:00:00')
});
const sharedPackageUser = sharedPackagePlatform.teachingStudentViews.historicalStudents.find(row => row.studentId === 'student-package-user');
assert.ok(sharedPackageUser, 'shared package user should enter the historical view through ledger facts');
assert.strictEqual(sharedPackageUser.packageStatusLabel, '使用他人课包', 'student using another student package should not be shown as never having package context');
assert.strictEqual(sharedPackageUser.paymentModeLabel, '课包学员', 'shared package consumption should count as package payment mode');
assert.match(sharedPackageUser.detailLessonRecordRows[0]?.lessonRelationText || '', /使用 哥哥 的课包/, 'shared package lesson record should show the package owner relation');

const operations = buildOperationsMetrics(source, { now: new Date('2026-06-18 00:00:00') });

assert.strictEqual(operations.conversion.cards.totalLeads.value, source.leads.length, 'operations conversion must count raw course leads, not the full searchable customer pool');
assert.strictEqual(operations.conversion.cards.convertedLeads.value, 0, 'operations converted leads must not treat a student link without formal purchase as course成交');
assert.strictEqual(operations.conversion.sourceRows.find(row => row.source === '网球兄弟小红书'), undefined, 'operations source rows must not include student-only searchable rows when there is no raw lead');

console.log('platform metrics tests passed');
