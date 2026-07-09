const assert = require('assert');
const fs = require('fs');
const path = require('path');

const source = fs.readFileSync(path.join(__dirname, '../public/assets/scripts/core/state.js'), 'utf8');

function blockFor(name){
  const pattern = new RegExp(`if\\(name==='${name}'\\)\\{([\\s\\S]*?)(?:loadedDatasets\\.add\\('${name}'\\)|markDatasetLoaded\\('${name}',requestKey\\));[\\s\\S]*?return;[\\s\\S]*?\\n    \\}`, 'm');
  const match = source.match(pattern);
  assert(match, `${name} handler should exist`);
  return match[0];
}

const financeBlock = blockFor('financePage');
const courtsBlock = blockFor('courtsPage');

assert.doesNotMatch(
  financeBlock,
  /setDatasetValue\('(students|schedule|entitlements|entitlementLedger|financialLedger|coaches|products|purchases|packages|courts|membershipAccounts|membershipOrders|membershipBenefitLedger|membershipAccountEvents)'/,
  'finance page payload must not clear existing global datasets when those fields are absent'
);

assert.doesNotMatch(
  courtsBlock,
  /setDatasetValue\('(membershipAccounts|coaches|pricePlans)'/,
  'courts page payload must not clear coach, member, or price datasets with placeholder empty arrays'
);

console.log('dataset overwrite guard passed');
