#!/usr/bin/env node

const fs = require('fs');
const path = require('path');
const dotenv = require('dotenv');
const {
  createClientFromEnv,
  scanTable,
  getRow,
  putRow
} = require('./lib/staging-data-store');
const {
  assertProductionWriteTarget,
  assertProductionWriteTrace
} = require('./lib/production-write-guard');

dotenv.config({ path: path.join(__dirname, '..', '.env.local') });
dotenv.config();

const PROD_DIAG_URL = 'https://www.flowtennis.cn/api/diag';
const MASTER_PACKAGE_ID = '6754793d-99f0-4c81-b71d-00b4c8316fac';
const SOURCE_PACKAGE_ID = '55ba81d8-caa5-43b4-afa0-410d52ca38e0';
const TARGET_PRICE = 199;
const OPERATION_ID = 'repair-zero-foundation-special-package-20260806';
const BATCH_ID = `batch-${OPERATION_ID}`;

const TABLES = {
  packages: 'ft_packages',
  purchases: 'ft_purchases',
  entitlements: 'ft_entitlements',
  entitlementLedger: 'ft_entitlement_ledger',
  schedule: 'ft_schedule',
  activeEntitlementIndex: 'ft_student_active_entitlement_index'
};

function parseArgs(argv = process.argv.slice(2)) {
  const args = {
    write: argv.includes('--write'),
    report: path.join(__dirname, '..', 'offline-reports', `${OPERATION_ID}-${argv.includes('--write') ? 'write' : 'dry-run'}.json`)
  };
  const reportIndex = argv.indexOf('--report');
  if (reportIndex >= 0) args.report = argv[reportIndex + 1] || args.report;
  return args;
}

function byId(rows = []) {
  return new Map(rows.map(row => [String(row.id || ''), row]));
}

function lesson(value) {
  const n = Number(value);
  return Number.isFinite(n) ? n : 0;
}

function activeEntitlement(row = {}) {
  if (String(row.status || 'active') !== 'active') return false;
  return lesson(row.remainingLessons) > 0;
}

function withTrace(row, now, type) {
  return {
    ...row,
    updatedAt: now,
    operationId: OPERATION_ID,
    batchId: BATCH_ID,
    operationType: type,
    operationAt: now,
    operationBy: 'Codex',
    repairReason: '零基础专项课 260 错课包合并到 199 正确课包'
  };
}

function normalizePurchase(row, master, source, now) {
  const next = withTrace({
    ...row,
    packageId: master.id,
    packageName: master.name || row.packageName || '',
    priceSourceId: master.id,
    priceSourceName: master.name || row.priceSourceName || '',
    productId: master.productId || row.productId || '',
    productName: master.productName || row.productName || '',
    courseType: master.courseType || row.courseType || '',
    skillLevelMin: master.skillLevelMin || row.skillLevelMin || '',
    skillLevelMax: master.skillLevelMax || row.skillLevelMax || '',
    specialTopic: master.specialTopic || row.specialTopic || '',
    courseDisplayName: master.courseDisplayName || row.courseDisplayName || '',
    packageLessons: Number(master.lessons || row.packageLessons || row.totalLessons || 0),
    packagePrice: TARGET_PRICE,
    systemAmount: TARGET_PRICE,
    finalAmount: TARGET_PRICE,
    amountPaid: TARGET_PRICE,
    packageTimeBand: master.timeBand || row.packageTimeBand || '',
    dailyTimeWindows: Array.isArray(master.dailyTimeWindows) ? master.dailyTimeWindows : row.dailyTimeWindows,
    originalPackageId: row.originalPackageId || source.id,
    originalPackageName: row.originalPackageName || source.name || row.packageName || '',
    packageMergedAt: now
  }, now, 'zero-foundation-special-package-merge');
  delete next.priceOverridden;
  delete next.overrideReason;
  return next;
}

function normalizeEntitlement(row, master, source, now) {
  const remaining = lesson(row.remainingLessons);
  return withTrace({
    ...row,
    packageId: master.id,
    packageName: master.name || row.packageName || '',
    productId: master.productId || row.productId || '',
    productName: master.productName || row.productName || '',
    courseType: master.courseType || row.courseType || '',
    skillLevelMin: master.skillLevelMin || row.skillLevelMin || '',
    skillLevelMax: master.skillLevelMax || row.skillLevelMax || '',
    specialTopic: master.specialTopic || row.specialTopic || '',
    courseDisplayName: master.courseDisplayName || row.courseDisplayName || '',
    timeBand: master.timeBand || row.timeBand || '',
    dailyTimeWindows: Array.isArray(master.dailyTimeWindows) ? master.dailyTimeWindows : row.dailyTimeWindows,
    campusIds: Array.isArray(master.campusIds) ? master.campusIds : row.campusIds,
    ownerCoach: master.ownerCoach || row.ownerCoach || '',
    originalPackageId: row.originalPackageId || source.id,
    originalPackageName: row.originalPackageName || source.name || row.packageName || '',
    packageMergedAt: now,
    status: String(row.status || 'active') === 'voided' ? row.status : (remaining > 0 ? 'active' : 'depleted')
  }, now, 'zero-foundation-special-package-merge');
}

function buildRepairPlan(data, now = new Date().toISOString()) {
  const packagesById = byId(data.packages);
  const master = packagesById.get(MASTER_PACKAGE_ID);
  const source = packagesById.get(SOURCE_PACKAGE_ID);
  const blockers = [];
  if (!master) blockers.push({ table: TABLES.packages, id: MASTER_PACKAGE_ID, reason: '199 正确课包不存在' });
  if (!source) blockers.push({ table: TABLES.packages, id: SOURCE_PACKAGE_ID, reason: '260 错误课包不存在' });
  if (master && Number(master.price) !== TARGET_PRICE) blockers.push({ table: TABLES.packages, id: master.id, reason: '199 正确课包价格不是 199', actual: master.price });
  if (source && Number(source.price) !== 260) blockers.push({ table: TABLES.packages, id: source.id, reason: '错误课包价格已不是 260', actual: source.price });
  if (blockers.length) return { blockers, updates: {} };

  const sourcePurchases = data.purchases.filter(row => String(row.packageId || '') === SOURCE_PACKAGE_ID && String(row.status || '') !== 'voided');
  const sourceEntitlements = data.entitlements.filter(row => String(row.packageId || '') === SOURCE_PACKAGE_ID && String(row.status || '') !== 'voided');
  if (sourcePurchases.length !== 5) blockers.push({ table: TABLES.purchases, reason: '260 错课包订单数量不是 5，停止写入', actual: sourcePurchases.length });
  if (sourceEntitlements.length !== 5) blockers.push({ table: TABLES.entitlements, reason: '260 错课包权益数量不是 5，停止写入', actual: sourceEntitlements.length });

  const sourcePurchaseIds = new Set(sourcePurchases.map(row => String(row.id || '')));
  const sourceEntitlementIds = new Set(sourceEntitlements.map(row => String(row.id || '')));
  const ledgerUpdates = data.entitlementLedger
    .filter(row => sourceEntitlementIds.has(String(row.entitlementId || '')) || sourcePurchaseIds.has(String(row.purchaseId || '')) || String(row.packageId || '') === SOURCE_PACKAGE_ID)
    .map(row => ({
      before: row,
      after: withTrace({
        ...row,
        packageId: master.id,
        packageName: master.name || row.packageName || '',
        originalPackageId: row.originalPackageId || source.id,
        originalPackageName: row.originalPackageName || source.name || row.packageName || '',
        packageMergedAt: now
      }, now, 'zero-foundation-special-package-merge')
    }));

  const scheduleUpdates = data.schedule
    .filter(row => {
      const ids = Array.isArray(row.entitlementIds) ? row.entitlementIds.map(String) : [];
      return sourceEntitlementIds.has(String(row.entitlementId || '')) ||
        ids.some(id => sourceEntitlementIds.has(id)) ||
        sourcePurchaseIds.has(String(row.purchaseId || '')) ||
        String(row.packageId || '') === SOURCE_PACKAGE_ID;
    })
    .map(row => ({
      before: row,
      after: withTrace({
        ...row,
        packageId: master.id,
        packageName: master.name || row.packageName || '',
        originalPackageId: row.originalPackageId || source.id,
        originalPackageName: row.originalPackageName || source.name || row.packageName || '',
        packageMergedAt: now
      }, now, 'zero-foundation-special-package-merge')
    }));

  const purchaseUpdates = sourcePurchases.map(row => ({ before: row, after: normalizePurchase(row, master, source, now) }));
  const entitlementUpdates = sourceEntitlements.map(row => ({ before: row, after: normalizeEntitlement(row, master, source, now) }));
  const sourcePackageUpdate = {
    before: source,
    after: withTrace({
      ...source,
      status: 'merged',
      mergedIntoPackageId: master.id,
      mergedIntoPackageName: master.name || '',
      mergedAt: now,
      mergedBy: 'Codex'
    }, now, 'zero-foundation-special-package-merge')
  };

  const nextEntitlementById = byId(data.entitlements);
  entitlementUpdates.forEach(item => nextEntitlementById.set(String(item.after.id), item.after));
  const touchedStudentIds = [...new Set(sourceEntitlements.map(row => String(row.studentId || '')).filter(Boolean))];
  const activeIndexUpdates = touchedStudentIds.map(studentId => ({
    before: data.activeEntitlementIndex.find(row => String(row.id || row.studentId || '') === studentId) || null,
    after: withTrace({
      id: studentId,
      studentId,
      entitlementIds: [...nextEntitlementById.values()]
        .filter(row => String(row.studentId || '') === studentId && activeEntitlement(row))
        .map(row => String(row.id || ''))
        .filter(Boolean)
    }, now, 'zero-foundation-special-package-active-index-rebuild')
  }));

  return {
    blockers,
    updates: {
      packages: [sourcePackageUpdate],
      purchases: purchaseUpdates,
      entitlements: entitlementUpdates,
      entitlementLedger: ledgerUpdates,
      schedule: scheduleUpdates,
      activeEntitlementIndex: activeIndexUpdates
    },
    summary: {
      sourcePurchases: sourcePurchases.length,
      sourceEntitlements: sourceEntitlements.length,
      ledgerUpdates: ledgerUpdates.length,
      scheduleUpdates: scheduleUpdates.length,
      activeIndexUpdates: activeIndexUpdates.length
    }
  };
}

async function loadData(client) {
  const [master, source, purchases, entitlements, entitlementLedger, schedule, activeEntitlementIndex] = await Promise.all([
    getRow(client, TABLES.packages, MASTER_PACKAGE_ID),
    getRow(client, TABLES.packages, SOURCE_PACKAGE_ID),
    scanTable(client, TABLES.purchases),
    scanTable(client, TABLES.entitlements),
    scanTable(client, TABLES.entitlementLedger),
    scanTable(client, TABLES.schedule),
    scanTable(client, TABLES.activeEntitlementIndex).catch(() => [])
  ]);
  return {
    packages: [master, source].filter(Boolean),
    purchases,
    entitlements,
    entitlementLedger,
    schedule,
    activeEntitlementIndex
  };
}

async function writePlan(client, plan) {
  for (const item of plan.updates.purchases || []) await putRow(client, TABLES.purchases, item.after);
  for (const item of plan.updates.entitlements || []) await putRow(client, TABLES.entitlements, item.after);
  for (const item of plan.updates.entitlementLedger || []) await putRow(client, TABLES.entitlementLedger, item.after);
  for (const item of plan.updates.schedule || []) await putRow(client, TABLES.schedule, item.after);
  for (const item of plan.updates.activeEntitlementIndex || []) await putRow(client, TABLES.activeEntitlementIndex, item.after);
  for (const item of plan.updates.packages || []) await putRow(client, TABLES.packages, item.after);
}

async function run(argv = process.argv.slice(2), deps = {}) {
  const args = parseArgs(argv);
  const target = deps.assertProductionTarget ? await deps.assertProductionTarget(process.env) : await assertProductionWriteTarget({ env: process.env, diagUrl: PROD_DIAG_URL });
  assertProductionWriteTrace({ operationId: OPERATION_ID, batchId: BATCH_ID, reportPath: args.report });
  const client = deps.client || createClientFromEnv();
  const data = deps.data || await loadData(client);
  const plan = buildRepairPlan(data, deps.now || new Date().toISOString());
  const report = {
    target,
    write: args.write,
    operationId: OPERATION_ID,
    batchId: BATCH_ID,
    summary: {
      ...(plan.summary || {}),
      blockers: plan.blockers.length
    },
    blockers: plan.blockers,
    backups: Object.fromEntries(Object.entries(plan.updates || {}).map(([key, items]) => [key, (items || []).map(item => item.before).filter(Boolean)])),
    planned: Object.fromEntries(Object.entries(plan.updates || {}).map(([key, items]) => [key, (items || []).map(item => item.after)]))
  };
  fs.mkdirSync(path.dirname(args.report), { recursive: true });
  fs.writeFileSync(args.report, `${JSON.stringify(report, null, 2)}\n`);
  console.log(JSON.stringify(report.summary, null, 2));
  if (plan.blockers.length) throw new Error('存在阻塞项，停止写入');
  if (!args.write) return { plan, report };
  await writePlan(client, plan);
  console.log('写入完成');
  return { plan, report };
}

if (require.main === module) {
  run().catch(err => {
    console.error(err);
    process.exit(1);
  });
}

module.exports = {
  TABLES,
  MASTER_PACKAGE_ID,
  SOURCE_PACKAGE_ID,
  TARGET_PRICE,
  OPERATION_ID,
  BATCH_ID,
  buildRepairPlan,
  parseArgs,
  run
};
