const assert = require('assert');
const { buildPurchaseUnifiedView } = require('../server/read-models/unified-page-views');

const snapshot = buildPurchaseUnifiedView({
  students: [
    { id: 'stu-1', name: '学员A', type: '青少年' }
  ],
  packages: [
    { id: 'pkg-1', courseType: '私教课', maxStudents: 2, lessons: 10 }
  ],
  purchases: [
    { id: 'pur-1', studentId: 'stu-1', packageId: 'pkg-1', purchaseDate: '2026-06-01', amountPaid: 4500, packageLessons: 10, status: 'active' },
    { id: 'pur-2', studentId: 'stu-1', packageId: 'pkg-1', purchaseDate: '2026-07-01', amountPaid: 4500, packageLessons: 10, status: 'active' },
    { id: 'pur-void', studentId: 'stu-1', packageId: 'pkg-1', purchaseDate: '2026-07-02', amountPaid: 4500, packageLessons: 10, status: 'voided' }
  ],
  entitlements: [
    { id: 'ent-1', purchaseId: 'pur-1', studentId: 'stu-1', totalLessons: 10, usedLessons: 10, remainingLessons: 0, status: 'depleted' },
    { id: 'ent-2', purchaseId: 'pur-2', studentId: 'stu-1', totalLessons: 10, usedLessons: 6, remainingLessons: 4, status: 'active' }
  ]
});

const row1 = snapshot.rows.find(row => row.id === 'pur-1');
const row2 = snapshot.rows.find(row => row.id === 'pur-2');
const voidRow = snapshot.rows.find(row => row.id === 'pur-void');

assert.strictEqual(row1.userType, '青少年', 'purchase unified row should expose student type as user type');
assert.strictEqual(row1.maxStudents, 2, 'purchase unified row should expose package class size');
assert.strictEqual(row1.classSizeLabel, '1v2', 'purchase unified row should expose class size label');
assert.strictEqual(row1.paidStatus, '首次', 'first non-void purchase should be marked as first purchase');
assert.strictEqual(row2.paidStatus, '续报', 'later non-void purchase should be marked as renewal');
assert.strictEqual(row1.inPeriodStatus, '已用完-续课', 'exhausted purchase with later renewal should be marked as renewed completion');
assert.strictEqual(row2.inPeriodStatus, '在期', 'purchase with remaining lessons should be marked as in period');
assert.strictEqual(voidRow.paidStatus, '已作废', 'voided purchase should stay voided');
assert.strictEqual(voidRow.inPeriodStatus, '已作废', 'voided purchase should stay voided in the in-period status column');

console.log('purchase unified view tests passed');
