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

  function assertLeadMergeLinkSafe({ leads = [], students = [], courts = [] } = {}) {
    const studentIds = leadMergeUniqueValues([
      ...leads.map(row => leadMergeLinkId(row, 'studentId')),
      ...students.map(row => leadMergeLinkId(row, 'id'))
    ]);
    if (studentIds.length > 1) throw leadMergeError('两条线索已关联不同学员，不能直接合并', 409);

    const courtIds = leadMergeUniqueValues([
      ...leads.map(row => leadMergeLinkId(row, 'courtId')),
      ...courts.map(row => leadMergeLinkId(row, 'id'))
    ]);
    if (courtIds.length > 1) throw leadMergeError('两条线索已关联不同订场用户，不能直接合并', 409);
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

  function buildPrimaryUpdate({ primaryLead, mergeLeads = [], followups = [], finalLeadStage = '', now = '', operator = '' }) {
    const merged = mergeLeadRows([primaryLead, ...mergeLeads]) || primaryLead;
    const snapshot = typeof applyLeadFollowupsSnapshot === 'function' ? applyLeadFollowupsSnapshot(merged, followups) : merged;
    const stage = text(finalLeadStage);
    const next = normalizeLeadRecord({
      ...snapshot,
      id: primaryLead.id,
      createdAt: primaryLead.createdAt,
      rawStatus: stage || snapshot.rawStatus || snapshot.leadStage,
      leadStage: stage || snapshot.leadStage,
      systemStatus: stage || snapshot.systemStatus,
      updatedAt: now
    }, { id: primaryLead.id, now });
    if (stage) {
      next.rawStatus = stage;
      next.leadStage = deriveLeadSystemStatus(next);
      next.systemStatus = next.leadStage;
    }
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
      operator
    });
    const duplicateLeadUpdates = mergeLeads.map(row => ({
      ...row,
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
      courtSourceUpdates,
      membershipSourceUpdates,
      conflicts: buildLeadMergeFieldConflicts([primaryLead, ...mergeLeads]),
      counts: {
        followupsToMove: movedFollowups.length,
        duplicateLeads: duplicateLeadUpdates.length,
        studentSourceLinks: studentSourceUpdates.length,
        courtSourceLinks: courtSourceUpdates.length,
        membershipSourceLinks: membershipSourceUpdates.length
      }
    };
  }

  return { buildLeadMergePlan };
}

module.exports = { createLeadMergeRuleHelpers };
