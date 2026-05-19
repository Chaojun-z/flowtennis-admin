const assert = require('assert');
const fs = require('fs');
const path = require('path');
const { appSource: html } = require('./helpers/read-index-bundle');
const courseSource = [
  fs.readFileSync(path.join(__dirname, '..', 'public', 'assets', 'scripts', 'pages', 'products.js'), 'utf8'),
  fs.readFileSync(path.join(__dirname, '..', 'public', 'assets', 'scripts', 'pages', 'packages.js'), 'utf8')
].join('\n');

function fnBody(name){
  const start = html.indexOf(`function ${name}(`);
  assert.notStrictEqual(start, -1, `${name} should exist`);
  const nextFunction = html.indexOf('\nfunction ', start + 1);
  const nextAsync = html.indexOf('\nasync function ', start + 1);
  const candidates = [nextFunction, nextAsync].filter(i => i !== -1);
  const next = candidates.length ? Math.min(...candidates) : -1;
  return html.slice(start, next === -1 ? html.length : next);
}

assert.match(html, /<div class="sb-sec">教学中心<\/div>/, 'sidebar should group teaching pages');
assert.match(html, /<div class="sb-sec">场地运营<\/div>/, 'sidebar should group court operation pages');
assert.match(html, /<div class="sb-sec">资源管理<\/div>/, 'sidebar should group resource pages');

assert.match(html, /goPage\('products',this\)[\s\S]*?课程产品/, 'sidebar should keep products page');
assert.match(html, /goPage\('packages',this\)[\s\S]*?售卖课包/, 'sidebar should add packages page');
assert.doesNotMatch(html, /<div class="sb-item" onclick="goPage\('purchases',this\)">[\s\S]*?购买记录<\/div>/, 'sidebar should remove purchases as a standalone first-level nav entry');
assert.match(html, /goPage\('admin-users',this\)[\s\S]*?账号管理/, 'sidebar should add account management page');
assert.doesNotMatch(html, /goPage\('entitlements',this\)[\s\S]*?权益账户/, 'sidebar should hide the old entitlement page entry');

assert.match(html, /id="page-packages"/, 'should have packages page section');
assert.match(html, /id="page-purchases"/, 'should have purchases page section');
assert.match(html, /course-showcase/, 'course product page should use the new showcase container');
assert.match(html, /course-package-showcase/, 'package page should use the new showcase container');
assert.match(html, /product-card-shell/, 'product page should render the gemini-style product cards');
assert.match(html, /package-card-shell/, 'package page should render the gemini-style package cards');
assert.match(html, /function renderPackages[\s\S]*String\(a\.createdAt\|\|''\)\.localeCompare\(String\(b\.createdAt\|\|''\)\)/, 'package list should sort older package records first');
assert.match(html, /showcase-kv-label">创建时间<\/div><div class="showcase-kv-value is-mono">\$\{esc\(fmtDt\(p\.createdAt\)\)\}<\/div>/, 'package cards should show created time for order verification');
assert.match(html, /归属教练[\s\S]*购买时选择[\s\S]*可上课教练/, 'package card should distinguish sale owner coach from teachable coaches');
assert.match(html, /主归属教练[\s\S]*可上课教练/, 'purchase records should expose owner coach and teachable coaches');
assert.match(html, /系统价格[\s\S]*实收金额[\s\S]*改价原因/, 'purchase modal should expose system price, actual paid amount and override reason');
assert.doesNotMatch(html, /tms-pill-tabs/, 'sidebar navigation should replace the demo top tabs');
assert.doesNotMatch(html, /const t=\{students:[\s\S]*?\n\s*const t=\{students:/, 'page title map should not be declared twice after merge');
assert.match(html, /workbench:'工作台'/, 'page title map should include coach workbench');
assert.match(html, /function syncPackageProductMeta/, 'package modal should sync product metadata');
assert.match(html, /课程类型跟随课程产品/, 'package modal should explain course type follows product');
assert.match(html, /归属教练不在这里维护，实际售卖时按购买记录选择/, 'package modal should explain owner coach is selected at purchase time');
assert.match(html, /function productHasReferences/, 'product modal should know whether product is referenced');
assert.match(html, /function packageHasPurchases/, 'package modal should know whether package is sold');
assert.match(html, /onclick="openPackageMergeModal\(\)"[\s\S]*合并课包/, 'package page should expose a package merge entry');
assert.match(html, /function mergePackage\(\)[\s\S]*\/packages\/merge/, 'package merge should call the dedicated merge endpoint');
assert.match(html, /openPackageMergeModal[\s\S]*renderCourtDropdownHtml\('pkg_merge_master'[\s\S]*renderCourtDropdownHtml\('pkg_merge_source'/, 'package merge modal should use the shared custom dropdown');
assert.match(html, /setCourtModalFrame\('合并课包'[\s\S]*modal-merge-package/, 'package merge modal should use the dedicated overflow class');
assert.doesNotMatch(html, /<select class="fselect tms-form-control" id="pkg_merge_/, 'package merge modal should not use native select controls');
assert.doesNotMatch(html, /只支持规则一致的课包合并。并入课包会在后台隐藏，购买记录和课包余额会显示为保留课包。/, 'package merge notice should remove the unreadable yellow hint');
assert.doesNotMatch(html, /课程产品定义上什么课；售卖课包定义怎么卖、什么时候能买、什么时候能用。创建售卖课包时会直接绑定一个课程产品。/, 'package page should remove the long banner description');
assert.doesNotMatch(html, /关联产品:/, 'package cards should not show linked product subtitle');
assert.doesNotMatch(fnBody('renderPackages'), /showcase-status-tag[\s\S]*启用/, 'package cards should not show the redundant active status tag');
assert.doesNotMatch(html, /查看课程产品/, 'package toolbar should remove the product shortcut button');
assert.match(html, /核心字段已锁定/, 'locked core fields should show operator-facing hint');
assert.match(html, /function openPurchaseDetailModal/, 'purchase page should have detail modal');
assert.match(html, /function openPurchaseEditModal/, 'purchase page should have edit modal');
assert.match(fnBody('openPurchaseEditModal'), /packages\.filter\(pkg=>\(pkg\.status!=='inactive'&&pkg\.status!=='merged'\)\|\|pkg\.id===p\.packageId\)/, 'purchase edit package picker should hide merged packages except the current saved package');
assert.match(html, /function savePurchaseEdit/, 'purchase page should save purchase edits');
assert.match(html, /function openPurchaseModal/, 'purchase page should provide the unified purchase modal');
assert.match(fnBody('openPurchaseModal'), /packages\.filter\(p=>p\.status!=='inactive'&&p\.status!=='merged'\)/, 'purchase create package picker should hide merged packages');
assert.match(html, /function purchaseStudentPickerHtml\(/, 'purchase modal should expose a searchable student picker helper');
assert.match(html, /function selectPurchaseStudent\(/, 'purchase modal should allow selecting a student from search results');
assert.match(html, /id="pur_studentSearch"/, 'purchase modal should provide a student search input');
assert.match(html, /id="purchaseSaveBtn"[\s\S]*onclick="savePurchase\(\)"/, 'purchase create save button should have a stable id used by the save handler');
assert.match(html, /id="purchaseEditSaveBtn"[\s\S]*onclick="savePurchaseEdit/, 'purchase edit save button should have a stable id used by the edit save handler');
assert.doesNotMatch(fnBody('savePurchase'), /document\.querySelector\('\.btn-save'\)/, 'purchase create save should not depend on the legacy btn-save class');
assert.doesNotMatch(fnBody('savePurchaseEdit'), /document\.querySelector\('\.btn-save'\)/, 'purchase edit save should not depend on the legacy btn-save class');
assert.match(html, /function getFilteredPurchases[\s\S]*String\(a\.purchaseDate\|\|a\.createdAt\|\|''\)\.localeCompare\(String\(b\.purchaseDate\|\|b\.createdAt\|\|''\)\)/, 'purchase list should sort older purchase records first');
assert.match(html, /function openPurchaseModal[\s\S]*支付方式[\s\S]*margin-bottom:0[\s\S]*可上课教练/, 'purchase modal should put pay method and allowed coach fields on separate rows to avoid layout overlap');
assert.match(html, /＋ 课包购买/, 'purchase page should expose a direct package purchase entry button');
assert.match(html, /<th style="width:100px;padding-left:20px">购买日期<\/th><th style="width:120px">学员\/支付<\/th><th style="width:170px">课包\/课程<\/th><th style="width:90px">实收<\/th><th style="width:95px">余额<\/th><th style="width:135px">有效期<\/th><th style="width:80px">状态<\/th><th style="width:95px">归属教练<\/th>/, 'purchase table should split validity and status into compact purchase, balance and owner coach columns');
assert.doesNotMatch(html, /先选择学员[\s\S]*下一步/, 'purchase modal should not require a separate first-step student gate');
assert.match(html, /购买时规则快照/, 'purchase detail should show package snapshot');
assert.match(html, /系统价格[\s\S]*成交金额[\s\S]*改价原因/, 'purchase detail should show price snapshot fields');
assert.match(html, /支付日期[\s\S]*系统录入时间/, 'purchase detail should show business date and system recorded time');
assert.match(html, /function openPurchaseVoidModal/, 'purchase page should use dedicated void modal');
assert.match(html, /function voidPurchase/, 'purchase page should send void reason');
assert.match(html, /作废原因/, 'void modal should require reason');
assert.match(html, /function resolveUniqueStudentIdByText/, 'purchase import should resolve students uniquely');
assert.match(html, /function resolveUniquePackageIdByText/, 'purchase import should resolve packages uniquely');
assert.match(html, /匹配到多个/, 'purchase import should warn duplicate matches');
assert.match(html, /固定使用结束日优先/, 'package modal should explain usage end date priority');
assert.match(html, /真正消课的是课包余额/, 'purchase page should explain package balance purpose');
assert.match(html, /私教课/, 'course pages should expose 私教课 as a fixed type');
assert.match(html, /体验课/, 'course pages should expose 体验课 as a fixed type');
assert.match(html, /训练营/, 'course pages should expose 训练营 as a fixed type');
assert.match(html, /大师课/, 'course pages should expose 大师课 as a fixed type');
assert.doesNotMatch(html, /课程性质/, 'course pages should not mention the removed 课程性质 field');
assert.doesNotMatch(courseSource, /正式课/, 'course pages should not keep the old 正式课 wording');

console.log('course management nav tests passed');
