#!/usr/bin/env node

const fs = require('fs');
const path = require('path');
const { loadRuntimeEnv } = require('./lib/runtime-env');
const {
  createClientFromEnv,
  scanTable,
  putRow,
  deleteRow,
  createTableIfMissing
} = require('./lib/staging-data-store');
const {
  parseWriteFlags,
  assertProductionWriteTarget,
  assertProductionWriteTrace
} = require('./lib/production-write-guard');
const { SCHEDULE_CONFLICT_INDEX_READY_ID } = require('../server/schedule-conflict-index');

const ROOT = path.join(__dirname, '..');
const OPERATION_ID = 'cancel-confirmed-remaining-dirty-schedules-20260817';
const BATCH_ID = `batch-${OPERATION_ID}`;
const REPORT_DIR = path.join(ROOT, 'offline-reports');

const TABLES = {
  schedule: 'ft_schedule',
  conflictIndex: 'ft_schedule_conflict_index'
};

const CANCEL_SCHEDULE_IDS = new Set([
  'cxe-202602-thirdparty-schedule-12286c878a4eff58',
  'cxe-202602-thirdparty-schedule-290489419809c479',
  'cxe-202602-thirdparty-schedule-423d102ff29d0cc8',
  'cxe-202602-thirdparty-schedule-5160af23c005394c',
  'cxe-202602-thirdparty-schedule-6905faf81885d951',
  'cxe-202602-thirdparty-schedule-6a9e62fe7f725c66',
  'cxe-202602-thirdparty-schedule-6e29cc7b11dc6dbf',
  'cxe-202602-thirdparty-schedule-844cb90dbb9df40d',
  'cxe-202602-thirdparty-schedule-c857ff810a509951',
  'cxe-202602-thirdparty-schedule-ec6c12cf9e87539b',
  'cxe-202602-thirdparty-schedule-ef51eaed815d3685',
  'cxe-202602-thirdparty-schedule-f07deb91dda8f575',
  'cxe-202602-thirdparty-schedule-f932afef69ec2237',
  'cxe-20260715-0731-schedule-66a0077d4fe2048d',
  'cxe-thirdparty-202604-schedule-330bb830fac8',
  'cxe-thirdparty-202604-schedule-7def554fe8e5',
  'cxe-thirdparty-202604-schedule-99634fd8f87b',
  'cxe-thirdparty-202604-schedule-a0f3dd2e96f0',
  'cxe-thirdparty-202604-schedule-f43fbad65d9f',
  'cxe-thirdparty-202604-schedule-f6c32ea4a8d0',
  'cxe-thirdparty-202606-schedule-2c2e05e7c1a5',
  'cxe-thirdparty-202606-schedule-464bb994ae1c',
  'cxe-thirdparty-202606-schedule-6fe8dd618405',
  'cxe-thirdparty-202606-schedule-7466f324231a',
  'cxe-thirdparty-202606-schedule-80af25f561ff',
  'cxe-thirdparty-202606-schedule-a24372bbdaa0',
  'cxe-thirdparty-202606-schedule-a53e9f33e583',
  'cxe-thirdparty-202606-schedule-abdaf95644b4',
  'cxe-thirdparty-202606-schedule-b2318d2fa9bf',
  'cxe-thirdparty-202606-schedule-e44e651c8075',
  'cxe-thirdparty-202606-schedule-ffac1b582929'
]);

function text(value) {
  return String(value ?? '').trim();
}

function active(row) {
  return row && text(row.status || '已排课') !== '已取消';
}

function trace(row, now) {
  return {
    ...row,
    status: '已取消',
    state: '已取消',
    systemStatus: '已取消',
    confirmStatus: '已取消',
    cancelReason: '历史脏排课修复：用户确认空学员/亲友备注/多人课占场类取消系统排课，仅保留订场/占场',
    updatedAt: now,
    operationId: OPERATION_ID,
    batchId: BATCH_ID,
    operationType: OPERATION_ID,
    operationAt: now,
    operationBy: 'Codex',
    repairReason: '用户确认：剩余空学员、朋友备注、多人课/团课风险排课取消系统排课'
  };
}

function buildPlan({ schedules, conflictIndex, now }) {
  const scheduleById = new Map(schedules.map(row => [text(row.id), row]));
  const updates = [];
  const skipped = [];
  for (const id of CANCEL_SCHEDULE_IDS) {
    const before = scheduleById.get(id);
    if (!active(before)) {
      skipped.push({ id, reason: '排课不存在或已取消' });
      continue;
    }
    updates.push({ id, before, after: trace(before, now) });
  }
  const affectedIds = new Set(updates.map(item => item.id));
  const staleIndexIds = (conflictIndex || [])
    .filter(row => affectedIds.has(text(row.scheduleId)))
    .map(row => text(row.id))
    .filter(id => id && id !== SCHEDULE_CONFLICT_INDEX_READY_ID);
  return { updates, skipped, conflictIndex: { staleIndexIds } };
}

async function retry(label, fn, maxAttempts = 4) {
  let lastError;
  for (let attempt = 1; attempt <= maxAttempts; attempt += 1) {
    try {
      return await Promise.race([
        fn(),
        new Promise((_, reject) => setTimeout(() => reject(new Error(`${label} timeout`)), 15000))
      ]);
    } catch (error) {
      lastError = error;
      if (attempt === maxAttempts) break;
      await new Promise(resolve => setTimeout(resolve, attempt * 800));
    }
  }
  throw new Error(`${label} failed: ${lastError?.message || lastError}`);
}

async function run(argv = process.argv.slice(2)) {
  loadRuntimeEnv({ override: true });
  const args = parseWriteFlags(argv);
  const reportPath = path.join(REPORT_DIR, `${OPERATION_ID}-${args.write ? 'write' : 'dry-run'}.json`);
  assertProductionWriteTrace({ operationId: OPERATION_ID, batchId: BATCH_ID, reportPath });
  const target = await assertProductionWriteTarget();
  const client = createClientFromEnv();
  const [schedules, conflictIndex] = await Promise.all([
    scanTable(client, TABLES.schedule),
    scanTable(client, TABLES.conflictIndex).catch(() => [])
  ]);
  const now = new Date().toISOString();
  const plan = buildPlan({ schedules, conflictIndex, now });
  const output = {
    ok: true,
    mode: args.write ? 'write' : 'dry-run',
    target,
    reportPath,
    operationId: OPERATION_ID,
    batchId: BATCH_ID,
    generatedAt: now,
    requestedCancel: CANCEL_SCHEDULE_IDS.size,
    cancelUpdates: plan.updates.length,
    skipped: plan.skipped.length,
    conflictIndexDeleted: plan.conflictIndex.staleIndexIds.length,
    cancelledSchedules: plan.updates.map(item => ({
      id: item.id,
      startTime: item.before.startTime,
      endTime: item.before.endTime,
      studentName: item.before.studentName,
      coach: item.before.coach,
      venue: item.before.venue,
      courseType: item.before.courseType
    })),
    skippedItems: plan.skipped,
    plan
  };
  fs.mkdirSync(REPORT_DIR, { recursive: true });
  fs.writeFileSync(reportPath, `${JSON.stringify(output, null, 2)}\n`, 'utf8');

  if (args.write) {
    await retry('create conflict index table', () => createTableIfMissing(client, TABLES.conflictIndex));
    for (const item of plan.updates) await retry(`put schedule ${item.id}`, () => putRow(client, TABLES.schedule, item.after));
    for (const id of plan.conflictIndex.staleIndexIds) await retry(`delete conflict index ${id}`, () => deleteRow(client, TABLES.conflictIndex, id));
    await retry('mark conflict index ready', () => putRow(client, TABLES.conflictIndex, {
      id: SCHEDULE_CONFLICT_INDEX_READY_ID,
      ready: true,
      updatedAt: now,
      operationId: OPERATION_ID
    }));
  }

  console.log(JSON.stringify({
    ok: true,
    mode: output.mode,
    reportPath,
    requestedCancel: output.requestedCancel,
    cancelUpdates: output.cancelUpdates,
    skipped: output.skipped,
    conflictIndexDeleted: output.conflictIndexDeleted
  }, null, 2));
}

if (require.main === module) {
  run().catch(error => {
    console.error(error?.stack || String(error));
    process.exit(1);
  });
}

module.exports = { buildPlan, run };
