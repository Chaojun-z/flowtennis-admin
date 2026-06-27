const assert = require('assert');
const api = require('../api/index.js');

const rules = api._test;

assert.ok(rules.buildBootstrapSafetyFlags, 'api._test should expose bootstrap safety flag builder');

const productionFlags = rules.buildBootstrapSafetyFlags({
  NODE_ENV: 'production',
  ENABLE_DEFAULT_USER_BOOTSTRAP: 'true',
  ENABLE_TABLE_BOOTSTRAP: 'true',
  ENABLE_RUNTIME_TABLE_ENSURE: 'true',
  ENABLE_DEFAULT_PRICE_PLAN_BOOTSTRAP: 'true',
  ENABLE_MABAO_FINANCE_SEED_BOOTSTRAP: 'true',
  ENABLE_IMPORTED_LEDGER_AUTO_REPAIR: 'true'
});

assert.strictEqual(productionFlags.isProduction, true, 'production env should be recognized');
assert.strictEqual(productionFlags.allowProductionBootstrapWrites, false, 'production should deny high-risk bootstrap writes by default');
assert.strictEqual(productionFlags.enableDefaultUserBootstrap, false, 'default user bootstrap should be off in production without explicit override');
assert.strictEqual(productionFlags.enableTableBootstrap, false, 'table bootstrap should be off in production without explicit override');
assert.strictEqual(productionFlags.enableDefaultPricePlanBootstrap, false, 'default price plan bootstrap should be off in production without explicit override');
assert.strictEqual(productionFlags.enableShunyiMapoFinanceSeedBootstrap, false, 'shunyi_mapo finance seed bootstrap should be off in production without explicit override');
assert.strictEqual(productionFlags.enableImportedLedgerAutoRepair, false, 'imported ledger auto repair should be off in production without explicit override');
assert.strictEqual(productionFlags.enableRuntimeTableEnsure, true, 'runtime table ensure can stay opt-in because it does not write business rows');

const productionOverrideFlags = rules.buildBootstrapSafetyFlags({
  NODE_ENV: 'production',
  ALLOW_PRODUCTION_BOOTSTRAP_WRITES: 'true',
  ENABLE_DEFAULT_USER_BOOTSTRAP: 'true',
  ENABLE_TABLE_BOOTSTRAP: 'true',
  ENABLE_DEFAULT_PRICE_PLAN_BOOTSTRAP: 'true',
  ENABLE_MABAO_FINANCE_SEED_BOOTSTRAP: 'true',
  ENABLE_IMPORTED_LEDGER_AUTO_REPAIR: 'true'
});

assert.strictEqual(productionOverrideFlags.allowProductionBootstrapWrites, true, 'explicit production override should be visible');
assert.strictEqual(productionOverrideFlags.enableDefaultUserBootstrap, true, 'production override should allow default user bootstrap');
assert.strictEqual(productionOverrideFlags.enableTableBootstrap, true, 'production override should allow table bootstrap');
assert.strictEqual(productionOverrideFlags.enableDefaultPricePlanBootstrap, true, 'production override should allow default price plan bootstrap');
assert.strictEqual(productionOverrideFlags.enableShunyiMapoFinanceSeedBootstrap, true, 'production override should allow shunyi_mapo finance seed bootstrap');
assert.strictEqual(productionOverrideFlags.enableImportedLedgerAutoRepair, true, 'production override should allow imported ledger auto repair');

const developmentFlags = rules.buildBootstrapSafetyFlags({
  NODE_ENV: 'development',
  ENABLE_DEFAULT_USER_BOOTSTRAP: 'true',
  ENABLE_TABLE_BOOTSTRAP: 'true',
  ENABLE_DEFAULT_PRICE_PLAN_BOOTSTRAP: 'true',
  ENABLE_MABAO_FINANCE_SEED_BOOTSTRAP: 'true',
  ENABLE_IMPORTED_LEDGER_AUTO_REPAIR: 'true'
});

assert.strictEqual(developmentFlags.isProduction, false, 'development env should not be treated as production');
assert.strictEqual(developmentFlags.enableDefaultUserBootstrap, true, 'development can still opt into bootstrap flows');
assert.strictEqual(developmentFlags.enableTableBootstrap, true, 'development can still opt into table bootstrap');
assert.strictEqual(developmentFlags.enableDefaultPricePlanBootstrap, true, 'development can still opt into price plan bootstrap');
assert.strictEqual(developmentFlags.enableShunyiMapoFinanceSeedBootstrap, true, 'development can still opt into shunyi_mapo finance seed bootstrap');
assert.strictEqual(developmentFlags.enableImportedLedgerAutoRepair, true, 'development can still opt into imported ledger auto repair');

console.log('init production safety tests passed');
