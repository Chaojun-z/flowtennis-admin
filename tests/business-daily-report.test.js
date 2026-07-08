const assert = require('assert');
const fs = require('fs');
const path = require('path');

const { buildBusinessDailyReportSnapshot } = require('../scripts/lib/business-daily-report');
const { generateReport, buildFeishuCard } = require('../standalone-services/feishu-business-report');

const workflowPath = path.join(__dirname, '../.github/workflows/feishu-business-daily-report.yml');

const snapshot = buildBusinessDailyReportSnapshot({
  targetDate: '2026-06-30',
  generatedAt: '2026-06-30T14:30:00.000Z',
  campuses: [
    { id: 'shunyi_mapo', code: 'shunyi_mapo', name: '顺义马坡' },
    { id: 'ntc', code: 'ntc', name: '国网中心' }
  ],
  financeNormalizedRows: [
    { id: 'today-package', businessDate: '2026-06-30 10:00:00', campusName: '顺义马坡', businessType: '课程', action: '收款', cashDelta: 7800, recognizedRevenueDelta: 0, deferredRevenueDelta: 7800, sourceDocument: '购买记录 p1' },
    { id: 'today-course-recognized', businessDate: '2026-06-30 12:00:00', campusName: '顺义马坡', businessType: '课程', action: '消耗', cashDelta: 0, recognizedRevenueDelta: 4200, deferredRevenueDelta: -4200, paymentChannel: '课包划扣' },
    { id: 'today-booking', businessDate: '2026-06-30 13:00:00', campusName: '国网中心', businessType: '散客订场', action: '收款', cashDelta: 2600, recognizedRevenueDelta: 2600, deferredRevenueDelta: 0 },
    { id: 'today-stored', businessDate: '2026-06-30 14:00:00', campusName: '国网中心', businessType: '会员储值', action: '收款', cashDelta: 2400, recognizedRevenueDelta: 0, deferredRevenueDelta: 2400 },
    { id: 'today-member-use', businessDate: '2026-06-30 15:00:00', campusName: '国网中心', businessType: '会员订场', action: '已入账', cashDelta: 0, recognizedRevenueDelta: 700, deferredRevenueDelta: -700 },
    { id: 'yesterday', businessDate: '2026-06-29 10:00:00', campusName: '顺义马坡', businessType: '课程', action: '收款', cashDelta: 9600, recognizedRevenueDelta: 7200, deferredRevenueDelta: 2400 },
    { id: 'month-old', businessDate: '2026-06-01 10:00:00', campusName: '顺义马坡', businessType: '课程', action: '收款', cashDelta: 1000, recognizedRevenueDelta: 500, deferredRevenueDelta: 500 },
    { id: 'difference-row', businessDate: '2026-06-30 16:00:00', campusName: '顺义马坡', businessType: '差异项', action: '差异', cashDelta: 9999, recognizedRevenueDelta: 9999, deferredRevenueDelta: 0, differenceReason: '测试差异' }
  ],
  entitlementLedger: [
    { id: 'ledger-1', studentId: 'student-1', scheduleId: 's1', lessonDelta: -1, relatedDate: '2026-06-30' },
    { id: 'ledger-2', studentId: 'student-2', scheduleId: 's2', lessonDelta: -2, relatedDate: '2026-06-30' },
    { id: 'ledger-rollback', studentId: 'student-3', scheduleId: 's3', lessonDelta: 1, relatedDate: '2026-06-30' }
  ],
  scheduleRows: [
    { id: 's1', studentId: 'student-1', campus: 'shunyi_mapo', startTime: '2026-06-30 10:00:00', status: '已结束' },
    { id: 's2', studentId: 'student-2', campus: 'ntc', startTime: '2026-06-30 11:00:00', status: '已结束' },
    { id: 'tomorrow-1', studentIds: ['student-1', 'student-4'], campus: 'shunyi_mapo', courseType: '私教课', startTime: '2026-07-01 10:00:00', status: '已排课' },
    { id: 'tomorrow-2', studentId: 'student-5', campus: 'ntc', courseType: '体验课', startTime: '2026-07-01 15:00:00', status: '已排课' },
    { id: 'tomorrow-cancelled', studentId: 'student-6', campus: 'ntc', courseType: '体验课', startTime: '2026-07-01 16:00:00', status: '已取消' }
  ]
});

assert.strictEqual(snapshot.schemaVersion, 'business-daily-report-v1');
assert.strictEqual(snapshot.today, '2026-06-30');
assert.deepStrictEqual(snapshot.overall.cash, {
  today: 12800,
  yesterday: 9600,
  sevenDayAverage: 3200,
  monthToDate: 23400
});
assert.deepStrictEqual(snapshot.overall.recognized, {
  today: 7500,
  yesterday: 7200,
  sevenDayAverage: 2100,
  monthToDate: 15200
});
assert.strictEqual(snapshot.overall.tradeCount.today, 3);
assert.strictEqual(snapshot.overall.lessonRedemption.todayStudents, 2);
assert.strictEqual(snapshot.overall.lessonRedemption.todayLessonUnits, 3);
assert.strictEqual(snapshot.overall.pendingRevenue.current, 8200);

assert.deepStrictEqual(snapshot.incomeStructure, {
  packageIncome: 7800,
  bookingIncome: 2600,
  storedValueIncome: 2400
});
assert.deepStrictEqual(snapshot.recognitionStructure, {
  courseRecognized: 4200,
  bookingRecognized: 2600,
  storedValueRecognized: 700
});

const mapo = snapshot.campusRows.find((row) => row.campusName === '顺义马坡');
const ntc = snapshot.campusRows.find((row) => row.campusName === '国网中心');
assert.strictEqual(mapo.cash, 7800);
assert.strictEqual(mapo.recognized, 4200);
assert.strictEqual(mapo.lessonStudents, 1);
assert.strictEqual(ntc.cash, 5000);
assert.strictEqual(ntc.recognized, 3300);
assert.strictEqual(ntc.lessonUnits, 2);

assert.deepStrictEqual(snapshot.tomorrowSchedule, {
  lessonCount: 2,
  studentCount: 3,
  trialLessonCount: 1
});

const report = generateReport(snapshot);
assert.match(report.content, /整体经营/);
assert.match(report.content, /今日实收：\*\*¥12,800\*\*/);
assert.match(report.content, /近7日均值：¥3,200/);
assert.match(report.content, /顺义马坡：实收 ¥7,800｜核销 ¥4,200｜成交 1 笔｜上课核销 1 人\/1 课时｜待履约 ¥6,500/);
assert.match(report.content, /明日课程：2 节/);
assert.doesNotMatch(report.content, /结论|建议|风险判断|正常|偏低|拖后腿/, '老板版经营日报只展示数据，不输出机器判断');

const card = buildFeishuCard(report);
assert.strictEqual(card.msg_type, 'interactive');
assert.match(card.card.header.title.content, /经营日报/);
assert.match(JSON.stringify(card), /今日实收/);

assert.ok(fs.existsSync(workflowPath), '应提供飞书经营日报 GitHub Actions 定时任务');
const workflow = fs.readFileSync(workflowPath, 'utf8');
assert.match(workflow, /FEISHU_BUSINESS_DAILY_REPORT_WEBHOOK/, '经营日报应使用独立飞书 webhook secret');
assert.match(workflow, /export-business-daily-report-json\.js/, '定时任务应先导出经营日报数据快照');
assert.match(workflow, /feishu-business-report\.js/, '定时任务应发送经营日报飞书消息');

console.log('business daily report tests passed');
