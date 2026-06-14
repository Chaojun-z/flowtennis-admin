const {
  buildFinanceNormalizedRowsFromLedgerRows,
  buildShadowLedgerRowsFromFinanceNormalizedRows,
  idempotencyKeyFor,
  roundMoney
} = require('./finance-ledger-read-model');

function normalizeRows(rows) {
  return Array.isArray(rows) ? rows : [];
}

function rowKey(row) {
  if (row?.idempotencyKey) return String(row.idempotencyKey);
  if (row?.sourceType || row?.sourceId || row?.ledgerType) return idempotencyKeyFor(row);
  const shadow = buildShadowLedgerRowsFromFinanceNormalizedRows([row])[0];
  return shadow.idempotencyKey;
}

function moneyTriplet(row) {
  return {
    cash: roundMoney(row?.cashDelta),
    recognized: roundMoney(row?.recognizedRevenueDelta),
    deferred: roundMoney(row?.deferredRevenueDelta)
  };
}

function diffMoney(a, b) {
  return {
    cash: roundMoney((Number(b.cash) || 0) - (Number(a.cash) || 0)),
    recognized: roundMoney((Number(b.recognized) || 0) - (Number(a.recognized) || 0)),
    deferred: roundMoney((Number(b.deferred) || 0) - (Number(a.deferred) || 0))
  };
}

function isZeroDiff(diff) {
  return diff.cash === 0 && diff.recognized === 0 && diff.deferred === 0;
}

function sumRows(rows) {
  return normalizeRows(rows).reduce((total, row) => ({
    cash: roundMoney(total.cash + (Number(row?.cashDelta) || 0)),
    recognized: roundMoney(total.recognized + (Number(row?.recognizedRevenueDelta) || 0)),
    deferred: roundMoney(total.deferred + (Number(row?.deferredRevenueDelta) || 0))
  }), { cash: 0, recognized: 0, deferred: 0 });
}

function addToMap(map, row) {
  const key = rowKey(row);
  if (!map.has(key)) map.set(key, []);
  map.get(key).push(row);
}

function allowedReasonFor(key, allowedDifferences) {
  const item = normalizeRows(allowedDifferences).find((entry) => String(entry?.key || '') === key);
  return item?.reason || '';
}

function compareFinanceLedgerReadModel({ legacyRows = [], ledgerRows = [], allowedDifferences = [] } = {}) {
  const normalizedLegacyRows = normalizeRows(legacyRows);
  const readModelRows = buildFinanceNormalizedRowsFromLedgerRows(ledgerRows);
  const legacyMap = new Map();
  const ledgerMap = new Map();
  const details = [];
  const warnings = [];

  normalizedLegacyRows.forEach((row) => addToMap(legacyMap, row));
  readModelRows.forEach((row) => addToMap(ledgerMap, row));

  ledgerMap.forEach((rows, key) => {
    if (rows.length > 1) details.push({ type: 'duplicate_idempotency_key', key, ledgerCount: rows.length });
  });

  const keys = new Set([...legacyMap.keys(), ...ledgerMap.keys()]);
  keys.forEach((key) => {
    const legacyList = legacyMap.get(key) || [];
    const ledgerList = ledgerMap.get(key) || [];
    const reason = allowedReasonFor(key, allowedDifferences);

    if (!legacyList.length) {
      const item = { type: 'missing_legacy', key, ledger: ledgerList[0] || null };
      if (reason) warnings.push({ ...item, reason });
      else details.push(item);
      return;
    }
    if (!ledgerList.length) {
      const item = { type: 'missing_ledger', key, legacy: legacyList[0] || null };
      if (reason) warnings.push({ ...item, reason });
      else details.push(item);
      return;
    }

    const amountDifference = diffMoney(moneyTriplet(legacyList[0]), moneyTriplet(ledgerList[0]));
    if (!isZeroDiff(amountDifference)) {
      details.push({
        type: 'amount_mismatch',
        key,
        amountDifference,
        legacy: moneyTriplet(legacyList[0]),
        ledger: moneyTriplet(ledgerList[0])
      });
    }
  });

  const legacySummary = sumRows(normalizedLegacyRows);
  const shadowSummary = sumRows(readModelRows);
  const summaryDifference = diffMoney(legacySummary, shadowSummary);

  return {
    ok: details.length === 0,
    legacyRowCount: normalizedLegacyRows.length,
    shadowLedgerRowCount: normalizeRows(ledgerRows).length,
    readModelRowCount: readModelRows.length,
    legacySummary,
    shadowSummary,
    summaryDifference,
    details,
    warnings
  };
}

module.exports = {
  compareFinanceLedgerReadModel,
  sumRows
};
