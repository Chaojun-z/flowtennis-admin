const assert = require('assert');
const api = require('../api/index.js');

const rules = api._test;

assert.ok(rules.buildScheduleStoredValueCourtUpdate, 'api._test should expose stored-value schedule court update helper');

const now = '2026-06-11 10:30:00';
const trace = rules.buildOperationTrace({
  operationType: 'lesson-consume',
  operator: '管理员',
  now,
  idFactory: () => 'op-schedule-stored'
});
const student = { id: 'stu-1', name: '学员A', phone: '13800138000' };
const baseCourt = {
  id: 'court-1',
  name: '会员A',
  phone: '13800138000',
  studentIds: ['stu-1'],
  campus: 'shunyi_mapo',
  history: [
    { id: 'recharge-1', date: '2026-06-01', type: '充值', category: '会员充值', payMethod: '微信', amount: 1280 }
  ]
};
const schedule = {
  id: 'sch-1',
  settlementType: 'direct',
  payMethod: '储值卡',
  paidAmount: 224,
  studentIds: ['stu-1'],
  studentName: '学员A',
  startTime: '2026-06-12 12:00',
  endTime: '2026-06-12 13:00',
  courseType: '私教课',
  campus: 'shunyi_mapo',
  venue: '2号场',
  coach: '朝珺教练'
};

const created = rules.buildScheduleStoredValueCourtUpdate({
  previousSchedule: null,
  nextSchedule: schedule,
  courts: [baseCourt],
  students: [student],
  now,
  operator: '管理员',
  operationTrace: trace
});

assert.strictEqual(created.schedule.storedValueCourtId, 'court-1');
assert.strictEqual(created.schedule.storedValueAmount, 224);
assert.strictEqual(created.court.id, 'court-1');
assert.strictEqual(created.court.balance, 1056);
assert.strictEqual(created.court.storedValueSpent, 224);
assert.strictEqual(created.historyRows.length, 1);
assert.strictEqual(created.historyRows[0].type, '消费');
assert.strictEqual(created.historyRows[0].payMethod, '储值卡');
assert.strictEqual(created.historyRows[0].amount, 224);
assert.strictEqual(created.historyRows[0].scheduleId, 'sch-1');
assert.strictEqual(created.historyRows[0].sourceType, 'schedule');
assert.strictEqual(created.historyRows[0].occurredDate, '2026-06-12');
assert.strictEqual(created.historyRows[0].recordedAt, now);
assert.match(created.historyRows[0].note, /排课产生的储值卡扣款/);
assert.strictEqual(rules.computeCourtFinance(created.court).balance, 1056);

assert.throws(
  () => rules.buildScheduleStoredValueCourtUpdate({
    previousSchedule: null,
    nextSchedule: { ...schedule, id: 'sch-over', paidAmount: 2000 },
    courts: [baseCourt],
    students: [student],
    now,
    operator: '管理员',
    operationTrace: trace
  }),
  /余额不足/,
  'stored-value schedule save should reject insufficient balance'
);

const edited = rules.buildScheduleStoredValueCourtUpdate({
  previousSchedule: created.schedule,
  nextSchedule: { ...created.schedule, paidAmount: 300 },
  courts: [created.court],
  students: [student],
  now: '2026-06-11 11:00:00',
  operator: '管理员',
  operationTrace: { ...trace, operationId: 'op-edit', batchId: 'batch-op-edit', operationAt: '2026-06-11 11:00:00' }
});
assert.strictEqual(edited.historyRows.length, 1);
assert.strictEqual(edited.historyRows[0].type, '消费');
assert.strictEqual(edited.historyRows[0].amount, 76);
assert.match(edited.historyRows[0].note, /编辑排课补扣储值卡/);
assert.strictEqual(edited.court.balance, 980);
assert.strictEqual(rules.computeCourtFinance(edited.court).balance, 980);

const cancelled = rules.buildScheduleStoredValueCourtUpdate({
  previousSchedule: edited.schedule,
  nextSchedule: { ...edited.schedule, status: '已取消', cancelReason: '学员请假' },
  courts: [edited.court],
  students: [student],
  now: '2026-06-11 12:00:00',
  operator: '管理员',
  operationTrace: { ...trace, operationId: 'op-cancel', batchId: 'batch-op-cancel', operationAt: '2026-06-11 12:00:00' }
});
assert.strictEqual(cancelled.historyRows.length, 1);
assert.strictEqual(cancelled.historyRows[0].type, '冲正');
assert.strictEqual(cancelled.historyRows[0].amount, 300);
assert.match(cancelled.historyRows[0].note, /取消排课退回储值卡/);
assert.strictEqual(cancelled.court.balance, 1280);
assert.strictEqual(rules.computeCourtFinance(cancelled.court).balance, 1280);

const financeRows = rules.buildFinanceUnifiedRows({
  campuses: [{ id: 'shunyi_mapo', code: 'shunyi_mapo', name: '顺义马坡' }],
  students: [student],
  courts: [created.court],
  schedule: [created.schedule]
});
const storedValueRows = financeRows.filter(row => row.sourceDocument === '排课 sch-1');
assert.strictEqual(storedValueRows.length, 1, 'stored-value schedule should appear once in finance rows');
assert.strictEqual(storedValueRows[0].action, '已入账');
assert.strictEqual(storedValueRows[0].cashDelta, 0);
assert.strictEqual(storedValueRows[0].recognizedRevenueDelta, 224);
assert.strictEqual(storedValueRows[0].deferredRevenueDelta, -224);
assert.strictEqual(storedValueRows[0].paymentChannel, '储值卡');
assert.strictEqual(storedValueRows[0].businessType, '课程');

const fieldFeeSchedule = {
  ...schedule,
  id: 'sch-field-fee',
  settlementType: 'direct',
  payMethod: '微信',
  paidAmount: 300,
  requiresFieldFee: true,
  fieldFeeAmount: 126,
  fieldFeePayMethod: '储值卡',
  fieldFeeNote: '陪打场地费'
};

const fieldFeeCreated = rules.buildScheduleStoredValueCourtUpdate({
  previousSchedule: null,
  nextSchedule: fieldFeeSchedule,
  courts: [baseCourt],
  students: [student],
  now,
  operator: '管理员',
  operationTrace: { ...trace, operationId: 'op-field-create', batchId: 'batch-op-field-create' }
});
assert.strictEqual(fieldFeeCreated.schedule.storedValueAmount, 0, 'wechat lesson fee should not consume stored value');
assert.strictEqual(fieldFeeCreated.schedule.storedValueFieldFeeCourtId, 'court-1');
assert.strictEqual(fieldFeeCreated.schedule.storedValueFieldFeeAmount, 126);
assert.strictEqual(fieldFeeCreated.historyRows.length, 1);
assert.strictEqual(fieldFeeCreated.historyRows[0].type, '消费');
assert.strictEqual(fieldFeeCreated.historyRows[0].category, '课程订场');
assert.strictEqual(fieldFeeCreated.historyRows[0].amount, 126);
assert.match(fieldFeeCreated.historyRows[0].note, /场地费.*储值卡扣款/);
assert.strictEqual(rules.computeCourtFinance(fieldFeeCreated.court).balance, 1154);

const fieldFeeEditedUp = rules.buildScheduleStoredValueCourtUpdate({
  previousSchedule: fieldFeeCreated.schedule,
  nextSchedule: { ...fieldFeeCreated.schedule, fieldFeeAmount: 160 },
  courts: [fieldFeeCreated.court],
  students: [student],
  now: '2026-06-11 11:30:00',
  operator: '管理员',
  operationTrace: { ...trace, operationId: 'op-field-edit-up', batchId: 'batch-op-field-edit-up' }
});
assert.strictEqual(fieldFeeEditedUp.historyRows.length, 1);
assert.strictEqual(fieldFeeEditedUp.historyRows[0].type, '消费');
assert.strictEqual(fieldFeeEditedUp.historyRows[0].amount, 34);
assert.match(fieldFeeEditedUp.historyRows[0].note, /编辑排课补扣场地费/);
assert.strictEqual(rules.computeCourtFinance(fieldFeeEditedUp.court).balance, 1120);

const fieldFeeEditedDown = rules.buildScheduleStoredValueCourtUpdate({
  previousSchedule: fieldFeeEditedUp.schedule,
  nextSchedule: { ...fieldFeeEditedUp.schedule, fieldFeeAmount: 120 },
  courts: [fieldFeeEditedUp.court],
  students: [student],
  now: '2026-06-11 11:45:00',
  operator: '管理员',
  operationTrace: { ...trace, operationId: 'op-field-edit-down', batchId: 'batch-op-field-edit-down' }
});
assert.strictEqual(fieldFeeEditedDown.historyRows.length, 1);
assert.strictEqual(fieldFeeEditedDown.historyRows[0].type, '冲正');
assert.strictEqual(fieldFeeEditedDown.historyRows[0].amount, 40);
assert.match(fieldFeeEditedDown.historyRows[0].note, /编辑排课退回场地费差额/);
assert.strictEqual(rules.computeCourtFinance(fieldFeeEditedDown.court).balance, 1160);

const fieldFeeFinanceRows = rules.buildFinanceUnifiedRows({
  campuses: [{ id: 'shunyi_mapo', code: 'shunyi_mapo', name: '顺义马坡' }],
  students: [student],
  courts: [fieldFeeCreated.court],
  schedule: [fieldFeeCreated.schedule]
}).filter(row => row.sourceDocument === '排课 sch-field-fee');
const fieldFeeLessonIncome = fieldFeeFinanceRows.find(row => row.businessType === '课程');
const fieldFeeStoredConsumption = fieldFeeFinanceRows.find(row => row.debitTarget === '会员储值余额');
assert.ok(fieldFeeLessonIncome, 'wechat lesson fee should still create a direct course income row');
assert.strictEqual(fieldFeeLessonIncome.cashDelta, 300);
assert.strictEqual(fieldFeeLessonIncome.recognizedRevenueDelta, 300);
assert.ok(fieldFeeStoredConsumption, 'stored-value field fee should create a member balance consumption row');
assert.strictEqual(fieldFeeStoredConsumption.cashDelta, 0);
assert.strictEqual(fieldFeeStoredConsumption.recognizedRevenueDelta, 126);
assert.strictEqual(fieldFeeStoredConsumption.deferredRevenueDelta, -126);
assert.strictEqual(fieldFeeStoredConsumption.paymentChannel, '储值卡');
assert.strictEqual(fieldFeeStoredConsumption.businessType, '会员订场');

console.log('schedule stored value tests passed');
