#!/usr/bin/env node

const dotenv = require('dotenv');
const { createClientFromEnv, scanTable, putRow } = require('./lib/staging-data-store');

const PROD_DIAG_URL = 'https://www.flowtennis.cn/api/diag';
const DEFAULT_FROM_NAME = '刘润扬教练';
const DEFAULT_TO_NAME = '刘润扬';
const DEFAULT_ACCOUNT_MAPPINGS = [
  { fromName: '刘润扬教练', toUserId: 'liuruny' },
  { fromName: 'RIVE教练', toUserId: 'rive_tianhao' },
  { fromName: '天昊', toUserId: 'rive_tianhao' },
  { fromName: 'rive', toUserId: 'rive_tianhao' },
  { fromName: 'Rive天昊', toUserId: 'rive_tianhao' },
  { fromName: 'River天昊', toUserId: 'rive_tianhao' }
];

const TABLES = {
  coaches: 'ft_coaches',
  users: 'ft_users',
  schedule: 'ft_schedule',
  classes: 'ft_classes',
  plans: 'ft_plans',
  students: 'ft_students',
  feedbacks: 'ft_feedbacks',
  packages: 'ft_packages',
  purchases: 'ft_purchases',
  entitlements: 'ft_entitlements',
  membershipPlans: 'ft_membership_plans',
  membershipOrders: 'ft_membership_orders',
  membershipBenefitLedger: 'ft_membership_benefit_ledger'
};

function argValue(argv, name, fallback = '') {
  const idx = argv.indexOf(name);
  return idx >= 0 ? String(argv[idx + 1] || '').trim() : fallback;
}

function parseArr(value) {
  if (Array.isArray(value)) return value;
  if (!value) return [];
  try {
    const parsed = JSON.parse(value);
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return String(value).split(',').map((item) => item.trim()).filter(Boolean);
  }
}

function uniq(list) {
  return [...new Set((list || []).map((item) => String(item || '').trim()).filter(Boolean))];
}

function sameText(a, b) {
  return String(a || '').trim() === String(b || '').trim();
}

function replaceCoachName(value, fromName, toName) {
  return sameText(value, fromName) ? toName : value;
}

function replaceCoachId(value, fromIds, toId) {
  return fromIds.has(String(value || '').trim()) ? toId : value;
}

function replaceNameArray(value, fromName, toName) {
  return uniq(parseArr(value).map((item) => replaceCoachName(item, fromName, toName)));
}

function replaceIdArray(value, fromIds, toId) {
  return uniq(parseArr(value).map((item) => replaceCoachId(item, fromIds, toId)));
}

function hasOwn(row, field) {
  return Object.prototype.hasOwnProperty.call(row || {}, field);
}

function replaceNameArrayField(row, field, fromName, toName) {
  if (!hasOwn(row, field)) return row[field];
  const before = parseArr(row[field]);
  const after = replaceNameArray(row[field], fromName, toName);
  return before.length || after.length ? after : row[field];
}

function replaceIdArrayField(row, field, fromIds, toId) {
  if (!hasOwn(row, field)) return row[field];
  const before = parseArr(row[field]);
  const after = replaceIdArray(row[field], fromIds, toId);
  return before.length || after.length ? after : row[field];
}

function rowChanged(before, after) {
  return JSON.stringify(before) !== JSON.stringify(after);
}

function buildUpdateRows(rows, mapper, now) {
  return (rows || []).map((row) => {
    const next = mapper(row);
    return rowChanged(row, next) ? { ...next, updatedAt: now } : null;
  }).filter(Boolean);
}

function buildCoachRenameDryRunPlan({ fromName = DEFAULT_FROM_NAME, toName = DEFAULT_TO_NAME, data = {}, now = new Date().toISOString() } = {}) {
  const source = String(fromName || '').trim();
  const target = String(toName || '').trim();
  if (!source || !target) throw new Error('fromName 和 toName 不能为空');
  if (source === target) throw new Error('fromName 和 toName 相同，不需要修数');

  const keepCoach = (data.coaches || []).find((row) => sameText(row.name, target));
  const aliasCoaches = (data.coaches || []).filter((row) => sameText(row.name, source));
  const keepCoachId = String(keepCoach?.id || '').trim();
  const aliasCoachIds = uniq(aliasCoaches.map((row) => row.id));
  const fromIds = new Set(aliasCoachIds);

  const rewriteBasicCoachRef = (row, coachField = 'coach', coachIdField = 'coachId') => ({
    ...row,
    [coachField]: replaceCoachName(row[coachField], source, target),
    [coachIdField]: keepCoachId ? replaceCoachId(row[coachIdField], fromIds, keepCoachId) : row[coachIdField]
  });

  const rewriteOwnerCoachRef = (row) => {
    const next = { ...row, ownerCoach: replaceCoachName(row.ownerCoach, source, target) };
    if (hasOwn(row, 'coachNames')) next.coachNames = replaceNameArrayField(row, 'coachNames', source, target);
    if (hasOwn(row, 'allowedCoaches')) next.allowedCoaches = replaceNameArrayField(row, 'allowedCoaches', source, target);
    if (hasOwn(row, 'coachIds')) next.coachIds = keepCoachId ? replaceIdArrayField(row, 'coachIds', fromIds, keepCoachId) : row.coachIds;
    return next;
  };

  const rewriteDesignatedCoachRef = (row) => {
    const next = { ...row };
    if (hasOwn(row, 'designatedCoachIds')) {
      next.designatedCoachIds = keepCoachId ? replaceIdArrayField(row, 'designatedCoachIds', fromIds, keepCoachId) : row.designatedCoachIds;
    }
    return next;
  };

  const updates = {
    users: buildUpdateRows(data.users, (row) => ({
      ...row,
      coachName: replaceCoachName(row.coachName, source, target),
      coachId: keepCoachId ? replaceCoachId(row.coachId, fromIds, keepCoachId) : row.coachId
    }), now),
    schedule: buildUpdateRows(data.schedule, (row) => rewriteBasicCoachRef(row), now),
    classes: buildUpdateRows(data.classes, (row) => rewriteBasicCoachRef(row), now),
    plans: buildUpdateRows(data.plans, (row) => rewriteBasicCoachRef(row), now),
    students: buildUpdateRows(data.students, (row) => ({
      ...row,
      primaryCoach: replaceCoachName(row.primaryCoach, source, target),
      primaryCoachId: keepCoachId ? replaceCoachId(row.primaryCoachId, fromIds, keepCoachId) : row.primaryCoachId
    }), now),
    feedbacks: buildUpdateRows(data.feedbacks, (row) => rewriteBasicCoachRef(row), now),
    packages: buildUpdateRows(data.packages, rewriteOwnerCoachRef, now),
    purchases: buildUpdateRows(data.purchases, rewriteOwnerCoachRef, now),
    entitlements: buildUpdateRows(data.entitlements, rewriteOwnerCoachRef, now),
    membershipPlans: buildUpdateRows(data.membershipPlans, rewriteDesignatedCoachRef, now),
    membershipOrders: buildUpdateRows(data.membershipOrders, rewriteDesignatedCoachRef, now),
    membershipBenefitLedger: buildUpdateRows(data.membershipBenefitLedger, rewriteDesignatedCoachRef, now)
  };

  const counts = Object.fromEntries(Object.entries(updates).map(([key, rows]) => [key, rows.length]));
  return {
    dryRunOnly: true,
    fromName: source,
    toName: target,
    coachRows: {
      keepCoachId: keepCoachId || '',
      aliasCoachIds,
      duplicateAction: aliasCoachIds.length ? 'delete-alias-coach-row-after-confirmation' : 'none'
    },
    counts,
    tableNames: TABLES,
    updateIds: Object.fromEntries(Object.entries(updates).map(([key, rows]) => [key, rows.map((row) => row.id)])),
    updates
  };
}

function resolveAccountMapping(mapping, data) {
  const userKey = String(mapping.toUserId || mapping.userId || '').trim();
  const user = (data.users || []).find((row) => String(row.id || '').trim() === userKey || String(row.username || '').trim() === userKey);
  const targetName = String(mapping.toName || user?.coachName || user?.name || '').trim();
  const coach = (data.coaches || []).find((row) => sameText(row.name, targetName));
  const targetCoachId = String(mapping.toCoachId || user?.coachId || coach?.id || '').trim();
  if (!targetName) throw new Error(`找不到目标教练账号名：${userKey || mapping.fromName}`);
  return {
    fromName: String(mapping.fromName || '').trim(),
    targetName,
    targetCoachId,
    aliasCoachIds: uniq([
      ...(mapping.fromCoachIds || []),
      ...(data.coaches || []).filter((row) => sameText(row.name, mapping.fromName)).map((row) => row.id)
    ])
  };
}

function buildCoachAccountNameRepairPlan({ mappings = DEFAULT_ACCOUNT_MAPPINGS, data = {}, now = new Date().toISOString() } = {}) {
  const resolved = mappings.map((mapping) => resolveAccountMapping(mapping, data)).filter((mapping) => mapping.fromName && mapping.targetName && mapping.fromName !== mapping.targetName);
  const sourceToTarget = new Map();
  const idToTarget = new Map();
  resolved.forEach((mapping) => {
    sourceToTarget.set(mapping.fromName, mapping);
    mapping.aliasCoachIds.forEach((id) => idToTarget.set(String(id || '').trim(), mapping));
  });
  const targetFor = (value) => sourceToTarget.get(String(value || '').trim()) || idToTarget.get(String(value || '').trim()) || null;
  const replaceNameValue = (value) => targetFor(value)?.targetName || value;
  const replaceIdValue = (value) => {
    const target = targetFor(value);
    if (!target) return value;
    return target.targetCoachId || target.targetName;
  };
  const replaceNameList = (value) => {
    const list = parseArr(value);
    return uniq(list.map(replaceNameValue));
  };
  const replaceIdList = (value) => {
    const list = parseArr(value);
    return uniq(list.map(replaceIdValue));
  };
  const maybeNameList = (row, field) => {
    if (!hasOwn(row, field)) return row[field];
    const before = parseArr(row[field]);
    const after = replaceNameList(row[field]);
    return before.length || after.length ? after : row[field];
  };
  const maybeIdList = (row, field) => {
    if (!hasOwn(row, field)) return row[field];
    const before = parseArr(row[field]);
    const after = replaceIdList(row[field]);
    return before.length || after.length ? after : row[field];
  };
  const rewriteBasicCoachRef = (row, coachField = 'coach', coachIdField = 'coachId') => ({
    ...row,
    [coachField]: replaceNameValue(row[coachField]),
    [coachIdField]: replaceIdValue(row[coachIdField])
  });
  const rewriteOwnerCoachRef = (row) => {
    const next = { ...row, ownerCoach: replaceNameValue(row.ownerCoach) };
    if (hasOwn(row, 'coachNames')) next.coachNames = maybeNameList(row, 'coachNames');
    if (hasOwn(row, 'allowedCoaches')) next.allowedCoaches = maybeNameList(row, 'allowedCoaches');
    if (hasOwn(row, 'coachIds')) next.coachIds = maybeIdList(row, 'coachIds');
    return next;
  };
  const rewriteDesignatedCoachRef = (row) => {
    const next = { ...row };
    if (hasOwn(row, 'designatedCoachIds')) next.designatedCoachIds = maybeIdList(row, 'designatedCoachIds');
    return next;
  };
  const updates = {
    users: buildUpdateRows(data.users, (row) => ({
      ...row,
      coachName: replaceNameValue(row.coachName),
      coachId: replaceIdValue(row.coachId)
    }), now),
    schedule: buildUpdateRows(data.schedule, (row) => rewriteBasicCoachRef(row), now),
    classes: buildUpdateRows(data.classes, (row) => rewriteBasicCoachRef(row), now),
    plans: buildUpdateRows(data.plans, (row) => rewriteBasicCoachRef(row), now),
    students: buildUpdateRows(data.students, (row) => ({
      ...row,
      primaryCoach: replaceNameValue(row.primaryCoach),
      primaryCoachId: replaceIdValue(row.primaryCoachId)
    }), now),
    feedbacks: buildUpdateRows(data.feedbacks, (row) => rewriteBasicCoachRef(row), now),
    packages: buildUpdateRows(data.packages, rewriteOwnerCoachRef, now),
    purchases: buildUpdateRows(data.purchases, rewriteOwnerCoachRef, now),
    entitlements: buildUpdateRows(data.entitlements, rewriteOwnerCoachRef, now),
    membershipPlans: buildUpdateRows(data.membershipPlans, rewriteDesignatedCoachRef, now),
    membershipOrders: buildUpdateRows(data.membershipOrders, rewriteDesignatedCoachRef, now),
    membershipBenefitLedger: buildUpdateRows(data.membershipBenefitLedger, rewriteDesignatedCoachRef, now)
  };
  const counts = Object.fromEntries(Object.entries(updates).map(([key, rows]) => [key, rows.length]));
  return {
    dryRunOnly: true,
    mode: 'account-name-repair',
    mappings: resolved.map((mapping) => ({
      fromName: mapping.fromName,
      toName: mapping.targetName,
      toCoachId: mapping.targetCoachId,
      aliasCoachIds: mapping.aliasCoachIds
    })),
    counts,
    tableNames: TABLES,
    updateIds: Object.fromEntries(Object.entries(updates).map(([key, rows]) => [key, rows.map((row) => row.id)])),
    updates
  };
}

function compactPreview(plan, target) {
  return {
    dryRunOnly: true,
    target,
    mode: plan.mode || 'single-name-repair',
    mappings: plan.mappings,
    fromName: plan.fromName,
    toName: plan.toName,
    coachRows: plan.coachRows,
    counts: plan.counts,
    updateIds: plan.updateIds
  };
}

async function assertReadTarget() {
  const res = await fetch(PROD_DIAG_URL, { headers: { 'Cache-Control': 'no-cache' } });
  if (!res.ok) throw new Error(`线上 diag 失败：${res.status}`);
  const diag = await res.json();
  const onlineEndpoint = String(diag.TS_ENDPOINT || diag.env?.TS_ENDPOINT || '').trim();
  const onlineInstance = String(diag.TS_INSTANCE || diag.env?.TS_INSTANCE || '').trim();
  const localEndpoint = String(process.env.TS_ENDPOINT || '').trim();
  const localInstance = String(process.env.TS_INSTANCE || process.env.TARGET_TS_INSTANCE || '').trim();
  if (localEndpoint !== onlineEndpoint || localInstance !== onlineInstance) {
    throw new Error(`停止 dry-run：本地目标 ${localEndpoint} / ${localInstance} 与线上 ${onlineEndpoint} / ${onlineInstance} 不一致`);
  }
  return { onlineEndpoint, onlineInstance, localEndpoint, localInstance };
}

async function scanAll(client) {
  const entries = await Promise.all(Object.entries(TABLES).map(async ([key, table]) => {
    try {
      return [key, await scanTable(client, table)];
    } catch (err) {
      return [key, [], String(err.message || err)];
    }
  }));
  return entries.reduce((acc, item) => {
    acc[item[0]] = item[1];
    if (item[2]) {
      acc.scanErrors = acc.scanErrors || {};
      acc.scanErrors[item[0]] = item[2];
    }
    return acc;
  }, {});
}

async function run(argv = process.argv.slice(2)) {
  const write = argv.includes('--write');
  dotenv.config();
  const fromName = argValue(argv, '--from', DEFAULT_FROM_NAME);
  const toName = argValue(argv, '--to', DEFAULT_TO_NAME);
  const target = await assertReadTarget();
  const client = createClientFromEnv();
  const data = await scanAll(client);
  const plan = (argv.includes('--from') || argv.includes('--to'))
    ? buildCoachRenameDryRunPlan({ fromName, toName, data })
    : buildCoachAccountNameRepairPlan({ data });
  const preview = compactPreview(plan, target);
  if (data.scanErrors) preview.scanErrors = data.scanErrors;
  console.log(JSON.stringify(preview, null, 2));
  if (write) {
    for (const [key, rows] of Object.entries(plan.updates)) {
      for (const row of rows) await putRow(client, TABLES[key], row);
    }
    console.log('写入完成');
  }
  return plan;
}

if (require.main === module) {
  run().catch((err) => {
    console.error(err);
    process.exit(1);
  });
}

module.exports = {
  DEFAULT_FROM_NAME,
  DEFAULT_TO_NAME,
  DEFAULT_ACCOUNT_MAPPINGS,
  TABLES,
  buildCoachRenameDryRunPlan,
  buildCoachAccountNameRepairPlan,
  compactPreview,
  run
};
