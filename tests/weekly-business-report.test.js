const assert = require('assert');
const fs = require('fs');
const path = require('path');

const {
  resolveWeeklyBusinessReportPeriod,
  buildWeeklyBusinessReportSnapshot,
  renderWeeklyBusinessReportHtml,
  buildWeeklyBusinessReportFeishuText
} = require('../server/weekly-business-report.js');
const { createWeeklyBusinessReportRoutes } = require('../server/weekly-business-report-routes.js');

const repoRoot = path.join(__dirname, '..');
const apiSource = fs.readFileSync(path.join(repoRoot, 'api/index.js'), 'utf8');
const weeklyRoutesSource = fs.readFileSync(path.join(repoRoot, 'server/weekly-business-report-routes.js'), 'utf8');
const weeklyWorkflow = fs.readFileSync(path.join(repoRoot, '.github/workflows/weekly-business-report.yml'), 'utf8');
const indexHtml = fs.readFileSync(path.join(repoRoot, 'public/index.html'), 'utf8');
const weeklyPageSource = fs.readFileSync(path.join(repoRoot, 'public/assets/scripts/pages/weekly-reports.js'), 'utf8');
const stateSource = fs.readFileSync(path.join(repoRoot, 'public/assets/scripts/core/state.js'), 'utf8');
const bootstrapSource = fs.readFileSync(path.join(repoRoot, 'public/assets/scripts/core/bootstrap.js'), 'utf8');
const publicApiSource = fs.readFileSync(path.join(repoRoot, 'public/assets/scripts/core/api.js'), 'utf8');
const operationsPageSource = fs.readFileSync(path.join(repoRoot, 'server/page-data/operations-page.js'), 'utf8');

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
      overview: { cards: { totalIncome: { value: 10000 }, courseRecognized: { value: 2000 } }, revenueMix: [{ name: '课程收入', value: 5000 }, { name: '会员储值', value: 1000 }] },
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
assert.strictEqual(snapshot.summary.totalIncome.value, 12000, 'snapshot should reuse operations income value');
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
assert.deepStrictEqual(noFakeSourceSnapshot.sections.court.usageRows.map(row => row.hours), [0, 0, 0, 0], 'weekly report must not fake guest usage when type mix rows are missing');
assert.strictEqual(noFakeSourceSnapshot.sections.coach.totalScheduled, 81, 'coach scheduled hours must equal all listed course type hours even when lessonCount conflicts');

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
        { id: 'guest-finance-a', businessDate: '2026-08-30', businessType: '场地 / 散客订场', cashDelta: 180 },
        { id: 'member-finance-a', businessDate: '2026-08-31', businessType: '场地 / 会员订场', cashDelta: 120 }
      ],
      schedule: [
        { id: 'coach-current', coach: '朝珺教练', courseType: '私教课', startTime: '2026-08-28 10:00:00', endTime: '2026-08-28 12:00:00', status: '已排课', campus: 'shunyi_mapo' },
        { id: 'dirty-current', coach: '小鹿教练', lessonCount: 2, startTime: '2026-08-28 10:00:00', endTime: '2026-08-28 12:00:00', status: '已排课', campus: 'shunyi_mapo' },
        { id: 'coach-prev', coach: '朝珺教练', courseType: '私教课', startTime: '2026-08-20 10:00:00', endTime: '2026-08-20 11:00:00', status: '已排课', campus: 'shunyi_mapo' },
        { id: 'inactive-coach', coach: '宋教练', courseType: '私教课', startTime: '2026-08-28 12:00:00', endTime: '2026-08-28 13:00:00', status: '已排课', campus: 'shunyi_mapo' }
      ],
      courts: [
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
assert.strictEqual(rawSnapshot.sections.revenue.course.newAmount, 2000, 'course new amount should sum first private package payments in period');
assert.strictEqual(rawSnapshot.sections.revenue.course.renewalPeople, 1, 'course renewal people should count non-first private package purchases');
assert.strictEqual(rawSnapshot.sections.revenue.course.renewalAmount, 3000, 'course renewal amount should sum non-first private package payments');
assert.strictEqual(rawSnapshot.sections.revenue.course.consumedAmount, 600, 'course consumed amount should come from course consume finance rows');
assert.strictEqual(rawSnapshot.sections.revenue.course.expiringPeople, 1, 'course depleted people should count depleted package holders in period');
  assert.strictEqual(rawSnapshot.sections.court.totalAvailableHours, 392, 'court available hours should use 4 courts * 14 hours * 7 days');
assert.strictEqual(rawSnapshot.sections.court.usageRows.find(row => row.key === 'guest')?.amount, 100, 'court history should remain the first source for guest booking amount');
assert.strictEqual(rawSnapshot.sections.court.usageRows.find(row => row.key === 'member')?.amount, 120, 'court finance rows should backfill member booking amount when court history is missing');
assert.strictEqual(rawSnapshot.sections.court.usageRows.find(row => row.key === 'member')?.count, 1, 'court finance rows should backfill member booking count when court history is missing');
assert.strictEqual(rawSnapshot.sections.court.usageRows.find(row => row.key === 'course')?.hours, 2, 'course court usage should include scheduled lesson court time');
assert.strictEqual(rawSnapshot.sections.court.usageRows.find(row => row.key === 'free')?.amount, 0, 'free court usage actual amount should be zero');
assert.strictEqual(rawSnapshot.sections.coach.rows.length, 1, 'coach report should only show active coaches with current-period schedules');
assert.strictEqual(rawSnapshot.sections.coach.rows[0].coach, '朝珺教练', 'inactive and no-schedule coaches should be excluded from coach report');
assert.strictEqual(rawSnapshot.sections.coach.rows[0].scheduledCount, 2, 'coach current scheduled column should use current week hours');
assert.strictEqual(rawSnapshot.sections.coach.rows[0].previousHours, 1, 'coach current/previous column should include previous week hours');
assert.strictEqual(rawSnapshot.sections.conversion.trialDeals, 1, 'conversion top trial deals should equal source row total');
assert.ok(rawSnapshot.sections.conversion.sourceRows.find(row => row.source === '抖音' && row.leads === 0), 'conversion source table should include standard zero-value sources');

const html = renderWeeklyBusinessReportHtml(snapshot, { remark: '本周雨天影响场地。' });
assert.match(html, /顺义马坡周报/, 'HTML should render the report title');
assert.match(html, /2026-08-27 - 2026-09-03（第 36 周）/, 'HTML should render the period week number in the top-right date pill');
assert.doesNotMatch(html, /<p class="hero-copy">2026-08-27 至 2026-09-03/, 'HTML should not repeat the period below the report title');
assert.match(html, /1、收入数据/, 'HTML should render revenue section');
assert.match(html, /2、场地数据/, 'HTML should render court section');
assert.match(html, /3、教练课时/, 'HTML should render coach section');
assert.match(html, /4、线索转化/, 'HTML should render lead conversion section');
assert.match(html, /专项课/, 'HTML should render special course coach metric');
assert.match(html, /donut|bar-row|cohort-heatmap/, 'HTML should render report charts');
assert.match(html, /USER RETENTION MATRIX[\s\S]*matrix-cell/, 'daily court utilization should use the template retention matrix style');
assert.match(html, /chart-tooltip[\s\S]*data-tooltip/, 'charts and metrics should support hover tooltips');
assert.match(html, /contenteditable="true"[\s\S]*save-edit/, 'weekly report should support direct editing and saving');
assert.match(html, /总场地利用率/, 'hero should show lifetime court utilization label');
assert.match(html, /总私教课人数/, 'hero should show lifetime private course people label');
assert.match(html, /本周收入[\s\S]*本周已入账[\s\S]*本周场地利用率[\s\S]*本周教练课时[\s\S]*本周线索数/, 'top weekly metrics should use requested labels');
assert.match(html, /12,000 元/, 'numbers should use thousands separators');
assert.match(html, /会员场地使用/, 'HTML should render member court usage row');
assert.match(html, /王教练/, 'HTML should render coach data rows');
assert.match(html, /小红书/, 'HTML should render lead source rows');
assert.doesNotMatch(html, /<td>-<\/td><td>-<\/td><td>-<\/td><td>-<\/td>/, 'HTML should not render rows with all empty metric cells when source data exists');
assert.match(html, /本周雨天影响场地。/, 'HTML should render admin remark text');
assert.doesNotMatch(html, /订单ID|线索ID|流水ID/, 'HTML should not expose single-record technical detail labels');
assert.match(renderWeeklyBusinessReportHtml(noFakeSourceSnapshot), />-</, 'HTML should show a dash when a requested metric has no reliable source');
const rawHtml = renderWeeklyBusinessReportHtml(rawSnapshot);
assert.match(rawHtml, /上周排课量[\s\S]*本周排课量[\s\S]*排课周环比/, 'coach table should use the requested current and previous schedule columns');
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
assert.match(apiSource, /FEISHU_WEEKLY_BUSINESS_REPORT_WEBHOOK/, 'weekly report should use a dedicated Feishu webhook env');
assert.match(weeklyWorkflow, /cron: '0 0 \* \* 5'/, 'weekly report workflow should run Friday 08:00 Beijing time');
assert.match(weeklyWorkflow, /\/api\/cron\/weekly-business-report/, 'weekly report workflow should trigger the cron endpoint');
assert.match(indexHtml, /page-weekly-reports/, 'admin shell should include the weekly report page');
assert.match(indexHtml, /pages\/weekly-reports\.js/, 'admin shell should load the weekly report page script');
assert.match(indexHtml, /api\.js\?v=20260904-weekly-report-share-v1/, 'admin shell should bust public weekly report share script cache');
assert.match(indexHtml, /weekly-report-share-shell[\s\S]*#loginPage\{display:none!important\}/, 'public weekly report shell should hide the login card before app scripts load');
assert.match(weeklyPageSource, /重新生成本周周报/, 'admin page should allow manual regeneration');
assert.match(weeklyPageSource, /copyWeeklyReportLink/, 'admin page should allow copying the share link');
assert.match(weeklyPageSource, /sticky:\s*true/, 'manual regeneration should keep the loading toast visible until completion');
assert.match(bootstrapSource, /options\.sticky/, 'toast helper should support sticky loading messages');
assert.match(weeklyPageSource, /tms-toolbar/, 'admin page should use the standard toolbar layout');
assert.match(weeklyPageSource, /tms-btn tms-btn-ghost/, 'admin page action buttons should use standard button styles');
assert.strictEqual((stateSource.match(/renderWeeklyReports\(\)/g) || []).length, 1, 'weekly reports page should render once per page data render');
assert.match(stateSource, /currentPage==='weekly-reports'\)return/, 'weekly report admin page should not auto-refresh on focus, visibility, or interval sync');
assert.doesNotMatch(weeklyPageSource, /订单ID|线索ID|流水ID/, 'admin page should not expose single-record detail labels');
assert.doesNotMatch(publicApiSource, /login-card[\s\S]*每周周报/, 'public weekly report share page should not render a login card while loading');
assert.match(publicApiSource, /FLOWTENNIS WEEKLY/, 'public weekly report share page should render an independent public loading shell');
assert.match(weeklyRoutesSource, /PUBLIC_BASE_URL \|\| 'https:\/\/www\.flowtennis\.cn'/, 'weekly report share links should default to the public production domain');
assert.match(weeklyRoutesSource, /res\.end\(renderWeeklyBusinessReportHtml\(report/, 'public route should always render with the current report template instead of serving stale stored HTML');
assert.match(operationsPageSource, /includeWeeklyReportRaw[\s\S]*weeklyReportRaw/, 'weekly report payload should include raw source rows for report-specific metrics');

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

Promise.all([callPublicRoute(), callPublicEditRoute()]).then(([result, editResult]) => {
  assert.strictEqual(result.handled, true, 'public weekly report HTML route should be handled before login auth');
  assert.strictEqual(result.statusCode, 200, 'public weekly report HTML route should return HTML without login');
  assert.match(result.html, /1、收入数据/, 'public weekly report route should upgrade legacy stored HTML to the current report template');
  assert.doesNotMatch(result.html, /旧版周报/, 'public weekly report route should not return legacy incomplete HTML');
  assert.deepStrictEqual(editResult.handled, { success: true }, 'public weekly report edit route should be handled by share token');
  assert.strictEqual(editResult.json.success, true, 'public weekly report edit route should save editable values');
  assert.strictEqual(editResult.saved.publicEdits['summary.totalIncome'], '44,072 元', 'public weekly report edits should persist saved values');
  assert.doesNotMatch(editResult.saved.publicEdits.bad, /[<>]/, 'public weekly report edits should strip HTML tags');
  console.log('weekly business report tests passed');
}).catch(err => {
  console.error(err);
  process.exit(1);
});
