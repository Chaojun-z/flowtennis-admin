const assert = require('assert');
const api = require('../api/index.js');

const { computeCourtFinance, normalizeCourtRecord, buildLegacyCourtOpeningHistory } = api._test;

const recharge = {
  id: 'r1',
  date: '2026-04-11',
  type: '充值',
  payMethod: '微信',
  category: '储值',
  amount: 5000
};

assert.deepStrictEqual(
  computeCourtFinance({ history: [recharge] }),
  {
    balance: 5000,
    totalDeposit: 5000,
    spentAmount: 0,
    receivedAmount: 5000,
    storedValueSpent: 0,
    directPaidSpent: 0
  },
  'recharge should increase balance and received amount'
);

assert.deepStrictEqual(
  computeCourtFinance({
    history: [
      recharge,
      {
        id: 'c1',
        date: '2026-04-11',
        type: '消费',
        payMethod: '微信',
        category: '私教课',
        amount: 500
      }
    ]
  }),
  {
    balance: 5000,
    totalDeposit: 5000,
    spentAmount: 500,
    receivedAmount: 5500,
    storedValueSpent: 0,
    directPaidSpent: 500
  },
  'direct paid lesson should not reduce stored balance'
);

assert.deepStrictEqual(
  computeCourtFinance({
    history: [
      recharge,
      {
        id: 'c2',
        date: '2026-04-11',
        type: '消费',
        payMethod: '储值扣款',
        category: '私教课',
        amount: 500
      }
    ]
  }),
  {
    balance: 4500,
    totalDeposit: 5000,
    spentAmount: 500,
    receivedAmount: 5000,
    storedValueSpent: 500,
    directPaidSpent: 0
  },
  'stored value payment should reduce balance without increasing received amount'
);

assert.deepStrictEqual(
  computeCourtFinance({
    history: [
      {
        id: 'm-recharge',
        date: '2026-04-12',
        type: '充值',
        payMethod: '微信',
        category: '会员充值',
        amount: 5000,
        bonusAmount: 498,
        membershipOrderId: 'mord-1',
        membershipAccountId: 'macc-1',
        membershipPlanId: 'mplan-gold',
        membershipPlanName: '黄金卡'
      }
    ]
  }),
  {
    balance: 5498,
    totalDeposit: 5000,
    spentAmount: 0,
    receivedAmount: 5000,
    storedValueSpent: 0,
    directPaidSpent: 0
  },
  'membership recharge should use courts.history as the money ledger'
);

assert.deepStrictEqual(
  computeCourtFinance({
    history: [
      recharge,
      {
        id: 'm-booking',
        date: '2026-04-12',
        type: '消费',
        payMethod: '储值扣款',
        category: '会员订场',
        originalAmount: 300,
        discountRate: 0.8,
        discountedAmount: 240,
        amount: 240,
        membershipAccountId: 'macc-1'
      }
    ]
  }),
  {
    balance: 4760,
    totalDeposit: 5000,
    spentAmount: 240,
    receivedAmount: 5000,
    storedValueSpent: 240,
    directPaidSpent: 0
  },
  'membership court booking should deduct the discounted stored value amount'
);

assert.deepStrictEqual(
  computeCourtFinance({
    history: [
      recharge,
      {
        id: 'm-clear',
        date: '2028-04-12',
        type: '冲正',
        payMethod: '储值扣款',
        category: '会员到期清零',
        amount: 600,
        membershipAccountId: 'macc-1'
      }
    ]
  }),
  {
    balance: 4400,
    totalDeposit: 5000,
    spentAmount: 0,
    receivedAmount: 5000,
    storedValueSpent: 0,
    directPaidSpent: 0
  },
  'membership expiry clearing should reduce balance without increasing consumption'
);

assert.throws(
  () => normalizeCourtRecord({
    name: '家长A',
    history: [{
      id: 'c3',
      date: '2026-04-11',
      type: '消费',
      payMethod: '储值扣款',
      category: '订场',
      amount: 600
    }]
  }),
  /余额不足/,
  'stored value payment cannot exceed balance'
);

const normalized = normalizeCourtRecord({
  name: '家长A',
  studentIds: ['stu-1', 'stu-2'],
  history: [
    recharge,
    {
      id: 'c4',
      date: '2026-04-11',
      type: '消费',
      payMethod: '储值扣款',
      category: '班课',
      studentId: 'stu-2',
      amount: 300
    }
  ],
  balance: 9999,
  totalDeposit: 9999,
  spentAmount: 9999
});

assert.deepStrictEqual(normalized.studentIds, ['stu-1', 'stu-2']);
assert.strictEqual(normalized.balance, 4700);
assert.strictEqual(normalized.totalDeposit, 5000);
assert.strictEqual(normalized.spentAmount, 300);
assert.strictEqual(normalized.receivedAmount, 5000);

const legacy = normalizeCourtRecord({
  name: '旧客户',
  studentId: 'stu-old',
  balance: 1200,
  totalDeposit: 2000,
  spentAmount: 800,
  history: []
});

assert.deepStrictEqual(legacy.studentIds, ['stu-old']);
assert.strictEqual(legacy.balance, 1200);
assert.strictEqual(legacy.totalDeposit, 2000);
assert.strictEqual(legacy.spentAmount, 800);
assert.strictEqual(legacy.history.length, 2);
assert.strictEqual(legacy.history[0].source, 'import');

const importedDirectPaid = normalizeCourtRecord({
  name: '导入客户',
  balance: 5000,
  totalDeposit: 5000,
  spentAmount: 500,
  joinDate: '2026-04-01',
  history: []
});
assert.strictEqual(importedDirectPaid.balance, 5000);
assert.strictEqual(importedDirectPaid.totalDeposit, 5000);
assert.strictEqual(importedDirectPaid.spentAmount, 500);
assert.strictEqual(importedDirectPaid.receivedAmount, 5500);
assert.strictEqual(importedDirectPaid.history.length, 2);
assert.strictEqual(importedDirectPaid.history[1].source, 'import');
assert.strictEqual(importedDirectPaid.history[1].payMethod, '历史导入');

const importedDepositText = normalizeCourtRecord({
  name: '已储值客户',
  depositAttitude: '已储值5000',
  spentAmount: 6640,
  joinDate: '2026-04-01',
  history: []
});
assert.strictEqual(importedDepositText.balance, 0);
assert.strictEqual(importedDepositText.totalDeposit, 5000);
assert.strictEqual(importedDepositText.spentAmount, 6640);
assert.strictEqual(importedDepositText.receivedAmount, 6640);
assert.strictEqual(importedDepositText.storedValueSpent, 5000);
assert.strictEqual(importedDepositText.directPaidSpent, 1640);

const importedDepositTextWithRemainingBalance = normalizeCourtRecord({
  name: '已储值未用完客户',
  depositAttitude: '已储值5000',
  spentAmount: 4450,
  joinDate: '2026-04-01',
  history: []
});
assert.strictEqual(importedDepositTextWithRemainingBalance.balance, 550);
assert.strictEqual(importedDepositTextWithRemainingBalance.totalDeposit, 5000);
assert.strictEqual(importedDepositTextWithRemainingBalance.spentAmount, 4450);
assert.strictEqual(importedDepositTextWithRemainingBalance.receivedAmount, 5000);
assert.strictEqual(importedDepositTextWithRemainingBalance.storedValueSpent, 4450);
assert.strictEqual(importedDepositTextWithRemainingBalance.directPaidSpent, 0);

assert.deepStrictEqual(
  computeCourtFinance({
    history: [
      recharge,
      { id: 'refund-stored', date: '2026-04-11', type: '退款', payMethod: '储值退款', category: '退款', amount: 500 }
    ]
  }),
  {
    balance: 4500,
    totalDeposit: 5000,
    spentAmount: 0,
    receivedAmount: 4500,
    storedValueSpent: 0,
    directPaidSpent: 0
  },
  'stored value refund should reduce balance and received amount'
);

assert.throws(
  () => computeCourtFinance({
    history: [{ id: 'refund-too-much', date: '2026-04-11', type: '退款', payMethod: '微信', category: '退款', amount: 500 }]
  }),
  /退款金额超过累计实收/,
  'refund cannot exceed received amount'
);

assert.deepStrictEqual(
  computeCourtFinance({
    history: [
      recharge,
      { id: 'stored-pay', date: '2026-04-11', type: '消费', payMethod: '储值扣款', category: '订场', amount: 500 },
      { id: 'stored-reversal', date: '2026-04-11', type: '冲正', payMethod: '储值扣款', category: '冲正', amount: 500 }
    ]
  }),
  {
    balance: 5000,
    totalDeposit: 5000,
    spentAmount: 0,
    receivedAmount: 5000,
    storedValueSpent: 0,
    directPaidSpent: 0
  },
  'stored value reversal should offset the wrong stored value consumption'
);

assert.deepStrictEqual(
  computeCourtFinance({
    history: [
      recharge,
      { id: 'direct-pay', date: '2026-04-11', type: '消费', payMethod: '微信', category: '订场', amount: 500 },
      { id: 'direct-reversal', date: '2026-04-11', type: '冲正', payMethod: '微信', category: '冲正', amount: 500 }
    ]
  }),
  {
    balance: 5000,
    totalDeposit: 5000,
    spentAmount: 0,
    receivedAmount: 5000,
    storedValueSpent: 0,
    directPaidSpent: 0
  },
  'direct paid reversal should offset the wrong direct paid consumption'
);

assert.throws(
  () => computeCourtFinance({
    history: [recharge, { id: 'reversal-too-much', date: '2026-04-11', type: '冲正', payMethod: '微信', category: '冲正', amount: 500 }]
  }),
  /冲正金额超过/,
  'reversal cannot exceed existing consumption'
);

const legacyDirectPaid = buildLegacyCourtOpeningHistory({
  id: 'legacy-direct',
  joinDate: '2026-04-01',
  balance: 5000,
  totalDeposit: 5000,
  spentAmount: 500,
  history: []
});
assert.deepStrictEqual(
  computeCourtFinance({ history: legacyDirectPaid }),
  {
    balance: 5000,
    totalDeposit: 5000,
    spentAmount: 500,
    receivedAmount: 5500,
    storedValueSpent: 0,
    directPaidSpent: 500
  },
  'legacy direct paid consumption should not reduce stored balance'
);

const legacyStoredPaid = buildLegacyCourtOpeningHistory({
  id: 'legacy-stored',
  joinDate: '2026-04-01',
  balance: 4500,
  totalDeposit: 5000,
  spentAmount: 500,
  history: []
});
assert.deepStrictEqual(
  computeCourtFinance({ history: legacyStoredPaid }),
  {
    balance: 4500,
    totalDeposit: 5000,
    spentAmount: 500,
    receivedAmount: 5000,
    storedValueSpent: 500,
    directPaidSpent: 0
  },
  'legacy stored value consumption should reduce stored balance'
);

console.log('court finance tests passed');
