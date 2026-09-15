function createWorkbenchReadModel({
  parseArr,
  parseLessonValue,
  displayCampusName,
  effectiveScheduleStatus,
  dateMs,
  dateKey,
  normalizeCampusValue,
  scheduleHasFeedbackRecord,
  collectCoachFeedbackReminderCandidates
} = {}) {
  function workbenchStandardTrialStats(standardLifecycleMetrics = {}) {
    const metrics = standardLifecycleMetrics && standardLifecycleMetrics.metrics || {};
    const trialStudents = metrics.trialPathStudents || {};
    const trialDeals = metrics.trialPathDeals || {};
    const total = parseInt(trialStudents.value, 10) || 0;
    const converted = parseInt(trialDeals.value, 10) || 0;
    const conversionRate = Number.isFinite(Number(trialDeals.rate)) ? Number(trialDeals.rate) : 0;
    return {
      monthTrialLessonCount: total,
      trialConversionRate: conversionRate,
      overallTrialStudentCount: total,
      overallTrialConvertedStudentCount: converted,
      overallTrialConversionRate: conversionRate
    };
  }
  function workbenchStatusLabel(status = '') {
    return {
      '已排课': '待上课',
      '已结束': '已下课',
      '已下课': '已下课',
      '已取消': '已取消'
    }[status] || status || '待上课';
  }
  function workbenchCampusName(row = {}) {
    const raw = String(row?.campus || '').trim();
    if (raw === '__external__' || raw === 'external') return String(row?.externalVenueName || row?.venue || '校区外').trim();
    return displayCampusName(raw) || String(row?.campusName || raw || '').trim();
  }
  function workbenchCourseRowIsTrial(row = {}) {
    const textValue = [
      row?.courseType,
      row?.standardCourseType,
      row?.experienceType,
      row?.packageName,
      row?.productName,
      row?.className,
      row?.notes
    ].filter(Boolean).join(' ');
    return row?.isTrial === true || String(row?.isTrial).toLowerCase() === 'true' || /体验/.test(textValue);
  }
  function workbenchLessonText(value) {
    const n = Number(value) || 0;
    return Number.isInteger(n) ? String(n) : String(Math.round(n * 10) / 10);
  }
  function workbenchStudentPackageSummary(studentId = '', entitlements = []) {
    const id = String(studentId || '').trim();
    const rows = workbenchFormalEntitlementsForStudent(id, entitlements);
    return workbenchPackageSummaryFromRows(rows);
  }
  function workbenchFormalEntitlementsForStudent(studentId = '', entitlements = []) {
    const id = String(studentId || '').trim();
    return (Array.isArray(entitlements) ? entitlements : [])
      .filter(row => String(row?.studentId || '').trim() === id)
      .filter(row => !['voided', '已作废', 'cancelled', '已取消'].includes(String(row?.status || '').trim()))
      .filter(row => !workbenchCourseRowIsTrial(row));
  }
  function workbenchPackageSummaryFromRows(rows = []) {
    const total = rows.reduce((sum, row) => sum + parseLessonValue(row?.totalLessons), 0);
    const used = rows.reduce((sum, row) => {
      const direct = parseLessonValue(row?.usedLessons);
      if (direct > 0) return sum + direct;
      const rowTotal = parseLessonValue(row?.totalLessons);
      const remaining = parseLessonValue(row?.remainingLessons);
      return sum + Math.max(0, rowTotal - remaining);
    }, 0);
    const remaining = rows.reduce((sum, row) => sum + parseLessonValue(row?.remainingLessons), 0);
    return {
      packageProgressText: total > 0 ? `${workbenchLessonText(used)}/${workbenchLessonText(total)}` : '',
      packageBalanceText: total > 0 ? `${workbenchLessonText(remaining)}/${workbenchLessonText(total)}` : '',
      packageUsedLessons: used,
      packageTotalLessons: total,
      packageRemainingLessons: remaining
    };
  }
  function workbenchSchedulePackageSummary(schedule = {}, entitlements = []) {
    const ids = [...parseArr(schedule?.entitlementIds), String(schedule?.entitlementId || '').trim()].filter(Boolean);
    const entitlementRows = Array.isArray(entitlements) ? entitlements : [];
    const rows = ids.length
      ? entitlementRows.filter(row => ids.includes(String(row?.id || '').trim()))
      : [...new Set([...parseArr(schedule?.studentIds), String(schedule?.studentId || '').trim()].filter(Boolean))]
        .flatMap(studentId => workbenchFormalEntitlementsForStudent(studentId, entitlementRows))
        .slice(0, 1);
    return workbenchPackageSummaryFromRows(rows.filter(row => !workbenchCourseRowIsTrial(row)));
  }
  function resolveWorkbenchState(schedule, prevSchedule, now = new Date(), feedbacks = []) {
    const fromBackend = schedule?.workbenchState;
    if (fromBackend && typeof fromBackend === 'object' && fromBackend.code && fromBackend.label) {
      return { code: fromBackend.code, label: fromBackend.label };
    }
    if (!schedule || effectiveScheduleStatus(schedule, now) === '已取消') return null;
    const startMs = dateMs(schedule.startTime);
    const endMs = dateMs(schedule.endTime || schedule.startTime);
    const nowMs = now instanceof Date ? now.getTime() : dateMs(now);
    const startDiff = Number.isFinite(startMs) && Number.isFinite(nowMs) ? Math.round((startMs - nowMs) / 60000) : null;
    const sameDay = prevSchedule && dateKey(prevSchedule.startTime) === dateKey(schedule.startTime);
    const travelGap = sameDay && prevSchedule && normalizeCampusValue(prevSchedule.campus) !== normalizeCampusValue(schedule.campus) && prevSchedule.endTime
      ? Math.round((dateMs(schedule.startTime) - dateMs(prevSchedule.endTime)) / 60000)
      : null;
    const ended = effectiveScheduleStatus(schedule, now) === '已结束';
    if (Number.isFinite(startMs) && Number.isFinite(endMs) && startMs <= nowMs && nowMs < endMs) {
      return { code: 'live', label: '进行中' };
    }
    if (Number.isFinite(startDiff) && startDiff >= 0 && startDiff <= 30) {
      return { code: 'upcoming', label: '即将开始' };
    }
    if (Number.isFinite(startDiff) && startDiff > 30 && Number.isFinite(travelGap) && travelGap >= 0 && travelGap < 60) {
      return { code: 'travel', label: '需换场' };
    }
    if (Number.isFinite(startDiff) && startDiff > 30) {
      return { code: 'later', label: '今日后续' };
    }
    if (ended && !scheduleHasFeedbackRecord(schedule, feedbacks)) {
      return { code: 'pending', label: '待反馈' };
    }
    return null;
  }
  function buildWorkbenchStats(input = {}) {
    if (
      Object.prototype.hasOwnProperty.call(input, 'monthFinishedLessonUnits')
      || Object.prototype.hasOwnProperty.call(input, 'weekFinishedLessonUnits')
      || Object.prototype.hasOwnProperty.call(input, 'todayFinishedLessonUnits')
      || Object.prototype.hasOwnProperty.call(input, 'monthFeedbackCount')
      || Object.prototype.hasOwnProperty.call(input, 'pendingFeedbackCount')
      || Object.prototype.hasOwnProperty.call(input, 'monthTrialLessonCount')
      || Object.prototype.hasOwnProperty.call(input, 'trialConversionRate')
      || Object.prototype.hasOwnProperty.call(input, 'overallTrialStudentCount')
      || Object.prototype.hasOwnProperty.call(input, 'overallTrialConvertedStudentCount')
      || Object.prototype.hasOwnProperty.call(input, 'overallTrialConversionRate')
    ) {
      return {
        monthFinishedLessonUnits: parseLessonValue(input.monthFinishedLessonUnits),
        weekFinishedLessonUnits: parseLessonValue(input.weekFinishedLessonUnits),
        todayFinishedLessonUnits: parseLessonValue(input.todayFinishedLessonUnits),
        monthFeedbackCount: parseInt(input.monthFeedbackCount, 10) || 0,
        pendingFeedbackCount: parseInt(input.pendingFeedbackCount, 10) || 0,
        monthTrialLessonCount: parseInt(input.monthTrialLessonCount, 10) || 0,
        trialConversionRate: parseLessonValue(input.trialConversionRate),
        overallTrialStudentCount: parseInt(input.overallTrialStudentCount, 10) || 0,
        overallTrialConvertedStudentCount: parseInt(input.overallTrialConvertedStudentCount, 10) || 0,
        overallTrialConversionRate: parseLessonValue(input.overallTrialConversionRate)
      };
    }
    const now = input.now instanceof Date ? input.now : new Date();
    const scheduleRows = Array.isArray(input.schedule) ? input.schedule : [];
    const feedbacks = Array.isArray(input.feedbacks) ? input.feedbacks : [];
    const standardTrialStats = workbenchStandardTrialStats(input.standardLifecycleMetrics || {});
    const monthKey = dateKey(now.toISOString()).slice(0, 7);
    const dayKey = dateKey(now.toISOString());
    const weekStart = new Date(now);
    weekStart.setHours(0, 0, 0, 0);
    const day = weekStart.getDay() || 7;
    weekStart.setDate(weekStart.getDate() - day + 1);
    const weekStartKey = dateKey(weekStart.toISOString());
    const weekEnd = new Date(weekStart);
    weekEnd.setDate(weekEnd.getDate() + 6);
    const weekEndKey = dateKey(weekEnd.toISOString());
    const endedRows = scheduleRows.filter(item => effectiveScheduleStatus(item, now) === '已结束');
    const monthEndedRows = endedRows.filter(item => dateKey(item.startTime).slice(0, 7) === monthKey);
    const weekEndedRows = endedRows.filter(item => { const key = dateKey(item.startTime); return key >= weekStartKey && key <= weekEndKey; });
    const todayEndedRows = endedRows.filter(item => dateKey(item.startTime) === dayKey);
    return {
      monthFinishedLessonUnits: monthEndedRows.reduce((sum, item) => sum + parseLessonValue(item.lessonCount, 1), 0),
      weekFinishedLessonUnits: weekEndedRows.reduce((sum, item) => sum + parseLessonValue(item.lessonCount, 1), 0),
      todayFinishedLessonUnits: todayEndedRows.reduce((sum, item) => sum + parseLessonValue(item.lessonCount, 1), 0),
      monthFeedbackCount: monthEndedRows.filter(item => scheduleHasFeedbackRecord(item, feedbacks)).length,
      pendingFeedbackCount: endedRows.filter(item => !scheduleHasFeedbackRecord(item, feedbacks)).length,
      ...standardTrialStats
    };
  }
  function decorateWorkbenchScheduleRows(schedule = [], feedbacks = [], purchases = [], now = new Date()) {
    const sorted = (Array.isArray(schedule) ? schedule : []).slice().sort((a, b) => {
      const coachCompare = String(a?.coach || '').localeCompare(String(b?.coach || ''), 'zh-CN');
      if (coachCompare !== 0) return coachCompare;
      return String(a?.startTime || '').localeCompare(String(b?.startTime || ''));
    });
    let prevByCoachDay = new Map();
    const options = arguments[4] && typeof arguments[4] === 'object' ? arguments[4] : {};
    const feedbackCandidates = collectCoachFeedbackReminderCandidates({
      rows: sorted,
      feedbacks,
      entitlements: options.entitlements || [],
      plans: options.plans || [],
      now
    });
    const feedbackCandidateByScheduleId = new Map(feedbackCandidates.map(item => [String(item?.schedule?.id || ''), item]).filter(([id]) => id));
    return sorted.map(item => {
      const coachKey = String(item?.coach || '').trim();
      const dayKeyValue = dateKey(item?.startTime);
      const prevKey = `${coachKey}__${dayKeyValue}`;
      const prevSchedule = prevByCoachDay.get(prevKey) || null;
      const workbenchState = resolveWorkbenchState(item, prevSchedule, now, feedbacks);
      const effectiveStatus = effectiveScheduleStatus(item, now);
      const feedbackCandidate = feedbackCandidateByScheduleId.get(String(item?.id || '')) || null;
      const packageSummary = workbenchSchedulePackageSummary(item, options.entitlements || []);
      prevByCoachDay.set(prevKey, item);
      return {
        ...item,
        effectiveStatus,
        statusLabel: workbenchStatusLabel(effectiveStatus),
        campusName: workbenchCampusName(item),
        isCancelled: effectiveStatus === '已取消',
        isEnded: effectiveStatus === '已结束',
        isUpcoming: effectiveStatus === '已排课',
        hasFeedback: scheduleHasFeedbackRecord(item, feedbacks),
        feedbackRequired: !!feedbackCandidate,
        requiredFeedbackLessonNumber: feedbackCandidate?.triggerLessonNumber || 0,
        ...packageSummary,
        workbenchState: workbenchState
      };
    });
  }
  return {
    buildWorkbenchStats,
    resolveWorkbenchState,
    decorateWorkbenchScheduleRows,
    workbenchStudentPackageSummary,
    workbenchCampusName
  };
}

module.exports = { createWorkbenchReadModel };
