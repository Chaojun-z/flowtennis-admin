const assert = require('assert');

const {
  coachAvailableHours,
  buildOperationsMetrics
} = require('../server/metrics/operations-metrics.js');

assert.strictEqual(coachAvailableHours({ period: 'today' }), 8, 'coach daily available hours should be 8');
assert.strictEqual(coachAvailableHours({ period: 'week' }), 48, 'coach weekly available hours should be 6 days * 8 hours');
assert.strictEqual(
  coachAvailableHours({ period: 'month', now: new Date('2026-06-18 00:00:00') }),
  205.7,
  'coach monthly available hours should use natural days * 8 * 6 / 7'
);

const metrics = buildOperationsMetrics({
  campuses: [{ id: 'shunyi_mapo', code: 'shunyi_mapo', name: '顺义马坡' }],
  leads: [
    { id: 'lead-1', leadStage: '未转化', source: '小红书', leadDate: '2026-06-01', campus: 'shunyi_mapo', owner: '张教练', level: '零基础', gender: '女', studentType: '成人' },
    { id: 'lead-2', leadStage: '课程转化', studentId: 'student-2', source: '小红书', leadDate: '2026-06-02', trialAtRaw: '2026-06-04', trialAttendedAt: '2026-06-04', campus: 'shunyi_mapo', owner: '张教练', level: '进阶提升', gender: '男', studentType: '成人' },
    { id: 'lead-3', studentId: 'student-1', courtId: 'court-1', source: '转介绍', leadDate: '2026-06-03', trialAtRaw: '2026-06-07', trialAttendedAt: '2026-06-07', campus: 'shunyi_mapo', owner: 'Siren 教练', level: '零基础', gender: '女', studentType: '青少年' },
    { id: 'lead-4', rawStatus: '已流失', source: '大众点评', leadDate: '2026-06-04', campus: 'shunyi_mapo', owner: 'Siren 教练', level: '零基础', gender: '女', studentType: '成人' },
    { id: 'lead-5', leadStage: '订场转化', courtId: 'court-2', source: '抖音/美团', leadDate: '2026-06-05', campus: 'shunyi_mapo', owner: '张教练', level: '零基础', gender: '男', studentType: '成人' }
  ],
  students: [
    { id: 'student-1', sourceLeadId: 'lead-3', dealPath: '体验转化', primaryCoach: 'Siren 教练', level: '零基础', gender: '女', studentType: '青少年' },
    { id: 'student-2', sourceLeadId: 'lead-2', dealPath: '体验转化', primaryCoach: '张教练', level: '进阶提升', gender: '男', studentType: '成人' }
  ],
  purchases: [
    { id: 'purchase-1', studentId: 'student-1', packageId: 'pkg-a', amount: 1000, actualAmount: 1000, purchaseDate: '2026-06-05' },
    { id: 'purchase-2', studentId: 'student-1', packageId: 'pkg-a', amount: 1200, actualAmount: 1200, purchaseDate: '2026-06-15' },
    { id: 'purchase-3', studentId: 'student-2', packageId: 'pkg-b', amount: 900, actualAmount: 900, purchaseDate: '2026-06-08' }
  ],
  coaches: [{ id: 'coach-1', name: 'Siren 教练', status: 'active', campus: 'shunyi_mapo' }],
  schedule: [
    { id: 'trial-sch-1', studentId: 'student-1', courseType: '体验课', startTime: '2026-06-05 09:00:00', endTime: '2026-06-05 10:00:00', status: '已完成', campus: 'shunyi_mapo' },
    { id: 'trial-sch-2', studentId: 'student-2', courseType: '体验课', startTime: '2026-06-05 11:00:00', endTime: '2026-06-05 12:00:00', status: '已完成', campus: 'shunyi_mapo' },
    { id: 'sch-1', coach: 'Siren 教练', startTime: '2026-06-05 10:00:00', endTime: '2026-06-05 12:00:00', status: '已排课', campus: 'shunyi_mapo' }
  ],
  courts: [
    {
      id: 'court-1',
      campus: 'shunyi_mapo',
      history: JSON.stringify([
        { date: '2026-06-06', venue: '1号场', startTime: '08:00', endTime: '10:00', amount: 300, type: '消费', category: '散客订场' }
      ])
    }
  ],
  membershipAccounts: [{ id: 'member-1', sourceLeadId: 'lead-other' }],
  membershipOrders: [],
  financeNormalizedRows: [
    { id: 'finance-court-1', businessType: '散客订场', action: '收款', cashDelta: 300, recognizedRevenueDelta: 300, timeText: '08:00-10:00', sourceProject: '1号场' },
    { id: 'finance-court-2', businessType: '会员订场', action: '已入账', cashDelta: 0, recognizedRevenueDelta: 180, timeText: '10:00-11:00', sourceProject: '2号场' }
  ],
  financeOverviewData: { totalIncome: 2500, recognizedRevenue: 700, pendingRevenue: 1800 }
}, { now: new Date('2026-06-18 00:00:00') });

assert.strictEqual(metrics.overview.cards.totalIncome.value, 2500, 'overview should reuse finance total income');
assert.strictEqual(metrics.conversion.cards.totalLeads.value, 5, 'conversion should count all leads');
assert.strictEqual(metrics.conversion.stageRows.find(row => row.stage === '已成交').count, 3, 'lead funnel should collapse all deal paths into the single standard converted stage');
assert.strictEqual(metrics.conversion.cards.sameProjectRenewalRate.value, 100, 'same package renewal should count as same-project renewal');
assert.deepStrictEqual(
  metrics.conversion.courseFunnel.map(row => row.stage),
  ['有效线索', '普通学员', '正式学员', '课包复购'],
  'course conversion funnel should use the documented course-chain stage order'
);
assert.strictEqual(metrics.conversion.courseFunnel[0].count, 5, 'course funnel should keep valid leads as the first stage');
assert.strictEqual(metrics.conversion.courseFunnel[1].count, 2, 'course funnel should count standard course-chain students');
assert.strictEqual(metrics.conversion.courseFunnel[2].count, 2, 'course funnel should count standard formal students');
assert.strictEqual(metrics.conversion.courseFunnel[3].count, 1, 'course funnel should include package repeat buyers from the unified course retention metric');
assert.strictEqual(metrics.conversion.retention.teaching.packageRepeatRate.status, 'ready', 'teaching retention should expose existing package repeat rate as ready');
assert.strictEqual(metrics.conversion.retention.teaching.packageRenewalRate.status, 'pending', 'teaching retention must not fabricate package renewal rate before the renewal-window read model exists');
assert.strictEqual(metrics.conversion.retention.court.ndRetention.status, 'pending', 'court N-day retention must stay pending until a unified retention read model exists');
assert.strictEqual(metrics.conversion.retention.member.ndRetention.status, 'pending', 'member N-day retention must stay pending until a unified retention read model exists');
assert.strictEqual(metrics.conversion.sourceRanking.find(row => row.source === '抖音/美团'), undefined, 'booking-only converted channels should not enter course deal ranking');
assert.ok(metrics.conversion.sourceRanking.find(row => row.source === '转介绍'), 'channel deal ranking should include course deal channels');
assert.ok(metrics.conversion.sourceRanking.find(row => row.source === '小红书'), 'channel deal ranking should include all course deal channels');
assert.strictEqual(metrics.conversion.channelEfficiencyRows.find(row => row.source === '小红书')?.trialConversionRate, 50, 'channel trial conversion rate should use trial attendance count over leads');
assert.strictEqual(metrics.conversion.channelEfficiencyRows.find(row => row.source === '小红书')?.dealConversionRate, 50, 'channel deal conversion rate should use deals over leads');
assert.strictEqual(metrics.conversion.studentAttributeRows, undefined, 'conversion page should not output local people profile rows');
assert.ok(metrics.conversion.profileRows.find(row => row.attribute === '青少年女性'), 'conversion profile rows should restore youth/gender profile data');
assert.strictEqual(metrics.conversion.profileRows.find(row => row.attribute === '零基础')?.renewalRate, 100, 'conversion profile rows should expose retention profile rate');
assert.strictEqual(metrics.conversion.filterOptions, undefined, 'conversion page should not output local source/campus/coach filters');
assert.strictEqual(metrics.coach.cards.availableHoursThisWeek.value, 75.4, 'coach module should use the current data span when all-time is selected');
assert.strictEqual(metrics.coach.period.label, '全部时间（按数据跨度 11 天）', 'coach module should expose the period behind all-time capacity');
assert.strictEqual(metrics.coach.rows[0].usedHours, 2, 'coach workload should sum completed lesson hours');
assert.strictEqual(metrics.court.cards.bookingHours.value, 2, 'court module should sum booking hours from court history');
assert.strictEqual(metrics.court.cards.bookingAmount.value, 480, 'court module should reuse finance booking rows without double-counting recognized revenue');

const campusVenueMetrics = buildOperationsMetrics({
  campuses: [
    {
      id: 'shunyi_mapo',
      code: 'shunyi_mapo',
      name: '顺义马坡',
      venues: [
        { id: 'v1', name: '1号红土场', status: 'active', sortOrder: 1 },
        { id: 'v2', name: '2号硬地场', status: 'active', sortOrder: 2 },
        { id: 'v3', name: '停用场地', status: 'inactive', sortOrder: 3 }
      ]
    },
    {
      id: 'gaoxin',
      code: 'gaoxin',
      name: '高新旗舰店',
      venues: [{ id: 'g1', name: 'A号场', status: 'active', sortOrder: 1 }]
    }
  ],
  courts: [
    {
      id: 'court-shunyi_mapo',
      campus: 'shunyi_mapo',
      history: JSON.stringify([
        { id: 'h1', date: '2026-06-06', venue: '1号红土场', venueId: 'v1', startTime: '08:00', endTime: '10:00', amount: 300, type: '消费', category: '散客订场' },
        { id: 'h2', date: '2026-06-06', venue: '2号硬地场', startTime: '18:00', endTime: '20:00', amount: 400, type: '消费', category: '会员订场' },
        { id: 'h3', date: '2026-06-06', venue: '历史旧场地', startTime: '20:00', endTime: '21:00', amount: 100, type: '消费', category: '散客订场' }
      ])
    }
  ],
  schedule: [
    { id: 's1', campus: 'shunyi_mapo', venueId: 'v1', venue: '1号红土场', startTime: '2026-06-06 16:00:00', endTime: '2026-06-06 17:00:00', status: '已排课' },
    { id: 's2', campus: 'shunyi_mapo', venue: '外部球馆', locationType: 'external', startTime: '2026-06-06 18:00:00', endTime: '2026-06-06 19:00:00', status: '已排课' }
  ],
  leads: [],
  students: [],
  purchases: [],
  coaches: [],
  membershipAccounts: [],
  membershipOrders: [],
  financeNormalizedRows: [],
  financeOverviewData: {}
}, { now: new Date('2026-06-18 00:00:00') });

const shunyi_mapoCampus = campusVenueMetrics.court.campusRows.find(row => row.campusCode === 'shunyi_mapo');
const gaoxinCampus = campusVenueMetrics.court.campusRows.find(row => row.campusCode === 'gaoxin');
assert.strictEqual(campusVenueMetrics.court.cards.activeVenues.value, 3, 'court module should count enabled venues from campus config');
assert.strictEqual(shunyi_mapoCampus.venueCount, 2, 'campus row should derive venue count from active campus venues');
assert.strictEqual(shunyi_mapoCampus.bookingAmount, 800, 'campus booking revenue should include matched and historical unmatched booking rows');
assert.strictEqual(shunyi_mapoCampus.bookingCount, 3, 'campus booking count should include historical booking rows only');
assert.strictEqual(shunyi_mapoCampus.usageCount, 4, 'campus usage count should include historical booking rows and own-campus schedule occupancy');
assert.strictEqual(shunyi_mapoCampus.utilizationRate, 16.7, 'campus utilization should use active venue capacity as denominator');
assert.strictEqual(shunyi_mapoCampus.goldenUtilizationRate, 16.7, 'weekend golden utilization should use the whole active day as prime capacity');
assert.strictEqual(shunyi_mapoCampus.offPeakUtilizationRate, 0, 'weekend off-peak utilization should be zero because the whole active day is prime');
assert.strictEqual(campusVenueMetrics.court.cards.goldenUtilizationRate.value, 16.7, 'court cards should expose weighted golden utilization for top KPI cards');
assert.strictEqual(campusVenueMetrics.court.cards.offPeakUtilizationRate.value, 0, 'court cards should expose weighted off-peak utilization for top KPI cards');
assert.strictEqual(campusVenueMetrics.court.venueRows.find(row => row.campus === '顺义马坡' && row.venue === '1号红土场').usageCount, 2, 'venue rows should expose one row per court with booking plus schedule usage count');
assert.strictEqual(campusVenueMetrics.court.venueRows.find(row => row.campus === '顺义马坡' && row.venue === '1号红土场').utilizationRate, 20, 'venue rows should expose per-court utilization');
assert.strictEqual(campusVenueMetrics.court.venueRows.find(row => row.campus === '顺义马坡' && row.venue === '1号红土场').goldenUtilizationRate, 20, 'venue rows should treat weekend full-day usage as golden utilization');
assert.strictEqual(campusVenueMetrics.court.venueRows.find(row => row.campus === '顺义马坡' && row.venue === '1号红土场').offPeakUtilizationRate, 0, 'venue rows should treat weekend off-peak capacity as zero');
assert.strictEqual(campusVenueMetrics.court.venueRows.find(row => row.campus === '顺义马坡' && row.venue === '未匹配').usageCount, 1, 'unmatched historical venue rows should still appear as one row in court overview data');
assert.strictEqual(gaoxinCampus.venueCount, 1, 'campuses without bookings should still appear from campus config');
assert.strictEqual(gaoxinCampus.utilizationRate, 0, 'empty campus utilization should be zero');
assert.ok(campusVenueMetrics.court.campusHeatmaps.find(row => row.campusCode === 'shunyi_mapo').venues.find(row => row.venueName === '未匹配'), 'unmatched historical venue rows should be displayed separately');
assert.ok(campusVenueMetrics.court.campusHeatmaps.find(row => row.campusCode === 'gaoxin').venues.find(row => row.venueName === 'A号场'), 'configured venues with no orders should still render in heatmap');
assert.strictEqual(campusVenueMetrics.court.campusHeatmaps.find(row => row.campusCode === 'shunyi_mapo').venues.find(row => row.venueId === 'v1').slots.find(slot => slot.hour === '16:00').utilizationRate, 100, 'own campus schedules should occupy configured venue heatmap slots');
assert.strictEqual(campusVenueMetrics.court.campusHeatmaps.find(row => row.campusCode === 'shunyi_mapo').venues.find(row => row.venueId === 'v2').slots.find(slot => slot.hour === '18:00').utilizationRate, 100, 'legacy rows should match configured venues by campus and venue name');

const rangedHeatMetrics = buildOperationsMetrics({
  campuses: [
    {
      id: 'shunyi_mapo',
      code: 'shunyi_mapo',
      name: '顺义马坡',
      venues: [{ id: 'v1', name: '1号场', status: 'active', sortOrder: 1 }]
    }
  ],
  courts: [
    {
      id: 'court-ranged',
      campus: 'shunyi_mapo',
      history: JSON.stringify([
        { id: 'in-range', date: '2026-06-01', venue: '1号场', venueId: 'v1', startTime: '18:00', endTime: '18:30', amount: 100, type: '消费', category: '散客订场' },
        { id: 'out-range', date: '2026-05-31', venue: '1号场', venueId: 'v1', startTime: '18:00', endTime: '18:30', amount: 100, type: '消费', category: '散客订场' }
      ])
    }
  ],
  schedule: [
    { id: 'schedule-in-range', campus: 'shunyi_mapo', venueId: 'v1', venue: '1号场', startTime: '2026-06-02 18:00:00', endTime: '2026-06-02 18:30:00', status: '已排课' }
  ],
  leads: [],
  students: [],
  purchases: [],
  coaches: [],
  membershipAccounts: [],
  membershipOrders: [],
  financeNormalizedRows: [],
  financeOverviewData: {}
}, { now: new Date('2026-06-18 00:00:00'), dateRange: { startDate: '2026-06-01', endDate: '2026-06-07' } });
const rangedCampus = rangedHeatMetrics.court.campusHeatmaps.find(row => row.campusCode === 'shunyi_mapo');
const rangedVenue = rangedCampus.venues.find(row => row.venueId === 'v1');
assert.ok(rangedCampus.hours.includes('18:30'), 'court heatmap should use half-hour slots');
assert.strictEqual(rangedVenue.slots.find(slot => slot.hour === '18:00').utilizationRate, 28.6, 'half-hour heat rate should use selected period capacity as denominator and include booking plus schedule occupancy');
assert.strictEqual(rangedVenue.slots.find(slot => slot.hour === '18:30').utilizationRate, 0, 'out-of-range bookings should not heat selected-period slots');
assert.strictEqual(rangedHeatMetrics.court.campusRows.find(row => row.campusCode === 'shunyi_mapo').bookingCount, 1, 'court booking counts should follow the selected date range without counting schedules as bookings');
assert.strictEqual(rangedHeatMetrics.court.campusRows.find(row => row.campusCode === 'shunyi_mapo').usageCount, 2, 'court usage counts should follow the selected date range and include own-campus schedule occupancy');
assert.strictEqual(rangedHeatMetrics.court.campusRows.find(row => row.campusCode === 'shunyi_mapo').goldenUtilizationRate, 1.7, 'golden utilization should use selected period capacity and treat weekend full days as prime');

const currentMonthHeatMetrics = buildOperationsMetrics({
  campuses: [
    {
      id: 'shunyi_mapo',
      code: 'shunyi_mapo',
      name: '顺义马坡',
      venues: [{ id: 'v1', name: '1号场', status: 'active', sortOrder: 1 }]
    }
  ],
  courts: [
    {
      id: 'court-current-month',
      campus: 'shunyi_mapo',
      history: JSON.stringify([
        { id: 'jun-01', date: '2026-06-01', venue: '1号场', venueId: 'v1', startTime: '14:00', endTime: '14:30', amount: 100, type: '消费', category: '散客订场' },
        { id: 'jun-05', date: '2026-06-05', venue: '1号场', venueId: 'v1', startTime: '14:00', endTime: '14:30', amount: 100, type: '消费', category: '散客订场' },
        { id: 'jun-10', date: '2026-06-10', venue: '1号场', venueId: 'v1', startTime: '14:00', endTime: '14:30', amount: 100, type: '消费', category: '散客订场' },
        { id: 'jun-20', date: '2026-06-20', venue: '1号场', venueId: 'v1', startTime: '14:00', endTime: '14:30', amount: 100, type: '消费', category: '散客订场' }
      ])
    }
  ],
  schedule: [],
  leads: [],
  students: [],
  purchases: [],
  coaches: [],
  membershipAccounts: [],
  membershipOrders: [],
  financeNormalizedRows: [],
  financeOverviewData: {}
}, { now: new Date('2026-06-20 14:00:00'), dateRange: { startDate: '2026-06-01', endDate: '2026-06-30' } });
const currentMonthSlot = currentMonthHeatMetrics.court.campusHeatmaps.find(row => row.campusCode === 'shunyi_mapo').venues.find(row => row.venueId === 'v1').slots.find(slot => slot.hour === '14:00');
assert.strictEqual(currentMonthSlot.utilizationRate, 20, 'current month heatmap should not dilute utilization with future dates');
assert.strictEqual(currentMonthSlot.heatRate, 100, 'heatmap color strength should use relative heat within the selected campus');
assert.strictEqual(currentMonthSlot.occupiedCount, 4, 'heatmap slots should expose occupied count for hover numerator');
assert.strictEqual(currentMonthSlot.dayCount, 20, 'heatmap slots should expose selected business days for hover denominator');
assert.strictEqual(currentMonthSlot.capacityMinutes, 600, 'heatmap slots should expose capacity minutes for hover denominator');

const singleDayTrendMetrics = buildOperationsMetrics({
  campuses: [{ id: 'shunyi_mapo', code: 'shunyi_mapo', name: '顺义马坡', venues: [{ id: 'v1', name: '1号场', status: 'active' }] }],
  leads: [
    { id: 'lead-old', leadStage: '课程转化', studentId: 'student-old', source: '小红书', leadDate: '2026-06-16', campus: 'shunyi_mapo' },
    { id: 'lead-today', leadStage: '课程转化', studentId: 'student-today', source: '转介绍', leadDate: '2026-06-18', campus: 'shunyi_mapo' }
  ],
  students: [
    { id: 'student-old', sourceLeadId: 'lead-old', primaryCoach: 'Siren 教练' },
    { id: 'student-today', sourceLeadId: 'lead-today', primaryCoach: 'Siren 教练' }
  ],
  purchases: [
    { id: 'purchase-old', studentId: 'student-old', amount: 800, actualAmount: 800, purchaseDate: '2026-06-16', ownerCoach: 'Siren 教练' },
    { id: 'purchase-today', studentId: 'student-today', amount: 1200, actualAmount: 1200, purchaseDate: '2026-06-18', ownerCoach: 'Siren 教练' }
  ],
  coaches: [{ id: 'coach-1', name: 'Siren 教练', status: 'active', campus: 'shunyi_mapo' }],
  schedule: [
    { id: 'schedule-old', coach: 'Siren 教练', campus: 'shunyi_mapo', venueId: 'v1', venue: '1号场', startTime: '2026-06-16 10:00:00', endTime: '2026-06-16 11:00:00', status: '已排课' },
    { id: 'schedule-today', coach: 'Siren 教练', campus: 'shunyi_mapo', venueId: 'v1', venue: '1号场', startTime: '2026-06-18 10:00:00', endTime: '2026-06-18 11:00:00', status: '已排课' }
  ],
  courts: [
    {
      id: 'court-single-day-trend',
      campus: 'shunyi_mapo',
      history: JSON.stringify([
        { id: 'court-old', date: '2026-06-16', venue: '1号场', venueId: 'v1', startTime: '08:00', endTime: '09:00', amount: 100, type: '消费', category: '散客订场' },
        { id: 'court-today', date: '2026-06-18', venue: '1号场', venueId: 'v1', startTime: '08:00', endTime: '09:00', amount: 200, type: '消费', category: '散客订场' }
      ])
    }
  ],
  membershipAccounts: [],
  membershipOrders: [],
  financeNormalizedRows: [],
  financeOverviewData: {}
}, {
  now: new Date('2026-06-20 00:00:00'),
  dateRange: { startDate: '2026-06-18', endDate: '2026-06-18' }
});

assert.strictEqual(singleDayTrendMetrics.conversion.cards.totalLeads.value, 1, 'single-day KPI should still use the selected day only');
['overview', 'court', 'conversion', 'coach'].forEach(section => {
  assert.strictEqual(singleDayTrendMetrics[section].trendDiagnostics.pointCount, singleDayTrendMetrics[section].trends.length, `${section} trend diagnostics should match returned trend rows`);
  assert.strictEqual(singleDayTrendMetrics[section].trendDiagnostics.emptyReason, '', `${section} trend diagnostics should not report empty when trend rows exist`);
  assert.ok(singleDayTrendMetrics[section].trendDiagnostics.firstDate <= '2026-06-16', `${section} single-day filter should still expose a real multi-day trend window`);
  assert.strictEqual(singleDayTrendMetrics[section].trendDiagnostics.lastDate, '2026-06-18', `${section} trend window should end at the selected day`);
  assert.ok(singleDayTrendMetrics[section].trends.length >= 2, `${section} should return enough trend points for a visible top sparkline even when the filter is one day`);
});

const allTimeSpanMetrics = buildOperationsMetrics({
  campuses: [
    {
      id: 'shunyi_mapo',
      code: 'shunyi_mapo',
      name: '顺义马坡',
      venues: [{ id: 'v1', name: '1号场', status: 'active', sortOrder: 1 }]
    }
  ],
  courts: [
    {
      id: 'court-all-time',
      campus: 'shunyi_mapo',
      history: JSON.stringify([
        { id: 'first-day', date: '2026-06-01', venue: '1号场', venueId: 'v1', startTime: '18:00', endTime: '18:30', amount: 100, type: '消费', category: '散客订场' },
        { id: 'last-day', date: '2026-06-07', venue: '1号场', venueId: 'v1', startTime: '18:00', endTime: '18:30', amount: 100, type: '消费', category: '散客订场' }
      ])
    }
  ],
  schedule: [],
  leads: [],
  students: [],
  purchases: [],
  coaches: [],
  membershipAccounts: [],
  membershipOrders: [],
  financeNormalizedRows: [],
  financeOverviewData: {}
}, { now: new Date('2026-06-18 00:00:00') });
assert.strictEqual(allTimeSpanMetrics.court.campusRows.find(row => row.campusCode === 'shunyi_mapo').goldenUtilizationRate, 4.8, 'all-time utilization should use active business days and treat weekend full days as prime');
assert.strictEqual(allTimeSpanMetrics.court.campusHeatmaps.find(row => row.campusCode === 'shunyi_mapo').venues.find(row => row.venueId === 'v1').slots.find(slot => slot.hour === '18:00').utilizationRate, 100, 'all-time heat slots should use active business days instead of diluting by historical gaps');

const importedSourceBandMetrics = buildOperationsMetrics({
  campuses: [
    {
      id: 'shunyi_mapo',
      code: 'shunyi_mapo',
      name: '顺义马坡',
      venues: [
        { id: 'v1', name: '1号场', status: 'active', sortOrder: 1 },
        { id: 'v2', name: '2号场', status: 'active', sortOrder: 2 }
      ]
    }
  ],
  courts: [
    {
      id: 'court-imported-band',
      campus: 'shunyi_mapo',
      bookingCount: 4,
      bookingAmount: 500,
      history: JSON.stringify([
        { id: 'imported-band-1', date: '2026-06-01', sourceTimeBand: '10点30-11点30', sourceVenue: '历史客户A', amount: 100, type: '消费', category: '订场' },
        { id: 'imported-band-2', date: '2026-06-01', sourceTimeBand: '18:00-19:00', sourceVenue: '2号场', amount: 120, type: '消费', category: '订场' },
        { id: 'imported-band-3', date: '2026-06-01', sourceTimeBand: '15-17点', sourceVenue: '历史客户B', amount: 80, type: '消费', category: '订场' }
      ])
    }
  ],
  schedule: [],
  leads: [],
  students: [],
  purchases: [],
  coaches: [],
  membershipAccounts: [],
  membershipOrders: [],
  financeNormalizedRows: [],
  financeOverviewData: {}
}, { now: new Date('2026-06-18 00:00:00') });
const importedBandCampus = importedSourceBandMetrics.court.campusHeatmaps.find(row => row.campusCode === 'shunyi_mapo');
assert.strictEqual(importedBandCampus.venues.find(row => row.venueName === '未匹配').isUnmatched, true, 'unmatched heatmap rows should be flagged as data-cleaning rows');
assert.strictEqual(importedSourceBandMetrics.court.campusRows.find(row => row.campusCode === 'shunyi_mapo').bookingCount, 4, 'campus booking count should keep the cached business total when it is higher than heat-eligible rows');
assert.strictEqual(importedSourceBandMetrics.court.campusRows.find(row => row.campusCode === 'shunyi_mapo').bookingAmount, 500, 'campus booking amount should keep the cached business total when it is higher than heat-eligible rows');
assert.strictEqual(importedBandCampus.venues.find(row => row.venueName === '未匹配').slots.find(slot => slot.hour === '10:30').utilizationRate, 100, 'imported rows without configured venue should heat the unmatched venue row');
assert.strictEqual(importedBandCampus.venues.find(row => row.venueId === 'v2').slots.find(slot => slot.hour === '18:00').utilizationRate, 100, 'sourceVenue should match configured venue names when available');
assert.strictEqual(importedBandCampus.venues.find(row => row.venueName === '未匹配').slots.find(slot => slot.hour === '15:00').utilizationRate, 100, 'imported sourceTimeBand rows like 15-17点 should heat the unmatched venue row');

const cachedSpendIsNotBookingMetrics = buildOperationsMetrics({
  campuses: [
    {
      id: 'shunyi_mapo',
      code: 'shunyi_mapo',
      name: '顺义马坡',
      venues: [{ id: 'v1', name: '1号场', status: 'active', sortOrder: 1 }]
    }
  ],
  courts: [
    {
      id: 'court-cached-spend',
      campus: 'shunyi_mapo',
      cachedTotalSpent: 404867,
      spentAmount: 404867,
      bookingCount: 2,
      history: []
    }
  ],
  schedule: [],
  leads: [],
  students: [],
  purchases: [],
  coaches: [],
  membershipAccounts: [],
  membershipOrders: [],
  financeNormalizedRows: [],
  financeOverviewData: {}
}, { now: new Date('2026-06-20 14:00:00') });
const cachedSpendCampus = cachedSpendIsNotBookingMetrics.court.campusRows.find(row => row.campusCode === 'shunyi_mapo');
assert.strictEqual(cachedSpendCampus.bookingAmount, 0, 'campus booking revenue should not fall back to cachedTotalSpent or spentAmount');
assert.strictEqual(cachedSpendIsNotBookingMetrics.court.cards.bookingAmount.value, 0, 'court booking revenue card should not use total spent as booking income');

const rangedCachedTotalsMetrics = buildOperationsMetrics({
  campuses: [
    {
      id: 'shunyi_mapo',
      code: 'shunyi_mapo',
      name: '顺义马坡',
      venues: [{ id: 'v1', name: '1号场', status: 'active', sortOrder: 1 }]
    }
  ],
  courts: [
    {
      id: 'court-cached-all-time',
      campus: 'shunyi_mapo',
      bookingCount: 2,
      bookingAmount: 500,
      bookingHours: 3,
      history: JSON.stringify([
        { id: 'old-booking', date: '2026-05-31', venue: '1号场', startTime: '10:00', endTime: '11:00', amount: 100, type: '消费', category: '订场' }
      ])
    }
  ],
  schedule: [],
  leads: [],
  students: [],
  purchases: [],
  coaches: [],
  membershipAccounts: [],
  membershipOrders: [],
  financeNormalizedRows: [],
  financeOverviewData: {}
}, { now: new Date('2026-06-20 14:00:00'), dateRange: { startDate: '2026-06-01', endDate: '2026-06-30' } });
const rangedCachedCampus = rangedCachedTotalsMetrics.court.campusRows.find(row => row.campusCode === 'shunyi_mapo');
assert.strictEqual(rangedCachedCampus.bookingCount, 0, 'selected date ranges should not reuse all-time cached booking counts');
assert.strictEqual(rangedCachedCampus.bookingAmount, 0, 'selected date ranges should not reuse all-time cached booking income');
assert.strictEqual(rangedCachedCampus.bookingHours, 0, 'selected date ranges should not reuse all-time cached booking hours');

const normalizedVenueNameMetrics = buildOperationsMetrics({
  campuses: [
    {
      id: 'shunyi_mapo',
      code: 'shunyi_mapo',
      name: '顺义马坡',
      venues: [{ id: 'v1', name: '1 号场', status: 'active', sortOrder: 1 }]
    }
  ],
  courts: [
    {
      id: 'court-normalized-venue',
      campus: 'shunyi_mapo',
      history: JSON.stringify([
        { id: 'space-name', date: '2026-06-01', venue: '1 号场', startTime: '08:00', endTime: '08:30', amount: 100, type: '消费', category: '订场' },
        { id: 'compact-name', date: '2026-06-01', venue: '1号场', startTime: '08:30', endTime: '09:00', amount: 100, type: '消费', category: '订场' },
        { id: 'short-name', date: '2026-06-01', venue: '1号', startTime: '09:00', endTime: '09:30', amount: 100, type: '消费', category: '订场' },
        { id: 'internal-use', date: '2026-06-01', venue: '1号', startTime: '09:30', endTime: '10:00', amount: 0, type: '消费', category: '内部占用' }
      ])
    }
  ],
  schedule: [
    { id: 'schedule-short-name', campus: 'shunyi_mapo', venue: '1号', startTime: '2026-06-01 10:00:00', endTime: '2026-06-01 10:30:00', status: '已排课' }
  ],
  leads: [],
  students: [],
  purchases: [],
  coaches: [],
  membershipAccounts: [],
  membershipOrders: [],
  financeNormalizedRows: [],
  financeOverviewData: {}
}, { now: new Date('2026-06-18 00:00:00') });
const normalizedVenueCampus = normalizedVenueNameMetrics.court.campusRows.find(row => row.campusCode === 'shunyi_mapo');
const normalizedVenueHeatmap = normalizedVenueNameMetrics.court.campusHeatmaps.find(row => row.campusCode === 'shunyi_mapo');
const normalizedVenue = normalizedVenueHeatmap.venues.find(row => row.venueId === 'v1');
assert.strictEqual(normalizedVenueCampus.bookingCount, 3, 'booking count should exclude internal occupancy and schedules');
assert.strictEqual(normalizedVenueCampus.usageCount, 5, 'usage count should include bookings, internal occupancy and schedules');
assert.strictEqual(normalizedVenueCampus.bookingAmount, 300, 'booking amount should exclude internal occupancy and schedules');
assert.ok(!normalizedVenueHeatmap.venues.find(row => row.venueName === '未匹配'), '1号场, 1 号场 and 1号 should all match the configured 1 号场');
assert.strictEqual(normalizedVenue.slots.find(slot => slot.hour === '08:00').bookedMinutes, 30, '1 号场 should heat configured venue slots');
assert.strictEqual(normalizedVenue.slots.find(slot => slot.hour === '08:30').bookedMinutes, 30, '1号场 should heat the same configured venue slots');
assert.strictEqual(normalizedVenue.slots.find(slot => slot.hour === '09:00').bookedMinutes, 30, '1号 should heat the same configured venue slots');
assert.strictEqual(normalizedVenue.slots.find(slot => slot.hour === '09:30').bookedMinutes, 30, 'internal occupancy should heat venue usage slots');
assert.strictEqual(normalizedVenue.slots.find(slot => slot.hour === '10:00').bookedMinutes, 30, 'schedule rows should heat venue usage slots');

const historicalCourseHeatMetrics = buildOperationsMetrics({
  campuses: [
    {
      id: 'shunyi_mapo',
      code: 'shunyi_mapo',
      name: '顺义马坡',
      venues: [
        { id: 'v1', name: '1号场', status: 'active', sortOrder: 1 },
        { id: 'v2', name: '2号场', status: 'active', sortOrder: 2 }
      ]
    }
  ],
  entitlements: [
    { id: 'ent-course-1', campusIds: ['shunyi_mapo'] }
  ],
  entitlementLedger: [
    {
      id: 'ledger-course-1',
      entitlementId: 'ent-course-1',
      scheduleId: '',
      action: 'consume',
      lessonDelta: -1,
      sourceDate: '2026-06-03',
      sourceTimeBand: '10:00-11:00',
      sourceLocation: '顺义马坡',
      sourceVenue: '1号场'
    },
    {
      id: 'ledger-course-2',
      entitlementId: 'ent-course-1',
      scheduleId: '',
      action: 'free_lesson',
      lessonDelta: 0,
      sourceDate: '2026-06-04',
      sourceTimeBand: '12:00-12:30',
      sourceLocation: '顺义马坡',
      sourceVenue: '2号场'
    }
  ],
  courts: [],
  schedule: [],
  leads: [],
  students: [],
  purchases: [],
  coaches: [],
  membershipAccounts: [],
  membershipOrders: [],
  financeNormalizedRows: [],
  financeOverviewData: {}
}, { now: new Date('2026-06-20 14:00:00'), dateRange: { startDate: '2026-06-01', endDate: '2026-06-30' } });
const historicalCourseHeatmap = historicalCourseHeatMetrics.court.campusHeatmaps.find(row => row.campusCode === 'shunyi_mapo');
assert.strictEqual(historicalCourseHeatMetrics.court.campusRows.find(row => row.campusCode === 'shunyi_mapo').usageCount, 0, 'historical course ledger rows must not count as court occupancy without a schedule record');
assert.strictEqual(historicalCourseHeatmap.venues.find(row => row.venueId === 'v1').slots.find(slot => slot.hour === '10:00').bookedMinutes, 0, 'historical course ledger rows must not heat the configured source venue');
assert.strictEqual(historicalCourseHeatmap.venues.find(row => row.venueId === 'v2').slots.find(slot => slot.hour === '12:00').bookedMinutes, 0, 'free historical lesson rows must not heat the configured source venue');
assert.ok(!historicalCourseHeatmap.venues.find(row => row.venueName === '未匹配'), 'ignored historical course rows should not create unmatched heat rows');

const campusConversionCourtMetrics = buildOperationsMetrics({
  campuses: [
    {
      id: 'shunyi_mapo',
      code: 'shunyi_mapo',
      name: '顺义马坡',
      venues: [{ id: 'v1', name: '1号场', status: 'active', sortOrder: 1 }]
    }
  ],
  leads: [
    { id: 'campus-lead-1', campus: 'shunyi_mapo', leadStage: '课程转化', studentId: 'campus-student-1', trialAtRaw: '2026-06-01', trialAttendedAt: '2026-06-01' },
    { id: 'campus-lead-2', campus: 'shunyi_mapo', leadStage: '已体验待转化', trialAtRaw: '2026-06-02', trialAttendedAt: '2026-06-02' },
    { id: 'campus-lead-3', campus: 'shunyi_mapo', leadStage: '课程转化', studentId: 'campus-student-2', trialAtRaw: '2026-06-03', trialAttendedAt: '2026-06-03' }
  ],
  students: [
    { id: 'campus-student-1', sourceLeadId: 'campus-lead-1', dealPath: '体验转化' },
    { id: 'campus-student-pending', sourceLeadId: 'campus-lead-2' },
    { id: 'campus-student-2', sourceLeadId: 'campus-lead-3', dealPath: '体验转化' }
  ],
  purchases: [
    { id: 'campus-purchase-1', studentId: 'campus-student-1', packageId: 'pkg-a', amount: 100, purchaseDate: '2026-06-04' },
    { id: 'campus-purchase-2', studentId: 'campus-student-1', packageId: 'pkg-a', amount: 100, purchaseDate: '2026-06-10' },
    { id: 'campus-purchase-3', studentId: 'campus-student-2', packageId: 'pkg-b', amount: 100, purchaseDate: '2026-06-05' }
  ],
  courts: [
    {
      id: 'campus-conversion-court',
      campus: 'shunyi_mapo',
      history: JSON.stringify([
        { id: 'campus-conversion-booking', date: '2026-06-01', venue: '1号场', startTime: '08:00', endTime: '09:00', amount: 100, type: '消费', category: '订场' }
      ])
    }
  ],
  schedule: [
    { id: 'campus-trial-1', studentId: 'campus-student-1', courseType: '体验课', startTime: '2026-06-01 09:00:00', endTime: '2026-06-01 10:00:00', status: '已完成', campus: 'shunyi_mapo' },
    { id: 'campus-trial-pending', studentId: 'campus-student-pending', courseType: '体验课', startTime: '2026-06-02 09:00:00', endTime: '2026-06-02 10:00:00', status: '已完成', campus: 'shunyi_mapo' },
    { id: 'campus-trial-2', studentId: 'campus-student-2', courseType: '体验课', startTime: '2026-06-03 09:00:00', endTime: '2026-06-03 10:00:00', status: '已完成', campus: 'shunyi_mapo' }
  ],
  coaches: [],
  membershipAccounts: [],
  membershipOrders: [],
  financeNormalizedRows: [],
  financeOverviewData: {}
}, { now: new Date('2026-06-18 00:00:00') });
const campusConversionRow = campusConversionCourtMetrics.court.campusRows.find(row => row.campusCode === 'shunyi_mapo');
assert.strictEqual(campusConversionRow.trialConversionRate, 66.7, 'court campus rows should include experience conversion rate by campus');
assert.strictEqual(campusConversionRow.repeatCustomerConversionRate, 50, 'court campus rows should include repeat customer conversion rate by campus');

const courtTrendMetrics = buildOperationsMetrics({
  campuses: [
    {
      id: 'shunyi_mapo',
      code: 'shunyi_mapo',
      name: '顺义马坡',
      venues: [{ id: 'v1', name: '1号场', status: 'active', sortOrder: 1 }]
    }
  ],
  courts: [
    {
      id: 'court-trend',
      campus: 'shunyi_mapo',
      history: JSON.stringify([
        { id: 'trend-1', date: '2026-06-01', venue: '1号场', venueId: 'v1', startTime: '18:00', endTime: '19:00', amount: 100, type: '消费', category: '散客订场' },
        { id: 'trend-2', date: '2026-06-03', venue: '1号场', venueId: 'v1', startTime: '08:00', endTime: '10:00', amount: 200, type: '消费', category: '会员订场' },
        { id: 'trend-3', date: '2026-06-06', venue: '1号场', venueId: 'v1', startTime: '09:00', endTime: '11:00', amount: 300, type: '消费', category: '散客订场' }
      ])
    }
  ],
  schedule: [],
  leads: [],
  students: [],
  purchases: [],
  coaches: [],
  membershipAccounts: [],
  membershipOrders: [],
  financeNormalizedRows: [],
  financeOverviewData: {}
}, { now: new Date('2026-06-08 12:00:00'), dateRange: { startDate: '2026-06-01', endDate: '2026-06-07' } });
assert.strictEqual(courtTrendMetrics.court.trends.length, 7, 'court KPI trends should cover every selected day');
assert.strictEqual(courtTrendMetrics.court.trends.find(row => row.date === '2026-06-03')?.bookingHours, 2, 'court KPI trends should expose the real day bucket, not cumulative booking hours');
assert.strictEqual(courtTrendMetrics.court.trends.find(row => row.date === '2026-06-06')?.bookingHours, 2, 'court KPI trends should expose each selected-day bucket value');
assert.ok(courtTrendMetrics.court.trends.find(row => row.date === '2026-06-04')?.bookingHours === 0, 'selected range trend should keep empty days as zero buckets');

const courtTrendNoEvidenceMetrics = buildOperationsMetrics({
  campuses: [
    {
      id: 'shunyi_mapo',
      code: 'shunyi_mapo',
      name: '顺义马坡',
      venues: [{ id: 'v1', name: '1号场', status: 'active', sortOrder: 1 }]
    }
  ],
  courts: [
    {
      id: 'court-no-evidence',
      campus: 'shunyi_mapo',
      history: JSON.stringify([
        { id: 'lesson-like-row', date: '2026-02-01', venue: '1号场', venueId: 'v1', startTime: '09:00', endTime: '09:45', amount: 0, type: '消费', category: '课程消课' }
      ])
    }
  ],
  schedule: [
    { id: 'schedule-no-venue', campus: 'shunyi_mapo', startTime: '2026-03-01 09:00:00', endTime: '2026-03-01 09:45:00', status: '已排课' }
  ],
  leads: [],
  students: [],
  purchases: [],
  coaches: [],
  membershipAccounts: [],
  membershipOrders: [],
  financeNormalizedRows: [],
  financeOverviewData: {}
}, { now: new Date('2026-03-05 12:00:00'), dateRange: { startDate: '2026-02-01', endDate: '2026-03-05' } });
assert.strictEqual(courtTrendNoEvidenceMetrics.court.cards.utilizationRate.value, 0, 'non-booking history rows and schedule rows without court venue evidence must not create court utilization');
assert.strictEqual(courtTrendNoEvidenceMetrics.court.cards.bookingHours.value, 0, 'non-booking history rows must not create booking hours');
assert.strictEqual(courtTrendNoEvidenceMetrics.court.campusRows.find(row => row.campusCode === 'shunyi_mapo')?.usageCount, 0, 'rows without explicit court usage evidence must not create usage count');

const allTimeCourtTrendMetrics = buildOperationsMetrics({
  campuses: [
    {
      id: 'shunyi_mapo',
      code: 'shunyi_mapo',
      name: '顺义马坡',
      venues: [{ id: 'v1', name: '1号场', status: 'active', sortOrder: 1 }]
    }
  ],
  courts: [
    {
      id: 'court-trend-all',
      campus: 'shunyi_mapo',
      history: JSON.stringify([
        { id: 'all-trend-1', date: '2026-06-01', venue: '1号场', venueId: 'v1', startTime: '18:00', endTime: '19:00', amount: 100, type: '消费', category: '散客订场' },
        { id: 'all-trend-2', date: '2026-06-04', venue: '1号场', venueId: 'v1', startTime: '10:00', endTime: '12:00', amount: 220, type: '消费', category: '散客订场' }
      ])
    }
  ],
  schedule: [],
  leads: [],
  students: [],
  purchases: [],
  coaches: [],
  membershipAccounts: [],
  membershipOrders: [],
  financeNormalizedRows: [],
  financeOverviewData: {}
}, { now: new Date('2026-06-08 12:00:00') });
assert.strictEqual(allTimeCourtTrendMetrics.court.trends.length, 30, 'all-time court KPI trends should return a visible continuous 30-day window');
assert.strictEqual(allTimeCourtTrendMetrics.court.trends.at(-1)?.date, '2026-06-04', 'all-time court KPI trends should end at the latest real business day');
assert.strictEqual(allTimeCourtTrendMetrics.court.trends.find(row => row.date === '2026-06-01')?.bookingAmount, 100, 'all-time court KPI trends should expose real bucket income');
assert.strictEqual(allTimeCourtTrendMetrics.court.trends.find(row => row.date === '2026-06-02')?.bookingAmount, 0, 'all-time court KPI trends should fill empty days with zero buckets');
assert.strictEqual(allTimeCourtTrendMetrics.court.trends.at(-1)?.bookingAmount, 220, 'all-time court KPI trends should expose real bucket income instead of cumulative income');
const futureSafeCourtTrendMetrics = buildOperationsMetrics({
  campuses: [
    {
      id: 'shunyi_mapo',
      code: 'shunyi_mapo',
      name: '顺义马坡',
      venues: [{ id: 'v1', name: '1号场', status: 'active', sortOrder: 1 }]
    }
  ],
  courts: [
    {
      id: 'court-future-trend',
      campus: 'shunyi_mapo',
      history: JSON.stringify([
        { id: 'future-safe-past', date: '2026-06-01', venue: '1号场', venueId: 'v1', startTime: '18:00', endTime: '19:00', amount: 100, type: '消费', category: '散客订场' },
        { id: 'future-safe-today', date: '2026-06-02', venue: '1号场', venueId: 'v1', startTime: '18:00', endTime: '19:00', amount: 200, type: '消费', category: '散客订场' },
        { id: 'future-safe-future', date: '2026-06-03', venue: '1号场', venueId: 'v1', startTime: '18:00', endTime: '19:00', amount: 999, type: '消费', category: '散客订场' }
      ])
    }
  ],
  schedule: [],
  leads: [],
  students: [],
  purchases: [],
  coaches: [],
  membershipAccounts: [],
  membershipOrders: [],
  financeNormalizedRows: [
    { id: 'future-safe-finance-past', businessDate: '2026-06-01', businessType: '散客订场', action: '收款', cashDelta: 100, recognizedRevenueDelta: 100, timeText: '18:00-19:00', sourceProject: '1号场' },
    { id: 'future-safe-finance-today', businessDate: '2026-06-02', businessType: '散客订场', action: '收款', cashDelta: 200, recognizedRevenueDelta: 200, timeText: '18:00-19:00', sourceProject: '1号场' },
    { id: 'future-safe-finance-future', businessDate: '2026-06-03', businessType: '散客订场', action: '收款', cashDelta: 999, recognizedRevenueDelta: 999, timeText: '18:00-19:00', sourceProject: '1号场' }
  ],
  financeOverviewData: {}
}, { now: new Date('2026-06-02 12:00:00'), dateRange: { startDate: '2026-06-01', endDate: '2026-06-03' } });
assert.deepStrictEqual(futureSafeCourtTrendMetrics.court.trends.map(row => row.date), ['2026-06-01', '2026-06-02'], 'court KPI trends should never include future selected dates');
assert.deepStrictEqual(futureSafeCourtTrendMetrics.overview.trends.map(row => row.date), ['2026-06-01', '2026-06-02'], 'overview KPI trends should use the same future-safe real point dates');
assert.strictEqual(futureSafeCourtTrendMetrics.overview.trends.find(row => row.date === '2026-06-02')?.bookingIncome, 200, 'overview trend points should expose the true daily booking income point');
const configuredCourtFinanceFallbackMetrics = buildOperationsMetrics({
  campuses: [
    {
      id: 'shunyi_mapo',
      code: 'shunyi_mapo',
      name: '顺义马坡',
      venues: [{ id: 'v1', name: '1号场', status: 'active', sortOrder: 1 }]
    }
  ],
  courts: [],
  schedule: [
    { id: 'configured-usage', campus: 'shunyi_mapo', venueId: 'v1', venue: '1号场', startTime: '2026-06-04 09:00:00', endTime: '2026-06-04 10:00:00', status: '已排课' }
  ],
  leads: [],
  students: [],
  purchases: [],
  coaches: [],
  membershipAccounts: [],
  membershipOrders: [],
  financeNormalizedRows: [
    { id: 'finance-booking-1', businessDate: '2026-06-01', businessType: '散客订场', action: '收款', cashDelta: 100, recognizedRevenueDelta: 100, timeText: '08:00-10:00', sourceProject: '1号场' },
    { id: 'finance-booking-2', businessDate: '2026-06-04', businessType: '会员订场', action: '已入账', cashDelta: 0, recognizedRevenueDelta: 220, timeText: '10:00-11:00', sourceProject: '1号场' }
  ],
  financeOverviewData: {}
}, { now: new Date('2026-06-08 12:00:00') });
assert.strictEqual(configuredCourtFinanceFallbackMetrics.court.cards.bookingAmount.value, 320, 'configured court dashboard should use finance booking income when court booking history is missing');
assert.strictEqual(configuredCourtFinanceFallbackMetrics.court.cards.bookingHours.value, 3, 'configured court dashboard should use finance booking hours when court booking history is missing');
assert.strictEqual(
  configuredCourtFinanceFallbackMetrics.court.campusRows.reduce((sum, row) => sum + (Number(row.bookingAmount) || 0), 0),
  configuredCourtFinanceFallbackMetrics.court.cards.bookingAmount.value,
  'court campus rows should share the same ranged booking income as the top court KPI card'
);
assert.strictEqual(configuredCourtFinanceFallbackMetrics.court.trends.at(-1)?.bookingAmount, 220, 'configured court trends should bucket finance booking income when court booking history is missing');

const noGenderMetrics = buildOperationsMetrics({
  campuses: [{ id: 'shunyi_mapo', code: 'shunyi_mapo', name: '顺义马坡' }],
  leads: [
    { id: 'lead-no-gender-1', leadStage: '未转化', source: '小红书', campus: 'shunyi_mapo', consultType: '成人私教课' },
    { id: 'lead-no-gender-2', leadStage: '未转化', source: '小红书', campus: 'shunyi_mapo', consultType: '青少年小班课' },
    { id: 'lead-no-gender-3', leadStage: '未转化', source: '小红书', campus: 'shunyi_mapo' }
  ],
  students: [],
  purchases: [],
  coaches: [],
  schedule: [],
  courts: [],
  membershipAccounts: [],
  membershipOrders: [],
  financeNormalizedRows: [],
  financeOverviewData: {}
}, { now: new Date('2026-06-18 00:00:00') });

assert.strictEqual(noGenderMetrics.conversion.studentAttributeRows, undefined, 'conversion page should not build people profile rows from operations metrics');
assert.ok(noGenderMetrics.conversion.profileRows.find(row => row.attribute === '成人'), 'conversion profile rows should classify adult demand');

const mergedLeadMetrics = buildOperationsMetrics({
  leads: [
    { id: 'lead-primary', _mergedLeadIds: ['lead-primary', 'lead-duplicate'], source: '小红书', campus: 'shunyi_mapo', formalCoach: '王教练', consultType: '成人私教课', trialAtRaw: '2026-06-01', trialAttendedAt: '2026-06-01' }
  ],
  students: [
    { id: 'student-merged', sourceLeadId: 'lead-duplicate', dealPath: '体验转化', primaryCoach: '王教练', type: '成人' }
  ],
  purchases: [
    { id: 'purchase-merged', studentId: 'student-merged', packageId: 'pkg-a', actualAmount: 1000 }
  ],
  coaches: [],
  schedule: [
    { id: 'schedule-merged-trial', studentId: 'student-merged', courseType: '体验课', startTime: '2026-06-01 09:00:00', endTime: '2026-06-01 10:00:00', status: '已完成', campus: 'shunyi_mapo' }
  ],
  courts: [],
  membershipAccounts: [],
  membershipOrders: [],
  financeNormalizedRows: [],
  financeOverviewData: {}
}, { now: new Date('2026-06-18 00:00:00') });

assert.strictEqual(mergedLeadMetrics.conversion.courseFunnel[0].count, 1, 'merged duplicate leads should count as one lead');
assert.strictEqual(mergedLeadMetrics.conversion.courseFunnel[2].count, 1, 'merged duplicate lead ids should still link to formal course conversion');
assert.strictEqual(mergedLeadMetrics.conversion.filterOptions, undefined, 'conversion page should not expose coach filters');

const unifiedRateMetrics = buildOperationsMetrics({
  leads: [
    { id: 'rate-lead-1', source: '视频号', consultType: '成人私教课', trialAtRaw: '2026-06-10', trialAttendedAt: '2026-06-10' },
    { id: 'rate-lead-2', source: '视频号', consultType: '成人私教课', trialAtRaw: '2026-06-11', trialAttendedAt: '2026-06-11' },
    { id: 'rate-lead-3', source: '视频号', consultType: '成人私教课', studentId: 'rate-student-3', trialAtRaw: '2026-06-12', trialAttendedAt: '2026-06-12' },
    { id: 'rate-lead-4', source: '视频号', consultType: '成人私教课', rawStatus: '已约体验' },
    { id: 'rate-lead-5', source: '视频号', consultType: '成人私教课' }
  ],
  students: [
    { id: 'rate-student-1', sourceLeadId: 'rate-lead-1', type: '成人', consultType: '成人私教课' },
    { id: 'rate-student-2', sourceLeadId: 'rate-lead-2', type: '成人', consultType: '成人私教课' },
    { id: 'rate-student-3', sourceLeadId: 'rate-lead-3', dealPath: '体验转化', type: '成人', consultType: '成人私教课' },
    { id: 'rate-student-4', sourceLeadId: 'rate-lead-4', type: '成人', consultType: '成人私教课' }
  ],
  purchases: [
    { id: 'rate-purchase-3', studentId: 'rate-student-3', packageId: 'pkg-rate', actualAmount: 1000 }
  ],
  coaches: [],
  schedule: [
    { id: 'rate-trial-1', studentId: 'rate-student-1', courseType: '体验课', startTime: '2026-06-10 09:00:00', endTime: '2026-06-10 10:00:00', status: '已完成' },
    { id: 'rate-trial-2', studentId: 'rate-student-2', courseType: '体验课', startTime: '2026-06-11 09:00:00', endTime: '2026-06-11 10:00:00', status: '已完成' },
    { id: 'rate-trial-3', studentId: 'rate-student-3', courseType: '体验课', startTime: '2026-06-12 09:00:00', endTime: '2026-06-12 10:00:00', status: '已完成' },
    { id: 'rate-trial-4', studentId: 'rate-student-4', courseType: '体验课', startTime: '2026-06-13 09:00:00', endTime: '2026-06-13 10:00:00', status: '待上课' }
  ],
  courts: [],
  membershipAccounts: [],
  membershipOrders: [],
  financeNormalizedRows: [],
  financeOverviewData: {}
}, { now: new Date('2026-06-18 00:00:00') });

const videoChannel = unifiedRateMetrics.conversion.channelEfficiencyRows.find(row => row.source === '视频号');
assert.strictEqual(videoChannel?.trialConversionRate, 60, 'channel trial conversion rate should use trial attendance over leads');
assert.strictEqual(videoChannel?.dealConversionRate, 20, 'channel deal conversion rate should use first paid deals over leads');
assert.strictEqual(unifiedRateMetrics.conversion.studentAttributeRows, undefined, 'conversion page should not output local people profile metrics');
const adultProfile = unifiedRateMetrics.conversion.profileRows.find(row => row.attribute === '成人');
assert.strictEqual(adultProfile?.trialConversionRate, 60, 'conversion profile trial conversion should use trial attendance over profile base');
assert.strictEqual(adultProfile?.dealConversionRate, 20, 'conversion profile deal conversion should use first paid deals over profile base');
assert.strictEqual(adultProfile?.renewalRate, 0, 'conversion profile retention rate should use renewals over first paid deals');
assert.strictEqual(unifiedRateMetrics.conversion.courseFunnel[1].count, 4, 'standard course funnel should count course-chain students');
assert.strictEqual(unifiedRateMetrics.conversion.courseFunnel[2].count, 1, 'standard course funnel should count formal students');
assert.strictEqual(unifiedRateMetrics.conversion.courseFunnel[2].percentOfTotal, 20, 'course funnel should expose formal students over total valid leads');
assert.strictEqual(unifiedRateMetrics.conversion.courseFunnel[2].transitionRate, 25, 'course funnel should expose formal students over course-chain students');
assert.strictEqual(unifiedRateMetrics.conversion.courseFunnel[2].lossRate, 75, 'course funnel should expose loss from course-chain students to formal students');

const lifecycleBackedMetrics = buildOperationsMetrics({
  campuses: [{ id: 'shunyi_mapo', code: 'shunyi_mapo', name: '顺义马坡' }],
  leads: [
    { id: 'lifecycle-lead', source: '旧来源', campus: 'old-campus', owner: '旧教练', leadDate: '2026-06-12' }
  ],
  students: [],
  purchases: [],
  coaches: [],
  schedule: [],
  courts: [],
  membershipAccounts: [],
  membershipOrders: [],
  customerLifecycleRows: [
    {
      sourceLeadId: 'lifecycle-lead',
      source: '转介绍',
      campus: '顺义马坡',
      owner: '统一教练',
      studentStage: 'formal',
      courtStage: 'member',
      membershipStatus: 'active',
      hasCourseConversion: true,
      hasBookingConversion: true,
      hasMembershipConversion: true
    }
  ],
  financeNormalizedRows: [],
  financeOverviewData: {}
}, { now: new Date('2026-06-18 00:00:00') });

assert.strictEqual(lifecycleBackedMetrics.conversion.stageRows.find(row => row.stage === '已成交')?.count, 1, 'conversion stage should reuse the unified converted stage from lifecycle data');
assert.strictEqual(lifecycleBackedMetrics.conversion.sourceRows.find(row => row.source === '转介绍')?.converted, 1, 'conversion source rows should use lifecycle standard source');
assert.strictEqual(lifecycleBackedMetrics.conversion.filterOptions, undefined, 'conversion page should not expose lifecycle owner as a local coach filter');

const coachDashboardMetrics = buildOperationsMetrics({
  campuses: [{ id: 'shunyi_mapo', code: 'shunyi_mapo', name: '顺义马坡' }],
  coaches: [
    { id: 'coach-a', name: 'A教练', status: 'active', campus: 'shunyi_mapo' },
    { id: 'coach-b', name: 'B教练', status: 'active', campus: 'shunyi_mapo' },
    { id: 'coach-c', name: 'C教练', status: 'inactive', campus: 'shunyi_mapo' }
  ],
  students: [
    { id: 'old-a', primaryCoach: 'A教练' },
    { id: 'trial-a', primaryCoach: 'A教练' },
    { id: 'trial-b', primaryCoach: 'B教练' }
  ],
  purchases: [
    { id: 'old-a-before', studentId: 'old-a', ownerCoach: 'A教练', actualAmount: 3000, purchaseDate: '2026-05-20', status: 'active', courseType: '私教课' },
    { id: 'old-a-renewal', studentId: 'old-a', ownerCoach: 'A教练', amountPaid: 5000, purchaseDate: '2026-06-03', status: 'active', courseType: '私教课' },
    { id: 'trial-a-deal', studentId: 'trial-a', ownerCoach: 'A教练', finalAmount: 1200, purchaseDate: '2026-06-04', status: 'active', courseType: '私教课' },
    { id: 'voided-a', studentId: 'trial-a', ownerCoach: 'A教练', actualAmount: 9000, purchaseDate: '2026-06-05', status: 'voided', courseType: '私教课' },
    { id: 'outside-a', studentId: 'trial-a', ownerCoach: 'A教练', actualAmount: 8000, purchaseDate: '2026-06-12', status: 'active', courseType: '私教课' },
    { id: 'trial-b-deal', studentId: 'trial-b', ownerCoach: 'B教练', actualAmount: 700, purchaseDate: '2026-06-06', status: 'active', courseType: '小班课' }
  ],
  schedule: [
    { id: 'a-private', coach: 'A教练', studentId: 'old-a', startTime: '2026-06-02 09:00:00', endTime: '2026-06-02 11:00:00', status: '已排课', campus: 'shunyi_mapo', courseType: '私教课' },
    { id: 'a-trial', coach: 'A教练', studentId: 'trial-a', startTime: '2026-06-03 09:00:00', endTime: '2026-06-03 10:00:00', status: '已结束', campus: 'shunyi_mapo', courseType: '体验课', experienceType: '私教体验课' },
    { id: 'a-small', coach: 'A教练', studentIds: ['old-a', 'trial-a'], startTime: '2026-06-04 09:00:00', endTime: '2026-06-04 10:30:00', status: '待上课', campus: 'shunyi_mapo', courseType: '小班课' },
    { id: 'a-cancel', coach: 'A教练', startTime: '2026-06-05 09:00:00', endTime: '2026-06-05 12:00:00', status: '已取消', campus: 'shunyi_mapo', courseType: '私教课' },
    { id: 'b-trial', coach: 'B教练', studentId: 'trial-b', startTime: '2026-06-03 11:00:00', endTime: '2026-06-03 12:00:00', status: '已结束', campus: 'shunyi_mapo', courseType: '体验课' },
    { id: 'a-previous', coach: 'A教练', studentId: 'old-a', startTime: '2026-05-29 09:00:00', endTime: '2026-05-29 10:00:00', status: '已结束', campus: 'shunyi_mapo', courseType: '私教课' }
  ],
  feedbacks: [
    { id: 'fb-a-private', scheduleId: 'a-private' },
    { id: 'fb-a-previous', scheduleId: 'a-previous' },
    { id: 'fb-cancel', scheduleId: 'a-cancel' }
  ],
  leads: [],
  courts: [],
  membershipAccounts: [],
  membershipOrders: [],
  financeNormalizedRows: [
    { id: 'finance-old-a-before', businessDate: '2026-05-20', businessType: '课程', action: '收款', cashDelta: 3000, ownerCoach: 'A教练', studentId: 'old-a' },
    { id: 'finance-old-a-renewal', businessDate: '2026-06-03', businessType: '课程', action: '收款', cashDelta: 5000, ownerCoach: 'A教练', studentId: 'old-a' },
    { id: 'finance-trial-a-deal', businessDate: '2026-06-04', businessType: '课程', action: '收款', cashDelta: 1200, ownerCoach: 'A教练', studentId: 'trial-a' },
    { id: 'finance-trial-b-future', businessDate: '2026-06-06', businessType: '课程', action: '收款', cashDelta: 700, ownerCoach: 'B教练', studentId: 'trial-b' }
  ],
  financeOverviewData: {}
}, {
  now: new Date('2026-06-04 12:00:00'),
  dateRange: { startDate: '2026-06-01', endDate: '2026-06-07' }
});

const coachA = coachDashboardMetrics.coach.rows.find(row => row.coach === 'A教练');
const coachB = coachDashboardMetrics.coach.rows.find(row => row.coach === 'B教练');
assert.strictEqual(coachDashboardMetrics.coach.rows.some(row => row.coach === 'C教练'), false, 'coach dashboard should exclude inactive coaches');
assert.strictEqual(coachA.availableHours, 27.4, 'coach available hours should use the real selected period up to today');
assert.strictEqual(coachA.usedHours, 4.5, 'coach utilization should include scheduled and completed non-cancelled lessons in the selected period');
assert.strictEqual(coachA.feedbackCompleted, 1, 'coach detail rows should count completed feedback by schedule record');
assert.strictEqual(coachA.feedbackRequired, 3, 'coach detail rows should count one required feedback per valid schedule record');
assert.deepStrictEqual(
  coachA.usedHoursComparison,
  { mode: 'previous_period', currentValue: 4.5, previousValue: 1, changeValue: 3.5, changeRate: 350 },
  'coach detail rows should expose previous-period lesson-hour comparison for the table'
);
assert.strictEqual(coachA.utilizationRate, 16.4, 'coach utilization should divide used hours by the real selected-period available hours');
assert.strictEqual(coachA.revenue, 6200, 'coach revenue should use standard finance course receipts inside the selected period');
assert.strictEqual(coachA.trialConversionRate, 100, 'coach trial conversion should read the unified lifecycle rows');
assert.strictEqual(coachA.renewalRate, 100, 'coach renewal should use old students with prior ownerCoach purchases as denominator');
assert.strictEqual(coachDashboardMetrics.coach.metricSource, 'standard-course-lifecycle', 'coach dashboard should expose the unified standard metric source');
assert.strictEqual(coachDashboardMetrics.conversion.metricSource, 'standard-course-lifecycle', 'conversion dashboard should expose the same unified standard metric source');
assert.strictEqual(coachDashboardMetrics.conversion.standardRates.trialConversionRate, coachDashboardMetrics.conversion.standardLifecycleMetrics.metrics.trialPathDeals.rate, 'conversion top trial-path deal rate should share the standard lifecycle metric');
assert.strictEqual(coachDashboardMetrics.conversion.standardRates.renewalRate, 0, 'conversion renewal should use selected-period repurchases instead of coach old-customer renewal');
assert.strictEqual(coachDashboardMetrics.conversion.standardRates.renewalNumerator, 0, 'conversion renewal should expose selected-period repurchase numerator');
assert.strictEqual(coachDashboardMetrics.conversion.standardRates.renewalDenominator, 2, 'conversion renewal should expose selected-period paid-student denominator');
assert.strictEqual(coachA.courseMix.find(row => row.type === '体验课')?.hours, 1, 'coach course mix should include trial lesson hours');
assert.strictEqual(coachA.courseMix.find(row => row.type === '私教课')?.hours, 2, 'coach course mix should include private lesson hours');
assert.strictEqual(coachA.courseMix.find(row => row.type === '小班课')?.hours, 1.5, 'coach course mix should include group lesson hours');
assert.strictEqual(coachB.revenue, 0, 'coach revenue should exclude receipts after today');
assert.strictEqual(coachDashboardMetrics.coach.cards.revenue.value, 6200, 'coach top cards should sum standard finance course receipts up to today only');
assert.ok(Array.isArray(coachDashboardMetrics.coach.trends), 'coach dashboard should expose selected-period KPI trends');
assert.strictEqual(coachDashboardMetrics.coach.trends.length, 4, 'coach KPI trends should cover each real selected day up to today');
assert.strictEqual(coachDashboardMetrics.coach.trends.find(row => row.date === '2026-06-03')?.utilizationRate, 14.5, 'coach utilization trend should use the real day bucket utilization');
assert.strictEqual(coachDashboardMetrics.coach.trends.find(row => row.date === '2026-06-04')?.revenue, 1200, 'coach revenue trend should use the real day bucket finance course receipts');
assert.strictEqual(coachDashboardMetrics.coach.trends.find(row => row.date === '2026-06-01')?.activeCoaches, 0, 'coach active trend should count coaches with real daily work or receipts, not all roster coaches');
const externalCampusCoachMetrics = buildOperationsMetrics({
  campuses: [],
  coaches: [{ id: 'external-coach', name: '外场教练', status: 'active' }],
  packages: [],
  purchases: [],
  schedule: [
    { id: 'external-lesson', coach: '外场教练', startTime: '2026-06-02 09:00:00', endTime: '2026-06-02 10:00:00', status: '已结束', campus: '__external__', courseType: '私教课' }
  ],
  feedbacks: [],
  leads: [],
  courts: [],
  membershipAccounts: [],
  membershipOrders: [],
  financeNormalizedRows: [],
  financeOverviewData: {}
}, {
  now: new Date('2026-06-04 12:00:00'),
  dateRange: { startDate: '2026-06-01', endDate: '2026-06-07' }
});
const externalCoach = externalCampusCoachMetrics.coach.rows.find(row => row.coach === '外场教练');
assert.match(externalCoach.campusDistributionText, /校区外 1/, 'coach detail campus distribution should display external campus as 校区外');
assert.doesNotMatch(externalCoach.campusDistributionText, /__external__/, 'coach detail campus distribution should not leak raw external campus code');
const feedbackFlagCoachMetrics = buildOperationsMetrics({
  campuses: [],
  coaches: [{ id: 'coach-chaojun', name: '朝珺教练', status: 'active', sortOrder: 10 }],
  packages: [],
  purchases: [],
  schedule: [
    { id: 'chaojun-feedback-lesson', coach: '朝珺教练', startTime: '2026-06-02 09:00:00', endTime: '2026-06-02 10:00:00', status: '已结束', feedbackStatus: '已反馈', courseType: '私教课' }
  ],
  feedbacks: [],
  leads: [],
  courts: [],
  membershipAccounts: [],
  membershipOrders: [],
  financeNormalizedRows: [],
  financeOverviewData: {}
}, {
  now: new Date('2026-06-04 12:00:00'),
  dateRange: { startDate: '2026-06-01', endDate: '2026-06-07' }
});
const feedbackFlagCoach = feedbackFlagCoachMetrics.coach.rows.find(row => row.coach === '朝珺教练');
assert.strictEqual(feedbackFlagCoach.feedbackCompleted, 1, 'coach detail feedback should count schedule-level feedback flags from coach calendar records');
assert.strictEqual(feedbackFlagCoach.feedbackRequired, 1, 'coach detail feedback denominator should keep the selected valid lesson count');
const coachSortOrderMetrics = buildOperationsMetrics({
  campuses: [],
  coaches: [
    { id: 'coach-a', name: 'A教练', status: 'active', sortOrder: 30 },
    { id: 'coach-b', name: 'B教练', status: 'active', sortOrder: 10 }
  ],
  packages: [],
  purchases: [],
  schedule: [
    { id: 'sort-a', coach: 'A教练', startTime: '2026-06-02 09:00:00', endTime: '2026-06-02 10:00:00', status: '已结束', courseType: '私教课' },
    { id: 'sort-b', coach: 'B教练', startTime: '2026-06-02 09:00:00', endTime: '2026-06-02 10:00:00', status: '已结束', courseType: '私教课' }
  ],
  feedbacks: [],
  leads: [],
  courts: [],
  membershipAccounts: [],
  membershipOrders: [],
  financeNormalizedRows: [],
  financeOverviewData: {}
}, {
  now: new Date('2026-06-04 12:00:00'),
  dateRange: { startDate: '2026-06-01', endDate: '2026-06-07' }
});
assert.deepStrictEqual(coachSortOrderMetrics.coach.rows.slice(0, 2).map(row => row.coach), ['B教练', 'A教练'], 'coach detail rows should follow the coach calendar custom sort order');
const allTimeCoachTrendMetrics = buildOperationsMetrics({
  campuses: [],
  coaches: [{ id: 'A', name: 'A教练', status: 'active' }],
  packages: [],
  purchases: [{ id: 'course-one', ownerCoach: 'A教练', studentId: 'old-a', amount: 1200, purchaseDate: '2026-06-04', type: '课程购买' }],
  schedule: [{ id: 'one-lesson', coach: 'A教练', studentId: 'old-a', startTime: '2026-06-04 09:00:00', endTime: '2026-06-04 10:00:00', status: '已排课', courseType: '私教课' }],
  leads: [],
  courts: [],
  membershipAccounts: [],
  membershipOrders: [],
  financeNormalizedRows: [],
  financeOverviewData: {}
}, {
  now: new Date('2026-06-04 12:00:00')
});
assert.strictEqual(allTimeCoachTrendMetrics.coach.trends.length, 30, 'all-time coach KPI trends should return a visible continuous 30-day window');
assert.strictEqual(allTimeCoachTrendMetrics.coach.trends.find(row => row.date === '2026-06-03')?.revenue, 0, 'all-time coach KPI trends should fill empty days with zero buckets');
assert.strictEqual(allTimeCoachTrendMetrics.coach.trends.at(-1)?.date, '2026-06-04', 'all-time coach KPI trends should end at the latest coach activity date');
const futureSafeCoachTrendMetrics = buildOperationsMetrics({
  campuses: [],
  coaches: [
    { id: 'A', name: 'A教练', status: 'active' },
    { id: 'B', name: 'B教练', status: 'active' }
  ],
  purchases: [
    { id: 'coach-real-today', ownerCoach: 'A教练', studentId: 'stu-a', amount: 500, purchaseDate: '2026-06-02', status: 'active' },
    { id: 'coach-future-receipt', ownerCoach: 'B教练', studentId: 'stu-b', amount: 9999, purchaseDate: '2026-06-03', status: 'active' }
  ],
  schedule: [
    { id: 'coach-real-today-lesson', coach: 'A教练', studentId: 'stu-a', startTime: '2026-06-02 09:00:00', endTime: '2026-06-02 10:00:00', status: '已结束', courseType: '私教课' },
    { id: 'coach-future-lesson', coach: 'B教练', studentId: 'stu-b', startTime: '2026-06-03 09:00:00', endTime: '2026-06-03 10:00:00', status: '已排课', courseType: '私教课' }
  ],
  leads: [],
  courts: [],
  membershipAccounts: [],
  membershipOrders: [],
  financeNormalizedRows: [
    { id: 'coach-real-today-finance', ownerCoach: 'A教练', studentId: 'stu-a', businessType: '课程', action: '收款', cashDelta: 500, businessDate: '2026-06-02' },
    { id: 'coach-future-receipt-finance', ownerCoach: 'B教练', studentId: 'stu-b', businessType: '课程', action: '收款', cashDelta: 9999, businessDate: '2026-06-03' }
  ],
  financeOverviewData: {}
}, {
  now: new Date('2026-06-02 12:00:00'),
  dateRange: { startDate: '2026-06-01', endDate: '2026-06-03' }
});
assert.deepStrictEqual(futureSafeCoachTrendMetrics.coach.trends.map(row => row.date), ['2026-06-01', '2026-06-02'], 'coach KPI trends should never include future selected dates');
assert.strictEqual(futureSafeCoachTrendMetrics.coach.trends.find(row => row.date === '2026-06-02')?.activeCoaches, 1, 'coach active trend should count only coaches with real work or receipts on that day');
assert.strictEqual(futureSafeCoachTrendMetrics.coach.cards.revenue.value, 500, 'coach cards should exclude future receipts from the current real period');
assert.ok(coachDashboardMetrics.coach.utilizationBands.find(row => row.band === '0%-20%')?.count >= 2, 'coach dashboard should expose five utilization bands for charting');

const unifiedTrendMetrics = buildOperationsMetrics({
  campuses: [
    {
      id: 'shunyi_mapo',
      code: 'shunyi_mapo',
      name: '顺义马坡',
      venues: [{ id: 'v1', name: '1号场', status: 'active', sortOrder: 1 }]
    }
  ],
  leads: [
    { id: 'prev-lead', leadStage: '未转化', source: '小红书', leadDate: '2026-06-02', campus: 'shunyi_mapo' },
    { id: 'current-lead-1', leadStage: '已约体验', source: '小红书', leadDate: '2026-06-09', campus: 'shunyi_mapo' },
    { id: 'current-lead-2', leadStage: '课程转化', studentId: 'current-student-2', source: '小红书', leadDate: '2026-06-10', campus: 'shunyi_mapo' }
  ],
  students: [
    { id: 'current-student-2', sourceLeadId: 'current-lead-2', dealPath: '体验转化', primaryCoach: 'A教练' }
  ],
  purchases: [
    { id: 'prev-purchase', studentId: 'prev-student', ownerCoach: 'A教练', amount: 100, purchaseDate: '2026-06-03', status: 'active' },
    { id: 'current-purchase', studentId: 'current-student-2', ownerCoach: 'A教练', amount: 500, purchaseDate: '2026-06-10', status: 'active' }
  ],
  coaches: [{ id: 'A', name: 'A教练', status: 'active' }],
  schedule: [],
  courts: [
    {
      id: 'unified-court',
      campus: 'shunyi_mapo',
      history: JSON.stringify([
        { id: 'prev-court', date: '2026-06-04', venue: '1号场', venueId: 'v1', startTime: '18:00', endTime: '19:00', amount: 80, type: '消费', category: '散客订场' },
        { id: 'current-court', date: '2026-06-11', venue: '1号场', venueId: 'v1', startTime: '18:00', endTime: '19:00', amount: 180, type: '消费', category: '散客订场' }
      ])
    }
  ],
  membershipAccounts: [],
  membershipOrders: [],
  financeNormalizedRows: [
    { id: 'prev-finance-course', businessDate: '2026-06-03', businessType: '课程', action: '收款', cashDelta: 100, recognizedRevenueDelta: 0, deferredRevenueDelta: 100 },
    { id: 'prev-finance-court', businessDate: '2026-06-04', businessType: '散客订场', action: '收款', cashDelta: 80, recognizedRevenueDelta: 80, deferredRevenueDelta: 0, timeText: '18:00-19:00', sourceProject: '1号场' },
    { id: 'current-finance-course', businessDate: '2026-06-10', businessType: '课程', action: '收款', cashDelta: 500, recognizedRevenueDelta: 0, deferredRevenueDelta: 500 },
    { id: 'current-finance-court', businessDate: '2026-06-11', businessType: '散客订场', action: '收款', cashDelta: 180, recognizedRevenueDelta: 180, deferredRevenueDelta: 0, timeText: '18:00-19:00', sourceProject: '1号场' }
  ],
  financeOverviewData: {}
}, {
  now: new Date('2026-06-14 12:00:00'),
  dateRange: { startDate: '2026-06-08', endDate: '2026-06-14' }
});
assert.ok(Array.isArray(unifiedTrendMetrics.conversion.trends), 'conversion dashboard should receive backend-generated trend points');
assert.strictEqual(unifiedTrendMetrics.conversion.trends.find(row => row.date === '2026-06-09')?.leads, 1, 'conversion trends should use true bucket values instead of frontend cumulative points');
assert.strictEqual(unifiedTrendMetrics.overview.trendMeta?.period, 'day', 'short selected date ranges should expose daily trend period');
assert.strictEqual(unifiedTrendMetrics.overview.trendComparisons?.totalIncome?.mode, 'previous_period', 'selected periods should compare with the previous same-length period');
assert.strictEqual(unifiedTrendMetrics.overview.trendComparisons?.totalIncome?.changeValue, 500, 'overview comparison should compare current total income with the previous period');
assert.strictEqual(unifiedTrendMetrics.conversion.trendComparisons?.leads?.changeValue, 1, 'conversion comparison should be generated by the backend');

const allTimeComparisonMetrics = buildOperationsMetrics({
  leads: [{ id: 'all-lead', leadDate: '2026-06-01' }],
  purchases: [{ id: 'all-purchase', amount: 100, purchaseDate: '2026-06-01' }],
  courts: [],
  coaches: [],
  schedule: [],
  membershipAccounts: [],
  membershipOrders: [],
  financeNormalizedRows: [],
  financeOverviewData: {}
}, { now: new Date('2026-06-14 12:00:00') });
assert.strictEqual(allTimeComparisonMetrics.overview.trendComparisons?.totalIncome?.mode, 'none', 'all-time dashboards should not show trend comparison values');

const longRangeTrendMetrics = buildOperationsMetrics({
  leads: Array.from({ length: 45 }, (_, index) => ({ id: `long-lead-${index}`, leadDate: `2026-05-${String(index % 31 + 1).padStart(2, '0')}` })),
  purchases: [],
  courts: [],
  coaches: [],
  schedule: [],
  membershipAccounts: [],
  membershipOrders: [],
  financeNormalizedRows: [],
  financeOverviewData: {}
}, {
  now: new Date('2026-06-20 12:00:00'),
  dateRange: { startDate: '2026-05-01', endDate: '2026-06-14' }
});
assert.strictEqual(longRangeTrendMetrics.conversion.trendMeta?.period, 'week', 'long selected date ranges should be bucketed by week to avoid dense points');
assert.ok(longRangeTrendMetrics.conversion.trends.length <= 8, 'long selected date ranges should not return dense daily conversion trend points');

const periodRepurchaseMetrics = buildOperationsMetrics({
  leads: [],
  students: [],
  purchases: [
    ...Array.from({ length: 10 }, (_, index) => ({
      id: `period-first-${index + 1}`,
      studentId: `period-student-${index + 1}`,
      actualAmount: 1000,
      purchaseDate: '2026-06-01',
      status: 'active',
      courseType: '私教课'
    })),
    { id: 'period-new-11', studentId: 'period-student-11', actualAmount: 1000, purchaseDate: '2026-06-10', status: 'active', courseType: '私教课' },
    { id: 'period-repeat-1', studentId: 'period-student-1', actualAmount: 1200, purchaseDate: '2026-06-10', status: 'active', courseType: '私教课' },
    { id: 'period-repeat-2', studentId: 'period-student-2', actualAmount: 1200, purchaseDate: '2026-06-10', status: 'active', courseType: '私教课' }
  ],
  courts: [],
  coaches: [],
  schedule: [],
  membershipAccounts: [],
  membershipOrders: [],
  financeNormalizedRows: [],
  financeOverviewData: {}
}, {
  now: new Date('2026-06-18 12:00:00'),
  dateRange: { startDate: '2026-06-01', endDate: '2026-06-30' }
});
const june10RepurchasePoint = periodRepurchaseMetrics.conversion.trends.find(row => row.date === '2026-06-10');
assert.strictEqual(periodRepurchaseMetrics.conversion.standardRates.renewalRate, 18.2, 'conversion top renewal rate should use selected-period repurchases');
assert.strictEqual(periodRepurchaseMetrics.conversion.standardRates.renewalNumerator, 2, 'conversion renewal numerator should be repurchased students in the selected period');
assert.strictEqual(periodRepurchaseMetrics.conversion.standardRates.renewalDenominator, 11, 'conversion renewal denominator should be unique paid students in the selected period');
assert.strictEqual(june10RepurchasePoint?.renewalRate, 18.2, 'conversion renewal trend should use cumulative selected-period repurchase rate, never same-day renewals over same-day deals');
assert.strictEqual(june10RepurchasePoint?.renewalRateNumerator, 2, 'conversion renewal trend should expose hover numerator');
assert.strictEqual(june10RepurchasePoint?.renewalRateDenominator, 11, 'conversion renewal trend should expose hover denominator');

const evidenceOnlyConversionTrendMetrics = buildOperationsMetrics({
  leads: [
    { id: 'evidence-lead-1', leadDate: '2026-06-01', leadStage: '课程转化', studentId: 'evidence-student-1', source: '小红书' },
    { id: 'evidence-lead-2', leadDate: '2026-06-01', trialAtRaw: '2026-06-02', trialAttendedAt: '2026-06-02', source: '小红书' }
  ],
  students: [
    { id: 'evidence-student-1', sourceLeadId: 'evidence-lead-1', dealPath: '体验转化' }
  ],
  purchases: [
    { id: 'evidence-purchase-1', studentId: 'evidence-student-1', actualAmount: 1000, purchaseDate: '2026-06-03', status: 'active' }
  ],
  courts: [],
  coaches: [],
  schedule: [],
  membershipAccounts: [],
  membershipOrders: [],
  financeNormalizedRows: [],
  financeOverviewData: {}
}, {
  now: new Date('2026-06-04 12:00:00'),
  dateRange: { startDate: '2026-06-01', endDate: '2026-06-04' }
});
const june1ConversionPoint = evidenceOnlyConversionTrendMetrics.conversion.trends.find(row => row.date === '2026-06-01');
const june2ConversionPoint = evidenceOnlyConversionTrendMetrics.conversion.trends.find(row => row.date === '2026-06-02');
const june3ConversionPoint = evidenceOnlyConversionTrendMetrics.conversion.trends.find(row => row.date === '2026-06-03');
assert.strictEqual(june1ConversionPoint?.dealRateNumerator, 0, 'conversion trends must not backfill a later purchase into the lead creation day');
assert.strictEqual(june1ConversionPoint?.attendanceRateNumerator, 0, 'conversion trends must not backfill a later trial date into the lead creation day');
assert.strictEqual(june2ConversionPoint?.attendanceRateNumerator, 1, 'conversion trends should count attendance on the actual evidence date');
assert.strictEqual(june3ConversionPoint?.dealRateNumerator, 0, 'closed conversion trends must not count a deal without prior attendance evidence');

const asOfCoachTrendMetrics = buildOperationsMetrics({
  campuses: [],
  coaches: [{ id: 'A', name: 'A教练', status: 'active' }],
  students: [{ id: 'trial-asof', primaryCoach: 'A教练' }],
  schedule: [
    { id: 'coach-trial-asof', coach: 'A教练', studentId: 'trial-asof', startTime: '2026-06-01 09:00:00', endTime: '2026-06-01 10:00:00', status: '已结束', courseType: '体验课' }
  ],
  purchases: [
    { id: 'coach-deal-after-trial', ownerCoach: 'A教练', studentId: 'trial-asof', actualAmount: 1000, purchaseDate: '2026-06-03', status: 'active' }
  ],
  leads: [],
  courts: [],
  membershipAccounts: [],
  membershipOrders: [],
  financeNormalizedRows: [
    { id: 'coach-deal-after-trial-finance', ownerCoach: 'A教练', studentId: 'trial-asof', businessType: '课程', action: '收款', cashDelta: 1000, businessDate: '2026-06-03' }
  ],
  financeOverviewData: {}
}, {
  now: new Date('2026-06-04 12:00:00'),
  dateRange: { startDate: '2026-06-01', endDate: '2026-06-04' }
});
assert.strictEqual(asOfCoachTrendMetrics.coach.trends.find(row => row.date === '2026-06-01')?.trialConversionRate, 0, 'coach trial conversion trend must not count purchases after the trend day');
assert.strictEqual(asOfCoachTrendMetrics.coach.trends.find(row => row.date === '2026-06-03')?.trialConversionRate, null, 'coach trial conversion trend should not invent a same-day trial denominator when there was no trial that day');
assert.strictEqual(asOfCoachTrendMetrics.coach.cards.trialConversionRate.value, 100, 'coach cards should still show selected-period conversion after the purchase has happened');

assert.deepStrictEqual(
  coachDashboardMetrics.coach.utilizationBands.map(row => `${row.band} ${row.label} ${row.color}`),
  ['0%-20% 闲置 #E05252', '20%-40% 偏低 #D89135', '40%-60% 观察 #8EA0B8', '60%-80% 健康 #7CBF8A', '80%-100% 高效 #2E8B6D'],
  'coach utilization bands should use concise labels and the unified dashboard palette'
);
assert.ok(coachDashboardMetrics.coach.revenueParetoRows.find(row => row.coach === 'A教练')?.cumulativeShare > 80, 'coach dashboard should expose pareto contribution rows');
assert.strictEqual(coachDashboardMetrics.coach.courseMixRows.find(row => row.coach === 'A教练')?.privateHours, 2, 'coach dashboard should expose chart-ready course mix rows');
assert.ok(coachDashboardMetrics.coach.alerts.find(row => row.type === '低利用'), 'coach dashboard should expose diagnostic alert cards');

const coachFallbackMetrics = buildOperationsMetrics({
  campuses: [],
  coaches: [{ id: 'siren', name: 'Siren', status: 'active' }],
  purchases: [
    { id: 'fallback-paid', studentId: 'stu-1', coachPriceName: 'siren', paidAmount: 1000, purchaseDate: '2026-06-01', status: 'active' },
    { id: 'fallback-snapshot', studentId: 'stu-2', coachPriceSnapshot: { coachName: 'Siren', amountPaid: 800 }, purchaseDate: '2026-06-02', status: 'active' },
    { id: 'unassigned', studentId: 'stu-3', ownerCoach: '没有固定教练', amountPaid: 9999, purchaseDate: '2026-06-03', status: 'active' }
  ],
  schedule: [
    { id: 'siren-hour', coach: 'Siren', startTime: '2026-06-01 10:00:00', endTime: '2026-06-01 11:00:00', status: '已排课' },
    { id: 'siren-lower-hour', coach: 'siren', startTime: '2026-06-02 10:00:00', endTime: '2026-06-02 11:00:00', status: '已排课' }
  ],
  leads: [],
  students: [],
  courts: [],
  membershipAccounts: [],
  membershipOrders: [],
  financeNormalizedRows: [],
  financeOverviewData: {}
}, { now: new Date('2026-06-04 12:00:00'), dateRange: { startDate: '2026-06-01', endDate: '2026-06-07' } });
const sirenRow = coachFallbackMetrics.coach.rows.find(row => row.coach === 'Siren 教练');
assert.strictEqual(coachFallbackMetrics.coach.rows.some(row => row.coach === '没有固定教练'), false, 'coach dashboard should exclude unassigned ownership from person efficiency');
assert.strictEqual(sirenRow?.revenue, 0, 'coach dashboard should not fall back to purchase receipt fields when standard finance rows are missing');
assert.strictEqual(sirenRow?.usedHours, 2, 'coach dashboard should merge schedule aliases into the same coach row');

const rangedSnapshotGuardMetrics = buildOperationsMetrics({
  campuses: [
    {
      id: 'shunyi_mapo',
      code: 'shunyi_mapo',
      name: '顺义马坡',
      venues: [{ id: 'v1', name: '1号场', status: 'active', sortOrder: 1 }]
    }
  ],
  leads: [],
  students: [],
  purchases: [
    { id: 'selected-course', studentId: 'selected-student', actualAmount: 1000, purchaseDate: '2026-06-22', status: 'active' },
    { id: 'future-course', studentId: 'future-student', actualAmount: 9999, purchaseDate: '2026-06-23', status: 'active' },
    { id: 'previous-course', studentId: 'previous-student', actualAmount: 800, purchaseDate: '2026-06-21', status: 'active' }
  ],
  membershipOrders: [
    { id: 'selected-member', rechargeAmount: 500, purchaseDate: '2026-06-22', status: 'active' },
    { id: 'future-member', rechargeAmount: 9999, purchaseDate: '2026-06-23', status: 'active' }
  ],
  courts: [],
  coaches: [],
  schedule: [],
  membershipAccounts: [],
  financeNormalizedRows: [
    { id: 'selected-course-finance', businessDate: '2026-06-22', businessType: '课程', action: '收款', cashDelta: 1000, recognizedRevenueDelta: 0, deferredRevenueDelta: 1000 },
    { id: 'selected-member-finance', businessDate: '2026-06-22', businessType: '会员储值', action: '收款', cashDelta: 500, recognizedRevenueDelta: 0, deferredRevenueDelta: 500 },
    { id: 'selected-booking', businessDate: '2026-06-22', businessType: '散客订场', action: '收款', cashDelta: 200, recognizedRevenueDelta: 200, timeText: '08:00-09:00', sourceProject: '1号场' },
    { id: 'future-course-finance', businessDate: '2026-06-23', businessType: '课程', action: '收款', cashDelta: 9999, recognizedRevenueDelta: 0, deferredRevenueDelta: 9999 },
    { id: 'future-member-finance', businessDate: '2026-06-23', businessType: '会员储值', action: '收款', cashDelta: 9999, recognizedRevenueDelta: 0, deferredRevenueDelta: 9999 },
    { id: 'future-booking', businessDate: '2026-06-23', businessType: '散客订场', action: '收款', cashDelta: 9999, recognizedRevenueDelta: 9999, timeText: '09:00-10:00', sourceProject: '1号场' },
    { id: 'previous-booking', businessDate: '2026-06-21', businessType: '散客订场', action: '收款', cashDelta: 100, recognizedRevenueDelta: 100, timeText: '10:00-11:00', sourceProject: '1号场' }
  ],
  financeOverviewData: {
    totalIncome: 909700,
    recognizedRevenue: 295500,
    pendingRevenue: 614200,
    tradeCount: 1113,
    courseIncome: 505900,
    bookingIncome: 266700,
    storedValueIncome: 137100
  }
}, {
  now: new Date('2026-06-22 12:00:00'),
  dateRange: { startDate: '2026-06-22', endDate: '2026-06-28' }
});
assert.strictEqual(rangedSnapshotGuardMetrics.overview.cards.totalIncome.value, 1700, 'selected operations overview total income must use ranged rows instead of the all-time finance snapshot');
assert.strictEqual(rangedSnapshotGuardMetrics.overview.cards.recognizedRevenue.value, 200, 'selected operations overview recognized revenue must use ranged booking rows');
assert.strictEqual(rangedSnapshotGuardMetrics.overview.cards.pendingRevenue.value, 1500, 'selected operations overview pending revenue must use ranged course and member rows');
assert.strictEqual(rangedSnapshotGuardMetrics.overview.cards.tradeCount.value, 3, 'selected operations overview trade count must use ranged course, member and booking rows');
assert.deepStrictEqual(
  rangedSnapshotGuardMetrics.overview.revenueMix,
  [
    { name: '课程收入', value: 1000 },
    { name: '订场收入', value: 200 },
    { name: '会员储值', value: 500 }
  ],
  'selected operations revenue mix must share the same ranged source as the overview cards'
);
assert.strictEqual(
  rangedSnapshotGuardMetrics.overview.revenueMix.reduce((sum, row) => sum + row.value, 0),
  rangedSnapshotGuardMetrics.overview.cards.totalIncome.value,
  'selected revenue mix total must equal the total income card'
);
assert.deepStrictEqual(rangedSnapshotGuardMetrics.overview.trends.map(row => row.date), ['2026-06-16', '2026-06-17', '2026-06-18', '2026-06-19', '2026-06-20', '2026-06-21', '2026-06-22'], 'future selected dates should be clipped to today while preserving a real trend window for overview trends');
assert.deepStrictEqual(rangedSnapshotGuardMetrics.court.trends.map(row => row.date), ['2026-06-16', '2026-06-17', '2026-06-18', '2026-06-19', '2026-06-20', '2026-06-21', '2026-06-22'], 'future selected dates should be clipped to today while preserving a real trend window for court trends');
assert.deepStrictEqual(rangedSnapshotGuardMetrics.coach.trends.map(row => row.date), ['2026-06-16', '2026-06-17', '2026-06-18', '2026-06-19', '2026-06-20', '2026-06-21', '2026-06-22'], 'future selected dates should be clipped to today while preserving a real trend window for coach trends');

const zeroRangedSnapshotGuardMetrics = buildOperationsMetrics({
  leads: [],
  students: [],
  purchases: [{ id: 'outside-course', studentId: 'outside', actualAmount: 1000, purchaseDate: '2026-06-21', status: 'active' }],
  membershipOrders: [{ id: 'outside-member', rechargeAmount: 500, purchaseDate: '2026-06-21', status: 'active' }],
  courts: [],
  coaches: [],
  schedule: [],
  membershipAccounts: [],
  financeNormalizedRows: [{ id: 'outside-booking', businessDate: '2026-06-21', businessType: '散客订场', action: '收款', cashDelta: 200, recognizedRevenueDelta: 200 }],
  financeOverviewData: { totalIncome: 909700, recognizedRevenue: 295500, pendingRevenue: 614200, tradeCount: 1113, courseIncome: 505900, bookingIncome: 266700, storedValueIncome: 137100 }
}, {
  now: new Date('2026-06-22 12:00:00'),
  dateRange: { startDate: '2026-06-22', endDate: '2026-06-28' }
});
assert.strictEqual(zeroRangedSnapshotGuardMetrics.overview.cards.totalIncome.value, 0, 'empty selected ranges must stay zero instead of falling back to all-time finance totals');
assert.strictEqual(zeroRangedSnapshotGuardMetrics.overview.cards.tradeCount.value, 0, 'empty selected ranges must not reuse all-time trade counts');
assert.deepStrictEqual(zeroRangedSnapshotGuardMetrics.overview.revenueMix, [], 'empty selected revenue mix must not show all-time finance categories');

const financeSingleSourceMetrics = buildOperationsMetrics({
  leads: [],
  students: [],
  purchases: [
    { id: 'fallback-course-should-not-count', studentId: 'fallback-student', actualAmount: 999999, purchaseDate: '2026-06-01', status: 'active' }
  ],
  membershipOrders: [
    { id: 'fallback-member-should-not-count', rechargeAmount: 999999, purchaseDate: '2026-06-01', status: 'active' }
  ],
  courts: [],
  coaches: [],
  schedule: [],
  membershipAccounts: [],
  financeNormalizedRows: [
    { id: 'finance-course-1', businessDate: '2026-06-01', businessType: '课程', action: '收款', cashDelta: 1000, recognizedRevenueDelta: 120, deferredRevenueDelta: 880 },
    { id: 'finance-member-1', businessDate: '2026-06-01', businessType: '会员储值', action: '收款', cashDelta: 500, recognizedRevenueDelta: 0, deferredRevenueDelta: 500 },
    { id: 'finance-booking-1', businessDate: '2026-06-01', businessType: '散客订场', action: '收款', cashDelta: 200, recognizedRevenueDelta: 200, deferredRevenueDelta: 0, timeText: '08:00-09:00', sourceProject: '1号场' }
  ],
  financeOverviewData: {
    __partial: true,
    all: {
      cash: 9,
      recognized: 8,
      deferred: 7,
      courseIncome: 6,
      bookingIncome: 5,
      storedValueIncome: 4,
      tradeCount: 3
    }
  }
}, {
  now: new Date('2026-06-02 12:00:00')
});
assert.strictEqual(financeSingleSourceMetrics.overview.cards.totalIncome.value, 1700, 'operations overview total income must come from finance normalized rows, not stale financeOverviewData or fallback rows');
assert.strictEqual(financeSingleSourceMetrics.overview.cards.recognizedRevenue.value, 320, 'operations overview recognized revenue must come from finance normalized rows');
assert.strictEqual(financeSingleSourceMetrics.overview.cards.pendingRevenue.value, 1380, 'operations overview pending revenue must come from finance normalized rows');
assert.strictEqual(financeSingleSourceMetrics.overview.cards.tradeCount.value, 3, 'operations overview trade count must use finance receipt rows');
assert.deepStrictEqual(financeSingleSourceMetrics.overview.revenueMix, [
  { name: '课程收入', value: 1000 },
  { name: '订场收入', value: 200 },
  { name: '会员储值', value: 500 }
], 'operations revenue mix must use the same finance normalized rows as the overview cards');

const noFinanceFallbackMetrics = buildOperationsMetrics({
  leads: [],
  students: [],
  purchases: [
    { id: 'no-finance-course', studentId: 'fallback-student', actualAmount: 999999, purchaseDate: '2026-06-01', status: 'active' }
  ],
  membershipOrders: [
    { id: 'no-finance-member', rechargeAmount: 999999, purchaseDate: '2026-06-01', status: 'active' }
  ],
  courts: [
    {
      id: 'no-finance-court',
      history: JSON.stringify([
        { date: '2026-06-01', venue: '1号场', startTime: '08:00', endTime: '09:00', amount: 999999, type: '消费', category: '散客订场' }
      ])
    }
  ],
  coaches: [],
  schedule: [],
  membershipAccounts: [],
  financeNormalizedRows: [],
  financeOverviewData: {}
}, {
  now: new Date('2026-06-02 12:00:00'),
  dateRange: { startDate: '2026-06-01', endDate: '2026-06-02' }
});
assert.strictEqual(noFinanceFallbackMetrics.overview.cards.totalIncome.value, 0, 'operations overview total income must not fall back to business rows when finance rows are missing');
assert.strictEqual(noFinanceFallbackMetrics.overview.cards.recognizedRevenue.value, 0, 'operations overview recognized revenue must not fall back to court rows when finance rows are missing');
assert.strictEqual(noFinanceFallbackMetrics.overview.cards.pendingRevenue.value, 0, 'operations overview pending revenue must not fall back to purchase or member rows when finance rows are missing');
assert.strictEqual(noFinanceFallbackMetrics.overview.cards.tradeCount.value, 0, 'operations overview trade count must not fall back to business rows when finance rows are missing');
assert.deepStrictEqual(noFinanceFallbackMetrics.overview.revenueMix, [], 'operations revenue mix must not fall back to business rows when finance rows are missing');
assert.strictEqual(noFinanceFallbackMetrics.overview.trends.find(row => row.date === '2026-06-01')?.totalIncome, 0, 'operations overview trends must not fall back to business rows when finance rows are missing');

const closedFunnelMetrics = buildOperationsMetrics({
  leads: [
    { id: 'closed-lead-attended', leadDate: '2026-06-01', trialAt: '2026-06-01', trialAttendedAt: '2026-06-01', source: '小红书' },
    { id: 'closed-lead-deal-no-attendance', leadDate: '2026-06-01', source: '小红书', studentId: 'closed-student-deal' }
  ],
  students: [
    { id: 'closed-student-deal', sourceLeadId: 'closed-lead-deal-no-attendance', dealPath: '体验转化' }
  ],
  purchases: [
    { id: 'closed-purchase-deal', studentId: 'closed-student-deal', actualAmount: 1000, purchaseDate: '2026-06-02', status: 'active' }
  ],
  courts: [],
  coaches: [],
  schedule: [],
  membershipAccounts: [],
  membershipOrders: [],
  financeNormalizedRows: [],
  financeOverviewData: {}
}, {
  now: new Date('2026-06-03 12:00:00'),
  dateRange: { startDate: '2026-06-01', endDate: '2026-06-03' }
});
const closedFunnelDealStep = closedFunnelMetrics.conversion.courseFunnel[2];
const closedFunnelTrendPoint = closedFunnelMetrics.conversion.trends.find(row => row.date === '2026-06-02');
assert.ok(closedFunnelDealStep.count <= closedFunnelMetrics.conversion.courseFunnel[1].count, 'formal students must be a subset of course-chain students');
assert.ok(closedFunnelDealStep.transitionRate <= 100, 'closed funnel deal rate must never exceed 100%');
assert.ok((closedFunnelTrendPoint?.dealRateNumerator || 0) <= (closedFunnelTrendPoint?.dealRateDenominator || 0), 'conversion trend deal numerator must be inside its attendance denominator');
assert.ok((closedFunnelTrendPoint?.dealRate || 0) <= 100, 'conversion trend deal rate must never exceed 100%');

const conversionDashboardConsistencyMetrics = buildOperationsMetrics({
  campuses: [{ id: 'shunyi_mapo', code: 'shunyi_mapo', name: '顺义马坡' }],
  leads: [
    { id: 'conversion-lead-1', leadDate: '2026-06-01', source: '小红书', campus: 'shunyi_mapo', leadStage: '已约体验', trialAt: '2026-06-01' },
    { id: 'conversion-lead-2', leadDate: '2026-06-01', source: '小红书', campus: 'shunyi_mapo', studentId: 'conversion-student-1', leadStage: '课程转化', trialAt: '2026-06-01', trialAttendedAt: '2026-06-01' }
  ],
  students: [{ id: 'conversion-student-1', sourceLeadId: 'conversion-lead-2', primaryCoach: '张教练' }],
  purchases: [{ id: 'conversion-purchase-1', studentId: 'conversion-student-1', actualAmount: 1000, purchaseDate: '2026-06-01', status: 'active', primaryCoach: '张教练' }],
  coaches: [{ id: 'conversion-coach-1', name: '张教练', status: 'active', campus: 'shunyi_mapo' }],
  schedule: [],
  courts: [],
  membershipAccounts: [],
  membershipOrders: [],
  financeNormalizedRows: [],
  financeOverviewData: {}
}, {
  now: new Date('2026-06-23 08:00:00'),
  dateRange: { startDate: '2026-06-01', endDate: '2026-06-30' }
});
assert.strictEqual(
  conversionDashboardConsistencyMetrics.conversion.standardRates.trialConversionRate,
  conversionDashboardConsistencyMetrics.conversion.standardLifecycleMetrics.metrics.trialPathDeals.rate,
  'conversion top deal rate should use the standard trial-path deal metric'
);
assert.strictEqual(
  conversionDashboardConsistencyMetrics.conversion.standardRates.renewalRate,
  0,
  'conversion top renewal rate should not be derived from the standard course-chain display funnel'
);
assert.strictEqual(conversionDashboardConsistencyMetrics.conversion.filteredViews, undefined, 'conversion dashboard should not expose backend-precomputed filtered views');
assert.strictEqual(conversionDashboardConsistencyMetrics.conversion.filterOptions, undefined, 'conversion dashboard should not expose local filter options');
assert.strictEqual(conversionDashboardConsistencyMetrics.conversion.studentAttributeRows, undefined, 'conversion dashboard should not expose local attribute rows');
assert.ok(Array.isArray(conversionDashboardConsistencyMetrics.conversion.profileRows), 'conversion dashboard should expose restored profile rows');

const financeBackedTrendMetrics = buildOperationsMetrics({
  campuses: [
    {
      id: 'shunyi_mapo',
      code: 'shunyi_mapo',
      name: '顺义马坡',
      venues: [{ id: 'v1', name: '1号场', status: 'active', sortOrder: 1 }]
    }
  ],
  leads: [
    { id: 'finance-backed-lead', leadStage: '课程转化', studentId: 'finance-backed-student', source: '小红书', campus: 'shunyi_mapo' }
  ],
  leadFollowups: [
    { id: 'finance-backed-appointment', leadId: 'finance-backed-lead', followupAt: '2026-06-01 10:00:00', statusAfter: '已约体验' },
    { id: 'finance-backed-attendance', leadId: 'finance-backed-lead', followupAt: '2026-06-02 10:00:00', statusAfter: '已体验' },
    { id: 'finance-backed-deal', leadId: 'finance-backed-lead', followupAt: '2026-06-03 10:00:00', statusAfter: '课程转化' }
  ],
  students: [{ id: 'finance-backed-student', sourceLeadId: 'finance-backed-lead', dealPath: '体验转化', primaryCoach: '张教练' }],
  purchases: [],
  coaches: [{ id: 'finance-backed-coach', name: '张教练', status: 'active', campus: 'shunyi_mapo' }],
  schedule: [],
  courts: [],
  membershipAccounts: [],
  membershipOrders: [],
  financeNormalizedRows: [
    { id: 'finance-course-real', businessDate: '2026-06-01', businessType: '课程', action: '收款', cashDelta: 1000, recognizedRevenueDelta: 0, collector: '张教练', operator: '管理员' },
    { id: 'finance-course-import-operator', businessDate: '2026-06-01', businessType: '课程', action: '收款', cashDelta: 48000, recognizedRevenueDelta: 0, collector: 'Codex第一批导入-LIVE_FIX', operator: '管理员' },
    { id: 'finance-member-real', businessDate: '2026-06-02', businessType: '会员储值', action: '收款', cashDelta: 500, recognizedRevenueDelta: 0 },
    { id: 'finance-court-real', businessDate: '2026-06-03', businessType: '散客订场', action: '收款', cashDelta: 200, recognizedRevenueDelta: 200, timeText: '08:00-09:00', sourceProject: '1号场' },
    { id: 'finance-member-court-real', businessDate: '2026-06-04', businessType: '会员订场', action: '已入账', cashDelta: 0, recognizedRevenueDelta: 180, timeText: '10:00-11:00', sourceProject: '1号场' }
  ],
  financeOverviewData: {}
}, { now: new Date('2026-06-05 12:00:00') });
assert.strictEqual(financeBackedTrendMetrics.overview.trends.length, 30, 'all-time overview KPI trends should return a visible continuous 30-day window when finance rows are available');
assert.strictEqual(financeBackedTrendMetrics.overview.trends.at(-1)?.date, '2026-06-04', 'all-time overview KPI trends should end at the latest real finance row date');
assert.strictEqual(financeBackedTrendMetrics.overview.trends.find(row => row.date === '2026-06-01')?.courseIncome, 49000, 'overview course income trend should include real finance course rows');
assert.strictEqual(financeBackedTrendMetrics.overview.trends.find(row => row.date === '2026-06-02')?.storedValueIncome, 500, 'overview stored value trend should come from real finance rows');
assert.strictEqual(financeBackedTrendMetrics.overview.trends.find(row => row.date === '2026-05-31')?.totalIncome, 0, 'all-time overview KPI trends should fill empty finance days with zero buckets');
assert.strictEqual(financeBackedTrendMetrics.court.trends.find(row => row.date === '2026-06-04')?.bookingAmount, 180, 'court trends should include real member booking finance rows without court history');
assert.strictEqual(financeBackedTrendMetrics.conversion.trends.find(row => row.date === '2026-06-03')?.dealRateNumerator, 0, 'conversion trends should not treat follow-up status text as a paid course conversion without a course purchase fact');
assert.strictEqual(financeBackedTrendMetrics.coach.trends.find(row => row.date === '2026-06-01')?.revenue, 1000, 'coach trends should use real course finance rows when purchase detail rows are unavailable');
assert.strictEqual(financeBackedTrendMetrics.coach.rows.some(row => /Codex|管理员|导入/.test(row.coach)), false, 'coach dashboard should not treat import operators as coaches');
assert.strictEqual(financeBackedTrendMetrics.coach.revenueParetoRows.some(row => /Codex|管理员|导入/.test(row.coach)), false, 'coach contribution ranking should only show real coaches');

const financeSourceDocumentAttributionMetrics = buildOperationsMetrics({
  campuses: [],
  leads: [],
  leadFollowups: [],
  students: [
    { id: 'stu-source-doc', name: '来源购买学员', primaryCoach: '张教练' },
    { id: 'stu-direct-schedule', name: '直接收款学员', primaryCoach: '李教练' }
  ],
  purchases: [
    { id: 'purchase-before-source-doc', studentId: 'stu-source-doc', studentName: '来源购买学员', packageName: '成人私教课包', amountPaid: 1000, purchaseDate: '2026-05-20', ownerCoach: '张教练', status: 'active' },
    { id: 'purchase-source-doc', studentId: 'stu-source-doc', studentName: '来源购买学员', packageName: '成人私教课包', amountPaid: 2000, purchaseDate: '2026-06-08', ownerCoach: '张教练', status: 'active' }
  ],
  coaches: [
    { id: 'coach-zhang', name: '张教练', status: 'active' },
    { id: 'coach-li', name: '李教练', status: 'active' }
  ],
  schedule: [
    { id: 'schedule-direct-paid', studentId: 'stu-direct-schedule', studentName: '直接收款学员', coach: '李教练', startTime: '2026-06-09 10:00:00', endTime: '2026-06-09 11:00:00', status: '已结束', courseType: '私教课' }
  ],
  courts: [],
  membershipAccounts: [],
  membershipOrders: [],
  financeNormalizedRows: [
    { id: 'finance-before-source-doc', businessDate: '2026-05-20', businessType: '课程', action: '收款', cashDelta: 1000, sourceDocument: '购买记录 purchase-before-source-doc', collector: '系统导入', operator: '管理员', incomeType: '成人私教课包' },
    { id: 'finance-source-doc', businessDate: '2026-06-08', businessType: '课程', action: '收款', cashDelta: 2000, sourceDocument: '购买记录 purchase-source-doc', collector: '系统导入', operator: '管理员', incomeType: '成人私教课包' },
    { id: 'finance-direct-schedule', businessDate: '2026-06-09', businessType: '课程', action: '收款', cashDelta: 300, sourceDocument: '排课 schedule-direct-paid', collector: '管理员', operator: '管理员', incomeType: '私教课' }
  ],
  financeOverviewData: {}
}, {
  now: new Date('2026-06-10 12:00:00'),
  dateRange: { startDate: '2026-06-01', endDate: '2026-06-30' }
});
assert.strictEqual(financeSourceDocumentAttributionMetrics.coach.rows.find(row => row.coach === '张教练')?.revenue, 2000, 'coach revenue should trace finance purchase rows back to source purchase ownerCoach');
assert.strictEqual(financeSourceDocumentAttributionMetrics.coach.rows.find(row => row.coach === '张教练')?.oldCustomerBase, 1, 'coach renewal base should include prior finance purchase rows traced through source purchase ids');
assert.strictEqual(financeSourceDocumentAttributionMetrics.coach.rows.find(row => row.coach === '张教练')?.renewalCount, 1, 'coach renewal count should use current finance purchase rows traced through source purchase ids');
assert.strictEqual(financeSourceDocumentAttributionMetrics.coach.rows.find(row => row.coach === '李教练')?.revenue, 300, 'coach revenue should trace direct schedule finance rows back to source schedule coach');
assert.ok(financeSourceDocumentAttributionMetrics.coach.revenueParetoRows.some(row => row.coach === '张教练' && row.revenue === 2000), 'coach contribution ranking should render traced finance revenue');
assert.ok(financeSourceDocumentAttributionMetrics.coach.capabilityRows.some(row => row.coach === '张教练' && row.oldCustomerBase === 1), 'coach capability matrix should render when traced finance rows provide renewal base');

console.log('operations metrics tests passed');
