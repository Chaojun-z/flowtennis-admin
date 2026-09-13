#!/usr/bin/env node

const fs = require('fs');
const path = require('path');
const zlib = require('zlib');
const { loadRuntimeEnv } = require('./lib/runtime-env');
const {
  createClientFromEnv,
  getRow,
  putRow
} = require('./lib/staging-data-store');
const {
  parseWriteFlags,
  assertProductionWriteTarget,
  assertProductionWriteTrace
} = require('./lib/production-write-guard');
const summaryCache = require('../server/read-models/student-teaching-summary-cache');

const ROOT = path.join(__dirname, '..');
const OPERATION_ID = 'repair-selected-student-lesson-status-20260913';
const BATCH_ID = `batch-${OPERATION_ID}`;
const SUMMARY_VERSION = OPERATION_ID;
const REPORT_DIR = path.join(ROOT, 'offline-reports');

const TABLES = {
  schedule: 'ft_schedule',
  entitlements: 'ft_entitlements',
  purchases: 'ft_purchases',
  entitlementLedger: 'ft_entitlement_ledger',
  activeEntitlementIndex: 'ft_student_active_entitlement_index',
  teachingSummary: 'ft_student_teaching_summary'
};

const TARGETS = {
  schedules: [
    'c850691d-f94e-48e7-a7de-dc710085b5c4',
    '247ef588-fa56-4706-ab2d-6b808bdd2739',
    '8c45afc7-eaf0-4af0-84bd-04004e49449c'
  ],
  entitlements: [
    'a27fb3d3-d426-47f7-946b-baf67253d48c',
    '70859839-61a9-443c-bb7b-f1e6b4a5fc58'
  ],
  purchases: [
    '9ca7e066-54aa-4699-8093-9ada120ea89e',
    '6b2f2c6a-953a-446e-907a-26d8c565d87f'
  ],
  students: [
    '5db707b6-4e1f-499d-ab09-889ff7598d97',
    'b38a521d-7fc2-4e53-9e59-4224d530e680',
    'cf5c0cc0-b758-45d4-a18a-a8bcf5f6e486',
    '05379b34-dc4b-476e-88c7-af248fc6e79f',
    'ed545b83-cfd0-4d39-894b-d5ddfb7a3b0e',
    'seed-student-041',
    '1bd6c3ab-c787-485c-85b2-d6f7cda7b31d'
  ]
};

const TARGET_ENTITLEMENT_BY_STUDENT = {
  '5db707b6-4e1f-499d-ab09-889ff7598d97': 'a27fb3d3-d426-47f7-946b-baf67253d48c',
  'b38a521d-7fc2-4e53-9e59-4224d530e680': '70859839-61a9-443c-bb7b-f1e6b4a5fc58'
};

const TARGET_SCHEDULE_BY_ENTITLEMENT = {
  'a27fb3d3-d426-47f7-946b-baf67253d48c': 'c850691d-f94e-48e7-a7de-dc710085b5c4',
  '70859839-61a9-443c-bb7b-f1e6b4a5fc58': 'c850691d-f94e-48e7-a7de-dc710085b5c4'
};

function text(value) {
  return String(value ?? '').trim();
}

function parseArray(value) {
  if (Array.isArray(value)) return value;
  if (!value) return [];
  try {
    const parsed = JSON.parse(value);
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

function clone(value) {
  return value === undefined ? value : JSON.parse(JSON.stringify(value));
}

function decodeBundle(bundle) {
  if (!bundle || !bundle.rowsGzipBase64) return [];
  try {
    return JSON.parse(zlib.gunzipSync(Buffer.from(bundle.rowsGzipBase64, 'base64')).toString('utf8'));
  } catch (error) {
    throw new Error(`摘要压缩包无法读取：${error.message}`);
  }
}

function sourceTime(schedule = {}) {
  return text(schedule.startTime || schedule.date);
}

function timeText(schedule = {}) {
  const start = text(schedule.startTime);
  const end = text(schedule.endTime);
  const date = start.slice(0, 10) || text(schedule.date).slice(0, 10);
  const startClock = start.slice(11, 16);
  const endClock = end.slice(11, 16);
  if (date && startClock && endClock) return `${date} ${startClock}-${endClock}`;
  return date || start;
}

function ledgerId(scheduleId, entitlementId) {
  return `${OPERATION_ID}:ledger:${scheduleId}:${entitlementId}`;
}

function operationTrace(now) {
  return {
    operationId: OPERATION_ID,
    batchId: BATCH_ID,
    operationType: 'targeted-lesson-status-repair',
    operationAt: now,
    operationBy: 'Codex'
  };
}

function buildTargetLedger({ schedule, entitlement, now }) {
  const studentId = text(entitlement.studentId);
  return {
    id: ledgerId(schedule.id, entitlement.id),
    entitlementId: text(entitlement.id),
    purchaseId: text(entitlement.purchaseId),
    scheduleId: text(schedule.id),
    studentId,
    lessonDelta: -1,
    action: 'consume',
    reason: '定点修复：2026-07-31 已发生课程补扣课包',
    notes: '阳光正好/Jay 2026-07-31 小班课历史排课状态修复',
    operator: 'Codex',
    createdAt: now,
    relatedDate: text(schedule.date || sourceTime(schedule)).slice(0, 10),
    sourceDate: text(schedule.date || sourceTime(schedule)).slice(0, 10),
    sourceTimeBand: `${text(schedule.startTime).slice(11, 16)}-${text(schedule.endTime).slice(11, 16)}`,
    sourceLocation: text(schedule.campusName || schedule.campus),
    sourceVenue: text(schedule.venue),
    coach: text(schedule.coachName || schedule.coach),
    courseType: text(schedule.courseType),
    packageName: text(entitlement.packageName),
    ...operationTrace(now)
  };
}

function buildScheduleUpdate(row, now) {
  return {
    ...row,
    status: '已结束',
    state: '已结束',
    systemStatus: '已结束',
    confirmStatus: '已确认',
    updatedAt: now,
    ...operationTrace(now),
    repairReason: '定点修复：历史已发生课程统一收口为已结束/已确认'
  };
}

function buildEntitlementUpdate(row, now) {
  return {
    ...row,
    usedLessons: 1,
    remainingLessons: 0,
    status: 'depleted',
    updatedAt: now,
    ...operationTrace(now),
    repairReason: '定点修复：2026-07-31 已发生课程补扣 1 次'
  };
}

function buildIndexUpdate(row, now, entitlementId) {
  const currentIds = parseArray(row?.entitlementIds).map(text).filter(Boolean);
  const entitlementIds = currentIds.filter(id => id !== entitlementId);
  return {
    ...(row || { id: text(entitlementId) }),
    id: text(row?.id || ''),
    studentId: text(row?.studentId || row?.id),
    entitlementIds,
    updatedAt: now,
    ...operationTrace(now),
    repairReason: '定点修复：课包已用完，移出可用课包索引'
  };
}

function patchPackageRows(rows, entitlement, purchase) {
  return parseArray(rows).map(row => {
    if (text(row.entitlementId) !== text(entitlement.id)) return row;
    return {
      ...row,
      purchaseDate: text(purchase.purchaseDate || row.purchaseDate || entitlement.validFrom),
      usedLessons: 1,
      remainingLessons: 0,
      statusText: '已用完'
    };
  });
}

function buildCompletedSummaryLesson({ base, schedule, entitlement, ledger }) {
  const studentIds = parseArray(schedule.studentIds).map(text).filter(Boolean);
  const studentNames = parseArray(schedule.studentNames).map(text).filter(Boolean);
  return {
    ...base,
    kind: 'ledger',
    scheduleId: text(schedule.id),
    entitlementId: text(entitlement.id),
    purchaseId: text(entitlement.purchaseId || schedule.purchaseId),
    packageRecordKey: `ent:${text(entitlement.id)}`,
    sortTime: sourceTime(schedule),
    time: timeText(schedule),
    packageName: text(entitlement.packageName || base.packageName),
    packageOwnerStudentId: text(entitlement.studentId),
    packageOwnerName: text(entitlement.studentName),
    actualStudentIds: studentIds,
    actualStudentNames: studentNames,
    lessonDelta: -1,
    lessonUnits: 1,
    lessonCount: 1,
    countAsCompletedLesson: true,
    status: '已结束',
    statusClass: 'detail-tag-muted',
    packageLessonProgressText: '第1/1次',
    packageRemainingAfterText: '剩0次',
    lessonSourceType: 'package',
    lessonSourceText: '课包扣课｜第1/1次｜剩0次',
    pendingStudentLessonSequenceText: '',
    studentLessonSequenceText: '[累计第01节]',
    reason: text(ledger.reason),
    operationId: OPERATION_ID,
    batchId: BATCH_ID
  };
}

function patchSelectedStudentSummary(row, {
  studentId,
  schedule,
  entitlement,
  purchase,
  ledger,
  now
}) {
  const next = clone(row);
  const sourceDetailRows = parseArray(next.detailLessonRecordRows);
  const detailRows = sourceDetailRows.filter(item =>
    !(text(item.kind) === 'schedule' && text(item.scheduleId) === text(schedule?.id))
  );
  const targetLedgerIndex = detailRows.findIndex(item =>
    text(item.kind) === 'ledger'
      && text(item.scheduleId) === text(schedule?.id)
      && text(item.entitlementId) === text(entitlement?.id)
  );
  if (targetLedgerIndex >= 0) {
    detailRows[targetLedgerIndex] = buildCompletedSummaryLesson({
      base: detailRows[targetLedgerIndex],
      schedule,
      entitlement,
      ledger
    });
  } else {
    detailRows.push(buildCompletedSummaryLesson({
      base: {
        courseType: text(schedule.courseType),
        campus: text(schedule.campusName || schedule.campus),
        venue: text(schedule.venue),
        coach: text(schedule.coachName || schedule.coach)
      },
      schedule,
      entitlement,
      ledger
    }));
  }
  detailRows.sort((a, b) => text(b.sortTime || b.time).localeCompare(text(a.sortTime || a.time)));

  const nextPackageRows = patchPackageRows(next.detailPackageOrderRows, entitlement, purchase);
  const nextListRows = patchPackageRows(next.packageListRows, entitlement, purchase);
  const existingLedger = detailRows.some(item =>
    text(item.kind) === 'ledger'
      && text(item.scheduleId) === text(schedule.id)
      && text(item.entitlementId) === text(entitlement.id)
  );
  const oldCompleted = Number(next.completedLessons) || 0;
  const lastFormalLessonAt = text(next.lastFormalLessonAt || next.detailRecentLessonDate);
  const lessonDate = text(schedule.date || sourceTime(schedule)).slice(0, 10);

  return {
    ...next,
    hasFormalAttended: true,
    studentStatusLabel: '-',
    activityStatusLabel: text(next.activityStatusLabel) || '31-90天活跃',
    completedLessons: Math.max(oldCompleted, existingLedger ? 1 : oldCompleted + 1),
    lastFormalLessonAt: lastFormalLessonAt && lastFormalLessonAt > lessonDate ? lastFormalLessonAt : lessonDate,
    detailRecentLessonDate: text(next.detailRecentLessonDate) && text(next.detailRecentLessonDate) > lessonDate
      ? text(next.detailRecentLessonDate)
      : lessonDate,
    packageStatusLabel: '课包已用完',
    packageBalanceRemaining: 0,
    packageBalanceText: '0/1',
    detailPackageBalanceRemaining: 0,
    detailPackageBalanceText: '0/1',
    packagePurchaseDate: text(purchase.purchaseDate || next.packagePurchaseDate || lessonDate),
    detailPackageOrderRows: nextPackageRows,
    packageListRows: nextListRows,
    detailLessonRecordRows: detailRows,
    summaryUpdatedAt: now,
    updatedAt: now,
    operationId: OPERATION_ID,
    batchId: BATCH_ID,
    repairReason: `定点修复：${text(row.displayName || studentId)} 2026-07-31 已发生课程补扣课包`
  };
}

function patchAttendedSummary(row, now, reason) {
  return {
    ...clone(row),
    hasFormalAttended: true,
    studentStatusLabel: text(row.studentStatusLabel) === '已排课未上课' ? '-' : row.studentStatusLabel,
    summaryUpdatedAt: now,
    updatedAt: now,
    operationId: OPERATION_ID,
    batchId: BATCH_ID,
    repairReason: reason
  };
}

function assertExpectedRows({
  schedulesById,
  entitlementsById,
  summaryRows,
  summaryMeta,
  summaryBundle,
  summaryListBundle
}) {
  for (const id of TARGETS.schedules) {
    const row = schedulesById.get(id);
    if (!row) throw new Error(`停止：找不到目标排课 ${id}`);
    if (!['已排课', '已结束', '已下课'].includes(text(row.status))) {
      throw new Error(`停止：目标排课 ${id} 当前状态异常：${text(row.status)}`);
    }
    if (!['待确认', '已确认'].includes(text(row.confirmStatus))) {
      throw new Error(`停止：目标排课 ${id} 当前确认状态异常：${text(row.confirmStatus)}`);
    }
  }
  for (const id of TARGETS.entitlements) {
    const row = entitlementsById.get(id);
    if (!row) throw new Error(`停止：找不到目标课包 ${id}`);
    const used = Number(row.usedLessons);
    const remaining = Number(row.remainingLessons);
    if (Number(row.totalLessons) !== 1 || !((used === 0 && remaining === 1) || (used === 1 && remaining === 0))) {
      throw new Error(`停止：目标课包 ${id} 余额不是预期的 1 次状态`);
    }
  }
  if (!summaryMeta || text(summaryMeta.status) !== 'ready' || !text(summaryMeta.activeVersion)) {
    throw new Error('停止：教学摘要当前不是 ready，拒绝改摘要版本');
  }
  if (!Array.isArray(summaryRows) || Number(summaryMeta.rowCount) !== summaryRows.length) {
    throw new Error('停止：教学摘要主压缩包行数和 meta 不一致');
  }
  const bundleRows = summaryCache.studentTeachingSummaryBundleLogicalRows(summaryBundle);
  if (!summaryBundle
    || bundleRows.length !== summaryRows.length
    || text(summaryBundle.publishVersion) !== text(summaryMeta.activeVersion)
    || text(summaryBundle.checksum) !== summaryCache.buildStudentTeachingSummaryChecksum(bundleRows)) {
    throw new Error('停止：教学摘要主压缩包校验失败');
  }
  const listRows = decodeBundle(summaryListBundle);
  if (!summaryListBundle
    || listRows.length !== summaryRows.length
    || text(summaryListBundle.publishVersion) !== text(summaryMeta.activeVersion)
    || text(summaryListBundle.checksum) !== summaryCache.buildStudentTeachingSummaryChecksum(listRows)) {
    throw new Error('停止：教学摘要列表压缩包行数和 meta 不一致');
  }
}

function buildPlan({
  schedules = [],
  entitlements = [],
  purchases = [],
  ledgers = [],
  indexRows = [],
  summaryMeta,
  summaryRows = [],
  summaryBundle,
  summaryListBundle,
  now = new Date().toISOString()
}) {
  const schedulesById = new Map(schedules.map(row => [text(row.id), row]));
  const entitlementsById = new Map(entitlements.map(row => [text(row.id), row]));
  const purchasesById = new Map(purchases.map(row => [text(row.id), row]));
  const indexesByStudentId = new Map(indexRows.map(row => [text(row.studentId || row.id), row]));
  const ledgersById = new Map(ledgers.map(row => [text(row.id), row]).filter(([id]) => id));
  assertExpectedRows({
    schedulesById,
    entitlementsById,
    summaryRows,
    summaryMeta,
    summaryBundle,
    summaryListBundle
  });

  const scheduleUpdates = TARGETS.schedules
    .map(id => schedulesById.get(id))
    .filter(row => text(row.status) !== '已结束' || text(row.systemStatus) !== '已结束' || text(row.confirmStatus) !== '已确认')
    .map(row => ({ id: row.id, before: row, after: buildScheduleUpdate(row, now) }));

  const ledgerCreates = [];
  const entitlementUpdates = [];
  for (const entitlementId of TARGETS.entitlements) {
    const entitlement = entitlementsById.get(entitlementId);
    const schedule = schedulesById.get(TARGET_SCHEDULE_BY_ENTITLEMENT[entitlementId]);
    const existingLedger = ledgersById.get(ledgerId(schedule.id, entitlement.id));
    if (!existingLedger) {
      ledgerCreates.push({
        id: ledgerId(schedule.id, entitlement.id),
        before: null,
        after: buildTargetLedger({ schedule, entitlement, now })
      });
    }
    if (Number(entitlement.usedLessons) !== 1 || Number(entitlement.remainingLessons) !== 0 || text(entitlement.status) !== 'depleted') {
      entitlementUpdates.push({
        id: entitlement.id,
        before: entitlement,
        after: buildEntitlementUpdate(entitlement, now)
      });
    }
  }

  const indexUpdates = [];
  for (const studentId of Object.keys(TARGET_ENTITLEMENT_BY_STUDENT)) {
    const row = indexesByStudentId.get(studentId);
    if (!row) continue;
    const entitlementId = TARGET_ENTITLEMENT_BY_STUDENT[studentId];
    if (parseArray(row.entitlementIds).map(text).includes(entitlementId)) {
      indexUpdates.push({
        id: text(row.id || studentId),
        before: row,
        after: buildIndexUpdate(row, now, entitlementId)
      });
    }
  }

  const summaryByStudentId = new Map(summaryRows.map(row => [text(row.studentId || row.id), row]));
  const changedSummaryRows = [];
  for (const studentId of TARGETS.students) {
    const row = summaryByStudentId.get(studentId);
    if (!row) throw new Error(`停止：教学摘要缺少目标学员 ${studentId}`);
    let next = row;
    if (TARGET_ENTITLEMENT_BY_STUDENT[studentId]) {
      const entitlementId = TARGET_ENTITLEMENT_BY_STUDENT[studentId];
      const entitlement = entitlementsById.get(entitlementId);
      const schedule = schedulesById.get(TARGET_SCHEDULE_BY_ENTITLEMENT[entitlementId]);
      const purchase = purchasesById.get(text(entitlement.purchaseId)) || {};
      const ledger = ledgersById.get(ledgerId(schedule.id, entitlement.id))
        || buildTargetLedger({ schedule, entitlement, now });
      next = patchSelectedStudentSummary(row, {
        studentId,
        schedule,
        entitlement,
        purchase,
        ledger,
        now
      });
    } else if (studentId === '1bd6c3ab-c787-485c-85b2-d6f7cda7b31d') {
      next = patchAttendedSummary(row, now, '定点修复：达达已有他人课包正式扣课记录，修正列表状态');
    } else {
      next = patchAttendedSummary(row, now, `定点修复：${text(row.displayName || studentId)} 历史排课已发生，收口列表状态`);
    }
    changedSummaryRows.push({ id: studentId, before: row, after: next });
  }

  const nextSummaryRows = summaryRows.map(row => {
    const changed = changedSummaryRows.find(item => item.id === text(row.studentId || row.id));
    return changed ? changed.after : row;
  });

  const previousActiveVersion = text(summaryMeta.activeVersion) === SUMMARY_VERSION
    ? text(summaryMeta.previousActiveVersion)
    : text(summaryMeta.activeVersion);
  const nextSummaryBundle = summaryCache.buildStudentTeachingSummaryBundleRow(nextSummaryRows, SUMMARY_VERSION);
  const nextSummaryListBundle = summaryCache.buildStudentTeachingSummaryListBundleRow(nextSummaryRows, SUMMARY_VERSION);
  const versionedSummaryRows = changedSummaryRows.map(item =>
    summaryCache.buildVersionedStudentTeachingSummaryRow(item.after, SUMMARY_VERSION)
  );
  const nextSummaryMeta = {
    ...clone(summaryMeta),
    id: summaryCache.STUDENT_TEACHING_SUMMARY_META_ID,
    status: 'ready',
    generation: (Number(summaryMeta.generation) || 0) + 1,
    rowCount: nextSummaryRows.length,
    activeVersion: SUMMARY_VERSION,
    previousActiveVersion,
    batchId: BATCH_ID,
    sourceTable: TABLES.teachingSummary,
    sourceOp: OPERATION_ID,
    sourceId: TARGETS.schedules.join(','),
    sourceSnapshotAt: text(summaryMeta.sourceSnapshotAt || now),
    completedAt: now,
    checksum: summaryCache.buildStudentTeachingSummaryChecksum(nextSummaryRows),
    updatedAt: now
  };

  return {
    scheduleUpdates,
    ledgerCreates,
    entitlementUpdates,
    indexUpdates,
    changedSummaryRows,
    versionedSummaryRows,
    nextSummaryRows,
    nextSummaryBundle,
    nextSummaryListBundle,
    nextSummaryMeta,
    counts: {
      scheduleUpdates: scheduleUpdates.length,
      ledgerCreates: ledgerCreates.length,
      entitlementUpdates: entitlementUpdates.length,
      indexUpdates: indexUpdates.length,
      summaryRows: changedSummaryRows.length
    }
  };
}

async function writePlan(client, plan) {
  for (const item of plan.ledgerCreates) await putRow(client, TABLES.entitlementLedger, item.after);
  for (const item of plan.entitlementUpdates) await putRow(client, TABLES.entitlements, item.after);
  for (const item of plan.indexUpdates) await putRow(client, TABLES.activeEntitlementIndex, item.after);
  for (const item of plan.scheduleUpdates) await putRow(client, TABLES.schedule, item.after);

  for (const row of plan.versionedSummaryRows) await putRow(client, TABLES.teachingSummary, row);
  await putRow(client, TABLES.teachingSummary, plan.nextSummaryBundle);
  await putRow(client, TABLES.teachingSummary, plan.nextSummaryListBundle);
  await putRow(client, TABLES.teachingSummary, plan.nextSummaryMeta);
}

function compactPlan(plan) {
  return {
    counts: plan.counts,
    scheduleIds: plan.scheduleUpdates.map(item => item.id),
    ledgerIds: plan.ledgerCreates.map(item => item.id),
    entitlementIds: plan.entitlementUpdates.map(item => item.id),
    indexIds: plan.indexUpdates.map(item => item.id),
    summaryStudentIds: plan.changedSummaryRows.map(item => item.id),
    nextSummaryVersion: plan.nextSummaryMeta.activeVersion,
    previousSummaryVersion: plan.nextSummaryMeta.previousActiveVersion
  };
}

async function loadInputs(client) {
  const scheduleRows = await Promise.all(TARGETS.schedules.map(id => getRow(client, TABLES.schedule, id)));
  const entitlementRows = await Promise.all(TARGETS.entitlements.map(id => getRow(client, TABLES.entitlements, id)));
  const purchaseRows = await Promise.all(TARGETS.purchases.map(id => getRow(client, TABLES.purchases, id)));
  const ledgerRows = await Promise.all(TARGETS.entitlements.map(entitlementId => {
    const scheduleId = TARGET_SCHEDULE_BY_ENTITLEMENT[entitlementId];
    return getRow(client, TABLES.entitlementLedger, ledgerId(scheduleId, entitlementId));
  }));
  const indexRows = await Promise.all(Object.keys(TARGET_ENTITLEMENT_BY_STUDENT).map(id =>
    getRow(client, TABLES.activeEntitlementIndex, id)
  ));
  const summaryMeta = await getRow(client, TABLES.teachingSummary, summaryCache.STUDENT_TEACHING_SUMMARY_META_ID);
  if (!summaryMeta?.activeVersion) throw new Error('停止：教学摘要没有 activeVersion');
  const summaryBundle = await getRow(
    client,
    TABLES.teachingSummary,
    summaryCache.buildStudentTeachingSummaryBundleId(summaryMeta.activeVersion)
  );
  const summaryListBundle = await getRow(
    client,
    TABLES.teachingSummary,
    summaryCache.buildStudentTeachingSummaryListBundleId(summaryMeta.activeVersion)
  );
  return {
    schedules: scheduleRows.filter(Boolean),
    entitlements: entitlementRows.filter(Boolean),
    purchases: purchaseRows.filter(Boolean),
    ledgers: ledgerRows.filter(Boolean),
    indexRows: indexRows.filter(Boolean),
    summaryMeta,
    summaryBundle,
    summaryListBundle,
    summaryRows: summaryCache.studentTeachingSummaryBundleLogicalRows(summaryBundle)
  };
}

async function run(argv = process.argv.slice(2)) {
  loadRuntimeEnv({ override: true });
  const args = parseWriteFlags(argv);
  const reportPath = path.join(REPORT_DIR, `${OPERATION_ID}-${args.write ? 'write' : 'dry-run'}.json`);
  assertProductionWriteTrace({ operationId: OPERATION_ID, batchId: BATCH_ID, reportPath });
  const target = await assertProductionWriteTarget();
  const client = createClientFromEnv();
  const inputs = await loadInputs(client);
  const now = new Date().toISOString();
  const plan = buildPlan({ ...inputs, now });
  const report = {
    ok: true,
    mode: args.write ? 'write' : 'dry-run',
    target,
    operationId: OPERATION_ID,
    batchId: BATCH_ID,
    generatedAt: now,
    reportPath,
    plan: compactPlan(plan),
    before: {
      schedules: inputs.schedules,
      entitlements: inputs.entitlements,
      purchases: inputs.purchases,
      ledgers: inputs.ledgers,
      indexRows: inputs.indexRows,
      summaryMeta: inputs.summaryMeta,
      summaryRows: plan.changedSummaryRows.map(item => item.before)
    },
    after: {
      schedules: plan.scheduleUpdates.map(item => item.after),
      entitlements: plan.entitlementUpdates.map(item => item.after),
      ledgers: plan.ledgerCreates.map(item => item.after),
      indexRows: plan.indexUpdates.map(item => item.after),
      summaryMeta: plan.nextSummaryMeta,
      summaryRows: plan.changedSummaryRows.map(item => item.after)
    }
  };
  fs.mkdirSync(REPORT_DIR, { recursive: true });
  fs.writeFileSync(reportPath, `${JSON.stringify(report, null, 2)}\n`, 'utf8');

  if (args.write) {
    await writePlan(client, plan);
    report.completedAt = new Date().toISOString();
    fs.writeFileSync(reportPath, `${JSON.stringify(report, null, 2)}\n`, 'utf8');
  }

  console.log(JSON.stringify({
    ok: true,
    mode: report.mode,
    reportPath,
    ...plan.counts,
    activeSummaryVersion: plan.nextSummaryMeta.activeVersion
  }, null, 2));
}

if (require.main === module) {
  run().catch(error => {
    console.error(error?.stack || String(error));
    process.exit(1);
  });
}

module.exports = {
  OPERATION_ID,
  BATCH_ID,
  TABLES,
  TARGETS,
  ledgerId,
  buildTargetLedger,
  buildPlan,
  compactPlan,
  decodeBundle
};
