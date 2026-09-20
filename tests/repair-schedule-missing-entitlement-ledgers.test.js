const assert = require('assert');

const repair = require('../scripts/repair-schedule-missing-entitlement-ledgers-20260919.js');
const rollback = require('../scripts/revert-voided-schedule-repair-20260919.js');
const summaryCache = require('../server/read-models/student-teaching-summary-cache.js');

const activeIndexSnapshot = { id: 'student-1', entitlementIds: ['ent-1'], operationId: 'before' };
assert.strictEqual(rollback.indexRowNeedsRestore(activeIndexSnapshot, { ...activeIndexSnapshot }), false, '活跃课包索引与写前快照一致时不应重复恢复');
assert.strictEqual(rollback.indexRowNeedsRestore({ ...activeIndexSnapshot, operationId: 'repair' }, activeIndexSnapshot), true, '索引残留本次操作标记时必须恢复写前快照');

const deps = {
  resolveScheduleEntitlementDeltas(schedule, entitlements) {
    const entitlementId = schedule.entitlementId || schedule.entitlementIds?.[0];
    if (!entitlementId) return [];
    return [{
      studentId: schedule.studentId,
      entitlementId,
      delta: Number(schedule.lessonCount || 1)
    }];
  },
  validateEntitlementForSchedule(entitlement, schedule) {
    if (entitlement.studentId !== schedule.studentId) throw new Error('课包所属学员不匹配');
  },
  scheduleEntitlementUsageContext(entitlement, schedule) {
    return {
      packageOwnerStudentId: entitlement.studentId,
      usedByStudentId: schedule.studentId
    };
  },
  applyEntitlementLessonDelta(entitlement, delta, now) {
    const usedLessons = Number(entitlement.usedLessons || 0) - Number(delta);
    return {
      ...entitlement,
      usedLessons,
      remainingLessons: Number(entitlement.totalLessons) - usedLessons,
      status: usedLessons >= Number(entitlement.totalLessons) ? 'depleted' : 'active',
      updatedAt: now
    };
  }
};

function schedule(id, entitlementId, overrides = {}) {
  return {
    id,
    studentId: 'student-1',
    studentIds: ['student-1'],
    entitlementId,
    settlementType: 'package',
    courseType: '私教课',
    lessonCount: 1,
    status: '已结束',
    startTime: '2026-08-14 10:00',
    ...overrides
  };
}

const now = '2026-09-19T10:00:00.000Z';

const data = {
  schedules: [schedule('schedule-1', 'ent-1'), schedule('schedule-2', 'ent-1')],
  entitlements: [{
    id: 'ent-1',
    studentId: 'student-1',
    totalLessons: 2,
    usedLessons: 0,
    remainingLessons: 2,
    status: 'active'
  }],
  entitlementLedger: [],
  authorizations: [],
  activeEntitlementIndex: [{ id: 'student-1', studentId: 'student-1', entitlementIds: ['ent-1'] }]
};

const plan = repair.buildPlan(data, deps, now);
assert.strictEqual(plan.repairable.length, 2, '同一个课包对应的两条历史排课都应进入修复计划');
assert.strictEqual(plan.entitlementPuts[0].after.usedLessons, 2, '同一个课包的多条排课必须累计扣减');
assert.strictEqual(plan.entitlementPuts[0].after.remainingLessons, 0, '累计扣减后余额必须为 0');
assert.strictEqual(typeof repair.buildActiveEntitlementIndexRow, 'function', '必须提供按最终课包余额重建活跃课包索引的函数');

const indexAfter = repair.buildActiveEntitlementIndexRow({
  studentId: 'student-1',
  before: data.activeEntitlementIndex[0],
  entitlements: [plan.entitlementPuts[0].after],
  now
});
assert.deepStrictEqual(indexAfter.entitlementIds, [], '课包耗尽后活跃课包索引不得保留该课包');

const blocked = repair.buildPlan({
  schedules: [schedule('direct-1', '', { settlementType: 'direct' }), schedule('missing-1', 'missing-ent')],
  entitlements: data.entitlements,
  entitlementLedger: [],
  authorizations: [],
  activeEntitlementIndex: []
}, deps, now);
assert.strictEqual(blocked.repairable.length, 0, '直接收款和找不到课包的排课不得被误修');
assert.strictEqual(blocked.blocked.length, 1, '找不到课包的排课必须进入阻塞清单');

const voided = repair.buildPlan({
  schedules: [schedule('voided-duplicate', 'ent-1', { status: 'voided' })],
  entitlements: data.entitlements,
  entitlementLedger: [],
  authorizations: [],
  activeEntitlementIndex: []
}, deps, now);
assert.strictEqual(voided.repairable.length, 0, '已作废排课不得补扣课包或生成消课流水');
assert.strictEqual(voided.ledgerPuts.length, 0, '已作废排课不得生成消课流水');

const voidedLegacyStatus = repair.buildPlan({
  schedules: [schedule('voided-legacy-status', 'ent-1', { status: '', systemStatus: 'voided' })],
  entitlements: data.entitlements,
  entitlementLedger: [],
  authorizations: [],
  activeEntitlementIndex: []
}, deps, now);
assert.strictEqual(voidedLegacyStatus.repairable.length, 0, '兼容状态字段标记为作废时也不得补扣');

assert.strictEqual(typeof repair.syncStudentTeachingSummaryForPlan, 'function', '必须提供教学摘要同步入口');

(async () => {
  const tableRows = new Map();
  const encodeRow = row => ({
    primaryKey: [{ value: row.id }],
    attributes: Object.entries(row)
      .filter(([key]) => key !== 'id')
      .map(([columnName, value]) => ({
        columnName,
        columnValue: typeof value === 'object' ? JSON.stringify(value) : String(value ?? '')
      }))
  });
  const client = {
    getRow(request, callback) {
      const id = request.primaryKey[0].id;
      callback(null, { row: tableRows.has(`${request.tableName}:${id}`) ? encodeRow(tableRows.get(`${request.tableName}:${id}`)) : null });
    },
    putRow(request, callback) {
      const id = request.primaryKey[0].id;
      const row = { id };
      for (const column of request.attributeColumns || []) {
        const value = column[Object.keys(column)[0]];
        try { row[Object.keys(column)[0]] = JSON.parse(value); } catch { row[Object.keys(column)[0]] = value; }
      }
      tableRows.set(`${request.tableName}:${id}`, row);
      callback(null, {});
    }
  };
  const summaryRow = {
    id: 'student-1',
    studentId: 'student-1',
    displayName: '测试学员',
    completedLessons: 0,
    detailLessonRecordRows: [],
    detailPackageOrderRows: [],
    packageListRows: [],
    hasTrialAttended: false,
    hasTrialExperience: false,
    hasFormalAttended: false,
    isHistoricalStudentRoster: true,
    isActiveStudentRoster: true
  };
  const summaryVersion = 'summary-before-repair';
  const summaryMeta = summaryCache.buildStudentTeachingSummaryMetaRow({
    status: 'ready',
    rowCount: 1,
    sourceTable: 'ft_schedule',
    sourceOp: 'test',
    sourceId: 'test',
    batchId: 'test',
    activeVersion: summaryVersion,
    sourceSnapshotAt: now,
    completedAt: now,
    checksum: summaryCache.buildStudentTeachingSummaryChecksum([summaryRow]),
    updatedAt: now
  });
  const summaryBundle = summaryCache.buildStudentTeachingSummaryBundleRow([summaryRow], summaryVersion);
  const summaryListBundle = summaryCache.buildStudentTeachingSummaryListBundleRow([summaryRow], summaryVersion);
  for (const row of [
    summaryMeta,
    summaryBundle,
    summaryListBundle
  ]) tableRows.set(`ft_student_teaching_summary:${row.id}`, row);
  tableRows.set('ft_student_teaching_summary:student-1', summaryRow);

  const syncResults = await repair.syncStudentTeachingSummaryForPlan({ client, plan, now });
  assert.strictEqual(syncResults.length, 2, '每条修复排课都必须同步教学摘要');
  assert.ok(syncResults.every(result => result.synced), '教学摘要同步结果必须全部成功');
  const finalMeta = tableRows.get(`ft_student_teaching_summary:${summaryCache.STUDENT_TEACHING_SUMMARY_META_ID}`);
  assert.notStrictEqual(finalMeta.activeVersion, summaryVersion, '教学摘要必须切换到新发布版本');
  const finalBundle = tableRows.get(`ft_student_teaching_summary:${summaryCache.buildStudentTeachingSummaryBundleId(finalMeta.activeVersion)}`);
  const finalRows = summaryCache.studentTeachingSummaryBundleLogicalRows(finalBundle);
  const finalStudent = finalRows.find(row => row.studentId === 'student-1');
  assert.strictEqual(finalStudent.detailLessonRecordRows.length, 2, '重复执行摘要同步不得重复增加同一排课记录');
  console.log('repair schedule missing entitlement ledgers tests passed');
})().catch(error => {
  console.error(error?.stack || String(error));
  process.exit(1);
});
