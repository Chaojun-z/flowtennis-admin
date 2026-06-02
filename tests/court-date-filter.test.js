const assert = require('assert');
const vm = require('vm');
const { appSource: source } = require('./helpers/read-index-bundle');

function fnBody(name){
  const start = source.indexOf(`function ${name}(`);
  assert.notStrictEqual(start, -1, `${name} should exist`);
  const nextFunction = source.indexOf('\nfunction ', start + 1);
  const nextAsync = source.indexOf('\nasync function ', start + 1);
  const candidates = [nextFunction, nextAsync].filter(i => i !== -1);
  const next = candidates.length ? Math.min(...candidates) : -1;
  return source.slice(start, next === -1 ? source.length : next);
}

const snippet = [
  fnBody('parseArr'),
  fnBody('isCourtBookingHistoryRow'),
  fnBody('courtBookingClockMinutes'),
  fnBody('courtBookingDurationHours'),
  fnBody('courtBookingSummary'),
  fnBody('summarizeCourtAccountListItems'),
  fnBody('courtRatioText'),
  fnBody('courtStatValuePair'),
  fnBody('courtStatPercent'),
  fnBody('closeCourtTopDropdowns'),
  fnBody('activeCourtDateRange'),
  fnBody('courtRowHistoryForFilter'),
  fnBody('courtDateKeyForFilter'),
  fnBody('courtDateWithinRange'),
  fnBody('courtHistoryDate'),
  fnBody('courtDateMatchedBookingHistory'),
  fnBody('applyCourtDateRangeFilter')
].join('\n');

const context = { console, document: { addEventListener(){} } };
vm.createContext(context);
context.normalizeCourtHistoryLocal = (history = []) => {
  const rows = Array.isArray(history) ? history : [];
  return rows.map((row) => ({
    ...row,
    amount: Math.abs(Number(row?.amount) || 0),
    bonusAmount: Number(row?.bonusAmount) || 0,
    type: row?.type || '消费',
    payMethod: row?.payMethod || '',
    category: row?.category || '其他'
  }));
};
context.dateMs = (value) => {
  const text = String(value || '').trim();
  if (!text) return NaN;
  const date = new Date(text.includes('T') ? text : `${text}T00:00:00`);
  return Number.isNaN(date.getTime()) ? NaN : date.getTime();
};
context.today = () => '2026-06-02';
vm.runInContext(snippet, context);

assert.strictEqual(typeof context.applyCourtDateRangeFilter, 'function', 'applyCourtDateRangeFilter should be defined');

const items = [
  {
    id: 'court-a',
    campusCode: 'cysj',
    bookingCount: 3,
    bookingAmount: 300,
    bookingHours: 6,
    memberBookingCount: 1,
    memberBookingAmount: 100,
    guestBookingCount: 2,
    guestBookingAmount: 200,
    totalReceived: 300,
    totalDeposit: 0,
    totalSpent: 0,
    membershipStatusCode: '',
    history: [
      { type: '消费', category: '订场', amount: 100, occurredDate: '2026-06-03', startTime: '10:00', endTime: '12:00', payMethod: '现场收款', venue: '1号场' },
      { type: '消费', category: '订场', amount: 80, occurredDate: '2026-06-11', startTime: '10:00', endTime: '11:00', payMethod: '现场收款', venue: '1号场' },
      { type: '消费', category: '订场', amount: 120, occurredDate: '2026-06-28', startTime: '15:00', endTime: '18:00', payMethod: '现场收款', venue: '2号场' }
    ]
  },
  {
    id: 'court-b',
    campusCode: 'sgmp',
    bookingCount: 2,
    bookingAmount: 260,
    bookingHours: 3,
    memberBookingCount: 2,
    memberBookingAmount: 260,
    guestBookingCount: 0,
    guestBookingAmount: 0,
    totalReceived: 260,
    totalDeposit: 0,
    totalSpent: 0,
    membershipStatusCode: 'active',
    balance: 800,
    history: [
      { type: '消费', category: '订场', amount: 140, occurredDate: '2026-06-08', startTime: '08:00', endTime: '09:00', payMethod: '储值扣款', venue: '3号场' },
      { type: '消费', category: '订场', amount: 120, occurredDate: '2026-06-15', startTime: '18:00', endTime: '20:00', payMethod: '储值扣款', venue: '3号场' }
    ]
  }
];

const filtered = context.applyCourtDateRangeFilter(items, { startDate: '2026-06-03', endDate: '2026-06-14' });
assert.strictEqual(filtered.length, 2, 'date range should keep both matching users');

const courtA = filtered.find(item => item.id === 'court-a');
const courtB = filtered.find(item => item.id === 'court-b');
assert.ok(courtA, 'court-a should remain after filtering');
assert.ok(courtB, 'court-b should remain after filtering');
assert.strictEqual(courtA.bookingCount, 2, 'court-a booking count should shrink to the selected date range');
assert.strictEqual(courtA.bookingAmount, 180, 'court-a booking amount should shrink to the selected date range');
assert.strictEqual(courtA.bookingHours, 3, 'court-a booking hours should shrink to the selected date range');
assert.strictEqual(courtB.bookingCount, 1, 'court-b booking count should shrink to the selected date range');
assert.strictEqual(courtB.memberBookingCount, 1, 'court-b member booking count should shrink to the selected date range');
assert.strictEqual(courtB.memberBookingAmount, 140, 'court-b member booking amount should shrink to the selected date range');

const summary = context.summarizeCourtAccountListItems(filtered);
assert.strictEqual(summary.totalBookingCount, 3, 'summary booking count should use the filtered rows');
assert.strictEqual(summary.totalBookingAmount, 320, 'summary booking amount should use the filtered rows');
assert.strictEqual(summary.totalBookingHours, 4, 'summary booking hours should use the filtered rows');
assert.strictEqual(summary.totalMemberBookingCount, 1, 'summary member booking count should use the filtered rows');
assert.strictEqual(summary.totalGuestBookingCount, 2, 'summary guest booking count should use the filtered rows');

const slashDateRows = context.applyCourtDateRangeFilter([{
  id: 'court-slash-date',
  history: [
    { type: '消费', category: '会员订场', amount: 90, date: '2026/06/06', startTime: '09:00', endTime: '10:00', payMethod: '储值扣款', venue: '1号场' }
  ]
}], { startDate: '2026-06-01', endDate: '2026-06-30' });
assert.strictEqual(slashDateRows.length, 1, 'date range should support slash-formatted court history dates');
assert.strictEqual(slashDateRows[0].bookingCount, 1, 'slash-formatted booking history should still refresh booking metrics');

const mixedDateRows = context.applyCourtDateRangeFilter([{
  id: 'court-mixed-date',
  history: [
    { type: '消费', category: '会员订场', amount: 100, date: '2026.06.06', startTime: '09:00', endTime: '10:00', payMethod: '储值扣款', venue: '1号场' },
    { type: '消费', category: '散客订场', amount: 120, date: '6月7日', startTime: '10:00', endTime: '11:00', payMethod: '现场收款', venue: '2号场' }
  ]
}], { startDate: '2026-06-01', endDate: '2026-06-30' });
assert.strictEqual(mixedDateRows.length, 1, 'date range should support dot and Chinese-formatted booking dates');
assert.strictEqual(mixedDateRows[0].bookingCount, 2, 'mixed formatted booking history should still refresh booking metrics');

const importedDateRows = context.applyCourtDateRangeFilter([{
  id: 'court-imported-date',
  history: [
    { type: '消费', category: '散客订场', amount: 120, businessDate: '2026-06-05', startTime: '09:00', endTime: '10:00', payMethod: '现场收款', venue: '1号场' },
    { type: '消费', category: '会员订场', amount: 80, recordedAt: '2026-06-07T12:20:00.000Z', startTime: '10:00', endTime: '11:00', payMethod: '储值扣款', venue: '2号场' },
    { type: '消费', category: '会员订场', amount: 70, operationAt: '2026-05-31T12:20:00.000Z', startTime: '11:00', endTime: '12:00', payMethod: '储值扣款', venue: '3号场' }
  ]
}], { startDate: '2026-06-01', endDate: '2026-06-30' });
assert.strictEqual(importedDateRows.length, 1, 'date range should support imported booking rows with businessDate or recordedAt');
assert.strictEqual(importedDateRows[0].bookingCount, 2, 'imported booking rows in range should be counted');
assert.strictEqual(importedDateRows[0].bookingAmount, 200, 'imported booking rows in range should refresh booking amount');
assert.strictEqual(importedDateRows[0].lastBookingDate, '2026-06-07', 'last booking date should use the matched history date');

const fallbackRows = context.applyCourtDateRangeFilter([{
  id: 'court-fallback',
  bookingCount: 4,
  bookingAmount: 500,
  bookingHours: 6,
  memberBookingCount: 2,
  memberBookingAmount: 260,
  guestBookingCount: 2,
  guestBookingAmount: 240,
  lastBookingDate: '2026-06-09',
  history: [
    { type: '消费', category: '会员订场', amount: 90, date: '无法识别日期', startTime: '09:00', endTime: '10:00', payMethod: '储值扣款', venue: '1号场' }
  ]
}], { startDate: '2026-06-01', endDate: '2026-06-30' });
assert.strictEqual(fallbackRows.length, 1, 'date range should fall back to item metrics when last booking date is in range but row dates are not parseable');
assert.strictEqual(fallbackRows[0].bookingCount, 4, 'fallback should keep existing booking metrics instead of dropping the row to zero');

context.courtDateRangeFilterValue = '全部';
context.courtDateRangeStart = '2026-01-01';
context.courtDateRangeEnd = '2026-01-31';
const allTimeRange = context.activeCourtDateRange();
assert.strictEqual(allTimeRange.startDate, '', 'all time should not keep a stale custom start date');
assert.strictEqual(allTimeRange.endDate, '', 'all time should not keep a stale custom end date');

console.log('court date filter tests passed');
