#!/usr/bin/env node

const fs = require('fs');
const path = require('path');
const { loadRuntimeEnv } = require('./lib/runtime-env');
const {
  createClientFromEnv,
  getRow,
  scanTable,
  putRow
} = require('./lib/staging-data-store');
const {
  parseWriteFlags,
  assertProductionWriteTarget,
  assertProductionWriteTrace
} = require('./lib/production-write-guard');
const {
  STUDENT_TEACHING_SUMMARY_META_ID,
  buildStudentTeachingSummaryBundleId,
  buildStudentTeachingSummaryListBundleId,
  requireReadyStudentTeachingSummaryRows,
  studentTeachingSummaryBundleLogicalRows,
  buildStudentTeachingSummaryChecksum,
  syncStudentTeachingSummaryDelta
} = require('../server/read-models/student-teaching-summary-cache');

const ROOT = path.join(__dirname, '..');
const OPERATION_ID = 'repair-schedule-missing-entitlement-ledgers-20260919';
const BATCH_ID = `batch-${OPERATION_ID}`;
const REPORT_DIR = path.join(ROOT, 'offline-reports');
const TABLES = {
  schedules: 'ft_schedule',
  entitlements: 'ft_entitlements',
  entitlementLedger: 'ft_entitlement_ledger',
  authorizations: 'ft_entitlement_authorizations',
  activeEntitlementIndex: 'ft_student_active_entitlement_index',
  studentTeachingSummary: 'ft_student_teaching_summary',
  financialLedger: 'ft_financial_ledger'
};

function text(value) {
  return String(value ?? '').trim();
}

function parseArr(value) {
  if (Array.isArray(value)) return value;
  if (typeof value !== 'string' || !value) return [];
  try {
    const parsed = JSON.parse(value);
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

function normalizeSettlementRows(row = {}) {
  return parseArr(row.studentSettlementRows)
    .map(item => ({
      ...item,
      studentId: text(item?.studentId),
      settlementType: text(item?.settlementType),
      entitlementId: text(item?.entitlementId)
    }))
    .filter(item => item.studentId);
}

function isPackageType(value) {
  return ['package', '课包', '课包划扣', '课包扣减', '划扣', '扣课']
    .includes(text(value).toLowerCase());
}

function isDirectOrGift(value) {
  return ['direct', '直接收款', 'paid', 'gift', 'free', '赠送', '免费']
    .includes(text(value).toLowerCase());
}

function isExplicitPackageSchedule(row = {}) {
  const studentRows = normalizeSettlementRows(row);
  if (studentRows.length) return studentRows.some(item => isPackageType(item.settlementType));
  const rootSettlement = text(row.settlementType || row.paymentType);
  if (isDirectOrGift(rootSettlement)) return false;
  return isPackageType(rootSettlement)
    || !!text(row.entitlementId)
    || parseArr(row.entitlementIds).length > 0;
}

function scheduleStudentIds(row = {}) {
  const studentRows = normalizeSettlementRows(row);
  const ids = studentRows.length
    ? studentRows.map(item => item.studentId)
    : parseArr(row.studentIds).concat(row.studentId || []);
  return [...new Set(ids.map(text).filter(Boolean))];
}

function lessonCountForRepair(row = {}) {
  const smallGroup = text(row.courseType || row.type) === '小班课';
  const smallTrial = text(row.courseType || row.type) === '体验课'
    && /小班|1v4/.test([
      row.experienceType,
      row.courseTypeLevel2,
      row.packageName,
      row.name,
      row.productName
    ].filter(Boolean).join(' '));
  const countBased = smallGroup || smallTrial || text(row.courseType || row.type) === '专项课';
  const value = Number(row.lessonCount);
  const count = countBased ? 1 : (Number.isFinite(value) ? value : 1);
  return count > 0 ? count : 0;
}

function occurredAndBillable(row = {}, now = new Date()) {
  const status = text(row.status || row.systemStatus).toLowerCase();
  if (!row || ['voided', 'refunded', 'deleted', 'inactive', 'cancelled', 'canceled', '已取消', '已作废', '已删除'].includes(status) || row.coachLateFree) return false;
  const start = Date.parse(text(row.startTime).replace(' ', 'T'));
  return Number.isFinite(start) && start <= new Date(now).getTime();
}

function hasNegativeLedger(ledgerRows, scheduleId) {
  return ledgerRows.some(row => (
    text(row.scheduleId) === text(scheduleId)
    && Number(row.lessonDelta ?? row.delta ?? 0) < 0
  ));
}

function operationTrace(now) {
  return {
    operationId: OPERATION_ID,
    batchId: BATCH_ID,
    operationType: 'lesson-consume-repair',
    operationAt: now,
    operationBy: 'Codex'
  };
}

function buildActiveEntitlementIndexRow({ studentId, before = {}, entitlements = [], now }) {
  const sid = text(studentId);
  const entitlementIds = (Array.isArray(entitlements) ? entitlements : [])
    .filter(row => text(row.studentId) === sid)
    .filter(row => text(row.status) === 'active' && Number(row.remainingLessons || 0) > 0)
    .map(row => text(row.id))
    .filter(Boolean);
  return {
    ...before,
    id: text(before.id) || sid,
    studentId: sid,
    entitlementIds,
    updatedAt: now,
    ...operationTrace(now)
  };
}

function buildPlan(data = {}, deps = {}, now = new Date().toISOString()) {
  const {
    resolveScheduleEntitlementDeltas,
    validateEntitlementForSchedule,
    scheduleEntitlementUsageContext,
    applyEntitlementLessonDelta
  } = deps;
  const entitlements = Array.isArray(data.entitlements) ? data.entitlements : [];
  const ledgerRows = Array.isArray(data.entitlementLedger) ? data.entitlementLedger : [];
  const authorizations = Array.isArray(data.authorizations) ? data.authorizations : [];
  const workingEntitlements = new Map(entitlements.map(row => [text(row.id), row]));
  const initialEntitlements = new Map(entitlements.map(row => [text(row.id), row]));
  const repairable = [];
  const blocked = [];

  for (const schedule of data.schedules || []) {
    if (!occurredAndBillable(schedule, now) || !isExplicitPackageSchedule(schedule)) continue;
    if (hasNegativeLedger(ledgerRows, schedule.id)) continue;
    const studentIds = scheduleStudentIds(schedule);
    const base = { ...schedule, studentIds };
    let deltas;
    try {
      deltas = resolveScheduleEntitlementDeltas(base, [...workingEntitlements.values()]);
    } catch (error) {
      blocked.push({
        scheduleId: text(schedule.id),
        studentIds,
        reason: `无法匹配课包：${text(error?.message || error)}`
      });
      continue;
    }
    if (!deltas.length) {
      blocked.push({ scheduleId: text(schedule.id), studentIds, reason: '没有可验证的课包匹配结果' });
      continue;
    }
    const changes = [];
    let reason = '';
    const touchedBefore = new Map();
    try {
      for (const delta of deltas) {
        const entitlementId = text(delta.entitlementId);
        const entitlement = workingEntitlements.get(entitlementId);
        if (!entitlement) throw new Error(`课包不存在：${text(delta.entitlementId)}`);
        validateEntitlementForSchedule(entitlement, base, { authorizations });
        const usage = scheduleEntitlementUsageContext(entitlement, base) || {};
        const changed = applyEntitlementLessonDelta(entitlement, -Number(delta.delta), now);
        if (!touchedBefore.has(entitlementId)) touchedBefore.set(entitlementId, entitlement);
        workingEntitlements.set(entitlementId, changed);
        changes.push({
          studentId: text(delta.studentId || usage.usedByStudentId || entitlement.studentId),
          entitlementId: text(delta.entitlementId),
          delta: Number(delta.delta),
          before: entitlement,
          after: changed,
          usage
        });
      }
    } catch (error) {
      for (const [entitlementId, entitlement] of touchedBefore) workingEntitlements.set(entitlementId, entitlement);
      reason = text(error?.message || error);
    }
    if (reason || changes.length !== deltas.length) {
      blocked.push({ scheduleId: text(schedule.id), studentIds, reason: reason || '课包匹配数量不完整' });
      continue;
    }
    repairable.push({ schedule, deltas: changes });
  }

  const ledgerPuts = [];
  const indexStudentIds = new Set();
  const schedulePuts = [];
  for (const item of repairable) {
    const schedule = item.schedule;
    const entitlementIds = item.deltas.map(delta => delta.entitlementId);
    const studentRows = normalizeSettlementRows(schedule);
    const nextSchedule = {
      ...schedule,
      entitlementIds,
      entitlementId: entitlementIds.length === 1 ? entitlementIds[0] : '',
      updatedAt: now,
      ...operationTrace(now),
      repairReason: '补齐历史排课缺失的课包消课流水'
    };
    if (studentRows.length) {
      const byStudent = new Map(item.deltas.map(delta => [delta.studentId, delta.entitlementId]));
      nextSchedule.studentSettlementRows = studentRows.map(row => ({
        ...row,
        entitlementId: byStudent.get(row.studentId) || row.entitlementId || ''
      }));
    } else if (item.deltas.length === 1) {
      const entitlement = item.deltas[0].after;
      nextSchedule.packageName = text(schedule.packageName) || text(entitlement.packageName);
      nextSchedule.purchaseId = text(schedule.purchaseId) || text(entitlement.purchaseId);
      nextSchedule.timeBand = text(schedule.timeBand) || text(entitlement.timeBand);
    }
    schedulePuts.push({ id: text(schedule.id), before: schedule, after: nextSchedule });
    for (const delta of item.deltas) {
      const entitlement = delta.before;
      const ledgerId = `${OPERATION_ID}-${text(schedule.id)}-${text(delta.entitlementId)}-${text(delta.studentId || entitlement.studentId)}`.slice(0, 190);
      const usage = delta.usage || {};
      ledgerPuts.push({
        id: ledgerId,
        entitlementId: delta.entitlementId,
        studentId: text(usage.usedByStudentId || delta.studentId || entitlement.studentId),
        purchaseId: text(entitlement.purchaseId),
        packageName: text(entitlement.packageName),
        authorizationId: text(usage.authorizationId),
        packageOwnerStudentId: text(usage.packageOwnerStudentId || entitlement.studentId),
        packageOwnerStudentName: text(usage.packageOwnerStudentName),
        usedByStudentId: text(usage.usedByStudentId || delta.studentId || entitlement.studentId),
        usedByStudentName: text(usage.usedByStudentName),
        scheduleId: text(schedule.id),
        lessonDelta: -delta.delta,
        action: 'consume',
        reason: '历史排课缺失流水补记',
        operator: 'Codex',
        ...operationTrace(now),
        createdAt: now
      });
      indexStudentIds.add(text(entitlement.studentId));
    }
  }
  const changedEntitlementIds = new Set(
    repairable.flatMap(item => item.deltas.map(delta => text(delta.entitlementId)))
  );
  const finalEntitlementPuts = [...changedEntitlementIds].map(id => ({
    id,
    before: initialEntitlements.get(id),
    after: workingEntitlements.get(id)
  }));
  const activeIndexByStudentId = new Map(
    (Array.isArray(data.activeEntitlementIndex) ? data.activeEntitlementIndex : [])
      .map(row => [text(row.studentId || row.id), row])
  );
  const activeEntitlementIndexPuts = [...indexStudentIds].map(studentId => ({
    id: text(activeIndexByStudentId.get(studentId)?.id) || studentId,
    before: activeIndexByStudentId.get(studentId) || null,
    after: buildActiveEntitlementIndexRow({
      studentId,
      before: activeIndexByStudentId.get(studentId) || {},
      entitlements: [...workingEntitlements.values()],
      now
    })
  }));
  return {
    repairable,
    blocked,
    schedulePuts,
    entitlementPuts: finalEntitlementPuts,
    ledgerPuts,
    activeEntitlementIndexPuts,
    indexStudentIds: [...indexStudentIds]
  };
}

function reportPath(mode) {
  return path.join(REPORT_DIR, `${OPERATION_ID}-${mode}.json`);
}

function backupPath() {
  return path.join(REPORT_DIR, `${OPERATION_ID}-before.json`);
}

function summarize(plan) {
  return {
    repairableScheduleCount: plan.repairable.length,
    schedulePutCount: plan.schedulePuts.length,
    entitlementPutCount: plan.entitlementPuts.length,
    ledgerPutCount: plan.ledgerPuts.length,
    activeEntitlementIndexPutCount: plan.activeEntitlementIndexPuts.length,
    affectedStudentCount: plan.indexStudentIds.length,
    blockedScheduleCount: plan.blocked.length
  };
}

function assertTeachingSummaryReady(summary = {}) {
  const meta = summary.meta;
  const bundle = summary.bundle;
  const listBundle = summary.listBundle;
  const rows = requireReadyStudentTeachingSummaryRows([meta, bundle]);
  const listRows = studentTeachingSummaryBundleLogicalRows({
    ...listBundle,
    id: buildStudentTeachingSummaryBundleId(listBundle?.publishVersion),
    kind: 'student-teaching-summary-bundle'
  });
  if (listRows.length !== rows.length
    || Number(listBundle?.rowCount) !== listRows.length
    || text(listBundle?.checksum) !== buildStudentTeachingSummaryChecksum(listRows)) {
    throw new Error('停止：教学摘要列表发布包校验失败');
  }
  return { status: text(meta.status), activeVersion: text(meta.activeVersion), rowCount: rows.length };
}

async function syncStudentTeachingSummaryForPlan({ client, plan, now, operationId = OPERATION_ID }) {
  const results = [];
  const scheduleAfterById = new Map(plan.schedulePuts.map(item => [text(item.id), item.after]));
  const ledgersByScheduleId = new Map();
  for (const ledger of plan.ledgerPuts) {
    const scheduleId = text(ledger.scheduleId);
    const rows = ledgersByScheduleId.get(scheduleId) || [];
    rows.push(ledger);
    ledgersByScheduleId.set(scheduleId, rows);
  }
  for (const item of plan.repairable) {
    const scheduleId = text(item.schedule.id);
    const result = await syncStudentTeachingSummaryDelta({
      tableName: TABLES.studentTeachingSummary,
      getCachedRow: (_tableName, id) => getRow(client, TABLES.studentTeachingSummary, id),
      put: (_tableName, _id, row) => putRow(client, TABLES.studentTeachingSummary, row),
      previousSchedule: item.schedule,
      nextSchedule: scheduleAfterById.get(scheduleId),
      changedEntitlements: item.deltas.map(delta => delta.after),
      changedLedgers: ledgersByScheduleId.get(scheduleId) || [],
      operationId: `${operationId}-${scheduleId}`,
      now: new Date(now)
    });
    if (!result?.synced) {
      throw new Error(`停止：学员教学摘要同步失败（排课 ${scheduleId}）：${text(result?.reason || result?.error || '未知原因')}`);
    }
    results.push({ scheduleId, ...result });
  }
  return results;
}

async function verifyWrite(client, plan) {
  const [schedules, entitlements, ledgers, indexes, summaryMeta] = await Promise.all([
    scanTable(client, TABLES.schedules),
    scanTable(client, TABLES.entitlements),
    scanTable(client, TABLES.entitlementLedger),
    scanTable(client, TABLES.activeEntitlementIndex),
    getRow(client, TABLES.studentTeachingSummary, STUDENT_TEACHING_SUMMARY_META_ID)
  ]);
  const scheduleById = new Map(schedules.map(row => [text(row.id), row]));
  const entitlementById = new Map(entitlements.map(row => [text(row.id), row]));
  const ledgerById = new Map(ledgers.map(row => [text(row.id), row]));
  const indexByStudentId = new Map(indexes.map(row => [text(row.studentId || row.id), row]));
  const mismatches = [];
  for (const item of plan.schedulePuts) {
    const actual = scheduleById.get(text(item.id));
    if (!actual || JSON.stringify(actual.entitlementIds || []) !== JSON.stringify(item.after.entitlementIds || [])) {
      mismatches.push(`排课绑定未落地:${text(item.id)}`);
    }
  }
  for (const item of plan.entitlementPuts) {
    const actual = entitlementById.get(text(item.id));
    if (!actual || Number(actual.usedLessons) !== Number(item.after.usedLessons)
      || Number(actual.remainingLessons) !== Number(item.after.remainingLessons)
      || text(actual.status) !== text(item.after.status)) {
      mismatches.push(`课包余额未落地:${text(item.id)}`);
    }
  }
  for (const row of plan.ledgerPuts) {
    const actual = ledgerById.get(text(row.id));
    if (!actual || text(actual.scheduleId) !== text(row.scheduleId) || Number(actual.lessonDelta) !== Number(row.lessonDelta)) {
      mismatches.push(`消课流水未落地:${text(row.id)}`);
    }
  }
  for (const item of plan.activeEntitlementIndexPuts) {
    const actual = indexByStudentId.get(text(item.after.studentId));
    if (!actual || JSON.stringify(actual.entitlementIds || []) !== JSON.stringify(item.after.entitlementIds || [])) {
      mismatches.push(`活跃课包索引未落地:${text(item.after.studentId)}`);
    }
  }
  const activeVersion = text(summaryMeta?.activeVersion);
  const [summaryBundle, summaryListBundle] = activeVersion
    ? await Promise.all([
      getRow(client, TABLES.studentTeachingSummary, buildStudentTeachingSummaryBundleId(activeVersion)),
      getRow(client, TABLES.studentTeachingSummary, buildStudentTeachingSummaryListBundleId(activeVersion))
    ])
    : [null, null];
  let summaryRows = [];
  if (!summaryMeta || !summaryBundle || !summaryListBundle) {
    mismatches.push('教学摘要发布包缺失');
  } else {
    try {
      summaryRows = requireReadyStudentTeachingSummaryRows([summaryMeta, summaryBundle]);
      const listRows = studentTeachingSummaryBundleLogicalRows({
        ...summaryListBundle,
        id: buildStudentTeachingSummaryBundleId(summaryListBundle?.publishVersion),
        kind: 'student-teaching-summary-bundle'
      });
      if (listRows.length !== summaryRows.length
        || Number(summaryListBundle.rowCount) !== listRows.length
        || text(summaryListBundle.checksum) !== buildStudentTeachingSummaryChecksum(listRows)) {
        mismatches.push('教学摘要列表发布包校验失败');
      }
    } catch (error) {
      mismatches.push(`教学摘要主发布包校验失败:${text(error.message || error)}`);
    }
  }
  const summaryByStudentId = new Map(summaryRows.map(row => [text(row.studentId || row.id), row]));
  for (const ledger of plan.ledgerPuts) {
    const studentId = text(ledger.usedByStudentId || ledger.studentId);
    const summaryRow = summaryByStudentId.get(studentId);
    const lessonRow = (Array.isArray(summaryRow?.detailLessonRecordRows) ? summaryRow.detailLessonRecordRows : [])
      .find(row => text(row.scheduleId) === text(ledger.scheduleId) && Number(row.lessonDelta) < 0);
    if (!lessonRow) mismatches.push(`教学摘要缺少消课记录:${text(ledger.scheduleId)}:${studentId}`);
  }
  return {
    ok: mismatches.length === 0,
    mismatches,
    verified: {
      scheduleCount: plan.schedulePuts.length,
      entitlementCount: plan.entitlementPuts.length,
      ledgerCount: plan.ledgerPuts.length,
      activeIndexCount: plan.activeEntitlementIndexPuts.length,
      summaryRowCount: summaryRows.length,
      summaryActiveVersion: activeVersion
    }
  };
}

async function run() {
  loadRuntimeEnv({ appEnv: 'production', entry: OPERATION_ID });
  const flags = parseWriteFlags(process.argv.slice(2));
  const now = new Date().toISOString();
  const target = flags.write ? await assertProductionWriteTarget() : null;
  const trace = assertProductionWriteTrace({
    operationId: OPERATION_ID,
    batchId: BATCH_ID,
    reportPath: reportPath(flags.write ? 'write' : 'dry-run')
  });
  const client = createClientFromEnv();
  const data = {
    schedules: await scanTable(client, TABLES.schedules),
    entitlements: await scanTable(client, TABLES.entitlements),
    entitlementLedger: await scanTable(client, TABLES.entitlementLedger),
    authorizations: await scanTable(client, TABLES.authorizations).catch(() => []),
    activeEntitlementIndex: await scanTable(client, TABLES.activeEntitlementIndex).catch(() => []),
    financialLedger: await scanTable(client, TABLES.financialLedger).catch(() => [])
  };
  const summaryMeta = await getRow(client, TABLES.studentTeachingSummary, STUDENT_TEACHING_SUMMARY_META_ID);
  const summaryActiveVersion = text(summaryMeta?.activeVersion);
  const summary = {
    meta: summaryMeta,
    bundle: summaryActiveVersion
      ? await getRow(client, TABLES.studentTeachingSummary, buildStudentTeachingSummaryBundleId(summaryActiveVersion))
      : null,
    listBundle: summaryActiveVersion
      ? await getRow(client, TABLES.studentTeachingSummary, buildStudentTeachingSummaryListBundleId(summaryActiveVersion))
      : null
  };
  const summaryReadiness = assertTeachingSummaryReady(summary);
  const api = require('../api/index.js');
  const plan = buildPlan(data, api._test, now);
  fs.mkdirSync(REPORT_DIR, { recursive: true });
  const report = {
    ...trace,
    mode: flags.write ? 'write' : 'dry-run',
    generatedAt: now,
    target,
    summaryReadiness,
    summary: summarize(plan),
    blocked: plan.blocked.map(item => ({ scheduleId: item.scheduleId, reason: item.reason })),
    repairableScheduleIds: plan.repairable.map(item => text(item.schedule.id)),
    ledgerIds: plan.ledgerPuts.map(row => row.id),
    financialLedgerRowCountBefore: data.financialLedger.length
  };
  fs.writeFileSync(reportPath(flags.write ? 'write' : 'dry-run'), `${JSON.stringify(report, null, 2)}\n`, 'utf8');
  if (!flags.write) {
    console.log(JSON.stringify({ ok: true, mode: 'dry-run', reportPath: reportPath('dry-run'), summary: report.summary }, null, 2));
    return;
  }

  const backup = {
    ...trace,
    mode: 'before-write',
    generatedAt: now,
    target,
    summary: report.summary,
    schedules: plan.schedulePuts.map(item => item.before),
    entitlements: plan.entitlementPuts.map(item => item.before),
    existingLedgerRows: data.entitlementLedger.filter(row => plan.schedulePuts.some(item => text(item.id) === text(row.scheduleId))),
    activeEntitlementIndexRows: plan.activeEntitlementIndexPuts.map(item => item.before).filter(Boolean),
    studentTeachingSummary: summary,
    financialLedgerRowCountBefore: data.financialLedger.length
  };
  fs.writeFileSync(backupPath(), `${JSON.stringify(backup, null, 2)}\n`, 'utf8');

  for (const item of plan.entitlementPuts) await putRow(client, TABLES.entitlements, item.after);
  for (const row of plan.ledgerPuts) await putRow(client, TABLES.entitlementLedger, row);
  for (const item of plan.schedulePuts) await putRow(client, TABLES.schedules, item.after);
  for (const item of plan.activeEntitlementIndexPuts) await putRow(client, TABLES.activeEntitlementIndex, item.after);
  const summarySync = await syncStudentTeachingSummaryForPlan({ client, plan, now });
  const verification = await verifyWrite(client, plan);
  report.summarySync = summarySync.map(item => ({ scheduleId: item.scheduleId, affectedStudentIds: item.affectedStudentIds }));
  report.verification = verification;
  fs.writeFileSync(reportPath('write'), `${JSON.stringify(report, null, 2)}\n`, 'utf8');
  if (!verification.ok) throw new Error(`停止：写入后核验失败：${verification.mismatches.join('；')}`);
  console.log(JSON.stringify({ ok: true, mode: 'write', reportPath: reportPath('write'), backupPath: backupPath(), summary: report.summary, verification }, null, 2));
}

if (require.main === module) {
  run().catch(error => {
    console.error(error?.stack || String(error));
    process.exit(1);
  });
}

module.exports = {
  OPERATION_ID,
  BATCH_ID,
  isExplicitPackageSchedule,
  buildPlan,
  buildActiveEntitlementIndexRow,
  syncStudentTeachingSummaryForPlan,
  summarize
};
