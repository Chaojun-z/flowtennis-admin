#!/usr/bin/env node

const dotenv = require('dotenv');
const { createClientFromEnv, scanTable, putRow, deleteRow } = require('./lib/staging-data-store');
const { assertProductionWriteTarget } = require('./lib/production-write-guard');

const PROD_DIAG_URL = 'https://www.flowtennis.cn/api/diag';
const TABLES = {
  purchases: 'ft_purchases',
  entitlements: 'ft_entitlements',
  entitlementLedger: 'ft_entitlement_ledger',
  schedule: 'ft_schedule',
  activeEntitlementIndex: 'ft_student_active_entitlement_index'
};

const STUDENT_ID = 'seed-student-006';
const STUDENT_NAME = '李嵚';
const INITIAL_PURCHASE_ID = 'private_lesson_csv_import_20260519_BATCH2_15_LIVE:purchase:李嵚:initial:2026-01-15';
const INITIAL_ENTITLEMENT_ID = 'private_lesson_csv_import_20260519_BATCH2_15_LIVE:entitlement:李嵚:initial:2026-01-15';
const RENEWAL_PURCHASE_ID = 'private_lesson_csv_import_20260519_BATCH2_15_LIVE:purchase:李嵚:renew:2026-03-07';
const RENEWAL_ENTITLEMENT_ID = 'private_lesson_csv_import_20260519_BATCH2_15_LIVE:entitlement:李嵚:renew:2026-03-07';

const CORRECT_LESSONS = [
  { id: 'liqin-correct-lesson-20260122-1000', scheduleId: 'liqin-correct-schedule-20260122-1000', entitlementId: INITIAL_ENTITLEMENT_ID, purchaseId: INITIAL_PURCHASE_ID, startTime: '2026-01-22 10:00', endTime: '2026-01-22 11:00', relatedDate: '2026-01-22', sourceTimeBand: '10:00-11:00', venue: '1号场', coach: '晓哲', lessonDelta: -1 },
  { id: 'liqin-correct-lesson-20260129-1000', scheduleId: 'liqin-correct-schedule-20260129-1000', entitlementId: INITIAL_ENTITLEMENT_ID, purchaseId: INITIAL_PURCHASE_ID, startTime: '2026-01-29 10:00', endTime: '2026-01-29 12:00', relatedDate: '2026-01-29', sourceTimeBand: '10:00-12:00', venue: '1号场', coach: '晓哲', lessonDelta: -2 },
  { id: 'liqin-correct-lesson-20260205-1400', scheduleId: 'liqin-correct-schedule-20260205-1400', entitlementId: INITIAL_ENTITLEMENT_ID, purchaseId: INITIAL_PURCHASE_ID, startTime: '2026-02-05 14:00', endTime: '2026-02-05 15:00', relatedDate: '2026-02-05', sourceTimeBand: '14:00-15:00', venue: '1号场', coach: '晓哲', lessonDelta: -1 },
  { id: 'liqin-correct-lesson-20260226-1300', scheduleId: 'liqin-correct-schedule-20260226-1300', entitlementId: INITIAL_ENTITLEMENT_ID, purchaseId: INITIAL_PURCHASE_ID, startTime: '2026-02-26 13:00', endTime: '2026-02-26 14:30', relatedDate: '2026-02-26', sourceTimeBand: '13:00-14:30', venue: '2号场', coach: '晓哲', lessonDelta: -1.5 },
  { id: 'liqin-correct-lesson-20260312-1000', scheduleId: 'liqin-correct-schedule-20260312-1000', entitlementId: INITIAL_ENTITLEMENT_ID, purchaseId: INITIAL_PURCHASE_ID, startTime: '2026-03-12 10:00', endTime: '2026-03-12 11:30', relatedDate: '2026-03-12', sourceTimeBand: '10:00-11:30', venue: '4号场', coach: '晓哲', lessonDelta: -1.5 },
  { id: 'liqin-correct-lesson-20260316-1030', scheduleId: 'liqin-correct-schedule-20260316-1030', entitlementId: INITIAL_ENTITLEMENT_ID, purchaseId: INITIAL_PURCHASE_ID, startTime: '2026-03-16 10:30', endTime: '2026-03-16 11:30', relatedDate: '2026-03-16', sourceTimeBand: '10:30-11:30', venue: '4号场', coach: 'Siren', lessonDelta: -1 },
  { id: 'liqin-correct-lesson-20260319-1000', scheduleId: 'liqin-correct-schedule-20260319-1000', entitlementId: INITIAL_ENTITLEMENT_ID, purchaseId: INITIAL_PURCHASE_ID, startTime: '2026-03-19 10:00', endTime: '2026-03-19 11:30', relatedDate: '2026-03-19', sourceTimeBand: '10:00-11:30', venue: '4号场', coach: '晓哲', lessonDelta: -1.5 },
  { id: 'liqin-correct-lesson-20260323-1000-initial', scheduleId: 'liqin-correct-schedule-20260323-1000', entitlementId: INITIAL_ENTITLEMENT_ID, purchaseId: INITIAL_PURCHASE_ID, startTime: '2026-03-23 10:00', endTime: '2026-03-23 11:00', relatedDate: '2026-03-23', sourceTimeBand: '10:00-11:00', venue: '3号场', coach: 'Siren', lessonDelta: -0.5 },
  { id: 'liqin-correct-lesson-20260323-1000-renewal', scheduleId: 'liqin-correct-schedule-20260323-1000', entitlementId: RENEWAL_ENTITLEMENT_ID, purchaseId: RENEWAL_PURCHASE_ID, startTime: '2026-03-23 10:00', endTime: '2026-03-23 11:00', relatedDate: '2026-03-23', sourceTimeBand: '10:00-11:00', venue: '3号场', coach: 'Siren', lessonDelta: -0.5 },
  { id: 'liqin-correct-lesson-20260326-1000', scheduleId: 'liqin-correct-schedule-20260326-1000', entitlementId: RENEWAL_ENTITLEMENT_ID, purchaseId: RENEWAL_PURCHASE_ID, startTime: '2026-03-26 10:00', endTime: '2026-03-26 11:00', relatedDate: '2026-03-26', sourceTimeBand: '10:00-11:00', venue: '4号场', coach: '晓哲', lessonDelta: -1 },
  { id: 'liqin-correct-lesson-20260326-1100', scheduleId: 'liqin-correct-schedule-20260326-1100', entitlementId: RENEWAL_ENTITLEMENT_ID, purchaseId: RENEWAL_PURCHASE_ID, startTime: '2026-03-26 11:00', endTime: '2026-03-26 11:30', relatedDate: '2026-03-26', sourceTimeBand: '11:00-11:30', venue: '4号场', coach: '晓哲', lessonDelta: -0.5 },
  { id: 'liqin-correct-lesson-20260330-1500', scheduleId: 'liqin-correct-schedule-20260330-1500', entitlementId: RENEWAL_ENTITLEMENT_ID, purchaseId: RENEWAL_PURCHASE_ID, startTime: '2026-03-30 15:00', endTime: '2026-03-30 16:00', relatedDate: '2026-03-30', sourceTimeBand: '15:00-16:00', venue: '3号场', coach: 'Siren', lessonDelta: -1 },
  { id: 'liqin-correct-lesson-20260402-1400', scheduleId: 'liqin-correct-schedule-20260402-1400', entitlementId: RENEWAL_ENTITLEMENT_ID, purchaseId: RENEWAL_PURCHASE_ID, startTime: '2026-04-02 14:00', endTime: '2026-04-02 15:00', relatedDate: '2026-04-02', sourceTimeBand: '14:00-15:00', venue: '4号场', coach: '晓哲', lessonDelta: -1 },
  { id: 'liqin-correct-lesson-20260402-1500', scheduleId: 'liqin-correct-schedule-20260402-1500', entitlementId: RENEWAL_ENTITLEMENT_ID, purchaseId: RENEWAL_PURCHASE_ID, startTime: '2026-04-02 15:00', endTime: '2026-04-02 15:30', relatedDate: '2026-04-02', sourceTimeBand: '15:00-15:30', venue: '4号场', coach: '晓哲', lessonDelta: -0.5 },
  { id: 'liqin-correct-lesson-20260409-1000', scheduleId: 'liqin-correct-schedule-20260409-1000', entitlementId: RENEWAL_ENTITLEMENT_ID, purchaseId: RENEWAL_PURCHASE_ID, startTime: '2026-04-09 10:00', endTime: '2026-04-09 11:00', relatedDate: '2026-04-09', sourceTimeBand: '10:00-11:00', venue: '3号场', coach: '晓哲', lessonDelta: -1 },
  { id: 'liqin-correct-lesson-20260409-1100', scheduleId: 'liqin-correct-schedule-20260409-1100', entitlementId: RENEWAL_ENTITLEMENT_ID, purchaseId: RENEWAL_PURCHASE_ID, startTime: '2026-04-09 11:00', endTime: '2026-04-09 11:30', relatedDate: '2026-04-09', sourceTimeBand: '11:00-11:30', venue: '3号场', coach: '晓哲', lessonDelta: -0.5 },
  { id: 'liqin-correct-lesson-20260415-1200', scheduleId: 'liqin-correct-schedule-20260415-1200', entitlementId: RENEWAL_ENTITLEMENT_ID, purchaseId: RENEWAL_PURCHASE_ID, startTime: '2026-04-15 12:00', endTime: '2026-04-15 13:00', relatedDate: '2026-04-15', sourceTimeBand: '12:00-13:00', venue: '2号场', coach: '晓哲', lessonDelta: -1 },
  { id: 'liqin-correct-lesson-20260416-1030', scheduleId: 'liqin-correct-schedule-20260416-1030', entitlementId: RENEWAL_ENTITLEMENT_ID, purchaseId: RENEWAL_PURCHASE_ID, startTime: '2026-04-16 10:30', endTime: '2026-04-16 11:30', relatedDate: '2026-04-16', sourceTimeBand: '10:30-11:30', venue: '3号场', coach: '晓哲', lessonDelta: -1 },
  { id: 'liqin-correct-lesson-20260416-1130', scheduleId: 'liqin-correct-schedule-20260416-1130', entitlementId: RENEWAL_ENTITLEMENT_ID, purchaseId: RENEWAL_PURCHASE_ID, startTime: '2026-04-16 11:30', endTime: '2026-04-16 12:00', relatedDate: '2026-04-16', sourceTimeBand: '11:30-12:00', venue: '3号场', coach: '晓哲', lessonDelta: -0.5 },
  { id: 'liqin-correct-lesson-20260422-1200', scheduleId: 'liqin-correct-schedule-20260422-1200', entitlementId: RENEWAL_ENTITLEMENT_ID, purchaseId: RENEWAL_PURCHASE_ID, startTime: '2026-04-22 12:00', endTime: '2026-04-22 13:00', relatedDate: '2026-04-22', sourceTimeBand: '12:00-13:00', venue: '2号场', coach: '晓哲', lessonDelta: -1 },
  { id: 'liqin-correct-lesson-20260422-1300', scheduleId: 'liqin-correct-schedule-20260422-1300', entitlementId: RENEWAL_ENTITLEMENT_ID, purchaseId: RENEWAL_PURCHASE_ID, startTime: '2026-04-22 13:00', endTime: '2026-04-22 13:30', relatedDate: '2026-04-22', sourceTimeBand: '13:00-13:30', venue: '2号场', coach: '晓哲', lessonDelta: -0.5 },
  { id: 'liqin-correct-lesson-20260423-1300', scheduleId: 'liqin-correct-schedule-20260423-1300', entitlementId: RENEWAL_ENTITLEMENT_ID, purchaseId: RENEWAL_PURCHASE_ID, startTime: '2026-04-23 13:00', endTime: '2026-04-23 14:00', relatedDate: '2026-04-23', sourceTimeBand: '13:00-14:00', venue: '3号场', coach: '晓哲', lessonDelta: -1 },
  { id: 'liqin-correct-lesson-20260507-1000', scheduleId: 'liqin-correct-schedule-20260507-1000', entitlementId: RENEWAL_ENTITLEMENT_ID, purchaseId: RENEWAL_PURCHASE_ID, startTime: '2026-05-07 10:00', endTime: '2026-05-07 11:00', relatedDate: '2026-05-07', sourceTimeBand: '10:00-11:00', venue: '4号场', coach: '晓哲', lessonDelta: -1 },
  { id: 'liqin-correct-lesson-20260507-1100', scheduleId: 'liqin-correct-schedule-20260507-1100', entitlementId: RENEWAL_ENTITLEMENT_ID, purchaseId: RENEWAL_PURCHASE_ID, startTime: '2026-05-07 11:00', endTime: '2026-05-07 11:30', relatedDate: '2026-05-07', sourceTimeBand: '11:00-11:30', venue: '4号场', coach: '晓哲', lessonDelta: -0.5 },
  { id: 'liqin-correct-lesson-20260513-1200', scheduleId: 'liqin-correct-schedule-20260513-1200', entitlementId: RENEWAL_ENTITLEMENT_ID, purchaseId: RENEWAL_PURCHASE_ID, startTime: '2026-05-13 12:00', endTime: '2026-05-13 13:00', relatedDate: '2026-05-13', sourceTimeBand: '12:00-13:00', venue: '2号场', coach: '晓哲', lessonDelta: -1 },
  { id: 'liqin-correct-lesson-20260514-1300', scheduleId: 'liqin-correct-schedule-20260514-1300', entitlementId: RENEWAL_ENTITLEMENT_ID, purchaseId: RENEWAL_PURCHASE_ID, startTime: '2026-05-14 13:00', endTime: '2026-05-14 14:00', relatedDate: '2026-05-14', sourceTimeBand: '13:00-14:00', venue: '3号场', coach: '晓哲', lessonDelta: -1 },
  { id: 'liqin-correct-lesson-20260520-1300', scheduleId: 'liqin-correct-schedule-20260520-1300', entitlementId: RENEWAL_ENTITLEMENT_ID, purchaseId: RENEWAL_PURCHASE_ID, startTime: '2026-05-20 13:00', endTime: '2026-05-20 14:00', relatedDate: '2026-05-20', sourceTimeBand: '13:00-14:00', venue: '2号场', coach: '晓哲', lessonDelta: -1 },
  { id: 'liqin-correct-lesson-20260521-1000', scheduleId: 'liqin-correct-schedule-20260521-1000', entitlementId: RENEWAL_ENTITLEMENT_ID, purchaseId: RENEWAL_PURCHASE_ID, startTime: '2026-05-21 10:00', endTime: '2026-05-21 11:30', relatedDate: '2026-05-21', sourceTimeBand: '10:00-11:30', venue: '3号场', coach: '晓哲', lessonDelta: -1.5 }
];

function loadEnv() {
  dotenv.config();
}

async function assertProductionTarget() {
  return assertProductionWriteTarget({ diagUrl: PROD_DIAG_URL });
}

function parseArr(value) {
  if (Array.isArray(value)) return value;
  if (typeof value === 'string' && value) {
    try {
      const parsed = JSON.parse(value);
      return Array.isArray(parsed) ? parsed : [];
    } catch {
      return [];
    }
  }
  return [];
}

function liqinSchedule(row = {}) {
  return parseArr(row.studentIds).includes(STUDENT_ID) || String(row.studentName || '').includes(STUDENT_NAME);
}

function liqinLedger(row = {}) {
  return String(row.studentId || '') === STUDENT_ID
    || [INITIAL_ENTITLEMENT_ID, RENEWAL_ENTITLEMENT_ID].includes(String(row.entitlementId || ''))
    || String(row.entitlementId || '').includes(`entitlement:${STUDENT_NAME}:`)
    || String(row.studentName || '').includes(STUDENT_NAME);
}

function normalizePurchase(row = {}, type) {
  const isInitial = type === 'initial';
  return {
    ...row,
    studentId: STUDENT_ID,
    studentName: STUDENT_NAME,
    purchaseDate: isInitial ? '2026-01-15' : '2026-03-07',
    packageName: isInitial ? '成人1v1 黄金时间10课时（历史）' : '成人1v1 黄金时间50课时（历史）',
    productName: '成人1v1私教课',
    courseType: '私教课',
    packageLessons: isInitial ? 10 : 50,
    totalLessons: isInitial ? 10 : 50,
    ownerCoach: '晓哲',
    allowedCoaches: ['晓哲', 'Siren'],
    coachIds: ['晓哲', 'Siren'],
    coachNames: ['晓哲', 'Siren'],
    campusIds: ['shunyi_mapo'],
    saleCampusId: 'shunyi_mapo',
    packageTimeBand: '黄金时段',
    timeBand: '黄金时段',
    status: 'active',
    updatedAt: new Date().toISOString()
  };
}

function normalizeEntitlement(row = {}, type) {
  const isInitial = type === 'initial';
  const totalLessons = isInitial ? 10 : 50;
  const usedLessons = CORRECT_LESSONS
    .filter(lesson => lesson.entitlementId === (isInitial ? INITIAL_ENTITLEMENT_ID : RENEWAL_ENTITLEMENT_ID))
    .reduce((sum, lesson) => sum + Math.abs(Number(lesson.lessonDelta) || 0), 0);
  const remainingLessons = Math.max(0, totalLessons - usedLessons);
  return {
    ...row,
    studentId: STUDENT_ID,
    studentName: STUDENT_NAME,
    purchaseId: isInitial ? INITIAL_PURCHASE_ID : RENEWAL_PURCHASE_ID,
    packageName: isInitial ? '成人1v1 黄金时间10课时（历史）' : '成人1v1 黄金时间50课时（历史）',
    productName: '成人1v1私教课',
    courseType: '私教课',
    totalLessons,
    usedLessons,
    remainingLessons,
    status: remainingLessons <= 0 ? 'depleted' : 'active',
    ownerCoach: '晓哲',
    allowedCoaches: ['晓哲', 'Siren'],
    coachIds: ['晓哲', 'Siren'],
    coachNames: ['晓哲', 'Siren'],
    campusIds: ['shunyi_mapo'],
    saleCampusId: 'shunyi_mapo',
    timeBand: '黄金时段',
    packageTimeBand: '黄金时段',
    usageStartDate: isInitial ? '2026-01-15' : '2026-03-07',
    validFrom: isInitial ? '2026-01-15' : '2026-03-07',
    updatedAt: new Date().toISOString()
  };
}

function buildSchedule(base = {}, lesson, lessonCount = Math.abs(Number(lesson.lessonDelta) || 0)) {
  return {
    ...base,
    id: lesson.scheduleId,
    startTime: lesson.startTime,
    endTime: lesson.endTime,
    studentIds: [STUDENT_ID],
    expectedStudentIds: [STUDENT_ID],
    absentStudentIds: [],
    studentName: STUDENT_NAME,
    courseType: '私教课',
    coach: lesson.coach,
    coachId: lesson.coach,
    campus: 'shunyi_mapo',
    venue: lesson.venue,
    locationType: 'campus',
    lessonCount,
    status: '已排课',
    entitlementId: lesson.entitlementId,
    entitlementIds: [lesson.entitlementId],
    packageName: lesson.entitlementId === INITIAL_ENTITLEMENT_ID ? '1v1私教课 · 成人 · 10课时 · 黄金' : '1v1私教课 · 成人 · 50课时 · 黄金',
    purchaseId: lesson.purchaseId,
    timeBand: '黄金时段',
    updatedAt: new Date().toISOString(),
    createdAt: base.createdAt || new Date().toISOString()
  };
}

function buildLedger(base = {}, lesson) {
  return {
    ...base,
    id: lesson.id,
    action: 'consume',
    entitlementId: lesson.entitlementId,
    purchaseId: lesson.purchaseId,
    scheduleId: lesson.scheduleId,
    studentId: STUDENT_ID,
    studentName: STUDENT_NAME,
    coach: lesson.coach,
    lessonDelta: lesson.lessonDelta,
    reason: '排课消课',
    relatedDate: lesson.relatedDate,
    sourceLocation: '顺义马坡',
    sourceVenue: lesson.venue,
    sourceTimeBand: lesson.sourceTimeBand,
    notes: `${lesson.sourceTimeBand} · 顺义马坡 ${lesson.venue} · ${lesson.coach} · ${STUDENT_NAME}`,
    operator: base.operator || '管理员',
    updatedAt: new Date().toISOString(),
    createdAt: base.createdAt || new Date().toISOString()
  };
}

function buildPlan(data) {
  const initialPurchase = data.purchases.find(row => row.id === INITIAL_PURCHASE_ID) || {};
  const renewalPurchase = data.purchases.find(row => row.id === RENEWAL_PURCHASE_ID) || {};
  const initialEntitlement = data.entitlements.find(row => row.id === INITIAL_ENTITLEMENT_ID) || {};
  const renewalEntitlement = data.entitlements.find(row => row.id === RENEWAL_ENTITLEMENT_ID) || {};
  const scheduleById = new Map(data.schedule.map(row => [row.id, row]));
  const ledgerById = new Map(data.entitlementLedger.map(row => [row.id, row]));
  const lessonsBySchedule = new Map();
  CORRECT_LESSONS.forEach(lesson => lessonsBySchedule.set(lesson.scheduleId, (lessonsBySchedule.get(lesson.scheduleId) || 0) + Math.abs(Number(lesson.lessonDelta) || 0)));
  const keepScheduleIds = new Set(CORRECT_LESSONS.map(row => row.scheduleId));
  const keepLedgerIds = new Set(CORRECT_LESSONS.map(row => row.id));
  const deleteSchedule = data.schedule
    .filter(row => liqinSchedule(row))
    .filter(row => String(row.startTime || '').slice(0,10) >= '2026-01-22' && String(row.startTime || '').slice(0,10) <= '2026-05-21')
    .filter(row => !keepScheduleIds.has(row.id))
    .map(row => row.id);
  const deleteLedger = data.entitlementLedger
    .filter(row => liqinLedger(row))
    .filter(row => String(row.relatedDate || row.sourceDate || '').slice(0,10) >= '2026-01-22' && String(row.relatedDate || row.sourceDate || '').slice(0,10) <= '2026-05-21')
    .filter(row => !keepLedgerIds.has(row.id))
    .map(row => row.id);
  return {
    putPurchases: [normalizePurchase(initialPurchase, 'initial'), normalizePurchase(renewalPurchase, 'renewal')],
    putEntitlements: [normalizeEntitlement(initialEntitlement, 'initial'), normalizeEntitlement(renewalEntitlement, 'renewal')],
    putSchedule: [...new Map(CORRECT_LESSONS.map(lesson => [lesson.scheduleId, lesson])).values()].map(lesson => buildSchedule(scheduleById.get(lesson.scheduleId) || {}, lesson, lessonsBySchedule.get(lesson.scheduleId) || Math.abs(Number(lesson.lessonDelta) || 0))),
    putLedger: CORRECT_LESSONS.map(lesson => buildLedger(ledgerById.get(lesson.id) || {}, lesson)),
    putIndexes: [{ id: STUDENT_ID, studentId: STUDENT_ID, entitlementIds: [RENEWAL_ENTITLEMENT_ID], updatedAt: new Date().toISOString() }],
    deleteSchedule: [...new Set(deleteSchedule.filter(Boolean))],
    deleteLedger: [...new Set(deleteLedger.filter(Boolean))]
  };
}

function printPlan(plan, target) {
  console.log(JSON.stringify({
    target,
    putPurchases: plan.putPurchases.map(row => ({ id: row.id, date: row.purchaseDate, lessons: row.packageLessons, coach: row.ownerCoach, status: row.status })),
    putEntitlements: plan.putEntitlements.map(row => ({ id: row.id, total: row.totalLessons, used: row.usedLessons, remaining: row.remainingLessons, status: row.status })),
    putSchedule: plan.putSchedule.map(row => ({ id: row.id, startTime: row.startTime, endTime: row.endTime, venue: row.venue, coach: row.coach, entitlementId: row.entitlementId })),
    putLedger: plan.putLedger.map(row => ({ id: row.id, entitlementId: row.entitlementId, relatedDate: row.relatedDate, sourceTimeBand: row.sourceTimeBand, delta: row.lessonDelta })),
    putIndexes: plan.putIndexes,
    deleteSchedule: plan.deleteSchedule,
    deleteLedger: plan.deleteLedger
  }, null, 2));
}

async function run(argv = process.argv.slice(2)) {
  const write = argv.includes('--write');
  loadEnv();
  const target = await assertProductionTarget();
  const client = createClientFromEnv();
  const data = {
    purchases: await scanTable(client, TABLES.purchases),
    entitlements: await scanTable(client, TABLES.entitlements),
    entitlementLedger: await scanTable(client, TABLES.entitlementLedger),
    schedule: await scanTable(client, TABLES.schedule)
  };
  const plan = buildPlan(data);
  printPlan(plan, target);
  if (!write) return plan;
  for (const row of plan.putPurchases) await putRow(client, TABLES.purchases, row);
  for (const row of plan.putEntitlements) await putRow(client, TABLES.entitlements, row);
  for (const row of plan.putSchedule) await putRow(client, TABLES.schedule, row);
  for (const row of plan.putLedger) await putRow(client, TABLES.entitlementLedger, row);
  for (const row of plan.putIndexes) await putRow(client, TABLES.activeEntitlementIndex, row);
  for (const id of plan.deleteLedger) await deleteRow(client, TABLES.entitlementLedger, id);
  for (const id of plan.deleteSchedule) await deleteRow(client, TABLES.schedule, id);
  console.log('写入完成');
  return plan;
}

if (require.main === module) {
  run().catch(err => {
    console.error(err);
    process.exit(1);
  });
}

module.exports = {
  STUDENT_ID,
  INITIAL_PURCHASE_ID,
  INITIAL_ENTITLEMENT_ID,
  RENEWAL_PURCHASE_ID,
  RENEWAL_ENTITLEMENT_ID,
  CORRECT_LESSONS,
  buildPlan,
  run
};
