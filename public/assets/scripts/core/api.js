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
    render('正在打开微信授权','请稍等，完成后会自动绑定服务号提醒。');
    try{
      const redirectUri=`${window.location.origin}/student-reminder-bind?t=${encodeURIComponent(tokenValue)}`;
      const data=await apiCall('GET',`/student-reminder-bind/oauth-url?token=${encodeURIComponent(tokenValue)}&redirectUri=${encodeURIComponent(redirectUri)}`,null,15000);
      window.location.href=data.authorizeUrl;
    }catch(e){
      render('暂时无法打开授权',`请先关注服务号，再重新点击绑定链接。<br>${String(e.message||e)}`);
    }
    return;
  }
  render('正在完成绑定','请稍等，系统正在确认你的服务号身份。');
  try{
    const data=await apiCall('POST','/student-reminder-bind/complete',{token:tokenValue,code},20000);
    const studentName=data.student?.name||'学员';
    if(data.officialAccountSubscribed===true){
      render('绑定成功',`${studentName}的上课提醒已开启。<br>你已关注「网球兄弟」服务号，之后课前会自动提醒你。<br>可以关闭本页面。`);
    }else{
      render(
        '绑定成功，还差关注服务号',
        `${studentName}的上课提醒已绑定到当前微信。<br>请长按识别下方二维码，关注「网球兄弟」服务号。<br>关注后无需重新绑定，之后课前48小时和24小时会自动提醒你。<br>如果已经关注过服务号，可以直接关闭本页面。`,
        `<div style="margin-top:16px;text-align:center"><img src="/qrcode_for_gh_4c6b1a2fe3a9_258.jpg" alt="网球兄弟服务号二维码" style="width:188px;height:188px;border-radius:8px;border:1px solid var(--line);background:#fff;padding:8px"></div>`
      );
    }
    url.searchParams.delete('code');
    url.searchParams.delete('state');
    window.history.replaceState({},document.title,url.pathname+url.search);
  }catch(e){
    render('绑定未完成',`请先关注服务号，再重新点击绑定链接。<br>${String(e.message||e)}`);
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
