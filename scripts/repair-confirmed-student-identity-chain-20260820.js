#!/usr/bin/env node

const fs = require('fs');
const path = require('path');
const { loadRuntimeEnv } = require('./lib/runtime-env');
const {
  createClientFromEnv,
  scanTable,
  putRow,
  deleteRow,
  createTableIfMissing
} = require('./lib/staging-data-store');
const {
  parseWriteFlags,
  assertProductionWriteTarget,
  assertProductionWriteTrace
} = require('./lib/production-write-guard');
const {
  scheduleConflictIndexRowsForRecord,
  SCHEDULE_CONFLICT_INDEX_READY_ID
} = require('../server/schedule-conflict-index');
const { buildIndexRows } = require('./repair-student-active-entitlement-index-20260522');

const ROOT = path.join(__dirname, '..');
const OPERATION_ID = 'repair-confirmed-student-identity-chain-20260820';
const BATCH_ID = `batch-${OPERATION_ID}`;
const REPORT_DIR = path.join(ROOT, 'offline-reports');

const TABLES = {
  schedule: 'ft_schedule',
  students: 'ft_students',
  leads: 'ft_leads',
  purchases: 'ft_purchases',
  entitlements: 'ft_entitlements',
  entitlementLedger: 'ft_entitlement_ledger',
  studentSummary: 'ft_student_teaching_summary',
  conflictIndex: 'ft_schedule_conflict_index',
  activeEntitlementIndex: 'ft_student_active_entitlement_index'
};

const IDS = {
  amengStudent: '9057a99b-b7a5-4c0d-821f-3cb3b8adf67c',
  nonoStudent: 'student-from-lead-manual-x9icr6',
  nonoLead: 'lead-manual-x9icr6',
  wenStudent: '76616540-bbb9-409b-86e0-10b0fefccd2b',
  xixiStudent: '2b65be17-4190-4b2f-9dfe-5988d4652cc6',
  hammerFakeStudent: 'cxe-thirdparty-202606-student-eeabb11a6909',
  hammerFakeLead: 'lead-from-student-cxe-thirdparty-202606-student-eeabb11a6909',
  hammerDirtySchedule: 'cxe-thirdparty-202606-schedule-2878df581bcc'
};

const WANG_TRIAL = {
  scheduleId: 'b87a0269-d24e-4b7e-a52a-8e39bda51671',
  purchaseId: '638f1639-eb25-4f40-8125-1654d77a9a1d',
  entitlementId: '3a0fed7f-2869-4960-8a52-9df6d36089ee',
  ledgerId: '5b4c54eb-c86f-4bc7-b691-94ed7852fc1e'
};

const WANG_PACKAGE = {
  sourcePurchaseId: 'repair-20260813-purchase-wang-ameng-1v2-nonprime-20260814',
  sourceEntitlementId: 'repair-20260813-entitlement-wang-ameng-1v2-nonprime-20260814',
  nonoPurchaseId: `${OPERATION_ID}-purchase-wang-nono-1v1-prime-10`,
  nonoEntitlementId: `${OPERATION_ID}-entitlement-wang-nono-1v1-prime-10`,
  dirtySplitPurchaseId: `${OPERATION_ID}-purchase-wang-nono-1v2-nonprime`,
  dirtySplitEntitlementId: `${OPERATION_ID}-entitlement-wang-nono-1v2-nonprime`,
  amengPackageLessonCount: 8,
  nonoPackageLessonCount: 2
};

const CHENXI_SCHEDULE_IDS = [
  '2516bc29-8806-41a6-9308-f6aefdaa353f',
  '740c6c44-f186-4145-a850-1f54298e4e2d',
  '8d2da34f-e950-4f86-a18c-896f69fede47',
  '996d2476-0e71-4b7d-97ff-ff66ad382a83',
  '9a379a8c-3638-43a7-a558-e72bb9485ad0',
  'deeb1351-58b1-4c0d-92af-05e960644e19'
];

function text(value) {
  return String(value ?? '').trim();
}

function parseArr(value) {
  if (Array.isArray(value)) return value.map(item => text(item)).filter(Boolean);
  if (!value) return [];
  try {
    const parsed = JSON.parse(value);
    return Array.isArray(parsed) ? parsed.map(item => text(item)).filter(Boolean) : [];
  } catch {
    return String(value).split(',').map(item => text(item)).filter(Boolean);
  }
}

function numberValue(value, fallback = 0) {
  const n = Number(value);
  return Number.isFinite(n) ? n : fallback;
}

function active(row = {}) {
  return row && text(row.status || '已排课') !== '已取消';
}

function trace(row, now, reason) {
  return {
    ...row,
    updatedAt: now,
    operationId: OPERATION_ID,
    batchId: BATCH_ID,
    operationType: OPERATION_ID,
    operationAt: now,
    operationBy: 'Codex',
    repairReason: reason
  };
}

function studentPatchFields(studentId, studentName, sourceLeadId = '') {
  return {
    studentId,
    studentIds: [studentId],
    expectedStudentIds: [studentId],
    studentName,
    studentNames: [studentName],
    sourceLeadId,
    sourceLeadName: sourceLeadId ? studentName : ''
  };
}

function buildNonoStudent(lead = {}, now) {
  return trace({
    id: IDS.nonoStudent,
    name: '王先生（nono）',
    phone: text(lead.phone),
    campus: text(lead.campus) || 'shunyi_mapo',
    type: text(lead.customerType) || '成人',
    primaryCoach: '岳克舟教练',
    source: text(lead.source) || '线下到店',
    sourceLeadId: IDS.nonoLead,
    notes: text(lead.profileNote || lead.notes),
    profileNote: text(lead.profileNote),
    createdAt: now,
    updatedAt: now
  }, now, '用户确认：王先生（nono）是岳克舟学员，补建正式学员档案');
}

function buildNonoLeadPatch(lead = {}, now) {
  return trace({
    ...lead,
    studentId: IDS.nonoStudent,
    isCourseConverted: true,
    convertedFlag: true,
    conversionType: '课程',
    dealType: text(lead.dealType) || '课程',
    leadStage: '已成交',
    systemStatus: '已成交',
    formalCoach: text(lead.formalCoach) || '岳克舟教练'
  }, now, '用户确认：王先生（nono）已关联正式学员与课程排课');
}

function patchScheduleToStudent(row, studentId, studentName, now, reason, extra = {}) {
  return trace({
    ...row,
    ...studentPatchFields(studentId, studentName, studentId === IDS.nonoStudent ? IDS.nonoLead : text(row.sourceLeadId)),
    ...extra
  }, now, reason);
}

function patchStudentOwner(row, studentId, studentName, now, reason, extra = {}) {
  return trace({
    ...row,
    studentId,
    studentName,
    ...extra
  }, now, reason);
}

function patchTrialTransfer(row, now) {
  return patchStudentOwner(row, IDS.nonoStudent, '王先生（nono）', now, '王先生体验课归属从阿萌迁移到 nono');
}

function restoreAmengPurchase(row = {}, now) {
  return trace({
    ...row,
    purchaseDate: '2026-08-12',
    amountPaid: 4500,
    totalLessons: 10,
    packageName: '1v2私教课 · 10课时 · 非黄金',
    ownerCoach: '林铭教练',
    status: 'active'
  }, now, '恢复王先生（阿萌）独立 10 课时课包');
}

function restoreAmengEntitlement(row = {}, now) {
  return trace({
    ...row,
    totalLessons: 10,
    usedLessons: 8,
    remainingLessons: 2,
    status: 'active',
    packageName: '1v2私教课 · 10课时 · 非黄金',
    ownerCoach: '林铭教练'
  }, now, '恢复王先生（阿萌）独立 10 课时权益');
}

function buildNonoPurchase(row = {}, now) {
  return trace({
    ...row,
    id: WANG_PACKAGE.nonoPurchaseId,
    purchaseDate: '2026-08-15',
    studentId: IDS.nonoStudent,
    studentName: '王先生（nono）',
    sourceLeadId: IDS.nonoLead,
    amountPaid: 4500,
    totalLessons: 10,
    packageName: '1v1私教课 · 10课时 · 黄金',
    ownerCoach: '岳克舟教练',
    status: 'active'
  }, now, '新建王先生（nono）独立 10 课时课包');
}

function buildNonoEntitlement(sourceEntitlement = {}, nonoPurchase = {}, now) {
  return trace({
    ...sourceEntitlement,
    id: WANG_PACKAGE.nonoEntitlementId,
    purchaseId: nonoPurchase.id,
    studentId: IDS.nonoStudent,
    studentName: '王先生（nono）',
    sourceLeadId: IDS.nonoLead,
    totalLessons: 10,
    usedLessons: 2,
    remainingLessons: 8,
    status: 'active',
    packageName: '1v1私教课 · 10课时 · 黄金',
    ownerCoach: '岳克舟教练'
  }, now, '王先生（nono）独立 10 课时权益承接现有核销');
}

function patchAmengPackageSchedule(row, now) {
  return patchScheduleToStudent(row, IDS.amengStudent, '王先生（阿萌）', now, '恢复王先生（阿萌）独立 10 课时排课', {
    purchaseId: WANG_PACKAGE.sourcePurchaseId,
    entitlementId: WANG_PACKAGE.sourceEntitlementId,
    entitlementIds: [WANG_PACKAGE.sourceEntitlementId],
    packageName: '1v2私教课 · 10课时 · 非黄金'
  });
}

function patchNonoPackageSchedule(row, now) {
  return patchScheduleToStudent(row, IDS.nonoStudent, '王先生（nono）', now, '新建王先生（nono）独立 10 课时排课', {
    purchaseId: WANG_PACKAGE.nonoPurchaseId,
    entitlementId: WANG_PACKAGE.nonoEntitlementId,
    entitlementIds: [WANG_PACKAGE.nonoEntitlementId],
    packageName: '1v1私教课 · 10课时 · 黄金',
    sourceLeadId: IDS.nonoLead
  });
}

function patchNonoLedger(row, now) {
  return patchStudentOwner(row, IDS.nonoStudent, '王先生（nono）', now, '王先生（nono）独立课包核销', {
    purchaseId: WANG_PACKAGE.nonoPurchaseId,
    entitlementId: WANG_PACKAGE.nonoEntitlementId
  });
}

function chenxiPatch(row, now, xixi = {}) {
  return patchScheduleToStudent(row, IDS.xixiStudent, '曦曦🐳', now, '晨曦是旧别名，展示名归一为曦曦🐳', {
    sourceLeadId: text(row.sourceLeadId) || text(xixi.sourceLeadId)
  });
}

function buildPlan(data = {}, now = new Date().toISOString()) {
  const schedules = data.schedule || data.schedules || [];
  const students = data.students || [];
  const leads = data.leads || [];
  const purchases = data.purchases || [];
  const entitlements = data.entitlements || [];
  const entitlementLedger = data.entitlementLedger || [];
  const studentSummary = data.studentSummary || data.studentTeachingSummary || [];
  const conflictIndex = data.conflictIndex || [];

  const blockers = [];
  const scheduleById = new Map(schedules.map(row => [text(row.id), row]));
  const studentById = new Map(students.map(row => [text(row.id), row]));
  const leadById = new Map(leads.map(row => [text(row.id), row]));
  const purchaseById = new Map(purchases.map(row => [text(row.id), row]));
  const entitlementById = new Map(entitlements.map(row => [text(row.id), row]));
  const ledgerById = new Map(entitlementLedger.map(row => [text(row.id), row]));
  const summaryById = new Map(studentSummary.map(row => [text(row.id || row.studentId), row]));

  function requireRow(map, id, label) {
    const row = map.get(id);
    if (!row) blockers.push(`${label} 不存在：${id}`);
    return row || null;
  }

  const nonoLead = requireRow(leadById, IDS.nonoLead, '王先生（nono）线索');
  const ameng = requireRow(studentById, IDS.amengStudent, '王先生（阿萌）学员');
  const xixi = requireRow(studentById, IDS.xixiStudent, '曦曦🐳学员');
  requireRow(studentById, IDS.wenStudent, '文大妞学员');

  const studentPuts = [];
  const leadPuts = [];
  const schedulePuts = [];
  const purchasePuts = [];
  const entitlementPuts = [];
  const ledgerPuts = [];
  const deleteRows = [];

  if (!studentById.has(IDS.nonoStudent) && nonoLead) studentPuts.push(buildNonoStudent(nonoLead, now));
  if (nonoLead) leadPuts.push(buildNonoLeadPatch(nonoLead, now));

  const trialSchedule = requireRow(scheduleById, WANG_TRIAL.scheduleId, '王先生（nono）体验排课');
  const trialPurchase = requireRow(purchaseById, WANG_TRIAL.purchaseId, '王先生（nono）体验购买');
  const trialEntitlement = requireRow(entitlementById, WANG_TRIAL.entitlementId, '王先生（nono）体验权益');
  const trialLedger = requireRow(ledgerById, WANG_TRIAL.ledgerId, '王先生（nono）体验扣课流水');
  if (trialSchedule && active(trialSchedule)) schedulePuts.push(patchScheduleToStudent(trialSchedule, IDS.nonoStudent, '王先生（nono）', now, '王先生体验排课从阿萌改回 nono'));
  if (trialPurchase) purchasePuts.push(patchTrialTransfer(trialPurchase, now));
  if (trialEntitlement) entitlementPuts.push(patchTrialTransfer(trialEntitlement, now));
  if (trialLedger) ledgerPuts.push(patchTrialTransfer(trialLedger, now));

  const sourcePurchase = requireRow(purchaseById, WANG_PACKAGE.sourcePurchaseId, '王先生（阿萌）原 1v2 购买');
  const sourceEntitlement = requireRow(entitlementById, WANG_PACKAGE.sourceEntitlementId, '王先生（阿萌）原 1v2 权益');
  if (sourcePurchase && sourceEntitlement) {
    const nonoPurchase = buildNonoPurchase(sourcePurchase, now);
    purchasePuts.push(restoreAmengPurchase(sourcePurchase, now), nonoPurchase);
    entitlementPuts.push(restoreAmengEntitlement(sourceEntitlement, now), buildNonoEntitlement(sourceEntitlement, nonoPurchase, now));
  }
  const amengPackageSchedules = schedules.filter(row => active(row)
    && text(row.studentName) === '王先生（阿萌）'
    && text(row.entitlementId) === WANG_PACKAGE.sourceEntitlementId);
  const nonoPackageSchedules = schedules.filter(row => active(row)
    && text(row.studentId) === IDS.nonoStudent
    && [WANG_PACKAGE.nonoEntitlementId, WANG_PACKAGE.dirtySplitEntitlementId].includes(text(row.entitlementId)));
  for (const row of amengPackageSchedules) {
    schedulePuts.push(patchAmengPackageSchedule(row, now));
  }
  for (const row of nonoPackageSchedules) {
    schedulePuts.push(patchNonoPackageSchedule(row, now));
  }
  for (const row of entitlementLedger.filter(row => text(row.studentId) === IDS.nonoStudent && [WANG_PACKAGE.nonoEntitlementId, WANG_PACKAGE.dirtySplitEntitlementId].includes(text(row.entitlementId)))) {
    ledgerPuts.push(patchNonoLedger(row, now));
  }

  const chenxiRows = CHENXI_SCHEDULE_IDS.map(id => requireRow(scheduleById, id, '晨曦展示名排课')).filter(Boolean);
  for (const row of chenxiRows) {
    if (active(row)) schedulePuts.push(chenxiPatch(row, now, xixi));
  }

  if (summaryById.has(IDS.wenStudent)) {
    deleteRows.push({ table: TABLES.studentSummary, id: IDS.wenStudent, reason: '删除文大妞空详情缓存，详情回源读取真实排课和扣课流水' });
  }
  if (summaryById.has(IDS.hammerFakeStudent)) {
    deleteRows.push({ table: TABLES.studentSummary, id: IDS.hammerFakeStudent, reason: '删除捶捶脏学员缓存' });
  }
  if (leadById.has(IDS.hammerFakeLead)) {
    deleteRows.push({ table: TABLES.leads, id: IDS.hammerFakeLead, reason: '删除捶捶脏线索' });
  }
  if (studentById.has(IDS.hammerFakeStudent)) {
    deleteRows.push({ table: TABLES.students, id: IDS.hammerFakeStudent, reason: '删除捶捶脏学员' });
  }
  if (scheduleById.has(IDS.hammerDirtySchedule)) {
    deleteRows.push({ table: TABLES.schedule, id: IDS.hammerDirtySchedule, reason: '删除捶捶脏排课' });
  }
  if (purchaseById.has(WANG_PACKAGE.dirtySplitPurchaseId) && WANG_PACKAGE.dirtySplitPurchaseId !== WANG_PACKAGE.nonoPurchaseId) {
    deleteRows.push({ table: TABLES.purchases, id: WANG_PACKAGE.dirtySplitPurchaseId, reason: '删除王先生（nono）旧 2 课时拆单脏订单' });
  }
  if (entitlementById.has(WANG_PACKAGE.dirtySplitEntitlementId) && WANG_PACKAGE.dirtySplitEntitlementId !== WANG_PACKAGE.nonoEntitlementId) {
    deleteRows.push({ table: TABLES.entitlements, id: WANG_PACKAGE.dirtySplitEntitlementId, reason: '删除王先生（nono）旧 2 课时拆单脏权益' });
  }

  const fakeBusinessRefs = [
    ...purchases.filter(row => text(row.studentId) === IDS.hammerFakeStudent).map(row => `purchase:${row.id}`),
    ...entitlements.filter(row => text(row.studentId) === IDS.hammerFakeStudent).map(row => `entitlement:${row.id}`),
    ...entitlementLedger.filter(row => text(row.studentId) === IDS.hammerFakeStudent).map(row => `ledger:${row.id}`),
    ...schedules.filter(row => text(row.id) !== IDS.hammerDirtySchedule && parseArr(row.studentIds).includes(IDS.hammerFakeStudent)).map(row => `schedule:${row.id}`)
  ];
  if (fakeBusinessRefs.length) blockers.push(`捶捶仍有额外业务引用：${fakeBusinessRefs.join(',')}`);

  const amengPackageCount = schedulePuts.filter(row => row.studentId === IDS.amengStudent && row.packageName === '1v2私教课 · 10课时 · 非黄金').length;
  const nonoPackageCount = schedulePuts.filter(row => row.studentId === IDS.nonoStudent && row.packageName === '1v1私教课 · 10课时 · 黄金').length;
  const chenxiUpdates = schedulePuts.filter(row => row.studentId === IDS.xixiStudent && row.studentName === '曦曦🐳').length;
  if (amengPackageCount !== WANG_PACKAGE.amengPackageLessonCount) blockers.push(`王先生（阿萌）排课应修 ${WANG_PACKAGE.amengPackageLessonCount} 条，当前计划 ${amengPackageCount} 条`);
  if (nonoPackageCount !== WANG_PACKAGE.nonoPackageLessonCount) blockers.push(`王先生（nono）排课应修 ${WANG_PACKAGE.nonoPackageLessonCount} 条，当前计划 ${nonoPackageCount} 条`);
  if (chenxiUpdates !== CHENXI_SCHEDULE_IDS.length) blockers.push(`晨曦展示名应修 ${CHENXI_SCHEDULE_IDS.length} 条，当前计划 ${chenxiUpdates} 条`);

  const affectedScheduleIds = new Set(schedulePuts.map(row => text(row.id)).concat([IDS.hammerDirtySchedule]));
  const staleConflictIndexIds = conflictIndex
    .filter(row => affectedScheduleIds.has(text(row.scheduleId)))
    .map(row => text(row.id))
    .filter(id => id && id !== SCHEDULE_CONFLICT_INDEX_READY_ID);
  const nextConflictIndexRows = schedulePuts.flatMap(row => scheduleConflictIndexRowsForRecord(row));

  const nextEntitlements = entitlements.map(row => entitlementPuts.find(item => item.id === row.id) || row)
    .concat(entitlementPuts.filter(row => !entitlementById.has(row.id)));
  const indexRows = buildIndexRows(nextEntitlements, now)
    .filter(row => [IDS.amengStudent, IDS.nonoStudent, IDS.xixiStudent, IDS.hammerFakeStudent].includes(text(row.studentId || row.id)));
  const activeIndexDeleteIds = [IDS.amengStudent, IDS.nonoStudent, IDS.hammerFakeStudent].filter(id => !indexRows.some(row => text(row.id) === id));

  return {
    blockers,
    studentPuts,
    leadPuts,
    schedulePuts,
    purchasePuts,
    entitlementPuts,
    ledgerPuts,
    deleteRows,
    conflictIndex: { staleConflictIndexIds, nextConflictIndexRows },
    activeEntitlementIndex: { putRows: indexRows, deleteIds: activeIndexDeleteIds },
    summary: {
      wangSchedules: amengPackageCount + nonoPackageCount,
      amengPackageSchedules: amengPackageCount,
      nonoPackageSchedules: nonoPackageCount,
      chenxiSchedules: chenxiUpdates,
      deleteRows: deleteRows.length,
      blockers: blockers.length,
      amengName: text(ameng?.name),
      xixiName: text(xixi?.name)
    }
  };
}

async function retry(label, fn, maxAttempts = 4) {
  let lastError;
  for (let attempt = 1; attempt <= maxAttempts; attempt += 1) {
    try {
      return await Promise.race([
        fn(),
        new Promise((_, reject) => setTimeout(() => reject(new Error(`${label} timeout`)), 15000))
      ]);
    } catch (error) {
      lastError = error;
      if (attempt === maxAttempts) break;
      await new Promise(resolve => setTimeout(resolve, attempt * 800));
    }
  }
  throw new Error(`${label} failed: ${lastError?.message || lastError}`);
}

async function run(argv = process.argv.slice(2)) {
  loadRuntimeEnv({ override: true });
  const args = parseWriteFlags(argv);
  const reportPath = path.join(REPORT_DIR, `${OPERATION_ID}-${args.write ? 'write' : 'dry-run'}.json`);
  assertProductionWriteTrace({ operationId: OPERATION_ID, batchId: BATCH_ID, reportPath });
  const target = await assertProductionWriteTarget();
  const client = createClientFromEnv();
  const [
    schedule,
    students,
    leads,
    purchases,
    entitlements,
    entitlementLedger,
    studentSummary,
    conflictIndex
  ] = await Promise.all([
    scanTable(client, TABLES.schedule),
    scanTable(client, TABLES.students),
    scanTable(client, TABLES.leads).catch(() => []),
    scanTable(client, TABLES.purchases),
    scanTable(client, TABLES.entitlements),
    scanTable(client, TABLES.entitlementLedger),
    scanTable(client, TABLES.studentSummary).catch(() => []),
    scanTable(client, TABLES.conflictIndex).catch(() => [])
  ]);
  const now = new Date().toISOString();
  const plan = buildPlan({ schedule, students, leads, purchases, entitlements, entitlementLedger, studentSummary, conflictIndex }, now);
  const output = {
    ok: plan.blockers.length === 0,
    mode: args.write ? 'write' : 'dry-run',
    target,
    reportPath,
    operationId: OPERATION_ID,
    batchId: BATCH_ID,
    generatedAt: now,
    ...plan.summary,
    blockers: plan.blockers,
    plan
  };
  fs.mkdirSync(REPORT_DIR, { recursive: true });
  fs.writeFileSync(reportPath, `${JSON.stringify(output, null, 2)}\n`, 'utf8');

  if (args.write) {
    if (plan.blockers.length) throw new Error(`停止写入：${plan.blockers.join('；')}`);
    await retry('create conflict index table', () => createTableIfMissing(client, TABLES.conflictIndex));
    await retry('create active entitlement index table', () => createTableIfMissing(client, TABLES.activeEntitlementIndex));
    for (const row of plan.studentPuts) await retry(`put student ${row.id}`, () => putRow(client, TABLES.students, row));
    for (const row of plan.leadPuts) await retry(`put lead ${row.id}`, () => putRow(client, TABLES.leads, row));
    for (const row of plan.purchasePuts) await retry(`put purchase ${row.id}`, () => putRow(client, TABLES.purchases, row));
    for (const row of plan.entitlementPuts) await retry(`put entitlement ${row.id}`, () => putRow(client, TABLES.entitlements, row));
    for (const row of plan.ledgerPuts) await retry(`put ledger ${row.id}`, () => putRow(client, TABLES.entitlementLedger, row));
    for (const row of plan.schedulePuts) await retry(`put schedule ${row.id}`, () => putRow(client, TABLES.schedule, row));
    for (const id of plan.conflictIndex.staleConflictIndexIds) await retry(`delete conflict index ${id}`, () => deleteRow(client, TABLES.conflictIndex, id));
    for (const row of plan.conflictIndex.nextConflictIndexRows) await retry(`put conflict index ${row.id}`, () => putRow(client, TABLES.conflictIndex, row));
    await retry('mark conflict index ready', () => putRow(client, TABLES.conflictIndex, {
      id: SCHEDULE_CONFLICT_INDEX_READY_ID,
      ready: true,
      updatedAt: now,
      operationId: OPERATION_ID
    }));
    for (const id of plan.activeEntitlementIndex.deleteIds) await retry(`delete active entitlement index ${id}`, () => deleteRow(client, TABLES.activeEntitlementIndex, id));
    for (const row of plan.activeEntitlementIndex.putRows) await retry(`put active entitlement index ${row.id}`, () => putRow(client, TABLES.activeEntitlementIndex, row));
    for (const item of plan.deleteRows) await retry(`delete ${item.table} ${item.id}`, () => deleteRow(client, item.table, item.id));
  }

  console.log(JSON.stringify({
    ok: output.ok,
    mode: output.mode,
    reportPath,
    wangSchedules: output.wangSchedules,
    chenxiSchedules: output.chenxiSchedules,
    deleteRows: output.deleteRows,
    blockers: output.blockers
  }, null, 2));
  return output;
}

if (require.main === module) {
  run().catch(error => {
    console.error(error?.stack || String(error));
    process.exit(1);
  });
}

module.exports = {
  OPERATION_ID,
  IDS,
  WANG_TRIAL,
  WANG_PACKAGE,
  CHENXI_SCHEDULE_IDS,
  buildPlan
};
