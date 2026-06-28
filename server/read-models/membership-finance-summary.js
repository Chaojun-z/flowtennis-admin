const { normalizeCourtHistory } = require('../page-data/court-account-read-model.js');

function money(value) {
  return Math.round((Number(value) || 0) * 100) / 100;
}

function isInactiveStatus(value) {
  return ['voided', 'refunded', 'cancelled', 'canceled', 'deleted', 'cleared', 'inactive'].includes(String(value || '').toLowerCase());
}

function isStoredValuePayMethod(value) {
  const method = String(value || '').trim();
  return method === '储值扣款' || method === '储值卡' || method.includes('储值');
}

function orderAmount(order) {
  return money(order?.finalAmount ?? order?.rechargeAmount ?? order?.amount ?? 0);
}

function buildMembershipFinanceSummary({ courts = [], membershipAccounts = [], membershipOrders = [] } = {}) {
  const activeAccounts = (membershipAccounts || []).filter(account => !isInactiveStatus(account?.status));
  const activeAccountIds = new Set(activeAccounts.map(account => String(account?.id || '').trim()).filter(Boolean));
  const activeCourtIds = new Set(activeAccounts.map(account => String(account?.courtId || '').trim()).filter(Boolean));
  const validOrders = (membershipOrders || [])
    .filter(order => !isInactiveStatus(order?.status))
    .filter(order => orderAmount(order) > 0)
    .filter(order => {
      const accountId = String(order?.membershipAccountId || '').trim();
      const courtId = String(order?.courtId || '').trim();
      return (!activeAccountIds.size && !activeCourtIds.size) || activeAccountIds.has(accountId) || activeCourtIds.has(courtId);
    });

  const paidAmount = money(validOrders.reduce((sum, order) => sum + orderAmount(order), 0));
  const bonusAmount = money(validOrders.reduce((sum, order) => sum + money(order?.bonusAmount), 0));
  const courtMap = new Map((courts || []).map(court => [String(court?.id || '').trim(), court]));
  const consumedAmount = money([...activeCourtIds].reduce((sum, courtId) => {
    const court = courtMap.get(courtId);
    if (!court || String(court?.status || 'active') === 'inactive' || court?.mergedIntoCourtId || court?.deletedAt) return sum;
    return sum + normalizeCourtHistory(court.history).reduce((rowSum, row) => {
      const amount = money(row?.amount);
      const category = String(row?.category || '');
      if (category.includes('内部占用')) return rowSum;
      if (row.type === '消费' && isStoredValuePayMethod(row.payMethod)) return rowSum + amount;
      if (row.type === '冲正' && isStoredValuePayMethod(row.payMethod)) return rowSum - amount;
      return rowSum;
    }, 0);
  }, 0));
  const consumableAmount = money(paidAmount + bonusAmount);
  return {
    memberCount: activeAccounts.length,
    rechargeCount: validOrders.length,
    paidAmount,
    bonusAmount,
    consumableAmount,
    consumedAmount,
    pendingAmount: money(Math.max(0, consumableAmount - consumedAmount))
  };
}

module.exports = { buildMembershipFinanceSummary };
