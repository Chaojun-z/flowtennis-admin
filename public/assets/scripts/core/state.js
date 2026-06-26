function syncViewportMode(){
  const isCoach=currentUser?.role==='editor'&&currentUser?.coachName;
  const isMobile=window.innerWidth<=900;
  document.body.classList.toggle('coach-mobile',!!(isCoach&&isMobile));
  document.body.classList.toggle('admin-mobile',!!(!isCoach&&isMobile&&currentUser));
}

let leads=[],leadFollowups=[];
let courts=[],students=[],products=[],packages=[],purchases=[],entitlements=[],entitlementLedger=[],financialLedger=[],membershipPlans=[],membershipAccounts=[],membershipOrders=[],membershipBenefitLedger=[],membershipAccountEvents=[],pricePlans=[],plans=[],schedules=[],coaches=[],classes=[],campuses=[],feedbacks=[],coachProposals=[],adminUsers=[],matches=[];
let customerLifecycleRows=[];
let packageBoardColumnOrder=[];
let financeOverviewData=null,financeNormalizedLedgerRows=[],financeSettlementSummaryRows=[];
let operationsPageData=null;
let studentLessonRecordExpandedState={};
function financeNormalizedRows(){
  return Array.isArray(financeNormalizedLedgerRows)?financeNormalizedLedgerRows:[];
}
function financeSettlementRowsFromSnapshot(){
  return Array.isArray(financeSettlementSummaryRows)?financeSettlementSummaryRows:[];
}
function customerLifecycleText(value){
  return String(value||'').trim();
}
function customerLifecycleParseArray(value){
  if(Array.isArray(value))return value;
  if(typeof value==='string'&&value.trim()){
    try{
      const parsed=JSON.parse(value);
      return Array.isArray(parsed)?parsed:[];
    }catch(e){return [];}
  }
  return [];
}
function customerLifecycleAllRows(){
  return Array.isArray(customerLifecycleRows)?customerLifecycleRows:[];
}
function customerLifecycleHasValue(record={},fields=[]){
  return fields.some(field=>customerLifecycleText(record[field]));
}
function customerLifecycleOwnIdKind(record={}){
  if(!record||typeof record!=='object'||!customerLifecycleText(record.id))return '';
  if(customerLifecycleHasValue(record,['studentId','packageId','purchaseId','entitlementId','classId','scheduleId']))return '';
  if(customerLifecycleParseArray(record.studentIds).length)return '';
  if(customerLifecycleHasValue(record,['membershipAccountId','accountId']))return '';
  if(customerLifecycleHasValue(record,['courtId'])){
    return customerLifecycleHasValue(record,['membershipPlanId','planId','cashBalance','giftBalance','balance','availableBalance','rechargeAmount'])?'membershipAccount':'';
  }
  if(customerLifecycleHasValue(record,['courtName','courtPhone','bookingCount','lastBookingAt','totalSpent'])||Array.isArray(record.history))return 'court';
  if(customerLifecycleHasValue(record,['primaryCoach','studentNo','studentName','type','level','birthdate']))return 'student';
  return '';
}
function customerLifecycleRowsForRecord(record={}){
  const rows=customerLifecycleAllRows();
  if(!rows.length||!record)return [];
  const sourceId=customerLifecycleText(record.sourceLeadId||record.leadId||record.fromLeadId);
  const ownIdKind=customerLifecycleOwnIdKind(record);
  const studentIds=[
    customerLifecycleText(record.studentId),
    ownIdKind==='student'?customerLifecycleText(record.id):'',
    ...customerLifecycleParseArray(record.studentIds).map(customerLifecycleText)
  ].filter(Boolean);
  const courtId=customerLifecycleText(record.courtId||(ownIdKind==='court'?record.id:''));
  const membershipAccountId=customerLifecycleText(record.membershipAccountId||record.accountId||(ownIdKind==='membershipAccount'?record.id:''));
  const matches=[],seen=new Set();
  const addMatches=predicate=>rows.forEach(row=>{
    const key=customerLifecycleText(row.customerKey||row.sourceLeadId||row.studentId||row.courtId||row.membershipAccountId);
    if(predicate(row)&&!seen.has(key)){seen.add(key);matches.push(row);}
  });
  addMatches(row=>!!(sourceId&&(customerLifecycleText(row.sourceLeadId)===sourceId||customerLifecycleText(row.leadId)===sourceId)));
  addMatches(row=>!!(studentIds.length&&studentIds.includes(customerLifecycleText(row.studentId))));
  addMatches(row=>!!(courtId&&customerLifecycleText(row.courtId)===courtId));
  addMatches(row=>!!(membershipAccountId&&customerLifecycleText(row.membershipAccountId)===membershipAccountId));
  return matches;
}
function customerLifecycleByStudentId(studentId){
  const id=customerLifecycleText(studentId);
  if(!id)return null;
  return customerLifecycleAllRows().find(row=>customerLifecycleText(row.studentId)===id)||null;
}
function customerLifecycleByCourtId(courtId){
  const id=customerLifecycleText(courtId);
  if(!id)return null;
  return customerLifecycleAllRows().find(row=>customerLifecycleText(row.courtId)===id)||null;
}
function customerLifecycleByMembershipAccountId(accountId){
  const id=customerLifecycleText(accountId);
  if(!id)return null;
  return customerLifecycleAllRows().find(row=>customerLifecycleText(row.membershipAccountId)===id)||null;
}
function customerLifecycleForRecord(record={}){
  return customerLifecycleRowsForRecord(record)[0]||null;
}
function customerLifecycleSource(record={},fallback=''){
  const value=customerLifecycleText(customerLifecycleForRecord(record)?.source||fallback||record?.source);
  if(typeof FlowTennisBusinessTaxonomy==='object'&&FlowTennisBusinessTaxonomy?.normalizeLeadSource){
    return FlowTennisBusinessTaxonomy.normalizeLeadSource(value);
  }
  return value;
}
function customerLifecycleCampus(record={},fallback=''){
  const row=customerLifecycleForRecord(record);
  return customerLifecycleText(row?.campus||fallback||record?.campus||record?.campusId||record?.campusName);
}
function customerLifecycleOwner(record={},fallback=''){
  const row=customerLifecycleForRecord(record);
  return customerLifecycleText(row?.owner||fallback||record?.owner||record?.primaryCoach||record?.coach||record?.coachName);
}
function customerLifecycleStudentStage(record={}){
  const row=customerLifecycleForRecord(record)||customerLifecycleByStudentId(record?.studentId||record?.id);
  return customerLifecycleText(row?.studentStage);
}
function customerLifecycleStudentDealPath(record={}){
  const row=customerLifecycleForRecord(record)||customerLifecycleByStudentId(record?.studentId||record?.id);
  return customerLifecycleText(row?.courseDealPath);
}
function customerLifecycleStudentTrialStatus(record={}){
  const row=customerLifecycleForRecord(record)||customerLifecycleByStudentId(record?.studentId||record?.id);
  return customerLifecycleText(row?.trialStatus);
}
function customerLifecycleStudentCoursePurchaseCount(record={}){
  const row=customerLifecycleForRecord(record)||customerLifecycleByStudentId(record?.studentId||record?.id);
  return Number(row?.coursePurchaseCount)||0;
}
function customerLifecycleStudentHasCourseRepeat(record={}){
  const row=customerLifecycleForRecord(record)||customerLifecycleByStudentId(record?.studentId||record?.id);
  return !!row?.hasCourseRepeatPurchase;
}
function customerLifecycleStudentHasTrialToCourseConversion(record={}){
  const row=customerLifecycleForRecord(record)||customerLifecycleByStudentId(record?.studentId||record?.id);
  return !!row?.hasTrialToCourseConversion;
}
function customerLifecycleCourtStage(record={}){
  return customerLifecycleText(customerLifecycleForRecord(record)?.courtStage);
}
function customerLifecycleMembershipStatus(record={}){
  return customerLifecycleText(customerLifecycleForRecord(record)?.membershipStatus);
}
// 教学售卖治理口径：
// 现行业务主链路是 packages -> purchases -> entitlements -> schedule。
// products / classes / plans 仅保留历史兼容，不应再作为新增功能默认依赖。
window.coachWorkbenchStats=window.coachWorkbenchStats||{};
let adminUsersLoaded=false;
let modalCleanupTimer=null;
let lastDataSyncAt=0,isSyncingAll=false,dataRequestVersion=0;
let scheduleLocalMutationAt=0;
let courtAccountListViewData=null,courtAccountListViewCompareData=null;
let loadedDatasets=new Set();
let staleCachedDatasets=new Set();
const DATA_CACHE_PREFIX='ft_dataset_cache_';
const DATA_CACHE_VERSION_KEY='ft_dataset_cache_version';
const DATA_CACHE_VERSION='2026-06-09-campus-scope-v1';
const DATA_CACHE_TTL_MS=60000;
const OPERATIONS_PAGE_CACHE_PREFIX='ft_operations_view_cache_';
const OPERATIONS_PAGE_CACHE_VERSION='2026-06-24-source-order-v1';
const DATASETS_EXCLUDED_FROM_CACHE=new Set(['leads','leadFollowups','students','schedule','packages','purchases','entitlements','entitlementLedger','coachProposals']);
const SENSITIVE_DATASETS_EXCLUDED_FROM_CACHE_IN_NON_PRODUCTION=new Set(['financialLedger','purchases','membershipAccounts','membershipOrders','membershipBenefitLedger','membershipAccountEvents']);
const datasetLoadPromises=new Map();
let operationsPageRequestSeq=0;
let operationsPageBackgroundRefreshSeq=0;
function resolveClientRuntimeStage(){
  const host=String(window.location.hostname||'').trim().toLowerCase();
  if(!host||host==='localhost'||host==='127.0.0.1')return 'local';
  if(host==='flowtennis.cn'||host==='www.flowtennis.cn')return 'production';
  return 'preview';
}
const CLIENT_RUNTIME_STAGE=resolveClientRuntimeStage();
const CLIENT_DATA_CACHE_SCOPE=CLIENT_RUNTIME_STAGE+'_'+String(window.location.hostname||'').trim().toLowerCase();
const COURT_READ_MODEL_STORAGE_KEY='ft_court_read_model_mode';
const COURT_READ_MODEL_FORCE_LEGACY_KEY='ft_court_read_model_force_legacy';
const COURT_READ_MODEL_COMPARE_STORAGE_KEY='ft_court_read_model_compare';
const COURT_GUARD_QUERY=new URLSearchParams(window.location.search);
function isNonProductionRuntime(){
  return CLIENT_RUNTIME_STAGE!=='production';
}
function isCourtReadModelRollbackForced(){
  return COURT_GUARD_QUERY.get('courtRollback')==='force-legacy'||localStorage.getItem(COURT_READ_MODEL_FORCE_LEGACY_KEY)==='1';
}
function shouldUseCourtReadModelByDefault(){
  if(isCourtReadModelRollbackForced())return false;
  const queryMode=String(COURT_GUARD_QUERY.get('courtView')||'').trim().toLowerCase();
  if(queryMode==='legacy')return false;
  if(queryMode==='read-model')return true;
  if(COURT_GUARD_QUERY.get('courtCompare')==='1')return true;
  return true;
}
function isCourtReadModelPreviewEnabled(){
  return shouldUseCourtReadModelByDefault();
}
function shouldLoadCourtReadModelCompare(){
  if(!shouldUseCourtReadModelByDefault())return false;
  return COURT_GUARD_QUERY.get('courtCompare')==='1'||localStorage.getItem(COURT_READ_MODEL_COMPARE_STORAGE_KEY)==='1';
}
window.enableCourtReadModelPreview=function(){
  localStorage.setItem(COURT_READ_MODEL_STORAGE_KEY,'read-model');
  localStorage.removeItem(COURT_READ_MODEL_FORCE_LEGACY_KEY);
};
window.disableCourtReadModelPreview=function(){
  localStorage.removeItem(COURT_READ_MODEL_STORAGE_KEY);
};
window.forceCourtReadModelRollback=function(){
  localStorage.setItem(COURT_READ_MODEL_FORCE_LEGACY_KEY,'1');
};
window.clearCourtReadModelRollback=function(){
  localStorage.removeItem(COURT_READ_MODEL_FORCE_LEGACY_KEY);
};
function shouldBypassDatasetCache(name){
  if(DATASETS_EXCLUDED_FROM_CACHE.has(name))return true;
  return isNonProductionRuntime()&&SENSITIVE_DATASETS_EXCLUDED_FROM_CACHE_IN_NON_PRODUCTION.has(name);
}
const PAGE_DATA_REQUIREMENTS={
  students:['campuses','students'],
  'package-students':['campuses','students','purchasesPage'],
  'trial-students':['campuses','students','purchasesPage'],
  leads:['campuses','leads'],
  operations:['operationsPage'],
  schedule:['campuses','students','courts','schedule','coaches','coachProposals'],
  coachschedule:['campuses','students','classes','schedule','feedbacks','coachProposals','entitlements','entitlementLedger','coaches','products','purchases','packages'],
  coachops:['campuses','students','classes','schedule','feedbacks','coachProposals','entitlements','entitlementLedger','coaches','products','purchases','packages'],
  finance:[],
  products:['products'],
  packages:['packages','products','purchases','entitlements','packageBoardPreferences'],
  purchases:[],
  entitlements:['entitlements','students'],
  coaches:['campuses','coaches'],
  'admin-users':['campuses','coaches'],
  courts:[],
  matches:['matchesPage'],
  memberships:[],
  'membership-orders':['campuses','students','courts','membershipPlans','membershipAccounts','membershipOrders','membershipBenefitLedger','membershipAccountEvents','coaches'],
  'membership-ledger':['campuses','students','courts','membershipPlans','membershipAccounts','membershipOrders','membershipBenefitLedger','membershipAccountEvents','coaches'],
  'membership-plans':['membershipPlans','membershipOrders','campuses','coaches'],
  prices:['campuses','pricePlans'],
  campusmgr:['campuses'],
  workbench:[],
  postfeedback:[],
  mystudents:[],
  myclasses:[]
};
const PAGE_DATA_BACKGROUND_REQUIREMENTS={
  students:['classes','schedule','courts'],
  'package-students':['classes','schedule','courts'],
  'trial-students':['classes','schedule','courts'],
  leads:['leadFollowups','purchases'],
  packages:[],
  purchases:['purchasesPage'],
  schedule:['classes','feedbacks','entitlements','entitlementLedger'],
  finance:['financePage'],
  courts:['courtsPage'],
  matches:['matchesPage'],
  memberships:['membershipsPage'],
  workbench:['workbenchPage'],
  postfeedback:['workbenchPage'],
  mystudents:['campuses','students','classes','schedule','feedbacks','entitlements'],
  myclasses:['students','classes']
};
const STUDENT_PAGE_DEFERRED_REQUIREMENTS=['entitlements','entitlementLedger','feedbacks','products','purchasesPage','membershipBenefitLedger'];
const PERFORMANCE_PAGE_DATA_GUARD={
  students:['classes','schedule','courts'],
  workbench:['workbenchPage']
};
function isStudentListPage(pg){
  return ['students','package-students','trial-students'].includes(pg);
}
function normalizeStudentListPage(pg){
  return pg==='students'?'package-students':pg;
}
function assertPageDataPerformanceGuard(){
  Object.entries(PERFORMANCE_PAGE_DATA_GUARD).forEach(([page,expected])=>{
    const actual=PAGE_DATA_BACKGROUND_REQUIREMENTS[page]||[];
    if(actual.join('|')!==expected.join('|'))throw new Error('页面加载策略被改动：'+page);
  });
}
assertPageDataPerformanceGuard();
function operationsPageDataUrl(){
  const range=typeof activeGlobalDateRange==='function'?activeGlobalDateRange():{};
  const params=new URLSearchParams();
  if(range?.startDate)params.set('startDate',range.startDate);
  if(range?.endDate)params.set('endDate',range.endDate);
  const query=params.toString();
  return query?`/page-data/operations?${query}`:'/page-data/operations';
}
function operationsPageDatasetRequestKey(){
  return 'operationsPage:'+operationsPageDataUrl();
}
function operationsPageClientCacheKey(){
  return OPERATIONS_PAGE_CACHE_PREFIX+OPERATIONS_PAGE_CACHE_VERSION+'_'+CLIENT_DATA_CACHE_SCOPE+'_'+(currentUser?.id||'anon')+'_'+operationsPageDataUrl();
}
function readOperationsPageClientCache(){
  try{
    const raw=localStorage.getItem(operationsPageClientCacheKey());
    if(!raw)return null;
    const parsed=JSON.parse(raw);
    return parsed&&parsed.operations?parsed:null;
  }catch(e){return null;}
}
function persistOperationsPageClientCache(data){
  if(!data?.operations)return;
  try{
    const payload={savedAt:Date.now(),cacheVersion:OPERATIONS_PAGE_CACHE_VERSION,operations:data.operations,campuses:data.campuses||[]};
    localStorage.setItem(operationsPageClientCacheKey(),JSON.stringify(payload));
  }catch(e){}
}
function hydrateOperationsPageFromClientCache(){
  const data=readOperationsPageClientCache();
  if(!data?.operations)return false;
  setDatasetValue('campuses',data.campuses||[],{persist:false});
  operationsPageData=data.operations;
  if(currentPage==='operations'&&typeof renderOperations==='function')renderOperations();
  return true;
}
function datasetRequestKey(name){
  return name==='operationsPage'?operationsPageDatasetRequestKey():name;
}
function loadOperationsPageDataset(){
  const url=operationsPageDataUrl();
  const requestKey='operationsPage:'+url;
  return apiCall('GET',url).then(data=>({...data,__operationsRequestKey:requestKey}));
}
const DATASET_LOADERS={
  leads:()=>apiCall('GET','/leads'),
  leadFollowups:()=>apiCall('GET','/lead-followups'),
  courts:()=>apiCall('GET','/courts'),
  students:()=>apiCall('GET','/students'),
  products:()=>apiCall('GET','/products'),
  packages:()=>apiCall('GET','/packages'),
  packageBoardPreferences:()=>apiCall('GET','/package-board-preferences'),
  purchases:()=>apiCall('GET','/purchases'),
  entitlements:()=>apiCall('GET','/entitlements'),
  entitlementLedger:()=>apiCall('GET','/entitlement-ledger'),
  membershipPlans:()=>apiCall('GET','/membership-plans'),
  membershipAccounts:()=>apiCall('GET','/membership-accounts'),
  membershipOrders:()=>apiCall('GET','/membership-orders'),
  membershipBenefitLedger:()=>apiCall('GET','/membership-benefit-ledger'),
  membershipAccountEvents:()=>apiCall('GET','/membership-account-events'),
  pricePlans:()=>apiCall('GET','/price-plans'),
  schedule:()=>apiCall('GET','/schedule'),
  coaches:()=>apiCall('GET','/coaches').catch(()=>apiCall('GET','/page-data/coaches').then(data=>data.coaches||[])),
  classes:()=>Promise.resolve([]),
  campuses:()=>apiCall('GET','/campuses'),
  feedbacks:()=>apiCall('GET','/feedbacks')
  ,coachProposals:()=>apiCall('GET','/coach-proposals')
  ,purchasesPage:()=>apiCall('GET','/page-data/purchases')
  ,financePage:()=>apiCall('GET','/page-data/finance')
  ,courtsPage:()=>apiCall('GET','/page-data/courts')
  ,courtAccountListViewPage:()=>apiCall('GET','/page-data/court-account-list-view')
  ,courtAccountListViewComparePage:()=>apiCall('GET','/page-data/court-account-list-view-compare?sample=fixed')
  ,operationsPage:()=>loadOperationsPageDataset()
  ,matchesPage:()=>apiCall('GET','/admin/matches')
  ,membershipsPage:()=>apiCall('GET','/page-data/memberships')
  ,workbenchPage:()=>apiCall('GET','/page-data/workbench')
};
const GLOBAL_DATASET_NAMES=Object.keys(DATASET_LOADERS);
function datasetCacheKey(name){
  return DATA_CACHE_PREFIX+CLIENT_DATA_CACHE_SCOPE+'_'+(currentUser?.id||'anon')+'_'+name;
}
function clearDatasetCache(){
  try{
    const keys=[];
    for(let i=0;i<localStorage.length;i++)keys.push(localStorage.key(i));
    keys.filter(key=>String(key||'').startsWith(DATA_CACHE_PREFIX)).forEach(key=>localStorage.removeItem(key));
    localStorage.setItem(DATA_CACHE_VERSION_KEY,DATA_CACHE_VERSION);
  }catch(e){}
}
function ensureDatasetCacheVersion(){
  try{
    if(localStorage.getItem(DATA_CACHE_VERSION_KEY)!==DATA_CACHE_VERSION)clearDatasetCache();
  }catch(e){}
}
function clearNonProductionSensitiveDatasetCache(){
  if(!isNonProductionRuntime())return;
  try{
    const keys=[];
    for(let i=0;i<localStorage.length;i++)keys.push(localStorage.key(i));
    keys
      .filter(key=>String(key||'').startsWith(DATA_CACHE_PREFIX))
      .filter(key=>[...SENSITIVE_DATASETS_EXCLUDED_FROM_CACHE_IN_NON_PRODUCTION].some(name=>String(key).endsWith('_'+name)))
      .forEach(key=>localStorage.removeItem(key));
  }catch(e){}
}
function persistDatasetCache(name,data){
  if(shouldBypassDatasetCache(name))return;
  try{localStorage.setItem(datasetCacheKey(name),JSON.stringify({savedAt:Date.now(),data:Array.isArray(data)?data:[]}));}catch(e){}
}
function readDatasetCacheEntry(name){
  if(shouldBypassDatasetCache(name))return null;
  try{
    const raw=localStorage.getItem(datasetCacheKey(name));
    if(!raw)return null;
    const parsed=JSON.parse(raw);
    return Array.isArray(parsed?.data)?parsed:null;
  }catch(e){return null;}
}
function readDatasetCache(name){
  const entry=readDatasetCacheEntry(name);
  return Array.isArray(entry?.data)?entry.data:null;
}
function isDatasetCacheFresh(name,entry,now=Date.now()){
  if(!entry||shouldBypassDatasetCache(name))return false;
  const savedAt=Number(entry.savedAt)||0;
  if(savedAt<=0)return false;
  return now-savedAt<=DATA_CACHE_TTL_MS;
}
function setDatasetValue(name,data,{persist=true}={}){
  const rows=Array.isArray(data)?data:[];
  if(name==='schedule'){
    setScheduleRowsFromRemote(rows,{persist});
    return;
  }
  if(name==='leads')leads=rows;
  if(name==='leadFollowups')leadFollowups=rows;
  if(name==='courts')courts=rows;
  if(name==='students')students=rows;
  if(name==='products')products=rows;
  if(name==='packages')packages=rows;
  if(name==='packageBoardPreferences')packageBoardColumnOrder=Array.isArray(data?.columnOrder)?data.columnOrder:[];
  if(name==='purchases')purchases=rows;
  if(name==='entitlements')entitlements=rows;
  if(name==='entitlementLedger')entitlementLedger=rows;
  if(name==='financialLedger')financialLedger=rows;
  if(name==='membershipPlans')membershipPlans=rows;
  if(name==='membershipAccounts')membershipAccounts=rows;
  if(name==='membershipOrders')membershipOrders=rows;
  if(name==='membershipBenefitLedger')membershipBenefitLedger=rows;
  if(name==='membershipAccountEvents')membershipAccountEvents=rows;
  if(name==='pricePlans')pricePlans=rows;
  if(name==='plans')plans=rows;
  if(name==='coaches')coaches=rows;
  if(name==='classes')classes=rows;
  if(name==='campuses')campuses=rows;
  if(name==='feedbacks')feedbacks=rows;
  if(name==='coachProposals')coachProposals=rows;
  if(name==='matches')matches=rows;
  if(name==='customerLifecycleRows')customerLifecycleRows=rows;
  loadedDatasets.add(name);
  if(persist)persistDatasetCache(name,rows);
}
function noteScheduleLocalMutation(){
  scheduleLocalMutationAt=Date.now();
  if(loadedDatasets.has('financePage')){
    loadedDatasets.delete('financePage');
    financeOverviewData=null;
    financeNormalizedLedgerRows=[];
    financeSettlementSummaryRows=[];
  }
}
function setScheduleRowsFromRemote(rows,{persist=true}={}){
  const next=Array.isArray(rows)?rows:[];
  const justSaved=Date.now()-scheduleLocalMutationAt<30000;
  if(justSaved&&schedules.length&&next.length<schedules.length){
    loadedDatasets.add('schedule');
    if(persist)persistDatasetCache('schedule',schedules);
    return;
  }
  schedules=next;
  loadedDatasets.add('schedule');
  if(persist)persistDatasetCache('schedule',next);
}
function hydrateDatasetsFromCache(){
  ensureDatasetCacheVersion();
  clearNonProductionSensitiveDatasetCache();
  staleCachedDatasets=new Set();
  let latestSavedAt=0;
  GLOBAL_DATASET_NAMES.forEach(name=>{
    const cached=readDatasetCacheEntry(name);
    if(!cached)return;
    setDatasetValue(name,cached.data,{persist:false});
    const savedAt=Number(cached.savedAt)||0;
    if(savedAt>latestSavedAt)latestSavedAt=savedAt;
    if(!isDatasetCacheFresh(name,cached))staleCachedDatasets.add(name);
  });
  CAMPUS={};campuses.forEach(x=>{CAMPUS[x.code||x.id]=x.name||x.code||x.id;});
  lastDataSyncAt=latestSavedAt||0;
}
function requiredDatasetsForPage(pg){
  return PAGE_DATA_REQUIREMENTS[pg]||[];
}
function backgroundDatasetsForPage(pg){
  return PAGE_DATA_BACKGROUND_REQUIREMENTS[pg]||[];
}
function missingRequiredDatasetsForPage(pg){
  return requiredDatasetsForPage(pg).filter(name=>!loadedDatasets.has(name));
}
function initialBackgroundDatasetsForPage(pg){
  if(isNonProductionRuntime()&&pg==='finance')return ['financePage'];
  const fallback={
    leadFollowups:['leadFollowups'],
    purchasesPage:['purchases'],
    courtsPage:['courts'],
    membershipsPage:['courts','membershipAccounts'],
    workbenchPage:['schedule']
  };
  return backgroundDatasetsForPage(pg).flatMap(name=>fallback[name]||[name]);
}
function missingInitialDatasetsForPage(pg){
  if(pg==='courts'&&shouldUseCourtReadModelByDefault()){
    return courtAccountListViewData?[]:['courtAccountListViewPage'];
  }
  const requiredMissing=missingRequiredDatasetsForPage(pg);
  if(requiredMissing.length)return requiredMissing;
  if(requiredDatasetsForPage(pg).length)return [];
  return initialBackgroundDatasetsForPage(pg).filter(name=>!loadedDatasets.has(name));
}
function pageNeedsInlineLoading(pg){
  return missingInitialDatasetsForPage(pg).length>0;
}
function renderTableBodyLoading(id,colspan,text){
  renderTableSkeletonLoading(id,colspan,text);
}
function renderTableSkeletonLoading(id,colspan,text){
  const el=document.getElementById(id);
  if(!el)return;
  const safeText=esc(text);
  const cellCount=Math.max(4,Math.min(8,Number(colspan)||6));
  const headerCells=Array.from({length:cellCount},(_,idx)=>`<span class="tms-table-skeleton-line ${idx===0?'is-strong':''}"></span>`).join('');
  const rows=Array.from({length:6},()=>`<div class="tms-table-skeleton-row">${headerCells}</div>`).join('');
  el.innerHTML=`<tr class="tms-table-skeleton-row-host"><td colspan="${colspan}"><div class="tms-table-skeleton-state" role="status" aria-live="polite" aria-label="${safeText}"><div class="tms-table-skeleton-head">${headerCells}</div><div class="tms-table-skeleton-body">${rows}</div><div class="tms-table-skeleton-caption">${safeText}</div></div></td></tr>`;
}
function renderStudentTableLoading(){
  renderTableSkeletonLoading('stuTbody',12,'学员数据加载中...');
}
function renderStudentTableError(message){
  const el=document.getElementById('stuTbody');
  if(el)el.innerHTML=`<tr><td colspan="11"><div class="tms-table-error-state"><div class="tms-empty-title">加载失败</div><div class="tms-empty-desc">${esc(message||'请稍后重试')}</div><button class="tms-state-action" onclick="loadPageDataAndRender(currentPage,{force:true})">重新加载</button></div></td></tr>`;
}
function renderLeadTableLoading(){
  renderTableSkeletonLoading('leadTbody',14,'线索数据加载中...');
}
function renderLeadTableError(message){
  const el=document.getElementById('leadTbody');
  if(el)el.innerHTML=`<tr><td colspan="14"><div class="tms-table-error-state"><div class="tms-empty-title">加载失败</div><div class="tms-empty-desc">${esc(message||'请稍后重试')}</div><button class="tms-state-action" onclick="loadPageDataAndRender('leads',{force:true})">重新加载</button></div></td></tr>`;
}
function renderScheduleTableLoading(){
  renderTableSkeletonLoading('schTbody',12,'排课数据加载中...');
}
function renderScheduleTableError(message){
  const el=document.getElementById('schTbody');
  if(el)el.innerHTML=`<tr><td colspan="12"><div class="tms-table-error-state"><div class="tms-empty-title">加载失败</div><div class="tms-empty-desc">${esc(message||'请稍后重试')}</div><button class="tms-state-action" onclick="loadPageDataAndRender('schedule',{force:true})">重新加载</button></div></td></tr>`;
}
function renderCourtTableLoading(){
  renderTableSkeletonLoading('courtTbody',16,'订场用户加载中...');
}
function renderCourtTableError(message){
  const el=document.getElementById('courtTbody');
  if(el)el.innerHTML=`<tr><td colspan="16"><div class="tms-table-error-state"><div class="tms-empty-title">加载失败</div><div class="tms-empty-desc">${esc(message||'请稍后重试')}</div><button class="tms-state-action" onclick="loadPageDataAndRender('courts',{force:true})">重新加载</button></div></td></tr>`;
}
function renderBlockLoading(id,text){
  const el=document.getElementById(id);
  if(el)el.innerHTML=`<div class="empty"><p>${esc(text)}</p></div>`;
}
function renderPageLoading(pg){
  if(pg==='operations'&&hydrateOperationsPageFromClientCache())return;
  if(typeof renderStandardPageLoading==='function'&&renderStandardPageLoading(pg))return;
  if(pg==='students')renderStudentTableLoading();
  if(isStudentListPage(pg)&&pg!=='students')renderStudentTableLoading();
  if(pg==='schedule')renderScheduleTableLoading();
  if(pg==='leads')renderLeadTableLoading();
  if(pg==='operations'&&typeof renderOperationsLoading==='function')renderOperationsLoading();
  else if(pg==='operations')renderBlockLoading('page-operations','经营分析加载中...');
  if(pg==='purchases')renderTableBodyLoading('purchaseTbody',9,'购买记录加载中...');
  if(pg==='membership-orders')renderTableBodyLoading('membershipOrdersAuditTbody',12,'会员购买记录加载中...');
  if(pg==='membership-ledger')renderTableBodyLoading('membershipLedgerAuditTbody',8,'会员权益流水加载中...');
  if(pg==='finance'){
    renderTableBodyLoading('financeLedgerTbody',11,'总账加载中...');
    renderTableBodyLoading('financeRevenueTbody',14,'收入表加载中...');
    renderTableBodyLoading('financeConsumeTbody',9,'消耗表加载中...');
    renderTableBodyLoading('financePrepaidTbody',6,'预收余额加载中...');
    renderTableBodyLoading('financeAnomalyTbody',4,'异常检查加载中...');
  }
  if(pg==='coaches')renderTableBodyLoading('coachTbody',7,'教练数据加载中...');
  if(pg==='courts')renderCourtTableLoading();
  if(pg==='matches')renderTableBodyLoading('matchTbody',9,'约球数据加载中...');
  if(pg==='memberships')renderBlockLoading('membershipTabBody','会员数据加载中...');
  if(pg==='mystudents')renderBlockLoading('myStudentsBody','学员数据加载中...');
  if(pg==='myclasses')renderBlockLoading('myClassesBody','班次数据加载中...');
}
async function ensureDatasetsByName(names=[],{force=false}={}){
  const pending=(names||[]).filter(name=>force||staleCachedDatasets.has(name)||!loadedDatasets.has(name));
  if(!pending.length)return;
  const results=await Promise.all(pending.map(name=>{
    const requestKey=datasetRequestKey(name);
    if(datasetLoadPromises.has(requestKey))return datasetLoadPromises.get(requestKey);
    const promise=DATASET_LOADERS[name]().then(data=>[name,data]).finally(()=>datasetLoadPromises.delete(requestKey));
    datasetLoadPromises.set(requestKey,promise);
    return promise;
  }));
  results.forEach(([name,data])=>{
  if(name==='purchasesPage'){
      setDatasetValue('purchases',data.purchases||[]);
      setDatasetValue('packages',data.packages||[]);
      setDatasetValue('students',data.students||[]);
      setDatasetValue('entitlements',data.entitlements||[]);
      setDatasetValue('entitlementLedger',data.entitlementLedger||[]);
      setDatasetValue('customerLifecycleRows',data.customerLifecycleRows||[],{persist:false});
      staleCachedDatasets.delete('purchases');
      staleCachedDatasets.delete('packages');
      staleCachedDatasets.delete('students');
      staleCachedDatasets.delete('entitlements');
      staleCachedDatasets.delete('entitlementLedger');
      staleCachedDatasets.delete('customerLifecycleRows');
      loadedDatasets.add('purchasesPage');
      return;
    }
    if(name==='financePage'){
      setDatasetValue('campuses',data.campuses||[]);
      setDatasetValue('customerLifecycleRows',data.customerLifecycleRows||[],{persist:false});
      staleCachedDatasets.delete('campuses');
      staleCachedDatasets.delete('customerLifecycleRows');
      financeOverviewData=data.financeOverviewData||null;
      financeNormalizedLedgerRows=Array.isArray(data.financeNormalizedRows)?data.financeNormalizedRows:[];
      financeSettlementSummaryRows=Array.isArray(data.financeSettlementRows)?data.financeSettlementRows:[];
      loadedDatasets.add('financePage');
      return;
    }
    if(name==='operationsPage'){
      if(data?.__operationsRequestKey&&data.__operationsRequestKey!==operationsPageDatasetRequestKey())return;
      setDatasetValue('campuses',data.campuses||[]);
      staleCachedDatasets.delete('campuses');
      operationsPageData=data.operations||null;
      persistOperationsPageClientCache(data);
      loadedDatasets.add('operationsPage');
      return;
    }
    if(name==='courtsPage'){
      setDatasetValue('campuses',data.campuses||[]);
      setDatasetValue('students',data.students||[]);
      setDatasetValue('courts',data.courts||[]);
      setDatasetValue('customerLifecycleRows',data.customerLifecycleRows||[],{persist:false});
      staleCachedDatasets.delete('campuses');
      staleCachedDatasets.delete('students');
      staleCachedDatasets.delete('courts');
      staleCachedDatasets.delete('customerLifecycleRows');
      loadedDatasets.add('courtsPage');
      return;
    }
    if(name==='matchesPage'){
      setDatasetValue('matches',data.items||[]);
      staleCachedDatasets.delete('matches');
      loadedDatasets.add('matchesPage');
      return;
    }
    if(name==='membershipsPage'){
      setDatasetValue('campuses',data.campuses||[]);
      setDatasetValue('students',data.students||[]);
      setDatasetValue('courts',data.courts||[]);
      setDatasetValue('membershipAccounts',data.membershipAccounts||[]);
      setDatasetValue('membershipOrders',data.membershipOrders||[]);
      setDatasetValue('membershipBenefitLedger',data.membershipBenefitLedger||[]);
      setDatasetValue('membershipAccountEvents',data.membershipAccountEvents||[]);
      setDatasetValue('membershipPlans',data.membershipPlans||[]);
      setDatasetValue('coaches',data.coaches||[]);
      setDatasetValue('customerLifecycleRows',data.customerLifecycleRows||[],{persist:false});
      staleCachedDatasets.delete('campuses');
      staleCachedDatasets.delete('students');
      staleCachedDatasets.delete('courts');
      staleCachedDatasets.delete('membershipAccounts');
      staleCachedDatasets.delete('membershipOrders');
      staleCachedDatasets.delete('membershipBenefitLedger');
      staleCachedDatasets.delete('membershipAccountEvents');
      staleCachedDatasets.delete('membershipPlans');
      staleCachedDatasets.delete('coaches');
      staleCachedDatasets.delete('customerLifecycleRows');
      loadedDatasets.add('membershipsPage');
      return;
    }
    if(name==='workbenchPage'){
      setDatasetValue('campuses',data.campuses||[]);
      setDatasetValue('students',data.students||[]);
      setDatasetValue('classes',data.classes||[]);
      setDatasetValue('schedule',data.schedule||[]);
      setDatasetValue('feedbacks',data.feedbacks||[]);
      setDatasetValue('coachProposals',data.coachProposals||[]);
      setDatasetValue('purchases',data.purchases||[]);
      setDatasetValue('entitlements',data.entitlements||[]);
      setDatasetValue('entitlementLedger',data.entitlementLedger||[]);
      setDatasetValue('customerLifecycleRows',data.customerLifecycleRows||[],{persist:false});
      staleCachedDatasets.delete('campuses');
      staleCachedDatasets.delete('students');
      staleCachedDatasets.delete('classes');
      staleCachedDatasets.delete('schedule');
      staleCachedDatasets.delete('feedbacks');
      staleCachedDatasets.delete('coachProposals');
      staleCachedDatasets.delete('purchases');
      staleCachedDatasets.delete('entitlements');
      staleCachedDatasets.delete('entitlementLedger');
      staleCachedDatasets.delete('customerLifecycleRows');
      window.coachWorkbenchStats=data.stats||{};
      loadedDatasets.add('workbenchPage');
      return;
    }
    setDatasetValue(name,data);
    staleCachedDatasets.delete(name);
  });
  CAMPUS={};campuses.forEach(x=>{CAMPUS[x.code||x.id]=x.name||x.code||x.id;});
  lastDataSyncAt=Date.now();
}
async function ensurePageDatasets(pg,{force=false}={}){
  const names=requiredDatasetsForPage(pg);
  if(!names.length)return;
  await ensureDatasetsByName(names,{force:force||pg==='packages'});
}
async function loadPageBackgroundDatasets(pg,requestVersion,{force=false}={}){
  const immediateNames=backgroundDatasetsForPage(pg);
  if(immediateNames.length){
    await Promise.allSettled(immediateNames.map(async name=>{
      if(requestVersion!==dataRequestVersion)return;
      try{
        await ensureDatasetsByName([name],{force});
      }catch(e){
        if(requestVersion!==dataRequestVersion)return;
        console.warn('deferred page data load failed',pg,name,e);
      }
    }));
  }
  if(requestVersion!==dataRequestVersion)return;
  buildCampusTabs();
  renderAll();
  if(isStudentListPage(pg)&&STUDENT_PAGE_DEFERRED_REQUIREMENTS.length){
    setTimeout(()=>{
      if(requestVersion!==dataRequestVersion)return;
      ensureDatasetsByName(STUDENT_PAGE_DEFERRED_REQUIREMENTS,{force})
        .then(()=>{
          if(requestVersion!==dataRequestVersion)return;
          buildCampusTabs();
          renderAll();
        })
        .catch(e=>{
          if(requestVersion!==dataRequestVersion)return;
          console.warn('deferred student data load failed',pg,e);
        });
    },1200);
    return;
  }
}
function clearLoadedData(){
  leads=[];leadFollowups=[];courts=[];students=[];products=[];packages=[];purchases=[];entitlements=[];entitlementLedger=[];financialLedger=[];
  membershipPlans=[];membershipAccounts=[];membershipOrders=[];membershipBenefitLedger=[];membershipAccountEvents=[];pricePlans=[];
  plans=[];schedules=[];coaches=[];classes=[];campuses=[];feedbacks=[];coachProposals=[];adminUsers=[];matches=[];adminUsersLoaded=false;
  financeOverviewData=null;financeNormalizedLedgerRows=[];financeSettlementSummaryRows=[];operationsPageData=null;
  courtAccountListViewData=null;courtAccountListViewCompareData=null;
  packageBoardColumnOrder=[];
  loadedDatasets=new Set();
  staleCachedDatasets=new Set();
}
function normalizeCurrentPageForRole(){
  const isCoach=currentUser?.role==='editor'&&currentUser?.coachName;
  if(currentPage==='myschedule')currentPage='workbench';
  if(isCoach){
    if(!['workbench','postfeedback','mystudents','myclasses'].includes(currentPage))currentPage='workbench';
    localStorage.setItem(PAGE_KEY,currentPage);
    campus='all';
    localStorage.setItem(CAMPUS_KEY,campus);
    return;
  }
  if(currentUser?.role==='admin'&&['workbench','postfeedback','mystudents','myclasses'].includes(currentPage)){
    currentPage='students';
    localStorage.setItem(PAGE_KEY,currentPage);
  }
}
function applyLoadedData(data){
  courts=Array.isArray(data?.courts)?data.courts:[];
  students=Array.isArray(data?.students)?data.students:[];
  products=Array.isArray(data?.products)?data.products:[];
  packages=Array.isArray(data?.packages)?data.packages:[];
  packageBoardColumnOrder=Array.isArray(data?.packageBoardPreferences?.columnOrder)?data.packageBoardPreferences.columnOrder:[];
  purchases=Array.isArray(data?.purchases)?data.purchases:[];
  entitlements=Array.isArray(data?.entitlements)?data.entitlements:[];
  entitlementLedger=Array.isArray(data?.entitlementLedger)?data.entitlementLedger:[];
  financialLedger=Array.isArray(data?.financialLedger)?data.financialLedger:[];
  membershipPlans=Array.isArray(data?.membershipPlans)?data.membershipPlans:[];
  membershipAccounts=Array.isArray(data?.membershipAccounts)?data.membershipAccounts:[];
  membershipOrders=Array.isArray(data?.membershipOrders)?data.membershipOrders:[];
  membershipBenefitLedger=Array.isArray(data?.membershipBenefitLedger)?data.membershipBenefitLedger:[];
  membershipAccountEvents=Array.isArray(data?.membershipAccountEvents)?data.membershipAccountEvents:[];
  pricePlans=Array.isArray(data?.pricePlans)?data.pricePlans:[];
  schedules=Array.isArray(data?.schedule)?data.schedule:[];
  coaches=Array.isArray(data?.coaches)?data.coaches:[];
  classes=Array.isArray(data?.classes)?data.classes:[];
  campuses=Array.isArray(data?.campuses)?data.campuses.map(row=>({...row,name:campusDisplayName(row?.name||row?.code||row?.id)})):[];
  feedbacks=Array.isArray(data?.feedbacks)?data.feedbacks:[];
  coachProposals=Array.isArray(data?.coachProposals)?data.coachProposals:[];
  matches=Array.isArray(data?.matches)?data.matches:[];
  financeOverviewData=data?.financeOverviewData||null;
  financeNormalizedLedgerRows=Array.isArray(data?.financeNormalizedRows)?data.financeNormalizedRows:[];
  financeSettlementSummaryRows=Array.isArray(data?.financeSettlementRows)?data.financeSettlementRows:[];
  operationsPageData=data?.operations||null;
  customerLifecycleRows=Array.isArray(data?.customerLifecycleRows)?data.customerLifecycleRows:[];
  loadedDatasets=new Set(['courts','students','products','packages','purchases','entitlements','entitlementLedger','financialLedger','membershipPlans','membershipAccounts','membershipOrders','membershipBenefitLedger','membershipAccountEvents','pricePlans','plans','schedule','coaches','classes','campuses','feedbacks','coachProposals','matches','customerLifecycleRows']);
  if(data?.user){
    currentUser=data.user;
    localStorage.setItem('ft_user',JSON.stringify(currentUser));
    normalizeCurrentPageForRole();
    renderRoleShell();
  }
  CAMPUS={};campuses.forEach(x=>{CAMPUS[x.code||x.id]=campusDisplayName(x.name||x.code||x.id);});
  lastDataSyncAt=Date.now();
}
async function loadPageDataAndRender(pg,{quiet=false,force=false}={}){
  const requestVersion=++dataRequestVersion;
  const loading=document.getElementById('pageLoading');
  if(!quiet&&loading)loading.classList.add('show');
  try{
    if(quiet&&loadedDatasets.size){
      buildCampusTabs();
      renderAll();
    }
    await ensurePageDatasets(pg,{force});
    if(pg==='courts'||pg==='memberships'){
      try{
        const needsCompare=shouldLoadCourtReadModelCompare();
        await loadCourtReadModelGuardData({force});
        if(force){
          loadCourtReadModelCompareData({force:true}).then(()=>{
            if(requestVersion!==dataRequestVersion)return;
            if(currentPage!=='courts')return;
            renderCourts();
          }).catch(e=>{
            if(requestVersion!==dataRequestVersion)return;
            console.warn('court read model compare refresh failed',e);
          });
        }else if(needsCompare&&window.__courtAccountListViewCompare==null){
          loadCourtReadModelCompareData({force:false}).then(()=>{
            if(requestVersion!==dataRequestVersion)return;
            if(currentPage!=='courts')return;
            renderCourts();
          }).catch(e=>{
            if(requestVersion!==dataRequestVersion)return;
            console.warn('court read model compare load failed',e);
          });
        }
      }catch(e){
        courtAccountListViewData=null;
        courtAccountListViewCompareData=null;
        window.__courtAccountListViewData=null;
        window.__courtAccountListViewCompare=null;
        console.warn('court read model guard load failed',e);
      }
    }
    if(requestVersion!==dataRequestVersion)return;
    buildCampusTabs();
    renderAll();
    openPendingScheduleDeepLink();
    loadPageBackgroundDatasets(pg,requestVersion,{force});
  }catch(e){
    if(requestVersion!==dataRequestVersion)return;
    if(String(e.message||'').includes('Token')||String(e.message||'').includes('登录')){doLogout();return;}
    if(pg==='students')renderStudentTableError(String(e.message||e));
    if(isStudentListPage(pg)&&pg!=='students')renderStudentTableError(String(e.message||e));
    if(pg==='leads')renderLeadTableError(String(e.message||e));
    if(pg==='schedule')renderScheduleTableError(String(e.message||e));
    if(pg==='courts')renderCourtTableError(String(e.message||e));
    toast('加载失败：'+e.message,'error');
  }finally{
    if(!quiet&&loading)loading.classList.remove('show');
  }
}
async function reloadOperationsPageDataWithInlineLoading(){
  const requestSeq=++operationsPageRequestSeq;
  if(typeof renderOperationsLoading==='function')renderOperationsLoading();
  try{
    await ensureDatasetsByName(['operationsPage'],{force:true});
    if(requestSeq!==operationsPageRequestSeq)return;
    if(currentPage==='operations')renderOperations();
  }catch(e){
    if(requestSeq!==operationsPageRequestSeq)return;
    if(String(e.message||'').includes('Token')||String(e.message||'').includes('登录')){doLogout();return;}
    toast('加载失败：'+e.message,'error');
  }
}
function refreshOperationsPageDataInBackground(){
  const requestSeq=++operationsPageBackgroundRefreshSeq;
  ensureDatasetsByName(['operationsPage'],{force:true}).then(()=>{
    if(requestSeq!==operationsPageBackgroundRefreshSeq)return;
    if(currentPage==='operations')renderOperations();
  }).catch(e=>{
    if(String(e.message||'').includes('Token')||String(e.message||'').includes('登录')){doLogout();return;}
    console.warn('operations background refresh failed',e);
  });
}
async function loadCourtReadModelGuardData({force=false}={}){
  if(!shouldUseCourtReadModelByDefault()){
    courtAccountListViewData=null;
    courtAccountListViewCompareData=null;
    window.__courtAccountListViewData=null;
    window.__courtAccountListViewCompare=null;
    return;
  }
  if(courtAccountListViewData&&!force)return;
  const view=await DATASET_LOADERS.courtAccountListViewPage();
  courtAccountListViewData=view||null;
  window.__courtAccountListViewData=courtAccountListViewData;
}
async function loadCourtReadModelCompareData({force=false}={}){
  if(!shouldLoadCourtReadModelCompare()){
    courtAccountListViewCompareData=null;
    window.__courtAccountListViewCompare=null;
    return;
  }
  if(courtAccountListViewCompareData&&!force)return;
  const compare=await DATASET_LOADERS.courtAccountListViewComparePage();
  courtAccountListViewCompareData=compare||null;
  window.__courtAccountListViewCompare=courtAccountListViewCompareData;
}
async function loadAll(){
  const requestVersion=++dataRequestVersion;
  const loading=document.getElementById('pageLoading');
  if(loading)loading.classList.add('show');
  try{
    if(requestVersion!==dataRequestVersion)return;
    await ensureDatasetsByName(GLOBAL_DATASET_NAMES,{force:true});
    buildCampusTabs();
    renderAll();
  }catch(e){
    if(requestVersion!==dataRequestVersion)return;
    if(e.message.includes('Token')||e.message.includes('登录')){doLogout();return;}
    clearLoadedData();
    normalizeCurrentPageForRole();
    buildCampusTabs();
    renderAll();
    toast('加载失败：'+e.message,'error');
  }finally{
    if(loading)loading.classList.remove('show');
  }
}
async function syncAllQuietly(){
  if(isSyncingAll||!currentUser)return;
  if(document.hidden)return;
  if(typeof document.hasFocus==='function'&&!document.hasFocus())return;
  if(document.getElementById('overlay')?.classList.contains('open'))return;
  if(document.getElementById('importOv')?.classList.contains('open'))return;
  if(document.getElementById('confOv')?.classList.contains('open'))return;
  isSyncingAll=true;
  try{
    await loadPageDataAndRender(currentPage,{quiet:true,force:true});
  }catch(e){
    if(String(e.message||'').includes('Token')||String(e.message||'').includes('登录'))doLogout();
  }finally{isSyncingAll=false;}
}
function syncAllIfStale(){
  if(Date.now()-lastDataSyncAt>60000)syncAllQuietly();
}
window.addEventListener('focus',syncAllIfStale);
document.addEventListener('visibilitychange',()=>{if(!document.hidden)syncAllIfStale();});
setInterval(syncAllQuietly,180000);
function buildCampusTabs(){
  const el=document.getElementById('campusTabs');
  if(!el)return;
  if(globalTopFilterPages().includes(currentPage)){
    el.innerHTML=renderGlobalTopFilters();
    return;
  }
  if(currentPage==='courts'){
    if(typeof renderCourtTopFilters==='function'){
      el.innerHTML=renderCourtTopFilters();
    }else{
      el.innerHTML='';
    }
    return;
  }
  if(currentPage==='coachschedule'||currentPage==='coachops'){
    if(typeof renderCoachOpsTopFilters==='function'){
      el.innerHTML=renderCoachOpsTopFilters();
    }else{
      el.innerHTML='';
    }
    return;
  }
  if(currentPage==='packages'){
    if(typeof renderPackageTopFilters==='function'){
      el.innerHTML=renderPackageTopFilters();
    }else{
      el.innerHTML='';
    }
    return;
  }
  if(currentPage==='purchases'){
    if(typeof renderPurchaseTopFilters==='function'){
      el.innerHTML=renderPurchaseTopFilters();
    }else{
      el.innerHTML='';
    }
    return;
  }
  const visibleCampuses=typeof accessibleCampusRows==='function'?accessibleCampusRows():campuses;
  el.innerHTML='<button class="ctab'+(campus==='all'?' active':'')+'" onclick="setCampus(this,\'all\')">全部</button>'+visibleCampuses.map(c=>`<button class="ctab${campus===(c.code||c.id)?' active':''}" onclick="setCampus(this,'${c.code||c.id}')">${esc(c.name)}</button>`).join('');
}
function renderAll(){
  renderRoleShell();
  const isCoach=currentUser?.role==='editor'&&currentUser?.coachName;
  if(currentPage==='myschedule')currentPage='workbench';
  currentPage=normalizeStudentListPage(currentPage);
  if(isCoach&&!['workbench','postfeedback','mystudents','myclasses'].includes(currentPage))currentPage='workbench';
  else if(currentUser?.role==='admin'&&['workbench','postfeedback','mystudents','myclasses'].includes(currentPage))currentPage='package-students';
  else if(currentUser?.role!=='admin'&&!isCoach){doLogout();return;}
  renderPageData(currentPage);
  goPage(currentPage,null,true);
}

function renderPageData(pg){
  if(pageNeedsInlineLoading(pg)){
    if(pg==='operations'&&hydrateOperationsPageFromClientCache()){
      refreshOperationsPageDataInBackground();
      return;
    }
    renderPageLoading(pg);
    return;
  }
  if(pg==='students')renderStudents();
  if(isStudentListPage(pg)&&pg!=='students')renderStudents();
  if(pg==='leads')renderLeads();
  if(pg==='operations')renderOperations();
  if(pg==='schedule')renderSchedule();
  if(pg==='coachschedule'||pg==='coachops')renderCoachOps();
  if(pg==='finance')renderFinanceCenter();
  if(pg==='products')renderProducts();
  if(pg==='packages')renderPackages();
  if(pg==='purchases')renderPurchases();
  if(pg==='prices')renderPrices();
  if(pg==='entitlements')renderEntitlements();
  if(pg==='coaches')renderCoaches();
  if(pg==='admin-users')loadAdminUsers();
  if(pg==='courts')renderCourts();
  if(pg==='matches')renderMatches();
  if(pg==='memberships')renderMemberships();
  if(pg==='membership-orders')renderMembershipOrdersAuditPage();
  if(pg==='membership-ledger')renderMembershipLedgerAuditPage();
  if(pg==='membership-plans')renderMembershipPlans();
  if(pg==='campusmgr')renderCampuses();
  if(pg==='workbench')renderWorkbench();
  if(pg==='postfeedback')renderPostClassFeedback();
  if(pg==='mystudents')renderMyStudents();
  if(pg==='myclasses')renderMyClasses();
}
