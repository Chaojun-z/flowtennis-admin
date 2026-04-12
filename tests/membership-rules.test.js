const assert = require('assert');
const api = require('../api/index.js');

const rules = api._test;

assert.ok(rules, 'api._test should expose membership rule helpers');
assert.ok(rules.MEMBERSHIP_TABLES, 'membership tables should be exposed for runtime bootstrap checks');
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

const plan = rules.buildMembershipPlanRecord({
  name: '黄金卡',
  tierCode: 'gold',
  rechargeAmount: 5000,
  discountRate: 0.8,
  bonusAmount: 498,
  benefitTemplate: {
    ballMachine: { label: '发球机免费使用', unit: '次', count: 6 }
  }
}, { id: 'mplan-gold', now: '2026-04-12T00:00:00.000Z' });

assert.strictEqual(plan.id, 'mplan-gold');
assert.strictEqual(plan.status, 'active');
assert.strictEqual(plan.validMonths, 12);
assert.strictEqual(plan.maxMonths, 24);

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
assert.strictEqual(first.order.benefitSnapshot.ballMachine.count, 8, 'order stores deal snapshot instead of plan template');

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

assert.strictEqual(benefitSummary[0].membershipOrderId, 'mord-1');
assert.strictEqual(benefitSummary[0].benefitCode, 'ballMachine');
assert.strictEqual(benefitSummary[0].remaining, 6);

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

console.log('membership rules tests passed');
