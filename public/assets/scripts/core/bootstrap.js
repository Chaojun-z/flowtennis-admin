let currentPage=localStorage.getItem(PAGE_KEY)||'students',campus=localStorage.getItem(CAMPUS_KEY)||'all',editId=null,delId=null,delType=null,_pending=[];
let batchDeleteCourtIds=[];
let stuPage=1,clsPage=1,planPage=1,schPage=1,courtPage=1;
let courtSortKey='',courtSortDir='desc',courtOwnerFilterValue='',courtAccountTypeFilterValue='',courtPageSize=20,selectedCourtIds=new Set();
let coachOpsMode='day',coachOpsPanel='schedule',coachOpsPickerMonth=null,financePanel='revenue';

function goPage(pg,el,skipRender=false){
  syncViewportMode();
  if(pg==='entitlements')pg='students';
  const adminPages=['students','classes','plans','schedule','coachops','products','packages','purchases','finance','coaches','admin-users','courts','memberships','membership-orders','membership-ledger','membership-plans','prices','campusmgr'];
  const coachPages=['workbench','myschedule','mystudents','myclasses'];
  const isCoach=currentUser?.role==='editor'&&currentUser?.coachName;
  if(currentUser?.role!=='admin'&&adminPages.includes(pg))pg=isCoach?'workbench':'';
  if(currentUser?.role==='admin'&&coachPages.includes(pg))pg='students';
  if(!pg)return;
  const updateDOM = () => {
    document.querySelectorAll('.sb-item').forEach(n=>{
      const matched=(n.getAttribute('onclick')||'').includes(`goPage('${pg}'`);
      n.classList.toggle('active',el?n===el:matched);
    });
    document.querySelectorAll('.page-section').forEach(s=>s.classList.remove('active'));
    const targetPage = document.getElementById('page-'+pg);
    if(targetPage) {
      targetPage.classList.add('active');
    }
    currentPage=pg;
    localStorage.setItem(PAGE_KEY,currentPage);
    document.getElementById('campusTabs').style.display=['students','courts'].includes(pg)?'flex':'none';
    const t={students:'学员信息',classes:'班次管理',plans:'学习计划',schedule:'排课表',coachops:'教练运营',products:'课程产品',packages:'售卖课包',purchases:'购买记录',finance:'财务中心',coaches:'教练管理','admin-users':'账号管理',courts:'订场用户',memberships:'会员管理','membership-orders':'会员购买记录','membership-ledger':'会员权益流水','membership-plans':'会员方案',prices:'价格管理',campusmgr:'校区管理',workbench:'工作台',myschedule:'我的课表',mystudents:'我的学员',myclasses:'我的班次'};
    document.getElementById('topTitle').textContent=t[pg]||'';
    if(!skipRender)loadPageDataAndRender(pg,{quiet:true});
  };
  if(document.startViewTransition) {
    document.startViewTransition(() => updateDOM());
  } else {
    updateDOM();
  }
}
function renderStudentsIfVisible(){
  if(currentPage==='students')renderStudents();
  if(currentPage==='mystudents')renderMyStudents();
}
function setCampus(el,c){document.querySelectorAll('.ctab').forEach(b=>b.classList.remove('active'));el.classList.add('active');campus=c;localStorage.setItem(CAMPUS_KEY,campus);stuPage=1;courtPage=1;if(currentPage==='students')renderStudents();if(currentPage==='courts')renderCourts();}
// ===== 教练管理 =====
// ===== 删除 & 通用 =====
function appConfirm(message,{title='请确认',confirmText='确定',danger=false}={}){
  return new Promise(resolve=>{
    const ov=document.getElementById('confOv'),ci=document.getElementById('confInput'),cb=document.getElementById('confYesBtn'),nb=document.getElementById('confNoBtn');
    document.getElementById('confTitle').textContent=title;
    document.getElementById('confDesc').textContent=message;
    document.getElementById('confIcon').textContent='!';
    if(ci){ci.value='';ci.style.display='none';ci.oninput=null;}
    if(cb){cb.disabled=false;cb.style.opacity='1';cb.style.cursor='pointer';cb.textContent=confirmText;cb.style.background=danger?'#dc2626':'#2454c5';cb.classList.toggle('neutral',!danger);cb.onclick=function(){closeConf();resolve(true);};}
    if(nb)nb.onclick=function(){closeConf();resolve(false);};
    ov.classList.add('open');
  });
}
function confirmDel(id,name,type){delId=id;delType=type;document.getElementById('confTitle').textContent=type==='court'?'确认删除/隐藏？':'确认删除？';document.getElementById('confIcon').textContent='!';document.getElementById('confDesc').textContent=type==='court'?'即将处理「'+name+'」。没有财务/会员记录会删除；已有记录会隐藏保留数据。请输入「确认删除」。':type==='membership-plan'?'即将删除「'+name+'」。仅草稿/停售且没有购买记录的方案可删除。请输入「确认删除」。':'即将删除「'+name+'」，请输入「确认删除」。';document.getElementById('confOv').classList.add('open');var ci=document.getElementById('confInput');ci.style.display='block';ci.value='';var cb=document.getElementById('confYesBtn');cb.textContent='确认删除';cb.style.background='#dc2626';cb.classList.remove('neutral');cb.onclick=doDelete;cb.disabled=true;cb.style.opacity='0.4';cb.style.cursor='not-allowed';var nb=document.getElementById('confNoBtn');if(nb)nb.onclick=closeConf;ci.oninput=function(){if(ci.value.trim()==='确认删除'){cb.disabled=false;cb.style.opacity='1';cb.style.cursor='pointer';}else{cb.disabled=true;cb.style.opacity='0.4';cb.style.cursor='not-allowed';}};}
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
function closeConf(){document.getElementById('confOv').classList.remove('open');delId=null;delType=null;batchDeleteCourtIds=[];const ci=document.getElementById('confInput');if(ci){ci.value='';ci.style.display='block';ci.oninput=null;}const cb=document.getElementById('confYesBtn');if(cb){cb.textContent='确认删除';cb.style.background='#dc2626';cb.classList.remove('neutral');cb.onclick=doDelete;}const nb=document.getElementById('confNoBtn');if(nb)nb.onclick=closeConf;}
function resetModalShell(){
  const ov=document.getElementById('overlay');
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
async function doDelete(){
  if(!delId)return;
  try{
    if(delType==='court-batch'){
      const ids=[...batchDeleteCourtIds];
      closeConf();
      await runBatchDeleteCourts(ids);
      return;
    }
    const m={court:'/courts/',student:'/students/',product:'/products/',package:'/packages/',purchase:'/purchases/',plan:'/plans/',schedule:'/schedule/',class:'/classes/',coach:'/coaches/',campus:'/campuses/','membership-plan':'/membership-plans/'};
    const result=await apiCall('DELETE',m[delType]+delId);
    if(delType==='court')courts=courts.filter(u=>u.id!==delId);
    else if(delType==='student')students=students.filter(u=>u.id!==delId);
    else if(delType==='product')products=products.filter(u=>u.id!==delId);
    else if(delType==='package')packages=packages.filter(u=>u.id!==delId);
    else if(delType==='purchase'){await loadAll();closeConf();closeModal();toast('已作废','error');return;}
    else if(delType==='plan')plans=plans.filter(u=>u.id!==delId);
    else if(delType==='schedule'){schedules=schedules.filter(u=>u.id!==delId);mergeScheduleSaveResult(result,null);}
    else if(delType==='class'){classes=classes.filter(u=>u.id!==delId);plans=plans.filter(p=>p.classId!==delId);}
    else if(delType==='coach')coaches=coaches.filter(u=>u.id!==delId);
    else if(delType==='campus'){campuses=campuses.filter(u=>u.id!==delId);CAMPUS={};campuses.forEach(x=>{CAMPUS[x.code||x.id]=x.name||x.code||x.id;});buildCampusTabs();}
    else if(delType==='membership-plan')membershipPlans=membershipPlans.filter(u=>u.id!==delId);
    closeConf();closeModal();toast(result?.archived?'已隐藏':'已删除',result?.archived?'warn':'error');renderAll();
  }catch(e){toast('删除失败：'+e.message,'error');closeConf();}
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
function toast(msg,type=''){const c=document.getElementById('toasts'),t=document.createElement('div');t.className='toast '+(type||'');t.innerHTML='<span>'+msg+'</span>';c.appendChild(t);setTimeout(()=>{t.style.cssText='opacity:0;transform:translateX(18px);transition:all .28s';setTimeout(()=>t.remove(),300);},3000);}
async function backupToObsidian(){
  try{toast('生成备份…','');const d=new Date(),ds=d.toISOString().slice(0,10),ts=d.toTimeString().slice(0,5);
  let md='# FlowTennis 备份\n\n时间：'+ds+' '+ts+'\n\n---\n\n## 学员（'+students.length+'人）\n\n| 姓名 | 类型 | 手机 | 来源 | 校区 |\n|------|------|------|------|------|\n';
  students.forEach(s=>{md+='| '+esc(s.name)+' | '+(s.type||'')+' | '+(s.phone||'')+' | '+(s.source||'')+' | '+cn(s.campus)+' |\n';});
  md+='\n## 班次（'+classes.length+'个）\n\n| 名称 | 课程 | 教练 | 应上 | 已上 | 状态 |\n|------|------|------|------|------|------|\n';
  classes.forEach(c=>{md+='| '+esc(c.className)+' | '+(c.productName||'')+' | '+(c.coach||'')+' | '+(c.totalLessons||0)+' | '+(c.usedLessons||0)+' | '+(c.status||'')+' |\n';});
  md+='\n## 订场（'+courts.length+'人）\n\n| 姓名 | 手机号 | 关联学员 | 校区 | 余额 | 储值 | 消费金额 | 对接人 | 对储值态度 | 熟悉程度 | 备注 |\n|------|------|------|------|------|------|------|------|------|------|------|\n';
  courts.forEach(c=>{const f=courtFinanceLocal(c);md+='| '+esc(c.name)+' | '+(c.phone||'')+' | '+esc(courtStudentNames(c))+' | '+cn(c.campus)+' | ¥'+fmt(f.balance)+' | ¥'+fmt(f.totalDeposit)+' | ¥'+fmt(f.spentAmount||0)+' | '+esc(c.owner||'')+' | '+esc(c.depositAttitude||'')+' | '+esc(c.familiarity||'')+' | '+esc(c.notes||'')+' |\n';});
  md+='\n---\n\n- 学员：'+students.length+'\n- 班次：'+classes.length+'\n- 计划：'+plans.length+'\n- 订场：'+courts.length+'\n- 排课：'+schedules.length+'\n';
  const blob=new Blob([md],{type:'text/markdown;charset=utf-8;'});const a=document.createElement('a');a.href=URL.createObjectURL(blob);a.download='FlowTennis备份-'+ds+'.md';a.click();toast('备份已下载','success');
  }catch(e){toast('备份失败：'+e.message,'error');}
}
// ===== 校区管理 =====
// ===== 教练视角 =====
