#!/usr/bin/env node

const dotenv = require('dotenv');
const {
  createClientFromEnv,
  scanTable,
  putRow,
  deleteRow
} = require('./lib/staging-data-store');

const PROD_DIAG_URL = 'https://www.flowtennis.cn/api/diag';
const TABLES = {
  purchases: 'ft_purchases',
  entitlements: 'ft_entitlements',
  entitlementLedger: 'ft_entitlement_ledger',
  schedule: 'ft_schedule',
  activeEntitlementIndex: 'ft_student_active_entitlement_index'
};

const IDS = {
  putaoEnt: 'private_lesson_csv_import_20260519_BATCH1_10_LIVE_FIX:entitlement:葡萄',
  putaoPurchase: 'private_lesson_csv_import_20260519_BATCH1_10_LIVE_FIX:purchase:葡萄',
  jEnt: 'seed-entitlement-020',
  jPurchase: 'seed-purchase-020',
  mengEnt: 'private_lesson_csv_import_20260519_BATCH1_10_LIVE_FIX:entitlement:朦朦',
  songxiEnt: 'private_lesson_csv_import_20260519_BATCH4_FINAL_LIVE-entitlement-bcd86003-abcc-63e7-480c-95e2279cf1f8',
  songxiPurchase: 'private_lesson_csv_import_20260519_BATCH4_FINAL_LIVE-purchase-bcd86003-abcc-63e7-480c-95e2279cf1f8',
  mishaEnt: 'private_lesson_csv_import_20260519_BATCH2_15_LIVE:entitlement:misha:initial:2026-01-06',
  mishaPurchase: 'private_lesson_csv_import_20260519_BATCH2_15_LIVE:purchase:misha:initial:2026-01-06',
  huangEnt: 'private_lesson_csv_import_20260519_BATCH2_15_LIVE:entitlement:黄总:initial:2026-01-06',
  huangPurchase: 'private_lesson_csv_import_20260519_BATCH2_15_LIVE:purchase:黄总:initial:2026-01-06',
  wjEnt10: 'private_lesson_csv_import_20260519_BATCH3_15_LIVE-entitlement-706341e4-ac48-8d19-c0d4-659558d3a46d',
  wjPurchase10: 'private_lesson_csv_import_20260519_BATCH3_15_LIVE-purchase-706341e4-ac48-8d19-c0d4-659558d3a46d',
  wjFriendEnt: 'private_lesson_csv_import_20260519_BATCH3_15_LIVE-entitlement-ce457b5c-65b2-d5d7-f45f-bd5f5e393cc2',
  wjFriendPurchase: 'private_lesson_csv_import_20260519_BATCH3_15_LIVE-purchase-ce457b5c-65b2-d5d7-f45f-bd5f5e393cc2'
};

const DELETE_LEDGER_IDS = [
  'private_lesson_csv_import_20260519_BATCH1_10_LIVE_FIX:ledger:葡萄:2026-05',
  '3a25ddfd-52fc-4272-87f6-9b05f639fa89',
  '571d7ac6-dd07-43ad-a39b-9038a969f37a',
  '861bb362-3c13-49c5-9b24-7a52fe2737fb',
  'private_lesson_csv_import_20260519_BATCH3_15_LIVE-ledger-a9fafdba-6341-e6ae-cd53-dd459cd091d3',
  'private_lesson_csv_import_20260519_BATCH3_15_LIVE-ledger-101352a9-785b-97d1-a26c-155f2f4e4a45'
];

const DELETE_SCHEDULE_IDS = [
  'c4ca51f9-609e-4645-9b1d-97217830ae0f',
  'private_lesson_csv_import_20260524-schedule-1943-朦朦',
  'private_lesson_csv_import_20260524-schedule-1944-j',
  '8725972c-08ab-4cc1-85ca-d9a7db99d944',
  '0c218f60-041f-474e-97d6-d9f5356301b3'
];

const LESSON_COUNT_FIXES = {
  'private_lesson_csv_import_20260527:schedule:63f7c27d28aa': 1.5,
  'private_lesson_csv_import_20260527:schedule:94dd93bd3c0c': 1.5,
  'private_lesson_csv_import_20260527:schedule:5613583e1774': 1.5,
  'private_lesson_csv_import_20260527:schedule:c19450bf7bab': 1.5,
  'private_lesson_csv_import_20260527:schedule:eee68628d59e': 1.5,
  'private_lesson_csv_import_20260527:schedule:5dce18484ade': 1,
  'private_lesson_csv_import_20260527:schedule:80c001c5a670': 1.5,
  'private_lesson_csv_import_20260527:schedule:2ce1e7efd741': 1.5,
  'private_lesson_csv_import_20260527:schedule:aed9e382b35f': 1.5,
  'private_lesson_csv_import_20260527:schedule:c878fdc881ff': 1.5,
  'private_lesson_csv_import_20260527:schedule:8a30bfbb4c5a': 1.5
};

const WJ_SHARED_WJ_PACKAGE_SCHEDULES = [
  'private_lesson_csv_import_20260527:schedule:ecc2bf166fd6',
  'private_lesson_csv_import_20260527:schedule:cb0385926ae7',
  'private_lesson_csv_import_20260527:schedule:85c0572ec0bb',
  'private_lesson_csv_import_20260527:schedule:7516ee0a9fed',
  'private_lesson_csv_import_20260527:schedule:d704f82cb0ad'
];

const WJ_FRIEND_PACKAGE_SCHEDULES = [
  'private_lesson_csv_import_20260527:schedule:4f8c3a4d4b30',
  'private_lesson_csv_import_20260527:schedule:436513ba5113',
  'private_lesson_csv_import_20260527:schedule:78f9c41a2299',
  'private_lesson_csv_import_20260527:schedule:455da551d229',
  'private_lesson_csv_import_20260527:schedule:61bcf94ce176',
  'private_lesson_csv_import_20260527:schedule:008fccd9ac75',
  'private_lesson_csv_import_20260527:schedule:56ad6659fd9a',
  'private_lesson_csv_import_20260527:schedule:8ce3d4835db0'
];

function roundLesson(value) {
  return Math.round((Number(value) || 0) * 100) / 100;
}

async function assertProductionTarget(env = process.env) {
  const res = await fetch(PROD_DIAG_URL, { headers: { 'Cache-Control': 'no-cache' } });
  if (!res.ok) throw new Error(`线上 diag 失败：${res.status}`);
  const diag = await res.json();
  const onlineEndpoint = String(diag.TS_ENDPOINT || diag.env?.TS_ENDPOINT || '').trim().replace(/\/+$/, '');
  const onlineInstance = String(diag.TS_INSTANCE || diag.env?.TS_INSTANCE || '').trim();
  const localEndpoint = String(env.TS_ENDPOINT || '').trim().replace(/\/+$/, '');
  const localInstance = String(env.TS_INSTANCE || env.TARGET_TS_INSTANCE || '').trim();
  if (onlineEndpoint !== localEndpoint || onlineInstance !== localInstance) {
    throw new Error(`停止写入：本地目标 ${localEndpoint} / ${localInstance} 与线上 ${onlineEndpoint} / ${onlineInstance} 不一致`);
  }
  return { onlineEndpoint, onlineInstance, localEndpoint, localInstance };
}

function mapById(rows = []) {
  return new Map(rows.map((row) => [String(row.id || ''), row]));
}

function touch(row, now, operationId) {
  return {
    ...row,
    updatedAt: now,
    operationId,
    batchId: `batch-${operationId}`,
    operationType: 'package-ledger-repair',
    operationAt: now,
    operationBy: 'Codex',
    repairReason: '2026-06-01 按用户核对表修正课包消耗、排课和跨人课包引用'
  };
}

function updateEntitlement(row, { totalLessons, usedLessons, remainingLessons }, now, operationId) {
  return touch({
    ...row,
    totalLessons,
    usedLessons,
    remainingLessons,
    status: remainingLessons > 0 ? 'active' : 'depleted',
    notes: `${row.notes || ''}；2026-06-01 修正：总课时 ${totalLessons}，已用 ${usedLessons}，剩余 ${remainingLessons}`
  }, now, operationId);
}

function updatePurchaseLessons(row, lessons, now, operationId) {
  return touch({
    ...row,
    packageLessons: lessons,
    totalLessons: lessons,
    notes: `${row.notes || ''}；2026-06-01 修正：权益总课时 ${lessons}`
  }, now, operationId);
}

function updateLedger(row, patch, now, operationId) {
  return touch({ ...row, ...patch }, now, operationId);
}

function updateSchedule(row, patch, now, operationId) {
  return touch({ ...row, ...patch }, now, operationId);
}

function activeIndexRows(entitlements = [], studentIds = [], now) {
  const wanted = new Set(studentIds.filter(Boolean));
  return [...wanted].map((studentId) => ({
    id: studentId,
    studentId,
    entitlementIds: entitlements
      .filter((row) => row.studentId === studentId && String(row.status || 'active') === 'active' && roundLesson(row.remainingLessons) > 0)
      .map((row) => row.id),
    updatedAt: now
  }));
}

function requireRows(byId, ids, label, blockers) {
  ids.forEach((id) => {
    if (!byId.has(id)) blockers.push(`${label} 不存在：${id}`);
  });
}

function buildPlan(data, { now = new Date().toISOString(), operationId = `package-ledger-repair-20260601-${Date.now()}` } = {}) {
  const purchases = mapById(data.purchases);
  const entitlements = mapById(data.entitlements);
  const ledgers = mapById(data.entitlementLedger);
  const schedules = mapById(data.schedule);
  const blockers = [];
  const putPurchases = [];
  const putEntitlements = [];
  const putLedgers = [];
  const putSchedules = [];
  const deleteLedgers = [];
  const deleteSchedules = [];

  requireRows(schedules, Object.keys(LESSON_COUNT_FIXES), '待改课时排课', blockers);
  requireRows(ledgers, Object.keys(LESSON_COUNT_FIXES).map((id) => id.replace(':schedule:', ':ledger:')), '待改课时流水', blockers);
  requireRows(schedules, WJ_SHARED_WJ_PACKAGE_SCHEDULES, 'W.Jing 共享排课', blockers);
  requireRows(schedules, WJ_FRIEND_PACKAGE_SCHEDULES, 'W.Jing朋友课包排课', blockers);
  if (blockers.length) return { blockers };

  DELETE_LEDGER_IDS.forEach((id) => {
    if (ledgers.has(id)) deleteLedgers.push(id);
  });
  DELETE_SCHEDULE_IDS.forEach((id) => {
    if (schedules.has(id)) deleteSchedules.push(id);
  });

  Object.entries(LESSON_COUNT_FIXES).forEach(([scheduleId, count]) => {
    const ledgerId = scheduleId.replace(':schedule:', ':ledger:');
    putSchedules.push(updateSchedule(schedules.get(scheduleId), { lessonCount: count }, now, operationId));
    putLedgers.push(updateLedger(ledgers.get(ledgerId), { lessonDelta: -count }, now, operationId));
  });

  putEntitlements.push(updateEntitlement(entitlements.get(IDS.jEnt), { totalLessons: 11, usedLessons: 11, remainingLessons: 0 }, now, operationId));
  putPurchases.push(updatePurchaseLessons(purchases.get(IDS.jPurchase), 11, now, operationId));
  putSchedules.push(updateSchedule({
    ...schedules.get('private_lesson_csv_import_20260527:schedule:8a30bfbb4c5a'),
    id: 'repair-20260601-schedule-j-20260523-1130',
    startTime: '2026-05-23 11:30',
    endTime: '2026-05-23 13:00',
    lessonCount: 1.5,
    notes: '2026-06-01 按核对表补录：10和11，余额0/11'
  }, {}, now, operationId));
  putLedgers.push(updateLedger({
    ...ledgers.get('private_lesson_csv_import_20260527:ledger:8a30bfbb4c5a'),
    id: 'repair-20260601-ledger-j-20260523-1130',
    scheduleId: 'repair-20260601-schedule-j-20260523-1130',
    lessonDelta: -1.5,
    relatedDate: '2026-05-23',
    sourceDate: '2026-05-23',
    sourceTimeBand: '11点30-13点',
    notes: '2026-06-01 按核对表补录：10和11，余额0/11'
  }, {}, now, operationId));

  putEntitlements.push(updateEntitlement(entitlements.get(IDS.mishaEnt), { totalLessons: 12, usedLessons: 11, remainingLessons: 1 }, now, operationId));
  putEntitlements.push(updateEntitlement(entitlements.get(IDS.huangEnt), { totalLessons: 12, usedLessons: 9, remainingLessons: 3 }, now, operationId));
  putPurchases.push(updatePurchaseLessons(purchases.get(IDS.mishaPurchase), 12, now, operationId));
  putPurchases.push(updatePurchaseLessons(purchases.get(IDS.huangPurchase), 12, now, operationId));

  [
    ['private_lesson_csv_import_20260527:schedule:5e3b3b1bfc25', '1v2：黄总上课，使用 misha 课包'],
    ['private_lesson_csv_import_20260527:schedule:db91c4fd5d3d', '1v2：黄总上课，使用 misha 课包']
  ].forEach(([id, note]) => putSchedules.push(updateSchedule(schedules.get(id), {
    studentName: 'misha、黄总',
    studentIds: ['seed-student-002', 'seed-student-003'],
    notes: `${schedules.get(id).notes || ''}；${note}`
  }, now, operationId)));
  putSchedules.push(updateSchedule(schedules.get('private_lesson_csv_import_20260527:schedule:e74352625afb'), {
    studentName: 'misha、黄总',
    studentIds: ['seed-student-002', 'seed-student-003'],
    notes: `${schedules.get('private_lesson_csv_import_20260527:schedule:e74352625afb').notes || ''}；1v2：misha 上课，使用黄总课包`
  }, now, operationId));
  putSchedules.push(updateSchedule(schedules.get('private_lesson_csv_import_20260527:schedule:dc89ec5d617d'), {
    studentName: 'misha、黄总',
    studentIds: ['seed-student-002', 'seed-student-003'],
    entitlementId: IDS.huangEnt,
    entitlementIds: [IDS.huangEnt],
    purchaseId: IDS.huangPurchase,
    notes: `${schedules.get('private_lesson_csv_import_20260527:schedule:dc89ec5d617d').notes || ''}；1v2：misha 上课，使用黄总课包`
  }, now, operationId));
  putLedgers.push(updateLedger(ledgers.get('private_lesson_csv_import_20260527:ledger:dc89ec5d617d'), {
    entitlementId: IDS.huangEnt,
    purchaseId: IDS.huangPurchase,
    studentId: 'seed-student-003',
    notes: `${ledgers.get('private_lesson_csv_import_20260527:ledger:dc89ec5d617d').notes || ''}；1v2：misha 上课，使用黄总课包`
  }, now, operationId));

  WJ_SHARED_WJ_PACKAGE_SCHEDULES.forEach((id) => {
    putSchedules.push(updateSchedule(schedules.get(id), {
      studentName: 'W.Jing、W.Jing朋友',
      studentIds: ['seed-student-038', 'seed-student-039'],
      notes: `${schedules.get(id).notes || ''}；1v2：W.Jing朋友上课，使用 W.Jing 课包`
    }, now, operationId));
  });
  WJ_FRIEND_PACKAGE_SCHEDULES.forEach((id) => {
    const ledgerId = id.replace(':schedule:', ':ledger:');
    putSchedules.push(updateSchedule(schedules.get(id), {
      studentName: 'W.Jing、W.Jing朋友',
      studentIds: ['seed-student-038', 'seed-student-039'],
      entitlementId: IDS.wjFriendEnt,
      entitlementIds: [IDS.wjFriendEnt],
      purchaseId: IDS.wjFriendPurchase,
      notes: `${schedules.get(id).notes || ''}；1v2：使用 W.Jing朋友课包`
    }, now, operationId));
    putLedgers.push(updateLedger(ledgers.get(ledgerId), {
      entitlementId: IDS.wjFriendEnt,
      purchaseId: IDS.wjFriendPurchase,
      studentId: 'seed-student-039',
      notes: `${ledgers.get(ledgerId).notes || ''}；1v2：使用 W.Jing朋友课包`
    }, now, operationId));
  });
  putEntitlements.push(updateEntitlement(entitlements.get(IDS.wjFriendEnt), { totalLessons: 10, usedLessons: 10, remainingLessons: 0 }, now, operationId));

  putSchedules.push(updateSchedule(schedules.get('c2435fed-7909-4ebe-849d-4eeead19f8d5'), {
    courseType: '体验课',
    experienceType: '私教体验课',
    venue: '2号场',
    lessonCount: 1
  }, now, operationId));
  putLedgers.push(updateLedger(ledgers.get('2cd544cf-6517-45a2-abae-c5982db98c86'), {
    relatedDate: '2026-05-27',
    sourceDate: '2026-05-27',
    sourceTimeBand: '12点-13点',
    sourceVenue: '顺义马坡2号场',
    coach: '朝珺',
    lessonDelta: -1
  }, now, operationId));

  const patchedEntitlements = data.entitlements.map((row) => putEntitlements.find((item) => item.id === row.id) || row);
  const indexRows = activeIndexRows(patchedEntitlements, [...new Set(putEntitlements.map((row) => row.studentId))], now);

  return {
    blockers,
    putPurchases,
    putEntitlements,
    putLedgers,
    putSchedules,
    deleteLedgers,
    deleteSchedules,
    indexRows,
    operationId
  };
}

async function run(argv = process.argv.slice(2), deps = {}) {
  const write = argv.includes('--write');
  dotenv.config();
  const target = deps.assertProductionTarget ? await deps.assertProductionTarget(process.env) : await assertProductionTarget(process.env);
  const client = deps.client || createClientFromEnv();
  const scan = deps.scanTable || scanTable;
  const writeRow = deps.putRow || putRow;
  const removeRow = deps.deleteRow || deleteRow;
  const data = {
    purchases: await scan(client, TABLES.purchases),
    entitlements: await scan(client, TABLES.entitlements),
    entitlementLedger: await scan(client, TABLES.entitlementLedger),
    schedule: await scan(client, TABLES.schedule)
  };
  const plan = buildPlan(data);
  const summary = {
    target,
    write,
    blockers: plan.blockers.length,
    putPurchases: plan.putPurchases?.length || 0,
    putEntitlements: plan.putEntitlements?.length || 0,
    putLedgers: plan.putLedgers?.length || 0,
    putSchedules: plan.putSchedules?.length || 0,
    deleteLedgers: plan.deleteLedgers?.length || 0,
    deleteSchedules: plan.deleteSchedules?.length || 0,
    indexRows: plan.indexRows?.length || 0,
    operationId: plan.operationId
  };
  console.log(JSON.stringify({ summary, blockers: plan.blockers }, null, 2));
  if (plan.blockers.length) throw new Error('存在阻塞项，停止写入');
  if (!write) return { ...plan, target };
  for (const row of plan.putPurchases) await writeRow(client, TABLES.purchases, row);
  for (const row of plan.putEntitlements) await writeRow(client, TABLES.entitlements, row);
  for (const row of plan.putSchedules) await writeRow(client, TABLES.schedule, row);
  for (const row of plan.putLedgers) await writeRow(client, TABLES.entitlementLedger, row);
  for (const id of plan.deleteLedgers) await removeRow(client, TABLES.entitlementLedger, id);
  for (const id of plan.deleteSchedules) await removeRow(client, TABLES.schedule, id);
  for (const row of plan.indexRows) {
    if (row.entitlementIds.length) await writeRow(client, TABLES.activeEntitlementIndex, row);
    else await removeRow(client, TABLES.activeEntitlementIndex, row.id);
  }
  console.log('写入完成');
  return { ...plan, target };
}

if (require.main === module) {
  run().catch((err) => {
    console.error(err);
    process.exit(1);
  });
}

module.exports = { IDS, buildPlan, run };
