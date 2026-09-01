#!/usr/bin/env node
const TableStore = require('tablestore');
const {
  createClientFromEnv
} = require('./lib/staging-data-store.js');
const {
  parseWriteFlags,
  assertExplicitWrite,
  assertProductionWriteTarget
} = require('./lib/production-write-guard.js');
const {
  STUDENT_TEACHING_SUMMARY_META_ID,
  STUDENT_TEACHING_SUMMARY_READY,
  isStudentTeachingSummaryMetaRow,
  requireReadyStudentTeachingSummaryRows,
  studentTeachingSummaryRowsToDeleteAfterPublish
} = require('../server/read-models/student-teaching-summary-cache.js');

const TABLE = 'ft_student_teaching_summary';
const PRODUCTION_ENDPOINT = 'https://flowtennis-ue.us-east-1.ots.aliyuncs.com';
const PRODUCTION_INSTANCE = 'flowtennis-ue';
const SCAN_LIMIT = 20;
const PAGE_TIMEOUT_MS = 30000;
const DELETE_TIMEOUT_MS = 15000;

function assertProductionTarget(env = process.env) {
  const endpoint = String(env.TS_ENDPOINT || '').trim();
  const instance = String(env.TS_INSTANCE || env.TARGET_TS_INSTANCE || '').trim();
  if (endpoint !== PRODUCTION_ENDPOINT || instance !== PRODUCTION_INSTANCE) {
    throw new Error(`写入目标不是生产实例 ${PRODUCTION_INSTANCE}，已停止`);
  }
  return { endpoint, instance };
}

function studentTeachingSummaryMetaRow(rows = []) {
  return (Array.isArray(rows) ? rows : []).find(isStudentTeachingSummaryMetaRow) || null;
}

function decodeRow(row) {
  if (!row || !row.primaryKey) return null;
  const record = { id: row.primaryKey[0]?.value };
  (row.attributes || []).forEach(attribute => {
    try {
      record[attribute.columnName] = JSON.parse(attribute.columnValue);
    } catch {
      record[attribute.columnName] = attribute.columnValue;
    }
  });
  return record;
}

function normalizePrimaryKey(primaryKey) {
  return (primaryKey || []).map(item => {
    if (item && Object.prototype.hasOwnProperty.call(item, 'name')) return { [item.name]: item.value };
    return item;
  });
}

function getRangePage(client, startPrimaryKey) {
  return new Promise((resolve, reject) => {
    const timer = setTimeout(() => reject(new Error(`扫描摘要表单页超时 ${PAGE_TIMEOUT_MS}ms`)), PAGE_TIMEOUT_MS);
    client.getRange({
      tableName: TABLE,
      direction: TableStore.Direction.FORWARD,
      inclusiveStartPrimaryKey: startPrimaryKey ? normalizePrimaryKey(startPrimaryKey) : [{ id: TableStore.INF_MIN }],
      exclusiveEndPrimaryKey: [{ id: TableStore.INF_MAX }],
      maxVersions: 1,
      limit: SCAN_LIMIT
    }, (err, data) => {
      clearTimeout(timer);
      if (err) return reject(err);
      resolve(data || {});
    });
  });
}

function deleteSummaryRow(client, id) {
  return new Promise((resolve, reject) => {
    const timer = setTimeout(() => reject(new Error(`删除摘要行超时 ${DELETE_TIMEOUT_MS}ms: ${id}`)), DELETE_TIMEOUT_MS);
    client.deleteRow({
      tableName: TABLE,
      condition: new TableStore.Condition(TableStore.RowExistenceExpectation.IGNORE, null),
      primaryKey: [{ id: String(id) }]
    }, (err, data) => {
      clearTimeout(timer);
      if (err) return reject(err);
      resolve(data);
    });
  });
}

async function scanSummaryRows(client, logger = console) {
  const rows = [];
  let startPrimaryKey = null;
  let page = 0;
  const seenStarts = new Set();
  for (;;) {
    const startKey = JSON.stringify(startPrimaryKey || []);
    if (seenStarts.has(startKey)) throw new Error('扫描摘要表分页游标重复，已停止');
    seenStarts.add(startKey);
    const data = await getRangePage(client, startPrimaryKey);
    page += 1;
    (data.rows || []).forEach(row => {
      const record = decodeRow(row);
      if (record) rows.push(record);
    });
    logger.error(`[summary-cleanup] scanned page ${page}, total ${rows.length}`);
    if (!data.nextStartPrimaryKey) return rows;
    startPrimaryKey = data.nextStartPrimaryKey;
  }
}

function buildCleanupPlan(rows = []) {
  const meta = studentTeachingSummaryMetaRow(rows);
  if (!meta) throw new Error('摘要 meta 缺失，不能清场');
  if (String(meta.status || '') !== STUDENT_TEACHING_SUMMARY_READY) {
    throw new Error(`摘要状态不是 ready，不能清场：${String(meta.status || '') || 'missing'}`);
  }
  const activeVersion = String(meta.activeVersion || '').trim();
  if (!activeVersion) throw new Error('摘要 meta 缺少 activeVersion，不能清场');
  requireReadyStudentTeachingSummaryRows(rows);
  const staleRows = studentTeachingSummaryRowsToDeleteAfterPublish(rows, activeVersion);
  const staleIds = staleRows
    .map(row => String(row?.id || '').trim())
    .filter(id => id && id !== STUDENT_TEACHING_SUMMARY_META_ID);
  return {
    table: TABLE,
    activeVersion,
    beforeTotal: rows.length,
    keepCount: rows.length - staleIds.length,
    deleteCount: staleIds.length,
    deleteIds: staleIds
  };
}

function verifyCleanupResult(rows = []) {
  const meta = studentTeachingSummaryMetaRow(rows);
  const activeVersion = String(meta?.activeVersion || '').trim();
  const readyRows = requireReadyStudentTeachingSummaryRows(rows);
  const remainingStaleIds = activeVersion
    ? studentTeachingSummaryRowsToDeleteAfterPublish(rows, activeVersion).map(row => String(row?.id || '').trim()).filter(Boolean)
    : [];
  return {
    activeVersion,
    readyCount: readyRows.length,
    remainingStaleIds
  };
}

async function run(argv = process.argv.slice(2), env = process.env) {
  const args = parseWriteFlags(argv);
  const write = args.write;
  if (write) {
    assertExplicitWrite({ write, scriptName: '摘要旧版本清场' });
    await assertProductionWriteTarget({ env });
  }
  const client = createClientFromEnv(env);
  const beforeRows = await scanSummaryRows(client);
  const plan = buildCleanupPlan(beforeRows);
  console.log(JSON.stringify({
    mode: write ? 'write' : 'dry-run',
    table: plan.table,
    activeVersion: plan.activeVersion,
    beforeTotal: plan.beforeTotal,
    keepCount: plan.keepCount,
    deleteCount: plan.deleteCount
  }, null, 2));
  if (!write) return plan;
  for (let i = 0; i < plan.deleteIds.length; i += 1) {
    await deleteSummaryRow(client, plan.deleteIds[i]);
    if ((i + 1) % 25 === 0 || i + 1 === plan.deleteIds.length) {
      console.error(`[summary-cleanup] deleted ${i + 1}/${plan.deleteIds.length}`);
    }
  }
  const afterRows = await scanSummaryRows(client);
  const verification = verifyCleanupResult(afterRows);
  if (verification.remainingStaleIds.length) {
    throw new Error(`仍有旧摘要残留：${verification.remainingStaleIds.length}`);
  }
  console.log(JSON.stringify({
    success: true,
    table: TABLE,
    activeVersion: verification.activeVersion,
    readyCount: verification.readyCount,
    remainingStaleCount: verification.remainingStaleIds.length
  }, null, 2));
  return { plan, verification };
}

if (require.main === module) {
  run().catch(error => {
    console.error(error && error.stack ? error.stack : String(error));
    process.exit(1);
  });
}

module.exports = {
  buildCleanupPlan,
  verifyCleanupResult,
  assertProductionTarget,
  scanSummaryRows,
  deleteSummaryRow,
  run
};
