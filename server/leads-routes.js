const { readLeadSourceRows } = require('./lead-source-read-model.js');
const { buildCustomerLifecycleRows } = require('./read-models/customer-lifecycle.js');
const { buildLeadPoolRows, buildTeachingStudentViews } = require('./read-models/platform-metrics.js');
const { buildCourtAccountListViewFromIndexRows } = require('./page-data/court-account-list-index.js');
const { readReadyStudentTeachingSummaryRows } = require('./read-models/student-teaching-summary-cache.js');
const { normalizeCampusValue } = require('../public/assets/scripts/core/campus.js');

function createLeadsRoutes(deps={}){
  const {
    init,sendJson,getCachedScan,getCachedRow,scanByIdPrefix,get,scan,put,del,filterLoadAllForUser,isProductionRuntime,isCampusScopedAdmin,uuidv4,
    refreshStudentTeachingSummaryRows,
    cleanLeadText,ensureLeadTables,scanFirstRows,PRODUCTION_PAGE_READ_LIMITS,
    LEAD_FOLLOWUP_LIST_PROJECTION_FIELDS,LEAD_LIST_PROJECTION_FIELDS,mergeDuplicateLeadRows,
    normalizeLeadRecord,leadCanonicalNameKey,mergeLeadRows,buildLeadInitialFollowup,
    normalizeLeadFollowupRecord,applyLeadFollowupsSnapshot,applyLeadFollowupSnapshot,normalizeLeadImportRows,
    buildLeadImportPreviewRows,leadImportPreviewSummary,dedupeLeadRows,buildLeadDedupKey,buildLeadMergePlan,
    buildLeadStudentRecord,buildLeadCourtRecord,matchLeadToStudent,matchLeadToCourt,isNonPersonLeadName,
    T_LEADS,T_LEAD_FOLLOWUPS,T_LEAD_IMPORT_BATCHES,T_STUDENTS,T_COURTS,T_MEMBERSHIP_ACCOUNTS,T_STUDENT_TEACHING_SUMMARY,T_COURT_ACCOUNT_LIST_INDEX,
    T_PURCHASES,T_ENTITLEMENTS,T_SCHEDULE,T_MEMBERSHIP_ORDERS,T_ENTITLEMENT_LEDGER,
    T_MEMBERSHIP_BENEFIT_LEDGER,T_MEMBERSHIP_ACCOUNT_EVENTS,T_FINANCIAL_LEDGER,T_PLANS,T_CLASSES,T_FEEDBACKS
  }=deps;
  const LEAD_LIST_CACHE_TTL_MS=process.env.DISABLE_HOT_SCAN_PREWARM==='true'?300000:30000;
  const LEAD_LIST_CACHE_MAX_ENTRIES=120;
  const LEAD_LIST_READ_TIMEOUT_MS=Math.max(1,Number(process.env.LEAD_LIST_READ_TIMEOUT_MS)||3500);
  const leadSourceRowsCache={expiresAt:0,rows:null};
  const leadPagedResponseCache=new Map();
  const leadFilteredResultCache=new Map();
  let leadSourceRowsLoadPromise=null;
  let leadSourceRowsUnavailable=false;
  let leadAuxiliaryRowsUnavailable=false;

  function cloneLeadCachePayload(value){
    return JSON.parse(JSON.stringify(value));
  }

  function clearLeadListCaches(){
    leadSourceRowsCache.expiresAt=0;
    leadSourceRowsCache.rows=null;
    leadSourceRowsLoadPromise=null;
    leadPagedResponseCache.clear();
    leadFilteredResultCache.clear();
  }

  function trimLeadPagedResponseCache(){
    while(leadPagedResponseCache.size>LEAD_LIST_CACHE_MAX_ENTRIES){
      const firstKey=leadPagedResponseCache.keys().next().value;
      if(!firstKey)break;
      leadPagedResponseCache.delete(firstKey);
    }
  }

  function trimLeadFilteredResultCache(){
    while(leadFilteredResultCache.size>LEAD_LIST_CACHE_MAX_ENTRIES){
      const firstKey=leadFilteredResultCache.keys().next().value;
      if(!firstKey)break;
      leadFilteredResultCache.delete(firstKey);
    }
  }

  function leadListQueryCachePart(query,{includePaging=true}={}){
    return [...(query||new URLSearchParams()).entries()]
      .map(([key,value])=>[cleanLeadText(key),cleanLeadText(value)])
      .filter(([key])=>includePaging||!['paged','page','pageSize'].includes(key))
      .sort((a,b)=>a[0].localeCompare(b[0])||a[1].localeCompare(b[1]));
  }

  function leadListUserCachePart(user={}){
    const campusIds=Array.isArray(user.campusIds)?user.campusIds:[];
    return {
      role:cleanLeadText(user.role),
      name:cleanLeadText(user.name||user.username||user.id),
      dataScope:cleanLeadText(user.dataScope),
      campus:cleanLeadText(user.campus),
      campusIds:campusIds.map(cleanLeadText).sort()
    };
  }

  function leadPagedResponseCacheKey(query,user){
    return JSON.stringify({query:leadListQueryCachePart(query),user:leadListUserCachePart(user)});
  }

  function leadFilteredResultCacheKey(query,user){
    return JSON.stringify({query:leadListQueryCachePart(query,{includePaging:false}),user:leadListUserCachePart(user)});
  }

  function readLeadPagedResponseCache(key,now=Date.now()){
    const cached=leadPagedResponseCache.get(key);
    if(!cached||cached.expiresAt<=now){
      if(cached)leadPagedResponseCache.delete(key);
      return null;
    }
    return cloneLeadCachePayload(cached.payload);
  }

  function writeLeadPagedResponseCache(key,payload,now=Date.now()){
    leadPagedResponseCache.set(key,{expiresAt:now+LEAD_LIST_CACHE_TTL_MS,payload:cloneLeadCachePayload(payload)});
    trimLeadPagedResponseCache();
  }

  function readLeadFilteredResultCache(key,now=Date.now()){
    const cached=leadFilteredResultCache.get(key);
    if(!cached||cached.expiresAt<=now){
      if(cached)leadFilteredResultCache.delete(key);
      return null;
    }
    return cloneLeadCachePayload(cached.payload);
  }

  function writeLeadFilteredResultCache(key,payload,now=Date.now()){
    leadFilteredResultCache.set(key,{expiresAt:now+LEAD_LIST_CACHE_TTL_MS,payload:cloneLeadCachePayload(payload)});
    trimLeadFilteredResultCache();
  }

  function leadReadTimeout(label){
    const error=new Error(`${label} timed out after ${LEAD_LIST_READ_TIMEOUT_MS}ms`);
    error.code='LEAD_LIST_READ_TIMEOUT';
    return error;
  }

  async function withLeadReadTimeout(promise,label){
    let timer=null;
    try{
      return await Promise.race([
        promise,
        new Promise((resolve,reject)=>{
          timer=setTimeout(()=>reject(leadReadTimeout(label)),LEAD_LIST_READ_TIMEOUT_MS);
        })
      ]);
    }finally{
      if(timer)clearTimeout(timer);
    }
  }

  function isLocalPreviewFastMode(){
    return process.env.DISABLE_HOT_SCAN_PREWARM==='true'&&!isProductionRuntime();
  }

  async function readCachedLeadSourceRows(){
    const now=Date.now();
    leadSourceRowsUnavailable=false;
    if(Array.isArray(leadSourceRowsCache.rows)&&leadSourceRowsCache.expiresAt>now)return leadSourceRowsCache.rows;
    if(leadSourceRowsLoadPromise)return cloneLeadCachePayload(await leadSourceRowsLoadPromise);
    const staleRows=Array.isArray(leadSourceRowsCache.rows)?cloneLeadCachePayload(leadSourceRowsCache.rows):null;
    leadSourceRowsLoadPromise=withLeadReadTimeout((async()=>{
    let rows;
    try{
      if(isLocalPreviewFastMode()&&typeof getCachedScan==='function'){
        rows=await getCachedScan(T_LEADS,{columns:LEAD_LIST_PROJECTION_FIELDS,pageLimit:100});
      }else if(isProductionRuntime()&&typeof scanFirstRows==='function'){
        rows=await readLeadSourceRows({isProductionRuntime:()=>true,scanFirstRows,getCachedScan,table:T_LEADS,columns:LEAD_LIST_PROJECTION_FIELDS});
      }else{
        rows=await readLeadSourceRows({isProductionRuntime,scanFirstRows,getCachedScan,table:T_LEADS,columns:LEAD_LIST_PROJECTION_FIELDS});
      }
    }catch(error){
      if(Array.isArray(leadSourceRowsCache.rows))return leadSourceRowsCache.rows;
      if(typeof getCachedScan!=='function'||typeof scanFirstRows==='function')throw error;
      console.warn('[leads-list] projected lead read failed, fallback to cached scan without first-row reader',error?.message||error);
      rows=await readLeadSourceRows({isProductionRuntime:()=>false,scanFirstRows,getCachedScan,table:T_LEADS,columns:LEAD_LIST_PROJECTION_FIELDS});
    }
    leadSourceRowsCache.rows=rows;
    leadSourceRowsCache.expiresAt=now+LEAD_LIST_CACHE_TTL_MS;
    return rows;
    })(), 'lead source rows').catch(error=>{
      if(error?.code==='LEAD_LIST_READ_TIMEOUT'){
        leadSourceRowsUnavailable=true;
        console.warn('[leads-list] lead source read unavailable, serving cached or empty rows',error.message||error);
        return staleRows||[];
      }
      throw error;
    }).finally(()=>{leadSourceRowsLoadPromise=null;});
    return cloneLeadCachePayload(await leadSourceRowsLoadPromise);
  }

  function leadSearchHit(q,...values){
    if(!q)return true;
    const keyword=String(q).toLowerCase().trim();
    return values.some(v=>String(v||'').toLowerCase().includes(keyword));
  }

  function leadListSearchHit(q,row={}){
    return leadSearchHit(q,row.displayName,row.wechatName,row.name,row.phone);
  }

  function parseLeadPaging(query){
    const enabled=query?.get('paged')==='1'||query?.get('page')||query?.get('pageSize');
    if(!enabled)return null;
    const page=Math.max(1,parseInt(query?.get('page')||'1',10)||1);
    const pageSize=Math.max(1,Math.min(parseInt(query?.get('pageSize')||'15',10)||15,100));
    return {page,pageSize};
  }

  function buildLeadListPage(rows=[],paging=null){
    if(!paging)return null;
    const total=rows.length;
    const pages=Math.max(1,Math.ceil(total/paging.pageSize));
    const page=Math.min(paging.page,pages);
    const start=(page-1)*paging.pageSize;
    return {rows:rows.slice(start,start+paging.pageSize),total,page,pageSize:paging.pageSize,pages};
  }

  function leadCsvValues(value){
    return cleanLeadText(value).split(',').map(item=>cleanLeadText(item)).filter(Boolean);
  }

  function buildLeadListFilterState(query){
    return {
      q:cleanLeadText(query.get('q')).toLowerCase(),
      source:cleanLeadText(query.get('source')),
      customerType:cleanLeadText(query.get('customerType')),
      consultType:cleanLeadText(query.get('consultType')||query.get('demandProduct')),
      ownerValues:leadCsvValues(query.get('owner')),
      systemStatus:cleanLeadText(query.get('systemStatus')||query.get('leadStage')),
      dealType:cleanLeadText(query.get('dealType')),
      campusValue:cleanLeadText(query.get('campus')),
      campusName:cleanLeadText(query.get('campusName')),
      waiting:cleanLeadText(query.get('waiting')),
      dateFrom:cleanLeadText(query.get('dateFrom')),
      dateTo:cleanLeadText(query.get('dateTo')),
      startDate:cleanLeadText(query.get('startDate')),
      endDate:cleanLeadText(query.get('endDate')),
      todayStr:new Date().toISOString().slice(0,10)
    };
  }

  function leadRowFieldText(row,...fields){
    for(const field of fields){
      const value=cleanLeadText(row?.[field]);
      if(value)return value;
    }
    return '';
  }

  function leadMatchesListFilter(row={},state={},excludeKey=''){
    if(excludeKey!=='q'&&state.q&&!leadListSearchHit(state.q,row))return false;
    if(excludeKey!=='source'&&state.source&&leadRowFieldText(row,'source')!==state.source)return false;
    if(excludeKey!=='customerType'&&state.customerType&&leadRowFieldText(row,'customerType','consultType','demandProduct','profileNote')!==state.customerType)return false;
    if(excludeKey!=='consultType'&&state.consultType&&leadRowFieldText(row,'demandProduct','consultType')!==state.consultType)return false;
    if(excludeKey!=='owner'&&state.ownerValues.length&&!state.ownerValues.includes(leadRowFieldText(row,'owner')))return false;
    if(excludeKey!=='systemStatus'&&state.systemStatus&&leadRowFieldText(row,'leadStage','systemStatus','rawStatus')!==state.systemStatus)return false;
    if(excludeKey!=='dealType'&&state.dealType&&leadRowFieldText(row,'dealType','conversionType')!==state.dealType)return false;
    if(excludeKey!=='campus'&&(state.campusValue||state.campusName)&&!leadCampusMatches(row,state.campusValue,state.campusName))return false;
    const leadDateValue=leadDateOnly(leadBusinessDateValue(row));
    if(excludeKey!=='date'&&state.dateFrom&&leadDateValue<state.dateFrom)return false;
    if(excludeKey!=='date'&&state.dateTo&&leadDateValue>state.dateTo)return false;
    if(excludeKey!=='globalDate'&&state.startDate&&leadGlobalDateValue(row)<state.startDate)return false;
    if(excludeKey!=='globalDate'&&state.endDate&&leadGlobalDateValue(row)>state.endDate)return false;
    if(excludeKey!=='waiting'&&state.waiting==='today'&&String(row.nextFollowupAt||'').slice(0,10)!==state.todayStr)return false;
    if(excludeKey!=='waiting'&&state.waiting==='overdue'&&String(row.nextFollowupAt||'').slice(0,10)>=state.todayStr)return false;
    return true;
  }

  function buildLeadListFieldCounts(rows=[],state={},fieldKey='',valueFn=()=>'',excludeKey=fieldKey){
    const counts={};
    const scoped=(rows||[]).filter(row=>leadMatchesListFilter(row,state,excludeKey));
    scoped.forEach(row=>{
      const value=cleanLeadText(valueFn(row));
      if(!value)return;
      counts[value]=(counts[value]||0)+1;
    });
    return {total:scoped.length,counts};
  }

  function buildLeadListFilterMeta(rows=[],state={}){
    return {
      source:buildLeadListFieldCounts(rows,state,'source',row=>leadRowFieldText(row,'source')),
      customerType:buildLeadListFieldCounts(rows,state,'customerType',row=>leadRowFieldText(row,'customerType','consultType','demandProduct','profileNote')),
      consult:buildLeadListFieldCounts(rows,state,'consultType',row=>leadRowFieldText(row,'demandProduct','consultType')),
      stage:buildLeadListFieldCounts(rows,state,'systemStatus',row=>leadRowFieldText(row,'leadStage','systemStatus','rawStatus')),
      dealType:buildLeadListFieldCounts(rows,state,'dealType',row=>leadRowFieldText(row,'dealType','conversionType')),
      owner:buildLeadListFieldCounts(rows,state,'owner',row=>leadRowFieldText(row,'owner'))
    };
  }

  function leadDateMs(value){
    const raw=cleanLeadText(value).replace(' ','T');
    const parsed=Date.parse(raw);
    return Number.isFinite(parsed)?parsed:0;
  }

  function leadDateOnly(value){
    const text=cleanLeadText(value);
    const match=text.match(/^(\d{4})[-/](\d{1,2})[-/](\d{1,2})/);
    if(match)return `${match[1]}-${String(match[2]).padStart(2,'0')}-${String(match[3]).padStart(2,'0')}`;
    return text.slice(0,10);
  }

  function leadBusinessDateValue(row={}){
    const systemLeadDate=cleanLeadText(row?.leadDateSource).toLowerCase()==='system';
    const storedLeadDate=systemLeadDate?'':(row?.leadDate||row?.leadEnteredAt);
    const businessDate=leadEarliestDateValue(row?.firstTouchAt,row?.trialAtRaw,row?.trialBookedAt,row?.trialAttendedAt,row?.packagePurchaseDate,row?.courseFirstPurchaseAt,row?.conversionAt,row?.enrollAtRaw,row?.formalSignupAt);
    return storedLeadDate||businessDate||leadTrustedCreatedAtValue(row,businessDate);
  }

  function leadEarliestDateValue(...values){
    return values
      .map(cleanLeadText)
      .filter(Boolean)
      .map(value=>({value,ms:leadDateMs(value)}))
      .sort((a,b)=>(a.ms||Number.MAX_SAFE_INTEGER)-(b.ms||Number.MAX_SAFE_INTEGER))[0]?.value||'';
  }

  function leadTrustedCreatedAtValue(row={},businessDate=''){
    const id=cleanLeadText(row?.id||row?.leadId||row?.sourceLeadId);
    if(!id||row?.isLifecycleSynthetic||row?.hasTeachingSummarySnapshot||/^lead-from-student-/.test(id))return '';
    const createdAt=cleanLeadText(row?.createdAt);
    if(!createdAt)return '';
    const explicitLeadDate=cleanLeadText(row?.leadDate||row?.leadEnteredAt);
    const updatedAt=cleanLeadText(row?.updatedAt);
    if(businessDate&&explicitLeadDate===createdAt&&(!updatedAt||updatedAt===createdAt)&&leadDateMs(createdAt)>leadDateMs(businessDate))return '';
    return createdAt;
  }

  function leadSortMetric(row,key){
    if(key==='leadDate')return leadDateMs(leadBusinessDateValue(row));
    if(key==='trialLessonAt')return leadDateMs(row?.trialAtRaw||row?.trialLessonAt||row?.trialAt);
    if(key==='lastFollowupAt')return leadDateMs(row?.lastFollowupAt);
    if(key==='formalSignupAt')return leadDateMs(row?.courseFirstPurchaseAt||row?.formalSignupAt||row?.enrollAtRaw||row?.enrollAt);
    if(key==='followupCount')return Number(row?.followupCount)||0;
    return 0;
  }

  function sortLeadListRows(rows=[],query){
    const sortKey=cleanLeadText(query?.get('sortKey'));
    const sortDir=cleanLeadText(query?.get('sortDir'))==='asc'?'asc':'desc';
    if(sortKey){
      const dir=sortDir==='asc'?1:-1;
      return [...rows].sort((a,b)=>{
        const av=leadSortMetric(a,sortKey),bv=leadSortMetric(b,sortKey);
        const emptyA=!av,emptyB=!bv;
        if(emptyA&&emptyB)return cleanLeadText(b.updatedAt||b.createdAt||b.id).localeCompare(cleanLeadText(a.updatedAt||a.createdAt||a.id));
        if(emptyA)return 1;
        if(emptyB)return -1;
        return (av-bv)*dir||cleanLeadText(b.updatedAt||b.createdAt||b.id).localeCompare(cleanLeadText(a.updatedAt||a.createdAt||a.id));
      });
    }
    return [...rows].sort((a,b)=>{
      const leadDateDiff=leadDateMs(leadBusinessDateValue(b))-leadDateMs(leadBusinessDateValue(a));
      if(leadDateDiff!==0)return leadDateDiff;
      const followupDiff=leadDateMs(b?.lastFollowupAt)-leadDateMs(a?.lastFollowupAt);
      if(followupDiff!==0)return followupDiff;
      return cleanLeadText(b?.updatedAt||b?.createdAt||b?.id).localeCompare(cleanLeadText(a?.updatedAt||a?.createdAt||a?.id));
    });
  }

  function leadCampusMatches(row,value,name=''){
    const expected=normalizeCampusValue(value||name);
    if(!expected)return true;
    return [row?.campus,row?.campusCode,row?.campusName].some(item=>normalizeCampusValue(item)===expected);
  }

  function leadGlobalDateValue(row){
    return leadDateOnly(leadBusinessDateValue(row));
  }

  function leadSummaryBool(value){
    if(value===true)return true;
    const text=cleanLeadText(value).toLowerCase();
    return ['true','1','yes','是','已'].includes(text);
  }

  function parseLeadSnapshotArray(value){
    if(Array.isArray(value))return value;
    const raw=cleanLeadText(value);
    if(!raw)return [];
    try{
      const parsed=JSON.parse(raw);
      return Array.isArray(parsed)?parsed:[];
    }catch{
      return [];
    }
  }

  function summaryRowHasTrialLesson(row={}){
    return parseLeadSnapshotArray(row.detailLessonRecordRows).some(item=>/体验/.test(cleanLeadText([
      item?.courseType,
      item?.standardCourseType,
      item?.packageName,
      item?.productName,
      item?.className,
      item?.courseName
    ].filter(Boolean).join(' '))));
  }

  function summaryRowHasConsumedTrialPackage(row={}){
    return [...parseLeadSnapshotArray(row.detailPackageOrderRows),...parseLeadSnapshotArray(row.packageListRows)].some(item=>{
      const label=cleanLeadText([item?.courseType,item?.standardCourseType,item?.packageName,item?.productName].filter(Boolean).join(' '));
      if(!/体验/.test(label))return false;
      const total=Number(item?.totalLessons)||0;
      const used=Number(item?.usedLessons)||0;
      const remaining=Number(item?.remainingLessons);
      return used>0||(total>0&&Number.isFinite(remaining)&&remaining<=0)||/已用完|已核销|已消课/.test(cleanLeadText(item?.statusText||item?.status));
    });
  }

  function summaryRowExplicitBool(row={},field=''){
    if(!Object.prototype.hasOwnProperty.call(row,field))return undefined;
    if(row[field]===true||row[field]===false)return row[field];
    const raw=cleanLeadText(row[field]).toLowerCase();
    if(raw==='true')return true;
    if(raw==='false')return false;
    return undefined;
  }

  function summaryRowIsFormalCourseItem(item={}){
    const label=cleanLeadText([item?.courseType,item?.standardCourseType,item?.packageName,item?.productName,item?.courseName,item?.className].filter(Boolean).join(' '));
    return !/体验|陪打/.test(label)&&/私教|小班|课包|正式|成人|青少年|网球/.test(label);
  }

  function summaryRowHasFormalCourseFact(row={}){
    if(leadSummaryBool(row?.hasFormalAttended)||cleanLeadText(row?.lastFormalLessonAt||row?.detailRecentLessonDate))return true;
    if((Number(row?.coursePurchaseCount)||0)>0)return true;
    if(cleanLeadText(row?.studentStage)==='formal')return true;
    if(cleanLeadText(row?.packagePurchaseDate))return true;
    if((Number(row?.cumulativeCoursePaidAmount)||0)>0)return true;
    if((Number(row?.packageBalanceTotal)||0)>0)return true;
    return [...parseLeadSnapshotArray(row.detailPackageOrderRows),...parseLeadSnapshotArray(row.packageListRows)]
      .some(item=>summaryRowIsFormalCourseItem(item)&&(Number(item?.actualAmount||item?.paidAmount||item?.totalAmount||0)>0||Number(item?.totalLessons||0)>0||cleanLeadText(item?.purchaseDate||item?.createdAt)));
  }

  function leadSummaryRate(value,total){
    if(!total)return '0%';
    const percent=(Number(value)||0)*100/(Number(total)||0);
    return `${Number.isInteger(percent)?percent:percent.toFixed(1)}%`;
  }

  function leadSummaryTrialAttended(row={}){
    if(leadSummaryBool(row.hasTrialAttended))return true;
    if(cleanLeadText(row.trialAttendedAt))return true;
    return ['体验课完成','已体验待转化','已体验待成交'].includes(leadRowFieldText(row,'leadStage','systemStatus','rawStatus'));
  }

  function leadSummaryCourseConverted(row={}){
    return leadSummaryBool(row.hasCourseConversion)||leadSummaryBool(row.isCourseConverted)||!!cleanLeadText(row.studentId);
  }

  function summaryRowIsActiveStudentRoster(row={}){
    if(leadSummaryBool(row?.isActiveStudentRoster))return true;
    if((Number(row?.packageBalanceRemaining)||0)>0)return true;
    const activityLabel=cleanLeadText(row?.activityStatusLabel);
    if(['近30天活跃','31-90天活跃','课包活跃中','有余额未活跃'].includes(activityLabel))return true;
    const studentStatusLabel=cleanLeadText(row?.studentStatusLabel);
    if(['课包活跃中','有余额未活跃'].includes(studentStatusLabel))return true;
    const packageStatusLabel=cleanLeadText(row?.packageStatusLabel);
    if(['课包有余额','课包即将耗尽'].includes(packageStatusLabel))return true;
    const recentLessonAt=cleanLeadText(row?.detailRecentLessonDate||row?.lastFormalLessonAt);
    if(!recentLessonAt)return false;
    const days=Math.floor((Date.now()-leadDateMs(recentLessonAt))/86400000);
    return Number.isFinite(days)&&days>=0&&days<=90;
  }

  function leadListHasStudentMetricScope(state={}){
    return !!(
      state.q||
      state.source||
      state.customerType||
      state.consultType||
      state.ownerValues?.length||
      state.systemStatus||
      state.dealType||
      state.campusValue||
      state.campusName||
      state.waiting||
      state.dateFrom||
      state.dateTo||
      state.startDate||
      state.endDate
    );
  }

  function leadListIdentitySets(rows=[]){
    const sourceLeadIds=new Set();
    const leadIds=new Set();
    const studentIds=new Set();
    (Array.isArray(rows)?rows:[]).forEach(row=>{
      [row.id,row.leadId,row.sourceLeadId].map(cleanLeadText).filter(Boolean).forEach(id=>{
        leadIds.add(id);
        sourceLeadIds.add(id);
      });
      const studentId=cleanLeadText(row.studentId);
      if(studentId)studentIds.add(studentId);
    });
    return {sourceLeadIds,leadIds,studentIds};
  }

  function leadTeachingSummaryRowsForList(rows=[],summaryRows=[],state={}){
    const list=Array.isArray(summaryRows)?summaryRows:[];
    if(!leadListHasStudentMetricScope(state))return list;
    const ids=leadListIdentitySets(rows);
    return list.filter(row=>{
      const studentId=cleanLeadText(row?.studentId||row?.id);
      const sourceLeadId=cleanLeadText(row?.sourceLeadId);
      const leadId=cleanLeadText(row?.leadId);
      return studentId&&ids.studentIds.has(studentId)
        || sourceLeadId&&(ids.sourceLeadIds.has(sourceLeadId)||ids.leadIds.has(sourceLeadId))
        || leadId&&(ids.sourceLeadIds.has(leadId)||ids.leadIds.has(leadId));
    });
  }

  function buildLeadTeachingSummaryFromReadModel(rows=[],summaryRows=[],state={}){
    const scopedSummaryRows=leadTeachingSummaryRowsForList(rows,summaryRows,state);
    const customerLifecycleRows=buildCustomerCenterSummaryLifecycleRows(scopedSummaryRows);
    return buildTeachingStudentViews(customerLifecycleRows,{teachingStudentSummaryRows:scopedSummaryRows}).summary||{};
  }

  function buildLeadListSummary(rows=[],options={}){
    const list=Array.isArray(rows)?rows:[];
    const total=list.length;
    const teachingSummary=buildLeadTeachingSummaryFromReadModel(list,options.studentTeachingSummaryRows||[],options.filterState||{});
    const historicalStudents=Number(teachingSummary.historicalStudentCount)||0;
    const activeStudents=Number(teachingSummary.activeStudentCount)||0;
    const trialAttended=Number(teachingSummary.trialAttendedStudentCount)||0;
    const trialAttendedToFormalPurchase=Number(teachingSummary.trialAttendedToFormalPurchaseCount)||0;
    return {
      total,
      historicalStudents,
      historicalStudentRate:leadSummaryRate(historicalStudents,total),
      activeStudents,
      activeStudentRate:leadSummaryRate(activeStudents,historicalStudents),
      trialAttended,
      trialAttendedRate:leadSummaryRate(trialAttended,total),
      trialAttendedToFormalPurchase,
      trialAttendedToFormalPurchaseRate:leadSummaryRate(trialAttendedToFormalPurchase,trialAttended)
    };
  }

  function leadPoolNameKey(value){
    return cleanLeadText(value)
      .replace(/1[3-9]\d{9}/g,'')
      .toLowerCase()
      .replace(/\s+/g,'')
      .replace(/[·.。_\-\/|｜，,;；]/g,'');
  }

  function buildCustomerCenterSummaryLifecycleRows(summaryRows=[]){
    return (Array.isArray(summaryRows)?summaryRows:[]).map(row=>{
      const studentId=cleanLeadText(row?.studentId||row?.id);
      if(!studentId)return null;
      const explicitTrialAttended=summaryRowExplicitBool(row,'hasTrialAttended');
      const explicitFormalAttended=summaryRowExplicitBool(row,'hasFormalAttended');
      const hasTrialAttended=explicitTrialAttended!==undefined?explicitTrialAttended:(!!cleanLeadText(row?.trialAttendedAt)||summaryRowHasTrialLesson(row)||summaryRowHasConsumedTrialPackage(row));
      const hasFormalAttended=explicitFormalAttended!==undefined?explicitFormalAttended:!!cleanLeadText(row?.lastFormalLessonAt);
      const hasFormalCourseFact=summaryRowHasFormalCourseFact(row);
      const hasTrialToCourseConversion=hasTrialAttended&&hasFormalCourseFact;
      return {
        customerKey:`teaching-summary:${studentId}`,
        sourceLeadId:cleanLeadText(row?.sourceLeadId||''),
        leadId:cleanLeadText(row?.leadId||''),
        studentId,
        displayName:cleanLeadText(row?.displayName||row?.name||studentId),
        phone:cleanLeadText(row?.phone||''),
        source:cleanLeadText(row?.source||''),
        campus:cleanLeadText(row?.campus||''),
        owner:cleanLeadText(row?.primaryCoach||''),
        customerType:cleanLeadText(row?.type||''),
        demandProduct:'',
        trialAtRaw:cleanLeadText(row?.trialAtRaw||''),
        trialBookedAt:cleanLeadText(row?.trialBookedAt||''),
        trialAttendedAt:cleanLeadText(row?.trialAttendedAt||''),
        courseFirstPurchaseAt:cleanLeadText(row?.packagePurchaseDate||''),
        conversionAt:cleanLeadText(row?.packagePurchaseDate||''),
        formalCoach:cleanLeadText(row?.primaryCoach||''),
        profileNote:cleanLeadText(row?.profileNote||row?.notes||''),
        notes:cleanLeadText(row?.notes||row?.profileNote||''),
        studentStage:cleanLeadText(row?.studentStage||(hasFormalAttended?'formal':(hasTrialAttended?'trial':'student'))),
      courseDealPath:cleanLeadText(row?.courseDealPath||''),
      trialStatus:cleanLeadText(row?.trialStatus||''),
      coursePurchaseCount:Number(row?.coursePurchaseCount)||0,
      hasCourseRepeatPurchase:leadSummaryBool(row?.hasCourseRepeatPurchase)||cleanLeadText(row?.courseDealPath||'')==='老客续费',
      hasTrialToCourseConversion,
      courtStage:cleanLeadText(row?.courtStage||'none'),
      membershipStatus:cleanLeadText(row?.membershipStatus||''),
      hasTrialExperience:hasTrialAttended,
      hasTeachingSummarySnapshot:true,
      isHistoricalStudentRoster:leadSummaryBool(row?.isHistoricalStudentRoster)||hasTrialAttended||hasFormalAttended||leadSummaryBool(row?.isActiveStudentRoster),
        isActiveStudentRoster:leadSummaryBool(row?.isActiveStudentRoster)||summaryRowIsActiveStudentRoster(row),
      hasTrialAttended,
      hasFormalAttended,
      hasScheduleRecord:leadSummaryBool(row?.hasScheduleRecord)||hasTrialAttended||hasFormalAttended,
      hasCourseStudentEntry:leadSummaryBool(row?.hasCourseStudentEntry)||hasTrialAttended||hasFormalAttended,
      hasFreeCourseFollowup:leadSummaryBool(row?.hasFreeCourseFollowup)||hasTrialAttended||hasFormalAttended,
      lastFormalLessonAt:cleanLeadText(row?.lastFormalLessonAt||row?.detailRecentLessonDate||''),
      detailRecentLessonDate:cleanLeadText(row?.detailRecentLessonDate||row?.lastFormalLessonAt||''),
      packageBalanceRemaining:Number(row?.packageBalanceRemaining)||0,
      packageBalanceTotal:Number(row?.packageBalanceTotal)||0,
      packageBalanceText:cleanLeadText(row?.packageBalanceText||''),
      packageBalancePercent:Number(row?.packageBalancePercent)||0,
      activityStatusLabel:cleanLeadText(row?.activityStatusLabel||''),
      studentStatusLabel:cleanLeadText(row?.studentStatusLabel||''),
      packageStatusLabel:cleanLeadText(row?.packageStatusLabel||''),
      paymentModeLabel:cleanLeadText(row?.paymentModeLabel||''),
      lessonVolumeLabel:cleanLeadText(row?.lessonVolumeLabel||''),
      leadDate:cleanLeadText(row?.firstTouchAt||row?.trialAtRaw||row?.trialBookedAt||row?.trialAttendedAt||row?.packagePurchaseDate||row?.courseFirstPurchaseAt||row?.conversionAt||''),
      createdAt:cleanLeadText(row?.summaryUpdatedAt||row?.updatedAt||''),
      hasCourseConversion:leadSummaryBool(row?.hasCourseConversion)||cleanLeadText(row?.studentStage||'')==='formal'||hasFormalCourseFact,
      hasBookingConversion:leadSummaryBool(row?.hasBookingConversion),
        hasMembershipConversion:leadSummaryBool(row?.hasMembershipConversion)
      };
    }).filter(Boolean);
  }

  function buildCourtLifecycleRows(items=[],leads=[]){
    const leadByCourtId=new Map();
    const leadNameToIds=new Map();
    (Array.isArray(leads)?leads:[]).forEach(lead=>{
      const id=cleanLeadText(lead?.id);
      if(!id)return;
      const courtId=cleanLeadText(lead?.courtId);
      if(courtId)leadByCourtId.set(courtId,id);
      const nameKey=leadPoolNameKey(lead?.displayName||lead?.wechatName||lead?.name);
      if(!nameKey)return;
      const ids=leadNameToIds.get(nameKey)||[];
      ids.push(id);
      leadNameToIds.set(nameKey,[...new Set(ids)]);
    });
    return (Array.isArray(items)?items:[]).map(item=>{
      const courtId=cleanLeadText(item?.id||item?.courtId);
      if(!courtId)return null;
      const nameKey=leadPoolNameKey(item?.displayName||item?.name||item?.linkedStudentSummary);
      const matchedIds=[
        cleanLeadText(leadByCourtId.get(courtId)||''),
        ...(leadNameToIds.get(nameKey)||[])
      ].filter(Boolean);
      const sourceLeadId=matchedIds[0]||'';
      const membershipStatus=cleanLeadText(item?.membershipStatusCode||item?.membershipStatus||'');
      const hasMembershipConversion=item?.accountType==='会员账户'||!!membershipStatus&& !['voided','cleared','inactive'].includes(membershipStatus);
      const hasBookingConversion=(Number(item?.bookingCount)||0)>0||(Number(item?.memberBookingCount)||0)>0;
      return {
        customerKey:`court:${courtId}`,
        sourceLeadId,
        leadId:sourceLeadId,
        studentId:'',
        courtId,
        membershipAccountId:'',
        displayName:cleanLeadText(item?.displayName||''),
        phone:cleanLeadText(item?.phone||''),
        source:'',
        campus:cleanLeadText(item?.campusCode||item?.campusName||''),
        owner:cleanLeadText(item?.owner||''),
        customerType:'',
        demandProduct:'',
        trialAtRaw:'',
        trialBookedAt:'',
        trialAttendedAt:'',
        courseFirstPurchaseAt:'',
        conversionAt:cleanLeadText(item?.lastBookingDate||item?.createdAt||''),
        formalCoach:'',
        profileNote:cleanLeadText(item?.notesSummary||item?.linkedStudentSummary||''),
        notes:cleanLeadText(item?.notesSummary||item?.linkedStudentSummary||''),
        studentStage:'none',
        courseDealPath:'',
        trialStatus:'',
        coursePurchaseCount:0,
        hasCourseRepeatPurchase:false,
        hasTrialToCourseConversion:false,
        courtStage:hasMembershipConversion?'member':(hasBookingConversion?'booking':'none'),
        membershipStatus,
        hasTrialExperience:false,
        hasTeachingSummarySnapshot:false,
        hasTrialAttended:false,
        hasFormalAttended:false,
        hasScheduleRecord:hasBookingConversion,
        hasCourseStudentEntry:false,
        hasFreeCourseFollowup:false,
        leadDate:cleanLeadText(item?.lastBookingDate||item?.createdAt||item?.indexGeneratedAt||''),
        createdAt:cleanLeadText(item?.indexGeneratedAt||item?.createdAt||''),
        hasCourseConversion:false,
        hasBookingConversion,
        hasMembershipConversion
      };
    }).filter(Boolean);
  }

  function visibleLeadSourceRows(rows=[]){
    return (rows||[]).filter(row=>{
      if(['merged','voided','deleted'].includes(cleanLeadText(row?.status)))return false;
      const name=leadDisplayNameText(row);
      if(typeof isNonPersonLeadName==='function'&&isNonPersonLeadName(name)&&!cleanLeadText(row?.phone))return false;
      return true;
    });
  }

  function stableLeadCreateHash(value){
    let hash=2166136261;
    for(const ch of String(value||'')){
      hash^=ch.charCodeAt(0);
      hash=Math.imul(hash,16777619);
    }
    return (hash>>>0).toString(36);
  }

  function leadCreateStableId(lead){
    if(typeof buildLeadDedupKey!=='function')return '';
    const key=buildLeadDedupKey(lead);
    return key?`lead-manual-${stableLeadCreateHash(key)}`:'';
  }

  function leadIdentityName(value=''){
    return cleanLeadText(value)
      .toLowerCase()
      .replace(/\s+/g,'')
      .replace(/[·.。_\-\/|｜，,;；]/g,'');
  }

  function leadDisplayNameText(lead={}){
    return cleanLeadText(lead.displayName||lead.wechatName||lead.name);
  }

  function leadNameKey(lead={}){
    return leadIdentityName(leadDisplayNameText(lead));
  }

  function buildLeadNameIndex(rows=[]){
    const index=new Map();
    visibleLeadSourceRows(rows).forEach(row=>{
      const key=leadNameKey(row);
      if(!key)return;
      const list=index.get(key)||[];
      list.push(row);
      index.set(key,list);
    });
    return index;
  }

  function findUniqueLeadByName(lead={},rowsOrIndex=[]){
    if(cleanLeadText(lead.phone))return null;
    const key=leadNameKey(lead);
    if(!key)return null;
    const rows=rowsOrIndex instanceof Map?(rowsOrIndex.get(key)||[]):(buildLeadNameIndex(rowsOrIndex).get(key)||[]);
    return rows.length===1?rows[0]:null;
  }

  function earliestDuplicateLead(lead,rows=[]){
    if(typeof buildLeadDedupKey!=='function')return null;
    const key=buildLeadDedupKey(lead);
    const matches=visibleLeadSourceRows(rows).filter(row=>buildLeadDedupKey(row)===key);
    return matches.sort((a,b)=>
      String(a.createdAt||a.leadDate||'').localeCompare(String(b.createdAt||b.leadDate||''))||
      String(a.id||'').localeCompare(String(b.id||''))
    )[0]||null;
  }

  async function findExistingDuplicateLead(lead){
    if(!lead?.id)return null;
    const byId=typeof get==='function'?await get(T_LEADS,lead.id).catch(()=>null):null;
    if(byId&&!['merged','voided','deleted'].includes(cleanLeadText(byId.status)))return byId;
    const rows=typeof scan==='function'?await scan(T_LEADS).catch(()=>[]):[];
    return earliestDuplicateLead(lead,rows)||findUniqueLeadByName(lead,rows);
  }

  function hiddenLeadIdentitySets(rows=[]){
    const ids=new Set();
    const studentIds=new Set();
    (rows||[])
      .filter(row=>['merged','voided','deleted'].includes(cleanLeadText(row?.status)))
      .forEach(row=>{
        [row?.id,row?.sourceLeadId,row?.leadId].map(cleanLeadText).filter(Boolean).forEach(id=>ids.add(id));
        [row?.studentId,row?.formalStudentId,row?.courseStudentId].map(cleanLeadText).filter(Boolean).forEach(id=>studentIds.add(id));
      });
    return {ids,studentIds};
  }

  async function readLeadMergeData(){
    const [
      leads,followups,students,courts,membershipAccounts,purchases,entitlements,schedule,membershipOrders,
      entitlementLedger,membershipBenefitLedger,membershipAccountEvents,financialLedger,plans,classes,feedbacks
    ]=await Promise.all([
      scan(T_LEADS).catch(()=>[]),
      T_LEAD_FOLLOWUPS?scan(T_LEAD_FOLLOWUPS).catch(()=>[]):Promise.resolve([]),
      T_STUDENTS?scan(T_STUDENTS).catch(()=>[]):Promise.resolve([]),
      T_COURTS?scan(T_COURTS).catch(()=>[]):Promise.resolve([]),
      T_MEMBERSHIP_ACCOUNTS?scan(T_MEMBERSHIP_ACCOUNTS).catch(()=>[]):Promise.resolve([]),
      T_PURCHASES?scan(T_PURCHASES).catch(()=>[]):Promise.resolve([]),
      T_ENTITLEMENTS?scan(T_ENTITLEMENTS).catch(()=>[]):Promise.resolve([]),
      T_SCHEDULE?scan(T_SCHEDULE).catch(()=>[]):Promise.resolve([]),
      T_MEMBERSHIP_ORDERS?scan(T_MEMBERSHIP_ORDERS).catch(()=>[]):Promise.resolve([]),
      T_ENTITLEMENT_LEDGER?scan(T_ENTITLEMENT_LEDGER).catch(()=>[]):Promise.resolve([]),
      T_MEMBERSHIP_BENEFIT_LEDGER?scan(T_MEMBERSHIP_BENEFIT_LEDGER).catch(()=>[]):Promise.resolve([]),
      T_MEMBERSHIP_ACCOUNT_EVENTS?scan(T_MEMBERSHIP_ACCOUNT_EVENTS).catch(()=>[]):Promise.resolve([]),
      T_FINANCIAL_LEDGER?scan(T_FINANCIAL_LEDGER).catch(()=>[]):Promise.resolve([]),
      T_PLANS?scan(T_PLANS).catch(()=>[]):Promise.resolve([]),
      T_CLASSES?scan(T_CLASSES).catch(()=>[]):Promise.resolve([]),
      T_FEEDBACKS?scan(T_FEEDBACKS).catch(()=>[]):Promise.resolve([])
    ]);
    return {
      leads,followups,students,courts,membershipAccounts,purchases,entitlements,schedule,membershipOrders,
      entitlementLedger,membershipBenefitLedger,membershipAccountEvents,financialLedger,plans,classes,feedbacks
    };
  }

  function leadMergeSummary(plan){
    return {
      primaryLeadId:plan.primaryLeadId,
      mergeLeadIds:plan.mergeLeadIds,
      primaryLead:plan.primaryUpdate,
      duplicateLeads:plan.duplicateLeadUpdates,
      studentProfileMerge:plan.studentProfileMerge,
      conflicts:plan.conflicts,
      counts:plan.counts
    };
  }

  function lifecycleSourcePatch(row,lead,now){
    const sourceLeadId=cleanLeadText(row?.sourceLeadId||row?.leadId||row?.fromLeadId||lead?.id);
    if(!row?.id||!sourceLeadId||cleanLeadText(row.sourceLeadId)===sourceLeadId)return null;
    return {...row,sourceLeadId,updatedAt:now};
  }

  async function ensureLifecycleSourceLink(table,row,lead,now){
    const next=lifecycleSourcePatch(row,lead,now);
    if(!next)return row;
    await put(table,next.id,next);
    return next;
  }

  function leadDealParts(lead={}){
    const deal=cleanLeadText(lead.dealType||lead.conversionType);
    return new Set(deal.split('+').map(cleanLeadText).filter(Boolean));
  }

  function leadHasConvertedDeal(lead={}){
    const stage=cleanLeadText(lead.leadStage||lead.systemStatus||lead.rawStatus||lead.status);
    if(/未成交|未转化/.test(stage))return false;
    return stage==='已成交'&&leadDealParts(lead).size>0;
  }

  function leadHasConvertedOutcome(lead={}){
    const stage=cleanLeadText(lead.leadStage||lead.systemStatus||lead.rawStatus||lead.status);
    return leadHasConvertedDeal(lead)||stage==='已成交'||lead.convertedFlag===true||lead.isCourseConverted===true||lead.isCourtConverted===true||lead.isMembershipConverted===true||!!cleanLeadText(lead.dealType||lead.conversionType);
  }

  function sourceLeadId(row={}){
    return cleanLeadText(row.sourceLeadId||row.leadId||row.fromLeadId);
  }

  function leadHasBusinessLinks(lead={},data={}){
    const leadId=cleanLeadText(lead.id);
    if(cleanLeadText(lead.studentId)||cleanLeadText(lead.courtId)||cleanLeadText(lead.membershipAccountId))return true;
    return [data.students,data.courts,data.membershipAccounts].some(rows=>(rows||[]).some(row=>sourceLeadId(row)===leadId));
  }

  async function readLeadDeleteData(){
    const [followups,students,courts,membershipAccounts]=await Promise.all([
      T_LEAD_FOLLOWUPS?scan(T_LEAD_FOLLOWUPS).catch(()=>[]):Promise.resolve([]),
      T_STUDENTS?scan(T_STUDENTS).catch(()=>[]):Promise.resolve([]),
      T_COURTS?scan(T_COURTS).catch(()=>[]):Promise.resolve([]),
      T_MEMBERSHIP_ACCOUNTS?scan(T_MEMBERSHIP_ACCOUNTS).catch(()=>[]):Promise.resolve([])
    ]);
    return {followups,students,courts,membershipAccounts};
  }

  function fallbackId(prefix,lead={},linkedId=''){
    const source=cleanLeadText(lead.id||linkedId||Date.now());
    return `${prefix}-${source.replace(/[^a-zA-Z0-9_-]/g,'-')}`;
  }

  async function ensureDealStudent(lead={},now,preferredStudentId=''){
    if(!T_STUDENTS)return {student:null,created:false};
    if(cleanLeadText(lead.studentId)){
      let student=await get(T_STUDENTS,lead.studentId).catch(()=>null);
      if(student)student=await ensureLifecycleSourceLink(T_STUDENTS,student,lead,now);
      return {student,created:false};
    }
    let student=preferredStudentId?await get(T_STUDENTS,preferredStudentId).catch(()=>null):null;
    if(!student){
      const studentMatch=matchLeadToStudent?matchLeadToStudent(lead,await scan(T_STUDENTS).catch(()=>[])):{matchType:'none',record:null};
      student=studentMatch.record||null;
    }
    let created=false;
    if(!student){
      student=buildLeadStudentRecord(lead,{now});
      await put(T_STUDENTS,student.id,student);
      created=true;
    }
    student=await ensureLifecycleSourceLink(T_STUDENTS,student,lead,now);
    return {student,created};
  }

  async function ensureDealCourt(lead={},now,{studentId='',preferredCourtId=''}={}){
    if(!T_COURTS)return {court:null,created:false};
    if(cleanLeadText(lead.courtId)){
      let court=await get(T_COURTS,lead.courtId).catch(()=>null);
      if(court)court=await ensureLifecycleSourceLink(T_COURTS,court,lead,now);
      return {court,created:false};
    }
    let court=preferredCourtId?await get(T_COURTS,preferredCourtId).catch(()=>null):null;
    if(!court){
      const courtRows=(await scan(T_COURTS).catch(()=>[])).filter(row=>String(row.status||'active')!=='inactive');
      const courtMatch=matchLeadToCourt?matchLeadToCourt(lead,courtRows):{matchType:'none',record:null};
      court=courtMatch.record||null;
    }
    let created=false;
    if(!court){
      court=buildLeadCourtRecord(lead,{studentId,now});
      await put(T_COURTS,court.id,court);
      created=true;
    }
    court=await ensureLifecycleSourceLink(T_COURTS,court,lead,now);
    return {court,created};
  }

  function buildLeadMembershipAccountRecord(lead={},court={},now){
    const id=(typeof uuidv4==='function'?uuidv4():fallbackId('membership-from-lead',lead,court.id));
    return {
      id,
      courtId:cleanLeadText(court.id||court.courtId),
      courtName:cleanLeadText(court.name||court.courtName||lead.displayName||lead.wechatName),
      phone:cleanLeadText(court.phone||lead.phone),
      status:'active',
      sourceLeadId:cleanLeadText(lead.id),
      memberLabel:'线索成交待开卡',
      createdAt:now,
      updatedAt:now
    };
  }

  async function ensureDealMembershipAccount(lead={},court={},now){
    if(!T_MEMBERSHIP_ACCOUNTS||!cleanLeadText(court?.id))return {membershipAccount:null,created:false};
    const rows=await scan(T_MEMBERSHIP_ACCOUNTS).catch(()=>[]);
    let membershipAccount=(rows||[]).find(account=>String(account.courtId||'')===String(court.id)&&account.status!=='voided')||null;
    if(membershipAccount){
      membershipAccount=await ensureLifecycleSourceLink(T_MEMBERSHIP_ACCOUNTS,membershipAccount,lead,now);
      return {membershipAccount,created:false};
    }
    membershipAccount=buildLeadMembershipAccountRecord(lead,court,now);
    await put(T_MEMBERSHIP_ACCOUNTS,membershipAccount.id,membershipAccount);
    return {membershipAccount,created:true};
  }

  async function materializeLeadConversionIdentities(lead={},options={}){
    if(!lead?.id||!leadHasConvertedDeal(lead))return {lead,student:null,court:null,membershipAccount:null,created:{student:false,court:false,membershipAccount:false},changed:false};
    const parts=leadDealParts(lead);
    const needsStudent=parts.has('课程')||parts.has('陪打');
    const needsCourt=parts.has('订场')||parts.has('订场会员');
    const needsMembership=parts.has('订场会员');
    if(!needsStudent&&!needsCourt&&!needsMembership)return {lead,student:null,court:null,membershipAccount:null,created:{student:false,court:false,membershipAccount:false},changed:false};
    const now=options.now||new Date().toISOString();
    let nextLead={...lead};
    let student=null,court=null,membershipAccount=null;
    const created={student:false,court:false,membershipAccount:false};
    if(needsStudent){
      const result=await ensureDealStudent(nextLead,now,options.studentId||'');
      student=result.student;
      created.student=result.created;
      if(student?.id)nextLead={...nextLead,studentId:student.id};
    }
    if(needsCourt){
      const result=await ensureDealCourt(nextLead,now,{studentId:nextLead.studentId||'',preferredCourtId:options.courtId||''});
      court=result.court;
      created.court=result.created;
      if(court?.id)nextLead={...nextLead,courtId:court.id};
    }
    if(needsMembership&&court?.id){
      const result=await ensureDealMembershipAccount(nextLead,court,now);
      membershipAccount=result.membershipAccount;
      created.membershipAccount=result.created;
      if(membershipAccount?.id)nextLead={...nextLead,membershipAccountId:membershipAccount.id};
    }
    const normalized=normalizeLeadRecord({
      ...nextLead,
      isCourseConverted:nextLead.isCourseConverted===true||needsStudent,
      isCourtConverted:nextLead.isCourtConverted===true||needsCourt,
      isMembershipConverted:nextLead.isMembershipConverted===true||!!nextLead.membershipAccountId,
      createdAt:lead.createdAt
    },{id:lead.id,now});
    const changed=['studentId','courtId','membershipAccountId','isCourseConverted','isCourtConverted','isMembershipConverted'].some(key=>String(normalized[key]??'')!==String(lead[key]??''));
    if(changed&&options.persist!==false)await put(T_LEADS,lead.id,normalized);
    return {lead:normalized,student,court,membershipAccount,created,changed};
  }

  async function materializeLeadConversionRows(leads=[],options={}){
    if(options.persist===false)return leads||[];
    const next=[];
    for(const lead of leads||[]){
      const result=await materializeLeadConversionIdentities(lead,options);
      next.push(result.lead);
    }
    return next;
  }

  function syntheticLeadIdForLifecycle(row={}){
    const studentId=cleanLeadText(row.studentId);
    return studentId?`lead-from-student-${studentId}`:'';
  }

  function isSyntheticStudentLeadId(id){
    return /^lead-from-student-/.test(cleanLeadText(id));
  }

  function studentIdFromSyntheticLeadId(id){
    const raw=cleanLeadText(id);
    return isSyntheticStudentLeadId(raw)?raw.slice('lead-from-student-'.length):'';
  }

  function realLeadIdForSyntheticStudent(studentId){
    const id=cleanLeadText(studentId);
    return id?`lead-${id}`:'';
  }

  function buildSyntheticLeadRecord(row={},id,now){
    const leadDate=cleanLeadText(row.firstTouchAt||row.leadEnteredAt||row.leadDate||row.trialAtRaw||row.courseFirstPurchaseAt||row.conversionAt);
    const raw={
      id,
      displayName:cleanLeadText(row.displayName),
      name:cleanLeadText(row.displayName),
      wechatName:cleanLeadText(row.displayName),
      phone:cleanLeadText(row.phone),
      source:cleanLeadText(row.source),
      campus:cleanLeadText(row.campus),
      customerType:cleanLeadText(row.customerType),
      demandProduct:cleanLeadText(row.demandProduct),
      consultType:cleanLeadText(row.demandProduct),
      profileNote:'',
      owner:cleanLeadText(row.owner),
      leadDate,
      trialAtRaw:cleanLeadText(row.trialAtRaw),
      enrollAtRaw:cleanLeadText(row.courseFirstPurchaseAt),
      formalCoach:cleanLeadText(row.formalCoach),
      studentId:cleanLeadText(row.studentId),
      createdAt:cleanLeadText(row.createdAt)||now,
      updatedAt:now
    };
    return normalizeLeadRecord?normalizeLeadRecord(raw,{id,now}):raw;
  }

  async function visibleSyntheticLeadById(leadId){
    const id=cleanLeadText(leadId);
    const studentId=studentIdFromSyntheticLeadId(id);
    if(!id||!studentId)return null;
    const context=await readVisibleLeadContext({expandLifecycleSearch:true}).catch(()=>null);
    return (context?.rows||[]).find(row=>{
      return cleanLeadText(row?.id)===id||cleanLeadText(row?.studentId)===studentId;
    })||null;
  }

  async function syntheticLeadForStudentLeadId(leadId,now){
    const id=cleanLeadText(leadId);
    const studentId=studentIdFromSyntheticLeadId(id);
    if(!studentId||!T_STUDENTS||typeof get!=='function')return null;
    const student=await get(T_STUDENTS,studentId).catch(()=>null);
    if(!student)return null;
    const visible=await visibleSyntheticLeadById(id);
    const leadDate=cleanLeadText(visible?.leadDate||visible?.firstTouchAt||student.leadDate||'');
    const raw={
      ...(visible||{}),
      id,
      displayName:cleanLeadText(visible?.displayName||student.displayName||student.name||student.wechatName),
      name:cleanLeadText(visible?.name||student.name||student.displayName||student.wechatName),
      wechatName:cleanLeadText(visible?.wechatName||student.wechatName||student.name||student.displayName),
      phone:cleanLeadText(visible?.phone||student.phone),
      source:cleanLeadText(visible?.source||student.source),
      campus:cleanLeadText(visible?.campus||student.campus),
      customerType:cleanLeadText(visible?.customerType||student.customerType||student.type),
      demandProduct:cleanLeadText(visible?.demandProduct||visible?.consultType||student.demandProduct||student.consultType),
      consultType:cleanLeadText(visible?.consultType||visible?.demandProduct||student.consultType||student.demandProduct),
      profileNote:cleanLeadText(visible?.profileNote||student.profileNote||student.notes),
      owner:cleanLeadText(visible?.owner||student.owner||student.primaryCoach),
      leadDate,
      firstTouchAt:cleanLeadText(visible?.firstTouchAt||leadDate),
      leadEnteredAt:cleanLeadText(visible?.leadEnteredAt||leadDate),
      studentId,
      isCourseConverted:true,
      createdAt:cleanLeadText(visible?.createdAt||student.createdAt||now),
      updatedAt:now
    };
    const normalized=normalizeLeadRecord?normalizeLeadRecord(raw,{id,now}):raw;
    return {
      ...normalized,
      id,
      leadDate,
      firstTouchAt:cleanLeadText(raw.firstTouchAt),
      leadEnteredAt:cleanLeadText(raw.leadEnteredAt),
      studentId,
      isLifecycleSynthetic:true
    };
  }

  async function resolveSyntheticLeadSaveTarget(leadId,body={},now){
    const studentId=studentIdFromSyntheticLeadId(leadId);
    if(!studentId||!T_STUDENTS||typeof get!=='function')return null;
    const student=await get(T_STUDENTS,studentId).catch(()=>null);
    if(!student)return null;
    const linkedLeadId=cleanLeadText(student.sourceLeadId||student.leadId||student.fromLeadId);
    if(linkedLeadId&&!isSyntheticStudentLeadId(linkedLeadId)){
      const linkedLead=await get(T_LEADS,linkedLeadId).catch(()=>null);
      if(linkedLead)return {lead:linkedLead,student,targetLeadId:linkedLeadId,created:false};
    }
    const synthetic=await syntheticLeadForStudentLeadId(leadId,now);
    if(!synthetic)return null;
    const targetLeadId=realLeadIdForSyntheticStudent(studentId);
    if(!targetLeadId)return null;
    const lead={
      ...synthetic,
      ...body,
      id:targetLeadId,
      studentId,
      sourceLeadId:targetLeadId,
      isLifecycleSynthetic:false,
      createdAt:now,
      updatedAt:now
    };
    return {lead,student,targetLeadId,created:true};
  }

  function groupLeadFollowupsByLeadId(followups=[]){
    const map=new Map();
    for(const row of followups||[]){
      const leadId=cleanLeadText(row?.leadId);
      if(!leadId)continue;
      const list=map.get(leadId)||[];
      list.push(row);
      map.set(leadId,list);
    }
    return map;
  }

  function applyCurrentLeadSnapshots(leads=[],followups=[]){
    if(typeof applyLeadFollowupsSnapshot!=='function')return leads||[];
    const followupsByLeadId=groupLeadFollowupsByLeadId(followups);
    return (leads||[]).map(lead=>{
      const leadId=cleanLeadText(lead?.id);
      const rows=leadId?followupsByLeadId.get(leadId):null;
      return rows?.length?applyLeadFollowupsSnapshot(lead,rows):lead;
    });
  }

  async function readLeadFollowupRows(){
    if(!T_LEAD_FOLLOWUPS)return [];
    if(isLocalPreviewFastMode())return [];
    if(isProductionRuntime()){
      if(typeof scanFirstRows!=='function')return [];
      return scanFirstRows(T_LEAD_FOLLOWUPS,{
        limit:PRODUCTION_PAGE_READ_LIMITS?.leadFollowups,
        columns:LEAD_FOLLOWUP_LIST_PROJECTION_FIELDS
      }).catch(()=>[]);
    }
    if(typeof getCachedScan!=='function')return [];
    return getCachedScan(T_LEAD_FOLLOWUPS,{columns:LEAD_FOLLOWUP_LIST_PROJECTION_FIELDS}).catch(()=>[]);
  }

  async function applyPersistedLeadSnapshot(lead){
    const leadId=cleanLeadText(lead?.id);
    if(!leadId||!T_LEAD_FOLLOWUPS||typeof scan!=='function'||typeof applyLeadFollowupsSnapshot!=='function')return lead;
    const rows=(await scan(T_LEAD_FOLLOWUPS).catch(()=>[])).filter(row=>cleanLeadText(row.leadId)===leadId);
    return rows.length?applyLeadFollowupsSnapshot(lead,rows):lead;
  }

  async function applyLeadDisplaySnapshot(lead,options={}){
    const leadId=cleanLeadText(options.leadId||lead?.id||lead?.sourceLeadId||lead?.leadId);
    if(!leadId)return lead;
    try{
      const context=await readVisibleLeadContext({expandLifecycleSearch:true});
      const visible=(context?.rows||[]).find(row=>{
        const rowId=cleanLeadText(row?.id);
        const sourceLeadId=cleanLeadText(row?.sourceLeadId||row?.leadId);
        return rowId===leadId||sourceLeadId===leadId;
      });
      if(!visible)return lead;
      const visibleLeadDate=cleanLeadText(visible.leadDate||visible.firstTouchAt);
      const leadDate=visibleLeadDate||cleanLeadText(lead?.leadDate||lead?.leadEnteredAt||lead?.firstTouchAt);
      return {
        ...lead,
        id:lead?.id||visible.id||leadId,
        leadDate,
        leadEnteredAt:leadDate||cleanLeadText(lead?.leadEnteredAt||''),
        firstTouchAt:cleanLeadText(visible.firstTouchAt||lead?.firstTouchAt||'')
      };
    }catch(error){
      console.warn('lead display snapshot skipped',error?.message||error);
      return lead;
    }
  }

  async function materializeStudentLifecycleLeads(mergedLeads=[],customerLifecycleRows=[],options={}){
    const existingIds=new Set((mergedLeads||[]).map(row=>cleanLeadText(row.id)).filter(Boolean));
    const existingStudentIds=new Set((mergedLeads||[]).map(row=>cleanLeadText(row.studentId)).filter(Boolean));
    const now=new Date().toISOString();
    const created=[];
    for(const row of customerLifecycleRows||[]){
      const studentId=cleanLeadText(row.studentId);
      if(!studentId||cleanLeadText(row.sourceLeadId)||existingStudentIds.has(studentId))continue;
      const id=syntheticLeadIdForLifecycle(row);
      if(!id||existingIds.has(id))continue;
      const lead=buildSyntheticLeadRecord(row,id,now);
      if(options.persist!==false)await put(T_LEADS,id,lead);
      created.push(lead);
      existingIds.add(id);
      existingStudentIds.add(studentId);
    }
    return created;
  }

  async function readLeadPoolContext({lifecycleScope='all'}={}){
    const [leads,followups]=await Promise.all([
      readCachedLeadSourceRows(),
      withLeadReadTimeout(readLeadFollowupRows().catch(()=>[]), 'lead followups').catch(error=>{
        if(error?.code==='LEAD_LIST_READ_TIMEOUT'){
          leadAuxiliaryRowsUnavailable=true;
          console.warn('[leads-list] lead followup read unavailable, serving cached or empty rows',error.message||error);
          return [];
        }
        throw error;
      })
    ]);
    const leadSourceUnavailable=leadSourceRowsUnavailable || leadAuxiliaryRowsUnavailable;
    const hiddenLeadIdentities=hiddenLeadIdentitySets(leads);
    let mergedLeads=await materializeLeadConversionRows(mergeDuplicateLeadRows(applyCurrentLeadSnapshots(visibleLeadSourceRows(leads),followups)),{persist:false});
    let customerLifecycleRows=[];
    let studentSummaryRows=[];
    let studentTeachingSummaryUnavailable=false;
    const useLightLifecycleSource=!isLocalPreviewFastMode()&&!!(T_STUDENT_TEACHING_SUMMARY&&T_COURT_ACCOUNT_LIST_INDEX&&typeof getCachedScan==='function'&&typeof buildCourtAccountListViewFromIndexRows==='function');
    if(useLightLifecycleSource){
      const [studentSummaryResult,courtIndexResult]=await Promise.allSettled([
        readReadyStudentTeachingSummaryRows({tableName:T_STUDENT_TEACHING_SUMMARY,getCachedScan,getCachedRow,scanByIdPrefix}),
        withLeadReadTimeout(getCachedScan(T_COURT_ACCOUNT_LIST_INDEX).catch(()=>[]), 'court account list index').catch(error=>{
          if(error?.code==='LEAD_LIST_READ_TIMEOUT'){
            leadAuxiliaryRowsUnavailable=true;
            console.warn('[leads-list] court account list index unavailable, serving cached or empty rows',error.message||error);
            return [];
          }
          throw error;
        })
      ]);
      if(studentSummaryResult.status==='fulfilled'){
        studentSummaryRows=studentSummaryResult.value;
      }else if(studentSummaryResult.reason?.code==='STUDENT_TEACHING_SUMMARY_NOT_READY'){
        studentTeachingSummaryUnavailable=true;
        console.warn('[leads-list] student teaching summary unavailable, serving leads without student summary',studentSummaryResult.reason?.message||studentSummaryResult.reason);
      }else{
        throw studentSummaryResult.reason;
      }
      const courtIndexRows=courtIndexResult.status==='fulfilled'?courtIndexResult.value:[];
      if(studentSummaryRows.length){
        const studentLifecycleRows=buildCustomerCenterSummaryLifecycleRows(studentSummaryRows);
        const courtAccountView=buildCourtAccountListViewFromIndexRows(courtIndexRows||[],{});
        const courtLifecycleRows=buildCourtLifecycleRows(courtAccountView.items||[],mergedLeads);
        customerLifecycleRows=[...studentLifecycleRows,...courtLifecycleRows];
        const createdLeads=await materializeStudentLifecycleLeads(mergedLeads,customerLifecycleRows,{persist:false});
        if(createdLeads.length){
          mergedLeads=mergeDuplicateLeadRows([...mergedLeads,...createdLeads]);
        }
      }
    }
    if(!studentSummaryRows.length){
      studentSummaryRows=customerLifecycleRows.filter(row=>cleanLeadText(row?.studentId));
    }
    const rows=buildLeadPoolRows({leads:mergedLeads,customerLifecycleRows,lifecycleScope,mergeDuplicates:true})
      .filter(row=>!hiddenLeadIdentities.ids.has(cleanLeadText(row.id))&&!hiddenLeadIdentities.ids.has(cleanLeadText(row.sourceLeadId)))
      .filter(row=>{
        const sourceLeadId=cleanLeadText(row.sourceLeadId);
        if(sourceLeadId&&!/^lead-from-student-/.test(sourceLeadId))return true;
        return !hiddenLeadIdentities.studentIds.has(cleanLeadText(row.studentId));
      });
    return {rows,studentSummaryRows,customerLifecycleRows,studentTeachingSummaryUnavailable,leadSourceUnavailable:leadSourceUnavailable||leadAuxiliaryRowsUnavailable};
  }

  async function readVisibleLeadRows({expandLifecycleSearch=false}={}){
    const context=await readLeadPoolContext({lifecycleScope:expandLifecycleSearch?'all':'course'});
    return context.rows;
  }

  async function readVisibleLeadContext({expandLifecycleSearch=false}={}){
    return readLeadPoolContext({lifecycleScope:expandLifecycleSearch?'all':'course'});
  }

  async function readFastVisibleLeadRows(){
    const rows=await readCachedLeadSourceRows();
    return mergeDuplicateLeadRows(visibleLeadSourceRows(rows));
  }

  async function ensureLeadTablesForRequest(){
    if(typeof isProductionRuntime==='function'&&isProductionRuntime())return;
    if(typeof ensureLeadTables==='function')await ensureLeadTables();
  }

  return async function handleLeadsRoutes({path,method,body,user,res,query}){
    if(path==='/lead-followups'&&method==='GET'){
      if(user.role!=='admin')return sendJson(res,{error:'无权限'},403);
      await init();
      await ensureLeadTablesForRequest();
      const leadId=cleanLeadText(query.get('leadId'));
      const rows=isProductionRuntime()?await scanFirstRows(T_LEAD_FOLLOWUPS,{limit:PRODUCTION_PAGE_READ_LIMITS.leadFollowups,columns:LEAD_FOLLOWUP_LIST_PROJECTION_FIELDS}).catch(()=>[]):await getCachedScan(T_LEAD_FOLLOWUPS,{columns:LEAD_FOLLOWUP_LIST_PROJECTION_FIELDS}).catch(()=>[]);
      if(!isCampusScopedAdmin(user))return sendJson(res,leadId?rows.filter(row=>String(row.leadId||'')===leadId):rows);
      const leads=await readLeadSourceRows({isProductionRuntime,scanFirstRows,getCachedScan,table:T_LEADS,columns:LEAD_LIST_PROJECTION_FIELDS});
      const scoped=filterLoadAllForUser({leads,leadFollowups:rows},user).leadFollowups;
      return sendJson(res,leadId?scoped.filter(row=>String(row.leadId||'')===leadId):scoped);
    }
    if(path==='/leads'){
      if(user.role!=='admin')return sendJson(res,{error:'无权限'},403);
      if(!(method==='GET'&&isLocalPreviewFastMode()))await init();
      if(method!=='GET')await ensureLeadTablesForRequest();
      if(method==='GET'){
        try{
          const filterState=buildLeadListFilterState(query);
          const paging=parseLeadPaging(query);
          const responseCacheKey=paging?leadPagedResponseCacheKey(query,user):'';
          const cachedResponse=responseCacheKey?readLeadPagedResponseCache(responseCacheKey):null;
          if(cachedResponse)return sendJson(res,cachedResponse);
          const resultCacheKey=paging?leadFilteredResultCacheKey(query,user):'';
          let cachedResult=resultCacheKey?readLeadFilteredResultCache(resultCacheKey):null;
          if(!cachedResult){
            const {rows,studentSummaryRows,studentTeachingSummaryUnavailable,leadSourceUnavailable}=await readVisibleLeadContext({expandLifecycleSearch:false});
            const visibleRows=filterLoadAllForUser({leads:rows},user).leads;
            const filtered=visibleRows.filter(row=>leadMatchesListFilter(row,filterState));
            const scopedSummaryRows=filterLoadAllForUser({studentTeachingSummaries:studentSummaryRows},user).studentTeachingSummaries||[];
            cachedResult={sorted:sortLeadListRows(filtered,query),summary:buildLeadListSummary(filtered,{studentTeachingSummaryRows:scopedSummaryRows,filterState}),filters:buildLeadListFilterMeta(visibleRows,filterState)};
            if(studentTeachingSummaryUnavailable)cachedResult.summary.studentTeachingSummaryUnavailable=true;
            if(leadSourceUnavailable)cachedResult.summary.leadSourceUnavailable=true;
            if(resultCacheKey)writeLeadFilteredResultCache(resultCacheKey,cachedResult);
          }
          const payload=paging?{...buildLeadListPage(cachedResult.sorted,paging),summary:cachedResult.summary,filters:cachedResult.filters}:cachedResult.sorted;
          if(responseCacheKey)writeLeadPagedResponseCache(responseCacheKey,payload);
          return sendJson(res,payload);
        }catch(err){
          if(err?.code==='STUDENT_TEACHING_SUMMARY_NOT_READY'){
            return sendJson(res,{error:err.message,code:err.code},err.statusCode||503);
          }
          throw err;
        }
      }
      if(method==='POST'){
        const now=new Date().toISOString();
        const draft=normalizeLeadRecord({...body,createdAt:now,updatedAt:now},{now});
        const stableId=cleanLeadText(body.id)?'':leadCreateStableId(draft);
        const lead=stableId?normalizeLeadRecord({...body,id:stableId,createdAt:now,updatedAt:now},{id:stableId,now}):draft;
        const existing=await findExistingDuplicateLead(lead);
        if(existing)return sendJson(res,{lead:existing,followup:null,duplicate:true});
        const materialized=await materializeLeadConversionIdentities(lead,{now});
        if(!materialized.changed)await put(T_LEADS,lead.id,lead);
        const followup=body.createInitialFollowup===false?null:buildLeadInitialFollowup(lead);
        if(followup)await put(T_LEAD_FOLLOWUPS,followup.id,followup);
        clearLeadListCaches();
        return sendJson(res,{lead:materialized.lead,followup});
      }
    }
    if(path==='/leads/merge-preview'&&method==='POST'){
      if(user.role!=='admin')return sendJson(res,{error:'无权限'},403);
      await init();
      await ensureLeadTablesForRequest();
      try{
        const plan=buildLeadMergePlan({
          primaryLeadId:body.primaryLeadId,
          mergeLeadIds:body.mergeLeadIds,
          data:await readLeadMergeData(),
          finalLeadStage:body.finalLeadStage,
          operator:user.name||''
        });
        return sendJson(res,leadMergeSummary(plan));
      }catch(error){
        return sendJson(res,{error:error.message||'线索合并预览失败'},error.statusCode||400);
      }
    }
    if(path==='/leads/merge'&&method==='POST'){
      if(user.role!=='admin')return sendJson(res,{error:'无权限'},403);
      await init();
      await ensureLeadTablesForRequest();
      try{
        const plan=buildLeadMergePlan({
          primaryLeadId:body.primaryLeadId,
          mergeLeadIds:body.mergeLeadIds,
          data:await readLeadMergeData(),
          finalLeadStage:body.finalLeadStage,
          operator:user.name||''
        });
        await put(T_LEADS,plan.primaryUpdate.id,plan.primaryUpdate);
        for(const row of plan.movedFollowups)await put(T_LEAD_FOLLOWUPS,row.id,row);
        for(const row of plan.duplicateLeadUpdates)await put(T_LEADS,row.id,row);
        for(const row of plan.studentSourceUpdates)await put(T_STUDENTS,row.id,row);
        if(plan.studentProfileMerge?.targetStudentUpdate)await put(T_STUDENTS,plan.studentProfileMerge.targetStudentUpdate.id,plan.studentProfileMerge.targetStudentUpdate);
        for(const row of plan.studentProfileMerge?.sourceStudentUpdates||[])await put(T_STUDENTS,row.id,row);
        for(const row of plan.courtSourceUpdates)await put(T_COURTS,row.id,row);
        for(const row of plan.membershipSourceUpdates)await put(T_MEMBERSHIP_ACCOUNTS,row.id,row);
        for(const row of plan.studentProfileMerge?.referenceUpdates?.purchases||[])await put(T_PURCHASES,row.id,row);
        for(const row of plan.studentProfileMerge?.referenceUpdates?.entitlements||[])await put(T_ENTITLEMENTS,row.id,row);
        for(const row of plan.studentProfileMerge?.referenceUpdates?.entitlementLedger||[])await put(T_ENTITLEMENT_LEDGER,row.id,row);
        for(const row of plan.studentProfileMerge?.referenceUpdates?.schedule||[])await put(T_SCHEDULE,row.id,row);
        for(const row of plan.studentProfileMerge?.referenceUpdates?.membershipOrders||[])await put(T_MEMBERSHIP_ORDERS,row.id,row);
        for(const row of plan.studentProfileMerge?.referenceUpdates?.membershipBenefitLedger||[])await put(T_MEMBERSHIP_BENEFIT_LEDGER,row.id,row);
        for(const row of plan.studentProfileMerge?.referenceUpdates?.membershipAccountEvents||[])await put(T_MEMBERSHIP_ACCOUNT_EVENTS,row.id,row);
        for(const row of plan.studentProfileMerge?.referenceUpdates?.membershipAccounts||[])await put(T_MEMBERSHIP_ACCOUNTS,row.id,row);
        for(const row of plan.studentProfileMerge?.referenceUpdates?.courts||[])await put(T_COURTS,row.id,row);
        for(const row of plan.studentProfileMerge?.referenceUpdates?.financialLedger||[])await put(T_FINANCIAL_LEDGER,row.id,row);
        for(const row of plan.studentProfileMerge?.referenceUpdates?.plans||[])await put(T_PLANS,row.id,row);
        for(const row of plan.studentProfileMerge?.referenceUpdates?.classes||[])await put(T_CLASSES,row.id,row);
        for(const row of plan.studentProfileMerge?.referenceUpdates?.feedbacks||[])await put(T_FEEDBACKS,row.id,row);
        const refreshStudentIds=[
          plan.studentProfileMerge?.targetStudentId,
          ...(plan.studentProfileMerge?.sourceStudentUpdates||[]).map(row=>row.id)
        ].map(cleanLeadText).filter(Boolean);
        if(refreshStudentIds.length&&typeof refreshStudentTeachingSummaryRows==='function'){
          await refreshStudentTeachingSummaryRows([...new Set(refreshStudentIds)]);
        }
        clearLeadListCaches();
        return sendJson(res,leadMergeSummary(plan));
      }catch(error){
        return sendJson(res,{error:error.message||'线索合并失败'},error.statusCode||400);
      }
    }
    const leadIdM=path.match(/^\/leads\/([^/]+)$/);
    if(leadIdM){
      if(user.role!=='admin')return sendJson(res,{error:'无权限'},403);
      await ensureLeadTablesForRequest();
      const leadId=leadIdM[1];
      if(method==='GET'){
        await init();
        let raw=await get(T_LEADS,leadId).catch(()=>null);
        if(!raw&&isSyntheticStudentLeadId(leadId))raw=await syntheticLeadForStudentLeadId(leadId,new Date().toISOString());
        if(!raw)return sendJson(res,{error:'线索不存在'},404);
        const snapshot=await applyPersistedLeadSnapshot(raw);
        const displayLead=await applyLeadDisplaySnapshot(snapshot,{leadId});
        const scopedRaw=filterLoadAllForUser({leads:[displayLead]},user).leads||[];
        if(!scopedRaw.length)return sendJson(res,{error:'线索不存在'},404);
        return sendJson(res,scopedRaw[0]);
      }
      if(method==='PUT'){
        await init();
        const now=new Date().toISOString();
        let targetLeadId=leadId;
        let syntheticStudent=null;
        let old=await get(T_LEADS,leadId).catch(()=>null);
        if(!old&&isSyntheticStudentLeadId(leadId)){
          const resolved=await resolveSyntheticLeadSaveTarget(leadId,body,now);
          if(resolved){
            old=resolved.lead;
            targetLeadId=resolved.targetLeadId;
            syntheticStudent=resolved.student;
          }
        }
        if(!old)return sendJson(res,{error:'线索不存在'},404);
        const normalized=normalizeLeadRecord({...old,...body,id:targetLeadId,createdAt:old.createdAt},{now});
        const next=await applyPersistedLeadSnapshot(normalized);
        const materialized=await materializeLeadConversionIdentities(next,{now});
        if(!materialized.changed)await put(T_LEADS,targetLeadId,next);
        if(syntheticStudent)await ensureLifecycleSourceLink(T_STUDENTS,syntheticStudent,{id:targetLeadId},now);
        const displayLead=await applyLeadDisplaySnapshot(materialized.lead,{leadId:targetLeadId});
        clearLeadListCaches();
        return sendJson(res,displayLead);
      }
      if(method==='DELETE'){
        await init();
        const lead=await get(T_LEADS,leadId).catch(()=>null);
        if(!lead)return sendJson(res,{error:'线索不存在'},404);
        const now=new Date().toISOString();
        const data=await readLeadDeleteData();
        const linked=leadHasBusinessLinks(lead,data);
        const converted=leadHasConvertedOutcome(lead);
        const followups=(data.followups||[]).filter(row=>cleanLeadText(row.leadId)===cleanLeadText(leadId));
        if(!linked&&!converted){
          await Promise.all([
            del(T_LEADS,leadId),
            ...followups.map(row=>del(T_LEAD_FOLLOWUPS,row.id))
          ]);
          clearLeadListCaches();
          return sendJson(res,{success:true,deleted:true,archived:false,followupIds:followups.map(row=>row.id)});
        }
        const next={...lead,status:'voided',voidedAt:lead.voidedAt||now,voidedBy:user.name||'',voidReason:cleanLeadText(body?.reason)||'线索删除时自动作废，历史业务数据保留',updatedAt:now};
        await put(T_LEADS,leadId,next);
        clearLeadListCaches();
        return sendJson(res,{success:true,deleted:false,archived:true,lead:next});
      }
    }
    const leadFollowupIdM=path.match(/^\/lead-followups\/([^/]+)$/);
    if(leadFollowupIdM){
      if(user.role!=='admin')return sendJson(res,{error:'无权限'},403);
      await init();
      await ensureLeadTablesForRequest();
      const followupId=leadFollowupIdM[1];
      if(method==='PUT'){
        const oldFollowup=await get(T_LEAD_FOLLOWUPS,followupId).catch(()=>null);
        if(!oldFollowup)return sendJson(res,{error:'跟进记录不存在'},404);
        const leadId=cleanLeadText(oldFollowup.leadId);
        const lead=await get(T_LEADS,leadId).catch(()=>null);
        if(!lead)return sendJson(res,{error:'线索不存在'},404);
        const now=new Date().toISOString();
        const followup=normalizeLeadFollowupRecord({...oldFollowup,...body,id:followupId,leadId,createdAt:oldFollowup.createdAt},{now});
        await put(T_LEAD_FOLLOWUPS,followupId,followup);
        const rows=(await scan(T_LEAD_FOLLOWUPS).catch(()=>[])).filter(row=>String(row.leadId||'')===String(leadId)).map(row=>String(row.id||'')===String(followupId)?followup:row);
        const nextLead=applyLeadFollowupsSnapshot(lead,rows);
        const materialized=await materializeLeadConversionIdentities(nextLead,{now});
        if(!materialized.changed)await put(T_LEADS,leadId,nextLead);
        clearLeadListCaches();
        return sendJson(res,{followup,lead:materialized.lead});
      }
    }
    const leadFollowupsM=path.match(/^\/leads\/([^/]+)\/followups$/);
    if(leadFollowupsM){
      if(user.role!=='admin')return sendJson(res,{error:'无权限'},403);
      await init();
      await ensureLeadTablesForRequest();
      const leadId=leadFollowupsM[1];
      const lead=await get(T_LEADS,leadId).catch(()=>null);
      if(!lead)return sendJson(res,{error:'线索不存在'},404);
      if(method==='GET'){
        const rows=((isProductionRuntime()?await scanFirstRows(T_LEAD_FOLLOWUPS,{limit:PRODUCTION_PAGE_READ_LIMITS.leadFollowups,columns:LEAD_FOLLOWUP_LIST_PROJECTION_FIELDS}).catch(()=>[]):await getCachedScan(T_LEAD_FOLLOWUPS,{columns:LEAD_FOLLOWUP_LIST_PROJECTION_FIELDS}).catch(()=>[])))
          .filter(row=>String(row.leadId||'')===String(leadId))
          .sort((a,b)=>String(b.followupAt||b.createdAt||'').localeCompare(String(a.followupAt||a.createdAt||'')));
        return sendJson(res,rows);
      }
      if(method==='POST'){
        const now=new Date().toISOString();
        const followup=normalizeLeadFollowupRecord({...body,leadId,followupBy:body.followupBy||user.name||''},{now});
        await put(T_LEAD_FOLLOWUPS,followup.id,followup);
        const nextLead=applyLeadFollowupSnapshot(lead,followup);
        const materialized=await materializeLeadConversionIdentities(nextLead,{now});
        if(!materialized.changed)await put(T_LEADS,leadId,nextLead);
        clearLeadListCaches();
        return sendJson(res,{followup,lead:materialized.lead});
      }
    }
    if(path==='/leads/import-preview'&&method==='POST'){
      if(user.role!=='admin')return sendJson(res,{error:'无权限'},403);
      await init();
      await ensureLeadTablesForRequest();
      const leads=normalizeLeadImportRows(body);
      const [students,courts,membershipAccounts]=await Promise.all([
        scan(T_STUDENTS).catch(()=>[]),
        scan(T_COURTS).catch(()=>[]),
        scan(T_MEMBERSHIP_ACCOUNTS).catch(()=>[])
      ]);
      const rows=buildLeadImportPreviewRows(leads,{students,courts,membershipAccounts});
      return sendJson(res,{rows,summary:leadImportPreviewSummary(rows)});
    }
    if(path==='/leads/import-commit'&&method==='POST'){
      if(user.role!=='admin')return sendJson(res,{error:'无权限'},403);
      await init();
      await ensureLeadTablesForRequest();
      const batchKey=cleanLeadText(body.batchKey)||`preview:${Buffer.from(String(body.csvText||'')).toString('base64').slice(0,48)}`;
      const existingBatch=await get(T_LEAD_IMPORT_BATCHES,batchKey).catch(()=>null);
      if(existingBatch)return sendJson(res,existingBatch);
      const previewRows=Array.isArray(body.rows)&&body.rows.length?body.rows:buildLeadImportPreviewRows(normalizeLeadImportRows(body),{
        students:await scan(T_STUDENTS).catch(()=>[]),
        courts:await scan(T_COURTS).catch(()=>[]),
        membershipAccounts:await scan(T_MEMBERSHIP_ACCOUNTS).catch(()=>[])
      });
      const existingLeads=await scan(T_LEADS).catch(()=>[]);
      const existingKeys=new Set((existingLeads||[]).map(buildLeadDedupKey));
      const existingLeadNameIndex=buildLeadNameIndex(existingLeads);
      const rowsToCreate=dedupeLeadRows(previewRows).filter(row=>!existingKeys.has(buildLeadDedupKey(row))&&!findUniqueLeadByName(row,existingLeadNameIndex));
      const createdLeads=[];
      const createdFollowups=[];
      for(const row of rowsToCreate){
        const now=new Date().toISOString();
        const lead=normalizeLeadRecord(row,{id:row.id,now});
        const materialized=await materializeLeadConversionIdentities(lead,{now});
        if(!materialized.changed)await put(T_LEADS,lead.id,lead);
        createdLeads.push(materialized.lead);
        const followup=buildLeadInitialFollowup(materialized.lead);
        await put(T_LEAD_FOLLOWUPS,followup.id,followup);
        createdFollowups.push(followup);
      }
      const result={
        batchKey,
        importedAt:new Date().toISOString(),
        leadCount:createdLeads.length,
        followupCount:createdFollowups.length,
        skippedDuplicates:(previewRows||[]).length-rowsToCreate.length,
        summary:{...leadImportPreviewSummary(previewRows),importableRows:rowsToCreate.length}
      };
      await put(T_LEAD_IMPORT_BATCHES,batchKey,result);
      clearLeadListCaches();
      return sendJson(res,result);
    }
    const leadConvertStudentM=path.match(/^\/leads\/([^/]+)\/convert-student$/);
    if(leadConvertStudentM&&method==='POST'){
      if(user.role!=='admin')return sendJson(res,{error:'无权限'},403);
      await init();
      await ensureLeadTablesForRequest();
      const leadId=leadConvertStudentM[1];
      const lead=await get(T_LEADS,leadId).catch(()=>null);
      if(!lead)return sendJson(res,{error:'线索不存在'},404);
        if(lead.studentId){
          const now=new Date().toISOString();
          let student=await get(T_STUDENTS,lead.studentId).catch(()=>null);
          if(student)student=await ensureLifecycleSourceLink(T_STUDENTS,student,lead,now);
          const materialized=await materializeLeadConversionIdentities(lead,{now,studentId:lead.studentId});
          clearLeadListCaches();
          const displayLead=await applyLeadDisplaySnapshot(materialized.lead,{leadId});
          return sendJson(res,{lead:displayLead,student,created:false});
        }
        let student=body.studentId?await get(T_STUDENTS,body.studentId).catch(()=>null):null;
        if(!student){
        const studentMatch=matchLeadToStudent?matchLeadToStudent(lead,await scan(T_STUDENTS).catch(()=>[])):{matchType:'none',record:null};
        student=studentMatch.record||null;
        if(!student){
          student=buildLeadStudentRecord(lead,{now:new Date().toISOString()});
          await put(T_STUDENTS,student.id,student);
        }
      }
      const now=new Date().toISOString();
      student=await ensureLifecycleSourceLink(T_STUDENTS,student,lead,now);
      const nextLead=normalizeLeadRecord({...lead,studentId:student.id,isCourseConverted:true,membershipAccountId:lead.membershipAccountId||'',updatedAt:now,createdAt:lead.createdAt},{id:lead.id,now});
      const materialized=await materializeLeadConversionIdentities(nextLead,{now,studentId:student.id});
      if(!materialized.changed)await put(T_LEADS,lead.id,nextLead);
      const displayLead=await applyLeadDisplaySnapshot(materialized.lead,{leadId});
      clearLeadListCaches();
      return sendJson(res,{lead:displayLead,student,created:!body.studentId});
    }
    const leadConvertCourtM=path.match(/^\/leads\/([^/]+)\/convert-court$/);
    if(leadConvertCourtM&&method==='POST'){
      if(user.role!=='admin')return sendJson(res,{error:'无权限'},403);
      await init();
      await ensureLeadTablesForRequest();
      const leadId=leadConvertCourtM[1];
      const lead=await get(T_LEADS,leadId).catch(()=>null);
      if(!lead)return sendJson(res,{error:'线索不存在'},404);
      if(lead.courtId){
        const now=new Date().toISOString();
        let court=await get(T_COURTS,lead.courtId).catch(()=>null);
        if(court)court=await ensureLifecycleSourceLink(T_COURTS,court,lead,now);
        const materialized=await materializeLeadConversionIdentities(lead,{now,courtId:lead.courtId});
        clearLeadListCaches();
        const displayLead=await applyLeadDisplaySnapshot(materialized.lead,{leadId});
        return sendJson(res,{lead:displayLead,court,created:false});
      }
      let court=body.courtId?await get(T_COURTS,body.courtId).catch(()=>null):null;
      if(!court){
        const courtMatch=matchLeadToCourt?matchLeadToCourt(lead,(await scan(T_COURTS).catch(()=>[])).filter(row=>String(row.status||'active')!=='inactive')):{matchType:'none',record:null};
        court=courtMatch.record||null;
        if(!court){
          court=buildLeadCourtRecord(lead,{studentId:lead.studentId,now:new Date().toISOString()});
          await put(T_COURTS,court.id,court);
        }
      }
      const now=new Date().toISOString();
      court=await ensureLifecycleSourceLink(T_COURTS,court,lead,now);
      const membershipAccount=(await scan(T_MEMBERSHIP_ACCOUNTS).catch(()=>[])).find(account=>String(account.courtId||'')===String(court.id)&&account.status!=='voided')||null;
      const nextLead=normalizeLeadRecord({...lead,courtId:court.id,membershipAccountId:membershipAccount?.id||lead.membershipAccountId||'',isCourtConverted:true,isMembershipConverted:!!membershipAccount,updatedAt:now,createdAt:lead.createdAt},{id:lead.id,now});
      const materialized=await materializeLeadConversionIdentities(nextLead,{now,courtId:court.id});
      if(!materialized.changed)await put(T_LEADS,lead.id,nextLead);
      const displayLead=await applyLeadDisplaySnapshot(materialized.lead,{leadId});
      clearLeadListCaches();
      return sendJson(res,{lead:displayLead,court,created:!body.courtId});
    }
    const leadLinkStudentM=path.match(/^\/leads\/([^/]+)\/link-student$/);
    if(leadLinkStudentM&&method==='POST'){
      if(user.role!=='admin')return sendJson(res,{error:'无权限'},403);
      await init();
      await ensureLeadTablesForRequest();
      const lead=await get(T_LEADS,leadLinkStudentM[1]).catch(()=>null);
      const student=await get(T_STUDENTS,body.studentId).catch(()=>null);
      if(!lead)return sendJson(res,{error:'线索不存在'},404);
      if(!student)return sendJson(res,{error:'学员不存在'},404);
      const now=new Date().toISOString();
      const linkedStudent=await ensureLifecycleSourceLink(T_STUDENTS,student,lead,now);
      const nextLead=normalizeLeadRecord({...lead,studentId:linkedStudent.id,isCourseConverted:true,createdAt:lead.createdAt},{id:lead.id,now});
      const materialized=await materializeLeadConversionIdentities(nextLead,{now,studentId:linkedStudent.id});
      if(!materialized.changed)await put(T_LEADS,lead.id,nextLead);
      const displayLead=await applyLeadDisplaySnapshot(materialized.lead,{leadId});
      clearLeadListCaches();
      return sendJson(res,{lead:displayLead,student:linkedStudent});
    }
    const leadLinkCourtM=path.match(/^\/leads\/([^/]+)\/link-court$/);
    if(leadLinkCourtM&&method==='POST'){
      if(user.role!=='admin')return sendJson(res,{error:'无权限'},403);
      await init();
      await ensureLeadTablesForRequest();
      const lead=await get(T_LEADS,leadLinkCourtM[1]).catch(()=>null);
      const court=await get(T_COURTS,body.courtId).catch(()=>null);
      if(!lead)return sendJson(res,{error:'线索不存在'},404);
      if(!court)return sendJson(res,{error:'订场用户不存在'},404);
      const now=new Date().toISOString();
      const linkedCourt=await ensureLifecycleSourceLink(T_COURTS,court,lead,now);
      const membershipAccount=(await scan(T_MEMBERSHIP_ACCOUNTS).catch(()=>[])).find(account=>String(account.courtId||'')===String(court.id)&&account.status!=='voided')||null;
      const nextLead=normalizeLeadRecord({...lead,courtId:linkedCourt.id,membershipAccountId:membershipAccount?.id||'',isCourtConverted:true,isMembershipConverted:!!membershipAccount,createdAt:lead.createdAt},{id:lead.id,now});
      const materialized=await materializeLeadConversionIdentities(nextLead,{now,courtId:linkedCourt.id});
      if(!materialized.changed)await put(T_LEADS,lead.id,nextLead);
      const displayLead=await applyLeadDisplaySnapshot(materialized.lead,{leadId});
      clearLeadListCaches();
      return sendJson(res,{lead:displayLead,court:linkedCourt,membershipAccount:materialized.membershipAccount||membershipAccount});
    }
    const leadUnlinkStudentM=path.match(/^\/leads\/([^/]+)\/unlink-student$/);
    if(leadUnlinkStudentM&&method==='POST'){
      if(user.role!=='admin')return sendJson(res,{error:'无权限'},403);
      await init();
      await ensureLeadTablesForRequest();
      const lead=await get(T_LEADS,leadUnlinkStudentM[1]).catch(()=>null);
      if(!lead)return sendJson(res,{error:'线索不存在'},404);
      const student=lead.studentId?await get(T_STUDENTS,lead.studentId).catch(()=>null):null;
      const now=new Date().toISOString();
      const nextLead=normalizeLeadRecord({...lead,studentId:'',isCourseConverted:false,dealType:'',conversionType:'',createdAt:lead.createdAt},{id:lead.id,now});
      await put(T_LEADS,lead.id,nextLead);
      let nextStudent=student;
      if(student&&cleanLeadText(student.sourceLeadId||student.leadId||student.fromLeadId)===cleanLeadText(lead.id)){
        nextStudent={...student,sourceLeadId:'',leadId:'',fromLeadId:'',updatedAt:now};
        await put(T_STUDENTS,nextStudent.id,nextStudent);
      }
      const displayLead=await applyLeadDisplaySnapshot(nextLead,{leadId});
      clearLeadListCaches();
      return sendJson(res,{lead:displayLead,student:nextStudent});
    }
    const leadUnlinkCourtM=path.match(/^\/leads\/([^/]+)\/unlink-court$/);
    if(leadUnlinkCourtM&&method==='POST'){
      if(user.role!=='admin')return sendJson(res,{error:'无权限'},403);
      await init();
      await ensureLeadTablesForRequest();
      const lead=await get(T_LEADS,leadUnlinkCourtM[1]).catch(()=>null);
      if(!lead)return sendJson(res,{error:'线索不存在'},404);
      const court=lead.courtId?await get(T_COURTS,lead.courtId).catch(()=>null):null;
      const now=new Date().toISOString();
      const nextLead=normalizeLeadRecord({...lead,courtId:'',membershipAccountId:'',isCourtConverted:false,isMembershipConverted:false,dealType:'',conversionType:'',createdAt:lead.createdAt},{id:lead.id,now});
      await put(T_LEADS,lead.id,nextLead);
      let nextCourt=court;
      if(court&&cleanLeadText(court.sourceLeadId||court.leadId||court.fromLeadId)===cleanLeadText(lead.id)){
        nextCourt={...court,sourceLeadId:'',leadId:'',fromLeadId:'',updatedAt:now};
        await put(T_COURTS,nextCourt.id,nextCourt);
      }
      const displayLead=await applyLeadDisplaySnapshot(nextLead,{leadId});
      clearLeadListCaches();
      return sendJson(res,{lead:displayLead,court:nextCourt});
    }
    return false;
  };
}

module.exports={createLeadsRoutes};
