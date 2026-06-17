const assert = require('assert');
const fs = require('fs');
const path = require('path');
const vm = require('vm');

const source = fs.readFileSync(path.join(__dirname, '../public/assets/scripts/core/state.js'), 'utf8');
const utilsSource = fs.readFileSync(path.join(__dirname, '../public/assets/scripts/core/utils.js'), 'utf8');

const context = {
  console,
  window: {
    innerWidth: 1280,
    location: { hostname: 'www.flowtennis.cn', search: '' },
    coachWorkbenchStats: {},
    addEventListener() {}
  },
  location: { hostname: 'www.flowtennis.cn', search: '' },
  localStorage: {
    getItem() { return null; },
    setItem() {},
    removeItem() {},
    key() { return null; },
    length: 0
  },
  document: {
    hidden: false,
    addEventListener() {},
    getElementById() { return null; },
    body: { classList: { toggle() {}, contains() { return false; } } }
  },
  URLSearchParams,
  setInterval() {},
  clearInterval() {},
  currentUser: { id: 'u1', role: 'admin', name: '管理员' },
  currentPage: 'students',
  CAMPUS: {},
  PAGE_KEY: 'ft_page',
  CAMPUS_KEY: 'ft_campus',
  campus: 'all',
  navigator: {},
  esc(value) { return String(value ?? ''); },
  toast() {},
  apiCall() { return Promise.resolve([]); },
  campusDisplayName(value) { return value; },
  doLogout() {},
  renderRoleShell() {},
  goPage() {},
  openPendingScheduleDeepLink() {},
  renderStudents() {},
  renderLeads() {},
  renderClasses() {},
  renderSchedule() {},
  renderCoachOps() {},
  renderFinanceCenter() {},
  renderProducts() {},
  renderPackages() {},
  renderPurchases() {},
  renderPrices() {},
  renderEntitlements() {},
  renderCoaches() {},
  loadAdminUsers() {},
  renderCourts() {},
  renderMatches() {},
  renderMemberships() {},
  renderMembershipOrdersAuditPage() {},
  renderMembershipLedgerAuditPage() {},
  renderMembershipPlans() {},
  renderCampuses() {},
  renderWorkbench() {},
  renderPostClassFeedback() {},
  renderMyStudents() {},
  renderMyClasses() {}
};

vm.createContext(context);

assert.doesNotThrow(() => {
  vm.runInContext(source, context, { filename: 'state.js' });
}, 'state.js should finish top-level execution without startup exceptions');

assert.strictEqual(typeof context.hydrateDatasetsFromCache, 'function', 'state should expose cache hydration after startup');
assert.doesNotThrow(() => {
  context.hydrateDatasetsFromCache();
}, 'cache hydration should not access uninitialized globals after startup');
assert.doesNotThrow(() => {
  context.renderAll();
}, 'renderAll should not call missing legacy class counter');
assert.match(utilsSource, /window\.shanghaiNow=shanghaiNow;/, 'shanghaiNow must be exposed for separately loaded page scripts');
assert.match(utilsSource, /window\.esc=esc;/, 'esc must be exposed for separately loaded page scripts');

console.log('state startup execution tests passed');
