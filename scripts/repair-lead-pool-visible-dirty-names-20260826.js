#!/usr/bin/env node

const fs = require('fs');
const path = require('path');
const { loadRuntimeEnv } = require('./lib/runtime-env');
const { createClientFromEnv, scanTable, putRow } = require('./lib/staging-data-store');
const { parseWriteFlags, assertProductionWriteTarget, assertProductionWriteTrace } = require('./lib/production-write-guard');

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
  schedule: 'ft_schedule'
};

const REFERENCE_TABLES = ['leadFollowups', 'purchases', 'entitlements', 'entitlementLedger', 'schedule'];

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

function identityKey(value) {
  return cleanEdgePunctuation(value)
    .toLowerCase()
    .replace(/\s+/g, '')
    .replace(/[·.。_\-\/|｜，,;；]/g, '');
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

function rewriteReferences(row, { sourceLeadIds, targetLeadId, sourceStudentIds, targetStudentId, now }) {
  const leadIds = new Set([...sourceLeadIds].map(text).filter(Boolean));
  const studentIds = new Set([...sourceStudentIds].map(text).filter(Boolean));
  let next = { ...row };
  let changed = false;

  ['leadId', 'sourceLeadId', 'fromLeadId', 'originalLeadId'].forEach(field => {
    if (targetLeadId && leadIds.has(text(next[field]))) {
      next[field] = targetLeadId;
      changed = true;
    }
  });

  ['studentId', 'sourceStudentId'].forEach(field => {
    if (targetStudentId && studentIds.has(text(next[field]))) {
      next[field] = targetStudentId;
      changed = true;
    }
  });

  ['studentIds', 'expectedStudentIds', 'absentStudentIds'].forEach(field => {
    if (!targetStudentId) return;
    const values = parseArray(next[field]);
    if (!values.length || !values.some(id => studentIds.has(id))) return;
    const replaced = [...new Set(values.map(id => studentIds.has(id) ? targetStudentId : id).filter(Boolean))];
    if (!sameJson(values, replaced)) {
      next[field] = Array.isArray(next[field]) ? replaced : JSON.stringify(replaced);
      changed = true;
    }
  });

  return changed ? trace(next, now, '合并线索池可见脏名字后的业务引用') : null;
}

function addPut(puts, table, before, after, reason) {
  if (!before || !after || sameJson(before, after)) return;
  puts.push({ table, id: rowId(after), reason, before, after });
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
  addPut(puts, TABLES.leads, lead, trace({
    ...lead,
    status: 'merged',
    mergedIntoLeadId: rowId(target),
    mergedIntoLeadName: displayName(target),
    mergedAt: now,
    mergedBy: 'Codex'
  }, now, reason), reason);
}

function mergeStudent({ puts, student, target, now, reason }) {
  if (!student || !target || rowId(student) === rowId(target)) return;
  addPut(puts, TABLES.students, student, trace({
    ...student,
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
  const leadIndex = buildNameIndex(leads.filter(active));
  const studentIndex = buildNameIndex(students.filter(active));
  const puts = [];
  const mergedLeadIds = new Set();
  const mergedStudentIds = new Set();
  const renamedLeadIds = new Set();
  const renamedStudentIds = new Set();

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
    if (!hasEdgePunctuation(rawName)) continue;
    const cleanName = cleanEdgePunctuation(rawName);
    if (!cleanName) {
      addPut(puts, TABLES.leads, lead, trace({ ...lead, status: 'voided', voidedAt: now, voidedBy: 'Codex', voidReason: '线索姓名只有分隔符' }, now, '作废只有分隔符的脏线索'), '作废只有分隔符的脏线索');
      mergedLeadIds.add(id);
      continue;
    }
    const target = chooseTarget((leadIndex.get(identityKey(cleanName)) || []).filter(row => rowId(row) !== id));
    if (target) {
      mergeLead({ puts, lead, target, now, reason: '去掉姓名前后顿号后与已有线索重复，合并隐藏' });
      mergedLeadIds.add(id);
    } else {
      addPut(puts, TABLES.leads, lead, trace(namePatch(lead, cleanName), now, '去掉线索姓名前后顿号'), '去掉线索姓名前后顿号');
      renamedLeadIds.add(id);
    }
  }

  for (const student of students) {
    const id = rowId(student);
    if (!active(student) || mergedStudentIds.has(id)) continue;
    const rawName = displayName(student);
    if (!hasEdgePunctuation(rawName)) continue;
    const cleanName = cleanEdgePunctuation(rawName);
    if (!cleanName) {
      addPut(puts, TABLES.students, student, trace({ ...student, status: 'voided', voidedAt: now, voidedBy: 'Codex', voidReason: '学员姓名只有分隔符' }, now, '作废只有分隔符的脏学员'), '作废只有分隔符的脏学员');
      mergedStudentIds.add(id);
      continue;
    }
    const target = chooseTarget((studentIndex.get(identityKey(cleanName)) || []).filter(row => rowId(row) !== id));
    if (target) {
      mergeStudent({ puts, student, target, now, reason: '去掉姓名前后顿号后与已有学员重复，合并隐藏' });
      mergedStudentIds.add(id);
    } else {
      addPut(puts, TABLES.students, student, trace(namePatch(student, cleanName), now, '去掉学员姓名前后顿号'), '去掉学员姓名前后顿号');
      renamedStudentIds.add(id);
    }
  }

  const targetLeadByMergedId = new Map();
  const targetStudentByMergedId = new Map();
  puts.forEach(item => {
    if (item.table === TABLES.leads && text(item.after.status) === 'merged') targetLeadByMergedId.set(text(item.before.id), text(item.after.mergedIntoLeadId));
    if (item.table === TABLES.students && text(item.after.status) === 'merged') targetStudentByMergedId.set(text(item.before.id), text(item.after.mergedIntoStudentId));
  });

  for (const tableKey of REFERENCE_TABLES) {
    for (const row of data[tableKey] || []) {
      let after = null;
      for (const [sourceLeadId, targetLeadId] of targetLeadByMergedId.entries()) {
        after = rewriteReferences(after || row, {
          sourceLeadIds: new Set([sourceLeadId]),
          targetLeadId,
          sourceStudentIds: new Set(),
          targetStudentId: '',
          now
        }) || after;
      }
      for (const [sourceStudentId, targetStudentId] of targetStudentByMergedId.entries()) {
        after = rewriteReferences(after || row, {
          sourceLeadIds: new Set(),
          targetLeadId: '',
          sourceStudentIds: new Set([sourceStudentId]),
          targetStudentId,
          now
        }) || after;
      }
      if (after) addPut(puts, TABLES[tableKey], row, after, '合并线索池可见脏名字后的业务引用');
    }
  }

  return {
    summary: {
      putCount: puts.length,
      mergedLeadCount: mergedLeadIds.size,
      mergedStudentCount: mergedStudentIds.size,
      renamedLeadCount: renamedLeadIds.size,
      renamedStudentCount: renamedStudentIds.size,
      referenceUpdateCount: puts.filter(item => ![TABLES.leads, TABLES.students].includes(item.table)).length
    },
    puts
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
  const scanKeys = ['leads', 'students', ...REFERENCE_TABLES];
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
    puts: plan.puts
  };
  fs.mkdirSync(REPORT_DIR, { recursive: true });
  fs.writeFileSync(reportPath, `${JSON.stringify(output, null, 2)}\n`, 'utf8');
  if (args.write) {
    for (const item of plan.puts) await putRow(client, item.table, item.after);
  }
  console.log(JSON.stringify({
    ok: output.ok,
    mode: output.mode,
    reportPath,
    putCount: output.putCount,
    mergedLeadCount: output.mergedLeadCount,
    mergedStudentCount: output.mergedStudentCount,
    renamedLeadCount: output.renamedLeadCount,
    renamedStudentCount: output.renamedStudentCount,
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
