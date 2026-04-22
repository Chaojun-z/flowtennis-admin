const { loginWithWechat, loadCoachWorkbench, saveCoachFeedback, USER_KEY } = require('../../utils/api');
const { buildWeekDays, formatScheduleItem, weekRangeText, buildTimetableDays, classBlockStyle, workbenchTodoState } = require('../../utils/schedule');

const timetableHours = Array.from({ length: 16 }, (_, i) => `${String(i + 7).padStart(2, '0')}:00`);
const avatarClasses = ['avatar-warm', 'avatar-teal', 'avatar-green', 'avatar-purple'];
const TIMETABLE_START_HOUR = 7;
const TIMETABLE_HOUR_HEIGHT_RPX = 150;
const TIMETABLE_DAY_WIDTH_RPX = 240;

function coachDisplayName(name = '') {
  const trimmed = String(name || '').trim();
  if (!trimmed) return '王教练';
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
  if (/小班/.test(text)) return { text, className: 'is-group' };
  return { text, className: 'is-private' };
}

function statusClass(item) {
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
    headClass: item.isToday ? 'tt-day-head-active' : '',
    columnClass: item.isToday ? 'tt-day-column-active' : ''
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
  if (todayCount > 0) items.push({ label: '今日', value: `${todayCount} 节`, itemClass: '' });
  if (nextClass) items.push({ label: '下一节', value: `${nextClass.timeText} · ${nextClass.locationText}`, itemClass: '' });
  if (todoCount > 0) items.push({ label: '本周待办', value: `${todoCount} 节`, itemClass: '' });
  if (pendingCount > 0) items.push({ label: '待反馈', value: `${pendingCount} 节`, itemClass: 'is-danger' });
  return items;
}

function buildWeekTodoCards(groups = []) {
  return groups.flatMap((group) => {
    const [weekdayText = '', dateText = ''] = String(group.label || '').split(' ');
    return (group.items || []).map((item) => ({
      ...item,
      weekdayText,
      dateText,
      courseTagText: dashboardCourseTag(item).text,
      courseTagClass: dashboardCourseTag(item).className,
      showFeedbackAction: item.todoLabel === '待反馈'
    }));
  });
}

function studentIdsOf(item = {}) {
  return Array.isArray(item.studentIds) ? item.studentIds.filter(Boolean) : [];
}

function currentCoachName() {
  const user = wx.getStorageSync(USER_KEY) || {};
  return String(user.coachName || user.name || '').trim();
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

function buildStudentCards(students = [], classes = [], schedule = [], coachName = '') {
  return (students || []).map((student, index) => {
    const relatedClasses = (classes || []).filter(item => studentIdsOf(item).includes(student.id));
    const relatedSchedule = (schedule || []).filter(item => {
      const ids = studentIdsOf(item);
      return ids.includes(student.id) || (!ids.length && String(item.studentName || '').trim() === String(student.name || '').trim());
    });
    const activeClass = relatedClasses.find(item => String(item.status || '') !== '已结束' && String(item.status || '') !== '已取消') || relatedClasses[0] || null;
    const validSchedule = relatedSchedule.filter(item => String(item.status || '') !== '已取消');
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
      cumulative: validSchedule.length,
      packageText: totalLessons ? `${usedLessons}/${totalLessons}` : '',
      showPackage: !!totalLessons,
      lastClassText: formatMonthDay(lastClass && lastClass.startTime),
      showLastClass: !!lastClass
    };
  }).sort((a, b) => {
    if (a.type !== b.type) return a.type === '负责学员' ? -1 : 1;
    return a.name.localeCompare(b.name, 'zh-Hans-CN');
  });
}

function classStatusMeta(status = '') {
  if (status === '已结束' || status === '已结课') return { label: '已结束', className: 'tag-gray' };
  if (status === '已取消') return { label: '已取消', className: 'tag-gray' };
  return { label: '进行中', className: 'tag-green' };
}

function buildShiftCards(classes = [], students = []) {
  const studentMap = new Map((students || []).map(item => [String(item.id), item.name || item.id]));
  return (classes || []).map((item) => {
    const statusMeta = classStatusMeta(item.status);
    const names = studentIdsOf(item).map(id => studentMap.get(String(id)) || id).filter(Boolean);
    return {
      id: item.id,
      name: item.className || item.classNo || '未命名班次',
      student: names.join('、') || '暂无学员',
      progress: `${parseInt(item.usedLessons, 10) || 0} / ${parseInt(item.totalLessons, 10) || 0}`,
      status: statusMeta.label,
      statusClass: statusMeta.className
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
  const totalLessons = shifts.reduce((sum, item) => sum + (parseInt(String(item.progress).split('/')[1], 10) || 0), 0);
  const usedLessons = shifts.reduce((sum, item) => sum + (parseInt(String(item.progress).split('/')[0], 10) || 0), 0);
  return { totalCount, activeCount, totalLessons, usedLessons, remainingLessons: Math.max(0, totalLessons - usedLessons) };
}

function findFeedbackByScheduleId(feedbacks = [], scheduleId = '') {
  return (feedbacks || []).find(item => String(item.scheduleId) === String(scheduleId)) || null;
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
    || students.find(item => String(item.name || '').trim() === String(selectedClass.student || '').trim())
    || null;
  const linkedClass = classes.find(item => studentIdsOf(item).some(id => studentIds.includes(id)))
    || null;
  const currentFeedback = findFeedbackByScheduleId(feedbacks, selectedClass.id);
  const studentFeedbacks = feedbacks
    .filter(item => String(item.studentId || '') === String(student && student.id || '')
      || (Array.isArray(item.studentIds) && Array.isArray(studentIds) && item.studentIds.some(id => studentIds.includes(id))))
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
  const studentRemark = buildNoticeField(firstNonEmpty(
    student && student.remark,
    student && student.studentRemark,
    student && student.note,
    student && student.notes
  ), true);
  const historyIssue = buildNoticeField(firstNonEmpty(
    student && student.historyIssue,
    student && student.issueHistory,
    student && student.issueNote,
    student && student.healthNote
  ));
  const focusNote = buildNoticeField(firstNonEmpty(
    currentFeedback && currentFeedback.sessionFocus,
    currentFeedback && currentFeedback.coachFocus,
    currentFeedback && currentFeedback.coachNote,
    student && student.sessionFocus,
    student && student.focusNote
  ));
  const feedbackSummary = buildNoticeField(firstNonEmpty(
    currentFeedback && currentFeedback.summary,
    currentFeedback && currentFeedback.practicedToday
  ), true);
  const previousFeedbackSummary = buildNoticeField(firstNonEmpty(
    previousFeedback && previousFeedback.summary,
    previousFeedback && previousFeedback.practicedToday
  ), true);
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
    notices: {
      studentRemark,
      historyIssue,
      focusNote
    },
    feedback: {
      consumedLessons,
      remainingLessons,
      summary: feedbackSummary,
      history: previousFeedbackSummary
    }
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
  return Math.max(0, Math.round(rpxToPx(todayIndex * TIMETABLE_DAY_WIDTH_RPX) - 60));
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
    coachDisplayName: '王教练',
    days: [],
    timetableDays: [],
    timetableHours,
    timetableScrollTop: 0,
    timetableScrollLeft: 0,
    currentTimeText: '',
    timetableNowLineStyle: '',
    schedule: [],
    feedbacks: [],
    studentsRaw: [],
    classesRaw: [],
    visibleClasses: [],
    dashboardClasses: [],
    weekTodoGroups: [],
    weekTodoCards: [],
    reminderItems: [],
    studentsList: [],
    studentStats: { visibleCount: 0, ownerCount: 0 },
    shiftsList: [],
    shiftStats: { totalCount: 0, activeCount: 0, totalLessons: 0, usedLessons: 0, remainingLessons: 0 },
    feedbackForm: { practicedToday: '' },
    savingFeedback: false,
    stats: { month: 0, week: 0, today: 0, feedback: 0, pending: 0, conversion: '0%', nextTime: '暂无', nextText: '暂无', todo: 0 },
    selectedClass: null,
    selectedClassDetail: null,
    showDetail: false,
    showFeedback: false,
    showPoster: false,
    detailSheetClass: '',
    feedbackSheetClass: '',
    dashboardTabClass: 'active',
    timetableTabClass: '',
    studentsTabClass: '',
    shiftsTabClass: '',
    posterStyle: '蓝绿对角',
    posterStyles: ['蓝绿对角', '极简墨绿', '对角球场', '线框蓝图', '极简白框', '活力绿']
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
      await loginWithWechat();
      const data = await loadCoachWorkbench();
    const coachName = currentCoachName();
      const displayName = coachDisplayName(coachName);
      const now = new Date();
      const schedule = adaptSchedule(data.schedule || [], data.feedbacks || []);
      const studentsList = buildStudentCards(data.students || [], data.classes || [], schedule, coachName);
      const shiftsList = buildShiftCards(data.classes || [], data.students || []);
      this.setData({
        schedule,
        feedbacks: data.feedbacks || [],
        studentsRaw: data.students || [],
        classesRaw: data.classes || [],
        studentsList,
        studentStats: buildStudentStats(data.students || [], coachName),
        shiftsList,
        shiftStats: buildShiftStats(shiftsList),
        coachGreeting: coachGreeting(now),
        coachDisplayName: displayName,
        loading: false,
        hasLoaded: true
      });
      this.renderWeek();
    } catch (err) {
      this.setData({ loading: false, hasLoaded: true, error: err.message || '请先进入完整教练端登录并绑定微信' });
    } finally {
      if (options.stopPullDown) wx.stopPullDownRefresh();
    }
  },

  renderWeek() {
    const { weekOffset, schedule } = this.data;
    const now = new Date();
    const days = buildWeekDays(schedule, weekOffset);
    const visibleClasses = days.reduce((all, day) => all.concat(day.items.map(item => ({ ...item, dayKey: day.key }))), []);
    const today = days.find(day => day.isToday);
    const dashboardClasses = today ? today.items.map(item => decorateWorkbenchClass(item, now)) : [];
    const weekTodoGroups = buildWeekTodoGroups(days, now);
    const weekTodoCards = buildWeekTodoCards(weekTodoGroups);
    const todoItems = weekTodoGroups.reduce((all, day) => all.concat(day.items), []);
    const pending = todoItems.filter(item => item.todoLabel === '待反馈').length;
    const nextClass = visibleClasses
      .filter(item => {
        const state = workbenchTodoState(item, now);
        return state && state.label === '待上课';
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
      todayLabel: today ? today.label.replace(' ', '　') : '',
      isCurrentWeek,
      days,
      timetableDays: decoratedTimetableDays,
      timetableScrollTop: timetableScrollTop(now, isCurrentWeek),
      timetableScrollLeft: timetableScrollLeft(decoratedTimetableDays, isCurrentWeek),
      currentTimeText: currentTimeMarker(now),
      timetableNowLineStyle: timetableNowLineStyle(now),
      visibleClasses,
      dashboardClasses,
      weekTodoGroups,
      weekTodoCards,
      reminderItems,
      stats: {
        month: schedule.length,
        week: visibleClasses.length,
        today: todayCount,
        feedback: visibleClasses.filter(item => item.hasFeedback).length,
        pending,
        conversion: '0%',
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
    });
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
      detailSheetClass: 'sheet-show'
    });
  },

  closeSheets() {
    this.setData({
      showDetail: false,
      showFeedback: false,
      showPoster: false,
      detailSheetClass: '',
      feedbackSheetClass: '',
      feedbackForm: { practicedToday: '' },
      selectedClassDetail: null
    });
  },

  openFeedback() {
    if (!this.data.selectedClass) return;
    const currentFeedback = findFeedbackByScheduleId(this.data.feedbacks, this.data.selectedClass.id);
    this.setData({
      showDetail: false,
      showFeedback: true,
      detailSheetClass: '',
      feedbackSheetClass: 'sheet-show',
      feedbackForm: {
        practicedToday: currentFeedback ? (currentFeedback.practicedToday || '') : ''
      }
    });
  },

  openFeedbackById(event) {
    const id = event.currentTarget.dataset.id;
    if (!id) return;
    const selectedClass = this.data.schedule.find(item => String(item.id) === String(id));
    if (selectedClass) {
      const currentFeedback = findFeedbackByScheduleId(this.data.feedbacks, selectedClass.id);
      this.setData({
        selectedClass,
        showDetail: false,
        showFeedback: true,
        detailSheetClass: '',
        feedbackSheetClass: 'sheet-show',
        feedbackForm: {
          practicedToday: currentFeedback ? (currentFeedback.practicedToday || '') : ''
        }
      });
    }
  },

  onFeedbackInput(event) {
    this.setData({
      feedbackForm: {
        ...this.data.feedbackForm,
        practicedToday: event.detail.value
      }
    });
  },

  async saveFeedback() {
    const selectedClass = this.data.selectedClass;
    if (!selectedClass || this.data.savingFeedback) return;
    const practicedToday = String(this.data.feedbackForm.practicedToday || '').trim();
    if (!practicedToday) {
      wx.showToast({ title: '请填写今天练习了', icon: 'none' });
      return;
    }
    const currentFeedback = findFeedbackByScheduleId(this.data.feedbacks, selectedClass.id);
    this.setData({ savingFeedback: true });
    try {
      await saveCoachFeedback({
        id: currentFeedback ? currentFeedback.id : '',
        scheduleId: selectedClass.id,
        studentId: selectedClass.studentIds && selectedClass.studentIds[0] ? selectedClass.studentIds[0] : '',
        studentIds: selectedClass.studentIds || [],
        studentName: selectedClass.student,
        coach: currentCoachName(),
        startTime: selectedClass.startTime,
        campus: selectedClass.campus || '',
        venue: selectedClass.venue || selectedClass.loc || '',
        lessonCount: selectedClass.lessonCount || 1,
        isTrial: !!selectedClass.isTrial,
        practicedToday
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
    this.setData({ showPoster: true });
  },

  closePoster() {
    this.setData({ showPoster: false });
  },

  selectPosterStyle(event) {
    this.setData({ posterStyle: event.currentTarget.dataset.style });
  },

  stopMove() {},

  openWebview() {
    wx.navigateTo({ url: '/pages/webview/webview' });
  }
});
