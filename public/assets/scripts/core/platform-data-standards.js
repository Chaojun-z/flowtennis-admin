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

  return {
    rateText,
    leadFunnelStats
  };
});
