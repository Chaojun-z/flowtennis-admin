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
assert.match(html, /function syncPackageProductMeta/, 'package modal should sync product metadata');
assert.match(html, /课程类型跟随课程产品/, 'package modal should explain course type follows product');
assert.match(html, /function productHasReferences/, 'product modal should know whether product is referenced');
assert.match(html, /function packageHasPurchases/, 'package modal should know whether package is sold');
assert.match(html, /核心字段已锁定/, 'locked core fields should show operator-facing hint');
assert.match(html, /function openPurchaseDetailModal/, 'purchase page should have detail modal');
assert.match(html, /function openPurchaseEditModal/, 'purchase page should have edit modal');
assert.match(html, /function savePurchaseEdit/, 'purchase page should save purchase edits');
assert.match(html, /购买时规则快照/, 'purchase detail should show package snapshot');
assert.match(html, /function openPurchaseVoidModal/, 'purchase page should use dedicated void modal');
assert.match(html, /function voidPurchase/, 'purchase page should send void reason');
assert.match(html, /作废原因/, 'void modal should require reason');
assert.match(html, /function resolveUniqueStudentIdByText/, 'purchase import should resolve students uniquely');
assert.match(html, /function resolveUniquePackageIdByText/, 'purchase import should resolve packages uniquely');
assert.match(html, /匹配到多个/, 'purchase import should warn duplicate matches');
assert.match(html, /固定使用结束日优先/, 'package modal should explain usage end date priority');
assert.match(html, /购买记录用于查账和追溯/, 'purchase page should explain purpose');

console.log('course management nav tests passed');
