const assert = require('assert');

const {
  buildScopedStandardLifecycleMetrics
} = require('../server/read-models/platform-metrics.js');
const {
  buildFinanceOverviewDataFromRows
} = require('../server/read-models/finance-summary.js');
const {
  buildCourtAccountListViewFromData,
  buildScopedCourtAccountListSummary
} = require('../server/page-data/court-account-read-model.js');

const lifecycle = buildScopedStandardLifecycleMetrics({
  leads: [
    { id: 'lead-july-mapo', displayName: '七月马坡', leadDate: '2026-07-03', campus: 'mapo' },
    { id: 'lead-june-chao', displayName: '六月朝阳', leadDate: '2026-06-20', campus: 'chao' }
  ],
  students: [
    { id: 'stu-july-mapo', name: '七月马坡', sourceLeadId: 'lead-july-mapo', campus: 'mapo' },
    { id: 'stu-june-chao', name: '六月朝阳', sourceLeadId: 'lead-june-chao', campus: 'chao' }
  ],
  purchases: [
    { id: 'pur-july-mapo', studentId: 'stu-july-mapo', courseType: '私教课', amountPaid: 3000, purchaseDate: '2026-07-04', status: 'active' },
    { id: 'pur-june-chao', studentId: 'stu-june-chao', courseType: '私教课', amountPaid: 5000, purchaseDate: '2026-06-21', status: 'active' }
  ],
  entitlements: [],
  entitlementLedger: [],
  schedule: []
}, { campus: 'mapo', startDate: '2026-07-01', endDate: '2026-07-31' });
assert.strictEqual(lifecycle.metrics.validLeads.value, 1, '生命周期顶部有效线索应按当前校区和日期筛选');
assert.strictEqual(lifecycle.metrics.formalStudents.value, 1, '生命周期顶部正式学员应按同一筛选范围统计');

const finance = buildFinanceOverviewDataFromRows([
  { id: 'finance-july-mapo', campusName: '马坡', businessDate: '2026-07-07 09:00:00', action: '收款', transactionType: '收款', businessType: '课程', cashDelta: 500, recognizedRevenueDelta: 0, deferredRevenueDelta: 500 },
  { id: 'finance-june-mapo', campusName: '马坡', businessDate: '2026-06-25 09:00:00', action: '收款', transactionType: '收款', businessType: '课程', cashDelta: 900, recognizedRevenueDelta: 0, deferredRevenueDelta: 900 },
  { id: 'finance-july-chao', campusName: '朝阳', businessDate: '2026-07-07 09:00:00', action: '收款', transactionType: '收款', businessType: '课程', cashDelta: 700, recognizedRevenueDelta: 0, deferredRevenueDelta: 700 }
], { campusName: '马坡', startDate: '2026-07-01', endDate: '2026-07-31' });
assert.strictEqual(finance.all.cash, 500, '财务顶部总实收应按当前校区和日期筛选');
assert.strictEqual(finance.all.tradeCount, 1, '财务顶部成交笔数应按同一筛选范围统计');

const courtView = buildCourtAccountListViewFromData({
  campuses: [{ code: 'mapo', name: '马坡' }, { code: 'chao', name: '朝阳' }],
  courts: [
    { id: 'court-mapo', name: '马坡订场', campus: 'mapo', history: [
      { id: 'h-july', type: '消费', category: '订场', payMethod: '现场收款', amount: 120, date: '2026-07-02', startTime: '09:00', endTime: '10:00' },
      { id: 'h-june', type: '消费', category: '订场', payMethod: '现场收款', amount: 80, date: '2026-06-20', startTime: '09:00', endTime: '10:00' }
    ] },
    { id: 'court-chao', name: '朝阳订场', campus: 'chao', history: [
      { id: 'h-chao', type: '消费', category: '订场', payMethod: '现场收款', amount: 200, date: '2026-07-02', startTime: '09:00', endTime: '10:00' }
    ] }
  ]
});
const courtSummary = buildScopedCourtAccountListSummary(courtView, {
  campus: 'mapo',
  startDate: '2026-07-01',
  endDate: '2026-07-31'
});
assert.strictEqual(courtSummary.totalCount, 1, '订场顶部用户数应按当前校区筛选');
assert.strictEqual(courtSummary.totalBookingCount, 1, '订场顶部次数应按当前日期筛选');
assert.strictEqual(courtSummary.totalBookingAmount, 120, '订场顶部金额应按同一筛选范围统计');

console.log('scoped top summary tests passed');
