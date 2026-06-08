const assert = require('assert');
const fs = require('fs');
const path = require('path');

const courtsSource = fs.readFileSync(path.join(__dirname, '../public/assets/scripts/pages/courts.js'), 'utf8');

function fnBody(name){
  const start = courtsSource.indexOf(`function ${name}(`);
  assert.notStrictEqual(start, -1, `${name} should exist`);
  const next = courtsSource.indexOf('\nfunction ', start + 1);
  return courtsSource.slice(start, next === -1 ? courtsSource.length : next);
}

const body = fnBody('renderCourtStatsCards');
const dataCardsCss = fs.readFileSync(path.join(__dirname, '../public/assets/styles/components/data-cards.css'), 'utf8');

assert.match(body, /总订场用户[\s\S]*会员用户[\s\S]*客群次数对比[\s\S]*订场总实收[\s\S]*散客消费/, '订场顶部应显示新的 5 张卡片标题');
assert.match(body, /会员用户 \/ 总订场用户占比[\s\S]*散客次数占比 vs 会员次数占比[\s\S]*散客消费金额 \/ 订场总实收金额占比/, '订场顶部应显示新的说明文案');
assert.match(body, /courtStatInlinePercent\(\{part:memberUsers,total:totalUsers\},1\)/, '会员用户卡片应带会员占比');
assert.match(body, /courtStatValuePair\(`\$\{guestBookingCount\}\$\{courtStatInlinePercent\(\{part:guestBookingCount,total:bookingCount\}\)\}`,\s*`\$\{memberBookingCount\}\$\{courtStatInlinePercent\(\{part:memberBookingCount,total:bookingCount\}\)\}`\)/, '客群次数对比两个百分比应使用小号百分比样式');
assert.match(body, /courtStatInlinePercent\(\{part:guestBookingAmount,total:totalReceived\}\)/, '散客消费卡片应带总实收占比');
assert.match(courtsSource, /if\(digits>0&&ratio<10\)return `\$\{Number\(ratio\.toFixed\(digits\)\)\}%`;\s*return `\$\{Math\.round\(ratio\)\}%`;/, '百分比应只在小于 10 时保留 1 位小数');
assert.match(dataCardsCss, /\.tms-stat-percent,\s*\.court-stat-percent\{[^}]*font-size:10px[^}]*color:#A19080[^}]*margin-left:4px[^}]*font-weight:700/, 'all stat percentages should share the court guest-consumption percentage style');

console.log('court dashboard top stats test passed');
