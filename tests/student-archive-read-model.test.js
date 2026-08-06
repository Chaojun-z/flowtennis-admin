const assert = require('assert');
const { buildCustomerLifecycleRows } = require('../server/read-models/customer-lifecycle.js');
const { buildTeachingStudentViews } = require('../server/read-models/platform-metrics.js');

const data = {
  leads: [],
  students: [
    { id: 'student-active', name: '可见学员', status: 'active' },
    { id: 'student-archived', name: '归档学员', status: 'archived', archivedAt: '2026-06-12 00:00:00' }
  ],
  purchases: [
    { id: 'purchase-archived', studentId: 'student-archived', courseType: '私教课', amountPaid: 1000, status: 'active' }
  ],
  entitlements: [
    { id: 'ent-archived', studentId: 'student-archived', purchaseId: 'purchase-archived', courseType: '私教课', totalLessons: 10, remainingLessons: 8, status: 'active' }
  ],
  schedule: [
    { id: 'schedule-active', studentId: 'student-active', courseType: '私教课', startTime: '2026-06-12 10:00:00', endTime: '2026-06-12 11:00:00', status: '已结束' },
    { id: 'schedule-archived', studentId: 'student-archived', courseType: '私教课', startTime: '2026-06-12 10:00:00', endTime: '2026-06-12 11:00:00', status: '已结束' }
  ],
  entitlementLedger: [],
  feedbacks: []
};

const customerLifecycleRows = buildCustomerLifecycleRows(data);
const views = buildTeachingStudentViews(customerLifecycleRows, data);

assert.ok(views.historicalStudents.some(row => row.studentId === 'student-active'), 'active student should stay visible in teaching views');
assert.ok(!views.historicalStudents.some(row => row.studentId === 'student-archived'), 'archived student should be hidden from historical student view');
assert.ok(!views.activeStudents.some(row => row.studentId === 'student-archived'), 'archived student should be hidden from active student view');
assert.ok(!views.searchableStudents.some(row => row.studentId === 'student-archived'), 'archived student should be hidden from student search index');

console.log('student archive read model tests passed');
