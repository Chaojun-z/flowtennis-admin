const assert = require('assert');
const { _test } = require('../api/index.js');

const snapshot = _test.buildFinancePageSnapshot({
  campuses: [{ id: 'shunyi_mapo', code: 'shunyi_mapo', name: '顺义马坡' }],
  students: [{ id: 'stu-1', campus: 'shunyi_mapo' }],
  purchases: [{
    id: 'purchase-1',
    studentId: 'stu-1',
    studentName: '张三',
    packageName: '训练营10节课包',
    courseType: '训练营',
    amountPaid: 3000,
    purchaseDate: '2026-06-01',
    createdAt: '2026-06-01 08:09:10',
    payMethod: '微信转账支付',
    status: 'active'
  }],
  entitlements: [{
    id: 'ent-1',
    purchaseId: 'purchase-1',
    studentId: 'stu-1',
    studentName: '张三',
    packageName: '训练营10节课包',
    totalLessons: 10,
    remainingLessons: 9,
    campusIds: ['shunyi_mapo']
  }],
  entitlementLedger: [{
    id: 'ledger-1',
    entitlementId: 'ent-1',
    studentId: 'stu-1',
    lessonDelta: -1,
    scheduleId: 'schedule-1',
    relatedDate: '2026-06-02',
    createdAt: '2026-06-02 10:00:00'
  }],
  courts: [{
    id: 'court-1',
    name: '李四',
    campus: 'shunyi_mapo',
    history: [{
      id: 'h1',
      date: '2026-06-03',
      type: '消费',
      category: '订场',
      payMethod: '储值扣款',
      amount: 200,
      startTime: '2026-06-03 12:34:56'
    }, {
      id: 'h2',
      date: '2026-06-04',
      type: '冲正',
      category: '订场',
      payMethod: '储值扣款',
      amount: 200
    }]
  }],
  schedule: [{
    id: 'schedule-1',
    studentName: '张三',
    coach: '王教练',
    campus: 'shunyi_mapo',
    courseType: '私教',
    startTime: '2026-06-02 15:30:45',
    endTime: '2026-06-02 16:30:45',
    status: '已结束'
  }]
});

const purchase = snapshot.financeNormalizedRows.find(row => row.id === 'purchase-purchase-1');
assert.strictEqual(purchase.transactionType, '收款');
assert.strictEqual(purchase.normalizedPaymentMethod, '微信');
assert.strictEqual(purchase.businessTypeLevel1, '课程');
assert.strictEqual(purchase.businessTypeLevel2, '小班课');
assert.strictEqual(purchase.businessTypeLevel3, '训练营');
assert.strictEqual(purchase.displayBusinessType, '课程 / 小班课 / 训练营');
assert.strictEqual(purchase.businessDate, '2026-06-01 08:09:10');

const consume = snapshot.financeNormalizedRows.find(row => row.id === 'consume-ledger-1');
assert.strictEqual(consume.transactionType, '消耗');
assert.strictEqual(consume.normalizedPaymentMethod, '课包划扣');
assert.strictEqual(consume.businessDate, '2026-06-02 10:00:00');

const storedConsume = snapshot.financeNormalizedRows.find(row => row.id.includes('court-1-h1'));
assert.strictEqual(storedConsume.transactionType, '消耗');
assert.strictEqual(storedConsume.normalizedPaymentMethod, '储值扣款');
assert.strictEqual(storedConsume.displayBusinessType, '场地 / 会员订场');
assert.strictEqual(storedConsume.businessDate, '2026-06-03');

const reverse = snapshot.financeNormalizedRows.find(row => row.id.includes('court-1-h2'));
assert.strictEqual(reverse.transactionType, '退款');
assert.strictEqual(reverse.transactionAmount, -200);

console.log('finance standard ledger tests passed');
