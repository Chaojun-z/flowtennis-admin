function cleanBookingText(value) {
  return String(value || '').trim();
}

function bookingTimeParts(value = '') {
  let text = cleanBookingText(value);
  if (/^\d{4}-\d{2}-\d{2}T.*(?:Z|[+-]\d{2}:?\d{2})$/i.test(text)) {
    const instant = Date.parse(text);
    if (!Number.isFinite(instant)) return { date: '', clock: '' };
    text = new Date(instant + 8 * 60 * 60 * 1000).toISOString().slice(0, 19);
  }
  const match = text.match(/^(?:(\d{4}-\d{2}-\d{2})[ T])?([01]?\d|2[0-3]):([0-5]\d)(?::[0-5]\d(?:\.\d+)?)?$/);
  return match ? { date: match[1] || '', clock: `${match[2].padStart(2, '0')}:${match[3]}` } : { date: '', clock: '' };
}

function normalizeCourtBookingTimes(row = {}) {
  const start = bookingTimeParts(row.startTime);
  const end = bookingTimeParts(row.endTime);
  const date = cleanBookingText(row.date || row.occurredDate || row.bookingDate).slice(0, 10);
  // 只有日期已明确且两端属于同一天，才去掉时间字段里的重复日期。
  if (!date || !start.clock || !end.clock || (start.date && start.date !== date) || (end.date && end.date !== date)) return row;
  return { ...row, startTime: start.clock, endTime: end.clock };
}

function formatCourtBookingTimeRange(row = {}) {
  const start = bookingTimeParts(row.startTime);
  const end = bookingTimeParts(row.endTime);
  if (!start.clock && !end.clock) return '未记录';
  const date = cleanBookingText(row.date || row.occurredDate || row.bookingDate).slice(0, 10);
  const startDate = start.date || date;
  const endDate = end.date || date;
  const showDates = (startDate && endDate && startDate !== endDate) || (start.date && start.date !== date) || (end.date && end.date !== date);
  const label = (part, day) => part.clock ? `${showDates && day ? `${day} ` : ''}${part.clock}` : '未记录';
  return `${label(start, startDate)}–${label(end, endDate)}`;
}

function normalizeBookingClock(hour, minute = '0') {
  const h = parseInt(hour, 10);
  let m = String(minute || '0').trim();
  if (m === '半') m = '30';
  m = m.replace(/分/g, '');
  const n = parseInt(m || '0', 10);
  if (!Number.isFinite(h) || !Number.isFinite(n) || h < 0 || h > 23 || n < 0 || n > 59) return '';
  return `${String(h).padStart(2, '0')}:${String(n).padStart(2, '0')}`;
}

function bookingClockMinutes(value = '') {
  const match = cleanBookingText(value).match(/(\d{1,2}):(\d{2})/);
  if (!match) return null;
  return Number(match[1]) * 60 + Number(match[2]);
}

function normalizeBookingVenue(value = '') {
  const raw = cleanBookingText(value);
  if (!raw) return '';
  const indoor = raw.match(/^室内\s*(\d+)(?:\s*号)?(?:\s*场)?$/);
  if (indoor) return `${Number(indoor[1])}号场`;
  const court = raw.match(/^(\d+)\s*号\s*场$/);
  if (court) return `${Number(court[1])}号场`;
  const shortCourt = raw.match(/^(\d+)\s*号$/);
  if (shortCourt) return `${Number(shortCourt[1])}号场`;
  if (/^\d+$/.test(raw)) return `${Number(raw)}号场`;
  return raw;
}

function parseBookingDateFromText(text = '', fallbackYear = new Date().getFullYear()) {
  const source = cleanBookingText(text);
  const full = source.match(/(\d{4})[年./-](\d{1,2})[月./-](\d{1,2})(?:日)?/);
  if (full) return `${full[1]}-${String(full[2]).padStart(2, '0')}-${String(full[3]).padStart(2, '0')}`;
  const short = source.match(/(^|[^\d])(\d{1,2})[月./-](\d{1,2})(?:日)?/);
  if (short) return `${fallbackYear}-${String(short[2]).padStart(2, '0')}-${String(short[3]).padStart(2, '0')}`;
  return '';
}

function parseBookingTimeRangeFromText(text = '') {
  const source = cleanBookingText(text).replace(/[—–－]/g, '-');
  const ranges = [];
  for (const match of source.matchAll(/(\d{1,2})[:：](\d{2})\s*[-~至到]\s*(\d{1,2})[:：](\d{2})/g)) {
    ranges.push(validBookingRange(normalizeBookingClock(match[1], match[2]), normalizeBookingClock(match[3], match[4])));
  }
  if (ranges.length) return mergeBookingRanges(ranges);
  for (const match of source.matchAll(/(\d{1,2})\s*点\s*(半|\d{1,2}\s*分?)?\s*[-~至到]\s*(\d{1,2})\s*点?\s*(半|\d{1,2}\s*分?)?/g)) {
    ranges.push(validBookingRange(normalizeBookingClock(match[1], match[2]), normalizeBookingClock(match[3], match[4])));
  }
  if (ranges.length) return mergeBookingRanges(ranges);
  for (const match of source.matchAll(/(^|[^\d:])(\d{1,2})(?:[:：](\d{2}))?\s*[-~至到]\s*(\d{1,2})(?:[:：](\d{2}))?\s*点\s*(半|\d{1,2}\s*分?)?/g)) {
    ranges.push(validBookingRange(normalizeBookingClock(match[2], match[3]), normalizeBookingClock(match[4], match[5] || match[6])));
  }
  if (ranges.length) return mergeBookingRanges(ranges);
  return { startTime: '', endTime: '' };
}

function validBookingRange(startTime = '', endTime = '') {
  const start = bookingClockMinutes(startTime);
  const end = bookingClockMinutes(endTime);
  if (start === null || end === null || end <= start) return { startTime: '', endTime: '' };
  return { startTime, endTime };
}

function mergeBookingRanges(ranges = []) {
  const validRanges = ranges.filter(range => range.startTime && range.endTime);
  if (!validRanges.length) return { startTime: '', endTime: '' };
  const startTime = validRanges.map(range => range.startTime).sort()[0];
  const endTime = validRanges.map(range => range.endTime).sort().slice(-1)[0];
  return validBookingRange(startTime, endTime);
}

function parseBookingVenueFromText(text = '') {
  const source = cleanBookingText(text);
  const indoor = source.match(/室内\s*(\d+)/);
  if (indoor) return `${Number(indoor[1])}号场`;
  const court = source.match(/(\d+)\s*号\s*场/);
  if (court) return `${Number(court[1])}号场`;
  const chineseCourt = source.match(/(?<![一二三四五六七八九十百])([一二三四五六七八九十])\s*号\s*场/);
  if (chineseCourt) return `${'一二三四五六七八九十'.indexOf(chineseCourt[1]) + 1}号场`;
  return '';
}

function parseBookingStructureFromText(text = '', options = {}) {
  const source = cleanBookingText(text);
  if (!source) return { date: '', startTime: '', endTime: '', venue: '' };
  const range = parseBookingTimeRangeFromText(source);
  return {
    date: parseBookingDateFromText(source, options.fallbackYear),
    startTime: range.startTime,
    endTime: range.endTime,
    venue: parseBookingVenueFromText(source)
  };
}

function bookingStructureSourceText(row = {}) {
  return [
    row.note,
    row.notes,
    row.remark,
    row.description,
    row.sourceTimeBand,
    row.time,
    row.sourceVenue,
    row.sourceLocation,
    row.sourceDate,
    row.date,
    row.occurredDate,
    row.businessDate,
    row.bookingDate
  ].map(cleanBookingText).filter(Boolean).join('；');
}

function enrichCourtBookingStructure(row = {}) {
  const parsed = parseBookingStructureFromText(bookingStructureSourceText(row));
  const explicitRange = parseBookingTimeRangeFromText(row.timeRange);
  const startTime = cleanBookingText(row.startTime) || explicitRange.startTime || parsed.startTime;
  const endTime = cleanBookingText(row.endTime) || explicitRange.endTime || parsed.endTime;
  // courtName 在历史导入中也表示账户姓名，只接受明确的场地编号。
  const normalizedCourtName = normalizeBookingVenue(row.courtName);
  const courtNameVenue = /^\d+号场$/.test(normalizedCourtName) ? normalizedCourtName
    : /^(?:\d+|[一二三四五六七八九十])\s*号\s*场(?:地)?$/.test(cleanBookingText(row.courtName)) ? parseBookingVenueFromText(row.courtName) : '';
  const venue = normalizeBookingVenue(row.venue || row.sourceVenue || row.sourceCourt || row.court) || parsed.venue || courtNameVenue;
  const date = cleanBookingText(row.date || row.occurredDate || row.businessDate || row.bookingDate || row.sourceDate) || parsed.date;
  return normalizeCourtBookingTimes({
    ...row,
    ...(date ? { date: cleanBookingText(row.date) || date, occurredDate: cleanBookingText(row.occurredDate) || date } : {}),
    ...(startTime ? { startTime } : {}),
    ...(endTime ? { endTime } : {}),
    ...(venue ? { venue } : {})
  });
}

function missingCourtBookingStructure(row = {}) {
  const enriched = enrichCourtBookingStructure(row);
  return !cleanBookingText(enriched.date || enriched.occurredDate || enriched.businessDate || enriched.bookingDate)
    || !cleanBookingText(enriched.startTime)
    || !cleanBookingText(enriched.endTime)
    || !cleanBookingText(enriched.venue);
}

module.exports = {
  normalizeCourtBookingTimes,
  formatCourtBookingTimeRange,
  normalizeBookingVenue,
  parseBookingStructureFromText,
  enrichCourtBookingStructure,
  missingCourtBookingStructure
};
