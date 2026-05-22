function syncPackageFilterOptions(){
  const typeValue=document.getElementById('pkgTypeFilter')?.value||'';
  const statusValue=document.getElementById('pkgStatusFilter')?.value||'';
  const timeBandValue=document.getElementById('pkgTimeBandFilter')?.value||'';
  const typeOptions=[{value:'',label:'全部',emptyDisplay:'类型'},...PRODUCT_TYPES.map(t=>({value:t,label:t}))];
  const statusOptions=[{value:'',label:'全部',emptyDisplay:'状态'},{value:'active',label:'售卖中'},{value:'inactive',label:'已停售'}];
  const timeBandOptions=[{value:'',label:'全部',emptyDisplay:'时段'},{value:'全天',label:'全天'},{value:'黄金时段',label:'黄金'},{value:'非黄金时段',label:'非黄金'}];
  const wrapMap=[
    ['pkgTypeFilterHost','pkgTypeFilter','类型',typeOptions,typeValue],
    ['pkgStatusFilterHost','pkgStatusFilter','状态',statusOptions,statusValue],
    ['pkgTimeBandFilterHost','pkgTimeBandFilter','时段',timeBandOptions,timeBandValue]
  ];
  wrapMap.forEach(([hostId,id,label,options,value])=>{
    const host=document.getElementById(hostId);
    if(host)host.innerHTML=renderCourtDropdownHtml(id,label,options,value,false,'renderPackages');
  });
}
function packageDisplayTitle(p){
  const lessons=parseInt(p.lessons||p.packageLessons||p.totalLessons)||0;
  return [packageCoreClassLabel(p),lessons?`${lessons}课时`:'',packageTimeBandShortLabel(p.timeBand||p.packageTimeBand||'全天')].filter(Boolean).join(' · ')||p.name||'课包';
}
function packageListStatusValue(p){
  const status=String(p.status||'active');
  if(status==='inactive'||status==='已停售'||status==='history')return'inactive';
  if(status==='merged')return'merged';
  return'active';
}
function packageListTitle(p){
  return packageCoreClassLabel(p)||p.name||'课包';
}
function packageListSubtitle(p){
  const lessons=parseInt(p.lessons||p.packageLessons||p.totalLessons)||0;
  return [packageAudienceLabelFromText([p.audience,p.type,p.productName,p.name,p.packageName,p.notes]),lessons?`${lessons}课时`:'' ].filter(Boolean).join(' · ');
}
function packageCreatedDate(p){
  return String(p.createdAt||'').slice(0,10)||'-';
}
function packageStatusBadge(p){
  const status=packageListStatusValue(p);
  return status==='inactive'||status==='merged'
    ?'<span class="package-status-badge is-off">已停售</span>'
    :'<span class="package-status-badge is-on">售卖中</span>';
}
function packageRuleIcon(kind){
  if(kind==='campus')return'<svg class="package-rule-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M20 10c0 6-8 12-8 12S4 16 4 10a8 8 0 1 1 16 0Z"/><circle cx="12" cy="10" r="3"/></svg>';
  if(kind==='time')return'<svg class="package-rule-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><circle cx="12" cy="12" r="9"/><path d="M12 7v5l3 2"/></svg>';
  return'<svg class="package-rule-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2"/><circle cx="12" cy="7" r="4"/></svg>';
}
function packageCoachSummary(p){
  const coaches=parseArr(p.coachNames||p.coachIds).filter(Boolean);
  if(p.ownerCoach&&coaches.length>1)return `归属：${p.ownerCoach}（+${coaches.length-1}）`;
  if(p.ownerCoach)return `归属：${p.ownerCoach}`;
  if(coaches.length)return `${coaches.length} 位可用`;
  return '未分配';
}
function packageCoachDetail(p){
  const coaches=parseArr(p.coachNames||p.coachIds).filter(Boolean);
  return [p.ownerCoach?`归属：${p.ownerCoach}`:'',coaches.length?`可用：${coaches.join('、')}`:''].filter(Boolean).join('\n')||'未分配';
}
function packageCampusSummaryText(ids){
  const names=parseArr(ids).map(id=>cn(id)).filter(Boolean);
  if(!names.length)return'不限校区';
  return names.length===1?names[0]:`${names[0]} 等 ${names.length} 个校区`;
}
function packageCampusTitle(ids){
  return parseArr(ids).map(id=>cn(id)).filter(Boolean).join('、')||'不限校区';
}
function renderPackages(){
  syncPackageFilterOptions();
  const q=(document.getElementById('pkgSearch')?.value||'').toLowerCase();
  const tf=document.getElementById('pkgTypeFilter')?.value||'';
  const sf=document.getElementById('pkgStatusFilter')?.value||'';
  const bf=document.getElementById('pkgTimeBandFilter')?.value||'';
  const list=packages.filter(p=>{
    const courseType=normalizeCourseType(p.courseType);
    const campusIds=parseArr(p.campusIds);
    const statusValue=packageListStatusValue(p);
    if(statusValue==='merged')return false;
    if(!searchHit(q,p.name,packageDisplayTitle(p),courseType,p.price,p.lessons,p.timeBand,p.notes,p.productName,p.ownerCoach))return false;
    if(tf&&courseType!==tf)return false;
    if(sf&&statusValue!==sf)return false;
    if(bf&&String(p.timeBand||'全天')!==bf)return false;
    if(campus&&campus!=='all'&&campusIds.length&&!campusIds.includes(campus))return false;
    return true;
  }).sort((a,b)=>String(b.createdAt||'').localeCompare(String(a.createdAt||'')));
  const host=document.getElementById('packageGrid');
  host.innerHTML=list.length?list.map(p=>{
    const courseType=normalizeCourseType(p.courseType);
    const windows=parseArr(p.dailyTimeWindows).map(packageTimeWindowText).filter(Boolean).join('、');
    const timeWindow=[packageTimeBandShortLabel(p.timeBand||'全天'),windows].filter(Boolean).join(' · ');
    const campusTitle=packageCampusTitle(p.campusIds);
    const timeTitle=windows||packageTimeBandShortLabel(p.timeBand||'全天');
    const coachTitle=packageCoachDetail(p);
    const title=packageListTitle(p);
    const subtitle=packageListSubtitle(p);
    return `<div class="package-card-shell"><div class="showcase-card-body package-sales-card-body"><div class="showcase-card-header package-sales-header"><div class="showcase-card-title-group"><div class="showcase-card-title package-sales-title">${esc(title)}</div>${subtitle?`<div class="showcase-card-meta package-sales-subtitle">${esc(subtitle)}</div>`:''}</div>${packageStatusBadge(p)}</div><div class="package-sales-core"><div class="package-sales-price">¥${fmt(p.price)}</div><div class="package-sales-rules"><div class="package-rule-line"><span>${esc(packageCampusSummaryText(p.campusIds))}</span>${packageRuleIcon('campus')}<div class="package-rule-tooltip">${esc(campusTitle)}</div></div><div class="package-rule-line"><span>${esc(packageTimeBandShortLabel(p.timeBand||'全天'))}</span>${packageRuleIcon('time')}<div class="package-rule-tooltip">${esc(timeTitle)}</div></div><div class="package-rule-line"><span>${esc(packageCoachSummary(p))}</span>${packageRuleIcon('coach')}<div class="package-rule-tooltip">${esc(coachTitle)}</div></div></div></div></div><div class="showcase-card-footer package-sales-footer"><div class="package-card-meta">${esc(packageCreatedDate(p))} 创建<span></span><button class="package-order-link" type="button" onclick="focusPurchaseByPackage('${p.id}')">${packagePurchaseCount(p.id)} 笔订单<span class="package-order-chevron">›</span></button></div><div class="showcase-card-actions"><button class="showcase-action-btn" onclick="openPackageModal('${p.id}')">编辑</button><button class="showcase-action-btn is-danger package-off-btn" onclick="deactivatePackage('${p.id}')">下架</button></div></div></div>`;
  }).join(''):`<div class="course-package-showcase-empty"><div style="font-size:18px;font-weight:800;color:var(--cream-pale)">暂无售卖课包</div><div style="margin-top:8px;font-size:13px;line-height:1.7">点击创建即可直接配置课程类型、归属教练和可上课教练。</div><button class="tms-btn tms-btn-primary" onclick="openPackageModal(null)">创建课包</button></div>`;
}
function packagePurchaseCount(packageId){
  const pkg=packages.find(x=>x.id===packageId)||{};
  const names=new Set([
    pkg.id,
    pkg.originalPackageId,
    pkg.name,
    pkg.originalPackageName,
    pkg.productId,
    pkg.productName,
    packageDisplayTitle(pkg),
    standardPackageLabel(pkg,false)
  ].filter(Boolean).map(String));
  const purchaseIdsByEntitlement=new Set(entitlements.filter(e=>String(e.packageId||'')===String(packageId)).map(e=>String(e.purchaseId||'')).filter(Boolean));
  return purchases.filter(p=>isMeaningfulPurchaseRecord(p)&&(
    String(p.packageId||'')===String(packageId)||
    String(p.originalPackageId||'')===String(packageId)||
    purchaseIdsByEntitlement.has(String(p.id||''))||
    names.has(String(p.packageId||''))||
    names.has(String(p.originalPackageId||''))||
    names.has(String(p.packageName||''))||
    names.has(String(p.originalPackageName||''))||
    names.has(String(p.productId||''))||
    names.has(String(p.productName||''))
  )).length;
}
function packageOpts(sel){
  return '<option value="">— 选择售卖课包 —</option>'+packages.filter(p=>p.status!=='inactive').map(p=>`<option value="${p.id}"${sel===p.id?' selected':''}>${esc(standardPackageLabel(p,false)||p.name)}${p.status==='inactive'?' · 已停售':''}</option>`).join('');
}
function purchasePackageOpts(sel){
  return '<option value="">— 选择售卖课包 —</option>'+packages.filter(p=>p.status!=='inactive'||p.id===sel).map(p=>`<option value="${p.id}"${sel===p.id?' selected':''}>${esc(standardPackageLabel(p,false)||p.name)}${p.status==='inactive'?' · 已停售':''}</option>`).join('');
}
function packageMergeOpts(sel){
  return [{value:'',label:'— 选择课包 —'},...packages.filter(p=>p.status!=='merged').map(p=>({value:p.id,label:standardPackageLabel(p,true)||p.name}))];
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
async function deactivatePackage(id){
  const p=packages.find(x=>x.id===id);
  if(!p)return;
  if(String(p.status||'active')==='inactive'){toast('该课包已停售','warn');return;}
  const ok=await appConfirm('确认下架该课包？下架后不再用于新购买，历史订单和课包余额保留。',{title:'确认下架',confirmText:'确认下架',danger:true});
  if(!ok)return;
  try{
    const data={...p,status:'inactive'};
    const r=await apiCall('PUT','/packages/'+id,data);
    const i=packages.findIndex(x=>x.id===id);
    if(i>=0)packages[i]=r;
    renderPackages();
    toast('课包已下架','success');
  }catch(e){toast('下架失败：'+e.message,'error');}
}
function purchaseAllowedCoachChecks(ids,cls='pur-allowed-coach-cb'){
  ids=parseArr(ids);
  return activeCoachNames().map(name=>`<label class="tms-checkbox-wrap"><input type="checkbox" value="${esc(name)}" class="tms-checkbox ${cls}" ${ids.includes(name)?'checked':''}><span>${esc(name)}</span></label>`).join('')||'<span style="color:var(--td);font-size:12px">暂无教练</span>';
}
function packageCoachChecks(ids){
  ids=parseArr(ids);
  return activeCoachNames().map(name=>`<label class="tms-checkbox-wrap"><input type="checkbox" value="${esc(name)}" class="tms-checkbox pkg-coach-cb" ${ids.includes(name)?'checked':''}><span>${esc(name)}</span></label>`).join('')||'<span style="color:var(--td);font-size:12px">暂无教练</span>';
}
function packageCampusChecks(ids){
  ids=parseArr(ids);
  return campuses.map(c=>`<label class="choice-tag"><input type="checkbox" value="${c.code||c.id}" class="pkg-campus-cb" ${ids.includes(c.code||c.id)?'checked':''}>${esc(c.name)}</label>`).join('')||'<span style="color:var(--td);font-size:12px">暂无校区</span>';
}
function packageTimeScopeOptions(){
  return [{value:'weekday',label:'工作日'},{value:'weekend',label:'周末'}];
}
function packageTimeBandPresetWindows(timeBand='全天'){
  if(timeBand==='黄金时段')return[
    {label:'工作日',startTime:'16:00',endTime:'22:00',daysOfWeek:[1,2,3,4,5]},
    {label:'周六日',startTime:'09:00',endTime:'22:00',daysOfWeek:[6,7]}
  ];
  if(timeBand==='非黄金时段')return[
    {label:'工作日',startTime:'09:00',endTime:'16:00',daysOfWeek:[1,2,3,4,5]}
  ];
  return[
    {label:'工作日',startTime:'09:00',endTime:'22:00',daysOfWeek:[1,2,3,4,5]},
    {label:'周六日',startTime:'09:00',endTime:'22:00',daysOfWeek:[6,7]}
  ];
}
function packageTimeWindowText(w){
  const time=[w?.startTime,w?.endTime].filter(Boolean).join(' - ');
  const days=parseArr(w?.daysOfWeek).map(n=>parseInt(n)).filter(Boolean).sort((a,b)=>a-b).join(',');
  const scope=days==='6,7'?'周六日':'工作日';
  return time?`${scope} ${time}`:'';
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
function applyPackageTimeBandPreset(value){
  const rows=packageTimeBandPresetWindows(value||document.getElementById('pkg_timeBand')?.value||'全天');
  const host=document.getElementById('pkg_timeWindowsWrap');
  if(!host)return;
  host.innerHTML=rows.map((row,idx)=>{
    const suffix=idx===0?'':'2';
    return `<div class="package-time-window-row"><div class="package-time-window-label">${esc(row.label)}</div><div class="package-time-window-fields">${renderCourtDropdownHtml(`pkg_timeStart${suffix}`,'开始时间',getScheduleTimeOptions(row.startTime||'09:00'),row.startTime||'09:00',true)}<span class="range-dash">-</span>${renderCourtDropdownHtml(`pkg_timeEnd${suffix}`,'结束时间',getScheduleTimeOptions(row.endTime||'22:00'),row.endTime||'22:00',true)}</div></div>`;
  }).join('');
}

function openPackageModal(id,presetProductId=''){
  editId=id;const p=id?packages.find(x=>x.id===id):null;
  const locked=!!(id&&packageHasPurchases(id));
  const timeWindows=parseArr(p?.dailyTimeWindows);
  const courseType=rv(p,'courseType')||PRODUCT_TYPES[0];
  const defaultWindows=packageTimeBandPresetWindows(rv(p,'timeBand','全天'));
  const windowRow=timeWindows[0]||defaultWindows[0]||{};
  const secondWindow=timeWindows[1]||defaultWindows[1]||{};
  const courseTypeOptions=PRODUCT_TYPES.map(t=>({value:t,label:t}));
  const classSizeOptions=[{value:'1',label:'1v1'},{value:'2',label:'1v2'},{value:'3',label:'1v3'}];
  const ownerCoachOptions=[{value:'',label:'— 未分配 —'},...activeCoachNames().map(name=>({value:name,label:name}))];
  const timeBandOptions=[{value:'全天',label:'全天'},{value:'黄金时段',label:'黄金时段'},{value:'非黄金时段',label:'非黄金时段'}];
  const timeScopeOptions=packageTimeScopeOptions();
  const body=`
    <div class="tms-section-header" style="margin-top:0;">基础信息</div>
      ${locked?'<div class="inline-help">该课包已有购买记录，价格、课时、人数、校区和可上课教练已锁定。</div>':''}
      <div class="tms-form-row package-basic-row">
        <div class="tms-form-item"><label class="tms-form-label">课程类型 *</label>${renderCourtDropdownHtml('pkg_type','课程类型',courseTypeOptions,courseType,true,'syncPackageClassSize')}</div>
        <div class="tms-form-item" id="pkg_classSizeItem"><label class="tms-form-label">上课人数</label>${renderCourtDropdownHtml('pkg_maxStudents','上课人数',classSizeOptions,String(rv(p,'maxStudents',1)),true)}</div>
        <div class="tms-form-item"><label class="tms-form-label">课时</label><input class="finput tms-form-control" id="pkg_lessons" type="number" value="${rv(p,'lessons',10)}"><div class="package-lesson-shortcuts"><button type="button" class="package-lesson-chip" data-lessons="10" onclick="setPackageLessonShortcut(10)">10课时</button><button type="button" class="package-lesson-chip" data-lessons="20" onclick="setPackageLessonShortcut(20)">20课时</button><button type="button" class="package-lesson-chip" data-lessons="50" onclick="setPackageLessonShortcut(50)">50课时</button></div></div>
        <div class="tms-form-item"><label class="tms-form-label">价格</label><input class="finput tms-form-control" id="pkg_price" type="number" value="${rv(p,'price',0)}"></div>
        <div class="tms-form-item"><label class="tms-form-label">状态</label>${renderCourtDropdownHtml('pkg_status','状态',[{value:'active',label:'售卖中'},{value:'inactive',label:'已停售'}],rv(p,'status','active'),true)}</div>
      </div>
    <div class="tms-section-header">上课时间</div>
      <div class="package-time-section">
        <div class="tms-form-item package-time-band-item"><label class="tms-form-label">时段类型</label>${renderCourtDropdownHtml('pkg_timeBand','时段类型',timeBandOptions,rv(p,'timeBand','全天'),true,'applyPackageTimeBandPreset')}</div>
        <div class="tms-form-item package-time-windows-item"><label class="tms-form-label">可用时段</label>
          <div class="time-window-stack" id="pkg_timeWindowsWrap"></div>
        </div>
      </div>
      <div class="tms-form-row package-date-section">
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
      <div class="tms-form-row"><div class="tms-form-item"><label class="tms-form-label">归属教练</label>${renderCourtDropdownHtml('pkg_ownerCoach','归属教练',ownerCoachOptions,rv(p,'ownerCoach')||'',true)}</div><div class="tms-form-item"><label class="tms-form-label">可用校区</label><div class="choice-grid package-campus-grid">${packageCampusChecks(rv(p,'campusIds',[]))}</div></div></div>
      <div class="tms-form-row"><div class="tms-form-item full-width"><label class="tms-form-label">可上课教练</label><div class="tms-checkbox-matrix purchase-coach-picker package-coach-picker">${packageCoachChecks(rv(p,'coachNames',[]))}</div></div></div>
      <div class="tms-form-row purchase-notes-row" style="margin-bottom:0"><div class="tms-form-item full-width"><label class="tms-form-label">备注</label><textarea class="finput tms-form-control" id="pkg_notes_inline" placeholder="可选">${esc(rv(p,'notes'))}</textarea></div></div>
    <input type="hidden" id="pkg_name" value="${esc(rv(p,'name'))}">
    <textarea class="filter-hidden-date" id="pkg_notes" style="display:none">${esc(rv(p,'notes'))}</textarea>
    `;
  const footer=`<button class="tms-btn tms-btn-default" onclick="closeModal()">取消</button>${id&&String(p.status||'active')!=='inactive'?`<button class="tms-btn tms-btn-danger" onclick="deactivatePackage('${p.id}')">下架</button>`:''}<button class="tms-btn tms-btn-primary btn-save" onclick="savePackage()">保存</button>`;
  setCourtModalFrame(id?'编辑课包':'创建课包',body,footer,'modal-wide modal-package-edit');
  syncPackageClassSize();
  setPackageLessonShortcut(rv(p,'lessons',10));
  applyPackageTimeBandPreset(rv(p,'timeBand','全天'));
}
async function savePackage(){
  const courseType=document.getElementById('pkg_type').value.trim();
  const name=standardPackageLabel({courseType,maxStudents:parseInt(document.getElementById('pkg_maxStudents').value)||1,lessons:parseInt(document.getElementById('pkg_lessons').value)||0,timeBand:document.getElementById('pkg_timeBand').value.trim()||'全天'},document.getElementById('pkg_status').value==='inactive');
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
  if((parseInt(document.getElementById('pkg_maxStudents').value)||0)<=0){toast('人数限制必须大于 0','warn');return;}
  if(!courseType){toast('请选择课程类型','warn');return;}
  const coachNames=[...document.querySelectorAll('.pkg-coach-cb:checked')].map(cb=>cb.value);
  const campusIds=[...document.querySelectorAll('.pkg-campus-cb:checked')].map(cb=>cb.value);
  const btn=document.querySelector('.btn-save');btn.disabled=true;btn.textContent='保存中…';
  document.getElementById('pkg_notes').value=document.getElementById('pkg_notes_inline').value.trim();
  const timeBand=document.getElementById('pkg_timeBand').value.trim()||'全天';
  const packagePersistedValidDays=parseInt(rv(packages.find(x=>x.id===editId),'validDays',30))||30;
  const presetWindows=packageTimeBandPresetWindows(timeBand);
  const dailyTimeWindows=presetWindows.map((preset,idx)=>({
    label:preset.label,
    startTime:idx===0?timeStart:timeStart2,
    endTime:idx===0?timeEnd:timeEnd2,
    daysOfWeek:preset.daysOfWeek
  })).filter(row=>row.startTime&&row.endTime);
  const data={name,productId:'',productName:'',courseType,ownerCoach,price:parseFloat(document.getElementById('pkg_price').value)||0,lessons:parseInt(document.getElementById('pkg_lessons').value)||0,validDays:packagePersistedValidDays,saleStartDate,saleEndDate,usageStartDate,usageEndDate,timeBand,dailyTimeWindows,coachNames,coachIds:coachNames,campusIds,maxStudents:parseInt(document.getElementById('pkg_maxStudents').value)||1,status:document.getElementById('pkg_status').value,notes:document.getElementById('pkg_notes').value.trim()};
  try{if(editId){const r=await apiCall('PUT','/packages/'+editId,data);const i=packages.findIndex(x=>x.id===editId);packages[i]=r;}else{const r=await apiCall('POST','/packages',data);packages.unshift(r);}closeModal();toast(editId?'课包修改成功 ✓':'课包创建成功 ✓','success');renderPackages();renderProducts();}catch(e){toast('保存失败：'+e.message,'error');btn.disabled=false;btn.textContent='保存';}
}
