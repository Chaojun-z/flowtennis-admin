#!/usr/bin/env node

const fs = require('fs');
const dotenv = require('dotenv');
const {
  createClientFromEnv,
  getRow,
  putRow
} = require('./lib/staging-data-store');
const { assertProductionWriteTarget } = require('./lib/production-write-guard');

const PROD_DIAG_URL = 'https://www.flowtennis.cn/api/diag';
const STUDENT_ID = 'import-student-dffc7714-0c0f-e3a5-ab90-a9cfbad91d24';
const SECOND_ENTITLEMENT_ID = 'private_lesson_csv_import_20260527:entitlement:dfbd9725d511';
const LATEST_ENTITLEMENT_ID = '813625cb-d22f-4717-958a-bfff7a856d69';

const MOVE_TO_SECOND = new Set([
  '78cae87d-0400-4ac0-b670-71a768647669',
  '0667c0e2-281e-49e8-88ae-2c11d33d3753',
  'b82014ae-3082-45d9-bfc7-ac30c0372637',
  '6920161e-6b77-4617-bd08-c8d44f9de968',
  '73d353f3-f8ad-492f-a12f-54efd0351ec7'
]);

const MOVE_TO_LATEST = new Set([
  '040fbd48-9797-46e4-b0ab-403c2e6bd656',
  '2ddc4163-8b23-413d-8148-76bf9f517aef'
]);

const TABLES = {
  entitlements: 'ft_entitlements',
  entitlementLedger: 'ft_entitlement_ledger',
  schedule: 'ft_schedule',
  activeEntitlementIndex: 'ft_student_active_entitlement_index'
};

function roundLesson(value) {
  return Math.round((Number(value) || 0) * 100) / 100;
}

function parseArgs(argv = process.argv.slice(2)) {
  const args = { write: false, reportPath: '' };
  for (let i = 0; i < argv.length; i += 1) {
    const item = argv[i];
    if (item === '--write') args.write = true;
    else if (item === '--report') args.reportPath = argv[++i] || '';
  }
  return args;
}

async function assertProductionTarget(env = process.env) {
  return assertProductionWriteTarget({ env, diagUrl: PROD_DIAG_URL });
}

function isActiveEntitlement(row) {
  if (!String(row?.studentId || '').trim()) return false;
  if (String(row.status || 'active') !== 'active') return false;
  return roundLesson(row.remainingLessons) > 0;
}

function targetEntitlementIdForLedger(row) {
  const id = String(row?.id || '');
  if (MOVE_TO_SECOND.has(id)) return SECOND_ENTITLEMENT_ID;
  if (MOVE_TO_LATEST.has(id)) return LATEST_ENTITLEMENT_ID;
  return String(row?.entitlementId || '');
}

function buildRepairPlan({ entitlements = [], entitlementLedger = [], schedule = [], now = new Date().toISOString(), operationId = `lianer-entitlement-allocation-20260725-${Date.now()}` } = {}) {
  const entitlementById = new Map(entitlements.map((row) => [String(row.id || ''), row]));
  const scheduleById = new Map(schedule.map((row) => [String(row.id || ''), row]));
  const blockers = [];
  const ledgerUpdates = [];
  const scheduleUpdates = [];

  const second = entitlementById.get(SECOND_ENTITLEMENT_ID);
  const latest = entitlementById.get(LATEST_ENTITLEMENT_ID);
  if (!second) blockers.push({ type: 'entitlement', id: SECOND_ENTITLEMENT_ID, reason: '第二课包不存在' });
  if (!latest) blockers.push({ type: 'entitlement', id: LATEST_ENTITLEMENT_ID, reason: '最新课包不存在' });
  if (second && (roundLesson(second.usedLessons) !== 7 || roundLesson(second.remainingLessons) !== 3)) {
    blockers.push({ type: 'entitlement', id: SECOND_ENTITLEMENT_ID, reason: '第二课包当前余额已变化', actual: { usedLessons: second.usedLessons, remainingLessons: second.remainingLessons } });
  }
  if (latest && (roundLesson(latest.usedLessons) !== 6 || roundLesson(latest.remainingLessons) !== 4)) {
    blockers.push({ type: 'entitlement', id: LATEST_ENTITLEMENT_ID, reason: '最新课包当前余额已变化', actual: { usedLessons: latest.usedLessons, remainingLessons: latest.remainingLessons } });
  }

  const studentLedger = entitlementLedger.filter((row) => String(row.studentId || '') === STUDENT_ID);
  const expectedMoveIds = new Set([...MOVE_TO_SECOND, ...MOVE_TO_LATEST]);
  for (const ledgerId of expectedMoveIds) {
    const row = studentLedger.find((item) => String(item.id || '') === ledgerId);
    if (!row) {
      blockers.push({ type: 'ledger', id: ledgerId, reason: '目标消课流水不存在' });
      continue;
    }
    const targetEntitlementId = targetEntitlementIdForLedger(row);
    const targetEntitlement = entitlementById.get(targetEntitlementId);
    if (!targetEntitlement) {
      blockers.push({ type: 'ledger', id: ledgerId, reason: '目标课包不存在', targetEntitlementId });
      continue;
    }
    if (String(row.entitlementId || '') === targetEntitlementId) continue;
    const nextLedger = {
      ...row,
      entitlementId: targetEntitlementId,
      purchaseId: targetEntitlement.purchaseId || row.purchaseId || '',
      packageName: targetEntitlement.packageName || row.packageName || '',
      updatedAt: now,
      repairReason: '莲儿课包按实际上课顺序重新归属',
      operationId,
      batchId: `batch-${operationId}`,
      operationType: 'entitlement-allocation-repair',
      operationAt: now,
      operationBy: 'Codex'
    };
    ledgerUpdates.push({ before: row, after: nextLedger });

    const scheduleId = String(row.scheduleId || '');
    const currentSchedule = scheduleById.get(scheduleId);
    if (!currentSchedule) {
      blockers.push({ type: 'schedule', id: scheduleId, reason: '消课流水对应排课不存在', ledgerId });
      continue;
    }
    scheduleUpdates.push({
      before: currentSchedule,
      after: {
        ...currentSchedule,
        entitlementId: targetEntitlementId,
        entitlementIds: [targetEntitlementId],
        purchaseId: targetEntitlement.purchaseId || currentSchedule.purchaseId || '',
        packageName: targetEntitlement.packageName || currentSchedule.packageName || '',
        updatedAt: now,
        repairReason: '莲儿课包按实际上课顺序重新归属',
        operationId,
        batchId: `batch-${operationId}`,
        operationType: 'entitlement-allocation-repair',
        operationAt: now,
        operationBy: 'Codex'
      }
    });
  }

  const entitlementUpdates = [SECOND_ENTITLEMENT_ID, LATEST_ENTITLEMENT_ID].map((id) => {
    const before = entitlementById.get(id);
    if (!before) return null;
    const usedLessons = id === SECOND_ENTITLEMENT_ID ? 10 : 3;
    const remainingLessons = id === SECOND_ENTITLEMENT_ID ? 0 : 7;
    return {
      before,
      after: {
        ...before,
        usedLessons,
        remainingLessons,
        status: remainingLessons > 0 ? 'active' : 'depleted',
        updatedAt: now,
        repairReason: '莲儿课包按实际上课顺序重新归属',
        operationId,
        batchId: `batch-${operationId}`,
        operationType: 'entitlement-allocation-repair',
        operationAt: now,
        operationBy: 'Codex'
      }
    };
  }).filter(Boolean);

  const patchedEntitlements = entitlements.map((row) => entitlementUpdates.find((item) => item.after.id === row.id)?.after || row);
  const activeIds = patchedEntitlements
    .filter((row) => String(row.studentId || '') === STUDENT_ID && isActiveEntitlement(row))
    .map((row) => String(row.id || ''))
    .filter(Boolean);
  const activeEntitlementIndex = {
    id: STUDENT_ID,
    studentId: STUDENT_ID,
    entitlementIds: activeIds,
    updatedAt: now
  };

  return {
    blockers,
    ledgerUpdates,
    scheduleUpdates,
    entitlementUpdates,
    activeEntitlementIndex,
    backups: {
      entitlementLedger: ledgerUpdates.map((item) => item.before),
      schedule: scheduleUpdates.map((item) => item.before),
      entitlements: entitlementUpdates.map((item) => item.before)
    },
    operationId
  };
}

async function run(argv = process.argv.slice(2), deps = {}) {
  const args = parseArgs(argv);
  dotenv.config();
  const target = deps.assertProductionTarget ? await deps.assertProductionTarget(process.env) : await assertProductionTarget(process.env);
  const client = deps.client || createClientFromEnv();
  const readRow = deps.getRow || getRow;
  const writeRow = deps.putRow || putRow;
  const now = deps.now || new Date().toISOString();
  const targetLedgerIds = [...MOVE_TO_SECOND, ...MOVE_TO_LATEST];
  const [second, latest, ...entitlementLedger] = await Promise.all([
    readRow(client, TABLES.entitlements, SECOND_ENTITLEMENT_ID),
    readRow(client, TABLES.entitlements, LATEST_ENTITLEMENT_ID),
    ...targetLedgerIds.map((id) => readRow(client, TABLES.entitlementLedger, id))
  ]);
  const scheduleIds = entitlementLedger.map((row) => String(row?.scheduleId || '')).filter(Boolean);
  const schedule = (await Promise.all(scheduleIds.map((id) => readRow(client, TABLES.schedule, id)))).filter(Boolean);
  const entitlements = [second, latest].filter(Boolean);
  const plan = buildRepairPlan({ entitlements, entitlementLedger, schedule, now });
  const report = {
    target,
    write: args.write,
    summary: {
      ledgerUpdates: plan.ledgerUpdates.length,
      scheduleUpdates: plan.scheduleUpdates.length,
      entitlementUpdates: plan.entitlementUpdates.length,
      blockers: plan.blockers.length,
      activeEntitlementIds: plan.activeEntitlementIndex.entitlementIds,
      operationId: plan.operationId
    },
    blockers: plan.blockers,
    backups: plan.backups,
    planned: {
      entitlementLedger: plan.ledgerUpdates.map((item) => item.after),
      schedule: plan.scheduleUpdates.map((item) => item.after),
      entitlements: plan.entitlementUpdates.map((item) => item.after),
      activeEntitlementIndex: plan.activeEntitlementIndex
    }
  };
  if (args.reportPath) fs.writeFileSync(args.reportPath, `${JSON.stringify(report, null, 2)}\n`);
  console.log(JSON.stringify(report.summary, null, 2));
  if (plan.blockers.length) throw new Error('存在阻塞项，停止写入');
  if (!args.write) return { ...plan, target, report };

  for (const item of plan.ledgerUpdates) await writeRow(client, TABLES.entitlementLedger, item.after);
  for (const item of plan.scheduleUpdates) await writeRow(client, TABLES.schedule, item.after);
  for (const item of plan.entitlementUpdates) await writeRow(client, TABLES.entitlements, item.after);
  await writeRow(client, TABLES.activeEntitlementIndex, plan.activeEntitlementIndex);
  console.log('写入完成');
  return { ...plan, target, report };
}

if (require.main === module) {
  run().catch((err) => {
    console.error(err);
    process.exit(1);
  });
}

module.exports = {
  TABLES,
  STUDENT_ID,
  SECOND_ENTITLEMENT_ID,
  LATEST_ENTITLEMENT_ID,
  MOVE_TO_SECOND,
  MOVE_TO_LATEST,
  buildRepairPlan,
  parseArgs,
  run
};
