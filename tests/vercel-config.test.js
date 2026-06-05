const assert = require('assert');
const fs = require('fs');
const path = require('path');

const config = JSON.parse(fs.readFileSync(path.join(__dirname, '../vercel.json'), 'utf8'));
const apiSource = fs.readFileSync(path.join(__dirname, '../api/index.js'), 'utf8');

assert.deepStrictEqual(
  config.crons,
  [{ path: '/api/cron/feishu-daily-report', schedule: '5 12 * * *' }],
  '排课日报应由 Vercel Cron 在北京时间 20:05 触发，避免 GitHub 定时延迟到深夜'
);

assert.match(apiSource, /\/cron\/feishu-daily-report/, 'API 应提供 Vercel Cron 调用的排课日报入口');
assert.match(apiSource, /FEISHU_DAILY_REPORT_WEBHOOK/, '排课日报接口应读取飞书日报 webhook 环境变量');

console.log('vercel config tests passed');
