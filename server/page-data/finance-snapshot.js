const { createFinanceUnifiedRowsBuilder } = require('../read-models/finance-unified-rows.js');
const {
  buildFinanceOverviewDataFromRows,
  mergeFinanceOverviewDataWithRows
} = require('../read-models/finance-summary.js');
const { buildFinancePrepaidView } = require('../read-models/unified-page-views.js');

function createFinanceSnapshotHelpers(deps = {}) {
  const {
    buildFinanceCampusResolvers,
    normalizeOperatorAccountName,
    parseArr,
    financeBusinessDateTime,
    financeWeekdayText,
    financeDifferenceReason,
    financePurchaseStatusText,
    normalizeEntitlementLedgerRowsForView,
    importedLedgerMonthKey,
    isBillableSchedule,
    isDirectPaidSchedule,
    isStoredValuePayMethod,
    roundMoney,
    financeTimeText,
    financeDateTimeText,
    normalizeCourtHistory,
    effectiveScheduleStatus,
    parseLessonValue,
    computeCourtFinance
  } = deps;

  const buildFinanceUnifiedRows = createFinanceUnifiedRowsBuilder({
    buildFinanceCampusResolvers,
    normalizeOperatorAccountName,
    parseArr,
    financeBusinessDateTime,
    financeWeekdayText,
    financeDifferenceReason,
    financePurchaseStatusText,
    normalizeEntitlementLedgerRowsForView,
    importedLedgerMonthKey,
    isBillableSchedule,
    isDirectPaidSchedule,
    isStoredValuePayMethod,
    roundMoney,
    financeTimeText,
    financeDateTimeText,
    normalizeCourtHistory
  });

  function buildFinanceSettlementRows({ campuses = [], schedule = [] } = {}) {
    const campusName = buildFinanceCampusResolvers(campuses);
    const grouped = new Map();
    (schedule || []).forEach(item => {
      const month = String(item.startTime || '').slice(0, 7);
      if (!month) return;
      const coach = String(item.coach || '').trim() || '未分配';
      const rowCampusName = campusName.fromValue(item.campus) || '—';
      const key = [month, coach, rowCampusName].join('|');
      const current = grouped.get(key) || { month, coach, campusName: rowCampusName, lessonUnits: 0, lateCount: 0, lateFeeAmount: 0 };
      if (effectiveScheduleStatus(item) === '已结束') current.lessonUnits += parseLessonValue(item.lessonCount, 1);
      if (item.coachLateFree) {
        current.lateCount += 1;
        current.lateFeeAmount += Number(item.coachLateFieldFeeAmount) || 0;
      }
      grouped.set(key, current);
    });
    return [...grouped.values()]
      .filter(row => row.lessonUnits > 0 || row.lateCount > 0 || row.lateFeeAmount > 0)
      .sort((a, b) => String(b.month || '').localeCompare(String(a.month || '')) || String(a.coach || '').localeCompare(String(b.coach || ''), 'zh-Hans-CN'));
  }

  function buildFinancePageSnapshot(source = {}, scope = {}) {
    const financeNormalizedRows = buildFinanceUnifiedRows(source);
    return {
      generatedAt: new Date().toISOString(),
      financeOverviewData: buildFinanceOverviewDataFromRows(financeNormalizedRows, scope),
      financeNormalizedRows,
      financeSettlementRows: buildFinanceSettlementRows(source),
      financePrepaidView: buildFinancePrepaidView(financeNormalizedRows)
    };
  }

  const FINANCE_IMPORT_INCREMENT_PREFIX = 'private_lesson_csv_import_';
  const FINANCE_MEMBERSHIP_IMPORT_ORDER_PREFIX = 'membership-import-order-';
  const MABAO_FINAL_IMPORT_TAG = 'shunyi_mapo-finance-import-20260524';

  function isFinanceImportIncrementRow(row) {
    return String(row?.id || '').startsWith(FINANCE_IMPORT_INCREMENT_PREFIX) || String(row?.importBatchId || '').startsWith(FINANCE_IMPORT_INCREMENT_PREFIX);
  }

  function isFinanceMembershipImportIncrementOrder(row) {
    return String(row?.id || '').startsWith(FINANCE_MEMBERSHIP_IMPORT_ORDER_PREFIX);
  }

  function courtWithFinanceImportHistory(court) {
    if (String(court?.status || 'active') === 'inactive' || court?.mergedIntoCourtId || court?.deletedAt) return { ...court, history: [] };
    const history = normalizeCourtHistory(court?.history).filter(row => String(row?.seedTag || '') === MABAO_FINAL_IMPORT_TAG || String(row?.id || '').startsWith('private_lesson_csv_import_20260524-court-'));
    return history.length ? { ...court, history } : { ...court, history: [] };
  }

  function membershipStoredValueOverview({ courts = [], membershipAccounts = [] } = {}) {
    const courtMap = new Map((courts || []).map(court => [String(court.id || ''), court]));
    const activeAccounts = (membershipAccounts || []).filter(account => !['voided', 'cleared'].includes(String(account?.status || '')));
    const courtIds = new Set(activeAccounts.map(account => String(account?.courtId || '')).filter(Boolean));
    const rows = [...courtIds].map(id => courtMap.get(id)).filter(court => court && String(court?.status || 'active') !== 'inactive' && !court?.mergedIntoCourtId && !court?.deletedAt);
    const totals = rows.reduce((sum, court) => {
      const finance = computeCourtFinance({ ...court, allowNegativeBalance: true });
      sum.balance += Number(finance.balance) || 0;
      sum.totalDeposit += Number(finance.totalDeposit) || 0;
      sum.bonus += normalizeCourtHistory(court.history).filter(row => row.type === '充值').reduce((rowSum, row) => rowSum + (Number(row.bonusAmount) || 0), 0);
      sum.consumed += Number(finance.storedValueSpent) || 0;
      return sum;
    }, { balance: 0, totalDeposit: 0, bonus: 0, consumed: 0 });
    return {
      storedValueBalance: roundMoney(totals.balance),
      storedValueAccountTotal: roundMoney(totals.balance + totals.consumed),
      storedValueConsumed: roundMoney(totals.consumed),
      storedValueDeposit: roundMoney(totals.totalDeposit),
      storedValueBonus: roundMoney(totals.bonus)
    };
  }

  function buildVerifiedFinanceWithImportIncrements(verifiedFinance = {}, source = {}) {
    const purchaseRows = (source.purchases || []).filter(isFinanceImportIncrementRow);
    const purchaseIds = new Set(purchaseRows.map(row => String(row.id || '')).filter(Boolean));
    const entitlementRows = (source.entitlements || []).filter(row => isFinanceImportIncrementRow(row) || purchaseIds.has(String(row.purchaseId || '')));
    const entitlementIds = new Set(entitlementRows.map(row => String(row.id || '')).filter(Boolean));
    const ledgerRows = (source.entitlementLedger || []).filter(row => isFinanceImportIncrementRow(row) || purchaseIds.has(String(row.purchaseId || '')) || entitlementIds.has(String(row.entitlementId || '')));
    const membershipOrderRows = (source.membershipOrders || []).filter(isFinanceMembershipImportIncrementOrder);
    const courtRows = (source.courts || []).map(courtWithFinanceImportHistory).filter(row => normalizeCourtHistory(row.history).length);
    const directScheduleRows = (source.schedule || []).filter(row => (isDirectPaidSchedule(row) && !isStoredValuePayMethod(row.payMethod || row.paymentChannel) && roundMoney(row.paidAmount || row.paymentAmount) > 0) || roundMoney(row.fieldFeeAmount) > 0);
    const incrementRows = buildFinanceUnifiedRows({
      campuses: source.campuses || [],
      students: source.students || [],
      purchases: purchaseRows,
      entitlements: entitlementRows,
      entitlementLedger: ledgerRows,
      courts: courtRows,
      membershipOrders: membershipOrderRows,
      schedule: directScheduleRows
    });
    const baseOverview = verifiedFinance?.overviewData || null;
    if (!baseOverview) return {
      overviewData: null,
      normalizedRows: [...(verifiedFinance?.normalizedRows || []), ...incrementRows]
    };
    const overviewData = mergeFinanceOverviewDataWithRows(baseOverview, incrementRows);
    const all = { ...(overviewData.all || {}) };
    if (Array.isArray(source.membershipAccounts)) {
      Object.assign(all, membershipStoredValueOverview({ courts: source.courts || [], membershipAccounts: source.membershipAccounts }));
    }
    return {
      overviewData: { ...overviewData, all },
      normalizedRows: [...(verifiedFinance.normalizedRows || []), ...incrementRows]
    };
  }

  return {
    buildFinanceUnifiedRows,
    buildFinanceSettlementRows,
    buildFinancePageSnapshot,
    buildVerifiedFinanceWithImportIncrements,
    buildFinanceOverviewDataFromRows
  };
}

module.exports = { createFinanceSnapshotHelpers };
