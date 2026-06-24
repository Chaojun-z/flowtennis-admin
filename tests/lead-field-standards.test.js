const assert = require('assert');
const fs = require('fs');
const path = require('path');
const taxonomy = require('../public/assets/scripts/core/business-taxonomy.js');
const api = require('../api/index.js');

const root = path.join(__dirname, '..');
const standardSource = fs.readFileSync(path.join(root, 'public/assets/scripts/standard/components.js'), 'utf8');
const leadsSource = fs.readFileSync(path.join(root, 'public/assets/scripts/pages/leads.js'), 'utf8');
const dictionaryDoc = fs.readFileSync(path.join(root, 'docs/平台核心数据字典.md'), 'utf8');
const rules = api._test;

assert.deepStrictEqual(taxonomy.LEAD_STAGE_OPTIONS.map(item => item.value), [
  '新线索',
  '跟进中',
  '已约体验',
  '已体验待成交',
  '已成交',
  '已流失'
]);
assert.deepStrictEqual(taxonomy.LEAD_DEAL_TYPE_OPTIONS.map(item => item.value), [
  '课程',
  '订场',
  '会员',
  '课程+订场',
  '课程+会员',
  '订场+会员',
  '课程+订场+会员'
]);
assert.deepStrictEqual(taxonomy.LEAD_CUSTOMER_TYPE_OPTIONS.map(item => item.value), ['成人', '青少年']);
assert.deepStrictEqual(taxonomy.LEAD_DEMAND_PRODUCT_OPTIONS.map(item => item.value), ['私教', '小班', '订场', '会员', '陪打', '约球', '穿线', '合作', '其他']);
assert.strictEqual(taxonomy.normalizeLeadCustomerType('少儿小班课'), '青少年');
assert.strictEqual(taxonomy.normalizeLeadCustomerType('成人私教'), '成人');
assert.strictEqual(taxonomy.normalizeLeadDemandProduct('咨询储值卡（会员）'), '会员');
assert.strictEqual(taxonomy.normalizeLeadDemandProduct('青少年小班课（训练营）'), '小班');

assert.strictEqual(rules.deriveLeadSystemStatus({ rawStatus: '已报名-私教' }), '已成交');
assert.strictEqual(rules.deriveLeadSystemStatus({ rawStatus: '体验课完成' }), '已体验待成交');
assert.strictEqual(rules.deriveLeadDealType({ studentId: 'stu-1', courtId: 'court-1', membershipAccountId: 'member-1' }), '课程+订场+会员');

const normalizedLead = rules.normalizeLeadRecord({
  '线索时间': '2026-06-24',
  '微信名/电话': 'Mira/13800138000',
  '咨询需求': '青少年小班课（训练营）',
  '跟进状态': '新线索'
}, { id: 'lead-standard', now: '2026-06-24T00:00:00.000Z' });
assert.strictEqual(normalizedLead.customerType, '青少年');
assert.strictEqual(normalizedLead.demandProduct, '小班');
assert.strictEqual(normalizedLead.leadStage, '新线索');
assert.strictEqual(normalizedLead.systemStatus, '新线索');
assert.strictEqual(normalizedLead.dealType, '');

assert.match(standardSource, /客户类型[\s\S]*需求产品[\s\S]*线索阶段[\s\S]*成交教练[\s\S]*流失原因/, 'lead list should use the new standard field labels');
assert.doesNotMatch(standardSource, /咨询需求|转化教练|未转化原因/, 'lead list should not expose old lead field labels');

assert.match(leadsSource, /function leadCustomerTypeText\(/, 'lead page should expose customer type helper');
assert.match(leadsSource, /function leadDemandProductText\(/, 'lead page should expose demand product helper');
assert.match(leadsSource, /function leadDealTypeText\(/, 'lead page should expose deal type helper');
assert.match(leadsSource, /已成交 · \$\{dealType\}/, 'lead stage display should combine stage and deal type without adding a duplicate table column');
assert.doesNotMatch(leadsSource, /正式课报名时间|未转化原因|转化教练|是否转化|咨询需求/, 'lead page copy should migrate old conversion and consult labels');

assert.match(dictionaryDoc, /`leadStage`[\s\S]*线索阶段[\s\S]*新线索[\s\S]*已成交[\s\S]*已流失/, 'data dictionary should define standard lead stage');
assert.match(dictionaryDoc, /`dealType`[\s\S]*成交类型[\s\S]*课程\+订场\+会员/, 'data dictionary should define standard deal type');
assert.match(dictionaryDoc, /`customerType`[\s\S]*客户类型[\s\S]*成人[\s\S]*青少年/, 'data dictionary should define standard customer type');
assert.match(dictionaryDoc, /`demandProduct`[\s\S]*需求产品[\s\S]*私教[\s\S]*会员[\s\S]*其他/, 'data dictionary should define standard demand product');

console.log('lead field standards tests passed');
