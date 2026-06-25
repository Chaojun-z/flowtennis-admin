const assert = require('assert');

const { buildLifecycleLeadLinkAudit } = require('../scripts/audit-customer-lifecycle-lead-links.js');

const audit = buildLifecycleLeadLinkAudit({
  leads: [{ id: 'lead-1', displayName: '已有线索', source: '小红书' }],
  students: [
    { id: 'student-1', name: '已有线索', sourceLeadId: 'lead-1' },
    { id: 'student-2', name: '缺线索学员', phone: '13900000002', source: '转介绍' },
    { id: 'student-3', name: '断链学员', sourceLeadId: 'missing-lead' }
  ],
  purchases: [{ id: 'purchase-1', studentId: 'student-2', packageName: '正式课包', status: 'active' }],
  entitlements: [],
  schedule: [],
  courts: [{ id: 'court-1', name: '缺线索订场', phone: '13900000003' }],
  membershipAccounts: [{ id: 'member-1', courtId: 'court-1', status: 'active' }],
  membershipOrders: []
});

assert.strictEqual(audit.write, false, 'audit script must be dry-run only');
assert.strictEqual(audit.counts.rawLeads, 1);
assert.strictEqual(audit.counts.leadPoolRows, 4, 'lead pool should include raw leads, missing students, broken-link students and courts');
assert.strictEqual(audit.counts.syntheticLeadRows, 3, 'missing and broken lifecycle identities should be listed for repair planning');
assert.ok(audit.missingSourceLeadId.students.find(row => row.id === 'student-2'), 'student missing sourceLeadId should be listed');
assert.ok(audit.brokenSourceLeadId.students.find(row => row.id === 'student-3'), 'student pointing to a missing lead should be listed');
assert.ok(audit.plannedLeadCreates.find(row => row.displayName === '缺线索订场' && row.kind === 'membership'), 'member court customer should be included in planned lead creates');

console.log('customer lifecycle lead link audit tests passed');
