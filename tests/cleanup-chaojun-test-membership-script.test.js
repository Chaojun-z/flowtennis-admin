const assert = require('assert');

const {
  TARGET,
  buildChaojunTestMembershipCleanupPlan,
  reportSafePlan
} = require('../scripts/cleanup-chaojun-test-membership-20260912.js');

const now = '2026-09-12T10:00:00.000Z';

function targetCourt() {
  return {
    id: TARGET.courtId,
    name: TARGET.name,
    phone: TARGET.phone,
    campus: 'shunyi_mapo',
    status: 'active',
    cachedBalance: 4000,
    cachedTotalDeposit: 2000,
    cachedTotalSpent: -1780,
    cachedTotalReceived: 2200,
    history: [
      {
        id: TARGET.rechargeHistoryId,
        type: '充值',
        category: '会员储值',
        payMethod: '微信',
        amount: 2000,
        date: '2026-03-23',
        notes: '会员充值'
      },
      {
        id: TARGET.clearHistoryId,
        type: '冲正',
        category: '会员到期清零',
        payMethod: '储值扣款',
        amount: 2000,
        date: '2026-04-11',
        notes: '会员到期清零'
      },
      {
        id: 'wechat-booking-row',
        type: '消费',
        category: '订场',
        payMethod: '微信',
        amount: 220,
        date: '2026-06-19',
        startTime: '19:00',
        endTime: '20:00',
        venue: '1号场'
      }
    ]
  };
}

function source(overrides = {}) {
  return {
    courts: [
      targetCourt(),
      { id: 'other-member', name: '真实会员', campus: 'shunyi_mapo', status: 'active', history: [] }
    ],
    membershipAccounts: [
      { id: TARGET.accountId, courtId: TARGET.courtId, status: 'active', createdAt: '2026-03-23T00:00:00.000Z' },
      { id: 'other-account', courtId: 'other-member', status: 'active' }
    ],
    membershipOrders: [
      {
        id: TARGET.orderId,
        courtId: TARGET.courtId,
        membershipAccountId: TARGET.accountId,
        status: 'active',
        rechargeAmount: 2000,
        bonusAmount: 0,
        purchaseDate: '2026-03-23',
        courtName: 'Chaojun'
      },
      { id: 'other-order', courtId: 'other-member', membershipAccountId: 'other-account', status: 'paid', rechargeAmount: 1000, purchaseDate: '2026-03-01' }
    ],
    membershipBenefitLedger: [],
    membershipAccountEvents: [],
    financialLedger: [],
    courtAccountListIndexRows: [
      { id: TARGET.courtId, item: { id: TARGET.courtId, displayName: TARGET.name, accountType: '会员账户' } }
    ],
    countsBefore: {
      platformMemberCount: 60,
      shunyiMapoMemberCount: 58,
      platformRechargeCount: 89,
      platformPaidAmount: 276063.24
    },
    ...overrides
  };
}

function testPlanOnlyVoidsTargetAndKeepsCourt() {
  const plan = buildChaojunTestMembershipCleanupPlan({ ...source(), now });
  assert.strictEqual(plan.ok, true);
  assert.strictEqual(plan.courtUpdates.length, 1);
  assert.strictEqual(plan.accountUpdates.length, 1);
  assert.strictEqual(plan.orderUpdates.length, 1);
  assert.strictEqual(plan.eventCreates.length, 1);
  assert.strictEqual(plan.financialLedgerUpdates.length, 0, '目标没有独立财务总账，脚本不应写 ft_financial_ledger');
  assert.strictEqual(plan.indexUpserts.length, 1, '订场用户索引应 upsert 为普通账户，不能删除');
  assert.deepStrictEqual(plan.indexDeletes, [], '甄朝珺仍应留在订场用户，不应删除索引');

  const courtAfter = plan.courtUpdates[0].after;
  assert.strictEqual(courtAfter.status, 'active', '订场用户必须保留 active');
  assert.strictEqual(courtAfter.cachedBalance, 0);
  assert.strictEqual(courtAfter.cachedTotalDeposit, 0);
  assert.strictEqual(courtAfter.cachedTotalSpent, 220);
  assert.strictEqual(courtAfter.cachedTotalReceived, 220);
  assert.strictEqual(courtAfter.history.find(row => row.id === TARGET.rechargeHistoryId).amount, 0);
  assert.strictEqual(courtAfter.history.find(row => row.id === TARGET.clearHistoryId).amount, 0);
  assert.strictEqual(courtAfter.history.find(row => row.id === 'wechat-booking-row').amount, 220, '微信散客订场消费必须保留');

  assert.strictEqual(plan.accountUpdates[0].after.status, 'voided');
  assert.strictEqual(plan.orderUpdates[0].after.status, 'voided');
  assert.strictEqual(plan.indexUpserts[0].item.accountType, '普通账户');
}

function testImpactSummaryCoversBusinessFinanceChainAndWeekly() {
  const plan = buildChaojunTestMembershipCleanupPlan({ ...source(), now });
  assert.deepStrictEqual(plan.expectedAfter, {
    platformMemberCount: 59,
    shunyiMapoMemberCount: 57,
    platformRechargeCount: 88,
    platformPaidAmount: 274063.24
  });
  assert.deepStrictEqual(plan.impact, {
    memberCountDelta: -1,
    shunyiMapoMemberCountDelta: -1,
    rechargeCountDelta: -1,
    paidAmountDelta: -2000,
    weeklyStoredValueAmountDelta: -2000,
    weeklyAffectedDate: '2026-03-23'
  });

  const safe = reportSafePlan(plan);
  assert.strictEqual(safe.expectedAfter.shunyiMapoMemberCount, 57);
  assert.strictEqual(safe.businessSide.keepsCourtAccount, true);
  assert.strictEqual(safe.linkSide.indexAction, 'upsert');
  assert.strictEqual(safe.displaySide.membershipAccountTypeAfter, '普通账户');
  assert.strictEqual(safe.weeklyReport.storedValueAmountDelta, -2000);
}

function testBlocksUnexpectedLinkedRows() {
  const plan = buildChaojunTestMembershipCleanupPlan({
    ...source({
      financialLedger: [{ id: 'ledger-1', courtId: TARGET.courtId, amount: 2000 }]
    }),
    now
  });
  assert.strictEqual(plan.ok, false);
  assert.match(plan.errors.join('\n'), /财务总账/);
}

testPlanOnlyVoidsTargetAndKeepsCourt();
testImpactSummaryCoversBusinessFinanceChainAndWeekly();
testBlocksUnexpectedLinkedRows();

console.log('cleanup-chaojun-test-membership-script.test.js passed');
