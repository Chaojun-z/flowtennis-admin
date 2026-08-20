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
  staleScheduleConflictIndexRows,
  SCHEDULE_CONFLICT_INDEX_READY_ID
} = require('../server/schedule-conflict-index');

const ROOT = path.join(__dirname, '..');
const OPERATION_ID = 'repair-feishu-remaining-14-20260820';
const BATCH_ID = `batch-${OPERATION_ID}`;
const REPORT_DIR = path.join(ROOT, 'offline-reports');

const TABLES = {
  leads: 'ft_leads',
  students: 'ft_students',
  packages: 'ft_packages',
  purchases: 'ft_purchases',
  entitlements: 'ft_entitlements',
  entitlementLedger: 'ft_entitlement_ledger',
  schedule: 'ft_schedule',
  sync: 'ft_feishu_schedule_sync',
  conflictIndex: 'ft_schedule_conflict_index',
  activeIndex: 'ft_student_active_entitlement_index'
};

const PRIVATE_TRIALS = [
  ['R7Henb|2026-04-24|20:30|21:30|小宋|11|成人私教【体验】|马坡室内|2号', '2026-04-24', '20:30', '21:30', '2号场', '宋教练', '11'],
  ['wSvaRO|2026-05-03|11:00|12:00|小宋|陈玲|成人私教【体验】|马坡室内|2号', '2026-05-03', '11:00', '12:00', '2号场', '宋教练', '陈玲'],
  ['wSvaRO|2026-05-03|17:00|18:00|小宋|judy|成人私教【体验】|马坡室内|4号', '2026-05-03', '17:00', '18:00', '4号场', '宋教练', 'Judy'],
  ['32QK6G|2026-05-10|14:00|15:00|rive|mo_mo大魔王|成人私教【体验】|马坡室内|3号', '2026-05-10', '14:00', '15:00', '3号场', 'Rive 天昊教练', 'Mo_mo大魔王'],
  ['l22wR0|2026-05-13|15:00|16:00|朝珺|joanna|成人私教【体验】|马坡室内|2号', '2026-05-13', '15:00', '16:00', '2号场', '朝珺教练', 'Joanna'],
  ['l22wR0|2026-05-13|16:00|17:00|朝珺|孙女士|成人私教【体验】|马坡室内|2号', '2026-05-13', '16:00', '17:00', '2号场', '朝珺教练', '孙女士'],
  ['l22wR0|2026-05-14|14:00|15:00|小舟|yunyun|成人私教【体验】|马坡室内|3号', '2026-05-14', '14:00', '15:00', '3号场', '岳克舟教练', 'Yun Yun'],
  ['YCKDn9|2026-06-25|18:30|19:30|刘润扬|陈女士|成人私教【体验】|马坡室内|3号', '2026-06-25', '18:30', '19:30', '3号场', '刘润扬教练', '陈女士']
].map(([sourceKey, date, start, end, venue, coach, name]) => ({ sourceKey, date, start, end, venue, coach, name }));

const SPECIAL_DIRECT = [
  ['xhFjSx|2026-04-11|10:00|11:00|rive|四人|【25-30】发接发与实战练习|马坡室内|1号', '2026-04-11', '10:00', '11:00', '1号场', 'Rive 天昊教练', 4, 1040],
  ['u1MuGV|2026-04-19|10:00|12:00|rive|4人|【25-30】发接发与实战练习|马坡室内|1号', '2026-04-19', '10:00', '12:00', '1号场', 'Rive 天昊教练', 4, 1040],
  ['32QK6G|2026-05-10|11:00|12:00|siren|2人|【25-30】发接发与实战练习|马坡室内|3号', '2026-05-10', '11:00', '12:00', '3号场', 'Siren 教练', 2, 520]
].map(([sourceKey, date, start, end, venue, coach, count, amount]) => ({ sourceKey, date, start, end, venue, coach, count, amount }));

const YOUTH_GROUP = {
  sourceKey: 'AkAIal|2026-05-23|14:00|16:00|siren|桃子、蜜桃、笑逐+航航体验课|青少年团课|马坡室内|3号',
  date: '2026-05-23',
  start: '14:00',
  end: '16:00',
  venue: '3号场',
  coach: 'Siren 教练',
  names: ['桃子', '蜜桃', '笑逐', '航航']
};

const AI_MS = {
  sourceKey: 'lIqkEZ|2026-07-08|15:00|16:00|朝珺|艾女士|成人私教【正式】|马坡室内|2号',
  scheduleId: 'fdf7eed6-cf03-4e20-bdbe-0a995fed9244',
  date: '2026-07-08',
  start: '15:00',
  end: '16:00',
  venue: '2号场',
  coach: '朝珺教练'
};

const XIXI = {
  sourceKey: 'lIqkEZ|2026-07-10|13:00|14:00|岳克舟|曦曦、朋友|成人私教【体验】|马坡室内|1号',
  date: '2026-07-10',
  start: '13:00',
  end: '14:00',
  venue: '1号场',
  coach: '岳克舟教练',
  studentId: '2b65be17-4190-4b2f-9dfe-5988d4652cc6',
  studentName: '曦曦🐳',
  entitlementId: '9cb986a8-35f5-4724-bd57-908084f838e1'
};

function text(value) {
  return String(value ?? '').trim();
}

function num(value, fallback = 0) {
  const n = Number(value);
  return Number.isFinite(n) ? n : fallback;
}

function hash(value, len = 24) {
  return crypto.createHash('sha256').update(String(value)).digest('hex').slice(0, len);
}

function nameKey(value) {
  return text(value).toLowerCase().replace(/[.·\s]/g, '').replace(/[（(][^）)]*[）)]/g, '');
}

function parseArr(value) {
  if (Array.isArray(value)) return value;
  if (typeof value === 'string' && value) {
    try {
      const parsed = JSON.parse(value);
      return Array.isArray(parsed) ? parsed : [];
    } catch {
      return value.split(/[、,，/]+/).map(text).filter(Boolean);
    }
  }
  return [];
}

function startTime(item) {
  return `${item.date} ${item.start}`;
}

function endTime(item) {
  return `${item.date} ${item.end}`;
}

function lessonCount(item) {
  const [sh, sm] = item.start.split(':').map(Number);
  const [eh, em] = item.end.split(':').map(Number);
  return Math.max(1, ((eh * 60 + em) - (sh * 60 + sm)) / 60);
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

function stableId(prefix, value) {
  return `${prefix}-${hash(value)}`;
}

function scheduleId(sourceKey) {
  return `feishu-schedule-${hash(sourceKey)}`;
}

function syncId(sourceKey) {
  return `feishu-sync-${hash(sourceKey)}`;
}

function ledgerId(sourceKey, entitlementId, id) {
  return `feishu-ledger-${hash([sourceKey, entitlementId, id].join('|'))}`;
}

function activeSchedule(row = {}) {
  return text(row.status || '已排课') !== '已取消';
}

function comparable(row = {}) {
  const ignored = new Set(['createdAt', 'updatedAt', 'lastSyncedAt', 'operationAt', 'operationId', 'operationType', 'operationBy', 'batchId']);
  return Object.fromEntries(Object.entries(row || {}).filter(([key]) => !ignored.has(key)).sort(([a], [b]) => a.localeCompare(b)));
}

function changed(before, after) {
  if (!before) return true;
  return JSON.stringify(comparable(before)) !== JSON.stringify(comparable(after));
}

function addChange(changes, key, before, after, reason) {
  const id = text((after || before || {}).id);
  if (!id) return;
  const op = after ? 'put' : 'delete';
  const seenKey = `${key}|${id}|${op}`;
  if (changes._seen.has(seenKey)) return;
  changes._seen.add(seenKey);
  changes[key].push({ before: before || null, after: after || null, reason });
}

function plannedRows(dataRows = [], changes = []) {
  const map = new Map((dataRows || []).map(row => [text(row.id), row]));
  for (const item of changes || []) {
    const id = text((item.after || item.before || {}).id);
    if (!id) continue;
    if (item.after) map.set(id, item.after);
    else map.delete(id);
  }
  return [...map.values()];
}

function aliases(row = {}) {
  return [row.name, row.studentName, row.displayName, row.wechatName, row.leadName, row.nickname, row.nickName, row.alias, ...parseArr(row.aliases), ...parseArr(row.aliasNames)].map(nameKey).filter(Boolean);
}

function findOneByName(rows, name) {
  const key = nameKey(name);
  const hits = (rows || []).filter(row => aliases(row).includes(key));
  const unique = [...new Map(hits.map(row => [text(row.id), row])).values()];
  return unique.length === 1 ? unique[0] : null;
}

function findTrialPackage(packages, audience, smallClass = false) {
  return (packages || []).find(row => {
    if (text(row.status || 'active') !== 'active') return false;
    const haystack = [row.name, row.packageName, row.productName, row.courseType, row.experienceType, row.courseTypeLevel2, row.type, row.audience].map(text).join(' ');
    if (!/体验/.test(haystack)) return false;
    if (smallClass && !/小班/.test(haystack)) return false;
    if (!smallClass && /小班/.test(haystack)) return false;
    return text(row.audience || row.type) === audience;
  }) || null;
}

function ensureLeadStudent(data, changes, { name, type, coach, date, now, blockers }) {
  const currentStudents = plannedRows(data.students, changes.students);
  const currentLeads = plannedRows(data.leads, changes.leads);
  let student = findOneByName(currentStudents, name);
  let lead = student?.sourceLeadId
    ? currentLeads.find(row => text(row.id) === text(student.sourceLeadId)) || null
    : findOneByName(currentLeads, name);

  if (!lead) {
    lead = {
      id: stableId('feishu-repair-lead-20260820', name),
      name,
      displayName: name,
      wechatName: name,
      phone: '',
      source: '飞书排课表历史修复',
      campus: 'shunyi_mapo',
      customerType: type,
      demandProduct: type === '青少年' ? '青少年小班体验课' : '私教体验课',
      consultType: type === '青少年' ? '青少年小班体验课' : '私教体验课',
      rawStatus: '已体验待成交',
      systemStatus: '已体验待成交',
      leadStage: '已体验待成交',
      status: 'active',
      dealType: '课程',
      conversionType: '课程',
      convertedProducts: [type === '青少年' ? '青少年小班体验课' : '私教体验课'],
      trialAtRaw: `${date} 00:00`,
      createdAt: now
    };
  }

  if (!student) {
    student = {
      id: stableId('feishu-repair-student-20260820', name),
      name,
      studentName: name,
      displayName: name,
      phone: '',
      campus: 'shunyi_mapo',
      type,
      primaryCoach: coach,
      source: '飞书排课表历史修复',
      sourceLeadId: lead.id,
      status: 'active',
      notes: '飞书历史排课修复补建学员档案',
      createdAt: now
    };
  }

  const nextLead = trace({
    ...lead,
    name: lead.name || name,
    displayName: lead.displayName || name,
    wechatName: lead.wechatName || name,
    campus: lead.campus || 'shunyi_mapo',
    customerType: lead.customerType || type,
    studentId: student.id,
    status: lead.status || 'active'
  }, now, `补齐${name}线索与学员关系`);
  const nextStudent = trace({
    ...student,
    name: student.name || name,
    studentName: student.studentName || name,
    displayName: student.displayName || name,
    campus: student.campus || 'shunyi_mapo',
    type: student.type || type,
    primaryCoach: student.primaryCoach || coach,
    sourceLeadId: nextLead.id,
    status: student.status || 'active'
  }, now, `补齐${name}学员档案`);

  const leadBefore = data.leads.find(row => text(row.id) === text(nextLead.id)) || null;
  const studentBefore = data.students.find(row => text(row.id) === text(nextStudent.id)) || null;
  if (changed(leadBefore, nextLead)) addChange(changes, 'leads', leadBefore, nextLead, '补线索/绑定学员');
  if (changed(studentBefore, nextStudent)) addChange(changes, 'students', studentBefore, nextStudent, '补学员档案');
  if (!nextStudent.id) blockers.push({ name, reason: '无法生成学员ID' });
  return nextStudent;
}

function buildPurchaseEntitlement(data, changes, { sourceKey, student, pkg, amount, date, now, blockers }) {
  if (!pkg?.id) {
    blockers.push({ sourceKey, studentName: student.name, reason: '体验课商品缺失' });
    return null;
  }
  const key = ['feishu-remaining-14-trial', sourceKey, student.id, pkg.id].join('|');
  const purchaseId = stableId('feishu-trial-purchase', key);
  const entitlementId = stableId('feishu-trial-entitlement', key);
  const purchaseBefore = data.purchases.find(row => text(row.id) === purchaseId) || null;
  const entitlementBefore = data.entitlements.find(row => text(row.id) === entitlementId) || null;
  const purchase = trace({
    ...(purchaseBefore || {}),
    id: purchaseId,
    studentId: student.id,
    studentName: student.name || student.studentName,
    packageId: pkg.id,
    packageName: pkg.name || pkg.packageName || '体验课包',
    productName: pkg.productName || pkg.name || '体验课',
    courseType: '体验课',
    experienceType: pkg.experienceType || '',
    packageLessons: 1,
    totalLessons: 1,
    packagePrice: amount,
    amountPaid: amount,
    finalAmount: amount,
    systemAmount: amount,
    purchaseDate: date,
    payMethod: '大众点评券码',
    operator: '飞书同步',
    status: 'active',
    businessKey: key,
    sourceBusinessKey: key,
    sourceType: 'feishu-schedule-sync',
    sourceKey,
    createdAt: purchaseBefore?.createdAt || now
  }, now, '补体验课购买');
  const entitlement = trace({
    ...(entitlementBefore || {}),
    id: entitlementId,
    studentId: student.id,
    studentName: student.name || student.studentName,
    purchaseId,
    packageId: pkg.id,
    packageName: pkg.name || pkg.packageName || '体验课包',
    productName: pkg.productName || pkg.name || '体验课',
    courseType: '体验课',
    experienceType: pkg.experienceType || '',
    totalLessons: 1,
    usedLessons: 0,
    remainingLessons: 1,
    status: 'active',
    purchaseDate: date,
    validFrom: date,
    sourceBusinessKey: key,
    sourceType: 'feishu-schedule-sync',
    sourceKey,
    createdAt: entitlementBefore?.createdAt || now
  }, now, '补体验课权益');
  if (changed(purchaseBefore, purchase)) addChange(changes, 'purchases', purchaseBefore, purchase, '补体验课购买');
  if (changed(entitlementBefore, entitlement)) addChange(changes, 'entitlements', entitlementBefore, entitlement, '补体验课权益');
  return { purchase, entitlement };
}

function planConflictIndex(data, changes, before, after, now) {
  const currentRows = plannedRows(data.conflictIndex, changes.conflictIndex);
  staleScheduleConflictIndexRows(before, after).forEach(row => {
    const existing = currentRows.find(item => text(item.id) === text(row.id));
    if (existing) addChange(changes, 'conflictIndex', existing, null, '删除旧冲突索引');
  });
  scheduleConflictIndexRowsForRecord(after).forEach(row => {
    const beforeRow = currentRows.find(item => text(item.id) === text(row.id)) || null;
    const next = trace(row, now, '重建排课冲突索引');
    if (changed(beforeRow, next)) addChange(changes, 'conflictIndex', beforeRow, next, '写冲突索引');
  });
}

function buildSync(data, changes, sourceKey, schedule, now) {
  const before = data.sync.find(row => text(row.id) === syncId(sourceKey)) || data.sync.find(row => text(row.sourceKey) === sourceKey) || null;
  const row = trace({
    ...(before || {}),
    id: before?.id || syncId(sourceKey),
    source: 'feishu-sheet',
    sourceKey,
    scheduleId: schedule.id,
    startTime: schedule.startTime,
    endTime: schedule.endTime,
    status: 'active',
    createdAt: before?.createdAt || now,
    lastSyncedAt: now
  }, now, '补飞书同步关系');
  if (changed(before, row)) addChange(changes, 'sync', before, row, '补飞书同步关系');
}

function consume(data, changes, { sourceKey, schedule, entitlement, student, count = 1, now, reason, blockers }) {
  const latestEntitlements = plannedRows(data.entitlements, changes.entitlements);
  const current = latestEntitlements.find(row => text(row.id) === text(entitlement.id));
  if (!current) {
    blockers.push({ sourceKey, scheduleId: schedule.id, entitlementId: entitlement.id, reason: '课包不存在' });
    return;
  }
  const ledgerBefore = data.entitlementLedger.find(row => text(row.scheduleId) === text(schedule.id) && text(row.entitlementId) === text(current.id) && num(row.lessonDelta) < 0) ||
    data.entitlementLedger.find(row => text(row.id) === ledgerId(sourceKey, current.id, schedule.id)) ||
    null;
  if (ledgerBefore) {
    const existingLedger = trace({
      ...ledgerBefore,
      studentId: student.id,
      studentName: student.name || student.studentName,
      purchaseId: current.purchaseId || ledgerBefore.purchaseId || '',
      packageName: current.packageName || ledgerBefore.packageName || '',
      lessonDelta: -count,
      action: 'consume',
      relatedDate: schedule.startTime.slice(0, 10),
      sourceDate: schedule.startTime.slice(0, 10),
      sourceTimeBand: `${schedule.startTime.slice(11, 16)}-${schedule.endTime.slice(11, 16)}`,
      venue: schedule.venue,
      sourceVenue: schedule.venue,
      coach: schedule.coach,
      scheduleTime: schedule.startTime
    }, now, reason);
    if (changed(ledgerBefore, existingLedger)) addChange(changes, 'entitlementLedger', ledgerBefore, existingLedger, '校正已存在消课流水');
    return;
  }
  if (num(current.remainingLessons) < count) {
    blockers.push({ sourceKey, scheduleId: schedule.id, entitlementId: entitlement.id, reason: `课包剩余不足：需要 ${count}，当前 ${num(current.remainingLessons)}` });
    return;
  }
  const ledger = trace({
    ...(ledgerBefore || {}),
    id: ledgerBefore?.id || ledgerId(sourceKey, current.id, schedule.id),
    entitlementId: current.id,
    studentId: student.id,
    studentName: student.name || student.studentName,
    purchaseId: current.purchaseId || '',
    packageName: current.packageName || '',
    scheduleId: schedule.id,
    lessonDelta: -count,
    action: 'consume',
    reason,
    operator: 'Codex',
    relatedDate: schedule.startTime.slice(0, 10),
    sourceDate: schedule.startTime.slice(0, 10),
    sourceTimeBand: `${schedule.startTime.slice(11, 16)}-${schedule.endTime.slice(11, 16)}`,
    venue: schedule.venue,
    sourceVenue: schedule.venue,
    coach: schedule.coach,
    scheduleTime: schedule.startTime,
    createdAt: ledgerBefore?.createdAt || now
  }, now, reason);
  if (changed(ledgerBefore, ledger)) addChange(changes, 'entitlementLedger', ledgerBefore, ledger, '补消课流水');

  const next = trace({
    ...current,
    usedLessons: num(current.usedLessons) + count,
    remainingLessons: Math.max(0, num(current.remainingLessons) - count),
    status: Math.max(0, num(current.remainingLessons) - count) <= 0 ? 'depleted' : (current.status || 'active')
  }, now, '按补课流水更新课包余额');
  if (changed(current, next)) addChange(changes, 'entitlements', current, next, '更新课包余额');
}

function activeIndexRow(entitlements, studentId, now) {
  return trace({
    id: studentId,
    studentId,
    entitlementIds: (entitlements || [])
      .filter(row => text(row.studentId) === text(studentId))
      .filter(row => text(row.status || 'active') === 'active' && num(row.remainingLessons) > 0)
      .map(row => row.id)
      .filter(Boolean)
  }, now, '重建学员可用课包索引');
}

function planSchedule(data, changes, item, schedule, now, reason) {
  const before = data.schedule.find(row => text(row.id) === text(schedule.id)) || null;
  const conflicts = findScheduleConflicts(data, changes, schedule);
  if (conflicts.length) return { ok: false, conflicts };
  const next = trace(schedule, now, reason);
  if (changed(before, next)) addChange(changes, 'schedule', before, next, reason);
  planConflictIndex(data, changes, before, next, now);
  buildSync(data, changes, item.sourceKey, next, now);
  return { ok: true, schedule: next };
}

function findScheduleConflicts(data, changes, schedule) {
  return plannedRows(data.schedule, changes.schedule).filter(row =>
    text(row.id) !== text(schedule.id) &&
    activeSchedule(row) &&
    text(row.venue) === text(schedule.venue) &&
    text(row.startTime).slice(0, 16) < text(schedule.endTime).slice(0, 16) &&
    text(row.endTime).slice(0, 16) > text(schedule.startTime).slice(0, 16)
  );
}

function findEquivalentSchedule(data, changes, item, student) {
  const studentId = text(student?.id);
  const name = nameKey(student?.name || student?.studentName);
  return plannedRows(data.schedule, changes.schedule).find(row =>
    activeSchedule(row) &&
    text(row.startTime).slice(0, 16) === startTime(item) &&
    text(row.endTime).slice(0, 16) === endTime(item) &&
    text(row.venue) === text(item.venue) &&
    (parseArr(row.studentIds).includes(studentId) || nameKey(row.studentName) === name)
  ) || null;
}

function baseSchedule(item, id, patch = {}) {
  return {
    id,
    startTime: startTime(item),
    endTime: endTime(item),
    campus: 'shunyi_mapo',
    venue: item.venue,
    coach: item.coach,
    lessonCount: lessonCount(item),
    status: '已排课',
    notifyStatus: '未通知',
    confirmStatus: '待确认',
    scheduleSource: 'feishu-sheet',
    createdBy: 'Codex',
    ...patch
  };
}

function buildPlan({ data, now }) {
  const changes = {
    leads: [],
    students: [],
    purchases: [],
    entitlements: [],
    entitlementLedger: [],
    schedule: [],
    sync: [],
    conflictIndex: [],
    activeIndex: [],
    _seen: new Set()
  };
  const blockers = [];
  const applied = [];
  const touchedStudents = new Set();

  const adultTrialPkg = findTrialPackage(data.packages, '成人', false);
  const youthSmallTrialPkg = findTrialPackage(data.packages, '青少年', true);

  for (const item of SPECIAL_DIRECT) {
    const id = scheduleId(item.sourceKey);
    const schedule = baseSchedule(item, id, {
      studentIds: [],
      expectedStudentIds: [],
      absentStudentIds: [],
      studentName: `匿名专项${item.count}人`,
      courseType: '专项课',
      standardCourseType: '专项课',
      courseDisplayName: '【2.5-3.0】发接发与实战练习',
      courseTypeLevel2: '',
      specialTopic: '发接发与实战练习',
      skillLevelMin: 2.5,
      skillLevelMax: 3,
      settlementType: 'direct',
      payMethod: '微信',
      paidAmount: item.amount,
      actualStudentCount: item.count,
      notes: `用户确认：匿名专项课${item.count}人，每人260元，不追溯具体学员，不生成课包消耗`
    });
    const result = planSchedule(data, changes, item, schedule, now, '补匿名专项课排课和直接收款');
    if (!result.ok) blockers.push({ sourceKey: item.sourceKey, reason: '场地时间冲突', conflicts: result.conflicts.map(row => row.id) });
    else applied.push({ sourceKey: item.sourceKey, type: 'anonymous_special_direct', scheduleId: id, amount: item.amount, count: item.count });
  }

  for (const item of PRIVATE_TRIALS) {
    const student = ensureLeadStudent(data, changes, { name: item.name, type: '成人', coach: item.coach, date: item.date, now, blockers });
    const existingSchedule = findEquivalentSchedule(data, changes, item, student);
    if (existingSchedule) {
      const next = baseSchedule(item, existingSchedule.id, {
        ...existingSchedule,
        studentIds: parseArr(existingSchedule.studentIds).length ? parseArr(existingSchedule.studentIds) : [student.id],
        expectedStudentIds: parseArr(existingSchedule.expectedStudentIds).length ? parseArr(existingSchedule.expectedStudentIds) : [student.id],
        studentName: existingSchedule.studentName || student.name || student.studentName,
        courseType: existingSchedule.courseType || '体验课',
        standardCourseType: existingSchedule.standardCourseType || '成人私教【体验】',
        courseDisplayName: existingSchedule.courseDisplayName || '成人私教【体验】',
        courseTypeLevel2: existingSchedule.courseTypeLevel2 || '成人体验课',
        experienceType: existingSchedule.experienceType || '成人',
        isTrial: true,
        settlementType: existingSchedule.settlementType || 'package',
        sourceLeadId: existingSchedule.sourceLeadId || student.sourceLeadId || '',
        sourceLeadName: existingSchedule.sourceLeadName || student.name || student.studentName,
        notes: existingSchedule.notes || '用户确认：成人私教体验课，绑定飞书历史排课关系'
      });
      const scheduleBefore = data.schedule.find(row => text(row.id) === text(existingSchedule.id)) || null;
      const traced = trace(next, now, '绑定已有成人私教体验排课');
      if (changed(scheduleBefore, traced)) addChange(changes, 'schedule', scheduleBefore, traced, '绑定已有成人私教体验排课');
      planConflictIndex(data, changes, scheduleBefore, traced, now);
      buildSync(data, changes, item.sourceKey, traced, now);
      touchedStudents.add(student.id);
      applied.push({ sourceKey: item.sourceKey, type: 'private_trial_existing', scheduleId: traced.id, studentName: traced.studentName, amount: 0 });
      continue;
    }
    const draftSchedule = baseSchedule(item, scheduleId(item.sourceKey), {
      studentIds: [student.id],
      expectedStudentIds: [student.id],
      studentName: student.name || student.studentName
    });
    const conflicts = findScheduleConflicts(data, changes, draftSchedule);
    if (conflicts.length) {
      blockers.push({ sourceKey: item.sourceKey, studentName: draftSchedule.studentName, reason: '场地时间冲突', conflicts: conflicts.map(row => row.id) });
      continue;
    }
    const trial = buildPurchaseEntitlement(data, changes, { sourceKey: item.sourceKey, student, pkg: adultTrialPkg, amount: 239, date: item.date, now, blockers });
    if (!trial) continue;
    const id = scheduleId(item.sourceKey);
    const schedule = baseSchedule(item, id, {
      studentIds: [student.id],
      expectedStudentIds: [student.id],
      absentStudentIds: [],
      studentName: student.name || student.studentName,
      courseType: '体验课',
      standardCourseType: '成人私教【体验】',
      courseDisplayName: '成人私教【体验】',
      courseTypeLevel2: '成人体验课',
      experienceType: '成人',
      isTrial: true,
      settlementType: 'package',
      entitlementId: trial.entitlement.id,
      entitlementIds: [trial.entitlement.id],
      purchaseId: trial.purchase.id,
      packageId: adultTrialPkg.id,
      packageName: adultTrialPkg.name || adultTrialPkg.packageName,
      sourceLeadId: student.sourceLeadId || '',
      sourceLeadName: student.name || student.studentName,
      actualStudentCount: 1,
      notes: '用户确认：成人私教体验课，补线索/学员/排课/体验课包核销'
    });
    const result = planSchedule(data, changes, item, schedule, now, '补成人私教体验排课');
    if (!result.ok) {
      blockers.push({ sourceKey: item.sourceKey, studentName: schedule.studentName, reason: '场地时间冲突', conflicts: result.conflicts.map(row => row.id) });
      continue;
    }
    consume(data, changes, { sourceKey: item.sourceKey, schedule: result.schedule, entitlement: trial.entitlement, student, count: 1, now, reason: '飞书历史成人私教体验课核销', blockers });
    touchedStudents.add(student.id);
    applied.push({ sourceKey: item.sourceKey, type: 'private_trial', scheduleId: id, studentName: schedule.studentName, amount: 239 });
  }

  const youthStudents = YOUTH_GROUP.names.map(name => ensureLeadStudent(data, changes, { name, type: '青少年', coach: YOUTH_GROUP.coach, date: YOUTH_GROUP.date, now, blockers }));
  const youthTrialRows = youthStudents.map(student => buildPurchaseEntitlement(data, changes, {
    sourceKey: `${YOUTH_GROUP.sourceKey}|${student.id}`,
    student,
    pkg: youthSmallTrialPkg,
    amount: 99,
    date: YOUTH_GROUP.date,
    now,
    blockers
  })).filter(Boolean);
  if (youthTrialRows.length === youthStudents.length) {
    const id = scheduleId(YOUTH_GROUP.sourceKey);
    const schedule = baseSchedule(YOUTH_GROUP, id, {
      studentIds: youthStudents.map(row => row.id),
      expectedStudentIds: youthStudents.map(row => row.id),
      absentStudentIds: [],
      studentName: youthStudents.map(row => row.name || row.studentName).join('、'),
      courseType: '体验课',
      standardCourseType: '青少年小班体验课',
      courseDisplayName: '青少年团课体验课',
      courseTypeLevel2: '小班体验课',
      experienceType: '小班体验课',
      smallClassType: 'bootcamp',
      isTrial: true,
      settlementType: 'package',
      entitlementIds: youthTrialRows.map(row => row.entitlement.id),
      packageName: youthSmallTrialPkg.name || youthSmallTrialPkg.packageName,
      actualStudentCount: 4,
      notes: '用户确认：桃子、蜜桃、笑逐、航航四人上青少年团课体验课'
    });
    const result = planSchedule(data, changes, YOUTH_GROUP, schedule, now, '补青少年团课体验排课');
    if (!result.ok) blockers.push({ sourceKey: YOUTH_GROUP.sourceKey, reason: '场地时间冲突', conflicts: result.conflicts.map(row => row.id) });
    else {
      youthTrialRows.forEach((row, index) => {
        consume(data, changes, { sourceKey: `${YOUTH_GROUP.sourceKey}|${row.entitlement.id}`, schedule: result.schedule, entitlement: row.entitlement, student: youthStudents[index], count: 1, now, reason: '飞书历史青少年小班体验课核销', blockers });
        touchedStudents.add(youthStudents[index].id);
      });
      applied.push({ sourceKey: YOUTH_GROUP.sourceKey, type: 'youth_group_trial', scheduleId: id, studentName: schedule.studentName, amount: 396 });
    }
  }

  const aiScheduleBefore = data.schedule.find(row => text(row.id) === AI_MS.scheduleId);
  if (!aiScheduleBefore) {
    blockers.push({ sourceKey: AI_MS.sourceKey, reason: '艾女士待修正排课不存在' });
  } else {
    const aiSchedule = trace({
      ...aiScheduleBefore,
      startTime: startTime(AI_MS),
      endTime: endTime(AI_MS),
      venue: AI_MS.venue,
      coach: AI_MS.coach,
      scheduleSource: 'feishu-sheet',
      notes: text(aiScheduleBefore.notes) || '用户确认：系统 7/9 错放，修正为飞书 7/8 第7节'
    }, now, '艾女士第7节从7/9修正到7/8');
    const result = planSchedule(data, changes, AI_MS, aiSchedule, now, '修正艾女士第7节日期');
    if (!result.ok) blockers.push({ sourceKey: AI_MS.sourceKey, reason: '艾女士修正后场地时间冲突', conflicts: result.conflicts.map(row => row.id) });
    else {
      const ledgers = data.entitlementLedger.filter(row => text(row.scheduleId) === AI_MS.scheduleId && num(row.lessonDelta) < 0);
      ledgers.forEach(row => {
        const next = trace({
          ...row,
          relatedDate: AI_MS.date,
          sourceDate: AI_MS.date,
          sourceTimeBand: `${AI_MS.start}-${AI_MS.end}`,
          venue: AI_MS.venue,
          sourceVenue: AI_MS.venue,
          coach: AI_MS.coach,
          scheduleTime: startTime(AI_MS)
        }, now, '同步修正艾女士第7节消课流水日期');
        if (changed(row, next)) addChange(changes, 'entitlementLedger', row, next, '修正艾女士流水日期');
      });
      applied.push({ sourceKey: AI_MS.sourceKey, type: 'ai_ms_date_fix', scheduleId: AI_MS.scheduleId, from: aiScheduleBefore.startTime, to: startTime(AI_MS) });
    }
  }

  const xixiStudent = data.students.find(row => text(row.id) === XIXI.studentId);
  const xixiEntitlement = plannedRows(data.entitlements, changes.entitlements).find(row => text(row.id) === XIXI.entitlementId);
  if (!xixiStudent || !xixiEntitlement) {
    blockers.push({ sourceKey: XIXI.sourceKey, reason: '曦曦学员或课包不存在' });
  } else {
    const id = scheduleId(XIXI.sourceKey);
    const schedule = baseSchedule(XIXI, id, {
      studentIds: [XIXI.studentId],
      expectedStudentIds: [XIXI.studentId],
      absentStudentIds: [],
      studentName: XIXI.studentName,
      courseType: '私教课',
      standardCourseType: '成人私教【正式】',
      courseDisplayName: '成人1v2私教课',
      courseTypeLevel2: '成人私教课',
      settlementType: 'package',
      entitlementId: XIXI.entitlementId,
      entitlementIds: [XIXI.entitlementId],
      purchaseId: xixiEntitlement.purchaseId || '',
      packageId: xixiEntitlement.packageId || '',
      packageName: xixiEntitlement.packageName || '',
      maxStudents: 2,
      actualStudentCount: 2,
      notes: '用户确认：曦曦、朋友只排曦曦🐳本人，不给朋友建档，按曦曦历史1v2课包消课'
    });
    const result = planSchedule(data, changes, XIXI, schedule, now, '补曦曦1v2私教排课');
    if (!result.ok) blockers.push({ sourceKey: XIXI.sourceKey, reason: '曦曦排课场地时间冲突', conflicts: result.conflicts.map(row => row.id) });
    else {
      consume(data, changes, { sourceKey: XIXI.sourceKey, schedule: result.schedule, entitlement: xixiEntitlement, student: xixiStudent, count: 1, now, reason: '飞书历史曦曦1v2私教课核销', blockers });
      touchedStudents.add(XIXI.studentId);
      applied.push({ sourceKey: XIXI.sourceKey, type: 'xixi_package_schedule', scheduleId: id, studentName: XIXI.studentName });
    }
  }

  const latestEntitlements = plannedRows(data.entitlements, changes.entitlements);
  for (const studentId of touchedStudents) {
    const before = data.activeIndex.find(row => text(row.id || row.studentId) === text(studentId)) || null;
    const next = activeIndexRow(latestEntitlements, studentId, now);
    if (changed(before, next)) addChange(changes, 'activeIndex', before, next, '重建学员可用课包索引');
  }

  delete changes._seen;
  return { changes, blockers, applied };
}

async function loadData(client) {
  const [leads, students, packages, purchases, entitlements, entitlementLedger, schedule, sync, conflictIndex, activeIndex] = await Promise.all([
    scanTable(client, TABLES.leads).catch(() => []),
    scanTable(client, TABLES.students),
    scanTable(client, TABLES.packages),
    scanTable(client, TABLES.purchases),
    scanTable(client, TABLES.entitlements),
    scanTable(client, TABLES.entitlementLedger).catch(() => []),
    scanTable(client, TABLES.schedule),
    scanTable(client, TABLES.sync).catch(() => []),
    scanTable(client, TABLES.conflictIndex).catch(() => []),
    scanTable(client, TABLES.activeIndex).catch(() => [])
  ]);
  return { leads, students, packages, purchases, entitlements, entitlementLedger, schedule, sync, conflictIndex, activeIndex };
}

async function retry(label, fn, attempts = 3) {
  let lastError;
  for (let i = 1; i <= attempts; i += 1) {
    try {
      return await Promise.race([
        fn(),
        new Promise((_, reject) => setTimeout(() => reject(new Error(`${label} timeout`)), 15000))
      ]);
    } catch (error) {
      lastError = error;
      if (i === attempts) break;
      await new Promise(resolve => setTimeout(resolve, i * 800));
    }
  }
  throw new Error(`${label} failed: ${lastError?.message || lastError}`);
}

async function writePlan(client, plan) {
  for (const key of ['leads', 'students', 'purchases', 'entitlements', 'schedule', 'entitlementLedger', 'sync', 'activeIndex', 'conflictIndex']) {
    const rows = plan.changes[key] || [];
    if (rows.length) console.log(`[write] ${key}: ${rows.length}`);
    for (const item of plan.changes[key] || []) {
      if (item.after) await retry(`put ${key} ${item.after.id}`, () => putRow(client, TABLES[key], item.after));
      else if (item.before) await retry(`delete ${key} ${item.before.id}`, () => deleteRow(client, TABLES[key], item.before.id));
    }
  }
  await retry('mark conflict index ready', () => putRow(client, TABLES.conflictIndex, {
    id: SCHEDULE_CONFLICT_INDEX_READY_ID,
    ready: true,
    updatedAt: new Date().toISOString(),
    operationId: OPERATION_ID,
    batchId: BATCH_ID
  }));
}

function buildReport(plan, args, target, now, reportPath) {
  const changeSummary = Object.fromEntries(Object.entries(plan.changes).map(([key, rows]) => [key, rows.length]));
  const directCash = plan.applied.filter(row => row.type === 'anonymous_special_direct').reduce((sum, row) => sum + num(row.amount), 0);
  const trialCash = plan.applied.filter(row => row.type === 'private_trial').reduce((sum, row) => sum + num(row.amount), 0);
  const youthCash = plan.applied.filter(row => row.type === 'youth_group_trial').reduce((sum, row) => sum + num(row.amount), 0);
  return {
    operationId: OPERATION_ID,
    batchId: BATCH_ID,
    mode: args.write ? 'write' : 'dry-run',
    generatedAt: now,
    target,
    reportPath,
    summary: {
      requested: 14,
      applied: plan.applied.length,
      blockers: plan.blockers.length,
      changeSummary,
      expectedFinanceImpact: {
        newCashIncome: directCash + trialCash + youthCash,
        directSpecialIncome: directCash,
        privateTrialIncome: trialCash,
        youthGroupTrialIncome: youthCash,
        note: '曦曦消课和艾女士日期修正只影响已入账日期/课包核销，不新增现金收入'
      }
    },
    blockers: plan.blockers,
    applied: plan.applied,
    backups: Object.fromEntries(Object.entries(plan.changes).map(([key, rows]) => [key, rows.map(item => item.before).filter(Boolean)])),
    planned: Object.fromEntries(Object.entries(plan.changes).map(([key, rows]) => [key, rows.map(item => item.after).filter(Boolean)])),
    deletes: Object.fromEntries(Object.entries(plan.changes).map(([key, rows]) => [key, rows.filter(item => !item.after && item.before).map(item => item.before)]))
  };
}

async function run(argv = process.argv.slice(2)) {
  loadRuntimeEnv({ appEnv: 'production', entry: OPERATION_ID });
  const args = parseWriteFlags(argv);
  const reportPath = path.join(REPORT_DIR, `${OPERATION_ID}-${args.write ? 'write' : 'dry-run'}.json`);
  const now = new Date().toISOString();
  assertProductionWriteTrace({ operationId: OPERATION_ID, batchId: BATCH_ID, reportPath });
  const target = await assertProductionWriteTarget({ env: process.env });
  const client = createClientFromEnv();
  const data = await loadData(client);
  const plan = buildPlan({ data, now });
  const report = buildReport(plan, args, target, now, reportPath);
  fs.mkdirSync(REPORT_DIR, { recursive: true });
  fs.writeFileSync(reportPath, `${JSON.stringify(report, null, 2)}\n`, 'utf8');
  if (args.write) await writePlan(client, plan);
  console.log(JSON.stringify({
    ok: plan.blockers.length === 0,
    mode: report.mode,
    reportPath,
    summary: report.summary
  }, null, 2));
  return { plan, report };
}

if (require.main === module) {
  run().catch(error => {
    console.error(error?.stack || String(error));
    process.exit(1);
  });
}

module.exports = { buildPlan, run };
