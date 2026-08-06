const assert = require('assert');
const api = require('../api/index.js');
const { createLeadsRoutes } = require('../server/leads-routes.js');

const rules = api._test;

function makeRes() {
  return {
    statusCode: 200,
    body: null,
    status(code) {
      this.statusCode = code;
      return this;
    },
    json(payload) {
      this.body = payload;
      return this;
    }
  };
}

function baseDeps(overrides = {}) {
  const writes = [];
  return {
    writes,
    deps: {
      init: async () => {},
      sendJson: (res, payload, status = 200) => {
        res.status(status).json(payload);
        return true;
      },
      put: async (table, id, row) => {
        writes.push({ table, id, row });
      },
      cleanLeadText: value => String(value || '').trim(),
      normalizeLeadRecord: rules.normalizeLeadRecord,
      buildLeadInitialFollowup: rules.buildLeadInitialFollowup,
      buildLeadDedupKey: rules.buildLeadDedupKey,
      T_LEADS: 'ft_leads',
      T_LEAD_FOLLOWUPS: 'ft_lead_followups',
      ...overrides
    }
  };
}

async function postNewLead(handle) {
  const res = makeRes();
  await handle({
    path: '/leads',
    method: 'POST',
    body: {
      displayName: '阿里',
      wechatName: '阿里',
      phone: '',
      leadDate: '2026-08-01',
      campus: 'shunyi_mapo',
      demandProduct: '私教课',
      createInitialFollowup: true
    },
    user: { role: 'admin' },
    res,
    query: new URLSearchParams()
  });
  return res;
}

(async () => {
  let productionEnsureCalls = 0;
  const production = baseDeps({
    isProductionRuntime: () => true,
    ensureLeadTables: async () => {
      productionEnsureCalls += 1;
      throw new Error('production save must not create lead tables before writing');
    }
  });
  const productionHandle = createLeadsRoutes(production.deps);
  const productionRes = await postNewLead(productionHandle);

  assert.strictEqual(productionRes.statusCode, 200, 'production lead save should succeed without table bootstrap');
  assert.strictEqual(productionEnsureCalls, 0, 'production lead save must skip ensureLeadTables');
  assert.ok(production.writes.some(item => item.table === 'ft_leads'), 'production lead save should still write the lead row');
  assert.ok(production.writes.some(item => item.table === 'ft_lead_followups'), 'production lead save should still write the initial followup row');

  let developmentEnsureCalls = 0;
  const development = baseDeps({
    isProductionRuntime: () => false,
    ensureLeadTables: async () => {
      developmentEnsureCalls += 1;
    }
  });
  const developmentHandle = createLeadsRoutes(development.deps);
  const developmentRes = await postNewLead(developmentHandle);

  assert.strictEqual(developmentRes.statusCode, 200, 'development lead save should still succeed');
  assert.strictEqual(developmentEnsureCalls, 1, 'development lead save should keep the existing table bootstrap behavior');

  const existingLead = rules.normalizeLeadRecord({
    id: 'lead-existing',
    displayName: '阿里',
    wechatName: '阿里',
    phone: '',
    leadDate: '2026-08-01',
    campus: 'shunyi_mapo',
    demandProduct: '私教课',
    createdAt: '2026-08-01T10:00:00.000Z',
    updatedAt: '2026-08-01T10:00:00.000Z'
  }, { id: 'lead-existing', now: '2026-08-01T10:00:00.000Z' });
  const duplicate = baseDeps({
    isProductionRuntime: () => true,
    scan: async (table) => table === 'ft_leads' ? [existingLead] : []
  });
  const duplicateHandle = createLeadsRoutes(duplicate.deps);
  const duplicateRes = await postNewLead(duplicateHandle);

  assert.strictEqual(duplicateRes.statusCode, 200, 'duplicate lead save should return the existing row as a successful idempotent save');
  assert.strictEqual(duplicateRes.body.duplicate, true, 'duplicate lead save should tell the frontend it reused an existing lead');
  assert.strictEqual(duplicateRes.body.lead.id, 'lead-existing', 'duplicate lead save should reuse the existing lead');
  assert.ok(!duplicate.writes.some(item => item.table === 'ft_leads'), 'duplicate lead save must not write a second lead row');
  assert.ok(!duplicate.writes.some(item => item.table === 'ft_lead_followups'), 'duplicate lead save must not write a second initial followup');

  const rows = { ft_leads: [], ft_lead_followups: [] };
  const repeated = baseDeps({
    isProductionRuntime: () => true,
    get: async (table, id) => rows[table].find(row => row.id === id) || null,
    scan: async (table) => rows[table] || [],
    put: async (table, id, row) => {
      repeated.writes.push({ table, id, row });
      rows[table] = rows[table].filter(item => item.id !== id).concat(row);
    }
  });
  const repeatedHandle = createLeadsRoutes(repeated.deps);
  const firstRepeatedRes = await postNewLead(repeatedHandle);
  const secondRepeatedRes = await postNewLead(repeatedHandle);

  assert.strictEqual(firstRepeatedRes.statusCode, 200, 'first manual save should succeed');
  assert.strictEqual(secondRepeatedRes.statusCode, 200, 'second identical manual save should still succeed');
  assert.strictEqual(secondRepeatedRes.body.duplicate, true, 'second identical manual save should be idempotent');
  assert.strictEqual(rows.ft_leads.length, 1, 'double clicking or retrying the same manual save should leave one lead row');
  assert.strictEqual(rows.ft_lead_followups.length, 1, 'double clicking or retrying the same manual save should leave one initial followup row');

  console.log('leads production save bootstrap tests passed');
})().catch(error => {
  console.error(error && error.stack ? error.stack : String(error));
  process.exit(1);
});
