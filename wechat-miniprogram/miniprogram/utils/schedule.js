const WEEKDAYS = ['周日', '周一', '周二', '周三', '周四', '周五', '周六'];
const CAMPUS_DISPLAY = {
  mabao: '顺义马坡',
  shilipu: '朝阳十里堡',
  guowang: '朝阳国网',
  chaojun: '朝珺私教'
};

function parseDate(value) {
  if (!value) return null;
  const date = new Date(String(value).replace(' ', 'T'));
  return Number.isNaN(date.getTime()) ? null : date;
}

function pad(num) {
  return String(num).padStart(2, '0');
}

function dateKey(date) {
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}`;
}

function startOfWeek(date = new Date()) {
  const d = new Date(date.getFullYear(), date.getMonth(), date.getDate());
  const day = d.getDay() || 7;
  d.setDate(d.getDate() - day + 1);
  return d;
}

function addDays(date, days) {
  const d = new Date(date);
  d.setDate(d.getDate() + days);
  return d;
}

function timeText(item) {
  const start = parseDate(item.startTime);
  const end = parseDate(item.endTime);
  if (!start) return '时间待定';
  return `${pad(start.getHours())}:${pad(start.getMinutes())}${end ? ` - ${pad(end.getHours())}:${pad(end.getMinutes())}` : ''}`;
}

function campusDisplayName(raw = '') {
  const key = String(raw || '').trim();
  if (!key || key === '__external__') return '';
  return CAMPUS_DISPLAY[key] || key;
}

function scheduleLocationText(item = {}) {
  const locationType = String(item.locationType || '').trim();
  const campusCode = String(item.campus || '').trim();
  if (locationType === 'external' || campusCode === '__external__') {
    const venue = String(item.externalVenueName || '').trim() || String(item.venue || '').split(' · ')[0].trim();
    const court = String(item.externalCourtName || '').trim() || String(item.venue || '').split(' · ').slice(1).join(' · ').trim();
    return [venue, court].filter(Boolean).join(' · ') || '地点待确认';
  }
  const campus = String(item.campusName || '').trim() || campusDisplayName(campusCode);
  const venue = String(item.venue || item.externalCourtName || '').trim();
  return [campus, venue].filter(Boolean).join(' · ') || '地点待确认';
}

function formatScheduleItem(item) {
  const state = item.workbenchState && item.workbenchState.code ? item.workbenchState : null;
  const repeatTagText = item.scheduleSource === '循环排课' ? '循环' : '';
  return {
    ...item,
    timeText: timeText(item),
    title: item.courseType || item.className || '课程',
    studentText: item.studentName || '学员待确认',
    locationText: scheduleLocationText(item),
    statusText: state ? state.label : (item.status || '已排课'),
    repeatTagText,
    showRepeatTag: !!repeatTagText
  };
}

function hasScheduleFeedback(item = {}) {
  return !!(item.hasFeedback || item.feedbackId || item.feedbackAt || item.feedbackStatus === '已反馈');
}

function workbenchTodoState(item = {}, now = new Date()) {
  if (item.status === '已取消') return null;
  if (item.workbenchState && item.workbenchState.code) {
    const code = String(item.workbenchState.code || '');
    const label = String(item.workbenchState.label || '');
    if (code === 'pending') return { code, label, className: 'tag-danger' };
    if (code === 'live') return { code, label, className: 'tag-green' };
    if (code === 'upcoming' || code === 'travel') return { code, label, className: 'tag-green' };
    return null;
  }
  const start = parseDate(item.startTime);
  const end = parseDate(item.endTime || item.startTime);
  if (start && start > now) {
    const diff = Math.round((start.getTime() - now.getTime()) / 60000);
    if (diff <= 30) return { code: 'upcoming', label: '即将开始', className: 'tag-green' };
    return null;
  }
  if (end && end <= now && !hasScheduleFeedback(item)) {
    return { code: 'pending', label: '待反馈', className: 'tag-danger' };
  }
  return null;
}

function buildWeekDays(schedule = [], weekOffset = 0, now = new Date()) {
  const weekStart = addDays(startOfWeek(now), weekOffset * 7);
  const weekEnd = addDays(weekStart, 7);
  const todayKey = dateKey(now);
  const items = schedule
    .filter((item) => {
      const start = parseDate(item.startTime);
      return start && start >= weekStart && start < weekEnd;
    })
    .sort((a, b) => parseDate(a.startTime) - parseDate(b.startTime))
    .map(formatScheduleItem);
  return Array.from({ length: 7 }).map((_, index) => {
    const date = addDays(weekStart, index);
    const key = dateKey(date);
    return {
      key,
      isToday: key === todayKey,
      label: `${WEEKDAYS[date.getDay()]} ${pad(date.getMonth() + 1)}/${pad(date.getDate())}`,
      items: items.filter((item) => String(item.startTime || '').slice(0, 10) === key)
    };
  });
}

function weekRangeText(weekOffset = 0, now = new Date()) {
  const start = addDays(startOfWeek(now), weekOffset * 7);
  const end = addDays(start, 6);
  return `${start.getMonth() + 1}/${pad(start.getDate())} - ${end.getMonth() + 1}/${pad(end.getDate())}`;
}

function buildTimetableDays(schedule = [], weekOffset = 0, now = new Date()) {
  const start = addDays(startOfWeek(now), weekOffset * 7);
  const dayCount = weekOffset === 0 ? 9 : 7;
  const todayKey = dateKey(now);
  return Array.from({ length: dayCount }).map((_, index) => {
    const date = addDays(start, index);
    const key = dateKey(date);
    return {
      key,
      name: WEEKDAYS[date.getDay()],
      date: `${pad(date.getDate())}日`,
      isToday: key === todayKey,
      items: schedule.filter(item => String(item.startTime || '').slice(0, 10) === key)
    };
  });
}

function clockMinutes(value) {
  const date = parseDate(value);
  return date ? date.getHours() * 60 + date.getMinutes() : 0;
}

function classBlockStyle(item) {
  const hourHeight = 150;
  const start = clockMinutes(item.startTime);
  const end = clockMinutes(item.endTime);
  const top = Math.max(0, Math.round((start / 60) * hourHeight));
  const height = Math.max(128, Math.round(((Math.max(end, start + 60) - start) / 60) * hourHeight) - 4);
  return { top, height };
}

function findSchedule(schedule = [], id = '') {
  return (schedule || []).find((item) => String(item.id) === String(id)) || null;
}

module.exports = {
  buildWeekDays,
  buildTimetableDays,
  classBlockStyle,
  findSchedule,
  formatScheduleItem,
  scheduleLocationText,
  workbenchTodoState,
  weekRangeText
};
