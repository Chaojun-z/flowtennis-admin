#!/usr/bin/env node

const fs = require('fs');
const path = require('path');
const { loadRuntimeEnv } = require('./lib/runtime-env');
const {
  createClientFromEnv,
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
  scheduleConflictIndexRowsForRecord,
  staleScheduleConflictIndexRows
} = require('../server/schedule-conflict-index');

const OPERATION_ID = 'repair-yang-july-schedule-20260816';
const BATCH_ID = `batch-${OPERATION_ID}`;
const REPORT_DIR = path.join(__dirname, '..', 'offline-reports');
const TABLES = {
  schedule: 'ft_schedule',
  conflictIndex: 'ft_schedule_conflict_index'
};

const DESIRED = [
  { id: 'cxe-thirdparty-schedule-90-c4cbc8949580', date: '2026-07-11', start: '17:00', end: '18:00', studentName: '张昊', courseType: '私教课', standardCourseType: '私教正式课', hours: 1 },
  { id: 'repair-yang-july-20260712-1400-you', date: '2026-07-12', start: '14:00', end: '15:00', studentName: 'you', courseType: '体验课', standardCourseType: '私教体验课', hours: 0 },
  { id: 'cxe-play-hit-13901293813-2026-07-1321-37-48--------------400-00----363-69----36-31--3256', date: '2026-07-13', start: '16:00', end: '18:00', studentName: '陪打', courseType: '陪打', standardCourseType: '陪打', hours: 2 },
  { id: 'cxe-thirdparty-schedule-141-4356c920dd50', date: '2026-07-15', start: '19:00', end: '21:00', studentName: '理想团课', courseType: '小班课', standardCourseType: '理想团课', hours: 2 },
  { id: 'repair-yang-july-20260716-1730-companion', date: '2026-07-16', start: '17:30', end: '19:00', studentName: '陪打', courseType: '陪打', standardCourseType: '陪打', hours: 1.5 },
  { id: '45924cf4-fa65-470d-9123-97fec1dbe4e3', date: '2026-07-17', start: '15:00', end: '16:00', studentName: '简先生', courseType: '私教课', standardCourseType: '私教正式课', hours: 1 },
  { id: 'cxe-20260715-0731-schedule-2e1df6563f500e0a', date: '2026-07-17', start: '16:00', end: '18:00', studentName: '小鹿', courseType: '私教课', standardCourseType: '私教正式课', hours: 2 },
  { id: 'cxe-20260715-0731-schedule-66a0077d4fe2048d', date: '2026-07-18', start: '20:30', end: '21:30', studentName: '征途朋友', courseType: '体验课', standardCourseType: '私教体验课', hours: 0 },
  { id: 'cxe-20260715-0731-schedule-cad2da0db6c9c5b0', date: '2026-07-18', start: '17:00', end: '18:00', studentName: '张昊', courseType: '私教课', standardCourseType: '私教正式课', hours: 1 },
  { id: 'b2486b41-ed9a-4a46-92cf-c0adc3eb967b', date: '2026-07-19', start: '10:00', end: '11:00', studentName: '张佳良 老大', courseType: '私教课', standardCourseType: '私教正式课', hours: 1 },
  { id: '745a05a8-cca5-4d08-850c-3f0d83f3abdd', date: '2026-07-19', start: '12:00', end: '13:00', studentName: '赵新阳', courseType: '私教课', standardCourseType: '私教正式课', hours: 1 },
  { id: 'c18cf640-d3da-4920-940c-80f70f6dc139', date: '2026-07-20', start: '15:00', end: '17:00', studentName: '陪打', courseType: '陪打', standardCourseType: '陪打', hours: 2 },
  { id: 'dae1e307-0a03-471c-9444-4963139cfc37', date: '2026-07-21', start: '12:00', end: '13:00', studentName: '初阶训练课', courseType: '小班课', standardCourseType: '团课', courseDisplayName: '初阶训练课', hours: 1 },
  { id: '0cbb8e4f-94ae-420d-b64e-f30614daeda1', date: '2026-07-22', start: '16:30', end: '17:30', studentName: '丫丫', courseType: '私教课', standardCourseType: '私教正式课', hours: 1 },
  { id: 'repair-zhanghaoran-20260723-1730', date: '2026-07-22', start: '17:30', end: '19:30', studentName: '张先生', courseType: '私教课', standardCourseType: '私教正式课', hours: 2 },
  { id: '1fc30fbf-fb6b-40fc-bc1a-1cfa8914c9b1', date: '2026-07-23', start: '16:00', end: '17:00', studentName: '史多灏', courseType: '私教课', standardCourseType: '私教正式课', hours: 1 },
  { id: '7691156b-df07-4ffd-bdc3-7485dcd65a79', date: '2026-07-23', start: '12:00', end: '13:00', studentName: 'deadia', courseType: '私教课', standardCourseType: '私教正式课', hours: 1 },
  { id: 'd7db03ee-9f3f-498a-9b9b-9fb5886aa8ed', date: '2026-07-24', start: '15:00', end: '16:00', studentName: '简先生', courseType: '私教课', standardCourseType: '私教正式课', hours: 1 },
  { id: 'e36e1c32-9d8b-4d5d-ac62-4675ac822014', date: '2026-07-24', start: '16:00', end: '18:00', studentName: '小鹿', courseType: '私教课', standardCourseType: '私教正式课', hours: 2 },
  { id: 'repair-yang-july-20260725-1600-zero-basic-group', date: '2026-07-25', start: '16:00', end: '17:30', studentName: '零基础小班体验课', courseType: '小班课', standardCourseType: '团课', courseDisplayName: '零基础小班体验课', hours: 1.5 },
  { id: 'b5952c07-3925-4439-9b2f-839805023012', date: '2026-07-25', start: '18:00', end: '19:00', studentName: '张先生', courseType: '私教课', standardCourseType: '私教正式课', hours: 1 },
  { id: 'ba1db58c-a99e-47bf-9518-5f04a9ef0571', date: '2026-07-25', start: '19:00', end: '20:00', studentName: '张先生', courseType: '私教课', standardCourseType: '私教正式课', hours: 1 },
  { id: '522aaa5b-3dc5-427b-89e7-f136dd9dd994', date: '2026-07-26', start: '10:00', end: '11:30', studentName: '初阶训练课', courseType: '小班课', standardCourseType: '团课', courseDisplayName: '初阶训练课', hours: 1.5 },
  { id: '8c45afc7-eaf0-4af0-84bd-04004e49449c', date: '2026-07-26', start: '12:00', end: '13:30', studentName: '发接发专项课', courseType: '小班课', standardCourseType: '团课', courseDisplayName: '发接发专项课', hours: 1.5 },
  { id: '8b999215-aa62-44c0-a69e-5e8e3ea6481b', date: '2026-07-26', start: '17:00', end: '19:00', studentName: '张先生', courseType: '私教课', standardCourseType: '私教正式课', hours: 2 },
  { id: '247ef588-fa56-4706-ab2d-6b808bdd2739', date: '2026-07-26', start: '15:00', end: '16:00', studentName: '青少年团课', courseType: '小班课', standardCourseType: '团课', courseDisplayName: '青少年团课', hours: 1 },
  { id: 'd33d766f-5420-4573-bdc8-9517112845a2', date: '2026-07-27', start: '15:00', end: '17:00', studentName: '陪打', courseType: '陪打', standardCourseType: '陪打', hours: 2 },
  { id: '6b59b12f-0166-4a9a-9b89-85915bbf78f2', date: '2026-07-29', start: '17:00', end: '19:00', studentName: '小鹿', courseType: '私教课', standardCourseType: '私教正式课', hours: 2 },
  { id: '39a05c2d-f749-4f58-84aa-02118a20178d', date: '2026-07-30', start: '16:00', end: '18:00', studentName: '张先生', courseType: '私教课', standardCourseType: '私教正式课', hours: 2 },
  { id: '69d7799b-caa1-41ef-80fb-340fa1fc47d5', date: '2026-07-30', start: '14:00', end: '15:00', studentName: '陪打', courseType: '陪打', standardCourseType: '陪打', hours: 1 },
  { id: 'c850691d-f94e-48e7-a7de-dc710085b5c4', date: '2026-07-31', start: '12:00', end: '13:00', studentName: '零基础小班体验课', courseType: '小班课', standardCourseType: '团课', courseDisplayName: '零基础小班体验课', hours: 1 }
];

function reportPath(write) {
  return path.join(REPORT_DIR, `${OPERATION_ID}-${write ? 'write' : 'dry-run'}.json`);
}

function text(value) {
  return String(value ?? '').trim();
}

function active(row = {}) {
  return text(row.status || '已排课') !== '已取消';
}

function dateOf(row = {}) {
  return text(row.startTime || row.date || row.createdAt).slice(0, 10);
}

function scheduleCoach(row = {}) {
  return text(row.coach || row.coachName || row.primaryCoach || row.teacher);
}

function desiredStart(row) {
  return `${row.date} ${row.start}`;
}

function desiredEnd(row) {
  return `${row.date} ${row.end}`;
}

function timed(row) {
  return `${row.date} ${row.start}-${row.end}`;
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

function nextScheduleRow(before, desired, now) {
  const courseDisplayName = desired.courseDisplayName || desired.standardCourseType || desired.courseType;
  return trace({
    ...(before || {}),
    id: desired.id,
    coach: '杨教练',
    coachName: '杨教练',
    campus: before?.campus || 'shunyi_mapo',
    campusName: before?.campusName || '顺义马坡',
    startTime: desiredStart(desired),
    endTime: desiredEnd(desired),
    date: desired.date,
    status: '已排课',
    systemStatus: '已排课',
    state: '已排课',
    studentName: desired.studentName,
    studentNames: [desired.studentName],
    studentId: '',
    studentIds: [],
    expectedStudentIds: [],
    courseType: desired.courseType,
    standardCourseType: desired.standardCourseType,
    courseDisplayName,
    courseTypeLevel2: courseDisplayName,
    lessonCount: desired.hours,
    durationHours: desired.hours,
    hours: desired.hours,
    isTrial: desired.courseType === '体验课',
    scheduleSource: before?.scheduleSource || 'manual-repair',
    source: before?.source || 'manual-repair'
  }, now, `按用户确认的杨教练7月课表修复：${timed(desired)} ${desired.studentName}`);
}

function cancelScheduleRow(before, now) {
  return trace({
    ...before,
    status: '已取消',
    systemStatus: '已取消',
    state: '已取消',
    cancelledAt: now
  }, now, '不在用户确认的杨教练7月课表中，清理为已取消');
}

function comparable(row = {}) {
  const ignore = new Set(['updatedAt', 'operationAt', 'operationId', 'batchId', 'operationType', 'operationBy', 'repairReason']);
  return Object.fromEntries(Object.entries(row).filter(([key]) => !ignore.has(key)).sort(([a], [b]) => a.localeCompare(b)));
}

function changed(before, after) {
  return JSON.stringify(comparable(before || {})) !== JSON.stringify(comparable(after || {}));
}

function appendPut(plan, table, before, after) {
  if (!changed(before, after)) return;
  plan[table].push({ before: before || null, after });
}

function appendDelete(plan, table, before) {
  if (!before) return;
  plan[`${table}Deletes`].push({ before, after: null });
}

function findIndexRow(rows, id) {
  return rows.find(row => text(row.id) === text(id)) || null;
}

function planConflictIndex(plan, existingIndex, before, after) {
  staleScheduleConflictIndexRows(before || {}, after || {}).forEach(row => {
    const existing = findIndexRow(existingIndex, row.id);
    if (existing) appendDelete(plan, 'conflictIndex', existing);
  });
  scheduleConflictIndexRowsForRecord(after || {}).forEach(row => {
    appendPut(plan, 'conflictIndex', findIndexRow(existingIndex, row.id), row);
  });
}

function buildPlan(data, now) {
  const byId = new Map(data.schedule.map(row => [text(row.id), row]));
  const plan = { schedule: [], conflictIndex: [], conflictIndexDeletes: [], blockers: [], desiredCount: DESIRED.length };
  const desiredIds = new Set(DESIRED.map(row => row.id));

  for (const desired of DESIRED) {
    const before = byId.get(desired.id) || null;
    const after = nextScheduleRow(before, desired, now);
    appendPut(plan, 'schedule', before, after);
    planConflictIndex(plan, data.conflictIndex, before, after);
  }

  data.schedule
    .filter(row => scheduleCoach(row) === '杨教练')
    .filter(row => dateOf(row) >= '2026-07-01' && dateOf(row) <= '2026-07-31')
    .filter(active)
    .filter(row => !desiredIds.has(text(row.id)))
    .forEach(row => {
      const after = cancelScheduleRow(row, now);
      appendPut(plan, 'schedule', row, after);
      planConflictIndex(plan, data.conflictIndex, row, after);
    });

  return plan;
}

async function main() {
  loadRuntimeEnv();
  const flags = parseWriteFlags(process.argv.slice(2));
  const out = reportPath(flags.write);
  const now = new Date().toISOString();
  const writeTarget = flags.write ? await assertProductionWriteTarget() : null;
  if (flags.write) assertProductionWriteTrace({ operationId: OPERATION_ID, batchId: BATCH_ID, reportPath: out });
  const client = createClientFromEnv();
  const data = {
    schedule: await scanTable(client, TABLES.schedule),
    conflictIndex: await scanTable(client, TABLES.conflictIndex).catch(() => [])
  };
  const plan = buildPlan(data, now);
  const report = {
    operationId: OPERATION_ID,
    batchId: BATCH_ID,
    mode: flags.write ? 'write' : 'dry-run',
    writeTarget,
    generatedAt: now,
    summary: {
      desiredRows: DESIRED.length,
      schedulePuts: plan.schedule.length,
      conflictIndexPuts: plan.conflictIndex.length,
      conflictIndexDeletes: plan.conflictIndexDeletes.length,
      blockers: plan.blockers.length
    },
    desiredRows: DESIRED.map(row => ({ ...row, startTime: desiredStart(row), endTime: desiredEnd(row) })),
    blockers: plan.blockers,
    scheduleUpdates: plan.schedule.map(item => ({
      id: item.after.id,
      before: item.before ? {
        startTime: item.before.startTime,
        endTime: item.before.endTime,
        studentName: item.before.studentName,
        courseType: item.before.courseType,
        standardCourseType: item.before.standardCourseType,
        lessonCount: item.before.lessonCount,
        status: item.before.status
      } : null,
      after: {
        startTime: item.after.startTime,
        endTime: item.after.endTime,
        studentName: item.after.studentName,
        courseType: item.after.courseType,
        standardCourseType: item.after.standardCourseType,
        lessonCount: item.after.lessonCount,
        status: item.after.status,
        repairReason: item.after.repairReason
      }
    })),
    conflictIndexUpdates: plan.conflictIndex.map(item => ({ id: item.after.id, status: item.after.status, scheduleId: item.after.scheduleId })),
    conflictIndexDeletes: plan.conflictIndexDeletes.map(item => ({ id: item.before.id, scheduleId: item.before.scheduleId }))
  };
  fs.mkdirSync(path.dirname(out), { recursive: true });
  fs.writeFileSync(out, `${JSON.stringify(report, null, 2)}\n`);
  if (plan.blockers.length) throw new Error(`存在 blockers，已写报告：${out}`);
  if (flags.write) {
    for (const item of plan.schedule) await putRow(client, TABLES.schedule, item.after);
    for (const item of plan.conflictIndexDeletes) await deleteRow(client, TABLES.conflictIndex, item.before.id);
    for (const item of plan.conflictIndex) await putRow(client, TABLES.conflictIndex, item.after);
  }
  console.log(JSON.stringify({ ok: true, report: out, summary: report.summary }, null, 2));
}

main().catch(err => {
  console.error(err && err.stack ? err.stack : err);
  process.exit(1);
});
