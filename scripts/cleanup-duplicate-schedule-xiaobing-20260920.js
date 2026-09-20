#!/usr/bin/env node

const fs = require('fs');
const path = require('path');
const { loadRuntimeEnv } = require('./lib/runtime-env');
const {
  createClientFromEnv,
  getRow,
  scanTable,
  putRow,
  deleteRow
} = require('./lib/staging-data-store');
const {
  parseWriteFlags,
  assertProductionWriteTarget,
  assertProductionWriteTrace
} = require('./lib/production-write-guard');
const {
  buildStudentTeachingSummaryBundleId,
  studentTeachingSummaryBundleLogicalRows,
  syncStudentTeachingSummaryDelta
} = require('../server/read-models/student-teaching-summary-cache');

const ROOT = path.join(__dirname, '..');
const OPERATION_ID = 'cleanup-duplicate-schedule-xiaobing-20260920';
const BATCH_ID = `batch-${OPERATION_ID}`;
const REPORT_DIR = path.join(ROOT, 'offline-reports');
const BEFORE_PATH = path.join(REPORT_DIR, `${OPERATION_ID}-before.json`);
const TABLES = {
  schedule: 'ft_schedule',
  ledger: 'ft_entitlement_ledger',
  feedback: 'ft_feedbacks',
  conflictIndex: 'ft_schedule_conflict_index',
  summary: 'ft_student_teaching_summary'
};
const TARGET = {
  keepScheduleId: 'cxe-thirdparty-schedule-cxe_lock_2026-07-12_200',
  voidScheduleId: 'cxe-thirdparty-schedule-cxe_lock_2026-07-12_211',
  studentId: '7f908ef3-329a-4b42-9fd3-c3daea6e8965'
};

function text(value) {
  return String(value ?? '').trim();
}

function reportPath(mode) {
  return path.join(REPORT_DIR, `${OPERATION_ID}-${mode}.json`);
}

function isVoided(row = {}) {
  return ['voided', 'refunded', 'deleted', 'inactive', 'cancelled', 'canceled', '已取消', '已作废', '已删除']
    .includes(text(row.status || row.systemStatus).toLowerCase());
}

function duplicateKey(row = {}) {
  return [
    text(row.studentIds?.[0] || row.studentId),
    text(row.startTime),
    text(row.endTime),
    text(row.courseType || row.standardCourseType || row.courseDisplayName),
    text(row.coachId || row.coach)
  ].join('|');
}

function operationTrace(now) {
  return {
    operationId: OPERATION_ID,
    batchId: BATCH_ID,
    operationType: 'duplicate-schedule-cleanup',
    operationAt: now,
    operationBy: 'Codex'
  };
}

function voidDuplicateSchedule(row = {}, now = new Date().toISOString()) {
  return {
    ...row,
    status: 'voided',
    systemStatus: 'voided',
    state: 'voided',
    confirmStatus: '已作废',
    cancelReason: '重复导入：同一学员同一时间同一课程已保留原始记录',
    updatedAt: now,
    repairReason: '清理小饼妈妈重复导入排课：保留较早来源行 96，作废来源行 97',
    ...operationTrace(now)
  };
}

function buildPlan({ schedules = [], ledgers = [], feedbacks = [], conflictIndex = [], now }) {
  const byId = new Map(schedules.map(row => [text(row.id), row]));
  const keep = byId.get(TARGET.keepScheduleId);
  const duplicate = byId.get(TARGET.voidScheduleId);
  const blockers = [];
  if (!keep || !duplicate) blockers.push('目标排课缺失');
  if (keep && duplicate && duplicateKey(keep) !== duplicateKey(duplicate)) blockers.push('两条记录的学员、时间、课程或教练不一致');
  if (keep && text(keep.studentIds?.[0] || keep.studentId) !== TARGET.studentId) blockers.push('保留记录不是目标学员');
  if (duplicate && text(duplicate.studentIds?.[0] || duplicate.studentId) !== TARGET.studentId) blockers.push('重复记录不是目标学员');
  const duplicateLedgers = ledgers.filter(row => text(row.scheduleId) === TARGET.voidScheduleId);
  const duplicateFeedbacks = feedbacks.filter(row => text(row.scheduleId) === TARGET.voidScheduleId);
  if (duplicateLedgers.length) blockers.push('重复记录已有消课流水，停止避免影响课包');
  if (duplicateFeedbacks.length) blockers.push('重复记录已有课后反馈，停止避免删除履约事实');
  const indexDeletes = conflictIndex.filter(row => text(row.scheduleId) === TARGET.voidScheduleId).map(row => text(row.id)).filter(Boolean);
  const alreadyVoided = isVoided(duplicate);
  if (duplicate && !alreadyVoided && !isVoided(keep)) {
    return {
      blockers,
      alreadyVoided: false,
      update: { id: TARGET.voidScheduleId, before: duplicate, after: voidDuplicateSchedule(duplicate, now) },
      indexDeletes,
      duplicateLedgers,
      duplicateFeedbacks
    };
  }
  return {
    blockers,
    alreadyVoided,
    update: null,
    indexDeletes,
    duplicateLedgers,
    duplicateFeedbacks
  };
}

function summaryRowsForStudent(summaryBundle, studentId) {
  return studentTeachingSummaryBundleLogicalRows(summaryBundle)
    .filter(row => text(row.studentId || row.id) === text(studentId));
}

async function verify(client) {
  const [keep, duplicate, ledgers, feedbacks, conflictIndex, meta] = await Promise.all([
    getRow(client, TABLES.schedule, TARGET.keepScheduleId),
    getRow(client, TABLES.schedule, TARGET.voidScheduleId),
    scanTable(client, TABLES.ledger),
    scanTable(client, TABLES.feedback),
    scanTable(client, TABLES.conflictIndex).catch(() => []),
    getRow(client, TABLES.summary, '__student_teaching_summary_meta__')
  ]);
  const summaryBundle = await getRow(client, TABLES.summary, buildStudentTeachingSummaryBundleId(meta?.activeVersion));
  const summaryRows = summaryRowsForStudent(summaryBundle, TARGET.studentId);
  const lessonRows = summaryRows.flatMap(row => Array.isArray(row.detailLessonRecordRows) ? row.detailLessonRecordRows : []);
  const mismatches = [];
  if (!keep || isVoided(keep)) mismatches.push('保留排课不存在或已作废');
  if (!duplicate || !isVoided(duplicate)) mismatches.push('重复排课未标记为已作废');
  if (ledgers.some(row => text(row.scheduleId) === TARGET.voidScheduleId)) mismatches.push('重复排课仍有消课流水');
  if (feedbacks.some(row => text(row.scheduleId) === TARGET.voidScheduleId)) mismatches.push('重复排课仍有课后反馈');
  if (conflictIndex.some(row => text(row.scheduleId) === TARGET.voidScheduleId)) mismatches.push('重复排课仍在冲突索引');
  if (summaryRows.length !== 1) mismatches.push('学员教学摘要缺少或重复');
  if (lessonRows.some(row => text(row.scheduleId) === TARGET.voidScheduleId)) mismatches.push('学员教学摘要仍显示重复排课');
  return {
    ok: mismatches.length === 0,
    mismatches,
    actual: {
      keepStatus: keep?.status,
      duplicateStatus: duplicate?.status,
      duplicateLedgerCount: ledgers.filter(row => text(row.scheduleId) === TARGET.voidScheduleId).length,
      duplicateFeedbackCount: feedbacks.filter(row => text(row.scheduleId) === TARGET.voidScheduleId).length,
      duplicateConflictIndexCount: conflictIndex.filter(row => text(row.scheduleId) === TARGET.voidScheduleId).length,
      summaryStudentRows: summaryRows.length,
      summaryDuplicateLessonCount: lessonRows.filter(row => text(row.scheduleId) === TARGET.voidScheduleId).length,
      summaryActiveVersion: meta?.activeVersion
    }
  };
}

async function run(argv = process.argv.slice(2)) {
  loadRuntimeEnv({ appEnv: 'production', entry: OPERATION_ID });
  const flags = parseWriteFlags(argv);
  const target = await assertProductionWriteTarget();
  assertProductionWriteTrace({ operationId: OPERATION_ID, batchId: BATCH_ID, reportPath: reportPath(flags.write ? 'write' : 'dry-run') });
  const client = createClientFromEnv();
  const [schedules, ledgers, feedbacks, conflictIndex] = await Promise.all([
    scanTable(client, TABLES.schedule),
    scanTable(client, TABLES.ledger),
    scanTable(client, TABLES.feedback),
    scanTable(client, TABLES.conflictIndex).catch(() => [])
  ]);
  const now = new Date().toISOString();
  const plan = buildPlan({ schedules, ledgers, feedbacks, conflictIndex, now });
  if (plan.blockers.length) throw new Error(`停止：${plan.blockers.join('；')}`);
  const before = {
    operationId: OPERATION_ID,
    batchId: BATCH_ID,
    generatedAt: now,
    target,
    schedules: schedules.filter(row => [TARGET.keepScheduleId, TARGET.voidScheduleId].includes(text(row.id))),
    ledgers: plan.duplicateLedgers,
    feedbacks: plan.duplicateFeedbacks,
    conflictIndex: conflictIndex.filter(row => text(row.scheduleId) === TARGET.voidScheduleId)
  };
  fs.mkdirSync(REPORT_DIR, { recursive: true });
  fs.writeFileSync(BEFORE_PATH, `${JSON.stringify(before, null, 2)}\n`, 'utf8');
  const report = {
    ok: true,
    mode: flags.write ? 'write' : 'dry-run',
    operationId: OPERATION_ID,
    batchId: BATCH_ID,
    generatedAt: now,
    target,
    backupPath: BEFORE_PATH,
    policy: '保留较早来源行 96（1号场、记录 200），作废来源行 97（2号场、记录 211）',
    plan: {
      updateScheduleId: plan.update?.id || '',
      conflictIndexDeletes: plan.indexDeletes,
      duplicateLedgerCount: plan.duplicateLedgers.length,
      duplicateFeedbackCount: plan.duplicateFeedbacks.length,
      alreadyVoided: plan.alreadyVoided
    }
  };
  fs.writeFileSync(reportPath(flags.write ? 'write' : 'dry-run'), `${JSON.stringify(report, null, 2)}\n`, 'utf8');
  if (!flags.write) {
    console.log(JSON.stringify(report, null, 2));
    return;
  }
  if (plan.update) await putRow(client, TABLES.schedule, plan.update.after);
  for (const id of plan.indexDeletes) await deleteRow(client, TABLES.conflictIndex, id);
  if (plan.update) {
    const summaryResult = await syncStudentTeachingSummaryDelta({
      tableName: TABLES.summary,
      getCachedRow: (_table, id) => getRow(client, TABLES.summary, id),
      put: (_table, _id, row) => putRow(client, TABLES.summary, row),
      previousSchedule: plan.update.before,
      nextSchedule: plan.update.after,
      changedEntitlements: [],
      changedLedgers: [],
      operationId: OPERATION_ID,
      now: new Date(now)
    });
    if (!summaryResult?.synced) throw new Error(`停止：教学摘要同步失败：${summaryResult?.reason || '未知原因'}`);
    report.summarySync = summaryResult;
  }
  report.verification = await verify(client);
  fs.writeFileSync(reportPath('write'), `${JSON.stringify(report, null, 2)}\n`, 'utf8');
  if (!report.verification.ok) throw new Error(`停止：写入后核验失败：${report.verification.mismatches.join('；')}`);
  console.log(JSON.stringify({ ok: true, mode: 'write', reportPath: reportPath('write'), verification: report.verification }, null, 2));
}

if (require.main === module) run().catch(error => { console.error(error?.stack || String(error)); process.exit(1); });

module.exports = { duplicateKey, isVoided, voidDuplicateSchedule, buildPlan, summaryRowsForStudent };
