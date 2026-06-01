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

const directScheduleSnapshot = _test.buildFinancePageSnapshot({
  campuses:[{ id:'mabao', code:'mabao', name:'顺义马坡' }],
  schedule:[{
    id:'sch-direct-1',
    studentName:'点评体验用户',
    coach:'Siren',
    campus:'mabao',
    courseType:'体验课',
    experienceType:'私教体验课',
    lessonCount:1,
    status:'已结束',
    startTime:'2026-05-29 09:00',
    endTime:'2026-05-29 10:00',
    settlementType:'direct',
    payMethod:'大众点评券码',
    paidAmount:99,
    notes:'大众点评券码 DP123'
  },{
    id:'sch-gift-1',
    studentName:'赠送体验用户',
    coach:'Siren',
    campus:'mabao',
    courseType:'体验课',
    lessonCount:1,
    status:'已结束',
    startTime:'2026-05-29 10:00',
    endTime:'2026-05-29 11:00',
    settlementType:'gift',
    payMethod:'赠送',
    paidAmount:0
  }]
});

const directIncome = directScheduleSnapshot.financeNormalizedRows.find(row=>row.sourceDocument==='排课 sch-direct-1'&&row.action==='收款');
assert.ok(directIncome, 'direct paid schedule should create a course income row');
assert.strictEqual(directIncome.cashDelta, 99, 'direct paid schedule should increase cash income');
assert.strictEqual(directIncome.recognizedRevenueDelta, 99, 'direct paid schedule should be recognized immediately');
assert.strictEqual(directIncome.deferredRevenueDelta, 0, 'direct paid schedule should not create deferred revenue');
assert.strictEqual(directIncome.paymentChannel, '大众点评券码', 'direct paid schedule should keep payment method');
assert.strictEqual(directScheduleSnapshot.financeNormalizedRows.some(row=>row.sourceDocument==='排课 sch-gift-1'), false, 'gift schedule should not create finance rows');
assert.strictEqual(directScheduleSnapshot.financeOverviewData.all.courseIncome, 99, 'course total income should include direct paid schedules');
assert.strictEqual(directScheduleSnapshot.financeOverviewData.all.directCourseIncome, 99, 'direct course income should include only non-package paid schedules');
assert.strictEqual(directScheduleSnapshot.financeOverviewData.all.packageIncome, 0, 'package income should not include direct paid schedules');
assert.strictEqual(directScheduleSnapshot.financeOverviewData.all.courseRecognized, 99, 'course recognized should include direct paid schedules');
assert.strictEqual(directScheduleSnapshot.financeOverviewData.all.directCourseRecognized, 99, 'direct course recognized should include only non-package paid schedules');
assert.strictEqual(directScheduleSnapshot.financeOverviewData.all.packageRecognized, 0, 'package recognized should stay package-only');

const voidedPurchaseSnapshot = _test.buildFinancePageSnapshot({
  campuses:[{ id:'mabao', code:'mabao', name:'顺义马坡' }],
  students:[{ id:'stu-voided', campus:'mabao' }],
  purchases:[{
    id:'purchase-voided',
    studentId:'stu-voided',
    studentName:'作废课包',
    packageName:'成人10节课包',
    amountPaid:5000,
    purchaseDate:'2026-06-01',
    payMethod:'微信',
    status:'voided'
  },{
    id:'purchase-active',
    studentId:'stu-voided',
    studentName:'有效课包',
    packageName:'成人10节课包',
    amountPaid:3500,
    purchaseDate:'2026-06-01',
    payMethod:'微信',
    status:'active'
  }],
  entitlements:[{
    id:'ent-voided',
    purchaseId:'purchase-voided',
    studentId:'stu-voided',
    studentName:'作废课包',
    packageName:'成人10节课包',
    totalLessons:10,
    remainingLessons:10,
    status:'voided',
    campusIds:['mabao']
  },{
    id:'ent-active',
    purchaseId:'purchase-active',
    studentId:'stu-voided',
    studentName:'有效课包',
    packageName:'成人10节课包',
    totalLessons:10,
    remainingLessons:10,
    status:'active',
    campusIds:['mabao']
  }],
  entitlementLedger:[{
    id:'ledger-voided-marker',
    entitlementId:'ent-voided',
    purchaseId:'purchase-voided',
    studentId:'stu-voided',
    lessonDelta:0,
    action:'void_purchase',
    relatedDate:'2026-06-01',
    createdAt:'2026-06-01T10:00:00.000Z'
  }],
  courts:[],
  schedule:[]
});

assert.strictEqual(voidedPurchaseSnapshot.financeOverviewData.all.packageIncome, 3500, 'voided package purchases must not count in package income');
assert.strictEqual(voidedPurchaseSnapshot.financeOverviewData.all.courseIncome, 3500, 'course total income should only include active package purchase here');
assert.strictEqual(voidedPurchaseSnapshot.financeOverviewData.all.tradeCount, 1, 'voided package purchase should not count as a trade');
assert.strictEqual(voidedPurchaseSnapshot.financeNormalizedRows.some(row=>String(row.sourceDocument||'').includes('purchase-voided')), false, 'voided package purchase should not create finance receipt rows');

const realTimeOverviewSnapshot = _test.buildFinancePageSnapshot({
  campuses:[{ id:'mabao', code:'mabao', name:'顺义马坡' }],
  students:[{ id:'stu-live', campus:'mabao' }],
  purchases:[{
    id:'old-live-purchase-now-counts',
    studentId:'stu-live',
    studentName:'实时课包',
    packageName:'成人10节课包',
    amountPaid:9999,
    purchaseDate:'2026-04-20',
    payMethod:'微信',
    status:'active'
  },{
    id:'private_lesson_csv_import_20260519_TEST:purchase:实时导入',
    studentId:'stu-live',
    studentName:'实时导入',
    packageName:'成人10节课包',
    amountPaid:4000,
    purchaseDate:'2026-04-23',
    payMethod:'微信',
    status:'active'
  }],
  entitlements:[{
    id:'old-live-entitlement-now-counts',
    purchaseId:'old-live-purchase-now-counts',
    studentId:'stu-live',
    studentName:'实时课包',
    packageName:'成人10节课包',
    totalLessons:10,
    remainingLessons:9,
    campusIds:['mabao']
  },{
    id:'private_lesson_csv_import_20260519_TEST:entitlement:实时导入',
    purchaseId:'private_lesson_csv_import_20260519_TEST:purchase:实时导入',
    studentId:'stu-live',
    studentName:'实时导入',
    packageName:'成人10节课包',
    totalLessons:10,
    remainingLessons:9,
    campusIds:['mabao']
  }],
  entitlementLedger:[{
    id:'old-live-ledger-now-counts',
    entitlementId:'old-live-entitlement-now-counts',
    studentId:'stu-live',
    lessonDelta:-1,
    relatedDate:'2026-04-30',
    createdAt:'2026-04-30T10:00:00.000Z'
  }],
  courts:[{
    id:'court-live',
    name:'实时订场',
    campus:'mabao',
    history:[{
      id:'old-court-history-now-counts',
      date:'2026-05-22',
      type:'消费',
      category:'订场',
      payMethod:'小程序',
      amount:180
    }]
  }],
  schedule:[]
});

assert.strictEqual(realTimeOverviewSnapshot.financeOverviewData.all.packageIncome, 13999, 'finance page overview should count all live package purchases, not only import whitelist increments');
assert.strictEqual(realTimeOverviewSnapshot.financeOverviewData.all.bookingIncome, 180, 'finance page overview should count all live court finance rows, not only MaPo import whitelist rows');
assert.strictEqual(realTimeOverviewSnapshot.financeOverviewData.all.tradeCount, 3, 'finance page overview should count live receipt rows from the normalized fact ledger');

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
assert.strictEqual(merged.overviewData.all.courseIncome, 5000, 'finance import increment should add course total income');
assert.strictEqual(merged.overviewData.all.packageIncome, 5000, 'finance import increment should add package income');
assert.strictEqual(merged.overviewData.all.recognized, 600, 'finance import increment should add recognized course income');
assert.strictEqual(merged.overviewData.all.courseRecognized, 600, 'finance import increment should add course recognized income');
assert.strictEqual(merged.overviewData.all.packageRecognized, 600, 'finance import increment should add package recognized income');
assert.strictEqual(merged.overviewData.all.deferred, 4400, 'finance import increment should add remaining deferred income');
assert.strictEqual(merged.overviewData.all.tradeCount, 11, 'finance import increment should add purchase trade count');
assert.strictEqual(merged.normalizedRows.some(row=>String(row.sourceDocument||'').includes('old-purchase-should-not-double-count')), false, 'old live purchase rows should not be appended to verified finance');

const directScheduleMerged = _test.buildVerifiedFinanceWithImportIncrements(verifiedFinance, {
  campuses:[{ id:'mabao', code:'mabao', name:'顺义马坡' }],
  schedule:[{
    id:'sch-direct-merge',
    studentName:'点评体验用户',
    coach:'Siren',
    campus:'mabao',
    courseType:'体验课',
    status:'已结束',
    startTime:'2026-05-29 09:00',
    endTime:'2026-05-29 10:00',
    settlementType:'direct',
    payMethod:'大众点评券码',
    paidAmount:99
  }]
});

assert.strictEqual(directScheduleMerged.overviewData.all.cash, 1099, 'direct paid schedule should add total cash income');
assert.strictEqual(directScheduleMerged.overviewData.all.recognized, 299, 'direct paid schedule should add recognized income');
assert.strictEqual(directScheduleMerged.overviewData.all.courseIncome, 1099, 'direct paid schedule should add course income bucket');
assert.strictEqual(directScheduleMerged.overviewData.all.courseRecognized, 299, 'direct paid schedule should add course recognized bucket');
assert.strictEqual(directScheduleMerged.overviewData.all.directCourseIncome, 99, 'direct paid schedule should update direct course income bucket');
assert.strictEqual(directScheduleMerged.overviewData.all.directCourseRecognized, 99, 'direct paid schedule should update direct course recognized bucket');
assert.strictEqual(directScheduleMerged.overviewData.all.packageIncome, 1000, 'direct paid schedule should not add package-only income');
assert.strictEqual(directScheduleMerged.overviewData.all.packageRecognized, 200, 'direct paid schedule should not add package-only recognized income');
assert.strictEqual(directScheduleMerged.overviewData.all.tradeCount, 11, 'direct paid schedule should add one trade');

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

const membershipBalanceMerged = _test.buildVerifiedFinanceWithImportIncrements(verifiedFinance, {
  courts:[{
    id:'court-active-member',
    history:[
      { id:'topup-1', type:'充值', amount:1000, bonusAmount:100 },
      { id:'spent-1', type:'消费', amount:200, payMethod:'储值扣款', category:'订场' }
    ]
  },{
    id:'court-cleared-member',
    history:[{ id:'topup-cleared', type:'充值', amount:900 }]
  },{
    id:'court-non-member',
    history:[{ id:'topup-non-member', type:'充值', amount:5000 }]
  }],
  membershipAccounts:[
    { id:'account-active', courtId:'court-active-member', status:'active' },
    { id:'account-cleared', courtId:'court-cleared-member', status:'cleared' }
  ]
});

assert.strictEqual(membershipBalanceMerged.overviewData.all.storedValueBalance, 900, 'finance overview member balance should come from active membership courts only');
assert.strictEqual(membershipBalanceMerged.overviewData.all.storedValueConsumed, 200, 'finance overview member consumed amount should come from active membership courts only');
assert.strictEqual(membershipBalanceMerged.overviewData.all.storedValueDeposit, 1000, 'finance overview member deposit should ignore non-member and cleared courts');
assert.strictEqual(membershipBalanceMerged.overviewData.all.storedValueBonus, 100, 'finance overview member bonus should ignore non-member and cleared courts');

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
  },{
    id:'court-archived-import',
    name:'已合并旧账户',
    campus:'mabao',
    status:'inactive',
    history:[{
      id:'private_lesson_csv_import_20260524-court-archived',
      seedTag:'mabao-finance-import-20260524',
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
