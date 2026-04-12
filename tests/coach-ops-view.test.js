const assert = require('assert');
const fs = require('fs');
const path = require('path');

const html = fs.readFileSync(path.join(__dirname, '..', 'public', 'index.html'), 'utf8');

assert.match(
  html,
  /mode==='week'\|\|mode==='month'/,
  'month view should use the weekday header like week view'
);

assert.doesNotMatch(
  html,
  /<div style="font-size:14px;font-weight:600;color:var\(--cream-pale\);margin:4px 0 10px">教练工作量<\/div>/,
  'workload tab should not render the duplicate workload title'
);

assert.match(
  html,
  /function dateMs\(v\)/,
  'coach ops day view needs dateMs so schedule blocks render instead of interrupting the table'
);

console.log('coach ops view tests passed');
