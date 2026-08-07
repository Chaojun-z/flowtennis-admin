const assert = require('assert');
const fs = require('fs');
const path = require('path');

const courtsSource = fs.readFileSync(path.join(__dirname, '../public/assets/scripts/pages/courts.js'), 'utf8');

assert.match(
  courtsSource,
  /会员储值'[\s\S]*valueHtml:`<span>\$\{Number\(financeSummary\.memberCount\)\|\|0\}<\/span><span class="tms-stat-divider">｜<\/span><span>\$\{Number\(financeSummary\.rechargeCount\)\|\|0\}<\/span>`/,
  '会员管理数据块的两个数值之间应显示竖线分隔'
);

console.log('membership stat split view test passed');
