const { buildCustomerLifecycleRows } = require('../read-models/customer-lifecycle.js');
const { readLeadSourceRows } = require('../lead-source-read-model.js');
const { normalizeCampusValue } = require('../../public/assets/scripts/core/campus.js');

const CUSTOMER_LIFECYCLE_LEAD_FIELDS=[
  'id','leadId','displayName','wechatName','name','phone','source','campus','campusName',
  'owner','coach','coachName','studentId','courtId','membershipAccountId'
];

function campusKey(value){
  return normalizeCampusValue(value);
}

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
  isProductionRuntime,
  scanFirstRows,
  tables,
  FINANCE_PAGE_COURT_PROJECTION_FIELDS,
  query
}){
  if(user.role!=='admin')return sendJson(res,{error:'无权限'},403);
  await init();
  const {T_STUDENTS,T_PURCHASES,T_ENTITLEMENTS,T_ENTITLEMENT_LEDGER,T_COURTS,T_MEMBERSHIP_ORDERS,T_MEMBERSHIP_ACCOUNTS,T_USERS,T_LEADS}=tables;
  const campuses=await listCampusesWithDefaults();
  const [students,purchases,entitlements,entitlementLedger,courts,membershipOrders,membershipAccounts,schedule,users,leads]=await Promise.all([
    getCachedScan(T_STUDENTS).catch(()=>[]),
    getCachedScan(T_PURCHASES).catch(()=>[]),
    getCachedScan(T_ENTITLEMENTS).catch(()=>[]),
    getCachedScan(T_ENTITLEMENT_LEDGER).catch(()=>[]),
    getCachedScan(T_COURTS,{columns:FINANCE_PAGE_COURT_PROJECTION_FIELDS}).catch(()=>[]),
    getCachedScan(T_MEMBERSHIP_ORDERS).catch(()=>[]),
    getCachedScan(T_MEMBERSHIP_ACCOUNTS).catch(()=>[]),
    getFinancePageScheduleRows(),
    getCachedScan(T_USERS).catch(()=>[]),
    T_LEADS?readLeadSourceRows({isProductionRuntime,scanFirstRows,getCachedScan,table:T_LEADS,columns:CUSTOMER_LIFECYCLE_LEAD_FIELDS}).catch(()=>[]):Promise.resolve([])
  ]);
  const scoped=filterLoadAllForUser({campuses,students,purchases,entitlements,entitlementLedger,courts,membershipOrders,membershipAccounts,schedule},user);
  const scopedLeads=filterLoadAllForUser({campuses:scoped.campuses,students:scoped.students,courts:scoped.courts,membershipAccounts:scoped.membershipAccounts,leads},user).leads;
  scoped.users=users;
  const financeScope={
    campus:String(query?.get('campus')||'').trim(),
    campusName:String(query?.get('campusName')||'').trim(),
    startDate:String(query?.get('startDate')||'').trim(),
    endDate:String(query?.get('endDate')||'').trim()
  };
  if(financeScope.campus&&financeScope.campus!=='all'){
    const campusRow=(scoped.campuses||[]).find(row=>[row?.code,row?.id,row?.name].map(campusKey).includes(campusKey(financeScope.campus)));
    if(campusRow)financeScope.campusName=String(campusRow.name||campusRow.code||campusRow.id||financeScope.campusName).trim();
  }
  const financeSnapshot=buildFinancePageSnapshot(scoped,financeScope);
  const customerLifecycleRows=buildCustomerLifecycleRows({
    leads:scopedLeads,
    students:scoped.students,
    purchases:scoped.purchases,
    entitlements:scoped.entitlements,
    schedule:scoped.schedule,
    courts:scoped.courts,
    membershipOrders:scoped.membershipOrders,
    membershipAccounts:scoped.membershipAccounts
  });
  return sendJson(res,{
    campuses:scoped.campuses,
    financeOverviewData:financeSnapshot.financeOverviewData,
    financeNormalizedRows:financeSnapshot.financeNormalizedRows,
    financeSettlementRows:financeSnapshot.financeSettlementRows,
    financePrepaidView:financeSnapshot.financePrepaidView,
    customerLifecycleRows,
    generatedAt:''
  });
}

module.exports={handleFinancePageData};
