const assert = require('assert');
const fs = require('fs');
const path = require('path');

const config = JSON.parse(fs.readFileSync(path.join(__dirname, '../vercel.json'), 'utf8'));
const apiSource = fs.readFileSync(path.join(__dirname, '../api/index.js'), 'utf8');

assert.deepStrictEqual(
  config.crons,
  [
    { path: '/api/cron/feishu-daily-report', schedule: '5 12 * * *' }
  ],
  'Vercel Cron 只保留飞书排课日报，服务号任务回 GitHub Actions'
);

assert.match(apiSource, /\/cron\/feishu-daily-report/, 'API 应提供 Vercel Cron 调用的排课日报入口');
assert.match(apiSource, /FEISHU_DAILY_REPORT_WEBHOOK/, '排课日报接口应读取飞书日报 webhook 环境变量');
assert.match(apiSource, /\/cron\/official-account-daily-digests/, 'API 应提供服务号次日排课入口');
assert.match(apiSource, /\/cron\/official-account-reminders/, 'API 应提供服务号课前提醒入口');

console.log('vercel config tests passed');
