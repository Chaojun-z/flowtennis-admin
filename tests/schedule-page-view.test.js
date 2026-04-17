const assert = require('assert');
const fs = require('fs');
const path = require('path');
const { appSource: source } = require('./helpers/read-index-bundle');
const styles = fs.readFileSync(path.join(__dirname, '..', 'public', 'assets', 'styles', 'pages.css'), 'utf8');

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
assert.match(source, /const FEEDBACK_POSTER_TEMPLATES\s*=/, 'feedback poster should define fixed template configs');
assert.match(source, /blueGreenDiagonal[\s\S]*minimalDarkGreen[\s\S]*retroCourt[\s\S]*blueprintBlue[\s\S]*minimalRacket[\s\S]*activeGreen/, 'feedback poster should expose the selected Gemini template styles');
assert.doesNotMatch(source, /粉蓝笔刷|专业白\(拍网\)|深蓝撞色|波普斜切/, 'feedback poster should remove the rejected poster styles');
assert.match(fnBody('drawFeedbackPoster'), /网球兄弟/, 'feedback poster should use the local brand name');
assert.match(fnBody('openFeedbackPosterModal'), /blueGreenDiagonal/, 'feedback poster modal should default to the first Gemini template');
assert.match(source, /function drawFeedbackPoster\(/, 'feedback poster should draw fixed templates with canvas');
assert.match(source, /function openFeedbackPosterModal\(/, 'feedback poster should expose a modal entry');
assert.match(source, /function downloadFeedbackPoster\(/, 'feedback poster should expose a direct download action');
assert.match(fnBody('openFeedbackPosterModal'), /下载图片[\s\S]*分享图片/, 'feedback poster modal should separate local download from system share');
assert.match(fnBody('shareFeedbackPoster'), /AbortError/, 'cancelled share should not be treated as a generation failure');
assert.match(styles, /::-webkit-scrollbar\{height:3px\}[\s\S]*max-height:58vh/, 'poster preview should fit the modal and use a thin horizontal scrollbar');
assert.match(fnBody('openFeedbackModal'), /生成海报/, 'saved feedback modal should show a poster entry');
assert.match(fnBody('openFeedbackModal'), /trialFieldsHtml/, 'trial conversion fields should be conditional');
assert.doesNotMatch(fnBody('openFeedbackModal'), /复制给学员/, 'feedback modal should not keep copy action after poster entry exists');
assert.doesNotMatch(fnBody('saveFeedback'), /openFeedbackPosterModal\(/, 'saving feedback should not force coach into poster generation');

console.log('schedule page view tests passed');
