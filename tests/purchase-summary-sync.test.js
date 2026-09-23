const assert = require('assert');
const fs = require('fs');
const path = require('path');
const { createPurchaseEntitlementRoutes } = require('../server/purchase-entitlement-routes');
const { createStudentRosterIndexReader } = require('../server/page-data/student-roster-index-reader');
const { TEACHING_LESSON_DETAIL_SOURCE_VERSION } = require('../server/read-models/platform-metrics');
const {
  STUDENT_TEACHING_SUMMARY_META_ID,
  buildStudentTeachingSummaryBundleRow,
  buildStudentTeachingSummaryListBundleRow,
  buildStudentTeachingSummaryChecksum,
  syncStudentTeachingSummaryDelta
} = require('../server/read-models/student-teaching-summary-cache');

async function run() {
  const apiSource = fs.readFileSync(path.join(__dirname, '../api/index.js'), 'utf8');
  assert.strictEqual((apiSource.match(/syncStudentTeachingSummaryDelta:syncStudentTeachingSummaryDeltaForProduction/g) || []).length, 2,
    '购买和排课路由必须绑定可用的生产摘要同步函数');
  assert.match(apiSource, /syncStudentTeachingSummaryDeltaForProduction=changes=>syncStudentTeachingSummaryDelta\(\{\s*tableName:T_STUDENT_TEACHING_SUMMARY,getCachedRow:get,put,/,
    '摘要写入必须读取最新版本，不能使用 60 秒缓存');
  const student = { id: 'rabbit', name: '兔子（兔YY）', campus: 'shunyi_mapo', type: '成人' };
  const initial = {
    ...student, studentId: student.id, displayName: student.name,
    studentStage: 'trial', hasStudentProfile: true, hasTrialAttended: true,
    hasTrialExperience: true, isHistoricalStudentRoster: true, isActiveStudentRoster: false,
    coursePurchaseCount: 0, cumulativeCoursePaidAmount: 149,
    detailPackageOrderRows: [], packageListRows: [], detailLessonRecordRows: [],
    teachingLessonDetailSourceVersion: TEACHING_LESSON_DETAIL_SOURCE_VERSION
  };
  const version = 'before-purchase';
  const summary = new Map([
    [STUDENT_TEACHING_SUMMARY_META_ID, {
      id: STUDENT_TEACHING_SUMMARY_META_ID, status: 'ready', activeVersion: version,
      batchId: version, rowCount: 1, checksum: buildStudentTeachingSummaryChecksum([initial]),
      sourceSnapshotAt: '2026-09-22T00:00:00.000Z', completedAt: '2026-09-22T00:00:01.000Z', generation: 1
    }],
    [`__student_teaching_summary_bundle__:${version}`, buildStudentTeachingSummaryBundleRow([initial], version)],
    [`__student_teaching_summary_list_bundle__:${version}`, buildStudentTeachingSummaryListBundleRow([initial], version)]
  ]);
  const rows = {
    packages: [{ id: 'pkg', name: '私教课 10 节', courseType: '私教课', lessons: 10, price: 4800 }],
    students: [student], purchases: [], entitlements: [], entitlementLedger: [], membershipBenefitLedger: []
  };
  let nextId = 0;
  let failListBundleOnce = false;
  const getCachedRow = async (_, id) => summary.get(id) || null;
  const put = async (table, id, row) => {
    if (table === 'summary') {
      if (failListBundleOnce && id.startsWith('__student_teaching_summary_list_bundle__:')) {
        failListBundleOnce = false;
        throw new Error('temporary list bundle failure');
      }
      summary.set(id, row);
    } else {
      const list = rows[table];
      const index = list.findIndex(item => item.id === id);
      if (index < 0) list.push(row); else list[index] = row;
    }
  };
  const boundSync = changes => syncStudentTeachingSummaryDelta({ tableName: 'summary', getCachedRow, put, ...changes, logger: { warn() {} } });
  const handler = createPurchaseEntitlementRoutes({
    init: async () => {}, sendJson: (res, payload, status = 200) => { res.status = status; res.payload = payload; return true; },
    get: async (table, id) => rows[table]?.find(row => row.id === id) || null,
    getCachedScan: async table => rows[table] || [],
    scan: async table => rows[table] || [], put,
    del: async (table, id) => { rows[table] = rows[table].filter(row => row.id !== id); },
    uuidv4: () => `id-${++nextId}`,
    buildOperationTrace: () => ({ operationId: `operation-${++nextId}` }),
    withOperationTrace: (row, trace) => ({ ...row, ...trace }),
    buildPurchaseRecord: (pkg, body, owner, options) => ({
      id: options.id, studentId: owner.id, studentName: owner.name, packageId: pkg.id,
      packageName: pkg.name, courseType: pkg.courseType, packageLessons: pkg.lessons,
      purchaseDate: body.purchaseDate, amountPaid: body.amountPaid, finalAmount: body.amountPaid,
      status: 'active', ...options.operationTrace
    }),
    buildEntitlementFromPurchase: (pkg, purchase, owner, id) => ({
      id, studentId: owner.id, studentName: owner.name, purchaseId: purchase.id,
      packageId: pkg.id, packageName: pkg.name, courseType: pkg.courseType,
      totalLessons: pkg.lessons, remainingLessons: pkg.lessons, status: 'active'
    }),
    validatePurchaseInputForPackage: () => {},
    buildStudentBenefitLedgerRecord: () => ({}),
    writePurchaseAndEntitlementAtomic: async (store, purchaseTable, entitlementTable, purchase, entitlement) => {
      await store.put(purchaseTable, purchase.id, purchase);
      await store.put(entitlementTable, entitlement.id, entitlement);
    },
    syncStudentActiveEntitlementIndexes: async () => {},
    syncStudentTeachingSummaryDelta: boundSync,
    queueStudentTeachingSummaryRefresh: async () => {},
    assertCanVoidPurchase: () => {},
    parseArr: value => Array.isArray(value) ? value : [],
    isCampusScopedAdmin: () => false,
    T_PACKAGES: 'packages', T_STUDENTS: 'students', T_PURCHASES: 'purchases',
    T_ENTITLEMENTS: 'entitlements', T_ENTITLEMENT_LEDGER: 'entitlementLedger',
    T_MEMBERSHIP_BENEFIT_LEDGER: 'membershipBenefitLedger'
  });
  const request = async (path, method, body = {}) => {
    const res = {};
    await handler({ path, method, body, user: { role: 'admin', name: 'admin' }, res, query: new URLSearchParams() });
    assert.strictEqual(res.status, 200, '购买和摘要同步不能返回 503');
    return res.payload;
  };

  failListBundleOnce = true;
  const first = await request('/purchases', 'POST', { studentId: student.id, packageId: 'pkg', purchaseDate: '2026-09-18', amountPaid: 4800 });
  assert.strictEqual(first.summarySync.synced, true, '临时写入失败应在请求内重试并发布摘要');
  const second = await request('/purchases', 'POST', { studentId: student.id, packageId: 'pkg', purchaseDate: '2026-09-23', amountPaid: 5700 });
  assert.strictEqual(second.summarySync.synced, true);

  const reader = createStudentRosterIndexReader({ tableName: 'summary', getCachedRow, getCachedScan: async () => [...summary.values()], scanByIdPrefix: async () => [], put });
  const list = await reader.readCustomerCenterList({ query: new URLSearchParams({ view: 'activeStudents', q: '兔子', paged: '1' }) });
  assert.strictEqual(list.listPage.total, 1, '两笔购买后在期学员必须搜索到兔子');
  const activeVersion = summary.get(STUDENT_TEACHING_SUMMARY_META_ID).activeVersion;
  const detail = summary.get(`__student_teaching_summary_version__:${activeVersion}:${student.id}`);
  assert.strictEqual(detail.studentStage, 'formal');
  assert.strictEqual(detail.detailPackageOrderRows.length, 2, '抽屉必须显示两笔课包');
  assert.strictEqual(detail.detailPackageBalanceText, '20/20');
  assert.strictEqual(detail.coursePurchaseCount, 2);
  assert.strictEqual(detail.cumulativeCoursePaidAmount, 10649);

  const replay = await boundSync({
    changedPurchases: [first.purchase, second.purchase],
    changedEntitlements: rows.entitlements,
    operationId: 'repeat-purchase-repair', now: new Date()
  });
  assert.strictEqual(replay.synced, true);
  const replayDetail = summary.get(`__student_teaching_summary_version__:${replay.activeVersion}:${student.id}`);
  assert.strictEqual(replayDetail.coursePurchaseCount, 2, '重复修复不能重复计算课包');
  assert.strictEqual(replayDetail.cumulativeCoursePaidAmount, 10649, '重复修复不能重复计算付款');

  const changedEntitlement = { ...rows.entitlements.find(row => row.purchaseId === first.purchase.id), remainingLessons: 9, usedLessons: 1 };
  const consumed = await boundSync({ changedEntitlements: [changedEntitlement], operationId: 'consume-once', now: new Date() });
  assert.strictEqual(consumed.synced, true);
  const afterConsume = summary.get(`__student_teaching_summary_version__:${consumed.activeVersion}:${student.id}`);
  assert.strictEqual(afterConsume.detailPackageBalanceText, '19/20');
  const afterConsumeList = await reader.readCustomerCenterList({ query: new URLSearchParams({ view: 'activeStudents', q: '兔子', paged: '1' }) });
  assert.strictEqual(afterConsumeList.listPage.total, 1, '消课后仍在在期学员列表');

  await request(`/purchases/${second.purchase.id}`, 'DELETE');
  const afterFirstVoid = summary.get(`__student_teaching_summary_version__:${summary.get(STUDENT_TEACHING_SUMMARY_META_ID).activeVersion}:${student.id}`);
  assert.strictEqual(afterFirstVoid.detailPackageOrderRows.length, 1, '作废后抽屉应移除对应课包');
  assert.strictEqual(afterFirstVoid.coursePurchaseCount, 1);
  assert.strictEqual(afterFirstVoid.cumulativeCoursePaidAmount, 4949);

  rows.students.push({ id: 'new-student', name: '新学员', campus: 'shunyi_mapo', type: '成人' });
  const newcomer = await request('/purchases', 'POST', { studentId: 'new-student', packageId: 'pkg', purchaseDate: '2026-09-23', amountPaid: 4800 });
  assert.strictEqual(newcomer.summarySync.synced, true, '首次购买必须生成学员摘要');
  const newStudentList = await reader.readCustomerCenterList({ query: new URLSearchParams({ view: 'activeStudents', q: '新学员', paged: '1' }) });
  assert.strictEqual(newStudentList.listPage.total, 1, '新学员购买后必须立即出现在在期列表');
}

run().then(() => console.log('purchase summary sync tests passed')).catch(error => { console.error(error); process.exitCode = 1; });
