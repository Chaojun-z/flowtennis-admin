const assert = require('assert');
const fs = require('fs');
const path = require('path');
const { html, appSource: source } = require('./helpers/read-index-bundle');

const pagesCss = [
  '../public/assets/styles/components/filters.css',
  '../public/assets/styles/pages.css'
].map(file=>fs.readFileSync(path.join(__dirname, file), 'utf8')).join('\n');

function fnBody(name){
  const start = source.indexOf(`function ${name}(`);
  assert.notStrictEqual(start, -1, `${name} should exist`);
  const nextFunction = source.indexOf('\nfunction ', start + 1);
  const nextAsync = source.indexOf('\nasync function ', start + 1);
  const candidates = [nextFunction, nextAsync].filter(i => i !== -1);
  const next = candidates.length ? Math.min(...candidates) : -1;
  return source.slice(start, next === -1 ? source.length : next);
}
function standardConfigBlock(key) {
  const marker = `key:'${key}'`;
  const start = source.indexOf(marker);
  assert.notStrictEqual(start, -1, `${key} should have a standard list config`);
  const rest = source.slice(start);
  const next = rest.search(/\n    \{key:|\n  \];/);
  return next === -1 ? rest : rest.slice(0, next);
}

const coachShell = standardConfigBlock('coaches');

assert.match(html, /id="page-coaches" data-standard-list-shell="coaches"/, 'coach page should mount the standard list shell');
assert.match(coachShell, /search:\{id:'coachSearch'[\s\S]*placeholder:'搜索姓名、手机号'|search:\{id:'coachSearch'/, 'coach page should use the unified search field');
assert.match(coachShell, /<button class="tms-btn tms-btn-primary" onclick="openCoachModal\(null\)"/, 'coach add button should use the court-style primary button');
assert.match(coachShell, /bodyId:'coachTbody'/, 'coach page should use the standard table shell');
assert.match(html, /id="page-workbench"[\s\S]*id="workbenchBody"/, 'workbench should host the coach schedule shell');
assert.doesNotMatch(html, /id="page-myschedule"/, 'standalone my schedule page should be removed');
assert.doesNotMatch(html, /id="myScheduleStats"|id="mySchedulePrimarySection"|id="myScheduleSideSection"|id="myMobileSchedule"/, 'my schedule should remove the duplicate stat and list areas');
assert.match(fnBody('workbenchScheduleShell'), /看本周课程时间、类型和场地安排，点击课程块可直接查看详情。/, 'workbench schedule shell should show the weekly guide text next to the week controls');
assert.match(fnBody('renderMySchedule'), /slice\(11,16\)\}\$\{s\.endTime\?' - '\+s\.endTime\.slice\(11,16\)/, 'my schedule week cards should render the time range');
assert.match(fnBody('renderMySchedule'), /scheduleCourseType\(s\).*scheduleLocationText\(s\).*scheduleFeedbackLabel\(s\)/s, 'my schedule week cards should show course type, location, and feedback');
assert.match(pagesCss, /#page-coaches \.tms-table\s*\{[^}]*min-width:1000px/s, 'coach table should not inherit the wide court table min width');
assert.match(pagesCss, /#page-coaches \.tms-table-wrapper\s*\{[^}]*max-height:calc\(100vh - 190px\)/s, 'coach table should use more vertical space before scrolling');
assert.match(pagesCss, /\.tms-dropdown-menu[^}]*overscroll-behavior:contain/s, 'dropdown scrolling should not drag the modal or page behind it');
assert.match(coachShell, /label:'操作'[\s\S]*className:'tms-sticky-r'/, 'coach action header should stay visible on the right');
assert.match(coachShell, /label:'入职时间'/, 'coach table should show hire date');
assert.doesNotMatch(fnBody('renderCoaches'), /class="abtn"|✏️|🗑️|class="badge /, 'coach rows should not use old icon buttons or old badge style');
assert.match(fnBody('renderCoaches'), /renderStandardCellText/, 'coach rows should reuse court empty-value display rule');
assert.match(fnBody('renderCoaches'), /hireDate/, 'coach rows should render hire date');
assert.match(fnBody('renderCoaches'), /<span class="tms-tag/, 'coach status should render as a tms tag');
assert.match(fnBody('renderCoaches'), /class="tms-sticky-r[^"]*tms-action-cell"[\s\S]*openCoachModal[\s\S]*confirmDel/, 'coach action cells should keep edit/delete entries in the list');
assert.match(fnBody('renderCoaches'), /tms-action-link[\s\S]*编辑[\s\S]*删除/, 'coach actions should use text links');
assert.match(fnBody('openCoachModal'), /openStandardModal/, 'coach create/edit should use the standard modal frame');
assert.match(fnBody('openCoachModal'), /tms-section-header[\s\S]*tms-form-row[\s\S]*tms-form-label[\s\S]*tms-form-control/, 'coach modal should use court-style form fields');
assert.match(fnBody('openCoachModal'), /co_hireDate/, 'coach modal should include hire date field');
assert.match(fnBody('openCoachModal'), /courtDateButtonHtml\('co_hireDate'/, 'coach hire date should use the shared court-style date picker');
assert.doesNotMatch(fnBody('openCoachModal'), /confirmDel\([^)]*'coach'|删除|class="fgrid"|class="fg"|class="flabel"|class="mactions"/, 'coach modal should not include delete entry or old form classes');
assert.match(fnBody('scheduleTimeRangeControls'), /court-date-row[\s\S]*sch_date[\s\S]*sch_startTime[\s\S]*sch_endTime/, 'schedule modal should keep date and time controls on one row');
assert.match(fnBody('scheduleTimeRangeControls'), /white-space:nowrap/, 'schedule modal date and time separator should stay on one line');
assert.match(fnBody('saveCoach'), /hireDate:document\.getElementById\('co_hireDate'\)\.value/, 'coach save should include hire date');
assert.match(source, /function renderStandardDropdownHtml[\s\S]*onwheel="event\.stopPropagation\(\);event\.preventDefault\(\);this\.scrollTop \+= event\.deltaY"/, 'coach campus dropdown should consume wheel scrolling inside the menu');
assert.match(source, /renderStandardDropdownHtml\('co_campus','校区',\[\{value:'',label:'不选择'\},\.\.\.campusOptions\],rv\(c,'campus'\),true\)/, 'coach campus edit should preserve empty campus instead of defaulting to the first campus');
assert.doesNotMatch(fnBody('getFilteredCoaches'), /sameCampusValue|globalDateWithinRange/, 'coach list should not be hidden by global campus or time filters');

console.log('coach page view tests passed');
