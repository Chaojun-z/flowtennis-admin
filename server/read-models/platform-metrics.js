const { buildCustomerLifecycleRows } = require('./customer-lifecycle.js');
const businessTaxonomy = require('../../public/assets/scripts/core/business-taxonomy.js');

function text(value) {
  return String(value || '').trim();
}

function round(value, digits = 1) {
  const base = 10 ** digits;
  return Math.round((Number(value) || 0) * base) / base;
}

function rowId(row = {}) {
  return text(row.id || row.leadId);
}

function isConvertedStage(stage = '') {
  return text(stage) === '已成交';
}

function lifecycleInScope(row = {}, scope = 'all') {
  if (scope === 'all') return true;
  if (scope === 'course') return text(row.studentStage) !== 'none';
  if (scope === 'raw') return !!text(row.sourceLeadId || row.leadId);
  return true;
}

function lifecycleLeadStage(row = {}, lead = {}) {
  const studentStage = text(row.studentStage);
  const hasCourse = !!row.hasCourseConversion || studentStage === 'formal';
  const hasBooking = !!row.hasBookingConversion || ['booking', 'member'].includes(text(row.courtStage));
  const hasMembership = !!row.hasMembershipConversion || text(row.courtStage) === 'member';
  const hasTrialAttended = !!text(row.trialAttendedAt);
  const hasTrialBooked = !!text(row.trialBookedAt || row.trialAtRaw) || !!row.hasTrialExperience;
  if (hasCourse || hasBooking || hasMembership) return '已成交';
  if (hasTrialAttended || studentStage === 'trial') return '已体验待成交';
  if (hasTrialBooked) return '已约体验';
  if (studentStage === 'student') return '跟进中';
  const explicit = text(lead.leadStage || lead.systemStatus || lead.stage || lead.rawStatus);
  if (/流失/.test(explicit)) return '已流失';
  if (/已体验|体验待转化|体验待成交/.test(explicit)) return '已体验待成交';
  if (/已约|预约|约体验/.test(explicit)) return '已约体验';
  if (/新线索/.test(explicit)) return '新线索';
  if (/跟进/.test(explicit)) return '跟进中';
  return explicit || '跟进中';
}

function lifecycleDealType(row = {}, lead = {}) {
  const stored = text(lead.dealType || lead.conversionType || row.dealType);
  if (stored) return stored;
  const studentStage = text(row.studentStage);
  const hasCourse = !!row.hasCourseConversion || studentStage === 'formal';
  const hasBooking = !!row.hasBookingConversion || ['booking', 'member'].includes(text(row.courtStage));
  const hasMembership = !!row.hasMembershipConversion || text(row.courtStage) === 'member';
  return [
    hasCourse ? '课程' : '',
    hasBooking ? '订场' : '',
    hasMembership ? '会员' : ''
  ].filter(Boolean).join('+');
}

function buildLeadPoolRows({ leads = [], customerLifecycleRows = [], lifecycleScope = 'all' } = {}) {
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
      enrollAtRaw: text(lead.enrollAtRaw || lead.formalSignupAt || lead.enrollAt || lifecycle.courseFirstPurchaseAt),
      conversionAt: text(lead.conversionAt || lifecycle.conversionAt),
      formalCoach: text(lead.formalCoach || lifecycle.formalCoach),
      profileNote: text(lead.profileNote || lifecycle.profileNote),
      dealType,
      conversionType: dealType,
      studentId: text(lifecycle.studentId || lead.studentId || lead.formalStudentId || lead.courseStudentId),
      courtId: text(lifecycle.courtId || lead.courtId || lead.bookingCourtId),
      membershipAccountId: text(lifecycle.membershipAccountId || lead.membershipAccountId || lead.memberId),
      leadDate: text(lead.leadDate || lifecycle.leadDate || lifecycle.createdAt),
      createdAt: text(lead.createdAt || lifecycle.createdAt || lifecycle.leadDate),
      leadStage,
      systemStatus: text(lead.systemStatus || leadStage),
      studentStage: text(lifecycle.studentStage),
      hasTrialExperience: !!lifecycle.hasTrialExperience,
      courtStage: text(lifecycle.courtStage),
      membershipStatus: text(lifecycle.membershipStatus),
      hasCourseConversion: !!lifecycle.hasCourseConversion,
      hasBookingConversion: !!lifecycle.hasBookingConversion,
      hasMembershipConversion: !!lifecycle.hasMembershipConversion,
      isLifecycleSynthetic: !existing
    };
    rows.set(id, next);
  });

  (leads || []).forEach(lead => {
    const id = rowId(lead);
    if (!id || rows.has(id)) return;
    const source = businessTaxonomy.normalizeLeadSource(lead.source);
    rows.set(id, {
      ...lead,
      id,
      sourceLeadId: id,
      source,
      leadStage: lifecycleLeadStage({}, lead),
      isLifecycleSynthetic: false
    });
  });

  return [...rows.values()];
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
  const leadPoolRows = buildLeadPoolRows({
    leads: data.leads || [],
    customerLifecycleRows
  });
  const stageRows = buildStageRows(leadPoolRows);
  const sourceChannelStats = buildSourceChannelStats(leadPoolRows);
  const totalLeads = leadPoolRows.length;
  const convertedLeads = leadPoolRows.filter(row => isConvertedStage(row.leadStage)).length;

  return {
    customerLifecycleRows,
    leadPoolRows,
    conversionMetrics: {
      totalLeads,
      convertedLeads,
      leadConversionRate: totalLeads ? round(convertedLeads * 100 / totalLeads, 1) : 0,
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
  buildLeadPoolRows,
  buildStageRows,
  buildSourceChannelStats,
  lifecycleLeadStage
};
