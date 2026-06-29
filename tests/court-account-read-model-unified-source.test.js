const assert = require('assert');
const { createCourtAccountListViewLoader } = require('../server/page-data/court-account-read-model.js');

async function main() {
  const scans = new Map([
    ['students', []],
    ['courts', [{
      id: 'court-1',
      name: '张三',
      phone: '13800000000',
      campus: 'mapo',
      owner: '旧跟进人',
      history: [
        { id: 'h1', type: '消费', category: '订场', payMethod: '储值卡', amount: 120, date: '2026-06-01', startTime: '09:00', endTime: '10:00', venue: '1号场', note: '会员订场' },
        { id: 'h2', type: '消费', category: '订场', payMethod: '现场收款', amount: 80, date: '2026-06-02', startTime: '10:00', endTime: '11:00', venue: '2号场', note: '散客补差' }
      ],
      cachedBalance: 980,
      cachedTotalDeposit: 1000,
      cachedTotalSpent: 120,
      cachedTotalReceived: 1080,
      updatedAt: '2026-06-03'
    }]],
    ['leads', [{ id: 'lead-1', courtId: 'court-1', owner: '线索跟进人' }]],
    ['membershipAccounts', [{
      id: 'acc-1',
      courtId: 'court-1',
      status: 'active',
      tierCode: '黄金会员',
      discountRate: 0.8,
      validUntil: '2027-06-01',
      hardExpireAt: '2028-06-01'
    }]],
    ['membershipOrders', [{
      id: 'order-1',
      membershipAccountId: 'acc-1',
      courtId: 'court-1',
      status: 'paid',
      purchaseDate: '2026-06-01',
      membershipPlanName: '黄金会员',
      rechargeAmount: 1000,
      bonusAmount: 100,
      discountRate: 0.8,
      benefitSnapshot: { ballMachine: { label: '发球机免费', unit: '次', count: 3 } },
      benefitValidUntil: '2027-06-01',
      notes: '首充'
    }]],
    ['membershipPlans', []],
    ['membershipBenefitLedger', [
      { id: 'grant-1', membershipAccountId: 'acc-1', courtId: 'court-1', membershipOrderRef: 'order-1', benefitCode: 'ballMachine', benefitLabel: '发球机免费', action: 'grant', delta: 3, unit: '次', createdAt: '2026-06-01T00:00:00Z' },
      { id: 'consume-1', membershipAccountId: 'acc-1', courtId: 'court-1', membershipOrderRef: 'order-1', benefitCode: 'ballMachine', benefitLabel: '发球机免费', action: 'consume', delta: -1, unit: '次', createdAt: '2026-06-02T00:00:00Z', reason: '使用发球机' }
    ]],
    ['membershipAccountEvents', [
      { id: 'evt-1', membershipAccountId: 'acc-1', courtId: 'court-1', eventType: 'created', createdAt: '2026-06-01T00:00:00Z', operator: 'admin' }
    ]]
  ]);
  const loader = createCourtAccountListViewLoader({
    listCampusesWithDefaults: async () => [{ code: 'mapo', name: '马坡' }],
    getCachedScan: async (name) => scans.get(name) || [],
    tables: {
      students: 'students',
      courts: 'courts',
      leads: 'leads',
      membershipAccounts: 'membershipAccounts',
      membershipOrders: 'membershipOrders',
      membershipPlans: 'membershipPlans',
      membershipBenefitLedger: 'membershipBenefitLedger',
      membershipAccountEvents: 'membershipAccountEvents'
    }
  });

  const view = await loader();
  assert.strictEqual(view.meta.source, 'unified-court-membership-read-model');
  assert.deepStrictEqual(view.summary.membershipFinanceSummary, {
    memberCount: 1,
    rechargeCount: 1,
    paidAmount: 1000,
    bonusAmount: 100,
    consumableAmount: 1100,
    consumedAmount: 120,
    pendingAmount: 980
  });
  const item = view.items[0];
  assert.strictEqual(item.owner, '线索跟进人', '跟进人必须读取线索池 owner');
  assert.strictEqual(item.accountType, '会员账户');
  assert.strictEqual(item.firstOpenDate, '2026-06-01');
  assert.strictEqual(item.membershipTierLabel, '黄金会员');
  assert.strictEqual(item.rechargeRows.length, 1);
  assert.strictEqual(item.rechargeRows[0].paidAmount, 1000);
  assert.strictEqual(item.benefitRows.length, 1);
  assert.strictEqual(item.benefitRows[0].remaining, 2);
  assert.strictEqual(item.ledgerRows.length, 1);
  assert.strictEqual(item.ledgerRows[0].action, 'consume');
  assert.strictEqual(item.bookingRows.length, 2);
  assert.strictEqual(item.exportRow.displayName, '张三');
  assert.strictEqual(item.exportRow.totalReceived, 1080);
}

main().then(() => {
  console.log('court account read model unified source tests passed');
}).catch(err => {
  console.error(err);
  process.exit(1);
});
