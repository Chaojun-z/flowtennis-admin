const assert = require('assert');
const fs = require('fs');
const path = require('path');

const repoRoot = path.join(__dirname, '..');
const read = file => fs.readFileSync(path.join(repoRoot, file), 'utf8');

function fn(source, name) {
  const start = source.indexOf(`function ${name}(`);
  assert.notStrictEqual(start, -1, `${name} should exist`);
  const bodyStart = source.indexOf('{', source.indexOf(')', start));
  let depth = 0;
  for (let i = bodyStart; i < source.length; i += 1) {
    if (source[i] === '{') depth += 1;
    if (source[i] === '}') {
      depth -= 1;
      if (depth === 0) return source.slice(start, i + 1);
    }
  }
  throw new Error(`${name} body incomplete`);
}

const state = read('public/assets/scripts/core/state.js');
const coachops = read('public/assets/scripts/pages/coachops.js');
const schedule = read('public/assets/scripts/pages/schedule.js');
const purchases = read('public/assets/scripts/pages/purchases.js');
const packages = read('public/assets/scripts/pages/packages.js');
const entitlements = read('public/assets/scripts/pages/entitlements.js');
const corePages = read('server/page-data/core-pages.js');
const financeSnapshot = read('server/page-data/finance-snapshot.js');
const unified = read('server/read-models/unified-page-views.js');

assert.match(unified, /function buildCoachOpsUnifiedView/, 'coach ops standard view must live in backend read model');
assert.match(unified, /function buildPurchaseUnifiedView/, 'purchase standard view must live in backend read model');
assert.match(unified, /function buildPackageUnifiedView/, 'package standard view must live in backend read model');
assert.match(unified, /function buildEntitlementUnifiedView/, 'entitlement standard view must live in backend read model');
assert.match(unified, /function buildFinancePrepaidView/, 'finance prepaid standard view must live in backend read model');

assert.match(corePages, /coachOpsUnifiedView:buildCoachOpsUnifiedView/, 'coachops page-data must expose backend unified coach ops rows');
assert.match(corePages, /purchaseUnifiedView:buildPurchaseUnifiedView/, 'purchases page-data must expose backend unified purchase rows');
assert.match(corePages, /packageUnifiedView:buildPackageUnifiedView/, 'purchases page-data must expose backend unified package rows');
assert.match(corePages, /entitlementUnifiedView:buildEntitlementUnifiedView/, 'purchases page-data must expose backend unified entitlement rows');
assert.match(financeSnapshot, /financePrepaidView:\s*buildFinancePrepaidView\(financeNormalizedRows,\s*\{\s*membershipBalanceRows:\s*storedValueBalanceRows\s*\}\)/, 'finance snapshot must expose backend prepaid rows and current membership balance summary');

assert.match(state, /let coachOpsUnifiedView=/, 'frontend state should keep backend coach ops unified view');
assert.match(state, /let purchaseUnifiedView=/, 'frontend state should keep backend purchase unified view');
assert.match(state, /let packageUnifiedView=/, 'frontend state should keep backend package unified view');
assert.match(state, /let entitlementUnifiedView=/, 'frontend state should keep backend entitlement unified view');
assert.match(state, /let financePrepaidView=/, 'frontend state should keep backend finance prepaid view');

assert.match(fn(coachops, 'coachOpsRows'), /coachOpsUnifiedView/, 'coachOpsRows must read backend unified coach rows');
assert.doesNotMatch(fn(coachops, 'coachOpsRows'), /billableSchedules\(\)|schedules\.filter|sumScheduleLessonUnits|pendingFeedbackCount|hasScheduleFeedback/, 'coachOpsRows must not calculate workload from raw schedules');
assert.doesNotMatch(fn(coachops, 'coachCourseTypeDistributionText'), /new Map|scheduleLessonUnits|rows\.forEach/, 'coach course distribution text must not locally aggregate schedule rows');
assert.doesNotMatch(fn(coachops, 'coachOpsComparisonText'), /billableSchedules\(\)|sumScheduleLessonUnits|range\.end\.getTime/, 'coach comparison must not calculate previous period locally');

assert.match(fn(schedule, 'coachLateSettlementRows'), /financeSettlementRowsFromSnapshot/, 'late settlement must read backend finance settlement snapshot');
assert.doesNotMatch(fn(schedule, 'coachLateSettlementRows'), /schedules\.filter|reduce\(|forEach\(/, 'late settlement must not aggregate raw schedules in frontend');
assert.doesNotMatch(coachops, /function financeLegacySettlementRows\(/, 'finance page must not keep legacy schedule settlement calculator');
assert.doesNotMatch(fn(coachops, 'financeSettlementRows'), /financeLegacySettlementRows\(\)/, 'finance settlement must not fall back to frontend schedule calculator');

assert.match(fn(purchases, 'getFilteredPurchases'), /purchaseUnifiedRows\(\)/, 'purchase list must read unified purchase rows');
assert.doesNotMatch(fn(purchases, 'getFilteredPurchases'), /return purchases\.filter/, 'purchase list must not filter raw purchases directly');
assert.match(fn(packages, 'packagePurchaseCount'), /packageUnifiedRows\(\)/, 'package purchase count must read unified package rows');
assert.doesNotMatch(fn(packages, 'packagePurchaseCount'), /purchases\.filter|entitlements\.filter/, 'package purchase count must not join raw purchases and entitlements in frontend');
assert.match(fn(entitlements, 'renderEntitlements'), /entitlementUnifiedRows\(\)/, 'entitlement page must render backend unified entitlement rows');
assert.doesNotMatch(fn(entitlements, 'renderEntitlements'), /entitlements\.filter/, 'entitlement page must not filter raw entitlements directly');

assert.match(fn(coachops, 'financePrepaidRows'), /financePrepaidUnifiedRows\(\)/, 'prepaid rows must read backend finance prepaid view');
assert.doesNotMatch(fn(coachops, 'renderFinancePrepaidBalance'), /reduce\(|lessonDeferred|storedDeferred|financeDeferredRowsFromUnifiedLedger/, 'prepaid cards must not summarize in frontend');
assert.doesNotMatch(coachops, /function financeDeferredRowsFromUnifiedLedger\(/, 'frontend must not keep prepaid deferred calculator');

console.log('unified page source hard guard tests passed');
