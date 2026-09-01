#!/usr/bin/env node

const fs = require('fs');
const path = require('path');
const { loadRuntimeEnv } = require('./lib/runtime-env');
const { createClientFromEnv, scanTable, putRow, deleteRow } = require('./lib/staging-data-store');
const { parseWriteFlags, assertProductionWriteTarget, assertProductionWriteTrace } = require('./lib/production-write-guard');
const {
  STUDENT_TEACHING_SUMMARY_META_ID,
  buildStudentTeachingSummaryChecksum
} = require('../server/read-models/student-teaching-summary-cache');

const ROOT = path.join(__dirname, '..');
const OPERATION_ID = 'repair-lead-pool-visible-dirty-names-20260826';
const BATCH_ID = `batch-${OPERATION_ID}`;
const REPORT_DIR = path.join(ROOT, 'offline-reports');

const TABLES = {
  leads: 'ft_leads',
  students: 'ft_students',
  leadFollowups: 'ft_lead_followups',
  purchases: 'ft_purchases',
  entitlements: 'ft_entitlements',
  entitlementLedger: 'ft_entitlement_ledger',
  schedule: 'ft_schedule',
  studentTeachingSummaries: 'ft_student_teaching_summary'
};

const SOURCE_NAME_FIELDS = {
  leads: ['displayName', 'wechatName', 'name', 'studentName'],
  students: ['displayName', 'wechatName', 'name', 'studentName'],
  purchases: ['studentName'],
  entitlements: ['studentName'],
  entitlementLedger: ['studentName', 'customerName'],
  schedule: ['studentName', 'sourceLeadName']
};

function text(value) {
  return String(value ?? '').trim();
}

function active(row = {}) {
  const status = text(row.status || row.systemStatus || 'active').toLowerCase();
  return !['merged', 'voided', 'deleted', 'inactive', 'cancelled', 'canceled', '已合并', '已作废', '已删除', '已取消'].includes(status);
}

function cleanEdgePunctuation(value) {
  return text(value).replace(/^[\s、，,;；/|｜]+|[\s、，,;；/|｜]+$/g, '').trim();
}

function splitCompositeName(value) {
  return cleanEdgePunctuation(value)
    .split(/[、,，/+＋&]+/)
    .map(cleanEdgePunctuation)
    .filter(Boolean);
}

function identityKey(value) {
  return cleanEdgePunctuation(value)
    .toLowerCase()
    .replace(/\s+/g, '')
    .replace(/[·.。_\-\/|｜，,;；]/g, '');
}

function stripCompositeNoise(value) {
  return cleanEdgePunctuation(value)
    .replace(/[.。]+$/g, '')
    .replace(/[（(]\s*(?:体验|正式|小班|团课|训练营|集训营|\d+\s*人)\s*[）)]$/g, '')
    .replace(/(?:等)?\s*\d+\s*人$/g, '')
    .replace(/等三人$/g, '')
    .replace(/[.。]+$/g, '')
    .replace(/\s+/g, '')
    .trim();
}

function canonicalDirtyName(value) {
  const parts = splitCompositeName(value);
  if (!parts.length) return '';
  return stripCompositeNoise(parts[0]);
}

function isObviousNoiseName(value) {
  const raw = cleanEdgePunctuation(value).replace(/\s+/g, '');
  if (!raw) return true;
  if (/^[+\-—_~·.。,，、/&]+$/.test(raw)) return true;
  if (/^(?:朋友|家长|学员|多人|待定|未知|三人|等三人|零基础|随到随学|随到随学小班课|多球课)$/u.test(raw)) return true;
  return false;
}

function hasEdgePunctuation(value) {
  const raw = text(value);
  return !!raw && raw !== cleanEdgePunctuation(raw);
}

function displayName(row = {}) {
  return text(row.displayName || row.wechatName || row.name || row.studentName);
}

function rowId(row = {}) {
  return text(row.id || row.leadId || row.studentId);
}

function sameJson(a, b) {
  return JSON.stringify(a) === JSON.stringify(b);
}

function shouldCleanCompositeName(value) {
  const raw = cleanEdgePunctuation(value);
  if (!raw) return false;
  const cleanName = canonicalDirtyName(raw);
  return hasEdgePunctuation(raw) || cleanName !== raw || isObviousNoiseName(cleanName);
}

function cleanNameValue(value) {
  const cleanName = canonicalDirtyName(value);
  if (!cleanName || isObviousNoiseName(cleanName)) return '';
  return cleanName;
}

function parseArray(value) {
  if (Array.isArray(value)) return value.map(text).filter(Boolean);
  const raw = text(value);
  if (!raw) return [];
  try {
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed) ? parsed.map(text).filter(Boolean) : [];
  } catch {}
  return raw.split(',').map(text).filter(Boolean);
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

function namePatch(row = {}, cleanName = '') {
  const next = { ...row };
  next.displayName = cleanName;
  next.wechatName = cleanName;
  next.name = cleanName;
  next.studentName = cleanName;
  return next;
}

function rowReferenceIds(row = {}) {
  return [
    rowId(row),
    row.studentId,
    row.sourceLeadId,
    row.leadId,
    row.fromLeadId,
    ...parseArray(row.studentIds),
    ...parseArray(row.expectedStudentIds),
    ...parseArray(row.absentStudentIds)
  ].map(text).filter(Boolean);
}

function rowReferencesAny(row = {}, ids = new Set()) {
  return rowReferenceIds(row).some(id => ids.has(id));
}

function removeIds(value, ids = new Set()) {
  return parseArray(value).filter(id => !ids.has(id));
}

function sourceNamePatch(row = {}, fields = [], now = '', reason = '') {
  const next = { ...row };
  fields.forEach(field => {
    if (!Object.prototype.hasOwnProperty.call(row, field)) return;
    if (!shouldCleanCompositeName(row[field])) return;
    next[field] = cleanNameValue(row[field]);
  });
  return trace(next, now, reason);
}

function sourceScheduleNoisePatch(row = {}, dirtyIds = new Set(), now = '') {
  const nextStudentIds = removeIds(row.studentIds, dirtyIds);
  const next = sourceNamePatch(row, SOURCE_NAME_FIELDS.schedule, now, '清理排课源头纯噪声姓名');
  return trace({
    ...next,
    status: '已取消',
    state: '已取消',
    systemStatus: '已取消',
    confirmStatus: '已取消',
    cancelReason: text(row.cancelReason) || '线索池脏数据治理：纯噪声学员排课取消，避免摘要回流',
    studentId: dirtyIds.has(text(row.studentId)) ? '' : text(row.studentId),
    studentIds: nextStudentIds,
    expectedStudentIds: removeIds(row.expectedStudentIds, dirtyIds),
    absentStudentIds: removeIds(row.absentStudentIds, dirtyIds)
  }, now, '取消纯噪声学员排课并清理学员引用');
}

function chooseTarget(rows = [], preferredId = '') {
  const activeRows = rows.filter(active);
  if (preferredId) {
    const preferred = activeRows.find(row => rowId(row) === preferredId);
    if (preferred) return preferred;
  }
  return [...activeRows].sort((a, b) => (
    text(a.createdAt || a.leadDate || a.updatedAt).localeCompare(text(b.createdAt || b.leadDate || b.updatedAt)) ||
    rowId(a).localeCompare(rowId(b))
  ))[0] || null;
}

function addPut(puts, table, before, after, reason) {
  if (!before || !after || sameJson(before, after)) return;
  puts.push({ table, id: rowId(after), reason, before, after });
}

function addDelete(deletes, table, before, reason) {
  const id = rowId(before);
  if (!id) return;
  deletes.push({ table, id, reason, before });
}

function buildNameIndex(rows = []) {
  const index = new Map();
  rows.forEach(row => {
    const key = identityKey(displayName(row));
    if (!key) return;
    if (!index.has(key)) index.set(key, []);
    index.get(key).push(row);
  });
  return index;
}

function mergeLead({ puts, lead, target, now, reason }) {
  if (!lead || !target || rowId(lead) === rowId(target)) return;
  const cleanName = displayName(target) || cleanNameValue(displayName(lead));
  addPut(puts, TABLES.leads, lead, trace({
    ...namePatch(lead, cleanName),
    status: 'merged',
    mergedIntoLeadId: rowId(target),
    mergedIntoLeadName: displayName(target),
    mergedAt: now,
    mergedBy: 'Codex'
  }, now, reason), reason);
}

function mergeStudent({ puts, student, target, now, reason }) {
  if (!student || !target || rowId(student) === rowId(target)) return;
  const cleanName = displayName(target) || cleanNameValue(displayName(student));
  addPut(puts, TABLES.students, student, trace({
    ...namePatch(student, cleanName),
    status: 'merged',
    mergedIntoStudentId: rowId(target),
    mergedIntoStudentName: displayName(target),
    mergedAt: now,
    mergedBy: 'Codex',
    sourceLeadId: text(target.sourceLeadId || student.sourceLeadId)
  }, now, reason), reason);
}

function buildPlan(data = {}, now = new Date().toISOString()) {
  const leads = Array.isArray(data.leads) ? data.leads : [];
  const students = Array.isArray(data.students) ? data.students : [];
  const studentTeachingSummaries = Array.isArray(data.studentTeachingSummaries) ? data.studentTeachingSummaries : [];
  const leadIndex = buildNameIndex(leads.filter(active));
  const studentIndex = buildNameIndex(students.filter(active));
  const puts = [];
  const deletes = [];
  const mergedLeadIds = new Set();
  const mergedStudentIds = new Set();
  const cleanedSummaryIds = new Set();
  const deletedSummaryIds = new Set();
  const dirtySummaryStudentIds = new Set();

  function handleAlias({ sourceName, targetName, targetLeadId = '', targetStudentId = '', reason }) {
    const sourceKey = identityKey(sourceName);
    const targetKey = identityKey(targetName);
    const targetLead = chooseTarget(leadIndex.get(targetKey) || [], targetLeadId);
    const targetStudent = chooseTarget(studentIndex.get(targetKey) || [], targetStudentId);

    for (const lead of leadIndex.get(sourceKey) || []) {
      if (!active(lead) || rowId(lead) === rowId(targetLead)) continue;
      mergeLead({ puts, lead, target: targetLead, now, reason });
      mergedLeadIds.add(rowId(lead));
    }
    for (const student of studentIndex.get(sourceKey) || []) {
      if (!active(student) || rowId(student) === rowId(targetStudent)) continue;
      mergeStudent({ puts, student, target: targetStudent, now, reason });
      mergedStudentIds.add(rowId(student));
    }
  }

  handleAlias({
    sourceName: '理想员工团课',
    targetName: '理想团课',
    targetStudentId: 'student-ideal-group-enterprise',
    reason: '用户确认：理想线索池只保留理想团课'
  });
  handleAlias({
    sourceName: '吃很多饭的朋友',
    targetName: '吃很多饭朋友',
    reason: '用户确认：吃很多饭只保留吃很多饭和吃很多饭朋友'
  });

  for (const lead of leads) {
    const id = rowId(lead);
    if (!active(lead) || mergedLeadIds.has(id)) continue;
    const rawName = displayName(lead);
    const cleanName = canonicalDirtyName(rawName);
    if (!hasEdgePunctuation(rawName) && cleanName === cleanEdgePunctuation(rawName)) continue;
    if (!cleanName) {
      addPut(puts, TABLES.leads, lead, trace({ ...namePatch(lead, ''), status: 'voided', voidedAt: now, voidedBy: 'Codex', voidReason: '线索姓名只有分隔符' }, now, '作废只有分隔符的脏线索'), '作废只有分隔符的脏线索');
      mergedLeadIds.add(id);
      continue;
    }
    if (isObviousNoiseName(cleanName)) {
      addPut(puts, TABLES.leads, lead, trace({ ...namePatch(lead, ''), status: 'voided', voidedAt: now, voidedBy: 'Codex', voidReason: '线索姓名是明显的群名或噪声名' }, now, '作废明显群名/噪声线索'), '作废明显群名/噪声线索');
      mergedLeadIds.add(id);
      continue;
    }
    const target = chooseTarget((leadIndex.get(identityKey(cleanName)) || []).filter(row => rowId(row) !== id));
    if (target) {
      mergeLead({ puts, lead, target, now, reason: '去掉姓名前后顿号后与已有线索重复，合并隐藏' });
      mergedLeadIds.add(id);
    } else {
      addPut(puts, TABLES.leads, lead, trace(namePatch(lead, cleanName), now, '去掉线索姓名前后顿号'), '去掉线索姓名前后顿号');
    }
  }

  for (const student of students) {
    const id = rowId(student);
    if (!active(student) || mergedStudentIds.has(id)) continue;
    const rawName = displayName(student);
    const cleanName = canonicalDirtyName(rawName);
    if (!hasEdgePunctuation(rawName) && cleanName === cleanEdgePunctuation(rawName)) continue;
    if (!cleanName) {
      addPut(puts, TABLES.students, student, trace({ ...namePatch(student, ''), status: 'voided', voidedAt: now, voidedBy: 'Codex', voidReason: '学员姓名只有分隔符' }, now, '作废只有分隔符的脏学员'), '作废只有分隔符的脏学员');
      mergedStudentIds.add(id);
      continue;
    }
    if (isObviousNoiseName(cleanName)) {
      addPut(puts, TABLES.students, student, trace({ ...namePatch(student, ''), status: 'voided', voidedAt: now, voidedBy: 'Codex', voidReason: '学员姓名是明显的群名或噪声名' }, now, '作废明显群名/噪声学员'), '作废明显群名/噪声学员');
      mergedStudentIds.add(id);
      continue;
    }
    const target = chooseTarget((studentIndex.get(identityKey(cleanName)) || []).filter(row => rowId(row) !== id));
    if (target) {
      mergeStudent({ puts, student, target, now, reason: '去掉姓名前后顿号后与已有学员重复，合并隐藏' });
      mergedStudentIds.add(id);
    } else {
      addPut(puts, TABLES.students, student, trace(namePatch(student, cleanName), now, '去掉学员姓名前后顿号'), '去掉学员姓名前后顿号');
    }
  }

  for (const row of studentTeachingSummaries) {
    const id = rowId(row);
    if (!id || id === STUDENT_TEACHING_SUMMARY_META_ID || cleanedSummaryIds.has(id)) continue;
    const rawName = displayName(row);
    const cleanName = canonicalDirtyName(rawName);
    if (!hasEdgePunctuation(rawName) && cleanName === cleanEdgePunctuation(rawName)) continue;
    dirtySummaryStudentIds.add(text(row.studentId || id));
    if (!cleanName || isObviousNoiseName(cleanName)) {
      addDelete(deletes, TABLES.studentTeachingSummaries, row, '删除教学摘要纯噪声姓名');
      cleanedSummaryIds.add(id);
      deletedSummaryIds.add(id);
      continue;
    }
    addPut(
      puts,
      TABLES.studentTeachingSummaries,
      row,
      trace(namePatch(row, cleanName), now, '清理教学摘要多人拼名'),
      '清理教学摘要多人拼名'
    );
    cleanedSummaryIds.add(id);
  }

  for (const [key, fields] of Object.entries(SOURCE_NAME_FIELDS)) {
    const table = TABLES[key];
    if (!table) continue;
    for (const row of data[key] || []) {
      const id = rowId(row);
      if (!id || !rowReferencesAny(row, dirtySummaryStudentIds)) continue;
      if (puts.some(item => item.table === table && item.id === id)) continue;
      const dirtyFields = fields.filter(field => Object.prototype.hasOwnProperty.call(row, field) && shouldCleanCompositeName(row[field]));
      if (!dirtyFields.length) continue;
      const allNoise = dirtyFields.every(field => isObviousNoiseName(cleanNameValue(row[field])) || !cleanNameValue(row[field]));
      const after = key === 'schedule' && allNoise
        ? sourceScheduleNoisePatch(row, dirtySummaryStudentIds, now)
        : sourceNamePatch(row, fields, now, '清理业务源头姓名字段，避免线索池摘要回流');
      addPut(puts, table, row, after, key === 'schedule' && allNoise ? '取消纯噪声排课源头' : '清理业务源头姓名字段，避免线索池摘要回流');
    }
  }

  const summaryPuts = puts.filter(item => item.table === TABLES.studentTeachingSummaries);
  const summaryDeletes = deletes.filter(item => item.table === TABLES.studentTeachingSummaries);
  if (summaryPuts.length || summaryDeletes.length) {
    const meta = studentTeachingSummaries.find(row => rowId(row) === STUDENT_TEACHING_SUMMARY_META_ID);
    if (meta) {
      const nextById = new Map(summaryPuts.map(item => [rowId(item.after), item.after]));
      const deletedIds = new Set(summaryDeletes.map(item => item.id));
      const finalRows = studentTeachingSummaries
        .filter(row => rowId(row) !== STUDENT_TEACHING_SUMMARY_META_ID)
        .filter(row => !deletedIds.has(rowId(row)))
        .map(row => nextById.get(rowId(row)) || row);
      addPut(
        puts,
        TABLES.studentTeachingSummaries,
        meta,
        trace({
          ...meta,
          status: 'ready',
          rowCount: finalRows.length,
          checksum: buildStudentTeachingSummaryChecksum(finalRows),
          completedAt: now
        }, now, '更新教学摘要校验'),
        '更新教学摘要校验'
      );
    }
  }

  return {
    summary: {
      putCount: puts.length,
      deleteCount: deletes.length,
      mergedLeadCount: mergedLeadIds.size,
      mergedStudentCount: mergedStudentIds.size,
      renamedLeadCount: puts.filter(item => item.table === TABLES.leads && text(item.after.status || 'active') !== 'merged').length,
      renamedStudentCount: puts.filter(item => item.table === TABLES.students && text(item.after.status || 'active') !== 'merged').length,
      cleanedSummaryCount: cleanedSummaryIds.size,
      deletedSummaryCount: deletedSummaryIds.size,
      referenceUpdateCount: 0
        + puts.filter(item => ![TABLES.leads, TABLES.students, TABLES.studentTeachingSummaries].includes(item.table)).length
    },
    puts,
    deletes
  };
}

async function run(argv = process.argv.slice(2)) {
  loadRuntimeEnv({ appEnv: 'production', entry: OPERATION_ID });
  const args = parseWriteFlags(argv);
  const reportPath = path.join(REPORT_DIR, `${OPERATION_ID}-${args.write ? 'write' : 'dry-run'}.json`);
  assertProductionWriteTrace({ operationId: OPERATION_ID, batchId: BATCH_ID, reportPath });
  const target = await assertProductionWriteTarget({ env: process.env });
  const client = createClientFromEnv();
  const now = new Date().toISOString();
  const data = {};
  const scanKeys = ['leads', 'students', 'purchases', 'entitlements', 'entitlementLedger', 'schedule', 'studentTeachingSummaries'];
  for (const key of scanKeys) {
    data[key] = await scanTable(client, TABLES[key]).catch(() => []);
  }
  const plan = buildPlan(data, now);
  const output = {
    ok: true,
    mode: args.write ? 'write' : 'dry-run',
    target,
    operationId: OPERATION_ID,
    batchId: BATCH_ID,
    generatedAt: now,
    reportPath,
    ...plan.summary,
    puts: plan.puts,
    deletes: plan.deletes
  };
  fs.mkdirSync(REPORT_DIR, { recursive: true });
  fs.writeFileSync(reportPath, `${JSON.stringify(output, null, 2)}\n`, 'utf8');
  if (args.write) {
    for (const item of plan.deletes) await deleteRow(client, item.table, item.id);
    for (const item of plan.puts) await putRow(client, item.table, item.after);
  }
  console.log(JSON.stringify({
    ok: output.ok,
    mode: output.mode,
    reportPath,
    putCount: output.putCount,
    deleteCount: output.deleteCount,
    mergedLeadCount: output.mergedLeadCount,
    mergedStudentCount: output.mergedStudentCount,
    renamedLeadCount: output.renamedLeadCount,
    renamedStudentCount: output.renamedStudentCount,
    cleanedSummaryCount: output.cleanedSummaryCount,
    deletedSummaryCount: output.deletedSummaryCount,
    referenceUpdateCount: output.referenceUpdateCount
  }, null, 2));
  return output;
}

if (require.main === module) {
  run().catch(error => {
    console.error(error && error.stack ? error.stack : String(error));
    process.exit(1);
  });
}

module.exports = {
  buildPlan,
  cleanEdgePunctuation,
  identityKey,
  OPERATION_ID,
  BATCH_ID
};
