const { effectiveScheduleStatus } = require('../schedule.js');
const businessTaxonomy = require('../../public/assets/scripts/core/business-taxonomy.js');

const DEFAULT_CAMPUS_NAMES = {
  shunyi_mapo: '顺义马坡',
  shunyi: '顺义马坡',
  blue_harbor: '蓝色港湾',
  lanse_gangwan: '蓝色港湾',
  chaoyang_shilibao: '朝阳十里堡',
  shilibao: '朝阳十里堡',
  ntc: '国家网球中心',
  national_tennis_center: '国家网球中心'
};
const COURSE_TYPE_ORDER = ['小班课', '私教课', '体验课', '专项课', '陪打', '占场'];

function text(value) {
  return String(value || '').trim();
}

function parseArr(value) {
  if (Array.isArray(value)) return value;
  const raw = text(value);
  if (!raw) return [];
  try {
    const parsed = JSON.parse(raw);
    if (Array.isArray(parsed)) return parsed;
  } catch (err) {
    // 兼容老数据里的逗号分隔文本。
  }
  return raw.split(/[,，、]/).map(item => text(item)).filter(Boolean);
}

function looksLikeInternalId(value) {
  return /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{8,12}$/i.test(text(value));
}

function studentIdsOf(row = {}) {
  return [
    row.studentId,
    row.courseStudentId,
    row.primaryStudentId,
    ...parseArr(row.studentIds)
  ].map(text).filter(Boolean);
}

function buildStudentNameMap(students = []) {
  const map = new Map();
  (students || []).forEach(row => {
    const name = text(row.name || row.studentName || row.studentDisplayName);
    if (!name || looksLikeInternalId(name)) return;
    [row.id, row.studentId, row.courseStudentId].map(text).filter(Boolean).forEach(id => map.set(id, name));
  });
  return map;
}

function compactStudentNames(names = []) {
  const uniqueNames = [...new Set((names || []).map(text).filter(Boolean))];
  if (uniqueNames.length > 2) return `${uniqueNames.slice(0, 2).join('、')} 等${uniqueNames.length}人`;
  return uniqueNames.join('、') || '未填写学员';
}

function dateMs(value) {
  if (!value) return NaN;
  if (value instanceof Date) return value.getTime();
  return new Date(String(value).replace(' ', 'T')).getTime();
}

function dateKey(value) {
  const raw = text(value);
  const match = raw.match(/^(\d{4}-\d{2}-\d{2})/);
  if (match) return match[1];
  const ms = dateMs(value);
  if (!Number.isFinite(ms)) return '';
  const date = new Date(ms);
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`;
}

function addDays(date, days) {
  const next = new Date(date.getFullYear(), date.getMonth(), date.getDate());
  next.setDate(next.getDate() + days);
  return next;
}

function formatDateKey(date) {
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`;
}

function endOfMonth(date) {
  return new Date(date.getFullYear(), date.getMonth() + 1, 0);
}

function normalizeRange({ view = 'week', startDate = '', endDate = '', now = new Date(), offset = 0 } = {}) {
  const normalizedView = ['day', 'week', 'month', 'year', 'all'].includes(text(view)) ? text(view) : 'week';
  if (normalizedView === 'all') return { view: normalizedView, startDate: text(startDate), endDate: text(endDate) };
  if (startDate && endDate) {
    return { view: normalizedView, startDate: text(startDate), endDate: text(endDate) };
  }
  const base = now instanceof Date ? new Date(now.getTime()) : new Date(now);
  const safeOffset = Number.isFinite(Number(offset)) ? Number(offset) : 0;
  if (normalizedView === 'day') {
    const date = addDays(base, safeOffset);
    const key = formatDateKey(date);
    return { view: normalizedView, startDate: key, endDate: key };
  }
  if (normalizedView === 'month') {
    const date = new Date(base.getFullYear(), base.getMonth() + safeOffset, 1);
    return { view: normalizedView, startDate: formatDateKey(date), endDate: formatDateKey(endOfMonth(date)) };
  }
  if (normalizedView === 'year') {
    const year = base.getFullYear() + safeOffset;
    return { view: normalizedView, startDate: `${year}-01-01`, endDate: `${year}-12-31` };
  }
  const day = base.getDay() || 7;
  const monday = addDays(base, 1 - day + safeOffset * 7);
  const sunday = addDays(monday, 6);
  return { view: normalizedView, startDate: formatDateKey(monday), endDate: formatDateKey(sunday) };
}

function preciseLessonUnits(row = {}) {
  const hasExplicitHours = row.durationHours !== undefined || row.hours !== undefined;
  const explicitHours = Number(row.durationHours ?? row.hours);
  if (hasExplicitHours && Number.isFinite(explicitHours) && explicitHours >= 0) return round(explicitHours, 2);
  const lessonCount = Number(row.lessonCount);
  const start = dateMs(row.startTime || row.start);
  const end = dateMs(row.endTime || row.end);
  const duration = Number.isFinite(start) && Number.isFinite(end) && end > start ? (end - start) / 3600000 : 0;
  if (Number.isFinite(lessonCount) && lessonCount > 0) return round(lessonCount, 2);
  if (duration > 0) return round(duration, 2);
  return 1;
}

function round(value, digits = 1) {
  const n = Number(value) || 0;
  const factor = 10 ** digits;
  return Math.round(n * factor) / factor;
}

function canonicalCoachName(value) {
  return text(value).replace(/教练$/u, '');
}

function coachKeys(value = {}) {
  return [
    value.coachId,
    value.primaryCoachId,
    value.id,
    value.username,
    value.coach,
    value.coachName,
    value.primaryCoach,
    value.ownerCoach,
    value.snapshotCoachName,
    ...parseArr(value.coachIds),
    ...parseArr(value.coachNames),
    ...parseArr(value.allowedCoaches)
  ].map(text).filter(Boolean);
}

function coachMatchKeys(row = {}, user = {}, coachName = '') {
  const rowKeys = coachKeys(row).map(value => canonicalCoachName(value));
  const userKeys = coachKeys({
    coachId: user.coachId,
    id: user.id,
    username: user.username,
    coach: coachName,
    coachName: coachName || user.coachName,
    primaryCoach: user.primaryCoach,
    ownerCoach: user.ownerCoach,
    snapshotCoachName: user.snapshotCoachName,
    coachIds: user.coachIds,
    coachNames: user.coachNames,
    allowedCoaches: user.allowedCoaches
  }).map(value => canonicalCoachName(value));
  return { rowKeys, userKeys };
}

function matchesCoach(row = {}, user = {}, coachName = '') {
  if (user?.role === 'admin' && !coachName) return true;
  const { rowKeys, userKeys } = coachMatchKeys(row, user, coachName);
  if (!rowKeys.length || !userKeys.length) return user?.role === 'admin';
  return rowKeys.some(name => userKeys.includes(name));
}

function normalizeCoachCourseType(row = {}) {
  const raw = `${text(row.courseType)} ${text(row.standardCourseType)} ${text(row.experienceType)} ${text(row.packageName)} ${text(row.productName)}`;
  if (/占场/.test(raw)) return '占场';
  const normalized = businessTaxonomy.normalizeCourseType(row || {});
  if (normalized?.level1 === '陪打') return '陪打';
  if (normalized?.level1 === '体验课') return '体验课';
  if (normalized?.level1 === '专项课') return '专项课';
  if (normalized?.level1 === '小班课' || normalized?.level1 === '大师课') return '小班课';
  return '私教课';
}

function preciseCourseType(row = {}) {
  return text(row.standardCourseType) || text(row.courseType) || normalizeCoachCourseType(row);
}

function studentText(row = {}, studentNameMap = new Map()) {
  const idNames = studentIdsOf(row).map(id => studentNameMap.get(id)).filter(Boolean);
  const names = [...idNames, ...parseArr(row.studentNames), row.studentName, row.studentDisplayName]
    .map(text)
    .filter(name => !looksLikeInternalId(name))
    .filter(Boolean);
  return compactStudentNames(names);
}

function buildCampusMap(campuses = []) {
  const map = new Map();
  (campuses || []).forEach(item => {
    const name = text(item.name || item.campusName || item.label);
    [item.id, item.value, item.code, item.key, item.name].map(text).filter(Boolean).forEach(key => map.set(key, name || key));
  });
  Object.entries(DEFAULT_CAMPUS_NAMES).forEach(([key, name]) => {
    if (!map.has(key)) map.set(key, name);
  });
  return map;
}

function locationText(row = {}, campusMap = new Map()) {
  const campus = text(row.campusName) || campusMap.get(text(row.campus)) || text(row.campus) || text(row.primaryCampus);
  const venue = text(row.venue || row.courtName || row.fieldName);
  if (campus && venue) return `${campus} · ${venue}`;
  return campus || venue || '';
}

function timeText(row = {}) {
  const start = text(row.startTime || row.start).match(/\d{1,2}:\d{2}/)?.[0] || '';
  const end = text(row.endTime || row.end).match(/\d{1,2}:\d{2}/)?.[0] || '';
  return start && end ? `${start}-${end}` : start || end;
}

function trendKeys(range = {}, rows = []) {
  if (range.view === 'all') {
    const keys = [...new Set(rows.map(row => dateKey(row.startTime || row.start).slice(0, 7)).filter(Boolean))];
    return keys.sort();
  }
  if (range.view === 'year') {
    const year = text(range.startDate).slice(0, 4);
    return Array.from({ length: 12 }, (_, index) => `${year}-${String(index + 1).padStart(2, '0')}`);
  }
  const start = new Date(`${range.startDate}T00:00:00`);
  const end = new Date(`${range.endDate}T00:00:00`);
  if (!Number.isFinite(start.getTime()) || !Number.isFinite(end.getTime()) || end < start) return [];
  const keys = [];
  for (let date = start; date <= end; date = addDays(date, 1)) keys.push(formatDateKey(date));
  return keys;
}

function trendBucketKey(row = {}, view = 'week') {
  const key = dateKey(row.startTime || row.start);
  return view === 'year' || view === 'all' ? key.slice(0, 7) : key;
}

function inRange(row = {}, range = {}) {
  const key = dateKey(row.startTime || row.start);
  if (range.view === 'all') {
    if (!key) return false;
    if (range.startDate && key < range.startDate) return false;
    if (range.endDate && key > range.endDate) return false;
    return true;
  }
  return !!key && key >= range.startDate && key <= range.endDate;
}

function completedDateRange(range = {}, rows = []) {
  if (range.view !== 'all') return range;
  if (range.startDate && range.endDate) return range;
  const keys = rows.map(row => row.dateKey).filter(Boolean).sort();
  if (!keys.length) return range;
  return { ...range, startDate: keys[0], endDate: keys[keys.length - 1] };
}

function buildCoachCompletedLessonStats({ schedule = [], campuses = [], students = [], user = {}, coachName = '', view = 'week', startDate = '', endDate = '', now = new Date(), offset = 0 } = {}) {
  const range = normalizeRange({ view, startDate, endDate, now, offset });
  const campusMap = buildCampusMap(campuses);
  const studentNameMap = buildStudentNameMap(students);
  const rows = (Array.isArray(schedule) ? schedule : [])
    .filter(row => matchesCoach(row, user, coachName))
    .filter(row => effectiveScheduleStatus(row, now) === '已结束')
    .filter(row => inRange(row, range))
    .map(row => ({
      ...row,
      lessonUnits: preciseLessonUnits(row),
      courseTypeGroup: normalizeCoachCourseType(row),
      dateKey: dateKey(row.startTime || row.start),
      startMs: dateMs(row.startTime || row.start)
    }));
  const responseRange = completedDateRange(range, rows);
  const totalLessonUnits = round(rows.reduce((sum, row) => sum + row.lessonUnits, 0), 2);
  const byTypeMap = new Map();
  rows.forEach(row => {
    const key = row.courseTypeGroup || '未分类';
    byTypeMap.set(key, round((byTypeMap.get(key) || 0) + row.lessonUnits, 2));
  });
  const byType = [...byTypeMap.entries()]
    .map(([type, lessonUnits]) => ({
      type,
      lessonUnits,
      percent: totalLessonUnits ? round((lessonUnits / totalLessonUnits) * 100, 1) : 0
    }))
    .sort((a, b) => {
      const diff = b.lessonUnits - a.lessonUnits;
      if (diff) return diff;
      const aIndex = COURSE_TYPE_ORDER.includes(a.type) ? COURSE_TYPE_ORDER.indexOf(a.type) : COURSE_TYPE_ORDER.length;
      const bIndex = COURSE_TYPE_ORDER.includes(b.type) ? COURSE_TYPE_ORDER.indexOf(b.type) : COURSE_TYPE_ORDER.length;
      return aIndex - bIndex || a.type.localeCompare(b.type, 'zh-Hans-CN');
    });
  const trendMap = new Map();
  rows.forEach(row => {
    const key = trendBucketKey(row, range.view);
    trendMap.set(key, round((trendMap.get(key) || 0) + row.lessonUnits, 2));
  });
  const trend = trendKeys(responseRange, rows).map(key => ({ key, lessonUnits: trendMap.get(key) || 0 }));
  const detailMap = new Map();
  rows.forEach(row => {
    const key = row.dateKey;
    if (!detailMap.has(key)) detailMap.set(key, []);
    detailMap.get(key).push(row);
  });
  const detailGroups = [...detailMap.entries()]
    .sort((a, b) => b[0].localeCompare(a[0]))
    .map(([key, items]) => {
      const sorted = items.slice().sort((a, b) => a.startMs - b.startMs);
      return {
        key,
        lessonUnits: round(sorted.reduce((sum, row) => sum + row.lessonUnits, 0), 2),
        expanded: true,
        items: sorted.map(row => ({
          id: text(row.id || row.scheduleId),
          date: key,
          timeText: timeText(row),
          lessonUnits: row.lessonUnits,
          courseTypeText: preciseCourseType(row),
          courseTypeGroup: row.courseTypeGroup,
          studentText: studentText(row, studentNameMap),
          locationText: locationText(row, campusMap)
        }))
      };
    });
  return {
    metricSource: {
      matchesAdminMetric: true,
      factTable: 'ft_schedule',
      statusRule: 'effectiveScheduleStatus(row, now) === 已结束',
      lessonUnitRule: '按全平台 COACH_LESSON_HOURS 口径优先汇总 lessonCount，缺失时按实际时长兜底'
    },
    range: responseRange,
    summary: {
      totalLessonUnits,
      typeHighlights: byType.slice(0, 3).map(row => ({ type: row.type, lessonUnits: row.lessonUnits }))
    },
    byType,
    trend,
    detailGroups,
    pagination: {
      total: rows.length
    }
  };
}

module.exports = {
  buildCoachCompletedLessonStats,
  normalizeRange,
  preciseLessonUnits,
  normalizeCoachCourseType
};
