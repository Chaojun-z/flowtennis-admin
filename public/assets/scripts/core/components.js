// Shared UI component entry. Start with the global top filters.
let globalDateRangeDraftActive=false;
function globalTopFilterPages(){
  return ['students','leads','schedule','finance'];
}
function globalDateFilterQuickOptions(){
  return ['全部','今日','本周','本月','自定义'];
}
function globalCampusOptions(){
  const campusSource=Array.isArray(campuses)?campuses:[];
  return [{value:'all',label:'全部校区'}].concat(campusSource.map(row=>({
    value:String(row?.code||row?.id||'').trim(),
    label:String(row?.name||row?.code||row?.id||'').trim()
  })).filter(opt=>opt.value&&opt.label));
}
function activeGlobalDateRange(){
  if(globalDateRangeFilterValue==='自定义')return {startDate:globalDateRangeStart,endDate:globalDateRangeEnd};
  if(globalDateRangeFilterValue&&globalDateRangeFilterValue!=='全部'){
    return typeof resolveCourtDatePresetRange==='function'?resolveCourtDatePresetRange(globalDateRangeFilterValue):{startDate:globalDateRangeStart,endDate:globalDateRangeEnd};
  }
  return {startDate:'',endDate:''};
}
function currentGlobalDateRangeLabel(){
  if(globalDateRangeFilterValue==='全部')return '全部时间';
  const range=activeGlobalDateRange();
  if(typeof formatCourtDateRangeValue==='function')return formatCourtDateRangeValue(range.startDate,range.endDate);
  return range.startDate&&range.endDate?`${range.startDate} 至 ${range.endDate}`:globalDateRangeFilterValue;
}
function syncCourtDateRangeFromGlobal(){
  courtDateRangeFilterValue=globalDateRangeFilterValue;
  courtDateRangeStart=globalDateRangeStart;
  courtDateRangeEnd=globalDateRangeEnd;
}
function syncGlobalDateRangeFromCourt(shouldRender=false){
  if(globalDateRangeDraftActive&&globalTopFilterPages().includes(currentPage))return;
  globalDateRangeFilterValue=courtDateRangeFilterValue;
  globalDateRangeStart=courtDateRangeStart;
  globalDateRangeEnd=courtDateRangeEnd;
  saveGlobalDateRange();
  if(shouldRender&&globalTopFilterPages().includes(currentPage))renderCurrentGlobalFilterPage();
}
function beginGlobalCustomDateDraft(){
  globalDateRangeDraftActive=true;
  courtDateRangeFilterValue='自定义';
  courtDateRangeStart='';
  courtDateRangeEnd='';
  if(typeof today==='function')window.__courtDateRangeViewAnchor=`${today().slice(0,7)}-01`;
}
function applyGlobalCustomDateRange(){
  if(!courtDateRangeStart||!courtDateRangeEnd)return false;
  globalDateRangeDraftActive=false;
  globalDateRangeFilterValue='自定义';
  globalDateRangeStart=courtDateRangeStart;
  globalDateRangeEnd=courtDateRangeEnd;
  saveGlobalDateRange();
  return true;
}
function cancelGlobalCustomDateDraft(){
  if(!globalDateRangeDraftActive)return;
  globalDateRangeDraftActive=false;
  syncCourtDateRangeFromGlobal();
  refreshGlobalTopFilters();
}
function clearGlobalDateRange(event){
  if(event)event.stopPropagation();
  globalDateRangeDraftActive=false;
  globalDateRangeFilterValue='全部';
  globalDateRangeStart='';
  globalDateRangeEnd='';
  saveGlobalDateRange();
  refreshGlobalTopFilters();
  renderCurrentGlobalFilterPage();
  closeCourtTopDropdowns();
}
function saveGlobalDateRange(){
  localStorage.setItem(GLOBAL_DATE_RANGE_KEY,globalDateRangeFilterValue);
  localStorage.setItem(GLOBAL_DATE_RANGE_START_KEY,globalDateRangeStart);
  localStorage.setItem(GLOBAL_DATE_RANGE_END_KEY,globalDateRangeEnd);
  syncCourtDateRangeFromGlobal();
}
function globalTopDateMenuActive(label){
  if(label==='自定义')return globalDateRangeDraftActive||globalDateRangeFilterValue==='自定义';
  return !globalDateRangeDraftActive&&label===globalDateRangeFilterValue;
}
function renderGlobalTopFilters(){
  if(typeof renderCourtTopDropdown!=='function'||typeof courtTopLocationIcon!=='function'||typeof courtTopTimeIcon!=='function')return '';
  const campusOpts=globalCampusOptions();
  const campusMenu=campusOpts.map(opt=>`<div class="tms-dropdown-item ${campus===opt.value?'active':''}" data-value="${esc(opt.value)}" onclick="selectGlobalTopCampus(${jsArg(opt.value)},event)">${esc(opt.label)}</div>`).join('');
  const timeMenu=globalDateFilterQuickOptions().map(label=>`<div class="tms-dropdown-item ${globalTopDateMenuActive(label)?'active':''}" data-value="${esc(label)}" onclick="setGlobalDateRangeFilter(${jsArg(label)},event)">${esc(label)}</div>`).join('');
  const showCustomPanel=globalDateRangeDraftActive||globalDateRangeFilterValue==='自定义';
  const dateMenuClass=`court-top-date-menu ${showCustomPanel?'is-custom':'is-quick'}`;
  const dateMenu=showCustomPanel
    ? `<div class="court-date-range-shell"><div class="court-date-range-left">${timeMenu}</div><div class="court-date-range-right">${renderCourtDateRangePanel()}</div></div>`
    : timeMenu;
  return `<div class="court-top-filterbar"><div class="court-top-filter-item">${renderCourtTopDropdown('globalTopCampus',campusOpts.find(opt=>opt.value===campus)?.label||'全部校区',courtTopLocationIcon(),campusMenu,'court-top-campus-menu')}</div><div class="court-top-filter-item">${renderCourtTopDropdown('globalTopDate',currentGlobalDateRangeLabel(),courtTopTimeIcon(),dateMenu,dateMenuClass)}</div></div>`;
}
function refreshGlobalTopFilters(){
  const host=document.getElementById('campusTabs');
  if(host&&globalTopFilterPages().includes(currentPage))host.innerHTML=renderGlobalTopFilters();
}
function selectGlobalTopCampus(value,event){
  if(event)event.stopPropagation();
  setCampus(null,value||'all');
  closeCourtTopDropdowns();
}
function renderCurrentGlobalFilterPage(){
  stuPage=1;leadPage=1;schPage=1;financeLedgerPage=1;financeRevenuePage=1;adminUserPage=1;
  if(currentPage==='students')renderStudents();
  if(currentPage==='leads')renderLeads();
  if(currentPage==='schedule')renderSchedule();
  if(currentPage==='finance')renderFinanceCenter();
  if(currentPage==='courts')renderCourts();
}
function setGlobalDateRangeFilter(value,event){
  if(event)event.stopPropagation();
  if(value==='自定义'){
    beginGlobalCustomDateDraft();
    refreshGlobalTopFilters();
    const dropdown=document.getElementById('globalTopDate_dropdown');
    if(dropdown)dropdown.classList.add('open');
    return;
  }
  globalDateRangeDraftActive=false;
  globalDateRangeFilterValue=value||'全部';
  if(globalDateRangeFilterValue==='全部'){
    globalDateRangeStart='';
    globalDateRangeEnd='';
  }else if(typeof resolveCourtDatePresetRange==='function'){
    const preset=resolveCourtDatePresetRange(globalDateRangeFilterValue);
    globalDateRangeStart=preset.startDate;
    globalDateRangeEnd=preset.endDate;
    window.__courtDateRangeViewAnchor=`${preset.startDate.slice(0,7)}-01`;
  }
  saveGlobalDateRange();
  refreshGlobalTopFilters();
  renderCurrentGlobalFilterPage();
  closeCourtTopDropdowns();
}
function globalDateWithinRange(value){
  const range=activeGlobalDateRange();
  const start=String(range.startDate||'').trim();
  const end=String(range.endDate||'').trim();
  if(!start&&!end)return true;
  const day=typeof courtDateKeyForFilter==='function'?courtDateKeyForFilter(value):String(value||'').slice(0,10);
  if(!day)return true;
  if(start&&day<start)return false;
  if(end&&day>end)return false;
  return true;
}
function financeSettlementMonthWithinGlobalRange(month){
  const value=String(month||'').slice(0,7);
  if(!value)return true;
  const range=activeGlobalDateRange();
  const start=String(range.startDate||'').slice(0,7);
  const end=String(range.endDate||'').slice(0,7);
  if(start&&value<start)return false;
  if(end&&value>end)return false;
  return true;
}
