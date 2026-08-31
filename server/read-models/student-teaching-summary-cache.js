const { buildCustomerLifecycleRows } = require('./customer-lifecycle.js');
const { buildStudentTeachingSummaryRows } = require('./platform-metrics.js');
const crypto = require('crypto');

const STUDENT_TEACHING_SUMMARY_META_ID = '__student_teaching_summary_meta__';
const STUDENT_TEACHING_SUMMARY_READY = 'ready';
const STUDENT_TEACHING_SUMMARY_PENDING = 'pending';
const STUDENT_TEACHING_SUMMARY_REFRESHING = 'refreshing';
const STUDENT_TEACHING_SUMMARY_FAILED = 'failed';
const STUDENT_TEACHING_SUMMARY_VERSION_PREFIX = '__student_teaching_summary_version__:';

function parseArr(v) {
  if (Array.isArray(v)) return v;
  if (typeof v === 'string' && v) {
    try { return JSON.parse(v); } catch { return []; }
  }
  return [];
}

function uniqueStudentIds(values = []) {
  return [...new Set(values.map(id => String(id || '').trim()).filter(Boolean))];
}

function isStudentTeachingSummaryMetaRow(row = {}) {
  return String(row?.id || '').trim() === STUDENT_TEACHING_SUMMARY_META_ID;
}

function isVersionedStudentTeachingSummaryRow(row = {}) {
  return String(row?.id || '').trim().startsWith(STUDENT_TEACHING_SUMMARY_VERSION_PREFIX);
}

function studentTeachingSummaryLogicalRow(row = {}) {
  if (!isVersionedStudentTeachingSummaryRow(row)) return row;
  const next = { ...row };
  next.id = String(row.publishedRowId || row.studentId || row.id || '').trim();
  delete next.publishedRowId;
  delete next.publishVersion;
  return next;
}

function filterStudentTeachingSummaryDataRows(rows = []) {
  return (Array.isArray(rows) ? rows : [])
    .filter(row => row && !isStudentTeachingSummaryMetaRow(row) && !isVersionedStudentTeachingSummaryRow(row));
}

function studentTeachingSummaryMetaRow(rows = []) {
  return (Array.isArray(rows) ? rows : []).find(isStudentTeachingSummaryMetaRow) || null;
}

function filterStudentTeachingSummaryPublishedRows(rows = [], meta = null) {
  const activeVersion = String(meta?.activeVersion || '').trim();
  if (!activeVersion) return filterStudentTeachingSummaryDataRows(rows);
  return (Array.isArray(rows) ? rows : [])
    .filter(row => row && !isStudentTeachingSummaryMetaRow(row))
    .filter(row => String(row.publishVersion || '').trim() === activeVersion)
    .map(studentTeachingSummaryLogicalRow);
}

function buildVersionedStudentTeachingSummaryRow(row = {}, publishVersion = '') {
  const version = String(publishVersion || '').trim();
  const logicalId = String(row.id || row.studentId || '').trim();
  if (!version || !logicalId) return row;
  return {
    ...row,
    id: `${STUDENT_TEACHING_SUMMARY_VERSION_PREFIX}${version}:${logicalId}`,
    publishedRowId: logicalId,
    publishVersion: version
  };
}

function studentTeachingSummaryRowsToDeleteAfterPublish(rows = [], activeVersion = '') {
  const version = String(activeVersion || '').trim();
  return (Array.isArray(rows) ? rows : []).filter(row => {
    if (!row || isStudentTeachingSummaryMetaRow(row)) return false;
    if (!isVersionedStudentTeachingSummaryRow(row)) return true;
    return String(row.publishVersion || '').trim() !== version;
  });
}

function normalizeGeneration(value) {
  const n = Number(value);
  return Number.isFinite(n) ? n : 0;
}

function stableValue(value) {
  if (Array.isArray(value)) return value.map(stableValue);
  if (value && typeof value === 'object') {
    return Object.keys(value).sort().reduce((result, key) => {
      result[key] = stableValue(value[key]);
      return result;
    }, {});
  }
  return value;
}

function buildStudentTeachingSummaryChecksum(rows = []) {
  const normalizedRows = (Array.isArray(rows) ? rows : [])
    .filter(row => row && !isStudentTeachingSummaryMetaRow(row))
    .map(studentTeachingSummaryLogicalRow)
    .slice()
    .sort((a, b) => String(a?.id || '').localeCompare(String(b?.id || '')))
    .map(stableValue);
  return crypto.createHash('sha256').update(JSON.stringify(normalizedRows)).digest('hex');
}

function buildStudentTeachingSummaryMetaRow({
  status,
  generation = Date.now(),
  rowCount,
  sourceTable = '',
  sourceOp = '',
  sourceId = '',
  batchId = '',
  activeVersion = '',
  sourceSnapshotAt = '',
  completedAt = '',
  checksum = '',
  error = '',
  updatedAt = new Date().toISOString()
} = {}) {
  return {
    id: STUDENT_TEACHING_SUMMARY_META_ID,
    kind: 'student-teaching-summary-meta',
    status: String(status || STUDENT_TEACHING_SUMMARY_PENDING),
    generation: normalizeGeneration(generation) || Date.now(),
    rowCount: Number.isFinite(Number(rowCount)) ? Number(rowCount) : '',
    sourceTable: String(sourceTable || ''),
    sourceOp: String(sourceOp || ''),
    sourceId: String(sourceId || ''),
    batchId: String(batchId || ''),
    activeVersion: String(activeVersion || ''),
    sourceSnapshotAt: String(sourceSnapshotAt || ''),
    completedAt: String(completedAt || ''),
    checksum: String(checksum || ''),
    error: String(error || '').slice(0, 500),
    updatedAt
  };
}

function studentTeachingSummaryNotReadyError(meta = null, reason = '') {
  const status = String(meta?.status || 'missing');
  const err = new Error(`教学学员统一摘要未就绪，页面拒绝展示旧数据：${reason || status}`);
  err.code = 'STUDENT_TEACHING_SUMMARY_NOT_READY';
  err.statusCode = 503;
  err.meta = meta || null;
  return err;
}

function requireReadyStudentTeachingSummaryRows(rows = []) {
  const meta = studentTeachingSummaryMetaRow(rows);
  if (!meta) throw studentTeachingSummaryNotReadyError(null, 'missing-meta');
  const dataRows = filterStudentTeachingSummaryPublishedRows(rows, meta);
  const status = String(meta.status || '');
  if (status !== STUDENT_TEACHING_SUMMARY_READY) throw studentTeachingSummaryNotReadyError(meta, status || 'unknown');
  const expectedCount = Number(meta.rowCount);
  if (!Number.isSafeInteger(expectedCount) || expectedCount < 0) {
    throw studentTeachingSummaryNotReadyError(meta, 'invalid-row-count');
  }
  if (expectedCount !== dataRows.length) {
    throw studentTeachingSummaryNotReadyError(meta, `row-count-mismatch:${dataRows.length}/${expectedCount}`);
  }
  const actualChecksum = buildStudentTeachingSummaryChecksum(dataRows);
  if (!String(meta.checksum || '').trim() || meta.checksum !== actualChecksum) {
    throw studentTeachingSummaryNotReadyError(meta, 'checksum-mismatch');
  }
  if (!String(meta.batchId || '').trim() || !String(meta.sourceSnapshotAt || '').trim() || !String(meta.completedAt || '').trim()) {
    console.warn('[student-teaching-summary] accepting legacy ready meta without publish fields', {
      rowCount: expectedCount,
      batchId: String(meta.batchId || ''),
      sourceSnapshotAt: String(meta.sourceSnapshotAt || ''),
      completedAt: String(meta.completedAt || '')
    });
  }
  return dataRows;
}

function wait(ms) {
  return new Promise(resolve => setTimeout(resolve, ms));
}

async function readReadyStudentTeachingSummaryRows({
  tableName,
  getCachedScan,
  timeoutMs = 900,
  intervalMs = 150
} = {}) {
  if (!tableName || typeof getCachedScan !== 'function') {
    throw studentTeachingSummaryNotReadyError(null, 'not-configured');
  }
  const startedAt = Date.now();
  let lastError = null;
  for (;;) {
    const rows = await getCachedScan(tableName, { fresh: true });
    try {
      return requireReadyStudentTeachingSummaryRows(rows);
    } catch (err) {
      lastError = err;
      if (Date.now() - startedAt >= timeoutMs) throw lastError;
      await wait(intervalMs);
    }
  }
}

function createStudentTeachingSummaryCache({
  tables = {},
  getCachedScan,
  mkTable,
  put,
  del,
  logger = console
} = {}) {
  const {
    T_LEADS,
    T_STUDENTS,
    T_PURCHASES,
    T_ENTITLEMENTS,
    T_ENTITLEMENT_LEDGER,
    T_SCHEDULE,
    T_FEEDBACKS,
    T_MEMBERSHIP_BENEFIT_LEDGER,
    T_STUDENT_TEACHING_SUMMARY
  } = tables;
  const sourceTables = new Set([T_LEADS, T_STUDENTS, T_PURCHASES, T_ENTITLEMENTS, T_ENTITLEMENT_LEDGER, T_SCHEDULE, T_FEEDBACKS, T_MEMBERSHIP_BENEFIT_LEDGER].filter(Boolean));
  let pendingIds = new Set();
  let pendingFullRefresh = false;
  let pendingTimer = null;
  let metaGeneration = 0;

  async function writeMeta(status, meta = {}) {
    if (!T_STUDENT_TEACHING_SUMMARY || typeof put !== 'function') return null;
    metaGeneration = Math.max(metaGeneration + 1, normalizeGeneration(meta.generation) || 0, Date.now());
    const row = buildStudentTeachingSummaryMetaRow({
      ...meta,
      status,
      generation: metaGeneration,
      updatedAt: new Date().toISOString()
    });
    await put(T_STUDENT_TEACHING_SUMMARY, STUDENT_TEACHING_SUMMARY_META_ID, row);
    return row;
  }

  function studentIdsFromWrite(table, meta = {}) {
    const row = meta?.attrs || {};
    if (table === T_STUDENTS) return uniqueStudentIds([row.id || meta.id]);
    if (table === T_SCHEDULE) return uniqueStudentIds([row.studentId, ...parseArr(row.studentIds)]);
    if ([T_PURCHASES, T_ENTITLEMENTS, T_ENTITLEMENT_LEDGER, T_FEEDBACKS, T_MEMBERSHIP_BENEFIT_LEDGER].includes(table)) {
      return uniqueStudentIds([row.studentId, ...parseArr(row.studentIds)]);
    }
    if (table === T_LEADS) return uniqueStudentIds([row.studentId]);
    return [];
  }

  async function queueStudentTeachingSummaryRefresh(table, meta = {}) {
    if (!sourceTables.has(table)) return;
    const ids = studentIdsFromWrite(table, meta);
    if (ids.length) ids.forEach(id => pendingIds.add(id));
    else pendingFullRefresh = true;
    if (pendingTimer) clearTimeout(pendingTimer);
    pendingTimer = setTimeout(() => flushStudentTeachingSummaryRefresh(), 800);
    if (typeof pendingTimer.unref === 'function') pendingTimer.unref();
  }

  async function refreshStudentTeachingSummaryRows(studentIds = []) {
    if (!T_STUDENT_TEACHING_SUMMARY || !getCachedScan || !mkTable || !put) return [];
    await mkTable(T_STUDENT_TEACHING_SUMMARY).catch(() => null);
    const sourceSnapshotAt = new Date().toISOString();
    const batchId = `student-teaching-summary-${Date.now()}`;
    const existingSummaryRows = await getCachedScan(T_STUDENT_TEACHING_SUMMARY, { fresh: true }).catch(() => []);
    const hasReadyMeta = String(studentTeachingSummaryMetaRow(existingSummaryRows)?.status || '') === STUDENT_TEACHING_SUMMARY_READY;
    try {
      const [leads, students, purchases, entitlements, entitlementLedger, schedule, membershipBenefitLedger, feedbacks] = await Promise.all([
        T_LEADS ? getCachedScan(T_LEADS, { fresh: true }) : Promise.resolve([]),
        getCachedScan(T_STUDENTS, { fresh: true }),
        getCachedScan(T_PURCHASES, { fresh: true }),
        getCachedScan(T_ENTITLEMENTS, { fresh: true }),
        getCachedScan(T_ENTITLEMENT_LEDGER, { fresh: true }),
        T_SCHEDULE ? getCachedScan(T_SCHEDULE, { fresh: true }) : Promise.resolve([]),
        T_MEMBERSHIP_BENEFIT_LEDGER ? getCachedScan(T_MEMBERSHIP_BENEFIT_LEDGER, { fresh: true }) : Promise.resolve([]),
        T_FEEDBACKS ? getCachedScan(T_FEEDBACKS, { fresh: true }) : Promise.resolve([])
      ]);
      const data = { leads, students, purchases, entitlements, entitlementLedger, schedule, membershipBenefitLedger, feedbacks };
      const customerLifecycleRows = buildCustomerLifecycleRows(data);
      const rows = buildStudentTeachingSummaryRows(customerLifecycleRows, data);
      for (const row of rows) {
        const versioned = buildVersionedStudentTeachingSummaryRow(row, batchId);
        await put(T_STUDENT_TEACHING_SUMMARY, versioned.id, versioned);
      }
      const publishedRows = filterStudentTeachingSummaryPublishedRows(
        await getCachedScan(T_STUDENT_TEACHING_SUMMARY, { fresh: true }),
        { activeVersion: batchId }
      );
      await writeMeta(STUDENT_TEACHING_SUMMARY_READY, {
        batchId,
        activeVersion: batchId,
        sourceSnapshotAt,
        completedAt: new Date().toISOString(),
        rowCount: publishedRows.length,
        checksum: buildStudentTeachingSummaryChecksum(publishedRows)
      });
      if (del) {
        const existing = await getCachedScan(T_STUDENT_TEACHING_SUMMARY, { fresh: true });
        for (const row of studentTeachingSummaryRowsToDeleteAfterPublish(existing, batchId)) {
          if (row?.id) await del(T_STUDENT_TEACHING_SUMMARY, row.id);
        }
      }
      return publishedRows;
    } catch (err) {
      if (!hasReadyMeta) {
        await writeMeta(STUDENT_TEACHING_SUMMARY_FAILED, { batchId, sourceSnapshotAt, error: err?.message || String(err) }).catch(metaErr => {
          logger.error('[student-teaching-summary] mark failed failed', metaErr);
        });
      }
      throw err;
    }
  }

  async function flushStudentTeachingSummaryRefresh() {
    const ids = [...pendingIds];
    const full = pendingFullRefresh;
    pendingIds = new Set();
    pendingFullRefresh = false;
    pendingTimer = null;
    try {
      await refreshStudentTeachingSummaryRows(full ? [] : ids);
    } catch (err) {
      logger.error('[student-teaching-summary] refresh failed', err);
    }
  }

  return {
    queueStudentTeachingSummaryRefresh,
    refreshStudentTeachingSummaryRows,
    flushStudentTeachingSummaryRefresh,
    sourceTables
  };
}

module.exports = {
  createStudentTeachingSummaryCache,
  STUDENT_TEACHING_SUMMARY_META_ID,
  STUDENT_TEACHING_SUMMARY_READY,
  STUDENT_TEACHING_SUMMARY_PENDING,
  STUDENT_TEACHING_SUMMARY_REFRESHING,
  STUDENT_TEACHING_SUMMARY_FAILED,
  buildStudentTeachingSummaryMetaRow,
  isStudentTeachingSummaryMetaRow,
  filterStudentTeachingSummaryDataRows,
  filterStudentTeachingSummaryPublishedRows,
  buildVersionedStudentTeachingSummaryRow,
  studentTeachingSummaryRowsToDeleteAfterPublish,
  buildStudentTeachingSummaryChecksum,
  requireReadyStudentTeachingSummaryRows,
  readReadyStudentTeachingSummaryRows
};
