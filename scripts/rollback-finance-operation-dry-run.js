#!/usr/bin/env node

const fs = require('fs');
const path = require('path');

const ADD_RECORD_TABLES = new Set([
  'ft_purchases',
  'ft_membership_orders'
]);

const UPDATE_RECORD_TABLES = new Set([
  'ft_courts',
  'ft_membership_accounts',
  'ft_entitlements',
  'ft_schedule'
]);

const FINANCE_LEDGER_TABLES = new Set([
  'ft_entitlement_ledger',
  'ft_membership_benefit_ledger',
  'ft_courts.history',
  'financePage.normalizedRows'
]);

function parseArgs(argv) {
  const args = { snapshot: '', operationId: '', batchId: '' };
  for (let i = 0; i < argv.length; i += 1) {
    const token = argv[i];
    if (token === '--snapshot') args.snapshot = argv[++i] || '';
    else if (token === '--operation-id') args.operationId = argv[++i] || '';
    else if (token === '--batch-id') args.batchId = argv[++i] || '';
    else throw new Error(`未知参数：${token}`);
  }
  if (!args.snapshot) throw new Error('缺少 --snapshot <snapshot.json>');
  if (!args.operationId && !args.batchId) throw new Error('必须提供 --operation-id 或 --batch-id');
  if (args.operationId && args.batchId) throw new Error('一次只能提供 --operation-id 或 --batch-id');
  return args;
}

function loadSnapshot(snapshotPath) {
  const resolved = path.resolve(snapshotPath);
  return JSON.parse(fs.readFileSync(resolved, 'utf8'));
}

function rowsOfTable(snapshot, tableName) {
  const table = snapshot?.tables?.[tableName];
  if (Array.isArray(table)) return table;
  if (Array.isArray(table?.rows)) return table.rows;
  return [];
}

function normalizeRows(rows) {
  return Array.isArray(rows) ? rows : [];
}

function matchesTrace(row, selector) {
  if (!row || typeof row !== 'object') return false;
  if (selector.operationId) return String(row.operationId || '') === selector.operationId;
  return String(row.batchId || '') === selector.batchId;
}

function rowId(row, fallback) {
  return String(row?.id || row?.pk || row?.key || fallback);
}

function classifyTable(tableName) {
  if (FINANCE_LEDGER_TABLES.has(tableName)) return 'finance-ledger';
  if (ADD_RECORD_TABLES.has(tableName)) return 'add-record';
  if (UPDATE_RECORD_TABLES.has(tableName)) return 'update-record';
  return 'unknown-record';
}

function actionForCategory(category) {
  if (category === 'finance-ledger') return '财务流水类记录：禁止直接删除，建议按原金额和口径做反向冲正。';
  if (category === 'add-record') return '新增类记录：建议删除或冲正；执行前必须二次确认业务影响。';
  if (category === 'update-record') return '更新类记录：需要从快照/历史恢复原值，禁止靠猜测手工补字段。';
  return '未归类记录：只能人工复核，禁止自动回滚。';
}

function addMatch(groups, tableName, id, category) {
  if (!groups.has(tableName)) {
    groups.set(tableName, {
      tableName,
      category,
      ids: []
    });
  }
  groups.get(tableName).ids.push(id);
}

function collectMatches(snapshot, selector) {
  const groups = new Map();
  const tables = snapshot?.tables || {};

  Object.keys(tables).forEach((tableName) => {
    rowsOfTable(snapshot, tableName).forEach((row, index) => {
      if (matchesTrace(row, selector)) {
        addMatch(groups, tableName, rowId(row, `${tableName}-${index}`), classifyTable(tableName));
      }

      if (tableName === 'ft_courts') {
        normalizeRows(row?.history).forEach((historyRow, historyIndex) => {
          if (matchesTrace(historyRow, selector)) {
            const parentId = rowId(row, `court-${index}`);
            const childId = rowId(historyRow, `history-${historyIndex}`);
            addMatch(groups, 'ft_courts.history', `${parentId}#${childId}`, 'finance-ledger');
          }
        });
      }
    });
  });

  normalizeRows(snapshot?.financePage?.normalizedRows || snapshot?.financePage?.financeNormalizedRows).forEach((row, index) => {
    if (matchesTrace(row, selector)) {
      addMatch(groups, 'financePage.normalizedRows', rowId(row, `finance-row-${index}`), 'finance-ledger');
    }
  });

  return Array.from(groups.values()).map((group) => ({
    ...group,
    ids: Array.from(new Set(group.ids))
  }));
}

function buildReport({ snapshotPath, selector, groups }) {
  const lines = [];
  lines.push('财务批次回滚 DRY-RUN');
  lines.push(`快照: ${path.resolve(snapshotPath)}`);
  if (selector.operationId) lines.push(`operationId: ${selector.operationId}`);
  if (selector.batchId) lines.push(`batchId: ${selector.batchId}`);
  lines.push('');
  lines.push('涉及记录：');
  groups.forEach((group) => {
    lines.push(`- ${group.tableName}`);
    group.ids.forEach((id) => lines.push(`  - ${id}`));
  });
  lines.push('');
  lines.push('建议回滚动作：');
  groups.forEach((group) => {
    lines.push(`- ${group.tableName}: ${actionForCategory(group.category)}`);
  });
  lines.push('');
  lines.push('风险提示：');
  lines.push('- 本脚本只做 dry-run，不会连接线上，不会写库，不会真实回滚。');
  lines.push('- 真实恢复前必须先生成恢复前快照，恢复后必须重新生成快照并校验。');
  lines.push('- 财务流水禁止直接删除；优先按反向冲正保留审计链路。');
  lines.push('- 更新类记录必须依赖快照/历史值恢复，找不到原值时必须停止。');
  return `${lines.join('\n')}\n`;
}

function run(argv = process.argv.slice(2)) {
  const args = parseArgs(argv);
  const snapshot = loadSnapshot(args.snapshot);
  const selector = {
    operationId: String(args.operationId || '').trim(),
    batchId: String(args.batchId || '').trim()
  };
  const groups = collectMatches(snapshot, selector);
  if (!groups.length) {
    const label = selector.operationId ? `operationId: ${selector.operationId}` : `batchId: ${selector.batchId}`;
    throw new Error(`找不到 ${label} 对应记录，禁止猜测。`);
  }
  return buildReport({ snapshotPath: args.snapshot, selector, groups });
}

if (require.main === module) {
  try {
    process.stdout.write(run());
  } catch (error) {
    process.stderr.write(`${error.message}\n`);
    process.exit(1);
  }
}

module.exports = {
  parseArgs,
  collectMatches,
  buildReport,
  run
};
