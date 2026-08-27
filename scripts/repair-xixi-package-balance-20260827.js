#!/usr/bin/env node

const fs = require('fs');
const path = require('path');
const { loadRuntimeEnv } = require('./lib/runtime-env');
const { createClientFromEnv, getRow, putRow } = require('./lib/staging-data-store');
const {
  parseWriteFlags,
  assertProductionWriteTarget,
  assertProductionWriteTrace
} = require('./lib/production-write-guard');

const ROOT = path.join(__dirname, '..');
const OPERATION_ID = 'repair-xixi-package-balance-20260827';
const BATCH_ID = `batch-${OPERATION_ID}`;
const REPORT_DIR = path.join(ROOT, 'offline-reports');
const TABLES = {
  entitlements: 'ft_entitlements',
  studentSummary: 'ft_student_teaching_summary'
};

const IDS = {
  studentId: '2b65be17-4190-4b2f-9dfe-5988d4652cc6',
  entitlementId: '9cb986a8-35f5-4724-bd57-908084f838e1'
};

const EXPECTED = {
  completedLessons: 9,
  totalLessons: 10
};

function text(value) {
  return String(value ?? '').trim();
}

function trace(row, now, reason) {
  return {
    ...row,
    updatedAt: now,
    operationId: OPERATION_ID,
    batchId: BATCH_ID,
    operationType: OPERATION_ID,
    operationAt: now,
    operationBy: 'Codex',
    repairReason: reason
  };
}

function updateTeachingPackageRows(rows = [], now, reason) {
  return (Array.isArray(rows) ? rows : []).map(row => ({
    ...row,
    usedLessons: EXPECTED.completedLessons,
    remainingLessons: EXPECTED.totalLessons - EXPECTED.completedLessons,
    statusText: '正常'
  })).map(row => trace(row, now, reason));
}

function mkdirp(dir) {
  fs.mkdirSync(dir, { recursive: true });
}

async function run(argv = process.argv.slice(2)) {
  loadRuntimeEnv({ appEnv: 'production', entry: 'repair-xixi-package-balance-20260827' });
  const args = parseWriteFlags(argv);
  const reportPath = path.join(REPORT_DIR, `${OPERATION_ID}-${args.write ? 'write' : 'dry-run'}.json`);
  assertProductionWriteTrace({ operationId: OPERATION_ID, batchId: BATCH_ID, reportPath });
  const target = await assertProductionWriteTarget();
  const client = createClientFromEnv();

  const [entitlement, summary] = await Promise.all([
    getRow(client, TABLES.entitlements, IDS.entitlementId),
    getRow(client, TABLES.studentSummary, IDS.studentId)
  ]);

  if (!entitlement) throw new Error(`找不到曦曦🐳课包：${IDS.entitlementId}`);
  if (!summary) throw new Error(`找不到曦曦🐳摘要：${IDS.studentId}`);

  const before = {
    studentName: text(summary.displayName || summary.name || '曦曦🐳'),
    completedLessons: Number(summary.completedLessons) || 0,
    entitlement: {
      id: text(entitlement.id),
      totalLessons: Number(entitlement.totalLessons) || 0,
      usedLessons: Number(entitlement.usedLessons) || 0,
      remainingLessons: Number(entitlement.remainingLessons) || 0,
      status: text(entitlement.status || '')
    }
  };

  if (before.completedLessons !== EXPECTED.completedLessons) {
    throw new Error(`曦曦🐳摘要已变化，当前 completedLessons=${before.completedLessons}，不符合预期 ${EXPECTED.completedLessons}`);
  }
  if (before.entitlement.totalLessons !== EXPECTED.totalLessons) {
    throw new Error(`曦曦🐳课包总课时异常，当前 totalLessons=${before.entitlement.totalLessons}，不符合预期 ${EXPECTED.totalLessons}`);
  }

  const next = trace({
    ...entitlement,
    usedLessons: EXPECTED.completedLessons,
    remainingLessons: EXPECTED.totalLessons - EXPECTED.completedLessons,
    status: 'active'
  }, new Date().toISOString(), '曦曦🐳课包已用课时回调到真实完成课时 9');

  const summaryNow = new Date().toISOString();
  const summaryReason = '曦曦🐳摘要课包余额与真实消课回正';
  const updatedPackageRows = updateTeachingPackageRows(summary.packageListRows || [], summaryNow, summaryReason);
  const updatedDetailRows = updateTeachingPackageRows(summary.detailPackageOrderRows || [], summaryNow, summaryReason);
  const summaryNext = trace({
    ...summary,
    completedLessons: EXPECTED.completedLessons,
    packageListRows: updatedPackageRows,
    detailPackageOrderRows: updatedDetailRows,
    packageBalanceRemaining: 1,
    packageBalanceTotal: EXPECTED.totalLessons,
    packageBalanceText: '1/10',
    packageBalancePercent: 10,
    packagePurchaseDate: text(summary.packagePurchaseDate),
    detailPackageBalanceRemaining: 1,
    detailPackageBalanceTotal: EXPECTED.totalLessons,
    detailPackageBalanceText: '1/10',
    detailPackageBalancePercent: 10,
    detailPackageProgressText: '1/10',
    packageListText: updatedPackageRows.map(row => `${text(row.packageName)} ${Number(row.remainingLessons) || 0}/${Number(row.totalLessons) || 0}`).join('\n') || '1/10',
    packageStatusLabel: '课包即将耗尽',
    studentStatusLabel: '课包活跃中'
  }, summaryNow, summaryReason);

  const report = {
    target,
    operationId: OPERATION_ID,
    batchId: BATCH_ID,
    reportPath,
    dryRun: !args.write,
    before,
    after: {
      studentName: before.studentName,
      completedLessons: before.completedLessons,
      entitlement: {
        id: text(next.id),
        totalLessons: Number(next.totalLessons) || 0,
        usedLessons: Number(next.usedLessons) || 0,
        remainingLessons: Number(next.remainingLessons) || 0,
        status: text(next.status || '')
      },
      summary: {
        id: text(summaryNext.id),
        completedLessons: Number(summaryNext.completedLessons) || 0,
        packageBalanceRemaining: Number(summaryNext.packageBalanceRemaining) || 0,
        packageBalanceText: text(summaryNext.packageBalanceText || ''),
        detailPackageBalanceRemaining: Number(summaryNext.detailPackageBalanceRemaining) || 0,
        detailPackageBalanceText: text(summaryNext.detailPackageBalanceText || ''),
        packageStatusLabel: text(summaryNext.packageStatusLabel || ''),
        studentStatusLabel: text(summaryNext.studentStatusLabel || ''),
        packageListRows: Array.isArray(summaryNext.packageListRows) ? summaryNext.packageListRows.map(row => ({
          packageName: text(row.packageName),
          usedLessons: Number(row.usedLessons) || 0,
          remainingLessons: Number(row.remainingLessons) || 0,
          statusText: text(row.statusText || '')
        })) : [],
        detailPackageOrderRows: Array.isArray(summaryNext.detailPackageOrderRows) ? summaryNext.detailPackageOrderRows.map(row => ({
          packageName: text(row.packageName),
          usedLessons: Number(row.usedLessons) || 0,
          remainingLessons: Number(row.remainingLessons) || 0,
          statusText: text(row.statusText || '')
        })) : []
      }
    }
  };

  if (!args.write) {
    console.log(JSON.stringify(report, null, 2));
    return report;
  }

  await putRow(client, TABLES.entitlements, next);
  await putRow(client, TABLES.studentSummary, summaryNext);
  const written = await getRow(client, TABLES.entitlements, IDS.entitlementId);
  const writtenSummary = await getRow(client, TABLES.studentSummary, IDS.studentId);
  report.after.entitlement = {
    id: text(written?.id),
    totalLessons: Number(written?.totalLessons) || 0,
    usedLessons: Number(written?.usedLessons) || 0,
    remainingLessons: Number(written?.remainingLessons) || 0,
    status: text(written?.status || '')
  };
  report.after.summary = {
    id: text(writtenSummary?.id),
    completedLessons: Number(writtenSummary?.completedLessons) || 0,
    packageBalanceRemaining: Number(writtenSummary?.packageBalanceRemaining) || 0,
    packageBalanceText: text(writtenSummary?.packageBalanceText || ''),
    detailPackageBalanceRemaining: Number(writtenSummary?.detailPackageBalanceRemaining) || 0,
    detailPackageBalanceText: text(writtenSummary?.detailPackageBalanceText || ''),
    packageStatusLabel: text(writtenSummary?.packageStatusLabel || ''),
    studentStatusLabel: text(writtenSummary?.studentStatusLabel || ''),
    packageListRows: Array.isArray(writtenSummary?.packageListRows) ? writtenSummary.packageListRows.map(row => ({
      packageName: text(row.packageName),
      usedLessons: Number(row.usedLessons) || 0,
      remainingLessons: Number(row.remainingLessons) || 0,
      statusText: text(row.statusText || '')
    })) : [],
    detailPackageOrderRows: Array.isArray(writtenSummary?.detailPackageOrderRows) ? writtenSummary.detailPackageOrderRows.map(row => ({
      packageName: text(row.packageName),
      usedLessons: Number(row.usedLessons) || 0,
      remainingLessons: Number(row.remainingLessons) || 0,
      statusText: text(row.statusText || '')
    })) : []
  };

  mkdirp(REPORT_DIR);
  fs.writeFileSync(reportPath, `${JSON.stringify(report, null, 2)}\n`);
  console.log(JSON.stringify(report, null, 2));
  return report;
}

if (require.main === module) {
  run().catch((err) => {
    console.error(err);
    process.exit(1);
  });
}

module.exports = {
  IDS,
  EXPECTED,
  run
};
