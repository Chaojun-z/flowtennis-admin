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
assert.match(appSource, /function renderAdminMobileCascadeFilters\(/, 'admin H5 filters should render a shared mobile cascade selector');
assert.match(appSource, /function setAdminMobileCascadeGroup\(/, 'admin H5 cascade filters should switch first-level filter groups');
assert.match(appSource, /function selectAdminMobileCascadeFilter\(/, 'admin H5 cascade filters should select second-level filter options');
assert.match(appSource, /const joinClasses=\(base,custom\)=>\[base,[\s\S]*?filterClass[\s\S]*?toolbarClass[\s\S]*?actionsClass/, 'standard toolbar should keep base H5 classes even when a page uses custom desktop classes');
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
assert.match(pagesCss, /body\.admin-mobile #page-leads \.tms-stats-row,body\.admin-mobile #page-students \.tms-stats-row\{[^}]*display:flex[^}]*overflow-x:auto[^}]*margin:0 -16px 10px[^}]*padding:0/, 'lead and student H5 sample KPI cards should scroll through the viewport edge without fixed side blanks');
assert.match(pagesCss, /body\.admin-mobile #page-leads \.tms-stats-row \.tms-stat-card:first-child,body\.admin-mobile #page-students \.tms-stats-row \.tms-stat-card:first-child\{margin-left:16px\}/, 'lead and student H5 sample KPI cards should keep initial page padding via card margin');
assert.match(pagesCss, /body\.admin-mobile #page-leads \.tms-stat-sub,body\.admin-mobile #page-students \.tms-stat-sub\{display:none\}/, 'lead and student H5 sample pages should hide KPI formula text from the card body');
assert.match(pagesCss, /body\.admin-mobile #page-leads \.tms-stat-value,body\.admin-mobile #page-students \.tms-stat-value\{[^}]*display:flex[^}]*align-items:baseline/, 'lead and student H5 KPI values should keep percentages visible inline');
assert.match(pagesCss, /body\.admin-mobile #page-students \.student-stat-pair span:not\(\.student-stat-divider\)\{font-size:17px\}/, 'formal student first KPI should stay readable on H5');
assert.match(pagesCss, /body\.admin-mobile \.tms-stats-row,body\.admin-mobile #courtStatsRow\.court-dashboard-stats,body\.admin-mobile #page-finance \.finance-ledger-stats,body\.admin-mobile #page-operations \.operations-kpi-row,body\.admin-mobile #page-operations \.operations-coach-kpi-strip\{[^}]*display:flex!important[^}]*overflow-x:auto[^}]*max-height:94px/, 'all admin H5 KPI rows should use one compact horizontal strip instead of page-specific tall grids');
assert.match(pagesCss, /body\.admin-mobile \.tms-stats-row>\.tms-stat-card,body\.admin-mobile #courtStatsRow\.court-dashboard-stats>\.tms-stat-card,body\.admin-mobile #page-finance \.finance-ledger-stats>\.tms-stat-card[\s\S]*flex:0 0 calc\(\(100vw - 48px\)\/3\)/, 'standard H5 KPI cards should keep three visible cards per viewport');
assert.match(pagesCss, /body\.admin-mobile \.tms-stat-sub,body\.admin-mobile #page-operations \.operations-kpi-card p\{display:none!important\}/, 'standard H5 KPI cards should hide explanatory copy from the card body');
assert.match(appSource, /class="tms-mobile-filter-trigger" aria-label="筛选"[\s\S]*class="tms-mobile-filter-icon"/, 'lead and student H5 sample pages should use an icon-only filter trigger');
assert.match(pagesCss, /body\.admin-mobile #page-leads \.tms-mobile-filter-trigger,body\.admin-mobile #page-students \.tms-mobile-filter-trigger,body\.admin-mobile #page-courts \.tms-mobile-filter-trigger,body\.admin-mobile #page-memberships \.tms-mobile-filter-trigger,body\.admin-mobile #page-matches \.tms-mobile-filter-trigger\{[^}]*width:42px[^}]*height:42px/, 'lead, student and court H5 filter triggers should align to the search field height');
assert.match(pagesCss, /body\.admin-mobile #page-schedule \.tms-mobile-filter-trigger,body\.admin-mobile #page-purchases \.tms-mobile-filter-trigger,body\.admin-mobile #page-packages \.tms-mobile-filter-trigger,body\.admin-mobile #page-prices \.tms-mobile-filter-trigger\{[^}]*width:42px[^}]*height:42px/, 'first batch H5 pages should expose the same icon-only filter trigger');
assert.match(pagesCss, /body\.admin-mobile #page-products \.tms-mobile-filter-trigger,body\.admin-mobile #page-entitlements \.tms-mobile-filter-trigger\{[^}]*width:42px[^}]*height:42px/, 'remaining standard H5 pages should expose the same icon-only filter trigger');
assert.match(pagesCss, /body\.admin-mobile \.tms-mobile-filter-trigger\{display:inline-flex;width:42px;height:42px/, 'all standard H5 pages with filters should use the shared icon-only trigger');
assert.match(pagesCss, /body\.admin-mobile #page-leads \.tms-filters,body\.admin-mobile #page-students \.tms-filters,body\.admin-mobile #page-courts \.tms-filters,body\.admin-mobile #page-memberships \.tms-filters,body\.admin-mobile #page-matches \.tms-filters\{[^}]*position:absolute[^}]*top:calc\(100% \+ 8px\)[^}]*width:min\(330px,calc\(100vw - 32px\)\)[^}]*height:min\(340px,calc\(100dvh - 180px\)\)/, 'H5 filters should open as a compact cascade panel below the filter icon');
assert.match(pagesCss, /body\.admin-mobile #page-schedule \.tms-filters,body\.admin-mobile #page-purchases \.tms-filters,body\.admin-mobile #page-packages \.tms-filters,body\.admin-mobile #page-prices \.tms-filters\{[^}]*position:absolute[^}]*top:calc\(100% \+ 8px\)[^}]*width:min\(330px,calc\(100vw - 32px\)\)[^}]*height:min\(340px,calc\(100dvh - 180px\)\)/, 'first batch H5 filters should use the shared compact cascade panel');
assert.match(pagesCss, /body\.admin-mobile #page-products \.tms-filters,body\.admin-mobile #page-entitlements \.tms-filters\{[^}]*position:absolute[^}]*top:calc\(100% \+ 8px\)[^}]*width:min\(330px,calc\(100vw - 32px\)\)[^}]*height:min\(340px,calc\(100dvh - 180px\)\)/, 'remaining standard H5 filters should use the shared compact cascade panel');
assert.match(pagesCss, /body\.admin-mobile \.tms-toolbar\.mobile-filter-open \.tms-mobile-cascade\{display:grid;grid-template-columns:104px minmax\(0,1fr\)\}/, 'H5 filter panel should use a first-level and second-level cascade layout');
assert.match(pagesCss, /body\.admin-mobile \.tms-mobile-cascade-tab\.active\{[^}]*background:#FFFCF8/, 'H5 cascade first-level item should have a mobile-grade active state');
assert.match(pagesCss, /body\.admin-mobile \.tms-mobile-cascade-option\.active\{[^}]*background:#F3E8DD/, 'H5 cascade second-level option should have a mobile-grade active state');
assert.match(pagesCss, /body\.admin-mobile\.admin-mobile-filter-open::after\{display:none\}/, 'lead and student H5 filters should not add a full-page blocking mask');
assert.match(pagesCss, /body\.admin-mobile #page-leads \.tms-toolbar-right \.tms-btn-primary,body\.admin-mobile #page-students \.tms-toolbar-right \.tms-btn-primary\{[^}]*position:fixed[^}]*border-radius:50%/, 'lead and student H5 sample pages should use a floating create action');
assert.match(pagesCss, /body\.admin-mobile #page-schedule \.tms-toolbar-right \.tms-btn-primary,body\.admin-mobile #page-purchases \.tms-toolbar-right \.tms-btn-primary,body\.admin-mobile #page-packages \.tms-toolbar-right \.tms-btn-primary,body\.admin-mobile #page-membership-plans \.tms-toolbar-right \.tms-btn-primary,body\.admin-mobile #page-prices \.tms-toolbar-right \.tms-btn-primary,body\.admin-mobile #page-coaches \.tms-toolbar-right \.tms-btn-primary,body\.admin-mobile #page-admin-users \.tms-toolbar-right \.tms-btn-primary,body\.admin-mobile #page-campusmgr \.tms-toolbar-right \.tms-btn-primary\{[^}]*position:fixed[^}]*border-radius:50%/, 'first batch H5 create buttons should use the same floating action pattern');
assert.match(pagesCss, /body\.admin-mobile \.tms-toolbar-right \.tms-export-action,body\.admin-mobile \.tms-toolbar-right \.tms-import-action,body\.admin-mobile \.tms-toolbar-right \.tms-btn-ghost,body\.admin-mobile #page-memberships \.tms-toolbar-secondary-actions\{display:none!important\}/, 'admin H5 toolbars should hide desktop export/import/ghost actions from the content area');
assert.match(pagesCss, /body\.admin-mobile \.tms-toolbar-right \.tms-btn-primary\{[^}]*position:fixed[^}]*border-radius:50%/, 'all standard H5 create actions should share one floating action rule');
assert.match(pagesCss, /body\.admin-mobile #page-leads \.tms-toolbar-right \.tms-btn-primary::before[\s\S]*width:24px[\s\S]*transform:translate\(-50%,-50%\)/, 'lead create plus horizontal stroke should be centered');
assert.match(pagesCss, /body\.admin-mobile #page-leads \.tms-toolbar-right \.tms-btn-primary::after[\s\S]*height:24px[\s\S]*transform:translate\(-50%,-50%\)/, 'lead create plus vertical stroke should be centered');
assert.match(pagesCss, /body\.admin-mobile #page-schedule \.tms-toolbar-right \.tms-btn-primary::before[\s\S]*width:24px[\s\S]*transform:translate\(-50%,-50%\)/, 'first batch create plus horizontal stroke should be centered');
assert.match(pagesCss, /body\.admin-mobile #page-schedule \.tms-toolbar-right \.tms-btn-primary::after[\s\S]*height:24px[\s\S]*transform:translate\(-50%,-50%\)/, 'first batch create plus vertical stroke should be centered');
assert.match(pagesCss, /body\.admin-mobile \.tms-table-wrapper\{[^}]*scrollbar-width:none/, 'admin mobile lists should hide native scrollbars');
assert.match(pagesCss, /body\.admin-mobile \.tms-table-card\{[^}]*margin-left:-16px[^}]*margin-right:-16px/, 'admin mobile table shell should let the content scroll through the viewport edge');
assert.match(pagesCss, /body\.admin-mobile \.tms-table\{margin-left:16px;margin-right:16px\}/, 'admin mobile table should keep initial side spacing on the scrollable content itself');
assert.match(pagesCss, /body\.admin-mobile \.tms-table-wrapper\{padding:0 16px;max-height:none;overflow-x:auto/, 'admin mobile table wrapper should provide initial side padding that scrolls away');
assert.match(pagesCss, /body\.admin-mobile \.tms-table\{margin:0;background:#FDF7F2/, 'admin mobile table content should not create fixed side blanks with table margins');
assert.match(pagesCss, /body\.admin-mobile #page-leads \.tms-table th\.tms-sticky-r,body\.admin-mobile #page-students \.tms-table th\.tms-sticky-r[\s\S]*width:104px!important/, 'lead and student H5 action column should not keep desktop-width blank space');
assert.match(pagesCss, /body\.admin-mobile #page-schedule \.tms-table th\.tms-sticky-r,body\.admin-mobile #page-purchases \.tms-table th\.tms-sticky-r[\s\S]*width:112px!important/, 'first batch H5 action columns should not keep desktop-width blank space');
assert.match(appSource, /function renderLeads\([\s\S]*const isMobileList=document\.body\.classList\.contains\('admin-mobile'\)[\s\S]*slice:list/, 'lead H5 sample page should render the full filtered list instead of a 20-row desktop page');
assert.match(appSource, /function renderStudents\([\s\S]*const isMobileList=document\.body\.classList\.contains\('admin-mobile'\)[\s\S]*slice:list/, 'student H5 sample page should render the full filtered list instead of a 20-row desktop page');
assert.match(appSource, /function renderCourtAccountListView\([\s\S]*const isMobileList=document\.body\.classList\.contains\('admin-mobile'\)[\s\S]*slice=isMobileList\?sortedList/, 'court H5 page should render the full filtered list instead of a desktop page slice');
assert.match(appSource, /function renderMemberships\([\s\S]*const isMobileList=document\.body\.classList\.contains\('admin-mobile'\)[\s\S]*slice=isMobileList\?sortedRows/, 'membership H5 page should render the full filtered list instead of a desktop page slice');
assert.match(appSource, /function renderSchedule\([\s\S]*const isMobileList=document\.body\.classList\.contains\('admin-mobile'\)[\s\S]*slice:list/, 'schedule H5 page should render the full filtered list instead of a desktop page slice');
assert.match(appSource, /function renderPurchases\([\s\S]*const isMobileList=document\.body\.classList\.contains\('admin-mobile'\)[\s\S]*slice:list/, 'purchase H5 page should render the full filtered list instead of a desktop page slice');
assert.match(appSource, /function renderPrices\([\s\S]*const isMobileList=document\.body\.classList\.contains\('admin-mobile'\)[\s\S]*slice:rows/, 'price H5 page should render the full filtered list instead of a desktop page slice');
assert.match(appSource, /function renderAdminUsers\([\s\S]*const isMobileList=document\.body\.classList\.contains\('admin-mobile'\)[\s\S]*slice:list/, 'admin users H5 page should render the full filtered list instead of a desktop page slice');
assert.match(pagesCss, /body\.admin-mobile #page-leads \.tms-pagination,body\.admin-mobile #page-students \.tms-pagination,body\.admin-mobile #page-courts \.tms-pagination,body\.admin-mobile #page-memberships \.tms-pagination\{display:none!important\}/, 'lead, student, court and membership H5 pages should hide desktop pagination');
assert.match(pagesCss, /body\.admin-mobile #page-schedule \.tms-pagination,body\.admin-mobile #page-purchases \.tms-pagination,body\.admin-mobile #page-prices \.tms-pagination,body\.admin-mobile #page-admin-users \.tms-pagination\{display:none!important\}/, 'first batch H5 pages should hide desktop pagination');
assert.match(pagesCss, /body\.admin-mobile #page-membership-orders \.tms-pagination,body\.admin-mobile #page-membership-ledger \.tms-pagination\{display:none!important\}/, 'membership audit H5 pages should hide desktop pagination');
assert.match(appSource, /function fmt\(n\)\{return Math\.round\(Number\(n\)\|\|0\)\.toLocaleString\('zh-CN'\)\}/, 'shared numeric formatter should remove money decimals everywhere it is used');
assert.match(pagesCss, /body\.admin-mobile \.modal\.modal-court\.modal-student-drawer \.schedule-detail-form \.tms-form-row[\s\S]*grid-template-columns:1fr!important/, 'student H5 drawer edit forms should be single-column and stay inside the viewport');
assert.match(pagesCss, /body\.admin-mobile \.tms-sticky-l,body\.admin-mobile \.tms-sticky-r[\s\S]*position:static!important/, 'admin mobile tables should not keep left and right fixed columns');
assert.match(pagesCss, /body\.admin-mobile \.tms-sticky-l,body\.admin-mobile \.tms-sticky-r[\s\S]*top:auto!important[\s\S]*box-shadow:none!important/, 'admin mobile tables should remove sticky top/side shadows that cover content');
assert.match(pagesCss, /body\.admin-mobile \.tms-skeleton-card-grid,body\.admin-mobile \.tms-skeleton-board-grid\{[^}]*display:flex[^}]*overflow-x:auto/, 'admin H5 loading skeletons should use the same compact horizontal pattern');
assert.match(pagesCss, /body\.admin-mobile #page-packages \.package-board-column\{flex:0 0 min\(82vw,320px\)/, 'package board H5 columns should show one usable column with only a small next-column hint');
assert.match(pagesCss, /body\.admin-mobile #page-products \.course-showcase-grid\{grid-template-columns:1fr/, 'product H5 cards should use one column instead of a 360px desktop grid');

console.log('admin h5 shell view tests passed');
