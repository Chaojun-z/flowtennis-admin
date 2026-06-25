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
function cssRule(selector){
  const start = styles.indexOf(selector);
  assert.notStrictEqual(start, -1, `${selector} should exist`);
  const end = styles.indexOf('}', start);
  assert.notStrictEqual(end, -1, `${selector} rule should close`);
  return styles.slice(start, end + 1);
}

const openPackageModal = fnBody('openPackageModal');
const openPackageDetail = fnBody('openPackageDetail');
const packageBoardCardHtml = fnBody('packageBoardCardHtml');

assert.match(packageBoardCardHtml, /openPackageDetail\('\$\{p\.id\}'\)">查看/, 'package cards should expose a read-only detail drawer entry');
assert.doesNotMatch(packageBoardCardHtml, /openPackageModal\('\$\{p\.id\}'\)">编辑/, 'package cards should not keep edit action');
assert.match(packageBoardCardHtml, /openPackageDetail\('\$\{p\.id\}'\)">查看[\s\S]*deactivatePackage\('\$\{p\.id\}'\)">下架/, 'package cards should keep only view and deactivate actions');
assert.match(openPackageModal, /openStandardDetailDrawer\(/, 'package create/edit should open as the standard right-side drawer');
assert.match(openPackageModal, /modal-schedule-drawer/, 'package create/edit should reuse the schedule detail drawer shell');
assert.match(openPackageModal, /schedule-drawer-overlay/, 'package create/edit should slide in from the right like schedule detail');
assert.match(source, /function packageDrawerHeaderHtml\([\s\S]*renderDetailDrawerHero/, 'package create/edit should use the shared drawer hero');
assert.match(openPackageModal, /renderDetailDrawerFormCard\('基础属性'[\s\S]*renderDetailDrawerFormCard\('规格与价格'[\s\S]*renderDetailDrawerFormCard\('时间规则'[\s\S]*renderDetailDrawerFormCard\('教练和场地'/, 'package create/edit should keep all package fields inside schedule-style cards');
assert.match(openPackageModal, /schedule-detail-card-actions[\s\S]*取消[\s\S]*class="schedule-detail-action primary btn-save"[\s\S]*保存/, 'package save actions should sit in the drawer card header using schedule detail action styles');
assert.doesNotMatch(openPackageModal, /schedule-detail-action danger[\s\S]*下架/, 'package drawer should not show deactivate action in the header');
assert.match(openPackageModal, /package-drawer-danger-help/, 'locked purchased packages should show the warning with red styling');
assert.match(openPackageModal, /注意：该课包已有购买记录/, 'locked purchased package warning should start with attention copy');
assert.match(openPackageModal, /packageCampusPickerHtml/, 'package campus selection should use the new drawer choice UI');
assert.match(openPackageModal, /packageCoachPickerHtml/, 'package coach selection should use the new drawer choice UI');
assert.doesNotMatch(openPackageModal, /setCourtModalFrame\(id\?'编辑课包':'创建课包'/, 'package create/edit should not use the old centered modal frame');
assert.match(openPackageDetail, /openStandardDetailDrawer\(/, 'package view should open as the standard right-side drawer');
assert.match(openPackageDetail, /modal-schedule-drawer/, 'package view should reuse the schedule detail drawer shell');
assert.match(openPackageDetail, /renderDetailDrawerCard\('基础属性'[\s\S]*renderDetailDrawerCard\('规格与价格'[\s\S]*renderDetailDrawerCard\('时间规则'[\s\S]*renderDetailDrawerCard\('教练和场地'/, 'package view should show all package fields in schedule-style cards');
assert.match(openPackageDetail, /renderDetailDrawerField\('活动时间'[\s\S]*renderDetailDrawerField\('可用时间'[\s\S]*renderDetailDrawerField\('时段类型'[\s\S]*renderDetailDrawerField\('可用时段',packageTimeWindowsText\(p\)\)/, 'package view time rules should render activity/available time and time band/windows as two rows');
assert.doesNotMatch(openPackageDetail, /renderDetailDrawerField\('可用时段',packageTimeWindowsText\(p\),\{full:true\}\)/, 'available windows should not span the whole row');
assert.doesNotMatch(openPackageDetail, /setCourtModalFrame/, 'package view should not use the old centered modal frame');

assert.match(styles, /\.modal\.modal-court\.modal-schedule-drawer \.package-resource-panel/, 'package drawer resource fields should have scoped schedule drawer styling');
assert.match(styles, /\.modal\.modal-court\.modal-schedule-drawer \.package-lesson-shortcuts/, 'package drawer lesson shortcuts should be scoped to the drawer');
assert.match(styles, /\.modal\.modal-court\.modal-schedule-drawer \.package-drawer-danger-help[\s\S]*color:#B42318/, 'locked package warning should use red text');
assert.doesNotMatch(cssRule('.modal.modal-court.modal-schedule-drawer .package-drawer-danger-help'), /background:|border:/, 'locked package warning should not use a background box or border');
assert.match(styles, /\.modal\.modal-court\.modal-schedule-drawer \.package-date-range/, 'date range controls should use drawer-scoped input styling');
assert.match(cssRule('.modal.modal-court.modal-schedule-drawer .package-time-window-row'), /width:298px/, 'time window rows should match the date range control width so weekday and weekend controls do not overlap');
assert.match(cssRule('.modal.modal-court.modal-schedule-drawer .package-time-window-fields'), /grid-template-columns:108px 16px 108px/, 'time window controls should mirror the date range spacing');
assert.match(styles, /\.modal\.modal-court\.modal-schedule-drawer \.package-choice-grid/, 'campus and coach options should use the new drawer choice UI');
assert.match(cssRule('.modal.modal-court.modal-schedule-drawer .schedule-detail-title-row .package-status-badge'), /position:static/, 'package status badge should stay beside the drawer title instead of floating over the close icon');
assert.match(cssRule('.modal.modal-court.modal-schedule-drawer .package-resource-row'), /flex-direction:column/, 'campus and coach sections should use top-label bottom-options layout');
assert.match(cssRule('.modal.modal-court.modal-schedule-drawer .package-choice-pill'), /position:relative/, 'choice pills should contain their hidden input so clicks do not create an extra layout box');
assert.match(cssRule('.modal.modal-court.modal-schedule-drawer .package-choice-pill input'), /inset:0[\s\S]*width:100%[\s\S]*height:100%/, 'hidden choice inputs should stay inside the pill hit area');
assert.match(source, /renderDetailDrawerHero\(\{title,avatar:'课',subtitle,statusHtml:status\}\)/, 'package status should render beside the title');
assert.match(source, /function packageDrawerHeaderHtml\([\s\S]*packageListTitle\(p\)/, 'package drawer title should match the package card title');
assert.doesNotMatch(source, /p\?\.lessons\?`\$\{p\.lessons\}\$\{packageLessonUnitLabel\(p\)\}`:''/, 'package drawer subtitle should not include lesson count');

console.log('package drawer view tests passed');
