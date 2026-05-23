#!/usr/bin/env node

const dotenv = require('dotenv');
const { createClientFromEnv, scanTable, putRow, deleteRow } = require('./lib/staging-data-store');

const PROD_DIAG_URL = 'https://www.flowtennis.cn/api/diag';
const TABLES = {
  purchases: 'ft_purchases',
  entitlements: 'ft_entitlements',
  entitlementLedger: 'ft_entitlement_ledger',
  schedule: 'ft_schedule',
  activeEntitlementIndex: 'ft_student_active_entitlement_index'
};

const STUDENT_ID = 'seed-student-036';
const PURCHASE_ID = 'private_lesson_csv_import_20260519_BATCH3_15_LIVE-purchase-0715f895-d2a9-6db6-d7ef-b7ea5ad67350';
const ENTITLEMENT_ID = 'private_lesson_csv_import_20260519_BATCH3_15_LIVE-entitlement-0715f895-d2a9-6db6-d7ef-b7ea5ad67350';

const PAID_LESSONS = [
  { id: 'mabao-reconcile-20260515-private_lesson_csv_import_20260519_BATCH3_15_LIVE-entitlement-0715f895-d2a9-6db6-d7ef-b7ea5ad67350-2026-04-02-12:00-13:00-0', scheduleId: '', date: '2026-04-02', time: '12:00-13:00' },
  { id: 'mabao-reconcile-20260515-private_lesson_csv_import_20260519_BATCH3_15_LIVE-entitlement-0715f895-d2a9-6db6-d7ef-b7ea5ad67350-2026-04-09-12:30-13:30-1', scheduleId: '', date: '2026-04-09', time: '12:30-13:30' },
  { id: 'mabao-reconcile-20260515-private_lesson_csv_import_20260519_BATCH3_15_LIVE-entitlement-0715f895-d2a9-6db6-d7ef-b7ea5ad67350-2026-04-16-12:30-13:30-2', scheduleId: '', date: '2026-04-16', time: '12:30-13:30' },
  { id: 'mabao-reconcile-20260515-private_lesson_csv_import_20260519_BATCH3_15_LIVE-entitlement-0715f895-d2a9-6db6-d7ef-b7ea5ad67350-2026-04-23-12:30-13:30-fixed', scheduleId: 'songtiti-schedule-20260423-1230', date: '2026-04-23', time: '12:30-13:30' },
  { id: 'mabao-reconcile-20260515-private_lesson_csv_import_20260519_BATCH3_15_LIVE-entitlement-0715f895-d2a9-6db6-d7ef-b7ea5ad67350-2026-04-30-12:30-13:30-4', scheduleId: 'b4d98154-ebc2-42a8-870d-13b1735b7181', date: '2026-04-30', time: '12:30-13:30' },
  { id: 'mabao-reconcile-20260515-private_lesson_csv_import_20260519_BATCH3_15_LIVE-entitlement-0715f895-d2a9-6db6-d7ef-b7ea5ad67350-2026-05-07-12:30-13:30-5', scheduleId: '98a8726d-b75d-426a-aaa1-686892e2170f', date: '2026-05-07', time: '12:30-13:30' },
  { id: 'mabao-reconcile-20260515-private_lesson_csv_import_20260519_BATCH3_15_LIVE-entitlement-0715f895-d2a9-6db6-d7ef-b7ea5ad67350-2026-05-08-12:30-13:30-6', scheduleId: 'e26e0713-fda3-4a27-b1ec-f387427ba1be', date: '2026-05-08', time: '12:30-13:30' },
  { id: 'mabao-reconcile-20260515-private_lesson_csv_import_20260519_BATCH3_15_LIVE-entitlement-0715f895-d2a9-6db6-d7ef-b7ea5ad67350-2026-05-14-12:30-13:30-7', scheduleId: '', date: '2026-05-14', time: '12:30-13:30' },
  { id: 'songtiti-ledger-20260515-1230', scheduleId: 'songtiti-schedule-20260515-1230', date: '2026-05-15', time: '12:30-13:30' },
  { id: 'songtiti-ledger-20260521-1230', scheduleId: 'songtiti-schedule-20260521-1230', date: '2026-05-21', time: '12:30-13:30' }
];

const FREE_LESSON = {
  id: 'songtiti-free-lesson-20260424-1230',
  scheduleId: 'songtiti-free-schedule-20260424-1230',
  date: '2026-04-24',
  time: '12:30-13:30'
};

function loadEnv() {
  dotenv.config({ path: '.env' });
}

async function assertProductionTarget() {
  const res = await fetch(PROD_DIAG_URL, { headers: { 'Cache-Control': 'no-cache' } });
  if (!res.ok) throw new Error(`线上 diag 失败：${res.status}`);
  const diag = await res.json();
  const onlineEndpoint = String(diag.TS_ENDPOINT || diag.env?.TS_ENDPOINT || '').trim();
  const onlineInstance = String(diag.TS_INSTANCE || diag.env?.TS_INSTANCE || '').trim();
  const localEndpoint = String(process.env.TS_ENDPOINT || '').trim();
  const localInstance = String(process.env.TS_INSTANCE || process.env.TARGET_TS_INSTANCE || '').trim();
  if (localEndpoint !== onlineEndpoint || localInstance !== onlineInstance) {
    throw new Error(`停止写入：本地目标 ${localEndpoint} / ${localInstance} 与线上 ${onlineEndpoint} / ${onlineInstance} 不一致`);
  }
  return { onlineEndpoint, onlineInstance, localEndpoint, localInstance };
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

function lessonStart(lesson) {
  return `${lesson.date} ${lesson.time.split('-')[0]}`;
}

function lessonEnd(lesson) {
  return `${lesson.date} ${lesson.time.split('-')[1]}`;
}

function songtitiSchedule(row = {}) {
  return parseArr(row.studentIds).includes(STUDENT_ID) || String(row.studentName || '').includes('宋缇缇');
}

function buildPaidLedger(base = {}, lesson) {
  return {
    ...base,
    id: lesson.id,
    entitlementId: ENTITLEMENT_ID,
    purchaseId: PURCHASE_ID,
    scheduleId: lesson.scheduleId || '',
    studentId: STUDENT_ID,
    studentName: '宋缇缇',
    lessonDelta: -1,
    action: 'consume',
    reason: '人工更正消课',
    relatedDate: lesson.date,
    sourceDate: lesson.date,
    sourceTimeBand: lesson.time,
    sourceLocation: '顺义马坡',
    sourceVenue: '2号场',
    sourceSheet: '人工更正',
    importSource: '人工更正',
    coach: '朝珺',
    courseType: '私教课',
    notes: `${lesson.time} · 顺义马坡2号场 · 朝珺 宋缇缇 私教课`,
    updatedAt: new Date().toISOString(),
    createdAt: base.createdAt || new Date().toISOString()
  };
}

function buildFreeLedger(base = {}) {
  return {
    ...base,
    id: FREE_LESSON.id,
    entitlementId: ENTITLEMENT_ID,
    purchaseId: PURCHASE_ID,
    scheduleId: FREE_LESSON.scheduleId,
    studentId: STUDENT_ID,
    studentName: '宋缇缇',
    lessonDelta: 0,
    action: 'free_lesson',
    reason: '免费送课',
    relatedDate: FREE_LESSON.date,
    sourceDate: FREE_LESSON.date,
    sourceTimeBand: FREE_LESSON.time,
    sourceLocation: '顺义马坡',
    sourceVenue: '2号场',
    sourceSheet: '人工更正',
    importSource: '人工更正',
    coach: '小宋',
    courseType: '私教课',
    freeLesson: true,
    notes: '朝珺有急事处理，小宋教练免费上课',
    updatedAt: new Date().toISOString(),
    createdAt: base.createdAt || new Date().toISOString()
  };
}

function buildSchedule(base = {}, lesson, options = {}) {
  const free = options.free === true;
  return {
    ...base,
    id: lesson.scheduleId,
    startTime: lessonStart(lesson),
    endTime: lessonEnd(lesson),
    studentIds: [STUDENT_ID],
    expectedStudentIds: [STUDENT_ID],
    absentStudentIds: [],
    studentName: '宋缇缇',
    courseType: '私教课',
    coach: free ? '小宋' : '朝珺',
    coachId: free ? '小宋' : '朝珺',
    campus: 'mabao',
    venue: '2号场',
    locationType: 'campus',
    lessonCount: free ? 0 : 1,
    status: '已排课',
    entitlementId: ENTITLEMENT_ID,
    entitlementIds: [ENTITLEMENT_ID],
    purchaseId: PURCHASE_ID,
    packageName: '1v1私教课 · 成人 · 10课时 · 非黄金',
    coachLateFree: free,
    notes: free ? '朝珺有急事处理，小宋教练免费上课' : '',
    updatedAt: new Date().toISOString(),
    createdAt: base.createdAt || new Date().toISOString()
  };
}

function buildPlan(data) {
  const purchase = data.purchases.find(row => row.id === PURCHASE_ID);
  const entitlement = data.entitlements.find(row => row.id === ENTITLEMENT_ID);
  if (!purchase) throw new Error('找不到宋缇缇购买记录');
  if (!entitlement) throw new Error('找不到宋缇缇课包余额');

  const scheduleById = new Map(data.schedule.map(row => [row.id, row]));
  const ledgerById = new Map(data.entitlementLedger.map(row => [row.id, row]));
  const paidLedgers = PAID_LESSONS.map(lesson => buildPaidLedger(ledgerById.get(lesson.id) || {}, lesson));
  const paidSchedules = PAID_LESSONS.filter(lesson => lesson.scheduleId).map(lesson => buildSchedule(scheduleById.get(lesson.scheduleId) || {}, lesson));

  const deleteSchedule = data.schedule
    .filter(row => songtitiSchedule(row))
    .filter(row => String(row.startTime || '').slice(0, 10) === '2026-05-22')
    .map(row => row.id);
  const deleteLedger = data.entitlementLedger
    .filter(row => String(row.studentId || '') === STUDENT_ID || String(row.entitlementId || '') === ENTITLEMENT_ID)
    .filter(row => String(row.relatedDate || row.sourceDate || '').slice(0, 10) === '2026-05-22' || String(row.scheduleId || '') === '496bfa87-4a32-4f13-b9bb-ce7957ca921c')
    .map(row => row.id);
  const deleteOldTwoHour423 = data.entitlementLedger
    .filter(row => String(row.entitlementId || '') === ENTITLEMENT_ID)
    .filter(row => String(row.relatedDate || row.sourceDate || '').slice(0, 10) === '2026-04-23' && Number(row.lessonDelta) === -2)
    .map(row => row.id);

  return {
    putPurchases: [{
      ...purchase,
      packagePrice: 5000,
      systemAmount: 5000,
      finalAmount: 4500,
      amountPaid: 4500,
      priceOverridden: true,
      overrideReason: purchase.overrideReason || '历史成交价4500',
      updatedAt: new Date().toISOString()
    }],
    putEntitlements: [{
      ...entitlement,
      totalLessons: 10,
      usedLessons: 10,
      remainingLessons: 0,
      status: 'depleted',
      updatedAt: new Date().toISOString()
    }],
    putSchedule: [...paidSchedules, buildSchedule(scheduleById.get(FREE_LESSON.scheduleId) || {}, FREE_LESSON, { free: true })],
    putLedger: [...paidLedgers, buildFreeLedger(ledgerById.get(FREE_LESSON.id) || {})],
    putIndexes: [{ id: STUDENT_ID, studentId: STUDENT_ID, entitlementIds: [], updatedAt: new Date().toISOString() }],
    deleteSchedule: [...new Set(deleteSchedule.filter(Boolean))],
    deleteLedger: [...new Set([...deleteLedger, ...deleteOldTwoHour423].filter(Boolean))]
  };
}

function printPlan(plan, target) {
  console.log(JSON.stringify({
    target,
    putPurchases: plan.putPurchases.map(row => ({ id: row.id, systemAmount: row.systemAmount, finalAmount: row.finalAmount, amountPaid: row.amountPaid })),
    putEntitlements: plan.putEntitlements.map(row => ({ id: row.id, total: row.totalLessons, used: row.usedLessons, remaining: row.remainingLessons, status: row.status })),
    putSchedule: plan.putSchedule.map(row => ({ id: row.id, startTime: row.startTime, endTime: row.endTime, venue: row.venue, coach: row.coach, lessonCount: row.lessonCount })),
    putLedger: plan.putLedger.map(row => ({ id: row.id, date: row.relatedDate, time: row.sourceTimeBand, delta: row.lessonDelta, venue: row.sourceVenue, coach: row.coach, action: row.action })),
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
  PAID_LESSONS,
  FREE_LESSON,
  buildPlan,
  run
};
