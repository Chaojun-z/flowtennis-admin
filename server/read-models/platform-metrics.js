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

function hasLifecycleBusinessFact(row = {}) {
  return !!(
    text(row.studentId || row.courtId || row.membershipAccountId) ||
    text(row.trialBookedAt || row.trialAttendedAt || row.courseFirstPurchaseAt || row.bookingFirstAt || row.membershipFirstAt) ||
    row.hasCourseConversion ||
    row.hasBookingConversion ||
    row.hasMembershipConversion ||
    text(row.studentStage) !== 'none' ||
    text(row.courtStage) !== 'none' ||
    text(row.membershipStatus)
  );
}

function shouldIgnoreLegacyLeadOutcome(row = {}) {
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
  if (/未转化|未成交/.test(explicit)) return '跟进中';
  if (/流失/.test(explicit)) return '已流失';
  if (/已体验|体验待转化|体验待成交/.test(explicit)) return '已体验待成交';
  if (/已约|预约|约体验/.test(explicit)) return '已约体验';
  if (/成交|转化|已报名|已订场|已定场|储值|会员/.test(explicit)) return '已成交';
  if (/新线索/.test(explicit)) return '新线索';
  if (/跟进/.test(explicit)) return '跟进中';
  return explicit || '跟进中';
}

function lifecycleDealType(row = {}, lead = {}) {
  const ignoreLegacyOutcome = shouldIgnoreLegacyLeadOutcome(row);
  const stored = ignoreLegacyOutcome ? '' : text(lead.dealType || lead.conversionType || row.dealType);
  if (stored) return stored;
  const legacyText = ignoreLegacyOutcome ? '' : text([
    lead.leadStage,
    lead.systemStatus,
    lead.stage,
    lead.rawStatus,
    lead.status,
    lead.statusAfter
  ].filter(Boolean).join(' '));
  const studentStage = text(row.studentStage);
  const hasCourse = !!row.hasCourseConversion || studentStage === 'formal' || (!ignoreLegacyOutcome && !!text(lead.studentId || lead.formalStudentId || lead.courseStudentId)) || /课程|课包|报名|私教|小班/.test(legacyText);
  const hasBooking = !!row.hasBookingConversion || ['booking', 'member'].includes(text(row.courtStage)) || !!text(lead.courtId || lead.bookingCourtId) || /订场|定场|场地/.test(legacyText);
  const hasMembership = !!row.hasMembershipConversion || text(row.courtStage) === 'member' || !!text(lead.membershipAccountId || lead.memberId) || /会员|储值/.test(legacyText);
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
      trialBookedAt: text(lifecycle.trialBookedAt || lead.trialBookedAt || lead.trialAtRaw || lead.trialLessonAt || lead.trialAt),
      trialAttendedAt: text(lifecycle.trialAttendedAt || lead.trialAttendedAt),
      enrollAtRaw: text(lead.enrollAtRaw || lead.formalSignupAt || lead.enrollAt || lifecycle.courseFirstPurchaseAt),
      conversionAt: text(lead.conversionAt || lifecycle.conversionAt),
      formalCoach: text(lead.formalCoach || lifecycle.formalCoach),
      profileNote: visibleLeadProfileNote(lead),
      dealType,
      conversionType: dealType,
      studentId: text(lifecycle.studentId || lead.studentId || lead.formalStudentId || lead.courseStudentId),
      courtId: text(lifecycle.courtId || lead.courtId || lead.bookingCourtId),
      membershipAccountId: text(lifecycle.membershipAccountId || lead.membershipAccountId || lead.memberId),
      leadDate: leadBusinessDate(lifecycle, lead),
      createdAt: text(lead.createdAt || lifecycle.createdAt || lifecycle.leadDate),
      leadStage,
      systemStatus: text(lead.systemStatus || leadStage),
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

  return mergeDuplicateLeadPoolRows([...rows.values()]);
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

function teachingStudentViewRow(row = {}) {
  return {
    ...row,
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
    courseDealPath: text(row.courseDealPath)
  };
}

function buildTeachingStudentViews(customerLifecycleRows = []) {
  const studentRows = (customerLifecycleRows || []).filter(row => text(row.studentId));
  const hasTrialPath = row => !!row.hasTrialExperience;
  const courseStudents = studentRows
    .filter(row => ['trial', 'formal'].includes(text(row.studentStage)))
    .map(teachingStudentViewRow);
  const formalStudents = studentRows
    .filter(row => text(row.studentStage) === 'formal')
    .map(teachingStudentViewRow);
  const trialStudents = studentRows
    .filter(row => text(row.studentStage) === 'trial')
    .map(teachingStudentViewRow);
  const courseStudentIds = new Set(courseStudents.map(row => text(row.studentId)).filter(Boolean));
  const trialPathStudents = studentRows
    .filter(hasTrialPath)
    .filter(row => courseStudentIds.has(text(row.studentId)))
    .map(teachingStudentViewRow);
  const trialPathDealStudents = formalStudents.filter(hasTrialPath);
  const trialPathDealIds = new Set(trialPathDealStudents.map(row => text(row.studentId)).filter(Boolean));
  const trialPathPendingStudents = trialPathStudents.filter(row => !trialPathDealIds.has(text(row.studentId)));
  const directCourseStudents = formalStudents.filter(row => !trialPathDealIds.has(text(row.studentId)));
  return {
    courseStudents,
    trialStudents,
    formalStudents,
    trialPathStudents,
    trialPathDealStudents,
    trialPathPendingStudents,
    directCourseDealStudents: directCourseStudents,
    summary: {
      courseStudentCount: courseStudents.length,
      trialStudentCount: trialStudents.length,
      formalStudentCount: formalStudents.length,
      courseDealCustomers: formalStudents.length,
      trialPathStudents: trialPathStudents.length,
      trialPathDealCustomers: trialPathDealStudents.length,
      trialPathPendingCustomers: trialPathPendingStudents.length,
      trialToCourseCustomers: trialPathDealStudents.length,
      directCourseCustomers: directCourseStudents.length
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
  const teachingStudentViews = buildTeachingStudentViews(customerLifecycleRows);
  const summary = teachingStudentViews.summary || {};
  const validLeads = Number(leadConversionMetrics.totalLeads) || 0;
  const courseChainStudents = Number(summary.courseStudentCount) || 0;
  const formalStudents = Number(summary.courseDealCustomers || summary.formalStudentCount) || 0;
  const trialPathStudents = Number(summary.trialPathStudents) || 0;
  const trialPathDeals = Number(summary.trialPathDealCustomers || summary.trialToCourseCustomers) || 0;
  const trialPathPending = Number(summary.trialPathPendingCustomers) || Math.max(0, trialPathStudents - trialPathDeals);
  const directCourseDeals = Number(summary.directCourseCustomers) || 0;
  const totalDeals = Number(leadConversionMetrics.convertedLeads) || 0;
  const metrics = {
    validLeads: standardMetric('VALID_LEADS', '有效线索', validLeads, validLeads, 'RAW_LEAD_POOL_ROWS', '条'),
    courseChainStudents: standardMetric('COURSE_CHAIN_STUDENTS', '普通学员', courseChainStudents, validLeads, 'COURSE_CHAIN_STUDENTS / VALID_LEADS'),
    formalStudents: standardMetric('FORMAL_STUDENTS', '正式学员', formalStudents, validLeads, 'FORMAL_STUDENTS / VALID_LEADS'),
    trialPathStudents: standardMetric('TRIAL_PATH_STUDENTS', '体验路径学员', trialPathStudents, validLeads, 'TRIAL_PATH_STUDENTS / VALID_LEADS'),
    trialPathDeals: standardMetric('TRIAL_PATH_DEALS', '体验路径成交', trialPathDeals, trialPathStudents, 'TRIAL_PATH_DEALS / TRIAL_PATH_STUDENTS'),
    trialPathPending: standardMetric('TRIAL_PATH_PENDING', '体验路径未成交', trialPathPending, trialPathStudents, 'TRIAL_PATH_PENDING / TRIAL_PATH_STUDENTS'),
    directCourseDeals: standardMetric('DIRECT_COURSE_DEALS', '直接课程成交', directCourseDeals, formalStudents || validLeads, 'DIRECT_COURSE_DEALS / FORMAL_STUDENTS'),
    totalDeals: standardMetric('TOTAL_DEALS', '总成交', totalDeals, validLeads, 'TOTAL_DEALS / VALID_LEADS', '条')
  };
  metrics.formalStudents.transitionRate = rate(formalStudents, courseChainStudents);
  metrics.formalStudents.transitionRateText = rateText(formalStudents, courseChainStudents);
  metrics.directCourseDeals.rate = rate(directCourseDeals, formalStudents);
  metrics.directCourseDeals.rateText = rateText(directCourseDeals, formalStudents);
  return {
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
        { id: 'FORMAL_STUDENTS', label: '正式学员', value: formalStudents }
      ]),
      trialPath: standardFunnelRows([
        { id: 'TRIAL_PATH_STUDENTS', label: '体验路径学员', value: trialPathStudents },
        { id: 'TRIAL_PATH_DEALS', label: '体验路径成交', value: trialPathDeals },
        { id: 'TRIAL_PATH_PENDING', label: '体验路径未成交', value: trialPathPending }
      ])
    },
    views: {
      leadPoolRows: leadConversionMetrics.rawLeadPoolRows,
      courseChainStudents: teachingStudentViews.courseStudents,
      formalStudents: teachingStudentViews.formalStudents,
      trialPathStudents: teachingStudentViews.trialPathStudents,
      trialPathDeals: teachingStudentViews.trialPathDealStudents,
      trialPathPending: teachingStudentViews.trialPathPendingStudents,
      directCourseDeals: teachingStudentViews.directCourseDealStudents
    }
  };
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
  const teachingStudentViews = buildTeachingStudentViews(customerLifecycleRows);
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
  buildLeadPoolRows,
  buildTeachingStudentViews,
  buildRawLeadConversionMetrics,
  rawLeadPoolRowsForLeads,
  buildStageRows,
  buildSourceChannelStats,
  lifecycleLeadStage
};
