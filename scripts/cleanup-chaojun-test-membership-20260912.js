#!/usr/bin/env node

const fs = require('fs');
const path = require('path');
const dotenv = require('dotenv');

const { createStorageServices } = require('../server/storage');
const { DEFAULT_CAMPUSES } = require('../server/bootstrap');
const { createCourtFinanceRules } = require('../server/court-finance');
const {
  buildCourtAccountListIndexRowsFromData,
  buildCourtAccountListViewFromIndexRows
} = require('../server/page-data/court-account-list-index.js');
const {
  SNAPSHOT_ACTIVE_DELTA_ID
} = require('../server/page-data/court-account-list-snapshot.js');
const {
  parseWriteFlags,
  assertProductionWriteTarget
} = require('./lib/production-write-guard');

const ROOT = path.join(__dirname, '..');
const REPORT_DIR = path.join(ROOT, 'offline-reports');
const BATCH_ID = 'cleanup-chaojun-test-membership-20260912';
const CLEANUP_REASON = '甄朝珺测试会员脏数据清理：老板测试会员卡功能，非真实会员、无真实充值';

const TARGET = {
  name: '甄朝珺',
  phone: '13001000516',
  campus: 'shunyi_mapo',
  courtId: 'cxe-thirdparty-202606-court-15fc4626a4ab',
  accountId: 'member-reconcile-account-06a5bb794d2e17b9',
  orderId: 'member-reconcile-order-fdc6edc5b5ba3933c59d15e8',
  rechargeHistoryId: 'cxe-reconcile-81e0f8c3a5ce903cbecfa7e6',
  clearHistoryId: 'cxe-reconcile-fe5a7c8763bef96847fa5e41',
  weeklyAffectedDate: '2026-03-23'
};

const TABLES = {
  courts: 'ft_courts',
  students: 'ft_students',
  leads: 'ft_leads',
  campuses: 'ft_campuses',
  membershipAccounts: 'ft_membership_accounts',
  membershipOrders: 'ft_membership_orders',
  membershipPlans: 'ft_membership_plans',
  membershipBenefitLedger: 'ft_membership_benefit_ledger',
  membershipAccountEvents: 'ft_membership_account_events',
  financialLedger: 'ft_financial_ledger',
  courtAccountListIndex: 'ft_court_account_list_index',
  courtAccountListSnapshot: 'ft_court_account_list_snapshot'
};

const { computeCourtFinance } = createCourtFinanceRules();

function text(value) {
  return String(value || '').trim();
}

function money(value) {
  return Math.round((Number(value) || 0) * 100) / 100;
}

function loadEnv() {
  dotenv.config({ path: path.join(ROOT, '.env') });
  dotenv.config({ path: path.join(ROOT, '.env.local'), override: true });
  process.env.STORAGE_OPERATION_TIMEOUT_MS = process.env.STORAGE_OPERATION_TIMEOUT_MS || '60000';
}

function activeMembershipStatus(row) {
  return !['voided', 'cleared', 'inactive', 'deleted', 'cancelled', 'canceled', 'refunded'].includes(text(row?.status || 'active').toLowerCase());
}

function validOrderStatus(row) {
  return !['voided', 'refunded', 'deleted', 'cancelled', 'canceled'].includes(text(row?.status || 'active').toLowerCase());
}

function orderPaidAmount(row = {}) {
  return money(row.rechargeAmount ?? row.finalAmount ?? row.amount ?? row.paidAmount ?? row.actualAmount);
}

function rowKey(row = {}) {
  return text(row.id || row.rowId || row.sourceRecordId || row.sourceId || row.recordId || row.key);
}

function byId(rows = []) {
  return new Map((rows || []).map(row => [text(row?.id), row]).filter(([id]) => id));
}

function campusKey(row = {}) {
  const raw = text(row.campusCode || row.campus || row.campusId || row.campusName);
  if (raw === '顺义马坡' || raw === '马坡') return 'shunyi_mapo';
  return raw;
}

function linkedToTarget(row = {}) {
  const values = [
    row.id,
    row.courtId,
    row.membershipAccountId,
    row.accountId,
    row.membershipOrderId,
    row.orderId,
    row.sourceId,
    row.sourceDocumentId,
    row.relatedId,
    row.refId
  ].map(text);
  return values.includes(TARGET.courtId)
    || values.includes(TARGET.accountId)
    || values.includes(TARGET.orderId);
}

function cleanTargetHistory(history = [], now = new Date().toISOString()) {
  const targetIds = new Set([TARGET.rechargeHistoryId, TARGET.clearHistoryId]);
  let touched = 0;
  const cleaned = (Array.isArray(history) ? history : []).map(row => {
    if (!targetIds.has(rowKey(row))) return row;
    touched += 1;
    const amount = money(row.amount);
    return {
      ...row,
      amount: 0,
      originalAmount: row.originalAmount ?? amount,
      voidedAt: row.voidedAt || now,
      voidedBy: row.voidedBy || 'codex',
      voidedByCleanupBatchId: BATCH_ID,
      cleanupReason: CLEANUP_REASON,
      notes: text(row.notes || row.note)
        ? `${text(row.notes || row.note)}；${CLEANUP_REASON}`
        : CLEANUP_REASON
    };
  });
  return { history: cleaned, touched };
}

function replaceById(rows = [], replacements = []) {
  const map = byId(rows);
  replacements.forEach(row => {
    if (row?.id) map.set(text(row.id), row);
  });
  return [...map.values()];
}

function buildSingleIndexRow(source, { courtAfter, accountAfter, orderAfter } = {}) {
  const rows = buildCourtAccountListIndexRowsFromData({
    campuses: source.campuses?.length ? source.campuses : DEFAULT_CAMPUSES.map(campus => ({ ...campus })),
    students: source.students || [],
    leads: source.leads || [],
    courts: [courtAfter],
    membershipAccounts: replaceById(source.membershipAccounts || [], [accountAfter]),
    membershipOrders: replaceById(source.membershipOrders || [], [orderAfter]),
    membershipPlans: source.membershipPlans || [],
    membershipBenefitLedger: source.membershipBenefitLedger || [],
    membershipAccountEvents: source.membershipAccountEvents || []
  });
  return rows.find(row => text(row.id || row.courtId) === TARGET.courtId) || null;
}

function memberCountFromIndexRows(rows = [], campus = '') {
  const view = buildCourtAccountListViewFromIndexRows(rows || [], {
    accountType: '会员账户',
    ...(campus ? { campus } : {})
  });
  return Number(view?.summary?.membershipFinanceSummary?.memberCount || view?.summary?.totalMemberCount || 0);
}

function rechargeCountFromOrders(orders = []) {
  return (orders || []).filter(row => validOrderStatus(row) && orderPaidAmount(row) > 0).length;
}

function paidAmountFromOrders(orders = []) {
  return money((orders || [])
    .filter(row => validOrderStatus(row))
    .reduce((sum, row) => sum + orderPaidAmount(row), 0));
}

function deriveCountsBefore(source = {}) {
  if (source.countsBefore) return source.countsBefore;
  const indexRows = source.courtAccountListIndexRows || [];
  const platformMemberCount = indexRows.length ? memberCountFromIndexRows(indexRows) : (source.membershipAccounts || []).filter(activeMembershipStatus).length;
  const shunyiMapoMemberCount = indexRows.length
    ? memberCountFromIndexRows(indexRows, TARGET.campus)
    : (source.membershipAccounts || []).filter(row => activeMembershipStatus(row)).filter(row => {
      const court = (source.courts || []).find(item => text(item.id) === text(row.courtId));
      return campusKey(court || row) === TARGET.campus;
    }).length;
  return {
    platformMemberCount,
    shunyiMapoMemberCount,
    platformRechargeCount: rechargeCountFromOrders(source.membershipOrders || []),
    platformPaidAmount: paidAmountFromOrders(source.membershipOrders || [])
  };
}

function buildExpectedAfter(countsBefore = {}, impact = {}) {
  return {
    platformMemberCount: (Number(countsBefore.platformMemberCount) || 0) + impact.memberCountDelta,
    shunyiMapoMemberCount: (Number(countsBefore.shunyiMapoMemberCount) || 0) + impact.shunyiMapoMemberCountDelta,
    platformRechargeCount: (Number(countsBefore.platformRechargeCount) || 0) + impact.rechargeCountDelta,
    platformPaidAmount: money((Number(countsBefore.platformPaidAmount) || 0) + impact.paidAmountDelta)
  };
}

function buildChaojunTestMembershipCleanupPlan({
  courts = [],
  students = [],
  leads = [],
  campuses = [],
  membershipAccounts = [],
  membershipOrders = [],
  membershipPlans = [],
  membershipBenefitLedger = [],
  membershipAccountEvents = [],
  financialLedger = [],
  courtAccountListIndexRows = [],
  countsBefore = null,
  now = new Date().toISOString()
} = {}) {
  const source = {
    courts,
    students,
    leads,
    campuses,
    membershipAccounts,
    membershipOrders,
    membershipPlans,
    membershipBenefitLedger,
    membershipAccountEvents,
    financialLedger,
    courtAccountListIndexRows,
    countsBefore
  };
  const errors = [];
  const court = byId(courts).get(TARGET.courtId);
  const account = byId(membershipAccounts).get(TARGET.accountId);
  const order = byId(membershipOrders).get(TARGET.orderId);
  const targetFinancialLedgerRows = (financialLedger || []).filter(linkedToTarget);
  const targetBenefitRows = (membershipBenefitLedger || []).filter(linkedToTarget);

  if (!court) errors.push(`未找到目标订场用户 ${TARGET.courtId}`);
  if (court && (text(court.name) !== TARGET.name || text(court.phone) !== TARGET.phone)) errors.push('目标订场用户姓名或手机号不匹配');
  if (!account) errors.push(`未找到目标会员账户 ${TARGET.accountId}`);
  if (account && text(account.courtId) !== TARGET.courtId) errors.push('目标会员账户 courtId 不匹配');
  if (!order) errors.push(`未找到目标会员订单 ${TARGET.orderId}`);
  if (order && (text(order.courtId) !== TARGET.courtId || text(order.membershipAccountId) !== TARGET.accountId)) errors.push('目标会员订单关联关系不匹配');
  if (targetFinancialLedgerRows.length) errors.push(`目标存在 ${targetFinancialLedgerRows.length} 条财务总账直接关联，脚本未覆盖该写入面，停止`);
  if (targetBenefitRows.length) errors.push(`目标存在 ${targetBenefitRows.length} 条会员权益流水，脚本未覆盖该写入面，停止`);

  const orderWasValid = !!order && validOrderStatus(order) && orderPaidAmount(order) > 0;
  const accountWasActive = !!account && activeMembershipStatus(account);
  const targetCampus = campusKey(court || {});
  const paidAmountDelta = orderWasValid ? -orderPaidAmount(order) : 0;
  const impact = {
    memberCountDelta: accountWasActive ? -1 : 0,
    shunyiMapoMemberCountDelta: accountWasActive && targetCampus === TARGET.campus ? -1 : 0,
    rechargeCountDelta: orderWasValid ? -1 : 0,
    paidAmountDelta,
    weeklyStoredValueAmountDelta: paidAmountDelta,
    weeklyAffectedDate: TARGET.weeklyAffectedDate
  };
  const beforeCounts = deriveCountsBefore(source);
  const expectedAfter = buildExpectedAfter(beforeCounts, impact);

  if (errors.length) {
    return {
      ok: false,
      batchId: BATCH_ID,
      generatedAt: now,
      errors,
      impact,
      countsBefore: beforeCounts,
      expectedAfter,
      courtUpdates: [],
      accountUpdates: [],
      orderUpdates: [],
      eventCreates: [],
      financialLedgerUpdates: [],
      indexUpserts: [],
      indexDeletes: []
    };
  }

  const cleanedHistory = cleanTargetHistory(court.history, now);
  if (cleanedHistory.touched !== 2) {
    errors.push(`目标订场用户会员充值/清零历史命中 ${cleanedHistory.touched} 条，预期 2 条`);
  }
  let finance;
  try {
    finance = computeCourtFinance({ ...court, history: cleanedHistory.history, allowNegativeBalance: true });
  } catch (err) {
    errors.push(`目标订场用户金额重算失败：${err.message || err}`);
    finance = { balance: 0, totalDeposit: 0, spentAmount: 0, receivedAmount: 0, storedValueSpent: 0, directPaidSpent: 0 };
  }

  const courtAfter = {
    ...court,
    status: court.status || 'active',
    history: cleanedHistory.history,
    cachedBalance: money(finance.balance),
    cachedTotalDeposit: money(finance.totalDeposit),
    cachedTotalSpent: money(finance.spentAmount),
    cachedTotalReceived: money(finance.receivedAmount),
    balance: money(finance.balance),
    totalDeposit: money(finance.totalDeposit),
    spentAmount: money(finance.spentAmount),
    receivedAmount: money(finance.receivedAmount),
    storedValueSpent: money(finance.storedValueSpent),
    directPaidSpent: money(finance.directPaidSpent),
    cleanupBatchId: BATCH_ID,
    cleanupReason: CLEANUP_REASON,
    updatedAt: now
  };
  const accountAfter = {
    ...account,
    status: 'voided',
    voidedAt: account.voidedAt || now,
    voidedBy: account.voidedBy || 'codex',
    voidReason: account.voidReason || CLEANUP_REASON,
    cleanupBatchId: BATCH_ID,
    updatedAt: now
  };
  const orderAfter = {
    ...order,
    status: 'voided',
    voidedAt: order.voidedAt || now,
    voidedBy: order.voidedBy || 'codex',
    voidReason: order.voidReason || CLEANUP_REASON,
    cleanupBatchId: BATCH_ID,
    updatedAt: now
  };
  const eventId = `${BATCH_ID}:${TARGET.accountId}`;
  const eventCreates = (membershipAccountEvents || []).some(row => text(row.id) === eventId)
    ? []
    : [{
      id: eventId,
      membershipAccountId: TARGET.accountId,
      courtId: TARGET.courtId,
      eventType: 'test_membership_cleanup',
      beforeStatus: text(account.status || 'active'),
      afterStatus: 'voided',
      operator: 'codex',
      reason: CLEANUP_REASON,
      batchId: BATCH_ID,
      createdAt: now
    }];
  const indexRow = buildSingleIndexRow(source, { courtAfter, accountAfter, orderAfter });
  if (!indexRow) errors.push('目标订场用户索引重建失败');

  return {
    ok: errors.length === 0,
    batchId: BATCH_ID,
    generatedAt: now,
    errors,
    impact,
    countsBefore: beforeCounts,
    expectedAfter,
    courtUpdates: [{ id: TARGET.courtId, before: court, after: courtAfter }],
    accountUpdates: [{ id: TARGET.accountId, before: account, after: accountAfter }],
    orderUpdates: [{ id: TARGET.orderId, before: order, after: orderAfter }],
    eventCreates,
    financialLedgerUpdates: [],
    indexUpserts: indexRow ? [indexRow] : [],
    indexDeletes: []
  };
}

function reportSafePlan(plan) {
  const indexRow = plan.indexUpserts?.[0] || {};
  const order = plan.orderUpdates?.[0]?.before || {};
  return {
    ok: plan.ok,
    batchId: plan.batchId,
    generatedAt: plan.generatedAt,
    errors: plan.errors,
    target: {
      name: TARGET.name,
      phone: TARGET.phone,
      courtId: TARGET.courtId,
      accountId: TARGET.accountId,
      orderId: TARGET.orderId
    },
    countsBefore: plan.countsBefore,
    expectedAfter: plan.expectedAfter,
    impact: plan.impact,
    businessSide: {
      keepsCourtAccount: plan.courtUpdates?.[0]?.after?.status === 'active',
      courtHistoryRowsVoided: (plan.courtUpdates?.[0]?.after?.history || [])
        .filter(row => [TARGET.rechargeHistoryId, TARGET.clearHistoryId].includes(rowKey(row)))
        .map(row => ({ id: rowKey(row), type: row.type, amount: money(row.amount), originalAmount: money(row.originalAmount) })),
      retainedGuestBookingAmount: money((plan.courtUpdates?.[0]?.after?.history || [])
        .filter(row => rowKey(row) !== TARGET.rechargeHistoryId && rowKey(row) !== TARGET.clearHistoryId)
        .reduce((sum, row) => sum + (row.type === '消费' && String(row.payMethod || '') !== '储值扣款' ? money(row.amount) : 0), 0))
    },
    financeSide: {
      membershipOrderId: TARGET.orderId,
      beforeStatus: order.status || 'active',
      afterStatus: plan.orderUpdates?.[0]?.after?.status || '',
      paidAmountDelta: plan.impact.paidAmountDelta,
      financialLedgerWriteCount: plan.financialLedgerUpdates?.length || 0
    },
    linkSide: {
      indexAction: plan.indexUpserts?.length ? 'upsert' : (plan.indexDeletes?.length ? 'delete' : 'none'),
      snapshotDeltaAction: plan.indexUpserts?.length ? 'upsert' : 'none'
    },
    displaySide: {
      membershipAccountTypeAfter: indexRow.item?.accountType || '',
      membershipStatusAfter: indexRow.item?.membershipStatus || '',
      membershipStatusCodeAfter: indexRow.item?.membershipStatusCode || ''
    },
    weeklyReport: {
      affectedDate: plan.impact.weeklyAffectedDate,
      storedValueAmountDelta: plan.impact.weeklyStoredValueAmountDelta,
      memberCountDelta: plan.impact.shunyiMapoMemberCountDelta,
      expectedShunyiMapoMemberCount: plan.expectedAfter.shunyiMapoMemberCount
    }
  };
}

function writeReport(name, data) {
  fs.mkdirSync(REPORT_DIR, { recursive: true });
  const file = path.join(REPORT_DIR, `${BATCH_ID}-${name}.json`);
  fs.writeFileSync(file, JSON.stringify(data, null, 2));
  return file;
}

function createStorage() {
  return createStorageServices({
    tableStoreConfig: {
      accessKeyId: process.env.ALIBABA_CLOUD_ACCESS_KEY_ID,
      secretAccessKey: process.env.ALIBABA_CLOUD_ACCESS_KEY_SECRET,
      endpoint: process.env.TS_ENDPOINT,
      instanceName: process.env.TS_INSTANCE
    }
  });
}

async function loadRows(storage) {
  const [
    court,
    account,
    order,
    allMembershipAccounts,
    allMembershipOrders,
    campuses,
    membershipPlans,
    membershipBenefitLedger,
    existingCleanupEvent,
    financialLedger,
    courtAccountListIndexRows
  ] = await Promise.all([
    storage.get(TABLES.courts, TARGET.courtId),
    storage.get(TABLES.membershipAccounts, TARGET.accountId),
    storage.get(TABLES.membershipOrders, TARGET.orderId),
    storage.scan(TABLES.membershipAccounts, { columns: ['courtId', 'status', 'createdAt', 'updatedAt'] }),
    storage.scan(TABLES.membershipOrders, { columns: ['courtId', 'membershipAccountId', 'status', 'rechargeAmount', 'finalAmount', 'amount', 'paidAmount', 'actualAmount', 'purchaseDate', 'createdAt'] }),
    storage.scan(TABLES.campuses).catch(() => []),
    storage.scan(TABLES.membershipPlans).catch(() => []),
    storage.scan(TABLES.membershipBenefitLedger, { columns: ['courtId', 'membershipAccountId', 'accountId', 'membershipOrderId', 'orderId', 'sourceId', 'relatedId'] }).catch(() => []),
    storage.get(TABLES.membershipAccountEvents, `${BATCH_ID}:${TARGET.accountId}`).catch(() => null),
    storage.scan(TABLES.financialLedger, { columns: ['courtId', 'membershipAccountId', 'accountId', 'membershipOrderId', 'orderId', 'sourceId', 'sourceDocumentId', 'relatedId', 'refId'] }).catch(() => []),
    storage.scan(TABLES.courtAccountListIndex, { columns: ['courtId', 'item', 'membershipFinanceStats'] }).catch(() => [])
  ]);
  return {
    courts: court ? [court] : [],
    students: [],
    leads: [],
    campuses,
    membershipAccounts: replaceById(allMembershipAccounts || [], account ? [account] : []),
    membershipOrders: replaceById(allMembershipOrders || [], order ? [order] : []),
    membershipPlans,
    membershipBenefitLedger,
    membershipAccountEvents: existingCleanupEvent ? [existingCleanupEvent] : [],
    financialLedger,
    courtAccountListIndexRows
  };
}

async function recordSnapshotDelta(storage, indexRow, now) {
  const current = await storage.get(TABLES.courtAccountListSnapshot, SNAPSHOT_ACTIVE_DELTA_ID).catch(() => null);
  const upserts = new Map((Array.isArray(current?.upserts) ? current.upserts : [])
    .map(row => [text(row.id || row.courtId), row])
    .filter(([id]) => id));
  const deletes = new Set((Array.isArray(current?.deletes) ? current.deletes : []).map(text).filter(Boolean));
  upserts.set(TARGET.courtId, indexRow);
  deletes.delete(TARGET.courtId);
  const next = {
    id: SNAPSHOT_ACTIVE_DELTA_ID,
    type: 'delta',
    upserts: [...upserts.values()],
    deletes: [...deletes.values()],
    count: upserts.size + deletes.size,
    updatedAt: now
  };
  await storage.put(TABLES.courtAccountListSnapshot, SNAPSHOT_ACTIVE_DELTA_ID, next);
  return next;
}

async function applyPlan(storage, plan) {
  for (const item of plan.courtUpdates) await storage.put(TABLES.courts, item.id, item.after);
  for (const item of plan.accountUpdates) await storage.put(TABLES.membershipAccounts, item.id, item.after);
  for (const item of plan.orderUpdates) await storage.put(TABLES.membershipOrders, item.id, item.after);
  for (const item of plan.eventCreates) await storage.put(TABLES.membershipAccountEvents, item.id, item);
  for (const row of plan.indexUpserts) await storage.put(TABLES.courtAccountListIndex, row.id, row);
  const snapshotDelta = plan.indexUpserts[0] ? await recordSnapshotDelta(storage, plan.indexUpserts[0], plan.generatedAt) : null;
  return { snapshotDelta };
}

async function readBack(storage) {
  const [court, account, order, indexRow, delta] = await Promise.all([
    storage.get(TABLES.courts, TARGET.courtId),
    storage.get(TABLES.membershipAccounts, TARGET.accountId),
    storage.get(TABLES.membershipOrders, TARGET.orderId),
    storage.get(TABLES.courtAccountListIndex, TARGET.courtId).catch(() => null),
    storage.get(TABLES.courtAccountListSnapshot, SNAPSHOT_ACTIVE_DELTA_ID).catch(() => null)
  ]);
  const indexRows = await storage.scan(TABLES.courtAccountListIndex).catch(() => []);
  return {
    court: {
      id: court?.id || '',
      status: court?.status || '',
      cachedBalance: money(court?.cachedBalance),
      cachedTotalDeposit: money(court?.cachedTotalDeposit),
      cachedTotalSpent: money(court?.cachedTotalSpent),
      cachedTotalReceived: money(court?.cachedTotalReceived)
    },
    account: {
      id: account?.id || '',
      status: account?.status || '',
      voidedAt: account?.voidedAt || ''
    },
    order: {
      id: order?.id || '',
      status: order?.status || '',
      voidedAt: order?.voidedAt || ''
    },
    index: {
      id: indexRow?.id || '',
      accountType: indexRow?.item?.accountType || '',
      membershipStatusCode: indexRow?.item?.membershipStatusCode || ''
    },
    snapshotDelta: {
      hasTargetUpsert: (delta?.upserts || []).some(row => text(row.id || row.courtId) === TARGET.courtId),
      hasTargetDelete: (delta?.deletes || []).some(id => text(id) === TARGET.courtId),
      count: Number(delta?.count) || 0
    },
    shunyiMapoMemberCount: memberCountFromIndexRows(indexRows, TARGET.campus),
    weeklyReportStoredValueTotalMembers: memberCountFromIndexRows(indexRows, TARGET.campus)
  };
}

function assertReadBack(readBackResult) {
  const failures = [];
  if (readBackResult.court.status !== 'active') failures.push('订场用户未保持 active');
  if (readBackResult.account.status !== 'voided') failures.push('会员账户未作废');
  if (readBackResult.order.status !== 'voided') failures.push('会员订单未作废');
  if (readBackResult.index.accountType !== '普通账户') failures.push('索引展示仍不是普通账户');
  if (!readBackResult.snapshotDelta.hasTargetUpsert || readBackResult.snapshotDelta.hasTargetDelete) failures.push('快照 delta 未正确 upsert 目标订场用户');
  if (readBackResult.shunyiMapoMemberCount !== 57) failures.push(`顺义马坡会员数不是 57，当前 ${readBackResult.shunyiMapoMemberCount}`);
  if (readBackResult.weeklyReportStoredValueTotalMembers !== 57) failures.push(`周报会员总数口径不是 57，当前 ${readBackResult.weeklyReportStoredValueTotalMembers}`);
  if (failures.length) {
    const err = new Error(`回读校验失败：${failures.join('；')}`);
    err.failures = failures;
    throw err;
  }
}

async function main() {
  loadEnv();
  const { write } = parseWriteFlags(process.argv.slice(2));
  const confirm = process.argv.includes('--confirm-production-write');
  if (write && !confirm) throw new Error('写入生产前必须显式加 --confirm-production-write');
  const writeTarget = write ? await assertProductionWriteTarget({ env: process.env }) : null;
  const storage = createStorage();
  const source = await loadRows(storage);
  const plan = buildChaojunTestMembershipCleanupPlan({ ...source, now: new Date().toISOString() });
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
  const backup = writeReport('backup', {
    generatedAt: plan.generatedAt,
    target: safe.target,
    courts: plan.courtUpdates.map(item => item.before),
    membershipAccounts: plan.accountUpdates.map(item => item.before),
    membershipOrders: plan.orderUpdates.map(item => item.before),
    courtAccountListIndexRows: source.courtAccountListIndexRows.filter(row => text(row.id || row.courtId) === TARGET.courtId)
  });
  const applyResult = await applyPlan(storage, plan);
  const readBackResult = await readBack(storage);
  assertReadBack(readBackResult);
  const report = writeReport('write', { ...safe, backup, applyResult, readBack: readBackResult, targetInstance: writeTarget });
  console.log(JSON.stringify({ dryRun: false, report, backup, readBack: readBackResult, target: writeTarget }, null, 2));
}

if (require.main === module) {
  main().catch(err => {
    console.error(err.stack || err.message || String(err));
    process.exit(1);
  });
}

module.exports = {
  TARGET,
  TABLES,
  BATCH_ID,
  buildChaojunTestMembershipCleanupPlan,
  reportSafePlan,
  readBack,
  assertReadBack
};
