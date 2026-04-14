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
