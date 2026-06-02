const assert = require('assert');
const fs = require('fs');
const path = require('path');

const courtsSource = fs.readFileSync(path.join(__dirname, '../public/assets/scripts/pages/courts.js'), 'utf8');

assert.match(
  courtsSource,
  /membership-split-value"><span>\$\{primary\}<\/span><span>\/<\/span><span>\$\{secondary\}<\/span>/,
  '订场会员数据块的两个数值之间应显示斜杠分隔'
);

console.log('membership stat split view test passed');
