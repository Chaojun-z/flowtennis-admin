const assert = require('assert');
const fs = require('fs');
const path = require('path');

const stateSource = fs.readFileSync(path.join(__dirname, '../public/assets/scripts/core/state.js'), 'utf8');

assert.match(stateSource, /let financeOverviewData=null,financeNormalizedLedgerRows=\[\],financeSettlementSummaryRows=\[\];/, 'finance state should define snapshot-safe defaults for ledger rows and settlement rows');
assert.match(stateSource, /function financeNormalizedRows\(\)\{\s*return Array\.isArray\(financeNormalizedLedgerRows\)\?financeNormalizedLedgerRows:\[\];\s*\}/, 'finance state should expose a safe snapshot ledger accessor');
assert.match(stateSource, /function financeSettlementRowsFromSnapshot\(\)\{\s*return Array\.isArray\(financeSettlementSummaryRows\)\?financeSettlementSummaryRows:\[\];\s*\}/, 'finance state should expose a safe snapshot settlement accessor');
assert.match(stateSource, /financeNormalizedLedgerRows=Array\.isArray\(data\.financeNormalizedRows\)\?data\.financeNormalizedRows:\[\];/, 'finance page data load should accept backend normalized ledger snapshot rows');
assert.match(stateSource, /financeSettlementSummaryRows=Array\.isArray\(data\.financeSettlementRows\)\?data\.financeSettlementRows:\[\];/, 'finance page data load should accept backend settlement snapshot rows');
assert.match(stateSource, /financeOverviewData=null;financeNormalizedLedgerRows=\[\];financeSettlementSummaryRows=\[\];/, 'finance state reset should clear the whole finance snapshot');

console.log('finance runtime guard tests passed');
