const assert = require('assert');
const fs = require('fs');
const path = require('path');

const publicDir = path.join(__dirname, '../public');
const bootstrapSource = fs.readFileSync(path.join(publicDir, 'assets/scripts/core/bootstrap.js'), 'utf8');
const scheduleSource = fs.readFileSync(path.join(publicDir, 'assets/scripts/pages/schedule.js'), 'utf8');
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

const saveScheduleBody = fnBodyFrom(scheduleSource, 'saveSchedule');
assert.match(saveScheduleBody, /runStandardMutation\('scheduleSaveBtn'/, 'schedule save should use the global mutation helper for loading and duplicate-click protection');
assert.match(saveScheduleBody, /noteScheduleLocalMutation\(\)[\s\S]*renderAfterScheduleMutation\(\)/, 'schedule save should update local rows before follow-up rendering');
assert.doesNotMatch(saveScheduleBody, /await loadPageDataAndRender\('schedule'|await loadPageDataAndRender\(currentPage/, 'schedule save should not wait on a full page reload after API success');

const cancelScheduleBody = fnBodyFrom(scheduleSource, 'confirmScheduleCancel');
assert.match(cancelScheduleBody, /runStandardMutation\('scheduleCancelBtn'[\s\S]*loadingText:'取消中…'/, 'schedule cancel should show loading and prevent duplicate clicks');
assert.match(cancelScheduleBody, /mergeScheduleSaveResult\(result,item\.id\)[\s\S]*noteScheduleLocalMutation\(\)/, 'schedule cancel should merge changed rows locally before refreshing views');
assert.doesNotMatch(cancelScheduleBody, /renderAll\(\)|loadPageDataAndRender/, 'schedule cancel should not trigger a full app refresh');

const deleteBody = fnBodyFrom(bootstrapSource, 'doDelete');
assert.match(deleteBody, /else if\(currentDelType==='schedule'\)\{schedules=schedules\.filter\(u=>u\.id!==currentDelId\);[\s\S]*noteScheduleLocalMutation\(\)[\s\S]*setDatasetValue\('schedule',schedules\)/, 'schedule delete should update the local schedule dataset immediately');
assert.match(deleteBody, /if\(currentDelType==='schedule'\)\{[\s\S]*renderAfterScheduleMutation\(\)[\s\S]*return;\s*\}\s*if\(!result\?\.purchaseVoid\)renderAll\(\);/, 'schedule delete should return before the full app render path');

assert.match(html, /assets\/scripts\/core\/bootstrap\.js\?v=20260831-purchase-records-v1/, 'index should bust stale cached bootstrap.js after schedule speed feedback fixes');

console.log('schedule speed feedback tests passed');
