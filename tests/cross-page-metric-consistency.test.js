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
const rawLeadIds = new Set(sample.leads.map(row => String(row.id || '').trim()).filter(Boolean));
const rawLeadPoolRows = allLeadPoolRows.filter(row => rawLeadIds.has(String(row?.id || row?.sourceLeadId || '').trim()));
const platform = buildPlatformMetrics({ ...sample, customerLifecycleRows: lifecycleRows });
const operations = buildOperationsMetrics({ ...sample, customerLifecycleRows: lifecycleRows }, { now: new Date('2026-06-18 00:00:00') });

assert.strictEqual(rawLeadPoolRows.length, sample.leads.length, 'raw lead pool should keep exactly the raw lead cohort');
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
    ['线索量', 6],
    ['预约体验客户', 2],
    ['体验课实到人数', 1],
    ['体验后成交人数', 0],
    ['成交后续费人数', 0]
  ],
  'course funnel must count strict trial appointments only; direct course/booking/member deals must not be backfilled into预约体验客户'
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
    ['lead-hybrid', '已成交', '课程+订场+会员']
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
    ['小红书', 2, 1, 50],
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
    { id: 'lead-booked-only', displayName: '已约未上', leadDate: '2026-06-02' },
    { id: 'lead-attended-only', displayName: '已体验待成交', leadDate: '2026-06-03' },
    { id: 'lead-trial-course', displayName: '体验后成交', leadDate: '2026-06-04' },
    { id: 'lead-booking-only', displayName: '只订场', leadDate: '2026-06-05' }
  ],
  students: [
    { id: 'stu-direct-course', name: '直接成交', sourceLeadId: 'lead-direct-course' },
    { id: 'stu-booked-only', name: '已约未上', sourceLeadId: 'lead-booked-only' },
    { id: 'stu-attended-only', name: '已体验待成交', sourceLeadId: 'lead-attended-only' },
    { id: 'stu-trial-course', name: '体验后成交', sourceLeadId: 'lead-trial-course' }
  ],
  purchases: [
    { id: 'purchase-direct-course', studentId: 'stu-direct-course', packageName: '成人正式课包', actualAmount: 1200, status: 'active', purchaseDate: '2026-06-06' },
    { id: 'purchase-trial-course', studentId: 'stu-trial-course', packageName: '成人正式课包', actualAmount: 1200, status: 'active', purchaseDate: '2026-06-07' }
  ],
  schedule: [
    { id: 'schedule-booked-only', studentId: 'stu-booked-only', courseType: '体验课', startTime: '2026-06-08 10:00:00', endTime: '2026-06-08 11:00:00', status: '待上课' },
    { id: 'schedule-attended-only', studentId: 'stu-attended-only', courseType: '体验课', startTime: '2026-06-09 10:00:00', endTime: '2026-06-09 11:00:00', status: '已完成' },
    { id: 'schedule-trial-course', studentId: 'stu-trial-course', courseType: '体验课', startTime: '2026-06-10 10:00:00', endTime: '2026-06-10 11:00:00', status: '已完成' }
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
assert.deepStrictEqual(
  teachingPlatform.teachingStudentViews.trialStudents.map(row => row.studentId).sort(),
  ['stu-attended-only', 'stu-booked-only'],
  '普通学员视图只能包含仍停留在体验阶段且未买正式课包的人，不能包含体验后成交或直接成交'
);
assert.deepStrictEqual(
  teachingPlatform.teachingStudentViews.formalStudents.map(row => row.studentId).sort(),
  ['stu-direct-course', 'stu-trial-course'],
  '正式学员视图必须包含直接课程成交和体验后课程成交'
);
assert.strictEqual(
  teachingPlatform.teachingStudentViews.trialStudents.some(row => teachingPlatform.teachingStudentViews.formalStudents.some(item => item.customerKey === row.customerKey)),
  false,
  '普通学员和正式学员必须互斥'
);
assert.strictEqual(
  teachingOperations.conversion.cards.courseDealCustomers.value,
  teachingPlatform.teachingStudentViews.formalStudents.length,
  '转化与留存课包成交客户数必须等于正式学员视图人数'
);
assert.strictEqual(
  teachingOperations.conversion.cards.trialToCourseCustomers.value,
  1,
  '体验后成交人数只统计体验后买正式课包，不能把直接成交算进去'
);

console.log('cross page metric consistency tests passed');
