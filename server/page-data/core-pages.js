const { buildCustomerLifecycleRows } = require('../read-models/customer-lifecycle.js');
const { buildTeachingStudentViews, buildStudentTeachingSummaryRows, buildStandardLifecycleMetrics, buildScopedStandardLifecycleMetrics } = require('../read-models/platform-metrics.js');
const { buildMembershipFinanceSummary } = require('../read-models/membership-finance-summary.js');
const { buildCourtAccountListViewFromData } = require('./court-account-read-model.js');
const {
  buildCoachOpsUnifiedView,
  buildPurchaseUnifiedView,
  buildPackageUnifiedView,
  buildEntitlementUnifiedView
} = require('../read-models/unified-page-views.js');

function pageDataScopeFromQuery(query){
  return {
    campus:String(query?.get('campus')||'').trim(),
    campusName:String(query?.get('campusName')||'').trim(),
    startDate:String(query?.get('startDate')||'').trim(),
    endDate:String(query?.get('endDate')||'').trim()
  };
}

function hasPageDataScope(scope={}){
  return !!(scope.campus&&scope.campus!=='all'||scope.campusName&&scope.campusName!=='all'||scope.startDate||scope.endDate);
}

function createCorePageDataRoutes(deps={}){
  const {
    init,sendJson,cappedScan,filterLoadAllForUser,listCampusesWithDefaults,getFastStudentsRead,
    getCachedScan,getCachedRow,getScheduleListRows,getCoachScheduleRowsForUser,buildCoachRefs,
    scanCoachProposals,timedEndpointMetric,decorateWorkbenchStudents,decorateWorkbenchFeedbacks,
    decorateWorkbenchScheduleRows,decorateWorkbenchClasses,buildWorkbenchStats,projectScheduleListRow,
    normalizeMembershipPlanViewRecord,normalizeMembershipOrderViewRecord,DEFAULT_CAMPUSES,
    PRODUCTION_PAGE_READ_LIMITS,COURTS_PAGE_STUDENT_PROJECTION_FIELDS,COURTS_PAGE_COURT_PROJECTION_FIELDS,
    put,del,mkTable,
    tables={}
  }=deps;
  const {
    T_COACHES,T_CAMPUSES,T_STUDENTS,T_CLASSES,T_PLANS,T_PRODUCTS,T_SCHEDULE,T_COURTS,T_LEADS,
    T_ENTITLEMENTS,T_PURCHASES,T_PACKAGES,T_ENTITLEMENT_LEDGER,T_MEMBERSHIP_ACCOUNTS,
    T_MEMBERSHIP_ORDERS,T_MEMBERSHIP_BENEFIT_LEDGER,T_MEMBERSHIP_ACCOUNT_EVENTS,
    T_MEMBERSHIP_PLANS,T_USERS,T_FEEDBACKS,T_STUDENT_TEACHING_SUMMARY
  }=tables;
  async function hydrateScheduleRowsByLedgerIds(scheduleRows=[],ledgerRows=[]){
    if(!T_SCHEDULE)return scheduleRows||[];
    const existingIds=new Set((scheduleRows||[]).map(row=>String(row.id||'')).filter(Boolean));
    const missingIds=[...new Set((ledgerRows||[]).map(row=>String(row.scheduleId||'')).filter(id=>id&&!existingIds.has(id)))];
    if(!missingIds.length)return scheduleRows||[];
    const extraRows=(await Promise.all(missingIds.map(id=>getCachedRow(T_SCHEDULE,id).catch(()=>null))))
      .filter(Boolean)
      .map(row=>projectScheduleListRow(row));
    return [...(scheduleRows||[]),...extraRows.filter(row=>row&&row.id&&!existingIds.has(String(row.id)))];
  }

  return async function handleCorePageDataRoutes({path,method,user,res,query}){
    if(path==='/page-data/coaches'&&method==='GET'){
      if(user.role!=='admin')return sendJson(res,{error:'无权限'},403);
      await init();
      const coaches=await cappedScan(T_COACHES);
      return sendJson(res,{coaches:filterLoadAllForUser({coaches},user).coaches});
    }
    if(path==='/page-data/package-center-list'&&method==='GET'){
      if(user.role!=='admin')return sendJson(res,{error:'无权限'},403);
      await init();
      const [purchases,packages,students,entitlements]=await Promise.all([
        cappedScan(T_PURCHASES),
        cappedScan(T_PACKAGES),
        cappedScan(T_STUDENTS),
        cappedScan(T_ENTITLEMENTS)
      ]);
      const scoped=filterLoadAllForUser({purchases,packages,students,entitlements},user);
      const customerLifecycleRows=buildCustomerLifecycleRows({
        students:scoped.students,
        purchases:scoped.purchases,
        entitlements:scoped.entitlements
      });
      return sendJson(res,{purchases:scoped.purchases,packages:scoped.packages,students:scoped.students,entitlements:scoped.entitlements,customerLifecycleRows,purchaseUnifiedView:buildPurchaseUnifiedView({...scoped,customerLifecycleRows}),packageUnifiedView:buildPackageUnifiedView(scoped),entitlementUnifiedView:buildEntitlementUnifiedView(scoped)});
    }
    if(path==='/page-data/customer-center-list'&&method==='GET'){
      if(user.role!=='admin')return sendJson(res,{error:'无权限'},403);
      await init();
      const fresh=query?.get('fresh')==='1'||query?.get('forceFresh')==='1';
      const [leads,students,purchases,entitlements,studentTeachingSummaries,entitlementLedger,schedule,membershipBenefitLedger,feedbacks]=await Promise.all([
        T_LEADS ? cappedScan(T_LEADS, PRODUCTION_PAGE_READ_LIMITS.leads).catch(()=>[]) : Promise.resolve([]),
        cappedScan(T_STUDENTS),
        cappedScan(T_PURCHASES),
        cappedScan(T_ENTITLEMENTS),
        fresh ? Promise.resolve([]) : (T_STUDENT_TEACHING_SUMMARY ? getCachedScan(T_STUDENT_TEACHING_SUMMARY).catch(()=>[]) : Promise.resolve([])),
        fresh&&T_ENTITLEMENT_LEDGER ? cappedScan(T_ENTITLEMENT_LEDGER, PRODUCTION_PAGE_READ_LIMITS.entitlementLedger).catch(()=>[]) : Promise.resolve([]),
        fresh&&T_SCHEDULE ? cappedScan(T_SCHEDULE, PRODUCTION_PAGE_READ_LIMITS.schedule) : Promise.resolve([]),
        fresh&&T_MEMBERSHIP_BENEFIT_LEDGER ? cappedScan(T_MEMBERSHIP_BENEFIT_LEDGER).catch(()=>[]) : Promise.resolve([]),
        fresh&&T_FEEDBACKS ? cappedScan(T_FEEDBACKS).catch(()=>[]) : Promise.resolve([])
      ]);
      const scoped=filterLoadAllForUser({leads,students,purchases,entitlements,studentTeachingSummaries,entitlementLedger,schedule,membershipBenefitLedger,feedbacks},user);
      const customerLifecycleRows=buildCustomerLifecycleRows({
        leads:scoped.leads,
        students:scoped.students,
        purchases:scoped.purchases,
        entitlements:scoped.entitlements,
        schedule:scoped.schedule,
        feedbacks:scoped.feedbacks
      });
      const teachingData={...scoped,teachingStudentSummaryRows:scoped.studentTeachingSummaries};
      const metricScope=pageDataScopeFromQuery(query);
      return sendJson(res,{
        customerLifecycleRows,
        teachingStudentViews:buildTeachingStudentViews(customerLifecycleRows,teachingData),
        standardLifecycleMetrics:hasPageDataScope(metricScope)
          ? buildScopedStandardLifecycleMetrics({...teachingData,customerLifecycleRows},metricScope)
          : buildStandardLifecycleMetrics({...teachingData,customerLifecycleRows})
      });
    }
    if(path==='/page-data/purchases'&&method==='GET'){
      if(user.role!=='admin')return sendJson(res,{error:'无权限'},403);
      await init();
      const [purchases,packages,students,entitlements,entitlementLedger,leads,schedule,membershipBenefitLedger,feedbacks]=await Promise.all([
        cappedScan(T_PURCHASES),
        cappedScan(T_PACKAGES),
        cappedScan(T_STUDENTS),
        cappedScan(T_ENTITLEMENTS),
        cappedScan(T_ENTITLEMENT_LEDGER, PRODUCTION_PAGE_READ_LIMITS.entitlementLedger),
        T_LEADS ? cappedScan(T_LEADS, PRODUCTION_PAGE_READ_LIMITS.leads).catch(()=>[]) : Promise.resolve([]),
        T_SCHEDULE ? cappedScan(T_SCHEDULE, PRODUCTION_PAGE_READ_LIMITS.schedule) : Promise.resolve([]),
        T_MEMBERSHIP_BENEFIT_LEDGER ? cappedScan(T_MEMBERSHIP_BENEFIT_LEDGER).catch(()=>[]) : Promise.resolve([]),
        T_FEEDBACKS ? cappedScan(T_FEEDBACKS).catch(()=>[]) : Promise.resolve([])
      ]);
      const scoped=filterLoadAllForUser({purchases,packages,students,entitlements,entitlementLedger,leads,schedule,membershipBenefitLedger,feedbacks},user);
      scoped.schedule=await hydrateScheduleRowsByLedgerIds(scoped.schedule,scoped.entitlementLedger);
      const customerLifecycleRows=buildCustomerLifecycleRows({
        leads:scoped.leads,
        students:scoped.students,
        purchases:scoped.purchases,
        entitlements:scoped.entitlements,
        schedule:scoped.schedule,
        feedbacks:scoped.feedbacks
      });
      return sendJson(res,{purchases:scoped.purchases,packages:scoped.packages,students:scoped.students,entitlements:scoped.entitlements,entitlementLedger:scoped.entitlementLedger,membershipBenefitLedger:scoped.membershipBenefitLedger,customerLifecycleRows,teachingStudentViews:buildTeachingStudentViews(customerLifecycleRows,scoped),standardLifecycleMetrics:buildStandardLifecycleMetrics({...scoped,customerLifecycleRows}),purchaseUnifiedView:buildPurchaseUnifiedView({...scoped,customerLifecycleRows}),packageUnifiedView:buildPackageUnifiedView(scoped),entitlementUnifiedView:buildEntitlementUnifiedView(scoped)});
    }
    if(path==='/page-data/lifecycle-metrics'&&method==='GET'){
      if(user.role!=='admin')return sendJson(res,{error:'无权限'},403);
      await init();
      const [leads,students,purchases,entitlements,entitlementLedger,schedule,membershipBenefitLedger,feedbacks]=await Promise.all([
        T_LEADS ? cappedScan(T_LEADS, PRODUCTION_PAGE_READ_LIMITS.leads).catch(()=>[]) : Promise.resolve([]),
        cappedScan(T_STUDENTS),
        cappedScan(T_PURCHASES),
        cappedScan(T_ENTITLEMENTS),
        cappedScan(T_ENTITLEMENT_LEDGER, PRODUCTION_PAGE_READ_LIMITS.entitlementLedger),
        T_SCHEDULE ? cappedScan(T_SCHEDULE, PRODUCTION_PAGE_READ_LIMITS.schedule) : Promise.resolve([]),
        T_MEMBERSHIP_BENEFIT_LEDGER ? cappedScan(T_MEMBERSHIP_BENEFIT_LEDGER).catch(()=>[]) : Promise.resolve([]),
        T_FEEDBACKS ? cappedScan(T_FEEDBACKS).catch(()=>[]) : Promise.resolve([])
      ]);
      const scoped=filterLoadAllForUser({leads,students,purchases,entitlements,entitlementLedger,schedule,membershipBenefitLedger,feedbacks},user);
      const customerLifecycleRows=buildCustomerLifecycleRows({
        leads:scoped.leads,
        students:scoped.students,
        purchases:scoped.purchases,
        entitlements:scoped.entitlements,
        schedule:scoped.schedule,
        feedbacks:scoped.feedbacks
      });
      const metricScope=pageDataScopeFromQuery(query);
      return sendJson(res,{
        customerLifecycleRows,
        teachingStudentViews:buildTeachingStudentViews(customerLifecycleRows,scoped),
        standardLifecycleMetrics:hasPageDataScope(metricScope)
          ? buildScopedStandardLifecycleMetrics({...scoped,customerLifecycleRows},metricScope)
          : buildStandardLifecycleMetrics({...scoped,customerLifecycleRows})
      });
    }
    if(path==='/page-data/customer-center-list/rebuild-summary'&&method==='POST'){
      if(user.role!=='admin')return sendJson(res,{error:'无权限'},403);
      if(!T_STUDENT_TEACHING_SUMMARY||!put||!mkTable)return sendJson(res,{error:'摘要表未配置'},500);
      await init();
      const [leads,students,purchases,entitlements,entitlementLedger,schedule,membershipBenefitLedger,feedbacks]=await Promise.all([
        T_LEADS ? cappedScan(T_LEADS, PRODUCTION_PAGE_READ_LIMITS.leads).catch(()=>[]) : Promise.resolve([]),
        cappedScan(T_STUDENTS),
        cappedScan(T_PURCHASES),
        cappedScan(T_ENTITLEMENTS),
        cappedScan(T_ENTITLEMENT_LEDGER, PRODUCTION_PAGE_READ_LIMITS.entitlementLedger),
        T_SCHEDULE ? cappedScan(T_SCHEDULE, PRODUCTION_PAGE_READ_LIMITS.schedule) : Promise.resolve([]),
        T_MEMBERSHIP_BENEFIT_LEDGER ? cappedScan(T_MEMBERSHIP_BENEFIT_LEDGER).catch(()=>[]) : Promise.resolve([]),
        T_FEEDBACKS ? cappedScan(T_FEEDBACKS).catch(()=>[]) : Promise.resolve([])
      ]);
      const scoped=filterLoadAllForUser({leads,students,purchases,entitlements,entitlementLedger,schedule,membershipBenefitLedger,feedbacks},user);
      const customerLifecycleRows=buildCustomerLifecycleRows({
        leads:scoped.leads,
        students:scoped.students,
        purchases:scoped.purchases,
        entitlements:scoped.entitlements,
        schedule:scoped.schedule,
        feedbacks:scoped.feedbacks
      });
      const rows=buildStudentTeachingSummaryRows(customerLifecycleRows,scoped);
      await mkTable(T_STUDENT_TEACHING_SUMMARY);
      const existing=T_STUDENT_TEACHING_SUMMARY?await getCachedScan(T_STUDENT_TEACHING_SUMMARY,{fresh:true}).catch(()=>[]):[];
      const nextIds=new Set(rows.map(row=>String(row.id||'')).filter(Boolean));
      for(const row of rows)await put(T_STUDENT_TEACHING_SUMMARY,row.id,row);
      if(del){
        for(const row of existing.filter(row=>row?.id&&!nextIds.has(String(row.id))))await del(T_STUDENT_TEACHING_SUMMARY,row.id).catch(()=>null);
      }
      return sendJson(res,{success:true,count:rows.length,updatedAt:new Date().toISOString()});
    }
    if(path==='/page-data/courts'&&method==='GET'){
      if(user.role!=='admin')return sendJson(res,{error:'无权限'},403);
      await init();
      const [campuses,students,courts]=await Promise.all([
        listCampusesWithDefaults(),
        getFastStudentsRead({columns:COURTS_PAGE_STUDENT_PROJECTION_FIELDS}),
        getCachedScan(T_COURTS,{columns:COURTS_PAGE_COURT_PROJECTION_FIELDS}).catch(()=>[])
      ]);
      const scoped=filterLoadAllForUser({campuses,students,courts},user);
      const customerLifecycleRows=buildCustomerLifecycleRows({
        students:scoped.students,
        courts:scoped.courts
      });
      return sendJson(res,{campuses:scoped.campuses,students:scoped.students,courts:scoped.courts,membershipAccounts:[],coaches:[],pricePlans:[],customerLifecycleRows});
    }
    if(path==='/page-data/memberships'&&method==='GET'){
      if(user.role!=='admin')return sendJson(res,{error:'无权限'},403);
      await init();
      const [campuses,students,courts,membershipAccounts,membershipOrders,membershipBenefitLedger,membershipAccountEvents,membershipPlans,coaches]=await Promise.all([
        listCampusesWithDefaults(),
        cappedScan(T_STUDENTS),
        getCachedScan(T_COURTS),
        cappedScan(T_MEMBERSHIP_ACCOUNTS),
        cappedScan(T_MEMBERSHIP_ORDERS),
        cappedScan(T_MEMBERSHIP_BENEFIT_LEDGER),
        cappedScan(T_MEMBERSHIP_ACCOUNT_EVENTS),
        cappedScan(T_MEMBERSHIP_PLANS),
        cappedScan(T_COACHES)
      ]);
      const normalizedMembershipPlans=(Array.isArray(membershipPlans)?membershipPlans:[]).map(normalizeMembershipPlanViewRecord);
      const membershipPlanMap=new Map(normalizedMembershipPlans.map(p=>[p.id,p]));
      const normalizedMembershipOrders=(Array.isArray(membershipOrders)?membershipOrders:[]).map(order=>normalizeMembershipOrderViewRecord(order,membershipPlanMap.get(order.membershipPlanId)));
      const scoped=filterLoadAllForUser({
        campuses,
        students,
        courts,
        membershipAccounts:Array.isArray(membershipAccounts)?membershipAccounts:[],
        membershipOrders:normalizedMembershipOrders,
        membershipBenefitLedger:Array.isArray(membershipBenefitLedger)?membershipBenefitLedger:[],
        membershipAccountEvents:Array.isArray(membershipAccountEvents)?membershipAccountEvents:[],
        membershipPlans:normalizedMembershipPlans,
        coaches
      },user);
      const customerLifecycleRows=buildCustomerLifecycleRows({
        students:scoped.students,
        courts:scoped.courts,
        membershipAccounts:scoped.membershipAccounts,
        membershipOrders:scoped.membershipOrders
      });
      const membershipCourtAccountView=buildCourtAccountListViewFromData({
        campuses:scoped.campuses,
        students:scoped.students,
        courts:scoped.courts,
        membershipAccounts:scoped.membershipAccounts,
        membershipOrders:scoped.membershipOrders,
        membershipPlans:scoped.membershipPlans,
        membershipBenefitLedger:scoped.membershipBenefitLedger,
        membershipAccountEvents:scoped.membershipAccountEvents
      });
      const membershipFinanceSummary=buildMembershipFinanceSummary({
        courts:scoped.courts,
        membershipAccounts:scoped.membershipAccounts,
        membershipOrders:scoped.membershipOrders,
        courtAccountItems:membershipCourtAccountView.items
      });
      return sendJson(res,{
        campuses:scoped.campuses,
        students:scoped.students,
        courts:scoped.courts,
        membershipAccounts:scoped.membershipAccounts,
        membershipOrders:scoped.membershipOrders,
        membershipBenefitLedger:scoped.membershipBenefitLedger,
        membershipAccountEvents:scoped.membershipAccountEvents,
        membershipPlans:scoped.membershipPlans,
        coaches:scoped.coaches,
        customerLifecycleRows,
        membershipFinanceSummary
      });
    }
    if(path==='/page-data/workbench'&&method==='GET'){
      return timedEndpointMetric('pageData.workbench',async()=>{
        await init();
        const [coaches,users]=await Promise.all([cappedScan(T_COACHES),cappedScan(T_USERS, PRODUCTION_PAGE_READ_LIMITS.adminUsers)]);
        const coachRefs=buildCoachRefs({coaches,users});
        const scheduleRowsPromise=user.role==='admin'?getScheduleListRows():getCoachScheduleRowsForUser(user,coachRefs);
        const [campuses,students,classes,schedule,feedbacks,coachProposals,purchases,entitlements,entitlementLedger]=await Promise.all([
          listCampusesWithDefaults(),
          cappedScan(T_STUDENTS),
          cappedScan(T_CLASSES),
          scheduleRowsPromise,
          cappedScan(T_FEEDBACKS),
          scanCoachProposals(),
          cappedScan(T_PURCHASES),
          cappedScan(T_ENTITLEMENTS),
          cappedScan(T_ENTITLEMENT_LEDGER, PRODUCTION_PAGE_READ_LIMITS.entitlementLedger)
        ]);
        const scoped=filterLoadAllForUser({campuses,students,classes,schedule,feedbacks,coachProposals,purchases,entitlements,entitlementLedger,coaches},user,coachRefs);
        const now=new Date();
        const decoratedStudents=decorateWorkbenchStudents(scoped.students||[],scoped.schedule||[],now);
        const decoratedFeedbacks=decorateWorkbenchFeedbacks(scoped.feedbacks||[]);
        const decoratedSchedule=decorateWorkbenchScheduleRows(scoped.schedule||[],decoratedFeedbacks,scoped.purchases||[],now);
        const scheduleIds=new Set((scoped.schedule||[]).map(row=>String(row.id||'')).filter(Boolean));
        const studentScheduleIds=[...new Set((scoped.entitlementLedger||[]).map(row=>String(row.scheduleId||'')).filter(id=>id&&!scheduleIds.has(id)))];
        const extraStudentSchedule=studentScheduleIds.length
          ? (await Promise.all(studentScheduleIds.map(id=>getCachedRow(T_SCHEDULE,id).catch(()=>null)))).filter(Boolean).map(row=>projectScheduleListRow(row))
          : [];
        const decoratedStudentSchedule=extraStudentSchedule.length
          ? decorateWorkbenchScheduleRows([...(scoped.schedule||[]),...extraStudentSchedule],decoratedFeedbacks,scoped.purchases||[],now)
          : decoratedSchedule;
        const decoratedClasses=decorateWorkbenchClasses(scoped.classes||[],scoped.schedule||[]);
        const customerLifecycleRows=buildCustomerLifecycleRows({
          students:scoped.students,
          purchases:scoped.purchases,
          entitlements:scoped.entitlements,
          schedule:scoped.schedule
        });
        const standardLifecycleMetrics=buildStandardLifecycleMetrics({...scoped,customerLifecycleRows});
        const teachingStudentViews=buildTeachingStudentViews(customerLifecycleRows,scoped);
        const stats=buildWorkbenchStats({schedule:decoratedSchedule,feedbacks:decoratedFeedbacks,standardLifecycleMetrics,now});
        return sendJson(res,{
          campuses:scoped.campuses||[],
          coaches:scoped.coaches||[],
          students:decoratedStudents,
          classes:decoratedClasses,
          schedule:decoratedSchedule,
          studentSchedule:decoratedStudentSchedule,
          feedbacks:decoratedFeedbacks,
          coachProposals:scoped.coachProposals||[],
          entitlements:scoped.entitlements||[],
          entitlementLedger:scoped.entitlementLedger||[],
          customerLifecycleRows,
          teachingStudentViews,
          standardLifecycleMetrics,
          coachOpsUnifiedView:buildCoachOpsUnifiedView({
            coaches:scoped.coaches||[],
            schedule:decoratedSchedule,
            feedbacks:decoratedFeedbacks,
            campuses:scoped.campuses||[]
          }),
          stats
        });
      },{role:user.role||''});
    }
    return false;
  };
}

module.exports={createCorePageDataRoutes};
