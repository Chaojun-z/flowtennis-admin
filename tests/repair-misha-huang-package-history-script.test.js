const assert = require('assert');
const {
  IDS,
  WRONG_SMALL_LEDGER_IDS,
  PRIME_LESSONS,
  NON_PRIME_LESSONS,
  buildPlan
} = require('../scripts/repair-misha-huang-package-history-20260812');

const now = '2026-08-12T10:00:00.000Z';
const operationId = 'misha-huang-repair-test';
const baseRows = {
  purchases: [
    { id: IDS.mishaPrimePurchase, studentId: IDS.mishaStudent, studentName: 'misha', packageName: '成人1v1 非黄时间10课时（历史）', status: 'active' },
    { id: IDS.huangPrimePurchase, studentId: IDS.huangStudent, studentName: '黄总', packageName: '成人1v1 非黄时间10课时（历史）', status: 'active' },
    { id: IDS.mishaWrongSmallPurchase, studentId: IDS.mishaStudent, studentName: 'misha', packageName: '小班训练营 · 10次 · 黄金', status: 'active', amountPaid: 0 },
    { id: IDS.huangWrongSmallPurchase, studentId: IDS.huangStudent, studentName: '黄总', packageName: '小班训练营 · 10次 · 黄金', status: 'active', amountPaid: 0 }
  ],
  entitlements: [
    { id: IDS.mishaPrimeEntitlement, studentId: IDS.mishaStudent, studentName: 'misha', purchaseId: IDS.mishaPrimePurchase, packageName: '成人1v1 非黄时间10课时（历史）', status: 'active' },
    { id: IDS.huangPrimeEntitlement, studentId: IDS.huangStudent, studentName: '黄总', purchaseId: IDS.huangPrimePurchase, packageName: '成人1v1 非黄时间10课时（历史）', status: 'active' },
    { id: IDS.mishaWrongSmallEntitlement, studentId: IDS.mishaStudent, studentName: 'misha', purchaseId: IDS.mishaWrongSmallPurchase, packageName: '小班训练营 · 10次 · 黄金', status: 'active' },
    { id: IDS.huangWrongSmallEntitlement, studentId: IDS.huangStudent, studentName: '黄总', purchaseId: IDS.huangWrongSmallPurchase, packageName: '小班训练营 · 10次 · 黄金', status: 'active' }
  ],
  schedule: [
    { id: IDS.smallWrongSchedule, studentIds: [IDS.mishaStudent, IDS.huangStudent], studentName: 'misha、黄总', courseType: '小班课', status: '已排课' },
    { id: 'existing-misha-jan19', startTime: '2026-01-19 19:00', endTime: '2026-01-19 20:00', studentIds: [IDS.mishaStudent], studentName: 'misha', courseType: '私教课', status: '已排课' },
    { id: 'duplicate-misha-jan19', startTime: '2026-01-19 19:00', endTime: '2026-01-19 20:00', studentName: 'misha', courseType: '私教课', status: '已排课' },
    { id: 'huang-friend', startTime: '2026-02-26 19:00', endTime: '2026-02-26 20:00', studentName: '黄总朋友', courseType: '体验课', status: '已排课' }
  ],
  entitlementLedger: [
    ...WRONG_SMALL_LEDGER_IDS.map(id => ({ id, entitlementId: IDS.mishaWrongSmallEntitlement, status: 'active', action: 'consume' })),
    { id: 'existing-ledger-misha-jan19', scheduleId: 'existing-misha-jan19', entitlementId: IDS.mishaPrimeEntitlement, relatedDate: '2026-01-19', status: 'active' },
    { id: 'duplicate-ledger-misha-jan19', scheduleId: 'duplicate-misha-jan19', entitlementId: IDS.mishaPrimeEntitlement, relatedDate: '2026-01-19', status: 'active' }
  ]
};

const plan = buildPlan(baseRows, { now, operationId });

assert.deepStrictEqual(plan.blockers, [], '完整基础数据不应阻塞');

assert.deepStrictEqual(
  plan.putPurchases.filter(row => [IDS.mishaWrongSmallPurchase, IDS.huangWrongSmallPurchase].includes(row.id)).map(row => row.status),
  ['voided', 'voided'],
  'misha、黄总错误小班购买记录必须作废'
);

assert.deepStrictEqual(
  plan.putEntitlements.filter(row => [IDS.mishaWrongSmallEntitlement, IDS.huangWrongSmallEntitlement].includes(row.id)).map(row => row.status),
  ['voided', 'voided'],
  'misha、黄总错误小班课包必须作废'
);

assert.strictEqual(
  plan.putSchedules.find(row => row.id === IDS.smallWrongSchedule)?.status,
  'voided',
  '错误小班排课必须作废'
);

assert.strictEqual(
  plan.putLedgers.filter(row => WRONG_SMALL_LEDGER_IDS.includes(row.id) && row.status === 'voided').length,
  WRONG_SMALL_LEDGER_IDS.length,
  '错误小班消课流水必须全部作废'
);

const newPurchases = plan.putPurchases.filter(row => [IDS.mishaNonPrimePurchase, IDS.huangNonPrimePurchase].includes(row.id));
assert.deepStrictEqual(
  newPurchases.map(row => [row.studentName, row.amountPaid, row.packageTimeBand, row.ownerCoach]),
  [['misha', 4700, '非黄金时段', '朝珺教练'], ['黄总', 4700, '非黄金时段', '朝珺教练']],
  '5/27 两人非黄课包必须按用户确认补建'
);

assert.strictEqual(
  plan.putBenefitLedger.length,
  4,
  '5/27 两人非黄课包应各补 1 小时场地和 1 小时发球机权益'
);

const mishaPrime = plan.putEntitlements.find(row => row.id === IDS.mishaPrimeEntitlement);
const huangPrime = plan.putEntitlements.find(row => row.id === IDS.huangPrimeEntitlement);
const mishaNonPrime = plan.putEntitlements.find(row => row.id === IDS.mishaNonPrimeEntitlement);
const huangNonPrime = plan.putEntitlements.find(row => row.id === IDS.huangNonPrimeEntitlement);
assert.deepStrictEqual(
  [mishaPrime.usedLessons, mishaPrime.remainingLessons, huangPrime.usedLessons, huangPrime.remainingLessons],
  [12, 0, 12, 0],
  '1/6 黄金课包两人都应为 12 节用完'
);
assert.deepStrictEqual(
  [mishaNonPrime.usedLessons, mishaNonPrime.remainingLessons, huangNonPrime.usedLessons, huangNonPrime.remainingLessons],
  [2, 8, 1, 9],
  '5/27 非黄课包当前应为 misha 已用2剩8，黄总已用1剩9'
);

const correctLessonCount = PRIME_LESSONS.length + NON_PRIME_LESSONS.length;
assert.strictEqual(
  plan.putSchedules.filter(row => row.courseType === '私教课' && row.status !== 'voided').length,
  correctLessonCount,
  '正确历史排课必须全部补成私教课'
);

assert.deepStrictEqual(
  plan.putSchedules.find(row => row.startTime === '2026-01-19 19:00')?.studentIds,
  [IDS.mishaStudent],
  '白色 1v1 历史课只应排实际单人'
);

assert.strictEqual(
  plan.putSchedules.find(row => row.startTime === '2026-01-19 19:00' && row.status !== 'voided')?.id,
  'existing-misha-jan19',
  '已有历史排课必须覆盖原记录，不能再新增一条'
);

assert.strictEqual(
  plan.putSchedules.find(row => row.id === 'duplicate-misha-jan19')?.status,
  'voided',
  '同一节课的重复残留排课必须作废'
);

assert.strictEqual(
  plan.putLedgers.find(row => row.id === 'existing-ledger-misha-jan19')?.scheduleId,
  'existing-misha-jan19',
  '已有消课流水必须覆盖原记录并继续绑定原排课'
);

assert.strictEqual(
  plan.putLedgers.find(row => row.id === 'duplicate-ledger-misha-jan19')?.status,
  'voided',
  '同一排课被修正后，旧的重复消课流水必须作废'
);

assert.ok(
  !plan.putSchedules.some(row => row.id === 'huang-friend'),
  '黄总朋友不是黄总本人，不能被 misha/黄总专项修数误伤'
);

assert.deepStrictEqual(
  plan.putSchedules.find(row => row.startTime === '2026-03-25 12:00')?.studentIds,
  [IDS.mishaStudent, IDS.huangStudent],
  '绿色 1v2 历史课必须排两个人'
);

const huangUsesMisha = plan.putLedgers.find(row => row.entitlementId === IDS.mishaPrimeEntitlement && row.usedByStudentId === IDS.huangStudent);
assert.ok(huangUsesMisha, '黄总共同上课但扣 misha 课包时，流水必须保留使用 misha 课包关系');

assert.deepStrictEqual(
  plan.indexRows.map(row => [row.studentId, row.entitlementIds]),
  [[IDS.mishaStudent, [IDS.mishaNonPrimeEntitlement]], [IDS.huangStudent, [IDS.huangNonPrimeEntitlement]]],
  '活跃课包索引只能保留 5/27 非黄剩余课包'
);

console.log('repair-misha-huang-package-history-script tests passed');
