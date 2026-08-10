const {
  buildCourtAccountListViewFromData,
  buildFilters,
  buildListPage,
  buildMembershipFinanceSummaryFromCourtAccountItems,
  buildSummary,
  courtAccountLightListItem,
  filterCourtAccountItems,
  membershipFinanceStatsFromCourtAccountItem,
  sortCourtAccountItems
} = require('./court-account-read-model.js');

const COURT_ACCOUNT_LIST_INDEX_VERSION = 'court-account-list-index-v1';
const COURT_ACCOUNT_LIST_INDEX_NOT_READY_CODE = 'COURT_ACCOUNT_LIST_INDEX_NOT_READY';
const COURT_ACCOUNT_LIST_INDEX_NOT_READY_TTL_MS = 60000;
const COURT_ACCOUNT_INDEX_COURT_COLUMNS = [
  'name', 'phone', 'campus', 'status', 'mergedIntoCourtId', 'deletedAt', 'history',
  'studentIds', 'studentId', 'depositAttitude', 'recentFollowUpDate', 'nextFollowUpDate', 'notes',
  'cachedBalance', 'cachedTotalDeposit', 'cachedTotalSpent', 'cachedTotalReceived',
  'balance', 'totalDeposit', 'spentAmount', 'receivedAmount', 'updatedAt', 'createdAt'
];
const COURT_ACCOUNT_INDEX_COURT_LIGHT_COLUMNS = COURT_ACCOUNT_INDEX_COURT_COLUMNS.filter((field) => field !== 'history');
const COURT_ACCOUNT_INDEX_STUDENT_COLUMNS = ['name'];
const COURT_ACCOUNT_INDEX_LEAD_COLUMNS = ['courtId', 'owner'];
const COURT_ACCOUNT_INDEX_MEMBERSHIP_ACCOUNT_COLUMNS = [
  'courtId', 'status', 'tierCode', 'memberLabel', 'discountRate', 'validUntil', 'hardExpireAt',
  'cycleStartDate', 'createdAt', 'updatedAt', 'voidedAt', 'voidedBy', 'voidReason',
  'membershipPlanId', 'memberTag', 'thirdPartyLevelName'
];
const COURT_ACCOUNT_INDEX_MEMBERSHIP_ORDER_COLUMNS = [
  'courtId', 'membershipAccountId', 'membershipPlanId', 'membershipPlanName', 'planName',
  'purchaseDate', 'effectiveDate', 'cycleStartDate', 'createdAt', 'status', 'systemAmount',
  'finalAmount', 'rechargeAmount', 'amount', 'bonusAmount', 'discountRate', 'tierCode',
  'qualifiesRenewalReset', 'overrideReason', 'notes', 'customAdjustment', 'benefitSnapshot',
  'benefitTemplateSnapshot', 'planBenefitTemplateSnapshot', 'benefitLabel', 'benefitValidUntil',
  'memberTag', 'thirdPartyLevelName'
];
const COURT_ACCOUNT_INDEX_MEMBERSHIP_PLAN_COLUMNS = [
  'tierCode', 'memberTag', 'thirdPartyLevelName', 'benefitTemplateSnapshot', 'benefitTemplate'
];
const COURT_ACCOUNT_INDEX_MEMBERSHIP_LEDGER_COLUMNS = [
  'membershipAccountId', 'courtId', 'membershipOrderRef', 'benefitCode', 'benefitLabel',
  'action', 'delta', 'unit', 'reason', 'operator', 'createdAt', 'relatedDate'
];
const COURT_ACCOUNT_INDEX_MEMBERSHIP_EVENT_COLUMNS = ['courtId', 'membershipAccountId', 'type', 'createdAt'];

function money(value) {
  return Math.round((Number(value) || 0) * 100) / 100;
}

function text(value) {
  return String(value || '').trim();
}

function dayKey(value) {
  return text(value).replace(/\//g, '-').replace(/\./g, '-').slice(0, 10);
}

function isTableNotExistError(err) {
  const message = String(err?.message || err || '');
  return err?.code === 400 && /table not exist|Request table not exist/i.test(message);
}

function courtAccountListIndexNotReadyError(message = '订场会员列表索引未初始化') {
  const err = new Error(message);
  err.code = COURT_ACCOUNT_LIST_INDEX_NOT_READY_CODE;
  err.statusCode = 503;
  return err;
}

function buildBookingDayStats(bookingRows = []) {
  const map = new Map();
  (bookingRows || []).forEach((row) => {
    const date = dayKey(row.bookingDate || row.date || row.businessDate || row.createdAt);
    if (!date) return;
    const current = map.get(date) || {
      date,
      bookingCount: 0,
      bookingAmount: 0,
      bookingHours: 0,
      memberBookingCount: 0,
      memberBookingAmount: 0,
      guestBookingCount: 0,
      guestBookingAmount: 0
    };
    const amount = money(row.amount);
    if (row.type === '消费') {
      const hours = bookingHours(row);
      const isMember = String(row.payMethod || '').includes('储值');
      current.bookingCount += 1;
      current.bookingAmount = money(current.bookingAmount + amount);
      current.bookingHours = money(current.bookingHours + hours);
      if (isMember) {
        current.memberBookingCount += 1;
        current.memberBookingAmount = money(current.memberBookingAmount + amount);
      }
    } else if (row.type === '退款' || row.type === '冲正') {
      current.bookingAmount = money(current.bookingAmount - amount);
    }
    current.guestBookingCount = Math.max(0, current.bookingCount - current.memberBookingCount);
    current.guestBookingAmount = Math.max(0, money(current.bookingAmount - current.memberBookingAmount));
    map.set(date, current);
  });
  return [...map.values()].sort((a, b) => String(a.date).localeCompare(String(b.date)));
}

function bookingHours(row = {}) {
  const toMinutes = (value) => {
    const raw = text(value);
    const clock = raw.includes(' ') ? raw.slice(11, 16) : raw.slice(0, 8);
    const match = clock.match(/(\d{1,2})(?::|点)?(\d{1,2})?/);
    if (!match) return null;
    const hour = parseInt(match[1], 10);
    const minute = parseInt(match[2] || '0', 10);
    if (!Number.isFinite(hour) || !Number.isFinite(minute)) return null;
    return hour * 60 + minute;
  };
  const start = toMinutes(row.startTime);
  const end = toMinutes(row.endTime);
  if (start === null || end === null || end <= start) return 0;
  return money((end - start) / 60);
}

function buildIndexRowFromItem(item = {}, now = new Date().toISOString()) {
  const light = courtAccountLightListItem(item);
  return {
    id: text(item.id),
    courtId: text(item.id),
    version: COURT_ACCOUNT_LIST_INDEX_VERSION,
    item: light,
    bookingDayStats: buildBookingDayStats(item.bookingRows || []),
    membershipFinanceStats: membershipFinanceStatsFromCourtAccountItem(item),
    sourceUpdatedAt: text(item.updatedAt || item.createdAt),
    generatedAt: now
  };
}

function buildCourtAccountListIndexRowsFromData(source = {}, options = {}) {
  const view = buildCourtAccountListViewFromData(source, { ...options, includeDetails: true });
  const now = new Date().toISOString();
  return (view.items || []).map((item) => buildIndexRowFromItem(item, now)).filter((row) => row.id);
}

function normalizeIndexRows(rows = []) {
  return (rows || [])
    .filter((row) => row && text(row.id || row.courtId))
    .map((row) => ({
      ...row,
      id: text(row.id || row.courtId),
      courtId: text(row.courtId || row.id),
      item: row.item && typeof row.item === 'object' ? { ...row.item, id: text(row.item.id || row.courtId || row.id) } : null,
      bookingDayStats: Array.isArray(row.bookingDayStats) ? row.bookingDayStats : [],
      membershipFinanceStats: row.membershipFinanceStats && typeof row.membershipFinanceStats === 'object' ? row.membershipFinanceStats : null
    }))
    .filter((row) => row.item);
}

function applyCampusScope(items = [], options = {}) {
  const campus = text(options.campus);
  if (!campus || campus === 'all') return items;
  return items.filter((item) => text(item.campusCode) === campus);
}

function applyDateScope(item = {}, options = {}) {
  const start = dayKey(options.startDate);
  const end = dayKey(options.endDate);
  if (!start && !end) return item;
  const rows = (item.bookingDayStats || []).filter((row) => {
    const date = dayKey(row.date);
    if (!date) return false;
    if (start && date < start) return false;
    if (end && date > end) return false;
    return true;
  });
  const summary = rows.reduce((acc, row) => ({
    bookingCount: acc.bookingCount + (Number(row.bookingCount) || 0),
    bookingAmount: money(acc.bookingAmount + money(row.bookingAmount)),
    bookingHours: money(acc.bookingHours + money(row.bookingHours)),
    memberBookingCount: acc.memberBookingCount + (Number(row.memberBookingCount) || 0),
    memberBookingAmount: money(acc.memberBookingAmount + money(row.memberBookingAmount)),
    lastBookingDate: row.date && row.date > acc.lastBookingDate ? row.date : acc.lastBookingDate
  }), {
    bookingCount: 0,
    bookingAmount: 0,
    bookingHours: 0,
    memberBookingCount: 0,
    memberBookingAmount: 0,
    lastBookingDate: ''
  });
  summary.guestBookingCount = Math.max(0, summary.bookingCount - summary.memberBookingCount);
  summary.guestBookingAmount = Math.max(0, money(summary.bookingAmount - summary.memberBookingAmount));
  return { ...item, ...summary, totalReceived: summary.bookingAmount };
}

function buildCourtAccountListViewFromIndexRows(rows = [], options = {}) {
  const indexRows = normalizeIndexRows(rows);
  const baseItems = indexRows.map((row) => ({
    ...row.item,
    bookingDayStats: row.bookingDayStats,
    membershipFinanceStats: row.membershipFinanceStats,
    indexGeneratedAt: row.generatedAt || ''
  }));
  let filtered = filterCourtAccountItems(baseItems, options);
  filtered = applyCampusScope(filtered, options).map((item) => applyDateScope(item, options));
  if (dayKey(options.startDate) || dayKey(options.endDate)) filtered = filtered.filter((item) => (Number(item.bookingCount) || 0) > 0);
  const sorted = sortCourtAccountItems(filtered, options);
  const paging = buildListPage(sorted, options);
  const pageItems = paging ? paging.rows : sorted;
  const summary = buildSummary(sorted);
  summary.membershipFinanceSummary = buildMembershipFinanceSummaryFromCourtAccountItems(sorted);
  return {
    summary,
    filters: buildFilters({ items: baseItems, campuses: [] }),
    items: pageItems.map(({ bookingDayStats, membershipFinanceStats, ...item }) => item),
    membershipOrderAuditRows: [],
    membershipLedgerAuditRows: [],
    pagination: paging ? { total: paging.total, page: paging.page, pageSize: paging.pageSize, pages: paging.pages } : null,
    meta: {
      generatedAt: new Date().toISOString(),
      source: 'court-account-list-index',
      indexVersion: COURT_ACCOUNT_LIST_INDEX_VERSION,
      includeDetails: false
    }
  };
}

function createCourtAccountListIndexLoader(deps = {}) {
  const { getCachedScan, getCachedRow, tables = {} } = deps;
  let notReadyUntil = 0;
  let notReadyMessage = '';
  function rememberNotReady(message) {
    notReadyUntil = Date.now() + COURT_ACCOUNT_LIST_INDEX_NOT_READY_TTL_MS;
    notReadyMessage = message;
    return courtAccountListIndexNotReadyError(message);
  }
  return async function loadCourtAccountListIndex(options = {}) {
    if (!options.forceFresh && notReadyUntil > Date.now()) {
      throw courtAccountListIndexNotReadyError(notReadyMessage || '订场会员列表索引未初始化');
    }
    let rows = [];
    if (typeof getCachedRow === 'function' && tables.courtAccountListIndexTasks) {
      const marker = await getCachedRow(tables.courtAccountListIndexTasks, '__last_full_rebuild__').catch(() => null);
      if (marker?.status !== 'done' || !(Number(marker?.total) > 0)) {
        throw rememberNotReady('订场会员列表索引未完成首轮重建');
      }
    }
    try {
      rows = await getCachedScan(tables.courtAccountListIndex, options.forceFresh ? { fresh: true } : {});
    } catch (err) {
      if (isTableNotExistError(err)) throw rememberNotReady('订场会员列表索引表未初始化');
      throw err;
    }
    if (!Array.isArray(rows) || !rows.length) {
      throw rememberNotReady('订场会员列表索引为空，请先完成索引重建和口径校验');
    }
    if (typeof getCachedRow === 'function' && tables.courtAccountListIndexTasks) {
      const marker = await getCachedRow(tables.courtAccountListIndexTasks, '__last_full_rebuild__').catch(() => null);
      const expectedTotal = Number(marker?.total) || 0;
      if (expectedTotal > rows.length) {
        throw rememberNotReady(`订场会员列表索引未完成首轮重建：${rows.length}/${expectedTotal}`);
      }
    }
    notReadyUntil = 0;
    notReadyMessage = '';
    return buildCourtAccountListViewFromIndexRows(rows, options);
  };
}

function createCourtAccountListIndexSync(deps = {}) {
  const { listCampusesWithDefaults, getCachedScan, getCachedRow, put, del, mkTable, courtAccountListSnapshotSync, tables = {} } = deps;
  const scanRows = (table) => table ? getCachedScan(table).catch(() => []) : Promise.resolve([]);
  const strictScanRows = async (table, label, options = {}) => {
    if (!table) throw new Error(`缺少${label || '事实表'}配置`);
    try {
      return await getCachedScan(table, options);
    } catch (err) {
      const error = new Error(`订场会员列表索引重建读取失败：${label || table}`);
      error.cause = err;
      throw error;
    }
  };
  async function loadCourtsForIndex() {
    const lightRows = await strictScanRows(tables.courts, '订场用户表', { fresh: true, pageLimit: 50, columns: COURT_ACCOUNT_INDEX_COURT_LIGHT_COLUMNS });
    const rows = [];
    for (let i = 0; i < lightRows.length; i += 5) {
      const batch = lightRows.slice(i, i + 5);
      const fullRows = await Promise.all(batch.map(async (row) => {
        const courtId = text(row?.id);
        if (!courtId) return null;
        const full = await getCachedRow(tables.courts, courtId).catch((err) => {
          const error = new Error(`订场会员列表索引重建读取失败：订场用户详情 ${courtId}`);
          error.cause = err;
          throw error;
        });
        return full ? { ...row, ...full } : row;
      }));
      rows.push(...fullRows.filter(Boolean));
    }
    return rows;
  }
  async function ensureIndexTables() {
    if (typeof mkTable !== 'function') return;
    if (tables.courtAccountListIndex) await mkTable(tables.courtAccountListIndex);
    if (tables.courtAccountListIndexTasks) await mkTable(tables.courtAccountListIndexTasks);
  }
  async function buildSingleCourtIndexRow(courtId) {
    const court = await getCachedRow(tables.courts, courtId).catch(() => null);
    if (!court || String(court.status || 'active') === 'inactive') return null;
    const [campuses, students, leads, membershipAccounts, membershipOrders, membershipPlans, membershipBenefitLedger, membershipAccountEvents] = await Promise.all([
      listCampusesWithDefaults(),
      scanRows(tables.students),
      scanRows(tables.leads),
      scanRows(tables.membershipAccounts),
      scanRows(tables.membershipOrders),
      scanRows(tables.membershipPlans),
      scanRows(tables.membershipBenefitLedger),
      scanRows(tables.membershipAccountEvents)
    ]);
    return buildCourtAccountListIndexRowsFromData({
      campuses,
      students,
      courts: [court],
      leads,
      membershipAccounts,
      membershipOrders,
      membershipPlans,
      membershipBenefitLedger,
      membershipAccountEvents
    })[0] || null;
  }
  async function recordRebuildTask(courtId, reason, err) {
    if (!tables.courtAccountListIndexTasks) return null;
    const now = new Date().toISOString();
    return put(tables.courtAccountListIndexTasks, String(courtId || ''), {
      id: String(courtId || ''),
      courtId: String(courtId || ''),
      reason: reason || 'unknown',
      status: 'pending',
      error: String(err?.message || err || '').slice(0, 500),
      updatedAt: now,
      createdAt: now
    }).catch(() => null);
  }
  async function rebuildCourt(courtId, reason = 'manual') {
    if (!tables.courtAccountListIndex || !courtId) return null;
    try {
      const row = await buildSingleCourtIndexRow(courtId);
      if (row) await put(tables.courtAccountListIndex, row.id, row);
      else await del(tables.courtAccountListIndex, courtId).catch(() => null);
      if (courtAccountListSnapshotSync?.recordDelta) {
        await courtAccountListSnapshotSync.recordDelta(row, { courtId, deleted: !row, reason }).catch(() => null);
      }
      if (tables.courtAccountListIndexTasks) await put(tables.courtAccountListIndexTasks, String(courtId), {
        id: String(courtId),
        courtId: String(courtId),
        reason,
        status: 'done',
        error: '',
        updatedAt: new Date().toISOString()
      }).catch(() => null);
      return row;
    } catch (err) {
      await recordRebuildTask(courtId, reason, err);
      return null;
    }
  }
  async function loadAllRowsFromFacts() {
    if (!tables.courtAccountListIndex) throw new Error('缺少订场会员列表索引表');
    const [campuses, students, courts, leads, membershipAccounts, membershipOrders, membershipPlans, membershipBenefitLedger, membershipAccountEvents] = await Promise.all([
      listCampusesWithDefaults(),
      strictScanRows(tables.students, '学员表', { fresh: true, columns: COURT_ACCOUNT_INDEX_STUDENT_COLUMNS }),
      loadCourtsForIndex(),
      strictScanRows(tables.leads, '线索跟进人表', { fresh: true, columns: COURT_ACCOUNT_INDEX_LEAD_COLUMNS }),
      strictScanRows(tables.membershipAccounts, '会员账户表', { fresh: true, columns: COURT_ACCOUNT_INDEX_MEMBERSHIP_ACCOUNT_COLUMNS }),
      strictScanRows(tables.membershipOrders, '会员订单表', { fresh: true, columns: COURT_ACCOUNT_INDEX_MEMBERSHIP_ORDER_COLUMNS }),
      strictScanRows(tables.membershipPlans, '会员方案表', { fresh: true, columns: COURT_ACCOUNT_INDEX_MEMBERSHIP_PLAN_COLUMNS }),
      strictScanRows(tables.membershipBenefitLedger, '会员权益流水表', { fresh: true, columns: COURT_ACCOUNT_INDEX_MEMBERSHIP_LEDGER_COLUMNS }),
      strictScanRows(tables.membershipAccountEvents, '会员账户事件表', { fresh: true, columns: COURT_ACCOUNT_INDEX_MEMBERSHIP_EVENT_COLUMNS })
    ]);
    const rows = buildCourtAccountListIndexRowsFromData({
      campuses,
      students,
      courts,
      leads,
      membershipAccounts,
      membershipOrders,
      membershipPlans,
      membershipBenefitLedger,
      membershipAccountEvents
    });
    return rows;
  }
  async function rebuildAllFromFacts() {
    await ensureIndexTables();
    const rows = await loadAllRowsFromFacts();
    await Promise.all(rows.map((row) => put(tables.courtAccountListIndex, row.id, row)));
    return { total: rows.length, rows };
  }
  return {
    rebuildCourt,
    ensureIndexTables,
    loadAllRowsFromFacts,
    rebuildAllFromFacts,
    recordRebuildTask
  };
}

module.exports = {
  COURT_ACCOUNT_LIST_INDEX_VERSION,
  COURT_ACCOUNT_LIST_INDEX_NOT_READY_CODE,
  COURT_ACCOUNT_LIST_INDEX_NOT_READY_TTL_MS,
  buildCourtAccountListIndexRowsFromData,
  buildCourtAccountListViewFromIndexRows,
  createCourtAccountListIndexLoader,
  createCourtAccountListIndexSync
};
