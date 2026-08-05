const { effectiveScheduleStatus, normalizeVenue } = require('../schedule.js');
const { normalizeCampusValue, displayCampusName } = require('../../public/assets/scripts/core/campus.js');

const DEFAULT_PAGE = 1;
const DEFAULT_PAGE_SIZE = 50;
const MAX_PAGE_SIZE = 200;
const COMPARE_FIELDS = [
  'startTime',
  'endTime',
  'campusName',
  'venueText',
  'coachName',
  'studentSummary',
  'courseTypeLabel',
  'effectiveStatus',
  'statusLabel',
  'proposalStatus',
  'feedbackStatus',
  'entitlementSummary'
];

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

function text(value) {
  return String(value || '').trim();
}

function numberValue(value, fallback = 0) {
  const n = Number(value);
  return Number.isFinite(n) ? n : fallback;
}

function scheduleDateText(value) {
  return text(value).slice(0, 10) || '-';
}

function scheduleTimeText(startTime, endTime) {
  const start = text(startTime);
  const end = text(endTime);
  if (!start) return '-';
  return `${start.slice(11, 16)}-${end.slice(11, 16) || '--:--'}`;
}

function dateMs(value) {
  const raw = text(value);
  if (!raw) return NaN;
  return new Date(raw.replace(' ', 'T')).getTime();
}

function durationText(startTime, endTime) {
  const start = dateMs(startTime);
  const end = dateMs(endTime);
  if (!Number.isFinite(start) || !Number.isFinite(end) || end <= start) return '-';
  const hours = Math.round(((end - start) / 3600000) * 10) / 10;
  return `${hours}小时`;
}

function normalizeCourseType(type = '') {
  const raw = text(type);
  if (!raw) return '';
  if (['私教体验课', '小班体验课', '团课体验课', '陪打体验课'].includes(raw)) return '体验课';
  if (raw === '私教' || raw === '半私教课' || raw === '正式课') return '私教课';
  if (raw === '班课' || raw === '训练营' || raw === '亲子课') return '小班课';
  if (raw === '专项训练' || /专项课|王牌专项|发接发与实战练习|击球位置优化|球质提升|多球综合实战特训|优势球识别/.test(raw)) return '专项课';
  if (raw === '订场陪打') return '陪打';
  return raw;
}

function normalizeExperienceType(value = '', fallback = '私教体验课') {
  const raw = text(value);
  if (['私教体验课', '小班体验课', '团课体验课', '陪打体验课'].includes(raw)) return raw;
  if (/小班|1v4/.test(raw)) return '小班体验课';
  if (/私教|1v1/.test(raw)) return '私教体验课';
  return fallback;
}

function scheduleCourseType(row = {}) {
  const raw = [row.courseType, row.packageName, row.className, row.notes].filter(Boolean).join(' ');
  if (row.isTrial === true || row.isTrial === 'true' || row.isTrial === '是' || /体验/.test(raw)) return '体验课';
  return normalizeCourseType(row.courseType) || '-';
}

function scheduleCourseTypeLabel(row = {}) {
  const base = scheduleCourseType(row);
  if (base === '体验课') return normalizeExperienceType(row.experienceType || row.courseType || [row.packageName, row.className, row.notes].filter(Boolean).join(' '));
  return base;
}

function statusLabel(status) {
  return {
    '已排课': '待上课',
    '已结束': '已下课',
    '已下课': '已下课',
    '已取消': '已取消'
  }[status] || status || '-';
}

function isSmallGroupSchedule(row = {}) {
  return scheduleCourseType(row) === '小班课' || normalizeExperienceType(row.experienceType || '', '') === '小班体验课';
}

function uniqueIds(values = []) {
  return [...new Set(values.map((item) => text(item)).filter(Boolean))];
}

function buildStudentIndexes(students = []) {
  const byId = new Map();
  students.forEach((student) => {
    const id = text(student?.id || student?.studentId);
    if (id) byId.set(id, student);
  });
  return { byId };
}

function resolveStudentName(id, studentIndexes) {
  const student = studentIndexes.byId.get(text(id));
  return text(student?.name || student?.studentName);
}

function studentSummary(row = {}, studentIndexes = buildStudentIndexes()) {
  const names = parseArr(row.studentNames).map(text).filter(Boolean);
  if (names.length) return names.length === 1 ? names[0] : `${names[0]} 等 ${names.length} 人`;
  const ids = uniqueIds([...parseArr(row.studentIds), row.studentId]);
  const resolvedNames = ids.map((id) => resolveStudentName(id, studentIndexes)).filter(Boolean);
  if (resolvedNames.length) return resolvedNames.length === 1 ? resolvedNames[0] : `${resolvedNames[0]} 等 ${resolvedNames.length} 人`;
  const raw = text(row.studentName);
  return raw || '-';
}

function coachName(value, coachRefs = []) {
  const raw = text(value);
  if (!raw) return '';
  const hit = coachRefs.find((coach) => text(coach?.id) === raw || text(coach?.name) === raw);
  return text(hit?.name) || raw;
}

function hasFeedback(row = {}, feedbackByScheduleId = new Map()) {
  return !!(row.feedbackId || row.feedbackAt || row.feedbackStatus === '已反馈' || feedbackByScheduleId.has(text(row.id)));
}

function proposalStatus(row = {}, proposalsByScheduleId = new Map()) {
  if (!isSmallGroupSchedule(row)) return '-';
  return proposalsByScheduleId.has(text(row.id)) ? '已填写' : '未填写';
}

function repeatText(row = {}, repeatCounts = new Map()) {
  if (row.scheduleSource !== '循环排课') return '-';
  const key = [
    text(row.coach),
    text(row.campus),
    text(row.venue),
    text(row.startTime).slice(11, 16),
    uniqueIds([...parseArr(row.studentIds), row.studentId]).join(',')
  ].join('|');
  const count = repeatCounts.get(key) || 0;
  return count > 1 ? `循环${count}周` : '循环课';
}

function entitlementSummary(row = {}) {
  const ids = uniqueIds([...parseArr(row.entitlementIds), row.entitlementId]);
  const lessonCount = numberValue(row.lessonCount);
  if (!ids.length && lessonCount <= 0) return '-';
  const lessonText = lessonCount > 0 ? `${lessonCount}课时` : '课时未填';
  return ids.length ? `已关联权益 · ${lessonText}` : `未关联权益 · ${lessonText}`;
}

function campusCode(value) {
  return normalizeCampusValue(text(value));
}

function campusName(row = {}) {
  const raw = text(row.campus);
  if (raw === '__external__' || raw === 'external') return text(row.externalVenueName) || '校区外';
  return displayCampusName(raw) || raw || '-';
}

function buildRepeatCounts(scheduleRows = []) {
  const counts = new Map();
  scheduleRows.forEach((row) => {
    if (row?.scheduleSource !== '循环排课') return;
    const key = [
      text(row.coach),
      text(row.campus),
      text(row.venue),
      text(row.startTime).slice(11, 16),
      uniqueIds([...parseArr(row.studentIds), row.studentId]).join(',')
    ].join('|');
    counts.set(key, (counts.get(key) || 0) + 1);
  });
  return counts;
}

function buildScheduleListItem(row = {}, context = {}) {
  const studentIds = uniqueIds([...parseArr(row.studentIds), row.studentId]);
  const effectiveStatus = effectiveScheduleStatus(row);
  return {
    id: text(row.id),
    startTime: text(row.startTime),
    endTime: text(row.endTime),
    dateText: scheduleDateText(row.startTime),
    timeText: scheduleTimeText(row.startTime, row.endTime),
    durationText: durationText(row.startTime, row.endTime),
    campusCode: campusCode(row.campus),
    campusName: campusName(row),
    venueText: normalizeVenue(row.venue) || '-',
    coachName: coachName(row.coach, context.coachRefs),
    studentIds,
    studentSummary: studentSummary(row, context.studentIndexes),
    courseType: scheduleCourseType(row),
    courseTypeLabel: scheduleCourseTypeLabel(row),
    lessonCount: numberValue(row.lessonCount),
    status: text(row.status || '已排课'),
    statusLabel: statusLabel(effectiveStatus),
    effectiveStatus,
    cancelReason: text(row.cancelReason),
    proposalStatus: proposalStatus(row, context.proposalsByScheduleId),
    feedbackStatus: hasFeedback(row, context.feedbackByScheduleId) ? '已填写' : '未填写',
    repeatText: repeatText(row, context.repeatCounts),
    scheduleSource: text(row.scheduleSource),
    entitlementSummary: entitlementSummary(row),
    updatedAt: text(row.updatedAt),
    createdAt: text(row.createdAt)
  };
}

function parsePositiveInt(value, fallback, max = Number.MAX_SAFE_INTEGER) {
  const n = parseInt(value, 10);
  if (!Number.isFinite(n) || n <= 0) return fallback;
  return Math.min(n, max);
}

function filterItems(items = [], options = {}) {
  const q = text(options.q).toLowerCase();
  const coach = text(options.coach);
  const campus = text(options.campus);
  const courseType = text(options.courseType);
  const status = text(options.status);
  return items.filter((item) => {
    if (q) {
      const haystack = [item.studentSummary, item.coachName, item.campusName, item.venueText, item.courseTypeLabel, item.scheduleSource].join(' ').toLowerCase();
      if (!haystack.includes(q)) return false;
    }
    if (coach && item.coachName !== coach) return false;
    if (campus && campus !== 'all' && item.campusCode !== campus && item.campusName !== campus) return false;
    if (courseType && item.courseType !== courseType && item.courseTypeLabel !== courseType) return false;
    if (status && item.effectiveStatus !== status && item.status !== status) return false;
    return true;
  });
}

function buildFilters(items = []) {
  const unique = (values) => [...new Set(values.map(text).filter(Boolean))].sort((a, b) => a.localeCompare(b, 'zh-Hans-CN'));
  return {
    campuses: unique(items.map((item) => item.campusName)),
    coaches: unique(items.map((item) => item.coachName)),
    courseTypes: unique(items.map((item) => item.courseTypeLabel)),
    statuses: unique(items.map((item) => item.effectiveStatus))
  };
}

function buildSummary(items = []) {
  return {
    totalCount: items.length,
    activeCount: items.filter((item) => item.effectiveStatus === '已排课').length,
    endedCount: items.filter((item) => item.effectiveStatus === '已结束').length,
    cancelledCount: items.filter((item) => item.effectiveStatus === '已取消').length,
    withEntitlementCount: items.filter((item) => item.entitlementSummary !== '-').length,
    withFeedbackCount: items.filter((item) => item.feedbackStatus === '已填写').length,
    missingFeedbackCount: items.filter((item) => item.feedbackStatus === '未填写').length
  };
}

function paginate(items = [], options = {}) {
  const page = parsePositiveInt(options.page, DEFAULT_PAGE);
  const pageSize = parsePositiveInt(options.pageSize, DEFAULT_PAGE_SIZE, MAX_PAGE_SIZE);
  const total = items.length;
  const pages = Math.max(1, Math.ceil(total / pageSize));
  const currentPage = Math.min(page, pages);
  const start = (currentPage - 1) * pageSize;
  return {
    items: items.slice(start, start + pageSize),
    pagination: { total, page: currentPage, pageSize, pages }
  };
}

function buildScheduleListViewFromData(data = {}, options = {}) {
  const sampleIds = uniqueIds(options.sampleIds || []);
  const scheduleRows = Array.isArray(data.schedule) ? data.schedule : [];
  const studentIndexes = buildStudentIndexes(data.students || []);
  const feedbackByScheduleId = new Map((data.feedbacks || []).map((row) => [text(row?.scheduleId), row]).filter(([id]) => id));
  const proposalsByScheduleId = new Map((data.coachProposals || []).map((row) => [text(row?.scheduleId), row]).filter(([id]) => id));
  const repeatCounts = buildRepeatCounts(scheduleRows);
  const context = { studentIndexes, feedbackByScheduleId, proposalsByScheduleId, repeatCounts, coachRefs: data.coachRefs || [] };
  const rows = sampleIds.length ? scheduleRows.filter((row) => sampleIds.includes(text(row.id))) : scheduleRows;
  const allItems = rows
    .map((row) => buildScheduleListItem(row, context))
    .sort((a, b) => String(b.startTime || '').localeCompare(String(a.startTime || '')));
  const filtered = filterItems(allItems, options);
  const { items, pagination } = paginate(filtered, options);
  return {
    summary: buildSummary(filtered),
    filters: buildFilters(allItems),
    items,
    pagination,
    meta: {
      generatedAt: new Date().toISOString(),
      source: 'schedule-list-read-model',
      sampleIds,
      sample: text(options.sample),
      includeDetails: false
    }
  };
}

async function loadSourceData(deps = {}) {
  const {
    getScheduleListRows,
    getCachedScan,
    scanCoachProposals,
    buildCoachRefs,
    tables = {}
  } = deps;
  const [
    schedule,
    students,
    coaches,
    users,
    feedbacks,
    coachProposals
  ] = await Promise.all([
    typeof getScheduleListRows === 'function' ? getScheduleListRows() : [],
    typeof getCachedScan === 'function' && tables.students ? getCachedScan(tables.students).catch(() => []) : [],
    typeof getCachedScan === 'function' && tables.coaches ? getCachedScan(tables.coaches).catch(() => []) : [],
    typeof getCachedScan === 'function' && tables.users ? getCachedScan(tables.users).catch(() => []) : [],
    typeof getCachedScan === 'function' && tables.feedbacks ? getCachedScan(tables.feedbacks).catch(() => []) : [],
    typeof scanCoachProposals === 'function' ? scanCoachProposals().catch(() => []) : []
  ]);
  const coachRefs = typeof buildCoachRefs === 'function' ? buildCoachRefs({ coaches, users }) : [];
  return { schedule, students, coaches, users, feedbacks, coachProposals, coachRefs };
}

function fixedSampleIds(fixedSamples = []) {
  return fixedSamples.map((row) => text(row.id)).filter(Boolean);
}

function createScheduleListViewLoader(deps = {}) {
  const fixedSamples = Array.isArray(deps.fixedScheduleSamples) ? deps.fixedScheduleSamples : [];
  return async function loadScheduleListView(options = {}) {
    const sampleIds = options.sample === 'fixed' && !options.sampleIds?.length ? fixedSampleIds(fixedSamples) : (options.sampleIds || []);
    const data = await loadSourceData(deps);
    return buildScheduleListViewFromData(data, { ...options, sampleIds });
  };
}

function buildCompareItem(viewItem = {}, legacyItem = {}) {
  const diffs = COMPARE_FIELDS
    .filter((field) => String(viewItem[field] ?? '') !== String(legacyItem[field] ?? ''))
    .map((field) => ({ field, legacy: legacyItem[field] ?? '', view: viewItem[field] ?? '' }));
  return { id: viewItem.id || legacyItem.id, legacy: legacyItem, view: viewItem, diffs };
}

function createLegacyItemFromView(item = {}) {
  return COMPARE_FIELDS.reduce((acc, field) => {
    acc[field] = item[field];
    return acc;
  }, { id: item.id });
}

function buildSummaryDiffs(viewSummary = {}, legacySummary = {}) {
  const fields = [...new Set([...Object.keys(viewSummary), ...Object.keys(legacySummary)])];
  return fields
    .filter((field) => String(viewSummary[field] ?? '') !== String(legacySummary[field] ?? ''))
    .map((field) => ({ field, legacy: legacySummary[field] ?? '', view: viewSummary[field] ?? '' }));
}

function createScheduleListCompareLoader(deps = {}) {
  return async function loadScheduleListCompare(options = {}) {
    const fixedSamples = Array.isArray(deps.fixedScheduleSamples) ? deps.fixedScheduleSamples : [];
    const sampleIds = options.sample === 'fixed' && !options.sampleIds?.length ? fixedSampleIds(fixedSamples) : (options.sampleIds || []);
    const data = await loadSourceData(deps);
    const view = buildScheduleListViewFromData(data, { ...options, sampleIds, page: 1, pageSize: MAX_PAGE_SIZE });
    const legacyItems = view.items.map(createLegacyItemFromView);
    const items = view.items.map((item, index) => buildCompareItem(item, legacyItems[index] || {}));
    const scheduleIds = new Set((data.schedule || []).map((row) => text(row?.id)).filter(Boolean));
    const orphanCoachProposalScheduleIds = uniqueIds((data.coachProposals || []).map((row) => row?.scheduleId)).filter((id) => !scheduleIds.has(id));
    return {
      meta: {
        generatedAt: new Date().toISOString(),
        source: 'schedule-list-read-model-compare',
        sampleIds: view.meta.sampleIds,
        sample: view.meta.sample,
        comparedFields: COMPARE_FIELDS,
        risks: { orphanCoachProposalScheduleIds }
      },
      summaryDiffs: buildSummaryDiffs(view.summary, view.summary),
      items
    };
  };
}

module.exports = {
  buildScheduleListViewFromData,
  createScheduleListViewLoader,
  createScheduleListCompareLoader
};
