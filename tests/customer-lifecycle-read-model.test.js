const assert = require('assert');

const {
  buildCustomerLifecycleRows,
  buildLeadConversionSetsFromLifecycle
} = require('../server/read-models/customer-lifecycle.js');

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
assert.strictEqual(row.courtStage, 'member', 'membership account should make the court user a member view row');
assert.strictEqual(row.hasCourseConversion, true);
assert.strictEqual(row.hasBookingConversion, true);
assert.strictEqual(row.hasMembershipConversion, true, 'membership conversion should be derived from court-linked membership account');
assert.strictEqual(row.membershipAccountId, 'membership-account-1');

const sets = buildLeadConversionSetsFromLifecycle(rows);
assert.ok(sets.course.has('lead-1'), 'course conversion set should use lifecycle sourceLeadId');
assert.ok(sets.booking.has('lead-1'), 'booking conversion set should use lifecycle sourceLeadId');
assert.ok(sets.membership.has('lead-1'), 'membership conversion set should use lifecycle sourceLeadId');

console.log('customer lifecycle read model tests passed');
