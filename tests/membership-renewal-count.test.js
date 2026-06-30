const assert = require('assert');
const { buildCourtAccountListViewFromData } = require('../server/page-data/court-account-read-model.js');

const view = buildCourtAccountListViewFromData({
  campuses: [{ code: 'shunyi_mapo', name: '马坡' }],
  students: [],
  courts: [{
    id: 'court-1',
    name: '续费客户',
    phone: '13800000000',
    campus: 'shunyi_mapo',
    history: []
  }],
  leads: [],
  membershipAccounts: [{
    id: 'account-1',
    courtId: 'court-1',
    status: 'active',
    discountRate: 0.8
  }],
  membershipOrders: [
    { id: 'order-open', membershipAccountId: 'account-1', courtId: 'court-1', status: 'paid', rechargeAmount: 5000, purchaseDate: '2026-05-01' },
    { id: 'order-renew-1', membershipAccountId: 'account-1', courtId: 'court-1', status: 'paid', rechargeAmount: 3000, purchaseDate: '2026-05-10' },
    { id: 'order-renew-2', membershipAccountId: 'account-1', courtId: 'court-1', status: 'active', rechargeAmount: 2000, purchaseDate: '2026-05-20' },
    { id: 'order-zero', membershipAccountId: 'account-1', courtId: 'court-1', status: 'paid', rechargeAmount: 0, purchaseDate: '2026-05-21' },
    { id: 'order-voided', membershipAccountId: 'account-1', courtId: 'court-1', status: 'voided', rechargeAmount: 9999, purchaseDate: '2026-05-22' }
  ],
  membershipPlans: [],
  membershipBenefitLedger: [],
  membershipAccountEvents: []
});

assert.strictEqual(view.items.length, 1, '应返回一个会员账户');
assert.strictEqual(view.items[0].membershipRechargeCount, 3, '会员有效储值次数应包含首次开卡和后续续费');
assert.strictEqual(view.items[0].membershipRenewalCount, 2, '会员续费次数应扣除首次开卡');
assert.strictEqual(view.items[0].hasMembershipRenewal, true, '发生过续费时应输出续费标记');
assert.strictEqual(view.summary.totalMembershipRenewalCount, 2, '汇总应统计会员续费次数');

console.log('membership renewal count tests passed');
