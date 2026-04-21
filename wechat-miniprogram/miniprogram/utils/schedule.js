const WEEKDAYS = ['周日', '周一', '周二', '周三', '周四', '周五', '周六'];

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

function formatScheduleItem(item) {
  return {
    ...item,
    timeText: timeText(item),
    title: item.courseType || item.className || '课程',
    studentText: item.studentName || '学员待确认',
    locationText: [item.campus, item.venue || item.externalVenueName || item.externalCourtName].filter(Boolean).join(' ') || '地点待确认',
    statusText: item.status || '已排课'
  };
}

function buildWeekDays(schedule = [], weekOffset = 0, now = new Date()) {
  const weekStart = addDays(startOfWeek(now), weekOffset * 7);
  const weekEnd = addDays(weekStart, 7);
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
      isToday: key === dateKey(new Date()),
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
  return Array.from({ length: 7 }).map((_, index) => {
    const date = addDays(start, index);
    const key = dateKey(date);
    return {
      key,
      name: WEEKDAYS[date.getDay()],
      date: `${pad(date.getDate())}日`,
      isToday: key === dateKey(new Date()),
      items: schedule.filter(item => String(item.startTime || '').slice(0, 10) === key)
    };
  });
}

function clockMinutes(value) {
  const date = parseDate(value);
  return date ? date.getHours() * 60 + date.getMinutes() : 7 * 60;
}

function classBlockStyle(item) {
  const hourHeight = 150;
  const start = clockMinutes(item.startTime);
  const end = clockMinutes(item.endTime);
  const top = Math.max(0, Math.round(((start - 7 * 60) / 60) * hourHeight));
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
  weekRangeText
};
