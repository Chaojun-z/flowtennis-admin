let token=localStorage.getItem('ft_token');
let currentUser=JSON.parse(localStorage.getItem('ft_user')||'null');
const PAGE_KEY='ft_current_page';
const CAMPUS_KEY='ft_current_campus';
const WECHAT_CODE_KEY='ft_wechat_login_code';
const PENDING_SCHEDULE_ID_KEY='ft_pending_schedule_id';

function captureWechatLoginCode(){
  try{
    const url=new URL(window.location.href);
    const code=url.searchParams.get('wechatCode');
    const scheduleId=url.searchParams.get('scheduleId');
    if(code){
      sessionStorage.setItem(WECHAT_CODE_KEY,code);
      url.searchParams.delete('wechatCode');
    }
    if(scheduleId){
      sessionStorage.setItem(PENDING_SCHEDULE_ID_KEY,scheduleId);
      url.searchParams.delete('scheduleId');
    }
    if(code||scheduleId)window.history.replaceState({},document.title,url.pathname+url.search+url.hash);
  }catch(e){}
}
async function bindWechatAfterLogin(){
  const code=sessionStorage.getItem(WECHAT_CODE_KEY);
  if(!code)return;
  try{
    await apiCall('POST','/auth/wechat-bind',{code},15000);
    sessionStorage.removeItem(WECHAT_CODE_KEY);
  }catch(e){
    console.warn('wechat bind skipped:',e.message);
  }
}
function defaultLandingPageForUser(user){
  return user?.role==='editor'&&user?.coachName?'workbench':'students';
}
function openPendingScheduleDeepLink(){
  const scheduleId=sessionStorage.getItem(PENDING_SCHEDULE_ID_KEY);
  if(!scheduleId)return;
  const exists=schedules.some(s=>s.id===scheduleId);
  if(!exists)return;
  sessionStorage.removeItem(PENDING_SCHEDULE_ID_KEY);
  const page=currentUser?.role==='editor'&&currentUser?.coachName?'myschedule':'schedule';
  goPage(page,null,true);
  setTimeout(()=>openScheduleDetail(scheduleId),0);
}

async function apiCall(method,path,body,timeoutMs=60000){
  const headers={'Content-Type':'application/json'};
  if(token)headers['Authorization']='Bearer '+token;
  const controller=new AbortController();
  const timeout=setTimeout(()=>controller.abort(),timeoutMs);
  try{
    const res=await fetch('/api'+path,{method,headers,signal:controller.signal,body:body?JSON.stringify(body):undefined});
    const data=await res.json();
    if(!res.ok)throw new Error(`${data.error||'请求失败'} [${path}]`);
    return data;
  }catch(e){
    // Chrome/Safari 对 AbortController 的报错文案不统一，这里统一成可读提示
    if(String(e?.name||'')==='AbortError'||String(e?.message||'').includes('aborted')){
      throw new Error('请求超时：可能是数据库连接慢/无权限/网络不通，请稍后重试');
    }
    throw e;
  }finally{
    clearTimeout(timeout);
  }
}

async function doLogin(){
  const username=document.getElementById('loginUser').value.trim();
  const password=document.getElementById('loginPass').value;
  const err=document.getElementById('loginErr');
  const btn=document.getElementById('loginBtn');
  if(!username||!password){err.textContent='请填写账号和密码';err.classList.add('show');return;}
  btn.disabled=true;btn.textContent='登录中…';
  try{
    const data=await apiCall('POST','/auth/login',{username,password});
    token=data.token;currentUser=data.user;
    localStorage.setItem('ft_token',token);localStorage.setItem('ft_user',JSON.stringify(currentUser));
    currentPage=defaultLandingPageForUser(currentUser);
    localStorage.setItem(PAGE_KEY,currentPage);
    await bindWechatAfterLogin();
    showApp();
  }catch(e){err.textContent=e.message;err.classList.add('show');btn.disabled=false;btn.textContent='登 录';}
}
function doLogout(){
  dataRequestVersion++;
  token=null;currentUser=null;localStorage.removeItem('ft_token');localStorage.removeItem('ft_user');
  clearLoadedData();
  renderRoleShell();
  document.getElementById('loginPage').style.display='flex';document.getElementById('app').style.display='none';
  document.getElementById('loginErr').classList.remove('show');document.getElementById('loginBtn').disabled=false;document.getElementById('loginBtn').textContent='登 录';
}
