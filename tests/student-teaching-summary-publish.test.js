const assert = require('assert');

const {
  createStudentTeachingSummaryCache,
  buildStudentTeachingSummaryMetaRow,
  STUDENT_TEACHING_SUMMARY_META_ID,
  STUDENT_TEACHING_SUMMARY_READY
} = require('../server/read-models/student-teaching-summary-cache');

async function testKeepsReadyMetaWhenRefreshFails() {
  const tables = {
    T_LEADS: 'ft_leads',
    T_STUDENTS: 'ft_students',
    T_PURCHASES: 'ft_purchases',
    T_ENTITLEMENTS: 'ft_entitlements',
    T_ENTITLEMENT_LEDGER: 'ft_entitlement_ledger',
    T_SCHEDULE: 'ft_schedule',
    T_FEEDBACKS: 'ft_feedbacks',
    T_MEMBERSHIP_BENEFIT_LEDGER: 'ft_membership_benefit_ledger',
    T_STUDENT_TEACHING_SUMMARY: 'ft_student_teaching_summary'
  };
  const metaWrites = [];
  const existingMeta = buildStudentTeachingSummaryMetaRow({
    status: STUDENT_TEACHING_SUMMARY_READY,
    rowCount: 0,
    checksum: 'ready-checksum',
    batchId: 'ready-batch',
    sourceSnapshotAt: '2026-08-28T00:00:00.000Z',
    completedAt: '2026-08-28T00:00:01.000Z'
  });
  const cache = createStudentTeachingSummaryCache({
    tables,
    mkTable: async () => {},
    getCachedScan: async table => {
      if (table === tables.T_STUDENT_TEACHING_SUMMARY) return [existingMeta];
      if (table === tables.T_STUDENTS) throw new Error('source scan failed');
      return [];
    },
    put: async (table, id, row) => {
      if (table === tables.T_STUDENT_TEACHING_SUMMARY && id === STUDENT_TEACHING_SUMMARY_META_ID) {
        metaWrites.push(row);
      }
    },
    del: async () => {},
    logger: { error() {} }
  });

  await assert.rejects(
    () => cache.refreshStudentTeachingSummaryRows(),
    /source scan failed/
  );
  assert.deepStrictEqual(metaWrites, [], 'failed refresh must keep the last ready meta serving pages');
}

(async () => {
  await testKeepsReadyMetaWhenRefreshFails();
  console.log('student teaching summary publish tests passed');
})().catch(error => {
  console.error(error && error.stack ? error.stack : String(error));
  process.exit(1);
});
