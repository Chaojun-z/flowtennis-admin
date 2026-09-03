const { buildCustomerLifecycleRows } = require('../read-models/customer-lifecycle.js');
const { buildTeachingStudentViews, buildCoachMiniStudentRoster, buildStudentTeachingSummaryRows, buildStandardLifecycleMetrics, buildScopedStandardLifecycleMetrics, TEACHING_LESSON_DETAIL_SOURCE_VERSION, teachingSummaryNeedsLessonFacts } = require('../read-models/platform-metrics.js');
const { buildMembershipFinanceSummary } = require('../read-models/membership-finance-summary.js');
const { buildCourtAccountListViewFromData } = require('./court-account-read-model.js');
const { createStudentRosterIndexReader, buildCustomerCenterPagePayload } = require('./student-roster-index-reader.js');
const {
  STUDENT_TEACHING_SUMMARY_READY,
  STUDENT_TEACHING_SUMMARY_FAILED,
  STUDENT_TEACHING_SUMMARY_META_ID,
  STUDENT_TEACHING_SUMMARY_VERSION_PREFIX,
  buildStudentTeachingSummaryMetaRow,
  buildStudentTeachingSummaryChecksum,
  filterStudentTeachingSummaryPublishedRows,
  buildVersionedStudentTeachingSummaryRow,
  buildStudentTeachingSummaryBundleRow,
  studentTeachingSummaryRowsToDeleteAfterPublish,
  rollbackStudentTeachingSummaryPublish,
  readReadyStudentTeachingSummaryRows
} = require('../read-models/student-teaching-summary-cache.js');
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

function parseSnapshotArray(value){
  if(Array.isArray(value))return value;
  if(typeof value==='string'&&value.trim()){
    try{
      const parsed=JSON.parse(value);
      return Array.isArray(parsed)?parsed:[];
    }catch(e){
      return [];
    }
  }
  return [];
}

function rowHasStudent(row={},studentId=''){
  const sid=String(studentId||'').trim();
  if(!sid)return false;
  if(String(row.studentId||'').trim()===sid)return true;
  return parseSnapshotArray(row.studentIds).some(id=>String(id||'').trim()===sid);
}

function textSearchHit(q,...values){
  const keyword=String(q||'').trim().toLowerCase();
  if(!keyword)return true;
  return values.some(value=>String(value||'').toLowerCase().includes(keyword));
}

function parseListPaging(query){
  const enabled=query?.get('paged')==='1'||query?.get('page')||query?.get('pageSize');
  if(!enabled)return null;
  const page=Math.max(1,parseInt(query?.get('page')||'1',10)||1);
  const pageSize=Math.max(1,Math.min(parseInt(query?.get('pageSize')||'15',10)||15,100));
  return {page,pageSize};
}

function buildListPage(rows=[],paging=null){
  const list=Array.isArray(rows)?rows:[];
  if(!paging)return null;
  const total=list.length;
  const pages=Math.max(1,Math.ceil(total/paging.pageSize));
  const page=Math.min(paging.page,pages);
  const start=(page-1)*paging.pageSize;
  return {rows:list.slice(start,start+paging.pageSize),total,page,pageSize:paging.pageSize,pages};
}

const PURCHASE_CREATE_STUDENT_PROJECTION_FIELDS=[
  'name',
  'phone',
  'campus',
  'primaryCoach',
  'type',
  'status'
];
const COACH_SCHEDULE_STUDENT_PROJECTION_FIELDS=[
  'name',
  'phone',
  'campus',
  'primaryCoach',
  'type',
  'status',
  'notes',
  'profileNote'
];

function createCorePageDataRoutes(deps={}){
  const {
    init,sendJson,cappedScan,filterLoadAllForUser,listCampusesWithDefaults,getFastStudentsRead,
    getCachedScan,getCachedRow,scanByIdPrefix,getScheduleListRows,getCoachScheduleRowsForUser,buildCoachRefs,
    scanCoachProposals,timedEndpointMetric,decorateWorkbenchStudents,decorateWorkbenchFeedbacks,
    decorateWorkbenchScheduleRows,decorateWorkbenchClasses,buildWorkbenchStats,projectScheduleListRow,
    normalizeMembershipPlanViewRecord,normalizeMembershipOrderViewRecord,DEFAULT_CAMPUSES,
    PRODUCTION_PAGE_READ_LIMITS,COURTS_PAGE_STUDENT_PROJECTION_FIELDS,COURTS_PAGE_COURT_PROJECTION_FIELDS,
    put,del,mkTable,getCustomerCenterFactCacheVersion=()=>0,
    tables={}
  }=deps;
  const {
    T_COACHES,T_CAMPUSES,T_STUDENTS,T_CLASSES,T_PLANS,T_PRODUCTS,T_SCHEDULE,T_COURTS,T_LEADS,
    T_ENTITLEMENTS,T_PURCHASES,T_PACKAGES,T_ENTITLEMENT_LEDGER,T_MEMBERSHIP_ACCOUNTS,
    T_MEMBERSHIP_ORDERS,T_MEMBERSHIP_BENEFIT_LEDGER,T_MEMBERSHIP_ACCOUNT_EVENTS,
    T_MEMBERSHIP_PLANS,T_USERS,T_FEEDBACKS,T_STUDENT_TEACHING_SUMMARY
  }=tables;
  const studentRosterIndexReader=deps.studentRosterIndexReader||createStudentRosterIndexReader({
    tableName:T_STUDENT_TEACHING_SUMMARY,
    getCachedScan,
    getCachedRow,
    scanByIdPrefix,
    filterLoadAllForUser
  });
  async function sendCustomerCenterTeachingSummary(res,user,query){
    try{
      return sendJson(res,await studentRosterIndexReader.readCustomerCenterList({user,query}));
    }catch(err){
      if(err?.code==='STUDENT_TEACHING_SUMMARY_NOT_READY'){
        console.warn('[customer-center-list] student teaching summary unavailable, serving empty payload',err?.message||err);
        return sendJson(res,{
          ...buildCustomerCenterPagePayload({summaryRows:[],query}),
          studentTeachingSummaryUnavailable:true,
          code:err.code,
          error:err.message
        });
      }
      throw err;
    }
  }
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
  const customerCenterFactModelCache=new Map();
  const customerCenterFactModelLoads=new Map();
  const CUSTOMER_CENTER_FACT_MODEL_TTL_MS=60000;
  function customerCenterFactModelUserKey(user={}){
    return JSON.stringify({
      role:String(user.role||''),
      id:String(user.id||user.username||user.name||''),
      dataScope:String(user.dataScope||''),
      campus:String(user.campus||''),
      campusIds:Array.isArray(user.campusIds)?user.campusIds.map(String).sort():[]
    });
  }
  function readCustomerCenterFactModelCache(user={}){
    const key=customerCenterFactModelUserKey(user);
    const cached=customerCenterFactModelCache.get(key);
    if(!cached||cached.expiresAt<=Date.now()||cached.version!==getCustomerCenterFactCacheVersion()){
      if(cached)customerCenterFactModelCache.delete(key);
      return null;
    }
    return cached.model;
  }
  async function loadCustomerCenterFactModel(user={}, {force=false,includeLessonFacts=false}={}){
    const key=customerCenterFactModelUserKey(user);
    if(!force){
      const cached=readCustomerCenterFactModelCache(user);
      if(cached)return cached;
    }
    if(customerCenterFactModelLoads.has(key))return customerCenterFactModelLoads.get(key);
    const version=getCustomerCenterFactCacheVersion();
    const promise=(async()=>{
      const [leads,students,purchases,entitlements,studentTeachingSummaries]=await Promise.all([
        T_LEADS ? cappedScan(T_LEADS, PRODUCTION_PAGE_READ_LIMITS.leads).catch(()=>[]) : Promise.resolve([]),
        cappedScan(T_STUDENTS),
        cappedScan(T_PURCHASES),
        cappedScan(T_ENTITLEMENTS),
        T_STUDENT_TEACHING_SUMMARY ? getCachedScan(T_STUDENT_TEACHING_SUMMARY,{fresh:true}).catch(()=>[]) : Promise.resolve([])
      ]);
      const needsTeachingFacts = includeLessonFacts || !studentTeachingSummaries.length;
      const [entitlementLedger,schedule,membershipBenefitLedger,feedbacks]=await Promise.all([
        needsTeachingFacts&&T_ENTITLEMENT_LEDGER ? cappedScan(T_ENTITLEMENT_LEDGER, PRODUCTION_PAGE_READ_LIMITS.entitlementLedger).catch(()=>[]) : Promise.resolve([]),
        needsTeachingFacts&&T_SCHEDULE ? cappedScan(T_SCHEDULE, PRODUCTION_PAGE_READ_LIMITS.schedule) : Promise.resolve([]),
        needsTeachingFacts&&T_MEMBERSHIP_BENEFIT_LEDGER ? cappedScan(T_MEMBERSHIP_BENEFIT_LEDGER).catch(()=>[]) : Promise.resolve([]),
        needsTeachingFacts&&T_FEEDBACKS ? cappedScan(T_FEEDBACKS).catch(()=>[]) : Promise.resolve([])
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
      const teachingStudentViews=buildTeachingStudentViews(customerLifecycleRows,teachingData);
      const standardLifecycleMetrics=buildStandardLifecycleMetrics({...teachingData,customerLifecycleRows});
      const model={scoped,customerLifecycleRows,teachingStudentViews,standardLifecycleMetrics};
      customerCenterFactModelCache.set(key,{version,model,expiresAt:Date.now()+CUSTOMER_CENTER_FACT_MODEL_TTL_MS});
      return model;
    })().finally(()=>customerCenterFactModelLoads.delete(key));
    customerCenterFactModelLoads.set(key,promise);
    return promise;
  }

  return async function handleCorePageDataRoutes({path,method,user,res,query}){
    if(path==='/page-data/coaches'&&method==='GET'){
      if(user.role!=='admin')return sendJson(res,{error:'无权限'},403);
      await init();
      const coaches=await cappedScan(T_COACHES);
      return sendJson(res,{coaches:filterLoadAllForUser({coaches},user).coaches});
    }
    if(path==='/page-data/purchase-create'&&method==='GET'){
      if(user.role!=='admin')return sendJson(res,{error:'无权限'},403);
      await init();
      const [packages,students,coaches]=await Promise.all([
        getCachedScan(T_PACKAGES).catch(()=>[]),
        getFastStudentsRead({columns:PURCHASE_CREATE_STUDENT_PROJECTION_FIELDS}).catch(()=>[]),
        cappedScan(T_COACHES).catch(()=>[])
      ]);
      const scoped=filterLoadAllForUser({packages,students,coaches},user);
      return sendJson(res,{packages:scoped.packages,students:scoped.students,coaches:scoped.coaches});
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
      const purchaseUnifiedView=buildPurchaseUnifiedView({...scoped,customerLifecycleRows});
      const packageUnifiedView=buildPackageUnifiedView(scoped);
      const entitlementUnifiedView=buildEntitlementUnifiedView(scoped);
      const paging=parseListPaging(query);
      const view=String(query?.get('view')||'').trim();
      let listPage=null;
      if(paging){
        const q=String(query?.get('q')||'').trim();
        if(view==='purchases'){
          const rows=(purchaseUnifiedView.rows||[]).filter(row=>textSearchHit(q,row.studentName,row.packageName,row.productName,row.courseType,row.userType,row.classSizeLabel,row.paidStatus,row.inPeriodStatus,row.ownerCoach,row.payMethod,row.purchaseDate,row.amountPaid));
          listPage={view, ...buildListPage(rows,paging)};
        }else if(view==='packages'){
          const rows=(packageUnifiedView.rows||[]).filter(row=>textSearchHit(q,row.name,row.packageName,row.productName,row.courseType,row.ownerCoach,row.price,row.lessons));
          listPage={view, ...buildListPage(rows,paging)};
        }else if(view==='entitlements'){
          const rows=(entitlementUnifiedView.rows||[]).filter(row=>textSearchHit(q,row.studentName,row.packageName,row.productName,row.courseType,row.ownerCoach,row.status,row.remainingLessons,row.totalLessons));
          listPage={view, ...buildListPage(rows,paging)};
        }
      }
      return sendJson(res,{purchases:scoped.purchases,packages:scoped.packages,students:scoped.students,entitlements:scoped.entitlements,customerLifecycleRows,purchaseUnifiedView,packageUnifiedView,entitlementUnifiedView,listPage});
    }
    if(path==='/page-data/customer-center-list'&&method==='GET'){
      if(user.role!=='admin')return sendJson(res,{error:'无权限'},403);
      await init();
      return sendCustomerCenterTeachingSummary(res,user,query);
    }
    if(path==='/page-data/purchase-detail'&&method==='GET'){
      if(user.role!=='admin')return sendJson(res,{error:'无权限'},403);
      await init();
      const purchaseId=String(query?.get('id')||query?.get('purchaseId')||'').trim();
      if(!purchaseId)return sendJson(res,{error:'缺少购买记录 ID'},400);
      const purchase=await getCachedRow(T_PURCHASES,purchaseId).catch(()=>null);
      if(!purchase)return sendJson(res,{error:'购买记录不存在'},404);
      const [packages,entitlements,entitlementLedger,membershipBenefitLedger,students]=await Promise.all([
        cappedScan(T_PACKAGES).catch(()=>[]),
        cappedScan(T_ENTITLEMENTS).catch(()=>[]),
        cappedScan(T_ENTITLEMENT_LEDGER, PRODUCTION_PAGE_READ_LIMITS.entitlementLedger).catch(()=>[]),
        T_MEMBERSHIP_BENEFIT_LEDGER ? cappedScan(T_MEMBERSHIP_BENEFIT_LEDGER).catch(()=>[]) : Promise.resolve([]),
        cappedScan(T_STUDENTS).catch(()=>[])
      ]);
      const scoped=filterLoadAllForUser({
        purchases:[purchase],
        packages,
        entitlements:entitlements.filter(row=>String(row.purchaseId||'')===purchaseId),
        entitlementLedger,
        membershipBenefitLedger,
        students
      },user);
      const entitlementIds=new Set((scoped.entitlements||[]).map(row=>String(row.id||'')).filter(Boolean));
      const purchaseStudentIds=new Set([String(purchase.studentId||'').trim(),...(scoped.entitlements||[]).map(row=>String(row.studentId||'').trim())].filter(Boolean));
      return sendJson(res,{
        purchases:scoped.purchases,
        packages:scoped.packages,
        students:(scoped.students||[]).filter(row=>purchaseStudentIds.has(String(row.id||''))),
        entitlements:scoped.entitlements,
        entitlementLedger:(scoped.entitlementLedger||[]).filter(row=>entitlementIds.has(String(row.entitlementId||''))||String(row.purchaseId||'')===purchaseId),
        membershipBenefitLedger:(scoped.membershipBenefitLedger||[]).filter(row=>String(row.sourcePurchaseId||row.purchaseId||'')===purchaseId)
      });
    }
    if(path==='/page-data/student-detail'&&method==='GET'){
      if(user.role!=='admin')return sendJson(res,{error:'无权限'},403);
      await init();
      const studentId=String(query?.get('id')||query?.get('studentId')||'').trim();
      if(!studentId)return sendJson(res,{error:'缺少学员 ID'},400);
      const student=await getCachedRow(T_STUDENTS,studentId).catch(()=>null);
      if(!student)return sendJson(res,{error:'学员不存在'},404);
      const fresh=String(query?.get('fresh')||'').trim()==='1';
      const studentTeachingSummary=T_STUDENT_TEACHING_SUMMARY ? await getCachedRow(T_STUDENT_TEACHING_SUMMARY,studentId).catch(()=>null) : null;
      const canUseStudentTeachingSummary=!fresh
        && studentTeachingSummary
        && String(studentTeachingSummary.teachingLessonDetailSourceVersion||'').trim()===TEACHING_LESSON_DETAIL_SOURCE_VERSION
        && !teachingSummaryNeedsLessonFacts(studentTeachingSummary,new Date());
      if(canUseStudentTeachingSummary){
        const customerLifecycleRows=buildCustomerLifecycleRows({students:[student]});
        const detailStudentView={
          ...student,
          ...studentTeachingSummary,
          id:studentId,
          studentId,
          name:student.name||studentTeachingSummary.name||studentTeachingSummary.displayName||'',
          displayName:student.name||studentTeachingSummary.displayName||studentTeachingSummary.name||'',
          phone:student.phone||studentTeachingSummary.phone||'',
          type:student.type||studentTeachingSummary.type||'',
          source:student.source||studentTeachingSummary.source||'',
          campus:student.campus||studentTeachingSummary.campus||'',
          primaryCoach:student.primaryCoach||studentTeachingSummary.primaryCoach||'',
          notes:Object.prototype.hasOwnProperty.call(student,'notes')?String(student.notes||''):String(studentTeachingSummary.notes||''),
          profileNote:student.profileNote||studentTeachingSummary.profileNote||''
        };
        return sendJson(res,{
          students:[student],
          purchases:[],
          packages:[],
          entitlements:[],
          entitlementLedger:[],
          schedule:[],
          membershipBenefitLedger:[],
          feedbacks:[],
          customerLifecycleRows,
          teachingStudentViews:{historicalStudents:[detailStudentView],activeStudents:[detailStudentView],courseStudents:[detailStudentView],trialStudents:[],formalStudents:[detailStudentView]},
          detailStudentView
        });
      }
      const [purchases,packages,entitlements,entitlementLedger,schedule,membershipBenefitLedger,feedbacks,loadedStudentTeachingSummary]=await Promise.all([
        cappedScan(T_PURCHASES).catch(()=>[]),
        cappedScan(T_PACKAGES).catch(()=>[]),
        cappedScan(T_ENTITLEMENTS).catch(()=>[]),
        T_ENTITLEMENT_LEDGER ? cappedScan(T_ENTITLEMENT_LEDGER, PRODUCTION_PAGE_READ_LIMITS.entitlementLedger).catch(()=>[]) : Promise.resolve([]),
        T_SCHEDULE ? cappedScan(T_SCHEDULE, PRODUCTION_PAGE_READ_LIMITS.schedule) : Promise.resolve([]),
        T_MEMBERSHIP_BENEFIT_LEDGER ? cappedScan(T_MEMBERSHIP_BENEFIT_LEDGER).catch(()=>[]) : Promise.resolve([]),
        T_FEEDBACKS ? cappedScan(T_FEEDBACKS).catch(()=>[]) : Promise.resolve([]),
        Promise.resolve(studentTeachingSummary)
      ]);
      const studentPurchases=purchases.filter(row=>String(row.studentId||'')===studentId);
      const studentEntitlements=entitlements.filter(row=>String(row.studentId||'')===studentId);
      const entitlementIds=new Set(studentEntitlements.map(row=>String(row.id||'')).filter(Boolean));
      const studentScheduleIds=new Set(schedule.filter(row=>rowHasStudent(row,studentId)).map(row=>String(row.id||'')).filter(Boolean));
      const scopedEntitlementLedger=entitlementLedger.filter(row=>entitlementIds.has(String(row.entitlementId||''))||String(row.studentId||'')===studentId||studentScheduleIds.has(String(row.scheduleId||'')));
      const relatedEntitlementIds=new Set([...entitlementIds,...scopedEntitlementLedger.map(row=>String(row.entitlementId||'')).filter(Boolean)]);
      const scopedEntitlements=entitlements.filter(row=>relatedEntitlementIds.has(String(row.id||'')));
      const relatedPurchaseIds=new Set([
        ...studentPurchases.map(row=>String(row.id||'')).filter(Boolean),
        ...scopedEntitlements.map(row=>String(row.purchaseId||'')).filter(Boolean),
        ...scopedEntitlementLedger.map(row=>String(row.purchaseId||'')).filter(Boolean)
      ]);
      const scopedPurchases=purchases.filter(row=>String(row.studentId||'')===studentId||relatedPurchaseIds.has(String(row.id||'')));
      const relatedStudentIds=new Set([
        studentId,
        ...scopedEntitlements.map(row=>String(row.studentId||'')).filter(Boolean),
        ...scopedPurchases.map(row=>String(row.studentId||'')).filter(Boolean)
      ]);
      const relatedStudents=[student,...(await Promise.all([...relatedStudentIds].filter(id=>id&&id!==studentId).map(id=>getCachedRow(T_STUDENTS,id).catch(()=>null))))].filter(Boolean);
      let scoped=filterLoadAllForUser({
        students:relatedStudents,
        purchases:scopedPurchases,
        packages,
        entitlements:scopedEntitlements,
        entitlementLedger:scopedEntitlementLedger,
        schedule:schedule.filter(row=>rowHasStudent(row,studentId)),
        membershipBenefitLedger:membershipBenefitLedger.filter(row=>String(row.studentId||'')===studentId),
        feedbacks:feedbacks.filter(row=>rowHasStudent(row,studentId)),
        studentTeachingSummaries:loadedStudentTeachingSummary?[loadedStudentTeachingSummary]:[]
      },user);
      scoped.schedule=await hydrateScheduleRowsByLedgerIds(scoped.schedule,scoped.entitlementLedger);
      const customerLifecycleRows=buildCustomerLifecycleRows({
        students:scoped.students,
        purchases:scoped.purchases,
        entitlements:scoped.entitlements,
        schedule:scoped.schedule,
        feedbacks:scoped.feedbacks
      });
      const teachingStudentViews=buildTeachingStudentViews(customerLifecycleRows,{...scoped,teachingStudentSummaryRows:scoped.studentTeachingSummaries,ignoreTeachingSummaryDetailRows:true});
      const allViews=[
        ...(teachingStudentViews.historicalStudents||[]),
        ...(teachingStudentViews.activeStudents||[]),
        ...(teachingStudentViews.courseStudents||[]),
        ...(teachingStudentViews.trialStudents||[]),
        ...(teachingStudentViews.formalStudents||[])
      ];
      const detailStudentView=allViews.find(row=>String(row.id||'')===studentId)||null;
      return sendJson(res,{
        students:scoped.students,
        purchases:scoped.purchases,
        packages:scoped.packages,
        entitlements:scoped.entitlements,
        entitlementLedger:scoped.entitlementLedger,
        schedule:scoped.schedule,
        membershipBenefitLedger:scoped.membershipBenefitLedger,
        feedbacks:scoped.feedbacks,
        customerLifecycleRows,
        teachingStudentViews,
        detailStudentView
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
      return sendCustomerCenterTeachingSummary(res,user,query);
    }
    if(path==='/page-data/customer-center-list/publish-summary-bundle'&&method==='POST'){
      if(user.role!=='admin')return sendJson(res,{error:'无权限'},403);
      if(!T_STUDENT_TEACHING_SUMMARY||!put||!getCachedRow||!scanByIdPrefix)return sendJson(res,{error:'摘要发布包补写未配置'},500);
      await init();
      const meta=await getCachedRow(T_STUDENT_TEACHING_SUMMARY,STUDENT_TEACHING_SUMMARY_META_ID).catch(()=>null);
      const activeVersion=String(meta?.activeVersion||'').trim();
      if(String(meta?.status||'')!==STUDENT_TEACHING_SUMMARY_READY||!activeVersion)return sendJson(res,{error:'当前教学学员摘要未发布，拒绝补写发布包'},503);
      const versionRows=await scanByIdPrefix(T_STUDENT_TEACHING_SUMMARY,`${STUDENT_TEACHING_SUMMARY_VERSION_PREFIX}${activeVersion}:`);
      const publishedRows=filterStudentTeachingSummaryPublishedRows(versionRows,{activeVersion});
      const checksum=buildStudentTeachingSummaryChecksum(publishedRows);
      if(Number(meta.rowCount)!==publishedRows.length||String(meta.checksum||'')!==checksum){
        return sendJson(res,{error:'当前教学学员摘要版本行与 meta 不一致，拒绝补写发布包'},503);
      }
      const bundle=buildStudentTeachingSummaryBundleRow(publishedRows,activeVersion);
      await put(T_STUDENT_TEACHING_SUMMARY,bundle.id,bundle);
      return sendJson(res,{success:true,count:publishedRows.length,activeVersion,checksum});
    }
    if(path==='/page-data/customer-center-list/rebuild-summary'&&method==='POST'){
      if(user.role!=='admin')return sendJson(res,{error:'无权限'},403);
      if(!T_STUDENT_TEACHING_SUMMARY||!put||!mkTable)return sendJson(res,{error:'摘要表未配置'},500);
      await init();
      const dryRun=query?.get('dryRun')==='1'||query?.get('dryRun')==='true';
      if(!dryRun)await mkTable(T_STUDENT_TEACHING_SUMMARY);
      const sourceSnapshotAt=new Date().toISOString();
      const batchId=`student-teaching-summary-manual-${Date.now()}`;
      const previousSummaryRows=dryRun?[]:await getCachedScan(T_STUDENT_TEACHING_SUMMARY,{fresh:true}).catch(()=>[]);
      const previousMeta=(previousSummaryRows||[]).find(row=>String(row?.id||'')==='__student_teaching_summary_meta__');
      const hasReadyMeta=String(previousMeta?.status||'')===STUDENT_TEACHING_SUMMARY_READY;
      try{
        const [leads,students,purchases,entitlements,entitlementLedger,schedule,membershipBenefitLedger,feedbacks]=await Promise.all([
          T_LEADS ? cappedScan(T_LEADS, PRODUCTION_PAGE_READ_LIMITS.leads) : Promise.resolve([]),
          cappedScan(T_STUDENTS),
          cappedScan(T_PURCHASES),
          cappedScan(T_ENTITLEMENTS),
          cappedScan(T_ENTITLEMENT_LEDGER, PRODUCTION_PAGE_READ_LIMITS.entitlementLedger),
          T_SCHEDULE ? cappedScan(T_SCHEDULE, PRODUCTION_PAGE_READ_LIMITS.schedule) : Promise.resolve([]),
          T_MEMBERSHIP_BENEFIT_LEDGER ? cappedScan(T_MEMBERSHIP_BENEFIT_LEDGER) : Promise.resolve([]),
          T_FEEDBACKS ? cappedScan(T_FEEDBACKS) : Promise.resolve([])
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
        if(dryRun){
          const teachingStudentViews=buildTeachingStudentViews(customerLifecycleRows,{teachingStudentSummaryRows:rows});
          const standardLifecycleMetrics=buildStandardLifecycleMetrics({...scoped,customerLifecycleRows,teachingStudentSummaryRows:rows});
          return sendJson(res,{
            success:true,
            dryRun:true,
            writePerformed:false,
            count:rows.length,
            teachingSummary:standardLifecycleMetrics.teachingSummary||{},
            teachingViews:{
              historicalStudents:(teachingStudentViews.historicalStudents||[]).length,
              activeStudents:(teachingStudentViews.activeStudents||[]).length,
              trialAttendedStudents:(teachingStudentViews.trialAttendedStudents||[]).length,
              trialAttendedToFormalPurchaseStudents:(teachingStudentViews.trialAttendedToFormalPurchaseStudents||[]).length
            },
            sourceCounts:{
              leads:(scoped.leads||[]).length,
              students:(scoped.students||[]).length,
              purchases:(scoped.purchases||[]).length,
              entitlements:(scoped.entitlements||[]).length,
              entitlementLedger:(scoped.entitlementLedger||[]).length,
              schedule:(scoped.schedule||[]).length,
              membershipBenefitLedger:(scoped.membershipBenefitLedger||[]).length,
              feedbacks:(scoped.feedbacks||[]).length
            },
            updatedAt:new Date().toISOString()
          });
        }
        const bundle=buildStudentTeachingSummaryBundleRow(rows,batchId);
        await put(T_STUDENT_TEACHING_SUMMARY,bundle.id,bundle);
        const publishedRows=rows;
        await put(T_STUDENT_TEACHING_SUMMARY,'__student_teaching_summary_meta__',buildStudentTeachingSummaryMetaRow({
          status:STUDENT_TEACHING_SUMMARY_READY,
          batchId,
          activeVersion:batchId,
          sourceSnapshotAt,
          completedAt:new Date().toISOString(),
          rowCount:publishedRows.length,
          checksum:buildStudentTeachingSummaryChecksum(publishedRows),
          sourceTable:'manual-rebuild',
          sourceOp:'rebuild-summary'
        }));
        return sendJson(res,{success:true,count:publishedRows.length,updatedAt:new Date().toISOString()});
      }catch(err){
        try{
          await rollbackStudentTeachingSummaryPublish({
            tableName:T_STUDENT_TEACHING_SUMMARY,
            previousRows:previousSummaryRows,
            hasReadyMeta:String(previousMeta?.status||'')===STUDENT_TEACHING_SUMMARY_READY,
            batchId,
            getCachedScan,
            put,
            del,
            logger:console
          });
        }catch(rollbackErr){
          console.error('[student-teaching-summary] manual rollback failed',rollbackErr);
        }
        if(!hasReadyMeta){
          await put(T_STUDENT_TEACHING_SUMMARY,'__student_teaching_summary_meta__',buildStudentTeachingSummaryMetaRow({
            status:STUDENT_TEACHING_SUMMARY_FAILED,
            batchId,
            sourceSnapshotAt,
            error:err?.message||String(err),
            sourceTable:'manual-rebuild',
            sourceOp:'rebuild-summary'
          })).catch(()=>null);
        }
        throw err;
      }
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
    if(path==='/page-data/coach-schedule'&&method==='GET'){
      return timedEndpointMetric('pageData.coachSchedule',async()=>{
        await init();
        const [coaches,users]=await Promise.all([cappedScan(T_COACHES),cappedScan(T_USERS, PRODUCTION_PAGE_READ_LIMITS.adminUsers)]);
        const coachRefs=buildCoachRefs({coaches,users});
        const scheduleRowsPromise=user.role==='admin'?getScheduleListRows():getCoachScheduleRowsForUser(user,coachRefs);
        const [campuses,students,classes,schedule,feedbacks,coachProposals]=await Promise.all([
          listCampusesWithDefaults(),
          getFastStudentsRead({columns:COACH_SCHEDULE_STUDENT_PROJECTION_FIELDS}).catch(()=>cappedScan(T_STUDENTS)),
          cappedScan(T_CLASSES),
          scheduleRowsPromise,
          cappedScan(T_FEEDBACKS),
          scanCoachProposals()
        ]);
        const scoped=filterLoadAllForUser({campuses,students,classes,schedule,feedbacks,coachProposals,coaches},user,coachRefs);
        const now=new Date();
        const decoratedFeedbacks=decorateWorkbenchFeedbacks(scoped.feedbacks||[]);
        const decoratedSchedule=decorateWorkbenchScheduleRows(scoped.schedule||[],decoratedFeedbacks,[],now);
        return sendJson(res,{
          campuses:scoped.campuses||[],
          coaches:scoped.coaches||[],
          students:scoped.students||[],
          classes:scoped.classes||[],
          schedule:decoratedSchedule,
          feedbacks:decoratedFeedbacks,
          coachProposals:scoped.coachProposals||[],
          coachOpsUnifiedView:buildCoachOpsUnifiedView({
            coaches:scoped.coaches||[],
            schedule:decoratedSchedule,
            feedbacks:decoratedFeedbacks,
            campuses:scoped.campuses||[]
          })
        });
      },{role:user.role||''});
    }
    if(path==='/page-data/workbench'&&method==='GET'){
      return timedEndpointMetric('pageData.workbench',async()=>{
        await init();
        const [coaches,users]=await Promise.all([cappedScan(T_COACHES),cappedScan(T_USERS, PRODUCTION_PAGE_READ_LIMITS.adminUsers)]);
        const coachRefs=buildCoachRefs({coaches,users});
        const scheduleRowsPromise=user.role==='admin'?getScheduleListRows():getCoachScheduleRowsForUser(user,coachRefs);
        const [campuses,students,classes,schedule,feedbacks,coachProposals,purchases,entitlements,entitlementLedger,plans,studentTeachingSummaries]=await Promise.all([
          listCampusesWithDefaults(),
          cappedScan(T_STUDENTS),
          cappedScan(T_CLASSES),
          scheduleRowsPromise,
          cappedScan(T_FEEDBACKS),
          scanCoachProposals(),
          cappedScan(T_PURCHASES),
          cappedScan(T_ENTITLEMENTS),
          cappedScan(T_ENTITLEMENT_LEDGER, PRODUCTION_PAGE_READ_LIMITS.entitlementLedger),
          cappedScan(T_PLANS),
          readReadyStudentTeachingSummaryRows({tableName:T_STUDENT_TEACHING_SUMMARY,getCachedScan,getCachedRow,scanByIdPrefix})
        ]);
        const scoped=filterLoadAllForUser({campuses,students,classes,schedule,feedbacks,coachProposals,purchases,entitlements,entitlementLedger,plans,studentTeachingSummaries,coaches},user,coachRefs);
        const now=new Date();
        const decoratedFeedbacks=decorateWorkbenchFeedbacks(scoped.feedbacks||[]);
        const decoratedSchedule=decorateWorkbenchScheduleRows(scoped.schedule||[],decoratedFeedbacks,scoped.purchases||[],now,{
          entitlements:scoped.entitlements||[],
          plans:scoped.plans||[]
        }).filter(row=>!row.isCancelled);
        const scheduleIds=new Set((scoped.schedule||[]).map(row=>String(row.id||'')).filter(Boolean));
        const studentScheduleIds=[...new Set((scoped.entitlementLedger||[]).map(row=>String(row.scheduleId||'')).filter(id=>id&&!scheduleIds.has(id)))];
        const extraStudentSchedule=studentScheduleIds.length
          ? (await Promise.all(studentScheduleIds.map(id=>getCachedRow(T_SCHEDULE,id).catch(()=>null)))).filter(Boolean).map(row=>projectScheduleListRow(row))
          : [];
        const decoratedStudentSchedule=extraStudentSchedule.length
          ? decorateWorkbenchScheduleRows([...(scoped.schedule||[]),...extraStudentSchedule],decoratedFeedbacks,scoped.purchases||[],now,{
              entitlements:scoped.entitlements||[],
              plans:scoped.plans||[]
            }).filter(row=>!row.isCancelled)
          : decoratedSchedule;
        const decoratedStudents=decorateWorkbenchStudents(scoped.students||[],decoratedStudentSchedule,now,scoped.entitlements||[]);
        const decoratedClasses=decorateWorkbenchClasses(scoped.classes||[],scoped.schedule||[]);
        const customerLifecycleRows=buildCustomerLifecycleRows({
          students:scoped.students,
          purchases:scoped.purchases,
          entitlements:scoped.entitlements,
          schedule:scoped.schedule
        });
        const standardLifecycleMetrics=buildStandardLifecycleMetrics({...scoped,customerLifecycleRows});
        const teachingSummaryRows=scoped.studentTeachingSummaries||[];
        const teachingStudentViews=buildTeachingStudentViews(customerLifecycleRows,{
          ...scoped,
          teachingStudentSummaryRows:teachingSummaryRows,
          ignoreTeachingSummaryDetailRows:true
        });
        const studentRoster=buildCoachMiniStudentRoster({
          teachingStudentViews,
          coachName:String(user.coachName||user.name||user.username||'').trim(),
          students:scoped.students||[],
          schedule:decoratedStudentSchedule,
          now
        });
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
          studentTeachingSummaries:scoped.studentTeachingSummaries||[],
          customerLifecycleRows,
          teachingStudentViews,
          studentRoster,
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
