const assert = require('assert');
const { appSource: source } = require('./helpers/read-index-bundle');

assert.match(source,/goPage\('finance',this\)[\s\S]*?财务中心/,'sidebar should expose finance center page');
assert.match(source,/id="page-finance"/,'finance center page should exist');
assert.match(source,/id="financeTabRevenue"/,'finance center should expose revenue report tab');
assert.match(source,/id="financeTabConsume"/,'finance center should expose consume report tab');
assert.match(source,/id="financeTabSettlement"/,'finance center should expose settlement tab');
assert.match(source,/id="financeRevenuePanel"/,'finance center should render revenue panel');
assert.match(source,/id="financeConsumePanel"/,'finance center should render consume panel');
assert.match(source,/id="financeSettlementPanel"/,'finance center should render settlement panel');
assert.match(source,/function setFinancePanel\(/,'finance center should expose tab switch logic');
assert.match(source,/function renderFinanceCenter\(/,'finance center should expose page render logic');
assert.match(source,/function renderCoachOpsRevenueReport\(/,'finance center should reuse revenue report renderer');
assert.match(source,/function renderCoachOpsConsumeReport\(/,'finance center should reuse consume report renderer');
assert.match(source,/function renderFinanceSettlementSummary\(/,'finance center should render settlement summary');
assert.doesNotMatch(source,/id="financeStatsRow"/,'finance center should not keep a duplicated top stats row');
assert.match(source,/查看迟到月结/,'finance center should expose late settlement entry');

console.log('finance page view tests passed');
