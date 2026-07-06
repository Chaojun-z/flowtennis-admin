const assert = require('assert');
const fs = require('fs');
const path = require('path');

const pagesCss = fs.readFileSync(path.join(__dirname, '..', 'public', 'assets', 'styles', 'pages.css'), 'utf8');
const html = fs.readFileSync(path.join(__dirname, '..', 'public', 'index.html'), 'utf8');
const componentsSource = fs.readFileSync(path.join(__dirname, '..', 'public', 'assets', 'scripts', 'standard', 'components.js'), 'utf8');
const financeSource = fs.readFileSync(path.join(__dirname, '..', 'public', 'assets', 'scripts', 'pages', 'coachops.js'), 'utf8');

assert.match(
  html,
  /id="financeLedgerReady" class="section-stack" data-standard-list-shell="finance-ledger"[\s\S]*id="financeRevenuePanel" class="section-stack" data-standard-list-shell="finance-revenue"[\s\S]*id="financeRecognizedPanel" class="section-stack" data-standard-list-shell="finance-recognized"/,
  'finance ledger, revenue and recognized panels should keep the standard list shells'
);
assert.match(
  pagesCss,
  /body\.admin-mobile #page-finance\{[^}]*margin:0[^}]*padding:0[^}]*background:#F5F2F0/,
  'finance H5 outer page should use the standard mobile surface'
);
assert.match(
  pagesCss,
  /body\.admin-mobile #page-finance #financeLedgerPanel,body\.admin-mobile #page-finance #financeRevenuePanel,body\.admin-mobile #page-finance #financeRecognizedPanel,body\.admin-mobile #page-finance #financeSettlementPanel\{[^}]*min-width:0[^}]*max-width:100%/,
  'finance H5 panels should not overflow the viewport'
);
assert.match(
  pagesCss,
  /body\.admin-mobile #page-finance \.finance-loading-card\{[^}]*border-radius:10px[^}]*padding:16px/,
  'finance H5 loading card should use compact mobile spacing'
);
assert.match(
  pagesCss,
  /body\.admin-mobile #page-finance #financeSettlementPanel \.finance-settlement-toolbar\{[^}]*display:grid[^}]*grid-template-columns:1fr/,
  'finance settlement H5 toolbar should be a single-column mobile filter area'
);
assert.match(
  pagesCss,
  /body\.admin-mobile #page-finance #financeSettlementPanel \.finance-settlement-toolbar \.tms-filters\{[^}]*position:static!important[\s\S]*pointer-events:auto!important/,
  'finance settlement H5 filters should stay usable instead of opening as a desktop overlay'
);
['financeLedgerMobileCards','financeRevenueMobileCards','financeRecognizedMobileCards'].forEach(id=>{
  assert.match(componentsSource,new RegExp(`id="${id}" class="admin-h5-card-list"`),`${id} should be mounted inside finance standard shells`);
});
assert.match(financeSource,/function renderFinanceLedgerMobileCards\(rows\)[\s\S]*admin-h5-list-card[\s\S]*financeTransactionAmountHtml/, 'finance ledger H5 should render transaction cards');
assert.match(financeSource,/renderFinanceLedgerMobileCards\(slice\);/, 'finance ledger render should update H5 cards');
assert.match(financeSource,/function renderFinanceRevenueMobileCards\(rows\)[\s\S]*admin-h5-list-card[\s\S]*financeAmountText\(row\.actualAmount\)/, 'finance revenue H5 should render amount cards');
assert.match(financeSource,/renderFinanceRevenueMobileCards\(slice\);/, 'finance revenue render should update H5 cards');
assert.match(financeSource,/function renderFinanceRecognizedMobileCards\(rows\)[\s\S]*admin-h5-list-card[\s\S]*financeSignedAmountText\(row\.recognizedRevenueDelta\)/, 'finance recognized H5 should render recognized amount cards');
assert.match(financeSource,/renderFinanceRecognizedMobileCards\(slice\);/, 'finance recognized render should update H5 cards');
assert.match(
  pagesCss,
  /body\.admin-mobile #page-finance #financeLedgerPanel \.tms-table-card,body\.admin-mobile #page-finance #financeRevenuePanel \.tms-table-card,body\.admin-mobile #page-finance #financeRecognizedPanel \.tms-table-card\{display:none\}/,
  'finance H5 ledger tables should be replaced by card feeds'
);
assert.match(
  pagesCss,
  /body\.admin-mobile #page-finance \.admin-h5-card-list\{[^}]*display:flex[^}]*flex-direction:column/,
  'finance H5 card feeds should be visible on mobile'
);

console.log('admin h5 finance view tests passed');
