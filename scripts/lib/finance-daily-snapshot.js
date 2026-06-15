const fs = require('fs');
const path = require('path');
const {
  buildShadowLedgerRowsFromFinanceNormalizedRows
} = require('./finance-ledger-read-model');
const {
  compareFinanceLedgerReadModel
} = require('./finance-ledger-compare');

const FINANCE_DAILY_SNAPSHOT_TABLES = [
  'ft_courts',
  'ft_membership_accounts',
  'ft_membership_orders',
  'ft_membership_benefit_ledger',
  'ft_purchases',
  'ft_entitlements',
  'ft_entitlement_ledger',
  'ft_schedule'
];

const FINANCE_DAILY_FINANCE_SOURCE_TABLES = [
  'ft_campuses',
  'ft_students',
  ...FINANCE_DAILY_SNAPSHOT_TABLES
];

const TABLE_SOURCE_KEYS = {
  ft_campuses: 'campuses',
  ft_students: 'students',
  ft_courts: 'courts',
  ft_membership_accounts: 'membershipAccounts',
  ft_membership_orders: 'membershipOrders',
  ft_membership_benefit_ledger: 'membershipBenefitLedger',
  ft_purchases: 'purchases',
  ft_entitlements: 'entitlements',
  ft_entitlement_ledger: 'entitlementLedger',
  ft_schedule: 'schedule'
};

function readDiagEnv(diag) {
  return diag?.env || diag || {};
}

function cleanTarget(value) {
  return String(value || '').trim().replace(/\/+$/, '');
}

function assertDiagMatchesLocalTarget({ onlineDiag, env }) {
  const onlineEnv = readDiagEnv(onlineDiag);
  const onlineEndpoint = cleanTarget(onlineEnv.TS_ENDPOINT);
  const onlineInstance = cleanTarget(onlineEnv.TS_INSTANCE);
  const localEndpoint = cleanTarget(env?.TS_ENDPOINT);
  const localInstance = cleanTarget(env?.TS_INSTANCE || env?.TARGET_TS_INSTANCE);

  if (!onlineEndpoint || !onlineInstance) {
    throw new Error('停止快照：线上 /api/diag 未返回 TS_ENDPOINT 或 TS_INSTANCE');
  }
  if (!localEndpoint || !localInstance) {
    throw new Error('停止快照：本地缺少 TS_ENDPOINT 或 TS_INSTANCE');
  }
  if (onlineEndpoint !== localEndpoint || onlineInstance !== localInstance) {
    throw new Error(`停止快照：本地 TableStore 目标与线上不一致。本地 ${localEndpoint} / ${localInstance}，线上 ${onlineEndpoint} / ${onlineInstance}`);
  }

  return {
    onlineEndpoint,
    onlineInstance,
    localEndpoint,
    localInstance
  };
}

function normalizeRows(rows) {
  return Array.isArray(rows) ? rows : [];
}

function roundMoney(value) {
  return Math.round((Number(value) || 0) * 100) / 100;
}

function sumRows(rows, predicate, field) {
  return roundMoney(rows
    .filter(predicate)
    .reduce((total, row) => total + (Number(row?.[field]) || 0), 0));
}

function deriveFinanceOverviewFromRows(rows) {
  const businessRows = normalizeRows(rows).filter((row) => !row?.differenceReason);
  const courseRows = businessRows.filter((row) => row.businessType === '课程');
  const packageReceiptRows = courseRows.filter((row) => row.action === '收款' && String(row.sourceDocument || '').startsWith('购买记录'));
  const packageRecognizedRows = courseRows.filter((row) => ['消耗', '回退', '已入账'].includes(String(row.action || '')) && String(row.paymentChannel || '') === '课包划扣');
  const directCourseRows = courseRows.filter((row) => row.action === '收款' && String(row.sourceDocument || '').startsWith('排课'));
  const storedValueRows = businessRows.filter((row) => row.businessType === '会员储值');
  const storedValueConsumedRows = businessRows.filter((row) => row.businessType === '会员订场');
  const bookingRows = businessRows.filter((row) => ['散客订场', '约球局'].includes(row.businessType));
  const bookingIncome = sumRows(bookingRows, () => true, 'cashDelta');
  const bookingRecognized = sumRows(bookingRows, () => true, 'recognizedRevenueDelta');

  return {
    cash: sumRows(businessRows, () => true, 'cashDelta'),
    recognized: sumRows(businessRows, () => true, 'recognizedRevenueDelta'),
    deferred: sumRows(businessRows, () => true, 'deferredRevenueDelta'),
    courseIncome: sumRows(courseRows, () => true, 'cashDelta'),
    courseRecognized: sumRows(courseRows, () => true, 'recognizedRevenueDelta'),
    directCourseIncome: sumRows(directCourseRows, () => true, 'cashDelta'),
    directCourseRecognized: sumRows(directCourseRows, () => true, 'recognizedRevenueDelta'),
    packageIncome: sumRows(packageReceiptRows, () => true, 'cashDelta'),
    packageRecognized: sumRows(packageRecognizedRows, () => true, 'recognizedRevenueDelta'),
    storedValueIncome: sumRows(storedValueRows, () => true, 'cashDelta'),
    storedValueConsumed: sumRows(storedValueConsumedRows, () => true, 'recognizedRevenueDelta'),
    bookingIncome,
    bookingRecognized,
    courtIncome: bookingIncome,
    courtRecognized: bookingRecognized,
    tradeCount: businessRows.filter((row) => row.action === '收款' && Number(row.cashDelta) > 0).length
  };
}

function normalizeFinanceOverviewData(financePage, normalizedRows) {
  if (financePage?.financeOverviewData) return financePage.financeOverviewData;
  return {
    all: deriveFinanceOverviewFromRows(normalizedRows),
    campuses: []
  };
}

function buildFinanceSummary(overviewData) {
  return {
    financeOverview: overviewData?.all || null
  };
}

function buildShadowLedgerSnapshot({ normalizedRows, financePage, tables }) {
  const shadowLedgerRows = normalizeRows(financePage?.shadowLedgerRows).length
    ? normalizeRows(financePage?.shadowLedgerRows)
    : normalizeRows(tables?.ft_financial_ledger?.rows || tables?.ft_financial_ledger).length
      ? normalizeRows(tables?.ft_financial_ledger?.rows || tables?.ft_financial_ledger)
      : buildShadowLedgerRowsFromFinanceNormalizedRows(normalizedRows);

  try {
    return {
      shadowLedgerRows,
      shadowLedgerCompareReport: compareFinanceLedgerReadModel({
        legacyRows: normalizedRows,
        ledgerRows: shadowLedgerRows
      })
    };
  } catch (error) {
    return {
      shadowLedgerRows,
      shadowLedgerCompareReport: {
        ok: false,
        details: [{
          type: 'compare_error',
          message: error && error.message ? error.message : String(error)
        }],
        warnings: []
      }
    };
  }
}

function buildDailyFinanceSnapshot({ generatedAt, snapshotDate, diag, tables, financePage }) {
  const diagEnv = readDiagEnv(diag);
  const normalizedTables = {};
  const tableRowCounts = {};

  FINANCE_DAILY_SNAPSHOT_TABLES.forEach((tableName) => {
    const rows = normalizeRows(tables?.[tableName]);
    normalizedTables[tableName] = {
      rowCount: rows.length,
      rows
    };
    tableRowCounts[tableName] = rows.length;
  });

  const normalizedRows = normalizeRows(financePage?.financeNormalizedRows);
  const settlementRows = normalizeRows(financePage?.financeSettlementRows);
  const overviewData = normalizeFinanceOverviewData(financePage, normalizedRows);
  const shadowLedger = buildShadowLedgerSnapshot({ normalizedRows, financePage, tables });

  return {
    schemaVersion: 1,
    baselineType: 'operating_finance_snapshot',
    sourceOfTruth: 'online_readonly_snapshot',
    notCodeRegressionGuard: true,
    usage: '用于核对线上当天经营财务真实状态；不要和 config/finance-baseline.v2.json 的代码门禁固定样本混用。',
    generatedAt,
    snapshotDate,
    environment: {
      tsEndpoint: diagEnv.TS_ENDPOINT || '',
      tsInstance: diagEnv.TS_INSTANCE || ''
    },
    tables: normalizedTables,
    financePage: {
      generatedAt: financePage?.generatedAt || generatedAt,
      overviewData,
      normalizedRowCount: normalizedRows.length,
      settlementRowCount: settlementRows.length,
      normalizedRows,
      settlementRows
    },
    shadowLedgerRows: shadowLedger.shadowLedgerRows,
    shadowLedgerCompareReport: shadowLedger.shadowLedgerCompareReport,
    summary: {
      tableRowCounts,
      ...buildFinanceSummary(overviewData)
    }
  };
}

function safeTimestamp(value) {
  return String(value || '').replace(/[:.]/g, '-');
}

function buildSnapshotOutputPath({ baseDir, snapshotDate, generatedAt }) {
  return path.join(
    baseDir,
    snapshotDate,
    `finance-daily-snapshot-${safeTimestamp(generatedAt)}.json`
  );
}

async function fetchOnlineDiag({ fetchImpl = fetch, diagUrl = 'https://www.flowtennis.cn/api/diag' } = {}) {
  const response = await fetchImpl(diagUrl, { headers: { 'Cache-Control': 'no-cache' } });
  if (!response.ok) throw new Error(`停止快照：线上 /api/diag 请求失败 ${response.status}`);
  return response.json();
}

async function scanTables({ client, scanTable, tableNames = FINANCE_DAILY_FINANCE_SOURCE_TABLES }) {
  const entries = await Promise.all(
    tableNames.map(async (tableName) => [tableName, await scanTable(client, tableName)])
  );
  return Object.fromEntries(entries);
}

function buildFinancePageFromTables(tables, buildFinancePageSnapshot) {
  const source = {};
  Object.entries(TABLE_SOURCE_KEYS).forEach(([tableName, sourceKey]) => {
    source[sourceKey] = normalizeRows(tables?.[tableName]);
  });
  return buildFinancePageSnapshot(source);
}

async function writeSnapshotFile(snapshot, outputPath) {
  await fs.promises.mkdir(path.dirname(outputPath), { recursive: true });
  await fs.promises.writeFile(outputPath, `${JSON.stringify(snapshot, null, 2)}\n`, 'utf8');
  return outputPath;
}

async function runFinanceDailySnapshot({
  env = process.env,
  generatedAt = new Date().toISOString(),
  snapshotDate = generatedAt.slice(0, 10),
  baseDir = path.join(process.cwd(), 'var', 'finance-snapshots'),
  diagUrl,
  fetchImpl,
  createClientFromEnv,
  scanTable,
  buildFinancePageSnapshot,
  writeFile = true
} = {}) {
  if (!createClientFromEnv) throw new Error('缺少 createClientFromEnv');
  if (!scanTable) throw new Error('缺少 scanTable');
  if (!buildFinancePageSnapshot) throw new Error('缺少 buildFinancePageSnapshot');

  const onlineDiag = await fetchOnlineDiag({ fetchImpl, diagUrl });
  const target = assertDiagMatchesLocalTarget({ onlineDiag, env });
  const client = createClientFromEnv(env);
  const scannedTables = await scanTables({ client, scanTable });
  const financePage = buildFinancePageFromTables(scannedTables, buildFinancePageSnapshot);
  const snapshot = buildDailyFinanceSnapshot({
    generatedAt,
    snapshotDate,
    diag: onlineDiag,
    tables: scannedTables,
    financePage
  });
  const outputPath = buildSnapshotOutputPath({ baseDir, snapshotDate, generatedAt });
  if (writeFile) await writeSnapshotFile(snapshot, outputPath);

  return {
    ok: true,
    target,
    outputPath,
    snapshot
  };
}

module.exports = {
  FINANCE_DAILY_SNAPSHOT_TABLES,
  FINANCE_DAILY_FINANCE_SOURCE_TABLES,
  assertDiagMatchesLocalTarget,
  buildDailyFinanceSnapshot,
  buildShadowLedgerSnapshot,
  buildSnapshotOutputPath,
  deriveFinanceOverviewFromRows,
  fetchOnlineDiag,
  scanTables,
  buildFinancePageFromTables,
  writeSnapshotFile,
  runFinanceDailySnapshot
};
