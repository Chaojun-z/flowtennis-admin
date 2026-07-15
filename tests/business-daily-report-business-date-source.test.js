const assert = require('assert');

const { _test } = require('../api/index.js');
const { buildBusinessDailyReportSnapshot } = require('../scripts/lib/business-daily-report');

const reportDate = '2026-07-14';
const historicalDate = '2026-06-10';
const backfillAt = `${reportDate}T09:30:00.000Z`;

const source = {
  campuses: [{ id: 'shunyi_mapo', code: 'shunyi_mapo', name: '顺义马坡' }],
  students: [{ id: 'stu-backfill', name: '历史学员', campus: 'shunyi_mapo' }],
  purchases: [{
    id: 'purchase-backfill',
    studentId: 'stu-backfill',
    studentName: '历史学员',
    packageName: '成人私教10节',
    courseType: '成人私教',
    amountPaid: 1000,
    purchaseDate: historicalDate,
    createdAt: backfillAt,
    payMethod: '微信',
    status: 'active'
  }],
  entitlements: [{
    id: 'ent-backfill',
    purchaseId: 'purchase-backfill',
    studentId: 'stu-backfill',
    studentName: '历史学员',
    packageName: '成人私教10节',
    totalLessons: 10,
    remainingLessons: 9,
    campusIds: ['shunyi_mapo']
  }],
  entitlementLedger: [{
    id: 'ledger-backfill',
    entitlementId: 'ent-backfill',
    studentId: 'stu-backfill',
    purchaseId: 'purchase-backfill',
    lessonDelta: -1,
    relatedDate: historicalDate,
    sourceDate: historicalDate,
    createdAt: backfillAt,
    reason: '历史补录消课'
  }],
  schedule: [{
    id: 'schedule-direct-backfill',
    studentId: 'stu-backfill',
    studentName: '历史学员',
    campus: 'shunyi_mapo',
    courseType: '体验课',
    settlementType: 'direct',
    startTime: `${historicalDate} 10:00:00`,
    endTime: `${historicalDate} 11:00:00`,
    status: '已结束',
    paidAmount: 200,
    payMethod: '微信',
    paymentTime: `${reportDate} 09:20:00`,
    createdAt: backfillAt
  }, {
    id: 'schedule-field-fee-backfill',
    studentId: 'stu-backfill',
    studentName: '历史学员',
    campus: 'shunyi_mapo',
    courseType: '私教课',
    settlementType: 'package',
    startTime: `${historicalDate} 12:00:00`,
    endTime: `${historicalDate} 13:00:00`,
    status: '已结束',
    requiresFieldFee: true,
    fieldFeeAmount: 80,
    fieldFeePayMethod: '微信',
    fieldFeePaymentTime: `${reportDate} 09:25:00`,
    createdAt: backfillAt
  }],
  membershipOrders: [{
    id: 'membership-backfill',
    courtId: 'court-backfill',
    courtName: '历史订场用户',
    rechargeAmount: 500,
    purchaseDate: historicalDate,
    createdAt: backfillAt,
    payMethod: '微信',
    status: 'active'
  }],
  courts: [{
    id: 'court-backfill',
    name: '历史订场用户',
    campus: 'shunyi_mapo',
    history: [{
      id: 'court-history-backfill',
      type: '消费',
      category: '订场',
      payMethod: '微信',
      amount: 300,
      date: historicalDate,
      occurredDate: historicalDate,
      startTime: `${historicalDate} 14:00:00`,
      endTime: `${historicalDate} 15:00:00`,
      recordedAt: backfillAt,
      createdAt: backfillAt
    }]
  }]
};

const financeSnapshot = _test.buildFinancePageSnapshot(source);
const rowsById = new Map(financeSnapshot.financeNormalizedRows.map((row) => [row.id, row]));

assert.strictEqual(rowsById.get('purchase-purchase-backfill').businessDate.slice(0, 10), historicalDate, '历史补录购买应按购买日期入账');
assert.strictEqual(rowsById.get('membership-membership-backfill').businessDate.slice(0, 10), historicalDate, '历史补录会员储值应按购买日期入账');
assert.strictEqual(rowsById.get('consume-ledger-backfill').businessDate.slice(0, 10), historicalDate, '历史补录消课应按消课日期入账');
assert.strictEqual(rowsById.get('schedule-direct-schedule-direct-backfill').businessDate.slice(0, 10), historicalDate, '历史补录排课直接收款应按上课日期入账');
assert.strictEqual(rowsById.get('schedule-field-fee-schedule-field-fee-backfill').businessDate.slice(0, 10), historicalDate, '历史补录排课场地费应按上课日期入账');
assert.strictEqual(rowsById.get('court-court-backfill-court-history-backfill').businessDate.slice(0, 10), historicalDate, '历史补录订场流水应按订场日期入账');

const reportSnapshot = buildBusinessDailyReportSnapshot({
  targetDate: reportDate,
  generatedAt: `${reportDate}T14:30:00.000Z`,
  campuses: source.campuses,
  financeNormalizedRows: financeSnapshot.financeNormalizedRows,
  entitlementLedger: source.entitlementLedger,
  scheduleRows: source.schedule
});

assert.strictEqual(reportSnapshot.overall.cash.today, 0, '历史补录收款不能污染录入当天实收');
assert.strictEqual(reportSnapshot.overall.recognized.today, 0, '历史补录核销不能污染录入当天核销确收');
assert.strictEqual(reportSnapshot.overall.tradeCount.today, 0, '历史补录成交不能污染录入当天成交笔数');
assert.strictEqual(reportSnapshot.overall.lessonRedemption.todayStudents, 0, '历史补录消课不能污染录入当天上课核销人数');
assert.deepStrictEqual(reportSnapshot.incomeStructure, { packageIncome: 0, bookingIncome: 0, storedValueIncome: 0 }, '历史补录不能污染录入当天收入结构');
assert.deepStrictEqual(reportSnapshot.recognitionStructure, { courseRecognized: 0, bookingRecognized: 0, storedValueRecognized: 0 }, '历史补录不能污染录入当天核销结构');
const campusRow = reportSnapshot.campusRows.find((row) => row.campusName === '顺义马坡');
assert.ok(campusRow, '当前待履约余额允许生成校区行');
assert.strictEqual(campusRow.cash, 0, '历史补录不能污染录入当天校区实收');
assert.strictEqual(campusRow.recognized, 0, '历史补录不能污染录入当天校区核销');
assert.strictEqual(campusRow.tradeCount, 0, '历史补录不能污染录入当天校区成交');
assert.strictEqual(campusRow.lessonStudents, 0, '历史补录不能污染录入当天校区上课核销人数');
assert.strictEqual(campusRow.lessonUnits, 0, '历史补录不能污染录入当天校区上课核销课时');

console.log('business daily report business date source tests passed');
