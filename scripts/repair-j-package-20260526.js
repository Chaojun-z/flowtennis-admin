#!/usr/bin/env node

const dotenv = require('dotenv');
const { createClientFromEnv, scanTable, putRow } = require('./lib/staging-data-store');
const { assertProductionWriteTarget } = require('./lib/production-write-guard');

const PROD_DIAG_URL = 'https://www.flowtennis.cn/api/diag';
const TABLES = {
  purchases: 'ft_purchases',
  entitlements: 'ft_entitlements',
  activeEntitlementIndex: 'ft_student_active_entitlement_index'
};

const STUDENT_ID = 'seed-student-020';
const STUDENT_NAME = '·J ·';
const PURCHASE_ID = 'seed-purchase-020';
const ENTITLEMENT_ID = 'seed-entitlement-020';
const TARGET_TOTAL_LESSONS = 11;
const TARGET_USED_LESSONS = 9.5;
const TARGET_REMAINING_LESSONS = 1.5;
const TARGET_AMOUNT = 5500;
const TARGET_PACKAGE_ID = 'fix-20260521-成人1v1-非黄时间10课时-历史';
const TARGET_PACKAGE_NAME = '成人1v1 非黄时间10课时（历史）';
const TARGET_TIME_BAND = '非黄金时段';
const TARGET_DAILY_TIME_WINDOWS = [
  { label: '工作日', startTime: '09:00', endTime: '16:00', daysOfWeek: [1, 2, 3, 4, 5] }
];

function loadEnv() {
  dotenv.config();
}

async function assertProductionTarget() {
  return assertProductionWriteTarget({ diagUrl: PROD_DIAG_URL });
}

function normalizePurchase(row = {}, now = new Date().toISOString()) {
  if (String(row.studentId || '') !== STUDENT_ID || String(row.studentName || '').trim() !== STUDENT_NAME) {
    throw new Error('购买记录不是目标学员 J，停止');
  }
  return {
    ...row,
    amountPaid: TARGET_AMOUNT,
    finalAmount: TARGET_AMOUNT,
    packageLessons: TARGET_TOTAL_LESSONS,
    totalLessons: TARGET_TOTAL_LESSONS,
    packageId: TARGET_PACKAGE_ID,
    packageName: TARGET_PACKAGE_NAME,
    priceSourceId: TARGET_PACKAGE_ID,
    priceSourceName: TARGET_PACKAGE_NAME,
    packagePrice: 5000,
    systemAmount: 5000,
    packageTimeBand: TARGET_TIME_BAND,
    timeBand: TARGET_TIME_BAND,
    dailyTimeWindows: TARGET_DAILY_TIME_WINDOWS,
    priceOverridden: true,
    overrideReason: '个性化成交：J 非黄金课包实付5500，赠至11课时',
    coachPriceSnapshot: {
      ...(row.coachPriceSnapshot || {}),
      amountPaid: TARGET_AMOUNT,
      lessonCount: TARGET_TOTAL_LESSONS
    },
    notes: [String(row.notes || '').trim(), '2026-05-26 修正：J 非黄金课包实付5500，个人课时调整为11课时，售卖课包模板不变'].filter(Boolean).join('；'),
    updatedAt: now
  };
}

function normalizeEntitlement(row = {}, now = new Date().toISOString()) {
  if (String(row.studentId || '') !== STUDENT_ID || String(row.studentName || '').trim() !== STUDENT_NAME) {
    throw new Error('课包余额不是目标学员 J，停止');
  }
  return {
    ...row,
    totalLessons: TARGET_TOTAL_LESSONS,
    usedLessons: TARGET_USED_LESSONS,
    remainingLessons: TARGET_REMAINING_LESSONS,
    status: 'active',
    packageId: TARGET_PACKAGE_ID,
    packageName: TARGET_PACKAGE_NAME,
    priceSourceId: TARGET_PACKAGE_ID,
    priceSourceName: TARGET_PACKAGE_NAME,
    packagePrice: 5000,
    packageTimeBand: TARGET_TIME_BAND,
    timeBand: TARGET_TIME_BAND,
    dailyTimeWindows: TARGET_DAILY_TIME_WINDOWS,
    notes: [String(row.notes || '').trim(), '2026-05-26 修正：J 非黄金课包个人课时调整为11课时，已扣9.5，剩余1.5'].filter(Boolean).join('；'),
    updatedAt: now
  };
}

function buildPlan(data, now = new Date().toISOString()) {
  const purchase = data.purchases.find(row => row.id === PURCHASE_ID);
  const entitlement = data.entitlements.find(row => row.id === ENTITLEMENT_ID);
  if (!purchase) throw new Error('找不到 J 购买记录');
  if (!entitlement) throw new Error('找不到 J 课包余额');
  const nextPurchase = normalizePurchase(purchase, now);
  const nextEntitlement = normalizeEntitlement(entitlement, now);
  return {
    putPurchases: [nextPurchase],
    putEntitlements: [nextEntitlement],
    putIndexes: [{ id: STUDENT_ID, studentId: STUDENT_ID, entitlementIds: [ENTITLEMENT_ID], updatedAt: now }]
  };
}

function printPlan(plan, target) {
  console.log(JSON.stringify({
    target,
    putPurchases: plan.putPurchases.map(row => ({
      id: row.id,
      studentName: row.studentName,
      finalAmount: row.finalAmount,
      amountPaid: row.amountPaid,
      packageLessons: row.packageLessons,
      totalLessons: row.totalLessons,
      packageId: row.packageId,
      packageName: row.packageName,
      timeBand: row.timeBand || row.packageTimeBand
    })),
    putEntitlements: plan.putEntitlements.map(row => ({
      id: row.id,
      studentName: row.studentName,
      totalLessons: row.totalLessons,
      usedLessons: row.usedLessons,
      remainingLessons: row.remainingLessons,
      status: row.status,
      packageId: row.packageId,
      packageName: row.packageName,
      timeBand: row.timeBand
    })),
    putIndexes: plan.putIndexes
  }, null, 2));
}

async function run(argv = process.argv.slice(2)) {
  const write = argv.includes('--write');
  loadEnv();
  const target = await assertProductionTarget();
  const client = createClientFromEnv();
  const data = {
    purchases: await scanTable(client, TABLES.purchases),
    entitlements: await scanTable(client, TABLES.entitlements)
  };
  const plan = buildPlan(data);
  printPlan(plan, target);
  if (!write) return plan;
  for (const row of plan.putPurchases) await putRow(client, TABLES.purchases, row);
  for (const row of plan.putEntitlements) await putRow(client, TABLES.entitlements, row);
  for (const row of plan.putIndexes) await putRow(client, TABLES.activeEntitlementIndex, row);
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
  STUDENT_NAME,
  PURCHASE_ID,
  ENTITLEMENT_ID,
  TARGET_TOTAL_LESSONS,
  TARGET_USED_LESSONS,
  TARGET_REMAINING_LESSONS,
  TARGET_AMOUNT,
  buildPlan,
  run
};
