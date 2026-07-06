const assert = require('assert');
const fs = require('fs');
const path = require('path');

const componentsSource = fs.readFileSync(path.join(__dirname, '..', 'public', 'assets', 'scripts', 'standard', 'components.js'), 'utf8');
const leadsSource = fs.readFileSync(path.join(__dirname, '..', 'public', 'assets', 'scripts', 'pages', 'leads.js'), 'utf8');
const studentsSource = fs.readFileSync(path.join(__dirname, '..', 'public', 'assets', 'scripts', 'pages', 'students.js'), 'utf8');
const scheduleSource = fs.readFileSync(path.join(__dirname, '..', 'public', 'assets', 'scripts', 'pages', 'schedule.js'), 'utf8');
const courtsSource = fs.readFileSync(path.join(__dirname, '..', 'public', 'assets', 'scripts', 'pages', 'courts.js'), 'utf8');
const purchasesSource = fs.readFileSync(path.join(__dirname, '..', 'public', 'assets', 'scripts', 'pages', 'purchases.js'), 'utf8');
const pricesSource = fs.readFileSync(path.join(__dirname, '..', 'public', 'assets', 'scripts', 'pages', 'prices.js'), 'utf8');
const adminUsersSource = fs.readFileSync(path.join(__dirname, '..', 'public', 'assets', 'scripts', 'pages', 'admin-users.js'), 'utf8');
const coachesSource = fs.readFileSync(path.join(__dirname, '..', 'public', 'assets', 'scripts', 'pages', 'coaches.js'), 'utf8');
const campusesSource = fs.readFileSync(path.join(__dirname, '..', 'public', 'assets', 'scripts', 'pages', 'campusmgr.js'), 'utf8');
const entitlementsSource = fs.readFileSync(path.join(__dirname, '..', 'public', 'assets', 'scripts', 'pages', 'entitlements.js'), 'utf8');
const matchesSource = fs.readFileSync(path.join(__dirname, '..', 'public', 'assets', 'scripts', 'pages', 'matches.js'), 'utf8');
const pagesCss = fs.readFileSync(path.join(__dirname, '..', 'public', 'assets', 'styles', 'pages.css'), 'utf8');

[
  'leadMobileCards',
  'studentMobileCards',
  'scheduleMobileCards',
  'courtMobileCards',
  'membershipMobileCards',
  'purchaseMobileCards',
  'priceMobileCards',
  'adminUserMobileCards',
  'coachMobileCards',
  'campusMobileCards',
  'entitlementMobileCards',
  'matchMobileCards',
  'membershipPlanMobileCards',
  'membershipOrderMobileCards',
  'membershipLedgerMobileCards'
].forEach(id => {
  assert.match(
    componentsSource,
    new RegExp(`id="${id}" class="admin-h5-card-list"`),
    `${id} should be mounted by the standard list shell`
  );
});

assert.match(leadsSource, /function renderLeadMobileCards\(list\)[\s\S]*admin-h5-list-card[\s\S]*openLeadDetailFromList[\s\S]*openLeadFollowupFromList/, 'lead H5 should render cards with mobile actions');
assert.match(leadsSource, /renderLeadMobileCards\(slice\);/, 'lead render should update H5 cards with the current full mobile list');

assert.match(studentsSource, /function renderStudentMobileCards\(list\)[\s\S]*admin-h5-list-card[\s\S]*openStudentDetail[\s\S]*openPurchaseModal/, 'student H5 should render cards with mobile actions');
assert.match(studentsSource, /renderStudentMobileCards\(slice\);/, 'student render should update H5 cards with the current full mobile list');
assert.match(scheduleSource, /function renderScheduleMobileCards\(list\)[\s\S]*admin-h5-list-card[\s\S]*openScheduleDetail[\s\S]*openCancelScheduleModal/, 'schedule H5 should render cards with mobile actions');
assert.match(scheduleSource, /renderScheduleMobileCards\(slice\);/, 'schedule render should update H5 cards with the current full mobile list');

assert.match(courtsSource, /function renderCourtMobileCards\(list\)[\s\S]*admin-h5-list-card[\s\S]*openCourtMembershipPanel[\s\S]*openCourtFinanceModal/, 'court H5 should render cards with mobile actions');
assert.match(courtsSource, /renderCourtMobileCards\(slice\);/, 'court render should update H5 cards with the current full mobile list');
assert.match(courtsSource, /function renderMembershipMobileCards\(list\)[\s\S]*admin-h5-list-card[\s\S]*openCourtMembershipPanel[\s\S]*openCourtFinanceModal/, 'membership H5 should render cards with mobile actions');
assert.match(courtsSource, /renderMembershipMobileCards\(slice\);/, 'membership render should update H5 cards with the current full mobile list');

assert.match(purchasesSource, /function renderPurchaseMobileCards\(list\)[\s\S]*admin-h5-list-card[\s\S]*openPurchaseDetailModal[\s\S]*openPurchaseVoidModal/, 'purchase H5 should render cards with mobile actions');
assert.match(purchasesSource, /renderPurchaseMobileCards\(slice\);/, 'purchase render should update H5 cards with the current full mobile list');

assert.match(pricesSource, /function renderPriceMobileCards\(list\)[\s\S]*admin-h5-list-card[\s\S]*openPriceModal[\s\S]*togglePricePlanStatus/, 'price H5 should render cards with mobile actions');
assert.match(pricesSource, /renderPriceMobileCards\(slice\);/, 'price render should update H5 cards with the current full mobile list');

assert.match(adminUsersSource, /function renderAdminUserMobileCards\(list\)[\s\S]*admin-h5-list-card[\s\S]*openAdminUserDetailDrawer[\s\S]*toggleAdminUserStatus/, 'admin users H5 should render cards with mobile actions');
assert.match(adminUsersSource, /renderAdminUserMobileCards\(slice\);/, 'admin users render should update H5 cards');
assert.match(coachesSource, /function renderCoachMobileCards\(list\)[\s\S]*admin-h5-list-card[\s\S]*openCoachModal[\s\S]*confirmDel/, 'coaches H5 should render cards with mobile actions');
assert.match(coachesSource, /renderCoachMobileCards\(d\);/, 'coaches render should update H5 cards');
assert.match(campusesSource, /function renderCampusMobileCards\(list\)[\s\S]*admin-h5-list-card[\s\S]*openCampusModal[\s\S]*confirmDel/, 'campus H5 should render cards with mobile actions');
assert.match(campusesSource, /renderCampusMobileCards\(list\);/, 'campus render should update H5 cards');
assert.match(entitlementsSource, /function renderEntitlementMobileCards\(list\)[\s\S]*admin-h5-list-card[\s\S]*entitlementStatusText/, 'entitlements H5 should render cards');
assert.match(entitlementsSource, /renderEntitlementMobileCards\(list\);/, 'entitlements render should update H5 cards');
assert.match(matchesSource, /function renderMatchMobileCards\(rows\)[\s\S]*admin-h5-list-card[\s\S]*matchActionButtonsHtml/, 'matches H5 should render cards with mobile actions');
assert.match(matchesSource, /renderMatchMobileCards\(rows\);/, 'matches render should update H5 cards');
assert.match(courtsSource, /function renderMembershipPlanMobileCards\(q=''\)[\s\S]*admin-h5-list-card[\s\S]*openMembershipPlanModal[\s\S]*toggleMembershipPlanStatus/, 'membership plans H5 should render cards with mobile actions');
assert.match(courtsSource, /renderMembershipPlanMobileCards\(q\);/, 'membership plans render should update H5 cards');
assert.match(courtsSource, /function renderMembershipOrderMobileCards\(list\)[\s\S]*admin-h5-list-card[\s\S]*membershipOrderBenefitSummaryHtml/, 'membership order audit H5 should render cards');
assert.match(courtsSource, /renderMembershipOrderMobileCards\(slice\);/, 'membership order audit render should update H5 cards');
assert.match(courtsSource, /function renderMembershipLedgerMobileCards\(list\)[\s\S]*admin-h5-list-card[\s\S]*membershipLedgerActionText/, 'membership ledger audit H5 should render cards');
assert.match(courtsSource, /renderMembershipLedgerMobileCards\(slice\);/, 'membership ledger audit render should update H5 cards');

assert.match(pagesCss, /\.admin-h5-card-list\{display:none\}/, 'H5 cards should stay hidden on desktop');
assert.match(
  pagesCss,
  /body\.admin-mobile #page-leads \.tms-table-card,body\.admin-mobile #page-students \.tms-table-card,body\.admin-mobile #page-schedule \.tms-table-card,body\.admin-mobile #page-courts \.tms-table-card,body\.admin-mobile #page-memberships \.tms-table-card,body\.admin-mobile #page-purchases \.tms-table-card,body\.admin-mobile #page-prices \.tms-table-card,body\.admin-mobile #page-admin-users \.tms-table-card,body\.admin-mobile #page-coaches \.tms-table-card,body\.admin-mobile #page-campusmgr \.tms-table-card,body\.admin-mobile #page-entitlements \.tms-table-card,body\.admin-mobile #page-matches \.tms-table-card,body\.admin-mobile #page-membership-plans \.tms-table-card,body\.admin-mobile #page-membership-orders \.tms-table-card,body\.admin-mobile #page-membership-ledger \.tms-table-card,body\.admin-mobile #page-finance #financeLedgerPanel \.tms-table-card,body\.admin-mobile #page-finance #financeRevenuePanel \.tms-table-card,body\.admin-mobile #page-finance #financeRecognizedPanel \.tms-table-card\{display:none\}/,
  'high-frequency H5 card pages should hide desktop tables'
);
assert.match(
  pagesCss,
  /body\.admin-mobile #page-leads \.admin-h5-card-list,body\.admin-mobile #page-students \.admin-h5-card-list,body\.admin-mobile #page-schedule \.admin-h5-card-list,body\.admin-mobile #page-courts \.admin-h5-card-list,body\.admin-mobile #page-memberships \.admin-h5-card-list,body\.admin-mobile #page-purchases \.admin-h5-card-list,body\.admin-mobile #page-prices \.admin-h5-card-list,body\.admin-mobile #page-admin-users \.admin-h5-card-list,body\.admin-mobile #page-coaches \.admin-h5-card-list,body\.admin-mobile #page-campusmgr \.admin-h5-card-list,body\.admin-mobile #page-entitlements \.admin-h5-card-list,body\.admin-mobile #page-matches \.admin-h5-card-list,body\.admin-mobile #page-membership-plans \.admin-h5-card-list,body\.admin-mobile #page-membership-orders \.admin-h5-card-list,body\.admin-mobile #page-membership-ledger \.admin-h5-card-list,body\.admin-mobile #page-finance \.admin-h5-card-list\{[^}]*display:flex[^}]*flex-direction:column/,
  'high-frequency H5 pages should show card feeds'
);
assert.match(pagesCss, /body\.admin-mobile \.admin-h5-card-grid\{[^}]*grid-template-columns:repeat\(2,minmax\(0,1fr\)\)/, 'H5 list cards should use a compact two-column detail grid');
assert.match(pagesCss, /body\.admin-mobile \.admin-h5-card-actions button\{[^}]*height:40px/, 'H5 list card actions should use touch-friendly buttons');

console.log('admin h5 card list view tests passed');
