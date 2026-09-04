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
        recognizedRevenue: { value: 8000 }
      }
    },
    court: {
      cards: {
        bookingHours: { value: 30 },
        utilizationRate: { value: 66.7 }
      },
      usageMixRows: [
        { type: '散客场地使用', hours: 10, amount: 1200 },
        { type: '免费场地使用', hours: 2, amount: 0, receivableAmount: 300 }
      ]
    },
    coach: {
      cards: {
        usedHours: { value: 42 }
      },
      rows: [
        { coach: '王教练', privateLessons: 12, smallClassLessons: 3, trialLessons: 2, specialLessons: 1, sparringLessons: 1 }
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
      overview: { cards: { totalIncome: { value: 10000 } } },
      court: { cards: { utilizationRate: { value: 50 } } },
      coach: { cards: { usedHours: { value: 35 } } },
      conversion: { cards: { totalLeads: { value: 60 } } }
    }
  },
  shareToken: 'token-abc',
  baseUrl: 'https://www.flowtennis.cn'
});

assert.strictEqual(snapshot.campusName, '顺义马坡', 'snapshot should be fixed to Shunyi Mapo');
assert.strictEqual(snapshot.summary.totalIncome.value, 12000, 'snapshot should reuse operations income value');
assert.strictEqual(snapshot.summary.totalIncome.compare.changeValue, 2000, 'snapshot should include previous-period comparison');
assert.strictEqual(snapshot.shareUrl, 'https://www.flowtennis.cn/weekly-reports/token-abc', 'snapshot should expose a share URL');
assert.ok(snapshot.sections.court.freeUsage.receivableAmount >= 300, 'free court usage should keep zero actual amount and receivable concession amount');
assert.strictEqual(snapshot.sections.detailsMode, 'summary-only', 'weekly report should not expose single-record details');

const html = renderWeeklyBusinessReportHtml(snapshot, { remark: '本周雨天影响场地。' });
assert.match(html, /顺义马坡周报/, 'HTML should render the report title');
assert.match(html, /本周雨天影响场地。/, 'HTML should render admin remark text');
assert.doesNotMatch(html, /订单ID|线索ID|流水ID/, 'HTML should not expose single-record technical detail labels');

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
assert.match(weeklyRoutesSource, /\/weekly-business-reports/, 'api should expose admin weekly report list route');
assert.match(apiSource, /FEISHU_WEEKLY_BUSINESS_REPORT_WEBHOOK/, 'weekly report should use a dedicated Feishu webhook env');
assert.match(weeklyWorkflow, /cron: '0 0 \* \* 5'/, 'weekly report workflow should run Friday 08:00 Beijing time');
assert.match(weeklyWorkflow, /\/api\/cron\/weekly-business-report/, 'weekly report workflow should trigger the cron endpoint');
assert.match(indexHtml, /page-weekly-reports/, 'admin shell should include the weekly report page');
assert.match(indexHtml, /pages\/weekly-reports\.js/, 'admin shell should load the weekly report page script');
assert.match(weeklyPageSource, /重新生成本周周报/, 'admin page should allow manual regeneration');
assert.match(weeklyPageSource, /copyWeeklyReportLink/, 'admin page should allow copying the share link');
assert.match(weeklyPageSource, /tms-toolbar/, 'admin page should use the standard toolbar layout');
assert.match(weeklyPageSource, /tms-btn tms-btn-ghost/, 'admin page action buttons should use standard button styles');
assert.strictEqual((stateSource.match(/renderWeeklyReports\(\)/g) || []).length, 1, 'weekly reports page should render once per page data render');
assert.doesNotMatch(weeklyPageSource, /订单ID|线索ID|流水ID/, 'admin page should not expose single-record detail labels');

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
    scan: async () => [{ shareToken: 'public-token', status: 'success', html: '<h1>公开周报</h1>' }],
    table: 'ft_weekly_business_reports'
  });
  const handled = await routes.handlePublic({ path: '/public/weekly-business-reports/public-token', method: 'GET', res });
  return { handled, statusCode, html };
}

callPublicRoute().then(result => {
  assert.strictEqual(result.handled, true, 'public weekly report HTML route should be handled before login auth');
  assert.strictEqual(result.statusCode, 200, 'public weekly report HTML route should return HTML without login');
  assert.match(result.html, /公开周报/, 'public weekly report route should return stored HTML');
  console.log('weekly business report tests passed');
}).catch(err => {
  console.error(err);
  process.exit(1);
});
