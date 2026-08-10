const assert = require('assert');
const { buildCourtAccountListViewFromIndexRows } = require('../server/page-data/court-account-list-index.js');

const rows = Array.from({ length: 5000 }, (_, index) => {
  const n = index + 1;
  const day = String((n % 28) + 1).padStart(2, '0');
  const isMember = n % 3 === 0;
  return {
    id: `court-${n}`,
    courtId: `court-${n}`,
    item: {
      id: `court-${n}`,
      displayName: n % 10 === 0 ? `搜索目标${n}` : `订场用户${n}`,
      phone: `138${String(n).padStart(8, '0')}`,
      campusCode: n % 2 === 0 ? 'shunyi_mapo' : 'shilipu',
      campusName: n % 2 === 0 ? '顺义马坡' : '十里堡',
      owner: n % 5 === 0 ? '跟进人甲' : '跟进人乙',
      accountType: isMember ? '会员账户' : '普通账户',
      membershipTierLabel: isMember ? '储值会员' : '-',
      membershipStatus: isMember ? '正常' : '未开卡',
      membershipStatusCode: isMember ? 'active' : '',
      balance: isMember ? 1000 : 0,
      totalDeposit: isMember ? 2000 : 0,
      totalSpent: 100 + n,
      totalReceived: 100 + n,
      bookingCount: 1,
      bookingAmount: 100 + n,
      bookingHours: 1,
      memberBookingCount: isMember ? 1 : 0,
      memberBookingAmount: isMember ? 100 + n : 0,
      guestBookingCount: isMember ? 0 : 1,
      guestBookingAmount: isMember ? 0 : 100 + n,
      lastBookingDate: `2026-08-${day}`,
      firstOpenDate: isMember ? `2026-07-${day}` : '',
      updatedAt: `2026-08-${day} 10:00:00`,
      createdAt: `2026-01-${day} 10:00:00`
    },
    bookingDayStats: [{
      date: `2026-08-${day}`,
      bookingCount: 1,
      bookingAmount: 100 + n,
      bookingHours: 1,
      memberBookingCount: isMember ? 1 : 0,
      memberBookingAmount: isMember ? 100 + n : 0,
      guestBookingCount: isMember ? 0 : 1,
      guestBookingAmount: isMember ? 0 : 100 + n
    }],
    membershipFinanceStats: isMember ? {
      memberCount: 1,
      rechargeCount: 2,
      paidAmount: 2000,
      bonusAmount: 200,
      consumableAmount: 2200,
      pendingAmount: 1000
    } : null
  };
});

const scenarios = [
  ['默认首屏', { page: 1, pageSize: 15, sortKey: 'lastBookingDate', sortDir: 'desc' }],
  ['校区筛选', { page: 1, pageSize: 15, campus: 'shunyi_mapo', sortKey: 'lastBookingDate', sortDir: 'desc' }],
  ['日期筛选', { page: 1, pageSize: 15, startDate: '2026-08-01', endDate: '2026-08-31', sortKey: 'lastBookingDate', sortDir: 'desc' }],
  ['搜索', { page: 1, pageSize: 15, q: '搜索目标', sortKey: 'lastBookingDate', sortDir: 'desc' }],
  ['翻页', { page: 2, pageSize: 15, campus: 'shunyi_mapo', startDate: '2026-08-01', endDate: '2026-08-31', sortKey: 'lastBookingDate', sortDir: 'desc' }]
];

const report = [];
scenarios.forEach(([label, options]) => {
  const times = [];
  let firstPageIds = [];
  for (let i = 0; i < 3; i += 1) {
    const started = Date.now();
    const view = buildCourtAccountListViewFromIndexRows(rows, options);
    const elapsed = Date.now() - started;
    times.push(elapsed);
    if (i === 0) firstPageIds = view.items.map((item) => item.id);
    assert.ok(elapsed < 1000, `${label} 5000 条索引行筛选排序统计分页应在 1s 内完成，实际 ${elapsed}ms`);
    assert.strictEqual(view.items.length, 15, `${label} 当前页只应返回 pageSize 条`);
    assert.ok(view.pagination.total > view.items.length, `${label} total 应是完整筛选结果总数，不是当前页数量`);
    assert.strictEqual(view.meta.source, 'court-account-list-index', `${label} 应走列表索引`);
  }
  report.push(`${label}: ${times.join('ms / ')}ms, first=${firstPageIds.slice(0, 3).join(',')}`);
});

const page1 = buildCourtAccountListViewFromIndexRows(rows, { page: 1, pageSize: 15, sortKey: 'lastBookingDate', sortDir: 'desc' });
const page2 = buildCourtAccountListViewFromIndexRows(rows, { page: 2, pageSize: 15, sortKey: 'lastBookingDate', sortDir: 'desc' });
const combinedIds = [...page1.items, ...page2.items].map((item) => item.id);
assert.strictEqual(new Set(combinedIds).size, combinedIds.length, '连续翻页不应重复');
assert.strictEqual(page1.pagination.total, page2.pagination.total, '翻页 total 应稳定');

console.log(`court account list index performance tests passed\n${report.join('\n')}`);
