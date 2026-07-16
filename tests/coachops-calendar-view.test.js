const assert = require('assert');
const fs = require('fs');
const path = require('path');

const root = path.join(__dirname, '..');
const coachopsSource = fs.readFileSync(path.join(root, 'public/assets/scripts/pages/coachops.js'), 'utf8');
const scheduleSource = fs.readFileSync(path.join(root, 'public/assets/scripts/pages/schedule.js'), 'utf8');
const pagesCss = fs.readFileSync(path.join(root, 'public/assets/styles/pages.css'), 'utf8');

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

console.log('coachops calendar view tests passed');
