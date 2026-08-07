const assert = require('assert');
const fs = require('fs');
const path = require('path');

const publicDir = path.join(__dirname, '../public');
const leadsSource = fs.readFileSync(path.join(publicDir, 'assets/scripts/pages/leads.js'), 'utf8');
const bootstrapSource = fs.readFileSync(path.join(publicDir, 'assets/scripts/core/bootstrap.js'), 'utf8');
const html = fs.readFileSync(path.join(publicDir, 'index.html'), 'utf8');

function fnBodyFrom(source, name){
  const starts = [`function ${name}(`, `async function ${name}(`]
    .map(pattern => source.indexOf(pattern))
    .filter(index => index !== -1);
  assert.ok(starts.length, `${name} should exist`);
  const start = Math.min(...starts);
  const nextFunction = source.indexOf('\nfunction ', start + 1);
  const nextAsync = source.indexOf('\nasync function ', start + 1);
  const candidates = [nextFunction, nextAsync].filter(index => index !== -1);
  const next = candidates.length ? Math.min(...candidates) : source.length;
  return source.slice(start, next);
}

function fnBody(name){
  return fnBodyFrom(leadsSource, name);
}

function assertBackgroundRefresh(name){
  const body = fnBody(name);
  assert.match(body, /onSuccess:/, `${name} should update UI on success before background refresh`);
  assert.match(body, /refreshLeadRuntimeInBackground\(/, `${name} should schedule lead runtime refresh in background`);
  assert.doesNotMatch(body, /refresh:\s*async/, `${name} should not block the mutation helper on refresh`);
  assert.doesNotMatch(body, /await refreshLeadRuntime\(/, `${name} should not wait for full lead refresh after API success`);
}

assert.match(leadsSource, /function refreshLeadRuntimeInBackground\(/, 'lead page should expose a background refresh helper');
assert.match(fnBody('refreshLeadRuntimeInBackground'), /refreshLeadRuntime\(\{\.\.\.options,waitForMetrics:true\}\)\.then/, 'background helper should not be awaited by callers');
assert.match(leadsSource, /function reopenLeadDetailIfStillOpen\(/, 'lead page should only reopen the same detail drawer after background refresh');

assertBackgroundRefresh('saveLead');
assert.match(fnBody('saveLead'), /if\(res\?\.lead\)upsertLeadLocal\(res\.lead\)/, 'lead save should merge the saved lead locally');
assert.match(fnBody('saveLead'), /if\(res\?\.followup\)upsertLeadFollowupLocal\(res\.followup\)/, 'new lead save should merge the initial follow-up locally');

assertBackgroundRefresh('saveLeadBasicFromDrawer');
assert.match(fnBody('saveLeadBasicFromDrawer'), /upsertLeadLocal\(lead\)/, 'drawer basic save should merge returned lead before reopening detail');

assertBackgroundRefresh('saveLeadFollowupFromDrawer');
assert.match(fnBody('saveLeadFollowupFromDrawer'), /upsertLeadFollowupLocal\(res\.followup\)/, 'drawer follow-up save should merge returned follow-up locally');
assert.match(fnBody('saveLeadFollowupFromDrawer'), /ensureLeadFollowupsForLead\(leadId,\{force:true\}\)\.then/, 'drawer follow-up save should refresh follow-up detail in background');

assertBackgroundRefresh('saveLeadFollowup');
assert.match(fnBody('saveLeadFollowup'), /upsertLeadFollowupLocal\(res\.followup\)/, 'modal follow-up save should merge returned follow-up locally');
assert.match(fnBody('upsertLeadFollowupLocal'), /loadedLeadFollowupDetailIds\.add/, 'local follow-up merge should make the drawer detail render immediately');

assertBackgroundRefresh('runLeadMerge');
assert.match(fnBody('runLeadMerge'), /upsertLeadLocal\(res\.primaryLead\)/, 'lead merge should merge the retained lead locally');
assert.match(fnBody('runLeadMerge'), /duplicateLeads[\s\S]*upsertLeadLocal/, 'lead merge should mark duplicate leads locally');

assertBackgroundRefresh('convertLeadToStudent');
assert.match(fnBody('convertLeadToStudent'), /upsertLeadStudentLocal\(res\.student\)/, 'student conversion should merge returned student locally');

assertBackgroundRefresh('convertLeadToCourt');
assert.match(fnBody('convertLeadToCourt'), /upsertLeadCourtLocal\(res\.court\)/, 'court conversion should merge returned court account locally');

assertBackgroundRefresh('unlinkLeadStudent');
assert.match(fnBody('unlinkLeadStudent'), /upsertLeadLocal\(res\.lead\)[\s\S]*upsertLeadStudentLocal\(res\.student\)/, 'student unlink should merge returned lead and student locally');

assertBackgroundRefresh('unlinkLeadCourt');
assert.match(fnBody('unlinkLeadCourt'), /upsertLeadLocal\(res\.lead\)[\s\S]*upsertLeadCourtLocal\(res\.court\)/, 'court unlink should merge returned lead and court locally');

assertBackgroundRefresh('saveLeadLinkStudent');
assert.match(fnBody('saveLeadLinkStudent'), /upsertLeadLocal\(res\.lead\)[\s\S]*upsertLeadStudentLocal\(res\.student\)/, 'student link should merge returned lead and student locally');

assertBackgroundRefresh('saveLeadLinkCourt');
assert.match(fnBody('saveLeadLinkCourt'), /upsertLeadLocal\(res\.lead\)[\s\S]*upsertLeadCourtLocal\(res\.court\)/, 'court link should merge returned lead and court locally');

assert.match(fnBody('runLeadImportCommit'), /runStandardMutation\('leadImportCommitBtn'/, 'lead import commit should use the standard mutation helper');
assert.match(fnBody('runLeadImportCommit'), /refreshLeadRuntimeInBackground\(\{withStudents:true,withCourts:true\},renderLeads\)/, 'lead import commit should refresh imported rows in the background');
assert.doesNotMatch(fnBody('runLeadImportCommit'), /await refreshLeadRuntime\(/, 'lead import commit should not block success on full refresh');

const doDeleteBody = fnBodyFrom(bootstrapSource, 'doDelete');
assert.match(doDeleteBody, /currentDelType==='lead'[\s\S]*renderLeads\(\)[\s\S]*refreshLeadRuntimeInBackground/, 'lead delete should only refresh the lead list and background refresh read models');
assert.match(doDeleteBody, /if\(currentDelType==='lead'\)\{[\s\S]*return;\s*\}\s*if\(!result\?\.purchaseVoid\)renderAll\(\);/, 'lead delete should return before the full app render path');

assert.match(html, /assets\/scripts\/core\/bootstrap\.js\?v=20260807-schedule-speed-feedback-v1/, 'index should bump the bootstrap script asset version');
assert.match(html, /assets\/scripts\/pages\/leads\.js\?v=20260807-leads-server-pagination-v1/, 'index should bump the lead script asset version');

console.log('leads speed feedback tests passed');
