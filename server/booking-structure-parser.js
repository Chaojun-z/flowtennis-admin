function cleanBookingText(value) {
  return String(value || '').trim();
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
  for (const match of source.matchAll(/(^|[^\d:])(\d{1,2})(?:[:：](\d{2}))?\s*[-~至到]\s*(\d{1,2})(?:[:：](\d{2}))?\s*点/g)) {
    ranges.push(validBookingRange(normalizeBookingClock(match[2], match[3]), normalizeBookingClock(match[4], match[5])));
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
  const startTime = cleanBookingText(row.startTime) || parsed.startTime;
  const endTime = cleanBookingText(row.endTime) || parsed.endTime;
  const venue = normalizeBookingVenue(row.venue || row.sourceVenue || row.sourceCourt || row.court || row.courtName) || parsed.venue;
  const date = cleanBookingText(row.date || row.occurredDate || row.businessDate || row.bookingDate || row.sourceDate) || parsed.date;
  return {
    ...row,
    ...(date ? { date: cleanBookingText(row.date) || date, occurredDate: cleanBookingText(row.occurredDate) || date } : {}),
    ...(startTime ? { startTime } : {}),
    ...(endTime ? { endTime } : {}),
    ...(venue ? { venue } : {})
  };
}

function missingCourtBookingStructure(row = {}) {
  const enriched = enrichCourtBookingStructure(row);
  return !cleanBookingText(enriched.date || enriched.occurredDate || enriched.businessDate || enriched.bookingDate)
    || !cleanBookingText(enriched.startTime)
    || !cleanBookingText(enriched.endTime)
    || !cleanBookingText(enriched.venue);
}

module.exports = {
  normalizeBookingVenue,
  parseBookingStructureFromText,
  enrichCourtBookingStructure,
  missingCourtBookingStructure
};
