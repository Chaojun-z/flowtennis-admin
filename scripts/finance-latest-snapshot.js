#!/usr/bin/env node

const fs = require('fs');
const path = require('path');

function parseArgs(argv = []) {
  const options = {
    dir: path.join(process.cwd(), 'var', 'finance-snapshots')
  };
  for (let i = 0; i < argv.length; i += 1) {
    if (argv[i] === '--dir') options.dir = path.resolve(argv[++i]);
  }
  return options;
}

function findSnapshotFiles(dir) {
  if (!fs.existsSync(dir)) return [];
  const entries = fs.readdirSync(dir, { withFileTypes: true });
  return entries.flatMap((entry) => {
    const fullPath = path.join(dir, entry.name);
    if (entry.isDirectory()) return findSnapshotFiles(fullPath);
    if (/^finance-daily-snapshot-.*\.json$/.test(entry.name)) return [fullPath];
    return [];
  });
}

function readSnapshot(filePath) {
  const snapshot = JSON.parse(fs.readFileSync(filePath, 'utf8'));
  return { filePath, snapshot };
}

function snapshotSortKey(item) {
  return String(item.snapshot?.generatedAt || item.snapshot?.snapshotDate || item.filePath || '');
}

function findLatestSnapshot(dir) {
  const snapshots = findSnapshotFiles(dir).map(readSnapshot);
  if (!snapshots.length) throw new Error(`未找到每日财务快照：${dir}`);
  return snapshots.sort((a, b) => snapshotSortKey(b).localeCompare(snapshotSortKey(a)))[0];
}

function summarizeLatestSnapshot(item) {
  const snapshot = item.snapshot || {};
  const overview = snapshot.summary?.financeOverview || {};
  return {
    baselineType: snapshot.baselineType || 'legacy_finance_daily_snapshot',
    sourceOfTruth: snapshot.sourceOfTruth || 'legacy_snapshot_file',
    snapshotDate: snapshot.snapshotDate || '',
    generatedAt: snapshot.generatedAt || '',
    filePath: item.filePath,
    environment: snapshot.environment || {},
    financeOverview: overview,
    warning: snapshot.baselineType === 'operating_finance_snapshot'
      ? ''
      : '这是旧版每日快照，缺少 operating_finance_snapshot 标识；可读，但下次生成会自动带上新标识。'
  };
}

function main() {
  try {
    const options = parseArgs(process.argv.slice(2));
    const latest = summarizeLatestSnapshot(findLatestSnapshot(options.dir));
    console.log(JSON.stringify(latest, null, 2));
  } catch (error) {
    console.error(error && error.message ? error.message : String(error));
    process.exit(1);
  }
}

if (require.main === module) main();

module.exports = {
  parseArgs,
  findSnapshotFiles,
  findLatestSnapshot,
  summarizeLatestSnapshot
};
