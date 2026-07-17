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

function materializedStudentLead(row = {}) {
  return /^lead-from-student-/.test(leadId(row));
}

function materializedLifecycleSource(row = {}) {
  return /^lead-from-student-/.test(text(row.sourceLeadId || row.leadId));
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
    row.name
  ].filter(Boolean).join(' ');
  return normalized.level1 === '体验课' || /体验/.test(haystack);
}

function scheduleCompleted(row = {}) {
  const status = text(row.status || row.systemStatus);
  return ['已完成', '已到课', '已消课', '已结束', 'completed', 'done'].includes(status);
}

function rowHasStudent(row = {}, studentId = '') {
  const id = text(studentId);
  if (!id) return false;
  if (text(row.studentId) === id) return true;
  return parseArr(row.studentIds).map(text).includes(id);
}

function dateValue(value) {
  const raw = text(value);
  if (!raw) return Number.POSITIVE_INFINITY;
  const parsed = Date.parse(raw.replace(' ', 'T'));
  return Number.isFinite(parsed) ? parsed : Number.POSITIVE_INFINITY;
}

function firstDate(...values) {
  return values
    .flat()
    .map(text)
    .filter(Boolean)
    .sort((a, b) => dateValue(a) - dateValue(b) || a.localeCompare(b))[0] || '';
}

function businessDate(row = {}) {
  return firstValue(row.leadDate, row.followupAt, row.startTime, row.purchaseDate, row.businessDate, row.createdAt);
}

function rowAmount(row = {}) {
  const fields = ['actualAmount', 'paidAmount', 'payAmount', 'amount', 'totalAmount', 'price', 'cashDelta', 'rechargeAmount'];
  const values = fields
    .filter(field => row[field] !== undefined && row[field] !== null && text(row[field]) !== '')
    .map(field => Number(row[field]))
    .filter(value => Number.isFinite(value));
  if (!values.length) return null;
  return values.reduce((sum, value) => sum + Math.abs(value), 0);
}

function paidBusinessRow(row = {}) {
  const amount = rowAmount(row);
  return amount === null ? activeStatus(row) : activeStatus(row) && amount > 0;
}

function scheduleIsTrial(row = {}) {
  const normalized = businessTaxonomy.normalizeCourseType(row);
  const textValue = [row.courseType, row.standardCourseType, row.experienceType, row.packageName, row.productName].filter(Boolean).join(' ');
  return normalized.level1 === '体验课' || /体验/.test(textValue);
}

function scheduleIsCompanion(row = {}) {
  const normalized = businessTaxonomy.normalizeCourseType(row);
  const textValue = [row.courseType, row.standardCourseType, row.scheduleSource, row.packageName, row.productName].filter(Boolean).join(' ');
  return normalized.level1 === '陪打' || /陪打/.test(textValue);
}

function leadHasCourseStudentEntry(lead = {}) {
  const dealText = text(firstValue(lead.dealType, lead.conversionType, lead.conversion, lead.statusAfter));
  const statusText = text(firstValue(lead.leadStage, lead.rawStatus, lead.systemStatus, lead.status));
  if (lead.isCourseConverted === true || lead.hasCourseConversion === true) return true;
  if (/课程|课包|私教|小班|陪打/.test(dealText)) return true;
  if (statusText === '已成交' && text(lead.studentId || lead.formalStudentId || lead.courseStudentId)) return true;
  return false;
}

function demandFromCourseRow(row = {}) {
  const normalized = businessTaxonomy.normalizeCourseType(row);
  if (normalized.level1 === '体验课') return normalized.level2 === '小班体验课' ? '小班课' : '私教课';
  return businessTaxonomy.normalizeLeadDemandProduct(normalized.level1);
}

function ownerForCampus(campus = '', owner = '') {
  const current = text(owner);
  if (current) return current;
  const normalized = text(campus).toLowerCase();
  return normalized === 'shunyi_mapo' || normalized.includes('马坡') ? 'Mira' : '';
}

function studentRows(student = {}, { purchases = [], entitlements = [], schedule = [], feedbacks = [] } = {}) {
  const sid = text(student.id || student.studentId);
  const studentPurchases = (purchases || []).filter(row => rowHasStudent(row, sid) && activeStatus(row));
  const entitlementRows = (entitlements || []).filter(row => rowHasStudent(row, sid) && activeStatus(row));
  const scheduleRows = (schedule || []).filter(row => rowHasStudent(row, sid) && activeStatus(row));
  const feedbackRows = (feedbacks || []).filter(row => rowHasStudent(row, sid) && activeStatus(row));
  const formalPurchases = [...studentPurchases, ...entitlementRows]
    .filter(row => !purchaseIsTrial(row) && paidBusinessRow(row))
    .sort((a, b) => dateValue(businessDate(a)) - dateValue(businessDate(b)));
  const trialRows = [...studentPurchases, ...entitlementRows, ...scheduleRows, ...feedbackRows]
    .filter(row => (purchaseIsTrial(row) || scheduleIsTrial(row)) && activeStatus(row))
    .sort((a, b) => dateValue(businessDate(a)) - dateValue(businessDate(b)));
  const courseRows = scheduleRows
    .filter(row => !scheduleIsTrial(row))
    .sort((a, b) => dateValue(businessDate(a)) - dateValue(businessDate(b)));
  return { studentPurchases, entitlementRows, scheduleRows, feedbackRows, formalPurchases, trialRows, courseRows };
}

function studentTrialFacts(student = {}, { purchases = [], entitlements = [], schedule = [], feedbacks = [] } = {}) {
  const { studentPurchases, entitlementRows, scheduleRows, feedbackRows } = studentRows(student, { purchases, entitlements, schedule, feedbacks });
  const trialPurchaseRows = [...studentPurchases, ...entitlementRows]
    .filter(row => purchaseIsTrial(row) && activeStatus(row));
  const trialScheduleRows = scheduleRows
    .filter(row => scheduleIsTrial(row) && activeStatus(row));
  const trialFeedbackRows = feedbackRows
    .filter(row => scheduleIsTrial(row) && activeStatus(row));
  const bookedAt = firstDate(
    trialScheduleRows.map(businessDate),
    trialPurchaseRows.map(businessDate),
    trialFeedbackRows.map(businessDate)
  );
  const attendedAt = firstDate(
    trialScheduleRows.filter(scheduleCompleted).map(businessDate),
    trialFeedbackRows.map(businessDate)
  );
  return {
    bookedAt,
    attendedAt,
    hasTrialBooked: !!bookedAt,
    hasTrialAttended: !!attendedAt
  };
}

function studentHasTrialExperience(student = {}, { purchases = [], entitlements = [], schedule = [], feedbacks = [] } = {}) {
  const sid = text(student.id || student.studentId);
  if (!sid) return false;
  const facts = studentTrialFacts(student, { purchases, entitlements, schedule, feedbacks });
  return facts.hasTrialBooked;
}

function studentStage(student = {}, { purchases = [], entitlements = [], schedule = [], feedbacks = [] } = {}) {
  const sid = text(student.id || student.studentId);
  if (!sid) return 'none';
  const { formalPurchases } = studentRows(student, { purchases, entitlements, schedule, feedbacks });
  if (studentCoursePurchaseCountFromRows(formalPurchases)) return 'formal';
  const hasTrial = studentHasTrialExperience(student, { purchases, entitlements, schedule, feedbacks });
  if (hasTrial) return 'trial';
  return 'student';
}

function coursePurchaseIdentity(row = {}) {
  const purchaseId = text(row.purchaseId || row.id);
  return purchaseId ? `purchase:${purchaseId}` : `fallback:${businessDate(row)}:${rowAmount(row) || ''}:${text(row.courseType || row.packageName || row.productName || row.name)}`;
}

function studentCoursePurchaseCountFromRows(rows = []) {
  return new Set((rows || []).map(coursePurchaseIdentity).filter(Boolean)).size;
}

function studentCoursePurchaseCount(student = {}, { purchases = [], entitlements = [], schedule = [], feedbacks = [] } = {}) {
  const { formalPurchases } = studentRows(student, { purchases, entitlements, schedule, feedbacks });
  return studentCoursePurchaseCountFromRows(formalPurchases);
}

function studentCourseDealPath(student = {}, { purchases = [], entitlements = [], schedule = [], feedbacks = [] } = {}) {
  const coursePurchaseCount = studentCoursePurchaseCount(student, { purchases, entitlements, schedule, feedbacks });
  if (!coursePurchaseCount) return '';
  if (coursePurchaseCount > 1) return '老客续费';
  return studentHasTrialExperience(student, { purchases, entitlements, schedule, feedbacks }) ? '体验转化' : '直接成交';
}

function studentTrialStatus(student = {}, { purchases = [], entitlements = [], schedule = [], feedbacks = [] } = {}) {
  const facts = studentTrialFacts(student, { purchases, entitlements, schedule, feedbacks });
  if (studentCoursePurchaseCount(student, { purchases, entitlements, schedule, feedbacks })) {
    return facts.hasTrialBooked ? '已成交' : '';
  }
  if (facts.hasTrialAttended) return '已体验待成交';
  if (facts.hasTrialBooked) return '已约体验';
  return '';
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
    customerType: '',
    demandProduct: '',
    trialAtRaw: '',
    trialBookedAt: '',
    trialAttendedAt: '',
    courseFirstPurchaseAt: '',
    conversionAt: '',
    leadEnteredAt: '',
    firstTouchAt: '',
    bookingFirstAt: '',
    membershipFirstAt: '',
    formalCoach: '',
    profileNote: '',
    studentStage: 'none',
    courseDealPath: '',
    trialStatus: '',
    coursePurchaseCount: 0,
    hasCourseRepeatPurchase: false,
    hasTrialToCourseConversion: false,
    courtStage: 'none',
    membershipStatus: '',
    hasTrialExperience: false,
    hasScheduleRecord: false,
    hasCourseStudentEntry: false,
    hasFreeCourseFollowup: false,
    hasCompanionConversion: false,
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
  feedbacks = [],
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
      owner: ownerForCampus(firstValue(lead.campus, lead.campusName), firstValue(lead.owner, lead.coach, lead.coachName)),
      customerType: businessTaxonomy.normalizeLeadCustomerType(firstValue(lead.customerType, lead.consultType, lead.demandProduct, lead.profileNote)),
      demandProduct: businessTaxonomy.normalizeLeadDemandProduct(firstValue(lead.demandProduct, lead.consultType)),
      trialAtRaw: firstValue(lead.trialAtRaw, lead.trialLessonAt, lead.trialAt),
      trialBookedAt: firstValue(lead.trialAtRaw, lead.trialLessonAt, lead.trialAt),
      trialAttendedAt: firstValue(lead.trialAttendedAt),
      courseFirstPurchaseAt: firstValue(lead.courseFirstPurchaseAt, lead.enrollAtRaw, lead.formalSignupAt, lead.enrollAt),
      conversionAt: firstValue(lead.conversionAt, lead.courseFirstPurchaseAt, lead.enrollAtRaw, lead.formalSignupAt, lead.enrollAt),
      formalCoach: firstValue(lead.formalCoach, lead.dealCoach, lead.conversionCoach),
      profileNote: firstValue(lead.profileNote, lead.notes),
      leadDate: firstValue(lead.leadDate, materializedStudentLead(lead) ? '' : lead.createdAt),
      leadEnteredAt: firstValue(lead.leadDate, materializedStudentLead(lead) ? '' : lead.createdAt),
      hasCourseStudentEntry: leadHasCourseStudentEntry(lead),
      firstTouchAt: firstDate(
        lead.leadDate,
        lead.trialAtRaw,
        lead.trialLessonAt,
        lead.trialAt,
        lead.courseFirstPurchaseAt,
        lead.enrollAtRaw,
        lead.formalSignupAt,
        lead.enrollAt,
        lead.conversionAt,
        materializedStudentLead(lead) ? '' : lead.createdAt
      ),
      createdAt: firstValue(lead.createdAt, lead.leadDate)
    });
    if (/陪打/.test(firstValue(lead.dealType, lead.conversionType))) row.hasCompanionConversion = true;
  });

  const studentsById = new Map();
  (students || []).forEach(student => {
    const sid = text(student.id || student.studentId);
    if (!sid) return;
    studentsById.set(sid, student);
    const sourceId = resolveLeadSourceId(sourceLeadId(student) || leadByStudentId.get(sid) || '');
    const row = rowFor(sourceId, `student:${sid}`);
    const stage = studentStage(student, { purchases, entitlements, schedule, feedbacks });
    const courseDealPath = studentCourseDealPath(student, { purchases, entitlements, schedule, feedbacks });
    const trialStatus = studentTrialStatus(student, { purchases, entitlements, schedule, feedbacks });
    const trialFacts = studentTrialFacts(student, { purchases, entitlements, schedule, feedbacks });
    const hasTrialExperience = trialFacts.hasTrialBooked;
    const { formalPurchases, trialRows, courseRows, scheduleRows } = studentRows(student, { purchases, entitlements, schedule, feedbacks });
    const hasScheduleRecord = scheduleRows.length > 0;
    const coursePurchaseCount = studentCoursePurchaseCountFromRows(formalPurchases);
    const hasCourseRepeatPurchase = coursePurchaseCount > 1;
    const hasTrialToCourseConversion = coursePurchaseCount > 0 && hasTrialExperience;
    const firstFormal = formalPurchases[0] || null;
    const firstTrial = trialRows[0] || null;
    const firstCourse = courseRows[0] || null;
    const firstTouchAt = firstDate(
      student.leadDate,
      trialFacts.bookedAt,
      trialFacts.attendedAt,
      firstCourse ? businessDate(firstCourse) : '',
      firstFormal ? businessDate(firstFormal) : '',
      student.createdAt
    );
    const demandProduct = firstFormal
      ? demandFromCourseRow(firstFormal)
      : firstTrial
        ? demandFromCourseRow(firstTrial)
        : firstCourse
          ? demandFromCourseRow(firstCourse)
          : businessTaxonomy.normalizeLeadDemandProduct(firstValue(student.demandProduct, student.consultType, student.type, student.studentType));
    const formalCoach = firstFormal ? firstValue(
      firstFormal.ownerCoach,
      firstFormal.coach,
      firstFormal.coachName,
      student.primaryCoach,
      student.coach,
      student.coachName
    ) : '';
    const campus = firstValue(student.campus, student.campusName);
    const studentDisplayName = firstValue(student.name, student.studentName);
    mergeIntoRow(row, {
      sourceLeadId: sourceId,
      studentId: sid,
      displayName: studentDisplayName,
      phone: text(student.phone),
      source: businessTaxonomy.normalizeLeadSource(student.source),
      campus,
      owner: ownerForCampus(campus, firstValue(student.owner, student.followupOwner)),
      customerType: businessTaxonomy.normalizeLeadCustomerType(firstValue(student.customerType, student.type, student.studentType, student.profileNote, student.notes)),
      demandProduct,
      trialAtRaw: trialFacts.bookedAt || (firstTrial ? businessDate(firstTrial) : ''),
      trialBookedAt: trialFacts.bookedAt,
      trialAttendedAt: trialFacts.attendedAt,
      courseFirstPurchaseAt: firstFormal ? businessDate(firstFormal) : '',
      conversionAt: firstFormal ? businessDate(firstFormal) : '',
      formalCoach,
      profileNote: firstValue(student.profileNote, student.notes, firstCourse && firstCourse.notes, firstFormal && firstFormal.notes),
      studentStage: stage,
      courseDealPath,
      trialStatus,
      coursePurchaseCount,
      hasCourseRepeatPurchase,
      hasTrialToCourseConversion,
      hasTrialExperience,
      hasScheduleRecord,
      leadDate: firstValue(student.leadDate),
      leadEnteredAt: firstValue(student.leadDate),
      firstTouchAt,
      createdAt: firstValue(student.createdAt, student.leadDate)
    });
    if (studentDisplayName) row.displayName = studentDisplayName;
    row.hasTrialExperience = row.hasTrialExperience || hasTrialExperience;
    row.hasScheduleRecord = row.hasScheduleRecord || hasScheduleRecord;
    row.hasCourseStudentEntry = row.hasCourseStudentEntry || row.studentStage === 'formal';
    row.hasFreeCourseFollowup = row.hasFreeCourseFollowup || (!firstFormal && !!firstCourse);
    row.hasCourseConversion = row.hasCourseConversion || stage === 'formal';
    row.courseDealPath = row.courseDealPath || courseDealPath;
    row.trialStatus = row.trialStatus || trialStatus;
    row.coursePurchaseCount = Math.max(Number(row.coursePurchaseCount) || 0, coursePurchaseCount);
    row.hasCourseRepeatPurchase = row.hasCourseRepeatPurchase || hasCourseRepeatPurchase;
    row.hasTrialToCourseConversion = row.hasTrialToCourseConversion || hasTrialToCourseConversion;
  });

  (schedule || []).forEach(item => {
    const sourceId = resolveLeadSourceId(sourceLeadId(item));
    if (!sourceId || !activeStatus(item) || !scheduleIsCompanion(item)) return;
    const row = rowFor(sourceId, `lead:${sourceId}`);
    mergeIntoRow(row, {
      sourceLeadId: sourceId,
      displayName: firstValue(item.sourceLeadName, item.studentName),
      campus: firstValue(item.campus, item.campusName),
      formalCoach: firstValue(item.coach, item.coachName),
      conversionAt: firstValue(item.startTime, item.createdAt),
      firstTouchAt: firstDate(item.startTime, item.createdAt),
      createdAt: firstValue(item.createdAt, item.startTime)
    });
    row.hasScheduleRecord = true;
    row.hasCompanionConversion = true;
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
      leadDate: firstValue(court.leadDate),
      leadEnteredAt: firstValue(court.leadDate),
      bookingFirstAt: firstValue(court.firstBookingAt, court.bookingAt, court.lastBookingAt, court.createdAt),
      firstTouchAt: firstDate(court.leadDate, court.firstBookingAt, court.bookingAt, court.lastBookingAt, court.createdAt),
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
      leadDate: firstValue(court.leadDate),
      leadEnteredAt: firstValue(court.leadDate),
      bookingFirstAt: firstValue(court.firstBookingAt, court.bookingAt, court.lastBookingAt, court.createdAt),
      membershipFirstAt: firstValue(account.createdAt),
      firstTouchAt: firstDate(
        court.leadDate,
        court.firstBookingAt,
        court.bookingAt,
        court.lastBookingAt,
        account.createdAt,
        court.createdAt
      ),
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
      membershipAccountId: text(order.membershipAccountId || account.id),
      membershipFirstAt: firstValue(order.purchaseDate, order.createdAt, account.createdAt)
    });
    if (activeStatus(order)) {
      row.courtStage = 'member';
      row.hasMembershipConversion = true;
    }
  });

  return [...byKey.values()].map(row => {
    const lead = leadsById.get(row.sourceLeadId) || {};
    const ignoreSystemCreatedAtAsBusinessDate = materializedLifecycleSource(row);
    if (lead && lead.id) {
      mergeIntoRow(row, {
        displayName: firstValue(lead.displayName, lead.wechatName, lead.name),
        source: businessTaxonomy.normalizeLeadSource(lead.source),
        campus: firstValue(lead.campus, lead.campusName),
        owner: ownerForCampus(firstValue(lead.campus, lead.campusName), firstValue(lead.owner, lead.coach, lead.coachName)),
        customerType: businessTaxonomy.normalizeLeadCustomerType(firstValue(lead.customerType, lead.consultType, lead.demandProduct, lead.profileNote)),
        demandProduct: businessTaxonomy.normalizeLeadDemandProduct(firstValue(lead.demandProduct, lead.consultType)),
        trialAtRaw: firstValue(lead.trialAtRaw, lead.trialLessonAt, lead.trialAt),
        trialBookedAt: firstValue(lead.trialAtRaw, lead.trialLessonAt, lead.trialAt),
        trialAttendedAt: firstValue(lead.trialAttendedAt),
        courseFirstPurchaseAt: firstValue(lead.courseFirstPurchaseAt, lead.enrollAtRaw, lead.formalSignupAt, lead.enrollAt),
        conversionAt: firstValue(lead.conversionAt, lead.courseFirstPurchaseAt, lead.enrollAtRaw, lead.formalSignupAt, lead.enrollAt),
        formalCoach: firstValue(lead.formalCoach, lead.dealCoach, lead.conversionCoach),
        profileNote: firstValue(lead.profileNote, lead.notes)
      });
    }
    row.owner = ownerForCampus(row.campus, row.owner);
    row.leadEnteredAt = firstValue(row.leadEnteredAt, row.leadDate);
    row.leadDate = row.leadEnteredAt;
    row.firstTouchAt = firstDate(
      row.firstTouchAt,
      row.leadEnteredAt,
      row.trialBookedAt,
      row.trialAttendedAt,
      row.courseFirstPurchaseAt,
      row.bookingFirstAt,
      row.membershipFirstAt,
      ignoreSystemCreatedAtAsBusinessDate ? '' : row.createdAt
    );
    row.hasCourseConversion = row.hasCourseConversion || row.studentStage === 'formal';
    row.hasTrialExperience = !!row.hasTrialExperience;
    row.hasScheduleRecord = !!row.hasScheduleRecord;
    row.hasCourseStudentEntry = !!row.hasCourseStudentEntry;
    row.hasCompanionConversion = !!row.hasCompanionConversion;
    row.hasBookingConversion = row.hasBookingConversion || row.courtStage === 'booking' || row.courtStage === 'member';
    row.hasMembershipConversion = row.hasMembershipConversion || row.courtStage === 'member';
    return row;
  });
}

function buildLeadConversionSetsFromLifecycle(rows = []) {
  const course = new Set();
  const booking = new Set();
  const membership = new Set();
  const companion = new Set();
  (rows || []).forEach(row => {
    const id = text(row.sourceLeadId || row.leadId);
    if (!id) return;
    if (row.hasCourseConversion) course.add(id);
    if (row.hasBookingConversion) booking.add(id);
    if (row.hasMembershipConversion) membership.add(id);
    if (row.hasCompanionConversion) companion.add(id);
  });
  return { course, booking, membership, companion };
}

module.exports = {
  buildCustomerLifecycleRows,
  buildLeadConversionSetsFromLifecycle,
  sourceLeadId,
  studentHasTrialExperience,
  studentStage,
  studentCourseDealPath,
  studentTrialStatus,
  studentCoursePurchaseCount,
  courtStage
};
