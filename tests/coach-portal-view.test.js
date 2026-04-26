const assert = require('assert');
const fs = require('fs');
const path = require('path');
const { html, appSource: source } = require('./helpers/read-index-bundle');

const pagesCss = fs.readFileSync(path.join(__dirname, '..', 'public', 'assets', 'styles', 'pages.css'), 'utf8');
function fnBody(name){
  const start = source.indexOf(`function ${name}(`);
  assert.notStrictEqual(start, -1, `${name} should exist`);
  const nextFunction = source.indexOf('\nfunction ', start + 1);
  const nextAsync = source.indexOf('\nasync function ', start + 1);
  const candidates = [nextFunction, nextAsync].filter(i => i !== -1);
  const next = candidates.length ? Math.min(...candidates) : -1;
  return source.slice(start, next === -1 ? source.length : next);
}

assert.match(
  source,
  /goPage\('workbench',this\)[\s\S]*?工作台/,
  'coach sidebar should expose the new workbench entry'
);

assert.match(
  source,
  /<title>FlowTennis 网球兄弟工作台<\/title>/,
  'browser title should use the FlowTennis workbench title'
);

assert.match(
  source,
  /id="page-workbench"/,
  'coach workbench page section should exist'
);

assert.match(
  source,
  /id="page-mystudents"[\s\S]*class="tms-audit-note"[\s\S]*class="tms-table-card"[\s\S]*class="tms-table-wrapper"[\s\S]*class="tms-table"/,
  'my students page should reuse the management-side note and table shell'
);

assert.match(
  source,
  /id="page-myclasses"[\s\S]*class="tms-audit-note"[\s\S]*class="tms-table-card"[\s\S]*class="tms-table-wrapper"[\s\S]*class="tms-table"/,
  'my classes page should reuse the management-side note and table shell'
);

assert.match(
  source,
  /本月课时[\s\S]*?本周课时[\s\S]*?今天课时[\s\S]*?本月反馈[\s\S]*?未反馈[\s\S]*?本月体验课转化率/,
  'coach workbench should show the six manager-facing summary cards'
);

assert.match(
  source,
  /function workbenchMetricHelpHtml\([\s\S]*coach-wb-help-btn[\s\S]*本月已结束体验课中，后续已购买任意产品的学员占比/,
  'coach workbench should expose a metric help trigger with the updated conversion-rate definition'
);

assert.match(
  fnBody('workbenchTrialConvertedByPurchase'),
  /purchases\.some\([\s\S]*purchaseDate\|\|p\.createdAt[\s\S]*studentId/,
  'trial conversion rate should be derived from later package purchases instead of internal judgment fields'
);

assert.match(
  fnBody('renderWorkbench'),
  /coach-wb-page-header[\s\S]*本周课程待办[\s\S]*coach-wb-current-time[\s\S]*coach-wb-board/,
  'coach workbench should render the weekly shell directly'
);
assert.match(
  fnBody('renderWorkbench'),
  /localDateKey\(week\[0\]\)[\s\S]*localDateKey\(week\[6\]\)/,
  'coach workbench should derive week bounds from local business dates instead of UTC ISO strings'
);
assert.doesNotMatch(
  fnBody('renderWorkbench'),
  /toISOString\(\)\.slice\(0,10\)/,
  'coach workbench should not use UTC ISO keys for week grouping'
);

assert.match(
  fnBody('renderWorkbench'),
  /本周课程待办（\$\{weekLabel\}）/,
  'coach workbench should expose dynamic weekly progress text'
);

assert.match(
  fnBody('workbenchSection'),
  /coach-wb-card[\s\S]*coach-wb-row1[\s\S]*coach-wb-name[\s\S]*coach-wb-row3[\s\S]*coach-wb-card-footer/,
  'coach workbench cards should use the gemini-style course card structure'
);

assert.doesNotMatch(
  fnBody('workbenchSection'),
  /state\.code==='later'\?'查看反馈'/,
  'future coach workbench courses should not label the primary action as feedback'
);

assert.doesNotMatch(
  fnBody('workbenchSection'),
  /state\.code==='pending'\|\|\(state\.code==='done'&&hasScheduleFeedback\(s\)\)\|\|state\.code==='later'\?`openFeedbackModal\('\$\{s\.id\}'\)`/,
  'future coach workbench courses should not jump into the feedback modal'
);

assert.match(
  fnBody('workbenchScheduleState'),
  /跨校区提醒：/,
  'coach workbench should surface cross-campus travel reminders'
);
assert.doesNotMatch(
  fnBody('workbenchScheduleState'),
  /今日后续/,
  'coach workbench should not expose the removed later-state label'
);

assert.match(
  fnBody('renderWorkbench'),
  /coach-wb-day-section[\s\S]*coach-wb-day-label[\s\S]*coach-wb-grid/,
  'coach workbench should group cards by week day'
);

assert.match(
  source,
  /function hasTrialConversionDecision\(fb\)/,
  'coach portal should expose a helper for trial conversion completion'
);

assert.match(
  fnBody('openMyStudentDetail'),
  /tms-section-header[\s\S]*上课记录[\s\S]*setCourtModalFrame/,
  'my student detail should reuse the management modal frame and include lesson history'
);

assert.match(
  fnBody('openMyStudentDetail'),
  /备注[\s\S]*s\.remark/,
  'my student detail should read the normalized backend remark field'
);

assert.match(
  fnBody('renderMyStudents'),
  /recentFb\?\.mainIssues\|\|recentFb\?\.knowledgePoint\|\|s\.remark\|\|''/,
  'my students list should read the normalized backend remark field'
);

assert.match(
  source,
  /function openMyClassDetail\(/,
  'coach portal should provide a dedicated my class detail modal'
);

assert.match(
  fnBody('openMyClassDetail'),
  /tms-section-header[\s\S]*setCourtModalFrame/,
  'my class detail should reuse the management modal frame and section style'
);

assert.match(
  source,
  /推荐产品[\s\S]*?转化意愿[\s\S]*?是否需要跟进/,
  'course detail should show trial conversion summary fields'
);

assert.match(
  source,
  /校区[\s\S]*?场地[\s\S]*?班次[\s\S]*?体验课[\s\S]*?待反馈/,
  'coach schedule views should render the required course info fields'
);

assert.match(
  fnBody('myStudentLessonCount'),
  /historicalImportedLessonUnitsForStudent/,
  'coach-side cumulative lesson count should also include imported lesson consumption'
);

assert.match(
  fnBody('renderMySchedule'),
  /scheduleAbsentText/,
  'coach weekly schedule should show absent count for class schedules'
);

assert.match(
  fnBody('renderMySchedule'),
  /scheduleSource==='订场陪打'[\s\S]*陪打/,
  'coach weekly schedule should label companion bookings as dedicated companion tasks'
);
assert.doesNotMatch(
  fnBody('renderMySchedule'),
  /toISOString\(\)\.slice\(0,10\)/,
  'coach weekly schedule should not use UTC ISO keys for day columns'
);
assert.match(
  source,
  /function scheduleRepeatBadgeText\(schedule\)/,
  'coach portal should expose a repeat schedule badge helper'
);
assert.match(
  fnBody('workbenchSection'),
  /scheduleRepeatBadgeText\(s\)[\s\S]*is-stone/,
  'coach workbench cards should expose repeat schedule badges in the main view'
);
assert.match(
  fnBody('renderMySchedule'),
  /repeatText=scheduleRepeatBadgeText\(s\)[\s\S]*wgb-type/,
  'coach weekly schedule blocks should show repeat schedule markers'
);

assert.match(
  html,
  /my-schedule-mobile-list/,
  'coach schedule should provide a mobile-friendly list for phones'
);

assert.match(
  html,
  /id="myScheduleMobileList"[^>]*coach-mobile-list/,
  'coach mobile schedule list should use the dedicated mobile card container'
);

assert.match(
  pagesCss,
  /coach-mobile-week-timeline[\s\S]*coach-mobile-time-rail[\s\S]*coach-mobile-day-column/,
  'coach mobile schedule should provide an ios-like timeline with a left time rail and day columns'
);

assert.match(
  html,
  /id="myStudentMobileList"[^>]*coach-mobile-list[\s\S]*id="myClassMobileList"[^>]*coach-mobile-list/,
  'coach my students and my classes should provide dedicated mobile card lists'
);

assert.match(
  pagesCss,
  /body\.coach-mobile #page-workbench \.coach-wb-stats-row\{display:grid;grid-template-columns:repeat\(2,minmax\(0,1fr\)\)/,
  'coach workbench should switch to a true mobile two-column stat grid'
);

assert.match(
  pagesCss,
  /body\.coach-mobile #page-workbench \.coach-wb-grid\{grid-template-columns:1fr/,
  'coach workbench cards should stack as single-column cards on mobile'
);

assert.match(
  fnBody('renderMyStudents'),
  /myStudentMobileList/,
  'coach my students renderer should fill the mobile list container'
);

assert.match(
  fnBody('renderMyClasses'),
  /myClassMobileList/,
  'coach my classes renderer should fill the mobile list container'
);

assert.match(pagesCss, /coach-mobile-week-timeline/, 'coach mobile schedule should define the week timeline shell style');
assert.match(pagesCss, /coach-mobile-time-rail/, 'coach mobile schedule should define the left time rail style');
assert.match(pagesCss, /coach-mobile-day-column/, 'coach mobile schedule should define the day column style');

assert.match(
  html,
  /累计上课<\/th>[\s\S]*最后上课<\/th>[\s\S]*课包进度<\/th>[\s\S]*剩余课时<\/th>/,
  'coach my students should split lesson count, last lesson, package progress and remaining lessons'
);

assert.match(
  fnBody('renderMyStudents'),
  /visibleStudentCount[\s\S]*ownerStudentCount[\s\S]*substituteStudentCount[\s\S]*monthLessons[\s\S]*totalLessons/,
  'coach my students stats should distinguish visible, owner, substitute and lesson counts'
);

assert.match(
  fnBody('renderMyStudents'),
  /const myStus=students\.filter\(s=>coachName\(s\.primaryCoach\)===cn2\|\|myStudentLessonCount\(s,cn2\)>0\)/,
  'coach my students should render only assigned students or students actually taught by the coach'
);

assert.match(
  source,
  /function myStudentLessonRecordHtml\(/,
  'coach portal should expose a my-student lesson record helper'
);

assert.match(
  fnBody('myStudentLessonCount'),
  /sumScheduleLessonUnits/,
  'coach my students cumulative lessons should count lesson units, not schedule rows'
);

assert.match(
  fnBody('renderWorkbench'),
  /window\.coachWorkbenchStats|coachWorkbenchStats/,
  'coach workbench should read the backend standard stats payload'
);

assert.doesNotMatch(
  fnBody('renderWorkbench'),
  /monthTrialConverted|monthTrialRows|monthTrialRate|pendingFeedbackCount=endedRows/,
  'coach workbench should not re-compute manager metrics on the frontend'
);

assert.match(
  fnBody('workbenchScheduleState'),
  /workbenchState/,
  'coach workbench cards should prefer the backend workbenchState enum'
);

assert.doesNotMatch(
  fnBody('workbenchScheduleState'),
  /code:'done'|label:'已完成'/,
  'coach workbench state machine should remove the done state'
);

assert.doesNotMatch(
  fnBody('renderMyStudents'),
  /累计上课 \$\{myStudentLessonCount/,
  'coach my students table should render numeric lesson count only'
);

assert.match(
  fnBody('normalizeCurrentPageForRole'),
  /if\(isCoach\)\{[\s\S]*if\(!\['workbench','myschedule','mystudents','myclasses'\]\.includes\(currentPage\)\)currentPage='workbench'/,
  'quiet sync should keep the current coach page instead of forcing workbench'
);

assert.doesNotMatch(
  html,
  /正式课/,
  'coach portal should not keep the old 正式课 wording'
);

assert.match(
  html,
  /私教课|体验课|训练营|大师课/,
  'coach portal should render the fixed course type labels'
);

console.log('coach portal view tests passed');
