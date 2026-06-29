let currentPage=normalizeStudentListPage(localStorage.getItem(PAGE_KEY)||'package-students'),campus=localStorage.getItem(CAMPUS_KEY)||'all',globalDateRangeFilterValue=localStorage.getItem(GLOBAL_DATE_RANGE_KEY)||'全部',globalDateRangeStart=localStorage.getItem(GLOBAL_DATE_RANGE_START_KEY)||'',globalDateRangeEnd=localStorage.getItem(GLOBAL_DATE_RANGE_END_KEY)||'',editId=null,delId=null,delType=null,_pending=[];
let batchDeleteCourtIds=[];
let stuPage=1,leadPage=1,schPage=1,courtPage=1,purPage=1,pkgPage=1,pricePage=1,financeLedgerPage=1,financeRevenuePage=1,financeRecognizedPage=1,adminUserPage=1;
let courtSortKey='lastBookingDate',courtSortDir='desc',stuSortKey='packagePurchaseDate',stuSortDir='desc',leadSortKey='',leadSortDir='',courtOwnerFilterValue='',courtAccountTypeFilterValue='',courtCampusFilterValue='',courtDateRangeFilterValue=globalDateRangeFilterValue,courtDateRangeStart=globalDateRangeStart,courtDateRangeEnd=globalDateRangeEnd,leadPageSize=20,stuPageSize=20,schPageSize=20,courtPageSize=20,purPageSize=20,pkgPageSize=20,pricePageSize=20,financeLedgerPageSize=20,financeRevenuePageSize=20,financeRecognizedPageSize=20,adminUserPageSize=20,selectedCourtIds=new Set(),courtBatchMode=false;
let membershipPage=1,membershipPageSize=20,membershipSortKey='firstOpenDate',membershipSortDir='desc';
let membershipOrderAuditPage=1,membershipOrderAuditPageSize=20,membershipLedgerAuditPage=1,membershipLedgerAuditPageSize=20;
let membershipTierFilterValue='';
let purPackageFilterValue='',purOwnerCoachFilterValue='';
let purDateRangeFilterValue='全部',purDateRangeStart='',purDateRangeEnd='';
let coachOpsMode='week',coachOpsPickerMonth=null,financePanel='ledger';

const PAGE_TITLE_MAP={students:'正式学员','package-students':'正式学员','trial-students':'普通学员',leads:'线索池',operations:'经营分析',schedule:'排课管理',coachschedule:'排课日历',coachops:'教练课时统计',products:'课程产品',packages:'课包产品',purchases:'购买记录',finance:'财务总览',coaches:'教练管理','admin-users':'账号管理',courts:'订场用户',memberships:'会员管理','membership-orders':'会员购买记录','membership-ledger':'会员权益流水','membership-plans':'会员方案',prices:'价格方案',campusmgr:'校区管理',matches:'约球活动',workbench:'工作台',postfeedback:'课后评价',mystudents:'我的学员',myclasses:'我的班次'};
const FINANCE_TITLE_MAP={ledger:'财务总览',revenue:'收款流水',recognized:'入账流水',settlement:'教练结算'};
const OPERATIONS_TITLE_MAP={overview:'经营总览',court:'场地运转',conversion:'转化与留存',coach:'教练人效'};
const TOP_TITLE_BREADCRUMBS={
  'membership-orders':{parentPage:'memberships',parentTitle:'会员管理',title:'会员购买记录'},
  'membership-ledger':{parentPage:'memberships',parentTitle:'会员管理',title:'会员权益流水'},
  purchases:{parentPage:'packages',parentTitle:'课包产品',title:'购买记录'}
};
function topTitleParentPage(pg){
  return TOP_TITLE_BREADCRUMBS[pg]?.parentPage||pg;
}
function pageTitleText(pg){
  if(pg==='finance')return FINANCE_TITLE_MAP[financePanel]||PAGE_TITLE_MAP[pg]||'';
  if(pg==='operations'){
    const tab=typeof operationsActiveTab==='undefined'?'overview':operationsActiveTab;
    return OPERATIONS_TITLE_MAP[tab]||PAGE_TITLE_MAP[pg]||'';
  }
  return PAGE_TITLE_MAP[pg]||'';
}
function renderTopTitleHtml(pg){
  const item=TOP_TITLE_BREADCRUMBS[pg];
  if(!item)return esc(pageTitleText(pg));
  return `<span class="top-title-breadcrumb"><button type="button" class="top-title-parent" onclick="goPage('${item.parentPage}')">${esc(item.parentTitle)}</button><span class="top-title-separator">/</span><span class="top-title-current">${esc(item.title)}</span></span>`;
}

function scrollActiveSidebarItemIntoView(){
  const scroller=document.querySelector('.sb-menu-scroll');
  const active=document.querySelector('.sb-menu-scroll .sb-item.active');
  if(!scroller||!active)return;
  const targetTop=active.offsetTop-(scroller.clientHeight-active.offsetHeight)/2;
  scroller.scrollTo({top:Math.max(0,targetTop),behavior:'auto'});
}

function goPage(pg,el,skipRender=false){
  syncViewportMode();
  if(pg==='entitlements')pg='package-students';
  pg=normalizeStudentListPage(pg);
  if(pg==='myschedule')pg='workbench';
  const adminPages=['students','package-students','trial-students','leads','operations','schedule','coachschedule','coachops','products','packages','purchases','finance','coaches','admin-users','courts','memberships','membership-orders','membership-ledger','membership-plans','prices','campusmgr','matches'];
  const coachPages=['workbench','postfeedback','mystudents','myclasses'];
  const isCoach=currentUser?.role==='editor'&&currentUser?.coachName;
  if(currentUser?.role!=='admin'&&adminPages.includes(pg))pg=isCoach?'workbench':'';
  if(currentUser?.role==='admin'&&coachPages.includes(pg))pg='package-students';
  if(!pg)return;
  const updateDOM = () => {
    const activePage=topTitleParentPage(pg);
    document.querySelectorAll('.sb-item').forEach(n=>{
      let matched=false;
      const navPage=n.dataset.navPage;
      const financeNavPanel=n.dataset.financePanel;
      if(navPage){
        matched=navPage===activePage;
        if(matched&&pg==='operations'&&n.dataset.operationsTab){
          const tab=typeof operationsActiveTab==='undefined'?'overview':operationsActiveTab;
          matched=n.dataset.operationsTab===tab;
        }
        if(matched&&pg==='finance'&&financeNavPanel)matched=financeNavPanel===financePanel;
      }else{
        matched=(n.getAttribute('onclick')||'').includes(`goPage('${activePage}'`);
      }
      n.classList.toggle('active',el?n===el:matched);
    });
    document.querySelectorAll('.page-section').forEach(s=>s.classList.remove('active'));
    const targetPage = document.getElementById('page-'+(isStudentListPage(pg)?'students':pg));
    if(targetPage) {
      targetPage.classList.add('active');
    }
    currentPage=pg;
    if(pg==='coachschedule'&&typeof prepareCoachSchedulePageOpen==='function')prepareCoachSchedulePageOpen();
    localStorage.setItem(PAGE_KEY,currentPage);
    document.body.classList.toggle('is-packages-page',pg==='packages');
    document.getElementById('campusTabs').style.display=globalTopFilterPages().includes(pg)||['coachschedule','coachops','courts','packages','purchases'].includes(pg)?'flex':'none';
    if(typeof buildCampusTabs==='function')buildCampusTabs();
    const topTitle=document.getElementById('topTitle');
    if(topTitle)topTitle.innerHTML=renderTopTitleHtml(pg);
    scrollActiveSidebarItemIntoView();
    if(!skipRender){
      renderPageLoading(pg);
      deferPageDataLoad(pg,{quiet:true});
    }
  };
  if(document.startViewTransition) {
    document.startViewTransition(() => updateDOM());
  } else {
    updateDOM();
  }
}
function renderStudentsIfVisible(){
  if(isStudentListPage(currentPage))renderStudents();
  if(currentPage==='mystudents')renderMyStudents();
}
function setCampus(el,c){document.querySelectorAll('.ctab').forEach(b=>b.classList.remove('active'));if(el)el.classList.add('active');campus=c;localStorage.setItem(CAMPUS_KEY,campus);stuPage=standardListFirstPage();leadPage=standardListFirstPage();schPage=standardListFirstPage();courtPage=standardListFirstPage();purPage=standardListFirstPage();pkgPage=standardListFirstPage();pricePage=standardListFirstPage();financeLedgerPage=standardListFirstPage();financeRevenuePage=standardListFirstPage();financeRecognizedPage=standardListFirstPage();adminUserPage=standardListFirstPage();membershipOrderAuditPage=standardListFirstPage();membershipLedgerAuditPage=standardListFirstPage();refreshGlobalTopFilters();if(isStudentListPage(currentPage))renderStudents();if(currentPage==='leads')renderLeads();if(currentPage==='operations')renderOperations();if(currentPage==='schedule')renderSchedule();if(currentPage==='coachschedule'||currentPage==='coachops')renderCoachOps();if(currentPage==='courts')renderCourts();if(currentPage==='finance')renderFinanceCenter();if(currentPage==='matches')renderMatches();if(currentPage==='admin-users')renderAdminUsers();if(currentPage==='coaches')renderCoaches();if(currentPage==='packages')renderPackages();if(currentPage==='purchases')renderPurchases();if(currentPage==='membership-orders')renderMembershipOrdersAuditPage();if(currentPage==='membership-ledger')renderMembershipLedgerAuditPage();if(currentPage==='prices')renderPrices();}
// ===== 教练管理 =====
// ===== 删除 & 通用 =====
function safeConfirmHtml(html){
  const tpl=document.createElement('template');
  tpl.innerHTML=String(html??'');
  tpl.content.querySelectorAll('script,style,iframe,object,embed,link,meta').forEach(node=>node.remove());
  tpl.content.querySelectorAll('*').forEach(node=>{
    [...node.attributes].forEach(attr=>{
      const name=attr.name.toLowerCase();
      const value=String(attr.value||'').trim().toLowerCase();
      if(name.startsWith('on')||((name==='href'||name==='src')&&value.startsWith('javascript:')))node.removeAttribute(attr.name);
    });
  });
  return tpl.innerHTML;
}
function appConfirm(message,{title='请确认',confirmText='确定',danger=false,html=false,hideIcon=false,boxClass=''}={}){
  return new Promise(resolve=>{
    const ov=document.getElementById('confOv'),ci=document.getElementById('confInput'),cb=document.getElementById('confYesBtn'),nb=document.getElementById('confNoBtn');
    const box=ov?.querySelector('.conf-box'),icon=document.getElementById('confIcon'),desc=document.getElementById('confDesc');
    if(box)box.className=`conf-box ${boxClass||''}`.trim();
    document.getElementById('confTitle').textContent=title;
    if(desc){if(html)desc.innerHTML=safeConfirmHtml(message);else desc.textContent=message;}
    if(icon){icon.textContent='!';icon.style.display=hideIcon?'none':'flex';}
    if(ci){ci.value='';ci.style.display='none';ci.oninput=null;}
    if(cb){cb.disabled=false;cb.style.opacity='1';cb.style.cursor='pointer';cb.textContent=confirmText;cb.style.background=danger?'#dc2626':'#2454c5';cb.classList.toggle('neutral',!danger);cb.onclick=function(){closeConf();resolve(true);};}
    if(nb)nb.onclick=function(){closeConf();resolve(false);};
    ov.classList.add('open');
  });
}
function confirmDel(id,name,type){delId=id;delType=type;document.getElementById('confTitle').textContent=type==='court'?'确认删除/隐藏？':'确认删除？';document.getElementById('confIcon').textContent='!';document.getElementById('confDesc').textContent=type==='court'?'即将处理「'+name+'」。没有财务/会员记录会删除；已有记录会隐藏保留数据。请输入「确认删除」。':type==='membership-plan'?'即将删除「'+name+'」。仅草稿/停售且没有购买记录的方案可删除。请输入「确认删除」。':type==='student'?'即将删除学员「'+name+'」及其课包订单、课包余额、扣课记录、单人排课、课后反馈和学员权益记录，并清理订场/线索关联。请输入「确认删除」。':'即将删除「'+name+'」，请输入「确认删除」。';document.getElementById('confOv').classList.add('open');var ci=document.getElementById('confInput');ci.style.display='block';ci.value='';var cb=document.getElementById('confYesBtn');cb.textContent='确认删除';cb.style.background='#dc2626';cb.classList.remove('neutral');cb.onclick=doDelete;cb.disabled=true;cb.style.opacity='0.4';cb.style.cursor='not-allowed';var nb=document.getElementById('confNoBtn');if(nb)nb.onclick=closeConf;ci.oninput=function(){if(ci.value.trim()==='确认删除'){cb.disabled=false;cb.style.opacity='1';cb.style.cursor='pointer';}else{cb.disabled=true;cb.style.opacity='0.4';cb.style.cursor='not-allowed';}};}
function openBatchCourtDeleteConfirm(ids){
  batchDeleteCourtIds=[...ids];
  delId='__batch__';
  delType='court-batch';
  document.getElementById('confTitle').textContent='确认删除/隐藏？';
  document.getElementById('confIcon').textContent='!';
  document.getElementById('confDesc').textContent=`确定处理选中的 ${ids.length} 个订场用户？没有财务/会员记录的会删除；已有记录的会隐藏保留数据。`;
  document.getElementById('confOv').classList.add('open');
  const ci=document.getElementById('confInput');
  const cb=document.getElementById('confYesBtn');
  if(ci){ci.value='';ci.style.display='none';ci.oninput=null;}
  if(cb){cb.disabled=false;cb.style.opacity='1';cb.style.cursor='pointer';cb.textContent='确认处理';cb.style.background='#dc2626';cb.classList.remove('neutral');cb.onclick=doDelete;}
  const nb=document.getElementById('confNoBtn');if(nb)nb.onclick=closeConf;
}
function closeConf(){const ov=document.getElementById('confOv');ov.classList.remove('open');const box=ov?.querySelector('.conf-box');if(box)box.className='conf-box';const icon=document.getElementById('confIcon');if(icon)icon.style.display='flex';delId=null;delType=null;batchDeleteCourtIds=[];const ci=document.getElementById('confInput');if(ci){ci.value='';ci.style.display='block';ci.oninput=null;}const cb=document.getElementById('confYesBtn');if(cb){cb.textContent='确认删除';cb.style.background='#dc2626';cb.classList.remove('neutral');cb.onclick=doDelete;}const nb=document.getElementById('confNoBtn');if(nb)nb.onclick=closeConf;}
function resetModalShell(){
  const ov=document.getElementById('overlay');
  ov.classList.remove('schedule-drawer-overlay');
  ov.classList.remove('student-drawer-overlay');
  ov.onclick=null;
  delete ov.dataset.scheduleDetailId;
  delete ov.dataset.studentDetailId;
  delete ov.dataset.leadDetailId;
  const modal=ov.querySelector('.modal');
  if(modal)modal.className='modal';
  const actions=document.getElementById('mActions');
  if(actions){actions.innerHTML='';actions.style.display='none';actions.className='mactions';}
  document.getElementById('mTitle').textContent='';
  document.getElementById('mBody').innerHTML='';
  editId=null;
  courtFinanceModalId='';
  _pending=[];
}
async function batchDeleteCourts(){
  const ids=[...selectedCourtIds];
  if(!ids.length){toast('请选择要删除的订场用户','warn');return;}
  openBatchCourtDeleteConfirm(ids);
}
async function runBatchDeleteCourts(ids){
  const btn=document.getElementById('courtBatchDelBtn');
  if(btn){btn.disabled=true;btn.textContent=`删除中 0/${ids.length}`;}
  try{
    const result=await apiCall('POST','/courts/batch-delete',{ids},120000);
    if(btn)btn.textContent=`删除中 ${result.success||0}/${ids.length}`;
    const deleted=new Set([...(result.deleted||[]),...(result.archived||[])]);
    courts=courts.filter(u=>!deleted.has(u.id));
    deleted.forEach(id=>selectedCourtIds.delete(id));
    renderCourts();renderStudentsIfVisible();
    toast(`批量处理完成：删除 ${result.success||0} 个，隐藏 ${result.archivedCount||0} 个，跳过 ${result.failed||0} 个`,result.failed?'warn':'success');
  }catch(e){
    toast('批量删除失败：'+e.message,'error');
    updateCourtBatchButton();
  }
}
function removeRowsByIds(rows,ids){
  const set=new Set((ids||[]).map(id=>String(id||'')));
  return (rows||[]).filter(row=>!set.has(String(row?.id||'')));
}
function mergeRowsById(rows,updates){
  const map=new Map((updates||[]).map(row=>[String(row?.id||''),row]).filter(([id])=>id));
  return (rows||[]).map(row=>map.get(String(row?.id||''))||row);
}
function applyStudentCascadeDeleteResult(studentId,result={}){
  const deleted=result.deleted||{};
  const updated=result.updated||{};
  students=removeRowsByIds(students,[studentId]);
  classes=mergeRowsById(removeRowsByIds(classes,deleted.classes),updated.classes);
  schedules=mergeRowsById(removeRowsByIds(schedules,deleted.schedule),updated.schedule);
  plans=removeRowsByIds(plans,deleted.plans);
  purchases=removeRowsByIds(purchases,deleted.purchases);
  entitlements=removeRowsByIds(entitlements,deleted.entitlements);
  entitlementLedger=removeRowsByIds(entitlementLedger,deleted.entitlementLedger);
  membershipBenefitLedger=removeRowsByIds(membershipBenefitLedger,deleted.membershipBenefitLedger);
  financialLedger=removeRowsByIds(financialLedger,deleted.financialLedger);
  feedbacks=removeRowsByIds(feedbacks,deleted.feedbacks);
  courts=mergeRowsById(courts,updated.courts);
  leads=mergeRowsById(leads,updated.leads);
  leadFollowups=mergeRowsById(leadFollowups,updated.leadFollowups);
  if(deleted.financialLedger?.length||deleted.purchases?.length||deleted.entitlements?.length||deleted.entitlementLedger?.length){
    loadedDatasets.delete('financePage');
    financeOverviewData=null;
    financeNormalizedLedgerRows=[];
    financeSettlementSummaryRows=[];
  }
}
async function doDelete(){
  if(!delId)return;
  if(delType==='court-batch'){
    const ids=[...batchDeleteCourtIds];
    closeConf();
    await runBatchDeleteCourts(ids);
    return;
  }
  const currentDelId=delId,currentDelType=delType;
  await runStandardMutation('confYesBtn',async()=>{
    const m={court:'/courts/',student:'/students/',product:'/products/',package:'/packages/',purchase:'/purchases/',schedule:'/schedule/',coach:'/coaches/',campus:'/campuses/','membership-plan':'/membership-plans/'};
    const result=await apiCall('DELETE',m[currentDelType]+currentDelId,currentDelType==='student'?{confirm:'DELETE_STUDENT_HISTORY'}:undefined);
    if(currentDelType==='court')courts=courts.filter(u=>u.id!==currentDelId);
    else if(currentDelType==='student')applyStudentCascadeDeleteResult(currentDelId,result);
    else if(currentDelType==='product')products=products.filter(u=>u.id!==currentDelId);
    else if(currentDelType==='package')packages=packages.filter(u=>u.id!==currentDelId);
    else if(currentDelType==='purchase'){await loadPageDataAndRender(currentPage,{quiet:true,force:true});return {...result,purchaseVoid:true};}
    else if(currentDelType==='schedule'){schedules=schedules.filter(u=>u.id!==currentDelId);mergeScheduleSaveResult(result,null);setDatasetValue('schedule',schedules);}
    else if(currentDelType==='coach')coaches=coaches.filter(u=>u.id!==currentDelId);
    else if(currentDelType==='campus'){campuses=campuses.filter(u=>u.id!==currentDelId);CAMPUS={};campuses.forEach(x=>{CAMPUS[x.code||x.id]=campusDisplayName(x.name||x.code||x.id);});buildCampusTabs();}
    else if(currentDelType==='membership-plan')membershipPlans=membershipPlans.filter(u=>u.id!==currentDelId);
    return result;
  },{
    loadingText:'删除中…',
    errorPrefix:'删除失败',
    closeOnSuccess:true,
    onSuccess:(result={})=>{
      closeConf();
      toast(result?.purchaseVoid?'已作废':(result?.archived?'已隐藏':'已删除'),result?.archived?'warn':'error');
    },
    refresh:(result={})=>{
      if(!result?.purchaseVoid)renderAll();
    }
  });
}
function closeModal(){
  const ov=document.getElementById('overlay');
  ov.classList.remove('open');
  closeGlobalDatePicker();
  if(modalCleanupTimer)clearTimeout(modalCleanupTimer);
  modalCleanupTimer=setTimeout(()=>{
    if(!ov.classList.contains('open'))resetModalShell();
  },220);
}
function toast(msg,type=''){const c=document.getElementById('toasts'),t=document.createElement('div'),span=document.createElement('span');t.className='toast '+(type||'');span.textContent=String(msg??'');t.appendChild(span);c.appendChild(t);setTimeout(()=>{t.style.cssText='opacity:0;transform:translateX(18px);transition:all .28s';setTimeout(()=>t.remove(),300);},3000);}
async function backupToObsidian(){
  try{toast('生成备份…','');const d=new Date(),ds=d.toISOString().slice(0,10),ts=d.toTimeString().slice(0,5);
  let md='# FlowTennis 备份\n\n时间：'+ds+' '+ts+'\n\n---\n\n## 学员（'+students.length+'人）\n\n| 姓名 | 类型 | 手机 | 来源 | 校区 |\n|------|------|------|------|------|\n';
  students.forEach(s=>{md+='| '+esc(s.name)+' | '+(s.type||'')+' | '+(s.phone||'')+' | '+(s.source||'')+' | '+cn(s.campus)+' |\n';});
  md+='\n## 订场（'+courts.length+'人）\n\n| 姓名 | 手机号 | 关联学员 | 校区 | 余额 | 储值 | 消费金额 | 跟进人 | 储值态度 | 备注 |\n|------|------|------|------|------|------|------|------|------|------|\n';
  courts.forEach(c=>{const f=courtFinanceLocal(c);md+='| '+esc(c.name)+' | '+(c.phone||'')+' | '+esc(courtStudentNames(c))+' | '+cn(c.campus)+' | ¥'+fmt(f.balance)+' | ¥'+fmt(f.totalDeposit)+' | ¥'+fmt(f.spentAmount||0)+' | '+esc(courtFollowOwnerText(c))+' | '+esc(c.depositAttitude||'')+' | '+esc(c.notes||'')+' |\n';});
  md+='\n---\n\n- 学员：'+students.length+'\n- 订场：'+courts.length+'\n- 排课：'+schedules.length+'\n';
  const blob=new Blob([md],{type:'text/markdown;charset=utf-8;'});const a=document.createElement('a');a.href=URL.createObjectURL(blob);a.download='FlowTennis备份-'+ds+'.md';a.click();toast('备份已下载','success');
  }catch(e){toast('备份失败：'+e.message,'error');}
}
// ===== 校区管理 =====
// ===== 教练视角 =====
