const { buildCustomerLifecycleRows } = require('../read-models/customer-lifecycle.js');

function createCorePageDataRoutes(deps={}){
  const {
    init,sendJson,cappedScan,filterLoadAllForUser,listCampusesWithDefaults,getFastStudentsRead,
    getCachedScan,getCachedRow,getScheduleListRows,getCoachScheduleRowsForUser,buildCoachRefs,
    scanCoachProposals,timedEndpointMetric,decorateWorkbenchStudents,decorateWorkbenchFeedbacks,
    decorateWorkbenchScheduleRows,decorateWorkbenchClasses,buildWorkbenchStats,projectScheduleListRow,
    normalizeMembershipPlanViewRecord,normalizeMembershipOrderViewRecord,DEFAULT_CAMPUSES,
    PRODUCTION_PAGE_READ_LIMITS,COURTS_PAGE_STUDENT_PROJECTION_FIELDS,COURTS_PAGE_COURT_PROJECTION_FIELDS,
    tables={}
  }=deps;
  const {
    T_COACHES,T_CAMPUSES,T_STUDENTS,T_CLASSES,T_PLANS,T_PRODUCTS,T_SCHEDULE,T_COURTS,
    T_ENTITLEMENTS,T_PURCHASES,T_PACKAGES,T_ENTITLEMENT_LEDGER,T_MEMBERSHIP_ACCOUNTS,
    T_MEMBERSHIP_ORDERS,T_MEMBERSHIP_BENEFIT_LEDGER,T_MEMBERSHIP_ACCOUNT_EVENTS,
    T_MEMBERSHIP_PLANS,T_USERS,T_FEEDBACKS
  }=tables;

  return async function handleCorePageDataRoutes({path,method,user,res}){
    if(path==='/page-data/coaches'&&method==='GET'){
      if(user.role!=='admin')return sendJson(res,{error:'无权限'},403);
      await init();
      const coaches=await cappedScan(T_COACHES);
      return sendJson(res,{coaches:filterLoadAllForUser({coaches},user).coaches});
    }
    if(path==='/page-data/purchases'&&method==='GET'){
      if(user.role!=='admin')return sendJson(res,{error:'无权限'},403);
      await init();
      const [purchases,packages,students,entitlements,entitlementLedger]=await Promise.all([
        cappedScan(T_PURCHASES),
        cappedScan(T_PACKAGES),
        cappedScan(T_STUDENTS),
        cappedScan(T_ENTITLEMENTS),
        cappedScan(T_ENTITLEMENT_LEDGER, PRODUCTION_PAGE_READ_LIMITS.entitlementLedger)
      ]);
      const scoped=filterLoadAllForUser({purchases,packages,students,entitlements,entitlementLedger},user);
      const customerLifecycleRows=buildCustomerLifecycleRows({
        students:scoped.students,
        purchases:scoped.purchases,
        entitlements:scoped.entitlements
      });
      return sendJson(res,{purchases:scoped.purchases,packages:scoped.packages,students:scoped.students,entitlements:scoped.entitlements,entitlementLedger:scoped.entitlementLedger,customerLifecycleRows});
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
        cappedScan(T_COURTS),
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
        customerLifecycleRows
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
        const stats=buildWorkbenchStats({schedule:decoratedSchedule,feedbacks:decoratedFeedbacks,purchases:scoped.purchases||[],now});
        return sendJson(res,{
          campuses:scoped.campuses||[],
          students:decoratedStudents,
          classes:decoratedClasses,
          schedule:decoratedSchedule,
          studentSchedule:decoratedStudentSchedule,
          feedbacks:decoratedFeedbacks,
          coachProposals:scoped.coachProposals||[],
          entitlements:scoped.entitlements||[],
          entitlementLedger:scoped.entitlementLedger||[],
          stats
        });
      },{role:user.role||''});
    }
    return false;
  };
}

module.exports={createCorePageDataRoutes};
