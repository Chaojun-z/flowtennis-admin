const assert = require('assert');
const fs = require('fs');
const path = require('path');

const apiSource = fs.readFileSync(path.join(__dirname, '../api/index.js'), 'utf8');
const bootstrapSource = fs.readFileSync(path.join(__dirname, '../api/bootstrap.js'), 'utf8');
const stateSource = fs.readFileSync(path.join(__dirname, '../public/assets/scripts/core/state.js'), 'utf8');

assert.match(apiSource, /const ENABLE_RUNTIME_TABLE_ENSURE = BOOTSTRAP_SAFETY_FLAGS\.enableRuntimeTableEnsure;/, 'api should expose runtime table ensure through the centralized safety flags');
assert.match(bootstrapSource, /function buildBootstrapSafetyFlags\(env=process\.env\)/, 'bootstrap module should centralize bootstrap safety flags');
assert.match(apiSource, /const ENABLE_MABAO_FINANCE_SEED_BOOTSTRAP = BOOTSTRAP_SAFETY_FLAGS\.enableMabaoFinanceSeedBootstrap;/, 'finance seed bootstrap should be filtered by runtime safety flags');
assert.match(apiSource, /const ENABLE_IMPORTED_LEDGER_AUTO_REPAIR = BOOTSTRAP_SAFETY_FLAGS\.enableImportedLedgerAutoRepair;/, 'imported ledger auto repair should be filtered by runtime safety flags');
assert.match(bootstrapSource, /if\(enableRuntimeTableEnsure\|\|enableTableBootstrap\)\{[\s\S]*?for\(const t of runtimeEnsuredTables\)await mkTable\(t\);/s, 'init should only run runtime table ensure when explicit switch is enabled');
assert.doesNotMatch(bootstrapSource, /for\(const t of runtimeEnsuredTables\)await mkTable\(t\);\s*if\(enableTableBootstrap\)/, 'init should not unconditionally ensure runtime tables before bootstrap flag check');
assert.match(apiSource, /const ENABLE_DEFAULT_PRICE_PLAN_BOOTSTRAP = BOOTSTRAP_SAFETY_FLAGS\.enableDefaultPricePlanBootstrap;/, 'default price plan bootstrap should be filtered by runtime safety flags');
assert.match(bootstrapSource, /if\(enableDefaultPricePlanBootstrap\)\{[\s\S]*?await syncDefaultPricePlans\(\)\.catch\(err=>console\.error\('\[api-bootstrap\] sync default price plans failed',err\)\);/s, 'init should only block on default price plan sync when explicit switch is enabled');
assert.doesNotMatch(bootstrapSource, /if\(enableTableBootstrap\)\{[\s\S]*?\}\s*await syncDefaultPricePlans\(\)\.catch\(err=>console\.error\('\[api-bootstrap\] sync default price plans failed',err\)\);/, 'init should not always block cold start on default price plan sync');
assert.doesNotMatch(bootstrapSource, /else if\(!defaultPricePlanSyncStarted\)\{[\s\S]*syncDefaultPricePlans\(\)/, 'init should not auto-dispatch default price plan writes when bootstrap flag is off');
assert.doesNotMatch(apiSource, /if\(path==='\/auth\/login'&&method==='POST'\)\{await init\(\);/, 'login should not block on init');
assert.doesNotMatch(bootstrapSource, /\}else\{\s*const stepStartedAt=Date\.now\(\);\s*await ensureDefaultCampuses\(\);/s, 'normal runtime cold start should not write default campuses');
assert.match(bootstrapSource, /function scheduleInitInBackground\(\)/, 'bootstrap module should expose a background init scheduler');
assert.match(bootstrapSource, /if\(isProductionRuntimeValue\)return;/, 'production request path should bypass background init dispatch');
assert.match(bootstrapSource, /if\(isProductionRuntimeValue\)\{[\s\S]*production request-ready without heavy bootstrap/, 'production init should short-circuit before heavy bootstrap work');
assert.match(bootstrapSource, /console\.log\(`\[api-init\] ensureDefaultCampuses done \$\{Date\.now\(\)-stepStartedAt\}ms \(total \$\{Date\.now\(\)-startedAt\}ms\)`\);/, 'init should log the ensureDefaultCampuses step duration');
assert.match(bootstrapSource, /console\.log\(`\[api-init\] bootstrapMabaoFinanceSeed done \$\{Date\.now\(\)-stepStartedAt\}ms \(total \$\{Date\.now\(\)-startedAt\}ms\)`\);/, 'init should log the finance seed step duration');
assert.doesNotMatch(apiSource, /if\(path==='\/load-all'&&method==='GET'\)\{[\s\S]*await maybeRepairImportedLedgerDuplicates\(\);/s, 'load-all should not trigger imported ledger repair from the request path');
assert.match(bootstrapSource, /console\.log\(`\[api-init\] prewarmHotScanCache dispatched \$\{Date\.now\(\)-stepStartedAt\}ms \(total \$\{Date\.now\(\)-startedAt\}ms\)`\);/, 'init should log when cache prewarm is dispatched');
assert.doesNotMatch(stateSource, /load-all/, 'front-end page loading should not fall back to the heavy load-all endpoint');
assert.match(stateSource, /const PERFORMANCE_PAGE_DATA_GUARD=\{[\s\S]*students:\['classes','schedule','courts'\][\s\S]*workbench:\['workbenchPage'\][\s\S]*\};/, 'page data performance guard should lock the current students stop-bleeding loading strategy');
assert.match(stateSource, /function assertPageDataPerformanceGuard\(\)/, 'state should expose a local guard against page-loading regressions');
assert.match(stateSource, /assertPageDataPerformanceGuard\(\);[\s\S]*const DATASET_LOADERS=/, 'page-loading guard should run before dataset loaders are used');

console.log('init performance guard tests passed');
