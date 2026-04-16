const assert = require('assert');
const fs = require('fs');
const path = require('path');

const html = fs.readFileSync(path.join(__dirname, '..', 'public', 'index.html'), 'utf8');
function fnBody(name){
  const start = html.indexOf(`function ${name}(`);
  assert.notStrictEqual(start, -1, `${name} should exist`);
  const nextFunction = html.indexOf('\nfunction ', start + 1);
  const nextAsync = html.indexOf('\nasync function ', start + 1);
  const candidates = [nextFunction, nextAsync].filter(i => i !== -1);
  const next = candidates.length ? Math.min(...candidates) : -1;
  return html.slice(start, next === -1 ? html.length : next);
}

assert.match(
  html,
  /goPage\('workbench',this\)[\s\S]*?工作台/,
  'coach sidebar should expose the new workbench entry'
);

assert.match(
  html,
  /<title>FlowTennis 网球兄弟工作台<\/title>/,
  'browser title should use the FlowTennis workbench title'
);

assert.match(
  html,
  /id="page-workbench"/,
  'coach workbench page section should exist'
);

assert.match(
  html,
  /id="page-mystudents"[\s\S]*class="tms-audit-note"[\s\S]*class="tms-table-card"[\s\S]*class="tms-table-wrapper"[\s\S]*class="tms-table"/,
  'my students page should reuse the management-side note and table shell'
);

assert.match(
  html,
  /id="page-myclasses"[\s\S]*class="tms-audit-note"[\s\S]*class="tms-table-card"[\s\S]*class="tms-table-wrapper"[\s\S]*class="tms-table"/,
  'my classes page should reuse the management-side note and table shell'
);

assert.match(
  html,
  /今日课程[\s\S]*?即将开始[\s\S]*?待反馈[\s\S]*?体验课待判断/,
  'coach workbench should show four priority cards'
);

assert.match(
  fnBody('renderWorkbench'),
  /coach-wb-page-header[\s\S]*coach-wb-current-time[\s\S]*亟待处理[\s\S]*今日后续[\s\S]*已完成/,
  'coach workbench should render the gemini-style grouped shell directly'
);

assert.match(
  fnBody('renderWorkbench'),
  /今日全部课程（已上 \$\{counts\.completed\} \/ 共 \$\{todayRows\.length\} 节）/,
  'coach workbench should expose dynamic daily progress text'
);

assert.match(
  fnBody('workbenchSection'),
  /coach-wb-card[\s\S]*coach-wb-row1[\s\S]*coach-wb-name[\s\S]*coach-wb-row3[\s\S]*coach-wb-card-footer/,
  'coach workbench cards should use the gemini-style course card structure'
);

assert.match(
  fnBody('workbenchScheduleState'),
  /跨校区提醒：/,
  'coach workbench should surface cross-campus travel reminders'
);

assert.match(
  fnBody('renderWorkbench'),
  /亟待处理[\s\S]*今日后续[\s\S]*已完成/,
  'coach workbench should group cards into urgent, later, and done sections'
);

assert.match(
  html,
  /function hasTrialConversionDecision\(fb\)/,
  'coach portal should expose a helper for trial conversion completion'
);

assert.match(
  fnBody('openMyStudentDetail'),
  /tms-section-header[\s\S]*setCourtModalFrame/,
  'my student detail should reuse the management modal frame and section style'
);

assert.match(
  html,
  /function openMyClassDetail\(/,
  'coach portal should provide a dedicated my class detail modal'
);

assert.match(
  fnBody('openMyClassDetail'),
  /tms-section-header[\s\S]*setCourtModalFrame/,
  'my class detail should reuse the management modal frame and section style'
);

assert.match(
  html,
  /推荐产品[\s\S]*?转化意愿[\s\S]*?是否需要运营跟进/,
  'course detail should show trial conversion summary fields'
);

assert.match(
  html,
  /校区[\s\S]*?场地[\s\S]*?班次[\s\S]*?体验课[\s\S]*?待反馈/,
  'coach schedule views should render the required course info fields'
);

assert.match(
  fnBody('renderMySchedule'),
  /scheduleAbsentText/,
  'coach weekly schedule should show absent count for class schedules'
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
  html,
  /id="myStudentMobileList"[^>]*coach-mobile-list[\s\S]*id="myClassMobileList"[^>]*coach-mobile-list/,
  'coach my students and my classes should provide dedicated mobile card lists'
);

assert.match(
  html,
  /body\.coach-mobile #page-workbench \.coach-wb-stats-row\{display:grid;grid-template-columns:repeat\(2,minmax\(0,1fr\)\)/,
  'coach workbench should switch to a true mobile two-column stat grid'
);

assert.match(
  html,
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
