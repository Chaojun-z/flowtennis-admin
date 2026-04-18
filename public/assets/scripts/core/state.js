function syncViewportMode(){
  const isCoach=currentUser?.role==='editor'&&currentUser?.coachName;
  const isMobile=window.innerWidth<=900;
  document.body.classList.toggle('coach-mobile',!!(isCoach&&isMobile));
  document.body.classList.toggle('admin-mobile',!!(!isCoach&&isMobile&&currentUser));
}

let courts=[],students=[],products=[],packages=[],purchases=[],entitlements=[],entitlementLedger=[],membershipPlans=[],membershipAccounts=[],membershipOrders=[],membershipBenefitLedger=[],membershipAccountEvents=[],pricePlans=[],plans=[],schedules=[],coaches=[],classes=[],campuses=[],feedbacks=[],adminUsers=[];
let adminUsersLoaded=false;
let modalCleanupTimer=null;
let lastDataSyncAt=0,isSyncingAll=false,dataRequestVersion=0;
let loadedDatasets=new Set();
const DATA_CACHE_PREFIX='ft_dataset_cache_';
const DATA_CACHE_VERSION_KEY='ft_dataset_cache_version';
const DATA_CACHE_VERSION='2026-04-18-safe-list-cache';
const DATASETS_EXCLUDED_FROM_CACHE=new Set(['entitlementLedger']);
const datasetLoadPromises=new Map();
const PAGE_DATA_REQUIREMENTS={
  students:['campuses','students'],
  classes:['campuses','students','products','classes','schedule','coaches'],
  plans:[],
  schedule:['campuses','students','classes','schedule','feedbacks','entitlements','entitlementLedger','coaches','products'],
  coachops:['campuses','students','classes','schedule','feedbacks','entitlements','entitlementLedger','coaches','products','purchases','packages'],
  finance:[],
  products:['products','classes','plans'],
  packages:[],
  purchases:[],
  entitlements:['entitlements','students'],
  coaches:['coaches'],
  'admin-users':[],
  courts:[],
  memberships:[],
  'membership-orders':['campuses','students','courts','membershipPlans','membershipAccounts','membershipOrders','membershipBenefitLedger','membershipAccountEvents','coaches'],
  'membership-ledger':['campuses','students','courts','membershipPlans','membershipAccounts','membershipOrders','membershipBenefitLedger','membershipAccountEvents','coaches'],
  'membership-plans':['membershipPlans','membershipOrders','campuses','coaches'],
  prices:['campuses','pricePlans'],
  campusmgr:['campuses'],
  workbench:[],
  myschedule:[],
  mystudents:[],
  myclasses:[]
};
const PAGE_DATA_BACKGROUND_REQUIREMENTS={
  students:['entitlements','entitlementLedger','classes','schedule','feedbacks','products','courts'],
  plans:['plansPage'],
  packages:['packages','products'],
  purchases:['purchasesPage'],
  finance:['financePage'],
  courts:['courtsPage'],
  memberships:['membershipsPage'],
  workbench:['workbenchPage'],
  myschedule:['campuses','students','classes','schedule','feedbacks'],
  mystudents:['campuses','students','classes','schedule','feedbacks','entitlements'],
  myclasses:['students','classes','products']
};
const DATASET_LOADERS={
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
  plans:()=>apiCall('GET','/plans'),
  schedule:()=>apiCall('GET','/schedule'),
  coaches:()=>apiCall('GET','/coaches'),
  classes:()=>apiCall('GET','/classes'),
  campuses:()=>apiCall('GET','/campuses'),
  feedbacks:()=>apiCall('GET','/feedbacks')
  ,plansPage:()=>apiCall('GET','/page-data/plans')
  ,purchasesPage:()=>apiCall('GET','/page-data/purchases')
  ,financePage:()=>apiCall('GET','/page-data/finance')
  ,courtsPage:()=>apiCall('GET','/page-data/courts')
  ,membershipsPage:()=>apiCall('GET','/page-data/memberships')
  ,workbenchPage:()=>apiCall('GET','/page-data/workbench')
};
function datasetCacheKey(name){
  return DATA_CACHE_PREFIX+(currentUser?.id||'anon')+'_'+name;
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
function persistDatasetCache(name,data){
  if(DATASETS_EXCLUDED_FROM_CACHE.has(name))return;
  try{localStorage.setItem(datasetCacheKey(name),JSON.stringify({savedAt:Date.now(),data:Array.isArray(data)?data:[]}));}catch(e){}
}
function readDatasetCache(name){
  if(DATASETS_EXCLUDED_FROM_CACHE.has(name))return null;
  try{
    const raw=localStorage.getItem(datasetCacheKey(name));
    if(!raw)return null;
    const parsed=JSON.parse(raw);
    return Array.isArray(parsed?.data)?parsed.data:null;
  }catch(e){return null;}
}
function setDatasetValue(name,data,{persist=true}={}){
  const rows=Array.isArray(data)?data:[];
  if(name==='courts')courts=rows;
  if(name==='students')students=rows;
  if(name==='products')products=rows;
  if(name==='packages')packages=rows;
  if(name==='purchases')purchases=rows;
  if(name==='entitlements')entitlements=rows;
  if(name==='entitlementLedger')entitlementLedger=rows;
  if(name==='membershipPlans')membershipPlans=rows;
  if(name==='membershipAccounts')membershipAccounts=rows;
  if(name==='membershipOrders')membershipOrders=rows;
  if(name==='membershipBenefitLedger')membershipBenefitLedger=rows;
  if(name==='membershipAccountEvents')membershipAccountEvents=rows;
  if(name==='pricePlans')pricePlans=rows;
  if(name==='plans')plans=rows;
  if(name==='schedule')schedules=rows;
  if(name==='coaches')coaches=rows;
  if(name==='classes')classes=rows;
  if(name==='campuses')campuses=rows;
  if(name==='feedbacks')feedbacks=rows;
  loadedDatasets.add(name);
  if(persist)persistDatasetCache(name,rows);
}
function hydrateDatasetsFromCache(){
  ensureDatasetCacheVersion();
  Object.keys(DATASET_LOADERS).forEach(name=>{
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
  const fallback={
    plansPage:['plans'],
    purchasesPage:['purchases'],
    financePage:['purchases','entitlementLedger'],
    courtsPage:['courts'],
    membershipsPage:['courts','membershipAccounts'],
    workbenchPage:['schedule']
  };
  return backgroundDatasetsForPage(pg).flatMap(name=>fallback[name]||[name]);
}
function missingInitialDatasetsForPage(pg){
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
function renderBlockLoading(id,text){
  const el=document.getElementById(id);
  if(el)el.innerHTML=`<div class="empty"><p>${esc(text)}</p></div>`;
}
function renderPageLoading(pg){
  if(pg==='students')renderTableBodyLoading('stuTbody',13,'学员数据加载中...');
  if(pg==='plans')renderTableBodyLoading('planTbody',10,'学习计划加载中...');
  if(pg==='packages')renderBlockLoading('packageGrid','售卖课包加载中...');
  if(pg==='purchases')renderTableBodyLoading('purchaseTbody',9,'购买记录加载中...');
  if(pg==='finance'){
    renderTableBodyLoading('coachOpsRevenueTbody',14,'财务数据加载中...');
    renderTableBodyLoading('coachOpsConsumeTbody',12,'消课记录加载中...');
  }
  if(pg==='courts')renderTableBodyLoading('courtTbody',17,'订场用户加载中...');
  if(pg==='memberships')renderBlockLoading('membershipTabBody','会员数据加载中...');
  if(pg==='workbench')renderBlockLoading('workbenchBody','教练工作台加载中...');
  if(pg==='myschedule')renderBlockLoading('myScheduleBody','课表加载中...');
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
      setDatasetValue('students',data.students||[]);
      setDatasetValue('schedule',data.schedule||[]);
      setDatasetValue('entitlements',data.entitlements||[]);
      setDatasetValue('entitlementLedger',data.entitlementLedger||[]);
      setDatasetValue('coaches',data.coaches||[]);
      setDatasetValue('products',data.products||[]);
      setDatasetValue('purchases',data.purchases||[]);
      setDatasetValue('packages',data.packages||[]);
      loadedDatasets.add('financePage');
      return;
    }
    if(name==='courtsPage'){
      setDatasetValue('campuses',data.campuses||[]);
      setDatasetValue('students',data.students||[]);
      setDatasetValue('courts',data.courts||[]);
      setDatasetValue('membershipAccounts',data.membershipAccounts||[]);
      setDatasetValue('coaches',data.coaches||[]);
      setDatasetValue('pricePlans',data.pricePlans||[]);
      loadedDatasets.add('courtsPage');
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
  const names=backgroundDatasetsForPage(pg);
  if(!names.length)return;
  await Promise.allSettled(names.map(async name=>{
    if(requestVersion!==dataRequestVersion)return;
    try{
      await ensureDatasetsByName([name],{force});
    }catch(e){
      if(requestVersion!==dataRequestVersion)return;
      console.warn('deferred page data load failed',pg,name,e);
    }
  }));
  if(requestVersion!==dataRequestVersion)return;
  buildCampusTabs();
  renderAll();
}
function clearLoadedData(){
  courts=[];students=[];products=[];packages=[];purchases=[];entitlements=[];entitlementLedger=[];
  membershipPlans=[];membershipAccounts=[];membershipOrders=[];membershipBenefitLedger=[];membershipAccountEvents=[];pricePlans=[];
  plans=[];schedules=[];coaches=[];classes=[];campuses=[];feedbacks=[];adminUsers=[];adminUsersLoaded=false;
  loadedDatasets=new Set();
}
function normalizeCurrentPageForRole(){
  const isCoach=currentUser?.role==='editor'&&currentUser?.coachName;
  if(isCoach){
    if(!['workbench','myschedule','mystudents','myclasses'].includes(currentPage))currentPage='workbench';
    localStorage.setItem(PAGE_KEY,currentPage);
    campus='all';
    localStorage.setItem(CAMPUS_KEY,campus);
    return;
  }
  if(currentUser?.role==='admin'&&['workbench','myschedule','mystudents','myclasses'].includes(currentPage)){
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
  membershipPlans=Array.isArray(data?.membershipPlans)?data.membershipPlans:[];
  membershipAccounts=Array.isArray(data?.membershipAccounts)?data.membershipAccounts:[];
  membershipOrders=Array.isArray(data?.membershipOrders)?data.membershipOrders:[];
  membershipBenefitLedger=Array.isArray(data?.membershipBenefitLedger)?data.membershipBenefitLedger:[];
  membershipAccountEvents=Array.isArray(data?.membershipAccountEvents)?data.membershipAccountEvents:[];
  pricePlans=Array.isArray(data?.pricePlans)?data.pricePlans:[];
  plans=Array.isArray(data?.plans)?data.plans:[];
  schedules=Array.isArray(data?.schedule)?data.schedule:[];
  coaches=Array.isArray(data?.coaches)?data.coaches:[];
  classes=Array.isArray(data?.classes)?data.classes:[];
  campuses=Array.isArray(data?.campuses)?data.campuses:[];
  feedbacks=Array.isArray(data?.feedbacks)?data.feedbacks:[];
  loadedDatasets=new Set(['courts','students','products','packages','purchases','entitlements','entitlementLedger','membershipPlans','membershipAccounts','membershipOrders','membershipBenefitLedger','membershipAccountEvents','pricePlans','plans','schedule','coaches','classes','campuses','feedbacks']);
  if(data?.user){
    currentUser=data.user;
    localStorage.setItem('ft_user',JSON.stringify(currentUser));
    normalizeCurrentPageForRole();
    renderRoleShell();
  }
  CAMPUS={};campuses.forEach(x=>{CAMPUS[x.code||x.id]=x.name||x.code||x.id;});
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
    if(requestVersion!==dataRequestVersion)return;
    buildCampusTabs();
    renderAll();
    loadPageBackgroundDatasets(pg,requestVersion,{force:true});
  }catch(e){
    if(requestVersion!==dataRequestVersion)return;
    if(String(e.message||'').includes('Token')||String(e.message||'').includes('登录')){doLogout();return;}
    toast('加载失败：'+e.message,'error');
  }finally{
    if(!quiet&&loading)loading.classList.remove('show');
  }
}
async function loadAll(){
  const requestVersion=++dataRequestVersion;
  const loading=document.getElementById('pageLoading');
  if(loading)loading.classList.add('show');
  try{
    const data=await apiCall('GET','/load-all');
    if(requestVersion!==dataRequestVersion)return;
    applyLoadedData(data);
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
  if(isCoach&&!['workbench','myschedule','mystudents','myclasses'].includes(currentPage))currentPage='workbench';
  else if(currentUser?.role==='admin'&&['workbench','myschedule','mystudents','myclasses'].includes(currentPage))currentPage='students';
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
  if(pg==='classes')renderClasses();
  if(pg==='plans')renderPlans();
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
  if(pg==='memberships')renderMemberships();
  if(pg==='membership-orders')renderMembershipOrdersAuditPage();
  if(pg==='membership-ledger')renderMembershipLedgerAuditPage();
  if(pg==='membership-plans')renderMembershipPlans();
  if(pg==='campusmgr')renderCampuses();
  if(pg==='workbench')renderWorkbench();
  if(pg==='myschedule')renderMySchedule();
  if(pg==='mystudents')renderMyStudents();
  if(pg==='myclasses')renderMyClasses();
}
