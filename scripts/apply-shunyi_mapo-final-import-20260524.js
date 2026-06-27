#!/usr/bin/env node

const fs = require('fs');
const path = require('path');
const {
  SOURCE_FILES,
  REPORT_DIR,
  TABLES,
  loadEnv,
  assertProductionTarget,
  csvRows,
  normalizeName,
  parseArr,
  likelyCourse,
  extractCourseName,
  money,
  buildStudentIndexes,
  buildCourtIndexes,
  activeEntitlementsForStudent,
  lessonStudentName,
  buildImportPlans,
  buildImportSummary,
  buildImportContext,
  buildStudentRecord,
  buildPurchaseRecordFromIncome,
  buildEntitlementRecordFromPurchase,
  buildScheduleRecord,
  buildEntitlementLedgerRecordFromSchedule,
  buildCourtHistoryWriteRows,
  scanImportTables,
  makeImportId,
  createClientFromEnv,
  putRow
} = require('./lib/shunyi_mapo-import-core');

function parseArgs(argv) {
  return {
    write: argv.includes('--write'),
    dryRun: argv.includes('--dry-run') || !argv.includes('--write')
  };
}

function makeOperationTrace(now = new Date().toISOString()) {
  const stamp = String(now).replace(/[^0-9]/g, '').slice(0, 17) || String(Date.now());
  const operationId = `shunyi_mapo-final-import-20260524-${stamp}`;
  return {
    operationId,
    batchId: `batch-${operationId}`
  };
}

function parseSourceRows() {
  const schedule = csvRows(SOURCE_FILES.schedule).map((row, idx) => ({ ...row, __rowNo: Number(row['收入原表行号'] || idx + 2) }));
  const entitlement = csvRows(SOURCE_FILES.entitlement).map((row, idx) => ({ ...row, __rowNo: idx + 2 }));
  const income = csvRows(SOURCE_FILES.income).map((row, idx) => ({ ...row, __rowNo: Number(row['原表行号'] || idx + 2) }));
  return { schedule, entitlement, income };
}

function sourceByRowNo(rows) {
  const map = new Map();
  for (const row of rows || []) {
    const key = String(row.__rowNo || row['原表行号'] || row['收入原表行号'] || '').trim();
    if (!key) continue;
    map.set(key, row);
  }
  return map;
}

function buildStudentResolver(existingStudents, pendingStudents = []) {
  const byName = new Map();
  for (const row of existingStudents || []) {
    const key = normalizeName(row.name || row.studentName || '');
    if (!key) continue;
    if (!byName.has(key)) byName.set(key, row);
  }
  for (const row of pendingStudents || []) {
    const key = normalizeName(row.name || row.studentName || '');
    if (!key) continue;
    if (!byName.has(key)) byName.set(key, row);
  }
  return {
    resolve(name) {
      const key = normalizeName(name);
      return byName.get(key) || null;
    },
    register(row) {
      const key = normalizeName(row.name || row.studentName || '');
      if (key) byName.set(key, row);
      return row;
    }
  };
}

function buildActiveIndexRows(entitlements) {
  const byStudent = new Map();
  for (const row of entitlements || []) {
    if (String(row.status || 'active') !== 'active') continue;
    if (Number(row.remainingLessons) <= 0 && Number(row.totalLessons) <= 0) continue;
    const key = String(row.studentId || '').trim();
    if (!key) continue;
    if (!byStudent.has(key)) byStudent.set(key, []);
    byStudent.get(key).push(row.id);
  }
  return [...byStudent.entries()].map(([studentId, entitlementIds]) => ({
    id: studentId,
    studentId,
    entitlementIds,
    updatedAt: new Date().toISOString()
  }));
}

function matchExistingSchedule(scheduleRows, candidate, studentId) {
  const start = `${candidate['日期']} ${String(candidate['开始'] || '').slice(0, 5)}`;
  const end = `${candidate['日期']} ${String(candidate['结束'] || '').slice(0, 5)}`;
  const coachKey = normalizeName(candidate['教练']);
  const venueKey = normalizeName(`${candidate['场馆'] || ''}${candidate['场地'] || ''}`);
  return (scheduleRows || []).find((item) => {
    const sameStudent = parseArr(item.studentIds).some((id) => String(id) === String(studentId)) ||
      normalizeName(item.studentName || '') === normalizeName(candidate['学员']);
    if (!sameStudent) return false;
    const sameCoach = !coachKey || normalizeName(item.coach || item.coachName || '') === coachKey;
    const itemVenue = normalizeName(`${item.externalVenueName || item.campusName || item.campus || ''}${item.venue || item.externalCourtName || ''}`);
    const sameVenue = !venueKey || !itemVenue || itemVenue.includes(venueKey) || venueKey.includes(itemVenue);
    const sameTime = String(item.startTime || '') === start && String(item.endTime || '') === end;
    return sameCoach && sameVenue && sameTime;
  }) || null;
}

function matchExistingEntitlement(entitlements, studentId, purchaseId) {
  return (entitlements || []).find((row) => String(row.studentId || '') === String(studentId || '') && String(row.purchaseId || '') === String(purchaseId || '')) || null;
}

function shouldCreateCoursePurchase(row) {
  if (!likelyCourse(row)) return false;
  if (/订场\/场地费补账/.test(String(row['导入动作'] || ''))) return false;
  if (/订场\/储值\/发球机/.test(String(row['导入动作'] || ''))) return false;
  return money(row['实收/核销']) > 0 && String(row['支付方式'] || '') !== '课包划扣';
}

function shouldCreateCourtHistory(row) {
  if (likelyCourse(row)) return false;
  return money(row['实收/核销']) > 0;
}

function traceRow(row, trace, now = new Date().toISOString()) {
  if (!row) return row;
  return {
    ...row,
    operationId: trace.operationId,
    batchId: trace.batchId,
    updatedAt: row.updatedAt || now
  };
}

function traceCourtRow(row, trace, now = new Date().toISOString()) {
  const traced = traceRow(row, trace, now);
  return {
    ...traced,
    history: Array.isArray(row.history)
      ? row.history.map((item) => traceRow(item, trace, now))
      : row.history
  };
}

function buildApplyReport({ mode, trace, target, writePlan, reportPath }) {
  return {
    generatedAt: new Date().toISOString(),
    mode,
    operationId: trace.operationId,
    batchId: trace.batchId,
    target,
    reportPath,
    tables: {
      [TABLES.students]: writePlan.students,
      [TABLES.purchases]: writePlan.purchases,
      [TABLES.entitlements]: writePlan.entitlements,
      [TABLES.schedule]: writePlan.schedules,
      [TABLES.entitlementLedger]: writePlan.ledgers,
      [TABLES.courts]: writePlan.courts,
      [TABLES.activeEntitlementIndex]: writePlan.activeIndexRows
    }
  };
}

function writeReport(report, reportPath) {
  fs.mkdirSync(path.dirname(reportPath), { recursive: true });
  fs.writeFileSync(reportPath, `${JSON.stringify(report, null, 2)}\n`, 'utf8');
}

async function writeRows(client, tableName, rows, writeRow = putRow) {
  for (const row of rows) await writeRow(client, tableName, row);
}

async function run(argv = process.argv.slice(2), deps = {}) {
  const args = parseArgs(argv);
  const now = deps.now || new Date().toISOString();
  const trace = deps.trace || makeOperationTrace(now);
  const reportDir = deps.reportDir || path.join(REPORT_DIR, 'apply-reports');
  const reportPath = deps.reportPath || path.join(reportDir, `${trace.operationId}.json`);
  const loadEnvironment = deps.loadEnv || loadEnv;
  const assertTarget = deps.assertProductionTarget || assertProductionTarget;
  const createClient = deps.createClientFromEnv || createClientFromEnv;
  const loadContext = deps.buildImportContext || buildImportContext;
  const loadSourceRows = deps.parseSourceRows || parseSourceRows;
  const writeRow = deps.writeRow || putRow;

  loadEnvironment();
  const target = await assertTarget();
  const client = createClient();
  const context = await loadContext(client);
  const sourceRows = loadSourceRows();
  const studentResolver = buildStudentResolver(context.students);
  const schedulesByIncomeRowNo = sourceByRowNo(sourceRows.schedule);
  const incomeByRowNo = sourceByRowNo(sourceRows.income);

  const plan = buildImportPlans(sourceRows, context, {
    students: buildStudentIndexes(context.students),
    courts: buildCourtIndexes(context.courts)
  });
  const summary = buildImportSummary(plan, target, context);

  const pendingStudents = [];
  const pendingPurchases = [];
  const pendingSchedules = [];
  const pendingLedgers = [];
  const pendingCourtHistoryRows = [];
  const changedEntitlementIds = new Set();

  for (const row of sourceRows.income) {
    if (!shouldCreateCoursePurchase(row)) continue;
    const studentName = extractCourseName(row['客户/学员']);
    const existingStudent = studentResolver.resolve(studentName);
    const student = existingStudent || buildStudentRecord(studentName, now, { rowNo: row.__rowNo, campus: 'shunyi_mapo' });
    if (!existingStudent) {
      pendingStudents.push(student);
      studentResolver.register(student);
    }
    const scheduleRow = schedulesByIncomeRowNo.get(String(row.__rowNo));
    const lessonCount = scheduleRow ? Number(scheduleRow['课时'] || 1) || 1 : 1;
    const purchaseId = makeImportId('purchase', row.__rowNo, normalizeName(student.name || studentName));
    const purchase = buildPurchaseRecordFromIncome(row, student, {
      id: purchaseId,
      lessonCount,
      packageName: row['收入类型'] || row['客户/学员'] || '马坡导入课包',
      productName: row['收入类型'] || '私教课',
      courseType: row['收入类型'] || '私教课',
      sourceType: 'lesson_payment',
      notes: row['最终备注'] || row['备注'] || ''
    });
    pendingPurchases.push(purchase);
  }

  const existingEntitlementsById = new Map(context.entitlements.map((row) => [String(row.id), row]));
  const nextEntitlements = [...context.entitlements];

  for (const row of sourceRows.schedule) {
    const studentName = lessonStudentName(row['学员']);
    const existingStudent = studentResolver.resolve(studentName);
    const student = existingStudent || buildStudentRecord(studentName, now, { rowNo: row.__rowNo, campus: 'shunyi_mapo' });
    if (!existingStudent) {
      pendingStudents.push(student);
      studentResolver.register(student);
    }
    const existingSchedule = matchExistingSchedule(context.schedule, row, student.id);
    const linkedIncome = incomeByRowNo.get(String(row['收入原表行号'] || ''));
    const linkedPurchase = linkedIncome && pendingPurchases.find((item) => item.studentId === student.id && String(item.purchaseDate || '') === String(row['日期'] || ''));
    const purchaseId = linkedPurchase ? linkedPurchase.id : (existingSchedule?.purchaseId || '');
    const entitlement = /课包划扣/.test(row['支付方式'] || '') ? activeEntitlementsForStudent(nextEntitlements, student.id)[0] || null : null;
    const scheduleId = existingSchedule?.id || makeImportId('schedule', row['收入原表行号'] || row.__rowNo, normalizeName(student.name || studentName));
    const scheduleRecord = buildScheduleRecord(row, student, {
      id: scheduleId,
      purchaseId,
      entitlementId: entitlement?.id || '',
      packageName: entitlement?.packageName || linkedPurchase?.packageName || '',
      now
    });
    pendingSchedules.push(scheduleRecord);
  }

  const scheduleLookup = [...context.schedule, ...pendingSchedules];
  for (const row of sourceRows.entitlement) {
    const studentName = lessonStudentName(row['学员']);
    if (studentName === '宋缇缇') continue;
    const student = studentResolver.resolve(studentName);
    if (!student) continue;
    const entitlement = activeEntitlementsForStudent([...existingEntitlementsById.values()], student.id)[0];
    if (!entitlement) continue;
    const [start, end] = String(row['时间'] || '').split('-');
    const scheduleRow = scheduleLookup.find((item) => {
      const sameStudent = parseArr(item.studentIds).some((id) => String(id) === String(student.id)) || normalizeName(item.studentName || '') === normalizeName(studentName);
      return sameStudent
        && String(item.startTime || '').slice(0, 10) === row['日期']
        && String(item.startTime || '').slice(11, 16) === String(start || '').slice(0, 5)
        && String(item.endTime || '').slice(11, 16) === String(end || '').slice(0, 5);
    }) || null;
    const lessonCount = Math.abs(Number(row['课时变化'] || 0)) || 1;
    const ledgerRecord = buildEntitlementLedgerRecordFromSchedule({
      id: scheduleRow?.id || '',
      startTime: `${row['日期']} ${String(start || '').slice(0, 5)}`,
      endTime: `${row['日期']} ${String(end || '').slice(0, 5)}`,
      studentName: student.name || row['学员'],
      coach: row['教练'] || '',
      venue: '',
      courseType: '私教课',
      lessonCount,
      notes: row['备注'] || ''
    }, entitlement, {
      id: makeImportId('ledger', row['收入原表行号'] || row.__rowNo, normalizeName(student.name || row['学员'])),
      lessonDelta: lessonCount,
      notes: row['备注'] || ''
    });
    ledgerRecord.scheduleId = scheduleRow?.id || '';
    ledgerRecord.sourceSheet = '马坡收入记录';
    ledgerRecord.sourceVenue = scheduleRow?.venue || '';
    pendingLedgers.push(ledgerRecord);
    const used = Math.max(0, Number(entitlement.usedLessons || 0) + lessonCount);
    const remaining = Math.max(0, Number(entitlement.totalLessons || 0) - used);
    existingEntitlementsById.set(entitlement.id, {
      ...entitlement,
      usedLessons: used,
      remainingLessons: remaining,
      status: remaining <= 0 ? 'depleted' : 'active',
      updatedAt: now
    });
    changedEntitlementIds.add(entitlement.id);
  }

  for (const row of sourceRows.income) {
    if (!shouldCreateCourtHistory(row)) continue;
    pendingCourtHistoryRows.push(row);
  }

  const pendingCourts = buildCourtHistoryWriteRows(pendingCourtHistoryRows, context.courts, { now });
  const activeIndexRows = buildActiveIndexRows([...existingEntitlementsById.values()].filter(Boolean)).map((row) => traceRow(row, trace, now));
  const changedEntitlements = [...changedEntitlementIds].map((id) => existingEntitlementsById.get(id)).filter(Boolean).map((row) => traceRow(row, trace, now));
  const tracedStudents = pendingStudents.map((row) => traceRow(row, trace, now));
  const tracedPurchases = pendingPurchases.map((row) => traceRow(row, trace, now));
  const tracedSchedules = pendingSchedules.map((row) => traceRow(row, trace, now));
  const tracedLedgers = pendingLedgers.map((row) => traceRow(row, trace, now));
  const tracedCourts = pendingCourts.map((row) => traceCourtRow(row, trace, now));
  const nextSummary = {
    ...summary,
    operationId: trace.operationId,
    batchId: trace.batchId,
    writePlan: {
      students: tracedStudents.length,
      purchases: tracedPurchases.length,
      entitlements: changedEntitlements.length,
      schedules: tracedSchedules.length,
      ledgers: tracedLedgers.length,
      courts: tracedCourts.length,
      activeIndexRows: activeIndexRows.length
    }
  };
  const report = buildApplyReport({
    mode: args.dryRun ? 'dry-run' : 'write',
    trace,
    target,
    writePlan: nextSummary.writePlan,
    reportPath
  });
  writeReport(report, reportPath);

  if (args.dryRun) {
    const output = { ...nextSummary, report };
    console.log(JSON.stringify(output, null, 2));
    return { summary: nextSummary, report, reportPath };
  }

  await writeRows(client, TABLES.students, tracedStudents, writeRow);
  await writeRows(client, TABLES.purchases, tracedPurchases, writeRow);
  await writeRows(client, TABLES.entitlements, changedEntitlements, writeRow);
  await writeRows(client, TABLES.schedule, tracedSchedules, writeRow);
  await writeRows(client, TABLES.entitlementLedger, tracedLedgers, writeRow);
  await writeRows(client, TABLES.courts, tracedCourts, writeRow);
  await writeRows(client, TABLES.activeEntitlementIndex, activeIndexRows, writeRow);

  const output = { ok: true, ...nextSummary, report };
  console.log(JSON.stringify(output, null, 2));
  return { summary: nextSummary, report, reportPath };
}

async function main() {
  await run(process.argv.slice(2));
}

if (require.main === module) {
  main().catch((err) => {
    console.error(err && err.stack ? err.stack : String(err));
    process.exit(1);
  });
}

module.exports = {
  parseArgs,
  makeOperationTrace,
  traceRow,
  traceCourtRow,
  buildApplyReport,
  run
};
