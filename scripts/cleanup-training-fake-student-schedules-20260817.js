#!/usr/bin/env node

const fs = require('fs');
const path = require('path');
const { loadRuntimeEnv } = require('./lib/runtime-env');
const {
  createClientFromEnv,
  scanTable,
  putRow,
  deleteRow,
  createTableIfMissing
} = require('./lib/staging-data-store');
const {
  parseWriteFlags,
  assertProductionWriteTarget,
  assertProductionWriteTrace
} = require('./lib/production-write-guard');
const { SCHEDULE_CONFLICT_INDEX_READY_ID } = require('../server/schedule-conflict-index');

const ROOT = path.join(__dirname, '..');
const OPERATION_ID = 'cleanup-training-fake-student-schedules-20260817';
const BATCH_ID = `batch-${OPERATION_ID}`;
const REPORT_DIR = path.join(ROOT, 'offline-reports');

const TABLES = {
  schedule: 'ft_schedule',
  students: 'ft_students',
  leads: 'ft_leads',
  conflictIndex: 'ft_schedule_conflict_index'
};

const FAKE_STUDENT_ID = 'cxe-thirdparty-202606-student-796e01d5af5e';
const FAKE_LEAD_ID = 'lead-from-student-cxe-thirdparty-202606-student-796e01d5af5e';

const CANCEL_ACTIVE_SCHEDULE_IDS = new Set([
  'cxe-thirdparty-202606-schedule-7a644447b182',
  'cxe-thirdparty-202606-schedule-367b17f7157c',
  'cxe-thirdparty-202606-schedule-615843af9829',
  'cxe-thirdparty-202606-schedule-74b3ac997071',
  'cxe-thirdparty-202606-schedule-f4195a469ee9',
  'third-party-schedule-5c175ad2-9460-4e28-a80d-1509c13cd3b5',
  'third-party-schedule-e063e1a5-82dc-4c2b-88a0-2cdf5d53eaea',
  'third-party-schedule-93856e2a-a054-4f8f-87f0-f986961df7f6'
]);

function text(value) {
  return String(value ?? '').trim();
}

function parseArr(value) {
  if (Array.isArray(value)) return value.map(item => text(item)).filter(Boolean);
  if (!value) return [];
  try {
    const parsed = JSON.parse(value);
    return Array.isArray(parsed) ? parsed.map(item => text(item)).filter(Boolean) : [];
  } catch {
    return String(value).split(',').map(item => text(item)).filter(Boolean);
  }
}

function active(row) {
  return row && text(row.status || '已排课') !== '已取消';
}

function removeFakeId(value) {
  return parseArr(value).filter(id => id !== FAKE_STUDENT_ID);
}

function hasFakeId(row) {
  return parseArr(row.studentIds).includes(FAKE_STUDENT_ID)
    || parseArr(row.expectedStudentIds).includes(FAKE_STUDENT_ID)
    || text(row.studentId) === FAKE_STUDENT_ID;
}

function trace(row, now, reason) {
  return {
    ...row,
    updatedAt: now,
    operationId: OPERATION_ID,
    batchId: BATCH_ID,
    operationType: OPERATION_ID,
    operationAt: now,
    operationBy: 'Codex',
    repairReason: reason
  };
}

function cancelPatch(row, now) {
  return trace({
    ...row,
    status: '已取消',
    state: '已取消',
    systemStatus: '已取消',
    confirmStatus: '已取消',
    cancelReason: '历史脏排课修复：训练不是学员，取消第三方同步产生的假排课/重复排课',
    studentId: '',
    studentIds: [],
    expectedStudentIds: []
  }, now, '用户确认：训练不是学员，取消训练相关脏排课');
}

function cleanCanceledRefPatch(row, now) {
  return trace({
    ...row,
    studentId: text(row.studentId) === FAKE_STUDENT_ID ? '' : row.studentId,
    studentIds: removeFakeId(row.studentIds),
    expectedStudentIds: removeFakeId(row.expectedStudentIds)
  }, now, '用户确认：训练不是学员，清理已取消排课中的假学员ID');
}

function buildPlan({ schedules, students, leads, conflictIndex, now }) {
  const updates = [];
  const skipped = [];
  const scheduleById = new Map(schedules.map(row => [text(row.id), row]));
  for (const id of CANCEL_ACTIVE_SCHEDULE_IDS) {
    const before = scheduleById.get(id);
    if (!active(before)) {
      skipped.push({ id, reason: '不存在或已取消' });
      continue;
    }
    updates.push({ id, action: 'cancelTrainingFakeSchedule', before, after: cancelPatch(before, now) });
  }

  for (const row of schedules) {
    const id = text(row.id);
    if (CANCEL_ACTIVE_SCHEDULE_IDS.has(id)) continue;
    if (!hasFakeId(row)) continue;
    updates.push({ id, action: 'cleanTrainingFakeStudentId', before: row, after: cleanCanceledRefPatch(row, now) });
  }

  const affectedIds = new Set(updates.map(item => item.id));
  const staleIndexIds = (conflictIndex || [])
    .filter(row => affectedIds.has(text(row.scheduleId)))
    .map(row => text(row.id))
    .filter(id => id && id !== SCHEDULE_CONFLICT_INDEX_READY_ID);
  const deleteStudent = students.some(row => text(row.id) === FAKE_STUDENT_ID);
  const deleteLead = leads.some(row => text(row.id) === FAKE_LEAD_ID);

  return {
    updates,
    skipped,
    deleteStudent,
    deleteLead,
    conflictIndex: { staleIndexIds }
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
  const [schedules, students, leads, conflictIndex] = await Promise.all([
    scanTable(client, TABLES.schedule),
    scanTable(client, TABLES.students),
    scanTable(client, TABLES.leads).catch(() => []),
    scanTable(client, TABLES.conflictIndex).catch(() => [])
  ]);
  const now = new Date().toISOString();
  const plan = buildPlan({ schedules, students, leads, conflictIndex, now });
  const output = {
    ok: true,
    mode: args.write ? 'write' : 'dry-run',
    target,
    reportPath,
    operationId: OPERATION_ID,
    batchId: BATCH_ID,
    generatedAt: now,
    requestedActiveCancel: CANCEL_ACTIVE_SCHEDULE_IDS.size,
    scheduleUpdates: plan.updates.length,
    activeCancels: plan.updates.filter(item => item.action === 'cancelTrainingFakeSchedule').length,
    cleanedCanceledRefs: plan.updates.filter(item => item.action === 'cleanTrainingFakeStudentId').length,
    skipped: plan.skipped.length,
    deleteStudent: plan.deleteStudent,
    deleteLead: plan.deleteLead,
    conflictIndexDeleted: plan.conflictIndex.staleIndexIds.length,
    schedules: plan.updates.map(item => ({
      id: item.id,
      action: item.action,
      startTime: item.before.startTime,
      endTime: item.before.endTime,
      beforeStatus: item.before.status,
      beforeStudentName: item.before.studentName,
      beforeStudentIds: item.before.studentIds,
      afterStatus: item.after.status,
      afterStudentIds: item.after.studentIds
    })),
    skippedItems: plan.skipped,
    plan
  };
  fs.mkdirSync(REPORT_DIR, { recursive: true });
  fs.writeFileSync(reportPath, `${JSON.stringify(output, null, 2)}\n`, 'utf8');

  if (args.write) {
    await retry('create conflict index table', () => createTableIfMissing(client, TABLES.conflictIndex));
    for (const item of plan.updates) await retry(`put schedule ${item.id}`, () => putRow(client, TABLES.schedule, item.after));
    for (const id of plan.conflictIndex.staleIndexIds) await retry(`delete conflict index ${id}`, () => deleteRow(client, TABLES.conflictIndex, id));
    await retry('mark conflict index ready', () => putRow(client, TABLES.conflictIndex, {
      id: SCHEDULE_CONFLICT_INDEX_READY_ID,
      ready: true,
      updatedAt: now,
      operationId: OPERATION_ID
    }));
    if (plan.deleteLead) await retry(`delete lead ${FAKE_LEAD_ID}`, () => deleteRow(client, TABLES.leads, FAKE_LEAD_ID));
    if (plan.deleteStudent) await retry(`delete student ${FAKE_STUDENT_ID}`, () => deleteRow(client, TABLES.students, FAKE_STUDENT_ID));
  }

  console.log(JSON.stringify({
    ok: true,
    mode: output.mode,
    reportPath,
    requestedActiveCancel: output.requestedActiveCancel,
    scheduleUpdates: output.scheduleUpdates,
    activeCancels: output.activeCancels,
    cleanedCanceledRefs: output.cleanedCanceledRefs,
    skipped: output.skipped,
    deleteStudent: output.deleteStudent,
    deleteLead: output.deleteLead,
    conflictIndexDeleted: output.conflictIndexDeleted
  }, null, 2));
}

if (require.main === module) {
  run().catch(error => {
    console.error(error?.stack || String(error));
    process.exit(1);
  });
}

module.exports = { buildPlan, run };
