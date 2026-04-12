const assert = require('assert');
const fs = require('fs');
const path = require('path');

const html = fs.readFileSync(path.join(__dirname, '../public/index.html'), 'utf8');

assert.match(html, /goPage\('memberships',this\)[\s\S]*?会员管理/, 'sidebar should add membership management entry');
assert.match(html, /id="page-memberships"/, 'should have memberships page section');
assert.match(html, /会员方案[\s\S]*会员购买记录[\s\S]*会员账户[\s\S]*权益流水/, 'membership page should include four management tabs');

assert.match(html, /let courts=\[\],students=\[\],products=\[\],packages=\[\],purchases=\[\],entitlements=\[\],entitlementLedger=\[\],membershipPlans=\[\],membershipAccounts=\[\],membershipOrders=\[\],membershipBenefitLedger=\[\],membershipAccountEvents=\[\]/, 'frontend state should load membership data separately');
assert.match(html, /membershipPlans=Array\.isArray\(data\?\.membershipPlans\)\?data\.membershipPlans:\[\]/, 'load-all should store membership plans');
assert.match(html, /membershipAccounts=Array\.isArray\(data\?\.membershipAccounts\)\?data\.membershipAccounts:\[\]/, 'load-all should store membership accounts');
assert.match(html, /membershipOrders=Array\.isArray\(data\?\.membershipOrders\)\?data\.membershipOrders:\[\]/, 'load-all should store membership orders');
assert.match(html, /membershipBenefitLedger=Array\.isArray\(data\?\.membershipBenefitLedger\)\?data\.membershipBenefitLedger:\[\]/, 'load-all should store membership benefit ledger');

assert.match(html, /账户类型[\s\S]*当前会员[\s\S]*会员状态[\s\S]*当前折扣[\s\S]*会员到期/, 'courts table should show membership status columns');
assert.match(html, /function courtMembershipSummary/, 'courts page should compute membership summaries');
assert.match(html, /function courtMembershipDetailHtml/, 'court detail should render membership block');
assert.match(html, /开通会员[\s\S]*续充会员[\s\S]*使用权益[\s\S]*手工补权益[\s\S]*作废会员/, 'court detail should expose membership actions');

assert.match(html, /function studentMembershipSummaryHtml/, 'student detail should render linked court membership summary');
assert.match(html, /关联订场账户会员摘要/, 'student detail should label linked membership summary');

console.log('membership view tests passed');
