const assert = require('assert');
const fs = require('fs');
const path = require('path');

const purchasesSource = fs.readFileSync(path.join(__dirname, '../public/assets/scripts/pages/purchases.js'), 'utf8');
const courtsSource = fs.readFileSync(path.join(__dirname, '../public/assets/scripts/pages/courts.js'), 'utf8');
const bootstrapSource = fs.readFileSync(path.join(__dirname, '../public/assets/scripts/core/bootstrap.js'), 'utf8');

assert.doesNotMatch(purchasesSource, /await loadAll\(\)/, '购买记录相关操作不应再全量刷新');
assert.doesNotMatch(courtsSource, /await loadAll\(\)/, '订场相关操作不应再全量刷新');
assert.doesNotMatch(bootstrapSource, /await loadAll\(\)/, '删除购买记录不应再全量刷新');

console.log('full refresh guard tests passed');
