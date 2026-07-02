const assert = require('assert');
const fs = require('fs');
const path = require('path');
const { appSource } = require('./helpers/read-index-bundle');

const pagesCss = fs.readFileSync(path.join(__dirname, '..', 'public', 'assets', 'styles', 'pages.css'), 'utf8');

assert.match(appSource, /function adminMobileNavConfig\(/, 'admin H5 shell should define one shared first-level nav config');
assert.match(appSource, /function renderAdminMobileNavShell\(/, 'admin H5 shell should render from the shared component layer');
assert.match(appSource, /function openAdminMobileModule\(/, 'admin H5 shell should open a reusable second-level panel');
assert.match(appSource, /function toggleAdminMobileModule\(/, 'admin H5 drawer should expand second-level pages from a first-level module');
assert.match(appSource, /function showAdminMobileKpiHint\(/, 'admin H5 KPI cards should expose tap-to-view metric help');
assert.match(appSource, /function toggleAdminMobileFilters\(/, 'admin H5 standard toolbar should expose a mobile filter sheet trigger');
assert.match(appSource, /function closeAdminMobileFilters\(/, 'admin H5 standard toolbar should expose a mobile filter sheet close action');
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
assert.match(appSource, /data-admin-mobile-module="\$\{esc\(group\.key\)\}"/, 'admin H5 shell should render first-level modules from shared config');
assert.match(appSource, /class="admin-mobile-drawer-section\$\{expanded\?' open':''\}"/, 'admin H5 should use a drawer accordion instead of a flat bottom menu');
assert.doesNotMatch(
  appSource,
  /function openAdminMobileModule\([\s\S]*?syncAdminMobileNavState\(\);[\s\S]*?function closeAdminMobileModule\(/,
  'opening an admin H5 module should not immediately reset to the current page module'
);

assert.match(appSource, /key:'teaching'[\s\S]*?label:'教学中心'[\s\S]*?defaultPage:'schedule'[\s\S]*?排课管理[\s\S]*?goPage:'schedule'[\s\S]*?排课日历[\s\S]*?goPage:'coachschedule'/, 'teaching center should default to schedule and expose schedule sub pages');
assert.match(appSource, /key:'finance'[\s\S]*?财务总览[\s\S]*?financePanel:'ledger'[\s\S]*?收款流水[\s\S]*?financePanel:'revenue'[\s\S]*?入账流水[\s\S]*?financePanel:'recognized'/, 'finance center should expose all finance second-level pages');
assert.match(appSource, /key:'operations'[\s\S]*?经营总览[\s\S]*?operationsTab:'overview'[\s\S]*?场地运转[\s\S]*?operationsTab:'court'[\s\S]*?转化与留存[\s\S]*?operationsTab:'conversion'[\s\S]*?教练人效[\s\S]*?operationsTab:'coach'/, 'operations center should expose all operation second-level pages');

assert.match(pagesCss, /body\.admin-mobile \.admin-mobile-shell\{/, 'admin mobile shell should have mobile-only layout rules');
assert.doesNotMatch(pagesCss, /body\.admin-mobile \.admin-mobile-module-bar\{/, 'admin mobile should not render a crowded bottom module bar');
assert.match(pagesCss, /body\.admin-mobile \.admin-mobile-module-scrim\{[^}]*inset:0/, 'admin mobile menu mask should cover the full page');
assert.match(pagesCss, /body\.admin-mobile \.admin-mobile-module-panel\{[^}]*left:0[^}]*top:0[^}]*bottom:0[^}]*width:min\(84vw,340px\)[^}]*transform:translateX\(-102%\)/, 'admin mobile menu should slide in as a full-height left navigation drawer');
assert.match(pagesCss, /body\.admin-mobile \.admin-mobile-module-panel\.open\{/, 'admin mobile shell should render an open state for the second-level panel');
assert.match(pagesCss, /body\.admin-mobile \.admin-mobile-module-btn\.active\{background:transparent;color:#4D4037\}/, 'admin mobile first-level modules should expand without a strong selected block');
assert.match(appSource, /class="admin-mobile-module-chevron" aria-hidden="true"><svg viewBox="0 0 24 24"><path d="M9 6l6 6-6 6"\/><\/svg>/, 'admin mobile first-level expand icon should use a proper chevron svg');
assert.match(pagesCss, /body\.admin-mobile \.admin-mobile-sub-item\.active::before/, 'admin mobile second-level active item should use a mobile-grade marker instead of a desktop full-row block');
assert.doesNotMatch(pagesCss, /body\.admin-mobile #sbAdminView\{display:flex;align-items:stretch;width:max-content/, 'admin mobile should not expose every sidebar item as one long bottom nav');
assert.match(pagesCss, /body\.admin-mobile \.topbar\{[^}]*grid-template-columns:42px minmax\(0,1fr\) auto/, 'admin mobile topbar should use left menu, centered title, and right filter icons');
assert.match(pagesCss, /body\.admin-mobile \.admin-mobile-menu-trigger\{/, 'admin mobile topbar should expose a left menu trigger');
assert.match(pagesCss, /body\.admin-mobile #campusTabs \.court-top-select \.court-top-display\{[^}]*width:38px[^}]*border-radius:50%/, 'admin mobile top filters should be icon-only buttons');
assert.match(pagesCss, /body\.admin-mobile #campusTabs \.court-top-display-text,body\.admin-mobile #campusTabs \.court-top-display-chevron\{display:none\}/, 'admin mobile top filter labels and chevrons should be hidden');
assert.match(pagesCss, /body\.admin-mobile \.stats-row,body\.admin-mobile \.tms-stats-row\{[^}]*grid-template-columns:repeat\(3,minmax\(0,1fr\)\)/, 'admin mobile data blocks should show three per row');
assert.match(pagesCss, /body\.admin-mobile #page-leads \.tms-stats-row,body\.admin-mobile #page-students \.tms-stats-row\{[^}]*display:flex[^}]*overflow-x:auto[^}]*max-height:94px/, 'lead and student H5 sample pages should use one-row horizontal KPI cards');
assert.match(pagesCss, /body\.admin-mobile #page-leads \.tms-stat-sub,body\.admin-mobile #page-students \.tms-stat-sub\{display:none\}/, 'lead and student H5 sample pages should hide KPI formula text from the card body');
assert.match(appSource, /class="tms-mobile-filter-trigger" aria-label="筛选"[\s\S]*class="tms-mobile-filter-icon"/, 'lead and student H5 sample pages should use an icon-only filter trigger');
assert.match(pagesCss, /body\.admin-mobile #page-leads \.tms-mobile-filter-trigger,body\.admin-mobile #page-students \.tms-mobile-filter-trigger\{[^}]*width:42px[^}]*height:42px/, 'mobile filter trigger should align to the search field height');
assert.match(pagesCss, /body\.admin-mobile #page-leads \.tms-filters,body\.admin-mobile #page-students \.tms-filters\{[^}]*position:fixed[^}]*bottom:0[^}]*transform:translateY\(105%\)/, 'lead and student H5 sample pages should put filters into a bottom sheet');
assert.match(pagesCss, /body\.admin-mobile #page-leads \.tms-toolbar-right \.tms-btn-primary,body\.admin-mobile #page-students \.tms-toolbar-right \.tms-btn-primary\{[^}]*position:fixed[^}]*border-radius:50%/, 'lead and student H5 sample pages should use a floating create action');
assert.match(pagesCss, /body\.admin-mobile \.tms-table-wrapper\{[^}]*scrollbar-width:none/, 'admin mobile lists should hide native scrollbars');
assert.match(appSource, /function renderLeads\([\s\S]*const isMobileList=document\.body\.classList\.contains\('admin-mobile'\)[\s\S]*slice:list/, 'lead H5 sample page should render the full filtered list instead of a 20-row desktop page');
assert.match(appSource, /function renderStudents\([\s\S]*const isMobileList=document\.body\.classList\.contains\('admin-mobile'\)[\s\S]*slice:list/, 'student H5 sample page should render the full filtered list instead of a 20-row desktop page');
assert.match(pagesCss, /body\.admin-mobile #page-leads \.tms-pagination,body\.admin-mobile #page-students \.tms-pagination\{display:none!important\}/, 'lead and student H5 sample pages should hide desktop pagination');
assert.match(pagesCss, /body\.admin-mobile \.modal\.modal-court\.modal-student-drawer \.schedule-detail-form \.tms-form-row[\s\S]*grid-template-columns:1fr!important/, 'student H5 drawer edit forms should be single-column and stay inside the viewport');
assert.match(pagesCss, /body\.admin-mobile \.tms-sticky-l,body\.admin-mobile \.tms-sticky-r[\s\S]*position:static!important/, 'admin mobile tables should not keep left and right fixed columns');

console.log('admin h5 shell view tests passed');
