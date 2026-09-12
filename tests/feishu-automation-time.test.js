const assert = require('assert');
const fs = require('fs');
const path = require('path');

const dailyWorkflow = fs.readFileSync(
  path.join(__dirname, '..', '.github', 'workflows', 'feishu-daily-report.yml'),
  'utf8'
);
const businessDailyWorkflow = fs.readFileSync(
  path.join(__dirname, '..', '.github', 'workflows', 'feishu-business-daily-report.yml'),
  'utf8'
);
const thirdPartySyncWorkflow = fs.readFileSync(
  path.join(__dirname, '..', '.github', 'workflows', 'third-party-sync-center.yml'),
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
  /cron:\s*'13 12 \* \* \*'/,
  '排课日报应每天北京时间 20:13 触发'
);

assert.match(
  dailyWorkflow,
  /TARGET_URL:\s*https:\/\/www\.flowtennis\.cn\/api\/cron\/feishu-daily-report/,
  '排课日报应由 GitHub Actions 定时触发线上接口'
);

assert.doesNotMatch(
  businessDailyWorkflow,
  /^\s*schedule:/m,
  '经营日报应暂停自动定时推送'
);

assert.doesNotMatch(
  thirdPartySyncWorkflow,
  /^\s*schedule:/m,
  '场小二订场数据处理应暂停自动群推'
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
