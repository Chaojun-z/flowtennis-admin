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

  function assertLeadMergeLinkSafe({ leads = [], students = [], courts = [] } = {}) {
    const courtIds = leadMergeUniqueValues([
      ...leads.map(row => leadMergeLinkId(row, 'courtId')),
      ...courts.map(row => leadMergeLinkId(row, 'id'))
    ]);
    if (courtIds.length > 1) throw leadMergeError('两条线索已关联不同订场用户，不能直接合并', 409);
  }

  function leadMergeStudentBusinessRefs(data = {}, studentId = '') {
    const id = text(studentId);
    if (!id) return [];
    const hasStudentId = row => text(row?.studentId) === id;
    const hasStudentIdArray = row => leadMergeParseArray(row?.studentIds).includes(id);
    const hasAnyScheduleStudentId = row => hasStudentId(row)
      || hasStudentIdArray(row)
      || leadMergeParseArray(row?.expectedStudentIds).includes(id)
      || leadMergeParseArray(row?.absentStudentIds).includes(id);
    const refs = [];
    (data.purchases || []).filter(hasStudentId).forEach(row => refs.push({ table: 'purchases', id: text(row.id) }));
    (data.entitlements || []).filter(hasStudentId).forEach(row => refs.push({ table: 'entitlements', id: text(row.id) }));
    (data.schedule || []).filter(hasAnyScheduleStudentId).forEach(row => refs.push({ table: 'schedule', id: text(row.id) }));
    (data.membershipOrders || []).filter(row => hasStudentId(row) || hasStudentIdArray(row)).forEach(row => refs.push({ table: 'membershipOrders', id: text(row.id) }));
    (data.courts || []).filter(row => hasStudentId(row) || hasStudentIdArray(row)).forEach(row => refs.push({ table: 'courts', id: text(row.id) }));
    return refs.filter(row => row.id);
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

    const sourceStudentIds = studentIds.filter(id => id !== targetStudentId);
    const blockedRefs = sourceStudentIds.flatMap(id => leadMergeStudentBusinessRefs(data, id));
    if (blockedRefs.length) {
      throw leadMergeError('两条线索已关联不同学员，且副学员已有课包、排课、购买或会员记录，不能直接合并', 409);
    }

    const students = data.students || [];
    const targetStudent = students.find(row => text(row.id) === targetStudentId)
      || sourceStudents.find(row => text(row.id) === targetStudentId)
      || null;
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

    const targetStudentUpdate = targetStudent ? { ...targetStudent, mergedIntoStudentId: '', updatedAt: now } : null;
    if (targetStudentUpdate && text(targetStudentUpdate.status) === 'merged') targetStudentUpdate.status = 'active';
    const fillFields = ['phone', 'source', 'campus', 'type', 'primaryCoach', 'activityRange'];
    sourceStudentUpdates.forEach(source => {
      fillFields.forEach(field => {
        if (targetStudentUpdate && !text(targetStudentUpdate[field]) && text(source[field])) targetStudentUpdate[field] = source[field];
      });
    });

    return { targetStudentId, targetStudentUpdate, sourceStudentUpdates };
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
        courtSourceLinks: courtSourceUpdates.length,
        membershipSourceLinks: membershipSourceUpdates.length
      }
    };
  }

  return { buildLeadMergePlan };
}

module.exports = { createLeadMergeRuleHelpers };
