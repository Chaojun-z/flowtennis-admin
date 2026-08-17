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
const { buildCoachResolver } = require('./repair-history-annotated-risk-rules-20260816');

const ROOT = path.join(__dirname, '..');
const OPERATION_ID = 'repair-confirmed-remaining-student-risks-20260816';
const BATCH_ID = `batch-${OPERATION_ID}`;
const REPORT_DIR = path.join(ROOT, 'offline-reports');
const TABLES = {
  schedule: 'ft_schedule',
  students: 'ft_students',
  leads: 'ft_leads',
  coaches: 'ft_coaches',
  conflictIndex: 'ft_schedule_conflict_index'
};

const CANCEL_SCHEDULE_IDS = new Set([
  'cxe-202602-thirdparty-schedule-0e875dc7660c3c67',
  'cxe-202602-thirdparty-schedule-1cd8aef924460434',
  'cxe-202602-thirdparty-schedule-8e1678e6732550cf',
  'cxe-202602-thirdparty-schedule-d550181f54a4a403',
  'cxe-thirdparty-202604-schedule-80f489826599'
]);

const BIND_RULES = [
  { id: 'cxe-play-hit-16601350737-2026-07-0815-49-43--------------140-00----127-32----12-68--4412', names: ['征途'], createMissing: true, courseType: '陪打' },
  { id: 'cxe-thirdparty-202604-schedule-c90e12720d64', names: ['小鹿'], createMissing: false, courseType: '私教课' },
  { id: 'cxe-thirdparty-202604-schedule-41aaaa53ec4a', names: ['misha', '黄总'], createMissing: false, courseType: '私教课' },
  { id: 'cxe-thirdparty-202604-schedule-7619fb0124c9', names: ['小胡'], createMissing: false, coach: 'Rive 天昊教练', courseType: '私教课' },
  { id: 'cxe-thirdparty-202606-schedule-fb32789fee80', names: ['仇济'], createMissing: false, courseType: '私教课', standardCourseType: '成人私教【正式】' },
  { id: 'cxe-202602-thirdparty-schedule-54e3baaeb89678f0', names: ['一匹马'], createMissing: true, courseType: '体验课' },
  { id: 'cxe-202602-thirdparty-schedule-2430a30f9412aa96', names: ['王公达'], createMissing: true, courseType: '私教课' },
  { id: 'cxe-202602-thirdparty-schedule-34c64ce361629014', names: ['老小李'], createMissing: true, courseType: '私教课' },
  { id: 'cxe-202602-thirdparty-schedule-37579b06a37d16fb', names: ['呀诺达'], createMissing: true, courseType: '私教课' },
  { id: 'cxe-202602-thirdparty-schedule-5c71918c4eec52c8', names: ['shhh'], createMissing: true, courseType: '私教课' },
  { id: 'cxe-202602-thirdparty-schedule-c31315df6df47572', names: ['shhh'], createMissing: true, courseType: '私教课' },
  { id: 'cxe-202602-thirdparty-schedule-5e543eb5071babdb', names: ['饭先生'], createMissing: true, courseType: '私教课' },
  { id: 'cxe-202602-thirdparty-schedule-70df92cecea92ab2', names: ['song'], createMissing: true, courseType: '私教课' },
  { id: 'cxe-202602-thirdparty-schedule-72d3c4d70bf6b84f', names: ['卢鑫'], createMissing: true, courseType: '私教课' },
  { id: 'cxe-202602-thirdparty-schedule-7629a7e04539ee87', names: ['王默笙'], createMissing: true, courseType: '体验课' },
  { id: 'cxe-202602-thirdparty-schedule-77eb3598001383e2', names: ['马佳'], createMissing: true, courseType: '私教课' },
  { id: 'cxe-202602-thirdparty-schedule-9886ceb340bc1711', names: ['小文'], createMissing: true, courseType: '私教课' },
  { id: 'cxe-202602-thirdparty-schedule-bd78c9996907f28d', names: ['董凡萱'], createMissing: true, courseType: '私教课' },
  { id: 'cxe-202602-thirdparty-schedule-d44a3f88c8b2ef6e', names: ['小土豆'], createMissing: true, courseType: '私教课' },
  { id: 'cxe-202602-thirdparty-schedule-e2ad2c91e95898a6', names: ['Cecilia'], createMissing: true, courseType: '私教课' },
  { id: 'cxe-thirdparty-202604-schedule-96c73a9363a4', names: ['李鹏浩'], createMissing: true, courseType: '体验课' },
  { id: 'cxe-thirdparty-202604-schedule-9d712985294c', names: ['黄深'], createMissing: true, courseType: '体验课' }
];

const DIRECT_STUDENT_IDS = new Map([
  ['小胡', 'repair-student-20260816-3ab08ab75f2c']
]);

function text(value) {
  return String(value ?? '').trim();
}

function active(row = {}) {
  return row && text(row.status || '已排课') !== '已取消';
}

function stableId(prefix, value) {
  const hash = crypto.createHash('sha1').update(normalizeNameKey(value)).digest('hex').slice(0, 12);
  return `${prefix}-${hash}`;
}

function cleanStudentName(value) {
  return text(value)
    .replace(/^[-－—\s]+/, '')
    .replace(/[（(].*?[）)]/g, '')
    .replace(/\s*1v\d.*$/i, '')
    .replace(/\s*(私教课|体验课|正式课|转介绍)$/g, '')
    .trim();
}

function exactStudentKey(value) {
  return normalizeNameKey(cleanStudentName(value));
}

function buildStudentMap(students = []) {
  const map = new Map();
  for (const student of students || []) {
    if (text(student.status || 'active') === 'inactive') continue;
    const values = [
      student.name,
      student.studentName,
      student.displayName,
      student.nickname,
      student.nickName,
      student.alias,
      ...(Array.isArray(student.aliases) ? student.aliases : []),
      ...(Array.isArray(student.aliasNames) ? student.aliasNames : [])
    ];
    for (const value of values) {
      const key = exactStudentKey(value);
      if (!key) continue;
      if (!map.has(key)) map.set(key, []);
      map.get(key).push(student);
    }
  }
  return map;
}

function uniqueById(rows = []) {
  return [...new Map(rows.map(row => [text(row.id), row])).values()];
}

function coursePatch(courseType, standardCourseType = '') {
  const course = text(standardCourseType || courseType);
  if (/陪打/.test(courseType)) return { courseType: '陪打', standardCourseType: '陪打', courseDisplayName: '陪打', courseTypeLevel2: '陪打' };
  if (/体验/.test(courseType) || /体验/.test(course)) {
    const experienceType = /青少年/.test(course) ? '青少年' : '成人';
    return { courseType: '体验课', standardCourseType: `${experienceType}私教【体验】`, courseDisplayName: course || `${experienceType}私教【体验】`, courseTypeLevel2: `${experienceType}体验课`, experienceType, isTrial: true };
  }
  if (/私教/.test(courseType) || /私教/.test(course)) {
    const standard = course || '成人私教【正式】';
    return { courseType: '私教课', standardCourseType: standard, courseDisplayName: standard, courseTypeLevel2: /青少年/.test(standard) ? '青少年私教课' : '成人私教课', isTrial: false };
  }
  return {};
}

function changedFields(before, after) {
  const keys = [
    'status',
    'state',
    'systemStatus',
    'cancelReason',
    'confirmStatus',
    'studentName',
    'studentNames',
    'studentIds',
    'expectedStudentIds',
    'coach',
    'courseType',
    'standardCourseType',
    'courseDisplayName',
    'courseTypeLevel2',
    'experienceType',
    'isTrial',
    'sourceLeadId',
    'sourceLeadName'
  ];
  return keys.filter(key => JSON.stringify(before?.[key] ?? '') !== JSON.stringify(after?.[key] ?? ''));
}

function buildLead(name, schedule, now, courseType) {
  const id = stableId('repair-lead-20260816', name);
  const product = courseType === '陪打' ? '陪打' : '私教课';
  return {
    id,
    name,
    displayName: name,
    wechatName: name,
    phone: '',
    source: '历史排课修复',
    campus: text(schedule.campus) || 'shunyi_mapo',
    customerType: /青少年/.test(text(schedule.standardCourseType || schedule.courseType)) ? '青少年' : '成人',
    demandProduct: product,
    consultType: product,
    rawStatus: '已成交',
    systemStatus: '已成交',
    leadStage: '已成交',
    status: 'active',
    dealType: product === '陪打' ? '陪打' : '课程',
    conversionType: product === '陪打' ? '陪打' : '课程',
    convertedProducts: [product],
    profileNote: '历史排课脏数据修复：按用户确认补线索/学员档案并绑定排课',
    createdAt: now,
    updatedAt: now,
    operationId: OPERATION_ID,
    batchId: BATCH_ID
  };
}

function buildStudent(name, lead, schedule, now, resolveCoach) {
  const id = stableId('repair-student-20260816', name);
  return {
    id,
    name,
    studentName: name,
    displayName: name,
    phone: '',
    campus: text(schedule.campus) || 'shunyi_mapo',
    type: /青少年/.test(text(schedule.standardCourseType || schedule.courseType)) ? '青少年' : '成人',
    primaryCoach: resolveCoach(schedule.coach || schedule.coachName),
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

function buildPlan({ schedules, students, leads, coaches, conflictIndex, now }) {
  const scheduleById = new Map(schedules.map(row => [text(row.id), row]));
  const studentMap = buildStudentMap(students);
  const leadById = new Map(leads.map(row => [text(row.id), row]));
  const resolveCoach = buildCoachResolver(coaches);
  const updates = [];
  const leadPuts = [];
  const studentPuts = [];
  const skipped = [];
  const plannedStudentByName = new Map();

  function resolveOrCreateStudent(name, schedule, rule) {
    const key = exactStudentKey(name);
    const directStudentId = DIRECT_STUDENT_IDS.get(name);
    if (directStudentId) {
      const direct = students.find(row => text(row.id) === directStudentId);
      if (direct) return { student: direct, lead: null, created: false };
      return { error: '指定学员档案不存在' };
    }
    const exact = uniqueById(studentMap.get(key) || []);
    if (exact.length === 1) return { student: exact[0], lead: null, created: false };
    if (exact.length > 1) return { error: '同名学员不唯一', matches: exact.map(row => ({ id: row.id, name: row.name || row.studentName })) };
    if (!rule.createMissing) return { error: '未找到唯一学员档案' };
    if (plannedStudentByName.has(key)) return plannedStudentByName.get(key);
    const lead = { ...buildLead(name, schedule, now, rule.courseType), studentId: stableId('repair-student-20260816', name) };
    const existingLead = leadById.get(lead.id);
    const finalLead = existingLead ? { ...existingLead, ...lead, createdAt: existingLead.createdAt || lead.createdAt } : lead;
    const student = buildStudent(name, finalLead, schedule, now, resolveCoach);
    plannedStudentByName.set(key, { student, lead: finalLead, created: !exact.length });
    leadPuts.push(finalLead);
    studentPuts.push(student);
    return { student, lead: finalLead, created: true };
  }

  for (const id of CANCEL_SCHEDULE_IDS) {
    const schedule = scheduleById.get(id);
    if (!active(schedule)) {
      skipped.push({ id, action: 'cancel', reason: '排课不存在或已取消' });
      continue;
    }
    const after = trace({
      ...schedule,
      status: '已取消',
      state: '已取消',
      systemStatus: '已取消',
      confirmStatus: '已取消',
      cancelReason: '历史脏数据修复：非正规学员名/占场备注，取消系统排课，仅保留订场/占场'
    }, now, '用户确认：非正规学员名/占场备注取消排课');
    const fields = changedFields(schedule, after);
    if (fields.length) updates.push({ id, action: 'cancelSchedule', changedFields: fields, before: schedule, after });
  }

  for (const rule of BIND_RULES) {
    const schedule = scheduleById.get(rule.id);
    if (!active(schedule)) {
      skipped.push({ id: rule.id, action: 'bind', names: rule.names, reason: '排课不存在或已取消' });
      continue;
    }
    const resolved = [];
    const blockers = [];
    for (const name of rule.names) {
      const result = resolveOrCreateStudent(name, schedule, rule);
      if (result.error) blockers.push({ name, reason: result.error, matches: result.matches || [] });
      else resolved.push(result.student);
    }
    if (blockers.length) {
      skipped.push({ id: rule.id, action: 'bind', names: rule.names, reason: '学员无法唯一确认', blockers });
      continue;
    }
    const studentIds = resolved.map(row => text(row.id)).filter(Boolean);
    const studentName = rule.names.join('、');
    const primaryLead = rule.names.length === 1 ? leadPuts.find(row => row.name === rule.names[0]) : null;
    const after = trace({
      ...schedule,
      studentName,
      studentNames: rule.names,
      studentIds,
      expectedStudentIds: studentIds,
      coach: rule.coach ? resolveCoach(rule.coach) : resolveCoach(schedule.coach || schedule.coachName),
      sourceLeadId: primaryLead?.id || schedule.sourceLeadId || '',
      sourceLeadName: primaryLead?.name || schedule.sourceLeadName || '',
      ...coursePatch(rule.courseType || schedule.courseType, rule.standardCourseType || schedule.standardCourseType)
    }, now, '用户确认：补线索/学员档案或按真实学员绑定排课');
    const fields = changedFields(schedule, after);
    if (fields.length) updates.push({ id: rule.id, action: 'bindStudent', names: rule.names, changedFields: fields, before: schedule, after });
  }

  const affectedIds = new Set(updates.map(item => item.id));
  const staleIndexIds = conflictIndex
    .filter(row => affectedIds.has(text(row.scheduleId)))
    .map(row => text(row.id))
    .filter(id => id && id !== SCHEDULE_CONFLICT_INDEX_READY_ID);
  const nextIndexRows = updates.flatMap(item => scheduleConflictIndexRowsForRecord(item.after));

  return {
    updates,
    leadPuts,
    studentPuts,
    skipped,
    conflictIndex: { staleIndexIds, nextIndexRows }
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
    mode: args.write ? 'write' : 'dry-run',
    target,
    reportPath,
    operationId: OPERATION_ID,
    batchId: BATCH_ID,
    generatedAt: now,
    requested: {
      cancelSchedules: CANCEL_SCHEDULE_IDS.size,
      bindRules: BIND_RULES.length
    },
    ...plan
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
    updates: plan.updates.length,
    cancels: plan.updates.filter(item => item.action === 'cancelSchedule').length,
    binds: plan.updates.filter(item => item.action === 'bindStudent').length,
    leadPuts: plan.leadPuts.length,
    studentPuts: plan.studentPuts.length,
    skipped: plan.skipped.length,
    skippedItems: plan.skipped,
    conflictIndexDeleted: plan.conflictIndex.staleIndexIds.length,
    conflictIndexPut: plan.conflictIndex.nextIndexRows.length
  }, null, 2));
}

if (require.main === module) {
  run().catch(error => {
    console.error(error?.stack || String(error));
    process.exit(1);
  });
}

module.exports = { buildPlan };
