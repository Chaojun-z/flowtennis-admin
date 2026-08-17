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
const {
  scheduleConflictIndexRowsForRecord,
  SCHEDULE_CONFLICT_INDEX_READY_ID
} = require('../server/schedule-conflict-index');
const { normalizeNameKey } = require('../server/feishu-schedule-sync-routes');

const ROOT = path.join(__dirname, '..');
const OPERATION_ID = 'repair-yuan-trial-student-20260817';
const BATCH_ID = `batch-${OPERATION_ID}`;
const REPORT_DIR = path.join(ROOT, 'offline-reports');

const TABLES = {
  schedule: 'ft_schedule',
  students: 'ft_students',
  leads: 'ft_leads',
  coaches: 'ft_coaches',
  conflictIndex: 'ft_schedule_conflict_index'
};

const SCHEDULE_ID = 'cxe-thirdparty-202606-schedule-85468bbb33dd';
const STUDENT_NAME = '原';
const COACH_FALLBACK = '宋教练';

function text(value) {
  return String(value ?? '').trim();
}

function stableId(prefix, value) {
  const hash = crypto.createHash('sha1').update(normalizeNameKey(value)).digest('hex').slice(0, 12);
  return `${prefix}-${hash}`;
}

function exactName(value) {
  return normalizeNameKey(value);
}

function resolveCoach(coaches) {
  const names = coaches.map(row => text(row.name || row.coachName)).filter(Boolean);
  return names.find(name => name === '宋俊吉教练')
    || names.find(name => name === '宋教练')
    || COACH_FALLBACK;
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

function buildLead(schedule, now) {
  const id = stableId('repair-lead-20260817', STUDENT_NAME);
  return {
    id,
    name: STUDENT_NAME,
    displayName: STUDENT_NAME,
    wechatName: STUDENT_NAME,
    phone: '',
    source: '飞书排课表历史修复',
    campus: text(schedule.campus) || 'shunyi_mapo',
    customerType: '成人',
    demandProduct: '私教体验课',
    consultType: '私教体验课',
    rawStatus: '已约体验',
    systemStatus: '已约体验',
    leadStage: '已约体验',
    status: 'active',
    dealType: '课程',
    conversionType: '课程',
    convertedProducts: ['私教体验课'],
    trialAtRaw: text(schedule.startTime),
    profileNote: '历史排课脏数据修复：按用户确认补建成人私教体验课学员',
    createdAt: now,
    updatedAt: now,
    operationId: OPERATION_ID,
    batchId: BATCH_ID
  };
}

function buildStudent(lead, schedule, coach, now) {
  const id = stableId('repair-student-20260817', STUDENT_NAME);
  return {
    id,
    name: STUDENT_NAME,
    studentName: STUDENT_NAME,
    displayName: STUDENT_NAME,
    phone: '',
    campus: text(schedule.campus) || 'shunyi_mapo',
    type: '成人',
    primaryCoach: coach,
    source: '飞书排课表历史修复',
    sourceLeadId: lead.id,
    status: 'active',
    notes: '历史排课缺学员ID：按用户确认补建成人私教体验课学员档案',
    createdAt: now,
    updatedAt: now,
    operationId: OPERATION_ID,
    batchId: BATCH_ID
  };
}

function buildPlan({ schedules, students, leads, coaches, conflictIndex, now }) {
  const schedule = schedules.find(row => text(row.id) === SCHEDULE_ID);
  if (!schedule || text(schedule.status || '已排课') === '已取消') throw new Error('原的排课不存在或已取消，停止');
  const matches = students.filter(row => exactName(row.name || row.studentName || row.displayName) === exactName(STUDENT_NAME));
  if (matches.length > 1) throw new Error('原的学员档案不唯一，停止');

  const coach = resolveCoach(coaches);
  const lead = matches[0]?.sourceLeadId
    ? leads.find(row => text(row.id) === text(matches[0].sourceLeadId)) || buildLead(schedule, now)
    : buildLead(schedule, now);
  const student = matches[0] || buildStudent(lead, schedule, coach, now);
  const nextLead = trace({
    ...lead,
    studentId: student.id,
    displayName: STUDENT_NAME,
    wechatName: STUDENT_NAME,
    customerType: '成人'
  }, now, '用户确认：原是成人私教体验课学员');
  const nextStudent = trace({
    ...student,
    name: STUDENT_NAME,
    studentName: STUDENT_NAME,
    displayName: STUDENT_NAME,
    type: '成人',
    primaryCoach: text(student.primaryCoach) || coach,
    sourceLeadId: nextLead.id,
    status: text(student.status) || 'active'
  }, now, '用户确认：补建/补齐原的学员档案');
  const nextSchedule = trace({
    ...schedule,
    studentName: STUDENT_NAME,
    studentNames: [STUDENT_NAME],
    studentId: nextStudent.id,
    studentIds: [nextStudent.id],
    expectedStudentIds: [nextStudent.id],
    coach,
    venue: '2号场',
    courseType: '体验课',
    standardCourseType: '私教体验课',
    courseDisplayName: '私教体验课',
    courseTypeLevel2: '成人体验课',
    experienceType: '成人',
    isTrial: true,
    sourceLeadId: nextLead.id,
    sourceLeadName: STUDENT_NAME
  }, now, '用户确认：原是成人私教体验课，马坡室内2号场，宋教练');

  const staleIndexIds = (conflictIndex || [])
    .filter(row => text(row.scheduleId) === SCHEDULE_ID)
    .map(row => text(row.id))
    .filter(id => id && id !== SCHEDULE_CONFLICT_INDEX_READY_ID);

  return {
    createdLead: !leads.some(row => text(row.id) === text(nextLead.id)),
    createdStudent: !matches[0],
    lead: nextLead,
    student: nextStudent,
    scheduleBefore: schedule,
    scheduleAfter: nextSchedule,
    conflictIndex: {
      staleIndexIds,
      nextIndexRows: scheduleConflictIndexRowsForRecord(nextSchedule)
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
  const [schedules, students, leads, coaches, conflictIndex] = await Promise.all([
    scanTable(client, TABLES.schedule),
    scanTable(client, TABLES.students),
    scanTable(client, TABLES.leads).catch(() => []),
    scanTable(client, TABLES.coaches).catch(() => []),
    scanTable(client, TABLES.conflictIndex).catch(() => [])
  ]);
  const now = new Date().toISOString();
  const plan = buildPlan({ schedules, students, leads, coaches, conflictIndex, now });
  const output = {
    ok: true,
    mode: args.write ? 'write' : 'dry-run',
    target,
    reportPath,
    operationId: OPERATION_ID,
    batchId: BATCH_ID,
    generatedAt: now,
    createdLead: plan.createdLead,
    createdStudent: plan.createdStudent,
    schedule: {
      id: SCHEDULE_ID,
      beforeStudentName: plan.scheduleBefore.studentName,
      afterStudentName: plan.scheduleAfter.studentName,
      afterStudentIds: plan.scheduleAfter.studentIds,
      afterCoach: plan.scheduleAfter.coach,
      afterVenue: plan.scheduleAfter.venue,
      afterCourseType: plan.scheduleAfter.courseType,
      afterStandardCourseType: plan.scheduleAfter.standardCourseType
    },
    conflictIndexDeleted: plan.conflictIndex.staleIndexIds.length,
    conflictIndexPut: plan.conflictIndex.nextIndexRows.length,
    plan
  };
  fs.mkdirSync(REPORT_DIR, { recursive: true });
  fs.writeFileSync(reportPath, `${JSON.stringify(output, null, 2)}\n`, 'utf8');

  if (args.write) {
    await retry('create conflict index table', () => createTableIfMissing(client, TABLES.conflictIndex));
    await retry(`put lead ${plan.lead.id}`, () => putRow(client, TABLES.leads, plan.lead));
    await retry(`put student ${plan.student.id}`, () => putRow(client, TABLES.students, plan.student));
    await retry(`put schedule ${SCHEDULE_ID}`, () => putRow(client, TABLES.schedule, plan.scheduleAfter));
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
    createdLead: output.createdLead,
    createdStudent: output.createdStudent,
    schedule: output.schedule,
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
