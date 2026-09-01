const assert = require('assert');
const {
  buildStudentTeachingSummaryChecksum,
  buildStudentTeachingSummaryMetaRow,
  buildVersionedStudentTeachingSummaryRow,
  requireReadyStudentTeachingSummaryRows,
  STUDENT_TEACHING_SUMMARY_READY
} = require('../server/read-models/student-teaching-summary-cache.js');
const {
  buildCleanupPlan,
  verifyCleanupResult
} = require('../scripts/cleanup-student-teaching-summary-stale-versions.js');

const currentVersion = 'student-teaching-summary-current';
const oldVersion = 'student-teaching-summary-old';
const currentRows = [
  { id: 'student-1', studentId: 'student-1', name: '当前学员一' },
  { id: 'student-2', studentId: 'student-2', name: '当前学员二' }
];
const currentVersionedRows = currentRows.map(row => buildVersionedStudentTeachingSummaryRow(row, currentVersion));
const staleRows = [
  { id: 'legacy-student-1', studentId: 'legacy-student-1', name: '旧无版本摘要' },
  buildVersionedStudentTeachingSummaryRow({ id: 'old-student-1', studentId: 'old-student-1', name: '旧版本摘要' }, oldVersion)
];
const meta = buildStudentTeachingSummaryMetaRow({
  status: STUDENT_TEACHING_SUMMARY_READY,
  batchId: currentVersion,
  activeVersion: currentVersion,
  sourceSnapshotAt: '2026-09-01T00:00:00.000Z',
  completedAt: '2026-09-01T00:00:01.000Z',
  rowCount: currentRows.length,
  checksum: buildStudentTeachingSummaryChecksum(currentRows)
});
const rows = [meta, ...currentVersionedRows, ...staleRows];

const plan = buildCleanupPlan(rows);
assert.deepStrictEqual(
  plan.deleteIds.sort(),
  staleRows.map(row => row.id).sort(),
  '必须只删除非当前 activeVersion 的旧摘要行'
);
assert.strictEqual(plan.keepCount, currentVersionedRows.length + 1, '必须保留 meta 和当前版本摘要');
assert.strictEqual(plan.deleteCount, 2, '必须准确统计待清理旧摘要');

const afterRows = rows.filter(row => !plan.deleteIds.includes(row.id));
const readyRows = requireReadyStudentTeachingSummaryRows(afterRows);
assert.deepStrictEqual(readyRows.map(row => row.studentId).sort(), ['student-1', 'student-2']);
assert.deepStrictEqual(verifyCleanupResult(afterRows).remainingStaleIds, []);

assert.throws(
  () => buildCleanupPlan([
    buildStudentTeachingSummaryMetaRow({
      status: STUDENT_TEACHING_SUMMARY_READY,
      rowCount: 1,
      checksum: buildStudentTeachingSummaryChecksum([{ id: 'legacy-only', studentId: 'legacy-only' }])
    }),
    { id: 'legacy-only', studentId: 'legacy-only' }
  ]),
  /activeVersion/,
  '没有 activeVersion 时不能清场，避免误删唯一可读旧摘要'
);

console.log('cleanup student teaching summary stale versions tests passed');
