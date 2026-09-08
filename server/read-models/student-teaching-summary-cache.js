const { buildCustomerLifecycleRows } = require('./customer-lifecycle.js');
const { buildStudentTeachingSummaryRows } = require('./platform-metrics.js');
const crypto = require('crypto');
const zlib = require('zlib');

const STUDENT_TEACHING_SUMMARY_META_ID = '__student_teaching_summary_meta__';
const STUDENT_TEACHING_SUMMARY_READY = 'ready';
const STUDENT_TEACHING_SUMMARY_PENDING = 'pending';
const STUDENT_TEACHING_SUMMARY_REFRESHING = 'refreshing';
const STUDENT_TEACHING_SUMMARY_FAILED = 'failed';
const STUDENT_TEACHING_SUMMARY_VERSION_PREFIX = '__student_teaching_summary_version__:';
const STUDENT_TEACHING_SUMMARY_BUNDLE_PREFIX = '__student_teaching_summary_bundle__:';
const STUDENT_TEACHING_SUMMARY_LIST_BUNDLE_PREFIX = '__student_teaching_summary_list_bundle__:';
const STUDENT_TEACHING_SUMMARY_LIST_BUNDLE_SCHEMA_VERSION = 'trial-facts-v2';
const READY_STUDENT_TEACHING_SUMMARY_CACHE_TTL_MS = 30000;
const READY_STUDENT_TEACHING_SUMMARY_READ_TIMEOUT_MS = Math.max(
  1200,
  parseInt(process.env.STUDENT_TEACHING_SUMMARY_READ_TIMEOUT_MS || '2500', 10) || 2500
);
const readyStudentTeachingSummaryRowsCache = new Map();
const studentTeachingSummaryListBundleRepairPromises = new Map();

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

function buildStudentTeachingSummaryBundleId(publishVersion = '') {
  const version = String(publishVersion || '').trim();
  return version ? `${STUDENT_TEACHING_SUMMARY_BUNDLE_PREFIX}${version}` : '';
}

function buildStudentTeachingSummaryListBundleId(publishVersion = '') {
  const version = String(publishVersion || '').trim();
  return version ? `${STUDENT_TEACHING_SUMMARY_LIST_BUNDLE_PREFIX}${version}` : '';
}

function isStudentTeachingSummaryBundleRow(row = {}) {
  return String(row?.id || '').trim().startsWith(STUDENT_TEACHING_SUMMARY_BUNDLE_PREFIX);
}

function isStudentTeachingSummaryListBundleRow(row = {}) {
  return String(row?.id || '').trim().startsWith(STUDENT_TEACHING_SUMMARY_LIST_BUNDLE_PREFIX);
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
    .filter(row => row && !isStudentTeachingSummaryMetaRow(row) && !isVersionedStudentTeachingSummaryRow(row) && !isStudentTeachingSummaryBundleRow(row) && !isStudentTeachingSummaryListBundleRow(row));
}

function studentTeachingSummaryMetaRow(rows = []) {
  return (Array.isArray(rows) ? rows : []).find(isStudentTeachingSummaryMetaRow) || null;
}

function isReadyStudentTeachingSummaryMeta(meta = null) {
  return String(meta?.status || '') === STUDENT_TEACHING_SUMMARY_READY;
}

function filterStudentTeachingSummaryPublishedRows(rows = [], meta = null) {
  const activeVersion = String(meta?.activeVersion || '').trim();
  if (!activeVersion) return filterStudentTeachingSummaryDataRows(rows);
  const sourceRows = Array.isArray(rows) ? rows : [];
  const bundle = sourceRows.find(row => String(row?.id || '') === buildStudentTeachingSummaryBundleId(activeVersion));
  const bundleRows = studentTeachingSummaryBundleLogicalRows(bundle);
  if (bundleRows.length) return bundleRows;
  const versionedRows = sourceRows
    .filter(row => row && !isStudentTeachingSummaryMetaRow(row))
    .filter(row => String(row.publishVersion || '').trim() === activeVersion)
    .filter(row => !isStudentTeachingSummaryBundleRow(row))
    .map(studentTeachingSummaryLogicalRow);
  if (versionedRows.length) return versionedRows;
  return filterStudentTeachingSummaryDataRows(sourceRows);
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

function buildStudentTeachingSummaryBundleRow(rows = [], publishVersion = '') {
  const version = String(publishVersion || '').trim();
  const id = buildStudentTeachingSummaryBundleId(version);
  const logicalRows = cloneStudentTeachingSummaryRows((Array.isArray(rows) ? rows : []).map(studentTeachingSummaryLogicalRow));
  const rowsJson = JSON.stringify(logicalRows);
  return {
    id,
    kind: 'student-teaching-summary-bundle',
    publishVersion: version,
    rowCount: logicalRows.length,
    checksum: buildStudentTeachingSummaryChecksum(logicalRows),
    encoding: 'gzip-base64',
    rowsGzipBase64: zlib.gzipSync(rowsJson).toString('base64'),
    uncompressedBytes: Buffer.byteLength(rowsJson, 'utf8')
  };
}

function studentTeachingSummaryListText(value) {
  return String(value || '').trim();
}

function studentTeachingSummaryListBool(value) {
  if (value === true || value === false) return value;
  const raw = studentTeachingSummaryListText(value).toLowerCase();
  if (raw === 'true') return true;
  if (raw === 'false') return false;
  return undefined;
}

function studentTeachingSummaryListLabel(item = {}) {
  return studentTeachingSummaryListText([
    item?.courseType,
    item?.standardCourseType,
    item?.packageName,
    item?.productName,
    item?.courseName,
    item?.className
  ].filter(Boolean).join(' '));
}

function studentTeachingSummaryListItemIsTrial(item = {}) {
  return /体验/.test(studentTeachingSummaryListLabel(item));
}

function studentTeachingSummaryListItemIsFormalCourse(item = {}) {
  const label = studentTeachingSummaryListLabel(item);
  return !/体验|陪打/.test(label) && /私教|小班|课包|正式|成人|青少年|网球/.test(label);
}

function studentTeachingSummaryListHasTrialLesson(row = {}) {
  return parseArr(row.detailLessonRecordRows).some(studentTeachingSummaryListItemIsTrial);
}

function studentTeachingSummaryListHasConsumedTrialPackage(row = {}) {
  return [...parseArr(row.detailPackageOrderRows), ...parseArr(row.packageListRows)].some(item => {
    if (!studentTeachingSummaryListItemIsTrial(item)) return false;
    const total = Number(item?.totalLessons) || 0;
    const used = Number(item?.usedLessons) || 0;
    const remaining = Number(item?.remainingLessons);
    return used > 0
      || (total > 0 && Number.isFinite(remaining) && remaining <= 0)
      || /已用完|已核销|已消课/.test(studentTeachingSummaryListText(item?.statusText || item?.status));
  });
}

function studentTeachingSummaryListHasTrialAttended(row = {}) {
  if (studentTeachingSummaryListHasTrialLesson(row) || studentTeachingSummaryListHasConsumedTrialPackage(row)) return true;
  return studentTeachingSummaryListBool(row.hasTrialAttended) === true;
}

function studentTeachingSummaryListHasFormalAttended(row = {}) {
  if (studentTeachingSummaryListBool(row.hasFormalAttended) === true) return true;
  return !!studentTeachingSummaryListText(row.lastFormalLessonAt || row.detailRecentLessonDate);
}

function studentTeachingSummaryListHasFormalCourseFact(row = {}) {
  if (studentTeachingSummaryListHasFormalAttended(row)) return true;
  if (studentTeachingSummaryListBool(row.hasCourseConversion) === true) return true;
  if ((Number(row.coursePurchaseCount) || 0) > 0) return true;
  if (studentTeachingSummaryListText(row.studentStage) === 'formal') return true;
  if (studentTeachingSummaryListText(row.packagePurchaseDate || row.courseFirstPurchaseAt || row.conversionAt)) return true;
  if ((Number(row.cumulativeCoursePaidAmount) || 0) > 0) return true;
  if ((Number(row.packageBalanceTotal) || 0) > 0) return true;
  return [...parseArr(row.detailPackageOrderRows), ...parseArr(row.packageListRows)]
    .some(item => studentTeachingSummaryListItemIsFormalCourse(item) && (
      Number(item?.actualAmount || item?.paidAmount || item?.totalAmount || 0) > 0
      || Number(item?.totalLessons || 0) > 0
      || studentTeachingSummaryListText(item?.purchaseDate || item?.createdAt)
    ));
}

const STUDENT_TEACHING_SUMMARY_LIST_ROW_FIELDS = [
  'id',
  'studentId',
  'sourceLeadId',
  'name',
  'displayName',
  'wechatName',
  'nickName',
  'nickname',
  'phone',
  'type',
  'source',
  'campus',
  'campusId',
  'campusName',
  'campusIds',
  'primaryCoach',
  'notes',
  'profileNote',
  'studentStage',
  'courseDealPath',
  'trialStatus',
  'trialAtRaw',
  'trialBookedAt',
  'trialAttendedAt',
  'courseFirstPurchaseAt',
  'conversionAt',
  'coursePurchaseCount',
  'hasTrialExperience',
  'hasTrialAttended',
  'hasFormalAttended',
  'hasCourseConversion',
  'hasTrialToCourseConversion',
  'isHistoricalStudentRoster',
  'isActiveStudentRoster',
  'packageListText',
  'packageBalanceRemaining',
  'packageBalanceTotal',
  'packageBalanceText',
  'packageBalancePercent',
  'detailPackageBalanceRemaining',
  'detailPackageBalanceTotal',
  'detailPackageBalanceText',
  'detailPackageBalancePercent',
  'packagePurchaseDate',
  'lastFormalLessonAt',
  'detailRecentLessonDate',
  'cumulativeCoursePaidAmount',
  'cumulativeCoursePaidText',
  'completedLessons',
  'packageStatusLabel',
  'paymentModeLabel',
  'activityStatusLabel',
  'lessonVolumeLabel',
  'studentStatusLabel',
  'teachingLessonDetailSourceVersion',
  'summaryUpdatedAt',
  'updatedAt',
  'leadDate',
  'createdAt'
];
const STUDENT_TEACHING_SUMMARY_META_FIELDS = [
  'kind',
  'status',
  'generation',
  'rowCount',
  'sourceTable',
  'sourceOp',
  'sourceId',
  'batchId',
  'activeVersion',
  'sourceSnapshotAt',
  'completedAt',
  'checksum',
  'error',
  'updatedAt'
];
const STUDENT_TEACHING_SUMMARY_LIST_SCAN_COLUMNS = [...new Set([
  ...STUDENT_TEACHING_SUMMARY_META_FIELDS,
  'publishedRowId',
  'publishVersion',
  ...STUDENT_TEACHING_SUMMARY_LIST_ROW_FIELDS
])];

function projectStudentTeachingSummaryListRow(row = {}) {
  const logical = studentTeachingSummaryLogicalRow(row || {});
  const projected = STUDENT_TEACHING_SUMMARY_LIST_ROW_FIELDS.reduce((next, field) => {
    if (logical[field] !== undefined) next[field] = logical[field];
    return next;
  }, {});
  const hasTrialAttended = studentTeachingSummaryListHasTrialAttended(logical);
  const hasFormalAttended = studentTeachingSummaryListHasFormalAttended(logical);
  const hasFormalCourseFact = studentTeachingSummaryListHasFormalCourseFact(logical);
  if (hasTrialAttended) {
    projected.hasTrialAttended = true;
    projected.hasTrialExperience = true;
  }
  if (hasFormalAttended) {
    projected.hasFormalAttended = true;
  }
  if (hasTrialAttended && hasFormalCourseFact) {
    projected.hasTrialToCourseConversion = true;
  }
  return projected;
}

function buildStudentTeachingSummaryListBundleRow(rows = [], publishVersion = '') {
  const version = String(publishVersion || '').trim();
  const id = buildStudentTeachingSummaryListBundleId(version);
  const logicalRows = cloneStudentTeachingSummaryRows((Array.isArray(rows) ? rows : []).map(projectStudentTeachingSummaryListRow));
  const rowsJson = JSON.stringify(logicalRows);
  return {
    id,
    kind: 'student-teaching-summary-list-bundle',
    schemaVersion: STUDENT_TEACHING_SUMMARY_LIST_BUNDLE_SCHEMA_VERSION,
    publishVersion: version,
    rowCount: logicalRows.length,
    checksum: buildStudentTeachingSummaryChecksum(logicalRows),
    encoding: 'gzip-base64',
    rowsGzipBase64: zlib.gzipSync(rowsJson).toString('base64'),
    uncompressedBytes: Buffer.byteLength(rowsJson, 'utf8')
  };
}

function studentTeachingSummaryBundleLogicalRows(row = {}) {
  if (!row || !isStudentTeachingSummaryBundleRow(row)) return [];
  if (String(row.encoding || '') === 'gzip-base64' && row.rowsGzipBase64) {
    try {
      const json = zlib.gunzipSync(Buffer.from(String(row.rowsGzipBase64 || ''), 'base64')).toString('utf8');
      const parsed = JSON.parse(json);
      return cloneStudentTeachingSummaryRows(Array.isArray(parsed) ? parsed : []);
    } catch {
      return [];
    }
  }
  return cloneStudentTeachingSummaryRows(Array.isArray(row.rows) ? row.rows : []);
}

function studentTeachingSummaryListBundleLogicalRows(row = {}) {
  if (!row || !isStudentTeachingSummaryListBundleRow(row)) return [];
  if (String(row.encoding || '') !== 'gzip-base64' || !row.rowsGzipBase64) return [];
  try {
    const json = zlib.gunzipSync(Buffer.from(String(row.rowsGzipBase64 || ''), 'base64')).toString('utf8');
    const parsed = JSON.parse(json);
    return cloneStudentTeachingSummaryRows(Array.isArray(parsed) ? parsed : []);
  } catch {
    return [];
  }
}

function studentTeachingSummaryRowsToDeleteAfterPublish(rows = [], activeVersion = '') {
  const version = String(activeVersion || '').trim();
  return (Array.isArray(rows) ? rows : []).filter(row => {
    if (!row || isStudentTeachingSummaryMetaRow(row)) return false;
    if (isStudentTeachingSummaryBundleRow(row)) {
      return String(row.publishVersion || '').trim() !== version;
    }
    if (isStudentTeachingSummaryListBundleRow(row)) {
      return String(row.publishVersion || '').trim() !== version;
    }
    if (!isVersionedStudentTeachingSummaryRow(row)) return true;
    return String(row.publishVersion || '').trim() !== version;
  });
}

function cloneStudentTeachingSummaryRows(rows = []) {
  return (Array.isArray(rows) ? rows : []).map(row => JSON.parse(JSON.stringify(row || {})));
}

async function rollbackStudentTeachingSummaryPublish({
  tableName,
  previousRows = [],
  hasReadyMeta = false,
  batchId = '',
  getCachedScan,
  put,
  del,
  logger = console
} = {}) {
  if (!tableName || typeof put !== 'function' || typeof del !== 'function') return;
  try {
    const currentRows = typeof getCachedScan === 'function'
      ? await getCachedScan(tableName, { fresh: true }).catch(() => [])
      : [];
    const currentMeta = studentTeachingSummaryMetaRow(currentRows);
    const previousMeta = studentTeachingSummaryMetaRow(previousRows);
    const previousBatchId = String(previousMeta?.batchId || '').trim();
    const currentBatchId = String(currentMeta?.batchId || '').trim();
    const shouldRestoreSnapshot = hasReadyMeta && (
      String(currentMeta?.status || '') !== STUDENT_TEACHING_SUMMARY_READY ||
      !currentBatchId ||
      currentBatchId !== previousBatchId
    );
    if (shouldRestoreSnapshot) {
      for (const row of Array.isArray(currentRows) ? currentRows : []) {
        const id = String(row?.id || '').trim();
        if (!id || id === STUDENT_TEACHING_SUMMARY_META_ID) continue;
        await del(tableName, id);
      }
      for (const row of cloneStudentTeachingSummaryRows(previousRows)) {
        const id = String(row?.id || '').trim();
        if (!id) continue;
        await put(tableName, id, row);
      }
      return;
    }
    const batchVersion = String(batchId || '').trim();
    for (const row of Array.isArray(currentRows) ? currentRows : []) {
      const id = String(row?.id || '').trim();
      if (!id || id === STUDENT_TEACHING_SUMMARY_META_ID) continue;
      if (batchVersion && String(row.publishVersion || '').trim() === batchVersion) {
        await del(tableName, id);
        continue;
      }
      if (String(row.id || '').includes(`${STUDENT_TEACHING_SUMMARY_VERSION_PREFIX}${batchVersion}:`)) {
        await del(tableName, id);
      }
    }
  } catch (rollbackErr) {
    if (typeof logger?.error === 'function') {
      logger.error('[student-teaching-summary] rollback failed', rollbackErr);
    }
  }
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

function readyStudentTeachingSummaryCacheKey(tableName = '', meta = {}, options = {}) {
  const projection = Array.isArray(options.columns) && options.columns.length
    ? options.columns.map(String).sort().join('\u0001')
    : '*';
  return JSON.stringify({
    tableName: String(tableName || ''),
    activeVersion: String(meta?.activeVersion || ''),
    rowCount: Number(meta?.rowCount),
    checksum: String(meta?.checksum || ''),
    projection
  });
}

function readReadyStudentTeachingSummaryRowsCache(tableName = '', meta = {}, options = {}, now = Date.now()) {
  const key = readyStudentTeachingSummaryCacheKey(tableName, meta, options);
  const cached = readyStudentTeachingSummaryRowsCache.get(key);
  if (!cached || cached.expiresAt <= now) {
    if (cached) readyStudentTeachingSummaryRowsCache.delete(key);
    return null;
  }
  return cloneStudentTeachingSummaryRows(cached.rows);
}

function writeReadyStudentTeachingSummaryRowsCache(tableName = '', meta = {}, rows = [], options = {}, now = Date.now()) {
  const key = readyStudentTeachingSummaryCacheKey(tableName, meta, options);
  readyStudentTeachingSummaryRowsCache.set(key, {
    expiresAt: now + READY_STUDENT_TEACHING_SUMMARY_CACHE_TTL_MS,
    rows: cloneStudentTeachingSummaryRows(rows)
  });
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
  err.reason = String(reason || status);
  err.statusCode = 503;
  err.meta = meta || null;
  return err;
}

function requireReadyStudentTeachingSummaryRows(rows = [], options = {}) {
  const verifyChecksum = options.verifyChecksum !== false;
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
  const currentVersion = String(require('./platform-metrics.js').TEACHING_LESSON_DETAIL_SOURCE_VERSION || '').trim();
  const hasTeachingLessonSnapshot = row => Number(row?.completedLessons) > 0
    || parseArr(row?.detailLessonRecordRows).length > 0
    || parseArr(row?.detailPackageOrderRows).length > 0
    || String(row?.teachingLessonDetailSourceVersion || '').trim();
  if (currentVersion && dataRows.some(row => hasTeachingLessonSnapshot(row) && String(row?.teachingLessonDetailSourceVersion || '').trim() !== currentVersion)) {
    throw studentTeachingSummaryNotReadyError(meta, 'source-version-mismatch');
  }
  if (verifyChecksum) {
    const actualChecksum = buildStudentTeachingSummaryChecksum(dataRows);
    if (!String(meta.checksum || '').trim() || meta.checksum !== actualChecksum) {
      throw studentTeachingSummaryNotReadyError(meta, 'checksum-mismatch');
    }
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

async function withReadTimeout(operation, timeoutMs, reason = 'read-timeout') {
  let timer = null;
  const timeout = new Promise((resolve, reject) => {
    timer = setTimeout(() => reject(studentTeachingSummaryNotReadyError(null, reason)), Math.max(1, timeoutMs));
  });
  try {
    return await Promise.race([Promise.resolve().then(operation), timeout]);
  } finally {
    if (timer) clearTimeout(timer);
  }
}

async function readReadyStudentTeachingSummaryRows({
  tableName,
  getCachedScan,
  getCachedRow,
  scanByIdPrefix,
  preferBundle = true,
  columns = [],
  verifyChecksum,
  timeoutMs = READY_STUDENT_TEACHING_SUMMARY_READ_TIMEOUT_MS,
  intervalMs = 150
} = {}) {
  if (!tableName || typeof getCachedScan !== 'function') {
    throw studentTeachingSummaryNotReadyError(null, 'not-configured');
  }
  async function loadRows() {
    if (typeof getCachedRow === 'function' && typeof scanByIdPrefix === 'function') {
      const meta = await getCachedRow(tableName, STUDENT_TEACHING_SUMMARY_META_ID).catch(() => null);
      const activeVersion = String(meta?.activeVersion || '').trim();
      if (activeVersion) {
        const readOptions = { columns };
        const cachedRows = readReadyStudentTeachingSummaryRowsCache(tableName, meta, readOptions);
        if (cachedRows) return [meta, ...cachedRows];
        const shouldReadBundle = preferBundle && !(Array.isArray(columns) && columns.length);
        const bundle = shouldReadBundle ? await getCachedRow(tableName, buildStudentTeachingSummaryBundleId(activeVersion)).catch(() => null) : null;
        if (shouldReadBundle && bundle && isStudentTeachingSummaryBundleRow(bundle)) {
          const rows = studentTeachingSummaryBundleLogicalRows(bundle);
          writeReadyStudentTeachingSummaryRowsCache(tableName, meta, rows, readOptions);
          return [meta, ...rows].filter(Boolean);
        }
        const rows = await scanByIdPrefix(tableName, `${STUDENT_TEACHING_SUMMARY_VERSION_PREFIX}${activeVersion}:`, { columns });
        writeReadyStudentTeachingSummaryRowsCache(tableName, meta, Array.isArray(rows) ? rows : [], readOptions);
        return [meta, ...(Array.isArray(rows) ? rows : [])].filter(Boolean);
      }
    }
    return getCachedScan(tableName, { fresh: true });
  }
  const startedAt = Date.now();
  let lastError = null;
  for (;;) {
    const remainingMs = Math.max(1, timeoutMs - (Date.now() - startedAt));
    const rows = await withReadTimeout(loadRows, remainingMs);
    try {
      return requireReadyStudentTeachingSummaryRows(rows, { verifyChecksum: verifyChecksum !== undefined ? verifyChecksum : !(Array.isArray(columns) && columns.length) });
    } catch (err) {
      lastError = err;
      if (['source-version-mismatch', 'checksum-mismatch', 'invalid-row-count'].includes(String(err?.reason || ''))
        || String(err?.reason || '').startsWith('row-count-mismatch:')) throw err;
      if (Date.now() - startedAt >= timeoutMs) throw lastError;
      await wait(intervalMs);
    }
  }
}

async function readReadyStudentTeachingSummaryListRows({
  tableName,
  getCachedRow,
  getCachedScan,
  scanByIdPrefix,
  put,
  verifyChecksum = true,
  timeoutMs = READY_STUDENT_TEACHING_SUMMARY_READ_TIMEOUT_MS
} = {}) {
  if (!tableName || typeof getCachedRow !== 'function') {
    throw studentTeachingSummaryNotReadyError(null, 'not-configured');
  }
  function readListRowsFromProjectedRows(meta, rows = []) {
    const dataRows = filterStudentTeachingSummaryPublishedRows([meta, ...(Array.isArray(rows) ? rows : [])], meta)
      .filter(row => String(row?.id || '').trim() !== String(meta?.id || '').trim())
      .map(projectStudentTeachingSummaryListRow);
    const expectedCount = Number(meta.rowCount);
    if (!Number.isSafeInteger(expectedCount) || expectedCount < 0) {
      throw studentTeachingSummaryNotReadyError(meta, 'invalid-row-count');
    }
    if (expectedCount !== dataRows.length) {
      throw studentTeachingSummaryNotReadyError(meta, `row-count-mismatch:${dataRows.length}/${expectedCount}`);
    }
    return dataRows;
  }
  return withReadTimeout(async () => {
    const meta = await getCachedRow(tableName, STUDENT_TEACHING_SUMMARY_META_ID).catch(() => null);
    const activeVersion = String(meta?.activeVersion || '').trim();
    if (!meta) throw studentTeachingSummaryNotReadyError(null, 'missing-meta');
    if (String(meta.status || '') !== STUDENT_TEACHING_SUMMARY_READY) {
      throw studentTeachingSummaryNotReadyError(meta, String(meta.status || '') || 'unknown');
    }
    const expectedCount = Number(meta.rowCount);
    if (!Number.isSafeInteger(expectedCount) || expectedCount < 0) {
      throw studentTeachingSummaryNotReadyError(meta, 'invalid-row-count');
    }
    if (activeVersion) {
      const bundleId = buildStudentTeachingSummaryListBundleId(activeVersion);
      const bundle = await getCachedRow(tableName, bundleId).catch(() => null);
      if (isStudentTeachingSummaryListBundleRow(bundle)) {
        const bundleVersion = String(bundle.publishVersion || '').trim();
        const bundleSchemaVersion = String(bundle.schemaVersion || '').trim();
        const bundleRows = studentTeachingSummaryListBundleLogicalRows(bundle);
        if (bundleVersion === activeVersion && bundleSchemaVersion === STUDENT_TEACHING_SUMMARY_LIST_BUNDLE_SCHEMA_VERSION) {
          if (expectedCount !== bundleRows.length || Number(bundle.rowCount) !== bundleRows.length) {
            throw studentTeachingSummaryNotReadyError(meta, `row-count-mismatch:${bundleRows.length}/${expectedCount}`);
          }
          requireReadyStudentTeachingSummaryRows([meta, ...bundleRows], { verifyChecksum: false });
          if (verifyChecksum) {
            const actualChecksum = buildStudentTeachingSummaryChecksum(bundleRows);
            if (!String(bundle.checksum || '').trim() || String(bundle.checksum || '') !== actualChecksum) {
              throw studentTeachingSummaryNotReadyError(meta, 'list-bundle-checksum-mismatch');
            }
          }
          return bundleRows;
        }
        console.warn('[student-teaching-summary] list bundle is stale, falling back to version rows', {
          activeVersion,
          bundleVersion,
          bundleSchemaVersion
        });
      }
      if (typeof scanByIdPrefix === 'function') {
        const versionRows = await scanByIdPrefix(tableName, `${STUDENT_TEACHING_SUMMARY_VERSION_PREFIX}${activeVersion}:`, {
          columns: STUDENT_TEACHING_SUMMARY_LIST_SCAN_COLUMNS
        }).catch(() => []);
        if (Array.isArray(versionRows) && versionRows.length) {
          const rows = readListRowsFromProjectedRows(meta, versionRows);
          if (typeof put === 'function') {
            await queueStudentTeachingSummaryListBundleRepair({
              tableName,
              activeVersion,
              rows,
              put
            });
          }
          return rows;
        }
      }
    }
    if (typeof getCachedScan === 'function') {
      const projectedRows = await getCachedScan(tableName, {
        columns: STUDENT_TEACHING_SUMMARY_LIST_SCAN_COLUMNS,
        pageLimit: 500
      }).catch(() => []);
      const projectedMeta = studentTeachingSummaryMetaRow(projectedRows) || meta;
      const rows = readListRowsFromProjectedRows(projectedMeta, projectedRows);
      const versionForRepair = String(projectedMeta?.activeVersion || projectedMeta?.batchId || activeVersion || '').trim();
      if (versionForRepair && typeof put === 'function') {
        await queueStudentTeachingSummaryListBundleRepair({
          tableName,
          activeVersion: versionForRepair,
          rows,
          put
        });
      }
      return rows;
    }
    throw studentTeachingSummaryNotReadyError(meta, 'missing-list-bundle');
  }, timeoutMs, 'list-bundle-read-timeout');
}

function queueStudentTeachingSummaryListBundleRepair({
  tableName = '',
  activeVersion = '',
  rows = [],
  put
} = {}) {
  const version = String(activeVersion || '').trim();
  if (!tableName || !version || !Array.isArray(rows) || !rows.length || typeof put !== 'function') return;
  const key = `${tableName}:${version}`;
  if (studentTeachingSummaryListBundleRepairPromises.has(key)) return studentTeachingSummaryListBundleRepairPromises.get(key);
  const promise = Promise.resolve().then(async () => {
    const listBundle = buildStudentTeachingSummaryListBundleRow(rows, version);
    await put(tableName, listBundle.id, listBundle);
  }).catch(err => {
    console.warn('[student-teaching-summary] list bundle repair failed', err?.message || err);
  }).finally(() => {
    studentTeachingSummaryListBundleRepairPromises.delete(key);
  });
  studentTeachingSummaryListBundleRepairPromises.set(key, promise);
  return promise;
}

function createStudentTeachingSummaryCache({
  tables = {},
  getCachedScan,
  getCachedRow,
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
    let previousStateReadUncertain = false;
    const previousMeta = typeof getCachedRow === 'function'
      ? await getCachedRow(T_STUDENT_TEACHING_SUMMARY, STUDENT_TEACHING_SUMMARY_META_ID).catch(() => {
          previousStateReadUncertain = true;
          return null;
        })
      : null;
    const previousRows = cloneStudentTeachingSummaryRows(await getCachedScan(T_STUDENT_TEACHING_SUMMARY, { fresh: true }).catch(() => {
      previousStateReadUncertain = true;
      return [];
    }));
    const hasReadyMeta = isReadyStudentTeachingSummaryMeta(previousMeta) || isReadyStudentTeachingSummaryMeta(studentTeachingSummaryMetaRow(previousRows));
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
        const versionedRow = buildVersionedStudentTeachingSummaryRow(row, batchId);
        await put(T_STUDENT_TEACHING_SUMMARY, versionedRow.id, versionedRow);
      }
      const bundle = buildStudentTeachingSummaryBundleRow(rows, batchId);
      await put(T_STUDENT_TEACHING_SUMMARY, bundle.id, bundle);
      const listBundle = buildStudentTeachingSummaryListBundleRow(rows, batchId);
      await put(T_STUDENT_TEACHING_SUMMARY, listBundle.id, listBundle);
      const publishedRows = rows;
      await writeMeta(STUDENT_TEACHING_SUMMARY_READY, {
        batchId,
        activeVersion: batchId,
        sourceSnapshotAt,
        completedAt: new Date().toISOString(),
        rowCount: publishedRows.length,
        checksum: buildStudentTeachingSummaryChecksum(publishedRows)
      });
      return publishedRows;
    } catch (err) {
      try {
        await rollbackStudentTeachingSummaryPublish({
          tableName: T_STUDENT_TEACHING_SUMMARY,
          previousRows,
          hasReadyMeta,
          batchId,
          getCachedScan,
          put,
          del,
          logger
        });
      } catch (rollbackErr) {
        logger.error('[student-teaching-summary] rollback failed', rollbackErr);
      }
      if (!hasReadyMeta && !previousStateReadUncertain) {
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
  STUDENT_TEACHING_SUMMARY_VERSION_PREFIX,
  STUDENT_TEACHING_SUMMARY_BUNDLE_PREFIX,
  STUDENT_TEACHING_SUMMARY_LIST_BUNDLE_PREFIX,
  STUDENT_TEACHING_SUMMARY_LIST_SCAN_COLUMNS,
  buildStudentTeachingSummaryMetaRow,
  isStudentTeachingSummaryMetaRow,
  isStudentTeachingSummaryBundleRow,
  isStudentTeachingSummaryListBundleRow,
  filterStudentTeachingSummaryDataRows,
  filterStudentTeachingSummaryPublishedRows,
  buildVersionedStudentTeachingSummaryRow,
  buildStudentTeachingSummaryBundleId,
  buildStudentTeachingSummaryListBundleId,
  buildStudentTeachingSummaryBundleRow,
  buildStudentTeachingSummaryListBundleRow,
  studentTeachingSummaryBundleLogicalRows,
  studentTeachingSummaryRowsToDeleteAfterPublish,
  rollbackStudentTeachingSummaryPublish,
  buildStudentTeachingSummaryChecksum,
  requireReadyStudentTeachingSummaryRows,
  readReadyStudentTeachingSummaryRows,
  readReadyStudentTeachingSummaryListRows
};
