function createLeadMergeRuleHelpers(deps = {}) {
  const {
    cleanLeadText,
    mergeLeadRows,
    applyLeadFollowupsSnapshot,
    normalizeLeadRecord,
    deriveLeadSystemStatus
  } = deps;

  function text(value) {
    return typeof cleanLeadText === 'function' ? cleanLeadText(value) : String(value ?? '').trim();
  }

  function leadMergeError(message, statusCode = 400) {
    const error = new Error(message);
    error.statusCode = statusCode;
    return error;
  }

  function leadMergeLinkId(row = {}, key = '') {
    return text(row?.[key]);
  }

  function leadMergeSourceLeadId(row = {}) {
    return text(row?.sourceLeadId || row?.leadId || row?.fromLeadId);
  }

  function leadMergeRowsForSource(rows = [], leadIds = []) {
    const ids = new Set((leadIds || []).map(text).filter(Boolean));
    return (rows || []).filter(row => ids.has(leadMergeSourceLeadId(row)));
  }

  function leadMergeUniqueValues(values = []) {
    return [...new Set((values || []).map(text).filter(Boolean))];
  }

  function leadMergeParseArray(value) {
    if (Array.isArray(value)) return value.map(text).filter(Boolean);
    const raw = text(value);
    if (!raw) return [];
    try {
      const parsed = JSON.parse(raw);
      if (Array.isArray(parsed)) return parsed.map(text).filter(Boolean);
    } catch {}
    return raw.split(',').map(text).filter(Boolean);
  }

  function leadMergeReplaceStudentId(value, sourceStudentIds = [], targetStudentId = '') {
    const sources = new Set((sourceStudentIds || []).map(text).filter(Boolean));
    const target = text(targetStudentId);
    const list = leadMergeParseArray(value).map(id => sources.has(id) ? target : id).filter(Boolean);
    return [...new Set(list)];
  }

  function assertLeadMergeLinkSafe({ leads = [], students = [], courts = [] } = {}) {
    const courtIds = leadMergeUniqueValues([
      ...leads.map(row => leadMergeLinkId(row, 'courtId')),
      ...courts.map(row => leadMergeLinkId(row, 'id'))
    ]);
    if (courtIds.length > 1) throw leadMergeError('两条线索已关联不同订场用户，不能直接合并', 409);
  }

  function leadMergeRowHasSourceStudent(row = {}, sourceStudentIds = []) {
    const sources = new Set((sourceStudentIds || []).map(text).filter(Boolean));
    if (!sources.size) return false;
    const values = [
      text(row.studentId),
      text(row.sourceStudentId),
      ...leadMergeParseArray(row.studentIds),
      ...leadMergeParseArray(row.expectedStudentIds),
      ...leadMergeParseArray(row.absentStudentIds)
    ];
    return values.some(id => sources.has(id));
  }

  function leadMergeRewriteStudentRow(row = {}, sourceStudentIds = [], targetStudent = {}, now = '', primaryLeadId = '') {
    const sources = new Set((sourceStudentIds || []).map(text).filter(Boolean));
    const targetId = text(targetStudent.id || targetStudent.studentId);
    if (!targetId || !leadMergeRowHasSourceStudent(row, sourceStudentIds)) return null;
    const next = { ...row, updatedAt: now };
    if (sources.has(text(next.studentId))) next.studentId = targetId;
    if (sources.has(text(next.sourceStudentId))) next.sourceStudentId = targetId;
    if (Object.prototype.hasOwnProperty.call(next, 'sourceLeadId') && text(primaryLeadId)) next.sourceLeadId = text(primaryLeadId);
    ['studentIds', 'expectedStudentIds', 'absentStudentIds'].forEach(field => {
      if (leadMergeParseArray(next[field]).length) next[field] = leadMergeReplaceStudentId(next[field], sourceStudentIds, targetId);
    });
    if (Object.prototype.hasOwnProperty.call(next, 'studentName') && text(next.studentId) === targetId && text(targetStudent.name)) next.studentName = text(targetStudent.name);
    return next;
  }

  function buildStudentReferenceUpdates(data = {}, sourceStudentIds = [], targetStudent = {}, now = '', primaryLeadId = '') {
    const rewriteRows = rows => (rows || [])
      .map(row => leadMergeRewriteStudentRow(row, sourceStudentIds, targetStudent, now, primaryLeadId))
      .filter(Boolean);
    return {
      purchases: rewriteRows(data.purchases),
      entitlements: rewriteRows(data.entitlements),
      entitlementLedger: rewriteRows(data.entitlementLedger),
      schedule: rewriteRows(data.schedule),
      membershipOrders: rewriteRows(data.membershipOrders),
      membershipBenefitLedger: rewriteRows(data.membershipBenefitLedger),
      membershipAccountEvents: rewriteRows(data.membershipAccountEvents),
      membershipAccounts: rewriteRows(data.membershipAccounts),
      courts: rewriteRows(data.courts),
      financialLedger: rewriteRows(data.financialLedger),
      plans: rewriteRows(data.plans),
      classes: rewriteRows(data.classes),
      feedbacks: rewriteRows(data.feedbacks)
    };
  }

  function buildStudentProfileMergePlan({ primaryLead, mergeLeads = [], sourceStudents = [], data = {}, now = '', operator = '' } = {}) {
    const leads = [primaryLead, ...mergeLeads].filter(Boolean);
    const studentIds = leadMergeUniqueValues([
      ...leads.map(row => leadMergeLinkId(row, 'studentId')),
      ...sourceStudents.map(row => leadMergeLinkId(row, 'id'))
    ]);
    if (studentIds.length <= 1) return null;

    const primaryLeadId = text(primaryLead?.id);
    const targetStudentId = text(primaryLead?.studentId)
      || text(sourceStudents.find(row => leadMergeSourceLeadId(row) === primaryLeadId)?.id);
    if (!targetStudentId) throw leadMergeError('两条线索已关联不同学员，请选择有关联学员的线索作为保留线索', 409);

    const students = data.students || [];
    const targetStudent = students.find(row => text(row.id) === targetStudentId)
      || sourceStudents.find(row => text(row.id) === targetStudentId)
      || null;
    const sourceStudentIds = studentIds.filter(id => id !== targetStudentId);
    const sourceStudentUpdates = sourceStudentIds.map(id => {
      const row = students.find(item => text(item.id) === id) || sourceStudents.find(item => text(item.id) === id);
      if (!row) return null;
      return {
        ...row,
        status: 'merged',
        mergedIntoStudentId: targetStudentId,
        mergedAt: now,
        mergedBy: operator,
        sourceLeadId: primaryLeadId || leadMergeSourceLeadId(row),
        updatedAt: now
      };
    }).filter(Boolean);

    const targetStudentUpdate = targetStudent ? { ...targetStudent, mergedIntoStudentId: '', lastLeadMergeAt: now, updatedAt: now } : null;
    if (targetStudentUpdate && text(targetStudentUpdate.status) === 'merged') targetStudentUpdate.status = 'active';
    const fillFields = ['phone', 'source', 'campus', 'type', 'primaryCoach', 'activityRange'];
    sourceStudentUpdates.forEach(source => {
      fillFields.forEach(field => {
        if (targetStudentUpdate && !text(targetStudentUpdate[field]) && text(source[field])) targetStudentUpdate[field] = source[field];
      });
    });

    const referenceUpdates = buildStudentReferenceUpdates(data, sourceStudentIds, targetStudentUpdate || targetStudent || { id: targetStudentId }, now, primaryLeadId);

    return { targetStudentId, targetStudentUpdate, sourceStudentUpdates, referenceUpdates };
  }

  function buildLeadMergeFieldConflicts(leads = []) {
    const fields = [
      ['phone', '手机号'],
      ['source', '来源'],
      ['campus', '校区'],
      ['customerType', '类型'],
      ['demandProduct', '需求产品'],
      ['owner', '跟进人'],
      ['leadStage', '线索阶段'],
      ['dealType', '成交类型']
    ];
    return fields.map(([field, label]) => {
      const values = leadMergeUniqueValues((leads || []).map(row => row?.[field]));
      return values.length > 1 ? { field, label, values } : null;
    }).filter(Boolean);
  }

  function buildPrimaryUpdate({ primaryLead, mergeLeads = [], followups = [], now = '', operator = '', studentProfileMerge = null }) {
    const merged = mergeLeadRows([primaryLead, ...mergeLeads]) || primaryLead;
    const snapshot = typeof applyLeadFollowupsSnapshot === 'function' ? applyLeadFollowupsSnapshot(merged, followups) : merged;
    const primaryStage = text(primaryLead.leadStage || primaryLead.systemStatus || primaryLead.rawStatus);
    const primaryRawStatus = text(primaryLead.rawStatus || primaryStage);
    const next = normalizeLeadRecord({
      ...snapshot,
      id: primaryLead.id,
      createdAt: primaryLead.createdAt,
      rawStatus: primaryRawStatus || snapshot.rawStatus || snapshot.leadStage,
      leadStage: primaryStage || snapshot.leadStage,
      systemStatus: primaryStage || snapshot.systemStatus,
      updatedAt: now
    }, { id: primaryLead.id, now });
    if (primaryStage) {
      next.rawStatus = primaryRawStatus || primaryStage;
      next.leadStage = primaryStage;
      next.systemStatus = primaryStage;
    }
    if (studentProfileMerge?.targetStudentId) next.studentId = studentProfileMerge.targetStudentId;
    next.mergedLeadIds = leadMergeUniqueValues([...(primaryLead.mergedLeadIds || []), primaryLead.id, ...mergeLeads.map(row => row.id)]);
    next.lastLeadMergeAt = now;
    next.lastLeadMergeBy = operator;
    return next;
  }

  function buildLeadMergePlan({ primaryLeadId, mergeLeadIds = [], data = {}, finalLeadStage = '', now = new Date().toISOString(), operator = '' } = {}) {
    const primaryId = text(primaryLeadId);
    const duplicateIds = leadMergeUniqueValues(mergeLeadIds).filter(id => id && id !== primaryId);
    if (!primaryId || !duplicateIds.length) throw leadMergeError('请选择主线索和要合并的线索');

    const leads = data.leads || [];
    const primaryLead = leads.find(row => text(row.id) === primaryId);
    if (!primaryLead) throw leadMergeError('主线索不存在', 404);
    if (text(primaryLead.status) === 'merged') throw leadMergeError('主线索已合并，不能作为保留线索', 409);

    const mergeLeads = duplicateIds.map(id => {
      const row = leads.find(item => text(item.id) === id);
      if (!row) throw leadMergeError(`要合并的线索不存在：${id}`, 404);
      if (text(row.status) === 'merged') throw leadMergeError(`线索已合并：${id}`, 409);
      return row;
    });

    const allLeadIds = [primaryId, ...duplicateIds];
    const sourceStudents = leadMergeRowsForSource(data.students, allLeadIds);
    const sourceCourts = leadMergeRowsForSource(data.courts, allLeadIds);
    const sourceMembershipAccounts = leadMergeRowsForSource(data.membershipAccounts, allLeadIds);
    assertLeadMergeLinkSafe({ leads: [primaryLead, ...mergeLeads], students: sourceStudents, courts: sourceCourts });
    const studentProfileMerge = buildStudentProfileMergePlan({
      primaryLead,
      mergeLeads,
      sourceStudents,
      data,
      now,
      operator
    });

    const followups = data.followups || [];
    const movedFollowups = followups.filter(row => duplicateIds.includes(text(row.leadId))).map(row => ({
      ...row,
      leadId: primaryId,
      originalLeadId: text(row.originalLeadId) || text(row.leadId),
      leadMergedAt: now,
      updatedAt: now
    }));
    const primaryFollowups = followups.filter(row => text(row.leadId) === primaryId);
    const primaryUpdate = buildPrimaryUpdate({
      primaryLead,
      mergeLeads,
      followups: [...primaryFollowups, ...movedFollowups],
      finalLeadStage,
      now,
      operator,
      studentProfileMerge
    });
    const duplicateLeadUpdates = mergeLeads.map(row => ({
      ...row,
      studentId: studentProfileMerge?.targetStudentId || row.studentId,
      status: 'merged',
      mergedIntoLeadId: primaryId,
      mergedIntoLeadName: text(primaryUpdate.displayName || primaryUpdate.wechatName || primaryLead.displayName),
      mergedAt: now,
      mergedBy: operator,
      updatedAt: now
    }));
    const linkPatch = row => ({
      ...row,
      sourceLeadId: primaryId,
      leadId: text(row.leadId) === leadMergeSourceLeadId(row) ? '' : row.leadId,
      fromLeadId: text(row.fromLeadId) === leadMergeSourceLeadId(row) ? '' : row.fromLeadId,
      updatedAt: now
    });

    const studentSourceUpdates = sourceStudents.filter(row => leadMergeSourceLeadId(row) !== primaryId).map(linkPatch);
    const courtSourceUpdates = sourceCourts.filter(row => leadMergeSourceLeadId(row) !== primaryId).map(linkPatch);
    const membershipSourceUpdates = sourceMembershipAccounts.filter(row => leadMergeSourceLeadId(row) !== primaryId).map(linkPatch);

    return {
      primaryLeadId: primaryId,
      mergeLeadIds: duplicateIds,
      primaryLead,
      mergeLeads,
      primaryUpdate,
      movedFollowups,
      duplicateLeadUpdates,
      studentSourceUpdates,
      studentProfileMerge,
      courtSourceUpdates,
      membershipSourceUpdates,
      conflicts: buildLeadMergeFieldConflicts([primaryLead, ...mergeLeads]),
      counts: {
        followupsToMove: movedFollowups.length,
        duplicateLeads: duplicateLeadUpdates.length,
        studentSourceLinks: studentSourceUpdates.length,
        studentProfilesMerged: studentProfileMerge?.sourceStudentUpdates?.length || 0,
        studentReferenceLinks: studentProfileMerge?.referenceUpdates
          ? Object.values(studentProfileMerge.referenceUpdates).reduce((sum, rows) => sum + rows.length, 0)
          : 0,
        courtSourceLinks: courtSourceUpdates.length,
        membershipSourceLinks: membershipSourceUpdates.length
      }
    };
  }

  return { buildLeadMergePlan };
}

module.exports = { createLeadMergeRuleHelpers };
