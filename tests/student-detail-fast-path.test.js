const assert = require('assert');
const { createCorePageDataRoutes } = require('../server/page-data/core-pages.js');
const { TEACHING_LESSON_DETAIL_SOURCE_VERSION } = require('../server/read-models/platform-metrics.js');
const {
  buildStudentTeachingSummaryBundleRow,
  buildStudentTeachingSummaryChecksum,
  buildStudentTeachingSummaryMetaRow
} = require('../server/read-models/student-teaching-summary-cache.js');

async function requestStudentDetail({ fresh = false } = {}) {
  const calls = { cappedScan: 0 };
  const tables = {
    T_STUDENTS: 'students',
    T_STUDENT_TEACHING_SUMMARY: 'student_summary',
    T_PURCHASES: 'purchases',
    T_PACKAGES: 'packages',
    T_ENTITLEMENTS: 'entitlements',
    T_ENTITLEMENT_LEDGER: 'entitlement_ledger',
    T_SCHEDULE: 'schedule',
    T_MEMBERSHIP_BENEFIT_LEDGER: 'membership_benefit_ledger',
    T_FEEDBACKS: 'feedbacks'
  };
  const handler = createCorePageDataRoutes({
    init: async () => {},
    sendJson: (res, body, status = 200) => {
      res.statusCode = status;
      res.body = body;
      return body;
    },
    cappedScan: async (table) => {
      calls.cappedScan += 1;
      throw new Error(`unexpected full scan: ${table}`);
    },
    filterLoadAllForUser: (data) => data,
    getCachedRow: async (table, id) => {
      if (table === tables.T_STUDENTS && id === 'stu-1') {
        return { id: 'stu-1', name: '王同学', phone: '13800000000', campus: 'mapo', type: '成人' };
      }
      if (table === tables.T_STUDENT_TEACHING_SUMMARY && id === 'stu-1') {
        return {
          id: 'stu-1',
          studentId: 'stu-1',
          name: '王同学',
          teachingLessonDetailSourceVersion: TEACHING_LESSON_DETAIL_SOURCE_VERSION,
          activityStatusLabel: '近30天活跃',
          completedLessons: 1,
          detailPackageOrderRows: [
            { purchaseId: 'pur-1', packageName: '私教课', remainingLessons: 9, totalLessons: 10, statusText: '正常' }
          ],
          detailLessonRecordRows: [
            { kind: 'ledger', time: '2026-07-01 10:00-11:00', courseType: '私教课', lessonDelta: -1, lessonSectionText: '[第1节]' }
          ],
          detailBenefitRows: []
        };
      }
      return null;
    },
    tables
  });
  const res = {};
  const query = new URLSearchParams(fresh ? 'id=stu-1&fresh=1' : 'id=stu-1');
  await handler({ path: '/page-data/student-detail', method: 'GET', user: { role: 'admin' }, res, query });
  return { res, calls };
}

async function requestBundleSummaryStudentDetail() {
  const calls = { cappedScan: 0, prefixScan: 0, summaryScan: 0 };
  const tables = {
    T_STUDENTS: 'students',
    T_STUDENT_TEACHING_SUMMARY: 'student_summary',
    T_PURCHASES: 'purchases',
    T_PACKAGES: 'packages',
    T_ENTITLEMENTS: 'entitlements',
    T_ENTITLEMENT_LEDGER: 'entitlement_ledger',
    T_SCHEDULE: 'schedule',
    T_MEMBERSHIP_BENEFIT_LEDGER: 'membership_benefit_ledger',
    T_FEEDBACKS: 'feedbacks'
  };
  const version = 'summary-version-1';
  const summaryRows = [{
    id: 'stu-bundle',
    studentId: 'stu-bundle',
    name: '王先生（阿萌）',
    teachingLessonDetailSourceVersion: TEACHING_LESSON_DETAIL_SOURCE_VERSION,
    activityStatusLabel: '近30天活跃',
    completedLessons: 10,
    packageBalanceText: '0/10',
    detailPackageOrderRows: [{ entitlementId: 'ent-bundle', packageName: '1v2私教课', remainingLessons: 0, totalLessons: 10 }],
    detailLessonRecordRows: [{ kind: 'ledger', scheduleId: 'sch-bundle', time: '2026-09-04 19:00', courseType: '私教课', lessonDelta: -1, lessonSectionText: '[第10节]' }],
    detailBenefitRows: []
  }];
  const meta = buildStudentTeachingSummaryMetaRow({
    status: 'ready',
    batchId: version,
    activeVersion: version,
    rowCount: summaryRows.length,
    checksum: buildStudentTeachingSummaryChecksum(summaryRows)
  });
  const bundle = buildStudentTeachingSummaryBundleRow(summaryRows, version);
  const handler = createCorePageDataRoutes({
    init: async () => {},
    sendJson: (res, body, status = 200) => {
      res.statusCode = status;
      res.body = body;
      return body;
    },
    cappedScan: async table => {
      calls.cappedScan += 1;
      throw new Error(`unexpected full scan: ${table}`);
    },
    getCachedScan: async table => {
      calls.summaryScan += 1;
      throw new Error(`unexpected summary full scan: ${table}`);
    },
    scanByIdPrefix: async () => {
      calls.prefixScan += 1;
      return [];
    },
    filterLoadAllForUser: data => data,
    getCachedRow: async (table, id) => {
      if (table === tables.T_STUDENTS && id === 'stu-bundle') {
        return { id: 'stu-bundle', name: '王先生（阿萌）', phone: '13800000000', campus: 'mapo', type: '成人' };
      }
      if (table === tables.T_STUDENT_TEACHING_SUMMARY && id === meta.id) return meta;
      if (table === tables.T_STUDENT_TEACHING_SUMMARY && id === bundle.id) return bundle;
      return null;
    },
    PRODUCTION_PAGE_READ_LIMITS: { entitlementLedger: 100, schedule: 100, leads: 100 },
    tables
  });
  const res = {};
  await handler({ path: '/page-data/student-detail', method: 'GET', user: { role: 'admin' }, res, query: new URLSearchParams('id=stu-bundle') });
  return { res, calls };
}

async function requestInconsistentStudentDetail() {
  const calls = { cappedScan: 0 };
  const tables = {
    T_STUDENTS: 'students',
    T_STUDENT_TEACHING_SUMMARY: 'student_summary',
    T_PURCHASES: 'purchases',
    T_PACKAGES: 'packages',
    T_ENTITLEMENTS: 'entitlements',
    T_ENTITLEMENT_LEDGER: 'entitlement_ledger',
    T_SCHEDULE: 'schedule',
    T_MEMBERSHIP_BENEFIT_LEDGER: 'membership_benefit_ledger',
    T_FEEDBACKS: 'feedbacks'
  };
  const tableRows = {
    purchases: [
      { id: 'pur-1', studentId: 'stu-1', packageName: '第一课包', status: 'active', purchaseDate: '2026-01-01' },
      { id: 'pur-2', studentId: 'stu-1', packageName: '第二课包', status: 'active', purchaseDate: '2026-06-01' }
    ],
    packages: [],
    entitlements: [
      { id: 'ent-1', purchaseId: 'pur-1', studentId: 'stu-1', packageName: '第一课包', totalLessons: 10, remainingLessons: 0, status: 'depleted' },
      { id: 'ent-2', purchaseId: 'pur-2', studentId: 'stu-1', packageName: '第二课包', totalLessons: 10, remainingLessons: 2, status: 'active' }
    ],
    entitlement_ledger: Array.from({ length: 18 }, (_, index) => ({
      id: `ledger-${index + 1}`,
      entitlementId: index >= 10 ? 'ent-2' : 'ent-1',
      purchaseId: index >= 10 ? 'pur-2' : 'pur-1',
      studentId: 'stu-1',
      scheduleId: `sch-${index + 1}`,
      lessonDelta: -1,
      relatedDate: `2026-06-${String(index + 1).padStart(2, '0')}`
    })),
    schedule: Array.from({ length: 19 }, (_, index) => ({
      id: `sch-${index + 1}`,
      studentId: 'stu-1',
      startTime: `2026-06-${String(index + 1).padStart(2, '0')} 10:00:00`,
      endTime: `2026-06-${String(index + 1).padStart(2, '0')} 11:00:00`,
      status: '已结束',
      courseType: '私教课',
      lessonCount: 1
    })),
    membership_benefit_ledger: [],
    feedbacks: []
  };
  const handler = createCorePageDataRoutes({
    init: async () => {},
    sendJson: (res, body, status = 200) => {
      res.statusCode = status;
      res.body = body;
      return body;
    },
    cappedScan: async table => {
      calls.cappedScan += 1;
      return tableRows[table] || [];
    },
    filterLoadAllForUser: data => data,
    getCachedRow: async (table, id) => {
      if (table === tables.T_STUDENTS && id === 'stu-1') {
        return { id: 'stu-1', name: '王同学', phone: '13800000000', campus: 'mapo', type: '成人' };
      }
      if (table === tables.T_STUDENT_TEACHING_SUMMARY && id === 'stu-1') {
        return {
          id: 'stu-1',
          studentId: 'stu-1',
          name: '王同学',
          teachingLessonDetailSourceVersion: TEACHING_LESSON_DETAIL_SOURCE_VERSION,
          activityStatusLabel: '近30天活跃',
          completedLessons: 19,
          detailPackageBalanceTotal: 20,
          detailPackageBalanceRemaining: 2,
          detailLessonRecordRows: [
            { kind: 'ledger', time: '2026-06-19 10:00-11:00', courseType: '私教课', lessonDelta: -1 }
          ]
        };
      }
      return null;
    },
    PRODUCTION_PAGE_READ_LIMITS: { entitlementLedger: 100, schedule: 100, leads: 100 },
    tables
  });
  const res = {};
  await handler({ path: '/page-data/student-detail', method: 'GET', user: { role: 'admin' }, res, query: new URLSearchParams('id=stu-1') });
  return { res, calls };
}

async function requestEmptySummaryWithTrialFactsStudentDetail() {
  const calls = { cappedScan: 0 };
  const tables = {
    T_STUDENTS: 'students',
    T_STUDENT_TEACHING_SUMMARY: 'student_summary',
    T_PURCHASES: 'purchases',
    T_PACKAGES: 'packages',
    T_ENTITLEMENTS: 'entitlements',
    T_ENTITLEMENT_LEDGER: 'entitlement_ledger',
    T_SCHEDULE: 'schedule',
    T_MEMBERSHIP_BENEFIT_LEDGER: 'membership_benefit_ledger',
    T_FEEDBACKS: 'feedbacks'
  };
  const tableRows = {
    purchases: [],
    packages: [],
    entitlements: [{
      id: 'trial-ent-1',
      studentId: 'stu-1',
      packageName: '私教体验课',
      totalLessons: 1,
      usedLessons: 1,
      remainingLessons: 0,
      status: 'depleted'
    }],
    entitlement_ledger: [{
      id: 'trial-ledger-1',
      entitlementId: 'trial-ent-1',
      studentId: 'stu-1',
      scheduleId: 'trial-sch-1',
      lessonDelta: -1,
      relatedDate: '2026-06-02'
    }],
    schedule: [{
      id: 'trial-sch-1',
      studentId: 'stu-1',
      studentIds: ['stu-1'],
      startTime: '2026-06-02 18:00:00',
      endTime: '2026-06-02 19:00:00',
      status: '已结束',
      courseType: '体验课',
      experienceType: '私教体验课',
      lessonCount: 1
    }],
    membership_benefit_ledger: [],
    feedbacks: []
  };
  const handler = createCorePageDataRoutes({
    init: async () => {},
    sendJson: (res, body, status = 200) => {
      res.statusCode = status;
      res.body = body;
      return body;
    },
    cappedScan: async table => {
      calls.cappedScan += 1;
      return tableRows[table] || [];
    },
    filterLoadAllForUser: data => data,
    getCachedRow: async (table, id) => {
      if (table === tables.T_STUDENTS && id === 'stu-1') {
        return { id: 'stu-1', name: '文大妞', phone: '13800000000', campus: 'shunyi_mapo', type: '成人' };
      }
      if (table === tables.T_STUDENT_TEACHING_SUMMARY && id === 'stu-1') {
        return {
          id: 'stu-1',
          studentId: 'stu-1',
          name: '文大妞',
          teachingLessonDetailSourceVersion: TEACHING_LESSON_DETAIL_SOURCE_VERSION,
          activityStatusLabel: '从未正式上课',
          completedLessons: 0,
          detailPackageOrderRows: [],
          detailLessonRecordRows: [],
          detailBenefitRows: []
        };
      }
      return null;
    },
    PRODUCTION_PAGE_READ_LIMITS: { entitlementLedger: 100, schedule: 100, leads: 100 },
    tables
  });
  const res = {};
  await handler({ path: '/page-data/student-detail', method: 'GET', user: { role: 'admin' }, res, query: new URLSearchParams('id=stu-1') });
  return { res, calls };
}

async function requestLegacyVersionSmallClassStudentDetail() {
  const calls = { cappedScan: 0 };
  const tables = {
    T_STUDENTS: 'students',
    T_STUDENT_TEACHING_SUMMARY: 'student_summary',
    T_PURCHASES: 'purchases',
    T_PACKAGES: 'packages',
    T_ENTITLEMENTS: 'entitlements',
    T_ENTITLEMENT_LEDGER: 'entitlement_ledger',
    T_SCHEDULE: 'schedule',
    T_MEMBERSHIP_BENEFIT_LEDGER: 'membership_benefit_ledger',
    T_FEEDBACKS: 'feedbacks'
  };
  const tableRows = {
    purchases: [
      {
        id: 'pur-special',
        studentId: 'stu-1',
        packageName: '专项课 · 【零基础】初阶专项课 · 1次 · 全天',
        courseType: '专项课',
        status: 'active',
        actualAmount: 199,
        purchaseDate: '2026-06-20'
      },
      {
        id: 'pur-small',
        studentId: 'stu-1',
        packageName: '小班训练营 · 10次 · 黄金',
        status: 'active',
        actualAmount: 1499,
        purchaseDate: '2026-06-10'
      }
    ],
    packages: [],
    entitlements: [
      {
        id: 'ent-special',
        purchaseId: 'pur-special',
        studentId: 'stu-1',
        packageName: '专项课 · 【零基础】初阶专项课 · 1次 · 全天',
        courseType: '专项课',
        totalLessons: 1,
        usedLessons: 1,
        remainingLessons: 0,
        status: 'depleted'
      },
      {
        id: 'ent-small',
        purchaseId: 'pur-small',
        studentId: 'stu-1',
        packageName: '小班训练营 · 10次 · 黄金',
        courseType: '小班课',
        totalLessons: 10,
        usedLessons: 3,
        remainingLessons: 7,
        status: 'active'
      }
    ],
    entitlement_ledger: [{
      id: 'ledger-special',
      entitlementId: 'ent-special',
      purchaseId: 'pur-special',
      studentId: 'stu-1',
      scheduleId: 'sch-special',
      lessonDelta: -1,
      relatedDate: '2026-06-20'
    }],
    schedule: [
      {
        id: 'sch-special',
        studentId: 'stu-1',
        startTime: '2026-06-20 10:00:00',
        endTime: '2026-06-20 11:15:00',
        status: '已结束',
        courseType: '专项课',
        standardCourseType: '专项课',
        coach: '林铭教练',
        lessonCount: 1
      },
      {
        id: 'sch-small',
        studentId: 'stu-1',
        purchaseId: 'pur-small',
        startTime: '2026-06-28 14:00:00',
        endTime: '2026-06-28 16:00:00',
        status: '已结束',
        courseType: '小班课',
        coach: '林铭教练',
        lessonCount: 1
      }
    ],
    membership_benefit_ledger: [],
    feedbacks: []
  };
  const handler = createCorePageDataRoutes({
    init: async () => {},
    sendJson: (res, body, status = 200) => {
      res.statusCode = status;
      res.body = body;
      return body;
    },
    cappedScan: async table => {
      calls.cappedScan += 1;
      return tableRows[table] || [];
    },
    filterLoadAllForUser: data => data,
    getCachedRow: async (table, id) => {
      if (table === tables.T_STUDENTS && id === 'stu-1') {
        return { id: 'stu-1', name: '文大妞', phone: '13800000000', campus: 'shunyi_mapo', type: '青少年' };
      }
      if (table === tables.T_STUDENT_TEACHING_SUMMARY && id === 'stu-1') {
        return {
          id: 'stu-1',
          studentId: 'stu-1',
          name: '文大妞',
          teachingLessonDetailSourceVersion: 'lesson-record-v3',
          activityStatusLabel: '近30天活跃',
          completedLessons: 3,
          detailPackageOrderRows: [{
            packageName: '小班训练营 · 10次 · 黄金',
            courseType: '小班课',
            totalLessons: 10,
            usedLessons: 3,
            remainingLessons: 7
          }],
          detailLessonRecordRows: [
            {
              kind: 'ledger',
              scheduleId: 'sch-special',
              time: '2026-06-20 10:00-11:15',
              courseType: '专项课',
              lessonDelta: -1,
              lessonSectionText: '[第1节]'
            },
            {
              kind: 'schedule',
              scheduleId: 'sch-small',
              time: '2026-06-28 14:00-16:00',
              courseType: '小班课',
              lessonDelta: -1,
              purchaseId: 'pur-small',
              lessonSectionText: ''
            }
          ],
          detailBenefitRows: []
        };
      }
      return null;
    },
    PRODUCTION_PAGE_READ_LIMITS: { entitlementLedger: 100, schedule: 100, leads: 100 },
    tables
  });
  const res = {};
  await handler({ path: '/page-data/student-detail', method: 'GET', user: { role: 'admin' }, res, query: new URLSearchParams('id=stu-1') });
  return { res, calls };
}

async function requestMergedStudentWithStaleSummaryDetail() {
  const calls = { cappedScan: 0 };
  const tables = {
    T_STUDENTS: 'students',
    T_STUDENT_TEACHING_SUMMARY: 'student_summary',
    T_PURCHASES: 'purchases',
    T_PACKAGES: 'packages',
    T_ENTITLEMENTS: 'entitlements',
    T_ENTITLEMENT_LEDGER: 'entitlement_ledger',
    T_SCHEDULE: 'schedule',
    T_MEMBERSHIP_BENEFIT_LEDGER: 'membership_benefit_ledger',
    T_FEEDBACKS: 'feedbacks'
  };
  const tableRows = {
    purchases: [{
      id: 'pur-ameng',
      studentId: 'stu-wang',
      packageName: '私教课 · 10节',
      status: 'active',
      purchaseDate: '2026-08-01'
    }],
    packages: [],
    entitlements: [{
      id: 'ent-ameng',
      purchaseId: 'pur-ameng',
      studentId: 'stu-wang',
      packageName: '私教课 · 10节',
      totalLessons: 10,
      usedLessons: 2,
      remainingLessons: 8,
      status: 'active'
    }],
    entitlement_ledger: [{
      id: 'ledger-ameng',
      entitlementId: 'ent-ameng',
      purchaseId: 'pur-ameng',
      studentId: 'stu-wang',
      scheduleId: 'sch-ameng',
      lessonDelta: -1,
      relatedDate: '2026-08-12'
    }],
    schedule: [{
      id: 'sch-ameng',
      studentId: 'stu-wang',
      studentIds: ['stu-wang'],
      startTime: '2026-08-12 10:00:00',
      endTime: '2026-08-12 11:00:00',
      status: '已结束',
      courseType: '私教课',
      lessonCount: 1
    }],
    membership_benefit_ledger: [],
    feedbacks: []
  };
  const handler = createCorePageDataRoutes({
    init: async () => {},
    sendJson: (res, body, status = 200) => {
      res.statusCode = status;
      res.body = body;
      return body;
    },
    cappedScan: async table => {
      calls.cappedScan += 1;
      return tableRows[table] || [];
    },
    filterLoadAllForUser: data => data,
    getCachedRow: async (table, id) => {
      if (table === tables.T_STUDENTS && id === 'stu-wang') {
        return {
          id: 'stu-wang',
          name: '王先生（阿萌）',
          phone: '13800000000',
          updatedAt: '2026-09-05T06:45:00.000Z',
          lastLeadMergeAt: '2026-09-05T06:45:00.000Z'
        };
      }
      if (table === tables.T_STUDENT_TEACHING_SUMMARY && id === 'stu-wang') {
        return {
          id: 'stu-wang',
          studentId: 'stu-wang',
          name: '王先生（阿萌）',
          teachingLessonDetailSourceVersion: TEACHING_LESSON_DETAIL_SOURCE_VERSION,
          summaryUpdatedAt: '2026-09-05T06:40:00.000Z',
          activityStatusLabel: '近30天活跃',
          completedLessons: 1,
          detailPackageOrderRows: [],
          detailLessonRecordRows: [{
            kind: 'schedule',
            scheduleId: 'sch-old-wang',
            time: '2026-08-01 10:00-11:00',
            courseType: '私教课',
            lessonDelta: -1,
            lessonSectionText: '[第1节]'
          }],
          detailBenefitRows: []
        };
      }
      return null;
    },
    PRODUCTION_PAGE_READ_LIMITS: { entitlementLedger: 100, schedule: 100, leads: 100 },
    tables
  });
  const res = {};
  await handler({ path: '/page-data/student-detail', method: 'GET', user: { role: 'admin' }, res, query: new URLSearchParams('id=stu-wang') });
  return { res, calls };
}

(async () => {
  const { res, calls } = await requestStudentDetail();
  assert.strictEqual(res.statusCode, 200);
  assert.strictEqual(calls.cappedScan, 0, 'valid student teaching summary should avoid full detail scans');
  assert.deepStrictEqual(
    res.body.detailStudentView.detailLessonRecordRows.map(row => [row.kind, row.time, row.lessonDelta]),
    [['ledger', '2026-07-01 10:00-11:00', -1]],
    'student lesson records should come from the unified teaching summary fast path'
  );
  assert.deepStrictEqual(
    res.body.detailStudentView.detailPackageOrderRows.map(row => [row.purchaseId, row.remainingLessons, row.totalLessons]),
    [['pur-1', 9, 10]],
    'student package rows should come from the same unified teaching summary fast path'
  );
  const freshFastPath = await requestStudentDetail({ fresh: true });
  assert.strictEqual(freshFastPath.res.statusCode, 200);
  assert.strictEqual(freshFastPath.calls.cappedScan, 0, 'fresh=1 must not bypass a valid published student detail summary');

  const bundleSummary = await requestBundleSummaryStudentDetail();
  assert.strictEqual(bundleSummary.res.statusCode, 200);
  assert.strictEqual(bundleSummary.calls.cappedScan, 0, 'published summary bundle should avoid full detail scans');
  assert.strictEqual(bundleSummary.calls.summaryScan, 0, 'published summary bundle should avoid full summary scans');
  assert.strictEqual(bundleSummary.calls.prefixScan, 0, 'published summary bundle should avoid version prefix scans');
  assert.strictEqual(bundleSummary.res.body.detailStudentView.name, '王先生（阿萌）');
  assert.strictEqual(bundleSummary.res.body.detailStudentView.completedLessons, 10);
  assert.strictEqual(bundleSummary.res.body.detailStudentView.packageBalanceText, '0/10');

  const inconsistent = await requestInconsistentStudentDetail();
  assert.strictEqual(inconsistent.res.statusCode, 503);
  assert.strictEqual(inconsistent.calls.cappedScan, 0, 'inconsistent teaching summary must not scan production fact tables from the drawer');
  assert.strictEqual(inconsistent.res.body.code, 'STUDENT_DETAIL_SUMMARY_NOT_READY');

  const emptySummary = await requestEmptySummaryWithTrialFactsStudentDetail();
  assert.strictEqual(emptySummary.res.statusCode, 503);
  assert.strictEqual(emptySummary.calls.cappedScan, 0, 'empty teaching summary detail must return a controlled not-ready state instead of scanning fact tables');
  assert.strictEqual(emptySummary.res.body.code, 'STUDENT_DETAIL_SUMMARY_NOT_READY');

  const legacyVersion = await requestLegacyVersionSmallClassStudentDetail();
  assert.strictEqual(legacyVersion.res.statusCode, 503);
  assert.strictEqual(legacyVersion.calls.cappedScan, 0, 'legacy lesson summary version must not force a fresh fact read from the drawer');
  assert.strictEqual(legacyVersion.res.body.code, 'STUDENT_DETAIL_SUMMARY_NOT_READY');

  const mergedStaleSummary = await requestMergedStudentWithStaleSummaryDetail();
  assert.strictEqual(mergedStaleSummary.res.statusCode, 503);
  assert.strictEqual(mergedStaleSummary.calls.cappedScan, 0, 'stale merged-student summaries must not trigger production fact scans from the drawer');
  assert.strictEqual(mergedStaleSummary.res.body.code, 'STUDENT_DETAIL_SUMMARY_NOT_READY');
  console.log('student detail fast path tests passed');
})().catch(err => {
  console.error(err);
  process.exit(1);
});
