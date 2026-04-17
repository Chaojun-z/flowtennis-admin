function syncPackageFilterOptions(){
  const typeValue=document.getElementById('pkgTypeFilter')?.value||'';
  const statusValue=document.getElementById('pkgStatusFilter')?.value||'';
  const typeOptions=[{value:'',label:'全部类型'},...PRODUCT_TYPES.map(t=>({value:t,label:t}))];
  const statusOptions=[{value:'',label:'全部状态'},{value:'active',label:'启用'},{value:'inactive',label:'停用'}];
  const wrapMap=[
    ['pkgTypeFilterHost','pkgTypeFilter','全部类型',typeOptions,typeValue],
    ['pkgStatusFilterHost','pkgStatusFilter','全部状态',statusOptions,statusValue]
  ];
  wrapMap.forEach(([hostId,id,label,options,value])=>{
    const host=document.getElementById(hostId);
    if(host)host.innerHTML=renderCourtDropdownHtml(id,label,options,value,false,'renderPackages');
  });
}
function renderPackages(){
  syncPackageFilterOptions();
  const q=(document.getElementById('pkgSearch')?.value||'').toLowerCase();
  const tf=document.getElementById('pkgTypeFilter')?.value||'';
  const sf=document.getElementById('pkgStatusFilter')?.value||'';
  const list=packages.filter(p=>{if(!searchHit(q,p.name,p.courseType,p.price,p.lessons,p.timeBand,p.notes,p.productName))return false;if(tf&&p.courseType!==tf)return false;if(sf&&String(p.status||'active')!==sf)return false;return true;});
  const host=document.getElementById('packageGrid');
  if(!products.length){
    host.innerHTML=`<div class="course-package-showcase-empty"><div style="font-size:18px;font-weight:800;color:var(--cream-pale)">还没有课程产品</div><div style="margin-top:8px;font-size:13px;line-height:1.7">先创建课程产品，再基于课程产品创建售卖课包。</div><button class="tms-btn tms-btn-ghost" onclick="goPage('products')">去创建课程产品</button></div>`;
    return;
  }
  host.innerHTML=list.length?list.map(p=>{
    const status=String(p.status||'active');
    const windows=parseArr(p.dailyTimeWindows).map(w=>[w.startTime,w.endTime].filter(Boolean).join(' - ')).filter(Boolean).join('、');
    const timeWindow=[p.timeBand||'全天',windows].filter(Boolean).join(' · ');
    const coachText=parseArr(p.coachNames).join('、')||'不限';
    const campusText=parseArr(p.campusIds).map(id=>cn(id)).join('、')||'不限';
    return `<div class="package-card-shell"><div class="showcase-card-body"><div class="showcase-card-header"><div class="showcase-card-title-group"><div class="showcase-card-title">${esc(p.name)}<span class="tms-tag ${productTypeTagClass(p.courseType)}">${esc(p.courseType||'—')}</span></div><div class="showcase-card-subtitle">关联产品: ${esc(p.productName||'—')}</div></div><span class="showcase-status-tag ${status==='inactive'?'is-off':'is-on'}">${status==='inactive'?'停用':'启用'}</span></div><div class="showcase-highlight"><span class="showcase-highlight-price">¥${fmt(p.price)}</span><span class="showcase-highlight-divider">/</span><span class="showcase-highlight-value">${p.lessons||0}<span class="showcase-highlight-unit">节</span></span><span class="showcase-highlight-divider">/</span><span class="showcase-highlight-value">${p.maxStudents||1}<span class="showcase-highlight-unit">人</span></span></div><div class="showcase-kv-list"><div class="showcase-kv-row"><div class="showcase-kv-label">归属教练</div><div class="showcase-kv-value">购买时选择</div></div><div class="showcase-kv-row"><div class="showcase-kv-label">可上课教练</div><div class="showcase-kv-value">${esc(coachText)}</div></div><div class="showcase-kv-row"><div class="showcase-kv-label">可用校区</div><div class="showcase-kv-value">${esc(campusText)}</div></div><div class="showcase-kv-row"><div class="showcase-kv-label">活动期</div><div class="showcase-kv-value is-mono">${esc(p.saleStartDate||'不限')} <span class="showcase-kv-sep">至</span> ${esc(p.saleEndDate||'不限')}</div></div><div class="showcase-kv-row"><div class="showcase-kv-label">使用期</div><div class="showcase-kv-value is-mono">${esc(p.usageStartDate||'不限')} <span class="showcase-kv-sep">至</span> ${esc(p.usageEndDate||'不限')}</div></div><div class="showcase-kv-row"><div class="showcase-kv-label">使用时段</div><div class="showcase-kv-value">${esc(timeWindow||'全天')}</div></div></div></div><div class="showcase-card-footer"><div class="showcase-card-actions"><button class="showcase-action-btn is-primary" onclick="focusPurchaseByPackage('${p.id}')">看订单</button></div><div class="showcase-card-actions"><button class="showcase-action-btn" onclick="openPackageModal('${p.id}')">编辑</button><button class="showcase-action-btn is-danger" onclick="confirmDel('${p.id}','${esc(p.name)}','package')">删除</button></div></div></div>`;
  }).join(''):`<div class="course-package-showcase-empty"><div style="font-size:18px;font-weight:800;color:var(--cream-pale)">暂无售卖课包</div><div style="margin-top:8px;font-size:13px;line-height:1.7">先选一个课程产品，再创建对应的售卖方案。</div><button class="tms-btn tms-btn-primary" onclick="openPackageModal(null)">创建售卖课包</button></div>`;
}

function productOpts(sel){
  return '<option value="">— 选择课程产品 —</option>'+products.map(p=>`<option value="${p.id}"${sel===p.id?' selected':''}>${esc(p.name)}</option>`).join('');
}
function packageOpts(sel){
  return '<option value="">— 选择售卖课包 —</option>'+packages.filter(p=>p.status!=='inactive').map(p=>`<option value="${p.id}"${sel===p.id?' selected':''}>${esc(p.name)} · ¥${fmt(p.price)} · ${p.lessons||0}节</option>`).join('');
}
function purchasePackageOpts(sel){
  return '<option value="">— 选择售卖课包 —</option>'+packages.filter(p=>p.status!=='inactive'||p.id===sel).map(p=>`<option value="${p.id}"${sel===p.id?' selected':''}>${esc(p.name)} · ¥${fmt(p.price)} · ${p.lessons||0}节${p.status==='inactive'?' · 已停用':''}</option>`).join('');
}
function purchaseAllowedCoachChecks(ids,cls='pur-allowed-coach-cb'){
  ids=parseArr(ids);
  return activeCoachNames().map(name=>`<label class="choice-tag"><input type="checkbox" value="${esc(name)}" class="${cls}" ${ids.includes(name)?'checked':''}>${esc(name)}</label>`).join('')||'<span style="color:var(--td);font-size:12px">暂无教练</span>';
}
function packageCoachChecks(ids){
  ids=parseArr(ids);
  return activeCoachNames().map(name=>`<label class="choice-tag"><input type="checkbox" value="${esc(name)}" class="pkg-coach-cb" ${ids.includes(name)?'checked':''}>${esc(name)}</label>`).join('')||'<span style="color:var(--td);font-size:12px">暂无教练</span>';
}
function packageCampusChecks(ids){
  ids=parseArr(ids);
  return campuses.map(c=>`<label class="choice-tag"><input type="checkbox" value="${c.code||c.id}" class="pkg-campus-cb" ${ids.includes(c.code||c.id)?'checked':''}>${esc(c.name)}</label>`).join('')||'<span style="color:var(--td);font-size:12px">暂无校区</span>';
}
function syncPackageProductMeta(){
  const productId=document.getElementById('pkg_productId')?.value||'';
  const product=products.find(x=>x.id===productId);
  const typeEl=document.getElementById('pkg_type');
  if(typeEl&&product?.type)typeEl.value=product.type;
}

function openPackageModal(id,presetProductId=''){
  editId=id;const p=id?packages.find(x=>x.id===id):null;
  const productId=rv(p,'productId',presetProductId);
  const product=products.find(x=>x.id===productId);
  const locked=!!(id&&packageHasPurchases(id));
  const timeWindows=parseArr(p?.dailyTimeWindows);
  const windowRow=timeWindows[0]||{};
  const secondWindow=timeWindows[1]||{};
  const modal=document.querySelector('#overlay .modal');
  if(modal)modal.className='modal modal-wide';
  document.getElementById('mTitle').textContent=id?'编辑售卖课包':'新增售卖课包';
  document.getElementById('mBody').innerHTML=`
    <div class="form-section">
      <div class="form-section-title">基础信息</div>
      ${locked?'<div class="inline-help">核心字段已锁定：该课包已有购买记录，只能修改名称、状态和备注。</div>':''}
      <div class="fgrid cols-4">
        <div class="fg full"><div class="flabel">课包名称 *</div><input class="finput" id="pkg_name" value="${rv(p,'name')}" placeholder="例如：五一私教 5 节"></div>
        <div class="fg"><div class="flabel">课程产品 *</div><select class="fselect modern-select" id="pkg_productId" onchange="syncPackageProductMeta()"${locked?' disabled':''}>${productOpts(productId)}</select></div>
        <div class="fg"><div class="flabel">课程类型</div><select class="fselect modern-select" id="pkg_type" disabled>${PRODUCT_TYPES.map(t=>`<option value="${t}"${(rv(p,'courseType')||(product?.type||''))===t?' selected':''}>${t}</option>`).join('')}</select><div class="inline-help">课程类型跟随课程产品，避免售卖规则和消课规则不一致。</div></div>
        <div class="fg"><div class="flabel">人数限制</div><input class="finput" id="pkg_maxStudents" type="number" value="${rv(p,'maxStudents',1)}"${locked?' readonly':''}></div>
        <div class="fg"><div class="flabel">状态</div><select class="fselect modern-select" id="pkg_status"><option value="active"${rv(p,'status','active')==='active'?' selected':''}>启用</option><option value="inactive"${rv(p,'status')==='inactive'?' selected':''}>停用</option></select></div>
      </div>
    </div>
    <div class="form-section">
      <div class="form-section-title">售卖规则</div>
      <div class="fgrid cols-4">
        <div class="fg"><div class="flabel">价格</div><input class="finput" id="pkg_price" type="number" value="${rv(p,'price',0)}"${locked?' readonly':''}></div>
        <div class="fg"><div class="flabel">课时</div><input class="finput" id="pkg_lessons" type="number" value="${rv(p,'lessons',0)}"${locked?' readonly':''}></div>
        <div class="fg"><div class="flabel">有效天数</div><input class="finput" id="pkg_validDays" type="number" value="${rv(p,'validDays',30)}"${locked?' readonly':''}></div>
        <div class="fg"><div class="flabel">备注</div><input class="finput" id="pkg_notes_inline" value="${esc(rv(p,'notes'))}" placeholder="可选"></div>
      </div>
    </div>
    <div class="form-section">
      <div class="form-section-title">时间规则</div>
      <div class="inline-help">固定使用结束日优先；不填固定结束日时，按购买日起算有效天数。</div>
      <div class="fgrid cols-4">
        <div class="fg span-2">
          <div class="flabel">活动时间</div>
          <div class="range-pair">
            <button class="coach-date-btn" id="pkg_saleStartDate_btn" onclick="toggleGlobalDatePicker(event,'pkg_saleStartDate','pkg_saleStartDate_btn','活动开始')"${locked?' disabled':''}>${rv(p,'saleStartDate')||'活动开始'}</button>
            <span class="range-dash">-</span>
            <button class="coach-date-btn" id="pkg_saleEndDate_btn" onclick="toggleGlobalDatePicker(event,'pkg_saleEndDate','pkg_saleEndDate_btn','活动结束')"${locked?' disabled':''}>${rv(p,'saleEndDate')||'活动结束'}</button>
          </div>
          <input class="filter-hidden-date" id="pkg_saleStartDate" type="date" value="${rv(p,'saleStartDate')}" onchange="syncDateButton('pkg_saleStartDate','pkg_saleStartDate_btn','活动开始')"${locked?' disabled':''}>
          <input class="filter-hidden-date" id="pkg_saleEndDate" type="date" value="${rv(p,'saleEndDate')}" onchange="syncDateButton('pkg_saleEndDate','pkg_saleEndDate_btn','活动结束')"${locked?' disabled':''}>
        </div>
        <div class="fg span-2">
          <div class="flabel">使用时间</div>
          <div class="range-pair">
            <button class="coach-date-btn" id="pkg_usageStartDate_btn" onclick="toggleGlobalDatePicker(event,'pkg_usageStartDate','pkg_usageStartDate_btn','使用开始')"${locked?' disabled':''}>${rv(p,'usageStartDate')||'使用开始'}</button>
            <span class="range-dash">-</span>
            <button class="coach-date-btn" id="pkg_usageEndDate_btn" onclick="toggleGlobalDatePicker(event,'pkg_usageEndDate','pkg_usageEndDate_btn','使用结束')"${locked?' disabled':''}>${rv(p,'usageEndDate')||'使用结束'}</button>
          </div>
          <input class="filter-hidden-date" id="pkg_usageStartDate" type="date" value="${rv(p,'usageStartDate')}" onchange="syncDateButton('pkg_usageStartDate','pkg_usageStartDate_btn','使用开始')"${locked?' disabled':''}>
          <input class="filter-hidden-date" id="pkg_usageEndDate" type="date" value="${rv(p,'usageEndDate')}" onchange="syncDateButton('pkg_usageEndDate','pkg_usageEndDate_btn','使用结束')"${locked?' disabled':''}>
        </div>
        <div class="fg">
          <div class="flabel">时段类型</div>
          <select class="fselect modern-select" id="pkg_timeBand"${locked?' disabled':''}><option value="全天"${rv(p,'timeBand','全天')==='全天'?' selected':''}>全天</option><option value="黄金时段"${rv(p,'timeBand')==='黄金时段'?' selected':''}>黄金时段</option><option value="非黄金时段"${rv(p,'timeBand')==='非黄金时段'?' selected':''}>非黄金时段</option></select>
        </div>
        <div class="fg span-2">
          <div class="flabel">可用时段</div>
          <div class="time-window-stack">
            <div class="time-window-row"><input class="finput" id="pkg_timeStart" type="time" value="${rv(windowRow,'startTime','07:00')}"${locked?' readonly':''}><span class="range-dash">-</span><input class="finput" id="pkg_timeEnd" type="time" value="${rv(windowRow,'endTime','22:00')}"${locked?' readonly':''}></div>
            <div class="time-window-row"><input class="finput" id="pkg_timeStart2" type="time" value="${rv(secondWindow,'startTime','')}"${locked?' readonly':''}><span class="range-dash">-</span><input class="finput" id="pkg_timeEnd2" type="time" value="${rv(secondWindow,'endTime','')}"${locked?' readonly':''}></div>
          </div>
        </div>
        <div class="fg">
          <div class="flabel">说明</div>
          <div class="inline-help">可填写两段黄金/非黄金时段，例如 08:00-10:00、16:00-21:00。</div>
        </div>
      </div>
    </div>
    <div class="form-section">
      <div class="form-section-title">适用范围</div>
      <div class="inline-help">归属教练不在这里维护，实际售卖时按购买记录选择；这里维护的是这个课包允许哪些教练上课。</div>
      <div class="fg full"><div class="flabel">可上课教练</div><div class="choice-grid"${locked?' style="pointer-events:none;opacity:0.7"':''}>${packageCoachChecks(rv(p,'coachNames',[]))}</div></div>
      <div class="fg full" style="margin-top:12px"><div class="flabel">可用校区</div><div class="choice-grid"${locked?' style="pointer-events:none;opacity:0.7"':''}>${packageCampusChecks(rv(p,'campusIds',[]))}</div></div>
    </div>
    <textarea class="filter-hidden-date" id="pkg_notes" style="display:none">${esc(rv(p,'notes'))}</textarea>
    <div class="mactions"><button class="btn-cancel" onclick="closeModal()">取消</button>${id?`<button class="btn-del" onclick="confirmDel('${p.id}','${esc(p.name)}','package')">删除</button>`:''}<button class="btn-save" onclick="savePackage()">保存</button></div>`;
  document.getElementById('overlay').classList.add('open');
  syncPackageProductMeta();
}
async function savePackage(){
  const name=document.getElementById('pkg_name').value.trim();if(!name){toast('请输入课包名称','warn');return;}
  const productId=document.getElementById('pkg_productId').value;
  const product=products.find(x=>x.id===productId);
  const saleStartDate=document.getElementById('pkg_saleStartDate').value;
  const saleEndDate=document.getElementById('pkg_saleEndDate').value;
  const usageStartDate=document.getElementById('pkg_usageStartDate').value;
  const usageEndDate=document.getElementById('pkg_usageEndDate').value;
  const timeStart=document.getElementById('pkg_timeStart').value;
  const timeEnd=document.getElementById('pkg_timeEnd').value;
  const timeStart2=document.getElementById('pkg_timeStart2')?.value||'';
  const timeEnd2=document.getElementById('pkg_timeEnd2')?.value||'';
  if(saleStartDate&&saleEndDate&&saleEndDate<saleStartDate){toast('活动结束时间不能早于活动开始时间','warn');return;}
  if(usageStartDate&&usageEndDate&&usageEndDate<usageStartDate){toast('可用结束时间不能早于可用开始时间','warn');return;}
  if((timeStart&&!timeEnd)||(!timeStart&&timeEnd)){toast('第一个可用时段请填写完整','warn');return;}
  if(timeStart&&timeEnd&&timeEnd<=timeStart){toast('可用结束时间必须晚于可用开始时间','warn');return;}
  if((timeStart2&&!timeEnd2)||(!timeStart2&&timeEnd2)){toast('第二个可用时段请填写完整','warn');return;}
  if(timeStart2&&timeEnd2&&timeEnd2<=timeStart2){toast('第二个可用结束时间必须晚于开始时间','warn');return;}
  if((parseFloat(document.getElementById('pkg_price').value)||0)<=0){toast('价格必须大于 0','warn');return;}
  if((parseInt(document.getElementById('pkg_lessons').value)||0)<=0){toast('课时必须大于 0','warn');return;}
  if((parseInt(document.getElementById('pkg_validDays').value)||0)<=0){toast('有效天数必须大于 0','warn');return;}
  if((parseInt(document.getElementById('pkg_maxStudents').value)||0)<=0){toast('人数限制必须大于 0','warn');return;}
  const coachNames=[...document.querySelectorAll('.pkg-coach-cb:checked')].map(cb=>cb.value);
  const campusIds=[...document.querySelectorAll('.pkg-campus-cb:checked')].map(cb=>cb.value);
  const btn=document.querySelector('.btn-save');btn.disabled=true;btn.textContent='保存中…';
  document.getElementById('pkg_notes').value=document.getElementById('pkg_notes_inline').value.trim();
  const timeBand=document.getElementById('pkg_timeBand').value.trim()||'全天';
  const courseType=product?.type||document.getElementById('pkg_type').value;
  const dailyTimeWindows=[{label:timeBand,startTime:timeStart,endTime:timeEnd,daysOfWeek:[]}];
  if(timeStart2&&timeEnd2)dailyTimeWindows.push({label:timeBand,startTime:timeStart2,endTime:timeEnd2,daysOfWeek:[]});
  const data={name,productId,productName:product?.name||'',courseType,price:parseFloat(document.getElementById('pkg_price').value)||0,lessons:parseInt(document.getElementById('pkg_lessons').value)||0,validDays:parseInt(document.getElementById('pkg_validDays').value)||0,saleStartDate,saleEndDate,usageStartDate,usageEndDate,timeBand,dailyTimeWindows,coachNames,coachIds:coachNames,campusIds,maxStudents:parseInt(document.getElementById('pkg_maxStudents').value)||1,status:document.getElementById('pkg_status').value,notes:document.getElementById('pkg_notes').value.trim()};
  try{if(editId){const r=await apiCall('PUT','/packages/'+editId,data);const i=packages.findIndex(x=>x.id===editId);packages[i]=r;}else{const r=await apiCall('POST','/packages',data);packages.unshift(r);}closeModal();toast(editId?'课包修改成功 ✓':'课包创建成功 ✓','success');renderPackages();renderProducts();}catch(e){toast('保存失败：'+e.message,'error');btn.disabled=false;btn.textContent='保存';}
}
