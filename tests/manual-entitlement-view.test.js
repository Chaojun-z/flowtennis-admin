const assert = require('assert');
const { appSource: source } = require('./helpers/read-index-bundle');

function fnBody(name){
  const start = source.indexOf(`function ${name}(`);
  assert.notStrictEqual(start, -1, `${name} should exist`);
  const nextFunction = source.indexOf('\nfunction ', start + 1);
  const nextAsync = source.indexOf('\nasync function ', start + 1);
  const candidates = [nextFunction, nextAsync].filter(i => i !== -1);
  const next = candidates.length ? Math.min(...candidates) : -1;
  return source.slice(start, next === -1 ? source.length : next);
}

const purchaseDetail = fnBody('openPurchaseDetailModal');

assert.match(
  purchaseDetail,
  /openManualEntitlementAdjustModal\('\$\{ent\.id\}', 'manual_consume'\)/,
  'purchase detail should expose manual lesson consume for active entitlements'
);

assert.match(
  purchaseDetail,
  /openManualEntitlementAdjustModal\('\$\{ent\.id\}', 'manual_return'\)/,
  'purchase detail should expose manual lesson return for consumed entitlements'
);

assert.match(
  source,
  /function openManualEntitlementAdjustModal\(/,
  'manual lesson adjustment modal should exist'
);

assert.match(
  fnBody('saveManualEntitlementAdjust'),
  /apiCall\('POST',`\/entitlements\/\$\{entitlementId\}\/manual-adjust`,data\)/,
  'manual lesson adjustment should save through the entitlement manual-adjust API'
);

assert.match(
  fnBody('patchManualEntitlementAdjustResult'),
  /entitlementLedger\.unshift\(result\.ledger\)/,
  'manual lesson adjustment should update the local ledger immediately'
);

assert.match(
  source,
  /function isManualEntitlementLedgerRow\(/,
  'student lesson record should detect manual lesson ledger rows'
);

assert.match(
  fnBody('studentLessonRecordHasConcreteTime'),
  /isManualEntitlementLedgerRow\(row\)/,
  'student lesson record should show manual lesson rows even without schedule time'
);

assert.match(
  fnBody('studentLessonRecordPackageHtml'),
  /手动消课|手动退回/,
  'student lesson record should label manual lesson rows clearly'
);

console.log('manual entitlement view tests passed');
