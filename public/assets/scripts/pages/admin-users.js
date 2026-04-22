function adminUserRoleText(role){
  return role==='admin'?'管理员':'教练账号';
}
function adminUserStatusText(status){
  return status==='inactive'?'已停用':'正常';
}
function adminUserCoachText(user){
  return user.role==='editor'?(user.coachName||coaches.find(c=>c.id===user.coachId)?.name||'未绑定'):'—';
}
function adminUserWechatText(user){
  if(user.role!=='editor')return '—';
  return user.wechatBound?`已绑定${user.wechatBoundAt?' · '+String(user.wechatBoundAt).slice(0,10):''}`:'未绑定';
}
function adminUserNoteText(user){
  const perms=Array.isArray(user.matchPermissions)?user.matchPermissions:[];
  if(perms.includes('match_ops')||perms.includes('match_finance'))return `约球权限：${[perms.includes('match_ops')?'运营':'',perms.includes('match_finance')?'财务':''].filter(Boolean).join('、')}`;
  return user.role==='editor'?'用于教练登录工作台':'用于后台管理';
}
async function loadAdminUsers(force=false){
  if(currentUser?.role!=='admin')return;
  if(adminUsersLoaded&&!force){renderAdminUsers();return;}
  try{
    adminUsers=await apiCall('GET','/admin/users');
    adminUsersLoaded=true;
    renderAdminUsers();
  }catch(e){
    toast('账号列表加载失败：'+e.message,'error');
  }
}
function renderAdminUsers(){
  const tbody=document.getElementById('adminUserTbody');if(!tbody)return;
  const q=(document.getElementById('adminUserSearch')?.value||'').toLowerCase();
  const list=adminUsers.filter(u=>searchHit(q,u.id,u.name,adminUserRoleText(u.role),adminUserStatusText(u.status),u.coachName,adminUserCoachText(u),adminUserWechatText(u)));
  tbody.innerHTML=list.length?list.map(u=>{
    const statusText=adminUserStatusText(u.status);
    const statusClass=u.status==='inactive'?'':'tms-tag-green';
    const toggleText=u.status==='inactive'?'启用':'停用';
    const wechatClass=u.wechatBound?'tms-tag-green':'tms-tag-tier-slate';
    const wechatAction=u.wechatBound?`<span class="tms-action-link" onclick="unbindAdminUserWechat('${u.id}')">解绑微信</span>`:'';
    return `<tr><td style="padding-left:20px">${renderCourtCellText(u.id,false)}</td><td>${renderCourtCellText(u.name,false)}</td><td><span class="tms-tag ${u.role==='admin'?'':'tms-tag-green'}">${adminUserRoleText(u.role)}</span></td><td><span class="tms-tag ${statusClass}">${statusText}</span></td><td><span title="绑定教练">${renderCourtCellText(adminUserCoachText(u))}</span></td><td><span title="微信通知"><span class="tms-tag ${wechatClass}">${adminUserWechatText(u)}</span></span></td><td>${renderCourtCellText(adminUserNoteText(u))}</td><td class="tms-sticky-r tms-action-cell" style="width:220px;padding-right:20px;text-align:right">${wechatAction}<span class="tms-action-link" onclick="openAdminUserModal('${u.id}')">编辑</span><span class="tms-action-link" onclick="toggleAdminUserStatus('${u.id}')">${toggleText}</span></td></tr>`;
  }).join(''):'<tr><td colspan="8"><div class="empty"><p>暂无账号</p></div></td></tr>';
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
function toggleAdminUserCoachBinding(){
  const role=document.getElementById('au_role')?.value||'editor';
  const wrap=document.getElementById('au_coach_wrap');
  if(wrap)wrap.style.display=role==='editor'?'':'none';
}
function openAdminUserModal(id){
  editId=id||null;
  const user=id?adminUsers.find(x=>x.id===id):null;
  const perms=Array.isArray(user?.matchPermissions)?user.matchPermissions:[];
  const roleOptions=[{value:'editor',label:'教练账号'},{value:'admin',label:'管理员'}];
  const coachOptions=[{value:'',label:'暂不绑定'}].concat(coaches.map(c=>({value:c.id,label:c.name})));
  const roleControl=id?`<input class="finput tms-form-control" id="au_role" value="${adminUserRoleText(user?.role)}" readonly>`:renderCourtDropdownHtml('au_role','角色',roleOptions,rv(user,'role','editor'),true,'toggleAdminUserCoachBinding');
  const passwordRow=id?'':`<div class="tms-form-row"><div class="tms-form-item full-width"><label class="tms-form-label">初始密码 *</label><input class="finput tms-form-control" id="au_password" type="password" placeholder="请填写初始密码"></div></div>`;
  const accountHint=id?'<div style="font-size:12px;color:var(--ts);line-height:1.6;margin-top:8px">已有账号暂不支持在这里改密码，先保留姓名和绑定教练的修改。</div>':'<div style="font-size:12px;color:var(--ts);line-height:1.6;margin-top:8px">账号创建后用于登录。教练账号绑定教练后，登录会进入教练工作台。</div>';
  const statusRow=id?`<div class="tms-form-row"><div class="tms-form-item"><label class="tms-form-label">当前状态</label><input class="finput tms-form-control" id="au_status" value="${adminUserStatusText(user?.status)}" readonly></div></div>`:'';
  const matchPermissionRow=`<div class="tms-section-header">约球权限</div><div class="tms-form-row"><label class="choice-tag"><input type="checkbox" id="au_match_ops" ${perms.includes('match_ops')?'checked':''}>约球运营</label><label class="choice-tag"><input type="checkbox" id="au_match_finance" ${perms.includes('match_finance')?'checked':''}>约球财务</label></div>`;
  const body=`<div class="tms-section-header" style="margin-top:0;">基础信息</div><div class="tms-form-row"><div class="tms-form-item"><label class="tms-form-label">账号ID *</label><input class="finput tms-form-control" id="au_id" value="${rv(user,'id')}" placeholder="例：coach_zhang"${id?' readonly':''}></div><div class="tms-form-item"><label class="tms-form-label">姓名 *</label><input class="finput tms-form-control" id="au_name" value="${rv(user,'name')}" placeholder="显示名称"></div></div>${passwordRow}<div class="tms-form-row"><div class="tms-form-item"><label class="tms-form-label">角色</label>${roleControl}</div><div class="tms-form-item" id="au_coach_wrap" style="display:${!id||user?.role==='editor'?'':'none'}"><label class="tms-form-label">绑定教练</label>${renderCourtDropdownHtml('au_coachId','绑定教练',coachOptions,rv(user,'coachId'),true)}</div></div>${statusRow}${matchPermissionRow}${accountHint}`;
  const actions=`<button class="tms-btn tms-btn-default" onclick="closeModal()">取消</button><button class="tms-btn tms-btn-primary" id="adminUserSaveBtn" onclick="saveAdminUser()">保存</button>`;
  setCourtModalFrame(id?'编辑账号':'新增账号',body,actions,'modal-tight');
  toggleAdminUserCoachBinding();
}
function collectAdminUserMatchPermissions(){
  const list=[];
  if(document.getElementById('au_match_ops')?.checked)list.push('match_ops');
  if(document.getElementById('au_match_finance')?.checked)list.push('match_finance');
  return list;
}
async function saveAdminUser(){
  const id=document.getElementById('au_id').value.trim();
  const name=document.getElementById('au_name').value.trim();
  const roleValue=editId?(adminUsers.find(x=>x.id===editId)?.role||'editor'):(document.getElementById('au_role')?.value||'editor');
  const coachId=document.getElementById('au_coachId')?.value||'';
  const coach=coaches.find(c=>c.id===coachId);
  if(!id||!name){toast('请填写账号和姓名','warn');return;}
  if(!editId){
    const password=document.getElementById('au_password').value.trim();
    if(!password){toast('请填写初始密码','warn');return;}
    if(roleValue==='editor'&&!coachId){toast('教练账号请先绑定教练','warn');return;}
  }
  const btn=document.getElementById('adminUserSaveBtn');if(btn){btn.disabled=true;btn.textContent='保存中…';}
  try{
    if(editId){
      const current=adminUsers.find(x=>x.id===editId)||{};
      await apiCall('POST','/admin/update-user',{id,name,coachId:roleValue==='editor'?coachId:'',coachName:roleValue==='editor'?(coach?.name||''):'',status:current.status||'active',matchPermissions:collectAdminUserMatchPermissions()});
    }else{
      await apiCall('POST','/admin/create-user',{id,name,password:document.getElementById('au_password').value.trim(),role:roleValue,coachId:roleValue==='editor'?coachId:'',coachName:roleValue==='editor'?(coach?.name||''):'',matchPermissions:collectAdminUserMatchPermissions()});
    }
    await loadAdminUsers(true);
    closeModal();
    toast(editId?'账号更新成功 ✓':'账号创建成功 ✓','success');
  }catch(e){
    toast('保存失败：'+e.message,'error');
    if(btn){btn.disabled=false;btn.textContent='保存';}
  }
}
