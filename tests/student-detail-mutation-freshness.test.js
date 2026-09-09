const assert = require('assert');
const fs = require('fs');
const path = require('path');
const vm = require('vm');

const stateSource = fs.readFileSync(path.join(__dirname, '../public/assets/scripts/core/state.js'), 'utf8');
const purchasesSource = fs.readFileSync(path.join(__dirname, '../public/assets/scripts/pages/purchases.js'), 'utf8');
const utilsSource = fs.readFileSync(path.join(__dirname, '../public/assets/scripts/core/utils.js'), 'utf8');
const scheduleSource = fs.readFileSync(path.join(__dirname, '../public/assets/scripts/pages/schedule.js'), 'utf8');

function createRuntime() {
  const runtime = {
    console,
    Date,
    Map,
    Set,
    Promise,
    URLSearchParams,
    setTimeout,
    clearTimeout,
    setInterval() {},
    clearInterval() {},
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
      querySelector() { return null; },
      body: { classList: { toggle() {}, contains() { return false; } } }
    },
    navigator: {},
    currentUser: { id: 'u1', role: 'admin', name: '管理员' },
    currentPage: 'students',
    CAMPUS: {},
    PAGE_KEY: 'ft_page',
    CAMPUS_KEY: 'ft_campus',
    campus: 'all',
    esc(value) { return String(value ?? ''); },
    fmt(value) { return String(value ?? ''); },
    fmtDt(value) { return String(value ?? ''); },
    toast() {},
    apiCall() { return Promise.resolve({}); },
    campusDisplayName(value) { return value; },
    standardPackageLabel(row) { return row.packageName || row.name || ''; },
    packageLessonUnitLabel() { return '节'; },
    courseTypeDisplayLabel(row) { return row?.courseType || ''; },
    normalizeCourseType(value) { return value || ''; },
    normalizeExperienceType(value) { return value || ''; },
    standardCourseTypeLabel(value) { return value || ''; },
    coachName(value) { return value || ''; },
    cn(value) { return value || ''; },
    parseArr(value) {
      if (Array.isArray(value)) return value;
      if (!value) return [];
      try {
        const parsed = JSON.parse(value);
        return Array.isArray(parsed) ? parsed : [];
      } catch (e) {
        return String(value).split(',').filter(Boolean);
      }
    },
    lessonValue(value) { return Number(value) || 0; },
    lessonQty(value) { return String(Number(value) || 0); },
    effectiveScheduleStatus(s) { return s?.status || '已排课'; },
    isCoachPortalUser() { return false; },
    scheduleCourseType(s) { return s?.courseType || ''; },
    doLogout() {},
    renderRoleShell() {},
    goPage() {},
    openPendingScheduleDeepLink() {},
    renderStudents() {},
    renderStudentsIfVisible() {},
    renderLeads() {},
    renderClasses() {},
    renderSchedule() {},
    renderCoachOps() {},
    renderMySchedule() {},
    refreshCoachOpsWorkbenchAfterScheduleMutation() {},
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
  runtime.window.window = runtime.window;
  vm.createContext(runtime);
  vm.runInContext(stateSource, runtime, { filename: 'state.js' });
  vm.runInContext(purchasesSource, runtime, { filename: 'purchases.js' });
  vm.runInContext(utilsSource, runtime, { filename: 'utils.js' });
  vm.runInContext(scheduleSource, runtime, { filename: 'schedule.js' });
  return runtime;
}

{
  const runtime = createRuntime();
  vm.runInContext(`
    students = [{ id: 'stu-gao', name: '高老师暖暖' }];
    hydrateStudentDetailData({
      detailStudentView: {
        id: 'stu-gao',
        name: '高老师暖暖',
        detailPackageOrderRows: [
          { entitlementId: 'ent-old', purchaseId: 'pur-old', packageName: '旧课包', remainingLessons: 1, totalLessons: 10, usedLessons: 9, purchaseDate: '2026-09-01', statusText: '正常', unit: '节' }
        ],
        packageListRows: [
          { entitlementId: 'ent-old', purchaseId: 'pur-old', packageName: '旧课包', remainingLessons: 1, totalLessons: 10, usedLessons: 9, purchaseDate: '2026-09-01', statusText: '正常', unit: '节' }
        ],
        packageBalanceRemaining: 1,
        packageBalanceTotal: 10,
        detailPackageBalanceRemaining: 1,
        detailPackageBalanceTotal: 10
      }
    });
    patchManualEntitlementAdjustResult({
      entitlement: { id: 'ent-old', studentId: 'stu-gao', purchaseId: 'pur-old', packageName: '旧课包', remainingLessons: 0, totalLessons: 10, usedLessons: 10, status: 'depleted', courseType: '私教课' },
      ledger: { id: 'ledger-manual', entitlementId: 'ent-old', studentId: 'stu-gao', purchaseId: 'pur-old', lessonDelta: -1, action: 'manual_consume' }
    });
  `, runtime);
  const detail = vm.runInContext('studentDetailViewForId("stu-gao")', runtime);
  assert.strictEqual(
    detail.detailPackageOrderRows.find(row => row.entitlementId === 'ent-old').remainingLessons,
    0,
    'manual lesson consume should update the open student drawer package balance immediately'
  );
  assert.strictEqual(detail.detailPackageBalanceRemaining, 0, 'manual lesson consume should recalculate drawer total balance');
}

{
  const runtime = createRuntime();
  vm.runInContext(`
    students = [{ id: 'stu-gao', name: '高老师暖暖' }];
    hydrateStudentDetailData({
      detailStudentView: {
        id: 'stu-gao',
        name: '高老师暖暖',
        detailPackageOrderRows: [
          { entitlementId: 'ent-old', purchaseId: 'pur-old', packageName: '旧课包', remainingLessons: 1, totalLessons: 10, usedLessons: 9, purchaseDate: '2026-09-01', statusText: '正常', unit: '节' }
        ],
        detailLessonRecordRows: []
      }
    });
    mergeStudentDetailPurchaseResult({
      purchase: { id: 'pur-new', studentId: 'stu-gao', studentName: '高老师暖暖', packageName: '新课包', purchaseDate: '2026-09-09', finalAmount: 1000 },
      entitlement: { id: 'ent-new', purchaseId: 'pur-new', studentId: 'stu-gao', packageName: '新课包', remainingLessons: 10, totalLessons: 10, usedLessons: 0, courseType: '私教课', status: 'active' }
    });
    hydrateStudentDetailData({
      detailStudentView: {
        id: 'stu-gao',
        name: '高老师暖暖',
        detailPackageOrderRows: [
          { entitlementId: 'ent-old', purchaseId: 'pur-old', packageName: '旧课包', remainingLessons: 1, totalLessons: 10, usedLessons: 9, purchaseDate: '2026-09-01', statusText: '正常', unit: '节' }
        ],
        detailLessonRecordRows: []
      }
    });
  `, runtime);
  const rows = vm.runInContext('studentDetailViewForId("stu-gao").detailPackageOrderRows', runtime);
  assert.ok(
    rows.some(row => row.entitlementId === 'ent-new' && row.purchaseId === 'pur-new'),
    'stale student summary hydration must not hide the newly purchased package already returned by the write API'
  );
}

{
  const runtime = createRuntime();
  vm.runInContext(`
    mergeScheduleSaveResult({
      schedule: { id: 'sch-new', status: '已排课', entitlementId: 'ent-new', entitlementIds: ['ent-new'], lessonCount: 1.5, courseType: '私教课' },
      entitlements: [{ id: 'ent-new', studentId: 'stu-gao', purchaseId: 'pur-new', packageName: '新课包', remainingLessons: 8.5, totalLessons: 10, status: 'active', courseType: '私教课' }],
      entitlementLedger: [{ id: 'ledger-new', scheduleId: 'sch-new', entitlementId: 'ent-new', studentId: 'stu-gao', purchaseId: 'pur-new', lessonDelta: -1.5 }]
    }, '');
    setDatasetValue('entitlementLedger', [], { persist: false });
  `, runtime);
  assert.strictEqual(
    vm.runInContext('scheduleLessonChargeStatus(schedules.find(row => row.id === "sch-new"))', runtime),
    '已扣课',
    'stale entitlementLedger dataset must not make a just-saved charged schedule detail show 扣课异常'
  );
}

console.log('student detail mutation freshness tests passed');
