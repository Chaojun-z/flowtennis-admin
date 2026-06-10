function purchaseSelectedPackageFilter(){
  return purPackageFilterValue||document.getElementById('purPackageFilter')?.value||'';
}
function onPurchaseFilterChange(){
  purPackageFilterValue=document.getElementById('purPackageFilter')?.value||'';
  purPage=1;
  renderPurchases();
}
function purchaseTopCampusOptions(){
  const campusSource=typeof accessibleCampusRows==='function'?accessibleCampusRows():(Array.isArray(campuses)?campuses:[]);
  return [{value:'all',label:'全部校区'}].concat(campusSource.map(row=>({
    value:String(row?.code||row?.id||'').trim(),
    label:String(row?.name||row?.code||row?.id||'').trim()
  })).filter(opt=>opt.value&&opt.label));
}
function purchaseDateFilterQuickOptions(){
  return ['全部','今日','本周','本月'];
}
function currentPurchaseDateRangeLabel(){
  if(purDateRangeFilterValue==='全部')return '全部时间';
  const range=activePurchaseDateRange();
  return formatCourtDateRangeValue(range.startDate,range.endDate);
}
function activePurchaseDateRange(){
  if(purDateRangeFilterValue&&purDateRangeFilterValue!=='全部'){
    return typeof resolveCourtDatePresetRange==='function'
      ? resolveCourtDatePresetRange(purDateRangeFilterValue)
      : {startDate:purDateRangeStart,endDate:purDateRangeEnd};
  }
  return {startDate:'',endDate:''};
}
function renderPurchaseTopFilters(){
  if(typeof renderCourtTopDropdown!=='function'||typeof courtTopLocationIcon!=='function'||typeof courtTopTimeIcon!=='function')return '';
  const campusOpts=purchaseTopCampusOptions();
  const campusMenu=campusOpts.map(opt=>`<div class="tms-dropdown-item ${campus===opt.value?'active':''}" data-value="${esc(opt.value)}" onclick="selectPurchaseTopCampus(${jsArg(opt.value)},event)">${esc(opt.label)}</div>`).join('');
  const timeMenu=purchaseDateFilterQuickOptions().map(label=>`<div class="tms-dropdown-item ${label===purDateRangeFilterValue?'active':''}" data-value="${esc(label)}" onclick="onPurchaseDateRangeFilterChange(${jsArg(label)},event)">${esc(label)}</div>`).join('');
  return `<div class="court-top-filterbar"><div class="court-top-filter-item">${renderCourtTopDropdown('purchaseTopCampus',campusOpts.find(opt=>opt.value===campus)?.label||'全部校区',courtTopLocationIcon(),campusMenu,'court-top-campus-menu')}</div><div class="court-top-filter-item">${renderCourtTopDropdown('purchaseTopDate',currentPurchaseDateRangeLabel(),courtTopTimeIcon(),timeMenu,'court-top-date-menu is-quick')}</div></div>`;
}
function refreshPurchaseTopFilters(){
  const host=document.getElementById('campusTabs');
  if(host&&currentPage==='purchases')host.innerHTML=renderPurchaseTopFilters();
}
function selectPurchaseTopCampus(value,event){
  if(event)event.stopPropagation();
  campus=value||'all';
  localStorage.setItem(CAMPUS_KEY,campus);
  purPage=1;
  refreshPurchaseTopFilters();
  renderPurchases();
  closeCourtTopDropdowns();
}
function onPurchaseDateRangeFilterChange(value,event){
  if(event)event.stopPropagation();
  purDateRangeFilterValue=value||'全部';
  const range=activePurchaseDateRange();
  purDateRangeStart=range.startDate;
  purDateRangeEnd=range.endDate;
  purPage=1;
  refreshPurchaseTopFilters();
  renderPurchases();
  closeCourtTopDropdowns();
}
function refreshPurchaseFilters(){
  const packageValue=purchaseSelectedPackageFilter();
  const purchaseRows=purchases.filter(isMeaningfulPurchaseRecord);
  const packageOptions=withStandardFilterCounts([{value:'',label:'全部课包'},...packages.map(p=>({value:p.id,label:purchasePackagePickerLabel(p)}))],purchaseRows,(p,value)=>purchaseMatchesPackage(p,value));
  [['purPackageFilterHost','purPackageFilter','全部课包',packageOptions,packageValue]].forEach(([hostId,id,label,options,value])=>{
    const host=document.getElementById(hostId);
    if(host)host.innerHTML=renderStandardDropdownHtml(id,label,options,value,false,'onPurchaseFilterChange');
  });
}
function purchaseDateWithinRange(value,range={}){
  const start=String(range.startDate||'').trim();
  const end=String(range.endDate||'').trim();
  if(!start&&!end)return true;
  const raw=typeof courtDateKeyForFilter==='function'?courtDateKeyForFilter(value):String(value||'').slice(0,10);
  if(!raw)return false;
  if(start&&raw<start)return false;
  if(end&&raw>end)return false;
  return true;
}
function purchaseCampusValues(p={}){
  const ent=entitlements.find(e=>e.purchaseId===p.id)||{};
  const pkg=packages.find(row=>String(row.id||'')===String(p.packageId||p.originalPackageId||''))||{};
  const stu=students.find(s=>String(s.id||'')===String(p.studentId||''))||{};
  return [
    ...parseArr(p.campusIds),
    ...parseArr(ent.campusIds),
    ...parseArr(pkg.campusIds),
    p.campusId,p.campus,p.campusName,ent.campus,ent.campusId,pkg.campus,pkg.campusId,stu.campus
  ].map(v=>String(v||'').trim()).filter(Boolean);
}
function purchaseCampusValueMatches(value,target){
  const raw=String(value||'').trim();
  const expected=String(target||'').trim();
  return raw===expected||cn(raw)===cn(expected)||raw===cn(expected);
}
function purchaseMatchesCampus(p,targetCampus){
  if(!targetCampus||targetCampus==='all')return true;
  return purchaseCampusValues(p).some(value=>purchaseCampusValueMatches(value,targetCampus));
}
function isMeaningfulPurchaseRecord(p){
  if(!p)return false;
  const hasMainText=String(p.purchaseDate||p.studentName||p.packageName||p.payMethod||p.ownerCoach||'').trim();
  const hasBusinessValue=(Number(p.amountPaid)||0)>0||(Number(p.packageLessons)||0)>0;
  return !!(hasMainText||hasBusinessValue);
}
function getFilteredPurchases(){
  const q=(document.getElementById('purSearch')?.value||'').toLowerCase();
  const packageId=purchaseSelectedPackageFilter();
  const dateRange=activePurchaseDateRange();
  return purchases.filter(p=>{
    if(!isMeaningfulPurchaseRecord(p))return false;
    if(!searchHit(q,p.studentName,purchasePackageListLabel(p),p.amountPaid,p.payMethod,p.purchaseDate,p.productName,p.courseType,p.packageTimeBand,p.ownerCoach))return false;
    if(packageId&&!purchaseMatchesPackage(p,packageId))return false;
    if(!purchaseMatchesCampus(p,campus))return false;
    if(!purchaseDateWithinRange(p.purchaseDate||p.createdAt,dateRange))return false;
    return true;
  }).sort((a,b)=>String(b.purchaseDate||b.createdAt||'').localeCompare(String(a.purchaseDate||a.createdAt||'')));
}
function purchasePageNumbers(page,pages){
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
function renderPurchasePagerControls(total,pages){
  const pageSizeHost=document.getElementById('purPageSize');
  if(pageSizeHost)pageSizeHost.innerHTML=renderPageSizeSelectorHtml('purPageSizeValue',purPageSize,'setPurchasePageSize');
  const btns=document.getElementById('purPagerBtns');
  if(!btns)return;
  btns.innerHTML=(!total||pages<=1)?'':renderStandardPaginationButtonsHtml(purPage,pages,'setPurchasePage');
}
function setPurchasePage(value){
  const total=getFilteredPurchases().length;
  const pages=Math.max(1,Math.ceil(total/purPageSize));
  purPage=Math.min(pages,Math.max(1,parseInt(value,10)||1));
  renderPurchases();
}
function setPurchasePageSize(value){
  const next=parseInt(value,10);
  purPageSize=[20,50,100].includes(next)?next:20;
  purPage=1;
  renderPurchases();
}
function jumpPurchasePage(value){
  const total=getFilteredPurchases().length;
  const pages=Math.max(1,Math.ceil(total/purPageSize));
  purPage=Math.min(pages,Math.max(1,parseInt(value,10)||1));
  renderPurchases();
}
function purchaseDisplayPackageMeta(p={}){
  const ent=entitlements.find(e=>String(e.purchaseId||'')===String(p.id||''))||{};
  const pkg=packages.find(row=>String(row.id||'')===String(p.packageId||p.originalPackageId||ent.packageId||''))||{};
  const lessons=Number(p.packageLessons)||Number(pkg.lessons)||Number(ent.totalLessons)||Number(p.lessons)||0;
  const timeBand=p.packageTimeBand||p.timeBand||pkg.timeBand||ent.timeBand||'全天';
  return {
    ...p,
    ...ent,
    ...pkg,
    id:p.id||ent.id||pkg.id,
    status:p.status||ent.status||pkg.status,
    courseType:pkg.courseType||pkg.packageCourseType||ent.courseType||p.courseType||p.packageCourseType||'',
    packageCourseType:pkg.courseType||pkg.packageCourseType||ent.courseType||p.packageCourseType||p.courseType||'',
    experienceType:pkg.experienceType||ent.experienceType||p.experienceType||'',
    audience:pkg.audience||p.audience||ent.audience||p.type||pkg.type||'',
    name:pkg.name||pkg.packageName||p.packageName||p.name||ent.packageName||'',
    packageName:pkg.name||pkg.packageName||p.packageName||p.name||ent.packageName||'',
    lessons,
    packageLessons:lessons,
    totalLessons:Number(ent.totalLessons)||lessons,
    timeBand,
    packageTimeBand:timeBand
  };
}
function purchasePackageListLabel(p){
  const meta=purchaseDisplayPackageMeta(p);
  const label=standardPackageLabel(meta,true)||meta.packageName||'';
  return renderStandardEmptyText(label.replace(/\s*·\s*已停售\s*$/,'').replace(/\s*已停售\s*$/,''));
}
function purchaseEntitlementMiniBar(ent){
  if(!ent)return renderStandardCellText('-',false);
  const remaining=Number(ent.remainingLessons)||0,total=Number(ent.totalLessons)||0;
  if(total<=0)return renderStandardCellText('-',false);
  const pct=Math.max(0,Math.min(100,Math.round(remaining/total*100)));
  const text=`${lessonQty(remaining)}/${lessonQty(total)}`;
  const meta=purchaseDisplayPackageMeta(ent);
  const unit=packageLessonUnitLabel(meta);
  const title=`${standardPackageLabel(meta,true)||meta.packageName||'课包'} · 剩余 ${text} ${unit} · 有效期 ${renderStandardEmptyText(ent.validFrom)} - ${renderStandardEmptyText(ent.validUntil)}`;
  return `<div class="tms-mini-bar student-package-mini" title="${esc(title)}"><div class="tms-mini-bar-bg" style="width:100%"></div><div class="tms-mini-bar-fill" style="width:${pct}%"></div><div class="tms-mini-bar-text">${text}</div></div>`;
}
function purchaseHasActiveSearchOrFilter(){
  return !!((document.getElementById('purSearch')?.value||'').trim()||purchaseSelectedPackageFilter()||(campus&&campus!=='all')||(purDateRangeFilterValue&&purDateRangeFilterValue!=='全部'));
}
function purchaseEmptyStateHtml(){
  const filtered=purchaseHasActiveSearchOrFilter();
  const title=filtered?'没有匹配的购买记录':'暂无购买记录';
  const desc=filtered?'调整搜索或筛选后再试':'点击右上角课包购买开始录入';
  return `<tr><td colspan="9"><div class="tms-empty-state"><div class="tms-empty-title">${title}</div><div class="tms-empty-desc">${desc}</div></div></td></tr>`;
}
function renderPurchases(){
  refreshPurchaseFilters();
  const list=getFilteredPurchases();
  const total=list.length,pages=Math.max(1,Math.ceil(total/purPageSize));
  if(purPage>pages)purPage=pages;
  const slice=list.slice((purPage-1)*purPageSize,purPage*purPageSize);
  const pager=document.querySelector('#page-purchases .tms-pagination');
  if(pager)pager.style.display=total>purPageSize?'flex':'none';
  const info=document.getElementById('purPagerInfo');
  if(info)info.innerHTML=renderPagerInfoHtml(total);
  renderPurchasePagerControls(total,pages);
  document.getElementById('purchaseTbody').innerHTML=slice.length?slice.map(p=>{
    const ent=entitlements.find(e=>e.purchaseId===p.id);
    const balanceStatus=ent?entitlementStatusText(ent):(p.status==='voided'?'已作废':'未生成');
    const balanceTagClass=!ent&&p.status!=='voided'?'tms-tag-tier-slate':ent?.status==='voided'||p.status==='voided'?'tms-tag-tier-slate':ent?.status==='depleted'?'tms-tag-tier-gold':'tms-tag-green';
    return `<tr><td style="padding-left:20px">${renderStandardCellText(p.purchaseDate,false)}</td><td><div class="tms-text-primary">${esc(renderStandardEmptyText(p.studentName))}</div></td><td><div class="tms-text-primary">${esc(purchasePackageListLabel(p))}</div></td><td><div class="tms-cell-text">¥${fmt(p.amountPaid)}</div></td><td>${purchaseEntitlementMiniBar(ent)}</td><td><span class="tms-tag ${balanceTagClass}">${balanceStatus}</span></td><td>${renderStandardCellText(coachName(p.ownerCoach))}</td><td>${renderStandardCellText(p.payMethod,false)}</td><td class="tms-sticky-r tms-action-cell" style="width:120px;padding-right:20px"><span class="tms-action-link" onclick="openPurchaseDetailModal('${p.id}')">查看</span>${p.status==='voided'?'':`<span class="tms-action-link" onclick="openPurchaseEditModal('${p.id}')">编辑</span><span class="tms-action-link" onclick="openPurchaseVoidModal('${p.id}')">作废</span>`}</td></tr>`;
  }).join(''):purchaseEmptyStateHtml();
}

function purchaseEntitlement(purchaseId){
  return entitlements.find(e=>e.purchaseId===purchaseId)||null;
}
function purchaseHasLedger(purchaseId){
  const entIds=new Set(entitlements.filter(e=>e.purchaseId===purchaseId).map(e=>e.id));
  return entitlementLedger.some(l=>entIds.has(l.entitlementId));
}
function patchPurchaseVoidResult(id,reason=''){
  const now=new Date().toISOString();
  purchases=purchases.map(row=>row.id===id?{...row,status:'voided',voidedAt:now,voidReason:reason,updatedAt:now}:row);
  entitlements=entitlements.map(row=>row.purchaseId===id?{...row,status:'voided',updatedAt:now}:row);
}
function purchasePackageSnapshotHtml(p){
  const meta=purchaseDisplayPackageMeta(p);
  const unit=packageLessonUnitLabel(meta);
  const unitName=unit==='次'?'次数':'课时';
  const coachText=parseArr(p.coachNames).map(coachName).filter(Boolean).join('、')||'不限';
  const campusText=parseArr(p.campusIds).map(id=>cn(id)).join('、')||'不限';
  const windows=parseArr(p.dailyTimeWindows).map(w=>typeof packageTimeWindowText==='function'?packageTimeWindowText(w):[w.startTime,w.endTime].filter(Boolean).join(' - ')).filter(Boolean).join('、')||'全天';
  return `<div class="sec-ttl">购买时规则快照</div><div class="fgrid"><div class="fg"><div class="flabel">课包名称</div><div class="finput">${esc(renderStandardEmptyText(standardPackageLabel(meta,true)||meta.packageName))}</div></div><div class="fg"><div class="flabel">归属教练</div><div class="finput">${esc(renderStandardEmptyText(coachName(p.ownerCoach)))}</div></div><div class="fg"><div class="flabel">可上课教练</div><div class="finput">${esc(coachText)}</div></div><div class="fg"><div class="flabel">课包${unitName}</div><div class="finput">${parseInt(meta.packageLessons)||0} ${unit}</div></div><div class="fg"><div class="flabel">课包标价</div><div class="finput">¥${fmt(p.packagePrice)}</div></div><div class="fg"><div class="flabel">时段类型</div><div class="finput">${esc(packageTimeBandShortLabel(meta.packageTimeBand||meta.timeBand||'全天'))}</div></div><div class="fg"><div class="flabel">每日时段</div><div class="finput">${esc(windows)}</div></div><div class="fg"><div class="flabel">可用校区</div><div class="finput">${esc(campusText)}</div></div><div class="fg"><div class="flabel">使用开始</div><div class="finput">${esc(renderStandardEmptyText(p.usageStartDate))}</div></div><div class="fg"><div class="flabel">使用结束</div><div class="finput">${esc(renderStandardEmptyText(p.usageEndDate))}</div></div></div>`;
}
function purchaseLedgerHtml(purchaseId){
  const entIds=new Set(entitlements.filter(e=>e.purchaseId===purchaseId).map(e=>e.id));
  const rows=aggregateHistoricalMonthlyLedgerRows(dedupeEntitlementLedgerForDisplay(entitlementLedger.filter(l=>entIds.has(l.entitlementId)))).sort((a,b)=>String(entitlementLedgerSortDate(b)||'').localeCompare(String(entitlementLedgerSortDate(a)||''))).slice(0,10);
  if(!rows.length)return '<div class="finput" style="min-height:42px">暂无扣课记录</div>';
  return `<div class="finput" style="min-height:42px;white-space:normal;line-height:1.7">${rows.map(l=>`${(Number(l.lessonDelta)||0)>0?'退回':'扣减'} ${lessonQty(Math.abs(Number(l.lessonDelta)||0))} 节 · ${esc(renderStandardEmptyText(l.reason))} · ${renderStandardEmptyText(entitlementLedgerDisplayDate(l))}`).join('<br>')}</div>`;
}
function purchaseSystemAmountForPackage(packageId){
  const pkg=packages.find(x=>x.id===packageId);
  return Number(pkg?.price)||0;
}
function purchasePackagePickerLabel(p={}){
  const base=standardPackageLabel(p,true)||p.name||'课包';
  const price=Number(p.price)||0;
  return [base,price?`${price}元`:'',coachName(p.ownerCoach)].filter(Boolean).join(' · ');
}
function syncPurchasePackageMeta(prefix='pur',force=false){
  syncPurchasePriceFields(prefix,force);
  const packageId=document.getElementById(`${prefix}_packageId`)?.value||'';
  const pkg=packages.find(x=>x.id===packageId);
  const ownerCoachId=`${prefix}_ownerCoach`;
  const ownerCoachEl=document.getElementById(ownerCoachId);
  if(ownerCoachEl&&pkg?.ownerCoach&&(force||!ownerCoachEl.value)){
    const ownerCoach=coachName(pkg.ownerCoach);
    setStandardDropdownValue(ownerCoachId,ownerCoach,ownerCoach);
  }
  if(force&&pkg){
    const coachValues=new Set(parseArr(pkg.coachNames).map(coachName));
    document.querySelectorAll(`.${prefix === 'pur' ? 'pur-allowed-coach-cb' : 'pur-edit-allowed-coach-cb'}`).forEach(cb=>{
      cb.checked=coachValues.has(cb.value);
    });
  }
}
function syncPurchasePriceFields(prefix='pur',force=false){
  const packageId=document.getElementById(`${prefix}_packageId`)?.value||'';
  const systemAmount=purchaseSystemAmountForPackage(packageId);
  const systemInput=document.getElementById(`${prefix}_systemAmount`);
  const amountInput=document.getElementById(`${prefix}_amountPaid`);
  if(systemInput)systemInput.value=systemAmount||0;
  if(amountInput&&(force||!amountInput.value||amountInput.dataset.autofill==='1')){
    amountInput.value=systemAmount||0;
    amountInput.dataset.autofill='1';
  }
}
function purchasePriceOverrideChanged(prefix='pur'){
  const systemAmount=Number(document.getElementById(`${prefix}_systemAmount`)?.value)||0;
  const finalAmount=Number(document.getElementById(`${prefix}_amountPaid`)?.value)||0;
  const reasonWrap=document.getElementById(`${prefix}_overrideReasonWrap`);
  const reasonInput=document.getElementById(`${prefix}_overrideReason`);
  const amountInput=document.getElementById(`${prefix}_amountPaid`);
  const changed=systemAmount!==finalAmount;
  if(reasonWrap)reasonWrap.style.display=changed?'block':'none';
  if(!changed&&reasonInput)reasonInput.value='';
  if(amountInput)amountInput.dataset.autofill='0';
}
function purchasePriceSummaryHtml(p){
  const systemAmount=Number(p.systemAmount??p.packagePrice??0)||0;
  const finalAmount=Number(p.finalAmount??p.amountPaid??systemAmount)||0;
  const overrideReason=String(p.overrideReason||'').trim();
  return `<div class="fg"><div class="flabel">系统价格</div><div class="finput">¥${fmt(systemAmount)}</div></div><div class="fg"><div class="flabel">成交金额</div><div class="finput">¥${fmt(finalAmount)}</div></div><div class="fg"><div class="flabel">是否改价</div><div class="finput">${systemAmount!==finalAmount?'是':'否'}</div></div><div class="fg full"><div class="flabel">改价原因</div><div class="finput" style="min-height:42px">${esc(renderStandardEmptyText(overrideReason))}</div></div>`;
}
function purchaseStudentSearchRows(keyword=''){
  const q=String(keyword||'').trim().toLowerCase();
  return students.filter(s=>{
    if(!q)return true;
    return [s.name,s.phone,cn(s.campus),s.primaryCoach].some(v=>String(v||'').toLowerCase().includes(q));
  }).sort((a,b)=>String(a.name||'').localeCompare(String(b.name||''),'zh-CN')).slice(0,80);
}
function purchaseStudentPickerHtml(selectedId='',keyword=''){
  const rows=purchaseStudentSearchRows(keyword);
  if(!rows.length)return '<div style="font-size:12px;color:var(--td);padding:10px 0">没有匹配到学员，请换个关键词。</div>';
  return `<div class="tms-checkbox-matrix purchase-student-picker">${rows.map(s=>`<label class="tms-checkbox-wrap ${s.id===selectedId?'active':''}" onclick="selectPurchaseStudent('${s.id}')"><input type="radio" class="tms-checkbox" name="purStudentPick" ${s.id===selectedId?'checked':''}><span>${esc(s.name)}${s.phone?` · ${esc(s.phone)}`:''}${s.campus?` · ${esc(cn(s.campus))}`:''}</span></label>`).join('')}</div>`;
}
function renderPurchaseStudentPicker(){
  const host=document.getElementById('pur_studentPickerWrap');
  if(!host)return;
  host.innerHTML=purchaseStudentPickerHtml(document.getElementById('pur_studentId')?.value||'',document.getElementById('pur_studentSearch')?.value||'');
}
function selectPurchaseStudent(studentId){
  const input=document.getElementById('pur_studentId');
  if(input)input.value=studentId||'';
  const stu=students.find(s=>s.id===studentId);
  if(stu?.primaryCoach){const primaryCoach=coachName(stu.primaryCoach);setStandardDropdownValue('pur_ownerCoach',primaryCoach,primaryCoach);}
  const search=document.getElementById('pur_studentSearch');
  if(search&&stu)search.value=stu.phone?`${stu.name} · ${stu.phone}`:stu.name;
  renderPurchaseStudentPicker();
}

function openPurchaseEntryModal(){
  openPurchaseModal();
}
function openPurchaseModal(studentId=''){
  const stu=studentId?students.find(x=>x.id===studentId):null;
  if(studentId&&!stu){toast('学员不存在','error');return;}
  editId=null;
  const payOptions=PAY_METHODS.map(t=>({value:t,label:t}));
  const ownerOptions=[{value:'',label:'未分配'},...activeCoachNames().map(name=>({value:name,label:name}))];
  const studentSearchValue=stu?(stu.phone?`${stu.name} · ${stu.phone}`:stu.name):'';
  const body=`<div class="tms-section-header" style="margin-top:0;">学员信息</div><div class="tms-form-row"><div class="tms-form-item full-width"><label class="tms-form-label">学员 *</label><input type="hidden" id="pur_studentId" value="${esc(stu?.id||'')}"><input class="finput tms-form-control" id="pur_studentSearch" value="${esc(studentSearchValue)}" placeholder="搜索姓名 / 手机号 / 校区 / 教练" oninput="renderPurchaseStudentPicker()"><div id="pur_studentPickerWrap" style="margin-top:8px">${purchaseStudentPickerHtml(stu?.id||'',studentSearchValue)}</div></div></div><div class="tms-section-header">购买信息</div><div class="tms-form-row purchase-compact-row"><div class="tms-form-item" style="flex:2"><label class="tms-form-label">选择课包 *</label>${renderStandardDropdownHtml('pur_packageId','选择课包',packages.filter(p=>p.status!=='inactive'&&p.status!=='merged').map(p=>({value:p.id,label:purchasePackagePickerLabel(p)})), '', true, 'onPurchasePackageChange')}</div><div class="tms-form-item"><label class="tms-form-label">归属教练</label>${renderStandardDropdownHtml('pur_ownerCoach','归属教练',ownerOptions,coachName(stu?.primaryCoach),true)}</div></div><div class="tms-form-row purchase-compact-row"><div class="tms-form-item"><label class="tms-form-label">支付日期</label>${courtDateButtonHtml('pur_purchaseDate',today(),'支付日期')}</div><div class="tms-form-item"><label class="tms-form-label">系统价格</label><input class="finput tms-form-control" id="pur_systemAmount" type="number" value="0" readonly></div><div class="tms-form-item"><label class="tms-form-label">实收金额</label><input class="finput tms-form-control" id="pur_amountPaid" type="number" value="0" oninput="purchasePriceOverrideChanged('pur')"></div><div class="tms-form-item"><label class="tms-form-label">支付方式</label>${renderStandardDropdownHtml('pur_payMethod','支付方式',payOptions,'微信',true)}</div></div><div class="tms-form-row" id="pur_overrideReasonWrap" style="display:none"><div class="tms-form-item full-width"><label class="tms-form-label">改价原因</label><input class="finput tms-form-control" id="pur_overrideReason" placeholder="实际成交价与系统价格不一致时必填"></div></div><div class="tms-form-row" style="margin-bottom:0"><div class="tms-form-item full-width"><label class="tms-form-label">可上课教练</label><div class="tms-checkbox-matrix purchase-coach-picker">${purchaseAllowedCoachChecks([], 'pur-allowed-coach-cb')}</div></div></div><div class="tms-form-row purchase-notes-row" style="margin-bottom:0"><div class="tms-form-item full-width"><label class="tms-form-label">备注</label><textarea class="finput tms-form-control" id="pur_notes"></textarea></div></div>`;
  const footer=`<button class="tms-btn tms-btn-default" onclick="closeModal()">取消</button><button class="tms-btn tms-btn-primary" id="purchaseSaveBtn" onclick="savePurchase()">保存</button>`;
  setCourtModalFrame('课包购买',body,footer,'modal-wide');
  fillPurchasePackageMeta();
}
function fillPurchasePackageMeta(){
  syncPurchasePackageMeta('pur');
  purchasePriceOverrideChanged('pur');
}
function onPurchasePackageChange(value){
  syncPurchasePackageMeta('pur',true);
  purchasePriceOverrideChanged('pur');
}
function onPurchaseEditPackageChange(){
  syncPurchasePackageMeta('pur_edit',true);
  purchasePriceOverrideChanged('pur_edit');
}
function openPurchaseDetailModal(id){
  const p=purchases.find(x=>x.id===id);if(!p){toast('购买记录不存在','error');return;}
  const ent=purchaseEntitlement(id);
  const meta=purchaseDisplayPackageMeta(p);
  const unit=packageLessonUnitLabel(meta);
  const modal=document.querySelector('#overlay .modal');
  if(modal)modal.className='modal modal-wide';
  document.getElementById('mTitle').textContent='购买记录详情';
  document.getElementById('mBody').innerHTML=`<div class="sec-ttl">成交快照</div><div class="fgrid"><div class="fg"><div class="flabel">支付日期</div><div class="finput">${esc(renderStandardEmptyText(p.purchaseDate))}</div></div><div class="fg"><div class="flabel">系统录入时间</div><div class="finput">${fmtDt(p.createdAt)}</div></div><div class="fg"><div class="flabel">学员</div><div class="finput">${esc(renderStandardEmptyText(p.studentName))}</div></div><div class="fg"><div class="flabel">售卖课包</div><div class="finput">${esc(renderStandardEmptyText(standardPackageLabel(meta,true)||meta.packageName))}</div></div>${purchasePriceSummaryHtml(p)}<div class="fg"><div class="flabel">归属教练</div><div class="finput">${esc(renderStandardEmptyText(coachName(p.ownerCoach)))}</div></div><div class="fg"><div class="flabel">可上课教练</div><div class="finput">${esc(renderStandardEmptyText(parseArr(p.allowedCoaches).map(coachName).filter(Boolean).join('、')))}</div></div><div class="fg"><div class="flabel">支付方式</div><div class="finput">${esc(renderStandardEmptyText(p.payMethod))}</div></div><div class="fg"><div class="flabel">购买状态</div><div class="finput">${purchaseStatusText(p)}</div></div><div class="fg"><div class="flabel">操作人</div><div class="finput">${esc(renderStandardEmptyText(p.operator))}</div></div><div class="fg full"><div class="flabel">备注</div><div class="finput" style="min-height:42px">${esc(renderStandardEmptyText(p.notes))}</div></div></div><div class="sec-ttl">课包余额</div><div class="fgrid"><div class="fg"><div class="flabel">当前余额</div><div class="finput">${ent?`${lessonQty(ent.remainingLessons)}/${lessonQty(ent.totalLessons)} ${unit}`:'-'}</div></div><div class="fg"><div class="flabel">有效期</div><div class="finput">${ent?`${renderStandardEmptyText(ent.validFrom)} - ${renderStandardEmptyText(ent.validUntil)}`:'-'}</div></div><div class="fg"><div class="flabel">余额状态</div><div class="finput">${ent?entitlementStatusText(ent):'-'}</div></div></div><div class="sec-ttl">扣课记录</div>${purchaseLedgerHtml(p.id)}${purchasePackageSnapshotHtml(p)}${p.status==='voided'?`<div class="sec-ttl">作废信息</div><div class="fgrid"><div class="fg"><div class="flabel">作废时间</div><div class="finput">${esc(renderStandardEmptyText(p.voidedAt))}</div></div><div class="fg"><div class="flabel">作废人</div><div class="finput">${esc(renderStandardEmptyText(p.voidedBy))}</div></div><div class="fg full"><div class="flabel">作废原因</div><div class="finput" style="min-height:42px">${esc(renderStandardEmptyText(p.voidReason))}</div></div></div>`:''}<div class="mactions"><button class="btn-cancel" onclick="closeModal()">关闭</button>${p.status==='voided'?'':`<button class="btn-save" onclick="openPurchaseEditModal('${p.id}')">编辑</button>`}</div>`;
  document.getElementById('overlay').classList.add('open');
}
function openPurchaseEditModal(id){
  const p=purchases.find(x=>x.id===id);if(!p){toast('购买记录不存在','error');return;}
  const locked=purchaseHasLedger(id);
  const studentOptions=students.map(s=>({value:s.id,label:`${s.name}${s.phone?` · ${s.phone}`:''}`}));
  const payOptions=PAY_METHODS.map(t=>({value:t,label:t}));
  const ownerOptions=[{value:'',label:'未分配'},...activeCoachNames().map(name=>({value:name,label:name}))];
  const body=`${locked?'<div class="tms-audit-note" style="margin-bottom:18px">该购买记录已有课时消耗，只能修改备注。</div>':''}<div class="tms-section-header" style="margin-top:0;">购买信息</div><div class="tms-form-row"><div class="tms-form-item full-width"><label class="tms-form-label">学员 *</label>${renderStandardDropdownHtml('pur_edit_studentId','选择学员',studentOptions,p.studentId,true)}</div></div><div class="tms-form-row purchase-compact-row"><div class="tms-form-item" style="flex:2"><label class="tms-form-label">选择课包 *</label>${renderStandardDropdownHtml('pur_edit_packageId','选择课包',packages.filter(pkg=>(pkg.status!=='inactive'&&pkg.status!=='merged')||pkg.id===p.packageId).map(pkg=>({value:pkg.id,label:purchasePackagePickerLabel(pkg)})),p.packageId,true,'onPurchaseEditPackageChange')}</div><div class="tms-form-item"><label class="tms-form-label">归属教练</label>${renderStandardDropdownHtml('pur_edit_ownerCoach','归属教练',ownerOptions,coachName(p.ownerCoach),true)}</div></div><div class="tms-form-row purchase-compact-row"><div class="tms-form-item"><label class="tms-form-label">支付日期</label>${courtDateButtonHtml('pur_edit_purchaseDate',p.purchaseDate||today(),'支付日期')}</div><div class="tms-form-item"><label class="tms-form-label">系统价格</label><input class="finput tms-form-control" id="pur_edit_systemAmount" type="number" value="${Number(p.systemAmount??p.packagePrice??0)||0}" readonly></div><div class="tms-form-item"><label class="tms-form-label">实收金额</label><input class="finput tms-form-control" id="pur_edit_amountPaid" type="number" value="${parseFloat(p.finalAmount??p.amountPaid)||0}"${locked?' readonly':''} oninput="purchasePriceOverrideChanged('pur_edit')"></div><div class="tms-form-item"><label class="tms-form-label">支付方式</label>${renderStandardDropdownHtml('pur_edit_payMethod','支付方式',payOptions,p.payMethod||'微信',true)}</div></div><div class="tms-form-row" id="pur_edit_overrideReasonWrap" style="display:${Number(p.systemAmount??p.packagePrice??0)!==Number(p.finalAmount??p.amountPaid??0)?'block':'none'}"><div class="tms-form-item full-width"><label class="tms-form-label">改价原因</label><input class="finput tms-form-control" id="pur_edit_overrideReason" value="${esc(p.overrideReason||'')}" ${locked?'readonly':''} placeholder="实际成交价与系统价格不一致时必填"></div></div><div class="tms-form-row" style="margin-bottom:0"><div class="tms-form-item full-width"><label class="tms-form-label">可上课教练</label><div class="tms-checkbox-matrix purchase-coach-picker">${purchaseAllowedCoachChecks(p.allowedCoaches, 'pur-edit-allowed-coach-cb')}</div></div></div><div class="tms-form-row purchase-notes-row" style="margin-bottom:0"><div class="tms-form-item full-width"><label class="tms-form-label">备注</label><textarea class="finput tms-form-control" id="pur_edit_notes">${esc(p.notes||'')}</textarea></div></div>`;
  const footer=`<button class="tms-btn tms-btn-default" onclick="closeModal()">取消</button><button class="tms-btn tms-btn-primary" id="purchaseEditSaveBtn" onclick="savePurchaseEdit('${p.id}')">保存</button>`;
  setCourtModalFrame('编辑购买记录',body,footer,'modal-wide');
  if(locked){
    ['pur_edit_studentId_dropdown','pur_edit_packageId_dropdown','pur_edit_payMethod_dropdown','pur_edit_ownerCoach_dropdown'].forEach(id=>{
      const el=document.getElementById(id);
      if(el){el.style.pointerEvents='none';el.style.opacity='0.6';}
    });
    const dateBtn=document.getElementById('pur_edit_purchaseDate_btn');
    if(dateBtn){dateBtn.disabled=true;dateBtn.style.pointerEvents='none';dateBtn.style.opacity='0.6';}
    document.querySelectorAll('.pur-edit-allowed-coach-cb').forEach(cb=>{cb.disabled=true;});
  }
  fillPurchaseEditPackageMeta();
}
function fillPurchaseEditPackageMeta(){
  syncPurchasePriceFields('pur_edit');
  purchasePriceOverrideChanged('pur_edit');
}
async function savePurchaseEdit(id){
  const btn=document.getElementById('purchaseEditSaveBtn');if(btn){btn.disabled=true;btn.textContent='保存中…';}
  const data={studentId:document.getElementById('pur_edit_studentId')?.value||'',packageId:document.getElementById('pur_edit_packageId')?.value||'',ownerCoach:document.getElementById('pur_edit_ownerCoach')?.value||'',allowedCoaches:[...document.querySelectorAll('.pur-edit-allowed-coach-cb:checked')].map(cb=>cb.value),purchaseDate:document.getElementById('pur_edit_purchaseDate')?.value||'',amountPaid:parseFloat(document.getElementById('pur_edit_amountPaid')?.value)||0,overrideReason:document.getElementById('pur_edit_overrideReason')?.value.trim()||'',payMethod:document.getElementById('pur_edit_payMethod')?.value||'',notes:document.getElementById('pur_edit_notes')?.value.trim()||''};
  const systemAmount=Number(document.getElementById('pur_edit_systemAmount')?.value)||0;
  if(!purchaseHasLedger(id)&&systemAmount!==Number(data.amountPaid||0)&&!data.overrideReason){toast('请填写改价原因','warn');if(btn){btn.disabled=false;btn.textContent='保存';}return;}
  try{
    const res=await apiCall('PUT','/purchases/'+id,data);
    if(res.purchase){
      const i=purchases.findIndex(x=>x.id===id);
      if(i>=0)purchases[i]=res.purchase;
    }
    if(Array.isArray(res.entitlements)){
      res.entitlements.forEach(next=>{
        const i=entitlements.findIndex(x=>x.id===next.id);
        if(i>=0)entitlements[i]=next;
      });
    }
    closeModal();toast('购买记录已更新','success');renderStudents();renderPurchases();renderEntitlements();
  }catch(e){toast('保存失败：'+e.message,'error');if(btn){btn.disabled=false;btn.textContent='保存';}}
}
function openPurchaseVoidModal(id){
  const p=purchases.find(x=>x.id===id);if(!p){toast('购买记录不存在','error');return;}
  const ent=purchaseEntitlement(id);
  const meta=purchaseDisplayPackageMeta(p);
  const unit=packageLessonUnitLabel(meta);
  const blocked=purchaseHasLedger(id);
  const modal=document.querySelector('#overlay .modal');
  if(modal)modal.className='modal modal-tight';
  document.getElementById('mTitle').textContent='作废购买记录';
  document.getElementById('mBody').innerHTML=`<div class="fgrid"><div class="fg"><div class="flabel">学员</div><div class="finput">${esc(p.studentName)||'-'}</div></div><div class="fg"><div class="flabel">售卖课包</div><div class="finput">${esc(standardPackageLabel(meta,true)||meta.packageName)||'-'}</div></div><div class="fg"><div class="flabel">购买日期</div><div class="finput">${esc(p.purchaseDate)||'-'}</div></div><div class="fg"><div class="flabel">实收金额</div><div class="finput">¥${fmt(p.amountPaid)}</div></div><div class="fg full"><div class="flabel">影响范围</div><div class="finput" style="min-height:42px">${ent?`将同步作废课包余额「${esc(standardPackageLabel(meta,true)||meta.packageName)}」，当前剩余 ${lessonQty(ent.remainingLessons)}/${lessonQty(ent.totalLessons)} ${unit}。`:'未找到对应课包余额。'}</div></div>${blocked?`<div class="fg full"><div class="flabel">当前状态</div><div class="finput" style="min-height:42px">该购买记录已有课时消耗，不能直接作废。</div></div>`:`<div class="fg full"><div class="flabel">作废原因</div><textarea class="finput ftextarea" id="pur_void_reason" placeholder="例如：录错学员、重复购买、实际未付款"></textarea></div>`}</div><div class="mactions"><button class="btn-cancel" onclick="closeModal()">关闭</button>${blocked?'':`<button class="btn-save" onclick="voidPurchase('${p.id}')">确认作废</button>`}</div>`;
  document.getElementById('overlay').classList.add('open');
}
async function voidPurchase(id){
  const reason=document.getElementById('pur_void_reason')?.value.trim()||'';
  if(!reason){toast('请填写作废原因','warn');return;}
  const btn=document.querySelector('.btn-save');btn.disabled=true;btn.textContent='作废中…';
  try{
    await apiCall('DELETE','/purchases/'+id,{reason});
    patchPurchaseVoidResult(id,reason);
    closeModal();
    renderStudents();
    renderPurchases();
    renderEntitlements();
    toast('购买记录已作废','success');
  }catch(e){toast('作废失败：'+e.message,'error');btn.disabled=false;btn.textContent='确认作废';}
}
async function savePurchase(){
  const studentId=document.getElementById('pur_studentId').value;
  if(!studentId){toast('请选择学员','warn');return;}
  const packageId=document.getElementById('pur_packageId').value;
  if(!packageId){toast('请选择课包','warn');return;}
  const btn=document.getElementById('purchaseSaveBtn');if(btn){btn.disabled=true;btn.textContent='保存中…';}
  const data={studentId,packageId,ownerCoach:document.getElementById('pur_ownerCoach')?.value||'',allowedCoaches:[...document.querySelectorAll('.pur-allowed-coach-cb:checked')].map(cb=>cb.value),purchaseDate:document.getElementById('pur_purchaseDate').value,amountPaid:parseFloat(document.getElementById('pur_amountPaid').value)||0,overrideReason:document.getElementById('pur_overrideReason')?.value.trim()||'',payMethod:document.getElementById('pur_payMethod').value,notes:document.getElementById('pur_notes').value.trim()};
  const systemAmount=Number(document.getElementById('pur_systemAmount')?.value)||0;
  if(systemAmount!==Number(data.amountPaid||0)&&!data.overrideReason){toast('请填写改价原因','warn');if(btn){btn.disabled=false;btn.textContent='保存';}return;}
  try{
    const res=await apiCall('POST','/purchases',data);
    if(res.purchase)purchases.unshift(res.purchase);
    if(res.entitlement)entitlements.unshift(res.entitlement);
    closeModal();toast('购买成功','success');renderStudents();renderPurchases();renderEntitlements();
  }catch(e){toast('保存失败：'+e.message,'error');if(btn){btn.disabled=false;btn.textContent='保存';}}
}
function focusPurchaseByPackage(packageId){
  purPackageFilterValue=String(packageId||'');
  clearPurchasePageFiltersForPackageFocus();
  goPage('purchases');
  const pkg=packages.find(p=>String(p.id||'')===String(packageId||''));
  setStandardDropdownValue('purPackageFilter',packageId,standardPackageLabel(pkg||{},true)||pkg?.name||packageId);
  purPage=1;
  renderPurchases();
}
function clearPurchasePageFiltersForPackageFocus(){
  const search=document.getElementById('purSearch');
  const dateFrom=document.getElementById('purDateFrom');
  const dateTo=document.getElementById('purDateTo');
  if(search)search.value='';
  if(dateFrom)dateFrom.value='';
  if(dateTo)dateTo.value='';
  syncDateButton('purDateFrom','purDateFromBtn','开始日期');
  syncDateButton('purDateTo','purDateToBtn','结束日期');
}
function exportPurchaseCSV(){
  const list=getFilteredPurchases();
  let csv='购买日期,学员,售卖课包,课程类型,实收,剩余课时,总课时,有效开始,有效结束,支付方式,状态,备注\n';
  csv+=list.map(p=>{
    const ent=entitlements.find(e=>e.purchaseId===p.id)||{};
    return [p.purchaseDate||'',p.studentName||'',standardPackageLabel(p,true)||p.packageName||'',p.courseType||'',parseFloat(p.amountPaid)||0,Number(ent.remainingLessons)||0,Number(ent.totalLessons)||0,ent.validFrom||'',ent.validUntil||'',p.payMethod||'',purchaseStatusText(p),'"'+String(p.notes||'').replace(/"/g,'""')+'"'].join(',');
  }).join('\n');
  const blob=new Blob(['\ufeff'+csv],{type:'text/csv;charset=utf-8;'});
  const a=document.createElement('a');a.href=URL.createObjectURL(blob);a.download='FlowTennis_购买记录_'+today()+'.csv';a.click();toast('导出成功','success');
}
