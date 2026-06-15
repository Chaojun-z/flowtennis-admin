const assert = require('assert');
const fs = require('fs');
const path = require('path');

const repoRoot = path.resolve(__dirname, '..');
const apiSource = fs.readFileSync(path.join(repoRoot, 'api/index.js'), 'utf8');
const corePageDataSource = fs.readFileSync(path.join(repoRoot, 'api/page-data/core-pages.js'), 'utf8');

assert.match(
  apiSource,
  /entitlementLedger:2000/,
  'production page read limits should define a dedicated entitlement ledger limit'
);

assert.match(
  corePageDataSource,
  /page-data\/purchases[\s\S]*cappedScan\(T_ENTITLEMENT_LEDGER, PRODUCTION_PAGE_READ_LIMITS\.entitlementLedger\)/,
  'purchase page aggregate endpoint should not use the default 500-row entitlement ledger cap'
);

assert.match(
  corePageDataSource,
  /pageData\.workbench[\s\S]*cappedScan\(T_ENTITLEMENT_LEDGER, PRODUCTION_PAGE_READ_LIMITS\.entitlementLedger\)/,
  'workbench aggregate endpoint should not use the default 500-row entitlement ledger cap'
);

console.log('purchases page entitlement ledger limit tests passed');
