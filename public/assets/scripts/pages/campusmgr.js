function renderCampuses(){
  const tbody=document.getElementById('campusTbody');if(!tbody)return;
  const q=(document.getElementById('campusSearch')?.value||'').toLowerCase();
  const list=campuses.filter(c=>searchHit(q,c.name,c.code,c.id));
  tbody.innerHTML=list.length?list.map(c=>{
    const code=renderCourtEmptyText(c.code||c.id);
    return `<tr><td style="padding-left:20px">${renderCourtCellText(c.name,false)}</td><td><span class="tms-tag tms-tag-tier-gold">${esc(code)}</span></td><td>${renderCourtCellText(c.createdAt?c.createdAt.slice(0,10):'')}</td><td class="tms-sticky-r tms-action-cell" style="width:132px;padding-right:20px;text-align:right"><span class="tms-action-link" onclick="openCampusModal('${c.id}')">编辑</span><span class="tms-action-link" onclick="confirmDel('${c.id}','${esc(c.name)}','campus')">删除</span></td></tr>`;
  }).join(''):'<tr><td colspan="4"><div class="empty"><p>暂无校区</p></div></td></tr>';
}
function openCampusModal(id){
  editId=id;const c=id?campuses.find(x=>x.id===id):null;
  const body=`<div class="tms-section-header" style="margin-top:0;">基础信息</div><div class="tms-form-row"><div class="tms-form-item"><label class="tms-form-label">校区名称 *</label><input class="finput tms-form-control" id="ca_name" value="${rv(c,'name')}" placeholder="例：朝阳十里堡"></div><div class="tms-form-item"><label class="tms-form-label">校区代码 *</label><input class="finput tms-form-control" id="ca_code" value="${rv(c,'code')}" placeholder="例：shilipu"${id?' disabled':''}></div></div><div style="font-size:12px;color:var(--ts);line-height:1.6;margin-top:8px">校区代码创建后不可修改，用于关联学员、排课和订场数据。</div>`;
  const actions=`<button class="tms-btn tms-btn-default" onclick="closeModal()">取消</button><button class="tms-btn tms-btn-primary" id="campusSaveBtn" onclick="saveCampus()">保存</button>`;
  setCourtModalFrame(id?'编辑校区':'新增校区',body,actions,'modal-tight');
}
async function saveCampus(){
  const name=document.getElementById('ca_name').value.trim();
  const code=document.getElementById('ca_code').value.trim();
  if(!name||!code){toast('请填写名称和代码','warn');return;}
  if(!editId&&campuses.find(c=>(c.code||c.id)===code)){toast('代码已存在','warn');return;}
  const btn=document.getElementById('campusSaveBtn');if(btn){btn.disabled=true;btn.textContent='保存中…';}
  const data={name,code};
  try{
    if(editId){await apiCall('PUT','/campuses/'+editId,data);const i=campuses.findIndex(x=>x.id===editId);campuses[i]={...campuses[i],...data};}
    else{const r=await apiCall('POST','/campuses',data);campuses.push(r);}
    CAMPUS={};campuses.forEach(x=>{CAMPUS[x.code||x.id]=x.name||x.code||x.id;});
    buildCampusTabs();closeModal();toast(editId?'校区修改成功 ✓':'校区新增成功 ✓','success');renderCampuses();renderAll();
  }catch(e){toast('保存失败：'+e.message,'error');if(btn){btn.disabled=false;btn.textContent='保存';}}
}
