const assert = require('assert');
const { _test } = require('../api/index.js');

const snapshot = _test.buildFinancePageSnapshot({
  campuses:[{ id:'mabao', code:'mabao', name:'顺义马坡' }],
  students:[{ id:'stu-1', campus:'mabao' }],
  purchases:[{
    id:'purchase-1',
    studentId:'stu-1',
    studentName:'张三',
    packageName:'成人10节课包',
    amountPaid:4000,
    purchaseDate:'2026-04-23',
    payMethod:'微信',
    status:'active'
  }],
  entitlements:[{
    id:'ent-1',
    purchaseId:'purchase-1',
    studentId:'stu-1',
    studentName:'张三',
    packageName:'成人10节课包',
    totalLessons:10,
    remainingLessons:9,
    campusIds:['mabao']
  }],
  entitlementLedger:[{
    id:'ledger-1',
    entitlementId:'ent-1',
    studentId:'stu-1',
    scheduleId:'sch-1',
    lessonDelta:-1,
    action:'consume',
    reason:'正常扣课',
    relatedDate:'2026-04-24',
    createdAt:'2026-04-24T10:00:00.000Z'
  }],
  courts:[{
    id:'court-1',
    name:'李四 订场',
    campus:'mabao',
    history:[{
      id:'court-row-1',
      date:'2026-04-23',
      occurredDate:'2026-04-23',
      category:'订场',
      type:'消费',
      amount:200,
      payMethod:'微信'
    }]
  }],
  membershipOrders:[{
    id:'member-order-1',
    courtId:'court-1',
    courtName:'李四',
    rechargeAmount:5000,
    purchaseDate:'2026-04-22',
    payMethod:'会员充值',
    status:'active'
  }],
  schedule:[{
    id:'sch-1',
    studentName:'张三',
    coach:'王教练',
    campus:'mabao',
    courseType:'私教',
    lessonCount:1,
    status:'已结束',
    startTime:'2026-04-24T09:00:00.000Z',
    endTime:'2026-04-24T10:00:00.000Z'
  }]
});

assert.ok(Array.isArray(snapshot.financeNormalizedRows), 'finance snapshot should expose normalized ledger rows');
assert.ok(Array.isArray(snapshot.financeSettlementRows), 'finance snapshot should expose settlement rows');
assert.strictEqual(snapshot.financeNormalizedRows.filter(row=>row.businessType==='课程'&&row.action==='收款').length, 1, 'finance snapshot should include course receipt rows');
assert.strictEqual(snapshot.financeNormalizedRows.filter(row=>row.businessType==='课程'&&row.action==='消耗').length, 1, 'finance snapshot should include course consume rows');
assert.strictEqual(snapshot.financeNormalizedRows.filter(row=>row.businessType==='会员储值'&&row.action==='收款').length, 1, 'finance snapshot should include membership recharge rows');
assert.strictEqual(snapshot.financeNormalizedRows.filter(row=>row.businessType==='散客订场'&&row.action==='收款').length, 1, 'finance snapshot should include court cash rows');
assert.strictEqual(snapshot.financeSettlementRows[0].month, '2026-04', 'finance settlement snapshot should pre-aggregate by month');
assert.strictEqual(snapshot.financeSettlementRows[0].lessonUnits, 1, 'finance settlement snapshot should count finished lesson units');

console.log('finance snapshot tests passed');
