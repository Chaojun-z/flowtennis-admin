const assert = require('assert');
const fs = require('fs');
const path = require('path');

const apiSource = fs.readFileSync(path.join(__dirname, '../api/index.js'), 'utf8');

assert.match(apiSource, /const ENABLE_RUNTIME_TABLE_ENSURE = process\.env\.ENABLE_RUNTIME_TABLE_ENSURE === 'true';/, 'api should expose a dedicated runtime table ensure switch');
assert.match(apiSource, /const ENABLE_MABAO_FINANCE_SEED_BOOTSTRAP = process\.env\.ENABLE_MABAO_FINANCE_SEED_BOOTSTRAP === 'true';/, 'finance seed bootstrap should be opt-in only');
assert.match(apiSource, /if\(ENABLE_RUNTIME_TABLE_ENSURE\|\|ENABLE_TABLE_BOOTSTRAP\)\{[\s\S]*?for\(const t of RUNTIME_ENSURED_TABLES\)await mkTable\(t\);/s, 'init should only run runtime table ensure when explicit switch is enabled');
assert.doesNotMatch(apiSource, /for\(const t of RUNTIME_ENSURED_TABLES\)await mkTable\(t\);\s*if\(ENABLE_TABLE_BOOTSTRAP\)/, 'init should not unconditionally ensure runtime tables before bootstrap flag check');
assert.match(apiSource, /const ENABLE_DEFAULT_PRICE_PLAN_BOOTSTRAP = process\.env\.ENABLE_DEFAULT_PRICE_PLAN_BOOTSTRAP === 'true';/, 'api should expose a dedicated default price plan bootstrap switch');
assert.match(apiSource, /if\(ENABLE_DEFAULT_PRICE_PLAN_BOOTSTRAP\)\{[\s\S]*?await syncDefaultPricePlans\(\)\.catch\(err=>console\.error\('\[api-bootstrap\] sync default price plans failed',err\)\);/s, 'init should only block on default price plan sync when explicit switch is enabled');
assert.doesNotMatch(apiSource, /if\(ENABLE_TABLE_BOOTSTRAP\)\{[\s\S]*?\}\s*await syncDefaultPricePlans\(\)\.catch\(err=>console\.error\('\[api-bootstrap\] sync default price plans failed',err\)\);/, 'init should not always block cold start on default price plan sync');
assert.doesNotMatch(apiSource, /if\(path==='\/auth\/login'&&method==='POST'\)\{await init\(\);/, 'login should not block on init');
assert.doesNotMatch(apiSource, /\}else\{\s*const stepStartedAt=Date\.now\(\);\s*await ensureDefaultCampuses\(\);/s, 'normal runtime cold start should not write default campuses');
assert.match(apiSource, /function scheduleInitInBackground\(\)/, 'api should expose a background init scheduler');
assert.match(apiSource, /console\.log\(`\[api-init\] ensureDefaultCampuses done \$\{Date\.now\(\)-stepStartedAt\}ms \(total \$\{Date\.now\(\)-startedAt\}ms\)`\);/, 'init should log the ensureDefaultCampuses step duration');
assert.match(apiSource, /console\.log\(`\[api-init\] bootstrapMabaoFinanceSeed done \$\{Date\.now\(\)-stepStartedAt\}ms \(total \$\{Date\.now\(\)-startedAt\}ms\)`\);/, 'init should log the finance seed step duration');
assert.match(apiSource, /console\.log\(`\[api-init\] prewarmHotScanCache dispatched \$\{Date\.now\(\)-stepStartedAt\}ms \(total \$\{Date\.now\(\)-startedAt\}ms\)`\);/, 'init should log when cache prewarm is dispatched');

console.log('init performance guard tests passed');
