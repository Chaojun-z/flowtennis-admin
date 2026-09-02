const crypto = require('crypto');
const { buildCustomerLifecycleRows } = require('./customer-lifecycle.js');
const businessTaxonomy = require('../../public/assets/scripts/core/business-taxonomy.js');
const { normalizeCampusValue } = require('../../public/assets/scripts/core/campus.js');

const TEACHING_LESSON_DETAIL_SOURCE_VERSION = 'lesson-record-v4';

function text(value) {
  return String(value || '').trim();
}

function cleanDisplayName(value) {
  return text(value).replace(/^[\s、，,;；/|｜]+|[\s、，,;；/|｜]+$/g, '').trim();
}

function nonPersonIdentityName(value) {
  const name = cleanDisplayName(value).replace(/\s+/g, '');
  if (!name) return false;
  if (['随到随学', '随到随学小班课', '多球课', '零基础'].includes(name)) return true;
  return /畅打/.test(name);
}

function nonPersonProfile(row = {}) {
  return !text(row.phone) && nonPersonIdentityName(row.displayName || row.name || row.studentName || row.wechatName);
}

function hasOwn(row = {}, field = '') {
  return !!row && Object.prototype.hasOwnProperty.call(row, field);
}

function ownText(row = {}, field = '') {
  return hasOwn(row, field) ? text(row[field]) : '';
}

function hiddenStudentProfile(row = {}) {
  const status = text(row.status);
  return ['merged', 'archived', 'deleted', 'inactive'].includes(status)
    || !!text(row.mergedIntoStudentId)
    || !!text(row.deletedAt)
    || !!text(row.archivedAt)
    || nonPersonProfile(row);
}

function campusKey(value) {
  return normalizeCampusValue(text(value));
}

function round(value, digits = 1) {
  const base = 10 ** digits;
  return Math.round((Number(value) || 0) * base) / base;
}

function money(value) {
  return Math.round((Number(value) || 0) * 100) / 100;
}

function moneyText(value) {
  const amount = money(value);
  if (!amount) return '¥0';
  return `¥${amount.toLocaleString('zh-CN', { maximumFractionDigits: 2 })}`;
}

function parseArr(value) {
  if (Array.isArray(value)) return value;
  if (typeof value === 'string' && value) {
    try {
      const parsed = JSON.parse(value);
      return Array.isArray(parsed) ? parsed : [];
    } catch {
      return [];
    }
  }
  return [];
}

function rowId(row = {}) {
  return text(row.id || row.leadId);
}

function leadIdentityName(value) {
  return text(value)
    .replace(/1[3-9]\d{9}/g, '')
    .toLowerCase()
    .replace(/\s+/g, '')
    .replace(/[·.。_\-\/|｜，,;；]/g, '');
}

function leadDedupPhone(row = {}) {
  const direct = text(row.phone).replace(/\s+/g, '');
  if (direct) return direct;
  const match = text(row.displayName || row.wechatName || row.name).match(/1[3-9]\d{9}/);
  return match ? match[0] : '';
}

function leadCanonicalNameKey(row = {}) {
  const phone = leadDedupPhone(row);
  if (phone) return `phone:${phone}`;
  const name = leadIdentityName(row.wechatName || row.displayName || row.name);
  return name ? `name:${name}` : `id:${rowId(row)}`;
}

function leadDateMs(value) {
  const parsed = Date.parse(text(value).replace(' ', 'T'));
  return Number.isFinite(parsed) ? parsed : Number.MAX_SAFE_INTEGER;
}

function leadStageRank(stage = '') {
  const value = text(stage);
  const order = {
    '已成交': 5,
    '已体验待成交': 4,
    '已约体验': 3,
    '跟进中': 2,
    '新线索': 1,
    '已流失': 0
  };
  return order[value] ?? 1;
}

function mergeLeadPoolGroup(rows = []) {
  const list = rows.filter(Boolean);
  if (!list.length) return null;
  const primary = [...list].sort((a, b) => (
    Number(!!a.isLifecycleSynthetic) - Number(!!b.isLifecycleSynthetic) ||
    leadDateMs(a.leadDate || a.createdAt) - leadDateMs(b.leadDate || b.createdAt) ||
    text(a.id).localeCompare(text(b.id))
  ))[0];
  const merged = { ...primary };
  const bestStage = [...list].sort((a, b) => leadStageRank(b.leadStage) - leadStageRank(a.leadStage))[0];
  const bestDeal = list.map(row => text(row.dealType || row.conversionType)).find(Boolean);
  merged._mergedLeadIds = [...new Set(list.map(row => text(row.id || row.sourceLeadId || row.leadId)).filter(Boolean))];
  list.forEach(row => {
    Object.entries(row).forEach(([key, value]) => {
      if (value === undefined || value === null || value === '') return;
      if (key === 'id' || key === 'sourceLeadId' || key === 'leadId' || key === 'createdAt') return;
      if (typeof value === 'boolean') {
        merged[key] = !!merged[key] || value;
        return;
      }
      if (typeof value === 'number') {
        merged[key] = Math.max(Number(merged[key]) || 0, value);
        return;
      }
      if (!text(merged[key]) || text(merged[key]) === '未知' || text(merged[key]) === 'none') {
        merged[key] = value;
      }
    });
  });
  merged.leadStage = text(bestStage?.leadStage || merged.leadStage);
  merged.systemStatus = text(bestStage?.systemStatus || merged.systemStatus || merged.leadStage);
  merged.dealType = bestDeal || text(merged.dealType);
  merged.conversionType = bestDeal || text(merged.conversionType);
  return merged;
}

function mergeDuplicateLeadPoolRows(rows = []) {
  const groups = new Map();
  (rows || []).forEach(row => {
    const key = leadCanonicalNameKey(row);
    const group = groups.get(key) || [];
    group.push(row);
    groups.set(key, group);
  });
  return [...groups.values()].map(mergeLeadPoolGroup).filter(Boolean);
}

function isConvertedStage(stage = '') {
  return text(stage) === '已成交';
}

function activeStatus(row = {}) {
  const status = text(row.status || row.systemStatus || 'active');
  return !['merged', 'voided', 'refunded', 'deleted', 'inactive', 'cancelled', 'canceled', '已合并', '已作废', '已删除', '已取消'].includes(status);
}

function rowHasStudent(row = {}, studentId = '') {
  const id = text(studentId);
  if (!id) return false;
  if (text(row.studentId) === id) return true;
  return parseArr(row.studentIds).map(text).includes(id);
}

function courseRowIsTrial(row = {}) {
  const normalized = businessTaxonomy.normalizeCourseType(row);
  const value = [row.courseType, row.packageCourseType, row.type, row.productType, row.experienceType, row.courseTypeLevel2, row.packageName, row.productName, row.name].filter(Boolean).join(' ');
  return normalized.level1 === '体验课' || /体验/.test(value);
}

function courseRowIsCompanion(row = {}) {
  const normalized = businessTaxonomy.normalizeCourseType(row);
  const value = [row.courseType, row.packageCourseType, row.type, row.productType, row.courseTypeLevel2, row.packageName, row.productName, row.name, row.scheduleSource].filter(Boolean).join(' ');
  return normalized.level1 === '陪打' || /陪打/.test(value);
}

function courseRowIsCourtFee(row = {}) {
  const value = [
    row.businessType,
    row.displayBusinessType,
    row.incomeType,
    row.courseType,
    row.packageCourseType,
    row.type,
    row.productType,
    row.courseTypeLevel2,
    row.packageName,
    row.productName,
    row.name
  ].filter(Boolean).join(' ');
  return /订场|场地|field\s*fee/i.test(value);
}

function coursePaymentAmount(row = {}) {
  const fields = ['amountPaid', 'finalAmount', 'actualAmount', 'paidAmount', 'payAmount', 'amount', 'cashDelta'];
  const hit = fields.find(field => row[field] !== undefined && row[field] !== null && text(row[field]) !== '');
  return hit ? Math.abs(Number(row[hit]) || 0) : 0;
}

function coursePurchaseKey(row = {}) {
  return text(row.purchaseId || row.id) || [text(row.studentId), text(row.purchaseDate || row.createdAt), coursePaymentAmount(row), text(row.packageName || row.courseType)].join('|');
}

function formalPurchaseRows(data = {}) {
  const rows = new Map();
  (data.purchases || [])
    .filter(row => activeStatus(row) && !courseRowIsTrial(row) && coursePaymentAmount(row) > 0)
    .forEach(row => rows.set(coursePurchaseKey(row), row));
  (data.entitlements || [])
    .filter(row => activeStatus(row) && !courseRowIsTrial(row) && coursePaymentAmount(row) > 0 && !rows.has(coursePurchaseKey(row)))
    .forEach(row => rows.set(coursePurchaseKey(row), row));
  return [...rows.values()];
}

function activeFormalPackageStudentCount(data = {}) {
  const formalIds = new Set((data.customerLifecycleRows || [])
    .filter(row => text(row.studentStage) === 'formal')
    .map(row => text(row.studentId))
    .filter(Boolean));
  const ids = new Set();
  (data.entitlements || []).forEach(row => {
    const studentId = text(row.studentId);
    if (!formalIds.has(studentId)) return;
    if (!activeStatus(row) || courseRowIsTrial(row)) return;
    if ((Number(row.remainingLessons) || 0) <= 0 || (Number(row.totalLessons) || 0) <= 0) return;
    ids.add(studentId);
  });
  return ids.size;
}

function formalPackageRecognizedAmount(data = {}) {
  const entitlementsById = new Map((data.entitlements || []).map(row => [text(row.id), row]));
  const purchasesById = new Map((data.purchases || []).map(row => [text(row.id), row]));
  return money((data.entitlementLedger || []).reduce((sum, row) => {
    const delta = Number(row.lessonDelta) || 0;
    if (!delta) return sum;
    const entitlement = entitlementsById.get(text(row.entitlementId)) || {};
    const purchase = purchasesById.get(text(row.purchaseId || entitlement.purchaseId)) || {};
    if (!activeStatus(entitlement) || !activeStatus(purchase) || courseRowIsTrial(entitlement) || courseRowIsTrial(purchase)) return sum;
    if (row.recognizedRevenueDelta !== undefined && text(row.recognizedRevenueDelta) !== '') return sum + Number(row.recognizedRevenueDelta || 0);
    const totalLessons = Math.max(1, Number(entitlement.totalLessons) || Number(purchase.packageLessons) || Math.abs(delta) || 1);
    const amount = coursePaymentAmount(purchase);
    if (!amount) return sum;
    return sum + money(amount / totalLessons * Math.abs(delta) * (delta > 0 ? -1 : 1));
  }, 0));
}

function lessonQty(value) {
  const num = Number(value) || 0;
  return Number.isInteger(num) ? String(num) : String(round(num, 1));
}

function scheduleDurationLessonUnits(row = {}) {
  const start = Date.parse(text(row.startTime).replace(' ', 'T'));
  const end = Date.parse(text(row.endTime).replace(' ', 'T'));
  if (!Number.isFinite(start) || !Number.isFinite(end) || end <= start) return 0;
  return Math.max(0, round((end - start) / 3600000, 1));
}

function scheduleLessonUnits(row = {}) {
  const lessonText = [row.courseType, row.standardCourseType, row.packageCourseType, row.type, row.experienceType, row.courseTypeLevel2, row.packageName, row.productName, row.name].filter(Boolean).join(' ');
  if (/小班|1v4/.test(lessonText)) return 1;
  const count = Number(row.lessonCount);
  const durationUnits = scheduleDurationLessonUnits(row);
  if (Number.isFinite(count) && count > 0) return Math.max(count, durationUnits);
  return durationUnits || 1;
}

function dateOnly(value) {
  return text(value).slice(0, 10);
}

function teachingBaseDateKey(now = new Date()) {
  return now instanceof Date
    ? `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-${String(now.getDate()).padStart(2, '0')}`
    : dateOnly(now);
}

function teachingDateOnOrBeforeNow(value = '', now = new Date()) {
  const day = dateOnly(value);
  const base = teachingBaseDateKey(now);
  return !!day && !!base && day <= base;
}

function teachingDateTimeOnOrBeforeNow(value = '', now = new Date()) {
  const raw = text(value);
  if (!raw) return false;
  if (!/\d{1,2}:\d{2}/.test(raw)) return teachingDateOnOrBeforeNow(raw, now);
  const target = Date.parse(raw.replace(' ', 'T'));
  const base = now instanceof Date ? now.getTime() : Date.parse(text(now).replace(' ', 'T'));
  if (!Number.isFinite(target) || !Number.isFinite(base)) return teachingDateOnOrBeforeNow(raw, now);
  return target <= base;
}

function teachingDateTimeAfterNow(value = '', now = new Date()) {
  const raw = text(value);
  if (!raw) return false;
  const target = Date.parse(raw.replace(' ', 'T'));
  const base = now instanceof Date ? now.getTime() : Date.parse(text(now).replace(' ', 'T'));
  if (!Number.isFinite(target) || !Number.isFinite(base)) return false;
  return target > base;
}

function scopeDate(value) {
  return text(value).replace(/\//g, '-').replace(/\./g, '-').slice(0, 10);
}

function scopeMatchesDate(value, scope = {}) {
  const day = scopeDate(value);
  const start = scopeDate(scope.startDate);
  const end = scopeDate(scope.endDate);
  if (start && day && day < start) return false;
  if (end && day && day > end) return false;
  return true;
}

function scopeCampusValues(row = {}) {
  return [
    row.campus,
    row.campusId,
    row.campusName,
    ...parseArr(row.campusIds)
  ].map(campusKey).filter(Boolean);
}

function scopeMatchesCampus(row = {}, scope = {}) {
  const expectedValues = [scope.campus, scope.campusCode, scope.campusName].map(campusKey).filter(value => value && value !== 'all');
  if (!expectedValues.length) return true;
  const actualValues = scopeCampusValues(row);
  return expectedValues.some(value => actualValues.includes(value));
}

function lifecycleScopeDate(row = {}) {
  return row.leadDate || row.createdAt || row.updatedAt || row.convertedAt || row.formalConvertedAt || row.packagePurchaseDate || row.lastLessonDate;
}

function rowScopeDate(row = {}) {
  return row.leadDate || row.purchaseDate || row.relatedDate || row.startTime || row.createdAt || row.updatedAt || row.enrollDate || row.registerDate || row.joinDate;
}

function rowInMetricScope(row = {}, scope = {}) {
  return scopeMatchesCampus(row, scope) && scopeMatchesDate(rowScopeDate(row), scope);
}

function buildScopedLifecycleSource(data = {}, scope = {}) {
  const customerLifecycleRows = Array.isArray(data.customerLifecycleRows) && data.customerLifecycleRows.length
    ? data.customerLifecycleRows
    : buildCustomerLifecycleRows(data);
  const scopedLifecycleRows = customerLifecycleRows.filter(row => (
    scopeMatchesCampus(row, scope) && scopeMatchesDate(lifecycleScopeDate(row), scope)
  ));
  const studentIds = new Set(scopedLifecycleRows.map(row => text(row.studentId)).filter(Boolean));
  const leadIds = new Set(scopedLifecycleRows.map(row => text(row.sourceLeadId || row.leadId)).filter(Boolean));
  const entitlementsById = new Map((data.entitlements || []).map(row => [text(row.id), row]));
  const purchasesById = new Map((data.purchases || []).map(row => [text(row.id), row]));
  const schedulesById = new Map((data.schedule || []).map(row => [text(row.id), row]));
  const scopedPurchaseIds = new Set((data.purchases || [])
    .filter(row => studentIds.has(text(row.studentId)) && scopeMatchesDate(rowScopeDate(row), scope))
    .map(row => text(row.id)).filter(Boolean));
  return {
    ...data,
    leads: (data.leads || []).filter(row => leadIds.has(text(row.id || row.leadId)) || rowInMetricScope(row, scope)),
    students: (data.students || []).filter(row => studentIds.has(text(row.id || row.studentId))),
    purchases: (data.purchases || []).filter(row => studentIds.has(text(row.studentId)) && scopeMatchesDate(rowScopeDate(row), scope)),
    entitlements: (data.entitlements || []).filter(row => studentIds.has(text(row.studentId)) && (!text(row.purchaseId) || scopedPurchaseIds.has(text(row.purchaseId)))),
    entitlementLedger: (data.entitlementLedger || []).filter(row => entitlementLedgerStudentIds(row, entitlementsById, purchasesById, schedulesById).some(id => studentIds.has(id)) && scopeMatchesDate(rowScopeDate(row), scope)),
    schedule: (data.schedule || []).filter(row => {
      const ids = parseArr(row.studentIds).concat(text(row.studentId)).map(text).filter(Boolean);
      return ids.some(id => studentIds.has(id)) && scopeMatchesDate(rowScopeDate(row), scope);
    }),
    customerLifecycleRows: scopedLifecycleRows
  };
}

function dateTimeText(row = {}, fallback = '') {
  const start = text(row.startTime || fallback || row.relatedDate || row.createdAt || row.scheduleTime);
  const end = text(row.endTime);
  const date = start.slice(0, 10);
  const startTime = start.slice(11, 16);
  const inlineRange = !end ? start.match(/\d{4}-\d{2}-\d{2}\s+\d{1,2}:\d{2}\s*[-~至到]\s*(\d{1,2}:\d{2})/) : null;
  const endTime = end.slice(11, 16) || (inlineRange ? inlineRange[1] : '');
  if (!date) return '';
  if (startTime && endTime) return `${date} ${startTime}-${endTime}`;
  if (startTime) return `${date} ${startTime}`;
  return date;
}

function ledgerFallbackDateTime(row = {}) {
  const date = dateOnly(row.relatedDate || row.sourceDate || row.createdAt || row.scheduleTime);
  if (!date) return text(row.scheduleTime || row.createdAt);
  const band = text(row.sourceTimeBand || row.timeBand || row.scheduleTime);
  const match = band.match(/(\d{1,2}:\d{2})\s*[-~至到]\s*(\d{1,2}:\d{2})/);
  if (match) return `${date} ${match[1]}-${match[2]}`;
  const single = band.match(/(\d{1,2}:\d{2})/);
  if (single) return `${date} ${single[1]}`;
  return date;
}

function scheduleMatchesLedgerRow(schedule = {}, ledger = {}, studentIds = []) {
  if (!schedule || !ledger) return false;
  const ledgerDate = dateOnly(ledger.relatedDate || ledger.sourceDate || ledger.scheduleTime || ledger.createdAt);
  const scheduleDate = dateOnly(schedule.startTime || schedule.endTime || schedule.createdAt);
  if (!ledgerDate || !scheduleDate || ledgerDate !== scheduleDate) return false;
  const scheduleStudentIds = parseArr(schedule.studentIds).concat(text(schedule.studentId)).map(text).filter(Boolean);
  if (studentIds.length && scheduleStudentIds.length && !studentIds.some(id => scheduleStudentIds.includes(id))) return false;
  const ledgerCoach = text(ledger.coach || ledger.coachName);
  const scheduleCoach = text(schedule.coach || schedule.coachName);
  if (ledgerCoach && scheduleCoach && ledgerCoach !== scheduleCoach) return false;
  return true;
}

function findScheduleForLedgerRow(ledger = {}, schedulesById = new Map(), scheduleRows = [], studentIds = []) {
  const byId = schedulesById.get(text(ledger.scheduleId));
  if (byId) return byId;
  return (scheduleRows || []).find(row => scheduleMatchesLedgerRow(row, ledger, studentIds)) || {};
}

function teachingLessonRecordMetaParts(row = {}) {
  return [
    [text(row.campus || row.campusName), text(row.venue || row.sourceVenue || row.courtName || row.court)].filter(Boolean).join(' '),
    text(row.coach || row.coachName || row.primaryCoach),
    courseTypeText(row)
  ].filter(Boolean);
}

function courseTypeText(row = {}) {
  return text(row.courseType || row.standardCourseType || row.packageCourseType || row.type || row.courseTypeLevel2 || '课程');
}

function packageUnitLabel(row = {}) {
  const unit = text(row.unit || row.balanceUnit || row.lessonUnit);
  if (unit) return unit;
  const lessonText = [row.courseType, row.standardCourseType, row.packageCourseType, row.type, row.experienceType, row.courseTypeLevel2, row.packageName, row.productName, row.name].filter(Boolean).join(' ');
  if (/小班|1v4/.test(lessonText)) return '次';
  if (/专项课/.test(lessonText)) return '次';
  return '节';
}

function packageStatusText(row = {}, purchase = {}) {
  const status = text(row.status || row.systemStatus || purchase.status || purchase.systemStatus);
  if (['voided', 'cancelled', 'canceled', 'deleted', 'inactive', '已作废', '作废'].includes(status)) return '已作废';
  if ((Number(row.remainingLessons) || 0) <= 0) return '已用完';
  return '正常';
}

function packageAmount(row = {}, purchase = {}, fieldNames = []) {
  const source = { ...purchase, ...row };
  const hit = fieldNames.find(field => source[field] !== undefined && source[field] !== null && text(source[field]) !== '');
  return hit ? money(source[hit]) : 0;
}

function teachingPackageDate(row = {}, purchase = {}) {
  return text(row.purchaseDate || row.businessDate || row.createdAt || purchase.purchaseDate || purchase.createdAt).slice(0, 10);
}

function teachingPackageName(row = {}, purchase = {}) {
  return text(row.packageName || row.productName || row.name || purchase.packageName || purchase.productName || purchase.name || row.courseType || purchase.courseType || '课包');
}

function entitlementLedgerOwnerStudentId(row = {}, entitlementsById = new Map(), purchasesById = new Map()) {
  const entitlement = entitlementsById.get(text(row.entitlementId)) || {};
  const purchase = purchasesById.get(text(row.purchaseId || entitlement.purchaseId)) || {};
  return text(entitlement.studentId || purchase.studentId || row.studentId);
}

function entitlementLedgerStudentIds(row = {}, entitlementsById = new Map(), purchasesById = new Map(), schedulesById = new Map()) {
  const schedule = schedulesById.get(text(row.scheduleId)) || {};
  const scheduleIds = teachingScheduleStudentIds(schedule);
  const explicitIds = teachingScheduleStudentIds(row);
  const relationIds = [row.packageOwnerStudentId, row.ownerStudentId, row.usedByStudentId, row.authorizedStudentId].map(text).filter(Boolean);
  if (relationIds.length) {
    return [...new Set([...scheduleIds, ...explicitIds, ...relationIds].filter(Boolean))];
  }
  if (scheduleIds.length === 1) return scheduleIds;
  if (explicitIds.length) return explicitIds;
  const ownerId = entitlementLedgerOwnerStudentId(row, entitlementsById, purchasesById);
  return ownerId ? [ownerId] : [];
}

function entitlementLedgerStudentId(row = {}, entitlementsById = new Map(), purchasesById = new Map(), schedulesById = new Map()) {
  return entitlementLedgerStudentIds(row, entitlementsById, purchasesById, schedulesById)[0] || '';
}

function studentDisplayNameById(studentId = '', studentsById = new Map()) {
  const row = studentsById.get(text(studentId)) || {};
  return text(row.name || row.studentName || row.displayName);
}

function ledgerRelationText({ currentStudentId = '', actualStudentIds = [], ownerStudentId = '', studentsById = new Map() } = {}) {
  const currentId = text(currentStudentId);
  const ownerId = text(ownerStudentId);
  if (!currentId || !ownerId) return '';
  const ownerName = studentDisplayNameById(ownerId, studentsById) || '课包所有人';
  const actualNames = actualStudentIds.map(id => studentDisplayNameById(id, studentsById)).filter(Boolean);
  if (actualStudentIds.includes(ownerId) && currentId !== ownerId && actualStudentIds.includes(currentId)) return `使用 ${ownerName} 的课包`;
  if (actualStudentIds.includes(ownerId)) return '';
  if (currentId === ownerId) return `${actualNames.join('、') || '其他学员'} 使用了 ${ownerName} 的课包`;
  if (actualStudentIds.includes(currentId)) return `使用 ${ownerName} 的课包`;
  return '';
}

function buildTeachingStudentPackageFieldMap(data = {}, { includeTrial = false } = {}) {
  const purchasesById = new Map((data.purchases || []).map(row => [text(row.id), row]));
  const entitlementsByStudent = new Map();
  const linkedPurchaseIds = new Set();
  (data.entitlements || [])
    .filter(row => activeStatus(row) && courseRowIsTrial(row) === includeTrial && (Number(row.totalLessons) || 0) > 0)
    .forEach(row => {
      const studentId = text(row.studentId);
      if (!studentId) return;
      linkedPurchaseIds.add(text(row.purchaseId));
      const purchase = purchasesById.get(text(row.purchaseId)) || {};
      const list = entitlementsByStudent.get(studentId) || [];
      list.push({
        entitlementId: text(row.id),
        purchaseId: text(row.purchaseId),
        packageId: text(row.packageId || row.originalPackageId || purchase.packageId || purchase.originalPackageId),
        packageName: teachingPackageName(row, purchase),
        remainingLessons: Number(row.remainingLessons) || 0,
        totalLessons: Number(row.totalLessons) || 0,
        usedLessons: Math.max(0, Number(row.usedLessons) || ((Number(row.totalLessons) || 0) - (Number(row.remainingLessons) || 0))),
        purchaseDate: teachingPackageDate(row, purchase),
        statusText: packageStatusText(row, purchase),
        unit: packageUnitLabel(row),
        systemAmount: packageAmount(row, purchase, ['systemAmount', 'packagePrice', 'originalAmount', 'amount']),
        paidAmount: packageAmount(row, purchase, ['finalAmount', 'amountPaid', 'actualAmount', 'paidAmount', 'amount']),
        ownerCoach: text(row.ownerCoach || purchase.ownerCoach)
      });
      entitlementsByStudent.set(studentId, list);
    });
  (data.purchases || [])
    .filter(row => activeStatus(row) && courseRowIsTrial(row) === includeTrial && !linkedPurchaseIds.has(text(row.id)))
    .forEach(row => {
      const studentId = text(row.studentId);
      const totalLessons = Number(row.totalLessons || row.packageLessons);
      if (!studentId || !Number.isFinite(totalLessons) || totalLessons <= 0) return;
      const list = entitlementsByStudent.get(studentId) || [];
      list.push({
        entitlementId: '',
        purchaseId: text(row.id),
        packageId: text(row.packageId || row.originalPackageId),
        packageName: teachingPackageName(row, row),
        remainingLessons: Number(row.remainingLessons) || totalLessons,
        totalLessons,
        usedLessons: Math.max(0, totalLessons - (Number(row.remainingLessons) || totalLessons)),
        purchaseDate: teachingPackageDate(row, row),
        statusText: packageStatusText(row, row),
        unit: packageUnitLabel(row),
        systemAmount: packageAmount(row, row, ['systemAmount', 'packagePrice', 'originalAmount', 'amount']),
        paidAmount: packageAmount(row, row, ['finalAmount', 'amountPaid', 'actualAmount', 'paidAmount', 'amount']),
        ownerCoach: text(row.ownerCoach)
      });
      entitlementsByStudent.set(studentId, list);
    });
  const details = new Map();
  entitlementsByStudent.forEach((rows, studentId) => {
    const packageListRows = rows.sort((a, b) => text(b.purchaseDate).localeCompare(text(a.purchaseDate)));
    const activeRows = includeTrial ? packageListRows : packageListRows.filter(row => (Number(row.remainingLessons) || 0) > 0);
    const displayRows = includeTrial || activeRows.length ? activeRows : packageListRows.slice(0, 1);
    const detailRows = includeTrial ? displayRows : packageListRows;
    const ratioText = detailRows
      .map(row => `${lessonQty(row.remainingLessons)}/${lessonQty(row.totalLessons)}`)
      .filter(Boolean)
      .join(',');
    const remaining = displayRows.reduce((sum, row) => sum + (Number(row.remainingLessons) || 0), 0);
    const total = displayRows.reduce((sum, row) => sum + (Number(row.totalLessons) || 0), 0);
    const detailRemaining = detailRows.reduce((sum, row) => sum + (Number(row.remainingLessons) || 0), 0);
    const detailTotal = detailRows.reduce((sum, row) => sum + (Number(row.totalLessons) || 0), 0);
    const packageDates = displayRows.map(row => text(row.purchaseDate)).filter(Boolean).sort();
    const ownerCoachRows = detailRows
      .filter(row => text(row.ownerCoach))
      .sort((a, b) => text(b.purchaseDate).localeCompare(text(a.purchaseDate)));
    details.set(studentId, {
      packageListRows: displayRows,
      detailPackageOrderRows: detailRows,
      detailPackageBalanceRemaining: detailRemaining,
      detailPackageBalanceTotal: detailTotal,
      detailPackageBalanceText: detailTotal > 0 ? `${lessonQty(detailRemaining)}/${lessonQty(detailTotal)}` : '-',
      detailPackageBalancePercent: detailTotal > 0 ? Math.max(0, Math.min(100, Math.round(detailRemaining / detailTotal * 100))) : 0,
      detailPackageProgressText: ratioText || '-',
      packageListText: displayRows.map(row => `${row.packageName} ${lessonQty(row.remainingLessons)}/${lessonQty(row.totalLessons)}`).join('\n') || '-',
      packageBalanceRemaining: remaining,
      packageBalanceTotal: total,
      packageBalanceText: total > 0 ? `${lessonQty(remaining)}/${lessonQty(total)}` : '-',
      packageBalancePercent: total > 0 ? Math.max(0, Math.min(100, Math.round(remaining / total * 100))) : 0,
      packagePurchaseDate: packageDates[0] || '',
      ownerCoach: text(ownerCoachRows[0]?.ownerCoach)
    });
  });
  return details;
}

function reconcileTeachingPackageFields(packageFields = {}, completedLessons = 0, directFormalCompleted = 0) {
  const rows = Array.isArray(packageFields.detailPackageOrderRows) ? packageFields.detailPackageOrderRows : [];
  const formalRows = rows.filter(row => !courseRowIsTrial(row) && !courseRowIsCompanion(row) && (Number(row.totalLessons) || 0) > 0);
  const total = formalRows.reduce((sum, row) => sum + (Number(row.totalLessons) || 0), 0);
  if (!total) return packageFields;
  const packageCompleted = Math.max(0, Math.min(total, round((Number(completedLessons) || 0) - (Number(directFormalCompleted) || 0), 1)));
  const currentConsumed = teachingStudentPackageConsumedUnits(packageFields);
  if (!(packageCompleted > (Number(currentConsumed) || 0))) return packageFields;
  const ordered = [...formalRows].sort((a, b) => (
    text(a.purchaseDate).localeCompare(text(b.purchaseDate))
    || text(a.purchaseId || a.entitlementId).localeCompare(text(b.purchaseId || b.entitlementId))
  ));
  const remainingByKey = new Map();
  let usedLeft = packageCompleted;
  ordered.forEach(row => {
    const rowTotal = Number(row.totalLessons) || 0;
    const rowUsed = Math.max(0, Math.min(rowTotal, usedLeft));
    usedLeft = Math.max(0, round(usedLeft - rowUsed, 1));
    const key = text(row.entitlementId || row.purchaseId || row.packageName);
    remainingByKey.set(key, {
      remainingLessons: round(rowTotal - rowUsed, 1),
      usedLessons: round(rowUsed, 1)
    });
  });
  const adjustedRows = rows.map(row => {
    if (courseRowIsTrial(row) || courseRowIsCompanion(row)) return row;
    const key = text(row.entitlementId || row.purchaseId || row.packageName);
    const adjusted = remainingByKey.get(key);
    if (!adjusted) return row;
    return {
      ...row,
      ...adjusted,
      statusText: adjusted.remainingLessons <= 0 ? '已用完' : (text(row.statusText) || '正常')
    };
  });
  const activeRows = adjustedRows.filter(row => !courseRowIsTrial(row) && !courseRowIsCompanion(row) && (Number(row.remainingLessons) || 0) > 0);
  const displayRows = activeRows.length ? activeRows : adjustedRows.filter(row => !courseRowIsTrial(row) && !courseRowIsCompanion(row)).slice(0, 1);
  const detailRemaining = adjustedRows
    .filter(row => !courseRowIsTrial(row) && !courseRowIsCompanion(row))
    .reduce((sum, row) => sum + (Number(row.remainingLessons) || 0), 0);
  const detailTotal = adjustedRows
    .filter(row => !courseRowIsTrial(row) && !courseRowIsCompanion(row))
    .reduce((sum, row) => sum + (Number(row.totalLessons) || 0), 0);
  const remaining = displayRows.reduce((sum, row) => sum + (Number(row.remainingLessons) || 0), 0);
  const displayTotal = displayRows.reduce((sum, row) => sum + (Number(row.totalLessons) || 0), 0);
  const ownerCoachRows = adjustedRows
    .filter(row => !courseRowIsTrial(row) && !courseRowIsCompanion(row) && text(row.ownerCoach))
    .sort((a, b) => text(b.purchaseDate).localeCompare(text(a.purchaseDate)));
  return {
    ...packageFields,
    packageListRows: displayRows,
    detailPackageOrderRows: adjustedRows,
    detailPackageBalanceRemaining: round(detailRemaining, 1),
    detailPackageBalanceTotal: round(detailTotal, 1),
    detailPackageBalanceText: detailTotal > 0 ? `${lessonQty(detailRemaining)}/${lessonQty(detailTotal)}` : '-',
    detailPackageBalancePercent: detailTotal > 0 ? Math.max(0, Math.min(100, Math.round(detailRemaining / detailTotal * 100))) : 0,
    detailPackageProgressText: adjustedRows.map(row => `${lessonQty(row.remainingLessons)}/${lessonQty(row.totalLessons)}`).filter(Boolean).join(',') || '-',
    packageBalanceRemaining: round(remaining, 1),
    packageBalanceTotal: round(displayTotal, 1),
    packageBalanceText: displayTotal > 0 ? `${lessonQty(remaining)}/${lessonQty(displayTotal)}` : '-',
    packageBalancePercent: displayTotal > 0 ? Math.max(0, Math.min(100, Math.round(remaining / displayTotal * 100))) : 0,
    ownerCoach: text(ownerCoachRows[0]?.ownerCoach || packageFields.ownerCoach)
  };
}

function buildTeachingStudentCompletedLessonMap(data = {}) {
  const entitlementsById = new Map((data.entitlements || []).map(row => [text(row.id), row]));
  const purchasesById = new Map((data.purchases || []).map(row => [text(row.id), row]));
  const schedulesById = new Map((data.schedule || []).map(row => [text(row.id), row]));
  const completedByStudent = new Map();
  const ledgerScheduleStudentKeys = new Set();
  (data.entitlementLedger || []).forEach(row => {
    const delta = Number(row.lessonDelta) || 0;
    if (delta >= 0 || !activeStatus(row)) return;
    const studentIds = entitlementLedgerStudentIds(row, entitlementsById, purchasesById, schedulesById);
    if (!studentIds.length) return;
    const entitlement = entitlementsById.get(text(row.entitlementId)) || {};
    const purchase = purchasesById.get(text(row.purchaseId || entitlement.purchaseId)) || {};
    if (courseRowIsCompanion(row) || courseRowIsCompanion(entitlement) || courseRowIsCompanion(purchase)) return;
    studentIds.forEach(studentId => {
      if (text(row.scheduleId)) ledgerScheduleStudentKeys.add(`${studentId}|${text(row.scheduleId)}`);
      completedByStudent.set(studentId, (completedByStudent.get(studentId) || 0) + Math.abs(delta));
    });
  });
  (data.schedule || [])
    .filter(row => teachingScheduleLessonFact(row, data.now || new Date()))
    .forEach(row => parseArr(row.studentIds).concat(text(row.studentId)).map(text).filter(Boolean).forEach(studentId => {
      if (ledgerScheduleStudentKeys.has(`${studentId}|${text(row.id)}`)) return;
      completedByStudent.set(studentId, (completedByStudent.get(studentId) || 0) + scheduleLessonUnits(row));
    }));
  return completedByStudent;
}

function teachingLessonRowsCompletedUnits(rows = []) {
  return (Array.isArray(rows) ? rows : []).reduce((sum, row) => {
    if (row?.countAsCompletedLesson === false) return sum;
    const delta = Number(row?.lessonDelta);
    if (Number.isFinite(delta) && delta < 0) return sum + Math.abs(delta);
    return sum;
  }, 0);
}

function teachingStudentPackageConsumedUnits(packageFields = {}) {
  const total = Number(packageFields.detailPackageBalanceTotal);
  const remaining = Number(packageFields.detailPackageBalanceRemaining);
  if (Number.isFinite(total) && total > 0 && Number.isFinite(remaining)) {
    return Math.max(0, round(total - remaining, 1));
  }
  const rows = Array.isArray(packageFields.detailPackageOrderRows) ? packageFields.detailPackageOrderRows : [];
  const used = rows
    .filter(row => !courseRowIsTrial(row) && !courseRowIsCompanion(row))
    .reduce((sum, row) => {
      const rowTotal = Number(row.totalLessons);
      const rowRemaining = Number(row.remainingLessons);
      if (!Number.isFinite(rowTotal) || rowTotal <= 0 || !Number.isFinite(rowRemaining)) return sum;
      return sum + Math.max(0, rowTotal - rowRemaining);
    }, 0);
  return used > 0 ? round(used, 1) : null;
}

function teachingStudentDirectFormalLessonUnits(data = {}, studentId = '', now = new Date(), row = {}) {
  return round(teachingStudentDirectFormalLessonRows(data, studentId, now, row)
    .reduce((sum, item) => sum + scheduleLessonUnits(item), 0), 1);
}

function buildTeachingStudentCoursePaidMap(data = {}) {
  const purchasesById = new Map((data.purchases || []).map(row => [text(row.id), row]));
  const purchaseRows = new Map();
  const pushPurchase = row => {
    const studentId = text(row.studentId);
    const amount = coursePaymentAmount(row);
    if (!studentId || !amount || !activeStatus(row) || courseRowIsCompanion(row) || courseRowIsCourtFee(row)) return;
    purchaseRows.set(coursePurchaseKey(row), { studentId, amount });
  };
  (data.purchases || []).forEach(pushPurchase);
  (data.entitlements || []).forEach(row => {
    const purchase = purchasesById.get(text(row.purchaseId)) || {};
    const merged = { ...purchase, ...row, id: text(row.purchaseId || row.id) };
    if (!purchaseRows.has(coursePurchaseKey(merged))) pushPurchase(merged);
  });

  const paidByStudent = new Map();
  purchaseRows.forEach(({ studentId, amount }) => {
    paidByStudent.set(studentId, money((paidByStudent.get(studentId) || 0) + amount));
  });

  const now = data.now || new Date();
  (data.schedule || [])
    .filter(row => activeStatus(row) && teachingScheduleLessonFact(row, now) && !courseRowIsCompanion(row) && !courseRowIsCourtFee(row) && teachingPaymentIsDirect(row))
    .forEach(row => {
      const amount = coursePaymentAmount(row);
      if (!amount) return;
      teachingScheduleStudentIds(row).forEach(studentId => {
        paidByStudent.set(studentId, money((paidByStudent.get(studentId) || 0) + amount));
      });
    });
  return paidByStudent;
}

function buildTeachingStudentLessonDetailMap(data = {}, { includeTrial = false } = {}) {
  const entitlementsById = new Map((data.entitlements || []).map(row => [text(row.id), row]));
  const purchasesById = new Map((data.purchases || []).map(row => [text(row.id), row]));
  const schedulesById = new Map((data.schedule || []).map(row => [text(row.id), row]));
  const feedbackScheduleIds = new Set((data.feedbacks || []).map(row => text(row.scheduleId)).filter(Boolean));
  const scheduleRows = data.schedule || [];
  const studentsById = new Map((data.students || []).map(row => [text(row.id || row.studentId), row]));
  const rowsByStudent = new Map();
  const ledgerScheduleStudentKeys = new Set();
  const ledgerScheduleFactKeys = new Set();
  const ledgersByScheduleId = new Map();
  (data.entitlementLedger || [])
    .filter(row => activeStatus(row) && (Number(row.lessonDelta) || 0) < 0 && text(row.scheduleId))
    .forEach(row => {
      if (!ledgersByScheduleId.has(text(row.scheduleId))) ledgersByScheduleId.set(text(row.scheduleId), row);
    });
  const lessonSectionMarker = (value, unit = '节') => {
    const num = Number(value) || 0;
    if (unit === '次') return Number.isInteger(num) ? String(num) : String(round(num, 1)).replace(/\.0$/, '');
    if (Number.isInteger(num)) return String(num).padStart(2, '0');
    const fixed = String(Math.round(num * 10) / 10);
    const [whole, decimal] = fixed.split('.');
    return `${String(Number(whole) || 0).padStart(2, '0')}.${decimal}`;
  };
  const lessonFactKey = (studentId, row = {}) => [
    text(studentId),
    dateOnly(row.startTime || row.relatedDate || row.scheduleTime || row.createdAt),
    text(row.coach || row.coachName)
  ].join('|');
  const push = (studentId, row) => {
    const id = text(studentId);
    if (!id) return;
    const rows = rowsByStudent.get(id) || [];
    rows.push(row);
    rowsByStudent.set(id, rows);
  };
  const lessonHasFeedback = (scheduleId, row = {}) => !!(
    feedbackScheduleIds.has(text(scheduleId))
    || row.feedbackId
    || row.feedbackAt
    || row.feedbackStatus === '已反馈'
    || row.hasFeedback === true
  );

  (data.entitlementLedger || [])
    .filter(row => activeStatus(row) && (Number(row.lessonDelta) || 0) < 0)
    .filter(row => !dateOnly(ledgerFallbackDateTime(row) || row.relatedDate || row.scheduleTime || row.createdAt)
      || teachingDateOnOrBeforeNow(ledgerFallbackDateTime(row) || row.relatedDate || row.scheduleTime || row.createdAt, data.now || new Date()))
    .forEach(row => {
      const entitlement = entitlementsById.get(text(row.entitlementId)) || {};
      const purchase = purchasesById.get(text(row.purchaseId || entitlement.purchaseId)) || {};
      const studentIds = entitlementLedgerStudentIds(row, entitlementsById, purchasesById, schedulesById);
      if (!studentIds.length) return;
      const ownerStudentId = entitlementLedgerOwnerStudentId(row, entitlementsById, purchasesById);
      const schedule = findScheduleForLedgerRow(row, schedulesById, scheduleRows, studentIds);
      const scheduleTime = text(schedule.startTime || schedule.endTime);
      if (scheduleTime && !teachingDateTimeOnOrBeforeNow(scheduleTime, data.now || new Date())) return;
      const trial = courseRowIsTrial(row) || courseRowIsTrial(entitlement) || courseRowIsTrial(purchase) || courseRowIsTrial(schedule);
      if (trial !== includeTrial || courseRowIsCompanion(row) || courseRowIsCompanion(entitlement) || courseRowIsCompanion(purchase) || courseRowIsCompanion(schedule)) return;
      const displayStudentIds = [...new Set([...studentIds, ownerStudentId].map(text).filter(Boolean))];
      displayStudentIds.forEach(studentId => {
        if (text(row.scheduleId)) ledgerScheduleStudentKeys.add(`${studentId}|${text(row.scheduleId)}`);
        const fallbackTime = ledgerFallbackDateTime(row);
        const sortTime = text(schedule.startTime || fallbackTime || row.relatedDate || row.scheduleTime || row.createdAt);
        const scheduleId = text(row.scheduleId || schedule.id);
        const displayTime = dateTimeText(schedule, fallbackTime || row.relatedDate || row.scheduleTime || row.createdAt);
        const displayVenue = text(schedule.venue || row.venue || row.sourceVenue || row.courtName || row.court);
        const displayCoach = text(schedule.coach || row.coach || entitlement.ownerCoach || purchase.ownerCoach);
        const hasLinkedSchedule = !!text(schedule.id);
        const hasManualDisplayContext = /\d{1,2}:\d{2}/.test(displayTime) && !!displayVenue && !!displayCoach;
        if (text(row.scheduleId) && !hasLinkedSchedule && !hasManualDisplayContext) return;
        ledgerScheduleFactKeys.add(lessonFactKey(studentId, {
          startTime: schedule.startTime,
          relatedDate: fallbackTime || row.relatedDate,
          scheduleTime: row.scheduleTime,
          createdAt: row.createdAt,
          coach: displayCoach
        }));
        push(studentId, {
          kind: 'ledger',
          scheduleId,
          entitlementId: text(row.entitlementId),
          purchaseId: text(row.purchaseId || entitlement.purchaseId),
          sortTime,
          time: displayTime,
          packageName: teachingPackageName(entitlement, purchase) || text(row.packageName || row.className || row.courseName || row.standardCourseType || row.courseType),
          lessonRelationText: ledgerRelationText({ currentStudentId: studentId, actualStudentIds: studentIds, ownerStudentId, studentsById }),
          packageOwnerStudentId: ownerStudentId,
          packageOwnerName: studentDisplayNameById(ownerStudentId, studentsById),
          actualStudentIds: studentIds,
          actualStudentNames: studentIds.map(id => studentDisplayNameById(id, studentsById)).filter(Boolean),
          isPackageOwnerLedger: ownerStudentId && studentId === ownerStudentId && !studentIds.includes(ownerStudentId),
          countAsCompletedLesson: studentIds.includes(studentId),
          courseType: courseTypeText(schedule.courseType ? schedule : entitlement),
          campus: text(schedule.campus || row.campus || entitlement.campus),
          venue: displayVenue,
          coach: displayCoach,
          hasFeedback: lessonHasFeedback(scheduleId, schedule),
          lessonDelta: Number(row.lessonDelta) || 0,
          unit: packageUnitLabel(entitlement),
          status: '已结束',
          statusClass: 'detail-tag-muted',
          metaParts: teachingLessonRecordMetaParts({ ...schedule, ...row, venue: displayVenue, coach: displayCoach, courseType: courseTypeText(schedule.courseType ? schedule : entitlement) }),
          reason: text(row.reason || row.notes)
        });
      });
    });

  (data.schedule || [])
    .filter(row => teachingScheduleLessonFact(row, data.now || new Date()) || teachingSchedulePendingLessonFact(row, data.now || new Date()))
    .filter(row => courseRowIsTrial(row) === includeTrial)
    .forEach(row => {
      const pending = teachingSchedulePendingLessonFact(row, data.now || new Date());
      const scheduleId = text(row.id);
      const linkedLedger = ledgersByScheduleId.get(scheduleId) || {};
      const entitlementId = text(row.entitlementId || linkedLedger.entitlementId);
      const purchaseId = text(row.purchaseId || linkedLedger.purchaseId);
      if (pending && !text(entitlementId || purchaseId)) return;
      const sortTime = text(row.startTime || row.endTime || row.createdAt);
      parseArr(row.studentIds).concat(text(row.studentId)).map(text).filter(Boolean).forEach(studentId => {
        if (ledgerScheduleStudentKeys.has(`${studentId}|${text(row.id)}`)) return;
        if (ledgerScheduleFactKeys.has(lessonFactKey(studentId, row))) return;
        push(studentId, {
          kind: 'schedule',
          scheduleId,
          entitlementId,
          purchaseId,
          sortTime,
          time: dateTimeText(row),
          packageName: teachingPackageName(row, row),
          courseType: courseTypeText(row),
          className: text(row.className || row.courseName),
          campus: text(row.campus || row.campusName),
          venue: text(row.venue || row.court),
          coach: text(row.coach || row.coachName),
          hasFeedback: lessonHasFeedback(scheduleId, row),
          lessonDelta: pending ? 0 : -Math.abs(scheduleLessonUnits(row)),
          countAsCompletedLesson: pending ? false : true,
          unit: packageUnitLabel(row),
          status: pending ? '待上课' : '已结束',
          statusClass: pending ? 'detail-tag-success' : 'detail-tag-muted',
          feedbackStatusText: pending ? '' : undefined,
          metaParts: teachingLessonRecordMetaParts(row),
          reason: text(row.notes)
        });
      });
    });

  const lessonDetailDedupKey = (row = {}) => {
    const scheduleId = text(row.scheduleId);
    if (scheduleId) return `schedule:${scheduleId}`;
    return [
      text(row.time),
      text(row.courseType),
      text(row.status),
      text((Array.isArray(row.metaParts) ? row.metaParts : []).join('|'))
    ].join('|');
  };
  const mergeLessonDetailRows = (primary = {}, secondary = {}) => {
    const primaryHasFeedback = !!(primary.hasFeedback || primary.feedbackId || primary.feedbackAt || primary.feedbackStatus === '已反馈');
    const secondaryHasFeedback = !!(secondary.hasFeedback || secondary.feedbackId || secondary.feedbackAt || secondary.feedbackStatus === '已反馈');
    const courseType = text(primary.courseType || secondary.courseType || '课程');
    const status = text(primary.status || secondary.status || '已结束');
    return {
      ...primary,
      ...secondary,
      scheduleId: text(primary.scheduleId || secondary.scheduleId),
      time: text(primary.time || secondary.time),
      sortTime: text(primary.sortTime || secondary.sortTime),
      courseType,
      courseTypeClass: /体验/.test(courseType) ? 'detail-tag-trial' : 'detail-tag-private',
      status,
      statusClass: /待|进行/.test(status) ? 'detail-tag-success' : 'detail-tag-muted',
      hasFeedback: primaryHasFeedback || secondaryHasFeedback,
      feedbackStatusText: primaryHasFeedback || secondaryHasFeedback ? '' : '未反馈',
      feedbackStatusClass: 'detail-tag-warning',
      lessonUnits: Math.max(Number(primary.lessonUnits) || 0, Number(secondary.lessonUnits) || 0) || 1,
      metaParts: [...new Set([...(Array.isArray(primary.metaParts) ? primary.metaParts : []), ...(Array.isArray(secondary.metaParts) ? secondary.metaParts : [])].map(value => text(value)).filter(Boolean))]
    };
  };
  rowsByStudent.forEach((rows, studentId) => {
    const deduped = new Map();
    rows.forEach(row => {
      const key = lessonDetailDedupKey(row);
      const existing = deduped.get(key);
      if (!existing) {
        deduped.set(key, row);
        return;
      }
      const merged = mergeLessonDetailRows(existing, row);
      deduped.set(key, merged);
    });
    rowsByStudent.set(studentId, [...deduped.values()].sort((a, b) => text(b.sortTime).localeCompare(text(a.sortTime))));
  });
  rowsByStudent.forEach((rows, studentId) => {
    const packageRows = rows
      .filter(row => Number(row.lessonDelta) < 0)
      .filter(row => !courseRowIsTrial(row) && !courseRowIsCompanion(row))
      .filter(row => text(row.entitlementId || row.purchaseId || row.packageName))
      .sort((a, b) => text(a.sortTime).localeCompare(text(b.sortTime)));
    const usedBeforeByPackage = new Map();
    packageRows.forEach(row => {
      const packageKey = text(row.entitlementId || row.purchaseId || row.packageName);
      if (!packageKey) return;
      const usedBefore = usedBeforeByPackage.get(packageKey) || 0;
      const count = Math.abs(Number(row.lessonDelta) || 0);
      if (!count) return;
      const startNo = usedBefore + 1;
      const endNo = usedBefore + count;
      const unit = row.unit || '节';
      row.lessonSectionText = `[第${lessonSectionMarker(startNo, unit)}${startNo === endNo ? '' : `-${lessonSectionMarker(endNo, unit)}`}${unit}]`;
      usedBeforeByPackage.set(packageKey, endNo);
    });
    rowsByStudent.set(studentId, rows.map(row => ({ ...row, lessonSectionText: row.lessonSectionText || '' })));
  });
  return rowsByStudent;
}

function buildTeachingStudentBenefitDetailMap(data = {}) {
  const byStudent = new Map();
  const push = (studentId, row) => {
    const id = text(studentId);
    if (!id) return;
    const rows = byStudent.get(id) || [];
    rows.push(row);
    byStudent.set(id, rows);
  };
  (data.membershipBenefitLedger || [])
    .filter(activeStatus)
    .forEach(row => {
      const delta = Number(row.delta) || 0;
      if (!delta) return;
      push(row.studentId, {
        benefitCode: text(row.benefitCode),
        label: text(row.benefitLabel || row.benefitCode || '权益'),
        unit: text(row.unit || '次'),
        delta,
        time: dateOnly(row.relatedDate || row.createdAt) || '--',
        reason: text(row.reason || row.notes) || '--',
        operator: text(row.operator || row.createdBy || row.updatedBy) || '--',
        sourcePurchaseId: text(row.sourcePurchaseId || row.purchaseId),
        sourcePackageName: text(row.sourcePackageName || row.packageName),
        sortTime: text(row.relatedDate || row.createdAt)
      });
    });

  const result = new Map();
  byStudent.forEach((rows, studentId) => {
    const summary = new Map();
    rows.forEach(row => {
      const item = summary.get(row.benefitCode) || { benefitCode: row.benefitCode, label: row.label, unit: row.unit, total: 0, used: 0, remaining: 0, lastAt: '' };
      if (row.delta > 0) item.total += row.delta;
      if (row.delta < 0) item.used += Math.abs(row.delta);
      if (row.sortTime && row.sortTime >= text(item.lastAt)) item.lastAt = row.time;
      summary.set(row.benefitCode, item);
    });
    const summaryRows = [...summary.values()]
      .map(row => ({ ...row, remaining: Math.max(0, row.total - row.used) }))
      .filter(row => row.total > 0 || row.remaining > 0);
    const ledgerRows = rows
      .sort((a, b) => text(b.sortTime).localeCompare(text(a.sortTime)))
      .map(row => ({
        delta: row.delta,
        time: row.time,
        label: row.label,
        count: `${lessonQty(Math.abs(row.delta))}${row.unit}`,
        reason: row.reason,
        operator: row.operator,
        sourcePurchaseId: row.sourcePurchaseId,
        sourcePackageName: row.sourcePackageName
      }));
    result.set(studentId, {
      detailBenefitRows: summaryRows,
      detailBenefitGrantRows: ledgerRows.filter(row => row.delta > 0).map(({ delta, ...row }) => row),
      detailBenefitConsumeRows: ledgerRows.filter(row => row.delta < 0).map(({ delta, ...row }) => row)
    });
  });
  return result;
}

function buildTeachingStudentRecentFeedbackMap(data = {}) {
  const byStudent = new Map();
  const push = (studentId, row) => {
    const id = text(studentId);
    if (!id) return;
    const rows = byStudent.get(id) || [];
    rows.push(row);
    byStudent.set(id, rows);
  };
  (data.feedbacks || []).forEach(row => {
    const ids = [text(row.studentId), ...parseArr(row.studentIds).map(text)].filter(Boolean);
    ids.forEach(studentId => push(studentId, {
      date: dateOnly(row.startTime || row.createdAt),
      summary: text(row.practicedToday || row.knowledgePoint || row.nextTraining || '已填写反馈'),
      sortTime: text(row.startTime || row.createdAt)
    }));
  });
  byStudent.forEach((rows, studentId) => {
    byStudent.set(studentId, rows.sort((a, b) => text(b.sortTime).localeCompare(text(a.sortTime))).slice(0, 2));
  });
  return byStudent;
}

function booleanSnapshotValue(value) {
  if (value === true || value === false) return value;
  const raw = text(value).toLowerCase();
  if (raw === 'true') return true;
  if (raw === 'false') return false;
  return undefined;
}

function teachingSummaryTrialAttendedSnapshot(row = {}) {
  const explicit = booleanSnapshotValue(row.hasTrialAttended);
  if (explicit === true) return true;
  if (teachingSummaryRowHasConsumedTrialPackage(row)) return true;
  if (explicit === false) return false;
  return teachingSummaryRowHasTrialLesson(row);
}

function teachingSummaryFormalAttendedSnapshot(row = {}, now = new Date()) {
  const explicit = booleanSnapshotValue(row.hasFormalAttended);
  if (explicit !== undefined) return explicit;
  return teachingSummaryRowHasFormalLesson(row, now);
}

function numberSnapshotValue(value, fallback = 0) {
  const n = Number(value);
  return Number.isFinite(n) ? n : fallback;
}

function arraySnapshotValue(value) {
  return parseArr(value);
}

function teachingSummaryRowHasTrialLesson(row = {}) {
  return arraySnapshotValue(row.detailLessonRecordRows).some(item => courseRowIsTrial(item) || /体验/.test(text([
    item.courseType,
    item.standardCourseType,
    item.packageName,
    item.productName,
    item.className,
    item.courseName
  ].filter(Boolean).join(' '))));
}

function teachingSummaryRowHasConsumedTrialPackage(row = {}) {
  return [...arraySnapshotValue(row.detailPackageOrderRows), ...arraySnapshotValue(row.packageListRows)].some(item => {
    if (!(courseRowIsTrial(item) || /体验/.test(text(`${item.courseType || ''} ${item.standardCourseType || ''} ${item.packageName || ''} ${item.productName || ''}`)))) return false;
    const total = Number(item.totalLessons) || 0;
    const used = Number(item.usedLessons) || 0;
    const remaining = Number(item.remainingLessons);
    return used > 0
      || (total > 0 && Number.isFinite(remaining) && remaining <= 0)
      || /已用完|已核销|已消课/.test(text(item.statusText || item.status));
  });
}

function teachingSummaryRowHasFormalLesson(row = {}, now = new Date()) {
  if (booleanSnapshotValue(row.hasFormalAttended) === true) return true;
  const lessonRows = arraySnapshotValue(row.detailLessonRecordRows);
  if (lessonRows.some(item => text(item?.kind) === 'schedule' && item?.countAsCompletedLesson !== false && !courseRowIsTrial(item))) return true;
  if (lessonRows.length) return false;
  return teachingDateOnOrBeforeNow(row.lastFormalLessonAt, now);
}

function teachingSummaryRowIsFormalCourseItem(item = {}) {
  const label = text([
    item.courseType,
    item.standardCourseType,
    item.packageName,
    item.productName,
    item.courseName,
    item.className
  ].filter(Boolean).join(' '));
  return !/体验|陪打/.test(label) && /私教|小班|课包|正式|成人|青少年|网球/.test(label);
}

function teachingSummaryRowHasFormalCourseFact(row = {}, now = new Date()) {
  if (teachingSummaryRowHasFormalLesson(row, now)) return true;
  if ((Number(row.coursePurchaseCount) || 0) > 0) return true;
  if (text(row.studentStage) === 'formal') return true;
  if (text(row.packagePurchaseDate)) return true;
  if ((Number(row.cumulativeCoursePaidAmount) || 0) > 0) return true;
  if ((Number(row.packageBalanceTotal) || 0) > 0) return true;
  return [...arraySnapshotValue(row.detailPackageOrderRows), ...arraySnapshotValue(row.packageListRows)]
    .some(item => teachingSummaryRowIsFormalCourseItem(item) && (
      Number(item.actualAmount || item.paidAmount || item.totalAmount || 0) > 0
      || Number(item.totalLessons || 0) > 0
      || text(item.purchaseDate || item.createdAt)
    ));
}

function buildTeachingStudentSummaryFieldMap(data = {}) {
  const details = new Map();
  (data.teachingStudentSummaryRows || data.studentTeachingSummaries || [])
    .forEach(row => {
      const studentId = text(row.studentId || row.id);
      if (!studentId) return;
      const hasTrialAttended = teachingSummaryTrialAttendedSnapshot(row);
      const hasFormalAttended = teachingSummaryFormalAttendedSnapshot(row, data.now || new Date());
      const hasFormalCourseFact = teachingSummaryRowHasFormalCourseFact(row, data.now || new Date());
      details.set(studentId, {
        hasTeachingSummarySnapshot: true,
        packageListRows: arraySnapshotValue(row.packageListRows),
        packageListText: text(row.packageListText || '-'),
        packageBalanceRemaining: numberSnapshotValue(row.packageBalanceRemaining),
        packageBalanceTotal: numberSnapshotValue(row.packageBalanceTotal),
        packageBalanceText: text(row.packageBalanceText || '-'),
        packageBalancePercent: numberSnapshotValue(row.packageBalancePercent),
        packagePurchaseDate: text(row.packagePurchaseDate),
        detailPackageBalanceRemaining: numberSnapshotValue(row.detailPackageBalanceRemaining),
        detailPackageBalanceTotal: numberSnapshotValue(row.detailPackageBalanceTotal),
        detailPackageBalanceText: text(row.detailPackageBalanceText || row.packageBalanceText || '-'),
        detailPackageBalancePercent: numberSnapshotValue(row.detailPackageBalancePercent),
        detailPackageProgressText: text(row.detailPackageProgressText || '-'),
        detailPackageOrderRows: arraySnapshotValue(row.detailPackageOrderRows),
        detailLessonRecordRows: arraySnapshotValue(row.detailLessonRecordRows),
        detailRecentLessonDate: text(row.detailRecentLessonDate || row.lastFormalLessonAt),
        detailBenefitRows: arraySnapshotValue(row.detailBenefitRows),
        detailBenefitGrantRows: arraySnapshotValue(row.detailBenefitGrantRows),
        detailBenefitConsumeRows: arraySnapshotValue(row.detailBenefitConsumeRows),
        detailRecentFeedbackRows: arraySnapshotValue(row.detailRecentFeedbackRows),
        cumulativeCoursePaidAmount: numberSnapshotValue(row.cumulativeCoursePaidAmount),
        cumulativeCoursePaidText: text(row.cumulativeCoursePaidText),
        completedLessons: numberSnapshotValue(row.completedLessons),
        lastFormalLessonAt: text(row.lastFormalLessonAt),
        packageStatusLabel: text(row.packageStatusLabel),
        paymentModeLabel: text(row.paymentModeLabel),
        activityStatusLabel: text(row.activityStatusLabel),
        lessonVolumeLabel: text(row.lessonVolumeLabel),
        studentStatusLabel: text(row.studentStatusLabel),
        isHistoricalStudentRoster: booleanSnapshotValue(row.isHistoricalStudentRoster),
        isActiveStudentRoster: booleanSnapshotValue(row.isActiveStudentRoster),
        hasTrialAttended: hasTrialAttended ? true : booleanSnapshotValue(row.hasTrialAttended),
        hasFormalAttended: hasFormalAttended ? true : booleanSnapshotValue(row.hasFormalAttended),
        hasTrialToCourseConversion: hasTrialAttended && hasFormalCourseFact,
        summaryUpdatedAt: text(row.summaryUpdatedAt || row.updatedAt)
      });
    });
  return details;
}

function buildTeachingStudentListFieldMap(data = {}, options = {}) {
  const now = options.now || data.now || new Date();
  const summaryFieldMap = buildTeachingStudentSummaryFieldMap(data);
  const packageFieldMap = buildTeachingStudentPackageFieldMap(data, options);
  const includeTrialDetails = options.includeTrial || options.includeTrialDetails !== false;
  const trialPackageFieldMap = options.includeTrial || !includeTrialDetails ? new Map() : buildTeachingStudentPackageFieldMap(data, { ...options, includeTrial: true });
  const coursePaidByStudent = buildTeachingStudentCoursePaidMap(data);
  const lessonDetailMap = buildTeachingStudentLessonDetailMap(data, options);
  const trialLessonDetailMap = options.includeTrial || !includeTrialDetails ? new Map() : buildTeachingStudentLessonDetailMap(data, { ...options, includeTrial: true });
  const benefitDetailMap = buildTeachingStudentBenefitDetailMap(data);
  const feedbackMap = buildTeachingStudentRecentFeedbackMap(data);
  const details = new Map();
  [...new Set([...summaryFieldMap.keys(), ...packageFieldMap.keys(), ...trialPackageFieldMap.keys(), ...coursePaidByStudent.keys(), ...lessonDetailMap.keys(), ...trialLessonDetailMap.keys(), ...benefitDetailMap.keys(), ...feedbackMap.keys()])].forEach(studentId => {
    const summaryFields = summaryFieldMap.get(studentId) || {};
    const packageFields = packageFieldMap.get(studentId) || {};
    const trialPackageFields = trialPackageFieldMap.get(studentId) || {};
    const rawSummaryLessonRows = data.ignoreTeachingSummaryDetailRows ? [] : (summaryFields.detailLessonRecordRows || []);
    const datedSummaryLessonRows = rawSummaryLessonRows
      .filter(row => !dateOnly(row?.time || row?.sortTime || row?.relatedDate || row?.scheduleTime || row?.createdAt)
        || teachingDateOnOrBeforeNow(row?.time || row?.sortTime || row?.relatedDate || row?.scheduleTime || row?.createdAt, now));
    const summaryLessonRows = datedSummaryLessonRows
      .filter(row => options.includeTrial || !courseRowIsTrial(row));
    const summaryTrialLessonRows = options.includeTrial ? [] : datedSummaryLessonRows
      .filter(row => courseRowIsTrial(row))
      .map(row => ({ ...row, countAsCompletedLesson: false }));
    const summaryRecentLessonDate = data.ignoreTeachingSummaryDetailRows || !teachingDateOnOrBeforeNow(summaryFields.detailRecentLessonDate, now)
      ? ''
      : summaryFields.detailRecentLessonDate;
    const lessonRows = lessonDetailMap.has(studentId) ? (lessonDetailMap.get(studentId) || []) : summaryLessonRows;
    const trialLessonRows = [...(trialLessonDetailMap.get(studentId) || []), ...summaryTrialLessonRows].map(row => ({
      ...row,
      countAsCompletedLesson: false
    }));
    const detailLessonRows = options.includeTrial
      ? lessonRows
      : [...lessonRows, ...trialLessonRows].sort((a, b) => text(b.sortTime || b.time).localeCompare(text(a.sortTime || a.time)));
    const completedLessonRows = lessonRows.filter(row => row?.countAsCompletedLesson !== false);
    const detailRecentLessonDate = lessonDetailMap.has(studentId)
      ? (completedLessonRows[0]?.time ? completedLessonRows[0].time.slice(0, 10) : '')
      : text(summaryRecentLessonDate || (completedLessonRows[0]?.time ? completedLessonRows[0].time.slice(0, 10) : ''));
    const benefitFields = benefitDetailMap.get(studentId) || {};
    const cumulativeCoursePaidAmount = coursePaidByStudent.has(studentId)
      ? money(coursePaidByStudent.get(studentId) || 0)
      : money(summaryFields.cumulativeCoursePaidAmount || 0);
    const lessonRowCompleted = round(teachingLessonRowsCompletedUnits(lessonRows), 1);
    const summaryCompleted = round(summaryFields.completedLessons || 0, 1);
    const rawPackageConsumedLimit = options.includeTrial ? null : teachingStudentPackageConsumedUnits(packageFields);
    const ledgerPackageCompleted = options.includeTrial ? 0 : round(lessonRows
      .filter(row => text(row.kind) === 'ledger' && !courseRowIsTrial(row) && !courseRowIsCompanion(row))
      .reduce((sum, row) => sum + Math.abs(Number(row.lessonDelta) || 0), 0), 1);
    const packageConsumedLimit = rawPackageConsumedLimit === null ? null : Math.max(rawPackageConsumedLimit, ledgerPackageCompleted);
    const directFormalCompleted = packageConsumedLimit === null ? 0 : teachingStudentDirectFormalLessonUnits(data, studentId, now, { ...summaryFields, ...packageFields, studentId });
    const packageConservedCompleted = actualCompleted => {
      if (packageConsumedLimit === null) return round(actualCompleted, 1);
      const actual = round(actualCompleted, 1);
      const actualPackageCompleted = Math.max(0, actual - directFormalCompleted);
      return round(Math.min(actualPackageCompleted, packageConsumedLimit) + directFormalCompleted, 1);
    };
    const completedLessons = lessonDetailMap.has(studentId)
      ? packageConservedCompleted(lessonRowCompleted)
      : rawSummaryLessonRows.length
        ? (summaryLessonRows.length ? packageConservedCompleted(Math.max(lessonRowCompleted, summaryCompleted)) : 0)
        : summaryCompleted;
    const conservedPackageFields = options.includeTrial
      ? packageFields
      : reconcileTeachingPackageFields(packageFields, completedLessons, directFormalCompleted);
    details.set(studentId, {
      packageListRows: [],
      packageListText: '-',
      packageBalanceRemaining: 0,
      packageBalanceTotal: 0,
      packageBalanceText: '-',
      packageBalancePercent: 0,
      packagePurchaseDate: '',
      detailPackageBalanceRemaining: 0,
      detailPackageBalanceTotal: 0,
      detailPackageBalanceText: '-',
      detailPackageBalancePercent: 0,
      detailPackageOrderRows: [],
      detailLessonRecordRows: lessonRows,
      detailRecentLessonDate: lessonRows[0]?.time ? lessonRows[0].time.slice(0, 10) : '',
      detailBenefitRows: [],
      detailBenefitGrantRows: [],
      detailBenefitConsumeRows: [],
      detailRecentFeedbackRows: feedbackMap.get(studentId) || [],
      cumulativeCoursePaidAmount,
      cumulativeCoursePaidText: moneyText(cumulativeCoursePaidAmount),
      ...summaryFields,
      ...conservedPackageFields,
      detailPackageOrderRows: [
        ...(Array.isArray(conservedPackageFields.detailPackageOrderRows)
          ? conservedPackageFields.detailPackageOrderRows
          : (Array.isArray(summaryFields.detailPackageOrderRows) ? summaryFields.detailPackageOrderRows : [])),
        ...(includeTrialDetails && Array.isArray(trialPackageFields.detailPackageOrderRows) ? trialPackageFields.detailPackageOrderRows : [])
      ],
      ...benefitFields,
      detailLessonRecordRows: detailLessonRows,
      detailRecentLessonDate,
      completedLessons
    });
  });
  return details;
}

function earliestBusinessDateText(...values) {
  return values
    .map(value => text(value))
    .filter(Boolean)
    .map(value => {
      const parsed = Date.parse(value.replace(' ', 'T'));
      return { value, parsed: Number.isFinite(parsed) ? parsed : Number.POSITIVE_INFINITY };
    })
    .sort((a, b) => a.parsed - b.parsed)[0]?.value || '';
}

function leadDateSourceValue(row = {}, lead = {}) {
  return text(lead.leadDateSource || lead.leadDateKind || lead.leadDateOrigin || row.leadDateSource || row.leadDateKind || row.leadDateOrigin);
}

function leadDateIsManual(row = {}, lead = {}) {
  const source = leadDateSourceValue(row, lead).toLowerCase();
  if (source === 'manual') return true;
  if (source === 'system') return false;
  const explicitLeadDate = text(lead.leadDate || lead.leadEnteredAt);
  if (!explicitLeadDate) return false;
  const createdAt = text(lead.createdAt || row.createdAt);
  const enteredAt = text(lead.leadEnteredAt || row.leadEnteredAt);
  if (explicitLeadDate === createdAt || explicitLeadDate === enteredAt) return false;
  return true;
}

function trustedRealLeadCreatedAt(row = {}, lead = {}, businessDate = '') {
  if (!rowId(lead) || row.hasTeachingSummarySnapshot || isOrphanMaterializedStudentLead(lead)) return '';
  const createdAt = text(lead.createdAt);
  if (!createdAt) return '';
  const explicitLeadDate = text(lead.leadDate || lead.leadEnteredAt);
  const updatedAt = text(lead.updatedAt);
  if (businessDate && explicitLeadDate === createdAt && (!updatedAt || updatedAt === createdAt) && leadDateMs(createdAt) > leadDateMs(businessDate)) return '';
  return createdAt;
}

function leadBusinessDate(row = {}, lead = {}) {
  const businessFacts = [
    row.firstTouchAt,
    row.trialAtRaw,
    row.trialBookedAt,
    row.trialAttendedAt,
    row.packagePurchaseDate,
    row.courseFirstPurchaseAt,
    row.lastFormalLessonAt,
    row.detailRecentLessonDate,
    row.conversionAt,
    lead.firstTouchAt,
    lead.trialAtRaw,
    lead.trialBookedAt,
    lead.trialAttendedAt,
    lead.packagePurchaseDate,
    lead.courseFirstPurchaseAt,
    lead.lastFormalLessonAt,
    lead.detailRecentLessonDate,
    lead.conversionAt
  ];
  const explicitLeadDate = text(lead.leadDate || lead.leadEnteredAt || row.leadDate || row.leadEnteredAt);
  const manualLeadDate = leadDateIsManual(row, lead);
  const source = leadDateSourceValue(row, lead).toLowerCase();
  const businessDate = earliestBusinessDateText(...businessFacts);
  const realLeadCreatedAt = trustedRealLeadCreatedAt(row, lead, businessDate);
  if (manualLeadDate && explicitLeadDate) return explicitLeadDate;
  if (businessDate) return businessDate;
  if (realLeadCreatedAt) return realLeadCreatedAt;
  if (source !== 'system' && explicitLeadDate && ![
    text(lead.createdAt),
    text(lead.updatedAt),
    text(lead.leadEnteredAt),
    text(row.createdAt),
    text(row.updatedAt),
    text(row.leadEnteredAt)
  ].includes(explicitLeadDate)) {
    return explicitLeadDate;
  }
  return '';
}

function visibleLeadProfileNote(lead = {}) {
  const note = text(lead.profileNote);
  if (/课包消耗记录#|余额\d+\/\d+|来源价格\d*[：:]/.test(note)) return '';
  return note;
}

function isOrphanMaterializedStudentLead(lead = {}) {
  return /^lead-from-student-/.test(text(lead.id || lead.leadId));
}

function normalizeLifecycleDealType(value = '') {
  const raw = text(value);
  if (!raw || /未转化|未成交/.test(raw)) return '';
  const normalized = raw
    .replace(/已转/g, '')
    .replace(/转化/g, '')
    .replace(/成交/g, '')
    .replace(/\s/g, '')
    .replace(/会员/g, '订场会员')
    .replace(/订场订场会员/g, '订场会员')
    .replace(/订场陪打/g, '订场+陪打');
  const standard = ['课程', '订场', '订场会员', '陪打', '课程+订场', '课程+订场会员', '订场+订场会员', '订场+陪打', '课程+订场+订场会员'];
  if (standard.includes(raw)) return raw;
  return standard.includes(normalized) ? normalized : '';
}

function manualLeadOutcomeStage(lead = {}) {
  if (isOrphanMaterializedStudentLead(lead) && !text(lead.lastFollowupAt)) return '';
  const explicit = text(lead.leadStage || lead.systemStatus || lead.stage || lead.rawStatus);
  if (/流失|无意向/.test(explicit)) return '已流失';
  if (/已体验|体验待转化|体验待成交/.test(explicit)) return '已体验待成交';
  if (/已约|预约|约体验/.test(explicit)) return '已约体验';
  if (/新线索/.test(explicit)) return '新线索';
  if (/跟进|沟通|对接/.test(explicit)) return '跟进中';
  const convertedText = /成交|已报名|已订场|已定场|储值|会员|陪打/.test(explicit) || (/转化/.test(explicit) && !/未转化|待转化/.test(explicit));
  if (lead.isCourseConverted === true || lead.isCourtConverted === true || lead.isMembershipConverted === true || convertedText) return '已成交';
  return '';
}

function hasLifecycleBusinessFact(row = {}) {
  return !!(
    text(row.studentId || row.courtId || row.membershipAccountId) ||
    text(row.trialBookedAt || row.trialAttendedAt || row.courseFirstPurchaseAt || row.bookingFirstAt || row.membershipFirstAt) ||
    row.hasCourseConversion ||
    row.hasBookingConversion ||
    row.hasMembershipConversion ||
    row.hasCompanionConversion ||
    text(row.studentStage) !== 'none' ||
    text(row.courtStage) !== 'none' ||
    text(row.membershipStatus)
  );
}

function shouldIgnoreLegacyLeadOutcome(row = {}, lead = {}) {
  if (manualLeadOutcomeStage(lead) === '已成交') return false;
  return hasLifecycleBusinessFact(row) && text(row.studentStage) !== 'formal';
}

function lifecycleInScope(row = {}, scope = 'all') {
  if (scope === 'all') return true;
  if (scope === 'course') return text(row.studentStage) !== 'none';
  if (scope === 'raw') return !!text(row.sourceLeadId || row.leadId);
  return true;
}

function lifecycleLeadStage(row = {}, lead = {}) {
  const studentStage = text(row.studentStage);
  const hasCourseRosterConversion = !!row.hasCourseStudentEntry && !row.hasFreeCourseFollowup;
  const hasCourse = !!row.hasCourseConversion || hasCourseRosterConversion || studentStage === 'formal';
  const hasBooking = !!row.hasBookingConversion || ['booking', 'member'].includes(text(row.courtStage));
  const hasMembership = !!row.hasMembershipConversion || text(row.courtStage) === 'member';
  const hasCompanion = !!row.hasCompanionConversion;
  const hasTrialAttended = !!text(row.trialAttendedAt);
  const hasTrialBooked = !!text(row.trialBookedAt || row.trialAtRaw) || !!row.hasTrialExperience;
  const manualStage = manualLeadOutcomeStage(lead);
  if (hasCourse || hasBooking || hasMembership || hasCompanion) return '已成交';
  if (manualStage) return manualStage;
  if (hasTrialAttended || studentStage === 'trial') return '已体验待成交';
  if (hasTrialBooked) return '已约体验';
  if (studentStage === 'student') return '跟进中';
  const explicit = text(lead.leadStage || lead.systemStatus || lead.stage || lead.rawStatus);
  if (/未转化|未成交/.test(explicit)) return '跟进中';
  if (/流失/.test(explicit)) return '已流失';
  if (/已体验|体验待转化|体验待成交/.test(explicit)) return '已体验待成交';
  if (/已约|预约|约体验/.test(explicit)) return '已约体验';
  if (/成交|转化|已报名|已订场|已定场|储值|会员|陪打/.test(explicit)) return '已成交';
  if (/新线索/.test(explicit)) return '新线索';
  if (/跟进/.test(explicit)) return '跟进中';
  return explicit || '跟进中';
}

function lifecycleDealType(row = {}, lead = {}) {
  const ignoreLegacyOutcome = shouldIgnoreLegacyLeadOutcome(row, lead);
  const manualStage = manualLeadOutcomeStage(lead);
  const hasCourseRosterConversion = !!row.hasCourseStudentEntry && !row.hasFreeCourseFollowup;
  const hasConvertedFact = !!row.hasCourseConversion || hasCourseRosterConversion || !!row.hasBookingConversion || !!row.hasMembershipConversion || !!row.hasCompanionConversion || text(row.studentStage) === 'formal' || ['booking', 'member'].includes(text(row.courtStage));
  const allowStoredDeal = !ignoreLegacyOutcome && (hasConvertedFact || manualStage === '已成交');
  const stored = allowStoredDeal ? normalizeLifecycleDealType(lead.dealType || lead.conversionType || row.dealType) : '';
  if (stored) return stored;
  const legacyText = allowStoredDeal ? text([
    lead.leadStage,
    lead.systemStatus,
    lead.stage,
    lead.rawStatus,
    lead.status,
    lead.statusAfter
  ].filter(Boolean).join(' ')) : '';
  const studentStage = text(row.studentStage);
  const hasCourse = !!row.hasCourseConversion || hasCourseRosterConversion || studentStage === 'formal' || (allowStoredDeal && !!text(lead.studentId || lead.formalStudentId || lead.courseStudentId)) || /课程|课包|报名|私教|小班/.test(legacyText);
  const hasBooking = !!row.hasBookingConversion || ['booking', 'member'].includes(text(row.courtStage)) || (allowStoredDeal && !!text(lead.courtId || lead.bookingCourtId)) || /订场|定场|场地/.test(legacyText);
  const hasMembership = !!row.hasMembershipConversion || text(row.courtStage) === 'member' || (allowStoredDeal && !!text(lead.membershipAccountId || lead.memberId)) || /会员|储值/.test(legacyText);
  const hasCompanion = !!row.hasCompanionConversion || /陪打/.test(legacyText);
  return [
    hasCourse ? '课程' : '',
    hasBooking ? '订场' : '',
    hasMembership ? '订场会员' : '',
    hasCompanion ? '陪打' : ''
  ].filter(Boolean).join('+');
}

function buildLeadPoolRows({ leads = [], customerLifecycleRows = [], lifecycleScope = 'all', mergeDuplicates = true } = {}) {
  const leadRows = new Map((leads || []).map(row => [rowId(row), row]).filter(([id]) => id));
  const rows = new Map();

  (customerLifecycleRows || []).forEach(lifecycle => {
    if (!activeStatus(lifecycle) || nonPersonProfile(lifecycle)) return;
    if (!lifecycleInScope(lifecycle, lifecycleScope)) return;
    const sourceLeadId = text(lifecycle.sourceLeadId || lifecycle.leadId);
    const existing = sourceLeadId ? leadRows.get(sourceLeadId) : null;
    if (existing && (!activeStatus(existing) || nonPersonProfile(existing))) return;
    const id = sourceLeadId || text(lifecycle.customerKey || lifecycle.studentId || lifecycle.courtId || lifecycle.membershipAccountId);
    if (!id) return;
    const lead = existing || {};
    const leadStage = lifecycleLeadStage(lifecycle, lead);
    const dealType = lifecycleDealType(lifecycle, lead);
    const realStudentId = text(lead.studentId || lead.formalStudentId || lead.courseStudentId);
    const realCourtId = text(lead.courtId || lead.bookingCourtId);
    const realMembershipAccountId = text(lead.membershipAccountId || lead.memberId);
    const next = {
      ...lead,
      id,
      sourceLeadId,
      customerKey: text(lifecycle.customerKey),
      displayName: text(lead.displayName || lead.wechatName || lead.name || lifecycle.displayName),
      name: text(lead.name || lifecycle.displayName),
      phone: text(lead.phone || lifecycle.phone),
      source: businessTaxonomy.normalizeLeadSource(lifecycle.source || lead.source),
      campus: text(lifecycle.campus || lead.campus || lead.campusName),
      campusName: text(lifecycle.campus || lead.campusName || lead.campus),
      owner: text(lifecycle.owner || lead.owner || lead.coach || lead.coachName),
      customerType: text(lifecycle.customerType || lead.customerType),
      demandProduct: businessTaxonomy.normalizeLeadDemandProduct(lifecycle.demandProduct || lead.demandProduct || lead.consultType),
      consultType: businessTaxonomy.normalizeLeadDemandProduct(lifecycle.demandProduct || lead.consultType || lead.demandProduct),
      trialAtRaw: text(lead.trialAtRaw || lead.trialLessonAt || lead.trialAt || lifecycle.trialAtRaw),
      trialBookedAt: text(lifecycle.trialBookedAt || lead.trialBookedAt || lead.trialAtRaw || lead.trialLessonAt || lead.trialAt),
      trialAttendedAt: text(lifecycle.trialAttendedAt || lead.trialAttendedAt),
      enrollAtRaw: text(lead.enrollAtRaw || lead.formalSignupAt || lead.enrollAt || lifecycle.courseFirstPurchaseAt),
      conversionAt: text(lead.conversionAt || lifecycle.conversionAt),
      formalCoach: text(lead.formalCoach || lifecycle.formalCoach),
      profileNote: visibleLeadProfileNote(lead),
      leadEnteredAt: text(lifecycle.leadEnteredAt || lead.leadEnteredAt || lead.createdAt),
      leadDateSource: leadDateSourceValue(lifecycle, lead) || (leadDateIsManual(lifecycle, lead) ? 'manual' : 'system'),
      dealType,
      conversionType: dealType,
      studentId: realStudentId || text(lifecycle.studentId),
      courtId: realCourtId || text(lifecycle.courtId),
      membershipAccountId: realMembershipAccountId || text(lifecycle.membershipAccountId),
      leadDate: leadBusinessDate(lifecycle, lead),
      createdAt: text(lead.createdAt || lifecycle.createdAt || lifecycle.leadDate),
      leadStage,
      systemStatus: leadStage,
      studentStage: text(lifecycle.studentStage),
      hasTrialExperience: !!lifecycle.hasTrialExperience,
      hasTrialBooked: !!text(lifecycle.trialBookedAt || lifecycle.trialAtRaw || lead.trialBookedAt || lead.trialAtRaw || lead.trialLessonAt || lead.trialAt || lifecycle.trialAttendedAt),
      hasTrialAttended: !!lifecycle.hasTrialAttended || !!text(lifecycle.trialAttendedAt || lead.trialAttendedAt),
      hasTrialToCourseConversion: !!lifecycle.hasTrialToCourseConversion,
      courseDealPath: text(lifecycle.courseDealPath),
      courtStage: text(lifecycle.courtStage),
      membershipStatus: text(lifecycle.membershipStatus),
      lastFormalLessonAt: text(lifecycle.lastFormalLessonAt || lifecycle.detailRecentLessonDate || lead.lastFormalLessonAt || lead.detailRecentLessonDate),
      detailRecentLessonDate: text(lifecycle.detailRecentLessonDate || lifecycle.lastFormalLessonAt || lead.detailRecentLessonDate || lead.lastFormalLessonAt),
      packageBalanceRemaining: Number(lifecycle.packageBalanceRemaining ?? lead.packageBalanceRemaining) || 0,
      packageBalanceTotal: Number(lifecycle.packageBalanceTotal ?? lead.packageBalanceTotal) || 0,
      packageBalanceText: text(lifecycle.packageBalanceText || lead.packageBalanceText),
      packageBalancePercent: Number(lifecycle.packageBalancePercent ?? lead.packageBalancePercent) || 0,
      activityStatusLabel: text(lifecycle.activityStatusLabel || lead.activityStatusLabel),
      studentStatusLabel: text(lifecycle.studentStatusLabel || lead.studentStatusLabel),
      packageStatusLabel: text(lifecycle.packageStatusLabel || lead.packageStatusLabel),
      paymentModeLabel: text(lifecycle.paymentModeLabel || lead.paymentModeLabel),
      lessonVolumeLabel: text(lifecycle.lessonVolumeLabel || lead.lessonVolumeLabel),
      isHistoricalStudentRoster: !!lifecycle.isHistoricalStudentRoster,
      isActiveStudentRoster: !!lifecycle.isActiveStudentRoster,
      hasCourseConversion: !!lifecycle.hasCourseConversion,
      hasBookingConversion: !!lifecycle.hasBookingConversion,
      hasMembershipConversion: !!lifecycle.hasMembershipConversion,
      hasCompanionConversion: !!lifecycle.hasCompanionConversion,
      isLifecycleSynthetic: !existing
    };
    rows.set(id, next);
  });

  (leads || []).forEach(lead => {
    const id = rowId(lead);
    if (!id || rows.has(id)) return;
    if (!activeStatus(lead) || nonPersonProfile(lead)) return;
    const source = businessTaxonomy.normalizeLeadSource(lead.source);
    const orphanMaterialized = isOrphanMaterializedStudentLead(lead);
    rows.set(id, {
      ...lead,
      id,
      sourceLeadId: id,
      source,
      leadDateSource: leadDateSourceValue({}, lead) || (leadDateIsManual({}, lead) ? 'manual' : 'system'),
      leadDate: leadBusinessDate({}, lead),
      leadEnteredAt: text(lead.leadEnteredAt || lead.createdAt || ''),
      dealType: orphanMaterialized ? '' : text(lead.dealType || lead.conversionType),
      conversionType: orphanMaterialized ? '' : text(lead.conversionType || lead.dealType),
      leadStage: orphanMaterialized ? '跟进中' : lifecycleLeadStage({}, lead),
      lastFormalLessonAt: text(lead.lastFormalLessonAt || lead.detailRecentLessonDate),
      detailRecentLessonDate: text(lead.detailRecentLessonDate || lead.lastFormalLessonAt),
      packageBalanceRemaining: Number(lead.packageBalanceRemaining) || 0,
      packageBalanceTotal: Number(lead.packageBalanceTotal) || 0,
      packageBalanceText: text(lead.packageBalanceText),
      packageBalancePercent: Number(lead.packageBalancePercent) || 0,
      activityStatusLabel: text(lead.activityStatusLabel),
      studentStatusLabel: text(lead.studentStatusLabel),
      packageStatusLabel: text(lead.packageStatusLabel),
      paymentModeLabel: text(lead.paymentModeLabel),
      lessonVolumeLabel: text(lead.lessonVolumeLabel),
      isHistoricalStudentRoster: !!lead.isHistoricalStudentRoster,
      isActiveStudentRoster: !!lead.isActiveStudentRoster,
      hasTrialAttended: !!lead.hasTrialAttended,
      hasFormalAttended: !!lead.hasFormalAttended,
      hasTrialToCourseConversion: !!lead.hasTrialToCourseConversion,
      hasCourseConversion: !!lead.hasCourseConversion,
      isLifecycleSynthetic: false
    });
  });

  const result = [...rows.values()].filter(row => {
    if (lifecycleScope !== 'course') return true;
    const studentStage = text(row.studentStage);
    const hasCourseEvidence = ['trial', 'formal'].includes(studentStage)
      || row.hasCourseConversion
      || row.hasTrialExperience
      || row.hasCourseStudentEntry
      || /课程|体验/.test(text(row.dealType))
      || /课程|体验/.test(text(row.conversionType))
      || /课程|体验|私教|小班|课包/.test(text(row.demandProduct || row.consultType));
    const hasBookingEvidence = !!text(row.courtId || row.membershipAccountId)
      || row.hasBookingConversion
      || row.hasMembershipConversion
      || ['booking', 'member'].includes(text(row.courtStage));
    return hasCourseEvidence || !hasBookingEvidence;
  });
  return mergeDuplicates ? mergeDuplicateLeadPoolRows(result) : result;
}

function buildStageRows(leadPoolRows = []) {
  const counts = new Map();
  (leadPoolRows || []).forEach(row => {
    const stage = text(row.leadStage) || '跟进中';
    counts.set(stage, (counts.get(stage) || 0) + 1);
  });
  const order = ['新线索', '跟进中', '已约体验', '已体验待成交', '已成交', '已流失'];
  return [...counts.entries()]
    .map(([stage, count]) => ({ stage, count }))
    .sort((a, b) => {
      const ai = order.indexOf(a.stage);
      const bi = order.indexOf(b.stage);
      if (ai !== -1 || bi !== -1) return (ai === -1 ? 999 : ai) - (bi === -1 ? 999 : bi);
      return a.stage.localeCompare(b.stage, 'zh-Hans-CN');
    });
}

function buildSourceChannelStats(leadPoolRows = []) {
  const grouped = new Map();
  (leadPoolRows || []).forEach(row => {
    const source = businessTaxonomy.normalizeLeadSource(row.source);
    const current = grouped.get(source) || { source, leads: 0, converted: 0 };
    current.leads += 1;
    if (isConvertedStage(row.leadStage)) current.converted += 1;
    grouped.set(source, current);
  });
  return [...grouped.values()]
    .map(row => ({
      ...row,
      conversionRate: row.leads ? round(row.converted * 100 / row.leads, 1) : 0
    }))
    .sort((a, b) => b.converted - a.converted || b.leads - a.leads || a.source.localeCompare(b.source, 'zh-Hans-CN'));
}

function rawLeadPoolRowsForLeads(leadPoolRows = [], leads = []) {
  const rawLeadIds = new Set((leads || []).map(row => rowId(row)).filter(Boolean));
  const rawRows = (leadPoolRows || []).filter(row => {
    const id = text(row.id || row.sourceLeadId || row.leadId);
    return rawLeadIds.has(id);
  });
  return mergeDuplicateLeadPoolRows(rawRows);
}

function teachingStudentViewRow(row = {}, listFields = {}) {
  const notes = hasOwn(row, 'notes') ? text(row.notes) : text(row.profileNote);
  const profileNote = text(row.profileNote);
  const searchText = [
    row.searchText,
    row.displayName,
    row.name,
    row.studentName,
    row.phone,
    row.customerType,
    row.source,
    row.campus,
    row.campusName,
    row.formalCoach,
    row.owner,
    notes,
    profileNote,
    listFields.searchText,
    listFields.paymentModeLabel,
    listFields.packageStatusLabel,
    listFields.activityStatusLabel,
    listFields.lessonVolumeLabel,
    listFields.studentStatusLabel
  ].map(text).filter(Boolean).join(' ');
  return {
    ...row,
    ...listFields,
    id: text(row.studentId || row.customerKey || row.sourceLeadId),
    name: text(row.displayName),
    displayName: text(row.displayName),
    phone: text(row.phone),
    type: text(row.customerType),
    source: businessTaxonomy.normalizeLeadSource(row.source),
    campus: text(row.campus),
    primaryCoach: text(row.formalCoach || row.owner),
    notes,
    profileNote,
    searchText,
    sourceLeadId: text(row.sourceLeadId),
    studentId: text(row.studentId),
    studentStage: text(row.studentStage),
    trialStatus: text(row.trialStatus),
    courseDealPath: text(row.courseDealPath),
    lastFormalLessonAt: text(listFields.lastFormalLessonAt),
    packageStatusLabel: text(listFields.packageStatusLabel),
    paymentModeLabel: text(listFields.paymentModeLabel),
    activityStatusLabel: text(listFields.activityStatusLabel),
    lessonVolumeLabel: text(listFields.lessonVolumeLabel),
    studentStatusLabel: text(listFields.studentStatusLabel),
    isHistoricalStudentRoster: !!listFields.isHistoricalStudentRoster,
    isActiveStudentRoster: !!listFields.isActiveStudentRoster,
    packageListRows: Array.isArray(listFields.packageListRows) ? listFields.packageListRows : []
  };
}

function buildTeachingStudentSearchableRows(viewRows = [], data = {}) {
  const byStudentId = new Map();
  (viewRows || []).forEach(row => {
    const studentId = text(row.studentId || row.id);
    if (studentId) byStudentId.set(studentId, row);
  });
  (data.students || []).forEach(student => {
    const studentId = text(student.id || student.studentId);
    if (!studentId) return;
    const existing = byStudentId.get(studentId) || {};
    const source = {
      ...existing,
      ...student,
      studentId,
      displayName: text(student.name || student.displayName || student.studentName || existing.displayName || existing.name || studentId),
      phone: text(student.phone || existing.phone),
      customerType: text(student.customerType || student.type || student.studentType || existing.type || existing.customerType),
      source: text(student.source || existing.source),
      campus: text(student.campus || student.campusName || existing.campus),
      owner: text(student.owner || student.followupOwner || existing.owner),
      formalCoach: text(student.primaryCoach || student.coach || student.coachName || existing.primaryCoach || existing.formalCoach),
      profileNote: text(student.profileNote || existing.profileNote),
      notes: hasOwn(student, 'notes') ? text(student.notes) : ownText(existing, 'notes'),
      status: text(student.status || existing.status),
      mergedIntoStudentId: text(student.mergedIntoStudentId || existing.mergedIntoStudentId),
      deletedAt: text(student.deletedAt || existing.deletedAt),
      archivedAt: text(student.archivedAt || existing.archivedAt)
    };
    byStudentId.set(studentId, {
      ...teachingStudentViewRow(source, existing),
      __searchIndexRow: true
    });
  });
  return [...byStudentId.values()]
    .filter(row => text(row.studentId || row.id))
    .filter(row => !hiddenStudentProfile(row));
}

function teachingScheduleCompleted(row = {}) {
  return ['已完成', '已到课', '已下课', '已消课', '已结束', 'completed', 'done'].includes(text(row.status || row.systemStatus));
}

function teachingScheduleFormal(row = {}) {
  return !courseRowIsTrial(row) && !courseRowIsCompanion(row);
}

function teachingScheduleLessonFact(row = {}, now = new Date()) {
  if (!activeStatus(row) || courseRowIsCompanion(row)) return false;
  const status = text(row.status || row.systemStatus);
  if (['待上课', '待确认', '预约', '已预约'].includes(status)) return false;
  const timeValue = row.startTime || row.endTime || row.createdAt;
  const day = dateOnly(timeValue);
  const base = teachingBaseDateKey(now);
  const happened = !!day && !!base && teachingDateTimeOnOrBeforeNow(timeValue, now);
  if (teachingScheduleCompleted(row)) return happened;
  if (status === '已排课') return happened;
  return happened;
}

function teachingSchedulePendingLessonFact(row = {}, now = new Date()) {
  if (!activeStatus(row) || courseRowIsCompanion(row)) return false;
  if (teachingScheduleCompleted(row)) return false;
  const status = text(row.status || row.systemStatus);
  if (!['已排课', '待上课', '待确认', '预约', '已预约'].includes(status)) return false;
  return teachingDateTimeAfterNow(row.startTime || row.endTime || row.createdAt, now);
}

function teachingScheduleStudentIds(row = {}) {
  return [...new Set(parseArr(row.studentIds).concat(text(row.studentId)).map(text).filter(Boolean))];
}

function teachingScheduleStudentName(row = {}, index = 0) {
  const names = parseArr(row.studentNames).map(text).filter(Boolean);
  return names[index] || text(row.studentName || row.displayName || row.name);
}

function teachingScheduleStudentNames(row = {}) {
  const names = parseArr(row.studentNames).map(cleanDisplayName).filter(Boolean);
  if (names.length) return names;
  const raw = cleanDisplayName(row.studentName || row.displayName || row.name);
  if (!raw) return [];
  return raw.split(/[、，;；]/).map(cleanDisplayName).filter(Boolean);
}

function syntheticScheduleStudentId(name = '') {
  const key = leadIdentityName(name);
  if (!key) return '';
  return `schedule-name-${crypto.createHash('sha1').update(key).digest('hex').slice(0, 16)}`;
}

function buildTeachingStudentIdentityIndex(data = {}, customerLifecycleRows = []) {
  const idsByName = new Map();
  const add = (id, ...names) => {
    const studentId = text(id);
    if (!studentId) return;
    names.map(leadIdentityName).filter(Boolean).forEach(key => {
      const ids = idsByName.get(key) || new Set();
      ids.add(studentId);
      idsByName.set(key, ids);
    });
  };
  (data.students || []).forEach(row => add(row.id || row.studentId, row.name, row.studentName, row.displayName));
  (customerLifecycleRows || []).forEach(row => add(row.studentId, row.displayName, row.name, row.studentName));
  return {
    resolve(name = '') {
      const key = leadIdentityName(name);
      if (!key) return '';
      const ids = idsByName.get(key);
      return ids && ids.size === 1 ? [...ids][0] : syntheticScheduleStudentId(name);
    }
  };
}

function normalizeTeachingScheduleRows(data = {}, customerLifecycleRows = []) {
  const index = buildTeachingStudentIdentityIndex(data, customerLifecycleRows);
  return (data.schedule || []).map(row => {
    if (teachingScheduleStudentIds(row).length) return row;
    if (text(row.scheduleSource) === '线索陪打') return row;
    const names = teachingScheduleStudentNames(row).filter(name => !nonPersonIdentityName(name));
    const studentIds = [...new Set(names.map(name => index.resolve(name)).filter(Boolean))];
    if (!studentIds.length) return row;
    return {
      ...row,
      studentId: studentIds.length === 1 ? studentIds[0] : text(row.studentId),
      studentIds,
      studentNames: parseArr(row.studentNames).length ? parseArr(row.studentNames) : names
    };
  });
}

function normalizeTeachingStudentData(data = {}, customerLifecycleRows = []) {
  return {
    ...data,
    schedule: normalizeTeachingScheduleRows(data, customerLifecycleRows)
  };
}

function teachingStudentScheduleRows(data = {}, studentId = '', predicate = () => true) {
  return (data.schedule || [])
    .filter(row => activeStatus(row) && rowHasStudent(row, studentId) && predicate(row));
}

function teachingStudentFormalLessonFactRows(data = {}, studentId = '', now = new Date()) {
  return teachingStudentScheduleRows(data, studentId, row => teachingScheduleLessonFact(row, now) && teachingScheduleFormal(row));
}

function teachingStudentTrialLessonFactRows(data = {}, studentId = '', now = new Date()) {
  return teachingStudentScheduleRows(data, studentId, row => teachingScheduleLessonFact(row, now) && courseRowIsTrial(row));
}

function teachingStudentFormalLedgerRows(data = {}, studentId = '') {
  const entitlementsById = new Map((data.entitlements || []).map(row => [text(row.id), row]));
  const purchasesById = new Map((data.purchases || []).map(row => [text(row.id), row]));
  const schedulesById = new Map((data.schedule || []).map(row => [text(row.id), row]));
  return (data.entitlementLedger || [])
    .filter(row => activeStatus(row) && entitlementLedgerStudentIds(row, entitlementsById, purchasesById, schedulesById).includes(text(studentId)) && (Number(row.lessonDelta) || 0) < 0)
    .filter(row => {
      const entitlement = entitlementsById.get(text(row.entitlementId)) || {};
      const purchase = purchasesById.get(text(row.purchaseId || entitlement.purchaseId)) || {};
      return !courseRowIsTrial(row) && !courseRowIsTrial(entitlement) && !courseRowIsTrial(purchase)
        && !courseRowIsCompanion(row) && !courseRowIsCompanion(entitlement) && !courseRowIsCompanion(purchase);
    });
}

function teachingStudentLatestFormalLessonDate(data = {}, studentId = '', fallback = '') {
  const now = data.now || new Date();
  const scheduleDates = teachingStudentFormalLessonFactRows(data, studentId, now)
    .map(row => dateOnly(row.startTime || row.endTime || row.createdAt));
  const safeFallback = teachingDateOnOrBeforeNow(fallback, now) ? text(fallback) : '';
  return scheduleDates.filter(Boolean).sort().pop() || safeFallback;
}

function teachingDaysSince(dateText = '', now = new Date()) {
  const raw = dateOnly(dateText);
  if (!raw) return null;
  const target = Date.parse(`${raw}T00:00:00`);
  const baseRaw = teachingBaseDateKey(now);
  const base = Date.parse(`${baseRaw}T00:00:00`);
  if (!Number.isFinite(target) || !Number.isFinite(base)) return null;
  return Math.floor((base - target) / 86400000);
}

function teachingStudentHasCompletedLesson(data = {}, row = {}, now = new Date()) {
  const studentId = text(row.studentId);
  if (!studentId) return false;
  if (row.hasTeachingSummarySnapshot && (Number(row.completedLessons) || 0) > 0) return true;
  return teachingStudentScheduleRows(data, studentId, schedule => teachingScheduleLessonFact(schedule, now)).length > 0;
}

function teachingStudentHasCourseRosterEntry(row = {}) {
  return !!row.hasCourseStudentEntry
    || !!row.hasCourseConversion
    || text(row.studentStage) === 'formal';
}

function teachingStudentInHistoricalRoster(data = {}, row = {}, now = new Date()) {
  if (text(row.studentId) && text(row.studentStage) === 'student' && row.hasStudentProfile === true) return true;
  if (teachingStudentHasCompletedLesson(data, row, now)
    || teachingStudentHasFormalPackage(row)
    || teachingStudentHasCourseRosterEntry(row)) return true;
  const snapshotValue = booleanSnapshotValue(row.isHistoricalStudentRoster);
  return row.hasTeachingSummarySnapshot && snapshotValue === true;
}

function teachingStudentInActiveRoster(data = {}, row = {}, now = new Date()) {
  if ((Number(row.packageBalanceRemaining) || 0) > 0) return true;
  const days = teachingDaysSince(teachingStudentLatestFormalLessonDate(data, text(row.studentId), teachingStudentSummaryDateFallback(data, row)), now);
  if (days !== null && days <= 90) return true;
  const snapshotValue = booleanSnapshotValue(row.isActiveStudentRoster);
  if (row.hasTeachingSummarySnapshot && snapshotValue !== undefined) return snapshotValue;
  return false;
}

function hasFreshTeachingLessonFacts(data = {}) {
  return (Array.isArray(data.schedule) && data.schedule.length > 0)
    || (Array.isArray(data.entitlementLedger) && data.entitlementLedger.length > 0);
}

function teachingStudentSummaryDateFallback(data = {}, row = {}) {
  const now = data.now || new Date();
  const lessonRows = Array.isArray(row.detailLessonRecordRows) ? row.detailLessonRecordRows : [];
  const rowLessonDate = lessonRows
    .filter(item => item?.countAsCompletedLesson !== false && !courseRowIsTrial(item))
    .map(item => dateOnly(item?.time || item?.sortTime || item?.relatedDate || item?.scheduleTime || item?.createdAt))
    .filter(value => value && teachingDateOnOrBeforeNow(value, now))
    .sort()
    .pop() || '';
  const fallback = text(row.lastFormalLessonAt || row.detailRecentLessonDate || rowLessonDate);
  return teachingDateOnOrBeforeNow(fallback, now) ? fallback : '';
}

function teachingSummaryNeedsLessonFacts(row = {}, now = new Date()) {
  if (String(row.teachingLessonDetailSourceVersion || '').trim() !== TEACHING_LESSON_DETAIL_SOURCE_VERSION) return true;
  const lessonRows = Array.isArray(row.detailLessonRecordRows) ? row.detailLessonRecordRows : parseArr(row.detailLessonRecordRows);
  const packageRows = Array.isArray(row.detailPackageOrderRows) ? row.detailPackageOrderRows : parseArr(row.detailPackageOrderRows);
  if ((Number(row.completedLessons) || 0) === 0 && lessonRows.length === 0 && packageRows.length === 0) return true;
  const countBasedLessonRows = lessonRows.filter(item => Number(item?.lessonDelta) < 0 && !courseRowIsTrial(item) && !courseRowIsCompanion(item));
  const hasMissingOrWrongCountLabel = countBasedLessonRows.some(item => {
    const label = text(item?.lessonSectionText);
    if (!label) return true;
    const courseType = text(item?.courseType);
    return /小班课|专项课/.test(courseType) && !/次/.test(label);
  });
  if (hasMissingOrWrongCountLabel) return true;
  const hasFutureRecentLesson = !!dateOnly(row.detailRecentLessonDate || row.lastFormalLessonAt)
    && !teachingDateOnOrBeforeNow(row.detailRecentLessonDate || row.lastFormalLessonAt, now);
  const hasFutureLessonRow = lessonRows.some(item => {
    const value = item?.time || item?.sortTime || item?.relatedDate || item?.scheduleTime || item?.createdAt;
    return !!dateOnly(value) && !teachingDateOnOrBeforeNow(value, now);
  });
  if (hasFutureRecentLesson || hasFutureLessonRow) return true;
  const hasPastLessonRow = lessonRows.some(item => {
    const value = item?.time || item?.sortTime || item?.relatedDate || item?.scheduleTime || item?.createdAt;
    return !dateOnly(value) || teachingDateOnOrBeforeNow(value, now);
  });
  const hasLessonFact = (Number(row.completedLessons) || 0) > 0
    || teachingDateOnOrBeforeNow(row.detailRecentLessonDate || row.lastFormalLessonAt, now)
    || hasPastLessonRow;
  const saysNever = /未.*上课|从未/.test(text(row.activityStatusLabel));
  const packageConsumedLimit = teachingStudentPackageConsumedUnits(row);
  if (packageConsumedLimit !== null) {
    const directRows = lessonRows.filter(item => !courseRowIsTrial(item) && teachingPaymentIsDirect(item));
    const directUnits = teachingLessonRowsCompletedUnits(directRows);
    if ((Number(row.completedLessons) || 0) > packageConsumedLimit + directUnits) return true;
  }
  return hasLessonFact && saysNever;
}

function teachingStudentHasTrialAttendedFact(data = {}, row = {}, now = new Date()) {
  if (row.hasTeachingSummarySnapshot) return teachingSummaryTrialAttendedSnapshot(row);
  if (teachingStudentTrialLessonFactRows(data, text(row.studentId), now).length > 0) return true;
  return false;
}

function teachingStudentHasFormalAttendedFact(data = {}, row = {}, now = new Date()) {
  if (teachingStudentFormalLessonFactRows(data, text(row.studentId), now).length > 0) return true;
  if (!hasFreshTeachingLessonFacts(data) && row.hasTeachingSummarySnapshot) {
    return booleanSnapshotValue(row.hasFormalAttended) === true || teachingSummaryRowHasFormalLesson(row, now);
  }
  return false;
}

function teachingStudentHasFormalPackage(row = {}) {
  const packageListRows = Array.isArray(row.packageListRows) ? row.packageListRows : [];
  const detailPackageOrderRows = Array.isArray(row.detailPackageOrderRows) ? row.detailPackageOrderRows : [];
  const knownPackageRows = [...packageListRows, ...detailPackageOrderRows];
  if (knownPackageRows.length) return knownPackageRows.some(item => !courseRowIsTrial(item));
  return (Number(row.detailPackageBalanceTotal) || 0) > 0
    || (Number(row.coursePurchaseCount) || 0) > 0
    || (Number(row.packageBalanceTotal) || 0) > 0;
}

function teachingPaymentHasPackageFact(row = {}) {
  const entitlementIds = parseArr(row.entitlementIds).map(text).filter(Boolean);
  return !!(
    text(row.entitlementId || row.courseEntitlementId || row.packageEntitlementId) ||
    entitlementIds.length ||
    text(row.packageOwnerStudentId || row.packageOwnerName) ||
    row.kind === 'ledger'
  );
}

function teachingPaymentIsPackage(row = {}) {
  const hasPackageFact = teachingPaymentHasPackageFact(row);
  if (!hasPackageFact) return false;
  const value = text([
    row.settlementType,
    row.paymentType,
    row.payType,
    row.payMethod,
    row.paymentMethod,
    row.paymentChannel
  ].filter(Boolean).join(' ')).toLowerCase();
  return row.kind === 'ledger'
    || text(row.entitlementId || row.courseEntitlementId || row.packageEntitlementId)
    || parseArr(row.entitlementIds).map(text).filter(Boolean).length > 0
    || /package|课包|扣课|划扣|核销/.test(value);
}

function teachingPaymentIsFormalPackage(row = {}) {
  return teachingPaymentIsPackage(row) && !courseRowIsTrial(row);
}

function teachingPaymentIsDirect(row = {}) {
  const value = text([
    row.settlementType,
    row.paymentType,
    row.payType,
    row.payMethod,
    row.paymentMethod,
    row.paymentChannel,
    row.settlementLabel,
    row.paymentLabel
  ].filter(Boolean).join(' ')).toLowerCase();
  if (teachingPaymentIsPackage(row)) return false;
  if (/single|direct|gift|free|单次|按次|线下|现金|微信|支付宝|转账|收款|赠送|赠课|免费|补偿|活动|资源置换|互换|合作/.test(value)) return true;
  return (Number(row.paidAmount || row.paymentAmount || row.actualAmount || row.amountPaid || row.amount) || 0) > 0;
}

function teachingStudentDirectFormalLessonRows(data = {}, studentId = '', now = new Date(), studentRow = {}) {
  const rows = teachingStudentFormalLessonFactRows(data, studentId, now);
  const detailRows = Array.isArray(studentRow.detailLessonRecordRows) ? studentRow.detailLessonRecordRows : [];
  const hasPackage = teachingStudentHasFormalPackage(studentRow) || rows.some(teachingPaymentIsFormalPackage) || detailRows.some(teachingPaymentIsFormalPackage);
  return rows.filter(row => teachingPaymentIsDirect(row) || (!hasPackage && !teachingPaymentIsFormalPackage(row)));
}

function teachingStudentDirectTrialLessonRows(data = {}, studentId = '', now = new Date()) {
  return teachingStudentTrialLessonFactRows(data, studentId, now).filter(teachingPaymentIsDirect);
}

function teachingStudentHasTrialCoursePurchase(row = {}) {
  const orderRows = Array.isArray(row.detailPackageOrderRows) ? row.detailPackageOrderRows : [];
  return orderRows.some(courseRowIsTrial);
}

function teachingStudentHasTrialOnlyCourseContext(row = {}) {
  const orderRows = Array.isArray(row.detailPackageOrderRows) ? row.detailPackageOrderRows : [];
  const lessonRows = Array.isArray(row.detailLessonRecordRows) ? row.detailLessonRecordRows : [];
  return (orderRows.length > 0 || lessonRows.length > 0)
    && orderRows.concat(lessonRows).some(courseRowIsTrial)
    && !teachingStudentHasFormalPackage(row)
    && !lessonRows.some(item => !courseRowIsTrial(item));
}

function teachingStudentPackageStatusLabel(row = {}) {
  const remaining = Number(row.packageBalanceRemaining) || 0;
  if (!teachingStudentHasFormalPackage(row)) {
    const lessonRows = Array.isArray(row.detailLessonRecordRows) ? row.detailLessonRecordRows : [];
    if (lessonRows.some(item => text(item.packageOwnerStudentId) && text(item.packageOwnerStudentId) !== text(row.studentId))) return '使用他人课包';
    return '未买过课包';
  }
  if (remaining > 0 && remaining <= 2) return '课包即将耗尽';
  if (remaining > 0) return '课包有余额';
  return '课包已用完';
}

function teachingStudentActivityStatusLabel(data = {}, row = {}, now = new Date()) {
  const latest = teachingStudentLatestFormalLessonDate(data, text(row.studentId), teachingStudentSummaryDateFallback(data, row));
  const days = teachingDaysSince(latest, now);
  if (days === null) return '从未正式上课';
  if (days <= 30) return '近30天活跃';
  if (days <= 90) return '31-90天活跃';
  if (days <= 180) return '91-180天沉默';
  return '180天以上沉睡';
}

function teachingStudentPaymentModeLabel(data = {}, row = {}, now = new Date()) {
  const studentId = text(row.studentId);
  const formalLessonRows = teachingStudentFormalLessonFactRows(data, studentId, now);
  const detailRows = Array.isArray(row.detailLessonRecordRows) ? row.detailLessonRecordRows : [];
  const hasPackage = teachingStudentHasFormalPackage(row) || formalLessonRows.some(teachingPaymentIsFormalPackage) || detailRows.some(teachingPaymentIsFormalPackage);
  const hasDirect = teachingStudentDirectFormalLessonRows(data, studentId, now, row).length > 0;
  const hasDirectTrial = teachingStudentDirectTrialLessonRows(data, studentId, now).length > 0;
  const hasTrialPurchase = teachingStudentHasTrialCoursePurchase(row);
  if (!hasFreshTeachingLessonFacts(data) && text(row.paymentModeLabel)) {
    const snapshotLabel = text(row.paymentModeLabel);
    if (teachingStudentHasTrialOnlyCourseContext(row) && /课包|^-$/.test(snapshotLabel)) return '体验课';
    if (!hasPackage && hasTrialPurchase && /课包|^-$/.test(snapshotLabel)) return '体验课';
    return snapshotLabel;
  }
  if (hasPackage && hasDirect) return '课包+单次付费';
  if (hasDirect || hasDirectTrial) return '单次付费学员';
  if (hasPackage) return '课包学员';
  if (hasTrialPurchase) return '体验课';
  return '-';
}

function teachingStudentLessonVolumeLabel(row = {}) {
  const count = Number(row.completedLessons) || 0;
  if (count >= 100) return '历史课时100+';
  if (count >= 50) return '历史课时50+';
  if (count >= 30) return '历史课时30+';
  return '-';
}

function teachingStudentDirectLessonsAfterLastPackage(data = {}, row = {}, now = new Date()) {
  if (teachingStudentPackageStatusLabel(row) !== '课包已用完') return [];
  const lastPackageDate = (Array.isArray(row.packageListRows) ? row.packageListRows : [])
    .map(item => text(item.purchaseDate))
    .filter(Boolean)
    .sort()
    .pop() || '';
  return teachingStudentDirectFormalLessonRows(data, text(row.studentId), now, row).filter(item => {
    const date = dateOnly(item.startTime || item.endTime || item.createdAt);
    return date && (!lastPackageDate || date >= lastPackageDate);
  });
}

function teachingStudentStudentStatusLabel(data = {}, row = {}, now = new Date()) {
  if (!hasFreshTeachingLessonFacts(data) && text(row.studentStatusLabel)) return text(row.studentStatusLabel);
  const packageStatus = teachingStudentPackageStatusLabel(row);
  const activityStatus = teachingStudentActivityStatusLabel(data, row, now);
  const studentId = text(row.studentId);
  const formalRows = teachingStudentFormalLessonFactRows(data, studentId, now);
  const scheduledFormalRows = teachingStudentScheduleRows(data, studentId, item => teachingScheduleFormal(item));
  const recentDirect30 = teachingStudentDirectFormalLessonRows(data, text(row.studentId), now, row).filter(item => {
    const days = teachingDaysSince(dateOnly(item.startTime || item.endTime || item.createdAt), now);
    return days !== null && days <= 30;
  }).length;
  if (teachingStudentHasCourseRosterEntry(row) && !teachingStudentHasFormalPackage(row) && !formalRows.length) {
    return scheduledFormalRows.length ? '已排课未上课' : '已成交待首课';
  }
  if (packageStatus === '课包有余额' && activityStatus === '近30天活跃') return '课包活跃中';
  if (packageStatus === '课包有余额' && activityStatus !== '近30天活跃') return '有余额未活跃';
  if (teachingStudentDirectLessonsAfterLastPackage(data, row, now).length > 0) return '已转单次付费';
  if (teachingStudentDirectFormalLessonRows(data, text(row.studentId), now, row).filter(item => {
    const days = teachingDaysSince(dateOnly(item.startTime || item.endTime || item.createdAt), now);
    return days !== null && days <= 90;
  }).length >= 2) return '稳定单次付费';
  if (packageStatus === '课包已用完' && activityStatus === '近30天活跃' && !recentDirect30) return '课包待续费';
  return '-';
}

function teachingStudentApplyStandardLabels(data = {}, row = {}, now = new Date()) {
  const lastFormalLessonAt = teachingStudentLatestFormalLessonDate(data, text(row.studentId), teachingStudentSummaryDateFallback(data, row));
  const source = { ...row, lastFormalLessonAt };
  const isHistoricalStudentRoster = teachingStudentInHistoricalRoster(data, source, now);
  const isActiveStudentRoster = isHistoricalStudentRoster && teachingStudentInActiveRoster(data, source, now);
  return {
    ...row,
    lastFormalLessonAt,
    packageStatusLabel: teachingStudentPackageStatusLabel(source),
    paymentModeLabel: teachingStudentPaymentModeLabel(data, source, now),
    activityStatusLabel: teachingStudentActivityStatusLabel(data, source, now),
    lessonVolumeLabel: teachingStudentLessonVolumeLabel(source),
    studentStatusLabel: teachingStudentStudentStatusLabel(data, source, now),
    isHistoricalStudentRoster,
    isActiveStudentRoster
  };
}

function teachingStudentTagCounts(rows = []) {
  const groups = {
    packageStatus: {},
    paymentMode: {},
    activityStatus: {},
    lessonVolume: {},
    studentStatus: {}
  };
  const add = (group, value) => {
    const label = text(value) || '-';
    groups[group][label] = (groups[group][label] || 0) + 1;
  };
  (rows || []).forEach(row => {
    add('packageStatus', row.packageStatusLabel);
    add('paymentMode', row.paymentModeLabel);
    add('activityStatus', row.activityStatusLabel);
    add('lessonVolume', row.lessonVolumeLabel);
    add('studentStatus', row.studentStatusLabel);
  });
  return groups;
}

function buildTeachingStudentSourceRows(customerLifecycleRows = [], data = {}) {
  const byStudentId = new Map();
  (customerLifecycleRows || [])
    .filter(row => text(row.studentId))
    .forEach(row => byStudentId.set(text(row.studentId), row));
  (data.schedule || [])
    .filter(row => teachingScheduleLessonFact(row, data.now || new Date()))
    .forEach(row => {
      teachingScheduleStudentIds(row).forEach((studentId, index) => {
        if (byStudentId.has(studentId)) return;
        byStudentId.set(studentId, {
          customerKey: `schedule:${studentId}`,
          sourceLeadId: '',
          leadId: '',
          studentId,
          displayName: teachingScheduleStudentName(row, index) || studentId,
          phone: '',
          source: '',
          campus: text(row.campus || row.campusName),
          owner: text(row.owner || row.coach || row.coachName),
          customerType: text(row.customerType || row.type),
          demandProduct: '',
          trialAtRaw: courseRowIsTrial(row) ? dateOnly(row.startTime || row.createdAt) : '',
          trialBookedAt: courseRowIsTrial(row) ? dateOnly(row.startTime || row.createdAt) : '',
          trialAttendedAt: courseRowIsTrial(row) && teachingScheduleCompleted(row) ? dateOnly(row.startTime || row.createdAt) : '',
          courseFirstPurchaseAt: '',
          conversionAt: '',
          formalCoach: text(row.coach || row.coachName),
          profileNote: '',
          studentStage: courseRowIsTrial(row) ? 'trial' : 'student',
          courseDealPath: '',
          trialStatus: courseRowIsTrial(row) ? (teachingScheduleCompleted(row) ? '已体验待成交' : '已约体验') : '',
          coursePurchaseCount: 0,
          hasCourseRepeatPurchase: false,
          hasTrialToCourseConversion: false,
          courtStage: 'none',
          membershipStatus: '',
          hasTrialExperience: courseRowIsTrial(row),
          hasScheduleRecord: true,
          hasCourseStudentEntry: !courseRowIsTrial(row),
          hasFreeCourseFollowup: !courseRowIsTrial(row),
          leadDate: dateOnly(row.startTime || row.createdAt),
          createdAt: text(row.createdAt || row.startTime),
          hasCourseConversion: false,
          hasBookingConversion: false,
          hasMembershipConversion: false
        });
      });
    });
  (data.teachingStudentSummaryRows || data.studentTeachingSummaries || [])
    .forEach(row => {
      const studentId = text(row.studentId || row.id);
      if (!studentId || byStudentId.has(studentId)) return;
      const hasTrialAttended = teachingSummaryTrialAttendedSnapshot(row);
      const hasFormalAttended = teachingSummaryFormalAttendedSnapshot(row, data.now || new Date());
      const hasFormalCourseFact = teachingSummaryRowHasFormalCourseFact(row, data.now || new Date());
      byStudentId.set(studentId, {
        customerKey: `teaching-summary:${studentId}`,
        sourceLeadId: text(row.sourceLeadId),
        leadId: '',
        studentId,
        displayName: text(row.displayName || row.name || studentId),
        phone: text(row.phone),
        source: text(row.source),
        campus: text(row.campus),
        owner: text(row.primaryCoach),
        customerType: text(row.type),
        demandProduct: '',
        trialAtRaw: '',
        trialBookedAt: '',
        trialAttendedAt: '',
        courseFirstPurchaseAt: text(row.packagePurchaseDate),
        conversionAt: text(row.packagePurchaseDate),
        formalCoach: text(row.primaryCoach),
        profileNote: text(row.profileNote || row.notes),
        notes: text(row.notes || row.profileNote),
        studentStage: text(row.studentStage || (hasFormalAttended ? 'formal' : (hasTrialAttended ? 'trial' : 'student'))),
        courseDealPath: text(row.courseDealPath),
        trialStatus: text(row.trialStatus),
        coursePurchaseCount: 0,
        hasCourseRepeatPurchase: false,
        hasTrialToCourseConversion: hasTrialAttended && hasFormalCourseFact,
        courtStage: 'none',
        membershipStatus: '',
        hasTrialExperience: hasTrialAttended,
        hasTeachingSummarySnapshot: true,
        hasTrialAttended,
        hasFormalAttended,
        hasScheduleRecord: true,
        hasCourseStudentEntry: true,
        hasFreeCourseFollowup: true,
        leadDateSource: text(row.leadDateSource || '') || 'system',
        leadDate: text(row.trialAtRaw || row.trialBookedAt || row.trialAttendedAt || row.packagePurchaseDate || row.courseFirstPurchaseAt || row.lastFormalLessonAt || row.detailRecentLessonDate || row.conversionAt),
        createdAt: text(row.summaryUpdatedAt || row.updatedAt),
        hasCourseConversion: text(row.studentStage) === 'formal',
        hasBookingConversion: false,
        hasMembershipConversion: false
      });
    });
  return [...byStudentId.values()];
}

function buildTeachingStudentViews(customerLifecycleRows = [], data = {}) {
  data = normalizeTeachingStudentData(data, customerLifecycleRows);
  const studentRows = buildTeachingStudentSourceRows(customerLifecycleRows, data)
    .filter(row => !hiddenStudentProfile(row));
  const now = data.now || new Date();
  const courseListFieldMap = buildTeachingStudentListFieldMap(data, { includeTrial: true });
  const formalListFieldMap = buildTeachingStudentListFieldMap(data, { includeTrial: false, includeTrialDetails: data.includeTrialDetailsInFormalView !== false });
  const courseViewRow = row => teachingStudentViewRow(row, courseListFieldMap.get(text(row.studentId)) || {});
  const formalViewRow = row => teachingStudentViewRow(row, formalListFieldMap.get(text(row.studentId)) || {});
  const hasTrialAttended = row => teachingStudentHasTrialAttendedFact(data, row, now);
  const hasFormalAttended = row => teachingStudentHasFormalAttendedFact(data, row, now);
  const hasCourseStudentEntry = row => !!row.hasTrialExperience
    || text(row.studentStage) === 'formal'
    || !!row.hasCourseStudentEntry
    || !!row.hasScheduleRecord
    || !!row.hasFreeCourseFollowup;
  const courseStudents = studentRows
    .filter(hasCourseStudentEntry)
    .map(courseViewRow)
    .map(row => teachingStudentApplyStandardLabels(data, row, now));
  const formalStudents = studentRows
    .filter(row => text(row.studentStage) === 'formal')
    .map(formalViewRow)
    .map(row => teachingStudentApplyStandardLabels(data, row, now));
  const allLabeledStudents = studentRows
    .map(formalViewRow)
    .map(row => teachingStudentApplyStandardLabels(data, row, now));
  const historicalStudents = allLabeledStudents
    .filter(row => row.isHistoricalStudentRoster);
  const activeStudents = allLabeledStudents
    .filter(row => row.isActiveStudentRoster);
  const searchableStudents = buildTeachingStudentSearchableRows(allLabeledStudents, data);
  const trialStudents = studentRows
    .filter(row => text(row.studentStage) === 'trial')
    .map(courseViewRow);
  const trialAttendedStudents = studentRows
    .filter(hasTrialAttended)
    .map(courseViewRow);
  const trialAttendedIds = new Set(trialAttendedStudents.map(row => text(row.studentId)).filter(Boolean));
  const trialAttendedToFormalPurchaseStudents = formalStudents.filter(row => trialAttendedIds.has(text(row.studentId)));
  const trialAttendedToFormalPurchaseIds = new Set(trialAttendedToFormalPurchaseStudents.map(row => text(row.studentId)).filter(Boolean));
  const trialAttendedWithoutFormalStudents = trialAttendedStudents.filter(row => !trialAttendedToFormalPurchaseIds.has(text(row.studentId)));
  const directCourseStudents = formalStudents.filter(row => !trialAttendedIds.has(text(row.studentId)));
  const coursePurchaseCount = formalStudents.reduce((sum, row) => sum + (Number(row.coursePurchaseCount) || 0), 0);
  const courseRepeatCount = formalStudents.filter(row => row.hasCourseRepeatPurchase).length;
  const formalLessonWithinDays = (row, daysLimit) => {
    const latest = teachingStudentFormalLessonFactRows(data, text(row.studentId), now)
      .map(item => dateOnly(item.startTime || item.endTime || item.createdAt))
      .filter(Boolean)
      .sort()
      .pop() || (teachingStudentHasFormalAttendedFact(data, row, now) ? teachingStudentSummaryDateFallback(data, row) : '');
    const days = teachingDaysSince(latest, now);
    return days !== null && days <= daysLimit;
  };
  const packageBalanceRows = activeStudents.filter(row => (Number(row.packageBalanceRemaining) || 0) > 0);
  const packageLowRows = activeStudents.filter(row => {
    const remaining = Number(row.packageBalanceRemaining) || 0;
    return remaining > 0 && remaining <= 2;
  });
  return {
    courseStudents,
    trialStudents,
    formalStudents,
    historicalStudents,
    activeStudents,
    searchableStudents,
    trialAttendedStudents,
    trialAttendedToFormalPurchaseStudents,
    trialAttendedWithoutFormalStudents,
    trialPathStudents: trialAttendedStudents,
    trialPathDealStudents: trialAttendedToFormalPurchaseStudents,
    trialPathPendingStudents: trialAttendedWithoutFormalStudents,
    directCourseDealStudents: directCourseStudents,
    summary: {
      courseStudentCount: courseStudents.length,
      trialStudentCount: trialStudents.length,
      formalStudentCount: formalStudents.length,
      historicalStudentCount: historicalStudents.length,
      activeStudentCount: activeStudents.length,
      historicalTagCounts: teachingStudentTagCounts(historicalStudents),
      activeTagCounts: teachingStudentTagCounts(activeStudents),
      trialAttendedStudentCount: trialAttendedStudents.length,
      trialAttendedToFormalPurchaseCount: trialAttendedToFormalPurchaseStudents.length,
      trialAttendedWithoutFormalCount: trialAttendedWithoutFormalStudents.length,
      historicalTrialAttendedCount: historicalStudents.filter(hasTrialAttended).length,
      historicalFormalAttendedCount: historicalStudents.filter(hasFormalAttended).length,
      historicalTrialWithoutFormalCount: historicalStudents.filter(row => hasTrialAttended(row) && !hasFormalAttended(row)).length,
      historicalFormalLesson30Count: historicalStudents.filter(row => formalLessonWithinDays(row, 30)).length,
      activeFormalLesson30Count: activeStudents.filter(row => formalLessonWithinDays(row, 30)).length,
      activeFormalLesson90Count: activeStudents.filter(row => formalLessonWithinDays(row, 90)).length,
      activePackageBalanceCount: packageBalanceRows.length,
      activePackageLowCount: packageLowRows.length,
      courseDealCustomers: formalStudents.length,
      trialPathStudents: trialAttendedStudents.length,
      trialPathDealCustomers: trialAttendedToFormalPurchaseStudents.length,
      trialPathPendingCustomers: trialAttendedWithoutFormalStudents.length,
      trialToCourseCustomers: trialAttendedToFormalPurchaseStudents.length,
      directCourseCustomers: directCourseStudents.length,
      coursePurchaseCount,
      courseRepeatCount
    }
  };
}

function miniRosterCoachKey(value = '') {
  return text(value).replace(/教练$/,'').replace(/\s+/g,'');
}

function miniRosterLessonQty(value) {
  const n = Number(value) || 0;
  return Number.isInteger(n) ? String(n) : String(round(n, 1));
}

function miniRosterDate(value) {
  const date = value instanceof Date ? value : new Date(text(value).replace(' ', 'T'));
  return Number.isNaN(date.getTime()) ? null : date;
}

function miniRosterDaysAgoText(value = '', now = new Date(), options = {}) {
  const date = miniRosterDate(dateOnly(value));
  if (!date) return '';
  const today = new Date(now.getFullYear(), now.getMonth(), now.getDate()).getTime();
  const lessonDay = new Date(date.getFullYear(), date.getMonth(), date.getDate()).getTime();
  const days = Math.max(0, Math.floor((today - lessonDay) / 86400000));
  if (options.fullDate) return `${dateOnly(value)} · ${days}天前`;
  return `${date.getMonth() + 1}月${date.getDate()}日 · ${days}天前`;
}

function miniRosterCourseLabel(row = {}) {
  const packageRows = Array.isArray(row.packageListRows) ? row.packageListRows : [];
  const source = [
    row.courseDisplayName,
    row.standardCourseType,
    row.courseType,
    row.type,
    row.customerType,
    ...packageRows.flatMap(item => [item.courseDisplayName, item.standardCourseType, item.courseType, item.packageName, item.productName, item.name])
  ].map(text).filter(Boolean).join(' ');
  const audience = (source.match(/青少年|少儿|成人/) || [])[0] || text(row.type || row.customerType);
  const courseType = /体验/.test(source) ? '体验'
    : /1\s*[vV对]\s*1|私教/.test(source) ? '1v1'
      : /小班/.test(source) ? '小班'
        : text(row.standardCourseType || row.courseType);
  return [audience, courseType].filter(Boolean).join(' ') || '课程';
}

function miniRosterStudentType(row = {}, profile = {}) {
  const candidates = [
    row.type,
    row.customerType,
    row.studentType,
    profile.type,
    profile.customerType,
    profile.studentType
  ];
  for (const candidate of candidates) {
    const value = text(candidate);
    if (!value || /代课|substitute/i.test(value)) continue;
    if (/成人|青少年|少儿/.test(value)) return value === '少儿' ? '青少年' : value;
  }
  const packageRows = Array.isArray(row.packageListRows) ? row.packageListRows : [];
  const source = [
    row.courseDisplayName,
    row.standardCourseType,
    row.courseType,
    ...packageRows.flatMap(item => [item.courseDisplayName, item.standardCourseType, item.courseType, item.packageName, item.productName, item.name])
  ].map(text).filter(Boolean).join(' ');
  const matched = (source.match(/青少年|少儿|成人/) || [])[0] || '';
  return matched === '少儿' ? '青少年' : (matched || '暂无记录');
}

function miniRosterHasFormalPackage(row = {}) {
  const total = Number(row.packageBalanceTotal) || Number(row.detailPackageBalanceTotal) || 0;
  return total > 0;
}

function miniRosterHasTrialOnlyContext(row = {}) {
  const trialHint = text(row.studentStage) === 'trial'
    || /体验/.test(text(row.paymentModeLabel || row.trialStatus || row.trialPathLabel || row.courseLabel));
  return trialHint && !row.hasFormalAttended && !miniRosterHasFormalPackage(row);
}

function miniRosterHasDisplayableSubstituteData(row = {}) {
  return !!text(row.name || row.displayName || row.phone)
    || (Array.isArray(row.detailLessonRecordRows) && row.detailLessonRecordRows.length > 0)
    || (Array.isArray(row.detailPackageOrderRows) && row.detailPackageOrderRows.length > 0)
    || (Array.isArray(row.packageListRows) && row.packageListRows.length > 0)
    || (Number(row.completedLessons) || 0) > 0
    || miniRosterHasFormalPackage(row);
}

function miniRosterOwnedTabKey(row = {}) {
  const remaining = Number(row.packageBalanceRemaining);
  if (miniRosterHasTrialOnlyContext(row)) return 'trial';
  if (remaining > 0) return 'active';
  return 'ended';
}

function miniRosterHasTrialFact(row = {}) {
  return text(row.studentStage) === 'trial'
    || !!row.hasTrialExperience
    || !!row.hasTrialAttended
    || !!row.hasTeachingSummarySnapshot && !!booleanSnapshotValue(row.hasTrialAttended)
    || /体验/.test(text([row.paymentModeLabel, row.trialStatus, row.trialPathLabel, row.courseLabel].filter(Boolean).join(' ')));
}

function miniRosterHasFormalFact(row = {}) {
  if (miniRosterHasFormalPackage(row)) return true;
  if (text(row.studentStage) === 'formal') return true;
  if (Array.isArray(row.detailLessonRecordRows) && row.detailLessonRecordRows.some(item => !courseRowIsTrial(item) && !courseRowIsCompanion(item))) return true;
  if (miniRosterHasTrialOnlyContext(row)) return false;
  return (Number(row.completedLessons) || 0) > 0;
}

function miniRosterRelationLabels(row = {}, coachName = '', schedule = []) {
  const labels = [];
  const owned = miniRosterOwnedByCoach(row, coachName);
  const trial = miniRosterHasTrialFact(row);
  const formal = miniRosterHasFormalFact(row);
  const substitute = !owned && miniRosterStudentHasSubstituteFact(row, coachName, schedule);
  if (owned) labels.push('归属');
  if (trial) labels.push('体验');
  if (formal) labels.push('正式');
  if (substitute) labels.push('代课');
  return [...new Set(labels)];
}

function miniRosterTabKeysForRow(row = {}, coachName = '', schedule = []) {
  const keys = [];
  const trial = miniRosterHasTrialFact(row);
  const formal = miniRosterHasFormalFact(row);
  const substitute = !miniRosterOwnedByCoach(row, coachName) && miniRosterStudentHasSubstituteFact(row, coachName, schedule);
  const primary = miniRosterOwnedTabKey(row);
  if (trial) keys.push('trial');
  if (primary) keys.push(primary);
  if (formal && !keys.includes(primary)) keys.push(primary);
  if (substitute) keys.push('substitute');
  return [...new Set(keys)].filter(Boolean);
}

function miniRosterOwnedByCoach(row = {}, coachName = '') {
  const coachKey = miniRosterCoachKey(coachName);
  if (!coachKey) return false;
  if (miniRosterHasTrialOnlyContext(row)) return false;
  const direct = [
    row.primaryCoach,
    row.ownerCoach,
    row.coach,
    row.coachName,
    row.formalCoach,
    row.owner
  ].some(value => miniRosterCoachKey(value) === coachKey);
  if (direct) return true;
  return []
    .concat(Array.isArray(row.packageListRows) ? row.packageListRows : [])
    .concat(Array.isArray(row.detailPackageOrderRows) ? row.detailPackageOrderRows : [])
    .some(item => [item.ownerCoach, item.primaryCoach, item.coach, item.coachName]
      .some(value => miniRosterCoachKey(value) === coachKey));
}

function miniRosterScheduleIds(row = {}) {
  return teachingScheduleStudentIds(row);
}

function miniRosterScheduleTouchedByCoach(row = {}, studentId = '', coachName = '') {
  if (!miniRosterScheduleIds(row).includes(text(studentId))) return false;
  return miniRosterCoachKey(row.coach || row.coachName || row.primaryCoach || row.teacher) === miniRosterCoachKey(coachName);
}

function miniRosterCompletedSchedule(row = {}, now = new Date()) {
  if (!activeStatus(row)) return false;
  const end = miniRosterDate(row.endTime || row.startTime || row.createdAt);
  if (!end || end > now) return false;
  const status = text(row.effectiveStatus || row.status || row.statusText || row.systemStatus);
  return !['已取消','取消','cancelled','canceled','deleted','voided'].includes(status);
}

function miniRosterCurrentWeek(value, now = new Date()) {
  const date = miniRosterDate(value);
  if (!date) return false;
  const current = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  const weekday = current.getDay() || 7;
  const start = new Date(current.getFullYear(), current.getMonth(), current.getDate() - weekday + 1).getTime();
  const end = start + 7 * 86400000;
  const day = new Date(date.getFullYear(), date.getMonth(), date.getDate()).getTime();
  return day >= start && day < end;
}

function miniRosterCurrentMonth(value, now = new Date()) {
  const date = miniRosterDate(value);
  return !!(date && date.getFullYear() === now.getFullYear() && date.getMonth() === now.getMonth());
}

function miniRosterStudentHasSubstituteFact(row = {}, coachName = '', schedule = []) {
  if (miniRosterHasTrialOnlyContext(row)) return false;
  const studentId = text(row.studentId || row.id);
  if (!studentId) return false;
  if ((schedule || []).some(item => miniRosterScheduleTouchedByCoach(item, studentId, coachName))) return true;
  return (Array.isArray(row.detailLessonRecordRows) ? row.detailLessonRecordRows : [])
    .some(item => miniRosterCoachKey(item.coach || item.coachName) === miniRosterCoachKey(coachName));
}

function buildCoachMiniStudentRoster({
  teachingStudentViews = {},
  coachName = '',
  students = [],
  schedule = [],
  now = new Date()
} = {}) {
  const studentsById = new Map((students || []).map(row => [text(row.id || row.studentId), row]).filter(([id]) => id));
  const byId = new Map();
  const putRow = (row = {}, tabKey = '') => {
    const studentId = text(row.studentId || row.id);
    if (!studentId) return;
    const existing = byId.get(studentId) || {};
    const next = { ...existing, ...row };
    const relationSet = new Set(Array.isArray(existing.relationLabels) ? existing.relationLabels : []);
    const nextRelationLabels = miniRosterRelationLabels(next, coachName, schedule);
    nextRelationLabels.forEach(label => relationSet.add(label));
    const keySet = new Set(Array.isArray(existing.studentTabKeys) ? existing.studentTabKeys : []);
    miniRosterTabKeysForRow(next, coachName, schedule).forEach(key => keySet.add(key));
    if (tabKey) keySet.add(tabKey);
    const order = { active: 3, trial: 2, ended: 1, substitute: 0 };
    const nextRank = Math.max(...[...keySet].map(key => order[key] ?? -1));
    const currentRank = order[existing.studentTabKey] ?? -1;
    const primaryKey = nextRank >= currentRank
      ? [...keySet].sort((a, b) => (order[b] ?? -1) - (order[a] ?? -1))[0] || existing.studentTabKey || tabKey || 'ended'
      : existing.studentTabKey || tabKey || 'ended';
    byId.set(studentId, {
      ...next,
      relationLabels: [...relationSet],
      studentTabKeys: [...keySet].filter(Boolean),
      studentTabKey: primaryKey
    });
  };
  (teachingStudentViews.activeStudents || []).forEach(row => putRow(row, 'active'));
  (teachingStudentViews.trialAttendedWithoutFormalStudents || []).forEach(row => putRow(row, 'trial'));
  (teachingStudentViews.formalStudents || [])
    .filter(row => Number(row.packageBalanceTotal) > 0 && Number(row.packageBalanceRemaining) <= 0)
    .forEach(row => putRow(row, 'ended'));
  (teachingStudentViews.historicalStudents || [])
    .filter(row => Number(row.packageBalanceTotal) > 0 && Number(row.packageBalanceRemaining) <= 0)
    .forEach(row => putRow(row, 'ended'));
  [
    ...(teachingStudentViews.courseStudents || []),
    ...(teachingStudentViews.formalStudents || []),
    ...(teachingStudentViews.historicalStudents || []),
    ...(teachingStudentViews.trialAttendedStudents || [])
  ].forEach(row => {
    const studentId = text(row.studentId || row.id);
    if (!studentId || byId.has(studentId)) return;
    const owned = miniRosterOwnedByCoach(row, coachName);
    const substitute = !owned && miniRosterStudentHasSubstituteFact(row, coachName, schedule);
    if ((owned || substitute) && miniRosterHasDisplayableSubstituteData(row)) {
      putRow(row, owned ? miniRosterOwnedTabKey(row) : 'substitute');
    }
  });
  const items = [...byId.values()].map(row => {
    const owned = miniRosterOwnedByCoach(row, coachName);
    const tabKey = row.studentTabKey || (Array.isArray(row.studentTabKeys) && row.studentTabKeys[0]) || miniRosterOwnedTabKey(row);
    const packageText = text(row.detailPackageProgressText) !== '-'
      ? text(row.detailPackageProgressText)
      : (text(row.detailPackageBalanceText) !== '-' ? text(row.detailPackageBalanceText) : text(row.packageBalanceText));
    const detailPackageText = text(row.detailPackageProgressText) !== '-'
      ? text(row.detailPackageProgressText)
      : (text(row.detailPackageBalanceText) !== '-' ? text(row.detailPackageBalanceText) : packageText);
    const recentDate = text(row.detailRecentLessonDate || row.lastFormalLessonAt);
    const latestRecord = (Array.isArray(row.detailLessonRecordRows) ? row.detailLessonRecordRows : [])[0] || {};
    const relationType = Array.isArray(row.relationLabels) && row.relationLabels.length
      ? row.relationLabels.join(' / ')
      : (owned ? '归属' : '代课');
    const studentType = miniRosterStudentType(row, studentsById.get(text(row.studentId || row.id)) || {});
    return {
      ...row,
      id: text(row.studentId || row.id),
      studentId: text(row.studentId || row.id),
      name: text(row.name || row.displayName) || '未命名学员',
      type: studentType,
      relationType,
      tagClass: owned ? 'student-tag-owner' : 'student-tag-substitute',
      studentTabKey: tabKey,
      courseLabel: miniRosterCourseLabel(row),
      packageText,
      detailPackageProgressText: detailPackageText || '暂无记录',
      packagePercent: Math.max(0, Math.min(100, Math.round(Number(row.packageBalancePercent) || 0))),
      showPackage: !!packageText,
      lastScheduleId: text(latestRecord.scheduleId),
      lastClassAt: recentDate,
      lastClassText: miniRosterDaysAgoText(recentDate, now) || '暂无记录',
      showLastClass: !!recentDate,
      cumulative: miniRosterLessonQty(row.completedLessons),
      detailCumulativeText: miniRosterLessonQty(row.completedLessons),
      detailRecentLessonText: miniRosterDaysAgoText(recentDate, now, { fullDate: true }) || '暂无记录',
      searchText: [row.name, row.displayName, row.phone, studentType, relationType, row.searchText, miniRosterCourseLabel(row)].map(text).filter(Boolean).join(' ').toLowerCase(),
      relationLabels: Array.isArray(row.relationLabels) ? row.relationLabels : [],
      studentTabKeys: Array.isArray(row.studentTabKeys) && row.studentTabKeys.length ? row.studentTabKeys : [tabKey]
    };
  }).filter(row => Array.isArray(row.studentTabKeys) && row.studentTabKeys.length > 0);
  const ownedItems = items.filter(row => Array.isArray(row.relationLabels) && row.relationLabels.includes('归属'));
  const ownedIds = new Set(ownedItems.map(row => row.studentId));
  const attendedIds = (predicate) => {
    const ids = new Set();
    (schedule || []).filter(row => miniRosterCompletedSchedule(row, now)).forEach(row => {
      const timeValue = row.endTime || row.startTime || row.createdAt;
      if (!predicate(timeValue, now)) return;
      if (miniRosterCoachKey(row.coach || row.coachName || row.primaryCoach || row.teacher) !== miniRosterCoachKey(coachName)) return;
      teachingScheduleStudentIds(row).forEach(studentId => {
        if (items.some(item => item.studentId === studentId)) ids.add(studentId);
      });
    });
    return ids.size;
  };
  const stats = {
    totalCount: items.length,
    weekActiveCount: attendedIds(miniRosterCurrentWeek),
    monthActiveCount: attendedIds(miniRosterCurrentMonth),
    activeCount: items.filter(row => Array.isArray(row.studentTabKeys) && row.studentTabKeys.includes('active')).length,
    trialCount: items.filter(row => Array.isArray(row.studentTabKeys) && row.studentTabKeys.includes('trial')).length,
    endedCount: items.filter(row => Array.isArray(row.studentTabKeys) && row.studentTabKeys.includes('ended')).length,
    substituteCount: items.filter(row => Array.isArray(row.studentTabKeys) && row.studentTabKeys.includes('substitute')).length,
    ownedCount: ownedItems.length
  };
  const order = { active: 0, trial: 1, substitute: 2, ended: 3 };
  return {
    stats,
    tabs: [
      { key: 'all', label: '全部', count: stats.totalCount },
      { key: 'active', label: '在课', count: stats.activeCount },
      { key: 'trial', label: '体验', count: stats.trialCount },
      { key: 'ended', label: '已结课', count: stats.endedCount },
      { key: 'substitute', label: '代课', count: stats.substituteCount }
    ],
    items: items.sort((a, b) => {
      const orderCompare = (order[a.studentTabKey] ?? 9) - (order[b.studentTabKey] ?? 9);
      if (orderCompare) return orderCompare;
      const timeCompare = text(b.lastClassAt).localeCompare(text(a.lastClassAt));
      if (timeCompare) return timeCompare;
      return text(a.name).localeCompare(text(b.name), 'zh-Hans-CN');
    })
  };
}

function teachingStudentSummarySnapshotRow(row = {}, now = new Date().toISOString()) {
  const studentId = text(row.studentId || row.id);
  if (!studentId) return null;
  return {
    id: studentId,
    studentId,
    name: text(row.name || row.displayName),
    displayName: text(row.displayName || row.name),
    phone: text(row.phone),
    type: text(row.type),
    source: text(row.source),
    campus: text(row.campus),
    primaryCoach: text(row.primaryCoach),
    sourceLeadId: text(row.sourceLeadId),
    studentStage: text(row.studentStage),
    trialStatus: text(row.trialStatus),
    courseDealPath: text(row.courseDealPath),
    lastFormalLessonAt: text(row.lastFormalLessonAt),
    completedLessons: round(row.completedLessons || 0, 1),
    detailLessonRecordRows: Array.isArray(row.detailLessonRecordRows) ? row.detailLessonRecordRows : [],
    teachingLessonDetailSourceVersion: TEACHING_LESSON_DETAIL_SOURCE_VERSION,
    packageListRows: Array.isArray(row.packageListRows) ? row.packageListRows : [],
    packageListText: text(row.packageListText || '-'),
    packageBalanceRemaining: numberSnapshotValue(row.packageBalanceRemaining),
    packageBalanceTotal: numberSnapshotValue(row.packageBalanceTotal),
    packageBalanceText: text(row.packageBalanceText || '-'),
    packageBalancePercent: numberSnapshotValue(row.packageBalancePercent),
    packagePurchaseDate: text(row.packagePurchaseDate),
    detailPackageBalanceRemaining: numberSnapshotValue(row.detailPackageBalanceRemaining),
    detailPackageBalanceTotal: numberSnapshotValue(row.detailPackageBalanceTotal),
    detailPackageBalanceText: text(row.detailPackageBalanceText || row.packageBalanceText || '-'),
    detailPackageBalancePercent: numberSnapshotValue(row.detailPackageBalancePercent),
    detailPackageOrderRows: Array.isArray(row.detailPackageOrderRows) ? row.detailPackageOrderRows : [],
    detailRecentLessonDate: text(row.detailRecentLessonDate || row.lastFormalLessonAt),
    cumulativeCoursePaidAmount: money(row.cumulativeCoursePaidAmount || 0),
    cumulativeCoursePaidText: text(row.cumulativeCoursePaidText || moneyText(row.cumulativeCoursePaidAmount || 0)),
    packageStatusLabel: text(row.packageStatusLabel),
    paymentModeLabel: text(row.paymentModeLabel),
    activityStatusLabel: text(row.activityStatusLabel),
    lessonVolumeLabel: text(row.lessonVolumeLabel),
    studentStatusLabel: text(row.studentStatusLabel),
    isHistoricalStudentRoster: !!row.isHistoricalStudentRoster,
    isActiveStudentRoster: !!row.isActiveStudentRoster,
    hasTrialAttended: !!row.hasTrialAttended,
    hasFormalAttended: !!row.hasFormalAttended,
    summaryUpdatedAt: now,
    updatedAt: now
  };
}

function buildStudentTeachingSummaryRows(customerLifecycleRows = [], data = {}) {
  data = normalizeTeachingStudentData(data, customerLifecycleRows);
  const now = data.now || new Date();
  const updatedAt = now instanceof Date ? now.toISOString() : text(now) || new Date().toISOString();
  const views = buildTeachingStudentViews(customerLifecycleRows, data);
  return (views.historicalStudents || [])
    .map(row => {
      const studentId = text(row.studentId);
      const trialFactRows = teachingStudentTrialLessonFactRows(data, studentId, now);
      const formalFactRows = teachingStudentFormalLessonFactRows(data, studentId, now);
      const hasTrialAttended = teachingStudentHasTrialAttendedFact(data, row, now);
      return teachingStudentSummarySnapshotRow({
        ...row,
        hasTrialAttended: hasFreshTeachingLessonFacts(data) ? trialFactRows.length > 0 : hasTrialAttended,
        hasFormalAttended: hasFreshTeachingLessonFacts(data) ? formalFactRows.length > 0 : !!row.hasFormalAttended
      }, updatedAt);
    })
    .filter(Boolean);
}

function buildRawLeadConversionMetrics({ leads = [], customerLifecycleRows = [] } = {}) {
  const leadPoolRows = buildLeadPoolRows({ leads, customerLifecycleRows });
  const rawLeadPoolRows = rawLeadPoolRowsForLeads(leadPoolRows, leads);
  const stageRows = buildStageRows(rawLeadPoolRows);
  const sourceRows = buildSourceChannelStats(rawLeadPoolRows);
  const totalLeads = rawLeadPoolRows.length;
  const convertedLeads = rawLeadPoolRows.filter(row => isConvertedStage(row.leadStage)).length;
  return {
    leadPoolRows,
    rawLeadPoolRows,
    totalLeads,
    convertedLeads,
    leadConversionRate: totalLeads ? round(convertedLeads * 100 / totalLeads, 1) : 0,
    stageRows,
    sourceRows
  };
}

function rate(part, total) {
  return total ? round(Number(part) * 100 / Number(total), 1) : 0;
}

function rateText(part, total) {
  const value = rate(part, total);
  return `${Number.isInteger(value) ? value : value.toFixed(1)}%`;
}

function purchaseAmount(row = {}) {
  return Number(
    row.actualAmount
    ?? row.amountPaid
    ?? row.finalAmount
    ?? row.paidAmount
    ?? row.receivedAmount
    ?? row.amount
    ?? row.packagePrice
    ?? row.price
    ?? 0
  ) || 0;
}

function isValidCoursePurchase(row = {}) {
  const status = text(row.status || row.systemStatus || 'active');
  if (['voided', 'refunded', 'deleted', 'inactive', 'cancelled', 'canceled', '已作废', '已删除', '已取消'].includes(status)) return false;
  const courseText = text(`${row.courseType || ''} ${row.standardCourseType || ''} ${row.packageName || ''} ${row.productName || ''}`);
  if (/体验|赠课|赠送|测试/.test(courseText)) return false;
  return purchaseAmount(row) > 0;
}

function courseRepeatBuyerCount(purchases = []) {
  const byStudent = new Map();
  (purchases || []).filter(isValidCoursePurchase).forEach(row => {
    const key = text(row.studentId || row.studentName);
    if (!key) return;
    byStudent.set(key, (byStudent.get(key) || 0) + 1);
  });
  return [...byStudent.values()].filter(count => count > 1).length;
}

function standardMetric(id, label, value, denominator, sourceMetric, unit = '人') {
  const safeValue = Number(value) || 0;
  const safeDenominator = Number(denominator) || 0;
  return {
    id,
    label,
    value: safeValue,
    numerator: safeValue,
    denominator: safeDenominator,
    rate: rate(safeValue, safeDenominator),
    rateText: rateText(safeValue, safeDenominator),
    unit,
    sourceMetric
  };
}

function standardFunnelRows(rows = []) {
  const total = Number(rows[0]?.value) || 0;
  return rows.map((row, index) => {
    const count = Number(row.value) || 0;
    const previous = index > 0 ? Number(rows[index - 1]?.value) || 0 : total;
    return {
      id: row.id,
      stage: row.label,
      label: row.label,
      count,
      value: count,
      unit: row.unit || '人',
      percentOfTotal: rate(count, total),
      transitionRate: index === 0 ? 100 : rate(count, previous),
      lossRate: index === 0 ? 0 : Math.max(0, round(100 - rate(count, previous), 1)),
      numerator: count,
      denominator: index === 0 ? total : previous,
      rateText: index === 0 ? '100%' : rateText(count, previous)
    };
  });
}

function buildStandardLifecycleMetrics(data = {}) {
  const customerLifecycleRows = Array.isArray(data.customerLifecycleRows) && data.customerLifecycleRows.length
    ? data.customerLifecycleRows
    : buildCustomerLifecycleRows(data);
  const leadConversionMetrics = buildRawLeadConversionMetrics({
    leads: data.leads || [],
    customerLifecycleRows
  });
  const teachingStudentViews = buildTeachingStudentViews(customerLifecycleRows, data);
  const summary = teachingStudentViews.summary || {};
  const totalIncome = money(formalPurchaseRows({ ...data, customerLifecycleRows }).reduce((sum, row) => sum + coursePaymentAmount(row), 0));
  const recognized = formalPackageRecognizedAmount({ ...data, customerLifecycleRows });
  const packageBalance = money(totalIncome - recognized);
  const activePackageStudentCount = activeFormalPackageStudentCount({ ...data, customerLifecycleRows });
  const teachingSummary = {
    ...summary,
    activePackageStudentCount,
    totalIncome,
    recognized,
    packageBalance
  };
  const validLeads = Number(leadConversionMetrics.totalLeads) || 0;
  const courseChainStudents = Number(summary.courseStudentCount) || 0;
  const formalStudents = Number(summary.courseDealCustomers || summary.formalStudentCount) || 0;
  const historicalStudents = Number(summary.historicalStudentCount) || 0;
  const activeStudents = Number(summary.activeStudentCount) || 0;
  const trialAttendedStudents = Number(summary.trialAttendedStudentCount || summary.trialPathStudents) || 0;
  const trialAttendedToFormalPurchase = Number(summary.trialAttendedToFormalPurchaseCount || summary.trialPathDealCustomers || summary.trialToCourseCustomers) || 0;
  const trialAttendedWithoutFormal = Number(summary.trialAttendedWithoutFormalCount || summary.trialPathPendingCustomers) || Math.max(0, trialAttendedStudents - trialAttendedToFormalPurchase);
  const trialPathStudents = trialAttendedStudents;
  const trialPathDeals = trialAttendedToFormalPurchase;
  const trialPathPending = trialAttendedWithoutFormal;
  const directCourseDeals = Number(summary.directCourseCustomers) || 0;
  const totalDeals = Number(leadConversionMetrics.convertedLeads) || 0;
  const courseRepeatBuyers = summary.courseRepeatCount !== undefined ? Number(summary.courseRepeatCount) || 0 : courseRepeatBuyerCount(data.purchases || []);
  const metrics = {
    validLeads: standardMetric('VALID_LEADS', '有效线索', validLeads, validLeads, 'RAW_LEAD_POOL_ROWS', '条'),
    courseChainStudents: standardMetric('COURSE_CHAIN_STUDENTS', '普通学员', courseChainStudents, validLeads, 'COURSE_CHAIN_STUDENTS / VALID_LEADS'),
    formalStudents: standardMetric('FORMAL_STUDENTS', '正式学员', formalStudents, validLeads, 'FORMAL_STUDENTS / VALID_LEADS'),
    historicalStudents: standardMetric('HISTORICAL_STUDENTS', '历史学员', historicalStudents, validLeads, 'HISTORICAL_STUDENTS / VALID_LEADS'),
    activeStudents: standardMetric('ACTIVE_STUDENTS', '在期学员', activeStudents, historicalStudents, 'ACTIVE_STUDENTS / HISTORICAL_STUDENTS'),
    courseRepeatBuyers: standardMetric('COURSE_REPEAT_BUYERS', '课包复购', courseRepeatBuyers, formalStudents, 'COURSE_REPEAT_BUYERS / FORMAL_STUDENTS'),
    trialAttendedStudents: standardMetric('TRIAL_ATTENDED_STUDENTS', '上过体验课', trialAttendedStudents, validLeads, 'TRIAL_ATTENDED_STUDENTS / VALID_LEADS'),
    trialAttendedToFormalPurchase: standardMetric('TRIAL_ATTENDED_TO_FORMAL_PURCHASE', '体验后买正式课', trialAttendedToFormalPurchase, trialAttendedStudents, 'TRIAL_ATTENDED_TO_FORMAL_PURCHASE / TRIAL_ATTENDED_STUDENTS'),
    trialAttendedWithoutFormal: standardMetric('TRIAL_ATTENDED_WITHOUT_FORMAL', '上过体验未买正式课', trialAttendedWithoutFormal, trialAttendedStudents, 'TRIAL_ATTENDED_WITHOUT_FORMAL / TRIAL_ATTENDED_STUDENTS'),
    trialPathStudents: standardMetric('TRIAL_PATH_STUDENTS', '上过体验课', trialPathStudents, validLeads, 'TRIAL_ATTENDED_STUDENTS / VALID_LEADS'),
    trialPathDeals: standardMetric('TRIAL_PATH_DEALS', '体验后买正式课', trialPathDeals, trialPathStudents, 'TRIAL_ATTENDED_TO_FORMAL_PURCHASE / TRIAL_ATTENDED_STUDENTS'),
    trialPathPending: standardMetric('TRIAL_PATH_PENDING', '上过体验未买正式课', trialPathPending, trialPathStudents, 'TRIAL_ATTENDED_WITHOUT_FORMAL / TRIAL_ATTENDED_STUDENTS'),
    directCourseDeals: standardMetric('DIRECT_COURSE_DEALS', '直接课程成交', directCourseDeals, formalStudents || validLeads, 'DIRECT_COURSE_DEALS / FORMAL_STUDENTS'),
    totalDeals: standardMetric('TOTAL_DEALS', '总成交', totalDeals, validLeads, 'TOTAL_DEALS / VALID_LEADS', '条')
  };
  metrics.formalStudents.transitionRate = rate(trialPathDeals, courseChainStudents);
  metrics.formalStudents.transitionRateText = rateText(trialPathDeals, courseChainStudents);
  metrics.directCourseDeals.rate = rate(directCourseDeals, formalStudents);
  metrics.directCourseDeals.rateText = rateText(directCourseDeals, formalStudents);
  return {
    teachingSummary,
    metrics,
    courseRates: {
      courseChainEntryRate: metrics.courseChainStudents.rate,
      formalStudentRate: metrics.formalStudents.rate,
      formalStudentTransitionRate: metrics.formalStudents.transitionRate,
      trialPathEntryRate: metrics.trialPathStudents.rate,
      trialPathDealRate: metrics.trialPathDeals.rate,
      trialPathPendingRate: metrics.trialPathPending.rate,
      totalDealRate: metrics.totalDeals.rate
    },
    funnels: {
      courseChain: standardFunnelRows([
        { id: 'VALID_LEADS', label: '有效线索', value: validLeads, unit: '条' },
        { id: 'COURSE_CHAIN_STUDENTS', label: '普通学员', value: courseChainStudents },
        { id: 'FORMAL_STUDENTS', label: '正式学员', value: formalStudents },
        { id: 'COURSE_REPEAT_BUYERS', label: '课包复购', value: courseRepeatBuyers }
      ]),
      leadStudentRoster: standardFunnelRows([
        { id: 'VALID_LEADS', label: '线索池', value: validLeads, unit: '条' },
        { id: 'HISTORICAL_STUDENTS', label: '历史学员', value: historicalStudents },
        { id: 'ACTIVE_STUDENTS', label: '在期学员', value: activeStudents }
      ]),
      trialPath: standardFunnelRows([
        { id: 'TRIAL_ATTENDED_STUDENTS', label: '上过体验课', value: trialAttendedStudents },
        { id: 'TRIAL_ATTENDED_TO_FORMAL_PURCHASE', label: '体验后买正式课', value: trialAttendedToFormalPurchase },
        { id: 'TRIAL_ATTENDED_WITHOUT_FORMAL', label: '上过体验未买正式课', value: trialAttendedWithoutFormal }
      ]),
      trialLeadPath: standardFunnelRows([
        { id: 'VALID_LEADS', label: '线索数', value: validLeads, unit: '条' },
        { id: 'TRIAL_ATTENDED_STUDENTS', label: '体验课人数', value: trialAttendedStudents },
        { id: 'TRIAL_ATTENDED_TO_FORMAL_PURCHASE', label: '体验课后转课包', value: trialAttendedToFormalPurchase }
      ])
    },
    views: {
      leadPoolRows: leadConversionMetrics.rawLeadPoolRows,
      courseChainStudents: teachingStudentViews.courseStudents,
      formalStudents: teachingStudentViews.formalStudents,
      historicalStudents: teachingStudentViews.historicalStudents,
      activeStudents: teachingStudentViews.activeStudents,
      trialAttendedStudents: teachingStudentViews.trialAttendedStudents,
      trialAttendedToFormalPurchase: teachingStudentViews.trialAttendedToFormalPurchaseStudents,
      trialAttendedWithoutFormal: teachingStudentViews.trialAttendedWithoutFormalStudents,
      trialPathStudents: teachingStudentViews.trialPathStudents,
      trialPathDeals: teachingStudentViews.trialPathDealStudents,
      trialPathPending: teachingStudentViews.trialPathPendingStudents,
      directCourseDeals: teachingStudentViews.directCourseDealStudents
    }
  };
}

function buildScopedStandardLifecycleMetrics(data = {}, scope = {}) {
  return buildStandardLifecycleMetrics(buildScopedLifecycleSource(data, scope));
}

function countBy(rows = [], field, allowed = []) {
  const counts = new Map(allowed.map(key => [key, 0]));
  (rows || []).forEach(row => {
    const value = text(row[field]) || 'none';
    counts.set(value, (counts.get(value) || 0) + 1);
  });
  return [...counts.entries()].map(([stage, count]) => ({ stage, count })).filter(row => row.count > 0);
}

function buildPlatformMetrics(data = {}) {
  const customerLifecycleRows = Array.isArray(data.customerLifecycleRows) && data.customerLifecycleRows.length
    ? data.customerLifecycleRows
    : buildCustomerLifecycleRows(data);
  const leadConversionMetrics = buildRawLeadConversionMetrics({
    leads: data.leads || [],
    customerLifecycleRows
  });
  const { leadPoolRows, stageRows, sourceRows: sourceChannelStats, totalLeads, convertedLeads, leadConversionRate } = leadConversionMetrics;
  const teachingStudentViews = buildTeachingStudentViews(customerLifecycleRows, data);
  const standardLifecycleMetrics = buildStandardLifecycleMetrics({ ...data, customerLifecycleRows });

  return {
    customerLifecycleRows,
    teachingStudentViews,
    standardLifecycleMetrics,
    leadPoolRows,
    rawLeadPoolRows: leadConversionMetrics.rawLeadPoolRows,
    conversionMetrics: {
      totalLeads,
      convertedLeads,
      leadConversionRate,
      stageRows,
      sourceRows: sourceChannelStats
    },
    sourceChannelStats,
    studentStageStats: countBy(customerLifecycleRows.filter(row => text(row.studentStage) !== 'none'), 'studentStage', ['student', 'trial', 'formal']),
    courtStageStats: countBy(customerLifecycleRows.filter(row => text(row.courtStage) !== 'none'), 'courtStage', ['booking', 'member']),
    membershipStageStats: countBy(customerLifecycleRows.filter(row => text(row.membershipStatus)), 'membershipStatus', ['active', 'extended', 'expired', 'cleared'])
  };
}

module.exports = {
  buildPlatformMetrics,
  buildStandardLifecycleMetrics,
  buildScopedStandardLifecycleMetrics,
  buildScopedLifecycleSource,
  buildLeadPoolRows,
  buildTeachingStudentViews,
  buildCoachMiniStudentRoster,
  buildStudentTeachingSummaryRows,
  TEACHING_LESSON_DETAIL_SOURCE_VERSION,
  teachingSummaryNeedsLessonFacts,
  buildRawLeadConversionMetrics,
  rawLeadPoolRowsForLeads,
  buildStageRows,
  buildSourceChannelStats,
  lifecycleLeadStage
};
