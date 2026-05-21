#!/usr/bin/env node

const fs = require('fs');
const path = require('path');
const dotenv = require('dotenv');
const { createClientFromEnv, scanTable, putRow, deleteRow } = require('./lib/staging-data-store');
const seed = require('../api/seeds/mabao-finance-seed.json');

const TABLES = {
  packages: 'ft_packages',
  purchases: 'ft_purchases',
  entitlements: 'ft_entitlements'
};

const PROD_DIAG_URL = 'https://www.flowtennis.cn/api/diag';
const OLD_PACKAGE_IDS = new Set([
  'seed-package-adult-1v1-10',
  'seed-package-adult-1v1-history',
  'seed-package-adult-1v2-history',
  'seed-package-youth-1v1-10',
  'seed-package-youth-1v1-history',
  'seed-package-youth-1v2-20',
  'seed-package-youth-1v2-40'
]);

const TARGET_SPECS = {
  '成人1v1 朝珺黄金10课时（历史）': { lessons: 10, price: 6000, courseType: '私教课', productName: '成人1v1私教课', timeBand: '黄金时间', maxStudents: 1, ownerCoach: '朝珺', coachNames: ['朝珺'] },
  '成人1v1 朝珺非黄金10课时': { lessons: 10, price: 5000, courseType: '私教课', productName: '成人1v1私教课', timeBand: '非黄时间', maxStudents: 1, ownerCoach: '朝珺', coachNames: ['朝珺'] },
  '成人1v1 朝珺非黄金10课时（历史）': { lessons: 10, price: 5000, courseType: '私教课', productName: '成人1v1私教课', timeBand: '非黄时间', maxStudents: 1, ownerCoach: '朝珺', coachNames: ['朝珺'] },
  '成人1v1 非黄时间10课时': { lessons: 10, price: 5000, courseType: '私教课', productName: '成人1v1私教课', timeBand: '非黄时间', maxStudents: 1 },
  '成人1v1 非黄时间10课时（历史）': { lessons: 10, price: 5000, courseType: '私教课', productName: '成人1v1私教课', timeBand: '非黄时间', maxStudents: 1 },
  '成人1v1 黄金时间20课时': { lessons: 20, price: 12000, courseType: '私教课', productName: '成人1v1私教课', timeBand: '黄金时间', maxStudents: 1 },
  '成人1v1 黄金时间10课时（历史）': { lessons: 10, price: 6000, courseType: '私教课', productName: '成人1v1私教课', timeBand: '黄金时间', maxStudents: 1 },
  '成人1v1 非黄时间20课时（历史）': { lessons: 20, price: 10000, courseType: '私教课', productName: '成人1v1私教课', timeBand: '非黄时间', maxStudents: 1 },
  '成人1v1 非黄时间50课时（历史）': { lessons: 50, price: 25000, courseType: '私教课', productName: '成人1v1私教课', timeBand: '非黄时间', maxStudents: 1 },
  '青少年1v1 黄金时间20课时（历史）': { lessons: 20, price: 12000, courseType: '私教课', productName: '青少年1v1私教课', timeBand: '黄金时间', maxStudents: 1 },
  '青少年1v1 非黄时间10课时': { lessons: 10, price: 4000, courseType: '私教课', productName: '青少年1v1私教课', timeBand: '非黄时间', maxStudents: 1 },
  '青少年1v1 黄金时间10课时': { lessons: 10, price: 4800, courseType: '私教课', productName: '青少年1v1私教课', timeBand: '黄金时间', maxStudents: 1 },
  '青少年1v1 黄金时间10课时（历史）': { lessons: 10, price: 6000, courseType: '私教课', productName: '青少年1v1私教课', timeBand: '黄金时间', maxStudents: 1 },
  '青少年1v2 黄金时间10课时（历史）': { lessons: 10, price: 7000, courseType: '半私教课', productName: '青少年1v2私教课', timeBand: '黄金时间', maxStudents: 2 },
  '青少年1v2 非黄时间10课时（历史）': { lessons: 10, price: 6000, courseType: '半私教课', productName: '青少年1v2私教课', timeBand: '非黄时间', maxStudents: 2 }
};

const PURCHASE_TARGETS = {
  'seed-purchase-001': '青少年1v1 黄金时间20课时（历史）',
  'seed-purchase-002': '成人1v1 朝珺黄金10课时（历史）',
  'seed-purchase-003': '成人1v1 朝珺黄金10课时（历史）',
  'seed-purchase-005': '成人1v1 非黄时间10课时（历史）',
  'seed-purchase-006': '成人1v1 黄金时间10课时（历史）',
  'seed-renewal-006': '成人1v1 非黄时间50课时（历史）',
  'seed-purchase-007': '青少年1v1 非黄时间10课时',
  'seed-renewal-007': '青少年1v1 黄金时间10课时',
  'seed-purchase-008': '成人1v1 非黄时间10课时（历史）',
  'seed-purchase-009': '成人1v1 非黄时间10课时（历史）',
  'seed-purchase-010': '成人1v1 黄金时间10课时（历史）',
  'seed-purchase-011': '成人1v1 黄金时间10课时（历史）',
  'seed-purchase-014': '成人1v1 朝珺黄金10课时（历史）',
  'seed-purchase-015': '成人1v1 非黄时间10课时（历史）',
  'seed-purchase-016': '成人1v1 朝珺黄金10课时（历史）',
  'seed-purchase-017': '成人1v1 朝珺黄金10课时（历史）',
  'seed-purchase-018': '成人1v1 朝珺黄金10课时（历史）',
  'seed-purchase-019': '成人1v1 非黄时间10课时（历史）',
  'seed-purchase-020': '成人1v1 黄金时间10课时（历史）',
  'seed-purchase-021': '成人1v1 非黄时间10课时（历史）',
  'seed-purchase-022': '成人1v1 非黄时间10课时（历史）',
  'seed-purchase-023': '成人1v1 非黄时间10课时（历史）',
  'seed-purchase-024': '成人1v1 非黄时间20课时（历史）',
  'seed-purchase-025': '成人1v1 非黄时间10课时（历史）',
  'seed-purchase-026': '成人1v1 非黄时间10课时（历史）',
  'seed-purchase-027': '青少年1v1 黄金时间10课时',
  'seed-purchase-028': '青少年1v1 黄金时间10课时',
  'seed-purchase-029': '成人1v1 非黄时间10课时（历史）',
  'seed-purchase-030': '成人1v1 非黄时间10课时（历史）',
  'seed-purchase-031': '成人1v1 非黄时间10课时（历史）',
  'seed-purchase-032': '成人1v1 黄金时间10课时（历史）',
  'seed-purchase-033': '成人1v1 非黄时间10课时（历史）',
  'seed-purchase-034': '成人1v1 黄金时间10课时（历史）',
  'seed-purchase-035': '成人1v1 非黄时间10课时',
  'seed-purchase-036': '成人1v1 朝珺非黄金10课时',
  'seed-purchase-037': '青少年1v1 黄金时间10课时',
  'seed-purchase-038': '成人1v1 非黄时间10课时',
  'seed-renewal-038': '成人1v1 非黄时间20课时（历史）',
  'seed-purchase-039': '成人1v1 非黄时间10课时',
  'seed-purchase-040': '成人1v1 黄金时间20课时',
  'seed-purchase-041': '成人1v1 非黄时间10课时',
  'seed-purchase-042': '成人1v1 非黄时间10课时',
  'seed-purchase-043': '成人1v1 非黄时间10课时',
  'seed-purchase-044': '成人1v1 非黄时间10课时',
  'seed-purchase-045': '成人1v1 非黄时间10课时'
};

const NOT_IN_SYSTEM = new Set(['seed-purchase-012', 'seed-purchase-013']);

const SPLIT_PURCHASES = {
  'seed-purchase-004': [
    { suffix: 'gold', targetName: '青少年1v2 黄金时间10课时（历史）', lessons: 10, amountPaid: 5500 },
    { suffix: 'nonprime', targetName: '青少年1v2 非黄时间10课时（历史）', lessons: 10, amountPaid: 5500 }
  ]
};

function inferTargetName(purchase = {}) {
  const studentName = String(purchase.studentName || '').trim();
  const packageName = String(purchase.packageName || '').trim();
  const lessons = Number(purchase.packageLessons) || 0;
  if (studentName === '朦朦') return '成人1v1 黄金时间10课时（历史）';
  if (studentName === '简先生') return '成人1v1 非黄时间10课时（历史）';
  if (/淇淇/.test(studentName) || /张佳良/.test(studentName)) return '青少年1v1 黄金时间10课时';
  if (/青少年1v1/.test(packageName)) return '青少年1v1 黄金时间10课时';
  if (/成人1v1/.test(packageName) && lessons === 20) return '成人1v1 黄金时间20课时';
  if (/成人1v1/.test(packageName)) return '成人1v1 非黄时间10课时';
  return '';
}

function nowInChinaTime() {
  const date = new Date(Date.now() + 8 * 60 * 60 * 1000);
  return `${date.toISOString().slice(0, 19)}+08:00`;
}

function slug(value) {
  return String(value || '').replace(/[^\w\u4e00-\u9fa5]+/g, '-').replace(/^-+|-+$/g, '').toLowerCase();
}

function packageIdForName(name) {
  return `fix-20260521-${slug(name)}`.slice(0, 120);
}

function normalizeName(value) {
  return String(value || '').trim().replace(/\s+/g, ' ');
}

function findUniquePackage(packages, name) {
  const matches = (packages || []).filter((row) => normalizeName(row.name) === normalizeName(name));
  if (matches.length > 1) return { error: `目标课包重名：${name}` };
  return { package: matches[0] || null };
}

function buildPackage(name, now) {
  const spec = TARGET_SPECS[name];
  if (!spec) throw new Error(`缺少目标课包规格：${name}`);
  const sourceProduct = (seed.products || []).find((row) => row.name === spec.productName) || {};
  return {
    id: packageIdForName(name),
    name,
    productId: sourceProduct.id || '',
    productName: spec.productName || '',
    courseType: spec.courseType || '',
    lessons: spec.lessons || 0,
    price: spec.price || 0,
    validDays: spec.validDays || 0,
    saleStartDate: '',
    saleEndDate: '',
    usageStartDate: '',
    usageEndDate: '',
    dailyTimeWindows: [],
    timeBand: spec.timeBand || '',
    ownerCoach: spec.ownerCoach || '',
    coachIds: spec.coachNames || [],
    coachNames: spec.coachNames || [],
    campusIds: ['mabao'],
    maxStudents: spec.maxStudents || 1,
    status: 'active',
    sourceType: 'package_ownership_fix_20260521',
    createdAt: now,
    updatedAt: now
  };
}

function applyPackageSnapshot(row, targetPackage, sourcePackage, now, kind) {
  const next = {
    ...row,
    packageId: targetPackage.id,
    packageName: targetPackage.name || '',
    productId: targetPackage.productId || row.productId || '',
    productName: targetPackage.productName || row.productName || '',
    courseType: targetPackage.courseType || row.courseType || '',
    timeBand: kind === 'entitlement' ? (targetPackage.timeBand || row.timeBand || '') : row.timeBand,
    packageTimeBand: kind === 'purchase' ? (targetPackage.timeBand || row.packageTimeBand || '') : row.packageTimeBand,
    dailyTimeWindows: targetPackage.dailyTimeWindows || [],
    coachIds: targetPackage.coachIds || row.coachIds || [],
    coachNames: targetPackage.coachNames || row.coachNames || [],
    ownerCoach: row.ownerCoach || targetPackage.ownerCoach || '',
    campusIds: targetPackage.campusIds || row.campusIds || [],
    maxStudents: targetPackage.maxStudents || row.maxStudents || 1,
    originalPackageId: row.originalPackageId || row.packageId || sourcePackage?.id || '',
    originalPackageName: row.originalPackageName || row.packageName || sourcePackage?.name || '',
    packageOwnershipFixedAt: now,
    updatedAt: now
  };
  if (kind === 'purchase') {
    next.packagePrice = Number(targetPackage.price) || Number(row.packagePrice) || 0;
    next.systemAmount = Number(targetPackage.price) || Number(row.systemAmount) || 0;
    next.priceSource = 'package';
    next.priceSourceId = targetPackage.id;
    next.priceSourceName = targetPackage.name || '';
    next.priceOverridden = Number(next.systemAmount || 0) !== Number(next.amountPaid || next.finalAmount || 0);
    if (next.priceOverridden && !next.overrideReason) next.overrideReason = '历史导入实际成交价';
  }
  return next;
}

function allocateSplitLessons(totalUsed, index, count) {
  const used = Number(totalUsed) || 0;
  const base = Math.floor(used / count);
  const extra = index < (used % count) ? 1 : 0;
  return base + extra;
}

function buildSplitRows(purchase, entitlements, targetByName, sourcePackage, now) {
  const rules = SPLIT_PURCHASES[purchase.id] || [];
  const sourceEntitlements = (entitlements || []).filter((row) => String(row.purchaseId || '') === String(purchase.id || ''));
  const sourceEntitlement = sourceEntitlements[0] || {};
  const purchaseUpdates = [];
  const entitlementUpdates = [];
  rules.forEach((rule, index) => {
    const targetPackage = targetByName.get(rule.targetName);
    if (!targetPackage) return;
    const purchaseId = `${purchase.id}-${rule.suffix}`;
    purchaseUpdates.push(applyPackageSnapshot({
      ...purchase,
      id: purchaseId,
      packageLessons: rule.lessons,
      amountPaid: rule.amountPaid,
      finalAmount: rule.amountPaid,
      splitFromPurchaseId: purchase.id
    }, targetPackage, sourcePackage, now, 'purchase'));
    if (sourceEntitlement.id) {
      const usedLessons = allocateSplitLessons(sourceEntitlement.usedLessons, index, rules.length);
      entitlementUpdates.push(applyPackageSnapshot({
        ...sourceEntitlement,
        id: `${sourceEntitlement.id}-${rule.suffix}`,
        purchaseId,
        totalLessons: rule.lessons,
        usedLessons,
        remainingLessons: Math.max(0, rule.lessons - usedLessons),
        splitFromEntitlementId: sourceEntitlement.id
      }, targetPackage, sourcePackage, now, 'entitlement'));
    }
  });
  const voidedPurchase = {
    ...purchase,
    packageId: '',
    packageName: `${purchase.packageName || ''}（已拆分）`.trim(),
    status: 'voided',
    voidReason: '课包归属修正：拆分为黄金/非黄两条订单',
    voidedAt: now,
    packageOwnershipFixedAt: now,
    updatedAt: now
  };
  const voidedEntitlements = sourceEntitlements.map((row) => ({
    ...row,
    packageId: '',
    packageName: `${row.packageName || ''}（已拆分）`.trim(),
    status: 'voided',
    voidReason: '课包归属修正：拆分为黄金/非黄两条权益',
    voidedAt: now,
    packageOwnershipFixedAt: now,
    updatedAt: now
  }));
  return { purchaseUpdates: [voidedPurchase, ...purchaseUpdates], entitlementUpdates: [...voidedEntitlements, ...entitlementUpdates] };
}

function buildVoidedRowsForNotInSystem(purchase, entitlements, now) {
  return {
    purchaseUpdates: [{
      ...purchase,
      packageId: '',
      packageName: `${purchase.packageName || ''}（不进系统）`.trim(),
      status: 'voided',
      voidReason: '不录入系统：情况复杂，课包归属清理',
      voidedAt: now,
      packageOwnershipFixedAt: now,
      updatedAt: now
    }],
    entitlementUpdates: (entitlements || []).filter((row) => String(row.purchaseId || '') === String(purchase.id || '')).map((row) => ({
      ...row,
      packageId: '',
      packageName: `${row.packageName || ''}（不进系统）`.trim(),
      status: 'voided',
      voidReason: '不录入系统：情况复杂，课包归属清理',
      voidedAt: now,
      packageOwnershipFixedAt: now,
      updatedAt: now
    }))
  };
}

function buildPackageOwnershipPlan({ packages = [], purchases = [], entitlements = [], now = nowInChinaTime() } = {}) {
  const plan = { creates: [], purchaseUpdates: [], entitlementUpdates: [], packageDeletes: [], blockers: [], skips: [] };
  const packageById = new Map((packages || []).map((row) => [String(row.id || ''), row]));
  const targetByName = new Map();
  const requiredTargetNames = new Set([...Object.values(PURCHASE_TARGETS), ...Object.values(SPLIT_PURCHASES).flat().map((rule) => rule.targetName)]);

  for (const name of requiredTargetNames) {
    const found = findUniquePackage(packages, name);
    if (found.error) {
      plan.blockers.push(found.error);
      continue;
    }
    if (found.package) {
      targetByName.set(name, found.package);
    } else {
      const created = buildPackage(name, now);
      targetByName.set(name, created);
      plan.creates.push(created);
    }
  }

  for (const purchase of purchases || []) {
    if (!OLD_PACKAGE_IDS.has(String(purchase.packageId || ''))) continue;
    if (NOT_IN_SYSTEM.has(String(purchase.id || ''))) {
      const voided = buildVoidedRowsForNotInSystem(purchase, entitlements, now);
      plan.purchaseUpdates.push(...voided.purchaseUpdates);
      plan.entitlementUpdates.push(...voided.entitlementUpdates);
      plan.skips.push(`${purchase.studentName || purchase.id} 不进系统，作废旧订单/权益`);
      continue;
    }
    if (SPLIT_PURCHASES[purchase.id]) {
      const sourcePackage = packageById.get(String(purchase.packageId || '')) || {};
      const split = buildSplitRows(purchase, entitlements, targetByName, sourcePackage, now);
      plan.purchaseUpdates.push(...split.purchaseUpdates);
      plan.entitlementUpdates.push(...split.entitlementUpdates);
      continue;
    }
    const targetName = PURCHASE_TARGETS[purchase.id] || inferTargetName(purchase);
    if (!targetName) {
      plan.blockers.push(`未明确归属：${purchase.id} ${purchase.studentName || ''} ${purchase.packageName || ''}`.trim());
      continue;
    }
    const targetPackage = targetByName.get(targetName);
    if (!targetPackage) continue;
    const sourcePackage = packageById.get(String(purchase.packageId || '')) || {};
    plan.purchaseUpdates.push(applyPackageSnapshot(purchase, targetPackage, sourcePackage, now, 'purchase'));
    for (const entitlement of (entitlements || []).filter((row) => String(row.purchaseId || '') === String(purchase.id || ''))) {
      plan.entitlementUpdates.push(applyPackageSnapshot(entitlement, targetPackage, sourcePackage, now, 'entitlement'));
    }
  }

  const nextPurchasePackageIds = new Set((purchases || []).map((row) => {
    const updated = plan.purchaseUpdates.find((next) => next.id === row.id);
    return String((updated || row).packageId || '');
  }));
  const nextEntitlementPackageIds = new Set((entitlements || []).map((row) => {
    const updated = plan.entitlementUpdates.find((next) => next.id === row.id);
    return String((updated || row).packageId || '');
  }));

  for (const pkg of packages || []) {
    if (!OLD_PACKAGE_IDS.has(String(pkg.id || ''))) continue;
    if (nextPurchasePackageIds.has(String(pkg.id)) || nextEntitlementPackageIds.has(String(pkg.id))) {
      plan.blockers.push(`旧课包仍有引用，不能删除：${pkg.name || pkg.id}`);
    } else {
      plan.packageDeletes.push(pkg);
    }
  }

  return plan;
}

function printPlan(plan) {
  console.log(`创建课包：${plan.creates.length}`);
  plan.creates.forEach((row) => console.log(`+ ${row.name}`));
  console.log(`迁移订单：${plan.purchaseUpdates.length}`);
  console.log(`迁移权益：${plan.entitlementUpdates.length}`);
  console.log(`可删除旧课包：${plan.packageDeletes.length}`);
  plan.packageDeletes.forEach((row) => console.log(`- ${row.name}`));
  if (plan.skips.length) console.log(`跳过：${plan.skips.join('；')}`);
  if (plan.blockers.length) {
    console.log('阻塞：');
    plan.blockers.forEach((item) => console.log(`! ${item}`));
  }
}

function loadEnvFile(filePath) {
  if (!filePath) return;
  const resolved = path.resolve(filePath);
  if (!fs.existsSync(resolved)) throw new Error(`找不到环境变量文件：${resolved}`);
  dotenv.config({ path: resolved, override: true });
}

async function assertProductionTarget() {
  const res = await fetch(PROD_DIAG_URL);
  if (!res.ok) throw new Error(`线上 diag 请求失败：${res.status}`);
  const diag = await res.json();
  const onlineEndpoint = String(diag.TS_ENDPOINT || diag.env?.TS_ENDPOINT || '').trim();
  const onlineInstance = String(diag.TS_INSTANCE || diag.env?.TS_INSTANCE || '').trim();
  const localEndpoint = String(process.env.TS_ENDPOINT || '').trim();
  const localInstance = String(process.env.TS_INSTANCE || process.env.TARGET_TS_INSTANCE || '').trim();
  if (localEndpoint !== onlineEndpoint || localInstance !== onlineInstance) {
    throw new Error(`停止写入：本地目标 ${localEndpoint} / ${localInstance} 与线上 ${onlineEndpoint} / ${onlineInstance} 不一致`);
  }
  return { onlineEndpoint, onlineInstance, localEndpoint, localInstance };
}

async function run(argv = process.argv.slice(2)) {
  const write = argv.includes('--write');
  const offlineSeed = argv.includes('--offline-seed');
  const envArg = argv.find((item) => item.startsWith('--env-file='));
  loadEnvFile(envArg ? envArg.split('=').slice(1).join('=') : '');

  let data;
  if (offlineSeed) {
    data = { packages: seed.packages, purchases: seed.purchases, entitlements: seed.entitlements };
  } else {
    await assertProductionTarget();
    const client = createClientFromEnv();
    data = {
      packages: await scanTable(client, TABLES.packages),
      purchases: await scanTable(client, TABLES.purchases),
      entitlements: await scanTable(client, TABLES.entitlements),
      client
    };
  }

  const plan = buildPackageOwnershipPlan(data);
  printPlan(plan);
  if (plan.blockers.length) throw new Error('存在阻塞项，未写入');
  if (!write) return plan;
  if (offlineSeed) throw new Error('offline-seed 不允许写入');

  for (const row of plan.creates) await putRow(data.client, TABLES.packages, row);
  for (const row of plan.purchaseUpdates) await putRow(data.client, TABLES.purchases, row);
  for (const row of plan.entitlementUpdates) await putRow(data.client, TABLES.entitlements, row);
  for (const row of plan.packageDeletes) await deleteRow(data.client, TABLES.packages, row.id);
  console.log('写入完成');
  return plan;
}

if (require.main === module) {
  run().catch((err) => {
    console.error(err.message);
    process.exit(1);
  });
}

module.exports = {
  OLD_PACKAGE_IDS,
  TARGET_SPECS,
  PURCHASE_TARGETS,
  SPLIT_PURCHASES,
  NOT_IN_SYSTEM,
  buildPackageOwnershipPlan,
  applyPackageSnapshot,
  assertProductionTarget
};
