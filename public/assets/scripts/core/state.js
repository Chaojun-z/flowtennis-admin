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
const PAGE_DATA_REQUIREMENTS={
  students:[],
  classes:['campuses','students','products','classes','schedule','coaches'],
  plans:[],
  schedule:['campuses','students','classes','schedule','feedbacks','entitlements','entitlementLedger','coaches','products'],
  coachops:['campuses','students','classes','schedule','feedbacks','entitlements','entitlementLedger','coaches','products','purchases','packages'],
  finance:['campuses','students','schedule','entitlements','entitlementLedger','coaches','products','purchases','packages'],
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
  students:['campuses','students','courts','classes','schedule','feedbacks','products'],
  plans:['campuses','students','classes','plans','products','schedule','courts','entitlements'],
  packages:['packages','products'],
  purchases:['purchases','packages','students','entitlements'],
  finance:['campuses','students','schedule','entitlements','entitlementLedger','coaches','products','purchases','packages'],
  courts:['campuses','students','courts','membershipAccounts','coaches','pricePlans'],
  memberships:['campuses','students','courts','membershipAccounts','coaches'],
  workbench:['campuses','students','classes','schedule','feedbacks'],
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
};
function setDatasetValue(name,data){
  if(name==='courts')courts=Array.isArray(data)?data:[];
  if(name==='students')students=Array.isArray(data)?data:[];
  if(name==='products')products=Array.isArray(data)?data:[];
  if(name==='packages')packages=Array.isArray(data)?data:[];
  if(name==='purchases')purchases=Array.isArray(data)?data:[];
  if(name==='entitlements')entitlements=Array.isArray(data)?data:[];
  if(name==='entitlementLedger')entitlementLedger=Array.isArray(data)?data:[];
  if(name==='membershipPlans')membershipPlans=Array.isArray(data)?data:[];
  if(name==='membershipAccounts')membershipAccounts=Array.isArray(data)?data:[];
  if(name==='membershipOrders')membershipOrders=Array.isArray(data)?data:[];
  if(name==='membershipBenefitLedger')membershipBenefitLedger=Array.isArray(data)?data:[];
  if(name==='membershipAccountEvents')membershipAccountEvents=Array.isArray(data)?data:[];
  if(name==='pricePlans')pricePlans=Array.isArray(data)?data:[];
  if(name==='plans')plans=Array.isArray(data)?data:[];
  if(name==='schedule')schedules=Array.isArray(data)?data:[];
  if(name==='coaches')coaches=Array.isArray(data)?data:[];
  if(name==='classes')classes=Array.isArray(data)?data:[];
  if(name==='campuses')campuses=Array.isArray(data)?data:[];
  if(name==='feedbacks')feedbacks=Array.isArray(data)?data:[];
  loadedDatasets.add(name);
}
function requiredDatasetsForPage(pg){
  return PAGE_DATA_REQUIREMENTS[pg]||[];
}
function backgroundDatasetsForPage(pg){
  return PAGE_DATA_BACKGROUND_REQUIREMENTS[pg]||[];
}
async function ensureDatasetsByName(names=[],{force=false}={}){
  const pending=(names||[]).filter(name=>force||!loadedDatasets.has(name));
  if(!pending.length)return;
  const results=await Promise.all(pending.map(name=>DATASET_LOADERS[name]().then(data=>[name,data])));
  results.forEach(([name,data])=>setDatasetValue(name,data));
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
  for(const name of names){
    if(requestVersion!==dataRequestVersion)return;
    try{
      await ensureDatasetsByName([name],{force});
      if(requestVersion!==dataRequestVersion)return;
      buildCampusTabs();
      renderAll();
    }catch(e){
      if(requestVersion!==dataRequestVersion)return;
      console.warn('deferred page data load failed',pg,name,e);
    }
  }
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
    await ensurePageDatasets(pg,{force});
    if(requestVersion!==dataRequestVersion)return;
    buildCampusTabs();
    renderAll();
    loadPageBackgroundDatasets(pg,requestVersion,{force});
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
