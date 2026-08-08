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
        { id: 'h2', type: '消费', category: '订场', payMethod: '现场收款', amount: 80, date: '2026-06-02', startTime: '10:00', endTime: '11:00', venue: '2号场', note: '散客补差' },
        { id: 'h3', type: '消费', category: '订场', payMethod: '现场收款', amount: 90, note: '2026-06-03；室内3；11:00-12:00；历史导入备注' }
      ],
      cachedBalance: 1376,
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
      thirdPartyLevelName: '2',
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
    }, {
      id: 'order-2',
      membershipAccountId: 'acc-1',
      courtId: 'court-1',
      status: 'paid',
      purchaseDate: '2026-06-10',
      membershipPlanName: '黄金会员',
      rechargeAmount: 0,
      bonusAmount: 396,
      discountRate: 0.8,
      benefitSnapshot: {},
      benefitValidUntil: '2027-06-10',
      notes: '赠送续充'
    }]],
    ['membershipPlans', []],
    ['membershipBenefitLedger', [
      { id: 'grant-1', membershipAccountId: 'acc-1', courtId: 'court-1', membershipOrderRef: 'order-1', benefitCode: 'ballMachine', benefitLabel: '发球机免费', action: 'grant', delta: 3, unit: '次', createdAt: '2026-06-01 00:00', displayCreatedAt: '2026-06-01 00:00' },
      { id: 'consume-1', membershipAccountId: 'acc-1', courtId: 'court-1', membershipOrderRef: 'order-1', benefitCode: 'ballMachine', benefitLabel: '发球机免费', action: 'consume', delta: -1, unit: '次', createdAt: '2026-06-02 00:00', displayCreatedAt: '2026-06-02 00:00', reason: '使用发球机' }
    ]],
    ['membershipAccountEvents', [
      { id: 'evt-1', membershipAccountId: 'acc-1', courtId: 'court-1', eventType: 'created', createdAt: '2026-06-01 00:00', displayCreatedAt: '2026-06-01 00:00', operator: 'admin' }
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
    rechargeCount: 2,
    paidAmount: 1000,
    bonusAmount: 496,
    consumableAmount: 1496,
    consumedAmount: 120,
    pendingAmount: 1376
  });
  const item = view.items[0];
  assert.strictEqual(item.owner, '线索跟进人', '跟进人必须读取线索池 owner');
  assert.strictEqual(item.accountType, '会员账户');
  assert.strictEqual(item.firstOpenDate, '2026-06-01');
  assert.strictEqual(item.membershipTierLabel, '黄金卡');
  assert.strictEqual(item.rechargeRows, undefined, '默认列表不应夹带充值明细');
  assert.strictEqual(item.benefitRows, undefined, '默认列表不应夹带权益明细');
  assert.strictEqual(item.ledgerRows, undefined, '默认列表不应夹带权益流水明细');
  assert.strictEqual(item.bookingRows, undefined, '默认列表不应夹带订场明细');
  assert.strictEqual(item.exportRow.displayName, '张三');
  assert.strictEqual(item.exportRow.totalReceived, 1080);

  const detailView = await loader({ sampleIds: ['court-1'], includeDetails: true });
  const detailItem = detailView.items[0];
  assert.strictEqual(detailItem.rechargeRows.length, 2);
  assert.ok(detailItem.rechargeRows.some((row) => row.paidAmount === 1000), '充值记录应保留正常实收订单');
  assert.ok(detailItem.rechargeRows.some((row) => row.paidAmount === 0 && row.bonusAmount === 396), '充值记录应保留零实收但有效赠送续充');
  assert.strictEqual(detailItem.benefitRows.length, 1);
  assert.strictEqual(detailItem.benefitRows[0].remaining, 2);
  assert.strictEqual(detailItem.ledgerRows.length, 1);
  assert.strictEqual(detailItem.ledgerRows[0].action, 'consume');
  assert.strictEqual(detailItem.bookingRows.length, 3);
  const repairedBooking = detailItem.bookingRows.find(row => row.id === 'h3');
  assert.strictEqual(repairedBooking.bookingDate, '2026-06-03', '历史订场记录应从备注恢复订场日期');
  assert.strictEqual(repairedBooking.startTime, '11:00', '历史订场记录应从备注恢复开始时间');
  assert.strictEqual(repairedBooking.endTime, '12:00', '历史订场记录应从备注恢复结束时间');
  assert.strictEqual(repairedBooking.venue, '3号场', '历史订场记录应从备注恢复场地');
}

main().then(() => {
  console.log('court account read model unified source tests passed');
}).catch(err => {
  console.error(err);
  process.exit(1);
});
