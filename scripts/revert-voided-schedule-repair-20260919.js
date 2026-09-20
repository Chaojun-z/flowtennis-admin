#!/usr/bin/env node

const fs = require('fs');
const path = require('path');
const { isDeepStrictEqual } = require('util');
const TableStore = require('tablestore');
const { loadRuntimeEnv } = require('./lib/runtime-env');
const {
  createClientFromEnv,
  getRow,
  scanTable,
  deleteRow
} = require('./lib/staging-data-store');
const {
  parseWriteFlags,
  assertProductionWriteTarget,
  assertProductionWriteTrace
} = require('./lib/production-write-guard');
const {
  syncStudentTeachingSummaryDelta,
  buildStudentTeachingSummaryBundleId,
  studentTeachingSummaryBundleLogicalRows
} = require('../server/read-models/student-teaching-summary-cache');

const ROOT = path.join(__dirname, '..');
const OPERATION_ID = 'revert-voided-schedule-repair-20260919';
const BATCH_ID = `batch-${OPERATION_ID}`;
const BAD_OPERATION_ID = 'repair-confirmed-direct-and-package-schedule-ledgers-20260919';
const REPORT_DIR = path.join(ROOT, 'offline-reports');
const BEFORE_PATH = path.join(REPORT_DIR, 'repair-confirmed-direct-and-package-schedule-ledgers-20260919-before.json');
const TABLES = {
  schedule: 'ft_schedule',
  entitlement: 'ft_entitlements',
  ledger: 'ft_entitlement_ledger',
  summary: 'ft_student_teaching_summary'
};
const TARGET = {
  scheduleId: 'cxe-thirdparty-202604-schedule-41aaaa53ec4a',
  entitlementId: 'private_lesson_csv_import_20260519_BATCH2_15_LIVE:entitlement:黄总:initial:2026-01-06',
  studentId: 'seed-student-002'
};

function text(value) {
  return String(value ?? '').trim();
}

function reportPath(mode) {
  return path.join(REPORT_DIR, `${OPERATION_ID}-${mode}.json`);
}

function updateRowExact(client, tableName, before = {}, after = {}) {
  const beforeColumns = new Set(Object.keys(before).filter(key => key !== 'id'));
  const afterColumns = new Set(Object.keys(after).filter(key => key !== 'id'));
  const deleteAll = [...beforeColumns].filter(key => !afterColumns.has(key));
  const put = [...afterColumns].map(key => ({
    [key]: typeof after[key] === 'object' ? JSON.stringify(after[key]) : String(after[key] ?? '')
  }));
  const updates = [];
  if (put.length) updates.push({ PUT: put });
  if (deleteAll.length) updates.push({ DELETE_ALL: deleteAll });
  return new Promise((resolve, reject) => {
    client.updateRow({
      tableName,
      condition: new TableStore.Condition(TableStore.RowExistenceExpectation.EXPECT_EXIST, null),
      primaryKey: [{ id: String(after.id || before.id) }],
      updateOfAttributeColumns: updates
    }, (error, data) => error ? reject(error) : resolve(data));
  });
}

function loadBeforeSnapshot() {
  if (!fs.existsSync(BEFORE_PATH)) throw new Error(`缺少写入前备份：${BEFORE_PATH}`);
  const backup = JSON.parse(fs.readFileSync(BEFORE_PATH, 'utf8'));
  const schedule = (backup.schedules || []).find(row => text(row.id) === TARGET.scheduleId);
  const entitlement = (backup.entitlements || []).find(row => text(row.id) === TARGET.entitlementId);
  const activeIndexRow = (backup.activeIndexRows || []).find(row => text(row.studentId || row.id) === 'seed-student-003');
  if (!schedule || !entitlement || !activeIndexRow) throw new Error('写入前备份中找不到目标排课、课包或活跃课包索引');
  return { schedule, entitlement, activeIndexRow };
}

function indexRowNeedsRestore(current = null, before = null) {
  return !current || !before || !isDeepStrictEqual(current, before);
}

function findBadLedgers(rows = []) {
  return rows.filter(row => (
    text(row.operationId) === BAD_OPERATION_ID
    && text(row.scheduleId) === TARGET.scheduleId
    && text(row.entitlementId) === TARGET.entitlementId
    && text(row.studentId || row.usedByStudentId) === TARGET.studentId
    && Number(row.lessonDelta) === -1
  ));
}

function assertPreconditions({ schedule, entitlement, badLedgers, before }) {
  if (!schedule || text(schedule.status).toLowerCase() !== 'voided') throw new Error('停止：目标排课已不是已作废状态');
  if (Number(before.entitlement.usedLessons) !== 11 || Number(before.entitlement.remainingLessons) !== 1) throw new Error('停止：写入前备份中的课包余额不是预期的 11 已用、1 剩余');
  const alreadyRestored = isDeepStrictEqual(schedule, before.schedule)
    && isDeepStrictEqual(entitlement, before.entitlement)
    && badLedgers.length === 0;
  if (alreadyRestored) return { alreadyRestored: true };
  if (text(schedule.operationId) !== BAD_OPERATION_ID) throw new Error('停止：目标排课不是本次误写入产生的记录');
  if (!entitlement || Number(entitlement.usedLessons) !== 12 || Number(entitlement.remainingLessons) !== 0 || text(entitlement.status) !== 'depleted') throw new Error('停止：目标课包当前余额不是本次误扣后的 0/12 状态');
  if (badLedgers.length !== 1) throw new Error(`停止：目标误写消课流水应为 1 条，实际 ${badLedgers.length} 条`);
  return { alreadyRestored: false };
}

async function verify(client, before) {
  const [schedule, entitlement, ledgers, meta, activeIndexRow] = await Promise.all([
    getRow(client, TABLES.schedule, TARGET.scheduleId),
    getRow(client, TABLES.entitlement, TARGET.entitlementId),
    scanTable(client, TABLES.ledger),
    getRow(client, TABLES.summary, '__student_teaching_summary_meta__'),
    getRow(client, 'ft_student_active_entitlement_index', 'seed-student-003')
  ]);
  const badLedgers = findBadLedgers(ledgers);
  const summaryBundle = await getRow(client, TABLES.summary, buildStudentTeachingSummaryBundleId(meta?.activeVersion));
  const summaryRows = studentTeachingSummaryBundleLogicalRows(summaryBundle);
  const student = summaryRows.find(row => text(row.studentId || row.id) === 'seed-student-003');
  const packageRow = (student?.detailPackageOrderRows || []).find(row => text(row.entitlementId) === TARGET.entitlementId);
  const mismatches = [];
  if (text(schedule?.status).toLowerCase() !== 'voided') mismatches.push('排课状态未保持已作废');
  if (schedule?.entitlementId || Array.isArray(schedule?.entitlementIds) && schedule.entitlementIds.length) mismatches.push('已作废排课仍绑定课包');
  if (!entitlement || Number(entitlement.usedLessons) !== Number(before.entitlement.usedLessons) || Number(entitlement.remainingLessons) !== Number(before.entitlement.remainingLessons) || text(entitlement.status) !== text(before.entitlement.status)) mismatches.push('课包余额未恢复');
  if (badLedgers.length) mismatches.push('误写消课流水仍存在');
  if (!isDeepStrictEqual(activeIndexRow, before.activeIndexRow)) mismatches.push('活跃课包索引未恢复写入前状态');
  if (!packageRow || Number(packageRow.usedLessons) !== 11 || Number(packageRow.remainingLessons) !== 1) mismatches.push('教学摘要中的黄总课包余额未恢复');
  if ((student?.detailLessonRecordRows || []).some(row => text(row.scheduleId) === TARGET.scheduleId)) mismatches.push('教学摘要仍显示已作废排课');
  return {
    ok: mismatches.length === 0,
    mismatches,
    actual: {
      scheduleStatus: schedule?.status,
      scheduleEntitlementId: schedule?.entitlementId || '',
      entitlementUsedLessons: entitlement?.usedLessons,
      entitlementRemainingLessons: entitlement?.remainingLessons,
      badLedgerCount: badLedgers.length,
      activeIndexRestored: isDeepStrictEqual(activeIndexRow, before.activeIndexRow),
      summaryPackageUsedLessons: packageRow?.usedLessons,
      summaryPackageRemainingLessons: packageRow?.remainingLessons,
      summaryHasBadLesson: (student?.detailLessonRecordRows || []).some(row => text(row.scheduleId) === TARGET.scheduleId),
      summaryActiveVersion: meta?.activeVersion
    }
  };
}

async function run(argv = process.argv.slice(2)) {
  loadRuntimeEnv({ appEnv: 'production', entry: OPERATION_ID });
  const flags = parseWriteFlags(argv);
  assertProductionWriteTrace({ operationId: OPERATION_ID, batchId: BATCH_ID, reportPath: reportPath(flags.write ? 'write' : 'dry-run') });
  const target = flags.write ? await assertProductionWriteTarget() : null;
  const before = loadBeforeSnapshot();
  const client = createClientFromEnv();
  const [schedule, entitlement, ledgers, indexRow] = await Promise.all([
    getRow(client, TABLES.schedule, TARGET.scheduleId),
    getRow(client, TABLES.entitlement, TARGET.entitlementId),
    scanTable(client, TABLES.ledger),
    getRow(client, 'ft_student_active_entitlement_index', 'seed-student-003')
  ]);
  const badLedgers = findBadLedgers(ledgers);
  const state = assertPreconditions({ schedule, entitlement, badLedgers, before });
  if (state.alreadyRestored && !indexRowNeedsRestore(indexRow, before.activeIndexRow)) {
    const verification = await verify(client, before);
    if (!verification.ok) throw new Error(`停止：当前回滚状态核验失败：${verification.mismatches.join('；')}`);
    console.log(JSON.stringify({ ok: true, mode: flags.write ? 'write' : 'dry-run', alreadyRestored: true, verification }, null, 2));
    return;
  }
  const now = new Date().toISOString();
  const report = {
    operationId: OPERATION_ID,
    batchId: BATCH_ID,
    mode: flags.write ? 'write' : 'dry-run',
    generatedAt: now,
    target,
    reason: '回滚误将已作废重复排课当作可消课排课的写入',
    scheduleId: TARGET.scheduleId,
    entitlementId: TARGET.entitlementId,
    badLedgerIds: badLedgers.map(row => row.id),
    backupPath: BEFORE_PATH,
    activeIndexRestored: !indexRowNeedsRestore(indexRow, before.activeIndexRow),
    alreadyRestored: state.alreadyRestored,
    before: { schedule, entitlement, badLedgers },
    restored: { schedule: before.schedule, entitlement: before.entitlement }
  };
  fs.mkdirSync(REPORT_DIR, { recursive: true });
  fs.writeFileSync(reportPath(flags.write ? 'write' : 'dry-run'), `${JSON.stringify(report, null, 2)}\n`, 'utf8');
  if (!flags.write) {
    console.log(JSON.stringify({ ok: true, mode: 'dry-run', reportPath: reportPath('dry-run'), badLedgerIds: report.badLedgerIds }, null, 2));
    return;
  }

  if (!state.alreadyRestored) {
    await updateRowExact(client, TABLES.entitlement, entitlement, before.entitlement);
    await updateRowExact(client, TABLES.schedule, schedule, before.schedule);
    for (const row of badLedgers) await deleteRow(client, TABLES.ledger, row.id);
  }
  if (indexRowNeedsRestore(indexRow, before.activeIndexRow)) {
    await updateRowExact(client, 'ft_student_active_entitlement_index', indexRow, before.activeIndexRow);
  }
  const summaryResult = await syncStudentTeachingSummaryDelta({
    tableName: TABLES.summary,
    getCachedRow: (_table, id) => getRow(client, TABLES.summary, id),
    put: (_table, _id, row) => require('./lib/staging-data-store').putRow(client, TABLES.summary, row),
    previousSchedule: schedule,
    nextSchedule: schedule,
    changedEntitlements: [before.entitlement],
    changedLedgers: [],
    operationId: OPERATION_ID,
    now: new Date(now)
  });
  if (!summaryResult?.synced) throw new Error(`停止：教学摘要余额回补失败：${summaryResult?.reason || summaryResult?.error || '未知原因'}`);
  const verification = await verify(client, before);
  report.summarySync = { synced: true, affectedStudentIds: summaryResult.affectedStudentIds };
  report.verification = verification;
  fs.writeFileSync(reportPath('write'), `${JSON.stringify(report, null, 2)}\n`, 'utf8');
  if (!verification.ok) throw new Error(`停止：回滚后核验失败：${verification.mismatches.join('；')}`);
  console.log(JSON.stringify({ ok: true, mode: 'write', reportPath: reportPath('write'), verification }, null, 2));
}

if (require.main === module) run().catch(error => { console.error(error?.stack || String(error)); process.exit(1); });

module.exports = { findBadLedgers, assertPreconditions, indexRowNeedsRestore, updateRowExact, verify };
