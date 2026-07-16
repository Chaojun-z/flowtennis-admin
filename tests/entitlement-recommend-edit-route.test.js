const assert = require('assert');
const fs = require('fs');
const path = require('path');

const root = path.join(__dirname, '..');
const apiSource = fs.readFileSync(path.join(root, 'api/index.js'), 'utf8');
const routeSource = fs.readFileSync(path.join(root, 'server/purchase-entitlement-routes.js'), 'utf8');

assert.match(
  routeSource,
  /function restoreEditingScheduleEntitlementRowsForRecommendation\(entitlements=\[\],schedule=\{\},currentSchedule=null,helpers=\{\}\)/,
  'purchase entitlement route should keep the editing-schedule balance restore helper outside api/index.js'
);
assert.doesNotMatch(
  apiSource,
  /function restoreEditingScheduleEntitlementRowsForRecommendation/,
  'api/index.js should not grow a local editing-schedule balance restore helper'
);
assert.match(
  routeSource,
  /const scheduleId=String\(body\.scheduleId\|\|''\)\.trim\(\)/,
  'recommend route should read scheduleId from edit requests'
);
assert.match(
  routeSource,
  /currentSchedule=await get\(T_SCHEDULE,scheduleId\)\.catch\(\(\)=>null\)/,
  'recommend route should load the schedule currently being edited'
);
assert.match(
  routeSource,
  /missingIds\.map\(id=>getCachedRow\(T_ENTITLEMENTS,id\)\.catch\(\(\)=>null\)\)/,
  'recommend route should fetch the original entitlement even when it is no longer in the active index'
);
assert.match(
  routeSource,
  /restoreEditingScheduleEntitlementRowsForRecommendation\(recommendationRows,body,currentSchedule,\{parseLessonValue,scheduleEntitlementDeltas\}\)/,
  'recommend route should restore the current schedule consumption before recommending packages'
);

console.log('entitlement recommend edit route tests passed');
