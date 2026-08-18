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
const {
  scheduleConflictIndexRowsForRecord,
  SCHEDULE_CONFLICT_INDEX_READY_ID
} = require('../server/schedule-conflict-index');

const ROOT = path.join(__dirname, '..');
const OPERATION_ID = 'repair-confirmed-display-and-course-note-student-names-20260818';
const BATCH_ID = `batch-${OPERATION_ID}`;
const REPORT_DIR = path.join(ROOT, 'offline-reports');

const TABLES = {
  schedule: 'ft_schedule',
  students: 'ft_students',
  leads: 'ft_leads',
  conflictIndex: 'ft_schedule_conflict_index'
};

const STUDENTS = {
  tangguo: { id: 'b3c1c399-b209-4e9e-af56-80b74c7270ac', name: '唐果', leadId: 'lead-from-student-b3c1c399-b209-4e9e-af56-80b74c7270ac' },
  liuyisi: { id: '75d21c85-1603-46f5-a6d1-31e581672bb4', name: '刘易斯', leadId: '9e55f6a9-eb26-4501-b2f7-369c268df7af' },
  gechao: { id: 'new-student-39d586968447', name: '葛超', leadId: 'f83b4eb1-b5ab-464c-b7a2-165ded97f16b' },
  madison: { id: 'new-student-2655598760aa', name: 'Madison He', leadId: '5725d154-322c-44d7-b5ff-e9cc4a56f8c6' },
  zhang: { id: '550de4d7-222b-4f0c-a212-2bdb039e6cc8', name: '张老师（北体大领导）', leadId: 'lead-from-student-550de4d7-222b-4f0c-a212-2bdb039e6cc8' },
  gao: { id: 'seed-student-030', name: '高老师（暖暖爸爸）', leadId: 'lead-from-student-seed-student-030' }
};

const BIND_RULES = new Map([
  ['cxe-thirdparty-202606-schedule-d0d06e18dd15', { students: [STUDENTS.gechao, STUDENTS.madison], courseType: '体验课', standardCourseType: '成人私教【体验】' }],
  ['cxe-thirdparty-202606-schedule-1942a22e2268', { students: [STUDENTS.gechao, STUDENTS.madison], courseType: '体验课', standardCourseType: '成人私教【体验】' }],
  ['repair-yang-july-20260716-1730-companion', { students: [STUDENTS.tangguo], courseType: '陪打', standardCourseType: '陪打' }],
  ['cxe-play-hit-13901293813-2026-07-1321-37-48--------------400-00----363-69----36-31--3256', { students: [STUDENTS.tangguo], courseType: '陪打', standardCourseType: '陪打' }],
  ['c18cf640-d3da-4920-940c-80f70f6dc139', { students: [STUDENTS.tangguo], courseType: '陪打', standardCourseType: '陪打' }],
  ['d33d766f-5420-4573-bdc8-9517112845a2', { students: [STUDENTS.tangguo], courseType: '陪打', standardCourseType: '陪打' }],
  ['69d7799b-caa1-41ef-80fb-340fa1fc47d5', { students: [STUDENTS.liuyisi], courseType: '陪打', standardCourseType: '陪打' }],
  ['cxe-thirdparty-202606-schedule-c79ccde6f1e4', { students: [STUDENTS.zhang], courseType: '私教课', standardCourseType: '私教课' }],
  ['d5b7308a-63ab-45d1-9f0b-af3ff6dc98e0', { students: [STUDENTS.zhang], courseType: '私教课', standardCourseType: '私教课' }],
  ['61ee3e48-8c4a-4bf8-a6e8-30508095b87d', { students: [STUDENTS.gao], courseType: '私教课', standardCourseType: '私教课' }],
  ['34d55560-15b3-4701-9216-0b5a2fcb60b1', { students: [STUDENTS.gao], courseType: '私教课', standardCourseType: '私教课' }],
  ['ce7bb835-151a-4594-8ca5-713946cedaf5', { students: [STUDENTS.gao], courseType: '私教课', standardCourseType: '私教课' }]
]);

const COURSE_NOTE_SCHEDULE_IDS = new Set([
  '247ef588-fa56-4706-ab2d-6b808bdd2739',
  '522aaa5b-3dc5-427b-89e7-f136dd9dd994',
  '8c45afc7-eaf0-4af0-84bd-04004e49449c',
  'c850691d-f94e-48e7-a7de-dc710085b5c4',
  'repair-yang-july-20260725-1600-zero-basic-group'
]);

const DELETE_STUDENT_IDS = new Set(['cxe-thirdparty-202606-student-ded0c26a6ff6']);
const DELETE_LEAD_IDS = new Set(['lead-from-student-cxe-thirdparty-202606-student-ded0c26a6ff6']);

function text(value) {
  return String(value ?? '').trim();
}

function active(row) {
  return row && text(row.status || '已排课') !== '已取消';
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

function displayName(students) {
  return students.map(item => item.name).join('、');
}

function sourceLeadId(students) {
  return students.length === 1 ? students[0].leadId : '';
}

function bindPatch(row, rule, now) {
  const names = rule.students.map(item => item.name);
  const ids = rule.students.map(item => item.id);
  const courseType = rule.courseType || row.courseType || '';
  const standardCourseType = rule.standardCourseType || row.standardCourseType || courseType;
  return trace({
    ...row,
    studentName: displayName(rule.students),
    studentNames: names,
    studentId: ids.length === 1 ? ids[0] : '',
    studentIds: ids,
    expectedStudentIds: ids,
    sourceLeadId: sourceLeadId(rule.students),
    sourceLeadName: ids.length === 1 ? names[0] : '',
    courseType,
    standardCourseType,
    courseDisplayName: standardCourseType,
    courseTypeLevel2: courseType === '陪打' ? '陪打' : row.courseTypeLevel2 || '',
    experienceType: /体验/.test(standardCourseType) ? '成人' : row.experienceType || '',
    isTrial: /体验/.test(standardCourseType) ? true : row.isTrial || false
  }, now, '用户确认：按真实学员绑定并展示系统内学员名称');
}

function courseNotePatch(row, now) {
  const originalName = text(row.studentName);
  const note = originalName
    ? `${text(row.notes)}；原学员名“${originalName}”经确认是排课备注，不是学员名`.replace(/^；/, '')
    : text(row.notes);
  return trace({
    ...row,
    studentName: '',
    studentNames: [],
    studentId: '',
    studentIds: [],
    expectedStudentIds: [],
    sourceLeadId: '',
    sourceLeadName: '',
    notes: note,
    courseDisplayName: text(row.courseDisplayName) || originalName || text(row.standardCourseType || row.courseType)
  }, now, '用户确认：课程名/备注不是学员名，清空学员字段并保留排课');
}

function buildPlan({ schedules, students, leads, conflictIndex, now }) {
  const scheduleById = new Map(schedules.map(row => [text(row.id), row]));
  const studentById = new Map(students.map(row => [text(row.id), row]));
  const leadById = new Map(leads.map(row => [text(row.id), row]));
  const updates = [];
  const skipped = [];

  for (const [id, rule] of BIND_RULES.entries()) {
    const before = scheduleById.get(id);
    if (!active(before)) {
      skipped.push({ id, action: 'bind', reason: '排课不存在或已取消' });
      continue;
    }
    const missingStudents = rule.students.filter(item => !studentById.has(item.id));
    if (missingStudents.length) {
      skipped.push({ id, action: 'bind', reason: `学员档案不存在：${missingStudents.map(item => item.name).join('、')}` });
      continue;
    }
    updates.push({ id, action: 'bindRealStudent', before, after: bindPatch(before, rule, now) });
  }

  for (const id of COURSE_NOTE_SCHEDULE_IDS) {
    const before = scheduleById.get(id);
    if (!active(before)) {
      skipped.push({ id, action: 'clearCourseNoteStudentName', reason: '排课不存在或已取消' });
      continue;
    }
    updates.push({ id, action: 'clearCourseNoteStudentName', before, after: courseNotePatch(before, now) });
  }

  const affectedIds = new Set(updates.map(item => item.id));
  const staleIndexIds = (conflictIndex || [])
    .filter(row => affectedIds.has(text(row.scheduleId)))
    .map(row => text(row.id))
    .filter(id => id && id !== SCHEDULE_CONFLICT_INDEX_READY_ID);

  const deleteStudentIds = [...DELETE_STUDENT_IDS].filter(id => studentById.has(id));
  const deleteLeadIds = [...DELETE_LEAD_IDS].filter(id => leadById.has(id));
  return {
    updates,
    skipped,
    deleteStudentIds,
    deleteLeadIds,
    conflictIndex: {
      staleIndexIds,
      nextIndexRows: updates.flatMap(item => scheduleConflictIndexRowsForRecord(item.after))
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
    bindUpdates: plan.updates.filter(item => item.action === 'bindRealStudent').length,
    courseNoteClears: plan.updates.filter(item => item.action === 'clearCourseNoteStudentName').length,
    skipped: plan.skipped.length,
    deleteStudents: plan.deleteStudentIds.length,
    deleteLeads: plan.deleteLeadIds.length,
    conflictIndexDeleted: plan.conflictIndex.staleIndexIds.length,
    conflictIndexPut: plan.conflictIndex.nextIndexRows.length,
    schedules: plan.updates.map(item => ({
      id: item.id,
      action: item.action,
      startTime: item.before.startTime,
      endTime: item.before.endTime,
      beforeStudentName: item.before.studentName,
      beforeStudentIds: item.before.studentIds,
      afterStudentName: item.after.studentName,
      afterStudentIds: item.after.studentIds,
      afterCourseDisplayName: item.after.courseDisplayName
    })),
    skippedItems: plan.skipped,
    deleteStudentIds: plan.deleteStudentIds,
    deleteLeadIds: plan.deleteLeadIds,
    plan
  };
  fs.mkdirSync(REPORT_DIR, { recursive: true });
  fs.writeFileSync(reportPath, `${JSON.stringify(output, null, 2)}\n`, 'utf8');

  if (args.write) {
    await retry('create conflict index table', () => createTableIfMissing(client, TABLES.conflictIndex));
    for (const item of plan.updates) await retry(`put schedule ${item.id}`, () => putRow(client, TABLES.schedule, item.after));
    for (const id of plan.conflictIndex.staleIndexIds) await retry(`delete conflict index ${id}`, () => deleteRow(client, TABLES.conflictIndex, id));
    for (const row of plan.conflictIndex.nextIndexRows) await retry(`put conflict index ${row.id}`, () => putRow(client, TABLES.conflictIndex, row));
    await retry('mark conflict index ready', () => putRow(client, TABLES.conflictIndex, {
      id: SCHEDULE_CONFLICT_INDEX_READY_ID,
      ready: true,
      updatedAt: now,
      operationId: OPERATION_ID
    }));
    for (const id of plan.deleteLeadIds) await retry(`delete lead ${id}`, () => deleteRow(client, TABLES.leads, id));
    for (const id of plan.deleteStudentIds) await retry(`delete student ${id}`, () => deleteRow(client, TABLES.students, id));
  }

  console.log(JSON.stringify({
    ok: true,
    mode: output.mode,
    reportPath,
    bindUpdates: output.bindUpdates,
    courseNoteClears: output.courseNoteClears,
    skipped: output.skipped,
    deleteStudents: output.deleteStudents,
    deleteLeads: output.deleteLeads,
    conflictIndexDeleted: output.conflictIndexDeleted,
    conflictIndexPut: output.conflictIndexPut
  }, null, 2));
}

if (require.main === module) {
  run().catch(error => {
    console.error(error?.stack || String(error));
    process.exit(1);
  });
}

module.exports = { buildPlan, run };
