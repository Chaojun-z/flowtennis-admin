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
  /function studentManualEntitlementActionsHtml\(/,
  'student package cards should reuse manual lesson adjustment actions'
);

assert.match(
  fnBody('studentEntitlementSummaryHtml'),
  /studentManualEntitlementActionsHtml\(e\)/,
  'student package cards should render manual consume and return actions per entitlement'
);

assert.match(
  fnBody('studentEntitlementSummaryHtml'),
  /<div class="student-package-head"><div class="student-package-title">[\s\S]*studentManualEntitlementActionsHtml\(e\)[\s\S]*<\/div><div class="student-package-meta">/,
  'student package card manual actions should sit on the right side of the package title'
);

assert.match(
  fnBody('studentManualEntitlementActionsHtml'),
  /student-package-action-link[\s\S]*手动消课[\s\S]*student-package-action-link[\s\S]*退回课时[\s\S]*student-package-actions/,
  'student manual package actions should render as small text links'
);

assert.doesNotMatch(
  fnBody('studentManualEntitlementActionsHtml'),
  /schedule-detail-action primary/,
  'student manual package actions should not render as large primary buttons'
);

assert.match(
  source,
  /function openManualEntitlementAdjustModal\(/,
  'manual lesson adjustment modal should exist'
);

assert.match(
  fnBody('openManualEntitlementAdjustModal'),
  /options\?\.source==='student'[\s\S]*openStudentDetail\('\$\{studentId\}'\)/,
  'manual lesson adjustment modal should support returning to student detail'
);

assert.match(
  fnBody('saveManualEntitlementAdjust'),
  /apiCall\('POST',`\/entitlements\/\$\{entitlementId\}\/manual-adjust`,data\)/,
  'manual lesson adjustment should save through the entitlement manual-adjust API'
);

assert.match(
  fnBody('saveManualEntitlementAdjust'),
  /loadedDatasets\.delete\('financePage'\)/,
  'manual lesson adjustment should invalidate finance snapshot data'
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
