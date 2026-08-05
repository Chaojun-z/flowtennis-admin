const { handleFinancePageData } = require('./finance-page.js');
const { handleOperationsPageData } = require('./operations-page.js');
const { createCourtAccountListViewLoader, createCourtAccountListCompareLoader, buildScopedCourtAccountListSummary } = require('./court-account-read-model.js');
const { createScheduleListViewLoader, createScheduleListCompareLoader } = require('./schedule-list-read-model.js');
const fixedCourtAcceptanceSamples = require('../../docs/performance-governance/15-样板页固定验收样本.json');
const fixedScheduleAcceptanceSamples = require('../../docs/prd/source/08-具体需求/01-管理后台/02-教学与排课/07-排课管理固定验收样本.json');

function createResidualPageDataRoutes(deps={}){
  const {
    init,sendJson,listCampusesWithDefaults,getCachedScan,getFinancePageScheduleRows,getScheduleListRows,
    isProductionRuntime,
    scanCoachProposals,buildCoachRefs,timedEndpointMetric,
    scanFirstRows,filterLoadAllForUser,mergeDuplicateLeadRows,buildFinancePageSnapshot,getFinancePageSnapshot,getFinancePageSnapshotIfCached,FINANCE_PAGE_COURT_PROJECTION_FIELDS,
    tables={}
  }=deps;
  const {
    T_STUDENTS,T_PURCHASES,T_ENTITLEMENTS,T_ENTITLEMENT_LEDGER,T_COURTS,
    T_MEMBERSHIP_ORDERS,T_MEMBERSHIP_ACCOUNTS,T_MEMBERSHIP_PLANS,T_MEMBERSHIP_BENEFIT_LEDGER,T_MEMBERSHIP_ACCOUNT_EVENTS,T_USERS,
    T_LEADS,T_LEAD_FOLLOWUPS,T_COACHES,T_SCHEDULE,T_FEEDBACKS
  }=tables;
  const loadCourtAccountListView=createCourtAccountListViewLoader({
    listCampusesWithDefaults,
    getCachedScan,
    fixedSampleAccounts:fixedCourtAcceptanceSamples,
    tables:{
      students:T_STUDENTS,
      courts:T_COURTS,
      leads:T_LEADS,
      membershipAccounts:T_MEMBERSHIP_ACCOUNTS,
      membershipOrders:T_MEMBERSHIP_ORDERS,
      membershipPlans:T_MEMBERSHIP_PLANS,
      membershipBenefitLedger:T_MEMBERSHIP_BENEFIT_LEDGER,
      membershipAccountEvents:T_MEMBERSHIP_ACCOUNT_EVENTS
    }
  });
  const loadCourtAccountListViewCompare=createCourtAccountListCompareLoader({
    loadCourtAccountListView,
    fixedSampleAccounts:fixedCourtAcceptanceSamples
  });
  const loadScheduleListView=createScheduleListViewLoader({
    getScheduleListRows,
    getCachedScan,
    scanCoachProposals,
    buildCoachRefs,
    fixedScheduleSamples:fixedScheduleAcceptanceSamples,
    tables:{
      students:T_STUDENTS,
      coaches:T_COACHES,
      users:T_USERS,
      feedbacks:T_FEEDBACKS
    }
  });
  const loadScheduleListViewCompare=createScheduleListCompareLoader({
    getScheduleListRows,
    getCachedScan,
    scanCoachProposals,
    buildCoachRefs,
    fixedScheduleSamples:fixedScheduleAcceptanceSamples,
    loadScheduleListView,
    tables:{
      students:T_STUDENTS,
      coaches:T_COACHES,
      users:T_USERS,
      feedbacks:T_FEEDBACKS
    }
  });
  const pageDataScopeFromQuery=query=>({
    campus:String(query?.get('campus')||'').trim(),
    campusName:String(query?.get('campusName')||'').trim(),
    startDate:String(query?.get('startDate')||'').trim(),
    endDate:String(query?.get('endDate')||'').trim()
  });
  const hasPageDataScope=scope=>!!(scope.campus&&scope.campus!=='all'||scope.campusName&&scope.campusName!=='all'||scope.startDate||scope.endDate);

  return async function handleResidualPageDataRoutes({path,method,user,res,query}){
    if(path==='/page-data/finance'&&method==='GET'){
      return handleFinancePageData({query,user,res,sendJson,init,listCampusesWithDefaults,getCachedScan,getFinancePageScheduleRows,filterLoadAllForUser,buildFinancePageSnapshot,isProductionRuntime,scanFirstRows,FINANCE_PAGE_COURT_PROJECTION_FIELDS,tables:{T_STUDENTS,T_PURCHASES,T_ENTITLEMENTS,T_ENTITLEMENT_LEDGER,T_COURTS,T_MEMBERSHIP_ORDERS,T_MEMBERSHIP_ACCOUNTS,T_USERS,T_LEADS}});
    }
    if(path==='/page-data/operations'&&method==='GET'){
      return handleOperationsPageData({query,user,res,sendJson,init,listCampusesWithDefaults,getCachedScan,scanFirstRows,isProductionRuntime,getFinancePageScheduleRows,filterLoadAllForUser,mergeDuplicateLeadRows,buildFinancePageSnapshot,getFinancePageSnapshot,getFinancePageSnapshotIfCached,FINANCE_PAGE_COURT_PROJECTION_FIELDS,tables:{T_LEADS,T_LEAD_FOLLOWUPS,T_STUDENTS,T_PURCHASES,T_ENTITLEMENTS,T_ENTITLEMENT_LEDGER,T_COURTS,T_MEMBERSHIP_ORDERS,T_MEMBERSHIP_ACCOUNTS,T_COACHES,T_USERS,T_SCHEDULE,T_FEEDBACKS}});
    }
    if(path==='/page-data/court-account-list-view'&&method==='GET'){
      if(user.role!=='admin')return sendJson(res,{error:'无权限'},403);
      await init();
      const ids=String(query?.get('ids')||'').split(',').map(item=>String(item||'').trim()).filter(Boolean);
      const sample=String(query?.get('sample')||'').trim();
      const forceFresh=query?.get('fresh')==='1'||query?.get('forceFresh')==='1';
      const view=await loadCourtAccountListView({
        sampleIds:ids,
        sample,
        forceFresh,
        includeDetails:ids.length>0,
        page:query?.get('page')||'',
        pageSize:query?.get('pageSize')||'',
        q:query?.get('q')||'',
        owner:query?.get('owner')||'',
        accountType:query?.get('accountType')||''
      });
      const scope=pageDataScopeFromQuery(query);
      if(hasPageDataScope(scope))view.summary=buildScopedCourtAccountListSummary(view,scope);
      return sendJson(res,view);
    }
    if(path==='/page-data/court-account-list-view-compare'&&method==='GET'){
      if(user.role!=='admin')return sendJson(res,{error:'无权限'},403);
      await init();
      const ids=String(query?.get('ids')||'').split(',').map(item=>String(item||'').trim()).filter(Boolean);
      const sample=String(query?.get('sample')||'').trim();
      return sendJson(res,await loadCourtAccountListViewCompare({sampleIds:ids,sample}));
    }
    if(path==='/page-data/schedule-list-view'&&method==='GET'){
      if(user.role!=='admin')return sendJson(res,{error:'无权限'},403);
      await init();
      const ids=String(query?.get('ids')||'').split(',').map(item=>String(item||'').trim()).filter(Boolean);
      const sample=String(query?.get('sample')||'').trim();
      const load=()=>loadScheduleListView({
        sampleIds:ids,
        sample,
        page:query?.get('page')||'',
        pageSize:query?.get('pageSize')||'',
        q:query?.get('q')||'',
        campus:query?.get('campus')||'',
        coach:query?.get('coach')||'',
        courseType:query?.get('courseType')||'',
        status:query?.get('status')||''
      });
      const view=timedEndpointMetric?await timedEndpointMetric('pageData.scheduleListView',load):await load();
      return sendJson(res,view);
    }
    if(path==='/page-data/schedule-list-view-compare'&&method==='GET'){
      if(user.role!=='admin')return sendJson(res,{error:'无权限'},403);
      await init();
      const ids=String(query?.get('ids')||'').split(',').map(item=>String(item||'').trim()).filter(Boolean);
      const sample=String(query?.get('sample')||'').trim();
      const load=()=>loadScheduleListViewCompare({sampleIds:ids,sample});
      const compare=timedEndpointMetric?await timedEndpointMetric('pageData.scheduleListViewCompare',load):await load();
      return sendJson(res,compare);
    }
    return false;
  };
}

module.exports={createResidualPageDataRoutes};
