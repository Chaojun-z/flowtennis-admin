const assert = require('assert');
const fs = require('fs');
const path = require('path');
const taxonomy = require('../public/assets/scripts/core/business-taxonomy.js');

const root = path.join(__dirname, '..');
const constantsSource = fs.readFileSync(path.join(root, 'public', 'assets', 'scripts', 'core', 'constants.js'), 'utf8');
const leadsSource = fs.readFileSync(path.join(root, 'public', 'assets', 'scripts', 'pages', 'leads.js'), 'utf8');
const matchesSource = fs.readFileSync(path.join(root, 'public', 'assets', 'scripts', 'pages', 'matches.js'), 'utf8');
const pricesSource = fs.readFileSync(path.join(root, 'public', 'assets', 'scripts', 'pages', 'prices.js'), 'utf8');
const courtsSource = fs.readFileSync(path.join(root, 'public', 'assets', 'scripts', 'pages', 'courts.js'), 'utf8');
const coachOpsSource = fs.readFileSync(path.join(root, 'public', 'assets', 'scripts', 'pages', 'coachops.js'), 'utf8');
const packagesSource = fs.readFileSync(path.join(root, 'public', 'assets', 'scripts', 'pages', 'packages.js'), 'utf8');
const entitlementsSource = fs.readFileSync(path.join(root, 'public', 'assets', 'scripts', 'pages', 'entitlements.js'), 'utf8');

assert.ok(taxonomy.BUSINESS_DICTIONARIES, 'business taxonomy should expose one dictionary registry');
assert.strictEqual(typeof taxonomy.optionList, 'function', 'business taxonomy should expose optionList helper');

assert.deepStrictEqual(
  taxonomy.optionList('leadSources').map(item => item.value),
  ['转介绍', '线下到店', '大众点评', '朝珺小红书', '网球兄弟小红书', '播客', '视频号', '抖音', '群友', '小班课转化', '孙老师', '未知']
);
assert.deepStrictEqual(
  taxonomy.optionList('matchStatuses').map(item => item.value),
  ['', 'open', 'full', 'booked', 'attendance_pending', 'fee_pending', 'settled', 'cancelled']
);
assert.deepStrictEqual(
  taxonomy.optionList('priceProductTypes').map(item => item.value),
  ['订场券', '体验课', '小班课', '课包']
);
assert.deepStrictEqual(
  taxonomy.optionList('smallClassTypes').map(item => item.value),
  ['single', 'bootcamp', 'dropin']
);
assert.deepStrictEqual(
  taxonomy.optionList('packageStatuses').map(item => item.value),
  ['active', 'inactive']
);
assert.deepStrictEqual(
  taxonomy.optionList('leadStatusAfter').map(item => item.value),
  ['新线索', '跟进中', '已约体验', '已体验待成交', '已成交', '已流失']
);
assert.deepStrictEqual(
  taxonomy.optionList('entitlementStatuses').map(item => item.value),
  ['active', 'depleted', 'voided']
);
assert.deepStrictEqual(
  taxonomy.optionList('membershipPlanStatuses').map(item => item.value),
  ['draft', 'active', 'inactive']
);
assert.deepStrictEqual(
  taxonomy.COURT_FINANCE_BUSINESS_TYPES,
  ['会员订场', '散客订场', '课程订场', '领导订场', '内部使用', '约球局']
);

[
  'SOURCES',
  'PRODUCT_TYPES',
  'STANDARD_COURSE_TYPE_OPTIONS',
  'EXPERIENCE_TYPES',
  'SMALL_CLASS_TYPE_OPTIONS',
  'STUDENT_TYPE_OPTIONS',
  'PACKAGE_STATUS_OPTIONS',
  'PACKAGE_TIME_BAND_OPTIONS',
  'LEAD_FOLLOWUP_TYPE_OPTIONS',
  'LEAD_STATUS_AFTER_OPTIONS',
  'ENTITLEMENT_STATUS_OPTIONS',
  'MEMBERSHIP_PLAN_STATUS_OPTIONS',
  'PAY_METHODS',
  'SCH_STATUSES',
  'CLS_STATUSES',
  'STUDENT_STATUS_LABELS'
].forEach(name => {
  assert.match(constantsSource, new RegExp(`const ${name}=BUSINESS_TAXONOMY\\.`), `${name} should be sourced from business taxonomy`);
});

assert.match(leadsSource, /function leadSourceOptions\(\)\{[\s\S]*optionList\('leadSources'\)/, 'lead source options should come from global business taxonomy');
assert.match(leadsSource, /function leadCustomerTypeOptions\(\)\{[\s\S]*optionList\('leadCustomerTypes'\)/, 'lead customer type options should come from global business taxonomy');
assert.match(leadsSource, /function leadDemandProductOptions\(\)\{[\s\S]*optionList\('leadDemandProducts'\)/, 'lead demand product options should come from global business taxonomy');
assert.match(leadsSource, /function leadIntentOptions\(\)\{[\s\S]*optionList\('leadIntentLevels'\)/, 'lead intent options should come from global business taxonomy');
assert.match(leadsSource, /function leadLevelOptions\(\)\{[\s\S]*optionList\('leadLevels'\)/, 'lead level options should come from global business taxonomy');
assert.match(leadsSource, /const preferred=FlowTennisBusinessTaxonomy\.values\('leadStages'\)/, 'lead stage statuses should come from global business taxonomy');
assert.match(matchesSource, /function matchStatusOptions\(\)\{[\s\S]*optionList\('matchStatuses'\)/, 'match status options should come from global business taxonomy');
assert.match(pricesSource, /function priceTypeOptions\(/, 'price page should expose taxonomy-backed price type options');
assert.match(pricesSource, /optionList\('priceChannels'\)/, 'price channels should come from global business taxonomy');
assert.match(pricesSource, /optionList\('priceProductTypes'\)/, 'price product types should come from global business taxonomy');
assert.match(pricesSource, /optionList\('priceBusinessTypes'\)/, 'price business types should come from global business taxonomy');
assert.match(pricesSource, /optionList\('priceStatuses'\)/, 'price statuses should come from global business taxonomy');
assert.match(packagesSource, /PACKAGE_STATUS_OPTIONS/, 'package statuses should come from global business taxonomy');
assert.match(packagesSource, /PACKAGE_TIME_BAND_OPTIONS/, 'package time bands should come from global business taxonomy');
assert.match(leadsSource, /function leadFollowupTypeOptions\(\)[\s\S]*LEAD_FOLLOWUP_TYPE_OPTIONS/, 'lead follow-up type options should come from global business taxonomy');
assert.match(leadsSource, /function leadStatusAfterOptions\(\)\{[\s\S]*return leadStageOptions\(\);[\s\S]*\}/, 'lead status-after options should reuse the global lead stage options');
assert.match(entitlementsSource, /ENTITLEMENT_STATUS_OPTIONS/, 'entitlement statuses should come from global business taxonomy');
assert.match(courtsSource, /MEMBERSHIP_PLAN_STATUS_OPTIONS/, 'membership plan statuses should come from global business taxonomy');
assert.match(courtsSource, /COURT_FINANCE_TRANSACTION_TYPES=FlowTennisBusinessTaxonomy\.TRANSACTION_TYPES/, 'court finance transaction types should come from global business taxonomy');
assert.match(courtsSource, /COURT_FINANCE_BUSINESS_TYPES=FlowTennisBusinessTaxonomy\.COURT_FINANCE_BUSINESS_TYPES/, 'court finance business types should come from global business taxonomy');
assert.match(coachOpsSource, /const transactionOrder=FlowTennisBusinessTaxonomy\.TRANSACTION_TYPES/, 'finance ledger transaction order should come from global business taxonomy');

console.log('business dictionary global tests passed');
