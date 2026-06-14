const assert = require('assert');

const {
  compareFinanceLedgerReadModel
} = require('../scripts/lib/finance-ledger-compare');
const {
  buildShadowLedgerRowsFromFinanceNormalizedRows
} = require('../scripts/lib/finance-ledger-read-model');

const legacyRows = [
  {
    id: 'receipt-1',
    businessType: '课程',
    action: '收款',
    cashDelta: 1000,
    recognizedRevenueDelta: 0,
    deferredRevenueDelta: 1000,
    sourceDocument: '购买记录 p1'
  },
  {
    id: 'consume-1',
    businessType: '课程',
    action: '消耗',
    cashDelta: 0,
    recognizedRevenueDelta: 200,
    deferredRevenueDelta: -200,
    paymentChannel: '课包划扣',
    sourceDocument: '排课 s1'
  }
];

const matchingLedgerRows = buildShadowLedgerRowsFromFinanceNormalizedRows(legacyRows);
const matched = compareFinanceLedgerReadModel({ legacyRows, ledgerRows: matchingLedgerRows });
assert.strictEqual(matched.ok, true, 'matching shadow ledger should pass');
assert.deepStrictEqual(matched.summaryDifference, { cash: 0, recognized: 0, deferred: 0 });

const mismatchedLedgerRows = [
  { ...matchingLedgerRows[0], cashDelta: 90000, recognizedRevenueDelta: 10000, deferredRevenueDelta: 80000 },
  matchingLedgerRows[1]
];
const mismatched = compareFinanceLedgerReadModel({ legacyRows, ledgerRows: mismatchedLedgerRows });
assert.strictEqual(mismatched.ok, false, 'amount differences should fail');
assert.deepStrictEqual(mismatched.summaryDifference, { cash: -100, recognized: 100, deferred: -200 });
assert.match(JSON.stringify(mismatched), /cash/);
assert.match(JSON.stringify(mismatched), /recognized/);
assert.match(JSON.stringify(mismatched), /deferred/);
assert.ok(mismatched.details.some((item) => item.type === 'amount_mismatch'), 'amount mismatch should be listed');

const missingLedger = compareFinanceLedgerReadModel({ legacyRows, ledgerRows: [matchingLedgerRows[0]] });
assert.strictEqual(missingLedger.ok, false, 'missing ledger rows should fail');
assert.ok(missingLedger.details.some((item) => item.type === 'missing_ledger'));

const missingLegacy = compareFinanceLedgerReadModel({
  legacyRows: [legacyRows[0]],
  ledgerRows: matchingLedgerRows
});
assert.strictEqual(missingLegacy.ok, false, 'ledger rows without legacy rows should fail');
assert.ok(missingLegacy.details.some((item) => item.type === 'missing_legacy'));

const duplicate = compareFinanceLedgerReadModel({
  legacyRows,
  ledgerRows: [matchingLedgerRows[0], matchingLedgerRows[0], matchingLedgerRows[1]]
});
assert.strictEqual(duplicate.ok, false, 'duplicate idempotency keys should fail');
assert.ok(duplicate.details.some((item) => item.type === 'duplicate_idempotency_key'));

const whitelisted = compareFinanceLedgerReadModel({
  legacyRows,
  ledgerRows: [matchingLedgerRows[0]],
  allowedDifferences: [{ key: matchingLedgerRows[1].idempotencyKey, reason: 'verified_import_increment' }]
});
assert.strictEqual(whitelisted.ok, true, 'allowed differences should not fail');
assert.ok(whitelisted.warnings.some((item) => item.reason === 'verified_import_increment'));

console.log('finance ledger compare tests passed');
