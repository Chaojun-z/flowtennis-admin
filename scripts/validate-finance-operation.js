#!/usr/bin/env node

const validation = require('./lib/finance-operation-validation');

function parseArgs(argv) {
  const options = {};
  for (let i = 0; i < argv.length; i += 1) {
    const arg = argv[i];
    if (arg === '--before') options.beforePath = argv[++i];
    else if (arg === '--after') options.afterPath = argv[++i];
    else if (arg === '--type') options.operationType = argv[++i];
    else if (arg === '--amount') options.amount = Number(argv[++i]);
  }
  return options;
}

function assertArgs(args) {
  const missing = [];
  if (!args.beforePath) missing.push('--before');
  if (!args.afterPath) missing.push('--after');
  if (!args.operationType) missing.push('--type');
  if (!Number.isFinite(args.amount)) missing.push('--amount');
  if (missing.length) throw new Error(`缺少参数：${missing.join(', ')}`);
}

function run(args) {
  assertArgs(args);
  return validation.validateFinanceOperationChange({
    beforeSnapshot: validation.loadSnapshotFile(args.beforePath),
    afterSnapshot: validation.loadSnapshotFile(args.afterPath),
    operationType: args.operationType,
    amount: args.amount
  });
}

function printResult(result) {
  console.log(JSON.stringify({
    ok: result.ok,
    operationType: result.operationType,
    amount: result.amount,
    failures: result.failures,
    financeDeltas: result.financeDeltas,
    tableChanges: result.tableChanges
  }, null, 2));
}

if (require.main === module) {
  try {
    const result = run(parseArgs(process.argv.slice(2)));
    printResult(result);
    if (!result.ok) process.exit(1);
  } catch (error) {
    console.error(error && error.stack ? error.stack : String(error));
    process.exit(1);
  }
}

module.exports = {
  parseArgs,
  run
};
