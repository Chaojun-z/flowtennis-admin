const assert = require('assert');
const api = require('../api/index.js');

const rules = api._test;

assert.ok(rules, 'api._test should expose reset helpers');

const resetTables = rules.getTestDataResetTables();

assert.ok(resetTables.includes('ft_students'), 'reset should clear students');
assert.ok(resetTables.includes('ft_courts'), 'reset should clear court users');
assert.ok(resetTables.includes('ft_membership_orders'), 'reset should clear membership orders');
assert.ok(!resetTables.includes('ft_users'), 'reset must keep login accounts');
assert.ok(!resetTables.includes('ft_coaches'), 'reset must keep coaches');
assert.ok(!resetTables.includes('ft_campuses'), 'reset must keep campuses');

(async () => {
  const rows = {
    ft_students: [{ id: 'stu-1' }, { id: 'stu-2' }],
    ft_courts: [{ id: 'court-1' }],
    ft_products: []
  };
  const deleted = [];
  const result = await rules.clearTables({
    scan: async (table) => rows[table] || [],
    del: async (table, id) => deleted.push(`${table}:${id}`)
  }, ['ft_students', 'ft_courts', 'ft_products']);

  assert.deepStrictEqual(result, {
    success: true,
    total: 3,
    tables: [
      { table: 'ft_students', count: 2 },
      { table: 'ft_courts', count: 1 },
      { table: 'ft_products', count: 0 }
    ]
  });
  assert.deepStrictEqual(deleted, ['ft_students:stu-1', 'ft_students:stu-2', 'ft_courts:court-1']);
  console.log('test data reset rules tests passed');
})().catch((err) => {
  console.error(err);
  process.exit(1);
});
