function renderCoaches(){
  const q=(document.getElementById('coachSearch')?.value||'').toLowerCase();
  const d=coaches.filter(c=>searchHit(q,c.name,c.phone,cn(c.campus),c.status,c.notes));
  const tbody=document.getElementById('coachTbody');if(!tbody)return;
  tbody.innerHTML=d.length?d.map(c=>{
    const statusText=c.status==='inactive'?'离职':'在职';
    const statusClass=c.status==='inactive'?'':'tms-tag-green';
    return `<tr><td style="padding-left:20px">${renderCourtCellText(c.name,false)}</td><td>${renderCourtCellText(c.phone)}</td><td>${renderCourtCellText(cn(c.campus))}</td><td>${renderCourtCellText(c.hireDate)}</td><td><span class="tms-tag ${statusClass}">${statusText}</span></td><td><div class="tms-text-remark" title="${esc(c.notes||'')}">${esc(renderCourtEmptyText(c.notes))}</div></td><td class="tms-sticky-r tms-action-cell" style="width:180px;padding-right:20px"><span class="tms-action-link" onclick="openCoachModal('${c.id}')">编辑</span><span class="tms-action-link" onclick="confirmDel('${c.id}','${esc(c.name)}','coach')">删除</span></td></tr>`;
  }).join(''):'<tr><td colspan="7"><div class="empty"><p>暂无教练</p></div></td></tr>';
}

function openCoachModal(id){
  editId=id||null;const c=id?coaches.find(x=>x.id===id):null;
  const campusOptions=campuses.map(x=>({value:x.code||x.id,label:esc(x.name)}));
  const statusOptions=[{value:'active',label:'在职'},{value:'inactive',label:'离职'}];
  const body=`<div class="tms-section-header" style="margin-top:0;">基础信息</div><div class="tms-form-row"><div class="tms-form-item"><label class="tms-form-label">姓名 *</label><input class="finput tms-form-control" id="co_name" value="${rv(c,'name')}"></div><div class="tms-form-item"><label class="tms-form-label">电话</label><input class="finput tms-form-control" id="co_phone" value="${rv(c,'phone')}"></div></div><div class="tms-form-row"><div class="tms-form-item"><label class="tms-form-label">校区</label>${renderCourtDropdownHtml('co_campus','校区',campusOptions,rv(c,'campus')||campuses[0]?.code||campuses[0]?.id,true)}</div><div class="tms-form-item"><label class="tms-form-label">入职时间</label>${courtDateButtonHtml('co_hireDate',rv(c,'hireDate'),'入职日期')}</div><div class="tms-form-item"><label class="tms-form-label">状态</label>${renderCourtDropdownHtml('co_status','状态',statusOptions,rv(c,'status','active'),true)}</div></div><div class="tms-form-row" style="margin-bottom:0"><div class="tms-form-item full-width"><label class="tms-form-label">备注</label><textarea class="finput tms-form-control" id="co_notes">${esc(rv(c,'notes'))}</textarea></div></div>`;
  const actions=`<button class="tms-btn tms-btn-default" onclick="closeModal()">取消</button><button class="tms-btn tms-btn-primary" id="coachSaveBtn" onclick="saveCoach()">保存</button>`;
  setCourtModalFrame(id?'编辑教练':'新增教练',body,actions,'modal-tight');
}
async function saveCoach(){
  const name=document.getElementById('co_name').value.trim();if(!name){toast('请填写姓名','warn');return;}
  const phone=document.getElementById('co_phone').value.trim();if(!validateCnPhone(phone)){toast('手机号格式不正确','warn');return;}
  const data={name,phone,campus:document.getElementById('co_campus').value,hireDate:document.getElementById('co_hireDate').value,status:document.getElementById('co_status').value,notes:document.getElementById('co_notes').value.trim()};
  const btn=document.getElementById('coachSaveBtn');if(btn){btn.disabled=true;btn.textContent='保存中…';}
  try{
    if(editId){const r=await apiCall('PUT','/coaches/'+editId,data);const i=coaches.findIndex(x=>x.id===editId);if(i>=0)coaches[i]=r;}
    else{const r=await apiCall('POST','/coaches',data);coaches.unshift(r);}
    closeModal();renderCoaches();toast(editId?'更新成功 ✓':'添加成功 ✓','success');
  }catch(e){toast('保存失败：'+e.message,'error');if(btn){btn.disabled=false;btn.textContent='保存';}}
}
