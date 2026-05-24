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
    },{
      id:'court-row-recharge',
      date:'2026-04-22',
      occurredDate:'2026-04-22',
      category:'会员充值',
      type:'充值',
      amount:5000,
      payMethod:'会员充值',
      membershipOrderId:'member-order-1'
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

const verifiedFinance = {
  overviewData: {
    all: {
      cash: 1000,
      recognized: 200,
      deferred: 800,
      packageIncome: 1000,
      packageRecognized: 200,
      storedValueIncome: 0,
      storedValueConsumed: 0,
      bookingIncome: 0,
      bookingRecognized: 0,
      tradeCount: 10
    },
    campuses: []
  },
  normalizedRows: [{ id: 'verified-old-row', businessType: '课程', action: '收款', cashDelta: 1000 }]
};

const merged = _test.buildVerifiedFinanceWithImportIncrements(verifiedFinance, {
  campuses:[{ id:'mabao', code:'mabao', name:'顺义马坡' }],
  students:[{ id:'stu-import', campus:'mabao' },{ id:'stu-old', campus:'mabao' }],
  purchases:[{
    id:'private_lesson_csv_import_20260519_TEST:purchase:张三',
    studentId:'stu-import',
    studentName:'张三',
    packageName:'成人10节课包',
    amountPaid:4000,
    purchaseDate:'2026-04-23',
    payMethod:'微信',
    status:'active'
  },{
    id:'old-purchase-should-not-double-count',
    studentId:'stu-old',
    studentName:'老数据',
    packageName:'成人10节课包',
    amountPaid:9999,
    purchaseDate:'2026-04-20',
    payMethod:'微信',
    status:'active'
  }],
  entitlements:[{
    id:'private_lesson_csv_import_20260519_TEST:entitlement:张三',
    purchaseId:'private_lesson_csv_import_20260519_TEST:purchase:张三',
    studentId:'stu-import',
    studentName:'张三',
    packageName:'成人10节课包',
    totalLessons:10,
    remainingLessons:9,
    campusIds:['mabao']
  },{
    id:'old-entitlement-should-not-double-count',
    purchaseId:'old-purchase-should-not-double-count',
    studentId:'stu-old',
    totalLessons:10,
    remainingLessons:0,
    campusIds:['mabao']
  }],
  entitlementLedger:[{
    id:'private_lesson_csv_import_20260519_TEST:ledger:张三:2026-04',
    entitlementId:'private_lesson_csv_import_20260519_TEST:entitlement:张三',
    studentId:'stu-import',
    purchaseId:'private_lesson_csv_import_20260519_TEST:purchase:张三',
    lessonDelta:-1,
    reason:'4月消课',
    relatedDate:'2026-04-30',
    createdAt:'2026-04-30T10:00:00.000Z',
    importSource:'系统导入'
  },{
    id:'old-ledger-should-not-double-count',
    entitlementId:'old-entitlement-should-not-double-count',
    studentId:'stu-old',
    lessonDelta:-10,
    relatedDate:'2026-04-30'
  }],
  schedule:[]
});

assert.strictEqual(merged.normalizedRows.length, 3, 'verified finance should keep base rows and append only import increment receipt/consume rows');
assert.strictEqual(merged.overviewData.all.cash, 5000, 'finance import increment should add course cash income');
assert.strictEqual(merged.overviewData.all.packageIncome, 5000, 'finance import increment should add package income');
assert.strictEqual(merged.overviewData.all.recognized, 600, 'finance import increment should add recognized course income');
assert.strictEqual(merged.overviewData.all.packageRecognized, 600, 'finance import increment should add package recognized income');
assert.strictEqual(merged.overviewData.all.deferred, 4400, 'finance import increment should add remaining deferred income');
assert.strictEqual(merged.overviewData.all.tradeCount, 11, 'finance import increment should add purchase trade count');
assert.strictEqual(merged.normalizedRows.some(row=>String(row.sourceDocument||'').includes('old-purchase-should-not-double-count')), false, 'old live purchase rows should not be appended to verified finance');

const membershipMerged = _test.buildVerifiedFinanceWithImportIncrements(verifiedFinance, {
  campuses:[{ id:'mabao', code:'mabao', name:'顺义马坡' }],
  membershipOrders:[{
    id:'membership-import-order-20260520-test',
    courtId:'court-import',
    courtName:'订场会员导入',
    rechargeAmount:2000,
    purchaseDate:'2026-04-25',
    payMethod:'会员充值',
    status:'active'
  },{
    id:'old-member-order-should-not-double-count',
    courtId:'court-old',
    courtName:'老会员',
    rechargeAmount:9999,
    purchaseDate:'2026-04-20',
    payMethod:'会员充值',
    status:'active'
  }]
});

assert.strictEqual(membershipMerged.normalizedRows.length, 2, 'verified finance should append only imported membership recharge rows');
assert.strictEqual(membershipMerged.overviewData.all.cash, 3000, 'membership import increment should add stored value cash income');
assert.strictEqual(membershipMerged.overviewData.all.deferred, 2800, 'membership import increment should add stored value deferred income');
assert.strictEqual(membershipMerged.overviewData.all.storedValueIncome, 2000, 'membership import increment should add stored value income bucket');
assert.strictEqual(membershipMerged.overviewData.all.tradeCount, 11, 'membership import increment should add membership trade count');
assert.strictEqual(membershipMerged.normalizedRows.some(row=>String(row.sourceDocument||'').includes('old-member-order-should-not-double-count')), false, 'old live membership orders should not be appended to verified finance');

const courtMerged = _test.buildVerifiedFinanceWithImportIncrements(verifiedFinance, {
  campuses:[{ id:'mabao', code:'mabao', name:'顺义马坡' }],
  courts:[{
    id:'court-import',
    name:'马坡订场导入',
    campus:'mabao',
    history:[{
      id:'private_lesson_csv_import_20260524-court-test',
      seedTag:'mabao-finance-import-20260524',
      date:'2026-05-22',
      type:'消费',
      category:'订场',
      payMethod:'小程序',
      amount:180,
      sourceCategory:'散客纯定场（小程序）'
    },{
      id:'old-court-history-should-not-count',
      date:'2026-05-22',
      type:'消费',
      category:'订场',
      payMethod:'小程序',
      amount:999
    }]
  }]
});

assert.strictEqual(courtMerged.overviewData.all.cash, 1180, 'MaPo court import should add booking cash income');
assert.strictEqual(courtMerged.overviewData.all.recognized, 380, 'MaPo court import should add booking recognized income');
assert.strictEqual(courtMerged.overviewData.all.bookingIncome, 180, 'MaPo court import should update booking income bucket');
assert.strictEqual(courtMerged.overviewData.all.bookingRecognized, 180, 'MaPo court import should update booking recognized bucket');
assert.strictEqual(courtMerged.normalizedRows.some(row=>String(row.sourceDocument||'').includes('old-court-history-should-not-count')), false, 'old court history should not be appended as verified finance increment');

console.log('finance snapshot tests passed');
