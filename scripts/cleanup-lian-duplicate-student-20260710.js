#!/usr/bin/env node

const fs = require('fs');
const path = require('path');
const dotenv = require('dotenv');
const { createClientFromEnv, scanTable, putRow, deleteRow } = require('./lib/staging-data-store');
const { assertProductionWriteTarget } = require('./lib/production-write-guard');

const PROD_DIAG_URL = 'https://www.flowtennis.cn/api/diag';
const KEEP_STUDENT_ID = 'import-student-dffc7714-0c0f-e3a5-ab90-a9cfbad91d24';
const DUPLICATE_STUDENT_ID = 'a255bd93-4eb7-4a4d-bb9c-b86a1681702d';
const CANONICAL_LEAD_ID = 'a7049269-4cd9-4a4f-ae9a-6d920fbc5da1';
const DUPLICATE_LEAD_ID = 'lead-from-student-a255bd93-4eb7-4a4d-bb9c-b86a1681702d';
const MATERIALIZED_DUPLICATE_LEAD_ID = 'lead-from-student-import-student-dffc7714-0c0f-e3a5-ab90-a9cfbad91d24';
const DUPLICATE_LEAD_IDS = [DUPLICATE_LEAD_ID, MATERIALIZED_DUPLICATE_LEAD_ID];
const CANONICAL_NAME = '莲儿（连女士）';
const OPERATION_ID = 'cleanup-lian-duplicate-student-20260710';

const TABLES = {
  students: 'ft_students',
  leads: 'ft_leads',
  purchases: 'ft_purchases',
  entitlements: 'ft_entitlements',
  entitlementLedger: 'ft_entitlement_ledger',
  schedule: 'ft_schedule',
  plans: 'ft_plans',
  feedbacks: 'ft_feedbacks',
  activeEntitlementIndex: 'ft_student_active_entitlement_index'
};

function parseArr(value) {
  if (Array.isArray(value)) return value.map(String);
  if (!value) return [];
  try {
    const parsed = JSON.parse(value);
    return Array.isArray(parsed) ? parsed.map(String) : [];
  } catch {
    return String(value).split(',').map(item => item.trim()).filter(Boolean);
  }
}

function hasStudentRef(row = {}, studentId = '') {
  return String(row.studentId || '') === studentId
    || parseArr(row.studentIds).includes(studentId)
    || parseArr(row.expectedStudentIds).includes(studentId);
}

function withCanonicalStudentName(row = {}, now = '') {
  return { ...row, studentName: CANONICAL_NAME, updatedAt: now };
}

function reportPath() {
  return path.join(__dirname, '..', '_exports', `${OPERATION_ID}.json`);
}

function buildCleanupPlan(data, now = new Date().toISOString()) {
  const keepStudent = data.students.find(row => String(row.id) === KEEP_STUDENT_ID);
  const duplicateStudent = data.students.find(row => String(row.id) === DUPLICATE_STUDENT_ID);
  const canonicalLead = data.leads.find(row => String(row.id) === CANONICAL_LEAD_ID);
  const duplicateLeads = data.leads.filter(row => DUPLICATE_LEAD_IDS.includes(String(row.id)));
  if (!keepStudent) throw new Error(`保留学员不存在：${KEEP_STUDENT_ID}`);
  if (String(keepStudent.name || '') !== CANONICAL_NAME) throw new Error(`保留对象姓名异常：${keepStudent.name || ''}`);
  if (duplicateStudent && String(duplicateStudent.name || '') !== '莲儿') throw new Error(`重复对象姓名异常：${duplicateStudent.name || ''}`);
  if (!canonicalLead) throw new Error(`主线索不存在：${CANONICAL_LEAD_ID}`);

  const duplicateRefs = {
    purchases: data.purchases.filter(row => hasStudentRef(row, DUPLICATE_STUDENT_ID)),
    entitlements: data.entitlements.filter(row => hasStudentRef(row, DUPLICATE_STUDENT_ID)),
    entitlementLedger: data.entitlementLedger.filter(row => hasStudentRef(row, DUPLICATE_STUDENT_ID)),
    schedule: data.schedule.filter(row => hasStudentRef(row, DUPLICATE_STUDENT_ID)),
    plans: data.plans.filter(row => hasStudentRef(row, DUPLICATE_STUDENT_ID)),
    feedbacks: data.feedbacks.filter(row => hasStudentRef(row, DUPLICATE_STUDENT_ID))
  };
  const blockingRefs = Object.entries(duplicateRefs).filter(([, rows]) => rows.length);
  if (blockingRefs.length) {
    throw new Error(`重复空学员仍被业务表引用，停止清理：${blockingRefs.map(([name, rows]) => `${name}=${rows.length}`).join(', ')}`);
  }

  const canonicalLeadUpdate = {
    ...canonicalLead,
    displayName: CANONICAL_NAME,
    wechatName: CANONICAL_NAME,
    studentName: CANONICAL_NAME,
    studentId: KEEP_STUDENT_ID,
    isCourseConverted: true,
    updatedAt: now
  };
  const purchaseUpdates = data.purchases
    .filter(row => String(row.studentId || '') === KEEP_STUDENT_ID && String(row.studentName || '') !== CANONICAL_NAME)
    .map(row => withCanonicalStudentName(row, now));
  const entitlementUpdates = data.entitlements
    .filter(row => String(row.studentId || '') === KEEP_STUDENT_ID && String(row.studentName || '') !== CANONICAL_NAME)
    .map(row => withCanonicalStudentName(row, now));
  const ledgerUpdates = data.entitlementLedger
    .filter(row => String(row.studentId || '') === KEEP_STUDENT_ID && String(row.studentName || '') && String(row.studentName || '') !== CANONICAL_NAME)
    .map(row => withCanonicalStudentName(row, now));
  const scheduleUpdates = data.schedule
    .filter(row => hasStudentRef(row, KEEP_STUDENT_ID) && String(row.studentName || '') && String(row.studentName || '') !== CANONICAL_NAME)
    .map(row => withCanonicalStudentName(row, now));
  const feedbackUpdates = data.feedbacks
    .filter(row => hasStudentRef(row, KEEP_STUDENT_ID) && String(row.studentName || '') && String(row.studentName || '') !== CANONICAL_NAME)
    .map(row => withCanonicalStudentName(row, now));

  return {
    now,
    keepStudent,
    duplicateStudent,
    canonicalLead,
    duplicateLeads,
    canonicalLeadUpdate,
    purchaseUpdates,
    entitlementUpdates,
    ledgerUpdates,
    scheduleUpdates,
    feedbackUpdates,
    deleteStudentId: duplicateStudent ? DUPLICATE_STUDENT_ID : '',
    deleteLeadIds: duplicateLeads.map(row => String(row.id)),
    deleteIndexId: duplicateStudent ? DUPLICATE_STUDENT_ID : ''
  };
}

function summarizePlan(plan, diag) {
  return {
    operationId: OPERATION_ID,
    generatedAt: plan.now,
    writeTarget: diag,
    keepStudentId: KEEP_STUDENT_ID,
    duplicateStudentId: DUPLICATE_STUDENT_ID,
    canonicalLeadId: CANONICAL_LEAD_ID,
    duplicateLeadIds: DUPLICATE_LEAD_IDS,
    counts: {
      purchaseUpdates: plan.purchaseUpdates.length,
      entitlementUpdates: plan.entitlementUpdates.length,
      ledgerUpdates: plan.ledgerUpdates.length,
      scheduleUpdates: plan.scheduleUpdates.length,
      feedbackUpdates: plan.feedbackUpdates.length,
      deleteStudent: plan.deleteStudentId ? 1 : 0,
      deleteLead: plan.deleteLeadIds.length,
      deleteActiveIndex: plan.deleteIndexId ? 1 : 0
    },
    before: {
      keepStudent: plan.keepStudent,
      duplicateStudent: plan.duplicateStudent || null,
      canonicalLead: plan.canonicalLead,
      duplicateLeads: plan.duplicateLeads
    },
    after: {
      canonicalLead: plan.canonicalLeadUpdate
    },
    updates: {
      purchases: plan.purchaseUpdates.map(row => row.id),
      entitlements: plan.entitlementUpdates.map(row => row.id),
      entitlementLedger: plan.ledgerUpdates.map(row => row.id),
      schedule: plan.scheduleUpdates.map(row => row.id),
      feedbacks: plan.feedbackUpdates.map(row => row.id)
    }
  };
}

async function run(argv = process.argv.slice(2)) {
  const write = argv.includes('--write');
  dotenv.config();
  const diag = await assertProductionWriteTarget({ diagUrl: PROD_DIAG_URL });
  const client = createClientFromEnv();
  const data = {};
  for (const [key, table] of Object.entries(TABLES)) {
    data[key] = await scanTable(client, table).catch(() => []);
  }
  const plan = buildCleanupPlan(data);
  const summary = summarizePlan(plan, diag);
  fs.mkdirSync(path.dirname(reportPath()), { recursive: true });
  fs.writeFileSync(reportPath(), `${JSON.stringify(summary, null, 2)}\n`);
  console.log(JSON.stringify(summary, null, 2));
  if (!write) return summary;

  await putRow(client, TABLES.leads, plan.canonicalLeadUpdate);
  for (const row of plan.purchaseUpdates) await putRow(client, TABLES.purchases, row);
  for (const row of plan.entitlementUpdates) await putRow(client, TABLES.entitlements, row);
  for (const row of plan.ledgerUpdates) await putRow(client, TABLES.entitlementLedger, row);
  for (const row of plan.scheduleUpdates) await putRow(client, TABLES.schedule, row);
  for (const row of plan.feedbackUpdates) await putRow(client, TABLES.feedbacks, row);
  for (const id of plan.deleteLeadIds) await deleteRow(client, TABLES.leads, id);
  if (plan.deleteIndexId) await deleteRow(client, TABLES.activeEntitlementIndex, plan.deleteIndexId);
  if (plan.deleteStudentId) await deleteRow(client, TABLES.students, plan.deleteStudentId);
  console.log('莲儿重复学员清理完成');
  return summary;
}

if (require.main === module) {
  run().catch(error => {
    console.error(error);
    process.exit(1);
  });
}

module.exports = { buildCleanupPlan, run };
