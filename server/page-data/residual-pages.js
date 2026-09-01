const { handleFinancePageData } = require('./finance-page.js');
const { handleOperationsPageData } = require('./operations-page.js');
const { createCourtAccountListViewLoader, createCourtAccountListCompareLoader } = require('./court-account-read-model.js');
const { COURT_ACCOUNT_LIST_INDEX_NOT_READY_CODE } = require('./court-account-list-index.js');
const { createCourtAccountListSnapshotLoader } = require('./court-account-list-snapshot.js');
const { createScheduleListViewLoader, createScheduleListCompareLoader } = require('./schedule-list-read-model.js');
const { createScheduleListSnapshotLoader, SCHEDULE_LIST_SNAPSHOT_NOT_READY_CODE } = require('./schedule-list-snapshot.js');
const fixedCourtAcceptanceSamples = require('../../docs/performance-governance/15-样板页固定验收样本.json');
const fixedScheduleAcceptanceSamples = require('../../docs/prd/source/08-具体需求/01-管理后台/02-教学与排课/07-排课管理固定验收样本.json');

function createResidualPageDataRoutes(deps={}){
  const {
    init,sendJson,listCampusesWithDefaults,getCachedScan,getCachedRow,getFinancePageScheduleRows,getScheduleListRows,
    isProductionRuntime,
    scanCoachProposals,buildCoachRefs,timedEndpointMetric,bootstrapScheduleListSnapshot,
    loadOperationsSnapshot,operationsSnapshotSync,
    scanFirstRows,filterLoadAllForUser,mergeDuplicateLeadRows,buildFinancePageSnapshot,getFinancePageSnapshot,getFinancePageSnapshotIfCached,FINANCE_PAGE_COURT_PROJECTION_FIELDS,
    tables={}
  }=deps;
  const {
    T_STUDENTS,T_PURCHASES,T_ENTITLEMENTS,T_ENTITLEMENT_LEDGER,T_COURTS,
    T_MEMBERSHIP_ORDERS,T_MEMBERSHIP_ACCOUNTS,T_MEMBERSHIP_PLANS,T_MEMBERSHIP_BENEFIT_LEDGER,T_MEMBERSHIP_ACCOUNT_EVENTS,T_USERS,
    T_LEADS,T_LEAD_FOLLOWUPS,T_COACHES,T_SCHEDULE,T_FEEDBACKS,T_COURT_ACCOUNT_LIST_INDEX,T_COURT_ACCOUNT_LIST_INDEX_TASKS,T_COURT_ACCOUNT_LIST_SNAPSHOT,T_SCHEDULE_LIST_SNAPSHOT
  }=tables;
  const loadCourtAccountListView=createCourtAccountListViewLoader({
    listCampusesWithDefaults,
    getCachedScan,
    getCachedRow,
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
  const loadCourtAccountListSnapshot=createCourtAccountListSnapshotLoader({
    getCachedRow,
    tables:{courtAccountListSnapshot:T_COURT_ACCOUNT_LIST_SNAPSHOT}
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
  const loadScheduleListSnapshot=createScheduleListSnapshotLoader({
    getCachedRow,
    tables:{scheduleListSnapshot:T_SCHEDULE_LIST_SNAPSHOT}
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
  return async function handleResidualPageDataRoutes({path,method,user,res,query}){
    if(path==='/page-data/finance'&&method==='GET'){
      return handleFinancePageData({query,user,res,sendJson,init,listCampusesWithDefaults,getCachedScan,getFinancePageScheduleRows,filterLoadAllForUser,buildFinancePageSnapshot,isProductionRuntime,scanFirstRows,FINANCE_PAGE_COURT_PROJECTION_FIELDS,tables:{T_STUDENTS,T_PURCHASES,T_ENTITLEMENTS,T_ENTITLEMENT_LEDGER,T_COURTS,T_MEMBERSHIP_ORDERS,T_MEMBERSHIP_ACCOUNTS,T_USERS,T_LEADS}});
    }
    if(path==='/page-data/operations'&&method==='GET'){
      return handleOperationsPageData({query,user,res,sendJson,init,listCampusesWithDefaults,getCachedScan,scanFirstRows,getScheduleListRows,isProductionRuntime,getFinancePageScheduleRows,filterLoadAllForUser,mergeDuplicateLeadRows,buildFinancePageSnapshot,getFinancePageSnapshot,getFinancePageSnapshotIfCached,FINANCE_PAGE_COURT_PROJECTION_FIELDS,loadOperationsSnapshot,operationsSnapshotSync,timedEndpointMetric,tables:{T_LEADS,T_LEAD_FOLLOWUPS,T_STUDENTS,T_PURCHASES,T_ENTITLEMENTS,T_ENTITLEMENT_LEDGER,T_COURTS,T_MEMBERSHIP_ORDERS,T_MEMBERSHIP_ACCOUNTS,T_COACHES,T_USERS,T_SCHEDULE,T_FEEDBACKS}});
    }
    if(path==='/page-data/court-account-list-view'&&method==='GET'){
      if(user.role!=='admin')return sendJson(res,{error:'无权限'},403);
      await init();
      const ids=String(query?.get('ids')||'').split(',').map(item=>String(item||'').trim()).filter(Boolean);
      const sample=String(query?.get('sample')||'').trim();
      const forceFresh=query?.get('fresh')==='1'||query?.get('forceFresh')==='1';
      const params={
        sampleIds:ids,
        sample,
        forceFresh,
        includeDetails:ids.length>0,
        page:query?.get('page')||'',
        pageSize:query?.get('pageSize')||'',
        q:query?.get('q')||'',
        owner:query?.get('owner')||'',
        accountType:query?.get('accountType')||'',
        membershipTier:query?.get('membershipTier')||'',
        campus:query?.get('campus')||'',
        startDate:query?.get('startDate')||'',
        endDate:query?.get('endDate')||'',
        sortKey:query?.get('sortKey')||'',
        sortDir:query?.get('sortDir')||''
      };
      let view=null;
      if(!ids.length&&T_COURT_ACCOUNT_LIST_SNAPSHOT){
        try{
          view=await loadCourtAccountListSnapshot(params);
        }catch(err){
          if(err?.code===COURT_ACCOUNT_LIST_INDEX_NOT_READY_CODE){
            return sendJson(res,{error:err.message||'订场会员列表快照未初始化',code:err.code},err.statusCode||503);
          }
          console.warn('[court-account-list-snapshot] failed:',err?.message||err);
          return sendJson(res,{error:err.message||'订场会员列表快照读取失败',code:err.code||'COURT_ACCOUNT_LIST_SNAPSHOT_ERROR'},err.statusCode||500);
        }
      }
      if(!view)view=await loadCourtAccountListView(params);
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
      const forceFresh=query?.get('fresh')==='1'||query?.get('forceFresh')==='1';
      const load=()=>loadScheduleListSnapshot({
        sampleIds:ids,
        sample,
        forceFresh,
        all:query?.get('all')==='1',
        page:query?.get('page')||'',
        pageSize:query?.get('pageSize')||'',
        q:query?.get('q')||'',
        campus:query?.get('campus')||'',
        coach:query?.get('coach')||'',
        courseType:query?.get('courseType')||'',
        status:query?.get('status')||'',
        proposal:query?.get('proposal')||'',
        feedback:query?.get('feedback')||'',
        startDate:query?.get('startDate')||query?.get('dateFrom')||'',
        endDate:query?.get('endDate')||query?.get('dateTo')||''
      });
      let view=null;
      try{
        view=timedEndpointMetric?await timedEndpointMetric('pageData.scheduleListView',load):await load();
      }catch(err){
        if(err?.code===SCHEDULE_LIST_SNAPSHOT_NOT_READY_CODE){
          if(typeof bootstrapScheduleListSnapshot==='function'){
            try{
              await bootstrapScheduleListSnapshot();
              view=timedEndpointMetric?await timedEndpointMetric('pageData.scheduleListView.bootstrapRetry',load):await load();
            }catch(bootstrapErr){
              return sendJson(res,{error:bootstrapErr.message||err.message||'排课列表快照未发布',code:bootstrapErr.code||err.code},bootstrapErr.statusCode||err.statusCode||503);
            }
          }else{
            return sendJson(res,{error:err.message||'排课列表快照未发布',code:err.code},err.statusCode||503);
          }
        }else{
          console.warn('[schedule-list-snapshot] failed:',err?.message||err);
          return sendJson(res,{error:err.message||'排课列表快照读取失败',code:err.code||'SCHEDULE_LIST_SNAPSHOT_ERROR'},err.statusCode||500);
        }
      }
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
