const assert = require('assert');
const fs = require('fs');
const path = require('path');
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

assert.match(fnBody('toggleScheduleLocationType'), /renderScheduleVenueField\(\)/, 'switching back to in-campus lessons should re-render venue input strategy');
assert.match(fnBody('onScheduleCampusChange'), /renderScheduleVenueField\(\)[\s\S]*refreshSchEntitlementOptions\(\)/, 'changing schedule campus should refresh both venue strategy and entitlement recommendations');
assert.match(fnBody('openScheduleModal'), /消课时数/, 'schedule modal should use hour-based lesson copy');
assert.match(fnBody('openScheduleModal'), /readonly/, 'lesson hours should be driven by the selected time range');
assert.match(source, /function refreshScheduleTimeDerivedFields\(/, 'schedule modal should expose a shared time-derived refresh helper');
assert.match(fnBody('syncScheduleLessonCountFromTime'), /lessonUnitsText\(scheduleLessonUnitsFromFields\(\)\)/, 'lesson units should render fractional hours like 1.5');
assert.match(fnBody('refreshSchEntitlementOptions'), /scheduleId:editId\|\|''/, 'editing a schedule should tell the entitlement recommender which schedule is being edited');
assert.match(fnBody('refreshSchEntitlementOptions'), /lessonCount:parseFloat\(document\.getElementById\('sch_lc'\)\?\.value\)\|\|1/, 'entitlement recommendation should accept fractional lesson hours');
assert.match(fnBody('openCancelScheduleModal'), /确认取消/, 'schedule cancel should use a dedicated confirm modal instead of reopening the edit form');
assert.match(fnBody('openCancelScheduleModal'), /取消本节及后续未上课的循环课/, 'repeat schedules should expose a future-lessons cancel option');
assert.match(fnBody('confirmScheduleCancel'), /effectiveScheduleStatus\(item\)==='已排课'/, 'repeat cancellation should only touch not-yet-started lessons');
assert.match(fnBody('confirmScheduleCancel'), /scope==='future'/, 'repeat cancellation should support current-and-future scope');

console.log('schedule page view tests passed');
