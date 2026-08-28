const assert = require('assert');
const { isProfileOnlyCourtUpdate, buildCourtProfileUpdate } = require('../server/courts-routes.js');

const profileBody = {
  name: '赵晶',
  phone: '13800000000',
  studentId: 'student-zhaojing',
  studentIds: ['student-zhaojing'],
  campus: 'shunyi_mapo',
  depositAttitude: '',
  notes: '',
  status: 'active',
  history: []
};

assert.strictEqual(
  isProfileOnlyCourtUpdate(profileBody),
  true,
  '关联学员这类纯资料更新即使没带流水，也应走保留旧财务字段的分支'
);

assert.strictEqual(
  isProfileOnlyCourtUpdate({
    ...profileBody,
    type: '消费',
    amount: 200,
    payMethod: '储值扣款'
  }),
  false,
  '新增消费/充值流水不能被误判成纯资料更新'
);

const previousCourt = {
  id: 'court-zhaojing',
  name: '赵晶',
  phone: '13800000000',
  studentId: '',
  studentIds: [],
  campus: 'shunyi_mapo',
  balance: 1376,
  totalDeposit: 2000,
  spentAmount: 624,
  receivedAmount: 2000,
  storedValueSpent: 624,
  directPaidSpent: 0,
  cachedBalance: 1376,
  cachedTotalDeposit: 2000,
  cachedTotalSpent: 624,
  cachedTotalReceived: 2000,
  history: [{ id: 'h-1', type: '充值', amount: 2000, bonusAmount: 0 }]
};

const updated = buildCourtProfileUpdate(previousCourt, profileBody, previousCourt.id);

assert.strictEqual(updated.studentId, 'student-zhaojing');
assert.deepStrictEqual(updated.studentIds, ['student-zhaojing']);
assert.strictEqual(updated.balance, 1376);
assert.strictEqual(updated.totalDeposit, 2000);
assert.strictEqual(updated.spentAmount, 624);
assert.strictEqual(updated.cachedBalance, 1376);
assert.strictEqual(updated.cachedTotalDeposit, 2000);
assert.strictEqual(updated.cachedTotalSpent, 624);
assert.strictEqual(updated.cachedTotalReceived, 2000);
assert.deepStrictEqual(updated.history, previousCourt.history);

console.log('court profile update tests passed');
