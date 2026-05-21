function syncViewportMode(){
  const isCoach=currentUser?.role==='editor'&&currentUser?.coachName;
  const isMobile=window.innerWidth<=900;
  document.body.classList.toggle('coach-mobile',!!(isCoach&&isMobile));
  document.body.classList.toggle('admin-mobile',!!(!isCoach&&isMobile&&currentUser));
}

let leads=[],leadFollowups=[];
let courts=[],students=[],products=[],packages=[],purchases=[],entitlements=[],entitlementLedger=[],financialLedger=[],membershipPlans=[],membershipAccounts=[],membershipOrders=[],membershipBenefitLedger=[],membershipAccountEvents=[],pricePlans=[],plans=[],schedules=[],coaches=[],classes=[],campuses=[],feedbacks=[],adminUsers=[],matches=[];
let financeOverviewData=null,financeNormalizedLedgerRows=[],financeSettlementSummaryRows=[];
function financeNormalizedRows(){
  return Array.isArray(financeNormalizedLedgerRows)?financeNormalizedLedgerRows:[];
}
function financeSettlementRowsFromSnapshot(){
  return Array.isArray(financeSettlementSummaryRows)?financeSettlementSummaryRows:[];
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
const DATA_CACHE_PREFIX='ft_dataset_cache_';
const DATA_CACHE_VERSION_KEY='ft_dataset_cache_version';
const DATA_CACHE_VERSION='2026-05-19-private-lesson-live-fix-v1';
const DATASETS_EXCLUDED_FROM_CACHE=new Set(['leads','leadFollowups','students','purchases','entitlements','entitlementLedger']);
const SENSITIVE_DATASETS_EXCLUDED_FROM_CACHE_IN_NON_PRODUCTION=new Set(['financialLedger','purchases','membershipAccounts','membershipOrders','membershipBenefitLedger','membershipAccountEvents']);
const datasetLoadPromises=new Map();
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
  return localStorage.getItem(COURT_READ_MODEL_STORAGE_KEY)==='read-model';
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
  leads:['leads'],
  classes:['campuses','students','products','classes','schedule','coaches'],
  plans:[],
  schedule:['campuses','students','schedule','coaches'],
  coachops:['campuses','students','classes','schedule','feedbacks','entitlements','entitlementLedger','coaches','products','purchases','packages'],
  finance:[],
  products:['products','classes'],
  packages:['packages','products'],
  purchases:[],
  entitlements:['entitlements','students'],
  coaches:['coaches'],
  'admin-users':[],
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
  leads:['leadFollowups'],
  plans:['plansPage'],
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
const STUDENT_PAGE_DEFERRED_REQUIREMENTS=['entitlements','feedbacks','products'];
const PERFORMANCE_PAGE_DATA_GUARD={
  students:['classes','schedule','courts'],
  workbench:['workbenchPage']
};
function assertPageDataPerformanceGuard(){
  Object.entries(PERFORMANCE_PAGE_DATA_GUARD).forEach(([page,expected])=>{
    const actual=PAGE_DATA_BACKGROUND_REQUIREMENTS[page]||[];
    if(actual.join('|')!==expected.join('|'))throw new Error('页面加载策略被改动：'+page);
  });
}
assertPageDataPerformanceGuard();
const DATASET_LOADERS={
  leads:()=>apiCall('GET','/leads'),
  leadFollowups:()=>apiCall('GET','/lead-followups'),
  courts:()=>apiCall('GET','/courts'),
  students:()=>apiCall('GET','/students'),
  products:()=>apiCall('GET','/products'),
  packages:()=>apiCall('GET','/packages'),
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
  classes:()=>apiCall('GET','/classes'),
  campuses:()=>apiCall('GET','/campuses'),
  feedbacks:()=>apiCall('GET','/feedbacks')
  ,plansPage:()=>apiCall('GET','/page-data/plans')
  ,purchasesPage:()=>apiCall('GET','/page-data/purchases')
  ,financePage:()=>apiCall('GET','/page-data/finance')
  ,courtsPage:()=>apiCall('GET','/page-data/courts')
  ,courtAccountListViewPage:()=>apiCall('GET','/page-data/court-account-list-view')
  ,courtAccountListViewComparePage:()=>apiCall('GET','/page-data/court-account-list-view-compare?sample=fixed')
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
function readDatasetCache(name){
  if(shouldBypassDatasetCache(name))return null;
  try{
    const raw=localStorage.getItem(datasetCacheKey(name));
    if(!raw)return null;
    const parsed=JSON.parse(raw);
    return Array.isArray(parsed?.data)?parsed.data:null;
  }catch(e){return null;}
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
  if(name==='matches')matches=rows;
  loadedDatasets.add(name);
  if(persist)persistDatasetCache(name,rows);
}
function noteScheduleLocalMutation(){
  scheduleLocalMutationAt=Date.now();
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
  GLOBAL_DATASET_NAMES.forEach(name=>{
    const cached=readDatasetCache(name);
    if(cached)setDatasetValue(name,cached,{persist:false});
  });
  CAMPUS={};campuses.forEach(x=>{CAMPUS[x.code||x.id]=x.name||x.code||x.id;});
  lastDataSyncAt=Date.now();
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
    plansPage:['plans'],
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
  const el=document.getElementById(id);
  if(el)el.innerHTML=`<tr><td colspan="${colspan}"><div class="empty"><p>${esc(text)}</p></div></td></tr>`;
}
function renderStudentTableLoading(){
  const el=document.getElementById('stuTbody');
  if(el)el.innerHTML='<tr><td colspan="11"><div class="tms-table-loading-state"><span class="tms-loading-dot"></span><p>学员数据加载中...</p></div></td></tr>';
}
function renderStudentTableError(message){
  const el=document.getElementById('stuTbody');
  if(el)el.innerHTML=`<tr><td colspan="11"><div class="tms-table-error-state"><div class="tms-empty-title">加载失败</div><div class="tms-empty-desc">${esc(message||'请稍后重试')}</div><button class="tms-state-action" onclick="loadPageDataAndRender('students',{force:true})">重新加载</button></div></td></tr>`;
}
function renderBlockLoading(id,text){
  const el=document.getElementById(id);
  if(el)el.innerHTML=`<div class="empty"><p>${esc(text)}</p></div>`;
}
function renderPageLoading(pg){
  if(pg==='students')renderStudentTableLoading();
  if(pg==='leads')renderTableBodyLoading('leadTbody',15,'线索数据加载中...');
  if(pg==='plans')renderTableBodyLoading('planTbody',10,'学习计划加载中...');
  if(pg==='packages')renderBlockLoading('packageGrid','售卖课包加载中...');
  if(pg==='purchases')renderTableBodyLoading('purchaseTbody',9,'购买记录加载中...');
  if(pg==='finance'){
    renderTableBodyLoading('financeLedgerTbody',11,'总账加载中...');
    renderTableBodyLoading('financeRevenueTbody',15,'收入表加载中...');
    renderTableBodyLoading('financeConsumeTbody',9,'消耗表加载中...');
    renderTableBodyLoading('financePrepaidTbody',6,'预收余额加载中...');
    renderTableBodyLoading('financeAnomalyTbody',4,'异常检查加载中...');
  }
  if(pg==='coaches')renderTableBodyLoading('coachTbody',7,'教练数据加载中...');
  if(pg==='courts')renderTableBodyLoading('courtTbody',17,'订场用户加载中...');
  if(pg==='matches')renderTableBodyLoading('matchTbody',9,'约球数据加载中...');
  if(pg==='memberships')renderBlockLoading('membershipTabBody','会员数据加载中...');
  if(pg==='workbench')renderBlockLoading('workbenchBody','教练工作台加载中...');
  if(pg==='postfeedback')renderBlockLoading('postFeedbackBody','课后评价加载中...');
  if(pg==='mystudents')renderBlockLoading('myStudentsBody','学员数据加载中...');
  if(pg==='myclasses')renderBlockLoading('myClassesBody','班次数据加载中...');
}
async function ensureDatasetsByName(names=[],{force=false}={}){
  const pending=(names||[]).filter(name=>force||!loadedDatasets.has(name));
  if(!pending.length)return;
  const results=await Promise.all(pending.map(name=>{
    if(datasetLoadPromises.has(name))return datasetLoadPromises.get(name);
    const promise=DATASET_LOADERS[name]().then(data=>[name,data]).finally(()=>datasetLoadPromises.delete(name));
    datasetLoadPromises.set(name,promise);
    return promise;
  }));
  results.forEach(([name,data])=>{
    if(name==='plansPage'){
      setDatasetValue('campuses',data.campuses||[]);
      setDatasetValue('students',data.students||[]);
      setDatasetValue('classes',data.classes||[]);
      setDatasetValue('plans',data.plans||[]);
      setDatasetValue('products',data.products||[]);
      setDatasetValue('schedule',data.schedule||[]);
      setDatasetValue('courts',data.courts||[]);
      setDatasetValue('entitlements',data.entitlements||[]);
      loadedDatasets.add('plansPage');
      return;
    }
    if(name==='purchasesPage'){
      setDatasetValue('purchases',data.purchases||[]);
      setDatasetValue('packages',data.packages||[]);
      setDatasetValue('students',data.students||[]);
      setDatasetValue('entitlements',data.entitlements||[]);
      loadedDatasets.add('purchasesPage');
      return;
    }
    if(name==='financePage'){
      setDatasetValue('campuses',data.campuses||[]);
      financeOverviewData=data.financeOverviewData||null;
      financeNormalizedLedgerRows=Array.isArray(data.financeNormalizedRows)?data.financeNormalizedRows:[];
      financeSettlementSummaryRows=Array.isArray(data.financeSettlementRows)?data.financeSettlementRows:[];
      loadedDatasets.add('financePage');
      return;
    }
    if(name==='courtsPage'){
      setDatasetValue('campuses',data.campuses||[]);
      setDatasetValue('students',data.students||[]);
      setDatasetValue('courts',data.courts||[]);
      loadedDatasets.add('courtsPage');
      return;
    }
    if(name==='matchesPage'){
      setDatasetValue('matches',data.items||[]);
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
      loadedDatasets.add('membershipsPage');
      return;
    }
    if(name==='workbenchPage'){
      setDatasetValue('campuses',data.campuses||[]);
      setDatasetValue('students',data.students||[]);
      setDatasetValue('classes',data.classes||[]);
      setDatasetValue('schedule',data.schedule||[]);
      setDatasetValue('feedbacks',data.feedbacks||[]);
      setDatasetValue('purchases',data.purchases||[]);
      window.coachWorkbenchStats=data.stats||{};
      loadedDatasets.add('workbenchPage');
      return;
    }
    setDatasetValue(name,data);
  });
  CAMPUS={};campuses.forEach(x=>{CAMPUS[x.code||x.id]=x.name||x.code||x.id;});
  lastDataSyncAt=Date.now();
}
async function ensurePageDatasets(pg,{force=false}={}){
  const names=requiredDatasetsForPage(pg);
  if(!names.length)return;
  await ensureDatasetsByName(names,{force});
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
  if(pg==='students'&&STUDENT_PAGE_DEFERRED_REQUIREMENTS.length){
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
  plans=[];schedules=[];coaches=[];classes=[];campuses=[];feedbacks=[];adminUsers=[];matches=[];adminUsersLoaded=false;
  financeOverviewData=null;financeNormalizedLedgerRows=[];financeSettlementSummaryRows=[];
  courtAccountListViewData=null;courtAccountListViewCompareData=null;
  loadedDatasets=new Set();
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
  matches=Array.isArray(data?.matches)?data.matches:[];
  financeOverviewData=data?.financeOverviewData||null;
  financeNormalizedLedgerRows=Array.isArray(data?.financeNormalizedRows)?data.financeNormalizedRows:[];
  financeSettlementSummaryRows=Array.isArray(data?.financeSettlementRows)?data.financeSettlementRows:[];
  loadedDatasets=new Set(['courts','students','products','packages','purchases','entitlements','entitlementLedger','financialLedger','membershipPlans','membershipAccounts','membershipOrders','membershipBenefitLedger','membershipAccountEvents','pricePlans','plans','schedule','coaches','classes','campuses','feedbacks','matches']);
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
    if(pg==='courts'){
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
    toast('加载失败：'+e.message,'error');
  }finally{
    if(!quiet&&loading)loading.classList.remove('show');
  }
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
  el.innerHTML='<button class="ctab'+(campus==='all'?' active':'')+'" onclick="setCampus(this,\'all\')">全部</button>'+campuses.map(c=>`<button class="ctab${campus===(c.code||c.id)?' active':''}" onclick="setCampus(this,'${c.code||c.id}')">${esc(c.name)}</button>`).join('');
}
function renderAll(){
  renderRoleShell();
  initClsCounter();
  const scf=document.getElementById('schCampusFilter');
  if(scf)scf.innerHTML='<option value="">全部校区</option>'+campuses.map(c=>`<option value="${c.code||c.id}">${esc(c.name)}</option>`).join('');
  const isCoach=currentUser?.role==='editor'&&currentUser?.coachName;
  if(currentPage==='myschedule')currentPage='workbench';
  if(isCoach&&!['workbench','postfeedback','mystudents','myclasses'].includes(currentPage))currentPage='workbench';
  else if(currentUser?.role==='admin'&&['workbench','postfeedback','mystudents','myclasses'].includes(currentPage))currentPage='students';
  else if(currentUser?.role!=='admin'&&!isCoach){doLogout();return;}
  renderPageData(currentPage);
  goPage(currentPage,null,true);
}

function renderPageData(pg){
  if(pageNeedsInlineLoading(pg)){
    renderPageLoading(pg);
    return;
  }
  if(pg==='students')renderStudents();
  if(pg==='leads')renderLeads();
  if(pg==='classes')renderClasses();
  if(pg==='schedule')renderSchedule();
  if(pg==='coachops')renderCoachOps();
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
