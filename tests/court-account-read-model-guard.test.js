const assert = require('assert');
const fs = require('fs');
const path = require('path');

const modulePath = path.join(__dirname, '../server/page-data/court-account-read-model.js');
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
    leads: 'leads',
    courts: 'courts',
    membershipAccounts: 'membershipAccounts',
    membershipOrders: 'membershipOrders',
    membershipPlans: 'membershipPlans'
  };
  const datasets = {
    campuses: [{ code: 'shunyi_mapo', name: '马坡' }],
    students: [{ id: 'stu-1', name: '学员甲' }],
    leads: [{ id: 'lead-1', courtId: 'court-1', owner: '线索跟进人' }],
    courts: [{
      id: 'court-1',
      name: '客户A',
      phone: '13800000000',
      campus: 'mabao',
      owner: '订场旧对接人',
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
        { type: '消费', amount: 60, payMethod: '储值扣款', category: '发球机', date: '2026-05-11', note: '发球机 1 小时' },
        { type: '消费', amount: 150, payMethod: '储值扣款', category: '排课陪打', date: '2026-05-12', note: '陪打订场' },
        { type: '消费', amount: 200, payMethod: '微信', category: '其他', businessDate: '2026.05.12', startTime: '14:00', endTime: '15:30', venue: '2号场' },
        { type: '消费', amount: 180, payMethod: '储值扣款', category: '排课私教课', date: '2026-05-13', startTime: '16:00', endTime: '17:00', venue: '3号场' },
        { type: '消费', amount: 80, payMethod: '储值扣款', category: '畅打待匹配', date: '2026-05-14', note: '拼场活动' },
        { type: '消费', amount: 50, payMethod: '储值扣款', category: '穿线费用', date: '2026-05-15', note: '穿线' }
      ],
      updatedAt: '2026-05-13 10:00:00',
      createdAt: '2026-05-01 10:00:00'
    }, {
      id: 'court-non-member',
      name: '散客负余额',
      campus: 'shunyi_mapo',
      owner: '旧对接人乙',
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
      updatedAt: '2026-05-13 10:00:00'
    }],
    membershipOrders: [
      { id: 'order-1', courtId: 'court-1', membershipAccountId: 'ma-1', status: 'paid', rechargeAmount: 500, purchaseDate: '2026-05-01' },
      { id: 'order-2', courtId: 'court-1', membershipAccountId: 'ma-1', status: 'paid', rechargeAmount: 300, purchaseDate: '2026-05-15' },
      { id: 'order-voided', courtId: 'court-1', membershipAccountId: 'ma-1', status: 'voided', rechargeAmount: 999, purchaseDate: '2026-05-20' }
    ],
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
  assert.deepStrictEqual(Object.keys(view), ['summary', 'filters', 'items', 'membershipOrderAuditRows', 'membershipLedgerAuditRows', 'pagination', 'meta'], '读模型应返回 summary/filters/items/audit/pagination/meta');
  assert.strictEqual(view.items.length, 2, '读模型应返回可渲染列表项');
  assert.strictEqual(view.items[0].displayName, '客户A');
  assert.strictEqual(view.items[0].campusCode, 'shunyi_mapo', '订场用户读模型必须把历史 mabao 归一为标准校区代码');
  assert.strictEqual(view.items[0].campusName, '顺义马坡', '订场用户读模型不得向前端返回 mabao 展示名');
  assert.strictEqual(view.items[0].owner, '线索跟进人', '订场用户跟进人应读取线索池 owner 统一事实源');
  assert.strictEqual(view.items[1].owner, '', '没有关联线索跟进人时不应回退订场旧对接人');
  assert.strictEqual(view.items[0].accountType, '会员账户');
  assert.ok(view.filters.accountTypes.every((value) => ['会员账户', '普通账户'].includes(value)), '账户类型筛选只应返回会员账户/普通账户');
  assert.strictEqual(view.items[0].membershipStatus, '正常');
  assert.strictEqual(view.items[0].membershipDiscountText, '9 折');
  assert.strictEqual(view.items[0].linkedStudentSummary, '学员甲');
  assert.strictEqual(view.items[0].memberBookingCount, 3, '读模型应把订场、发球机、陪打里的会员支付都算进会员订场次数');
  assert.strictEqual(view.items[0].bookingCount, 4, '读模型应统计订场、发球机、陪打和散客订场，但排除私教课、畅打、穿线');
  assert.strictEqual(view.items[0].bookingHours, 3.5, '读模型应只累计有效订场记录的场地时长');
  assert.strictEqual(view.items[0].bookingAmount, 710, '读模型应只汇总有效订场记录金额');
  assert.strictEqual(view.items[0].memberBookingAmount, 510, '读模型应按会员支付方式汇总订场、发球机、陪打金额');
  assert.strictEqual(view.items[0].membershipRechargeCount, 2, '读模型应输出会员有效储值次数');
  assert.strictEqual(view.items[0].hasMembershipRepeatRecharge, true, '读模型应输出会员复充标记');
  assert.strictEqual(view.items[0].hasMembershipBookingRetention, true, '读模型应输出会员储值后继续订场消费标记');
  assert.strictEqual(view.items[0].guestBookingCount, 1, '会员名下的微信订场仍应按散客订场统计');
  assert.strictEqual(view.items[0].guestBookingAmount, 200, '会员名下的微信订场金额应计入散客金额');
  assert.strictEqual(view.items[0].lastBookingDate, '2026-05-12', '读模型应输出最近订场日期');
  assert.strictEqual(view.items[0].balance, 100, '新读模型应优先读取 cachedBalance');
  assert.strictEqual(view.items[0].history, undefined, '默认列表不应返回订场历史明细');
  assert.strictEqual(view.items[0].rechargeRows, undefined, '默认列表不应返回充值明细');
  assert.strictEqual(view.items[0].benefitRows, undefined, '默认列表不应返回权益明细');
  assert.strictEqual(view.items[0].ledgerRows, undefined, '默认列表不应返回权益流水明细');
  assert.strictEqual(view.items[0].bookingRows, undefined, '默认列表不应返回订场明细');
  assert.deepStrictEqual(view.membershipOrderAuditRows, [], '默认列表不应夹带会员订单审计行');
  assert.deepStrictEqual(view.membershipLedgerAuditRows, [], '默认列表不应夹带会员权益流水审计行');
  assert.strictEqual(view.summary.totalMemberCount, 1, '读模型汇总应统计有效会员人数');
  assert.strictEqual(view.summary.totalBookingHours, 3.5, '读模型汇总应统计有效订场总时长');
  assert.strictEqual(view.summary.totalMemberBookingCount, 3, '读模型汇总应按新口径统计会员订场次数');
  assert.strictEqual(view.summary.totalMemberBookingAmount, 510, '读模型汇总应按新口径统计会员订场金额');
  assert.strictEqual(view.summary.totalMembershipRechargeCount, 2, '读模型汇总应统计有效储值次数');
  assert.strictEqual(view.summary.totalMembershipRepeatRechargeCount, 1, '读模型汇总应统计复充会员人数');
  assert.strictEqual(view.summary.totalMembershipRetainedCount, 1, '读模型汇总应统计储值后仍有订场消费的会员人数');
  assert.strictEqual(view.summary.totalGuestBookingCount, 1, '读模型汇总应把非储值扣款订场统计为散客次数');
  assert.strictEqual(view.summary.totalGuestBookingAmount, 200, '读模型汇总应把非储值扣款订场统计为散客金额');
  assert.strictEqual(view.summary.totalBalance, 100, '订场用户页会员余额只统计有效会员账户余额，不混入散客余额');

  const detailView = await loadView({ sampleIds: ['court-1'], includeDetails: true });
  assert.strictEqual(detailView.items.length, 1, '详情读模型应支持按单个订场用户 ID 加载');
  assert.ok(Array.isArray(detailView.items[0].rechargeRows) && detailView.items[0].rechargeRows.length === 2, '详情读模型应返回当前用户充值明细');
  assert.ok(Array.isArray(detailView.items[0].bookingRows) && detailView.items[0].bookingRows.length === 4, '详情读模型应返回当前用户订场明细');
  assert.ok(detailView.membershipOrderAuditRows.length === 2, '详情读模型可返回当前用户订单审计行');

  const pagedView = await loadView({ page: 1, pageSize: 1, q: '客户A' });
  assert.strictEqual(pagedView.items.length, 1, '读模型应支持服务端分页');
  assert.strictEqual(pagedView.pagination.total, 1, '读模型分页应返回筛选后的总数');
  assert.strictEqual(pagedView.pagination.pageSize, 1, '读模型分页应返回当前 pageSize');

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
