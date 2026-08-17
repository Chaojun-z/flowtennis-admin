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
const { buildIndexRows } = require('./repair-student-active-entitlement-index-20260522');
const { buildCoachResolver } = require('./repair-history-annotated-risk-rules-20260816');

const ROOT = path.join(__dirname, '..');
const OPERATION_ID = 'repair-qiqi-eleven-cao-student-risk-20260817';
const BATCH_ID = `batch-${OPERATION_ID}`;
const REPORT_DIR = path.join(ROOT, 'offline-reports');

const TABLES = {
  students: 'ft_students',
  leads: 'ft_leads',
  leadFollowups: 'ft_lead_followups',
  purchases: 'ft_purchases',
  entitlements: 'ft_entitlements',
  entitlementLedger: 'ft_entitlement_ledger',
  financialLedger: 'ft_financial_ledger',
  schedule: 'ft_schedule',
  plans: 'ft_plans',
  feedbacks: 'ft_feedbacks',
  coaches: 'ft_coaches',
  activeEntitlementIndex: 'ft_student_active_entitlement_index',
  conflictIndex: 'ft_schedule_conflict_index'
};

const QIQI_KEEP_ID = 'seed-student-037';
const QIQI_MERGE_IDS = [
  '0bc19d77-1861-4739-94d3-636f7cb2a15d',
  'cxe-thirdparty-202606-student-38fcc7f12cfc'
];
const QIQI_CANONICAL_NAME = '淇淇（ZT）';
const QIQI_KEEP_LEAD_ID = 'new-lead-6c9d89cc0a6e';
const QIQI_MERGE_LEAD_IDS = [
  'f7796346-e97c-49db-8c5b-2c2a21602e24',
  'lead-from-student-cxe-thirdparty-202606-student-38fcc7f12cfc'
];
const QIQI_BIND_SCHEDULE_IDS = new Set([
  'cxe-thirdparty-202604-schedule-fb5a10b0802f'
]);

const ELEVEN_STUDENT_ID = 'e4cabca0-6aa8-4786-9e11-73779d6fb855';
const ELEVEN_SCHEDULE_ID = 'cxe-thirdparty-202604-schedule-6275ca64c570';
const ELEVEN_NAME = '十一';

const CAOZHIGUO_STUDENT_ID = 'repair-student-20260816-3ffd91c12e69';
const CAOZHIGUO_SCHEDULE_ID = 'cxe-202602-thirdparty-schedule-22919c733218c3a7';
const CAOZHIGUO_NAME = '曹志国';

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

function replaceIds(value, fromIds, toId) {
  return [...new Set(parseArr(value).map(id => fromIds.has(id) ? toId : id).filter(Boolean))];
}

function hasStudentRef(row, ids) {
  return ids.has(text(row.studentId))
    || parseArr(row.studentIds).some(id => ids.has(id))
    || parseArr(row.expectedStudentIds).some(id => ids.has(id));
}

function containsQiqiName(value) {
  const compact = text(value).replace(/[、，,\s()（）]/g, '').toLowerCase();
  return compact.includes('淇淇') || compact.includes('qiqi');
}

function isActiveSchedule(row) {
  return row && text(row.status || '已排课') !== '已取消';
}

function qiqiCoursePatch(row = {}) {
  const course = text(row.courseType || row.standardCourseType);
  if (/体验/.test(course)) {
    return {
      courseType: '体验课',
      standardCourseType: '青少年私教【体验】',
      courseDisplayName: '青少年私教【体验】',
      courseTypeLevel2: '青少年体验课',
      experienceType: '青少年',
      isTrial: true
    };
  }
  if (/私教/.test(course)) {
    return {
      courseType: '私教课',
      standardCourseType: '青少年私教【正式】',
      courseDisplayName: '青少年私教【正式】',
      courseTypeLevel2: '青少年私教课',
      experienceType: '',
      isTrial: false
    };
  }
  return {};
}

function trialCoursePatch(row = {}) {
  const course = text(row.courseType || row.standardCourseType);
  if (!/体验/.test(course)) return {};
  return {
    courseType: '体验课',
    standardCourseType: '成人私教【体验】',
    courseDisplayName: '成人私教【体验】',
    courseTypeLevel2: '成人体验课',
    experienceType: '成人',
    isTrial: true
  };
}

function uniqText(values) {
  return [...new Set((values || []).map(text).filter(Boolean))];
}

function mergeNotes(values) {
  return uniqText(values).join('；');
}

function changed(before, after, keys) {
  return keys.filter(key => JSON.stringify(before?.[key] ?? '') !== JSON.stringify(after?.[key] ?? ''));
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

function buildStudentUpdate(students, now) {
  const keep = students.find(row => text(row.id) === QIQI_KEEP_ID);
  const merged = students.filter(row => QIQI_MERGE_IDS.includes(text(row.id)));
  if (!keep) throw new Error(`淇淇保留学员不存在：${QIQI_KEEP_ID}`);
  if (merged.length !== QIQI_MERGE_IDS.length) throw new Error('淇淇重复学员档案不完整，停止');
  return trace({
    ...keep,
    name: QIQI_CANONICAL_NAME,
    studentName: QIQI_CANONICAL_NAME,
    displayName: QIQI_CANONICAL_NAME,
    type: '青少年',
    campus: text(keep.campus) || 'shunyi_mapo',
    phone: text(keep.phone) || text(merged.find(row => text(row.phone))?.phone),
    primaryCoach: text(keep.primaryCoach) || text(merged.find(row => text(row.primaryCoach))?.primaryCoach),
    sourceLeadId: QIQI_KEEP_LEAD_ID,
    aliases: uniqText([...(parseArr(keep.aliases)), ...(parseArr(keep.aliasNames)), '淇淇', '（淇淇）ZT']),
    mergedStudentIds: uniqText([...(parseArr(keep.mergedStudentIds)), ...QIQI_MERGE_IDS]),
    mergedSourceLeadIds: uniqText([...(parseArr(keep.mergedSourceLeadIds)), ...QIQI_MERGE_LEAD_IDS]),
    notes: mergeNotes([keep.notes, ...merged.map(row => row.notes)])
  }, now, '用户确认：淇淇三个重复学员合并为淇淇（ZT），类型青少年');
}

function buildLeadUpdates(leads, now) {
  const keep = leads.find(row => text(row.id) === QIQI_KEEP_LEAD_ID);
  if (!keep) throw new Error(`淇淇主线索不存在：${QIQI_KEEP_LEAD_ID}`);
  const merged = leads.filter(row => QIQI_MERGE_LEAD_IDS.includes(text(row.id)));
  return [
    trace({
      ...keep,
      displayName: QIQI_CANONICAL_NAME,
      wechatName: QIQI_CANONICAL_NAME,
      studentId: QIQI_KEEP_ID,
      customerType: '青少年',
      isCourseConverted: true,
      mergedLeadIds: uniqText([...(parseArr(keep.mergedLeadIds)), ...QIQI_MERGE_LEAD_IDS]),
      latestConclusion: text(keep.latestConclusion) || text(merged.find(row => text(row.latestConclusion))?.latestConclusion),
      profileNote: mergeNotes([keep.profileNote, ...merged.map(row => row.profileNote)])
    }, now, '用户确认：淇淇重复线索归并到主学员')
  ];
}

function canonicalStudentRow(row, studentId, studentName, now) {
  return trace({
    ...row,
    studentId,
    studentName,
    studentNames: [studentName],
    studentIds: [studentId],
    expectedStudentIds: [studentId]
  }, now, `用户确认：绑定真实学员 ${studentName}`);
}

function buildScheduleUpdates({ schedules, coaches, now }) {
  const qiqiIds = new Set([QIQI_KEEP_ID, ...QIQI_MERGE_IDS]);
  const resolveCoach = buildCoachResolver(coaches);
  const updates = [];
  for (const row of schedules) {
    let after = null;
    if (
      hasStudentRef(row, qiqiIds)
      || QIQI_BIND_SCHEDULE_IDS.has(text(row.id))
      || (containsQiqiName(row.studentName) && /Siren|沙琪儿|莎莎/i.test(text(row.coach)))
    ) {
      after = trace({
        ...row,
        studentId: text(row.studentId) && qiqiIds.has(text(row.studentId)) ? QIQI_KEEP_ID : text(row.studentId),
        studentName: QIQI_CANONICAL_NAME,
        studentNames: [QIQI_CANONICAL_NAME],
        studentIds: replaceIds(row.studentIds, new Set(QIQI_MERGE_IDS), QIQI_KEEP_ID).length
          ? replaceIds(row.studentIds, new Set(QIQI_MERGE_IDS), QIQI_KEEP_ID)
          : [QIQI_KEEP_ID],
        expectedStudentIds: replaceIds(row.expectedStudentIds, new Set(QIQI_MERGE_IDS), QIQI_KEEP_ID).length
          ? replaceIds(row.expectedStudentIds, new Set(QIQI_MERGE_IDS), QIQI_KEEP_ID)
          : [QIQI_KEEP_ID],
        coach: resolveCoach(row.coach || row.coachName),
        sourceLeadId: text(row.sourceLeadId) || QIQI_KEEP_LEAD_ID,
        sourceLeadName: text(row.sourceLeadName) || QIQI_CANONICAL_NAME,
        ...qiqiCoursePatch(row)
      }, now, '用户确认：淇淇重复档案合并并修正青少年课程信息');
    } else if (text(row.id) === ELEVEN_SCHEDULE_ID) {
      after = trace({
        ...canonicalStudentRow(row, ELEVEN_STUDENT_ID, ELEVEN_NAME, now),
        coach: resolveCoach(row.coach || row.coachName),
        sourceLeadId: text(row.sourceLeadId) || 'a1f3d56b-20d5-44f2-8f72-214dfdde2083',
        sourceLeadName: text(row.sourceLeadName) || ELEVEN_NAME,
        ...trialCoursePatch(row)
      }, now, '用户确认：11 就是十一');
    } else if (text(row.id) === CAOZHIGUO_SCHEDULE_ID) {
      after = trace({
        ...canonicalStudentRow(row, CAOZHIGUO_STUDENT_ID, CAOZHIGUO_NAME, now),
        coach: resolveCoach(row.coach || row.coachName),
        sourceLeadId: text(row.sourceLeadId) || 'lead-from-student-repair-student-20260816-3ffd91c12e69',
        sourceLeadName: text(row.sourceLeadName) || CAOZHIGUO_NAME,
        ...trialCoursePatch(row)
      }, now, '用户确认：曹志国只有一个，绑定现有曹志国学员');
    }
    if (!after) continue;
    const fields = changed(row, after, [
      'studentId',
      'studentName',
      'studentNames',
      'studentIds',
      'expectedStudentIds',
      'coach',
      'sourceLeadId',
      'sourceLeadName',
      'courseType',
      'standardCourseType',
      'courseDisplayName',
      'courseTypeLevel2',
      'experienceType',
      'isTrial'
    ]);
    if (fields.length) updates.push({ id: row.id, before: row, after, changedFields: fields });
  }
  return updates;
}

function buildRefUpdates(rows, table, fromIds, toId, name, now) {
  return (rows || [])
    .filter(row => hasStudentRef(row, fromIds) || (text(row.studentId) === toId && text(row.studentName) && text(row.studentName) !== name))
    .map(row => {
      const after = trace({
        ...row,
        studentId: fromIds.has(text(row.studentId)) ? toId : row.studentId,
        studentIds: replaceIds(row.studentIds, fromIds, toId),
        expectedStudentIds: replaceIds(row.expectedStudentIds, fromIds, toId),
        studentName: name
      }, now, `用户确认：${name} 学员档案合并后同步 ${table} 引用`);
      return { table, id: row.id, before: row, after };
    });
}

function buildPlan(data, now = new Date().toISOString()) {
  const qiqiFromIds = new Set(QIQI_MERGE_IDS);
  const qiqiAllIds = new Set([QIQI_KEEP_ID, ...QIQI_MERGE_IDS]);
  const studentUpdate = buildStudentUpdate(data.students, now);
  const leadUpdates = buildLeadUpdates(data.leads, now);
  const scheduleUpdates = buildScheduleUpdates({ schedules: data.schedule, coaches: data.coaches, now });

  const tableUpdates = [
    ...buildRefUpdates(data.purchases, TABLES.purchases, qiqiFromIds, QIQI_KEEP_ID, QIQI_CANONICAL_NAME, now),
    ...buildRefUpdates(data.entitlements, TABLES.entitlements, qiqiFromIds, QIQI_KEEP_ID, QIQI_CANONICAL_NAME, now),
    ...buildRefUpdates(data.entitlementLedger, TABLES.entitlementLedger, qiqiAllIds, QIQI_KEEP_ID, QIQI_CANONICAL_NAME, now),
    ...buildRefUpdates(data.financialLedger, TABLES.financialLedger, qiqiAllIds, QIQI_KEEP_ID, QIQI_CANONICAL_NAME, now),
    ...buildRefUpdates(data.plans, TABLES.plans, qiqiFromIds, QIQI_KEEP_ID, QIQI_CANONICAL_NAME, now),
    ...buildRefUpdates(data.feedbacks, TABLES.feedbacks, qiqiAllIds, QIQI_KEEP_ID, QIQI_CANONICAL_NAME, now)
  ];

  const leadFollowupUpdates = (data.leadFollowups || [])
    .filter(row => QIQI_MERGE_LEAD_IDS.includes(text(row.leadId)))
    .map(row => ({
      table: TABLES.leadFollowups,
      id: row.id,
      before: row,
      after: trace({ ...row, leadId: QIQI_KEEP_LEAD_ID }, now, '用户确认：淇淇重复线索跟进归并')
    }));

  const nextEntitlements = (data.entitlements || []).map(row => {
    const update = tableUpdates.find(item => item.table === TABLES.entitlements && text(item.id) === text(row.id));
    return update ? update.after : row;
  });
  const activeIndexRows = buildIndexRows(nextEntitlements, now).filter(row => row.id === QIQI_KEEP_ID);
  const affectedScheduleIds = new Set(scheduleUpdates.map(item => text(item.id)));
  const staleConflictIndexIds = (data.conflictIndex || [])
    .filter(row => affectedScheduleIds.has(text(row.scheduleId)))
    .map(row => text(row.id))
    .filter(id => id && id !== SCHEDULE_CONFLICT_INDEX_READY_ID);

  return {
    studentUpdate,
    leadUpdates,
    scheduleUpdates,
    tableUpdates,
    leadFollowupUpdates,
    deleteStudentIds: QIQI_MERGE_IDS.filter(id => data.students.some(row => text(row.id) === id)),
    deleteLeadIds: QIQI_MERGE_LEAD_IDS.filter(id => data.leads.some(row => text(row.id) === id)),
    deleteActiveIndexIds: QIQI_MERGE_IDS,
    activeIndexRows,
    conflictIndex: {
      staleIndexIds: staleConflictIndexIds,
      nextIndexRows: scheduleUpdates.flatMap(item => isActiveSchedule(item.after) ? scheduleConflictIndexRowsForRecord(item.after) : [])
    }
  };
}

function summarize(plan, target, mode, reportPath, generatedAt) {
  const byTable = {};
  for (const item of plan.tableUpdates) byTable[item.table] = (byTable[item.table] || 0) + 1;
  return {
    ok: true,
    mode,
    target,
    reportPath,
    operationId: OPERATION_ID,
    batchId: BATCH_ID,
    generatedAt,
    counts: {
      studentUpdates: 1,
      leadUpdates: plan.leadUpdates.length,
      scheduleUpdates: plan.scheduleUpdates.length,
      otherTableUpdates: plan.tableUpdates.length,
      leadFollowupUpdates: plan.leadFollowupUpdates.length,
      deleteStudents: plan.deleteStudentIds.length,
      deleteLeads: plan.deleteLeadIds.length,
      deleteActiveIndexes: plan.deleteActiveIndexIds.length,
      putActiveIndexes: plan.activeIndexRows.length,
      deleteConflictIndexes: plan.conflictIndex.staleIndexIds.length,
      putConflictIndexes: plan.conflictIndex.nextIndexRows.length
    },
    byTable,
    scheduleUpdates: plan.scheduleUpdates.map(item => ({
      id: item.id,
      startTime: item.before.startTime,
      endTime: item.before.endTime,
      beforeStudentName: item.before.studentName,
      afterStudentName: item.after.studentName,
      afterStudentIds: item.after.studentIds,
      changedFields: item.changedFields
    })),
    deleteStudentIds: plan.deleteStudentIds,
    deleteLeadIds: plan.deleteLeadIds
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
  const data = {};
  for (const [key, table] of Object.entries(TABLES)) {
    data[key] = await scanTable(client, table).catch(() => []);
  }
  const generatedAt = new Date().toISOString();
  const plan = buildPlan(data, generatedAt);
  const summary = summarize(plan, target, args.write ? 'write' : 'dry-run', reportPath, generatedAt);
  const output = { ...summary, plan };
  fs.mkdirSync(REPORT_DIR, { recursive: true });
  fs.writeFileSync(reportPath, `${JSON.stringify(output, null, 2)}\n`, 'utf8');

  if (args.write) {
    await retry('create active entitlement index table', () => createTableIfMissing(client, TABLES.activeEntitlementIndex));
    await retry('create conflict index table', () => createTableIfMissing(client, TABLES.conflictIndex));
    await retry(`put student ${plan.studentUpdate.id}`, () => putRow(client, TABLES.students, plan.studentUpdate));
    for (const row of plan.leadUpdates) await retry(`put lead ${row.id}`, () => putRow(client, TABLES.leads, row));
    for (const item of plan.scheduleUpdates) await retry(`put schedule ${item.id}`, () => putRow(client, TABLES.schedule, item.after));
    for (const item of plan.tableUpdates) await retry(`put ${item.table} ${item.id}`, () => putRow(client, item.table, item.after));
    for (const item of plan.leadFollowupUpdates) await retry(`put lead followup ${item.id}`, () => putRow(client, TABLES.leadFollowups, item.after));
    for (const id of plan.deleteLeadIds) await retry(`delete lead ${id}`, () => deleteRow(client, TABLES.leads, id));
    for (const id of plan.deleteActiveIndexIds) await retry(`delete active index ${id}`, () => deleteRow(client, TABLES.activeEntitlementIndex, id));
    for (const row of plan.activeIndexRows) await retry(`put active index ${row.id}`, () => putRow(client, TABLES.activeEntitlementIndex, row));
    for (const id of plan.conflictIndex.staleIndexIds) await retry(`delete conflict index ${id}`, () => deleteRow(client, TABLES.conflictIndex, id));
    for (const row of plan.conflictIndex.nextIndexRows) await retry(`put conflict index ${row.id}`, () => putRow(client, TABLES.conflictIndex, row));
    await retry('mark conflict index ready', () => putRow(client, TABLES.conflictIndex, {
      id: SCHEDULE_CONFLICT_INDEX_READY_ID,
      ready: true,
      updatedAt: generatedAt,
      operationId: OPERATION_ID
    }));
    for (const id of plan.deleteStudentIds) await retry(`delete student ${id}`, () => deleteRow(client, TABLES.students, id));
  }

  console.log(JSON.stringify(summary, null, 2));
  return output;
}

if (require.main === module) {
  run().catch(error => {
    console.error(error?.stack || String(error));
    process.exit(1);
  });
}

module.exports = { buildPlan, run };
