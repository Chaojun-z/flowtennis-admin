const assert = require('assert');
const fs = require('fs');
const path = require('path');

const html = fs.readFileSync(path.join(__dirname, '..', 'public', 'index.html'), 'utf8');

assert.match(
  html,
  /goPage\('workbench',this\)[\s\S]*?工作台/,
  'coach sidebar should expose the new workbench entry'
);

assert.match(
  html,
  /id="page-workbench"/,
  'coach workbench page section should exist'
);

assert.match(
  html,
  /今日课程[\s\S]*?即将开始[\s\S]*?待反馈[\s\S]*?体验课待判断/,
  'coach workbench should show four priority cards'
);

assert.match(
  html,
  /function hasTrialConversionDecision\(fb\)/,
  'coach portal should expose a helper for trial conversion completion'
);

assert.match(
  html,
  /推荐产品[\s\S]*?转化意愿[\s\S]*?是否需要运营跟进/,
  'course detail should show trial conversion summary fields'
);

assert.match(
  html,
  /校区[\s\S]*?场地[\s\S]*?班次[\s\S]*?体验课[\s\S]*?待反馈/,
  'coach schedule views should render the required course info fields'
);

console.log('coach portal view tests passed');
