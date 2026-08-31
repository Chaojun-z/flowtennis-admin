const assert = require('assert');

const {
  buildStudentQuickCreatePayload,
  normalizeStudentSettlementRows,
  serializeStudentSettlementRows,
  summarizeStudentSettlementRows,
  settlementRowLabel
} = require('../public/assets/scripts/pages/schedule-settlement.js');

const payload = buildStudentQuickCreatePayload({
  name: '  王小明  ',
  phone: ' 13800138000 ',
  campus: ' 顺义马坡 ',
  source: ' 朋友介绍 ',
  notes: '  先排课  '
});

assert.deepStrictEqual(payload, {
  name: '王小明',
  phone: '13800138000',
  campus: '顺义马坡',
  source: '朋友介绍',
  notes: '先排课',
  skipDuplicateCheck: true
});

const rows = normalizeStudentSettlementRows({
  studentIds: ['s1', 's2', 's2', '', null],
  defaultSettlementType: 'package',
  existingRows: [{ studentId: 's1', settlementType: 'direct', payMethod: '微信', amount: 120 }]
});

assert.strictEqual(rows.length, 2);
assert.strictEqual(rows[0].studentId, 's1');
assert.strictEqual(rows[0].settlementType, 'direct');
assert.strictEqual(rows[0].custom, true);
assert.strictEqual(rows[0].fieldFeeMode, 'none');
assert.strictEqual(rows[1].studentId, 's2');
assert.strictEqual(rows[1].settlementType, 'package');
assert.strictEqual(rows[1].custom, false);
assert.strictEqual(settlementRowLabel(rows[0]), '直接收款 · 微信 ¥120');
assert.strictEqual(summarizeStudentSettlementRows(rows), '1人直接收款 / 1人课包扣减');

const defaultChangedRows = normalizeStudentSettlementRows({
  studentIds: ['s1', 's2'],
  defaultSettlementType: 'direct',
  existingRows: rows
});

assert.strictEqual(defaultChangedRows[0].settlementType, 'direct', 'custom row should keep its override');
assert.strictEqual(defaultChangedRows[1].settlementType, 'direct', 'non-custom row should follow the new default');

assert.deepStrictEqual(serializeStudentSettlementRows(defaultChangedRows), [
  { studentId: 's1', settlementType: 'direct', payMethod: '微信', amount: 120, fieldFeeMode: 'none', fieldFeePayMethod: '', fieldFeeAmount: 0, entitlementId: '', note: '' },
  { studentId: 's2', settlementType: 'direct', payMethod: '微信', amount: 0, fieldFeeMode: 'none', fieldFeePayMethod: '', fieldFeeAmount: 0, entitlementId: '', note: '' }
]);

assert.deepStrictEqual(
  serializeStudentSettlementRows(normalizeStudentSettlementRows({
    studentIds: ['s1', 's2'],
    defaultSettlementType: 'package',
    existingRows: [
      { studentId: 's1', settlementType: 'package', fieldFeeMode: 'separate', fieldFeePayMethod: '微信', fieldFeeAmount: 30 },
      { studentId: 's2', settlementType: 'direct', payMethod: '现金', amount: 150, fieldFeeMode: 'separate', fieldFeePayMethod: '储值扣款', fieldFeeAmount: 20 }
    ]
  })),
  [
    { studentId: 's1', settlementType: 'package', payMethod: '', amount: 0, fieldFeeMode: 'separate', fieldFeePayMethod: '微信', fieldFeeAmount: 30, entitlementId: '', note: '' },
    { studentId: 's2', settlementType: 'direct', payMethod: '现金', amount: 150, fieldFeeMode: 'separate', fieldFeePayMethod: '储值扣款', fieldFeeAmount: 20, entitlementId: '', note: '' }
  ],
  'small group settlement should keep a full payment and field-fee set per student'
);

console.log('schedule settlement helper tests passed');
