const assert = require('assert');
const fs = require('fs');
const path = require('path');
const { html, appSource } = require('./helpers/read-index-bundle');

const pagesCss = fs.readFileSync(path.join(__dirname, '../public/assets/styles/pages.css'), 'utf8');
const standardSource = fs.readFileSync(path.join(__dirname, '../public/assets/scripts/standard/components.js'), 'utf8');

function fnBody(name) {
  const start = appSource.indexOf(`function ${name}(`);
  assert.notStrictEqual(start, -1, `${name} should exist`);
  const nextFunction = appSource.indexOf('\nfunction ', start + 1);
  const nextAsync = appSource.indexOf('\nasync function ', start + 1);
  const candidates = [nextFunction, nextAsync].filter(i => i !== -1);
  const next = candidates.length ? Math.min(...candidates) : -1;
  return appSource.slice(start, next === -1 ? appSource.length : next);
}

function standardConfigBlock(key) {
  const marker = `key:'${key}'`;
  const start = standardSource.indexOf(marker);
  assert.notStrictEqual(start, -1, `${key} should have a standard list config`);
  const rest = standardSource.slice(start);
  const next = rest.search(/\n    \{key:|\n  \];/);
  return next === -1 ? rest : rest.slice(0, next);
}

const topTitleBody = fnBody('renderTopTitleHtml');
const goPageBody = fnBody('goPage');

[
  ['membership-orders', 'memberships', '会员管理', '会员购买记录'],
  ['membership-ledger', 'memberships', '会员管理', '会员权益流水'],
  ['purchases', 'packages', '课包产品', '购买记录']
].forEach(([page, parentPage, parentTitle, currentTitle]) => {
  assert.match(appSource, new RegExp(`'${page}'[\\s\\S]*parentPage:'${parentPage}'[\\s\\S]*parentTitle:'${parentTitle}'[\\s\\S]*title:'${currentTitle}'`), `${page} should define a top title breadcrumb`);
});

assert.match(topTitleBody, /TOP_TITLE_BREADCRUMBS\[pg\]/, 'top title renderer should read the shared breadcrumb config');
assert.match(goPageBody, /topTitle\.innerHTML=renderTopTitleHtml\(pg\)/, 'goPage should render the top title as breadcrumb html');
assert.match(goPageBody, /topTitleParentPage\(pg\)/, 'secondary pages should highlight their parent menu entry');
assert.match(pagesCss, /\.top-title-breadcrumb\{[^}]*display:inline-flex[^}]*align-items:center/, 'breadcrumb title should use the global topbar layout');
assert.match(pagesCss, /\.top-title-parent\{[^}]*background:transparent[^}]*cursor:pointer/, 'breadcrumb parent should look like a text action');
assert.match(pagesCss, /\.top-title-current\{[^}]*color:var\(--shell-page-title-color\)/, 'breadcrumb current page should keep the current title color');

assert.doesNotMatch(html, /返回会员管理/, 'membership audit pages should not keep duplicate back buttons');
assert.doesNotMatch(standardConfigBlock('purchases'), /课包售卖/, 'purchase page should not keep the duplicate package back button');

[
  ['membership-orders', 'membershipOrdersAuditTbody', 'membershipOrdersAuditPagerInfo', 'membershipOrdersAuditPageSize', 'membershipOrdersAuditPagerBtns'],
  ['membership-ledger', 'membershipLedgerAuditTbody', 'membershipLedgerAuditPagerInfo', 'membershipLedgerAuditPageSize', 'membershipLedgerAuditPagerBtns'],
  ['purchases', 'purchaseTbody', 'purPagerInfo', 'purPageSize', 'purPagerBtns']
].forEach(([page, bodyId, pagerInfoId, pageSizeId, pagerBtnsId]) => {
  const shell = standardConfigBlock(page);
  assert.match(html, new RegExp(`id="page-${page}" data-standard-list-shell="${page}"`), `${page} should mount through the global standard list shell`);
  assert.ok(shell.includes(bodyId), `${page} should use a standard table body`);
  assert.ok(shell.includes(pagerInfoId) && shell.includes(pageSizeId) && shell.includes(pagerBtnsId), `${page} should use standard pagination hosts`);
});

assert.match(fnBody('renderMembershipOrdersAuditPage'), /const isMobileList=document\.body\.classList\.contains\('admin-mobile'\),pageState=isMobileList\?[\s\S]*standardListSlice\(rows,membershipOrderAuditPage,membershipOrderAuditPageSize\)/, 'membership purchase audit should use full H5 rows and keep desktop pagination through the standard list helper');
assert.match(fnBody('renderMembershipLedgerAuditPage'), /const isMobileList=document\.body\.classList\.contains\('admin-mobile'\),pageState=isMobileList\?[\s\S]*standardListSlice\(rows,membershipLedgerAuditPage,membershipLedgerAuditPageSize\)/, 'membership ledger audit should use full H5 rows and keep desktop pagination through the standard list helper');
assert.doesNotMatch(html, /membershipOrdersAuditBody|membershipLedgerAuditBody/, 'membership audit pages should not keep custom table body hosts');

console.log('top title breadcrumb view tests passed');
