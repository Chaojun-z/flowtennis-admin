const assert = require('assert');
const fs = require('fs');
const path = require('path');

const repoRoot = path.join(__dirname, '..');
const read = file => fs.readFileSync(path.join(repoRoot, file), 'utf8');

const html = read('public/index.html');
const standardComponentsSource = read('public/assets/scripts/standard/components.js');
const stateSource = read('public/assets/scripts/core/state.js');
const coachOpsSource = read('public/assets/scripts/pages/coachops.js');
const leadsSource = read('public/assets/scripts/pages/leads.js');
const studentsSource = read('public/assets/scripts/pages/students.js');
const scheduleSource = read('public/assets/scripts/pages/schedule.js');
const courtsSource = read('public/assets/scripts/pages/courts.js');
const purchasesSource = read('public/assets/scripts/pages/purchases.js');
const coachPortalSource = read('public/assets/scripts/pages/coach-portal.js');
const legacyIntentTypeLabel = ['意向', '类型'].join('');
const legacyStudentNameLabel = ['学员', '姓名'].join('');
const legacyConsultDemandLabel = ['咨询', '需求'].join('');

function fnBody(source, name) {
  const start = source.indexOf(`function ${name}(`);
  assert.notStrictEqual(start, -1, `${name} should exist`);
  const nextFunction = source.indexOf('\nfunction ', start + 1);
  const nextAsync = source.indexOf('\nasync function ', start + 1);
  const candidates = [nextFunction, nextAsync].filter(i => i !== -1);
  const next = candidates.length ? Math.min(...candidates) : -1;
  return source.slice(start, next === -1 ? source.length : next);
}

[
  'leads',
  'students',
  'schedule',
  'coachschedule',
  'coachops',
  'operations',
  'finance',
  'matches',
  'coaches',
  'admin-users',
  'courts',
  'memberships',
  'membership-orders',
  'membership-ledger',
  'membership-plans',
  'products',
  'packages',
  'purchases',
  'entitlements',
  'campusmgr',
  'prices',
  'workbench',
  'postfeedback',
  'mystudents',
  'myclasses'
].forEach(page => {
  assert.match(html, new RegExp(`id="page-${page}"`), `${page} should be part of the platform coverage list`);
});

[
  'leads',
  'package-students',
  'trial-students',
  'courts',
  'memberships',
  'matches',
  'schedule',
  'coachschedule',
  'coachops',
  'operations',
  'finance',
  'packages',
  'membership-plans',
  'coaches',
  'campusmgr',
  'admin-users',
  'prices'
].forEach(page => {
  const escaped = page.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  assert.match(stateSource, new RegExp(`['"]?${escaped}['"]?:\\[`), `${page} should declare page data requirements`);
});

assert.doesNotMatch(
  [
    fnBody(leadsSource, 'leadBasicInfoReadonlyHtml'),
    fnBody(leadsSource, 'leadBasicInfoFormHtml'),
    fnBody(leadsSource, 'openLeadModal'),
    fnBody(leadsSource, 'renderLeadImportPreviewBody')
  ].join('\n'),
  new RegExp(legacyIntentTypeLabel),
  'lead visible labels should use 意向等级 instead of the legacy intent label'
);

assert.doesNotMatch(
  [fnBody(scheduleSource, 'openScheduleModal'), fnBody(scheduleSource, 'scheduleDetailInfoHtml')].join('\n'),
  new RegExp(legacyStudentNameLabel),
  'schedule visible identity labels should use 姓名 instead of the legacy student-name label'
);

assert.doesNotMatch(
  [fnBody(studentsSource, 'studentLeadSummaryHtml'), fnBody(courtsSource, 'courtLeadSummaryHtml')].join('\n'),
  new RegExp(legacyConsultDemandLabel),
  'lead summary blocks should use 需求产品 instead of the legacy demand label'
);

assert.doesNotMatch(
  fnBody(purchasesSource, 'openPurchaseDetailModal'),
  /录入时间/,
  'purchase details should not expose internal system insertion time'
);

assert.doesNotMatch(
  fnBody(coachPortalSource, 'workbenchMetricHelpHtml'),
  /任意产品/,
  'coach workbench trial conversion help should use the standard formal course package definition'
);

assert.doesNotMatch(
  fnBody(courtsSource, 'renderMembershipLedgerAuditPage'),
  /renderStandardCellText\(l\.membershipOrderRef\)/,
  'membership benefit ledger should not display raw membership order ids'
);

assert.doesNotMatch(
  fnBody(courtsSource, 'refreshMembershipBenefitConsumePreview'),
  /\$\{row\.membershipOrderRef\}/,
  'membership benefit consume preview should not display raw membership order ids'
);

assert.match(
  fnBody(leadsSource, 'leadStatsData'),
  /const total=Array\.isArray\(list\)\?list\.length:0[\s\S]*leadTeachingSummaryValue\('historicalStudentCount'\)[\s\S]*leadTeachingSummaryValue\('activeStudentCount'\)/,
  'lead stats should use current backend lead rows for lead count and backend teaching summary for student stats'
);

assert.match(
  fnBody(coachOpsSource, 'operationsCoachTrialConversionText'),
  /operationsPageData\?\.coach\?\.rows/,
  'coach workload trial conversion should read the operations read model'
);

[
  ['admin-users', "optionList('adminUserRoles')"],
  ['admin-users', "optionList('adminUserDataScopes')"],
  ['coaches', "optionList('coachStatuses')"],
  ['packages', "optionList('packageTimeScopes')"],
  ['packages', "optionList('packageClassSizes')"],
  ['prices', "optionList('priceVenueSpaceTypes')"],
  ['prices', "optionList('priceDateTypes')"]
].forEach(([page, snippet]) => {
  const source = page === 'admin-users'
    ? read('public/assets/scripts/pages/admin-users.js')
    : page === 'coaches'
      ? read('public/assets/scripts/pages/coaches.js')
      : page === 'packages'
        ? read('public/assets/scripts/pages/packages.js')
        : read('public/assets/scripts/pages/prices.js');
  assert.ok(source.includes(snippet), `${page} should use shared dropdown dictionary ${snippet}`);
});

assert.match(
  standardComponentsSource,
  /data-standard-list-shell="leads"|key:'leads'/,
  'standard list shell should keep leads in the shared page configuration'
);

console.log('platform data unification guard tests passed');
