const assert = require('assert');

const {
  LEAD_SOURCE_READ_LIMIT,
  readLeadSourceRows
} = require('../server/lead-source-read-model.js');

assert.strictEqual(LEAD_SOURCE_READ_LIMIT, 2000, 'lead source read limit should cover the current full lead pool instead of the old 300/600 split');

(async () => {
  const calls = [];
  const productionRows = await readLeadSourceRows({
    isProductionRuntime: () => true,
    scanFirstRows: async (table, options) => {
      calls.push({ table, options });
      return Array.from({ length: 353 }, (_, index) => ({ id: `lead-${index}` }));
    },
    getCachedScan: async () => {
      throw new Error('production should not use cached full scan here');
    },
    table: 'ft_leads',
    columns: ['id', 'displayName']
  });

  assert.strictEqual(productionRows.length, 353, 'shared lead source should return every row below the unified limit');
  assert.deepStrictEqual(calls[0], {
    table: 'ft_leads',
    options: {
      limit: LEAD_SOURCE_READ_LIMIT,
      columns: ['id', 'displayName'],
      detectOverflow: true
    }
  }, 'production lead reads should use one overflow-detecting limit for every consumer');

  const devRows = await readLeadSourceRows({
    isProductionRuntime: () => false,
    scanFirstRows: async () => {
      throw new Error('development should not use first-row scan');
    },
    getCachedScan: async (table, options) => {
      calls.push({ table, options });
      return [{ id: 'dev-lead' }];
    },
    table: 'ft_leads',
    columns: ['id']
  });

  assert.deepStrictEqual(devRows, [{ id: 'dev-lead' }], 'non-production lead reads should keep using cached projected scans');

  console.log('lead source read model tests passed');
})().catch(error => {
  console.error(error && error.stack ? error.stack : String(error));
  process.exit(1);
});
