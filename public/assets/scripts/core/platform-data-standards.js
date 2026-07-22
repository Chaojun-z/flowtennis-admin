(function(root, factory) {
  const api = factory();
  if (typeof module === 'object' && module.exports) module.exports = api;
  root.FlowTennisPlatformDataStandards = api;
})(typeof window !== 'undefined' ? window : globalThis, function() {
  function rateText(value, total) {
    if (!total) return '0%';
    const percent = (value / total) * 100;
    return `${Number.isInteger(percent) ? percent : percent.toFixed(1)}%`;
  }

  function leadFunnelStats(rows = [], predicates = {}) {
    const base = Array.isArray(rows) ? rows : [];
    const trialBookedRows = base.filter(row => !!predicates.trialBooked?.(row));
    const trialDoneRows = base.filter(row => !!predicates.trialDone?.(row));
    const convertedRows = base.filter(row => !!predicates.converted?.(row));
    const courseConvertedRows = base.filter(row => !!predicates.courseConverted?.(row));
    const trialCourseConvertedRows = base.filter(row => !!predicates.trialCourseConverted?.(row));
    const directCourseConvertedRows = courseConvertedRows.filter(row => !predicates.trialCourseConverted?.(row));
    const trialPendingConversion = trialDoneRows.length - trialCourseConvertedRows.length;
    return {
      total: base.length,
      trialBooked: trialBookedRows.length,
      trialBookedRate: rateText(trialBookedRows.length, base.length),
      trialDone: trialDoneRows.length,
      trialAttendanceRate: rateText(trialDoneRows.length, trialBookedRows.length),
      courseConverted: courseConvertedRows.length,
      courseConversionRate: rateText(courseConvertedRows.length, base.length),
      trialCourseConverted: trialCourseConvertedRows.length,
      trialCourseConversionRate: rateText(trialCourseConvertedRows.length, trialDoneRows.length),
      directCourseConverted: directCourseConvertedRows.length,
      converted: convertedRows.length,
      leadConversionRate: rateText(convertedRows.length, base.length),
      trialPendingConversion,
      trialPendingConversionRate: rateText(trialPendingConversion, trialDoneRows.length)
    };
  }

  function rowsArray(rows) {
    return Array.isArray(rows) ? rows : [];
  }

  function text(value) {
    return String(value ?? '').trim();
  }

  function num(value) {
    return Number(value) || 0;
  }

  function money(value) {
    return Math.round(num(value) * 100) / 100;
  }

  function isStoredValuePayMethod(value) {
    const method = text(value);
    return method === '储值扣款' || method === '储值卡' || method.includes('储值');
  }

  function identityValues(row = {}) {
    return [
      row.customerKey,
      row.sourceLeadId,
      row.leadId,
      row.id,
      row.studentId,
      row.courtId,
      row.membershipAccountId
    ].map(text).filter(Boolean);
  }

  function identitySet(rows = []) {
    const set = new Set();
    rowsArray(rows).forEach(row => identityValues(row).forEach(value => set.add(value)));
    return set;
  }

  function rowMatchesIdentity(row = {}, set = new Set()) {
    return identityValues(row).some(value => set.has(value));
  }

  function countViewRows(viewRows = [], visibleRows = [], fallback) {
    const visible = rowsArray(visibleRows);
    const view = rowsArray(viewRows);
    if (view.length) {
      const keys = identitySet(visible);
      return view.filter(row => rowMatchesIdentity(row, keys)).length;
    }
    return visible.filter(row => !!fallback?.(row)).length;
  }

  function currentLeadSummary(rows = [], standard = {}) {
    const base = rowsArray(rows);
    const views = standard?.views || {};
    const historicalStudents = countViewRows(views.historicalStudents, base, row => row.isHistoricalStudentRoster || row.hasTrialAttended || row.hasCourseConversion);
    const activeStudents = countViewRows(views.activeStudents, base, row => row.isActiveStudentRoster);
    const trialAttended = countViewRows(views.trialAttendedStudents, base, row => row.hasTrialAttended || text(row.trialAttendedAt));
    const trialAttendedToFormalPurchase = countViewRows(views.trialAttendedToFormalPurchase, base, row => row.hasTrialToCourseConversion);
    return {
      total: base.length,
      historicalStudents,
      historicalStudentRate: rateText(historicalStudents, base.length),
      activeStudents,
      activeStudentRate: rateText(activeStudents, historicalStudents),
      trialAttended,
      trialAttendedRate: rateText(trialAttended, base.length),
      trialAttendedToFormalPurchase,
      trialAttendedToFormalPurchaseRate: rateText(trialAttendedToFormalPurchase, trialAttended)
    };
  }

  function studentActivityText(row = {}) {
    return text(row.activityStatusLabel || row.activityStatus || row.activityRange);
  }

  function studentPackageStatusText(row = {}) {
    return text(row.packageStatusLabel || row.packageStatus);
  }

  function currentStudentSummary(rows = [], mode = 'package') {
    const base = rowsArray(rows);
    const isTrial = mode === 'trial';
    const trialAttended = row => row.hasTrialAttended || text(row.trialAttendedAt || row.trialLessonAt) || /已体验|上过体验/.test(text(row.trialStatus || row.trialPathStatus));
    const formalAttended = row => row.hasFormalAttended || num(row.formalLessonCount || row.completedFormalLessonCount || row.completedLessons) > 0 || text(row.lastFormalLessonDate);
    const formal30 = row => row.formalLessonWithin30 || studentActivityText(row) === '近30天活跃';
    const formal90 = row => row.formalLessonWithin90 || ['近30天活跃', '31-90天活跃'].includes(studentActivityText(row));
    const packageBalance = row => num(row.packageBalanceRemaining) > 0 || ['课包有余额', '课包即将耗尽'].includes(studentPackageStatusText(row));
    const packageLow = row => {
      const remaining = num(row.packageBalanceRemaining);
      return studentPackageStatusText(row) === '课包即将耗尽' || (remaining > 0 && remaining <= 2);
    };
    if (isTrial) {
      const historicalTrialAttendedCount = base.filter(trialAttended).length;
      const historicalFormalAttendedCount = base.filter(formalAttended).length;
      return {
        total: base.length,
        historicalTrialAttendedCount,
        historicalFormalAttendedCount,
        historicalTrialWithoutFormalCount: base.filter(row => trialAttended(row) && !formalAttended(row)).length,
        historicalFormalLesson30Count: base.filter(formal30).length
      };
    }
    return {
      total: base.length,
      activeFormalLesson30Count: base.filter(formal30).length,
      activeFormalLesson90Count: base.filter(formal90).length,
      activePackageBalanceCount: base.filter(packageBalance).length,
      activePackageLowCount: base.filter(packageLow).length
    };
  }

  function currentCourtAccountSummary(rows = []) {
    const base = rowsArray(rows);
    const memberRows = base.filter(row => row.accountType === '会员账户' || text(row.membershipStatusCode || row.membershipStatus));
    const totalBookingCount = base.reduce((sum, row) => sum + num(row.bookingCount), 0);
    const totalMemberBookingCount = base.reduce((sum, row) => sum + num(row.memberBookingCount), 0);
    const totalBookingAmount = money(base.reduce((sum, row) => sum + num(row.bookingAmount), 0));
    const totalMemberBookingAmount = money(base.reduce((sum, row) => sum + num(row.memberBookingAmount), 0));
    return {
      totalCount: base.length,
      totalMemberCount: memberRows.length,
      totalBalance: money(base.reduce((sum, row) => sum + num(row.balance), 0)),
      totalDeposit: money(base.reduce((sum, row) => sum + num(row.totalDeposit), 0)),
      totalSpent: money(base.reduce((sum, row) => sum + num(row.totalSpent), 0)),
      totalReceived: money(base.reduce((sum, row) => sum + num(row.totalReceived), 0)),
      totalBookingCount,
      totalBookingHours: money(base.reduce((sum, row) => sum + num(row.bookingHours), 0)),
      totalMemberBookingCount,
      totalMemberBookingAmount,
      totalGuestBookingCount: Math.max(0, totalBookingCount - totalMemberBookingCount),
      totalGuestBookingAmount: Math.max(0, money(totalBookingAmount - totalMemberBookingAmount)),
      totalBookingAmount
    };
  }

  function currentMembershipSummary(rows = []) {
    const base = rowsArray(rows);
    const rechargeRows = base.flatMap(row => rowsArray(row.rechargeRows));
    const paidAmount = money(rechargeRows.length
      ? rechargeRows.reduce((sum, row) => sum + num(row.paidAmount ?? row.rechargeAmount ?? row.finalAmount ?? row.amount), 0)
      : base.reduce((sum, row) => sum + num(row.totalDeposit), 0));
    const bonusAmount = money(rechargeRows.length
      ? rechargeRows.reduce((sum, row) => sum + num(row.bonusAmount), 0)
      : base.reduce((sum, row) => sum + num(row.totalBonus || row.bonusAmount), 0));
    const pendingAmount = money(base.reduce((sum, row) => sum + num(row.balance), 0));
    const consumableAmount = paidAmount + bonusAmount > 0 ? money(paidAmount + bonusAmount) : pendingAmount;
    const consumedAmount = money(Math.max(0, consumableAmount - pendingAmount));
    return {
      memberCount: base.length,
      rechargeCount: base.reduce((sum, row) => sum + (rowsArray(row.rechargeRows).length || num(row.membershipRechargeCount)), 0),
      paidAmount,
      bonusAmount,
      consumableAmount,
      consumedAmount,
      pendingAmount
    };
  }

  function currentMatchSummary(rows = []) {
    const base = rowsArray(rows);
    return {
      totalCount: base.length,
      registeredCount: base.reduce((sum, row) => sum + (rowsArray(row.registrations).length || num(row.currentHeadcount)), 0),
      formedCount: base.filter(row => ['group_ready', 'group_locked', 'ready', 'locked'].includes(text(row.formationStatus || row.status))).length,
      estimatedCourtFee: money(base.reduce((sum, row) => sum + num(row.estimatedCourtFee), 0)),
      finalCourtFee: money(base.reduce((sum, row) => sum + num(row.booking?.finalcourtfee ?? row.booking?.finalCourtFee ?? row.finalCourtFee), 0))
    };
  }

  return {
    rateText,
    leadFunnelStats,
    currentLeadSummary,
    currentStudentSummary,
    currentCourtAccountSummary,
    currentMembershipSummary,
    currentMatchSummary
  };
});
