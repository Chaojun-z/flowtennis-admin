let token=localStorage.getItem('ft_token');
let currentUser=JSON.parse(localStorage.getItem('ft_user')||'null');
const PAGE_KEY='ft_current_page';
const CAMPUS_KEY='ft_current_campus';
const GLOBAL_DATE_RANGE_KEY='ft_global_date_range';
const GLOBAL_DATE_RANGE_START_KEY='ft_global_date_range_start';
const GLOBAL_DATE_RANGE_END_KEY='ft_global_date_range_end';
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
function openPendingScheduleDeepLink(){
  const scheduleId=sessionStorage.getItem(PENDING_SCHEDULE_ID_KEY);
  if(!scheduleId)return;
  const exists=schedules.some(s=>s.id===scheduleId);
  if(!exists)return;
  sessionStorage.removeItem(PENDING_SCHEDULE_ID_KEY);
  const page=currentUser?.role==='editor'&&currentUser?.coachName?'workbench':'schedule';
  goPage(page,null,true);
  setTimeout(()=>openScheduleDetail(scheduleId),0);
}
function isStudentReminderBindPage(){
  return window.location.pathname==='/student-reminder-bind';
}
function isStudentReminderDetailPage(){
  return window.location.pathname==='/student-reminder-detail';
}
function isWeeklyReportSharePage(){
  return /^\/weekly-reports\/[^/]+/.test(window.location.pathname);
}
async function renderWeeklyReportSharePage(){
  const app=document.getElementById('app');
  const login=document.getElementById('loginPage');
  if(app)app.style.display='none';
  if(login){
    login.style.display='block';
    login.innerHTML='<div style="min-height:100vh;background:#070A08;color:#fff;display:grid;place-items:center;font-family:-apple-system,BlinkMacSystemFont,Segoe UI,sans-serif"><div style="border:1px solid #18221B;background:#0D120F;padding:24px;border-radius:12px"><div style="color:#7CFF44;font-size:12px;letter-spacing:.08em">FLOWTENNIS WEEKLY</div><div style="margin-top:10px;font-size:18px;font-weight:700">周报加载中...</div></div></div>';
  }
  const tokenValue=decodeURIComponent(window.location.pathname.split('/').pop()||'');
  try{
    const res=await fetch(`/api/public/weekly-business-reports/${encodeURIComponent(tokenValue)}`,{headers:{'Cache-Control':'no-cache'}});
    const html=await res.text();
    document.open();
    document.write(html);
    document.close();
  }catch(e){
    if(login)login.innerHTML=`<div style="min-height:100vh;background:#070A08;color:#fff;display:grid;place-items:center;font-family:-apple-system,BlinkMacSystemFont,Segoe UI,sans-serif"><div style="border:1px solid #18221B;background:#0D120F;padding:24px;border-radius:12px"><div style="color:#7CFF44;font-size:12px;letter-spacing:.08em">FLOWTENNIS WEEKLY</div><div style="margin-top:10px;font-size:18px;font-weight:700">周报加载失败</div><div style="margin-top:8px;color:#889E8D;font-size:13px">${String(e.message||e)}</div></div></div>`;
  }
}
function renderStudentReminderDetailPage(){
  const app=document.getElementById('app');
  const login=document.getElementById('loginPage');
  if(app)app.style.display='none';
  if(login){
    login.style.display='flex';
    login.innerHTML=`<div class="login-card" style="max-width:420px"><div class="login-logo"><span class="icon"></span><div class="brand">网球兄弟</div><div class="sub">课程提醒</div></div><div style="font-size:18px;font-weight:800;color:var(--th);margin-top:8px">温馨提示</div><div style="font-size:13px;line-height:1.8;color:var(--ts);margin-top:12px;text-align:left"><div>请以服务号消息中的上课时间、场地和课程信息为准。</div><div style="margin-top:10px">1. 按约定时间准时到场，迟到时间计入课时。</div><div>2. 若临时无法按时上课，请至少提前24小时告知。未按时取消且不到场，视为正常消耗1课时。</div><div>3. 如遇生病、突发急事等特殊情况，请及时和我们沟通。</div></div></div>`;
  }
}
async function renderStudentReminderBindPage(){
  const app=document.getElementById('app');
  const login=document.getElementById('loginPage');
  if(app)app.style.display='none';
  if(login)login.style.display='flex';
  const url=new URL(window.location.href);
  const tokenValue=url.searchParams.get('t')||url.searchParams.get('token')||url.searchParams.get('state')||'';
  const code=url.searchParams.get('code')||'';
  const render=(title,desc,extra='')=>{if(login)login.innerHTML=`<div class="login-card" style="max-width:420px"><div class="login-logo"><span class="icon"></span><div class="brand">网球兄弟</div><div class="sub">上课提醒绑定</div></div><div style="font-size:18px;font-weight:800;color:var(--th);margin-top:8px">${title}</div><div style="font-size:13px;line-height:1.7;color:var(--ts);margin-top:12px">${desc}</div>${extra}</div>`;};
  if(!tokenValue){render('绑定链接无效','请联系教练重新发送上课提醒绑定链接。');return;}
  if(!code){
    render('正在确认微信身份','请稍等，确认后会帮你开通上课提醒。');
    try{
      const redirectUri=`${window.location.origin}/student-reminder-bind?t=${encodeURIComponent(tokenValue)}`;
      const data=await apiCall('GET',`/student-reminder-bind/oauth-url?token=${encodeURIComponent(tokenValue)}&redirectUri=${encodeURIComponent(redirectUri)}`,null,15000);
      window.location.href=data.authorizeUrl;
    }catch(e){
      render('暂时无法绑定',`这条链接暂时打不开，请回到教练发给你的消息里重新点一次。<br>${String(e.message||e)}`);
    }
    return;
  }
  render('正在开通提醒','请稍等，马上就好。');
  try{
    const data=await apiCall('POST','/student-reminder-bind/complete',{token:tokenValue,code},20000);
    const studentName=data.student?.name||'学员';
    const title=data.alreadyBound?'这条链接已经完成绑定':'绑定成功';
    if(data.officialAccountSubscribed===true){
      render(title,`${studentName}的上课提醒已开启。<br>你已关注「网球兄弟」服务号，之后有新排课时，会按教练设置的时间提醒你。<br>可以关闭本页面。`);
    }else{
      render(
        data.alreadyBound?'已绑定，还差关注服务号':'绑定成功，还差关注服务号',
        `${studentName}的上课提醒已绑定到当前微信。<br>请长按识别下方二维码，关注「网球兄弟」服务号。<br>关注后无需重新绑定，之后有新排课时，会按教练设置的时间提醒你。<br>如果已经关注过服务号，可以直接关闭本页面。`,
        `<div style="margin-top:16px;text-align:center"><img src="/qrcode_for_gh_4c6b1a2fe3a9_258.jpg" alt="网球兄弟服务号二维码" style="width:188px;height:188px;border-radius:8px;border:1px solid var(--line);background:#fff;padding:8px"></div>`
      );
    }
    url.searchParams.delete('code');
    url.searchParams.delete('state');
    window.history.replaceState({},document.title,url.pathname+url.search);
  }catch(e){
    render('这条链接不能继续使用',`${String(e.message||e)}<br>如果你已经绑定过，不需要重复操作；之后有新排课时，会通过「网球兄弟」服务号提醒你。`);
  }
}

async function apiCall(method,path,body,timeoutMs=60000){
  const headers={'Content-Type':'application/json'};
  if(token)headers['Authorization']='Bearer '+token;
  const controller=new AbortController();
  const timeout=setTimeout(()=>controller.abort(),timeoutMs);
  try{
    const res=await fetch('/api'+path,{method,headers,signal:controller.signal,body:body?JSON.stringify(body):undefined});
    const raw=await res.text();
    let data={};
    if(raw){
      try{
        data=JSON.parse(raw);
      }catch(parseErr){
        const fallback=String(raw).trim().replace(/\s+/g,' ').slice(0,120)||'服务器返回了非 JSON 响应';
        throw new Error(`${fallback} [${path}]`);
      }
    }
    if(!res.ok){
      const error=new Error(`${data.error||'请求失败'} [${path}]`);
      error.status=res.status;
      error.data=data;
      error.path=path;
      throw error;
    }
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
