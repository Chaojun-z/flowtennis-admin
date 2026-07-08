const fs = require('fs');
const path = require('path');
const { loadRuntimeEnv, resolveAppEnv } = require('./lib/runtime-env');
const { createClientFromEnv, scanTable } = require('./lib/staging-data-store');
const { buildBusinessDailyReportSnapshot } = require('./lib/business-daily-report');
const { _test: apiTest } = require('../api/index.js');

const root = path.join(__dirname, '..');
const defaultOutputPath = path.join(root, 'standalone-services', 'business-daily-report-data.json');

function readArg(name, fallback = '') {
  const token = process.argv.find((item) => item.startsWith(`${name}=`));
  return token ? token.slice(name.length + 1) : fallback;
}

function chinaDateKey(input = new Date()) {
  const parts = Object.fromEntries(new Intl.DateTimeFormat('en-CA', {
    timeZone: 'Asia/Shanghai',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit'
  }).formatToParts(input).filter((item) => item.type !== 'literal').map((item) => [item.type, item.value]));
  return `${parts.year}-${parts.month}-${parts.day}`;
}

function writeSnapshotFile(outPath, snapshot) {
  fs.mkdirSync(path.dirname(outPath), { recursive: true });
  if (fs.existsSync(outPath)) fs.chmodSync(outPath, 0o644);
  fs.writeFileSync(outPath, JSON.stringify(snapshot, null, 2));
  fs.chmodSync(outPath, 0o444);
}

async function scanOptional(client, tableName) {
  return scanTable(client, tableName).catch(() => []);
}

async function main() {
  const appEnv = resolveAppEnv(process.env);
  loadRuntimeEnv({ appEnv, entry: 'export-business-daily-report-json' });
  const targetDate = readArg('--date', chinaDateKey(new Date()));
  const outPath = path.resolve(readArg('--out', defaultOutputPath));
  const client = createClientFromEnv(process.env);
  const [
    campuses,
    students,
    purchases,
    entitlements,
    entitlementLedger,
    courts,
    membershipOrders,
    membershipAccounts,
    schedule,
    users
  ] = await Promise.all([
    scanOptional(client, 'ft_campuses'),
    scanOptional(client, 'ft_students'),
    scanOptional(client, 'ft_purchases'),
    scanOptional(client, 'ft_entitlements'),
    scanOptional(client, 'ft_entitlement_ledger'),
    scanOptional(client, 'ft_courts'),
    scanOptional(client, 'ft_membership_orders'),
    scanOptional(client, 'ft_membership_accounts'),
    scanOptional(client, 'ft_schedule'),
    scanOptional(client, 'ft_users')
  ]);
  const financeSnapshot = apiTest.buildFinancePageSnapshot({
    campuses,
    students,
    purchases,
    entitlements,
    entitlementLedger,
    courts,
    membershipOrders,
    membershipAccounts,
    schedule,
    users
  });
  const snapshot = buildBusinessDailyReportSnapshot({
    targetDate,
    generatedAt: new Date().toISOString(),
    campuses,
    financeNormalizedRows: financeSnapshot.financeNormalizedRows,
    entitlementLedger,
    scheduleRows: schedule
  });
  writeSnapshotFile(outPath, snapshot);
  console.log(JSON.stringify({
    ok: true,
    outPath,
    today: snapshot.today,
    cash: snapshot.overall.cash.today,
    recognized: snapshot.overall.recognized.today,
    campusRows: snapshot.campusRows.length
  }, null, 2));
}

main().catch((err) => {
  console.error(err && err.stack ? err.stack : String(err));
  process.exit(1);
});
