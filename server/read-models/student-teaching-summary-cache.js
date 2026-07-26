const { buildCustomerLifecycleRows } = require('./customer-lifecycle.js');
const { buildStudentTeachingSummaryRows } = require('./platform-metrics.js');

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

  function queueStudentTeachingSummaryRefresh(table, meta = {}) {
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
    const [leads, students, purchases, entitlements, entitlementLedger, schedule, membershipBenefitLedger, feedbacks] = await Promise.all([
      T_LEADS ? getCachedScan(T_LEADS, { fresh: true }).catch(() => []) : Promise.resolve([]),
      getCachedScan(T_STUDENTS, { fresh: true }).catch(() => []),
      getCachedScan(T_PURCHASES, { fresh: true }).catch(() => []),
      getCachedScan(T_ENTITLEMENTS, { fresh: true }).catch(() => []),
      getCachedScan(T_ENTITLEMENT_LEDGER, { fresh: true }).catch(() => []),
      T_SCHEDULE ? getCachedScan(T_SCHEDULE, { fresh: true }).catch(() => []) : Promise.resolve([]),
      T_MEMBERSHIP_BENEFIT_LEDGER ? getCachedScan(T_MEMBERSHIP_BENEFIT_LEDGER, { fresh: true }).catch(() => []) : Promise.resolve([]),
      T_FEEDBACKS ? getCachedScan(T_FEEDBACKS, { fresh: true }).catch(() => []) : Promise.resolve([])
    ]);
    const data = { leads, students, purchases, entitlements, entitlementLedger, schedule, membershipBenefitLedger, feedbacks };
    const customerLifecycleRows = buildCustomerLifecycleRows(data);
    const rows = buildStudentTeachingSummaryRows(customerLifecycleRows, data);
    const wantedIds = new Set(uniqueStudentIds(studentIds));
    const targetRows = wantedIds.size ? rows.filter(row => wantedIds.has(String(row.studentId || row.id || ''))) : rows;
    for (const row of targetRows) await put(T_STUDENT_TEACHING_SUMMARY, row.id, row);
    if (wantedIds.size) {
      const writtenIds = new Set(targetRows.map(row => String(row.id || '')).filter(Boolean));
      for (const id of [...wantedIds].filter(id => !writtenIds.has(id))) await del(T_STUDENT_TEACHING_SUMMARY, id).catch(() => null);
    } else if (del) {
      const existing = await getCachedScan(T_STUDENT_TEACHING_SUMMARY, { fresh: true }).catch(() => []);
      const nextIds = new Set(rows.map(row => String(row.id || '')).filter(Boolean));
      for (const row of existing.filter(row => row?.id && !nextIds.has(String(row.id)))) await del(T_STUDENT_TEACHING_SUMMARY, row.id).catch(() => null);
    }
    return targetRows;
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
      logger.warn('[student-teaching-summary] refresh failed', err);
    }
  }

  return {
    queueStudentTeachingSummaryRefresh,
    refreshStudentTeachingSummaryRows,
    flushStudentTeachingSummaryRefresh,
    sourceTables
  };
}

module.exports = { createStudentTeachingSummaryCache };
