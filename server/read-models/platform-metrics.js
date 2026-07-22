const { buildCustomerLifecycleRows } = require('./customer-lifecycle.js');
const businessTaxonomy = require('../../public/assets/scripts/core/business-taxonomy.js');

function text(value) {
  return String(value || '').trim();
}

const CAMPUS_ALIASES = { shunyi_mapo: 'shunyi_mapo', '顺义马坡': 'shunyi_mapo', '马坡': 'shunyi_mapo' };
CAMPUS_ALIASES[['ma', 'bao'].join('')] = 'shunyi_mapo';
CAMPUS_ALIASES[['马', '宝'].join('')] = 'shunyi_mapo';
function campusKey(value) {
  const raw = text(value);
  return CAMPUS_ALIASES[raw] || raw;
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
  const carrier = row.isLifecycleSynthetic
    ? (text(row.courtId) ? 'court' : text(row.studentId) ? 'student' : text(row.membershipAccountId) ? 'membership' : 'synthetic')
    : 'lead';
  const phone = leadDedupPhone(row);
  if (phone) return `${carrier}|phone:${phone}`;
  const name = leadIdentityName(row.wechatName || row.displayName || row.name);
  return name ? `${carrier}|name:${name}` : `${carrier}|id:${rowId(row)}`;
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
    leadDateMs(a.leadDate || a.createdAt) - leadDateMs(b.leadDate || b.createdAt) ||
    text(a.id).localeCompare(text(b.id))
  ))[0];
  const merged = { ...primary };
  const bestStage = [...list].sort((a, b) => leadStageRank(b.leadStage) - leadStageRank(a.leadStage))[0];
  const bestDeal = list.map(row => text(row.dealType || row.conversionType)).find(Boolean);
  merged._mergedLeadIds = [...new Set(list.map(row => text(row.id || row.sourceLeadId || row.leadId)).filter(Boolean))];
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
  return !['voided', 'refunded', 'deleted', 'inactive', 'cancelled', 'canceled', '已作废', '已删除', '已取消'].includes(status);
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
  const count = Number(row.lessonCount);
  const durationUnits = scheduleDurationLessonUnits(row);
  if (Number.isFinite(count) && count > 0) return Math.max(count, durationUnits);
  return durationUnits || 1;
}

function dateOnly(value) {
  return text(value).slice(0, 10);
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
  const scopedPurchaseIds = new Set((data.purchases || [])
    .filter(row => studentIds.has(text(row.studentId)) && scopeMatchesDate(rowScopeDate(row), scope))
    .map(row => text(row.id)).filter(Boolean));
  return {
    ...data,
    leads: (data.leads || []).filter(row => leadIds.has(text(row.id || row.leadId)) || rowInMetricScope(row, scope)),
    students: (data.students || []).filter(row => studentIds.has(text(row.id || row.studentId))),
    purchases: (data.purchases || []).filter(row => studentIds.has(text(row.studentId)) && scopeMatchesDate(rowScopeDate(row), scope)),
    entitlements: (data.entitlements || []).filter(row => studentIds.has(text(row.studentId)) && (!text(row.purchaseId) || scopedPurchaseIds.has(text(row.purchaseId)))),
    entitlementLedger: (data.entitlementLedger || []).filter(row => studentIds.has(text(row.studentId)) && scopeMatchesDate(rowScopeDate(row), scope)),
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
  const endTime = end.slice(11, 16);
  if (!date) return '';
  if (startTime && endTime) return `${date} ${startTime}-${endTime}`;
  if (startTime) return `${date} ${startTime}`;
  return date;
}

function courseTypeText(row = {}) {
  return text(row.courseType || row.standardCourseType || row.packageCourseType || row.type || row.courseTypeLevel2 || '课程');
}

function packageUnitLabel(row = {}) {
  const unit = text(row.unit || row.balanceUnit || row.lessonUnit);
  return unit || '节';
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
    const remaining = displayRows.reduce((sum, row) => sum + (Number(row.remainingLessons) || 0), 0);
    const total = displayRows.reduce((sum, row) => sum + (Number(row.totalLessons) || 0), 0);
    const packageDates = displayRows.map(row => text(row.purchaseDate)).filter(Boolean).sort();
    details.set(studentId, {
      packageListRows: displayRows,
      detailPackageOrderRows: detailRows,
      packageListText: displayRows.map(row => `${row.packageName} ${lessonQty(row.remainingLessons)}/${lessonQty(row.totalLessons)}`).join('\n') || '-',
      packageBalanceRemaining: remaining,
      packageBalanceTotal: total,
      packageBalanceText: total > 0 ? `${lessonQty(remaining)}/${lessonQty(total)}` : '-',
      packageBalancePercent: total > 0 ? Math.max(0, Math.min(100, Math.round(remaining / total * 100))) : 0,
      packagePurchaseDate: packageDates[0] || ''
    });
  });
  return details;
}

function buildTeachingStudentCompletedLessonMap(data = {}) {
  const entitlementsById = new Map((data.entitlements || []).map(row => [text(row.id), row]));
  const purchasesById = new Map((data.purchases || []).map(row => [text(row.id), row]));
  const completedByStudent = new Map();
  const ledgerScheduleIds = new Set();
  (data.entitlementLedger || []).forEach(row => {
    const delta = Number(row.lessonDelta) || 0;
    if (delta >= 0 || !activeStatus(row)) return;
    const studentId = text(row.studentId);
    if (!studentId) return;
    const entitlement = entitlementsById.get(text(row.entitlementId)) || {};
    const purchase = purchasesById.get(text(row.purchaseId || entitlement.purchaseId)) || {};
    if (courseRowIsCompanion(row) || courseRowIsCompanion(entitlement) || courseRowIsCompanion(purchase)) return;
    if (text(row.scheduleId)) ledgerScheduleIds.add(text(row.scheduleId));
    completedByStudent.set(studentId, (completedByStudent.get(studentId) || 0) + Math.abs(delta));
  });
  (data.schedule || [])
    .filter(row => teachingScheduleLessonFact(row, data.now || new Date()))
    .filter(row => !ledgerScheduleIds.has(text(row.id)))
    .forEach(row => parseArr(row.studentIds).concat(text(row.studentId)).map(text).filter(Boolean).forEach(studentId => {
      completedByStudent.set(studentId, (completedByStudent.get(studentId) || 0) + scheduleLessonUnits(row));
    }));
  return completedByStudent;
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
  const rowsByStudent = new Map();
  const ledgerScheduleIds = new Set();
  const ledgerScheduleFactKeys = new Set();
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

  (data.entitlementLedger || [])
    .filter(row => activeStatus(row) && (Number(row.lessonDelta) || 0) < 0)
    .forEach(row => {
      const studentId = text(row.studentId);
      const entitlement = entitlementsById.get(text(row.entitlementId)) || {};
      const purchase = purchasesById.get(text(row.purchaseId || entitlement.purchaseId)) || {};
      const schedule = schedulesById.get(text(row.scheduleId)) || {};
      const trial = courseRowIsTrial(row) || courseRowIsTrial(entitlement) || courseRowIsTrial(purchase) || courseRowIsTrial(schedule);
      if (trial !== includeTrial || courseRowIsCompanion(row) || courseRowIsCompanion(entitlement) || courseRowIsCompanion(purchase) || courseRowIsCompanion(schedule)) return;
      if (text(row.scheduleId)) ledgerScheduleIds.add(text(row.scheduleId));
      ledgerScheduleFactKeys.add(lessonFactKey(studentId, {
        startTime: schedule.startTime,
        relatedDate: row.relatedDate,
        scheduleTime: row.scheduleTime,
        createdAt: row.createdAt,
        coach: schedule.coach || row.coach || entitlement.ownerCoach || purchase.ownerCoach
      }));
      const sortTime = text(schedule.startTime || row.relatedDate || row.scheduleTime || row.createdAt);
      push(studentId, {
        kind: 'ledger',
        sortTime,
        time: dateTimeText(schedule, row.relatedDate || row.scheduleTime || row.createdAt),
        packageName: teachingPackageName(entitlement, purchase),
        courseType: courseTypeText(schedule.courseType ? schedule : entitlement),
        campus: text(schedule.campus || row.campus || entitlement.campus),
        venue: text(schedule.venue || row.venue),
        coach: text(schedule.coach || row.coach || entitlement.ownerCoach || purchase.ownerCoach),
        lessonDelta: Number(row.lessonDelta) || 0,
        unit: packageUnitLabel(entitlement),
        reason: text(row.reason || row.notes)
      });
    });

  (data.schedule || [])
    .filter(row => teachingScheduleLessonFact(row, data.now || new Date()))
    .filter(row => !ledgerScheduleIds.has(text(row.id)) && courseRowIsTrial(row) === includeTrial)
    .forEach(row => {
      const sortTime = text(row.startTime || row.endTime || row.createdAt);
      parseArr(row.studentIds).concat(text(row.studentId)).map(text).filter(Boolean).forEach(studentId => {
        if (ledgerScheduleFactKeys.has(lessonFactKey(studentId, row))) return;
        push(studentId, {
          kind: 'schedule',
          sortTime,
          time: dateTimeText(row),
          packageName: '',
          courseType: courseTypeText(row),
          className: text(row.className || row.courseName),
          campus: text(row.campus || row.campusName),
          venue: text(row.venue || row.court),
          coach: text(row.coach || row.coachName),
          lessonDelta: -Math.abs(scheduleLessonUnits(row)),
          unit: '节',
          reason: text(row.notes)
        });
      });
    });

  rowsByStudent.forEach((rows, studentId) => {
    rowsByStudent.set(studentId, rows.sort((a, b) => text(b.sortTime).localeCompare(text(a.sortTime))));
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

function buildTeachingStudentListFieldMap(data = {}, options = {}) {
  const packageFieldMap = buildTeachingStudentPackageFieldMap(data, options);
  const completedByStudent = buildTeachingStudentCompletedLessonMap(data);
  const coursePaidByStudent = buildTeachingStudentCoursePaidMap(data);
  const lessonDetailMap = buildTeachingStudentLessonDetailMap(data, options);
  const benefitDetailMap = buildTeachingStudentBenefitDetailMap(data);
  const feedbackMap = buildTeachingStudentRecentFeedbackMap(data);
  const details = new Map();
  [...new Set([...packageFieldMap.keys(), ...completedByStudent.keys(), ...coursePaidByStudent.keys(), ...lessonDetailMap.keys(), ...benefitDetailMap.keys(), ...feedbackMap.keys()])].forEach(studentId => {
    const packageFields = packageFieldMap.get(studentId) || {};
    const lessonRows = lessonDetailMap.get(studentId) || [];
    const benefitFields = benefitDetailMap.get(studentId) || {};
    const cumulativeCoursePaidAmount = money(coursePaidByStudent.get(studentId) || 0);
    details.set(studentId, {
      packageListRows: [],
      packageListText: '-',
      packageBalanceRemaining: 0,
      packageBalanceTotal: 0,
      packageBalanceText: '-',
      packageBalancePercent: 0,
      packagePurchaseDate: '',
      detailPackageOrderRows: [],
      detailLessonRecordRows: lessonRows,
      detailRecentLessonDate: lessonRows[0]?.time ? lessonRows[0].time.slice(0, 10) : '',
      detailBenefitRows: [],
      detailBenefitGrantRows: [],
      detailBenefitConsumeRows: [],
      detailRecentFeedbackRows: feedbackMap.get(studentId) || [],
      cumulativeCoursePaidAmount,
      cumulativeCoursePaidText: moneyText(cumulativeCoursePaidAmount),
      ...packageFields,
      detailPackageOrderRows: Array.isArray(packageFields.detailPackageOrderRows) ? packageFields.detailPackageOrderRows : [],
      ...benefitFields,
      completedLessons: round(completedByStudent.get(studentId) || 0, 1)
    });
  });
  return details;
}

function leadBusinessDate(row = {}, lead = {}) {
  return text(row.firstTouchAt || row.leadDate || row.leadEnteredAt || row.trialAtRaw || row.courseFirstPurchaseAt || row.conversionAt || lead.leadDate);
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
    if (!lifecycleInScope(lifecycle, lifecycleScope)) return;
    const sourceLeadId = text(lifecycle.sourceLeadId || lifecycle.leadId);
    const existing = sourceLeadId ? leadRows.get(sourceLeadId) : null;
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
      dealType,
      conversionType: dealType,
      studentId: realStudentId || (!existing ? text(lifecycle.studentId) : ''),
      courtId: realCourtId || (!existing ? text(lifecycle.courtId) : ''),
      membershipAccountId: realMembershipAccountId || (!existing ? text(lifecycle.membershipAccountId) : ''),
      leadDate: leadBusinessDate(lifecycle, lead),
      createdAt: text(lead.createdAt || lifecycle.createdAt || lifecycle.leadDate),
      leadStage,
      systemStatus: leadStage,
      studentStage: text(lifecycle.studentStage),
      hasTrialExperience: !!lifecycle.hasTrialExperience,
      hasTrialBooked: !!text(lifecycle.trialBookedAt || lifecycle.trialAtRaw || lead.trialBookedAt || lead.trialAtRaw || lead.trialLessonAt || lead.trialAt || lifecycle.trialAttendedAt),
      hasTrialAttended: !!text(lifecycle.trialAttendedAt || lead.trialAttendedAt),
      hasTrialToCourseConversion: !!lifecycle.hasTrialToCourseConversion,
      courseDealPath: text(lifecycle.courseDealPath),
      courtStage: text(lifecycle.courtStage),
      membershipStatus: text(lifecycle.membershipStatus),
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
    const source = businessTaxonomy.normalizeLeadSource(lead.source);
    const orphanMaterialized = isOrphanMaterializedStudentLead(lead);
    rows.set(id, {
      ...lead,
      id,
      sourceLeadId: id,
      source,
      leadDate: orphanMaterialized ? '' : text(lead.leadDate),
      dealType: orphanMaterialized ? '' : text(lead.dealType || lead.conversionType),
      conversionType: orphanMaterialized ? '' : text(lead.conversionType || lead.dealType),
      leadStage: orphanMaterialized ? '跟进中' : lifecycleLeadStage({}, lead),
      isLifecycleSynthetic: false
    });
  });

  const result = [...rows.values()];
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

function teachingScheduleCompleted(row = {}) {
  return ['已完成', '已到课', '已下课', '已消课', '已结束', 'completed', 'done'].includes(text(row.status || row.systemStatus));
}

function teachingScheduleFormal(row = {}) {
  return !courseRowIsTrial(row) && !courseRowIsCompanion(row);
}

function teachingScheduleLessonFact(row = {}, now = new Date()) {
  if (!activeStatus(row) || courseRowIsCompanion(row)) return false;
  if (teachingScheduleCompleted(row)) return true;
  const status = text(row.status || row.systemStatus);
  if (['待上课', '待确认', '预约', '已预约'].includes(status)) return false;
  const day = dateOnly(row.startTime || row.endTime || row.createdAt);
  const base = now instanceof Date
    ? `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-${String(now.getDate()).padStart(2, '0')}`
    : dateOnly(now);
  if (status === '已排课') return !!day && !!base && day <= base;
  return !!day && !!base && day <= base;
}

function teachingScheduleStudentIds(row = {}) {
  return [...new Set(parseArr(row.studentIds).concat(text(row.studentId)).map(text).filter(Boolean))];
}

function teachingScheduleStudentName(row = {}, index = 0) {
  const names = parseArr(row.studentNames).map(text).filter(Boolean);
  return names[index] || text(row.studentName || row.displayName || row.name);
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
  return (data.entitlementLedger || [])
    .filter(row => activeStatus(row) && text(row.studentId) === text(studentId) && (Number(row.lessonDelta) || 0) < 0)
    .filter(row => {
      const entitlement = entitlementsById.get(text(row.entitlementId)) || {};
      const purchase = purchasesById.get(text(row.purchaseId || entitlement.purchaseId)) || {};
      return !courseRowIsTrial(row) && !courseRowIsTrial(entitlement) && !courseRowIsTrial(purchase)
        && !courseRowIsCompanion(row) && !courseRowIsCompanion(entitlement) && !courseRowIsCompanion(purchase);
    });
}

function teachingStudentLatestFormalLessonDate(data = {}, studentId = '') {
  const now = data.now || new Date();
  const scheduleDates = teachingStudentFormalLessonFactRows(data, studentId, now)
    .map(row => dateOnly(row.startTime || row.endTime || row.createdAt));
  return scheduleDates.filter(Boolean).sort().pop() || '';
}

function teachingDaysSince(dateText = '', now = new Date()) {
  const raw = dateOnly(dateText);
  if (!raw) return null;
  const target = Date.parse(`${raw}T00:00:00`);
  const baseRaw = now instanceof Date
    ? `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-${String(now.getDate()).padStart(2, '0')}`
    : dateOnly(now);
  const base = Date.parse(`${baseRaw}T00:00:00`);
  if (!Number.isFinite(target) || !Number.isFinite(base)) return null;
  return Math.floor((base - target) / 86400000);
}

function teachingStudentHasCompletedLesson(data = {}, row = {}, now = new Date()) {
  const studentId = text(row.studentId);
  if (!studentId) return false;
  return teachingStudentScheduleRows(data, studentId, schedule => teachingScheduleLessonFact(schedule, now)).length > 0;
}

function teachingStudentHasCourseRosterEntry(row = {}) {
  return !!row.hasCourseStudentEntry
    || !!row.hasCourseConversion
    || text(row.studentStage) === 'formal';
}

function teachingStudentInHistoricalRoster(data = {}, row = {}, now = new Date()) {
  return teachingStudentHasCompletedLesson(data, row, now)
    || teachingStudentHasFormalPackage(row)
    || teachingStudentHasCourseRosterEntry(row);
}

function teachingStudentInActiveRoster(data = {}, row = {}, now = new Date()) {
  if ((Number(row.packageBalanceRemaining) || 0) > 0) return true;
  const days = teachingDaysSince(teachingStudentLatestFormalLessonDate(data, text(row.studentId)), now);
  return days !== null && days <= 90;
}

function teachingStudentHasFormalPackage(row = {}) {
  return Array.isArray(row.packageListRows) && row.packageListRows.length > 0
    || (Number(row.coursePurchaseCount) || 0) > 0
    || (Number(row.packageBalanceTotal) || 0) > 0;
}

function teachingPaymentIsPackage(row = {}) {
  const value = text([
    row.settlementType,
    row.paymentType,
    row.payType,
    row.payMethod,
    row.paymentMethod,
    row.paymentChannel
  ].filter(Boolean).join(' ')).toLowerCase();
  return /package|课包|扣课|划扣|核销/.test(value);
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
  const hasPackage = teachingStudentHasFormalPackage(studentRow) || rows.some(teachingPaymentIsPackage);
  return rows.filter(row => teachingPaymentIsDirect(row) || (!hasPackage && !teachingPaymentIsPackage(row)));
}

function teachingStudentPackageStatusLabel(row = {}) {
  const remaining = Number(row.packageBalanceRemaining) || 0;
  if (!teachingStudentHasFormalPackage(row)) return '未买过课包';
  if (remaining > 0 && remaining <= 2) return '课包即将耗尽';
  if (remaining > 0) return '课包有余额';
  return '课包已用完';
}

function teachingStudentActivityStatusLabel(data = {}, row = {}, now = new Date()) {
  const days = teachingDaysSince(teachingStudentLatestFormalLessonDate(data, text(row.studentId)), now);
  if (days === null) return '从未正式上课';
  if (days <= 30) return '近30天活跃';
  if (days <= 90) return '31-90天活跃';
  if (days <= 180) return '91-180天沉默';
  return '180天以上沉睡';
}

function teachingStudentPaymentModeLabel(data = {}, row = {}, now = new Date()) {
  const studentId = text(row.studentId);
  const formalLessonRows = teachingStudentFormalLessonFactRows(data, studentId, now);
  const hasPackage = teachingStudentHasFormalPackage(row) || formalLessonRows.some(teachingPaymentIsPackage);
  const hasDirect = teachingStudentDirectFormalLessonRows(data, studentId, now, row).length > 0;
  if (hasPackage && hasDirect) return '课包+单次付费';
  if (hasDirect) return '单次付费学员';
  if (hasPackage) return '课包学员';
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
  const isHistoricalStudentRoster = teachingStudentInHistoricalRoster(data, row, now);
  const isActiveStudentRoster = isHistoricalStudentRoster && teachingStudentInActiveRoster(data, row, now);
  return {
    ...row,
    lastFormalLessonAt: teachingStudentLatestFormalLessonDate(data, text(row.studentId)),
    packageStatusLabel: teachingStudentPackageStatusLabel(row),
    paymentModeLabel: teachingStudentPaymentModeLabel(data, row, now),
    activityStatusLabel: teachingStudentActivityStatusLabel(data, row, now),
    lessonVolumeLabel: teachingStudentLessonVolumeLabel(row),
    studentStatusLabel: teachingStudentStudentStatusLabel(data, row, now),
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
  return [...byStudentId.values()];
}

function buildTeachingStudentViews(customerLifecycleRows = [], data = {}) {
  const studentRows = buildTeachingStudentSourceRows(customerLifecycleRows, data);
  const now = data.now || new Date();
  const courseListFieldMap = buildTeachingStudentListFieldMap(data, { includeTrial: true });
  const formalListFieldMap = buildTeachingStudentListFieldMap(data, { includeTrial: false });
  const courseViewRow = row => teachingStudentViewRow(row, courseListFieldMap.get(text(row.studentId)) || {});
  const formalViewRow = row => teachingStudentViewRow(row, formalListFieldMap.get(text(row.studentId)) || {});
  const hasTrialAttended = row => teachingStudentTrialLessonFactRows(data, text(row.studentId), now).length > 0;
  const hasFormalAttended = row => teachingStudentFormalLessonFactRows(data, text(row.studentId), now).length > 0;
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
    const days = teachingDaysSince(teachingStudentLatestFormalLessonDate(data, text(row.studentId)), now);
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
  buildRawLeadConversionMetrics,
  rawLeadPoolRowsForLeads,
  buildStageRows,
  buildSourceChannelStats,
  lifecycleLeadStage
};
