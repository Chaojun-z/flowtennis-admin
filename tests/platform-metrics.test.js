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
    { id: 'schedule-1', studentIds: ['student-2'], startTime: '2026-06-10 10:00:00', endTime: '2026-06-10 11:00:00', status: '已结束', courseType: '私教课', className: '成人私教', campus: 'shunyi_mapo', venue: '1号场', coach: '王教练', lessonCount: 1 }
  ],
  membershipBenefitLedger: [
    { id: 'benefit-grant-1', studentId: 'student-2', benefitCode: 'courtBooking', benefitLabel: '订场', unit: '次', delta: 3, action: 'supplement', reason: '赠送', relatedDate: '2026-06-04', operator: 'Mira' },
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

assert.strictEqual(platform.customerLifecycleRows.length, 3, 'lifecycle should contain existing leads, student-only customers and court/member customers');
assert.strictEqual(platform.leadPoolRows.length, 3, 'lead pool should expose every lifecycle customer identity');
assert.ok(platform.leadPoolRows.find(row => row.id === 'student:student-2' && row.displayName === '无原始线索学员'), 'student without ft_leads should still be searchable in the lead pool');
assert.ok(platform.leadPoolRows.find(row => row.id === 'court:court-1' && row.leadStage === '已成交' && row.dealType === '订场+会员'), 'member court customer should expose standard lead stage and separate deal type');
assert.strictEqual(platform.conversionMetrics.totalLeads, 1, 'standard conversion total should use raw valid lead cohort only');
assert.strictEqual(platform.conversionMetrics.convertedLeads, 0, 'synthetic searchable customers should not enter raw lead conversion metrics');
assert.strictEqual(platform.rawLeadPoolRows.length, 1, 'platform metrics should expose the raw lead cohort separately from the searchable lead pool');
assert.strictEqual(platform.sourceChannelStats.find(row => row.source === '转介绍')?.leads, 1, 'source stats should use raw lead cohort and one normalized source definition');
assert.strictEqual(platform.sourceChannelStats.find(row => row.source === '网球兄弟小红书'), undefined, 'student-only searchable customers should not enter raw lead source conversion stats');
assert.strictEqual(platform.studentStageStats.find(row => row.stage === 'formal')?.count, 1, 'formal student count should use the lifecycle studentStage');
const formalStudentView = platform.teachingStudentViews.formalStudents.find(row => row.studentId === 'student-2');
assert.ok(formalStudentView, 'formal student unified view should expose student-2');
assert.strictEqual(formalStudentView.packageBalanceText, '6/10', 'student list package balance should come from the backend unified view');
assert.strictEqual(formalStudentView.completedLessons, 1, 'student completed lessons should come from the backend unified view');
assert.deepStrictEqual(
  formalStudentView.detailPackageOrderRows.map(row => [row.packageName, row.purchaseDate, row.remainingLessons, row.totalLessons]),
  [['成人正式课包', '2026-06-03', 6, 10]],
  'student package detail rows should be owned by the backend unified student detail model'
);
assert.deepStrictEqual(
  formalStudentView.detailLessonRecordRows.map(row => [row.kind, row.time, row.courseType, row.coach]),
  [['ledger', '2026-06-10 10:00-11:00', '私教课', '王教练']],
  'student lesson detail rows should be owned by the backend unified student detail model'
);
assert.deepStrictEqual(
  formalStudentView.detailBenefitRows.map(row => [row.benefitCode, row.total, row.used, row.remaining, row.lastAt]),
  [['courtBooking', 3, 1, 2, '2026-06-11']],
  'student benefit summary rows should be owned by the backend unified student detail model'
);
assert.deepStrictEqual(
  formalStudentView.detailBenefitConsumeRows.map(row => [row.time, row.label, row.count, row.reason, row.operator]),
  [['2026-06-11', '订场', '1次', '使用', 'Mira']],
  'student benefit ledger rows should be owned by the backend unified student detail model'
);

const operations = buildOperationsMetrics(source, { now: new Date('2026-06-18 00:00:00') });

assert.strictEqual(operations.conversion.cards.totalLeads.value, source.leads.length, 'operations conversion must count raw course leads, not the full searchable customer pool');
assert.strictEqual(operations.conversion.cards.convertedLeads.value, 0, 'operations converted leads must not treat a student link without formal purchase as course成交');
assert.strictEqual(operations.conversion.sourceRows.find(row => row.source === '网球兄弟小红书'), undefined, 'operations source rows must not include student-only searchable rows when there is no raw lead');

console.log('platform metrics tests passed');
