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
const OPERATION_ID = 'repair-feishu-aug-confirmed-corrections-20260818';
const BATCH_ID = `batch-${OPERATION_ID}`;
const REPORT_DIR = path.join(ROOT, 'offline-reports');

const TABLES = {
  students: 'ft_students',
  leads: 'ft_leads',
  packages: 'ft_packages',
  purchases: 'ft_purchases',
  entitlements: 'ft_entitlements',
  entitlementLedger: 'ft_entitlement_ledger',
  schedule: 'ft_schedule',
  sync: 'ft_feishu_schedule_sync',
  tasks: 'ft_feishu_schedule_tasks',
  activeIndex: 'ft_student_active_entitlement_index',
  conflictIndex: 'ft_schedule_conflict_index'
};

const FORMAL_SCHEDULES = [
  {
    id: 'repair-20260818-schedule-wang-ameng-20260818-1100',
    ledgerId: 'repair-20260818-ledger-wang-ameng-20260818-1100',
    sourceKey: 'i1nPU2|2026-08-18|11:00|12:00|岳克舟|王先生|成人私教【正式】|马坡室内|1号',
    sheetId: 'i1nPU2',
    sheetTitle: '8.17-8.23',
    sourceCell: 'R37C20',
    startTime: '2026-08-18 11:00',
    endTime: '2026-08-18 12:00',
    coach: '岳克舟教练',
    studentName: '王先生（阿萌）',
    studentId: '9057a99b-b7a5-4c0d-821f-3cb3b8adf67c',
    entitlementId: 'repair-20260813-entitlement-wang-ameng-1v2-nonprime-20260814',
    venue: '1号场',
    standardCourseType: '成人私教【正式】',
    courseTypeLevel2: '成人私教课',
    lessonCount: 1,
    notes: '用户确认：2026-08-18 11:00 岳克舟/王先生为 1 号场'
  },
  {
    id: 'repair-20260818-schedule-zhen-20260818-1100',
    ledgerId: 'repair-20260818-ledger-zhen-20260818-1100',
    sourceKey: 'i1nPU2|2026-08-18|11:00|12:00|杨|甄女士|成人私教【正式】|马坡室内|2号',
    sheetId: 'i1nPU2',
    sheetTitle: '8.17-8.23',
    sourceCell: 'R37C28',
    startTime: '2026-08-18 11:00',
    endTime: '2026-08-18 12:00',
    coach: '杨教练',
    studentName: '甄女士',
    studentId: '6f9fc0d6-7456-47ab-9e7c-05220aafb4ef',
    entitlementId: 'repair-20260816-entitlement-zhen-1v1-adult-nonprime-20260815',
    venue: '2号场',
    standardCourseType: '成人私教【正式】',
    courseTypeLevel2: '成人私教课',
    lessonCount: 1,
    notes: '用户确认：2026-08-18 11:00 杨教练/甄女士为 2 号场'
  },
  {
    id: 'repair-20260818-schedule-shiduohao-20260821-1100',
    ledgerId: 'repair-20260818-ledger-shiduohao-20260821-1100',
    sourceKey: 'i1nPU2|2026-08-21|11:00|12:00|林铭|史多灏|成人私教【正式】|马坡室内|4号',
    sheetId: 'i1nPU2',
    sheetTitle: '8.17-8.23',
    sourceCell: 'R121C12',
    startTime: '2026-08-21 11:00',
    endTime: '2026-08-21 12:00',
    coach: '林铭教练',
    studentName: '史多灏',
    studentId: '819727f6-b902-49fd-af87-fdec04716b19',
    entitlementId: '1a523076-0f51-43c6-af35-3a5b99012ba5',
    venue: '4号场',
    standardCourseType: '成人私教【正式】',
    courseTypeLevel2: '成人私教课',
    lessonCount: 1,
    notes: '用户确认：2026-08-21 11:00 林铭/史多灏为 4 号场，Siren/W.Jing 保持 3 号场'
  }
];

const ADDITIONAL_CONFIRMED_FORMAL_SCHEDULES = [
  {
    id: 'repair-20260818-schedule-ideal-group-20260818-1900',
    ledgerId: 'repair-20260818-ledger-ideal-group-20260818-1900',
    sourceKey: 'i1nPU2|2026-08-18|19:00|21:00|杨|理想团课|理想团课|马坡室内|3号',
    sheetId: 'i1nPU2',
    sheetTitle: '8.17-8.23',
    sourceCell: 'R53C28',
    startTime: '2026-08-18 19:00',
    endTime: '2026-08-18 21:00',
    coach: '杨教练',
    studentName: '理想团课',
    studentId: 'student-ideal-group-enterprise',
    entitlementId: 'entitlement-ideal-group-enterprise-20260811',
    venue: '3号场',
    standardCourseType: '理想团课',
    courseTypeLevel2: '企业团课',
    lessonCount: 2,
    courseType: '小班课',
    packageOwnerNote: '用户确认：理想团课是特殊学员名，直接按理想团课排课'
  },
  {
    id: 'repair-20260818-schedule-huang-misha-20260819-1200',
    ledgerId: 'repair-20260818-ledger-huang-misha-20260819-1200',
    sourceKey: 'i1nPU2|2026-08-19|12:00|13:00|朝珺|黄总misha|成人私教【正式】|马坡室内|1号',
    sheetId: 'i1nPU2',
    sheetTitle: '8.17-8.23',
    sourceCell: 'R85C4',
    startTime: '2026-08-19 12:00',
    endTime: '2026-08-19 13:00',
    coach: '朝珺教练',
    studentName: 'misha 黄总',
    studentId: 'seed-student-003',
    studentIds: ['seed-student-002', 'seed-student-003'],
    entitlementId: 'repair-20260812-entitlement-huang-nonprime-20260527',
    venue: '1号场',
    standardCourseType: '成人私教【正式】',
    courseTypeLevel2: '成人私教课',
    lessonCount: 1,
    courseType: '私教课',
    packageOwnerNote: '用户确认：misha 和黄总 1V2 轮流扣 1V1 课包，本次扣黄总课包'
  }
];

const CONFIRMED_TRIAL_SCHEDULES = [
  {
    id: 'repair-20260818-schedule-ops-20260809-1500',
    ledgerId: 'repair-20260818-ledger-ops-20260809-1500',
    purchaseId: 'repair-20260818-purchase-ops-trial-20260809',
    entitlementId: 'repair-20260818-entitlement-ops-trial-20260809',
    sourceKey: 'EGRknT|2026-08-09|15:00|16:00|林铭|ops|成人私教【体验】|马坡室内|2号',
    sheetId: 'EGRknT',
    sheetTitle: '8.3-8.9',
    sourceCell: 'R157C12',
    startTime: '2026-08-09 15:00',
    endTime: '2026-08-09 16:00',
    coach: '林铭教练',
    studentName: 'Ops💫',
    studentId: 'repair-20260818-student-ops',
    leadId: 'lead-manual-1wcux71',
    venue: '2号场',
    note: '用户确认：ops 对应 Ops💫'
  },
  {
    id: 'repair-20260818-schedule-wang-ameng-trial-20260812-1600',
    ledgerId: 'repair-20260818-ledger-wang-ameng-trial-20260812-1600',
    purchaseId: '21d6c15c-9f49-4b2c-9385-b23b3552d6d6',
    entitlementId: 'f5125007-de72-4059-b2b5-028230cd35ee',
    sourceKey: 'yGW4Do|2026-08-12|16:00|17:00|林铭|王先生|成人私教【体验】|马坡室内|4号',
    sheetId: 'yGW4Do',
    sheetTitle: '8.10-8.16',
    sourceCell: 'R75C12',
    startTime: '2026-08-12 16:00',
    endTime: '2026-08-12 17:00',
    coach: '林铭教练',
    studentName: '王先生（阿萌）',
    studentId: '9057a99b-b7a5-4c0d-821f-3cb3b8adf67c',
    leadId: 'lead-manual-le62pg',
    venue: '4号场',
    note: '用户确认：2026-08-12 16:00-17:00 林铭/王先生为 4 号场课程'
  },
  {
    id: 'repair-20260818-schedule-baiyang-trial-20260814-1900',
    ledgerId: 'repair-20260818-ledger-baiyang-trial-20260814-1900',
    purchaseId: 'repair-20260818-purchase-baiyang-trial-20260814',
    entitlementId: 'repair-20260818-entitlement-baiyang-trial-20260814',
    sourceKey: 'yGW4Do|2026-08-14|19:00|20:00|岳克舟|柏杨|成人私教【体验】|马坡室内|3号',
    sheetId: 'yGW4Do',
    sheetTitle: '8.10-8.16',
    sourceCell: 'R109C20',
    startTime: '2026-08-14 19:00',
    endTime: '2026-08-14 20:00',
    coach: '岳克舟教练',
    studentName: '柏杨（无名 Yang）',
    studentId: 'repair-20260818-student-baiyang',
    leadId: 'lead-manual-1nqgv89',
    venue: '3号场',
    note: '用户确认：柏杨对应柏杨（无名 Yang）'
  }
];

const CONFIRMED_DIRECT_SCHEDULES = [
  {
    id: 'repair-20260818-schedule-jerry-wife-ace-20260816-1000',
    sourceKey: 'yGW4Do|2026-08-16|10:00|11:30|岳克舟|jerry、jerry、艾斯|初阶训练课体验课/正式课|马坡室内|1号',
    sheetId: 'yGW4Do',
    sheetTitle: '8.10-8.16',
    sourceCell: 'R177C20',
    startTime: '2026-08-16 10:00',
    endTime: '2026-08-16 11:30',
    coach: '岳克舟教练',
    studentName: 'Jerry、Jerry 老婆、艾斯',
    studentIds: [
      'repair-20260803-student-jerry',
      'repair-20260818-student-jerry-wife',
      'new-student-9f2faf5f3ee4'
    ],
    students: [
      { id: 'repair-20260803-student-jerry', name: 'Jerry' },
      { id: 'repair-20260818-student-jerry-wife', name: 'Jerry 老婆', leadId: 'repair-20260818-lead-jerry-wife' },
      { id: 'new-student-9f2faf5f3ee4', name: '艾斯' }
    ],
    venue: '1号场',
    courseType: '专项课',
    standardCourseType: '专项课',
    courseDisplayName: '【零基础】初阶专项课',
    courseTypeLevel2: '',
    skillLevelMin: '零基础',
    skillLevelMax: '零基础',
    specialTopic: '初阶专项课',
    lessonCount: 1.5,
    paidAmount: 594,
    payMethod: '微信',
    notes: '用户确认：Jerry、Jerry 老婆、艾斯三人上课，每人支付 198 元，微信合计收款 594 元'
  }
];

const YANG_ZITIAN_SCHEDULE_IDS = [
  '6c2d5b08-8d35-4d71-bfef-8ec1a2aac21a',
  'b49e184c-98d3-413f-a62a-fb5d06f38699'
];

const SUPERSEDE_TASK_SOURCE_KEYS = new Set([
  'EGRknT|2026-08-07|11:00|12:00|林铭|杨梓天|成人私教【正式】|马坡室内|4号',
  'yGW4Do|2026-08-14|11:00|12:00|林铭|杨梓天|成人私教【正式】|马坡室内|1号',
  'i1nPU2|2026-08-18|11:00|12:00|岳克舟|王先生|成人私教【正式】|马坡室内|3号',
  'i1nPU2|2026-08-18|11:00|12:00|岳克舟|王先生|成人私教【正式】|马坡室内|1号',
  'i1nPU2|2026-08-18|11:00|12:00|杨|甄女士|成人私教【正式】|马坡室内|3号',
  'i1nPU2|2026-08-18|11:00|12:00|杨|甄女士|成人私教【正式】|马坡室内|2号',
  'i1nPU2|2026-08-21|11:00|12:00|林铭|史多灏|成人私教【正式】|马坡室内|3号',
  'i1nPU2|2026-08-21|11:00|12:00|林铭|史多灏|成人私教【正式】|马坡室内|4号',
  'EGRknT|2026-08-08|15:00|16:00|朝珺|木子|成人私教【正式】|马坡室内|1号',
  'EGRknT|2026-08-08|15:00|16:00|siren|朝珺木子|成人私教【正式】|马坡室内|1号',
  'yGW4Do|2026-08-15|17:00|18:00|岳克舟|kk|成人私教【体验】|马坡室内|2号'
]);

function text(value) {
  return String(value ?? '').trim();
}

function hash(value) {
  return crypto.createHash('sha256').update(String(value)).digest('hex');
}

function active(row = {}) {
  return text(row.status || '已排课') !== '已取消';
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

function appendUnique(list, item) {
  const id = text((item.after || item.before || {}).id);
  if (!id) return;
  const index = list.findIndex(row => text((row.after || row.before || {}).id) === id);
  if (index >= 0) list[index] = item;
  else list.push(item);
}

function parseArray(value) {
  if (Array.isArray(value)) return value;
  if (typeof value === 'string' && value) {
    try { return JSON.parse(value); } catch { return value.split(/[、,，/]+/).map(text).filter(Boolean); }
  }
  return [];
}

function findById(rows, id) {
  return rows.find(row => text(row.id) === text(id)) || null;
}

function findStudentByName(students, name) {
  const key = normalizeNameKey(name);
  const rows = students.filter(row => {
    const rowKey = normalizeNameKey(row.name || row.studentName || row.displayName);
    return rowKey && key && (rowKey === key || rowKey.includes(key) || key.includes(rowKey));
  });
  return rows.length ? rows[0] : null;
}

function matchingSchedule(schedules, target, studentId = '') {
  return schedules.find(row => active(row) &&
    text(row.startTime).slice(0, 16) === target.startTime &&
    text(row.endTime).slice(0, 16) === target.endTime &&
    normalizeNameKey(row.coach || row.coachName) === normalizeNameKey(target.coach) &&
    text(row.venue) === target.venue &&
    (studentId ? parseArray(row.studentIds).map(String).includes(String(studentId)) : text(row.studentName) === text(target.studentName))
  ) || null;
}

function activeIndexRow(entitlements, studentId) {
  return {
    id: studentId,
    studentId,
    entitlementIds: entitlements
      .filter(row => text(row.studentId) === text(studentId) && text(row.status || 'active') === 'active' && Number(row.remainingLessons || 0) > 0)
      .map(row => text(row.id))
      .filter(Boolean)
  };
}

function nextEntitlement(entitlement, count, now, reason) {
  const used = Number(entitlement.usedLessons || 0) + Number(count || 0);
  const remaining = Math.max(0, Number(entitlement.remainingLessons || 0) - Number(count || 0));
  return trace({ ...entitlement, usedLessons: used, remainingLessons: remaining, status: remaining > 0 ? 'active' : 'depleted' }, now, reason);
}

function syncRowFor(target, scheduleId, fingerprint = '') {
  return {
    id: `feishu-sync-${hash(target.sourceKey).slice(0, 24)}`,
    source: 'feishu-sheet',
    sheetId: target.sheetId,
    sheetTitle: target.sheetTitle,
    sourceKey: target.sourceKey,
    scheduleId,
    startTime: target.startTime,
    endTime: target.endTime,
    lastFingerprint: fingerprint,
    status: 'active'
  };
}

function buildFormalSchedule(target, student, entitlement, now) {
  const studentIds = target.studentIds || [student.id];
  return trace({
    id: target.id,
    startTime: target.startTime,
    endTime: target.endTime,
    studentIds,
    expectedStudentIds: studentIds,
    absentStudentIds: [],
    studentName: target.studentName,
    courseType: target.courseType || '私教课',
    standardCourseType: target.standardCourseType,
    courseDisplayName: target.standardCourseType,
    courseTypeLevel2: target.courseTypeLevel2,
    experienceType: '',
    isTrial: false,
    coach: target.coach,
    coachId: '',
    campus: 'shunyi_mapo',
    venue: target.venue,
    lessonCount: target.lessonCount,
    status: '已排课',
    settlementType: 'package',
    entitlementId: entitlement.id,
    entitlementIds: [entitlement.id],
    packageName: entitlement.packageName || '',
    purchaseId: entitlement.purchaseId || '',
    scheduleSource: 'feishu-sheet',
    notes: `${target.packageOwnerNote || target.notes}；飞书排课表同步 ${target.sheetTitle} ${target.sourceCell}`
  }, now, target.packageOwnerNote || target.notes);
}

function buildLedger(target, schedule, entitlement, now) {
  return trace({
    id: target.ledgerId,
    entitlementId: entitlement.id,
    studentId: entitlement.studentId || schedule.studentIds[0] || '',
    studentName: entitlement.studentName || schedule.studentName,
    purchaseId: entitlement.purchaseId || '',
    packageName: entitlement.packageName || '',
    scheduleId: schedule.id,
    lessonDelta: -Number(target.lessonCount || 1),
    action: 'consume',
    reason: `${schedule.studentName}排课核销`,
    relatedDate: schedule.startTime.slice(0, 10),
    operator: 'Codex',
    createdAt: now
  }, now, `${schedule.studentName}排课核销`);
}

function planFormalSchedule(target, data, updates, skipped, now) {
  const student = findById(data.students, target.studentId);
  const entitlement = findById(data.entitlements, target.entitlementId);
  if (!student || !entitlement) {
    skipped.push({ action: 'createFormalSchedule', label: target.studentName, reason: '学员或课包不存在', studentId: target.studentId, entitlementId: target.entitlementId });
    return;
  }
  const existing = findById(data.schedule, target.id) || matchingSchedule(data.schedule, target, target.studentId);
  const schedule = existing || buildFormalSchedule(target, student, entitlement, now);
  if (!existing) appendUnique(updates.schedule, { before: null, after: schedule });
  const ledgerExists = data.entitlementLedger.some(row => text(row.scheduleId) === text(schedule.id) && text(row.entitlementId) === text(entitlement.id) && Number(row.lessonDelta || 0) < 0);
  if (!ledgerExists) {
    if (Number(entitlement.remainingLessons || 0) < Number(target.lessonCount || 1)) {
      skipped.push({ action: 'consumeEntitlement', label: target.studentName, reason: '课包剩余课时不足', entitlementId: entitlement.id });
      return;
    }
    const next = nextEntitlement(entitlement, target.lessonCount, now, `${target.studentName}课包余额按补排课回算`);
    appendUnique(updates.entitlements, { before: entitlement, after: next });
    appendUnique(updates.entitlementLedger, { before: null, after: buildLedger(target, schedule, entitlement, now) });
  }
  const existingSync = data.sync.find(row => text(row.sourceKey) === text(target.sourceKey));
  appendUnique(updates.sync, { before: existingSync || null, after: trace({ ...(existingSync || syncRowFor(target, schedule.id)), ...syncRowFor(target, schedule.id) }, now, '绑定用户确认后的飞书同步关系') });
  addConflictIndex(updates, data, schedule, now);
}

function ensureLeadAndStudent({ name, leadId, studentId, coach, campus = 'shunyi_mapo', source = '飞书排课表' }, data, updates, now) {
  let lead = findById(data.leads, leadId) || data.leads.find(row => normalizeNameKey(row.name || row.displayName || row.wechatName) === normalizeNameKey(name));
  const nameKey = normalizeNameKey(name);
  const existingStudent = findById(data.students, studentId) || data.students.find(row => {
    const rowKey = normalizeNameKey(row.name || row.studentName || row.displayName);
    return rowKey && nameKey && rowKey === nameKey;
  });
  const student = existingStudent || trace({
    id: studentId,
    name,
    studentName: name,
    displayName: name,
    phone: '',
    campus,
    type: '成人',
    primaryCoach: coach,
    source,
    sourceLeadId: lead?.id || leadId,
    status: 'active',
    notes: '用户确认：飞书排课硬对账补建学员档案',
    createdAt: now
  }, now, `补建${name}学员档案`);
  if (!existingStudent) appendUnique(updates.students, { before: null, after: student });
  if (!lead) {
    lead = trace({
      id: leadId,
      name,
      displayName: name,
      wechatName: name,
      phone: '',
      source,
      campus,
      customerType: '成人',
      demandProduct: '私教课',
      consultType: '私教课',
      rawStatus: '已约体验',
      studentId: student.id,
      createdAt: now
    }, now, `补建${name}线索`);
    appendUnique(updates.leads, { before: null, after: lead });
  } else if (text(lead.studentId) !== text(student.id)) {
    appendUnique(updates.leads, { before: lead, after: trace({ ...lead, studentId: student.id }, now, `关联${name}学员档案`) });
  }
  return { lead: updates.leads.find(item => text(item.after?.id) === text(lead.id))?.after || lead, student };
}

function planKkTrial(data, updates, skipped, now) {
  planTrialSchedule({
    id: 'repair-20260818-schedule-kk-20260815-1700',
    ledgerId: 'repair-20260818-ledger-kk-20260815-1700',
    purchaseId: 'repair-20260818-purchase-kk-trial-20260815',
    entitlementId: 'repair-20260818-entitlement-kk-trial-20260815',
    sourceKey: 'yGW4Do|2026-08-15|17:00|18:00|岳克舟|kk|成人私教【体验】|马坡室内|2号',
    sheetId: 'yGW4Do',
    sheetTitle: '8.10-8.16',
    sourceCell: 'R151C20',
    startTime: '2026-08-15 17:00',
    endTime: '2026-08-15 18:00',
    coach: '岳克舟教练',
    studentName: 'kk',
    studentId: 'repair-20260818-student-kk',
    leadId: 'repair-20260818-lead-kk',
    leadSource: '大众点评',
    venue: '2号场',
    note: '用户确认：kk 新建线索，走体验课路径'
  }, data, updates, skipped, now);
}

function planTrialSchedule(target, data, updates, skipped, now) {
  const existing = findById(data.schedule, target.id) || matchingSchedule(data.schedule, target);
  const { lead, student } = ensureLeadAndStudent({ name: target.studentName, leadId: target.leadId, studentId: target.studentId, coach: target.coach, source: target.leadSource || '飞书排课表' }, data, updates, now);
  const pkg = data.packages.find(row => text(row.courseType) === '体验课' && Number(row.price || row.packagePrice || row.salePrice || 0) === 239 && active(row));
  const existingPurchase = findById(data.purchases, target.purchaseId);
  const existingEntitlement = findById(data.entitlements, target.entitlementId);
  if (!pkg && !existingPurchase) {
    skipped.push({ action: 'createTrialSchedule', label: target.studentName, reason: '成人体验课包商品不存在' });
    return;
  }
  const purchase = existingPurchase || trace({
    id: target.purchaseId,
    studentId: student.id,
    studentName: student.name,
    packageId: pkg.id,
    packageName: pkg.name || pkg.packageName,
    packageLessons: 1,
    totalLessons: 1,
    packagePrice: 239,
    systemAmount: 239,
    finalAmount: 239,
    amountPaid: 239,
    purchaseDate: target.startTime.slice(0, 10),
    payMethod: '大众点评券码',
    operator: 'Codex',
    status: 'active',
    sourceType: 'manual-confirmed-feishu-repair',
    sourceKey: target.sourceKey,
    businessKey: `confirmed|${target.studentName}|trial|${target.startTime.slice(0, 10)}`,
    createdAt: now
  }, now, target.note);
  if (!findById(data.purchases, purchase.id)) appendUnique(updates.purchases, { before: null, after: purchase });
  const lessonDate = target.startTime.slice(0, 10);
  const entitlement = existingEntitlement || trace({
    id: target.entitlementId,
    studentId: student.id,
    studentName: student.name,
    purchaseId: purchase.id,
    packageId: pkg.id,
    packageName: pkg.name || pkg.packageName,
    courseType: '体验课',
    experienceType: '成人',
    totalLessons: 1,
    usedLessons: 1,
    remainingLessons: 0,
    status: 'depleted',
    validFrom: lessonDate,
    usageStartDate: lessonDate,
    createdAt: now
  }, now, `${target.studentName} 体验课权益创建并核销`);
  if (!findById(data.entitlements, entitlement.id)) appendUnique(updates.entitlements, { before: null, after: entitlement });
  if (existingEntitlement && !existing && !data.entitlementLedger.some(row => text(row.scheduleId) === text(target.id) && text(row.entitlementId) === text(entitlement.id) && Number(row.lessonDelta || 0) < 0)) {
    if (Number(existingEntitlement.remainingLessons || 0) < 1) {
      skipped.push({ action: 'consumeTrialEntitlement', label: target.studentName, reason: '体验课权益剩余课时不足', entitlementId: entitlement.id });
      return;
    }
    appendUnique(updates.entitlements, { before: existingEntitlement, after: nextEntitlement(existingEntitlement, 1, now, `${target.studentName}体验课按补排课回算`) });
  }
  const schedule = existing || trace({
    id: target.id,
    startTime: target.startTime,
    endTime: target.endTime,
    studentIds: [student.id],
    expectedStudentIds: [student.id],
    absentStudentIds: [],
    studentName: student.name,
    courseType: '体验课',
    standardCourseType: '成人私教【体验】',
    courseDisplayName: '成人私教【体验】',
    courseTypeLevel2: '成人体验课',
    experienceType: '成人',
    isTrial: true,
    coach: target.coach,
    coachId: '',
    campus: 'shunyi_mapo',
    venue: target.venue,
    lessonCount: 1,
    status: '已排课',
    settlementType: 'package',
    entitlementId: entitlement.id,
    entitlementIds: [entitlement.id],
    packageName: entitlement.packageName,
    purchaseId: purchase.id,
    scheduleSource: 'feishu-sheet',
    sourceLeadId: lead.id,
    sourceLeadName: lead.displayName || lead.name || '',
    notes: `${target.note}；飞书排课表同步 ${target.sheetTitle} ${target.sourceCell}`
  }, now, `用户确认：补建 ${target.studentName} 体验课排课`);
  if (!existing) appendUnique(updates.schedule, { before: null, after: schedule });
  if (!data.entitlementLedger.some(row => text(row.scheduleId) === text(schedule.id) && text(row.entitlementId) === text(entitlement.id) && Number(row.lessonDelta || 0) < 0)) {
    appendUnique(updates.entitlementLedger, { before: null, after: buildLedger(target, schedule, entitlement, now) });
  }
  const existingSync = data.sync.find(row => text(row.sourceKey) === text(target.sourceKey));
  appendUnique(updates.sync, { before: existingSync || null, after: trace({ ...(existingSync || syncRowFor(target, schedule.id)), ...syncRowFor(target, schedule.id) }, now, `绑定 ${target.studentName} 飞书同步关系`) });
  addConflictIndex(updates, data, schedule, now);
}

function planMuziBorrowedCourt(data, updates, skipped, now) {
  const target = {
    id: 'repair-20260818-schedule-muzi-20260808-1500',
    sourceKey: 'EGRknT|2026-08-08|15:00|16:00|朝珺|木子|成人私教【正式】|马坡室内|1号',
    sheetId: 'EGRknT',
    sheetTitle: '8.3-8.9',
    sourceCell: 'R157C4',
    startTime: '2026-08-08 15:00',
    endTime: '2026-08-08 16:00',
    coach: '朝珺教练',
    studentName: '木子',
    venue: '1号场'
  };
  const { lead, student } = ensureLeadAndStudent({ name: '木子', leadId: 'b16ee8c6-5cb9-4976-8e43-e9e6d4786776', studentId: 'repair-20260818-student-muzi', coach: target.coach, source: '飞书排课表' }, data, updates, now);
  const existing = findById(data.schedule, target.id) || matchingSchedule(data.schedule, target, student.id);
  const schedule = existing || trace({
    id: target.id,
    startTime: target.startTime,
    endTime: target.endTime,
    studentIds: [student.id],
    expectedStudentIds: [student.id],
    absentStudentIds: [],
    studentName: student.name,
    courseType: '私教课',
    standardCourseType: '成人私教【正式】',
    courseDisplayName: '成人私教【正式】',
    courseTypeLevel2: '成人私教课',
    experienceType: '',
    isTrial: false,
    coach: target.coach,
    coachId: '',
    campus: 'shunyi_mapo',
    venue: target.venue,
    lessonCount: 1,
    status: '已排课',
    settlementType: 'direct',
    payMethod: '',
    paidAmount: 0,
    allowLinkedVenueConflict: true,
    linkedScheduleGroupId: 'feishu-linked-20260808-1500-1',
    scheduleSource: 'feishu-sheet',
    sourceLeadId: lead.id,
    sourceLeadName: lead.displayName || lead.name || '',
    notes: '用户确认：朝珺给木子上课，借用 1 号场，与 Siren 小土豆的姐姐课程并行；只补排课事实，不自动扣课包'
  }, now, '用户确认：补建木子借场关联排课');
  if (!existing) appendUnique(updates.schedule, { before: null, after: schedule });
  const existingSync = data.sync.find(row => text(row.sourceKey) === text(target.sourceKey));
  appendUnique(updates.sync, { before: existingSync || null, after: trace({ ...(existingSync || syncRowFor(target, schedule.id)), ...syncRowFor(target, schedule.id) }, now, '绑定木子借场飞书同步关系') });
  addConflictIndex(updates, data, schedule, now);
  if (!student.id) skipped.push({ action: 'createMuziSchedule', label: '木子', reason: '木子学员档案不存在' });
}

function planDirectSchedule(target, data, updates, skipped, now) {
  const scheduleStudents = [];
  for (const item of target.students || []) {
    let student = findById(data.students, item.id);
    if (!student && item.leadId) {
      const created = ensureLeadAndStudent({ name: item.name, leadId: item.leadId, studentId: item.id, coach: target.coach, source: '飞书排课表' }, data, updates, now);
      student = created.student;
    }
    if (!student) {
      skipped.push({ action: 'createDirectSchedule', label: target.studentName, reason: `学员不存在：${item.name}`, studentId: item.id });
      return;
    }
    scheduleStudents.push(student);
  }
  const existing = findById(data.schedule, target.id) || data.schedule.find(row =>
    active(row) &&
    text(row.startTime).slice(0, 16) === target.startTime &&
    text(row.endTime).slice(0, 16) === target.endTime &&
    normalizeNameKey(row.coach || row.coachName) === normalizeNameKey(target.coach) &&
    text(row.venue) === target.venue &&
    target.studentIds.every(id => parseArray(row.studentIds).map(String).includes(String(id)))
  );
  const schedule = existing || trace({
    id: target.id,
    startTime: target.startTime,
    endTime: target.endTime,
    studentIds: target.studentIds,
    expectedStudentIds: target.studentIds,
    absentStudentIds: [],
    studentName: target.studentName,
    actualStudentCount: target.studentIds.length,
    courseType: target.courseType,
    standardCourseType: target.standardCourseType,
    courseDisplayName: target.courseDisplayName,
    courseTypeLevel2: target.courseTypeLevel2,
    skillLevelMin: target.skillLevelMin,
    skillLevelMax: target.skillLevelMax,
    specialTopic: target.specialTopic,
    experienceType: '',
    isTrial: false,
    coach: target.coach,
    coachId: '',
    campus: 'shunyi_mapo',
    venue: target.venue,
    lessonCount: target.lessonCount,
    status: '已排课',
    settlementType: 'direct',
    payMethod: target.payMethod,
    paidAmount: target.paidAmount,
    scheduleSource: 'feishu-sheet',
    notes: `${target.notes}；飞书排课表同步 ${target.sheetTitle} ${target.sourceCell}`
  }, now, target.notes);
  if (!existing) appendUnique(updates.schedule, { before: null, after: schedule });
  const existingSync = data.sync.find(row => text(row.sourceKey) === text(target.sourceKey));
  appendUnique(updates.sync, { before: existingSync || null, after: trace({ ...(existingSync || syncRowFor(target, schedule.id)), ...syncRowFor(target, schedule.id) }, now, '绑定 Jerry/Jerry 老婆/艾斯 飞书同步关系') });
  addConflictIndex(updates, data, schedule, now);
}

function planYangZitianNotes(data, updates, now) {
  const owner = findStudentByName(data.students, '宝红');
  for (const id of YANG_ZITIAN_SCHEDULE_IDS) {
    const before = findById(data.schedule, id);
    if (!before || !active(before)) continue;
    const note = '杨梓天使用宝红课包';
    const notes = text(before.notes).includes(note) ? text(before.notes) : [note, before.notes].map(text).filter(Boolean).join('；');
    const after = trace({
      ...before,
      studentName: '杨梓天',
      packageOwnerStudentId: owner?.id || before.packageOwnerStudentId || '',
      packageOwnerStudentName: owner?.name || before.packageOwnerStudentName || '宝红',
      usedByStudentId: owner?.id || before.usedByStudentId || '',
      usedByStudentName: '杨梓天',
      notes
    }, now, '用户确认：杨梓天所有排课扣宝红课包');
    appendUnique(updates.schedule, { before, after });
    data.entitlementLedger
      .filter(row => text(row.scheduleId) === text(id))
      .forEach(row => appendUnique(updates.entitlementLedger, {
        before: row,
        after: trace({
          ...row,
          packageOwnerStudentId: owner?.id || row.packageOwnerStudentId || '',
          packageOwnerStudentName: owner?.name || row.packageOwnerStudentName || '宝红',
          usedByStudentId: owner?.id || row.usedByStudentId || '',
          usedByStudentName: '杨梓天',
          reason: text(row.reason).includes(note) ? row.reason : `${text(row.reason) || '排课消课'}（${note}）`
        }, now, '用户确认：杨梓天核销流水备注为扣宝红课包')
      }));
    addConflictIndex(updates, data, after, now);
  }
}

function planSupersedeTasks(data, updates, now) {
  data.tasks
    .filter(row => text(row.status) === 'pending' && SUPERSEDE_TASK_SOURCE_KEYS.has(text(row.sourceKey)))
    .forEach(row => appendUnique(updates.tasks, {
      before: row,
      after: trace({ ...row, status: 'superseded', supersededAt: now, supersededReason: '用户已在 2026-08-18 硬对账中确认处理' }, now, '关闭已确认的飞书待确认任务')
    }));
  data.sync
    .filter(row => text(row.status) === 'pending_delete' && /^orphan-feishu-schedule\|/.test(text(row.sourceKey)) && YANG_ZITIAN_SCHEDULE_IDS.includes(text(row.scheduleId)))
    .forEach(row => appendUnique(updates.sync, {
      before: row,
      after: trace({ ...row, status: 'superseded', supersededAt: now, supersededReason: '飞书原行存在，取消错误孤儿删除判断' }, now, '修正杨梓天错误 pending_delete')
    }));
}

function addConflictIndex(updates, data, schedule, now) {
  const oldRows = data.conflictIndex.filter(row => text(row.scheduleId) === text(schedule.id));
  for (const row of oldRows) {
    if (text(row.id) !== SCHEDULE_CONFLICT_INDEX_READY_ID) appendUnique(updates.conflictIndex, { before: row, after: null });
  }
  for (const row of scheduleConflictIndexRowsForRecord(schedule)) {
    appendUnique(updates.conflictIndex, { before: oldRows.find(item => text(item.id) === text(row.id)) || null, after: trace(row, now, '重建排课冲突索引') });
  }
}

function buildPlan(data, now) {
  const updates = {
    students: [],
    leads: [],
    purchases: [],
    entitlements: [],
    entitlementLedger: [],
    schedule: [],
    sync: [],
    tasks: [],
    activeIndex: [],
    conflictIndex: []
  };
  const skipped = [];
  FORMAL_SCHEDULES.forEach(target => planFormalSchedule(target, data, updates, skipped, now));
  ADDITIONAL_CONFIRMED_FORMAL_SCHEDULES.forEach(target => planFormalSchedule(target, data, updates, skipped, now));
  CONFIRMED_TRIAL_SCHEDULES.forEach(target => planTrialSchedule(target, data, updates, skipped, now));
  CONFIRMED_DIRECT_SCHEDULES.forEach(target => planDirectSchedule(target, data, updates, skipped, now));
  planKkTrial(data, updates, skipped, now);
  planMuziBorrowedCourt(data, updates, skipped, now);
  planYangZitianNotes(data, updates, now);
  planSupersedeTasks(data, updates, now);

  const touchedStudentIds = new Set(updates.entitlements.flatMap(item => [item.before?.studentId, item.after?.studentId]).map(text).filter(Boolean));
  for (const studentId of touchedStudentIds) {
    const latestEntitlements = data.entitlements.map(row => updates.entitlements.find(item => text(item.after?.id) === text(row.id))?.after || row);
    const before = data.activeIndex.find(row => text(row.id || row.studentId) === studentId) || null;
    appendUnique(updates.activeIndex, { before, after: trace(activeIndexRow(latestEntitlements, studentId), now, '更新活跃课包索引') });
  }
  return { updates, skipped };
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

async function loadData(client) {
  const [students, leads, packages, purchases, entitlements, entitlementLedger, schedule, sync, tasks, activeIndex, conflictIndex] = await Promise.all([
    scanTable(client, TABLES.students),
    scanTable(client, TABLES.leads).catch(() => []),
    scanTable(client, TABLES.packages),
    scanTable(client, TABLES.purchases),
    scanTable(client, TABLES.entitlements),
    scanTable(client, TABLES.entitlementLedger).catch(() => []),
    scanTable(client, TABLES.schedule),
    scanTable(client, TABLES.sync).catch(() => []),
    scanTable(client, TABLES.tasks).catch(() => []),
    scanTable(client, TABLES.activeIndex).catch(() => []),
    scanTable(client, TABLES.conflictIndex).catch(() => [])
  ]);
  return { students, leads, packages, purchases, entitlements, entitlementLedger, schedule, sync, tasks, activeIndex, conflictIndex };
}

async function writePlan(client, plan, now) {
  await retry('create conflict index table', () => createTableIfMissing(client, TABLES.conflictIndex));
  for (const table of ['leads', 'students', 'purchases', 'entitlements', 'entitlementLedger', 'schedule', 'sync', 'tasks', 'activeIndex']) {
    for (const item of plan.updates[table] || []) {
      if (item.after) await retry(`put ${table} ${item.after.id}`, () => putRow(client, TABLES[table], item.after));
    }
  }
  for (const item of plan.updates.conflictIndex || []) {
    if (item.after) await retry(`put conflictIndex ${item.after.id}`, () => putRow(client, TABLES.conflictIndex, item.after));
    else if (item.before?.id) await retry(`delete conflictIndex ${item.before.id}`, () => deleteRow(client, TABLES.conflictIndex, item.before.id));
  }
  await retry('mark conflict index ready', () => putRow(client, TABLES.conflictIndex, {
    id: SCHEDULE_CONFLICT_INDEX_READY_ID,
    ready: true,
    updatedAt: now,
    operationId: OPERATION_ID
  }));
}

function publicReport(plan, args, target, reportPath, now) {
  return {
    ok: true,
    mode: args.write ? 'write' : 'dry-run',
    target,
    reportPath,
    operationId: OPERATION_ID,
    batchId: BATCH_ID,
    generatedAt: now,
    summary: Object.fromEntries(Object.entries(plan.updates).map(([key, rows]) => [key, rows.length])),
    skipped: plan.skipped,
    schedules: plan.updates.schedule.map(item => ({
      id: item.after?.id || item.before?.id,
      startTime: item.after?.startTime || item.before?.startTime,
      endTime: item.after?.endTime || item.before?.endTime,
      coach: item.after?.coach || item.before?.coach,
      studentName: item.after?.studentName || item.before?.studentName,
      venue: item.after?.venue || item.before?.venue,
      beforeNotes: item.before?.notes || '',
      afterNotes: item.after?.notes || ''
    })),
    entitlementLedger: plan.updates.entitlementLedger.map(item => ({
      id: item.after?.id || item.before?.id,
      scheduleId: item.after?.scheduleId || item.before?.scheduleId,
      entitlementId: item.after?.entitlementId || item.before?.entitlementId,
      lessonDelta: item.after?.lessonDelta ?? item.before?.lessonDelta,
      reason: item.after?.reason || item.before?.reason
    })),
    planned: Object.fromEntries(Object.entries(plan.updates).map(([key, rows]) => [key, rows.map(item => item.after).filter(Boolean)])),
    backups: Object.fromEntries(Object.entries(plan.updates).map(([key, rows]) => [key, rows.map(item => item.before).filter(Boolean)]))
  };
}

async function run(argv = process.argv.slice(2)) {
  loadRuntimeEnv({ override: true });
  const args = parseWriteFlags(argv);
  const reportPath = path.join(REPORT_DIR, `${OPERATION_ID}-${args.write ? 'write' : 'dry-run'}.json`);
  assertProductionWriteTrace({ operationId: OPERATION_ID, batchId: BATCH_ID, reportPath });
  const target = await assertProductionWriteTarget();
  const client = createClientFromEnv();
  const now = new Date().toISOString();
  const data = await loadData(client);
  const plan = buildPlan(data, now);
  const report = publicReport(plan, args, target, reportPath, now);
  fs.mkdirSync(REPORT_DIR, { recursive: true });
  fs.writeFileSync(reportPath, `${JSON.stringify(report, null, 2)}\n`, 'utf8');
  console.log(JSON.stringify({
    ok: true,
    mode: report.mode,
    reportPath,
    summary: report.summary,
    skipped: report.skipped.length
  }, null, 2));
  if (plan.skipped.length) throw new Error('存在跳过项，停止写入');
  if (args.write) await writePlan(client, plan, now);
  return { plan, report };
}

if (require.main === module) {
  run().catch(error => {
    console.error(error?.stack || String(error));
    process.exit(1);
  });
}

module.exports = { buildPlan, run };
