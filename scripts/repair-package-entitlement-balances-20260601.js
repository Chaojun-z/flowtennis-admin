#!/usr/bin/env node

const fs = require('fs');
const dotenv = require('dotenv');
const {
  createClientFromEnv,
  scanTable,
  putRow,
  deleteRow
} = require('./lib/staging-data-store');

const PROD_DIAG_URL = 'https://www.flowtennis.cn/api/diag';
const TABLES = {
  entitlements: 'ft_entitlements',
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
  if (!args.reportPath) throw new Error('缺少 --report <dry-run-json>');
  return args;
}

function loadReport(reportPath) {
  const report = JSON.parse(fs.readFileSync(reportPath, 'utf8'));
  if (!Array.isArray(report.rows)) throw new Error('dry-run 文件缺少 rows');
  return report;
}

async function assertProductionTarget(env = process.env) {
  const res = await fetch(PROD_DIAG_URL, { headers: { 'Cache-Control': 'no-cache' } });
  if (!res.ok) throw new Error(`线上 diag 失败：${res.status}`);
  const diag = await res.json();
  const onlineEndpoint = String(diag.TS_ENDPOINT || diag.env?.TS_ENDPOINT || '').trim().replace(/\/+$/, '');
  const onlineInstance = String(diag.TS_INSTANCE || diag.env?.TS_INSTANCE || '').trim();
  const localEndpoint = String(env.TS_ENDPOINT || '').trim().replace(/\/+$/, '');
  const localInstance = String(env.TS_INSTANCE || env.TARGET_TS_INSTANCE || '').trim();
  if (!onlineEndpoint || !onlineInstance) throw new Error('线上 diag 未返回 TableStore 目标');
  if (localEndpoint !== onlineEndpoint || localInstance !== onlineInstance) {
    throw new Error(`停止写入：本地目标 ${localEndpoint} / ${localInstance} 与线上 ${onlineEndpoint} / ${onlineInstance} 不一致`);
  }
  return { onlineEndpoint, onlineInstance, localEndpoint, localInstance };
}

function isActiveEntitlement(row) {
  if (!String(row?.studentId || '').trim()) return false;
  if (String(row.status || 'active') !== 'active') return false;
  return roundLesson(row.remainingLessons) > 0;
}

function buildAffectedIndexRows(entitlements = [], affectedStudentIds = [], now = new Date().toISOString()) {
  const affected = new Set(affectedStudentIds.map((id) => String(id || '').trim()).filter(Boolean));
  const grouped = new Map([...affected].map((studentId) => [studentId, []]));
  for (const row of entitlements) {
    const studentId = String(row?.studentId || '').trim();
    if (!affected.has(studentId) || !isActiveEntitlement(row)) continue;
    grouped.get(studentId).push(String(row.id || '').trim());
  }
  return [...grouped.entries()].map(([studentId, entitlementIds]) => ({
    id: studentId,
    studentId,
    entitlementIds: entitlementIds.filter(Boolean),
    updatedAt: now
  }));
}

function buildRepairPlan({ reportRows = [], entitlements = [], now = new Date().toISOString(), operationId = `finance-entitlement-balance-repair-20260601-${Date.now()}` } = {}) {
  const entitlementById = new Map(entitlements.map((row) => [String(row.id || ''), row]));
  const updates = [];
  const skipped = [];
  const blockers = [];
  const repairRows = reportRows.filter((row) => row.canFixByEntitlementOnly);

  for (const row of repairRows) {
    const current = entitlementById.get(String(row.entitlementId || ''));
    if (!current) {
      blockers.push({ entitlementId: row.entitlementId, reason: '权益账户不存在' });
      continue;
    }
    const currentRemaining = roundLesson(current.remainingLessons);
    const currentUsed = roundLesson(current.usedLessons);
    if (currentRemaining !== roundLesson(row.currentRemainingLessons) || currentUsed !== roundLesson(row.currentUsedLessons)) {
      blockers.push({
        entitlementId: row.entitlementId,
        reason: '当前权益账户数值与 dry-run 不一致',
        expected: { usedLessons: row.currentUsedLessons, remainingLessons: row.currentRemainingLessons },
        actual: { usedLessons: currentUsed, remainingLessons: currentRemaining }
      });
      continue;
    }
    const targetRemaining = roundLesson(row.targetRemainingLessons);
    const targetUsed = roundLesson(row.targetUsedLessons);
    const nextStatus = targetRemaining > 0 ? 'active' : 'depleted';
    updates.push({
      before: current,
      after: {
        ...current,
        usedLessons: targetUsed,
        remainingLessons: targetRemaining,
        status: nextStatus,
        updatedAt: now,
        repairReason: '2026-06-01 课包权益余额与消耗流水净额对齐',
        operationId,
        batchId: `batch-${operationId}`,
        operationType: 'package-entitlement-balance-repair',
        operationAt: now,
        operationBy: 'Codex'
      },
      dryRunRow: row
    });
  }

  for (const row of reportRows.filter((item) => !item.canFixByEntitlementOnly)) {
    skipped.push({
      entitlementId: row.entitlementId,
      studentName: row.studentName,
      reason: 'dry-run 标记为需要先核对/修正消耗流水'
    });
  }

  const patchedEntitlements = entitlements.map((row) => updates.find((item) => item.after.id === row.id)?.after || row);
  const affectedStudentIds = updates.map((item) => item.after.studentId);
  const indexRows = buildAffectedIndexRows(patchedEntitlements, affectedStudentIds, now);

  return { updates, skipped, blockers, indexRows, operationId };
}

async function run(argv = process.argv.slice(2), deps = {}) {
  const args = parseArgs(argv);
  dotenv.config();
  const report = loadReport(args.reportPath);
  const target = deps.assertProductionTarget ? await deps.assertProductionTarget(process.env) : await assertProductionTarget(process.env);
  const client = deps.client || createClientFromEnv();
  const scan = deps.scanTable || scanTable;
  const writeRow = deps.putRow || putRow;
  const removeRow = deps.deleteRow || deleteRow;
  const now = deps.now || new Date().toISOString();
  const entitlements = await scan(client, TABLES.entitlements);
  const plan = buildRepairPlan({ reportRows: report.rows, entitlements, now });
  const summary = {
    target,
    reportPath: args.reportPath,
    write: args.write,
    updates: plan.updates.length,
    skipped: plan.skipped.length,
    blockers: plan.blockers.length,
    indexRows: plan.indexRows.length,
    operationId: plan.operationId
  };
  console.log(JSON.stringify({ summary, blockers: plan.blockers, skipped: plan.skipped }, null, 2));
  if (plan.blockers.length) throw new Error('存在阻塞项，停止写入');
  if (!args.write) return { ...plan, target };
  for (const item of plan.updates) await writeRow(client, TABLES.entitlements, item.after);
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

module.exports = {
  TABLES,
  buildRepairPlan,
  buildAffectedIndexRows,
  parseArgs,
  run
};
