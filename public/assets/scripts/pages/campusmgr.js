function renderCampuses(){
  const tbody=document.getElementById('campusTbody');if(!tbody)return;
  const q=(document.getElementById('campusSearch')?.value||'').toLowerCase();
  const list=campuses.filter(c=>searchHit(q,c.name,c.code,c.id));
  tbody.innerHTML=list.length?list.map(c=>{
    const code=renderStandardEmptyText(c.code||c.id);
    const activeCount=activeCampusVenueCount(c);
    return `<tr><td style="padding-left:20px">${renderStandardCellText(c.name,false)}</td><td><span class="tms-tag tms-tag-tier-gold">${esc(code)}</span></td><td>${renderStandardCellText(activeCount?`${activeCount} 片`:'未配置',false)}</td><td>${renderStandardCellText(c.createdAt?c.createdAt.slice(0,10):'')}</td><td class="tms-sticky-r tms-action-cell" style="width:132px;padding-right:20px;text-align:right"><span class="tms-action-link" onclick="openCampusModal('${c.id}')">编辑</span><span class="tms-action-link" onclick="confirmDel('${c.id}','${esc(c.name)}','campus')">删除</span></td></tr>`;
  }).join(''):'<tr><td colspan="5"><div class="empty"><p>暂无校区</p></div></td></tr>';
  renderCampusMobileCards(list);
}
function renderCampusMobileCards(list){
  const host=document.getElementById('campusMobileCards');
  if(!host)return;
  if(!list.length){
    host.innerHTML='<div class="tms-empty-state"><div class="tms-empty-title">暂无校区</div><div class="tms-empty-desc">调整搜索后再看</div></div>';
    return;
  }
  host.innerHTML=list.map(c=>{
    const code=renderStandardEmptyText(c.code||c.id);
    const activeCount=activeCampusVenueCount(c);
    return `<article class="admin-h5-list-card admin-h5-campus-card">
      <div class="admin-h5-card-head">
        <div><strong>${esc(c.name||'-')}</strong><span>${esc(c.createdAt?c.createdAt.slice(0,10):'-')}</span></div>
        <span class="tms-tag tms-tag-tier-gold">${esc(code)}</span>
      </div>
      <div class="admin-h5-card-grid"><span><b>启用场地</b>${esc(activeCount?`${activeCount} 片`:'未配置')}</span><span><b>校区代码</b>${esc(code)}</span></div>
      <p>${esc((Array.isArray(c.venues)?c.venues:[]).map(v=>v.name).filter(Boolean).join('、')||'暂无场地配置')}</p>
      <div class="admin-h5-card-actions"><button type="button" onclick="openCampusModal('${c.id}')">编辑</button><button type="button" onclick="confirmDel('${c.id}','${esc(c.name)}','campus')">删除</button></div>
    </article>`;
  }).join('');
}
function campusVenueRowHtml(venue={},index=0){
  const id=esc(venue.id||`venue-${Date.now()}-${index}`);
  const spaceType=venue.spaceType||'室内';
  return `<div class="campus-venue-row" data-campus-venue-row data-venue-id="${id}"><div class="tms-form-item campus-venue-name"><label class="tms-form-label">场地名称</label><input class="finput tms-form-control" data-campus-venue-name value="${esc(venue.name||'')}" placeholder="例：1号场"></div><div class="tms-form-item campus-venue-type"><label class="tms-form-label">室内/室外</label>${renderStandardDropdownHtml(`ca_venue_type_${index}`,'室内/室外',[{value:'室内',label:'室内'},{value:'室外',label:'室外'}],spaceType,true)}</div><button type="button" class="tms-btn tms-btn-ghost campus-venue-remove" onclick="removeCampusVenueRow(this)">移除</button></div>`;
}
function renderCampusVenueRows(venues=[]){
  const rows=normalizeCampusVenues(venues);
  return (rows.length?rows:[{name:'',spaceType:'室内',status:'active',sortOrder:1}]).map(campusVenueRowHtml).join('');
}
function addCampusVenueRow(){
  const host=document.getElementById('ca_venue_rows');
  if(!host)return;
  const index=host.querySelectorAll('[data-campus-venue-row]').length;
  host.insertAdjacentHTML('beforeend',campusVenueRowHtml({sortOrder:index+1},index));
}
function removeCampusVenueRow(btn){
  const row=btn?.closest?.('[data-campus-venue-row]');
  if(row)row.remove();
}
function collectCampusVenueFormRows(){
  return [...document.querySelectorAll('[data-campus-venue-row]')].map((row,index)=>{
    const name=row.querySelector('[data-campus-venue-name]')?.value.trim()||'';
    if(!name)return null;
    return {
      id:row.dataset.venueId||`venue-${index+1}`,
      name,
      spaceType:row.querySelector(`#ca_venue_type_${index}`)?.value||row.querySelector('[id^="ca_venue_type_"]')?.value||'室内',
      status:'active',
      sortOrder:index+1
    };
  }).filter(Boolean);
}
function openCampusModal(id){
  editId=id;const c=id?campuses.find(x=>x.id===id):null;
  const body=`<div class="tms-section-header" style="margin-top:0;">基础信息</div><div class="tms-form-row"><div class="tms-form-item"><label class="tms-form-label">校区名称 *</label><input class="finput tms-form-control" id="ca_name" value="${rv(c,'name')}" placeholder="例：朝阳十里堡"></div><div class="tms-form-item"><label class="tms-form-label">校区代码 *</label><input class="finput tms-form-control" id="ca_code" value="${rv(c,'code')}" placeholder="例：shilipu"${id?' disabled':''}></div></div><div style="font-size:12px;color:var(--ts);line-height:1.6;margin-top:8px">校区代码创建后不可修改，用于关联学员、排课和订场数据。</div><div class="tms-section-header">场地配置</div><div id="ca_venue_rows">${renderCampusVenueRows(c?.venues)}</div><button type="button" class="tms-btn tms-btn-ghost" onclick="addCampusVenueRow()">新增场地</button>`;
  const actions=`<button class="tms-btn tms-btn-default" onclick="closeModal()">取消</button><button class="tms-btn tms-btn-primary" id="campusSaveBtn" onclick="saveCampus()">保存</button>`;
  openStandardModal({title:id?'编辑校区':'新增校区',bodyHtml:body,actionsHtml:actions,extraClass:'modal-tight'});
}
async function saveCampus(){
  const name=document.getElementById('ca_name').value.trim();
  const code=document.getElementById('ca_code').value.trim();
  if(!name||!code){toast('请填写名称和代码','warn');return;}
  if(!editId&&campuses.find(c=>(c.code||c.id)===code)){toast('代码已存在','warn');return;}
  const data={name,code,venues:collectCampusVenueFormRows()};
  await runStandardMutation('campusSaveBtn',async()=>{
    if(editId){await apiCall('PUT','/campuses/'+editId,data);const i=campuses.findIndex(x=>x.id===editId);campuses[i]={...campuses[i],...data};}
    else{const r=await apiCall('POST','/campuses',data);campuses.push(r);}
  },{
    successText:editId?'校区修改成功 ✓':'校区新增成功 ✓',
    closeOnSuccess:true,
    refresh:()=>{
    CAMPUS={};campuses.forEach(x=>{CAMPUS[x.code||x.id]=x.name||x.code||x.id;});
      buildCampusTabs();renderCampuses();renderAll();
    }
  });
}
