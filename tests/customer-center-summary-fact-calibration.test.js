const assert = require('assert');
const { createCorePageDataRoutes } = require('../server/page-data/core-pages.js');

function makeHandler() {
  const calls = { tableScans: {} };
  const rows = {
    leads: [],
    students: [
      { id: 'stu-trial-1', name: '体验一' },
      { id: 'stu-trial-2', name: '体验二' },
      { id: 'stu-trial-formal', name: '体验成交' }
    ],
    purchases: [
      {
        id: 'purchase-formal',
        studentId: 'stu-trial-formal',
        studentName: '体验成交',
        courseType: '私教课',
        packageName: '10 节私教课包',
        amountPaid: 6000,
        purchaseDate: '2026-08-02'
      }
    ],
    entitlements: [],
    entitlementLedger: [],
    schedule: [
      {
        id: 'trial-1',
        studentId: 'stu-trial-1',
        studentIds: ['stu-trial-1'],
        studentName: '体验一',
        courseType: '体验课',
        startTime: '2026-08-01 10:00:00',
        status: '已排课'
      },
      {
        id: 'trial-2',
        studentId: 'stu-trial-2',
        studentIds: ['stu-trial-2'],
        studentName: '体验二',
        courseType: '体验课',
        startTime: '2026-08-02 10:00:00',
        status: '已排课'
      },
      {
        id: 'trial-formal',
        studentId: 'stu-trial-formal',
        studentIds: ['stu-trial-formal'],
        studentName: '体验成交',
        courseType: '体验课',
        startTime: '2026-08-03 10:00:00',
        status: '已排课'
      },
      {
        id: 'trial-future',
        studentId: 'stu-future',
        studentIds: ['stu-future'],
        studentName: '未来体验',
        courseType: '体验课',
        startTime: '2026-09-03 10:00:00',
        status: '已排课'
      },
      {
        id: 'trial-cancelled',
        studentId: 'stu-cancelled',
        studentIds: ['stu-cancelled'],
        studentName: '取消体验',
        courseType: '体验课',
        startTime: '2026-08-03 10:00:00',
        status: '已取消'
      }
    ],
    feedbacks: [],
    membershipBenefitLedger: [],
    studentSummaries: [
      {
        id: 'stu-trial-1',
        studentId: 'stu-trial-1',
        name: '体验一',
        hasTrialAttended: true,
        hasFormalAttended: false,
        isHistoricalStudentRoster: true,
        isActiveStudentRoster: false
      },
      {
        id: 'stu-active-1',
        studentId: 'stu-active-1',
        name: '活跃一',
        hasTrialAttended: true,
        hasFormalAttended: true,
        isHistoricalStudentRoster: false,
        isActiveStudentRoster: false,
        lastFormalLessonAt: '2026-08-20',
        detailRecentLessonDate: '2026-08-20',
        packageBalanceRemaining: 1,
        activityStatusLabel: '近30天活跃',
        studentStatusLabel: '课包活跃中'
      }
    ]
  };
  const tableRows = {
    ft_leads: rows.leads,
    ft_students: rows.students,
    ft_purchases: rows.purchases,
    ft_entitlements: rows.entitlements,
    ft_entitlement_ledger: rows.entitlementLedger,
    ft_schedule: rows.schedule,
    ft_feedbacks: rows.feedbacks,
    ft_membership_benefit_ledger: rows.membershipBenefitLedger,
    ft_student_teaching_summary: rows.studentSummaries
  };
  const clone = value => JSON.parse(JSON.stringify(value || []));
  const readTable = async table => {
    calls.tableScans[table] = (calls.tableScans[table] || 0) + 1;
    return clone(tableRows[table]);
  };
  const handler = createCorePageDataRoutes({
    init: async () => {},
    sendJson: (res, body, status = 200) => {
      res.statusCode = status;
      res.body = body;
      return body;
    },
    cappedScan: readTable,
    getCachedScan: readTable,
    getCachedRow: async () => null,
    filterLoadAllForUser: data => data,
    PRODUCTION_PAGE_READ_LIMITS: { schedule: 2000, entitlementLedger: 2000 },
    tables: {
      T_LEADS: 'ft_leads',
      T_STUDENTS: 'ft_students',
      T_PURCHASES: 'ft_purchases',
      T_ENTITLEMENTS: 'ft_entitlements',
      T_ENTITLEMENT_LEDGER: 'ft_entitlement_ledger',
      T_SCHEDULE: 'ft_schedule',
      T_FEEDBACKS: 'ft_feedbacks',
      T_MEMBERSHIP_BENEFIT_LEDGER: 'ft_membership_benefit_ledger',
      T_STUDENT_TEACHING_SUMMARY: 'ft_student_teaching_summary'
    }
  });
  return { handler, calls };
}

async function request(queryText = '') {
  const { handler, calls } = makeHandler();
  const res = {};
  await handler({
    path: '/page-data/customer-center-list',
    method: 'GET',
    user: { role: 'admin', name: '管理员' },
    res,
    query: new URLSearchParams(queryText)
  });
  return { res, calls };
}

(async () => {
  const { res, calls } = await request();
  assert.strictEqual(res.statusCode, 200);
  assert.strictEqual(
    res.body.standardLifecycleMetrics.teachingSummary.trialAttendedStudentCount,
    2,
    '客户中心顶部上过体验课必须读取统一教学摘要读模型'
  );
  assert.strictEqual(
    res.body.standardLifecycleMetrics.teachingSummary.trialAttendedToFormalPurchaseCount,
    1,
    '体验后买正式课必须读取统一教学摘要读模型里的体验和正式课事实'
  );
  assert.strictEqual(
    res.body.standardLifecycleMetrics.teachingSummary.trialAttendedWithoutFormalCount,
    1,
    '体验未买正式课必须由同一批统一教学摘要读模型计算'
  );
  assert.strictEqual(
    res.body.standardLifecycleMetrics.teachingSummary.activeStudentCount,
    1,
    '在期学员必须能从摘要行里的最近正式课和课包余额字段稳定还原'
  );
  assert.strictEqual(calls.tableScans.ft_student_teaching_summary, 1, '客户中心首屏必须读取统一教学摘要读模型');
  ['ft_schedule','ft_entitlement_ledger','ft_membership_benefit_ledger','ft_purchases','ft_entitlements','ft_students'].forEach(table => {
    assert.strictEqual(calls.tableScans[table] || 0, 0, `客户中心首屏不能扫描事实大表 ${table}`);
  });

  const fresh = await request('fresh=1');
  assert.strictEqual(
    fresh.res.body.standardLifecycleMetrics.teachingSummary.trialAttendedStudentCount,
    2,
    '强制 fresh 也不能让首屏回退成扫描事实大表'
  );

  console.log('customer center summary fact calibration tests passed');
})().catch(err => {
  console.error(err);
  process.exit(1);
});
