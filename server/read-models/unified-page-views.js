const { effectiveScheduleStatus } = require('../schedule.js');

function text(value) {
  return String(value || '').trim();
}

function round(value, digits = 1) {
  const base = 10 ** digits;
  return Math.round((Number(value) || 0) * base) / base;
}

function money(value) {
  return Math.round((Number(value) || 0) * 100) / 100;
}

function parseArr(value) {
  if (Array.isArray(value)) return value;
  if (typeof value === 'string' && value.trim()) {
    try {
      const parsed = JSON.parse(value);
      return Array.isArray(parsed) ? parsed : [];
    } catch {
      return [];
    }
  }
  return [];
}

function dateKey(value) {
  return text(value).slice(0, 10);
}

function monthKey(value) {
  return text(value).slice(0, 7);
}

function localDate(value) {
  const parsed = new Date(text(value).replace(' ', 'T'));
  return Number.isNaN(parsed.getTime()) ? null : parsed;
}

function weekKey(value) {
  const parsed = localDate(value);
  if (!parsed) return '';
  const day = parsed.getDay();
  parsed.setHours(0, 0, 0, 0);
  parsed.setDate(parsed.getDate() - day + (day === 0 ? -6 : 1));
  return `${parsed.getFullYear()}-${String(parsed.getMonth() + 1).padStart(2, '0')}-${String(parsed.getDate()).padStart(2, '0')}`;
}

function overlapCount(rows = []) {
  const sorted = (rows || [])
    .filter(row => text(row.startTime) && text(row.endTime))
    .sort((a, b) => text(a.startTime).localeCompare(text(b.startTime)));
  let count = 0;
  for (let i = 0; i < sorted.length; i += 1) {
    for (let j = i + 1; j < sorted.length; j += 1) {
      if (text(sorted[j].startTime) >= text(sorted[i].endTime)) break;
      count += 1;
    }
  }
  return count;
}

function rowActive(row = {}) {
  const status = text(row.status || row.systemStatus || 'active');
  return !['voided', 'refunded', 'deleted', 'inactive', 'cancelled', 'canceled', '已作废', '已删除', '已取消'].includes(status);
}

function lessonUnits(row = {}) {
  const count = Number(row.lessonCount);
  if (Number.isFinite(count) && count > 0) return count;
  const start = Date.parse(text(row.startTime).replace(' ', 'T'));
  const end = Date.parse(text(row.endTime).replace(' ', 'T'));
  if (Number.isFinite(start) && Number.isFinite(end) && end > start) return round((end - start) / 3600000, 1);
  return 1;
}

function courseTypeText(row = {}) {
  const raw = text(row.courseType || row.standardCourseType || row.experienceType || row.packageName || row.productName);
  if (/体验/.test(raw)) return '体验课';
  if (/小班|班课|训练营/.test(raw)) return '小班课';
  if (/陪打/.test(raw)) return '陪打';
  return raw || '私教课';
}

function timeBand(row = {}) {
  const hour = parseInt(text(row.startTime).slice(11, 13), 10);
  if (!Number.isFinite(hour)) return '未记录';
  if (hour >= 17 && hour < 21) return '晚高峰';
  if (hour >= 9 && hour < 12) return '上午';
  if (hour >= 12 && hour < 17) return '下午';
  return '其他';
}

function distText(rows = [], valueOf = () => '') {
  const counts = new Map();
  (rows || []).forEach(row => {
    const value = text(valueOf(row)) || '未记录';
    counts.set(value, (counts.get(value) || 0) + 1);
  });
  return [...counts.entries()]
    .sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0], 'zh-Hans-CN'))
    .map(([key, count]) => `${key} ${count}`)
    .join('｜') || '-';
}

function coachOpsSummary(rows = []) {
  const completedRows = rows.filter(row => row.effectiveStatus === '已结束');
  return {
    totalLessonUnits: round(rows.reduce((sum, row) => sum + (Number(row.lessonUnits) || 0), 0), 1),
    feedbackCount: completedRows.filter(row => row.hasFeedback).length,
    pendingFeedbackCount: completedRows.filter(row => !row.hasFeedback).length,
    pending: completedRows.filter(row => !row.hasFeedback).length,
    conflictCount: overlapCount(rows),
    courseTypeDistributionText: distText(rows, row => row.courseType),
    campusDistributionText: distText(rows, row => row.campusName),
    timeBandDistributionText: distText(rows, row => row.timeBand),
    mainCampus: distText(rows, row => row.campusName).split(' ')[0] || ''
  };
}

function coachOpsSummaryMap(rows = [], keyOf = () => '') {
  const grouped = new Map();
  rows.forEach(row => {
    const key = keyOf(row);
    if (!key) return;
    const list = grouped.get(key) || [];
    list.push(row);
    grouped.set(key, list);
  });
  return Object.fromEntries([...grouped.entries()].map(([key, list]) => [key, coachOpsSummary(list)]));
}

function coachOpsSummaryBuckets(rows = []) {
  return {
    day: coachOpsSummaryMap(rows, row => dateKey(row.startTime)),
    week: coachOpsSummaryMap(rows, row => weekKey(row.startTime)),
    month: coachOpsSummaryMap(rows, row => monthKey(row.startTime))
  };
}

function scheduleHasFeedback(schedule = {}, feedbacks = []) {
  if (schedule.feedbackId || schedule.feedbackAt || schedule.feedbackStatus === '已反馈') return true;
  const id = text(schedule.id);
  if (!id) return false;
  return (feedbacks || []).some(row => text(row.scheduleId) === id);
}

function scheduleCampusText(row = {}, campuses = []) {
  const raw = text(row.campus || row.campusName);
  const hit = (campuses || []).find(campus => [campus.id, campus.code, campus.name].map(text).includes(raw));
  return text(hit?.name || raw) || '未记录';
}

function coachNameKey(value) {
  return text(value)
    .toLowerCase()
    .replace(/[.·\s]/g, '')
    .replace(/[（(][^）)]*[）)]/g, '')
    .replace(/教练$/, '')
    .trim();
}

const COACH_DISPLAY_NAME_ALIASES = new Map([
  ['沙琪儿', 'Siren 教练'],
  ['siren', 'Siren 教练'],
  ['Siren', 'Siren 教练'],
  ['朝珺', '朝珺教练'],
  ['甄朝珺', '朝珺教练'],
  ['chaojun', '朝珺教练'],
  ['Rive', 'Rive 天昊教练'],
  ['rive', 'Rive 天昊教练'],
  ['RIVE', 'Rive 天昊教练'],
  ['River', 'Rive 天昊教练'],
  ['river', 'Rive 天昊教练'],
  ['天昊', 'Rive 天昊教练'],
  ['Rive 天昊', 'Rive 天昊教练'],
  ['Rive天昊', 'Rive 天昊教练'],
  ['River 天昊', 'Rive 天昊教练'],
  ['River天昊', 'Rive 天昊教练'],
  ['Rive 教练', 'Rive 天昊教练'],
  ['Rive教练', 'Rive 天昊教练'],
  ['RIVE 教练', 'Rive 天昊教练'],
  ['RIVE教练', 'Rive 天昊教练'],
  ['晓哲', '晓哲教练']
]);

function buildCoachDisplayNameResolver(coaches = []) {
  const map = new Map();
  COACH_DISPLAY_NAME_ALIASES.forEach((name, alias) => {
    map.set(coachNameKey(alias), name);
  });
  (coaches || []).forEach(row => {
    const name = map.get(coachNameKey(row.name || row.coachName)) || text(row.name || row.coachName);
    const id = text(row.id || row.coachId);
    if (!name) return;
    [name, id, row.alias, row.aliases, row.nickname, row.nickName, row.displayName, row.username]
      .flatMap(value => Array.isArray(value) ? value : [value])
      .map(coachNameKey)
      .filter(Boolean)
      .forEach(key => map.set(key, name));
  });
  return value => map.get(coachNameKey(value)) || text(value);
}

function buildCoachOpsUnifiedView({ coaches = [], schedule = [], feedbacks = [], campuses = [] } = {}) {
  const activeCoaches = (coaches || []).filter(row => text(row.status || 'active') !== 'inactive');
  const coachDisplayName = buildCoachDisplayNameResolver(coaches);
  const coachNames = new Set(activeCoaches.map(row => coachDisplayName(row.name || row.coachName)).filter(Boolean));
  (schedule || []).forEach(row => {
    const coach = coachDisplayName(row.coach || row.coachName || row.primaryCoach || row.teacher);
    if (coach) coachNames.add(coach);
  });

  const sourceRows = (schedule || [])
    .filter(row => text(row.startTime))
    .filter(row => effectiveScheduleStatus(row) !== '已取消')
    .map(row => ({
      ...row,
      coachDisplayName: coachDisplayName(row.coach || row.coachName || row.primaryCoach || row.teacher) || '未分配',
      date: dateKey(row.startTime),
      month: monthKey(row.startTime),
      startMs: Date.parse(text(row.startTime).replace(' ', 'T')),
      endMs: Date.parse(text(row.endTime).replace(' ', 'T')),
      lessonUnits: lessonUnits(row),
      courseType: courseTypeText(row),
      campusName: row.locationType === 'external' ? text(row.externalVenueName || '外部场馆') : scheduleCampusText(row, campuses),
      timeBand: timeBand(row),
      hasFeedback: scheduleHasFeedback(row, feedbacks),
      effectiveStatus: effectiveScheduleStatus(row)
    }));

  const rowsByCoach = new Map();
  sourceRows.forEach(row => {
    const list = rowsByCoach.get(row.coachDisplayName) || [];
    list.push(row);
    rowsByCoach.set(row.coachDisplayName, list);
  });

  const rows = [...coachNames].sort((a, b) => a.localeCompare(b, 'zh-Hans-CN')).map(name => {
    const mine = rowsByCoach.get(name) || [];
    const completedRows = mine.filter(row => row.effectiveStatus === '已结束');
    const campusNames = [...new Set(mine.map(row => row.campusName).filter(Boolean))];
    return {
      name,
      sortOrder: Number(activeCoaches.find(row => coachDisplayName(row.name || row.coachName) === name)?.sortOrder) || 9999,
      rows: mine,
      totalLessonUnits: round(mine.reduce((sum, row) => sum + (Number(row.lessonUnits) || 0), 1), 1),
      feedbackCount: completedRows.filter(row => row.hasFeedback).length,
      pendingFeedbackCount: completedRows.filter(row => !row.hasFeedback).length,
      courseTypeDistributionText: distText(mine, row => row.courseType),
      campusDistributionText: distText(mine, row => row.campusName),
      timeBandDistributionText: distText(mine, row => row.timeBand),
      mainCampus: distText(mine, row => row.campusName).split(' ')[0] || '',
      summaries: {
        all: coachOpsSummaryBuckets(mine),
        byCampus: Object.fromEntries(campusNames.map(campusName => [
          campusName,
          coachOpsSummaryBuckets(mine.filter(row => row.campusName === campusName))
        ]))
      }
    };
  });

  return {
    rows,
    generatedAt: new Date().toISOString()
  };
}

function buildPackagePurchaseCountMap(purchases = [], entitlements = []) {
  const purchasePackageById = new Map((purchases || []).map(row => [text(row.id), text(row.packageId || row.originalPackageId)]));
  const packageByPurchase = new Map(purchasePackageById);
  (entitlements || []).forEach(row => {
    const purchaseId = text(row.purchaseId);
    const packageId = text(row.packageId || row.originalPackageId);
    if (purchaseId && packageId) packageByPurchase.set(purchaseId, packageId);
  });
  const counts = new Map();
  (purchases || []).filter(rowActive).forEach(row => {
    const purchaseId = text(row.id);
    const packageId = text(row.packageId || row.originalPackageId || packageByPurchase.get(purchaseId));
    if (!packageId) return;
    counts.set(packageId, (counts.get(packageId) || 0) + 1);
  });
  return counts;
}

function buildPackagePurchaseOwnerCountMap(purchases = [], entitlements = []) {
  const purchasePackageById = new Map((purchases || []).map(row => [text(row.id), text(row.packageId || row.originalPackageId)]));
  const packageByPurchase = new Map(purchasePackageById);
  (entitlements || []).forEach(row => {
    const purchaseId = text(row.purchaseId);
    const packageId = text(row.packageId || row.originalPackageId);
    if (purchaseId && packageId) packageByPurchase.set(purchaseId, packageId);
  });
  const counts = new Map();
  (purchases || []).filter(rowActive).forEach(row => {
    const purchaseId = text(row.id);
    const packageId = text(row.packageId || row.originalPackageId || packageByPurchase.get(purchaseId));
    const ownerCoach = text(row.ownerCoach);
    if (!packageId || !ownerCoach) return;
    const packageCounts = counts.get(packageId) || {};
    packageCounts[ownerCoach] = (Number(packageCounts[ownerCoach]) || 0) + 1;
    counts.set(packageId, packageCounts);
  });
  return counts;
}

function buildPurchaseUnifiedView({ purchases = [], packages = [], students = [], entitlements = [], entitlementLedger = [], customerLifecycleRows = [] } = {}) {
  const packageById = new Map((packages || []).map(row => [text(row.id), row]));
  const studentById = new Map((students || []).map(row => [text(row.id), row]));
  const lifecycleByStudentId = new Map((customerLifecycleRows || []).map(row => [text(row.studentId), row]));
  const entitlementsByPurchase = new Map();
  (entitlements || []).forEach(row => {
    const key = text(row.purchaseId);
    if (!key) return;
    const list = entitlementsByPurchase.get(key) || [];
    list.push(row);
    entitlementsByPurchase.set(key, list);
  });
  const ledgerByPurchase = new Map();
  (entitlementLedger || []).forEach(row => {
    const key = text(row.purchaseId);
    if (!key) return;
    const list = ledgerByPurchase.get(key) || [];
    list.push(row);
    ledgerByPurchase.set(key, list);
  });

  const rows = (purchases || []).map(row => {
    const packageId = text(row.packageId || row.originalPackageId);
    const pkg = packageById.get(packageId) || {};
    const student = studentById.get(text(row.studentId)) || {};
    const lifecycle = lifecycleByStudentId.get(text(row.studentId)) || {};
    const purchaseEntitlements = entitlementsByPurchase.get(text(row.id)) || [];
    const purchaseLedgerRows = ledgerByPurchase.get(text(row.id)) || [];
    const packageLessons = Number(row.packageLessons ?? row.totalLessons ?? pkg.lessons ?? pkg.totalLessons) || 0;
    const remainingLessons = purchaseEntitlements.reduce((sum, ent) => sum + (Number(ent.remainingLessons) || 0), 0);
    const usedLessons = purchaseEntitlements.reduce((sum, ent) => sum + (Number(ent.usedLessons) || 0), 0);
    const ledgerCount = purchaseLedgerRows.length || Number(row.ledgerCount || row.entitlementLedgerCount || 0) || 0;
    return {
      ...row,
      studentName: text(row.studentName || student.name),
      packageId,
      packageName: text(row.packageName || pkg.name || pkg.packageName),
      campus: text(lifecycle.campus || row.campus || student.campus || parseArr(row.campusIds)[0] || parseArr(pkg.campusIds)[0]),
      ownerCoach: text(row.ownerCoach || pkg.ownerCoach || lifecycle.formalCoach || lifecycle.owner),
      amountPaid: money(row.finalAmount ?? row.amountPaid ?? row.actualAmount ?? row.paidAmount ?? row.amount),
      packageLessons,
      remainingLessons,
      usedLessons,
      ledgerCount,
      hasLedger: ledgerCount > 0 || usedLessons > 0,
      ledgerRows: purchaseLedgerRows,
      meaningful: !!(text(row.purchaseDate || row.studentName || row.packageName || row.payMethod || row.ownerCoach) || Number(row.amountPaid) > 0 || packageLessons > 0)
    };
  });

  return { rows, generatedAt: new Date().toISOString() };
}

function buildPackageUnifiedView({ packages = [], purchases = [], entitlements = [] } = {}) {
  const purchaseCounts = buildPackagePurchaseCountMap(purchases, entitlements);
  const ownerCounts = buildPackagePurchaseOwnerCountMap(purchases, entitlements);
  return {
    rows: (packages || []).map(row => ({
      ...row,
      purchaseCount: purchaseCounts.get(text(row.id)) || 0,
      purchaseCountByOwnerCoach: ownerCounts.get(text(row.id)) || {}
    })),
    generatedAt: new Date().toISOString()
  };
}

function buildEntitlementUnifiedView({ entitlements = [], students = [] } = {}) {
  const studentById = new Map((students || []).map(row => [text(row.id), row]));
  return {
    rows: (entitlements || []).map(row => {
      const student = studentById.get(text(row.studentId)) || {};
      return {
        ...row,
        studentName: text(row.studentName || student.name),
        remainingLessons: Number(row.remainingLessons) || 0,
        totalLessons: Number(row.totalLessons) || 0,
        status: text(row.status || row.systemStatus || 'active')
      };
    }),
    generatedAt: new Date().toISOString()
  };
}

function financeDeferredType(row = {}) {
  if (row.businessTypeLevel1 === '课程' || row.businessType === '课程') return '课包待确认';
  if (row.businessTypeLevel1 === '储值' || ['会员储值', '会员订场'].includes(row.businessType)) return '会员储值待确认';
  return '';
}

function financeDeferredSource(row = {}) {
  const type = financeDeferredType(row);
  if (type === '会员储值待确认') return '订场会员储值';
  return text(row.debitTarget || row.packageName || row.incomeType || row.sourceProject) || '课包';
}

function buildFinancePrepaidView(financeRows = [], options = {}) {
  const membershipBalanceRows = Array.isArray(options.membershipBalanceRows) ? options.membershipBalanceRows : [];
  const shouldUseMembershipBalanceRows = membershipBalanceRows.length > 0;
  const grouped = new Map();
  (financeRows || []).forEach(row => {
    if (row?.differenceReason) return;
    const amount = Number(row?.deferredRevenueDelta) || 0;
    if (!amount) return;
    const deferredType = financeDeferredType(row);
    if (!deferredType) return;
    if (shouldUseMembershipBalanceRows && deferredType === '会员储值待确认') return;
    const customer = text(row.customer || row.studentName) || '—';
    const campusName = text(row.campusName) || '—';
    const source = financeDeferredSource(row);
    const key = [deferredType, customer, campusName, source].join('|');
    const current = grouped.get(key) || { id: key, customer, campusName, deferredType, deferredAmount: 0, source, notes: '' };
    current.deferredAmount = money(current.deferredAmount + amount);
    current.notes = current.notes || row.sourceDocument || row.notes || '';
    grouped.set(key, current);
  });
  membershipBalanceRows.forEach(row => {
    const amount = Number(row?.deferredAmount) || 0;
    if (amount <= 0.009) return;
    const customer = text(row.customer || row.name) || '—';
    const campusName = text(row.campusName) || '—';
    const source = text(row.source) || '订场会员储值';
    const key = ['会员储值待确认', customer, campusName, source].join('|');
    grouped.set(key, {
      id: text(row.id) || key,
      customer,
      campusName,
      deferredType: '会员储值待确认',
      deferredAmount: money(amount),
      source,
      notes: text(row.notes)
    });
  });
  const rows = [...grouped.values()]
    .filter(row => Number(row.deferredAmount) > 0.009)
    .sort((a, b) => Number(b.deferredAmount) - Number(a.deferredAmount));
  const summary = {
    totalDeferredAmount: money(rows.reduce((sum, row) => sum + (Number(row.deferredAmount) || 0), 0)),
    lessonDeferredAmount: money(rows.filter(row => row.deferredType === '课包待确认').reduce((sum, row) => sum + (Number(row.deferredAmount) || 0), 0)),
    storedDeferredAmount: money(rows.filter(row => row.deferredType === '会员储值待确认').reduce((sum, row) => sum + (Number(row.deferredAmount) || 0), 0)),
    customerCount: rows.length
  };
  summary.coursePrepaidAmount = summary.lessonDeferredAmount;
  summary.memberPrepaidAmount = summary.storedDeferredAmount;
  const summaryForRows = scopedRows => ({
    totalDeferredAmount: money(scopedRows.reduce((sum, row) => sum + (Number(row.deferredAmount) || 0), 0)),
    lessonDeferredAmount: money(scopedRows.filter(row => row.deferredType === '课包待确认').reduce((sum, row) => sum + (Number(row.deferredAmount) || 0), 0)),
    storedDeferredAmount: money(scopedRows.filter(row => row.deferredType === '会员储值待确认').reduce((sum, row) => sum + (Number(row.deferredAmount) || 0), 0)),
    coursePrepaidAmount: money(scopedRows.filter(row => row.deferredType === '课包待确认').reduce((sum, row) => sum + (Number(row.deferredAmount) || 0), 0)),
    memberPrepaidAmount: money(scopedRows.filter(row => row.deferredType === '会员储值待确认').reduce((sum, row) => sum + (Number(row.deferredAmount) || 0), 0)),
    customerCount: scopedRows.length
  });
  const campusNames = [...new Set(rows.map(row => row.campusName).filter(Boolean))];
  return {
    rows,
    summary,
    summaryByCampus: Object.fromEntries(campusNames.map(campusName => [
      campusName,
      summaryForRows(rows.filter(row => row.campusName === campusName))
    ]))
  };
}

module.exports = {
  buildCoachOpsUnifiedView,
  buildPurchaseUnifiedView,
  buildPackageUnifiedView,
  buildEntitlementUnifiedView,
  buildFinancePrepaidView
};
