const { loginWithWechat, loadCoachWorkbench, saveCoachFeedback, TOKEN_KEY, USER_KEY } = require('../../utils/api');
const { buildWeekDays, formatScheduleItem, weekRangeText, buildTimetableDays, classBlockStyle, workbenchTodoState } = require('../../utils/schedule');

const timetableHours = Array.from({ length: 25 }, (_, i) => `${String(i).padStart(2, '0')}:00`);
const avatarClasses = ['avatar-warm', 'avatar-teal', 'avatar-green', 'avatar-purple'];
const TIMETABLE_START_HOUR = 0;
const TIMETABLE_HOUR_HEIGHT_RPX = 150;
const TIMETABLE_DAY_WIDTH_RPX = 228;

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

function timetableCourseTag(item = {}) {
  const text = item.type || item.title || '课程';
  if (item.isTrial || /体验/.test(text)) return { text: '体验', className: 'is-trial' };
  if (/陪打|小班/.test(text)) return { text: '陪打', className: 'is-play' };
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
  return days.map((item) => ({
    ...item,
    displayDate: item.isToday ? String(item.date || '').replace('日', '').replace(/^0/, '') : item.date,
    headClass: item.isToday ? 'tt-day-head-active' : '',
    columnClass: item.isToday ? 'tt-day-column-active' : '',
    items: (item.items || []).map((course) => {
      const tag = timetableCourseTag(course);
      const todo = workbenchTodoState(course);
      return {
        ...course,
        courseTagText: tag.text,
        courseTagClass: tag.className,
        accentClass: timetableAccentClass(tag.className),
        todoLabel: todo ? todo.label : ''
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

function buildWeekTodoGroups(days = [], now = new Date()) {
  return days
    .map(day => ({
      ...day,
      items: (day.items || [])
        .map(item => {
          const state = workbenchTodoState(item, now);
          if (!state) return null;
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
    const [weekdayText = '', dateText = ''] = String(group.label || '').split(' ');
    return (group.items || []).map((item) => ({
      ...item,
      weekdayText,
      dateText,
      metaText: `${item.shortLocation || item.locationText || ''} | ${item.student || item.studentText || ''}`,
      courseTagText: dashboardCourseTag(item).text,
      courseTagClass: dashboardCourseTag(item).className,
      showFeedbackAction: item.todoLabel === '待反馈'
    }));
  });
}

function studentIdsOf(item = {}) {
  return Array.isArray(item.studentIds) ? item.studentIds.filter(Boolean) : [];
}

function lessonUnitsText(value) {
  const n = Number(value) || 0;
  return Number.isInteger(n) ? String(n) : String(Math.round(n * 10) / 10);
}

function scheduleLessonUnits(item = {}) {
  const count = Number(item.lessonCount);
  if (Number.isFinite(count) && count > 0) return count;
  const start = parseLocalDate(item.startTime);
  const end = parseLocalDate(item.endTime);
  if (start && end && end > start) return Math.max(0, (end - start) / 3600000);
  return 1;
}

function localDateKey(value) {
  const date = value instanceof Date ? value : parseLocalDate(value);
  if (!date) return String(value || '').slice(0, 10);
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`;
}

function weekRangeKeys(now = new Date()) {
  const start = new Date(now);
  start.setHours(0, 0, 0, 0);
  const day = start.getDay() || 7;
  start.setDate(start.getDate() - day + 1);
  const end = new Date(start);
  end.setDate(end.getDate() + 6);
  return { startKey: localDateKey(start), endKey: localDateKey(end) };
}

function scheduleEnded(item = {}, now = new Date()) {
  const status = String(item.status || item.statusText || '').trim();
  if (status === '已取消') return false;
  if (status === '已结束' || status === '已下课') return true;
  const end = parseLocalDate(item.endTime);
  return !!(end && end < now);
}

function scheduleHasFeedback(item = {}, feedbacks = []) {
  if (item.hasFeedback || item.feedbackId || item.feedbackStatus === '已反馈') return true;
  const scheduleId = String(item.id || '').trim();
  return !!(scheduleId && (feedbacks || []).some(feedback => String(feedback.scheduleId || '').trim() === scheduleId));
}

function buildLocalWorkbenchStats(schedule = [], feedbacks = [], now = new Date()) {
  const monthKey = localDateKey(now).slice(0, 7);
  const dayKey = localDateKey(now);
  const { startKey, endKey } = weekRangeKeys(now);
  const endedRows = (schedule || []).filter(item => scheduleEnded(item, now));
  const monthRows = endedRows.filter(item => localDateKey(item.startTime).slice(0, 7) === monthKey);
  const weekRows = endedRows.filter(item => {
    const key = localDateKey(item.startTime);
    return key >= startKey && key <= endKey;
  });
  const todayRows = endedRows.filter(item => localDateKey(item.startTime) === dayKey);
  const monthTrialRows = monthRows.filter(item => item.isTrial || /体验/.test(String(item.type || item.title || item.courseType || '')));
  return {
    monthFinishedLessonUnits: monthRows.reduce((sum, item) => sum + scheduleLessonUnits(item), 0),
    weekFinishedLessonUnits: weekRows.reduce((sum, item) => sum + scheduleLessonUnits(item), 0),
    todayFinishedLessonUnits: todayRows.reduce((sum, item) => sum + scheduleLessonUnits(item), 0),
    monthFeedbackCount: monthRows.filter(item => scheduleHasFeedback(item, feedbacks)).length,
    pendingFeedbackCount: endedRows.filter(item => !scheduleHasFeedback(item, feedbacks)).length,
    monthTrialLessonCount: monthTrialRows.length
  };
}

function mergeWorkbenchStats(backendStats = {}, localStats = {}) {
  const backendHasValue = ['monthFinishedLessonUnits', 'weekFinishedLessonUnits', 'todayFinishedLessonUnits', 'monthFeedbackCount', 'pendingFeedbackCount', 'monthTrialLessonCount']
    .some(key => Number(backendStats[key]) > 0);
  if (backendHasValue) return backendStats;
  return { ...backendStats, ...localStats };
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
  if (!/不是教练账号/.test(message)) return false;
  wx.removeStorageSync(TOKEN_KEY);
  wx.removeStorageSync(USER_KEY);
  wx.showToast({ title: message, icon: 'none' });
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

function formatDateInputValue(value) {
  const date = value ? parseLocalDate(value) : new Date();
  const safeDate = date || new Date();
  return `${safeDate.getFullYear()}-${String(safeDate.getMonth() + 1).padStart(2, '0')}-${String(safeDate.getDate()).padStart(2, '0')}`;
}

function normalizeTimeValue(value = '') {
  const [hour = '00', minute = '00'] = String(value || '').split(':');
  return `${String(hour).padStart(2, '0')}:${String(minute).padStart(2, '0')}`;
}

function extractTimeRange(text = '') {
  const matched = String(text || '').match(/(\d{1,2}:\d{2})\s*-\s*(\d{1,2}:\d{2})/);
  if (!matched) return { startTime: '14:00', endTime: '16:00' };
  return { startTime: normalizeTimeValue(matched[1]), endTime: normalizeTimeValue(matched[2]) };
}

function normalizeCampusOptions(campuses = [], fallbackCampus = '') {
  const options = (campuses || []).map((item) => {
    const label = firstNonEmpty(item.name, item.campusName, item.label, item.code, item.id);
    if (!label) return null;
    return {
      id: item.id || label,
      name: label
    };
  }).filter(Boolean);
  if (fallbackCampus && !options.some(item => item.name === fallbackCampus)) {
    options.unshift({ id: fallbackCampus, name: fallbackCampus });
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

function buildStudentCards(students = [], classes = [], schedule = [], coachName = '') {
  return (students || []).map((student, index) => {
    const relatedClasses = (classes || []).filter(item => studentIdsOf(item).includes(student.id));
    const relatedSchedule = (schedule || []).filter(item => {
      const ids = studentIdsOf(item);
      return ids.includes(student.id) || (!ids.length && String(item.studentName || '').trim() === String(student.name || '').trim());
    });
    const activeClass = relatedClasses.find(item => String(item.status || '') !== '已结束' && String(item.status || '') !== '已取消') || relatedClasses[0] || null;
    const validSchedule = relatedSchedule.filter(item => String(item.status || '') !== '已取消');
    const lessonUnitsCompleted = student.lessonUnitsCompleted != null
      ? Number(student.lessonUnitsCompleted) || 0
      : validSchedule
        .filter(item => String(item.status || '') === '已结束' || String(item.status || '') === '已下课')
        .reduce((sum, item) => sum + scheduleLessonUnits(item), 0);
    const lastClass = validSchedule
      .slice()
      .sort((a, b) => String(b.startTime || '').localeCompare(String(a.startTime || '')))[0] || null;
    const totalLessons = parseInt(activeClass && activeClass.totalLessons, 10) || 0;
    const usedLessons = parseInt(activeClass && activeClass.usedLessons, 10) || 0;
    const isOwner = String(student.primaryCoach || '').trim() === coachName;
    return {
      id: student.id,
      name: student.name || '未命名学员',
      avatarText: avatarText(student.name),
      avatarClass: avatarClasses[index % avatarClasses.length],
      type: isOwner ? '负责学员' : '代课学员',
      tagClass: isOwner ? 'student-tag-owner' : 'student-tag-substitute',
      cumulative: lessonUnitsText(lessonUnitsCompleted),
      packageText: totalLessons ? `${usedLessons}/${totalLessons}` : '',
      showPackage: !!totalLessons,
      lastScheduleId: lastClass && lastClass.id,
      lastClassText: formatMonthDay(lastClass && lastClass.startTime),
      showLastClass: !!lastClass
    };
  }).sort((a, b) => {
    if (a.type !== b.type) return a.type === '负责学员' ? -1 : 1;
    return a.name.localeCompare(b.name, 'zh-Hans-CN');
  });
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
      campus: firstNonEmpty(item.campus) || '',
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

function buildStudentStats(students = [], coachName = '') {
  const visibleCount = students.length;
  const ownerCount = students.filter(item => String(item.primaryCoach || '').trim() === coachName).length;
  return { visibleCount, ownerCount };
}

function buildShiftStats(shifts = []) {
  const totalCount = shifts.length;
  const activeCount = shifts.filter(item => item.status === '进行中').length;
  const totalLessons = shifts.reduce((sum, item) => sum + (parseInt(item.totalLessons, 10) || 0), 0);
  const usedLessons = shifts.reduce((sum, item) => sum + (parseInt(item.usedLessons, 10) || 0), 0);
  return { totalCount, activeCount, totalLessons, usedLessons, remainingLessons: Math.max(0, totalLessons - usedLessons) };
}

function buildShiftScheduleForm(shift, linkedClass = null, campuses = []) {
  const fallbackCampus = firstNonEmpty(shift && shift.campus, linkedClass && linkedClass.campus);
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
  const fallbackCampus = firstNonEmpty(selectedClass && selectedClass.campus, linkedClass && linkedClass.campus);
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
      campus: firstNonEmpty(shift.campus, linkedClass && linkedClass.campus) || '暂无记录',
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

function feedbackFormFromRecord(feedback = null) {
  return {
    practicedToday: feedback ? (feedback.practicedToday || feedback.focus || feedback.performance || '') : '',
    knowledgePoint: feedback ? (feedback.knowledgePoint || feedback.problems || '') : '',
    nextTraining: feedback ? (feedback.nextTraining || feedback.nextAdvice || '') : ''
  };
}

function feedbackCountsOf(form = {}) {
  return {
    practicedToday: String(form.practicedToday || '').length,
    knowledgePoint: String(form.knowledgePoint || '').length,
    nextTraining: String(form.nextTraining || '').length
  };
}

function feedbackContextParts(item = {}) {
  return [
    item.student || item.studentText,
    [item.campus, item.venue || item.loc || item.locationText].filter(Boolean).join('·'),
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
  const feedbacks = Array.isArray(context.feedbacks) ? context.feedbacks : [];
  const coachName = String(context.coachName || '').trim();
  const studentIds = studentIdsOf(selectedClass);
  const student = students.find(item => studentIds.includes(item.id))
    || (!studentIds.length && students.find(item => String(item.name || '').trim() === String(selectedClass.student || '').trim()))
    || null;
  const linkedClass = classes.find(item => String(item.id || '') === String(selectedClass && selectedClass.classId || ''))
    || (!selectedClass.classId && classes.find(item => firstNonEmpty(item.className, item.classNo) === firstNonEmpty(selectedClass.className, selectedClass.classNo)))
    || null;
  const currentFeedback = findFeedbackByScheduleId(feedbacks, selectedClass.id);
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
  const consumedLessons = currentFeedback ? `${selectedClass.lessonCount || 1} 节` : '-';
  const remainingLessons = linkedClass && linkedClass.remainingLessons != null
    ? `${linkedClass.remainingLessons} 节`
    : (linkedClass && linkedClass.totalLessons != null && linkedClass.usedLessons != null
      ? `${Math.max(0, Number(linkedClass.totalLessons || 0) - Number(linkedClass.usedLessons || 0))} 节`
      : '-');
  const studentRemark = buildNoticeField(firstNonEmpty(student && student.remark), true);
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
    actionText: currentFeedback ? '查看反馈' : '填写反馈',
    basicInfo: {
      datetime: formatDetailDateTime(selectedClass),
      location: [selectedClass.campus, selectedClass.venue || selectedClass.loc || selectedClass.locationText].filter(Boolean).join('·') || '地点待确认',
      courseType: typeTag.text,
      courseTypeClass: typeTag.className === 'is-trial' ? 'detail-tag-trial' : 'detail-tag-private',
      status: statusTag.text,
      statusClass: statusTag.className,
      studentName: selectedClass.student || '学员待确认',
      coachName: firstNonEmpty(selectedClass.coach, coachName) || '待确认',
      coachNote: firstNonEmpty(student && student.primaryCoach, '未设置'),
      entitlementText: currentFeedback ? consumedLessons : '未扣课',
      entitlementSource: '来源: 排课表'
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
  const keywords = ['回合对打', '连续对打', '10 多拍', '10多拍', '非常了不起', '稳定', '进步', '节奏', '重心', '脚步', '发力', '引拍', '击球点'];
  const pattern = new RegExp(`(${keywords.map(posterEscapeRegExp).join('|')})`, 'g');
  String(text).split(pattern).filter(Boolean).forEach(part => groups.push({ text: part, highlight: keywords.includes(part) }));
}

function posterTextGroups(text) {
  const raw = String(text || '—');
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
    if (raw[i] === '*') {
      const end = raw.indexOf('*', i + 1);
      if (end > -1) {
        groups.push({ text: raw.slice(i + 1, end), highlight: true });
        i = end + 1;
        continue;
      }
    }
    let next = raw.length;
    const bracket = raw.indexOf('【', i + 1);
    const star = raw.indexOf('*', i + 1);
    if (bracket > -1) next = Math.min(next, bracket);
    if (star > -1) next = Math.min(next, star);
    posterPushAutoGroups(groups, raw.slice(i, next));
    i = next;
  }
  return groups.length ? groups : [{ text: '—', highlight: false }];
}

function posterContentFont(ctx, isHighlight) {
  ctx.font = `${isHighlight ? '600' : '400'} 30px -apple-system,BlinkMacSystemFont,"PingFang SC","Microsoft YaHei",sans-serif`;
}

function posterTextLines(ctx, text, maxWidth, maxLines) {
  const lines = [[]];
  posterTextGroups(text).forEach(group => {
    posterContentFont(ctx, group.highlight);
    Array.from(group.text || '').forEach(ch => {
      if (ch === '\n') {
        lines.push([]);
        return;
      }
      const width = ctx.measureText(ch).width;
      let line = lines[lines.length - 1];
      const lineWidth = line.reduce((sum, item) => sum + item.width, 0);
      if (line.length && lineWidth + width > maxWidth) {
        lines.push([]);
        line = lines[lines.length - 1];
      }
      line.push({ ch, highlight: group.highlight, width });
    });
  });
  let kept = lines.filter(line => line.length);
  if (!kept.length) kept = [[{ ch: '—', highlight: false, width: ctx.measureText('—').width }]];
  if (kept.length > maxLines) {
    kept = kept.slice(0, maxLines);
    const last = kept[kept.length - 1];
    posterContentFont(ctx, false);
    const dotsWidth = ctx.measureText('…').width;
    while (last.length && last.reduce((sum, item) => sum + item.width, 0) + dotsWidth > maxWidth) last.pop();
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
    return groups;
  });
}

function posterDrawTextBlock(ctx, tpl, label, text, x, y, w, maxLines) {
  ctx.font = '400 30px -apple-system,BlinkMacSystemFont,"PingFang SC","Microsoft YaHei",sans-serif';
  const lines = posterTextLines(ctx, text, w, maxLines);
  const paddingTop = 32;
  const paddingBottom = 54;
  const titleSpace = 52;
  const lineHeight = 48;
  const boxHeight = paddingTop + titleSpace + (lines.length > 0 ? lines.length - 1 : 0) * lineHeight + paddingBottom;
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
  lines.forEach((lineGroups, i) => {
    let currentX = x;
    lineGroups.forEach(group => {
      posterContentFont(ctx, group.highlight);
      ctx.fillStyle = group.highlight ? (tpl.highlight || tpl.accent) : tpl.ink;
      ctx.fillText(group.text, currentX, y + titleSpace + i * lineHeight);
      currentX += ctx.measureText(group.text).width;
    });
  });
  ctx.restore();
  return boxHeight + 28;
}

function drawFeedbackPoster(canvas, data, templateKey = 'blueGreenDiagonal') {
  const tpl = FEEDBACK_POSTER_TEMPLATES[templateKey] || FEEDBACK_POSTER_TEMPLATES.blueGreenDiagonal;
  const ctx = canvas.getContext('2d');
  canvas.width = 750;
  canvas.height = 1334;
  const grad = ctx.createLinearGradient(0, 0, 0, 1334);
  grad.addColorStop(0, tpl.bg1);
  grad.addColorStop(1, tpl.bg2);
  ctx.fillStyle = grad;
  ctx.fillRect(0, 0, 750, 1334);
  ctx.save();
  if (tpl.type === 'diagonalSplit') {
    ctx.fillStyle = tpl.accent;
    ctx.beginPath();
    ctx.moveTo(0, 950);
    ctx.lineTo(750, 1100);
    ctx.lineTo(750, 1334);
    ctx.lineTo(0, 1334);
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
    ctx.moveTo(0, 1334);
    ctx.lineTo(750, 1334);
    ctx.lineTo(750, 450);
    ctx.lineTo(0, 950);
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
      ctx.lineTo(i, 1334);
      ctx.stroke();
    }
    for (let i = 0; i < 1334; i += 40) {
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
  ctx.fillStyle = tpl.nameColor || tpl.ink;
  ctx.font = '900 68px -apple-system,BlinkMacSystemFont,"PingFang SC","Microsoft YaHei",sans-serif';
  ctx.fillText(nameStr, 60, 140);
  const nameWidth = ctx.measureText(nameStr).width;
  ctx.fillStyle = tpl.subColor || tpl.muted;
  ctx.font = '600 32px -apple-system,BlinkMacSystemFont,"PingFang SC",sans-serif';
  ctx.fillText('训练反馈', Math.min(60 + nameWidth + 16, 560), 140);
  ctx.fillStyle = tpl.type === 'cleanSilhouette' ? (tpl.subColor || tpl.muted) : tpl.accent;
  ctx.font = '700 26px -apple-system,BlinkMacSystemFont,"PingFang SC",sans-serif';
  ctx.fillText(`上课日期：${posterDisplayDate(data.date)}`, 60, 195);
  if (!['sport', 'diagonalSplit', 'split'].includes(tpl.type)) {
    ctx.fillStyle = tpl.subColor || tpl.muted;
    ctx.globalAlpha = 0.3;
    ctx.fillRect(60, 235, 630, 2);
    ctx.globalAlpha = 1;
  }
  let currentY = 320;
  const contentWidth = 570;
  currentY += posterDrawTextBlock(ctx, tpl, '今天练习了', data.practicedToday, 90, currentY, contentWidth, 4);
  currentY += posterDrawTextBlock(ctx, tpl, '练习情况', data.knowledgePoint, 90, currentY, contentWidth, 5);
  posterDrawTextBlock(ctx, tpl, '下次练习', data.nextTraining, 90, currentY, contentWidth, 4);
  ctx.fillStyle = tpl.nameColor || tpl.ink;
  ctx.font = '900 34px -apple-system,BlinkMacSystemFont,"PingFang SC","Microsoft YaHei",sans-serif';
  ctx.fillText('网球兄弟', 60, 1235);
  ctx.fillStyle = tpl.subColor || tpl.muted;
  ctx.font = '500 18px -apple-system,BlinkMacSystemFont,"PingFang SC",sans-serif';
  ctx.fillText('用网球向生活发出邀请', 60, 1270);
  ctx.save();
  ctx.fillStyle = tpl.accent;
  if (tpl.type === 'sport') {
    ctx.beginPath();
    ctx.moveTo(630, 1270);
    ctx.lineTo(690, 1270);
    ctx.lineTo(670, 1240);
    ctx.fill();
  } else {
    ctx.beginPath();
    ctx.arc(670, 1260, 10, 0, Math.PI * 2);
    ctx.fill();
  }
  ctx.restore();
}

function feedbackPosterDataForMini(schedule = {}, form = {}) {
  const startText = String(schedule.startTime || '').slice(0, 10);
  return {
    studentName: schedule.student || schedule.studentText || '学员',
    date: startText || posterDateText(schedule),
    coach: schedule.coach || currentCoachName() || '教练',
    practicedToday: form.practicedToday || '—',
    knowledgePoint: form.knowledgePoint || '—',
    nextTraining: form.nextTraining || '—'
  };
}

function studentScheduleStatusMeta(item = {}) {
  if (String(item.status || '') === '已取消') return { text: '已取消', className: 'detail-tag-muted' };
  const end = parseLocalDate(item.endTime || item.startTime);
  if (end && end <= new Date()) return { text: '已结束', className: 'detail-tag-muted' };
  return { text: '待上课', className: 'detail-tag-success' };
}

function studentScheduleMeta(item = {}, linkedClass = null) {
  return [
    item.className || item.classNo || (linkedClass && (linkedClass.className || linkedClass.classNo)),
    item.venue || item.loc || item.locationText,
    item.lessonCount ? `共 ${item.lessonCount} 节` : ''
  ].filter(Boolean);
}

function buildStudentDetailData(student, context = {}) {
  if (!student) return null;
  const classes = Array.isArray(context.classes) ? context.classes : [];
  const schedule = Array.isArray(context.schedule) ? context.schedule : [];
  const coachName = String(context.coachName || '').trim();
  const relatedClasses = classes.filter(item => studentIdsOf(item).includes(student.id));
  const relatedSchedule = schedule.filter(item => {
    const ids = studentIdsOf(item);
    return ids.includes(student.id) || (!ids.length && String(item.student || item.studentName || '').trim() === String(student.name || '').trim());
  });
  const activeClass = relatedClasses.find(item => String(item.status || '') !== '已结束' && String(item.status || '') !== '已取消') || relatedClasses[0] || null;
  const validSchedule = relatedSchedule.filter(item => String(item.status || '') !== '已取消');
  const lessonUnitsCompleted = student.lessonUnitsCompleted != null
    ? Number(student.lessonUnitsCompleted) || 0
    : validSchedule
      .filter(item => String(item.status || '') === '已结束' || String(item.status || '') === '已下课')
      .reduce((sum, item) => sum + scheduleLessonUnits(item), 0);
  const now = new Date();
  const pastSchedule = validSchedule.filter(item => {
    const end = parseLocalDate(item.endTime || item.startTime);
    return end && end <= now;
  });
  const latestClass = pastSchedule
    .slice()
    .sort((a, b) => String(b.startTime || '').localeCompare(String(a.startTime || '')))[0] || null;
  const totalLessons = parseInt(activeClass && activeClass.totalLessons, 10) || 0;
  const usedLessons = parseInt(activeClass && activeClass.usedLessons, 10) || 0;
  const latestCourseTag = latestClass ? dashboardCourseTag(latestClass) : { text: '', className: '' };
  const latestStatus = latestClass ? studentScheduleStatusMeta(latestClass) : { text: '', className: '' };
  const ownerCoach = firstNonEmpty(student.ownerCoach, student.primaryCoach, activeClass && activeClass.coach);
  const responsibleCoach = firstNonEmpty(student.primaryCoach, activeClass && activeClass.coach, coachName);
  const campus = firstNonEmpty(student.campus, latestClass && latestClass.campus, activeClass && activeClass.campus);
  const remark = firstNonEmpty(student.remark);
  return {
    studentId: student.id,
    basic: {
      name: student.name || '未命名学员',
      phone: firstNonEmpty(student.phone) || '暂无记录',
      phoneEmpty: !firstNonEmpty(student.phone),
      type: firstNonEmpty(student.type) || '暂无记录',
      campus: campus || '暂无记录',
      campusEmpty: !campus
    },
    summary: {
      coach: responsibleCoach || '暂无记录',
      owner: ownerCoach || '未设置',
      className: firstNonEmpty(activeClass && activeClass.className, activeClass && activeClass.classNo) || '暂无记录',
      classEmpty: !activeClass,
      lastClass: latestClass ? formatStudentClassTime(latestClass) : '暂无记录',
      lastClassEmpty: !latestClass,
      cumulative: `${lessonUnitsText(lessonUnitsCompleted)} 节`,
      packageProgress: totalLessons ? `${usedLessons}/${totalLessons}` : '暂无记录',
      packageEmpty: !totalLessons
    },
    remark: {
      text: remark || '暂无记录',
      isEmpty: !remark
    },
    latest: latestClass ? {
      scheduleId: latestClass.id,
      time: formatStudentClassTime(latestClass),
      courseType: latestCourseTag.text,
      courseTypeClass: latestCourseTag.className === 'is-trial' ? 'detail-tag-trial' : 'detail-tag-private',
      status: latestStatus.text,
      statusClass: latestStatus.className,
      metaParts: studentScheduleMeta(latestClass, activeClass)
    } : null,
    hasLatest: !!latestClass
  };
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
  const minutes = ((now.getHours() - TIMETABLE_START_HOUR) * 60) + now.getMinutes();
  const top = Math.max(0, Math.round((minutes / 60) * TIMETABLE_HOUR_HEIGHT_RPX));
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
  const minutes = ((now.getHours() - TIMETABLE_START_HOUR) * 60) + now.getMinutes();
  const lineTopPx = rpxToPx(Math.max(0, (minutes / 60) * TIMETABLE_HOUR_HEIGHT_RPX));
  return Math.max(0, Math.round(lineTopPx - 260));
}

function timetableScrollLeft(days = [], isCurrentWeek = true) {
  if (!isCurrentWeek) return 0;
  const todayIndex = (days || []).findIndex(item => item.isToday);
  if (todayIndex < 0) return 0;
  return Math.max(0, Math.round(rpxToPx(todayIndex * TIMETABLE_DAY_WIDTH_RPX)));
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
    currentTimeText: '',
    timetableNowLineStyle: '',
    timetableNowSolidLineStyle: '',
    schedule: [],
    feedbacks: [],
    campusesRaw: [],
    studentsRaw: [],
    classesRaw: [],
    visibleClasses: [],
    dashboardClasses: [],
    weekTodoGroups: [],
    weekTodoCards: [],
    reminderItems: [],
    nextTravelReminder: false,
    coachWorkbenchStats: {},
    studentsList: [],
    studentStats: { visibleCount: 0, ownerCount: 0 },
    shiftsList: [],
    shiftStats: { totalCount: 0, activeCount: 0, totalLessons: 0, usedLessons: 0, remainingLessons: 0 },
    feedbackForm: feedbackFormFromRecord(),
    feedbackCounts: feedbackCountsOf(),
    feedbackHasSaved: false,
    feedbackEditing: false,
    feedbackFocusedField: '',
    feedbackContextParts: [],
    feedbackSheetScrollTop: 0,
    studentDetailScrollTop: 0,
    shiftDetailScrollTop: 0,
    shiftScheduleScrollTop: 0,
    cancelScheduleScrollTop: 0,
    posterDate: '',
    savingFeedback: false,
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
    showPoster: false,
    showStudentDetail: false,
    showShiftDetail: false,
    showShiftSchedule: false,
    showCancelSchedule: false,
    showCoachMenu: false,
    detailSheetClass: '',
    feedbackSheetClass: '',
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
    posterStyles: POSTER_STYLE_OPTIONS
  },

  onLoad() {
    this.load();
  },

  onShow() {
    if (this.data.hasLoaded) this.load({ keepLoading: true });
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
      const studentsList = buildStudentCards(data.students || [], data.classes || [], schedule, coachName);
      const shiftsList = buildShiftCards(data.classes || [], data.students || []);
      this.setData({
        schedule,
        coachWorkbenchStats: data.stats || {},
        feedbacks: data.feedbacks || [],
        campusesRaw: data.campuses || [],
        studentsRaw: data.students || [],
        classesRaw: data.classes || [],
        studentsList,
        studentStats: buildStudentStats(data.students || [], coachName),
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
    } catch (err) {
      if (handleCoachAuthError(err)) return;
      this.setData({ loading: false, hasLoaded: true, error: err.message || '请先确认账号已绑定微信后重试' });
    } finally {
      if (options.stopPullDown) wx.stopPullDownRefresh();
    }
  },

  renderWeek() {
    const { weekOffset, schedule, coachWorkbenchStats } = this.data;
    const now = new Date();
    const mergedStats = mergeWorkbenchStats(coachWorkbenchStats, buildLocalWorkbenchStats(schedule, this.data.feedbacks, now));
    const days = buildWeekDays(schedule, weekOffset);
    const visibleClasses = days.reduce((all, day) => all.concat(day.items.map(item => ({ ...item, dayKey: day.key }))), []);
    const today = days.find(day => day.isToday);
    const dashboardClasses = today ? today.items.map(item => decorateWorkbenchClass(item, now)).filter(item => item.status) : [];
    const weekTodoGroups = buildWeekTodoGroups(days, now);
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
    const decoratedTimetableDays = decorateTimetableDays(buildTimetableDays(visibleClasses, weekOffset));
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
        conversionText: Number(mergedStats.monthTrialLessonCount) > 0 ? String(mergedStats.trialConversionRate || 0) : '-',
        conversionUnit: Number(mergedStats.monthTrialLessonCount) > 0 ? '%' : '',
        nextTime: nextClass ? nextClass.timeText : '暂无',
        nextText: nextClass ? `${nextClass.timeText} · ${nextClass.locationText}` : '暂无',
        todo: todoItems.length
      }
    });
  },

  switchTab(event) {
    const activeTab = event.currentTarget.dataset.tab || 'timetable';
    this.setData({
      activeTab,
      isDashboard: activeTab === 'dashboard',
      isTimetable: activeTab === 'timetable',
      isStudents: activeTab === 'students',
      isShifts: activeTab === 'shifts',
      dashboardTabClass: activeTab === 'dashboard' ? 'active' : '',
      timetableTabClass: activeTab === 'timetable' ? 'active' : '',
      studentsTabClass: activeTab === 'students' ? 'active' : '',
      shiftsTabClass: activeTab === 'shifts' ? 'active' : ''
    }, () => {
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

  openDetail(event) {
    const id = event.currentTarget.dataset.id;
    if (!id) return;
    const selectedClass = this.data.schedule.find(item => String(item.id) === String(id));
    if (!selectedClass) return;
    this.setData({
      selectedClass,
      selectedClassDetail: buildDetailData(selectedClass, {
        students: this.data.studentsRaw,
        classes: this.data.classesRaw,
        feedbacks: this.data.feedbacks,
        coachName: currentCoachName()
      }),
      showDetail: true,
      showStudentDetail: false,
      studentDetailSheetClass: '',
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
      schedule: this.data.schedule,
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
      showPoster: false,
      showStudentDetail: false,
      showShiftDetail: false,
      detailSheetClass: '',
      feedbackSheetClass: '',
      posterSheetClass: '',
      studentDetailSheetClass: '',
      shiftDetailSheetClass: '',
      feedbackForm: feedbackFormFromRecord(),
      feedbackCounts: feedbackCountsOf(),
      feedbackHasSaved: false,
      feedbackEditing: false,
      feedbackFocusedField: '',
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

  openFeedback() {
    if (!this.data.selectedClass) return;
    const currentFeedback = findFeedbackByScheduleId(this.data.feedbacks, this.data.selectedClass.id);
    const feedbackForm = feedbackFormFromRecord(currentFeedback);
    this.setData({
      showDetail: false,
      showFeedback: true,
      detailSheetClass: '',
      feedbackSheetClass: 'sheet-show',
      feedbackForm,
      feedbackCounts: feedbackCountsOf(feedbackForm),
      feedbackHasSaved: !!currentFeedback,
      feedbackEditing: false,
      feedbackFocusedField: '',
      feedbackSheetScrollTop: 0,
      feedbackContextParts: feedbackContextParts(this.data.selectedClass)
    });
  },

  openFeedbackById(event) {
    const id = event.currentTarget.dataset.id;
    if (!id) return;
    const selectedClass = this.data.schedule.find(item => String(item.id) === String(id));
    if (selectedClass) {
      const currentFeedback = findFeedbackByScheduleId(this.data.feedbacks, selectedClass.id);
      const feedbackForm = feedbackFormFromRecord(currentFeedback);
      this.setData({
        selectedClass,
        selectedClassDetail: buildDetailData(selectedClass, {
          classes: this.data.classesRaw,
          students: this.data.studentsRaw,
          feedbacks: this.data.feedbacks,
          coachName: currentCoachName()
        }),
        showDetail: false,
        showFeedback: true,
        detailSheetClass: '',
        feedbackSheetClass: 'sheet-show',
        feedbackForm,
        feedbackCounts: feedbackCountsOf(feedbackForm),
        feedbackHasSaved: !!currentFeedback,
        feedbackEditing: false,
        feedbackFocusedField: '',
        feedbackSheetScrollTop: 0,
        feedbackContextParts: feedbackContextParts(selectedClass)
      });
    }
  },

  onFeedbackFocus(event) {
    this.setData({ feedbackFocusedField: event.currentTarget.dataset.field || '' });
  },

  onFeedbackBlur() {
    this.setData({ feedbackFocusedField: '' });
  },

  onFeedbackInput(event) {
    const field = event.currentTarget.dataset.field || 'practicedToday';
    const feedbackForm = {
      ...this.data.feedbackForm,
      [field]: event.detail.value
    };
    this.setData({
      feedbackForm,
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
      await saveCoachFeedback({
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
      this.closeSheets();
      await this.load({ keepLoading: true });
    } catch (err) {
      wx.showToast({ title: err.message || '保存失败', icon: 'none' });
    } finally {
      this.setData({ savingFeedback: false });
    }
  },

  openPoster() {
    this.setData({
      showFeedback: false,
      showPoster: true,
      feedbackSheetClass: '',
      posterSheetClass: 'sheet-show',
      posterDate: posterDateText(this.data.selectedClass || {}),
      posterTemplateKey: this.data.posterTemplateKey || 'blueGreenDiagonal'
    });
    setTimeout(() => this.renderFeedbackPosterCanvas(), 80);
  },

  closePoster() {
    this.setData({
      showPoster: false,
      showFeedback: true,
      posterSheetClass: '',
      feedbackSheetClass: 'sheet-show'
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
      drawFeedbackPoster(
        canvas,
        feedbackPosterDataForMini(this.data.selectedClass || {}, this.data.feedbackForm || {}),
        this.data.posterTemplateKey || 'blueGreenDiagonal'
      );
    });
  },

  createPosterTempFile(callback) {
    const query = wx.createSelectorQuery().in(this);
    query.select('#feedbackPosterCanvas').fields({ node: true, size: true }).exec((res) => {
      const canvas = res && res[0] && res[0].node;
      if (!canvas) {
        wx.showToast({ title: '海报生成失败', icon: 'none' });
        return;
      }
      wx.canvasToTempFilePath({
        canvas,
        fileType: 'png',
        quality: 1,
        success: result => callback(result.tempFilePath),
        fail: () => wx.showToast({ title: '海报生成失败', icon: 'none' })
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
