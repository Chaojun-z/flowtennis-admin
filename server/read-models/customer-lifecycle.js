const businessTaxonomy = require('../../public/assets/scripts/core/business-taxonomy.js');

function text(value) {
  return String(value || '').trim();
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

function sourceLeadId(row = {}) {
  return text(row.sourceLeadId || row.leadId || row.fromLeadId);
}

function leadId(row = {}) {
  return text(row.id || row.leadId);
}

function mergedLeadIds(row = {}) {
  return parseArr(row._mergedLeadIds).map(text).filter(Boolean);
}

function activeStatus(row = {}) {
  const status = text(row.status || row.systemStatus || 'active');
  return !['voided', 'refunded', 'deleted', 'inactive', 'cancelled', 'canceled', '已作废', '已删除', '已取消'].includes(status);
}

function purchaseIsTrial(row = {}) {
  const normalized = businessTaxonomy.normalizeCourseType(row);
  const haystack = [
    row.courseType,
    row.packageCourseType,
    row.type,
    row.productType,
    row.experienceType,
    row.courseTypeLevel2,
    row.packageName,
    row.productName,
    row.name,
    row.notes
  ].filter(Boolean).join(' ');
  return normalized.level1 === '体验课' || /体验/.test(haystack);
}

function rowHasStudent(row = {}, studentId = '') {
  const id = text(studentId);
  if (!id) return false;
  if (text(row.studentId) === id) return true;
  return parseArr(row.studentIds).map(text).includes(id);
}

function scheduleIsTrial(row = {}) {
  const normalized = businessTaxonomy.normalizeCourseType(row);
  const textValue = [row.courseType, row.standardCourseType, row.experienceType, row.packageName, row.productName].filter(Boolean).join(' ');
  return normalized.level1 === '体验课' || /体验/.test(textValue);
}

function studentHasTrialExperience(student = {}, { purchases = [], entitlements = [], schedule = [] } = {}) {
  const sid = text(student.id || student.studentId);
  if (!sid) return false;
  const studentPurchases = (purchases || []).filter(row => rowHasStudent(row, sid) && activeStatus(row));
  const entitlementRows = (entitlements || []).filter(row => rowHasStudent(row, sid) && activeStatus(row));
  return studentPurchases.some(purchaseIsTrial)
    || entitlementRows.some(purchaseIsTrial)
    || (schedule || []).some(row => rowHasStudent(row, sid) && activeStatus(row) && scheduleIsTrial(row));
}

function studentStage(student = {}, { purchases = [], entitlements = [], schedule = [] } = {}) {
  const sid = text(student.id || student.studentId);
  if (!sid) return 'none';
  const studentPurchases = (purchases || []).filter(row => rowHasStudent(row, sid) && activeStatus(row));
  const entitlementRows = (entitlements || []).filter(row => rowHasStudent(row, sid) && activeStatus(row));
  const hasFormal = studentPurchases.some(row => !purchaseIsTrial(row)) || entitlementRows.some(row => !purchaseIsTrial(row));
  if (hasFormal) return 'formal';
  const hasTrial = studentHasTrialExperience(student, { purchases, entitlements, schedule });
  if (hasTrial) return 'trial';
  return 'student';
}

function accountIsVisibleMembership(account = {}) {
  return !!account && activeStatus(account) && text(account.status) !== 'cleared';
}

function courtStage(court = {}, accounts = []) {
  const cid = text(court.id || court.courtId);
  if (!cid) return 'none';
  return (accounts || []).some(account => text(account.courtId) === cid && accountIsVisibleMembership(account))
    ? 'member'
    : 'booking';
}

function firstValue(...values) {
  return values.map(text).find(Boolean) || '';
}

function makeEmptyRow(key) {
  return {
    customerKey: key,
    sourceLeadId: '',
    leadId: '',
    studentId: '',
    courtId: '',
    membershipAccountId: '',
    displayName: '',
    phone: '',
    source: '未知',
    campus: '',
    owner: '',
    studentStage: 'none',
    courtStage: 'none',
    membershipStatus: '',
    hasTrialExperience: false,
    leadDate: '',
    createdAt: '',
    hasCourseConversion: false,
    hasBookingConversion: false,
    hasMembershipConversion: false
  };
}

function mergeIntoRow(row, patch = {}) {
  Object.entries(patch).forEach(([key, value]) => {
    if (value === undefined || value === null || value === '') return;
    if (!row[key] || row[key] === '未知' || row[key] === 'none') row[key] = value;
  });
  return row;
}

function buildCustomerLifecycleRows({
  leads = [],
  students = [],
  purchases = [],
  entitlements = [],
  schedule = [],
  courts = [],
  membershipAccounts = [],
  membershipOrders = []
} = {}) {
  const byKey = new Map();
  const leadsById = new Map((leads || []).map(row => [leadId(row), row]).filter(([id]) => id));
  const leadAliasToId = new Map();
  const leadByStudentId = new Map();
  const leadByCourtId = new Map();
  const leadByMembershipAccountId = new Map();
  (leads || []).forEach(row => {
    const id = leadId(row);
    if (!id) return;
    [id, ...mergedLeadIds(row)].forEach(alias => {
      if (alias) leadAliasToId.set(alias, id);
    });
    if (text(row.studentId)) leadByStudentId.set(text(row.studentId), id);
    if (text(row.courtId)) leadByCourtId.set(text(row.courtId), id);
    if (text(row.membershipAccountId)) leadByMembershipAccountId.set(text(row.membershipAccountId), id);
  });

  function resolveLeadSourceId(value) {
    const id = text(value);
    return id ? (leadAliasToId.get(id) || id) : '';
  }

  function rowFor(sourceId, fallbackKey) {
    const key = sourceId ? `lead:${sourceId}` : fallbackKey;
    if (!byKey.has(key)) byKey.set(key, makeEmptyRow(key));
    return byKey.get(key);
  }

  (leads || []).forEach(lead => {
    const id = leadId(lead);
    const row = rowFor(id, `lead:${id || text(lead.displayName || lead.name)}`);
    mergeIntoRow(row, {
      sourceLeadId: id,
      leadId: id,
      displayName: firstValue(lead.displayName, lead.wechatName, lead.name),
      phone: text(lead.phone),
      source: businessTaxonomy.normalizeLeadSource(lead.source),
      campus: firstValue(lead.campus, lead.campusName),
      owner: firstValue(lead.owner, lead.coach, lead.coachName),
      leadDate: firstValue(lead.leadDate, lead.createdAt),
      createdAt: firstValue(lead.createdAt, lead.leadDate)
    });
  });

  const studentsById = new Map();
  (students || []).forEach(student => {
    const sid = text(student.id || student.studentId);
    if (!sid) return;
    studentsById.set(sid, student);
    const sourceId = resolveLeadSourceId(sourceLeadId(student) || leadByStudentId.get(sid) || '');
    const row = rowFor(sourceId, `student:${sid}`);
    const stage = studentStage(student, { purchases, entitlements, schedule });
    const hasTrialExperience = studentHasTrialExperience(student, { purchases, entitlements, schedule });
    mergeIntoRow(row, {
      sourceLeadId: sourceId,
      studentId: sid,
      displayName: firstValue(student.name, student.studentName),
      phone: text(student.phone),
      source: businessTaxonomy.normalizeLeadSource(student.source),
      campus: firstValue(student.campus, student.campusName),
      owner: firstValue(student.primaryCoach, student.owner, student.coach, student.coachName),
      studentStage: stage,
      hasTrialExperience,
      leadDate: firstValue(student.leadDate, student.createdAt),
      createdAt: firstValue(student.createdAt, student.leadDate)
    });
    row.hasTrialExperience = row.hasTrialExperience || hasTrialExperience;
    row.hasCourseConversion = stage === 'formal';
  });

  const courtsById = new Map();
  (courts || []).forEach(court => {
    const cid = text(court.id || court.courtId);
    if (!cid) return;
    courtsById.set(cid, court);
    const sourceId = resolveLeadSourceId(sourceLeadId(court) || leadByCourtId.get(cid) || '');
    const row = rowFor(sourceId, `court:${cid}`);
    const stage = courtStage(court, membershipAccounts);
    mergeIntoRow(row, {
      sourceLeadId: sourceId,
      courtId: cid,
      displayName: firstValue(court.name, court.courtName),
      phone: text(court.phone),
      source: businessTaxonomy.normalizeLeadSource(court.source),
      campus: firstValue(court.campus, court.campusName),
      owner: firstValue(court.owner, court.coach, court.coachName),
      courtStage: stage,
      leadDate: firstValue(court.leadDate, court.createdAt),
      createdAt: firstValue(court.createdAt, court.leadDate)
    });
    row.hasBookingConversion = true;
  });

  (membershipAccounts || []).forEach(account => {
    const accountId = text(account.id || account.membershipAccountId);
    if (!accountId) return;
    const court = courtsById.get(text(account.courtId)) || {};
    const courtId = text(account.courtId);
    if (!courtId) return;
    const sourceId = resolveLeadSourceId(sourceLeadId(account) || sourceLeadId(court) || leadByMembershipAccountId.get(accountId) || '');
    const row = rowFor(sourceId, courtId ? `court:${courtId}` : `membership:${accountId}`);
    mergeIntoRow(row, {
      sourceLeadId: sourceId,
      courtId,
      membershipAccountId: accountId,
      displayName: firstValue(court.name, account.courtName),
      phone: firstValue(court.phone, account.phone),
      source: businessTaxonomy.normalizeLeadSource(court.source || account.source),
      campus: firstValue(court.campus, court.campusName, account.campus, account.campusName),
      membershipStatus: text(account.status),
      leadDate: firstValue(court.leadDate, account.createdAt, court.createdAt),
      createdAt: firstValue(account.createdAt, court.createdAt, court.leadDate)
    });
    if (accountIsVisibleMembership(account)) {
      row.courtStage = 'member';
      row.hasMembershipConversion = true;
    }
  });

  (membershipOrders || []).forEach(order => {
    const account = (membershipAccounts || []).find(row => text(row.id) === text(order.membershipAccountId)) || {};
    const court = courtsById.get(text(order.courtId || account.courtId)) || {};
    const sourceId = resolveLeadSourceId(sourceLeadId(order) || sourceLeadId(account) || sourceLeadId(court));
    const courtId = text(order.courtId || account.courtId);
    if (!courtId) return;
    const row = rowFor(sourceId, courtId ? `court:${courtId}` : `membership-order:${text(order.id)}`);
    mergeIntoRow(row, {
      sourceLeadId: sourceId,
      courtId,
      membershipAccountId: text(order.membershipAccountId || account.id)
    });
    if (activeStatus(order)) {
      row.courtStage = 'member';
      row.hasMembershipConversion = true;
    }
  });

  return [...byKey.values()].map(row => {
    const lead = leadsById.get(row.sourceLeadId) || {};
    if (lead && lead.id) {
      mergeIntoRow(row, {
        displayName: firstValue(lead.displayName, lead.wechatName, lead.name),
        source: businessTaxonomy.normalizeLeadSource(lead.source),
        campus: firstValue(lead.campus, lead.campusName),
        owner: firstValue(lead.owner, lead.coach, lead.coachName)
      });
    }
    row.hasCourseConversion = row.hasCourseConversion || row.studentStage === 'formal';
    row.hasTrialExperience = !!row.hasTrialExperience;
    row.hasBookingConversion = row.hasBookingConversion || row.courtStage === 'booking' || row.courtStage === 'member';
    row.hasMembershipConversion = row.hasMembershipConversion || row.courtStage === 'member';
    return row;
  });
}

function buildLeadConversionSetsFromLifecycle(rows = []) {
  const course = new Set();
  const booking = new Set();
  const membership = new Set();
  (rows || []).forEach(row => {
    const id = text(row.sourceLeadId || row.leadId);
    if (!id) return;
    if (row.hasCourseConversion) course.add(id);
    if (row.hasBookingConversion) booking.add(id);
    if (row.hasMembershipConversion) membership.add(id);
  });
  return { course, booking, membership };
}

module.exports = {
  buildCustomerLifecycleRows,
  buildLeadConversionSetsFromLifecycle,
  sourceLeadId,
  studentHasTrialExperience,
  studentStage,
  courtStage
};
