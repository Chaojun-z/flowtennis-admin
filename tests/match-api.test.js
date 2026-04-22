const assert = require('assert');
const fs = require('fs');
const path = require('path');
const api = require('../api');

const rules = api._test;
const migration = fs.readFileSync(path.join(__dirname, '..', 'migrations', '20260421_match_real_launch.sql'), 'utf8');
const apiSource = fs.readFileSync(path.join(__dirname, '..', 'api', 'index.js'), 'utf8');

assert.ok(rules.assertMatchPostInput, 'api._test should expose match post validation');
assert.ok(rules.splitAaFee, 'api._test should expose AA split helper');
assert.ok(rules.deriveMatchStatus, 'api._test should expose match status helper');
assert.ok(rules.requireMatchUser, 'api._test should expose match user auth helper');
assert.ok(rules.requireAdminUser, 'api._test should expose admin auth helper');
assert.ok(rules.assertMatchBookingInput, 'api._test should expose match booking validation');
assert.ok(rules.buildMatchFeeLedger, 'api._test should expose match fee ledger builder');
assert.ok(rules.resolveFinalAttendanceStatus, 'api._test should expose attendance resolver');
assert.ok(rules.buildMatchProfileStats, 'api._test should expose profile stats builder');
assert.ok(rules.toMatchDetailResponse, 'api._test should expose mini-program detail response adapter');
assert.ok(rules.userMatchPermissions, 'api._test should expose match permission resolver');
assert.ok(rules.requireMatchAdminPermission, 'api._test should expose match permission guard');
assert.ok(rules.buildMatchCourtFinanceHistoryRow, 'api._test should expose match court finance row builder');
assert.ok(rules.buildMatchCourtFinanceRefundRow, 'api._test should expose match court finance refund row builder');
assert.ok(rules.assertMatchFeeSplitUpdateInput, 'api._test should expose match fee update validation');
assert.ok(rules.buildMatchFinanceDailyReport, 'api._test should expose match finance daily report builder');

for (const table of [
  'match_users',
  'match_posts',
  'match_registrations',
  'match_attendance',
  'match_bookings',
  'match_fee_records',
  'match_fee_splits',
  'match_operation_logs'
]) {
  assert.match(migration, new RegExp(`CREATE TABLE IF NOT EXISTS ${table}`), `${table} migration is required`);
}

assert.match(migration, /match_registrations_active_unique[\s\S]*WHERE registrationStatus='registered'/, 'active registrations must be unique per match and user');
assert.match(migration, /match_fee_splits_user_unique[\s\S]*WHERE payStatus NOT IN/, 'active fee splits must be unique per match and user');
assert.match(apiSource, /SELECT \* FROM match_posts WHERE id=\$1 FOR UPDATE/, 'registration must lock the match row');
assert.match(apiSource, /currentHeadcount:nextCount/, 'registration should return backend headcount');
assert.match(apiSource, /if\(user\.type==='match_user'\)return sendJson\(res,\{error:'无管理端权限'\},403\);/, 'match user token must not pass admin APIs');
assert.match(apiSource, /\/admin\/matches/, 'API should expose admin match endpoints');
assert.match(apiSource, /adminBookingM=path\.match/, 'API should expose admin booking endpoint');
assert.match(apiSource, /adminFeeConfirmM=path\.match/, 'API should expose admin fee confirmation endpoint');
assert.match(apiSource, /requireMatchAdminPermission\(user,'match_ops'\)/, 'match booking and attendance admin APIs should require ops permission');
assert.match(apiSource, /requireMatchAdminPermission\(user,'match_finance'\)/, 'match fee admin APIs should require finance permission');
assert.match(apiSource, /adminWithdrawalM=path\.match/, 'API should expose booked withdrawal handling endpoint');
assert.match(migration, /financialResponsibility/, 'registrations should persist booked withdrawal financial responsibility');
assert.match(apiSource, /syncMatchFeeSplitToCourtFinance/, 'paid match fee splits should sync into court finance ledger');
assert.match(apiSource, /syncMatchFeeSplitRefundToCourtFinance/, 'refunded match fee splits should sync refund into court finance ledger');
assert.match(apiSource, /match-court-finance/, 'match finance should use a dedicated court finance account');
assert.match(apiSource, /\/admin\/matches\/finance-daily/, 'API should expose match finance daily report endpoint');
assert.match(apiSource, /path==='\/my-matches'/, 'API should expose my matches endpoint');
assert.match(apiSource, /path==='\/match-profile'/, 'API should expose match profile endpoint');
assert.match(apiSource, /path==='\/match-profile\/phone'/, 'API should expose match phone endpoint');
assert.match(apiSource, /path==='\/match-profile\/phone-code'/, 'API should expose WeChat phone code endpoint');
assert.match(apiSource, /getuserphonenumber/, 'API should exchange WeChat phone code');
assert.match(apiSource, /matchUpdateM=path\.match/, 'API should expose match update endpoint');
assert.match(apiSource, /matchCancelM=path\.match/, 'API should expose match cancel endpoint');
assert.match(apiSource, /path==='\/match-attendance'/, 'API should expose self attendance endpoint');
assert.match(apiSource, /path==='\/match-attendance\/creator-confirm'/, 'API should expose creator attendance endpoint');
assert.match(apiSource, /path==='\/match-notifications'/, 'API should expose match notifications endpoint');
assert.match(apiSource, /path==='\/match-players'/, 'API should expose match players endpoint');
assert.match(apiSource, /viewerFeeSplit/, 'match detail should include viewer fee split');
assert.match(apiSource, /viewerFinalAttendanceStatus/, 'match detail should include viewer final attendance status');
assert.match(apiSource, /offlinePaymentText/, 'match detail should include offline payment text');
assert.match(apiSource, /feeSplitsByMatch/, 'admin match list should include fee splits');
assert.match(apiSource, /operationLogs/, 'admin match list should include operation logs');
assert.match(apiSource, /match_operation_logs ORDER BY createdAt DESC/, 'admin match list should load latest operation logs');
assert.match(apiSource, /MATCH_WECHAT_TEMPLATE_ID/, 'match notifications should have a dedicated template id env');
assert.match(apiSource, /notifyMatchUsers/, 'match operations should trigger subscribe notification helper');

assert.throws(() => rules.assertMatchPostInput({}), /请填写标题/);
assert.throws(() => rules.assertMatchPostInput({
  title: '周末双打',
  matchType: 'double',
  targetHeadcount: 4,
  ntrpMin: 2.2,
  ntrpMax: 3.5,
  genderPreference: '不限',
  estimatedCourtFee: 100,
  startTime: '2026-04-22T10:00:00',
  endTime: '2026-04-22T12:00:00'
}), /NTRP 范围不正确/);
assert.throws(() => rules.assertMatchPostInput({
  title: '周末双打',
  matchType: 'double',
  targetHeadcount: 4,
  ntrpMin: 2.5,
  ntrpMax: 3.5,
  genderPreference: '不限',
  estimatedCourtFee: 0,
  startTime: '2026-04-22T10:00:00',
  endTime: '2026-04-22T12:00:00'
}), /费用必须大于 0/);

const valid = rules.assertMatchPostInput({
  title: '周末双打',
  matchType: '双打',
  targetHeadcount: 4,
  ntrpMin: 2.5,
  ntrpMax: 3.5,
  genderPreference: '不限',
  estimatedCourtFee: 500,
  startTime: '2026-04-22T10:00:00',
  endTime: '2026-04-22T12:00:00'
});
assert.equal(valid.status, 'open');
assert.equal(valid.matchType, 'double');

assert.deepEqual(rules.splitAaFee(500, ['u1', 'u2', 'u3']).map(x => x.amount), [167, 167, 166]);
assert.equal(rules.splitAaFee(500, ['u1', 'u2', 'u3']).reduce((sum, row) => sum + row.amount, 0), 500);
assert.deepEqual(rules.splitAaFee(500, ['u1', 'u2', 'u3', 'u4']).map(x => x.amount), [125, 125, 125, 125]);

assert.equal(rules.deriveMatchStatus({
  status: 'booked',
  startTime: '2026-04-21T10:00:00',
  endTime: '2026-04-21T12:00:00'
}, new Date('2026-04-21T11:00:00')), 'playing');
assert.equal(rules.deriveMatchStatus({
  status: 'booked',
  startTime: '2026-04-21T10:00:00',
  endTime: '2026-04-21T12:00:00'
}, new Date('2026-04-21T13:00:00')), 'attendance_pending');

assert.throws(() => rules.requireAdminUser({ type: 'match_user', id: 'm1' }), /无管理端权限/);
assert.deepEqual(rules.userMatchPermissions({ id: 'dandan', role: 'editor', name: '陈丹丹' }).sort(), ['match_finance', 'match_ops']);
assert.doesNotThrow(() => rules.requireMatchAdminPermission({ id: 'dandan', role: 'editor', name: '陈丹丹' }, 'match_finance'));
assert.throws(() => rules.requireMatchAdminPermission({ id: 'staff', role: 'editor', name: '其他员工' }, 'match_finance'), /无约球财务权限/);
assert.deepEqual(rules.mergeStoredAuthUser({ id: 'staff' }, { id: 'staff', name: '运营', role: 'editor', matchPermissions: ['match_ops'] }).matchPermissions, ['match_ops']);

const detailResponse = rules.toMatchDetailResponse({ id: 'm1', title: '周末双打', registrations: [{ userId: 'u1' }] });
assert.equal(detailResponse.match.id, 'm1');
assert.equal(detailResponse.registrations.length, 1);
assert.equal(detailResponse.id, 'm1');

assert.throws(() => rules.assertMatchBookingInput({}), /请填写最终场地费/);
const booking = rules.assertMatchBookingInput({
  venueNameFinal: '马坡网球馆',
  courtNo: '3',
  finalCourtFee: 500,
  bookingStatus: 'booked'
});
assert.equal(booking.finalCourtFee, 500);
assert.equal(booking.bookingStatus, 'booked');

assert.equal(rules.resolveFinalAttendanceStatus({ selfStatus: 'attended', creatorStatus: 'pending' }), 'pending');
assert.equal(rules.resolveFinalAttendanceStatus({ selfStatus: 'pending', creatorStatus: 'absent' }), 'absent');
assert.equal(rules.resolveFinalAttendanceStatus({ selfStatus: 'attended', creatorStatus: 'attended' }), 'attended');

const ledger = rules.buildMatchFeeLedger({
  matchId: 'm1',
  estimatedCourtFee: 480,
  finalCourtFee: 500,
  participants: [
    { userId: 'u1', finalStatus: 'attended' },
    { userId: 'u2', finalStatus: 'attended' },
    { userId: 'u3', finalStatus: 'absent', chargeAbsent: true }
  ]
});
assert.equal(ledger.record.participantCount, 3);
assert.equal(ledger.record.finalCourtFee, 500);
assert.deepEqual(ledger.splits.map(x => x.amount), [167, 167, 166]);
assert.equal(ledger.splits.reduce((sum, row) => sum + row.amount, 0), 500);

assert.throws(() => rules.buildMatchFeeLedger({
  matchId: 'm1',
  estimatedCourtFee: 480,
  finalCourtFee: 500,
  participants: [{ userId: 'u1', finalStatus: 'absent' }]
}), /没有可计费参与人/);

const withdrawal = rules.assertBookedWithdrawalInput({ financialResponsibility: 'charge', reason: '临时有事' });
assert.equal(withdrawal.financialResponsibility, 'charge');
assert.equal(withdrawal.reason, '临时有事');
assert.throws(() => rules.assertBookedWithdrawalInput({ financialResponsibility: 'skip' }), /退赛责任不正确/);

const profileStats = rules.buildMatchProfileStats({
  userId: 'u1',
  createdMatches: [{ id: 'm1' }, { id: 'm2' }],
  joinedMatches: [{ id: 'm1' }, { id: 'm3' }],
  attendanceRows: [
    { matchId: 'm1', finalStatus: 'attended', matchStatus: 'settled' },
    { matchId: 'm2', finalStatus: 'absent', matchStatus: 'settled' },
    { matchId: 'm3', finalStatus: 'attended', matchStatus: 'fee_pending' }
  ],
  feeSplits: [
    { amount: 167, payStatus: 'paid' },
    { amount: 166, payStatus: 'pending' }
  ]
});
assert.equal(profileStats.createdCount, 2);
assert.equal(profileStats.joinedCount, 2);
assert.equal(profileStats.matchCreatedCount, 2);
assert.equal(profileStats.matchJoinedCount, 2);
assert.equal(profileStats.attendanceRate, 50);
assert.equal(profileStats.attendanceRateText, '50%');
assert.equal(profileStats.totalFeeAmount, 333);

const matchCourtHistoryRow = rules.buildMatchCourtFinanceHistoryRow({
  match: {
    id: 'm1',
    title: '周末双打',
    starttime: '2026-04-22T10:00:00.000Z',
    endtime: '2026-04-22T12:00:00.000Z',
    venuename: '马坡网球馆'
  },
  split: { id: 'split-1', amount: 125 },
  user: { nickName: '球友A', phone: '13800000000' },
  operatorId: 'dandan',
  now: '2026-04-22T13:00:00.000Z'
});
assert.equal(matchCourtHistoryRow.type, '消费');
assert.equal(matchCourtHistoryRow.category, '订场');
assert.equal(matchCourtHistoryRow.sourceCategory, '约球订场');
assert.equal(matchCourtHistoryRow.payMethod, '微信转账');
assert.equal(matchCourtHistoryRow.revenueBucket, '现场收款');
assert.equal(matchCourtHistoryRow.amount, 125);
assert.equal(matchCourtHistoryRow.matchId, 'm1');
assert.equal(matchCourtHistoryRow.matchFeeSplitId, 'split-1');
assert.equal(matchCourtHistoryRow.startTime, '10:00');
assert.equal(matchCourtHistoryRow.endTime, '12:00');
assert.match(matchCourtHistoryRow.note, /约球订场/);

const matchRevenueSummary = rules.summarizeCourtFinanceRevenue({
  history: [matchCourtHistoryRow]
});
assert.equal(matchRevenueSummary.matchBooking, 125);
assert.equal(matchRevenueSummary.confirmedRevenue, 125);

const matchRefundHistoryRow = rules.buildMatchCourtFinanceRefundRow({
  paidRow: matchCourtHistoryRow,
  split: { id: 'split-1', amount: 125, paidAmount: 125 },
  operatorId: 'dandan',
  note: '用户退款',
  now: '2026-04-22T14:00:00.000Z'
});
assert.equal(matchRefundHistoryRow.type, '退款');
assert.equal(matchRefundHistoryRow.category, '订场');
assert.equal(matchRefundHistoryRow.sourceCategory, '约球订场');
assert.equal(matchRefundHistoryRow.amount, 125);
assert.equal(matchRefundHistoryRow.matchFeeSplitId, 'split-1');
assert.match(matchRefundHistoryRow.note, /用户退款/);

assert.throws(() => rules.assertMatchFeeSplitUpdateInput({ payStatus: 'waived' }), /请填写原因/);
assert.throws(() => rules.assertMatchFeeSplitUpdateInput({ payStatus: 'abnormal' }), /请填写原因/);
assert.throws(() => rules.assertMatchFeeSplitUpdateInput({ payStatus: 'refunded' }), /请填写原因/);
assert.equal(rules.assertMatchFeeSplitUpdateInput({ payStatus: 'paid' }).payStatus, 'paid');
assert.equal(rules.assertMatchFeeSplitUpdateInput({ payStatus: 'refunded', note: '重复收款退回' }).note, '重复收款退回');

const dailyReport = rules.buildMatchFinanceDailyReport({
  date: '2026-04-22',
  feeSplits: [
    { id: 'split-1', matchId: 'm1', userId: 'u1', amount: 125, paidAmount: 125, payStatus: 'paid', updatedAt: '2026-04-22T10:00:00.000Z' },
    { id: 'split-2', matchId: 'm1', userId: 'u2', amount: 125, paidAmount: 0, payStatus: 'pending', updatedAt: '2026-04-22T10:00:00.000Z' },
    { id: 'split-3', matchId: 'm2', userId: 'u3', amount: 80, paidAmount: 0, payStatus: 'waived', updatedAt: '2026-04-22T10:00:00.000Z' },
    { id: 'split-4', matchId: 'm3', userId: 'u4', amount: 60, paidAmount: 0, payStatus: 'abnormal', updatedAt: '2026-04-22T10:00:00.000Z' }
  ],
  financeHistory: [
    { id: 'income-1', type: '消费', category: '订场', sourceCategory: '约球订场', amount: 125, occurredDate: 'Wed Apr 22', createdAt: '2026-04-22T11:00:00.000Z', matchFeeSplitId: 'split-1' },
    { id: 'refund-1', type: '退款', category: '订场', sourceCategory: '约球订场', amount: 25, occurredDate: '2026-04-22', matchFeeSplitId: 'split-1' }
  ]
});
assert.equal(dailyReport.summary.receivable, 390);
assert.equal(dailyReport.summary.paid, 125);
assert.equal(dailyReport.summary.pending, 125);
assert.equal(dailyReport.summary.waived, 80);
assert.equal(dailyReport.summary.abnormal, 60);
assert.equal(dailyReport.summary.refunded, 25);
assert.equal(dailyReport.summary.ledgerIncome, 125);
assert.equal(dailyReport.summary.ledgerRefund, 25);
assert.equal(dailyReport.summary.ledgerNet, 100);
assert.equal(dailyReport.summary.expectedNet, 100);
assert.equal(dailyReport.summary.diff, 0);

console.log('match-api rules ok');
