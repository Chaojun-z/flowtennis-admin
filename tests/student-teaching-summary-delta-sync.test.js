const assert = require('assert');
const zlib = require('zlib');
const { TEACHING_LESSON_DETAIL_SOURCE_VERSION } = require('../server/read-models/platform-metrics.js');
const { createCorePageDataRoutes } = require('../server/page-data/core-pages.js');
const {
  STUDENT_TEACHING_SUMMARY_META_ID,
  STUDENT_TEACHING_SUMMARY_READY,
  buildStudentTeachingSummaryBundleId,
  buildStudentTeachingSummaryBundleRow,
  buildStudentTeachingSummaryChecksum,
  buildStudentTeachingSummaryListBundleId,
  buildStudentTeachingSummaryListBundleRow,
  buildVersionedStudentTeachingSummaryRow,
  readReadyStudentTeachingSummaryRows,
  readReadyStudentTeachingSummaryListRows,
  studentTeachingSummaryBundleLogicalRows,
  syncStudentTeachingSummaryDelta
} = require('../server/read-models/student-teaching-summary-cache.js');

function clone(value) {
  return JSON.parse(JSON.stringify(value));
}

function readGzipRows(row) {
  return JSON.parse(zlib.gunzipSync(Buffer.from(row.rowsGzipBase64, 'base64')).toString('utf8'));
}

function buildMeta(version, rows, previousActiveVersion = '') {
  return {
    id: STUDENT_TEACHING_SUMMARY_META_ID,
    kind: 'student-teaching-summary-meta',
    status: STUDENT_TEACHING_SUMMARY_READY,
    generation: 1,
    rowCount: rows.length,
    batchId: version,
    activeVersion: version,
    previousActiveVersion,
    sourceSnapshotAt: '2026-09-13T00:00:00.000Z',
    completedAt: '2026-09-13T00:00:01.000Z',
    checksum: buildStudentTeachingSummaryChecksum(rows),
    updatedAt: '2026-09-13T00:00:01.000Z'
  };
}

function buildSummaryRow({
  id,
  name,
  notes,
  leadDate,
  entitlementId,
  remainingLessons,
  completedLessons,
  lessonRows
}) {
  return {
    id,
    studentId: id,
    name,
    displayName: name,
    source: '老学员转介绍',
    campus: '顺义马坡',
    primaryCoach: '岳教练',
    notes,
    profileNote: '保留抽屉备注',
    leadDate,
    createdAt: '2026-01-01T00:00:00.000Z',
    type: '成人',
    studentStage: 'formal',
    hasStudentProfile: true,
    isHistoricalStudentRoster: true,
    isActiveStudentRoster: true,
    packageListRows: [{
      entitlementId,
      purchaseId: `${entitlementId}-purchase`,
      packageName: '1v1私教课 · 成人 · 10课时',
      courseType: '私教课',
      remainingLessons,
      totalLessons: 10,
      usedLessons: 10 - remainingLessons,
      purchaseDate: '2026-01-01',
      statusText: '正常',
      unit: '节'
    }],
    detailPackageOrderRows: [{
      entitlementId,
      purchaseId: `${entitlementId}-purchase`,
      packageName: '1v1私教课 · 成人 · 10课时',
      courseType: '私教课',
      remainingLessons,
      totalLessons: 10,
      usedLessons: 10 - remainingLessons,
      purchaseDate: '2026-01-01',
      statusText: '正常',
      unit: '节'
    }],
    packageListText: `1v1私教课 · 成人 · 10课时 ${remainingLessons}/10`,
    packageBalanceRemaining: remainingLessons,
    packageBalanceTotal: 10,
    packageBalanceText: `${remainingLessons}/10`,
    packageBalancePercent: remainingLessons * 10,
    detailPackageBalanceRemaining: remainingLessons,
    detailPackageBalanceTotal: 10,
    detailPackageBalanceText: `${remainingLessons}/10`,
    detailPackageBalancePercent: remainingLessons * 10,
    packagePurchaseDate: '2026-01-01',
    detailLessonRecordRows: lessonRows,
    detailRecentLessonDate: lessonRows[0]?.time?.slice(0, 10) || '',
    lastFormalLessonAt: lessonRows[0]?.time?.slice(0, 10) || '',
    cumulativeCoursePaidAmount: 4000,
    cumulativeCoursePaidText: '¥4,000',
    completedLessons,
    packageStatusLabel: '课包有余额',
    paymentModeLabel: '课包学员',
    activityStatusLabel: '31-90天活跃',
    lessonVolumeLabel: '已上课',
    studentStatusLabel: '正式学员',
    hasTrialAttended: false,
    hasFormalAttended: completedLessons > 0,
    teachingLessonDetailSourceVersion: TEACHING_LESSON_DETAIL_SOURCE_VERSION,
    summaryUpdatedAt: '2026-09-13T00:00:01.000Z',
    updatedAt: '2026-09-13T00:00:01.000Z'
  };
}

async function main() {
  const oldVersion = 'student-teaching-summary-delta-before';
  const oldSchedule = {
    id: 'schedule-715',
    status: '已排课',
    settlementType: 'package',
    studentIds: ['student-wrong'],
    entitlementIds: ['entitlement-wrong'],
    entitlementId: 'entitlement-wrong',
    courseType: '私教课',
    packageName: '1v1私教课 · 成人 · 10课时',
    coach: '岳教练',
    campus: '顺义马坡',
    venue: '3号场',
    startTime: '2026-07-15 15:00',
    endTime: '2026-07-15 16:00',
    lessonCount: 1
  };
  const nextSchedule = {
    ...oldSchedule,
    studentIds: ['student-correct'],
    studentName: '李先生',
    entitlementIds: ['entitlement-correct'],
    entitlementId: 'entitlement-correct'
  };
  const oldRows = [
    buildSummaryRow({
      id: 'student-wrong',
      name: '李俊泽',
      notes: '线索池备注不能丢',
      leadDate: '2026-01-08',
      entitlementId: 'entitlement-wrong',
      remainingLessons: 8,
      completedLessons: 2,
      lessonRows: [{
        kind: 'ledger',
        scheduleId: 'schedule-715',
        time: '2026-07-15 15:00-16:00',
        courseType: '私教课',
        packageName: '1v1私教课 · 成人 · 10课时',
        lessonDelta: -1,
        countAsCompletedLesson: true
      }]
    }),
    buildSummaryRow({
      id: 'student-correct',
      name: '李先生',
      notes: '正确学员的备注',
      leadDate: '2026-02-08',
      entitlementId: 'entitlement-correct',
      remainingLessons: 9,
      completedLessons: 1,
      lessonRows: []
    }),
    buildSummaryRow({
      id: 'student-untouched',
      name: '不相关学员',
      notes: '不应被本次点更新改动',
      leadDate: '2026-03-08',
      entitlementId: 'entitlement-untouched',
      remainingLessons: 6,
      completedLessons: 4,
      lessonRows: []
    })
  ];
  const tableRows = [
    buildMeta(oldVersion, oldRows),
    ...oldRows.map(row => buildVersionedStudentTeachingSummaryRow(row, oldVersion)),
    buildStudentTeachingSummaryBundleRow(oldRows, oldVersion),
    buildStudentTeachingSummaryListBundleRow(oldRows, oldVersion)
  ];
  const calls = { gets: [], puts: [], scans: [] };
  const getCachedRow = async (table, id) => {
    calls.gets.push({ table, id });
    return clone(tableRows.find(row => String(row.id || '') === String(id || '')) || null);
  };
  const put = async (table, id, row) => {
    calls.puts.push({ table, id });
    const index = tableRows.findIndex(item => String(item.id || '') === String(id || ''));
    if (index >= 0) tableRows[index] = clone(row);
    else tableRows.push(clone(row));
  };

  const result = await syncStudentTeachingSummaryDelta({
    tableName: 'ft_student_teaching_summary',
    getCachedRow,
    put,
    previousSchedule: oldSchedule,
    nextSchedule,
    changedEntitlements: [
      {
        id: 'entitlement-wrong',
        studentId: 'student-wrong',
        purchaseId: 'entitlement-wrong-purchase',
        packageName: '1v1私教课 · 成人 · 10课时',
        courseType: '私教课',
        totalLessons: 10,
        remainingLessons: 9,
        usedLessons: 1,
        status: 'active'
      },
      {
        id: 'entitlement-correct',
        studentId: 'student-correct',
        purchaseId: 'entitlement-correct-purchase',
        packageName: '1v1私教课 · 成人 · 10课时',
        courseType: '私教课',
        totalLessons: 10,
        remainingLessons: 8,
        usedLessons: 2,
        status: 'active'
      }
    ],
    changedLedgers: [
      {
        id: 'ledger-return-715',
        scheduleId: 'schedule-715',
        entitlementId: 'entitlement-wrong',
        studentId: 'student-wrong',
        lessonDelta: 1,
        action: 'return',
        reason: '编辑排课退回旧权益',
        createdAt: '2026-09-13T00:00:02.000Z'
      },
      {
        id: 'ledger-consume-715',
        scheduleId: 'schedule-715',
        entitlementId: 'entitlement-correct',
        studentId: 'student-correct',
        lessonDelta: -1,
        action: 'consume',
        reason: '编辑排课消课',
        createdAt: '2026-09-13T00:00:03.000Z'
      }
    ],
    now: new Date('2026-09-13T00:00:04.000Z'),
    operationId: 'op-schedule-edit-715'
  });

  assert.strictEqual(result.synced, true);
  assert.deepStrictEqual(calls.scans, [], '排课编辑点同步不能扫描事实表或摘要整表');
  assert.ok(calls.gets.some(item => item.id === STUDENT_TEACHING_SUMMARY_META_ID));
  assert.ok(calls.gets.some(item => item.id === buildStudentTeachingSummaryBundleId(oldVersion)));

  const nextMeta = tableRows.find(row => row.id === STUDENT_TEACHING_SUMMARY_META_ID);
  assert.strictEqual(nextMeta.status, STUDENT_TEACHING_SUMMARY_READY, '点同步不能把 ready 指针改成 pending/failed');
  assert.notStrictEqual(nextMeta.activeVersion, oldVersion, '成功点同步应发布新版本指针，不覆盖旧版本');
  assert.strictEqual(nextMeta.previousActiveVersion, oldVersion, '新版本必须保留旧版本回退指针');
  assert.strictEqual(nextMeta.rowCount, oldRows.length, '点同步不能改变摘要总行数');

  const bundleRows = studentTeachingSummaryBundleLogicalRows(
    tableRows.find(row => row.id === buildStudentTeachingSummaryBundleId(nextMeta.activeVersion))
  );
  const wrong = bundleRows.find(row => row.studentId === 'student-wrong');
  const correct = bundleRows.find(row => row.studentId === 'student-correct');
  const untouched = bundleRows.find(row => row.studentId === 'student-untouched');
  assert.strictEqual(wrong.packageBalanceRemaining, 9, '旧学员课包应退回 1 节');
  assert.strictEqual(wrong.detailLessonRecordRows.some(row => row.scheduleId === 'schedule-715'), false, '旧学员不能继续挂着这节排课记录');
  assert.strictEqual(correct.packageBalanceRemaining, 8, '正确学员课包应扣减 1 节');
  assert.strictEqual(correct.detailLessonRecordRows.filter(row => row.scheduleId === 'schedule-715').length, 1, '正确学员必须出现这节上课记录');
  assert.strictEqual(wrong.notes, '线索池备注不能丢', '旧摘要字段 notes 必须原样保留');
  assert.strictEqual(wrong.leadDate, '2026-01-08', '旧摘要字段 leadDate 必须原样保留');
  assert.strictEqual(correct.notes, '正确学员的备注', '正确学员 notes 必须原样保留');
  assert.strictEqual(untouched.notes, '不应被本次点更新改动', '未受影响学员字段不能被重建覆盖');
  assert.strictEqual(nextMeta.checksum, buildStudentTeachingSummaryChecksum(bundleRows));

  const listBundle = tableRows.find(row => row.id === buildStudentTeachingSummaryListBundleId(nextMeta.activeVersion));
  const listRows = readGzipRows(listBundle);
  assert.strictEqual(listRows.length, oldRows.length, '轻量列表包行数必须稳定');
  assert.strictEqual(listRows.find(row => row.studentId === 'student-wrong').notes, '线索池备注不能丢');
  assert.strictEqual(listRows.find(row => row.studentId === 'student-wrong').leadDate, '2026-01-08');

  const untouchedPutIds = calls.puts
    .map(item => item.id)
    .filter(id => String(id).includes(':student-untouched'));
  assert.deepStrictEqual(untouchedPutIds, [], '点同步不能重写未受影响学员的版本行');

  const readersWithMissingNewBundles = {
    getCachedRow: async (table, id) => {
      if (id === buildStudentTeachingSummaryBundleId(nextMeta.activeVersion)
        || id === buildStudentTeachingSummaryListBundleId(nextMeta.activeVersion)) return null;
      if (id === buildVersionedStudentTeachingSummaryRow(untouched, oldVersion).id) return null;
      return getCachedRow(table, id);
    }
  };
  const fallbackRows = await readReadyStudentTeachingSummaryRows({
    tableName: 'ft_student_teaching_summary',
    getCachedRow: readersWithMissingNewBundles.getCachedRow,
    getCachedScan: async () => {
      throw new Error('active snapshot fallback must not scan the table');
    },
    scanByIdPrefix: async () => {
      throw new Error('active snapshot fallback must not scan version rows');
    }
  });
  assert.deepStrictEqual(fallbackRows.map(row => row.studentId), oldRows.map(row => row.studentId), '新版本发布包暂时不可读时必须继续返回旧 ready 快照');
  const fallbackListRows = await readReadyStudentTeachingSummaryListRows({
    tableName: 'ft_student_teaching_summary',
    getCachedRow: readersWithMissingNewBundles.getCachedRow,
    getCachedScan: async () => {
      throw new Error('active list snapshot fallback must not scan the table');
    },
    scanByIdPrefix: async () => {
      throw new Error('active list snapshot fallback must not scan version rows');
    }
  });
  assert.deepStrictEqual(fallbackListRows.map(row => row.studentId), oldRows.map(row => row.studentId), '新轻量列表包暂时不可读时必须继续返回旧 ready 快照');

  const coreHandler = createCorePageDataRoutes({
    init: async () => {},
    sendJson: (res, body, status = 200) => {
      res.statusCode = status;
      res.body = body;
      return body;
    },
    getCachedRow: async (table, id) => {
      if (table === 'students' && id === 'student-untouched') {
        return { id, name: '不相关学员', notes: '不应被本次点更新改动' };
      }
      return readersWithMissingNewBundles.getCachedRow(table, id);
    },
    tables: {
      T_STUDENTS: 'students',
      T_STUDENT_TEACHING_SUMMARY: 'ft_student_teaching_summary'
    }
  });
  const detailResponse = {};
  await coreHandler({
    path: '/page-data/student-detail',
    method: 'GET',
    user: { role: 'admin' },
    res: detailResponse,
    query: new URLSearchParams('id=student-untouched')
  });
  assert.strictEqual(detailResponse.statusCode, 200, '未受影响学员抽屉缺少新版本逐条行时仍必须正常返回');
  assert.strictEqual(detailResponse.body.detailStudentView.notes, '不应被本次点更新改动');
  assert.strictEqual(detailResponse.body.detailStudentView.packageBalanceRemaining, 6);

  const failureTableName = 'ft_student_teaching_summary_delta_failure';
  const failureRows = [
    buildMeta(oldVersion, oldRows),
    ...oldRows.map(row => buildVersionedStudentTeachingSummaryRow(row, oldVersion)),
    buildStudentTeachingSummaryBundleRow(oldRows, oldVersion),
    buildStudentTeachingSummaryListBundleRow(oldRows, oldVersion)
  ];
  let failedMetaWrite = false;
  const failureGetCachedRow = async (table, id) => clone(failureRows.find(row => String(row.id || '') === String(id || '')) || null);
  const failurePut = async (table, id, row) => {
    if (String(id).startsWith('__student_teaching_summary_list_bundle__:')) {
      failedMetaWrite = true;
      throw new Error('模拟轻量列表包写入失败');
    }
    const index = failureRows.findIndex(item => String(item.id || '') === String(id || ''));
    if (index >= 0) failureRows[index] = clone(row);
    else failureRows.push(clone(row));
  };
  const failed = await syncStudentTeachingSummaryDelta({
    tableName: failureTableName,
    getCachedRow: failureGetCachedRow,
    put: failurePut,
    previousSchedule: oldSchedule,
    nextSchedule,
    changedEntitlements: [],
    changedLedgers: [],
    now: new Date('2026-09-13T00:00:04.000Z'),
    operationId: 'op-failure'
  });
  assert.strictEqual(failed.synced, false, '发布包写失败时点同步必须报告失败');
  assert.strictEqual(failedMetaWrite, true);
  assert.strictEqual(failureRows.find(row => row.id === STUDENT_TEACHING_SUMMARY_META_ID).activeVersion, oldVersion, '发布失败不能切换 activeVersion');
  console.log('student teaching summary delta sync tests passed');
}

main().catch(error => {
  console.error(error && error.stack ? error.stack : String(error));
  process.exit(1);
});
