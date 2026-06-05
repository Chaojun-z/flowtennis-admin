#!/usr/bin/env node

const dotenv = require('dotenv');
const { createClientFromEnv, scanTable, putRow } = require('./lib/staging-data-store');

const PROD_DIAG_URL = 'https://www.flowtennis.cn/api/diag';
const TABLES = {
  purchases: 'ft_purchases',
  entitlements: 'ft_entitlements',
  entitlementLedger: 'ft_entitlement_ledger',
  schedule: 'ft_schedule',
  activeEntitlementIndex: 'ft_student_active_entitlement_index'
};

const STUDENT_ID = '250e00ba-1b67-49cc-b7c8-579f4f5c35dd';
const PURCHASE_ID = '34134405-9d31-4622-aa54-426cef82f514';
const ENTITLEMENT_ID = '81a3972e-b232-44dd-a474-4ab3f00ff2d9';
const LEDGER_ID = '9ea33536-8cab-4cee-9c71-8a55a82bb574';
const SCHEDULE_ID = 'bf302334-cd14-456f-872b-07e5520044ce';
const PACKAGE_NAME = '小班体验课 · 2次 · 全天';

function loadEnv() {
  dotenv.config();
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
  if (onlineInstance !== 'flowtennis-ue') throw new Error(`停止写入：线上实例不是 flowtennis-ue，而是 ${onlineInstance}`);
  return { onlineEndpoint, onlineInstance, localEndpoint, localInstance };
}

function requiredRow(rows, id, label) {
  const row = rows.find(item => String(item.id) === id);
  if (!row) throw new Error(`找不到${label}: ${id}`);
  return row;
}

function buildPlan(data, now = new Date().toISOString()) {
  const purchase = requiredRow(data.purchases || [], PURCHASE_ID, '九妹购买记录');
  const entitlement = requiredRow(data.entitlements || [], ENTITLEMENT_ID, '九妹课包权益');
  const ledger = requiredRow(data.entitlementLedger || [], LEDGER_ID, '九妹扣课流水');
  const schedule = requiredRow(data.schedule || [], SCHEDULE_ID, '九妹排课记录');
  const index = (data.activeEntitlementIndex || []).find(row => String(row.id) === STUDENT_ID || String(row.studentId) === STUDENT_ID) || {};

  return {
    putPurchases: [{
      ...purchase,
      courseType: '体验课',
      experienceType: '小班体验课',
      packageName: PACKAGE_NAME,
      productName: purchase.productName || '小班体验课',
      packageLessons: 2,
      totalLessons: 2,
      lessons: 2,
      updatedAt: now
    }],
    putEntitlements: [{
      ...entitlement,
      courseType: '体验课',
      experienceType: '小班体验课',
      packageName: PACKAGE_NAME,
      productName: entitlement.productName || '小班体验课',
      totalLessons: 2,
      usedLessons: 1,
      remainingLessons: 1,
      status: 'active',
      updatedAt: now
    }],
    putSchedule: [{
      ...schedule,
      courseType: '体验课',
      experienceType: '小班体验课',
      courseTypeLevel2: '小班体验课',
      standardCourseType: '小班体验课',
      isTrial: true,
      lessonCount: 1.5,
      entitlementId: ENTITLEMENT_ID,
      entitlementIds: [ENTITLEMENT_ID],
      packageName: PACKAGE_NAME,
      purchaseId: PURCHASE_ID,
      updatedAt: now
    }],
    putLedger: [{
      ...ledger,
      action: 'consume',
      entitlementId: ENTITLEMENT_ID,
      purchaseId: PURCHASE_ID,
      scheduleId: SCHEDULE_ID,
      studentId: STUDENT_ID,
      studentName: '九妹',
      lessonDelta: -1,
      reason: ledger.reason || '排课消课',
      notes: ledger.notes || '小班体验课扣 1 次，排课 1.5 小时',
      updatedAt: now
    }],
    putIndexes: [{
      ...index,
      id: STUDENT_ID,
      studentId: STUDENT_ID,
      entitlementIds: [ENTITLEMENT_ID],
      updatedAt: now
    }]
  };
}

function printPlan(plan, target) {
  console.log(JSON.stringify({
    target,
    putPurchases: plan.putPurchases.map(row => ({ id: row.id, name: row.packageName, type: row.experienceType, total: row.totalLessons || row.packageLessons })),
    putEntitlements: plan.putEntitlements.map(row => ({ id: row.id, name: row.packageName, type: row.experienceType, used: row.usedLessons, remaining: row.remainingLessons, total: row.totalLessons })),
    putSchedule: plan.putSchedule.map(row => ({ id: row.id, type: row.experienceType, lessonCount: row.lessonCount, startTime: row.startTime, endTime: row.endTime, packageName: row.packageName })),
    putLedger: plan.putLedger.map(row => ({ id: row.id, scheduleId: row.scheduleId, delta: row.lessonDelta, notes: row.notes })),
    putIndexes: plan.putIndexes.map(row => ({ id: row.id, entitlementIds: row.entitlementIds }))
  }, null, 2));
}

async function readData(client) {
  const [purchases, entitlements, entitlementLedger, schedule, activeEntitlementIndex] = await Promise.all([
    scanTable(client, TABLES.purchases),
    scanTable(client, TABLES.entitlements),
    scanTable(client, TABLES.entitlementLedger),
    scanTable(client, TABLES.schedule),
    scanTable(client, TABLES.activeEntitlementIndex).catch(() => [])
  ]);
  return { purchases, entitlements, entitlementLedger, schedule, activeEntitlementIndex };
}

async function applyPlan(client, plan) {
  for (const row of plan.putPurchases) await putRow(client, TABLES.purchases, row);
  for (const row of plan.putEntitlements) await putRow(client, TABLES.entitlements, row);
  for (const row of plan.putSchedule) await putRow(client, TABLES.schedule, row);
  for (const row of plan.putLedger) await putRow(client, TABLES.entitlementLedger, row);
  for (const row of plan.putIndexes) await putRow(client, TABLES.activeEntitlementIndex, row);
}

async function run(argv = process.argv.slice(2)) {
  const write = argv.includes('--write');
  loadEnv();
  const target = await assertProductionTarget();
  const client = createClientFromEnv();
  const plan = buildPlan(await readData(client));
  printPlan(plan, target);
  if (!write) {
    console.log('dry-run only; pass --write to apply');
    return plan;
  }
  await applyPlan(client, plan);
  console.log('write complete');
  return plan;
}

if (require.main === module) {
  run().catch((err) => {
    console.error(err);
    process.exit(1);
  });
}

module.exports = {
  buildPlan,
  STUDENT_ID,
  PURCHASE_ID,
  ENTITLEMENT_ID,
  LEDGER_ID,
  SCHEDULE_ID,
  PACKAGE_NAME
};
