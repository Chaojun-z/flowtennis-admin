#!/usr/bin/env node

const dotenv = require('dotenv');
const fs = require('fs');
const path = require('path');
const {
  createClientFromEnv,
  scanTable,
  putRow
} = require('./lib/staging-data-store');
const { assertProductionWriteTarget } = require('./lib/production-write-guard');

const PROD_DIAG_URL = 'https://www.flowtennis.cn/api/diag';
const REPORT_DIR = path.join(process.cwd(), 'offline-reports');

const TABLES = {
  purchases: 'ft_purchases',
  entitlements: 'ft_entitlements',
  entitlementLedger: 'ft_entitlement_ledger',
  schedule: 'ft_schedule',
  activeEntitlementIndex: 'ft_student_active_entitlement_index',
  benefitLedger: 'ft_membership_benefit_ledger'
};

const IDS = {
  mishaStudent: 'seed-student-002',
  huangStudent: 'seed-student-003',
  mishaPrimePurchase: 'private_lesson_csv_import_20260519_BATCH2_15_LIVE:purchase:misha:initial:2026-01-06',
  huangPrimePurchase: 'private_lesson_csv_import_20260519_BATCH2_15_LIVE:purchase:黄总:initial:2026-01-06',
  mishaPrimeEntitlement: 'private_lesson_csv_import_20260519_BATCH2_15_LIVE:entitlement:misha:initial:2026-01-06',
  huangPrimeEntitlement: 'private_lesson_csv_import_20260519_BATCH2_15_LIVE:entitlement:黄总:initial:2026-01-06',
  mishaWrongSmallPurchase: 'baddc8f9-7ca3-461c-8a7f-5457a4ab308d',
  huangWrongSmallPurchase: 'fff21832-8168-4ae7-9498-dc9aa7fe81fd',
  mishaWrongSmallEntitlement: '93ee8657-8c05-4fdb-930a-83bb3ef0d5c4',
  huangWrongSmallEntitlement: 'fb22210c-0ed3-443f-91ed-27d9cf6acc38',
  mishaNonPrimePurchase: 'repair-20260812-purchase-misha-nonprime-20260527',
  huangNonPrimePurchase: 'repair-20260812-purchase-huang-nonprime-20260527',
  mishaNonPrimeEntitlement: 'repair-20260812-entitlement-misha-nonprime-20260527',
  huangNonPrimeEntitlement: 'repair-20260812-entitlement-huang-nonprime-20260527',
  smallWrongSchedule: 'f116428b-2f21-4554-a2c7-8502921f5dac'
};

const STUDENTS = {
  [IDS.mishaStudent]: 'misha',
  [IDS.huangStudent]: '黄总'
};

const WRONG_SMALL_LEDGER_IDS = [
  '0cabbf39-fc28-4717-ba1e-de6a10a23419',
  '246592ba-498e-4cf0-8138-ef55b3e2505b',
  '5bcb986d-9e07-4f01-a1b2-be7ea0ed3702',
  '5c5e5da8-65d2-4cc4-8370-cd6f17e58b20'
];

const PRIME_LESSONS = [
  ['2026-01-19', '19:00', '20:00', IDS.mishaPrimeEntitlement, 1, [IDS.mishaStudent]],
  ['2026-01-19', '20:00', '21:00', IDS.huangPrimeEntitlement, 1, [IDS.huangStudent]],
  ['2026-01-22', '19:00', '20:00', IDS.mishaPrimeEntitlement, 1, [IDS.mishaStudent]],
  ['2026-01-22', '20:00', '21:00', IDS.huangPrimeEntitlement, 1, [IDS.huangStudent]],
  ['2026-01-28', '19:00', '20:00', IDS.mishaPrimeEntitlement, 1, [IDS.mishaStudent]],
  ['2026-01-28', '20:00', '21:00', IDS.huangPrimeEntitlement, 1, [IDS.huangStudent]],
  ['2026-02-26', '19:00', '20:00', IDS.mishaPrimeEntitlement, 1, [IDS.mishaStudent]],
  ['2026-02-26', '20:00', '21:00', IDS.huangPrimeEntitlement, 1, [IDS.huangStudent]],
  ['2026-03-05', '19:00', '20:00', IDS.huangPrimeEntitlement, 1, [IDS.huangStudent]],
  ['2026-03-12', '19:00', '20:00', IDS.mishaPrimeEntitlement, 1, [IDS.mishaStudent]],
  ['2026-03-12', '20:00', '21:00', IDS.huangPrimeEntitlement, 1, [IDS.huangStudent]],
  ['2026-03-19', '19:00', '20:00', IDS.mishaPrimeEntitlement, 1, [IDS.mishaStudent]],
  ['2026-03-19', '20:00', '21:00', IDS.huangPrimeEntitlement, 1, [IDS.huangStudent]],
  ['2026-03-25', '12:00', '13:00', IDS.mishaPrimeEntitlement, 1, [IDS.mishaStudent, IDS.huangStudent]],
  ['2026-04-01', '12:00', '13:00', IDS.huangPrimeEntitlement, 1, [IDS.mishaStudent, IDS.huangStudent]],
  ['2026-04-16', '19:00', '21:00', IDS.mishaPrimeEntitlement, 2, [IDS.mishaStudent]],
  ['2026-04-22', '12:00', '13:00', IDS.mishaPrimeEntitlement, 1, [IDS.mishaStudent, IDS.huangStudent]],
  ['2026-04-30', '19:00', '20:00', IDS.mishaPrimeEntitlement, 1, [IDS.mishaStudent, IDS.huangStudent]],
  ['2026-05-20', '12:00', '13:00', IDS.huangPrimeEntitlement, 1, [IDS.mishaStudent, IDS.huangStudent]],
  ['2026-06-03', '12:00', '13:00', IDS.mishaPrimeEntitlement, 1, [IDS.mishaStudent, IDS.huangStudent]],
  ['2026-06-10', '12:00', '13:00', IDS.huangPrimeEntitlement, 1, [IDS.mishaStudent, IDS.huangStudent]],
  ['2026-06-24', '12:00', '13:00', IDS.huangPrimeEntitlement, 1, [IDS.mishaStudent, IDS.huangStudent]],
  ['2026-07-01', '12:00', '13:00', IDS.huangPrimeEntitlement, 1, [IDS.mishaStudent, IDS.huangStudent]]
];

const NON_PRIME_LESSONS = [
  ['2026-07-08', '12:00', '13:00', IDS.mishaNonPrimeEntitlement, 1, [IDS.mishaStudent, IDS.huangStudent]],
  ['2026-07-29', '12:00', '13:00', IDS.huangNonPrimeEntitlement, 1, [IDS.mishaStudent, IDS.huangStudent]],
  ['2026-08-12', '12:00', '13:00', IDS.mishaNonPrimeEntitlement, 1, [IDS.mishaStudent, IDS.huangStudent]]
];

function mapById(rows = []) {
  return new Map(rows.map(row => [String(row.id || ''), row]));
}

function parseArr(value) {
  if (Array.isArray(value)) return value;
  if (typeof value === 'string' && value) {
    try {
      const parsed = JSON.parse(value);
      return Array.isArray(parsed) ? parsed : [];
    } catch {
      return value.split(/[、,，/]+/).map(item => String(item || '').trim()).filter(Boolean);
    }
  }
  return [];
}

function activeRow(row = {}) {
  return !['cancelled', 'canceled', '已取消', 'voided', 'deleted'].includes(String(row.status || '').trim());
}

function sameDateTime(row = {}, date = '', start = '') {
  return String(row.startTime || '').slice(0, 16) === `${date} ${start}`;
}

function rowHasAnyStudent(row = {}, studentIds = []) {
  const ids = new Set(studentIds.map(String));
  return parseArr(row.studentIds).some(id => ids.has(String(id))) || ids.has(String(row.studentId || ''));
}

function normalizePairName(value) {
  return String(value || '').toLowerCase().replace(/[、,，\s·()（）]/g, '').trim();
}

function rowHasExactMishaHuangName(row = {}) {
  const key = normalizePairName(row.studentName || '');
  return key === 'misha' || key === '黄总' || key === 'misha黄总' || key === '黄总misha';
}

function scheduleMatchesLesson(row = {}, lesson = []) {
  const [date, start, , entitlementId] = lesson;
  const attendeeIds = lessonAttendeeIds(lesson);
  if (!activeRow(row)) return false;
  if (sameDateTime(row, date, start) && (rowHasAnyStudent(row, attendeeIds) || rowHasExactMishaHuangName(row))) return true;
  if (String(row.entitlementId || '') === String(entitlementId) && String(row.startTime || '').slice(0, 10) === date && rowHasAnyStudent(row, attendeeIds)) return true;
  return false;
}

function existingScheduleForLesson(schedules = [], lesson = []) {
  const matches = schedules.filter(row => scheduleMatchesLesson(row, lesson));
  if (!matches.length) return null;
  const [date, start, , entitlementId] = lesson;
  return matches.find(row => sameDateTime(row, date, start) && String(row.entitlementId || '') === String(entitlementId))
    || matches.find(row => String(row.entitlementId || '') === String(entitlementId))
    || matches.find(row => sameDateTime(row, date, start))
    || matches[0];
}

function sameBusinessLesson(row = {}, target = {}) {
  return activeRow(row)
    && String(row.startTime || '').slice(0, 16) === String(target.startTime || '').slice(0, 16)
    && (rowHasAnyStudent(row, parseArr(target.studentIds)) || rowHasExactMishaHuangName(row));
}

function lessonCount(start, end, fallback = 1) {
  const [sh, sm] = String(start || '').split(':').map(Number);
  const [eh, em] = String(end || '').split(':').map(Number);
  if (!Number.isFinite(sh) || !Number.isFinite(sm) || !Number.isFinite(eh) || !Number.isFinite(em)) return fallback;
  return Math.max(0.5, Math.round((((eh * 60 + em) - (sh * 60 + sm)) / 60) * 100) / 100);
}

function entitlementOwner(entitlementId) {
  if (entitlementId === IDS.mishaPrimeEntitlement || entitlementId === IDS.mishaNonPrimeEntitlement) return { id: IDS.mishaStudent, name: 'misha' };
  return { id: IDS.huangStudent, name: '黄总' };
}

function entitlementPurchaseId(entitlementId) {
  if (entitlementId === IDS.mishaPrimeEntitlement) return IDS.mishaPrimePurchase;
  if (entitlementId === IDS.huangPrimeEntitlement) return IDS.huangPrimePurchase;
  if (entitlementId === IDS.mishaNonPrimeEntitlement) return IDS.mishaNonPrimePurchase;
  return IDS.huangNonPrimePurchase;
}

function entitlementPackageName(entitlementId) {
  return entitlementId === IDS.mishaPrimeEntitlement || entitlementId === IDS.huangPrimeEntitlement
    ? '成人1v1 朝珺黄金10课时（历史）'
    : '1v1私教课 · 10课时 · 非黄金';
}

function lessonAttendeeIds(lesson) {
  const owner = entitlementOwner(lesson[3]);
  return Array.isArray(lesson[5]) && lesson[5].length ? lesson[5] : [owner.id];
}

function venueFor(date) {
  const venues = {
    '2026-03-25': '2号场',
    '2026-04-01': '2号场',
    '2026-04-22': '4号场',
    '2026-04-30': '3号场',
    '2026-05-20': '4号场',
    '2026-06-03': '4号场',
    '2026-06-10': '1号场',
    '2026-06-24': '4号场',
    '2026-07-01': '4号场',
    '2026-07-08': '4号场',
    '2026-07-29': '1号场',
    '2026-08-12': '2号场'
  };
  return venues[date] || '2号场';
}

function scheduleIdFor(date, start) {
  return `repair-20260812-schedule-misha-huang-${date}-${start.replace(':', '')}`;
}

function ledgerIdFor(date, start) {
  return `repair-20260812-ledger-misha-huang-${date}-${start.replace(':', '')}`;
}

function touch(row, now, operationId, reason = 'misha/黄总课包与排课历史修正') {
  return {
    ...row,
    updatedAt: now,
    operationId,
    batchId: `batch-${operationId}`,
    operationType: 'misha-huang-package-history-repair',
    operationAt: now,
    operationBy: 'Codex',
    repairReason: reason
  };
}

function voidRow(row, now, operationId, reason) {
  return touch({
    ...row,
    status: 'voided',
    voidedAt: now,
    voidedBy: 'Codex',
    voidReason: reason,
    notes: [row.notes, reason].filter(Boolean).join('；')
  }, now, operationId, reason);
}

function buildPurchase({ id, studentId, studentName, packageName, timeBand, amountPaid, now, operationId }) {
  return touch({
    id,
    studentId,
    studentName,
    packageId: timeBand === '黄金时段' ? 'fix-20260521-成人1v1-朝珺黄金10课时-历史' : 'fix-20260521-成人1v1-朝珺非黄金10课时',
    packageName,
    productName: '私教课',
    courseType: '私教课',
    packageLessons: 10,
    packagePrice: timeBand === '黄金时段' ? 6000 : 5500,
    systemAmount: timeBand === '黄金时段' ? 6000 : 5500,
    finalAmount: amountPaid,
    amountPaid,
    priceOverridden: timeBand !== '黄金时段',
    overrideReason: timeBand !== '黄金时段' ? '用户确认 2026-05-27 每人实付 4700 元' : '',
    priceSource: 'package',
    packageTimeBand: timeBand,
    ownerCoach: '朝珺教练',
    maxStudents: 1,
    purchaseDate: timeBand === '黄金时段' ? '2026-01-06' : '2026-05-27',
    payMethod: '历史导入',
    operator: 'Codex',
    status: 'active',
    courtBookingGiftCount: timeBand === '非黄金时段' ? 1 : undefined,
    ballMachineGiftCount: timeBand === '非黄金时段' ? 1 : undefined,
    giftReason: timeBand === '非黄金时段' ? '用户确认：赠送1小时非黄时间场地 + 1小时发球机' : '用户确认：赠送2节课',
    createdAt: now,
    updatedAt: now
  }, now, operationId);
}

function buildEntitlement({ id, purchaseId, studentId, studentName, packageName, totalLessons, usedLessons, timeBand, now, operationId }) {
  const remainingLessons = Math.max(0, totalLessons - usedLessons);
  return touch({
    id,
    studentId,
    studentName,
    purchaseId,
    packageName,
    courseType: '私教课',
    totalLessons,
    usedLessons,
    remainingLessons,
    basePackageLessons: totalLessons > 10 ? 10 : undefined,
    giftLessons: totalLessons > 10 ? totalLessons - 10 : undefined,
    validFrom: timeBand === '黄金时段' ? '2026-01-06' : '2026-05-27',
    usageStartDate: timeBand === '黄金时段' ? '2026-01-06' : '2026-05-27',
    timeBand,
    ownerCoach: '朝珺教练',
    maxStudents: 1,
    status: remainingLessons <= 0 ? 'depleted' : 'active',
    createdAt: now,
    updatedAt: now
  }, now, operationId);
}

function buildSchedule(lesson, now, operationId) {
  const [date, start, end, entitlementId, explicitCount] = lesson;
  const owner = entitlementOwner(entitlementId);
  const attendeeIds = lessonAttendeeIds(lesson);
  const studentName = attendeeIds.map(id => STUDENTS[id] || id).join('、');
  const usedById = attendeeIds.find(id => id !== owner.id) || owner.id;
  const usedBy = { id: usedById, name: STUDENTS[usedById] || usedById };
  const shared = attendeeIds.length > 1 && usedBy.id !== owner.id;
  const count = explicitCount || lessonCount(start, end);
  return touch({
    id: scheduleIdFor(date, start),
    startTime: `${date} ${start}`,
    endTime: `${date} ${end}`,
    studentIds: attendeeIds,
    expectedStudentIds: attendeeIds,
    absentStudentIds: [],
    studentName,
    courseType: '私教课',
    standardCourseType: '成人私教【正式】',
    courseTypeLevel2: '成人私教课',
    courseDisplayName: '成人私教【正式】',
    isTrial: false,
    coach: '朝珺教练',
    coachId: '',
    campus: 'shunyi_mapo',
    venue: venueFor(date),
    lessonCount: count,
    status: '已排课',
    settlementType: 'package',
    entitlementId,
    entitlementIds: [entitlementId],
    purchaseId: entitlementPurchaseId(entitlementId),
    packageName: entitlementPackageName(entitlementId),
    packageOwnerStudentId: shared ? owner.id : '',
    packageOwnerStudentName: shared ? owner.name : '',
    authorizedStudentId: shared ? usedBy.id : '',
    authorizedStudentName: shared ? usedBy.name : '',
    usedByStudentId: shared ? usedBy.id : '',
    usedByStudentName: shared ? usedBy.name : '',
    scheduleSource: 'feishu-sheet',
    actualStudentCount: attendeeIds.length,
    notes: shared ? `misha 黄总1v2轮流扣课包：本次使用${owner.name}课包；2026-08-12专项修复` : 'misha/黄总1v1历史课专项修复'
  }, now, operationId);
}

function buildScheduleForLesson(lesson, existingSchedule, now, operationId) {
  const built = buildSchedule(lesson, now, operationId);
  if (!existingSchedule?.id) return built;
  return {
    ...built,
    id: existingSchedule.id,
    createdAt: existingSchedule.createdAt || built.createdAt,
    originalScheduleId: existingSchedule.id
  };
}

function buildLedger(lesson, now, operationId) {
  const [date, start, end, entitlementId, explicitCount] = lesson;
  const owner = entitlementOwner(entitlementId);
  const attendeeIds = lessonAttendeeIds(lesson);
  const usedById = attendeeIds.find(id => id !== owner.id) || owner.id;
  const usedBy = { id: usedById, name: STUDENTS[usedById] || usedById };
  const shared = attendeeIds.length > 1 && usedBy.id !== owner.id;
  const count = explicitCount || lessonCount(start, end);
  return touch({
    id: ledgerIdFor(date, start),
    relatedDate: date,
    scheduleId: scheduleIdFor(date, start),
    studentId: usedBy.id,
    entitlementId,
    purchaseId: entitlementPurchaseId(entitlementId),
    packageName: entitlementPackageName(entitlementId),
    lessonDelta: -count,
    action: 'consume',
    reason: shared ? `排课消课（${usedBy.name} 使用 ${owner.name} 的课包）` : '排课消课',
    packageOwnerStudentId: shared ? owner.id : '',
    packageOwnerStudentName: shared ? owner.name : '',
    usedByStudentId: shared ? usedBy.id : '',
    usedByStudentName: shared ? usedBy.name : '',
    sourceDate: date,
    sourceTimeBand: `${start}-${end}`,
    sourceVenue: `顺义马坡${venueFor(date)}`,
    coach: '朝珺教练',
    createdAt: now
  }, now, operationId);
}

function buildLedgerForLesson(lesson, schedule, existingLedger, now, operationId) {
  const built = buildLedger(lesson, now, operationId);
  if (!schedule?.id) return built;
  return {
    ...built,
    id: existingLedger?.id || ledgerIdFor(lesson[0], lesson[1]),
    scheduleId: schedule.id,
    createdAt: existingLedger?.createdAt || built.createdAt,
    originalLedgerId: existingLedger?.id || ''
  };
}

function buildBenefitRows(purchase, now, operationId) {
  if (purchase.packageTimeBand !== '非黄金时段') return [];
  return [
    ['courtBooking', '订场'],
    ['ballMachine', '发球机']
  ].map(([benefitCode, benefitLabel]) => touch({
    id: `repair-20260812-benefit-${purchase.studentId}-${benefitCode}-20260527`,
    studentId: purchase.studentId,
    studentName: purchase.studentName,
    benefitCode,
    benefitLabel,
    unit: '次',
    delta: 1,
    action: 'supplement',
    reason: purchase.giftReason,
    relatedDate: '2026-05-27',
    operator: 'Codex',
    sourcePurchaseId: purchase.id,
    sourcePackageId: purchase.packageId,
    sourcePackageName: purchase.packageName,
    purchaseId: purchase.id,
    packageId: purchase.packageId,
    packageName: purchase.packageName,
    createdAt: now
  }, now, operationId));
}

function activeIndexRows(entitlements = [], now) {
  return [IDS.mishaStudent, IDS.huangStudent].map(studentId => ({
    id: studentId,
    studentId,
    entitlementIds: entitlements
      .filter(row => row.studentId === studentId && row.status === 'active' && Number(row.remainingLessons || 0) > 0)
      .map(row => row.id),
    updatedAt: now
  }));
}

function buildPlan(data, { now = new Date().toISOString(), operationId = `misha-huang-repair-20260812-${Date.now()}` } = {}) {
  const purchases = mapById(data.purchases || []);
  const entitlements = mapById(data.entitlements || []);
  const schedules = mapById(data.schedule || []);
  const ledgers = mapById(data.entitlementLedger || []);
  const blockers = [];
  [IDS.mishaPrimePurchase, IDS.huangPrimePurchase, IDS.mishaWrongSmallPurchase, IDS.huangWrongSmallPurchase].forEach(id => { if (!purchases.has(id)) blockers.push(`购买记录不存在：${id}`); });
  [IDS.mishaPrimeEntitlement, IDS.huangPrimeEntitlement, IDS.mishaWrongSmallEntitlement, IDS.huangWrongSmallEntitlement].forEach(id => { if (!entitlements.has(id)) blockers.push(`课包权益不存在：${id}`); });
  if (blockers.length) return { blockers };

  const putPurchases = [];
  const putEntitlements = [];
  const putSchedules = [];
  const putLedgers = [];
  const putBenefitLedger = [];
  const touchedScheduleIds = new Set();
  const touchedLedgerIds = new Set();

  putPurchases.push(voidRow(purchases.get(IDS.mishaWrongSmallPurchase), now, operationId, 'misha 未购买小班课包，按用户确认作废错误0元小班课包'));
  putPurchases.push(voidRow(purchases.get(IDS.huangWrongSmallPurchase), now, operationId, '黄总未购买小班课包，按用户确认作废错误0元小班课包'));
  putEntitlements.push(voidRow(entitlements.get(IDS.mishaWrongSmallEntitlement), now, operationId, 'misha 未购买小班课包，按用户确认作废错误小班权益'));
  putEntitlements.push(voidRow(entitlements.get(IDS.huangWrongSmallEntitlement), now, operationId, '黄总未购买小班课包，按用户确认作废错误小班权益'));
  if (schedules.has(IDS.smallWrongSchedule)) putSchedules.push(voidRow(schedules.get(IDS.smallWrongSchedule), now, operationId, '6/11 19:00-21:00 错建为小班课，用户确认 misha/黄总为私教课体系'));
  WRONG_SMALL_LEDGER_IDS.forEach(id => {
    if (ledgers.has(id)) putLedgers.push(voidRow(ledgers.get(id), now, operationId, 'misha/黄总错误小班课包消课流水作废'));
  });

  const primeUpdates = [
    buildPurchase({ id: IDS.mishaPrimePurchase, studentId: IDS.mishaStudent, studentName: 'misha', packageName: '成人1v1 朝珺黄金10课时（历史）', timeBand: '黄金时段', amountPaid: 6000, now, operationId }),
    buildPurchase({ id: IDS.huangPrimePurchase, studentId: IDS.huangStudent, studentName: '黄总', packageName: '成人1v1 朝珺黄金10课时（历史）', timeBand: '黄金时段', amountPaid: 6000, now, operationId })
  ];
  putPurchases.push(...primeUpdates);
  putPurchases.push(buildPurchase({ id: IDS.mishaNonPrimePurchase, studentId: IDS.mishaStudent, studentName: 'misha', packageName: '1v1私教课 · 10课时 · 非黄金', timeBand: '非黄金时段', amountPaid: 4700, now, operationId }));
  putPurchases.push(buildPurchase({ id: IDS.huangNonPrimePurchase, studentId: IDS.huangStudent, studentName: '黄总', packageName: '1v1私教课 · 10课时 · 非黄金', timeBand: '非黄金时段', amountPaid: 4700, now, operationId }));

  putEntitlements.push(buildEntitlement({ id: IDS.mishaPrimeEntitlement, purchaseId: IDS.mishaPrimePurchase, studentId: IDS.mishaStudent, studentName: 'misha', packageName: '成人1v1 朝珺黄金10课时（历史）', totalLessons: 12, usedLessons: 12, timeBand: '黄金时段', now, operationId }));
  putEntitlements.push(buildEntitlement({ id: IDS.huangPrimeEntitlement, purchaseId: IDS.huangPrimePurchase, studentId: IDS.huangStudent, studentName: '黄总', packageName: '成人1v1 朝珺黄金10课时（历史）', totalLessons: 12, usedLessons: 12, timeBand: '黄金时段', now, operationId }));
  putEntitlements.push(buildEntitlement({ id: IDS.mishaNonPrimeEntitlement, purchaseId: IDS.mishaNonPrimePurchase, studentId: IDS.mishaStudent, studentName: 'misha', packageName: '1v1私教课 · 10课时 · 非黄金', totalLessons: 10, usedLessons: 2, timeBand: '非黄金时段', now, operationId }));
  putEntitlements.push(buildEntitlement({ id: IDS.huangNonPrimeEntitlement, purchaseId: IDS.huangNonPrimePurchase, studentId: IDS.huangStudent, studentName: '黄总', packageName: '1v1私教课 · 10课时 · 非黄金', totalLessons: 10, usedLessons: 1, timeBand: '非黄金时段', now, operationId }));

  const correctLessons = [...PRIME_LESSONS, ...NON_PRIME_LESSONS];
  correctLessons.forEach(lesson => {
    const existingSchedule = existingScheduleForLesson(data.schedule || [], lesson);
    const schedule = buildScheduleForLesson(lesson, existingSchedule, now, operationId);
    putSchedules.push(schedule);
    touchedScheduleIds.add(String(schedule.id));
    const existingLedger = (data.entitlementLedger || []).find(row => {
      if (!activeRow(row)) return false;
      if (String(row.scheduleId || '') === String(schedule.id) && String(row.entitlementId || '') === String(lesson[3])) return true;
      return String(row.entitlementId || '') === String(lesson[3]) && String(row.relatedDate || '').slice(0, 10) === String(lesson[0]);
    });
    const ledger = buildLedgerForLesson(lesson, schedule, existingLedger, now, operationId);
    putLedgers.push(ledger);
    touchedLedgerIds.add(String(ledger.id));
  });

  const correctSchedules = putSchedules.filter(row => row.courseType === '私教课' && /^2026-/.test(String(row.startTime || '')));
  (data.schedule || []).forEach(row => {
    if (!row?.id || touchedScheduleIds.has(String(row.id)) || String(row.id) === IDS.smallWrongSchedule) return;
    if (correctSchedules.some(target => sameBusinessLesson(row, target))) {
      putSchedules.push(voidRow(row, now, operationId, 'misha/黄总同一节课存在重复残留排课，保留已修正的正式排课'));
      touchedScheduleIds.add(String(row.id));
    }
  });

  (data.entitlementLedger || []).forEach(row => {
    if (!row?.id || touchedLedgerIds.has(String(row.id)) || WRONG_SMALL_LEDGER_IDS.includes(String(row.id))) return;
    if (touchedScheduleIds.has(String(row.scheduleId || ''))) {
      putLedgers.push(voidRow(row, now, operationId, 'misha/黄总已修正排课上的旧消课流水作废，避免同一节课重复扣课'));
      touchedLedgerIds.add(String(row.id));
      return;
    }
    const rowSchedule = schedules.get(String(row.scheduleId || ''));
    if (rowSchedule && putSchedules.some(schedule => String(schedule.id) === String(rowSchedule.id) && schedule.status === 'voided')) {
      putLedgers.push(voidRow(row, now, operationId, 'misha/黄总重复或错误排课对应消课流水作废'));
      touchedLedgerIds.add(String(row.id));
    }
  });
  putPurchases.filter(row => row.id === IDS.mishaNonPrimePurchase || row.id === IDS.huangNonPrimePurchase)
    .forEach(purchase => putBenefitLedger.push(...buildBenefitRows(purchase, now, operationId)));

  const patchedEntitlements = [
    ...(data.entitlements || []).filter(row => !putEntitlements.some(item => item.id === row.id)),
    ...putEntitlements
  ];
  const indexRows = activeIndexRows(patchedEntitlements, now);
  return { blockers, putPurchases, putEntitlements, putSchedules, putLedgers, putBenefitLedger, indexRows, operationId };
}

async function assertProductionTarget(env = process.env) {
  return assertProductionWriteTarget({ env, diagUrl: PROD_DIAG_URL });
}

function sleep(ms) {
  return new Promise(resolve => setTimeout(resolve, ms));
}

async function withRetry(label, fn, attempts = 4) {
  let lastError;
  for (let i = 1; i <= attempts; i += 1) {
    try {
      return await fn();
    } catch (error) {
      lastError = error;
      if (i >= attempts) break;
      console.warn(`[retry] ${label} 第 ${i} 次失败：${error.message || error}，准备重试`);
      await sleep(1000 * i);
    }
  }
  throw lastError;
}

function writeReport(summary, plan) {
  fs.mkdirSync(REPORT_DIR, { recursive: true });
  const reportPath = path.join(REPORT_DIR, `${summary.operationId}-${summary.write ? 'write' : 'dry-run'}.json`);
  fs.writeFileSync(reportPath, JSON.stringify({ summary, plan }, null, 2));
  return reportPath;
}

async function run(argv = process.argv.slice(2), deps = {}) {
  const write = argv.includes('--write');
  dotenv.config();
  const target = deps.assertProductionTarget ? await deps.assertProductionTarget(process.env) : await assertProductionTarget(process.env);
  const client = deps.client || createClientFromEnv();
  const scan = deps.scanTable || scanTable;
  const writeRow = deps.putRow || putRow;
  const data = {
    purchases: await withRetry('scan purchases', () => scan(client, TABLES.purchases)),
    entitlements: await withRetry('scan entitlements', () => scan(client, TABLES.entitlements)),
    entitlementLedger: await withRetry('scan entitlement ledger', () => scan(client, TABLES.entitlementLedger)),
    schedule: await withRetry('scan schedule', () => scan(client, TABLES.schedule))
  };
  const plan = buildPlan(data);
  const summary = {
    target,
    write,
    blockers: plan.blockers.length,
    putPurchases: plan.putPurchases?.length || 0,
    putEntitlements: plan.putEntitlements?.length || 0,
    putSchedules: plan.putSchedules?.length || 0,
    putLedgers: plan.putLedgers?.length || 0,
    putBenefitLedger: plan.putBenefitLedger?.length || 0,
    indexRows: plan.indexRows?.length || 0,
    operationId: plan.operationId
  };
  const reportPath = writeReport(summary, plan);
  console.log(JSON.stringify({ ...summary, reportPath, blockers: plan.blockers }, null, 2));
  if (plan.blockers.length) throw new Error('存在阻塞项，停止写入');
  if (!write) return { ...plan, target, reportPath };
  for (const row of plan.putPurchases) await withRetry(`write purchase ${row.id}`, () => writeRow(client, TABLES.purchases, row));
  for (const row of plan.putEntitlements) await withRetry(`write entitlement ${row.id}`, () => writeRow(client, TABLES.entitlements, row));
  for (const row of plan.putSchedules) await withRetry(`write schedule ${row.id}`, () => writeRow(client, TABLES.schedule, row));
  for (const row of plan.putLedgers) await withRetry(`write ledger ${row.id}`, () => writeRow(client, TABLES.entitlementLedger, row));
  for (const row of plan.putBenefitLedger) await withRetry(`write benefit ${row.id}`, () => writeRow(client, TABLES.benefitLedger, row));
  for (const row of plan.indexRows) await withRetry(`write active index ${row.id}`, () => writeRow(client, TABLES.activeEntitlementIndex, row));
  console.log('写入完成');
  return { ...plan, target, reportPath };
}

if (require.main === module) {
  run().catch(err => {
    console.error(err);
    process.exit(1);
  });
}

module.exports = { IDS, WRONG_SMALL_LEDGER_IDS, PRIME_LESSONS, NON_PRIME_LESSONS, buildPlan, run };
