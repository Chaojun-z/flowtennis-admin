const assert = require('assert');
const fs = require('fs');
const path = require('path');

const source = fs.readFileSync(path.join(__dirname, '../public/assets/scripts/pages/coachops.js'), 'utf8');

assert.match(source, /function financeLegacyUnifiedRows\(\)/, 'finance page should keep the legacy stitched rows as a guarded fallback');
assert.match(source, /function financeUnifiedRows\(\)\{\s*const snapshotRows=financeNormalizedRows\(\);\s*return snapshotRows\.length\?snapshotRows:financeLegacyUnifiedRows\(\);\s*\}/, 'finance page should prefer backend finance snapshot rows before falling back to local stitching');
assert.match(source, /function financeLegacySettlementRows\(\)/, 'finance settlement should keep the legacy schedule aggregation as a guarded fallback');
assert.match(source, /function financeSettlementRows\(\)\{[\s\S]*financeSettlementRowsFromSnapshot\(\)\.filter\(row=>String\(row\.month\|\|'\'\)===monthValue&&financeMatchesCampusName\(row\.campusName\)\)/, 'finance settlement should prefer backend snapshot rows and filter them by month and campus');
assert.match(source, /return financeLegacySettlementRows\(\);/, 'finance settlement should only fall back to raw schedules when snapshot rows are unavailable');

console.log('finance ledger rules tests passed');
