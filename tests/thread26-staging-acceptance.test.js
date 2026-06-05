const assert = require('assert');
const { html, appSource } = require('./helpers/read-index-bundle');

assert.match(
  appSource,
  /goPage\('leads',this\)[\s\S]*?线索池/,
  'staging candidate should keep the leads pool entry'
);

assert.doesNotMatch(
  appSource,
  /<div class="sb-item" onclick="goPage\('purchases',this\)">[\s\S]*?购买记录<\/div>/,
  'staging candidate should not expose purchases as a first-level sidebar entry'
);

assert.match(
  appSource,
  /goPage\('workbench',this\)[\s\S]*?工作台[\s\S]*goPage\('postfeedback',this\)[\s\S]*?课后评价/,
  'coach sidebar should keep post-class feedback as the second entry'
);

assert.match(
  appSource,
  /function workbenchScheduleShell\(\)\{[\s\S]*id="workbenchScheduleWeekHeader"[\s\S]*id="workbenchWeekGrid"/,
  'workbench should include the weekly schedule shell directly on the homepage'
);

assert.match(
  appSource,
  /function goPage\(pg,el,skipRender=false\)\{[\s\S]*if\(pg==='myschedule'\)pg='workbench';/,
  'legacy my-schedule jumps should still resolve into the workbench homepage'
);

console.log('thread26 staging acceptance tests passed');
