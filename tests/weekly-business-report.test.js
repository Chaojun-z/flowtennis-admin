const assert = require('assert');
const fs = require('fs');
const path = require('path');

const {
  resolveWeeklyBusinessReportPeriod,
  buildWeeklyBusinessReportSnapshot,
  generateWeeklyBusinessReport,
  renderWeeklyBusinessReportHtml,
  buildWeeklyBusinessReportFeishuText
} = require('../server/weekly-business-report.js');
const { createWeeklyBusinessReportRoutes } = require('../server/weekly-business-report-routes.js');

const repoRoot = path.join(__dirname, '..');
const apiSource = fs.readFileSync(path.join(repoRoot, 'api/index.js'), 'utf8');
const weeklyReportSource = fs.readFileSync(path.join(repoRoot, 'server/weekly-business-report.js'), 'utf8');
const weeklyRoutesSource = fs.readFileSync(path.join(repoRoot, 'server/weekly-business-report-routes.js'), 'utf8');
const weeklyWorkflow = fs.readFileSync(path.join(repoRoot, '.github/workflows/weekly-business-report.yml'), 'utf8');
const indexHtml = fs.readFileSync(path.join(repoRoot, 'public/index.html'), 'utf8');
const weeklyPageSource = fs.readFileSync(path.join(repoRoot, 'public/assets/scripts/pages/weekly-reports.js'), 'utf8');
const stateSource = fs.readFileSync(path.join(repoRoot, 'public/assets/scripts/core/state.js'), 'utf8');
const bootstrapSource = fs.readFileSync(path.join(repoRoot, 'public/assets/scripts/core/bootstrap.js'), 'utf8');
const componentsSource = fs.readFileSync(path.join(repoRoot, 'public/assets/scripts/core/components.js'), 'utf8');
const publicApiSource = fs.readFileSync(path.join(repoRoot, 'public/assets/scripts/core/api.js'), 'utf8');
const operationsPageSource = fs.readFileSync(path.join(repoRoot, 'server/page-data/operations-page.js'), 'utf8');
const operationsSnapshotWorkflow = fs.readFileSync(path.join(repoRoot, '.github/workflows/operations-snapshot-rebuild.yml'), 'utf8');
const operationsSnapshotRunnerSource = fs.readFileSync(path.join(repoRoot, 'scripts/rebuild-operations-snapshot.js'), 'utf8');

const period = resolveWeeklyBusinessReportPeriod(new Date('2026-09-04T00:00:00.000Z'));
assert.deepStrictEqual(period, {
  startDate: '2026-08-27',
  endDate: '2026-09-03',
  previousStartDate: '2026-08-19',
  previousEndDate: '2026-08-26',
  timezone: 'Asia/Shanghai'
}, 'weekly report should use Beijing natural days from previous Thursday through current Thursday');

const operationsPayload = {
  operations: {
    overview: {
      cards: {
        totalIncome: { value: 12000 },
        recognizedRevenue: { value: 8000 },
        courseRecognized: { value: 3200 }
      },
      revenueMix: [
        { name: '课程收入', value: 7000 },
        { name: '订场收入', value: 3000 },
        { name: '会员储值', value: 2000 }
      ]
    },
    court: {
      cards: {
        activeVenues: { value: 2 },
        bookingHours: { value: 30 },
        bookingCount: { value: 12 },
        utilizationRate: { value: 66.7 }
      },
      trends: [
        { date: '2026-08-27', utilizationRate: 41 },
        { date: '2026-08-28', utilizationRate: 72 },
        { date: '2026-09-03', utilizationRate: 61 }
      ],
      usageMixRows: [
        { type: '散客场地使用', count: 4, hours: 10, amount: 1200 },
        { type: '会员场地使用', count: 3, hours: 8, amount: 900 },
        { type: '课程场地使用', count: 2, hours: 6, amount: 600 },
        { type: '免费场地使用', count: 1, hours: 2, amount: 0, receivableAmount: 300 }
      ]
    },
    coach: {
      cards: {
        usedHours: { value: 42 }
      },
      rows: [
        { coach: '王教练', usedHours: 18, lessonCount: 9, courseMix: [{ type: '私教课', hours: 12 }, { type: '小班课', hours: 3 }, { type: '体验课', hours: 2 }, { type: '专项课', hours: 1 }] },
        { coach: '张教练', usedHours: 4, lessonCount: 2, courseMix: [{ type: '陪打', hours: 4 }] }
      ]
    },
    conversion: {
      cards: {
        totalLeads: { value: 80 },
        trialPathDealCustomers: { value: 6 }
      },
      sourceRows: [
        { source: '小红书', totalLeads: 10, trialAttended: 4, trialPathDealCustomers: 2 }
      ]
    }
  }
};

const snapshot = buildWeeklyBusinessReportSnapshot({
  period,
  campusName: '顺义马坡',
  operationsPayload,
  previousOperationsPayload: {
    operations: {
      overview: { cards: { totalIncome: { value: 10000 }, recognizedRevenue: { value: 6000 }, courseRecognized: { value: 2000 } }, revenueMix: [{ name: '课程收入', value: 5000 }, { name: '会员储值', value: 1000 }] },
      court: { cards: { utilizationRate: { value: 50 } } },
      coach: { cards: { usedHours: { value: 35 } } },
      conversion: { cards: { totalLeads: { value: 60 } } }
    }
  },
  shareToken: 'token-abc',
  baseUrl: 'https://www.flowtennis.cn'
});

assert.strictEqual(snapshot.campusName, '顺义马坡', 'snapshot should be fixed to Shunyi Mapo');
assert.strictEqual(snapshot.weekNumber, 36, 'snapshot should expose ISO week number for the report period');
assert.strictEqual(snapshot.summary.totalIncome.value, 8000, 'snapshot should expose completed-service business revenue');
assert.strictEqual(snapshot.summary.totalIncome.compare.changeValue, 2000, 'snapshot should include previous-period comparison');
assert.strictEqual(snapshot.shareUrl, 'https://www.flowtennis.cn/weekly-reports/token-abc', 'snapshot should expose a share URL');
assert.ok(snapshot.sections.court.freeUsage.receivableAmount >= 300, 'free court usage should keep zero actual amount and receivable concession amount');
assert.strictEqual(snapshot.sections.detailsMode, 'summary-only', 'weekly report should not expose single-record details');
assert.strictEqual(snapshot.sections.court.usageRows.find(row => row.key === 'member')?.hours, 8, 'weekly report should preserve member court usage data');
assert.strictEqual(snapshot.sections.coach.rows.find(row => row.coach === '王教练')?.privateHours, 12, 'weekly report should derive coach private hours from course mix');
assert.strictEqual(snapshot.sections.coach.totalScheduled, 22, 'weekly report coach total scheduled hours should equal all course type hours');
assert.strictEqual(snapshot.sections.coach.rows.find(row => row.coach === '王教练')?.scheduledCount, 18, 'coach row scheduled value should equal that coach course type hour sum');
assert.strictEqual(snapshot.sections.court.dailyRows.length, 8, 'court utilization chart should keep one cell for each natural day in the report period');
assert.strictEqual(snapshot.sections.court.weekdayRows.filter(row => row.label === '周四').length, 1, 'weekly report should aggregate duplicate weekdays in an eight-day period');
assert.strictEqual(snapshot.sections.court.weekdayRows.find(row => row.label === '周四')?.value, 51, 'duplicate weekday utilization should use the real trend average');
assert.strictEqual(snapshot.sections.revenue.course.consumedAmount, 3200, 'course consumed amount must use course recognized revenue only');
assert.strictEqual(snapshot.sections.conversion.sourceRows.find(row => row.source === '小红书')?.deals, 2, 'weekly report should keep source conversion data');

const requestedStructureSnapshot = buildWeeklyBusinessReportSnapshot({
  period,
  operationsPayload: {
    operations: {
      overview: { cards: { totalIncome: { value: 999999 }, recognizedRevenue: { value: 999999 } } },
      court: { cards: { utilizationRate: { value: 128 } } },
      coach: { cards: { usedHours: { value: 999 } } }
    },
    weeklyReportRaw: {
      coaches: [{ name: '朝珺', status: '在职' }],
      students: [
        { id: 'adult-student', name: '成人学员', type: '成人', campus: 'shunyi_mapo' },
        { id: 'youth-student', name: '青少年学员', type: '青少年', campus: 'shunyi_mapo' }
      ],
      purchases: [
        { id: 'adult-purchase', studentId: 'adult-student', studentName: '成人学员', courseType: '私教课', amountPaid: 1000, purchaseDate: '2026-08-28', status: 'active', firstPurchase: true, campus: 'shunyi_mapo' },
        { id: 'youth-purchase', studentId: 'youth-student', studentName: '青少年学员', courseType: '青少年私教课', amountPaid: 2000, purchaseDate: '2026-08-29', status: 'active', firstPurchase: true, campus: 'shunyi_mapo' }
      ],
      schedule: [
        { id: 'adult-lesson', coach: '朝珺教练', studentId: 'adult-student', studentName: '成人学员', courseType: '私教课', startTime: '2026-08-28 10:00:00', endTime: '2026-08-28 11:00:00', status: '已结束', campus: 'shunyi_mapo' },
        { id: 'youth-lesson', coach: '朝珺教练', studentId: 'youth-student', studentName: '青少年学员', courseType: '青少年私教课', startTime: '2026-08-29 10:00:00', endTime: '2026-08-29 12:00:00', status: '已结束', campus: 'shunyi_mapo' }
      ],
      financeNormalizedRows: [
        { id: 'adult-receipt', campusName: '顺义马坡', studentId: 'adult-student', customerType: '成人', businessDate: '2026-08-28', businessType: '课程', action: '收款', cashDelta: 1000, recognizedRevenueDelta: 0, sourceDocument: '购买记录 adult-purchase' },
        { id: 'youth-receipt', campusName: '顺义马坡', studentId: 'youth-student', customerType: '青少年', businessDate: '2026-08-29', businessType: '课程', action: '收款', cashDelta: 2000, recognizedRevenueDelta: 0, sourceDocument: '购买记录 youth-purchase' },
        { id: 'adult-consume', campusName: '顺义马坡', studentId: 'adult-student', customerType: '成人', businessDate: '2026-08-30', businessType: '课程', action: '消耗', cashDelta: 0, recognizedRevenueDelta: 400, sourceDocument: '排课 adult-lesson' },
        { id: 'youth-consume', campusName: '顺义马坡', studentId: 'youth-student', customerType: '青少年', businessDate: '2026-08-30', businessType: '课程', action: '消耗', cashDelta: 0, recognizedRevenueDelta: 600, sourceDocument: '排课 youth-lesson' },
        { id: 'member-receipt', campusName: '顺义马坡', businessDate: '2026-08-30', businessType: '会员储值', action: '收款', cashDelta: 5000, recognizedRevenueDelta: 0 },
        { id: 'guest-booking', campusName: '顺义马坡', businessDate: '2026-09-01', businessType: '散客订场', displayBusinessType: '场地 / 散客订场', action: '收款', cashDelta: 180, recognizedRevenueDelta: 180, durationHours: 70 },
        { id: 'member-booking', campusName: '顺义马坡', businessDate: '2026-09-01', businessType: '会员订场', displayBusinessType: '场地 / 会员订场', action: '已入账', cashDelta: 0, recognizedRevenueDelta: 120, durationHours: 1 },
        { id: 'leader-booking', campusName: '顺义马坡', businessDate: '2026-09-01', businessType: '领导订场', displayBusinessType: '场地 / 领导订场', action: '已入账', cashDelta: 0, recognizedRevenueDelta: 0, durationHours: 30 },
        { id: 'internal-booking', campusName: '顺义马坡', businessDate: '2026-09-01', businessType: '内部使用', displayBusinessType: '场地 / 内部使用', action: '已入账', cashDelta: 0, recognizedRevenueDelta: 0, durationHours: 20 }
      ]
    }
  },
  previousOperationsPayload: {
    operations: {
      overview: { cards: { totalIncome: { value: 111111 }, recognizedRevenue: { value: 111111 } } },
      court: { cards: { utilizationRate: { value: 128 } } },
      coach: { cards: { usedHours: { value: 1 } } }
    },
    weeklyReportRaw: {
      coaches: [{ name: '朝珺', status: '在职' }],
      students: [{ id: 'prev-student', name: '上周学员', type: '成人', campus: 'shunyi_mapo' }],
      purchases: [{ id: 'prev-purchase', studentId: 'prev-student', studentName: '上周学员', courseType: '私教课', amountPaid: 1000, purchaseDate: '2026-08-20', status: 'active', firstPurchase: true, campus: 'shunyi_mapo' }],
      schedule: [{ id: 'prev-lesson', coach: '朝珺教练', studentId: 'prev-student', studentName: '上周学员', courseType: '私教课', startTime: '2026-08-20 10:00:00', endTime: '2026-08-20 11:00:00', status: '已结束', campus: 'shunyi_mapo' }],
      financeNormalizedRows: [
        { id: 'prev-receipt', campusName: '顺义马坡', studentId: 'prev-student', customerType: '成人', businessDate: '2026-08-20', businessType: '课程', action: '收款', cashDelta: 1000, recognizedRevenueDelta: 0, sourceDocument: '购买记录 prev-purchase' },
        { id: 'prev-consume', campusName: '顺义马坡', studentId: 'prev-student', customerType: '成人', businessDate: '2026-08-20', businessType: '课程', action: '消耗', cashDelta: 0, recognizedRevenueDelta: 500, sourceDocument: '排课 prev-lesson' },
        { id: 'prev-member-receipt', campusName: '顺义马坡', businessDate: '2026-08-21', businessType: '会员储值', action: '收款', cashDelta: 2000, recognizedRevenueDelta: 0 },
        { id: 'prev-guest-booking', campusName: '顺义马坡', businessDate: '2026-08-22', businessType: '散客订场', displayBusinessType: '场地 / 散客订场', action: '收款', cashDelta: 100, recognizedRevenueDelta: 100, durationHours: 1 }
      ]
    }
  },
  shareToken: 'token-requested-structure',
  baseUrl: 'https://www.flowtennis.cn'
});
assert.strictEqual(requestedStructureSnapshot.summary.totalIncome.value, 1300, 'weekly business revenue should use recognized revenue from finance rows instead of stale overview total income');
assert.strictEqual(requestedStructureSnapshot.summary.cashReceived.value, 8180, 'weekly cash received should use finance row cashDelta receipts');
assert.strictEqual(requestedStructureSnapshot.sections.revenue.receipts.totalAmount, 8180, 'receipt cards should expose total weekly cash received');
assert.strictEqual(requestedStructureSnapshot.sections.revenue.receipts.courseAmount, 3000, 'receipt cards should expose weekly course receipts');
assert.strictEqual(requestedStructureSnapshot.sections.revenue.receipts.bookingAmount, 180, 'receipt cards should expose weekly guest booking receipts');
assert.strictEqual(requestedStructureSnapshot.sections.revenue.receipts.storedValueAmount, 5000, 'receipt cards should expose weekly stored value receipts');
assert.strictEqual(requestedStructureSnapshot.sections.revenue.recognized.businessRevenue, 1300, 'recognized cards should expose completed-service business revenue');
assert.strictEqual(requestedStructureSnapshot.sections.revenue.recognized.courseConsumedRevenue, 1000, 'recognized cards should expose course consumed revenue');
assert.strictEqual(requestedStructureSnapshot.sections.revenue.recognized.memberBookingConsumedRevenue, 120, 'recognized cards should expose member booking consumed revenue');
assert.strictEqual(requestedStructureSnapshot.sections.revenue.recognized.guestBookingRevenue, 180, 'recognized cards should expose guest booking revenue');
assert.strictEqual(requestedStructureSnapshot.sections.revenue.course.lessonPeople, 2, 'course section should expose weekly completed lesson people');
assert.strictEqual(requestedStructureSnapshot.sections.revenue.course.completedHours, 3, 'course section should expose weekly completed coach course hours');
assert.strictEqual(requestedStructureSnapshot.sections.revenue.course.typeRows.find(row => row.type === '成人')?.newAmount, 1000, 'adult course row should use current-week platform receipt facts');
assert.strictEqual(requestedStructureSnapshot.sections.revenue.course.typeRows.find(row => row.type === '青少年')?.completedHours, 2, 'youth course row should use current-week completed schedule facts');
assert.strictEqual(requestedStructureSnapshot.sections.court.revenueUsageHours, 71, 'paid utilization hours should exclude internal use and leader bookings');
assert.strictEqual(requestedStructureSnapshot.sections.court.dailyRows.find(row => row.date === '2026-09-01')?.value, 100, 'daily court utilization should be capped at 100%');
assert.ok(requestedStructureSnapshot.summary.courtUtilizationRate.value <= 100, 'top court utilization must never exceed 100%');

const noFakeSourceSnapshot = buildWeeklyBusinessReportSnapshot({
  period,
  operationsPayload: {
    operations: {
      overview: { cards: { totalIncome: { value: 1 } } },
      court: { cards: { activeVenues: { value: 99 }, bookingHours: { value: 5 } } },
      coach: { rows: [{ coach: '反例教练', lessonCount: 68, courseMix: [{ type: '私教课', hours: 70 }, { type: '小班课', hours: 7.5 }, { type: '体验课', hours: 2 }, { type: '陪打', hours: 1.5 }] }] }
    }
  },
  previousOperationsPayload: { operations: {} },
  shareToken: 'token-negative',
  baseUrl: 'https://www.flowtennis.cn'
});
assert.strictEqual(noFakeSourceSnapshot.sections.revenue.course.totalPeople, null, 'weekly report must not borrow conversion data as course income people');
assert.strictEqual(noFakeSourceSnapshot.sections.court.totalAvailableHours, null, 'weekly report must not invent court capacity from active venue count');
assert.deepStrictEqual(noFakeSourceSnapshot.sections.court.usageRows.map(row => row.hours), [0, 0, 0, 0, 0, 0], 'weekly report must not fake guest usage when type mix rows are missing');
assert.strictEqual(noFakeSourceSnapshot.sections.coach.totalScheduled, 81, 'coach scheduled hours must equal all listed course type hours even when lessonCount conflicts');

const financeOnlyCourtSnapshot = buildWeeklyBusinessReportSnapshot({
  period,
  operationsPayload: {
    operations: { overview: { cards: { totalIncome: { value: 1 } } } },
    weeklyReportRaw: {
      financeNormalizedRows: [
        { id: 'finance-only-member', businessDate: '2026-08-28', businessType: '会员订场', displayBusinessType: '场地 / 会员订场', cashDelta: 0, recognizedRevenueDelta: 88, timeText: '09:00-10:00' },
        { id: 'finance-only-match', businessDate: '2026-08-28', businessType: '约球局', displayBusinessType: '场地 / 约球局', cashDelta: 120, recognizedRevenueDelta: 120, timeText: '10:00-11:30' },
        { id: 'other-campus-guest', campusName: '其他校区', businessDate: '2026-08-28', businessType: '散客订场', displayBusinessType: '场地 / 散客订场', cashDelta: 999, recognizedRevenueDelta: 999, timeText: '12:00-13:00' }
      ]
    }
  },
  previousOperationsPayload: { operations: {} },
  shareToken: 'token-finance-only',
  baseUrl: 'https://www.flowtennis.cn'
});
assert.strictEqual(financeOnlyCourtSnapshot.sections.court.usageRows.find(row => row.key === 'member')?.hours, 1, 'weekly report should count member booking hours from finance rows even when court history is absent');
assert.strictEqual(financeOnlyCourtSnapshot.sections.court.usageRows.find(row => row.key === 'member')?.amount, 88, 'weekly report should count member booking recognized revenue from finance rows even when court history is absent');
assert.strictEqual(financeOnlyCourtSnapshot.sections.court.usageRows.find(row => row.key === 'match')?.hours, 1.5, 'weekly report should keep match booking as an independent standard court type from finance rows');
assert.strictEqual(financeOnlyCourtSnapshot.sections.court.actualUsedHours, 2.5, 'weekly report should expose total court usage hours from finance-only court rows');

const rawSnapshot = buildWeeklyBusinessReportSnapshot({
  period,
  operationsPayload: {
    operations: {
      overview: { cards: { totalIncome: { value: 50000 }, recognizedRevenue: { value: 1600 } } },
      court: { cards: { utilizationRate: { value: 1 } }, trends: [] },
      coach: { cards: { usedHours: { value: 999 } } },
      conversion: {
        cards: { totalLeads: { value: 7 }, trialPathDealCustomers: { value: 0 }, trialPathStudents: { value: 1 } },
        sourceRows: [{ source: '转介绍', totalLeads: 2, trialAttended: 0, trialPathDealCustomers: 1 }]
      }
    },
    weeklyReportRaw: {
      coaches: [
        { name: '朝珺', status: '在职' },
        { name: '小鹿', status: '在职' },
        { name: '宋教练', status: '离职' }
      ],
      purchases: [
        { id: 'old-private', studentId: 'stu-a', courseType: '私教课', amountPaid: 1000, purchaseDate: '2026-08-20', status: 'active', campus: 'shunyi_mapo' },
        { id: 'first-private', studentId: 'stu-b', courseType: '私教课', amountPaid: 2000, purchaseDate: '2026-08-28', status: 'active', firstPurchase: true, campus: 'shunyi_mapo' },
        { id: 'renew-private', studentId: 'stu-a', courseType: '私教课', amountPaid: 3000, purchaseDate: '2026-08-29', status: 'active', firstPurchase: false, campus: 'shunyi_mapo' },
        { id: 'trial-ignore', studentId: 'stu-c', courseType: '私教体验课', amountPaid: 900, purchaseDate: '2026-08-29', status: 'active', campus: 'shunyi_mapo' }
      ],
      entitlements: [{ id: 'ent-a', studentId: 'stu-a', remainingLessons: 0, depletedAt: '2026-09-01', campus: 'shunyi_mapo' }],
      financeNormalizedRows: [
        { id: 'consume-a', businessDate: '2026-08-30', businessType: '课程', action: '消耗', recognizedRevenueDelta: 600 },
        { id: 'guest-finance-a', businessDate: '2026-08-30', businessType: '散客订场', displayBusinessType: '场地 / 散客订场', cashDelta: 180, recognizedRevenueDelta: 180, startTime: '10:00', endTime: '11:00' },
        { id: 'member-finance-a', businessDate: '2026-08-31', businessType: '会员订场', displayBusinessType: '场地 / 会员订场', cashDelta: 0, recognizedRevenueDelta: 120, timeText: '11:00-12:30' },
        { id: 'course-finance-a', businessDate: '2026-08-31', businessType: '课程订场', displayBusinessType: '场地 / 课程订场', cashDelta: 0, recognizedRevenueDelta: 0, timeText: '12:30-13:30' },
        { id: 'leader-finance-a', businessDate: '2026-09-01', businessType: '领导订场', displayBusinessType: '场地 / 领导订场', cashDelta: 0, recognizedRevenueDelta: 0, timeText: '13:30-14:30' },
        { id: 'internal-finance-a', businessDate: '2026-09-01', businessType: '内部使用', displayBusinessType: '场地 / 内部使用', cashDelta: 0, recognizedRevenueDelta: 0, timeText: '14:30-15:30' },
        { id: 'match-finance-a', businessDate: '2026-09-02', businessType: '约球局', displayBusinessType: '场地 / 约球局', cashDelta: 200, recognizedRevenueDelta: 200, timeText: '15:30-17:00' }
      ],
      membershipAccounts: [
        { id: 'member-account-a', courtId: 'court-member-a', status: 'active', createdAt: '2026-08-01' },
        { id: 'member-account-b', courtId: 'court-member-b', status: 'active', createdAt: '2026-08-28' },
        { id: 'member-account-voided', courtId: 'court-voided', status: 'voided', createdAt: '2026-08-28' }
      ],
      membershipOrders: [
        { id: 'member-order-a', membershipAccountId: 'member-account-a', courtId: 'court-member-a', status: 'active', rechargeAmount: 1000, purchaseDate: '2026-08-01' },
        { id: 'member-order-b', membershipAccountId: 'member-account-b', courtId: 'court-member-b', status: 'active', rechargeAmount: 2000, purchaseDate: '2026-08-28' },
        { id: 'member-order-voided', membershipAccountId: 'member-account-voided', courtId: 'court-voided', status: 'voided', rechargeAmount: 9999, purchaseDate: '2026-08-28' }
      ],
      schedule: [
        { id: 'coach-current', coach: '朝珺教练', courseType: '私教课', startTime: '2026-08-28 10:00:00', endTime: '2026-08-28 12:00:00', status: '已排课', campus: 'shunyi_mapo' },
        { id: 'dirty-current', coach: '小鹿教练', lessonCount: 2, startTime: '2026-08-28 10:00:00', endTime: '2026-08-28 12:00:00', status: '已排课', campus: 'shunyi_mapo' },
        { id: 'coach-prev', coach: '朝珺教练', courseType: '私教课', startTime: '2026-08-20 10:00:00', endTime: '2026-08-20 11:00:00', status: '已排课', campus: 'shunyi_mapo' },
        { id: 'inactive-coach', coach: '宋教练', courseType: '私教课', startTime: '2026-08-28 12:00:00', endTime: '2026-08-28 13:00:00', status: '已排课', campus: 'shunyi_mapo' }
      ],
      courts: [
        { id: 'court-member-a', campus: 'shunyi_mapo', history: [] },
        { id: 'court-member-b', campus: 'shunyi_mapo', history: [] },
        { id: 'court-a', campus: 'shunyi_mapo', history: [{ id: 'guest-booking', type: '消费', category: '散客订场', date: '2026-08-28', startTime: '2026-08-28 08:00:00', endTime: '2026-08-28 09:00:00', amount: 100 }] },
        { id: 'court-b', campus: 'shunyi_mapo', history: [{ id: 'free-use', type: '消费', category: '内部使用', date: '2026-08-29', startTime: '2026-08-29 08:00:00', endTime: '2026-08-29 10:00:00', amount: 200 }] }
      ]
    }
  },
  previousOperationsPayload: {
    operations: { overview: { cards: { totalIncome: { value: 1 } } }, conversion: { sourceRows: [{ source: '转介绍', totalLeads: 1, trialPathDealCustomers: 0 }] } },
    weeklyReportRaw: {
      coaches: [{ name: '朝珺', status: 'active' }],
      purchases: [{ id: 'prev-first', studentId: 'stu-prev', courseType: '私教课', amountPaid: 800, purchaseDate: '2026-08-20', status: 'active', firstPurchase: true, campus: 'shunyi_mapo' }],
      financeNormalizedRows: [{ id: 'prev-consume', businessDate: '2026-08-20', businessType: '课程', action: '消耗', recognizedRevenueDelta: 300 }],
      schedule: [{ id: 'coach-prev-only', coach: '朝珺教练', courseType: '私教课', startTime: '2026-08-20 10:00:00', endTime: '2026-08-20 11:00:00', status: '已排课', campus: 'shunyi_mapo' }],
      courts: []
    }
  },
  shareToken: 'token-raw',
  baseUrl: 'https://www.flowtennis.cn'
});
assert.strictEqual(rawSnapshot.sections.revenue.course.totalPeople, 2, 'course total people should count private package buyers');
assert.strictEqual(rawSnapshot.sections.revenue.course.totalAmount, 6000, 'course total amount should sum private package purchases');
assert.strictEqual(rawSnapshot.sections.revenue.course.newPeople, 1, 'course new people should count first private package purchases in period');
assert.strictEqual(rawSnapshot.sections.revenue.course.newAmount, 5000, 'course new amount should include first and renewal private package payments in period');
assert.strictEqual(rawSnapshot.sections.revenue.course.renewalPeople, 1, 'course renewal people should count non-first private package purchases');
assert.strictEqual(rawSnapshot.sections.revenue.course.renewalAmount, 3000, 'course renewal amount should sum non-first private package payments');
assert.strictEqual(rawSnapshot.sections.revenue.course.consumedAmount, 600, 'course consumed amount should come from course consume finance rows');
assert.strictEqual(rawSnapshot.sections.revenue.course.expiringPeople, 1, 'course depleted people should count depleted package holders in period');
assert.strictEqual(rawSnapshot.sections.revenue.storedValue.totalMembers, 2, 'stored value report should count active membership accounts from the membership read source');
assert.strictEqual(rawSnapshot.sections.revenue.storedValue.newMembers, 1, 'stored value report should count new active membership accounts in the report period');
assert.strictEqual(rawSnapshot.sections.revenue.storedValue.totalAmount, 3000, 'stored value report should sum valid membership orders');
assert.strictEqual(rawSnapshot.sections.revenue.storedValue.newAmount, 2000, 'stored value report should sum valid membership orders in the report period');
assert.strictEqual(rawSnapshot.sections.court.totalAvailableHours, 448, 'court available hours should use 4 courts * 14 hours * every date in the report period');
assert.strictEqual(rawSnapshot.sections.court.usageRows.find(row => row.key === 'guest')?.amount, 100, 'court history should remain the first source for guest booking amount');
assert.strictEqual(rawSnapshot.sections.court.usageRows.find(row => row.key === 'member')?.amount, 120, 'court finance rows should backfill member booking amount when court history is missing');
assert.strictEqual(rawSnapshot.sections.court.usageRows.find(row => row.key === 'member')?.count, 1, 'court finance rows should backfill member booking count when court history is missing');
assert.strictEqual(rawSnapshot.sections.court.usageRows.find(row => row.key === 'member')?.hours, 1.5, 'court finance rows should backfill member booking hours when court history is missing');
assert.strictEqual(rawSnapshot.sections.court.usageRows.map(row => row.label).join('|'), '会员订场|散客订场|课程订场|领导订场|内部使用|约球局', 'weekly report should display the six standard court booking types');
assert.strictEqual(rawSnapshot.sections.court.usageRows.find(row => row.key === 'course')?.hours, 1, 'course court usage should come from court booking facts, not ordinary schedule rows');
assert.strictEqual(rawSnapshot.sections.court.actualUsedHours, 8, 'ordinary coach schedule rows should not inflate weekly court usage hours');
assert.strictEqual(rawSnapshot.sections.court.utilizationRate, 1.12, 'court utilization should use paid court usage facts divided by actual report-period capacity');
assert.strictEqual(rawSnapshot.sections.court.usageRows.find(row => row.key === 'free')?.amount, 0, 'free court usage actual amount should be zero');
assert.strictEqual(rawSnapshot.summary.courtUsageHours.value, rawSnapshot.sections.court.actualUsedHours, 'weekly report list summary should expose court usage hours from report sections');
assert.strictEqual(rawSnapshot.sections.coach.rows.length, 1, 'coach report should only show active coaches with current-period schedules');
assert.strictEqual(rawSnapshot.sections.coach.rows[0].coach, '朝珺教练', 'inactive and no-schedule coaches should be excluded from coach report');
assert.strictEqual(rawSnapshot.sections.coach.rows[0].scheduledCount, 2, 'coach current scheduled column should use current week hours');
assert.strictEqual(rawSnapshot.sections.coach.rows[0].previousHours, 1, 'coach current/previous column should include previous week hours');
assert.strictEqual(rawSnapshot.sections.conversion.trialDeals, 1, 'conversion top trial deals should equal source row total');
assert.ok(rawSnapshot.sections.conversion.sourceRows.find(row => row.source === '抖音' && row.leads === 0), 'conversion source table should include standard zero-value sources');

const storedValueReadModelSnapshot = buildWeeklyBusinessReportSnapshot({
  period,
  operationsPayload: {
    operations: {
      overview: { cards: { totalIncome: { value: 1 } } }
    },
    weeklyReportRaw: {
      campuses: [{ code: 'shunyi_mapo', name: '顺义马坡' }],
      courts: [
        { id: 'court-active-old', name: '老会员', campus: 'shunyi_mapo', status: 'active', history: [{ type: '消费', amount: 180, payMethod: '储值扣款', category: '订场', date: '2026-08-28', startTime: '10:00', endTime: '11:00' }] },
        { id: 'court-active-new', name: '新会员', campus: 'shunyi_mapo', status: 'active', history: [{ type: '消费', amount: 220, payMethod: '储值卡', category: '订场', date: '2026-09-01', startTime: '11:00', endTime: '12:00' }] },
        { id: 'court-inactive', name: '停用会员', campus: 'shunyi_mapo', status: 'inactive', history: [] },
        { id: 'court-blank-campus', name: '空校区会员', status: 'active', history: [] }
      ],
      membershipAccounts: [
        { id: 'account-old', courtId: 'court-active-old', status: 'active', createdAt: '2026-07-01' },
        { id: 'account-new', courtId: 'court-active-new', status: 'active', createdAt: '2026-08-28' },
        { id: 'account-inactive-court', courtId: 'court-inactive', status: 'active', createdAt: '2026-08-28' },
        { id: 'account-orphan', courtId: 'court-missing', status: 'active', createdAt: '2026-08-28' },
        { id: 'account-blank-campus', courtId: 'court-blank-campus', status: 'active', createdAt: '2026-08-28' }
      ],
      membershipOrders: [
        { id: 'order-old', membershipAccountId: 'account-old', courtId: 'court-active-old', status: 'active', rechargeAmount: 2000, purchaseDate: '2026-07-01' },
        { id: 'order-old-renewal', membershipAccountId: 'account-old', courtId: 'court-active-old', status: 'active', rechargeAmount: 2000, purchaseDate: '2026-08-29' },
        { id: 'order-new', membershipAccountId: 'account-new', courtId: 'court-active-new', status: 'active', rechargeAmount: 3000, purchaseDate: '2026-08-28' },
        { id: 'order-inactive-court', membershipAccountId: 'account-inactive-court', courtId: 'court-inactive', status: 'active', rechargeAmount: 9999, purchaseDate: '2026-08-28' },
        { id: 'order-orphan', membershipAccountId: 'account-orphan', courtId: 'court-missing', status: 'active', rechargeAmount: 9999, purchaseDate: '2026-08-28' },
        { id: 'order-blank-campus', membershipAccountId: 'account-blank-campus', courtId: 'court-blank-campus', status: 'active', rechargeAmount: 9999, purchaseDate: '2026-08-28' }
      ],
      financeNormalizedRows: [
        { id: 'member-use', campusName: '顺义马坡', businessDate: '2026-08-28', businessType: '会员订场', action: '已入账', recognizedRevenueDelta: 500 },
        { id: 'member-refund', campusName: '顺义马坡', businessDate: '2026-09-01', businessType: '会员订场', action: '回退', recognizedRevenueDelta: -100 },
        { id: 'other-campus-member-use', campusName: '国网中心', businessDate: '2026-09-01', businessType: '会员订场', action: '已入账', recognizedRevenueDelta: 9999 }
      ]
    }
  },
  previousOperationsPayload: {
    operations: { overview: { cards: { totalIncome: { value: 1 } } } },
    weeklyReportRaw: {
      campuses: [{ code: 'shunyi_mapo', name: '顺义马坡' }],
      courts: [
        { id: 'court-active-old', name: '老会员', campus: 'shunyi_mapo', status: 'active', history: [{ type: '消费', amount: 80, payMethod: '储值扣款', category: '订场', date: '2026-08-20', startTime: '10:00', endTime: '11:00' }] }
      ],
      membershipAccounts: [{ id: 'account-old', courtId: 'court-active-old', status: 'active', createdAt: '2026-07-01' }],
      membershipOrders: [{ id: 'order-old', membershipAccountId: 'account-old', courtId: 'court-active-old', status: 'active', rechargeAmount: 2000, purchaseDate: '2026-07-01' }],
      financeNormalizedRows: [
        { id: 'previous-member-use', campusName: '顺义马坡', businessDate: '2026-08-20', businessType: '会员订场', action: '已入账', recognizedRevenueDelta: 80 }
      ]
    }
  },
  shareToken: 'token-stored-value-read-model',
  baseUrl: 'https://www.flowtennis.cn'
});
assert.strictEqual(storedValueReadModelSnapshot.sections.revenue.storedValue.totalMembers, 2, 'stored value report should use the membership page read model member count and exclude inactive/orphan courts');
assert.strictEqual(storedValueReadModelSnapshot.sections.revenue.storedValue.totalAmount, 7000, 'stored value report should use the membership page read model paid amount and exclude inactive/orphan orders');
assert.strictEqual(storedValueReadModelSnapshot.sections.revenue.storedValue.newMembers, 1, 'stored value report should count newly opened members, not renewal orders in the week');
assert.strictEqual(storedValueReadModelSnapshot.sections.revenue.storedValue.redeemedAmount, 400, 'stored value report should expose current-week stored value redemption amount');
assert.deepStrictEqual(storedValueReadModelSnapshot.sections.revenue.storedValue.newMemberRows.map(row => row.name), ['新会员'], 'stored value report should expose current-week new member details');
const storedValueHtml = renderWeeklyBusinessReportHtml(storedValueReadModelSnapshot);
assert.match(storedValueHtml, /总储值金额[\s\S]*本周新增会员[\s\S]*本周充值收款[\s\S]*本周订场消耗收入/, 'stored value metrics should keep member totals and add weekly recharge and redemption metrics');
assert.match(storedValueHtml, /本周新增会员明细[\s\S]*新会员/, 'stored value chart area should be replaced by current-week new member details');
assert.doesNotMatch(storedValueHtml, /storedValue\.donut|storedValue\.progress/, 'stored value section should not render the old two charts');

const storedValueIndexSnapshot = buildWeeklyBusinessReportSnapshot({
  period,
  operationsPayload: {
    operations: { overview: { cards: { totalIncome: { value: 1 } } } },
    weeklyReportRaw: {
      campuses: [{ code: 'shunyi_mapo', name: '顺义马坡' }],
      courts: [
        { id: 'court-index-old', name: '索引老会员', campus: 'shunyi_mapo', status: 'active', cachedTotalDeposit: 2000 },
        { id: 'court-index-new', name: '索引新会员', campus: 'shunyi_mapo', status: 'active', cachedTotalDeposit: 3000 }
      ],
      courtAccountListIndexRows: [
        {
          id: 'court-index-old',
          courtId: 'court-index-old',
          item: {
            id: 'court-index-old',
            displayName: '索引老会员',
            campusCode: 'shunyi_mapo',
            accountType: '会员账户',
            membershipStatusCode: 'active',
            firstOpenDate: '2026-07-01',
            membershipAccount: { id: 'account-index-old', courtId: 'court-index-old' },
            totalDeposit: 2000,
            balance: 1600
          },
          bookingDayStats: [{ date: '2026-08-28', bookingCount: 1, bookingHours: 1.5, bookingAmount: 180, memberBookingCount: 1, memberBookingAmount: 180 }],
          membershipFinanceStats: { memberCount: 1, paidAmount: 2000, bonusAmount: 0, consumableAmount: 2000, pendingAmount: 1600 }
        },
        {
          id: 'court-index-new',
          courtId: 'court-index-new',
          item: {
            id: 'court-index-new',
            displayName: '索引新会员',
            campusCode: 'shunyi_mapo',
            accountType: '会员账户',
            membershipStatusCode: 'active',
            firstOpenDate: '2026-08-28',
            membershipAccount: { id: 'account-index-new', courtId: 'court-index-new' },
            totalDeposit: 3000,
            balance: 2800
          },
          bookingDayStats: [{ date: '2026-09-01', bookingCount: 1, bookingHours: 1, bookingAmount: 120, memberBookingCount: 1, memberBookingAmount: 120 }],
          membershipFinanceStats: { memberCount: 1, paidAmount: 3000, bonusAmount: 0, consumableAmount: 3000, pendingAmount: 2800 }
        }
      ],
      membershipAccounts: [
        { id: 'account-index-old', courtId: 'court-index-old', status: 'active', createdAt: '2026-07-01' },
        { id: 'account-index-new', courtId: 'court-index-new', status: 'active', createdAt: '2026-08-28' }
      ],
      membershipOrders: [
        { id: 'order-index-old', membershipAccountId: 'account-index-old', courtId: 'court-index-old', status: 'active', rechargeAmount: 2000, purchaseDate: '2026-07-01' },
        { id: 'order-index-new', membershipAccountId: 'account-index-new', courtId: 'court-index-new', status: 'active', rechargeAmount: 3000, purchaseDate: '2026-08-28' }
      ]
    }
  },
  previousOperationsPayload: { operations: { overview: { cards: { totalIncome: { value: 1 } } } }, weeklyReportRaw: { courtAccountListIndexRows: [] } },
  shareToken: 'token-stored-value-index',
  baseUrl: 'https://www.flowtennis.cn'
});
assert.strictEqual(storedValueIndexSnapshot.sections.revenue.storedValue.totalMembers, 2, 'stored value report should use the court account list index when court history is not loaded');
assert.strictEqual(storedValueIndexSnapshot.sections.revenue.storedValue.totalAmount, 5000, 'stored value report should keep indexed membership paid amount without scanning court history');
assert.strictEqual(storedValueIndexSnapshot.sections.revenue.storedValue.newMembers, 1, 'stored value report should still count newly opened members from light membership rows');
assert.strictEqual(storedValueIndexSnapshot.sections.revenue.storedValue.newAmount, 3000, 'stored value report should still show current-week new member recharge amount from membership orders');
assert.strictEqual(storedValueIndexSnapshot.sections.revenue.storedValue.redeemedAmount, 300, 'stored value report should fall back to indexed member booking amount for current-week redemption');
assert.strictEqual(storedValueIndexSnapshot.sections.court.usageRows.find(row => row.key === 'member')?.hours, 2.5, 'court usage should use indexed member booking hours when court history is not loaded');

const html = renderWeeklyBusinessReportHtml(snapshot, { remark: '本周雨天影响场地。' });
assert.match(html, /顺义马坡周报/, 'HTML should render the report title');
assert.match(html, /2026-08-27 - 2026-09-03（第 36 周）/, 'HTML should render the period week number in the top-right date pill');
assert.doesNotMatch(html, /<p class="hero-copy">2026-08-27 至 2026-09-03/, 'HTML should not repeat the period below the report title');
assert.match(html, /一、经营趋势/, 'HTML should render trend section');
assert.match(html, /二、收入与收款/, 'HTML should render revenue and receipt section');
assert.match(html, /三、教练经营/, 'HTML should render coach section');
assert.match(html, /四、场地经营/, 'HTML should render court section');
assert.match(html, /五、线索转化/, 'HTML should render lead conversion section');
assert.match(html, /专项课/, 'HTML should render special course coach metric');
assert.match(html, /donut|bar-row|cohort-cell/, 'HTML should render report charts');
assert.match(html, /cdn\.tailwindcss\.com[\s\S]*fontFamily[\s\S]*cyber:[\s\S]*volt: '#7CFF44'/, 'weekly report must load and reuse the provided cyber analytics template tokens');
assert.match(html, /<body class="bg-grid-pattern text-white font-sans min-h-screen antialiased flex flex-col pb-16">/, 'weekly report body should reuse the provided template shell classes');
assert.match(html, /<header data-section="global-header" class="border-b border-cyber-border bg-cyber-black\/95 sticky top-0 z-50 backdrop-blur-md">/, 'weekly report header should reuse the provided template header structure');
assert.match(html, /<nav class="hidden md:flex items-center space-x-1 bg-black\/40 p-1 rounded-lg border border-cyber-border"[\s\S]*href="#overview"[\s\S]*Dashboard[\s\S]*href="#revenue"[\s\S]*Revenue[\s\S]*href="#private-course"[\s\S]*Private Course[\s\S]*href="#court"[\s\S]*Court Usage[\s\S]*href="#coach"[\s\S]*Coach/, 'top navigation should mirror the template segmented menu and jump to report sections');
assert.match(html, /data-section="top-kpi-cards" class="lg:col-span-5 grid grid-cols-3 gap-4 bg-cyber-card p-5 rounded-xl border border-cyber-border"[\s\S]*总收入[\s\S]*text-3xl font-mono font-bold text-white tracking-tight[\s\S]*总场地利用率[\s\S]*text-3xl font-mono font-bold text-white tracking-tight[\s\S]*总私教课人数[\s\S]*text-3xl font-mono font-bold text-white tracking-tight/, 'hero lifetime metrics should use the template large right-side KPI card');
assert.match(html, /flex flex-wrap gap-3 pt-2[\s\S]*营业收入[\s\S]*本周收款[\s\S]*场地利用率[\s\S]*完成课时[\s\S]*上周/, 'weekly summary metrics should use the requested four metrics with previous-week comparison');
assert.match(html, /data-section="court-utilization-heatmap"[\s\S]*\/\/ COURT UTILIZATION HEATMAP[\s\S]*每天利用率[\s\S]*<th class="py-2 text-left font-sans"[\s\S]*日期[\s\S]*08\.27[\s\S]*09\.03[\s\S]*cohort-cell[\s\S]*41%[\s\S]*72%[\s\S]*61%/, 'daily court utilization should render as a date heatmap with real daily values');
assert.doesNotMatch(html, /USER RETENTION MATRIX|核心客群生命周期存留分析|起始批次|Cohort|>W1<|>W5</, 'daily court utilization must not keep retention cohort wording');
assert.doesNotMatch(html, /\[contenteditable=true\]\{outline:/, 'editable elements must not show dashed outlines by default');
assert.match(html, /\[data-editable="true"\]:hover,\[data-editable="true"\]:focus\{[\s\S]*outline:1px dashed #7CFF44/, 'editable dashed outline should only appear on hover or focus');
assert.doesNotMatch(weeklyReportSource, /buildCourtUtilizationMatrixRows|weeklyMatrixRows|Cohort|USER RETENTION MATRIX|核心客群生命周期存留分析|起始批次/, 'weekly report source must not keep the old retention matrix implementation');
assert.match(html, /chart-tooltip[\s\S]*data-tooltip/, 'charts and metrics should support hover tooltips');
assert.match(html, /contenteditable="true"[\s\S]*save-edit/, 'weekly report should support direct editing and saving');
assert.match(html, /data-edit-key="section.revenue.title"[\s\S]*data-edit-key="section.course.title"[\s\S]*data-edit-key="course.totalPeople.label"[\s\S]*data-edit-key="court.heatmap.title"[\s\S]*data-edit-key="conversion.source.0.source"/, 'weekly report should make section titles, metric labels, charts and table cells editable');
assert.match(html, /总场地利用率/, 'hero should show lifetime court utilization label');
assert.match(html, /总私教课人数/, 'hero should show lifetime private course people label');
assert.match(html, /营业收入[\s\S]*本周收款[\s\S]*场地利用率[\s\S]*完成课时/, 'top weekly metrics should use requested labels');
assert.match(html, /12,000 元/, 'numbers should use thousands separators');
assert.match(html, /会员订场[\s\S]*散客订场[\s\S]*课程订场[\s\S]*领导订场[\s\S]*内部使用[\s\S]*约球局/, 'HTML should render all standard court booking type rows');
assert.match(html, /王教练/, 'HTML should render coach data rows');
assert.match(html, /小红书/, 'HTML should render lead source rows');
assert.doesNotMatch(html, /<td>-<\/td><td>-<\/td><td>-<\/td><td>-<\/td>/, 'HTML should not render rows with all empty metric cells when source data exists');
assert.match(html, /本周雨天影响场地。/, 'HTML should render admin remark text');
assert.doesNotMatch(html, /订单ID|线索ID|流水ID/, 'HTML should not expose single-record technical detail labels');
assert.match(renderWeeklyBusinessReportHtml(noFakeSourceSnapshot), />-</, 'HTML should show a dash when a requested metric has no reliable source');
const rawHtml = renderWeeklyBusinessReportHtml(rawSnapshot);
assert.match(rawHtml, /2\.1 课程收款/, 'course income section should use the requested course receipt title');
assert.match(rawHtml, /私教课人数[\s\S]*私教课总收款[\s\S]*私教课总消耗金额/, 'private course income should show the requested total metrics');
assert.match(rawHtml, /本周购课人数[\s\S]*本周课程销售收款[\s\S]*本周上课人数[\s\S]*本周完成课时[\s\S]*本周课程消耗收入/, 'private course income should show the requested weekly metrics');
assert.match(rawHtml, /成人[\s\S]*青少年/, 'private course income should split current-week rows by adult and youth');
assert.match(rawHtml, /本周购课人数[\s\S]*2 人[\s\S]*上周 1 环比 \+100%/, 'weekly paid people should include first and renewal buyers with the requested comparison copy');
assert.doesNotMatch(rawHtml, /本周新增人数|续费收入|到期人数/, 'private course income should remove old metrics');
assert.match(rawHtml, /上周完成课时[\s\S]*本周完成课时[\s\S]*课时环比/, 'coach table should use the requested current and previous completed-hour columns');
assert.match(rawHtml, /展开上课明细/, 'each coach should expose expandable lesson details');
assert.match(rawHtml, /highlight-col/, 'coach current week schedule column should be highlighted');
assert.match(rawHtml, /上涨 100%/, 'coach comparison should render a readable percentage');
assert.doesNotMatch(rawHtml, /小鹿|宋教练|即将耗尽人数/, 'weekly report should hide coaches without current schedules, inactive coaches, and removed metrics');

const successText = buildWeeklyBusinessReportFeishuText({ snapshot, status: 'success' });
assert.match(successText, /顺义马坡周报已生成/, 'success message should be short');
assert.match(successText, /2026-08-27 至 2026-09-03/, 'success message should include period');
assert.match(successText, /https:\/\/www\.flowtennis\.cn\/weekly-reports\/token-abc/, 'success message should include share link');

const failureText = buildWeeklyBusinessReportFeishuText({ period, status: 'failure', error: '课程数据读取失败' });
assert.match(failureText, /顺义马坡周报生成失败/, 'failure message should be short');
assert.match(failureText, /课程数据读取失败/, 'failure message should include simple reason');

assert.match(apiSource, /createWeeklyBusinessReportRoutes/, 'api should mount the extracted weekly report routes');
assert.match(weeklyRoutesSource, /\/cron\/weekly-business-report/, 'api should expose the weekly report cron route');
assert.match(weeklyRoutesSource, /\/public\/weekly-business-reports\//, 'api should expose public HTML by share token');
assert.match(weeklyRoutesSource, /updateWeeklyBusinessReportPublicEdits/, 'api should expose public weekly report edit saving by share token');
assert.match(weeklyRoutesSource, /\/weekly-business-reports/, 'api should expose admin weekly report list route');
assert.match(weeklyReportSource, /includeWeeklyReportRaw:\s*false[\s\S]*dateRange:\s*\{\}[\s\S]*metricScope:\s*\{\s*campusName:\s*WEEKLY_REPORT_CAMPUS_NAME\s*\}/, 'weekly report lifetime summary should not load full raw rows during regeneration');
assert.match(weeklyReportSource, /view:\s*WEEKLY_REPORT_OPERATIONS_VIEW[\s\S]*includeWeeklyReportRaw:\s*true/, 'weekly report should use a dedicated operations snapshot scope with raw report facts');
assert.match(weeklyReportSource, /weeklyRawToBaseRows[\s\S]*baseRowsOverride[\s\S]*previousScope[\s\S]*baseRowsOverride[\s\S]*totalScope[\s\S]*baseRowsOverride/, 'weekly report regeneration should reuse one raw read for previous and lifetime metrics');
assert.match(weeklyReportSource, /loadOperationsSnapshot[\s\S]*allowRefreshing:\s*false/, 'weekly report regeneration should require current published snapshots before saving a report');
assert.match(weeklyReportSource, /allowRefreshing:\s*false/, 'manual weekly report generation must reject stale snapshots instead of serving old raw data');
assert.match(apiSource, /loadOperationsSnapshot:operationsSnapshotSync\.loadSnapshot/, 'weekly report routes should receive the operations snapshot loader');
assert.match(operationsPageSource, /baseRowsOverride = null[\s\S]*const baseRows = baseRowsOverride \|\| await loadBaseRows/, 'operations page payload should allow weekly report to reuse loaded base rows');
assert.match(apiSource, /async function buildOperationsSnapshotPayload\(\{user,scope,baseRowsOverride\}\)/, 'operations payload wrapper should pass through reusable base rows');
assert.match(apiSource, /FEISHU_WEEKLY_BUSINESS_REPORT_WEBHOOK/, 'weekly report should use a dedicated Feishu webhook env');
assert.match(weeklyWorkflow, /cron: '0 0 \* \* 5'/, 'weekly report workflow should run Friday 08:00 Beijing time');
assert.match(weeklyWorkflow, /\/api\/cron\/weekly-business-report/, 'weekly report workflow should trigger the cron endpoint');
assert.match(indexHtml, /page-weekly-reports/, 'admin shell should include the weekly report page');
assert.match(indexHtml, /pages\/weekly-reports\.js/, 'admin shell should load the weekly report page script');
assert.match(indexHtml, /weekly-reports\.js\?v=20260906-weekly-report-structure-v1/, 'admin shell should bust weekly report page script cache after structure changes');
assert.match(indexHtml, /api\.js\?v=20260904-weekly-report-share-v1/, 'admin shell should bust public weekly report share script cache');
assert.match(indexHtml, /weekly-report-share-shell[\s\S]*#loginPage\{display:none!important\}/, 'public weekly report shell should hide the login card before app scripts load');
assert.doesNotMatch(weeklyPageSource, /顺义马坡每周周报|重新生成本周周报|editWeeklyReportRemark/, 'admin weekly report list should remove the old title block, top regenerate button and remark action');
assert.match(weeklyPageSource, /周次[\s\S]*营业收入[\s\S]*本周收款[\s\S]*场地利用率[\s\S]*完成课时[\s\S]*查看[\s\S]*复制链接[\s\S]*重新生成/, 'admin weekly report list should show the requested columns and row actions');
assert.match(weeklyPageSource, /weekly-report-table[\s\S]*width:1180px[\s\S]*table-layout:fixed/, 'admin weekly report list should use compact fixed column widths');
assert.match(weeklyPageSource, /toLocaleString\('zh-CN'[\s\S]*Asia\/Shanghai/, 'admin weekly report list should format generated time in Beijing time');
assert.match(weeklyPageSource, /copyWeeklyReportLink/, 'admin page should allow copying the share link');
assert.match(weeklyPageSource, /sticky:\s*true/, 'manual regeneration should keep the loading toast visible until completion');
assert.match(weeklyPageSource, /regenerate'[\s\S]*10000/, 'manual regeneration should return success or timeout within 10 seconds');
assert.match(bootstrapSource, /'weekly-reports':'马坡周报'/, 'top page title should be renamed to Mapo weekly report');
assert.match(componentsSource, /马坡周报/, 'sidebar and mobile navigation should be renamed to Mapo weekly report');
assert.match(bootstrapSource, /options\.sticky/, 'toast helper should support sticky loading messages');
assert.doesNotMatch(weeklyPageSource, /tms-toolbar/, 'admin page should not render the removed weekly report title toolbar');
assert.match(weeklyPageSource, /width:264px[\s\S]*tms-action-link[\s\S]*重新生成/, 'admin page action column should be wide enough to show all row actions');
assert.strictEqual((stateSource.match(/renderWeeklyReports\(\)/g) || []).length, 1, 'weekly reports page should render once per page data render');
assert.match(stateSource, /currentPage==='weekly-reports'\)return/, 'weekly report admin page should not auto-refresh on focus, visibility, or interval sync');
assert.doesNotMatch(weeklyPageSource, /订单ID|线索ID|流水ID/, 'admin page should not expose single-record detail labels');
assert.doesNotMatch(publicApiSource, /login-card[\s\S]*每周周报/, 'public weekly report share page should not render a login card while loading');
assert.match(publicApiSource, /FLOWTENNIS WEEKLY/, 'public weekly report share page should render an independent public loading shell');
assert.match(weeklyRoutesSource, /PUBLIC_BASE_URL \|\| 'https:\/\/www\.flowtennis\.cn'/, 'weekly report share links should default to the public production domain');
assert.match(weeklyRoutesSource, /res\.end\(renderWeeklyBusinessReportHtml\(report/, 'public route should always render with the current report template instead of serving stale stored HTML');
assert.match(operationsPageSource, /includeWeeklyReportRaw[\s\S]*weeklyReportRaw/, 'weekly report payload should include raw source rows for report-specific metrics');
assert.match(operationsPageSource, /weeklyReportRaw: includeWeeklyReportRaw \? \{[\s\S]*membershipPlans: scoped\.membershipPlans[\s\S]*membershipBenefitLedger: scoped\.membershipBenefitLedger[\s\S]*membershipAccountEvents: scoped\.membershipAccountEvents/s, 'weekly report raw payload should include complete membership read-model inputs');
assert.match(operationsPageSource, /weeklyReportRaw: includeWeeklyReportRaw \? \{[\s\S]*courtAccountListIndexRows: baseRows\.courtAccountListIndexRows \|\| \[\]/, 'weekly report raw payload should include the court account list index rows for fast stored value metrics');
assert.match(operationsSnapshotRunnerSource, /weeklyReportScopes: argv\.includes\('--weekly-report-scopes'\)/, 'operations snapshot runner should support weekly report snapshot scopes');
assert.match(operationsSnapshotRunnerSource, /buildWeeklyReportScopeArgs[\s\S]*includeWeeklyReportRaw: true[\s\S]*includeWeeklyReportRaw: true[\s\S]*includeWeeklyReportRaw: false/, 'weekly report snapshot runner should prebuild current, previous and lifetime scopes');
assert.match(operationsSnapshotRunnerSource, /scanFirstRows: scope\?\.view === 'weekly-report'[\s\S]*storage\.getCachedScan\(table, weeklyReportScanOptions/, 'weekly report snapshot rebuild must use the offline full-read path instead of production first-row truncation');
assert.match(operationsSnapshotWorkflow, /--weekly-report-scopes --skip-default-scope/, 'high-frequency operations snapshot workflow should prebuild weekly report scopes');
assert.match(weeklyWorkflow, /Rebuild weekly report snapshots[\s\S]*--weekly-report-scopes --skip-default-scope[\s\S]*Trigger weekly business report/, 'weekly report workflow should rebuild weekly report snapshots before triggering the report endpoint');

async function callPublicRoute() {
  let statusCode = 0;
  let html = '';
  const res = {
    setHeader() {},
    end(value) { html = String(value || ''); },
    get statusCode() { return statusCode; },
    set statusCode(value) { statusCode = value; }
  };
  const routes = createWeeklyBusinessReportRoutes({
    init: async () => {},
    sendJson: () => { throw new Error('public share route must not fall through to JSON auth'); },
    scan: async () => [{ ...snapshot, shareToken: 'public-token', status: 'success', html: '<h1>旧版周报</h1>' }],
    table: 'ft_weekly_business_reports'
  });
  const handled = await routes.handlePublic({ path: '/public/weekly-business-reports/public-token', method: 'GET', res });
  return { handled, statusCode, html };
}

async function callPublicEditRoute() {
  let json = null;
  let saved = null;
  const res = {};
  const routes = createWeeklyBusinessReportRoutes({
    init: async () => {},
    sendJson: (_res, value) => { json = value; return value; },
    scan: async () => [{ ...snapshot, shareToken: 'public-token', status: 'success' }],
    put: async (_table, _id, row) => { saved = row; },
    table: 'ft_weekly_business_reports'
  });
  const handled = await routes.handlePublic({
    path: '/public/weekly-business-reports/public-token/edits',
    method: 'POST',
    body: { edits: { 'summary.totalIncome': '44,072 元', bad: '<script>alert(1)</script>' } },
    res
  });
  return { handled, json, saved };
}

async function callSnapshotFirstGeneration() {
  let liveLoads = 0;
  const savedRows = [];
  const startedAt = Date.now();
  const result = await generateWeeklyBusinessReport({
    period,
    baseUrl: 'https://www.flowtennis.cn',
    mkTable: async () => {},
    get: async () => ({ shareToken: 'fast-token' }),
    put: async (_table, _id, row) => { savedRows.push(row); },
    loadOperationsPayload: async () => {
      liveLoads += 1;
      throw new Error('重新生成不应默认现场读取大量数据');
    },
    loadOperationsSnapshot: async ({ scope }) => {
      if (scope?.dateRange?.startDate === period.previousStartDate) {
        return { operations: { overview: { cards: { totalIncome: { value: 100 } } }, court: { cards: { utilizationRate: { value: 1 } } }, coach: { cards: { usedHours: { value: 1 } } }, conversion: { cards: { totalLeads: { value: 1 } } } } };
      }
      if (!scope?.dateRange?.startDate) {
        return { operations: { overview: { cards: { totalIncome: { value: 1000 } } }, court: { cards: { utilizationRate: { value: 10 } } } } };
      }
      return operationsPayload;
    }
  });
  return { result, savedRows, liveLoads, elapsedMs: Date.now() - startedAt };
}

async function callExistingReportManualRegeneration() {
  let liveLoads = 0;
  let snapshotLoads = 0;
  const snapshotScopes = [];
  const savedRows = [];
  const startedAt = Date.now();
  const result = await generateWeeklyBusinessReport({
    period,
    generationMode: 'manual',
    baseUrl: 'https://www.flowtennis.cn',
    mkTable: async () => {},
    get: async () => ({ ...snapshot, id: 'weekly:顺义马坡:2026-08-27:2026-09-03', shareToken: 'existing-token', status: 'success' }),
    put: async (_table, _id, row) => { savedRows.push(row); },
    loadOperationsPayload: async ({ scope }) => {
      liveLoads += 1;
      if (scope?.dateRange?.startDate === period.startDate) return operationsPayload;
      if (scope?.dateRange?.startDate === period.previousStartDate) return { operations: { overview: { cards: { totalIncome: { value: 100 } } } } };
      return { operations: { overview: { cards: { totalIncome: { value: 1000 } } } } };
    },
    loadOperationsSnapshot: async ({ scope }) => {
      snapshotLoads += 1;
      snapshotScopes.push(scope?.dateRange?.startDate || 'lifetime');
      if (scope?.dateRange?.startDate === period.startDate) return operationsPayload;
      if (scope?.dateRange?.startDate === period.previousStartDate) {
        return { operations: { overview: { cards: { totalIncome: { value: 100 } } }, court: { cards: { utilizationRate: { value: 1 } } }, coach: { cards: { usedHours: { value: 1 } } }, conversion: { cards: { totalLeads: { value: 1 } } } } };
      }
      if (!scope?.dateRange?.startDate) {
        return { operations: { overview: { cards: { totalIncome: { value: 1000 } } }, court: { cards: { utilizationRate: { value: 10 } } } } };
      }
      return null;
    }
  });
  return { result, savedRows, liveLoads, snapshotLoads, snapshotScopes, elapsedMs: Date.now() - startedAt };
}

async function callManualRegenerationWithoutSnapshot() {
  let liveLoads = 0;
  let json = null;
  const routes = createWeeklyBusinessReportRoutes({
    init: async () => {},
    sendJson: (_res, value, statusCode = 200) => { json = { statusCode, value }; return value; },
    get: async () => null,
    put: async () => {},
    mkTable: async () => {},
    buildOperationsPayload: async () => {
      liveLoads += 1;
      throw new Error('missing snapshot must not fall back to slow live reads');
    },
    loadOperationsSnapshot: async () => null,
    table: 'ft_weekly_business_reports'
  });
  await routes.handleAdmin({
    path: '/admin/weekly-business-reports/regenerate',
    method: 'POST',
    body: { period: { startDate: '2026-08-27', endDate: '2026-09-03' } },
    req: { headers: {} },
    res: {},
    user: { role: 'admin' }
  });
  return { json, liveLoads };
}

async function callTargetPeriodRegenerationRoute() {
  let generatedPeriod = null;
  let webhookCalls = 0;
  const originalFetch = global.fetch;
  global.fetch = async () => {
    webhookCalls += 1;
    throw new Error('manual regeneration should not wait for Feishu webhook');
  };
  let json = null;
  const routes = createWeeklyBusinessReportRoutes({
    init: async () => {},
    sendJson: (_res, value) => { json = value; return value; },
    get: async () => null,
    put: async () => {},
    mkTable: async () => {},
    buildOperationsPayload: async () => { throw new Error('row regeneration must not live-read source tables'); },
    loadOperationsSnapshot: async ({ scope }) => {
      if (scope?.dateRange?.startDate === '2026-08-27') {
        generatedPeriod = scope.dateRange;
        return operationsPayload;
      }
      if (scope?.dateRange?.startDate === '2026-08-19') return { operations: { overview: { cards: { totalIncome: { value: 100 } } } } };
      return { operations: { overview: { cards: { totalIncome: { value: 1000 } } } } };
    },
    webhook: 'https://example.invalid/webhook',
    table: 'ft_weekly_business_reports'
  });
  try {
    await routes.handleAdmin({
      path: '/admin/weekly-business-reports/regenerate',
      method: 'POST',
      body: { period: { startDate: '2026-08-27', endDate: '2026-09-03' } },
      req: { headers: {} },
      res: {},
      user: { role: 'admin' }
    });
  } finally {
    global.fetch = originalFetch;
  }
  return { json, generatedPeriod, webhookCalls };
}

async function callSequentialSnapshotGeneration() {
  let activeLoads = 0;
  let maxActiveLoads = 0;
  await generateWeeklyBusinessReport({
    get: async () => null,
    put: async () => {},
    mkTable: async () => {},
    loadOperationsPayload: async () => { throw new Error('snapshot generation should not fall back to live reads'); },
    loadOperationsSnapshot: async ({ scope }) => {
      activeLoads += 1;
      maxActiveLoads = Math.max(maxActiveLoads, activeLoads);
      await new Promise(resolve => setTimeout(resolve, 5));
      activeLoads -= 1;
      if (scope?.dateRange?.startDate === period.startDate) return operationsPayload;
      if (scope?.dateRange?.startDate === period.previousStartDate) return { operations: { overview: { cards: { totalIncome: { value: 100 } } } } };
      return { operations: { overview: { cards: { totalIncome: { value: 1000 } } } } };
    },
    period
  });
  return { maxActiveLoads };
}

Promise.all([callPublicRoute(), callPublicEditRoute(), callSnapshotFirstGeneration(), callExistingReportManualRegeneration(), callManualRegenerationWithoutSnapshot(), callTargetPeriodRegenerationRoute(), callSequentialSnapshotGeneration()]).then(([result, editResult, generationResult, existingGenerationResult, missingSnapshotResult, targetPeriodResult, sequentialResult]) => {
  assert.strictEqual(result.handled, true, 'public weekly report HTML route should be handled before login auth');
  assert.strictEqual(result.statusCode, 200, 'public weekly report HTML route should return HTML without login');
  assert.match(result.html, /二、收入与收款/, 'public weekly report route should upgrade legacy stored HTML to the current report template');
  assert.doesNotMatch(result.html, /旧版周报/, 'public weekly report route should not return legacy incomplete HTML');
  assert.deepStrictEqual(editResult.handled, { success: true }, 'public weekly report edit route should be handled by share token');
  assert.strictEqual(editResult.json.success, true, 'public weekly report edit route should save editable values');
  assert.strictEqual(editResult.saved.publicEdits['summary.totalIncome'], '44,072 元', 'public weekly report edits should persist saved values');
  assert.doesNotMatch(editResult.saved.publicEdits.bad, /[<>]/, 'public weekly report edits should strip HTML tags');
  assert.strictEqual(generationResult.liveLoads, 0, 'manual weekly report regeneration should not live-load when snapshots are available');
  assert.strictEqual(generationResult.result.shareToken, 'fast-token', 'snapshot-first generation should preserve the existing share link');
  assert.strictEqual(generationResult.savedRows.length, 1, 'snapshot-first generation should save one weekly report row');
  assert.ok(generationResult.elapsedMs < 10000, `snapshot-first generation should finish within 10 seconds, got ${generationResult.elapsedMs}ms`);
  assert.strictEqual(existingGenerationResult.liveLoads, 0, 'manual regeneration should not live-read source tables inside the request');
  assert.strictEqual(existingGenerationResult.snapshotLoads, 3, 'manual regeneration should use fast snapshots for current, previous and lifetime context');
  assert.deepStrictEqual(existingGenerationResult.snapshotScopes.sort(), [period.startDate, period.previousStartDate, 'lifetime'].sort(), 'manual regeneration must use the weekly report snapshot scope for all report contexts');
  assert.strictEqual(existingGenerationResult.result.shareToken, 'existing-token', 'manual regeneration for an existing report should keep the share link');
  assert.strictEqual(existingGenerationResult.savedRows.length, 1, 'manual regeneration for an existing report should save the rerendered report');
  assert.ok(existingGenerationResult.elapsedMs < 10000, `existing report manual regeneration should finish within 10 seconds, got ${existingGenerationResult.elapsedMs}ms`);
  assert.strictEqual(missingSnapshotResult.liveLoads, 0, 'missing weekly report snapshots must fail fast instead of scanning live source tables');
  assert.strictEqual(missingSnapshotResult.json.statusCode, 503, 'missing weekly report snapshot should return a controlled retry status');
  assert.match(missingSnapshotResult.json.value.error, /周报数据快照未就绪/, 'missing weekly report snapshot should explain that data snapshot is not ready');
  assert.strictEqual(targetPeriodResult.generatedPeriod.startDate, '2026-08-27', 'row regenerate route should use the requested report period');
  assert.strictEqual(targetPeriodResult.generatedPeriod.endDate, '2026-09-03', 'row regenerate route should use the requested report end date');
  assert.strictEqual(targetPeriodResult.json.success, true, 'row regenerate route should return success for the requested period');
  assert.strictEqual(targetPeriodResult.webhookCalls, 0, 'manual regeneration route should not wait for Feishu webhook before responding');
  assert.strictEqual(sequentialResult.maxActiveLoads, 1, 'weekly report regeneration should load operation snapshots sequentially to avoid TableStore getRow timeout fan-out');
  console.log('weekly business report tests passed');
}).catch(err => {
  console.error(err);
  process.exit(1);
});
