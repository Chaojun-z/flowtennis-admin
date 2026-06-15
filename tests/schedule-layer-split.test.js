const assert = require('assert');
const fs = require('fs');
const path = require('path');

const repoRoot = path.resolve(__dirname, '..');
const apiSource = fs.readFileSync(path.join(repoRoot, 'api/index.js'), 'utf8');
const schedulePath = path.join(repoRoot, 'server/schedule.js');

assert.ok(fs.existsSync(schedulePath), 'server/schedule.js should own schedule rules and conflict checks');

const scheduleSource = fs.readFileSync(schedulePath, 'utf8');

assert.match(apiSource, /require\('\.\.\/server\/schedule'\)/, 'api/index.js should import schedule rules from server/schedule.js');
assert.match(scheduleSource, /function createScheduleRules/, 'schedule module should expose a rule factory');
assert.match(scheduleSource, /function validateScheduleConflicts/, 'schedule module should own schedule conflict checks');
assert.match(scheduleSource, /function validateCourtBookingConflicts/, 'schedule module should own court booking conflict checks');
assert.match(scheduleSource, /function scheduleLessonDelta/, 'schedule module should own lesson delta rules');
assert.doesNotMatch(apiSource, /function validateScheduleConflicts/, 'api/index.js should not keep schedule conflict checks inline');
assert.doesNotMatch(apiSource, /function validateCourtBookingConflicts/, 'api/index.js should not keep court booking conflict checks inline');

console.log('schedule-layer-split tests passed');
