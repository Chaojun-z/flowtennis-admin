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

const STUDENT_ID = 'import-student-c98420e5-5b3a-2fbe-2d55-f07b179ecbe2';
const PURCHASE_ID = 'private_lesson_csv_import_20260519_BATCH4_FINAL_LIVE-purchase-6f6b6741-4a42-aa2b-2be4-72f5c8b4122c';
const ENTITLEMENT_ID = 'private_lesson_csv_import_20260519_BATCH4_FINAL_LIVE-entitlement-6f6b6741-4a42-aa2b-2be4-72f5c8b4122c';
const DUPLICATE_LEDGER_ID = 'private_lesson_csv_import_20260524-ledger-1952-笑笑';

const CORRECT_LESSONS = [
  { id: 'shunyi_mapo-reconcile-20260515-private_lesson_csv_import_20260519_BATCH4_FINAL_LIVE-entitlement-6f6b6741-4a42-aa2b-2be4-72f5c8b4122c-2026-05-02-15:00-16:00-0', scheduleId: '', startTime: '2026-05-02 15:00', endTime: '2026-05-02 16:00', relatedDate: '2026-05-02', sourceTimeBand: '15:00-16:00', venue: '3号场' },
  { id: 'shunyi_mapo-reconcile-20260515-private_lesson_csv_import_20260519_BATCH4_FINAL_LIVE-entitlement-6f6b6741-4a42-aa2b-2be4-72f5c8b4122c-2026-05-04-10:00-11:00-1', scheduleId: '', startTime: '2026-05-04 10:00', endTime: '2026-05-04 11:00', relatedDate: '2026-05-04', sourceTimeBand: '10:00-11:00', venue: '3号场' },
  { id: 'd59d1025-3619-4df1-a702-f54a655b5683', scheduleId: '79e4d2fe-6441-4587-8b16-0395a2f77c32', startTime: '2026-05-16 09:00', endTime: '2026-05-16 10:00', relatedDate: '2026-05-16', sourceTimeBand: '09:00-10:00', venue: '4号场' },
  { id: '33bbc423-a3f5-4378-9809-c48fe6ba0b22', scheduleId: 'd76a9498-651e-4ad3-a79a-4be47b4ecc87', startTime: '2026-05-24 15:00', endTime: '2026-05-24 16:00', relatedDate: '2026-05-24', sourceTimeBand: '15:00-16:00', venue: '3号场' }
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

function isXiaoxiaoSchedule(row = {}) {
  return parseArr(row.studentIds).includes(STUDENT_ID) || String(row.studentName || '').includes('笑笑');
}

function isXiaoxiaoLedger(row = {}) {
  return String(row.studentId || '') === STUDENT_ID
    || String(row.entitlementId || '') === ENTITLEMENT_ID
    || String(row.studentName || '').includes('笑笑');
}

function normalizePurchase(row = {}) {
  return {
    ...row,
    id: PURCHASE_ID,
    studentId: STUDENT_ID,
    studentName: '笑笑',
    purchaseDate: '2026-05-02',
    packageName: '青少年1v1 非黄时间10课时',
    productName: row.productName || '青少年1v1私教课',
    courseType: '私教课',
    packageLessons: 10,
    totalLessons: 10,
    ownerCoach: 'Siren',
    allowedCoaches: ['Siren'],
    coachIds: ['Siren'],
    coachNames: ['Siren'],
    campusIds: ['shunyi_mapo'],
    saleCampusId: 'shunyi_mapo',
    packageTimeBand: '非黄金时段',
    timeBand: '非黄金时段',
    status: 'active',
    updatedAt: new Date().toISOString()
  };
}

function normalizeEntitlement(row = {}) {
  return {
    ...row,
    id: ENTITLEMENT_ID,
    studentId: STUDENT_ID,
    studentName: '笑笑',
    purchaseId: PURCHASE_ID,
    packageName: '青少年1v1 非黄时间10课时',
    productName: row.productName || '青少年1v1私教课',
    courseType: '私教课',
    totalLessons: 10,
    usedLessons: 4,
    remainingLessons: 6,
    status: 'active',
    ownerCoach: 'Siren',
    allowedCoaches: ['Siren'],
    coachIds: ['Siren'],
    coachNames: ['Siren'],
    campusIds: ['shunyi_mapo'],
    saleCampusId: 'shunyi_mapo',
    timeBand: '非黄金时段',
    packageTimeBand: '非黄金时段',
    usageStartDate: '2026-05-02',
    validFrom: '2026-05-02',
    updatedAt: new Date().toISOString()
  };
}

function buildSchedule(base = {}, lesson) {
  if (!lesson.scheduleId) return null;
  return {
    ...base,
    id: lesson.scheduleId,
    startTime: lesson.startTime,
    endTime: lesson.endTime,
    studentIds: [STUDENT_ID],
    expectedStudentIds: [STUDENT_ID],
    absentStudentIds: [],
    studentName: '笑笑',
    courseType: '私教课',
    coach: 'Siren',
    coachId: 'Siren',
    campus: 'shunyi_mapo',
    venue: lesson.venue,
    locationType: 'campus',
    lessonCount: 1,
    status: '已排课',
    entitlementId: ENTITLEMENT_ID,
    entitlementIds: [ENTITLEMENT_ID],
    packageName: '1v1私教课 · 青少年 · 10课时 · 非黄金',
    purchaseId: PURCHASE_ID,
    timeBand: '非黄金时段',
    updatedAt: new Date().toISOString(),
    createdAt: base.createdAt || new Date().toISOString()
  };
}

function buildLedger(base = {}, lesson) {
  return {
    ...base,
    id: lesson.id,
    action: 'consume',
    entitlementId: ENTITLEMENT_ID,
    purchaseId: PURCHASE_ID,
    scheduleId: lesson.scheduleId || '',
    studentId: STUDENT_ID,
    studentName: '笑笑',
    coach: 'Siren',
    lessonDelta: -1,
    reason: '排课消课',
    relatedDate: lesson.relatedDate,
    sourceLocation: '顺义马坡',
    sourceVenue: lesson.venue,
    sourceTimeBand: lesson.sourceTimeBand,
    notes: `${lesson.sourceTimeBand} · 顺义马坡 ${lesson.venue} · Siren · 笑笑`,
    operator: base.operator || '管理员',
    updatedAt: new Date().toISOString(),
    createdAt: base.createdAt || new Date().toISOString()
  };
}

function buildPlan(data) {
  const purchase = data.purchases.find(row => row.id === PURCHASE_ID);
  const entitlement = data.entitlements.find(row => row.id === ENTITLEMENT_ID);
  if (!purchase) throw new Error('找不到笑笑购买记录');
  if (!entitlement) throw new Error('找不到笑笑课包余额');

  const scheduleById = new Map(data.schedule.map(row => [row.id, row]));
  const ledgerById = new Map(data.entitlementLedger.map(row => [row.id, row]));
  const keepScheduleIds = new Set(CORRECT_LESSONS.map(row => row.scheduleId).filter(Boolean));
  const keepLedgerIds = new Set(CORRECT_LESSONS.map(row => row.id));
  const deleteLedger = data.entitlementLedger
    .filter(row => isXiaoxiaoLedger(row))
    .filter(row => String(row.id || '') === DUPLICATE_LEDGER_ID || !keepLedgerIds.has(row.id))
    .map(row => row.id);
  const putSchedule = CORRECT_LESSONS
    .map(lesson => buildSchedule(scheduleById.get(lesson.scheduleId) || {}, lesson))
    .filter(Boolean);
  return {
    putPurchases: [normalizePurchase(purchase)],
    putEntitlements: [normalizeEntitlement(entitlement)],
    putSchedule,
    putLedger: CORRECT_LESSONS.map(lesson => buildLedger(ledgerById.get(lesson.id) || {}, lesson)),
    putIndexes: [{ id: STUDENT_ID, studentId: STUDENT_ID, entitlementIds: [ENTITLEMENT_ID], updatedAt: new Date().toISOString() }],
    deleteSchedule: data.schedule.filter(row => isXiaoxiaoSchedule(row) && !keepScheduleIds.has(row.id)).map(row => row.id),
    deleteLedger: [...new Set(deleteLedger.filter(Boolean))]
  };
}

function printPlan(plan, target) {
  console.log(JSON.stringify({
    target,
    putPurchases: plan.putPurchases.map(row => ({ id: row.id, date: row.purchaseDate, lessons: row.packageLessons, coach: row.ownerCoach, status: row.status })),
    putEntitlements: plan.putEntitlements.map(row => ({ id: row.id, total: row.totalLessons, used: row.usedLessons, remaining: row.remainingLessons, status: row.status })),
    putSchedule: plan.putSchedule.map(row => ({ id: row.id, startTime: row.startTime, endTime: row.endTime, venue: row.venue, entitlementId: row.entitlementId })),
    putLedger: plan.putLedger.map(row => ({ id: row.id, relatedDate: row.relatedDate, sourceTimeBand: row.sourceTimeBand, sourceVenue: row.sourceVenue, delta: row.lessonDelta })),
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
  PURCHASE_ID,
  ENTITLEMENT_ID,
  DUPLICATE_LEDGER_ID,
  CORRECT_LESSONS,
  buildPlan,
  run
};
