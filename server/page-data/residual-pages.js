const { handleFinancePageData } = require('./finance-page.js');
const { handleOperationsPageData } = require('./operations-page.js');
const { createCourtAccountListViewLoader, createCourtAccountListCompareLoader } = require('./court-account-read-model.js');
const fixedCourtAcceptanceSamples = require('../../docs/performance-governance/15-样板页固定验收样本.json');

function createResidualPageDataRoutes(deps={}){
  const {
    init,sendJson,listCampusesWithDefaults,getCachedScan,getFinancePageScheduleRows,
    scanFirstRows,filterLoadAllForUser,mergeDuplicateLeadRows,buildFinancePageSnapshot,getFinancePageSnapshotIfCached,FINANCE_PAGE_COURT_PROJECTION_FIELDS,
    tables={}
  }=deps;
  const {
    T_STUDENTS,T_PURCHASES,T_ENTITLEMENTS,T_ENTITLEMENT_LEDGER,T_COURTS,
    T_MEMBERSHIP_ORDERS,T_MEMBERSHIP_ACCOUNTS,T_MEMBERSHIP_PLANS,T_USERS,
    T_LEADS,T_LEAD_FOLLOWUPS,T_COACHES,T_SCHEDULE
  }=tables;
  const loadCourtAccountListView=createCourtAccountListViewLoader({
    listCampusesWithDefaults,
    getCachedScan,
    fixedSampleAccounts:fixedCourtAcceptanceSamples,
    tables:{
      students:T_STUDENTS,
      courts:T_COURTS,
      membershipAccounts:T_MEMBERSHIP_ACCOUNTS,
      membershipOrders:T_MEMBERSHIP_ORDERS,
      membershipPlans:T_MEMBERSHIP_PLANS
    }
  });
  const loadCourtAccountListViewCompare=createCourtAccountListCompareLoader({
    loadCourtAccountListView,
    fixedSampleAccounts:fixedCourtAcceptanceSamples
  });

  return async function handleResidualPageDataRoutes({path,method,user,res,query}){
    if(path==='/page-data/finance'&&method==='GET'){
      return handleFinancePageData({user,res,sendJson,init,listCampusesWithDefaults,getCachedScan,getFinancePageScheduleRows,filterLoadAllForUser,buildFinancePageSnapshot,FINANCE_PAGE_COURT_PROJECTION_FIELDS,tables:{T_STUDENTS,T_PURCHASES,T_ENTITLEMENTS,T_ENTITLEMENT_LEDGER,T_COURTS,T_MEMBERSHIP_ORDERS,T_MEMBERSHIP_ACCOUNTS,T_USERS}});
    }
    if(path==='/page-data/operations'&&method==='GET'){
      return handleOperationsPageData({query,user,res,sendJson,init,listCampusesWithDefaults,getCachedScan,scanFirstRows,getFinancePageScheduleRows,filterLoadAllForUser,mergeDuplicateLeadRows,buildFinancePageSnapshot,getFinancePageSnapshotIfCached,FINANCE_PAGE_COURT_PROJECTION_FIELDS,tables:{T_LEADS,T_LEAD_FOLLOWUPS,T_STUDENTS,T_PURCHASES,T_ENTITLEMENTS,T_ENTITLEMENT_LEDGER,T_COURTS,T_MEMBERSHIP_ORDERS,T_MEMBERSHIP_ACCOUNTS,T_COACHES,T_USERS,T_SCHEDULE}});
    }
    if(path==='/page-data/court-account-list-view'&&method==='GET'){
      if(user.role!=='admin')return sendJson(res,{error:'无权限'},403);
      await init();
      const ids=String(query?.get('ids')||'').split(',').map(item=>String(item||'').trim()).filter(Boolean);
      const sample=String(query?.get('sample')||'').trim();
      return sendJson(res,await loadCourtAccountListView({sampleIds:ids,sample}));
    }
    if(path==='/page-data/court-account-list-view-compare'&&method==='GET'){
      if(user.role!=='admin')return sendJson(res,{error:'无权限'},403);
      await init();
      const ids=String(query?.get('ids')||'').split(',').map(item=>String(item||'').trim()).filter(Boolean);
      const sample=String(query?.get('sample')||'').trim();
      return sendJson(res,await loadCourtAccountListViewCompare({sampleIds:ids,sample}));
    }
    return false;
  };
}

module.exports={createResidualPageDataRoutes};
