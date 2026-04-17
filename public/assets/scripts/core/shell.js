function renderRoleShell(){
  const isAdmin=currentUser?.role==='admin';
  const isCoach=currentUser?.role==='editor'&&currentUser?.coachName;
  document.getElementById('userNamePill').textContent=(currentUser?.name||'用户');
  document.getElementById('sbAdminView').style.display=isAdmin?'':'none';
  document.getElementById('sbCoachView').style.display=isCoach?'':'none';
  const campusMgr=document.getElementById('sbCampusMgr');
  if(campusMgr)campusMgr.style.display=isAdmin?'':'none';
  syncViewportMode();
}
function showApp(){
  dataRequestVersion++;
  document.getElementById('loginPage').style.display='none';document.getElementById('app').style.display='';
  clearLoadedData();
  normalizeCurrentPageForRole();
  renderRoleShell();
  loadPageDataAndRender(currentPage,{quiet:true});
}
document.addEventListener('DOMContentLoaded',()=>{
  document.getElementById('loginPass').addEventListener('keydown',e=>{if(e.key==='Enter')doLogin();});
  document.getElementById('loginUser').addEventListener('keydown',e=>{if(e.key==='Enter')document.getElementById('loginPass').focus();});
  window.addEventListener('resize',syncViewportMode);
  document.addEventListener('click',e=>{
    const vTarget = e.target.closest?.('button, .sb-item, .ctab, .coach-ops-tab, .coach-mobile-event, .tms-action-link, .today-card, .coach-wb-card');
    if(vTarget && navigator.vibrate && (document.body.classList.contains('coach-mobile') || document.body.classList.contains('admin-mobile'))) {
      navigator.vibrate([12]);
    }
    if(!e.target.closest?.('.coach-date-wrap'))closeCoachOpsPicker();
    if(!e.target.closest?.('.filter-date-wrap')&&!e.target.closest?.('#globalDatePicker'))closeGlobalDatePicker();
  });
  if(token&&currentUser)showApp();else document.getElementById('loginPage').style.display='flex';
});

if('serviceWorker' in navigator){
  window.addEventListener('load',async()=>{
    const host=window.location.hostname;
    const isLocalHost=host==='127.0.0.1'||host==='localhost';
    if(isLocalHost){
      try{
        const regs=await navigator.serviceWorker.getRegistrations();
        await Promise.all(regs.map(reg=>reg.unregister()));
        if(window.caches?.keys){
          const keys=await caches.keys();
          await Promise.all(keys.filter(key=>String(key).startsWith('flowtennis-shell-')).map(key=>caches.delete(key)));
        }
      }catch(e){}
      return;
    }
    navigator.serviceWorker.register('/service-worker.js').catch(()=>null);
  });
}
