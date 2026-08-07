const assert = require('assert');
const { appSource } = require('./helpers/read-index-bundle');

function fnBody(source, name){
  const start = source.indexOf(`function ${name}(`);
  const asyncStart = source.indexOf(`async function ${name}(`);
  const realStart = start === -1 ? asyncStart : (asyncStart === -1 ? start : Math.min(start, asyncStart));
  assert.notStrictEqual(realStart, -1, `${name} should exist`);
  const nextFunction = source.indexOf('\nfunction ', realStart + 1);
  const nextAsync = source.indexOf('\nasync function ', realStart + 1);
  const candidates = [nextFunction, nextAsync].filter(i => i !== -1);
  const next = candidates.length ? Math.min(...candidates) : -1;
  return source.slice(realStart, next === -1 ? source.length : next);
}

[
  'saveCampus',
  'saveCoach',
  'saveAdminUser',
  'savePricePlan',
  'togglePricePlanStatus',
  'saveProduct',
  'savePackage',
  'savePurchase',
  'savePurchaseEdit',
  'voidPurchase',
  'saveMembershipPlan',
  'saveCourt',
  'saveCourtFinanceRecord',
  'saveLead',
  'saveLeadFollowup',
  'runLeadImportCommit',
  'saveSchedule',
  'confirmScheduleCancel',
  'saveCoachProposal',
  'saveFeedback',
  'saveScheduleDetailSectionEdit',
  'saveStudentBenefit',
  'saveManualEntitlementAdjust',
  'resetAdminUserPassword',
  'saveMembershipOrder',
  'saveMembershipBenefit',
  'voidMembership',
  'doDelete'
].forEach(name => {
  assert.match(fnBody(appSource, name), /runStandardMutation\(/, `${name} should use the global mutation helper`);
});

assert.match(fnBody(appSource, 'doDelete'), /closeOnSuccess:true/, 'standard delete flow should close confirm only after a successful delete');
assert.doesNotMatch(fnBody(appSource, 'doDelete'), /catch\(e\)\{toast\('删除失败/, 'standard delete flow should not keep a local mutation catch branch');

console.log('standard mutation flow tests passed');
