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
  normalizeNameKey,
  buildScheduleBody
} = require('../server/feishu-schedule-sync-routes');
const {
  scheduleConflictIndexRowsForRecord,
  SCHEDULE_CONFLICT_INDEX_READY_ID
} = require('../server/schedule-conflict-index');
const { buildCoachResolver } = require('./repair-history-annotated-risk-rules-20260816');

const ROOT = path.join(__dirname, '..');
const OPERATION_ID = 'repair-multi-course-display-bind-20260816';
const BATCH_ID = `batch-${OPERATION_ID}`;
const SOURCE_REPORT = path.join(ROOT, 'offline-reports', 'history-schedule-three-way-risk-scan-20260814.json');
const LATEST_REMAINING_REPORT = path.join(ROOT, 'offline-reports', 'repair-history-annotated-risk-rules-20260816-after-groups-1-4-6-dry-run.json');
const REPORT_DIR = path.join(ROOT, 'offline-reports');

const TABLES = {
  schedule: 'ft_schedule',
  students: 'ft_students',
  coaches: 'ft_coaches',
  conflictIndex: 'ft_schedule_conflict_index'
};

const SKIP_IDS = new Set([
  'cxe-202602-thirdparty-schedule-6a9e62fe7f725c66'
]);

const TARGET_IDS = new Set([
  'cxe-202602-thirdparty-schedule-12286c878a4eff58',
  'cxe-202602-thirdparty-schedule-38c3e3d3346dacf1',
  'cxe-202602-thirdparty-schedule-423d102ff29d0cc8',
  'cxe-202602-thirdparty-schedule-5160af23c005394c',
  'cxe-202602-thirdparty-schedule-558d17c34f8771b7',
  'cxe-202602-thirdparty-schedule-5959747e2ed2caea',
  'cxe-202602-thirdparty-schedule-5aef9a6396f7b089',
  'cxe-202602-thirdparty-schedule-5b457ac8d992fe18',
  'cxe-202602-thirdparty-schedule-c857ff810a509951',
  'cxe-202602-thirdparty-schedule-ec6c12cf9e87539b',
  'cxe-202602-thirdparty-schedule-ef51eaed815d3685',
  'cxe-202602-thirdparty-schedule-f07deb91dda8f575',
  'cxe-thirdparty-202604-schedule-7299a88cd6c0',
  'cxe-thirdparty-202604-schedule-7def554fe8e5',
  'cxe-thirdparty-202604-schedule-b7e81054e147',
  'cxe-thirdparty-202604-schedule-d8c490438aa3',
  'cxe-thirdparty-202604-schedule-f43fbad65d9f',
  'cxe-thirdparty-202604-schedule-f6c32ea4a8d0',
  'cxe-thirdparty-202606-schedule-464bb994ae1c',
  'cxe-thirdparty-202606-schedule-4a5f01e4a5ca',
  'cxe-thirdparty-202606-schedule-7466f324231a',
  'cxe-thirdparty-202606-schedule-78c4f908576b',
  'cxe-thirdparty-202606-schedule-7c50636d78d3',
  'cxe-thirdparty-202606-schedule-abdaf95644b4',
  'cxe-thirdparty-202606-schedule-cd2c2d3b5b7e',
  'cxe-thirdparty-202606-schedule-fee91574c01a',
  'cxe-thirdparty-202606-schedule-ffac1b582929',
  'cxe-thirdparty-schedule-67-551811088ac6'
]);

function text(value) {
  return String(value ?? '').trim();
}

function active(row = {}) {
  return row && text(row.status || '已排课') !== '已取消';
}

function changedFields(before, after) {
  const keys = [
    'studentName',
    'studentNames',
    'studentIds',
    'expectedStudentIds',
    'coach',
    'coachId',
    'courseType',
    'standardCourseType',
    'courseDisplayName',
    'courseTypeLevel2',
    'smallClassType',
    'skillLevelMin',
    'skillLevelMax',
    'specialTopic',
    'experienceType',
    'isTrial',
    'lessonCount'
  ];
  return keys.filter(key => {
    const previous = before?.[key] ?? '';
    const next = after?.[key] ?? '';
    if (['skillLevelMin', 'skillLevelMax'].includes(key) && text(previous) && text(next)) {
      const previousNumber = Number(previous);
      const nextNumber = Number(next);
      if (Number.isFinite(previousNumber) && Number.isFinite(nextNumber) && previousNumber === nextNumber) return false;
    }
    return JSON.stringify(previous) !== JSON.stringify(next);
  });
}

function cleanName(value) {
  return text(value)
    .replace(/[（(]\s*\d+\s*[）)]/g, '')
    .replace(/[（(]\s*1v\d\s*[）)]/ig, '')
    .replace(/\s*\d+\s*节?\s*1v\d.*$/i, '')
    .replace(/\s*1v\d.*$/i, '')
    .replace(/体验课|正式课|转介绍/g, '')
    .replace(/^[-－—\s、]+/, '')
    .replace(/[.、，,\s]+$/g, '')
    .trim();
}

function splitStudentNames(value) {
  const raw = text(value);
  const innerNames = [];
  const inner = raw.match(/三人[（(]([^）)]+)[）)]/);
  if (inner) innerNames.push(...inner[1].split(/[、,，\s]+/));
  const normal = raw
    .replace(/三人[（(][^）)]+[）)]/g, '')
    .replace(/[+&]/g, '、')
    .split(/[、,，/]/);
  return [...innerNames, ...normal]
    .map(cleanName)
    .filter(Boolean)
    .filter(name => !/^\d+(\.\d+)?$/.test(name))
    .filter(name => !/^\d+人$/.test(name))
    .filter(name => !/^(朋友|孩子|学员|自己的|妹妹|姐姐|集训营|训练营)$/.test(name))
    .filter(name => !/集训营|训练营|小班|团课/.test(name));
}

function normalizeStudentKey(value) {
  const key = normalizeNameKey(cleanName(value)).replace(/^halena$/, 'harrena');
  const aliases = new Map([
    ['wjing', 'wjing'],
    ['w.jing', 'wjing'],
    ['哈琳娜', 'harrena'],
    ['威廉', 'willian'],
    ['william', 'willian']
  ]);
  return aliases.get(key) || key;
}

function buildStudentLookup(students = []) {
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
      const key = normalizeStudentKey(value);
      if (!key) continue;
      if (!map.has(key)) map.set(key, []);
      map.get(key).push(student);
    }
  }
  return name => {
    const hits = map.get(normalizeStudentKey(name)) || [];
    const unique = [...new Map(hits.map(row => [text(row.id), row])).values()];
    return unique.length === 1 ? unique[0] : null;
  };
}

function normalizeCourse(courseText) {
  const raw = text(courseText);
  if (/初阶训练课|初阶专项课|零基础训练营/.test(raw)) {
    return { ok: true, raw, courseType: '专项课', experienceType: '', audience: '', isTrial: false, skillLevelMin: '零基础', skillLevelMax: '零基础', specialTopic: '初阶专项课', courseDisplayName: '【零基础】初阶专项课' };
  }
  const bracket = raw.match(/^【([^】]+)】\s*(.+)$/);
  if (bracket) {
    const level = bracket[1];
    const topic = bracket[2].trim();
    return { ok: true, raw, courseType: '专项课', experienceType: '', audience: '', isTrial: false, skillLevelMin: level, skillLevelMax: level, specialTopic: topic, courseDisplayName: raw };
  }
  if (/专项|发接发|击球位置优化|球质提升|多球综合实战特训|优势球识别/.test(raw)) {
    return { ok: true, raw, courseType: '专项课', experienceType: '', audience: '', isTrial: false, skillLevelMin: '', skillLevelMax: '', specialTopic: raw.replace(/【[^】]+】/g, ''), courseDisplayName: raw };
  }
  const isTrial = /体验/.test(raw);
  const audience = /青少|儿童|少儿/.test(raw) ? '青少年' : (/成人/.test(raw) ? '成人' : '');
  if (isTrial && audience) return { ok: true, raw, courseType: '体验课', experienceType: audience, audience, isTrial: true };
  if (/团课|小班|训练营|随到随学/.test(raw)) {
    const smallClassType = /随到随学/.test(raw) ? 'dropin' : 'bootcamp';
    return { ok: true, raw, courseType: '小班课', experienceType: '', audience, smallClassType, isTrial: false };
  }
  if (/陪打/.test(raw)) return { ok: true, raw, courseType: '陪打', experienceType: '', audience, isTrial: false };
  if (/私教|正式/.test(raw)) return { ok: true, raw, courseType: '私教课', experienceType: '', audience, isTrial: false };
  return { ok: false, reason: `无法识别课程类型：${raw}`, raw };
}

function buildCourseFields({ schedule, feishu, resolvedCoach, resolvedStudents }) {
  const course = normalizeCourse(feishu.course || schedule.standardCourseType || schedule.courseType);
  if (!course.ok) return {};
  const studentNames = Array.isArray(schedule.studentNames) && schedule.studentNames.length
    ? schedule.studentNames
    : splitStudentNames(feishu.student || schedule.studentName);
  const body = buildScheduleBody({
    startTime: schedule.startTime,
    endTime: schedule.endTime,
    course,
    studentNames,
    resolvedStudents,
    resolvedCoach,
    coachName: feishu.coach || schedule.coach || schedule.coachName,
    venue: schedule.venue,
    campus: schedule.campus,
    locationType: schedule.locationType,
    lessonCount: Number(schedule.lessonCount || 0) || undefined
  });
  return {
    courseType: body.courseType,
    standardCourseType: body.standardCourseType,
    courseDisplayName: body.courseDisplayName,
    courseTypeLevel2: body.courseTypeLevel2,
    smallClassType: body.smallClassType,
    skillLevelMin: body.skillLevelMin,
    skillLevelMax: body.skillLevelMax,
    specialTopic: body.specialTopic,
    experienceType: body.experienceType,
    isTrial: body.isTrial
  };
}

function trace(row, now) {
  return {
    ...row,
    updatedAt: now,
    operationId: OPERATION_ID,
    batchId: BATCH_ID,
    operationType: OPERATION_ID,
    operationAt: now,
    operationBy: 'Codex',
    repairReason: '多人/训练营历史排课：按飞书修正展示字段；仅绑定系统已有唯一学员，不创建课包、不扣课'
  };
}

function sourceItemsById(report) {
  const map = new Map();
  for (const items of Object.values(report.categories || {})) {
    for (const item of items || []) {
      if (item.system?.id) map.set(text(item.system.id), item);
    }
  }
  return map;
}

function buildPlan({ sourceReport, remainingReport, schedules, students, coaches, conflictIndex, now }) {
  const sourceById = sourceItemsById(sourceReport);
  const remainingIds = new Set((remainingReport.remaining || []).map(item => text(item.id)).filter(Boolean));
  const scheduleById = new Map(schedules.map(row => [text(row.id), row]));
  const findStudent = buildStudentLookup(students);
  const resolveCoach = buildCoachResolver(coaches);
  const coachByName = new Map((coaches || []).map(row => [normalizeNameKey(row.name || row.coachName), row]));
  const updates = [];
  const skipped = [];

  for (const id of TARGET_IDS) {
    if (SKIP_IDS.has(id)) continue;
    if (!remainingIds.has(id)) {
      skipped.push({ id, reason: '不在最新待处理清单里，跳过' });
      continue;
    }
    const schedule = scheduleById.get(id);
    if (!active(schedule)) {
      skipped.push({ id, reason: '排课不存在或已取消，跳过' });
      continue;
    }
    const source = sourceById.get(id) || {};
    const feishu = source.feishu || {};
    const feishuStudent = text(feishu.student || schedule.studentName);
    const displayNames = splitStudentNames(feishuStudent);
    const resolvedStudents = displayNames.map(name => findStudent(name)).filter(Boolean);
    const uniqueStudents = [...new Map(resolvedStudents.map(row => [text(row.id), row])).values()];
    const coachName = resolveCoach(feishu.coach || schedule.coach || schedule.coachName);
    const resolvedCoach = coachByName.get(normalizeNameKey(coachName)) || { id: schedule.coachId || '', name: coachName };
    const studentIds = uniqueStudents.map(row => text(row.id)).filter(Boolean);
    const after = trace({
      ...schedule,
      studentName: feishuStudent || schedule.studentName,
      studentNames: displayNames.length ? displayNames : (Array.isArray(schedule.studentNames) ? schedule.studentNames : []),
      studentIds,
      expectedStudentIds: studentIds,
      coach: coachName,
      coachId: resolvedCoach.id || schedule.coachId || '',
      ...buildCourseFields({ schedule, feishu, resolvedCoach, resolvedStudents: uniqueStudents })
    }, now);
    const fields = changedFields(schedule, after);
    if (!fields.length) {
      skipped.push({ id, reason: '字段已一致，无需写入' });
      continue;
    }
    updates.push({
      id,
      changedFields: fields,
      before: schedule,
      after,
      feishu: {
        student: feishuStudent,
        coach: feishu.coach || '',
        course: feishu.course || ''
      },
      boundStudentIds: studentIds,
      unresolvedStudentNames: displayNames.filter(name => !findStudent(name))
    });
  }

  const affectedIds = new Set(updates.map(item => item.id));
  const staleIndexIds = conflictIndex
    .filter(row => affectedIds.has(text(row.scheduleId)))
    .map(row => text(row.id))
    .filter(id => id && id !== SCHEDULE_CONFLICT_INDEX_READY_ID);
  const nextIndexRows = updates.flatMap(item => scheduleConflictIndexRowsForRecord(item.after));

  return {
    updates,
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
  const [schedules, students, coaches, conflictIndex] = await Promise.all([
    scanTable(client, TABLES.schedule),
    scanTable(client, TABLES.students),
    scanTable(client, TABLES.coaches).catch(() => []),
    scanTable(client, TABLES.conflictIndex).catch(() => [])
  ]);
  const now = new Date().toISOString();
  const sourceReport = JSON.parse(fs.readFileSync(SOURCE_REPORT, 'utf8'));
  const remainingReport = JSON.parse(fs.readFileSync(LATEST_REMAINING_REPORT, 'utf8'));
  const plan = buildPlan({ sourceReport, remainingReport, schedules, students, coaches, conflictIndex, now });
  const output = {
    mode: args.write ? 'write' : 'dry-run',
    target,
    reportPath,
    operationId: OPERATION_ID,
    batchId: BATCH_ID,
    generatedAt: now,
    requested: {
      targetIds: TARGET_IDS.size,
      skippedByUser: SKIP_IDS.size
    },
    ...plan
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
  }

  console.log(JSON.stringify({
    ok: true,
    mode: output.mode,
    reportPath,
    updates: plan.updates.length,
    boundScheduleCount: plan.updates.filter(item => item.boundStudentIds.length > 0).length,
    boundStudentIds: [...new Set(plan.updates.flatMap(item => item.boundStudentIds))].length,
    skipped: plan.skipped.length,
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

module.exports = { buildPlan, splitStudentNames, normalizeCourse };
