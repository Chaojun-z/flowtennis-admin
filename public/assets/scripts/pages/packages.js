function syncPackageFilterOptions(){
  const typeValue=document.getElementById('pkgTypeFilter')?.value||'';
  const statusValue=document.getElementById('pkgStatusFilter')?.value||'';
  const typeOptions=[{value:'',label:'全部',emptyDisplay:'类型'},...PRODUCT_TYPES.map(t=>({value:t,label:t}))];
  const statusOptions=[{value:'',label:'全部',emptyDisplay:'状态'},{value:'active',label:'售卖中'},{value:'inactive',label:'已停售'}];
  const wrapMap=[
    ['pkgTypeFilterHost','pkgTypeFilter','类型',typeOptions,typeValue],
    ['pkgStatusFilterHost','pkgStatusFilter','状态',statusOptions,statusValue]
  ];
  wrapMap.forEach(([hostId,id,label,options,value])=>{
    const host=document.getElementById(hostId);
    if(host)host.innerHTML=renderCourtDropdownHtml(id,label,options,value,false,'renderPackages');
  });
}
function packageTimeBandShortLabel(timeBand='全天'){
  if(timeBand==='黄金时段')return'黄金时间';
  if(timeBand==='非黄金时段')return'非黄金时间';
  return'全天';
}
function packageClassSizeLabel(maxStudents=1,courseType=''){
  if(courseType==='私教课')return `1v${parseInt(maxStudents)||1}`;
  return '';
}
function packageCoreClassLabel(p){
  const courseType=normalizeCourseType(p.courseType)||'课包';
  return [packageClassSizeLabel(p.maxStudents,courseType),courseType].filter(Boolean).join(' ');
}
function packageDisplayTitle(p){
  const lessons=parseInt(p.lessons)||0;
  const title=[packageCoreClassLabel(p),lessons?`- ${lessons}课时`:'',`(${packageTimeBandShortLabel(p.timeBand||'全天')})`].filter(Boolean).join(' ');
  return title.trim()||p.name||'课包';
}
function packageAudienceLabel(p){
  const raw=String(p.name||p.notes||'');
  if(raw.includes('青少年'))return'青少年';
  if(raw.includes('成人'))return'成人';
  return '';
}
function packageCreatedDate(p){
  return String(p.createdAt||'').slice(0,10)||'-';
}
function packageStatusBadge(p){
  if(String(p.status||'active')==='inactive')return'<span class="package-status-badge is-off">已停售</span>';
  return'<span class="package-status-badge is-on">售卖中</span>';
}
function packageHistoryBadge(p){
  return String(p.name||'').includes('历史')?'<span class="package-history-badge">历史</span>':'';
}
function packageCardTags(p,courseType){
  return [packageCoreClassLabel(p),packageAudienceLabel(p)].filter(Boolean).map(t=>`<span class="package-info-tag ${productTypeTagClass(courseType)}">${esc(t)}</span>`).join('');
}
function renderPackages(){
  syncPackageFilterOptions();
  const q=(document.getElementById('pkgSearch')?.value||'').toLowerCase();
  const tf=document.getElementById('pkgTypeFilter')?.value||'';
  const sf=document.getElementById('pkgStatusFilter')?.value||'';
  const list=packages.filter(p=>{const courseType=normalizeCourseType(p.courseType);if(String(p.status||'active')==='merged')return false;if(!searchHit(q,p.name,packageDisplayTitle(p),courseType,p.price,p.lessons,p.timeBand,p.notes,p.productName,p.ownerCoach))return false;if(tf&&courseType!==tf)return false;if(sf&&String(p.status||'active')!==sf)return false;return true;}).sort((a,b)=>String(b.createdAt||'').localeCompare(String(a.createdAt||'')));
  const host=document.getElementById('packageGrid');
  host.innerHTML=list.length?list.map(p=>{
    const courseType=normalizeCourseType(p.courseType);
    const windows=parseArr(p.dailyTimeWindows).map(packageTimeWindowText).filter(Boolean).join('、');
    const timeWindow=[packageTimeBandShortLabel(p.timeBand||'全天'),windows].filter(Boolean).join(' · ');
    const campusText=parseArr(p.campusIds).map(id=>cn(id)).join('、')||'不限';
    return `<div class="package-card-shell"><div class="showcase-card-body"><div class="showcase-card-header"><div class="showcase-card-title-group"><div class="showcase-card-title">${esc(packageDisplayTitle(p))}<span class="tms-tag ${productTypeTagClass(courseType)}">${esc(courseType||'—')}</span>${packageHistoryBadge(p)}</div></div>${packageStatusBadge(p)}</div><div class="showcase-highlight"><span class="showcase-highlight-price">¥${fmt(p.price)}</span><span class="showcase-highlight-divider">/</span><span class="showcase-highlight-value">${p.lessons||0}<span class="showcase-highlight-unit">课时</span></span><span class="showcase-highlight-divider">/</span><span class="showcase-highlight-value">${p.maxStudents||1}<span class="showcase-highlight-unit">人</span></span></div><div class="package-card-tags">${packageCardTags(p,courseType)}</div><div class="package-card-main"><div><span>归属教练</span><strong>${esc(p.ownerCoach)||'-'}</strong></div><div><span>可用校区</span><strong>${esc(campusText)}</strong></div><div class="full"><span>可用时段</span><strong>${esc(timeWindow||'全天')}</strong></div></div></div><div class="showcase-card-footer"><div class="showcase-card-actions"><button class="showcase-action-btn is-primary" onclick="focusPurchaseByPackage('${p.id}')">看订单（${packagePurchaseCount(p.id)}）</button><div class="package-card-created">创建 ${esc(packageCreatedDate(p))}</div></div><div class="showcase-card-actions"><button class="showcase-action-btn" onclick="openPackageModal('${p.id}')">编辑</button><button class="showcase-action-btn is-danger" onclick="confirmDel('${p.id}','${esc(p.name)}','package')">删除</button></div></div></div>`;
  }).join(''):`<div class="course-package-showcase-empty"><div style="font-size:18px;font-weight:800;color:var(--cream-pale)">暂无售卖课包</div><div style="margin-top:8px;font-size:13px;line-height:1.7">点击创建即可直接配置课程类型、归属教练和可上课教练。</div><button class="tms-btn tms-btn-primary" onclick="openPackageModal(null)">创建课包</button></div>`;
}
function packagePurchaseCount(packageId){
  return purchases.filter(p=>p.packageId===packageId&&isMeaningfulPurchaseRecord(p)).length;
}
function packageOpts(sel){
  return '<option value="">— 选择售卖课包 —</option>'+packages.filter(p=>p.status!=='inactive').map(p=>`<option value="${p.id}"${sel===p.id?' selected':''}>${esc(p.name)} · ¥${fmt(p.price)} · ${p.lessons||0}节</option>`).join('');
}
function purchasePackageOpts(sel){
  return '<option value="">— 选择售卖课包 —</option>'+packages.filter(p=>p.status!=='inactive'||p.id===sel).map(p=>`<option value="${p.id}"${sel===p.id?' selected':''}>${esc(p.name)} · ¥${fmt(p.price)} · ${p.lessons||0}节${p.status==='inactive'?' · 已停用':''}</option>`).join('');
}
function packageMergeOpts(sel){
  return [{value:'',label:'— 选择课包 —'},...packages.filter(p=>p.status!=='merged').map(p=>({value:p.id,label:`${p.name} · ¥${fmt(p.price)} · ${p.lessons||0}节`}))];
}
function openPackageMergeModal(){
  const opts=packageMergeOpts('');
  const body=`<div class="tms-form-row"><div class="tms-form-item"><label class="tms-form-label">保留课包 *</label>${renderCourtDropdownHtml('pkg_merge_master','选择课包',opts,'',true)}</div><div class="tms-form-item"><label class="tms-form-label">并入课包 *</label>${renderCourtDropdownHtml('pkg_merge_source','选择课包',opts,'',true)}</div></div>`;
  const footer=`<button class="tms-btn tms-btn-default" onclick="closeModal()">取消</button><button class="tms-btn tms-btn-primary" id="packageMergeBtn" onclick="mergePackage()">确认合并</button>`;
  setCourtModalFrame('合并课包',body,footer,'modal-tight modal-merge-package');
}
async function mergePackage(){
  const masterPackageId=document.getElementById('pkg_merge_master')?.value||'';
  const sourcePackageId=document.getElementById('pkg_merge_source')?.value||'';
  if(!masterPackageId||!sourcePackageId){toast('请选择两个课包','warn');return;}
  if(masterPackageId===sourcePackageId){toast('请选择两个不同课包','warn');return;}
  const ok=await appConfirm('确认合并课包？并入课包会隐藏，历史购买记录和课包余额会显示为保留课包。',{title:'确认合并',confirmText:'确认合并'});
  if(!ok)return;
  const btn=document.getElementById('packageMergeBtn');if(btn){btn.disabled=true;btn.textContent='合并中…';}
  try{
    const res=await apiCall('POST','/packages/merge',{masterPackageId,sourcePackageId},120000);
    const sourceIndex=packages.findIndex(p=>p.id===res.sourcePackage?.id);
    if(sourceIndex>=0)packages[sourceIndex]=res.sourcePackage;
    (res.purchases||[]).forEach(row=>{const i=purchases.findIndex(p=>p.id===row.id);if(i>=0)purchases[i]=row;});
    (res.entitlements||[]).forEach(row=>{const i=entitlements.findIndex(e=>e.id===row.id);if(i>=0)entitlements[i]=row;});
    (res.schedules||[]).forEach(row=>{const i=schedules.findIndex(s=>s.id===row.id);if(i>=0)schedules[i]=row;});
    closeModal();
    renderPackages();
    if(currentPage==='purchases')renderPurchases();
    if(currentPage==='entitlements')renderEntitlements();
    toast('课包已合并','success');
  }catch(e){toast('合并失败：'+e.message,'error');if(btn){btn.disabled=false;btn.textContent='确认合并';}}
}
function purchaseAllowedCoachChecks(ids,cls='pur-allowed-coach-cb'){
  ids=parseArr(ids);
  return activeCoachNames().map(name=>`<label class="tms-checkbox-wrap"><input type="checkbox" value="${esc(name)}" class="tms-checkbox ${cls}" ${ids.includes(name)?'checked':''}><span>${esc(name)}</span></label>`).join('')||'<span style="color:var(--td);font-size:12px">暂无教练</span>';
}
function packageCoachChecks(ids){
  ids=parseArr(ids);
  return activeCoachNames().map(name=>`<label class="choice-tag"><input type="checkbox" value="${esc(name)}" class="pkg-coach-cb" ${ids.includes(name)?'checked':''}>${esc(name)}</label>`).join('')||'<span style="color:var(--td);font-size:12px">暂无教练</span>';
}
function packageCampusChecks(ids){
  ids=parseArr(ids);
  return campuses.map(c=>`<label class="choice-tag"><input type="checkbox" value="${c.code||c.id}" class="pkg-campus-cb" ${ids.includes(c.code||c.id)?'checked':''}>${esc(c.name)}</label>`).join('')||'<span style="color:var(--td);font-size:12px">暂无校区</span>';
}
function packageTimeScopeOptions(){
  return [{value:'all',label:'每天'},{value:'weekday',label:'工作日'},{value:'weekend',label:'周末'},{value:'custom',label:'自定义'}];
}
function packageDaysToScope(days){
  const key=parseArr(days).map(n=>parseInt(n)).filter(Boolean).sort((a,b)=>a-b).join(',');
  if(!key)return'all';
  if(key==='1,2,3,4,5')return'weekday';
  if(key==='6,7')return'weekend';
  return'custom';
}
function packageTimeScopeToDays(scope,fallback=[]){
  if(scope==='weekday')return[1,2,3,4,5];
  if(scope==='weekend')return[6,7];
  if(scope==='custom')return parseArr(fallback).map(n=>parseInt(n)).filter(Boolean);
  return[];
}
function packageTimeScopeLabel(days){
  const scope=packageDaysToScope(days);
  return scope==='weekday'?'工作日':scope==='weekend'?'周末':scope==='custom'?'自定义':'每天';
}
function packageTimeWindowText(w){
  const time=[w?.startTime,w?.endTime].filter(Boolean).join(' - ');
  return time?`${packageTimeScopeLabel(w.daysOfWeek)} ${time}`:'';
}
function packageDefaultTimeWindows(timeBand='全天'){
  if(timeBand==='黄金时段')return[
    {label:'黄金时段',startTime:'16:00',endTime:'22:00',daysOfWeek:[1,2,3,4,5]},
    {label:'黄金时段',startTime:'09:00',endTime:'22:00',daysOfWeek:[6,7]}
  ];
  if(timeBand==='非黄金时段')return[
    {label:'非黄金时段',startTime:'09:00',endTime:'16:00',daysOfWeek:[1,2,3,4,5]}
  ];
  return[{label:'全天',startTime:'09:00',endTime:'22:00',daysOfWeek:[]}];
}
function setPackageLessonShortcut(value){
  const input=document.getElementById('pkg_lessons');
  if(input)input.value=value;
  document.querySelectorAll('.package-lesson-chip').forEach(btn=>btn.classList.toggle('active',String(btn.dataset.lessons)===String(value)));
}
function syncPackageClassSize(){
  const type=document.getElementById('pkg_type')?.value||'私教课';
  const item=document.getElementById('pkg_classSizeItem');
  if(item)item.style.display=type==='私教课'?'':'none';
  if(type!=='私教课')setCourtDropdownValue('pkg_maxStudents','1','1v1');
}
function setPackageTimeWindow(scopeId,startId,endId,scope,start,end){
  setCourtDropdownValue(scopeId,scope,packageTimeScopeOptions().find(x=>x.value===scope)?.label||'每天');
  const startEl=document.getElementById(startId);if(startEl)startEl.value=start||'';
  const endEl=document.getElementById(endId);if(endEl)endEl.value=end||'';
}
function applyPackageTimeBandPreset(value){
  const rows=packageDefaultTimeWindows(value||document.getElementById('pkg_timeBand')?.value||'全天');
  setPackageTimeWindow('pkg_timeScope','pkg_timeStart','pkg_timeEnd',packageDaysToScope(rows[0]?.daysOfWeek),rows[0]?.startTime,rows[0]?.endTime);
  setPackageTimeWindow('pkg_timeScope2','pkg_timeStart2','pkg_timeEnd2',packageDaysToScope(rows[1]?.daysOfWeek),rows[1]?.startTime||'',rows[1]?.endTime||'');
}

function openPackageModal(id,presetProductId=''){
  editId=id;const p=id?packages.find(x=>x.id===id):null;
  const locked=!!(id&&packageHasPurchases(id));
  const timeWindows=parseArr(p?.dailyTimeWindows);
  const courseType=rv(p,'courseType')||PRODUCT_TYPES[0];
  const defaultWindows=packageDefaultTimeWindows(rv(p,'timeBand','全天'));
  const windowRow=timeWindows[0]||defaultWindows[0]||{};
  const secondWindow=timeWindows[1]||defaultWindows[1]||{};
  const courseTypeOptions=PRODUCT_TYPES.map(t=>({value:t,label:t}));
  const classSizeOptions=[{value:'1',label:'1v1'},{value:'2',label:'1v2'},{value:'3',label:'1v3'}];
  const ownerCoachOptions=[{value:'',label:'— 未分配 —'},...activeCoachNames().map(name=>({value:name,label:name}))];
  const timeBandOptions=[{value:'全天',label:'全天'},{value:'黄金时段',label:'黄金时段'},{value:'非黄金时段',label:'非黄金时段'}];
  const timeScopeOptions=packageTimeScopeOptions();
  const body=`
    <div class="tms-section-header" style="margin-top:0;">基础信息</div>
      ${locked?'<div class="inline-help">该课包已有购买记录，可修改展示信息和使用规则；价格、课时、人数、校区和可上课教练已锁定。</div>':''}
      <div class="tms-form-row">
        <div class="tms-form-item"><label class="tms-form-label">课程类型 *</label>${renderCourtDropdownHtml('pkg_type','课程类型',courseTypeOptions,courseType,true,'syncPackageClassSize')}</div>
        <div class="tms-form-item" id="pkg_classSizeItem"><label class="tms-form-label">上课人数</label>${renderCourtDropdownHtml('pkg_maxStudents','上课人数',classSizeOptions,String(rv(p,'maxStudents',1)),true)}</div>
        <div class="tms-form-item"><label class="tms-form-label">状态</label>${renderCourtDropdownHtml('pkg_status','状态',[{value:'active',label:'售卖中'},{value:'inactive',label:'已停售'}],rv(p,'status','active'),true)}</div>
      </div>
      <div class="tms-form-row">
        <div class="tms-form-item"><label class="tms-form-label">课时</label><input class="finput tms-form-control" id="pkg_lessons" type="number" value="${rv(p,'lessons',10)}"${locked?' readonly':''}><div class="package-lesson-shortcuts"><button type="button" class="package-lesson-chip" data-lessons="10" onclick="setPackageLessonShortcut(10)">10课时</button><button type="button" class="package-lesson-chip" data-lessons="20" onclick="setPackageLessonShortcut(20)">20课时</button><button type="button" class="package-lesson-chip" data-lessons="50" onclick="setPackageLessonShortcut(50)">50课时</button></div></div>
        <div class="tms-form-item"><label class="tms-form-label">价格</label><input class="finput tms-form-control" id="pkg_price" type="number" value="${rv(p,'price',0)}"${locked?' readonly':''}></div>
        <div class="tms-form-item"><label class="tms-form-label">有效天数</label><input class="finput tms-form-control" id="pkg_validDays" type="number" value="${rv(p,'validDays',30)}"></div>
      </div>
    <div class="tms-section-header">上课时间</div>
      <div class="inline-help">固定使用结束日优先；不填固定结束日时，按购买日起算有效天数。</div>
      <div class="tms-form-row">
        <div class="tms-form-item"><label class="tms-form-label">时段类型</label>${renderCourtDropdownHtml('pkg_timeBand','时段类型',timeBandOptions,rv(p,'timeBand','全天'),true,'applyPackageTimeBandPreset')}</div>
        <div class="tms-form-item full-width"><label class="tms-form-label">可用时段</label>
          <div class="inline-help">适用日期可选工作日或周末。</div>
          <div class="time-window-stack">
            <div class="time-window-row"><div>${renderCourtDropdownHtml('pkg_timeScope','适用日期',timeScopeOptions,packageDaysToScope(windowRow.daysOfWeek),true)}<span class="filter-hidden-date">工作日 周末</span></div><input class="finput tms-form-control" id="pkg_timeStart" type="time" value="${rv(windowRow,'startTime','09:00')}"><span class="range-dash">-</span><input class="finput tms-form-control" id="pkg_timeEnd" type="time" value="${rv(windowRow,'endTime','22:00')}"></div>
            <div class="time-window-row"><div>${renderCourtDropdownHtml('pkg_timeScope2','适用日期',timeScopeOptions,packageDaysToScope(secondWindow.daysOfWeek),true)}</div><input class="finput tms-form-control" id="pkg_timeStart2" type="time" value="${rv(secondWindow,'startTime','')}"><span class="range-dash">-</span><input class="finput tms-form-control" id="pkg_timeEnd2" type="time" value="${rv(secondWindow,'endTime','')}"></div>
          </div>
        </div>
      </div>
      <div class="tms-form-row">
        <div class="tms-form-item">
          <label class="tms-form-label">活动时间</label>
          <div class="range-pair">
            <button class="coach-date-btn" id="pkg_saleStartDate_btn" onclick="toggleGlobalDatePicker(event,'pkg_saleStartDate','pkg_saleStartDate_btn','活动开始')">${rv(p,'saleStartDate')||'活动开始'}</button>
            <span class="range-dash">-</span>
            <button class="coach-date-btn" id="pkg_saleEndDate_btn" onclick="toggleGlobalDatePicker(event,'pkg_saleEndDate','pkg_saleEndDate_btn','活动结束')">${rv(p,'saleEndDate')||'活动结束'}</button>
          </div>
          <input class="filter-hidden-date" id="pkg_saleStartDate" type="date" value="${rv(p,'saleStartDate')}" onchange="syncDateButton('pkg_saleStartDate','pkg_saleStartDate_btn','活动开始')">
          <input class="filter-hidden-date" id="pkg_saleEndDate" type="date" value="${rv(p,'saleEndDate')}" onchange="syncDateButton('pkg_saleEndDate','pkg_saleEndDate_btn','活动结束')">
        </div>
        <div class="tms-form-item">
          <label class="tms-form-label">可用时间</label>
          <div class="range-pair">
            <button class="coach-date-btn" id="pkg_usageStartDate_btn" onclick="toggleGlobalDatePicker(event,'pkg_usageStartDate','pkg_usageStartDate_btn','使用开始')">${rv(p,'usageStartDate')||'使用开始'}</button>
            <span class="range-dash">-</span>
            <button class="coach-date-btn" id="pkg_usageEndDate_btn" onclick="toggleGlobalDatePicker(event,'pkg_usageEndDate','pkg_usageEndDate_btn','使用结束')">${rv(p,'usageEndDate')||'使用结束'}</button>
          </div>
          <input class="filter-hidden-date" id="pkg_usageStartDate" type="date" value="${rv(p,'usageStartDate')}" onchange="syncDateButton('pkg_usageStartDate','pkg_usageStartDate_btn','使用开始')">
          <input class="filter-hidden-date" id="pkg_usageEndDate" type="date" value="${rv(p,'usageEndDate')}" onchange="syncDateButton('pkg_usageEndDate','pkg_usageEndDate_btn','使用结束')">
        </div>
      </div>
    <div class="tms-section-header">教练和场地</div>
      <div class="tms-form-row"><div class="tms-form-item"><label class="tms-form-label">归属教练</label>${renderCourtDropdownHtml('pkg_ownerCoach','归属教练',ownerCoachOptions,rv(p,'ownerCoach')||'',true)}</div><div class="tms-form-item"><label class="tms-form-label">备注</label><input class="finput tms-form-control" id="pkg_notes_inline" value="${esc(rv(p,'notes'))}" placeholder="可选"></div></div>
      <div class="tms-form-row"><div class="tms-form-item full-width"><label class="tms-form-label">可上课教练</label><div class="choice-grid"${locked?' style="pointer-events:none;opacity:0.7"':''}>${packageCoachChecks(rv(p,'coachNames',[]))}</div></div></div>
      <div class="tms-form-row"><div class="tms-form-item full-width"><label class="tms-form-label">可用校区</label><div class="choice-grid"${locked?' style="pointer-events:none;opacity:0.7"':''}>${packageCampusChecks(rv(p,'campusIds',[]))}</div></div></div>
    <input type="hidden" id="pkg_name" value="${esc(rv(p,'name'))}">
    <textarea class="filter-hidden-date" id="pkg_notes" style="display:none">${esc(rv(p,'notes'))}</textarea>
    <input type="hidden" id="pkg_timeScopeCustomDays" value="${esc(JSON.stringify(parseArr(windowRow.daysOfWeek)))}">
    <input type="hidden" id="pkg_timeScopeCustomDays2" value="${esc(JSON.stringify(parseArr(secondWindow.daysOfWeek)))}">
    `;
  const footer=`<button class="tms-btn tms-btn-default" onclick="closeModal()">取消</button>${id?`<button class="tms-btn tms-btn-danger" onclick="confirmDel('${p.id}','${esc(p.name)}','package')">删除</button>`:''}<button class="tms-btn tms-btn-primary btn-save" onclick="savePackage()">保存</button>`;
  setCourtModalFrame(id?'编辑课包':'创建课包',body,footer,'modal-wide modal-package-edit');
  syncPackageClassSize();
  setPackageLessonShortcut(rv(p,'lessons',10));
}
async function savePackage(){
  const courseType=document.getElementById('pkg_type').value.trim();
  const name=packageDisplayTitle({courseType,maxStudents:parseInt(document.getElementById('pkg_maxStudents').value)||1,lessons:parseInt(document.getElementById('pkg_lessons').value)||0,timeBand:document.getElementById('pkg_timeBand').value.trim()||'全天'});
  const ownerCoach=document.getElementById('pkg_ownerCoach')?.value||'';
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
  if(!courseType){toast('请选择课程类型','warn');return;}
  const coachNames=[...document.querySelectorAll('.pkg-coach-cb:checked')].map(cb=>cb.value);
  const campusIds=[...document.querySelectorAll('.pkg-campus-cb:checked')].map(cb=>cb.value);
  const btn=document.querySelector('.btn-save');btn.disabled=true;btn.textContent='保存中…';
  document.getElementById('pkg_notes').value=document.getElementById('pkg_notes_inline').value.trim();
  const timeBand=document.getElementById('pkg_timeBand').value.trim()||'全天';
  const dailyTimeWindows=[{label:timeBand,startTime:timeStart,endTime:timeEnd,daysOfWeek:packageTimeScopeToDays(document.getElementById('pkg_timeScope')?.value,parseArr(document.getElementById('pkg_timeScopeCustomDays')?.value))}];
  if(timeStart2&&timeEnd2)dailyTimeWindows.push({label:timeBand,startTime:timeStart2,endTime:timeEnd2,daysOfWeek:packageTimeScopeToDays(document.getElementById('pkg_timeScope2')?.value,parseArr(document.getElementById('pkg_timeScopeCustomDays2')?.value))});
  const data={name,productId:'',productName:'',courseType,ownerCoach,price:parseFloat(document.getElementById('pkg_price').value)||0,lessons:parseInt(document.getElementById('pkg_lessons').value)||0,validDays:parseInt(document.getElementById('pkg_validDays').value)||0,saleStartDate,saleEndDate,usageStartDate,usageEndDate,timeBand,dailyTimeWindows,coachNames,coachIds:coachNames,campusIds,maxStudents:parseInt(document.getElementById('pkg_maxStudents').value)||1,status:document.getElementById('pkg_status').value,notes:document.getElementById('pkg_notes').value.trim()};
  try{if(editId){const r=await apiCall('PUT','/packages/'+editId,data);const i=packages.findIndex(x=>x.id===editId);packages[i]=r;}else{const r=await apiCall('POST','/packages',data);packages.unshift(r);}closeModal();toast(editId?'课包修改成功 ✓':'课包创建成功 ✓','success');renderPackages();renderProducts();}catch(e){toast('保存失败：'+e.message,'error');btn.disabled=false;btn.textContent='保存';}
}
