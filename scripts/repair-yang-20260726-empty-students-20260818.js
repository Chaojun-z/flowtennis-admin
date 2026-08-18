#!/usr/bin/env node

const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
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
const { normalizeNameKey } = require('../server/feishu-schedule-sync-routes');
const {
  scheduleConflictIndexRowsForRecord,
  SCHEDULE_CONFLICT_INDEX_READY_ID
} = require('../server/schedule-conflict-index');

const ROOT = path.join(__dirname, '..');
const OPERATION_ID = 'repair-yang-20260726-empty-students-20260818';
const BATCH_ID = `batch-${OPERATION_ID}`;
const REPORT_DIR = path.join(ROOT, 'offline-reports');

const TABLES = {
  schedule: 'ft_schedule',
  students: 'ft_students',
  leads: 'ft_leads',
  conflictIndex: 'ft_schedule_conflict_index'
};

const STUDENTS = {
  wangyouli: { id: '7c610f7c-8139-46ce-90b8-ec9e681741e3', name: '王有理', leadId: 'lead-from-student-7c610f7c-8139-46ce-90b8-ec9e681741e3' },
  aisi: { id: 'new-student-9f2faf5f3ee4', name: '艾斯', leadId: '' },
  lipenghao: { id: 'seed-student-042', name: '李鹏昊', leadId: 'c4c14aea-f3e2-422a-985b-f69ec07433e9' },
  poppy: { id: '05379b34-dc4b-476e-88c7-af248fc6e79f', name: 'poppy yu', leadId: 'lead-from-student-05379b34-dc4b-476e-88c7-af248fc6e79f' },
  yiming: { id: 'ed545b83-cfd0-4d39-894b-d5ddfb7a3b0e', name: '伊明', leadId: 'lead-from-student-ed545b83-cfd0-4d39-894b-d5ddfb7a3b0e' },
  zhanghao: { id: 'seed-student-041', name: '张昊', leadId: '4f5bd486-88f6-4e9d-925f-cc757f16e510' },
  xiaozhu: { id: 'cf5c0cc0-b758-45d4-a18a-a8bcf5f6e486', name: '笑逐', leadId: 'lead-from-student-cf5c0cc0-b758-45d4-a18a-a8bcf5f6e486' },
  rabbit: { id: '0bf7004b-4160-4749-9e02-d58b7b072e96', name: '🐰🐰🐰🐰🐰', leadId: 'd1b3267f-c95b-4ee1-8cf4-1cb9ed6d4b4b' },
  aiwei: { id: 'repair-student-20260818-aiwei', name: '🌞艾薇', leadId: '1a5a25ea-bcb1-4b38-8f13-58b4172e2ace' },
  friend: { id: 'repair-student-20260818-friend', name: '朋友', leadId: 'repair-lead-20260818-friend' },
  jay: { id: '5db707b6-4e1f-499d-ab09-889ff7598d97', name: 'Jay', leadId: 'f5c060f8-22d5-4b7d-ba28-ccfe98b22e7c' },
  yangguang: { id: 'b38a521d-7fc2-4e53-9e59-4224d530e680', name: '阳光正好', leadId: '2fb416c3-6519-4627-ad55-cc363597a2a1' }
};

const RULES = [
  {
    id: '522aaa5b-3dc5-427b-89e7-f136dd9dd994',
    students: [STUDENTS.wangyouli, STUDENTS.aisi, STUDENTS.lipenghao],
    courseName: '初阶训练课体验课/正式课'
  },
  {
    id: '8c45afc7-eaf0-4af0-84bd-04004e49449c',
    students: [STUDENTS.poppy, STUDENTS.yiming, STUDENTS.zhanghao],
    courseName: '【2.5-3.0】发接发与实战练习'
  },
  {
    id: '247ef588-fa56-4706-ab2d-6b808bdd2739',
    students: [STUDENTS.xiaozhu],
    courseName: '青少年团课'
  },
  {
    id: 'repair-yang-july-20260725-1600-zero-basic-group',
    students: [STUDENTS.rabbit, STUDENTS.aiwei, STUDENTS.friend],
    courseName: '零基础小班体验课'
  },
  {
    id: 'c850691d-f94e-48e7-a7de-dc710085b5c4',
    students: [STUDENTS.jay, STUDENTS.yangguang],
    courseName: '零基础小班体验课'
  }
];

function text(value) {
  return String(value ?? '').trim();
}

function stableId(prefix, value) {
  const hash = crypto.createHash('sha1').update(normalizeNameKey(value)).digest('hex').slice(0, 12);
  return `${prefix}-${hash}`;
}

function active(row = {}) {
  const status = text(row.status || '已排课');
  return !['已取消', 'cancelled', 'deleted', 'voided'].includes(status);
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

function buildLead(student, schedule, now, existing = {}) {
  return trace({
    ...existing,
    id: student.leadId || stableId('repair-lead-20260818', student.name),
    name: student.name,
    displayName: student.name,
    wechatName: student.name,
    phone: text(existing.phone),
    source: text(existing.source) || '历史排课修复',
    campus: text(existing.campus || schedule.campus) || 'shunyi_mapo',
    customerType: text(existing.customerType) || '青少年',
    demandProduct: '零基础小班体验课',
    consultType: '零基础小班体验课',
    rawStatus: text(existing.rawStatus) || '已成交',
    systemStatus: text(existing.systemStatus) || '已成交',
    leadStage: text(existing.leadStage) || '已成交',
    status: text(existing.status) || 'active',
    studentId: student.id,
    profileNote: text(existing.profileNote) || '历史排课脏数据修复：按用户确认补建学员档案',
    createdAt: existing.createdAt || now
  }, now, '用户确认：零基础小班体验课补建线索/学员并绑定排课');
}

function buildStudent(student, schedule, now) {
  return trace({
    id: student.id,
    name: student.name,
    studentName: student.name,
    displayName: student.name,
    phone: '',
    campus: text(schedule.campus) || 'shunyi_mapo',
    type: '青少年',
    primaryCoach: text(schedule.coach || schedule.coachName),
    source: '历史排课修复',
    sourceLeadId: student.leadId,
    status: 'active',
    notes: '历史排课脏数据修复：补建零基础小班体验课学员档案',
    createdAt: now
  }, now, '用户确认：零基础小班体验课补建学员档案');
}

function patchSchedule(row, rule, now) {
  const names = rule.students.map(item => item.name);
  const ids = rule.students.map(item => item.id);
  return trace({
    ...row,
    studentName: names.join('、'),
    studentNames: names,
    studentId: ids.length === 1 ? ids[0] : '',
    studentIds: ids,
    expectedStudentIds: ids,
    sourceLeadId: ids.length === 1 ? rule.students[0].leadId : '',
    sourceLeadName: names.join('、'),
    courseType: '小班课',
    standardCourseType: rule.courseName,
    courseDisplayName: rule.courseName,
    courseTypeLevel2: rule.courseName
  }, now, '用户反馈：7.26 杨教练排课页面显示“学员”，按飞书排课表补真实学员');
}

function emptyStudentRows(rows = []) {
  return rows
    .filter(active)
    .filter(row => !text(row.studentName) && !(Array.isArray(row.studentIds) && row.studentIds.length))
    .map(row => ({
      id: row.id,
      startTime: row.startTime,
      endTime: row.endTime,
      coach: row.coach || row.coachName,
      venue: row.venue || row.courtName,
      courseType: row.courseType,
      standardCourseType: row.standardCourseType,
      notes: row.notes
    }));
}

function buildPlan({ schedules, students, leads, conflictIndex, now }) {
  const scheduleById = new Map(schedules.map(row => [text(row.id), row]));
  const studentById = new Map(students.map(row => [text(row.id), row]));
  const leadById = new Map((leads || []).map(row => [text(row.id), row]));
  const updates = [];
  const skipped = [];
  const leadPuts = [];
  const studentPuts = [];

  for (const rule of RULES) {
    const before = scheduleById.get(rule.id);
    if (!active(before)) {
      skipped.push({ id: rule.id, reason: '排课不存在或已取消' });
      continue;
    }
    const missing = rule.students.filter(student => !studentById.has(student.id));
    for (const student of missing) {
      const existingLead = leadById.get(text(student.leadId)) || {};
      const lead = buildLead(student, before, now, existingLead);
      const studentRow = buildStudent({ ...student, leadId: lead.id }, before, now);
      leadPuts.push(lead);
      studentPuts.push(studentRow);
      leadById.set(lead.id, lead);
      studentById.set(studentRow.id, studentRow);
    }
    const stillMissing = rule.students.filter(student => !studentById.has(student.id));
    if (stillMissing.length) {
      skipped.push({ id: rule.id, reason: `学员档案不存在：${stillMissing.map(item => item.name).join('、')}` });
      continue;
    }
    updates.push({ id: rule.id, before, after: patchSchedule(before, rule, now) });
  }

  const affectedIds = new Set(updates.map(item => item.id));
  const staleIndexIds = (conflictIndex || [])
    .filter(row => affectedIds.has(text(row.scheduleId)))
    .map(row => text(row.id))
    .filter(id => id && id !== SCHEDULE_CONFLICT_INDEX_READY_ID);

  const afterRows = updates.reduce(
    (rows, item) => rows.map(row => text(row.id) === item.id ? item.after : row),
    schedules
  );

  return {
    updates,
    skipped,
    leadPuts,
    studentPuts,
    emptyStudentRowsAfterPlan: emptyStudentRows(afterRows),
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
    scheduleUpdates: plan.updates.length,
    createdLeads: plan.leadPuts.length,
    createdStudents: plan.studentPuts.length,
    skipped: plan.skipped.length,
    emptyStudentRowsAfterPlan: plan.emptyStudentRowsAfterPlan,
    conflictIndexDeleted: plan.conflictIndex.staleIndexIds.length,
    conflictIndexPut: plan.conflictIndex.nextIndexRows.length,
    updates: plan.updates.map(item => ({
      id: item.id,
      startTime: item.before.startTime,
      endTime: item.before.endTime,
      beforeStudentName: item.before.studentName,
      beforeStudentIds: item.before.studentIds,
      afterStudentName: item.after.studentName,
      afterStudentIds: item.after.studentIds,
      afterCourseDisplayName: item.after.courseDisplayName
    })),
    skippedItems: plan.skipped,
    createdStudentRows: plan.studentPuts.map(row => ({ id: row.id, name: row.name, sourceLeadId: row.sourceLeadId })),
    plan
  };
  fs.mkdirSync(REPORT_DIR, { recursive: true });
  fs.writeFileSync(reportPath, `${JSON.stringify(output, null, 2)}\n`, 'utf8');

  if (args.write) {
    await retry('create conflict index table', () => createTableIfMissing(client, TABLES.conflictIndex));
    for (const lead of plan.leadPuts) await retry(`put lead ${lead.id}`, () => putRow(client, TABLES.leads, lead));
    for (const student of plan.studentPuts) await retry(`put student ${student.id}`, () => putRow(client, TABLES.students, student));
    for (const item of plan.updates) await retry(`put schedule ${item.id}`, () => putRow(client, TABLES.schedule, item.after));
    for (const id of plan.conflictIndex.staleIndexIds) await retry(`delete conflict index ${id}`, () => deleteRow(client, TABLES.conflictIndex, id));
    for (const row of plan.conflictIndex.nextIndexRows) await retry(`put conflict index ${row.id}`, () => putRow(client, TABLES.conflictIndex, row));
    await retry('mark conflict index ready', () => putRow(client, TABLES.conflictIndex, {
      id: SCHEDULE_CONFLICT_INDEX_READY_ID,
      ready: true,
      updatedAt: now,
      operationId: OPERATION_ID
    }));
  }

  console.log(JSON.stringify({
    ok: true,
    mode: output.mode,
    reportPath,
    scheduleUpdates: output.scheduleUpdates,
    createdLeads: output.createdLeads,
    createdStudents: output.createdStudents,
    skipped: output.skipped,
    emptyStudentRowsAfterPlan: output.emptyStudentRowsAfterPlan.length,
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

module.exports = { buildPlan, emptyStudentRows, run };
