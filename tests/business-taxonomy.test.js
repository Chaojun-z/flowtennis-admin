const assert = require('assert');
const taxonomy = require('../public/assets/scripts/core/business-taxonomy.js');

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
