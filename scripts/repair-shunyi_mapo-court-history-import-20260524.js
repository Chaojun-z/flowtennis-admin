#!/usr/bin/env node

const fs = require('fs');
const path = require('path');
const {
  TABLES,
  SOURCE_FILES,
  REPORT_DIR,
  loadEnv,
  assertProductionTarget,
  csvRows,
  money,
  likelyCourse,
  createClientFromEnv,
  scanImportTables,
  buildMissingCourtHistoryWriteRows,
  putRow,
  courtHistoryImportKey,
  normalizeCourtHistory,
  IMPORT_TAG,
  IMPORT_PREFIX
} = require('./lib/shunyi_mapo-import-core');

function parseArgs(argv) {
  return {
    write: argv.includes('--write'),
    dryRun: argv.includes('--dry-run') || !argv.includes('--write')
  };
}

function makeOperationTrace(now = new Date().toISOString()) {
  const stamp = String(now).replace(/[^0-9]/g, '').slice(0, 17) || String(Date.now());
  const operationId = `shunyi_mapo-court-history-repair-20260524-${stamp}`;
  return { operationId, batchId: `batch-${operationId}` };
}

function traceRow(row, trace, now = new Date().toISOString()) {
  if (!row) return row;
  return {
    ...row,
    operationId: trace.operationId,
    batchId: trace.batchId,
    updatedAt: row.updatedAt || now
  };
}

function traceCourtRow(row, trace, now = new Date().toISOString()) {
  const traced = traceRow(row, trace, now);
  return {
    ...traced,
    history: Array.isArray(row.history)
      ? row.history.map((item) => traceRow(item, trace, now))
      : row.history
  };
}

function writeReport(report, reportPath) {
  fs.mkdirSync(path.dirname(reportPath), { recursive: true });
  fs.writeFileSync(reportPath, `${JSON.stringify(report, null, 2)}\n`, 'utf8');
}

function shouldCreateCourtHistory(row) {
  if (likelyCourse(row)) return false;
  return money(row['实收/核销']) > 0;
}

function imported(row) {
  return String(row.id || '').startsWith(IMPORT_PREFIX) || String(row.seedTag || '') === IMPORT_TAG || String(row.importBatchId || '').startsWith(IMPORT_PREFIX);
}

async function run(argv = process.argv.slice(2), deps = {}) {
  const args = parseArgs(argv);
  const now = deps.now || new Date().toISOString();
  const trace = deps.trace || makeOperationTrace(now);
  const reportDir = deps.reportDir || path.join(REPORT_DIR, 'court-history-repair-reports');
  const reportPath = deps.reportPath || path.join(reportDir, `${trace.operationId}.json`);
  const loadEnvironment = deps.loadEnv || loadEnv;
  const assertTarget = deps.assertProductionTarget || assertProductionTarget;
  const createClient = deps.createClientFromEnv || createClientFromEnv;
  const scanTables = deps.scanImportTables || scanImportTables;
  const loadSourceRows = deps.loadSourceRows || (() => csvRows(SOURCE_FILES.income)
    .map((row, idx) => ({ ...row, __rowNo: Number(row['原表行号'] || idx + 2) }))
    .filter(shouldCreateCourtHistory));
  const writeRow = deps.writeRow || putRow;

  loadEnvironment();
  const target = await assertTarget();
  const client = createClient();
  const tables = await scanTables(client);
  const sourceRows = loadSourceRows();
  const beforeHistory = tables.courts.flatMap((court) => normalizeCourtHistory(court.history).filter(imported));
  const beforeKeys = new Set(beforeHistory.map(courtHistoryImportKey));
  const rowsToWrite = buildMissingCourtHistoryWriteRows(sourceRows, tables.courts, { now }).map((row) => traceCourtRow(row, trace, now));
  const afterHistory = rowsToWrite.flatMap((court) => normalizeCourtHistory(court.history).filter(imported));
  const missingHistory = afterHistory.filter((row) => !beforeKeys.has(courtHistoryImportKey(row)));
  const report = {
    generatedAt: new Date().toISOString(),
    mode: args.dryRun ? 'dry-run' : 'write',
    operationId: trace.operationId,
    batchId: trace.batchId,
    target,
    reportPath,
    tables: {
      [TABLES.courts]: rowsToWrite.length,
      'ft_courts.history': missingHistory.length
    }
  };
  const summary = {
    ok: true,
    mode: args.dryRun ? 'dry-run-only' : 'write',
    operationId: trace.operationId,
    batchId: trace.batchId,
    target,
    expectedCourtHistory: sourceRows.length,
    existingCourtHistory: beforeHistory.length,
    missingCourtHistory: missingHistory.length,
    missingAmount: money(missingHistory.reduce((total, row) => total + money(row.amount), 0)),
    courtWrites: rowsToWrite.length,
    newCourts: rowsToWrite.filter((court) => !tables.courts.some((item) => String(item.id) === String(court.id))).length,
    report
  };
  writeReport(report, reportPath);

  if (args.dryRun) {
    console.log(JSON.stringify(summary, null, 2));
    return { summary, report, reportPath };
  }

  for (const row of rowsToWrite) await writeRow(client, TABLES.courts, row);
  console.log(JSON.stringify(summary, null, 2));
  return { summary, report, reportPath };
}

async function main() {
  await run(process.argv.slice(2));
}

if (require.main === module) {
  main().catch((err) => {
    console.error(err && err.stack ? err.stack : String(err));
    process.exit(1);
  });
}

module.exports = {
  parseArgs,
  makeOperationTrace,
  traceRow,
  traceCourtRow,
  run
};
