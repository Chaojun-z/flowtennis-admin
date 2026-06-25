const assert = require('assert');

const { buildPlatformMetrics } = require('../server/read-models/platform-metrics.js');
const { buildOperationsMetrics } = require('../server/metrics/operations-metrics.js');

const source = {
  leads: [
    { id: 'lead-1', displayName: '已有线索', source: '朋友转介绍', leadDate: '2026-06-01' }
  ],
  students: [
    { id: 'student-1', name: '已有线索', sourceLeadId: 'lead-1', source: '朋友转介绍', createdAt: '2026-06-01' },
    { id: 'student-2', name: '无原始线索学员', phone: '13900000002', source: '小红书', createdAt: '2026-06-02' }
  ],
  purchases: [
    { id: 'purchase-1', studentId: 'student-2', packageName: '成人正式课包', actualAmount: 1000, status: 'active', purchaseDate: '2026-06-03' }
  ],
  entitlements: [],
  schedule: [],
  courts: [
    { id: 'court-1', name: '订场客户', phone: '13900000003', source: '抖音', createdAt: '2026-06-04' }
  ],
  membershipAccounts: [
    { id: 'member-1', courtId: 'court-1', status: 'active', createdAt: '2026-06-05' }
  ],
  membershipOrders: []
};

const platform = buildPlatformMetrics(source);

assert.strictEqual(platform.customerLifecycleRows.length, 3, 'lifecycle should contain existing leads, student-only customers and court/member customers');
assert.strictEqual(platform.leadPoolRows.length, 3, 'lead pool should expose every lifecycle customer identity');
assert.ok(platform.leadPoolRows.find(row => row.id === 'student:student-2' && row.displayName === '无原始线索学员'), 'student without ft_leads should still be searchable in the lead pool');
assert.ok(platform.leadPoolRows.find(row => row.id === 'court:court-1' && row.leadStage === '订场+会员'), 'member court customer should stay a booking user and enter member stage');
assert.strictEqual(platform.conversionMetrics.totalLeads, 3, 'standard conversion total should use lead pool rows');
assert.strictEqual(platform.sourceChannelStats.find(row => row.source === '小红书')?.leads, 1, 'source stats should use one normalized source definition');
assert.strictEqual(platform.studentStageStats.find(row => row.stage === 'formal')?.count, 1, 'formal student count should use the lifecycle studentStage');

const operations = buildOperationsMetrics(source, { now: new Date('2026-06-18T00:00:00+08:00') });

assert.strictEqual(operations.conversion.cards.totalLeads.value, source.leads.length, 'operations conversion must count raw course leads, not the full searchable customer pool');
assert.strictEqual(operations.conversion.cards.convertedLeads.value, 1, 'operations converted leads may count raw leads linked to students');
assert.strictEqual(operations.conversion.sourceRows.find(row => row.source === '小红书'), undefined, 'operations source rows must not include student-only searchable rows when there is no raw lead');

console.log('platform metrics tests passed');
