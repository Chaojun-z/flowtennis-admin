const fs = require('fs');

const MONEY_FIELDS = [
  'cash',
  'recognized',
  'deferred',
  'packageIncome',
  'packageRecognized',
  'storedValueIncome',
  'storedValueConsumed',
  'bookingIncome',
  'bookingRecognized',
  'courtIncome',
  'courtRecognized'
];

const OPERATION_RULES = {
  'package-purchase': {
    tables: [
      { table: 'ft_purchases', minAdded: 1 },
      { table: 'ft_entitlements', minChangedOrAdded: 1 }
    ],
    financeRows: 1,
    deltas: (amount) => ({
      cash: amount,
      packageIncome: amount,
      deferred: amount,
      recognized: 0,
      packageRecognized: 0
    })
  },
  'lesson-consume': {
    tables: [
      { table: 'ft_schedule', minChangedOrAdded: 1 },
      { table: 'ft_entitlements', minChangedOrAdded: 1 },
      { table: 'ft_entitlement_ledger', minAdded: 1 }
    ],
    financeRows: 1,
    deltas: (amount) => ({
      cash: 0,
      recognized: amount,
      packageRecognized: amount,
      deferred: -amount
    })
  },
  'membership-recharge': {
    tables: [
      { table: 'ft_membership_accounts', minChangedOrAdded: 1 },
      { table: 'ft_membership_orders', minAdded: 1 },
      { table: 'ft_courts', minChangedOrAdded: 1 }
    ],
    financeRows: 1,
    deltas: (amount) => ({
      cash: amount,
      storedValueIncome: amount,
      deferred: amount,
      recognized: 0
    })
  },
  'member-booking': {
    tables: [
      { table: 'ft_courts', minChangedOrAdded: 1 }
    ],
    financeRows: 1,
    deltas: (amount) => ({
      cash: 0,
      recognized: amount,
      storedValueConsumed: amount,
      deferred: -amount
    })
  },
  'court-booking': {
    tables: [
      { table: 'ft_courts', minChangedOrAdded: 1 }
    ],
    financeRows: 1,
    deltas: (amount) => ({
      cash: amount,
      recognized: amount,
      bookingIncome: amount,
      bookingRecognized: amount,
      courtIncome: amount,
      courtRecognized: amount,
      deferred: 0
    })
  }
};

function roundMoney(value) {
  return Math.round((Number(value) || 0) * 100) / 100;
}

function normalizeRows(rows) {
  return Array.isArray(rows) ? rows : [];
}

function overview(snapshot) {
  return snapshot?.summary?.financeOverview || snapshot?.financePage?.overviewData?.all || {};
}

function rowsById(rows) {
  return new Map(normalizeRows(rows).map((row, index) => [String(row?.id || `__row_${index}`), row]));
}

function sameRow(a, b) {
  return JSON.stringify(a || {}) === JSON.stringify(b || {});
}

function tableRows(snapshot, tableName) {
  return normalizeRows(snapshot?.tables?.[tableName]?.rows);
}

function diffRows(beforeRows, afterRows) {
  const beforeMap = rowsById(beforeRows);
  const afterMap = rowsById(afterRows);
  const added = [];
  const changed = [];
  const removed = [];

  afterMap.forEach((row, id) => {
    if (!beforeMap.has(id)) added.push(row);
    else if (!sameRow(beforeMap.get(id), row)) changed.push(row);
  });
  beforeMap.forEach((row, id) => {
    if (!afterMap.has(id)) removed.push(row);
  });

  return {
    beforeCount: beforeMap.size,
    afterCount: afterMap.size,
    addedCount: added.length,
    changedCount: changed.length,
    removedCount: removed.length,
    changedOrAddedCount: added.length + changed.length,
    addedIds: added.map((row) => row.id).filter(Boolean),
    changedIds: changed.map((row) => row.id).filter(Boolean),
    removedIds: removed.map((row) => row.id).filter(Boolean)
  };
}

function computeTableChanges(beforeSnapshot, afterSnapshot) {
  const tableNames = new Set([
    ...Object.keys(beforeSnapshot?.tables || {}),
    ...Object.keys(afterSnapshot?.tables || {})
  ]);
  const changes = {};
  tableNames.forEach((tableName) => {
    changes[tableName] = diffRows(tableRows(beforeSnapshot, tableName), tableRows(afterSnapshot, tableName));
  });
  return changes;
}

function computeFinanceDeltas(beforeSnapshot, afterSnapshot) {
  const beforeOverview = overview(beforeSnapshot);
  const afterOverview = overview(afterSnapshot);
  const result = {};
  MONEY_FIELDS.forEach((field) => {
    result[field] = roundMoney((Number(afterOverview[field]) || 0) - (Number(beforeOverview[field]) || 0));
  });
  result.normalizedRowCount = normalizeRows(afterSnapshot?.financePage?.normalizedRows).length - normalizeRows(beforeSnapshot?.financePage?.normalizedRows).length;
  return result;
}

function assertAmount(amount) {
  const numeric = roundMoney(amount);
  if (!Number.isFinite(Number(amount)) || numeric <= 0) throw new Error('amount 必须是大于 0 的数字');
  return numeric;
}

function addFailure(failures, message) {
  failures.push(message);
}

function checkMoney(failures, deltas, field, expected) {
  const actual = roundMoney(deltas[field]);
  const target = roundMoney(expected);
  if (Math.abs(actual - target) > 0.01) {
    addFailure(failures, `${field} 变化不正确：期望 ${target}，实际 ${actual}`);
  }
}

function validateFinanceOperationChange({ beforeSnapshot, afterSnapshot, operationType, amount }) {
  const rule = OPERATION_RULES[operationType];
  if (!rule) throw new Error(`不支持的 operationType：${operationType}`);
  const numericAmount = assertAmount(amount);
  const tableChanges = computeTableChanges(beforeSnapshot, afterSnapshot);
  const financeDeltas = computeFinanceDeltas(beforeSnapshot, afterSnapshot);
  const failures = [];

  rule.tables.forEach((tableRule) => {
    const change = tableChanges[tableRule.table] || diffRows([], []);
    if (tableRule.minAdded && change.addedCount < tableRule.minAdded) {
      addFailure(failures, `${tableRule.table} 新增记录不足：期望至少 ${tableRule.minAdded}，实际 ${change.addedCount}`);
    }
    if (tableRule.minChangedOrAdded && change.changedOrAddedCount < tableRule.minChangedOrAdded) {
      addFailure(failures, `${tableRule.table} 没有新增或变更记录`);
    }
  });

  if (financeDeltas.normalizedRowCount < rule.financeRows) {
    addFailure(failures, `财务流水新增不足：期望至少 ${rule.financeRows}，实际 ${financeDeltas.normalizedRowCount}`);
  }

  Object.entries(rule.deltas(numericAmount)).forEach(([field, expected]) => {
    checkMoney(failures, financeDeltas, field, expected);
  });

  return {
    ok: failures.length === 0,
    operationType,
    amount: numericAmount,
    failures,
    tableChanges,
    financeDeltas
  };
}

function loadSnapshotFile(filePath) {
  return JSON.parse(fs.readFileSync(filePath, 'utf8'));
}

module.exports = {
  OPERATION_RULES,
  computeTableChanges,
  computeFinanceDeltas,
  validateFinanceOperationChange,
  loadSnapshotFile
};
