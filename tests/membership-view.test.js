const assert = require('assert');
const fs = require('fs');
const path = require('path');

const html = fs.readFileSync(path.join(__dirname, '../public/index.html'), 'utf8');

assert.match(html, /goPage\('memberships',this\)[\s\S]*?会员管理/, 'sidebar should add membership management entry');
assert.match(html, /id="page-memberships"/, 'should have memberships page section');
assert.match(html, /会员方案[\s\S]*会员购买[\s\S]*会员账户[\s\S]*赠送权益/, 'membership page should include four management views');

assert.match(html, /let courts=\[\],students=\[\],products=\[\],packages=\[\],purchases=\[\],entitlements=\[\],entitlementLedger=\[\],membershipPlans=\[\],membershipAccounts=\[\],membershipOrders=\[\],membershipBenefitLedger=\[\],membershipAccountEvents=\[\]/, 'frontend state should load membership data separately');
assert.match(html, /membershipPlans=Array\.isArray\(data\?\.membershipPlans\)\?data\.membershipPlans:\[\]/, 'load-all should store membership plans');
assert.match(html, /membershipAccounts=Array\.isArray\(data\?\.membershipAccounts\)\?data\.membershipAccounts:\[\]/, 'load-all should store membership accounts');
assert.match(html, /membershipOrders=Array\.isArray\(data\?\.membershipOrders\)\?data\.membershipOrders:\[\]/, 'load-all should store membership orders');
assert.match(html, /membershipBenefitLedger=Array\.isArray\(data\?\.membershipBenefitLedger\)\?data\.membershipBenefitLedger:\[\]/, 'load-all should store membership benefit ledger');

assert.match(html, /账户类型[\s\S]*当前会员[\s\S]*会员状态[\s\S]*当前折扣[\s\S]*会员到期/, 'courts table should show membership status columns');
assert.match(html, /function courtMembershipSummary/, 'courts page should compute membership summaries');
assert.match(html, /function courtMembershipDetailHtml/, 'court detail should render membership block');
assert.match(html, /会员摘要[\s\S]*赠送权益[\s\S]*最近购买记录/, 'court detail should split membership summary, benefit and recent orders');
assert.match(html, /消耗 1 次[\s\S]*补发[\s\S]*查看流水/, 'court detail should expose structured benefit actions');
assert.match(html, /function courtMembershipBenefitRowsHtml/, 'court detail should render benefit rows');
assert.match(html, /function openMembershipBenefitActionModal/, 'benefit actions should use dedicated modal');
assert.match(html, /function openMembershipBenefitHistoryModal/, 'benefit history should have dedicated modal');
assert.match(html, /查看全部权益流水/, 'court detail should provide all-benefit history entry for the current user');
assert.match(html, /function openCourtMembershipLedgerModal/, 'court detail should support all-benefit history modal');
assert.doesNotMatch(html, /openMembershipBenefitActionModal\('\$\{court\.id\}','ballMachine','consume'\)/, 'court detail shortcut actions should not hardcode ballMachine consume');
assert.doesNotMatch(html, /openMembershipBenefitActionModal\('\$\{court\.id\}','ballMachine','supplement'\)/, 'court detail shortcut actions should not hardcode ballMachine supplement');
assert.doesNotMatch(html, /openMembershipBenefitHistoryModal\('\$\{court\.id\}','ballMachine'\)/, 'court detail shortcut actions should not hardcode ballMachine history');

assert.match(html, /function studentMembershipSummaryHtml/, 'student detail should render linked court membership summary');
assert.match(html, /关联订场账户会员摘要/, 'student detail should label linked membership summary');
assert.match(html, /大师公开课[\s\S]*穿线免手工费[\s\S]*发球机免费[\s\S]*国家二级运动员陪打[\s\S]*指定教练陪打/, 'membership plan form should expose structured benefit fields');
assert.match(html, /余额有效期：续充后全部余额按最新充值日期重新计算 2 年/, 'membership purchase flow should surface balance validity rule');
assert.match(html, /每批赠送权益有效期 12 个月/, 'membership purchase flow should surface benefit batch validity rule');
assert.match(html, /function membershipOrderDraftFromPlan/, 'membership order modal should derive one-time benefit draft from selected plan');
assert.match(html, /本次额外赠送/, 'membership order modal should allow one-time benefit adjustments');
assert.match(html, /大师公开课本次调整[\s\S]*穿线免手工费本次调整[\s\S]*发球机免费本次调整[\s\S]*国家二级运动员陪打本次调整[\s\S]*指定教练陪打本次调整/, 'membership order modal should expose one-time benefit adjustment fields');
assert.match(html, /指定教练范围本次调整/, 'membership order modal should expose one-time designated coach override');
assert.match(html, /membershipBenefitCourtFilter/, 'membership benefit page should support filtering by court user');
assert.match(html, /赠送权益批次 = 每次购买送了什么、还剩多少、何时到期/, 'membership benefit page should explain batch table meaning');
assert.match(html, /权益流水 = 后来用了什么、补了什么、为什么变动/, 'membership benefit page should explain ledger table meaning');

console.log('membership view tests passed');
