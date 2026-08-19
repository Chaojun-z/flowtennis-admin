#!/usr/bin/env node

const fs = require('fs');
const path = require('path');
const { loadRuntimeEnv } = require('./lib/runtime-env');
const {
  createClientFromEnv,
  scanTable,
  putRow,
  createTableIfMissing,
  deleteRow
} = require('./lib/staging-data-store');
const {
  parseWriteFlags,
  assertProductionWriteTarget,
  assertProductionWriteTrace
} = require('./lib/production-write-guard');
const {
  scheduleConflictIndexRowsForRecord,
  staleScheduleConflictIndexRows,
  SCHEDULE_CONFLICT_INDEX_READY_ID
} = require('../server/schedule-conflict-index');

const ROOT = path.join(__dirname, '..');
const OPERATION_ID = 'repair-bind-missing-schedule-students-20260818';
const BATCH_ID = `batch-${OPERATION_ID}`;
const EXPECTED_UNBOUND_COUNT = 18;
const REPORT_DIR = path.join(ROOT, 'offline-reports');
const TABLES = {
  schedule: 'ft_schedule',
  students: 'ft_students',
  conflictIndex: 'ft_schedule_conflict_index'
};

const STUDENT_BINDINGS = new Map([
  ['张昊', { id: 'seed-student-041', name: '张昊' }],
  ['简先生', { id: 'seed-student-009', name: '简先生' }],
  ['小鹿', { id: 'abda0438-bd46-440d-a211-d431a3b1e451', name: '小鹿' }],
  ['张佳良 老大', { id: 'seed-student-027', name: '张佳良老大' }],
  ['丫丫', { id: 'seed-student-007', name: '丫丫' }],
  ['deadia', { id: '94b63112-135c-48d6-9888-f2047702db4f', name: 'Deadia' }],
  ['史多灏', { id: '819727f6-b902-49fd-af87-fdec04716b19', name: '史多灏' }],
  ['赵新阳', { id: 'seed-student-024', name: '赵新阳 田秀楠' }],
  ['张先生', { id: 'f4d9aeed-2d5b-4790-8351-00e83dc89bee', name: '张先生（张昊然）' }],
  ['you', { id: `${OPERATION_ID}-student-you`, name: 'you', create: true }]
]);

function text(value) {
  return String(value ?? '').trim();
}

function parseArr(value) {
  if (Array.isArray(value)) return value;
  if (typeof value === 'string' && value) {
    try {
      const parsed = JSON.parse(value);
      return Array.isArray(parsed) ? parsed : [];
    } catch {
      return [];
    }
  }
  return [];
}

function active(row = {}) {
  const status = text(row.status || row.systemStatus || 'active');
  return !['voided', 'refunded', 'deleted', 'inactive', 'cancelled', 'canceled', '已作废', '已删除', '已取消'].includes(status);
}

function courseText(row = {}) {
  return [
    row.courseType,
    row.standardCourseType,
    row.courseTypeLevel2,
    row.courseDisplayName,
    row.packageCourseType,
    row.type,
    row.productType,
    row.experienceType,
    row.packageName,
    row.productName,
    row.name,
    row.scheduleSource
  ].filter(Boolean).join(' ');
}

function isCompanion(row = {}) {
  return /陪打/.test(courseText(row));
}

function scheduleStudentIds(row = {}) {
  return [...new Set(parseArr(row.studentIds).concat(text(row.studentId)).map(text).filter(Boolean))];
}

function scheduleStudentNames(row = {}) {
  const names = parseArr(row.studentNames).map(text).filter(Boolean);
  const one = text(row.studentName || row.displayName || row.name);
  return names.length ? names : (one ? [one] : []);
}

function timestampMs(value) {
  const ms = Date.parse(text(value).replace(' ', 'T'));
  return Number.isFinite(ms) ? ms : NaN;
}

function isOccurredTeachingSchedule(row = {}, now = new Date()) {
  if (!active(row) || isCompanion(row)) return false;
  const status = text(row.status || row.systemStatus);
  if (['待上课', '待确认', '预约', '已预约'].includes(status)) return false;
  const ms = timestampMs(row.startTime || row.endTime || row.createdAt);
  return Number.isFinite(ms) && ms <= new Date(now).getTime();
}

function remainingUnboundTeachingSchedules(data = {}, now = new Date()) {
  return (data.schedule || [])
    .filter(row => isOccurredTeachingSchedule(row, now))
    .filter(row => scheduleStudentNames(row).length)
    .filter(row => scheduleStudentIds(row).length === 0);
}

function compactName(row = {}) {
  return scheduleStudentNames(row)[0] || text(row.studentName);
}

function findStudent(students = [], studentId = '') {
  const id = text(studentId);
  return (students || []).find(row => text(row.id) === id) || null;
}

function studentRowForBinding(binding, scheduleRow, now) {
  return {
    id: binding.id,
    name: binding.name,
    phone: '',
    type: '',
    source: '',
    campus: text(scheduleRow.campus || scheduleRow.campusName),
    primaryCoach: text(scheduleRow.coach || scheduleRow.coachName),
    sourceLeadId: `lead-from-student-${binding.id}`,
    notes: '按历史排课补建最小学员档案',
    status: 'active',
    createdAt: now,
    updatedAt: now,
    updatedBy: 'Codex',
    operationId: OPERATION_ID,
    batchId: BATCH_ID
  };
}

function bindScheduleRow(row, binding, now) {
  const ids = [binding.id];
  return {
    ...row,
    studentId: binding.id,
    studentIds: ids,
    expectedStudentIds: ids,
    sourceLeadId: text(row.sourceLeadId) || `lead-from-student-${binding.id}`,
    updatedAt: now,
    operationAt: now,
    operationBy: 'Codex',
    operationId: OPERATION_ID,
    operationType: OPERATION_ID,
    batchId: BATCH_ID,
    repairReason: `绑定缺失学员ID：${compactName(row)} -> ${binding.id}`
  };
}

function changed(before = {}, after = {}) {
  return JSON.stringify(before) !== JSON.stringify(after);
}

function buildPlan(data = {}, now = new Date().toISOString(), options = {}) {
  const expectedUnboundCount = Number.isFinite(Number(options.expectedUnboundCount))
    ? Number(options.expectedUnboundCount)
    : EXPECTED_UNBOUND_COUNT;
  const unbound = remainingUnboundTeachingSchedules(data, now);
  const blockers = [];
  if (unbound.length !== expectedUnboundCount) {
    blockers.push({ type: 'unexpected_unbound_count', expected: expectedUnboundCount, actual: unbound.length });
  }

  const studentPuts = [];
  const scheduleUpdates = [];
  const conflictIndexDeletes = [];
  const conflictIndexPuts = [];
  const existingIndexIds = new Set((data.conflictIndex || []).map(row => text(row.id)).filter(Boolean));

  for (const row of unbound) {
    const name = compactName(row);
    const binding = STUDENT_BINDINGS.get(name);
    if (!binding) {
      blockers.push({ type: 'missing_binding', scheduleId: row.id, studentName: name });
      continue;
    }
    const existingStudent = findStudent(data.students, binding.id);
    if (!existingStudent && !binding.create) {
      blockers.push({ type: 'missing_existing_student', scheduleId: row.id, studentName: name, studentId: binding.id });
      continue;
    }
    if (!existingStudent && binding.create && !studentPuts.some(item => item.id === binding.id)) {
      studentPuts.push(studentRowForBinding(binding, row, now));
    }
    const after = bindScheduleRow(row, binding, now);
    if (changed(row, after)) {
      scheduleUpdates.push({ id: row.id, before: row, after });
      staleScheduleConflictIndexRows(row, after).forEach(indexRow => {
        if (existingIndexIds.has(text(indexRow.id))) conflictIndexDeletes.push({ id: indexRow.id, before: indexRow });
      });
      scheduleConflictIndexRowsForRecord(after).forEach(indexRow => {
        conflictIndexPuts.push({ id: indexRow.id, after: { ...indexRow, updatedAt: now, operationId: OPERATION_ID, batchId: BATCH_ID } });
      });
    }
  }

  return { blockers, unbound, studentPuts, scheduleUpdates, conflictIndexDeletes, conflictIndexPuts };
}

function reportPath(write) {
  return path.join(REPORT_DIR, `${OPERATION_ID}-${write ? 'write' : 'dry-run'}.json`);
}

function summarizePlan(plan) {
  return {
    unboundSchedules: plan.unbound.length,
    studentPuts: plan.studentPuts.length,
    scheduleUpdates: plan.scheduleUpdates.length,
    conflictIndexDeletes: plan.conflictIndexDeletes.length,
    conflictIndexPuts: plan.conflictIndexPuts.length,
    blockers: plan.blockers.length
  };
}

async function retry(label, fn, limit = 3) {
  let lastError = null;
  for (let attempt = 1; attempt <= limit; attempt += 1) {
    try {
      return await fn();
    } catch (error) {
      lastError = error;
      if (attempt < limit) await new Promise(resolve => setTimeout(resolve, attempt * 300));
    }
  }
  throw new Error(`${label} failed: ${lastError?.message || lastError}`);
}

async function run() {
  loadRuntimeEnv({ appEnv: 'production', entry: OPERATION_ID });
  const flags = parseWriteFlags(process.argv.slice(2));
  const now = new Date().toISOString();
  const out = reportPath(flags.write);
  const writeTarget = flags.write ? await assertProductionWriteTarget() : null;
  if (flags.write) assertProductionWriteTrace({ operationId: OPERATION_ID, batchId: BATCH_ID, reportPath: out });
  const client = createClientFromEnv();
  const data = {
    schedule: await scanTable(client, TABLES.schedule),
    students: await scanTable(client, TABLES.students),
    conflictIndex: await scanTable(client, TABLES.conflictIndex).catch(() => [])
  };
  const plan = buildPlan(data, now);
  const report = {
    operationId: OPERATION_ID,
    batchId: BATCH_ID,
    mode: flags.write ? 'write' : 'dry-run',
    writeTarget,
    generatedAt: now,
    summary: summarizePlan(plan),
    blockers: plan.blockers,
    studentPuts: plan.studentPuts,
    scheduleUpdates: plan.scheduleUpdates.map(item => ({
      id: item.id,
      before: {
        startTime: item.before.startTime,
        endTime: item.before.endTime,
        status: item.before.status,
        studentName: compactName(item.before),
        studentId: text(item.before.studentId),
        studentIds: scheduleStudentIds(item.before)
      },
      after: {
        startTime: item.after.startTime,
        endTime: item.after.endTime,
        status: item.after.status,
        studentName: compactName(item.after),
        studentId: text(item.after.studentId),
        studentIds: scheduleStudentIds(item.after),
        repairReason: item.after.repairReason
      }
    })),
    conflictIndexDeletes: plan.conflictIndexDeletes.map(item => ({ id: item.id })),
    conflictIndexPuts: plan.conflictIndexPuts.map(item => ({ id: item.id, scheduleId: item.after.scheduleId, indexType: item.after.indexType, indexKey: item.after.indexKey }))
  };
  fs.mkdirSync(REPORT_DIR, { recursive: true });
  fs.writeFileSync(out, `${JSON.stringify(report, null, 2)}\n`, 'utf8');
  if (plan.blockers.length) throw new Error(`存在 blockers，已写报告：${out}`);

  if (flags.write) {
    await retry('create conflict index table', () => createTableIfMissing(client, TABLES.conflictIndex));
    for (const student of plan.studentPuts) await retry(`put student ${student.id}`, () => putRow(client, TABLES.students, student));
    for (const item of plan.scheduleUpdates) await retry(`put schedule ${item.id}`, () => putRow(client, TABLES.schedule, item.after));
    for (const item of plan.conflictIndexDeletes) await retry(`delete conflict index ${item.id}`, () => deleteRow(client, TABLES.conflictIndex, item.id));
    for (const item of plan.conflictIndexPuts) await retry(`put conflict index ${item.id}`, () => putRow(client, TABLES.conflictIndex, item.after));
    await retry('mark conflict index ready', () => putRow(client, TABLES.conflictIndex, {
      id: SCHEDULE_CONFLICT_INDEX_READY_ID,
      ready: true,
      updatedAt: now,
      operationId: OPERATION_ID
    }));
  }

  console.log(JSON.stringify({ ok: true, mode: report.mode, reportPath: out, summary: report.summary }, null, 2));
}

if (require.main === module) {
  run().catch(error => {
    console.error(error?.stack || String(error));
    process.exit(1);
  });
}

module.exports = {
  OPERATION_ID,
  buildPlan,
  remainingUnboundTeachingSchedules
};
