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
  }, {
    id: 'trial-finished-paid',
    studentName: '体验学员',
    coach: '王教练',
    campus: 'shunyi_mapo',
    courseType: '体验课',
    experienceType: '私教体验课',
    startTime: '2026-06-03 15:30:45',
    endTime: '2026-06-03 16:30:45',
    status: '已结束',
    settlementType: 'direct',
    confirmStatus: '待确认',
    paidAmount: 149,
    payMethod: '微信'
  }, {
    id: 'trial-future-pending',
    studentName: '未上课体验学员',
    coach: '王教练',
    campus: 'shunyi_mapo',
    courseType: '体验课',
    experienceType: '私教体验课',
    startTime: '2026-06-10 15:30:45',
    endTime: '2026-06-10 16:30:45',
    status: '已排课',
    settlementType: 'direct',
    confirmStatus: '待确认',
    paidAmount: 149,
    payMethod: '微信'
  }, {
    id: 'trial-row-future-pending',
    studentName: '多人未上课体验学员',
    coach: '王教练',
    campus: 'shunyi_mapo',
    courseType: '体验课',
    experienceType: '私教体验课',
    startTime: '2026-06-10 17:00:00',
    endTime: '2026-06-10 18:00:00',
    status: '已排课',
    studentSettlementRows: JSON.stringify([{
      studentId: 'stu-1',
      studentName: '多人未上课体验学员',
      settlementType: 'direct',
      confirmStatus: '待确认',
      amount: 200,
      payMethod: '微信'
    }])
  }, {
    id: 'companion-with-field-fee',
    studentName: '陪打学员',
    coach: '王教练',
    campus: 'shunyi_mapo',
    courseType: '陪打',
    startTime: '2026-06-04 17:00:00',
    endTime: '2026-06-04 18:00:00',
    status: '已结束',
    settlementType: 'direct',
    paidAmount: 200,
    payMethod: '微信',
    fieldFeeAmount: 112,
    fieldFeePayMethod: '微信'
  }]
});

const purchase = snapshot.financeNormalizedRows.find(row => row.id === 'purchase-purchase-1');
assert.strictEqual(purchase.transactionType, '收款');
assert.strictEqual(purchase.normalizedPaymentMethod, '微信');
assert.strictEqual(purchase.businessTypeLevel1, '课程');
assert.strictEqual(purchase.businessTypeLevel2, '小班课');
assert.strictEqual(purchase.businessTypeLevel3, '训练营');
assert.strictEqual(purchase.displayBusinessType, '课程 / 小班课 / 训练营');
assert.strictEqual(purchase.revenueCategoryLevel1, '课程服务');
assert.strictEqual(purchase.revenueCategoryLevel2, '小班课-训练营');
assert.strictEqual(purchase.revenueCategoryDisplay, '课程服务 / 小班课-训练营');
assert.strictEqual(purchase.businessDate, '2026-06-01 08:09:10');

const consume = snapshot.financeNormalizedRows.find(row => row.id === 'consume-ledger-1');
assert.strictEqual(consume.transactionType, '消耗');
assert.strictEqual(consume.normalizedPaymentMethod, '课包划扣');
assert.strictEqual(consume.businessDate, '2026-06-02 10:00:00');

const storedConsume = snapshot.financeNormalizedRows.find(row => row.id.includes('court-1-h1'));
assert.strictEqual(storedConsume.transactionType, '消耗');
assert.strictEqual(storedConsume.normalizedPaymentMethod, '储值扣款');
assert.strictEqual(storedConsume.displayBusinessType, '场地 / 会员订场');
assert.strictEqual(storedConsume.revenueCategoryDisplay, '场地服务 / 会员订场');
assert.strictEqual(storedConsume.businessDate, '2026-06-03');

const reverse = snapshot.financeNormalizedRows.find(row => row.id.includes('court-1-h2'));
assert.strictEqual(reverse.transactionType, '退款');
assert.strictEqual(reverse.transactionAmount, -200);

const finishedTrial = snapshot.financeNormalizedRows.find(row => row.id === 'schedule-direct-trial-finished-paid');
assert.strictEqual(finishedTrial.revenueCategoryDisplay, '课程服务 / 体验课 / 私教体验课');
assert.strictEqual(finishedTrial.cashDelta, 149);
assert.strictEqual(finishedTrial.recognizedRevenueDelta, 149, '已结束且已收款的体验课必须自动核销入账');

const futureTrial = snapshot.financeNormalizedRows.find(row => row.id === 'schedule-direct-trial-future-pending');
assert.strictEqual(futureTrial.cashDelta, 149);
assert.strictEqual(futureTrial.recognizedRevenueDelta, 0, '未完成且待确认的体验课不能提前入账');

const futureTrialRow = snapshot.financeNormalizedRows.find(row => row.id === 'schedule-direct-trial-row-future-pending-stu-1');
assert.strictEqual(futureTrialRow.cashDelta, 200);
assert.strictEqual(futureTrialRow.recognizedRevenueDelta, 0, '多人结算行未完成且待确认时也不能提前入账');

const companionServiceFee = snapshot.financeNormalizedRows.find(row => row.id === 'schedule-direct-companion-with-field-fee');
assert.strictEqual(companionServiceFee.cashDelta, 200);
assert.strictEqual(companionServiceFee.revenueCategoryDisplay, '课程服务 / 陪打服务费', '陪打服务费必须进入课程服务');

const companionFieldFee = snapshot.financeNormalizedRows.find(row => row.id === 'schedule-field-fee-companion-with-field-fee');
assert.strictEqual(companionFieldFee.cashDelta, 112);
assert.strictEqual(companionFieldFee.revenueCategoryDisplay, '场地服务 / 陪打场地费', '陪打场地费必须单独进入场地服务');
assert.strictEqual(companionFieldFee.sourceDocument, companionServiceFee.sourceDocument, '陪打两笔流水必须保留同一个排课来源');

const courtSwapSnapshot = _test.buildFinancePageSnapshot({
  campuses: [{ id: 'shunyi_mapo', code: 'shunyi_mapo', name: '顺义马坡' }],
  courts: [{ id: 'court-swap', name: '赵晶', campus: 'shunyi_mapo', history: [
    { id: 'paid-three', date: '2026-09-12', type: '消费', category: '订场', payMethod: '储值扣款',
      amount: 352, venue: '3号场', startTime: '12:00', endTime: '14:00' },
    { id: 'swap-four', date: '2026-09-12', type: '消费', category: '内部占用', payMethod: '不涉及支付',
      amount: 0, venue: '4号场', startTime: '12:00', endTime: '14:00', note: '换场占位，无额外收款' }
  ] }]
});
const courtSwapRows = courtSwapSnapshot.financeNormalizedRows.filter(row => row.customer === '赵晶' && row.businessDate === '2026-09-12');
assert.strictEqual(courtSwapRows.filter(row => Number(row.recognizedRevenueDelta || 0) > 0).length, 1, '换场后同一时段只能有一笔正收入');
assert.strictEqual(courtSwapRows.reduce((sum, row) => sum + Number(row.recognizedRevenueDelta || 0), 0), 352, '换场占位不能增加已入账收入');
assert.strictEqual(courtSwapRows.reduce((sum, row) => sum + Number(row.cashDelta || 0), 0), 0, '会员储值支付和换场占位不能虚增微信实收');

console.log('finance standard ledger tests passed');
