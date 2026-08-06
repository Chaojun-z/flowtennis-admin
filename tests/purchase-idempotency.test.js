const assert = require('assert');
const api = require('../api/index.js');
const { createPurchaseEntitlementRoutes } = require('../server/purchase-entitlement-routes');

const rules = api._test;

function createHarness() {
  let uuidIndex = 0;
  const tables = {
    ft_packages: [{
      id: 'pkg-beginner',
      name: '专项课 · 零基础 · 初阶专项课 · 1次 · 199元',
      price: 199,
      lessons: 1,
      courseType: '专项课',
      status: 'active'
    }],
    ft_students: [{ id: 'student-jay', name: 'Jay', phone: '' }],
    ft_purchases: [],
    ft_entitlements: [],
    ft_membership_benefit_ledger: []
  };
  const handler = createPurchaseEntitlementRoutes({
    init: async () => {},
    sendJson: (res, payload, status = 200) => {
      res.status = status;
      res.payload = payload;
      return true;
    },
    getCachedScan: async table => tables[table] || [],
    get: async (table, id) => (tables[table] || []).find(row => row.id === id) || null,
    put: async (table, id, row) => {
      const rows = tables[table] || (tables[table] = []);
      const index = rows.findIndex(item => item.id === id);
      if (index >= 0) rows[index] = row;
      else rows.push(row);
      return row;
    },
    del: async (table, id) => {
      tables[table] = (tables[table] || []).filter(row => row.id !== id);
    },
    uuidv4: () => `uuid-${++uuidIndex}`,
    isCampusScopedAdmin: () => false,
    parseArr: value => Array.isArray(value) ? value : (value ? [value] : []),
    parseLessonValue: value => Number(value) || 0,
    buildOperationTrace: rules.buildOperationTrace,
    withOperationTrace: rules.withOperationTrace,
    buildStudentBenefitLedgerRecord: () => ({}),
    syncStudentActiveEntitlementIndexes: async () => {},
    writePurchaseAndEntitlementAtomic: async (store, purchaseTable, entitlementTable, purchase, entitlement) => {
      await store.put(purchaseTable, purchase.id, purchase);
      await store.put(entitlementTable, entitlement.id, entitlement);
    },
    buildEntitlementFromPurchase: rules.buildEntitlementFromPurchase,
    buildPurchaseRecord: rules.buildPurchaseRecord,
    normalizePurchasePayMethod: rules.normalizePurchasePayMethod || (value => value || ''),
    validatePurchaseInputForPackage: rules.validatePurchaseInputForPackage,
    T_PURCHASES: 'ft_purchases',
    T_PACKAGES: 'ft_packages',
    T_STUDENTS: 'ft_students',
    T_ENTITLEMENTS: 'ft_entitlements',
    T_MEMBERSHIP_BENEFIT_LEDGER: 'ft_membership_benefit_ledger'
  });
  return { handler, tables };
}

async function postPurchase(handler, body) {
  const res = {};
  await handler({
    path: '/purchases',
    method: 'POST',
    body,
    user: { role: 'admin', name: '飞书同步' },
    query: new URLSearchParams(),
    res
  });
  assert.strictEqual(res.status, 200);
  return res.payload;
}

async function run() {
  const idempotent = createHarness();
  const body = {
    studentId: 'student-jay',
    packageId: 'pkg-beginner',
    purchaseDate: '2026-07-31',
    amountPaid: 199,
    payMethod: '微信',
    businessKey: 'feishu-history|2026-07-31|12:00|Jay|pkg-beginner'
  };
  const first = await postPurchase(idempotent.handler, body);
  const second = await postPurchase(idempotent.handler, body);
  assert.strictEqual(idempotent.tables.ft_purchases.length, 1, 'same businessKey should only create one purchase');
  assert.strictEqual(idempotent.tables.ft_entitlements.length, 1, 'same businessKey should only create one entitlement');
  assert.strictEqual(second.idempotent, true, 'second response should clearly mark idempotent reuse');
  assert.strictEqual(second.purchase.id, first.purchase.id, 'second response should return the original purchase');

  const manual = createHarness();
  await postPurchase(manual.handler, { studentId: 'student-jay', packageId: 'pkg-beginner', purchaseDate: '2026-07-31', amountPaid: 199, payMethod: '微信' });
  await postPurchase(manual.handler, { studentId: 'student-jay', packageId: 'pkg-beginner', purchaseDate: '2026-07-31', amountPaid: 199, payMethod: '微信' });
  assert.strictEqual(manual.tables.ft_purchases.length, 2, 'manual purchases without businessKey can still represent real multiple orders');
}

run()
  .then(() => console.log('purchase idempotency tests passed'))
  .catch(error => {
    console.error(error);
    process.exit(1);
  });
