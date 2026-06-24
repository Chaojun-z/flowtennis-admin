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

function createStorage(seed = {}) {
  const store = new Map(Object.entries(seed));
  return {
    getItem(key) {
      return store.has(key) ? store.get(key) : null;
    },
    setItem(key, value) {
      store.set(key, String(value));
    },
    removeItem(key) {
      store.delete(key);
    },
    key(index) {
      return [...store.keys()][index] || null;
    },
    get length() {
      return store.size;
    }
  };
}

async function loadStateWithStorage(seed, apiImpl) {
  const runtime = {
    console,
    window: {
      innerWidth: 1280,
      location: { hostname: 'www.flowtennis.cn', search: '' },
      coachWorkbenchStats: {},
      addEventListener() {}
    },
    location: { hostname: 'www.flowtennis.cn', search: '' },
    localStorage: createStorage(seed),
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
    currentPage: 'membership-plans',
    CAMPUS: {},
    PAGE_KEY: 'ft_page',
    CAMPUS_KEY: 'ft_campus',
    campus: 'all',
    navigator: {},
    esc(value) { return String(value ?? ''); },
    toast() {},
    apiCall: apiImpl,
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
  vm.createContext(runtime);
  vm.runInContext(source, runtime, { filename: 'state.js' });
  return runtime;
}

(async () => {
  const staleSavedAt = Date.now() - 5 * 60 * 1000;
  const cacheSeed = {
    ft_dataset_cache_version: '2026-06-09-campus-scope-v1',
    'ft_dataset_cache_production_www.flowtennis.cn_u1_membershipPlans': JSON.stringify({ savedAt: staleSavedAt, data: [{ id: 'plan-old' }] }),
    'ft_dataset_cache_production_www.flowtennis.cn_u1_membershipOrders': JSON.stringify({ savedAt: staleSavedAt, data: [{ id: 'order-old' }] }),
    'ft_dataset_cache_production_www.flowtennis.cn_u1_campuses': JSON.stringify({ savedAt: staleSavedAt, data: [{ id: 'campus-old' }] }),
    'ft_dataset_cache_production_www.flowtennis.cn_u1_coaches': JSON.stringify({ savedAt: staleSavedAt, data: [{ id: 'coach-old' }] })
  };
  const apiCalls = [];
  const runtime = await loadStateWithStorage(cacheSeed, (method, path) => {
    apiCalls.push(`${method} ${path}`);
    return Promise.resolve([]);
  });
  runtime.hydrateDatasetsFromCache();
  await runtime.ensurePageDatasets('membership-plans');
  assert.deepStrictEqual(
    apiCalls,
    [
      'GET /membership-plans',
      'GET /membership-orders',
      'GET /campuses',
      'GET /coaches'
    ],
    'stale membership plan caches should not block a fresh request on page entry'
  );
})().catch((error) => {
  console.error(error);
  process.exit(1);
});

(async () => {
  const freshSavedAt = Date.now() - 10 * 1000;
  const cacheSeed = {
    ft_dataset_cache_version: '2026-06-09-campus-scope-v1',
    'ft_dataset_cache_production_www.flowtennis.cn_u1_membershipPlans': JSON.stringify({ savedAt: freshSavedAt, data: [{ id: 'plan-fresh' }] }),
    'ft_dataset_cache_production_www.flowtennis.cn_u1_membershipOrders': JSON.stringify({ savedAt: freshSavedAt, data: [{ id: 'order-fresh' }] }),
    'ft_dataset_cache_production_www.flowtennis.cn_u1_campuses': JSON.stringify({ savedAt: freshSavedAt, data: [{ id: 'campus-fresh' }] }),
    'ft_dataset_cache_production_www.flowtennis.cn_u1_coaches': JSON.stringify({ savedAt: freshSavedAt, data: [{ id: 'coach-fresh' }] })
  };
  const apiCalls = [];
  const runtime = await loadStateWithStorage(cacheSeed, (method, path) => {
    apiCalls.push(`${method} ${path}`);
    return Promise.resolve([]);
  });
  runtime.hydrateDatasetsFromCache();
  await runtime.ensurePageDatasets('membership-plans');
  assert.deepStrictEqual(
    apiCalls,
    [],
    'fresh membership plan caches should still satisfy immediate page entry without duplicate requests'
  );
})().catch((error) => {
  console.error(error);
  process.exit(1);
});

console.log('state startup execution tests passed');
