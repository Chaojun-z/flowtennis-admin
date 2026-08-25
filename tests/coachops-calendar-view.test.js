const assert = require('assert');
const fs = require('fs');
const path = require('path');
const vm = require('vm');

const root = path.join(__dirname, '..');
const coachopsSource = fs.readFileSync(path.join(root, 'public/assets/scripts/pages/coachops.js'), 'utf8');
const scheduleSource = fs.readFileSync(path.join(root, 'public/assets/scripts/pages/schedule.js'), 'utf8');
const pagesCss = fs.readFileSync(path.join(root, 'public/assets/styles/pages.css'), 'utf8');
const coachopsRuntime = {
  localStorage: { getItem: () => '', setItem: () => {}, removeItem: () => {} },
  console,
  Date,
  Number,
  String,
  Math,
  Array,
  Map,
  Set,
  RegExp,
  dateKey: d => `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}-${String(d.getDate()).padStart(2,'0')}`,
  sameCampusValue: (a, b) => String(a || '') === String(b || ''),
  campus: 'all'
};
coachopsRuntime.lessonUnitsText = value => {
  const n = Number(value) || 0;
  return Number.isInteger(n) ? String(n) : String(Math.round(n * 10) / 10);
};
coachopsRuntime.sumScheduleLessonUnits = rows => (rows || []).reduce((sum, row) => sum + (Number(row.lessonCount) || 0), 0);
vm.runInNewContext(coachopsSource, coachopsRuntime);

assert.match(
  scheduleSource,
  /scheduleId:editId\|\|''/,
  'schedule edit entitlement recommendation must send the current editId'
);
assert.doesNotMatch(
  scheduleSource,
  /window\.editScheduleId/,
  'schedule edit entitlement recommendation must not read the stale window.editScheduleId field'
);

assert.match(
  coachopsSource,
  /const endMin=Math\.min\(23\*60,startMin\+60\)/,
  'calendar click-to-create should default every slot to one hour'
);
assert.doesNotMatch(
  coachopsSource,
  /startTime\.endsWith\(':00'\)\?120:60/,
  'calendar click-to-create must not make whole-hour clicks default to two hours'
);
assert.match(
  coachopsSource,
  /Array\.from\(\{length:opsTotalMin\/30\+1\}/,
  'day view should render half-hour time labels'
);
assert.strictEqual(
  coachopsRuntime.coachOpsScheduleInRange(
    { id: 'prev-night', date: '2026-08-05', startTime: '2026-08-05T23:00:00.000Z', endTime: '2026-08-06T00:30:00.000Z', startMs: Date.parse('2026-08-05T23:00:00.000Z') },
    { start: new Date('2026-08-06T00:00:00'), end: new Date('2026-08-07T00:00:00') }
  ),
  false,
  'day calendar must not pull previous business-date ISO schedules into the selected day by startMs'
);
const isoMinuteOffsets = coachopsRuntime.coachOpsScheduleMinuteOffsets({ startTime: '2026-08-06T16:00:00.000Z', endTime: '2026-08-06T17:30:00.000Z' }, 7);
assert.strictEqual(isoMinuteOffsets.startMin, 540, 'day calendar block start should use the displayed business clock instead of timezone-shifted milliseconds');
assert.strictEqual(isoMinuteOffsets.endMin, 630, 'day calendar block end should use the displayed business clock instead of timezone-shifted milliseconds');
assert.match(
  pagesCss,
  /coach-ops-day-coach-grid\{[\s\S]*transparent 28px/,
  'day view grid should draw half-hour rows'
);

assert.match(
  coachopsSource,
  /coachOpsDurationBadgeText\(s\)/,
  'week cards should compute a compact duration badge'
);
assert.match(
  coachopsSource,
  /coach-ops-student-name[\s\S]*coach-ops-duration-badge/,
  'week cards should place duration to the right of a truncatable name'
);
assert.match(
  pagesCss,
  /coach-ops-week-block\.type-trial \.coach-ops-card-dot\{background:#F59E0B\}/,
  'week trial card marker should use the trial orange'
);
assert.match(
  pagesCss,
  /coach-ops-week-block \.coach-ops-student-name\{[\s\S]*text-overflow:ellipsis/,
  'long week card names should truncate before the duration badge'
);
assert.match(
  pagesCss,
  /coach-ops-week-block \.coach-ops-duration-badge\{[^}]*margin-left:auto[^}]*font-weight:400[^}]*text-align:right/,
  'duration text should be normal-weight and right aligned'
);
assert.doesNotMatch(
  pagesCss,
  /coach-ops-week-block \.coach-ops-duration-badge\{[^}]*background:rgba/,
  'duration text should not use a background pill'
);

assert.match(
  pagesCss,
  /#page-coachschedule\{[^}]*--coach-ops-calendar-line:#EDE9E8[^}]*--coach-ops-calendar-hairline:0\.5px/,
  'coach schedule calendar should expose one shared light 0.5px line token'
);
assert.match(
  pagesCss,
  /coach-ops-day-coach-grid\{[^}]*background-image:repeating-linear-gradient\(0deg,var\(--coach-ops-calendar-line\),var\(--coach-ops-calendar-line\) var\(--coach-ops-calendar-hairline\),transparent var\(--coach-ops-calendar-hairline\),transparent 28px\)/,
  'day view half-hour rows should use the shared 0.5px light line'
);
assert.match(
  pagesCss,
  /coach-ops-week-coach-grid\{[^}]*background-image:repeating-linear-gradient\(0deg,var\(--coach-ops-calendar-line\),var\(--coach-ops-calendar-line\) var\(--coach-ops-calendar-hairline\),transparent var\(--coach-ops-calendar-hairline\),transparent 40px\)/,
  'week view hour rows should use the same shared 0.5px light line'
);
assert.match(
  pagesCss,
  /coach-ops-week-coach-grid\{[^}]*background-position-y:40px/,
  'week view hour rows should start after the full top blank row so labels align with grid lines'
);
assert.match(
  pagesCss,
  /coach-ops-day-coach-col\{[^}]*border-right:var\(--coach-ops-calendar-hairline\) solid var\(--coach-ops-calendar-line\)/,
  'day view coach columns should use shared 0.5px vertical lines'
);
assert.doesNotMatch(
  pagesCss,
  /coach-ops-day-coach-col\.is-today\{[^}]*background:/,
  'day view today columns should not add a separate background that makes grid lines look lighter'
);
assert.doesNotMatch(
  pagesCss,
  /mode-day \.coach-ops-day-coach-col\.is-today:hover\{[^}]*background:/,
  'day view today hover should not keep a separate background that changes grid contrast'
);
assert.match(
  pagesCss,
  /coach-ops-week-coach-col\{[^}]*border-right:var\(--coach-ops-calendar-hairline\) solid var\(--coach-ops-calendar-line\)/,
  'week view coach columns should use shared 0.5px vertical lines'
);
assert.match(
  pagesCss,
  /coach-ops-month-overview \.coach-ops-daycell\.month-cell\{[^}]*border-right:var\(--coach-ops-calendar-hairline\) solid var\(--coach-ops-calendar-line\)[^}]*border-bottom:var\(--coach-ops-calendar-hairline\) solid var\(--coach-ops-calendar-line\)/,
  'month view cells should use shared 0.5px light grid lines'
);
assert.doesNotMatch(
  coachopsSource,
  /currentMonthHasToday[\s\S]{0,240}is-today/,
  'month weekday header should not highlight the current weekday'
);
assert.match(
  pagesCss,
  /coach-ops-grid-card\.mode-month \.coach-ops-hours span\.is-today\{background:#FCF7F3!important;color:#6B7280;font-weight:500\}/,
  'month header should keep the normal header style even if legacy is-today class exists'
);
assert.match(
  pagesCss,
  /coach-ops-month-overview \.coach-ops-daycell\.is-today\{[^}]*background:#FFF4E6/,
  'month view should highlight the whole current date cell'
);
assert.ok(
  pagesCss.lastIndexOf('coach-ops-month-overview .coach-ops-daycell.is-today') > pagesCss.indexOf('coach-ops-daycell.is-today,#page-coachschedule .coach-ops-daycell.is-today.has-course'),
  'month today highlight should be declared after the generic today reset'
);
assert.match(
  pagesCss,
  /coach-ops-month-overview \.coach-ops-daycell\{[^}]*overflow:visible/,
  'month cells should allow coach hover previews to escape the cell'
);
assert.match(
  pagesCss,
  /coach-ops-month-coach-row\{[^}]*overflow:visible/,
  'month coach rows should allow the hover preview to render'
);
assert.match(
  pagesCss,
  /coach-ops-month-preview\{[^}]*z-index:320/,
  'month coach hover preview should sit above the calendar grid'
);
assert.match(
  fs.readFileSync(path.join(root, 'public/index.html'), 'utf8'),
  /id="coachOpsPeriodSummary">共 0 节/,
  'coach schedule toolbar should reserve a period lesson summary next to the date selector'
);
assert.strictEqual(
  coachopsRuntime.coachOpsPeriodSummaryText([
    { rangeRows: [{ lessonCount: 1 }, { lessonCount: 1.5 }] },
    { rangeRows: [{ lessonCount: 2 }] }
  ]),
  '共 4.5 节',
  'period lesson summary should add the currently filtered visible rows'
);
assert.match(
  pagesCss,
  /#page-coachschedule \.coach-ops-period-summary\{[^}]*white-space:nowrap/,
  'period lesson summary should stay as one compact toolbar item'
);

console.log('coachops calendar view tests passed');
