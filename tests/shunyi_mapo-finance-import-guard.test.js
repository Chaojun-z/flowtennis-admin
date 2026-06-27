const assert = require('assert');
const core = require('../scripts/lib/shunyi_mapo-import-core');

assert.strictEqual(core.lessonStudentName('哈库呐'), '线熙宇（哈库呐玛塔塔）', '哈库呐 should map to the confirmed package owner');
assert.strictEqual(core.lessonStudentName('siren  张佳良 老大 私教课'), '张佳良老大', '张佳良老大 should not collapse to parent name');
assert.strictEqual(core.lessonStudentName('朝珺 苏女士 私教课'), 'LKY（苏女士）', '苏女士 should map to the online student name');

const cashCourse = {
  __no: 1,
  日期: '2026-05-22',
  '客户/学员': 'siren 佳琪 私教体验课',
  收入类型: '私教体验课',
  支付方式: '大众点评支付',
  '实收/核销': '239'
};
const student = { id: 'student-1', name: '佳琪', phone: '' };
const purchase = core.buildPurchaseRecordFromIncome(cashCourse, student, { id: 'purchase-1', lessonCount: 1 });
assert.strictEqual(purchase.amountPaid, 239, 'cash trial lesson should create cash income');
assert.strictEqual(purchase.sourceType, 'lesson_payment', 'cash trial lesson should stay as lesson payment');

const courtHistory = core.buildCourtHistoryRecord({
  日期: '2026-05-22',
  时间: '15-17点',
  '客户/学员': '毛彬 订场',
  收入类型: '散客纯定场（运营）',
  支付方式: '8折储值卡',
  '实收/核销': '224'
});
courtHistory.payMethod = '储值扣款';
const court = core.applyCourtHistoryToCourt({ id: 'court-1', name: '毛彬', history: [{ id: 'topup', date: '2026-05-01', type: '充值', category: '会员充值', payMethod: '会员充值', amount: 1000 }] }, courtHistory);
assert.strictEqual(court.balance, 776, 'stored value booking should reduce member balance');
assert.strictEqual(court.storedValueSpent, 224, 'stored value booking should be recognized as stored value consumption');
assert.strictEqual(court.receivedAmount, 1000, 'stored value booking should not add new cash received');

const duplicateMemberRows = [
  {
    __rowNo: 1977,
    原表行号: '1977',
    日期: '2026-05-18',
    时间: '10点30-11点30',
    '客户/学员': '王大人 订场',
    收入类型: '散客纯定场（小程序）',
    支付方式: '8折储值卡',
    '实收/核销': '112'
  },
  {
    __rowNo: 1995,
    原表行号: '1995',
    日期: '2026-05-19',
    时间: '14点30-15点30',
    '客户/学员': '王大人 订场',
    收入类型: '散客纯定场（小程序）',
    支付方式: '8折储值卡',
    '实收/核销': '112'
  }
];
const courtWrites = core.buildCourtHistoryWriteRows(duplicateMemberRows, [{ id: 'court-wang', name: '王大人 订场', history: [] }], { now: '2026-05-24 00:00:00' });
assert.strictEqual(courtWrites.length, 1, 'same court member should be written once');
assert.strictEqual(courtWrites[0].history.filter((row) => row.seedTag === core.IMPORT_TAG).length, 2, 'same court member should keep all import history rows');
assert.strictEqual(courtWrites[0].storedValueSpent, 224, 'same court member should aggregate all stored value booking rows');

const partialCourt = core.buildCourtHistoryWriteRows([duplicateMemberRows[0]], [{ id: 'court-wang', name: '王大人 订场', history: [] }], { now: '2026-05-24 00:00:00' })[0];
const repairWrites = core.buildMissingCourtHistoryWriteRows(duplicateMemberRows, [partialCourt], { now: '2026-05-24 00:00:00' });
assert.strictEqual(repairWrites.length, 1, 'court repair should write only accounts with missing history');
assert.strictEqual(repairWrites[0].history.filter((row) => row.seedTag === core.IMPORT_TAG).length, 2, 'court repair should append missing rows without duplicating existing rows');
assert.strictEqual(repairWrites[0].storedValueSpent, 224, 'court repair should recalculate finance after appending missing rows');

console.log('shunyi_mapo finance import guard tests passed');
