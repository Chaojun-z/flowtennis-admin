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

const PACKAGE_NAME = '小班体验课 · 2次 · 全天';
const TARGETS = [
  {
    studentName: '九妹',
    studentId: '250e00ba-1b67-49cc-b7c8-579f4f5c35dd',
    purchaseId: '34134405-9d31-4622-aa54-426cef82f514',
    entitlementId: '81a3972e-b232-44dd-a474-4ab3f00ff2d9',
    ledgerId: '9ea33536-8cab-4cee-9c71-8a55a82bb574',
    scheduleId: 'bf302334-cd14-456f-872b-07e5520044ce',
    usedLessons: 1,
    remainingLessons: 1,
    ledgerDelta: -1
  },
  {
    studentName: '曼玉',
    studentId: '22b2ec53-742c-4fae-8495-5cec857f9117',
    purchaseId: '8ccd14ad-98c9-4fd1-9616-92aa8e1cf64f',
    entitlementId: '22da7b2d-4470-468c-a64f-fb1beebaacc5',
    usedLessons: 0,
    remainingLessons: 2
  },
  {
    studentName: '韩垚垚',
    studentId: 'faf13903-668a-40ae-a5c0-eaa661af48dd',
    purchaseId: '4ba8a8cf-b9d3-42f8-a047-a540753a2bbc',
    entitlementId: '47b9ac03-02b0-4c7e-bda4-51bfbdd1e836',
    usedLessons: 0,
    remainingLessons: 2
  }
];

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

function smallTrialPurchase(row, target, now) {
  return {
    ...row,
    studentId: target.studentId,
    studentName: target.studentName,
    courseType: '体验课',
    experienceType: '小班体验课',
    packageName: PACKAGE_NAME,
    productName: row.productName || '小班体验课',
    packageLessons: 2,
    totalLessons: 2,
    lessons: 2,
    updatedAt: now
  };
}

function smallTrialEntitlement(row, target, now) {
  return {
    ...row,
    studentId: target.studentId,
    studentName: target.studentName,
    purchaseId: target.purchaseId,
    courseType: '体验课',
    experienceType: '小班体验课',
    packageName: PACKAGE_NAME,
    productName: row.productName || '小班体验课',
    totalLessons: 2,
    usedLessons: target.usedLessons,
    remainingLessons: target.remainingLessons,
    status: 'active',
    updatedAt: now
  };
}

function smallTrialSchedule(row, target, now) {
  return {
    ...row,
    courseType: '体验课',
    experienceType: '小班体验课',
    courseTypeLevel2: '小班体验课',
    standardCourseType: '小班体验课',
    isTrial: true,
    entitlementId: target.entitlementId,
    entitlementIds: [target.entitlementId],
    packageName: PACKAGE_NAME,
    purchaseId: target.purchaseId,
    updatedAt: now
  };
}

function smallTrialLedger(row, target, now) {
  return {
    ...row,
    entitlementId: target.entitlementId,
    purchaseId: target.purchaseId,
    scheduleId: target.scheduleId,
    studentId: target.studentId,
    studentName: target.studentName,
    lessonDelta: target.ledgerDelta,
    notes: row.notes || '小班体验课扣 1 次，排课 1.5 小时',
    updatedAt: now
  };
}

function buildPlan(data, now = new Date().toISOString()) {
  const plan = { putPurchases: [], putEntitlements: [], putSchedule: [], putLedger: [], putIndexes: [] };
  for (const target of TARGETS) {
    plan.putPurchases.push(smallTrialPurchase(requiredRow(data.purchases || [], target.purchaseId, `${target.studentName}购买记录`), target, now));
    plan.putEntitlements.push(smallTrialEntitlement(requiredRow(data.entitlements || [], target.entitlementId, `${target.studentName}课包权益`), target, now));
    if (target.scheduleId) plan.putSchedule.push(smallTrialSchedule(requiredRow(data.schedule || [], target.scheduleId, `${target.studentName}排课记录`), target, now));
    if (target.ledgerId) plan.putLedger.push(smallTrialLedger(requiredRow(data.entitlementLedger || [], target.ledgerId, `${target.studentName}扣课流水`), target, now));
    const index = (data.activeEntitlementIndex || []).find(row => String(row.id) === target.studentId || String(row.studentId) === target.studentId) || {};
    plan.putIndexes.push({ ...index, id: target.studentId, studentId: target.studentId, entitlementIds: [target.entitlementId], updatedAt: now });
  }
  return plan;
}

function printPlan(plan, target) {
  console.log(JSON.stringify({
    target,
    putPurchases: plan.putPurchases.map(row => ({ id: row.id, studentName: row.studentName, name: row.packageName, type: row.experienceType, total: row.totalLessons || row.packageLessons })),
    putEntitlements: plan.putEntitlements.map(row => ({ id: row.id, studentName: row.studentName, name: row.packageName, type: row.experienceType, used: row.usedLessons, remaining: row.remainingLessons, total: row.totalLessons })),
    putSchedule: plan.putSchedule.map(row => ({ id: row.id, studentName: row.studentName, type: row.experienceType, lessonCount: row.lessonCount, packageName: row.packageName })),
    putLedger: plan.putLedger.map(row => ({ id: row.id, studentName: row.studentName, scheduleId: row.scheduleId, delta: row.lessonDelta })),
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

module.exports = { buildPlan, TARGETS, PACKAGE_NAME };
