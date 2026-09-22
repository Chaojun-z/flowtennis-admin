const assert = require('assert');
const fs = require('fs');
const path = require('path');
const vm = require('vm');

const {
  resolveWeeklyBusinessReportPeriod,
  buildWeeklyBusinessReportSnapshot,
  generateWeeklyBusinessReport,
  buildWeeklyBusinessReportDraft,
  publishWeeklyBusinessReportDraft,
  listWeeklyBusinessReports,
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
const pagesStyleSource = fs.readFileSync(path.join(repoRoot, 'public/assets/styles/pages.css'), 'utf8');
const stateSource = fs.readFileSync(path.join(repoRoot, 'public/assets/scripts/core/state.js'), 'utf8');
const bootstrapSource = fs.readFileSync(path.join(repoRoot, 'public/assets/scripts/core/bootstrap.js'), 'utf8');
const componentsSource = fs.readFileSync(path.join(repoRoot, 'public/assets/scripts/core/components.js'), 'utf8');
const publicApiSource = fs.readFileSync(path.join(repoRoot, 'public/assets/scripts/core/api.js'), 'utf8');
const operationsPageSource = fs.readFileSync(path.join(repoRoot, 'server/page-data/operations-page.js'), 'utf8');
const operationsSnapshotSource = fs.readFileSync(path.join(repoRoot, 'server/page-data/operations-snapshot.js'), 'utf8');
const operationsSource = fs.readFileSync(path.join(repoRoot, 'server/read-models/operations-source.js'), 'utf8');
const operationsSnapshotWorkflow = fs.readFileSync(path.join(repoRoot, '.github/workflows/operations-snapshot-rebuild.yml'), 'utf8');
const operationsSnapshotRunnerSource = fs.readFileSync(path.join(repoRoot, 'scripts/rebuild-operations-snapshot.js'), 'utf8');

function decodeHtmlAttr(value = '') {
  return String(value)
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&amp;/g, '&');
}

const period = resolveWeeklyBusinessReportPeriod(new Date('2026-09-04T00:00:00.000Z'));
assert.deepStrictEqual(period, {
  startDate: '2026-08-27',
  endDate: '2026-09-03',
  previousStartDate: '2026-08-19',
  previousEndDate: '2026-08-26',
  timezone: 'Asia/Shanghai'
}, 'weekly report should use Beijing natural days from previous Thursday through current Thursday');

const nextPeriod = resolveWeeklyBusinessReportPeriod(new Date('2026-09-11T00:00:00.000Z'));
assert.deepStrictEqual(nextPeriod, {
  startDate: '2026-09-04',
  endDate: '2026-09-10',
  previousStartDate: '2026-08-27',
  previousEndDate: '2026-09-03',
  timezone: 'Asia/Shanghai'
}, 'weekly report periods must not double-count the previous Thursday');

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

const sortedLeadSourceSnapshot = buildWeeklyBusinessReportSnapshot({
  period,
  operationsPayload: {
    operations: {
      conversion: {
        sourceRows: [
          { source: '抖音', totalLeads: 2, trialAttended: 1, trialPathDealCustomers: 1 },
          { source: '大众点评', totalLeads: 9, trialAttended: 3, trialPathDealCustomers: 2 },
          { source: '小红书', totalLeads: 5, trialAttended: 2, trialPathDealCustomers: 1 }
        ]
      }
    }
  },
  previousOperationsPayload: { operations: {} }
});
assert.deepStrictEqual(
  sortedLeadSourceSnapshot.sections.conversion.sourceRows.slice(0, 3).map(row => row.source),
  ['大众点评', '小红书', '抖音'],
  'weekly report channel rows should sort by lead count descending'
);
const sortedLeadSourceHtml = renderWeeklyBusinessReportHtml(sortedLeadSourceSnapshot);
assert.doesNotMatch(sortedLeadSourceHtml, /conversion\.deals\.progress/, 'weekly report should remove the old right-side channel progress list');
assert.match(sortedLeadSourceHtml, /conversion\.source[\s\S]*大众点评[\s\S]*小红书[\s\S]*抖音/, 'weekly report should move the channel conversion table into the upper conversion grid');
assert.match(sortedLeadSourceHtml, /<div class="bars">[\s\S]*大众点评[\s\S]*9条[\s\S]*线下到店[\s\S]*0条/, 'weekly report lead chart should keep zero-value channels and use the lead-count order');
assert.match(sortedLeadSourceHtml, /大众点评[\s\S]*<b style="width:100%"><\/b>/, 'weekly report lead chart should put the highest lead source first');
assert.match(sortedLeadSourceHtml, /线下到店[\s\S]*<b style="width:0%"><\/b>/, 'weekly report lead chart should not fill zero-value channels');
assert.match(sortedLeadSourceHtml, /\.bars\{display:grid;grid-auto-rows:minmax\(0,1fr\);gap:0;height:100%\}/, 'weekly report lead chart should distribute rows across the panel height');
assert.match(sortedLeadSourceHtml, /\.conversion-panel\{height:100%;min-height:520px\}[\s\S]*conversion-panel>.overflow-x-auto table\{height:100%;margin-top:0\}/, 'weekly report conversion table should share the panel height');

const staleOrderHtml = renderWeeklyBusinessReportHtml({
  ...sortedLeadSourceSnapshot,
  sections: {
    ...sortedLeadSourceSnapshot.sections,
    conversion: {
      ...sortedLeadSourceSnapshot.sections.conversion,
      sourceRows: [
        { source: '转介绍', leads: 1, trial: 0, deals: 0, compare: {} },
        { source: '线下到店', leads: 0, trial: 0, deals: 0, compare: {} },
        { source: '大众点评', leads: 7, trial: 0, deals: 0, compare: {} }
      ]
    }
  }
});
assert.match(staleOrderHtml, /<div class="bars">[\s\S]*大众点评[\s\S]*转介绍[\s\S]*线下到店/, 'weekly report HTML should re-sort legacy snapshots before rendering');

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
assert.strictEqual(requestedStructureSnapshot.sections.revenue.receipts.categoryRows.find(row => row.name === '课程服务')?.amount, 3000, 'receipt tree should group course receipts under course service');
assert.strictEqual(requestedStructureSnapshot.sections.revenue.receipts.categoryRows.find(row => row.name === '场地服务')?.amount, 180, 'receipt tree should group guest booking receipts under field service');
assert.strictEqual(requestedStructureSnapshot.sections.revenue.receipts.categoryRows.find(row => row.name === '会员储值')?.amount, 5000, 'receipt tree should separate membership top-up from recognized revenue');
assert.strictEqual(requestedStructureSnapshot.sections.revenue.recognized.categoryRows.find(row => row.name === '课程服务')?.amount, 1000, 'recognized tree should group course consumption under course service');
assert.strictEqual(requestedStructureSnapshot.sections.revenue.recognized.categoryRows.find(row => row.name === '场地服务')?.amount, 300, 'recognized tree should group member and guest booking revenue under field service');
const categoryHtml = renderWeeklyBusinessReportHtml(requestedStructureSnapshot);
function revenuePanel(html, prefix) {
  return html.match(new RegExp(`<section data-revenue-ranking="${prefix.replace(/\./g, '\\.')}"[^>]*>([\\s\\S]*?)</section>`))?.[1] || '';
}
const receiptRanking = revenuePanel(categoryHtml, 'receipts.categoryRows');
const recognizedRanking = revenuePanel(categoryHtml, 'recognized.categoryRows');
assert.ok(receiptRanking && recognizedRanking, '收款与核销应各自展示来源排行榜');
assert.ok(receiptRanking.indexOf('会员储值') < receiptRanking.indexOf('课程服务'), '收款大类应按金额降序排列');
assert.match(recognizedRanking, /76\.9%/, '核销占比应使用核销总额，不能混用收款分母');
assert.match(receiptRanking, /61\.1%/, '收款占比应使用本周收款总额');
assert.strictEqual((receiptRanking.match(/<details[^>]* open>/g) || []).length, 1, '默认只展开金额最大的大类');
assert.match(receiptRanking, /<details[^>]* open>[\s\S]*?会员储值/, '最大来源应默认展开');
assert.doesNotMatch(receiptRanking, /一级类目|二级项目|三级明细|一级合计/, '排行榜应去掉重复层级标签');
assert.match(categoryHtml, /volt: '#72D94A'/, '保留现有周报强调色');
const rankingSourceBefore = JSON.stringify(requestedStructureSnapshot);
renderWeeklyBusinessReportHtml(requestedStructureSnapshot);
assert.strictEqual(JSON.stringify(requestedStructureSnapshot), rankingSourceBefore, '排序不得改变原始周报数据或编辑索引');
const rankingSnapshot = JSON.parse(rankingSourceBefore);
rankingSnapshot.sections.revenue.receipts.totalAmount = 1000;
rankingSnapshot.sections.revenue.receipts.categoryRows = [
  { name: '小额来源', amount: 100, children: [{ name: '父项', amount: 100, children: [{ name: '单次', amount: 100 }] }] },
  { name: '主要来源', amount: 700, children: [{ name: '小项', amount: 200 }, { name: '大项', amount: 500 }] }
];
rankingSnapshot.publicEdits = {
  'receipts.categoryRows.0.name': '保留的小额名称',
  'receipts.categoryRows.0.children.0.children.0.name': '<单次编辑>',
  'receipts.categoryRows.1.children.0.amount': '原有编辑金额'
};
const editedRanking = revenuePanel(renderWeeklyBusinessReportHtml(rankingSnapshot), 'receipts.categoryRows');
assert.ok(editedRanking.indexOf('主要来源') < editedRanking.indexOf('保留的小额名称'), '排序后编辑内容仍应对应原始行');
assert.ok(editedRanking.indexOf('大项') < editedRanking.indexOf('小项'), '展开后的项目也应按金额排序');
assert.match(editedRanking, /70\.0%/, '占比分母必须用周报总额，不能改用已列分类小计');
assert.match(editedRanking, /data-edit-key="receipts.categoryRows.1.children.0.amount"[^>]*>原有编辑金额/, '子项排序后仍保留原编辑键');
assert.match(editedRanking, /&lt;单次编辑&gt;/, '三级明细保留且手工编辑应转义');
for (const total of [0, -100]) {
  rankingSnapshot.sections.revenue.receipts.totalAmount = total;
  const panel = revenuePanel(renderWeeklyBusinessReportHtml(rankingSnapshot), 'receipts.categoryRows');
  assert.doesNotMatch(panel, /NaN|Infinity|width:-/, '零值与负总额不得生成无效横条');
  assert.match(panel, /占比暂不展示/, '总额不为正时应明确不展示占比');
}
rankingSnapshot.sections.revenue.receipts.totalAmount = 100;
rankingSnapshot.sections.revenue.receipts.categoryRows = [{ name: '正向', amount: 150 }, { name: '冲减', amount: -50 }];
const signedRanking = revenuePanel(renderWeeklyBusinessReportHtml(rankingSnapshot), 'receipts.categoryRows');
assert.match(signedRanking, /150\.0%/, '应保留含冲减时超过 100% 的真实占比');
assert.match(signedRanking, /-50\.0%/, '负向金额不能被隐藏或改成正数');
assert.doesNotMatch(signedRanking, /width:(?:150|-50)%/, '横条宽度必须限制在有效范围');
rankingSnapshot.sections.revenue.receipts.categoryRows = [];
assert.match(revenuePanel(renderWeeklyBusinessReportHtml(rankingSnapshot), 'receipts.categoryRows'), /暂无数据/, '空分类应有明确空态');
assert.match(categoryHtml, /累计净实收/, 'weekly lifetime card should identify the net cash metric');
assert.strictEqual(requestedStructureSnapshot.sections.revenue.course.lessonPeople, 2, 'course section should expose weekly completed lesson people');
assert.strictEqual(requestedStructureSnapshot.sections.revenue.course.completedHours, 3, 'course section should expose weekly completed coach course hours');
assert.strictEqual(requestedStructureSnapshot.sections.revenue.course.typeRows.find(row => row.type === '成人')?.newAmount, 1000, 'adult course row should use current-week platform receipt facts');
assert.strictEqual(requestedStructureSnapshot.sections.revenue.course.typeRows.find(row => row.type === '青少年')?.completedHours, 2, 'youth course row should use current-week completed schedule facts');
assert.strictEqual(requestedStructureSnapshot.sections.court.revenueUsageHours, 74, 'paid utilization hours should include schedule court occupancy and exclude internal use and leader bookings');
assert.strictEqual(requestedStructureSnapshot.sections.court.dailyRows.find(row => row.date === '2026-09-01')?.value, 100, 'daily court utilization should be capped at 100%');
assert.ok(requestedStructureSnapshot.summary.courtUtilizationRate.value <= 100, 'top court utilization must never exceed 100%');

const privateCourseNetReceiptSnapshot = buildWeeklyBusinessReportSnapshot({
  period,
  operationsPayload: {
    operations: { overview: { cards: { totalIncome: { value: 1 }, recognizedRevenue: { value: 1 } } } },
    weeklyReportRaw: {
      students: [
        { id: 'private-student', name: '私教学员', type: '成人', campus: 'shunyi_mapo' },
        { id: 'small-student', name: '小班学员', type: '成人', campus: 'shunyi_mapo' },
        { id: 'trial-student', name: '体验学员', type: '成人', campus: 'shunyi_mapo' },
        { id: 'full-refund-student', name: '全额退款学员', type: '成人', campus: 'shunyi_mapo' }
      ],
      purchases: [
        { id: 'private-purchase', studentId: 'private-student', studentName: '私教学员', courseType: '私教课', packageName: '成人1v1私教课 · 10课时 · 黄金', amountPaid: 4500, purchaseDate: '2026-08-28', status: 'partially_refunded', campus: 'shunyi_mapo' },
        { id: 'small-purchase', studentId: 'small-student', studentName: '小班学员', courseType: '小班课', packageName: '小班课', amountPaid: 3000, purchaseDate: '2026-08-28', status: 'active', campus: 'shunyi_mapo' },
        { id: 'trial-purchase', studentId: 'trial-student', studentName: '体验学员', courseType: '体验课', packageName: '私教体验课', amountPaid: 299, purchaseDate: '2026-08-28', status: 'active', campus: 'shunyi_mapo' },
        { id: 'full-refund-purchase', studentId: 'full-refund-student', studentName: '全额退款学员', courseType: '私教课', packageName: '成人1v1私教课 · 10课时 · 黄金', amountPaid: 5000, purchaseDate: '2026-08-28', status: 'refunded', campus: 'shunyi_mapo' }
      ],
      financeNormalizedRows: [
        { id: 'private-receipt', campusName: '顺义马坡', studentId: 'private-student', businessDate: '2026-08-28', businessType: '课程', action: '收款', cashDelta: 4500, sourceDocument: '购买记录 private-purchase', packageName: '成人1v1私教课 · 10课时 · 黄金', courseType: '私教课' },
        { id: 'private-refund', campusName: '顺义马坡', studentId: 'private-student', businessDate: '2026-09-01', businessType: '课程', action: '退款', cashDelta: -1800, sourceDocument: '购买记录 private-purchase', packageName: '成人1v1私教课 · 10课时 · 黄金', courseType: '私教课' },
        { id: 'small-receipt', campusName: '顺义马坡', studentId: 'small-student', businessDate: '2026-08-28', businessType: '课程', action: '收款', cashDelta: 3000, sourceDocument: '购买记录 small-purchase', packageName: '小班课', courseType: '小班课' },
        { id: 'trial-receipt', campusName: '顺义马坡', studentId: 'trial-student', businessDate: '2026-08-28', businessType: '课程', action: '收款', cashDelta: 299, sourceDocument: '购买记录 trial-purchase', packageName: '私教体验课', courseType: '体验课' },
        { id: 'full-refund-receipt', campusName: '顺义马坡', studentId: 'full-refund-student', businessDate: '2026-08-28', businessType: '课程', action: '收款', cashDelta: 5000, sourceDocument: '购买记录 full-refund-purchase', packageName: '成人1v1私教课 · 10课时 · 黄金', courseType: '私教课' },
        { id: 'full-refund-row', campusName: '顺义马坡', studentId: 'full-refund-student', businessDate: '2026-09-01', businessType: '课程', action: '退款', cashDelta: -5000, sourceDocument: '购买记录 full-refund-purchase', packageName: '成人1v1私教课 · 10课时 · 黄金', courseType: '私教课' }
      ]
    }
  },
  previousOperationsPayload: { operations: { overview: { cards: { totalIncome: { value: 0 }, recognizedRevenue: { value: 0 } } } }, weeklyReportRaw: { financeNormalizedRows: [] } },
  totalOperationsPayload: { operations: { overview: { cards: { totalIncome: { value: 1 } } } }, weeklyReportRaw: { financeNormalizedRows: [] } }
});
assert.strictEqual(privateCourseNetReceiptSnapshot.sections.revenue.course.newAmount, 2700, 'weekly private course revenue must use formal private net receipts and exclude small class/trial receipts');
assert.strictEqual(privateCourseNetReceiptSnapshot.sections.revenue.course.typeRows.find(row => row.type === '成人')?.newAmount, 2700, 'weekly private course type rows must also use private net receipts');

const financialLedgerSourceSnapshot = buildWeeklyBusinessReportSnapshot({
  period,
  operationsPayload: {
    operations: {
      overview: { cards: { totalIncome: { value: 29199 }, recognizedRevenue: { value: 0 } } },
      court: { cards: { utilizationRate: { value: 29 } } },
      coach: { cards: { usedHours: { value: 80.5 } } }
    },
    weeklyReportRaw: {
      financialLedger: [
        { id: 'ledger-course-receipt', status: 'active', campus: 'shunyi_mapo', businessDate: '2026-08-28', businessType: '课程', action: '收款', cashDelta: 2519900, recognizedRevenueDelta: 0, deferredRevenueDelta: 2519900 },
        { id: 'ledger-course-consume', status: 'active', campus: 'shunyi_mapo', businessDate: '2026-08-29', businessType: '课程', action: '已入账', paymentChannel: '课包划扣', cashDelta: 0, recognizedRevenueDelta: 825000, deferredRevenueDelta: -825000 },
        { id: 'ledger-guest-booking', status: 'active', campus: 'shunyi_mapo', businessDate: '2026-08-30', businessType: '散客订场', action: '收款', cashDelta: 474000, recognizedRevenueDelta: 474000, deferredRevenueDelta: 0 },
        { id: 'ledger-member-booking', status: 'active', campus: 'shunyi_mapo', businessDate: '2026-08-31', businessType: '会员订场', action: '已入账', cashDelta: 0, recognizedRevenueDelta: 620650, deferredRevenueDelta: -620650 },
        { id: 'ledger-stored-value', status: 'active', campus: 'shunyi_mapo', businessDate: '2026-09-01', businessType: '会员储值', action: '收款', cashDelta: 400000, recognizedRevenueDelta: 0, deferredRevenueDelta: 400000 },
        { id: 'ledger-voided', status: 'voided', campus: 'shunyi_mapo', businessDate: '2026-09-01', businessType: '散客订场', action: '收款', cashDelta: 999900, recognizedRevenueDelta: 999900 }
      ],
      financeNormalizedRows: [
        { id: 'legacy-zero-row', campusName: '顺义马坡', businessDate: '2026-08-28', businessType: '课程', action: '收款', cashDelta: 29199, recognizedRevenueDelta: 0 }
      ]
    }
  },
  previousOperationsPayload: {
    operations: { overview: { cards: { totalIncome: { value: 1 }, recognizedRevenue: { value: 0 } } }, court: { cards: { utilizationRate: { value: 1 } } }, coach: { cards: { usedHours: { value: 1 } } } },
    weeklyReportRaw: {
      financialLedger: [
        { id: 'ledger-prev-course-consume', status: 'active', campus: 'shunyi_mapo', businessDate: '2026-08-20', businessType: '课程', action: '已入账', cashDelta: 0, recognizedRevenueDelta: 500000, deferredRevenueDelta: -500000 }
      ]
    }
  },
  shareToken: 'token-financial-ledger',
  baseUrl: 'https://www.flowtennis.cn'
});
assert.strictEqual(financialLedgerSourceSnapshot.summary.totalIncome.value, 19196.5, 'financial ledger recognized revenue must be the weekly business revenue source');
assert.strictEqual(financialLedgerSourceSnapshot.sections.revenue.receipts.totalAmount, 33939, 'financial ledger cashDelta must drive weekly cash received without double-counting legacy rows');
assert.strictEqual(financialLedgerSourceSnapshot.sections.revenue.receipts.courseAmount, 25199, 'financial ledger course receipts should be converted from cents to yuan');
assert.strictEqual(financialLedgerSourceSnapshot.sections.revenue.receipts.bookingAmount, 4740, 'financial ledger booking receipts should be converted from cents to yuan');
assert.strictEqual(financialLedgerSourceSnapshot.sections.revenue.receipts.storedValueAmount, 4000, 'financial ledger stored value receipts should be converted from cents to yuan');
assert.strictEqual(financialLedgerSourceSnapshot.sections.revenue.recognized.courseConsumedRevenue, 8250, 'financial ledger course recognized revenue should be used instead of zero temporary rows');
assert.strictEqual(financialLedgerSourceSnapshot.sections.revenue.recognized.memberBookingConsumedRevenue, 6206.5, 'financial ledger member booking recognized revenue should be used');
assert.strictEqual(financialLedgerSourceSnapshot.sections.revenue.recognized.guestBookingRevenue, 4740, 'financial ledger guest booking recognized revenue should be used');

const antiZeroSnapshot = buildWeeklyBusinessReportSnapshot({
  period,
  operationsPayload: {
    operations: {
      overview: { cards: { totalIncome: { value: 29199 }, recognizedRevenue: { value: 4740 }, courseRecognized: { value: 3500 } } },
      court: { cards: { utilizationRate: { value: 29 } } },
      coach: { cards: { usedHours: { value: 83 } } }
    },
    weeklyReportRaw: {
      coaches: [{ name: '朝珺', status: '在职' }],
      purchases: [{ id: 'anti-zero-purchase', studentId: 'anti-zero-student', courseType: '私教课', amountPaid: 25199, purchaseDate: '2026-08-28', status: 'active', campus: 'shunyi_mapo' }],
      schedule: [{ id: 'anti-zero-schedule', coach: '朝珺教练', studentId: 'anti-zero-student', studentName: '反例学员', courseType: '私教课', startTime: '2026-08-28 10:00:00', endTime: '2026-08-28 12:00:00', status: '已排课', campus: 'shunyi_mapo', venue: '1号场' }],
      financeNormalizedRows: [
        { id: 'anti-zero-course-cash', campusName: '顺义马坡', businessDate: '2026-08-28', businessType: '课程', action: '收款', cashDelta: 25199, recognizedRevenueDelta: 0 },
        { id: 'anti-zero-stored-cash', campusName: '顺义马坡', businessDate: '2026-08-29', businessType: '会员储值', action: '收款', cashDelta: 4000, recognizedRevenueDelta: 0 }
      ]
    }
  },
  previousOperationsPayload: {
    operations: { overview: { cards: { totalIncome: { value: 28729 }, recognizedRevenue: { value: 2600 }, courseRecognized: { value: 2000 } } }, court: { cards: { utilizationRate: { value: 39 } } }, coach: { cards: { usedHours: { value: 60 } } } },
    weeklyReportRaw: {
      coaches: [{ name: '朝珺', status: '在职' }],
      schedule: [{ id: 'anti-zero-prev-schedule', coach: '朝珺教练', studentId: 'anti-zero-prev-student', studentName: '上周学员', courseType: '私教课', startTime: '2026-08-20 10:00:00', endTime: '2026-08-20 11:00:00', status: '已排课', campus: 'shunyi_mapo', venue: '1号场' }],
      financeNormalizedRows: [{ id: 'anti-zero-prev-cash', campusName: '顺义马坡', businessDate: '2026-08-20', businessType: '课程', action: '收款', cashDelta: 13729, recognizedRevenueDelta: 0 }]
    }
  },
  trendOperationsPayloads: [
    {
      period: { startDate: '2026-08-11', endDate: '2026-08-18' },
      payload: {
        operations: { overview: { cards: { totalIncome: { value: 18000 }, recognizedRevenue: { value: 1800 }, courseRecognized: { value: 1200 } } }, court: { cards: { utilizationRate: { value: 22 } } }, coach: { cards: { usedHours: { value: 44 } } } },
        weeklyReportRaw: {
          coaches: [{ name: '朝珺', status: '在职' }],
          schedule: [{ id: 'anti-zero-trend-schedule', coach: '朝珺教练', studentId: 'trend-student', studentName: '趋势学员', courseType: '私教课', startTime: '2026-08-12 10:00:00', endTime: '2026-08-12 11:30:00', status: '已排课', campus: 'shunyi_mapo', venue: '1号场' }],
          financeNormalizedRows: [{ id: 'anti-zero-trend-cash', campusName: '顺义马坡', businessDate: '2026-08-12', businessType: '课程', action: '收款', cashDelta: 18000, recognizedRevenueDelta: 0 }]
        }
      }
    }
  ],
  shareToken: 'token-anti-zero',
  baseUrl: 'https://www.flowtennis.cn'
});
assert.strictEqual(antiZeroSnapshot.summary.totalIncome.value, 4740, 'anti-zero: business revenue must fall back to the platform recognized revenue card when raw finance receipts exist but recognized rows are absent');
assert.strictEqual(antiZeroSnapshot.sections.revenue.course.consumedAmount, 3500, 'anti-zero: course consumed revenue must use the platform course recognized card instead of dropping to zero');
assert.ok(antiZeroSnapshot.sections.revenue.course.completedHours > 0, 'anti-zero: past calendar lessons shown as completed must not become zero completed hours');
assert.ok(antiZeroSnapshot.summary.coachHours.value > 0, 'anti-zero: coach completed hours must not be zero when completed calendar lessons exist');
['businessRevenue', 'cashReceived', 'courtUtilizationRate', 'coachHours'].forEach(key => {
  antiZeroSnapshot.sections.trends.forEach(row => {
    assert.ok(Number(row[key]) > 0, `anti-zero: ${key} trend value must not be zero when platform data exists for ${row.label}`);
  });
});

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

const duplicateCourtUsageSnapshot = buildWeeklyBusinessReportSnapshot({
  period,
  operationsPayload: {
    operations: { overview: { cards: { totalIncome: { value: 1 } } } },
    weeklyReportRaw: {
      courts: [{
        id: 'court-duplicate-usage',
        campus: 'shunyi_mapo',
        history: [
          { id: 'duplicate-member', type: '消费', category: '会员订场', date: '2026-08-28', startTime: '2026-08-28 10:00:00', endTime: '2026-08-28 11:00:00', venue: '1号场', payMethod: '储值扣款', amount: 112 },
          { id: 'duplicate-guest', type: '消费', category: '散客订场', date: '2026-08-28', startTime: '2026-08-28 10:00:00', endTime: '2026-08-28 11:00:00', venue: '1号场', payMethod: '微信转账', amount: 140 },
          { id: 'free-usage', type: '消费', category: '内部占用', date: '2026-08-28', startTime: '2026-08-28 11:00:00', endTime: '2026-08-28 12:00:00', venue: '1号场', payMethod: '不涉及支付', amount: 0 }
        ]
      }]
    }
  },
  previousOperationsPayload: { operations: {} },
  shareToken: 'token-duplicate-court-usage',
  baseUrl: 'https://www.flowtennis.cn'
});
assert.strictEqual(duplicateCourtUsageSnapshot.sections.court.actualUsedHours, 1, 'duplicate booking rows must count one physical occupied hour and exclude internal usage from total hours');
assert.strictEqual(duplicateCourtUsageSnapshot.sections.court.revenueUsageHours, 1, 'duplicate booking rows must count one paid occupied hour for utilization');
assert.strictEqual(duplicateCourtUsageSnapshot.sections.court.freeUsage.hours, 1, 'internal usage hours should remain visible as a separate free usage metric');

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
      students: [
        { id: 'e927ccc1-c1a7-4375-bff2-526b57b78ef7', name: '周阿龙（Along）' }
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
        { id: 'coach-current', coach: '朝珺教练', studentName: 'e927ccc1-c1a7-4375-bff2-526b57b78ef7', courseType: '私教课', startTime: '2026-08-28 10:00:00', endTime: '2026-08-28 12:00:00', status: '已下课', campus: 'shunyi_mapo' },
        { id: 'dirty-current', coach: '小鹿教练', lessonCount: 2, startTime: '2026-08-28 10:00:00', endTime: '2026-08-28 12:00:00', status: '已排课', campus: 'shunyi_mapo' },
        { id: 'coach-prev', coach: '朝珺教练', courseType: '私教课', startTime: '2026-08-20 10:00:00', endTime: '2026-08-20 11:00:00', status: '已下课', campus: 'shunyi_mapo' },
        { id: 'inactive-coach', coach: '宋教练', courseType: '私教课', startTime: '2026-08-28 12:00:00', endTime: '2026-08-28 13:00:00', status: '已下课', campus: 'shunyi_mapo' }
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
      schedule: [{ id: 'coach-prev-only', coach: '朝珺教练', courseType: '私教课', startTime: '2026-08-20 10:00:00', endTime: '2026-08-20 11:00:00', status: '已下课', campus: 'shunyi_mapo' }],
      courts: []
    }
  },
  shareToken: 'token-raw',
  baseUrl: 'https://www.flowtennis.cn'
});
assert.strictEqual(rawSnapshot.sections.revenue.course.totalPeople, 2, 'course total people should count private package buyers');
assert.strictEqual(rawSnapshot.sections.revenue.course.activePrivatePackagePeople, 0, 'course active private package people should not count depleted private packages');
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
assert.deepStrictEqual(rawSnapshot.sections.court.usageRows.find(row => row.key === 'guest')?.compare?.count, { previousValue: 0, currentValue: 1, changeValue: 1, changeRate: null }, 'guest booking count should expose previous-week comparison');
assert.strictEqual(rawSnapshot.sections.court.usageRows.map(row => row.label).join('|'), '会员订场|散客订场|课程订场|领导订场|内部使用|约球局', 'weekly report should display the six standard court booking types');
assert.strictEqual(rawSnapshot.sections.court.usageRows.find(row => row.key === 'course')?.hours, 3, 'course court usage should come from schedule rows that occupy courts');
assert.strictEqual(rawSnapshot.sections.court.actualUsedHours, 7, 'court usage hours should exclude internal and leader usage while keeping them in the separate free usage metric');
assert.strictEqual(rawSnapshot.sections.court.utilizationRate, 1.56, 'court utilization should use paid court usage including course occupancy divided by actual report-period capacity');
assert.strictEqual(rawSnapshot.sections.court.usageRows.find(row => row.key === 'free')?.amount, 0, 'free court usage actual amount should be zero');
assert.strictEqual(rawSnapshot.summary.courtUsageHours.value, rawSnapshot.sections.court.actualUsedHours, 'weekly report list summary should expose court usage hours from report sections');
assert.strictEqual(rawSnapshot.sections.coach.rows.length, 1, 'coach report should only show active coaches with current-period schedules');
assert.strictEqual(rawSnapshot.sections.coach.rows[0].coach, '朝珺教练', 'inactive and no-schedule coaches should be excluded from coach report');
assert.strictEqual(rawSnapshot.sections.coach.rows[0].scheduledCount, 2, 'coach current scheduled column should use current week hours');
assert.strictEqual(rawSnapshot.sections.coach.rows[0].previousHours, 1, 'coach current/previous column should include previous week hours');
assert.strictEqual(rawSnapshot.sections.coach.totalHours, 2, 'coach completed hours should only count lessons explicitly marked as completed');
assert.strictEqual(rawSnapshot.sections.coach.rows[0].lessonRows[0].student, '周阿龙（Along）', 'coach lesson details should resolve UUID studentName values from the student source rows');
assert.notStrictEqual(rawSnapshot.sections.coach.rows[0].lessonRows[0].student, 'e927ccc1-c1a7-4375-bff2-526b57b78ef7', 'coach lesson details must not expose dirty UUID student names');
assert.strictEqual(rawSnapshot.sections.conversion.trialDeals, 1, 'conversion top trial deals should equal source row total');
assert.ok(rawSnapshot.sections.conversion.sourceRows.find(row => row.source === '抖音' && row.leads === 0), 'conversion source table should include standard zero-value sources');

const cumulativeCourseScopeSnapshot = buildWeeklyBusinessReportSnapshot({
  period: nextPeriod,
  operationsPayload: {
    operations: { overview: { cards: { totalIncome: { value: 1 }, recognizedRevenue: { value: 1 } } } },
    weeklyReportRaw: {
      purchases: [{ id: 'week37-purchase', studentId: 'week37-student', courseType: '私教课', packageName: '1v1私教课', amountPaid: 5500, purchaseDate: '2026-09-05', status: 'active', campus: 'shunyi_mapo' }],
      entitlements: [{ id: 'week37-entitlement', studentId: 'week37-student', courseType: '私教课', remainingLessons: 8, validUntil: '2026-12-31', status: 'active', campus: 'shunyi_mapo' }],
      financeNormalizedRows: [{ id: 'week37-consume', businessDate: '2026-09-06', businessType: '课程', action: '消耗', recognizedRevenueDelta: 2000, campusName: '顺义马坡' }]
    }
  },
  previousOperationsPayload: { operations: {}, weeklyReportRaw: {} },
  totalOperationsPayload: {
    operations: {},
    weeklyReportRaw: {
      purchases: [
        { id: 'older-purchase', studentId: 'older-student', courseType: '私教课', packageName: '1v1私教课', amountPaid: 4500, purchaseDate: '2026-08-20', status: 'active', campus: 'shunyi_mapo' },
        { id: 'week37-purchase', studentId: 'week37-student', courseType: '私教课', packageName: '1v1私教课', amountPaid: 5500, purchaseDate: '2026-09-05', status: 'active', campus: 'shunyi_mapo' }
      ],
      entitlements: [
        { id: 'older-entitlement', studentId: 'older-student', courseType: '私教课', remainingLessons: 3, validUntil: '2026-12-31', status: 'active', campus: 'shunyi_mapo' },
        { id: 'week37-entitlement', studentId: 'week37-student', courseType: '私教课', remainingLessons: 8, validUntil: '2026-12-31', status: 'active', campus: 'shunyi_mapo' }
      ],
      financeNormalizedRows: [
        { id: 'older-consume', businessDate: '2026-08-25', businessType: '课程', action: '消耗', recognizedRevenueDelta: 1000, campusName: '顺义马坡' },
        { id: 'week37-consume', businessDate: '2026-09-06', businessType: '课程', action: '消耗', recognizedRevenueDelta: 2000, campusName: '顺义马坡' }
      ]
    }
  },
  shareToken: 'token-cumulative-course-scope',
  baseUrl: 'https://www.flowtennis.cn'
});
assert.strictEqual(cumulativeCourseScopeSnapshot.sections.revenue.course.totalPeople, 2, 'course top people must use lifetime facts instead of current-week purchases');
assert.strictEqual(cumulativeCourseScopeSnapshot.sections.revenue.course.totalAmount, 10000, 'course top amount must use lifetime purchases instead of current-week amount');
assert.strictEqual(cumulativeCourseScopeSnapshot.sections.revenue.course.totalConsumedAmount, 3000, 'course top consumed amount must use lifetime recognized revenue');
assert.strictEqual(cumulativeCourseScopeSnapshot.sections.revenue.course.activePrivatePackagePeople, 2, 'course top active people must use entitlements as of report end');
assert.strictEqual(cumulativeCourseScopeSnapshot.sections.revenue.course.paidPeople, 1, 'course weekly paid people must remain current-week data');
assert.strictEqual(cumulativeCourseScopeSnapshot.sections.revenue.course.newAmount, 5500, 'course weekly sales amount must remain current-week data');
assert.strictEqual(cumulativeCourseScopeSnapshot.sections.revenue.course.consumedAmount, 2000, 'course weekly consumed amount must remain current-week data');

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

const storedValueIndexAsOfSnapshot = buildWeeklyBusinessReportSnapshot({
  period: nextPeriod,
  operationsPayload: {
    operations: {},
    weeklyReportRaw: {
      courtAccountListIndexRows: [
        {
          id: 'member-before-cutoff',
          courtId: 'member-before-cutoff',
          item: {
            id: 'member-before-cutoff',
            displayName: '截止日前会员',
            campusCode: 'shunyi_mapo',
            accountType: '会员账户',
            membershipStatusCode: 'active',
            firstOpenDate: '2026-09-08',
            membershipAccount: { id: 'account-before-cutoff', courtId: 'member-before-cutoff' },
            totalDeposit: 2000,
            balance: 2000
          },
          membershipFinanceStats: { memberCount: 1, paidAmount: 2000, bonusAmount: 0, consumableAmount: 2000, pendingAmount: 2000 }
        },
        {
          id: 'member-after-cutoff',
          courtId: 'member-after-cutoff',
          item: {
            id: 'member-after-cutoff',
            displayName: '截止日后会员',
            campusCode: 'shunyi_mapo',
            accountType: '会员账户',
            membershipStatusCode: 'active',
            firstOpenDate: '2026-09-13',
            membershipAccount: { id: 'account-after-cutoff', courtId: 'member-after-cutoff' },
            totalDeposit: 3000,
            balance: 3000
          },
          membershipFinanceStats: { memberCount: 1, paidAmount: 3000, bonusAmount: 0, consumableAmount: 3000, pendingAmount: 3000 }
        }
      ],
      membershipAccounts: [
        { id: 'account-before-cutoff', courtId: 'member-before-cutoff', status: 'active', firstOpenDate: '2026-09-08', createdAt: '2026-09-08' },
        { id: 'account-after-cutoff', courtId: 'member-after-cutoff', status: 'active', firstOpenDate: '2026-09-13', createdAt: '2026-09-13' }
      ],
      membershipOrders: [
        { id: 'order-before-cutoff', membershipAccountId: 'account-before-cutoff', courtId: 'member-before-cutoff', status: 'active', rechargeAmount: 2000, purchaseDate: '2026-09-08' },
        { id: 'order-after-cutoff', membershipAccountId: 'account-after-cutoff', courtId: 'member-after-cutoff', status: 'active', rechargeAmount: 3000, purchaseDate: '2026-09-13' }
      ]
    }
  },
  previousOperationsPayload: { operations: {}, weeklyReportRaw: {} }
});
assert.strictEqual(storedValueIndexAsOfSnapshot.sections.revenue.storedValue.totalMembers, 1, 'stored value total members must be counted as of the report end date, not the generation date');
assert.strictEqual(storedValueIndexAsOfSnapshot.sections.revenue.storedValue.totalAmount, 2000, 'stored value total amount must exclude members opened after the report end date');

const realDataHardGatePeriods = [
  ['2026-07-02', '2026-07-09'],
  ['2026-07-10', '2026-07-17'],
  ['2026-07-18', '2026-07-25'],
  ['2026-07-26', '2026-08-02'],
  ['2026-08-03', '2026-08-10'],
  ['2026-08-11', '2026-08-18']
];
const realDataHardGateFinanceRows = [
  { id: 'historical-total-cash', campusName: '顺义马坡', businessDate: '2026-06-01', businessType: '课程', action: '收款', cashDelta: 1656878.24, recognizedRevenueDelta: 0 },
  ...realDataHardGatePeriods.flatMap(([startDate]) => [
    { id: `trend-cash-${startDate}`, campusName: '顺义马坡', businessDate: startDate, businessType: '课程', action: '收款', cashDelta: 1000, recognizedRevenueDelta: 0 },
    { id: `trend-consume-${startDate}`, campusName: '顺义马坡', businessDate: startDate, businessType: '课程', action: '已入账', cashDelta: 0, recognizedRevenueDelta: 800 },
    { id: `trend-booking-${startDate}`, campusName: '顺义马坡', businessDate: startDate, businessType: '散客订场', displayBusinessType: '场地 / 散客订场', action: '收款', cashDelta: 200, recognizedRevenueDelta: 200, timeText: '10:00-11:00' }
  ]),
  { id: 'previous-course-cash', campusName: '顺义马坡', businessDate: '2026-08-20', businessType: '课程', action: '收款', cashDelta: 19131, recognizedRevenueDelta: 0 },
  { id: 'previous-stored-cash', campusName: '顺义马坡', businessDate: '2026-08-21', businessType: '会员储值', action: '收款', cashDelta: 6000, recognizedRevenueDelta: 0 },
  { id: 'previous-guest-cash', campusName: '顺义马坡', businessDate: '2026-08-22', businessType: '散客订场', displayBusinessType: '场地 / 散客订场', action: '收款', cashDelta: 7686, recognizedRevenueDelta: 7686, timeText: '10:00-11:00' },
  { id: 'previous-course-consume', campusName: '顺义马坡', businessDate: '2026-08-23', businessType: '课程', action: '已入账', cashDelta: 0, recognizedRevenueDelta: 40518 },
  { id: 'previous-member-consume', campusName: '顺义马坡', businessDate: '2026-08-24', businessType: '会员订场', displayBusinessType: '场地 / 会员订场', action: '已入账', cashDelta: 0, recognizedRevenueDelta: 8025, timeText: '11:00-12:00' },
  { id: 'real-course-cash', campusName: '顺义马坡', businessDate: '2026-08-28', businessType: '课程', action: '收款', cashDelta: 37991.99, recognizedRevenueDelta: 0 },
  { id: 'real-stored-cash', campusName: '顺义马坡', businessDate: '2026-08-29', businessType: '会员储值', action: '收款', cashDelta: 4000, recognizedRevenueDelta: 0 },
  { id: 'real-guest-cash', campusName: '顺义马坡', businessDate: '2026-08-30', businessType: '散客订场', displayBusinessType: '场地 / 散客订场', action: '收款', cashDelta: 6424, recognizedRevenueDelta: 6424, timeText: '10:00-11:00' },
  { id: 'real-course-booking-cash', campusName: '顺义马坡', businessDate: '2026-08-31', businessType: '课程订场', displayBusinessType: '场地 / 课程订场', action: '收款', cashDelta: 880, recognizedRevenueDelta: 880, timeText: '12:00-16:00' },
  { id: 'real-course-consume', campusName: '顺义马坡', businessDate: '2026-09-01', businessType: '课程', action: '已入账', cashDelta: 0, recognizedRevenueDelta: 26650.4 },
  { id: 'real-member-consume', campusName: '顺义马坡', businessDate: '2026-09-02', businessType: '会员订场', displayBusinessType: '场地 / 会员订场', action: '已入账', cashDelta: 0, recognizedRevenueDelta: 4557, timeText: '17:00-18:00' }
];
const realDataHardGateScheduleRows = [
  ...realDataHardGatePeriods.map(([startDate]) => ({ id: `trend-schedule-${startDate}`, coach: '朝珺教练', studentName: '趋势学员', courseType: '私教课', startTime: `${startDate} 10:00:00`, endTime: `${startDate} 11:00:00`, status: '已下课', campus: 'shunyi_mapo', venue: '1号场' })),
  { id: 'previous-schedule', coach: '朝珺教练', studentName: '上周学员', courseType: '私教课', startTime: '2026-08-20 10:00:00', endTime: '2026-08-20 11:00:00', status: '已下课', campus: 'shunyi_mapo', venue: '1号场' },
  { id: 'real-schedule-a', coach: '朝珺教练', studentName: '本周学员A', courseType: '私教课', startTime: '2026-08-28 10:00:00', endTime: '2026-08-28 10:30:00', status: '已下课', campus: 'shunyi_mapo', venue: '1号场', durationHours: 40.5 },
  { id: 'real-schedule-b', coach: '刘润扬教练', studentName: '本周学员B', courseType: '小班课', startTime: '2026-08-29 10:00:00', endTime: '2026-08-29 10:30:00', status: '已下课', campus: 'shunyi_mapo', venue: '2号场', durationHours: 40 },
  { id: 'real-schedule-xiaolu', coach: '小鹿教练', studentName: '本周学员C', courseType: '私教课', startTime: '2026-08-30 10:00:00', endTime: '2026-08-30 12:00:00', status: '已下课', campus: 'shunyi_mapo', venue: '3号场', durationHours: 2 }
];
const operationsPayloadWithRawFacts = {
  ...operationsPayload,
  weeklyReportRaw: {
    financeNormalizedRows: realDataHardGateFinanceRows,
    schedule: realDataHardGateScheduleRows,
    coaches: [{ name: '朝珺', status: '在职' }, { name: '刘润扬', status: '在职' }]
  }
};
const realDataHardGateSnapshot = buildWeeklyBusinessReportSnapshot({
  period,
  operationsPayload: {
    operations: {
      overview: { cards: { totalIncome: { value: 29199 }, recognizedRevenue: { value: 0 }, courseRecognized: { value: 0 } } },
      coach: { cards: { usedHours: { value: 80.5 } } },
      court: { cards: { utilizationRate: { value: 29.46 } } }
    },
    weeklyReportRaw: {
      coaches: [{ name: '朝珺', status: '在职' }, { name: '刘润扬', status: '在职' }, { name: '小鹿', status: '在职' }],
      schedule: realDataHardGateScheduleRows,
      courts: [
        { id: 'real-internal-court', campus: 'shunyi_mapo', history: [
          { id: 'real-renovation-0831', type: '消费', category: '全天装修锁场', date: '2026-08-31', startTime: '2026-08-31 08:00:00', endTime: '2026-08-31 22:00:00', amount: 0 },
          { id: 'real-renovation-0901', type: '消费', category: '装修维护内部使用', date: '2026-09-01', startTime: '2026-09-01 08:00:00', endTime: '2026-09-01 22:00:00', amount: 0 }
        ] }
      ],
      financialLedger: [
        { id: 'incomplete-ledger-a', status: 'active', campus: 'shunyi_mapo', businessDate: '2026-08-27', businessType: '课程订场', action: '收款', cashDelta: 22000, recognizedRevenueDelta: 22000 },
        { id: 'incomplete-ledger-b', status: 'active', campus: 'shunyi_mapo', businessDate: '2026-08-29', businessType: '课程订场', action: '收款', cashDelta: 22000, recognizedRevenueDelta: 22000 },
        { id: 'incomplete-ledger-c', status: 'active', campus: 'shunyi_mapo', businessDate: '2026-08-29', businessType: '课程订场', action: '收款', cashDelta: 22000, recognizedRevenueDelta: 22000 },
        { id: 'incomplete-ledger-d', status: 'active', campus: 'shunyi_mapo', businessDate: '2026-08-29', businessType: '课程订场', action: '收款', cashDelta: 22000, recognizedRevenueDelta: 22000 },
        { id: 'incomplete-ledger-e', status: 'active', campus: 'shunyi_mapo', businessDate: '2026-08-30', businessType: '课程订场', action: '收款', cashDelta: 44000, recognizedRevenueDelta: 44000 }
      ],
      financeNormalizedRows: realDataHardGateFinanceRows
    }
  },
  previousOperationsPayload: {
    operations: { overview: { cards: { totalIncome: { value: 0 }, recognizedRevenue: { value: 0 }, courseRecognized: { value: 0 } } } },
    weeklyReportRaw: { financeNormalizedRows: realDataHardGateFinanceRows, schedule: realDataHardGateScheduleRows }
  },
  totalOperationsPayload: {
    operations: { overview: { cards: { totalIncome: { value: 989113.24 }, recognizedRevenue: { value: 0 } } } }
  },
  shareToken: 'real-data-hard-gate',
  baseUrl: 'https://www.flowtennis.cn'
});
assert.strictEqual(realDataHardGateSnapshot.lifetimeSummary.totalIncome.value, 1746191.23, 'real hard gate: lifetime income must use complete finance facts through report end date instead of the stale 989113 operations card');
assert.strictEqual(realDataHardGateSnapshot.sections.revenue.receipts.totalAmount, 49295.99, 'real hard gate: weekly cash received must use the complete platform finance facts');
assert.strictEqual(realDataHardGateSnapshot.summary.totalIncome.value, 38511.4, 'real hard gate: weekly business revenue must use complete recognized revenue facts');
assert.strictEqual(realDataHardGateSnapshot.sections.revenue.recognized.courseConsumedRevenue, 26650.4, 'real hard gate: course consumed revenue must not drop to zero');
assert.strictEqual(realDataHardGateSnapshot.sections.revenue.recognized.memberBookingConsumedRevenue, 4557, 'real hard gate: member booking consumed revenue must use finance facts');
assert.strictEqual(realDataHardGateSnapshot.sections.revenue.receipts.bookingAmount, 7304, 'real hard gate: weekly booking receipts should include guest bookings and course court fees');
assert.strictEqual(realDataHardGateSnapshot.sections.revenue.recognized.guestBookingRevenue, 7304, 'real hard gate: paid booking revenue should include course court fees');
assert.strictEqual(realDataHardGateSnapshot.sections.revenue.receipts.storedValueAmount, 4000, 'real hard gate: stored value receipts must use finance facts');
assert.strictEqual(realDataHardGateSnapshot.sections.revenue.course.completedHours, 80.5, 'real hard gate: completed course hours must exclude dirty Xiaolu schedule rows');
assert.strictEqual(realDataHardGateSnapshot.summary.coachHours.value, 80.5, 'real hard gate: top completed hours must match reportable coach hours');
assert.strictEqual(realDataHardGateSnapshot.sections.court.usageRows.find(row => row.key === 'course')?.hours, 80.5, 'real hard gate: course court occupancy must match reportable coach hours');
assert.strictEqual(realDataHardGateSnapshot.sections.court.usageRows.find(row => row.key === 'free')?.hours, 28, 'real hard gate: renovation and locked courts must be counted as internal use');
assert.strictEqual(realDataHardGateSnapshot.sections.trends.length, 8, 'real hard gate: weekly trends must be rebuilt to eight periods from facts');
realDataHardGateSnapshot.sections.trends.forEach(row => {
  ['businessRevenue', 'cashReceived', 'courtUtilizationRate', 'coachHours'].forEach(key => {
    assert.ok(Number(row[key]) > 0, `real hard gate: ${key} must not be zero for ${row.label}`);
  });
});

const staleZeroTrendSnapshot = buildWeeklyBusinessReportSnapshot({
  period,
  operationsPayload: operationsPayloadWithRawFacts,
  previousOperationsPayload: {
    operations: { overview: { cards: { totalIncome: { value: 0 }, recognizedRevenue: { value: 0 }, courseRecognized: { value: 0 } } } },
    weeklyReportRaw: { financeNormalizedRows: realDataHardGateFinanceRows, schedule: realDataHardGateScheduleRows }
  },
  totalOperationsPayload: {
    operations: { overview: { cards: { totalIncome: { value: 989113.24 } } } }
  },
  trendOperationsPayloads: realDataHardGatePeriods.map(([startDate, endDate]) => ({
    period: { startDate, endDate },
    payload: {
      operations: {
        overview: { cards: { totalIncome: { value: 0 }, recognizedRevenue: { value: 0 }, courseRecognized: { value: 0 } } },
        court: { cards: { utilizationRate: { value: 0 } } },
        coach: { cards: { usedHours: { value: 0 } } }
      }
    }
  }))
});
staleZeroTrendSnapshot.sections.trends.forEach(row => {
  ['businessRevenue', 'cashReceived', 'courtUtilizationRate', 'coachHours'].forEach(key => {
    assert.ok(Number(row[key]) > 0, `stale zero trend snapshots should be replaced by raw facts for ${row.label} ${key}`);
  });
});

const duplicateScheduleSnapshot = buildWeeklyBusinessReportSnapshot({
  period,
  operationsPayload: {
    operations: {},
    weeklyReportRaw: {
      schedule: [
        { id:'schedule-primary', campus:'shunyi_mapo', coach:'杨教练', studentName:'M.Z', courseType:'私教课', status:'已排课', startTime:'2026-08-28 11:00:00', endTime:'2026-08-28 12:00:00' },
        { id:'third-party-duplicate', campus:'shunyi_mapo', coach:'杨教练', studentName:'M.Z', courseType:'私教课', status:'已排课', startTime:'2026-08-28 11:00:00', endTime:'2026-08-28 12:00:00', scheduleSource:'第三方同步排课' }
      ]
    }
  },
  previousOperationsPayload: { operations: {}, weeklyReportRaw: { schedule: [] } },
  totalOperationsPayload: { operations: {}, weeklyReportRaw: { schedule: [] } }
});
assert.strictEqual(duplicateScheduleSnapshot.summary.coachHours.value, 1, 'weekly report completed hours should count duplicate calendar schedule rows only once');

const dirtyCoachScheduleSnapshot = buildWeeklyBusinessReportSnapshot({
  period: nextPeriod,
  operationsPayload: {
    operations: {},
    weeklyReportRaw: {
      coaches: [{ name: '刘润扬', status: '在职' }, { name: '小鹿', status: '在职' }],
      schedule: [
        { id: 'valid-coach-lesson', campus: 'shunyi_mapo', coach: '刘润扬教练', studentName: '真实学员', courseType: '私教课', status: '已下课', startTime: '2026-09-09 14:00:00', endTime: '2026-09-09 15:00:00', venue: '1号场' },
        { id: 'dirty-xiaolu-lesson', campus: 'shunyi_mapo', coach: '小鹿', studentName: '小鹿', courseType: '私教课', status: '已下课', startTime: '2026-09-09 16:00:00', endTime: '2026-09-09 18:00:00', venue: '2号场' }
      ]
    }
  },
  previousOperationsPayload: { operations: {}, weeklyReportRaw: { schedule: [] } },
  totalOperationsPayload: { operations: {}, weeklyReportRaw: { schedule: [] } }
});
assert.strictEqual(dirtyCoachScheduleSnapshot.sections.revenue.course.completedHours, 1, 'dirty Xiaolu schedule must not enter course completed hours');
assert.strictEqual(dirtyCoachScheduleSnapshot.summary.coachHours.value, 1, 'dirty Xiaolu schedule must not enter top completed hours');
assert.strictEqual(dirtyCoachScheduleSnapshot.sections.court.usageRows.find(row => row.key === 'course')?.hours, 1, 'dirty Xiaolu schedule must not enter course court usage hours');
assert.strictEqual(dirtyCoachScheduleSnapshot.sections.coach.rows.length, 1, 'dirty Xiaolu schedule must not render a coach row');

const leadDetailsSnapshot = buildWeeklyBusinessReportSnapshot({
  period: nextPeriod,
  operationsPayload: {
    operations: {
      conversion: {
        cards: { totalLeads: { value: 2 } },
        sourceRows: [{ source: '大众点评', totalLeads: 1 }, { source: '抖音', totalLeads: 1 }]
      }
    },
    weeklyReportRaw: {
      leads: [
        { id: 'lead-in-week-a', displayName: '本周线索A', leadDate: '2026-09-04', source: '大众点评', owner: 'Mira', leadStage: '跟进中', demandProduct: '成人私教课', campus: 'shunyi_mapo' },
        { id: 'lead-in-week-b', displayName: '本周线索B', createdAt: '2026-09-08 12:00:00', source: '抖音', owner: 'Mira', leadStage: '已约体验', consultType: '青少年体验课', campus: 'shunyi_mapo' },
        { id: 'lead-after-week', displayName: '周后线索', leadDate: '2026-09-13', source: '大众点评', owner: 'Mira', leadStage: '跟进中', campus: 'shunyi_mapo' }
      ],
      students: [
        { id: 'trial-student-paid', name: '体验转化学员', type: '成人', campus: 'shunyi_mapo' },
        { id: 'trial-student-unpaid', name: '未转化学员', studentType: '青少年', campus: 'shunyi_mapo' },
        { id: 'receipt-student', name: '新增收款学员', type: '成人', campus: 'shunyi_mapo' }
      ],
      schedule: [
        { id: 'trial-schedule-paid', studentId: 'trial-student-paid', studentName: '体验转化学员', coach: '朝珺教练', courseType: '体验课', experienceType: '成人体验课', startTime: '2026-09-05 10:00:00', endTime: '2026-09-05 11:00:00', status: '已下课', campus: 'shunyi_mapo' },
        { id: 'trial-schedule-unpaid', studentId: 'trial-student-unpaid', studentName: '未转化学员', coach: '刘润扬教练', courseType: '体验课', experienceType: '青少年体验课', startTime: '2026-09-06 15:30:00', endTime: '2026-09-06 16:30:00', status: '已下课', campus: 'shunyi_mapo' }
      ],
      purchases: [
        { id: 'formal-after-trial', studentId: 'trial-student-paid', studentName: '体验转化学员', courseType: '私教课', packageName: '成人1v1私教课', purchaseDate: '2026-09-07', amountPaid: 5000, status: 'active', campus: 'shunyi_mapo' },
        { id: 'receipt-purchase', studentId: 'receipt-student', studentName: '新增收款学员', courseType: '私教课', packageName: '成人1v1私教课', purchaseDate: '2026-09-08', amountPaid: 3000, status: 'active', campus: 'shunyi_mapo' }
      ],
      financeNormalizedRows: [
        { id: 'course-receipt-detail', campusName: '顺义马坡', studentId: 'receipt-student', customerType: '成人', businessDate: '2026-09-08', businessType: '课程', action: '收款', cashDelta: 3000, sourceDocument: '购买记录 receipt-purchase', packageName: '成人1v1私教课', paymentChannel: '微信' }
      ]
    }
  },
  previousOperationsPayload: { operations: {}, weeklyReportRaw: {} }
});
assert.deepStrictEqual(leadDetailsSnapshot.sections.conversion.newLeadRows.map(row => row.name), ['本周线索A', '本周线索B'], 'weekly report should expose current-week lead detail rows only');
assert.strictEqual(leadDetailsSnapshot.sections.conversion.newLeadRows[0].demandProduct, '成人私教课', 'weekly lead detail rows should expose demand product from raw lead rows');
assert.strictEqual(leadDetailsSnapshot.sections.conversion.newLeadRows[1].demandProduct, '青少年体验课', 'weekly lead detail rows should fall back to consult type when demand product is missing');
assert.deepStrictEqual(
  leadDetailsSnapshot.sections.conversion.trialConversionRows.map(row => [row.date, row.time, row.student, row.type, row.coach, row.converted]),
  [
    ['2026-09-05', '10:00-11:00', '体验转化学员', '成人', '朝珺教练', '是'],
    ['2026-09-06', '15:30-16:30', '未转化学员', '青少年', '刘润扬教练', '否']
  ],
  'weekly report should expose current-week trial lesson conversion detail rows'
);
assert.deepStrictEqual(
  leadDetailsSnapshot.sections.revenue.course.receiptRows.map(row => [row.date, row.student, row.type, row.product, row.amount, row.payMethod]),
  [['2026-09-07', '体验转化学员', '成人', '成人1v1私教课', 5000, '-'], ['2026-09-08', '新增收款学员', '成人', '成人1v1私教课', 3000, '微信']],
  'weekly report should expose unique current-week private course purchase rows'
);
const leadDetailsHtml = renderWeeklyBusinessReportHtml(leadDetailsSnapshot);
assert.match(leadDetailsHtml, /本周新增线索明细[\s\S]*本周线索A[\s\S]*本周线索B/, 'weekly report should render current-week lead details');
assert.match(leadDetailsHtml, /本周新增线索明细[\s\S]*需求产品[\s\S]*成人私教课[\s\S]*青少年体验课/, 'weekly report should render demand product in current-week lead details');
assert.match(leadDetailsHtml, /2026-09-04 周五[\s\S]*2026-09-08 周二/, 'lead detail dates should include weekdays');
assert.match(leadDetailsHtml, /lead-stage-tag[\s\S]*跟进中[\s\S]*lead-stage-tag[\s\S]*已约体验/, 'weekly report should render lead stages as quick-scan text tags');
assert.match(leadDetailsHtml, /本周体验课转化明细[\s\S]*日期[\s\S]*时间[\s\S]*学员[\s\S]*类型[\s\S]*教练[\s\S]*是否付费转化[\s\S]*备注/, 'weekly report should render trial lesson conversion details with the requested columns');
assert.match(leadDetailsHtml, /2026-09-05 周六[\s\S]*10:00-11:00[\s\S]*体验转化学员[\s\S]*成人[\s\S]*朝珺教练[\s\S]*是/, 'trial conversion detail should render paid conversion rows with weekday dates');
assert.match(leadDetailsHtml, /2026-09-06 周日[\s\S]*15:30-16:30[\s\S]*未转化学员[\s\S]*青少年[\s\S]*刘润扬教练[\s\S]*否/, 'trial conversion detail should render non-conversion rows with weekday dates');
assert.match(leadDetailsHtml, /data-edit-key="conversion\.trialConversionRows\.trial-schedule-paid\.remark"/, 'trial conversion remarks should use stable schedule id edit keys');
assert.match(leadDetailsHtml, /2\.1 课程收款[\s\S]*购买名单[\s\S]*2026-09-08 周二[\s\S]*新增收款学员[\s\S]*成人1v1私教课[\s\S]*3,000元/, 'course section should render the unique private course purchase list');
assert.match(leadDetailsHtml, /data-edit-key="course\.receiptRows\.course-receipt-detail\.remark"/, 'course receipt remarks should use stable receipt id edit keys');
const editedDetailHtml = renderWeeklyBusinessReportHtml({
  ...leadDetailsSnapshot,
  publicEdits: {
    'conversion.trialConversionRows.trial-schedule-paid.remark': '人工备注保留',
    'course.receiptRows.course-receipt-detail.remark': '收款备注保留',
    remark: '底部备注保留'
  }
});
assert.match(editedDetailHtml, /收款备注保留[\s\S]*人工备注保留[\s\S]*底部备注保留/, 'manual table remarks and bottom report remark should survive rerendering from saved public edits');

const lifetimeCutoffSnapshot = buildWeeklyBusinessReportSnapshot({
  period,
  operationsPayload: {
    operations: {},
    weeklyReportRaw: {
      financeNormalizedRows: [
        { id: 'lifetime-mapo-before', campusName: '顺义马坡', businessDate: '2026-06-01', businessType: '课程', action: '收款', cashDelta: 1000, recognizedRevenueDelta: 0 },
        { id: 'lifetime-unknown-before', campusName: '—', businessDate: '2026-06-02', businessType: '课程', action: '收款', cashDelta: 200, recognizedRevenueDelta: 0 },
        { id: 'lifetime-chaojun-before', campusName: '朝珺私教', businessDate: '2026-06-03', businessType: '课程', action: '收款', cashDelta: 300, recognizedRevenueDelta: 0 },
        { id: 'lifetime-other-before', campusName: '朝阳十里堡', businessDate: '2026-06-04', businessType: '课程订场', action: '收款', cashDelta: 50, recognizedRevenueDelta: 50 },
        { id: 'lifetime-after-period', campusName: '顺义马坡', businessDate: '2026-09-04', businessType: '课程', action: '收款', cashDelta: 9999, recognizedRevenueDelta: 0 }
      ]
    }
  },
  previousOperationsPayload: { operations: {}, weeklyReportRaw: {} },
  totalOperationsPayload: { operations: { overview: { cards: { totalIncome: { value: 989113.24 } } } } }
});
assert.strictEqual(lifetimeCutoffSnapshot.lifetimeSummary.totalIncome.value, 1550, 'weekly report lifetime income should use platform receipts through report end date instead of stale cards or campus-only filters');

const lifetimeNetSnapshot = buildWeeklyBusinessReportSnapshot({
  period,
  operationsPayload: {
    operations: {},
    weeklyReportRaw: {
      financeNormalizedRows: [
        { id: 'net-receipt', businessDate: '2026-06-01', businessType: '课程', action: '收款', cashDelta: 1000, recognizedRevenueDelta: 0 },
        { id: 'net-refund', businessDate: '2026-06-02', businessType: '课程', action: '退款', cashDelta: -200, recognizedRevenueDelta: 0 },
        { id: 'net-after-period', businessDate: '2026-09-04', businessType: '课程', action: '收款', cashDelta: 9999, recognizedRevenueDelta: 0 }
      ]
    }
  },
  previousOperationsPayload: { operations: {}, weeklyReportRaw: {} },
  totalOperationsPayload: { operations: { overview: { cards: { totalIncome: { value: 989113.24 } } } } }
});
assert.strictEqual(lifetimeNetSnapshot.lifetimeSummary.totalIncome.value, 1000, 'weekly report lifetime total income should use positive receipts and exclude receipts after the report end date');
assert.strictEqual(lifetimeNetSnapshot.lifetimeSummary.refundAmount.value, 200, 'weekly report lifetime refund amount should be shown separately');
assert.strictEqual(lifetimeNetSnapshot.lifetimeSummary.netCashIncome.value, 800, 'weekly report lifetime net cash should subtract refunds and exclude receipts after the report end date');

const privatePurchaseListSnapshot = buildWeeklyBusinessReportSnapshot({
  period,
  operationsPayload: {
    operations: {},
    weeklyReportRaw: {
      purchases: [
        { id: 'private-purchase-1', studentId: 'student-1', studentName: '重复购买学员', courseType: '私教课', packageName: '成人1v1私教课', purchaseDate: '2026-08-28', amountPaid: 1000, campus: 'shunyi_mapo' },
        { id: 'private-purchase-2', studentId: 'student-1', studentName: '重复购买学员', courseType: '私教课', packageName: '成人1v1私教课', purchaseDate: '2026-08-29', amountPaid: 1200, campus: 'shunyi_mapo' },
        { id: 'private-purchase-3', studentId: 'student-2', studentName: '私教购买学员2', courseType: '私教课', packageName: '成人1v1私教课', purchaseDate: '2026-08-30', amountPaid: 2000, campus: 'shunyi_mapo' },
        { id: 'private-purchase-4', studentId: 'student-3', studentName: '私教购买学员3', courseType: '私教课', packageName: '成人1v1私教课', purchaseDate: '2026-08-31', amountPaid: 3000, campus: 'shunyi_mapo' },
        { id: 'small-class-purchase', studentId: 'student-4', studentName: '小班学员', courseType: '小班课', packageName: '小班课', purchaseDate: '2026-08-31', amountPaid: 4000, campus: 'shunyi_mapo' }
      ],
      financeNormalizedRows: [
        { id: 'private-receipt-1', businessDate: '2026-08-28', businessType: '课程', action: '收款', cashDelta: 1000, sourceDocument: '购买记录 private-purchase-1', packageName: '成人1v1私教课', campusName: '顺义马坡' },
        { id: 'private-receipt-2', businessDate: '2026-08-29', businessType: '课程', action: '收款', cashDelta: 1200, sourceDocument: '购买记录 private-purchase-2', packageName: '成人1v1私教课', campusName: '顺义马坡' },
        { id: 'private-receipt-3', businessDate: '2026-08-30', businessType: '课程', action: '收款', cashDelta: 2000, sourceDocument: '购买记录 private-purchase-3', packageName: '成人1v1私教课', campusName: '顺义马坡' },
        { id: 'private-receipt-4', businessDate: '2026-08-31', businessType: '课程', action: '收款', cashDelta: 3000, sourceDocument: '购买记录 private-purchase-4', packageName: '成人1v1私教课', campusName: '顺义马坡' },
        { id: 'small-class-receipt', businessDate: '2026-08-31', businessType: '课程', action: '收款', cashDelta: 4000, sourceDocument: '购买记录 small-class-purchase', packageName: '小班课', campusName: '顺义马坡' }
      ]
    }
  },
  previousOperationsPayload: { operations: {}, weeklyReportRaw: {} }
});
assert.strictEqual(privatePurchaseListSnapshot.sections.revenue.course.paidPeople, 3, 'private course purchase people should deduplicate repeated purchases by student');
assert.deepStrictEqual(privatePurchaseListSnapshot.sections.revenue.course.receiptRows.map(row => row.student), ['重复购买学员', '私教购买学员2', '私教购买学员3'], 'private course purchase list should use the same unique student set as the people metric');

const privateActivePackageSnapshot = buildWeeklyBusinessReportSnapshot({
  period,
  operationsPayload: {
    operations: {},
    weeklyReportRaw: {
      students: [
        { id: 'active-private', name: '私教在期', campus: 'shunyi_mapo' },
        { id: 'active-small', name: '小班在期', campus: 'shunyi_mapo' },
        { id: 'single-pay', name: '单次付费', campus: 'shunyi_mapo' },
        { id: 'expired-private', name: '私教过期', campus: 'shunyi_mapo' },
        { id: 'future-private', name: '周报后才在期', campus: 'shunyi_mapo' }
      ],
      purchases: [
        { id: 'purchase-active-private', studentId: 'active-private', studentName: '私教在期', courseType: '私教课', packageName: '成人1v1私教课', amountPaid: 5000, packageLessons: 10, purchaseDate: '2026-08-01', status: 'active', campus: 'shunyi_mapo' },
        { id: 'purchase-small', studentId: 'active-small', studentName: '小班在期', courseType: '小班课', packageName: '小班课', amountPaid: 3000, packageLessons: 10, purchaseDate: '2026-08-01', status: 'active', campus: 'shunyi_mapo' },
        { id: 'purchase-expired-private', studentId: 'expired-private', studentName: '私教过期', courseType: '私教课', packageName: '成人1v1私教课', amountPaid: 5000, packageLessons: 10, purchaseDate: '2026-08-01', status: 'active', campus: 'shunyi_mapo' },
        { id: 'purchase-future-private', studentId: 'future-private', studentName: '周报后才在期', courseType: '私教课', packageName: '成人1v1私教课', amountPaid: 5000, packageLessons: 10, purchaseDate: '2026-09-04', status: 'active', campus: 'shunyi_mapo' }
      ],
      entitlements: [
        { id: 'ent-active-private', studentId: 'active-private', purchaseId: 'purchase-active-private', courseType: '私教课', packageName: '成人1v1私教课', totalLessons: 10, remainingLessons: 4, validUntil: '2026-09-03', status: 'active', campus: 'shunyi_mapo' },
        { id: 'ent-small', studentId: 'active-small', purchaseId: 'purchase-small', courseType: '小班课', packageName: '小班课', totalLessons: 10, remainingLessons: 4, validUntil: '2026-09-30', status: 'active', campus: 'shunyi_mapo' },
        { id: 'ent-expired-private', studentId: 'expired-private', purchaseId: 'purchase-expired-private', courseType: '私教课', packageName: '成人1v1私教课', totalLessons: 10, remainingLessons: 4, validUntil: '2026-09-02', status: 'active', campus: 'shunyi_mapo' },
        { id: 'ent-future-private', studentId: 'future-private', purchaseId: 'purchase-future-private', courseType: '私教课', packageName: '成人1v1私教课', totalLessons: 10, remainingLessons: 4, validUntil: '2026-12-31', status: 'active', campus: 'shunyi_mapo' }
      ],
      schedule: [
        { id: 'single-pay-schedule', studentId: 'single-pay', studentName: '单次付费', courseType: '私教课', startTime: '2026-08-28 10:00:00', endTime: '2026-08-28 11:00:00', status: '已下课', settlementType: 'single', campus: 'shunyi_mapo' }
      ]
    }
  },
  previousOperationsPayload: { operations: {}, weeklyReportRaw: {} }
});
assert.strictEqual(privateActivePackageSnapshot.sections.revenue.course.activePrivatePackagePeople, 1, 'private active package people should count only private packages with remaining lessons and report-end validity');
assert.match(operationsSource, /OPERATIONS_ENTITLEMENT_FIELDS[\s\S]*'courseType'[\s\S]*'packageName'[\s\S]*'validUntil'/, 'weekly report raw entitlement rows must include course type and validity fields for fast private active package counting');
assert.doesNotMatch(weeklyReportSource, /buildTeachingStudentViews|buildCustomerLifecycleRows/, 'weekly report generation must not rebuild the full active-student read model during regeneration');

const largePrivatePackageRows = Array.from({ length: 6000 }, (_, index) => {
  const isPrivate = index % 3 === 0;
  return {
    id: `large-ent-${index}`,
    studentId: `large-student-${index}`,
    purchaseId: `large-purchase-${index}`,
    courseType: isPrivate ? '私教课' : '小班课',
    packageName: isPrivate ? '成人1v1私教课' : '小班课',
    totalLessons: 10,
    remainingLessons: isPrivate ? 3 : 5,
    validUntil: index % 6 === 0 ? '2026-09-02' : '2026-12-31',
    status: 'active',
    campus: 'shunyi_mapo'
  };
});
const largePrivatePackageStartedAt = Date.now();
const largePrivatePackageSnapshot = buildWeeklyBusinessReportSnapshot({
  period,
  operationsPayload: { operations: {}, weeklyReportRaw: { entitlements: largePrivatePackageRows } },
  previousOperationsPayload: { operations: {}, weeklyReportRaw: {} }
});
const largePrivatePackageElapsedMs = Date.now() - largePrivatePackageStartedAt;
assert.strictEqual(largePrivatePackageSnapshot.sections.revenue.course.activePrivatePackagePeople, 1000, 'large active private package count should still apply private package and report-end validity filters');
assert.ok(largePrivatePackageElapsedMs < 500, `active private package count must stay on the fast path, got ${largePrivatePackageElapsedMs}ms`);

const html = renderWeeklyBusinessReportHtml(snapshot, { remark: '本周雨天影响场地。' });
const requestedStructureHtml = renderWeeklyBusinessReportHtml(requestedStructureSnapshot);
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
assert.match(html, /chart-main-container[\s\S]*svg-chart-wrapper[\s\S]*interactive-svg-canvas/, 'weekly report trend charts should reuse the incoming cyber analytics SVG chart container');
assert.match(html, /svg-fill-area[\s\S]*svg-views-path[\s\S]*svg-rates-path[\s\S]*svg-guide-line[\s\S]*svg-dots-group/, 'weekly report trend charts should reuse the incoming cyber analytics SVG layers');
assert.match(html, /chart-tooltip/, 'weekly report trend charts should reuse the incoming hover tooltip');
assert.match(html, /handleChartHover/, 'weekly report trend charts should reuse the incoming magnetic hover interaction');
assert.match(html, /pointer-events[\s\S]*all/, 'weekly report trend charts should reuse the incoming wide hit-area interaction');
assert.match(html, /data-primary-label="核销入账"[\s\S]*data-secondary-label="环比变化"/, 'weekly report trend chart data labels should be replaced with FlowTennis metrics');
assert.doesNotMatch(html, /echarts|weekly-echarts-trend|views-line|views-area|line-labels|<svg viewBox="0 0 100 100"/, 'weekly report trend charts must not keep ECharts or the old ugly hand-written sparkline');
assert.match(html, /cdn\.tailwindcss\.com[\s\S]*fontFamily[\s\S]*cyber:[\s\S]*volt: '#72D94A'/, 'weekly report should use a calmer green token');
assert.match(html, /text-white\{color:#D9E1DB!important\}/, 'weekly report should soften pure white text to reduce eye strain');
assert.doesNotMatch(html, /#7CFF44/, 'weekly report should not keep the harsh neon green in charts or controls');
assert.match(html, /<body class="bg-grid-pattern text-white font-sans min-h-screen antialiased flex flex-col pb-16">/, 'weekly report body should reuse the provided template shell classes');
assert.match(html, /<header data-section="global-header" class="border-b border-cyber-border bg-cyber-black\/95 sticky top-0 z-50 backdrop-blur-md">/, 'weekly report header should reuse the provided template header structure');
assert.match(html, /<nav class="hidden md:flex items-center space-x-1 bg-black\/40 p-1 rounded-lg border border-cyber-border"[\s\S]*href="#overview"[\s\S]*Dashboard[\s\S]*href="#revenue"[\s\S]*Revenue[\s\S]*href="#private-course"[\s\S]*Private Course[\s\S]*href="#court"[\s\S]*Court Usage[\s\S]*href="#coach"[\s\S]*Coach/, 'top navigation should mirror the template segmented menu and jump to report sections');
assert.match(html, /data-section="top-kpi-cards" class="lg:col-span-6 grid grid-cols-2 gap-4 bg-cyber-card p-5 rounded-xl border border-cyber-border"[\s\S]*累计净实收[\s\S]*hero-kpi-value whitespace-nowrap text-3xl font-mono font-bold text-white tracking-tight[\s\S]*总私教课人数[\s\S]*hero-kpi-value whitespace-nowrap text-3xl font-mono font-bold text-white tracking-tight/, 'hero lifetime metrics should show net cash and keep the widened template KPI card without wrapping values');
assert.match(html, /flex flex-wrap gap-3 pt-2[\s\S]*核销入账[\s\S]*本周收款[\s\S]*场地利用率[\s\S]*完成课时[\s\S]*上周/, 'weekly summary metrics should use the requested four metrics with previous-week comparison');
assert.match(html, /data-section="court-utilization-heatmap"[\s\S]*\/\/ COURT UTILIZATION HEATMAP[\s\S]*每天利用率[\s\S]*<th class="py-2 text-left font-sans"[\s\S]*日期[\s\S]*08\.27[\s\S]*09\.03[\s\S]*cohort-cell[\s\S]*41%[\s\S]*72%[\s\S]*61%/, 'daily court utilization should render as a date heatmap with real daily values');
assert.match(html, /08\.27 周四[\s\S]*08\.28 周五[\s\S]*09\.03 周四/, 'daily court utilization headers should include weekdays');
assert.doesNotMatch(html, /USER RETENTION MATRIX|核心客群生命周期存留分析|起始批次|Cohort|>W1<|>W5</, 'daily court utilization must not keep retention cohort wording');
assert.doesNotMatch(html, /\[contenteditable=true\]\{outline:/, 'editable elements must not show dashed outlines by default');
assert.match(html, /\[data-editable="true"\]:focus\{[\s\S]*outline:1px dashed #72D94A/, 'editable dashed outline should only appear after click focus');
assert.doesNotMatch(html, /\[data-editable="true"\]:hover[\s\S]*outline:1px dashed #72D94A/, 'editable dashed outline must not appear on hover');
assert.doesNotMatch(weeklyReportSource, /buildCourtUtilizationMatrixRows|weeklyMatrixRows|Cohort|USER RETENTION MATRIX|核心客群生命周期存留分析|起始批次/, 'weekly report source must not keep the old retention matrix implementation');
assert.match(html, /chart-tooltip[\s\S]*data-tooltip/, 'charts and metrics should support hover tooltips');
assert.match(html, /contenteditable="true"[\s\S]*save-edit/, 'weekly report should support direct editing and saving');
assert.match(html, /data-edit-key="section.revenue.title"[\s\S]*data-edit-key="section.course.title"[\s\S]*data-edit-key="course.totalPeople.label"[\s\S]*data-edit-key="court.heatmap.title"[\s\S]*data-edit-key="conversion.source.0.source"/, 'weekly report should make section titles, metric labels, charts and table cells editable');
assert.doesNotMatch(html, /总场地利用率|历史平均利用率|data-edit-key="lifetime\.courtUtilizationRate/, 'weekly report should hide unreliable lifetime court utilization');
const legacyUtilizationHtml = renderWeeklyBusinessReportHtml({
  ...snapshot,
  lifetimeSummary: { ...snapshot.lifetimeSummary, courtUtilizationRate: { value: 49.9 } },
  publicEdits: { 'lifetime.courtUtilizationRate': '49.9%' }
});
assert.doesNotMatch(legacyUtilizationHtml, /总场地利用率|历史平均利用率|data-edit-key="lifetime\.courtUtilizationRate/, 'stored lifetime values and public edits must not restore the hidden metric');
assert.match(html, /总私教课人数/, 'hero should show lifetime private course people label');
assert.match(html, /核销入账[\s\S]*本周收款[\s\S]*场地利用率[\s\S]*完成课时/, 'top weekly metrics should use requested labels');
assert.match(html, /\/\/ 核销入账[\s\S]*data-primary-label="核销入账"/, 'trend metric cards should use the template eyebrow position as the data card title');
assert.doesNotMatch(html, /\/\/ GROWTH TRENDS[\s\S]*核销入账/, 'trend metric cards should not keep the generic growth trends title above a separate Chinese title');
assert.match(html, /hero-kpi-value[\s\S]*whitespace-nowrap/, 'hero KPI values should stay on one line');
assert.match(html, /私教课在期人数/, 'course section should show active private package people');
assert.match(requestedStructureHtml, /本周上课人数\/课时数[\s\S]*2 人 \/ 3 小时/, 'course section should merge lesson people and completed hours into one metric card');
assert.match(html, /2\.2 散客订场收款[\s\S]*本周订场人数[\s\S]*上周/, 'guest booking cards should show previous-week comparison');
assert.doesNotMatch(html, /营业收入|本周营业收入|2\.2 订场收款（散客）|2\.3 会员收款/, 'weekly report should not keep old revenue and booking section copy');
assert.match(html, /12,000 元/, 'numbers should use thousands separators');
assert.match(html, /会员订场[\s\S]*散客订场[\s\S]*课程订场[\s\S]*领导订场[\s\S]*内部使用[\s\S]*约球局/, 'HTML should render all standard court booking type rows');
assert.match(html, /王教练/, 'HTML should render coach data rows');
assert.match(requestedStructureHtml, /data-coach-lesson-details[\s\S]*2026-08-28 周五/, 'coach lesson detail dates should include weekdays');
assert.match(html, /coachLessonDetailsOpen[\s\S]*querySelectorAll\('\[data-coach-lesson-details\]'\)[\s\S]*details\.open=coachLessonDetailsOpen[\s\S]*panels\.forEach/, 'coach lesson detail expanded state should be shared across coach tabs');
assert.match(html, /小红书/, 'HTML should render lead source rows');

const currentWeekHighlightSnapshot = buildWeeklyBusinessReportSnapshot({
  period,
  operationsPayload: {
    operations: { overview: { cards: { totalIncome: { value: 1 }, recognizedRevenue: { value: 100 } } } },
    weeklyReportRaw: {
      financeNormalizedRows: [
        { id: 'current-week-cash', campusName: '顺义马坡', businessDate: '2026-08-28', businessType: '课程', action: '收款', cashDelta: 100, recognizedRevenueDelta: 0 },
        { id: 'current-week-consume', campusName: '顺义马坡', businessDate: '2026-08-28', businessType: '课程', action: '已入账', cashDelta: 0, recognizedRevenueDelta: 100 }
      ]
    }
  },
  previousOperationsPayload: {
    operations: { overview: { cards: { totalIncome: { value: 1 }, recognizedRevenue: { value: 500 } } } },
    weeklyReportRaw: {
      financeNormalizedRows: [
        { id: 'previous-week-cash', campusName: '顺义马坡', businessDate: '2026-08-20', businessType: '课程', action: '收款', cashDelta: 500, recognizedRevenueDelta: 0 },
        { id: 'previous-week-consume', campusName: '顺义马坡', businessDate: '2026-08-20', businessType: '课程', action: '已入账', cashDelta: 0, recognizedRevenueDelta: 500 }
      ]
    }
  }
});
const currentWeekHighlightHtml = renderWeeklyBusinessReportHtml(currentWeekHighlightSnapshot);
const currentWeekDataMatch = currentWeekHighlightHtml.match(/data-primary-label="核销入账"[\s\S]*?data-points="([^"]+)"/);
assert.ok(currentWeekDataMatch, 'trend chart should expose encoded point data');
const currentWeekPoints = JSON.parse(decodeHtmlAttr(currentWeekDataMatch[1]));
assert.strictEqual(currentWeekPoints[0].isPeak, false, 'trend chart should not highlight the highest previous week by default');
assert.strictEqual(currentWeekPoints[currentWeekPoints.length - 1].isPeak, true, 'trend chart should highlight the current report week by default');
assert.doesNotMatch(html, /<td>-<\/td><td>-<\/td><td>-<\/td><td>-<\/td>/, 'HTML should not render rows with all empty metric cells when source data exists');
assert.match(html, /本周雨天影响场地。/, 'HTML should render admin remark text');
assert.doesNotMatch(html, /订单ID|线索ID|流水ID/, 'HTML should not expose single-record technical detail labels');
assert.match(renderWeeklyBusinessReportHtml(noFakeSourceSnapshot), />-</, 'HTML should show a dash when a requested metric has no reliable source');
const rawHtml = renderWeeklyBusinessReportHtml(rawSnapshot);
assert.match(rawHtml, /2\.1 课程收款/, 'course income section should use the requested course receipt title');
assert.match(rawHtml, /2\.2 散客订场收款/, 'guest booking section should use requested title');
assert.match(rawHtml, /2\.3 订场会员收款/, 'stored value member section should use requested title');
assert.match(rawHtml, /2\.3 订场会员收款[\s\S]*grid grid-cols-1 md:grid-cols-2 lg:grid-cols-5 gap-4[\s\S]*会员总数[\s\S]*总储值金额[\s\S]*本周新增会员[\s\S]*本周充值收款[\s\S]*本周订场消耗收入/, 'stored value member section should fit all five metric cards in one desktop row');
const storedDirtyLessonHtml = renderWeeklyBusinessReportHtml({
  period,
  summary: {},
  sections: {
    revenue: { storedValue: {}, receipts: {}, recognized: {}, course: {} },
    court: {},
    coach: {
      rows: [{
        coach: '朝珺教练',
        lessonRows: [{ date: '2026-09-05', time: '08:00-10:00', student: 'e927ccc1-c1a7-4375-bff2-526b57b78ef7', courseType: '私教课', hours: 2, court: '1号场' }]
      }, {
        coach: '刘润扬教练',
        lessonRows: [{ date: '2026-09-06', time: '09:00-10:00', student: '真实学员', courseType: '小班课', hours: 1, court: '2号场' }]
      }]
    },
    conversion: {}
  }
});
assert.doesNotMatch(storedDirtyLessonHtml, /e927ccc1-c1a7-4375-bff2-526b57b78ef7/, 'stored weekly report HTML must not expose dirty UUID student names');
assert.match(storedDirtyLessonHtml, /未记录学员/, 'stored weekly report HTML should mask unresolved dirty UUID student names');
assert.match(storedDirtyLessonHtml, /data-coach-detail-tabs[\s\S]*data-coach-tab="0"[\s\S]*朝珺教练[\s\S]*data-coach-tab="1"[\s\S]*刘润扬教练[\s\S]*data-coach-panel="0"[\s\S]*data-coach-panel="1"/, 'coach lesson details should render one card with clickable coach tabs');
assert.doesNotMatch(storedDirtyLessonHtml, /<div class="grid grid-cols-1 lg:grid-cols-2 gap-4"><section class="bg-cyber-card[\s\S]*coach\.details/, 'coach lesson details should not render one card per coach');
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
assert.match(weeklyReportSource, /includeWeeklyReportRaw:\s*true[\s\S]*dateRange:\s*\{\}[\s\S]*metricScope:\s*\{\s*campusName:\s*WEEKLY_REPORT_CAMPUS_NAME\s*\}/, 'weekly report lifetime summary should load complete raw facts for the report cutoff');
assert.match(weeklyReportSource, /view:\s*WEEKLY_REPORT_OPERATIONS_VIEW[\s\S]*includeWeeklyReportRaw:\s*true/, 'weekly report should use a dedicated operations snapshot scope with raw report facts');
assert.match(weeklyReportSource, /weeklyRawToBaseRows[\s\S]*baseRowsOverride[\s\S]*previousScope[\s\S]*baseRowsOverride[\s\S]*totalScope[\s\S]*baseRowsOverride/, 'weekly report regeneration should reuse one raw read for previous and lifetime metrics');
assert.match(weeklyReportSource, /const payload = canDeriveFromLifetime[\s\S]*loadOperationsPayload[\s\S]*loadOperationsSnapshot/, 'weekly report regeneration should derive trend metrics from lifetime raw facts before probing individual trend snapshots');
assert.match(weeklyReportSource, /canDeriveFromLifetime/, 'weekly report regeneration should reuse a complete lifetime snapshot after it is published');
assert.match(weeklyReportSource, /totalSnapshotBaseRows[\s\S]*baseRowsOverride: totalSnapshotBaseRows/, 'weekly report regeneration should derive period metrics from one complete lifetime snapshot');
assert.match(weeklyReportSource, /loadOperationsSnapshot[\s\S]*allowRefreshing:\s*false/, 'weekly report regeneration should never consume a snapshot that is already refreshing');
assert.match(weeklyReportSource, /forceFreshSource/, 'manual weekly report regeneration must explicitly request fresh source data');
assert.match(weeklyReportSource, /weeklyRawToBaseRows[\s\S]*courtAccountListIndexRows/, 'fresh weekly report regeneration must keep all raw source rows needed for one-pass derivation');
assert.match(weeklyReportSource, /trendScope[\s\S]*allowRefreshing:\s*false/, 'trend metrics should never consume a snapshot that is already refreshing');
assert.match(weeklyReportSource, /allowLiveFallback = true/, 'weekly report generation should support disabling synchronous live fallback');
assert.match(weeklyRoutesSource, /publishWeeklyBusinessReportDraft/, 'manual weekly report regeneration should publish a prebuilt ready draft instead of generating live data in the request');
assert.match(weeklyRoutesSource, /mode === 'manual'[\s\S]*allowLiveFallback:\s*false[\s\S]*table/, 'manual weekly report regeneration must use prepared weekly report snapshots');
assert.doesNotMatch(weeklyRoutesSource, /mode === 'manual'[\s\S]*generateWeeklyBusinessReport/, 'manual weekly report regeneration must not call the slow live generation path');
assert.match(apiSource, /loadOperationsSnapshot:operationsSnapshotSync\.loadSnapshot/, 'weekly report routes should receive the operations snapshot loader');
assert.match(operationsPageSource, /baseRowsOverride = null[\s\S]*const baseRows = baseRowsOverride \|\| await loadBaseRows/, 'operations page payload should allow weekly report to reuse loaded base rows');
assert.match(operationsPageSource, /function compactWeeklyReportRaw[\s\S]*function buildWeeklyReportRawPayload[\s\S]*weeklyReportRaw: includeWeeklyReportRaw \? buildWeeklyReportRawPayload/, 'weekly report snapshots should keep lifetime finance facts but compact recent trend rows');
assert.match(operationsSnapshotSource, /weeklyReportRawWindow/, 'weekly report lifetime snapshot should use a bounded raw-data window');
assert.match(apiSource, /async function buildOperationsSnapshotPayload\(\{user,scope,baseRowsOverride,weeklyReportLiveSource=false,forceFreshSource=false,weeklyReportRawOnly=false\}\)/, 'operations payload wrapper should pass through reusable base rows and explicit weekly live fallback mode');
assert.match(apiSource, /weeklyReportLiveSource&&scope\?\.view==='weekly-report'[\s\S]*scanFirstRows:useWeeklyReportFullRead\?weeklyReportFullScan:scanFirstRows[\s\S]*getScheduleListRows:useWeeklyReportFullRead\?null:getScheduleListRows/, 'weekly report live fallback should use full paged source reads without changing normal page reads');
assert.match(operationsSource, /const OPERATIONS_WEEKLY_REPORT_SCHEDULE_FIELDS = \[[\s\S]*'confirmStatus'[\s\S]*'paidAmount'[\s\S]*'paymentAmount'[\s\S]*'payMethod'[\s\S]*'paymentChannel'[\s\S]*getOperationsWeeklyReportBaseRows[\s\S]*columns:\s*OPERATIONS_WEEKLY_REPORT_SCHEDULE_FIELDS/, 'weekly report source rows must read schedule payment fields for direct course receipts');
assert.match(apiSource, /FEISHU_WEEKLY_BUSINESS_REPORT_WEBHOOK/, 'weekly report should use a dedicated Feishu webhook env');
assert.match(weeklyWorkflow, /cron: '23 18 \* \* 4'/, 'weekly report workflow should run Friday 02:23 Beijing time to avoid hourly schedule delays');
assert.match(weeklyWorkflow, /\/api\/cron\/weekly-business-report/, 'weekly report workflow should trigger the cron endpoint');
assert.match(indexHtml, /page-weekly-reports/, 'admin shell should include the weekly report page');
assert.match(indexHtml, /pages\/weekly-reports\.js/, 'admin shell should load the weekly report page script');
assert.match(indexHtml, /weekly-reports\.js\?v=20260922-weekly-list-all-fonts-12px-v1/, 'admin shell should bust weekly report page script cache after weekly list font fix');
assert.match(weeklyPageSource, /WEEKLY_REPORT_REQUEST_TIMEOUT_MS\s*=\s*10000/, 'each weekly report regeneration request should have a bounded timeout');
assert.match(weeklyPageSource, /WEEKLY_REPORT_RETRY_LIMIT\s*=\s*120/, 'weekly report regeneration should retry automatic snapshot preparation for the background rebuild window');
assert.match(weeklyPageSource, /WEEKLY_REPORT_RETRY_DELAY_MS\s*=\s*5000/, 'weekly report regeneration should wait between automatic snapshot preparation retries');
assert.match(indexHtml, /api\.js\?v=20260918-weekly-report-timeout-message-v1/, 'admin shell should bust weekly report timeout message script cache');
assert.match(indexHtml, /weekly-report-share-shell[\s\S]*#loginPage\{display:none!important\}/, 'public weekly report shell should hide the login card before app scripts load');
assert.doesNotMatch(weeklyPageSource, /顺义马坡每周周报|重新生成本周周报|editWeeklyReportRemark/, 'admin weekly report list should remove the old title block, top regenerate button and remark action');
assert.match(weeklyPageSource, /周期[\s\S]*周次[\s\S]*生成时间[\s\S]*本周收款[\s\S]*核销入账[\s\S]*完成课时[\s\S]*场地使用时长[\s\S]*场地利用率[\s\S]*操作/, 'admin weekly report list should show the requested columns in order');
assert.match(weeklyPageSource, /weeklyReportSummaryValue\(row, 'courtUsageHours'\)/, 'admin weekly report list should show court usage hours excluding internal usage');
assert.match(weeklyPageSource, /查看[\s\S]*复制链接[\s\S]*重新生成/, 'admin weekly report list should keep regenerate clickable');
assert.doesNotMatch(weeklyPageSource, /营业收入/, 'admin weekly report list should rename revenue copy to recognized revenue');
assert.match(weeklyPageSource, /weekly-report-table[\s\S]*width:100%;min-width:1180px[\s\S]*table-layout:fixed/, 'admin weekly report list should fill the card while keeping compact fixed column widths');
assert.match(weeklyPageSource, /toLocaleString\('zh-CN'[\s\S]*Asia\/Shanghai/, 'admin weekly report list should format generated time in Beijing time');
assert.match(weeklyPageSource, /copyWeeklyReportLink/, 'admin page should allow copying the share link');
assert.match(weeklyPageSource, /sticky:\s*true/, 'manual regeneration should keep the loading toast visible until completion');
assert.doesNotMatch(weeklyPageSource, /后台正在准备可发布版本|row\.canRegenerate/, 'admin weekly report list must not disable the regenerate action');
assert.match(weeklyPageSource, /result\?\.preparing[\s\S]*WEEKLY_REPORT_RETRY_LIMIT/, 'admin weekly report should automatically retry while snapshots are being prepared');
assert.match(weeklyPageSource, /apiCall\('POST', '\/admin\/weekly-business-reports\/regenerate'[\s\S]*if \(!result\?\.success\) throw new Error/, 'manual regeneration should use one fresh-source request and report real failures');
assert.match(weeklyPageSource, /if \(!result\?\.success\)[\s\S]*await renderWeeklyReports\(\);[\s\S]*catch/, 'manual regeneration should refresh the list only after success');
assert.match(weeklyPageSource, /if \(!result\?\.success\) throw new Error\(result\?\.error \|\| '周报生成失败'\);[\s\S]*toastHandle\.update\('周报已生成'/, 'manual regeneration should only show success after an explicit successful response');
assert.match(bootstrapSource, /'weekly-reports':'马坡周报'/, 'top page title should be renamed to Mapo weekly report');
assert.match(componentsSource, /马坡周报/, 'sidebar and mobile navigation should be renamed to Mapo weekly report');
assert.match(bootstrapSource, /options\.sticky/, 'toast helper should support sticky loading messages');
assert.doesNotMatch(weeklyPageSource, /tms-toolbar/, 'admin page should not render the removed weekly report title toolbar');
assert.match(weeklyPageSource, /width:190px[\s\S]*tms-action-link[\s\S]*重新生成/, 'admin page action column should fit all row actions without covering utilization');
assert.match(weeklyPageSource, /weekly-report-table[\s\S]*font-size:12px/, 'admin weekly report list should use 12px text');
assert.match(pagesStyleSource, /\.weekly-report-table[\s\S]*font-size:12px!important/, 'admin weekly report list inner text should override the global 13px cell text style');
assert.strictEqual((stateSource.match(/renderWeeklyReports\(\)/g) || []).length, 1, 'weekly reports page should render once per page data render');
assert.match(stateSource, /currentPage==='weekly-reports'\)return/, 'weekly report admin page should not auto-refresh on focus, visibility, or interval sync');
assert.doesNotMatch(weeklyPageSource, /订单ID|线索ID|流水ID/, 'admin page should not expose single-record detail labels');
assert.doesNotMatch(publicApiSource, /login-card[\s\S]*每周周报/, 'public weekly report share page should not render a login card while loading');
assert.match(publicApiSource, /FLOWTENNIS WEEKLY/, 'public weekly report share page should render an independent public loading shell');
assert.match(weeklyRoutesSource, /PUBLIC_BASE_URL \|\| 'https:\/\/www\.flowtennis\.cn'/, 'weekly report share links should default to the public production domain');
assert.match(weeklyRoutesSource, /res\.end\(renderWeeklyBusinessReportHtml\(report/, 'public route should always render with the current report template instead of serving stale stored HTML');
assert.match(operationsPageSource, /includeWeeklyReportRaw[\s\S]*weeklyReportRaw/, 'weekly report payload should include raw source rows for report-specific metrics');
assert.match(operationsSource, /OPERATIONS_LEAD_FIELDS[\s\S]*'demandProduct'/, 'weekly report raw lead rows must include demand product for the new lead detail table');
assert.match(operationsPageSource, /function buildWeeklyReportRawPayload[\s\S]*membershipPlans: scoped\.membershipPlans[\s\S]*membershipBenefitLedger: scoped\.membershipBenefitLedger[\s\S]*membershipAccountEvents: scoped\.membershipAccountEvents/s, 'weekly report raw payload should include complete membership read-model inputs');
assert.match(operationsPageSource, /function buildWeeklyReportRawPayload[\s\S]*courtAccountListIndexRows: baseRows\.courtAccountListIndexRows \|\| \[\]/, 'weekly report raw payload should include the court account list index rows for fast stored value metrics');
assert.match(operationsSnapshotRunnerSource, /weeklyReportScopes: argv\.includes\('--weekly-report-scopes'\)/, 'operations snapshot runner should support weekly report snapshot scopes');
assert.match(operationsSnapshotRunnerSource, /resolveTrailingWeeklyPeriods\(period, 8\)\.map[\s\S]*includeWeeklyReportRaw: true[\s\S]*includeWeeklyReportRaw: true/, 'weekly report snapshot runner should prebuild all eight trend weeks and lifetime scopes');
assert.match(operationsSnapshotRunnerSource, /weeklyReportRawWindow:\s*\{\s*startDate:\s*addDays\(period\.startDate, -70\),\s*endDate:\s*period\.endDate\s*\}/, 'weekly report snapshot runner should prebuild a bounded lifetime raw window');
assert.match(operationsSnapshotRunnerSource, /scanFirstRows:\s*\(table, options = \{\}\) => storage\.getCachedScan\([\s\S]*?scope\?\.view === 'weekly-report'/, 'weekly report snapshot rebuild must use the offline full-read path instead of production first-row truncation');
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
    scan: async () => [{ ...snapshot, publicEdits: { remark: '原备注不可丢失' }, shareToken: 'public-token', status: 'success' }],
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

async function callWeeklyReportListWithUser(user) {
  let json = null;
  let statusCode = 200;
  const routes = createWeeklyBusinessReportRoutes({
    init: async () => {},
    sendJson: (_res, value, code = 200) => { json = value; statusCode = code; return value; },
    scan: async () => [{ ...snapshot, shareToken: 'list-token', status: 'success' }],
    table: 'ft_weekly_business_reports'
  });
  const handled = await routes.handleAdmin({
    path: '/weekly-business-reports',
    method: 'GET',
    body: {},
    req: { headers: {} },
    res: {},
    user
  });
  return { handled, json, statusCode };
}

async function callListReportsWithOverlappingRows() {
  return listWeeklyBusinessReports({
    scan: async () => [
      {
        ...snapshot,
        id: 'weekly:顺义马坡:2026-08-27:2026-09-03',
        period: { startDate: '2026-08-27', endDate: '2026-09-03' },
        status: 'success'
      },
      {
        ...snapshot,
        id: 'weekly:顺义马坡:2026-09-03:2026-09-10',
        period: { startDate: '2026-09-03', endDate: '2026-09-10' },
        status: 'success'
      },
      {
        ...snapshot,
        id: 'weekly:顺义马坡:2026-09-04:2026-09-10',
        period: { startDate: '2026-09-04', endDate: '2026-09-10' },
        status: 'success'
      },
      {
        ...snapshot,
        id: 'weekly-draft:顺义马坡:2026-09-04:2026-09-10',
        draftOf: 'weekly:顺义马坡:2026-09-04:2026-09-10',
        period: { startDate: '2026-09-04', endDate: '2026-09-10' },
        status: 'ready',
        readyAt: '2026-09-18T14:00:00.000Z'
      }
    ],
    table: 'ft_weekly_business_reports'
  });
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
      return operationsPayloadWithRawFacts;
    },
    loadOperationsSnapshot: async ({ scope }) => {
      if (scope?.dateRange?.startDate === period.previousStartDate) {
        return {
          operations: {
            overview: { cards: { totalIncome: { value: 100 }, recognizedRevenue: { value: 80 }, courseRecognized: { value: 60 } } },
            court: { cards: { utilizationRate: { value: 1 } } },
            coach: { cards: { usedHours: { value: 1 } } },
            conversion: { cards: { totalLeads: { value: 1 } } }
          },
          weeklyReportRaw: {
            coaches: [{ name: '朝珺', status: '在职' }],
            schedule: [{ id: 'manual-prev-trend-schedule', coach: '朝珺教练', studentId: 'manual-prev-student', studentName: '上周学员', courseType: '私教课', startTime: `${period.previousStartDate} 10:00:00`, endTime: `${period.previousStartDate} 11:00:00`, status: '已排课', campus: 'shunyi_mapo', venue: '1号场' }],
            financeNormalizedRows: [
              { id: 'manual-prev-trend-cash', campusName: '顺义马坡', businessDate: period.previousStartDate, businessType: '课程', action: '收款', cashDelta: 100, recognizedRevenueDelta: 0 },
              { id: 'manual-prev-trend-recognized', campusName: '顺义马坡', businessDate: period.previousStartDate, businessType: '课程', action: '已入账', cashDelta: 0, recognizedRevenueDelta: 80 }
            ]
          }
        };
      }
      if (!scope?.dateRange?.startDate) {
        return {
          operations: { overview: { cards: { totalIncome: { value: 1000 } } }, court: { cards: { utilizationRate: { value: 10 } } } },
          weeklyReportRaw: operationsPayloadWithRawFacts.weeklyReportRaw
        };
      }
      return operationsPayload;
    }
  });
  return { result, savedRows, liveLoads, elapsedMs: Date.now() - startedAt };
}

async function callCampusScopedSnapshotGeneration() {
  let derivedLoads = 0;
  let snapshotUser = null;
  const savedRows = [];
  const result = await generateWeeklyBusinessReport({
    period,
    generationMode: 'manual',
    user: { id: 'mapo-operator', role: 'admin', dataScope: 'campus', campusIds: ['shunyi_mapo'] },
    baseUrl: 'https://www.flowtennis.cn',
    mkTable: async () => {},
    get: async () => ({ ...snapshot, id: 'weekly:顺义马坡:2026-08-27:2026-09-03', shareToken: 'campus-snapshot-token', status: 'success' }),
    put: async (_table, _id, row) => { savedRows.push(row); },
    loadOperationsPayload: async ({ scope: liveScope, baseRowsOverride }) => {
      assert.ok(baseRowsOverride, '校区权限账号应使用 lifetime 快照在内存中派生周报数据');
      derivedLoads += 1;
      if (liveScope?.dateRange?.startDate === period.startDate) return operationsPayloadWithRawFacts;
      return {
        ...operationsPayloadWithRawFacts,
        weeklyReportRaw: {
          ...operationsPayloadWithRawFacts.weeklyReportRaw,
          financeNormalizedRows: realDataHardGateFinanceRows.map(row => ({ ...row, businessDate: period.previousStartDate }))
        }
      };
    },
    loadOperationsSnapshot: async ({ user: loadedUser, scope }) => {
      snapshotUser = loadedUser;
      if (scope?.dateRange?.startDate === period.startDate) return operationsPayloadWithRawFacts;
      if (scope?.dateRange?.startDate === period.previousStartDate) return {
        ...operationsPayloadWithRawFacts,
        weeklyReportRaw: {
          ...operationsPayloadWithRawFacts.weeklyReportRaw,
          financeNormalizedRows: realDataHardGateFinanceRows.map(row => ({ ...row, businessDate: period.previousStartDate }))
        }
      };
      if (!scope?.dateRange?.startDate) return {
        operations: { overview: { cards: { totalIncome: { value: 1000 } } } },
        weeklyReportRaw: operationsPayloadWithRawFacts.weeklyReportRaw
      };
      return operationsPayloadWithRawFacts;
    }
  });
  return { result, savedRows, derivedLoads, snapshotUser };
}

async function callSnapshotWithoutRawFallbackGeneration() {
  let liveLoads = 0;
  const savedRows = [];
  const result = await generateWeeklyBusinessReport({
    period,
    baseUrl: 'https://www.flowtennis.cn',
    mkTable: async () => {},
    get: async () => ({ shareToken: 'raw-fallback-token' }),
    put: async (_table, _id, row) => { savedRows.push(row); },
    loadOperationsPayload: async ({ scope }) => {
      liveLoads += 1;
      if (scope?.dateRange?.startDate === period.startDate) return operationsPayloadWithRawFacts;
      if (scope?.dateRange?.startDate === period.previousStartDate) return { operations: { overview: { cards: { totalIncome: { value: 100 } } } }, weeklyReportRaw: { financeNormalizedRows: realDataHardGateFinanceRows, schedule: realDataHardGateScheduleRows } };
      return {
        operations: { overview: { cards: { totalIncome: { value: 1000 } } } },
        weeklyReportRaw: operationsPayloadWithRawFacts.weeklyReportRaw
      };
    },
    loadOperationsSnapshot: async ({ scope }) => {
      if (scope?.dateRange?.startDate === period.startDate) {
        return { operations: { overview: { cards: { totalIncome: { value: 0 }, recognizedRevenue: { value: 0 }, courseRecognized: { value: 0 } } } } };
      }
      if (scope?.dateRange?.startDate === period.previousStartDate) {
        return { operations: { overview: { cards: { totalIncome: { value: 0 }, recognizedRevenue: { value: 0 }, courseRecognized: { value: 0 } } } } };
      }
      return { operations: { overview: { cards: { totalIncome: { value: 989113.24 } } } } };
    }
  });
  return { result, savedRows, liveLoads };
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
    get: async () => ({ ...snapshot, publicEdits: { remark: '重新生成也保留' }, id: 'weekly:顺义马坡:2026-08-27:2026-09-03', shareToken: 'existing-token', status: 'success' }),
    put: async (_table, _id, row) => { savedRows.push(row); },
    loadOperationsPayload: async ({ scope }) => {
      liveLoads += 1;
      if (scope?.dateRange?.startDate === period.startDate) return operationsPayloadWithRawFacts;
      if (scope?.dateRange?.startDate === period.previousStartDate) return { operations: { overview: { cards: { totalIncome: { value: 100 } } } } };
      return {
        operations: { overview: { cards: { totalIncome: { value: 1000 } } } },
        weeklyReportRaw: operationsPayloadWithRawFacts.weeklyReportRaw
      };
    },
    loadOperationsSnapshot: async ({ scope }) => {
      snapshotLoads += 1;
      snapshotScopes.push(scope?.dateRange?.startDate || 'lifetime');
        if (scope?.dateRange?.startDate === period.startDate) return operationsPayloadWithRawFacts;
      if (scope?.dateRange?.startDate === period.previousStartDate) {
        return {
          operations: {
            overview: { cards: { totalIncome: { value: 100 }, recognizedRevenue: { value: 80 }, courseRecognized: { value: 60 } } },
            court: { cards: { utilizationRate: { value: 1 } } },
            coach: { cards: { usedHours: { value: 1 } } },
            conversion: { cards: { totalLeads: { value: 1 } } }
          },
          weeklyReportRaw: {
            coaches: [{ name: '朝珺', status: '在职' }],
            schedule: [{ id: 'manual-prev-trend-schedule', coach: '朝珺教练', studentId: 'manual-prev-student', studentName: '上周学员', courseType: '私教课', startTime: `${period.previousStartDate} 10:00:00`, endTime: `${period.previousStartDate} 11:00:00`, status: '已排课', campus: 'shunyi_mapo', venue: '1号场' }],
            financeNormalizedRows: [
              { id: 'manual-prev-trend-cash', campusName: '顺义马坡', businessDate: period.previousStartDate, businessType: '课程', action: '收款', cashDelta: 100, recognizedRevenueDelta: 0 },
              { id: 'manual-prev-trend-recognized', campusName: '顺义马坡', businessDate: period.previousStartDate, businessType: '课程', action: '已入账', cashDelta: 0, recognizedRevenueDelta: 80 }
            ]
          }
        };
      }
      if (!scope?.dateRange?.startDate) {
        return {
          operations: { overview: { cards: { totalIncome: { value: 1000 } } }, court: { cards: { utilizationRate: { value: 10 } } } },
          weeklyReportRaw: operationsPayloadWithRawFacts.weeklyReportRaw
        };
      }
      return {
        operations: {
          overview: { cards: { totalIncome: { value: 100 }, recognizedRevenue: { value: 80 }, courseRecognized: { value: 60 } } },
          court: { cards: { utilizationRate: { value: 2 } } },
          coach: { cards: { usedHours: { value: 3 } } }
        },
        weeklyReportRaw: {
          coaches: [{ name: '趋势教练', status: '在职' }],
          schedule: [{ id: `trend-${scope.dateRange.startDate}`, coach: '趋势教练', studentId: 'trend-student', studentName: '趋势学员', courseType: '私教课', startTime: `${scope.dateRange.startDate} 10:00:00`, endTime: `${scope.dateRange.startDate} 11:00:00`, status: '已排课', campus: 'shunyi_mapo', venue: '1号场' }],
          financeNormalizedRows: [{ id: `trend-cash-${scope.dateRange.startDate}`, campusName: '顺义马坡', businessDate: scope.dateRange.startDate, businessType: '课程', action: '收款', cashDelta: 100, recognizedRevenueDelta: 0 }]
        }
      };
    }
  });
  return { result, savedRows, liveLoads, snapshotLoads, snapshotScopes, elapsedMs: Date.now() - startedAt };
}

async function callExistingEightWeekTrendReuse() {
  const savedRows = [];
  const existingTrends = Array.from({ length: 8 }, (_, index) => ({
    label: `trend-${index}`,
    startDate: `2026-08-${String(index + 1).padStart(2, '0')}`,
    endDate: `2026-08-${String(index + 1).padStart(2, '0')}`,
    businessRevenue: index + 1,
    cashReceived: index + 2,
    courtUtilizationRate: index + 3,
    coachHours: index + 4
  }));
  let snapshotLoads = 0;
  const result = await generateWeeklyBusinessReport({
    period,
    generationMode: 'manual',
    allowLiveFallback: false,
    get: async () => ({
      ...snapshot,
      sections: { ...snapshot.sections, trends: existingTrends },
      shareToken: 'existing-eight-week-token'
    }),
    put: async (_table, _id, row) => { savedRows.push(row); },
    mkTable: async () => {},
    loadOperationsPayload: async () => operationsPayloadWithRawFacts,
    loadOperationsSnapshot: async ({ scope }) => {
      snapshotLoads += 1;
      if (!scope?.dateRange?.startDate) return operationsPayloadWithRawFacts;
      return null;
    }
  });
  return { result, savedRows, snapshotLoads, existingTrends };
}

function weeklyRegenerationFreshnessPayload({ purchaseDates = {}, includeDirtyMember = false } = {}) {
  const p1Date = purchaseDates.p1 || nextPeriod.startDate;
  const p2Date = purchaseDates.p2 || nextPeriod.startDate;
  const p3Date = purchaseDates.p3 || nextPeriod.startDate;
  const rows = [
    {
      id: 'fresh-private-1',
      studentId: 'fresh-student-1',
      studentName: '高老师（暖暖爸爸）',
      courseType: '私教课',
      packageName: '成人1v1私教课',
      amountPaid: 5000,
      purchaseDate: p1Date,
      status: 'active',
      campus: 'shunyi_mapo'
    },
    {
      id: 'fresh-private-2',
      studentId: 'fresh-student-2',
      studentName: '王先生（阿萌）',
      courseType: '私教课',
      packageName: '成人1v1私教课',
      amountPaid: 5000,
      purchaseDate: p2Date,
      status: 'active',
      campus: 'shunyi_mapo'
    },
    {
      id: 'fresh-private-3',
      studentId: 'fresh-student-3',
      studentName: '晨熙',
      courseType: '私教课',
      packageName: '成人1v1私教课',
      amountPaid: 5000,
      purchaseDate: p3Date,
      status: 'active',
      campus: 'shunyi_mapo'
    }
  ];
  const memberRows = [
    {
      id: 'valid-member',
      courtId: 'valid-member',
      item: {
        id: 'valid-member',
        displayName: '有效会员',
        campusCode: 'shunyi_mapo',
        accountType: '会员账户',
        membershipStatusCode: 'active',
        firstOpenDate: '2026-09-04',
        membershipAccount: { id: 'valid-member-account', courtId: 'valid-member' },
        totalDeposit: 2000,
        balance: 2000
      },
      membershipFinanceStats: { memberCount: 1, paidAmount: 2000, bonusAmount: 0, consumableAmount: 2000, pendingAmount: 2000 }
    }
  ];
  if (includeDirtyMember) {
    memberRows.push({
      id: 'dirty-zhenchaojun-member',
      courtId: 'dirty-zhenchaojun-member',
      item: {
        id: 'dirty-zhenchaojun-member',
        displayName: '甄朝珺',
        campusCode: 'shunyi_mapo',
        accountType: '会员账户',
        membershipStatusCode: 'active',
        firstOpenDate: '2026-09-04',
        membershipAccount: { id: 'dirty-zhenchaojun-account', courtId: 'dirty-zhenchaojun-member' },
        totalDeposit: 2000,
        balance: 2000
      },
      membershipFinanceStats: { memberCount: 1, paidAmount: 2000, bonusAmount: 0, consumableAmount: 2000, pendingAmount: 2000 }
    });
  }
  return {
    operations: { overview: { cards: { totalIncome: { value: 1 }, recognizedRevenue: { value: 100 } } } },
    weeklyReportRaw: {
      purchases: rows,
      courtAccountListIndexRows: memberRows,
      financeNormalizedRows: [
        { id: 'fresh-cash', campusName: '顺义马坡', businessDate: nextPeriod.startDate, businessType: '课程', action: '收款', cashDelta: 5000, recognizedRevenueDelta: 0 },
        { id: 'fresh-recognized', campusName: '顺义马坡', businessDate: nextPeriod.startDate, businessType: '课程', action: '已入账', cashDelta: 0, recognizedRevenueDelta: 100 }
      ]
    }
  };
}

async function callManualRegenerationIgnoresStaleCurrentSnapshot() {
  let liveLoads = 0;
  let snapshotLoads = 0;
  const savedRows = [];
  const staleSnapshotPayload = weeklyRegenerationFreshnessPayload({
    purchaseDates: { p1: '2026-09-04', p2: '2026-09-05', p3: '2026-09-09' },
    includeDirtyMember: true
  });
  const freshLivePayload = weeklyRegenerationFreshnessPayload({
    purchaseDates: { p1: '2026-09-03', p2: '2026-09-05', p3: '2026-08-19' },
    includeDirtyMember: false
  });
  const result = await generateWeeklyBusinessReport({
    period: nextPeriod,
    generationMode: 'manual',
    baseUrl: 'https://www.flowtennis.cn',
    mkTable: async () => {},
    get: async () => ({ id: 'weekly:顺义马坡:2026-09-04:2026-09-10', shareToken: 'freshness-token', status: 'success' }),
    put: async (_table, _id, row) => { savedRows.push(row); },
    loadOperationsPayload: async ({ scope }) => {
      liveLoads += 1;
      if (scope?.dateRange?.startDate === nextPeriod.startDate) return freshLivePayload;
      if (scope?.dateRange?.startDate === nextPeriod.previousStartDate) {
        return { operations: {}, weeklyReportRaw: { financeNormalizedRows: [{ id: 'fresh-prev', campusName: '顺义马坡', businessDate: nextPeriod.previousStartDate, businessType: '课程', action: '已入账', cashDelta: 0, recognizedRevenueDelta: 100 }] } };
      }
      return { operations: { overview: { cards: { totalIncome: { value: 1000 } } } }, weeklyReportRaw: { financeNormalizedRows: [] } };
    },
    loadOperationsSnapshot: async ({ scope }) => {
      snapshotLoads += 1;
      if (scope?.dateRange?.startDate === nextPeriod.startDate) {
        return { ...staleSnapshotPayload, snapshot: { refreshing: true } };
      }
      if (scope?.dateRange?.startDate === nextPeriod.previousStartDate) {
        return { operations: {}, weeklyReportRaw: { financeNormalizedRows: [{ id: 'stale-prev', campusName: '顺义马坡', businessDate: nextPeriod.previousStartDate, businessType: '课程', action: '已入账', cashDelta: 0, recognizedRevenueDelta: 100 }] } };
      }
      return { operations: { overview: { cards: { totalIncome: { value: 1000 } } } }, weeklyReportRaw: { financeNormalizedRows: [] } };
    }
  });
  return { result, savedRows, liveLoads, snapshotLoads };
}

async function callLifetimeIncomeUsesCompleteRawFactsThroughCutoff() {
  const savedRows = [];
  const liveScopes = [];
  const currentPayload = {
    operations: { overview: { cards: { totalIncome: { value: 100 } } } },
    weeklyReportRaw: {
      financeNormalizedRows: [
        { id: 'current-period-income', campusName: '顺义马坡', businessDate: '2026-08-28', businessType: '课程', action: '收款', cashDelta: 100, recognizedRevenueDelta: 100 }
      ]
    }
  };
  const previousPayload = {
    operations: { overview: { cards: { totalIncome: { value: 50 } } } },
    weeklyReportRaw: {
      financeNormalizedRows: [
        { id: 'previous-period-income', campusName: '顺义马坡', businessDate: '2026-08-20', businessType: '课程', action: '收款', cashDelta: 50, recognizedRevenueDelta: 50 }
      ]
    }
  };
  const completeLifetimePayload = {
    operations: { overview: { cards: { totalIncome: { value: 999999 } } } },
    weeklyReportRaw: {
      financeNormalizedRows: [
        { id: 'lifetime-before', campusName: '顺义马坡', businessDate: '2026-08-01', businessType: '课程', action: '收款', cashDelta: 1000, recognizedRevenueDelta: 0 },
        { id: 'lifetime-cutoff', campusName: '顺义马坡', businessDate: '2026-09-03', businessType: '课程', action: '收款', cashDelta: 500, recognizedRevenueDelta: 0 },
        { id: 'lifetime-after', campusName: '顺义马坡', businessDate: '2026-09-04', businessType: '课程', action: '收款', cashDelta: 9000, recognizedRevenueDelta: 0 }
      ]
    }
  };
  const result = await generateWeeklyBusinessReport({
    period,
    generationMode: 'manual',
    get: async () => null,
    put: async (_table, _id, row) => { savedRows.push(row); },
    mkTable: async () => {},
    loadOperationsPayload: async ({ scope }) => {
      liveScopes.push(scope?.dateRange?.startDate || 'lifetime');
      if (scope?.dateRange?.startDate === period.startDate) return currentPayload;
      if (scope?.dateRange?.startDate === period.previousStartDate) return previousPayload;
      return completeLifetimePayload;
    },
    loadOperationsSnapshot: async ({ scope }) => {
      if (scope?.dateRange?.startDate === period.startDate) return currentPayload;
      if (scope?.dateRange?.startDate === period.previousStartDate) return previousPayload;
      if (!scope?.dateRange?.startDate) return { operations: { overview: { cards: { totalIncome: { value: 999999 } } } } };
      return { operations: {}, weeklyReportRaw: {} };
    }
  });
  return { result, savedRows, liveScopes };
}

async function callFastRegenerationFromLifetimeSnapshot() {
  const savedRows = [];
  let derivedLoads = 0;
  let snapshotLoads = 0;
  const raw = {
    campuses: [{ id: 'shunyi_mapo', name: '顺义马坡' }],
    financeNormalizedRows: ['2026-07-12', '2026-07-20', '2026-07-27', '2026-08-04', '2026-08-12', '2026-08-20', '2026-08-28', '2026-09-05'].map((businessDate, index) => ({
      id: `fast-finance-${index}`,
      campusName: '顺义马坡',
      businessDate,
      businessType: '课程',
      action: '收款',
      cashDelta: 100,
      recognizedRevenueDelta: 100
    })),
    schedule: [{
      id: 'fast-schedule',
      campus: 'shunyi_mapo',
      campusName: '顺义马坡',
      coach: '快照教练',
      studentName: '快照学员',
      courseType: '私教课',
      startTime: '2026-08-27 10:00:00',
      endTime: '2026-08-27 11:00:00',
      status: '已下课'
    }]
  };
  const lifetimePayload = {
    operations: { overview: { cards: { totalIncome: { value: 999999 } } } },
    weeklyReportRaw: raw
  };
  const result = await generateWeeklyBusinessReport({
    period: nextPeriod,
    generationMode: 'manual',
    allowLiveFallback: false,
    get: async () => null,
    put: async (_table, _id, row) => { savedRows.push(row); },
    mkTable: async () => {},
    loadOperationsPayload: async ({ scope, baseRowsOverride }) => {
      assert.ok(baseRowsOverride, 'fast regeneration should derive period payloads from the complete lifetime raw snapshot');
      derivedLoads += 1;
      return {
        operations: { overview: { cards: { totalIncome: { value: 100 } } } },
        weeklyReportRaw: raw,
        scope: scope?.dateRange || {}
      };
    },
    loadOperationsSnapshot: async ({ scope }) => {
      snapshotLoads += 1;
      if (!scope?.dateRange?.startDate) return lifetimePayload;
      return null;
    }
  });
  return { result, savedRows, derivedLoads, snapshotLoads };
}

async function callRegenerationFallsBackWhenLifetimeScheduleIsEmpty() {
  const savedRows = [];
  const snapshotScopes = [];
  let derivedLoads = 0;
  const lifetimePayload = {
    operations: { overview: { cards: { totalIncome: { value: 999999 } } } },
    weeklyReportRaw: {
      ...operationsPayloadWithRawFacts.weeklyReportRaw,
      schedule: []
    }
  };
  const existing = {
    ...snapshot,
    shareToken: 'empty-lifetime-schedule-token',
    sections: {
      trends: Array.from({ length: 8 }, (_, index) => ({
        label: `trend-${index}`,
        businessRevenue: 1,
        cashReceived: 1,
        courtUtilizationRate: 1,
        coachHours: 1
      }))
    }
  };
  const result = await generateWeeklyBusinessReport({
    period,
    generationMode: 'manual',
    allowLiveFallback: false,
    get: async () => existing,
    put: async (_table, _id, row) => { savedRows.push(row); },
    mkTable: async () => {},
    loadOperationsPayload: async ({ baseRowsOverride }) => {
      derivedLoads += 1;
      assert.ok(baseRowsOverride, '专用周快照必须先转成内存原始事实再按周计算');
      return {
        ...operationsPayloadWithRawFacts,
        weeklyReportRaw: {
          ...operationsPayloadWithRawFacts.weeklyReportRaw,
          purchases: [{ id: 'period-purchase', studentId: 'period-student', courseType: '私教课', amountPaid: 1000, purchaseDate: period.startDate, status: 'active', campus: 'shunyi_mapo' }]
        }
      };
    },
    loadOperationsSnapshot: async ({ scope }) => {
      const startDate = scope?.dateRange?.startDate || 'lifetime';
      snapshotScopes.push(startDate);
      if (startDate === 'lifetime') return lifetimePayload;
      return operationsPayloadWithRawFacts;
    }
  });
  return { result, savedRows, snapshotScopes, derivedLoads };
}

async function callManualRegenerationRepairsRawlessZeroTrendSnapshots() {
  let liveLoads = 0;
  const savedRows = [];
  const currentPeriodRows = {
    operations: {
      overview: { cards: { totalIncome: { value: 29199 }, recognizedRevenue: { value: 0 }, courseRecognized: { value: 0 } } },
      coach: { cards: { usedHours: { value: 81.5 } } },
      court: { cards: { utilizationRate: { value: 29.46 } } }
    },
    weeklyReportRaw: {
      schedule: realDataHardGateScheduleRows.filter(row => String(row.startTime || '').slice(0, 10) >= period.startDate && String(row.startTime || '').slice(0, 10) <= period.endDate),
      coaches: [{ name: '朝珺', status: '在职' }, { name: '刘润扬', status: '在职' }]
    }
  };
  const previousPeriodRows = {
    operations: { overview: { cards: { totalIncome: { value: 100 } } } },
    weeklyReportRaw: {
      schedule: realDataHardGateScheduleRows.filter(row => String(row.startTime || '').slice(0, 10) >= period.previousStartDate && String(row.startTime || '').slice(0, 10) <= period.previousEndDate)
    }
  };
  const result = await generateWeeklyBusinessReport({
    period,
    generationMode: 'manual',
    baseUrl: 'https://www.flowtennis.cn',
    mkTable: async () => {},
    get: async () => ({ id: 'weekly:顺义马坡:2026-08-27:2026-09-03', shareToken: 'rawless-zero-trend-token', status: 'success' }),
    put: async (_table, _id, row) => { savedRows.push(row); },
    loadOperationsPayload: async ({ scope }) => {
      liveLoads += 1;
      if (scope?.dateRange?.startDate === period.startDate) return operationsPayloadWithRawFacts;
      if (scope?.dateRange?.startDate === period.previousStartDate) {
        return { operations: { overview: { cards: { totalIncome: { value: 100 } } } }, weeklyReportRaw: { financeNormalizedRows: realDataHardGateFinanceRows, schedule: realDataHardGateScheduleRows } };
      }
      if (!scope?.dateRange?.startDate) {
        return { operations: { overview: { cards: { totalIncome: { value: 1746191.23 } } }, court: { cards: { utilizationRate: { value: 10 } } } } };
      }
      if (scope?.dateRange?.startDate === '2026-07-02' && scope?.dateRange?.endDate === period.endDate) {
        return {
          operations: {},
          weeklyReportRaw: {
            financeNormalizedRows: realDataHardGateFinanceRows,
            schedule: realDataHardGateScheduleRows,
            coaches: [{ name: '朝珺', status: '在职' }, { name: '刘润扬', status: '在职' }]
          }
        };
      }
      throw new Error(`unexpected live load ${scope?.dateRange?.startDate || ''}:${scope?.dateRange?.endDate || ''}`);
    },
    loadOperationsSnapshot: async ({ scope }) => {
      if (scope?.dateRange?.startDate === period.startDate) return currentPeriodRows;
      if (scope?.dateRange?.startDate === period.previousStartDate) {
        return previousPeriodRows;
      }
      if (!scope?.dateRange?.startDate) {
        return { operations: { overview: { cards: { totalIncome: { value: 1169231.24 } } }, court: { cards: { utilizationRate: { value: 10 } } } } };
      }
      return {
        operations: {
          overview: { cards: { totalIncome: { value: 0 }, recognizedRevenue: { value: 0 }, courseRecognized: { value: 0 } } },
          court: { cards: { utilizationRate: { value: 0 } } },
          coach: { cards: { usedHours: { value: 0 } } }
        }
      };
    }
  });
  return { result, savedRows, liveLoads };
}

async function callSnapshotFailureLiveFallbackGeneration() {
  let liveLoads = 0;
  let snapshotLoads = 0;
  const savedRows = [];
  const startedAt = Date.now();
  const livePayload = {
    operations: {
      overview: { cards: { totalIncome: { value: 29199 }, recognizedRevenue: { value: 0 }, courseRecognized: { value: 0 } } },
      coach: { cards: { usedHours: { value: 80.5 } } },
      court: { cards: { utilizationRate: { value: 29.46 } } }
    },
    weeklyReportRaw: {
      coaches: [{ name: '朝珺', status: '在职' }, { name: '刘润扬', status: '在职' }, { name: '小鹿', status: '在职' }],
      schedule: realDataHardGateScheduleRows,
      courts: [
        { id: 'real-internal-court', campus: 'shunyi_mapo', history: [
          { id: 'real-renovation-0831', type: '消费', category: '全天装修锁场', date: '2026-08-31', startTime: '2026-08-31 08:00:00', endTime: '2026-08-31 22:00:00', amount: 0 },
          { id: 'real-renovation-0901', type: '消费', category: '装修维护内部使用', date: '2026-09-01', startTime: '2026-09-01 08:00:00', endTime: '2026-09-01 22:00:00', amount: 0 }
        ] }
      ],
      financeNormalizedRows: realDataHardGateFinanceRows
    }
  };
  const result = await generateWeeklyBusinessReport({
    period,
    generationMode: 'manual',
    baseUrl: 'https://www.flowtennis.cn',
    mkTable: async () => {},
    get: async () => ({ id: 'weekly:顺义马坡:2026-08-27:2026-09-03', shareToken: 'fallback-token', status: 'success' }),
    put: async (_table, _id, row) => { savedRows.push(row); },
    loadOperationsPayload: async ({ scope }) => {
      liveLoads += 1;
      if (!scope?.dateRange?.startDate) {
        return { operations: { overview: { cards: { totalIncome: { value: 989113.24 } } } } };
      }
      return livePayload;
    },
    loadOperationsSnapshot: async () => {
      snapshotLoads += 1;
      const err = new Error('经营分析快照正在刷新，请稍后重试');
      err.code = 'OPERATIONS_SNAPSHOT_NOT_READY';
      err.statusCode = 503;
      throw err;
    }
  });
  return { result, savedRows, liveLoads, snapshotLoads, elapsedMs: Date.now() - startedAt };
}

function makeReadyWeeklyDraftRow(overrides = {}) {
  const draftSnapshot = buildWeeklyBusinessReportSnapshot({
    period,
    generatedAt: '2026-09-18T14:00:00.000Z',
    generationMode: 'draft',
    shareToken: 'draft-token',
    baseUrl: 'https://www.flowtennis.cn',
    operationsPayload: {
      operations: {},
      weeklyReportRaw: {
        coaches: [{ name: '朝珺', status: '在职' }, { name: '刘润扬', status: '在职' }],
        purchases: [
          { id: 'draft-private-1', studentId: 'draft-student-1', studentName: '草稿购课1', courseType: '私教课', packageName: '成人1v1私教课', purchaseDate: '2026-08-28', amountPaid: 1000, campus: 'shunyi_mapo' },
          { id: 'draft-private-2', studentId: 'draft-student-2', studentName: '草稿购课2', courseType: '私教课', packageName: '成人1v1私教课', purchaseDate: '2026-08-29', amountPaid: 2000, campus: 'shunyi_mapo' },
          { id: 'draft-private-3', studentId: 'draft-student-3', studentName: '草稿购课3', courseType: '青少年私教课', packageName: '青少年私教课包', purchaseDate: '2026-08-30', amountPaid: 3000, campus: 'shunyi_mapo' }
        ],
        schedule: [
          { id: 'draft-schedule-1', coach: '朝珺教练', studentId: 'draft-student-1', studentName: '草稿购课1', courseType: '私教课', startTime: '2026-08-28 10:00:00', endTime: '2026-08-28 11:00:00', status: '已下课', campus: 'shunyi_mapo', durationHours: 40.5 },
          { id: 'draft-schedule-2', coach: '刘润扬教练', studentId: 'draft-student-2', studentName: '草稿购课2', courseType: '私教课', startTime: '2026-08-29 10:00:00', endTime: '2026-08-29 11:00:00', status: '已下课', campus: 'shunyi_mapo', durationHours: 27 }
        ],
        financeNormalizedRows: [
          { id: 'draft-cash-1', campusName: '顺义马坡', businessDate: '2026-08-28', businessType: '课程', action: '收款', cashDelta: 1000, recognizedRevenueDelta: 0, sourceDocument: '购买记录 draft-private-1', packageName: '成人1v1私教课' },
          { id: 'draft-cash-2', campusName: '顺义马坡', businessDate: '2026-08-29', businessType: '课程', action: '收款', cashDelta: 2000, recognizedRevenueDelta: 0, sourceDocument: '购买记录 draft-private-2', packageName: '成人1v1私教课' },
          { id: 'draft-cash-3', campusName: '顺义马坡', businessDate: '2026-08-30', businessType: '课程', action: '收款', cashDelta: 3000, recognizedRevenueDelta: 0, sourceDocument: '购买记录 draft-private-3', packageName: '青少年私教课包' },
          { id: 'draft-recognized', campusName: '顺义马坡', businessDate: '2026-08-31', businessType: '课程', action: '已入账', cashDelta: 0, recognizedRevenueDelta: 675 }
        ]
      }
    },
    previousOperationsPayload: {
      operations: {},
      weeklyReportRaw: {
        financeNormalizedRows: [{ id: 'draft-prev', campusName: '顺义马坡', businessDate: '2026-08-20', businessType: '课程', action: '已入账', cashDelta: 0, recognizedRevenueDelta: 100 }],
        schedule: [{ id: 'draft-prev-schedule', coach: '朝珺教练', studentName: '上周草稿', courseType: '私教课', startTime: '2026-08-20 10:00:00', endTime: '2026-08-20 11:00:00', status: '已下课', campus: 'shunyi_mapo', durationHours: 1 }]
      }
    },
    totalOperationsPayload: {
      operations: {},
      weeklyReportRaw: {
        financeNormalizedRows: [
          { id: 'draft-lifetime-before', campusName: '顺义马坡', businessDate: '2026-08-01', businessType: '课程', action: '收款', cashDelta: 1000, recognizedRevenueDelta: 0 },
          { id: 'draft-lifetime-current-1', campusName: '顺义马坡', businessDate: '2026-08-28', businessType: '课程', action: '收款', cashDelta: 1000, recognizedRevenueDelta: 0 },
          { id: 'draft-lifetime-current-2', campusName: '顺义马坡', businessDate: '2026-08-29', businessType: '课程', action: '收款', cashDelta: 2000, recognizedRevenueDelta: 0 },
          { id: 'draft-lifetime-current-3', campusName: '顺义马坡', businessDate: '2026-08-30', businessType: '课程', action: '收款', cashDelta: 3000, recognizedRevenueDelta: 0 },
          { id: 'draft-lifetime-after', campusName: '顺义马坡', businessDate: '2026-09-04', businessType: '课程', action: '收款', cashDelta: 9999, recognizedRevenueDelta: 0 }
        ]
      }
    }
  });
  return {
    ...draftSnapshot,
    ...overrides,
    id: 'weekly-draft:顺义马坡:2026-08-27:2026-09-03',
    draftOf: 'weekly:顺义马坡:2026-08-27:2026-09-03',
    status: 'ready'
  };
}

async function callManualRegenerationPublishesReadyDraft() {
  const draft = makeReadyWeeklyDraftRow();
  const savedRows = [];
  let rebuiltDraft = draft;
  let liveLoads = 0;
  let sourceScans = 0;
  let snapshotLoads = 0;
  let json = null;
  const startedAt = Date.now();
  const routes = createWeeklyBusinessReportRoutes({
    init: async () => {},
    sendJson: (_res, value, statusCode = 200) => { json = { statusCode, value }; return value; },
    get: async (_table, id) => {
      if (id === draft.id) return rebuiltDraft;
      if (id === draft.draftOf) return {
        ...snapshot,
        id: draft.draftOf,
        shareToken: 'existing-token',
        generatedAt: '2026-09-18T14:13:00.000Z',
        remark: '人工备注必须保留',
        publicEdits: { remark: '公开编辑也必须保留' },
        status: 'success'
      };
      return null;
    },
    put: async (_table, id, row) => {
      savedRows.push(row);
      if (id === draft.id) rebuiltDraft = row;
    },
    mkTable: async () => {},
    buildOperationsPayload: async ({ baseRowsOverride, forceFreshSource }) => {
      liveLoads += 1;
      if (!baseRowsOverride) sourceScans += 1;
      if (forceFreshSource) assert.strictEqual(baseRowsOverride, undefined, '强制最新读取只能在第一步读取源数据');
      if (!forceFreshSource) assert.ok(baseRowsOverride, '同一次生成的派生指标必须复用同一批最新源数据');
      return operationsPayloadWithRawFacts;
    },
    loadOperationsSnapshot: async () => {
      snapshotLoads += 1;
      return operationsPayloadWithRawFacts;
    },
    table: 'ft_weekly_business_reports'
  });
  await routes.handleAdmin({
    path: '/admin/weekly-business-reports/regenerate',
    method: 'POST',
    body: { reportId: draft.draftOf, period: period },
    req: { headers: {} },
    res: {},
    user: { role: 'admin' }
  });
  return { json, savedRows, liveLoads, sourceScans, snapshotLoads, elapsedMs: Date.now() - startedAt };
}

async function callManualRegenerationWithoutReadyDraft() {
  let liveLoads = 0;
  let sourceScans = 0;
  let snapshotLoads = 0;
  const savedRows = [];
  const rows = new Map();
  rows.set('weekly:顺义马坡:2026-08-27:2026-09-03', { ...snapshot, id: 'weekly:顺义马坡:2026-08-27:2026-09-03', shareToken: 'missing-draft-token', status: 'success' });
  let json = null;
  const startedAt = Date.now();
  const routes = createWeeklyBusinessReportRoutes({
    init: async () => {},
    sendJson: (_res, value, statusCode = 200) => { json = { statusCode, value }; return value; },
    get: async (_table, id) => rows.get(id) || null,
    put: async (_table, id, row) => {
      savedRows.push(row);
      rows.set(id, row);
    },
    mkTable: async () => {},
    buildOperationsPayload: async ({ scope, baseRowsOverride }) => {
      liveLoads += 1;
      if (!baseRowsOverride) sourceScans += 1;
      if (scope?.dateRange?.startDate === period.previousStartDate) {
        return { operations: { overview: { cards: { totalIncome: { value: 100 } } } }, weeklyReportRaw: { financeNormalizedRows: realDataHardGateFinanceRows, schedule: realDataHardGateScheduleRows } };
      }
      return operationsPayloadWithRawFacts;
    },
    loadOperationsSnapshot: async () => {
      snapshotLoads += 1;
      return operationsPayloadWithRawFacts;
    },
    table: 'ft_weekly_business_reports'
  });
  await routes.handleAdmin({
    path: '/admin/weekly-business-reports/regenerate',
    method: 'POST',
    body: { reportId: 'weekly:顺义马坡:2026-08-27:2026-09-03', period },
    req: { headers: {} },
    res: {},
    user: { role: 'admin' }
  });
  return { json, liveLoads, sourceScans, snapshotLoads, savedRows, elapsedMs: Date.now() - startedAt };
}

async function callManualRegenerationRejectsInvalidDraft() {
  const validDraft = makeReadyWeeklyDraftRow();
  const invalidDraft = {
    ...validDraft,
    sections: {
      ...validDraft.sections,
      revenue: {
        ...validDraft.sections.revenue,
        course: {
          ...validDraft.sections.revenue.course,
          paidPeople: 3,
          receiptRows: validDraft.sections.revenue.course.receiptRows.slice(0, 2)
        }
      }
    }
  };
  let putCalls = 0;
  let json = null;
  const routes = createWeeklyBusinessReportRoutes({
    init: async () => {},
    sendJson: (_res, value, statusCode = 200) => { json = { statusCode, value }; return value; },
    get: async (_table, id) => {
      if (id === invalidDraft.id) return invalidDraft;
      if (id === invalidDraft.draftOf) return { ...snapshot, id: invalidDraft.draftOf, status: 'success' };
      return null;
    },
    put: async () => { putCalls += 1; },
    mkTable: async () => {},
    buildOperationsPayload: async () => { throw new Error('坏草稿不得现场修复'); },
    loadOperationsSnapshot: async () => { throw new Error('坏草稿不得现场修复'); },
    table: 'ft_weekly_business_reports'
  });
  await routes.handleAdmin({
    path: '/admin/weekly-business-reports/regenerate',
    method: 'POST',
    body: { reportId: invalidDraft.draftOf, period },
    req: { headers: {} },
    res: {},
    user: { role: 'admin' }
  });
  return { json, putCalls };
}

async function callDraftBuilderWritesReadyDraftOnly() {
  const savedRows = [];
  const result = await buildWeeklyBusinessReportDraft({
    period,
    generationMode: 'auto',
    baseUrl: 'https://www.flowtennis.cn',
    mkTable: async () => {},
    get: async () => ({ ...snapshot, id: 'weekly:顺义马坡:2026-08-27:2026-09-03', shareToken: 'builder-token', remark: '构建草稿不覆盖正式备注', status: 'success' }),
    put: async (_table, _id, row) => { savedRows.push(row); },
    loadOperationsPayload: async () => operationsPayloadWithRawFacts,
    loadOperationsSnapshot: async ({ scope }) => {
      if (scope?.dateRange?.startDate === period.startDate) return operationsPayloadWithRawFacts;
      if (scope?.dateRange?.startDate === period.previousStartDate) return { operations: { overview: { cards: { totalIncome: { value: 100 } } } }, weeklyReportRaw: { financeNormalizedRows: realDataHardGateFinanceRows, schedule: realDataHardGateScheduleRows } };
      return { operations: { overview: { cards: { totalIncome: { value: 1000 } } } }, weeklyReportRaw: operationsPayloadWithRawFacts.weeklyReportRaw };
    }
  });
  return { result, savedRows };
}

async function callManualRegenerationWithoutSnapshot() {
  let liveLoads = 0;
  let queuedScopes = 0;
  let json = null;
  let savedRows = 0;
  const routes = createWeeklyBusinessReportRoutes({
    init: async () => {},
    sendJson: (_res, value, statusCode = 200) => { json = { statusCode, value }; return value; },
    get: async () => null,
    put: async () => { savedRows += 1; },
    mkTable: async () => {},
    buildOperationsPayload: async () => {
      liveLoads += 1;
      return operationsPayloadWithRawFacts;
    },
    loadOperationsSnapshot: async () => null,
    queueOperationsSnapshotRebuild: async () => {
      queuedScopes += 1;
      return { queued: true };
    },
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
  return { json, liveLoads, queuedScopes, savedRows };
}

async function callManualRegenerationQueuesInsteadOfScanning() {
  let liveLoads = 0;
  let queuedScopes = 0;
  const queuedScopeRows = [];
  const routes = createWeeklyBusinessReportRoutes({
    init: async () => {},
    sendJson: (_res, value, statusCode = 200) => ({ value, statusCode }),
    get: async () => null,
    put: async () => {},
    mkTable: async () => {},
    buildOperationsPayload: async () => {
      liveLoads += 1;
      throw new Error('手动重新生成不得同步扫描完整源表');
    },
    loadOperationsSnapshot: async () => null,
    queueOperationsSnapshotRebuild: async ({ scope }) => {
      queuedScopes += 1;
      queuedScopeRows.push(scope);
      return { queued: true };
    },
    table: 'ft_weekly_business_reports'
  });
  const response = await routes.handleAdmin({
    path: '/admin/weekly-business-reports/regenerate',
    method: 'POST',
    body: { period },
    req: { headers: {} },
    res: {},
    user: { role: 'admin' }
  });
  return { response, liveLoads, queuedScopes, queuedScopeRows };
}

async function callManualRegenerationAutoPreparesSnapshots() {
  let prepared = false;
  let queueCalls = 0;
  let firstResponse = null;
  let secondResponse = null;
  const savedRows = [];
  const rows = new Map([
    ['weekly:顺义马坡:2026-08-27:2026-09-03', { ...snapshot, id: 'weekly:顺义马坡:2026-08-27:2026-09-03', shareToken: 'auto-prepare-token', status: 'success' }]
  ]);
  const routes = createWeeklyBusinessReportRoutes({
    init: async () => {},
    sendJson: (_res, value, statusCode = 200) => ({ value, statusCode }),
    get: async (_table, id) => rows.get(id) || null,
    put: async (_table, id, row) => { savedRows.push(row); rows.set(id, row); },
    mkTable: async () => {},
    buildOperationsPayload: async ({ baseRowsOverride }) => {
      assert.ok(baseRowsOverride, '自动准备完成后应继续复用已准备的原始事实');
      return operationsPayloadWithRawFacts;
    },
    loadOperationsSnapshot: async () => prepared ? operationsPayloadWithRawFacts : null,
    queueOperationsSnapshotRebuild: async ({ scope }) => {
      queueCalls += 1;
      assert.strictEqual(scope.view, 'weekly-report', '自动准备必须使用周报快照视图');
      assert.ok(scope.weeklyReportRawWindow, '自动准备必须优先排队生命周期原始事实快照');
      prepared = true;
      return { queued: true };
    },
    table: 'ft_weekly_business_reports'
  });
  firstResponse = await routes.handleAdmin({
    path: '/admin/weekly-business-reports/regenerate',
    method: 'POST',
    body: { period },
    req: { headers: {} },
    res: {},
    user: { role: 'admin' }
  });
  secondResponse = await routes.handleAdmin({
    path: '/admin/weekly-business-reports/regenerate',
    method: 'POST',
    body: { period },
    req: { headers: {} },
    res: {},
    user: { role: 'admin' }
  });
  return { firstResponse, secondResponse, queueCalls, savedRows };
}

async function callManualRegenerationUsesFreshSource() {
  let freshLoads = 0;
  let sourceScans = 0;
  let snapshotLoads = 0;
  const snapshotScopes = [];
  let json = null;
  const rows = new Map();
  const routes = createWeeklyBusinessReportRoutes({
    init: async () => {},
    sendJson: (_res, value, statusCode = 200) => { json = { value, statusCode }; return value; },
    get: async (_table, id) => rows.get(id) || null,
    put: async (_table, id, row) => { rows.set(id, row); },
    mkTable: async () => {},
    buildOperationsPayload: async ({ baseRowsOverride }) => {
      freshLoads += 1;
      if (!baseRowsOverride) {
        sourceScans += 1;
        throw new Error('手动重新生成不得回退到慢速源表扫描');
      }
      return operationsPayloadWithRawFacts;
    },
    loadOperationsSnapshot: async ({ scope }) => {
      snapshotLoads += 1;
      snapshotScopes.push(scope);
      const startDate = scope?.dateRange?.startDate;
      if (!startDate) return operationsPayloadWithRawFacts;
      return {
        ...operationsPayloadWithRawFacts,
        weeklyReportRaw: {
          ...operationsPayloadWithRawFacts.weeklyReportRaw,
          financeNormalizedRows: [
            ...operationsPayloadWithRawFacts.weeklyReportRaw.financeNormalizedRows,
            { id: `fresh-snapshot-${startDate}`, campusName: '顺义马坡', businessDate: startDate, businessType: '课程', action: '已入账', cashDelta: 0, recognizedRevenueDelta: 1 }
          ],
          schedule: [
            ...operationsPayloadWithRawFacts.weeklyReportRaw.schedule,
            { id: `fresh-schedule-${startDate}`, coach: '朝珺教练', studentName: '快照学员', courseType: '私教课', startTime: `${startDate} 10:00:00`, endTime: `${startDate} 11:00:00`, status: '已下课', campus: 'shunyi_mapo' }
          ]
        }
      };
    },
    queueOperationsSnapshotRebuild: async () => ({ queued: true }),
    table: 'ft_weekly_business_reports'
  });
  await routes.handleAdmin({
    path: '/admin/weekly-business-reports/regenerate',
    method: 'POST',
    body: { period },
    req: { headers: {} },
    res: {},
    user: { role: 'admin' }
  });
  return { json, freshLoads, sourceScans, snapshotLoads, snapshotScopes };
}

async function callManualRegenerationUsesRefreshingLifetimeSnapshot() {
  const savedRows = [];
  let derivedLoads = 0;
  let error = null;
  try {
    await generateWeeklyBusinessReport({
      period,
      generationMode: 'manual',
      allowLiveFallback: false,
      get: async () => null,
      put: async (_table, _id, row) => { savedRows.push(row); },
      mkTable: async () => {},
      loadOperationsPayload: async ({ baseRowsOverride }) => {
        assert.ok(baseRowsOverride, 'refreshing lifetime snapshot must not provide stale raw base rows');
        derivedLoads += 1;
        return operationsPayloadWithRawFacts;
      },
      loadOperationsSnapshot: async ({ scope }) => {
        if (!scope?.dateRange?.startDate) return { ...operationsPayloadWithRawFacts, snapshot: { refreshing: true } };
        return null;
      }
    });
  } catch (err) {
    error = err;
  }
  return { error, savedRows, derivedLoads };
}

async function callFailedRegenerationPreservesExistingRow() {
  const existingGeneratedAt = '2026-09-18T14:13:00.000Z';
  let putCalls = 0;
  let error = null;
  try {
    await generateWeeklyBusinessReport({
      period,
      generationMode: 'manual',
      allowLiveFallback: false,
      mkTable: async () => {},
      get: async () => ({
        id: 'weekly:顺义马坡:2026-09-11:2026-09-17',
        period,
        generatedAt: existingGeneratedAt,
        shareToken: 'existing-token',
        status: 'success'
      }),
      put: async () => { putCalls += 1; },
      loadOperationsPayload: async () => {
        throw new Error('同步全量读取不应被调用');
      },
      loadOperationsSnapshot: async () => null
    });
  } catch (err) {
    error = err;
  }
  return { error, putCalls, existingGeneratedAt };
}

async function callConcurrentHistoricalRegenerations() {
  let liveLoads = 0;
  let queuedScopes = 0;
  const startedAt = Date.now();
  const routes = createWeeklyBusinessReportRoutes({
    init: async () => {},
    sendJson: (_res, value, statusCode = 200) => ({ value, statusCode }),
    get: async () => null,
    put: async () => {},
    mkTable: async () => {},
    buildOperationsPayload: async () => {
      liveLoads += 1;
      throw new Error('历史周报缺快照时不得进入同步全量扫描');
    },
    loadOperationsSnapshot: async () => null,
    queueOperationsSnapshotRebuild: async () => {
      queuedScopes += 1;
      return { queued: true };
    },
    table: 'ft_weekly_business_reports'
  });
  const periods = [
    { startDate: '2026-08-27', endDate: '2026-09-03' },
    { startDate: '2026-08-20', endDate: '2026-08-27' },
    { startDate: '2026-08-13', endDate: '2026-08-20' }
  ];
  const responses = await Promise.all(periods.map(period => routes.handleAdmin({
    path: '/admin/weekly-business-reports/regenerate',
    method: 'POST',
    body: { period },
    req: { headers: {} },
    res: {},
    user: { role: 'admin' }
  })));
  return { responses, liveLoads, queuedScopes, elapsedMs: Date.now() - startedAt };
}

async function callTargetPeriodRegenerationRoute() {
  let generatedPeriod = null;
  let liveLoads = 0;
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
    buildOperationsPayload: async ({ scope }) => {
      liveLoads += 1;
      if (scope?.dateRange?.startDate === '2026-08-27') {
        generatedPeriod = scope.dateRange;
        return operationsPayloadWithRawFacts;
      }
      if (scope?.dateRange?.startDate === '2026-08-19') return { operations: { overview: { cards: { totalIncome: { value: 100 } } } }, weeklyReportRaw: { financeNormalizedRows: realDataHardGateFinanceRows, schedule: realDataHardGateScheduleRows } };
      if (scope?.dateRange?.startDate) return {
        operations: { overview: { cards: { totalIncome: { value: 100 }, recognizedRevenue: { value: 100 }, courseRecognized: { value: 100 } } } },
        weeklyReportRaw: {
          financeNormalizedRows: [{ id: `target-trend-${scope.dateRange.startDate}`, campusName: '顺义马坡', businessDate: scope.dateRange.endDate, businessType: '课程', action: '已入账', cashDelta: 0, recognizedRevenueDelta: 100 }],
          schedule: [{ id: `target-trend-schedule-${scope.dateRange.startDate}`, coach: '趋势教练', studentName: '趋势学员', courseType: '私教课', startTime: `${scope.dateRange.endDate} 10:00:00`, endTime: `${scope.dateRange.endDate} 11:00:00`, status: '已结束', campus: 'shunyi_mapo' }]
        }
      };
      return {
        operations: { overview: { cards: { totalIncome: { value: 1000 } } } },
        weeklyReportRaw: operationsPayloadWithRawFacts.weeklyReportRaw
      };
    },
    loadOperationsSnapshot: async ({ scope }) => {
      if (scope?.dateRange?.startDate === '2026-08-27') {
        generatedPeriod = scope.dateRange;
        return operationsPayloadWithRawFacts;
      }
      if (scope?.dateRange?.startDate === '2026-08-19') return { operations: { overview: { cards: { totalIncome: { value: 100 } } } }, weeklyReportRaw: { financeNormalizedRows: realDataHardGateFinanceRows, schedule: realDataHardGateScheduleRows } };
      if (scope?.dateRange?.startDate) return {
        operations: { overview: { cards: { totalIncome: { value: 100 }, recognizedRevenue: { value: 100 }, courseRecognized: { value: 100 } } } },
        weeklyReportRaw: {
          financeNormalizedRows: [{ id: `target-trend-snapshot-${scope.dateRange.startDate}`, campusName: '顺义马坡', businessDate: scope.dateRange.endDate, businessType: '课程', action: '已入账', cashDelta: 0, recognizedRevenueDelta: 100 }],
          schedule: [{ id: `target-trend-snapshot-schedule-${scope.dateRange.startDate}`, coach: '趋势教练', studentName: '趋势学员', courseType: '私教课', startTime: `${scope.dateRange.endDate} 10:00:00`, endTime: `${scope.dateRange.endDate} 11:00:00`, status: '已结束', campus: 'shunyi_mapo' }]
        }
      };
      return {
        operations: { overview: { cards: { totalIncome: { value: 1000 } } } },
        weeklyReportRaw: operationsPayloadWithRawFacts.weeklyReportRaw
      };
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
  return { json, generatedPeriod, liveLoads, webhookCalls };
}

async function callSequentialSnapshotGeneration() {
  let activeLoads = 0;
  let maxActiveLoads = 0;
  await generateWeeklyBusinessReport({
    get: async () => null,
    put: async () => {},
    mkTable: async () => {},
    loadOperationsPayload: async () => operationsPayloadWithRawFacts,
    loadOperationsSnapshot: async ({ scope }) => {
      activeLoads += 1;
      maxActiveLoads = Math.max(maxActiveLoads, activeLoads);
      await new Promise(resolve => setTimeout(resolve, 5));
      activeLoads -= 1;
      if (scope?.dateRange?.startDate === period.startDate) return operationsPayloadWithRawFacts;
      if (scope?.dateRange?.startDate === period.previousStartDate) return { operations: { overview: { cards: { totalIncome: { value: 100 } } } }, weeklyReportRaw: { financeNormalizedRows: realDataHardGateFinanceRows, schedule: realDataHardGateScheduleRows } };
      return { operations: { overview: { cards: { totalIncome: { value: 1000 } } } } };
    },
    period
  });
  return { maxActiveLoads };
}

Promise.all([callPublicRoute(), callPublicEditRoute(), callWeeklyReportListWithUser({ role: 'admin', dataScope: 'campus', campusIds: ['shunyi_mapo'] }), callWeeklyReportListWithUser({ role: 'editor', dataScope: 'campus', campusIds: ['shunyi_mapo'] }), callWeeklyReportListWithUser({ role: 'admin', dataScope: 'campus', campusIds: ['shilipu'] }), callListReportsWithOverlappingRows(), callSnapshotFirstGeneration(), callCampusScopedSnapshotGeneration(), callSnapshotWithoutRawFallbackGeneration(), callExistingReportManualRegeneration(), callExistingEightWeekTrendReuse(), callManualRegenerationIgnoresStaleCurrentSnapshot(), callLifetimeIncomeUsesCompleteRawFactsThroughCutoff(), callFastRegenerationFromLifetimeSnapshot(), callRegenerationFallsBackWhenLifetimeScheduleIsEmpty(), callManualRegenerationRepairsRawlessZeroTrendSnapshots(), callSnapshotFailureLiveFallbackGeneration(), callDraftBuilderWritesReadyDraftOnly(), callManualRegenerationPublishesReadyDraft(), callManualRegenerationWithoutReadyDraft(), callManualRegenerationRejectsInvalidDraft(), callFailedRegenerationPreservesExistingRow(), callConcurrentHistoricalRegenerations(), callManualRegenerationQueuesInsteadOfScanning(), callManualRegenerationAutoPreparesSnapshots(), callManualRegenerationUsesFreshSource(), callManualRegenerationUsesRefreshingLifetimeSnapshot(), callSequentialSnapshotGeneration()]).then(([result, editResult, mapoListResult, editorMapoListResult, otherCampusListResult, listResult, generationResult, campusGenerationResult, rawFallbackGenerationResult, existingGenerationResult, existingEightWeekResult, freshnessResult, lifetimeCutoffResult, fastRegenerationResult, emptyLifetimeScheduleResult, rawlessZeroTrendResult, fallbackGenerationResult, draftBuilderResult, readyPublishResult, missingDraftResult, invalidDraftResult, failedRegenerationResult, concurrentHistoricalResult, queuedRegenerationResult, autoPrepareResult, freshSourceResult, refreshingLifetimeResult, sequentialResult]) => {
  assert.strictEqual(result.handled, true, 'public weekly report HTML route should be handled before login auth');
  assert.strictEqual(result.statusCode, 200, 'public weekly report HTML route should return HTML without login');
  assert.match(result.html, /二、收入与收款/, 'public weekly report route should upgrade legacy stored HTML to the current report template');
  assert.doesNotMatch(result.html, /旧版周报/, 'public weekly report route should not return legacy incomplete HTML');
  assert.deepStrictEqual(editResult.handled, { success: true }, 'public weekly report edit route should be handled by share token');
  assert.strictEqual(editResult.json.success, true, 'public weekly report edit route should save editable values');
  assert.strictEqual(editResult.saved.publicEdits['summary.totalIncome'], '44,072 元', 'public weekly report edits should persist saved values');
  assert.strictEqual(editResult.saved.publicEdits.remark, '原备注不可丢失', 'public weekly report edits should merge with existing remarks instead of replacing them');
  assert.doesNotMatch(editResult.saved.publicEdits.bad, /[<>]/, 'public weekly report edits should strip HTML tags');
  assert.match(apiSource, /weeklyBusinessReportRoutes\.handlePublic\(\{path,method,body,res\}\)/, 'public weekly report edit route should receive the parsed request body');
  assert.ok(apiSource.indexOf('const body=req.body||{};') < apiSource.indexOf('weeklyBusinessReportRoutes.handlePublic({path,method,body,res})'), 'api should declare request body before public weekly report routes to keep login from crashing');
  assert.strictEqual(vm.runInNewContext(`${weeklyPageSource}\nweeklyReportHours(67.5)`), '67.5', 'weekly report list should preserve half-hour values');
  assert.strictEqual(mapoListResult.statusCode, 200, 'Mapo campus users should access the weekly report list route');
  assert.strictEqual(mapoListResult.json.reports.length, 1, 'Mapo campus users should receive weekly report list rows');
  assert.strictEqual(editorMapoListResult.statusCode, 200, 'Mapo campus scoped coach users should access the weekly report list route');
  assert.strictEqual(editorMapoListResult.json.reports.length, 1, 'Mapo campus scoped coach users should receive weekly report list rows');
  assert.strictEqual(otherCampusListResult.statusCode, 403, 'non-Mapo campus users should not access the weekly report list route');
  assert.deepStrictEqual(listResult.map(row => row.id), [
    'weekly:顺义马坡:2026-09-04:2026-09-10',
    'weekly:顺义马坡:2026-08-27:2026-09-03'
  ], 'weekly report list should hide non-canonical overlapping rows after the period boundary fix');
  assert.strictEqual(listResult[0].canRegenerate, true, 'weekly report list should enable regeneration only when a ready draft exists');
  assert.strictEqual(listResult[1].canRegenerate, false, 'weekly report list should not expose a failing regenerate action without a ready draft');
  assert.ok(generationResult.liveLoads >= 1, 'weekly report generation should live-load when the available snapshot does not include raw facts');
  assert.strictEqual(generationResult.result.shareToken, 'fast-token', 'snapshot-first generation should preserve the existing share link');
  assert.strictEqual(generationResult.savedRows.length, 1, 'snapshot-first generation should save one weekly report row');
  assert.ok(generationResult.elapsedMs < 10000, `snapshot-first generation should finish within 10 seconds, got ${generationResult.elapsedMs}ms`);
  assert.ok(campusGenerationResult.derivedLoads >= 1, 'campus-scoped Mapo users should derive from the prepared lifetime snapshot without source-table fallback');
  assert.strictEqual(campusGenerationResult.snapshotUser.dataScope, 'all', 'weekly snapshot reads should use the shared all-data scope');
  assert.deepStrictEqual(campusGenerationResult.snapshotUser.campusIds, [], 'weekly snapshot reads should not create a campus-specific snapshot key');
  assert.strictEqual(campusGenerationResult.result.shareToken, 'campus-snapshot-token', 'campus-scoped snapshot generation should preserve the existing share link');
  assert.ok(rawFallbackGenerationResult.liveLoads >= 2, 'weekly report snapshots without raw facts must fall back to the live source for current and previous facts');
  assert.strictEqual(rawFallbackGenerationResult.result.shareToken, 'raw-fallback-token', 'raw-less snapshot fallback should preserve the existing share link');
  assert.strictEqual(rawFallbackGenerationResult.savedRows[0].summary.cashReceived.value, 49295.99, 'raw-less snapshot fallback must not save zero cash received');
  assert.strictEqual(rawFallbackGenerationResult.savedRows[0].summary.totalIncome.value, 38511.4, 'raw-less snapshot fallback must not save zero recognized revenue');
  assert.ok(existingGenerationResult.liveLoads >= 1, 'manual regeneration should derive current metrics from the lifetime raw snapshot without source-table fallback');
  assert.strictEqual(existingGenerationResult.snapshotLoads, 1, 'manual regeneration should read only the complete lifetime snapshot when raw facts are ready');
  assert.deepStrictEqual(existingGenerationResult.snapshotScopes, ['lifetime'], 'manual regeneration should derive all report contexts from the lifetime snapshot');
  assert.strictEqual(existingGenerationResult.result.shareToken, 'existing-token', 'manual regeneration for an existing report should keep the share link');
  assert.strictEqual(existingGenerationResult.savedRows.length, 1, 'manual regeneration for an existing report should save the rerendered report');
  assert.strictEqual(existingGenerationResult.savedRows[0].publicEdits.remark, '重新生成也保留', 'manual regeneration should preserve saved public remarks');
  assert.strictEqual(existingGenerationResult.savedRows[0].sections.trends.length, 8, 'manual regeneration should save eight weekly trend points when platform snapshots exist');
  existingGenerationResult.savedRows[0].sections.trends.forEach(row => {
    ['businessRevenue', 'cashReceived', 'courtUtilizationRate', 'coachHours'].forEach(key => {
      assert.ok(Number(row[key]) > 0, `manual regeneration should not save a zero ${key} trend when platform data exists for ${row.label}`);
    });
  });
  assert.ok(existingGenerationResult.elapsedMs < 10000, `existing report manual regeneration should finish within 10 seconds, got ${existingGenerationResult.elapsedMs}ms`);
  assert.strictEqual(existingEightWeekResult.snapshotLoads, 1, 'existing eight-week trend reuse should only read the lifetime snapshot');
  assert.deepStrictEqual(existingEightWeekResult.savedRows[0].sections.trends, existingEightWeekResult.existingTrends, 'manual regeneration should preserve all eight existing trend rows instead of rebuilding only current and previous weeks');
  assert.ok(freshnessResult.liveLoads >= 2, 'manual regeneration should live-read facts when the current snapshot is refreshing');
  assert.strictEqual(freshnessResult.savedRows[0].sections.revenue.course.paidPeople, 1, 'manual regeneration should not use an expired current snapshot');
  assert.strictEqual(freshnessResult.savedRows[0].sections.revenue.storedValue.totalMembers, 1, 'manual regeneration should not use expired stored-value rows');
  assert.strictEqual(freshnessResult.result.shareToken, 'freshness-token', 'manual regeneration freshness guard should preserve the existing share link');
  assert.strictEqual(lifetimeCutoffResult.savedRows[0].lifetimeSummary.totalIncome.value, 1500, 'lifetime income should use complete raw facts through the report end date and exclude later receipts');
  assert.ok(lifetimeCutoffResult.liveScopes.includes('lifetime'), 'lifetime income should live-read complete raw facts when the lifetime snapshot has no raw rows');
  assert.strictEqual(fastRegenerationResult.savedRows.length, 1, 'complete lifetime snapshot should allow one-request regeneration without waiting for trend snapshots');
  assert.ok(fastRegenerationResult.derivedLoads >= 1, 'complete lifetime snapshot should derive current metrics and trends in memory');
  assert.strictEqual(fastRegenerationResult.snapshotLoads, 1, 'complete lifetime snapshot should not probe current, previous, or trend snapshot shards');
  assert.deepStrictEqual(emptyLifetimeScheduleResult.snapshotScopes.slice(0, 3), ['lifetime', period.startDate, period.previousStartDate], 'lifetime snapshot without排课事实 must fall back to current and previous weekly snapshots');
  assert.ok(emptyLifetimeScheduleResult.derivedLoads >= 2, '专用周快照必须先按当前周范围派生经营数据');
  assert.strictEqual(emptyLifetimeScheduleResult.savedRows[0].sections.revenue.course.totalPeople, 1, '专用周快照派生后购课人数必须按当前周统计');
  assert.ok(emptyLifetimeScheduleResult.savedRows[0].sections.coach.totalHours > 0, 'lifetime snapshot without排课事实 must not publish zero coach hours');
  assert.strictEqual(emptyLifetimeScheduleResult.savedRows[0].sections.coach.totalHours, emptyLifetimeScheduleResult.savedRows[0].sections.revenue.course.completedHours, '教练经营完成课时必须与课程上课课时共用去重后的排课事实');
  assert.strictEqual(emptyLifetimeScheduleResult.savedRows[0].sections.court.usageRows.find(row => row.key === 'course')?.hours, emptyLifetimeScheduleResult.savedRows[0].sections.revenue.course.completedHours, '课程订场时长必须与课程上课课时共用去重后的排课事实');
  assert.strictEqual(rawlessZeroTrendResult.liveLoads, 4, 'manual regeneration should live-load current, previous, lifetime and trailing trend windows when stored snapshots lack finance facts');
  assert.strictEqual(rawlessZeroTrendResult.result.shareToken, 'rawless-zero-trend-token', 'rawless zero trend repair should preserve the existing share link');
  assert.strictEqual(rawlessZeroTrendResult.savedRows[0].summary.cashReceived.value, 49295.99, 'rawless current snapshot repair should rebuild weekly cash received from live facts');
  assert.strictEqual(rawlessZeroTrendResult.savedRows[0].summary.totalIncome.value, 38511.4, 'rawless current snapshot repair should rebuild weekly recognized revenue from live facts');
  assert.strictEqual(rawlessZeroTrendResult.savedRows[0].summary.coachHours.value, 80.5, 'rawless current snapshot repair should rebuild completed hours from live facts without dirty Xiaolu schedules');
  assert.strictEqual(rawlessZeroTrendResult.savedRows[0].lifetimeSummary.totalIncome.value, 1746191.23, 'rawless current snapshot repair should rebuild lifetime income from live facts');
  assert.strictEqual(rawlessZeroTrendResult.savedRows[0].sections.trends.length, 8, 'rawless zero trend repair should save eight weekly trend points');
  rawlessZeroTrendResult.savedRows[0].sections.trends.forEach(row => {
    ['businessRevenue', 'cashReceived', 'courtUtilizationRate', 'coachHours'].forEach(key => {
      assert.ok(Number(row[key]) > 0, `rawless zero trend repair should rebuild ${key} from live facts for ${row.label}`);
    });
  });
  assert.ok(fallbackGenerationResult.snapshotLoads >= 1, 'snapshot failure fallback should first try the fast snapshot path');
  assert.ok(fallbackGenerationResult.liveLoads >= 1, 'snapshot failure fallback should read the live weekly report source instead of returning 503');
  assert.strictEqual(fallbackGenerationResult.result.shareToken, 'fallback-token', 'snapshot failure fallback should preserve the existing share link');
  assert.strictEqual(fallbackGenerationResult.savedRows.length, 1, 'snapshot failure fallback should save one corrected weekly report row');
  assert.strictEqual(fallbackGenerationResult.savedRows[0].summary.cashReceived.value, 49295.99, 'snapshot failure fallback should save the confirmed weekly cash received value');
  assert.strictEqual(fallbackGenerationResult.savedRows[0].summary.totalIncome.value, 38511.4, 'snapshot failure fallback should save the confirmed recognized business revenue value');
  assert.strictEqual(fallbackGenerationResult.savedRows[0].lifetimeSummary.totalIncome.value, 1746191.23, 'snapshot failure fallback should save confirmed lifetime received income through report end date instead of the stale 989113 card');
  assert.strictEqual(fallbackGenerationResult.savedRows[0].sections.revenue.recognized.courseConsumedRevenue, 26650.4, 'snapshot failure fallback should not save zero course consumed revenue');
  assert.strictEqual(fallbackGenerationResult.savedRows[0].sections.trends.length, 8, 'snapshot failure fallback should rebuild eight trend points from live facts');
  fallbackGenerationResult.savedRows[0].sections.trends.forEach(row => {
    ['businessRevenue', 'cashReceived', 'courtUtilizationRate', 'coachHours'].forEach(key => {
      assert.ok(Number(row[key]) > 0, `snapshot failure fallback should not save a zero ${key} trend for ${row.label}`);
    });
  });
  assert.ok(fallbackGenerationResult.elapsedMs < 10000, `snapshot failure fallback should finish within 10 seconds in the hard gate, got ${fallbackGenerationResult.elapsedMs}ms`);
  assert.strictEqual(draftBuilderResult.savedRows.length, 1, 'draft builder should write exactly one ready draft row');
  assert.strictEqual(draftBuilderResult.savedRows[0].id, 'weekly-draft:顺义马坡:2026-08-27:2026-09-03', 'draft builder should write the prebuilt report to the draft slot');
  assert.strictEqual(draftBuilderResult.savedRows[0].status, 'ready', 'draft builder should only expose validated ready drafts');
  assert.strictEqual(draftBuilderResult.savedRows[0].draftOf, 'weekly:顺义马坡:2026-08-27:2026-09-03', 'draft builder should link the draft to the formal report id');
  assert.strictEqual(readyPublishResult.json.statusCode, 200, 'manual regeneration with a ready draft should succeed');
  assert.strictEqual(readyPublishResult.json.value.success, true, 'manual regeneration should return explicit success after publishing the ready draft');
  assert.strictEqual(readyPublishResult.sourceScans, 0, 'manual regeneration should not scan source tables in the request');
  assert.strictEqual(readyPublishResult.snapshotLoads, 1, 'manual regeneration should read only the prepared lifetime snapshot when raw facts are ready');
  assert.strictEqual(readyPublishResult.savedRows.length, 2, 'manual regeneration should save one validated draft and one formal weekly report row');
  const readyDraftRow = readyPublishResult.savedRows.find(row => row.status === 'ready');
  const readyPublishedRow = readyPublishResult.savedRows.find(row => row.status === 'success');
  assert.ok(readyDraftRow, 'manual regeneration should persist the newly validated draft');
  assert.strictEqual(readyPublishedRow.id, 'weekly:顺义马坡:2026-08-27:2026-09-03', 'manual regeneration should write the formal weekly report id');
  assert.strictEqual(readyPublishedRow.shareToken, 'existing-token', 'manual regeneration should preserve the existing share link');
  assert.strictEqual(readyPublishedRow.remark, '人工备注必须保留', 'manual regeneration should preserve saved private remarks');
  assert.strictEqual(readyPublishedRow.publicEdits.remark, '公开编辑也必须保留', 'manual regeneration should preserve saved public edits');
  assert.strictEqual(readyPublishedRow.summary.cashReceived.value, 49295.99, 'manual regeneration should publish the latest weekly receipts');
  assert.strictEqual(readyPublishedRow.summary.totalIncome.value, 38511.4, 'manual regeneration should publish the latest recognized revenue');
  assert.strictEqual(readyPublishedRow.summary.coachHours.value, 80.5, 'manual regeneration should publish the latest completed hours');
  assert.notStrictEqual(readyPublishedRow.generatedAt, '2026-09-18T14:13:00.000Z', 'manual regeneration should update generated time only after successful publish');
  assert.ok(readyPublishResult.elapsedMs < 10000, `manual fresh regeneration should finish within 10 seconds in the test fixture, got ${readyPublishResult.elapsedMs}ms`);
  assert.strictEqual(missingDraftResult.json.statusCode, 200, 'manual regeneration without an existing ready draft should still succeed');
  assert.strictEqual(missingDraftResult.json.value.success, true, 'manual regeneration should auto-build and publish when the ready draft is missing');
  assert.strictEqual(missingDraftResult.sourceScans, 0, 'missing ready draft should build from prepared snapshots without scanning source tables');
  assert.ok(missingDraftResult.savedRows.some(row => row.id === 'weekly-draft:顺义马坡:2026-08-27:2026-09-03' && row.status === 'ready'), 'missing ready draft flow should save a validated ready draft');
  assert.ok(missingDraftResult.savedRows.some(row => row.id === 'weekly:顺义马坡:2026-08-27:2026-09-03' && row.status === 'success'), 'missing ready draft flow should publish the formal weekly report');
  assert.ok(missingDraftResult.elapsedMs < 10000, `manual regeneration without a ready draft should finish within 10 seconds in the hard gate, got ${missingDraftResult.elapsedMs}ms`);
  assert.strictEqual(invalidDraftResult.json.statusCode, 503, 'manual regeneration should return a controlled snapshot-not-ready error');
  assert.doesNotMatch(String(invalidDraftResult.json.value.error || ''), /success/, 'snapshot failure must not be reported as success');
  assert.strictEqual(invalidDraftResult.putCalls, 0, 'fresh-source failure must not publish or update generated time');
  assert.strictEqual(failedRegenerationResult.error?.code, 'WEEKLY_REPORT_SNAPSHOT_NOT_READY', 'failed regeneration should report that the source snapshot is not ready');
  assert.strictEqual(failedRegenerationResult.putCalls, 0, 'failed regeneration must not write a new report row or generated time');
  assert.strictEqual(failedRegenerationResult.existingGeneratedAt, '2026-09-18T14:13:00.000Z', 'failed regeneration must preserve the previous generated time');
  assert.strictEqual(queuedRegenerationResult.liveLoads, 0, 'manual regeneration must not scan source tables when snapshots are unavailable');
  assert.ok(queuedRegenerationResult.queuedScopes >= 1, 'missing weekly snapshot should queue automatic preparation');
  assert.strictEqual(queuedRegenerationResult.response.statusCode, 202, 'missing weekly snapshot should return a preparation response');
  assert.strictEqual(queuedRegenerationResult.response.value.preparing, true, 'missing weekly snapshot should be reported as preparation instead of a permanent failure');
  assert.strictEqual(autoPrepareResult.firstResponse.statusCode, 202, 'manual regeneration should automatically prepare a missing weekly snapshot');
  assert.strictEqual(autoPrepareResult.firstResponse.value.preparing, true, 'missing weekly snapshot should return a preparation response');
  assert.ok(autoPrepareResult.queueCalls >= 1, 'missing weekly snapshot should queue the lifetime weekly-report snapshot');
  assert.strictEqual(autoPrepareResult.secondResponse.statusCode, 200, 'manual regeneration should succeed after the queued snapshot is ready');
  assert.strictEqual(autoPrepareResult.secondResponse.value.success, true, 'automatic snapshot preparation should lead to a successful regeneration');
  assert.strictEqual(freshSourceResult.json.statusCode, 200, `manual regeneration should return success from prepared snapshots in one request: ${JSON.stringify(freshSourceResult.json)} scopes=${JSON.stringify(freshSourceResult.snapshotScopes)}`);
  assert.strictEqual(freshSourceResult.json.value.success, true, 'manual regeneration should not return a preparation failure when the fresh source is available');
  assert.strictEqual(freshSourceResult.sourceScans, 0, 'manual regeneration should not read source tables in the request');
  assert.strictEqual(freshSourceResult.snapshotLoads, 1, 'manual regeneration should use only the prepared lifetime snapshot when raw facts are ready');
  assert.strictEqual(refreshingLifetimeResult.error?.code, 'WEEKLY_REPORT_SNAPSHOT_NOT_READY', 'manual regeneration must reject a refreshing lifetime snapshot so the route can queue a rebuild');
  assert.strictEqual(refreshingLifetimeResult.derivedLoads, 0, 'manual regeneration must not derive report data from a refreshing lifetime raw snapshot');
  assert.strictEqual(refreshingLifetimeResult.savedRows.length, 0, 'manual regeneration must not publish data from a refreshing lifetime raw snapshot');
  assert.strictEqual(concurrentHistoricalResult.liveLoads, 0, 'three concurrent historical report regenerations must not scan source tables');
  assert.ok(concurrentHistoricalResult.queuedScopes >= 3, 'historical report failures should queue automatic snapshot preparation tasks');
  assert.ok(concurrentHistoricalResult.responses.every(response => response.statusCode === 202 && response.value.preparing === true), 'historical report failures should return controlled preparation responses');
  assert.ok(concurrentHistoricalResult.elapsedMs < 1000, `three concurrent historical report requests should return quickly, got ${concurrentHistoricalResult.elapsedMs}ms`);
  assert.strictEqual(sequentialResult.maxActiveLoads, 1, 'weekly report regeneration should load operation snapshots sequentially to avoid TableStore getRow timeout fan-out');
  console.log('weekly business report tests passed');
}).catch(err => {
  console.error(err);
  process.exit(1);
});
