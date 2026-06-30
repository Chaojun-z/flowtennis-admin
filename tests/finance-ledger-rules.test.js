const assert = require('assert');
const fs = require('fs');
const path = require('path');

const source = fs.readFileSync(path.join(__dirname, '../public/assets/scripts/pages/coachops.js'), 'utf8');
const apiSource = fs.readFileSync(path.join(__dirname, '../api/index.js'), 'utf8');
const financeUnifiedRowsSource = fs.readFileSync(path.join(__dirname, '../server/read-models/finance-unified-rows.js'), 'utf8');

assert.doesNotMatch(source, /function financeLegacyUnifiedRows\(\)/, 'finance page must not keep frontend legacy stitching as an alternate ledger source');
assert.match(source, /function financeUnifiedRows\(\)\{\s*const snapshotRows=financeNormalizedRows\(\);[\s\S]*snapshotRows\.filter\(row=>financeMatchesCampusName\(row\.campusName\)\)[\s\S]*return \[\];\s*\}/, 'finance page must not fall back to frontend local stitching when backend finance snapshot rows are unavailable');
assert.doesNotMatch(source, /function financeUnifiedRows\(\)\{[\s\S]*return financeLegacyUnifiedRows\(\);[\s\S]*\}/, 'finance page standard rows must not use legacy local stitched rows');
assert.doesNotMatch(source, /function financeLegacySettlementRows\(\)/, 'finance settlement must not keep legacy schedule aggregation fallback');
assert.match(source, /function financeSettlementRows\(\)\{[\s\S]*financeSettlementRowsFromSnapshot\(\)\.filter\(row=>String\(row\.month\|\|'\'\)===monthValue&&financeMatchesCampusName\(row\.campusName\)\)/, 'finance settlement should prefer backend snapshot rows and filter them by month and campus');
assert.doesNotMatch(source, /return financeLegacySettlementRows\(\);/, 'finance settlement must not fall back to raw schedules when snapshot rows are unavailable');
assert.match(apiSource, /getFinancePageScheduleRows\(\)/, 'finance page should load schedule rows through a dedicated helper');
assert.doesNotMatch(apiSource, /const \[students,purchases,entitlements,entitlementLedger,courts,membershipOrders,membershipAccounts,schedule\]=await Promise\.all\([\s\S]*scanFirstRows\(T_SCHEDULE,\{limit:PRODUCTION_PAGE_READ_LIMITS\.schedule/, 'finance page settlement should not be capped to the generic schedule page limit');
assert.match(financeUnifiedRowsSource, /normalizeEntitlementLedgerRowsForView\(entitlementLedger\|\|\[\]\)\.filter\(row=>Number\(row\.lessonDelta\|\|0\)!==0\)/, 'finance course consumption should ignore zero-delta bookkeeping rows such as free absences');

console.log('finance ledger rules tests passed');
