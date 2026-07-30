function purchaseSelectedPackageFilter(){
  return purPackageFilterValue||document.getElementById('purPackageFilter')?.value||'';
}
function onPurchaseFilterChange(){
  purPackageFilterValue=document.getElementById('purPackageFilter')?.value||'';
  purOwnerCoachFilterValue='';
  purPage=standardListFirstPage();
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
  if(typeof renderStandardTopDropdown!=='function'||typeof standardTopLocationIcon!=='function'||typeof standardTopTimeIcon!=='function')return '';
  const campusOpts=purchaseTopCampusOptions();
  const campusMenu=campusOpts.map(opt=>`<div class="tms-dropdown-item ${campus===opt.value?'active':''}" data-value="${esc(opt.value)}" onclick="selectPurchaseTopCampus(${jsArg(opt.value)},event)">${esc(opt.label)}</div>`).join('');
  const timeMenu=purchaseDateFilterQuickOptions().map(label=>`<div class="tms-dropdown-item ${label===purDateRangeFilterValue?'active':''}" data-value="${esc(label)}" onclick="onPurchaseDateRangeFilterChange(${jsArg(label)},event)">${esc(label)}</div>`).join('');
  return `<div class="court-top-filterbar"><div class="court-top-filter-item">${renderStandardTopDropdown('purchaseTopCampus',campusOpts.find(opt=>opt.value===campus)?.label||'全部校区',standardTopLocationIcon(),campusMenu,'court-top-campus-menu')}</div><div class="court-top-filter-item">${renderStandardTopDropdown('purchaseTopDate',currentPurchaseDateRangeLabel(),standardTopTimeIcon(),timeMenu,'court-top-date-menu is-quick')}</div></div>`;
}
function refreshPurchaseTopFilters(){
  const host=document.getElementById('campusTabs');
  if(host&&currentPage==='purchases')host.innerHTML=renderPurchaseTopFilters();
}
function selectPurchaseTopCampus(value,event){
  if(event)event.stopPropagation();
  campus=value||'all';
  localStorage.setItem(CAMPUS_KEY,campus);
  purPage=standardListFirstPage();
  refreshPurchaseTopFilters();
  renderPurchases();
  closeStandardTopDropdowns();
}
function onPurchaseDateRangeFilterChange(value,event){
  if(event)event.stopPropagation();
  purDateRangeFilterValue=value||'全部';
  const range=activePurchaseDateRange();
  purDateRangeStart=range.startDate;
  purDateRangeEnd=range.endDate;
  purPage=standardListFirstPage();
  refreshPurchaseTopFilters();
  renderPurchases();
  closeStandardTopDropdowns();
}
function refreshPurchaseFilters(){
  const packageValue=purchaseSelectedPackageFilter();
  const purchaseRows=purchases.filter(isMeaningfulPurchaseRecord);
  const packageOptions=withStandardFilterCounts(coursePackageDropdownOptions(packages,{showAllOption:true,allLabel:'全部课包',includeCoach:true}),purchaseRows,(p,value)=>purchaseMatchesPackage(p,value));
  const host=document.getElementById('purPackageFilterHost');
  if(host)host.innerHTML=renderCoursePackagePickerDropdownHtml('purPackageFilter','全部课包',packages,packageValue,{showAllOption:true,allLabel:'全部课包',includeCoach:true,isForm:false,onchange:'onPurchaseFilterChange',options:packageOptions});
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
  const lifecycleCampus=typeof customerLifecycleCampus==='function'?customerLifecycleCampus(p,stu.campus):'';
  return [
    lifecycleCampus,
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
  const ownerCoachFilter=purOwnerCoachFilterValue||'';
  const dateRange=activePurchaseDateRange();
  return purchaseUnifiedRows().filter(p=>{
    if(!isMeaningfulPurchaseRecord(p))return false;
    if(!searchHit(q,p.studentName,purchasePackageListLabel(p),purchaseActualAmount(p),purchasePayMethodText(p.payMethod),p.purchaseDate,p.productName,p.courseType,p.packageTimeBand,p.ownerCoach))return false;
    if(packageId&&!purchaseMatchesPackage(p,packageId))return false;
    if(ownerCoachFilter&&coachName(p.ownerCoach)!==ownerCoachFilter)return false;
    if(!purchaseMatchesCampus(p,campus))return false;
    if(!purchaseDateWithinRange(p.purchaseDate||p.createdAt,dateRange))return false;
    return true;
  }).sort((a,b)=>String(b.purchaseDate||b.createdAt||'').localeCompare(String(a.purchaseDate||a.createdAt||'')));
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
  purPage=standardListPagination(total,value,purPageSize).page;
  renderPurchases();
}
function setPurchasePageSize(value){
  purPageSize=standardListPageSize(value,purPageSize);
  purPage=standardListFirstPage();
  renderPurchases();
}
function jumpPurchasePage(value){
  const total=getFilteredPurchases().length;
  purPage=standardListPagination(total,value,purPageSize).page;
  renderPurchases();
}
function purchaseDisplayPackageMeta(p={}){
  const ent=entitlements.find(e=>String(e.purchaseId||'')===String(p.id||''))||{};
  const pkg=packages.find(row=>String(row.id||'')===String(p.packageId||p.originalPackageId||ent.packageId||''))||{};
  const baseLessons=Number(p.packageLessons)||Number(pkg.lessons)||Number(p.lessons)||0;
  const giftLessons=Number(p.giftLessons||ent.giftLessons)||0;
  const lessons=baseLessons||Number(ent.totalLessons)||0;
  const totalLessons=Number(ent.totalLessons)||Number(p.totalLessons)||baseLessons+giftLessons||lessons;
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
    packageLessons:baseLessons||lessons,
    giftLessons,
    totalLessons,
    timeBand,
    packageTimeBand:timeBand
  };
}
function purchasePackageListLabel(p){
  const meta=purchaseDisplayPackageMeta(p);
  const label=standardPackageLabel(meta,true)||meta.packageName||'';
  return renderStandardEmptyText(label.replace(/\s*·\s*已停售\s*$/,'').replace(/\s*已停售\s*$/,''));
}
function purchasePayMethodText(value){
  const raw=String(value||'').trim();
  if(!raw||raw==='待确认'||raw==='微信支付')return '微信';
  return raw;
}
function purchaseReceivableAmount(p={}){
  return Number(p.systemAmount??p.packagePrice??p.price??0)||0;
}
function purchaseActualAmount(p={}){
  return Number(p.finalAmount??p.amountPaid??0)||0;
}
function purchasePriceDiffAmount(p={}){
  return Math.round((purchaseActualAmount(p)-purchaseReceivableAmount(p))*100)/100;
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
  return `<tr><td colspan="11"><div class="tms-empty-state"><div class="tms-empty-title">${title}</div><div class="tms-empty-desc">${desc}</div></div></td></tr>`;
}
function renderPurchaseMobileCards(list){
  const host=document.getElementById('purchaseMobileCards');
  if(!host)return;
  if(!list.length){
    const filtered=purchaseHasActiveSearchOrFilter();
    host.innerHTML=`<div class="tms-empty-state"><div class="tms-empty-title">${filtered?'没有匹配的购买记录':'暂无购买记录'}</div><div class="tms-empty-desc">${filtered?'调整搜索或筛选后再试':'点击右下角课包购买开始录入'}</div></div>`;
    return;
  }
  host.innerHTML=list.map(p=>{
    const ent=entitlements.find(e=>e.purchaseId===p.id);
    const balanceStatus=ent?entitlementStatusText(ent):(p.status==='voided'?'已作废':'未生成');
    const balanceTagClass=!ent&&p.status!=='voided'?'tms-tag-tier-slate':ent?.status==='voided'||p.status==='voided'?'tms-tag-tier-slate':ent?.status==='depleted'?'tms-tag-tier-gold':'tms-tag-green';
    const total=Number(ent?.totalLessons)||0;
    const remaining=Number(ent?.remainingLessons)||0;
    const balanceText=ent?`${lessonQty(remaining)}/${lessonQty(total)}`:'-';
    const voidAction=p.status==='voided'?'':`<button type="button" onclick="openPurchaseVoidModal('${p.id}')">作废</button>`;
    return `<article class="admin-h5-list-card admin-h5-purchase-card">
      <div class="admin-h5-card-head">
        <div><strong>${esc(renderStandardEmptyText(p.studentName))}</strong><span>${esc(p.purchaseDate||'-')}</span></div>
        <span class="tms-tag ${balanceTagClass}">${esc(balanceStatus)}</span>
      </div>
      <div class="admin-h5-card-tags"><span class="tms-tag">${esc(purchasePayMethodText(p.payMethod)||'-')}</span><span class="tms-tag">${esc(coachName(p.ownerCoach)||'-')}</span></div>
      <div class="admin-h5-card-grid">
        <span><b>课包</b>${esc(purchasePackageListLabel(p))}</span>
        <span><b>应收</b>¥${esc(fmt(purchaseReceivableAmount(p)))}</span>
        <span><b>实收</b>¥${esc(fmt(purchaseActualAmount(p)))}</span>
        <span><b>差价</b>¥${esc(fmt(purchasePriceDiffAmount(p)))}</span>
        <span><b>余额</b>${esc(balanceText)}</span>
        <span><b>状态</b>${esc(balanceStatus)}</span>
      </div>
      <p>${esc(p.notes||'暂无备注')}</p>
      <div class="admin-h5-card-actions"><button type="button" onclick="openPurchaseDetailModal('${p.id}')">查看</button>${voidAction}</div>
    </article>`;
  }).join('');
}
function renderPurchases(){
  refreshPurchaseFilters();
  const list=getFilteredPurchases();
  const isMobileList=document.body.classList.contains('admin-mobile');
  const pageState=isMobileList?{total:list.length,pages:1,page:1,slice:list}:standardListSlice(list,purPage,purPageSize);
  purPage=pageState.page;
  const {total,pages,slice}=pageState;
  const pager=document.querySelector('#page-purchases .tms-pagination');
  if(pager)pager.style.display=isMobileList?'none':(total>purPageSize?'flex':'none');
  const info=document.getElementById('purPagerInfo');
  if(info)info.innerHTML=renderPagerInfoHtml(total);
  renderPurchasePagerControls(total,pages);
  document.getElementById('purchaseTbody').innerHTML=slice.length?slice.map(p=>{
    const ent=entitlements.find(e=>e.purchaseId===p.id);
    const balanceStatus=ent?entitlementStatusText(ent):(p.status==='voided'?'已作废':'未生成');
    const balanceTagClass=!ent&&p.status!=='voided'?'tms-tag-tier-slate':ent?.status==='voided'||p.status==='voided'?'tms-tag-tier-slate':ent?.status==='depleted'?'tms-tag-tier-gold':'tms-tag-green';
    return `<tr><td style="padding-left:20px">${renderStandardCellText(p.purchaseDate,false)}</td><td><div class="tms-text-primary">${esc(renderStandardEmptyText(p.studentName))}</div></td><td><div class="tms-text-primary">${esc(purchasePackageListLabel(p))}</div></td><td><div class="tms-cell-text">¥${fmt(purchaseReceivableAmount(p))}</div></td><td><div class="tms-cell-text">¥${fmt(purchaseActualAmount(p))}</div></td><td><div class="tms-cell-text">¥${fmt(purchasePriceDiffAmount(p))}</div></td><td>${purchaseEntitlementMiniBar(ent)}</td><td><span class="tms-tag ${balanceTagClass}">${balanceStatus}</span></td><td>${renderStandardCellText(coachName(p.ownerCoach))}</td><td>${renderStandardCellText(purchasePayMethodText(p.payMethod),false)}</td><td class="tms-sticky-r tms-action-cell" style="width:120px;padding-right:20px"><span class="tms-action-link" onclick="openPurchaseDetailModal('${p.id}')">查看</span>${p.status==='voided'?'':`<span class="tms-action-link" onclick="openPurchaseVoidModal('${p.id}')">作废</span>`}</td></tr>`;
  }).join(''):purchaseEmptyStateHtml();
  renderPurchaseMobileCards(slice);
}

function purchaseEntitlement(purchaseId){
  return entitlements.find(e=>e.purchaseId===purchaseId)||null;
}
function purchaseDatasetReady(name){
  return loadedDatasets.has(name)&&!(typeof staleCachedDatasets==='object'&&staleCachedDatasets.has(name))&&(!(typeof datasetHasCurrentRequestKey==='function')||datasetHasCurrentRequestKey(name));
}
function ensurePurchaseDataset(name,afterLoad,errorText){
  if(purchaseDatasetReady(name))return false;
  ensureDatasetsByName([name]).then(afterLoad).catch(e=>{
    console.error(name+' load failed',e);
    toast(errorText||'课包数据加载失败，请刷新后重试','error');
  });
  return true;
}
function ensureFullPurchaseData(afterLoad){
  return ensurePurchaseDataset('purchasesPage',afterLoad,'购买详情加载失败，请刷新后重试');
}
function purchaseHasLedger(purchaseId){
  const unified=purchaseUnifiedRows().find(row=>String(row.id||'')===String(purchaseId||''));
  if(unified?.hasLedger||Number(unified?.ledgerCount||0)>0)return true;
  const entIds=new Set(entitlements.filter(e=>e.purchaseId===purchaseId).map(e=>e.id));
  return entitlementLedger.some(l=>entIds.has(l.entitlementId));
}
function purchaseGiftBenefitRows(purchaseId){
  return membershipBenefitLedger.filter(row=>String(row.sourcePurchaseId||row.purchaseId||'')===String(purchaseId||'')&&Number(row.delta||0)!==0&&row.studentId);
}
function purchaseGiftBenefitsConsumed(purchaseId){
  const gifts=purchaseGiftBenefitRows(purchaseId).filter(row=>Number(row.delta||0)>0);
  if(!gifts.length)return false;
  const studentIds=new Set(gifts.map(row=>String(row.studentId||'')).filter(Boolean));
  const benefitCodes=new Set(gifts.map(row=>String(row.benefitCode||'')).filter(Boolean));
  const totalByKey=new Map();
  const giftByKey=new Map();
  const consumedByKey=new Map();
  membershipBenefitLedger.filter(row=>studentIds.has(String(row.studentId||''))&&benefitCodes.has(String(row.benefitCode||''))).forEach(row=>{
    const key=`${row.studentId}|${row.benefitCode}`;
    const delta=Number(row.delta)||0;
    if(delta>0)totalByKey.set(key,(totalByKey.get(key)||0)+delta);
    if(delta>0&&String(row.sourcePurchaseId||row.purchaseId||'')===String(purchaseId||''))giftByKey.set(key,(giftByKey.get(key)||0)+delta);
    if(delta<0)consumedByKey.set(key,(consumedByKey.get(key)||0)+Math.abs(delta));
  });
  for(const [key,giftTotal] of giftByKey.entries()){
    const otherTotal=(totalByKey.get(key)||0)-giftTotal;
    if((consumedByKey.get(key)||0)>otherTotal)return true;
  }
  return false;
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
function purchaseSnapshotField(label,value,changed=false,options={}){
  const cls=`schedule-detail-field ${options.full?'full-width':''}`.trim();
  const flag=changed?'<span class="purchase-snapshot-change-tag">已变更</span>':'';
  return `<div class="${cls}"><div class="schedule-detail-label">${esc(label)}${flag}</div><div class="schedule-detail-value">${esc(detailDrawerEmpty(value))}</div></div>`;
}
function purchaseCompareText(value){
  return String(value??'').trim();
}
function purchaseCompareList(values,mapper=v=>v){
  return parseArr(values).map(mapper).map(v=>String(v||'').trim()).filter(Boolean).sort().join('|');
}
function purchaseCompareWindows(values){
  return parseArr(values).map(w=>typeof packageTimeWindowText==='function'?packageTimeWindowText(w):[w.startTime,w.endTime].filter(Boolean).join(' - ')).filter(Boolean).sort().join('|');
}
function purchaseSnapshotChanged(snapshot,current,kind='text'){
  if(!current||!String(current.id||'').trim())return false;
  if(kind==='list')return purchaseCompareList(snapshot) !== purchaseCompareList(current);
  if(kind==='coachList')return purchaseCompareList(snapshot,coachName) !== purchaseCompareList(current,coachName);
  if(kind==='campusList')return purchaseCompareList(snapshot,cn) !== purchaseCompareList(current,cn);
  if(kind==='windows')return purchaseCompareWindows(snapshot) !== purchaseCompareWindows(current);
  if(kind==='number')return Number(snapshot||0)!==Number(current||0);
  if(kind==='coach')return coachName(snapshot)!==coachName(current);
  return purchaseCompareText(snapshot)!==purchaseCompareText(current);
}
function purchasePackageSnapshotDrawerFields(p){
  const currentPkg=packages.find(row=>String(row.id||'')===String(p.packageId||p.priceSourceId||''))||{};
  const meta=purchaseDisplayPackageMeta(p);
  const currentMeta=currentPkg.id?purchaseDisplayPackageMeta({...p,...currentPkg,id:p.id}):{};
  const unit=packageLessonUnitLabel(meta);
  const unitName=unit==='次'?'次数':'课时';
  const coachText=parseArr(p.coachNames).map(coachName).filter(Boolean).join('、')||'不限';
  const campusText=parseArr(p.campusIds).map(id=>cn(id)).join('、')||'不限';
  const windows=parseArr(p.dailyTimeWindows).map(w=>typeof packageTimeWindowText==='function'?packageTimeWindowText(w):[w.startTime,w.endTime].filter(Boolean).join(' - ')).filter(Boolean).join('、')||'全天';
  const snapshotName=standardPackageLabel(meta,true)||meta.packageName;
  const currentName=currentPkg.id?(standardPackageLabel(currentMeta,true)||currentPkg.name):'';
  return [
    purchaseSnapshotField('课包名称',snapshotName,purchaseSnapshotChanged(snapshotName,currentName)),
    purchaseSnapshotField('归属教练',coachName(p.ownerCoach),purchaseSnapshotChanged(p.ownerCoach,currentPkg.ownerCoach,'coach')),
    purchaseSnapshotField('可上课教练',coachText,purchaseSnapshotChanged(p.coachNames,currentPkg.coachNames||currentPkg.allowedCoaches,'coachList')),
    purchaseSnapshotField(`课包${unitName}`,`${parseInt(meta.packageLessons)||0} ${unit}`,purchaseSnapshotChanged(meta.packageLessons,currentPkg.lessons,'number')),
    purchaseSnapshotField('课包标价',`¥${fmt(p.packagePrice)}`,purchaseSnapshotChanged(p.packagePrice,currentPkg.price,'number')),
    purchaseSnapshotField('时段类型',packageTimeBandShortLabel(meta.packageTimeBand||meta.timeBand||'全天'),purchaseSnapshotChanged(meta.packageTimeBand||meta.timeBand,currentPkg.timeBand)),
    purchaseSnapshotField('每日时段',windows,purchaseSnapshotChanged(p.dailyTimeWindows,currentPkg.dailyTimeWindows,'windows')),
    purchaseSnapshotField('可用校区',campusText,purchaseSnapshotChanged(p.campusIds,currentPkg.campusIds,'campusList')),
    purchaseSnapshotField('使用开始',p.usageStartDate,purchaseSnapshotChanged(p.usageStartDate,currentPkg.usageStartDate)),
    purchaseSnapshotField('使用结束',p.usageEndDate,purchaseSnapshotChanged(p.usageEndDate,currentPkg.usageEndDate))
  ].join('');
}
function purchaseGiftSummaryDrawerFields(p,ent){
  const meta=purchaseDisplayPackageMeta({...p,...(ent||{})});
  const unit=packageLessonUnitLabel(meta);
  const giftLessons=Number(p.giftLessons||ent?.giftLessons)||0;
  const baseLessons=Number(p.packageLessons)||Math.max(0,Number(meta.totalLessons||0)-giftLessons);
  const rows=purchaseGiftBenefitRows(p.id).filter(row=>Number(row.delta||0)>0);
  const benefitText=rows.map(row=>`${row.benefitLabel||row.benefitCode} ${lessonQty(row.delta)}${row.unit||'次'}`).join('、')||'无';
  return [
    renderDetailDrawerField('课包原课时',`${lessonQty(baseLessons)} ${unit}`),
    renderDetailDrawerField('赠送课时',giftLessons>0?`${lessonQty(giftLessons)} ${unit}`:'无'),
    renderDetailDrawerField('最终可用',`${lessonQty(meta.totalLessons||baseLessons)} ${unit}`),
    renderDetailDrawerField('赠送权益',benefitText,{full:true}),
    renderDetailDrawerField('赠送原因',p.giftReason||'')
  ].join('');
}
function purchaseLedgerHtml(purchaseId){
  const entIds=new Set(entitlements.filter(e=>e.purchaseId===purchaseId).map(e=>e.id));
  const rows=aggregateHistoricalMonthlyLedgerRows(dedupeEntitlementLedgerForDisplay(entitlementLedger.filter(l=>String(l.purchaseId||'')===String(purchaseId||'')||entIds.has(l.entitlementId)))).sort((a,b)=>String(entitlementLedgerSortDate(b)||'').localeCompare(String(entitlementLedgerSortDate(a)||''))).slice(0,10);
  if(!rows.length)return '<div class="finput" style="min-height:42px">暂无扣课记录</div>';
  return `<div class="finput" style="min-height:42px;white-space:normal;line-height:1.7">${rows.map(l=>{
    const ent=entitlements.find(e=>e.id===l.entitlementId)||{};
    const unit=packageBalanceUnitLabel({...ent,...l,packageName:ent.packageName||l.packageName||''});
    return `${(Number(l.lessonDelta)||0)>0?'退回':'扣减'} ${lessonQty(Math.abs(Number(l.lessonDelta)||0))} ${unit} · ${esc(renderStandardEmptyText(l.reason))} · ${renderStandardEmptyText(entitlementLedgerDisplayDate(l))}`;
  }).join('<br>')}</div>`;
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
function purchaseGiftPreviewHtml(){
  const packageId=document.getElementById('pur_packageId')?.value||'';
  const pkg=packages.find(x=>x.id===packageId)||{};
  const baseLessons=Number(pkg.lessons)||0;
  const giftLessons=Number(document.getElementById('pur_giftLessons')?.value)||0;
  const courtCount=parseInt(document.getElementById('pur_courtBookingGiftCount')?.value)||0;
  const machineCount=parseInt(document.getElementById('pur_ballMachineGiftCount')?.value)||0;
  const amount=Number(document.getElementById('pur_amountPaid')?.value)||0;
  return `<div class="membership-drawer-preview">课包课时：${lessonQty(baseLessons)} 节<br>赠送课时：${lessonQty(giftLessons)} 节<br>最终可用：${lessonQty(baseLessons+giftLessons)} 节<br>赠送权益：${courtCount?`订场 ${courtCount} 次`:''}${courtCount&&machineCount?'；':''}${machineCount?`发球机 ${machineCount} 次`:''}${!courtCount&&!machineCount?'无':''}<br>实收金额：¥${fmt(amount)}<br>财务收入仍按实收金额计算</div>`;
}
function refreshPurchaseGiftPreview(){
  const el=document.getElementById('purchaseGiftPreview');
  if(el)el.innerHTML=purchaseGiftPreviewHtml();
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
  if(prefix==='pur')refreshPurchaseGiftPreview();
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
  if(prefix==='pur')refreshPurchaseGiftPreview();
}
function purchasePriceSummaryHtml(p){
  const systemAmount=Number(p.systemAmount??p.packagePrice??0)||0;
  const finalAmount=Number(p.finalAmount??p.amountPaid??systemAmount)||0;
  const overrideReason=String(p.overrideReason||'').trim();
  return `<div class="fg"><div class="flabel">系统价格</div><div class="finput">¥${fmt(systemAmount)}</div></div><div class="fg"><div class="flabel">成交金额</div><div class="finput">¥${fmt(finalAmount)}</div></div><div class="fg"><div class="flabel">是否改价</div><div class="finput">${systemAmount!==finalAmount?'是':'否'}</div></div><div class="fg full"><div class="flabel">改价原因</div><div class="finput" style="min-height:42px">${esc(renderStandardEmptyText(overrideReason))}</div></div>`;
}
function purchaseDrawerAvatar(name){
  const raw=String(name||'').trim();
  return raw?raw.slice(0,1):'购';
}
function purchaseDrawerHeaderHtml({title='购买记录',avatar='',subtitle='',statusText='',statusClass=''}={}){
  const status=statusText?`<span class="schedule-detail-status ${statusClass}">${esc(statusText)}</span>`:'';
  return renderDetailDrawerHero({title,avatar:avatar||purchaseDrawerAvatar(title),subtitle,statusHtml:status});
}
function openPurchaseDrawer(titleHtml,bodyHtml,data={}){
  openStandardDetailDrawer({
    titleHtml,
    bodyHtml,
    actionsHtml:'',
    data,
    overlayClasses:['schedule-drawer-overlay'],
    modalClass:'modal modal-court modal-schedule-drawer modal-purchase-drawer'
  });
}
function purchaseDrawerActions(cancelOnclick,saveOnclick,saveId,saveText='保存'){
  return `<div class="schedule-detail-card-actions"><button type="button" class="schedule-detail-action muted" onclick="${cancelOnclick}">取消</button><button type="button" class="schedule-detail-action primary btn-save" id="${saveId}" onclick="${saveOnclick}">${saveText}</button></div>`;
}
function purchasePriceSummaryDrawerFields(p){
  const systemAmount=Number(p.systemAmount??p.packagePrice??0)||0;
  const finalAmount=Number(p.finalAmount??p.amountPaid??systemAmount)||0;
  const overrideReason=String(p.overrideReason||'').trim();
  return [
    renderDetailDrawerField('系统价格',`¥${fmt(systemAmount)}`),
    renderDetailDrawerField('成交金额',`¥${fmt(finalAmount)}`),
    renderDetailDrawerField('是否改价',systemAmount!==finalAmount?'是':'否'),
    renderDetailDrawerField('改价原因',overrideReason)
  ].join('');
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
  if(ensurePurchaseDataset('packageCenterPage',()=>openPurchaseModal(studentId)))return;
  const stu=studentId?students.find(x=>x.id===studentId):null;
  if(studentId&&!stu){toast('学员不存在','error');return;}
  editId=null;
  const payOptions=PAY_METHODS.map(t=>({value:t,label:t}));
  const ownerOptions=[{value:'',label:'未分配'},...activeCoachNames().map(name=>({value:name,label:name}))];
  const studentSearchValue=stu?(stu.phone?`${stu.name} · ${stu.phone}`:stu.name):'';
  const actions=purchaseDrawerActions('closeModal()','savePurchase()','purchaseSaveBtn');
  const studentForm=`<div class="tms-form-row"><div class="tms-form-item full-width"><label class="tms-form-label">学员 *</label><input type="hidden" id="pur_studentId" value="${esc(stu?.id||'')}"><input class="finput tms-form-control" id="pur_studentSearch" value="${esc(studentSearchValue)}" placeholder="搜索姓名 / 手机号 / 校区 / 教练" oninput="renderPurchaseStudentPicker()"><div id="pur_studentPickerWrap" style="margin-top:8px">${purchaseStudentPickerHtml(stu?.id||'',studentSearchValue)}</div></div></div>`;
  const purchaseForm=`<div class="tms-form-row purchase-compact-row"><div class="tms-form-item" style="flex:2"><label class="tms-form-label">选择课包 *</label>${renderCoursePackagePickerDropdownHtml('pur_packageId','选择课包',packages.filter(p=>p.status!=='inactive'&&p.status!=='merged'),'',{includeCoach:true,onchange:'onPurchasePackageChange'})}</div><div class="tms-form-item"><label class="tms-form-label">归属教练</label>${renderStandardDropdownHtml('pur_ownerCoach','归属教练',ownerOptions,coachName(stu?.primaryCoach),true)}</div></div><div class="tms-form-row purchase-compact-row"><div class="tms-form-item"><label class="tms-form-label">支付日期</label>${courtDateButtonHtml('pur_purchaseDate',today(),'支付日期')}</div><div class="tms-form-item"><label class="tms-form-label">系统价格</label><input class="finput tms-form-control" id="pur_systemAmount" type="number" value="0" readonly></div><div class="tms-form-item"><label class="tms-form-label">实收金额</label><input class="finput tms-form-control" id="pur_amountPaid" type="number" value="0" oninput="purchasePriceOverrideChanged('pur')"></div><div class="tms-form-item"><label class="tms-form-label">支付方式</label>${renderStandardDropdownHtml('pur_payMethod','支付方式',payOptions,'微信',true)}</div></div><div class="tms-form-row" id="pur_overrideReasonWrap" style="display:none"><div class="tms-form-item full-width"><label class="tms-form-label">改价原因</label><input class="finput tms-form-control" id="pur_overrideReason" placeholder="实际成交价与系统价格不一致时必填"></div></div><div class="tms-form-row" style="margin-bottom:0"><div class="tms-form-item full-width"><label class="tms-form-label">可上课教练</label><div class="tms-checkbox-matrix purchase-coach-picker">${purchaseAllowedCoachChecks([], 'pur-allowed-coach-cb')}</div></div></div>`;
  const giftForm=`<div id="purchaseGiftPreview">${purchaseGiftPreviewHtml()}</div><div class="tms-form-row"><div class="tms-form-item"><label class="tms-form-label">赠送课时</label><input class="finput tms-form-control" id="pur_giftLessons" type="number" min="0" step="0.5" value="0" oninput="refreshPurchaseGiftPreview()"></div><div class="tms-form-item"><label class="tms-form-label">订场权益</label><input class="finput tms-form-control" id="pur_courtBookingGiftCount" type="number" min="0" step="1" value="0" oninput="refreshPurchaseGiftPreview()"></div><div class="tms-form-item"><label class="tms-form-label">发球机权益</label><input class="finput tms-form-control" id="pur_ballMachineGiftCount" type="number" min="0" step="1" value="0" oninput="refreshPurchaseGiftPreview()"></div></div><div class="tms-form-row" style="margin-bottom:0"><div class="tms-form-item full-width"><label class="tms-form-label">赠送原因</label><input class="finput tms-form-control" id="pur_giftReason" value="课包购买赠送权益"></div></div>`;
  const notesForm=`<div class="tms-form-row purchase-notes-row" style="margin-bottom:0"><div class="tms-form-item full-width"><label class="tms-form-label">备注</label><textarea class="finput tms-form-control" id="pur_notes"></textarea></div></div>`;
  const body=renderDetailDrawerContent([
    renderDetailDrawerFormCard('学员信息',studentForm,actions),
    renderDetailDrawerFormCard('购买信息',purchaseForm),
    renderDetailDrawerFormCard('本次赠送',giftForm),
    renderDetailDrawerFormCard('备注',notesForm)
  ].join(''));
  openPurchaseDrawer(
    purchaseDrawerHeaderHtml({title:'课包购买',avatar:purchaseDrawerAvatar(stu?.name),subtitle:stu?studentSearchValue:'新增购买记录',statusText:'新建',statusClass:'tms-tag-green'}),
    body,
    {purchaseDetailId:''}
  );
  fillPurchasePackageMeta();
  refreshPurchaseGiftPreview();
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
function setPurchaseDetailTab(tab){
  const id=document.getElementById('overlay')?.dataset.purchaseDetailId||'';
  if(id)openPurchaseDetailModal(id,['deal','balance','rules'].includes(tab)?tab:'deal');
}
function openPurchaseDetailModal(id,tab='deal'){
  if(ensureFullPurchaseData(()=>openPurchaseDetailModal(id,tab)))return;
  const p=purchases.find(x=>x.id===id);if(!p){toast('购买记录不存在','error');return;}
  const activeTab=['deal','balance','rules'].includes(tab)?tab:'deal';
  const ent=purchaseEntitlement(id);
  const meta=purchaseDisplayPackageMeta(p);
  const unit=packageLessonUnitLabel(meta);
  const canManualAdjust=ent&&p.status!=='voided'&&currentUser?.role==='admin';
  const manualConsumeAction=canManualAdjust&&ent.status==='active'&&Number(ent.remainingLessons||0)>0?`<button class="btn-save" onclick="openManualEntitlementAdjustModal('${ent.id}', 'manual_consume')">手动消课</button>`:'';
  const manualReturnAction=canManualAdjust&&Number(ent.usedLessons||0)>0?`<button class="btn-save" onclick="openManualEntitlementAdjustModal('${ent.id}', 'manual_return')">退回课时</button>`:'';
  const manualActions=`${manualConsumeAction.replace('btn-save','schedule-detail-action primary')}${manualReturnAction.replace('btn-save','schedule-detail-action primary')}`;
  const editAction=p.status==='voided'?'':`<button type="button" class="schedule-detail-action" onclick="openPurchaseEditModal('${p.id}')">编辑</button>`;
  const dealFields=[
    renderDetailDrawerField('支付日期',p.purchaseDate),
    renderDetailDrawerField('学员',p.studentName),
    renderDetailDrawerField('售卖课包',standardPackageLabel(meta,true)||meta.packageName),
    purchasePriceSummaryDrawerFields(p),
    renderDetailDrawerField('归属教练',coachName(p.ownerCoach)),
    renderDetailDrawerField('可上课教练',parseArr(p.allowedCoaches).map(coachName).filter(Boolean).join('、')),
    renderDetailDrawerField('支付方式',purchasePayMethodText(p.payMethod)),
    renderDetailDrawerField('购买状态',purchaseStatusText(p)),
    renderDetailDrawerField('操作人',p.operator),
    renderDetailDrawerField('备注',p.notes)
  ].join('');
  const balanceFields=[
    renderDetailDrawerField('当前余额',ent?`${lessonQty(ent.remainingLessons)}/${lessonQty(ent.totalLessons)} ${unit}`:'-'),
    renderDetailDrawerField('余额状态',ent?entitlementStatusText(ent):'-')
  ].join('');
  const voidFields=p.status==='voided'?[
    renderDetailDrawerField('作废时间',p.voidedAt),
    renderDetailDrawerField('作废人',p.voidedBy),
    renderDetailDrawerField('作废原因',p.voidReason,{full:true})
  ].join(''):'';
  const tabs=[['deal','课包信息'],['balance','课包余额'],['rules','下单快照']];
  const giftFields=purchaseGiftSummaryDrawerFields(p,ent);
  let cards=[];
  if(activeTab==='deal'){
    cards=[renderDetailDrawerCard('课包信息',dealFields,{actionsHtml:editAction})];
    if(giftFields)cards.push(renderDetailDrawerCard('本次赠送',giftFields));
    if(voidFields)cards.push(renderDetailDrawerCard('作废信息',voidFields));
  }
  if(activeTab==='balance'){
    cards=[
      renderDetailDrawerCard('课包余额',balanceFields,{actionsHtml:manualActions}),
      renderDetailDrawerCard('扣课记录',purchaseLedgerHtml(p.id),{useGrid:false})
    ];
  }
  if(activeTab==='rules'){
    cards=[renderDetailDrawerCard('下单快照',purchasePackageSnapshotDrawerFields(p))];
  }
  openPurchaseDrawer(
    `${purchaseDrawerHeaderHtml({title:p.studentName||'购买记录',avatar:purchaseDrawerAvatar(p.studentName),subtitle:standardPackageLabel(meta,true)||meta.packageName||'',statusText:purchaseStatusText(p),statusClass:p.status==='voided'?'':'tms-tag-green'})}${renderDetailDrawerTabs(activeTab,tabs,{onClick:'setPurchaseDetailTab'})}`,
    renderDetailDrawerContent(cards.join('')),
    {purchaseDetailId:p.id}
  );
}
function openManualEntitlementAdjustModal(entitlementId, action='manual_consume', options={}){
  if(ensureFullPurchaseData(()=>openManualEntitlementAdjustModal(entitlementId,action,options)))return;
  const ent=entitlements.find(e=>e.id===entitlementId);
  if(!ent){toast('课包余额不存在','error');return;}
  const purchase=purchases.find(p=>p.id===ent.purchaseId)||{};
  const meta=purchaseDisplayPackageMeta({...purchase,...ent});
  const unit=packageLessonUnitLabel(meta);
  const isReturn=action==='manual_return';
  const max=isReturn?Number(ent.usedLessons||0):Number(ent.remainingLessons||0);
  const title=isReturn?'退回课时':'手动消课';
  const source=options?.source==='student'?'student':'purchase';
  const studentId=options?.studentId||ent.studentId||'';
  const cancelAction=source==='student'&&studentId?`openStudentDetail('${studentId}')`:`openPurchaseDetailModal('${ent.purchaseId}','balance')`;
  const actions=purchaseDrawerActions(cancelAction,`saveManualEntitlementAdjust('${entitlementId}','${action}')`,'manualEntSaveBtn');
  const summary=[
    renderDetailDrawerField('课包',standardPackageLabel(meta,true)||ent.packageName,{full:true}),
    renderDetailDrawerField('当前余额',`${lessonQty(ent.remainingLessons)}/${lessonQty(ent.totalLessons)} ${unit}`),
    renderDetailDrawerField(isReturn?'可退回':'可扣减',`${lessonQty(max)} ${unit}`)
  ].join('');
  const form=`<div class="tms-form-row"><div class="tms-form-item"><label class="tms-form-label">${isReturn?'退回':'消课'}数量 *</label><input class="finput tms-form-control" id="manual_ent_count" type="number" min="0.5" step="0.5" max="${max}" value="1"></div><div class="tms-form-item"><label class="tms-form-label">${isReturn?'退回':'消课'}日期 *</label>${courtDateButtonHtml('manual_ent_date',today(),`${title}日期`)}</div></div><div class="tms-form-row"><div class="tms-form-item full-width"><label class="tms-form-label">备注 *</label><textarea class="finput tms-form-control" id="manual_ent_reason" placeholder="${isReturn?'例如：误扣课时退回':'例如：补录历史上课记录'}"></textarea></div></div>`;
  const body=renderDetailDrawerContent([
    renderDetailDrawerCard('课包余额',summary),
    renderDetailDrawerFormCard(title,form,actions)
  ].join(''));
  openPurchaseDrawer(
    purchaseDrawerHeaderHtml({title,avatar:purchaseDrawerAvatar(purchase.studentName),subtitle:standardPackageLabel(meta,true)||ent.packageName||''}),
    body,
    {purchaseDetailId:ent.purchaseId||'',manualAdjustSource:source,studentDetailId:studentId}
  );
}
function patchManualEntitlementAdjustResult(result){
  if(result?.entitlement){
    const i=entitlements.findIndex(e=>e.id===result.entitlement.id);
    if(i>=0)entitlements[i]=result.entitlement;else entitlements.unshift(result.entitlement);
  }
  if(result?.ledger)entitlementLedger.unshift(result.ledger);
}
async function saveManualEntitlementAdjust(entitlementId, action){
  const overlay=document.getElementById('overlay');
  const source=overlay?.dataset.manualAdjustSource||'purchase';
  const studentId=overlay?.dataset.studentDetailId||entitlements.find(e=>e.id===entitlementId)?.studentId||'';
  const count=Math.abs(Number(document.getElementById('manual_ent_count')?.value)||0);
  const relatedDate=document.getElementById('manual_ent_date')?.value||'';
  const reason=(document.getElementById('manual_ent_reason')?.value||'').trim();
  if(!count){toast('请输入数量','warn');return;}
  if(!relatedDate){toast('请选择日期','warn');return;}
  if(!reason){toast('请填写备注','warn');return;}
  await runStandardMutation('manualEntSaveBtn',async()=>{
    const data={action,count,relatedDate,reason};
    const result=await apiCall('POST',`/entitlements/${entitlementId}/manual-adjust`,data);
    patchManualEntitlementAdjustResult(result);
    if(typeof markLearningDataStale==='function')markLearningDataStale();
    return result;
  },{
    successText:'已保存',
    refresh:(result={})=>{
    if(source==='student'&&studentId){
      studentDetailActiveTab='orders';
      openStudentDetail(studentId);
    }else{
      openPurchaseDetailModal(result.entitlement?.purchaseId||entitlements.find(e=>e.id===entitlementId)?.purchaseId||'','balance');
    }
    renderStudents();
    renderEntitlements();
    if(currentPage==='purchases')renderPurchases();
    }
  });
}
function openPurchaseEditModal(id){
  if(ensureFullPurchaseData(()=>openPurchaseEditModal(id)))return;
  const p=purchases.find(x=>x.id===id);if(!p){toast('购买记录不存在','error');return;}
  const locked=purchaseHasLedger(id);
  const studentOptions=students.map(s=>({value:s.id,label:`${s.name}${s.phone?` · ${s.phone}`:''}`}));
  const payOptions=PAY_METHODS.map(t=>({value:t,label:t}));
  const ownerOptions=[{value:'',label:'未分配'},...activeCoachNames().map(name=>({value:name,label:name}))];
  const actions=purchaseDrawerActions(`openPurchaseDetailModal('${p.id}')`,`savePurchaseEdit('${p.id}')`,'purchaseEditSaveBtn');
  const purchaseForm=`${locked?'<div class="inline-help package-drawer-danger-help">该购买记录已有课时消耗，不能修改学员、课包或权益规则。</div>':''}<div class="tms-form-row"><div class="tms-form-item"><label class="tms-form-label">学员 *</label>${renderStandardDropdownHtml('pur_edit_studentId','选择学员',studentOptions,p.studentId,true)}</div><div class="tms-form-item"><label class="tms-form-label">选择课包 *</label>${renderCoursePackagePickerDropdownHtml('pur_edit_packageId','选择课包',packages.filter(pkg=>(pkg.status!=='inactive'&&pkg.status!=='merged')||pkg.id===p.packageId),p.packageId,{includeCoach:true,onchange:'onPurchaseEditPackageChange'})}</div></div><div class="tms-form-row"><div class="tms-form-item"><label class="tms-form-label">支付日期</label>${courtDateButtonHtml('pur_edit_purchaseDate',p.purchaseDate||today(),'支付日期')}</div><div class="tms-form-item"><label class="tms-form-label">归属教练</label>${renderStandardDropdownHtml('pur_edit_ownerCoach','归属教练',ownerOptions,coachName(p.ownerCoach),true)}</div></div><div class="tms-form-row"><div class="tms-form-item"><label class="tms-form-label">系统价格</label><input class="finput tms-form-control" id="pur_edit_systemAmount" type="number" value="${Number(p.systemAmount??p.packagePrice??0)||0}" readonly></div><div class="tms-form-item"><label class="tms-form-label">实收金额</label><input class="finput tms-form-control" id="pur_edit_amountPaid" type="number" value="${parseFloat(p.finalAmount??p.amountPaid)||0}" oninput="purchasePriceOverrideChanged('pur_edit')"></div></div><div class="tms-form-row"><div class="tms-form-item"><label class="tms-form-label">支付方式</label>${renderStandardDropdownHtml('pur_edit_payMethod','支付方式',payOptions,purchasePayMethodText(p.payMethod),true)}</div><div class="tms-form-item" id="pur_edit_overrideReasonWrap" style="display:${Number(p.systemAmount??p.packagePrice??0)!==Number(p.finalAmount??p.amountPaid??0)?'block':'none'}"><label class="tms-form-label">改价原因</label><input class="finput tms-form-control" id="pur_edit_overrideReason" value="${esc(p.overrideReason||'')}" placeholder="实际成交价不一致时必填"></div></div><div class="tms-form-row" style="margin-bottom:0"><div class="tms-form-item"><label class="tms-form-label">可上课教练</label><div class="tms-checkbox-matrix purchase-coach-picker">${purchaseAllowedCoachChecks(p.allowedCoaches, 'pur-edit-allowed-coach-cb')}</div></div><div class="tms-form-item"><label class="tms-form-label">备注</label><textarea class="finput tms-form-control" id="pur_edit_notes">${esc(p.notes||'')}</textarea></div></div>`;
  const body=renderDetailDrawerContent([
    renderDetailDrawerFormCard('购买信息',purchaseForm,actions)
  ].join(''));
  const meta=purchaseDisplayPackageMeta(p);
  openPurchaseDrawer(
    purchaseDrawerHeaderHtml({title:'编辑购买记录',avatar:purchaseDrawerAvatar(p.studentName),subtitle:[p.studentName,standardPackageLabel(meta,true)||meta.packageName].filter(Boolean).join(' · '),statusText:purchaseStatusText(p)}),
    body,
    {purchaseDetailId:p.id}
  );
  if(locked){
    ['pur_edit_studentId_dropdown','pur_edit_packageId_dropdown'].forEach(id=>{
      const el=document.getElementById(id);
      if(el){el.style.pointerEvents='none';el.style.opacity='0.6';}
    });
    document.querySelectorAll('.pur-edit-allowed-coach-cb').forEach(cb=>{cb.disabled=true;});
  }
  fillPurchaseEditPackageMeta();
}
function fillPurchaseEditPackageMeta(){
  syncPurchasePriceFields('pur_edit');
  purchasePriceOverrideChanged('pur_edit');
}
async function savePurchaseEdit(id){
  const btn=document.getElementById('purchaseEditSaveBtn');
  const data={studentId:document.getElementById('pur_edit_studentId')?.value||'',packageId:document.getElementById('pur_edit_packageId')?.value||'',ownerCoach:document.getElementById('pur_edit_ownerCoach')?.value||'',allowedCoaches:[...document.querySelectorAll('.pur-edit-allowed-coach-cb:checked')].map(cb=>cb.value),purchaseDate:document.getElementById('pur_edit_purchaseDate')?.value||'',amountPaid:parseFloat(document.getElementById('pur_edit_amountPaid')?.value)||0,overrideReason:document.getElementById('pur_edit_overrideReason')?.value.trim()||'',payMethod:document.getElementById('pur_edit_payMethod')?.value||'',notes:document.getElementById('pur_edit_notes')?.value.trim()||''};
  const systemAmount=Number(document.getElementById('pur_edit_systemAmount')?.value)||0;
  if(systemAmount!==Number(data.amountPaid||0)&&!data.overrideReason){toast('请填写改价原因','warn');if(btn){btn.disabled=false;btn.textContent='保存';}return;}
  await runStandardMutation(btn,async()=>{
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
    if(typeof markLearningDataStale==='function')markLearningDataStale();
  },{
    successText:'购买记录已更新',
    closeOnSuccess:true,
    refresh:async()=>{
      loadedDatasets.delete('purchasesPage');
      await ensureDatasetsByName(['packageCenterPage','customerCenterPage'],{force:true});
      renderStudents();
      renderPurchases();
      renderEntitlements();
    }
  });
}
function openPurchaseVoidModal(id){
  if(ensureFullPurchaseData(()=>openPurchaseVoidModal(id)))return;
  const p=purchases.find(x=>x.id===id);if(!p){toast('购买记录不存在','error');return;}
  const ent=purchaseEntitlement(id);
  const meta=purchaseDisplayPackageMeta(p);
  const unit=packageLessonUnitLabel(meta);
  const giftRows=membershipBenefitLedger.filter(row=>String(row.sourcePurchaseId||row.purchaseId||'')===String(id||'')&&Number(row.delta||0)>0);
  const consumedGift=purchaseGiftBenefitsConsumed(id);
  const blocked=purchaseHasLedger(id)||consumedGift;
  const blockedText=consumedGift?'本次赠送权益已被消耗，不能直接作废':'该购买记录已有课时消耗，不能直接作废。';
  const giftImpact=giftRows.length?`本次赠送权益将同步撤回：${giftRows.map(row=>`${row.benefitLabel||row.benefitCode} ${row.delta}${row.unit||'次'}`).join('、')}。`:'本次没有赠送订场/发球机权益。';
  const summary=[
    renderDetailDrawerField('学员',p.studentName),
    renderDetailDrawerField('售卖课包',standardPackageLabel(meta,true)||meta.packageName,{full:true}),
    renderDetailDrawerField('购买日期',p.purchaseDate),
    renderDetailDrawerField('实收金额',`¥${fmt(p.amountPaid)}`),
    renderDetailDrawerField('影响范围',ent?`将同步作废课包余额「${standardPackageLabel(meta,true)||meta.packageName}」，当前剩余 ${lessonQty(ent.remainingLessons)}/${lessonQty(ent.totalLessons)} ${unit}。`:'未找到对应课包余额。',{full:true}),
    renderDetailDrawerField('赠送权益',giftImpact,{full:true}),
    blocked?renderDetailDrawerField('当前状态',blockedText,{full:true}):''
  ].join('');
  const actions=blocked
    ?`<div class="schedule-detail-card-actions"><button type="button" class="schedule-detail-action muted" onclick="openPurchaseDetailModal('${p.id}')">返回</button></div>`
    :`<div class="schedule-detail-card-actions"><button type="button" class="schedule-detail-action muted" onclick="openPurchaseDetailModal('${p.id}')">取消</button><button type="button" class="schedule-detail-action primary btn-save" onclick="voidPurchase('${p.id}')">确认作废</button></div>`;
  const reasonForm=blocked?'':`<div class="tms-form-row"><div class="tms-form-item full-width"><label class="tms-form-label">作废原因</label><textarea class="finput tms-form-control" id="pur_void_reason" placeholder="例如：录错学员、重复购买、实际未付款"></textarea></div></div>`;
  const body=renderDetailDrawerContent([
    renderDetailDrawerCard('作废确认',summary),
    renderDetailDrawerFormCard('作废原因',reasonForm,actions)
  ].join(''));
  openPurchaseDrawer(
    purchaseDrawerHeaderHtml({title:'作废购买记录',avatar:purchaseDrawerAvatar(p.studentName),subtitle:[p.studentName,standardPackageLabel(meta,true)||meta.packageName].filter(Boolean).join(' · '),statusText:blocked?'不可作废':'待确认'}),
    body,
    {purchaseDetailId:p.id}
  );
}
async function voidPurchase(id){
  const reason=document.getElementById('pur_void_reason')?.value.trim()||'';
  if(!reason){toast('请填写作废原因','warn');return;}
  await runStandardMutation(document.querySelector('.btn-save'),async()=>{
    const result=await apiCall('DELETE','/purchases/'+id,{reason});
    patchPurchaseVoidResult(id,reason);
    const rows=Array.isArray(result?.benefitLedgerRows)?result.benefitLedgerRows:[];
    rows.filter(Boolean).forEach(x=>membershipBenefitLedger.unshift(x));
    if(typeof markLearningDataStale==='function')markLearningDataStale();
  },{
    loadingText:'作废中…',
    errorPrefix:'作废失败',
    successText:'购买记录已作废',
    closeOnSuccess:true,
    refresh:async()=>{
      loadedDatasets.delete('purchasesPage');
      await ensureDatasetsByName(['packageCenterPage','customerCenterPage'],{force:true});
      renderStudents();
      renderPurchases();
      renderEntitlements();
    }
  });
}
async function savePurchase(){
  const studentId=document.getElementById('pur_studentId').value;
  if(!studentId){toast('请选择学员','warn');return;}
  const packageId=document.getElementById('pur_packageId').value;
  if(!packageId){toast('请选择课包','warn');return;}
  const btn=document.getElementById('purchaseSaveBtn');
  const data={studentId,packageId,ownerCoach:document.getElementById('pur_ownerCoach')?.value||'',allowedCoaches:[...document.querySelectorAll('.pur-allowed-coach-cb:checked')].map(cb=>cb.value),purchaseDate:document.getElementById('pur_purchaseDate').value,amountPaid:parseFloat(document.getElementById('pur_amountPaid').value)||0,overrideReason:document.getElementById('pur_overrideReason')?.value.trim()||'',payMethod:document.getElementById('pur_payMethod').value,giftLessons:parseFloat(document.getElementById('pur_giftLessons')?.value)||0,courtBookingGiftCount:parseInt(document.getElementById('pur_courtBookingGiftCount')?.value)||0,ballMachineGiftCount:parseInt(document.getElementById('pur_ballMachineGiftCount')?.value)||0,giftReason:document.getElementById('pur_giftReason')?.value.trim()||'',notes:document.getElementById('pur_notes').value.trim()};
  const systemAmount=Number(document.getElementById('pur_systemAmount')?.value)||0;
  if(systemAmount!==Number(data.amountPaid||0)&&!data.overrideReason){toast('请填写改价原因','warn');if(btn){btn.disabled=false;btn.textContent='保存';}return;}
  await runStandardMutation(btn,async()=>{
    const res=await apiCall('POST','/purchases',data);
    if(res.purchase)purchases.unshift(res.purchase);
    if(res.entitlement)entitlements.unshift(res.entitlement);
    if(Array.isArray(res.benefitLedgerRows))res.benefitLedgerRows.filter(Boolean).forEach(x=>membershipBenefitLedger.unshift(x));
    if(typeof markLearningDataStale==='function')markLearningDataStale();
  },{
    successText:'购买成功',
    closeOnSuccess:true,
    refresh:async()=>{
      loadedDatasets.delete('purchasesPage');
      await ensureDatasetsByName(['packageCenterPage','customerCenterPage','lifecycleMetricsPage'],{force:true});
      renderStudents();
      renderPurchases();
      renderEntitlements();
      if(currentPage==='leads')renderLeads();
    }
  });
}
function focusPurchaseByPackage(packageId,ownerCoach=''){
  purPackageFilterValue=String(packageId||'');
  purOwnerCoachFilterValue=coachName(ownerCoach||'');
  clearPurchasePageFiltersForPackageFocus();
  goPage('purchases');
  const pkg=packages.find(p=>String(p.id||'')===String(packageId||''));
  setStandardDropdownValue('purPackageFilter',packageId,standardPackageLabel(pkg||{},true)||pkg?.name||packageId);
  purPage=standardListFirstPage();
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
    return [p.purchaseDate||'',p.studentName||'',standardPackageLabel(p,true)||p.packageName||'',p.courseType||'',parseFloat(p.amountPaid)||0,Number(ent.remainingLessons)||0,Number(ent.totalLessons)||0,ent.validFrom||'',ent.validUntil||'',purchasePayMethodText(p.payMethod)||'',purchaseStatusText(p),'"'+String(p.notes||'').replace(/"/g,'""')+'"'].join(',');
  }).join('\n');
  const blob=new Blob(['\ufeff'+csv],{type:'text/csv;charset=utf-8;'});
  const a=document.createElement('a');a.href=URL.createObjectURL(blob);a.download='FlowTennis_购买记录_'+today()+'.csv';a.click();toast('导出成功','success');
}
