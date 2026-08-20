#!/usr/bin/env node
const fs = require('fs');
const path = require('path');
const dotenv = require('dotenv');
const { createStorageServices } = require('../server/storage');

const ROOT = path.join(__dirname, '..');
const REPORT_DIR = path.join(ROOT, 'offline-reports');
const BATCH_ID = 'cleanup-duplicate-memberships-20260820';
const DUPLICATE_MEMBERSHIP_TARGETS = [
  {
    courtId: 'member-reconcile-court-f5998ae128e29ffc',
    name: '秋明',
    phone: '13911851999',
    reason: '重复会员账户：保留 18600689666 的有余额账户'
  },
  {
    courtId: 'c0c73176-1e1c-4fc8-849e-b821789da154',
    name: '许女士',
    phone: '15101648989',
    reason: '重复会员账户：保留 15101648986 的有余额账户'
  }
];

const TABLES = {
  courts: 'ft_courts',
  membershipAccounts: 'ft_membership_accounts',
  membershipOrders: 'ft_membership_orders',
  membershipAccountEvents: 'ft_membership_account_events',
  courtAccountListIndex: 'ft_court_account_list_index',
  courtAccountListSnapshot: 'ft_court_account_list_snapshot'
};

function text(value) {
  return String(value || '').trim();
}

function loadEnv() {
  dotenv.config({ path: path.join(ROOT, '.env.local') });
  dotenv.config({ path: path.join(ROOT, '.env') });
}

function activeStatus(row) {
  return !['voided', 'cleared', 'inactive', 'deleted', 'cancelled', 'canceled', 'refunded'].includes(text(row?.status || 'active'));
}

function byId(rows = []) {
  return new Map((rows || []).map((row) => [text(row?.id), row]).filter(([id]) => id));
}

function courtMatchesTarget(court, target) {
  return text(court?.id) === target.courtId
    && text(court?.name) === target.name
    && text(court?.phone) === target.phone;
}

function buildDuplicateMembershipCleanupPlan({ courts = [], membershipAccounts = [], membershipOrders = [], membershipAccountEvents = [], now = new Date().toISOString() } = {}) {
  const courtMap = byId(courts);
  const errors = [];
  const courtUpdates = [];
  const accountUpdates = [];
  const orderUpdates = [];
  const eventCreates = [];
  const indexDeletes = [];
  const touchedAccountIds = new Set();

  for (const target of DUPLICATE_MEMBERSHIP_TARGETS) {
    const court = courtMap.get(target.courtId);
    if (!court) {
      errors.push(`未找到订场用户 ${target.courtId}`);
      continue;
    }
    if (!courtMatchesTarget(court, target)) {
      errors.push(`订场用户身份不匹配 ${target.courtId}`);
      continue;
    }
    const balance = Number(court.cachedBalance ?? court.balance ?? 0) || 0;
    if (balance !== 0) {
      errors.push(`订场用户 ${target.name} ${target.phone} 余额不是 0，停止清理`);
      continue;
    }

    courtUpdates.push({
      id: court.id,
      before: court,
      after: {
        ...court,
        status: 'inactive',
        deletedAt: court.deletedAt || now,
        duplicateCleanupBatchId: BATCH_ID,
        duplicateCleanupReason: target.reason,
        updatedAt: now
      }
    });
    indexDeletes.push(court.id);

    const accounts = membershipAccounts.filter((account) => text(account?.courtId) === target.courtId && activeStatus(account));
    for (const account of accounts) {
      touchedAccountIds.add(text(account.id));
      accountUpdates.push({
        id: account.id,
        before: account,
        after: {
          ...account,
          status: 'cleared',
          clearedAt: account.clearedAt || now,
          duplicateCleanupBatchId: BATCH_ID,
          duplicateCleanupReason: target.reason,
          updatedAt: now
        }
      });
      const eventId = `${BATCH_ID}:${account.id}`;
      if (!membershipAccountEvents.some((event) => text(event?.id) === eventId)) {
        eventCreates.push({
          id: eventId,
          membershipAccountId: account.id,
          courtId: target.courtId,
          eventType: 'duplicate_cleanup',
          beforeStatus: text(account.status || 'active'),
          afterStatus: 'cleared',
          operator: 'codex',
          reason: target.reason,
          createdAt: now,
          batchId: BATCH_ID
        });
      }
    }
  }

  for (const order of membershipOrders) {
    const courtId = text(order?.courtId);
    const accountId = text(order?.membershipAccountId);
    const targetCourt = DUPLICATE_MEMBERSHIP_TARGETS.find((target) => target.courtId === courtId);
    if (!targetCourt && !touchedAccountIds.has(accountId)) continue;
    if (!activeStatus(order)) continue;
    orderUpdates.push({
      id: order.id,
      before: order,
      after: {
        ...order,
        status: 'voided',
        voidedAt: order.voidedAt || now,
        voidedBy: 'codex',
        voidReason: (targetCourt?.reason || '重复会员账户清理'),
        duplicateCleanupBatchId: BATCH_ID,
        updatedAt: now
      }
    });
  }

  return {
    ok: errors.length === 0,
    batchId: BATCH_ID,
    generatedAt: now,
    targetInstance: {
      endpoint: process.env.TS_ENDPOINT || '',
      instance: process.env.TS_INSTANCE || ''
    },
    errors,
    courtUpdates,
    accountUpdates,
    orderUpdates,
    eventCreates,
    indexDeletes
  };
}

function reportSafePlan(plan) {
  return {
    ok: plan.ok,
    batchId: plan.batchId,
    generatedAt: plan.generatedAt,
    targetInstance: plan.targetInstance,
    errors: plan.errors,
    courtUpdates: plan.courtUpdates.map((item) => ({
      id: item.id,
      name: item.before.name,
      phone: item.before.phone,
      beforeStatus: item.before.status || 'active',
      afterStatus: item.after.status,
      balance: Number(item.before.cachedBalance ?? item.before.balance ?? 0) || 0
    })),
    accountUpdates: plan.accountUpdates.map((item) => ({
      id: item.id,
      courtId: item.before.courtId,
      beforeStatus: item.before.status || 'active',
      afterStatus: item.after.status
    })),
    orderUpdates: plan.orderUpdates.map((item) => ({
      id: item.id,
      courtId: item.before.courtId,
      membershipAccountId: item.before.membershipAccountId,
      beforeStatus: item.before.status || 'active',
      afterStatus: item.after.status,
      rechargeAmount: Number(item.before.rechargeAmount ?? item.before.finalAmount ?? item.before.amount ?? 0) || 0,
      bonusAmount: Number(item.before.bonusAmount || 0) || 0
    })),
    eventCreates: plan.eventCreates.map((item) => ({
      id: item.id,
      courtId: item.courtId,
      membershipAccountId: item.membershipAccountId,
      eventType: item.eventType
    })),
    indexDeletes: plan.indexDeletes
  };
}

function writeReport(name, data) {
  fs.mkdirSync(REPORT_DIR, { recursive: true });
  const file = path.join(REPORT_DIR, `${BATCH_ID}-${name}.json`);
  fs.writeFileSync(file, JSON.stringify(data, null, 2));
  return file;
}

async function loadRows(storage) {
  const [courts, membershipAccounts, membershipOrders, membershipAccountEvents] = await Promise.all([
    storage.scan(TABLES.courts),
    storage.scan(TABLES.membershipAccounts),
    storage.scan(TABLES.membershipOrders),
    storage.scan(TABLES.membershipAccountEvents).catch(() => [])
  ]);
  return { courts, membershipAccounts, membershipOrders, membershipAccountEvents };
}

async function applyPlan(storage, plan) {
  for (const item of plan.courtUpdates) await storage.put(TABLES.courts, item.id, item.after);
  for (const item of plan.accountUpdates) await storage.put(TABLES.membershipAccounts, item.id, item.after);
  for (const item of plan.orderUpdates) await storage.put(TABLES.membershipOrders, item.id, item.after);
  for (const item of plan.eventCreates) await storage.put(TABLES.membershipAccountEvents, item.id, item);
  for (const id of plan.indexDeletes) {
    await storage.del(TABLES.courtAccountListIndex, id).catch(() => null);
  }
  const delta = await storage.get(TABLES.courtAccountListSnapshot, 'active:delta').catch(() => null);
  const deletes = new Set([...(Array.isArray(delta?.deletes) ? delta.deletes : []), ...plan.indexDeletes].map(text).filter(Boolean));
  const upserts = (Array.isArray(delta?.upserts) ? delta.upserts : []).filter((row) => !deletes.has(text(row?.id || row?.courtId)));
  await storage.put(TABLES.courtAccountListSnapshot, 'active:delta', {
    id: 'active:delta',
    type: 'delta',
    upserts,
    deletes: [...deletes],
    count: upserts.length + deletes.size,
    updatedAt: plan.generatedAt
  }).catch(() => null);
}

async function main() {
  loadEnv();
  const write = process.argv.includes('--write');
  const confirm = process.argv.includes('--confirm-production-write');
  if (write && !confirm) throw new Error('写入生产前必须显式加 --confirm-production-write');
  const storage = createStorageServices({
    tableStoreConfig: {
      accessKeyId: process.env.ALIBABA_CLOUD_ACCESS_KEY_ID,
      secretAccessKey: process.env.ALIBABA_CLOUD_ACCESS_KEY_SECRET,
      endpoint: process.env.TS_ENDPOINT,
      instanceName: process.env.TS_INSTANCE
    }
  });
  const source = await loadRows(storage);
  const plan = buildDuplicateMembershipCleanupPlan({ ...source, now: new Date().toISOString() });
  const safe = reportSafePlan(plan);
  if (!plan.ok) {
    const report = writeReport('blocked', safe);
    console.log(JSON.stringify({ dryRun: !write, blocked: true, report, errors: plan.errors }, null, 2));
    process.exitCode = 1;
    return;
  }
  if (!write) {
    const report = writeReport('dry-run', safe);
    console.log(JSON.stringify({ dryRun: true, report, ...safe }, null, 2));
    return;
  }
  await applyPlan(storage, plan);
  const report = writeReport('write', safe);
  console.log(JSON.stringify({ dryRun: false, report, ...safe }, null, 2));
}

if (require.main === module) {
  main().catch((err) => {
    console.error(err.stack || err.message || String(err));
    process.exit(1);
  });
}

module.exports = {
  DUPLICATE_MEMBERSHIP_TARGETS,
  buildDuplicateMembershipCleanupPlan,
  reportSafePlan
};
