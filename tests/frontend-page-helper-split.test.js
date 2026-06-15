const assert = require('assert');
const fs = require('fs');
const path = require('path');

const repoRoot = path.resolve(__dirname, '..');
const html = fs.readFileSync(path.join(repoRoot, 'public/index.html'), 'utf8');
const courtsHelperPath = path.join(repoRoot, 'public/assets/scripts/pages/courts-helpers.js');
const scheduleHelperPath = path.join(repoRoot, 'public/assets/scripts/pages/schedule-helpers.js');

assert.ok(fs.existsSync(courtsHelperPath), 'courts helpers should be split out of courts.js');
assert.ok(fs.existsSync(scheduleHelperPath), 'schedule helpers should be split out of schedule.js');

const courtsHelper = fs.readFileSync(courtsHelperPath, 'utf8');
const scheduleHelper = fs.readFileSync(scheduleHelperPath, 'utf8');

assert.match(courtsHelper, /function courtDateFilterQuickOptions/, 'courts helpers should own date filter quick options');
assert.match(courtsHelper, /function formatCourtDateRangeValue/, 'courts helpers should own date range label formatting');
assert.match(scheduleHelper, /function scheduleStatusLabel/, 'schedule helpers should own status label formatting');
assert.match(scheduleHelper, /function scheduleStatusTagClass/, 'schedule helpers should own status tag class formatting');

assert.ok(
  html.indexOf('assets/scripts/pages/courts-helpers.js') >= 0 &&
    html.indexOf('assets/scripts/pages/courts-helpers.js') < html.indexOf('assets/scripts/pages/courts.js'),
  'index.html should load courts helpers before courts.js'
);
assert.ok(
  html.indexOf('assets/scripts/pages/schedule-helpers.js') >= 0 &&
    html.indexOf('assets/scripts/pages/schedule-helpers.js') < html.indexOf('assets/scripts/pages/schedule.js'),
  'index.html should load schedule helpers before schedule.js'
);

console.log('frontend page helper split tests passed');
