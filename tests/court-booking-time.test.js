const assert = require('assert');
const test = require('node:test');
const fs = require('fs');
const vm = require('vm');
const { buildCourtAccountListViewFromData } = require('../server/page-data/court-account-read-model');
const { createCourtFinanceRules } = require('../server/court-finance');
const parser = require('../server/booking-structure-parser');

const history = { id: 'booking', date: '2026-09-20', occurredDate: '2026-09-20', startTime: '2026-09-20 09:00', endTime: '2026-09-20 10:00', venue: '3号场', type: '消费', category: '课程订场', payMethod: '储值卡', amount: 100 };
function viewRows(rows) {
  return buildCourtAccountListViewFromData({ courts: [{ id: 'court', name: '测试账户', history: rows }] }, { includeDetails: true }).items[0].bookingRows;
}

test('历史完整时间经统一读模型只展示钟点，不改原始流水', () => {
  const before = JSON.stringify(history);
  assert.strictEqual(viewRows([history])[0].timeText, '09:00–10:00');
  assert.strictEqual(JSON.stringify(history), before);
});
test('纯时间和带秒时间均为 HH:mm，缺失不能猜填', () => {
  assert.strictEqual(viewRows([{ ...history, startTime: '09:00:00', endTime: '10:00:00' }])[0].timeText, '09:00–10:00');
  assert.strictEqual(viewRows([{ ...history, startTime: '', endTime: '' }])[0].timeText, '未记录');
  assert.strictEqual(viewRows([{ ...history, startTime: '99:99', endTime: 'bad' }])[0].timeText, '未记录');
});
test('跨天时间保留两端日期，不能截成同一天', () => {
  const row = { ...history, startTime: '2026-09-20 23:00', endTime: '2026-09-21 01:00' };
  assert.strictEqual(viewRows([row])[0].timeText, '2026-09-20 23:00–2026-09-21 01:00');
});
test('ISO 时区时间按北京时间展示', () => {
  assert.strictEqual(viewRows([{ ...history, startTime: '2026-09-20T01:00:00Z', endTime: '2026-09-20T02:00:00Z' }])[0].timeText, '09:00–10:00');
});
test('排课新流水同日保存日期与钟点，保留跨天原始信息', () => {
  const rules = createCourtFinanceRules();
  const schedule = { id: 'schedule', startTime: history.startTime, endTime: history.endTime, studentIds: ['student'] };
  const row = rules.buildScheduleStoredValueHistoryRow(schedule, { amount: 100, charge: { key: 'fieldFee', category: '课程订场' } });
  assert.strictEqual(row.date, '2026-09-20');
  assert.strictEqual(row.startTime, '09:00');
  assert.strictEqual(row.endTime, '10:00');
  const overnight = rules.buildScheduleStoredValueHistoryRow({ ...schedule, startTime: '2026-09-20 23:00', endTime: '2026-09-21 01:00' });
  assert.strictEqual(overnight.endTime, '2026-09-21 01:00');
});
test('新增第三方订场统一同日时间，不改变金额和冲正性质', () => {
  const row = parser.enrichCourtBookingStructure({ ...history, type: '冲正' });
  assert.strictEqual(row.startTime, '09:00');
  assert.strictEqual(row.endTime, '10:00');
  assert.strictEqual(row.type, '冲正');
  assert.strictEqual(row.amount, 100);
});
test('页面使用统一显示字段，冲正不冒充新的扣款', () => {
  const context = { renderDetailDrawerTable: value => value, fmt: value => String(value) };
  vm.createContext(context);
  vm.runInContext(fs.readFileSync(require.resolve('../public/assets/scripts/pages/courts-helpers.js'), 'utf8'), context);
  const rows = viewRows([history, { ...history, id: 'return', type: '冲正' }]);
  const table = context.courtBookingRecordsTableHtml(rows);
  assert.strictEqual(table.columns.find(c => c.key === 'time').render(rows[0]), '09:00–10:00');
  assert.match(table.columns.find(c => c.key === 'category').render(rows[1]), /冲正/);
  assert.strictEqual(rows.length, 2);
  assert.strictEqual(rows[1].amount, 100);
});

test('历史中文场地和独立时间段按明确原文补齐，不丢半小时', () => {
  const chinese = parser.enrichCourtBookingStructure({ date: '2026-04-07', note: '4月7日，10-11点30分，一号场地' });
  assert.strictEqual(chinese.venue, '1号场');
  assert.strictEqual(chinese.startTime, '10:00');
  assert.strictEqual(chinese.endTime, '11:30');
  const separate = parser.enrichCourtBookingStructure({ date: '2026-02-01', timeRange: '17-18点30分' });
  assert.strictEqual(separate.startTime, '17:00');
  assert.strictEqual(separate.endTime, '18:30');
  assert.strictEqual(separate.venue, undefined);
});

test('独立钟点范围不得被当成月日', () => {
  const row = parser.enrichCourtBookingStructure({ timeRange: '17-18点30分' });
  assert.strictEqual(row.date, undefined);
  assert.strictEqual(row.startTime, '17:00');
});

test('历史账户姓名不能充当场地，场地必须有明确原文依据', () => {
  assert.strictEqual(parser.enrichCourtBookingStructure({ courtName: '王大人', note: '2026-04-07 / 10:00-11:00 / 1号场' }).venue, '1号场');
  assert.strictEqual(parser.enrichCourtBookingStructure({ courtName: '王大人' }).venue, undefined);
  assert.strictEqual(parser.enrichCourtBookingStructure({ courtName: '2号场' }).venue, '2号场');
  assert.strictEqual(parser.enrichCourtBookingStructure({ courtName: '室内2' }).venue, '2号场');
  assert.strictEqual(parser.enrichCourtBookingStructure({ note: '十一号场' }).venue, undefined);
});
