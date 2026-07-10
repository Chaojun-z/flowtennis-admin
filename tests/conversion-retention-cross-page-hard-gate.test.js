const assert = require('assert');

const { buildCustomerLifecycleRows } = require('../server/read-models/customer-lifecycle.js');
const { buildPlatformMetrics } = require('../server/read-models/platform-metrics.js');
const { buildOperationsMetrics } = require('../server/metrics/operations-metrics.js');
const { createCourtAccountListViewLoader } = require('../server/page-data/court-account-read-model.js');

async function membershipSummaryFromRows(rows = {}) {
  const tableRows = {
    students: rows.students || [],
    courts: rows.courts || [],
    membershipAccounts: rows.membershipAccounts || [],
    membershipOrders: rows.membershipOrders || [],
    membershipPlans: rows.membershipPlans || []
  };
  const loader = createCourtAccountListViewLoader({
    listCampusesWithDefaults: async () => rows.campuses || [],
    getCachedScan: async table => tableRows[table] || [],
    tables: {
      students: 'students',
      courts: 'courts',
      membershipAccounts: 'membershipAccounts',
      membershipOrders: 'membershipOrders',
      membershipPlans: 'membershipPlans'
    }
  });
  return (await loader()).summary || {};
}

(async () => {
  const teachingSample = {
    leads: [
      { id: 'lead-formal-one', displayName: '正式首购', leadDate: '2026-06-01' },
      { id: 'lead-formal-repeat', displayName: '正式复购', leadDate: '2026-06-01' },
      { id: 'lead-trial-deal', displayName: '体验成交', leadDate: '2026-06-01' },
      { id: 'lead-trial-pending', displayName: '体验未成交', leadDate: '2026-06-01' },
      { id: 'lead-trial-repeat-only', displayName: '只买体验课', leadDate: '2026-06-01' },
      { id: 'lead-court-only', displayName: '只订场', leadDate: '2026-06-01' }
    ],
    students: [
      { id: 'stu-formal-one', name: '正式首购', sourceLeadId: 'lead-formal-one' },
      { id: 'stu-formal-repeat', name: '正式复购', sourceLeadId: 'lead-formal-repeat' },
      { id: 'stu-trial-deal', name: '体验成交', sourceLeadId: 'lead-trial-deal' },
      { id: 'stu-trial-pending', name: '体验未成交', sourceLeadId: 'lead-trial-pending' },
      { id: 'stu-trial-repeat-only', name: '只买体验课', sourceLeadId: 'lead-trial-repeat-only' }
    ],
    purchases: [
      { id: 'purchase-formal-one', studentId: 'stu-formal-one', packageName: '成人正式课包', actualAmount: 1200, status: 'active', purchaseDate: '2026-06-02' },
      { id: 'purchase-formal-repeat-1', studentId: 'stu-formal-repeat', packageName: '成人正式课包', actualAmount: 1200, status: 'active', purchaseDate: '2026-06-02' },
      { id: 'purchase-formal-repeat-2', studentId: 'stu-formal-repeat', packageName: '成人正式课包', actualAmount: 1200, status: 'active', purchaseDate: '2026-06-08' },
      { id: 'purchase-trial-deal', studentId: 'stu-trial-deal', packageName: '成人正式课包', actualAmount: 1200, status: 'active', purchaseDate: '2026-06-03' },
      { id: 'purchase-trial-only-1', studentId: 'stu-trial-repeat-only', packageName: '体验课包', courseType: '体验课', actualAmount: 199, status: 'active', purchaseDate: '2026-06-04' },
      { id: 'purchase-trial-only-2', studentId: 'stu-trial-repeat-only', packageName: '体验课包', courseType: '体验课', actualAmount: 199, status: 'active', purchaseDate: '2026-06-05' }
    ],
    schedule: [
      { id: 'schedule-trial-deal', studentId: 'stu-trial-deal', courseType: '体验课', startTime: '2026-06-02 10:00:00', endTime: '2026-06-02 11:00:00', status: '已完成' },
      { id: 'schedule-trial-pending', studentId: 'stu-trial-pending', courseType: '体验课', startTime: '2026-06-02 11:00:00', endTime: '2026-06-02 12:00:00', status: '已完成' }
    ],
    courts: [
      { id: 'court-only', name: '只订场', sourceLeadId: 'lead-court-only', history: JSON.stringify([{ date: '2026-06-03', startTime: '10:00', endTime: '11:00', amount: 100, type: '消费' }]) }
    ],
    membershipAccounts: [],
    membershipOrders: []
  };

  const lifecycleRows = buildCustomerLifecycleRows(teachingSample);
  const platform = buildPlatformMetrics({ ...teachingSample, customerLifecycleRows: lifecycleRows });
  const operations = buildOperationsMetrics({ ...teachingSample, customerLifecycleRows: lifecycleRows }, {
    now: new Date('2026-06-12 12:00:00'),
    dateRange: { startDate: '2026-06-01', endDate: '2026-06-12' }
  });

  assert.strictEqual(
    operations.conversion.standardLifecycleMetrics.metrics.formalStudents.value,
    platform.teachingStudentViews.formalStudents.length,
    '转化与留存正式学员必须等于正式学员页统一视图人数'
  );
  assert.strictEqual(
    operations.conversion.standardLifecycleMetrics.metrics.trialPathDeals.value,
    platform.teachingStudentViews.trialPathDealStudents.length,
    '转化与留存体验后买正式课必须等于统一上过体验课成交人数'
  );
  assert.strictEqual(
    operations.conversion.retention.teaching.packageRepeatRate.numerator,
    platform.standardLifecycleMetrics.metrics.courseRepeatBuyers.value,
    '转化与留存课包复购人数必须等于正式学员页课包复购人数，不能把体验课包复购算进去'
  );
  assert.strictEqual(
    operations.conversion.retention.teaching.packageRepeatRate.denominator,
    platform.teachingStudentViews.formalStudents.length,
    '转化与留存课包复购率分母必须等于正式学员人数'
  );

  const latestTrend = operations.conversion.trends.at(-1) || {};
  assert.strictEqual(
    latestTrend.totalDealRateDenominator,
    teachingSample.leads.length,
    '总成交转化率趋势分母必须固定为所选线索样本池'
  );
  assert.strictEqual(
    latestTrend.courseDealRateDenominator,
    teachingSample.leads.length,
    '课程成交率趋势分母必须固定为所选线索样本池'
  );
  assert.strictEqual(
    latestTrend.courseRepeatRateNumerator,
    platform.standardLifecycleMetrics.metrics.courseRepeatBuyers.value,
    '课包复购趋势分子必须使用正式课包复购人数'
  );

  const manualCourseOnlySample = {
    leads: [
      {
        id: 'lead-manual-course-only',
        displayName: '只标课程成交',
        leadDate: '2026-06-01',
        conversionAt: '2026-06-03',
        leadStage: '已成交',
        dealType: '课程',
        conversionType: '课程',
        studentId: 'stu-manual-course-only'
      }
    ],
    students: [
      { id: 'stu-manual-course-only', name: '只标课程成交', sourceLeadId: 'lead-manual-course-only' }
    ],
    purchases: [],
    schedule: [],
    courts: [],
    membershipAccounts: [],
    membershipOrders: []
  };
  const manualLifecycleRows = buildCustomerLifecycleRows(manualCourseOnlySample);
  const manualPlatform = buildPlatformMetrics({ ...manualCourseOnlySample, customerLifecycleRows: manualLifecycleRows });
  const manualOperations = buildOperationsMetrics({ ...manualCourseOnlySample, customerLifecycleRows: manualLifecycleRows }, {
    now: new Date('2026-06-12 12:00:00'),
    dateRange: { startDate: '2026-06-01', endDate: '2026-06-12' }
  });
  assert.strictEqual(
    manualPlatform.teachingStudentViews.formalStudents.length,
    0,
    '只在线索池标记课程成交、没有正式课包购买，不能进入正式学员'
  );
  assert.strictEqual(
    manualOperations.conversion.trends.at(-1)?.courseDealRateNumerator,
    0,
    '经营分析课程成交趋势不能被线索池手工课程成交标记带高'
  );
  assert.strictEqual(
    manualOperations.conversion.standardLifecycleMetrics.metrics.formalStudents.value,
    0,
    '经营分析课程成交标准指标必须继续等于正式学员统一视图'
  );

  const membershipSample = {
    campuses: [{ id: 'shunyi_mapo', code: 'shunyi_mapo', name: '顺义马坡' }],
    students: [],
    courts: [
      { id: 'court-member-repeat', name: '复储会员', campus: 'shunyi_mapo', history: JSON.stringify([{ date: '2026-06-01', startTime: '10:00', endTime: '11:00', amount: 100, type: '消费', payMethod: '储值扣款' }]) }
    ],
    membershipAccounts: [
      { id: 'account-repeat', courtId: 'court-member-repeat', status: 'active', createdAt: '2026-06-01' }
    ],
    membershipOrders: [
      { id: 'member-order-1', courtId: 'court-member-repeat', rechargeAmount: 1000, status: 'active', purchaseDate: '2026-06-01' },
      { id: 'member-order-2', courtId: 'court-member-repeat', rechargeAmount: 1000, status: 'active', purchaseDate: '2026-06-08' }
    ],
    membershipPlans: []
  };
  const membershipSummary = await membershipSummaryFromRows(membershipSample);
  const membershipOperations = buildOperationsMetrics({
    ...membershipSample,
    leads: [],
    purchases: [],
    schedule: [],
    financeNormalizedRows: [],
    financeOverviewData: {}
  }, { now: new Date('2026-06-12 12:00:00') });

  assert.strictEqual(membershipSummary.totalMemberCount, 1, '会员管理读模型样本应有 1 个会员');
  assert.strictEqual(membershipSummary.totalMembershipRechargeCount, 2, '会员管理读模型样本应有 2 次储值');
  assert.strictEqual(
    membershipOperations.conversion.courtChain.memberRepeatCustomers,
    membershipSummary.totalMembershipRepeatRechargeCount,
    '转化与留存订场会员复购必须等于会员管理读模型的复储会员人数'
  );

  console.log('conversion retention cross-page hard gate tests passed');
})().catch(error => {
  console.error(error);
  process.exit(1);
});
