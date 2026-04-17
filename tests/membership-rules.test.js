const assert = require('assert');
const api = require('../api/index.js');

const rules = api._test;

assert.ok(rules, 'api._test should expose membership rule helpers');
assert.ok(rules.MEMBERSHIP_TABLES, 'membership tables should be exposed for runtime bootstrap checks');
assert.ok(rules.normalizeMembershipBenefitTemplate, 'membership benefit template helper should be exposed');
assert.ok(rules.allocateMembershipBenefitUsage, 'membership benefit allocation helper should be exposed');
assert.ok(rules.buildMembershipAccountEventRecord, 'membership account event helper should be exposed');
assert.ok(rules.isDuplicateMembershipOrderSubmission, 'membership order duplicate guard should be exposed');
assert.ok(rules.mergeCourtRecords, 'court merge helper should be exposed');
assert.deepStrictEqual(
  rules.MEMBERSHIP_TABLES,
  [
    'ft_membership_plans',
    'ft_membership_accounts',
    'ft_membership_orders',
    'ft_membership_benefit_ledger',
    'ft_membership_account_events'
  ],
  'membership should use independent tables'
);

const normalizedBenefitTemplate = rules.normalizeMembershipBenefitTemplate({
  publicLessonCount: 2,
  stringingLaborCount: 5,
  ballMachineCount: 6,
  level2PartnerCount: 2,
  designatedCoachPartnerCount: 1,
  designatedCoachIds: ['coach-zj'],
  customBenefits: [{ label: '节日赠礼', unit: '份', count: 1 }]
});

assert.deepStrictEqual(
  normalizedBenefitTemplate,
  {
    publicLesson: { label: '大师公开课', unit: '次', count: 2 },
    stringingLabor: { label: '穿线免手工费', unit: '次', count: 5 },
    ballMachine: { label: '发球机免费', unit: '次', count: 6 },
    level2Partner: { label: '国家二级运动员陪打', unit: '次', count: 2 },
    designatedCoachPartner: { label: '指定教练陪打', unit: '次', count: 1, designatedCoachIds: ['coach-zj'] },
    customBenefits: [{ label: '节日赠礼', unit: '份', count: 1 }]
  },
  'membership plan should normalize structured benefit fields into membership benefit template'
);

const plan = rules.buildMembershipPlanRecord({
  name: '黄金卡',
  tierCode: 'gold',
  rechargeAmount: 5000,
  discountRate: 0.8,
  bonusAmount: 498,
  saleStartDate: '2026-04-01',
  saleEndDate: '2026-04-30',
  publicLessonCount: 2,
  stringingLaborCount: 5,
  ballMachineCount: 6,
  level2PartnerCount: 2,
  designatedCoachPartnerCount: 1,
  designatedCoachIds: ['coach-zj'],
  customBenefits: [{ label: '节日赠礼', unit: '份', count: 1 }]
}, { id: 'mplan-gold', now: '2026-04-12T00:00:00.000Z' });

assert.strictEqual(plan.id, 'mplan-gold');
assert.strictEqual(plan.status, 'draft');
assert.strictEqual(plan.saleStartDate, '2026-04-01');
assert.strictEqual(plan.saleEndDate, '2026-04-30');
assert.strictEqual(plan.validMonths, 12);
assert.strictEqual(plan.maxMonths, 24);
assert.strictEqual(plan.benefitTemplate.designatedCoachPartner.count, 1);
assert.deepStrictEqual(plan.benefitTemplate.designatedCoachPartner.designatedCoachIds, ['coach-zj']);
assert.strictEqual(plan.publicLessonCount, 2);
assert.strictEqual(plan.stringingLaborCount, 5);
assert.strictEqual(plan.ballMachineCount, 6);
assert.strictEqual(plan.level2PartnerCount, 2);
assert.strictEqual(plan.designatedCoachPartnerCount, 1);

assert.throws(
  () => rules.buildMembershipPlanRecord({
    name: '测试方案',
    rechargeAmount: 1000,
    discountRate: 0.9,
    saleStartDate: '2026-05-10',
    saleEndDate: '2026-05-01'
  }),
  /售卖结束日期不能早于售卖开始日期/,
  'membership plan should reject reversed sale window'
);

const court = {
  id: 'court-1',
  name: '王大人',
  phone: '15001010368',
  studentIds: ['stu-1'],
  history: []
};

const first = rules.buildMembershipPurchase({
  court,
  plan,
  body: {
    purchaseDate: '2026-04-05',
    benefitSnapshot: {
      ballMachine: { label: '发球机免费使用', unit: '次', count: 8 },
      customBenefits: [{ label: '朝珺陪打', unit: '次', count: 1 }]
    },
    operator: '管理员'
  },
  now: '2026-04-12T00:00:00.000Z',
  accountId: 'macc-1',
  orderId: 'mord-1',
  historyId: 'his-1'
});

assert.deepStrictEqual(
  {
    accountId: first.account.id,
    courtId: first.account.courtId,
    memberLabel: first.account.memberLabel,
    discountRate: first.account.discountRate,
    cycleStartDate: first.account.cycleStartDate,
    validUntil: first.account.validUntil,
    hardExpireAt: first.account.hardExpireAt,
    lastQualifiedRechargeAmount: first.account.lastQualifiedRechargeAmount,
    orderId: first.order.id,
    benefitValidUntil: first.order.benefitValidUntil,
    historyType: first.historyRow.type,
    historyCategory: first.historyRow.category
  },
  {
    accountId: 'macc-1',
    courtId: 'court-1',
    memberLabel: '黄金卡',
    discountRate: 0.8,
    cycleStartDate: '2026-04-05',
    validUntil: '2027-04-04',
    hardExpireAt: '2028-04-04',
    lastQualifiedRechargeAmount: 5000,
    orderId: 'mord-1',
    benefitValidUntil: '2027-04-04',
    historyType: '充值',
    historyCategory: '会员充值'
  },
  'first membership purchase should create account, order and court history recharge'
);

assert.strictEqual(first.historyRow.amount, 5000);
assert.strictEqual(first.historyRow.bonusAmount, 498);
assert.strictEqual(first.order.priceSource, 'membership_plan');
assert.strictEqual(first.order.priceSourceId, 'mplan-gold');
assert.strictEqual(first.order.priceSourceName, '黄金卡');
assert.strictEqual(first.order.systemAmount, 5000);
assert.strictEqual(first.order.finalAmount, 5000);
assert.strictEqual(first.order.priceOverridden, false);
assert.strictEqual(first.order.overrideReason, '');
assert.strictEqual(first.order.benefitSnapshot.ballMachine.count, 8, 'order stores deal snapshot instead of plan template');
assert.strictEqual(first.order.planBenefitTemplateSnapshot.ballMachine.count, 6, 'order should keep the original plan benefit template snapshot');
assert.strictEqual(plan.benefitTemplate.ballMachine.count, 6, 'plan template should remain unchanged after deal snapshot override');
assert.strictEqual(first.historyRow.systemAmount, 5000);
assert.strictEqual(first.historyRow.finalAmount, 5000);
assert.strictEqual(first.historyRow.priceOverridden, false);
assert.strictEqual(first.historyRow.overrideReason, '');

const discountedMembershipPurchase = rules.buildMembershipPurchase({
  court,
  plan,
  body: {
    purchaseDate: '2026-04-08',
    rechargeAmount: 4600,
    overrideReason: '续充优惠',
    operator: '管理员'
  },
  now: '2026-04-12T00:00:00.000Z',
  accountId: 'macc-price',
  orderId: 'mord-price',
  historyId: 'his-price'
});

assert.strictEqual(discountedMembershipPurchase.order.systemAmount, 5000);
assert.strictEqual(discountedMembershipPurchase.order.finalAmount, 4600);
assert.strictEqual(discountedMembershipPurchase.order.priceOverridden, true);
assert.strictEqual(discountedMembershipPurchase.order.overrideReason, '续充优惠');
assert.strictEqual(discountedMembershipPurchase.historyRow.amount, 4600);
assert.strictEqual(discountedMembershipPurchase.historyRow.systemAmount, 5000);
assert.strictEqual(discountedMembershipPurchase.historyRow.finalAmount, 4600);
assert.strictEqual(discountedMembershipPurchase.historyRow.priceOverridden, true);
assert.strictEqual(discountedMembershipPurchase.historyRow.overrideReason, '续充优惠');

assert.throws(
  () => rules.buildMembershipPurchase({
    court,
    plan,
    body: {
      purchaseDate: '2026-04-08',
      rechargeAmount: 4600,
      overrideReason: ''
    },
    now: '2026-04-12T00:00:00.000Z',
    accountId: 'macc-price',
    orderId: 'mord-price',
    historyId: 'his-price'
  }),
  /请填写改价原因/,
  'membership purchase should require override reason when final deal amount differs from plan price'
);

const adjustedPurchase = rules.buildMembershipPurchase({
  court,
  plan,
  body: {
    purchaseDate: '2026-04-06',
    publicLessonCount: 5,
    stringingLaborCount: 7,
    ballMachineCount: 9,
    level2PartnerCount: 3,
    designatedCoachPartnerCount: 2,
    designatedCoachIds: ['coach-zj', 'coach-chen'],
    customBenefits: [{ label: '节日赠礼', unit: '份', count: 2 }]
  },
  now: '2026-04-12T00:00:00.000Z',
  accountId: 'macc-2',
  orderId: 'mord-4',
  historyId: 'his-4'
});

assert.deepStrictEqual(
  {
    publicLesson: adjustedPurchase.order.benefitSnapshot.publicLesson.count,
    stringingLabor: adjustedPurchase.order.benefitSnapshot.stringingLabor.count,
    ballMachine: adjustedPurchase.order.benefitSnapshot.ballMachine.count,
    level2Partner: adjustedPurchase.order.benefitSnapshot.level2Partner.count,
    designatedCoachPartner: adjustedPurchase.order.benefitSnapshot.designatedCoachPartner.count,
    designatedCoachIds: adjustedPurchase.order.benefitSnapshot.designatedCoachPartner.designatedCoachIds,
    customBenefits: adjustedPurchase.order.benefitSnapshot.customBenefits
  },
  {
    publicLesson: 5,
    stringingLabor: 7,
    ballMachine: 9,
    level2Partner: 3,
    designatedCoachPartner: 2,
    designatedCoachIds: ['coach-zj', 'coach-chen'],
    customBenefits: [{ label: '节日赠礼', unit: '份', count: 2 }]
  },
  'one-off purchase benefit adjustments should only affect the current order snapshot'
);

const swappedBenefitPurchase = rules.buildMembershipPurchase({
  court,
  plan,
  body: {
    purchaseDate: '2026-04-07',
    publicLessonCount: 0,
    stringingLaborCount: 6,
    ballMachineCount: 0,
    level2PartnerCount: 0,
    designatedCoachPartnerCount: 0,
    notes: '不要大师公开课和发球机，都换成穿线服务'
  },
  now: '2026-04-12T00:00:00.000Z',
  accountId: 'macc-3',
  orderId: 'mord-5',
  historyId: 'his-5'
});

assert.strictEqual(
  swappedBenefitPurchase.order.benefitSnapshot.stringingLabor.count,
  6,
  'deal benefit snapshot should keep the manually adjusted right count'
);
assert.strictEqual(
  swappedBenefitPurchase.order.benefitSnapshot.publicLesson,
  undefined,
  'deal benefit snapshot should not fall back to plan public lessons when the current order adjusts them to 0'
);
assert.strictEqual(
  swappedBenefitPurchase.order.benefitSnapshot.ballMachine,
  undefined,
  'deal benefit snapshot should not fall back to plan ball-machine rights when the current order adjusts them to 0'
);
assert.strictEqual(
  swappedBenefitPurchase.order.benefitSnapshotCustomized,
  true,
  'deal benefit snapshot should mark explicit zero adjustments as customized'
);
assert.strictEqual(
  swappedBenefitPurchase.order.notes,
  '不要大师公开课和发球机，都换成穿线服务',
  'membership purchase should keep the operator remark on the order snapshot'
);

const emptySnapshotOrder = rules.normalizeMembershipOrderViewRecord(
  {
    id: 'mord-empty',
    membershipPlanId: plan.id,
    membershipAccountId: 'macc-empty',
    courtId: court.id,
    benefitSnapshot: {}
  },
  plan
);

assert.strictEqual(
  emptySnapshotOrder.benefitSnapshot.publicLesson.count,
  2,
  'empty order snapshot should fall back to membership plan benefit template'
);

const partialSnapshotOrder = rules.normalizeMembershipOrderViewRecord(
  {
    id: 'mord-partial',
    membershipPlanId: plan.id,
    membershipAccountId: 'macc-partial',
    courtId: court.id,
    benefitSnapshot: {
      stringingLabor: { label: '穿线免手工费', unit: '次', count: 20 }
    },
    planBenefitTemplateSnapshot: {
      publicLesson: { label: '大师公开课', unit: '次', count: 2 },
      stringingLabor: { label: '穿线免手工费', unit: '次', count: 2 },
      ballMachine: { label: '发球机免费', unit: '次', count: 2 }
    }
  },
  plan
);

assert.strictEqual(
  partialSnapshotOrder.benefitSnapshot.stringingLabor.count,
  20,
  'stored deal snapshot should keep the manually adjusted count'
);
assert.strictEqual(
  partialSnapshotOrder.benefitSnapshot.publicLesson,
  undefined,
  'stored deal snapshot should not refill omitted rights from the plan'
);
assert.strictEqual(
  partialSnapshotOrder.benefitSnapshot.ballMachine,
  undefined,
  'stored deal snapshot should treat omitted rights as zero'
);

const customizedPublicLessonOrder = rules.normalizeMembershipOrderViewRecord(
  {
    id: 'mord-public-20',
    membershipPlanId: plan.id,
    membershipAccountId: 'macc-public-20',
    courtId: court.id,
    benefitSnapshot: {
      publicLesson: { label: '大师公开课', unit: '次', count: 20 }
    },
    planBenefitTemplateSnapshot: {
      publicLesson: { label: '大师公开课', unit: '次', count: 2 },
      stringingLabor: { label: '穿线免手工费', unit: '次', count: 2 },
      ballMachine: { label: '发球机免费', unit: '次', count: 2 }
    },
    benefitValidUntil: '2027-04-12',
    status: 'active'
  },
  plan
);

const customizedPublicLessonSummary = rules.summarizeMembershipBenefits({
  orders: [customizedPublicLessonOrder],
  ledger: [{
    id: 'b-led-public-1',
    membershipOrderId: 'mord-public-20',
    membershipAccountId: 'macc-public-20',
    courtId: court.id,
    benefitCode: 'publicLesson',
    benefitLabel: '大师公开课',
    unit: '次',
    delta: -1,
    action: 'consume',
    createdAt: '2026-04-13T08:56:18.836Z'
  }],
  today: '2026-04-13'
});

assert.deepStrictEqual(
  customizedPublicLessonSummary.map(x => ({ code: x.benefitCode, total: x.total, remaining: x.remaining })),
  [{ code: 'publicLesson', total: 20, remaining: 19 }],
  'customized deal rights should not refill zeroed standard rights after consumption'
);

const allZeroBenefitPurchase = rules.buildMembershipPurchase({
  court,
  plan,
  body: {
    purchaseDate: '2026-04-08',
    publicLessonCount: 0,
    stringingLaborCount: 0,
    ballMachineCount: 0,
    level2PartnerCount: 0,
    designatedCoachPartnerCount: 0
  },
  now: '2026-04-12T00:00:00.000Z',
  accountId: 'macc-zero',
  orderId: 'mord-zero',
  historyId: 'his-zero'
});

assert.deepStrictEqual(
  rules.summarizeMembershipBenefits({
    orders: [allZeroBenefitPurchase.order],
    ledger: [],
    today: '2026-04-13'
  }),
  [],
  'explicitly zeroed deal rights should not fall back to standard plan rights'
);

const renewal = rules.buildMembershipPurchase({
  court: { ...court, history: [first.historyRow] },
  plan: { ...plan, name: '钻石卡', tierCode: 'diamond', rechargeAmount: 10000, discountRate: 0.7 },
  existingAccount: first.account,
  body: { purchaseDate: '2026-10-01' },
  now: '2026-10-01T00:00:00.000Z',
  orderId: 'mord-2',
  historyId: 'his-2'
});

assert.strictEqual(renewal.account.cycleStartDate, '2026-10-01');
assert.strictEqual(renewal.account.validUntil, '2027-09-30');
assert.strictEqual(renewal.account.hardExpireAt, '2028-09-30');
assert.strictEqual(renewal.order.qualifiesRenewalReset, true);

const lowRenewal = rules.buildMembershipPurchase({
  court: { ...court, history: [first.historyRow] },
  plan: { ...plan, name: '白银卡', tierCode: 'silver', rechargeAmount: 3000, discountRate: 0.9 },
  existingAccount: first.account,
  body: { purchaseDate: '2026-10-01' },
  now: '2026-10-01T00:00:00.000Z',
  orderId: 'mord-3',
  historyId: 'his-3'
});

assert.strictEqual(lowRenewal.account.validUntil, '2027-04-04');
assert.strictEqual(lowRenewal.order.qualifiesRenewalReset, false);
assert.match(lowRenewal.warning, /低于原会员档位/);

const extended = rules.reconcileMembershipAccounts({
  accounts: [first.account],
  courts: [{ ...court, history: [first.historyRow] }],
  today: '2027-04-05',
  now: '2027-04-05T00:00:00.000Z',
  eventIdFactory: () => 'evt-extend'
});

assert.strictEqual(extended.accounts[0].status, 'extended');
assert.strictEqual(extended.accounts[0].autoExtended, true);
assert.strictEqual(extended.events[0].eventType, 'auto_extend');
assert.strictEqual(extended.historyRows.length, 0);

const cleared = rules.reconcileMembershipAccounts({
  accounts: [first.account],
  courts: [{ ...court, history: [first.historyRow] }],
  today: '2028-04-05',
  now: '2028-04-05T00:00:00.000Z',
  eventIdFactory: () => 'evt-clear',
  historyIdFactory: () => 'his-clear'
});

assert.strictEqual(cleared.accounts[0].status, 'cleared');
assert.strictEqual(cleared.events[0].eventType, 'auto_clear');
assert.strictEqual(cleared.historyRows[0].type, '冲正');
assert.strictEqual(cleared.historyRows[0].category, '会员到期清零');
assert.strictEqual(cleared.historyRows[0].amount, 5498);

const benefitSummary = rules.summarizeMembershipBenefits({
  orders: [first.order],
  ledger: [{
    id: 'b-led-1',
    membershipOrderId: 'mord-1',
    membershipAccountId: 'macc-1',
    courtId: 'court-1',
    benefitCode: 'ballMachine',
    benefitLabel: '发球机免费使用',
    unit: '次',
    delta: -2,
    action: 'consume',
    createdAt: '2026-05-01T00:00:00.000Z'
  }],
  today: '2026-05-02'
});

const ballMachineSummary = benefitSummary.find(x => x.benefitCode === 'ballMachine');
assert.ok(ballMachineSummary, 'benefit summary should include ballMachine batch');
assert.strictEqual(ballMachineSummary.membershipOrderId, 'mord-1');
assert.strictEqual(ballMachineSummary.remaining, 6);

const supplementedBenefitSummary = rules.summarizeMembershipBenefits({
  orders: [first.order],
  ledger: [{
    id: 'b-led-supplement-1',
    membershipOrderId: 'mord-1',
    membershipAccountId: 'macc-1',
    courtId: 'court-1',
    benefitCode: 'stringingLabor',
    benefitLabel: '穿线免手工费',
    unit: '次',
    delta: 50,
    action: 'supplement',
    createdAt: '2026-05-01T00:00:00.000Z'
  }],
  today: '2026-05-02'
});
const stringingSupplementSummary = supplementedBenefitSummary.find(x => x.benefitCode === 'stringingLabor');
const baseStringingTotal = rules.summarizeMembershipBenefits({
  orders: [first.order],
  ledger: [],
  today: '2026-05-02'
}).find(x => x.benefitCode === 'stringingLabor')?.total || 0;
assert.ok(stringingSupplementSummary, 'supplemented benefit summary should include stringing labor');
assert.strictEqual(stringingSupplementSummary.total, baseStringingTotal + 50, 'supplement should increase the total benefit count');
assert.strictEqual(stringingSupplementSummary.remaining, baseStringingTotal + 50, 'supplement should increase the remaining benefit count');

const allocatedUsage = rules.allocateMembershipBenefitUsage({
  membershipAccountId: 'macc-1',
  courtId: 'court-1',
  benefitCode: 'ballMachine',
  benefitLabel: '发球机免费使用',
  unit: '次',
  consumeCount: 3,
  orders: [
    {
      ...first.order,
      benefitSnapshot: {
        ballMachine: { label: '发球机免费使用', unit: '次', count: 2 }
      },
      benefitValidUntil: '2026-06-01'
    },
    {
      ...renewal.order,
      membershipAccountId: 'macc-1',
      benefitSnapshot: {
        ballMachine: { label: '发球机免费使用', unit: '次', count: 5 }
      },
      benefitValidUntil: '2026-12-01'
    }
  ],
  ledger: [],
  now: '2026-05-01T00:00:00.000Z',
  idFactory: (() => {
    let i = 0;
    return () => `alloc-${++i}`;
  })()
});

assert.deepStrictEqual(
  allocatedUsage.map(x => ({ membershipOrderId: x.membershipOrderId, delta: x.delta })),
  [
    { membershipOrderId: 'mord-1', delta: -2 },
    { membershipOrderId: 'mord-2', delta: -1 }
  ],
  'benefit consumption should deduct the earliest-expiring batch first'
);

const legacyAllocatedUsage = rules.allocateMembershipBenefitUsage({
  membershipAccountId: 'macc-legacy',
  courtId: 'court-legacy',
  benefitCode: 'stringingLabor',
  benefitLabel: '穿线免手工费',
  unit: '次',
  consumeCount: 1,
  orders: [{
    id: 'legacy-order-1',
    membershipAccountId: 'macc-legacy',
    courtId: 'court-legacy',
    stringingLaborCount: 6,
    benefitValidUntil: '2026-12-01',
    status: 'active'
  }],
  ledger: [],
  now: '2026-05-01T00:00:00.000Z',
  idFactory: () => 'legacy-alloc-1'
});

assert.deepStrictEqual(
  legacyAllocatedUsage.map(x => ({ membershipOrderId: x.membershipOrderId, delta: x.delta, benefitCode: x.benefitCode })),
  [
    { membershipOrderId: 'legacy-order-1', delta: -1, benefitCode: 'stringingLabor' }
  ],
  'legacy membership orders without benefitSnapshot should still be consumable by benefit ledger allocation'
);

assert.throws(
  () => rules.allocateMembershipBenefitUsage({
    membershipAccountId: 'macc-1',
    courtId: 'court-1',
    benefitCode: 'ballMachine',
    consumeCount: 10,
    orders: [{
      ...first.order,
      benefitSnapshot: { ballMachine: { label: '发球机免费使用', unit: '次', count: 1 } }
    }],
    ledger: [],
    now: '2026-05-01T00:00:00.000Z'
  }),
  /剩余权益不足/,
  'benefit consumption should reject requests that exceed remaining batches'
);

assert.strictEqual(
  rules.isDuplicateMembershipOrderSubmission({
    courtId: 'court-1',
    membershipPlanId: 'mplan-gold',
    purchaseDate: '2026-04-05',
    rechargeAmount: 5000,
    requestKey: '',
    recentOrders: [{
      id: 'mord-dup',
      courtId: 'court-1',
      membershipPlanId: 'mplan-gold',
      purchaseDate: '2026-04-05',
      rechargeAmount: 5000,
      status: 'active',
      createdAt: '2026-04-12T00:00:05.000Z'
    }],
    now: '2026-04-12T00:00:10.000Z'
  }),
  true,
  'membership order should reject short-window duplicate submissions'
);

assert.strictEqual(
  rules.isDuplicateMembershipOrderSubmission({
    courtId: 'court-1',
    membershipPlanId: 'mplan-gold',
    purchaseDate: '2026-04-05',
    rechargeAmount: 5000,
    requestKey: 'req-1',
    recentOrders: [{
      id: 'mord-dup',
      courtId: 'court-1',
      membershipPlanId: 'mplan-gold',
      purchaseDate: '2026-04-05',
      rechargeAmount: 5000,
      requestKey: 'req-1',
      status: 'active',
      createdAt: '2026-04-12T00:00:05.000Z'
    }],
    now: '2026-04-12T00:01:10.000Z'
  }),
  true,
  'same request key should be treated as duplicate even outside the short window'
);

assert.strictEqual(
  rules.isTransientStorageError(new Error('Client network socket disconnected before secure TLS connection was established')),
  true,
  'transient tls disconnect should be recognized as retryable storage error'
);

assert.throws(
  () => rules.buildMembershipBenefitLedgerRecord({
    membershipAccountId: 'macc-1',
    courtId: 'court-1',
    benefitCode: 'ballMachine',
    delta: -1
  }),
  /购买批次/,
  'benefit usage must reference membership order batch'
);

const voidedEvent = rules.buildMembershipAccountEventRecord({
  membershipAccountId: 'macc-1',
  courtId: 'court-1',
  eventType: 'voided',
  beforeStatus: 'active',
  afterStatus: 'voided',
  operator: '管理员',
  reason: '手动作废会员'
}, { id: 'evt-void-1', now: '2026-04-12T10:00:00.000Z' });

assert.deepStrictEqual(
  {
    id: voidedEvent.id,
    eventType: voidedEvent.eventType,
    beforeStatus: voidedEvent.beforeStatus,
    afterStatus: voidedEvent.afterStatus,
    operator: voidedEvent.operator,
    reason: voidedEvent.reason
  },
  {
    id: 'evt-void-1',
    eventType: 'voided',
    beforeStatus: 'active',
    afterStatus: 'voided',
    operator: '管理员',
    reason: '手动作废会员'
  },
  'voiding membership should create an auditable account event'
);

const coachLoaded = rules.filterLoadAllForUser({
  courts: [{ ...court, history: [first.historyRow] }],
  students: [],
  products: [],
  packages: [],
  purchases: [],
  entitlements: [],
  entitlementLedger: [],
  membershipPlans: [plan],
  membershipAccounts: [first.account],
  membershipOrders: [first.order],
  membershipBenefitLedger: [],
  membershipAccountEvents: [],
  plans: [],
  schedule: [],
  coaches: [],
  classes: [],
  campuses: [],
  feedbacks: []
}, { role: 'editor', name: '朝珺', coachName: '朝珺' });

assert.deepStrictEqual(coachLoaded.membershipPlans, []);
assert.deepStrictEqual(coachLoaded.membershipAccounts, []);
assert.deepStrictEqual(coachLoaded.membershipOrders, []);
assert.deepStrictEqual(coachLoaded.membershipBenefitLedger, []);
assert.deepStrictEqual(coachLoaded.membershipAccountEvents, []);
assert.deepStrictEqual(coachLoaded.courts, []);

const emptyCourt = {
  id: 'court-delete-1',
  name: '待删订场用户',
  phone: '15001010368',
  history: []
};

assert.throws(
  () => rules.assertCanDeleteCourt(emptyCourt, {
    membershipAccounts: [{ id: 'macc-delete-1', courtId: 'court-delete-1' }]
  }),
  /会员账户/,
  'membership account should block court deletion'
);

assert.throws(
  () => rules.assertCanDeleteCourt(emptyCourt, {
    membershipOrders: [{ id: 'mord-delete-1', courtId: 'court-delete-1' }]
  }),
  /会员订单/,
  'membership order should block court deletion'
);

assert.throws(
  () => rules.assertCanDeleteCourt(emptyCourt, {
    membershipBenefitLedger: [{ id: 'mled-delete-1', courtId: 'court-delete-1' }]
  }),
  /权益流水/,
  'membership benefit ledger should block court deletion'
);

assert.throws(
  () => rules.assertCanDeleteCourt(emptyCourt, {
    membershipAccountEvents: [{ id: 'mevt-delete-1', courtId: 'court-delete-1' }]
  }),
  /账户事件/,
  'membership account event should block court deletion'
);

assert.strictEqual(
  rules.courtDeleteAction({ id: 'court-delete-2', history: [] }, {}),
  'delete',
  'empty court account should be physically deletable'
);

assert.strictEqual(
  rules.courtDeleteAction({ id: 'court-delete-3', history: [first.historyRow] }, {}),
  'archive',
  'court account with finance history should be archived instead of physically deleted'
);

assert.strictEqual(
  rules.courtDeleteAction(emptyCourt, {
    membershipOrders: [{ id: 'mord-delete-2', courtId: 'court-delete-1' }]
  }),
  'archive',
  'court account with membership links should be archived instead of physically deleted'
);

const mergedCourt = rules.mergeCourtRecords({
  targetCourt: {
    id: 'court-target',
    name: '正式用户',
    phone: '13800138000',
    campus: 'mabao',
    studentIds: ['stu-a'],
    notes: '原备注',
    history: [{ id: 'h-target', date: '2026-04-10', type: '充值', amount: 500, payMethod: '微信', category: '储值' }]
  },
  sourceCourt: {
    id: 'court-source',
    name: '导入用户',
    phone: '',
    campus: '',
    studentIds: ['stu-b'],
    notes: '导入备注',
    history: [{ id: 'h-source', date: '2026-04-12', type: '消费', amount: 120, payMethod: '储值扣款', category: '订场' }]
  },
  membershipAccounts: [{ id: 'macc-merge', courtId: 'court-source', courtName: '导入用户', phone: '', studentIds: ['stu-b'], status: 'active' }],
  membershipOrders: [{ id: 'mord-merge', membershipAccountId: 'macc-merge', courtId: 'court-source', courtName: '导入用户', studentIds: ['stu-b'] }],
  membershipBenefitLedger: [{ id: 'mled-merge', membershipAccountId: 'macc-merge', courtId: 'court-source', benefitCode: 'ballMachine', delta: -1 }],
  membershipAccountEvents: [{ id: 'mevt-merge', membershipAccountId: 'macc-merge', courtId: 'court-source', eventType: 'opened' }],
  now: '2026-04-14T10:00:00.000Z'
});

assert.deepStrictEqual(
  {
    targetId: mergedCourt.targetCourt.id,
    targetStudentIds: mergedCourt.targetCourt.studentIds,
    targetHistoryCount: mergedCourt.targetCourt.history.length,
    targetNotes: mergedCourt.targetCourt.notes,
    accountCourtId: mergedCourt.membershipAccounts[0].courtId,
    accountCourtName: mergedCourt.membershipAccounts[0].courtName,
    accountPhone: mergedCourt.membershipAccounts[0].phone,
    orderCourtId: mergedCourt.membershipOrders[0].courtId,
    ledgerCourtId: mergedCourt.membershipBenefitLedger[0].courtId,
    eventCourtId: mergedCourt.membershipAccountEvents[0].courtId
  },
  {
    targetId: 'court-target',
    targetStudentIds: ['stu-a', 'stu-b'],
    targetHistoryCount: 2,
    targetNotes: '原备注\n[合并自 导入用户 · court-source] 导入备注',
    accountCourtId: 'court-target',
    accountCourtName: '正式用户',
    accountPhone: '13800138000',
    orderCourtId: 'court-target',
    ledgerCourtId: 'court-target',
    eventCourtId: 'court-target'
  },
  'court merge should merge source finance and linked membership records into the target court'
);

assert.throws(
  () => rules.mergeCourtRecords({
    targetCourt: { id: 'court-target', name: '正式用户', history: [] },
    sourceCourt: { id: 'court-source', name: '导入用户', history: [] },
    membershipAccounts: [
      { id: 'macc-target', courtId: 'court-target', status: 'active' },
      { id: 'macc-source', courtId: 'court-source', status: 'active' }
    ]
  }),
  /两个订场用户都已有会员账户/,
  'court merge should reject when both source and target already have membership accounts'
);

console.log('membership rules tests passed');
