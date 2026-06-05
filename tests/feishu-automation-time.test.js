const assert = require('assert');
const fs = require('fs');
const path = require('path');

const dailyWorkflow = fs.readFileSync(
  path.join(__dirname, '..', '.github', 'workflows', 'feishu-daily-report.yml'),
  'utf8'
);
const monitorWorkflow = fs.readFileSync(
  path.join(__dirname, '..', '.github', 'workflows', 'feishu-monitor.yml'),
  'utf8'
);
const monitorSource = fs.readFileSync(
  path.join(__dirname, '..', 'standalone-services', 'feishu-monitor.js'),
  'utf8'
);
const changelogWorkflow = fs.readFileSync(
  path.join(__dirname, '..', '.github', 'workflows', 'feishu-changelog.yml'),
  'utf8'
);

assert.match(
  dailyWorkflow,
  /workflow_dispatch:/,
  '日报 GitHub workflow 应只保留手动触发，正式定时交给 Vercel Cron'
);

assert.doesNotMatch(
  dailyWorkflow,
  /cron:/,
  '日报 GitHub workflow 不应再使用 schedule，避免延迟到 23-24 点推送'
);

assert.match(
  monitorWorkflow,
  /cron:\s*'7 \*\/4 \* \* \*'/,
  '巡检 workflow 应避开整点触发，改为每 4 小时的第 7 分钟'
);

assert.match(
  monitorSource,
  /Asia\/Shanghai/,
  '巡检告警时间应显式按 Asia/Shanghai 格式化'
);

assert.match(
  changelogWorkflow,
  /cron:\s*'10 12 \* \* \*'/,
  '产品升级日志应在北京时间 20:10 触发'
);

assert.match(
  changelogWorkflow,
  /actions\/cache\/restore@v4/,
  '产品升级日志应恢复已发送状态，用于判断昨天是否漏发'
);

assert.match(
  changelogWorkflow,
  /CHANGELOG_SENT_STATE:\s*changelogs\/sent-state\.json/,
  '产品升级日志脚本应读取已发送状态文件'
);

assert.match(
  changelogWorkflow,
  /actions\/cache\/save@v4/,
  '产品升级日志发送成功后应保存已发送状态'
);

console.log('feishu automation time tests passed');
