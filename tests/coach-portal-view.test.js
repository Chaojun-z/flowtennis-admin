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
  /goPage\('postfeedback',this\)[\s\S]*?课后评价/,
  'coach sidebar should expose the new post-class feedback entry'
);
assert.doesNotMatch(
  source,
  /goPage\('myschedule',this\)[\s\S]*?我的课表/,
  'coach sidebar should no longer keep a dedicated my-schedule entry'
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
  /id="page-postfeedback"/,
  'coach post-class feedback page section should exist'
);
assert.doesNotMatch(
  source,
  /id="page-myschedule"/,
  'coach portal should remove the standalone my-schedule page section'
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
  /coach-wb-stats-row[\s\S]*workbenchScheduleShell/,
  'coach workbench should render stat cards plus the shared weekly schedule shell'
);

assert.match(
  fnBody('renderWorkbench'),
  /renderMySchedule\(\)/,
  'coach workbench should hydrate the shared weekly schedule after rendering the shell'
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
  source,
  /function renderPostClassFeedback\(/,
  'coach portal should expose a dedicated post-class feedback renderer'
);

assert.match(
  fnBody('renderPostClassFeedback'),
  /coach-wb-board/,
  'post-class feedback page should render the migrated weekly feedback board'
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
  /is-ended/,
  'coach weekly schedule should mark ended lessons with a dedicated ended-state class'
);

assert.match(
  fnBody('renderMySchedule'),
  /scheduleSource==='订场陪打'[\s\S]*陪打/,
  'coach weekly schedule should label companion bookings as dedicated companion tasks'
);

assert.match(
  fnBody('workbenchScheduleShell'),
  /workbenchScheduleMobileList/,
  'coach workbench should provide a mobile-friendly week schedule list for phones'
);

assert.match(
  fnBody('workbenchScheduleShell'),
  /id="workbenchScheduleMobileList"[^>]*coach-mobile-list/,
  'coach workbench mobile schedule list should use the dedicated mobile card container'
);

assert.match(
  fnBody('workbenchScheduleShell'),
  /看本周课程时间、类型和场地安排，点击课程块可直接查看详情。[\s\S]*workbenchMetricHelpHtml/,
  'coach workbench should place the weekly guide text and metric help beside the week controls'
);

assert.match(
  pagesCss,
  /\.my-schedule-week \.wg-block\.is-ended\{[\s\S]*background:[\s\S]*border-color:[\s\S]*color:/,
  'coach weekly schedule should render ended lesson blocks as grey cards'
);

assert.match(
  html,
  /id="myStudentMobileList"[^>]*coach-mobile-list[\s\S]*id="myClassMobileList"[^>]*coach-mobile-list/,
  'coach my students and my classes should provide dedicated mobile card lists'
);

assert.match(
  pagesCss,
  /body\.coach-mobile #page-workbench \.coach-wb-stats-row,body\.coach-mobile #page-postfeedback \.coach-wb-stats-row\{display:grid;grid-template-columns:repeat\(2,minmax\(0,1fr\)\)/,
  'coach workbench should switch to a true mobile two-column stat grid'
);

assert.match(
  pagesCss,
  /body\.coach-mobile #page-workbench \.coach-wb-grid,body\.coach-mobile #page-postfeedback \.coach-wb-grid\{grid-template-columns:1fr/,
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
  /function workbenchScheduleShell\(/,
  'coach portal should expose a shared weekly schedule shell helper for workbench'
);

assert.match(
  fnBody('myStudentLessonCount'),
  /sumScheduleLessonUnits/,
  'coach my students cumulative lessons should count lesson units, not schedule rows'
);

assert.match(
  source,
  /function myStudentLessonRecordHtml\(/,
  'coach portal should expose a my-student lesson record helper'
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
  /if\(isCoach\)\{[\s\S]*if\(!\['workbench','postfeedback','mystudents','myclasses'\]\.includes\(currentPage\)\)currentPage='workbench'/,
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
