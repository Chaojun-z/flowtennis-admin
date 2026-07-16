const MATCH_COURT_FINANCE_ACCOUNT_ID = 'match-court-finance';
const DEFAULT_SAMPLE_SIZE = 10;
const { buildMembershipFinanceSummary } = require('../read-models/membership-finance-summary.js');

function money(value) {
  return Math.round((Number(value) || 0) * 100) / 100;
}

function courtText(value) {
  return String(value || '').trim();
}

const COURT_ACCOUNT_CAMPUS_ALIASES = { shunyi_mapo: 'shunyi_mapo', '顺义马坡': 'shunyi_mapo', '马坡': 'shunyi_mapo' };
COURT_ACCOUNT_CAMPUS_ALIASES[['ma', 'bao'].join('')] = 'shunyi_mapo';
COURT_ACCOUNT_CAMPUS_ALIASES[['马', '宝'].join('')] = 'shunyi_mapo';
function courtAccountCampusKey(value) {
  const raw = courtText(value);
  return COURT_ACCOUNT_CAMPUS_ALIASES[raw] || raw;
}

function parseArr(value) {
  if (Array.isArray(value)) return value;
  if (typeof value === 'string' && value) {
    try {
      return JSON.parse(value);
    } catch {
      return [];
    }
  }
  return [];
}

function normalizeCourtHistory(history) {
  return parseArr(history).map((row) => ({
    ...row,
    amount: Math.abs(Number(row?.amount) || 0),
    bonusAmount: Number(row?.bonusAmount) || 0,
    type: row?.type || '消费',
    payMethod: row?.payMethod || '',
    category: row?.category || '其他'
  }));
}

function isStoredValuePayMethod(value) {
  const method = String(value || '').trim();
  return method === '储值扣款' || method === '储值卡';
}

function courtHistoryDateKey(value) {
  const text = String(value || '').trim();
  if (!text) return '';
  const match = text.match(/(\d{4})[年./-](\d{1,2})[月./-](\d{1,2})/);
  if (match) return `${match[1]}-${String(match[2]).padStart(2, '0')}-${String(match[3]).padStart(2, '0')}`;
  const shortMatch = text.match(/(^|[^\d])(\d{1,2})[月./-](\d{1,2})(?:日)?/);
  if (shortMatch) return `${new Date().getFullYear()}-${String(shortMatch[2]).padStart(2, '0')}-${String(shortMatch[3]).padStart(2, '0')}`;
  const parsed = new Date(text.replace(' ', 'T'));
  if (Number.isNaN(parsed.getTime())) return '';
  return `${parsed.getFullYear()}-${String(parsed.getMonth() + 1).padStart(2, '0')}-${String(parsed.getDate()).padStart(2, '0')}`;
}

function courtHistoryBusinessDate(row) {
  return courtHistoryDateKey(row?.occurredDate || row?.date || row?.businessDate || row?.bookingDate || row?.startDate || row?.consumedAt || row?.usedAt || row?.operationAt || row?.recordedAt || row?.createdAt || row?.startTime || '');
}

function computeLegacyFinance(court) {
  const history = normalizeCourtHistory(court?.history);
  if (!history.length) {
    return {
      balance: money(court?.balance),
      totalDeposit: money(court?.totalDeposit),
      spentAmount: money(court?.spentAmount),
      receivedAmount: money(court?.receivedAmount ?? court?.totalDeposit)
    };
  }
  const totals = {
    balance: 0,
    totalDeposit: 0,
    spentAmount: 0,
    receivedAmount: 0
  };
  history.forEach((row) => {
    const amount = money(row?.amount);
    const bonus = money(row?.bonusAmount);
    const isInternal = String(row?.category || '').includes('内部占用');
    if (row.type === '充值') {
      totals.totalDeposit += amount;
      totals.receivedAmount += amount;
      totals.balance += amount + bonus;
      return;
    }
    if (row.type === '消费') {
      if (isInternal) return;
      totals.spentAmount += amount;
      if (isStoredValuePayMethod(row.payMethod)) totals.balance -= amount;
      else totals.receivedAmount += amount;
      return;
    }
    if (row.type === '退款') {
      if (row.payMethod === '储值退款') totals.balance -= amount;
      totals.receivedAmount -= amount;
      return;
    }
    if (row.type === '冲正') {
      totals.spentAmount -= amount;
      if (isStoredValuePayMethod(row.payMethod)) totals.balance += amount;
      else totals.receivedAmount -= amount;
    }
  });
  return {
    balance: money(totals.balance),
    totalDeposit: money(totals.totalDeposit),
    spentAmount: money(totals.spentAmount),
    receivedAmount: money(totals.receivedAmount)
  };
}

function isCourtBookingHistoryRow(row) {
  const category = String(row?.category || '');
  if (category.includes('内部占用')) return false;
  if (category.includes('订场')) return true;
  if (['储值扣款', '现场收款', '代用户订场'].includes(String(row?.revenueBucket || ''))) return true;
  if (row?.startTime && row?.endTime && row?.venue) return true;
  const payMethod = String(row?.payMethod || '').trim();
  return row?.type === '消费' && !isStoredValuePayMethod(payMethod) && (!category || category === '其他');
}

function clockMinutes(value) {
  const text = String(value || '').trim();
  const clock = text.includes(' ') ? text.slice(11, 16) : text.slice(0, 8);
  const match = clock.match(/(\d{1,2})(?::|点)?(\d{1,2})?/);
  if (!match) return null;
  const hour = parseInt(match[1], 10);
  const minute = parseInt(match[2] || '0', 10);
  if (!Number.isFinite(hour) || !Number.isFinite(minute)) return null;
  return hour * 60 + minute;
}

function bookingDurationHours(row) {
  const start = clockMinutes(row?.startTime);
  const end = clockMinutes(row?.endTime);
  if (start === null || end === null || end <= start) return 0;
  return money((end - start) / 60);
}

function computeBookingSummary(court) {
  const history = normalizeCourtHistory(court?.history);
  const summary = { bookingCount: 0, bookingAmount: 0, bookingHours: 0, memberBookingCount: 0, memberBookingAmount: 0, guestBookingCount: 0, guestBookingAmount: 0, lastBookingDate: '' };
  history.forEach((row) => {
    if (!isCourtBookingHistoryRow(row)) return;
    const amount = money(row?.amount);
    if (row.type === '消费') {
      const isMemberBooking = isStoredValuePayMethod(row?.payMethod) && String(row?.category || '').includes('订场');
      summary.bookingCount += 1;
      summary.bookingAmount += amount;
      summary.bookingHours += bookingDurationHours(row);
      if (isMemberBooking) {
        summary.memberBookingCount += 1;
        summary.memberBookingAmount += amount;
      } else {
        summary.guestBookingCount += 1;
        summary.guestBookingAmount += amount;
      }
      const date = courtHistoryBusinessDate(row);
      if (date && (!summary.lastBookingDate || date > summary.lastBookingDate)) summary.lastBookingDate = date;
      return;
    }
    if (row.type === '退款' || row.type === '冲正') {
      summary.bookingAmount -= amount;
    }
  });
  summary.bookingAmount = Math.max(0, money(summary.bookingAmount));
  summary.bookingHours = Math.max(0, money(summary.bookingHours));
  summary.memberBookingAmount = Math.max(0, money(summary.memberBookingAmount));
  summary.guestBookingAmount = Math.max(0, money(summary.guestBookingAmount));
  return summary;
}

function computeMemberBookingCount(court) {
  return normalizeCourtHistory(court?.history).filter((row) => row?.type === '消费' && isStoredValuePayMethod(row?.payMethod) && String(row?.category || '').includes('订场')).length;
}

function membershipStatusText(status) {
  return ({
    active: '正常',
    extended: '延续期',
    expired: '已到期',
    cleared: '已清零',
    voided: '已作废',
    inactive: '未启用'
  }[status] || status || '未开卡');
}

function membershipDisplayStatus(account) {
  if (!account) return '未开卡';
  if (account.status === 'voided') return '已作废';
  if (account.status === 'cleared') return '已清零';
  if (account.status === 'extended') return '延续期';
  return membershipStatusText(account.status);
}

function selectMembershipAccount(courtId, membershipAccounts = []) {
  const rows = membershipAccounts.filter((row) => row?.courtId === courtId);
  if (!rows.length) return null;
  const activeRow = rows.find((row) => row?.status !== 'voided');
  if (activeRow) return activeRow;
  return rows.sort((a, b) => String(b?.updatedAt || b?.createdAt || '').localeCompare(String(a?.updatedAt || a?.createdAt || '')))[0] || null;
}

function membershipTierLabel(account, membershipOrders = [], membershipPlans = []) {
  if (!account) return '-';
  const latestOrder = membershipOrders
    .filter((row) => row?.membershipAccountId === account.id)
    .sort((a, b) => String(b?.purchaseDate || '').localeCompare(String(a?.purchaseDate || '')))[0] || null;
  const plan = membershipPlans.find((row) => row?.id === (latestOrder?.membershipPlanId || account?.membershipPlanId)) || {};
  return account?.tierCode || latestOrder?.tierCode || plan?.tierCode || '-';
}

function validMembershipOrdersForAccount(account, membershipOrders = []) {
  if (!account) return [];
  const accountId = String(account?.id || '').trim();
  const courtId = String(account?.courtId || '').trim();
  return (membershipOrders || []).filter((row) => {
    const status = String(row?.status || '').trim();
    if (['voided', 'refunded', 'deleted', 'cancelled', 'canceled'].includes(status)) return false;
    if (accountId && String(row?.membershipAccountId || '').trim() === accountId) return true;
    return courtId && String(row?.courtId || '').trim() === courtId;
  });
}

function linkedStudentSummary(court, students = []) {
  const ids = [...new Set([
    ...parseArr(court?.studentIds).map((item) => String(item || '').trim()).filter(Boolean),
    String(court?.studentId || '').trim()
  ].filter(Boolean))];
  if (!ids.length) return '-';
  const names = ids
    .map((id) => students.find((student) => student?.id === id))
    .filter(Boolean)
    .map((student) => String(student?.name || '').trim())
    .filter(Boolean);
  return names.join('、') || '-';
}

function displayName(court, studentSummary) {
  return String(court?.name || '').trim() || (studentSummary && studentSummary !== '-' ? studentSummary : '') || String(court?.phone || '').trim() || '未命名订场用户';
}

function buildCourtAccountType(account, finance) {
  if (!account) return '普通账户';
  if (['voided', 'cleared'].includes(account.status)) return '普通账户';
  return ['active', 'extended'].includes(account.status) ? '会员账户' : '普通账户';
}

function leadOwnerForCourt(court, leads = []) {
  const courtId = courtText(court?.id);
  if (!courtId) return '';
  const lead = (leads || []).find((row) => courtText(row?.courtId) === courtId);
  return courtText(lead?.owner);
}

function isInactiveMembershipStatus(value) {
  return ['voided', 'refunded', 'cancelled', 'canceled', 'deleted', 'cleared', 'inactive'].includes(String(value || '').toLowerCase());
}

function validMembershipOrders(account, membershipOrders = []) {
  return validMembershipOrdersForAccount(account, membershipOrders)
    .filter((row) => money(row?.rechargeAmount ?? row?.finalAmount ?? row?.amount) > 0)
    .sort((a, b) => String(b?.purchaseDate || b?.createdAt || '').localeCompare(String(a?.purchaseDate || a?.createdAt || '')));
}

function parseBenefitSnapshot(value) {
  if (!value) return {};
  if (typeof value === 'object' && !Array.isArray(value)) return value;
  if (typeof value === 'string') {
    try {
      const parsed = JSON.parse(value);
      return parsed && typeof parsed === 'object' && !Array.isArray(parsed) ? parsed : {};
    } catch {
      return {};
    }
  }
  return {};
}

function benefitTemplateItems(order = {}, membershipPlans = []) {
  const plan = membershipPlans.find((row) => row?.id === order?.membershipPlanId) || {};
  const snapshot = parseBenefitSnapshot(order?.benefitSnapshot || order?.benefitTemplateSnapshot || order?.planBenefitTemplateSnapshot || plan?.benefitTemplateSnapshot || plan?.benefitTemplate);
  return Object.entries(snapshot)
    .filter(([code]) => code !== 'customBenefits')
    .map(([code, value]) => ({
      code,
      label: value?.label || order?.benefitLabel || code,
      unit: value?.unit || '次',
      total: parseInt(value?.count ?? value?.total ?? value, 10) || 0,
      designatedCoachIds: parseArr(value?.designatedCoachIds)
    }))
    .filter((item) => item.total > 0);
}

function benefitRowsForAccount(account, membershipOrders = [], membershipPlans = [], membershipBenefitLedger = []) {
  if (!account || ['voided', 'cleared'].includes(account.status)) return [];
  const rows = {};
  validMembershipOrders(account, membershipOrders).forEach((order) => {
    benefitTemplateItems(order, membershipPlans).forEach((item) => {
      const ledgerRows = (membershipBenefitLedger || []).filter((row) => row?.membershipOrderRef === order.id && row?.benefitCode === item.code && row?.action !== 'grant');
      const positiveDelta = ledgerRows.filter((row) => (parseInt(row?.delta, 10) || 0) > 0).reduce((sum, row) => sum + (parseInt(row?.delta, 10) || 0), 0);
      const negativeDelta = ledgerRows.filter((row) => (parseInt(row?.delta, 10) || 0) < 0).reduce((sum, row) => sum + (parseInt(row?.delta, 10) || 0), 0);
      const total = item.total + positiveDelta;
      const benefitValidUntil = order?.benefitValidUntil || '';
      const expired = !!(benefitValidUntil && benefitValidUntil < new Date().toISOString().slice(0, 10));
      const remaining = expired ? 0 : Math.max(0, total + negativeDelta);
      if (!rows[item.code]) rows[item.code] = { code: item.code, label: item.label, unit: item.unit, total: 0, remaining: 0, batches: [], designatedCoachIds: [] };
      rows[item.code].total += total;
      rows[item.code].remaining += remaining;
      rows[item.code].batches.push({ membershipOrderRef: order.id, total, remaining, benefitValidUntil, expired });
      rows[item.code].designatedCoachIds = [...new Set([...rows[item.code].designatedCoachIds, ...item.designatedCoachIds])];
    });
  });
  return Object.values(rows).sort((a, b) => String(a.label || '').localeCompare(String(b.label || ''), 'zh-CN'));
}

function rechargeRowsForAccount(account, membershipOrders = [], membershipPlans = []) {
  return validMembershipOrders(account, membershipOrders).map((order) => ({
    id: order.id,
    courtId: order.courtId || account?.courtId || '',
    purchaseDate: order.purchaseDate || order.effectiveDate || order.cycleStartDate || order.createdAt || '',
    createdAt: order.createdAt || '',
    membershipPlanName: order.membershipPlanName || order.planName || '-',
    membershipPlanId: order.membershipPlanId || '',
    tierCode: order.tierCode || '',
    systemAmount: money(order.systemAmount ?? order.rechargeAmount ?? order.finalAmount ?? order.amount),
    finalAmount: money(order.finalAmount ?? order.rechargeAmount ?? order.amount),
    paidAmount: money(order.finalAmount ?? order.rechargeAmount ?? order.amount),
    rechargeAmount: money(order.rechargeAmount ?? order.finalAmount ?? order.amount),
    bonusAmount: money(order.bonusAmount),
    discountRate: Number(order.discountRate) || 0,
    qualifiesRenewalReset: order.qualifiesRenewalReset,
    overrideReason: order.overrideReason || '',
    status: order.status || '',
    notes: courtText(order.notes),
    customAdjustment: !!order.customAdjustment,
    benefitSummary: benefitTemplateItems(order, membershipPlans).map((item) => `${item.label} ${item.total}${item.unit}`).join('；') || '-'
  }));
}

function ledgerRowsForAccount(account, membershipBenefitLedger = []) {
  if (!account) return [];
  return (membershipBenefitLedger || [])
    .filter((row) => row?.membershipAccountId === account.id && row?.action !== 'grant')
    .sort((a, b) => String(b?.createdAt || b?.relatedDate || '').localeCompare(String(a?.createdAt || a?.relatedDate || '')))
    .map((row) => ({
      id: row.id,
      membershipAccountId: row.membershipAccountId,
      courtId: row.courtId,
      membershipOrderRef: row.membershipOrderRef || '',
      benefitCode: row.benefitCode || '',
      benefitLabel: row.benefitLabel || row.benefitCode || '',
      action: row.action || '',
      delta: parseInt(row.delta, 10) || 0,
      unit: row.unit || '次',
      reason: row.reason || '',
      operator: row.operator || '',
      createdAt: row.createdAt || row.relatedDate || ''
    }));
}

function bookingRowsForCourt(court) {
  return normalizeCourtHistory(court?.history)
    .filter(isCourtBookingHistoryRow)
    .sort((a, b) => String(courtHistoryBusinessDate(b) || b?.createdAt || '').localeCompare(String(courtHistoryBusinessDate(a) || a?.createdAt || '')))
    .map((row) => ({
      id: row.id || '',
      bookingDate: courtHistoryBusinessDate(row),
      startTime: row.startTime || '',
      endTime: row.endTime || '',
      venue: row.venue || '',
      type: row.type || '',
      category: row.category || '',
      payMethod: row.payMethod || '',
      amount: money(row.amount),
      note: row.note || '',
      studentId: row.studentId || ''
    }));
}

function membershipAccountPayload(account) {
  if (!account) return null;
  return {
    id: account.id || '',
    courtId: account.courtId || '',
    status: account.status || '',
    tierCode: account.tierCode || '',
    memberLabel: account.memberLabel || '',
    discountRate: Number(account.discountRate) || 0,
    validUntil: account.validUntil || '',
    hardExpireAt: account.hardExpireAt || '',
    cycleStartDate: account.cycleStartDate || '',
    createdAt: account.createdAt || '',
    voidedAt: account.voidedAt || '',
    voidedBy: account.voidedBy || '',
    voidReason: account.voidReason || ''
  };
}

function buildLegacyItem(court, ctx) {
  const finance = computeLegacyFinance(court);
  const bookingSummary = computeBookingSummary(court);
  const account = selectMembershipAccount(court?.id, ctx.membershipAccounts);
  const studentSummary = linkedStudentSummary(court, ctx.students);
  const tierLabel = membershipTierLabel(account, ctx.membershipOrders, ctx.membershipPlans);
  const membershipRechargeCount = validMembershipOrders(account, ctx.membershipOrders).length;
  const membershipRenewalCount = Math.max(0, membershipRechargeCount - 1);
  return {
    id: court.id,
    history: normalizeCourtHistory(court?.history),
    displayName: displayName(court, studentSummary),
    phone: String(court?.phone || '').trim(),
    campusCode: String(court?.campus || '').trim(),
    campusName: ctx.campusMap.get(String(court?.campus || '').trim()) || String(court?.campus || '').trim() || '-',
    owner: leadOwnerForCourt(court, ctx.leads),
    depositAttitude: String(court?.depositAttitude || '').trim(),
    recentFollowUpDate: String(court?.recentFollowUpDate || '').trim(),
    nextFollowUpDate: String(court?.nextFollowUpDate || '').trim(),
    notesSummary: String(court?.notes || '').trim(),
    accountType: buildCourtAccountType(account, finance),
    membershipTierLabel: account && !['voided', 'cleared'].includes(account.status) ? tierLabel : '-',
    membershipStatus: membershipDisplayStatus(account),
    membershipStatusCode: account?.status || '',
    membershipDiscountText: account && !['voided', 'cleared'].includes(account.status) && account?.discountRate ? `${Math.round((Number(account.discountRate) || 1) * 100) / 10} 折` : '-',
    membershipValidUntil: account && !['voided', 'cleared'].includes(account.status) ? String(account?.validUntil || '').trim() || '-' : '-',
    linkedStudentSummary: studentSummary,
    lowBalance: finance.balance > 0 && finance.balance <= 500,
    memberBookingCount: bookingSummary.memberBookingCount,
    membershipRechargeCount,
    membershipRenewalCount,
    hasMembershipRepeatRecharge: membershipRechargeCount > 1,
    hasMembershipRenewal: membershipRenewalCount > 0,
    hasMembershipBookingRetention: bookingSummary.memberBookingCount > 0,
    bookingCount: bookingSummary.bookingCount,
    bookingHours: bookingSummary.bookingHours,
    memberBookingAmount: bookingSummary.memberBookingAmount,
    guestBookingCount: bookingSummary.guestBookingCount,
    guestBookingAmount: bookingSummary.guestBookingAmount,
    bookingAmount: bookingSummary.bookingAmount,
    lastBookingDate: bookingSummary.lastBookingDate,
    balance: money(finance.balance),
    totalDeposit: money(finance.totalDeposit),
    totalSpent: money(finance.spentAmount),
    totalReceived: money(finance.receivedAmount),
    updatedAt: court?.updatedAt || court?.createdAt || '',
    createdAt: court?.createdAt || ''
  };
}

function buildReadModelItem(court, ctx) {
  const legacy = buildLegacyItem(court, ctx);
  const account = selectMembershipAccount(court?.id, ctx.membershipAccounts);
  const rechargeRows = rechargeRowsForAccount(account, ctx.membershipOrders, ctx.membershipPlans);
  const benefitRows = benefitRowsForAccount(account, ctx.membershipOrders, ctx.membershipPlans, ctx.membershipBenefitLedger);
  const ledgerRows = ledgerRowsForAccount(account, ctx.membershipBenefitLedger);
  const bookingRows = bookingRowsForCourt(court);
  const firstOpenDate = rechargeRows.map((row) => String(row.purchaseDate || '').slice(0, 10)).filter(Boolean).sort()[0] || account?.cycleStartDate || account?.createdAt || '';
  const balance = court?.cachedBalance === '' || court?.cachedBalance == null ? legacy.balance : money(court?.cachedBalance);
  const totalDeposit = court?.cachedTotalDeposit === '' || court?.cachedTotalDeposit == null ? legacy.totalDeposit : money(court?.cachedTotalDeposit);
  const totalSpent = court?.cachedTotalSpent === '' || court?.cachedTotalSpent == null ? legacy.totalSpent : money(court?.cachedTotalSpent);
  const totalReceived = court?.cachedTotalReceived === '' || court?.cachedTotalReceived == null ? legacy.totalReceived : money(court?.cachedTotalReceived);
  const item = {
    ...legacy,
    membershipAccount: membershipAccountPayload(account),
    firstOpenDate,
    rechargeRows,
    benefitRows,
    ledgerRows,
    bookingRows,
    balance,
    totalDeposit,
    totalSpent,
    totalReceived,
    lowBalance: balance > 0 && balance <= 500
  };
  item.exportRow = {
    id: item.id,
    displayName: item.displayName,
    phone: item.phone,
    linkedStudentSummary: item.linkedStudentSummary,
    campusName: item.campusName,
    balance: item.balance,
    totalDeposit: item.totalDeposit,
    totalSpent: item.totalSpent,
    totalReceived: item.totalReceived,
    owner: item.owner,
    depositAttitude: item.depositAttitude,
    notesSummary: item.notesSummary
  };
  return item;
}

function buildMembershipOrderAuditRows(items = []) {
  return (items || []).flatMap((item) => (item?.rechargeRows || []).map((row) => ({
    ...row,
    courtId: item.id || row.courtId || '',
    courtName: item.displayName || '-',
    orderDisplayText: [row.purchaseDate, row.membershipPlanName].filter(Boolean).join(' · ') || '-'
  }))).sort((a, b) => String(b.purchaseDate || b.createdAt || '').localeCompare(String(a.purchaseDate || a.createdAt || '')));
}

function buildMembershipLedgerAuditRows(items = []) {
  const orderRows = buildMembershipOrderAuditRows(items);
  const orderMap = new Map(orderRows.map((row) => [String(row.id || ''), row]));
  return (items || []).flatMap((item) => (item?.ledgerRows || []).map((row) => {
    const order = orderMap.get(String(row.membershipOrderRef || '')) || {};
    return {
      ...row,
      courtName: item.displayName || row.courtId || '-',
      orderDisplayText: order.orderDisplayText || '-'
    };
  })).sort((a, b) => String(b.createdAt || b.relatedDate || '').localeCompare(String(a.createdAt || a.relatedDate || '')));
}

function buildSummary(items = []) {
  const memberItems = items.filter((item) => item?.membershipStatusCode && !['voided', 'cleared'].includes(item.membershipStatusCode));
  return {
    totalCount: items.length,
    totalMemberCount: memberItems.length,
    totalBalance: money(memberItems.reduce((sum, item) => sum + money(item?.balance), 0)),
    totalDeposit: money(items.reduce((sum, item) => sum + money(item?.totalDeposit), 0)),
    totalSpent: money(items.reduce((sum, item) => sum + money(item?.totalSpent), 0)),
    totalReceived: money(items.reduce((sum, item) => sum + money(item?.totalReceived), 0)),
    totalBookingCount: items.reduce((sum, item) => sum + (Number(item?.bookingCount) || 0), 0),
    totalBookingHours: money(items.reduce((sum, item) => sum + money(item?.bookingHours), 0)),
    totalMemberBookingCount: items.reduce((sum, item) => sum + (Number(item?.memberBookingCount) || 0), 0),
    totalMemberBookingAmount: money(items.reduce((sum, item) => sum + money(item?.memberBookingAmount), 0)),
    totalMembershipRechargeCount: items.reduce((sum, item) => sum + (Number(item?.membershipRechargeCount) || 0), 0),
    totalMembershipRenewalCount: items.reduce((sum, item) => sum + (Number(item?.membershipRenewalCount) || 0), 0),
    totalMembershipRepeatRechargeCount: items.filter((item) => item?.hasMembershipRepeatRecharge).length,
    totalMembershipRetainedCount: memberItems.filter((item) => item?.hasMembershipBookingRetention).length,
    totalGuestBookingCount: items.reduce((sum, item) => sum + (Number(item?.guestBookingCount) || 0), 0),
    totalGuestBookingAmount: money(items.reduce((sum, item) => sum + money(item?.guestBookingAmount), 0)),
    totalBookingAmount: money(items.reduce((sum, item) => sum + money(item?.bookingAmount), 0))
  };
}

function scopeDateKey(value) {
  return String(value || '').trim().replace(/\//g, '-').replace(/\./g, '-').slice(0, 10);
}

function courtItemMatchesScope(item = {}, scope = {}) {
  const campus = courtAccountCampusKey(scope.campus || scope.campusCode || '');
  if (campus && campus !== 'all' && courtAccountCampusKey(item.campusCode) !== campus) return false;
  return true;
}

function bookingRowMatchesScope(row = {}, scope = {}) {
  const day = scopeDateKey(row.bookingDate || row.date || row.businessDate || row.createdAt);
  const start = scopeDateKey(scope.startDate);
  const end = scopeDateKey(scope.endDate);
  if (start && day && day < start) return false;
  if (end && day && day > end) return false;
  return true;
}

function scopedCourtItem(item = {}, scope = {}) {
  const start = scopeDateKey(scope.startDate);
  const end = scopeDateKey(scope.endDate);
  if (!start && !end) return item;
  const bookingRows = (item.bookingRows || []).filter(row => bookingRowMatchesScope(row, scope));
  const bookingCount = bookingRows.filter(row => row.type === '消费').length;
  const bookingAmount = money(bookingRows.reduce((sum, row) => {
    const sign = row.type === '退款' || row.type === '冲正' ? -1 : 1;
    return sum + sign * money(row.amount);
  }, 0));
  const memberBookingRows = bookingRows.filter(row => row.type === '消费' && String(row.payMethod || '').includes('储值'));
  const memberBookingAmount = money(memberBookingRows.reduce((sum, row) => sum + money(row.amount), 0));
  return {
    ...item,
    bookingRows,
    bookingCount,
    bookingAmount,
    bookingHours: money(bookingRows.filter(row => row.type === '消费').reduce((sum, row) => sum + bookingDurationHours(row), 0)),
    memberBookingCount: memberBookingRows.length,
    memberBookingAmount,
    guestBookingCount: Math.max(0, bookingCount - memberBookingRows.length),
    guestBookingAmount: Math.max(0, money(bookingAmount - memberBookingAmount)),
    totalReceived: bookingAmount,
    lastBookingDate: bookingRows.map(row => scopeDateKey(row.bookingDate || row.date || row.businessDate || row.createdAt)).filter(Boolean).sort().at(-1) || ''
  };
}

function buildScopedCourtAccountListSummary(view = {}, scope = {}) {
  const items = (view.items || [])
    .filter(item => courtItemMatchesScope(item, scope))
    .map(item => scopedCourtItem(item, scope))
    .filter(item => {
      const start = scopeDateKey(scope.startDate);
      const end = scopeDateKey(scope.endDate);
      return !start && !end ? true : (Number(item.bookingCount) || 0) > 0;
    });
  return buildSummary(items);
}

function buildFilters({ items = [], campuses = [] }) {
  const owners = [...new Set(items.map((item) => String(item?.owner || '').trim()).filter(Boolean))].sort();
  const accountTypes = [...new Set(items.map((item) => String(item?.accountType || '').trim()).filter(Boolean))].sort();
  return {
    owners,
    accountTypes,
    campuses: campuses.map((campus) => ({
      code: campus?.code || campus?.id || '',
      name: campus?.name || campus?.code || campus?.id || ''
    })).filter((item) => item.code)
  };
}

function resolveSampleIds({ sampleIds = [], sample = '', fixedSampleAccounts = [] } = {}) {
  if (Array.isArray(sampleIds) && sampleIds.length) return sampleIds.map((item) => String(item || '').trim()).filter(Boolean);
  if (String(sample || '').trim() === 'fixed') return fixedSampleAccounts.slice(0, DEFAULT_SAMPLE_SIZE).map((item) => String(item?.id || '').trim()).filter(Boolean);
  return [];
}

function rate(part, total) {
  return total ? Math.round((Number(part) || 0) * 1000 / (Number(total) || 1)) / 10 : 0;
}

function buildCourtChainMetricsFromItems(items = []) {
  const activeItems = (items || []).filter((item) => item && String(item.id || '') !== MATCH_COURT_FINANCE_ACCOUNT_ID);
  const courtUsers = activeItems.filter((item) => (Number(item.bookingCount) || 0) > 0);
  const memberItems = activeItems.filter((item) => item.accountType === '会员账户' || (item.membershipStatusCode && !['voided', 'cleared', 'inactive'].includes(item.membershipStatusCode)));
  const repeatBookingCount = courtUsers.filter((item) => (Number(item.bookingCount) || 0) >= 2).length;
  const memberRepeatCount = memberItems.filter((item) => (Number(item.membershipRechargeCount) || 0) >= 2).length;
  return {
    courtUsers: courtUsers.length,
    courtMembers: memberItems.length,
    memberRepeatCustomers: memberRepeatCount,
    courtRepeatCustomers: repeatBookingCount,
    memberConversionRate: rate(memberItems.length, courtUsers.length),
    memberRepeatRate: rate(memberRepeatCount, memberItems.length),
    courtRepeatRate: rate(repeatBookingCount, courtUsers.length)
  };
}

function buildCourtAccountListViewFromData(source = {}, options = {}) {
  const {
    campuses = [],
    students = [],
    courts = [],
    leads = [],
    membershipAccounts = [],
    membershipOrders = [],
    membershipPlans = [],
    membershipBenefitLedger = [],
    membershipAccountEvents = []
  } = source;
  const sampleIds = resolveSampleIds({ sampleIds: options.sampleIds, sample: options.sample, fixedSampleAccounts: options.fixedSampleAccounts || [] });
  const useLegacy = options.useLegacy === true;
  const campusMap = new Map((campuses || []).map((row) => [String(row?.code || row?.id || '').trim(), row?.name || row?.code || row?.id || '']));
  const activeCourts = (courts || [])
    .filter((row) => String(row?.status || 'active') !== 'inactive')
    .filter((row) => String(row?.id || '') !== MATCH_COURT_FINANCE_ACCOUNT_ID)
    .filter((row) => !sampleIds.length || sampleIds.includes(String(row?.id || '').trim()));
  const ctx = { campuses, campusMap, students, leads, membershipAccounts, membershipOrders, membershipPlans, membershipBenefitLedger, membershipAccountEvents };
  const items = activeCourts
    .map((court) => (useLegacy ? buildLegacyItem(court, ctx) : buildReadModelItem(court, ctx)))
    .sort((a, b) => String(b?.updatedAt || b?.createdAt || '').localeCompare(String(a?.updatedAt || a?.createdAt || '')));
  const summary = buildSummary(items);
  summary.membershipFinanceSummary = buildMembershipFinanceSummary({ courts: activeCourts, membershipAccounts, membershipOrders });
  return {
    summary,
    filters: buildFilters({ items, campuses }),
    items,
    membershipOrderAuditRows: buildMembershipOrderAuditRows(items),
    membershipLedgerAuditRows: buildMembershipLedgerAuditRows(items),
    meta: {
      generatedAt: new Date().toISOString(),
      source: useLegacy ? 'legacy' : 'unified-court-membership-read-model',
      sampleIds,
      sample: options.sample || ''
    }
  };
}

function createCourtAccountListViewLoader(deps) {
  const {
    listCampusesWithDefaults,
    getCachedScan,
    tables,
    fixedSampleAccounts = []
  } = deps;

  return async function loadCourtAccountListView(options = {}) {
    const sampleIds = resolveSampleIds({ sampleIds: options.sampleIds, sample: options.sample, fixedSampleAccounts });
    const useLegacy = options.useLegacy === true;
    const scanOptions = options.forceFresh ? { fresh: true } : {};
    const scanRows = (table) => getCachedScan(table, scanOptions).catch(() => []);
    const [campuses, students, courts, leads, membershipAccounts, membershipOrders, membershipPlans, membershipBenefitLedger, membershipAccountEvents] = await Promise.all([
      listCampusesWithDefaults(),
      scanRows(tables.students),
      scanRows(tables.courts),
      scanRows(tables.leads),
      scanRows(tables.membershipAccounts),
      scanRows(tables.membershipOrders),
      scanRows(tables.membershipPlans),
      scanRows(tables.membershipBenefitLedger),
      scanRows(tables.membershipAccountEvents)
    ]);
    return buildCourtAccountListViewFromData({
      campuses,
      students,
      courts,
      leads,
      membershipAccounts,
      membershipOrders,
      membershipPlans,
      membershipBenefitLedger,
      membershipAccountEvents
    }, { sampleIds, sample: options.sample, useLegacy });
  };
}

function createCourtAccountListCompareLoader(deps) {
  const {
    loadCourtAccountListView,
    fixedSampleAccounts = []
  } = deps;

  const rowFields = [
    'displayName',
    'phone',
    'campusName',
    'owner',
    'accountType',
    'membershipTierLabel',
    'membershipStatus',
    'membershipDiscountText',
    'membershipValidUntil',
    'linkedStudentSummary',
    'membershipRechargeCount',
    'membershipRenewalCount',
    'hasMembershipRepeatRecharge',
    'hasMembershipRenewal',
    'hasMembershipBookingRetention',
    'balance',
    'totalDeposit',
    'totalSpent',
    'totalReceived',
    'lowBalance'
  ];
  const summaryFields = ['totalCount', 'totalBalance', 'totalDeposit', 'totalSpent', 'totalReceived'];

  return async function loadCourtAccountListViewCompare(options = {}) {
    const sampleIds = resolveSampleIds({ sampleIds: options.sampleIds, sample: options.sample, fixedSampleAccounts });
    const [legacy, view] = await Promise.all([
      loadCourtAccountListView({ sampleIds, sample: options.sample, useLegacy: true }),
      loadCourtAccountListView({ sampleIds, sample: options.sample, useLegacy: false })
    ]);
    const viewMap = new Map((view.items || []).map((item) => [String(item?.id || ''), item]));
    const legacyMap = new Map((legacy.items || []).map((item) => [String(item?.id || ''), item]));
    const ids = [...new Set([...legacyMap.keys(), ...viewMap.keys()])];
    const items = ids.map((id) => {
      const legacyItem = legacyMap.get(id) || null;
      const viewItem = viewMap.get(id) || null;
      const diffs = rowFields
        .filter((field) => JSON.stringify(legacyItem?.[field]) !== JSON.stringify(viewItem?.[field]))
        .map((field) => ({
          field,
          legacyValue: legacyItem?.[field] ?? null,
          viewValue: viewItem?.[field] ?? null
        }));
      return {
        id,
        displayName: viewItem?.displayName || legacyItem?.displayName || '-',
        legacy: legacyItem,
        view: viewItem,
        diffs
      };
    });
    const summaryDiffs = summaryFields
      .filter((field) => JSON.stringify(legacy.summary?.[field]) !== JSON.stringify(view.summary?.[field]))
      .map((field) => ({
        field,
        legacyValue: legacy.summary?.[field] ?? null,
        viewValue: view.summary?.[field] ?? null
      }));
    return {
      meta: {
        generatedAt: new Date().toISOString(),
        sampleIds,
        sample: options.sample || '',
        comparedFields: {
          summary: summaryFields,
          items: rowFields
        }
      },
      summaryDiffs,
      items
    };
  };
}

module.exports = {
  bookingDurationHours,
  computeBookingSummary,
  buildCourtAccountListViewFromData,
  buildScopedCourtAccountListSummary,
  buildCourtChainMetricsFromItems,
  createCourtAccountListCompareLoader,
  createCourtAccountListViewLoader,
  courtHistoryBusinessDate,
  isCourtBookingHistoryRow,
  normalizeCourtHistory
};
