const assert = require('assert');
const { createCorePageDataRoutes } = require('../server/page-data/core-pages.js');
const { TEACHING_LESSON_DETAIL_SOURCE_VERSION } = require('../server/read-models/platform-metrics.js');

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
            { kind: 'ledger', time: '2026-07-01 10:00-11:00', courseType: '私教课', lessonDelta: -1 }
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
  console.log('student detail fast path tests passed');
})().catch(err => {
  console.error(err);
  process.exit(1);
});
