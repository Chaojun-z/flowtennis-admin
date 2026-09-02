#!/usr/bin/env node

const fs = require('fs');
const path = require('path');
const { loadRuntimeEnv } = require('./lib/runtime-env');
const {
  createClientFromEnv,
  scanTable,
  putRow
} = require('./lib/staging-data-store');
const {
  parseWriteFlags,
  assertProductionWriteTarget,
  assertProductionWriteTrace
} = require('./lib/production-write-guard');

const ROOT = path.join(__dirname, '..');
const OPERATION_ID = 'repair-cancelled-schedule-entitlement-ledgers-20260902';
const BATCH_ID = `batch-${OPERATION_ID}`;
const REPORT_DIR = path.join(ROOT, 'offline-reports');

const TABLES = {
  schedule: 'ft_schedule',
  entitlements: 'ft_entitlements',
  entitlementLedger: 'ft_entitlement_ledger'
};

function text(value) {
  return String(value ?? '').trim();
}

function parseArr(value) {
  if (Array.isArray(value)) return value;
  if (typeof value === 'string' && value.trim()) {
    try {
      const parsed = JSON.parse(value);
      return Array.isArray(parsed) ? parsed : [];
    } catch {
      return [];
    }
  }
  return [];
}

function roundLesson(value) {
  return Math.round((Number(value) || 0) * 100) / 100;
}

function activeStatus(row = {}) {
  return !['voided', 'refunded', 'deleted', 'inactive', 'cancelled', 'canceled', '已作废', '已删除'].includes(text(row.status || row.systemStatus));
}

function isCancelledSchedule(row = {}) {
  return ['已取消', 'cancelled', 'canceled'].includes(text(row.status || row.systemStatus));
}

function firstStudentId(row = {}) {
  return text(row.studentId || row.usedByStudentId) || parseArr(row.studentIds).map(text).find(Boolean) || '';
}

function repairKey({ scheduleId = '', entitlementId = '', studentId = '' } = {}) {
  return [text(scheduleId), text(entitlementId), text(studentId)].join('|');
}

function safeIdPart(value = '') {
  return text(value).replace(/[^a-zA-Z0-9_.:-]+/g, '_').slice(0, 80) || 'unknown';
}

function trace(row, now, operationId) {
  return {
    ...row,
    updatedAt: now,
    operationId,
    batchId: `batch-${operationId}`,
    operationType: 'cancelled-schedule-entitlement-return',
    operationAt: now,
    operationBy: 'Codex',
    repairReason: '取消排课后补退回课包扣课流水'
  };
}

function returnedLedger(group, amount, now, operationId) {
  return trace({
    id: `${operationId}:return:${safeIdPart(group.scheduleId)}:${safeIdPart(group.entitlementId)}:${safeIdPart(group.studentId)}`,
    scheduleId: group.scheduleId,
    entitlementId: group.entitlementId,
    purchaseId: group.purchaseId,
    studentId: group.studentId,
    lessonDelta: amount,
    action: 'return',
    reason: '取消排课历史修复：退回已扣课时',
    notes: '取消排课历史修复：补齐课包退回流水',
    relatedDate: group.relatedDate,
    sourceDate: group.relatedDate,
    createdAt: now
  }, now, operationId);
}

function returnedEntitlement(entitlement = {}, amount = 0, now = '', operationId = '') {
  const total = roundLesson(entitlement.totalLessons);
  const currentRemaining = roundLesson(entitlement.remainingLessons);
  const currentUsed = roundLesson(entitlement.usedLessons || Math.max(0, total - currentRemaining));
  const usedLessons = Math.max(0, roundLesson(currentUsed - amount));
  const remainingLessons = total > 0
    ? Math.max(0, roundLesson(total - usedLessons))
    : roundLesson(currentRemaining + amount);
  return trace({
    ...entitlement,
    usedLessons,
    remainingLessons,
    status: remainingLessons > 0 ? 'active' : (entitlement.status || 'depleted')
  }, now, operationId);
}

function buildPlan(data = {}, { now = new Date().toISOString(), operationId = OPERATION_ID } = {}) {
  const schedulesById = new Map((data.schedules || data.schedule || []).map(row => [text(row.id), row]).filter(([id]) => id));
  const entitlementsById = new Map((data.entitlements || []).map(row => [text(row.id), row]).filter(([id]) => id));
  const groups = new Map();
  const blockers = [];

  (data.entitlementLedger || []).filter(activeStatus).forEach(row => {
    const scheduleId = text(row.scheduleId);
    const entitlementId = text(row.entitlementId);
    const schedule = schedulesById.get(scheduleId);
    if (!scheduleId || !entitlementId || !isCancelledSchedule(schedule)) return;
    const entitlement = entitlementsById.get(entitlementId) || {};
    const studentId = firstStudentId(row) || firstStudentId(schedule) || text(entitlement.studentId);
    const key = repairKey({ scheduleId, entitlementId, studentId });
    const group = groups.get(key) || {
      scheduleId,
      entitlementId,
      studentId,
      purchaseId: text(row.purchaseId || entitlement.purchaseId),
      relatedDate: text(row.relatedDate || row.sourceDate || schedule.startTime || row.createdAt).slice(0, 10),
      rows: [],
      netDelta: 0
    };
    group.rows.push(row);
    group.netDelta = roundLesson(group.netDelta + roundLesson(row.lessonDelta));
    groups.set(key, group);
  });

  const returnLedgers = [];
  const putEntitlementsById = new Map();
  const backupEntitlements = new Map();
  const backupLedger = [];
  const dirtyScheduleIds = new Set();

  [...groups.values()].forEach(group => {
    if (group.netDelta >= 0) return;
    const entitlement = putEntitlementsById.get(group.entitlementId) || entitlementsById.get(group.entitlementId);
    if (!entitlement) {
      blockers.push({ scheduleId: group.scheduleId, entitlementId: group.entitlementId, reason: '课包不存在，无法自动退回' });
      return;
    }
    if (!activeStatus(entitlement)) {
      blockers.push({ scheduleId: group.scheduleId, entitlementId: group.entitlementId, reason: '课包已作废或已删除，无法自动退回' });
      return;
    }
    const amount = Math.abs(group.netDelta);
    if (!backupEntitlements.has(group.entitlementId)) backupEntitlements.set(group.entitlementId, entitlementsById.get(group.entitlementId));
    backupLedger.push(...group.rows.filter(row => (Number(row.lessonDelta) || 0) < 0));
    returnLedgers.push(returnedLedger(group, amount, now, operationId));
    putEntitlementsById.set(group.entitlementId, returnedEntitlement(entitlement, amount, now, operationId));
    dirtyScheduleIds.add(group.scheduleId);
  });

  return {
    blockers,
    returnLedgers,
    putEntitlements: [...putEntitlementsById.values()],
    backups: {
      entitlements: [...backupEntitlements.values()],
      entitlementLedger: backupLedger
    },
    summary: {
      dirtyCancelledSchedules: dirtyScheduleIds.size,
      returnLedgerCount: returnLedgers.length,
      entitlementUpdateCount: putEntitlementsById.size,
      requiresStudentTeachingSummaryRebuild: returnLedgers.length > 0
    }
  };
}

async function retry(label, fn, maxAttempts = 4) {
  let lastError;
  for (let attempt = 1; attempt <= maxAttempts; attempt += 1) {
    try {
      return await Promise.race([
        fn(),
        new Promise((_, reject) => setTimeout(() => reject(new Error(`${label} timeout`)), 15000))
      ]);
    } catch (error) {
      lastError = error;
      if (attempt === maxAttempts) break;
      await new Promise(resolve => setTimeout(resolve, attempt * 800));
    }
  }
  throw new Error(`${label} failed: ${lastError?.message || lastError}`);
}

async function run(argv = process.argv.slice(2)) {
  loadRuntimeEnv({ override: true });
  const args = parseWriteFlags(argv);
  const reportPath = path.join(REPORT_DIR, `${OPERATION_ID}-${args.write ? 'write' : 'dry-run'}.json`);
  assertProductionWriteTrace({ operationId: OPERATION_ID, batchId: BATCH_ID, reportPath });
  const target = await assertProductionWriteTarget();
  const client = createClientFromEnv();
  const [schedules, entitlements, entitlementLedger] = await Promise.all([
    scanTable(client, TABLES.schedule),
    scanTable(client, TABLES.entitlements),
    scanTable(client, TABLES.entitlementLedger)
  ]);
  const now = new Date().toISOString();
  const plan = buildPlan({ schedules, entitlements, entitlementLedger }, { now, operationId: OPERATION_ID });
  const output = {
    ok: !plan.blockers.length,
    mode: args.write ? 'write' : 'dry-run',
    target,
    reportPath,
    operationId: OPERATION_ID,
    batchId: BATCH_ID,
    generatedAt: now,
    ...plan.summary,
    blockers: plan.blockers,
    backups: plan.backups,
    returnLedgers: plan.returnLedgers,
    putEntitlements: plan.putEntitlements
  };

  fs.mkdirSync(REPORT_DIR, { recursive: true });
  fs.writeFileSync(reportPath, `${JSON.stringify(output, null, 2)}\n`, 'utf8');

  if (plan.blockers.length) throw new Error(`存在 ${plan.blockers.length} 条阻塞项，已生成报告：${reportPath}`);
  if (args.write) {
    for (const row of plan.returnLedgers) await retry(`put ledger ${row.id}`, () => putRow(client, TABLES.entitlementLedger, row));
    for (const row of plan.putEntitlements) await retry(`put entitlement ${row.id}`, () => putRow(client, TABLES.entitlements, row));
  }

  console.log(JSON.stringify({
    ok: true,
    mode: output.mode,
    reportPath,
    ...plan.summary
  }, null, 2));
}

if (require.main === module) {
  run().catch(error => {
    console.error(error?.stack || String(error));
    process.exit(1);
  });
}

module.exports = { buildPlan, run };
