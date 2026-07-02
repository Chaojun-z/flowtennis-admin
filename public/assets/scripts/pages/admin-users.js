let adminUserDetailActiveTab='account';

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
  return user.officialAccountBound?`已绑定${user.officialAccountBoundAt?' · '+String(user.officialAccountBoundAt).slice(0,10):''}`:'未绑定';
}
function adminUserNoteText(user){
  return adminUserDataPermissionText(user);
}
function adminUserDataPermissionText(user){
  return adminUserDataScopeText(user);
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
function onAdminUserFilterChange(){adminUserPage=standardListFirstPage();renderAdminUsers();}
function renderAdminUserPagerControls(total,pages){
  const pageSizeHost=document.getElementById('adminUserPageSize');
  if(pageSizeHost)pageSizeHost.innerHTML=renderPageSizeSelectorHtml('adminUserPageSizeValue',adminUserPageSize,'setAdminUserPageSize');
  const btns=document.getElementById('adminUserPagerBtns');
  if(!btns)return;
  btns.innerHTML=(!total||pages<=1)?'':renderStandardPaginationButtonsHtml(adminUserPage,pages,'setAdminUserPage');
}
function setAdminUserPage(value){
  const total=getFilteredAdminUsers().length;
  adminUserPage=standardListPagination(total,value,adminUserPageSize).page;
  renderAdminUsers();
}
function setAdminUserPageSize(value){
  adminUserPageSize=standardListPageSize(value,adminUserPageSize);
  adminUserPage=standardListFirstPage();
  renderAdminUsers();
}
function jumpAdminUserPage(value){
  const total=getFilteredAdminUsers().length;
  adminUserPage=standardListPagination(total,value,adminUserPageSize).page;
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
  const isMobileList=document.body.classList.contains('admin-mobile');
  const pageState=isMobileList?{total:list.length,pages:1,page:1,slice:list}:standardListSlice(list,adminUserPage,adminUserPageSize);
  adminUserPage=pageState.page;
  const {total,pages,slice}=pageState;
  const pager=document.querySelector('#page-admin-users .tms-pagination');
  if(pager)pager.style.display=isMobileList?'none':(total?'flex':'none');
  const info=document.getElementById('adminUserPagerInfo');
  if(info)info.innerHTML=renderPagerInfoHtml(total);
  renderAdminUserPagerControls(total,pages);
  tbody.innerHTML=slice.length?slice.map(u=>{
    const statusText=adminUserStatusText(u.status);
    const statusClass=u.status==='inactive'?'':'tms-tag-green';
    const toggleText=u.status==='inactive'?'启用':'停用';
    const wechatClass=u.wechatBound?'tms-tag-green':'tms-tag-tier-slate';
    const officialClass=u.officialAccountBound?'tms-tag-green':'tms-tag-tier-slate';
    return `<tr><td class="tms-sticky-l" style="padding-left:20px">${renderStandardCellText(u.id,false)}</td><td>${renderStandardCellText(u.name,false)}</td><td><span title="手机号">${renderStandardCellText(adminUserPhoneText(u))}</span></td><td><span class="tms-tag ${u.role==='admin'?'':'tms-tag-green'}">${adminUserRoleText(u.role)}</span></td><td><span title="绑定教练">${renderStandardCellText(adminUserCoachText(u))}</span></td><td><span title="微信绑定"><span class="tms-tag ${wechatClass}">${adminUserWechatText(u)}</span></span></td><td><span title="服务号绑定"><span class="tms-tag ${officialClass}">${adminUserOfficialAccountText(u)}</span></span></td><td><span class="tms-tag ${statusClass}">${statusText}</span></td><td title="${esc(adminUserNoteText(u))}">${renderStandardCellText(adminUserNoteText(u))}</td><td class="tms-sticky-r tms-action-cell" style="width:170px;padding-right:20px;text-align:right"><span class="tms-action-link" onclick="adminUserDetailActiveTab='account';openAdminUserDetailDrawer('${u.id}')">查看</span><span class="tms-action-link" onclick="toggleAdminUserStatus('${u.id}')">${toggleText}</span></td></tr>`;
  }).join(''):adminUserEmptyStateHtml();
}
function adminUserDrawerHeaderHtml(user){
  const statusText=adminUserStatusText(user?.status);
  const statusClass=user?.status==='inactive'?'':'tms-tag-green';
  return renderDetailDrawerHero({
    title:user?.name||user?.id||'账号详情',
    avatar:(user?.name||user?.id||'账').slice(0,1),
    subtitle:[user?.id,adminUserRoleText(user?.role),adminUserPhoneText(user)].filter(Boolean).join(' · '),
    statusHtml:`<span class="schedule-detail-status ${statusClass}">${esc(statusText)}</span>`
  });
}
function adminUserAccountTabHtml(user){
  const fields=[
    renderDetailDrawerField('账号ID',user.id),
    renderDetailDrawerField('姓名',user.name),
    renderDetailDrawerField('手机号',adminUserPhoneText(user)),
    renderDetailDrawerField('角色',adminUserRoleText(user.role)),
    renderDetailDrawerField('绑定教练',adminUserCoachText(user)),
    renderDetailDrawerField('数据范围',adminUserDataPermissionText(user),{full:true}),
    renderDetailDrawerField('当前状态',adminUserStatusText(user.status))
  ].join('');
  const actions=`<button type="button" class="schedule-detail-action" onclick="openAdminUserDrawerEdit('${user.id}')">编辑</button>`;
  return `<div class="schedule-detail-content">${renderDetailDrawerCard('账号信息',fields,{actionsHtml:actions})}</div>`;
}
function adminUserBindingTabHtml(user){
  const wechatAction=user.wechatBound?`<button type="button" class="schedule-detail-action danger" onclick="unbindAdminUserWechat('${user.id}')">解绑微信</button>`:'';
  const officialAction=user.officialAccountBound?`<button type="button" class="schedule-detail-action danger" onclick="unbindAdminUserOfficialAccount('${user.id}')">解绑服务号</button>`:'';
  const wechatFields=[
    renderDetailDrawerField('绑定状态',adminUserWechatText(user)),
    renderDetailDrawerField('绑定时间',user.wechatBoundAt?String(user.wechatBoundAt).slice(0,10):'-')
  ].join('');
  const officialFields=[
    renderDetailDrawerField('绑定状态',adminUserOfficialAccountText(user)),
    renderDetailDrawerField('绑定时间',user.officialAccountBoundAt?String(user.officialAccountBoundAt).slice(0,10):'-'),
    renderDetailDrawerField('绑定方式','服务号内发送 #绑定 手机号',{full:true})
  ].join('');
  return `<div class="schedule-detail-content">${renderDetailDrawerCard('微信绑定',wechatFields,{actionsHtml:wechatAction})}${renderDetailDrawerCard('服务号绑定',officialFields,{actionsHtml:officialAction})}</div>`;
}
function setAdminUserDetailTab(tab){
  adminUserDetailActiveTab=tab==='binding'?'binding':'account';
  const id=document.getElementById('overlay')?.dataset.adminUserId;
  if(id)openAdminUserDetailDrawer(id);
}
function openAdminUserDetailDrawer(id){
  const user=adminUsers.find(x=>x.id===id);if(!user)return;
  const body=adminUserDetailActiveTab==='binding'?adminUserBindingTabHtml(user):adminUserAccountTabHtml(user);
  openStandardDetailDrawer({
    titleHtml:`${adminUserDrawerHeaderHtml(user)}${renderDetailDrawerTabs(adminUserDetailActiveTab,[['account','账号信息'],['binding','绑定关系']],{onClick:'setAdminUserDetailTab'})}`,
    bodyHtml:body,
    actionsHtml:'',
    data:{adminUserId:id},
    overlayClasses:['schedule-drawer-overlay'],
    modalClass:'modal modal-court modal-schedule-drawer modal-admin-user-drawer'
  });
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
    const drawerUserId=document.getElementById('overlay')?.dataset.adminUserId||'';
    await apiCall('POST','/admin/update-user',{id:user.id,name:user.name,coachId:user.coachId||'',coachName:user.coachName||'',status:user.status||'active',matchPermissions:user.matchPermissions||[],clearWechat:true});
    await loadAdminUsers(true);
    if(drawerUserId===id)openAdminUserDetailDrawer(id);
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
    const drawerUserId=document.getElementById('overlay')?.dataset.adminUserId||'';
    await apiCall('POST','/admin/update-user',{id:user.id,name:user.name,coachId:user.coachId||'',coachName:user.coachName||'',status:user.status||'active',matchPermissions:user.matchPermissions||[],clearOfficialAccount:true});
    await loadAdminUsers(true);
    if(drawerUserId===id)openAdminUserDetailDrawer(id);
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
  if(role!=='editor'&&scope==='coach'){
    if(typeof setStandardDropdownValue==='function')setStandardDropdownValue('au_dataScope','all','全部校区');
    scope='all';
  }
  if(row)row.style.display=row.dataset.adminDrawerScope==='1'||role==='admin'?'':'none';
  if(wrap)wrap.style.display=scope==='campus'?'':'none';
}
function toggleAdminUserPermissionFields(){
  toggleAdminUserCoachBinding();
  toggleAdminUserScopeFields();
}
function adminUserAccountFormCardHtml(user,{title='编辑账号',isCreate=false,actionsHtml=''}={}){
  const profile=adminUserProfile(user||{role:'editor',dataScope:'coach',campusIds:[],matchPermissions:[]});
  const campusIds=profile.campusIds||[];
  const roleOptions=FlowTennisBusinessTaxonomy.optionList('adminUserRoles');
  const coachOptions=[{value:'',label:'暂不绑定'}].concat(coaches.map(c=>({value:c.id,label:c.name})));
  const dataScopeOptions=FlowTennisBusinessTaxonomy.optionList('adminUserDataScopes');
  const roleControl=renderStandardDropdownHtml('au_role','角色',roleOptions,rv(user,'role','editor'),true,'toggleAdminUserPermissionFields');
  const dataScopeRow=`<div class="tms-form-row" id="auDataScopeRow" data-admin-drawer-scope="1"><div class="tms-form-item"><label class="tms-form-label">数据范围</label>${renderStandardDropdownHtml('au_dataScope','数据范围',dataScopeOptions,profile.dataScope,true,'toggleAdminUserScopeFields')}</div></div>`;
  const campusScopeRow=`<div class="tms-form-row" id="auCampusScopeWrap"><div class="tms-form-item full-width"><label class="tms-form-label">可看校区</label><div class="tms-checkbox-matrix">${adminUserCampusScopeChecks(campusIds)}</div></div></div>`;
  const form=`<div class="tms-section-header" style="margin-top:0;">基础信息</div><div class="tms-form-row"><div class="tms-form-item"><label class="tms-form-label">账号ID *</label><input class="finput tms-form-control" id="au_id" value="${rv(user,'id')}" placeholder="例：coach_zhang"${isCreate?'':' readonly'}></div><div class="tms-form-item"><label class="tms-form-label">姓名 *</label><input class="finput tms-form-control" id="au_name" value="${rv(user,'name')}" placeholder="显示名称"></div></div><div class="tms-form-row"><div class="tms-form-item"><label class="tms-form-label">手机号</label><input class="finput tms-form-control" id="au_phone" value="${rv(user,'phone')}" placeholder="用于关联约球小程序"></div><div class="tms-form-item"><label class="tms-form-label">角色</label>${roleControl}</div></div><div class="tms-form-row"><div class="tms-form-item" id="au_coach_wrap" style="display:${isCreate||user?.role==='editor'?'':'none'}"><label class="tms-form-label">绑定教练</label>${renderStandardDropdownHtml('au_coachId','绑定教练',coachOptions,adminUserCoachId(user||{}),true)}</div></div><div class="tms-section-header">数据权限</div>${dataScopeRow}${campusScopeRow}<div class="tms-form-row"><div class="tms-form-item"><label class="tms-form-label">当前状态</label><input class="finput tms-form-control" id="au_status" value="${adminUserStatusText(user?.status)}" readonly></div></div>`;
  return renderDetailDrawerFormCard(title,form,actionsHtml);
}
function adminUserPasswordCardHtml({isCreate=false}={}){
  const inputId=isCreate?'au_password':'au_reset_password';
  const title=isCreate?'初始密码':'重置密码';
  const label=isCreate?'初始密码 *':'新密码';
  const placeholder=isCreate?'请填写初始密码':'输入新密码';
  const button=isCreate?'':`<div class="tms-form-item" style="align-self:flex-end"><button class="tms-btn tms-btn-default" id="adminUserResetPasswordBtn" onclick="resetAdminUserPassword()">重置密码</button></div>`;
  const form=`<div class="tms-form-row"><div class="tms-form-item"><label class="tms-form-label">${label}</label><input class="finput tms-form-control" id="${inputId}" type="password" placeholder="${placeholder}"></div>${button}</div>`;
  return renderDetailDrawerFormCard(title,form);
}
function adminUserCreateHeaderHtml(){
  return renderDetailDrawerHero({title:'新增账号',avatar:'新',subtitle:'账号管理'});
}
function openAdminUserDrawerCreate(){
  editId=null;
  const user={role:'editor',status:'active',dataScope:'coach',campusIds:[],matchPermissions:[]};
  const actions=`<div class="schedule-detail-card-actions"><button type="button" class="schedule-detail-action muted" onclick="closeModal()">取消</button><button type="button" class="schedule-detail-action primary" id="adminUserSaveBtn" onclick="saveAdminUser()">保存</button></div>`;
  openStandardDetailDrawer({
    titleHtml:`${adminUserCreateHeaderHtml()}${renderDetailDrawerTabs('account',[['account','账号信息']],{onClick:'setAdminUserDetailTab'})}`,
    bodyHtml:`<div class="schedule-detail-content">${adminUserAccountFormCardHtml(user,{title:'新增账号',isCreate:true,actionsHtml:actions})}${adminUserPasswordCardHtml({isCreate:true})}</div>`,
    actionsHtml:'',
    data:{adminUserId:''},
    overlayClasses:['schedule-drawer-overlay'],
    modalClass:'modal modal-court modal-schedule-drawer modal-admin-user-drawer'
  });
  toggleAdminUserPermissionFields();
}
function openAdminUserDrawerEdit(id){
  const user=adminUsers.find(x=>x.id===id);if(!user)return;
  editId=id;
  const actions=`<div class="schedule-detail-card-actions"><button type="button" class="schedule-detail-action muted" onclick="openAdminUserDetailDrawer('${id}')">取消</button><button type="button" class="schedule-detail-action primary" id="adminUserSaveBtn" onclick="saveAdminUser()">保存</button></div>`;
  openStandardDetailDrawer({
    titleHtml:`${adminUserDrawerHeaderHtml(user)}${renderDetailDrawerTabs('account',[['account','账号信息'],['binding','绑定关系']],{onClick:'setAdminUserDetailTab'})}`,
    bodyHtml:`<div class="schedule-detail-content">${adminUserAccountFormCardHtml(user,{title:'编辑账号',actionsHtml:actions})}${adminUserPasswordCardHtml()}</div>`,
    actionsHtml:'',
    data:{adminUserId:id},
    overlayClasses:['schedule-drawer-overlay'],
    modalClass:'modal modal-court modal-schedule-drawer modal-admin-user-drawer'
  });
  toggleAdminUserPermissionFields();
}
function openAdminUserModal(id){
  if(id)return openAdminUserDrawerEdit(id);
  openAdminUserDrawerCreate();
}
async function resetAdminUserPassword(){
  const id=document.getElementById('au_id')?.value.trim();
  const password=document.getElementById('au_reset_password')?.value.trim();
  if(!id||!password){toast('请填写新密码','warn');return;}
  const confirmed=await appConfirm(`确认重置账号「${id}」的密码？`,{title:'重置密码',confirmText:'确认重置'});
  if(!confirmed)return;
  await runStandardMutation('adminUserResetPasswordBtn',async()=>{
    await apiCall('POST','/admin/reset-user-password',{id,password});
    document.getElementById('au_reset_password').value='';
  },{
    loadingText:'重置中…',
    errorPrefix:'重置失败',
    successText:'密码已重置 ✓'
  });
}
function collectAdminUserMatchPermissions(){
  return ['match_ops','match_finance'];
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
  const dataScope=rawDataScope==='campus'?'campus':(roleValue==='editor'&&rawDataScope==='coach'?'coach':'all');
  const campusIds=dataScope==='campus'?collectAdminUserCampusIds():[];
  if(!id||!name){toast('请填写账号和姓名','warn');return;}
  if(!editId){
    const password=document.getElementById('au_password').value.trim();
    if(!password){toast('请填写初始密码','warn');return;}
  }
  if(roleValue==='editor'&&!coachId){toast('教练账号请先绑定教练','warn');return;}
  if(dataScope==='campus'&&!campusIds.length){toast('请选择可看校区','warn');return;}
  await runStandardMutation('adminUserSaveBtn',async()=>{
    const matchPermissions=collectAdminUserMatchPermissions();
    if(editId){
      const current=adminUsers.find(x=>x.id===editId)||{};
      await apiCall('POST','/admin/update-user',{id,name,phone,role:roleValue,coachId:roleValue==='editor'?coachId:'',coachName:roleValue==='editor'?(coach?.name||''):'',status:current.status||'active',dataScope,campusIds,matchPermissions});
    }else{
      await apiCall('POST','/admin/create-user',{id,name,phone,password:document.getElementById('au_password').value.trim(),role:roleValue,coachId:roleValue==='editor'?coachId:'',coachName:roleValue==='editor'?(coach?.name||''):'',dataScope,campusIds,matchPermissions});
    }
    await loadAdminUsers(true);
  },{
    successText:editId?'账号更新成功 ✓':'账号创建成功 ✓',
    closeOnSuccess:true
  });
}
