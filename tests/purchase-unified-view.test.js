const assert = require('assert');
const { buildPurchaseUnifiedView } = require('../server/read-models/unified-page-views');

const snapshot = buildPurchaseUnifiedView({
  students: [
    { id: 'stu-1', name: '学员A', type: '青少年' },
    { id: 'stu-2', name: '学员B', type: '成人' }
  ],
  packages: [
    { id: 'pkg-1', courseType: '私教课', maxStudents: 2, lessons: 10 },
    { id: 'pkg-2', courseType: '小班课', standardCourseType: '小班课 / 训练营', maxStudents: 4, lessons: 10 }
  ],
  purchases: [
    { id: 'pur-1', studentId: 'stu-1', packageId: 'pkg-1', purchaseDate: '2026-06-01', amountPaid: 4500, packageLessons: 10, status: 'active' },
    { id: 'pur-2', studentId: 'stu-1', packageId: 'pkg-1', purchaseDate: '2026-07-01', amountPaid: 4500, packageLessons: 10, status: 'active' },
    { id: 'pur-void', studentId: 'stu-1', packageId: 'pkg-1', purchaseDate: '2026-07-02', amountPaid: 4500, packageLessons: 10, status: 'voided' },
    { id: 'pur-small', studentId: 'stu-2', packageId: 'pkg-2', type: 'active', purchaseDate: '2026-06-03', amountPaid: 1999, packageLessons: 10, status: 'active' },
    { id: 'pur-private-after-small', studentId: 'stu-2', packageId: 'pkg-1', purchaseDate: '2026-06-04', amountPaid: 4500, packageLessons: 10, status: 'active' }
  ],
  entitlements: [
    { id: 'ent-1', purchaseId: 'pur-1', studentId: 'stu-1', totalLessons: 10, usedLessons: 10, remainingLessons: 0, status: 'depleted' },
    { id: 'ent-2', purchaseId: 'pur-2', studentId: 'stu-1', totalLessons: 10, usedLessons: 6, remainingLessons: 4, status: 'active' },
    { id: 'ent-small', purchaseId: 'pur-small', studentId: 'stu-2', totalLessons: 10, usedLessons: 10, remainingLessons: 0, status: 'depleted' },
    { id: 'ent-private-after-small', purchaseId: 'pur-private-after-small', studentId: 'stu-2', totalLessons: 10, usedLessons: 2, remainingLessons: 8, status: 'active' }
  ]
});

const row1 = snapshot.rows.find(row => row.id === 'pur-1');
const row2 = snapshot.rows.find(row => row.id === 'pur-2');
const voidRow = snapshot.rows.find(row => row.id === 'pur-void');
const smallRow = snapshot.rows.find(row => row.id === 'pur-small');
const privateAfterSmallRow = snapshot.rows.find(row => row.id === 'pur-private-after-small');

assert.strictEqual(row1.userType, '青少年', 'purchase unified row should expose student type as user type');
assert.strictEqual(row1.maxStudents, 2, 'purchase unified row should expose package class size');
assert.strictEqual(row1.classSizeLabel, '1v2', 'purchase unified row should expose class size label');
assert.strictEqual(row1.paidStatus, '首次', 'first non-void purchase should be marked as first purchase');
assert.strictEqual(row2.paidStatus, '续报', 'later non-void purchase should be marked as renewal');
assert.strictEqual(row1.inPeriodStatus, '已用完-续课', 'exhausted purchase with later renewal should be marked as renewed completion');
assert.strictEqual(row2.inPeriodStatus, '在期', 'purchase with remaining lessons should be marked as in period');
assert.strictEqual(voidRow.paidStatus, '已作废', 'voided purchase should stay voided');
assert.strictEqual(voidRow.inPeriodStatus, '已作废', 'voided purchase should stay voided in the in-period status column');
assert.strictEqual(smallRow.courseType, '小班课 / 训练营', 'purchase rows should expose the standard course type used by filters');
assert.strictEqual(smallRow.userType, '成人', 'purchase rows should not expose raw active status as user type');
assert.strictEqual(smallRow.paidStatus, '-', 'non-private course purchases should not show paid status');
assert.strictEqual(smallRow.inPeriodStatus, '-', 'non-private course purchases should not show in-period status');
assert.strictEqual(privateAfterSmallRow.paidStatus, '首次', 'first private course purchase should stay first even after a non-private purchase');

console.log('purchase unified view tests passed');
