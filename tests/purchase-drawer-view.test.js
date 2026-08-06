const assert = require('assert');
const { appSource: source } = require('./helpers/read-index-bundle');
const fs = require('fs');
const path = require('path');

const styles = fs.readFileSync(path.join(__dirname, '..', 'public', 'assets', 'styles', 'pages.css'), 'utf8');
const corePageDataSource = fs.readFileSync(path.join(__dirname, '..', 'server', 'page-data', 'core-pages.js'), 'utf8');

function fnBody(name){
  const start = source.indexOf(`function ${name}(`);
  assert.notStrictEqual(start, -1, `${name} should exist`);
  const nextFunction = source.indexOf('\nfunction ', start + 1);
  const nextAsync = source.indexOf('\nasync function ', start + 1);
  const candidates = [nextFunction, nextAsync].filter(i => i !== -1);
  const next = candidates.length ? Math.min(...candidates) : -1;
  return source.slice(start, next === -1 ? source.length : next);
}

const renderPurchases = fnBody('renderPurchases');
const openPurchaseModal = fnBody('openPurchaseModal');
const openPurchaseCreateLoadingDrawer = fnBody('openPurchaseCreateLoadingDrawer');
const openPurchaseCreateErrorDrawer = fnBody('openPurchaseCreateErrorDrawer');
const openPurchaseDrawer = fnBody('openPurchaseDrawer');
const purchaseDrawerActions = fnBody('purchaseDrawerActions');
const openPurchaseDetailModal = fnBody('openPurchaseDetailModal');
const openPurchaseEditModal = fnBody('openPurchaseEditModal');
const openPurchaseVoidModal = fnBody('openPurchaseVoidModal');
const openManualEntitlementAdjustModal = fnBody('openManualEntitlementAdjustModal');
const ensureFullPurchaseData = fnBody('ensureFullPurchaseData');
const savePurchase = fnBody('savePurchase');

assert.match(renderPurchases, /openPurchaseDetailModal\('\$\{p\.id\}'\)">查看/, 'purchase list should keep a view action');
assert.match(renderPurchases, /openPurchaseVoidModal\('\$\{p\.id\}'\)">作废/, 'purchase list should keep a void action');
assert.doesNotMatch(renderPurchases, /openPurchaseEditModal\('\$\{p\.id\}'\)">编辑/, 'purchase list should not expose edit as a row action');

[openPurchaseModal, openPurchaseDetailModal, openPurchaseEditModal, openPurchaseVoidModal, openManualEntitlementAdjustModal].forEach((body, index) => {
  assert.match(body, /openPurchaseDrawer\(|openStandardDetailDrawer\(/, `purchase flow ${index + 1} should use the standard drawer`);
});
assert.match(openPurchaseDrawer, /openStandardDetailDrawer\(/, 'purchase drawer helper should call the standard drawer');
assert.match(openPurchaseDrawer, /modal-schedule-drawer/, 'purchase drawer helper should use the right-side drawer shell');
assert.match(openPurchaseDrawer, /modal-purchase-drawer/, 'purchase drawer should expose a scoped class for purchase-only layout fixes');

assert.match(openPurchaseModal, /renderDetailDrawerFormCard\('学员信息'[\s\S]*renderDetailDrawerFormCard\('购买信息'[\s\S]*renderDetailDrawerFormCard\('备注'/, 'purchase create should group fields into drawer cards');
assert.match(source, /function purchaseCreateDatasetReady\(\)[\s\S]*purchaseCreatePage[\s\S]*packageCenterPage/, 'purchase create should accept either the lightweight create data or existing package center data');
assert.match(openPurchaseModal, /!purchaseCreateDatasetReady\(\)[\s\S]*const loadToken=nextPurchaseCreateLoadToken\(\)[\s\S]*openPurchaseCreateLoadingDrawer\(studentId,'课包数据加载中\.\.\.',loadToken\)[\s\S]*ensureDatasetsByName\(\['purchaseCreatePage'\]\)\.then\(\(\)=>\{[\s\S]*if\(!isPurchaseCreateLoadingActive\(loadToken,studentId\)\)return;[\s\S]*openPurchaseModal\(studentId\)/, 'purchase create should show an immediate loading drawer before loading lightweight purchase create data');
assert.match(source, /function isPurchaseCreateLoadingActive\(token,studentId=''\)\{[\s\S]*ov\.classList\.contains\('open'\)[\s\S]*modal\.classList\.contains\('modal-purchase-drawer'\)[\s\S]*purchaseCreateLoadToken[\s\S]*purchaseCreateStudentId/, 'purchase create loader should not reopen after the drawer is closed or another page owns the overlay');
assert.match(openPurchaseCreateLoadingDrawer, /课包数据加载中/, 'purchase create loading drawer should make the click visibly respond');
assert.match(openPurchaseCreateLoadingDrawer, /purchaseCreateLoadToken:loadToken\|\|''/, 'purchase create loading drawer should stamp the active async load');
assert.match(openPurchaseCreateErrorDrawer, /openPurchaseModal\(\$\{jsArg\(studentId\)\}\)[\s\S]*重试/, 'purchase create load failure should keep a retry action in the drawer');
assert.match(source, /if\(name==='purchaseCreatePage'\)\{[\s\S]*staleCachedDatasets\.delete\('purchaseCreatePage'\)[\s\S]*markDatasetLoaded\('purchaseCreatePage',requestKey\)/, 'purchase create refresh should clear its own stale marker after a successful load');
assert.match(source, /if\(name==='packageCenterPage'\)\{[\s\S]*staleCachedDatasets\.delete\('packageCenterPage'\)[\s\S]*markDatasetLoaded\('packageCenterPage',requestKey\)/, 'package center refresh should clear its own stale marker so purchase create can reuse it');
assert.match(ensureFullPurchaseData, /ensurePurchaseDetailData\(id\)/, 'purchase detail should load one purchase detail by id');
assert.doesNotMatch(openPurchaseDetailModal, /purchasesPage/, 'purchase detail drawer must not load the full purchases aggregate');
assert.doesNotMatch(openPurchaseEditModal, /purchasesPage/, 'purchase edit drawer must not load the full purchases aggregate');
assert.doesNotMatch(openPurchaseVoidModal, /purchasesPage/, 'purchase void drawer must not load the full purchases aggregate');
assert.doesNotMatch(openManualEntitlementAdjustModal, /purchasesPage/, 'manual entitlement drawer must not load the full purchases aggregate');
assert.match(openPurchaseModal, /renderDetailDrawerFormCard\('本次赠送',giftForm\)/, 'purchase create should render gift fields in its own drawer card');
assert.match(openPurchaseModal, /pur_giftLessons[\s\S]*pur_courtBookingGiftCount[\s\S]*pur_ballMachineGiftCount/, 'purchase create should expose package lesson and student benefit gift fields');
assert.match(source, /function refreshPurchaseGiftPreview\(/, 'purchase create should render a gift preview');
assert.match(source, /function purchaseGiftPreviewHtml\(/, 'purchase gift preview should have a dedicated renderer');
assert.match(openPurchaseEditModal, /renderDetailDrawerFormCard\('购买信息'/, 'purchase edit should use one coherent two-column form card');
assert.doesNotMatch(openPurchaseEditModal, /renderDetailDrawerFormCard\('备注'/, 'purchase edit should not split notes into a separate one-field card');
assert.match(source, /function setPurchaseDetailTab\(/, 'purchase detail drawer should support tab switching');
assert.match(openPurchaseDetailModal, /\[\['deal','课包信息'\],\['balance','课包余额'\],\['rules','下单快照'\]\]/, 'purchase detail should split content into renamed tabs');
assert.match(openPurchaseDetailModal, /activeTab==='deal'[\s\S]*renderDetailDrawerCard\('课包信息'/, 'deal tab should show package info fields');
assert.match(openPurchaseDetailModal, /activeTab==='balance'[\s\S]*renderDetailDrawerCard\('课包余额'[\s\S]*renderDetailDrawerCard\('扣课记录'/, 'balance tab should include lesson ledger rows');
assert.match(openPurchaseDetailModal, /purchaseGiftSummaryDrawerFields\(p,ent\)/, 'purchase detail should show gift lesson and benefit summary');
assert.doesNotMatch(openPurchaseDetailModal, /renderDetailDrawerField\('有效期'/, 'balance tab should not show validity period');
assert.match(openPurchaseDetailModal, /activeTab==='rules'[\s\S]*renderDetailDrawerCard\('下单快照'/, 'rules tab should show order snapshot');
assert.match(source, /function purchaseSnapshotChanged\(/, 'order snapshot should compare current package values');
assert.match(source, /purchase-snapshot-change-tag[\s\S]*已变更/, 'changed snapshot fields should show a marker');
assert.match(openPurchaseDetailModal, /avatar:purchaseDrawerAvatar\(p\.studentName\)/, 'purchase detail avatar should use the student name initial');
assert.match(purchaseDrawerActions, /schedule-detail-action primary btn-save[\s\S]*onclick="\$\{saveOnclick\}"/, 'purchase drawer actions should use drawer button styles');
assert.match(openPurchaseModal, /purchaseDrawerActions\('closeModal\(\)','savePurchase\(\)','purchaseSaveBtn'\)/, 'purchase create save should be in drawer actions');
assert.match(openPurchaseEditModal, /purchaseDrawerActions\(`openPurchaseDetailModal\('\$\{p\.id\}'\)`,`savePurchaseEdit\('\$\{p\.id\}'\)`,'purchaseEditSaveBtn'\)/, 'purchase edit save should be in drawer actions');
assert.doesNotMatch(openPurchaseModal, /openStandardModal\(/, 'purchase create should not use centered modal');
assert.doesNotMatch(openPurchaseDetailModal, /openStandardModal\(/, 'purchase detail should not use centered modal');
assert.doesNotMatch(openPurchaseEditModal, /openStandardModal\(/, 'purchase edit should not use centered modal');
assert.doesNotMatch(openPurchaseVoidModal, /document\.getElementById\('mBody'\)\.innerHTML/, 'purchase void should not manually fill legacy modal body');
assert.match(source, /setDatasetValue\('entitlementLedger',data\.entitlementLedger\|\|\[\]\)/, 'purchase page data should hydrate lesson ledger rows');
assert.match(source, /String\(l\.purchaseId\|\|''\)===String\(purchaseId\|\|''\)\|\|entIds\.has\(l\.entitlementId\)/, 'purchase ledger should match rows by purchase id as well as entitlement id');
assert.match(corePageDataSource, /page-data\/purchases[\s\S]*T_ENTITLEMENT_LEDGER[\s\S]*entitlementLedger:scoped\.entitlementLedger/, 'purchase page aggregate endpoint should return lesson ledger rows');
assert.match(styles, /purchase-snapshot-change-tag/, 'changed snapshot marker should have scoped drawer styling');
assert.match(styles, /modal-purchase-drawer[\s\S]*#pur_packageId_dropdown[\s\S]*text-overflow:ellipsis/, 'purchase package dropdown should clip long package names instead of overflowing the input');
assert.match(styles, /modal-purchase-drawer[\s\S]*#pur_edit_packageId_dropdown[\s\S]*font-size:10px/, 'purchase edit package dropdown should use smaller text for long package names');
assert.match(savePurchase, /ensureDatasetsByName\(\['purchaseCreatePage','packageCenterPage','customerCenterPage','lifecycleMetricsPage'\],\{force:true\}\)/, 'purchase save should force-refresh create drawer data, package list data, and customer lifecycle views after creating a purchase');
assert.match(savePurchase, /giftLessons:parseFloat\(document\.getElementById\('pur_giftLessons'\)\?\.value\)\|\|0/, 'purchase save should submit gifted lesson count');
assert.match(savePurchase, /courtBookingGiftCount:parseInt\(document\.getElementById\('pur_courtBookingGiftCount'\)\?\.value\)\|\|0/, 'purchase save should submit booking benefit gifts');
assert.match(savePurchase, /ballMachineGiftCount:parseInt\(document\.getElementById\('pur_ballMachineGiftCount'\)\?\.value\)\|\|0/, 'purchase save should submit ball-machine benefit gifts');
assert.match(openPurchaseVoidModal, /sourcePurchaseId[\s\S]*本次赠送权益已被消耗，不能直接作废/, 'purchase void should block when gifted student benefits have already been consumed');
assert.match(source, /const otherTotal=\(totalByKey\.get\(key\)\|\|0\)-giftTotal[\s\S]*consumedByKey\.get\(key\)\|\|0\)>otherTotal/, 'purchase void should not block when other student benefit grants can cover consumed benefits');

console.log('purchase drawer view tests passed');
