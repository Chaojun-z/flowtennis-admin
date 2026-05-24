#!/usr/bin/env node

const {
  TABLES,
  IMPORT_TAG,
  IMPORT_PREFIX,
  loadEnv,
  assertProductionTarget,
  csvRows,
  SOURCE_FILES,
  money,
  scanImportTables,
  createClientFromEnv
} = require('./lib/mabao-import-core');

const EXPECTED_FINANCE = {
  cash: 1056018,
  recognized: 510982.33,
  deferred: 545035.67,
  packageIncome: 670142,
  packageRecognized: 225593.33,
  storedValueIncome: 123000,
  storedValueConsumed: 22513,
  courtIncome: 262876,
  courtRecognized: 262876
};

function imported(row) {
  return String(row.id || '').startsWith(IMPORT_PREFIX) || String(row.seedTag || '') === IMPORT_TAG || String(row.importBatchId || '').startsWith(IMPORT_PREFIX);
}

function sum(rows, getter) {
  return Math.round((rows || []).reduce((total, row) => total + money(getter(row)), 0) * 100) / 100;
}

async function fetchFinancePage() {
  const res = await fetch('https://www.flowtennis.cn/api/page-data/finance', { headers: { 'Cache-Control': 'no-cache' } });
  if (!res.ok) throw new Error(`线上财务页接口失败：${res.status}`);
  return res.json();
}

function verifyFinance(data) {
  const overview = data.financeOverviewData?.all || {};
  const actual = {
    cash: money(overview.cash),
    recognized: money(overview.recognized),
    deferred: money(overview.deferred),
    packageIncome: money(overview.packageIncome),
    packageRecognized: money(overview.packageRecognized),
    storedValueIncome: money(overview.storedValueIncome),
    storedValueConsumed: money(overview.storedValueConsumed),
    courtIncome: money(overview.courtIncome || overview.bookingIncome || overview.bookingCash || 0),
    courtRecognized: money(overview.courtRecognized || overview.bookingRecognized || overview.bookingIncome || 0)
  };
  const diffs = Object.keys(EXPECTED_FINANCE)
    .map((key) => ({ key, expected: EXPECTED_FINANCE[key], actual: actual[key], delta: Math.round((actual[key] - EXPECTED_FINANCE[key]) * 100) / 100 }))
    .filter((row) => Math.abs(row.delta) > 0.01);
  return { actual, expected: EXPECTED_FINANCE, diffs };
}

async function main() {
  loadEnv();
  const target = await assertProductionTarget();
  const client = createClientFromEnv();
  const [sourceSchedule, sourceEntitlement, sourceIncome] = [
    csvRows(SOURCE_FILES.schedule),
    csvRows(SOURCE_FILES.entitlement),
    csvRows(SOURCE_FILES.income)
  ];
  const tables = await scanImportTables(client);
  const importedRows = {
    students: tables.students.filter(imported),
    purchases: tables.purchases.filter(imported),
    entitlements: tables.entitlements.filter(imported),
    schedules: tables.schedule.filter(imported),
    ledgers: tables.entitlementLedger.filter(imported),
    courtsWithImportHistory: tables.courts.filter((court) => (Array.isArray(court.history) ? court.history : []).some(imported))
  };
  const finance = verifyFinance(await fetchFinancePage());
  const result = {
    ok: finance.diffs.length === 0,
    target,
    sourceCounts: {
      schedule: sourceSchedule.length,
      entitlement: sourceEntitlement.length,
      income: sourceIncome.length
    },
    importedCounts: {
      students: importedRows.students.length,
      purchases: importedRows.purchases.length,
      entitlements: importedRows.entitlements.length,
      schedules: importedRows.schedules.length,
      ledgers: importedRows.ledgers.length,
      courtsWithImportHistory: importedRows.courtsWithImportHistory.length
    },
    importedFinanceApprox: {
      purchaseCash: sum(importedRows.purchases, (row) => row.amountPaid),
      ledgerLessons: sum(importedRows.ledgers, (row) => Math.abs(Number(row.lessonDelta || 0))),
      courtHistoryCash: sum(
        importedRows.courtsWithImportHistory.flatMap((court) => (Array.isArray(court.history) ? court.history : []).filter(imported)),
        (row) => row.amount
      )
    },
    finance
  };
  console.log(JSON.stringify(result, null, 2));
  if (!result.ok) process.exit(1);
}

if (require.main === module) {
  main().catch((err) => {
    console.error(err && err.stack ? err.stack : String(err));
    process.exit(1);
  });
}

