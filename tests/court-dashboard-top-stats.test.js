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

assert.match(body, /订场用户结构[\s\S]*场地利用[\s\S]*课群次数对比[\s\S]*订场财务大盘[\s\S]*课群金额对比盘/, '订场顶部应显示最新的 5 张卡片标题');
assert.match(body, /总订场用户 \/ 会员用户占比[\s\S]*总订场次数 \/ 总订场时长[\s\S]*散客次数占比 \/ 会员次数占比[\s\S]*总实收金额 \/ 实际订场消费占比[\s\S]*散客消费占比 \/ 会员消费占比/, '订场顶部应显示最新的数据说明');
assert.match(body, /courtStatPercent\(\{part:memberUsers,total:totalUsers\},1\)/, '会员用户卡片右侧应带会员占比');
assert.match(body, /courtStatPercent\(\{part:bookingAmount,total:totalReceived\}\)/, '订场财务卡片右侧应带订场消费占比');

console.log('court dashboard top stats test passed');
