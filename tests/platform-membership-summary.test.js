const assert = require('assert');
const standards = require('../public/assets/scripts/core/platform-data-standards.js');

assert.strictEqual(typeof standards.currentMembershipSummary, 'function', 'current membership summary should be exported');
assert.strictEqual(typeof standards.currentCourtAccountSummary, 'function', 'current court account summary should be exported');

const courtSummary = standards.currentCourtAccountSummary([
  {
    id: 'guest-1',
    accountType: '普通账户',
    membershipStatus: '未开卡',
    membershipStatusCode: '',
    balance: 610,
    totalReceived: 1000,
    bookingCount: 2,
    bookingAmount: 1000,
    guestBookingCount: 2,
    guestBookingAmount: 1000
  },
  {
    id: 'member-1',
    accountType: '会员账户',
    membershipStatus: '正常',
    membershipStatusCode: 'active',
    balance: 2200,
    totalReceived: 5000,
    bookingCount: 1,
    bookingAmount: 500,
    memberBookingCount: 1,
    memberBookingAmount: 500
  }
]);

assert.strictEqual(courtSummary.totalCount, 2, 'court summary should count all visible court accounts');
assert.strictEqual(courtSummary.totalMemberCount, 1, 'court summary must not treat 未开卡 ordinary accounts as member accounts');
assert.strictEqual(courtSummary.totalBalance, 2200, 'court summary balance should only sum real member accounts');
assert.strictEqual(courtSummary.totalBookingAmount, 1500, 'court summary booking amount should use booking consumption amount');
assert.strictEqual(courtSummary.totalGuestBookingAmount, 1000, 'court summary guest booking amount should use guest booking amount, not total received');

const summary = standards.currentMembershipSummary([{
  id: 'court-1',
  balance: 2200,
  rechargeRows: [
    { id: 'order-1', paidAmount: 2000, bonusAmount: 166 },
    { id: 'order-2', paidAmount: 0, bonusAmount: 396 }
  ],
  bookingRows: [
    { id: 'consume-1', type: '消费', payMethod: '储值扣款', amount: 500 },
    { id: 'reverse-1', type: '冲正', payMethod: '储值扣款', amount: 100 },
    { id: 'refund-1', type: '退款', payMethod: '储值退款', amount: 60 },
    { id: 'guest-1', type: '消费', payMethod: '微信', amount: 80 }
  ]
}]);

assert.deepStrictEqual(summary, {
  memberCount: 1,
  rechargeCount: 2,
  paidAmount: 2000,
  bonusAmount: 562,
  consumableAmount: 2562,
  consumedAmount: 362,
  pendingAmount: 2200
}, 'membership top cards should trust the current balance snapshot and derive recognized amount from the remaining member pool');

console.log('platform membership summary tests passed');
