const assert = require('assert');

const {
  createStudentTeachingSummaryCache,
  buildStudentTeachingSummaryMetaRow,
  buildStudentTeachingSummaryChecksum,
  buildVersionedStudentTeachingSummaryRow,
  requireReadyStudentTeachingSummaryRows,
  readReadyStudentTeachingSummaryRows,
  STUDENT_TEACHING_SUMMARY_META_ID,
  STUDENT_TEACHING_SUMMARY_READY
} = require('../server/read-models/student-teaching-summary-cache');

function clone(value) {
  return JSON.parse(JSON.stringify(value || []));
}

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

async function testReadySummaryReadDoesNotWaitForHungScan() {
  const startedAt = Date.now();
  const result = await Promise.race([
    readReadyStudentTeachingSummaryRows({
      tableName: 'ft_student_teaching_summary',
      getCachedScan: async () => new Promise(() => {}),
      timeoutMs: 50,
      intervalMs: 10
    }).then(
      () => ({ ok: true, elapsedMs: Date.now() - startedAt }),
      error => ({ ok: false, error, elapsedMs: Date.now() - startedAt })
    ),
    new Promise(resolve => setTimeout(() => resolve({ ok: false, hung: true, elapsedMs: Date.now() - startedAt }), 250))
  ]);

  assert.strictEqual(result.hung, undefined, '摘要表读取卡住时不能拖到接口超时');
  assert.strictEqual(result.error?.code, 'STUDENT_TEACHING_SUMMARY_NOT_READY');
  assert.match(result.error?.message || '', /read-timeout/);
  assert.ok(result.elapsedMs < 200, `摘要读取应快速降级，实际 ${result.elapsedMs}ms`);
}

async function testKeepsServingReadyRowsWhileNextVersionIsWritten() {
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
  const oldRows = [{ id: 'old-student', studentId: 'old-student', name: '旧摘要' }];
  const tableRows = {
    ft_leads: [],
    ft_students: [{ id: 'new-student', name: '新摘要学员' }],
    ft_purchases: [],
    ft_entitlements: [],
    ft_entitlement_ledger: [],
    ft_schedule: [{
      id: 'new-student-lesson',
      studentId: 'new-student',
      studentIds: ['new-student'],
      studentName: '新摘要学员',
      courseType: '私教课',
      startTime: '2026-08-20 10:00:00',
      status: '已完成'
    }],
    ft_feedbacks: [],
    ft_membership_benefit_ledger: [],
    ft_student_teaching_summary: [
      buildStudentTeachingSummaryMetaRow({
        status: STUDENT_TEACHING_SUMMARY_READY,
        rowCount: oldRows.length,
        checksum: buildStudentTeachingSummaryChecksum(oldRows),
        batchId: 'old-ready-batch',
        sourceSnapshotAt: '2026-08-28T00:00:00.000Z',
        completedAt: '2026-08-28T00:00:01.000Z'
      }),
      ...oldRows
    ]
  };
  let checkedDuringWrite = false;
  const upsert = (table, id, row) => {
    const list = tableRows[table] || [];
    const index = list.findIndex(item => String(item.id || '') === String(id || ''));
    const next = clone(row);
    tableRows[table] = index >= 0 ? list.map(item => String(item.id || '') === String(id || '') ? next : item) : [...list, next];
  };
  const cache = createStudentTeachingSummaryCache({
    tables,
    mkTable: async table => {
      if (!Array.isArray(tableRows[table])) tableRows[table] = [];
    },
    getCachedScan: async table => clone(tableRows[table] || []),
    put: async (table, id, row) => {
      upsert(table, id, row);
      if (table === tables.T_STUDENT_TEACHING_SUMMARY && id !== STUDENT_TEACHING_SUMMARY_META_ID && !checkedDuringWrite) {
        checkedDuringWrite = true;
        const visibleRows = requireReadyStudentTeachingSummaryRows(tableRows.ft_student_teaching_summary);
        assert.deepStrictEqual(
          visibleRows.map(item => item.studentId),
          ['old-student'],
          '新摘要写入期间必须继续读旧 ready 摘要，不能因为 rowCount/checksum 临时不一致变 503'
        );
      }
    },
    del: async (table, id) => {
      tableRows[table] = (tableRows[table] || []).filter(row => String(row.id || '') !== String(id || ''));
    },
    logger: { error() {} }
  });

  await cache.refreshStudentTeachingSummaryRows();
  assert.strictEqual(checkedDuringWrite, true, '测试必须覆盖新摘要写入中的读取窗口');
  const finalRows = requireReadyStudentTeachingSummaryRows(tableRows.ft_student_teaching_summary);
  assert.deepStrictEqual(finalRows.map(row => row.studentId), ['new-student'], '发布完成后必须只读新版本摘要');
}

async function testRollsBackPartiallyWrittenRowsWhenRefreshFails() {
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
  const oldRows = [
    { id: 'old-student-1', studentId: 'old-student-1', name: '旧摘要一' },
    { id: 'old-student-2', studentId: 'old-student-2', name: '旧摘要二' }
  ];
  const oldVersion = 'old-ready-batch';
  const tableRows = {
    ft_leads: [],
    ft_students: [{ id: 'new-student-1', name: '新摘要一' }, { id: 'new-student-2', name: '新摘要二' }],
    ft_purchases: [],
    ft_entitlements: [],
    ft_entitlement_ledger: [],
    ft_schedule: [
      { id: 'new-student-1-lesson', studentId: 'new-student-1', studentIds: ['new-student-1'], studentName: '新摘要一', courseType: '私教课', startTime: '2026-08-20 10:00:00', status: '已完成' },
      { id: 'new-student-2-lesson', studentId: 'new-student-2', studentIds: ['new-student-2'], studentName: '新摘要二', courseType: '私教课', startTime: '2026-08-21 10:00:00', status: '已完成' }
    ],
    ft_feedbacks: [],
    ft_membership_benefit_ledger: [],
    ft_student_teaching_summary: [
      buildStudentTeachingSummaryMetaRow({
        status: STUDENT_TEACHING_SUMMARY_READY,
        rowCount: oldRows.length,
        checksum: buildStudentTeachingSummaryChecksum(oldRows),
        batchId: oldVersion,
        activeVersion: oldVersion,
        sourceSnapshotAt: '2026-08-28T00:00:00.000Z',
        completedAt: '2026-08-28T00:00:01.000Z'
      }),
      ...oldRows.map(row => buildVersionedStudentTeachingSummaryRow(row, oldVersion))
    ]
  };
  const clone = value => JSON.parse(JSON.stringify(value || []));
  const cache = createStudentTeachingSummaryCache({
    tables,
    mkTable: async table => {
      if (!Array.isArray(tableRows[table])) tableRows[table] = [];
    },
    getCachedScan: async table => clone(tableRows[table] || []),
    put: async (table, id, row) => {
      const list = Array.isArray(tableRows[table]) ? tableRows[table] : [];
      const index = list.findIndex(item => String(item.id || '') === String(id || ''));
      const next = clone(row);
      tableRows[table] = index >= 0 ? list.map(item => String(item.id || '') === String(id || '') ? next : item) : [...list, next];
      if (table === tables.T_STUDENT_TEACHING_SUMMARY && String(id || '') !== STUDENT_TEACHING_SUMMARY_META_ID && String(row.publishVersion || '').startsWith('student-teaching-summary-')) {
        const versionedRows = tableRows.ft_student_teaching_summary.filter(item => String(item.publishVersion || '') !== oldVersion && String(item.id || '').startsWith('__student_teaching_summary_version__:'));
        if (versionedRows.length === 1) {
          throw new Error('publish interrupted');
        }
      }
    },
    del: async (table, id) => {
      tableRows[table] = (tableRows[table] || []).filter(row => String(row.id || '') !== String(id || ''));
    },
    logger: { error() {} }
  });

  await assert.rejects(
    () => cache.refreshStudentTeachingSummaryRows(),
    /publish interrupted/
  );
  const leakedNewVersionRows = tableRows.ft_student_teaching_summary.filter(row => String(row.id || '').startsWith('__student_teaching_summary_version__:') && String(row.publishVersion || '') !== oldVersion);
  assert.deepStrictEqual(leakedNewVersionRows, [], '发布失败后不能残留半成品新版本行');
  const readyRows = requireReadyStudentTeachingSummaryRows(tableRows.ft_student_teaching_summary);
  assert.deepStrictEqual(readyRows.map(row => row.studentId).sort(), ['old-student-1', 'old-student-2'], '发布失败后仍应继续读旧 ready 版本');
}

async function testRestoresOldReadyMetaWhenCleanupFailsAfterSwitch() {
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
  const oldRows = [
    { id: 'old-student-1', studentId: 'old-student-1', name: '旧摘要一' },
    { id: 'old-student-2', studentId: 'old-student-2', name: '旧摘要二' }
  ];
  const oldVersion = 'old-ready-batch';
  const tableRows = {
    ft_leads: [],
    ft_students: [{ id: 'new-student-1', name: '新摘要一' }, { id: 'new-student-2', name: '新摘要二' }],
    ft_purchases: [],
    ft_entitlements: [],
    ft_entitlement_ledger: [],
    ft_schedule: [
      { id: 'new-student-1-lesson', studentId: 'new-student-1', studentIds: ['new-student-1'], studentName: '新摘要一', courseType: '私教课', startTime: '2026-08-20 10:00:00', status: '已完成' },
      { id: 'new-student-2-lesson', studentId: 'new-student-2', studentIds: ['new-student-2'], studentName: '新摘要二', courseType: '私教课', startTime: '2026-08-21 10:00:00', status: '已完成' }
    ],
    ft_feedbacks: [],
    ft_membership_benefit_ledger: [],
    ft_student_teaching_summary: [
      buildStudentTeachingSummaryMetaRow({
        status: STUDENT_TEACHING_SUMMARY_READY,
        rowCount: oldRows.length,
        checksum: buildStudentTeachingSummaryChecksum(oldRows),
        batchId: oldVersion,
        activeVersion: oldVersion,
        sourceSnapshotAt: '2026-08-28T00:00:00.000Z',
        completedAt: '2026-08-28T00:00:01.000Z'
      }),
      ...oldRows.map(row => buildVersionedStudentTeachingSummaryRow(row, oldVersion))
    ]
  };
  const clone = value => JSON.parse(JSON.stringify(value || []));
  let metaSwitched = false;
  let cleanupFailures = 0;
  const cache = createStudentTeachingSummaryCache({
    tables,
    mkTable: async table => {
      if (!Array.isArray(tableRows[table])) tableRows[table] = [];
    },
    getCachedScan: async table => clone(tableRows[table] || []),
    put: async (table, id, row) => {
      const list = Array.isArray(tableRows[table]) ? tableRows[table] : [];
      const index = list.findIndex(item => String(item.id || '') === String(id || ''));
      const next = clone(row);
      tableRows[table] = index >= 0 ? list.map(item => String(item.id || '') === String(id || '') ? next : item) : [...list, next];
      if (table === tables.T_STUDENT_TEACHING_SUMMARY && id === STUDENT_TEACHING_SUMMARY_META_ID && String(row.status || '') === STUDENT_TEACHING_SUMMARY_READY && String(row.batchId || '') !== oldVersion) {
        metaSwitched = true;
      }
    },
    del: async (table, id) => {
      if (table === tables.T_STUDENT_TEACHING_SUMMARY && metaSwitched && String(id || '') !== STUDENT_TEACHING_SUMMARY_META_ID) {
        cleanupFailures += 1;
        if (cleanupFailures === 1) {
          throw new Error('cleanup failed after switch');
        }
      }
      tableRows[table] = (tableRows[table] || []).filter(row => String(row.id || '') !== String(id || ''));
    },
    logger: { error() {} }
  });

  await assert.rejects(
    () => cache.refreshStudentTeachingSummaryRows(),
    /cleanup failed after switch/
  );
  const leakedNewVersionRows = tableRows.ft_student_teaching_summary.filter(row => String(row.id || '').startsWith('__student_teaching_summary_version__:') && String(row.publishVersion || '') !== oldVersion);
  assert.deepStrictEqual(leakedNewVersionRows, [], '发布切换后失败不能残留新版本行');
  const readyRows = requireReadyStudentTeachingSummaryRows(tableRows.ft_student_teaching_summary);
  assert.deepStrictEqual(readyRows.map(row => row.studentId).sort(), ['old-student-1', 'old-student-2'], '清理阶段失败后必须恢复旧 ready 版本');
}

(async () => {
  await testReadySummaryReadDoesNotWaitForHungScan();
  await testKeepsReadyMetaWhenRefreshFails();
  await testKeepsServingReadyRowsWhileNextVersionIsWritten();
  await testRollsBackPartiallyWrittenRowsWhenRefreshFails();
  await testRestoresOldReadyMetaWhenCleanupFailsAfterSwitch();
  console.log('student teaching summary publish tests passed');
})().catch(error => {
  console.error(error && error.stack ? error.stack : String(error));
  process.exit(1);
});
