const assert = require('assert');
const taxonomy = require('../public/assets/scripts/core/business-taxonomy.js');

assert.deepStrictEqual(taxonomy.SOURCES, ['转介绍', '线下到店', '大众点评', '小红书', '视频号', '抖音', '群友', '小班课转化', '孙老师', '未知']);
assert.deepStrictEqual(taxonomy.LEAD_SOURCE_OPTIONS.map(item => item.value), taxonomy.SOURCES);
assert.strictEqual(taxonomy.normalizeLeadSource('朋友转介绍'), '转介绍');
assert.strictEqual(taxonomy.normalizeLeadSource('直接线下到电'), '线下到店');
assert.strictEqual(taxonomy.normalizeLeadSource('直接线下到店'), '线下到店');
assert.strictEqual(taxonomy.normalizeLeadSource('孙老师介绍'), '孙老师');
assert.strictEqual(taxonomy.normalizeLeadSource('抖音/美团'), '抖音');
assert.strictEqual(taxonomy.normalizeLeadSource('播客'), '未知');
assert.strictEqual(taxonomy.normalizeLeadSource('其他'), '未知');

assert.deepStrictEqual(taxonomy.LEAD_STAGE_OPTIONS.map(item => item.value), ['新线索', '跟进中', '已约体验', '已体验待成交', '已成交', '已流失']);
assert.deepStrictEqual(taxonomy.LEAD_DEAL_TYPE_OPTIONS.map(item => item.value), ['课程', '订场', '会员', '课程+订场', '课程+会员', '订场+会员', '课程+订场+会员']);
assert.deepStrictEqual(taxonomy.LEAD_CUSTOMER_TYPE_OPTIONS.map(item => item.value), ['成人', '青少年']);
assert.deepStrictEqual(taxonomy.LEAD_DEMAND_PRODUCT_OPTIONS.map(item => item.value), ['私教', '小班', '订场', '会员', '陪打', '约球', '穿线', '合作', '其他']);
assert.deepStrictEqual(taxonomy.LEAD_CONSULT_OPTIONS.map(item => item.value), taxonomy.LEAD_DEMAND_PRODUCT_OPTIONS.map(item => item.value));
assert.strictEqual(taxonomy.normalizeLeadCustomerType('青少年小班课'), '青少年');
assert.strictEqual(taxonomy.normalizeLeadCustomerType('成人私教'), '成人');
assert.strictEqual(taxonomy.normalizeLeadConsultType('成人私教'), '私教');
assert.strictEqual(taxonomy.normalizeLeadConsultType('成人小班课（专项/训练营）'), '小班');
assert.strictEqual(taxonomy.normalizeLeadConsultType('青少年小班课（训练营）'), '小班');
assert.strictEqual(taxonomy.normalizeLeadConsultType('咨询储值卡（会员）'), '会员');
assert.strictEqual(taxonomy.normalizeLeadConsultType('合作等'), '合作');
assert.strictEqual(taxonomy.normalizeLeadConsultType('未说明需求'), '其他');

assert.deepStrictEqual(taxonomy.PAYMENT_METHODS, ['储值卡', '微信', '支付宝', '现金', '转账', '大众点评券码', '抖音券码', '其他']);
assert.strictEqual(taxonomy.normalizePaymentMethod('储值卡'), '储值扣款');
assert.strictEqual(taxonomy.normalizePaymentMethod('大众点评支付'), '大众点评券码');
assert.strictEqual(taxonomy.normalizePaymentMethod('微信转账支付'), '微信');
assert.strictEqual(taxonomy.normalizePaymentMethod('会员充值'), '微信');
assert.strictEqual(taxonomy.normalizePaymentMethod('支付宝转账支付'), '支付宝');
assert.strictEqual(taxonomy.normalizePaymentMethod('历史导入'), '其他');

assert.strictEqual(taxonomy.normalizeTransactionType({ action: '收款' }), '收款');
assert.strictEqual(taxonomy.normalizeTransactionType({ action: '已入账', paymentChannel: '储值扣款' }), '消耗');
assert.strictEqual(taxonomy.normalizeTransactionType({ action: '记录', paymentChannel: '储值扣款', businessType: '会员订场' }), '消耗');
assert.strictEqual(taxonomy.normalizeTransactionType({ action: '消耗', paymentChannel: '课包划扣' }), '消耗');
assert.strictEqual(taxonomy.normalizeTransactionType({ action: '回退' }), '退款');
assert.strictEqual(taxonomy.normalizeTransactionType({ action: '冲回' }), '退款');
assert.strictEqual(taxonomy.normalizeTransactionType({ status: 'voided' }), '废弃');

assert.deepStrictEqual(taxonomy.normalizeCourseType({ courseType: '训练营' }), {
  level1: '小班课',
  level2: '训练营'
});
assert.deepStrictEqual(taxonomy.normalizeCourseType({ courseType: '体验课', experienceType: '私教体验课' }), {
  level1: '体验课',
  level2: '私教体验课'
});
assert.deepStrictEqual(taxonomy.normalizeCourseType({ courseType: '订场陪打' }), {
  level1: '陪打',
  level2: ''
});
assert.deepStrictEqual(taxonomy.normalizeBusinessType({ courseType: '陪打' }), {
  level1: '课程',
  level2: '陪打',
  level3: '',
  display: '课程 / 陪打'
});

assert.deepStrictEqual(taxonomy.normalizeBusinessType({ businessType: '会员储值' }), {
  level1: '储值',
  level2: '',
  level3: '',
  display: '储值'
});
assert.deepStrictEqual(taxonomy.normalizeBusinessType({ businessType: '会员订场' }), {
  level1: '场地',
  level2: '会员订场',
  level3: '',
  display: '场地 / 会员订场'
});
assert.deepStrictEqual(taxonomy.normalizeBusinessType({ businessType: '课程订场' }), {
  level1: '场地',
  level2: '课程订场',
  level3: '',
  display: '场地 / 课程订场'
});

console.log('business taxonomy tests passed');
