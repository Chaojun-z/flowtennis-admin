async function handleFinancePageData({
  user,
  res,
  sendJson,
  init,
  listCampusesWithDefaults,
  getCachedScan,
  getFinancePageScheduleRows,
  filterLoadAllForUser,
  buildFinancePageSnapshot,
  tables,
  FINANCE_PAGE_COURT_PROJECTION_FIELDS
}){
  if(user.role!=='admin')return sendJson(res,{error:'无权限'},403);
  await init();
  const {T_STUDENTS,T_PURCHASES,T_ENTITLEMENTS,T_ENTITLEMENT_LEDGER,T_COURTS,T_MEMBERSHIP_ORDERS,T_MEMBERSHIP_ACCOUNTS,T_USERS}=tables;
  const campuses=await listCampusesWithDefaults();
  const [students,purchases,entitlements,entitlementLedger,courts,membershipOrders,membershipAccounts,schedule,users]=await Promise.all([
    getCachedScan(T_STUDENTS).catch(()=>[]),
    getCachedScan(T_PURCHASES).catch(()=>[]),
    getCachedScan(T_ENTITLEMENTS).catch(()=>[]),
    getCachedScan(T_ENTITLEMENT_LEDGER).catch(()=>[]),
    getCachedScan(T_COURTS,{columns:FINANCE_PAGE_COURT_PROJECTION_FIELDS}).catch(()=>[]),
    getCachedScan(T_MEMBERSHIP_ORDERS).catch(()=>[]),
    getCachedScan(T_MEMBERSHIP_ACCOUNTS).catch(()=>[]),
    getFinancePageScheduleRows(),
    getCachedScan(T_USERS).catch(()=>[])
  ]);
  const scoped=filterLoadAllForUser({campuses,students,purchases,entitlements,entitlementLedger,courts,membershipOrders,membershipAccounts,schedule},user);
  scoped.users=users;
  const financeSnapshot=buildFinancePageSnapshot(scoped);
  return sendJson(res,{
    campuses:scoped.campuses,
    financeOverviewData:financeSnapshot.financeOverviewData,
    financeNormalizedRows:financeSnapshot.financeNormalizedRows,
    financeSettlementRows:financeSnapshot.financeSettlementRows,
    generatedAt:''
  });
}

module.exports={handleFinancePageData};
