const assert = require('assert');

const { buildCustomerLifecycleRows } = require('../server/read-models/customer-lifecycle.js');
const { buildLeadPoolRows, buildPlatformMetrics } = require('../server/read-models/platform-metrics.js');
const { buildOperationsMetrics } = require('../server/metrics/operations-metrics.js');

function stageCountMap(rows = []) {
  return (rows || []).reduce((result, row) => {
    const key = String(row?.stage || row?.leadStage || '').trim();
    if (!key) return result;
    result[key] = (result[key] || 0) + Number(row?.count || 1);
    return result;
  }, {});
}

const sample = {
  leads: [
    { id: 'lead-followup', displayName: '跟进客户', source: '朋友转介绍', leadDate: '2026-06-01' },
    { id: 'lead-followup-duplicate', displayName: '跟进客户', source: '朋友转介绍', leadDate: '2026-06-02' },
    { id: 'lead-booked', displayName: '已约体验客户', source: '小红书', leadDate: '2026-06-02', trialAtRaw: '2026-06-05' },
    { id: 'lead-attended', displayName: '已体验客户', source: '大众点评', leadDate: '2026-06-03' },
    { id: 'lead-course', displayName: '课程成交客户', source: '小红书', leadDate: '2026-06-04' },
    { id: 'lead-booking', displayName: '订场成交客户', source: '抖音', leadDate: '2026-06-05' },
    { id: 'lead-hybrid', displayName: '全链路成交客户', source: '转介绍', leadDate: '2026-06-06' }
  ],
  students: [
    { id: 'stu-attended', name: '已体验客户', sourceLeadId: 'lead-attended', createdAt: '2026-06-03' },
    { id: 'stu-course', name: '课程成交客户', sourceLeadId: 'lead-course', createdAt: '2026-06-04' },
    { id: 'stu-hybrid', name: '全链路成交客户', sourceLeadId: 'lead-hybrid', createdAt: '2026-06-06' },
    { id: 'stu-synthetic', name: '无原始线索学员', source: '视频号', createdAt: '2026-06-07' }
  ],
  purchases: [
    { id: 'purchase-course', studentId: 'stu-course', packageName: '成人正式课包', actualAmount: 1200, status: 'active', purchaseDate: '2026-06-08' },
    { id: 'purchase-hybrid', studentId: 'stu-hybrid', packageName: '成人正式课包', actualAmount: 1800, status: 'active', purchaseDate: '2026-06-09' },
    { id: 'purchase-synthetic', studentId: 'stu-synthetic', packageName: '成人正式课包', actualAmount: 999, status: 'active', purchaseDate: '2026-06-10' }
  ],
  entitlements: [],
  schedule: [
    { id: 'schedule-trial-attended', studentId: 'stu-attended', courseType: '体验课', startTime: '2026-06-06 10:00:00', endTime: '2026-06-06 11:00:00', status: '已完成' }
  ],
  courts: [
    { id: 'court-booking', name: '订场成交客户', sourceLeadId: 'lead-booking', createdAt: '2026-06-07' },
    { id: 'court-hybrid', name: '全链路成交客户', sourceLeadId: 'lead-hybrid', createdAt: '2026-06-08' }
  ],
  membershipAccounts: [
    { id: 'member-hybrid', courtId: 'court-hybrid', status: 'active', createdAt: '2026-06-10' }
  ],
  membershipOrders: []
};

const lifecycleRows = buildCustomerLifecycleRows(sample);
const allLeadPoolRows = buildLeadPoolRows({ leads: sample.leads, customerLifecycleRows: lifecycleRows });
const platform = buildPlatformMetrics({ ...sample, customerLifecycleRows: lifecycleRows });
const rawLeadPoolRows = platform.rawLeadPoolRows;
const operations = buildOperationsMetrics({ ...sample, customerLifecycleRows: lifecycleRows }, { now: new Date('2026-06-18 00:00:00') });

assert.strictEqual(rawLeadPoolRows.length, sample.leads.length - 1, 'raw lead pool should count the standard valid lead-customer cohort, not duplicate raw lead rows');
assert.strictEqual(allLeadPoolRows.length, rawLeadPoolRows.length + 1, 'unified lead-pool builder may include synthetic direct-conversion customers beyond the raw lead cohort');
assert.strictEqual(platform.leadPoolRows.length, allLeadPoolRows.length, 'platform metrics should expose the full searchable customer pool');
assert.strictEqual(operations.conversion.cards.totalLeads.value, rawLeadPoolRows.length, 'operations raw lead total should stay aligned with the raw lead pool cohort');
assert.strictEqual(
  operations.conversion.cards.convertedLeads.value,
  rawLeadPoolRows.filter(row => row.leadStage === '已成交').length,
  'operations converted lead card must use the same total成交口径 as the unified raw lead pool'
);
assert.strictEqual(
  operations.conversion.cards.leadConversionRate.value,
  50,
  'operations total lead conversion rate should be 总成交人数 / 有效线索数, not the course-only trial funnel rate'
);
assert.deepStrictEqual(
  operations.conversion.courseFunnel.map(row => [row.stage, row.count]),
  [
    ['有效线索', 6],
    ['普通学员', 4],
    ['正式学员', 3],
    ['课包复购', 0]
  ],
  'course funnel must use the restored ordinary-student funnel, including converted students and scheduled students'
);

assert.deepStrictEqual(
  stageCountMap(operations.conversion.stageRows),
  stageCountMap(rawLeadPoolRows.map(row => ({ stage: row.leadStage }))),
  'operations stage rows must stay identical to the unified raw lead-pool stage distribution'
);

assert.deepStrictEqual(
  rawLeadPoolRows.map(row => [row.id, row.leadStage, row.dealType || '']).sort((a, b) => a[0].localeCompare(b[0])),
  [
    ['lead-attended', '已体验待成交', ''],
    ['lead-booked', '已约体验', ''],
    ['lead-booking', '已成交', '订场'],
    ['lead-course', '已成交', '课程'],
    ['lead-followup', '跟进中', ''],
    ['lead-hybrid', '已成交', '课程+订场+订场会员']
  ],
  'raw lead pool should keep one standard lead stage and one independent deal type per lead'
);

assert.strictEqual(
  operations.conversion.stageRows.find(row => row.stage === '已成交')?.count,
  3,
  'operations converted stage should aggregate all raw成交路径 into the single standard 已成交 stage'
);
assert.deepStrictEqual(
  operations.conversion.sourceRows.map(row => [row.source, row.leads, row.converted, row.conversionRate]),
  [
    ['网球兄弟小红书', 2, 1, 50],
    ['转介绍', 2, 1, 50],
    ['抖音', 1, 1, 100],
    ['大众点评', 1, 0, 0]
  ],
  'operations source conversion rows must use total成交口径 from unified raw lead rows'
);
assert.strictEqual(
  platform.leadPoolRows.find(row => row.id === 'student:stu-synthetic')?.leadStage,
  '已成交',
  'searchable customer pool should still include synthetic direct-conversion customers for线索池/客户中心搜索'
);

const teachingSample = {
  leads: [
    { id: 'lead-direct-course', displayName: '直接成交', leadDate: '2026-06-01' },
    { id: 'lead-direct-course-manual-trial', displayName: '线索手工邀约后直接成交', leadDate: '2026-06-01', trialAtRaw: '2026-06-05 10:00' },
    { id: 'lead-booked-only', displayName: '已约未上', leadDate: '2026-06-02' },
    { id: 'lead-attended-only', displayName: '已体验待成交', leadDate: '2026-06-03' },
    { id: 'lead-trial-course', displayName: '体验后成交', leadDate: '2026-06-04' },
    { id: 'lead-manual-course', displayName: '手工课程成交', leadDate: '2026-06-04', leadStage: '已成交', dealType: '课程' },
    { id: 'lead-scheduled-course', displayName: '正式课排课', leadDate: '2026-06-04' },
    { id: 'lead-booking-only', displayName: '只订场', leadDate: '2026-06-05' }
  ],
  students: [
    { id: 'stu-direct-course', name: '直接成交', sourceLeadId: 'lead-direct-course' },
    { id: 'stu-direct-course-manual-trial', name: '线索手工邀约后直接成交', sourceLeadId: 'lead-direct-course-manual-trial' },
    { id: 'stu-booked-only', name: '已约未上', sourceLeadId: 'lead-booked-only' },
    { id: 'stu-attended-only', name: '已体验待成交', sourceLeadId: 'lead-attended-only' },
    { id: 'stu-trial-course', name: '体验后成交', sourceLeadId: 'lead-trial-course' },
    { id: 'stu-manual-course', name: '手工课程成交', sourceLeadId: 'lead-manual-course' },
    { id: 'stu-scheduled-course', name: '正式课排课', sourceLeadId: 'lead-scheduled-course' }
  ],
  purchases: [
    { id: 'purchase-direct-course', studentId: 'stu-direct-course', packageName: '成人正式课包', actualAmount: 1200, status: 'active', purchaseDate: '2026-06-06' },
    { id: 'purchase-direct-course-manual-trial', studentId: 'stu-direct-course-manual-trial', packageName: '成人正式课包', actualAmount: 1200, status: 'active', purchaseDate: '2026-06-06' },
    { id: 'purchase-trial-course', studentId: 'stu-trial-course', packageName: '成人正式课包', actualAmount: 1200, status: 'active', purchaseDate: '2026-06-07' }
  ],
  schedule: [
    { id: 'schedule-booked-only', studentId: 'stu-booked-only', courseType: '体验课', startTime: '2026-06-08 10:00:00', endTime: '2026-06-08 11:00:00', status: '待上课' },
    { id: 'schedule-attended-only', studentId: 'stu-attended-only', courseType: '体验课', startTime: '2026-06-09 10:00:00', endTime: '2026-06-09 11:00:00', status: '已完成' },
    { id: 'schedule-trial-course', studentId: 'stu-trial-course', courseType: '体验课', startTime: '2026-06-10 10:00:00', endTime: '2026-06-10 11:00:00', status: '已完成' },
    { id: 'schedule-formal-course', studentId: 'stu-scheduled-course', courseType: '私教课', startTime: '2026-06-11 10:00:00', endTime: '2026-06-11 11:00:00', status: '已排课' }
  ],
  courts: [
    { id: 'court-booking-only', name: '只订场', sourceLeadId: 'lead-booking-only', history: JSON.stringify([{ date: '2026-06-06', startTime: '09:00', endTime: '10:00', amount: 100, type: '消费' }]) }
  ],
  membershipAccounts: [],
  membershipOrders: []
};
const teachingLifecycleRows = buildCustomerLifecycleRows(teachingSample);
const teachingPlatform = buildPlatformMetrics({ ...teachingSample, customerLifecycleRows: teachingLifecycleRows });
const teachingOperations = buildOperationsMetrics({ ...teachingSample, customerLifecycleRows: teachingLifecycleRows }, { now: new Date('2026-06-18 00:00:00') });
assert.ok(Array.isArray(teachingPlatform.teachingStudentViews.courseStudents), '教学链读模型必须提供普通学员 courseStudents');
assert.ok(Array.isArray(teachingPlatform.teachingStudentViews.trialAttendedStudents), '教学链读模型必须提供上过体验课 trialAttendedStudents');
assert.ok(Array.isArray(teachingPlatform.teachingStudentViews.trialAttendedToFormalPurchaseStudents), '教学链读模型必须提供体验后买正式课 trialAttendedToFormalPurchaseStudents');
assert.ok(Array.isArray(teachingPlatform.teachingStudentViews.trialAttendedWithoutFormalStudents), '教学链读模型必须提供上过体验未买正式课 trialAttendedWithoutFormalStudents');
assert.ok(Array.isArray(teachingPlatform.teachingStudentViews.directCourseDealStudents), '教学链读模型必须提供直接成交 directCourseDealStudents');
assert.deepStrictEqual(
  teachingPlatform.teachingStudentViews.courseStudents.map(row => row.studentId).sort(),
  ['stu-attended-only', 'stu-booked-only', 'stu-direct-course', 'stu-direct-course-manual-trial', 'stu-manual-course', 'stu-scheduled-course', 'stu-trial-course'],
  '普通学员视图必须包含上过体验课、已转化学员、正式课包学员和有排课记录学员'
);
assert.deepStrictEqual(
  teachingPlatform.teachingStudentViews.formalStudents.map(row => row.studentId).sort(),
  ['stu-direct-course', 'stu-direct-course-manual-trial', 'stu-trial-course'],
  '正式学员视图必须包含直接课程成交和体验后课程成交'
);
assert.strictEqual(
  teachingPlatform.teachingStudentViews.courseStudents.some(row => row.studentId === 'stu-direct-course'),
  true,
  '直接购买正式课包但没有上过体验课事实的人，也必须进入普通学员'
);
assert.deepStrictEqual(
  teachingPlatform.teachingStudentViews.trialAttendedStudents.map(row => row.studentId).sort(),
  ['stu-attended-only', 'stu-trial-course'],
  '上过体验课只包含排课表里有效已发生体验课的人，不包含待上课、体验购买或手工邀约'
);
assert.deepStrictEqual(
  teachingPlatform.teachingStudentViews.trialAttendedToFormalPurchaseStudents.map(row => row.studentId).sort(),
  ['stu-trial-course'],
  '体验后买正式课只统计上过体验课且买正式课包的人'
);
assert.deepStrictEqual(
  teachingPlatform.teachingStudentViews.directCourseDealStudents.map(row => row.studentId).sort(),
  ['stu-direct-course', 'stu-direct-course-manual-trial'],
  '直接成交学员只统计没有上过体验课但买正式课包的人'
);
assert.deepStrictEqual(
  teachingPlatform.teachingStudentViews.trialAttendedWithoutFormalStudents.map(row => row.studentId).sort(),
  ['stu-attended-only'],
  '上过体验未买正式课只统计有体验课排课事实但未买正式课包的人'
);
[
  ['courseStudentCount', 7],
  ['trialStudentCount', 2],
  ['formalStudentCount', 3],
  ['historicalStudentCount', 5],
  ['activeStudentCount', 1],
  ['courseDealCustomers', 3],
  ['trialAttendedStudentCount', 2],
  ['trialAttendedToFormalPurchaseCount', 1],
  ['trialAttendedWithoutFormalCount', 1],
  ['trialToCourseCustomers', 1],
  ['directCourseCustomers', 2],
  ['coursePurchaseCount', 3],
  ['courseRepeatCount', 0]
].forEach(([key, value]) => {
  assert.strictEqual(teachingPlatform.teachingStudentViews.summary[key], value, `教学链汇总 ${key} 必须保持统一口径`);
});
assert.strictEqual(
  teachingPlatform.standardLifecycleMetrics.metrics.historicalStudents.value,
  teachingPlatform.teachingStudentViews.summary.historicalStudentCount,
  '线索池历史学员指标必须等于历史学员页统一后端总数'
);
assert.strictEqual(
  teachingPlatform.standardLifecycleMetrics.metrics.activeStudents.value,
  teachingPlatform.teachingStudentViews.summary.activeStudentCount,
  '线索池在期学员指标必须等于在期学员页统一后端总数'
);
assert.ok(
  teachingPlatform.teachingStudentViews.activeStudents.every(row => teachingPlatform.teachingStudentViews.historicalStudents.some(item => item.studentId === row.studentId)),
  '在期学员必须是历史学员的子集'
);
assert.ok(
  teachingPlatform.teachingStudentViews.summary.historicalTagCounts && teachingPlatform.teachingStudentViews.summary.activeTagCounts,
  '教学链汇总必须提供历史学员和在期学员的后端标签计数'
);
assert.strictEqual(
  teachingPlatform.teachingStudentViews.summary.historicalStudentCount,
  teachingPlatform.standardLifecycleMetrics.teachingSummary.historicalStudentCount,
  '历史学员页和线索池必须读取同一个后端历史学员总数'
);
assert.strictEqual(
  teachingPlatform.teachingStudentViews.summary.activeStudentCount,
  teachingPlatform.standardLifecycleMetrics.teachingSummary.activeStudentCount,
  '在期学员页和线索池必须读取同一个后端在期学员总数'
);
assert.strictEqual(
  teachingPlatform.standardLifecycleMetrics.teachingSummary.trialAttendedStudentCount,
  teachingPlatform.teachingStudentViews.trialAttendedStudents.length,
  '线索池上过体验课必须读取后端排课事实集合'
);
assert.strictEqual(
  teachingPlatform.standardLifecycleMetrics.teachingSummary.trialAttendedToFormalPurchaseCount,
  teachingPlatform.teachingStudentViews.trialAttendedToFormalPurchaseStudents.length,
  '线索池体验后买正式课必须读取后端排课事实集合'
);
assert.strictEqual(
  teachingOperations.conversion.cards.courseDealCustomers.value,
  teachingPlatform.teachingStudentViews.formalStudents.length,
  '转化与留存课包成交客户数必须等于正式学员视图人数'
);
assert.strictEqual(
  teachingOperations.conversion.cards.trialPathDealCustomers.value,
  1,
  '经营分析体验成交口径必须和教学链统一，不能把直接成交算进去'
);
assert.strictEqual(
  teachingOperations.conversion.cards.directCourseCustomers.value,
  2,
  '直接成交人数必须统计没有上过体验课但买正式课包的人'
);

console.log('cross page metric consistency tests passed');
