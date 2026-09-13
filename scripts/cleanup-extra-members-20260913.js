#!/usr/bin/env node

const fs = require('fs');
const path = require('path');
const dotenv = require('dotenv');
const { createStorageServices } = require('../server/storage');
const { parseWriteFlags, assertProductionWriteTarget } = require('./lib/production-write-guard');

const ROOT = path.join(__dirname, '..');
const REPORT_DIR = path.join(ROOT, 'offline-reports');
const BATCH_ID = 'cleanup-extra-members-20260913';
const CLEANUP_REASON = '会员列表多余账户永久作废：确认不是有效会员，禁止恢复为会员';

const TARGETS = [
  {
    courtId: 'third-party-court-a4708ae3-fd29-4b3a-9cfe-ca8ac4f75530',
    accountId: 'd359890a-5e44-4176-af29-117acfc686e2',
    name: '翟建阳',
    phone: '16600221145'
  },
  {
    courtId: '3d9a8fef-bc2c-48de-833f-be807ce21fd7',
    accountId: 'aa5b05df-4189-4186-9631-b1e6cc35c1af',
    name: '张老师（巡天老鼠）',
    phone: ''
  }
];

const TABLES = {
  courts: 'ft_courts',
  membershipAccounts: 'ft_membership_accounts',
  membershipOrders: 'ft_membership_orders',
  membershipBenefitLedger: 'ft_membership_benefit_ledger',
  membershipAccountEvents: 'ft_membership_account_events',
  courtAccountListIndex: 'ft_court_account_list_index',
  courtAccountListSnapshot: 'ft_court_account_list_snapshot'
};

function text(value) {
  return String(value || '').trim();
}

function activeStatus(row) {
  return !['voided', 'cleared', 'inactive', 'deleted', 'cancelled', 'canceled', 'refunded'].includes(text(row?.status || 'active').toLowerCase());
}

function byId(rows = []) {
  return new Map((rows || []).map((row) => [text(row?.id), row]).filter(([id]) => id));
}

function loadEnv() {
  dotenv.config({ path: path.join(ROOT, '.env.local') });
  dotenv.config({ path: path.join(ROOT, '.env') });
  process.env.STORAGE_OPERATION_TIMEOUT_MS = process.env.STORAGE_OPERATION_TIMEOUT_MS || '60000';
}

function rowLinkedToTarget(row = {}, target) {
  const values = [
    row.id,
    row.courtId,
    row.membershipAccountId,
    row.accountId,
    row.membershipOrderId,
    row.orderId,
    row.sourceId,
    row.relatedId
  ].map(text);
  return values.includes(target.courtId) || values.includes(target.accountId);
}

function identityMatches(court = {}, target = {}) {
  if (text(court.id) !== target.courtId) return false;
  if (text(court.name) !== target.name) return false;
  if (target.phone && text(court.phone) !== target.phone) return false;
  return true;
}

function permanentCourtUpdate(court, target, now) {
  return {
    ...court,
    status: 'inactive',
    deletedAt: court.deletedAt || now,
    permanentlyVoidedAt: court.permanentlyVoidedAt || now,
    permanentlyVoidedBy: 'codex',
    noRestore: true,
    extraMemberCleanupBatchId: BATCH_ID,
    extraMemberCleanupReason: CLEANUP_REASON,
    updatedAt: now
  };
}

function voidAccount(account, target, now) {
  return {
    ...account,
    status: 'voided',
    voidedAt: account.voidedAt || now,
    voidedBy: 'codex',
    voidReason: CLEANUP_REASON,
    noRestore: true,
    extraMemberCleanupBatchId: BATCH_ID,
    updatedAt: now
  };
}

function voidOrder(order, now) {
  return {
    ...order,
    status: 'voided',
    voidedAt: order.voidedAt || now,
    voidedBy: 'codex',
    voidReason: CLEANUP_REASON,
    extraMemberCleanupBatchId: BATCH_ID,
    updatedAt: now
  };
}

function voidBenefitLedger(row, now) {
  return {
    ...row,
    status: 'voided',
    voidedAt: row.voidedAt || now,
    voidedBy: 'codex',
    voidReason: CLEANUP_REASON,
    extraMemberCleanupBatchId: BATCH_ID,
    updatedAt: now
  };
}

function buildExtraMembersCleanupPlan({
  courts = [],
  membershipAccounts = [],
  membershipOrders = [],
  membershipBenefitLedger = [],
  membershipAccountEvents = [],
  now = new Date().toISOString()
} = {}) {
  const courtMap = byId(courts);
  const accountMap = byId(membershipAccounts);
  const errors = [];
  const courtUpdates = [];
  const accountUpdates = [];
  const orderUpdates = [];
  const benefitLedgerUpdates = [];
  const eventCreates = [];
  const indexDeletes = [];

  for (const target of TARGETS) {
    const court = courtMap.get(target.courtId);
    const account = accountMap.get(target.accountId);
    if (!court) {
      errors.push(`未找到订场/会员用户 ${target.courtId}`);
      continue;
    }
    if (!identityMatches(court, target)) {
      errors.push(`用户身份不匹配 ${target.courtId}`);
      continue;
    }
    if (!account || text(account.courtId) !== target.courtId) {
      errors.push(`会员账户身份不匹配 ${target.accountId}`);
      continue;
    }

    courtUpdates.push({ id: target.courtId, before: court, after: permanentCourtUpdate(court, target, now) });
    indexDeletes.push(target.courtId);

    const relatedAccounts = membershipAccounts.filter((row) => text(row.courtId) === target.courtId && activeStatus(row));
    for (const relatedAccount of relatedAccounts) {
      accountUpdates.push({ id: relatedAccount.id, before: relatedAccount, after: voidAccount(relatedAccount, target, now) });
      const eventId = `${BATCH_ID}:${relatedAccount.id}`;
      if (!membershipAccountEvents.some((event) => text(event.id) === eventId)) {
        eventCreates.push({
          id: eventId,
          membershipAccountId: relatedAccount.id,
          courtId: target.courtId,
          eventType: 'permanent_void',
          beforeStatus: text(relatedAccount.status || 'active'),
          afterStatus: 'voided',
          operator: 'codex',
          reason: CLEANUP_REASON,
          createdAt: now,
          batchId: BATCH_ID
        });
      }
    }

    membershipOrders
      .filter((row) => rowLinkedToTarget(row, target) && activeStatus(row))
      .forEach((row) => orderUpdates.push({ id: row.id, before: row, after: voidOrder(row, now) }));
    membershipBenefitLedger
      .filter((row) => rowLinkedToTarget(row, target) && activeStatus(row))
      .forEach((row) => benefitLedgerUpdates.push({ id: row.id, before: row, after: voidBenefitLedger(row, now) }));
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
    benefitLedgerUpdates,
    eventCreates,
    indexDeletes: [...new Set(indexDeletes)]
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
      phone: item.before.phone || '',
      beforeStatus: item.before.status || 'active',
      afterStatus: item.after.status,
      noRestore: item.after.noRestore === true
    })),
    accountUpdates: plan.accountUpdates.map((item) => ({
      id: item.id,
      courtId: item.before.courtId,
      beforeStatus: item.before.status || 'active',
      afterStatus: item.after.status,
      noRestore: item.after.noRestore === true
    })),
    orderUpdates: plan.orderUpdates.map((item) => ({
      id: item.id,
      courtId: item.before.courtId,
      membershipAccountId: item.before.membershipAccountId,
      beforeStatus: item.before.status || 'active',
      afterStatus: item.after.status
    })),
    benefitLedgerUpdates: plan.benefitLedgerUpdates.map((item) => ({
      id: item.id,
      courtId: item.before.courtId,
      membershipAccountId: item.before.membershipAccountId,
      beforeStatus: item.before.status || 'active',
      afterStatus: item.after.status
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
  const [courts, membershipAccounts, membershipOrders, membershipBenefitLedger, membershipAccountEvents] = await Promise.all([
    Promise.all(TARGETS.map((target) => storage.get(TABLES.courts, target.courtId).catch(() => null))),
    Promise.all(TARGETS.map((target) => storage.get(TABLES.membershipAccounts, target.accountId).catch(() => null))),
    storage.scan(TABLES.membershipOrders),
    storage.scan(TABLES.membershipBenefitLedger).catch(() => []),
    storage.scan(TABLES.membershipAccountEvents).catch(() => [])
  ]);
  return {
    courts: courts.filter(Boolean),
    membershipAccounts: membershipAccounts.filter(Boolean),
    membershipOrders,
    membershipBenefitLedger,
    membershipAccountEvents
  };
}

async function applyPlan(storage, plan) {
  for (const item of plan.courtUpdates) await storage.put(TABLES.courts, item.id, item.after);
  for (const item of plan.accountUpdates) await storage.put(TABLES.membershipAccounts, item.id, item.after);
  for (const item of plan.orderUpdates) await storage.put(TABLES.membershipOrders, item.id, item.after);
  for (const item of plan.benefitLedgerUpdates) await storage.put(TABLES.membershipBenefitLedger, item.id, item.after);
  for (const item of plan.eventCreates) await storage.put(TABLES.membershipAccountEvents, item.id, item);
  for (const id of plan.indexDeletes) await storage.del(TABLES.courtAccountListIndex, id).catch(() => null);
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
  const { write } = parseWriteFlags(process.argv.slice(2));
  const confirm = process.argv.includes('--confirm-production-write');
  if (write && !confirm) throw new Error('写入生产前必须显式加 --confirm-production-write');
  const writeTarget = write ? await assertProductionWriteTarget({ env: process.env }) : null;
  const storage = createStorageServices({
    tableStoreConfig: {
      accessKeyId: process.env.ALIBABA_CLOUD_ACCESS_KEY_ID,
      secretAccessKey: process.env.ALIBABA_CLOUD_ACCESS_KEY_SECRET,
      endpoint: process.env.TS_ENDPOINT,
      instanceName: process.env.TS_INSTANCE
    }
  });
  const plan = buildExtraMembersCleanupPlan({ ...(await loadRows(storage)), now: new Date().toISOString() });
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
  console.log(JSON.stringify({ dryRun: false, report, target: writeTarget, ...safe }, null, 2));
}

if (require.main === module) {
  main().catch((err) => {
    console.error(err.stack || err.message || String(err));
    process.exit(1);
  });
}

module.exports = {
  TARGETS,
  buildExtraMembersCleanupPlan,
  reportSafePlan
};
