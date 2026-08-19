const assert = require('assert');

const { createCorePageDataRoutes } = require('../server/page-data/core-pages.js');
const { TEACHING_LESSON_DETAIL_SOURCE_VERSION } = require('../server/read-models/platform-metrics.js');

const tables = {
  T_COACHES: 'coaches',
  T_CAMPUSES: 'campuses',
  T_STUDENTS: 'students',
  T_CLASSES: 'classes',
  T_PLANS: 'plans',
  T_SCHEDULE: 'schedule',
  T_PURCHASES: 'purchases',
  T_ENTITLEMENTS: 'entitlements',
  T_ENTITLEMENT_LEDGER: 'entitlement_ledger',
  T_USERS: 'users',
  T_FEEDBACKS: 'feedbacks',
  T_STUDENT_TEACHING_SUMMARY: 'student_summary'
};

const lessonDate = (index) => index < 10
  ? `2026-07-${String(index + 1).padStart(2, '0')}`
  : `2026-08-${String(index - 9).padStart(2, '0')}`;

const tableRows = {
  coaches: [{ id: 'coach-lin', name: '林铭教练', status: 'active' }],
  users: [],
  campuses: [],
  students: [{ id: 'shi-duohao', name: '史多灏', primaryCoach: '宋教练', type: '青少年' }],
  classes: [],
  plans: [],
  purchases: [
    { id: 'shi-pur-1', studentId: 'shi-duohao', packageName: '第一个私教课包', status: 'active', purchaseDate: '2026-05-01', ownerCoach: '宋教练', actualAmount: 1000 },
    { id: 'shi-pur-2', studentId: 'shi-duohao', packageName: '第二个私教课包', status: 'active', purchaseDate: '2026-07-01', ownerCoach: '林铭教练', actualAmount: 1000 }
  ],
  entitlements: [
    { id: 'shi-ent-1', purchaseId: 'shi-pur-1', studentId: 'shi-duohao', packageName: '第一个私教课包', totalLessons: 10, remainingLessons: 0, usedLessons: 10, ownerCoach: '宋教练', status: 'active' },
    { id: 'shi-ent-2', purchaseId: 'shi-pur-2', studentId: 'shi-duohao', packageName: '第二个私教课包', totalLessons: 10, remainingLessons: 2, usedLessons: 8, ownerCoach: '林铭教练', status: 'active' }
  ],
  entitlement_ledger: Array.from({ length: 19 }, (_, index) => ({
    id: `shi-ledger-${index + 1}`,
    entitlementId: index < 10 ? 'shi-ent-1' : 'shi-ent-2',
    purchaseId: index < 10 ? 'shi-pur-1' : 'shi-pur-2',
    studentId: 'shi-duohao',
    scheduleId: `shi-sch-${index + 1}`,
    lessonDelta: -1,
    relatedDate: lessonDate(index),
    reason: '上课消耗'
  })),
  schedule: [
    ...Array.from({ length: 19 }, (_, index) => ({
      id: `shi-sch-${index + 1}`,
      studentId: 'shi-duohao',
      startTime: `${lessonDate(index)} 15:00:00`,
      endTime: `${lessonDate(index)} 16:00:00`,
      status: '已结束',
      courseType: index === 18 ? '小班课' : '私教课',
      venue: '3号场',
      coach: '林铭教练',
      lessonCount: 1
    })),
    {
      id: 'shi-sch-future',
      studentId: 'shi-duohao',
      startTime: '2099-08-22 11:00:00',
      endTime: '2099-08-22 12:00:00',
      status: '已排课',
      courseType: '私教课',
      venue: '3号场',
      coach: '林铭教练',
      lessonCount: 1
    }
  ],
  feedbacks: [],
  student_summary: [{
    id: 'shi-duohao',
    studentId: 'shi-duohao',
    name: '史多灏',
    teachingLessonDetailSourceVersion: TEACHING_LESSON_DETAIL_SOURCE_VERSION,
    completedLessons: 18,
    detailPackageBalanceTotal: 20,
    detailPackageBalanceRemaining: 2,
    detailPackageBalanceText: '2/20',
    detailPackageProgressText: '2/10,0/10',
    primaryCoach: '宋教练',
    studentStage: 'formal',
    activityStatusLabel: '近30天活跃'
  }]
};

const handler = createCorePageDataRoutes({
  init: async () => {},
  sendJson: (res, body, status = 200) => {
    res.statusCode = status;
    res.body = body;
    return body;
  },
  cappedScan: async table => tableRows[table] || [],
  getCachedScan: async table => tableRows[table] || [],
  getCachedRow: async (table, id) => (tableRows[table] || []).find(row => String(row.id) === String(id)) || null,
  getScheduleListRows: async () => tableRows.schedule,
  getCoachScheduleRowsForUser: async () => tableRows.schedule,
  listCampusesWithDefaults: async () => [],
  scanCoachProposals: async () => [],
  buildCoachRefs: () => ({}),
  filterLoadAllForUser: data => data,
  timedEndpointMetric: async (_name, fn) => fn(),
  decorateWorkbenchFeedbacks: rows => rows,
  decorateWorkbenchScheduleRows: rows => rows.map(row => ({ ...row, isCancelled: String(row.status || '').includes('取消') })),
  decorateWorkbenchStudents: rows => rows,
  decorateWorkbenchClasses: rows => rows,
  buildWorkbenchStats: () => ({}),
  projectScheduleListRow: row => row,
  PRODUCTION_PAGE_READ_LIMITS: { entitlementLedger: 2000, schedule: 2000, adminUsers: 100 },
  tables
});

(async () => {
  const res = {};
  await handler({
    path: '/page-data/workbench',
    method: 'GET',
    user: { role: 'admin', name: '林铭教练', coachName: '林铭教练' },
    res,
    query: new URLSearchParams()
  });
  assert.strictEqual(res.statusCode, 200);
  const row = res.body.studentRoster.items.find(item => item.studentId === 'shi-duohao');
  assert.ok(row, 'workbench roster should include the student owned by the latest formal package coach');
  assert.strictEqual(row.cumulative, '19', 'mini workbench roster should not be stuck on stale summary cumulative lessons');
  assert.strictEqual(row.packageText, '1/10,0/10', 'mini workbench roster should use conserved current package progress');
  assert.strictEqual(row.ownerCoach, '林铭教练', 'mini workbench roster should use the latest effective formal package owner coach');
  assert.strictEqual(
    row.detailLessonRecordRows.some(item => String(item.scheduleId) === 'shi-sch-future'),
    false,
    'mini workbench student detail rows should not include future schedules as completed lessons'
  );
  console.log('workbench student roster read model tests passed');
})().catch(err => {
  console.error(err);
  process.exit(1);
});
