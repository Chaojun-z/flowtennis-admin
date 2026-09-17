const { buildCustomerLifecycleRows } = require('./customer-lifecycle.js');
const {
  buildStudentTeachingSummaryRows,
  TEACHING_LESSON_DETAIL_SOURCE_VERSION
} = require('./platform-metrics.js');
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
const studentTeachingSummaryDeltaSyncPromises = new Map();

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
  'hasStudentProfile',
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
  'formalPackageCourseTypes',
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
  'previousActiveVersion',
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

function compactStudentProfileSummaryRow(student = {}, now = new Date()) {
  const studentId = String(student.id || student.studentId || '').trim();
  const updatedAt = String(student.updatedAt || now.toISOString()).trim();
  return {
    id: studentId,
    studentId,
    sourceLeadId: String(student.sourceLeadId || student.leadId || student.fromLeadId || '').trim(),
    name: String(student.name || student.studentName || student.displayName || studentId).trim(),
    displayName: String(student.displayName || student.name || student.studentName || studentId).trim(),
    wechatName: String(student.wechatName || '').trim(),
    nickName: String(student.nickName || '').trim(),
    nickname: String(student.nickname || '').trim(),
    phone: String(student.phone || '').trim(),
    type: String(student.type || student.customerType || student.studentType || '').trim(),
    source: String(student.source || '').trim(),
    campus: String(student.campus || student.campusName || '').trim(),
    campusId: String(student.campusId || '').trim(),
    campusName: String(student.campusName || '').trim(),
    campusIds: parseArr(student.campusIds),
    primaryCoach: String(student.primaryCoach || student.coachName || student.coach || '').trim(),
    hasStudentProfile: true,
    notes: Object.prototype.hasOwnProperty.call(student, 'notes') ? String(student.notes || '') : '',
    profileNote: String(student.profileNote || '').trim(),
    studentStage: 'student',
    courseDealPath: '',
    trialStatus: '',
    coursePurchaseCount: 0,
    hasTrialExperience: false,
    hasTrialAttended: false,
    hasFormalAttended: false,
    hasCourseConversion: false,
    hasTrialToCourseConversion: false,
    isHistoricalStudentRoster: true,
    isActiveStudentRoster: false,
    packageBalanceRemaining: 0,
    packageBalanceTotal: 0,
    detailPackageBalanceRemaining: 0,
    detailPackageBalanceTotal: 0,
    cumulativeCoursePaidAmount: 0,
    completedLessons: 0,
    teachingLessonDetailSourceVersion: String(require('./platform-metrics.js').TEACHING_LESSON_DETAIL_SOURCE_VERSION || '').trim(),
    summaryUpdatedAt: now.toISOString(),
    updatedAt,
    leadDate: String(student.leadDate || student.createdAt || updatedAt).trim(),
    createdAt: String(student.createdAt || updatedAt).trim()
  };
}

function mergeStudentProfileSummaryRow(existing = null, profile = {}) {
  if (!existing) return profile;
  return {
    ...existing,
    sourceLeadId: profile.sourceLeadId || existing.sourceLeadId,
    name: profile.name || existing.name,
    displayName: profile.displayName || existing.displayName,
    wechatName: profile.wechatName || existing.wechatName,
    nickName: profile.nickName || existing.nickName,
    nickname: profile.nickname || existing.nickname,
    phone: profile.phone,
    type: profile.type || existing.type,
    source: profile.source || existing.source,
    campus: profile.campus || existing.campus,
    campusId: profile.campusId || existing.campusId,
    campusName: profile.campusName || existing.campusName,
    campusIds: profile.campusIds && profile.campusIds.length ? profile.campusIds : existing.campusIds,
    primaryCoach: profile.primaryCoach || existing.primaryCoach,
    hasStudentProfile: true,
    notes: Object.prototype.hasOwnProperty.call(profile, 'notes') ? profile.notes : existing.notes,
    profileNote: profile.profileNote || existing.profileNote,
    updatedAt: profile.updatedAt || existing.updatedAt,
    summaryUpdatedAt: profile.summaryUpdatedAt || existing.summaryUpdatedAt,
    createdAt: existing.createdAt || profile.createdAt,
    leadDate: existing.leadDate || profile.leadDate
  };
}

function upsertSummaryRow(rows = [], row = {}) {
  const studentId = String(row.studentId || row.id || '').trim();
  if (!studentId) return Array.isArray(rows) ? rows : [];
  const sourceRows = Array.isArray(rows) ? rows : [];
  let replaced = false;
  const next = sourceRows.map(item => {
    const itemId = String(item?.studentId || item?.id || '').trim();
    if (itemId !== studentId) return item;
    replaced = true;
    return mergeStudentProfileSummaryRow(item, row);
  });
  if (!replaced) next.push(row);
  return next;
}

async function upsertStudentProfileIntoTeachingSummary({
  tableName,
  student = {},
  getCachedRow,
  put,
  now = new Date(),
  logger = console
} = {}) {
  const studentId = String(student.id || student.studentId || '').trim();
  if (!tableName || !studentId || typeof getCachedRow !== 'function' || typeof put !== 'function') {
    return { synced: false, reason: 'not-configured' };
  }
  try {
    const meta = await getCachedRow(tableName, STUDENT_TEACHING_SUMMARY_META_ID).catch(() => null);
    const activeVersion = String(meta?.activeVersion || '').trim();
    if (!isReadyStudentTeachingSummaryMeta(meta) || !activeVersion) {
      return { synced: false, reason: 'summary-not-ready' };
    }
    const fullBundleId = buildStudentTeachingSummaryBundleId(activeVersion);
    const listBundleId = buildStudentTeachingSummaryListBundleId(activeVersion);
    const [fullBundle, listBundle] = await Promise.all([
      getCachedRow(tableName, fullBundleId).catch(() => null),
      getCachedRow(tableName, listBundleId).catch(() => null)
    ]);
    if (!isStudentTeachingSummaryBundleRow(fullBundle) || !isStudentTeachingSummaryListBundleRow(listBundle)) {
      return { synced: false, reason: 'bundle-missing' };
    }
    const profileRow = compactStudentProfileSummaryRow(student, now);
    const fullRows = upsertSummaryRow(studentTeachingSummaryBundleLogicalRows(fullBundle), profileRow);
    const nextFullBundle = buildStudentTeachingSummaryBundleRow(fullRows, activeVersion);
    const nextListBundle = buildStudentTeachingSummaryListBundleRow(fullRows, activeVersion);
    const nextMeta = {
      ...meta,
      rowCount: fullRows.length,
      checksum: buildStudentTeachingSummaryChecksum(fullRows),
      sourceTable: String(meta.sourceTable || 'ft_students'),
      sourceOp: 'student-profile-sync',
      sourceId: studentId,
      updatedAt: now.toISOString()
    };
    const versionedRow = buildVersionedStudentTeachingSummaryRow(
      mergeStudentProfileSummaryRow(fullRows.find(row => String(row.studentId || row.id || '') === studentId), profileRow),
      activeVersion
    );
    await put(tableName, versionedRow.id, versionedRow);
    await put(tableName, nextFullBundle.id, nextFullBundle);
    await put(tableName, nextListBundle.id, nextListBundle);
    await put(tableName, STUDENT_TEACHING_SUMMARY_META_ID, nextMeta);
    readyStudentTeachingSummaryRowsCache.clear();
    return { synced: true, studentId, rowCount: fullRows.length };
  } catch (err) {
    if (typeof logger?.warn === 'function') {
      logger.warn('[student-teaching-summary] student profile sync skipped', err?.message || err);
    }
    return { synced: false, reason: 'sync-failed', error: String(err?.message || err) };
  }
}

async function deleteStudentFromTeachingSummary({
  tableName,
  studentId = '',
  getCachedRow,
  put,
  del,
  now = new Date(),
  logger = console
} = {}) {
  const sid = String(studentId || '').trim();
  if (!tableName || !sid || typeof getCachedRow !== 'function') {
    return { synced: false, reason: 'not-configured' };
  }
  const deleteRow = typeof del === 'function' ? del : async () => null;
  try {
    const meta = await getCachedRow(tableName, STUDENT_TEACHING_SUMMARY_META_ID).catch(() => null);
    const activeVersion = String(meta?.activeVersion || '').trim();
    const directIds = [sid, activeVersion ? `${STUDENT_TEACHING_SUMMARY_VERSION_PREFIX}${activeVersion}:${sid}` : ''].filter(Boolean);
    if (!isReadyStudentTeachingSummaryMeta(meta) || !activeVersion || typeof put !== 'function') {
      await Promise.all(directIds.map(id => deleteRow(tableName, id).catch(() => null)));
      readyStudentTeachingSummaryRowsCache.clear();
      return { synced: false, reason: 'summary-not-ready', studentId: sid };
    }
    const fullBundleId = buildStudentTeachingSummaryBundleId(activeVersion);
    const fullBundle = await getCachedRow(tableName, fullBundleId).catch(() => null);
    if (!isStudentTeachingSummaryBundleRow(fullBundle)) {
      await Promise.all(directIds.map(id => deleteRow(tableName, id).catch(() => null)));
      readyStudentTeachingSummaryRowsCache.clear();
      return { synced: false, reason: 'bundle-missing', studentId: sid };
    }
    const currentRows = studentTeachingSummaryBundleLogicalRows(fullBundle);
    const nextRows = currentRows.filter(row => String(row?.studentId || row?.id || '').trim() !== sid);
    if (nextRows.length === currentRows.length) {
      await Promise.all(directIds.map(id => deleteRow(tableName, id).catch(() => null)));
      readyStudentTeachingSummaryRowsCache.clear();
      return { synced: true, studentId: sid, rowCount: nextRows.length, removed: false };
    }
    const nextFullBundle = buildStudentTeachingSummaryBundleRow(nextRows, activeVersion);
    const nextListBundle = buildStudentTeachingSummaryListBundleRow(nextRows, activeVersion);
    const nextMeta = buildStudentTeachingSummaryMetaRow({
      ...meta,
      rowCount: nextRows.length,
      checksum: buildStudentTeachingSummaryChecksum(nextRows),
      sourceTable: String(meta.sourceTable || 'ft_students'),
      sourceOp: 'student-delete',
      sourceId: sid,
      updatedAt: now.toISOString(),
      completedAt: now.toISOString()
    });
    await put(tableName, nextFullBundle.id, nextFullBundle);
    await put(tableName, nextListBundle.id, nextListBundle);
    await put(tableName, STUDENT_TEACHING_SUMMARY_META_ID, nextMeta);
    await Promise.all(directIds.map(id => deleteRow(tableName, id).catch(() => null)));
    readyStudentTeachingSummaryRowsCache.clear();
    return { synced: true, studentId: sid, rowCount: nextRows.length, removed: true };
  } catch (err) {
    if (typeof logger?.warn === 'function') {
      logger.warn('[student-teaching-summary] student delete sync skipped', err?.message || err);
    }
    return { synced: false, reason: 'sync-failed', error: String(err?.message || err), studentId: sid };
  }
}

function summaryDeltaStudentIds(...rows) {
  return uniqueStudentIds(rows.flatMap(row => {
    if (!row) return [];
    const studentIds = parseArr(row.studentIds);
    return [
      ...studentIds,
      row.studentId,
      row.usedByStudentId,
      row.authorizedStudentId,
      row.packageOwnerStudentId
    ];
  }));
}

function summaryDeltaActualStudentIds(schedule = {}, ledger = {}) {
  const ledgerIds = uniqueStudentIds([ledger.usedByStudentId, ledger.authorizedStudentId, ledger.studentId]);
  const scheduleIds = uniqueStudentIds(parseArr(schedule.studentIds));
  if (ledgerIds.length) {
    if (scheduleIds.length && ledgerIds.every(id => scheduleIds.includes(id))) return scheduleIds;
    return ledgerIds;
  }
  const scheduleRelationIds = uniqueStudentIds([schedule.usedByStudentId, schedule.authorizedStudentId]);
  if (scheduleRelationIds.length) return scheduleRelationIds;
  return summaryDeltaStudentIds(schedule);
}

function summaryDeltaScheduleIsActive(row = {}) {
  const status = String(row.status || row.systemStatus || 'active').trim();
  return !['voided', 'refunded', 'deleted', 'inactive', 'cancelled', 'canceled', '已取消', '已作废', '已删除'].includes(status);
}

function summaryDeltaIsTrial(row = {}) {
  return /体验/.test([
    row.courseType,
    row.standardCourseType,
    row.packageCourseType,
    row.type,
    row.experienceType,
    row.packageName,
    row.productName
  ].filter(Boolean).join(' '));
}

function summaryDeltaIsCompanion(row = {}) {
  return /陪打/.test([
    row.courseType,
    row.standardCourseType,
    row.packageCourseType,
    row.type,
    row.packageName,
    row.productName,
    row.scheduleSource
  ].filter(Boolean).join(' '));
}

function summaryDeltaPackageName(row = {}, fallback = {}) {
  return String(
    row.packageName
    || row.productName
    || row.name
    || fallback.packageName
    || fallback.productName
    || fallback.name
    || row.courseType
    || fallback.courseType
    || '课包'
  ).trim();
}

function summaryDeltaPackageUnit(row = {}) {
  const explicit = String(row.unit || row.balanceUnit || row.lessonUnit || '').trim();
  if (explicit) return explicit;
  return /小班|1v4|专项课/.test(summaryDeltaPackageName(row, row)) ? '次' : '节';
}

function summaryDeltaPackageDate(row = {}) {
  return String(row.purchaseDate || row.businessDate || row.validFrom || row.createdAt || '').trim().slice(0, 10);
}

function summaryDeltaPackageRow(entitlement = {}, existing = {}) {
  const totalLessons = Number(entitlement.totalLessons ?? existing.totalLessons) || 0;
  const remainingLessons = Number(entitlement.remainingLessons ?? existing.remainingLessons) || 0;
  const usedLessons = Number(entitlement.usedLessons ?? Math.max(0, totalLessons - remainingLessons)) || 0;
  const status = String(entitlement.status || existing.status || 'active').trim();
  const statusText = ['voided', 'refunded', 'deleted', 'inactive', 'cancelled', 'canceled', '已作废', '已删除', '已取消'].includes(status)
    ? '已作废'
    : (remainingLessons <= 0 ? '已用完' : '正常');
  return {
    ...existing,
    studentId: String(existing.studentId || entitlement.usedByStudentId || entitlement.authorizedStudentId || entitlement.studentId || '').trim(),
    entitlementId: String(entitlement.id || existing.entitlementId || '').trim(),
    purchaseId: String(entitlement.purchaseId || existing.purchaseId || '').trim(),
    packageId: String(entitlement.packageId || existing.packageId || '').trim(),
    packageName: summaryDeltaPackageName(entitlement, existing),
    courseType: String(entitlement.courseType || existing.courseType || '').trim(),
    remainingLessons,
    totalLessons,
    usedLessons,
    purchaseDate: summaryDeltaPackageDate(entitlement) || String(existing.purchaseDate || '').trim(),
    statusText,
    unit: summaryDeltaPackageUnit(entitlement),
    ownerCoach: String(entitlement.ownerCoach || existing.ownerCoach || '').trim(),
    packageOwnerStudentId: String(entitlement.packageOwnerStudentId || existing.packageOwnerStudentId || entitlement.studentId || '').trim(),
    packageOwnerStudentName: String(entitlement.packageOwnerStudentName || existing.packageOwnerStudentName || '').trim(),
    usedByStudentId: String(entitlement.usedByStudentId || entitlement.authorizedStudentId || existing.usedByStudentId || '').trim(),
    usedByStudentName: String(entitlement.usedByStudentName || entitlement.authorizedStudentName || existing.usedByStudentName || '').trim()
  };
}

function summaryDeltaPatchPackageRows(rows = [], entitlementsById = new Map(), studentId = '') {
  const sourceRows = Array.isArray(rows) ? rows : [];
  const matched = new Set();
  const next = sourceRows.map(row => {
    const entitlementId = String(row?.entitlementId || '').trim();
    const entitlement = entitlementsById.get(entitlementId);
    if (!entitlement) return row;
    matched.add(entitlementId);
    return summaryDeltaPackageRow(entitlement, row);
  });
  entitlementsById.forEach((entitlement, entitlementId) => {
    const ownerId = String(entitlement.studentId || '').trim();
    const usedById = String(entitlement.usedByStudentId || entitlement.authorizedStudentId || '').trim();
    if (matched.has(entitlementId) || (ownerId !== studentId && usedById !== studentId)) return;
    next.push(summaryDeltaPackageRow(entitlement, { studentId }));
  });
  return next;
}

function summaryDeltaPackageFields(detailRows = [], listRows = [], base = {}) {
  const sourceDetailRows = Array.isArray(detailRows) ? detailRows : [];
  const eligibleRows = sourceDetailRows.filter(row => !summaryDeltaIsCompanion(row));
  const formalRows = eligibleRows.filter(row => !summaryDeltaIsTrial(row));
  const balanceRows = formalRows.length ? formalRows : eligibleRows;
  const activeRows = balanceRows.filter(row => (Number(row.remainingLessons) || 0) > 0);
  const displayRows = activeRows.length ? activeRows : balanceRows.slice(0, 1);
  const detailRemaining = balanceRows.reduce((sum, row) => sum + (Number(row.remainingLessons) || 0), 0);
  const detailTotal = balanceRows.reduce((sum, row) => sum + (Number(row.totalLessons) || 0), 0);
  const displayRemaining = displayRows.reduce((sum, row) => sum + (Number(row.remainingLessons) || 0), 0);
  const displayTotal = displayRows.reduce((sum, row) => sum + (Number(row.totalLessons) || 0), 0);
  const packageListRows = (Array.isArray(listRows) && listRows.length ? listRows : sourceDetailRows)
    .filter(row => !summaryDeltaIsCompanion(row));
  const visibleRows = packageListRows.filter(row => (Number(row.remainingLessons) || 0) > 0);
  const finalListRows = visibleRows.length ? visibleRows : packageListRows.slice(0, 1);
  const packageStatusLabel = formalRows.length
    ? (displayRemaining > 0 && displayRemaining <= 2 ? '课包即将耗尽' : (displayRemaining > 0 ? '课包有余额' : '课包已用完'))
    : String(base.packageStatusLabel || '未买过课包').trim();
  const progressText = sourceDetailRows
    .map(row => `${Number(row.remainingLessons) || 0}/${Number(row.totalLessons) || 0}`)
    .filter(Boolean)
    .join(',');
  const formatQuantity = value => Number.isInteger(Number(value)) ? String(Number(value)) : String(Math.round((Number(value) || 0) * 10) / 10);
  return {
    packageListRows: finalListRows,
    detailPackageOrderRows: sourceDetailRows,
    packageListText: finalListRows.length
      ? finalListRows.map(row => `${summaryDeltaPackageName(row, row)} ${formatQuantity(row.remainingLessons)}/${formatQuantity(row.totalLessons)}`).join('\n')
      : '-',
    packageBalanceRemaining: displayRemaining,
    packageBalanceTotal: displayTotal,
    packageBalanceText: displayTotal > 0 ? `${formatQuantity(displayRemaining)}/${formatQuantity(displayTotal)}` : '-',
    packageBalancePercent: displayTotal > 0 ? Math.max(0, Math.min(100, Math.round(displayRemaining / displayTotal * 100))) : 0,
    detailPackageBalanceRemaining: detailRemaining,
    detailPackageBalanceTotal: detailTotal,
    detailPackageBalanceText: detailTotal > 0 ? `${formatQuantity(detailRemaining)}/${formatQuantity(detailTotal)}` : '-',
    detailPackageBalancePercent: detailTotal > 0 ? Math.max(0, Math.min(100, Math.round(detailRemaining / detailTotal * 100))) : 0,
    detailPackageProgressText: progressText || '-',
    packagePurchaseDate: finalListRows.map(row => String(row.purchaseDate || '').trim()).filter(Boolean).sort()[0] || String(base.packagePurchaseDate || '').trim(),
    packageStatusLabel
  };
}

function summaryDeltaDateMs(value = '') {
  const parsed = Date.parse(String(value || '').trim().replace(' ', 'T'));
  return Number.isFinite(parsed) ? parsed : Number.MAX_SAFE_INTEGER;
}

function summaryDeltaScheduleTime(row = {}, fallback = {}) {
  return String(row.startTime || row.endTime || row.relatedDate || row.sourceDate || row.scheduleTime || row.createdAt || fallback.startTime || fallback.createdAt || '').trim();
}

function summaryDeltaTimeText(row = {}, fallback = {}) {
  const raw = summaryDeltaScheduleTime(row, fallback);
  if (!raw) return '';
  const date = raw.slice(0, 10);
  const start = raw.slice(11, 16);
  const end = String(row.endTime || fallback.endTime || '').slice(11, 16);
  if (start && end) return `${date} ${start}-${end}`;
  return start ? `${date} ${start}` : date;
}

function summaryDeltaLessonRow({ schedule = {}, ledger = {}, entitlement = {}, studentId = '', now = new Date() } = {}) {
  const scheduleTime = summaryDeltaScheduleTime(schedule, ledger);
  const lessonUnits = Math.abs(Number(ledger.lessonDelta) || Number(schedule.lessonCount) || 1);
  const isPast = !scheduleTime || summaryDeltaDateMs(scheduleTime) <= (now instanceof Date ? now.getTime() : summaryDeltaDateMs(now));
  const isLedger = !!String(ledger.id || '').trim();
  const lessonDelta = isLedger ? Number(ledger.lessonDelta) || 0 : (isPast ? -lessonUnits : 0);
  const courseType = String(schedule.courseType || entitlement.courseType || ledger.courseType || '课程').trim();
  const packageName = summaryDeltaPackageName(entitlement, schedule);
  const isTrial = summaryDeltaIsTrial({ ...entitlement, ...ledger, ...schedule });
  const isCompanion = summaryDeltaIsCompanion({ ...entitlement, ...ledger, ...schedule });
  const campus = String(schedule.campus || schedule.campusName || ledger.campus || entitlement.campus || '').trim();
  const venue = String(schedule.venue || schedule.court || ledger.venue || ledger.court || '').trim();
  const coach = String(schedule.coach || schedule.coachName || ledger.coach || ledger.coachName || entitlement.ownerCoach || '').trim();
  const actualStudentIds = summaryDeltaActualStudentIds(schedule, ledger);
  return {
    kind: isLedger ? 'ledger' : 'schedule',
    scheduleId: String(schedule.id || ledger.scheduleId || '').trim(),
    entitlementId: String(ledger.entitlementId || entitlement.id || schedule.entitlementId || '').trim(),
    purchaseId: String(ledger.purchaseId || entitlement.purchaseId || schedule.purchaseId || '').trim(),
    packageRecordKey: String(ledger.entitlementId || entitlement.id || schedule.entitlementId || '').trim()
      ? `ent:${String(ledger.entitlementId || entitlement.id || schedule.entitlementId).trim()}`
      : (String(ledger.purchaseId || entitlement.purchaseId || schedule.purchaseId || '').trim()
        ? `pur:${String(ledger.purchaseId || entitlement.purchaseId || schedule.purchaseId).trim()}`
        : ''),
    sortTime: scheduleTime,
    time: summaryDeltaTimeText(schedule, ledger),
    packageName,
    packageOwnerStudentId: String(entitlement.packageOwnerStudentId || entitlement.studentId || '').trim(),
    packageOwnerName: String(entitlement.packageOwnerStudentName || '').trim(),
    actualStudentIds,
    courseType,
    campus,
    venue,
    coach,
    lessonUnits,
    lessonCount: schedule.lessonCount,
    lessonDelta,
    countAsCompletedLesson: lessonDelta < 0 && isPast && !isTrial && !isCompanion && (actualStudentIds.length ? actualStudentIds.includes(studentId) : true),
    settlementType: String(schedule.settlementType || ledger.settlementType || '').trim(),
    paymentType: String(schedule.paymentType || ledger.paymentType || '').trim(),
    paymentMethod: String(schedule.paymentMethod || ledger.paymentMethod || '').trim(),
    paidAmount: Number(schedule.paidAmount || ledger.paidAmount || 0) || 0,
    status: isPast ? '已结束' : '待上课',
    statusClass: isPast ? 'detail-tag-muted' : 'detail-tag-success',
    metaParts: [campus && [campus, venue].filter(Boolean).join(' '), coach, courseType].filter(Boolean),
    reason: String(ledger.reason || ledger.notes || schedule.notes || '').trim()
  };
}

function summaryDeltaPatchRow(base = {}, {
  previousSchedule = null,
  nextSchedule = null,
  changedEntitlements = [],
  changedLedgers = [],
  studentId = '',
  now = new Date()
} = {}) {
  const nowDate = now instanceof Date ? now : new Date(now);
  const scheduleId = String(previousSchedule?.id || nextSchedule?.id || '').trim();
  const baseLessonRows = parseArr(base.detailLessonRecordRows);
  const scheduleRowsToRemove = scheduleId
    ? baseLessonRows.filter(row => String(row?.scheduleId || '').trim() === scheduleId)
    : [];
  let lessonRows = scheduleId
    ? baseLessonRows.filter(row => String(row?.scheduleId || '').trim() !== scheduleId)
    : [...baseLessonRows];
  const addedLessonRows = [];
  const oldCompletedUnits = scheduleRowsToRemove.reduce((sum, row) => {
    if (row?.countAsCompletedLesson === false || Number(row?.lessonDelta) >= 0) return sum;
    return sum + Math.abs(Number(row.lessonDelta) || 0);
  }, 0);
  const manualReturnUnits = changedLedgers
    .filter(row => !String(row?.scheduleId || '').trim()
      && summaryDeltaStudentIds(row).includes(studentId)
      && Number(row?.lessonDelta) > 0
      && String(row?.action || '').trim() !== 'free_absence')
    .reduce((sum, row) => sum + (Number(row.lessonDelta) || 0), 0);
  if (manualReturnUnits > 0) {
    let unitsLeft = manualReturnUnits;
    lessonRows = lessonRows.filter(row => {
      if (!unitsLeft || String(row?.kind || '').trim() !== 'ledger'
        || String(row?.entitlementId || '').trim() !== String(changedLedgers.find(item => Number(item?.lessonDelta) > 0)?.entitlementId || '').trim()
        || Number(row?.lessonDelta) >= 0) return true;
      const rowUnits = Math.abs(Number(row.lessonDelta) || 0);
      if (rowUnits <= unitsLeft) {
        unitsLeft -= rowUnits;
        return false;
      }
      row.lessonDelta = -(rowUnits - unitsLeft);
      unitsLeft = 0;
      return true;
    });
  }
  const nextStudentIds = summaryDeltaScheduleIsActive(nextSchedule || {})
    ? summaryDeltaStudentIds(nextSchedule)
    : [];
  const nextLedger = changedLedgers
    .filter(row => String(row?.scheduleId || '').trim() === scheduleId)
    .filter(row => summaryDeltaStudentIds(row).includes(studentId))
    .filter(row => Number(row?.lessonDelta) < 0)
    .sort((a, b) => String(b?.createdAt || b?.updatedAt || b?.id || '').localeCompare(String(a?.createdAt || a?.updatedAt || a?.id || '')))[0];
  const manualLedger = !scheduleId
    ? changedLedgers
      .filter(row => !String(row?.scheduleId || '').trim() && summaryDeltaStudentIds(row).includes(studentId))
      .filter(row => Number(row?.lessonDelta) < 0)
      .sort((a, b) => String(b?.createdAt || b?.updatedAt || b?.id || '').localeCompare(String(a?.createdAt || a?.updatedAt || a?.id || '')))[0]
    : null;
  const nextEntitlement = changedEntitlements.find(row => {
    const entitlementId = String(nextLedger?.entitlementId || manualLedger?.entitlementId || nextSchedule?.entitlementId || '').trim();
    return entitlementId && String(row?.id || '').trim() === entitlementId;
  }) || {};
  const nextLessonIsCompanion = summaryDeltaIsCompanion({ ...nextEntitlement, ...(nextLedger || manualLedger || {}), ...(nextSchedule || {}) });
  if (!nextLessonIsCompanion && ((nextSchedule && nextStudentIds.includes(studentId) && summaryDeltaScheduleIsActive(nextSchedule))
    || manualLedger)) {
    const row = summaryDeltaLessonRow({
      schedule: nextSchedule || {},
      ledger: nextLedger || manualLedger || {},
      entitlement: nextEntitlement,
      studentId,
      now: nowDate
    });
    if (row.lessonDelta < 0 || row.status === '待上课') {
      lessonRows.push(row);
      addedLessonRows.push(row);
    }
  }
  lessonRows.sort((a, b) => String(b?.sortTime || b?.time || '').localeCompare(String(a?.sortTime || a?.time || '')));

  const entitlementMap = new Map(
    changedEntitlements
      .map(item => item?.entitlement || item)
      .filter(row => row && String(row.id || '').trim())
      .map(row => [String(row.id).trim(), row])
  );
  const existingDetailPackages = parseArr(base.detailPackageOrderRows);
  const existingListPackages = parseArr(base.packageListRows);
  const hasPackageFacts = existingDetailPackages.length
    || existingListPackages.length
    || [...entitlementMap.values()].some(row => summaryDeltaStudentIds(row).includes(studentId));
  const detailPackageRows = summaryDeltaPatchPackageRows(
    existingDetailPackages.length ? existingDetailPackages : existingListPackages,
    entitlementMap,
    studentId
  );
  const listPackageRows = summaryDeltaPatchPackageRows(
    existingListPackages.length ? existingListPackages : detailPackageRows,
    entitlementMap,
    studentId
  );
  const packageFields = hasPackageFacts ? summaryDeltaPackageFields(detailPackageRows, listPackageRows, base) : {};
  const addedCompletedUnits = addedLessonRows.reduce((sum, row) => {
    if (row?.countAsCompletedLesson === false || Number(row?.lessonDelta) >= 0) return sum;
    return sum + Math.abs(Number(row.lessonDelta) || 0);
  }, 0);
  const previousCompletedLessons = Number(base.completedLessons) || 0;
  const completedLessons = Math.max(0, Math.round((previousCompletedLessons - oldCompletedUnits - manualReturnUnits + addedCompletedUnits) * 10) / 10);
  const latestFormalLesson = lessonRows
    .filter(row => row?.countAsCompletedLesson !== false && !summaryDeltaIsTrial(row) && !summaryDeltaIsCompanion(row))
    .map(row => String(row.time || row.sortTime || '').trim().slice(0, 10))
    .filter(Boolean)
    .sort()
    .pop() || '';
  const hasTrialAttended = !!base.hasTrialAttended || lessonRows
    .some(row => summaryDeltaIsTrial(row) && Number(row?.lessonDelta) < 0);
  const previousRecent = String(base.detailRecentLessonDate || base.lastFormalLessonAt || '').trim();
  const detailRecentLessonDate = latestFormalLesson || (previousRecent === String(scheduleRowsToRemove[0]?.time || '').slice(0, 10) ? '' : previousRecent);
  const packageBalanceRemaining = Number(packageFields.packageBalanceRemaining) || 0;
  const isHistorical = !!base.isHistoricalStudentRoster || !!base.hasStudentProfile || completedLessons > 0 || Number(packageFields.packageBalanceTotal) > 0;
  const isActive = packageBalanceRemaining > 0
    || (!!detailRecentLessonDate && summaryDeltaDateMs(detailRecentLessonDate) >= summaryDeltaDateMs(new Date(nowDate.getTime() - 90 * 86400000)));
  const nextRow = {
    ...base,
    ...packageFields,
    detailLessonRecordRows: lessonRows,
    detailRecentLessonDate,
    lastFormalLessonAt: detailRecentLessonDate,
    completedLessons,
    hasTrialAttended,
    hasTrialExperience: !!base.hasTrialExperience || hasTrialAttended,
    hasFormalAttended: completedLessons > 0,
    isHistoricalStudentRoster: isHistorical,
    isActiveStudentRoster: isActive,
    teachingLessonDetailSourceVersion: TEACHING_LESSON_DETAIL_SOURCE_VERSION,
    summaryUpdatedAt: nowDate.toISOString(),
    updatedAt: nowDate.toISOString()
  };
  return nextRow;
}

function summaryDeltaSafeBundleRows(bundle = {}) {
  const rows = studentTeachingSummaryBundleLogicalRows(bundle);
  if (!rows.length && Number(bundle?.rowCount) !== 0) return null;
  if (Number(bundle?.rowCount) !== rows.length) return null;
  if (!String(bundle?.checksum || '').trim() || String(bundle.checksum) !== buildStudentTeachingSummaryChecksum(rows)) return null;
  return rows;
}

function summaryDeltaVersion(operationId = '') {
  const suffix = String(operationId || '').trim().replace(/[^A-Za-z0-9_-]/g, '-').slice(0, 80);
  return `student-teaching-summary-delta-${Date.now()}${suffix ? `-${suffix}` : ''}`;
}

async function syncStudentTeachingSummaryDelta({
  tableName,
  getCachedRow,
  put,
  previousSchedule = null,
  nextSchedule = null,
  changedEntitlements = [],
  changedLedgers = [],
  now = new Date(),
  operationId = '',
  logger = console
} = {}) {
  if (!tableName || typeof getCachedRow !== 'function' || typeof put !== 'function') {
    return { synced: false, reason: 'not-configured' };
  }
  const key = String(tableName);
  const previous = studentTeachingSummaryDeltaSyncPromises.get(key) || Promise.resolve();
  const run = previous.catch(() => null).then(async () => {
    const meta = await getCachedRow(tableName, STUDENT_TEACHING_SUMMARY_META_ID).catch(() => null);
    const activeVersion = String(meta?.activeVersion || '').trim();
    if (!isReadyStudentTeachingSummaryMeta(meta) || !activeVersion) return { synced: false, reason: 'summary-not-ready' };
    const currentBundle = await getCachedRow(tableName, buildStudentTeachingSummaryBundleId(activeVersion)).catch(() => null);
    const currentRows = summaryDeltaSafeBundleRows(currentBundle);
    if (!currentRows) return { synced: false, reason: 'bundle-not-ready' };
    if (Number(meta.rowCount) !== currentRows.length) return { synced: false, reason: 'row-count-mismatch' };
    const affectedIds = summaryDeltaStudentIds(previousSchedule, nextSchedule, ...changedEntitlements, ...changedLedgers);
    if (!affectedIds.length) return { synced: true, affectedStudentIds: [], rowCount: currentRows.length };
    const currentById = new Map(currentRows.map(row => [String(row?.studentId || row?.id || '').trim(), row]));
    const missing = affectedIds.filter(studentId => !currentById.has(studentId));
    if (missing.length) return { synced: false, reason: `summary-row-missing:${missing.join(',')}` };
    const patchedRows = currentRows.map(row => {
      const studentId = String(row?.studentId || row?.id || '').trim();
      if (!affectedIds.includes(studentId)) return row;
      return summaryDeltaPatchRow(row, {
        previousSchedule,
        nextSchedule,
        changedEntitlements,
        changedLedgers,
        studentId,
        now
      });
    });
    const version = summaryDeltaVersion(operationId);
    const nextBundle = buildStudentTeachingSummaryBundleRow(patchedRows, version);
    const nextListBundle = buildStudentTeachingSummaryListBundleRow(patchedRows, version);
    const affectedRows = patchedRows.filter(row => affectedIds.includes(String(row?.studentId || row?.id || '').trim()));
    for (const row of affectedRows) {
      const versionedRow = buildVersionedStudentTeachingSummaryRow(row, version);
      await put(tableName, versionedRow.id, versionedRow);
    }
    await put(tableName, nextBundle.id, nextBundle);
    await put(tableName, nextListBundle.id, nextListBundle);
    const nextMeta = buildStudentTeachingSummaryMetaRow({
      ...meta,
      status: STUDENT_TEACHING_SUMMARY_READY,
      generation: Number(meta.generation) + 1 || Date.now(),
      batchId: version,
      activeVersion: version,
      previousActiveVersion: activeVersion,
      sourceTable: String(meta.sourceTable || 'student-teaching-summary'),
      sourceOp: 'schedule-delta',
      sourceId: String(operationId || nextSchedule?.id || previousSchedule?.id || '').trim(),
      sourceSnapshotAt: now.toISOString(),
      completedAt: now.toISOString(),
      rowCount: patchedRows.length,
      checksum: buildStudentTeachingSummaryChecksum(patchedRows)
    });
    nextMeta.previousActiveVersion = activeVersion;
    await put(tableName, STUDENT_TEACHING_SUMMARY_META_ID, nextMeta);
    readyStudentTeachingSummaryRowsCache.clear();
    return {
      synced: true,
      activeVersion: version,
      previousActiveVersion: activeVersion,
      affectedStudentIds: affectedIds,
      rowCount: patchedRows.length
    };
  });
  studentTeachingSummaryDeltaSyncPromises.set(key, run);
  try {
    return await run;
  } catch (error) {
    if (typeof logger?.warn === 'function') logger.warn('[student-teaching-summary] delta sync skipped', error?.message || error);
    return { synced: false, reason: 'sync-failed', error: String(error?.message || error) };
  } finally {
    if (studentTeachingSummaryDeltaSyncPromises.get(key) === run) studentTeachingSummaryDeltaSyncPromises.delete(key);
  }
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
  const verifyLessonDetailSourceVersion = options.verifyLessonDetailSourceVersion !== false;
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
  if (verifyLessonDetailSourceVersion && currentVersion && dataRows.some(row => hasTeachingLessonSnapshot(row) && String(row?.teachingLessonDetailSourceVersion || '').trim() !== currentVersion)) {
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
        let invalidActiveBundleRows = null;
        if (shouldReadBundle && bundle && isStudentTeachingSummaryBundleRow(bundle)) {
          const rows = studentTeachingSummaryBundleLogicalRows(bundle);
          if (summaryDeltaSafeBundleRows(bundle)) {
            writeReadyStudentTeachingSummaryRowsCache(tableName, meta, rows, readOptions);
            return [meta, ...rows].filter(Boolean);
          }
          invalidActiveBundleRows = rows;
          console.warn('[student-teaching-summary] active bundle failed validation', { activeVersion });
        }
        const previousVersion = String(meta?.previousActiveVersion || '').trim();
        if (shouldReadBundle && previousVersion && previousVersion !== activeVersion) {
          const previousBundle = await getCachedRow(tableName, buildStudentTeachingSummaryBundleId(previousVersion)).catch(() => null);
          const previousRows = summaryDeltaSafeBundleRows(previousBundle);
          if (previousRows) {
            const fallbackMeta = {
              ...meta,
              status: STUDENT_TEACHING_SUMMARY_READY,
              batchId: previousVersion,
              activeVersion: previousVersion,
              rowCount: previousRows.length,
              checksum: buildStudentTeachingSummaryChecksum(previousRows)
            };
            writeReadyStudentTeachingSummaryRowsCache(tableName, fallbackMeta, previousRows, readOptions);
            return [fallbackMeta, ...previousRows].filter(Boolean);
          }
        }
        if (invalidActiveBundleRows) return [meta, ...invalidActiveBundleRows].filter(Boolean);
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
          requireReadyStudentTeachingSummaryRows([meta, ...bundleRows], { verifyChecksum: false, verifyLessonDetailSourceVersion: false });
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
      const previousVersion = String(meta?.previousActiveVersion || '').trim();
      if (previousVersion && previousVersion !== activeVersion) {
        const previousBundle = await getCachedRow(tableName, buildStudentTeachingSummaryListBundleId(previousVersion)).catch(() => null);
        const previousRows = studentTeachingSummaryListBundleLogicalRows(previousBundle);
        if (isStudentTeachingSummaryListBundleRow(previousBundle)
          && String(previousBundle.publishVersion || '').trim() === previousVersion
          && String(previousBundle.schemaVersion || '').trim() === STUDENT_TEACHING_SUMMARY_LIST_BUNDLE_SCHEMA_VERSION
          && Number(previousBundle.rowCount) === previousRows.length
          && expectedCount === previousRows.length
          && String(previousBundle.checksum || '').trim() === buildStudentTeachingSummaryChecksum(previousRows)) {
          requireReadyStudentTeachingSummaryRows([meta, ...previousRows], { verifyChecksum: false, verifyLessonDetailSourceVersion: false });
          return previousRows;
        }
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
  upsertStudentProfileIntoTeachingSummary,
  deleteStudentFromTeachingSummary,
  syncStudentTeachingSummaryDelta,
  studentTeachingSummaryBundleLogicalRows,
  studentTeachingSummaryRowsToDeleteAfterPublish,
  rollbackStudentTeachingSummaryPublish,
  buildStudentTeachingSummaryChecksum,
  requireReadyStudentTeachingSummaryRows,
  readReadyStudentTeachingSummaryRows,
  readReadyStudentTeachingSummaryListRows
};
