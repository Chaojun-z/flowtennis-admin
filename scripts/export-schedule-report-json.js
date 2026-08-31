const fs = require('fs');
const path = require('path');
const { loadRuntimeEnv, resolveAppEnv } = require('./lib/runtime-env');
const { createClientFromEnv, scanTable } = require('./lib/staging-data-store');
const { buildNotificationCenterSnapshot, resolveEveningReportTargetDate } = require('./lib/notification-center-export');

const root = path.join(__dirname, '..');
const defaultOutputPath = path.join(root, 'standalone-services', 'daily-report-data.json');

function readArg(name, fallback = '') {
  const token = process.argv.find((item) => item.startsWith(`${name}=`));
  return token ? token.slice(name.length + 1) : fallback;
}

function writeSnapshotFile(outPath, snapshot) {
  fs.mkdirSync(path.dirname(outPath), { recursive: true });
  if (fs.existsSync(outPath)) {
    fs.chmodSync(outPath, 0o644);
  }
  fs.writeFileSync(outPath, JSON.stringify(snapshot, null, 2));
  fs.chmodSync(outPath, 0o444);
}

async function main() {
  const appEnv = resolveAppEnv(process.env);
  loadRuntimeEnv({ appEnv, entry: 'export-schedule-report-json' });
  const targetDate = readArg('--date', resolveEveningReportTargetDate(new Date()));
  const outPath = path.resolve(readArg('--out', defaultOutputPath));
  const client = createClientFromEnv(process.env);
  const [scheduleRows, coaches, campuses] = await Promise.all([
    scanTable(client, 'ft_schedule'),
    scanTable(client, 'ft_coaches').catch(() => []),
    scanTable(client, 'ft_campuses').catch(() => [])
  ]);
  const snapshot = buildNotificationCenterSnapshot({
    scheduleRows,
    coaches,
    campuses,
    targetDate,
    now: new Date(),
    generatedAt: new Date().toISOString()
  });
  writeSnapshotFile(outPath, snapshot);
  console.log(JSON.stringify({
    ok: true,
    outPath,
    today: snapshot.today,
    tomorrow: snapshot.tomorrow,
    todayLessons: snapshot.todayStats.totalLessons,
    tomorrowLessons: snapshot.tomorrowStats.totalLessons
  }, null, 2));
}

main().catch((err) => {
  console.error(err && err.stack ? err.stack : String(err));
  process.exit(1);
});
