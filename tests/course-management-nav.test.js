const assert = require('assert');
const fs = require('fs');
const path = require('path');

const html = fs.readFileSync(path.join(__dirname, '../public/index.html'), 'utf8');

assert.match(html, /<div class="sb-sec">教学管理<\/div>/, 'sidebar should group teaching pages');
assert.match(html, /<div class="sb-sec">课程管理<\/div>/, 'sidebar should group course pages');
assert.match(html, /<div class="sb-sec">场地与资源<\/div>/, 'sidebar should group resource pages');

assert.match(html, /goPage\('products',this\)[\s\S]*?课程产品/, 'sidebar should keep products page');
assert.match(html, /goPage\('packages',this\)[\s\S]*?售卖课包/, 'sidebar should add packages page');
assert.match(html, /goPage\('purchases',this\)[\s\S]*?购买记录/, 'sidebar should add purchases page');
assert.match(html, /goPage\('entitlements',this\)[\s\S]*?权益账户/, 'sidebar should add entitlements page');

assert.match(html, /id="page-packages"/, 'should have packages page section');
assert.match(html, /id="page-purchases"/, 'should have purchases page section');
assert.match(html, /id="page-entitlements"/, 'should have entitlements page section');
assert.doesNotMatch(html, /const t=\{students:[\s\S]*?\n\s*const t=\{students:/, 'page title map should not be declared twice after merge');
assert.match(html, /workbench:'工作台'/, 'page title map should include coach workbench');

console.log('course management nav tests passed');
