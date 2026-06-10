const assert = require('assert');
const fs = require('fs');
const path = require('path');
const { appSource: source } = require('./helpers/read-index-bundle');

const css = fs.readFileSync(path.join(__dirname, '../public/assets/styles/pages.css'), 'utf8');

function fnBody(name){
  const start = source.indexOf(`function ${name}(`);
  assert.notStrictEqual(start, -1, `${name} should exist`);
  const nextFunction = source.indexOf('\nfunction ', start + 1);
  const nextAsync = source.indexOf('\nasync function ', start + 1);
  const candidates = [nextFunction, nextAsync].filter(i => i !== -1);
  const next = candidates.length ? Math.min(...candidates) : -1;
  return source.slice(start, next === -1 ? source.length : next);
}

assert.match(source, /function openStandardDetailDrawer\(/, 'detail side drawer shell should be a standard component');
assert.match(source, /function renderDetailDrawerHero\(/, 'detail drawer header should be shared');
assert.match(source, /function renderDetailDrawerTabs\(/, 'detail drawer tabs should be shared');
assert.match(source, /function renderDetailDrawerCard\(/, 'detail drawer cards should be shared');
assert.match(source, /function renderDetailDrawerField\(/, 'detail drawer readonly fields should be shared');
assert.match(source, /function renderDetailDrawerInput\(/, 'detail drawer edit fields should be shared');
assert.match(source, /function renderDetailDrawerTable\(/, 'detail drawer records should use a shared table renderer');
assert.match(source, /function renderDetailDrawerTimeline\(/, 'detail drawer timeline should be shared');
assert.match(source, /openStudentDrawer[\s\S]*openStandardDetailDrawer/, 'student create, edit and detail should share the standard drawer shell');
assert.match(source, /openScheduleDetail[\s\S]*openStandardDetailDrawer/, 'schedule detail should use the standard side drawer shell');
assert.match(source, /student-drawer-overlay[\s\S]*schedule-drawer-overlay/, 'student drawer should apply the same drawer style class as schedule');
assert.match(source, /基本信息[\s\S]*课包\/上课记录[\s\S]*权益记录/, 'student detail drawer should keep the agreed three tabs');
assert.match(source, /基本信息[\s\S]*课包\/上课记录[\s\S]*权益记录/, 'student package tab should be named package / lesson records');
assert.match(source, /studentDetailActiveTab==='basic'[\s\S]*studentDetailBasicTabHtml\(s\)[\s\S]*studentDetailActiveTab==='orders'[\s\S]*studentDetailOrdersTabHtml\(s\)[\s\S]*studentDetailBenefitsTabHtml\(s\)/, 'student detail drawer should map tabs to basic, package orders and benefit records');
assert.match(source, /function openStudentModal\(id='',mode='edit'\)/, 'student form should support create and edit states through one drawer function');
assert.match(source, /studentDetailBasicTabHtml\(s\)[\s\S]*openStudentModal\('\$\{s\.id\}'\)/, 'student detail should turn view into edit without leaving the drawer');
assert.match(source, /function studentBasicInfoFormHtml\(/, 'student basic info should have a shared edit form renderer');
assert.match(source, /studentDetailEditingSection==='basic'[\s\S]*studentBasicInfoFormHtml\(s\)/, 'basic info card should switch into edit mode in place');
assert.doesNotMatch(source, /studentTeachingInfoHtml\(s\)/, 'student basic tab should no longer render teaching summary');
assert.match(source, /let studentReminderModeRequestSeq=0/, 'student reminder mode updates should ignore stale responses');
assert.match(source, /function setStudentReminderModeSaving\(/, 'student reminder mode updates should provide immediate pending feedback');
assert.match(fnBody('updateStudentReminderMode'), /mergeStudentReminderUpdate\(\{id:studentId,officialAccountReminderMode:mode[\s\S]*openStudentDetail\(studentId\)[\s\S]*setStudentReminderModeSaving\(true\)/, 'student reminder mode should update local UI immediately');
assert.match(fnBody('updateStudentReminderMode'), /if\(requestSeq!==studentReminderModeRequestSeq\)return/, 'student reminder mode should not show stacked toasts for stale clicks');
assert.match(source, /let studentReminderLinkGenerating=false/, 'student reminder bind link should guard duplicate clicks');
assert.match(fnBody('generateStudentReminderBindLink'), /studentReminderLinkGenerating=true[\s\S]*复制中/, 'student reminder bind link should show immediate click feedback');
assert.match(source, /复制绑定链接/, 'student reminder bind button copy should use the shorter label');
assert.match(source, /titleHtml:`服务号提醒偏好<span class="tms-tag/, 'student reminder status tag should sit beside the card title');
assert.doesNotMatch(source, /stu\.notes\?`运营备注/, 'student drawer hero should not show operation notes');
assert.doesNotMatch(fnBody('studentDetailBasicTabHtml'), /studentDetailMetricsHtml\(s\)/, 'student metrics should not stay on the basic tab');
assert.match(fnBody('studentDetailOrdersTabHtml'), /studentDetailMetricsHtml\(s\)/, 'student metrics should move to the package / lesson tab');
assert.match(fnBody('studentBasicInfoReadonlyHtml'), /studentDetailFieldHtml\('备注'/, 'student notes should render as a normal readonly field');
assert.doesNotMatch(fnBody('studentBasicInfoReadonlyHtml'), /studentDetailBlockHtml\('备注'/, 'student notes should not render as a block box');
assert.match(source, /studentDetailOrdersTabHtml\(s\)[\s\S]*useGrid:false/, 'student lesson records should span the full drawer width');
assert.match(fnBody('studentLessonRecordHtml'), /renderDetailDrawerTimeline\(items,\{emptyText:'暂无上课记录'\}\)/, 'student lesson records should use the shared drawer timeline');
assert.match(source, /studentDetailBenefitsTabHtml\(s\)[\s\S]*useGrid:false/, 'student benefit records should span the full drawer width');
assert.match(source, /studentBenefitListTableHtml\(s\)[\s\S]*renderDetailDrawerTable/, 'student benefit list should use the shared drawer table');
assert.match(source, /studentBenefitGrantTableHtml\(s\)[\s\S]*renderDetailDrawerTable/, 'student benefit grant records should use the shared drawer table');
assert.match(source, /studentBenefitConsumeTableHtml\(s\)[\s\S]*renderDetailDrawerTable/, 'student benefit consume records should use the shared drawer table');
assert.match(source, /权益列表[\s\S]*权益发放记录[\s\S]*权益消耗记录/, 'student benefit tab should show list, grant records and consume records');
assert.doesNotMatch(source, /studentDetailBenefitsTabHtml\(s\)[\s\S]*课包核销记录/, 'student benefit tab should not duplicate package lesson ledger records');
assert.doesNotMatch(source, /归属 \$\{esc\(renderStandardEmptyText\(ownerCoach\)\)\}/, 'student package order should show coach name without owner prefix');
assert.doesNotMatch(source, /student-benefit-list/, 'student benefit records should not use custom list cards');
assert.match(css, /\.overlay\.student-drawer-overlay/, 'student drawer should have scoped overlay styles');
assert.match(css, /\.modal\.modal-court\.modal-schedule-drawer/, 'shared drawer visual rules should come from the schedule drawer styling');
assert.match(css, /\.student-reminder-section\.schedule-detail-card/, 'student reminder should use the same card surface as basic info');
assert.match(css, /\.student-reminder-option\{[\s\S]*border:0[\s\S]*background:transparent/, 'student reminder options should look like radios, not button cards');
assert.match(css, /\.student-lesson-timeline-item::before\{[\s\S]*left:6px[\s\S]*background:#ECE7E1/, 'student lesson timeline line should align through dot center and use card border color');
assert.match(css, /\.student-lesson-title\{[^}]*font-size:13px/, 'student lesson title should use 13px text');
assert.match(css, /\.student-package-title\{[^}]*font-size:13px/, 'student package title should use 13px text');

console.log('student drawer view tests passed');
