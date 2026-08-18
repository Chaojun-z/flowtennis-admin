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
const OPERATION_ID = 'repair-confirmed-group-and-note-student-names-20260818';
const BATCH_ID = `batch-${OPERATION_ID}`;
const REPORT_DIR = path.join(ROOT, 'offline-reports');

const TABLES = {
  schedule: 'ft_schedule',
  students: 'ft_students',
  leads: 'ft_leads',
  conflictIndex: 'ft_schedule_conflict_index'
};

const CONFIRMED_STUDENTS = {
  taozi: { id: 'ed8fdf10-5f45-4c66-8a0b-9348d239ce81', name: '桃子（曹沐言）', leadId: 'lead-from-student-ed8fdf10-5f45-4c66-8a0b-9348d239ce81' },
  mitao: { id: '9fdfffe7-3607-4aae-ae63-462d77f99283', name: '蜜桃（张爱崴）', leadId: 'lead-from-student-9fdfffe7-3607-4aae-ae63-462d77f99283' },
  hanghang: { id: '19d5092f-cf4b-41a5-82a4-e2aa8d27803a', name: '胡可航（航航）', leadId: 'lead-from-student-19d5092f-cf4b-41a5-82a4-e2aa8d27803a' },
  xianfeng: { id: 'repair-student-20260818-ecc8a9dd67ec', name: '显峰（京长发，鑫长发）', leadId: '3321cba5-febc-4c86-9186-d5e8a8205733' },
  youzhi: { id: 'afa0ad1b-d7f8-49e2-b53a-b9db0fd4bbf5', name: '有知有行团课', leadId: 'lead-from-student-afa0ad1b-d7f8-49e2-b53a-b9db0fd4bbf5' },
  ideal: { id: 'student-ideal-group-enterprise', name: '理想团课', leadId: '' },
  lijunze: { id: 'seed-student-044', name: '李俊泽', leadId: 'lead-from-student-seed-student-044' }
};

const CREATE_STUDENT_NAMES = new Set(['白沐凡', '小白', 'yx', '显峰（京长发，鑫长发）']);

const BIND_RULES = [
  ['02c79e1d-b581-4d05-b6bc-0da1baa0ca83', CONFIRMED_STUDENTS.youzhi],
  ['065174fd-7c83-4282-a44f-26c8c8c70de9', CONFIRMED_STUDENTS.youzhi],
  ['094ad321-eac6-4b09-a031-645fa81d43f3', CONFIRMED_STUDENTS.youzhi],
  ['3d4b2856-6107-4f42-8b6d-4690d9c88f32', CONFIRMED_STUDENTS.youzhi],
  ['42c2c5bb-0ec7-4a0e-9320-db748d6a55a7', CONFIRMED_STUDENTS.youzhi],
  ['4fa2e030-6f39-4003-b943-254bb2069e01', CONFIRMED_STUDENTS.youzhi],
  ['550c6801-86a0-4a7f-a52f-39a1204cb230', CONFIRMED_STUDENTS.youzhi],
  ['5f33f284-b491-4feb-8610-de94faf5ebd7', CONFIRMED_STUDENTS.youzhi],
  ['970f61cc-bc0a-4b35-8080-fbe774915eef', CONFIRMED_STUDENTS.youzhi],
  ['fae9bad5-1c74-47b4-a49f-d7f9e384ffb0', CONFIRMED_STUDENTS.youzhi],
  ['cxe-thirdparty-schedule-141-4356c920dd50', CONFIRMED_STUDENTS.ideal],
  ['f116428b-2f21-4554-a2c7-8502921f5dac', CONFIRMED_STUDENTS.ideal],
  ['schedule-ideal-group-20260811-1900', CONFIRMED_STUDENTS.ideal],
  ['40f7ecf9-f380-4863-aaea-80a82374019e', { name: '白沐凡' }],
  ['9f62c6d1-59d9-4f9a-9d47-0118d03a0b1e', { name: '小白' }],
  ['da991c16-ad2b-4ae4-9a94-d0d6a84881d8', CONFIRMED_STUDENTS.lijunze],
  ['f8b6414a-ae3b-4ea4-affa-ac1934288cdc', { name: 'yx' }],
  ['cxe-thirdparty-202606-schedule-4a5f01e4a5ca', {
    students: [CONFIRMED_STUDENTS.taozi, CONFIRMED_STUDENTS.mitao, CONFIRMED_STUDENTS.hanghang, CONFIRMED_STUDENTS.xianfeng],
    courseType: '小班课',
    standardCourseType: '青少年小班课/训练营'
  }]
];

const IGNORED_SCHEDULE_IDS = new Set([
  'a37a2c33-54fe-4cce-bd15-a94d54b5dc0e'
]);

const NEED_CONFIRM_SCHEDULE_IDS = new Set([]);

function text(value) {
  return String(value ?? '').trim();
}

function stableId(prefix, value) {
  const hash = crypto.createHash('sha1').update(normalizeNameKey(value)).digest('hex').slice(0, 12);
  return `${prefix}-${hash}`;
}

function active(row = {}) {
  const status = text(row.status || '已排课');
  return !['已取消', 'cancelled', 'deleted'].includes(status);
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

function displayName(student) {
  return text(student.name);
}

function buildLead(name, schedule, studentId, now, leadId = '') {
  return {
    id: text(leadId) || stableId('repair-lead-20260818', name),
    name,
    displayName: name,
    wechatName: name,
    phone: '',
    source: '历史排课修复',
    campus: text(schedule.campus) || 'shunyi_mapo',
    customerType: /青少年/.test(text(schedule.standardCourseType || schedule.courseType)) ? '青少年' : '成人',
    demandProduct: text(schedule.standardCourseType || schedule.courseType || '私教课'),
    consultType: text(schedule.standardCourseType || schedule.courseType || '私教课'),
    rawStatus: '已成交',
    systemStatus: '已成交',
    leadStage: '已成交',
    status: 'active',
    studentId,
    profileNote: '历史排课脏数据修复：按用户确认补建学员档案',
    createdAt: now,
    updatedAt: now,
    operationId: OPERATION_ID,
    batchId: BATCH_ID
  };
}

function buildStudent(name, lead, schedule, now) {
  return {
    id: text(lead.studentId),
    name,
    studentName: name,
    displayName: name,
    phone: '',
    campus: text(schedule.campus) || 'shunyi_mapo',
    type: /青少年/.test(text(schedule.standardCourseType || schedule.courseType)) ? '青少年' : '成人',
    primaryCoach: text(schedule.coach || schedule.coachName),
    source: '历史排课修复',
    sourceLeadId: lead.id,
    status: 'active',
    notes: '历史排课脏数据修复：补建学员档案',
    createdAt: now,
    updatedAt: now,
    operationId: OPERATION_ID,
    batchId: BATCH_ID
  };
}

function resolveStudent(rule, schedule, studentsById, studentsByName, leadsById, now, leadPuts, studentPuts) {
  const name = displayName(rule);
  if (!name) return { error: '规则缺少学员名' };
  if (rule.id) {
    const existing = studentsById.get(rule.id);
    if (!existing && !CREATE_STUDENT_NAMES.has(name)) return { error: `指定学员档案不存在：${name}` };
    if (!existing) {
      const leadId = text(rule.leadId) || stableId('repair-lead-20260818', name);
      const baseLead = leadsById.get(leadId) || {};
      const generatedLead = buildLead(name, schedule, rule.id, now, leadId);
      const lead = { ...baseLead, ...generatedLead, createdAt: baseLead.createdAt || generatedLead.createdAt };
      const student = buildStudent(name, lead, schedule, now);
      leadPuts.push(lead);
      studentPuts.push(student);
      studentsById.set(student.id, student);
      studentsByName.set(normalizeNameKey(name), [student]);
      leadsById.set(lead.id, lead);
      return { student, leadId: lead.id };
    }
    return { student: { ...existing, id: rule.id, name }, leadId: rule.leadId || existing.sourceLeadId || existing.leadId || '' };
  }

  const nameKey = normalizeNameKey(name);
  const exact = studentsByName.get(nameKey) || [];
  if (exact.length === 1) {
    const existing = exact[0];
    return { student: { ...existing, name }, leadId: existing.sourceLeadId || existing.leadId || '' };
  }
  if (exact.length > 1) return { error: `同名学员不唯一：${name}` };
  if (!CREATE_STUDENT_NAMES.has(name)) return { error: `未授权补建学员：${name}` };

  const studentId = stableId('repair-student-20260818', name);
  const existing = studentsById.get(studentId);
  if (existing) return { student: existing, leadId: existing.sourceLeadId || existing.leadId || '' };

  const lead = buildLead(name, schedule, studentId, now);
  const student = buildStudent(name, lead, schedule, now);
  leadPuts.push(lead);
  studentPuts.push(student);
  studentsById.set(student.id, student);
  studentsByName.set(nameKey, [student]);
  return { student, leadId: lead.id };
}

function patchSchedule(row, students, leadIds, now, rule = {}) {
  const studentList = Array.isArray(students) ? students : [students];
  const names = studentList.map(displayName).filter(Boolean);
  const ids = studentList.map(student => text(student.id)).filter(Boolean);
  const name = names.join('、');
  return trace({
    ...row,
    studentName: name,
    studentNames: names,
    studentId: ids.length === 1 ? ids[0] : '',
    studentIds: ids,
    expectedStudentIds: ids,
    sourceLeadId: ids.length === 1 ? (leadIds[0] || text(row.sourceLeadId)) : '',
    sourceLeadName: name,
    courseType: rule.courseType || row.courseType,
    standardCourseType: rule.standardCourseType || row.standardCourseType,
    courseDisplayName: rule.standardCourseType || row.courseDisplayName || row.standardCourseType
  }, now, '用户确认：修正学员姓名并绑定正确学员档案');
}

function buildStudentMaps(students = []) {
  const byId = new Map();
  const byName = new Map();
  for (const student of students) {
    const id = text(student.id);
    if (id) byId.set(id, student);
    const name = text(student.name || student.studentName || student.displayName);
    const key = normalizeNameKey(name);
    if (!key) continue;
    if (!byName.has(key)) byName.set(key, []);
    byName.get(key).push(student);
  }
  return { byId, byName };
}

function buildPlan({ schedules, students, leads, conflictIndex, now }) {
  const scheduleById = new Map(schedules.map(row => [text(row.id), row]));
  const { byId: studentsById, byName: studentsByName } = buildStudentMaps(students);
  const leadsById = new Map((leads || []).map(row => [text(row.id), row]));
  const updates = [];
  const skipped = [];
  const leadPuts = [];
  const studentPuts = [];

  for (const [scheduleId, rule] of BIND_RULES) {
    const before = scheduleById.get(scheduleId);
    if (!active(before)) {
      skipped.push({ id: scheduleId, reason: '排课不存在或已取消' });
      continue;
    }
    const ruleStudents = Array.isArray(rule.students) ? rule.students : [rule];
    const resolvedStudents = [];
    const resolvedLeadIds = [];
    const errors = [];
    for (const studentRule of ruleStudents) {
      const resolved = resolveStudent(studentRule, before, studentsById, studentsByName, leadsById, now, leadPuts, studentPuts);
      if (resolved.error) errors.push(resolved.error);
      else {
        resolvedStudents.push(resolved.student);
        resolvedLeadIds.push(resolved.leadId);
      }
    }
    if (errors.length) {
      skipped.push({ id: scheduleId, reason: errors.join('；') });
      continue;
    }
    const after = patchSchedule(before, resolvedStudents, resolvedLeadIds, now, rule);
    updates.push({ id: scheduleId, before, after });
  }

  const affectedIds = new Set(updates.map(item => item.id));
  const staleIndexIds = (conflictIndex || [])
    .filter(row => affectedIds.has(text(row.scheduleId)))
    .map(row => text(row.id))
    .filter(id => id && id !== SCHEDULE_CONFLICT_INDEX_READY_ID);

  return {
    updates,
    skipped,
    leadPuts,
    studentPuts,
    ignoredScheduleIds: [...IGNORED_SCHEDULE_IDS],
    needConfirmScheduleIds: [...NEED_CONFIRM_SCHEDULE_IDS],
    conflictIndex: {
      staleIndexIds,
      nextIndexRows: updates.flatMap(item => scheduleConflictIndexRowsForRecord(item.after))
    }
  };
}

function scanRemainingRisks(schedules = []) {
  const allowNames = new Set(['有知有行团课', '理想团课']);
  const riskWords = ['私教课', '体验课', '专项课', '训练课', '陪打', '排课占场', '无名用户', '朝珺学员', '免费'];
  return schedules
    .filter(active)
    .filter(row => !IGNORED_SCHEDULE_IDS.has(text(row.id)))
    .filter(row => !allowNames.has(text(row.studentName)))
    .filter(row => {
      const values = [row.studentName, ...(Array.isArray(row.studentNames) ? row.studentNames : [])].map(text).filter(Boolean);
      return values.some(value => riskWords.some(word => value.includes(word)));
    })
    .map(row => ({
      id: row.id,
      startTime: row.startTime,
      endTime: row.endTime,
      studentName: row.studentName,
      studentNames: row.studentNames,
      studentIds: row.studentIds,
      coach: row.coach || row.coachName,
      venue: row.venue || row.courtName,
      courseType: row.courseType,
      standardCourseType: row.standardCourseType
    }));
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
    ignoredScheduleIds: plan.ignoredScheduleIds,
    needConfirmScheduleIds: plan.needConfirmScheduleIds,
    conflictIndexDeleted: plan.conflictIndex.staleIndexIds.length,
    conflictIndexPut: plan.conflictIndex.nextIndexRows.length,
    updates: plan.updates.map(item => ({
      id: item.id,
      startTime: item.before.startTime,
      endTime: item.before.endTime,
      beforeStudentName: item.before.studentName,
      beforeStudentIds: item.before.studentIds,
      afterStudentName: item.after.studentName,
      afterStudentIds: item.after.studentIds
    })),
    createdStudentRows: plan.studentPuts.map(row => ({ id: row.id, name: row.name, sourceLeadId: row.sourceLeadId })),
    skippedItems: plan.skipped,
    remainingRiskAfterPlan: scanRemainingRisks(plan.updates.reduce((rows, item) => rows.map(row => text(row.id) === item.id ? item.after : row), schedules)),
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
    remainingRiskAfterPlan: output.remainingRiskAfterPlan.length,
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

module.exports = { buildPlan, scanRemainingRisks, run };
