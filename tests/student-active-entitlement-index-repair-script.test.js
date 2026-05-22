const assert = require('assert');

const {
  TABLES,
  buildIndexRows
} = require('../scripts/repair-student-active-entitlement-index-20260522');

assert.strictEqual(
  TABLES.activeEntitlementIndex,
  'ft_student_active_entitlement_index',
  '修复脚本必须指向学员活跃课包索引表'
);

const rows = buildIndexRows([
  { id: 'ent-1', studentId: 'stu-1', status: 'active', remainingLessons: 2 },
  { id: 'ent-2', studentId: 'stu-1', status: 'voided', remainingLessons: 8 },
  { id: 'ent-3', studentId: 'stu-2', status: 'active', remainingLessons: 0 },
  { id: 'ent-4', studentId: 'stu-2', status: 'active', remainingLessons: 1 },
  { id: 'ent-5', studentId: '', status: 'active', remainingLessons: 1 }
], '2026-05-22T10:00:00.000Z');

assert.deepStrictEqual(rows, [
  { id: 'stu-1', studentId: 'stu-1', entitlementIds: ['ent-1'], updatedAt: '2026-05-22T10:00:00.000Z' },
  { id: 'stu-2', studentId: 'stu-2', entitlementIds: ['ent-4'], updatedAt: '2026-05-22T10:00:00.000Z' }
]);

console.log('student active entitlement index repair script tests passed');
