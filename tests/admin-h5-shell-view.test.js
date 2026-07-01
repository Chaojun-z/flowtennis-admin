const assert = require('assert');
const fs = require('fs');
const path = require('path');
const { appSource } = require('./helpers/read-index-bundle');

const pagesCss = fs.readFileSync(path.join(__dirname, '..', 'public', 'assets', 'styles', 'pages.css'), 'utf8');

assert.match(appSource, /function adminMobileNavConfig\(/, 'admin H5 shell should define one shared first-level nav config');
assert.match(appSource, /function renderAdminMobileNavShell\(/, 'admin H5 shell should render from the shared component layer');
assert.match(appSource, /function openAdminMobileModule\(/, 'admin H5 shell should open a reusable second-level panel');
assert.match(appSource, /function syncAdminMobileNavState\(/, 'admin H5 shell should sync active module from the current page');
assert.match(appSource, /const ADMIN_MOBILE_DEFAULT_MODULE='teaching'/, 'admin H5 shell should default to teaching center');
assert.match(appSource, /function adminMobileShouldUseDefaultPage\(/, 'admin H5 shell should decide first-load default page in one shared helper');
assert.match(appSource, /currentPage='schedule'[\s\S]*localStorage\.setItem\(PAGE_KEY,currentPage\)/, 'admin H5 first load should default to schedule under teaching center');

[
  ['customer', '客户中心'],
  ['teaching', '教学中心'],
  ['court', '场地会员'],
  ['pricing', '产品定价'],
  ['finance', '财务中心'],
  ['operations', '经营分析'],
  ['system', '系统设置']
].forEach(([key, label]) => {
  assert.match(appSource, new RegExp(`key:'${key}'[\\s\\S]*?label:'${label}'`), `admin H5 config should expose first-level module ${label}`);
});
assert.match(appSource, /data-admin-mobile-module="\$\{esc\(item\.key\)\}"/, 'admin H5 shell should render first-level modules from shared config');

assert.match(appSource, /key:'teaching'[\s\S]*?label:'教学中心'[\s\S]*?defaultPage:'schedule'[\s\S]*?排课管理[\s\S]*?goPage:'schedule'[\s\S]*?排课日历[\s\S]*?goPage:'coachschedule'/, 'teaching center should default to schedule and expose schedule sub pages');
assert.match(appSource, /key:'finance'[\s\S]*?财务总览[\s\S]*?financePanel:'ledger'[\s\S]*?收款流水[\s\S]*?financePanel:'revenue'[\s\S]*?入账流水[\s\S]*?financePanel:'recognized'/, 'finance center should expose all finance second-level pages');
assert.match(appSource, /key:'operations'[\s\S]*?经营总览[\s\S]*?operationsTab:'overview'[\s\S]*?场地运转[\s\S]*?operationsTab:'court'[\s\S]*?转化与留存[\s\S]*?operationsTab:'conversion'[\s\S]*?教练人效[\s\S]*?operationsTab:'coach'/, 'operations center should expose all operation second-level pages');

assert.match(pagesCss, /body\.admin-mobile \.admin-mobile-shell\{/, 'admin mobile shell should have mobile-only layout rules');
assert.match(pagesCss, /body\.admin-mobile \.admin-mobile-module-bar\{/, 'admin mobile shell should render the first-level module bar');
assert.match(pagesCss, /body\.admin-mobile \.admin-mobile-module-panel\.open\{/, 'admin mobile shell should render an open state for the second-level panel');
assert.doesNotMatch(pagesCss, /body\.admin-mobile #sbAdminView\{display:flex;align-items:stretch;width:max-content/, 'admin mobile should not expose every sidebar item as one long bottom nav');

console.log('admin h5 shell view tests passed');
