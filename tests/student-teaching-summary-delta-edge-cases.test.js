const assert = require('assert');
const { TEACHING_LESSON_DETAIL_SOURCE_VERSION } = require('../server/read-models/platform-metrics.js');
const {
  STUDENT_TEACHING_SUMMARY_META_ID,
  STUDENT_TEACHING_SUMMARY_READY,
  buildStudentTeachingSummaryBundleId,
  buildStudentTeachingSummaryBundleRow,
  buildStudentTeachingSummaryChecksum,
  buildStudentTeachingSummaryListBundleRow,
  buildVersionedStudentTeachingSummaryRow,
  studentTeachingSummaryBundleLogicalRows,
  syncStudentTeachingSummaryDelta
} = require('../server/read-models/student-teaching-summary-cache.js');

function clone(value) {
  return JSON.parse(JSON.stringify(value));
}

function summaryRow(id, patch = {}) {
  return {
    id,
    studentId: id,
    name: id,
    displayName: id,
    hasStudentProfile: true,
    isHistoricalStudentRoster: true,
    isActiveStudentRoster: false,
    packageListRows: [],
    detailPackageOrderRows: [],
    packageBalanceRemaining: 0,
    packageBalanceTotal: 0,
    detailPackageBalanceRemaining: 0,
    detailPackageBalanceTotal: 0,
    detailLessonRecordRows: [],
    detailRecentLessonDate: '',
    lastFormalLessonAt: '',
    completedLessons: 0,
    hasTrialAttended: false,
    hasFormalAttended: false,
    teachingLessonDetailSourceVersion: TEACHING_LESSON_DETAIL_SOURCE_VERSION,
    summaryUpdatedAt: '2026-09-13T00:00:00.000Z',
    updatedAt: '2026-09-13T00:00:00.000Z',
    ...patch
  };
}

function packagePatch(entitlementId, remainingLessons, patch = {}) {
  return {
    packageListRows: [{
      entitlementId,
      purchaseId: `${entitlementId}-purchase`,
      packageName: patch.packageName || '成人1v1 10课时',
      courseType: patch.courseType || '私教课',
      remainingLessons,
      totalLessons: 10,
      usedLessons: 10 - remainingLessons,
      unit: patch.unit || '节'
    }],
    detailPackageOrderRows: [{
      entitlementId,
      purchaseId: `${entitlementId}-purchase`,
      packageName: patch.packageName || '成人1v1 10课时',
      courseType: patch.courseType || '私教课',
      remainingLessons,
      totalLessons: 10,
      usedLessons: 10 - remainingLessons,
      unit: patch.unit || '节'
    }],
    packageBalanceRemaining: remainingLessons,
    packageBalanceTotal: 10,
    detailPackageBalanceRemaining: remainingLessons,
    detailPackageBalanceTotal: 10
  };
}

async function publishAndSync({ rows, previousSchedule = null, nextSchedule = null, changedEntitlements = [], changedLedgers = [], operationId }) {
  const version = `edge-before-${operationId}`;
  const tableRows = [
    {
      id: STUDENT_TEACHING_SUMMARY_META_ID,
      kind: 'student-teaching-summary-meta',
      status: STUDENT_TEACHING_SUMMARY_READY,
      rowCount: rows.length,
      generation: 1,
      batchId: version,
      activeVersion: version,
      sourceSnapshotAt: '2026-09-13T00:00:00.000Z',
      completedAt: '2026-09-13T00:00:01.000Z',
      checksum: buildStudentTeachingSummaryChecksum(rows)
    },
    ...rows.map(row => buildVersionedStudentTeachingSummaryRow(row, version)),
    buildStudentTeachingSummaryBundleRow(rows, version),
    buildStudentTeachingSummaryListBundleRow(rows, version)
  ];
  const getCachedRow = async (table, id) => clone(tableRows.find(row => String(row.id || '') === String(id || '')) || null);
  const put = async (table, id, row) => {
    const index = tableRows.findIndex(item => String(item.id || '') === String(id || ''));
    if (index >= 0) tableRows[index] = clone(row);
    else tableRows.push(clone(row));
  };
  const result = await syncStudentTeachingSummaryDelta({
    tableName: 'ft_student_teaching_summary',
    getCachedRow,
    put,
    previousSchedule,
    nextSchedule,
    changedEntitlements,
    changedLedgers,
    operationId,
    now: new Date('2026-09-13T01:00:00.000Z')
  });
  assert.strictEqual(result.synced, true, `${operationId} should point-sync successfully`);
  const meta = tableRows.find(row => row.id === STUDENT_TEACHING_SUMMARY_META_ID);
  return studentTeachingSummaryBundleLogicalRows(tableRows.find(row => row.id === buildStudentTeachingSummaryBundleId(meta.activeVersion)));
}

async function run() {
  {
    const rows = [summaryRow('stu-multi', packagePatch('ent-multi', 10))];
    const nextRows = await publishAndSync({
      rows,
      nextSchedule: { id: 'sch-multi', studentIds: ['stu-multi'], entitlementId: 'ent-multi', courseType: '私教课', lessonCount: 2, status: '已完成', startTime: '2026-07-15 10:00', endTime: '2026-07-15 12:00' },
      changedEntitlements: [{ id: 'ent-multi', studentId: 'stu-multi', purchaseId: 'ent-multi-purchase', packageName: '成人1v1 10课时', courseType: '私教课', remainingLessons: 8, totalLessons: 10, usedLessons: 2 }],
      changedLedgers: [{ id: 'ledger-multi', scheduleId: 'sch-multi', entitlementId: 'ent-multi', studentId: 'stu-multi', lessonDelta: -2, reason: '排课消课', createdAt: '2026-07-15T12:00:00.000Z' }],
      operationId: 'multi-lesson'
    });
    const row = nextRows.find(item => item.studentId === 'stu-multi');
    assert.strictEqual(row.completedLessons, 2, 'multi-hour formal schedule should add the full lesson delta');
    assert.strictEqual(row.packageBalanceRemaining, 8, 'multi-hour formal schedule should update package balance');
  }

  {
    const rows = [
      summaryRow('stu-owner', packagePatch('ent-shared', 10)),
      summaryRow('stu-used-by')
    ];
    const nextRows = await publishAndSync({
      rows,
      nextSchedule: { id: 'sch-shared', studentIds: ['stu-used-by'], entitlementId: 'ent-shared', courseType: '私教课', lessonCount: 1, status: '已完成', startTime: '2026-07-16 10:00', packageOwnerStudentId: 'stu-owner', usedByStudentId: 'stu-used-by' },
      changedEntitlements: [{ id: 'ent-shared', studentId: 'stu-owner', usedByStudentId: 'stu-used-by', packageOwnerStudentId: 'stu-owner', purchaseId: 'ent-shared-purchase', packageName: '成人1v1 10课时', courseType: '私教课', remainingLessons: 9, totalLessons: 10, usedLessons: 1 }],
      changedLedgers: [{ id: 'ledger-shared', scheduleId: 'sch-shared', entitlementId: 'ent-shared', studentId: 'stu-used-by', usedByStudentId: 'stu-used-by', packageOwnerStudentId: 'stu-owner', lessonDelta: -1, reason: '授权使用', createdAt: '2026-07-16T10:00:00.000Z' }],
      operationId: 'authorized-use'
    });
    const owner = nextRows.find(item => item.studentId === 'stu-owner');
    const usedBy = nextRows.find(item => item.studentId === 'stu-used-by');
    assert.strictEqual(owner.packageBalanceRemaining, 9, 'authorized use should reduce the package owner balance');
    assert.strictEqual(owner.completedLessons, 0, 'authorized use should not add a lesson record to the package owner');
    assert.strictEqual(usedBy.completedLessons, 1, 'authorized use should add the attended lesson to the actual student');
    assert.strictEqual(usedBy.detailLessonRecordRows[0]?.packageOwnerStudentId, 'stu-owner');
  }

  {
    const rows = [summaryRow('stu-small', packagePatch('ent-small', 10, { packageName: '小班训练营10次', courseType: '小班课', unit: '次' }))];
    const nextRows = await publishAndSync({
      rows,
      nextSchedule: { id: 'sch-small', studentIds: ['stu-small'], entitlementId: 'ent-small', courseType: '小班课', lessonCount: 1, status: '已完成', startTime: '2026-07-17 10:00' },
      changedEntitlements: [{ id: 'ent-small', studentId: 'stu-small', purchaseId: 'ent-small-purchase', packageName: '小班训练营10次', courseType: '小班课', remainingLessons: 9, totalLessons: 10, usedLessons: 1 }],
      changedLedgers: [{ id: 'ledger-small', scheduleId: 'sch-small', entitlementId: 'ent-small', studentId: 'stu-small', lessonDelta: -1, reason: '小班课消课', createdAt: '2026-07-17T10:00:00.000Z' }],
      operationId: 'small-class'
    });
    const row = nextRows.find(item => item.studentId === 'stu-small');
    assert.strictEqual(row.detailPackageOrderRows[0].unit, '次', 'small class package unit should stay count-based');
    assert.strictEqual(row.completedLessons, 1);
  }

  {
    const rows = [summaryRow('stu-trial')];
    const nextRows = await publishAndSync({
      rows,
      nextSchedule: { id: 'sch-trial', studentIds: ['stu-trial'], courseType: '体验课', experienceType: '私教体验课', lessonCount: 1, status: '已完成', startTime: '2026-07-18 10:00' },
      changedEntitlements: [],
      changedLedgers: [],
      operationId: 'trial-lesson'
    });
    const row = nextRows.find(item => item.studentId === 'stu-trial');
    assert.strictEqual(row.hasTrialAttended, true, 'trial lesson should mark trial attendance');
    assert.strictEqual(row.completedLessons, 0, 'trial lesson must not be counted as formal completed lessons');
    assert.strictEqual(row.hasFormalAttended, false, 'trial lesson must not mark formal attendance');
  }

  {
    const rows = [summaryRow('stu-companion')];
    const nextRows = await publishAndSync({
      rows,
      nextSchedule: { id: 'sch-companion', studentIds: ['stu-companion'], courseType: '陪打课', lessonCount: 1, status: '已完成', startTime: '2026-07-19 10:00' },
      changedEntitlements: [],
      changedLedgers: [{ id: 'ledger-companion', scheduleId: 'sch-companion', studentId: 'stu-companion', courseType: '陪打课', lessonDelta: -1, reason: '陪打课记录', createdAt: '2026-07-19T10:00:00.000Z' }],
      operationId: 'companion-lesson'
    });
    const row = nextRows.find(item => item.studentId === 'stu-companion');
    assert.strictEqual(row.detailLessonRecordRows.length, 0, 'companion lessons should stay out of teaching package lesson records');
    assert.strictEqual(row.completedLessons, 0, 'companion lessons must not count as formal lessons');
  }
}

run()
  .then(() => console.log('student teaching summary delta edge case tests passed'))
  .catch(error => {
    console.error(error && error.stack ? error.stack : String(error));
    process.exit(1);
  });
