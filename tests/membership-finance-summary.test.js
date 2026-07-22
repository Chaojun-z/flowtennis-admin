const assert = require('assert');
const { _test } = require('../api/index.js');

assert.strictEqual(typeof _test.buildMembershipFinanceSummary, 'function', 'membership finance summary should be exported for cross-page reuse');

const summary = _test.buildMembershipFinanceSummary({
  courts: [{
    id: 'court-zhang',
    name: '张满满（张颖）',
    totalDeposit: 5448,
    history: [
      { id: 'order-topup', type: '充值', amount: 5000, bonusAmount: 498, date: '2026-04-12' },
      { id: 'legacy-fix', type: '充值', amount: 448, date: '2026-04-14', note: '会员储值补足' },
      { id: 'consume-1', type: '消费', amount: 224, payMethod: '储值扣款', category: '订场' }
    ]
  }, {
    id: 'court-nini',
    name: '妮妮',
    history: [
      { id: 'nini-consume', type: '消费', amount: 100, payMethod: '储值扣款', category: '订场' }
    ]
  }],
  membershipAccounts: [
    { id: 'account-zhang', courtId: 'court-zhang', status: 'active' },
    { id: 'account-nini', courtId: 'court-nini', status: 'active' }
  ],
  membershipOrders: [
    { id: 'order-zhang', membershipAccountId: 'account-zhang', courtId: 'court-zhang', status: 'active', rechargeAmount: 5000, finalAmount: 5000, bonusAmount: 498, purchaseDate: '2026-04-12' },
    { id: 'order-nini-1', membershipAccountId: 'account-nini', courtId: 'court-nini', status: 'active', rechargeAmount: 2000, finalAmount: 2000, bonusAmount: 196, purchaseDate: '2026-04-01' },
    { id: 'order-nini-2', membershipAccountId: 'account-nini', courtId: 'court-nini', status: 'active', rechargeAmount: 2000, finalAmount: 2000, bonusAmount: 196, purchaseDate: '2026-05-28' },
    { id: 'order-nini-3', membershipAccountId: 'account-nini', courtId: 'court-nini', status: 'active', rechargeAmount: 0, finalAmount: 0, bonusAmount: 396, purchaseDate: '2026-06-02' },
    { id: 'voided-order', membershipAccountId: 'account-nini', courtId: 'court-nini', status: 'voided', rechargeAmount: 9999, finalAmount: 9999, bonusAmount: 9999, purchaseDate: '2026-06-01' }
  ]
});

assert.strictEqual(summary.memberCount, 2, 'summary should count active member accounts');
assert.strictEqual(summary.rechargeCount, 4, 'summary should count valid membership orders including zero-paid gift renewals');
assert.strictEqual(summary.paidAmount, 9000, 'summary should use membership order paid amount, not court totalDeposit or legacy fix rows');
assert.strictEqual(summary.bonusAmount, 1286, 'summary should use membership order bonus amount including zero-paid gift renewals');
assert.strictEqual(summary.consumableAmount, 10286, 'summary should combine paid and bonus amount');
assert.strictEqual(summary.consumedAmount, 324, 'summary should use stored value consumption from member courts');
assert.strictEqual(summary.pendingAmount, 9962, 'summary should subtract consumed amount from consumable amount');
