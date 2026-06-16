#!/usr/bin/env node

const dotenv = require('dotenv');
const {
  createClientFromEnv,
  scanTable,
  putRow,
  createTableIfMissing
} = require('./lib/staging-data-store');
const { assertProductionWriteTarget } = require('./lib/production-write-guard');

const PROD_DIAG_URL = 'https://www.flowtennis.cn/api/diag';
const TABLES = {
  entitlements: 'ft_entitlements',
  activeEntitlementIndex: 'ft_student_active_entitlement_index'
};

function loadEnv() {
  dotenv.config();
}

async function assertProductionTarget() {
  return assertProductionWriteTarget({ diagUrl: PROD_DIAG_URL });
}

function parseLessonValue(value) {
  const n = Number(value);
  return Number.isFinite(n) ? n : 0;
}

function isActiveEntitlement(row) {
  if (!String(row?.studentId || '').trim()) return false;
  if (String(row.status || 'active') !== 'active') return false;
  return parseLessonValue(row.remainingLessons) > 0;
}

function buildIndexRows(entitlements = [], now = new Date().toISOString()) {
  const grouped = new Map();
  for (const row of entitlements) {
    const studentId = String(row?.studentId || '').trim();
    if (!studentId || !isActiveEntitlement(row)) continue;
    if (!grouped.has(studentId)) grouped.set(studentId, []);
    grouped.get(studentId).push(String(row.id || '').trim());
  }
  return [...grouped.entries()]
    .sort(([left], [right]) => left.localeCompare(right))
    .map(([studentId, entitlementIds]) => ({
      id: studentId,
      studentId,
      entitlementIds: entitlementIds.filter(Boolean),
      updatedAt: now
    }));
}

function printPlan({ target, tableStatus, entitlements, indexRows }) {
  console.log(JSON.stringify({
    target,
    tableStatus,
    entitlementsScanned: entitlements.length,
    indexRowsToWrite: indexRows.length,
    entitlementLinksToWrite: indexRows.reduce((sum, row) => sum + row.entitlementIds.length, 0)
  }, null, 2));
}

async function run(argv = process.argv.slice(2)) {
  const write = argv.includes('--write');
  loadEnv();
  const target = await assertProductionTarget();
  const client = createClientFromEnv();
  const tableStatus = await createTableIfMissing(client, TABLES.activeEntitlementIndex);
  const entitlements = await scanTable(client, TABLES.entitlements);
  const indexRows = buildIndexRows(entitlements);
  printPlan({ target, tableStatus, entitlements, indexRows });
  if (!write) return { target, tableStatus, entitlements, indexRows };
  for (const row of indexRows) await putRow(client, TABLES.activeEntitlementIndex, row);
  console.log('写入完成');
  return { target, tableStatus, entitlements, indexRows };
}

if (require.main === module) {
  run().catch((err) => {
    console.error(err);
    process.exit(1);
  });
}

module.exports = {
  TABLES,
  buildIndexRows,
  run
};
