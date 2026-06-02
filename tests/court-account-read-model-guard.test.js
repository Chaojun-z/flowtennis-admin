const assert = require('assert');
const fs = require('fs');
const path = require('path');

const modulePath = path.join(__dirname, '../api/page-data/court-account-read-model.js');
const samplePath = path.join(__dirname, '../docs/performance-governance/15-样板页固定验收样本.json');

assert.ok(fs.existsSync(modulePath), '订场用户样板页读模型应拆到独立模块');
assert.ok(fs.existsSync(samplePath), '样板页固定验收样本文件应落库');

const sampleRows = JSON.parse(fs.readFileSync(samplePath, 'utf8'));
assert.strictEqual(Array.isArray(sampleRows), true, '固定验收样本文件应为数组');
assert.strictEqual(sampleRows.length, 10, '固定验收样本应固定为 10 个账户');
sampleRows.forEach((row, index) => {
  assert.ok(row.id, `样本 ${index + 1} 应有账户 ID`);
  assert.ok(row.maskedName, `样本 ${index + 1} 应保留脱敏姓名`);
  assert.ok(String(row.maskedName).includes('*'), `样本 ${index + 1} 姓名应脱敏`);
  assert.ok(row.scenario, `样本 ${index + 1} 应标记覆盖场景`);
});
assert.ok(!sampleRows.some((row) => row.id === '0167fe2a-09e0-4c26-b692-c801dee4d626'), '固定验收样本不应继续包含已失效的合并账户');
assert.ok(sampleRows.some((row) => row.id === 'a65ca92b-6d83-4106-965d-9a21d09e7af7'), '固定验收样本应替换成当前有效的活跃订场用户');

const {
  createCourtAccountListViewLoader,
  createCourtAccountListCompareLoader
} = require(modulePath);

assert.strictEqual(typeof createCourtAccountListViewLoader, 'function', '订场用户读模型模块应导出 createCourtAccountListViewLoader');
assert.strictEqual(typeof createCourtAccountListCompareLoader, 'function', '订场用户读模型模块应导出 createCourtAccountListCompareLoader');

async function main() {
  const tables = {
    campuses: 'campuses',
    students: 'students',
    courts: 'courts',
    membershipAccounts: 'membershipAccounts',
    membershipOrders: 'membershipOrders',
    membershipPlans: 'membershipPlans'
  };
  const datasets = {
    campuses: [{ code: 'mabao', name: '马坡' }],
    students: [{ id: 'stu-1', name: '学员甲' }],
    courts: [{
      id: 'court-1',
      name: '客户A',
      phone: '13800000000',
      campus: 'mabao',
      owner: '顾问A',
      familiarity: '熟',
      depositAttitude: '高',
      recentFollowUpDate: '2026-05-01',
      nextFollowUpDate: '2026-05-20',
      notes: '备注A',
      studentId: 'stu-1',
      cachedBalance: 100,
      cachedTotalDeposit: 500,
      cachedTotalSpent: 400,
      cachedTotalReceived: 500,
      history: [
        { type: '充值', amount: 500, bonusAmount: 0 },
        { type: '消费', amount: 300, payMethod: '储值扣款', category: '订场', date: '2026-05-10', startTime: '10:00', endTime: '12:00', venue: '1号场' },
        { type: '消费', amount: 200, payMethod: '微信', category: '其他', date: '2026-05-12', startTime: '14:00', endTime: '15:30', venue: '2号场' }
      ],
      updatedAt: '2026-05-13T10:00:00.000Z',
      createdAt: '2026-05-01T10:00:00.000Z'
    }, {
      id: 'court-non-member',
      name: '散客负余额',
      campus: 'mabao',
      cachedBalance: -60,
      history: [],
      status: 'active'
    }],
    membershipAccounts: [{
      id: 'ma-1',
      courtId: 'court-1',
      status: 'active',
      memberLabel: '订场会员',
      tierCode: '金卡',
      discountRate: 0.9,
      validUntil: '2026-12-31',
      updatedAt: '2026-05-13T10:00:00.000Z'
    }],
    membershipOrders: [],
    membershipPlans: []
  };
  const getCachedScan = async (tableName) => datasets[tableName] || [];
  const listCampusesWithDefaults = async () => datasets.campuses;

  const loadView = createCourtAccountListViewLoader({
    listCampusesWithDefaults,
    getCachedScan,
    tables,
    fixedSampleAccounts: sampleRows
  });
  const loadCompare = createCourtAccountListCompareLoader({
    loadCourtAccountListView: loadView,
    fixedSampleAccounts: sampleRows
  });

  const view = await loadView();
  assert.deepStrictEqual(Object.keys(view), ['summary', 'filters', 'items', 'meta'], '读模型应返回 summary/filters/items/meta');
  assert.strictEqual(view.items.length, 2, '读模型应返回可渲染列表项');
  assert.strictEqual(view.items[0].displayName, '客户A');
  assert.strictEqual(view.items[0].accountType, '会员');
  assert.strictEqual(view.items[0].membershipStatus, '正常');
  assert.strictEqual(view.items[0].membershipDiscountText, '9 折');
  assert.strictEqual(view.items[0].linkedStudentSummary, '学员甲');
  assert.strictEqual(view.items[0].memberBookingCount, 2, '读模型应按会员用户统计会员订场次数');
  assert.strictEqual(view.items[0].bookingCount, 2, '读模型应统计储值订场和散客订场');
  assert.strictEqual(view.items[0].bookingHours, 3.5, '读模型应统计订场总时长');
  assert.strictEqual(view.items[0].bookingAmount, 500, '读模型应汇总订场消费金额');
  assert.strictEqual(view.items[0].memberBookingAmount, 500, '读模型应按会员用户统计会员订场金额');
  assert.strictEqual(view.items[0].guestBookingAmount, 0, '会员用户的订场金额不应再计入散客金额');
  assert.strictEqual(view.items[0].lastBookingDate, '2026-05-12', '读模型应输出最近订场日期');
  assert.strictEqual(view.items[0].balance, 100, '新读模型应优先读取 cachedBalance');
  assert.strictEqual(view.summary.totalMemberCount, 1, '读模型汇总应统计有效会员人数');
  assert.strictEqual(view.summary.totalBookingHours, 3.5, '读模型汇总应统计订场总时长');
  assert.strictEqual(view.summary.totalMemberBookingCount, 2, '读模型汇总应按会员用户统计会员订场次数');
  assert.strictEqual(view.summary.totalMemberBookingAmount, 500, '读模型汇总应按会员用户统计会员订场金额');
  assert.strictEqual(view.summary.totalGuestBookingCount, 0, '读模型汇总应排除会员用户的散客订场次数');
  assert.strictEqual(view.summary.totalGuestBookingAmount, 0, '读模型汇总应统计总订场金额减会员订场金额后的散客金额');
  assert.strictEqual(view.summary.totalBalance, 100, '订场用户页会员余额只统计有效会员账户余额，不混入散客余额');

  const compare = await loadCompare({ sampleIds: ['court-1'] });
  assert.deepStrictEqual(Object.keys(compare), ['meta', 'summaryDiffs', 'items'], 'compare 输出应返回 meta/summaryDiffs/items');
  assert.strictEqual(compare.items.length, 1, 'compare 应支持按样本 ID 过滤');
  assert.strictEqual(compare.items[0].id, 'court-1');
  assert.ok(compare.items[0].diffs.some((item) => item.field === 'balance'), 'compare 应能输出新旧余额差异');
  assert.ok(compare.summaryDiffs.some((item) => item.field === 'totalBalance'), 'compare 应输出汇总差异');
}

main()
  .then(() => console.log('court account read model guard tests passed'))
  .catch((error) => {
    console.error(error);
    process.exit(1);
  });
