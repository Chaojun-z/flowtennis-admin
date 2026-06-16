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
  activeIndexes: 'ft_student_active_entitlement_index'
};

const IDS = {
  students: {
    lian: 'import-student-dffc7714-0c0f-e3a5-ab90-a9cfbad91d24',
    xiaotudou: 'seed-student-015',
    zhangBig: 'seed-student-027',
    zhangSmall: 'seed-student-028',
    liqin: 'seed-student-006',
    yaya: 'seed-student-007'
  },
  purchases: {
    lianRenewal: 'private_lesson_csv_import_20260527:purchase:dfbd9725d511',
    xiaotudouRenewal: 'private_lesson_csv_import_20260519_BATCH2_15_LIVE:purchase:小土豆的姐姐:renew:2026-04-18',
    zhangBigInitial: 'private_lesson_csv_import_20260519_BATCH1_10_LIVE_FIX:purchase:张佳良老大',
    zhangBigRenewal: 'private_lesson_csv_import_20260527:purchase:1c5d575626a5',
    zhangSmallInitial: 'private_lesson_csv_import_20260519_BATCH2_15_LIVE:purchase:张佳良老二:initial:2026-03-12',
    zhangSmallRenewal: 'private_lesson_csv_import_20260527:purchase:97d25afebb34',
    liqinInitial: 'private_lesson_csv_import_20260519_BATCH2_15_LIVE:purchase:李嵚:initial:2026-01-15',
    liqinRenewal: 'private_lesson_csv_import_20260519_BATCH2_15_LIVE:purchase:李嵚:renew:2026-03-07',
    yayaFirst: 'private_lesson_csv_import_20260527:purchase:8caf5476031c',
    yayaGold: 'private_lesson_csv_import_20260519_BATCH2_15_LIVE:purchase:丫丫:renew:2026-04-27-gold',
    yayaNonprime: 'private_lesson_csv_import_20260519_BATCH2_15_LIVE:purchase:丫丫:renew:2026-04-27-nonprime'
  },
  entitlements: {
    lianRenewal: 'private_lesson_csv_import_20260527:entitlement:dfbd9725d511',
    xiaotudouRenewal: 'private_lesson_csv_import_20260519_BATCH2_15_LIVE:entitlement:小土豆的姐姐:renew:2026-04-18',
    zhangBigInitial: 'private_lesson_csv_import_20260519_BATCH1_10_LIVE_FIX:entitlement:张佳良老大',
    zhangBigRenewal: 'private_lesson_csv_import_20260527:entitlement:1c5d575626a5',
    zhangSmallInitial: 'private_lesson_csv_import_20260519_BATCH2_15_LIVE:entitlement:张佳良老二:initial:2026-03-12',
    zhangSmallRenewal: 'private_lesson_csv_import_20260527:entitlement:97d25afebb34',
    liqinInitial: 'private_lesson_csv_import_20260519_BATCH2_15_LIVE:entitlement:李嵚:initial:2026-01-15',
    liqinRenewal: 'private_lesson_csv_import_20260519_BATCH2_15_LIVE:entitlement:李嵚:renew:2026-03-07',
    yayaFirst: 'private_lesson_csv_import_20260527:entitlement:8caf5476031c',
    yayaGold: 'private_lesson_csv_import_20260519_BATCH2_15_LIVE:entitlement:丫丫:renew:2026-04-27-gold',
    yayaNonprime: 'private_lesson_csv_import_20260519_BATCH2_15_LIVE:entitlement:丫丫:renew:2026-04-27-nonprime'
  },
  deleteLedger: {
    lianOldMonthly: 'private_lesson_csv_import_20260519_BATCH4_FINAL_LIVE-ledger-83e1fe89-007d-afc5-8ffc-35fe9f28b748',
    xiaotudouFuture: 'private_lesson_csv_import_20260519_BATCH2_15_LIVE:ledger:小土豆的姐姐:2026-05',
    yayaFutureVoided: 'private_lesson_csv_import_20260519_BATCH2_15_LIVE:ledger:丫丫:2026-05',
    yayaMay27: 'private_lesson_csv_import_20260527:ledger:c233cee00632'
  },
  deleteSchedule: {
    lianMay18Duplicate: 'private_lesson_csv_import_20260524-schedule-1989-莲儿（连女士）',
    lianMay22Duplicate: 'private_lesson_csv_import_20260524-schedule-2064-莲儿（连女士）',
    zhangBigMay20Duplicate: 'bd72c25b-dad4-4020-8252-0183040d2e7d',
    zhangBigMay27Duplicate: 'ba95c6da-1fbb-45db-8ae2-f5ffbe9f28f2',
    zhangSmallMay20Duplicate: '8503cda8-7790-477e-8312-70acd513b801',
    liqinMay27Duplicate: 'b12db421-bbab-4d6d-b3a4-e47f7360edf6',
    yayaMay20Duplicate: 'e18d91e9-422f-4ad2-9c7e-0d799d8cdf78',
    yayaMay27: 'private_lesson_csv_import_20260527:schedule:c233cee00632'
  },
  liqinSplitScheduleId: 'private_lesson_csv_import_20260527:schedule:120466842f36',
  liqinInitialSplitLedgerId: 'private_lesson_csv_import_20260527:ledger:120466842f36-initial-split'
};

const ENTITLEMENT_FIXES = [
  [IDS.entitlements.lianRenewal, 10, 0, 10, 'active'],
  [IDS.entitlements.xiaotudouRenewal, 10, 0, 10, 'active'],
  [IDS.entitlements.zhangBigInitial, 10, 10, 0, 'depleted'],
  [IDS.entitlements.zhangBigRenewal, 10, 1, 9, 'active'],
  [IDS.entitlements.zhangSmallInitial, 10, 10, 0, 'depleted'],
  [IDS.entitlements.zhangSmallRenewal, 10, 1, 9, 'active'],
  [IDS.entitlements.liqinInitial, 10, 10, 0, 'depleted'],
  [IDS.entitlements.liqinRenewal, 50, 18, 32, 'active'],
  [IDS.entitlements.yayaFirst, 20, 20, 0, 'depleted'],
  [IDS.entitlements.yayaGold, 20, 13, 7, 'active'],
  [IDS.entitlements.yayaNonprime, 20, 0, 20, 'active']
];

const INDEX_FIXES = [
  [IDS.students.lian, [IDS.entitlements.lianRenewal]],
  [IDS.students.xiaotudou, [IDS.entitlements.xiaotudouRenewal]],
  [IDS.students.zhangBig, [IDS.entitlements.zhangBigRenewal]],
  [IDS.students.zhangSmall, [IDS.entitlements.zhangSmallRenewal]],
  [IDS.students.liqin, [IDS.entitlements.liqinRenewal]],
  [IDS.students.yaya, [IDS.entitlements.yayaGold, IDS.entitlements.yayaNonprime]]
];

const LIQIN_LESSON_UPDATES = [
  ['bf6e7fd22c88', IDS.entitlements.liqinInitial, IDS.purchases.liqinInitial, 1],
  ['114ba845c3ec', IDS.entitlements.liqinInitial, IDS.purchases.liqinInitial, 2],
  ['b005f267ce71', IDS.entitlements.liqinInitial, IDS.purchases.liqinInitial, 1],
  ['1ba22e8d17b1', IDS.entitlements.liqinInitial, IDS.purchases.liqinInitial, 1.5],
  ['19908a6b985f', IDS.entitlements.liqinInitial, IDS.purchases.liqinInitial, 1.5],
  ['fb387415c13d', IDS.entitlements.liqinInitial, IDS.purchases.liqinInitial, 1],
  ['3fd0abd855e6', IDS.entitlements.liqinInitial, IDS.purchases.liqinInitial, 1.5],
  ['120466842f36', IDS.entitlements.liqinRenewal, IDS.purchases.liqinRenewal, 0.5, 1],
  ['486d6ab7ab5b', IDS.entitlements.liqinRenewal, IDS.purchases.liqinRenewal, 1.5],
  ['6694eefd4ea4', IDS.entitlements.liqinRenewal, IDS.purchases.liqinRenewal, 1],
  ['3fb7267aa16d', IDS.entitlements.liqinRenewal, IDS.purchases.liqinRenewal, 1.5],
  ['d245d21c9fba', IDS.entitlements.liqinRenewal, IDS.purchases.liqinRenewal, 1.5],
  ['1f75cd040824', IDS.entitlements.liqinRenewal, IDS.purchases.liqinRenewal, 1],
  ['8e75df85fe9a', IDS.entitlements.liqinRenewal, IDS.purchases.liqinRenewal, 1.5],
  ['6e75b46767cc', IDS.entitlements.liqinRenewal, IDS.purchases.liqinRenewal, 1.5],
  ['34596890d53c', IDS.entitlements.liqinRenewal, IDS.purchases.liqinRenewal, 1],
  ['0288d135eb8a', IDS.entitlements.liqinRenewal, IDS.purchases.liqinRenewal, 1.5],
  ['0c3b0a55f0a0', IDS.entitlements.liqinRenewal, IDS.purchases.liqinRenewal, 1],
  ['108d33d19c91', IDS.entitlements.liqinRenewal, IDS.purchases.liqinRenewal, 1],
  ['2407d6a6f6c0', IDS.entitlements.liqinRenewal, IDS.purchases.liqinRenewal, 1],
  ['3e800e396f9c', IDS.entitlements.liqinRenewal, IDS.purchases.liqinRenewal, 1.5],
  ['6f8fa76b22bb', IDS.entitlements.liqinRenewal, IDS.purchases.liqinRenewal, 1]
].map(([hash, entitlementId, purchaseId, lessonDeltaAbs, scheduleLessonCount]) => ({
  hash,
  ledgerId: `private_lesson_csv_import_20260527:ledger:${hash}`,
  scheduleId: `private_lesson_csv_import_20260527:schedule:${hash}`,
  entitlementId,
  purchaseId,
  lessonDelta: -lessonDeltaAbs,
  scheduleLessonCount: scheduleLessonCount || lessonDeltaAbs
}));

function loadEnv() {
  dotenv.config();
}

async function assertProductionTarget() {
  return assertProductionWriteTarget({ diagUrl: PROD_DIAG_URL });
}

function byId(rows = []) {
  return new Map(rows.map((row) => [row.id, row]));
}

function keepExistingDeleteIds(ids, rows) {
  const existing = byId(rows);
  return ids.filter((id) => existing.has(id));
}

function fixEntitlement(row, totalLessons, usedLessons, remainingLessons, status, now) {
  return {
    ...row,
    totalLessons,
    usedLessons,
    remainingLessons,
    status,
    updatedAt: now
  };
}

function fixLiqinLedger(row, update, now) {
  return {
    ...row,
    id: update.ledgerId,
    studentId: IDS.students.liqin,
    studentName: '李嵚',
    customerName: '李嵚',
    entitlementId: update.entitlementId,
    purchaseId: update.purchaseId,
    lessonDelta: update.lessonDelta,
    updatedAt: now
  };
}

function fixLiqinSchedule(row, update, now) {
  const entitlementIds = update.scheduleId === IDS.liqinSplitScheduleId
    ? [IDS.entitlements.liqinInitial, IDS.entitlements.liqinRenewal]
    : [update.entitlementId];
  return {
    ...row,
    id: update.scheduleId,
    studentIds: [IDS.students.liqin],
    expectedStudentIds: [IDS.students.liqin],
    studentName: '李嵚',
    entitlementId: update.entitlementId,
    entitlementIds,
    purchaseId: update.purchaseId,
    lessonCount: update.scheduleLessonCount,
    updatedAt: now
  };
}

function buildLiqinInitialSplitLedger(ledgerById, now) {
  const base = ledgerById.get('private_lesson_csv_import_20260527:ledger:120466842f36') || {};
  return {
    ...base,
    id: IDS.liqinInitialSplitLedgerId,
    studentId: IDS.students.liqin,
    studentName: '李嵚',
    customerName: '李嵚',
    entitlementId: IDS.entitlements.liqinInitial,
    purchaseId: IDS.purchases.liqinInitial,
    scheduleId: IDS.liqinSplitScheduleId,
    lessonDelta: -0.5,
    recognizedAmount: 200,
    relatedDate: '2026-03-23',
    sourceDate: '2026-03-23',
    notes: `${base.notes || ''}；跨课包拆分：老课包扣0.5`.replace(/^；/, ''),
    updatedAt: now,
    createdAt: base.createdAt || now
  };
}

function buildPlan(data, options = {}) {
  const now = options.now || new Date().toISOString();
  const entitlementById = byId(data.entitlements || []);
  const ledgerById = byId(data.entitlementLedger || []);
  const scheduleById = byId(data.schedule || []);
  const indexById = byId(data.activeIndexes || []);

  const putEntitlements = ENTITLEMENT_FIXES
    .map(([id, total, used, remaining, status]) => {
      const existing = entitlementById.get(id);
      return existing ? fixEntitlement(existing, total, used, remaining, status, now) : null;
    })
    .filter(Boolean);

  const putLedger = LIQIN_LESSON_UPDATES
    .map((update) => {
      const existing = ledgerById.get(update.ledgerId);
      return existing ? fixLiqinLedger(existing, update, now) : null;
    })
    .filter(Boolean);
  putLedger.push(buildLiqinInitialSplitLedger(ledgerById, now));

  const putSchedule = LIQIN_LESSON_UPDATES
    .map((update) => {
      const existing = scheduleById.get(update.scheduleId);
      return existing ? fixLiqinSchedule(existing, update, now) : null;
    })
    .filter(Boolean);

  const putIndexes = INDEX_FIXES.map(([studentId, entitlementIds]) => ({
    ...(indexById.get(studentId) || {}),
    id: studentId,
    studentId,
    entitlementIds,
    updatedAt: now
  }));

  return {
    putEntitlements,
    putLedger,
    putSchedule,
    putIndexes,
    deleteLedger: keepExistingDeleteIds(Object.values(IDS.deleteLedger), data.entitlementLedger || []),
    deleteSchedule: keepExistingDeleteIds(Object.values(IDS.deleteSchedule), data.schedule || [])
  };
}

function summarizePlan(plan, target = null) {
  return {
    target,
    counts: {
      updateEntitlements: plan.putEntitlements.length,
      updateLedger: plan.putLedger.length,
      updateSchedule: plan.putSchedule.length,
      updateActiveIndexes: plan.putIndexes.length,
      deleteLedger: plan.deleteLedger.length,
      deleteSchedule: plan.deleteSchedule.length
    },
    entitlements: plan.putEntitlements.map((row) => ({
      id: row.id,
      studentName: row.studentName,
      totalLessons: row.totalLessons,
      usedLessons: row.usedLessons,
      remainingLessons: row.remainingLessons,
      status: row.status
    })),
    deleteLedger: plan.deleteLedger,
    deleteSchedule: plan.deleteSchedule
  };
}

async function loadData(client) {
  const [purchases, entitlements, entitlementLedger, schedule, activeIndexes] = await Promise.all([
    scanTable(client, TABLES.purchases).catch(() => []),
    scanTable(client, TABLES.entitlements),
    scanTable(client, TABLES.entitlementLedger),
    scanTable(client, TABLES.schedule),
    scanTable(client, TABLES.activeIndexes).catch(() => [])
  ]);
  return { purchases, entitlements, entitlementLedger, schedule, activeIndexes };
}

async function applyPlan(client, plan) {
  for (const row of plan.putEntitlements) await putRow(client, TABLES.entitlements, row);
  for (const row of plan.putSchedule) await putRow(client, TABLES.schedule, row);
  for (const row of plan.putLedger) await putRow(client, TABLES.entitlementLedger, row);
  for (const row of plan.putIndexes) await putRow(client, TABLES.activeIndexes, row);
  for (const id of plan.deleteLedger) await deleteRow(client, TABLES.entitlementLedger, id);
  for (const id of plan.deleteSchedule) await deleteRow(client, TABLES.schedule, id);
}

async function run(argv = process.argv.slice(2)) {
  const write = argv.includes('--write');
  loadEnv();
  const target = write ? await assertProductionTarget() : {
    localEndpoint: process.env.TS_ENDPOINT,
    localInstance: process.env.TS_INSTANCE || process.env.TARGET_TS_INSTANCE,
    mode: 'dry-run'
  };
  const client = createClientFromEnv();
  const data = await loadData(client);
  const plan = buildPlan(data);
  console.log(JSON.stringify(summarizePlan(plan, target), null, 2));
  if (!write) return plan;
  await applyPlan(client, plan);
  console.log('写入完成');
  return plan;
}

if (require.main === module) {
  run().catch((err) => {
    console.error(err);
    process.exit(1);
  });
}

module.exports = {
  IDS,
  LIQIN_LESSON_UPDATES,
  buildPlan,
  summarizePlan,
  run
};
