#!/usr/bin/env node

const dotenv = require('dotenv');
const { createClientFromEnv, scanTable, putRow, deleteRow } = require('./lib/staging-data-store');
const { assertProductionWriteTarget } = require('./lib/production-write-guard');
const { buildIndexRows, TABLES: INDEX_TABLES } = require('./repair-student-active-entitlement-index-20260522');

const PROD_DIAG_URL = 'https://www.flowtennis.cn/api/diag';
const TABLES = {
  students: 'ft_students',
  purchases: 'ft_purchases',
  entitlements: 'ft_entitlements',
  schedule: 'ft_schedule',
  plans: 'ft_plans',
  feedbacks: 'ft_feedbacks',
  leads: 'ft_leads',
  activeEntitlementIndex: INDEX_TABLES.activeEntitlementIndex
};

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

function replaceIds(value, fromIds, toId) {
  return [...new Set(parseArr(value).map((id) => (fromIds.has(String(id)) ? toId : id)).filter(Boolean))];
}

function keepFilled(left, right) {
  return String(left || '').trim() ? left : right;
}

function compactRow(row) {
  return Object.fromEntries(Object.entries(row).filter(([, value]) => value !== undefined && value !== ''));
}

function buildStudentMergePlan({ keepStudentId, mergeStudentIds, data, now = new Date().toISOString() }) {
  const fromIds = new Set((mergeStudentIds || []).map(String).filter(Boolean));
  const keep = (data.students || []).find((row) => String(row.id) === String(keepStudentId));
  if (!keep) throw new Error(`保留学员不存在：${keepStudentId}`);
  const mergedRows = (data.students || []).filter((row) => fromIds.has(String(row.id)));
  if (!mergedRows.length) throw new Error('没有找到要合并的重复学员');
  const studentUpdate = compactRow(mergedRows.reduce((next, row) => ({
    ...next,
    phone: keepFilled(next.phone, row.phone),
    campus: keepFilled(next.campus, row.campus),
    primaryCoach: keepFilled(next.primaryCoach, row.primaryCoach),
    type: keepFilled(next.type, row.type),
    source: keepFilled(next.source, row.source),
    activityRange: keepFilled(next.activityRange, row.activityRange),
    notes: [next.notes, row.notes].map((v) => String(v || '').trim()).filter(Boolean).join('；')
  }), { ...keep, updatedAt: now }));
  const touchStudent = (row) => ({ ...row, studentId: keepStudentId, studentName: keep.name || row.studentName || '', updatedAt: now });
  const purchaseUpdates = (data.purchases || []).filter((row) => fromIds.has(String(row.studentId))).map(touchStudent);
  const entitlementUpdates = (data.entitlements || []).filter((row) => fromIds.has(String(row.studentId))).map(touchStudent);
  const planUpdates = (data.plans || []).filter((row) => fromIds.has(String(row.studentId))).map(touchStudent);
  const scheduleRows = Array.isArray(data.schedule) ? data.schedule : (Array.isArray(data.schedules) ? data.schedules : []);
  const scheduleUpdates = scheduleRows.filter((row) => parseArr(row.studentIds).some((id) => fromIds.has(String(id))) || fromIds.has(String(row.studentId))).map((row) => ({
    ...row,
    studentId: fromIds.has(String(row.studentId)) ? keepStudentId : row.studentId,
    studentIds: replaceIds(row.studentIds, fromIds, keepStudentId),
    expectedStudentIds: replaceIds(row.expectedStudentIds, fromIds, keepStudentId),
    studentName: keep.name || row.studentName || '',
    updatedAt: now
  }));
  const feedbackUpdates = (data.feedbacks || []).filter((row) => parseArr(row.studentIds).some((id) => fromIds.has(String(id))) || fromIds.has(String(row.studentId))).map((row) => ({
    ...row,
    studentId: fromIds.has(String(row.studentId)) ? keepStudentId : row.studentId,
    studentIds: replaceIds(row.studentIds, fromIds, keepStudentId),
    studentName: keep.name || row.studentName || '',
    updatedAt: now
  }));
  const leadUpdates = (data.leads || []).filter((row) => fromIds.has(String(row.studentId))).map(touchStudent);
  const nextEntitlements = (data.entitlements || []).map((row) => entitlementUpdates.find((item) => item.id === row.id) || row);
  const indexRows = buildIndexRows(nextEntitlements, now).filter((row) => row.id === keepStudentId || fromIds.has(row.id));
  return {
    studentUpdate,
    purchaseUpdates,
    entitlementUpdates,
    scheduleUpdates,
    planUpdates,
    feedbackUpdates,
    leadUpdates,
    indexRows,
    deleteStudentIds: [...fromIds],
    deleteIndexIds: [...fromIds]
  };
}

function printPlan(plan) {
  console.log(JSON.stringify({
    studentUpdate: plan.studentUpdate,
    counts: {
      purchases: plan.purchaseUpdates.length,
      entitlements: plan.entitlementUpdates.length,
      schedule: plan.scheduleUpdates.length,
      plans: plan.planUpdates.length,
      feedbacks: plan.feedbackUpdates.length,
      leads: plan.leadUpdates.length,
      indexes: plan.indexRows.length,
      deleteIndexes: plan.deleteIndexIds.length,
      deleteStudents: plan.deleteStudentIds.length
    },
    deleteStudentIds: plan.deleteStudentIds
  }, null, 2));
}

async function assertProductionTarget() {
  return assertProductionWriteTarget({ diagUrl: PROD_DIAG_URL });
}

async function run(argv = process.argv.slice(2)) {
  const write = argv.includes('--write');
  const keepStudentId = argv[argv.indexOf('--keep') + 1];
  const mergeArg = argv[argv.indexOf('--merge') + 1] || '';
  const mergeStudentIds = mergeArg.split(',').map((id) => id.trim()).filter(Boolean);
  if (!keepStudentId || !mergeStudentIds.length) throw new Error('用法：node scripts/merge-duplicate-students-20260522.js --keep 保留ID --merge 重复ID1,重复ID2 [--write]');
  dotenv.config();
  await assertProductionTarget();
  const client = createClientFromEnv();
  const data = {
    students: await scanTable(client, TABLES.students),
    purchases: await scanTable(client, TABLES.purchases),
    entitlements: await scanTable(client, TABLES.entitlements),
    schedule: await scanTable(client, TABLES.schedule),
    plans: await scanTable(client, TABLES.plans),
    feedbacks: await scanTable(client, TABLES.feedbacks),
    leads: await scanTable(client, TABLES.leads)
  };
  const plan = buildStudentMergePlan({ keepStudentId, mergeStudentIds, data });
  printPlan(plan);
  if (!write) return plan;
  await putRow(client, TABLES.students, plan.studentUpdate);
  for (const row of plan.purchaseUpdates) await putRow(client, TABLES.purchases, row);
  for (const row of plan.entitlementUpdates) await putRow(client, TABLES.entitlements, row);
  for (const row of plan.scheduleUpdates) await putRow(client, TABLES.schedule, row);
  for (const row of plan.planUpdates) await putRow(client, TABLES.plans, row);
  for (const row of plan.feedbackUpdates) await putRow(client, TABLES.feedbacks, row);
  for (const row of plan.leadUpdates) await putRow(client, TABLES.leads, row);
  for (const row of plan.indexRows) await putRow(client, TABLES.activeEntitlementIndex, row);
  for (const id of plan.deleteIndexIds) await deleteRow(client, TABLES.activeEntitlementIndex, id);
  for (const id of plan.deleteStudentIds) await deleteRow(client, TABLES.students, id);
  console.log('合并完成');
  return plan;
}

if (require.main === module) {
  run().catch((err) => {
    console.error(err);
    process.exit(1);
  });
}

module.exports = { TABLES, buildStudentMergePlan, run };
