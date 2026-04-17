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

assert.match(source, /function scheduleConfirmRuleMeta\(/, 'schedule page should expose a confirm-rule helper');
assert.match(source, /function buildRepeatScheduleSeeds\(/, 'schedule page should expose a repeat schedule helper');
assert.match(fnBody('openScheduleModal'), /sch_repeatEnabled/, 'schedule modal should allow enabling repeat scheduling');
assert.match(fnBody('openScheduleModal'), /每周重复/, 'schedule modal should describe weekly repeat scheduling');
assert.match(fnBody('openScheduleModal'), /确认规则/, 'schedule modal should show the confirm rule in plain language');
assert.match(fnBody('openScheduleModal'), /教练迟到免费/, 'schedule modal should support marking coach-late free lessons');
assert.match(fnBody('openScheduleModal'), /教练承担场地费/, 'schedule modal should capture coach late field fee');
assert.match(fnBody('scheduleSaveConfirmText'), /确认截止/, 'schedule save confirm copy should show the confirm deadline');
assert.match(fnBody('scheduleSaveConfirmText'), /迟到免费/, 'schedule save confirm copy should show coach-late free status');
assert.match(fnBody('saveSchedule'), /buildRepeatScheduleSeeds\(/, 'saving schedules should fan out repeat seeds when enabled');
assert.match(fnBody('saveSchedule'), /coachLateFree/, 'saving schedules should persist coach late fields');
assert.match(fnBody('openScheduleDetail'), /确认规则/, 'schedule detail should show the applied confirm rule');
assert.match(fnBody('openScheduleDetail'), /教练迟到处理/, 'schedule detail should show coach late settlement info');
assert.match(source, /function openCoachLateSettlementModal\(/, 'schedule page should expose coach late settlement modal');
assert.match(source, /迟到月结/, 'schedule page should expose coach late monthly settlement entry');
assert.doesNotMatch(source, /id="page-schedule"[\s\S]*?openCoachLateSettlementModal\(\)[\s\S]*?id="page-coachops"/, 'late monthly settlement should not be a primary schedule-table action');
assert.match(source, /id="page-coachops"[\s\S]*?openCoachLateSettlementModal\(\)/, 'late monthly settlement entry should live in coach operations');
assert.match(fnBody('openCoachLateSettlementModal'), /late-settlement-summary/, 'late settlement modal should show a compact summary');
assert.match(fnBody('openCoachLateSettlementModal'), /迟到次数/, 'late settlement summary should include late count');
assert.match(fnBody('openCoachLateSettlementModal'), /迟到分钟/, 'late settlement summary should include late minutes');
assert.match(fnBody('openCoachLateSettlementModal'), /承担合计/, 'late settlement summary should include payable total');
assert.match(fnBody('openCoachLateSettlementModal'), /late-settlement-table/, 'late settlement modal should use a scoped compact table');
assert.match(fnBody('openCoachLateSettlementModal'), /late-settlement-empty/, 'late settlement modal should use a compact empty state');

console.log('schedule page view tests passed');
