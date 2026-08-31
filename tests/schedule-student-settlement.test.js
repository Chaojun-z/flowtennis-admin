const assert = require('assert');
const fs = require('fs');
const path = require('path');

const repoRoot = path.resolve(__dirname, '..');
const scheduleSource = fs.readFileSync(path.join(repoRoot, 'public', 'assets', 'scripts', 'pages', 'schedule.js'), 'utf8');
const settlementSource = fs.readFileSync(path.join(repoRoot, 'public', 'assets', 'scripts', 'pages', 'schedule-settlement.js'), 'utf8');
const styles = fs.readFileSync(path.join(repoRoot, 'public', 'assets', 'styles', 'pages.css'), 'utf8');
const indexHtml = fs.readFileSync(path.join(repoRoot, 'public', 'index.html'), 'utf8');
const apiSource = fs.readFileSync(path.join(repoRoot, 'api', 'index.js'), 'utf8');
const {
  normalizeStudentSettlementRows,
  summarizeStudentSettlementRows,
  scheduleStudentSettlementRowHtml
} = require('../public/assets/scripts/pages/schedule-settlement.js');

function fnBody(name) {
  const start = scheduleSource.indexOf(`function ${name}(`);
  assert.notStrictEqual(start, -1, `${name} should exist`);
  const nextFunction = scheduleSource.indexOf('\nfunction ', start + 1);
  const nextAsync = scheduleSource.indexOf('\nasync function ', start + 1);
  const candidates = [nextFunction, nextAsync].filter(i => i !== -1);
  const next = candidates.length ? Math.min(...candidates) : -1;
  return scheduleSource.slice(start, next === -1 ? scheduleSource.length : next);
}

const rows = normalizeStudentSettlementRows({
  studentIds: ['s1', 's2', 's3', 's4'],
  defaultSettlementType: 'package',
  existingRows: [
    { studentId: 's1', settlementType: 'package' },
    { studentId: 's2', settlementType: 'direct', payMethod: '微信', amount: 120 }
  ]
});

assert.strictEqual(rows.length, 4);
assert.strictEqual(rows[1].payMethod, '微信');
assert.strictEqual(summarizeStudentSettlementRows(rows), '3人课包扣减 / 1人直接收款');

assert.match(indexHtml, /schedule-settlement\.js\?v=20260830-schedule-student-settlement-v1[\s\S]*schedule\.js\?v=/, 'settlement helper should load before schedule.js');
assert.match(fnBody('renderScheduleStudentSuggestions'), /没有匹配到学员[\s\S]*schedule-student-suggest-create-link[\s\S]*openScheduleStudentQuickCreateModal[\s\S]*新建学员并排课/, 'no-result search should expose quick student creation as text');
assert.match(scheduleSource, /function closeScheduleStudentQuickCreateModal\(/, 'quick-create modal should have its own close function');
assert.doesNotMatch(fnBody('openScheduleStudentQuickCreateModal'), /openStandardModal\(/, 'quick-create modal must not replace the open schedule drawer');
assert.match(fnBody('openScheduleStudentQuickCreateModal'), /insertAdjacentHTML[\s\S]*scheduleQuickStudentOverlay/, 'quick-create modal should render as a stacked overlay above the drawer');
assert.match(scheduleSource, /schedule-student-suggest-create-link[\s\S]*addEventListener\('click'[\s\S]*openScheduleStudentQuickCreateModal/, 'quick-create link should have a delegated click fallback');
assert.match(fnBody('openScheduleStudentQuickCreateModal'), /const taxonomy=window\.FlowTennisBusinessTaxonomy/, 'quick-create modal should safely read taxonomy from window');
assert.match(settlementSource, /renderStandardDropdownHtml\('sch_quickStudentCampus'[\s\S]*renderStandardDropdownHtml\('sch_quickStudentSource'/, 'quick-create form should use system dropdowns for campus and source');
assert.doesNotMatch(settlementSource, /手机号 \*/, 'quick-create form should not mark phone as required');
assert.match(settlementSource, /skipDuplicateCheck:\s*true/, 'quick-create payload should skip server duplicate lookup');
assert.doesNotMatch(settlementSource, /id="sch_quickStudentCampus" value="[\s\S]*placeholder="校区"/, 'quick-create form should not use free-text campus input');
assert.doesNotMatch(settlementSource, /id="sch_quickStudentSource" value="[\s\S]*placeholder="来源"/, 'quick-create form should not use free-text source input');
assert.match(fnBody('saveScheduleStudentQuickCreate'), /if\(phone&&!\s*validateCnPhone\(phone\)\)/, 'quick-create save should allow empty phone but still validate filled phone');
assert.match(fnBody('saveScheduleStudentQuickCreate'), /apiCall\('POST','\/students',data\)[\s\S]*closeScheduleStudentQuickCreateModal\(\)[\s\S]*selectScheduleStudent\(r\.id\)/, 'saving a quick student should create, close only the small modal, and select the new student');
assert.doesNotMatch(fnBody('saveScheduleStudentQuickCreate'), /renderStudents\(\)/, 'saving a quick student should not rerender the whole students page');

assert.match(fnBody('openScheduleModal'), /id="sch_studentSettlementRows"/, 'schedule modal should keep hidden settlement rows');
assert.match(fnBody('openScheduleModal'), /packageField\}<div id="sch_studentSettlementSectionHost"><\/div><div class="tms-form-row schedule-time-row"/, 'student settlement section should stay inside the basic schedule form');
assert.match(fnBody('refreshScheduleStudentSettlementSection'), /type!=='小班课'\|\|ids\.length<=1/, 'student settlement rows should only show for multi-student small group schedules');
assert.match(fnBody('refreshScheduleStudentSettlementSection'), /summarizeStudentSettlementRows\(normalized\)/, 'collapsed settlement section should show a compact summary');
assert.match(settlementSource, /function scheduleStudentSettlementRowHtml[\s\S]*settlementType[\s\S]*payMethod[\s\S]*amount[\s\S]*fieldFeeMode[\s\S]*fieldFeePayMethod[\s\S]*fieldFeeAmount/, 'each student row should support settlement type, payment method, amount, and field fee');
assert.match(scheduleStudentSettlementRowHtml({
  row: { studentId: 's1', settlementType: 'direct', payMethod: '微信', amount: 120, fieldFeeMode: 'separate', fieldFeePayMethod: '现金', fieldFeeAmount: 30 },
  studentName: '学员A',
  packageText: '小班课包 · 剩余3次',
  payMethodOptions: [{ value: '微信', label: '微信' }, { value: '现金', label: '现金' }]
}), /学员A[\s\S]*结算方式[\s\S]*扣减课包[\s\S]*小班课包 · 剩余3次[\s\S]*场地费[\s\S]*场地费支付[\s\S]*sch_studentSettlementFieldFeeAmount_s1/, 'small group row should show one complete settlement set per student');
assert.match(fnBody('renderScheduleStudentEntitlementRows'), /schedule-student-entitlement-action/, 'package matching rows should expose a direct-payment action for each student');
assert.match(fnBody('renderScheduleStudentEntitlementRows'), /setScheduleStudentSettlementType\([\s\S]*'direct'\)/, 'package matching rows should switch one student to direct payment');
assert.match(scheduleSource, /function setScheduleStudentSettlementType\(/, 'schedule page should expose a helper for switching one student to direct payment');
assert.match(fnBody('onScheduleStudentSettlementTypeChange'), /custom:true/, 'manually changed student rows should be treated as overrides');
assert.match(fnBody('handleScheduleSettlementTypeChange'), /refreshScheduleStudentSettlementSection\(\)/, 'changing the default settlement type should refresh per-student rows');
assert.match(fnBody('saveSchedule'), /studentSettlementRows=serializeStudentSettlementRows/, 'saving should serialize per-student settlement rows');
assert.match(fnBody('saveSchedule'), /scheduleUsesStudentSettlementRows\(\)[\s\S]*studentSettlementRows\.reduce/, 'small group save should derive totals from per-student rows');
assert.match(fnBody('saveSchedule'), /notes:document\.getElementById\('sch_notes'\)\.value\.trim\(\),studentSettlementRows/, 'saved schedule payload should include per-student settlement rows');
assert.match(fnBody('scheduleSaveConfirmText'), /studentSettlementRows\.length>1[\s\S]*summarizeStudentSettlementRows/, 'confirm copy should use per-student settlement summary for small groups');
assert.match(apiSource, /SCHEDULE_LIST_PROJECTION_FIELDS=\[[\s\S]*'studentSettlementRows'/, 'schedule list projection should preserve per-student settlement rows for edit');

assert.match(styles, /\.schedule-quick-student-overlay/, 'quick-create stacked overlay should have scoped styles');
assert.match(styles, /\.schedule-student-settlement-panel/, 'student settlement section should have scoped panel styles');
assert.match(styles, /\.schedule-quick-student-modal \.schedule-detail-action\.primary/, 'quick-create modal should use app modal button styling');
assert.match(styles, /\.schedule-quick-student-modal \.mbody\{padding:16px 20px;overflow:visible\}/, 'quick-create modal body should not clip dropdown menus');

console.log('student settlement tests passed');
