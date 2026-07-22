const assert = require('assert');
const standards = require('../public/assets/scripts/core/platform-data-standards.js');

assert.strictEqual(typeof standards.currentMembershipSummary, 'function', 'current membership summary should be exported');

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
