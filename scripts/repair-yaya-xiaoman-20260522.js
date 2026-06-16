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
  feedbacks: 'ft_feedbacks',
  activeEntitlementIndex: 'ft_student_active_entitlement_index'
};

const YAYA_STUDENT_ID = 'seed-student-007';
const XIAOMAN_STUDENT_ID = 'a4fa15c6-f8b6-4dab-aa69-cc4e472f9d98';
const XIAOMAN_BAD_SCHEDULE_ID = '9fe725d8-c2dd-4240-91ec-fb72c4689442';
const XIAOMAN_BAD_ENTITLEMENT_ID = '14dae6fd-8a77-48cd-83b8-8b7f5f41aada';

function loadEnv() {
  dotenv.config();
}

async function assertProductionTarget() {
  return assertProductionWriteTarget({ diagUrl: PROD_DIAG_URL });
}

function yayaFirstPurchase(row = {}) {
  return {
    ...row,
    packageLessons: 20,
    packagePrice: 8800,
    finalAmount: 8800,
    amountPaid: 8800,
    status: 'voided',
    voidReason: row.voidReason || '2026-01-19 首包20课时已用完，隐藏历史余额',
    updatedAt: new Date().toISOString(),
    notes: '2026/01/19 首次购买20课时，已用完'
  };
}

function yayaFirstEntitlement(row = {}) {
  return {
    ...row,
    totalLessons: 20,
    usedLessons: 20,
    remainingLessons: 0,
    status: 'voided',
    voidReason: row.voidReason || '2026-01-19 首包20课时已用完，隐藏历史余额',
    updatedAt: new Date().toISOString(),
    notes: '2026/01/19 首次购买20课时，已用完'
  };
}

function activeEntitlementIndexRow(entitlements = []) {
  const entitlementIds = entitlements
    .filter(row => String(row.studentId || '') === YAYA_STUDENT_ID)
    .filter(row => String(row.status || 'active') === 'active')
    .filter(row => Number(row.remainingLessons) > 0)
    .map(row => row.id)
    .filter(Boolean);
  return { studentId: YAYA_STUDENT_ID, entitlementIds, updatedAt: new Date().toISOString() };
}

function buildPlan(data) {
  const purchaseById = new Map(data.purchases.map(row => [row.id, row]));
  const entitlementById = new Map(data.entitlements.map(row => [row.id, row]));
  const plan = {
    putPurchases: [],
    putEntitlements: [],
    putIndexes: [],
    deleteLedger: [],
    deleteSchedule: [],
    deleteFeedbacks: []
  };

  const firstPurchase = purchaseById.get('seed-purchase-007');
  if (firstPurchase) plan.putPurchases.push(yayaFirstPurchase(firstPurchase));

  const oldRenewal = purchaseById.get('seed-renewal-007');
  if (oldRenewal) plan.putPurchases.push({ ...oldRenewal, status: 'voided', updatedAt: new Date().toISOString(), voidReason: '丫丫旧拆分10课时作废' });

  const firstEntitlement = entitlementById.get('seed-entitlement-007');
  if (firstEntitlement) plan.putEntitlements.push(yayaFirstEntitlement(firstEntitlement));

  const oldRenewalEntitlement = entitlementById.get('seed-renewal-entitlement-007');
  if (oldRenewalEntitlement) plan.putEntitlements.push({ ...oldRenewalEntitlement, status: 'voided', remainingLessons: 0, updatedAt: new Date().toISOString(), voidReason: '丫丫旧拆分10课时作废' });

  plan.deleteLedger.push(...data.entitlementLedger
    .filter(row => String(row.studentId || '') === YAYA_STUDENT_ID)
    .filter(row => ['seed-purchase-007', 'seed-renewal-007'].includes(String(row.purchaseId || '')) || ['seed-entitlement-007', 'seed-renewal-entitlement-007'].includes(String(row.entitlementId || '')))
    .map(row => row.id));

  plan.deleteLedger.push(...data.entitlementLedger
    .filter(row => String(row.entitlementId || '') === XIAOMAN_BAD_ENTITLEMENT_ID || String(row.scheduleId || '') === XIAOMAN_BAD_SCHEDULE_ID)
    .map(row => row.id));

  if (data.schedule.some(row => row.id === XIAOMAN_BAD_SCHEDULE_ID)) plan.deleteSchedule.push(XIAOMAN_BAD_SCHEDULE_ID);
  plan.deleteFeedbacks.push(...data.feedbacks.filter(row => String(row.scheduleId || '') === XIAOMAN_BAD_SCHEDULE_ID).map(row => row.id));

  const nextEntitlements = data.entitlements.map(row => {
    const update = plan.putEntitlements.find(item => item.id === row.id);
    return update || row;
  });
  plan.putIndexes.push(activeEntitlementIndexRow(nextEntitlements));

  plan.deleteLedger = [...new Set(plan.deleteLedger.filter(Boolean))];
  plan.deleteSchedule = [...new Set(plan.deleteSchedule.filter(Boolean))];
  plan.deleteFeedbacks = [...new Set(plan.deleteFeedbacks.filter(Boolean))];
  return plan;
}

function printPlan(plan, target) {
  console.log(JSON.stringify({
    target,
    putPurchases: plan.putPurchases.map(row => ({ id: row.id, status: row.status, lessons: row.packageLessons, amount: row.amountPaid })),
    putEntitlements: plan.putEntitlements.map(row => ({ id: row.id, status: row.status, total: row.totalLessons, used: row.usedLessons, remaining: row.remainingLessons })),
    putIndexes: plan.putIndexes,
    deleteLedger: plan.deleteLedger,
    deleteSchedule: plan.deleteSchedule,
    deleteFeedbacks: plan.deleteFeedbacks
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
    schedule: await scanTable(client, TABLES.schedule),
    feedbacks: await scanTable(client, TABLES.feedbacks)
  };
  const plan = buildPlan(data);
  printPlan(plan, target);
  if (!write) return plan;
  for (const row of plan.putPurchases) await putRow(client, TABLES.purchases, row);
  for (const row of plan.putEntitlements) await putRow(client, TABLES.entitlements, row);
  for (const row of plan.putIndexes) {
    await putRow(client, TABLES.activeEntitlementIndex, row).catch((err) => {
      if (!/Requested table does not exist|OTSObjectNotExist/i.test(String(err?.message || err))) throw err;
    });
  }
  for (const id of plan.deleteLedger) await deleteRow(client, TABLES.entitlementLedger, id);
  for (const id of plan.deleteFeedbacks) await deleteRow(client, TABLES.feedbacks, id);
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

module.exports = { buildPlan };
