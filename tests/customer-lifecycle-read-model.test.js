const assert = require('assert');

const {
  buildCustomerLifecycleRows,
  buildLeadConversionSetsFromLifecycle
} = require('../server/read-models/customer-lifecycle.js');
const { buildLeadPoolRows } = require('../server/read-models/platform-metrics.js');

const rows = buildCustomerLifecycleRows({
  leads: [
    {
      id: 'lead-1',
      displayName: '小王',
      phone: '15000000000',
      source: '朋友转介绍',
      campus: 'mabao',
      owner: '张教练',
      leadDate: '2026-06-01'
    }
  ],
  students: [
    {
      id: 'student-1',
      name: '小王',
      sourceLeadId: 'lead-1'
    }
  ],
  purchases: [
    {
      id: 'purchase-trial',
      studentId: 'student-1',
      courseType: '体验课',
      status: 'active',
      purchaseDate: '2026-06-02'
    },
    {
      id: 'purchase-formal',
      studentId: 'student-1',
      packageName: '成人私教课 10 节',
      status: 'active',
      purchaseDate: '2026-06-05'
    }
  ],
  courts: [
    {
      id: 'court-1',
      name: '小王',
      phone: '15000000000',
      sourceLeadId: 'lead-1',
      status: 'active'
    }
  ],
  membershipAccounts: [
    {
      id: 'membership-account-1',
      courtId: 'court-1',
      status: 'active',
      memberLabel: '黄金卡'
    }
  ],
  membershipOrders: [
    {
      id: 'membership-order-1',
      courtId: 'court-1',
      membershipAccountId: 'membership-account-1',
      rechargeAmount: 5000,
      status: 'active',
      purchaseDate: '2026-06-06'
    }
  ]
});

assert.strictEqual(rows.length, 1, 'same lead/student/court/member should collapse into one lifecycle row');

const row = rows[0];
assert.strictEqual(row.customerKey, 'lead:lead-1');
assert.strictEqual(row.sourceLeadId, 'lead-1');
assert.strictEqual(row.displayName, '小王');
assert.strictEqual(row.source, '转介绍', 'source should use the global source taxonomy');
assert.strictEqual(row.studentStage, 'formal', 'formal purchase should move the student out of trial stage');
assert.strictEqual(row.hasTrialExperience, true, 'formal students should keep the trial experience fact after conversion');
assert.strictEqual(row.courseDealPath, '体验转化', 'course deal path should be owned by the lifecycle read model');
assert.strictEqual(row.trialStatus, '已成交', 'trial status should be owned by the lifecycle read model');
assert.strictEqual(row.trialBookedAt, '2026-06-02');
assert.strictEqual(row.courtStage, 'member', 'membership account should make the court user a member view row');
assert.strictEqual(row.hasCourseConversion, true);
assert.strictEqual(row.hasBookingConversion, true);
assert.strictEqual(row.hasMembershipConversion, true, 'membership conversion should be derived from court-linked membership account');
assert.strictEqual(row.membershipAccountId, 'membership-account-1');

const sets = buildLeadConversionSetsFromLifecycle(rows);
assert.ok(sets.course.has('lead-1'), 'course conversion set should use lifecycle sourceLeadId');
assert.ok(sets.booking.has('lead-1'), 'booking conversion set should use lifecycle sourceLeadId');
assert.ok(sets.membership.has('lead-1'), 'membership conversion set should use lifecycle sourceLeadId');

const freePrivateRows = buildCustomerLifecycleRows({
  students: [
    {
      id: 'student-free-private',
      name: '小鹿',
      type: '成人',
      campus: 'mabao',
      createdAt: '2026-05-20T00:00:00.000Z',
      notes: '未参加标准体验课，跟随朝军上免费私教课'
    }
  ],
  schedule: [
    {
      id: 'schedule-free-private',
      studentId: 'student-free-private',
      courseType: '私教课',
      coach: '朝军',
      status: '已结束',
      startTime: '2026-03-18T10:00:00.000Z',
      actualAmount: 0,
      paidAmount: 0,
      notes: '免费私教跟进'
    }
  ]
});

const freePrivate = freePrivateRows[0];
assert.strictEqual(freePrivate.leadDate, '', 'student-only synthetic lifecycle rows should not backfill lead time from later business behavior');
assert.strictEqual(freePrivate.firstTouchAt, '2026-03-18T10:00:00.000Z', 'first touch should keep the earliest known business behavior');
assert.strictEqual(freePrivate.source, '未知');
assert.strictEqual(freePrivate.customerType, '成人');
assert.strictEqual(freePrivate.demandProduct, '私教课');
assert.strictEqual(freePrivate.owner, 'Mira', 'mabao synthetic leads without an owner should default to Mira');
assert.strictEqual(freePrivate.formalCoach, '', 'free private follow-up should not fill the paid deal coach field');
assert.strictEqual(freePrivate.hasCourseConversion, false, 'free classes without paid purchase should not count as course conversion');
assert.strictEqual(freePrivate.hasTrialExperience, false, 'free private classes should not be treated as standard trial lessons');

const freePrivateLeadRows = buildLeadPoolRows({ customerLifecycleRows: freePrivateRows, lifecycleScope: 'course' });
assert.strictEqual(freePrivateLeadRows[0].leadStage, '跟进中', 'free class follow-up should not become 已约体验 or 已成交');
assert.strictEqual(freePrivateLeadRows[0].demandProduct, '私教课');

const directPrivateRows = buildCustomerLifecycleRows({
  students: [
    {
      id: 'student-direct-private',
      name: '私教直转',
      type: '成人',
      campus: 'mabao',
      createdAt: '2026-05-20T00:00:00.000Z'
    }
  ],
  purchases: [
    {
      id: 'purchase-direct-private',
      studentId: 'student-direct-private',
      packageName: '成人私教课 10 节',
      courseType: '私教课',
      status: 'active',
      actualAmount: 6800,
      purchaseDate: '2026-04-02'
    }
  ]
});

const directPrivate = directPrivateRows[0];
assert.strictEqual(directPrivate.leadDate, '', 'direct conversion without a raw lead should keep lead time empty');
assert.strictEqual(directPrivate.firstTouchAt, '2026-04-02', 'first touch should preserve the first paid business date');
assert.strictEqual(directPrivate.courseFirstPurchaseAt, '2026-04-02');
assert.strictEqual(directPrivate.conversionAt, '2026-04-02');
assert.strictEqual(directPrivate.demandProduct, '私教课');
assert.strictEqual(directPrivate.hasCourseConversion, true, 'paid private purchase should count as course conversion');
assert.strictEqual(directPrivate.courseDealPath, '直接成交');
assert.strictEqual(directPrivate.trialStatus, '已成交');

const directPrivateLeadRows = buildLeadPoolRows({ customerLifecycleRows: directPrivateRows, lifecycleScope: 'course' });
assert.strictEqual(directPrivateLeadRows[0].leadStage, '已成交');
assert.strictEqual(directPrivateLeadRows[0].dealType, '课程');
assert.strictEqual(directPrivateLeadRows[0].enrollAtRaw, '2026-04-02');

console.log('customer lifecycle read model tests passed');
