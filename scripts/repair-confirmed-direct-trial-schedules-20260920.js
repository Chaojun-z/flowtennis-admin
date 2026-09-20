#!/usr/bin/env node

const fs = require('fs');
const path = require('path');
const { loadRuntimeEnv } = require('./lib/runtime-env');
const { createClientFromEnv, getRow, scanTable, putRow } = require('./lib/staging-data-store');
const {
  parseWriteFlags,
  assertProductionWriteTarget,
  assertProductionWriteTrace
} = require('./lib/production-write-guard');
const {
  STUDENT_TEACHING_SUMMARY_META_ID,
  buildStudentTeachingSummaryBundleId,
  buildStudentTeachingSummaryListBundleId,
  studentTeachingSummaryBundleLogicalRows,
  requireReadyStudentTeachingSummaryRows,
  buildStudentTeachingSummaryChecksum,
  syncStudentTeachingSummaryDelta
} = require('../server/read-models/student-teaching-summary-cache');

const ROOT = path.join(__dirname, '..');
const OPERATION_ID = 'repair-confirmed-direct-trial-schedules-20260920';
const BATCH_ID = `batch-${OPERATION_ID}`;
const REPORT_DIR = path.join(ROOT, 'offline-reports');
const PRIOR_DRY_RUN_PATH = path.join(REPORT_DIR, 'repair-schedule-missing-entitlement-ledgers-20260919-dry-run.json');
const TABLES = {
  schedule: 'ft_schedule',
  entitlementLedger: 'ft_entitlement_ledger',
  financialLedger: 'ft_financial_ledger',
  summary: 'ft_student_teaching_summary'
};

const TARGETS = [
  ['cxe-thirdparty-202604-schedule-307ad6451054', 'seed-student-036', '宋缇缇', '朝珺教练', '大众点评', 239],
  ['cxe-thirdparty-202604-schedule-85428521e878', 'new-student-2d6eb2c4ebe3', 'rzwyyy', '汤教练', '大众点评', 239],
  ['cxe-thirdparty-202604-schedule-96c73a9363a4', 'repair-student-20260816-bfbf909d705a', '李鹏浩', '朝珺教练', '大众点评', 239],
  ['cxe-thirdparty-202604-schedule-9d712985294c', 'repair-student-20260816-982db9939759', '黄深', '朝珺教练', '', 0, { gift: true, fieldFeeAmount: 220 }],
  ['cxe-thirdparty-202604-schedule-094f6790ccdf', 'repair-student-20260816-a8fe7b01dfe3', 'kRyst4I', 'Siren 教练', '大众点评', 239],
  ['cxe-thirdparty-202604-schedule-01b447cd657b', 'repair-student-20260816-48181acd22b3', 'Bob', 'RIVE教练', '大众点评', 199],
  ['cxe-thirdparty-202604-schedule-5f06df6e82c5', 'new-student-7790b5e65738', '享受当下（莱因哈特）', 'Rive 天昊教练', '大众点评', 239],
  ['cxe-thirdparty-202604-schedule-aeb9f21e47f0', 'new-student-dd963c0b7154', '吕瑜', '朝珺教练', '大众点评', 289],
  ['cxe-thirdparty-202604-schedule-fdb96999e9ea', 'repair-student-20260816-3ab08ab75f2c', 'mjh小胡', 'Rive 天昊教练', '大众点评', 239],
  ['cxe-thirdparty-202604-schedule-6c38f52d000a', '7ef17ae2-7c47-4026-a28a-37464dfd1c69', '艾女士', '朝珺教练', '大众点评', 239],
  ['cxe-thirdparty-202604-schedule-d94d4b769661', 'fdf08500-b73f-4d2f-94ea-30e92153dad3', '天昊 熊', 'Rive 天昊教练', '大众点评', 239],
  ['cxe-thirdparty-202604-schedule-0ce363734320', 'repair-student-20260816-7581047cd69d', '黑个🏂', 'Rive 天昊教练', '大众点评', 239],
  ['cxe-thirdparty-202604-schedule-6275ca64c570', 'e4cabca0-6aa8-4786-9e11-73779d6fb855', '十一', '宋教练', '大众点评', 239],
  ['cxe-thirdparty-202604-schedule-2f7821894836', 'import-student-c98420e5-5b3a-2fbe-2d55-f07b179ecbe2', '笑笑', 'Siren 教练', '大众点评', 199],
  ['cxe-thirdparty-202604-schedule-d67c71685749', '0d0a4dfe-598b-4ba8-b4ed-c466d19883fe', '芦先生', 'Siren 教练', '大众点评', 239],
  ['cxe-thirdparty-202604-schedule-b7e81054e147', 'be6af076-a464-4270-967e-28c9007a1c86', '孙姐', 'Siren 教练', '大众点评', 289],
  ['cxe-thirdparty-202604-schedule-c6b70587bc03', 'repair-student-20260816-7581047cd69d', '黑个🏂', '小舟教练', '大众点评', 239],
  ['cxe-thirdparty-202604-schedule-df505ba77ece', 'repair-student-20260816-a193bfd2767e', '你若盛开', '宋教练', '大众点评', 239],
  ['cxe-thirdparty-202604-schedule-6c9a31065de9', 'repair-student-20260816-231ca00ab414', '孙先生', '小舟教练', '大众点评', 239],
  ['cxe-thirdparty-202604-schedule-8340ace93b45', 'repair-student-20260816-751a5cb5bdfa', 'Naomi', '朝珺教练', '大众点评', 239],
  ['feishu-schedule-ce5cf91fb7cd07ea852c1f43', 'fc85d197-8fe4-4bef-9d3b-db7e6a5ae1ab', '魏北辰', '刘润扬教练', '大众点评', 149],
  ['feishu-schedule-5f3f2d2442f504e6c6f4be8b', 'af7d9eb2-f230-4c29-b307-30e3f587996c', '予哥（一生平安）', '刘润扬教练', '大众点评', 149]
].map(([scheduleId, studentId, studentName, coach, payMethod, amount, options = {}]) => ({
  scheduleId, studentId, studentName, coach, payMethod, amount, ...options
}));

function text(value) { return String(value ?? '').trim(); }
function parseArr(value) {
  if (Array.isArray(value)) return value;
  if (typeof value !== 'string' || !value) return [];
  try { const parsed = JSON.parse(value); return Array.isArray(parsed) ? parsed : []; } catch { return []; }
}
function reportPath(mode) { return path.join(REPORT_DIR, `${OPERATION_ID}-${mode}.json`); }
function beforePath() { return path.join(REPORT_DIR, `${OPERATION_ID}-before.json`); }
function trace(now) {
  return { operationId: OPERATION_ID, batchId: BATCH_ID, operationType: 'direct-trial-settlement-repair', operationAt: now, operationBy: 'Codex' };
}

function assertPriorLedgerEvidence() {
  if (!fs.existsSync(PRIOR_DRY_RUN_PATH)) throw new Error('停止：缺少前置线上干跑报告，不能跳过消课流水全表复核');
  const report = JSON.parse(fs.readFileSync(PRIOR_DRY_RUN_PATH, 'utf8'));
  const blockedIds = new Set((report.blocked || []).map(row => text(row.scheduleId)));
  const repairableIds = new Set((report.repairableScheduleIds || []).map(text));
  const missing = TARGETS.map(item => item.scheduleId).filter(id => !blockedIds.has(id) || repairableIds.has(id));
  if (missing.length) throw new Error(`停止：前置线上干跑未证明这些目标没有消课流水：${missing.join('、')}`);
  return { reportPath: PRIOR_DRY_RUN_PATH, generatedAt: report.generatedAt, blockedTargetCount: TARGETS.length };
}

function normalizedStudentRows(row) {
  return parseArr(row?.studentSettlementRows).filter(item => text(item?.studentId));
}

function buildFinancialLedgerRow(target, schedule, now) {
  if (!target.gift || Number(target.fieldFeeAmount) <= 0) return null;
  return {
    id: `schedule-field-fee-${target.scheduleId}`,
    ledgerType: 'schedule_field_fee',
    status: 'active',
    sourceType: 'schedule',
    sourceId: target.scheduleId,
    businessDate: text(schedule.startTime).slice(0, 10),
    userId: target.studentId,
    userName: target.studentName,
    campus: text(schedule.campus),
    productSnapshotName: '排课场地费',
    businessType: '课程订场',
    action: '收款',
    paymentChannel: '直接收款',
    cashDelta: Math.round(Number(target.fieldFeeAmount) * 100),
    recognizedRevenueDelta: Math.round(Number(target.fieldFeeAmount) * 100),
    deferredRevenueDelta: 0,
    notes: '用户确认：体验课免费/赠送，单独支付场地费220元',
    createdBy: 'Codex',
    createdAt: now,
    updatedAt: now,
    ...trace(now)
  };
}

function buildNextSchedule(target, schedule, now) {
  const gift = !!target.gift;
  const existing = normalizedStudentRows(schedule).find(row => text(row.studentId) === target.studentId) || {};
  const studentRow = {
    ...existing,
    studentId: target.studentId,
    studentName: target.studentName,
    settlementType: gift ? 'gift' : 'direct',
    payMethod: gift ? '' : target.payMethod,
    amount: gift ? 0 : Number(target.amount),
    paidAmount: gift ? 0 : Number(target.amount),
    fieldFeeMode: gift && Number(target.fieldFeeAmount) > 0 ? 'separate' : 'none',
    fieldFeePayMethod: gift && Number(target.fieldFeeAmount) > 0 ? '直接收款' : '',
    fieldFeeAmount: gift ? Number(target.fieldFeeAmount || 0) : 0,
    fieldFeeNote: gift && Number(target.fieldFeeAmount) > 0 ? '单独支付场地费220元' : '',
    entitlementId: ''
  };
  return {
    ...schedule,
    coach: target.coach,
    settlementType: gift ? 'gift' : 'direct',
    paymentType: gift ? 'gift' : 'direct',
    payMethod: gift ? '' : target.payMethod,
    paymentChannel: gift ? '' : target.payMethod,
    paidAmount: gift ? 0 : Number(target.amount),
    paymentAmount: gift ? 0 : Number(target.amount),
    amount: gift ? 0 : Number(target.amount),
    requiresFieldFee: gift && Number(target.fieldFeeAmount) > 0,
    fieldFeeReason: gift && Number(target.fieldFeeAmount) > 0 ? '排课场地费' : '',
    fieldFeeAmount: gift ? Number(target.fieldFeeAmount || 0) : 0,
    fieldFeePayMethod: gift && Number(target.fieldFeeAmount) > 0 ? '直接收款' : '',
    fieldFeeNote: gift && Number(target.fieldFeeAmount) > 0 ? '单独支付场地费220元' : '',
    entitlementId: '',
    entitlementIds: [],
    packageName: '',
    purchaseId: '',
    studentSettlementRows: [studentRow],
    updatedAt: now,
    ...trace(now),
    repairReason: gift
      ? '用户确认：体验课免费/赠送，单独支付场地费220元'
      : '用户确认：体验课单节直接收款，不扣课包'
  };
}

function buildPlan({ schedules = [], ledgers = [], financialLedgers = [], now, targets = TARGETS }) {
  const scheduleById = new Map(schedules.map(row => [text(row.id), row]));
  const ledgerBySchedule = new Map();
  for (const row of ledgers) {
    const id = text(row.scheduleId);
    if (id) ledgerBySchedule.set(id, [...(ledgerBySchedule.get(id) || []), row]);
  }
  const financialById = new Map(financialLedgers.map(row => [text(row.id), row]));
  const blockers = [];
  const schedulePuts = [];
  const financialLedgerPuts = [];
  for (const target of targets) {
    const schedule = scheduleById.get(target.scheduleId);
    if (!schedule) { blockers.push(`${target.scheduleId} 排课不存在`); continue; }
    if (['voided', 'refunded', 'deleted', 'inactive', 'cancelled', 'canceled', '已取消', '已作废', '已删除'].includes(text(schedule.status).toLowerCase())) {
      blockers.push(`${target.scheduleId} 排课已作废/取消`); continue;
    }
    const existingLedgers = ledgerBySchedule.get(target.scheduleId) || [];
    if (existingLedgers.some(row => Number(row.lessonDelta || row.delta || 0) < 0)) {
      blockers.push(`${target.scheduleId} 已有消课流水，停止避免重复修改`); continue;
    }
    const next = buildNextSchedule(target, schedule, now);
    schedulePuts.push({ id: target.scheduleId, before: schedule, after: next, target });
    const feeAfter = buildFinancialLedgerRow(target, next, now);
    if (feeAfter) {
      const feeBefore = financialById.get(feeAfter.id) || null;
      if (!feeBefore || Number(feeBefore.cashDelta) !== Number(feeAfter.cashDelta) || text(feeBefore.status) !== 'active') {
        financialLedgerPuts.push({ id: feeAfter.id, before: feeBefore, after: feeAfter });
      }
    }
  }
  return { blockers, schedulePuts, financialLedgerPuts };
}

function assertSummaryReady(summary) {
  const rows = requireReadyStudentTeachingSummaryRows([summary.meta, summary.bundle]);
  const listRows = studentTeachingSummaryBundleLogicalRows({
    ...summary.listBundle,
    id: buildStudentTeachingSummaryBundleId(summary.listBundle?.publishVersion),
    kind: 'student-teaching-summary-bundle'
  });
  if (listRows.length !== rows.length || Number(summary.listBundle?.rowCount) !== listRows.length
    || text(summary.listBundle?.checksum) !== buildStudentTeachingSummaryChecksum(listRows)) {
    throw new Error('停止：教学摘要列表发布包校验失败');
  }
  return { status: text(summary.meta.status), activeVersion: text(summary.meta.activeVersion), rowCount: rows.length };
}

async function syncSummaries({ client, plan, now }) {
  const results = [];
  for (const item of plan.schedulePuts) {
    const result = await syncStudentTeachingSummaryDelta({
      tableName: TABLES.summary,
      getCachedRow: (_table, id) => getRow(client, TABLES.summary, id),
      put: (_table, _id, row) => putRow(client, TABLES.summary, row),
      previousSchedule: item.before,
      nextSchedule: item.after,
      changedEntitlements: [],
      changedLedgers: [],
      operationId: `${OPERATION_ID}-${item.id}`,
      now: new Date(now)
    });
    if (!result?.synced) throw new Error(`停止：教学摘要同步失败（${item.id}）：${text(result?.reason || '未知原因')}`);
    results.push({ scheduleId: item.id, affectedStudentIds: result.affectedStudentIds || [] });
  }
  return results;
}

async function verify({ client, plan }) {
  const [schedules, financialLedgers, meta] = await Promise.all([
    Promise.all(plan.schedulePuts.map(item => getRow(client, TABLES.schedule, item.id))),
    Promise.all(plan.financialLedgerPuts.map(item => getRow(client, TABLES.financialLedger, item.id))),
    getRow(client, TABLES.summary, STUDENT_TEACHING_SUMMARY_META_ID)
  ]);
  const mismatches = [];
  const financialById = new Map(financialLedgers.map(row => [text(row.id), row]));
  for (let i = 0; i < plan.schedulePuts.length; i += 1) {
    const item = plan.schedulePuts[i];
    const actual = schedules[i];
    const target = item.target;
    if (!actual || !['direct', 'gift'].includes(text(actual.settlementType))) mismatches.push(`${item.id} 结算类型未改正`);
    if (text(actual.entitlementId) || parseArr(actual.entitlementIds).length || text(actual.packageName) || text(actual.purchaseId)) mismatches.push(`${item.id} 仍残留课包绑定`);
    if (text(actual.coach) !== target.coach) mismatches.push(`${item.id} 教练未更新`);
    const row = normalizedStudentRows(actual).find(value => text(value.studentId) === target.studentId);
    if (!row || text(row.settlementType) !== (target.gift ? 'gift' : 'direct') || Number(row.amount || row.paidAmount || 0) !== Number(target.gift ? 0 : target.amount)) {
      mismatches.push(`${item.id} 学员结算信息不正确`);
    }
    if (target.gift) {
      const fee = financialById.get(`schedule-field-fee-${item.id}`);
      if (!fee || Number(fee.cashDelta) !== Number(target.fieldFeeAmount) * 100 || text(fee.status) !== 'active') mismatches.push(`${item.id} 场地费流水未落地`);
    }
  }
  const activeVersion = text(meta?.activeVersion);
  const bundle = activeVersion ? await getRow(client, TABLES.summary, buildStudentTeachingSummaryBundleId(activeVersion)) : null;
  const listBundle = activeVersion ? await getRow(client, TABLES.summary, buildStudentTeachingSummaryListBundleId(activeVersion)) : null;
  let summaryRows = [];
  try {
    summaryRows = requireReadyStudentTeachingSummaryRows([meta, bundle]);
    const listRows = studentTeachingSummaryBundleLogicalRows({
      ...listBundle,
      id: buildStudentTeachingSummaryBundleId(listBundle?.publishVersion),
      kind: 'student-teaching-summary-bundle'
    });
    if (listRows.length !== summaryRows.length || text(listBundle?.checksum) !== buildStudentTeachingSummaryChecksum(listRows)) mismatches.push('教学摘要列表发布包校验失败');
  } catch (error) { mismatches.push(`教学摘要发布包校验失败:${text(error.message || error)}`); }
  const summaryByStudent = new Map(summaryRows.map(row => [text(row.studentId || row.id), row]));
  for (const item of plan.schedulePuts) {
    const student = summaryByStudent.get(item.target.studentId);
    const lesson = parseArr(student?.detailLessonRecordRows).find(row => text(row.scheduleId) === item.id);
    if (!lesson || text(lesson.settlementType) !== (item.target.gift ? 'gift' : 'direct') || text(lesson.entitlementId)) mismatches.push(`${item.id} 教学摘要未同步结算方式`);
  }
  return { ok: mismatches.length === 0, mismatches, verified: { scheduleCount: plan.schedulePuts.length, fieldFeeCount: plan.financialLedgerPuts.length, summaryActiveVersion: activeVersion } };
}

async function run(argv = process.argv.slice(2)) {
  loadRuntimeEnv({ appEnv: 'production', entry: OPERATION_ID });
  const flags = parseWriteFlags(argv);
  const target = await assertProductionWriteTarget();
  const ledgerPrecondition = assertPriorLedgerEvidence();
  const now = new Date().toISOString();
  const traceData = assertProductionWriteTrace({ operationId: OPERATION_ID, batchId: BATCH_ID, reportPath: reportPath(flags.write ? 'write' : 'dry-run') });
  const client = createClientFromEnv();
  const [schedules, financialLedgers, meta] = await Promise.all([
    Promise.all(TARGETS.map(item => getRow(client, TABLES.schedule, item.scheduleId))).then(rows => rows.filter(Boolean)),
    Promise.all(TARGETS.filter(item => item.gift).map(item => getRow(client, TABLES.financialLedger, `schedule-field-fee-${item.scheduleId}`))).then(rows => rows.filter(Boolean)),
    getRow(client, TABLES.summary, STUDENT_TEACHING_SUMMARY_META_ID)
  ]);
  const activeVersion = text(meta?.activeVersion);
  const summary = {
    meta,
    bundle: activeVersion ? await getRow(client, TABLES.summary, buildStudentTeachingSummaryBundleId(activeVersion)) : null,
    listBundle: activeVersion ? await getRow(client, TABLES.summary, buildStudentTeachingSummaryListBundleId(activeVersion)) : null
  };
  const summaryReadiness = assertSummaryReady(summary);
  const plan = buildPlan({ schedules, ledgers: [], financialLedgers, now });
  if (plan.blockers.length) throw new Error(`停止：${plan.blockers.join('；')}`);
  fs.mkdirSync(REPORT_DIR, { recursive: true });
  const report = {
    ...traceData,
    mode: flags.write ? 'write' : 'dry-run',
    generatedAt: now,
    target,
    summaryReadiness,
    ledgerPrecondition,
    targetCount: TARGETS.length,
    directPaidCount: TARGETS.filter(item => !item.gift).length,
    giftCount: TARGETS.filter(item => item.gift).length,
    directPaidAmount: TARGETS.filter(item => !item.gift).reduce((sum, item) => sum + Number(item.amount), 0),
    fieldFeeAmount: TARGETS.reduce((sum, item) => sum + Number(item.fieldFeeAmount || 0), 0),
    scheduleIds: plan.schedulePuts.map(item => item.id),
    financialLedgerIds: plan.financialLedgerPuts.map(item => item.id)
  };
  fs.writeFileSync(reportPath(flags.write ? 'write' : 'dry-run'), `${JSON.stringify(report, null, 2)}\n`, 'utf8');
  if (!flags.write) {
    console.log(JSON.stringify(report, null, 2));
    return;
  }
  const backup = {
    ...traceData,
    mode: 'before-write',
    generatedAt: now,
    target,
    schedules: plan.schedulePuts.map(item => item.before),
    financialLedgerRows: plan.financialLedgerPuts.map(item => item.before).filter(Boolean),
    summary
  };
  fs.writeFileSync(beforePath(), `${JSON.stringify(backup, null, 2)}\n`, 'utf8');
  for (const item of plan.schedulePuts) await putRow(client, TABLES.schedule, item.after);
  for (const item of plan.financialLedgerPuts) await putRow(client, TABLES.financialLedger, item.after);
  report.summarySync = await syncSummaries({ client, plan, now });
  report.verification = await verify({ client, plan });
  fs.writeFileSync(reportPath('write'), `${JSON.stringify({ ...report, backupPath: beforePath() }, null, 2)}\n`, 'utf8');
  if (!report.verification.ok) throw new Error(`停止：写入后核验失败：${report.verification.mismatches.join('；')}`);
  console.log(JSON.stringify({ ok: true, mode: 'write', reportPath: reportPath('write'), backupPath: beforePath(), verification: report.verification }, null, 2));
}

if (require.main === module) run().catch(error => { console.error(error?.stack || String(error)); process.exit(1); });

module.exports = { TARGETS, buildFinancialLedgerRow, buildNextSchedule, buildPlan };
