const fs = require('fs');
const path = require('path');
const axios = require('axios');

const FEISHU_WEBHOOK_URL = String(process.env.FEISHU_WEBHOOK_URL || process.env.FEISHU_BUSINESS_DAILY_REPORT_WEBHOOK || '').trim();
const DATA_PATH = path.join(__dirname, 'business-daily-report-data.json');

function formatMoney(value) {
  return `¥${(Number(value) || 0).toLocaleString('zh-CN', { maximumFractionDigits: 2 })}`;
}

function formatNumber(value) {
  return (Number(value) || 0).toLocaleString('zh-CN', { maximumFractionDigits: 2 });
}

function pluralUnit(value, unit) {
  return `${formatNumber(value)} ${unit}`;
}

function campusLine(row = {}) {
  return `${row.campusName}：实收 ${formatMoney(row.cash)}｜核销 ${formatMoney(row.recognized)}｜成交 ${formatNumber(row.tradeCount)} 笔｜上课核销 ${formatNumber(row.lessonStudents)} 人/${formatNumber(row.lessonUnits)} 课时｜待履约 ${formatMoney(row.pendingRevenue)}`;
}

function generateReport(snapshot = {}) {
  const overall = snapshot.overall || {};
  const cash = overall.cash || {};
  const recognized = overall.recognized || {};
  const redemption = overall.lessonRedemption || {};
  const income = snapshot.incomeStructure || {};
  const recognition = snapshot.recognitionStructure || {};
  const tomorrow = snapshot.tomorrowSchedule || {};
  const campusRows = Array.isArray(snapshot.campusRows) ? snapshot.campusRows : [];
  const content = [
    `**网球兄弟经营日报｜${snapshot.today || ''}**`,
    '',
    '**一、整体经营**',
    `今日实收：**${formatMoney(cash.today)}**`,
    `昨日实收：${formatMoney(cash.yesterday)}`,
    `近7日均值：${formatMoney(cash.sevenDayAverage)}`,
    `本月累计实收：${formatMoney(cash.monthToDate)}`,
    '',
    `今日核销确收：**${formatMoney(recognized.today)}**`,
    `昨日核销确收：${formatMoney(recognized.yesterday)}`,
    `近7日均值：${formatMoney(recognized.sevenDayAverage)}`,
    `本月累计核销：${formatMoney(recognized.monthToDate)}`,
    '',
    `今日成交：${formatNumber(overall.tradeCount?.today)} 笔`,
    `今日上课核销：${formatNumber(redemption.todayStudents)} 人｜${formatNumber(redemption.todayLessonUnits)} 课时`,
    `当前待履约余额：${formatMoney(overall.pendingRevenue?.current)}`,
    '',
    '**二、校区数据**',
    campusRows.length ? campusRows.map(campusLine).join('\n') : '暂无校区经营数据',
    '',
    '**三、收入结构**',
    `课包收入：${formatMoney(income.packageIncome)}`,
    `订场收入：${formatMoney(income.bookingIncome)}`,
    `会员储值：${formatMoney(income.storedValueIncome)}`,
    '',
    '**四、核销结构**',
    `课程核销：${formatMoney(recognition.courseRecognized)}`,
    `散客订场核销：${formatMoney(recognition.bookingRecognized)}`,
    `会员订场核销：${formatMoney(recognition.storedValueRecognized)}`,
    '',
    '**五、明日已排**',
    `明日课程：${pluralUnit(tomorrow.lessonCount, '节')}`,
    `预计上课学员：${pluralUnit(tomorrow.studentCount, '人')}`,
    `预约体验课：${pluralUnit(tomorrow.trialLessonCount, '人')}`
  ].join('\n');
  return {
    today: snapshot.today || '',
    content
  };
}

function buildFeishuCard(report = {}) {
  return {
    msg_type: 'interactive',
    card: {
      config: { wide_screen_mode: true },
      header: {
        template: 'blue',
        title: {
          content: '[网球兄弟]经营日报',
          tag: 'plain_text'
        }
      },
      elements: [
        {
          tag: 'markdown',
          content: report.content || ''
        },
        {
          tag: 'hr'
        },
        {
          tag: 'note',
          elements: [
            {
              tag: 'plain_text',
              content: '数据来源：FlowTennis 统一财务与经营快照。'
            }
          ]
        }
      ]
    }
  };
}

async function run() {
  if (!FEISHU_WEBHOOK_URL) throw new Error('缺少环境变量 FEISHU_WEBHOOK_URL');
  if (!fs.existsSync(DATA_PATH)) throw new Error(`找不到数据文件：${DATA_PATH}`);
  const snapshot = JSON.parse(fs.readFileSync(DATA_PATH, 'utf8'));
  const payload = buildFeishuCard(generateReport(snapshot));
  const response = await axios.post(FEISHU_WEBHOOK_URL, payload);
  if (response.data && response.data.code !== undefined && response.data.code !== 0) {
    throw new Error(`飞书接口返回失败：${response.data.msg || response.data.message || response.data.code}`);
  }
  console.log('经营日报发送成功');
}

if (require.main === module) {
  run().catch((err) => {
    console.error(err && err.stack ? err.stack : String(err));
    process.exit(1);
  });
}

module.exports = {
  buildFeishuCard,
  generateReport,
  formatMoney
};
