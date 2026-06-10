function adminUserRoleText(role){
  return role==='admin'?'管理员':'教练账号';
}
function adminUserStatusText(status){
  return status==='inactive'?'已停用':'正常';
}
function adminUserCoachId(user){
  const coach=coaches.find(c=>String(c.id||'')===String(user?.coachId||'')||String(c.name||'')===String(user?.coachName||''));
  return coach?.id||user?.coachId||'';
}
function adminUserCoachText(user){
  if(user.role!=='editor')return '-';
  return user.coachName||coaches.find(c=>String(c.id||'')===String(user.coachId||''))?.name||'-';
}
function adminUserProfile(user){
  if(typeof window!=='undefined'&&typeof window.normalizeClientPermissionProfile==='function')return window.normalizeClientPermissionProfile(user||{});
  const role=user?.role==='admin'?'admin':'editor';
  const perms=Array.isArray(user?.matchPermissions)?user.matchPermissions:[];
  return {role,systemType:role==='admin'?'management':'coach',dataScope:role==='admin'?'all':'coach',campusIds:Array.isArray(user?.campusIds)?user.campusIds:[],featurePermissions:perms};
}
function adminUserCampusName(id){
  const value=String(id||'').trim();
  const row=campuses.find(c=>String(c.code||c.id||'')===value);
  return row?.name||cn(value)||value;
}
function adminUserDataScopeText(user){
  const profile=adminUserProfile(user);
  if(profile.systemType==='coach')return '教练系统：本人数据';
  if(profile.dataScope==='campus')return `数据范围：${profile.campusIds.map(adminUserCampusName).filter(Boolean).join('、')||'未选择校区'}`;
  return '数据范围：全部校区';
}
function adminUserCampusCode(user){
  const coach=coaches.find(c=>String(c.id||'')===String(user.coachId||'')||String(c.name||'')===String(user.coachName||''));
  return coach?.campus||'';
}
function adminUserMatchesCampus(user){
  return true;
}
function adminUserPhoneText(user){
  return user.phone||'-';
}
function adminUserWechatText(user){
  if(user.role!=='editor')return '-';
  return user.wechatBound?`已绑定${user.wechatBoundAt?' · '+String(user.wechatBoundAt).slice(0,10):''}`:'未绑定';
}
function adminUserOfficialAccountText(user){
  if(user.role!=='editor')return '-';
  return user.officialAccountBound?`已绑定${user.officialAccountBoundAt?' · '+String(user.officialAccountBoundAt).slice(0,10):''}`:'未绑定';
}
function adminUserNoteText(user){
  const profile=adminUserProfile(user);
  const perms=profile.featurePermissions||[];
  const featureText=perms.includes('match_ops')||perms.includes('match_finance')
    ?`；约球权限：${[perms.includes('match_ops')?'运营':'',perms.includes('match_finance')?'财务':''].filter(Boolean).join('、')}`
    :'';
  return `${adminUserDataScopeText(user)}${featureText}`;
}
async function loadAdminUsers(force=false){
  if(currentUser?.role!=='admin')return;
  if(adminUsersLoaded&&!force){renderAdminUsers();return;}
  renderAdminUserTableLoading();
  try{
    adminUsers=await apiCall('GET','/admin/users');
    adminUsersLoaded=true;
    renderAdminUsers();
  }catch(e){
    renderAdminUserTableError(e.message);
    toast('账号列表加载失败：'+e.message,'error');
  }
}
function onAdminUserFilterChange(){adminUserPage=1;renderAdminUsers();}
function adminUserPageNumbers(page,pages){
  if(pages<=7)return Array.from({length:pages},(_,i)=>i+1);
  const items=[1];
  const start=Math.max(2,page-2);
  const end=Math.min(pages-1,page+2);
  if(start>2)items.push('...');
  for(let i=start;i<=end;i++)items.push(i);
  if(end<pages-1)items.push('...');
  items.push(pages);
  return items;
}
function renderAdminUserPagerControls(total,pages){
  const pageSizeHost=document.getElementById('adminUserPageSize');
  if(pageSizeHost)pageSizeHost.innerHTML=renderPageSizeSelectorHtml('adminUserPageSizeValue',adminUserPageSize,'setAdminUserPageSize');
  const btns=document.getElementById('adminUserPagerBtns');
  if(!btns)return;
  btns.innerHTML=(!total||pages<=1)?'':renderStandardPaginationButtonsHtml(adminUserPage,pages,'setAdminUserPage');
}
function setAdminUserPage(value){
  const total=getFilteredAdminUsers().length;
  const pages=Math.max(1,Math.ceil(total/adminUserPageSize));
  adminUserPage=Math.min(pages,Math.max(1,parseInt(value,10)||1));
  renderAdminUsers();
}
function setAdminUserPageSize(value){
  const next=parseInt(value,10);
  adminUserPageSize=[20,50,100].includes(next)?next:20;
  adminUserPage=1;
  renderAdminUsers();
}
function jumpAdminUserPage(value){
  const total=getFilteredAdminUsers().length;
  const pages=Math.max(1,Math.ceil(total/adminUserPageSize));
  adminUserPage=Math.min(pages,Math.max(1,parseInt(value,10)||1));
  renderAdminUsers();
}
function adminUserHasActiveSearch(){
  return !!(document.getElementById('adminUserSearch')?.value||'').trim();
}
function adminUserGlobalDateValue(user){
  return user.createdAt||user.updatedAt||user.wechatBoundAt||user.officialAccountBoundAt||'';
}
function adminUserEmptyStateHtml(){
  const filtered=adminUserHasActiveSearch();
  const title=filtered?'没有匹配的账号':'暂无账号';
  const desc=filtered?'调整搜索后再试':'点击右上角新增账号';
  return `<tr><td colspan="10"><div class="tms-empty-state"><div class="tms-empty-title">${title}</div><div class="tms-empty-desc">${desc}</div></div></td></tr>`;
}
function renderAdminUserTableLoading(){
  renderTableSkeletonLoading('adminUserTbody',10,'账号数据加载中...');
}
function renderAdminUserTableError(message){
  const tbody=document.getElementById('adminUserTbody');
  if(tbody)tbody.innerHTML=`<tr><td colspan="10"><div class="tms-table-error-state"><div class="tms-empty-title">加载失败</div><div class="tms-empty-desc">${esc(message||'请稍后重试')}</div><button class="tms-state-action" onclick="loadAdminUsers(true)">重新加载</button></div></td></tr>`;
}
function getFilteredAdminUsers(){
  const q=(document.getElementById('adminUserSearch')?.value||'').toLowerCase();
  return adminUsers.filter(u=>u.id!=='pkgmergeadmin'&&searchHit(q,u.id,u.name,u.phone,adminUserRoleText(u.role),adminUserStatusText(u.status),u.coachName,adminUserCoachText(u),adminUserPhoneText(u),adminUserWechatText(u),adminUserOfficialAccountText(u),adminUserNoteText(u)));
}
function renderAdminUsers(){
  const tbody=document.getElementById('adminUserTbody');if(!tbody)return;
  const list=getFilteredAdminUsers();
  const total=list.length,pages=Math.max(1,Math.ceil(total/adminUserPageSize));
  if(adminUserPage>pages)adminUserPage=pages;
  const slice=list.slice((adminUserPage-1)*adminUserPageSize,adminUserPage*adminUserPageSize);
  const pager=document.querySelector('#page-admin-users .tms-pagination');
  if(pager)pager.style.display=total?'flex':'none';
  const info=document.getElementById('adminUserPagerInfo');
  if(info)info.innerHTML=renderPagerInfoHtml(total);
  renderAdminUserPagerControls(total,pages);
  tbody.innerHTML=slice.length?slice.map(u=>{
    const statusText=adminUserStatusText(u.status);
    const statusClass=u.status==='inactive'?'':'tms-tag-green';
    const toggleText=u.status==='inactive'?'启用':'停用';
    const wechatClass=u.wechatBound?'tms-tag-green':'tms-tag-tier-slate';
    const wechatAction=u.wechatBound?`<span class="tms-action-link" onclick="unbindAdminUserWechat('${u.id}')">解绑微信</span>`:'';
    const officialClass=u.officialAccountBound?'tms-tag-green':'tms-tag-tier-slate';
    const officialAction=u.officialAccountBound?`<span class="tms-action-link" onclick="unbindAdminUserOfficialAccount('${u.id}')">解绑服务号</span>`:'';
    return `<tr><td class="tms-sticky-l" style="padding-left:20px">${renderStandardCellText(u.id,false)}</td><td>${renderStandardCellText(u.name,false)}</td><td><span title="手机号">${renderStandardCellText(adminUserPhoneText(u))}</span></td><td><span class="tms-tag ${u.role==='admin'?'':'tms-tag-green'}">${adminUserRoleText(u.role)}</span></td><td><span title="绑定教练">${renderStandardCellText(adminUserCoachText(u))}</span></td><td><span title="微信绑定"><span class="tms-tag ${wechatClass}">${adminUserWechatText(u)}</span></span></td><td><span title="服务号绑定"><span class="tms-tag ${officialClass}">${adminUserOfficialAccountText(u)}</span></span></td><td><span class="tms-tag ${statusClass}">${statusText}</span></td><td>${renderStandardCellText(adminUserNoteText(u))}</td><td class="tms-sticky-r tms-action-cell" style="width:300px;padding-right:20px;text-align:right">${wechatAction}${officialAction}<span class="tms-action-link" onclick="openAdminUserModal('${u.id}')">编辑</span><span class="tms-action-link" onclick="toggleAdminUserStatus('${u.id}')">${toggleText}</span></td></tr>`;
  }).join(''):adminUserEmptyStateHtml();
}
async function toggleAdminUserStatus(id){
  const user=adminUsers.find(x=>x.id===id);if(!user)return;
  const nextStatus=user.status==='inactive'?'active':'inactive';
  const actionText=nextStatus==='inactive'?'停用':'启用';
  const confirmed=await appConfirm(`确认${actionText}账号「${user.name||user.id}」？`,{title:`${actionText}账号`,confirmText:`确认${actionText}`,danger:nextStatus==='inactive'});
  if(!confirmed)return;
  try{
    await apiCall('POST','/admin/update-user',{id:user.id,name:user.name,coachId:user.coachId||'',coachName:user.coachName||'',status:nextStatus,matchPermissions:user.matchPermissions||[]});
    await loadAdminUsers(true);
    toast(`${actionText}成功 ✓`,'success');
  }catch(e){
    toast(`${actionText}失败：`+e.message,'error');
  }
}
async function unbindAdminUserWechat(id){
  const user=adminUsers.find(x=>x.id===id);if(!user)return;
  const confirmed=await appConfirm(`确认解绑「${user.name||user.id}」的微信通知？解绑后该账号不会再收到排课通知。`,{title:'解绑微信通知',confirmText:'确认解绑',danger:true});
  if(!confirmed)return;
  try{
    await apiCall('POST','/admin/update-user',{id:user.id,name:user.name,coachId:user.coachId||'',coachName:user.coachName||'',status:user.status||'active',matchPermissions:user.matchPermissions||[],clearWechat:true});
    await loadAdminUsers(true);
    toast('微信绑定已解绑 ✓','success');
  }catch(e){
    toast('解绑失败：'+e.message,'error');
  }
}
async function unbindAdminUserOfficialAccount(id){
  const user=adminUsers.find(x=>x.id===id);if(!user)return;
  const confirmed=await appConfirm(`确认解绑「${user.name||user.id}」的服务号通知？解绑后该账号不会再收到服务号排课通知。`,{title:'解绑服务号通知',confirmText:'确认解绑',danger:true});
  if(!confirmed)return;
  try{
    await apiCall('POST','/admin/update-user',{id:user.id,name:user.name,coachId:user.coachId||'',coachName:user.coachName||'',status:user.status||'active',matchPermissions:user.matchPermissions||[],clearOfficialAccount:true});
    await loadAdminUsers(true);
    toast('服务号绑定已解绑 ✓','success');
  }catch(e){
    toast('解绑失败：'+e.message,'error');
  }
}
function toggleAdminUserCoachBinding(){
  const role=document.getElementById('au_role')?.value||'editor';
  const wrap=document.getElementById('au_coach_wrap');
  if(wrap)wrap.style.display=role==='editor'?'':'none';
}
function adminUserCampusScopeChecks(campusIds){
  const ids=new Set((campusIds||[]).map(x=>String(x||'').trim()).filter(Boolean));
  return campuses.map(c=>{
    const value=String(c.code||c.id||'').trim();
    if(!value)return '';
    return `<label class="tms-checkbox-wrap"><input type="checkbox" value="${esc(value)}" class="tms-checkbox au-campus-cb" ${ids.has(value)?'checked':''}><span>${esc(c.name||cn(value)||value)}</span></label>`;
  }).join('')||'<span style="color:var(--td);font-size:12px">暂无校区</span>';
}
function toggleAdminUserScopeFields(){
  const role=document.getElementById('au_role')?.value||'editor';
  const row=document.getElementById('auDataScopeRow');
  const wrap=document.getElementById('auCampusScopeWrap');
  const scopeInput=document.getElementById('au_dataScope');
  let scope=scopeInput?.value||'';
  if(role==='editor'){
    if(typeof setStandardDropdownValue==='function')setStandardDropdownValue('au_dataScope','coach','仅本人教练');
    scope='coach';
  }else if(scope==='coach'){
    if(typeof setStandardDropdownValue==='function')setStandardDropdownValue('au_dataScope','all','全部校区');
    scope='all';
  }
  if(row)row.style.display=role==='admin'?'':'none';
  if(wrap)wrap.style.display=role==='admin'&&scope==='campus'?'':'none';
}
function toggleAdminUserPermissionFields(){
  toggleAdminUserCoachBinding();
  toggleAdminUserScopeFields();
}
function openAdminUserModal(id){
  editId=id||null;
  const user=id?adminUsers.find(x=>x.id===id):null;
  const profile=adminUserProfile(user||{role:'editor',dataScope:'coach',campusIds:[],matchPermissions:[]});
  const perms=profile.featurePermissions||[];
  const campusIds=profile.campusIds||[];
  const roleOptions=[{value:'editor',label:'教练账号'},{value:'admin',label:'管理员'}];
  const coachOptions=[{value:'',label:'暂不绑定'}].concat(coaches.map(c=>({value:c.id,label:c.name})));
  const dataScopeOptions=[{value:'all',label:'全部校区'},{value:'campus',label:'指定校区'},{value:'coach',label:'仅本人教练'}];
  const roleControl=renderStandardDropdownHtml('au_role','角色',roleOptions,rv(user,'role','editor'),true,'toggleAdminUserPermissionFields');
  const passwordRow=id?'':`<div class="tms-form-row"><div class="tms-form-item full-width"><label class="tms-form-label">初始密码 *</label><input class="finput tms-form-control" id="au_password" type="password" placeholder="请填写初始密码"></div></div>`;
  const accountHint=id?'<div style="font-size:12px;color:var(--ts);line-height:1.6;margin-top:8px">可修改姓名、手机号、绑定教练和约球权限；需要时可单独重置密码。</div>':'<div style="font-size:12px;color:var(--ts);line-height:1.6;margin-top:8px">账号创建后用于登录。教练账号绑定教练后，登录会进入教练工作台。</div>';
  const statusRow=id?`<div class="tms-form-row"><div class="tms-form-item"><label class="tms-form-label">当前状态</label><input class="finput tms-form-control" id="au_status" value="${adminUserStatusText(user?.status)}" readonly></div></div>`:'';
  const dataScopeRow=`<div class="tms-form-row" id="auDataScopeRow"><div class="tms-form-item"><label class="tms-form-label">数据范围</label>${renderStandardDropdownHtml('au_dataScope','数据范围',dataScopeOptions,profile.dataScope,true,'toggleAdminUserScopeFields')}</div></div>`;
  const campusScopeRow=`<div class="tms-form-row" id="auCampusScopeWrap"><div class="tms-form-item full-width"><label class="tms-form-label">可看校区</label><div class="tms-checkbox-matrix">${adminUserCampusScopeChecks(campusIds)}</div></div></div>`;
  const matchPermissionRow=`<div class="tms-section-header">约球权限</div><div class="tms-form-row"><label class="choice-tag"><input type="checkbox" id="au_match_ops" ${perms.includes('match_ops')?'checked':''}>约球运营</label><label class="choice-tag"><input type="checkbox" id="au_match_finance" ${perms.includes('match_finance')?'checked':''}>约球财务</label></div>`;
  const officialBindingRow=`<div class="tms-section-header">服务号绑定</div><div class="admin-user-readonly-line">${adminUserOfficialAccountText(user||{})} · 请在服务号内发送 #绑定 手机号 完成绑定</div>`;
  const resetPasswordRow=id?`<div class="tms-section-header">重置密码</div><div class="tms-form-row"><div class="tms-form-item"><label class="tms-form-label">新密码</label><input class="finput tms-form-control" id="au_reset_password" type="password" placeholder="输入新密码"></div><div class="tms-form-item" style="align-self:flex-end"><button class="tms-btn tms-btn-default" id="adminUserResetPasswordBtn" onclick="resetAdminUserPassword()">重置密码</button></div></div>`:'';
  const body=`<div class="tms-section-header" style="margin-top:0;">基础信息</div><div class="tms-form-row"><div class="tms-form-item"><label class="tms-form-label">账号ID *</label><input class="finput tms-form-control" id="au_id" value="${rv(user,'id')}" placeholder="例：coach_zhang"${id?' readonly':''}></div><div class="tms-form-item"><label class="tms-form-label">姓名 *</label><input class="finput tms-form-control" id="au_name" value="${rv(user,'name')}" placeholder="显示名称"></div></div>${passwordRow}<div class="tms-form-row"><div class="tms-form-item"><label class="tms-form-label">手机号</label><input class="finput tms-form-control" id="au_phone" value="${rv(user,'phone')}" placeholder="用于关联约球小程序"></div><div class="tms-form-item"><label class="tms-form-label">角色</label>${roleControl}</div></div><div class="tms-form-row"><div class="tms-form-item" id="au_coach_wrap" style="display:${!id||user?.role==='editor'?'':'none'}"><label class="tms-form-label">绑定教练</label>${renderStandardDropdownHtml('au_coachId','绑定教练',coachOptions,adminUserCoachId(user||{}),true)}</div></div><div class="tms-section-header">数据权限</div>${dataScopeRow}${campusScopeRow}${officialBindingRow}${statusRow}${matchPermissionRow}${resetPasswordRow}${accountHint}`;
  const actions=`<button class="tms-btn tms-btn-default" onclick="closeModal()">取消</button><button class="tms-btn tms-btn-primary" id="adminUserSaveBtn" onclick="saveAdminUser()">保存</button>`;
  setCourtModalFrame(id?'编辑账号':'新增账号',body,actions,'modal-tight');
  toggleAdminUserPermissionFields();
}
async function resetAdminUserPassword(){
  const id=document.getElementById('au_id')?.value.trim();
  const password=document.getElementById('au_reset_password')?.value.trim();
  if(!id||!password){toast('请填写新密码','warn');return;}
  const confirmed=await appConfirm(`确认重置账号「${id}」的密码？`,{title:'重置密码',confirmText:'确认重置'});
  if(!confirmed)return;
  const btn=document.getElementById('adminUserResetPasswordBtn');if(btn){btn.disabled=true;btn.textContent='重置中…';}
  try{
    await apiCall('POST','/admin/reset-user-password',{id,password});
    document.getElementById('au_reset_password').value='';
    toast('密码已重置 ✓','success');
  }catch(e){
    toast('重置失败：'+e.message,'error');
  }finally{
    if(btn){btn.disabled=false;btn.textContent='重置密码';}
  }
}
function collectAdminUserMatchPermissions(){
  const list=[];
  if(document.getElementById('au_match_ops')?.checked)list.push('match_ops');
  if(document.getElementById('au_match_finance')?.checked)list.push('match_finance');
  return list;
}
function collectAdminUserCampusIds(){
  return [...document.querySelectorAll('.au-campus-cb:checked')].map(cb=>cb.value).filter(Boolean);
}
async function saveAdminUser(){
  const id=document.getElementById('au_id').value.trim();
  const name=document.getElementById('au_name').value.trim();
  const phone=document.getElementById('au_phone')?.value.trim()||'';
  const roleValue=document.getElementById('au_role')?.value||'editor';
  const coachId=document.getElementById('au_coachId')?.value||'';
  const coach=coaches.find(c=>c.id===coachId);
  const rawDataScope=document.getElementById('au_dataScope')?.value||'all';
  const dataScope=roleValue==='editor'?'coach':(rawDataScope==='campus'?'campus':'all');
  const campusIds=dataScope==='campus'?collectAdminUserCampusIds():[];
  if(!id||!name){toast('请填写账号和姓名','warn');return;}
  if(!editId){
    const password=document.getElementById('au_password').value.trim();
    if(!password){toast('请填写初始密码','warn');return;}
  }
  if(roleValue==='editor'&&!coachId){toast('教练账号请先绑定教练','warn');return;}
  if(dataScope==='campus'&&!campusIds.length){toast('请选择可看校区','warn');return;}
  const btn=document.getElementById('adminUserSaveBtn');if(btn){btn.disabled=true;btn.textContent='保存中…';}
  try{
    const matchPermissions=collectAdminUserMatchPermissions();
    if(editId){
      const current=adminUsers.find(x=>x.id===editId)||{};
      await apiCall('POST','/admin/update-user',{id,name,phone,role:roleValue,coachId:roleValue==='editor'?coachId:'',coachName:roleValue==='editor'?(coach?.name||''):'',status:current.status||'active',dataScope,campusIds,matchPermissions});
    }else{
      await apiCall('POST','/admin/create-user',{id,name,phone,password:document.getElementById('au_password').value.trim(),role:roleValue,coachId:roleValue==='editor'?coachId:'',coachName:roleValue==='editor'?(coach?.name||''):'',dataScope,campusIds,matchPermissions});
    }
    await loadAdminUsers(true);
    closeModal();
    toast(editId?'账号更新成功 ✓':'账号创建成功 ✓','success');
  }catch(e){
    toast('保存失败：'+e.message,'error');
    if(btn){btn.disabled=false;btn.textContent='保存';}
  }
}
