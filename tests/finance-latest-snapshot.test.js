const assert = require('assert');
const fs = require('fs');
const os = require('os');
const path = require('path');
const { spawnSync } = require('child_process');

const latest = require('../scripts/finance-latest-snapshot');

const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'flowtennis-latest-snapshot-'));
const olderDir = path.join(tmpDir, '2026-06-14');
const newerDir = path.join(tmpDir, '2026-06-15');
fs.mkdirSync(olderDir, { recursive: true });
fs.mkdirSync(newerDir, { recursive: true });

fs.writeFileSync(path.join(olderDir, 'finance-daily-snapshot-older.json'), JSON.stringify({
  baselineType: 'operating_finance_snapshot',
  sourceOfTruth: 'online_readonly_snapshot',
  snapshotDate: '2026-06-14',
  generatedAt: '2026-06-14T15:30:00.000Z',
  environment: { tsInstance: 'flowtennis-ue' },
  summary: { financeOverview: { storedValueIncome: 130000 } }
}, null, 2));

const newerPath = path.join(newerDir, 'finance-daily-snapshot-newer.json');
fs.writeFileSync(newerPath, JSON.stringify({
  baselineType: 'operating_finance_snapshot',
  sourceOfTruth: 'online_readonly_snapshot',
  snapshotDate: '2026-06-15',
  generatedAt: '2026-06-15T15:30:00.000Z',
  environment: { tsInstance: 'flowtennis-ue' },
  summary: { financeOverview: { storedValueIncome: 137000 } }
}, null, 2));

assert.strictEqual(latest.parseArgs(['--dir', tmpDir]).dir, tmpDir);
assert.strictEqual(latest.findSnapshotFiles(tmpDir).length, 2);

const found = latest.summarizeLatestSnapshot(latest.findLatestSnapshot(tmpDir));
assert.strictEqual(found.filePath, newerPath);
assert.strictEqual(found.baselineType, 'operating_finance_snapshot');
assert.strictEqual(found.snapshotDate, '2026-06-15');
assert.strictEqual(found.environment.tsInstance, 'flowtennis-ue');
assert.strictEqual(found.financeOverview.storedValueIncome, 137000);
assert.strictEqual(found.warning, '');

const run = spawnSync('node', ['scripts/finance-latest-snapshot.js', '--dir', tmpDir], {
  cwd: path.join(__dirname, '..'),
  encoding: 'utf8'
});
assert.strictEqual(run.status, 0, run.stderr || run.stdout);
assert.match(run.stdout, /2026-06-15/);
assert.match(run.stdout, /flowtennis-ue/);
assert.match(run.stdout, /operating_finance_snapshot/);

console.log('finance latest snapshot tests passed');
