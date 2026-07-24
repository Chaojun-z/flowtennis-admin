const assert = require('assert');
const { createCourtRoutes } = require('../server/courts-routes.js');
const { createCourtFinanceRules } = require('../server/court-finance.js');

const financeRules = createCourtFinanceRules();
const store = new Map();

function sendJson(res, payload, status = 200) {
  res.status = status;
  res.payload = payload;
  return true;
}

const handleCourtRoutes = createCourtRoutes({
  init: async () => {},
  sendJson,
  getCachedScan: async () => [],
  getCachedRow: async (table, id) => store.get(id) || null,
  filterLoadAllForUser: (data) => data,
  uuidv4: () => 'test-id',
  buildOperationTrace: () => ({ operationId: 'op-1', batchId: 'batch-op-1', operationType: 'court-booking' }),
  stampCourtHistoryOperationTrace: ({ nextCourt }) => nextCourt,
  normalizeCourtRecord: financeRules.normalizeCourtRecord,
  put: async (table, id, row) => { store.set(id, row); },
  importCourtRows: async () => ({}),
  deleteCourtsByIds: async () => ({}),
  loadCourtDeleteReferenceData: async () => ({}),
  mergeCourtRecords: financeRules.mergeCourtRecords,
  del: async (table, id) => { store.delete(id); },
  parseLegacyCourtNotes: () => ({ notes: '', updates: {}, changed: false }),
  shouldMigrateLegacyCourtFinance: () => false,
  buildLegacyCourtOpeningHistory: financeRules.buildLegacyCourtOpeningHistory,
  legacyCourtFinanceWarnings: financeRules.legacyCourtFinanceWarnings,
  computeCourtFinance: financeRules.computeCourtFinance,
  normalizeMoney: (value) => Math.round((Number(value) || 0) * 100) / 100,
  normalizeCourtHistory: financeRules.normalizeCourtHistory,
  courtDeleteAction: () => 'archive',
  T_COURTS: 'ft_courts',
  T_SCHEDULE: 'ft_schedule',
  T_MEMBERSHIP_ACCOUNTS: 'ft_membership_accounts',
  T_MEMBERSHIP_ORDERS: 'ft_membership_orders',
  T_MEMBERSHIP_BENEFIT_LEDGER: 'ft_membership_benefit_ledger',
  T_MEMBERSHIP_ACCOUNT_EVENTS: 'ft_membership_account_events'
});

const legacyCourt = {
  id: 'court-sky',
  name: 'sky',
  phone: '18813066492',
  campus: 'shunyi_mapo',
  notes: 'old note',
  balance: 0,
  totalDeposit: 100,
  spentAmount: 200,
  receivedAmount: 100,
  history: [
    { id: 'topup-1', date: '2026-04-01', type: '充值', category: '储值', payMethod: '会员充值', amount: 100 },
    { id: 'consume-1', date: '2026-04-02', type: '消费', category: '订场', payMethod: '储值扣款', amount: 200 }
  ]
};

store.set(legacyCourt.id, legacyCourt);

(async () => {
  const res = {};
  await handleCourtRoutes({
    path: '/courts/court-sky',
    method: 'PUT',
    body: {
      name: 'sky',
      phone: '18813066492',
      studentId: '',
      studentIds: [],
      campus: 'shunyi_mapo',
      depositAttitude: '已储值5000',
      notes: 'clean note',
      status: 'active',
      history: legacyCourt.history
    },
    user: { name: 'admin' },
    res
  });

  assert.strictEqual(res.status, 200);
  assert.strictEqual(res.payload.notes, 'clean note');
  assert.strictEqual(res.payload.balance, 0, 'profile-only save should preserve existing finance fields');
  assert.strictEqual(store.get('court-sky').notes, 'clean note');

  await assert.rejects(
    () => handleCourtRoutes({
      path: '/courts/court-sky',
      method: 'PUT',
      body: {
        ...store.get('court-sky'),
        history: [
          ...legacyCourt.history,
          { id: 'consume-2', date: '2026-04-03', type: '消费', category: '订场', payMethod: '储值扣款', amount: 50 }
        ]
      },
      user: { name: 'admin' },
      res: {}
    }),
    /余额不足，不能使用储值扣款/,
    'finance history changes should still reject negative stored-value balance'
  );

  console.log('court profile save route tests passed');
})().catch((error) => {
  console.error(error);
  process.exit(1);
});
