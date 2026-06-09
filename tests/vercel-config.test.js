const assert = require('assert');
const fs = require('fs');
const path = require('path');

const config = JSON.parse(fs.readFileSync(path.join(__dirname, '../vercel.json'), 'utf8'));
const apiSource = fs.readFileSync(path.join(__dirname, '../api/index.js'), 'utf8');
const feishuDailyWorkflow = fs.readFileSync(path.join(__dirname, '../.github/workflows/feishu-daily-report.yml'), 'utf8');
const officialRemindersWorkflow = fs.readFileSync(path.join(__dirname, '../.github/workflows/official-account-reminders.yml'), 'utf8');
const officialDigestsWorkflow = fs.readFileSync(path.join(__dirname, '../.github/workflows/official-account-daily-digests.yml'), 'utf8');
const feishuCoachDigestsWorkflow = fs.readFileSync(path.join(__dirname, '../.github/workflows/feishu-coach-daily-digests.yml'), 'utf8');

assert.strictEqual(config.crons, undefined, 'Vercel 不配置 Cron，定时任务统一走 GitHub Actions');

assert.match(feishuDailyWorkflow, /cron: '5 12 \* \* \*'/, '飞书排课日报应由 GitHub Actions 定时触发');
assert.match(officialRemindersWorkflow, /\/api\/cron\/official-account-reminders/, '服务号课前提醒应由 GitHub Actions 触发');
assert.match(officialDigestsWorkflow, /\/api\/cron\/official-account-daily-digests/, '服务号次日课表应由 GitHub Actions 触发');
assert.match(feishuCoachDigestsWorkflow, /cron: '0 12 \* \* \*'/, '飞书教练私发次日排课应每天北京时间 20:00 触发');
assert.match(feishuCoachDigestsWorkflow, /\/api\/cron\/feishu-coach-daily-digests/, '飞书教练私发次日排课应由 GitHub Actions 触发');
assert.match(apiSource, /\/cron\/feishu-daily-report/, 'API 应提供排课日报入口');
assert.match(apiSource, /FEISHU_DAILY_REPORT_WEBHOOK/, '排课日报接口应读取飞书日报 webhook 环境变量');
assert.match(apiSource, /\/cron\/official-account-daily-digests/, 'API 应提供服务号次日排课入口');
assert.match(apiSource, /\/cron\/official-account-reminders/, 'API 应提供服务号课前提醒入口');
assert.match(apiSource, /\/cron\/feishu-coach-daily-digests/, 'API 应提供飞书教练私发次日排课入口');

console.log('vercel config tests passed');
