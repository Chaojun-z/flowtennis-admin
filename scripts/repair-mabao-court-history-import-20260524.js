#!/usr/bin/env node

const {
  TABLES,
  SOURCE_FILES,
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
} = require('./lib/mabao-import-core');

function parseArgs(argv) {
  return {
    write: argv.includes('--write'),
    dryRun: argv.includes('--dry-run') || !argv.includes('--write')
  };
}

function shouldCreateCourtHistory(row) {
  if (likelyCourse(row)) return false;
  return money(row['实收/核销']) > 0;
}

function imported(row) {
  return String(row.id || '').startsWith(IMPORT_PREFIX) || String(row.seedTag || '') === IMPORT_TAG || String(row.importBatchId || '').startsWith(IMPORT_PREFIX);
}

async function main() {
  const args = parseArgs(process.argv.slice(2));
  loadEnv();
  const target = await assertProductionTarget();
  const client = createClientFromEnv();
  const tables = await scanImportTables(client);
  const sourceRows = csvRows(SOURCE_FILES.income)
    .map((row, idx) => ({ ...row, __rowNo: Number(row['原表行号'] || idx + 2) }))
    .filter(shouldCreateCourtHistory);
  const beforeHistory = tables.courts.flatMap((court) => normalizeCourtHistory(court.history).filter(imported));
  const beforeKeys = new Set(beforeHistory.map(courtHistoryImportKey));
  const rowsToWrite = buildMissingCourtHistoryWriteRows(sourceRows, tables.courts);
  const afterHistory = rowsToWrite.flatMap((court) => normalizeCourtHistory(court.history).filter(imported));
  const missingHistory = afterHistory.filter((row) => !beforeKeys.has(courtHistoryImportKey(row)));
  const summary = {
    ok: true,
    mode: args.dryRun ? 'dry-run-only' : 'write',
    target,
    expectedCourtHistory: sourceRows.length,
    existingCourtHistory: beforeHistory.length,
    missingCourtHistory: missingHistory.length,
    missingAmount: money(missingHistory.reduce((total, row) => total + money(row.amount), 0)),
    courtWrites: rowsToWrite.length,
    newCourts: rowsToWrite.filter((court) => !tables.courts.some((item) => String(item.id) === String(court.id))).length
  };

  if (args.dryRun) {
    console.log(JSON.stringify(summary, null, 2));
    return;
  }

  for (const row of rowsToWrite) await putRow(client, TABLES.courts, row);
  console.log(JSON.stringify(summary, null, 2));
}

if (require.main === module) {
  main().catch((err) => {
    console.error(err && err.stack ? err.stack : String(err));
    process.exit(1);
  });
}
