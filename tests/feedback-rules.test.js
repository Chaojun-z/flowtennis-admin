const assert = require('assert');
const api = require('../api/index.js');

const rules = api._test;

assert.ok(rules, 'api._test should expose helpers');

assert.throws(
  () => rules.buildFeedbackRecord({}, {}, { name: '教练' }),
  /缺少排课ID/,
  'feedback must be linked to a schedule'
);

const record = rules.buildFeedbackRecord(
  {
    scheduleId: 'sch-1',
    studentId: 'stu-1',
    studentIds: ['stu-1', 'stu-2'],
    studentName: '学员A',
    coach: '朝珺',
    startTime: '2026-04-11 09:00',
    campus: 'mabao',
    venue: '1号场',
    lessonCount: 1,
    isTrial: true,
    practicedToday: '底线练习',
    knowledgePoint: '重心转移',
    nextTraining: '脚步移动',
    playerLevel: '1.5～2.0',
    goalType: '提升技术',
    experienceBackground: '有少量体验课',
    mainIssues: '挥拍不稳定',
    conversionIntent: '高',
    recommendedProductType: '私教',
    recommendedReason: '需要先建立动作基础',
    needOpsFollowUp: true,
    opsFollowUpPriority: '高',
    opsFollowUpSuggestion: '24小时内联系，主推私教体验包'
  },
  { id: 'fb-1' },
  { name: '朝珺' }
);

assert.strictEqual(record.id, 'fb-1');
assert.strictEqual(record.scheduleId, 'sch-1');
assert.strictEqual(record.coach, '朝珺');
assert.deepStrictEqual(record.studentIds, ['stu-1', 'stu-2']);
assert.strictEqual(record.isTrial, true);
assert.strictEqual(record.practicedToday, '底线练习');
assert.strictEqual(record.knowledgePoint, '重心转移');
assert.strictEqual(record.nextTraining, '脚步移动');
assert.strictEqual(record.playerLevel, '1.5～2.0');
assert.strictEqual(record.goalType, '提升技术');
assert.strictEqual(record.experienceBackground, '有少量体验课');
assert.strictEqual(record.mainIssues, '挥拍不稳定');
assert.strictEqual(record.conversionIntent, '高');
assert.strictEqual(record.recommendedProductType, '私教');
assert.strictEqual(record.recommendedReason, '需要先建立动作基础');
assert.strictEqual(record.needOpsFollowUp, true);
assert.strictEqual(record.opsFollowUpPriority, '高');
assert.strictEqual(record.opsFollowUpSuggestion, '24小时内联系，主推私教体验包');

assert.doesNotThrow(
  () => rules.assertCanWriteFeedback(
    { role: 'admin', name: '管理员' },
    { coach: '朝珺' }
  ),
  'admin can write any schedule feedback'
);

assert.doesNotThrow(
  () => rules.assertCanWriteFeedback(
    { role: 'editor', coachName: '朝珺', name: '朝珺' },
    { coach: '朝珺' }
  ),
  'coach can write own schedule feedback'
);

assert.throws(
  () => rules.assertCanWriteFeedback(
    { role: 'editor', coachName: '白杨静', name: '白杨静' },
    { coach: '朝珺' }
  ),
  /只能填写自己的课程反馈/,
  'coach cannot write other coach schedule feedback'
);

const isolated = rules.filterLoadAllForUser(
  {
    courts: [{ id: 'court-1' }],
    students: [{ id: 'stu-1', name: '学员A' }, { id: 'stu-2', name: '学员B' }],
    products: [{ id: 'prod-1' }],
    packages: [{ id: 'pkg-1', price: 1000 }],
    purchases: [{ id: 'pur-1', studentId: 'stu-1', amountPaid: 1000, payMethod: '微信', operator: '管理员' }],
    entitlements: [{ id: 'ent-1', studentId: 'stu-1', packageName: '五一私教课包', totalLessons: 5, usedLessons: 1, remainingLessons: 4, amountPaid: 1000 }],
    entitlementLedger: [
      { id: 'led-1', entitlementId: 'ent-1', studentId: 'stu-1', scheduleId: 'sch-1', lessonDelta: -1, operator: '管理员' },
      { id: 'led-import', entitlementId: 'ent-1', studentId: 'stu-1', scheduleId: '', lessonDelta: -2, operator: '管理员', sourceMonth: '2026-03', importSource: '系统导入', relatedDate: '2026-03-31' }
    ],
    plans: [{ id: 'plan-1', studentId: 'stu-1', classId: 'class-1' }, { id: 'plan-2', studentId: 'stu-2', classId: 'class-2' }],
    schedule: [{ id: 'sch-1', coach: '朝珺', studentIds: ['stu-1'], classId: 'class-1' }, { id: 'sch-2', coach: '其他教练', studentIds: ['stu-2'], classId: 'class-2' }],
    coaches: [{ id: 'coach-1', name: '朝珺' }, { id: 'coach-2', name: '其他教练' }],
    classes: [{ id: 'class-1', coach: '朝珺', studentIds: ['stu-1'] }, { id: 'class-2', coach: '其他教练', studentIds: ['stu-2'] }],
    campuses: [{ id: 'mabao' }],
    feedbacks: [{ id: 'fb-1', scheduleId: 'sch-1' }, { id: 'fb-2', scheduleId: 'sch-2' }]
  },
  { role: 'editor', coachName: '朝珺', name: '朝珺' }
);
assert.deepStrictEqual(isolated.courts, [], 'coach load-all should not expose court accounts');
assert.deepStrictEqual(isolated.schedule.map(x=>x.id), ['sch-1'], 'coach load-all should only expose own schedule');
assert.deepStrictEqual(isolated.classes.map(x=>x.id), ['class-1'], 'coach load-all should only expose own classes');
assert.deepStrictEqual(isolated.students.map(x=>x.id), ['stu-1'], 'coach load-all should only expose linked students');
assert.deepStrictEqual(isolated.feedbacks.map(x=>x.id), ['fb-1'], 'coach load-all should only expose own feedbacks');
assert.deepStrictEqual(isolated.packages, [], 'coach load-all should not expose package prices');
assert.deepStrictEqual(
  isolated.purchases,
  [{ id: 'pur-1', studentId: 'stu-1', studentName: '', purchaseDate: '', createdAt: '', status: 'active' }],
  'coach load-all should only expose safe purchase summary for linked students'
);
assert.deepStrictEqual(isolated.entitlements.map(x=>x.id), ['ent-1'], 'coach load-all should expose safe entitlement summary');
assert.strictEqual(isolated.purchases[0].amountPaid, undefined, 'coach purchase summary should not expose paid amount');
assert.strictEqual(isolated.purchases[0].payMethod, undefined, 'coach purchase summary should not expose pay method');
assert.strictEqual(isolated.purchases[0].operator, undefined, 'coach purchase summary should not expose operator');
assert.strictEqual(isolated.entitlements[0].amountPaid, undefined, 'coach entitlement summary should not expose paid amount');
assert.strictEqual(isolated.entitlementLedger[0].operator, undefined, 'coach entitlement ledger should not expose operator');
assert.ok(isolated.entitlementLedger.some(x=>x.id==='led-import'), 'coach load-all should retain imported historical consume rows for linked students');

console.log('feedback rules tests passed');
