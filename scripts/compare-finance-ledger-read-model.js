#!/usr/bin/env node

const fs = require('fs');

const {
  buildShadowLedgerRowsFromFinanceNormalizedRows
} = require('./lib/finance-ledger-read-model');
const {
  compareFinanceLedgerReadModel
} = require('./lib/finance-ledger-compare');

function argValue(name) {
  const index = process.argv.indexOf(name);
  if (index === -1) return '';
  return process.argv[index + 1] || '';
}

function readJson(filePath) {
  return JSON.parse(fs.readFileSync(filePath, 'utf8'));
}

function financeRowsFromSnapshot(snapshot) {
  return snapshot?.financePage?.normalizedRows || snapshot?.financePage?.financeNormalizedRows || [];
}

function ledgerRowsFromSnapshot(snapshot, financeRows) {
  const tableRows = snapshot?.tables?.ft_financial_ledger?.rows;
  if (Array.isArray(tableRows) && tableRows.length) return tableRows;
  if (Array.isArray(snapshot?.shadowLedgerRows) && snapshot.shadowLedgerRows.length) return snapshot.shadowLedgerRows;
  return buildShadowLedgerRowsFromFinanceNormalizedRows(financeRows);
}

function main() {
  const snapshotPath = argValue('--snapshot');
  if (!snapshotPath) {
    console.error('用法：node scripts/compare-finance-ledger-read-model.js --snapshot <snapshot.json>');
    process.exit(2);
  }

  const snapshot = readJson(snapshotPath);
  const legacyRows = financeRowsFromSnapshot(snapshot);
  const ledgerRows = ledgerRowsFromSnapshot(snapshot, legacyRows);
  const report = compareFinanceLedgerReadModel({ legacyRows, ledgerRows });

  process.stdout.write(`${JSON.stringify(report, null, 2)}\n`);
  process.exit(report.ok ? 0 : 1);
}

if (require.main === module) {
  main();
}

module.exports = {
  financeRowsFromSnapshot,
  ledgerRowsFromSnapshot,
  main
};
