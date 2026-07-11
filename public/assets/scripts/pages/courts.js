// ===== 订场用户 =====
function renderCourtHeaderFilters(base,filterSource=null){
  const ownerHost=document.getElementById('courtOwnerFilter');
  const accountHost=document.getElementById('courtAccountTypeFilter');
  const moreHost=document.getElementById('courtMoreActions');
  const pageSizeHost=document.getElementById('courtPageSize');
  const owners=Array.isArray(filterSource?.owners)&&filterSource.owners.length
    ? filterSource.owners.map(v=>String(v||'').trim()).filter(Boolean)
    : [...new Set(base.map(c=>String(courtFollowOwnerText(c)||'').trim()).filter(Boolean))];
  const accountTypes=['会员账户','普通账户'];
  const ownerOpts=[{value:'',label:'全部',emptyDisplay:'跟进人'},...owners.map(v=>({value:v,label:v}))];
  const accountOpts=[{value:'',label:'全部',emptyDisplay:'账户类型'},...accountTypes.map(v=>({value:v,label:v}))];
  if(ownerHost)ownerHost.innerHTML=renderStandardDropdownHtml('courtOwnerValue','跟进人',ownerOpts,courtOwnerFilterValue,false,'onCourtToolbarFilterChange');
  if(accountHost)accountHost.innerHTML=renderStandardDropdownHtml('courtAccountTypeValue','账户类型',accountOpts,courtAccountTypeFilterValue,false,'onCourtToolbarFilterChange');
  if(moreHost)moreHost.innerHTML=renderStandardDropdownHtml('courtMoreActionValue','更多操作',[
    {value:courtBatchMode?'batch-exit':'batch-select',label:courtBatchMode?'退出批量':'批量选择'},
    {value:'import',label:'导入CSV'},
    {value:'migration',label:'财务迁移预览'},
    {value:'backup',label:'备份'}
  ],'',false,'handleCourtMoreAction');
  if(pageSizeHost)pageSizeHost.innerHTML=renderPageSizeSelectorHtml('courtPageSizeValue',courtPageSize,'setCourtPageSize');
  updateCourtBatchButton();
}
function refreshCourtTopFilters(){
  const host=document.getElementById('campusTabs');
  if(host&&currentPage==='courts')host.innerHTML=renderCourtTopFilters();
}
function renderCourtTopFilters(){
  const campusSource=typeof accessibleCampusRows==='function'?accessibleCampusRows():(Array.isArray(campuses)?campuses:[]);
  const campusOpts=[{value:'all',label:'全部校区'}].concat(campusSource.map(row=>({
    value:String(row?.code||row?.id||'').trim(),
    label:String(row?.name||row?.code||row?.id||'').trim()
  })).filter(opt=>opt.value&&opt.label));
  const campusMenu=campusOpts.map(opt=>`<div class="tms-dropdown-item ${campus===opt.value?'active':''}" data-value="${esc(opt.value)}" onclick="selectCourtTopCampus('${esc(opt.value)}',event)">${esc(opt.label)}</div>`).join('');
  const timeMenu=courtDateFilterQuickOptions().map(label=>`<div class="tms-dropdown-item ${((label==='自定义'&&courtDateRangeFilterValue==='自定义')||label===courtDateRangeFilterValue)?'active':''}" data-value="${esc(label)}" onclick="onCourtDateRangeFilterChange('${label}',event)">${esc(label)}</div>`).join('');
  const dateMenuClass=`court-top-date-menu ${courtDateRangeFilterValue==='自定义'?'is-custom':'is-quick'}`;
  const dateMenu=courtDateRangeFilterValue==='自定义'
    ? `<div class="court-date-range-shell"><div class="court-date-range-left">${timeMenu}</div><div class="court-date-range-right">${renderCourtDateRangePanel()}</div></div>`
    : timeMenu;
  return `<div class="court-top-filterbar"><div class="court-top-filter-item">${renderStandardTopDropdown('courtTopCampus',campusOpts.find(opt=>opt.value===campus)?.label||'全部校区',standardTopLocationIcon(),campusMenu,'court-top-campus-menu')}</div><div class="court-top-filter-item">${renderStandardTopDropdown('courtTopDate',currentCourtDateRangeLabel(),standardTopTimeIcon(),dateMenu,dateMenuClass)}</div></div>`;
}
function onCourtToolbarFilterChange(){
  courtOwnerFilterValue=document.getElementById('courtOwnerValue')?.value||'';
  courtAccountTypeFilterValue=document.getElementById('courtAccountTypeValue')?.value||'';
  courtPage=1;
  renderCourts();
}
function selectCourtTopCampus(value,event){
  if(event)event.stopPropagation();
  campus=value||'all';
  localStorage.setItem(CAMPUS_KEY,campus);
  courtPage=1;
  refreshCourtTopFilters();
  renderCourts();
  closeStandardTopDropdowns();
}
function isGlobalDateRangeDraftContext(){
  return typeof globalDateRangeDraftActive!=='undefined'&&globalDateRangeDraftActive&&globalTopFilterPages().includes(currentPage);
}
function courtDateRangeViewAnchor(){
  return isGlobalDateRangeDraftContext()?String(window.__globalDateRangeDraftViewAnchor||'').trim():String(window.__courtDateRangeViewAnchor||'').trim();
}
function setCourtDateRangeViewAnchor(value){
  if(isGlobalDateRangeDraftContext())window.__globalDateRangeDraftViewAnchor=value;else window.__courtDateRangeViewAnchor=value;
}
function currentCourtDateRangeLabel(){
  if(courtDateRangeFilterValue==='全部')return '全部时间';
  if(courtDateRangeFilterValue&&courtDateRangeFilterValue!=='自定义'){
    const preset=resolveCourtDatePresetRange(courtDateRangeFilterValue);
    return formatCourtDateRangeValue(preset.startDate,preset.endDate);
  }
  return courtDateRangeFilterValue==='自定义'
    ? formatCourtDateRangeValue(courtDateRangeStart,courtDateRangeEnd)
    : courtDateRangeFilterValue;
}
function activeCourtDateRange(){
  if(courtDateRangeFilterValue==='自定义'){
    return {startDate:courtDateRangeStart,endDate:courtDateRangeEnd};
  }
  if(courtDateRangeFilterValue&&courtDateRangeFilterValue!=='全部'){
    return resolveCourtDatePresetRange(courtDateRangeFilterValue);
  }
  return {startDate:'',endDate:''};
}
function renderCourtDateRangeFilter(){
  const selected=currentCourtDateRangeLabel();
  const leftMenu=courtDateFilterQuickOptions().map(label=>{
    const active=(label==='自定义'&&courtDateRangeFilterValue==='自定义')||(label===courtDateRangeFilterValue&&label!=='自定义');
    return `<div class="tms-dropdown-item ${active?'active':''}" data-value="${esc(label)}" onclick="onCourtDateRangeFilterChange('${label}',event)">${esc(label)}</div>`;
  }).join('');
  return `<div class="tms-dropdown court-date-range-dropdown ${courtDateRangeFilterValue?'has-value':''}" id="courtDateRangeValue_dropdown" data-target="courtDateRangeValue" onclick="toggleStandardDropdown('courtDateRangeValue',event)"><input type="hidden" id="courtDateRangeValue" value="${esc(courtDateRangeFilterValue)}"><div class="tms-dropdown-display">${esc(selected)}</div><div class="tms-dropdown-menu court-date-range-menu" style="touch-action:pan-y;-webkit-overflow-scrolling:touch" onwheel="event.stopPropagation();event.preventDefault();this.scrollTop += event.deltaY" ontouchmove="event.stopPropagation()"><div class="court-date-range-shell"><div class="court-date-range-left">${leftMenu}</div><div class="court-date-range-right">${renderCourtDateRangePanel()}</div></div></div></div>`;
}
function renderCourtDateRangePanel(){
  const viewDate=resolveCourtDateRangeViewDate();
  const year=viewDate.getFullYear();
  const month=viewDate.getMonth();
  const title=`${year} 年 ${month+1} 月`;
  const days=['一','二','三','四','五','六','日'].map(label=>`<div class="court-date-weekday">${label}</div>`).join('');
  const cells=renderCourtDateRangeCalendarCells(viewDate);
  const helperText=courtDateRangeFilterValue==='自定义'&&!courtDateRangeEnd?'请选择结束日期':'';
  const canConfirm=!!courtDateRangeStart&&!!courtDateRangeEnd;
  return `<div class="court-date-range-title">选择日期范围</div><div class="court-date-range-head"><button type="button" class="court-date-nav" onclick="shiftCourtDateRangeView(-1,event)">‹</button><div class="court-date-range-month">${title}</div><button type="button" class="court-date-nav" onclick="shiftCourtDateRangeView(1,event)">›</button></div><div class="court-date-range-calendar"><div class="court-date-range-week">${days}</div><div class="court-date-range-grid">${cells}</div></div><div class="court-date-range-footer"><div class="court-date-range-hint">${esc(helperText)}</div><button type="button" class="court-date-range-clear" onclick="clearCourtCustomDateRange(event)">清空</button><button type="button" class="court-date-range-confirm ${canConfirm?'is-enabled':''}" ${canConfirm?'':'disabled'} onclick="confirmCourtCustomDateRange(event)">确定</button></div></div>`;
}
function resolveCourtDateRangeViewDate(){
  const anchorText=courtDateRangeViewAnchor();
  if(anchorText){
    const anchorDate=new Date(`${anchorText}T00:00:00`);
    if(!Number.isNaN(anchorDate.getTime()))return new Date(anchorDate.getFullYear(),anchorDate.getMonth(),1);
  }
  const raw=courtDateRangeStart||today();
  const current=new Date(`${raw}T00:00:00`);
  if(Number.isNaN(current.getTime()))return new Date();
  return new Date(current.getFullYear(),current.getMonth(),1);
}
function shiftCourtDateRangeView(offset,event){
  if(event)event.stopPropagation();
  const base=resolveCourtDateRangeViewDate();
  const next=new Date(base.getFullYear(),base.getMonth()+offset,1);
  setCourtDateRangeViewAnchor(`${next.getFullYear()}-${String(next.getMonth()+1).padStart(2,'0')}-01`);
  const isGlobal=globalTopFilterPages().includes(currentPage);
  if(isGlobal)refreshGlobalTopFilters();else refreshCourtTopFilters();
  const dropdown=document.getElementById(isGlobal?'globalTopDate_dropdown':'courtTopDate_dropdown');
  if(dropdown)dropdown.classList.add('open');
}
function renderCourtDateRangeCalendarCells(viewDate){
  const anchorText=courtDateRangeViewAnchor();
  const anchorDate=anchorText?new Date(`${anchorText}T00:00:00`):null;
  const base=anchorDate&&!Number.isNaN(anchorDate.getTime())?anchorDate:viewDate;
  const year=base.getFullYear();
  const month=base.getMonth();
  const daysInMonth=new Date(year,month+1,0).getDate();
  const prevDaysInMonth=new Date(year,month,0).getDate();
  const firstDay=new Date(year,month,1).getDay();
  const blanks=(firstDay===0?6:firstDay-1);
  const cells=[];
  for(let i=0;i<blanks;i++)cells.push(`<div class="court-date-cell is-muted">${prevDaysInMonth-blanks+i+1}</div>`);
  for(let day=1;day<=daysInMonth;day++){
    const date=`${year}-${String(month+1).padStart(2,'0')}-${String(day).padStart(2,'0')}`;
    const isStart=date===courtDateRangeStart;
    const isEnd=date===courtDateRangeEnd;
    const inRange=!!courtDateRangeStart&&!!courtDateRangeEnd&&date>courtDateRangeStart&&date<courtDateRangeEnd;
    cells.push(`<button type="button" class="court-date-cell${isStart||isEnd?' is-edge':''}${inRange?' is-range':''}" onclick="pickCourtCustomDate('${date}',event)">${day}</button>`);
  }
  let nextDay=1;
  while(cells.length%7!==0){
    cells.push(`<div class="court-date-cell is-muted">${nextDay++}</div>`);
  }
  return cells.join('');
}
function pickCourtCustomDate(date,event){
  if(event)event.stopPropagation();
  const isGlobal=globalTopFilterPages().includes(currentPage);
  courtDateRangeFilterValue='自定义';
  if(!courtDateRangeStart||courtDateRangeEnd){
    courtDateRangeStart=date;
    courtDateRangeEnd='';
  }else if(date<courtDateRangeStart){
    courtDateRangeStart=date;
    courtDateRangeEnd='';
  }else{
    courtDateRangeEnd=date;
  }
  setCourtDateRangeViewAnchor(`${date.slice(0,7)}-01`);
  if(!isGlobal&&typeof syncGlobalDateRangeFromCourt==='function')syncGlobalDateRangeFromCourt(false);
  if(isGlobal)refreshGlobalTopFilters();else refreshCourtTopFilters();
  const dropdown=document.getElementById(isGlobal?'globalTopDate_dropdown':'courtTopDate_dropdown');
  if(dropdown)dropdown.classList.add('open');
}
function clearCourtCustomDateRange(event){
  if(event)event.stopPropagation();
  if(globalTopFilterPages().includes(currentPage)&&typeof clearGlobalDateRange==='function'){
    clearGlobalDateRange(event);
    return;
  }
  courtDateRangeStart='';
  courtDateRangeEnd='';
  courtDateRangeFilterValue='全部';
  if(typeof syncGlobalDateRangeFromCourt==='function')syncGlobalDateRangeFromCourt(false);
  refreshCourtTopFilters();
  renderCourts();
  closeStandardTopDropdowns();
}
function confirmCourtCustomDateRange(event){
  if(event)event.stopPropagation();
  if(!courtDateRangeStart||!courtDateRangeEnd)return;
  courtDateRangeFilterValue='自定义';
  courtPage=1;
  if(globalTopFilterPages().includes(currentPage)){
    if(typeof applyGlobalCustomDateRange==='function'&&!applyGlobalCustomDateRange())return;
    refreshGlobalTopFilters();
    renderCurrentGlobalFilterPage();
  }else{
    if(typeof syncGlobalDateRangeFromCourt==='function')syncGlobalDateRangeFromCourt(false);
    refreshCourtTopFilters();
    renderCourts();
  }
  closeStandardTopDropdowns();
}
function resolveCourtDatePresetRange(value){
  const now=new Date(`${today()}T00:00:00`);
  const padDate=date=>`${date.getFullYear()}-${String(date.getMonth()+1).padStart(2,'0')}-${String(date.getDate()).padStart(2,'0')}`;
  if(value==='今日'){
    const key=padDate(now);
    return {startDate:key,endDate:key};
  }
  if(value==='本周'){
    const start=weekStart(now);
    const end=addDays(start,6);
    return {startDate:padDate(start),endDate:padDate(end)};
  }
  if(value==='本月'){
    const start=monthStart(now);
    const end=new Date(start.getFullYear(),start.getMonth()+1,0);
    return {startDate:padDate(start),endDate:padDate(end)};
  }
  return {startDate:'',endDate:''};
}
function onCourtDateRangeFilterChange(value,event){
  if(event)event.stopPropagation();
  if(value==='自定义'){
    courtDateRangeFilterValue='自定义';
    courtDateRangeStart='';
    courtDateRangeEnd='';
    if(typeof today==='function')window.__courtDateRangeViewAnchor=`${today().slice(0,7)}-01`;
    refreshCourtTopFilters();
    const dropdown=document.getElementById('courtTopDate_dropdown');
    if(dropdown)dropdown.classList.add('open');
    return;
  }
  courtDateRangeFilterValue=value;
  if(value==='全部'){
    courtDateRangeStart='';
    courtDateRangeEnd='';
  }else{
    const preset=resolveCourtDatePresetRange(value);
    courtDateRangeStart=preset.startDate;
    courtDateRangeEnd=preset.endDate;
    window.__courtDateRangeViewAnchor=`${preset.startDate.slice(0,7)}-01`;
  }
  courtPage=1;
  if(typeof syncGlobalDateRangeFromCourt==='function')syncGlobalDateRangeFromCourt(true);
  refreshCourtTopFilters();
  renderCourts();
  closeStandardTopDropdowns();
}
function setCourtPageSize(value){
  const next=parseInt(value,10)||20;
  courtPageSize=next;
  courtPage=1;
  renderCourts();
}
function onCourtFilterChange(){
  courtPage=1;
  renderCourts();
}
function handleCourtMoreAction(value){
  const action=value||document.getElementById('courtMoreActionValue')?.value||'';
  if(action==='batch-select')setCourtBatchMode(true);
  if(action==='batch-exit')setCourtBatchMode(false);
  if(action==='import')openCourtImport();
  if(action==='migration')openCourtFinanceMigrationPreview();
  if(action==='backup')backupToObsidian();
  const holder=document.getElementById('courtMoreActionValue');
  if(holder)holder.value='';
  const dropdown=document.getElementById('courtMoreActionValue_dropdown');
  if(dropdown){
    const display=dropdown.querySelector('.tms-dropdown-display');
    if(display)display.textContent='更多操作';
    dropdown.querySelectorAll('.tms-dropdown-item').forEach(el=>el.classList.remove('active'));
  }
}
function setCourtSort(key){
  if(courtSortKey!==key){courtSortKey=key;courtSortDir='desc';}
  else if(courtSortDir==='desc')courtSortDir='asc';
  else{courtSortKey='';courtSortDir='desc';}
  courtPage=1;
  renderCourts();
}
function courtPageNumbers(page,pages){
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
function renderCourtPagerControls(total,pages){
  const btns=document.getElementById('courtPagerBtns');
  if(!btns)return;
  btns.innerHTML=(!total||pages<=1)?'':renderStandardPaginationButtonsHtml(courtPage,pages,'setCourtPage');
}
function setCourtPage(value){
  const total=(courtAccountListViewData?.items||courts||[]).length;
  const pages=Math.max(1,Math.ceil(total/courtPageSize));
  courtPage=Math.min(pages,Math.max(1,parseInt(value,10)||1));
  renderCourts();
}
function jumpCourtPage(value){
  const total=(courtAccountListViewData?.items||courts||[]).length;
  const pages=Math.max(1,Math.ceil(total/courtPageSize));
  courtPage=Math.min(pages,Math.max(1,parseInt(value,10)||1));
  renderCourts();
}

function membershipPlansTableHtml(q=''){
  const rows=membershipPlans.filter(p=>searchHit(q,p.name,p.tierCode,p.notes));
  return rows.map(p=>{const statusMeta=membershipPlanStatusMeta(p);const tierTagClass=membershipPlanTierTagClass(p.tierCode||p.name);const benefits=[{label:'大师公开课',count:parseInt(p.publicLessonCount)||0},{label:'穿线免手工费',count:parseInt(p.stringingLaborCount)||0},{label:'发球机免费',count:parseInt(p.ballMachineCount)||0},{label:'国家二级运动员陪打',count:parseInt(p.level2PartnerCount)||0},{label:'指定教练陪打',count:parseInt(p.designatedCoachPartnerCount)||0}].filter(x=>x.count>0).map(x=>`${x.label} ${x.count}次`).join('；')||'-';const actions=p.status==='active'?[`<span class="tms-action-link" onclick="toggleMembershipPlanStatus('${p.id}','inactive')">停售</span>`,`<span class="tms-action-link" onclick="openMembershipPlanModal('${p.id}')">编辑</span>`]:[`<span class="tms-action-link" onclick="confirmDel('${p.id}','${esc(p.name)}','membership-plan')">删除</span>`,`<span class="tms-action-link" onclick="toggleMembershipPlanStatus('${p.id}','active')">上架</span>`,`<span class="tms-action-link" onclick="openMembershipPlanModal('${p.id}')">编辑</span>`].filter(Boolean);return `<tr><td class="tms-sticky-l" style="padding-left:20px">${renderStandardCellText(p.name,false)}</td><td><span class="tms-tag ${tierTagClass}">${esc(renderStandardEmptyText(p.tierCode||p.name))}</span></td><td><div class="tms-cell-text">¥${fmt(p.rechargeAmount)}</div></td><td><div class="tms-cell-text">¥${fmt(p.bonusAmount)}</div></td><td>${renderStandardCellText(p.discountRate?Math.round((parseFloat(p.discountRate)||1)*100)/10+' 折':'')}</td><td>${renderStandardCellText(membershipPlanSaleWindowText(p),false)}</td><td><span class="tms-tag ${statusMeta.tagClass}">${statusMeta.text}</span></td><td><div class="tms-cell-text" style="white-space:normal;line-height:1.55;min-width:500px;max-width:none;color:#A3968F">${esc(benefits)}</div></td><td><div class="tms-text-remark" style="max-width:180px" title="${esc(p.notes||'')}">${esc(renderStandardEmptyText(p.notes))}</div></td><td class="tms-sticky-r tms-action-cell" style="width:168px;padding-right:20px;justify-content:flex-end">${actions.join('')}</td></tr>`;}).join('')||'<tr><td colspan="10"><div class="empty"><p>暂无会员方案</p></div></td></tr>';
}
function membershipPlanBenefitsText(p){
  return [{label:'大师公开课',count:parseInt(p.publicLessonCount)||0},{label:'穿线免手工费',count:parseInt(p.stringingLaborCount)||0},{label:'发球机免费',count:parseInt(p.ballMachineCount)||0},{label:'国家二级运动员陪打',count:parseInt(p.level2PartnerCount)||0},{label:'指定教练陪打',count:parseInt(p.designatedCoachPartnerCount)||0}].filter(x=>x.count>0).map(x=>`${x.label} ${x.count}次`).join('；')||'-';
}
function renderMembershipPlanMobileCards(q=''){
  const host=document.getElementById('membershipPlanMobileCards');if(!host)return;
  const rows=membershipPlans.filter(p=>searchHit(q,p.name,p.tierCode,p.notes));
  if(!rows.length){host.innerHTML='<div class="tms-empty-state"><div class="tms-empty-title">暂无会员方案</div><div class="tms-empty-desc">调整搜索后再看</div></div>';return;}
  host.innerHTML=rows.map(p=>{const statusMeta=membershipPlanStatusMeta(p),tierTagClass=membershipPlanTierTagClass(p.tierCode||p.name),discountText=p.discountRate?Math.round((parseFloat(p.discountRate)||1)*100)/10+' 折':'-',stopAction=p.status==='active'?`<button type="button" onclick="toggleMembershipPlanStatus('${p.id}','inactive')">停售</button>`:`<button type="button" onclick="toggleMembershipPlanStatus('${p.id}','active')">上架</button>`;return `<article class="admin-h5-list-card admin-h5-membership-plan-card"><div class="admin-h5-card-head"><div><strong>${esc(p.name||'-')}</strong><span>${esc(membershipPlanSaleWindowText(p))}</span></div><span class="tms-tag ${statusMeta.tagClass}">${esc(statusMeta.text)}</span></div><div class="admin-h5-card-tags"><span class="tms-tag ${tierTagClass}">${esc(renderStandardEmptyText(p.tierCode||p.name))}</span><span class="tms-tag">${esc(discountText)}</span></div><div class="admin-h5-card-grid"><span><b>充值金额</b>¥${esc(fmt(p.rechargeAmount))}</span><span><b>赠送金额</b>¥${esc(fmt(p.bonusAmount))}</span></div><p>${esc(membershipPlanBenefitsText(p))}</p><div class="admin-h5-card-actions"><button type="button" onclick="openMembershipPlanModal('${p.id}')">编辑</button>${stopAction}</div></article>`;}).join('');
}
function renderMembershipPlans(){
  const host=document.getElementById('membershipPlanTbody');if(!host)return;
  const q=(document.getElementById('membershipPlanSearch')?.value||'').toLowerCase();
  host.innerHTML=membershipPlansTableHtml(q);
  renderMembershipPlanMobileCards(q);
}
async function toggleMembershipPlanStatus(id,nextStatus){
  const plan=membershipPlans.find(x=>x.id===id);
  if(!plan)return;
  if(nextStatus==='active'){
    if(plan.saleEndDate&&plan.saleEndDate<today()){toast('活动时间已结束，请先调整售卖结束日期再上架','warn');return;}
  }
  const actionText=nextStatus==='active'?'上架':'停售';
  if(!await appConfirm(`确认${actionText}「${plan.name}」？`,{title:`确认${actionText}`,confirmText:`确认${actionText}`}))return;
  try{
    const updated=await apiCall('PUT','/membership-plans/'+id,{status:nextStatus});
    const index=membershipPlans.findIndex(x=>x.id===id);
    if(index>=0)membershipPlans[index]=updated;
    renderMembershipPlans();
    toast(`会员方案已${actionText}`,'success');
  }catch(e){
    toast(`${actionText}失败：${e.message}`,'error');
  }
}
function membershipVisibleCourt(account){
  const court=courts.find(c=>c.id===account?.courtId);
  if(!court||!isActiveCourtRecord(court))return null;
  return court;
}
function membershipLifecycleRows(){
  const seen=new Set(),rows=typeof customerLifecycleAllRows==='function'?customerLifecycleAllRows():(typeof customerLifecycleRows!=='undefined'&&Array.isArray(customerLifecycleRows)?customerLifecycleRows:[]);
  return rows.filter(row=>String(row.courtStage||'')==='member').map(row=>{
    const courtId=String(row.courtId||''),accountId=String(row.membershipAccountId||'');
    const lifecycle=(accountId&&typeof customerLifecycleByMembershipAccountId==='function'?customerLifecycleByMembershipAccountId(accountId):null)||(courtId&&typeof customerLifecycleByCourtId==='function'?customerLifecycleByCourtId(courtId):null)||row;
    const account=membershipAccounts.find(a=>(accountId&&String(a.id||'')===accountId)||(courtId&&String(a.courtId||'')===courtId));
    const court=courts.find(c=>String(c.id||'')===courtId)||membershipVisibleCourt(account);
    if(!court||!isActiveCourtRecord(court))return null;
    const lifecycleStatus=typeof customerLifecycleMembershipStatus==='function'?customerLifecycleMembershipStatus(lifecycle):String(lifecycle.membershipStatus||'').trim(),nextAccount=account||{id:accountId,courtId:court.id,status:lifecycleStatus||'active',courtName:lifecycle.displayName,phone:lifecycle.phone};
    const status=String(nextAccount.status||lifecycleStatus||'').trim();
    if(['voided','cleared','deleted','inactive'].includes(status))return null;
    const key=accountId||court.id;
    if(seen.has(key))return null;
    seen.add(key);
    return {court,account:nextAccount};
  }).filter(Boolean);
}
function membershipBaseRows(){
  return (courtAccountListViewData?.items||[]).filter(item=>item?.accountType==='会员账户');
}
function membershipReadModelItemForCourt(courtOrId){
  const courtId=String((courtOrId&&typeof courtOrId==='object'?courtOrId.id:courtOrId)||'').trim();
  if(!courtId)return null;
  return (courtAccountListViewData?.items||[]).find(item=>String(item?.id||'')===courtId)||null;
}
function membershipReadModelFinanceForCourt(court){
  const item=membershipReadModelItemForCourt(court);
  const totalSpent=Number(item?.totalSpent)||0,memberBookingAmount=Number(item?.memberBookingAmount)||0;
  return {
    balance:Number(item?.balance)||0,
    totalDeposit:Number(item?.totalDeposit)||0,
    spentAmount:totalSpent,
    receivedAmount:Number(item?.totalReceived)||0,
    storedValueSpent:memberBookingAmount,
    directPaidSpent:Math.max(0,totalSpent-memberBookingAmount)
  };
}
function membershipReadModelBookingForCourt(court){
  const item=membershipReadModelItemForCourt(court);
  return {
    count:Number(item?.bookingCount)||0,
    amount:Number(item?.bookingAmount)||0,
    hours:Number(item?.bookingHours)||0,
    memberCount:Number(item?.memberBookingCount)||0,
    memberAmount:Number(item?.memberBookingAmount)||0,
    guestCount:Number(item?.guestBookingCount)||0,
    guestAmount:Number(item?.guestBookingAmount)||0,
    lastDate:item?.lastBookingDate||''
  };
}
function membershipReadModelRechargeCountForRow(row){
  return Number((row?.rechargeRows||[]).length||row?.membershipRechargeCount)||0;
}
function membershipReadModelRechargeRowsForCourt(court){
  return membershipReadModelItemForCourt(court)?.rechargeRows||[];
}
function membershipReadModelBenefitRowsForCourt(court){
  return membershipReadModelItemForCourt(court)?.benefitRows||[];
}
function membershipReadModelLedgerRowsForCourt(court){
  return membershipReadModelItemForCourt(court)?.ledgerRows||[];
}
function membershipReadModelBookingRowsForCourt(court){
  return membershipReadModelItemForCourt(court)?.bookingRows||[];
}
function membershipReadModelAccountForCourt(court){
  return membershipReadModelItemForCourt(court)?.membershipAccount||null;
}
function renderMembershipStats(rows=[]){
  const host=document.getElementById('membershipStatsRow');if(!host)return;
  const financeSummary=courtAccountListViewData?.summary?.membershipFinanceSummary||{};
  if(!Object.keys(financeSummary).length){
    host.innerHTML='';
    return;
  }
  const totalIncome=Number(financeSummary.paidAmount)||0;
  const poolTotal=Number(financeSummary.consumableAmount)||0;
  const totalRecognized=Number(financeSummary.consumedAmount)||0;
  const pendingTotal=Number(financeSummary.pendingAmount)||0;
  host.innerHTML=renderStandardDataCards([
    {title:'会员储值',valueHtml:`<span>${Number(financeSummary.memberCount)||0}</span><span class="tms-stat-divider">｜</span><span>${Number(financeSummary.rechargeCount)||0}</span>`,sub:'会员人数 vs 储值次数'},
    {title:'充值金额',value:`¥${fmt(totalIncome)}`,sub:''},
    {title:'需履约总金额',value:`¥${fmt(poolTotal)}`,sub:'充值金额 + 赠送金额'},
    {title:'已核销金额',value:`¥${fmt(totalRecognized)}`,percent:statPercentText(totalRecognized,poolTotal),sub:'已核销金额 / 累计实收+累计赠送占比'},
    {title:'待履约金额',value:`¥${fmt(pendingTotal)}`,percent:statPercentText(pendingTotal,poolTotal),sub:'待履约金额 / 累计实收+累计赠送占比'}
  ]);
}
function membershipTierForRow(row){
  return row?.membershipTierLabel&&row.membershipTierLabel!=='-'?row.membershipTierLabel:'-';
}
function renderMembershipHeaderFilters(rows=[]){
  const host=document.getElementById('membershipTierFilter');
  if(!host)return;
  const tiers=[...new Set(rows.map(membershipTierForRow).filter(v=>v&&v!=='-'))];
  const opts=[{value:'',label:'全部',emptyDisplay:'会员类型'},...tiers.map(v=>({value:v,label:v}))];
  host.innerHTML=renderStandardDropdownHtml('membershipTierValue','会员类型',withStandardFilterCounts(opts,rows,(row,value)=>membershipTierForRow(row)===value),membershipTierFilterValue,false,'onMembershipToolbarFilterChange');
}
function onMembershipToolbarFilterChange(){
  membershipTierFilterValue=document.getElementById('membershipTierValue')?.value||'';
  membershipPage=1;
  renderMemberships();
}
function onMembershipSearchChange(){
  membershipPage=1;
  renderMemberships();
}
function membershipDefaultSortDir(key){
  return 'desc';
}
function setMembershipSort(key){
  const initialDir=membershipDefaultSortDir(key);
  if(membershipSortKey!==key){membershipSortKey=key;membershipSortDir=initialDir;}
  else if(membershipSortDir===initialDir)membershipSortDir=initialDir==='asc'?'desc':'asc';
  else{membershipSortKey='';membershipSortDir='desc';}
  membershipPage=1;
  renderMemberships();
}
function setMembershipPageSize(value){
  const next=parseInt(value,10);
  membershipPageSize=standardListPageSize(next,membershipPageSize);
  membershipPage=1;
  renderMemberships();
}
function membershipPageNumbers(page,pages){
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
function renderMembershipPagerControls(total,pages){
  const pageSizeHost=document.getElementById('membershipPageSize');
  if(pageSizeHost)pageSizeHost.innerHTML=renderPageSizeSelectorHtml('membershipPageSizeValue',membershipPageSize,'setMembershipPageSize');
  const btns=document.getElementById('membershipPagerBtns');
  if(!btns)return;
  btns.innerHTML=(!total||pages<=1)?'':renderStandardPaginationButtonsHtml(membershipPage,pages,'setMembershipPage');
}
function setMembershipPage(value){
  const total=membershipBaseRows().length;
  const pages=Math.max(1,Math.ceil(total/membershipPageSize));
  membershipPage=Math.min(pages,Math.max(1,parseInt(value,10)||1));
  renderMemberships();
}
function jumpMembershipPage(value){
  const total=getMembershipRows().length;
  const pages=Math.max(1,Math.ceil(total/membershipPageSize));
  membershipPage=Math.min(pages,Math.max(1,parseInt(value,10)||1));
  renderMemberships();
}
function membershipSortMetric(row,key){
  if(key==='balance')return {empty:false,value:membershipReadModelFinanceForCourt(row).balance};
  if(key==='memberBookingCount')return {empty:false,value:membershipReadModelBookingForCourt(row).memberCount};
  if(key==='bookingCount')return {empty:false,value:membershipReadModelBookingForCourt(row).count};
  if(key==='firstOpenDate'){
    const raw=String(row?.firstOpenDate||'').slice(0,10);
    const timeValue=dateMs(raw);
    return {empty:!raw||Number.isNaN(timeValue),value:Number.isNaN(timeValue)?0:timeValue};
  }
  if(key==='validUntil'){
    const raw=String(row?.membershipValidUntil||'').trim();
    if(!raw||raw==='-'||raw==='—')return {empty:true,value:0};
    const timeValue=dateMs(raw);
    return {empty:Number.isNaN(timeValue),value:Number.isNaN(timeValue)?0:timeValue};
  }
  return {empty:false,value:0};
}
function getMembershipRows(){
  const q=(document.getElementById('membershipSearch')?.value||'').toLowerCase();
  const base=membershipBaseRows();
  return base.filter(row=>{
    if(membershipTierFilterValue&&membershipTierForRow(row)!==membershipTierFilterValue)return false;
    return searchHit(q,row.displayName,row.phone,row.campusName,row.membershipTierLabel,row.membershipStatus,row.owner);
  });
}
function renderMembershipMobileCards(list){
  const host=document.getElementById('membershipMobileCards');if(!host)return;
  if(!list.length){host.innerHTML='<div class="tms-empty-state"><div class="tms-empty-title">暂无会员账户</div><div class="tms-empty-desc">调整搜索后再看</div></div>';return;}
  host.innerHTML=list.map(item=>{const finance=membershipReadModelFinanceForCourt(item),booking=membershipReadModelBookingForCourt(item),benefitRows=membershipReadModelBenefitRowsForCourt(item),benefits=benefitRows.length?benefitRows.map(b=>`${b.label} ${b.remaining}/${b.total}`).join('；'):'-',tierLabel=item.membershipTierLabel||'-',firstOpenDate=String(item.firstOpenDate||'').slice(0,10)||'-',renewalCount=Math.max(0,Number(item.membershipRenewalCount)||0),memberBookingCount=Number(item.memberBookingCount??booking.memberCount)||0,bookingCount=Number(item.bookingCount??booking.count)||0;return `<article class="admin-h5-list-card admin-h5-membership-card"><div class="admin-h5-card-head"><div><strong>${esc(item.displayName)}</strong><span>${esc(item.phone||'-')}</span></div>${tierLabel==='-'?'<span class="tms-tag">-</span>':`<span class="tms-tag ${courtMembershipTierTagClass(tierLabel)}">${esc(tierLabel)}</span>`}</div><div class="admin-h5-card-tags"><span class="tms-tag">${esc(item.membershipDiscountText||'-')}</span><span class="tms-tag">${esc(firstOpenDate)}</span></div><div class="admin-h5-card-grid"><span><b>会员余额</b>¥${esc(fmt(finance.balance))}</span><span><b>累计充值</b>¥${esc(fmt(finance.totalDeposit))}</span><span><b>续费次数</b>${esc(renewalCount)} 次</span><span><b>会员订场</b>${esc(memberBookingCount)} 次</span><span><b>累计订场</b>${esc(bookingCount)} 次</span><span><b>累计消费</b>¥${esc(fmt(finance.spentAmount))}</span></div><p>${esc(benefits)}</p><div class="admin-h5-card-actions"><button type="button" onclick="openCourtMembershipPanel('${item.id}')">查看</button><button type="button" onclick="openCourtFinanceModal('${item.id}')">订场</button></div></article>`;}).join('');
}
function renderMemberships(){
  const body=document.getElementById('membershipTbody');if(!body)return;
  renderMembershipHeaderFilters(membershipBaseRows());
  const rows=getMembershipRows();
  renderMembershipStats(rows);
  const sortedRows=[...rows];
  if(membershipSortKey){
    sortedRows.sort((a,b)=>{
      const av=membershipSortMetric(a,membershipSortKey);
      const bv=membershipSortMetric(b,membershipSortKey);
      if(av.empty!==bv.empty)return av.empty?1:-1;
      return membershipSortDir==='desc'?bv.value-av.value:av.value-bv.value;
    });
  }
  const isMobileList=document.body.classList.contains('admin-mobile');
  const total=sortedRows.length,pages=isMobileList?1:Math.max(1,Math.ceil(total/membershipPageSize));
  if(membershipPage>pages)membershipPage=pages;
  const slice=isMobileList?sortedRows:sortedRows.slice((membershipPage-1)*membershipPageSize,membershipPage*membershipPageSize);
  body.innerHTML=slice.map(item=>{const finance=membershipReadModelFinanceForCourt(item);const booking=membershipReadModelBookingForCourt(item);const benefitRows=membershipReadModelBenefitRowsForCourt(item);const benefits=benefitRows.length?benefitRows.map(b=>`${b.label} ${b.remaining}/${b.total}`).join('；'):'-';const tierLabel=item.membershipTierLabel||'-';const firstOpenDate=String(item.firstOpenDate||'').slice(0,10);const renewalCount=Math.max(0,Number(item.membershipRenewalCount)||0);const memberBookingCount=Number(item.memberBookingCount??booking.memberCount)||0;const bookingCount=Number(item.bookingCount??booking.count)||0;const lowBalance=finance.balance>0&&finance.balance<=500;return `<tr><td class="tms-sticky-l" style="padding-left:20px"><div class="tms-text-primary">${esc(item.displayName)}</div></td><td>${renderStandardCellText(item.phone)}</td><td>${tierLabel==='-'?'-':`<span class="tms-tag ${courtMembershipTierTagClass(tierLabel)}">${esc(tierLabel)}</span>`}</td><td>${renderStandardCellText(firstOpenDate,false)}</td><td><div class="tms-cell-text">${renewalCount}次</div></td><td>${renderCourtMiniBar(finance.balance,finance.totalDeposit,lowBalance)}</td><td>${renderStandardCellText(item.membershipDiscountText,false)}</td><td><div class="tms-cell-text">${memberBookingCount}次</div></td><td><div class="tms-cell-text">${bookingCount}次</div></td><td><div class="tms-cell-text" style="white-space:normal;line-height:1.55;min-width:320px;color:#A3968F">${esc(renderStandardEmptyText(benefits))}</div></td><td class="tms-sticky-r tms-action-cell" style="width:96px;padding-right:12px;text-align:right"><span class="tms-action-link" onclick="openCourtMembershipPanel('${item.id}')">查看</span><span class="tms-action-link" onclick="openCourtFinanceModal('${item.id}')">订场</span></td></tr>`;}).join('')||'<tr><td colspan="11"><div class="tms-empty-state"><div class="tms-empty-title">暂无会员账户</div><div class="tms-empty-desc">调整搜索后再看</div></div></td></tr>';
  renderMembershipMobileCards(slice);
  const pagerInfo=document.getElementById('membershipPagerInfo');
  if(pagerInfo)pagerInfo.innerHTML=renderPagerInfoHtml(total);
  const pager=document.querySelector('#page-memberships .tms-pagination');
  if(pager)pager.style.display=!isMobileList&&pages>1?'flex':'none';
  renderMembershipPagerControls(total,pages);
  document.querySelectorAll('#page-memberships [data-membership-sort]').forEach(btn=>{
    const active=btn.dataset.membershipSort===membershipSortKey;
    btn.classList.toggle('asc',active&&membershipSortDir==='asc');
    btn.classList.toggle('desc',active&&membershipSortDir==='desc');
  });
}
function openMembershipOrdersAuditModal(){
  goPage('membership-orders');
}
function openMembershipLedgerAuditModal(){
  goPage('membership-ledger');
}
function membershipOrderAuditRows(){
  const q=(document.getElementById('membershipOrderAuditSearch')?.value||'').toLowerCase();
  return (courtAccountListViewData?.membershipOrderAuditRows||[]).filter(o=>searchHit(q,o.courtName,o.membershipPlanName,o.notes,o.purchaseDate,o.overrideReason)).sort((a,b)=>String(b.purchaseDate||b.createdAt||'').localeCompare(String(a.purchaseDate||a.createdAt||'')));
}
function renderMembershipOrderAuditPagerControls(total,pages){
  const pageSizeHost=document.getElementById('membershipOrdersAuditPageSize');
  if(pageSizeHost)pageSizeHost.innerHTML=renderPageSizeSelectorHtml('membershipOrdersAuditPageSizeValue',membershipOrderAuditPageSize,'setMembershipOrderAuditPageSize');
  const btns=document.getElementById('membershipOrdersAuditPagerBtns');
  if(btns)btns.innerHTML=(!total||pages<=1)?'':renderStandardPaginationButtonsHtml(membershipOrderAuditPage,pages,'setMembershipOrderAuditPage');
}
function setMembershipOrderAuditPage(value){
  const total=membershipOrderAuditRows().length;
  membershipOrderAuditPage=standardListPagination(total,value,membershipOrderAuditPageSize).page;
  renderMembershipOrdersAuditPage();
}
function setMembershipOrderAuditPageSize(value){
  membershipOrderAuditPageSize=standardListPageSize(value,membershipOrderAuditPageSize);
  membershipOrderAuditPage=standardListFirstPage();
  renderMembershipOrdersAuditPage();
}
function onMembershipOrderAuditSearchChange(){
  membershipOrderAuditPage=standardListFirstPage();
  renderMembershipOrdersAuditPage();
}
function renderMembershipOrdersAuditPage(){
  const host=document.getElementById('membershipOrdersAuditTbody');if(!host)return;
  const rows=membershipOrderAuditRows();
  const isMobileList=document.body.classList.contains('admin-mobile'),pageState=isMobileList?{total:rows.length,pages:1,page:1,slice:rows}:standardListSlice(rows,membershipOrderAuditPage,membershipOrderAuditPageSize);
  membershipOrderAuditPage=pageState.page;
  const {total,pages,slice}=pageState;
  const pager=document.querySelector('#page-membership-orders .tms-pagination');
  if(pager)pager.style.display=isMobileList?'none':(total>membershipOrderAuditPageSize?'flex':'none');
  const info=document.getElementById('membershipOrdersAuditPagerInfo');
  if(info)info.innerHTML=renderPagerInfoHtml(total);
  renderMembershipOrderAuditPagerControls(total,pages);
  host.innerHTML=slice.map(o=>`<tr><td style="padding-left:20px">${renderStandardCellText(o.purchaseDate)}</td><td>${renderStandardCellText(formatMembershipLedgerTime(o.createdAt),false)}</td><td>${renderStandardCellText(o.courtName)}</td><td>${renderStandardCellText(o.membershipPlanName)}</td><td><div class="tms-cell-text">¥${fmt(o.systemAmount??o.rechargeAmount)}</div></td><td><div class="tms-cell-text">¥${fmt(o.finalAmount??o.rechargeAmount)}</div></td><td><div class="tms-cell-text">¥${fmt(o.bonusAmount)}</div></td><td>${renderStandardCellText(membershipDiscountText(o.discountRate),false)}</td><td>${renderStandardCellText(o.qualifiesRenewalReset===false?'否':'是',false)}</td><td>${renderStandardCellText(o.overrideReason,false)}</td><td><div class="tms-cell-text" style="white-space:normal;line-height:1.55;min-width:320px">${membershipOrderBenefitSummaryHtml(o)}</div></td><td>${renderStandardCellText(membershipStatusText(o.status),false)}</td></tr>`).join('')||'<tr><td colspan="12"><div class="tms-empty-state"><div class="tms-empty-title">暂无会员购买记录</div><div class="tms-empty-desc">调整搜索后再看</div></div></td></tr>';
  renderMembershipOrderMobileCards(slice);
}
function renderMembershipOrderMobileCards(list){
  const host=document.getElementById('membershipOrderMobileCards');if(!host)return;
  if(!list.length){host.innerHTML='<div class="tms-empty-state"><div class="tms-empty-title">暂无会员购买记录</div><div class="tms-empty-desc">调整搜索后再看</div></div>';return;}
  host.innerHTML=list.map(o=>`<article class="admin-h5-list-card admin-h5-membership-order-card"><div class="admin-h5-card-head"><div><strong>${esc(o.courtName||'-')}</strong><span>${esc(o.purchaseDate||'-')}</span></div><span class="tms-tag">${esc(membershipStatusText(o.status))}</span></div><div class="admin-h5-card-tags"><span class="tms-tag">${esc(o.membershipPlanName||'-')}</span><span class="tms-tag">${esc(membershipDiscountText(o.discountRate))}</span></div><div class="admin-h5-card-grid"><span><b>系统价</b>¥${esc(fmt(o.systemAmount??o.rechargeAmount))}</span><span><b>成交价</b>¥${esc(fmt(o.finalAmount??o.rechargeAmount))}</span><span><b>赠送金额</b>¥${esc(fmt(o.bonusAmount))}</span><span><b>重置有效期</b>${esc(o.qualifiesRenewalReset===false?'否':'是')}</span></div><p>${esc(String(membershipOrderBenefitSummaryHtml(o)||'').replace(/<[^>]+>/g,''))}</p></article>`).join('');
}
function formatMembershipLedgerTime(value){
  const d=new Date(value||'');
  if(Number.isNaN(d.getTime()))return renderStandardEmptyText(value);
  const pad=n=>String(n).padStart(2,'0');
  return `${d.getFullYear()}-${pad(d.getMonth()+1)}-${pad(d.getDate())} ${pad(d.getHours())}:${pad(d.getMinutes())}:${pad(d.getSeconds())}`;
}
function membershipLedgerActionText(action){
  return ({consume:'消耗',supplement:'补发',adjust:'调整',void:'作废'}[action]||renderStandardEmptyText(action));
}
function membershipLedgerOperatorText(operator){
  return renderStandardEmptyText(operator);
}
function membershipOrderDisplayText(orderId){
  const order=(courtAccountListViewData?.membershipOrderAuditRows||[]).find(o=>String(o?.id||'')===String(orderId||''));
  if(!order)return '-';
  return order.orderDisplayText||[order.purchaseDate,order.membershipPlanName].filter(Boolean).join(' · ')||'-';
}
function membershipLedgerAuditRows(){
  const q=(document.getElementById('membershipLedgerAuditSearch')?.value||'').toLowerCase();
  return (courtAccountListViewData?.membershipLedgerAuditRows||[]).filter(l=>l.action!=='grant'&&searchHit(q,l.courtName,l.benefitLabel,l.reason,l.operator,l.membershipOrderRef,l.orderDisplayText)).sort((a,b)=>String(b.createdAt||b.relatedDate||'').localeCompare(String(a.createdAt||a.relatedDate||'')));
}
function renderMembershipLedgerAuditPagerControls(total,pages){
  const pageSizeHost=document.getElementById('membershipLedgerAuditPageSize');
  if(pageSizeHost)pageSizeHost.innerHTML=renderPageSizeSelectorHtml('membershipLedgerAuditPageSizeValue',membershipLedgerAuditPageSize,'setMembershipLedgerAuditPageSize');
  const btns=document.getElementById('membershipLedgerAuditPagerBtns');
  if(btns)btns.innerHTML=(!total||pages<=1)?'':renderStandardPaginationButtonsHtml(membershipLedgerAuditPage,pages,'setMembershipLedgerAuditPage');
}
function setMembershipLedgerAuditPage(value){
  const total=membershipLedgerAuditRows().length;
  membershipLedgerAuditPage=standardListPagination(total,value,membershipLedgerAuditPageSize).page;
  renderMembershipLedgerAuditPage();
}
function setMembershipLedgerAuditPageSize(value){
  membershipLedgerAuditPageSize=standardListPageSize(value,membershipLedgerAuditPageSize);
  membershipLedgerAuditPage=standardListFirstPage();
  renderMembershipLedgerAuditPage();
}
function onMembershipLedgerAuditSearchChange(){
  membershipLedgerAuditPage=standardListFirstPage();
  renderMembershipLedgerAuditPage();
}
function renderMembershipLedgerAuditPage(){
  const host=document.getElementById('membershipLedgerAuditTbody');if(!host)return;
  const rows=membershipLedgerAuditRows();
  const isMobileList=document.body.classList.contains('admin-mobile'),pageState=isMobileList?{total:rows.length,pages:1,page:1,slice:rows}:standardListSlice(rows,membershipLedgerAuditPage,membershipLedgerAuditPageSize);
  membershipLedgerAuditPage=pageState.page;
  const {total,pages,slice}=pageState;
  const pager=document.querySelector('#page-membership-ledger .tms-pagination');
  if(pager)pager.style.display=isMobileList?'none':(total>membershipLedgerAuditPageSize?'flex':'none');
  const info=document.getElementById('membershipLedgerAuditPagerInfo');
  if(info)info.innerHTML=renderPagerInfoHtml(total);
  renderMembershipLedgerAuditPagerControls(total,pages);
  host.innerHTML=slice.map(l=>{const delta=parseInt(l.delta)||0;return `<tr><td style="padding-left:20px">${renderStandardCellText(formatMembershipLedgerTime(l.createdAt||l.relatedDate),false)}</td><td>${renderStandardCellText(l.courtName||l.courtId)}</td><td>${renderStandardCellText(l.orderDisplayText||membershipOrderDisplayText(l.membershipOrderRef))}</td><td>${renderStandardCellText(l.benefitLabel||l.benefitCode,false)}</td><td>${renderStandardCellText(`${delta>0?'+':''}${delta}`,false)}</td><td>${renderStandardCellText(membershipLedgerActionText(l.action),false)}</td><td>${renderStandardCellText(membershipLedgerOperatorText(l.operator))}</td><td><div class="tms-cell-text" style="white-space:normal;line-height:1.55;min-width:260px">${esc(renderStandardEmptyText(l.reason))}</div></td></tr>`;}).join('')||'<tr><td colspan="8"><div class="tms-empty-state"><div class="tms-empty-title">暂无权益流水</div><div class="tms-empty-desc">调整搜索后再看</div></div></td></tr>';
  renderMembershipLedgerMobileCards(slice);
}
function renderMembershipLedgerMobileCards(list){
  const host=document.getElementById('membershipLedgerMobileCards');if(!host)return;
  if(!list.length){host.innerHTML='<div class="tms-empty-state"><div class="tms-empty-title">暂无权益流水</div><div class="tms-empty-desc">调整搜索后再看</div></div>';return;}
  host.innerHTML=list.map(l=>{const delta=parseInt(l.delta)||0;return `<article class="admin-h5-list-card admin-h5-membership-ledger-card"><div class="admin-h5-card-head"><div><strong>${esc(l.courtName||l.courtId||'-')}</strong><span>${esc(formatMembershipLedgerTime(l.createdAt||l.relatedDate))}</span></div><span class="tms-tag">${esc(membershipLedgerActionText(l.action))}</span></div><div class="admin-h5-card-grid"><span><b>购买批次</b>${esc(l.orderDisplayText||membershipOrderDisplayText(l.membershipOrderRef))}</span><span><b>权益</b>${esc(l.benefitLabel||l.benefitCode||'-')}</span><span><b>变动</b>${esc(`${delta>0?'+':''}${delta}`)}</span><span><b>操作账号</b>${esc(membershipLedgerOperatorText(l.operator))}</span></div><p>${esc(renderStandardEmptyText(l.reason))}</p></article>`;}).join('');
}
function openMembershipPlanModal(id){
  editId=id;const p=id?membershipPlans.find(x=>x.id===id):null;
  const discountValue=String(parseFloat(rv(p,'discountRate'))||'');
  const statusOptions=MEMBERSHIP_PLAN_STATUS_OPTIONS;
  const discountOptions=[{value:'',label:'- 选择 -'},{value:'0.7',label:'7 折'},{value:'0.8',label:'8 折'},{value:'0.9',label:'9 折'},{value:'1',label:'原价'}];
  const body=`<div class="tms-section-header" style="margin-top:0;">基础信息</div><div class="tms-readonly-panel" style="margin-bottom:16px"><span class="tms-panel-tip">权益有效期固定 12 个月，余额最长按当前系统规则至 24 个月。创建后默认是草稿，需要手动上架；停售或已结束都不会影响已开通会员。</span><div id="membershipPlanPreview"></div></div><div class="tms-form-row"><div class="tms-form-item"><label class="tms-form-label">方案名称 *</label><input class="finput tms-form-control" id="mp_name" value="${rv(p,'name')}" oninput="refreshMembershipPlanPreview()"></div><div class="tms-form-item"><label class="tms-form-label">会员档位 *</label><input class="finput tms-form-control" id="mp_tier" value="${rv(p,'tierCode')}" placeholder="例如：订场会员" oninput="refreshMembershipPlanPreview()"></div></div><div class="tms-form-row"><div class="tms-form-item"><label class="tms-form-label">充值金额 *</label>${membershipStepperHtml('mp_recharge',rv(p,'rechargeAmount'),'1','例如 5000')}</div><div class="tms-form-item"><label class="tms-form-label">赠送金额</label>${membershipStepperHtml('mp_bonus',rv(p,'bonusAmount'),'1','例如 498')}</div><div class="tms-form-item"><label class="tms-form-label">折扣</label>${renderStandardDropdownHtml('mp_discount','折扣',discountOptions,discountValue,true,'refreshMembershipPlanPreview')}</div></div><div class="tms-form-row"><div class="tms-form-item"><label class="tms-form-label">售卖开始日期</label>${courtDateButtonHtml('mp_saleStartDate',rv(p,'saleStartDate'),'售卖开始日期')}</div><div class="tms-form-item"><label class="tms-form-label">售卖结束日期</label>${courtDateButtonHtml('mp_saleEndDate',rv(p,'saleEndDate'),'售卖结束日期')}</div><div class="tms-form-item"><label class="tms-form-label">方案状态</label>${renderStandardDropdownHtml('mp_status','方案状态',statusOptions,rv(p,'status','draft'),true,'refreshMembershipPlanPreview')}</div></div><div class="tms-section-header">赠送权益</div><div class="tms-form-row"><div class="tms-form-item"><label class="tms-form-label">大师公开课</label>${membershipStepperHtml('mp_publicLesson',rv(p,'publicLessonCount'),'1')}</div><div class="tms-form-item"><label class="tms-form-label">穿线免手工费</label>${membershipStepperHtml('mp_stringingLabor',rv(p,'stringingLaborCount'),'1')}</div><div class="tms-form-item"><label class="tms-form-label">发球机免费</label>${membershipStepperHtml('mp_ballMachine',rv(p,'ballMachineCount'),'1')}</div></div><div class="tms-form-row"><div class="tms-form-item"><label class="tms-form-label">国家二级运动员陪打</label>${membershipStepperHtml('mp_level2Partner',rv(p,'level2PartnerCount'),'1')}</div><div class="tms-form-item"><label class="tms-form-label">指定教练陪打</label><input class="finput tms-form-control" id="mp_designatedCoachPartner" type="number" step="1" value="${esc(membershipNumericValue(rv(p,'designatedCoachPartnerCount')))}" oninput="toggleMembershipCoachSelector('mp_designatedCoachPartner','mp_designatedCoachSection');refreshMembershipPlanPreview()"></div><div class="tms-form-item"></div></div><div class="tms-form-row"><div class="tms-form-item full-width" id="mp_designatedCoachSection" style="display:none"><label class="tms-form-label">选择指定教练</label>${membershipCoachSelectorHtml('mp_designatedCoachIdsWrap',parseArr(p?.designatedCoachIds))}</div></div><div class="tms-form-row" style="margin-bottom:0"><div class="tms-form-item full-width"><label class="tms-form-label">备注</label><textarea class="finput tms-form-control" id="mp_notes">${esc(rv(p,'notes'))}</textarea></div></div>`;
  const actions=`<button class="tms-btn tms-btn-default" onclick="closeModal()">取消</button><button class="tms-btn tms-btn-primary" id="membershipPlanSaveBtn" onclick="saveMembershipPlan()">保存</button>`;
  openStandardModal({title:id?'编辑会员方案':'新增会员方案',bodyHtml:body,actionsHtml:actions,extraClass:'modal-wide'});
  toggleMembershipCoachSelector('mp_designatedCoachPartner','mp_designatedCoachSection');
  ['mp_recharge','mp_bonus','mp_publicLesson','mp_stringingLabor','mp_ballMachine','mp_level2Partner'].forEach(id=>{const el=document.getElementById(id);if(el)el.setAttribute('oninput','refreshMembershipPlanPreview()');});
  refreshMembershipPlanPreview();
}
async function saveMembershipPlan(){
  const name=document.getElementById('mp_name').value.trim();
  const tierInput=document.getElementById('mp_tier');
  if(tierInput&&!tierInput.value.trim())tierInput.value=membershipTierCodeValue(name);
  const saleStartDate=document.getElementById('mp_saleStartDate').value;
  const saleEndDate=document.getElementById('mp_saleEndDate').value;
  const status=document.getElementById('mp_status').value||'draft';
  if(saleStartDate&&saleEndDate&&saleEndDate<saleStartDate){toast('售卖结束日期不能早于售卖开始日期','warn');return;}
  if(status==='active'){
    if(saleEndDate&&saleEndDate<today()){toast('活动时间已结束，请先调整售卖结束日期再上架','warn');return;}
    if(saleStartDate&&saleStartDate<today())toast('售卖开始日期早于今天，系统会按历史方案正常保存','warn');
  }
  const data={name,tierCode:tierInput.value.trim(),rechargeAmount:parseFloat(document.getElementById('mp_recharge').value)||0,discountRate:parseFloat(document.getElementById('mp_discount').value)||0,bonusAmount:parseFloat(document.getElementById('mp_bonus').value)||0,saleStartDate,saleEndDate,publicLessonCount:parseInt(document.getElementById('mp_publicLesson').value)||0,stringingLaborCount:parseInt(document.getElementById('mp_stringingLabor').value)||0,ballMachineCount:parseInt(document.getElementById('mp_ballMachine').value)||0,level2PartnerCount:parseInt(document.getElementById('mp_level2Partner').value)||0,designatedCoachPartnerCount:parseInt(document.getElementById('mp_designatedCoachPartner').value)||0,designatedCoachIds:membershipCoachSelectorValues('mp_designatedCoachIdsWrap'),notes:document.getElementById('mp_notes').value.trim(),status};
  await runStandardMutation('membershipPlanSaveBtn',async()=>{
    if(editId){const r=await apiCall('PUT','/membership-plans/'+editId,data);const i=membershipPlans.findIndex(x=>x.id===editId);membershipPlans[i]=r;}
    else{const r=await apiCall('POST','/membership-plans',data);membershipPlans.unshift(r);}
  },{
    successText:'会员方案已保存',
    closeOnSuccess:true,
    refresh:[renderMembershipPlans,renderMemberships]
  });
}
function refreshMembershipOrderPreview(mode='renew'){
  const courtId=document.getElementById('mo_courtId')?.value||'';
  const court=courts.find(c=>c.id===courtId);
  const account=courtMembershipAccount(courtId);
  const planId=document.getElementById('mo_plan')?.value||'';
  const plan=membershipPlans.find(p=>p.id===planId)||membershipPlans[0];
  const purchaseDate=document.getElementById('mo_date')?.value||today();
  const rechargeAmount=document.getElementById('mo_recharge')?.value;
  const bonusAmount=document.getElementById('mo_bonus')?.value;
  const preview=membershipOrderPreview({court,account,plan,rechargeAmount,bonusAmount,purchaseDate});
  const previewEl=document.getElementById('membershipOrderPreview');
  if(previewEl)previewEl.innerHTML=`<div class="flabel">当前状态摘要</div><div style="font-size:12px;color:var(--tb);margin-bottom:8px">${esc(preview.currentStatus)}</div><div style="font-size:12px;color:var(--tb);line-height:1.7">是否重置有效期：${preview.resetsValidity?'是':'否'}<br>折扣变化：${esc(preview.nextDiscountText)}<br>原有权益保留：${preview.keepsExistingBenefits?'保留':'无原有权益'}<br>本次新增权益：${esc(preview.addedBenefits)}<br>新的余额有效期：${esc(preview.nextValidUntil)}<br>新的最晚清零日：${esc(preview.nextHardExpireAt)}</div>${preview.warning?`<div style="margin-top:8px;background:rgba(220,38,38,0.08);border:0.5px solid rgba(220,38,38,0.2);border-radius:8px;padding:8px 10px;color:#b91c1c;font-size:12px">${esc(preview.warning)}</div>`:''}`;
  const saveBtn=document.getElementById('membershipOrderSaveBtn');
  if(saveBtn)saveBtn.textContent=preview.warning?'我了解折扣和有效期变化，确认续充':'保存';
}
function toggleMembershipPriceOverride(){
  const systemAmount=Number(document.getElementById('mo_systemAmount')?.value)||0;
  const finalAmount=Number(document.getElementById('mo_recharge')?.value)||0;
  const wrap=document.getElementById('mo_overrideReasonWrap');
  const reason=document.getElementById('mo_overrideReason');
  const changed=systemAmount!==finalAmount;
  if(wrap)wrap.style.display=changed?'block':'none';
  if(!changed&&reason)reason.value='';
}
function onMembershipOrderPlanChange(value){
  applyMembershipOrderDraft(value);
  refreshMembershipOrderPreview(membershipDrawerOrderMode);
  toggleMembershipPriceOverride();
}
function openMembershipOrderModal(courtId,mode='renew'){
  const court=courts.find(c=>c.id===courtId);if(!court){toast('当前订场用户数据未加载，请刷新后重试','warn');return;}
  const activePlans=membershipPlans.filter(p=>p.status!=='inactive');
  if(!activePlans.length){toast('请先创建会员方案','warn');return;}
  openCourtMembershipPanel(courtId,{mode:'order',orderMode:mode});
}
async function saveMembershipOrder(courtId){
  const data={courtId,membershipAccountId:courtMembershipAccount(courtId)?.id||'',membershipPlanId:document.getElementById('mo_plan').value,purchaseDate:document.getElementById('mo_date').value,rechargeAmount:document.getElementById('mo_recharge').value,bonusAmount:document.getElementById('mo_bonus').value,overrideReason:document.getElementById('mo_overrideReason')?.value.trim()||'',publicLessonCount:parseInt(document.getElementById('mo_publicLesson').value)||0,stringingLaborCount:parseInt(document.getElementById('mo_stringingLabor').value)||0,ballMachineCount:parseInt(document.getElementById('mo_ballMachine').value)||0,level2PartnerCount:parseInt(document.getElementById('mo_level2Partner').value)||0,designatedCoachPartnerCount:parseInt(document.getElementById('mo_designatedCoachPartner').value)||0,designatedCoachIds:membershipCoachSelectorValues('mo_designatedCoachIdsWrap'),notes:document.getElementById('mo_notes').value.trim(),requestKey:`${courtId}-${Date.now()}`};
  if(!data.membershipPlanId){toast('请先创建会员方案','warn');return;}
  const systemAmount=Number(document.getElementById('mo_systemAmount')?.value)||0;
  if(systemAmount!==Number(data.rechargeAmount||0)&&!data.overrideReason){toast('请填写改价原因','warn');return;}
  await runStandardMutation('membershipOrderSaveBtn',async()=>{
    const built=await apiCall('POST','/membership-orders',data);
    if(built?.account){
      const ai=membershipAccounts.findIndex(x=>x.id===built.account.id);
      if(ai>=0)membershipAccounts[ai]=built.account;else membershipAccounts.unshift(built.account);
    }
    if(built?.order)membershipOrders.unshift(built.order);
    if(Array.isArray(built?.benefitLedgerRows))built.benefitLedgerRows.filter(Boolean).forEach(x=>membershipBenefitLedger.unshift(x));
    if(built?.historyRow){
      const ci=courts.findIndex(x=>x.id===courtId);
      if(ci>=0){
        const court={...courts[ci]};
        court.history=[...parseArr(court.history),built.historyRow];
        courts[ci]=court;
      }
    }
  },{
    loadingText:'提交中…',
    successText:'会员已保存',
    refresh:()=>{
      renderMemberships();
      renderCourts();
      openCourtMembershipPanel(courtId,{tab:'overview'});
    }
  });
}
function openMembershipBenefitModal(courtId,mode){
  const account=membershipReadModelAccountForCourt(courtId);if(!account){toast('该订场用户还没有会员账户','warn');return;}
  openMembershipBenefitPickerModal(courtId,mode);
}
function openMembershipBenefitPickerModal(courtId,mode){
  const account=membershipReadModelAccountForCourt(courtId);if(!account){toast('该订场用户还没有会员账户','warn');return;}
  const rows=membershipReadModelBenefitRowsForCourt(courtId);
  if(!rows.length){toast('该订场用户当前没有可操作的赠送权益','warn');return;}
  openCourtMembershipPanel(courtId,{mode:'benefit-picker',benefitMode:mode});
}
function refreshMembershipBenefitConsumePreview(courtId,benefitCode){
  const count=document.getElementById('mb_count')?.value||1;
  const benefit=membershipReadModelBenefitRowsForCourt(courtId).find(row=>row.code===benefitCode);
  const need=Math.abs(parseInt(count)||1);
  let remainingNeed=need;
  const allocations=(benefit?.batches||[]).filter(row=>Number(row.remaining)>0).sort((a,b)=>String(a.benefitValidUntil||'9999').localeCompare(String(b.benefitValidUntil||'9999'))).map(row=>{
    const use=Math.min(remainingNeed,Number(row.remaining)||0);
    remainingNeed-=use;
    return {...row,delta:-use};
  }).filter(row=>row.delta<0);
  const preview={totalRemaining:Number(benefit?.remaining)||0,allocations};
  const el=document.getElementById('membershipBenefitConsumePreview');
  if(!el)return;
  el.innerHTML=`当前总剩余：${preview.totalRemaining} 次<br>优先扣减批次：${preview.allocations.map(row=>`${membershipOrderDisplayText(row.membershipOrderRef)}（到期 ${row.benefitValidUntil||'—'}）-${row.delta}`).join('；')||'—'}${preview.allocations.length>1?'<br>如果当前批次不足，将继续扣减下一批':''}`;
}
function openMembershipBenefitActionModal(courtId,benefitCode,mode){
  const account=membershipReadModelAccountForCourt(courtId);if(!account){toast('该订场用户还没有会员账户','warn');return;}
  openCourtMembershipPanel(courtId,{mode:'benefit-action',benefitMode:mode,benefitCode});
}
function openMembershipBenefitHistoryModal(courtId,benefitCode){
  const account=membershipReadModelAccountForCourt(courtId);if(!account){toast('该订场用户还没有会员账户','warn');return;}
  openCourtMembershipPanel(courtId,{tab:'ledger',benefitCode});
}
function openCourtMembershipLedgerModal(courtId){
  const account=membershipReadModelAccountForCourt(courtId);if(!account){toast('该订场用户还没有会员账户','warn');return;}
  openCourtMembershipPanel(courtId,{tab:'ledger'});
}
function openCourtMembershipBenefitsModal(courtId){
  const court=courts.find(c=>c.id===courtId);if(!court){toast('订场用户不存在','warn');return;}
  openCourtMembershipPanel(courtId,{tab:'rights'});
}
async function saveMembershipBenefit(courtId,mode,benefitCode=''){
  const account=membershipReadModelAccountForCourt(courtId);if(!account)return;
  const count=Math.abs(parseInt(document.getElementById('mb_count').value)||1);
  const label=membershipReadModelBenefitRowsForCourt(courtId).find(row=>row.code===benefitCode)?.label||membershipBenefitLabelForCode(benefitCode,account);
  const data={membershipAccountId:account.id,courtId,benefitCode,benefitLabel:label,delta:mode==='consume'?-count:count,action:mode,reason:document.getElementById('mb_reason').value.trim(),relatedDate:today()};
  if(mode==='supplement')data.membershipOrderRef=document.getElementById('mb_order').value;
  await runStandardMutation('membershipBenefitSaveBtn',async()=>{
    const r=await apiCall('POST','/membership-benefit-ledger',data);
    const rows=Array.isArray(r?.records)?r.records:[r];
    rows.filter(Boolean).forEach(x=>membershipBenefitLedger.unshift(x));
  },{
    successText:'权益流水已保存',
    refresh:()=>{
      renderMemberships();
      renderCourts();
      openCourtMembershipPanel(courtId,{tab:'rights'});
    }
  });
}
function membershipBenefitInlineInputId(benefitCode){
  return `mb_inline_count_${String(benefitCode||'').replace(/[^a-zA-Z0-9_-]/g,'_')}`;
}
async function saveMembershipBenefitInline(button,courtId,mode,benefitCode=''){
  const account=membershipReadModelAccountForCourt(courtId);if(!account)return;
  const count=Math.abs(parseInt(document.getElementById(membershipBenefitInlineInputId(benefitCode))?.value)||1);
  const label=membershipReadModelBenefitRowsForCourt(courtId).find(row=>row.code===benefitCode)?.label||membershipBenefitLabelForCode(benefitCode,account);
  const data={membershipAccountId:account.id,courtId,benefitCode,benefitLabel:label,delta:mode==='consume'?-count:count,action:mode,reason:mode==='consume'?'会员权益使用':'会员权益补发',relatedDate:today()};
  if(mode==='supplement'){
    const latestOrder=membershipReadModelRechargeRowsForCourt(courtId)[0];
    if(!latestOrder){toast('暂无可归属的购买批次','warn');return;}
    data.membershipOrderRef=latestOrder.id;
  }
  await runStandardMutation(button,async()=>{
    const r=await apiCall('POST','/membership-benefit-ledger',data);
    const rows=Array.isArray(r?.records)?r.records:[r];
    rows.filter(Boolean).forEach(x=>membershipBenefitLedger.unshift(x));
  },{
    successText:'权益流水已保存',
    refresh:()=>{
      membershipInlineBenefitAction={benefitCode:'',mode:''};
      renderMemberships();
      renderCourts();
      openCourtMembershipPanel(courtId,{tab:'rights'});
    }
  });
}
async function voidMembership(courtId){
  const account=courtMembershipAccount(courtId);if(!account){toast('该订场用户还没有会员账户','warn');return;}
  const reason=document.getElementById('mv_reason')?.value.trim()||'';
  if(!reason){toast('请填写作废原因','warn');return;}
  await runStandardMutation('membershipVoidBtn',async()=>{
    const res=await apiCall('PUT','/membership-accounts/'+account.id,{status:'voided',voidReason:reason});
    const nextAccount=res?.account||res;
    const nextEvent=res?.event||null;
    const i=membershipAccounts.findIndex(x=>x.id===account.id);
    if(i>=0)membershipAccounts[i]=nextAccount;
    if(nextEvent)membershipAccountEvents.unshift(nextEvent);
  },{
    errorPrefix:'作废失败',
    successText:'会员已作废',
    refresh:()=>{
      renderCourts();
      renderMemberships();
      openCourtMembershipPanel(courtId,{tab:'overview'});
    }
  });
}
function updateCourtBatchButton(){
  const toolbar=document.getElementById('courtBatchToolbar');
  const count=document.getElementById('courtBatchCount');
  const btn=document.getElementById('courtBatchDelBtn');
  const cancelBtn=document.getElementById('courtBatchCancelBtn');
  if(toolbar)toolbar.style.display=courtBatchMode?'flex':'none';
  if(count)count.textContent=`已选 ${selectedCourtIds.size} 条`;
  if(cancelBtn)cancelBtn.style.display=courtBatchMode?'inline-flex':'none';
  if(!btn)return;
  btn.style.display=courtBatchMode?'inline-flex':'none';
  btn.disabled=selectedCourtIds.size===0;
  btn.textContent=selectedCourtIds.size?`批量删除（${selectedCourtIds.size}）`:'批量删除';
}
function setCourtBatchMode(enabled){
  courtBatchMode=!!enabled;
  if(!courtBatchMode){
    selectedCourtIds.clear();
    const selectAll=document.getElementById('courtSelectAll');
    if(selectAll)selectAll.checked=false;
  }
  renderCourts();
}
function toggleCourtSelection(id,checked){
  if(!courtBatchMode)return;
  if(checked)selectedCourtIds.add(id);else selectedCourtIds.delete(id);
  updateCourtBatchButton();
}
function toggleCourtPageSelection(checked){
  if(!courtBatchMode)return;
  document.querySelectorAll('.court-row-cb').forEach(cb=>{cb.checked=checked;if(checked)selectedCourtIds.add(cb.value);else selectedCourtIds.delete(cb.value);});
  updateCourtBatchButton();
}
function renderStandardOptionLabel(opt){
  const label=String(opt?.label??opt?.value??'');
  return opt&&opt.count!==undefined?`${label}（${Number(opt.count)||0}）`:label;
}
function withStandardFilterCounts(options,rows,match){
  const source=Array.isArray(rows)?rows:[];
  return (options||[]).map(opt=>{
    const item=typeof opt==='string'?{value:opt,label:opt}:opt;
    const value=item.value;
    const count=String(value||'')===''?source.length:source.filter(row=>match(row,value,item)).length;
    return {...item,count};
  });
}
function renderCourtDropdownHtml(id,label,options,value,isForm=false,onchange=''){
  return renderStandardDropdownHtml(id,label,options,value,isForm,onchange);
}
function closeCourtDropdowns(){
  return closeStandardDropdowns();
}
function toggleCourtDropdown(id,event){
  return toggleStandardDropdown(id,event);
}
function selectCourtDropdownItem(id,value,label,event){
  return selectStandardDropdownItem(id,value,label,event);
}
function setCourtDropdownValue(id,value,label=''){
  return setStandardDropdownValue(id,value,label);
}
document.addEventListener('click',closeStandardDropdowns);
function renderCourtMiniBar(amount,total=0,low=false){
  const safeAmount=Math.max(0,parseFloat(amount)||0);
  const safeTotal=Math.max(safeAmount,parseFloat(total)||0);
  const pct=safeTotal>0?Math.min(100,Math.round(safeAmount/safeTotal*100)):0;
  return `<div class="tms-mini-bar"><div class="tms-mini-bar-bg" style="width:100%"></div><div class="tms-mini-bar-fill" style="width:${pct}%"></div><div class="tms-mini-bar-text">¥${fmt(safeAmount)}${low?' · 低余额':''}</div></div>`;
}
function renderCourtCellText(value,mutedWhenEmpty=true){
  return renderStandardCellText(value,mutedWhenEmpty);
}
function renderCourtRecentBookingCell(date){
  const raw=String(date||'').trim();
  const text=raw?daysAgoText(raw):'-';
  return `<div class="tms-cell-text court-recent-booking-cell">${esc(text)}</div>`;
}
function renderCourtBookingCountCell(value){
  const count=Number(value)||0;
  return `<div class="tms-cell-text">${count}<span class="tms-cell-unit">次</span></div>`;
}
function renderCourtMoneyCell(value){
  return `<div class="tms-cell-text">¥${fmt(value)}</div>`;
}
function renderCourtMobileCards(list){
  const host=document.getElementById('courtMobileCards');if(!host)return;
  if(!list.length){host.innerHTML='<div class="tms-empty-state"><div class="tms-empty-title">暂无订场用户</div><div class="tms-empty-desc">调整搜索或筛选后再看</div></div>';return;}
  host.innerHTML=list.map(item=>{const accountState=courtAccountStateLabel(item),memberLabel=item.membershipTierLabel&&item.membershipTierLabel!=='-'?item.membershipTierLabel:'-',cleanNotes=courtCleanUserNotes(item.notesSummary);return `<article class="admin-h5-list-card admin-h5-court-card"><div class="admin-h5-card-head"><div><strong>${esc(item.displayName)}</strong><span>${esc(item.phone||'-')}</span></div><span class="tms-tag ${accountState==='会员账户'?'tms-tag-green':''}">${esc(accountState)}</span></div><div class="admin-h5-card-tags"><span class="tms-tag">${esc(item.campusName||'-')}</span><span class="tms-tag ${courtMembershipTierTagClass(memberLabel)}">${esc(memberLabel)}</span></div><div class="admin-h5-card-grid"><span><b>会员余额</b>¥${esc(fmt(item.balance))}</span><span><b>累计充值</b>¥${esc(fmt(item.totalDeposit))}</span><span><b>最近订场</b>${esc(item.lastBookingDate?daysAgoText(item.lastBookingDate):'-')}</span><span><b>会员订场</b>${esc(Number(item.memberBookingCount)||0)} 次</span><span><b>累计订场</b>${esc(Number(item.bookingCount)||0)} 次</span><span><b>累计消费</b>¥${esc(fmt(item.bookingAmount))}</span><span><b>跟进人</b>${esc(item.owner||'-')}</span><span><b>储值态度</b>${esc(item.depositAttitude||'-')}</span></div><p>${esc(cleanNotes||'暂无备注')}</p><div class="admin-h5-card-actions"><button type="button" onclick="openCourtMembershipPanel('${item.id}')">查看</button><button type="button" onclick="openCourtFinanceModal('${item.id}')">订场</button></div></article>`;}).join('');
}
function courtAccountStateLabel(value){
  if(value&&typeof value==='object'){
    const status=String(value.membershipStatusCode||value.account?.status||'').trim();
    const type=String(value.accountType||'').trim();
    return type==='会员账户'||['active','extended'].includes(status)?'会员账户':'普通账户';
  }
  return String(value||'').trim()==='会员账户'?'会员账户':'普通账户';
}
function courtCleanUserNotes(value){
  const systemPattern=/(合并重复订场账户|合并自|系统|导入|私教课CSV.*导入|马坡补账|网球兄弟.*csv|修数|修正|补账|补录|历史迁移|数据修复)/;
  return String(value||'')
    .split(/\n+/)
    .map(line=>line
      .replace(/\[(?:合并重复订场账户|合并自|系统|导入|修数|修正|补账|补录|历史迁移|数据修复)[^\]]*\]/g,'')
      .replace(/(^|[；;，,。])\s*合并自[^；;，,。\n]*/g,'$1')
      .trim())
    .filter(line=>line&&!systemPattern.test(line))
    .join('\n');
}
function renderCourtEmptyText(value){
  return renderStandardEmptyText(value);
}
function courtDateButtonHtml(id,value,label='年 / 月 / 日',onchange=''){
  const show=value||label;
  const handler=onchange?`;${onchange}`:'';
  return `<div class="filter-date-wrap"><button class="coach-date-btn" id="${id}_btn" onclick="toggleGlobalDatePicker(event,'${id}','${id}_btn','${label}')" type="button">${esc(show)}</button><input class="filter-hidden-date" id="${id}" type="date" value="${esc(value||'')}" onchange="syncDateButton('${id}','${id}_btn','${label}')${handler}"></div>`;
}
function scheduleDateTimeControls(prefix,value='',label='日期'){
  const raw=String(value||'').trim().replace(' ','T');
  const datePart=raw?raw.slice(0,10):'';
  const timePart=raw&&raw.length>=16?raw.slice(11,16):'';
  return `<div class="court-date-row"><div style="flex:1">${courtDateButtonHtml(prefix+'_date',datePart,label)}</div><div style="width:132px">${renderStandardDropdownHtml(prefix+'_time','时间',getCourtTimeOptions(timePart||'08:00'),timePart||'08:00',true,'refreshSchEntitlementOptions')}</div></div>`;
}
function scheduleTimeRangeControls(dateValue='',startValue='09:00',endValue='10:00'){
  return `<div class="court-date-row schedule-time-range"><div style="flex:0 0 184px;width:184px">${courtDateButtonHtml('sch_date',dateValue,'上课日期','refreshScheduleTimeDerivedFields()')}</div><div style="flex:0 0 116px;width:116px">${renderStandardDropdownHtml('sch_startTime','开始时间',getScheduleTimeOptions(startValue||'09:00'),startValue||'09:00',true,'handleScheduleStartTimeChange')}</div><div style="flex:0 0 auto;align-self:center;color:#8C7B6E;font-size:12px;white-space:nowrap">至</div><div style="flex:0 0 116px;width:116px">${renderStandardDropdownHtml('sch_endTime','结束时间',getScheduleTimeOptions(endValue||'10:00'),endValue||'10:00',true,'refreshScheduleTimeDerivedFields')}</div></div>`;
}
function scheduleComposeDateTime(dateId,timeId){
  const date=document.getElementById(dateId)?.value||'';
  const time=document.getElementById(timeId)?.value||'';
  if(!date)return '';
  return `${date} ${time||'00:00'}`;
}
function resetModalActions(){
  const actions=document.getElementById('mActions');
  if(!actions)return;
  actions.innerHTML='';
  actions.style.display='none';
  actions.className='mactions';
}
function renderCourtHistoryItems(hist){
  return hist.length?hist.map(h=>{
    const type=h.type||'消费';
    const amount=Math.abs(parseFloat(h.amount)||0);
    const cls=type==='充值'?'tms-tag-green':'tms-tag-red';
    const amountCls=type==='充值'?'pos':'neg';
    const sign=type==='充值'?'+':'-';
    const dateText=h.occurredDate||h.date||'—';
    const recordedLabel=h.sourceType==='schedule'&&isStoredValuePayMethod(h.payMethod)?'扣款时间':'录入时间';
    const recordedText=h.recordedAt||h.createdAt?`${recordedLabel} ${formatMembershipLedgerTime(h.recordedAt||h.createdAt)}`:'';
    const meta=[h.category,h.payMethod,recordedText].filter(Boolean).join(' · ')||'—';
    return `<div class="tms-history-item"><div style="width:110px;">${esc(dateText)}</div><span class="tms-tag ${cls}">${esc(type)}</span><div class="amount ${amountCls}">${sign}¥${fmt(amount)}</div><div class="desc">${esc(meta)}</div></div>`;
  }).join(''):'<div class="empty"><p>暂无记录</p></div>';
}
function getCourtTimeOptions(selected='08:00'){
  const opts=[];
  for(let h=6;h<=22;h++){
    const hh=String(h).padStart(2,'0');
    opts.push({value:`${hh}:00`,label:`${hh}:00`});
    if(h!==22)opts.push({value:`${hh}:30`,label:`${hh}:30`});
  }
  return opts.map(opt=>({...opt,active:opt.value===selected}));
}
function getScheduleTimeOptions(selected='09:00'){
  const opts=[];
  for(let h=7;h<=22;h++){
    const hh=String(h).padStart(2,'0');
    opts.push({value:`${hh}:00`,label:`${hh}:00`});
    if(h!==22)opts.push({value:`${hh}:30`,label:`${hh}:30`});
  }
  return opts.map(opt=>({...opt,active:opt.value===selected}));
}
function courtAccountListViewSortMetric(item,key){
  if(key==='balance')return {empty:false,value:Number(item?.balance)||0};
  if(key==='spentAmount')return {empty:false,value:Number(item?.totalSpent)||0};
  if(key==='memberBookingCount')return {empty:false,value:Number(item?.memberBookingCount)||0};
  if(key==='bookingCount')return {empty:false,value:Number(item?.bookingCount)||0};
  if(key==='bookingAmount')return {empty:false,value:Number(item?.bookingAmount)||0};
  if(key==='lastBookingDate'){
    const raw=String(item?.lastBookingDate||'').trim();
    if(!raw||raw==='-'||raw==='—')return {empty:true,value:0};
    const timeValue=dateMs(raw);
    return {empty:Number.isNaN(timeValue),value:Number.isNaN(timeValue)?0:timeValue};
  }
  if(['validUntil','recentFollowUpDate','nextFollowUpDate'].includes(key)){
    const raw=String((key==='validUntil'?item?.membershipValidUntil:item?.[key])||'').trim();
    if(!raw||raw==='-'||raw==='—')return {empty:true,value:0};
    const timeValue=dateMs(raw);
    return {empty:Number.isNaN(timeValue),value:Number.isNaN(timeValue)?0:timeValue};
  }
  const numeric=parseFloat(item?.[key]);
  return {empty:false,value:Number.isFinite(numeric)?numeric:0};
}
function summarizeCourtAccountListItems(items=[]){
  const memberItems=items.filter(item=>item?.membershipStatusCode&&!['voided','cleared'].includes(String(item.membershipStatusCode)));
  const totalBookingAmount=items.reduce((sum,item)=>sum+(Number(item?.bookingAmount)||0),0);
  const totalMemberBookingAmount=items.reduce((sum,item)=>sum+(Number(item?.memberBookingAmount)||0),0);
  return {
    totalCount:items.length,
    totalMemberCount:memberItems.length,
    totalBalance:memberItems.reduce((sum,item)=>sum+(Number(item?.balance)||0),0),
    totalDeposit:items.reduce((sum,item)=>sum+(Number(item?.totalDeposit)||0),0),
    totalSpent:items.reduce((sum,item)=>sum+(Number(item?.totalSpent)||0),0),
    totalReceived:items.reduce((sum,item)=>sum+(Number(item?.totalReceived)||0),0),
    totalBookingCount:items.reduce((sum,item)=>sum+(Number(item?.bookingCount)||0),0),
    totalBookingHours:items.reduce((sum,item)=>sum+(Number(item?.bookingHours)||0),0),
    totalMemberBookingCount:items.reduce((sum,item)=>sum+(Number(item?.memberBookingCount)||0),0),
    totalMemberBookingAmount,
    totalGuestBookingCount:items.reduce((sum,item)=>sum+(Number(item?.guestBookingCount)||0),0),
    totalGuestBookingAmount:Math.max(0,totalBookingAmount-totalMemberBookingAmount),
    totalBookingAmount
  };
}
function courtRatioText(part,total,digits=0){
  const safeTotal=Number(total)||0;
  if(safeTotal<=0)return '0%';
  const ratio=((Number(part)||0)/safeTotal)*100;
  if(digits>0&&ratio<10)return `${Number(ratio.toFixed(digits))}%`;
  return `${Math.round(ratio)}%`;
}
function courtStatValuePair(left,right){
  return `<div class="tms-stat-value court-split-value"><span>${left}</span><span class="court-stat-slash">｜</span><span>${right}</span></div>`;
}
function courtStatPercent(value,digits=0){
  return `<span class="court-stat-percent">(${courtRatioText(value.part,value.total,digits)})</span>`;
}
function courtStatInlinePercent(value,digits=0){
  return `<span class="court-stat-percent">${courtRatioText(value.part,value.total,digits)}</span>`;
}
function renderCourtStatsCards(summary={}){
  const totalUsers=Number(summary.totalCount)||0;
  const memberUsers=Number(summary.totalMemberCount)||0;
  const bookingCount=Number(summary.totalBookingCount)||0;
  const bookingHours=Number(summary.totalBookingHours)||0;
  const memberBookingCount=Number(summary.totalMemberBookingCount)||0;
  const guestBookingCount=Number(summary.totalGuestBookingCount)||Math.max(0,bookingCount-memberBookingCount);
  const bookingAmount=Number(summary.totalBookingAmount)||0;
  const memberBookingAmount=Number(summary.totalMemberBookingAmount)||0;
  const guestBookingAmount=Number(summary.totalGuestBookingAmount)||Math.max(0,bookingAmount-memberBookingAmount);
  const totalReceived=Number(summary.totalReceived)||0;
  const card=(title,value,caption,extraClass='')=>`<div class="tms-stat-card court-dashboard-card ${extraClass}"><div class="tms-stat-label">${title}</div>${value}<div class="tms-stat-sub">${caption}</div></div>`;
  document.getElementById('courtStatsRow').classList.add('court-dashboard-stats');
  document.getElementById('courtStatsRow').innerHTML=[
    card('总订场用户',`<div class="tms-stat-value">${totalUsers}</div>`,''),
    card('会员用户',`<div class="tms-stat-value">${memberUsers} ${courtStatInlinePercent({part:memberUsers,total:totalUsers},1)}</div>`,'会员用户 / 总订场用户占比'),
    card('客群次数对比',courtStatValuePair(`${guestBookingCount}${courtStatInlinePercent({part:guestBookingCount,total:bookingCount})}`,`${memberBookingCount}${courtStatInlinePercent({part:memberBookingCount,total:bookingCount})}`),'散客次数占比 vs 会员次数占比'),
    card('订场总实收',`<div class="tms-stat-value">¥${fmt(totalReceived)}</div>`,''),
    card('散客消费',`<div class="tms-stat-value">¥${fmt(guestBookingAmount)} ${courtStatInlinePercent({part:guestBookingAmount,total:totalReceived})}</div>`,'散客消费金额 / 订场总实收金额占比')
  ].join('');
}
function renderCourtAccountListView(){
  const q=(document.getElementById('courtSearch')?.value||'').toLowerCase();
  document.getElementById('page-courts')?.classList.toggle('court-batch-mode',courtBatchMode);
  window.__courtAccountListViewCompare=courtAccountListViewCompareData||null;
  const visibleItems=(courtAccountListViewData?.items||[]).filter(Boolean);
  const base=visibleItems.filter(item=>campus==='all'||item.campusCode===campus);
  const filters=courtAccountListViewData?.filters||{};
  const scopedFilters={
    owners:campus==='all'?filters.owners:[...new Set(base.map(item=>String(item.owner||'').trim()).filter(Boolean))],
    accountTypes:['会员账户','普通账户']
  };
  renderCourtHeaderFilters(base,scopedFilters);
  const dateScopedBase=applyCourtDateRangeFilter(base,activeCourtDateRange());
  let list=dateScopedBase.filter(item=>{
    if(campus!=='all'&&item.campusCode!==campus)return false;
    if(courtOwnerFilterValue&&String(item.owner||'').trim()!==courtOwnerFilterValue)return false;
    if(courtAccountTypeFilterValue&&courtAccountStateLabel(item)!==courtAccountTypeFilterValue)return false;
    return searchHit(q,item.displayName,item.phone,item.campusName,item.owner,item.depositAttitude,item.notesSummary,item.balance,item.totalDeposit,item.totalSpent,item.totalReceived,item.linkedStudentSummary,item.membershipTierLabel,item.membershipStatus);
  });
  const sortedList=[...list];
  if(courtSortKey){
    sortedList.sort((a,b)=>{
      const av=courtAccountListViewSortMetric(a,courtSortKey);
      const bv=courtAccountListViewSortMetric(b,courtSortKey);
      if(av.empty!==bv.empty)return av.empty?1:-1;
      return courtSortDir==='desc'?bv.value-av.value:av.value-bv.value;
    });
  }else{
    sortedList.sort((a,b)=>String(b.updatedAt||b.createdAt||'').localeCompare(String(a.updatedAt||a.createdAt||'')));
  }
  const summary=courtAccountListViewData?.summary||{};
  renderCourtStatsCards(summary);
  const isMobileList=document.body.classList.contains('admin-mobile');
  const total=sortedList.length,pages=isMobileList?1:Math.max(1,Math.ceil(total/courtPageSize));
  if(courtPage>pages)courtPage=pages;
  const slice=isMobileList?sortedList:sortedList.slice((courtPage-1)*courtPageSize,courtPage*courtPageSize);
  const pager=document.querySelector('#page-courts .tms-pagination');
  if(pager)pager.style.display=!isMobileList&&pages>1?'flex':'none';
  document.getElementById('courtPagerInfo').innerHTML=renderPagerInfoHtml(total);
  renderCourtPagerControls(total,pages);
  const selectAll=document.getElementById('courtSelectAll');
  if(selectAll){
    selectAll.checked=!!slice.length&&slice.every(item=>selectedCourtIds.has(item.id));
    selectAll.disabled=!courtBatchMode;
  }
  document.getElementById('courtTbody').innerHTML=slice.length?slice.map(item=>{
    const w=!!item.lowBalance;
    const accountState=courtAccountStateLabel(item);
    const accountTagClass=accountState==='会员账户'?'tms-tag-green':'';
    const memberTagClass=courtMembershipTierTagClass(item.membershipTierLabel);
    const memberCell=item.membershipTierLabel&&item.membershipTierLabel!=='-'?`<span class="tms-tag ${memberTagClass}">${esc(renderStandardEmptyText(item.membershipTierLabel))}</span>`:renderStandardCellText('-');
    const cleanNotes=courtCleanUserNotes(item.notesSummary);
    return `<tr class="${w?'warn-row':''}"><td class="tms-sticky-l" data-court-name-cell="1" style="padding-left:20px"><div class="tms-court-row-main"><input type="checkbox" class="tms-checkbox court-row-cb" value="${item.id}" ${selectedCourtIds.has(item.id)?'checked':''} onchange="toggleCourtSelection('${item.id}',this.checked)"><span class="tms-text-primary tms-court-name-cell">${esc(item.displayName)}</span></div></td><td>${renderStandardCellText(item.phone)}</td><td>${renderStandardCellText(item.campusName)}</td><td><span class="tms-tag ${accountTagClass}">${esc(accountState)}</span></td><td>${memberCell}</td><td>${renderCourtMiniBar(item.balance,item.totalDeposit,w)}</td><td>${renderCourtRecentBookingCell(item.lastBookingDate)}</td><td>${renderCourtBookingCountCell(item.memberBookingCount)}</td><td>${renderCourtBookingCountCell(item.bookingCount)}</td><td>${renderCourtMoneyCell(item.bookingAmount)}</td><td>${renderStandardCellText(item.owner)}</td><td>${renderStandardCellText(item.depositAttitude)}</td><td>${renderStandardTooltipText(cleanNotes,'tms-text-remark tms-text-remark-1 court-note-cell')}</td><td class="tms-sticky-r tms-action-cell" style="width:128px;padding-right:20px;justify-content:flex-end"><span class="tms-action-link" onclick="openCourtMembershipPanel('${item.id}')">查看</span><span class="tms-action-link" onclick="openCourtFinanceModal('${item.id}')">订场</span></td></tr>`;
  }).join(''):'<tr><td colspan="14"><div class="tms-empty-state"><div class="tms-empty-title">暂无订场用户</div><div class="tms-empty-desc">调整搜索或筛选后再看</div></div></td></tr>';
  renderCourtMobileCards(slice);
  updateCourtBatchButton();
  document.querySelectorAll('#page-courts [data-court-sort]').forEach(el=>el.classList.remove('asc','desc'));
  if(courtSortKey){
    const active=document.querySelector(`#page-courts [data-court-sort="${courtSortKey}"]`);
    if(active)active.classList.add(courtSortDir);
  }
}
function renderCourts(){
  if(!courtAccountListViewData||(typeof courtAccountListViewDataIsCurrent==='function'&&!courtAccountListViewDataIsCurrent())){
    renderCourtPageLoading();
    if(typeof loadCourtReadModelGuardData==='function'){
      loadCourtReadModelGuardData({force:true}).then(()=>{
        if(currentPage==='courts')renderCourts();
      }).catch(e=>{
        if(String(e.message||'').includes('Token')||String(e.message||'').includes('登录')){doLogout();return;}
        renderCourtTableError(String(e.message||e));
      });
      return;
    }
    renderCourtTableError('统一订场会员读模型未加载');
    return;
  }
  renderCourtAccountListView();
}
function courtRecRow(h){
  const type=h.type||'消费',amount=Math.abs(parseFloat(h.amount)||0);
  const cls=type==='充值'?'b-green':type==='退款'||type==='冲正'?'b-gray':'b-red';
  const sign=type==='充值'?'+':type==='消费'?'-':type==='冲正'?'冲':'';
  const st=h.studentId?students.find(s=>s.id===h.studentId):null;
  const source=h.source==='import'?'导入':'';
  const booking=h.category==='订场'&&h.startTime&&h.endTime?`${h.startTime}-${h.endTime}${h.venue?' '+h.venue:''}`:'';
  const meta=[source,h.category,h.payMethod,booking,st?.name].filter(Boolean).map(esc).join(' · ');
  return `<div class="rec-item"><span class="rec-date">${h.date}</span><span class="badge ${cls}" style="font-size:10px">${esc(type)}</span><span class="rec-amt ${type==='充值'?'plus':'minus'}">${sign}¥${fmt(amount)}</span><span class="rec-note">${meta}${h.note?' · '+esc(h.note):''}</span></div>`;
}
let membershipDetailActiveTab='overview',membershipDrawerMode='view',membershipDrawerOrderMode='renew',membershipDrawerBenefitMode='',membershipDrawerBenefitCode='';
let membershipInlineBenefitAction={benefitCode:'',mode:''};
let membershipBookingEntryOpen=false;
function membershipDetailHeroHtml(court){
  const account=membershipReadModelAccountForCourt(court)||courtMembershipAccount(court?.id);
  const statusMeta=membershipStatusTagMeta(account);
  const title=court?.displayName||courtDisplayName(court)||court?.name||'会员账户';
  const campusText=court?.campusName||cn(court?.campus||court?.campusCode);
  return renderDetailDrawerHero({
    title,
    avatar:title.slice(0,1),
    subtitle:[court?.phone,campusText].filter(Boolean).join(' · '),
    statusHtml:`<span class="${esc(statusMeta.tagClass)}">${esc(statusMeta.text)}</span>`
  });
}
function membershipDetailTabsHtml(active='overview'){
  return renderDetailDrawerTabs(active,[['overview','账户概览'],['booking','订场'],['rights','权益'],['orders','充值记录'],['ledger','权益流水']],{onClick:'setMembershipDetailTab'});
}
function setMembershipDetailTab(tab){
  membershipDetailActiveTab=['overview','booking','rights','orders','ledger'].includes(tab)?tab:'overview';
  membershipDrawerMode='view';
  membershipDrawerBenefitCode='';
  membershipBookingEntryOpen=false;
  const courtId=document.getElementById('overlay')?.dataset.membershipCourtId||'';
  if(courtId)openMembershipDrawer(courtId);
}
function membershipAccountActionButtons(court){
  const account=membershipReadModelAccountForCourt(court)||courtMembershipAccount(court?.id);
  const visible=membershipActionVisibility(account);
  const buttons=[
    visible.firstOpen?`<button type="button" class="schedule-detail-action" onclick="openMembershipOrderModal('${court.id}','first_open')">首次开卡</button>`:'',
    visible.reopen?`<button type="button" class="schedule-detail-action" onclick="openMembershipOrderModal('${court.id}','reopen')">重新开卡</button>`:'',
    visible.renew?`<button type="button" class="schedule-detail-action" onclick="openMembershipOrderModal('${court.id}','renew')">续充会员</button>`:'',
    visible.void?`<button type="button" class="schedule-detail-action danger" onclick="openCourtMembershipPanel('${court.id}',{mode:'void'})">作废会员</button>`:''
  ].filter(Boolean).join('');
  return buttons;
}
function membershipDangerActionHtml(court){
  const account=courtMembershipAccount(court?.id);
  const visible=membershipActionVisibility(account);
  if(!visible.void)return '';
  return `<div class="membership-danger-action"><div class="tms-field-help">作废后折扣失效，权益不可再使用。</div><button type="button" class="schedule-detail-action danger" onclick="openCourtMembershipPanel('${court.id}',{mode:'void'})">作废会员</button></div>`;
}
function membershipOrderBenefitLinesHtml(order){
  const lines=String(membershipOrderBenefitSummaryHtml(order)||'').split('；').map(x=>x.trim()).filter(Boolean);
  if(!lines.length)return '-';
  return `<div class="membership-order-benefit-lines">${lines.map(line=>`<div class="membership-order-benefit-line">${esc(line)}</div>`).join('')}</div>`;
}
function courtMembershipPanelHtml(court){
  const model=membershipReadModelItemForCourt(court);
  const account=model?.membershipAccount||null;
  const finance=membershipReadModelFinanceForCourt(court);
  const rechargeRows=membershipReadModelRechargeRowsForCourt(court);
  const latestOrder=rechargeRows[0]||null;
  const discountText=account?.status==='voided'?'折扣失效':model?.membershipDiscountText||'-';
  const memberText=[account?.memberLabel,model?.membershipTierLabel].filter(x=>x&&x!=='-'&&x!=='—').join(' · ')||'-';
  const bookingSummary=membershipReadModelBookingForCourt(court);
  const voidInfoHtml=account?.status==='voided'?renderDetailDrawerCard('作废信息',[
    renderDetailDrawerField('作废时间',formatMembershipLedgerTime(account.voidedAt)),
    renderDetailDrawerField('作废人',account.voidedBy||'-'),
    renderDetailDrawerField('作废原因',account.voidReason||'-',{full:true})
  ].join('')):'';
  const memberFields=account?[
    renderDetailDrawerField('当前会员',memberText),
    renderDetailDrawerField('开卡日期',latestOrder?.purchaseDate||model?.firstOpenDate||'-'),
    renderDetailDrawerField('实收金额',latestOrder?`¥${fmt(latestOrder.paidAmount)}`:'-'),
    renderDetailDrawerField('赠送金额',latestOrder?`¥${fmt(latestOrder.bonusAmount)}`:'-'),
    renderDetailDrawerField('当前折扣',discountText),
    renderDetailDrawerField('余额有效期',model?.membershipValidUntil||account?.validUntil||'-'),
    renderDetailDrawerField('清零时间',account?.hardExpireAt||'-')
  ]:[];
  const editAction=`<button type="button" class="schedule-detail-action" onclick="editCourtProfileInline('${court.id}')">编辑资料</button>`;
  const profile=renderDetailDrawerCard('基本信息',courtProfileReadonlyHtml(court),{actionsHtml:editAction});
  const overview=renderDetailDrawerCard('会员账户',[
    renderDetailDrawerField('账户类型',account?'会员账户':'普通账户'),
    renderDetailDrawerField('累计充值',`¥${fmt(finance.totalDeposit)}`),
    renderDetailDrawerField('累计消费',`¥${fmt(finance.spentAmount)}`),
    renderDetailDrawerField('当前余额',`¥${fmt(finance.balance)}`),
    renderDetailDrawerField('累计订场',`${Number(model?.bookingCount??bookingSummary.count)||0} 次`),
    ...memberFields,
    renderDetailDrawerField('充值备注',latestOrder?.notes||'-',{full:true})
  ].join(''),{actionsHtml:membershipAccountActionButtons(court)});
  return `${profile}${overview}${voidInfoHtml}`;
}
function membershipOrdersDrawerHtml(court){
  const orders=membershipReadModelRechargeRowsForCourt(court);
  const rows=orders.length?orders.map(order=>{
    const custom=!!order.customAdjustment;
    const title=`${esc(order.purchaseDate||'-')} · ${esc(order.membershipPlanName||'-')}`;
    const tag=custom?`<span class="tms-tag tms-tag-red">个性化调整</span>`:'';
    return `<div class="membership-order-row"><div class="membership-order-head"><div class="membership-order-title"><strong>${title}</strong>${tag}</div><span class="membership-order-amounts">实收 ¥${fmt(order.paidAmount)} · 赠送 ¥${fmt(order.bonusAmount)} · ${esc(membershipDiscountText(order.discountRate))}</span></div>${esc(order.benefitSummary||'-')}</div>`;
  }).join(''):'<div class="student-detail-empty">暂无充值记录</div>';
  return renderDetailDrawerCard('充值记录',rows,{useGrid:false});
}
function openMembershipBenefitInlineEditor(courtId,benefitCode,mode){
  membershipInlineBenefitAction={benefitCode,mode};
  openCourtMembershipPanel(courtId,{tab:'rights'});
}
function closeMembershipBenefitInlineEditor(courtId){
  membershipInlineBenefitAction={benefitCode:'',mode:''};
  openCourtMembershipPanel(courtId,{tab:'rights'});
}
function membershipRightsDrawerHtml(court){
  const account=membershipReadModelAccountForCourt(court);
  const rows=membershipReadModelBenefitRowsForCourt(court);
  const visible=membershipActionVisibility(account);
  const content=`<div class="membership-rights-table">${renderDetailDrawerTable({
    minWidth:'510px',
    columns:[
      {label:'权益',key:'label',width:'150px',render:row=>`${row.label}${membershipBenefitNote(row)}`},
      {label:'总次数',key:'total',width:'70px',render:row=>`${row.total}${row.unit}`},
      {label:'已消耗',key:'used',width:'70px',render:row=>`${membershipBenefitUsedCount(row)}${row.unit}`},
      {label:'剩余',key:'remaining',width:'70px',render:row=>`${row.remaining}${row.unit}`},
      {label:'操作',html:true,width:'150px',align:'right',className:'membership-rights-action-col',cellClassName:'membership-rights-action-cell',render:row=>[
        membershipInlineBenefitAction.benefitCode===row.code&&membershipInlineBenefitAction.mode?`<div class="membership-inline-editor"><span>${membershipInlineBenefitAction.mode==='consume'?'消耗':'补发'}次数</span><input class="membership-inline-count" id="${membershipBenefitInlineInputId(row.code)}" type="number" min="1" step="1" value="1"><button type="button" class="tms-action-link membership-inline-action" onclick="saveMembershipBenefitInline(this,'${court.id}','${membershipInlineBenefitAction.mode}','${row.code}')">确认</button><button type="button" class="tms-action-link membership-inline-action muted" onclick="closeMembershipBenefitInlineEditor('${court.id}')">取消</button></div>`:'',
        membershipInlineBenefitAction.benefitCode===row.code&&membershipInlineBenefitAction.mode?'':`<div class="membership-inline-actions">${visible.consume?`<button type="button" class="tms-action-link membership-inline-action" onclick="openMembershipBenefitInlineEditor('${court.id}','${row.code}','consume')">消耗</button>`:''}${visible.supplement?`<button type="button" class="tms-action-link membership-inline-action" onclick="openMembershipBenefitInlineEditor('${court.id}','${row.code}','supplement')">补发</button>`:''}</div>`
      ].filter(Boolean).join('')||'-'}
    ],
    rows,
    emptyText:'暂无可用权益'
  })}</div>`;
  return renderDetailDrawerCard('权益列表',content,{useGrid:false});
}
function membershipLedgerDrawerHtml(court){
  const account=membershipReadModelAccountForCourt(court);
  if(!account)return renderDetailDrawerCard('权益流水','<div class="student-detail-empty">暂无权益流水</div>',{useGrid:false});
  const rows=membershipReadModelLedgerRowsForCourt(court).filter(l=>!membershipDrawerBenefitCode||l.benefitCode===membershipDrawerBenefitCode);
  const body=rows.length?renderDetailDrawerTable({
    minWidth:'520px',
    columns:[
      {label:'时间',key:'time',render:r=>formatMembershipLedgerTime(r.createdAt||r.relatedDate)},
      {label:'权益',key:'benefitLabel',render:r=>r.benefitLabel||r.benefitCode},
      {label:'变动',key:'delta',render:r=>`${parseInt(r.delta)>0?'+':''}${parseInt(r.delta)||0}${r.unit||'次'}`},
      {label:'动作',key:'action',render:r=>membershipLedgerActionText(r.action)},
      {label:'原因',key:'reason'}
    ],
    rows,
    emptyText:'暂无权益流水'
  }):'<div class="student-detail-empty">暂无权益流水</div>';
  return renderDetailDrawerCard(membershipDrawerBenefitCode?'权益明细':'权益流水',body,{useGrid:false});
}
function membershipOrderDrawerHtml(court){
  const activePlans=membershipPlans.filter(p=>p.status!=='inactive');
  if(!activePlans.length)return renderDetailDrawerCard('开通会员','请先创建会员方案',{useGrid:false});
  const title=membershipDrawerOrderMode==='first_open'?'首次开卡':membershipDrawerOrderMode==='reopen'?'重新开卡':'续充会员';
  const firstPlanId=activePlans[0]?.id||'';
  const planOptions=activePlans.map(p=>({value:p.id,label:`${p.name} · ¥${fmt(p.rechargeAmount)}`}));
  const help=`<div class="membership-drawer-help">余额有效期按支付日期起算 12 个月<br>若到期时仍有余额，可自动进入延续期，最长至 24 个月<br>低于原合规档位续充时，余额有效期不会重置<br>每批赠送权益有效期 12 个月<br>余额由充值和消费自动计算，不能在这里手动改<br>系统创建日期只用于留痕，不影响会员有效期<br>当前订场折扣按最近一次充值档位生效</div>`;
  const form=`<input type="hidden" id="mo_courtId" value="${esc(court.id)}"><div id="membershipOrderPreview" class="membership-drawer-preview"></div><div class="tms-form-row"><div class="tms-form-item full-width"><label class="tms-form-label">会员方案 *</label>${renderStandardDropdownHtml('mo_plan','会员方案 *',planOptions,firstPlanId,true,'onMembershipOrderPlanChange')}</div></div><div class="tms-form-row"><div class="tms-form-item"><label class="tms-form-label">支付日期</label>${courtDateButtonHtml("mo_date",today(),"支付日期")}</div><div class="tms-form-item"><label class="tms-form-label">系统价格</label><input class="finput tms-form-control" id="mo_systemAmount" type="number" value="0" readonly></div></div><div class="tms-form-row"><div class="tms-form-item"><label class="tms-form-label">实收/充值金额</label>${membershipStepperHtml('mo_recharge','','1','默认取方案金额')}</div><div class="tms-form-item"><label class="tms-form-label">赠送金额</label>${membershipStepperHtml('mo_bonus','','1','默认取方案赠送')}</div></div><div class="tms-form-row" id="mo_overrideReasonWrap" style="display:none"><div class="tms-form-item full-width"><label class="tms-form-label">改价原因</label><input class="finput tms-form-control" id="mo_overrideReason" placeholder="实际成交价与系统价格不一致时必填"></div></div><details class="membership-drawer-details" open><summary>本次额外赠送</summary><div class="tms-form-row"><div class="tms-form-item"><label class="tms-form-label">大师公开课本次调整</label>${membershipStepperHtml('mo_publicLesson','','1')}</div><div class="tms-form-item"><label class="tms-form-label">穿线免手工费本次调整</label>${membershipStepperHtml('mo_stringingLabor','','1')}</div></div><div class="tms-form-row"><div class="tms-form-item"><label class="tms-form-label">发球机免费本次调整</label>${membershipStepperHtml('mo_ballMachine','','1')}</div><div class="tms-form-item"><label class="tms-form-label">国家二级运动员陪打本次调整</label>${membershipStepperHtml('mo_level2Partner','','1')}</div></div><div class="tms-form-row"><div class="tms-form-item"><label class="tms-form-label">指定教练陪打本次调整</label><input class="finput tms-form-control" id="mo_designatedCoachPartner" type="number" step="1" oninput="toggleMembershipCoachSelector('mo_designatedCoachPartner','mo_designatedCoachSection')"></div></div><div class="tms-form-row" id="mo_designatedCoachSection" style="display:none"><div class="tms-form-item full-width"><label class="tms-form-label">选择指定教练</label><div id="mo_designatedCoachWrap">${membershipCoachSelectorHtml('mo_designatedCoachIdsWrap',[])}</div><div class="tms-field-help">指定教练范围本次调整</div></div></div></details><div class="tms-form-row"><div class="tms-form-item full-width"><label class="tms-form-label">备注</label><textarea class="finput tms-form-control" id="mo_notes"></textarea>${help}</div></div>`;
  const actions=`<div class="schedule-detail-card-actions"><button type="button" class="schedule-detail-action muted" onclick="openCourtMembershipPanel('${court.id}')">取消</button><button type="button" class="schedule-detail-action primary" id="membershipOrderSaveBtn" onclick="saveMembershipOrder('${court.id}')">保存</button></div>`;
  return renderDetailDrawerFormCard(title,form,actions);
}
function membershipBenefitPickerDrawerHtml(court){
  const account=membershipReadModelAccountForCourt(court);
  const rows=membershipReadModelBenefitRowsForCourt(court);
  const actionText=membershipDrawerBenefitMode==='consume'?'消耗':'补发';
  const body=rows.length?renderDetailDrawerTable({
    minWidth:'520px',
    columns:[
      {label:'权益',key:'label',render:row=>row.label+membershipBenefitNote(row)},
      {label:'当前剩余',key:'remaining',render:row=>`${row.remaining}/${row.total}${row.unit}`},
      {label:'操作',html:true,align:'right',render:row=>`<span class="tms-action-link" onclick="openMembershipBenefitActionModal('${court.id}','${row.code}','${membershipDrawerBenefitMode}')">${actionText}</span>`}
    ],
    rows,
    emptyText:'暂无可操作权益'
  }):'<div class="student-detail-empty">暂无可操作权益</div>';
  return renderDetailDrawerCard(`${actionText}权益`,body,{useGrid:false});
}
function membershipBenefitActionDrawerHtml(court){
  const account=membershipReadModelAccountForCourt(court);
  if(!account)return renderDetailDrawerCard('操作权益','该订场用户还没有会员账户',{useGrid:false});
  const label=membershipReadModelBenefitRowsForCourt(court).find(row=>row.code===membershipDrawerBenefitCode)?.label||membershipDrawerBenefitCode;
  const orders=membershipReadModelRechargeRowsForCourt(court);
  const latestOrder=orders[0];
  const title=membershipDrawerBenefitMode==='consume'?`消耗权益 · ${label}`:`补发权益 · ${label}`;
  const extra=membershipDrawerBenefitMode==='consume'
    ?`<div class="tms-form-row"><div class="tms-form-item full-width"><label class="tms-form-label">扣减预览</label><div id="membershipBenefitConsumePreview" class="membership-drawer-preview">${esc(JSON.stringify(membershipBenefitConsumePreview(account,membershipDrawerBenefitCode,1)) && '')}</div></div></div>`
    :`<div class="tms-form-row"><div class="tms-form-item full-width"><label class="tms-form-label">归属购买批次 *</label><select class="finput tms-form-control" id="mb_order">${orders.map(o=>`<option value="${o.id}" ${latestOrder?.id===o.id?'selected':''}>${esc(o.purchaseDate)} · ${esc(o.membershipPlanName)}</option>`).join('')}</select><div class="tms-field-help">本次补发会记入所选购买批次的权益调整，不会生成新的购买记录</div></div></div>`;
  const form=`<div class="tms-form-row"><div class="tms-form-item"><label class="tms-form-label">权益名称</label><div class="finput tms-form-control">${esc(label)}</div></div><div class="tms-form-item"><label class="tms-form-label">次数</label><input class="finput tms-form-control" id="mb_count" type="number" value="1" oninput="${membershipDrawerBenefitMode==='consume'?`refreshMembershipBenefitConsumePreview('${court.id}','${membershipDrawerBenefitCode}')`:''}"></div></div>${extra}<div class="tms-form-row"><div class="tms-form-item full-width"><label class="tms-form-label">原因</label><input class="finput tms-form-control" id="mb_reason" value="${membershipDrawerBenefitMode==='consume'?'会员权益使用':'会员权益补发'}"></div></div>`;
  const actions=`<div class="schedule-detail-card-actions"><button type="button" class="schedule-detail-action muted" onclick="openMembershipBenefitPickerModal('${court.id}','${membershipDrawerBenefitMode}')">返回选择权益</button><button type="button" class="schedule-detail-action primary" id="membershipBenefitSaveBtn" onclick="saveMembershipBenefit('${court.id}','${membershipDrawerBenefitMode}','${membershipDrawerBenefitCode}')">${membershipDrawerBenefitMode==='consume'?'确认消耗':'确认补发'}</button></div>`;
  return renderDetailDrawerFormCard(title,form,actions);
}
function membershipVoidDrawerHtml(court){
  const account=membershipReadModelAccountForCourt(court);
  if(!account)return renderDetailDrawerCard('作废会员','该订场用户还没有会员账户',{useGrid:false});
  const form=`<div class="membership-drawer-help danger">作废后折扣失效，权益不可再使用。</div><div class="tms-form-row"><div class="tms-form-item full-width"><label class="tms-form-label">作废原因</label><textarea class="finput tms-form-control" id="mv_reason">手动作废会员</textarea></div></div>`;
  const actions=`<div class="schedule-detail-card-actions"><button type="button" class="schedule-detail-action muted" onclick="openCourtMembershipPanel('${court.id}')">取消</button><button type="button" class="schedule-detail-action danger" id="membershipVoidBtn" onclick="voidMembership('${court.id}')">确认作废</button></div>`;
  return renderDetailDrawerFormCard('作废会员',form,actions);
}
function membershipDrawerContentHtml(court){
  if(membershipDrawerMode==='profile-edit')return courtProfileEditPanelHtml(court);
  if(membershipDrawerMode==='order')return membershipOrderDrawerHtml(court);
  if(membershipDrawerMode==='benefit-picker')return membershipBenefitPickerDrawerHtml(court);
  if(membershipDrawerMode==='benefit-action')return membershipBenefitActionDrawerHtml(court);
  if(membershipDrawerMode==='void')return membershipVoidDrawerHtml(court);
  if(membershipDetailActiveTab==='booking')return courtBookingDrawerHtml(court);
  if(membershipDetailActiveTab==='orders')return membershipOrdersDrawerHtml(court);
  if(membershipDetailActiveTab==='rights')return membershipRightsDrawerHtml(court);
  if(membershipDetailActiveTab==='ledger')return membershipLedgerDrawerHtml(court);
  return courtMembershipPanelHtml(court);
}
function initializeMembershipDrawer(courtId){
  if(membershipDrawerMode==='order'){
    const planId=document.getElementById('mo_plan')?.value||membershipPlans.filter(p=>p.status!=='inactive')[0]?.id||'';
    if(planId)applyMembershipOrderDraft(planId);
    ['mo_recharge','mo_bonus'].forEach(id=>{const el=document.getElementById(id);if(el)el.setAttribute('oninput',`refreshMembershipOrderPreview('${membershipDrawerOrderMode}');toggleMembershipPriceOverride()`)});
    const moDateEl=document.getElementById('mo_date');if(moDateEl)moDateEl.addEventListener('change',()=>refreshMembershipOrderPreview(membershipDrawerOrderMode));
    toggleMembershipPriceOverride();
    refreshMembershipOrderPreview(membershipDrawerOrderMode);
  }
  if(membershipDrawerMode==='benefit-action'&&membershipDrawerBenefitMode==='consume')refreshMembershipBenefitConsumePreview(courtId,membershipDrawerBenefitCode);
  if(membershipDrawerMode==='view'&&membershipDetailActiveTab==='booking'&&membershipBookingEntryOpen)onCourtFinanceSceneChange();
}
function openMembershipDrawer(courtId){
  const court=courts.find(c=>c.id===courtId)||membershipReadModelItemForCourt(courtId);if(!court){toast('当前订场用户数据未加载，请刷新后重试','warn');return;}
  if(membershipDrawerMode!=='profile-edit')editId=null;
  openStandardDetailDrawer({
    titleHtml:`${membershipDetailHeroHtml(court)}${membershipDetailTabsHtml(membershipDetailActiveTab)}`,
    bodyHtml:`<div class="schedule-detail-content">${membershipDrawerContentHtml(court)}</div>`,
    actionsHtml:'',
    data:{membershipCourtId:court.id,membershipMode:membershipDrawerMode},
    overlayClasses:['schedule-drawer-overlay'],
    modalClass:'modal modal-court modal-schedule-drawer modal-membership-drawer'
  });
  requestAnimationFrame(()=>initializeMembershipDrawer(courtId));
}
function openCourtMembershipPanel(courtId,options={}){
  membershipDetailActiveTab=options.tab||'overview';
  membershipDrawerMode=options.mode||'view';
  membershipDrawerOrderMode=options.orderMode||'renew';
  membershipDrawerBenefitMode=options.benefitMode||'';
  membershipDrawerBenefitCode=options.benefitCode||'';
  if(membershipDetailActiveTab!=='rights')membershipInlineBenefitAction={benefitCode:'',mode:''};
  if(membershipDetailActiveTab!=='booking')membershipBookingEntryOpen=false;
  openMembershipDrawer(courtId);
}
let courtMergeState={sourceCourtId:'',options:[],filtered:[]};
function mergeCourtTargetLabel(court){
  if(!court)return '';
  return [court.name||'',court.phone||'',cn(court.campus)||''].filter(Boolean).join(' · ');
}
function renderCourtMergeTargetOptions(){
  const q=(document.getElementById('mergeCourtSearch')?.value||'').trim().toLowerCase();
  const filtered=(courtMergeState.options||[]).filter(item=>{
    if(!q)return true;
    return searchHit(q,item.name,item.phone,cn(item.campus));
  });
  courtMergeState.filtered=filtered;
  const host=document.getElementById('mergeTargetHost');
  const currentValue=document.getElementById('merge_targetCourtId')?.value||filtered[0]?.id||'';
  if(host)host.innerHTML=renderStandardDropdownHtml('merge_targetCourtId','选择目标用户',filtered.map(c=>({value:c.id,label:mergeCourtTargetLabel(c)})),filtered.some(c=>c.id===currentValue)?currentValue:(filtered[0]?.id||''),true);
  const empty=document.getElementById('mergeTargetEmpty');
  if(empty)empty.style.display=filtered.length?'none':'block';
}
function openCourtMergeModal(courtId){
  const sourceCourt=courts.find(c=>c.id===courtId&&String(c.status||'active')!=='inactive');
  if(!sourceCourt){toast('原订场用户不存在或已隐藏','warn');return;}
  const targetOptions=courts
    .filter(c=>c.id!==courtId&&String(c.status||'active')!=='inactive')
    .sort((a,b)=>String(a.name||'').localeCompare(String(b.name||'')))
    .map(c=>({id:c.id,name:c.name||'',phone:c.phone||'',campus:c.campus||''}));
  if(!targetOptions.length){toast('没有可合并的目标订场用户','warn');return;}
  courtMergeState={sourceCourtId:courtId,options:targetOptions,filtered:targetOptions};
  const body=`<div class="tms-section-header" style="margin-top:0;">合并设置</div><div class="tms-form-row"><div class="tms-form-item"><label class="tms-form-label">当前用户</label><div class="tms-form-readonly">${esc(mergeCourtTargetLabel(sourceCourt))}</div></div></div><div class="tms-form-row"><div class="tms-form-item"><label class="tms-form-label">搜索目标用户</label><input type="text" class="finput tms-form-control" id="mergeCourtSearch" placeholder="搜索姓名、手机号" oninput="renderCourtMergeTargetOptions()"></div></div><div class="tms-form-row"><div class="tms-form-item"><label class="tms-form-label">合并到用户 *</label><div id="mergeTargetHost"></div><div id="mergeTargetEmpty" style="display:none;font-size:12px;color:#8C7B6E;margin-top:8px;">没有匹配的订场用户</div></div></div><div class="tms-form-row" style="margin-bottom:0;"><div class="tms-form-item full-width"><label class="choice-tag" style="width:max-content"><input type="checkbox" id="merge_deleteSource"><span>合并后直接删除原用户</span></label><div style="font-size:12px;color:#8C7B6E;margin-top:10px;line-height:1.6">会把当前用户的财务流水、关联学员和会员关联迁到目标用户。勾选后，原用户会直接删除；不勾选则隐藏。</div></div></div>`;
  const footer=`<button class="tms-btn tms-btn-default" onclick="editCourtProfileInline('${sourceCourt.id}')">返回编辑</button><div style="display:flex;gap:12px;"><button class="tms-btn tms-btn-primary" id="courtMergeBtn" onclick="mergeCourtUsers('${sourceCourt.id}')">确认合并</button></div>`;
  openStandardModal({title:`合并订场用户 · ${sourceCourt.name}`,bodyHtml:body,actionsHtml:footer,extraClass:'modal-tight'});
  renderCourtMergeTargetOptions();
}
function applyCourtMergeResult(result={},sourceCourtId='',targetCourtId=''){
  const targetCourt=result.targetCourt||null;
  const removedCourtId=result.removedCourtId||sourceCourtId;
  if(targetCourt?.id){
    const i=courts.findIndex(c=>String(c.id)===String(targetCourt.id));
    if(i>=0)courts[i]=targetCourt;
    else courts.unshift(targetCourt);
  }
  courts=courts.map(c=>String(c.id)===String(removedCourtId)?{...c,status:'inactive',mergedIntoCourtId:targetCourt?.id||targetCourtId}:c);
  if(result.removedCourtId)courts=courts.filter(c=>String(c.id)!==String(result.removedCourtId));
  if(courtAccountListViewData?.items){
    courtAccountListViewData.items=courtAccountListViewData.items.filter(item=>String(item.id)!==String(removedCourtId)).map(item=>{
      if(String(item.id)!==String(targetCourt?.id||targetCourtId))return item;
      const f=targetCourt?courtFinanceLocal(targetCourt):null;
      const b=targetCourt?courtBookingSummary(targetCourt):null;
      return {
        ...item,
        displayName:targetCourt?courtDisplayName(targetCourt):item.displayName,
        phone:targetCourt?.phone||item.phone,
        campusCode:targetCourt?.campus||item.campusCode,
        campusName:targetCourt?cn(targetCourt.campus):item.campusName,
        owner:targetCourt?.owner||item.owner,
        familiarity:targetCourt?.familiarity||item.familiarity,
        depositAttitude:targetCourt?.depositAttitude||item.depositAttitude,
        recentFollowUpDate:targetCourt?.recentFollowUpDate||item.recentFollowUpDate,
        nextFollowUpDate:targetCourt?.nextFollowUpDate||item.nextFollowUpDate,
        notesSummary:targetCourt?.notes||item.notesSummary,
        bookingCount:b?.count??item.bookingCount,
        bookingAmount:b?.amount??item.bookingAmount,
        lastBookingDate:b?.lastDate??item.lastBookingDate,
        balance:f?.balance??item.balance,
        totalDeposit:f?.totalDeposit??item.totalDeposit,
        totalSpent:f?.spentAmount??item.totalSpent,
        totalReceived:f?.receivedAmount??item.totalReceived,
        lowBalance:f?f.balance>0&&f.balance<=500:item.lowBalance,
        updatedAt:targetCourt?.updatedAt||item.updatedAt
      };
    });
    courtAccountListViewData.summary=summarizeCourtAccountListItems(courtAccountListViewData.items);
    window.__courtAccountListViewData=courtAccountListViewData;
  }
  selectedCourtIds.delete(removedCourtId);
}
async function mergeCourtUsers(sourceCourtId){
  const targetCourtId=document.getElementById('merge_targetCourtId')?.value||'';
  const deleteSource=document.getElementById('merge_deleteSource')?.checked===true;
  if(!targetCourtId){toast('请选择目标订场用户','warn');return;}
  const sourceCourt=courts.find(c=>c.id===sourceCourtId);
  const targetCourt=courts.find(c=>c.id===targetCourtId);
  if(!sourceCourt||!targetCourt){toast('订场用户数据已变化，请刷新后重试','warn');return;}
  if(!await appConfirm(`确认把「${sourceCourt.name}」合并到「${targetCourt.name}」吗？`,{title:'确认合并用户',confirmText:'确认合并'}))return;
  const btn=document.getElementById('courtMergeBtn');
  if(btn){btn.disabled=true;btn.textContent='合并中…';}
  try{
    const result=await apiCall('POST','/courts/merge',{sourceCourtId,targetCourtId,deleteSource});
    applyCourtMergeResult(result,sourceCourtId,targetCourtId);
    closeModal();
    renderCourts();
    loadPageDataAndRender('courts',{quiet:true,force:true}).catch(e=>console.warn('court merge background refresh failed',e));
    toast(deleteSource?'合并成功，原用户已删除':'合并成功，原用户已隐藏','success');
  }catch(e){
    toast('合并失败：'+e.message,'error');
    if(btn){btn.disabled=false;btn.textContent='确认合并';}
  }
}
function leadRowsForCourtSummary(){
  return typeof leadRows==='function'?leadRows():(Array.isArray(leads)?leads:[]);
}
function leadForCourtSummary(courtId){
  return leadRowsForCourtSummary().find(item=>String(item?.courtId||'')===String(courtId))||null;
}
function courtFollowOwnerText(court){
  return String(leadForCourtSummary(court?.id)?.owner||court?.owner||'').trim();
}
function courtLeadSummaryHtml(court){
  const lead=leadForCourtSummary(court?.id);
  if(!lead)return '<div class="tms-text-secondary">未关联线索</div>';
  const lines=[
    `来源：${lead.source||'—'}`,
    `需求产品：${lead.demandProduct||lead.consultType||'—'}`,
    `跟进人：${lead.owner||'—'}`,
    `最近跟进：${lead.lastFollowupAt?fmtDt(lead.lastFollowupAt):'—'}`,
    `下次跟进：${lead.nextFollowupAt||'—'}`,
    `转化结果：${leadConversionText(lead)}`
  ];
  const jumpBtn=lead.id&&typeof jumpToLeadDetail==='function'
    ?`<div style="margin-top:8px"><button class="btn-sec" onclick="jumpToLeadDetail('${lead.id}')">查看线索</button></div>`
    :'';
  return `<div class="tms-readonly-text">${esc(lines.join('；'))}</div>${jumpBtn}`;
}
function courtStudentInlineMeta(student){
  if(typeof scheduleStudentInlineMeta==='function')return scheduleStudentInlineMeta(student);
  return `归属：${cn(student?.campus)||'未设校区'}`;
}
function courtSelectedStudentSearchText(ids=[]){
  const picked=new Set(parseArr(ids));
  return students.filter(s=>picked.has(s.id)).map(s=>s.name).filter(Boolean).join(',');
}
function syncCourtStudentSearchInput(ids=[]){
  const input=document.getElementById('f_studentSearch');
  if(input)input.value=courtSelectedStudentSearchText(ids);
}
function courtStudentSearchKeyword(value='',ids=[]){
  const selectedText=courtSelectedStudentSearchText(ids);
  let keyword=String(value||'').trim();
  if(selectedText&&keyword.startsWith(selectedText))keyword=keyword.slice(selectedText.length).replace(/^,+/,'').trim();
  return keyword.split(',').pop().trim();
}
function renderCourtStudentTags(selectedIds=[]){
  const picked=new Set(parseArr(selectedIds));
  const rows=students.filter(s=>picked.has(s.id));
  if(!rows.length)return '';
  return rows.map(s=>`<span class="schedule-student-tag">${esc(s.name)} <span>${esc(courtStudentInlineMeta(s))}</span><button type="button" onclick="removeCourtStudent(${jsArg(s.id)})">×</button></span>`).join('');
}
function renderCourtStudentSuggestions(selectedIds=[],keyword=''){
  const picked=new Set(parseArr(selectedIds));
  const q=String(keyword||'').trim().toLowerCase();
  if(!q)return '';
  const pickedMatches=students.filter(s=>picked.has(s.id)&&[s.name,s.phone,cn(s.campus)].some(v=>String(v||'').toLowerCase().includes(q)));
  const rows=students.filter(s=>{
    if(picked.has(s.id))return false;
    return [s.name,s.phone,cn(s.campus)].some(v=>String(v||'').toLowerCase().includes(q));
  }).sort((a,b)=>String(a.name||'').localeCompare(String(b.name||''),'zh-CN')).slice(0,8);
  if(!rows.length)return pickedMatches.length?'':'<div class="schedule-student-suggest-empty">没有匹配到学员</div>';
  return `<div class="schedule-student-suggest-list">${rows.map(s=>`<button type="button" onclick="selectCourtStudent(${jsArg(s.id)})"><strong>${esc(s.name)}</strong><span>${esc(s.phone||'-')} · ${esc(courtStudentInlineMeta(s))}</span></button>`).join('')}</div>`;
}
function updateCourtStudentSummary(ids){
  const host=document.getElementById('f_selectedStudentTags');
  if(host)host.innerHTML=renderCourtStudentTags(ids);
}
function setCourtStudentSelection(ids,keepKeyword=false){
  const normalized=[...new Set(parseArr(ids).filter(Boolean))];
  const hidden=document.getElementById('f_studentIds');
  if(hidden)hidden.value=JSON.stringify(normalized);
  updateCourtStudentSummary(normalized);
  if(!keepKeyword)syncCourtStudentSearchInput(normalized);
  const inputValue=document.getElementById('f_studentSearch')?.value||'';
  const keyword=keepKeyword?courtStudentSearchKeyword(inputValue,normalized):'';
  const suggest=document.getElementById('f_studentSuggest');
  if(suggest)suggest.innerHTML=renderCourtStudentSuggestions(normalized,keyword);
}
function updateCourtStudentSearch(){
  const ids=parseArr(document.getElementById('f_studentIds')?.value||'[]');
  setCourtStudentSelection(ids,true);
}
function selectCourtStudent(studentId){
  const ids=parseArr(document.getElementById('f_studentIds')?.value||'[]');
  const next=[...ids,studentId];
  setCourtStudentSelection(next,false);
  syncCourtStudentSearchInput(next);
  const suggest=document.getElementById('f_studentSuggest');
  if(suggest)suggest.innerHTML='';
}
function removeCourtStudent(studentId){
  const ids=parseArr(document.getElementById('f_studentIds')?.value||'[]').filter(id=>id!==studentId);
  setCourtStudentSelection(ids,false);
}
function courtProfileSelectedStudentIds(court){
  const linked=findStudentForCourt(court);
  const selectedIds=parseArr(court?.studentIds);
  if(!selectedIds.length&&linked)selectedIds.push(linked.id);
  return selectedIds;
}
function courtProfileReadonlyHtml(court){
  const selectedIds=courtProfileSelectedStudentIds(court);
  return [
    renderDetailDrawerField('姓名',court?.displayName||courtDisplayName(court)),
    renderDetailDrawerField('手机号',court?.phone||''),
    renderDetailDrawerField('关联学员',courtSelectedStudentSearchText(selectedIds)||courtStudentNames(court)),
    renderDetailDrawerField('校区',court?.campusName||cn(court?.campus||court?.campusCode)),
    renderDetailDrawerField('跟进人',court?.owner||courtFollowOwnerText(court)),
    renderDetailDrawerField('储值态度',court?.depositAttitude),
    renderDetailDrawerField('备注',courtCleanUserNotes(court?.notesSummary||court?.notes),{full:true})
  ].join('');
}
function courtProfileFormHtml(court){
  const r=court||null;
  const selectedIds=courtProfileSelectedStudentIds(r);
  const campusList=campuses.map(c=>({value:c.code||c.id,label:esc(c.name)}));
  const selectedStudentValue=esc(JSON.stringify(selectedIds));
  const linkedStudentPicker=`<input type="hidden" id="f_studentIds" value="${selectedStudentValue}"><input class="finput tms-form-control" id="f_studentSearch" placeholder="搜索姓名、手机号" value="${esc(courtSelectedStudentSearchText(selectedIds))}" oninput="updateCourtStudentSearch()" autocomplete="off"><div id="f_studentSuggest" class="schedule-student-suggest"></div><div id="f_selectedStudentTags" class="schedule-student-tags">${renderCourtStudentTags(selectedIds)}</div>`;
  return `<div class="tms-form-row"><div class="tms-form-item"><label class="tms-form-label">姓名 *</label><input type="text" class="finput tms-form-control" id="f_name" placeholder="请输入" value="${rv(r,'name')}"></div><div class="tms-form-item"><label class="tms-form-label">手机号</label><input type="text" class="finput tms-form-control" id="f_phone" placeholder="请输入手机号" value="${rv(r,'phone')}"></div></div><div class="tms-form-row"><div class="tms-form-item"><label class="tms-form-label">关联学员</label>${linkedStudentPicker}</div><div class="tms-form-item"><label class="tms-form-label">校区</label>${renderStandardDropdownHtml('f_campus','校区',[{value:'',label:'-'},...campusList],rv(r,'campus'),true)}</div></div><div class="tms-form-row court-profile-row"><div class="tms-form-item"><label class="tms-form-label">跟进人</label><input type="text" class="finput tms-form-control" id="f_owner" value="${esc(courtFollowOwnerText(r))}" readonly></div><div class="tms-form-item"><label class="tms-form-label">储值态度</label><input type="text" class="finput tms-form-control" id="f_attitude" value="${rv(r,'depositAttitude')}"></div></div><div class="tms-form-row" style="margin-bottom:0;"><div class="tms-form-item full-width"><label class="tms-form-label">备注</label><textarea class="finput tms-form-control" id="f_notes">${esc(rv(r,'notes'))}</textarea></div></div>`;
}
function courtProfileEditPanelHtml(court){
  const actions=`<div class="schedule-detail-card-actions"><button type="button" class="schedule-detail-action muted" onclick="cancelCourtProfileInlineEdit('${court.id}')">取消</button><button type="button" class="schedule-detail-action primary" id="courtSaveBtn" onclick="saveCourtProfileInline('${court.id}')">保存</button></div>`;
  return renderDetailDrawerFormCard('基本信息',courtProfileFormHtml(court),actions);
}
function editCourtProfileInline(courtId){
  editId=courtId;_pending=[];
  membershipDetailActiveTab='overview';
  membershipDrawerMode='profile-edit';
  openMembershipDrawer(courtId);
}
function cancelCourtProfileInlineEdit(courtId){
  editId=null;_pending=[];
  openCourtMembershipPanel(courtId,{tab:'overview'});
}
async function saveCourtProfileInline(courtId){
  editId=courtId;
  await saveCourt({reopenMembershipCourtId:courtId});
}
function openCourtModal(id){
  editId=id;_pending=[];const r=id?courts.find(x=>x.id===id):null;
  const footer=id?`<div class="schedule-detail-card-actions"><button type="button" class="schedule-detail-action muted" onclick="closeModal()">取消</button><button type="button" class="schedule-detail-action" onclick="openCourtMergeModal('${r.id}')">合并</button><button type="button" class="schedule-detail-action danger" onclick="confirmDel('${r.id}','${esc(r.name)}','court')">删除</button><button type="button" class="schedule-detail-action primary" id="courtSaveBtn" onclick="saveCourt()">保存</button></div>`:`<div class="schedule-detail-card-actions"><button type="button" class="schedule-detail-action muted" onclick="closeModal()">取消</button><button type="button" class="schedule-detail-action primary" id="courtSaveBtn" onclick="saveCourt()">保存</button></div>`;
  openStandardDetailDrawer({
    titleHtml:renderDetailDrawerHero({
      title:id?'编辑订场用户':'添加订场用户',
      avatar:(courtDisplayName(r)||'订').slice(0,1),
      subtitle:id?[courtDisplayName(r),r?.phone,cn(r?.campus)].filter(Boolean).join(' · '):'',
      statusHtml:''
    }),
    bodyHtml:`<div class="schedule-detail-content">${renderDetailDrawerFormCard('基本信息',courtProfileFormHtml(r),footer)}</div>`,
    actionsHtml:'',
    data:{courtEditId:id||''},
    overlayClasses:['schedule-drawer-overlay'],
    modalClass:'modal modal-court modal-schedule-drawer modal-court-edit-drawer'
  });
}
async function saveCourt(options={}){
  const name=document.getElementById('f_name').value.trim();if(!name){toast('请输入姓名','warn');return;}
  const phone=document.getElementById('f_phone').value.trim();if(!validateCnPhone(phone)){toast('手机号格式不正确','warn');return;}
  const btn=document.getElementById('courtSaveBtn');
  const rawH=editId?courtBaseHistoryForSave(courts.find(u=>u.id===editId)):[];
  const studentIds=parseArr(document.getElementById('f_studentIds')?.value||'[]');
  const campusValue=document.getElementById('f_campus').value;
  const rec={name,phone,studentId:studentIds[0]||'',studentIds,campus:campusValue,depositAttitude:document.getElementById('f_attitude').value.trim(),notes:document.getElementById('f_notes').value.trim(),status:'active',history:[...rawH,..._pending]};
  const duplicates=getCourtDuplicateCandidates({name,phone,campus:campusValue},editId);
  if(duplicates.length){
    const summary=duplicates.map(c=>`${c.name}${c.phone?`（${c.phone}）`:''}${c.campus?` · ${cn(c.campus)}`:''}`).join('、');
    if(!await appConfirm(`发现可能重复的订场用户：${summary}。手机号优先，若无手机号则按姓名+校区去重。是否继续保存？`,{title:'发现重复用户',confirmText:'继续保存'})){
      if(btn){btn.disabled=false;btn.textContent='保存';}
      return;
    }
  }
  await runStandardMutation(btn,async()=>{
    if(editId){const saved=await apiCall('PUT','/courts/'+editId,rec);const i=courts.findIndex(u=>u.id===editId);courts[i]=saved;}
    else{const r=await apiCall('POST','/courts',rec);courts.unshift(r);}
  },{
    successText:editId?'修改成功 ✓':'添加成功 ✓',
    closeOnSuccess:!options.reopenMembershipCourtId,
    refresh:[renderCourts,renderStudentsIfVisible,()=>{if(options.reopenMembershipCourtId){editId=null;_pending=[];openCourtMembershipPanel(options.reopenMembershipCourtId,{tab:'overview'});}}]
  });
}
const COURT_FINANCE_TRANSACTION_TYPES=FlowTennisBusinessTaxonomy.TRANSACTION_TYPES;
const COURT_FINANCE_BUSINESS_TYPES=FlowTennisBusinessTaxonomy.COURT_FINANCE_BUSINESS_TYPES;
function courtFinanceStoredType(type){
  if(type==='收款')return '充值';
  if(type==='消耗')return '消费';
  if(type==='退款')return '退款';
  if(type==='废弃')return '废弃';
  return type||'消费';
}
function courtFinanceStoredCategory(type,businessType){
  if(type==='收款')return '储值';
  if(businessType==='内部使用'||businessType==='领导订场')return '内部占用';
  return businessType||'会员订场';
}
function courtFinanceBusinessOptions(){
  return FlowTennisBusinessTaxonomy.optionList('courtFinanceBusinessTypes');
}
function courtFinanceTransactionOptions(){
  return FlowTennisBusinessTaxonomy.optionList('financeTransactionTypes');
}
function updateCourtFinancePreview(){
  const type=document.getElementById('nrType')?.value;
  const pay=document.getElementById('nrPayMethod');
  const cat=document.getElementById('nrCategory');
  const hint=document.getElementById('financeHint');
  if(!pay||!hint)return;
  if(type==='收款'&&isStoredValuePayMethod(pay.value))setStandardDropdownValue('nrPayMethod','微信','微信');
  if(type==='消耗'&&pay.value==='储值退款')setStandardDropdownValue('nrPayMethod','储值卡','储值卡');
  if(type==='退款'&&isStoredValuePayMethod(pay.value))setStandardDropdownValue('nrPayMethod','微信','微信');
  const nextCat=document.getElementById('nrCategory')?.value;
  if(type==='消耗'&&['内部使用','领导订场'].includes(nextCat)){
    setStandardDropdownValue('nrPayMethod','其他','其他');
    const amountEl=document.getElementById('nrAmt');
    if(amountEl&&(!amountEl.value||amountEl.value==='0'))amountEl.value='0';
  }
  hint.textContent=type==='收款'?'收款会进入当前余额或现金流水。':type==='退款'?'记录退款流水。':type==='废弃'?'废弃流水只保留记录，不参与财务统计。':['内部使用','领导订场'].includes(nextCat)?'内部使用只记录场地被占用，不计入累计消费和累计实收。':isStoredValuePayMethod(pay.value)?'本次订场会从当前余额扣款。':'本次订场按单次支付记录，不扣储值余额。';
}
function renderCourtFinanceFields(){
  const type=document.getElementById('nrType')?.value||'消耗';
  const category=document.getElementById('nrCategory')?.value||'会员订场';
  const isBooking=type==='消耗'&&['会员订场','散客订场','课程订场','约球局'].includes(category);
  const isInternal=type==='消耗'&&['内部使用','领导订场'].includes(category);
  const isCourse=false;
  document.querySelectorAll('[data-finance-field="booking"]').forEach(el=>el.style.display=(isBooking||isInternal)?'':'none');
  document.querySelectorAll('[data-finance-field="course"]').forEach(el=>el.style.display=isCourse?'':'none');
  document.querySelectorAll('[data-finance-field="student"]').forEach(el=>el.style.display=(isBooking||isCourse)?'':'none');
  document.querySelectorAll('[data-finance-field="internal"]').forEach(el=>el.style.display=isInternal?'':'none');
  document.querySelectorAll('[data-price-field="channel"]').forEach(el=>el.style.display=document.getElementById('nrPriceMode')?.value==='channel_product'?'':'none');
}
function onCourtFinanceSceneChange(){
  updateCourtFinancePreview();
  renderCourtFinanceFields();
  refreshCourtFinanceQuote();
}
function courtPayMethodOptions(){
  return FlowTennisBusinessTaxonomy.optionList('payMethods');
}
let courtFinanceModalId='';
function activeChannelProductOptions(){
  return pricePlans.filter(p=>p.type==='channel_product'&&p.status!=='inactive').map(p=>({value:p.id,label:`${p.channel} · ${p.productName} · ¥${fmt(p.salePrice)}`}));
}
function selectedChannelProduct(){
  const id=document.getElementById('nrChannelProductId')?.value||'';
  return pricePlans.find(p=>p.id===id)||null;
}
function currentCourtMemberDiscount(court){
  const account=courtMembershipSummary(court)?.account;
  const rate=parseFloat(account?.discountRate);
  return Number.isFinite(rate)&&rate>0?rate:1;
}
let courtFinanceQuoteTimer=0;
let courtFinanceQuoteSeq=0;
const courtFinanceQuoteCache=new Map();
function courtFinanceQuoteCacheKey(payload){
  return JSON.stringify(payload);
}
function applyCourtFinanceQuoteResult(quote,memberDiscount){
  const systemEl=document.getElementById('nrSystemAmount');
  const finalEl=document.getElementById('nrFinalAmount');
  const amountEl=document.getElementById('nrAmt');
  const pricePlanEl=document.getElementById('nrPricePlanId');
  const quoteMeta=document.getElementById('nrQuoteMeta');
  if(systemEl)systemEl.value=quote.systemAmount||0;
  if(finalEl&&!finalEl.dataset.touched)finalEl.value=quote.systemAmount||0;
  if(amountEl)amountEl.value=finalEl?.value||quote.systemAmount||0;
  if(pricePlanEl)pricePlanEl.value=(quote.pricePlanIds||[]).join(',');
  if(quoteMeta)quoteMeta.textContent=`系统报价：原价 ¥${fmt(quote.originalAmount||0)}${memberDiscount!==1?` · 会员 ${Math.round(memberDiscount*100)/10} 折`:''}`;
}
function trimCourtFinanceQuoteCache(limit=24){
  while(courtFinanceQuoteCache.size>limit){
    const firstKey=courtFinanceQuoteCache.keys().next().value;
    courtFinanceQuoteCache.delete(firstKey);
  }
}
async function refreshCourtFinanceQuote(){
  const court=courts.find(c=>c.id===courtFinanceModalId);
  if(!court)return;
  const type=document.getElementById('nrType')?.value||'';
  const category=document.getElementById('nrCategory')?.value||'';
  if(type!=='消耗'||!['会员订场','散客订场','课程订场','约球局'].includes(category))return;
  const mode=document.getElementById('nrPriceMode')?.value||'venue_rate';
  const systemEl=document.getElementById('nrSystemAmount');
  const finalEl=document.getElementById('nrFinalAmount');
  const amountEl=document.getElementById('nrAmt');
  const pricePlanEl=document.getElementById('nrPricePlanId');
  const quoteMeta=document.getElementById('nrQuoteMeta');
  try{
    if(mode==='channel_product'){
      const product=selectedChannelProduct();
      if(!product)return;
      if(systemEl)systemEl.value=product.salePrice||0;
      if(finalEl&&!finalEl.dataset.touched)finalEl.value=product.salePrice||0;
      if(amountEl)amountEl.value=finalEl?.value||product.salePrice||0;
      if(pricePlanEl)pricePlanEl.value=product.id||'';
      if(quoteMeta)quoteMeta.textContent=`渠道商品：${product.channel} · ${product.productName}`;
      return;
    }
    const payMethod=document.getElementById('nrPayMethod')?.value||'';
    const memberDiscount=isStoredValuePayMethod(payMethod)?currentCourtMemberDiscount(court):1;
    const payload={campus:document.getElementById('nrCampus')?.value||court.campus||'',date:document.getElementById('nrDate')?.value||today(),startTime:document.getElementById('nrStartTime')?.value||'',endTime:document.getElementById('nrEndTime')?.value||'',memberDiscount};
    const cacheKey=courtFinanceQuoteCacheKey(payload);
    const cached=courtFinanceQuoteCache.get(cacheKey);
    const now=Date.now();
    if(cached&&(now-cached.at)<30000){
      applyCourtFinanceQuoteResult(cached.value,memberDiscount);
      return;
    }
    clearTimeout(courtFinanceQuoteTimer);
    const quoteSeq=++courtFinanceQuoteSeq;
    if(quoteMeta)quoteMeta.textContent='正在计算系统报价…';
    courtFinanceQuoteTimer=setTimeout(async ()=>{
      try{
        const quote=await apiCall('POST','/price-plans/quote',payload);
        courtFinanceQuoteCache.set(cacheKey,{at:Date.now(),value:quote});
        trimCourtFinanceQuoteCache();
        if(quoteSeq!==courtFinanceQuoteSeq)return;
        applyCourtFinanceQuoteResult(quote,memberDiscount);
      }catch(e){
        if(quoteSeq!==courtFinanceQuoteSeq)return;
        if(quoteMeta)quoteMeta.textContent=e.message||'未找到匹配价格';
      }
    },300);
    return;
  }catch(e){
    if(quoteMeta)quoteMeta.textContent=e.message||'未找到匹配价格';
  }
}
function syncCourtFinalAmount(){
  const finalEl=document.getElementById('nrFinalAmount');
  const amountEl=document.getElementById('nrAmt');
  if(finalEl)finalEl.dataset.touched='1';
  if(amountEl&&finalEl)amountEl.value=finalEl.value||'';
}
function openCourtBookingEntryInline(courtId){
  membershipBookingEntryOpen=true;
  openCourtMembershipPanel(courtId,{tab:'booking'});
}
function closeCourtBookingEntryInline(courtId){
  membershipBookingEntryOpen=false;
  openCourtMembershipPanel(courtId,{tab:'booking'});
}
function courtBookingDrawerHtml(court){
  if(!court)return renderDetailDrawerCard('订场','当前订场用户数据未加载，请刷新后重试',{useGrid:false});
  courtFinanceModalId=court.id;
  _pending=[];
  const studentOptions=[{value:'',label:'不关联'},...students.map(s=>({value:s.id,label:s.name}))];
  const coachOptions=[{value:'',label:'不安排陪打'},...activeCoachNames().map(name=>({value:name,label:name}))];
  const campusOptions=campuses.map(c=>({value:c.code||c.id,label:esc(c.name)}));
  const defaultCampus=court.campus||campuses[0]?.code||campuses[0]?.id||'';
  const venueOptions=courtVenueOptionsForCampus(defaultCampus);
  const channelProductOptions=[{value:'',label:'选择渠道商品'},...activeChannelProductOptions()];
  const hist=membershipReadModelBookingRowsForCourt(court);
  const form=`<div class="tms-record-add-box"><div class="tms-form-row"><div class="tms-form-item" style="flex:0 0 110px;min-width:110px;">${renderStandardDropdownHtml('nrType','交易类型',courtFinanceTransactionOptions(),'消耗',true,'onCourtFinanceSceneChange')}</div><div class="tms-form-item" style="flex:0 0 128px;min-width:128px;">${renderStandardDropdownHtml('nrCategory','业务类型',courtFinanceBusinessOptions(),'会员订场',true,'onCourtFinanceSceneChange')}</div><div class="tms-form-item" style="flex:0 0 128px;min-width:128px;">${renderStandardDropdownHtml('nrPayMethod','支付方式',courtPayMethodOptions(),'储值卡',true,'onCourtFinanceSceneChange')}</div><div class="tms-form-item" data-finance-field="student" style="flex:0 0 128px;min-width:128px;">${renderStandardDropdownHtml('nrStudentId','关联学员',studentOptions,'',true)}</div><div class="tms-form-item" data-finance-field="booking" style="flex:0 0 118px;min-width:118px;">${renderStandardDropdownHtml('nrCampus','校区',campusOptions,defaultCampus,true,'handleCourtFinanceCampusChange')}</div><div class="tms-form-item" data-finance-field="booking" style="flex:0 0 118px;min-width:118px;" id="nrVenueFieldHost">${renderStandardDropdownHtml('nrVenue','场地',venueOptions,venueOptions[0]?.value||'',true)}</div></div><div class="tms-form-row"><div class="tms-form-item" data-finance-field="booking" style="flex:0 0 168px;min-width:168px;">${courtDateButtonHtml('nrDate',today(),'发生日期')}</div><div class="tms-form-item" data-finance-field="booking" style="flex:0 0 100px;min-width:100px;">${renderStandardDropdownHtml('nrStartTime','08:00',getCourtTimeOptions('08:00'),'08:00',true,'refreshCourtFinanceQuote')}</div><div data-finance-field="booking" style="color:#8C7B6E;align-self:center;white-space:nowrap;padding:0 2px;">至</div><div class="tms-form-item" data-finance-field="booking" style="flex:0 0 100px;min-width:100px;">${renderStandardDropdownHtml('nrEndTime','10:00',getCourtTimeOptions('10:00'),'10:00',true,'refreshCourtFinanceQuote')}</div><div class="tms-form-item" data-finance-field="booking" style="flex:0 0 136px;min-width:136px;">${renderStandardDropdownHtml('nrCompanionCoach','陪打教练',coachOptions,'',true)}</div><div class="tms-form-item" data-finance-field="internal" style="flex:0 0 140px;min-width:140px;">${renderStandardDropdownHtml('nrInternalReason','占用原因',[{value:'领导打球',label:'领导打球'},{value:'活动',label:'活动'},{value:'测试教学',label:'测试教学'},{value:'其他',label:'其他'}],'领导打球',true)}</div><div class="tms-form-item" data-finance-field="course" style="flex:1;"><input type="number" class="finput tms-form-control" id="nrLessonCount" min="1" step="1" placeholder="节数"></div></div><div class="tms-form-row" data-finance-field="booking"><div class="tms-form-item" style="flex:0 0 132px;min-width:132px;">${renderStandardDropdownHtml('nrPriceMode','价格来源',[{value:'venue_rate',label:'场地价格'},{value:'channel_product',label:'渠道商品'},{value:'manual',label:'手动价格'}],'venue_rate',true,'onCourtFinanceSceneChange')}</div><div class="tms-form-item" data-price-field="channel" style="flex:1;">${renderStandardDropdownHtml('nrChannelProductId','渠道商品',channelProductOptions,channelProductOptions[0]?.value||'',true,'refreshCourtFinanceQuote')}</div><div class="tms-form-item" style="flex:0 0 118px;min-width:118px;"><input type="number" class="finput tms-form-control" id="nrSystemAmount" placeholder="系统应收" readonly></div><div class="tms-form-item" style="flex:0 0 118px;min-width:118px;"><input type="number" class="finput tms-form-control" id="nrFinalAmount" placeholder="最终成交" oninput="syncCourtFinalAmount()"></div><input type="hidden" id="nrPricePlanId"><div class="tms-form-item" style="flex:1;"><input type="text" class="finput tms-form-control" id="nrOverrideReason" placeholder="改价原因"></div></div><div class="tms-form-row" data-price-field="channel"><div class="tms-form-item"><input type="text" class="finput tms-form-control" id="nrChannelOrderNo" placeholder="平台订单号"></div><div class="tms-form-item"><input type="text" class="finput tms-form-control" id="nrRedeemCode" placeholder="核销码"></div></div><div class="tms-form-row" style="margin-bottom:0;"><div class="tms-form-item" style="flex:1;"><input type="text" class="finput tms-form-control" id="nrNote" placeholder="备注（非必填）"></div><div class="tms-form-item" style="flex:0 0 128px;"><input type="number" class="finput tms-form-control" id="nrAmt" placeholder="¥ 金额"></div><div class="tms-form-item" style="flex:none;width:120px;"><button class="schedule-detail-action primary" id="courtFinanceAddBtn" style="width:100%;" onclick="saveCourtFinanceRecord()">添加</button></div></div></div><div style="font-size:12px;color:var(--ts);margin:8px 0 6px" id="financeHint">本次订场会从当前余额扣款。</div><div style="font-size:12px;color:var(--ts);margin:0" id="nrQuoteMeta"></div>`;
  const actions=`<button type="button" class="schedule-detail-action" onclick="openCourtBookingEntryInline('${court.id}')">新增订场流水</button>`;
  const records=renderDetailDrawerCard('订场记录',courtBookingRecordsTableHtml(hist),{className:'membership-booking-records',useGrid:false,actionsHtml:actions});
  const closeAction=`<button type="button" class="schedule-detail-action muted" onclick="closeCourtBookingEntryInline('${court.id}')">取消</button>`;
  const entry=membershipBookingEntryOpen?renderDetailDrawerCard('新增订场流水',form,{useGrid:false,actionsHtml:closeAction}):'';
  return `${records}${entry}`;
}
function openCourtFinanceModal(courtId){
  const court=courts.find(c=>c.id===courtId);
  if(!court){toast('当前订场用户数据未加载，请刷新后重试','warn');return;}
  membershipBookingEntryOpen=true;
  openCourtMembershipPanel(courtId,{tab:'booking'});
  return;
  courtFinanceModalId=courtId;
  editId=null;
  _pending=[];
  const finance=courtFinanceLocal(court||{history:[]});
  const revenue=courtFinanceRevenueSummaryLocal(court||{history:[]});
  const studentOptions=[{value:'',label:'不关联'},...students.map(s=>({value:s.id,label:s.name}))];
  const coachOptions=[{value:'',label:'不安排陪打'},...activeCoachNames().map(name=>({value:name,label:name}))];
  const campusOptions=campuses.map(c=>({value:c.code||c.id,label:esc(c.name)}));
  const venueOptions=VENUES.map(v=>({value:v,label:esc(v)}));
  const channelProductOptions=[{value:'',label:'选择渠道商品'},...activeChannelProductOptions()];
  const hist=[...parseArr(court.history)].reverse();
  const financeSummaryHtml=`<div class="tms-detail-grid court-finance-summary-grid">${studentDetailFieldHtml('当前余额',fmt(finance.balance))}${studentDetailFieldHtml('累计充值',fmt(finance.totalDeposit))}${studentDetailFieldHtml('累计消费',fmt(finance.spentAmount))}${studentDetailFieldHtml('累计实收',fmt(finance.receivedAmount))}${studentDetailFieldHtml('确认订场收入',`¥${fmt(revenue.confirmedRevenue)}`)}${studentDetailFieldHtml('本次实收/现金流入',`¥${fmt(revenue.cashReceived)}`)}${studentDetailFieldHtml('待确认/代用户订场',`¥${fmt(revenue.pendingRevenue)}`)}${studentDetailFieldHtml('内部占用次数',`${revenue.internalOccupancyCount} 次`)}</div>`;
  const body=`<div class="tms-section-header" style="margin-top:0;">财务摘要</div>${financeSummaryHtml}<div class="tms-section-header">流水录入</div><div class="tms-record-add-box"><div class="tms-form-row"><div class="tms-form-item" style="flex:0 0 110px;min-width:110px;">${renderStandardDropdownHtml('nrType','交易类型',courtFinanceTransactionOptions(),'消耗',true,'onCourtFinanceSceneChange')}</div><div class="tms-form-item" style="flex:0 0 128px;min-width:128px;">${renderStandardDropdownHtml('nrCategory','业务类型',courtFinanceBusinessOptions(),'会员订场',true,'onCourtFinanceSceneChange')}</div><div class="tms-form-item" style="flex:0 0 128px;min-width:128px;">${renderStandardDropdownHtml('nrPayMethod','支付方式',courtPayMethodOptions(),'储值卡',true,'onCourtFinanceSceneChange')}</div><div class="tms-form-item" data-finance-field="student" style="flex:0 0 128px;min-width:128px;">${renderStandardDropdownHtml('nrStudentId','关联学员',studentOptions,'',true)}</div><div class="tms-form-item" data-finance-field="booking" style="flex:0 0 118px;min-width:118px;">${renderStandardDropdownHtml('nrCampus','校区',campusOptions,court.campus||campuses[0]?.code||campuses[0]?.id,true,'refreshCourtFinanceQuote')}</div><div class="tms-form-item" data-finance-field="booking" style="flex:0 0 118px;min-width:118px;">${renderStandardDropdownHtml('nrVenue','场地',venueOptions,venueOptions[0]?.value||'',true)}</div></div><div class="tms-form-row"><div class="tms-form-item" data-finance-field="booking" style="flex:0 0 168px;min-width:168px;">${courtDateButtonHtml('nrDate',today(),'发生日期')}</div><div class="tms-form-item" data-finance-field="booking" style="flex:0 0 100px;min-width:100px;">${renderStandardDropdownHtml('nrStartTime','08:00',getCourtTimeOptions('08:00'),'08:00',true,'refreshCourtFinanceQuote')}</div><div data-finance-field="booking" style="color:#8C7B6E;align-self:center;white-space:nowrap;padding:0 2px;">至</div><div class="tms-form-item" data-finance-field="booking" style="flex:0 0 100px;min-width:100px;">${renderStandardDropdownHtml('nrEndTime','10:00',getCourtTimeOptions('10:00'),'10:00',true,'refreshCourtFinanceQuote')}</div><div class="tms-form-item" data-finance-field="booking" style="flex:0 0 136px;min-width:136px;">${renderStandardDropdownHtml('nrCompanionCoach','陪打教练',coachOptions,'',true)}</div><div class="tms-form-item" data-finance-field="internal" style="flex:0 0 140px;min-width:140px;">${renderStandardDropdownHtml('nrInternalReason','占用原因',[{value:'领导打球',label:'领导打球'},{value:'活动',label:'活动'},{value:'测试教学',label:'测试教学'},{value:'其他',label:'其他'}],'领导打球',true)}</div><div class="tms-form-item" data-finance-field="course" style="flex:1;"><input type="number" class="finput tms-form-control" id="nrLessonCount" min="1" step="1" placeholder="节数"></div></div><div class="tms-form-row" data-finance-field="booking"><div class="tms-form-item" style="flex:0 0 132px;min-width:132px;">${renderStandardDropdownHtml('nrPriceMode','价格来源',[{value:'venue_rate',label:'场地价格'},{value:'channel_product',label:'渠道商品'},{value:'manual',label:'手动价格'}],'venue_rate',true,'onCourtFinanceSceneChange')}</div><div class="tms-form-item" data-price-field="channel" style="flex:1;">${renderStandardDropdownHtml('nrChannelProductId','渠道商品',channelProductOptions,channelProductOptions[0]?.value||'',true,'refreshCourtFinanceQuote')}</div><div class="tms-form-item" style="flex:0 0 118px;min-width:118px;"><input type="number" class="finput tms-form-control" id="nrSystemAmount" placeholder="系统应收" readonly></div><div class="tms-form-item" style="flex:0 0 118px;min-width:118px;"><input type="number" class="finput tms-form-control" id="nrFinalAmount" placeholder="最终成交" oninput="syncCourtFinalAmount()"></div><input type="hidden" id="nrPricePlanId"><div class="tms-form-item" style="flex:1;"><input type="text" class="finput tms-form-control" id="nrOverrideReason" placeholder="改价原因"></div></div><div class="tms-form-row" data-price-field="channel"><div class="tms-form-item"><input type="text" class="finput tms-form-control" id="nrChannelOrderNo" placeholder="平台订单号"></div><div class="tms-form-item"><input type="text" class="finput tms-form-control" id="nrRedeemCode" placeholder="核销码"></div></div><div class="tms-form-row" style="margin-bottom:0;"><div class="tms-form-item" style="flex:1;"><input type="text" class="finput tms-form-control" id="nrNote" placeholder="备注（非必填）"></div><div class="tms-form-item" style="flex:0 0 128px;"><input type="number" class="finput tms-form-control" id="nrAmt" placeholder="¥ 金额"></div><div class="tms-form-item" style="flex:none;width:160px;"><button class="tms-btn tms-btn-primary" id="courtFinanceAddBtn" style="width:100%;height:100%;padding:0;" onclick="saveCourtFinanceRecord()">添加</button></div></div></div><div style="font-size:12px;color:var(--ts);margin:0 0 6px" id="financeHint">本次订场会从当前余额扣款。</div><div style="font-size:12px;color:var(--ts);margin:0 0 16px" id="nrQuoteMeta"></div><div class="tms-section-header">历史记录</div><div class="tms-history-list">${renderCourtHistoryItems(hist)}</div>`;
  openStandardModal({title:`${court.name} · 记一笔流水`,bodyHtml:body,actionsHtml:`<button class="tms-btn tms-btn-default" style="width:100%;text-align:center" onclick="closeModal()">关闭</button>`,extraClass:'modal-wide'});
  onCourtFinanceSceneChange();
}
async function saveCourtFinanceRecord(){
  const court=courts.find(c=>c.id===courtFinanceModalId);
  if(!court){toast('当前订场用户数据未加载，请刷新后重试','warn');return;}
  const transactionType=document.getElementById('nrType').value,date=document.getElementById('nrDate').value,amt=parseFloat(document.getElementById('nrAmt').value),note=document.getElementById('nrNote').value.trim();
  const businessTypeLevel2=document.getElementById('nrCategory').value,payMethod=document.getElementById('nrPayMethod').value,studentId=document.getElementById('nrStudentId')?.value||'';
  const type=courtFinanceStoredType(transactionType);
  const category=courtFinanceStoredCategory(transactionType,businessTypeLevel2);
  const companionCoach=document.getElementById('nrCompanionCoach')?.value||'';
  const internalReason=document.getElementById('nrInternalReason')?.value||'';
  const startTime=document.getElementById('nrStartTime')?.value||'',endTime=document.getElementById('nrEndTime')?.value||'',venueValue=document.getElementById('nrVenue')?.value||'',recCampus=document.getElementById('nrCampus')?.value||court.campus||'',lessonCount=parseInt(document.getElementById('nrLessonCount')?.value)||0;
  const selectedVenue=courtVenueByValue(recCampus,venueValue);
  const venue=selectedVenue?.name||venueValue;
  const priceMode=document.getElementById('nrPriceMode')?.value||'manual',pricePlanId=document.getElementById('nrPricePlanId')?.value||'',channelProduct=selectedChannelProduct();
  const systemRaw=parseFloat(document.getElementById('nrSystemAmount')?.value),finalRaw=parseFloat(document.getElementById('nrFinalAmount')?.value);
  const systemAmount=Number.isFinite(systemRaw)?systemRaw:0,finalAmount=Number.isFinite(finalRaw)?finalRaw:(Number.isFinite(amt)?amt:0),overrideReason=document.getElementById('nrOverrideReason')?.value.trim()||'';
  if(!date){toast('请选择日期','warn');return;}
  if(category!=='内部占用'&&!Number.isFinite(amt)){toast('请输入金额','warn');return;}
  if(type==='消费'&&(String(category).includes('订场')||category==='内部占用')){
    if(!startTime||!endTime||!venue){toast('订场记录请填写时间和场地','warn');return;}
    if(endTime<=startTime){toast('订场结束时间不能早于开始时间','warn');return;}
  }
  if(category==='内部占用'&&!internalReason){toast('请选择占用原因','warn');return;}
  const priceOverridden=String(category).includes('订场')&&(systemAmount>0?systemAmount!==finalAmount:finalAmount===0);
  if(type==='消费'&&priceOverridden&&!overrideReason){toast('请填写改价原因','warn');return;}
  const now=new Date().toISOString();
  const revenueBucket=category==='内部占用'?'内部占用':String(category).includes('订场')?(isStoredValuePayMethod(payMethod)?'储值扣款':'现场收款'):'';
  const h={id:uid(),date,occurredDate:date,createdAt:now,recordedAt:now,type,transactionType,businessTypeLevel1:'场地',businessTypeLevel2,category,payMethod:category==='内部占用'?'其他':payMethod,normalizedPaymentMethod:normalizePaymentMethod(payMethod),studentId,amount:category==='内部占用'?0:Math.abs(finalAmount),note,startTime,endTime,venue,venueId:selectedVenue?.id||'',venueSpaceType:selectedVenue?.spaceType||'',campus:recCampus,lessonCount,internalReason,revenueBucket,priceMode,pricePlanId,channel:channelProduct?.channel||'',channelOrderNo:document.getElementById('nrChannelOrderNo')?.value?.trim?.()||'',redeemCode:document.getElementById('nrRedeemCode')?.value?.trim?.()||'',systemAmount,finalAmount,priceOverridden,overrideReason,memberDiscount:priceMode==='venue_rate'&&isStoredValuePayMethod(payMethod)?currentCourtMemberDiscount(court):1};
  const hist=[...courtBaseHistoryForSave(court),h];
  const preview=courtFinanceLocal({...court,history:hist});
  if(preview.balance<0){toast('余额不足，不能使用储值扣款','warn');return;}
  if(preview.receivedAmount<0){toast('退款金额超过累计实收','warn');return;}
  if(preview.spentAmount<0||preview.storedValueSpent<0||preview.directPaidSpent<0){toast('冲正金额超过已有消费','warn');return;}
  if(!await appConfirm(courtFinanceConfirmText(h,studentId),{title:'确认添加流水',confirmText:'确认添加'}))return;
  const rec={...court,history:hist};
  const inMembershipBookingDrawer=document.getElementById('overlay')?.dataset.membershipCourtId===court.id&&membershipDetailActiveTab==='booking';
  await runStandardMutation('courtFinanceAddBtn',async()=>{
    const saved=await apiCall('PUT','/courts/'+court.id,rec);
    const i=courts.findIndex(u=>u.id===court.id);
    if(i>=0)courts[i]=saved;
    let companionFailed='';
    if(companionCoach){
      try{
        const companionPayload={...h,scheduleSource:'订场陪打',courseType:'陪打'};
        await createCourtCompanionSchedule(saved,companionPayload,companionCoach);
      }catch(err){
        companionFailed=err.message||'陪打日程创建失败';
      }
    }
    return {companionFailed};
  },{
    successText:'',
    closeOnSuccess:!inMembershipBookingDrawer,
    onSuccess:({companionFailed}={})=>{
      toast(companionFailed?'流水已保存，陪打日程创建失败':'添加成功 ✓',companionFailed?'warn':'success');
    },
    refresh:[
      ()=>loadCourtReadModelGuardData({force:true}).then(()=>{renderCourts();renderMemberships();}),
      renderStudentsIfVisible,
      renderSchedule,
      renderMySchedule,
      ()=>{if(inMembershipBookingDrawer){membershipBookingEntryOpen=false;openCourtMembershipPanel(court.id,{tab:'booking'});}}
    ]
  });
}
function openCourtHist(id){
  const u=courts.find(x=>x.id===id);if(!u)return;editId=null;
  const hist=[...parseArr(u.history)].reverse();
  openStandardModal({title:`${esc(u.name)} · 充值/消费记录`,bodyHtml:`<div class="tms-history-list">${renderCourtHistoryItems(hist)}</div>`,actionsHtml:`<button class="tms-btn tms-btn-primary" style="width:100%;text-align:center" onclick="closeModal()">关闭</button>`,extraClass:'modal-tight'});
}
function exportCourtCSV(){
  const d=(courtAccountListViewData?.items||[]).filter(item=>campus==='all'||item.campusCode===campus);
  let csv='姓名,手机号,关联学员,校区,余额,储值,消费金额,实收金额,跟进人,储值态度,备注\n';
  csv+=d.map(item=>{const row=item.exportRow||item;return [csvEscapeCell(row.displayName),csvEscapeCell(row.phone||''),csvEscapeCell(row.linkedStudentSummary),csvEscapeCell(row.campusName),csvEscapeCell(row.balance||0),csvEscapeCell(row.totalDeposit||0),csvEscapeCell(row.totalSpent||0),csvEscapeCell(row.totalReceived||0),csvEscapeCell(row.owner),csvEscapeCell(row.depositAttitude||''),csvEscapeCell(row.notesSummary||'')].join(',')}).join('\n');
  const blob=new Blob(['\ufeff'+csv],{type:'text/csv;charset=utf-8;'});
  const a=document.createElement('a');a.href=URL.createObjectURL(blob);a.download='FlowTennis_订场用户_'+today()+'.csv';a.click();toast('导出成功','success');
}
async function openCourtFinanceMigrationPreview(){
  document.getElementById('mTitle').textContent='财务历史迁移预览';
  document.getElementById('mBody').innerHTML='<div class="empty"><p>正在生成预览…</p></div>';
  document.getElementById('overlay').classList.add('open');
  try{
    const res=await apiCall('POST','/courts/migrate-finance-legacy',{dryRun:true});
    renderCourtFinanceMigrationPreview(res);
  }catch(e){
    document.getElementById('mBody').innerHTML=`<div class="empty"><p>预览失败：${esc(e.message)}</p></div><div class="mactions"><button class="btn-save" onclick="closeModal()">关闭</button></div>`;
  }
}
function renderCourtFinanceMigrationPreview(res){
  const rows=(res.preview||[]).map(x=>`<tr><td>${esc(x.name)||'—'}</td><td>余额 ¥${fmt(x.before?.balance)} / 储值 ¥${fmt(x.before?.totalDeposit)} / 消费 ¥${fmt(x.before?.spentAmount)}</td><td>${(x.generated||[]).map(h=>`${esc(h.type)} ¥${fmt(h.amount)} ${esc(h.payMethod)}`).join('<br>')||'—'}</td><td>${(x.warnings||[]).map(esc).join('<br>')||'可迁移'}</td></tr>`).join('');
  document.getElementById('mBody').innerHTML=`<div style="background:rgba(217,119,6,0.08);border:0.5px solid rgba(217,119,6,0.2);border-radius:8px;padding:10px 12px;font-size:12px;color:var(--ts);margin-bottom:12px">只处理没有充值/消费记录、但有旧余额/储值/消费金额的订场用户。带警告的数据不会自动写入。</div><div style="font-size:13px;color:var(--tb);margin-bottom:10px">共 ${res.total} 人，候选 ${res.candidates} 人，可迁移 ${Math.max(0,(res.candidates||0)-(res.skipped||0))} 人，需人工核对 ${res.skipped||0} 人。</div><div class="tcard" style="max-height:360px;overflow:auto"><table><thead><tr><th>客户</th><th>旧金额</th><th>将生成流水</th><th>结果</th></tr></thead><tbody>${rows||'<tr><td colspan="4"><div class="empty"><p>没有需要迁移的数据</p></div></td></tr>'}</tbody></table></div><div class="mactions"><button class="btn-cancel" onclick="closeModal()">关闭</button><button class="btn-save" onclick="runCourtFinanceMigration()">执行无警告迁移</button></div>`;
}
async function runCourtFinanceMigration(){
  if(!confirm('只会迁移无警告数据，带警告的数据会跳过。确定执行吗？'))return;
  const btn=document.querySelector('.btn-save');btn.disabled=true;btn.textContent='迁移中…';
  try{
    const res=await apiCall('POST','/courts/migrate-finance-legacy',{dryRun:false});
    closeModal();toast(`迁移完成：${res.migrated||0} 人，跳过 ${res.skipped||0} 人`,'success');
    await loadPageDataAndRender('courts',{quiet:true,force:true});
  }catch(e){toast('迁移失败：'+e.message,'error');btn.disabled=false;btn.textContent='执行无警告迁移';}
}
let courtImportState={fileName:'',rows:[],summary:null};
function openCourtImport(){
  courtImportState={fileName:'',rows:[],summary:null};
  document.getElementById('importTitle').textContent='导入订场用户';
  document.getElementById('importBody').innerHTML=`<div class="import-grid"><div class="import-box"><label class="import-drop" for="courtImportFile"><strong>点击选择 CSV 文件</strong><div class="import-drop-sub">支持 UTF-8（fatal）/ GB18030 / GBK 编码，额外列会自动忽略</div></label><input class="import-file" id="courtImportFile" type="file" accept=".csv,text/csv" onchange="handleCourtImportFile(this)"><div class="import-meta" id="courtImportMeta"><span class="import-pill">未选择文件</span></div><div class="import-note" style="margin-top:10px">导入规则：<br>1. 必填字段：姓名。<br>2. 校区可留空。<br>3. 余额/储值默认 0。<br>4. 序号不会入库。<br>5. 已存在的用户会按手机号优先、否则按“姓名+校区”去重。<br>6. 跟进人只作为导入预览字段，最终以关联线索的跟进人为准。</div></div><div class="import-box"><div class="import-note"><strong>建议列名</strong><br>姓名、手机号、关联学员、校区、余额、储值、消费金额、跟进人、储值态度、备注<br><br><strong>特殊字段</strong><br>基本情况、沟通情况等，会自动保留到备注中。</div></div></div><div style="margin-top:14px" id="courtImportPreview"><div class="import-empty">请选择 CSV 文件后预览数据</div></div><div class="import-actions"><button class="btn-cancel" onclick="closeCourtImport()">取消</button><button class="btn-save" id="courtImportBtn" onclick="runCourtImport()" disabled>导入</button></div>`;
  document.getElementById('importOv').classList.add('open');
}
function closeCourtImport(){
  document.getElementById('importOv').classList.remove('open');
  courtImportState={fileName:'',rows:[],summary:null};
}
function parseCsvText(text){
  if(!text)return[];
  text=String(text).replace(/^\uFEFF/,'').replace(/\r\n/g,'\n').replace(/\r/g,'\n');
  const rows=[];let row=[];let cell='';let inQuotes=false;
  for(let i=0;i<text.length;i++){
    const ch=text[i],next=text[i+1];
    if(inQuotes){
      if(ch==='"'){
        if(next==='"'){cell+='"';i++;}
        else inQuotes=false;
      }else cell+=ch;
      continue;
    }
    if(ch==='"'){inQuotes=true;continue;}
    if(ch===','){row.push(cell);cell='';continue;}
    if(ch==='\n'){row.push(cell);rows.push(row);row=[];cell='';continue;}
    cell+=ch;
  }
  if(cell.length||row.length){row.push(cell);rows.push(row);}
  const headerRow=rows.shift()||[];
  const headers=headerRow.map(h=>String(h||'').trim());
  return rows
    .map(r=>headers.reduce((acc,h,idx)=>{if(h)acc[h]=r[idx]??'';return acc;},{}))
    .filter(r=>Object.values(r).some(v=>String(v||'').trim()!==''));
}
function normalizeImportPhone(v){
  return String(v||'').replace(/[^\d]/g,'').trim();
}
function validateCnPhone(v){
  const phone=String(v||'').replace(/\s+/g,'').trim();
  return !phone||/^1[3-9]\d{9}$/.test(phone);
}
function readRowValue(row, aliases){
  const lowerMap=new Map(Object.keys(row).map(k=>[String(k).trim().toLowerCase(),k]));
  for(const alias of aliases){
    const realKey=lowerMap.get(String(alias).trim().toLowerCase());
    if(realKey!=null){
      const val=row[realKey];
      if(val!=null&&String(val).trim()!=='')return String(val).trim();
    }
  }
  return '';
}
function collectUnknownNotes(row,knownKeys){
  const notes=[];
  for(const [k,v] of Object.entries(row)){
    const key=String(k||'').trim();
    const val=String(v||'').trim();
    if(!val)continue;
    if(knownKeys.some(x=>String(x).trim().toLowerCase()===key.toLowerCase()))continue;
    notes.push(`${key}：${val}`);
  }
  return notes;
}
const COURT_IMPORT_NAME_FIELDS=['姓名',...FlowTennisBusinessTaxonomy.legacyAliases('courtName'),'用户','订场用户','名称','客户'];
const COURT_IMPORT_STUDENT_LINK_FIELDS=['关联学员','学员',...FlowTennisBusinessTaxonomy.legacyAliases('courtStudentLink')];
const COURT_IMPORT_KNOWN_FIELDS=['序号',...COURT_IMPORT_NAME_FIELDS,'手机号','电话','手机','联系方式',...COURT_IMPORT_STUDENT_LINK_FIELDS,'校区','门店','区域','余额','储值','历史储值','总储值','累计储值','备注','说明','基本情况','沟通情况','消费金额','消费','消费金额（仅自己订场部分）','跟进人','负责人','储值态度','对储值态度','对储值的态度'];
function defaultCourtCampusCode(){
  return campuses[0]?.code||campuses[0]?.id||Object.keys(CAMPUS)[0]||'';
}
function getCourtDedupKeys(item){
  const keys=[];
  const phone=normalizeImportPhone(item.phone);
  if(phone)keys.push(`phone:${phone}`);
  const name=String(item.name||'').trim();
  const campus=String(item.campus||'').trim();
  if(name)keys.push(`namecampus:${name}|${campus}`);
  return keys;
}
function normalizeCampusCode(value){
  const raw=String(value||'').trim();
  if(!raw)return defaultCourtCampusCode();
  if(CAMPUS[raw])return raw;
  const match=Object.entries(CAMPUS).find(([,name])=>String(name).trim()===raw);
  return match?match[0]:raw;
}
function normalizeCourtImportRows(rawRows){
  const existingKeys=new Set();
  courts.forEach(item=>getCourtDedupKeys(item).forEach(k=>existingKeys.add(k)));
  const seenKeys=new Set();
  const rows=rawRows.map((row,index)=>{
    const name=readRowValue(row,COURT_IMPORT_NAME_FIELDS);
    const phone=readRowValue(row,['手机号','电话','手机','联系方式']);
    const studentId=resolveStudentIdByText(readRowValue(row,COURT_IMPORT_STUDENT_LINK_FIELDS)||phone||name);
    const campusRaw=readRowValue(row,['校区','门店','区域']);
    const campus=normalizeCampusCode(campusRaw);
    const balanceRaw=readRowValue(row,['余额']);
    const depositRaw=readRowValue(row,['储值','历史储值','总储值','累计储值']);
    const spentAmount=readRowValue(row,['消费金额','消费','消费金额（仅自己订场部分）']);
    const owner=readRowValue(row,['跟进人','负责人']);
    const depositAttitude=readRowValue(row,['储值态度','对储值态度','对储值的态度']);
    const baseNotes=[readRowValue(row,['备注','说明']),readRowValue(row,['基本情况']),readRowValue(row,['沟通情况'])].filter(Boolean).join('；');
    const extras=collectUnknownNotes(row,COURT_IMPORT_KNOWN_FIELDS);
    const notes=[baseNotes,...extras].filter(Boolean).join('；');
    const parsedSpent=importMoney(spentAmount);
    const parsedDeposit=importMoney(depositRaw)||extractDepositAmountFromText(depositAttitude);
    const inferredBalance=!hasImportValue(balanceRaw)&&parsedDeposit>0&&parsedSpent>0?Math.max(0,parsedDeposit-parsedSpent):importMoney(balanceRaw);
    const item={name,phone,studentId,campus,balance:inferredBalance,totalDeposit:parsedDeposit||0,spentAmount:parsedSpent,owner,depositAttitude,notes,status:'active',history:[]};
    const keys=getCourtDedupKeys(item);
    let status='待导入';
    let reason='';
    if(!item.name){status='无效';reason='缺少姓名';}
    else if(keys.some(k=>existingKeys.has(k))){status='重复';reason='系统中已存在';}
    else if(keys.some(k=>seenKeys.has(k))){status='重复';reason='文件内重复';}
    keys.forEach(k=>seenKeys.add(k));
    return {...item,_rowIndex:index+2,_status:status,_reason:reason,_raw:row,_keys:keys};
  });
  const summary={
    total:rows.length,
    valid:rows.filter(r=>r._status==='待导入').length,
    duplicate:rows.filter(r=>r._status==='重复').length,
    invalid:rows.filter(r=>r._status==='无效').length
  };
  return {rows,summary};
}
function renderCourtImportPreview(){
  const host=document.getElementById('courtImportPreview');
  const meta=document.getElementById('courtImportMeta');
  const btn=document.getElementById('courtImportBtn');
  const {rows,summary}=courtImportState;
  if(meta){
    meta.innerHTML=courtImportState.fileName?[
      `<span class="import-pill ok">文件：${esc(courtImportState.fileName)}</span>`,
      `<span class="import-pill">总计 ${summary.total} 行</span>`,
      `<span class="import-pill ok">可导入 ${summary.valid} 行</span>`,
      summary.duplicate?`<span class="import-pill warn">重复 ${summary.duplicate} 行</span>`:'',
      summary.invalid?`<span class="import-pill warn">无效 ${summary.invalid} 行</span>`:''
    ].join(''):'<span class="import-pill">未选择文件</span>';
  }
  if(btn)btn.disabled=!summary||summary.valid===0;
  if(!rows.length){host.innerHTML='<div class="import-empty">请选择 CSV 文件后预览数据</div>';return;}
  const previewRows=rows.slice(0,50).map((r,i)=>{
    const cls=r._status==='待导入'?'ok':r._status==='重复'?'warn':'err';
    const statusText=r._status==='待导入'?'可导入':r._status==='重复'?`已跳过：${r._reason}`:`无效：${r._reason}`;
    const st=r.studentId?students.find(s=>s.id===r.studentId):null;
    return `<tr class="import-row ${cls}"><td>${esc(r.name||'')}</td><td>${esc(r.phone||'')}</td><td>${esc(st?.name||'')}</td><td>${cn(r.campus)||esc(r.campus||'')}</td><td>${fmt(r.balance)||0}</td><td>${fmt(r.totalDeposit)||0}</td><td>${fmt(r.spentAmount)||0}</td><td>${esc(r.owner||'')}</td><td>${esc(r.depositAttitude||'')}</td><td style="max-width:240px;white-space:normal;word-break:break-word">${esc(r.notes||'')}</td><td><span class="import-status ${cls}">${statusText}</span></td></tr>`;
  }).join('');
  host.innerHTML=`<div class="import-table-wrap"><table class="import-table"><thead><tr><th>姓名</th><th>手机号</th><th>关联学员</th><th>校区</th><th>余额</th><th>储值</th><th>消费金额</th><th>跟进人</th><th>储值态度</th><th>备注</th><th>结果</th></tr></thead><tbody>${previewRows}</tbody></table></div>${rows.length>50?`<div class="import-note" style="margin-top:8px">仅预览前 50 行，实际会按全部可导入数据执行。</div>`:''}`;
}
async function handleCourtImportFile(input){
  const file=input.files&&input.files[0];
  if(!file)return;
  try{
    const buf=await file.arrayBuffer();
    const text=decodeCourtCsvText(buf);
    const raw=parseCsvText(text);
    const normalized=normalizeCourtImportRows(raw);
    courtImportState={fileName:file.name,rows:normalized.rows,summary:normalized.summary};
    renderCourtImportPreview();
  }catch(e){
    toast('读取失败：'+e.message,'error');
  }
}
async function runCourtImport(){
  const btn=document.getElementById('courtImportBtn');
  const rows=(courtImportState.rows||[]).filter(r=>r._status==='待导入');
  if(!rows.length){toast('没有可导入的数据','warn');return;}
  btn.disabled=true;btn.textContent=`导入中 0/${rows.length}`;
  let success=0,failed=0;
  try{
    const makePayload=row=>({name:row.name,phone:row.phone,studentId:row.studentId,campus:row.campus,balance:row.balance,totalDeposit:row.totalDeposit,spentAmount:row.spentAmount,owner:row.owner,depositAttitude:row.depositAttitude,familiarity:row.familiarity,joinDate:row.joinDate,recentFollowUpDate:row.recentFollowUpDate,nextFollowUpDate:row.nextFollowUpDate,notes:row.notes,status:'active',history:[]});
    for(let i=0;i<rows.length;i+=20){
      const batchRows=rows.slice(i,i+20);
      const payload=batchRows.map(makePayload);
      const result=await apiCall('POST','/courts/import',{rows:payload});
      success+=result.success||0;failed+=result.failed||0;
      batchRows.forEach((row,index)=>{
        const err=result.errors?.find(e=>e.name===payload[index].name);
        row._status=err?'无效':'已导入';
        row._reason=err?err.error:'';
      });
      btn.textContent=`导入中 ${Math.min(i+batchRows.length,rows.length)}/${rows.length}`;
      renderCourtImportPreview();
    }
    await loadPageDataAndRender('courts',{quiet:true,force:true});
    renderCourtImportPreview();
    renderCourts();
    toast(`导入完成：成功 ${success} 行，失败 ${failed} 行`,'success');
    closeCourtImport();
  }catch(e){
    toast('导入失败：'+e.message,'error');
  }finally{
    btn.disabled=false;
    btn.textContent='导入';
  }
}
function closePurchaseImport(){
  document.getElementById('importOv').classList.remove('open');
  purchaseImportState={fileName:'',rows:[],summary:null};
}
function normalizePackageIdByText(value){
  const raw=String(value||'').trim();
  if(!raw)return '';
  const byId=packages.find(p=>p.id===raw);
  if(byId)return byId.id;
  const byName=packages.find(p=>String(p.name||'').trim()===raw);
  return byName?.id||'';
}
function normalizePurchaseImportRows(rawRows){
  const rows=rawRows.map((row,index)=>{
    const studentText=readRowValue(row,['学员',...FlowTennisBusinessTaxonomy.legacyAliases('courtStudentLink'),'姓名','手机号','电话']);
    const phone=readRowValue(row,['手机号','电话','手机']);
    const studentMatch=resolveUniqueStudentIdByText(studentText||phone);
    const packageMatch=resolveUniquePackageIdByText(readRowValue(row,['售卖课包','课包','课包名称']));
    const studentId=studentMatch.id;
    const packageId=packageMatch.id;
    const student=students.find(s=>s.id===studentId);
    const pkg=packages.find(p=>p.id===packageId);
    const item={studentId,studentName:student?.name||'',packageId,packageName:pkg?.name||'',purchaseDate:readRowValue(row,['购买日期','日期'])||today(),amountPaid:importMoney(readRowValue(row,['实收','实收金额','金额']))||(pkg?.price||0),payMethod:readRowValue(row,['支付方式','支付'])||'微信',notes:readRowValue(row,['备注','说明'])||''};
    let status='待导入',reason='';
    if(!studentId){status='无效';reason=studentMatch.reason;}
    else if(!packageId){status='无效';reason=packageMatch.reason;}
    else if(pkg?.status==='inactive'){status='无效';reason='课包已停用';}
    return {...item,_rowIndex:index+2,_status:status,_reason:reason};
  });
  return {rows,summary:{total:rows.length,valid:rows.filter(r=>r._status==='待导入').length,invalid:rows.filter(r=>r._status!=='待导入').length}};
}
function renderPurchaseImportPreview(){
  const host=document.getElementById('purchaseImportPreview');
  const meta=document.getElementById('purchaseImportMeta');
  const btn=document.getElementById('purchaseImportBtn');
  const {rows,summary}=purchaseImportState;
  if(meta){
    meta.innerHTML=purchaseImportState.fileName?[
      `<span class="import-pill ok">文件：${esc(purchaseImportState.fileName)}</span>`,
      `<span class="import-pill">总计 ${summary.total} 行</span>`,
      `<span class="import-pill ok">可导入 ${summary.valid} 行</span>`,
      summary.invalid?`<span class="import-pill warn">无效 ${summary.invalid} 行</span>`:''
    ].join(''):'<span class="import-pill">未选择文件</span>';
  }
  if(btn)btn.disabled=!summary||summary.valid===0;
  if(!rows.length){if(host)host.innerHTML='<div class="import-empty">请选择 CSV 文件后预览数据</div>';return;}
  const previewRows=rows.slice(0,50).map(r=>{
    const cls=r._status==='待导入'?'ok':'err';
    const statusText=r._status==='待导入'?'可导入':`无效：${r._reason}`;
    const pkg=packages.find(p=>p.id===r.packageId);
    return `<tr class="import-row ${cls}"><td>${esc(r.studentName||'')}</td><td>${esc(pkg?.productName||'')}</td><td>${esc(r.packageName||'')}</td><td>${esc(r.purchaseDate||'')}</td><td>${fmt(r.amountPaid)||0}</td><td>${esc(r.payMethod||'')}</td><td style="max-width:220px;white-space:normal;word-break:break-word">${esc(r.notes||'')}</td><td><span class="import-status ${cls}">${statusText}</span></td></tr>`;
  }).join('');
  if(host)host.innerHTML=`<div class="import-table-wrap"><table class="import-table"><thead><tr><th>学员</th><th>课程产品</th><th>售卖课包</th><th>购买日期</th><th>实收</th><th>支付方式</th><th>备注</th><th>结果</th></tr></thead><tbody>${previewRows}</tbody></table></div>${rows.length>50?`<div class="import-note" style="margin-top:8px">仅预览前 50 行，实际会按全部可导入数据执行。</div>`:''}`;
}
async function handlePurchaseImportFile(input){
  const file=input.files&&input.files[0];
  if(!file)return;
  try{
    const buf=await file.arrayBuffer();
    let text='';
    for(const enc of ['utf-8','gb18030','gbk']){
      try{text=new TextDecoder(enc).decode(buf);if(text)break;}catch{text='';}
    }
    const raw=parseCsvText(text);
    const normalized=normalizePurchaseImportRows(raw);
    purchaseImportState={fileName:file.name,rows:normalized.rows,summary:normalized.summary};
    renderPurchaseImportPreview();
  }catch(e){
    toast('读取失败：'+e.message,'error');
  }
}
function openPurchaseImport(){
  purchaseImportState={fileName:'',rows:[],summary:null};
  document.getElementById('importTitle').textContent='导入购买记录';
  document.getElementById('importBody').innerHTML=`<div class="import-grid"><div class="import-box"><label class="import-drop" for="purchaseImportFile"><strong>点击选择 CSV 文件</strong><div class="import-drop-sub">支持 UTF-8 / GBK / GB18030 编码</div></label><input class="import-file" id="purchaseImportFile" type="file" accept=".csv,text/csv" onchange="handlePurchaseImportFile(this)"><div class="import-meta" id="purchaseImportMeta"><span class="import-pill">未选择文件</span></div><div class="import-note" style="margin-top:10px">建议列名：学员、售卖课包、购买日期、实收、支付方式、备注。<br>学员可以写姓名或手机号；售卖课包必须能匹配到现有课包。</div></div><div class="import-box"><div class="import-note"><strong>导入规则</strong><br>1. 导入时仍按现有购买逻辑逐条创建。<br>2. 每条购买都会自动生成课包余额。<br>3. 不存在的学员或课包会直接拦下，不会半条写入。</div></div></div><div style="margin-top:14px" id="purchaseImportPreview"><div class="import-empty">请选择 CSV 文件后预览数据</div></div><div class="import-actions"><button class="btn-cancel" onclick="closePurchaseImport()">取消</button><button class="btn-save" id="purchaseImportBtn" onclick="runPurchaseImport()" disabled>导入</button></div>`;
  document.getElementById('importOv').classList.add('open');
}
async function runPurchaseImport(){
  const btn=document.getElementById('purchaseImportBtn');
  const rows=(purchaseImportState.rows||[]).filter(r=>r._status==='待导入');
  if(!rows.length){toast('没有可导入的数据','warn');return;}
  btn.disabled=true;btn.textContent=`导入中 0/${rows.length}`;
  let success=0,failed=0;
  try{
    for(let i=0;i<rows.length;i++){
      const row=rows[i];
      try{
        const pkg=packages.find(p=>p.id===row.packageId);
        const overrideReason=(Number(row.amountPaid)||0)!==(Number(pkg?.price)||0)?'导入历史成交价':'';
        const res=await apiCall('POST','/purchases',{studentId:row.studentId,packageId:row.packageId,purchaseDate:row.purchaseDate,amountPaid:row.amountPaid,overrideReason,payMethod:row.payMethod,notes:row.notes});
        if(res.purchase)purchases.unshift(res.purchase);
        if(res.entitlement)entitlements.unshift(res.entitlement);
        row._status='已导入';
        success++;
      }catch(e){
        row._status='无效';
        row._reason=e.message;
        failed++;
      }
      btn.textContent=`导入中 ${i+1}/${rows.length}`;
      renderPurchaseImportPreview();
    }
    renderStudents();renderPurchases();renderEntitlements();
    toast(`导入完成：成功 ${success} 行，失败 ${failed} 行`,failed?'warn':'success');
    closePurchaseImport();
  }catch(e){
    toast('导入失败：'+e.message,'error');
  }finally{
    btn.disabled=false;
    btn.textContent='导入';
  }
}
