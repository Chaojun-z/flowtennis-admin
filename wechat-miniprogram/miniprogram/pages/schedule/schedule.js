const { loginWithWechat, loadCoachWorkbench, saveCoachFeedback, saveCoachProposal, TOKEN_KEY, USER_KEY } = require('../../utils/api');
const { buildWeekDays, formatScheduleItem, weekRangeText, buildTimetableDays, classBlockStyle, workbenchTodoState, requiredFeedbackTodoVisible, scheduleLocationText, campusDisplayName } = require('../../utils/schedule');

const TIMETABLE_START_HOUR = 7;
const TIMETABLE_END_HOUR = 22;
const timetableHours = Array.from({ length: TIMETABLE_END_HOUR - TIMETABLE_START_HOUR + 1 }, (_, i) => `${String(TIMETABLE_START_HOUR + i).padStart(2, '0')}:00`);
const TIMETABLE_HOUR_HEIGHT_RPX = 150;
const TIMETABLE_DAY_WIDTH_RPX = 228;
const STUDENT_DETAIL_RECORD_PREVIEW_COUNT = 5;

function coachDisplayName(name = '') {
  const trimmed = String(name || '').trim();
  if (!trimmed) return '教练端';
  return trimmed.endsWith('教练') ? trimmed : `${trimmed}教练`;
}

function coachGreeting(now = new Date()) {
  const hour = now.getHours();
  if (hour < 11) return '早安';
  if (hour < 14) return '中午好';
  if (hour < 18) return '下午好';
  return '晚上好';
}

function dashboardCourseTag(item = {}) {
  const text = item.type || item.title || '课程';
  if (item.isTrial || /体验/.test(text)) return { text, className: 'is-trial' };
  if (/陪打|小班/.test(text)) return { text, className: 'is-group' };
  return { text, className: 'is-private' };
}

function isSmallGroupSchedule(item = {}) {
  return /小班/.test(String(item.type || item.title || item.courseType || ''));
}

function timetableCourseTag(item = {}) {
  const text = item.type || item.title || '课程';
  if (item.isTrial || /体验/.test(text)) return { text: '体验', className: 'is-trial' };
  if (/小班/.test(text)) return { text: '小班', className: 'is-group' };
  if (/陪打/.test(text)) return { text: '陪打', className: 'is-play' };
  return { text: '私教', className: 'is-private' };
}

function timetableAccentClass(className = '') {
  if (className === 'is-trial') return 'tt-course-trial';
  if (className === 'is-play' || className === 'is-group') return 'tt-course-play';
  return 'tt-course-private';
}

function statusClass(item) {
  const code = String(item.workbenchState && item.workbenchState.code || '');
  if (code === 'pending') return 'tag-danger';
  if (code === 'live' || code === 'upcoming' || code === 'travel' || code === 'later') return 'tag-green';
  return String(item.statusText || '').includes('待') ? 'tag-danger' : 'tag-green';
}

function adaptSchedule(raw = [], feedbacks = []) {
  const feedbackScheduleIds = new Set((feedbacks || []).map(item => String(item.scheduleId || '')).filter(Boolean));
  return raw.map((item) => {
    const formatted = formatScheduleItem({
      ...item,
      hasFeedback: item.hasFeedback || feedbackScheduleIds.has(String(item.id || ''))
    });
    const block = classBlockStyle(formatted);
    return {
      ...formatted,
      type: formatted.title,
      student: formatted.studentText,
      loc: formatted.locationText,
      status: formatted.statusText,
      workbenchState: formatted.workbenchState || item.workbenchState || null,
      hasFeedback: !!formatted.hasFeedback,
      feedbackPending: !formatted.hasFeedback,
      statusClass: statusClass(formatted),
      blockStyle: `top:${block.top}rpx;height:${block.height}rpx`
    };
  });
}

function decorateTimetableDays(days = []) {
  const now = new Date();
  return days.map((item) => ({
    ...item,
    displayDate: item.isToday ? String(item.date || '').replace('日', '').replace(/^0/, '') : item.date,
    headClass: item.isToday ? 'tt-day-head-active' : '',
    columnClass: item.isToday ? 'tt-day-column-active' : '',
    items: (item.items || []).map((course) => {
      const tag = timetableCourseTag(course);
      const todo = workbenchTodoState(course, now);
      const endedClass = scheduleEnded(course, now) ? 'tt-course-ended' : '';
      return {
        ...course,
        courseTagText: tag.text,
        courseTagClass: tag.className,
        accentClass: timetableAccentClass(tag.className),
        todoLabel: todo ? todo.label : '',
        endedClass
      };
    })
  }));
}

function decorateWorkbenchClass(item, now = new Date()) {
  const state = workbenchTodoState(item, now);
  const tag = dashboardCourseTag(item);
  const base = {
    ...item,
    courseTagText: tag.text,
    courseTagClass: tag.className
  };
  if (!state) return base;
  return {
    ...base,
    status: state.label,
    statusClass: state.className
  };
}

function buildWeekTodoGroups(days = [], now = new Date(), todayShownIds = new Set(), options = {}) {
  const requiredOnly = options.requiredOnly !== false;
  return days
    .map(day => ({
      ...day,
      items: (day.items || [])
        .map(item => {
          if (day.isToday && todayShownIds.has(String(item.id))) return null;
          const state = workbenchTodoState(item, now);
          if (!state) return null;
          if (requiredOnly && !(state.code === 'pending' && requiredFeedbackTodoVisible(item))) return null;
          return {
            ...item,
            todoLabel: state.label,
            todoClass: state.className,
            shortMeta: `${item.timeText} · ${item.studentText}`,
            shortLocation: item.locationText
          };
        })
        .filter(Boolean)
    }))
    .filter(day => day.items.length)
    .map(day => ({
      key: day.key,
      label: day.label,
      countText: `${day.items.length} 节`,
      items: day.items
    }));
}

function buildReminderItems({ todayCount = 0, nextClass = null, todoCount = 0, pendingCount = 0 }) {
  const items = [];
  if (todoCount > 0 || pendingCount > 0) {
    items.push({ label: '本周待办', value: todoCount, unit: '节', itemClass: '' });
    items.push({ label: '待反馈', value: pendingCount, unit: '节', itemClass: 'is-danger' });
  }
  return items;
}

function hasTravelReminder(nextClass = null) {
  const nextState = nextClass ? workbenchTodoState(nextClass) : null;
  return !!(nextState && nextState.code === 'travel');
}

function buildWeekTodoCards(groups = []) {
  return groups.flatMap((group) => {
    const labelParts = String(group.label || '').split(' ');
    const weekdayText = labelParts[0] || '';
    const dateText = labelParts[1] || '';
    return (group.items || []).map((item) => ({
      ...item,
      weekdayText,
      dateText,
      metaText: `${item.shortLocation || item.locationText || ''}｜${item.student || item.studentText || ''}`,
      packageText: firstNonEmpty(item.packageProgressText, item.packageText),
      courseTagText: dashboardCourseTag(item).text,
      courseTagClass: dashboardCourseTag(item).className,
      showFeedbackAction: item.todoLabel === '待反馈'
    }));
  });
}

function studentIdsOf(item = {}) {
  if (Array.isArray(item.studentIds)) return item.studentIds.filter(Boolean);
  if (typeof item.studentIds === 'string' && item.studentIds) {
    try {
      const parsed = JSON.parse(item.studentIds);
      return Array.isArray(parsed) ? parsed.filter(Boolean) : [];
    } catch (error) {
      return [];
    }
  }
  return [];
}

function scheduleStudentRemarkText(selectedClass = {}, students = []) {
  const ids = studentIdsOf(selectedClass);
  const names = String(selectedClass.student || selectedClass.studentName || '')
    .split(/[、,，|/]/)
    .map(item => item.trim())
    .filter(Boolean);
  const items = ids.map((id, index) => {
    const student = (students || []).find(item => String(item.id || '').trim() === String(id).trim()) || null;
    const remark = firstNonEmpty(student && student.remark);
    if (!remark) return null;
    const name = firstNonEmpty(student && student.name, student && student.studentName, names[index], `学员${index + 1}`);
    return { name, remark };
  }).filter(Boolean);
  if (!items.length) return '';
  return items.length > 1
    ? items.map(({ name, remark }) => `${name}备注：${remark}`).join('\n')
    : items[0].remark;
}

function studentRelatedClassIds(studentId = '', classes = []) {
  return (classes || [])
    .filter(item => studentIdsOf(item).includes(studentId))
    .map(item => String(item.id || '').trim())
    .filter(Boolean);
}

function scheduleMatchesStudent(student = {}, scheduleItem = {}, relatedClassIds = []) {
  const ids = studentIdsOf(scheduleItem);
  const studentId = String(student.id || '').trim();
  const studentName = String(student.name || '').trim();
  const scheduleStudentName = String(scheduleItem.student || scheduleItem.studentName || '').trim();
  const scheduleClassId = String(scheduleItem.classId || '').trim();
  if (ids.includes(studentId)) return true;
  if (String(scheduleItem.studentId || '').trim() === studentId) return true;
  if (relatedClassIds.includes(scheduleClassId)) return true;
  return !ids.length && !!studentName && scheduleStudentName === studentName;
}

function lessonUnitsText(value) {
  const n = Number(value) || 0;
  return Number.isInteger(n) ? String(n) : String(Math.round(n * 10) / 10);
}

function dateOnlyText(value = '') {
  return String(value || '').slice(0, 10);
}

function daysAgoText(value = '', now = new Date()) {
  const dateText = dateOnlyText(value);
  const date = parseLocalDate(dateText);
  if (!date) return '';
  const start = new Date(date.getFullYear(), date.getMonth(), date.getDate()).getTime();
  const today = new Date(now.getFullYear(), now.getMonth(), now.getDate()).getTime();
  const days = Math.max(0, Math.floor((today - start) / 86400000));
  return `${dateText} · ${days}天前`;
}

function lessonRecordUnitsCompactText(recordCount = 0, lessonUnits = 0) {
  return `${recordCount}/${lessonUnitsText(lessonUnits)}`;
}

function completedStudentSchedules(schedule = []) {
  return (schedule || []).filter(item => scheduleEnded(item));
}

function studentCompletedLessonSummary(schedule = []) {
  const completedSchedule = completedStudentSchedules(schedule);
  return {
    completedSchedule,
    lessonRecordCount: completedSchedule.length,
    lessonUnitsCompleted: completedSchedule.reduce((sum, item) => sum + scheduleLessonUnits(item), 0)
  };
}

function isUsableEntitlement(item = {}) {
  const status = String(item.status || '').trim();
  return status !== 'voided' && status !== '已作废' && status !== 'cancelled';
}

function studentEntitlements(studentId = '', entitlements = []) {
  const id = String(studentId || '').trim();
  if (!id) return [];
  return (entitlements || []).filter(item => String(item.studentId || '').trim() === id && isUsableEntitlement(item));
}

function lessonValue(value) {
  const n = Number(value);
  return Number.isFinite(n) ? n : 0;
}

function entitlementUsedLessons(item = {}) {
  const used = lessonValue(item.usedLessons);
  if (used > 0) return used;
  const total = lessonValue(item.totalLessons);
  const remaining = lessonValue(item.remainingLessons);
  return total > 0 ? Math.max(0, total - remaining) : 0;
}

function scheduleEntitlements(schedule = {}, entitlements = []) {
  const ids = [
    ...studentIdsOf({ studentIds: schedule.entitlementIds }),
    String(schedule.entitlementId || '').trim()
  ].filter(Boolean);
  if (ids.length) return (entitlements || []).filter(item => ids.includes(String(item.id || '').trim()) && isUsableEntitlement(item));
  const studentIds = studentIdsOf(schedule);
  if (!studentIds.length) return [];
  return (entitlements || []).filter(item => studentIds.includes(String(item.studentId || '').trim()) && isUsableEntitlement(item));
}

function scheduleLedgerRows(schedule = {}, entitlementLedger = []) {
  const scheduleId = String(schedule.id || '').trim();
  if (!scheduleId) return [];
  return (entitlementLedger || []).filter(item => String(item.scheduleId || '').trim() === scheduleId);
}

function scheduleConsumedLessonText(schedule = {}, entitlementLedger = []) {
  const consumed = scheduleLedgerRows(schedule, entitlementLedger)
    .filter(item => Number(item.lessonDelta) < 0)
    .reduce((sum, item) => sum + Math.abs(Number(item.lessonDelta) || 0), 0);
  if (consumed > 0) return `${lessonUnitsText(Math.max(consumed, scheduleLessonUnits(schedule)))} 节`;
  return scheduleEntitlements(schedule, []).length || schedule.entitlementId || studentIdsOf({ studentIds: schedule.entitlementIds }).length
    ? `${lessonUnitsText(scheduleLessonUnits(schedule))} 节`
    : '未关联课包';
}

function scheduleDurationLessonUnits(item = {}) {
  const start = parseLocalDate(item.startTime);
  const end = parseLocalDate(item.endTime);
  if (!start || !end || end <= start) return 0;
  return Math.round((end - start) / 360000) / 10;
}

function scheduleUsesAttendeeLessonUnits(item = {}) {
  const type = String(item.courseType || item.type || item.title || '').trim();
  return /小班/.test(type) && studentIdsOf(item).length >= 2;
}

function scheduleLessonUnits(item = {}) {
  const count = Number(item.lessonCount);
  const durationUnits = scheduleDurationLessonUnits(item);
  if (Number.isFinite(count) && count > 0) {
    return scheduleUsesAttendeeLessonUnits(item) ? count : Math.max(count, durationUnits);
  }
  if (durationUnits > 0) return durationUnits;
  return 1;
}

function localDateKey(value) {
  const date = value instanceof Date ? value : parseLocalDate(value);
  if (!date) return String(value || '').slice(0, 10);
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`;
}

function scheduleEnded(item = {}, now = new Date()) {
  if (item.isCancelled || item.effectiveStatus === '已取消') return false;
  const end = parseLocalDate(item.endTime);
  if (end && end <= now) return true;
  if (item.isEnded === true || item.effectiveStatus === '已结束') return true;
  if (item.isUpcoming === true || item.effectiveStatus === '已排课') return false;
  const status = String(item.status || item.statusText || '').trim();
  if (status === '已取消') return false;
  if (status === '已结束' || status === '已下课') return true;
  return false;
}

function standardWorkbenchStats(backendStats = {}) {
  return backendStats && typeof backendStats === 'object' ? backendStats : {};
}

function currentCoachName() {
  const user = wx.getStorageSync(USER_KEY) || {};
  return String(user.coachName || user.name || '').trim();
}

function currentCoachId() {
  const user = wx.getStorageSync(USER_KEY) || {};
  return String(user.coachId || user.username || user.id || '').trim();
}

function assertCoachUser(user = {}) {
  if (user.role !== 'editor') throw new Error('当前账号不是教练账号，无法进入教练端');
}

async function ensureCoachSession() {
  const token = wx.getStorageSync(TOKEN_KEY);
  const storedUser = wx.getStorageSync(USER_KEY) || {};
  if (token && storedUser.role) {
    assertCoachUser(storedUser);
    return { user: storedUser };
  }
  const loginResult = await loginWithWechat();
  assertCoachUser(loginResult.user || {});
  return loginResult;
}

function handleCoachAuthError(error) {
  const message = error && error.message || '';
  const expiredSession = /未登录|登录已过期|401/.test(message);
  if (!/不是教练账号/.test(message) && !expiredSession) return false;
  wx.removeStorageSync(TOKEN_KEY);
  wx.removeStorageSync(USER_KEY);
  wx.showToast({ title: expiredSession ? '请重新登录' : message, icon: 'none' });
  wx.reLaunch({ url: '/pages/index/index' });
  return true;
}

function avatarText(name = '') {
  return String(name || '').trim().slice(0, 1).toUpperCase() || '学';
}

function parseLocalDate(value) {
  if (!value) return null;
  const date = new Date(String(value).replace(' ', 'T'));
  return Number.isNaN(date.getTime()) ? null : date;
}

function formatMonthDay(value) {
  const date = parseLocalDate(value);
  if (!date) return '';
  return `${String(date.getMonth() + 1).padStart(2, '0')}/${String(date.getDate()).padStart(2, '0')}`;
}

function formatStudentRecentLessonText(value, now = new Date()) {
  const date = parseLocalDate(value);
  if (!date) return '暂无记录';
  const today = new Date(now.getFullYear(), now.getMonth(), now.getDate()).getTime();
  const lessonDay = new Date(date.getFullYear(), date.getMonth(), date.getDate()).getTime();
  const days = Math.max(0, Math.floor((today - lessonDay) / 86400000));
  return `${date.getMonth() + 1}月${date.getDate()}日 · ${days}天前`;
}

function formatDateInputValue(value) {
  const date = value ? parseLocalDate(value) : new Date();
  const safeDate = date || new Date();
  return `${safeDate.getFullYear()}-${String(safeDate.getMonth() + 1).padStart(2, '0')}-${String(safeDate.getDate()).padStart(2, '0')}`;
}

function normalizeTimeValue(value = '') {
  const parts = String(value || '').split(':');
  const hour = parts[0] || '00';
  const minute = parts[1] || '00';
  return `${String(hour).padStart(2, '0')}:${String(minute).padStart(2, '0')}`;
}

function extractTimeRange(text = '') {
  const matched = String(text || '').match(/(\d{1,2}:\d{2})\s*-\s*(\d{1,2}:\d{2})/);
  if (!matched) return { startTime: '14:00', endTime: '16:00' };
  return { startTime: normalizeTimeValue(matched[1]), endTime: normalizeTimeValue(matched[2]) };
}

function normalizeCampusOptions(campuses = [], fallbackCampus = '') {
  const options = (campuses || []).map((item) => {
    const label = campusDisplayName(firstNonEmpty(item.name, item.campusName, item.label, item.code, item.id));
    if (!label) return null;
    return {
      id: item.id || label,
      name: label
    };
  }).filter(Boolean);
  const fallbackName = campusDisplayName(fallbackCampus);
  if (fallbackName && !options.some(item => item.name === fallbackName)) {
    options.unshift({ id: fallbackCampus, name: fallbackName });
  }
  return options;
}

function scheduleDateOf(item = {}) {
  const start = parseLocalDate(item.startTime);
  return start ? formatDateInputValue(start) : formatDateInputValue();
}

function scheduleTimeTextOf(value, fallback = '14:00') {
  const date = parseLocalDate(value);
  if (!date) return fallback;
  return `${String(date.getHours()).padStart(2, '0')}:${String(date.getMinutes()).padStart(2, '0')}`;
}

function studentRosterItems(studentRoster = {}) {
  return Array.isArray(studentRoster.items) ? studentRoster.items : [];
}

function buildStudentCards(students = []) {
  return (students || []).map((student) => ({
    ...student,
    id: String(student.id || student.studentId || '').trim(),
    name: firstNonEmpty(student.name, student.displayName) || '未命名学员',
    type: firstNonEmpty(student.type) || '暂无记录',
    relationType: firstNonEmpty(student.relationType) || '归属',
    tagClass: firstNonEmpty(student.tagClass) || (student.relationType === '代课' ? 'student-tag-substitute' : 'student-tag-owner'),
    cumulative: firstNonEmpty(student.cumulative, student.detailCumulativeText) || '0',
    packageText: firstNonEmpty(student.packageText),
    packagePercent: Number.isFinite(Number(student.packagePercent)) ? Number(student.packagePercent) : 0,
    courseLabel: firstNonEmpty(student.courseLabel) || '课程',
    studentTabKey: firstNonEmpty(student.studentTabKey) || 'active',
    searchText: firstNonEmpty(student.searchText, [student.name, student.displayName, student.phone, student.courseLabel].filter(Boolean).join(' ')).toLowerCase(),
    showPackage: !!student.showPackage,
    lastScheduleId: firstNonEmpty(student.lastScheduleId),
    lastClassText: firstNonEmpty(student.lastClassText) || '暂无记录',
    lastClassAt: firstNonEmpty(student.lastClassAt),
    showLastClass: !!student.showLastClass
  }));
}

function classStatusMeta(status = '') {
  if (status === '未开始' || status === '待开课') return { label: '未开始', className: 'tag-waiting' };
  if (status === '已结束' || status === '已结课') return { label: '已结束', className: 'tag-gray' };
  if (status === '已取消') return { label: '已取消', className: 'tag-gray' };
  return { label: '进行中', className: 'tag-green' };
}

function buildShiftCards(classes = [], students = []) {
  const studentMap = new Map((students || []).map(item => [String(item.id), item.name || item.id]));
  if (!(classes || []).length) return [];
  return (classes || []).map((item) => {
    const statusMeta = classStatusMeta(item.status);
    const names = studentIdsOf(item).map(id => studentMap.get(String(id)) || id).filter(Boolean);
    const usedLessons = parseInt(item.usedLessons, 10) || 0;
    const totalLessons = parseInt(item.totalLessons, 10) || 0;
    const progressWidth = totalLessons ? `${Math.min(100, Math.round((usedLessons / totalLessons) * 100))}%` : '0%';
    return {
      id: item.id,
      name: item.className || item.classNo || '未命名班次',
      courseContent: firstNonEmpty(item.courseContent) || '暂无记录',
      student: names.join('、') || '暂无学员',
      studentNames: names.join('、'),
      scheduleTime: firstNonEmpty(item.scheduleTime) || '暂无记录',
      coach: item.coach || '',
      campus: campusDisplayName(firstNonEmpty(item.campusName, item.campus)) || '',
      remark: firstNonEmpty(item.remark),
      usedLessons,
      totalLessons,
      progress: `${usedLessons}/${totalLessons}`,
      progressWidth,
      status: statusMeta.label,
      statusClass: statusMeta.className,
      actionText: '班级详情',
      actionClass: 'shift-action-primary',
      accentClass: statusMeta.label === '进行中' ? 'shift-accent-active' : 'shift-accent-waiting'
    };
  }).sort((a, b) => a.name.localeCompare(b.name, 'zh-Hans-CN'));
}

function buildStudentTabs(stats = {}, currentTab = 'all', backendTabs = []) {
  const items = Array.isArray(backendTabs) && backendTabs.length ? backendTabs : [
    { key: 'all', label: '全部', count: stats.totalCount || 0 },
    { key: 'active', label: '在课', count: stats.activeCount || 0 },
    { key: 'trial', label: '体验', count: stats.trialCount || 0 },
    { key: 'ended', label: '已结课', count: stats.endedCount || 0 },
    { key: 'substitute', label: '代课', count: stats.substituteCount || 0 }
  ];
  return items.map(item => ({ ...item, className: item.key === currentTab ? 'is-active' : '' }));
}

function studentMatchesTab(student = {}, tab = 'all') {
  if (!tab || tab === 'all') return student.studentTabKey !== 'substitute';
  return student.studentTabKey === tab;
}

function studentMatchesSearch(student = {}, keyword = '') {
  const q = String(keyword || '').trim().toLowerCase();
  if (!q) return true;
  return String(student.searchText || '').toLowerCase().includes(q);
}

function filterStudentCards(students = [], tab = 'all', keyword = '') {
  return (students || []).filter(item => studentMatchesTab(item, tab) && studentMatchesSearch(item, keyword));
}

function buildShiftStats(shifts = []) {
  const totalCount = shifts.length;
  const activeCount = shifts.filter(item => item.status === '进行中').length;
  const totalLessons = shifts.reduce((sum, item) => sum + (parseInt(item.totalLessons, 10) || 0), 0);
  const usedLessons = shifts.reduce((sum, item) => sum + (parseInt(item.usedLessons, 10) || 0), 0);
  return { totalCount, activeCount, totalLessons, usedLessons, remainingLessons: Math.max(0, totalLessons - usedLessons) };
}

function buildShiftScheduleForm(shift, linkedClass = null, campuses = []) {
  const fallbackCampus = campusDisplayName(firstNonEmpty(shift && shift.campusName, shift && shift.campus, linkedClass && linkedClass.campusName, linkedClass && linkedClass.campus));
  const campusOptions = normalizeCampusOptions(campuses, fallbackCampus);
  const { startTime, endTime } = extractTimeRange(firstNonEmpty(shift && shift.scheduleTime, linkedClass && linkedClass.classTime));
  const studentIds = linkedClass ? studentIdsOf(linkedClass) : [];
  return {
    classId: shift && shift.id ? shift.id : '',
    className: shift && shift.name ? shift.name : '',
    studentIds,
    studentNames: firstNonEmpty(shift && shift.studentNames, shift && shift.student) || '暂无学员',
    date: formatDateInputValue(),
    startTime,
    endTime,
    campusIndex: campusOptions.length ? 0 : -1,
    campusOptions,
    campusName: campusOptions[0] ? campusOptions[0].name : (fallbackCampus || ''),
    venue: firstNonEmpty(linkedClass && linkedClass.venue, shift && shift.venue) || '',
    lessonCount: String(parseInt(linkedClass && linkedClass.lessonCount, 10) || 1),
    notes: ''
  };
}

function buildScheduleEditForm(selectedClass, linkedClass = null, campuses = []) {
  const fallbackCampus = campusDisplayName(firstNonEmpty(selectedClass && selectedClass.campusName, selectedClass && selectedClass.campus, linkedClass && linkedClass.campusName, linkedClass && linkedClass.campus));
  const campusOptions = normalizeCampusOptions(campuses, fallbackCampus);
  const campusName = fallbackCampus || (campusOptions[0] ? campusOptions[0].name : '');
  const campusIndex = campusOptions.findIndex(item => item.name === campusName);
  return {
    id: selectedClass && selectedClass.id ? selectedClass.id : '',
    classId: firstNonEmpty(selectedClass && selectedClass.classId, linkedClass && linkedClass.id),
    className: firstNonEmpty(selectedClass && selectedClass.className, selectedClass && selectedClass.classNo, linkedClass && linkedClass.className, linkedClass && linkedClass.classNo),
    studentIds: studentIdsOf(selectedClass),
    studentNames: firstNonEmpty(selectedClass && selectedClass.student, selectedClass && selectedClass.studentText) || '暂无学员',
    date: scheduleDateOf(selectedClass),
    startTime: scheduleTimeTextOf(selectedClass && selectedClass.startTime, '14:00'),
    endTime: scheduleTimeTextOf(selectedClass && selectedClass.endTime, '16:00'),
    campusIndex: campusIndex > -1 ? campusIndex : (campusOptions.length ? 0 : -1),
    campusOptions,
    campusName: campusName || (campusOptions[0] ? campusOptions[0].name : ''),
    venue: firstNonEmpty(selectedClass && (selectedClass.venue || selectedClass.loc || selectedClass.locationText), linkedClass && linkedClass.venue),
    lessonCount: String(parseInt(selectedClass && selectedClass.lessonCount, 10) || 1),
    notes: firstNonEmpty(selectedClass && selectedClass.notes, selectedClass && selectedClass.remark)
  };
}

function buildShiftDetailData(shift, context = {}) {
  if (!shift) return null;
  const classes = Array.isArray(context.classes) ? context.classes : [];
  const students = Array.isArray(context.students) ? context.students : [];
  const schedule = Array.isArray(context.schedule) ? context.schedule : [];
  const coachName = String(context.coachName || '').trim();
  const linkedClass = classes.find(item => String(item.id) === String(shift.id)) || null;
  const linkedStudentIds = linkedClass ? studentIdsOf(linkedClass) : [];
  const shiftId = String(shift.id || '').trim();
  const matchedSchedule = schedule.filter(item => {
    if (String(item.classId || '').trim() === String(shift.id || '').trim()) return true;
    if (shiftId) return false;
    const ids = studentIdsOf(item);
    return linkedStudentIds.length && !String(item.classId || '').trim() && ids.some(id => linkedStudentIds.includes(id));
  }).filter(item => String(item.status || '') !== '已取消');
  const latestSchedule = matchedSchedule
    .slice()
    .sort((a, b) => String(b.startTime || '').localeCompare(String(a.startTime || '')))[0] || null;
  const latestCourseTag = latestSchedule ? dashboardCourseTag(latestSchedule) : { text: '', className: '' };
  const latestStatus = latestSchedule ? studentScheduleStatusMeta(latestSchedule) : { text: '', className: '' };
  const studentNames = linkedStudentIds.length
    ? linkedStudentIds.map(id => {
      const student = students.find(item => String(item.id) === String(id));
      return student ? student.name : '';
    }).filter(Boolean).join('、')
    : firstNonEmpty(shift.studentNames, shift.student);
  const totalLessons = parseInt(shift.totalLessons, 10) || 0;
  const usedLessons = parseInt(shift.usedLessons, 10) || 0;
  const remainingLessons = Math.max(0, totalLessons - usedLessons);
  const latestMetaParts = latestSchedule ? studentScheduleMeta(latestSchedule, linkedClass) : [];
  return {
    basic: {
      name: shift.name || '未命名班次',
      courseContent: firstNonEmpty(shift.courseContent, linkedClass && linkedClass.courseContent) || '暂无记录',
      status: shift.status || '进行中',
      statusClass: shift.statusClass || 'tag-green',
      students: studentNames || '暂无学员'
    },
    summary: {
      coach: firstNonEmpty(shift.coach, linkedClass && linkedClass.coach, coachName) || '暂无记录',
      campus: campusDisplayName(firstNonEmpty(shift.campusName, shift.campus, linkedClass && linkedClass.campusName, linkedClass && linkedClass.campus)) || '暂无记录',
      scheduleTime: firstNonEmpty(shift.scheduleTime, linkedClass && linkedClass.scheduleTime) || '暂无记录',
      progress: shift.progress || `${usedLessons}/${totalLessons}`,
      remaining: `${remainingLessons} 节`
    },
    remark: {
      text: firstNonEmpty(shift.remark, linkedClass && linkedClass.remark) || '暂无记录',
      isEmpty: !firstNonEmpty(shift.remark, linkedClass && linkedClass.remark)
    },
    latest: shift.latest || (latestSchedule ? {
      scheduleId: latestSchedule.id,
      time: formatStudentClassTime(latestSchedule),
      courseType: latestCourseTag.text,
      courseTypeClass: latestCourseTag.className === 'is-trial' ? 'detail-tag-trial' : 'detail-tag-private',
      status: latestStatus.text,
      statusClass: latestStatus.className,
      metaParts: latestMetaParts
    } : null),
    hasLatest: !!(shift.latest || latestSchedule)
  };
}

function findFeedbackByScheduleId(feedbacks = [], scheduleId = '') {
  return (feedbacks || []).find(item => String(item.scheduleId) === String(scheduleId)) || null;
}

function findProposalByScheduleId(proposals = [], scheduleId = '') {
  return (proposals || []).find(item => String(item.scheduleId) === String(scheduleId)) || null;
}

function feedbackFormFromRecord(feedback = null) {
  return {
    practicedToday: feedback ? (feedback.practicedToday || feedback.focus || feedback.performance || '') : '',
    knowledgePoint: feedback ? (feedback.knowledgePoint || feedback.problems || '') : '',
    nextTraining: feedback ? (feedback.nextTraining || feedback.nextAdvice || '') : ''
  };
}

function proposalFormFromRecord(proposal = null, schedule = {}) {
  const studentCount = Array.isArray(schedule.studentIds) ? schedule.studentIds.length : 0;
  return {
    courseName: proposal ? (proposal.courseName || '') : (schedule.className || schedule.productName || '小班课'),
    studentLevel: proposal ? (proposal.studentLevel || '') : '',
    studentCount: proposal ? String(proposal.studentCount || '') : (studentCount ? String(studentCount) : ''),
    teachingGoal: proposal ? (proposal.teachingGoal || '') : '',
    teachingOrganization: proposal ? (proposal.teachingOrganization || '') : '',
    progression1: proposal ? (proposal.progression1 || '') : '',
    progression2: proposal ? (proposal.progression2 || '') : '',
    progression3: proposal ? (proposal.progression3 || '') : '',
    progressionLogic: proposal ? (proposal.progressionLogic || '') : '',
    conclusion: proposal ? (proposal.conclusion || '') : ''
  };
}

function proposalCountsOf(form = {}) {
  return Object.keys(proposalFormFromRecord()).reduce((acc, key) => {
    acc[key] = String(form[key] || '').length;
    return acc;
  }, {});
}

function feedbackCountsOf(form = {}) {
  return {
    practicedToday: String(form.practicedToday || '').length,
    knowledgePoint: String(form.knowledgePoint || '').length,
    nextTraining: String(form.nextTraining || '').length
  };
}

function feedbackAutoListValue(prevValue = '', nextValue = '', style = 'normal') {
  const prev = String(prevValue || '');
  const next = String(nextValue || '');
  if (style === 'none' || next.length <= prev.length || !next.endsWith('\n')) return next;
  const before = next.slice(0, -1);
  const line = before.slice(before.lastIndexOf('\n') + 1);
  if (!line.trim()) return next;
  const numberMatch = line.match(/^\s*(\d+)[\.\、]\s*/);
  const bulletMatch = line.match(/^\s*[·•\-－]\s*/);
  if (style === 'normal' && !numberMatch && !bulletMatch) return next;
  if (style === 'bullet' || bulletMatch) return `${next}• `;
  if (style === 'number' || numberMatch) {
    const marker = numberMatch ? Number(numberMatch[1]) + 1 : 1;
    return `${next}${marker}. `;
  }
  return next;
}

function feedbackApplyListStyleToRange(value = '', start = 0, end = start, style = 'normal') {
  const text = String(value || '');
  if (style === 'normal') return { value: text, cursor: Number(end) || 0 };
  start = Math.max(0, Number(start) || 0);
  end = Math.max(start, Number(end) || start);
  const hasSelection = end > start;
  const rangeStart = text.lastIndexOf('\n', Math.max(0, start - 1)) + 1;
  const currentLineEnd = text.indexOf('\n', hasSelection ? Math.max(start, end - 1) : start);
  const rangeEnd = currentLineEnd === -1 ? text.length : currentLineEnd;
  const selected = text.slice(rangeStart, rangeEnd);
  if (!selected.trim()) {
    const insert = style === 'bullet' ? '• ' : '1. ';
    const cursor = start + insert.length;
    return { value: `${text.slice(0, start)}${insert}${text.slice(end)}`, cursor };
  }
  let itemIndex = 0;
  const next = selected.split('\n').map((line) => {
    if (!line.trim()) return line;
    const clean = line.replace(/^\s*(?:\d+[\.\、][\s\t]*|[·•\-－][\s\t]*)/, '').trim();
    if (style === 'bullet') return `• ${clean}`;
    itemIndex += 1;
    return `${itemIndex}. ${clean}`;
  }).join('\n');
  return { value: `${text.slice(0, rangeStart)}${next}${text.slice(rangeEnd)}`, cursor: rangeStart + next.length };
}

function feedbackInsertListMarker(value = '', cursor = 0, style = 'normal', selectionEnd = cursor) {
  if (style === 'normal') return { value: String(value || ''), cursor };
  const next = feedbackApplyListStyleToRange(value, cursor, selectionEnd, style);
  return {
    value: next.value,
    cursor: next.cursor
  };
}

function feedbackListStyleOptions() {
  return [
    { label: '普通', value: 'normal' },
    { label: '编号', value: 'number' },
    { label: '圆点', value: 'bullet' }
  ];
}

function feedbackContextParts(item = {}) {
  return [
    item.student || item.studentText,
    scheduleLocationText(item),
    item.type || item.title
  ].filter(Boolean);
}

function feedbackScopeForSchedule(item = {}) {
  const studentIds = studentIdsOf(item);
  const courseType = String(item.type || item.title || item.courseType || '').trim();
  if (item.feedbackScope === 'class' || item.feedbackScope === 'student') return item.feedbackScope;
  if (String(item.classId || '').trim() && (studentIds.length > 1 || /班课|训练营|小班|大师课/.test(courseType))) return 'class';
  return 'student';
}

function posterDateText(item = {}) {
  const start = parseLocalDate(item.startTime);
  if (!start) return String(item.timeText || '').split(' ')[0] || '待确认';
  return `${start.getFullYear()}年${start.getMonth() + 1}月${start.getDate()}日`;
}

function formatDetailDateTime(item = {}) {
  const start = parseLocalDate(item.startTime);
  const end = parseLocalDate(item.endTime);
  if (!start) return item.timeText || '时间待定';
  const dateText = `${start.getFullYear()}-${String(start.getMonth() + 1).padStart(2, '0')}-${String(start.getDate()).padStart(2, '0')}`;
  const startText = `${String(start.getHours()).padStart(2, '0')}:${String(start.getMinutes()).padStart(2, '0')}`;
  const endText = end ? `${String(end.getHours()).padStart(2, '0')}:${String(end.getMinutes()).padStart(2, '0')}` : '';
  return `${dateText} ${startText}${endText ? ` - ${endText}` : ''}`;
}

function detailStatusMeta(item = {}) {
  if (String(item.status || '') === '已取消') {
    return { text: '已取消', className: 'detail-tag-muted' };
  }
  const now = new Date();
  const start = parseLocalDate(item.startTime);
  const end = parseLocalDate(item.endTime || item.startTime);
  if (end && end <= now) return { text: '已下课', className: 'detail-tag-muted' };
  if (start && start > now) return { text: '待上课', className: 'detail-tag-success' };
  return { text: '进行中', className: 'detail-tag-success' };
}

function firstNonEmpty(...values) {
  for (let i = 0; i < values.length; i += 1) {
    const value = values[i];
    if (value === 0) return '0';
    if (String(value || '').trim()) return String(value).trim();
  }
  return '';
}

function studentDetailLessonRecordHasFeedback(row = {}) {
  const status = firstNonEmpty(row.feedbackStatus, row.feedbackState, row.feedbackStatusText).toLowerCase();
  if (/已.*反馈|已.*填写|filled|done|completed|true/.test(status)) return true;
  if (/未|待|missing|false/.test(status)) return false;
  if (row.hasFeedback === true || String(row.hasFeedback || '').toLowerCase() === 'true') return true;
  if (row.hasFeedback === false || String(row.hasFeedback || '').toLowerCase() === 'false') return false;
  return !!firstNonEmpty(
    row.feedbackId,
    row.feedbackAt,
    row.feedbackCreatedAt,
    row.practicedToday,
    row.knowledgePoint,
    row.nextTraining,
    row.feedbackSummary
  );
}

function buildNoticeField(content = '', useBox = false) {
  const text = String(content || '').trim();
  return {
    text: text || '暂无记录',
    isEmpty: !text,
    useBox: !!text && useBox
  };
}

function buildDetailData(selectedClass, context = {}) {
  if (!selectedClass) return null;
  const students = Array.isArray(context.students) ? context.students : [];
  const classes = Array.isArray(context.classes) ? context.classes : [];
  const entitlements = Array.isArray(context.entitlements) ? context.entitlements : [];
  const entitlementLedger = Array.isArray(context.entitlementLedger) ? context.entitlementLedger : [];
  const feedbacks = Array.isArray(context.feedbacks) ? context.feedbacks : [];
  const coachProposals = Array.isArray(context.coachProposals) ? context.coachProposals : [];
  const coachName = String(context.coachName || '').trim();
  const studentIds = studentIdsOf(selectedClass);
  const student = students.find(item => studentIds.includes(item.id))
    || (!studentIds.length && students.find(item => String(item.name || '').trim() === String(selectedClass.student || '').trim()))
    || null;
  const linkedClass = classes.find(item => String(item.id || '') === String(selectedClass && selectedClass.classId || ''))
    || (!selectedClass.classId && classes.find(item => firstNonEmpty(item.className, item.classNo) === firstNonEmpty(selectedClass.className, selectedClass.classNo)))
    || null;
  const currentFeedback = findFeedbackByScheduleId(feedbacks, selectedClass.id);
  const currentProposal = findProposalByScheduleId(coachProposals, selectedClass.id);
  const currentStudentId = String(student && student.id || '');
  const currentClassId = String(selectedClass && selectedClass.classId || '').trim();
  const studentFeedbacks = feedbacks
    .filter(item => {
      if (currentClassId && String(item.classId || '').trim()) {
        return String(item.classId || '').trim() === currentClassId;
      }
      if (currentStudentId && String(item.studentId || '') === currentStudentId) return true;
      return Array.isArray(item.studentIds) && Array.isArray(studentIds) && item.studentIds.some(id => studentIds.includes(id));
    })
    .sort((a, b) => String(b.startTime || b.createdAt || '').localeCompare(String(a.startTime || a.createdAt || '')));
  const previousFeedback = studentFeedbacks.find(item => String(item.scheduleId || '') !== String(selectedClass.id)) || null;
  const typeTag = dashboardCourseTag(selectedClass);
  const statusTag = detailStatusMeta(selectedClass);
  const linkedEntitlements = scheduleEntitlements(selectedClass, entitlements);
  const entitlementBalance = entitlementSummary(linkedEntitlements);
  const consumedLessons = scheduleConsumedLessonText(selectedClass, entitlementLedger);
  const remainingLessons = linkedEntitlements.length ? `${lessonUnitsText(entitlementBalance.remaining)} 节` : '-';
  const studentRemark = buildNoticeField(firstNonEmpty(scheduleStudentRemarkText(selectedClass, students), student && student.remark), true);
  const historyIssue = buildNoticeField(firstNonEmpty(student && student.historyIssue));
  const focusNote = buildNoticeField(firstNonEmpty(
    currentFeedback && currentFeedback.focusNote,
    student && student.focusNote
  ));
  const feedbackSummary = buildNoticeField(firstNonEmpty(currentFeedback && currentFeedback.summary), true);
  if (feedbackSummary.isEmpty) feedbackSummary.text = '待填写反馈';
  const previousFeedbackSummary = buildNoticeField(firstNonEmpty(previousFeedback && previousFeedback.summary), true);
  const hasNoticeContent = !studentRemark.isEmpty || !historyIssue.isEmpty || !focusNote.isEmpty;
  const hasFeedbackContent = !!currentFeedback || !feedbackSummary.isEmpty || !previousFeedbackSummary.isEmpty;
  return {
    scheduleId: selectedClass.id,
    hasFeedback: !!currentFeedback,
    isSmallGroup: isSmallGroupSchedule(selectedClass),
    hasProposal: !!currentProposal,
    actionText: currentFeedback ? '查看反馈' : '填写反馈',
    proposalActionText: currentProposal ? '查看/修改提案' : '填写提案',
    basicInfo: {
      datetime: formatDetailDateTime(selectedClass),
      location: scheduleLocationText(selectedClass),
      courseType: typeTag.text,
      courseTypeClass: typeTag.className === 'is-trial' ? 'detail-tag-trial' : 'detail-tag-private',
      status: statusTag.text,
      statusClass: statusTag.className,
      studentName: selectedClass.student || '学员待确认',
      coachName: firstNonEmpty(selectedClass.coach, coachName) || '待确认',
      coachNote: firstNonEmpty(student && student.primaryCoach, '未设置'),
      entitlementText: consumedLessons
    },
    cancelReason: firstNonEmpty(selectedClass.cancelReason),
    notices: {
      studentRemark,
      historyIssue,
      focusNote,
      sectionClass: hasNoticeContent ? 'is-filled' : 'is-empty-state'
    },
    feedback: {
      consumedLessons,
      remainingLessons,
      summary: feedbackSummary,
      history: previousFeedbackSummary,
      sectionClass: hasFeedbackContent ? 'is-filled' : 'is-empty-state'
    },
    proposal: {
      sectionClass: currentProposal ? 'is-filled' : 'is-empty-state',
      statusText: currentProposal ? '已填写' : '未填写',
      courseName: firstNonEmpty(currentProposal && currentProposal.courseName, '未提交'),
      studentLevel: firstNonEmpty(currentProposal && currentProposal.studentLevel, '未提交'),
      studentCount: firstNonEmpty(currentProposal && currentProposal.studentCount, '未提交'),
      teachingGoal: buildNoticeField(firstNonEmpty(currentProposal && currentProposal.teachingGoal), true),
      teachingOrganization: buildNoticeField(firstNonEmpty(currentProposal && currentProposal.teachingOrganization), true),
      progressions: [
        firstNonEmpty(currentProposal && currentProposal.progression1),
        firstNonEmpty(currentProposal && currentProposal.progression2),
        firstNonEmpty(currentProposal && currentProposal.progression3)
      ].filter(Boolean),
      progressionLogic: buildNoticeField(firstNonEmpty(currentProposal && currentProposal.progressionLogic), true),
      conclusion: buildNoticeField(firstNonEmpty(currentProposal && currentProposal.conclusion), true)
    }
  };
}

function formatStudentClassTime(item = {}) {
  const start = parseLocalDate(item.startTime);
  if (!start) return item.timeText || '暂无记录';
  const end = parseLocalDate(item.endTime);
  const dateText = `${start.getFullYear()}-${String(start.getMonth() + 1).padStart(2, '0')}-${String(start.getDate()).padStart(2, '0')}`;
  const startText = `${String(start.getHours()).padStart(2, '0')}:${String(start.getMinutes()).padStart(2, '0')}`;
  const endText = end ? `${String(end.getHours()).padStart(2, '0')}:${String(end.getMinutes()).padStart(2, '0')}` : '';
  return endText ? `${dateText} ${startText}-${endText}` : `${dateText} ${startText}`;
}

const FEEDBACK_POSTER_TEMPLATES = {
  blueGreenDiagonal: { name: '蓝绿对角', type: 'diagonalSplit', bg1: '#1F4287', bg2: '#278EA5', ink: '#FFFFFF', muted: 'rgba(255,255,255,0.7)', accent: '#BCE84A', soft: 'rgba(255,255,255,0.08)', cardTitle: '#BCE84A', highlight: '#BCE84A', nameColor: '#FFFFFF', subColor: 'rgba(255,255,255,0.7)' },
  minimalDarkGreen: { name: '极简墨绿', type: 'cleanSilhouette', bg1: '#F4F6F8', bg2: '#F4F6F8', ink: '#143D30', muted: '#76948A', accent: '#8DC63F', soft: '#FFFFFF', cardTitle: '#143D30', highlight: '#8DC63F', nameColor: '#143D30', subColor: '#76948A' },
  retroCourt: { name: '对角球场', type: 'split', bg1: '#1E3D33', bg2: '#B35432', ink: '#1E3D33', muted: '#6D827A', accent: '#B35432', soft: '#F9F8F6', cardTitle: '#B35432', highlight: '#B35432', nameColor: '#F9F8F6', subColor: 'rgba(249,248,246,0.7)' },
  blueprintBlue: { name: '线框蓝图', type: 'wireframe', bg1: '#12355B', bg2: '#0D2744', ink: '#FFFFFF', muted: 'rgba(255,255,255,0.6)', accent: '#D4F02E', soft: 'rgba(0,0,0,0.3)', cardTitle: '#D4F02E', highlight: '#D4F02E', nameColor: '#FFFFFF', subColor: 'rgba(255,255,255,0.6)' },
  minimalRacket: { name: '极简白框', type: 'minimal', bg1: '#2F74B4', bg2: '#2F74B4', ink: '#12355B', muted: '#82A9CE', accent: '#D4F02E', soft: 'rgba(255,255,255,0.95)', cardTitle: '#2F74B4', highlight: '#2F74B4', nameColor: '#FFFFFF', subColor: '#82A9CE' },
  activeGreen: { name: '活力绿(缝线)', type: 'sport', bg1: '#064E3B', bg2: '#022C22', ink: '#F8FAFC', muted: '#6EE7B7', accent: '#10B981', soft: 'rgba(255,255,255,0.08)', cardTitle: '#10B981', highlight: '#10B981', nameColor: '#F8FAFC', subColor: '#6EE7B7' }
};

const POSTER_STYLE_OPTIONS = Object.keys(FEEDBACK_POSTER_TEMPLATES).map(key => ({
  key,
  name: FEEDBACK_POSTER_TEMPLATES[key].name
}));

function posterRoundRect(ctx, x, y, w, h, r) {
  ctx.beginPath();
  ctx.moveTo(x + r, y);
  ctx.lineTo(x + w - r, y);
  ctx.quadraticCurveTo(x + w, y, x + w, y + r);
  ctx.lineTo(x + w, y + h - r);
  ctx.quadraticCurveTo(x + w, y + h, x + w - r, y + h);
  ctx.lineTo(x + r, y + h);
  ctx.quadraticCurveTo(x, y + h, x, y + h - r);
  ctx.lineTo(x, y + r);
  ctx.quadraticCurveTo(x, y, x + r, y);
  ctx.closePath();
}

function posterDisplayDate(dateText) {
  const raw = String(dateText || '').trim();
  const m = raw.match(/^(\d{4})-(\d{1,2})-(\d{1,2})/);
  if (!m) return raw || '待确认';
  return `${m[1]}年${parseInt(m[2], 10)}月${parseInt(m[3], 10)}日`;
}

function posterEscapeRegExp(text) {
  return String(text).replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

function posterPushAutoGroups(groups, text) {
  if (!text) return;
  groups.push({ text: String(text), highlight: false });
}

function posterNormalizeText(text, options = {}) {
  const raw = String(text || '—');
  const preserveListMarkers = options.preserveListMarkers;
  const style = options.listStyle || (preserveListMarkers === false ? 'none' : 'preserve');
  return posterApplyLineStyle(raw, style);
}

function posterApplyLineStyle(text, style = 'preserve') {
  if (style === 'preserve') return String(text || '—');
  const lines = String(text || '—').split('\n');
  const filledCount = lines.filter(line => line.trim()).length;
  let itemIndex = 0;
  const next = lines.map(line => {
    if (!line.trim()) return '';
    const clean = line.replace(/^\s*(?:\d+[\.\、][\s\t]*|[·•\-－][\s\t]*)/, '').trim();
    if (style === 'none' || filledCount < 2) return clean;
    if (style === 'number') {
      itemIndex += 1;
      return `${itemIndex}. ${clean}`;
    }
    if (style === 'bullet') return `• ${clean}`;
    return clean;
  }).join('\n');
  return next || '—';
}

function posterTextGroups(text, options = {}) {
  const raw = posterNormalizeText(text, options);
  const groups = [];
  let i = 0;
  while (i < raw.length) {
    if (raw[i] === '【') {
      const end = raw.indexOf('】', i + 1);
      if (end > -1) {
        groups.push({ text: raw.slice(i + 1, end), highlight: true });
        i = end + 1;
        continue;
      }
    }
    let next = raw.length;
    const bracket = raw.indexOf('【', i + 1);
    if (bracket > -1) next = Math.min(next, bracket);
    posterPushAutoGroups(groups, raw.slice(i, next));
    i = next;
  }
  return groups.length ? groups : [{ text: '—', highlight: false }];
}

function posterContentFont(ctx, isHighlight) {
  ctx.font = `${isHighlight ? '600' : '400'} 30px -apple-system,BlinkMacSystemFont,"PingFang SC","Microsoft YaHei",sans-serif`;
}

function posterNewTextLine(props = {}) {
  const line = [];
  line.isWrapped = !!props.isWrapped;
  line.isParagraphStart = props.isParagraphStart !== false;
  line.lineIndex = props.lineIndex || 0;
  line.hangingIndent = props.hangingIndent || 0;
  return line;
}

function posterLineText(lineGroups) {
  return (lineGroups || []).map(group => group.text || '').join('');
}

function posterListMarkerIndent(ctx, line) {
  const text = line.map(item => item.ch || '').join('');
  const markerMatch = text.match(/^\s*(?:\d+[\.\、]|[·•\-－])\s*/);
  if (!markerMatch) return 0;
  posterContentFont(ctx, false);
  return Math.ceil(ctx.measureText(markerMatch[0]).width);
}

function posterLineMetrics(ctx, lineGroups) {
  const markerMatch = posterLineText(lineGroups).match(/^\s*(?:\d+[\.\、]|[·•\-－])\s*/);
  const indent = lineGroups && lineGroups.isWrapped ? (lineGroups.hangingIndent || 0) : 0;
  const paragraphGap = lineGroups && lineGroups.isParagraphStart && lineGroups.lineIndex === 0 && markerMatch ? 12 : 0;
  return { indent, paragraphGap };
}

function posterTextLines(ctx, text, maxWidth, maxLines) {
  const lines = [posterNewTextLine({ isParagraphStart: false })];
  const options = arguments[4] || {};
  posterTextGroups(text, options).forEach(group => {
    posterContentFont(ctx, group.highlight);
    Array.from(group.text || '').forEach(ch => {
      if (ch === '\n') {
        lines.push(posterNewTextLine());
        return;
      }
      const width = ctx.measureText(ch).width;
      let line = lines[lines.length - 1];
      const lineWidth = line.reduce((sum, item) => sum + item.width, 0);
      const availableWidth = maxWidth - line.hangingIndent;
      if (line.length && lineWidth + width > availableWidth) {
        const hangingIndent = line.hangingIndent || posterListMarkerIndent(ctx, line);
        lines.push(posterNewTextLine({
          isWrapped: true,
          isParagraphStart: false,
          lineIndex: (line.lineIndex || 0) + 1,
          hangingIndent
        }));
        line = lines[lines.length - 1];
      }
      line.push({ ch, highlight: group.highlight, width });
    });
  });
  let kept = lines.filter(line => line.length);
  if (!kept.length) {
    const line = posterNewTextLine({ isParagraphStart: false });
    line.push({ ch: '—', highlight: false, width: ctx.measureText('—').width });
    kept = [line];
  }
  if (kept.length > maxLines) {
    kept = kept.slice(0, maxLines);
    const last = kept[kept.length - 1];
    posterContentFont(ctx, false);
    const dotsWidth = ctx.measureText('…').width;
    const availableWidth = maxWidth - last.hangingIndent;
    while (last.length && last.reduce((sum, item) => sum + item.width, 0) + dotsWidth > availableWidth) last.pop();
    while (last.length && /[，。；、\s]/.test(last[last.length - 1].ch)) last.pop();
    last.push({ ch: '…', highlight: false, width: dotsWidth });
  }
  return kept.map(line => {
    const groups = [];
    line.forEach(item => {
      const last = groups[groups.length - 1];
      if (last && last.highlight === item.highlight) last.text += item.ch;
      else groups.push({ text: item.ch, highlight: item.highlight });
    });
    groups.isWrapped = line.isWrapped;
    groups.isParagraphStart = line.isParagraphStart;
    groups.lineIndex = line.lineIndex;
    groups.hangingIndent = line.hangingIndent;
    return groups;
  });
}

function posterDrawFittedTitle(ctx, text, x, y, maxWidth, maxFont, minFont, color) {
  let fontSize = maxFont;
  const value = String(text || '学员');
  ctx.fillStyle = color;
  while (fontSize > minFont) {
    ctx.font = `900 ${fontSize}px -apple-system,BlinkMacSystemFont,"PingFang SC","Microsoft YaHei",sans-serif`;
    if (ctx.measureText(value).width <= maxWidth) break;
    fontSize -= 2;
  }
  ctx.font = `900 ${fontSize}px -apple-system,BlinkMacSystemFont,"PingFang SC","Microsoft YaHei",sans-serif`;
  let finalText = value;
  if (ctx.measureText(finalText).width > maxWidth) {
    finalText = value;
    while (finalText.length > 1 && ctx.measureText(`${finalText}…`).width > maxWidth) finalText = finalText.slice(0, -1);
    finalText = `${finalText}…`;
  }
  ctx.fillText(finalText, x, y);
}

function posterMeasureTextBlock(ctx, text, w, maxLines) {
  ctx.font = '400 30px -apple-system,BlinkMacSystemFont,"PingFang SC","Microsoft YaHei",sans-serif';
  const options = arguments[4] || {};
  const lines = posterTextLines(ctx, text, w, maxLines, options);
  const paddingTop = 32;
  const paddingBottom = 56;
  const titleSpace = 56;
  const lineHeight = 50;
  const paragraphGaps = lines.reduce((sum, line) => sum + posterLineMetrics(null, line).paragraphGap, 0);
  const boxHeight = paddingTop + titleSpace + (lines.length > 0 ? lines.length - 1 : 0) * lineHeight + paragraphGaps + paddingBottom;
  return { lines, boxHeight, consumedHeight: boxHeight + 28 };
}

function posterSectionHasContent(text) {
  const value = String(text || '').trim();
  return !!value && value !== '—';
}

function posterLayout(ctx, data) {
  const contentWidth = 570;
  const textOptions = { preserveListMarkers: data.preserveListMarkers !== false, listStyle: data.posterListStyle || 'preserve' };
  const baseSections = [
    { key: 'practicedToday', label: '今天练习了', text: data.practicedToday },
    { key: 'nextTraining', label: '下次练习', text: data.nextTraining }
  ];
  if (posterSectionHasContent(data.knowledgePoint)) {
    baseSections.splice(1, 0, { key: 'knowledgePoint', label: '练习情况', text: data.knowledgePoint });
  }
  const sections = baseSections.map((section) => {
    const measured = posterMeasureTextBlock(ctx, section.text, contentWidth, Infinity, textOptions);
    return {
      key: section.key,
      label: section.label,
      text: section.text,
      lines: measured.lines,
      boxHeight: measured.boxHeight,
      consumedHeight: measured.consumedHeight
    };
  });
  const contentStartY = 320;
  let currentY = contentStartY;
  sections.forEach(section => {
    section.y = currentY;
    currentY += section.consumedHeight;
  });
  const footerBaseY = 1212;
  const contentBottom = currentY - 28;
  return {
    sections,
    canvasHeight: Math.max(1334, contentBottom + 240),
    footerY: footerBaseY
  };
}

function posterDrawTextBlock(ctx, tpl, section, x, w) {
  const label = section.label;
  const lines = section.lines;
  const boxHeight = section.boxHeight;
  const y = section.y;
  ctx.font = '400 30px -apple-system,BlinkMacSystemFont,"PingFang SC","Microsoft YaHei",sans-serif';
  const paddingTop = 32;
  const titleSpace = 56;
  const lineHeight = 50;
  const boxY = y - paddingTop - 24;
  ctx.save();
  if (tpl.type === 'diagonalSplit') {
    posterRoundRect(ctx, x - 20, boxY, w + 40, boxHeight, 16);
    ctx.fillStyle = tpl.soft;
    ctx.fill();
    ctx.strokeStyle = 'rgba(255,255,255,0.4)';
    ctx.lineWidth = 1.5;
    ctx.stroke();
  } else if (tpl.type === 'cleanSilhouette') {
    ctx.shadowColor = 'rgba(20, 61, 48, 0.08)';
    ctx.shadowBlur = 15;
    ctx.shadowOffsetY = 8;
    posterRoundRect(ctx, x - 20, boxY, w + 40, boxHeight, 16);
    ctx.fillStyle = tpl.soft;
    ctx.fill();
    ctx.shadowColor = 'transparent';
    ctx.strokeStyle = 'rgba(20, 61, 48, 0.1)';
    ctx.lineWidth = 1;
    ctx.stroke();
  } else if (tpl.type === 'sport') {
    ctx.save();
    posterRoundRect(ctx, x - 20, boxY, w + 40, boxHeight, 12);
    ctx.fillStyle = tpl.soft;
    ctx.fill();
    ctx.clip();
    ctx.fillStyle = tpl.accent;
    ctx.fillRect(x - 20, boxY, 8, boxHeight);
    ctx.restore();
  } else if (tpl.type === 'split' || tpl.type === 'minimal') {
    if (tpl.type === 'split') {
      ctx.shadowColor = 'rgba(0,0,0,0.1)';
      ctx.shadowBlur = 10;
      ctx.shadowOffsetY = 4;
    }
    posterRoundRect(ctx, x - 30, boxY, w + 60, boxHeight, 16);
    ctx.fillStyle = tpl.soft;
    ctx.fill();
    ctx.shadowColor = 'transparent';
  } else if (tpl.type === 'wireframe') {
    posterRoundRect(ctx, x - 20, boxY, w + 40, boxHeight, 12);
    ctx.fillStyle = tpl.soft;
    ctx.fill();
    ctx.strokeStyle = 'rgba(255,255,255,0.2)';
    ctx.lineWidth = 1;
    ctx.stroke();
  }
  ctx.fillStyle = tpl.cardTitle || tpl.accent;
  ctx.font = '800 22px -apple-system,BlinkMacSystemFont,"PingFang SC","Microsoft YaHei",sans-serif';
  ctx.fillText(label, x, y);
  let textY = y + titleSpace;
  lines.forEach((lineGroups) => {
    const metrics = posterLineMetrics(ctx, lineGroups);
    let currentX = x + metrics.indent;
    textY += metrics.paragraphGap;
    lineGroups.forEach(group => {
      posterContentFont(ctx, group.highlight);
      ctx.fillStyle = group.highlight ? (tpl.highlight || tpl.accent) : tpl.ink;
      ctx.fillText(group.text, currentX, textY);
      currentX += ctx.measureText(group.text).width;
    });
    textY += lineHeight;
  });
  ctx.restore();
}

function drawFeedbackPoster(canvas, data, templateKey = 'blueGreenDiagonal') {
  const tpl = FEEDBACK_POSTER_TEMPLATES[templateKey] || FEEDBACK_POSTER_TEMPLATES.blueGreenDiagonal;
  const ctx = canvas.getContext('2d');
  canvas.width = 750;
  const layout = posterLayout(ctx, data);
  const canvasHeight = layout.canvasHeight;
  canvas.width = 750;
  canvas.height = layout.canvasHeight;
  const grad = ctx.createLinearGradient(0, 0, 0, canvasHeight);
  grad.addColorStop(0, tpl.bg1);
  grad.addColorStop(1, tpl.bg2);
  ctx.fillStyle = grad;
  ctx.fillRect(0, 0, 750, canvasHeight);
  ctx.save();
  if (tpl.type === 'diagonalSplit') {
    ctx.fillStyle = tpl.accent;
    ctx.beginPath();
    ctx.moveTo(0, canvasHeight - 384);
    ctx.lineTo(750, canvasHeight - 234);
    ctx.lineTo(750, canvasHeight);
    ctx.lineTo(0, canvasHeight);
    ctx.fill();
    ctx.strokeStyle = '#4A8DB7';
    ctx.lineWidth = 14;
    ctx.beginPath();
    ctx.ellipse(650, 450, 160, 220, Math.PI / 5, 0, Math.PI * 2);
    ctx.stroke();
    ctx.beginPath();
    ctx.moveTo(560, 630);
    ctx.lineTo(460, 830);
    ctx.stroke();
    ctx.lineWidth = 2;
    ctx.strokeStyle = 'rgba(74, 141, 183, 0.4)';
    for (let i = 500; i < 800; i += 25) {
      ctx.beginPath();
      ctx.moveTo(i, 200);
      ctx.lineTo(i - 100, 700);
      ctx.stroke();
    }
  } else if (tpl.type === 'cleanSilhouette') {
    ctx.strokeStyle = tpl.ink;
    ctx.lineWidth = 10;
    ctx.beginPath();
    ctx.ellipse(650, 1150, 200, 260, -Math.PI / 6, 0, Math.PI * 2);
    ctx.stroke();
    ctx.beginPath();
    ctx.moveTo(550, 1350);
    ctx.lineTo(450, 1550);
    ctx.stroke();
    ctx.lineWidth = 1.5;
    ctx.strokeStyle = 'rgba(20, 61, 48, 0.3)';
    for (let i = 500; i < 900; i += 20) {
      ctx.beginPath();
      ctx.moveTo(i, 900);
      ctx.lineTo(i - 150, 1400);
      ctx.stroke();
    }
    for (let i = 900; i < 1400; i += 20) {
      ctx.beginPath();
      ctx.moveTo(400, i);
      ctx.lineTo(900, i - 150);
      ctx.stroke();
    }
    ctx.fillStyle = tpl.accent;
    ctx.beginPath();
    ctx.arc(150, 1100, 45, 0, Math.PI * 2);
    ctx.fill();
    ctx.strokeStyle = '#FFFFFF';
    ctx.lineWidth = 3;
    ctx.beginPath();
    ctx.arc(120, 1100, 30, -Math.PI / 3, Math.PI / 3);
    ctx.stroke();
  } else if (tpl.type === 'split') {
    ctx.fillStyle = tpl.bg2;
    ctx.beginPath();
    ctx.moveTo(0, canvasHeight);
    ctx.lineTo(750, canvasHeight);
    ctx.lineTo(750, 450);
    ctx.lineTo(0, canvasHeight - 384);
    ctx.fill();
    ctx.strokeStyle = '#FFFFFF';
    ctx.lineWidth = 18;
    ctx.beginPath();
    ctx.moveTo(-50, 983);
    ctx.lineTo(800, 416);
    ctx.stroke();
    ctx.fillStyle = '#D4F02E';
    ctx.beginPath();
    ctx.arc(580, 430, 70, 0, Math.PI * 2);
    ctx.fill();
    ctx.strokeStyle = '#FFFFFF';
    ctx.lineWidth = 6;
    ctx.beginPath();
    ctx.arc(540, 430, 40, -Math.PI / 2, Math.PI / 2);
    ctx.stroke();
  } else if (tpl.type === 'wireframe') {
    ctx.strokeStyle = 'rgba(255,255,255,0.1)';
    ctx.lineWidth = 2;
    for (let i = 0; i < 750; i += 40) {
      ctx.beginPath();
      ctx.moveTo(i, 0);
      ctx.lineTo(i, canvasHeight);
      ctx.stroke();
    }
    for (let i = 0; i < canvasHeight; i += 40) {
      ctx.beginPath();
      ctx.moveTo(0, i);
      ctx.lineTo(750, i);
      ctx.stroke();
    }
    ctx.strokeStyle = 'rgba(255,255,255,0.4)';
    ctx.lineWidth = 6;
    ctx.beginPath();
    ctx.ellipse(600, 300, 220, 280, Math.PI * 0.1, 0, Math.PI * 2);
    ctx.stroke();
    ctx.beginPath();
    ctx.moveTo(500, 560);
    ctx.lineTo(300, 1000);
    ctx.stroke();
    ctx.beginPath();
    ctx.moveTo(560, 580);
    ctx.lineTo(360, 1030);
    ctx.stroke();
    ctx.shadowColor = 'rgba(0,0,0,0.5)';
    ctx.shadowBlur = 20;
    ctx.shadowOffsetX = 10;
    ctx.shadowOffsetY = 10;
    ctx.fillStyle = tpl.accent;
    ctx.beginPath();
    ctx.arc(480, 380, 50, 0, Math.PI * 2);
    ctx.fill();
    ctx.shadowColor = 'transparent';
  } else if (tpl.type === 'minimal') {
    ctx.strokeStyle = 'rgba(255,255,255,0.7)';
    ctx.lineWidth = 14;
    ctx.beginPath();
    ctx.ellipse(375, 450, 280, 350, 0, 0, Math.PI * 2);
    ctx.stroke();
    ctx.lineWidth = 2;
    ctx.strokeStyle = 'rgba(255,255,255,0.3)';
    for (let i = 120; i < 650; i += 40) {
      ctx.beginPath();
      ctx.moveTo(i, 110);
      ctx.lineTo(i, 790);
      ctx.stroke();
    }
    for (let i = 120; i < 800; i += 40) {
      ctx.beginPath();
      ctx.moveTo(110, i);
      ctx.lineTo(640, i);
      ctx.stroke();
    }
    ctx.fillStyle = tpl.accent;
    ctx.beginPath();
    ctx.arc(375, 200, 55, 0, Math.PI * 2);
    ctx.fill();
  } else if (tpl.type === 'sport') {
    ctx.strokeStyle = 'rgba(255,255,255,0.04)';
    ctx.lineWidth = 14;
    ctx.beginPath();
    ctx.arc(750, 1000, 450, Math.PI, Math.PI * 1.5);
    ctx.stroke();
    ctx.beginPath();
    ctx.arc(0, 300, 400, 0, Math.PI * 0.5);
    ctx.stroke();
  }
  ctx.restore();
  const nameStr = data.studentName || '学员';
  posterDrawFittedTitle(ctx, nameStr, 60, 140, 630, 68, 46, tpl.nameColor || tpl.ink);
  ctx.fillStyle = tpl.type === 'cleanSilhouette' ? (tpl.subColor || tpl.muted) : tpl.accent;
  ctx.font = '700 26px -apple-system,BlinkMacSystemFont,"PingFang SC",sans-serif';
  ctx.fillText(`${posterDisplayDate(data.date)} 训练反馈`, 60, 195);
  if (!['sport', 'diagonalSplit', 'split'].includes(tpl.type)) {
    ctx.fillStyle = tpl.subColor || tpl.muted;
    ctx.globalAlpha = 0.3;
    ctx.fillRect(60, 235, 630, 2);
    ctx.globalAlpha = 1;
  }
  layout.sections.forEach(section => {
    posterDrawTextBlock(ctx, tpl, section, 90, 570);
  });
  const footerY = layout.footerY;
  ctx.fillStyle = tpl.nameColor || tpl.ink;
  ctx.font = '900 34px -apple-system,BlinkMacSystemFont,"PingFang SC","Microsoft YaHei",sans-serif';
  ctx.fillText('网球兄弟', 60, footerY);
  ctx.fillStyle = tpl.subColor || tpl.muted;
  ctx.font = '500 18px -apple-system,BlinkMacSystemFont,"PingFang SC",sans-serif';
  ctx.fillText('用网球向生活发出邀请', 60, footerY + 35);
  ctx.save();
  ctx.fillStyle = tpl.accent;
  if (tpl.type === 'sport') {
    ctx.beginPath();
    ctx.moveTo(630, footerY + 35);
    ctx.lineTo(690, footerY + 35);
    ctx.lineTo(670, footerY + 5);
    ctx.fill();
  } else {
    ctx.beginPath();
    ctx.arc(670, footerY + 25, 10, 0, Math.PI * 2);
    ctx.fill();
  }
  ctx.restore();
  return layout;
}

function feedbackPosterDataForMini(schedule = {}, form = {}, preserveListMarkers = true, posterListStyle = 'preserve') {
  const startText = String(schedule.startTime || '').slice(0, 10);
  return {
    studentName: schedule.student || schedule.studentText || '学员',
    date: startText || posterDateText(schedule),
    coach: schedule.coach || currentCoachName() || '教练',
    practicedToday: form.practicedToday || '—',
    knowledgePoint: form.knowledgePoint || '',
    nextTraining: form.nextTraining || '—',
    preserveListMarkers,
    posterListStyle
  };
}

function studentScheduleStatusMeta(item = {}) {
  if (item.isCancelled || String(item.effectiveStatus || item.status || '') === '已取消') return { text: '已取消', className: 'detail-tag-muted' };
  if (item.isEnded === true || String(item.effectiveStatus || '') === '已结束') return { text: '已结束', className: 'detail-tag-muted' };
  if (item.isUpcoming === true || String(item.effectiveStatus || '') === '已排课') return { text: '待上课', className: 'detail-tag-success' };
  const end = parseLocalDate(item.endTime || item.startTime);
  if (end && end <= new Date()) return { text: '已结束', className: 'detail-tag-muted' };
  return { text: '待上课', className: 'detail-tag-success' };
}

function studentScheduleMeta(item = {}, linkedClass = null) {
  return [
    item.className || item.classNo || (linkedClass && (linkedClass.className || linkedClass.classNo)),
    item.venue || item.loc || item.locationText,
    `共 ${lessonUnitsText(scheduleLessonUnits(item))} 节`
  ].filter(Boolean);
}

function normalizeLedgerTimeBand(text = '') {
  const matched = String(text || '').match(/(\d{1,2})(?::(\d{2}))?\D+(\d{1,2})(?::(\d{2}))?/);
  if (!matched) return '';
  const start = `${String(matched[1]).padStart(2, '0')}:${matched[2] || '00'}`;
  const end = `${String(matched[3]).padStart(2, '0')}:${matched[4] || '00'}`;
  return `${start}-${end}`;
}

function studentLedgerTimeText(row = {}, schedule = {}) {
  if (schedule && schedule.startTime) return formatStudentClassTime(schedule);
  const date = String(row.sourceDate || row.relatedDate || row.createdAt || '').slice(0, 10);
  if (!date) return '';
  const band = normalizeLedgerTimeBand(row.sourceTimeBand || row.scheduleTime || '');
  return band ? `${date} ${band}` : date;
}

function studentLedgerSortTime(row = {}, schedule = {}) {
  if (schedule && schedule.startTime) return schedule.startTime;
  const date = String(row.sourceDate || row.relatedDate || row.createdAt || '').slice(0, 10);
  const band = normalizeLedgerTimeBand(row.sourceTimeBand || row.scheduleTime || '');
  const start = band ? band.slice(0, 5) : '00:00';
  return date ? `${date} ${start}` : '';
}

function studentLedgerLessonUnits(row = {}, schedule = {}) {
  const consumed = Math.abs(Number(row.lessonDelta) || 0);
  const planned = schedule && schedule.startTime ? scheduleLessonUnits(schedule) : 0;
  return Math.max(consumed, planned);
}

function studentLedgerRecordMetaParts(row = {}, linkedSchedule = {}) {
  return [
    row.sourceVenue || row.venue || row.courtName || row.court || linkedSchedule.venue || linkedSchedule.loc || linkedSchedule.locationText,
    row.coach || linkedSchedule.coach
  ].filter(Boolean);
}

function studentLedgerRecordHasDisplayContext(row = {}, linkedSchedule = {}, metaParts = []) {
  return !!(linkedSchedule.id || metaParts.length >= 2);
}

function studentLedgerRecordKey(studentId = '', row = {}, schedule = {}) {
  if (schedule && schedule.id) return `schedule:${schedule.id}`;
  if (row.scheduleId) return `schedule:${row.scheduleId}`;
  if (row.id) return `ledger:${row.id}`;
  return [studentId, row.sourceDate || row.relatedDate || '', row.sourceTimeBand || row.scheduleTime || '', row.coach || ''].join('|');
}

function lessonRecordHasEnded(sortTime = '', schedule = {}, now = new Date()) {
  if (schedule && schedule.id) return scheduleEnded(schedule, now);
  const time = parseLocalDate(sortTime);
  return !!(time && time <= now);
}

function studentLedgerRows(student = {}, entitlements = [], entitlementLedger = []) {
  const studentId = String(student.id || '').trim();
  const entIds = new Set(studentEntitlements(studentId, entitlements).map(item => String(item.id || '').trim()).filter(Boolean));
  return (entitlementLedger || []).filter(row => {
    if (Number(row.lessonDelta) >= 0) return false;
    if (String(row.studentId || '').trim() === studentId) return true;
    return entIds.has(String(row.entitlementId || '').trim());
  });
}

function buildStudentLessonRecords(student = {}, context = {}) {
  const schedule = Array.isArray(context.schedule) ? context.schedule : [];
  const entitlements = Array.isArray(context.entitlements) ? context.entitlements : [];
  const entitlementLedger = Array.isArray(context.entitlementLedger) ? context.entitlementLedger : [];
  const scheduleById = new Map(schedule.map(item => [String(item.id || ''), item]).filter(([id]) => id));
  const now = context.now || new Date();
  const map = new Map();
  studentLedgerRows(student, entitlements, entitlementLedger).forEach(row => {
    const linkedSchedule = scheduleById.get(String(row.scheduleId || '')) || {};
    const timeText = studentLedgerTimeText(row, linkedSchedule);
    const sortTime = studentLedgerSortTime(row, linkedSchedule);
    if (!timeText || !sortTime) return;
    if (!lessonRecordHasEnded(sortTime, linkedSchedule, now)) return;
    const metaParts = studentLedgerRecordMetaParts(row, linkedSchedule);
    if (!studentLedgerRecordHasDisplayContext(row, linkedSchedule, metaParts)) return;
    const key = studentLedgerRecordKey(student.id, row, linkedSchedule);
    map.set(key, {
      scheduleId: linkedSchedule.id || '',
      time: timeText,
      sortTime,
      courseType: firstNonEmpty(row.courseType, row.standardCourseType, row.packageName, dashboardCourseTag(linkedSchedule).text, '课包'),
      courseTypeClass: dashboardCourseTag(linkedSchedule).className === 'is-trial' ? 'detail-tag-trial' : 'detail-tag-private',
      status: '已结束',
      statusClass: 'detail-tag-muted',
      lessonUnits: studentLedgerLessonUnits(row, linkedSchedule),
      metaParts
    });
  });
  completedStudentSchedules(schedule)
    .filter(item => String(item.status || '') !== '已取消')
    .forEach(item => {
      const key = studentLedgerRecordKey(student.id, {}, item);
      if (map.has(key)) return;
      const courseTag = dashboardCourseTag(item);
      const statusMeta = studentScheduleStatusMeta(item);
      map.set(key, {
        scheduleId: item.id,
        time: formatStudentClassTime(item),
        sortTime: item.startTime || '',
        courseType: courseTag.text,
        courseTypeClass: courseTag.className === 'is-trial' ? 'detail-tag-trial' : 'detail-tag-private',
        status: statusMeta.text,
        statusClass: statusMeta.className,
        lessonUnits: scheduleLessonUnits(item),
        metaParts: studentScheduleMeta(item, null)
      });
    });
  return [...map.values()].sort((a, b) => String(b.sortTime || '').localeCompare(String(a.sortTime || '')));
}

function studentDetailLessonRecordsFromUnifiedRows(detailLessonRecordRows = []) {
  const byKey = new Map();
  (Array.isArray(detailLessonRecordRows) ? detailLessonRecordRows : [])
    .map((row) => {
      const time = firstNonEmpty(row.time, row.scheduleTime, row.startTime, row.relatedDate, row.createdAt);
      const sortTime = firstNonEmpty(row.sortTime, row.time, row.startTime, row.endTime, row.relatedDate, row.createdAt);
      const courseType = firstNonEmpty(row.courseType, row.standardCourseType, row.packageName, row.productName, row.className, row.courseName, '课程');
      const status = firstNonEmpty(row.statusText, row.status, '已结束');
      const hasFeedback = studentDetailLessonRecordHasFeedback(row);
      return {
        scheduleId: firstNonEmpty(row.scheduleId, row.id),
        time,
        sortTime,
        courseType,
        courseTypeClass: /体验/.test(courseType) ? 'detail-tag-trial' : 'detail-tag-private',
        status,
        statusClass: /待|进行/.test(status) ? 'detail-tag-success' : 'detail-tag-muted',
        feedbackStatusText: hasFeedback ? '' : '未反馈',
        feedbackStatusClass: 'detail-tag-warning',
        hasFeedback,
        lessonUnits: Number(row.lessonUnits || row.completedLessons || row.lessonCount || row.consumedLessons) || 1,
        metaParts: [
          row.venue || row.sourceVenue || row.courtName || row.court || row.locationText,
          row.coach || row.coachName || row.primaryCoach,
          courseType
        ].filter(Boolean)
      };
    })
    .filter(row => row.time && row.sortTime)
    .forEach((row) => {
      const key = firstNonEmpty(row.scheduleId, `${row.time}|${row.courseType}|${row.status}|${row.metaParts.join('|')}`);
      const existing = byKey.get(key);
      if (!existing) {
        byKey.set(key, row);
        return;
      }
      const mergedStatus = firstNonEmpty(existing.status, row.status, '已结束');
      const merged = {
        ...existing,
        ...row,
        scheduleId: firstNonEmpty(existing.scheduleId, row.scheduleId),
        time: firstNonEmpty(existing.time, row.time),
        sortTime: firstNonEmpty(existing.sortTime, row.sortTime),
        courseType: firstNonEmpty(existing.courseType, row.courseType, '课程'),
        courseTypeClass: /体验/.test(firstNonEmpty(existing.courseType, row.courseType, '课程')) ? 'detail-tag-trial' : 'detail-tag-private',
        status: mergedStatus,
        statusClass: /待|进行/.test(mergedStatus) ? 'detail-tag-success' : 'detail-tag-muted',
        feedbackStatusText: (existing.hasFeedback || row.hasFeedback) ? '' : '未反馈',
        feedbackStatusClass: 'detail-tag-warning',
        hasFeedback: !!(existing.hasFeedback || row.hasFeedback),
        lessonUnits: Math.max(Number(existing.lessonUnits) || 0, Number(row.lessonUnits) || 0) || 1,
        metaParts: [...new Set([...(existing.metaParts || []), ...(row.metaParts || [])].map(value => String(value || '').trim()).filter(Boolean))]
      };
      byKey.set(key, merged);
    });
  return [...byKey.values()]
    .sort((a, b) => String(b.sortTime || '').localeCompare(String(a.sortTime || '')));
}

function studentDetailLessonRecordTitle(total = 0, expanded = false) {
  if (!total) return '';
  if (expanded) return '（全部）';
  if (total <= STUDENT_DETAIL_RECORD_PREVIEW_COUNT) return '（全部）';
  return `（最近${Math.min(STUDENT_DETAIL_RECORD_PREVIEW_COUNT, total)}条）`;
}

function studentDetailLessonRecordView(detail = {}, expanded = false) {
  const lessonRecords = Array.isArray(detail.lessonRecords) ? detail.lessonRecords : [];
  return {
    ...detail,
    showAllLessonRecords: expanded,
    lessonRecordsShown: expanded ? lessonRecords : lessonRecords.slice(0, STUDENT_DETAIL_RECORD_PREVIEW_COUNT),
    hasMoreLessonRecords: lessonRecords.length > STUDENT_DETAIL_RECORD_PREVIEW_COUNT,
    lessonRecordTitleSub: '',
    lessonRecordPreviewSub: '',
    lessonRecordToggleText: expanded ? '收起上课记录' : '查看全部上课记录'
  };
}

function buildStudentDetailData(student, context = {}) {
  if (!student) return null;
  const classes = Array.isArray(context.classes) ? context.classes : [];
  const coachName = String(context.coachName || '').trim();
  const relatedClassIds = studentRelatedClassIds(student.id, classes);
  const relatedClasses = classes.filter(item => relatedClassIds.includes(String(item.id || '').trim()));
  const activeClass = relatedClasses.find(item => String(item.status || '') !== '已结束' && String(item.status || '') !== '已取消') || relatedClasses[0] || null;
  const lessonRecords = studentDetailLessonRecordsFromUnifiedRows(student.detailLessonRecordRows||[]);
  const lessonUnitsCompleted = Number(student.completedLessons) || 0;
  const lessonRecordCount = lessonRecords.length;
  const latestRecord = lessonRecords[0] || null;
  const ownerCoach = firstNonEmpty(student.ownerCoach, student.primaryCoach, activeClass && activeClass.coach);
  const responsibleCoach = firstNonEmpty(student.primaryCoach, activeClass && activeClass.coach, coachName);
  const campus = campusDisplayName(firstNonEmpty(student.campusName, student.campus, activeClass && activeClass.campusName, activeClass && activeClass.campus));
  const remark = firstNonEmpty(student.remark);
  const detail = {
    studentId: student.id,
    basic: {
      name: student.name || '未命名学员',
      phone: firstNonEmpty(student.phone) || '暂无记录',
      phoneEmpty: !firstNonEmpty(student.phone),
      type: firstNonEmpty(student.type) || '暂无记录',
      campus: campus || '暂无记录',
      campusEmpty: !campus,
      cumulative: firstNonEmpty(student.detailCumulativeText, student.cumulative) || lessonUnitsText(lessonUnitsCompleted),
      packageProgress: firstNonEmpty(student.detailPackageProgressText, student.detailPackageBalanceText, student.packageText) || '暂无记录',
      packageEmpty: !firstNonEmpty(student.detailPackageProgressText, student.detailPackageBalanceText, student.packageText),
      recentLesson: firstNonEmpty(student.detailRecentLessonText, student.lastClassText) || '暂无记录',
      recentLessonEmpty: !firstNonEmpty(student.detailRecentLessonText, student.lastClassText, student.detailRecentLessonDate, student.lastFormalLessonAt, latestRecord && latestRecord.sortTime)
    },
    summary: {
      coach: responsibleCoach || '暂无记录',
      owner: ownerCoach || '未设置',
      className: firstNonEmpty(activeClass && activeClass.className, activeClass && activeClass.classNo) || '暂无记录',
      classEmpty: !activeClass,
      lastClass: latestRecord ? latestRecord.time : '暂无记录',
      lastClassEmpty: !latestRecord,
      cumulative: firstNonEmpty(student.detailCumulativeText, student.cumulative) || lessonUnitsText(lessonUnitsCompleted),
      packageProgress: firstNonEmpty(student.detailPackageProgressText, student.detailPackageBalanceText, student.packageText) || '暂无记录',
      packageEmpty: !firstNonEmpty(student.detailPackageProgressText, student.detailPackageBalanceText, student.packageText)
    },
    remark: {
      text: remark || '暂无记录',
      isEmpty: !remark
    },
    latest: latestRecord ? {
      scheduleId: latestRecord.scheduleId,
      time: latestRecord.time,
      courseType: latestRecord.courseType,
      courseTypeClass: latestRecord.courseTypeClass,
      status: latestRecord.status,
      statusClass: latestRecord.statusClass,
      metaParts: latestRecord.metaParts
    } : null,
    hasLatest: !!latestRecord,
    hasLessonRecords: lessonRecords.length > 0,
    lessonRecords,
    lessonUnitsCompleted,
    lessonRecordCount
  };
  return studentDetailLessonRecordView(detail, false);
}

function rpxToPx(value) {
  const info = wx.getWindowInfo ? wx.getWindowInfo() : wx.getSystemInfoSync();
  return (value * (info.windowWidth || 375)) / 750;
}

function clamp(value, min, max) {
  return Math.max(min, Math.min(max, value));
}

function currentTimeMarker(now = new Date()) {
  const hour = now.getHours();
  const minute = now.getMinutes();
  return `${String(hour).padStart(2, '0')}:${String(minute).padStart(2, '0')}`;
}

function timetableNowLineStyle(now = new Date()) {
  const minutes = clamp(((now.getHours() - TIMETABLE_START_HOUR) * 60) + now.getMinutes(), 0, (TIMETABLE_END_HOUR - TIMETABLE_START_HOUR) * 60);
  const top = Math.round((minutes / 60) * TIMETABLE_HOUR_HEIGHT_RPX);
  return `top:${top}rpx;`;
}

function timetableNowSolidLineStyle(days = [], now = new Date(), isCurrentWeek = true) {
  if (!isCurrentWeek) return '';
  const todayIndex = (days || []).findIndex(item => item.isToday);
  if (todayIndex < 0) return '';
  return `left:${todayIndex * TIMETABLE_DAY_WIDTH_RPX}rpx;width:${TIMETABLE_DAY_WIDTH_RPX}rpx;${timetableNowLineStyle(now)}`;
}

function timetableScrollTop(now = new Date(), isCurrentWeek = true) {
  if (!isCurrentWeek) return 0;
  const minutes = clamp(((now.getHours() - TIMETABLE_START_HOUR) * 60) + now.getMinutes(), 0, (TIMETABLE_END_HOUR - TIMETABLE_START_HOUR) * 60);
  const lineTopPx = rpxToPx((minutes / 60) * TIMETABLE_HOUR_HEIGHT_RPX);
  return Math.max(0, Math.round(lineTopPx - 260));
}

function timetableScrollLeft(days = [], isCurrentWeek = true) {
  if (!isCurrentWeek) return 0;
  const todayIndex = (days || []).findIndex(item => item.isToday);
  if (todayIndex < 0) return 0;
  return Math.max(0, Math.round(rpxToPx(todayIndex * TIMETABLE_DAY_WIDTH_RPX)));
}

function normalizeScheduleRouteTab(value = '') {
  const tab = String(value || '').trim();
  return ['dashboard', 'timetable', 'students', 'shifts'].includes(tab) ? tab : '';
}

function scheduleTabState(activeTab = 'dashboard') {
  return {
    activeTab,
    isDashboard: activeTab === 'dashboard',
    isTimetable: activeTab === 'timetable',
    isStudents: activeTab === 'students',
    isShifts: activeTab === 'shifts',
    dashboardTabClass: activeTab === 'dashboard' ? 'active' : '',
    timetableTabClass: activeTab === 'timetable' ? 'active' : '',
    studentsTabClass: activeTab === 'students' ? 'active' : '',
    shiftsTabClass: activeTab === 'shifts' ? 'active' : ''
  };
}

Page({
  data: {
    loading: true,
    error: '',
    hasLoaded: false,
    activeTab: 'dashboard',
    isDashboard: true,
    isTimetable: false,
    isStudents: false,
    isShifts: false,
    isCurrentWeek: true,
    weekOffset: 0,
    weekTitle: '本周',
    weekRange: '',
    todayLabel: '',
    coachGreeting: '早安',
    coachDisplayName: '教练端',
    coachMenuId: '',
    coachMenuAvatar: '教',
    days: [],
    timetableDays: [],
    timetableHours,
    timetableScrollTop: 0,
    timetableScrollLeft: 0,
    preservedTimetableScrollTop: 0,
    preservedTimetableScrollLeft: 0,
    currentTimeText: '',
    timetableNowLineStyle: '',
    timetableNowSolidLineStyle: '',
    schedule: [],
    feedbacks: [],
    coachProposals: [],
    campusesRaw: [],
    studentsRaw: [],
    classesRaw: [],
    entitlementsRaw: [],
    entitlementLedgerRaw: [],
    studentScheduleRaw: [],
    visibleClasses: [],
    dashboardClasses: [],
    weekTodoRequiredOnly: true,
    weekTodoGroups: [],
    weekTodoCards: [],
    reminderItems: [],
    nextTravelReminder: false,
    coachWorkbenchStats: {},
    studentsList: [],
    studentsFilteredList: [],
    studentFilterTab: 'all',
    studentSearchKeyword: '',
    studentTabs: buildStudentTabs(),
    studentStats: { totalCount: 0, weekActiveCount: 0, monthActiveCount: 0, activeCount: 0, trialCount: 0, endedCount: 0 },
    shiftsList: [],
    shiftStats: { totalCount: 0, activeCount: 0, totalLessons: 0, usedLessons: 0, remainingLessons: 0 },
    feedbackForm: feedbackFormFromRecord(),
    feedbackCounts: feedbackCountsOf(),
    feedbackListStyle: 'normal',
    feedbackListStyleOptions: feedbackListStyleOptions(),
    feedbackListCursors: {},
    feedbackSelectionRanges: {},
    proposalForm: proposalFormFromRecord(),
    proposalCounts: proposalCountsOf(),
    feedbackHasSaved: false,
    proposalHasSaved: false,
    proposalEditing: false,
    feedbackEditing: false,
    feedbackFocusedField: '',
    proposalFocusedField: '',
    feedbackContextParts: [],
    feedbackSheetScrollTop: 0,
    studentDetailScrollTop: 0,
    shiftDetailScrollTop: 0,
    shiftScheduleScrollTop: 0,
    cancelScheduleScrollTop: 0,
    posterDate: '',
    savingFeedback: false,
    savingProposal: false,
    savingShiftSchedule: false,
    savingCancelSchedule: false,
    stats: { month: 0, week: 0, today: 0, feedback: 0, pending: 0, conversionText: '-', conversionUnit: '', nextTime: '暂无', nextText: '暂无', todo: 0 },
    selectedClass: null,
    selectedClassDetail: null,
    selectedStudentDetail: null,
    selectedShiftDetail: null,
    selectedShiftForSchedule: null,
    selectedScheduleForEdit: null,
    showDetail: false,
    showFeedback: false,
    showProposal: false,
    showPoster: false,
    showStudentDetail: false,
    showShiftDetail: false,
    showShiftSchedule: false,
    showCancelSchedule: false,
    showCoachMenu: false,
    pendingRouteScheduleId: '',
    pendingRouteAction: '',
    detailReturnTarget: '',
    feedbackReturnTarget: '',
    detailSheetClass: '',
    feedbackSheetClass: '',
    proposalSheetClass: '',
    posterSheetClass: '',
    studentDetailSheetClass: '',
    shiftDetailSheetClass: '',
    shiftScheduleSheetClass: '',
    cancelScheduleSheetClass: '',
    coachMenuSheetClass: '',
    shiftScheduleForm: {
      id: '',
      classId: '',
      className: '',
      studentIds: [],
      studentNames: '',
      date: '',
      startTime: '14:00',
      endTime: '16:00',
      campusIndex: -1,
      campusOptions: [],
      campusName: '',
      venue: '',
      lessonCount: '1',
      notes: ''
    },
    shiftScheduleMode: 'create',
    cancelScheduleForm: {
      reason: ''
    },
    dashboardTabClass: 'active',
    timetableTabClass: '',
    studentsTabClass: '',
    shiftsTabClass: '',
    posterStyle: '蓝绿对角',
    posterTemplateKey: 'blueGreenDiagonal',
    posterStyles: POSTER_STYLE_OPTIONS,
    posterPreserveListMarkers: true,
    posterListStyle: 'preserve',
    posterCanvasHeightRpx: 996,
    posterPreviewImage: ''
  },

  onLoad(options = {}) {
    const routeTab = normalizeScheduleRouteTab(options.tab);
    this.setData({
      pendingRouteScheduleId: String(options.scheduleId || '').trim(),
      pendingRouteAction: String(options.action || '').trim(),
      ...(routeTab ? scheduleTabState(routeTab) : {})
    });
    this.load();
  },

  onShow() {
    if (this.shouldRefreshOnShow()) this.load({ keepLoading: true });
  },

  shouldRefreshOnShow() {
    return !!(this.data.hasLoaded && !this.data.savingFeedback && !this.data.showFeedback && !this.data.showPoster);
  },

  onPullDownRefresh() {
    this.load({ stopPullDown: true });
  },

  async load(options = {}) {
    if (!options.keepLoading) this.setData({ loading: true, error: '' });
    try {
      await ensureCoachSession();
      const data = await loadCoachWorkbench();
      const coachName = currentCoachName();
      const displayName = coachDisplayName(coachName);
      const coachMenuId = currentCoachId();
      const now = new Date();
      const schedule = adaptSchedule(data.schedule || [], data.feedbacks || []);
      const studentSchedule = adaptSchedule(data.studentSchedule || data.schedule || [], data.feedbacks || []);
      const studentRoster = data.studentRoster || {};
      const studentsRaw = studentRosterItems(studentRoster);
      const studentsList = buildStudentCards(studentsRaw);
      const studentStats = studentRoster.stats || {};
      const studentTabs = buildStudentTabs(studentStats, this.data.studentFilterTab, studentRoster.tabs || []);
      const studentsFilteredList = filterStudentCards(studentsList, this.data.studentFilterTab, this.data.studentSearchKeyword);
      const shiftsList = [];
      this.setData({
        schedule,
        studentScheduleRaw: studentSchedule,
        coachWorkbenchStats: data.stats || {},
        feedbacks: data.feedbacks || [],
        coachProposals: data.coachProposals || [],
        campusesRaw: data.campuses || [],
        studentsRaw,
        classesRaw: data.classes || [],
        entitlementsRaw: data.entitlements || [],
        entitlementLedgerRaw: data.entitlementLedger || [],
        studentsList,
        studentsFilteredList,
        studentStats,
        studentTabs,
        shiftsList,
        shiftStats: buildShiftStats(shiftsList),
        coachGreeting: coachGreeting(now),
        coachDisplayName: displayName,
        coachMenuId,
        coachMenuAvatar: avatarText(displayName),
        loading: false,
        hasLoaded: true
      });
      this.renderWeek();
      this.tryOpenPendingRouteAction();
    } catch (err) {
      if (handleCoachAuthError(err)) return;
      this.setData({ loading: false, hasLoaded: true, error: err.message || '请先确认账号已绑定微信后重试' });
    } finally {
      if (options.stopPullDown) wx.stopPullDownRefresh();
    }
  },

  tryOpenPendingRouteAction() {
    const scheduleId = String(this.data.pendingRouteScheduleId || '').trim();
    const action = String(this.data.pendingRouteAction || '').trim();
    if (!scheduleId || !action) return;
    this.setData({
      pendingRouteScheduleId: '',
      pendingRouteAction: ''
    });
    if (action === 'feedback') this.openFeedbackByScheduleId(scheduleId);
  },

  renderWeek() {
    const { weekOffset, schedule, coachWorkbenchStats, weekTodoRequiredOnly } = this.data;
    const now = new Date();
    const mergedStats = standardWorkbenchStats(coachWorkbenchStats);
    const hasOverallTrialStats = Object.prototype.hasOwnProperty.call(mergedStats, 'overallTrialStudentCount');
    const showOverallTrialStats = hasOverallTrialStats && Number(mergedStats.overallTrialStudentCount) > 0;
    const days = buildWeekDays(schedule, weekOffset);
    const visibleClasses = days.reduce((all, day) => all.concat(day.items.map(item => ({ ...item, dayKey: day.key }))), []);
    const today = days.find(day => day.isToday);
    const dashboardClasses = today ? today.items.map(item => decorateWorkbenchClass(item, now)) : [];
    const todayShownIds = new Set((dashboardClasses || []).map(item => String(item.id || '')).filter(Boolean));
    const weekTodoGroups = buildWeekTodoGroups(days, now, todayShownIds, { requiredOnly: weekTodoRequiredOnly });
    const weekTodoCards = buildWeekTodoCards(weekTodoGroups);
    const todoItems = weekTodoGroups.reduce((all, day) => all.concat(day.items), []);
    const pending = todoItems.filter(item => item.todoLabel === '待反馈').length;
    const nextClass = visibleClasses
      .filter(item => {
        const state = workbenchTodoState(item, now);
        return state && (state.code === 'upcoming' || state.code === 'travel' || state.code === 'later');
      })
      .sort((a, b) => String(a.startTime || '').localeCompare(String(b.startTime || '')))[0];
    const todayCount = today ? today.items.length : 0;
    const reminderItems = buildReminderItems({
      todayCount,
      nextClass,
      todoCount: todoItems.length,
      pendingCount: pending
    });
    const decoratedTimetableDays = decorateTimetableDays(buildTimetableDays(schedule, weekOffset, now));
    const isCurrentWeek = weekOffset === 0;
    this.setData({
      weekTitle: weekOffset === 0 ? '本周' : (weekOffset > 0 ? `后 ${weekOffset} 周` : `前 ${Math.abs(weekOffset)} 周`),
      weekRange: weekRangeText(weekOffset),
      todayLabel: today ? today.label.replace(/\s+/, ' ') : '',
      isCurrentWeek,
      days,
      timetableDays: decoratedTimetableDays,
      timetableScrollTop: timetableScrollTop(now, isCurrentWeek),
      timetableScrollLeft: timetableScrollLeft(decoratedTimetableDays, isCurrentWeek),
      currentTimeText: currentTimeMarker(now),
      timetableNowLineStyle: timetableNowLineStyle(now),
      timetableNowSolidLineStyle: timetableNowSolidLineStyle(decoratedTimetableDays, now, isCurrentWeek),
      visibleClasses,
      dashboardClasses,
      weekTodoGroups,
      weekTodoCards,
      reminderItems,
      nextTravelReminder: hasTravelReminder(nextClass),
      stats: {
        month: mergedStats.monthFinishedLessonUnits || 0,
        week: mergedStats.weekFinishedLessonUnits || 0,
        today: mergedStats.todayFinishedLessonUnits || 0,
        feedback: mergedStats.monthFeedbackCount || 0,
        pending: mergedStats.pendingFeedbackCount || 0,
        conversionText: showOverallTrialStats
          ? String(mergedStats.overallTrialConversionRate || 0)
          : (hasOverallTrialStats ? '-' : '-'),
        conversionUnit: showOverallTrialStats ? '%' : '',
        nextTime: nextClass ? nextClass.timeText : '暂无',
        nextText: nextClass ? `${nextClass.timeText} · ${nextClass.locationText}` : '暂无',
        todo: todoItems.length
      }
    });
  },

  toggleWeekTodoRequiredOnly() {
    this.setData({
      weekTodoRequiredOnly: !this.data.weekTodoRequiredOnly
    }, () => this.renderWeek());
  },

  onStudentTabTap(event) {
    const studentFilterTab = event.currentTarget.dataset.tab || 'all';
    this.setData({
      studentFilterTab,
      studentTabs: buildStudentTabs(this.data.studentStats, studentFilterTab),
      studentsFilteredList: filterStudentCards(this.data.studentsList, studentFilterTab, this.data.studentSearchKeyword)
    });
  },

  onStudentSearchInput(event) {
    const studentSearchKeyword = event.detail.value || '';
    this.setData({
      studentSearchKeyword,
      studentsFilteredList: filterStudentCards(this.data.studentsList, this.data.studentFilterTab, studentSearchKeyword)
    });
  },

  switchTab(event) {
    const activeTab = event.currentTarget.dataset.tab || 'timetable';
    this.setData(scheduleTabState(activeTab), () => {
      if (activeTab === 'timetable') this.renderWeek();
    });
  },

  toggleCoachMenu() {
    this.setData({
      showCoachMenu: true,
      coachMenuSheetClass: 'sheet-show'
    });
  },

  closeCoachMenu() {
    this.setData({
      showCoachMenu: false,
      coachMenuSheetClass: ''
    });
  },

  closeOverlay() {
    if (this.data.showCoachMenu) {
      this.closeCoachMenu();
      return;
    }
    if (this.data.showPoster) {
      this.closePoster();
      return;
    }
    if (this.data.showFeedback) {
      this.closeFeedback();
      return;
    }
    if (this.data.showDetail) {
      this.closeDetail();
      return;
    }
    this.closeSheets();
  },

  logout() {
    wx.removeStorageSync(TOKEN_KEY);
    wx.removeStorageSync(USER_KEY);
    this.setData({
      showCoachMenu: false,
      coachMenuSheetClass: ''
    });
    wx.reLaunch({ url: '/pages/index/index' });
  },

  openAgreement() {
    this.closeCoachMenu();
    wx.navigateTo({ url: '/pages/agreement/agreement' });
  },

  openPrivacy() {
    this.closeCoachMenu();
    wx.navigateTo({ url: '/pages/privacy/privacy' });
  },

  prevWeek() {
    this.setData({ weekOffset: this.data.weekOffset - 1 }, () => this.renderWeek());
  },

  nextWeek() {
    this.setData({ weekOffset: this.data.weekOffset + 1 }, () => this.renderWeek());
  },

  goCurrentWeek() {
    this.setData({ weekOffset: 0 }, () => this.renderWeek());
  },

  onTimetableScroll(event) {
    const detail = event.detail || {};
    this._timetableScrollTop = Number(detail.scrollTop) || 0;
    this._timetableScrollLeft = Number(detail.scrollLeft) || 0;
  },

  preserveTimetableScroll() {
    const top = Object.prototype.hasOwnProperty.call(this, '_timetableScrollTop')
      ? this._timetableScrollTop
      : this.data.timetableScrollTop;
    const left = Object.prototype.hasOwnProperty.call(this, '_timetableScrollLeft')
      ? this._timetableScrollLeft
      : this.data.timetableScrollLeft;
    this.setData({
      preservedTimetableScrollTop: Number(top) || 0,
      preservedTimetableScrollLeft: Number(left) || 0
    });
  },

  restoreTimetableScroll() {
    if (!this.data.isTimetable) return;
    this.setData({
      timetableScrollTop: Number(this.data.preservedTimetableScrollTop) || 0,
      timetableScrollLeft: Number(this.data.preservedTimetableScrollLeft) || 0
    });
  },

  openDetail(event) {
    const id = event.currentTarget.dataset.id;
    if (!id) return;
    const selectedClass = (this.data.schedule || []).find(item => String(item.id) === String(id))
      || (this.data.studentScheduleRaw || []).find(item => String(item.id) === String(id));
    if (!selectedClass) return;
    if (this.data.isTimetable) this.preserveTimetableScroll();
    this.setData({
      selectedClass,
      selectedClassDetail: buildDetailData(selectedClass, {
        students: this.data.studentsRaw,
        classes: this.data.classesRaw,
        entitlements: this.data.entitlementsRaw,
        entitlementLedger: this.data.entitlementLedgerRaw,
        feedbacks: this.data.feedbacks,
        coachProposals: this.data.coachProposals,
        coachName: currentCoachName()
      }),
      detailReturnTarget: this.data.showStudentDetail ? 'student' : '',
      showDetail: true,
      detailSheetClass: 'sheet-show'
    });
  },

  openStudentDetail(event) {
    const id = event.currentTarget.dataset.id;
    if (!id) return;
    const student = this.data.studentsRaw.find(item => String(item.id) === String(id));
    if (!student) return;
    const selectedStudentDetail = buildStudentDetailData(student, {
      classes: this.data.classesRaw,
      schedule: this.data.studentScheduleRaw,
      entitlements: this.data.entitlementsRaw,
      entitlementLedger: this.data.entitlementLedgerRaw,
      coachName: currentCoachName()
    });
    this.setData({
      studentDetailScrollTop: 1,
      selectedStudentDetail,
      showStudentDetail: true,
      studentDetailSheetClass: 'sheet-show'
    });
    wx.nextTick(() => {
      this.setData({ studentDetailScrollTop: 0 });
    });
  },

  toggleStudentLessonRecords() {
    const detail = this.data.selectedStudentDetail;
    if (!detail) return;
    this.setData({
      selectedStudentDetail: studentDetailLessonRecordView(detail, !detail.showAllLessonRecords)
    });
  },

  openShiftAction(event) {
    const id = event.currentTarget.dataset.id;
    if (!id) return;
    const shift = this.data.shiftsList.find(item => String(item.id) === String(id));
    if (!shift) return;
    const selectedShiftDetail = buildShiftDetailData(shift, {
      classes: this.data.classesRaw,
      students: this.data.studentsRaw,
      schedule: this.data.schedule,
      coachName: currentCoachName()
    });
    this.setData({
      shiftDetailScrollTop: 1,
      selectedShiftDetail,
      showShiftDetail: true,
      shiftDetailSheetClass: 'sheet-show'
    });
    wx.nextTick(() => {
      this.setData({ shiftDetailScrollTop: 0 });
    });
  },

  closeSheets() {
    this.setData({
      showDetail: false,
      showFeedback: false,
      showProposal: false,
      showPoster: false,
      showStudentDetail: false,
      showShiftDetail: false,
      detailSheetClass: '',
      feedbackSheetClass: '',
      proposalSheetClass: '',
      posterSheetClass: '',
      studentDetailSheetClass: '',
      shiftDetailSheetClass: '',
      detailReturnTarget: '',
      feedbackReturnTarget: '',
      feedbackForm: feedbackFormFromRecord(),
      feedbackCounts: feedbackCountsOf(),
      proposalForm: proposalFormFromRecord(),
      proposalCounts: proposalCountsOf(),
      feedbackHasSaved: false,
      proposalHasSaved: false,
      proposalEditing: false,
      feedbackEditing: false,
      feedbackFocusedField: '',
      proposalFocusedField: '',
      feedbackContextParts: [],
      studentDetailScrollTop: 0,
      shiftDetailScrollTop: 0,
      posterDate: '',
      selectedClassDetail: null,
      selectedStudentDetail: null,
      selectedShiftDetail: null,
      selectedShiftForSchedule: null,
      selectedScheduleForEdit: null
    });
  },

  closeDetail() {
    this.setData({
      showDetail: false,
      detailSheetClass: '',
      detailReturnTarget: '',
      selectedClass: null,
      selectedClassDetail: null
    });
  },

  closeFeedback() {
    const returnToDetail = this.data.feedbackReturnTarget === 'detail' && this.data.selectedClassDetail;
    this.setData({
      showFeedback: false,
      feedbackSheetClass: '',
      feedbackReturnTarget: '',
      feedbackForm: feedbackFormFromRecord(),
      feedbackCounts: feedbackCountsOf(),
      feedbackHasSaved: false,
      feedbackEditing: false,
      feedbackFocusedField: '',
      feedbackListStyle: 'normal',
      feedbackListCursors: {},
      feedbackSelectionRanges: {},
      feedbackSheetScrollTop: 0,
      feedbackContextParts: [],
      showDetail: returnToDetail ? true : false,
      detailSheetClass: returnToDetail ? 'sheet-show' : '',
      selectedClass: returnToDetail ? this.data.selectedClass : null,
      selectedClassDetail: returnToDetail ? this.data.selectedClassDetail : null
    }, () => this.restoreTimetableScroll());
  },

  openProposal() {
    if (!this.data.selectedClass || !isSmallGroupSchedule(this.data.selectedClass)) return;
    const currentProposal = findProposalByScheduleId(this.data.coachProposals, this.data.selectedClass.id);
    const proposalForm = proposalFormFromRecord(currentProposal, this.data.selectedClass);
    this.setData({
      showDetail: false,
      showProposal: true,
      detailSheetClass: '',
      proposalSheetClass: 'sheet-show',
      proposalForm,
      proposalCounts: proposalCountsOf(proposalForm),
      proposalHasSaved: !!currentProposal,
      proposalEditing: false,
      proposalFocusedField: ''
    });
  },

  onProposalFocus(event) {
    this.setData({ proposalFocusedField: event.currentTarget.dataset.field || '' });
  },

  onProposalBlur() {
    this.setData({ proposalFocusedField: '' });
  },

  onProposalInput(event) {
    const field = event.currentTarget.dataset.field || 'courseName';
    const proposalForm = {
      ...this.data.proposalForm,
      [field]: event.detail.value
    };
    this.setData({
      proposalForm,
      proposalCounts: proposalCountsOf(proposalForm)
    });
  },

  editProposal() {
    this.setData({ proposalEditing: true, proposalFocusedField: '' });
  },

  async saveProposal() {
    const selectedClass = this.data.selectedClass;
    if (!selectedClass || this.data.savingProposal) return;
    const form = this.data.proposalForm || {};
    const required = ['courseName', 'studentLevel', 'studentCount', 'teachingGoal', 'progression1', 'progression2', 'progression3', 'progressionLogic', 'conclusion'];
    if (required.some(key => !String(form[key] || '').trim())) {
      wx.showToast({ title: '请填写完整提案', icon: 'none' });
      return;
    }
    const currentProposal = findProposalByScheduleId(this.data.coachProposals, selectedClass.id);
    this.setData({ savingProposal: true });
    try {
      const savedProposal = await saveCoachProposal({
        id: currentProposal ? currentProposal.id : '',
        scheduleId: selectedClass.id,
        classId: selectedClass.classId || '',
        coach: currentCoachName(),
        courseType: selectedClass.type || selectedClass.title || '',
        ...form,
        teachingOrganization: ''
      });
      wx.showToast({ title: '提案已保存', icon: 'success' });
      this.applyProposalPatch(selectedClass, savedProposal);
      this.closeSheets();
    } catch (err) {
      wx.showToast({ title: err.message || '保存失败', icon: 'none' });
    } finally {
      this.setData({ savingProposal: false });
    }
  },

  openFeedback() {
    if (!this.data.selectedClass) return;
    if (this.data.isTimetable) this.preserveTimetableScroll();
    const currentFeedback = findFeedbackByScheduleId(this.data.feedbacks, this.data.selectedClass.id);
    const feedbackForm = feedbackFormFromRecord(currentFeedback);
    this.setData({
      showDetail: false,
      showFeedback: true,
      detailSheetClass: '',
      feedbackSheetClass: 'sheet-show',
      feedbackReturnTarget: 'detail',
      feedbackForm,
      feedbackCounts: feedbackCountsOf(feedbackForm),
      feedbackHasSaved: !!currentFeedback,
      feedbackEditing: false,
      feedbackFocusedField: '',
      feedbackListStyle: 'normal',
      feedbackListCursors: {},
      feedbackSelectionRanges: {},
      feedbackSheetScrollTop: 0,
      feedbackContextParts: feedbackContextParts(this.data.selectedClass)
    });
  },

  openFeedbackByScheduleId(id) {
    if (!id) return;
    const selectedClass = this.data.schedule.find(item => String(item.id) === String(id));
    if (!selectedClass) return;
    const currentFeedback = findFeedbackByScheduleId(this.data.feedbacks, selectedClass.id);
    const feedbackForm = feedbackFormFromRecord(currentFeedback);
    this.setData({
      selectedClass,
      selectedClassDetail: buildDetailData(selectedClass, {
        classes: this.data.classesRaw,
        students: this.data.studentsRaw,
        entitlements: this.data.entitlementsRaw,
        entitlementLedger: this.data.entitlementLedgerRaw,
        feedbacks: this.data.feedbacks,
        coachProposals: this.data.coachProposals,
        coachName: currentCoachName()
      }),
      showDetail: false,
      showFeedback: true,
      detailSheetClass: '',
      feedbackSheetClass: 'sheet-show',
      feedbackReturnTarget: '',
      feedbackForm,
      feedbackCounts: feedbackCountsOf(feedbackForm),
      feedbackHasSaved: !!currentFeedback,
      feedbackEditing: false,
      feedbackFocusedField: '',
      feedbackListStyle: 'normal',
      feedbackListCursors: {},
      feedbackSelectionRanges: {},
      feedbackSheetScrollTop: 0,
      feedbackContextParts: feedbackContextParts(selectedClass)
    });
  },

  openFeedbackById(event) {
    const id = event.currentTarget.dataset.id;
    this.preserveTimetableScroll();
    this.openFeedbackByScheduleId(id);
  },

  onFeedbackFocus(event) {
    this.setData({ feedbackFocusedField: event.currentTarget.dataset.field || '' });
  },

  onFeedbackBlur() {
  },

  onFeedbackInput(event) {
    const field = event.currentTarget.dataset.field || 'practicedToday';
    const prevValue = this.data.feedbackForm[field] || '';
    const value = feedbackAutoListValue(prevValue, event.detail.value, this.data.feedbackListStyle || 'normal');
    const cursor = event.detail.cursor == null ? value.length : event.detail.cursor;
    const feedbackForm = {
      ...this.data.feedbackForm,
      [field]: value
    };
    const feedbackListCursors = {
      ...this.data.feedbackListCursors,
      [field]: cursor
    };
    const feedbackSelectionRanges = {
      ...this.data.feedbackSelectionRanges,
      [field]: { start: cursor, end: cursor }
    };
    this.setData({
      feedbackForm,
      feedbackListCursors,
      feedbackSelectionRanges,
      feedbackCounts: feedbackCountsOf(feedbackForm)
    });
  },

  onFeedbackSelect(event) {
    const field = event.currentTarget.dataset.field || 'practicedToday';
    const detail = event.detail || {};
    const start = detail.selectionStart == null ? (detail.cursor || 0) : detail.selectionStart;
    const end = detail.selectionEnd == null ? start : detail.selectionEnd;
    this.setData({
      feedbackFocusedField: field,
      feedbackListCursors: {
        ...this.data.feedbackListCursors,
        [field]: end
      },
      feedbackSelectionRanges: {
        ...this.data.feedbackSelectionRanges,
        [field]: { start, end }
      }
    });
  },

  onFeedbackListStyleTap(event) {
    const style = event.currentTarget.dataset.style || 'normal';
    const field = this.data.feedbackFocusedField || 'practicedToday';
    const feedbackForm = { ...this.data.feedbackForm };
    const feedbackListCursors = { ...this.data.feedbackListCursors };
    const range = this.data.feedbackSelectionRanges[field] || {};
    const cursor = range.start == null ? (feedbackListCursors[field] == null ? String(feedbackForm[field] || '').length : feedbackListCursors[field]) : range.start;
    const selectionEnd = range.end == null ? cursor : range.end;
    if (style === 'number' || style === 'bullet') {
      const next = feedbackInsertListMarker(feedbackForm[field], cursor, style, selectionEnd);
      feedbackForm[field] = next.value;
      feedbackListCursors[field] = next.cursor;
    }
    const feedbackSelectionRanges = {
      ...this.data.feedbackSelectionRanges,
      [field]: { start: feedbackListCursors[field] || 0, end: feedbackListCursors[field] || 0 }
    };
    this.setData({
      feedbackListStyle: style,
      feedbackFocusedField: field,
      feedbackForm,
      feedbackListCursors,
      feedbackSelectionRanges,
      feedbackCounts: feedbackCountsOf(feedbackForm)
    });
  },

  editFeedback() {
    this.setData({ feedbackEditing: true, feedbackFocusedField: '' });
  },

  async saveFeedback() {
    const selectedClass = this.data.selectedClass;
    if (!selectedClass || this.data.savingFeedback) return;
    const practicedToday = String(this.data.feedbackForm.practicedToday || '').trim();
    const knowledgePoint = String(this.data.feedbackForm.knowledgePoint || '').trim();
    const nextTraining = String(this.data.feedbackForm.nextTraining || '').trim();
    if (!practicedToday) {
      wx.showToast({ title: '请填写今天练习了', icon: 'none' });
      return;
    }
    if (!nextTraining) {
      wx.showToast({ title: '请填写下次练习', icon: 'none' });
      return;
    }
    const currentFeedback = findFeedbackByScheduleId(this.data.feedbacks, selectedClass.id);
    const feedbackScope = feedbackScopeForSchedule(selectedClass);
    this.setData({ savingFeedback: true });
    try {
      const savedFeedback = await saveCoachFeedback({
        id: currentFeedback ? currentFeedback.id : '',
        scheduleId: selectedClass.id,
        classId: selectedClass.classId || '',
        feedbackScope: feedbackScope,
        studentId: feedbackScope === 'student' && selectedClass.studentIds && selectedClass.studentIds[0] ? selectedClass.studentIds[0] : '',
        studentIds: selectedClass.studentIds || [],
        studentName: selectedClass.student,
        coach: currentCoachName(),
        startTime: selectedClass.startTime,
        campus: selectedClass.campus || '',
        venue: selectedClass.venue || selectedClass.loc || '',
        courseType: selectedClass.type || selectedClass.title || '',
        lessonCount: selectedClass.lessonCount || 1,
        isTrial: !!selectedClass.isTrial,
        practicedToday,
        knowledgePoint,
        nextTraining
      });
      wx.showToast({ title: '反馈已保存', icon: 'success' });
      this.applyFeedbackPatch(selectedClass, savedFeedback);
      this.closeFeedback();
    } catch (err) {
      wx.showToast({ title: err.message || '保存失败', icon: 'none' });
    } finally {
      this.setData({ savingFeedback: false });
    }
  },

  applyFeedbackPatch(selectedClass, savedFeedback) {
    const feedback = savedFeedback || {};
    const feedbacks = (this.data.feedbacks || []).filter(item => String(item.id) !== String(feedback.id));
    const nextFeedbacks = feedback.id ? feedbacks.concat(feedback) : feedbacks;
    const schedule = (this.data.schedule || []).map(item => String(item.id) === String(selectedClass.id)
      ? { ...item, hasFeedback: true, feedbackPending: false }
      : item);
    this.setData({
      feedbacks: nextFeedbacks,
      schedule
    }, () => this.renderWeek());
  },

  applyProposalPatch(selectedClass, savedProposal) {
    const proposal = savedProposal || {};
    const coachProposals = (this.data.coachProposals || []).filter(item => String(item.id) !== String(proposal.id));
    const nextProposals = proposal.id ? coachProposals.concat(proposal) : coachProposals;
    this.setData({
      coachProposals: nextProposals,
      selectedClassDetail: buildDetailData(selectedClass, {
        students: this.data.studentsRaw,
        classes: this.data.classesRaw,
        entitlements: this.data.entitlementsRaw,
        entitlementLedger: this.data.entitlementLedgerRaw,
        feedbacks: this.data.feedbacks,
        coachProposals: nextProposals,
        coachName: currentCoachName()
      })
    }, () => this.renderWeek());
  },

  openPoster() {
    this.setData({
      showFeedback: false,
      showPoster: true,
      feedbackSheetClass: '',
      posterSheetClass: 'sheet-show',
      posterDate: posterDateText(this.data.selectedClass || {}),
      posterTemplateKey: this.data.posterTemplateKey || 'blueGreenDiagonal',
      posterPreserveListMarkers: true,
      posterListStyle: 'preserve',
      posterPreviewImage: ''
    });
    setTimeout(() => this.renderFeedbackPosterCanvas(), 80);
  },

  closePoster() {
    this.setData({
      showPoster: false,
      showFeedback: true,
      posterSheetClass: '',
      feedbackSheetClass: 'sheet-show',
      posterPreviewImage: ''
    });
  },

  selectPosterStyle(event) {
    const key = event.currentTarget.dataset.key || 'blueGreenDiagonal';
    const tpl = FEEDBACK_POSTER_TEMPLATES[key] || FEEDBACK_POSTER_TEMPLATES.blueGreenDiagonal;
    this.setData({ posterTemplateKey: key, posterStyle: tpl.name });
    this.renderFeedbackPosterCanvas();
  },

  renderFeedbackPosterCanvas() {
    const query = wx.createSelectorQuery().in(this);
    query.select('#feedbackPosterCanvas').fields({ node: true, size: true }).exec((res) => {
      const canvas = res && res[0] && res[0].node;
      if (!canvas) return;
      const layout = drawFeedbackPoster(
        canvas,
        feedbackPosterDataForMini(this.data.selectedClass || {}, this.data.feedbackForm || {}, this.data.posterPreserveListMarkers, this.data.posterListStyle || 'preserve'),
        this.data.posterTemplateKey || 'blueGreenDiagonal'
      );
      this.setData({
        posterCanvasHeightRpx: Math.round((layout.canvasHeight / 750) * 560)
      });
      this.updatePosterPreview();
    });
  },

  updatePosterPreview() {
    this.createPosterTempFile((path) => {
      this.setData({ posterPreviewImage: path });
    }, { silent: true });
  },

  createPosterTempFile(callback, options = {}) {
    const query = wx.createSelectorQuery().in(this);
    query.select('#feedbackPosterCanvas').fields({ node: true, size: true }).exec((res) => {
      const canvas = res && res[0] && res[0].node;
      if (!canvas) {
        if (!options.silent) wx.showToast({ title: '海报生成失败', icon: 'none' });
        return;
      }
      wx.canvasToTempFilePath({
        canvas,
        fileType: 'png',
        quality: 1,
        success: result => callback(result.tempFilePath),
        fail: () => {
          if (!options.silent) wx.showToast({ title: '海报生成失败', icon: 'none' });
        }
      });
    });
  },

  savePosterToAlbum() {
    this.createPosterTempFile((path) => {
      wx.saveImageToPhotosAlbum({
        filePath: path,
        success: () => wx.showToast({ title: '已保存', icon: 'success' }),
        fail: () => wx.showToast({ title: '保存失败，请检查相册权限', icon: 'none' })
      });
    });
  },

  sharePoster() {
    this.createPosterTempFile((path) => {
      if (wx.showShareImageMenu) {
        wx.showShareImageMenu({
          path,
          fail: () => wx.showToast({ title: '分享失败', icon: 'none' })
        });
        return;
      }
      wx.showToast({ title: '当前微信版本不支持直接发送', icon: 'none' });
    });
  },

  stopMove() {}
});
