const { effectiveScheduleStatus } = require('../schedule.js');
const {
  bookingDurationHours,
  courtHistoryBusinessDate,
  isCourtBookingHistoryRow,
  normalizeCourtHistory
} = require('../page-data/court-account-read-model.js');

function round(value, digits = 1) {
  const base = 10 ** digits;
  return Math.round((Number(value) || 0) * base) / base;
}

function money(value) {
  return Math.round((Number(value) || 0) * 100) / 100;
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

function dateKey(value) {
  if (!value) return '';
  if (value instanceof Date) return value.toISOString().slice(0, 10);
  return String(value).slice(0, 10);
}

function normalizeDateRange(range = {}) {
  const startDate = dateKey(range.startDate || range.start || '');
  const endDate = dateKey(range.endDate || range.end || '');
  return {
    startDate: startDate && /^\d{4}-\d{2}-\d{2}$/.test(startDate) ? startDate : '',
    endDate: endDate && /^\d{4}-\d{2}-\d{2}$/.test(endDate) ? endDate : ''
  };
}

function isDateRangeActive(range = {}) {
  const normalized = normalizeDateRange(range);
  return !!(normalized.startDate || normalized.endDate);
}

function dateWithinRange(value, range = {}) {
  const day = dateKey(value);
  if (!day) return !isDateRangeActive(range);
  const { startDate, endDate } = normalizeDateRange(range);
  if (startDate && day < startDate) return false;
  if (endDate && day > endDate) return false;
  return true;
}

function dateKeyUtcMs(day) {
  const match = String(day || '').match(/^(\d{4})-(\d{2})-(\d{2})$/);
  if (!match) return null;
  return Date.UTC(Number(match[1]), Number(match[2]) - 1, Number(match[3]));
}

function dateRangeDayCount(range = {}) {
  const { startDate, endDate } = normalizeDateRange(range);
  if (!startDate || !endDate) return 0;
  const start = dateKeyUtcMs(startDate);
  const end = dateKeyUtcMs(endDate);
  if (start == null || end == null || end < start) return 0;
  return Math.floor((end - start) / 86400000) + 1;
}

function beijingDateKey(value = new Date()) {
  const date = value instanceof Date ? value : new Date(value);
  if (Number.isNaN(date.getTime())) return dateKey(value);
  return new Intl.DateTimeFormat('en-CA', {
    timeZone: 'Asia/Shanghai',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit'
  }).format(date);
}

function heatCapacityRange(range = {}, now = new Date()) {
  const normalized = normalizeDateRange(range);
  if (!normalized.startDate || !normalized.endDate) return normalized;
  const today = beijingDateKey(now);
  return {
    startDate: normalized.startDate,
    endDate: normalized.endDate > today ? today : normalized.endDate
  };
}

function dateSetSpanDayCount(dateSet = new Set()) {
  const days = [...dateSet].filter(day => /^\d{4}-\d{2}-\d{2}$/.test(String(day || ''))).sort();
  if (!days.length) return 0;
  if (days.length === 1) return 1;
  const start = dateKeyUtcMs(days[0]);
  const end = dateKeyUtcMs(days[days.length - 1]);
  if (start == null || end == null || end < start) return days.length;
  return Math.floor((end - start) / 86400000) + 1;
}

function courtHeatDayCount(dateSet = new Set(), selectedDayCount = 0) {
  if (selectedDayCount) return selectedDayCount;
  const activeDays = [...dateSet].filter(day => /^\d{4}-\d{2}-\d{2}$/.test(String(day || ''))).length;
  return activeDays || dateSetSpanDayCount(dateSet);
}

function monthDays(now = new Date()) {
  const d = now instanceof Date ? now : new Date(now);
  return new Date(d.getFullYear(), d.getMonth() + 1, 0).getDate();
}

function coachAvailableHours({ period = 'week', days, now = new Date() } = {}) {
  if (Number(days) > 0) return round(Number(days) * 8 * 6 / 7, 1);
  if (period === 'today') return 8;
  if (period === 'week') return 48;
  if (period === 'month') return round(monthDays(now) * 8 * 6 / 7, 1);
  return 0;
}

function parseTimeToMinutes(value) {
  const text = String(value || '').trim();
  const match = text.match(/(\d{1,2}):(\d{2})/);
  if (!match) return null;
  return Number(match[1]) * 60 + Number(match[2]);
}

function hoursBetween(start, end) {
  const startDate = start ? new Date(start) : null;
  const endDate = end ? new Date(end) : null;
  if (startDate && endDate && !Number.isNaN(startDate.getTime()) && !Number.isNaN(endDate.getTime())) {
    return Math.max(0, round((endDate.getTime() - startDate.getTime()) / 3600000, 1));
  }
  const startMinutes = parseTimeToMinutes(start);
  const endMinutes = parseTimeToMinutes(end);
  if (startMinutes == null || endMinutes == null) return 0;
  return Math.max(0, round((endMinutes - startMinutes) / 60, 1));
}

function financeAll(overview = {}) {
  return overview && typeof overview.all === 'object' ? overview.all : overview || {};
}

function financeNumber(overview, keys = []) {
  const all = financeAll(overview);
  for (const key of keys) {
    const value = Number(all[key] ?? overview?.[key]);
    if (Number.isFinite(value)) return money(value);
  }
  return 0;
}

function sourceLeadId(row) {
  return String(row?.sourceLeadId || row?.leadId || row?.fromLeadId || '').trim();
}

function buildLeadConversionSets({ students = [], courts = [], membershipAccounts = [] } = {}) {
  const course = new Set();
  const booking = new Set();
  const membership = new Set();
  (students || []).forEach(row => {
    const id = sourceLeadId(row);
    if (id) course.add(id);
  });
  (courts || []).forEach(row => {
    const id = sourceLeadId(row);
    if (id) booking.add(id);
  });
  (membershipAccounts || []).forEach(row => {
    const id = sourceLeadId(row);
    if (id) membership.add(id);
  });
  return { course, booking, membership };
}

function normalizeLeadStage(lead = {}, sets = {}) {
  const explicit = String(lead.leadStage || lead.systemStatus || lead.stage || '').trim();
  const allowed = new Set([
    '未转化', '已约体验', '已体验待转化', '课程转化', '直接成交',
    '订场转化', '会员转化', '课程+订场', '课程+会员', '订场+会员', '课程+订场+会员', '已流失'
  ]);
  if (allowed.has(explicit)) return explicit;

  const ids = leadIds(lead);
  const hasCourse = !!(lead.studentId || lead.formalStudentId || lead.courseStudentId || ids.some(id => sets.course?.has(id)));
  const hasBooking = !!(lead.courtId || lead.bookingCourtId || ids.some(id => sets.booking?.has(id)));
  const hasMembership = !!(lead.membershipAccountId || lead.memberId || ids.some(id => sets.membership?.has(id)));
  const converted = [
    hasCourse ? '课程' : '',
    hasBooking ? '订场' : '',
    hasMembership ? '会员' : ''
  ].filter(Boolean);
  if (converted.length >= 2) return converted.join('+');
  if (hasCourse) return '课程转化';
  if (hasBooking) return '订场转化';
  if (hasMembership) return '会员转化';

  const raw = `${lead.rawStatus || ''} ${lead.status || ''} ${lead.statusAfter || ''} ${lead.trialStatus || ''}`;
  if (/流失/.test(raw)) return '已流失';
  if (/已体验|体验待转化/.test(raw)) return '已体验待转化';
  if (/已约|预约|约体验/.test(raw)) return '已约体验';
  return '未转化';
}

function buildStageRows(leads = [], sets = {}) {
  const order = ['未转化', '已约体验', '已体验待转化', '课程转化', '直接成交', '订场转化', '会员转化', '课程+订场', '课程+会员', '订场+会员', '课程+订场+会员', '已流失'];
  const counts = new Map(order.map(stage => [stage, 0]));
  (leads || []).forEach(lead => {
    const stage = normalizeLeadStage(lead, sets);
    counts.set(stage, (counts.get(stage) || 0) + 1);
  });
  return [...counts.entries()].map(([stage, count]) => ({ stage, count })).filter(row => row.count > 0);
}

function buildSourceRows(leads = [], sets = {}) {
  const grouped = new Map();
  (leads || []).forEach(lead => {
    const source = String(lead.source || '未记录').trim() || '未记录';
    const row = grouped.get(source) || { source, leads: 0, converted: 0 };
    row.leads += 1;
    if (!['未转化', '已约体验', '已体验待转化', '已流失'].includes(normalizeLeadStage(lead, sets))) row.converted += 1;
    grouped.set(source, row);
  });
  return [...grouped.values()]
    .map(row => ({ ...row, conversionRate: row.leads ? round(row.converted * 100 / row.leads, 1) : 0 }))
    .sort((a, b) => b.converted - a.converted || b.leads - a.leads);
}

function normalizeText(value, fallback = '未记录') {
  const text = String(value || '').trim();
  return text || fallback;
}

function buildCampusLabelMap(campuses = []) {
  const map = new Map();
  (campuses || []).forEach(row => {
    const label = normalizeText(row.name || row.displayName || row.code || row.id, '');
    [row.id, row.code, row.name, row.displayName].forEach(value => {
      const key = normalizeText(value, '');
      if (key && label) map.set(key, label);
    });
  });
  return map;
}

function campusLabel(value, labelMap = new Map()) {
  const text = normalizeText(value, '');
  return text ? (labelMap.get(text) || text) : '未记录';
}

function leadId(row = {}) {
  return String(row.id || row.leadId || '').trim();
}

function leadIds(row = {}) {
  const ids = Array.isArray(row._mergedLeadIds) ? row._mergedLeadIds : [];
  return [...new Set([leadId(row), ...ids].map(id => String(id || '').trim()).filter(Boolean))];
}

function studentId(row = {}) {
  return String(row.id || row.studentId || '').trim();
}

function genderText(row = {}) {
  const text = String(row.gender || row.sex || '').trim();
  if (/女|female/i.test(text)) return '女性';
  if (/男|male/i.test(text)) return '男性';
  return '';
}

function ageFromBirthDate(value, now = new Date()) {
  const date = value ? new Date(value) : null;
  if (!date || Number.isNaN(date.getTime())) return null;
  const current = now instanceof Date ? now : new Date(now);
  let age = current.getFullYear() - date.getFullYear();
  const monthDiff = current.getMonth() - date.getMonth();
  if (monthDiff < 0 || (monthDiff === 0 && current.getDate() < date.getDate())) age -= 1;
  return age;
}

function isYouthProfile(row = {}, now = new Date()) {
  const text = `${row.studentType || ''} ${row.type || ''} ${row.ageGroup || ''}`.trim();
  if (/青少年|少儿|儿童|孩子|中小学生|学生/.test(text)) return true;
  const age = Number(row.age) || ageFromBirthDate(row.birthDate, now);
  return Number.isFinite(age) && age > 0 && age < 18;
}

function profilePersonas(lead = {}, student = {}, now = new Date()) {
  const merged = { ...lead, ...student };
  const profileText = `${lead.level || ''} ${lead.consultType || ''} ${student.level || ''} ${merged.studentType || ''} ${merged.type || ''} ${merged.ageGroup || ''}`.trim();
  const personas = new Set();
  if (/零基础|小白|初学|新手/.test(profileText)) personas.add('零基础');
  if (/进阶|提升|提高|提高班|强化/.test(profileText)) personas.add('进阶提升');
  if (/私教/.test(profileText)) personas.add('私教课');
  if (/私教体验|体验.*私教|私教.*体验/.test(profileText)) personas.add('体验私教课');
  if (/小班|班课|训练营|随到随学/.test(profileText)) personas.add('小班课');
  if (/小班体验|体验.*小班|小班.*体验/.test(profileText)) personas.add('体验小班课');
  const gender = genderText(merged);
  const youth = isYouthProfile(merged, now) || /青少年|少儿|儿童|孩子|中小学生|学生/.test(profileText);
  if (youth) {
    personas.add('青少年');
    if (gender) personas.add(`青少年${gender}`);
  } else if (/成人/.test(profileText)) {
    personas.add('成人');
    if (gender) personas.add(`成人${gender}`);
  } else if (gender) {
    personas.add(`成人${gender}`);
  }
  return personas.size ? [...personas] : ['未标注人群'];
}

function buildStudentIndexes(students = []) {
  const byId = new Map();
  const byLeadId = new Map();
  (students || []).forEach(row => {
    const sid = studentId(row);
    if (sid) byId.set(sid, row);
    const lid = sourceLeadId(row);
    if (lid) byLeadId.set(lid, row);
  });
  return { byId, byLeadId };
}

function buildPurchaseCounts(purchases = []) {
  const counts = new Map();
  (purchases || [])
    .filter(row => !['voided', 'refunded', 'deleted'].includes(String(row.status || 'active')))
    .forEach(row => {
      const sid = String(row.studentId || '').trim();
      if (sid) counts.set(sid, (counts.get(sid) || 0) + 1);
    });
  return counts;
}

function parseDateValue(value) {
  if (!value) return null;
  if (value instanceof Date) return Number.isNaN(value.getTime()) ? null : value;
  const text = String(value).trim();
  if (!text) return null;
  const date = new Date(text);
  return Number.isNaN(date.getTime()) ? null : date;
}

function leadTrialDone(lead = {}, now = new Date()) {
  const current = now instanceof Date ? now : new Date(now);
  return ['trialAtRaw', 'trialLessonAt', 'trialAt'].some(key => {
    const date = parseDateValue(lead[key]);
    return date && date.getTime() <= current.getTime();
  });
}

function courseConversionRows(data = {}, options = {}) {
  const now = options.now || new Date();
  const sets = buildLeadConversionSets(data);
  const studentIndexes = buildStudentIndexes(data.students || []);
  const purchaseCounts = buildPurchaseCounts(data.purchases || []);
  const campusLabels = buildCampusLabelMap(data.campuses || []);
  return (data.leads || []).map(lead => {
    const id = leadId(lead);
    const ids = leadIds(lead);
    const directStudent = studentIndexes.byId.get(String(lead.studentId || lead.formalStudentId || lead.courseStudentId || '').trim());
    const linkedStudent = directStudent || ids.map(lid => studentIndexes.byLeadId.get(lid)).find(Boolean) || null;
    const sid = studentId(linkedStudent || {});
    const stage = normalizeLeadStage(lead, sets);
    const hasCourse = /课程/.test(stage) || stage === '直接成交' || !!linkedStudent || ids.some(lid => sets.course?.has(lid));
    const dealPath = String(linkedStudent?.dealPath || lead.dealPath || '').trim();
    const stageText = `${stage} ${lead.rawStatus || ''} ${lead.status || ''} ${lead.statusAfter || ''} ${lead.trialStatus || ''}`;
    const trialDone = leadTrialDone(lead, now);
    const hasAttendance = trialDone || /已体验待转化|课程转化|课程\+|已体验|实到|到课|体验课完成/.test(stageText) || (hasCourse && dealPath === '体验转化');
    const hasTrialDeal = hasCourse && dealPath !== '直接成交' && stage !== '直接成交';
    const hasAppointment = /已约体验|已体验待转化|课程转化|课程\+|约体验|预约/.test(stageText) || hasAttendance || hasTrialDeal;
    const hasRenewal = hasTrialDeal && sid && (purchaseCounts.get(sid) || 0) > 1;
    return {
      leadId: id,
      source: normalizeText(lead.source || linkedStudent?.source),
      campus: campusLabel(lead.campus || lead.campusName || linkedStudent?.campus || linkedStudent?.campusName, campusLabels),
      coach: normalizeText(linkedStudent?.primaryCoach || linkedStudent?.coach || linkedStudent?.coachName || lead.formalCoach || lead.primaryCoach || lead.coach || lead.coachName || lead.owner),
      level: normalizeText(lead.level || linkedStudent?.level, ''),
      consultType: normalizeText(lead.consultType || linkedStudent?.consultType, ''),
      studentType: normalizeText(lead.studentType || lead.type || linkedStudent?.studentType || linkedStudent?.type, ''),
      gender: normalizeText(lead.gender || lead.sex || linkedStudent?.gender || linkedStudent?.sex, ''),
      trialAtRaw: lead.trialAtRaw || '',
      trialLessonAt: lead.trialLessonAt || '',
      trialAt: lead.trialAt || '',
      hasAppointment,
      hasAttendance,
      hasTrialDeal,
      hasRenewal,
      personas: profilePersonas(lead, linkedStudent || {}, now)
    };
  });
}

function rate(part, total) {
  return total ? round(Number(part) * 100 / Number(total), 1) : 0;
}

function buildCourseFunnel(rows = []) {
  const total = rows.length;
  const steps = [
    { stage: '线索量', count: total },
    { stage: '预约体验客户', count: rows.filter(row => row.hasAppointment).length },
    { stage: '体验课实到人数', count: rows.filter(row => row.hasAttendance).length },
    { stage: '体验后成交人数', count: rows.filter(row => row.hasTrialDeal).length },
    { stage: '成交后续费人数', count: rows.filter(row => row.hasRenewal).length }
  ];
  return steps.map((row, index) => ({
    ...row,
    percentOfTotal: rate(row.count, total),
    transitionRate: index === 0 ? 100 : rate(row.count, steps[index - 1].count),
    lossRate: index === 0 ? 0 : round(100 - rate(row.count, steps[index - 1].count), 1)
  }));
}

function groupRows(rows = [], key) {
  const grouped = new Map();
  rows.forEach(row => {
    const name = normalizeText(row[key]);
    if (!grouped.has(name)) grouped.set(name, []);
    grouped.get(name).push(row);
  });
  return grouped;
}

function buildCourseSourceRanking(rows = []) {
  return [...groupRows(rows, 'source').entries()]
    .map(([source, items]) => ({
      source,
      deals: items.filter(row => row.hasTrialDeal).length,
      dealShare: 0
    }))
    .filter(row => row.deals > 0)
    .sort((a, b) => b.deals - a.deals || a.source.localeCompare(b.source, 'zh-Hans-CN'))
    .map((row, _, all) => ({
      ...row,
      dealShare: rate(row.deals, all.reduce((sum, item) => sum + item.deals, 0))
    }));
}

function buildChannelEfficiencyRows(rows = []) {
  return [...groupRows(rows, 'source').entries()]
    .map(([source, items]) => {
      const deals = items.filter(row => row.hasTrialDeal).length;
      const attendanceCount = items.filter(row => row.hasAttendance).length;
      return {
        source,
        leads: items.length,
        trialConversionRate: rate(attendanceCount, items.length),
        dealConversionRate: rate(deals, items.length),
        deals,
        finalConversionRate: rate(deals, items.length)
      };
    })
    .sort((a, b) => b.finalConversionRate - a.finalConversionRate || b.deals - a.deals || b.leads - a.leads);
}

function buildStudentAttributeRows(rows = []) {
  const grouped = new Map();
  rows.forEach(row => {
    (row.personas || []).forEach(attribute => {
      const current = grouped.get(attribute) || { attribute, base: 0, attendance: 0, deals: 0, renewals: 0 };
      current.base += 1;
      if (row.hasAttendance) current.attendance += 1;
      if (row.hasTrialDeal) current.deals += 1;
      if (row.hasRenewal) current.renewals += 1;
      grouped.set(attribute, current);
    });
  });
  return [...grouped.values()]
    .map(row => ({
      ...row,
      trialConversionRate: rate(row.attendance, row.base),
      dealConversionRate: rate(row.deals, row.base),
      renewalRate: rate(row.renewals, row.deals)
    }))
    .sort((a, b) => b.trialConversionRate - a.trialConversionRate || b.renewalRate - a.renewalRate || b.base - a.base);
}

function buildCampusConversionRateMap(rows = []) {
  const grouped = new Map();
  (rows || []).forEach(row => {
    const campus = normalizeText(row.campus, '');
    if (!campus) return;
    const current = grouped.get(campus) || { attendance: 0, deals: 0, renewals: 0 };
    if (row.hasAttendance) current.attendance += 1;
    if (row.hasTrialDeal) current.deals += 1;
    if (row.hasRenewal) current.renewals += 1;
    grouped.set(campus, current);
  });
  const result = new Map();
  grouped.forEach((row, campus) => {
    result.set(campus, {
      trialConversionRate: rate(row.deals, row.attendance),
      repeatCustomerConversionRate: rate(row.renewals, row.deals)
    });
  });
  return result;
}

function buildConversionFilterOptions(rows = [], campuses = []) {
  const values = key => [...new Set(rows.map(row => normalizeText(row[key], '')).filter(Boolean))].sort((a, b) => a.localeCompare(b, 'zh-Hans-CN'));
  const campusValues = [...new Set([
    ...values('campus'),
    ...(campuses || []).map(row => normalizeText(row.name || row.displayName || row.code || row.id, '')).filter(Boolean)
  ])].sort((a, b) => a.localeCompare(b, 'zh-Hans-CN'));
  return {
    sources: values('source'),
    campuses: campusValues,
    coaches: values('coach')
  };
}

function purchaseAmount(row = {}) {
  return money(row.actualAmount ?? row.amountPaid ?? row.finalAmount ?? row.amount ?? row.price ?? 0);
}

function buildRenewalMetrics(purchases = []) {
  const byStudent = new Map();
  (purchases || [])
    .filter(row => !['voided', 'refunded', 'deleted'].includes(String(row.status || 'active')))
    .forEach(row => {
      const studentId = String(row.studentId || '').trim();
      if (!studentId) return;
      if (!byStudent.has(studentId)) byStudent.set(studentId, []);
      byStudent.get(studentId).push(row);
    });
  let renewalCount = 0;
  let sameProjectRenewalCount = 0;
  byStudent.forEach(rows => {
    rows.sort((a, b) => String(a.purchaseDate || a.createdAt || '').localeCompare(String(b.purchaseDate || b.createdAt || '')));
    for (let i = 1; i < rows.length; i += 1) {
      renewalCount += 1;
      const currentKey = String(rows[i].packageId || rows[i].productId || rows[i].packageName || rows[i].productName || rows[i].courseType || '').trim();
      const previousKey = String(rows[i - 1].packageId || rows[i - 1].productId || rows[i - 1].packageName || rows[i - 1].productName || rows[i - 1].courseType || '').trim();
      if (currentKey && currentKey === previousKey) sameProjectRenewalCount += 1;
    }
  });
  return {
    renewalCount,
    sameProjectRenewalCount,
    sameProjectRenewalRate: renewalCount ? round(sameProjectRenewalCount * 100 / renewalCount, 1) : 0
  };
}

function scheduleCoachName(row = {}) {
  return String(row.coach || row.coachName || row.primaryCoach || row.teacher || '').trim();
}

function scheduleDurationHours(row = {}) {
  const explicit = Number(row.durationHours ?? row.hours);
  if (Number.isFinite(explicit) && explicit > 0) return round(explicit, 1);
  const lessonCount = Number(row.lessonCount);
  if (lessonCount > 0) return round(lessonCount, 1);
  return hoursBetween(row.startTime || row.start, row.endTime || row.end);
}

function isCompletedScheduleForOperations(row = {}, now = new Date()) {
  if (effectiveScheduleStatus(row, now) === '已结束') return true;
  return /已完成|completed|done/i.test(String(row.status || row.systemStatus || row.state || ''));
}

function buildCoachRows({ coaches = [], schedule = [], now = new Date() } = {}) {
  const activeCoaches = (coaches || []).filter(row => String(row.status || 'active') !== 'inactive');
  const coachNames = activeCoaches.map(row => String(row.name || row.coachName || '').trim()).filter(Boolean);
  const grouped = new Map(coachNames.map(name => [name, { coach: name, usedHours: 0, lessonCount: 0, availableHours: coachAvailableHours({ period: 'week', now }) }]));
  (schedule || []).filter(row => isCompletedScheduleForOperations(row, now)).forEach(row => {
    const coach = scheduleCoachName(row);
    if (!coach) return;
    if (!grouped.has(coach)) grouped.set(coach, { coach, usedHours: 0, lessonCount: 0, availableHours: coachAvailableHours({ period: 'week', now }) });
    const current = grouped.get(coach);
    current.usedHours = round(current.usedHours + scheduleDurationHours(row), 1);
    current.lessonCount += 1;
  });
  return [...grouped.values()].map(row => ({
    ...row,
    utilizationRate: row.availableHours ? round(row.usedHours * 100 / row.availableHours, 1) : 0
  })).sort((a, b) => b.usedHours - a.usedHours || a.coach.localeCompare(b.coach, 'zh-Hans-CN'));
}

function courtHistoryRows(courts = []) {
  return (courts || []).flatMap(court => {
    const history = normalizeCourtHistory(court.history);
    return history.map(row => ({
      ...row,
      courtId: court.id,
      campus: row.campus || court.campus || court.campusName,
      accountName: court.name || court.courtName || court.id
    }));
  });
}

const COURT_DAY_START_MINUTES = 7 * 60;
const COURT_DAY_END_MINUTES = 22 * 60;
const COURT_GOLDEN_START_MINUTES = 16 * 60;
const COURT_HEAT_SLOT_MINUTES = 30;

function normalizeVenueStatus(value) {
  const raw = String(value ?? '').trim();
  return raw === 'inactive' || raw === '停用' ? 'inactive' : 'active';
}

function textKey(value) {
  return String(value || '').trim().toLowerCase().replace(/\s+/g, '');
}

function venueTextKeys(value) {
  const raw = textKey(value);
  if (!raw) return [];
  const keys = new Set([raw]);
  const numbered = raw.match(/^(\d+)号(?:场)?$/);
  if (numbered) {
    keys.add(`${numbered[1]}号`);
    keys.add(`${numbered[1]}号场`);
  }
  return [...keys];
}

function normalizeCampusVenueRows(campus = {}) {
  return (Array.isArray(campus.venues) ? campus.venues : [])
    .map((venue, index) => {
      const name = String(venue?.name || venue?.venue || venue?.label || '').trim();
      if (!name) return null;
      return {
        venueId: String(venue?.id || venue?.venueId || `venue-${index + 1}`).trim(),
        venueName: name,
        spaceType: String(venue?.spaceType || venue?.venueSpaceType || venue?.type || '').trim(),
        status: normalizeVenueStatus(venue?.status),
        sortOrder: Number(venue?.sortOrder) || index + 1
      };
    })
    .filter(row => row && row.status !== 'inactive')
    .sort((a, b) => a.sortOrder - b.sortOrder || a.venueName.localeCompare(b.venueName, 'zh-Hans-CN'));
}

function campusIdentity(campus = {}) {
  const code = String(campus.code || campus.id || campus.name || '').trim();
  const name = String(campus.name || campus.displayName || campus.code || campus.id || '').trim() || code;
  return { code, name };
}

function buildCampusIndex(campuses = []) {
  const rows = (campuses || []).map(campus => {
    const identity = campusIdentity(campus);
    const venues = normalizeCampusVenueRows(campus);
    return { ...identity, campus, venues };
  }).filter(row => row.code || row.name);
  const aliases = new Map();
  rows.forEach(row => {
    [row.campus.id, row.campus.code, row.campus.name, row.campus.displayName, row.code, row.name]
      .map(textKey)
      .filter(Boolean)
      .forEach(key => aliases.set(key, row));
  });
  return { rows, aliases };
}

function campusIndexRowForValue(index, value) {
  return index.aliases.get(textKey(value)) || null;
}

function dateFromRow(row = {}) {
  return courtHistoryBusinessDate(row) || dateKey(row.date || row.occurredDate || row.businessDate || row.sourceDate || row.relatedDate || row.startTime || row.createdAt);
}

function parseCourtTimePoint(value) {
  const text = String(value || '').trim();
  const match = text.match(/^(\d{1,2})(?:(?::|点)(\d{1,2})?)?$/);
  if (!match) return null;
  const hour = Number(match[1]);
  const minute = Number(match[2] || 0);
  if (!Number.isFinite(hour) || !Number.isFinite(minute)) return null;
  return hour * 60 + minute;
}

function sourceTimeBandMinutes(row = {}) {
  const text = String(row.sourceTimeBand || row.time || row.timeText || '').trim();
  if (!text) return { start: null, end: null };
  const normalized = text
    .replace(/[~至到]/g, '-')
    .replace(/－|—|–/g, '-')
    .replace(/\s+/g, '');
  const parts = normalized.split('-').filter(Boolean);
  if (parts.length < 2) return { start: null, end: null };
  const start = parseCourtTimePoint(parts[0]);
  let end = parseCourtTimePoint(parts[1]);
  if (start != null && end == null) {
    const endHour = String(parts[1]).match(/^(\d{1,2})点?$/);
    if (endHour) end = Number(endHour[1]) * 60;
  }
  return { start, end };
}

function rowStartMinutes(row = {}) {
  return parseTimeToMinutes(row.startTime || row.start) ?? sourceTimeBandMinutes(row).start;
}

function rowEndMinutes(row = {}) {
  return parseTimeToMinutes(row.endTime || row.end) ?? sourceTimeBandMinutes(row).end;
}

function clampedRowMinutes(row = {}) {
  const start = rowStartMinutes(row);
  const end = rowEndMinutes(row);
  if (start == null || end == null || end <= start) return { start: null, end: null, minutes: 0 };
  const clampedStart = Math.max(COURT_DAY_START_MINUTES, start);
  const clampedEnd = Math.min(COURT_DAY_END_MINUTES, end);
  return { start: clampedStart, end: clampedEnd, minutes: Math.max(0, clampedEnd - clampedStart) };
}

function rowMinutesInBand(row = {}, bandStart, bandEnd) {
  const { start, end } = clampedRowMinutes(row);
  if (start == null || end == null) return 0;
  return Math.max(0, Math.min(end, bandEnd) - Math.max(start, bandStart));
}

function slotHours() {
  const slots = [];
  for (let minutes = COURT_DAY_START_MINUTES; minutes < COURT_DAY_END_MINUTES; minutes += COURT_HEAT_SLOT_MINUTES) {
    const hour = Math.floor(minutes / 60);
    const minute = minutes % 60;
    slots.push(`${String(hour).padStart(2, '0')}:${String(minute).padStart(2, '0')}`);
  }
  return slots;
}

function venueLookup(campusRow) {
  const byId = new Map();
  const byName = new Map();
  campusRow.venues.forEach(venue => {
    if (venue.venueId) byId.set(String(venue.venueId), venue);
    venueTextKeys(venue.venueName).forEach(key => byName.set(key, venue));
  });
  return { byId, byName };
}

function matchCampusVenue(campusRow, row = {}) {
  const lookup = venueLookup(campusRow);
  const venueId = String(row.venueId || row.venue_id || '').trim();
  if (venueId && lookup.byId.has(venueId)) return lookup.byId.get(venueId);
  const venueName = String(row.venue || row.courtName || row.sourceVenue || row.sourceProject || '').trim();
  const venueKey = venueTextKeys(venueName).find(key => lookup.byName.has(key));
  if (venueKey) return lookup.byName.get(venueKey);
  return null;
}

function hasCourtVenueHint(row = {}) {
  return !!String(row.venue || row.venueId || row.venue_id || row.courtName || row.sourceVenue || row.sourceProject || '').trim();
}

function isCourtUsageHistoryRow(row = {}) {
  return hasCourtVenueHint(row) && clampedRowMinutes(row).minutes > 0;
}

function pushSlotMinutes(slots, row, slotCounts) {
  const { start, end } = clampedRowMinutes(row);
  if (start == null || end == null) return;
  slotHours().forEach(hourText => {
    const hour = Number(hourText.slice(0, 2));
      const minute = Number(hourText.slice(3, 5));
      const slotStart = hour * 60 + minute;
      const overlap = Math.max(0, Math.min(end, slotStart + COURT_HEAT_SLOT_MINUTES) - Math.max(start, slotStart));
      if (overlap > 0) {
        slots.set(hourText, (slots.get(hourText) || 0) + overlap);
        if (slotCounts) slotCounts.set(hourText, (slotCounts.get(hourText) || 0) + 1);
      }
    });
}

function isOwnCampusSchedule(row = {}) {
  if (/external|外部|场外/i.test(String(row.locationType || ''))) return false;
  if (String(row.externalVenueName || row.externalCourtName || '').trim()) return false;
  if (/取消|cancel|void|delete/i.test(String(row.status || row.systemStatus || row.state || ''))) return false;
  return true;
}

function scheduleOccupancyRows(schedule = [], dateRange = {}) {
  return (schedule || []).filter(isOwnCampusSchedule).map(row => ({
    ...row,
    date: dateKey(row.startTime || row.date),
    amount: 0,
    countAsBooking: true
  })).filter(row => row.date && dateWithinRange(row.date, dateRange) && clampedRowMinutes(row).minutes > 0);
}

function buildEntitlementIndex(entitlements = []) {
  return new Map((entitlements || []).map(row => [String(row?.id || '').trim(), row]).filter(([id]) => id));
}

function entitlementCampusValue(row = {}, entitlementById = new Map()) {
  const entitlement = entitlementById.get(String(row.entitlementId || '').trim()) || {};
  return row.campus || row.campusName || row.sourceLocation || row.location || row.sourceCampus || row.campusCode || entitlement.campus || entitlement.campusName || parseArr(entitlement.campusIds)[0];
}

function isHistoricalCourseOccupancyRow(row = {}) {
  if (String(row.scheduleId || '').trim()) return false;
  const action = String(row.action || '').trim();
  const lessonDelta = Number(row.lessonDelta);
  if (!(action === 'consume' || action === 'free_lesson' || lessonDelta < 0)) return false;
  return isCourtUsageHistoryRow(row);
}

function historicalCourseOccupancyRows({ entitlementLedger = [], entitlements = [], campusIndex, dateRange = {} } = {}) {
  const entitlementById = buildEntitlementIndex(entitlements);
  return (entitlementLedger || [])
    .filter(row => dateFromRow(row) && dateWithinRange(dateFromRow(row), dateRange) && isHistoricalCourseOccupancyRow(row))
    .map(row => ({
      ...row,
      campus: entitlementCampusValue(row, entitlementById),
      date: dateFromRow(row),
      amount: 0,
      countAsUsage: true,
      countAsBooking: false
    }))
    .filter(row => campusIndexRowForValue(campusIndex, row.campus || row.campusName));
}

function cachedCampusCourtTotals(courts = [], campusIndex) {
  const totals = new Map();
  (courts || []).forEach(row => {
    const campusRow = campusIndexRowForValue(campusIndex, row.campus || row.campusName);
    if (!campusRow) return;
    const current = totals.get(campusRow.code) || { bookingCount: 0, bookingAmount: 0, bookingHours: 0 };
    current.bookingCount += Number(row.bookingCount) || 0;
    current.bookingAmount = money(current.bookingAmount + cachedCourtBookingAmount(row));
    current.bookingHours = round(current.bookingHours + (Number(row.bookingHours) || 0), 1);
    totals.set(campusRow.code, current);
  });
  return totals;
}

function buildConfiguredCourtMetrics({ campuses = [], courts = [], schedule = [], entitlements = [], entitlementLedger = [], dateRange = {}, now = new Date() } = {}) {
  const campusIndex = buildCampusIndex(campuses);
  const configuredVenueCount = campusIndex.rows.reduce((sum, row) => sum + row.venues.length, 0);
  if (!configuredVenueCount) return null;
  const selectedDayCount = dateRangeDayCount(heatCapacityRange(dateRange, now));
  const cachedCampusTotals = cachedCampusCourtTotals(courts, campusIndex);

  const state = new Map(campusIndex.rows.map(row => {
    const venueStates = new Map(row.venues.map(venue => [venue.venueId, {
      ...venue,
      slots: new Map(),
      slotCounts: new Map(),
      occupiedMinutes: 0,
      bookingMinutes: 0,
      bookingAmount: 0,
      bookingCount: 0,
      usageCount: 0
    }]));
    return [row.code, {
      campusCode: row.code,
      campusName: row.name,
      venueCount: row.venues.length,
      dateSet: new Set(),
      unmatchedSlots: new Map(),
      unmatchedSlotCounts: new Map(),
      unmatchedBookingAmount: 0,
      unmatchedBookingCount: 0,
      unmatchedBookingMinutes: 0,
      unmatchedUsageCount: 0,
      venueStates
    }];
  }));

  const bookingRows = courtHistoryRows(courts)
    .filter(isCourtBookingHistoryRow)
    .filter(row => dateFromRow(row) && dateWithinRange(dateFromRow(row), dateRange))
    .map(row => ({ ...row, date: dateFromRow(row), countAsBooking: true }));
  const campusBookingTotals = new Map();
  bookingRows.forEach(row => {
    const campusRow = campusIndexRowForValue(campusIndex, row.campus || row.campusName);
    if (!campusRow) return;
    const current = campusBookingTotals.get(campusRow.code) || { bookingCount: 0, bookingAmount: 0, bookingMinutes: 0 };
    current.bookingCount += 1;
    current.bookingAmount = money(current.bookingAmount + purchaseAmount(row));
    current.bookingMinutes += clampedRowMinutes(row).minutes;
    campusBookingTotals.set(campusRow.code, current);
  });
  const usageHistoryRows = courtHistoryRows(courts)
    .filter(row => dateFromRow(row) && dateWithinRange(dateFromRow(row), dateRange) && isCourtUsageHistoryRow(row))
    .map(row => ({ ...row, date: dateFromRow(row), countAsUsage: true, countAsBooking: isCourtBookingHistoryRow(row) }));
  const occupancyRows = [
    ...usageHistoryRows,
    ...scheduleOccupancyRows(schedule, dateRange).map(row => ({ ...row, countAsUsage: true, countAsBooking: false })),
    ...historicalCourseOccupancyRows({ entitlementLedger, entitlements, campusIndex, dateRange })
  ];

  occupancyRows.forEach(row => {
    const campusRow = campusIndexRowForValue(campusIndex, row.campus || row.campusName);
    if (!campusRow || !state.has(campusRow.code)) return;
    const campusState = state.get(campusRow.code);
    const date = dateFromRow(row) || row.date;
    if (date) campusState.dateSet.add(date);
    const venue = matchCampusVenue(campusRow, row);
    const minutes = clampedRowMinutes(row).minutes;
    if (!venue) {
      if (row.countAsUsage) {
        campusState.unmatchedUsageCount += 1;
        pushSlotMinutes(campusState.unmatchedSlots, row, campusState.unmatchedSlotCounts);
      }
      if (row.countAsBooking) {
        campusState.unmatchedBookingAmount = money(campusState.unmatchedBookingAmount + purchaseAmount(row));
        campusState.unmatchedBookingCount += 1;
        campusState.unmatchedBookingMinutes += minutes;
      }
      return;
    }
    const venueState = campusState.venueStates.get(venue.venueId);
    venueState.occupiedMinutes += minutes;
    venueState.usageCount += 1;
    pushSlotMinutes(venueState.slots, row, venueState.slotCounts);
    if (row.countAsBooking) {
      venueState.bookingMinutes += minutes;
      venueState.bookingAmount = money(venueState.bookingAmount + purchaseAmount(row));
      venueState.bookingCount += 1;
    }
  });

  const campusRows = [...state.values()].map(row => {
    const venueStates = [...row.venueStates.values()];
    const cachedTotals = cachedCampusTotals.get(row.campusCode) || {};
    const businessTotals = campusBookingTotals.get(row.campusCode) || {};
    const detailedBookingHours = round((venueStates.reduce((sum, venue) => sum + venue.bookingMinutes, 0) + row.unmatchedBookingMinutes) / 60, 1);
    const detailedBookingAmount = money(venueStates.reduce((sum, venue) => sum + venue.bookingAmount, 0) + row.unmatchedBookingAmount);
    const detailedBookingCount = venueStates.reduce((sum, venue) => sum + venue.bookingCount, 0) + row.unmatchedBookingCount;
    const businessBookingHours = round(Number(businessTotals.bookingMinutes || 0) / 60, 1);
    const businessBookingAmount = money(businessTotals.bookingAmount || 0);
    const businessBookingCount = Number(businessTotals.bookingCount) || 0;
    const rangeActive = isDateRangeActive(dateRange);
    const usageCount = venueStates.reduce((sum, venue) => sum + venue.usageCount, 0) + row.unmatchedUsageCount;
    const dateCount = courtHeatDayCount(row.dateSet, selectedDayCount);
    const capacity = row.venueCount * dateCount * (COURT_DAY_END_MINUTES - COURT_DAY_START_MINUTES);
    const goldenCapacity = row.venueCount * dateCount * (COURT_DAY_END_MINUTES - COURT_GOLDEN_START_MINUTES);
    const offPeakCapacity = row.venueCount * dateCount * (COURT_GOLDEN_START_MINUTES - COURT_DAY_START_MINUTES);
    const occupiedMinutes = venueStates.reduce((sum, venue) => sum + venue.occupiedMinutes, 0);
    const goldenMinutes = venueStates.reduce((sum, venue) => {
      const rows = [...venue.slots.entries()].map(([hour, minutes]) => ({ hour, minutes }));
      return sum + rows.filter(slot => Number(slot.hour.slice(0, 2)) >= 16).reduce((slotSum, slot) => slotSum + slot.minutes, 0);
    }, 0);
    const offPeakMinutes = Math.max(0, occupiedMinutes - goldenMinutes);
    return {
      campusCode: row.campusCode,
      campusName: row.campusName,
      venueCount: row.venueCount,
      bookingHours: rangeActive ? Math.max(businessBookingHours, detailedBookingHours) : Math.max(businessBookingHours, detailedBookingHours, Number(cachedTotals.bookingHours) || 0),
      occupiedHours: round(occupiedMinutes / 60, 1),
      bookingAmount: money(rangeActive ? Math.max(businessBookingAmount, detailedBookingAmount) : Math.max(businessBookingAmount, detailedBookingAmount, Number(cachedTotals.bookingAmount) || 0)),
      bookingCount: rangeActive ? Math.max(businessBookingCount, detailedBookingCount) : Math.max(businessBookingCount, detailedBookingCount, Number(cachedTotals.bookingCount) || 0),
      usageCount,
      utilizationRate: capacity ? round(occupiedMinutes * 100 / capacity, 1) : 0,
      goldenUtilizationRate: goldenCapacity ? round(goldenMinutes * 100 / goldenCapacity, 1) : 0,
      offPeakUtilizationRate: offPeakCapacity ? round(offPeakMinutes * 100 / offPeakCapacity, 1) : 0
    };
  });

  const campusHeatmaps = [...state.values()].map(row => {
    const maxSlotMinutes = Math.max(
      0,
      ...[...row.venueStates.values()].flatMap(venue => [...venue.slots.values()].map(Number)),
      ...[...row.unmatchedSlots.values()].map(Number)
    );
    const buildSlot = (minutes, hour, count = 0) => {
      const dayCount = courtHeatDayCount(row.dateSet, selectedDayCount) || 1;
      const capacity = dayCount * COURT_HEAT_SLOT_MINUTES;
      return {
        hour,
        bookedMinutes: minutes,
        capacityMinutes: capacity,
        occupiedCount: count,
        dayCount,
        utilizationRate: capacity ? round(Math.min(capacity, minutes) * 100 / capacity, 1) : 0,
        heatRate: maxSlotMinutes ? round(Math.min(maxSlotMinutes, minutes) * 100 / maxSlotMinutes, 1) : 0
      };
    };
    return {
      campusCode: row.campusCode,
      campusName: row.campusName,
      goldenUtilizationRate: campusRows.find(item => item.campusCode === row.campusCode)?.goldenUtilizationRate || 0,
      offPeakUtilizationRate: campusRows.find(item => item.campusCode === row.campusCode)?.offPeakUtilizationRate || 0,
      hours: slotHours(),
      venues: [
        ...[...row.venueStates.values()].map(venue => ({
          venueId: venue.venueId,
          venueName: venue.venueName,
          slots: slotHours().map(hour => buildSlot(venue.slots.get(hour) || 0, hour, venue.slotCounts.get(hour) || 0))
        })),
        ...(row.unmatchedSlots.size ? [{
          venueId: 'unmatched',
          venueName: '未匹配',
          isUnmatched: true,
          slots: slotHours().map(hour => buildSlot(row.unmatchedSlots.get(hour) || 0, hour, row.unmatchedSlotCounts.get(hour) || 0))
        }] : [])
      ]
    };
  });

  const venueRows = [...state.values()].flatMap(row => {
    const dateCount = courtHeatDayCount(row.dateSet, selectedDayCount);
    const capacity = dateCount * (COURT_DAY_END_MINUTES - COURT_DAY_START_MINUTES);
    const goldenCapacity = dateCount * (COURT_DAY_END_MINUTES - COURT_GOLDEN_START_MINUTES);
    const offPeakCapacity = dateCount * (COURT_GOLDEN_START_MINUTES - COURT_DAY_START_MINUTES);
    const rows = [...row.venueStates.values()].map(venue => {
      const goldenMinutes = [...venue.slots.entries()]
        .filter(([hour]) => Number(hour.slice(0, 2)) >= 16)
        .reduce((sum, [, minutes]) => sum + minutes, 0);
      const offPeakMinutes = Math.max(0, venue.occupiedMinutes - goldenMinutes);
      return {
        campusCode: row.campusCode,
        campus: row.campusName,
        venue: venue.venueName,
        hours: round(venue.bookingMinutes / 60, 1),
        occupiedHours: round(venue.occupiedMinutes / 60, 1),
        amount: money(venue.bookingAmount),
        count: venue.bookingCount,
        usageCount: venue.usageCount,
        utilizationRate: capacity ? round(venue.occupiedMinutes * 100 / capacity, 1) : 0,
        goldenUtilizationRate: goldenCapacity ? round(goldenMinutes * 100 / goldenCapacity, 1) : 0,
        offPeakUtilizationRate: offPeakCapacity ? round(offPeakMinutes * 100 / offPeakCapacity, 1) : 0
      };
    });
    if (row.unmatchedSlots.size) {
      const occupiedMinutes = [...row.unmatchedSlots.values()].reduce((sum, minutes) => sum + minutes, 0);
      const goldenMinutes = [...row.unmatchedSlots.entries()]
        .filter(([hour]) => Number(hour.slice(0, 2)) >= 16)
        .reduce((sum, [, minutes]) => sum + minutes, 0);
      const offPeakMinutes = Math.max(0, occupiedMinutes - goldenMinutes);
      rows.push({
        campusCode: row.campusCode,
        campus: row.campusName,
        venue: '未匹配',
        hours: round(row.unmatchedBookingMinutes / 60, 1),
        occupiedHours: round(occupiedMinutes / 60, 1),
        amount: money(row.unmatchedBookingAmount),
        count: row.unmatchedBookingCount,
        usageCount: row.unmatchedUsageCount,
        utilizationRate: capacity ? round(occupiedMinutes * 100 / capacity, 1) : 0,
        goldenUtilizationRate: goldenCapacity ? round(goldenMinutes * 100 / goldenCapacity, 1) : 0,
        offPeakUtilizationRate: offPeakCapacity ? round(offPeakMinutes * 100 / offPeakCapacity, 1) : 0
      });
    }
    return rows;
  }).sort((a, b) => b.usageCount - a.usageCount || b.amount - a.amount || a.campus.localeCompare(b.campus, 'zh-Hans-CN') || a.venue.localeCompare(b.venue, 'zh-Hans-CN'));
  const totalBookingAmount = money(campusRows.reduce((sum, row) => sum + row.bookingAmount, 0));
  const totalBookingCount = campusRows.reduce((sum, row) => sum + row.bookingCount, 0);
  const totalBookingHours = round(campusRows.reduce((sum, row) => sum + row.bookingHours, 0), 1);
  const totalOccupiedHours = round(campusRows.reduce((sum, row) => sum + row.occupiedHours, 0), 1);
  const totalCapacityHours = campusRows.reduce((sum, row) => {
    const campusState = state.get(row.campusCode);
    return sum + row.venueCount * courtHeatDayCount(campusState.dateSet, selectedDayCount) * ((COURT_DAY_END_MINUTES - COURT_DAY_START_MINUTES) / 60);
  }, 0);
  return {
    cards: {
      bookingHours: { title: '订场小时', value: totalBookingHours, unit: '小时' },
      bookingAmount: { title: '订场收入', value: totalBookingAmount, unit: '元' },
      bookingCount: { title: '订场次数', value: totalBookingCount, unit: '次' },
      activeVenues: { title: '启用场地', value: configuredVenueCount, unit: '片' },
      utilizationRate: { title: '场地利用率', value: totalCapacityHours ? round(totalOccupiedHours * 100 / totalCapacityHours, 1) : 0, unit: '%' }
    },
    venueRows,
    heatmap: [],
    campusRows: campusRows.sort((a, b) => b.bookingAmount - a.bookingAmount || b.utilizationRate - a.utilizationRate || a.campusName.localeCompare(b.campusName, 'zh-Hans-CN')),
    campusComparison: campusRows.map(row => ({
      campusCode: row.campusCode,
      campusName: row.campusName,
      bookingAmount: row.bookingAmount,
      utilizationRate: row.utilizationRate
    })),
    campusHeatmaps
  };
}

function buildCourtMetrics(courts = []) {
  const rows = courtHistoryRows(courts);
  const bookingRows = rows.filter(isCourtBookingHistoryRow).filter(row => courtHistoryBusinessDate(row) || dateKey(row.date || row.occurredDate || row.createdAt));
  const bookingHours = bookingRows.reduce((sum, row) => sum + bookingDurationHours(row), 0);
  const bookingAmount = bookingRows.reduce((sum, row) => sum + purchaseAmount(row), 0);
  const byVenue = new Map();
  bookingRows.forEach(row => {
    const venue = String(row.venue || row.courtName || row.accountName || row.courtId || '未记录').trim() || '未记录';
    const current = byVenue.get(venue) || { venue, hours: 0, amount: 0, count: 0 };
    current.hours = round(current.hours + bookingDurationHours(row), 1);
    current.amount = money(current.amount + purchaseAmount(row));
    current.count += 1;
    byVenue.set(venue, current);
  });
  const venueRows = [...byVenue.values()].sort((a, b) => b.hours - a.hours || b.amount - a.amount);
  if (!bookingRows.length) return buildCourtMetricsFromCachedRows(courts);
  return {
    cards: {
      bookingHours: { title: '订场小时', value: round(bookingHours, 1), unit: '小时' },
      bookingAmount: { title: '订场收入', value: money(bookingAmount), unit: '元' },
      bookingCount: { title: '订场次数', value: bookingRows.length, unit: '次' },
      activeVenues: { title: '有记录场地', value: venueRows.length, unit: '片' }
    },
    venueRows,
    heatmap: bookingRows.map(row => [
      String(row.venue || row.courtName || row.accountName || row.courtId || '未记录'),
      String(row.startTime || row.start || '').slice(0, 5) || '未记录',
      bookingDurationHours(row)
    ])
  };
}

function cachedCourtBookingAmount(row = {}) {
  return money(row.bookingAmount ?? row.memberBookingAmount ?? row.guestBookingAmount ?? 0);
}

function buildCourtMetricsFromCachedRows(courts = []) {
  const activeRows = (courts || [])
    .filter(row => String(row.status || 'active') !== 'inactive')
    .map(row => ({
      venue: String(row.name || row.courtName || row.id || '未记录').trim() || '未记录',
      hours: round(Number(row.bookingHours) || 0, 1),
      amount: cachedCourtBookingAmount(row),
      count: Number(row.bookingCount) || 0
    }))
    .filter(row => row.amount > 0 || row.count > 0 || row.hours > 0);
  return {
    cards: {
      bookingHours: { title: '订场小时', value: round(activeRows.reduce((sum, row) => sum + row.hours, 0), 1), unit: '小时' },
      bookingAmount: { title: '订场收入', value: money(activeRows.reduce((sum, row) => sum + row.amount, 0)), unit: '元' },
      bookingCount: { title: '订场次数', value: activeRows.reduce((sum, row) => sum + row.count, 0) || activeRows.length, unit: '次' },
      activeVenues: { title: '有记录场地', value: activeRows.length, unit: '片' }
    },
    venueRows: activeRows.sort((a, b) => b.amount - a.amount || b.count - a.count),
    heatmap: []
  };
}

function financeCourtBookingRows(rows = []) {
  return (rows || []).filter(row => ['会员订场', '散客订场', '约球局'].includes(String(row.businessType || row.displayBusinessType || '').trim()));
}

function parseTimeTextHours(value) {
  const text = String(value || '').trim();
  const match = text.match(/(\d{1,2}:\d{2})\s*[-~至]\s*(\d{1,2}:\d{2})/);
  if (!match) return 0;
  return hoursBetween(match[1], match[2]);
}

function buildCourtMetricsFromFinanceRows(rows = []) {
  const bookingRows = financeCourtBookingRows(rows);
  const byVenue = new Map();
  let bookingHours = 0;
  bookingRows.forEach(row => {
    const venue = String(row.sourceProject || row.sourceDocument || row.customer || '订场收入').trim() || '订场收入';
    const amount = money(Number(row.cashDelta) || Number(row.recognizedRevenueDelta) || 0);
    const hours = parseTimeTextHours(row.timeText);
    bookingHours = round(bookingHours + hours, 1);
    const current = byVenue.get(venue) || { venue, hours: 0, amount: 0, count: 0 };
    current.hours = round(current.hours + hours, 1);
    current.amount = money(current.amount + amount);
    current.count += 1;
    byVenue.set(venue, current);
  });
  const venueRows = [...byVenue.values()].sort((a, b) => b.amount - a.amount || b.count - a.count);
  return {
    cards: {
      bookingHours: { title: '订场小时', value: bookingHours, unit: '小时' },
      bookingAmount: { title: '订场收入', value: money(bookingRows.reduce((sum, row) => sum + (Number(row.cashDelta) || Number(row.recognizedRevenueDelta) || 0), 0)), unit: '元' },
      bookingCount: { title: '订场次数', value: bookingRows.length, unit: '次' },
      activeVenues: { title: '有记录场地', value: venueRows.length, unit: '片' }
    },
    venueRows,
    heatmap: bookingRows.map(row => [
      String(row.sourceProject || row.sourceDocument || row.customer || '订场收入'),
      String(row.timeText || '').slice(0, 5) || '未记录',
      parseTimeTextHours(row.timeText) || 1
    ]).filter(row => row[1] !== '未记录')
  };
}

function mergeCourtMetrics(historyMetrics, financeMetrics) {
  if (!financeMetrics?.cards?.bookingCount?.value) return historyMetrics;
  if (!historyMetrics?.cards?.bookingCount?.value) return financeMetrics;
  return {
    cards: {
      bookingHours: historyMetrics.cards.bookingHours.value ? historyMetrics.cards.bookingHours : financeMetrics.cards.bookingHours,
      bookingAmount: financeMetrics.cards.bookingAmount,
      bookingCount: financeMetrics.cards.bookingCount,
      activeVenues: historyMetrics.cards.activeVenues.value ? historyMetrics.cards.activeVenues : financeMetrics.cards.activeVenues
    },
    venueRows: historyMetrics.venueRows.length ? historyMetrics.venueRows : financeMetrics.venueRows,
    heatmap: historyMetrics.heatmap.length ? historyMetrics.heatmap : financeMetrics.heatmap
  };
}

function buildRevenueMix(financeOverviewData = {}) {
  const all = financeAll(financeOverviewData);
  return [
    { name: '课程收入', value: financeNumber(financeOverviewData, ['courseIncome']) },
    { name: '订场收入', value: financeNumber(financeOverviewData, ['bookingIncome', 'courtIncome']) },
    { name: '会员储值', value: financeNumber(financeOverviewData, ['storedValueIncome']) }
  ].filter(row => row.value > 0 || Object.keys(all).length);
}

function buildOperationsFinanceFallback(data = {}, court = {}) {
  const courseIncome = money((data.purchases || [])
    .filter(row => !['voided', 'refunded', 'deleted'].includes(String(row.status || 'active')))
    .reduce((sum, row) => sum + purchaseAmount(row), 0));
  const storedValueIncome = money((data.membershipOrders || [])
    .filter(row => String(row.status || 'active') !== 'voided')
    .reduce((sum, row) => sum + money(row.rechargeAmount ?? row.amount ?? 0), 0));
  const bookingIncome = money(court?.cards?.bookingAmount?.value || 0);
  const tradeCount = (data.purchases || []).filter(row => purchaseAmount(row) > 0).length
    + (data.membershipOrders || []).filter(row => money(row.rechargeAmount ?? row.amount ?? 0) > 0).length
    + (Number(court?.cards?.bookingCount?.value) || 0);
  return {
    courseIncome,
    storedValueIncome,
    bookingIncome,
    totalIncome: money(courseIncome + storedValueIncome + bookingIncome),
    recognizedRevenue: bookingIncome,
    pendingRevenue: money(courseIncome + storedValueIncome),
    tradeCount
  };
}

function firstRowDate(row = {}, keys = []) {
  for (const key of keys) {
    const day = dateKey(row?.[key]);
    if (day) return day;
  }
  return '';
}

function filterRowsByDateRange(rows = [], range = {}, keys = []) {
  if (!isDateRangeActive(range)) return rows || [];
  return (rows || []).filter(row => dateWithinRange(firstRowDate(row, keys), range));
}

function buildOperationsMetrics(data = {}, options = {}) {
  const now = options.now || new Date();
  const dateRange = normalizeDateRange(options.dateRange || {});
  const rangedData = {
    ...data,
    leads: filterRowsByDateRange(data.leads || [], dateRange, ['leadDate', 'createdAt', 'trialAtRaw', 'trialLessonAt', 'trialAt']),
    purchases: filterRowsByDateRange(data.purchases || [], dateRange, ['purchaseDate', 'createdAt']),
    membershipOrders: filterRowsByDateRange(data.membershipOrders || [], dateRange, ['purchaseDate', 'createdAt']),
    entitlementLedger: filterRowsByDateRange(data.entitlementLedger || [], dateRange, ['sourceDate', 'relatedDate', 'createdAt']),
    schedule: filterRowsByDateRange(data.schedule || [], dateRange, ['startTime', 'date', 'createdAt']),
    financeNormalizedRows: filterRowsByDateRange(data.financeNormalizedRows || [], dateRange, ['businessDate', 'date', 'createdAt'])
  };
  const financeOverviewData = rangedData.financeOverviewData || {};
  const sets = buildLeadConversionSets(data);
  const stageRows = buildStageRows(rangedData.leads || [], sets);
  const sourceRows = buildSourceRows(rangedData.leads || [], sets);
  const courseRows = courseConversionRows(rangedData, { now });
  const courseFunnel = buildCourseFunnel(courseRows);
  const sourceRanking = buildCourseSourceRanking(courseRows);
  const channelEfficiencyRows = buildChannelEfficiencyRows(courseRows);
  const studentAttributeRows = buildStudentAttributeRows(courseRows);
  const campusConversionRates = buildCampusConversionRateMap(courseRows);
  const renewal = buildRenewalMetrics(rangedData.purchases || []);
  const coachRows = buildCoachRows({ coaches: data.coaches || [], schedule: rangedData.schedule || [], now });
  const court = buildConfiguredCourtMetrics({
    campuses: data.campuses || [],
    courts: data.courts || [],
    schedule: data.schedule || [],
    entitlements: data.entitlements || [],
    entitlementLedger: rangedData.entitlementLedger || [],
    dateRange,
    now
  }) || mergeCourtMetrics(
    buildCourtMetrics(data.courts || []),
    buildCourtMetricsFromFinanceRows(rangedData.financeNormalizedRows || [])
  );
  if (Array.isArray(court.campusRows)) {
    court.campusRows = court.campusRows.map(row => ({
      ...row,
      ...(campusConversionRates.get(row.campusName) || { trialConversionRate: 0, repeatCustomerConversionRate: 0 })
    }));
  }
  const fallbackFinance = buildOperationsFinanceFallback(rangedData, court);
  const financeIsPartial = !!financeOverviewData.__partial;
  const financeBookingIncome = financeNumber(financeOverviewData, ['bookingIncome', 'courtIncome']);
  const financeTotalIncome = financeNumber(financeOverviewData, ['totalIncome', 'cash']);
  const financeRecognizedRevenue = financeNumber(financeOverviewData, ['recognizedRevenue', 'recognized']);
  const financePendingRevenue = financeNumber(financeOverviewData, ['pendingRevenue', 'deferred']);
  const totalIncome = financeIsPartial ? Math.max(financeTotalIncome, fallbackFinance.totalIncome) : (financeTotalIncome || fallbackFinance.totalIncome);
  const recognizedRevenue = financeIsPartial ? Math.max(financeRecognizedRevenue, fallbackFinance.recognizedRevenue) : (financeRecognizedRevenue || fallbackFinance.recognizedRevenue);
  const pendingRevenue = financeIsPartial ? Math.max(financePendingRevenue, fallbackFinance.pendingRevenue) : (financePendingRevenue || fallbackFinance.pendingRevenue);
  const totalLeads = (rangedData.leads || []).length;
  const convertedLeads = stageRows
    .filter(row => !['未转化', '已约体验', '已体验待转化', '已流失'].includes(row.stage))
    .reduce((sum, row) => sum + row.count, 0);
  const usedCoachHours = round(coachRows.reduce((sum, row) => sum + row.usedHours, 0), 1);
  const availableCoachHours = round(coachRows.reduce((sum, row) => sum + row.availableHours, 0), 1);
  const revenueMix = buildRevenueMix(financeOverviewData);
  const fallbackRevenueMix = [
    { name: '课程收入', value: fallbackFinance.courseIncome },
    { name: '订场收入', value: fallbackFinance.bookingIncome },
    { name: '会员储值', value: fallbackFinance.storedValueIncome }
  ].filter(row => row.value > 0);

  return {
    generatedAt: new Date().toISOString(),
    overview: {
      cards: {
        totalIncome: { title: '总收入', value: totalIncome, unit: '元' },
        recognizedRevenue: { title: '已入账', value: recognizedRevenue, unit: '元' },
        pendingRevenue: { title: '未入账', value: pendingRevenue, unit: '元' },
        tradeCount: { title: '成交笔数', value: financeIsPartial ? Math.max(financeNumber(financeOverviewData, ['tradeCount']), fallbackFinance.tradeCount) : (financeNumber(financeOverviewData, ['tradeCount']) || fallbackFinance.tradeCount), unit: '笔' }
      },
      revenueMix: (revenueMix.length ? revenueMix : fallbackRevenueMix).map(row => (
        row.name === '订场收入' && financeIsPartial && !financeBookingIncome && fallbackFinance.bookingIncome
          ? { ...row, value: fallbackFinance.bookingIncome }
          : row
      ))
    },
    court,
    conversion: {
      cards: {
        totalLeads: { title: '线索数', value: totalLeads, unit: '条' },
        convertedLeads: { title: '已转化线索', value: convertedLeads, unit: '条' },
        leadConversionRate: { title: '线索转化率', value: totalLeads ? round(convertedLeads * 100 / totalLeads, 1) : 0, unit: '%' },
        sameProjectRenewalRate: { title: '同项目续费率', value: renewal.sameProjectRenewalRate, unit: '%' }
      },
      stageRows,
      sourceRows,
      courseRows,
      courseFunnel,
      sourceRanking,
      channelEfficiencyRows,
      studentAttributeRows,
      filterOptions: buildConversionFilterOptions(courseRows, data.campuses || []),
      renewal
    },
    coach: {
      cards: {
        activeCoaches: { title: '在岗教练', value: coachRows.length, unit: '人' },
        availableHoursThisWeek: { title: '本周可排工时', value: availableCoachHours, unit: '小时' },
        usedHours: { title: '已排课时', value: usedCoachHours, unit: '小时' },
        utilizationRate: { title: '工时利用率', value: availableCoachHours ? round(usedCoachHours * 100 / availableCoachHours, 1) : 0, unit: '%' }
      },
      rows: coachRows
    }
  };
}

module.exports = {
  coachAvailableHours,
  buildOperationsMetrics,
  normalizeLeadStage
};
