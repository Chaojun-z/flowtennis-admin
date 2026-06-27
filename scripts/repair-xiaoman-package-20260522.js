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

const XIAOMAN_STUDENT_ID = 'a4fa15c6-f8b6-4dab-aa69-cc4e472f9d98';
const ACTIVE_PURCHASE_ID = 'private_lesson_csv_import_20260519_BATCH3_15_LIVE-purchase-c23bbd23-4f6b-6bfa-f024-acddd200875f';
const ACTIVE_ENTITLEMENT_ID = 'private_lesson_csv_import_20260519_BATCH3_15_LIVE-entitlement-c23bbd23-4f6b-6bfa-f024-acddd200875f';
const VOID_ENTITLEMENT_ID = '14dae6fd-8a77-48cd-83b8-8b7f5f41aada';

const CORRECT_LESSONS = [
  { id: 'xiaoman-correct-lesson-20260426-1300', scheduleId: 'xiaoman-correct-schedule-20260426-1300', startTime: '2026-04-26 13:00', endTime: '2026-04-26 15:00', venue: '1号场', lessonDelta: -2, relatedDate: '2026-04-26', sourceTimeBand: '13:00-15:00' },
  { id: 'xiaoman-correct-lesson-20260510-1230', scheduleId: 'xiaoman-correct-schedule-20260510-1230', startTime: '2026-05-10 12:30', endTime: '2026-05-10 14:30', venue: '2号场', lessonDelta: -2, relatedDate: '2026-05-10', sourceTimeBand: '12:30-14:30' },
  { id: 'xiaoman-correct-lesson-20260517-1300', scheduleId: '1544b795-3344-4e64-96ac-c4722b316eca', startTime: '2026-05-17 13:00', endTime: '2026-05-17 15:00', venue: '2号场', lessonDelta: -2, relatedDate: '2026-05-17', sourceTimeBand: '13:00-15:00' }
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

function xiaomanSchedule(row = {}) {
  return parseArr(row.studentIds).includes(XIAOMAN_STUDENT_ID) || String(row.studentName || '').includes('晓曼');
}

function xiaomanLedger(row = {}) {
  return String(row.studentId || '') === XIAOMAN_STUDENT_ID
    || String(row.entitlementId || '') === ACTIVE_ENTITLEMENT_ID
    || String(row.entitlementId || '') === VOID_ENTITLEMENT_ID
    || String(row.studentName || '').includes('晓曼');
}

function normalizeActivePurchase(row = {}) {
  return {
    ...row,
    studentId: XIAOMAN_STUDENT_ID,
    studentName: '晓曼-马坡',
    purchaseDate: '2026-04-21',
    packageName: '成人1v1 朝珺黄金时间20课时',
    productName: '成人1v1私教课',
    courseType: '私教课',
    packageLessons: 20,
    totalLessons: 20,
    packagePrice: 12000,
    systemAmount: 12000,
    amountPaid: 10400,
    finalAmount: 10400,
    priceOverridden: true,
    overrideReason: row.overrideReason || '实际成交价10400',
    ownerCoach: '朝珺',
    allowedCoaches: ['朝珺'],
    coachIds: ['朝珺'],
    coachNames: ['朝珺'],
    campusIds: ['shunyi_mapo'],
    saleCampusId: 'shunyi_mapo',
    packageTimeBand: '黄金时段',
    timeBand: '黄金时段',
    status: 'active',
    updatedAt: new Date().toISOString()
  };
}

function normalizeActiveEntitlement(row = {}) {
  return {
    ...row,
    studentId: XIAOMAN_STUDENT_ID,
    studentName: '晓曼-马坡',
    purchaseId: ACTIVE_PURCHASE_ID,
    packageName: '成人1v1 朝珺黄金时间20课时',
    productName: '成人1v1私教课',
    courseType: '私教课',
    totalLessons: 20,
    usedLessons: 6,
    remainingLessons: 14,
    status: 'active',
    ownerCoach: '朝珺',
    allowedCoaches: ['朝珺'],
    coachIds: ['朝珺'],
    coachNames: ['朝珺'],
    campusIds: ['shunyi_mapo'],
    saleCampusId: 'shunyi_mapo',
    timeBand: '黄金时段',
    packageTimeBand: '黄金时段',
    usageStartDate: '2026-04-21',
    validFrom: '2026-04-21',
    updatedAt: new Date().toISOString()
  };
}

function buildSchedule(base = {}, lesson) {
  return {
    ...base,
    id: lesson.scheduleId,
    startTime: lesson.startTime,
    endTime: lesson.endTime,
    studentIds: [XIAOMAN_STUDENT_ID],
    expectedStudentIds: [XIAOMAN_STUDENT_ID],
    absentStudentIds: [],
    studentName: '晓曼-马坡',
    courseType: '私教课',
    coach: '朝珺',
    coachId: '朝珺',
    campus: 'shunyi_mapo',
    venue: lesson.venue,
    locationType: 'campus',
    lessonCount: 2,
    status: '已排课',
    entitlementId: ACTIVE_ENTITLEMENT_ID,
    entitlementIds: [ACTIVE_ENTITLEMENT_ID],
    packageName: '1v1私教课 · 成人 · 20课时 · 黄金',
    purchaseId: ACTIVE_PURCHASE_ID,
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
    entitlementId: ACTIVE_ENTITLEMENT_ID,
    purchaseId: ACTIVE_PURCHASE_ID,
    scheduleId: lesson.scheduleId,
    studentId: XIAOMAN_STUDENT_ID,
    studentName: '晓曼-马坡',
    coach: '朝珺',
    lessonDelta: lesson.lessonDelta,
    reason: '排课消课',
    relatedDate: lesson.relatedDate,
    sourceLocation: '顺义马坡',
    sourceVenue: lesson.venue,
    sourceTimeBand: lesson.sourceTimeBand,
    notes: `${lesson.sourceTimeBand} · 顺义马坡${lesson.venue} · 朝珺 晓曼 私教课`,
    operator: base.operator || '管理员',
    updatedAt: new Date().toISOString(),
    createdAt: base.createdAt || new Date().toISOString()
  };
}

function buildPlan(data) {
  const purchase = data.purchases.find(row => row.id === ACTIVE_PURCHASE_ID);
  const entitlement = data.entitlements.find(row => row.id === ACTIVE_ENTITLEMENT_ID);
  if (!purchase) throw new Error('找不到晓曼正确购买记录');
  if (!entitlement) throw new Error('找不到晓曼正确课包余额');

  const scheduleById = new Map(data.schedule.map(row => [row.id, row]));
  const ledgerById = new Map(data.entitlementLedger.map(row => [row.id, row]));
  const keepScheduleIds = new Set(CORRECT_LESSONS.map(row => row.scheduleId));
  const keepLedgerIds = new Set(CORRECT_LESSONS.map(row => row.id));
  const deleteSchedule = data.schedule
    .filter(row => xiaomanSchedule(row))
    .filter(row => !keepScheduleIds.has(row.id))
    .map(row => row.id);
  const deleteLedger = data.entitlementLedger
    .filter(row => xiaomanLedger(row))
    .filter(row => !keepLedgerIds.has(row.id))
    .map(row => row.id);

  return {
    putPurchases: [normalizeActivePurchase(purchase)],
    putEntitlements: [normalizeActiveEntitlement(entitlement)],
    putSchedule: CORRECT_LESSONS.map(lesson => buildSchedule(scheduleById.get(lesson.scheduleId) || {}, lesson)),
    putLedger: CORRECT_LESSONS.map(lesson => buildLedger(ledgerById.get(lesson.id) || {}, lesson)),
    putIndexes: [{ id: XIAOMAN_STUDENT_ID, studentId: XIAOMAN_STUDENT_ID, entitlementIds: [ACTIVE_ENTITLEMENT_ID], updatedAt: new Date().toISOString() }],
    deleteSchedule: [...new Set(deleteSchedule.filter(Boolean))],
    deleteLedger: [...new Set(deleteLedger.filter(Boolean))]
  };
}

function printPlan(plan, target) {
  console.log(JSON.stringify({
    target,
    putPurchases: plan.putPurchases.map(row => ({ id: row.id, date: row.purchaseDate, systemAmount: row.systemAmount, paid: row.amountPaid, lessons: row.packageLessons, status: row.status })),
    putEntitlements: plan.putEntitlements.map(row => ({ id: row.id, total: row.totalLessons, used: row.usedLessons, remaining: row.remainingLessons, status: row.status })),
    putSchedule: plan.putSchedule.map(row => ({ id: row.id, startTime: row.startTime, endTime: row.endTime, venue: row.venue, entitlementId: row.entitlementId })),
    putLedger: plan.putLedger.map(row => ({ id: row.id, relatedDate: row.relatedDate, sourceTimeBand: row.sourceTimeBand, delta: row.lessonDelta })),
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
  XIAOMAN_STUDENT_ID,
  ACTIVE_PURCHASE_ID,
  ACTIVE_ENTITLEMENT_ID,
  CORRECT_LESSONS,
  buildPlan
};
