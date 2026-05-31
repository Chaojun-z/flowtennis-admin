#!/usr/bin/env node

const path = require('path');
const dotenv = require('dotenv');
const snapshot = require('./lib/finance-daily-snapshot');
const dataStore = require('./lib/staging-data-store');

function parseArgs(argv) {
  const options = {};
  for (let i = 0; i < argv.length; i += 1) {
    const arg = argv[i];
    if (arg === '--output-dir') options.outputDir = argv[++i];
    else if (arg === '--date') options.snapshotDate = argv[++i];
    else if (arg === '--diag-url') options.diagUrl = argv[++i];
  }
  return options;
}

function loadFinanceBuilder() {
  const previousNodeEnv = process.env.NODE_ENV;
  process.env.NODE_ENV = 'production';
  const api = require('../api/index.js');
  if (previousNodeEnv === undefined) delete process.env.NODE_ENV;
  else process.env.NODE_ENV = previousNodeEnv;

  const buildFinancePageSnapshot = api?._test?.buildFinancePageSnapshot;
  if (typeof buildFinancePageSnapshot !== 'function') {
    throw new Error('停止快照：无法加载财务汇总构建函数');
  }
  return buildFinancePageSnapshot;
}

async function main() {
  dotenv.config();
  const args = parseArgs(process.argv.slice(2));
  const generatedAt = new Date().toISOString();
  const baseDir = args.outputDir
    ? path.resolve(args.outputDir)
    : path.join(process.cwd(), 'var', 'finance-snapshots');

  const result = await snapshot.runFinanceDailySnapshot({
    generatedAt,
    snapshotDate: args.snapshotDate || generatedAt.slice(0, 10),
    baseDir,
    diagUrl: args.diagUrl,
    createClientFromEnv: dataStore.createClientFromEnv,
    scanTable: dataStore.scanTable,
    buildFinancePageSnapshot: loadFinanceBuilder()
  });

  console.log(JSON.stringify({
    ok: result.ok,
    outputPath: result.outputPath,
    target: result.target,
    tableRowCounts: result.snapshot.summary.tableRowCounts,
    financeOverview: result.snapshot.summary.financeOverview,
    financePage: {
      normalizedRowCount: result.snapshot.financePage.normalizedRowCount,
      settlementRowCount: result.snapshot.financePage.settlementRowCount
    }
  }, null, 2));
}

if (require.main === module) {
  main().catch((error) => {
    console.error(error && error.stack ? error.stack : String(error));
    process.exit(1);
  });
}

module.exports = {
  parseArgs,
  loadFinanceBuilder
};
