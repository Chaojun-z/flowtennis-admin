function pad(value) {
  return String(value).padStart(2, '0');
}

const CAMPUS_DISPLAY_NAME_MAP = {
  shunyi_mapo: '顺义马坡',
  mabao: '顺义马坡',
  '顺义马坡': '顺义马坡',
  '马坡': '顺义马坡',
  '马宝': '顺义马坡',
  shilipu: '朝阳十里堡',
  '朝阳十里堡': '朝阳十里堡',
  '十里堡': '朝阳十里堡',
  guowang: '国家网球中心',
  '国家网球中心': '国家网球中心',
  '国网': '国家网球中心',
  '朝阳国网': '国家网球中心',
  langang: '蓝色港湾',
  '蓝色港湾': '蓝色港湾',
  '朝阳蓝色港湾': '蓝色港湾',
  '蓝港': '蓝色港湾',
  chaojun: '朝珺私教',
  '朝珺私教': '朝珺私教',
  '朝珺': '朝珺私教'
};

function campusDisplayName(value) {
  const raw = String(value ?? '').trim();
  if (!raw || raw === 'undefined' || raw === 'null') return '';
  return CAMPUS_DISPLAY_NAME_MAP[raw] || raw;
}

function toChinaParts(input) {
  const date = input instanceof Date ? input : new Date(input);
  const fmt = new Intl.DateTimeFormat('en-CA', {
    timeZone: 'Asia/Shanghai',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
    hour12: false
  });
  const parts = Object.fromEntries(fmt.formatToParts(date).filter((item) => item.type !== 'literal').map((item) => [item.type, item.value]));
  return parts;
}

function toChinaDateKey(input) {
  const parts = toChinaParts(input);
  return `${parts.year}-${parts.month}-${parts.day}`;
}

function parseScheduleTimeMs(input) {
  const text = String(input || '').trim();
  const match = text.match(/^(\d{4})-(\d{2})-(\d{2})[ T](\d{2}):(\d{2})(?::(\d{2}))?/);
  if (match) {
    const [, year, month, day, hour, minute, second = '0'] = match;
    return Date.UTC(Number(year), Number(month) - 1, Number(day), Number(hour) - 8, Number(minute), Number(second));
  }
  return new Date(input || '').getTime();
}

function scheduleEndTimeMs(row) {
  const explicitEndMs = parseScheduleTimeMs(row?.endTime || '');
  if (Number.isFinite(explicitEndMs)) return explicitEndMs;
  const startMs = parseScheduleTimeMs(row?.startTime || '');
  if (!Number.isFinite(startMs)) return NaN;
  const lessonCount = Number(row?.lessonCount);
  const minutes = Number.isFinite(lessonCount) && lessonCount > 0 ? lessonCount * 60 : 60;
  return startMs + minutes * 60 * 1000;
}

function scheduleDateKey(input) {
  const text = String(input || '').trim();
  const match = text.match(/^(\d{4}-\d{2}-\d{2})[ T]/);
  if (match) return match[1];
  return toChinaDateKey(input);
}

function addDays(dateKey, amount) {
  const base = new Date(`${dateKey}T00:00:00+08:00`);
  base.setUTCDate(base.getUTCDate() + amount);
  return toChinaDateKey(base);
}

function maskStudentLabel(name) {
  const text = String(name || '').trim();
  if (!text) return '';
  if (text.length === 1) return '*';
  if (text.length === 2) return `${text[0]}*`;
  return `${text[0]}${'*'.repeat(text.length - 2)}${text[text.length - 1]}`;
}

function splitStudentNames(row) {
  const raw = []
    .concat(Array.isArray(row.studentNames) ? row.studentNames : [])
    .concat(String(row.studentName || '').split(/[、,，/]/))
    .map((item) => String(item || '').trim())
    .filter(Boolean);
  return Array.from(new Set(raw));
}

function effectiveStatus(row, now) {
  const status = String(row?.status || '已排课').trim() || '已排课';
  if (status === '已取消') return '已取消';
  if (status === '已结束' || status === '已下课') return '已结束';
  const endMs = scheduleEndTimeMs(row);
  const nowMs = now instanceof Date ? now.getTime() : new Date(now).getTime();
  if (status === '已排课' && Number.isFinite(endMs) && Number.isFinite(nowMs) && endMs < nowMs) return '已结束';
  return status;
}

function sortByStartTime(items) {
  return [...items].sort((a, b) => parseScheduleTimeMs(a.startTime) - parseScheduleTimeMs(b.startTime));
}

function normalizeLesson(row, campusMap, now) {
  const studentNames = splitStudentNames(row);
  const studentIds = Array.isArray(row.studentIds) ? row.studentIds.filter(Boolean) : [];
  const campusCode = String(row.campus || '').trim();
  const isExternal = String(row.locationType || '').trim() === 'external' || campusCode === '__external__' || campusCode === 'external';
  const venueParts = String(row.venue || '').split(' · ').map((item) => String(item || '').trim()).filter(Boolean);
  const externalVenueName = String(row.externalVenueName || venueParts[0] || '').trim();
  const externalCourtName = String(row.externalCourtName || venueParts.slice(1).join(' · ') || '').trim();
  return {
    id: String(row.id || '').trim(),
    startTime: String(row.startTime || '').trim(),
    endTime: String(row.endTime || '').trim(),
    coachId: String(row.coachId || '').trim(),
    coachName: String(row.coach || row.coachName || '').trim(),
    campusCode,
    campusName: isExternal ? (externalVenueName || '校区外') : (campusMap.get(campusCode) || campusDisplayName(campusCode)),
    venue: isExternal ? externalCourtName : String(row.venue || '').trim(),
    className: String(row.className || '').trim(),
    courseType: String(row.courseType || '').trim(),
    status: effectiveStatus(row, now),
    studentCount: studentNames.length || studentIds.length || 0,
    studentNames,
    studentLabels: studentNames.map(maskStudentLabel)
  };
}

function summarizeByCoach(todayRows, tomorrowRows) {
  const byCoach = new Map();
  const touch = (coachId, coachName) => {
    const key = `${coachId}::${coachName}`;
    if (!byCoach.has(key)) {
      byCoach.set(key, {
        coachId,
        coachName,
        todayCompletedLessons: 0,
        todayCancelledLessons: 0,
        todayPendingLessons: 0,
        tomorrowScheduledLessons: 0
      });
    }
    return byCoach.get(key);
  };
  todayRows.forEach((row) => {
    const item = touch(row.coachId, row.coachName);
    if (row.status === '已取消') item.todayCancelledLessons += 1;
    else if (row.status === '已结束') item.todayCompletedLessons += 1;
    else item.todayPendingLessons += 1;
  });
  tomorrowRows.forEach((row) => {
    if (row.status === '已取消') return;
    touch(row.coachId, row.coachName).tomorrowScheduledLessons += 1;
  });
  return [...byCoach.values()].sort((a, b) => String(a.coachName).localeCompare(String(b.coachName), 'zh-Hans-CN'));
}

function buildNotificationCenterSnapshot({
  scheduleRows = [],
  coaches = [],
  campuses = [],
  targetDate,
  now = new Date(),
  generatedAt = new Date().toISOString()
} = {}) {
  const today = targetDate || toChinaDateKey(now);
  const tomorrow = addDays(today, 1);
  const campusMap = new Map();
  (campuses || []).forEach((row) => {
    const name = campusDisplayName(row?.name || row?.code || row?.id);
    [row?.code, row?.id, row?.name].map((value) => String(value || '').trim()).filter(Boolean)
      .forEach((key) => campusMap.set(key, name));
  });
  const activeCoachNames = new Set((coaches || [])
    .filter((row) => String(row?.status || 'active').trim() !== 'inactive')
    .map((row) => String(row?.name || row?.id || '').trim())
    .filter(Boolean));
  const normalized = sortByStartTime(scheduleRows.map((row) => normalizeLesson(row, campusMap, now)));
  const todayLessonDetails = normalized.filter((row) => row.startTime && scheduleDateKey(row.startTime) === today);
  const tomorrowLessonDetails = normalized.filter((row) => row.startTime && scheduleDateKey(row.startTime) === tomorrow);
  const activeTodayCoachNames = new Set(todayLessonDetails
    .filter((row) => row.status !== '已取消')
    .map((row) => row.coachName)
    .filter((name) => activeCoachNames.size === 0 || activeCoachNames.has(name)));
  return {
    schemaVersion: 'notification-center-v1',
    generatedAt,
    today,
    tomorrow,
    coachSummaries: summarizeByCoach(todayLessonDetails, tomorrowLessonDetails),
    todayStats: {
      totalLessons: todayLessonDetails.length,
      completedLessons: todayLessonDetails.filter((row) => row.status === '已结束').length,
      cancelledLessons: todayLessonDetails.filter((row) => row.status === '已取消').length,
      pendingLessons: todayLessonDetails.filter((row) => !['已结束', '已取消'].includes(row.status)).length,
      activeCoachCount: activeTodayCoachNames.size
    },
    tomorrowStats: {
      totalLessons: tomorrowLessonDetails.length,
      cancelledLessons: tomorrowLessonDetails.filter((row) => row.status === '已取消').length,
      scheduledCoachCount: new Set(tomorrowLessonDetails.filter((row) => row.status !== '已取消').map((row) => row.coachName).filter(Boolean)).size
    },
    todayLessonDetails,
    tomorrowLessonDetails
  };
}

module.exports = {
  addDays,
  buildNotificationCenterSnapshot,
  effectiveStatus,
  maskStudentLabel,
  toChinaDateKey
};
