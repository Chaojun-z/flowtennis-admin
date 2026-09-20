#!/usr/bin/env node

const fs = require('fs');
const path = require('path');
const { loadRuntimeEnv } = require('./lib/runtime-env');
const { createClientFromEnv, getRow, scanTable, putRow } = require('./lib/staging-data-store');
const { parseWriteFlags, assertProductionWriteTarget, assertProductionWriteTrace } = require('./lib/production-write-guard');
const {
  buildStudentTeachingSummaryBundleId,
  studentTeachingSummaryBundleLogicalRows,
  syncStudentTeachingSummaryDelta
} = require('../server/read-models/student-teaching-summary-cache');

const ROOT = path.join(__dirname, '..');
const OPERATION_ID = 'repair-confirmed-used-up-schedule-ledgers-20260920';
const BATCH_ID = `batch-${OPERATION_ID}`;
const REPORT_DIR = path.join(ROOT, 'offline-reports');
const BEFORE_PATH = path.join(REPORT_DIR, `${OPERATION_ID}-before.json`);
const TABLES = { schedule: 'ft_schedule', entitlement: 'ft_entitlements', ledger: 'ft_entitlement_ledger', summary: 'ft_student_teaching_summary' };
const TARGETS = [
  {
    scheduleId: 'ad7df449-8835-4446-93f1-6cb0df4bfd8f',
    entitlementId: '648f910c-556e-4643-8239-c2707bf55e84',
    studentId: 'b891bce1-84e2-4bb9-91e2-c159bb4f4673',
    studentName: '孙女士',
    lessonDelta: -1,
    recognizedAmount: 239,
    sourceTimeBand: '16-17点'
  },
  {
    scheduleId: 'private_lesson_csv_import_20260527:schedule:cb0385926ae7',
    entitlementId: 'private_lesson_csv_import_20260519_BATCH3_15_LIVE-entitlement-706341e4-ac48-8d19-c0d4-659558d3a46d',
    studentId: 'seed-student-038',
    studentName: 'W.Jing',
    lessonDelta: -2,
    recognizedAmount: 700,
    sourceTimeBand: '17-19点',
    sourceRecord: '课包消耗记录#36；3和4'
  },
  {
    scheduleId: 'private_lesson_csv_import_20260527:schedule:85c0572ec0bb',
    entitlementId: 'private_lesson_csv_import_20260519_BATCH3_15_LIVE-entitlement-706341e4-ac48-8d19-c0d4-659558d3a46d',
    studentId: 'seed-student-038',
    studentName: 'W.Jing',
    lessonDelta: -2,
    recognizedAmount: 700,
    sourceTimeBand: '11-13点',
    sourceRecord: '课包消耗记录#40；5和6'
  },
  {
    scheduleId: 'private_lesson_csv_import_20260527:schedule:7516ee0a9fed',
    entitlementId: 'private_lesson_csv_import_20260519_BATCH3_15_LIVE-entitlement-706341e4-ac48-8d19-c0d4-659558d3a46d',
    studentId: 'seed-student-038',
    studentName: 'W.Jing',
    lessonDelta: -2,
    recognizedAmount: 700,
    sourceTimeBand: '10-12点',
    sourceRecord: '课包消耗记录#43；7和8'
  },
  {
    scheduleId: 'private_lesson_csv_import_20260527:schedule:d704f82cb0ad',
    entitlementId: 'private_lesson_csv_import_20260519_BATCH3_15_LIVE-entitlement-706341e4-ac48-8d19-c0d4-659558d3a46d',
    studentId: 'seed-student-038',
    studentName: 'W.Jing',
    lessonDelta: -2,
    recognizedAmount: 700,
    sourceTimeBand: '10-12点',
    sourceRecord: '课包消耗记录#44；9和10'
  }
];

function text(value) { return String(value ?? '').trim(); }
function reportPath(mode) { return path.join(REPORT_DIR, `${OPERATION_ID}-${mode}.json`); }
function trace(now) { return { operationId: OPERATION_ID, batchId: BATCH_ID, operationType: 'lesson-consume-repair', operationAt: now, operationBy: 'Codex' }; }

function buildPlan({ schedules = [], entitlements = [], ledgers = [], now }) {
  const scheduleById = new Map(schedules.map(row => [text(row.id), row]));
  const entitlementById = new Map(entitlements.map(row => [text(row.id), row]));
  const blockers = [];
  const puts = [];
  for (const target of TARGETS) {
    const schedule = scheduleById.get(target.scheduleId);
    const entitlement = entitlementById.get(target.entitlementId);
    if (!schedule) { blockers.push(`${target.scheduleId} 排课不存在`); continue; }
    if (!entitlement) { blockers.push(`${target.entitlementId} 课包不存在`); continue; }
    if (text(schedule.status) !== '已排课') blockers.push(`${target.scheduleId} 排课状态不是已排课`);
    if (text(schedule.entitlementId) !== target.entitlementId) blockers.push(`${target.scheduleId} 未绑定预期课包`);
    if (Number(schedule.lessonCount) !== Math.abs(target.lessonDelta)) blockers.push(`${target.scheduleId} 课时数不符合预期`);
    if (Number(entitlement.remainingLessons) !== 0 || Number(entitlement.usedLessons) !== Number(entitlement.totalLessons) || text(entitlement.status) !== 'depleted') {
      blockers.push(`${target.entitlementId} 课包不是已用完状态`);
    }
    const existing = ledgers.filter(row => text(row.scheduleId) === target.scheduleId);
    if (existing.length) blockers.push(`${target.scheduleId} 已有消课流水，停止避免重复写入`);
    puts.push({ target, schedule, entitlement, existing });
  }
  const ledgerPuts = blockers.length ? [] : puts.map(({ target, schedule, entitlement }) => ({
    id: `${OPERATION_ID}:${target.scheduleId}`,
    entitlementId: target.entitlementId,
    studentId: target.studentId,
    studentName: target.studentName,
    purchaseId: text(entitlement.purchaseId),
    packageName: text(entitlement.packageName),
    scheduleId: target.scheduleId,
    lessonDelta: target.lessonDelta,
    action: 'consume',
    reason: '用户确认已上课，补齐历史课包使用记录；不重复扣减已用完课包',
    operator: 'Codex',
    recognizedAmount: target.recognizedAmount,
    relatedDate: text(schedule.startTime).slice(0, 10),
    sourceDate: text(schedule.startTime).slice(0, 10),
    sourceTimeBand: target.sourceTimeBand,
    sourceVenue: text(schedule.venue),
    courseType: text(schedule.courseType),
    coach: text(schedule.coach),
    notes: target.sourceRecord || text(schedule.notes),
    createdAt: now,
    updatedAt: now,
    ...trace(now)
  }));
  return { blockers, puts, ledgerPuts };
}

async function verify(client) {
  const [schedules, entitlements, ledgers, meta] = await Promise.all([
    Promise.all(TARGETS.map(target => getRow(client, TABLES.schedule, target.scheduleId))),
    Promise.all([...new Set(TARGETS.map(target => target.entitlementId))].map(id => getRow(client, TABLES.entitlement, id))),
    scanTable(client, TABLES.ledger),
    getRow(client, TABLES.summary, '__student_teaching_summary_meta__')
  ]);
  const targetIds = new Set(TARGETS.map(target => target.scheduleId));
  const targetLedgers = ledgers.filter(row => targetIds.has(text(row.scheduleId)));
  const bundle = await getRow(client, TABLES.summary, buildStudentTeachingSummaryBundleId(meta?.activeVersion));
  const summaryRows = studentTeachingSummaryBundleLogicalRows(bundle);
  const lessons = summaryRows.flatMap(row => Array.isArray(row.detailLessonRecordRows) ? row.detailLessonRecordRows : []);
  const mismatches = [];
  if (targetLedgers.length !== TARGETS.length) mismatches.push(`消课流水应为 ${TARGETS.length} 条，实际 ${targetLedgers.length} 条`);
  for (const target of TARGETS) {
    const ledger = targetLedgers.find(row => text(row.scheduleId) === target.scheduleId);
    if (!ledger || Number(ledger.lessonDelta) !== target.lessonDelta || text(ledger.entitlementId) !== target.entitlementId) mismatches.push(`${target.scheduleId} 流水内容不正确`);
  }
  const balance = entitlements.map(row => ({ id: row?.id, usedLessons: row?.usedLessons, remainingLessons: row?.remainingLessons, status: row?.status }));
  if (balance.some(row => Number(row.remainingLessons) !== 0 || Number(row.usedLessons) <= 0 || row.status !== 'depleted')) mismatches.push('课包余额被意外改变');
  if (TARGETS.some(target => !schedules.find(row => text(row?.id) === target.scheduleId && text(row.status) === '已排课'))) mismatches.push('排课状态被意外改变');
  if (TARGETS.some(target => !lessons.some(row => text(row.scheduleId) === target.scheduleId && Number(row.lessonDelta) === target.lessonDelta))) mismatches.push('教学摘要未显示新增上课记录');
  return { ok: mismatches.length === 0, mismatches, actual: { ledgerCount: targetLedgers.length, lessonDeltaTotal: targetLedgers.reduce((sum, row) => sum + Number(row.lessonDelta || 0), 0), balance, summaryLessonCount: lessons.filter(row => targetIds.has(text(row.scheduleId))).length, summaryActiveVersion: meta?.activeVersion } };
}

async function run(argv = process.argv.slice(2)) {
  loadRuntimeEnv({ appEnv: 'production', entry: OPERATION_ID });
  const flags = parseWriteFlags(argv);
  const target = await assertProductionWriteTarget();
  assertProductionWriteTrace({ operationId: OPERATION_ID, batchId: BATCH_ID, reportPath: reportPath(flags.write ? 'write' : 'dry-run') });
  const client = createClientFromEnv();
  const [schedules, entitlements, ledgers] = await Promise.all([scanTable(client, TABLES.schedule), scanTable(client, TABLES.entitlement), scanTable(client, TABLES.ledger)]);
  const now = new Date().toISOString();
  const plan = buildPlan({ schedules, entitlements, ledgers, now });
  if (plan.blockers.length) throw new Error(`停止：${plan.blockers.join('；')}`);
  const before = { operationId: OPERATION_ID, batchId: BATCH_ID, generatedAt: now, target, schedules: plan.puts.map(item => item.schedule), entitlements: plan.puts.map(item => item.entitlement), existingLedgers: [] };
  fs.mkdirSync(REPORT_DIR, { recursive: true });
  fs.writeFileSync(BEFORE_PATH, `${JSON.stringify(before, null, 2)}\n`, 'utf8');
  const report = { ok: true, mode: flags.write ? 'write' : 'dry-run', operationId: OPERATION_ID, batchId: BATCH_ID, generatedAt: now, target, backupPath: BEFORE_PATH, targetCount: TARGETS.length, lessonDeltaTotal: plan.ledgerPuts.reduce((sum, row) => sum + row.lessonDelta, 0), ledgerIds: plan.ledgerPuts.map(row => row.id) };
  fs.writeFileSync(reportPath(flags.write ? 'write' : 'dry-run'), `${JSON.stringify(report, null, 2)}\n`, 'utf8');
  if (!flags.write) { console.log(JSON.stringify(report, null, 2)); return; }
  for (const row of plan.ledgerPuts) await putRow(client, TABLES.ledger, row);
  const changedLedgers = plan.ledgerPuts;
  for (const item of plan.puts) {
    const summaryResult = await syncStudentTeachingSummaryDelta({
      tableName: TABLES.summary,
      getCachedRow: (_table, id) => getRow(client, TABLES.summary, id),
      put: (_table, _id, row) => putRow(client, TABLES.summary, row),
      previousSchedule: item.schedule,
      nextSchedule: item.schedule,
      changedEntitlements: [],
      changedLedgers: changedLedgers.filter(row => text(row.scheduleId) === item.target.scheduleId),
      operationId: OPERATION_ID,
      now: new Date(now)
    });
    if (!summaryResult?.synced) throw new Error(`停止：教学摘要同步失败：${summaryResult?.reason || '未知原因'}`);
  }
  report.verification = await verify(client);
  fs.writeFileSync(reportPath('write'), `${JSON.stringify(report, null, 2)}\n`, 'utf8');
  if (!report.verification.ok) throw new Error(`停止：写入后核验失败：${report.verification.mismatches.join('；')}`);
  console.log(JSON.stringify({ ok: true, mode: 'write', reportPath: reportPath('write'), verification: report.verification }, null, 2));
}

if (require.main === module) run().catch(error => { console.error(error?.stack || String(error)); process.exit(1); });

module.exports = { TARGETS, buildPlan };
