// ===== 教练运营 =====
let coachOpsDraggedName='';
const COACH_OPS_COACH_FILTER_KEY='ft_coach_ops_coach_filter';
const COACH_OPS_DAY_HOUR_HEIGHT=56;
const COACH_OPS_DAY_COACH_WIDTH=128;
const COACH_OPS_WEEK_HOUR_HEIGHT=40;
const COACH_OPS_MONTH_VISIBLE_COACHES=5;
let coachOpsSelectedCoach=localStorage.getItem(COACH_OPS_COACH_FILTER_KEY)||'';
let coachOpsAutoScrollDayView=false;
let coachOpsAutoScrollWeekView=false;
let coachOpsPendingCreateSlot=null;
function isCoachSchedulePage(){
  return currentPage==='coachschedule';
}
function isCoachWorkloadPage(){
  return currentPage==='coachops';
}
function coachOpsDateInput(){
  return document.getElementById(isCoachWorkloadPage()?'coachOpsWorkloadDate':'coachOpsDate')||document.getElementById('coachOpsDate')||document.getElementById('coachOpsWorkloadDate');
}
function coachOpsPickerEl(){
  return document.getElementById(isCoachWorkloadPage()?'coachOpsWorkloadPicker':'coachOpsPicker')||document.getElementById('coachOpsPicker')||document.getElementById('coachOpsWorkloadPicker');
}
function updateCoachOpsPageChrome(){
  const legend=document.getElementById('coachOpsLegend');
  if(legend)legend.innerHTML=coachOpsCourseTypeLegendHtml();
}
function setFinancePanel(panel){
  financePanel=['ledger','revenue','recognized','settlement'].includes(panel)?panel:'ledger';
  const panelMap={
    ledger:['financeLedgerPanel','financeTabLedger'],
    revenue:['financeRevenuePanel','financeTabRevenue'],
    recognized:['financeRecognizedPanel','financeTabRecognized'],
    settlement:['financeSettlementPanel','financeTabSettlement']
  };
  Object.entries(panelMap).forEach(([key,[panelId,tabId]])=>{
    const panelEl=document.getElementById(panelId);
    const tabEl=document.getElementById(tabId);
    if(panelEl)panelEl.style.display=financePanel===key?'':'none';
    if(tabEl)tabEl.classList.toggle('active',financePanel===key);
  });
  if(currentPage==='finance'){
    if(financePanel==='ledger'){
      renderFinanceOverview();
      renderFinanceLedger();
    }else if(financePanel==='revenue'){
      renderFinanceRevenueReport();
    }else if(financePanel==='recognized'){
      renderFinanceConsumeReport();
    }else if(financePanel==='settlement'){
      renderFinanceSettlementSummary();
    }
  }
}
function renderFinanceCenter(){
  ensureCoachOpsReportDateControls();
  syncFinanceLedgerLoadingState();
  setFinancePanel(financePanel);
}
let financePrepaidFilter='all';
function renderFinanceLedgerPageSizeFilter(){const host=document.getElementById('financeLedgerPageSize');if(!host)return;host.innerHTML=renderPageSizeSelectorHtml('financeLedgerPageSizeValue',financeLedgerPageSize,'setFinanceLedgerPageSize');}
function setFinanceLedgerPageSize(value){financeLedgerPageSize=standardListPageSize(value,financeLedgerPageSize);financeLedgerPage=standardListFirstPage();renderFinanceLedger();}
function setFinanceLedgerPage(page){financeLedgerPage=standardListPagination(financeLedgerRows().length,page,financeLedgerPageSize).page;renderFinanceLedger();}
function resetFinanceLedgerPage(){financeLedgerPage=standardListFirstPage();}
function financeLedgerExactTimeText(row){
  const businessDate=String(row?.businessDate||'').trim().replace('T',' ');
  if(/\d{4}-\d{2}-\d{2}\s+\d{2}:\d{2}:\d{2}/.test(businessDate))return businessDate.slice(11,19);
  if(/\d{4}-\d{2}-\d{2}\s+\d{2}:\d{2}/.test(businessDate))return `${businessDate.slice(11,16)}:00`;
  return '00:00:00';
}
function financeDateTimeDisplayText(row){
  const businessDate=String(row?.businessDate||row?.purchaseDate||'').trim().replace('T',' ');
  if(!businessDate)return '-';
  if(/\d{4}-\d{2}-\d{2}\s+\d{2}:\d{2}:\d{2}/.test(businessDate))return businessDate.slice(0,19);
  if(/\d{4}-\d{2}-\d{2}\s+\d{2}:\d{2}/.test(businessDate))return `${businessDate.slice(0,16)}:00`;
  return `${businessDate.slice(0,10)} 00:00:00`;
}
function financeOperatorDisplayText(row){const collector=String(row?.collector||row?.operator||'').trim();const importHint=String(row?.importSource||'').trim()==='系统导入'||/导入/.test(`${row?.sourceProject||''} ${row?.notes||''} ${row?.sourceDocument||''}`);if(importHint||collector==='未记录')return '系统导入';return collector&&collector!=='系统记录'?collector:'-';}
function financeHumanNote(note=''){const text=String(note||'').trim(),consumeRecordText='课包消耗'+'记录';if(!text)return '';const auditPattern=new RegExp(`(订场收入细项修数|会员订场修正|马坡补账|私教课CSV.*导入|来源价格\\d*：${consumeRecordText}|正确表第\\s*\\d+\\s*行|[^\\s；;]*订场（\\d+次，[\\d.]+元）#\\d+|网球兄弟.*\\.csv#\\d+|来源\\s*[^；;]*\\.csv#\\d+|用户确认：|实际扣款\\s*[\\d.]+)`);return text.split(/[；;]/).map(part=>part.trim()).filter(part=>part&&!auditPattern.test(part)).join('；');}
function financeLedgerSortKey(row){
  return `${String(row?.businessDate||'').slice(0,10)} ${financeLedgerExactTimeText(row)}`;
}
function jumpFinanceLedgerPage(value){
  financeLedgerPage=standardListPagination(financeLedgerRows().length,value,financeLedgerPageSize).page;
  renderFinanceLedger();
}
function renderFinanceRevenuePageSizeFilter(){const host=document.getElementById('financeRevenuePageSize');if(!host)return;host.innerHTML=renderPageSizeSelectorHtml('financeRevenuePageSizeValue',financeRevenuePageSize,'setFinanceRevenuePageSize');}
function setFinanceRevenuePageSize(value){financeRevenuePageSize=standardListPageSize(value,financeRevenuePageSize);financeRevenuePage=standardListFirstPage();renderFinanceRevenueReport();}
function setFinanceRevenuePage(page){financeRevenuePage=standardListPagination(financeRevenueRows().length,page,financeRevenuePageSize).page;renderFinanceRevenueReport();}
function resetFinanceRevenuePage(){financeRevenuePage=standardListFirstPage();}
function renderFinanceRecognizedPageSizeFilter(){const host=document.getElementById('financeRecognizedPageSize');if(!host)return;host.innerHTML=renderPageSizeSelectorHtml('financeRecognizedPageSizeValue',financeRecognizedPageSize,'setFinanceRecognizedPageSize');}
function setFinanceRecognizedPageSize(value){financeRecognizedPageSize=standardListPageSize(value,financeRecognizedPageSize);financeRecognizedPage=standardListFirstPage();renderFinanceConsumeReport();}
function setFinanceRecognizedPage(page){financeRecognizedPage=standardListPagination(financeRecognizedRows().length,page,financeRecognizedPageSize).page;renderFinanceConsumeReport();}
function resetFinanceRecognizedPage(){financeRecognizedPage=standardListFirstPage();}
function setFinancePrepaidFilter(filter){
  financePrepaidFilter=['all','lesson','stored'].includes(filter)?filter:'all';
  [['financePrepaidFilterAll','all'],['financePrepaidFilterLesson','lesson'],['financePrepaidFilterStored','stored']].forEach(([id,key])=>{
    document.getElementById(id)?.classList.toggle('active',financePrepaidFilter===key);
  });
  renderFinancePrepaidBalance();
}
function coachOpsLessonText(value){
  const n=Number(value)||0;
  return Number.isInteger(n)?String(n):String(Math.round(n*10)/10);
}
function coachOpsLedgerTimeText(row){
  if(row?.importSource==='系统导入'&&row?.sourceDate&&row?.sourceTimeBand)return `${row.sourceDate} ${row.sourceTimeBand} · 系统导入`;
  if(row?.importSource==='系统导入'&&row?.sourceMonth)return `${row.sourceMonth} · 系统导入`;
  return fmtDt(row?.createdAt||row?.relatedDate);
}
function updateCoachOpsDateButton(){
  const btn=document.getElementById('coachOpsDateBtn');
  if(btn)btn.textContent=coachOpsDateLabel();
  const workloadBtn=document.getElementById('coachOpsWorkloadDateBtn');
  if(workloadBtn)workloadBtn.textContent=coachOpsDateLabel();
}
function closeCoachOpsPicker(){
  document.getElementById('coachOpsPicker')?.classList.remove('open');
  document.getElementById('coachOpsWorkloadPicker')?.classList.remove('open');
}
function ensureCoachOpsReportDateControls(){}
function toggleCoachOpsPicker(event){
  if(event){event.preventDefault();event.stopPropagation();}
  const pop=coachOpsPickerEl();if(!pop)return;
  coachOpsPickerMonth=monthStart(coachOpsInputDate());
  renderCoachOpsPicker();
  pop.classList.toggle('open');
}
function moveCoachOpsPickerMonth(step,event){if(event){event.preventDefault();event.stopPropagation();}coachOpsPickerMonth=addMonths(coachOpsPickerMonth||coachOpsInputDate(),step);renderCoachOpsPicker();}
function pickCoachOpsDate(value){
  const el=coachOpsDateInput();if(!el)return;
  el.value=value;
  delete el.dataset.coachOpsAutoDate;
  closeCoachOpsPicker();
  renderCoachOps();
}
function renderCoachOpsPicker(){
  const pop=coachOpsPickerEl();if(!pop)return;
  const selected=coachOpsInputDate();
  const base=coachOpsPickerMonth||monthStart(selected);
  if(coachOpsMode==='month'){
    const months=Array.from({length:12},(_,i)=>{
      const active=selected.getFullYear()===base.getFullYear()&&selected.getMonth()===i;
      return `<button class="coach-picker-month ${active?'active':''}" onclick="pickCoachOpsDate('${base.getFullYear()}-${String(i+1).padStart(2,'0')}')">${i+1}月</button>`;
    }).join('');
    pop.innerHTML=`<div class="coach-picker-head"><button class="coach-picker-move" onclick="moveCoachOpsPickerMonth(-12,event)">‹</button><div class="coach-picker-title">${base.getFullYear()} 年</div><button class="coach-picker-move" onclick="moveCoachOpsPickerMonth(12,event)">›</button></div><div class="coach-picker-months">${months}</div>`;
    return;
  }
  const first=new Date(base.getFullYear(),base.getMonth(),1);
  const gridStart=addDays(first,-((first.getDay()+6)%7));
  const selectedKey=dateKey(selected);
  const selectedWeekStart=weekStart(selected);
  const days=Array.from({length:42},(_,i)=>{
    const d=addDays(gridStart,i),ds=dateKey(d);
    const muted=d.getMonth()!==base.getMonth();
    const active=coachOpsMode==='day'&&ds===selectedKey;
    const weekActive=coachOpsMode==='week'&&ds>=dateKey(selectedWeekStart)&&ds<dateKey(addDays(selectedWeekStart,7));
    const clickValue=ds;
    return `<button class="coach-picker-day ${muted?'muted':''} ${ds===today()?'today':''} ${active?'active':''} ${weekActive?'week-active':''}" onclick="pickCoachOpsDate('${clickValue}')">${d.getDate()}</button>`;
  }).join('');
  pop.innerHTML=`<div class="coach-picker-head"><button class="coach-picker-move" onclick="moveCoachOpsPickerMonth(-1,event)">‹</button><div class="coach-picker-title">${base.getFullYear()} 年 ${base.getMonth()+1} 月</div><button class="coach-picker-move" onclick="moveCoachOpsPickerMonth(1,event)">›</button></div><div class="coach-picker-weekdays"><span>一</span><span>二</span><span>三</span><span>四</span><span>五</span><span>六</span><span>日</span></div><div class="coach-picker-grid">${days}</div>`;
}
function ensureCoachOpsDate(){
  const el=coachOpsDateInput();if(!el)return;
  if(!el.value){el.value=coachOpsInputValue(new Date(),coachOpsMode);el.dataset.coachOpsAutoDate='1';}
  updateCoachOpsDateButton();
}
function coachOpsModeDateForMode(mode){
  if(mode==='day')return new Date();
  if(mode==='week')return new Date();
  return coachOpsInputDate();
}
function resetCoachScheduleToToday(){
  if(!isCoachSchedulePage())return;
  const el=coachOpsDateInput();
  coachOpsMode='day';
  if(el){el.value=coachOpsInputValue(new Date(),'day');el.dataset.coachOpsAutoDate='1';}
  coachOpsAutoScrollDayView=true;
}
function prepareCoachSchedulePageOpen(){
  if(!isCoachSchedulePage())return;
  const el=coachOpsDateInput();
  if(!el||!el.value||el.dataset.coachOpsAutoDate==='1')resetCoachScheduleToToday();
}
function coachOpsHorizontalScrollContainer(){
  return document.querySelector('#page-coachschedule .coach-ops-scroll');
}
function syncCoachOpsHeaderScroll(){
  const hours=document.getElementById('coachOpsHours');
  if(!hours)return;
  const scroll=coachOpsHorizontalScrollContainer();
  const left=scroll?scroll.scrollLeft:0;
  hours.style.transform=`translateX(${-left}px)`;
}
function bindCoachOpsHeaderScroll(){
  const scroll=coachOpsHorizontalScrollContainer();
  if(!scroll){
    syncCoachOpsHeaderScroll();
    return;
  }
  if(scroll.dataset.coachOpsHeaderScrollBound!=='1'){
    scroll.addEventListener('scroll',syncCoachOpsHeaderScroll,{passive:true});
    scroll.dataset.coachOpsHeaderScrollBound='1';
  }
  syncCoachOpsHeaderScroll();
}
function preserveCoachOpsScrollLeft(){
  const scroll=coachOpsHorizontalScrollContainer();
  return scroll?scroll.scrollLeft:null;
}
function restoreCoachOpsScrollLeft(value){
  if(value===null||value===undefined)return;
  const scroll=coachOpsHorizontalScrollContainer();
  if(scroll)scroll.scrollLeft=value;
  syncCoachOpsHeaderScroll();
}
function coachOpsPageScrollContainer(){
  return document.querySelector('.content')||document.scrollingElement||document.documentElement;
}
function coachOpsScrollTopForElement(scroll,el,offset=0){
  if(!scroll||!el)return 0;
  const scrollRect=scroll.getBoundingClientRect?.();
  const elRect=el.getBoundingClientRect?.();
  if(scrollRect&&elRect)return scroll.scrollTop+elRect.top-scrollRect.top+offset;
  return (el.offsetTop||0)+offset;
}
function setCoachOpsMode(mode){
  const d=coachOpsDateInput();
  mode=['day','week','month'].includes(mode)?mode:'day';
  const base=coachOpsModeDateForMode(mode);
  coachOpsMode=mode;
  if(d)d.value=coachOpsInputValue(base,coachOpsMode);
  coachOpsAutoScrollDayView=coachOpsMode==='day';
  coachOpsAutoScrollWeekView=coachOpsMode==='week';
  closeCoachOpsPicker();
  renderCoachOps();
}
function setCoachOpsToday(){const el=coachOpsDateInput();if(el){el.value=coachOpsInputValue(new Date(),coachOpsMode);delete el.dataset.coachOpsAutoDate;}coachOpsAutoScrollDayView=coachOpsMode==='day';coachOpsAutoScrollWeekView=coachOpsMode==='week';renderCoachOps();}
function shiftCoachOpsDate(step){
  const el=coachOpsDateInput();if(!el)return;
  const mode=coachOpsMode;
  const base=coachOpsInputDate();
  if(mode==='month')el.value=coachOpsInputValue(addMonths(base,step),mode);
  else if(mode==='week')el.value=coachOpsInputValue(addDays(base,step*7),mode);
  else el.value=dateKey(addDays(base,step));
  delete el.dataset.coachOpsAutoDate;
  coachOpsAutoScrollWeekView=false;
  renderCoachOps();
}
function openCoachOpsDay(ds){coachOpsMode='day';const d=coachOpsDateInput();if(d){d.value=ds;delete d.dataset.coachOpsAutoDate;}coachOpsAutoScrollDayView=ds===today();renderCoachOps();}
function openCoachOpsMonthCreate(ds,event){
  if(event)event.stopPropagation();
  openCoachOpsCreateSchedule('',ds,'09:00','10:00');
}
function coachOpsQuickCreate(){
  openScheduleModal(null,{scheduleSource:'教练运营'});
}
function coachOpsCourseTypeTagClass(type){
  const normalized=normalizeCourseType(type);
  if(normalized==='体验课')return 'type-trial';
  if(normalized==='训练营')return 'type-camp';
  if(normalized==='大师课')return 'type-master';
  if(normalized==='小班课')return 'type-small';
  if(normalized==='陪打')return 'type-partner';
  return 'type-private';
}
function coachOpsLegendDotClass(type){
  return coachOpsCourseTypeTagClass(type).replace(/^type-/,'');
}
function coachOpsCourseTypeLegendHtml(){
  return PRODUCT_TYPES.map(type=>`<span class="coach-ops-legend-item"><i class="coach-ops-legend-dot ${coachOpsLegendDotClass(type)}"></i>${esc(type)}</span>`).join('');
}
function coachOpsSkeletonRows(count=8){
  return Array.from({length:count},(_,i)=>({name:'',rangeRows:[],skeleton:true,id:`skeleton-${i}`}));
}
function coachOpsDragIconHtml(){
  return '<span class="coach-ops-drag-handle"><svg viewBox="0 0 1024 1024" aria-hidden="true"><path d="M448 192a64 64 0 1 1-128 0 64 64 0 0 1 128 0zM384 576a64 64 0 1 0 0-128 64 64 0 0 0 0 128z m0 320a64 64 0 1 0 0-128 64 64 0 0 0 0 128zM704 192a64 64 0 1 1-128 0 64 64 0 0 1 128 0z m-64 384a64 64 0 1 0 0-128 64 64 0 0 0 0 128z m0 320a64 64 0 1 0 0-128 64 64 0 0 0 0 128z" fill="#262626"></path></svg></span>';
}
function openCoachOpsCreateSchedule(coach,date,startTime='09:00',endTime=''){
  const h=Math.min(22,parseInt(startTime.slice(0,2))||9),m=startTime.slice(3,5)||'00';
  const endValue=endTime||`${String(Math.min(23,h+1)).padStart(2,'0')}:${m}`;
  const selectedCoach=coachName(coach);
  const co=coaches.find(c=>coachName(c.name)===selectedCoach);
  openScheduleModal(null,{startTime:`${date} ${String(h).padStart(2,'0')}:${m}`,endTime:`${date} ${endValue}`,coach:selectedCoach,scheduleCoachLocked:!!selectedCoach,campus:campus==='all'?(co?.campus||''):campus,venue:'1号场',lessonCount:1,status:'已排课',scheduleSource:'教练运营'});
}
function coachOpsLooksLikeTechnicalStudentValue(value){
  const text=String(value||'').trim();
  return !text||text==='—'||/(seed-student|import-student|manual-student|private_lesson_csv_import|[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12})/i.test(text);
}
function coachOpsScheduleStudentTitle(s){
  const fromIds=parseArr(s?.studentIds).map(id=>students.find(st=>st.id===id)?.name||'').filter(name=>!coachOpsLooksLikeTechnicalStudentValue(name));
  if(fromIds.length>1)return `${fromIds[0]} 等 ${fromIds.length} 人`;
  if(fromIds.length)return fromIds[0];
  const fromNames=[...parseArr(s?.studentNames),scheduleStudentSummary(s),s?.studentName]
    .flatMap(value=>String(value||'').split(/[、,，/]+/))
    .map(value=>value.trim())
    .filter(name=>!coachOpsLooksLikeTechnicalStudentValue(name));
  const names=[...new Set(fromNames)];
  if(names.length>1)return `${names[0]} 等 ${names.length} 人`;
  if(names.length)return names[0];
  return classes.find(c=>c.id===s?.classId)?.className||'学员';
}
function coachOpsScheduleItemText(s){
  const start=String(s.startTime||'').slice(11,16);
  const end=s.endTime?String(s.endTime).slice(11,16):'';
  const fallback=scheduleStudentSummary(s);
  return `${start}${end?`-${end}`:''} ${coachOpsScheduleStudentTitle(s)||fallback||'—'}`;
}
function coachOpsCampusMatchesSchedule(s){
  if(campus==='all')return true;
  return sameCampusValue(s?.campus,campus);
}
function renderCoachOpsTopFilters(){
  const campusSource=typeof accessibleCampusRows==='function'?accessibleCampusRows():(Array.isArray(campuses)?campuses:[]);
  const campusOpts=[{value:'all',label:'全部校区'}].concat(campusSource.map(row=>({
    value:String(row?.code||row?.id||'').trim(),
    label:String(row?.name||row?.code||row?.id||'').trim()
  })).filter(opt=>opt.value&&opt.label));
  const campusMenu=campusOpts.map(opt=>`<div class="tms-dropdown-item ${campus===opt.value?'active':''}" data-value="${esc(opt.value)}" onclick="selectCoachOpsTopCampus(${jsArg(opt.value)},event)">${esc(opt.label)}</div>`).join('');
  const coachOpts=[{value:'',label:'全部教练'}].concat(coachOpsHomeCampusCoachNames().map(name=>({value:name,label:name})));
  const coachMenu=coachOpts.map(opt=>`<div class="tms-dropdown-item ${coachOpsSelectedCoach===opt.value?'active':''}" data-value="${esc(opt.value)}" onclick="selectCoachOpsCoachFilter(${jsArg(opt.value)},event)">${esc(opt.label)}</div>`).join('');
  const coachLabel=coachOpts.find(opt=>opt.value===coachOpsSelectedCoach)?.label||'全部教练';
  const coachIcon=typeof standardTopCoachIcon==='function'?standardTopCoachIcon():standardTopLocationIcon();
  return `<div class="court-top-filterbar"><div class="court-top-filter-item">${renderStandardTopDropdown('coachOpsTopCampus',campusOpts.find(opt=>opt.value===campus)?.label||'全部校区',standardTopLocationIcon(),campusMenu,'court-top-campus-menu')}</div><div class="court-top-filter-item">${renderStandardTopDropdown('coachOpsCoachFilter',coachLabel,coachIcon,coachMenu,'court-top-campus-menu')}</div></div>`;
}
function selectCoachOpsTopCampus(value,event){
  if(event)event.stopPropagation();
  campus=value||'all';
  localStorage.setItem(CAMPUS_KEY,campus);
  if(coachOpsSelectedCoach&&!coachOpsHomeCampusCoachNames().includes(coachOpsSelectedCoach)){
    coachOpsSelectedCoach='';
    localStorage.removeItem(COACH_OPS_COACH_FILTER_KEY);
  }
  refreshCoachOpsTopFilters();
  renderCoachOps();
  closeStandardTopDropdowns();
}
function selectCoachOpsCoachFilter(value,event){
  if(event)event.stopPropagation();
  coachOpsSelectedCoach=value||'';
  if(coachOpsSelectedCoach)localStorage.setItem(COACH_OPS_COACH_FILTER_KEY,coachOpsSelectedCoach);
  else localStorage.removeItem(COACH_OPS_COACH_FILTER_KEY);
  refreshCoachOpsTopFilters();
  renderCoachOps();
  closeStandardTopDropdowns();
}
function refreshCoachOpsTopFilters(){
  const host=document.getElementById('campusTabs');
  if(host&&(currentPage==='coachschedule'||currentPage==='coachops'))host.innerHTML=renderCoachOpsTopFilters();
}
function openCoachOpsDaySchedules(coach,date){
  const rows=billableSchedules()
    .filter(s=>coachOpsCampusMatchesSchedule(s)&&coachName(s.coach)===coachName(coach)&&String(s.startTime||'').slice(0,10)===date)
    .sort((a,b)=>String(a.startTime).localeCompare(String(b.startTime)));
  const body=rows.length
    ?`<div class="coach-ops-day-modal-list">${rows.map(s=>`<button type="button" class="coach-ops-day-modal-item" onclick="openScheduleDetail('${s.id}')"><span>${esc(coachOpsScheduleItemText(s))}</span><small>${esc(scheduleCourseTypeLabel(s))} · ${esc(scheduleLocationText(s))}</small></button>`).join('')}</div>`
    :'<div class="empty"><p>当天暂无排课</p></div>';
  openStandardModal({title:'当天排课',bodyHtml:body,actionsHtml:'<button class="tms-btn tms-btn-default" onclick="closeModal()">关闭</button>',extraClass:'modal-tight'});
}
function openCoachOpsMorePopover(el,coach,date,event){
  if(event)event.stopPropagation();
  document.querySelectorAll('.coach-ops-more-popover,.coach-ops-more-overlay').forEach(node=>node.remove());
  const coachKey=coachName(coach);
  const rows=billableSchedules()
    .filter(s=>coachOpsCampusMatchesSchedule(s)&&(!coachKey||coachName(s.coach)===coachKey)&&String(s.startTime||'').slice(0,10)===date)
    .sort((a,b)=>String(a.startTime).localeCompare(String(b.startTime)));
  const overlay=document.createElement('div');
  overlay.className='coach-ops-more-overlay';
  overlay.onclick=function(e){if(e)e.stopPropagation();document.querySelectorAll('.coach-ops-more-popover,.coach-ops-more-overlay').forEach(node=>node.remove());};
  const pop=document.createElement('div');
  pop.className='coach-ops-more-popover';
  const displayDate=String(date||'').replace(/^(\d{4})-(\d{2})-(\d{2})$/,(_,y,m,d)=>`${Number(m)}月${Number(d)}日`);
  pop.innerHTML=`<div class="coach-ops-more-head"><strong>${esc(displayDate)} 排课</strong><button type="button" onclick="event.stopPropagation();document.querySelectorAll('.coach-ops-more-popover,.coach-ops-more-overlay').forEach(node=>node.remove())">×</button></div><div class="coach-ops-more-list">${rows.map(s=>`<button type="button" class="coach-ops-more-course ${coachOpsCourseTypeTagClass(scheduleCourseType(s))}" onclick="event.stopPropagation();openScheduleDetail('${s.id}')"><span class="coach-ops-course-time">${String(s.startTime||'').slice(11,16)}${s.endTime?`-${String(s.endTime).slice(11,16)}`:''}</span><span class="coach-ops-course-name">${esc(coachOpsScheduleStudentTitle(s))}</span></button>`).join('')}</div>`;
  const cell=el.closest('.coach-ops-daycell')||el.parentElement;
  if(cell){
    cell.appendChild(overlay);
    cell.appendChild(pop);
    const scroll=cell.closest('.coach-ops-scroll');
    const cellRect=cell.getBoundingClientRect();
    const scrollRect=scroll?.getBoundingClientRect?.();
    if(scrollRect&&cellRect.right+96>scrollRect.right){
      pop.classList.add('is-edge-right');
    }else if(scrollRect&&cellRect.left-96<scrollRect.left){
      pop.classList.add('is-edge-left');
    }
  }
}
function coachOpsMonthDayRows(renderRows,date){
  return (renderRows||[]).flatMap(row=>(row.rangeRows||[]).filter(s=>String(s.startTime||'').slice(0,10)===date));
}
function coachOpsMonthCoachSummaries(dayRows){
  const grouped=new Map();
  (dayRows||[]).forEach(s=>{
    const name=coachName(s.coach)||'未命名教练';
    if(!grouped.has(name))grouped.set(name,[]);
    grouped.get(name).push(s);
  });
  return [...grouped.entries()].map(([name,rows])=>({
    name,
    rows:rows.sort((a,b)=>String(a.startTime).localeCompare(String(b.startTime))),
    lessonUnits:sumScheduleLessonUnits(rows)
  })).sort((a,b)=>b.lessonUnits-a.lessonUnits||b.rows.length-a.rows.length||a.name.localeCompare(b.name,'zh-Hans-CN'));
}
function coachOpsMonthCoachPreviewHtml(item,date){
  const rows=item.rows.slice(0,6);
  const hidden=item.rows.length-rows.length;
  return `<span class="coach-ops-month-preview"><b>${esc(String(date||'').slice(5).replace('-','/'))} · ${esc(item.name)}</b>${rows.map(s=>`<span>${String(s.startTime||'').slice(11,16)}${s.endTime?`-${String(s.endTime).slice(11,16)}`:''} ${esc(coachOpsScheduleStudentTitle(s))} ${esc(scheduleLocationText(s))}</span>`).join('')}${hidden>0?`<em>还有 ${hidden} 节</em>`:''}</span>`;
}
function renderCoachOpsMonthOverview(renderRows,range,todayKey){
  const gridStart=weekStart(range.start),gridEnd=addDays(weekStart(range.end),7);
  const days=[];
  for(let d=new Date(gridStart);d<gridEnd;d=addDays(d,1))days.push(new Date(d));
  const cells=days.map(d=>{
    const ds=dateKey(d);
    const dayRows=coachOpsMonthDayRows(renderRows,ds).sort((a,b)=>String(a.startTime).localeCompare(String(b.startTime)));
    const summaries=coachOpsMonthCoachSummaries(dayRows);
    const visible=summaries.slice(0,COACH_OPS_MONTH_VISIBLE_COACHES);
    const hiddenCount=Math.max(0,summaries.length-visible.length);
    const lessonCount=lessonUnitsText(sumScheduleLessonUnits(dayRows));
    const coachList=visible.length?`<div class="coach-ops-daycell-list coach-ops-month-coach-list">${visible.map(item=>`<div class="coach-ops-month-coach-row" onclick="event.stopPropagation()"><span class="coach-ops-month-coach-name">${esc(item.name)}</span><span class="coach-ops-month-coach-count">${lessonUnitsText(item.lessonUnits)}节</span>${coachOpsMonthCoachPreviewHtml(item,ds)}</div>`).join('')}${hiddenCount?`<button type="button" class="coach-ops-more-btn" onclick="openCoachOpsMorePopover(this,'','${ds}',event)">+${hiddenCount} 更多</button>`:''}</div>`:'<div class="coach-ops-daycell-empty">暂无课</div>';
    return `<div class="coach-ops-daycell month-cell ${ds===todayKey?'is-today':''} ${dayRows.length?'has-course':''} ${d.getMonth()!==range.start.getMonth()?'is-muted':''}" onclick="openCoachOpsMonthCreate('${ds}',event)"><div class="coach-ops-daycell-head"><strong>${d.getMonth()+1}/${d.getDate()}</strong>${dayRows.length?`<span class="coach-ops-daycell-count">共 ${lessonCount} 节</span>`:''}</div>${coachList}</div>`;
  }).join('');
  return `<div class="coach-ops-month-overview"><div class="coach-ops-month-overview-grid">${cells}</div></div>`;
}
function openCoachOpsLineCreate(e,coach,date){
  if(e.target.closest('.coach-ops-block'))return;
  const slot=coachOpsCreateSlotFromLineClick(e,date,coach);
  coachOpsPendingCreateSlot=slot;
  renderCoachOps();
  openCoachOpsCreateSchedule(coach,date,slot.startTime,slot.endTime);
}
function clearCoachOpsPendingCreateSlot(){
  if(!coachOpsPendingCreateSlot)return;
  coachOpsPendingCreateSlot=null;
  if(currentPage==='coachschedule')renderCoachOps();
}
function coachOpsCreateSlotFromLineClick(e,date,coach){
  const startTime=coachOpsStartTimeFromLineClick(e);
  const startMin=coachOpsTimeTextToMinutes(startTime);
  const endMin=Math.min(23*60,startMin+(startTime.endsWith(':00')?120:60));
  return {coach:coachName(coach),date,startTime,endTime:coachOpsMinutesToTimeText(endMin)};
}
function coachOpsTimeTextToMinutes(value){
  const [h,m]=String(value||'09:00').split(':').map(v=>parseInt(v,10)||0);
  return h*60+m;
}
function coachOpsMinutesToTimeText(total){
  const h=Math.floor(total/60),m=total%60;
  return `${String(h).padStart(2,'0')}:${String(m).padStart(2,'0')}`;
}
function coachOpsStartTimeFromLineClick(e){
  const rect=e.currentTarget.getBoundingClientRect();
  const cellHeight=e.currentTarget.closest('.coach-ops-week-experiment')?COACH_OPS_WEEK_HOUR_HEIGHT:COACH_OPS_DAY_HOUR_HEIGHT,startHour=7,endHour=22;
  const y=Math.max(0,Math.min(rect.height-1,e.clientY-rect.top));
  const hourIndex=Math.floor(y/cellHeight);
  const hour=Math.min(endHour,startHour+hourIndex);
  const minute=hour>=endHour?0:(y%cellHeight>=cellHeight/2?30:0);
  return `${String(hour).padStart(2,'0')}:${String(minute).padStart(2,'0')}`;
}
function coachOpsDayTimeLabelTop(index,totalHours){
  return Math.max(0,Math.min(index*COACH_OPS_DAY_HOUR_HEIGHT,totalHours*COACH_OPS_DAY_HOUR_HEIGHT-16));
}
function coachOpsWeekTimeLabelTop(index,totalHours){
  return Math.max(0,Math.min(index*COACH_OPS_WEEK_HOUR_HEIGHT,totalHours*COACH_OPS_WEEK_HOUR_HEIGHT-16));
}
function coachOpsRowDisplayName(row){
  return coachName(row?.name||row?.coach||row?.coachName||row?.displayName||'');
}
function coachOpsDragStart(e,coach){
  coachOpsDraggedName=coachName(coach);
  if(e.dataTransfer){
    e.dataTransfer.effectAllowed='move';
    e.dataTransfer.setData('text/plain',coachOpsDraggedName);
  }
}
function coachOpsDragOver(e){
  e.preventDefault();
  if(e.dataTransfer)e.dataTransfer.dropEffect='move';
}
function coachOpsDrop(e,targetCoach){
  e.preventDefault();
  const source=coachOpsDraggedName||e.dataTransfer?.getData('text/plain')||'';
  const target=coachName(targetCoach);
  coachOpsDraggedName='';
  if(!source||!target||source===target)return;
  const order=coachOpsRows().map(row=>row.name);
  const from=order.indexOf(source),to=order.indexOf(target);
  if(from<0||to<0)return;
  order.splice(to,0,order.splice(from,1)[0]);
  saveCoachOpsOrder(order);
}
function renderCoachOpsWeekTimeline(renderRows,range,opsStartH,opsEndH,opsTotalMin,todayKey){
  const weekDays=Array.from({length:7},(_,i)=>addDays(range.start,i));
  const dayHeight=opsTotalMin/60*COACH_OPS_WEEK_HOUR_HEIGHT;
  const nowForWeek=new Date();
  const nowMinutes=(nowForWeek.getHours()-opsStartH)*60+nowForWeek.getMinutes()+nowForWeek.getSeconds()/60;
  const showNowLine=nowMinutes>=0&&nowMinutes<=opsTotalMin;
  const nowLineTop=showNowLine?nowMinutes/60*COACH_OPS_WEEK_HOUR_HEIGHT:0;
  const nowLineHtml=showNowLine?`<span class="coach-ops-week-now-line" style="top:${nowLineTop}px"></span><div class="coach-ops-week-now-head" style="top:${nowLineTop}px"><i>${String(nowForWeek.getHours()).padStart(2,'0')}:${String(nowForWeek.getMinutes()).padStart(2,'0')}</i><b></b></div>`:'';
  const timeAxis=Array.from({length:opsEndH-opsStartH+1},(_,i)=>{
    const top=coachOpsWeekTimeLabelTop(i,opsEndH-opsStartH);
    return `<span class="coach-ops-week-time-label" style="top:${top}px">${i+opsStartH}:00</span>`;
  }).join('');
  return `<div class="coach-ops-week-experiment">${weekDays.map((day,i)=>{
    const ds=dateKey(day);
    const dayName=`周${'一二三四五六日'[i]}`;
    const base=new Date(day);base.setHours(opsStartH,0,0,0);
    const columns=renderRows.map(row=>{
      const coachLabel=coachOpsRowDisplayName(row);
      const pending=coachOpsPendingCreateSlot&&coachOpsPendingCreateSlot.date===ds&&coachName(coachOpsPendingCreateSlot.coach)===coachName(coachLabel)?coachOpsPendingCreateSlot:null;
      const pendingBlock=pending?(()=>{
        const startMin=coachOpsTimeTextToMinutes(pending.startTime)-opsStartH*60;
        const endMin=coachOpsTimeTextToMinutes(pending.endTime)-opsStartH*60;
        const top=Math.max(0,startMin/60*COACH_OPS_WEEK_HOUR_HEIGHT);
        const height=Math.max(18,(Math.min(opsTotalMin,endMin)-Math.max(0,startMin))/60*COACH_OPS_WEEK_HOUR_HEIGHT);
        return `<span class="coach-ops-create-preview" style="top:${top}px;height:${height}px"></span>`;
      })():'';
      const blocks=row.rangeRows.filter(s=>String(s.startTime||'').slice(0,10)===ds).sort((a,b)=>String(a.startTime).localeCompare(String(b.startTime))).map(s=>{
        const startMin=(dateMs(s.startTime)-base.getTime())/60000;
        const endMs=Number.isFinite(dateMs(s.endTime))?dateMs(s.endTime):dateMs(s.startTime)+60*60000;
        const endMin=(endMs-base.getTime())/60000;
        const top=Math.max(0,startMin/60*COACH_OPS_WEEK_HOUR_HEIGHT);
        const height=Math.max(28,(Math.min(opsTotalMin,endMin)-Math.max(0,startMin))/60*COACH_OPS_WEEK_HOUR_HEIGHT-4);
        return `<div class="coach-ops-week-block ${coachOpsCourseTypeTagClass(scheduleCourseType(s))}" style="top:${top+2}px;height:${height}px" onclick="event.stopPropagation();openScheduleDetail('${s.id}')"><div class="coach-ops-student"><span class="coach-ops-card-dot"></span>${esc(coachOpsScheduleStudentTitle(s))}</div><div class="coach-ops-location">${esc(scheduleLocationText(s))}</div></div>`;
      }).join('');
      return `<div class="coach-ops-week-coach-col" style="height:${dayHeight}px" onclick="openCoachOpsLineCreate(event,${jsArg(coachLabel)},'${ds}')">${pendingBlock}${blocks}</div>`;
    }).join('');
    return `<section class="coach-ops-week-day ${ds===todayKey?'is-today':''}"><div class="coach-ops-week-day-label"><div class="coach-ops-week-day-label-fixed"><strong>${dayName}</strong><span>${day.getMonth()+1}/${day.getDate()}</span></div><div class="coach-ops-week-day-label-track"></div></div><div class="coach-ops-week-day-board"><div class="coach-ops-week-time-axis" style="height:${dayHeight}px">${timeAxis}</div><div class="coach-ops-week-coach-grid" style="height:${dayHeight}px">${columns}</div>${ds===todayKey?nowLineHtml:''}</div></section>`;
  }).join('')}</div>`;
}
function scrollCoachOpsDayToNow(){
  if(!isCoachSchedulePage()||coachOpsMode!=='day')return;
  const range=rangeBounds('day');
  if(dateKey(range.start)!==today())return;
  const scroll=coachOpsPageScrollContainer();
  const board=document.querySelector('#page-coachschedule .coach-ops-day-board');
  if(!scroll||!board)return;
  const now=new Date();
  const nowLineTop=((now.getHours()-7)*60+now.getMinutes()+now.getSeconds()/60)/60*COACH_OPS_DAY_HOUR_HEIGHT;
  scroll.scrollTop=Math.max(0,coachOpsScrollTopForElement(scroll,board,nowLineTop-180));
}
function scrollCoachOpsWeekToNow(){
  if(!isCoachSchedulePage()||coachOpsMode!=='week')return;
  const range=rangeBounds('week'),todayKey=today();
  if(todayKey<dateKey(range.start)||todayKey>=dateKey(range.end))return;
  const scroll=coachOpsPageScrollContainer();
  const todaySection=document.querySelector('#page-coachschedule .coach-ops-week-day.is-today');
  if(!scroll||!todaySection)return;
  const now=new Date();
  const nowMin=Math.max(0,Math.min((22-7)*60,(now.getHours()-7)*60+now.getMinutes()+now.getSeconds()/60));
  const nowLineTop=nowMin/60*COACH_OPS_WEEK_HOUR_HEIGHT;
  scroll.scrollTop=Math.max(0,coachOpsScrollTopForElement(scroll,todaySection,30+nowLineTop-180));
}
function syncCoachOpsUnifiedOrder(order){
  const sortMap=new Map((order||[]).map((name,index)=>[coachName(name),(index+1)*10]));
  coachOpsUnifiedView={
    ...(coachOpsUnifiedView||{}),
    rows:(coachOpsUnifiedView?.rows||[]).map(row=>{
      const sortOrder=sortMap.get(coachName(row.name));
      return sortOrder?{...row,sortOrder}:row;
    })
  };
}
async function saveCoachOpsOrder(order){
  const byName=new Map(coaches.map(coach=>[coachName(coach.name),coach]));
  const updates=[];
  order.forEach((name,index)=>{
    const coach=byName.get(coachName(name));
    if(!coach)return;
    const sortOrder=(index+1)*10;
    if(Number(coach.sortOrder)!==sortOrder){
      coach.sortOrder=sortOrder;
      updates.push(coach);
    }
  });
  try{
    if(updates.length)await Promise.all(updates.map(coach=>apiCall('PUT','/coaches/'+coach.id,{...coach,sortOrder:coach.sortOrder})));
    saveCoachOpsStoredOrder(order);
    syncCoachOpsUnifiedOrder(order);
    renderCoachOps();
    toast('教练排序已保存','success');
  }catch(err){
    toast('保存教练排序失败：'+err.message,'error');
    loadData(false).then(()=>(currentPage==='coachschedule'||currentPage==='coachops')&&renderCoachOps()).catch(()=>null);
  }
}
function operationsCoachTrialConversionText(coach){
  const coachKey=coachName(coach);
  const standardRow=(operationsPageData?.coach?.rows||[]).find(row=>coachName(row?.coach||row?.name)===coachKey)||{};
  const total=Number(standardRow.trialBase)||0;
  if(!total)return '-%';
  const converted=Number(standardRow.trialConverted)||0;
  const percent=Number(standardRow.trialConversionRate);
  if(!Number.isFinite(percent))return `${converted}/${total} <span class="coach-workload-rate">-%</span>`;
  const rate=Number.isInteger(percent)?percent:percent.toFixed(1);
  return `${converted}/${total} <span class="coach-workload-rate ${converted>=total?'up':converted>0?'up':'down'}">${rate}%</span>`;
}
function coachCourseTypeDistributionText(row){
  return row?.courseTypeDistributionText||'-';
}
function coachOpsHomeCampusCoachNames(){
  if(campus==='all')return activeCoachNames();
  return [...new Set(coaches.filter(c=>c.status==='active'&&sameCampusValue(c.campus,campus)).map(c=>coachName(c.name)).filter(Boolean))];
}
function coachOpsComparisonText(row){
  return row?.comparisonText||'';
}
function coachOpsSummaryForRange(row,range){
  const scope=campus==='all'?'all':'byCampus';
  const campusName=campus==='all'?'':cn(campus);
  const source=scope==='all'?row?.summaries?.all:row?.summaries?.byCampus?.[campusName];
  const bucket=coachOpsMode==='day'?'day':coachOpsMode==='month'?'month':'week';
  const key=coachOpsMode==='day'?dateKey(range.start):coachOpsMode==='month'?String(range.label||'').slice(0,7):dateKey(range.start);
  return source?.[bucket]?.[key]||{};
}
function coachOpsRows(){
  const range=rangeBounds(coachOpsMode);
  return (coachOpsUnifiedView?.rows||[])
    .filter(row=>!coachOpsSelectedCoach||coachOpsRowDisplayName(row)===coachName(coachOpsSelectedCoach))
    .map(row=>{
      const rangeRows=(row.rows||[]).filter(s=>coachOpsCampusMatchesSchedule(s)&&inRange(s.startTime,range.start,range.end));
      const summary=coachOpsSummaryForRange(row,range);
      return {
        ...row,
        rangeRows,
        mainCampus:summary.mainCampus||row.mainCampus||'',
        totalLessonUnits:Number(summary.totalLessonUnits)||0,
        feedback:Number(summary.feedbackCount)||0,
        pending:Number(summary.pending)||0,
        conflicts:Number(summary.conflictCount)||0,
        courseTypeDistributionText:summary.courseTypeDistributionText||'-',
        campusDistributionText:summary.campusDistributionText||'-',
        timeBandDistributionText:summary.timeBandDistributionText||'-'
      };
    })
    .filter(row=>campus==='all'||row.rangeRows.length||coachOpsHomeCampusCoachNames().includes(coachOpsRowDisplayName(row)))
    .sort((a,b)=>(Number(a.sortOrder)||coachSortValue(coachOpsRowDisplayName(a)))-(Number(b.sortOrder)||coachSortValue(coachOpsRowDisplayName(b)))||coachOpsRowDisplayName(a).localeCompare(coachOpsRowDisplayName(b),'zh-Hans-CN'));
}
function renderCoachOpsRangeFilter(){
  const host=document.getElementById(isCoachWorkloadPage()?'coachOpsWorkloadRangeHost':'coachOpsRangeHost');
  if(!host)return;
  const dropdownId=isCoachWorkloadPage()?'coachOpsWorkloadRange':'coachOpsRange';
  if(isCoachSchedulePage()){
    host.innerHTML=`<div class="coach-ops-mode-segment">${[
      ['day','日视图'],
      ['week','周视图'],
      ['month','月视图']
    ].map(([value,label])=>`<button type="button" class="coach-ops-mode-btn ${coachOpsMode===value?'active':''}" onclick="setCoachOpsMode('${value}')">${label}</button>`).join('')}</div>`;
    return '';
  }
  host.innerHTML=renderStandardDropdownHtml(dropdownId,'日视图',[
    {value:'day',label:'日视图'},
    {value:'week',label:'周视图'},
    {value:'month',label:'月视图'}
  ],coachOpsMode,false,'setCoachOpsMode');
  return dropdownId;
}
function renderCoachOpsWorkloadHeader(){
  const thead=document.querySelector('#page-coachops .tms-table thead');
  if(!thead)return;
  thead.innerHTML='<tr><th class="tms-sticky-l" style="width:120px;padding-left:20px">教练</th><th style="width:150px">当前筛选课数</th><th style="width:130px">体验课转化率</th><th style="width:220px">课程类型分布</th><th style="width:90px">已反馈</th><th style="width:90px">未反馈</th><th style="width:180px">校区分布</th><th style="width:140px">时间段</th></tr>';
}
function renderCoachOpsWorkloadMobileCards(rows){
  const host=document.getElementById('coachOpsMobileCards');
  if(!host)return;
  if(!rows.length){
    host.innerHTML='<div class="tms-empty-state"><div class="tms-empty-title">当前筛选无教练数据</div></div>';
    return;
  }
  host.innerHTML=rows.map((r,index)=>`<div class="coach-ops-workload-card">
    <div class="coach-ops-workload-card-head"><span>NO.${index+1}</span><strong>${esc(r.name)}</strong></div>
    <div class="coach-ops-workload-card-main">
      <div><span>当前课数</span><strong>${lessonUnitsText(r.totalLessonUnits)}<em>节</em></strong>${coachOpsComparisonText(r)}</div>
      <div><span>体验转化</span>${operationsCoachTrialConversionText(r.name)}</div>
    </div>
    <div class="coach-ops-workload-card-grid">
      <span><b>已反馈</b><strong>${fmt(r.feedback)}</strong></span>
      <span><b>未反馈</b><strong>${fmt(r.pending)}</strong></span>
    </div>
    <div class="coach-ops-workload-card-line"><b>课程类型</b><span>${esc(r.courseTypeDistributionText)}</span></div>
    <div class="coach-ops-workload-card-line"><b>校区分布</b><span>${esc(r.campusDistributionText)}</span></div>
    <div class="coach-ops-workload-card-line"><b>时间段</b><span>${esc(r.timeBandDistributionText)}</span></div>
  </div>`).join('');
}
function isCoachOpsMobileSchedule(){
  return currentPage==='coachschedule'&&document.body&&document.body.classList.contains('admin-mobile');
}
function coachOpsMobileDateText(value,mode){
  const day=String(value||'').slice(0,10);
  if(!day||mode==='day')return '';
  const d=new Date(`${day}T00:00:00`);
  if(Number.isNaN(d.getTime()))return day;
  const weekday=['周日','周一','周二','周三','周四','周五','周六'][d.getDay()]||'';
  return `${d.getMonth()+1}/${d.getDate()} ${weekday}`;
}
function renderCoachOpsMobileTimeline(rows,mode,range){
  const createDate=dateKey(range.start);
  return (rows||[]).map(r=>{
    if(r.skeleton){
      return `<div class="coach-ops-row coach-ops-mobile-row coach-ops-skeleton-row"><div class="coach-ops-name"><span class="coach-ops-skeleton-dot"></span><span></span></div><div class="coach-ops-mobile-list"><div class="coach-ops-mobile-skeleton-card"></div><div class="coach-ops-mobile-skeleton-card short"></div></div></div>`;
    }
    const schedules=[...(r.rangeRows||[])].sort((a,b)=>String(a.startTime).localeCompare(String(b.startTime)));
    const list=schedules.length?schedules.map(s=>{
      const dateText=coachOpsMobileDateText(s.startTime,mode);
      const timeText=`${String(s.startTime||'').slice(11,16)}${s.endTime?`-${String(s.endTime).slice(11,16)}`:''}`;
      return `<button type="button" class="coach-ops-mobile-card ${coachOpsCourseTypeTagClass(scheduleCourseType(s))}" onclick="openScheduleDetail('${s.id}')">
        <span class="coach-ops-mobile-card-time">${dateText?`${esc(dateText)} · `:''}${esc(timeText)}</span>
        <strong>${esc(coachOpsScheduleStudentTitle(s))}</strong>
        <small>${esc(scheduleCourseTypeLabel(s))} · ${esc(scheduleLocationText(s))}</small>
      </button>`;
    }).join(''):`<button type="button" class="coach-ops-mobile-empty-card" onclick="openCoachOpsCreateSchedule(${jsArg(r.name)},'${createDate}')">暂无课程，点击新排课</button>`;
    return `<div class="coach-ops-row coach-ops-mobile-row"><div class="coach-ops-name"><span>${esc(r.name)}</span></div><div class="coach-ops-mobile-list">${list}</div></div>`;
  }).join('');
}
function renderCoachOps(){
  const previousScrollLeft=preserveCoachOpsScrollLeft();
  ensureCoachOpsReportDateControls();
  const rangeDropdownId=renderCoachOpsRangeFilter();
  renderCoachOpsWorkloadHeader();
  ensureCoachOpsDate();
  updateCoachOpsPageChrome();
  const mode=coachOpsMode;
  if(rangeDropdownId)setStandardDropdownValue(rangeDropdownId,mode,mode==='day'?'日视图':mode==='week'?'周视图':'月视图');
  const range=rangeBounds(mode);
  const todayKey=today();
  const nowForGrid=new Date();
  const dayIsToday=mode==='day'&&dateKey(range.start)===todayKey;
  const nowMinutes=(nowForGrid.getHours()-7)*60+nowForGrid.getMinutes()+nowForGrid.getSeconds()/60;
  const showNowLine=dayIsToday&&nowMinutes>=0&&nowMinutes<=(22-7)*60;
  const nowLineTop=showNowLine?nowMinutes/60*COACH_OPS_DAY_HOUR_HEIGHT:0;
  const nowLineHtml=showNowLine?`<span class="coach-ops-now-line" style="top:${nowLineTop}px"></span>`:'';
  const nowHeadHtml=showNowLine?`<div class="coach-ops-now-head" style="top:${nowLineTop}px"><i>${String(nowForGrid.getHours()).padStart(2,'0')}:${String(nowForGrid.getMinutes()).padStart(2,'0')}</i><b></b></div>`:'';
  const gridCard=document.querySelector('#page-coachschedule .coach-ops-grid-card');
  const rows=coachOpsRows();
  if(gridCard){
    gridCard.classList.toggle('mode-day',mode==='day');
    gridCard.classList.toggle('mode-week',mode==='week');
    gridCard.classList.toggle('mode-month',mode==='month');
    const dayCoachCount=Math.max(1,rows.length);
    gridCard.style.setProperty('--coach-ops-day-coach-count',String(dayCoachCount));
    gridCard.style.setProperty('--coach-ops-day-grid-width',`${dayCoachCount*COACH_OPS_DAY_COACH_WIDTH}px`);
    gridCard.style.setProperty('--coach-ops-week-grid-width',`${dayCoachCount*COACH_OPS_DAY_COACH_WIDTH}px`);
  }
  const hourHost=document.getElementById('coachOpsHours');
  const opsStartH=7,opsEndH=22,opsTotalMin=(opsEndH-opsStartH)*60;
  if(hourHost){
    hourHost.classList.toggle('week',mode==='week'||mode==='month');
    hourHost.classList.toggle('day-coaches',mode==='day');
    hourHost.style.setProperty('--coach-ops-day-coach-count',String(Math.max(1,rows.length)));
    hourHost.style.setProperty('--coach-ops-day-grid-width',`${Math.max(1,rows.length)*COACH_OPS_DAY_COACH_WIDTH}px`);
    hourHost.style.setProperty('--coach-ops-week-grid-width',`${Math.max(1,rows.length)*COACH_OPS_DAY_COACH_WIDTH}px`);
    hourHost.innerHTML=mode==='day'||mode==='week'
      ?rows.map(r=>{
        const name=coachOpsRowDisplayName(r);
        const dragAttrs=`draggable="true" ondragstart="coachOpsDragStart(event,${jsArg(name)})" ondragover="coachOpsDragOver(event)" ondrop="coachOpsDrop(event,${jsArg(name)})"`;
        return `<span class="${mode==='day'?'coach-ops-day-coach-head':'coach-ops-week-coach-head'}" ${dragAttrs}><b>${esc(name||'未命名教练')}</b></span>`;
      }).join('')
      :['周一','周二','周三','周四','周五','周六','周日'].map((d,i)=>{
          const currentMonthHasToday=todayKey>=dateKey(range.start)&&todayKey<dateKey(range.end);
          const todayDate=new Date(`${todayKey}T00:00:00`);
          const todayWeekIndex=(todayDate.getDay()+6)%7;
          return `<span class="${currentMonthHasToday&&i===todayWeekIndex?'is-today':''}">${d}</span>`;
        }).join('');
  }
  const title=document.getElementById('coachOpsViewTitle');
  if(title)title.textContent=mode==='day'?`${range.label} 教练排课（7:00-22:00）`:mode==='week'?`${dateKey(range.start)} 至 ${dateKey(addDays(range.end,-1))} 教练周视图`:`${range.label} 教练月视图`;
  const gridClock=document.getElementById('coachOpsGridClock');
  if(gridClock){
    const now=new Date();
    const dayText=['周日','周一','周二','周三','周四','周五','周六'][now.getDay()];
    gridClock.textContent=`● ${now.getMonth()+1}/${now.getDate()} ${dayText} ${String(now.getHours()).padStart(2,'0')}:${String(now.getMinutes()).padStart(2,'0')}:${String(now.getSeconds()).padStart(2,'0')}`;
  }
  if(gridCard){
    gridCard.classList.toggle('is-compact',rows.length>0&&rows.length<=3);
    gridCard.classList.remove('is-loading');
  }
  const corner=document.querySelector('#page-coachschedule .coach-ops-corner');
  if(corner)corner.textContent=mode==='day'?'时间':mode==='week'?'日期/时间':'日期';
  const host=document.getElementById('coachOpsTimeline');
  if(host){
    const renderRows=rows;
    host.classList.toggle('is-skeleton',false);
    if(!renderRows.length){
      const emptyText=campus==='all'?'当前日期暂无教练排课':'当前筛选无教练排课';
      host.innerHTML=`<div class="coach-ops-empty-state"><strong>${emptyText}</strong><span>不是加载中，可切换校区或日期查看</span></div>`;
    }else if(mode==='month'){
      host.innerHTML=renderCoachOpsMonthOverview(renderRows,range,todayKey);
    }else if(isCoachOpsMobileSchedule()){
      host.innerHTML=renderCoachOpsMobileTimeline(renderRows,mode,range);
    }else if(mode==='day'){
      const base=new Date(range.start);base.setHours(opsStartH,0,0,0);
      const dayHeight=opsTotalMin/60*COACH_OPS_DAY_HOUR_HEIGHT;
      const timeAxis=Array.from({length:opsEndH-opsStartH+1},(_,i)=>{
        const top=coachOpsDayTimeLabelTop(i,opsEndH-opsStartH);
        return `<span class="coach-ops-day-time-label" style="top:${top}px">${i+opsStartH}:00</span>`;
      }).join('');
      const columns=renderRows.map(row=>{
        const coachLabel=coachOpsRowDisplayName(row);
        const pending=coachOpsPendingCreateSlot&&coachOpsPendingCreateSlot.date===dateKey(range.start)&&coachName(coachOpsPendingCreateSlot.coach)===coachName(coachLabel)?coachOpsPendingCreateSlot:null;
        const pendingBlock=pending?(()=>{
          const startMin=coachOpsTimeTextToMinutes(pending.startTime)-opsStartH*60;
          const endMin=coachOpsTimeTextToMinutes(pending.endTime)-opsStartH*60;
          const top=Math.max(0,startMin/60*COACH_OPS_DAY_HOUR_HEIGHT);
          const height=Math.max(18,(Math.min(opsTotalMin,endMin)-Math.max(0,startMin))/60*COACH_OPS_DAY_HOUR_HEIGHT);
          return `<span class="coach-ops-create-preview" style="top:${top}px;height:${height}px"></span>`;
        })():'';
        const blocks=row.rangeRows.sort((a,b)=>String(a.startTime).localeCompare(String(b.startTime))).map(s=>{
          const startMin=(dateMs(s.startTime)-base.getTime())/60000;
          const endMs=Number.isFinite(dateMs(s.endTime))?dateMs(s.endTime):dateMs(s.startTime)+60*60000;
          const endMin=(endMs-base.getTime())/60000;
          const top=Math.max(0,startMin/60*COACH_OPS_DAY_HOUR_HEIGHT);
          const height=Math.max(34,(Math.min(opsTotalMin,endMin)-Math.max(0,startMin))/60*COACH_OPS_DAY_HOUR_HEIGHT-4);
          return `<div class="coach-ops-block ${coachOpsCourseTypeTagClass(scheduleCourseType(s))}" style="top:${top+2}px;height:${height}px" onclick="event.stopPropagation();openScheduleDetail('${s.id}')"><div class="coach-ops-time"><span class="coach-ops-card-dot"></span>${s.startTime.slice(11,16)}${s.endTime?' - '+s.endTime.slice(11,16):''}</div><div class="coach-ops-student">${esc(coachOpsScheduleStudentTitle(s))}</div><div class="coach-ops-location">${esc(scheduleLocationText(s))}</div></div>`;
        }).join('');
        return `<div class="coach-ops-day-coach-col ${dayIsToday?'is-today':''}" style="height:${dayHeight}px" onclick="openCoachOpsLineCreate(event,${jsArg(coachLabel)},'${dateKey(range.start)}')">${pendingBlock}${blocks||'<span class="coach-ops-empty">当日暂无课程</span>'}</div>`;
      }).join('');
      host.innerHTML=`<div class="coach-ops-day-board"><div class="coach-ops-day-time-axis" style="height:${dayHeight}px">${timeAxis}</div><div class="coach-ops-day-coach-grid" style="height:${dayHeight}px">${columns}</div>${nowLineHtml}${nowHeadHtml}</div>`;
    }else if(mode==='week'){
      host.innerHTML=renderCoachOpsWeekTimeline(renderRows,range,opsStartH,opsEndH,opsTotalMin,todayKey);
    }else{
      host.innerHTML=renderRows.map(r=>{
      const dragAttrs=`draggable="true" ondragstart="coachOpsDragStart(event,${jsArg(r.name)})" ondragover="coachOpsDragOver(event)" ondrop="coachOpsDrop(event,${jsArg(r.name)})"`;
      if(r.skeleton){
        const cells=mode==='day'
          ?`<div class="coach-ops-line coach-ops-skeleton-line"><span></span><span></span></div>`
          :`<div class="coach-ops-period-line ${mode==='week'?'coach-ops-week':'coach-ops-month'}">${Array.from({length:7},(_,i)=>`<div class="coach-ops-daycell skeleton-cell"><span></span>${i<3?'<i></i>':''}</div>`).join('')}</div>`;
        return `<div class="coach-ops-row coach-ops-skeleton-row"><div class="coach-ops-name"><span class="coach-ops-skeleton-dot"></span><span></span></div>${cells}</div>`;
      }
      const days=[];
      const gridStart=mode==='month'?weekStart(range.start):range.start;
      const gridEnd=mode==='month'?addDays(weekStart(range.end),7):range.end;
      for(let d=new Date(gridStart);d<gridEnd;d=addDays(d,1))days.push(new Date(d));
      const cells=days.map(d=>{
        const ds=dateKey(d);
        const dayRows=r.rangeRows.filter(s=>s.startTime.slice(0,10)===ds).sort((a,b)=>String(a.startTime).localeCompare(String(b.startTime)));
        const lessonCount=lessonUnitsText(sumScheduleLessonUnits(dayRows));
        const visibleRows=mode==='week'?dayRows:dayRows.slice(0,3);
        const hiddenCount=mode==='month'?Math.max(0,dayRows.length-visibleRows.length):0;
        const list=dayRows.length?`<div class="coach-ops-daycell-list">${visibleRows.map(s=>`<button type="button" class="coach-ops-course-card ${coachOpsCourseTypeTagClass(scheduleCourseType(s))}" onclick="event.stopPropagation();openScheduleDetail('${s.id}')"><span class="coach-ops-course-time">${String(s.startTime||'').slice(11,16)}${s.endTime?`-${String(s.endTime).slice(11,16)}`:''}</span><span class="coach-ops-course-name">${esc(coachOpsScheduleStudentTitle(s))}</span></button>`).join('')}${hiddenCount?`<button type="button" class="coach-ops-more-btn" onclick="openCoachOpsMorePopover(this,${jsArg(r.name)},'${ds}',event)">+${hiddenCount} 更多</button>`:''}</div>`:'';
        const head=mode==='month'?`<div class="coach-ops-daycell-head"><strong>${d.getMonth()+1}/${d.getDate()}</strong>${dayRows.length?`<span class="coach-ops-daycell-count">${lessonCount}节</span>`:''}</div>`:'';
        return `<div class="coach-ops-daycell ${mode==='week'?'week-cell':'month-cell'} ${ds===todayKey?'is-today':''} ${dayRows.length?'has-course':''}" onclick="openCoachOpsCreateSchedule(${jsArg(r.name)},'${ds}')">${head}${list}</div>`;
      }).join('');
      return `<div class="coach-ops-row" ${dragAttrs}><div class="coach-ops-name">${coachOpsDragIconHtml()}<span>${esc(r.name)}</span></div><div class="coach-ops-period-line ${mode==='week'?'coach-ops-week':'coach-ops-month'}">${cells}</div></div>`;
      }).join('');
    }
  }
  restoreCoachOpsScrollLeft(previousScrollLeft);
  bindCoachOpsHeaderScroll();
  if(mode==='day'&&coachOpsAutoScrollDayView){
    requestAnimationFrame(scrollCoachOpsDayToNow);
    coachOpsAutoScrollDayView=false;
  }
  if(mode==='week'&&coachOpsAutoScrollWeekView){
    requestAnimationFrame(scrollCoachOpsWeekToNow);
    coachOpsAutoScrollWeekView=false;
  }
  const workloadBody=document.getElementById('coachOpsTbody');
  if(workloadBody)workloadBody.innerHTML=rows.map(r=>`<tr><td class="tms-sticky-l" style="padding-left:20px"><div class="tms-text-primary">${esc(r.name)}</div></td><td><div class="coach-workload-lessons">${lessonUnitsText(r.totalLessonUnits)}<span>节</span>${coachOpsComparisonText(r)}</div></td><td>${operationsCoachTrialConversionText(r.name)}</td><td><div class="tms-text-remark coach-workload-course-types coach-workload-wrap" title="${esc(coachCourseTypeDistributionText(r))}">${esc(coachCourseTypeDistributionText(r))}</div></td><td><span class="coach-workload-count">${r.feedback}</span></td><td><span class="coach-workload-count">${r.pending}</span></td><td><div class="coach-workload-wrap coach-workload-campus">${esc(r.campusDistributionText)}</div></td><td><div class="coach-workload-wrap coach-workload-timeband">${esc(r.timeBandDistributionText)}</div></td></tr>`).join('');
  renderCoachOpsWorkloadMobileCards(rows);
  renderFinanceRevenueReport();
  renderFinanceConsumeReport();
}
function coachOpsDateWithinRange(value,from,to){
  const day=String(value||'').slice(0,10);
  if(!day)return false;
  if(from&&day<from)return false;
  if(to&&day>to)return false;
  return true;
}
function financeCampusNameFromValue(value){
  if(Array.isArray(value))return financeCampusNameFromValue(value[0]);
  return cn(String(value||'').trim());
}
function financeCampusNameForPurchase(purchase,entitlement={}){
  const entitlementCampus=parseArr(entitlement.campusIds)[0]||entitlement.campus||'';
  const student=students.find(s=>s.id===purchase.studentId)||{};
  const lifecycleCampus=typeof customerLifecycleCampus==='function'?customerLifecycleCampus(purchase,student.campus):'';
  return financeCampusNameFromValue(entitlementCampus||purchase.campus||lifecycleCampus||student.campus);
}
function financeMatchesCampusName(name){
  if(!campus||campus==='all')return true;
  const expected=financeCampusNameFromValue(campus);
  return !!name&&name===expected;
}
function financeWeekdayText(value){
  const day=String(value||'').slice(0,10);
  if(!day)return '—';
  const date=new Date(`${day}T00:00:00`);
  if(Number.isNaN(date.getTime()))return '—';
  return WEEKDAYS[(date.getDay()+6)%7]||'—';
}
function financeTimeText(value){
  const text=String(value||'');
  if(text.includes('T'))return text.slice(11,16)||'—';
  if(/^\d{2}:\d{2}/.test(text))return text.slice(0,5);
  return '—';
}
function financeTagClassByText(text,type='default'){
  const value=String(text||'').trim();
  if(type==='business'){
    if(value==='课程')return 'tms-tag-green';
    if(value==='会员储值')return 'tms-tag-tier-gold';
    if(value==='会员订场')return 'tms-tag-tier-blue';
    if(['散客订场','约球局','课程订场'].includes(value))return 'tms-tag-tier-blue';
  }
  if(type==='action'){
    if(['退款','冲回','回退'].includes(value))return 'tms-tag-tier-slate';
    if(value==='已入账'||value==='消耗')return 'tms-tag-green';
    if(value==='废弃')return 'tms-tag-tier-slate';
    return 'tms-tag-tier-gold';
  }
  if(type==='payment'){
    if(value==='课包划扣'||value==='储值扣款')return 'tms-tag-tier-blue';
    if(value==='会员充值'||value==='历史导入')return 'tms-tag-tier-gold';
    if(value==='转账'||value==='微信'||value==='支付宝'||value==='现金')return 'tms-tag-green';
  }
  return 'tms-tag-tier-slate';
}
function financeRevenueBaseRows(){
  return financeUnifiedRows().filter(row=>{
    if(!Number(row.cashDelta)||Number(row.cashDelta)<=0)return false;
    if(row.businessType==='差异项')return true;
    return ['课程','会员储值','散客订场','约球局','课程订场'].includes(row.businessType);
  }).map(row=>{
    const actualAmount=Math.max(0,Number(row.cashDelta)||0);
    const receivableAmount=['散客订场','约球局','课程订场'].includes(row.businessType)?actualAmount:Math.max(actualAmount,Number(row.deferredRevenueDelta)||0);
    return {
      id:row.id,
      purchaseDate:row.businessDate,
      weekdayText:row.weekdayText||financeWeekdayText(row.businessDate),
      timeText:row.timeText||'—',
      studentName:row.customer,
      incomeType:financeUnifiedRevenueType(row),
      businessType:row.displayBusinessType||financeUnifiedRevenueType(row),
      normalizedPaymentMethod:row.normalizedPaymentMethod||normalizePaymentMethod(row.paymentChannel||row.payMethod),
      payMethod:row.normalizedPaymentMethod||normalizePaymentMethod(row.paymentChannel||row.payMethod)||'—',
      receivableAmount,
      actualAmount,
      priceDiff:Math.round((receivableAmount-actualAmount)*100)/100,
      priceDiffReason:row.differenceReason||'—',
      collector:row.collector||'系统记录',
      notes:row.notes||'',
      campusName:row.campusName||'—',
      systemStatus:row.systemStatus||'正常',
      relatedDocument:row.sourceDocument||'—',
      status:row.systemStatus,
      revenueCategory:row.businessType==='差异项'?'差异项':financeDisplayBusinessType(row.businessType),
      sourceBusinessCategory:row.businessType,
      differenceReason:row.differenceReason||'',
      totalLessons:Number(row.totalLessons)||0,
      usedLessons:Number(row.usedLessons)||0,
      remainingLessons:Number(row.remainingLessons)||0
    };
  });
}
function financeRevenueRowsByFilters(rows){
  const q=String(document.getElementById('coachOpsRevenueSearch')?.value||'').trim().toLowerCase();
  const incomeTypeFilter=String(document.getElementById('financeRevenueTypeFilter')?.value||'').trim();
  const payMethodFilter=String(document.getElementById('financeRevenuePayMethodFilter')?.value||'').trim();
  return (rows||[]).filter(row=>{
    if(incomeTypeFilter&&row.businessType!==incomeTypeFilter)return false;
    if(payMethodFilter&&String(row.payMethod||'—')!==payMethodFilter)return false;
    return searchHit(q,row.studentName,row.businessType,row.payMethod,row.notes,row.collector,row.campusName,row.revenueCategory);
  });
}
function financeOrderedFilterOptions(rows,valueOf,standardOptions=[]){
  const values=new Set((rows||[]).map(valueOf).map(value=>String(value||'').trim()).filter(Boolean));
  const standardValues=(standardOptions||[]).map(opt=>String((typeof opt==='string'?opt:opt.value)||'').trim()).filter(Boolean);
  const ordered=standardValues.filter(value=>values.has(value));
  const extras=[...values].filter(value=>!standardValues.includes(value)).sort((a,b)=>String(a).localeCompare(String(b),'zh-Hans-CN'));
  return [...ordered,...extras].map(value=>({value,label:value}));
}
function financeBusinessTypeFilterOptions(rows,valueOf){
  return financeOrderedFilterOptions(rows,valueOf,FlowTennisBusinessTaxonomy.STANDARD_BUSINESS_TYPE_OPTIONS);
}
function financePaymentMethodFilterOptions(rows,valueOf){
  const standard=(FlowTennisBusinessTaxonomy.PAYMENT_METHODS||[]).map(value=>normalizePaymentMethod(value)||value);
  return financeOrderedFilterOptions(rows,valueOf,standard);
}
function renderFinanceRevenueFilterDropdowns(baseRows){
  const typeHost=document.getElementById('financeRevenueTypeFilterHost');
  const payMethodHost=document.getElementById('financeRevenuePayMethodFilterHost');
  if(!typeHost||!payMethodHost)return;
  const currentType=String(document.getElementById('financeRevenueTypeFilter')?.value||'').trim();
  const currentPayMethod=String(document.getElementById('financeRevenuePayMethodFilter')?.value||'').trim();
  const linked=withLinkedFilterCounts([
    {key:'business',value:currentType,options:[{ value:'', label:'全部', emptyDisplay:'业务类型' },...financeBusinessTypeFilterOptions(baseRows,row=>row.businessType)],match:(row,value)=>row.businessType===value},
    {key:'payMethod',value:currentPayMethod,options:[{ value:'', label:'全部', emptyDisplay:'支付方式' },...financePaymentMethodFilterOptions(baseRows,row=>row.payMethod||'—')],match:(row,value)=>String(row.payMethod||'—')===String(value)}
  ],baseRows||[]);
  typeHost.innerHTML=renderStandardDropdownHtml('financeRevenueTypeFilter','业务类型',linked.business.options,linked.business.value,false,'renderFinanceRevenueFilterChange');
  payMethodHost.innerHTML=renderStandardDropdownHtml('financeRevenuePayMethodFilter','支付方式',linked.payMethod.options,linked.payMethod.value,false,'renderFinanceRevenueFilterChange');
}
function renderFinanceRevenueFilterChange(){
  resetFinanceRevenuePage();
  renderFinanceRevenueReport();
}
function financeMoney(value){
  const num=Math.round((Number(value)||0)*100)/100;
  return `¥${fmt(num)}`;
}
function financeCardMoney(value){
  return `¥${fmt(Math.round(Number(value)||0))}`;
}
function financeCardValue(mainValue,subValue=null){
  if(subValue===null)return financeCardMoney(mainValue);
  return `<span class="finance-main-number">${financeCardMoney(mainValue)}</span><span class="finance-split-sep">/</span><span class="finance-sub-number">${financeCardMoney(subValue)}</span>`;
}
function financePercent(numerator,denominator,{parens=false}={}){
  const base=Number(denominator)||0;
  const text=base?`${Math.round((Number(numerator||0)/base)*100)}%`:'0%';
  return parens?`(${text})`:text;
}
function financeRecognitionPercent(numerator,denominator){
  return financePercent(numerator,denominator);
}
function financeCardValueWithPercent(mainValue,subValue){
  return `${financeCardValue(mainValue,subValue)}<span class="tms-stat-percent finance-card-percent">${financeRecognitionPercent(subValue,mainValue)}</span>`;
}
function financeInlineMoneyWithPercent(value,total){
  return `${financeCardMoney(value)} <span class="tms-stat-percent finance-card-percent">${financePercent(value,total,{parens:true})}</span>`;
}
function financeInlineMoneyOnly(value){
  return financeCardMoney(value);
}
function financeStatCardHtml({label,value,caption='',split=false}){
  return `<div class="tms-stat-card"><div class="tms-stat-label">${label}</div><div class="tms-stat-value${split?' finance-split-value':''}">${value}</div>${caption?`<div class="tms-stat-sub">${caption}</div>`:''}</div>`;
}
function financeFitOverviewStatValues(){
  const host=document.getElementById('financeOverviewPrimaryStats');
  if(!host)return;
  host.querySelectorAll('.tms-stat-value').forEach(el=>{
    el.style.fontSize='';
    let size=parseFloat(getComputedStyle(el).fontSize)||21;
    while(el.scrollWidth>el.clientWidth&&size>12){
      size-=1;
      el.style.fontSize=`${size}px`;
    }
  });
}
function financeRowsSum(rows,field){
  return Math.round((rows||[]).reduce((total,row)=>total+(Number(row?.[field])||0),0)*100)/100;
}
function financeStandardOverviewAll(){
  if(!financeOverviewData||typeof financeOverviewData!=='object')return {};
  return financeOverviewData.all&&typeof financeOverviewData.all==='object'?financeOverviewData.all:financeOverviewData;
}
function financeStandardNumber(...keys){
  const all=financeStandardOverviewAll();
  for(const key of keys){
    if(!Object.prototype.hasOwnProperty.call(all||{},key)||all[key]==null)continue;
    const value=Number(all?.[key]);
    if(Number.isFinite(value))return Math.round(value*100)/100;
  }
  return 0;
}
function financeStandardOverviewMetrics(){
  return {
    totalCash:financeStandardNumber('cash','totalIncome'),
    totalRecognized:financeStandardNumber('recognized','recognizedRevenue'),
    totalDeferred:financeStandardNumber('deferred','pendingRevenue'),
    courseIncome:financeStandardNumber('courseIncome'),
    courseRecognized:financeStandardNumber('courseRecognized'),
    directCourseIncome:financeStandardNumber('directCourseIncome'),
    directCourseRecognized:financeStandardNumber('directCourseRecognized'),
    packageIncome:financeStandardNumber('packageIncome'),
    packageRecognized:financeStandardNumber('packageRecognized'),
    storedValueIncome:financeStandardNumber('storedValueIncome'),
    storedValueRecognized:financeStandardNumber('storedValueConsumed'),
    bookingIncome:financeStandardNumber('bookingIncome','courtIncome'),
    bookingRecognized:financeStandardNumber('bookingRecognized','courtRecognized'),
    tradeCount:financeStandardNumber('tradeCount')
  };
}
function financeStandardRevenueMetrics(){
  return financeStandardOverviewMetrics();
}
function financeStandardRecognizedMetrics(){
  return financeStandardOverviewMetrics();
}
function financeAmountText(value){
  const num=Math.round((Number(value)||0)*100)/100;
  return num?`¥${fmt(num)}`:'¥0';
}
function financeSignedAmountText(value){
  const num=Math.round((Number(value)||0)*100)/100;
  if(!num)return '¥0';
  return `${num>0?'+':''}¥${fmt(num)}`;
}
function financeTransactionAmountHtml(row){
  const type=row?.transactionType||'收款';
  const amount=Math.abs(Number(row?.transactionAmount)||0);
  if(type==='收款')return `<span class="finance-amount finance-amount-income">+¥${fmt(amount)}</span>`;
  if(type==='消耗')return `<span class="finance-amount finance-amount-consume">¥${fmt(amount)}</span>`;
  if(type==='退款')return `<span class="finance-amount finance-amount-refund">-¥${fmt(amount)}</span>`;
  return `<span class="finance-amount finance-amount-void">¥${fmt(amount)}</span>`;
}
function financeDisplayBusinessType(type=''){
  const value=String(type||'').trim();
  if(['会员订场','散客订场','约球局','课程订场'].includes(value))return '订场';
  return value||'其他';
}
function financeUnifiedRevenueType(row){
  const businessType=String(row?.businessType||'').trim();
  if(businessType==='课程')return row.incomeType||'课包购买';
  if(businessType==='会员储值')return '会员储值';
  if(businessType==='会员订场')return '会员订场';
  if(businessType==='约球局')return '约球局';
  if(businessType==='课程订场')return '课程订场';
  if(businessType==='散客订场')return '散客订场';
  if(businessType==='差异项')return row.incomeType||'差异项';
  return row.incomeType||businessType||'其他';
}
function financeUnifiedSourceProject(row){
  if(row.sourceProject)return row.sourceProject;
  if(row.businessType==='课程')return row.incomeType||'课包购买';
  if(row.businessType==='会员储值')return '会员充值';
  if(['会员订场','散客订场','约球局','课程订场'].includes(row.businessType))return row.incomeType||row.businessType;
  return row.businessType||'其他';
}
function financeUnifiedDebitTarget(row){
  if(row.debitTarget)return row.debitTarget;
  if(row.businessType==='课程')return row.packageName||row.incomeType||'课包';
  if(row.businessType==='会员储值')return '会员储值余额';
  if(row.businessType==='会员订场')return '会员储值余额';
  if(['散客订场','约球局','课程订场'].includes(row.businessType))return '现场收款';
  return row.paymentChannel||'—';
}
function financeRecognizedAmountForConsumeRow(row,entitlement,purchase){
  const lessonDelta=Math.abs(Number(row.lessonDelta)||0);
  const totalLessons=Math.max(1,Number(entitlement?.totalLessons)||Number(purchase?.packageLessons)||lessonDelta||1);
  const amountPaid=Number(purchase?.amountPaid)||0;
  if(!amountPaid||!lessonDelta)return 0;
  return Math.round((amountPaid/totalLessons)*lessonDelta*100)/100;
}
function financeCourtHistoryBusinessType(historyRow){
  const category=String(historyRow?.category||'');
  const sourceCategory=String(historyRow?.sourceCategory||'');
  const payMethod=String(historyRow?.payMethod||'').trim();
  if(historyRow?.type==='充值')return '会员储值';
  if(sourceCategory.includes('约球订场'))return '约球局';
  if(category.includes('订场')){
    if(payMethod==='储值扣款'||payMethod==='储值卡'||payMethod.includes('储值')||category.includes('会员'))return '会员订场';
    return '散客订场';
  }
  if(/课|班课|训练营|体验/.test(category))return '课程';
  return '其他';
}
function financeLedgerCampusName(row){
  const direct=financeCampusNameFromValue(row?.campusName||row?.campusId||row?.campus||'');
  if(direct)return direct;
  const meta=row?.productSnapshotMeta||{};
  const courtId=meta.courtId||(row?.userType==='court_customer'?row?.userId:'');
  if(courtId){
    const court=courts.find(item=>item.id===courtId);
    const courtCampus=financeCampusNameFromValue(court?.campus||court?.campusName||'');
    if(courtCampus)return courtCampus;
  }
  const noteText=`${row?.notes||''} ${row?.reason||''}`;
  if(noteText.includes('顺义马坡')||noteText.includes('马坡'))return '顺义马坡';
  if(noteText.includes('朝阳十里堡'))return '朝阳十里堡';
  return '';
}
function financeLedgerBusinessTypeFromRow(row){
  const rawBusiness=String(row?.businessType||'').trim();
  const payMethod=String(row?.paymentChannel||'').trim();
  const noteText=`${row?.notes||''} ${row?.reason||''} ${row?.productSnapshotName||''}`;
  const ledgerType=String(row?.ledgerType||'').trim();
  if(rawBusiness==='会员'||ledgerType.includes('会员充值')||payMethod==='会员充值')return '会员储值';
  if(rawBusiness==='课程')return '课程';
  if(rawBusiness==='订场'){
    if(payMethod.includes('储值'))return '会员订场';
    if(noteText.includes('约球'))return '约球局';
    return '散客订场';
  }
  return rawBusiness||'其他';
}
function financeLedgerActionFromRow(row){
  const actionType=String(row?.actionType||'').trim();
  const payMethod=String(row?.paymentChannel||'').trim();
  const cashDelta=Number(row?.cashDelta)||0;
  const recognizedRevenueDelta=Number(row?.recognizedRevenueDelta)||0;
  const deferredRevenueDelta=Number(row?.deferredRevenueDelta)||0;
  if(actionType==='收款')return '收款';
  if(actionType==='退款')return '退款';
  if(actionType==='冲正')return '冲回';
  if(actionType==='消耗')return '消耗';
  if(actionType==='消费')return payMethod.includes('储值')?'已入账':'收款';
  if(actionType==='历史导入'){
    if(cashDelta>0)return '收款';
    if(cashDelta===0&&recognizedRevenueDelta!==0&&deferredRevenueDelta!==0)return '已入账';
  }
  return '记录';
}
function financeCourtRevenueRows(){
  return courts.flatMap(court=>{
    const campusName=financeCampusNameFromValue(court.campus);
    if(!financeMatchesCampusName(campusName))return [];
    return normalizeCourtHistoryLocal(court.history).filter(h=>{
      if(String(h.category||'').includes('内部占用'))return false;
      if(h.type==='充值')return true;
      if(['消费','退款','冲正'].includes(h.type)&&String(h.category||'').includes('订场'))return true;
      if(h.type==='消费'&&String(h.payMethod||'').trim()!=='储值扣款')return true;
      return false;
    }).map(h=>{
      const isStoredValue=h.type==='充值';
      const actual=(Number(h.amount)||0)*(h.type==='退款'||h.type==='冲正'?-1:1);
      const businessType=financeCourtHistoryBusinessType(h);
      const typeText=isStoredValue
        ? '会员储值'
        : ((businessType==='会员订场'||businessType==='散客订场'||businessType==='约球局'||businessType==='课程订场')?businessType:(h.category||'课程收入'));
      const timeText=h.startTime&&h.endTime?`${String(h.startTime).slice(11,16)}-${String(h.endTime).slice(11,16)}`:(h.time||'—');
      return {
        id:`court-income-${court.id}-${h.id||h.date||uid()}`,
        revenueCategory:isStoredValue?'会员储值':businessType,
        campusName,
        purchaseDate:h.date||'',
        weekdayText:financeWeekdayText(h.date),
        timeText,
        studentName:courtDisplayName(court)||court.name||court.id,
        incomeType:typeText,
        payMethod:h.payMethod||'—',
        receivableAmount:actual,
        actualAmount:actual,
        priceDiff:0,
        priceDiffReason:'—',
        collector:h.operator||h.createdBy||'系统记录',
        systemStatus:'正常',
        relatedDocument:`订场账户 ${court.id}`,
        notes:h.note||h.category||'',
        totalLessons:0,
        usedLessons:0,
        remainingLessons:0
      };
    });
  });
}
function financeBookingOverviewRows(){
  return courts.flatMap(court=>{
    const campusName=financeCampusNameFromValue(court.campus);
    if(!financeMatchesCampusName(campusName))return [];
    return normalizeCourtHistoryLocal(court.history).flatMap(h=>{
      if(String(h.category||'').includes('内部占用'))return [];
      const businessType=financeCourtHistoryBusinessType(h);
      if(!['会员订场','散客订场','约球局','课程订场'].includes(businessType))return [];
      const noteText=`${h.note||''} ${h.category||''}`;
      if(/期初导入汇总/.test(noteText))return [];
      const signed=(Number(h.amount)||0)*(h.type==='退款'||h.type==='冲正'?-1:1);
      if(!signed)return [];
      const payMethod=String(h.payMethod||'').trim();
      return [{
        businessType,
        payMethod,
        incomeAmount:signed,
        recognizedAmount:payMethod==='代用户订场'?0:signed
      }];
    });
  });
}
function financeRevenueRows(){
  return financeRevenueRowsByFilters(financeRevenueBaseRows().filter(row=>globalDateWithinRange(row.purchaseDate)))
    .sort((a,b)=>String(b.purchaseDate||'').localeCompare(String(a.purchaseDate||'')));
}
function renderFinanceRevenueMobileCards(rows){
  const host=document.getElementById('financeRevenueMobileCards');if(!host)return;
  host.innerHTML=rows.length?rows.map(row=>`<article class="admin-h5-list-card admin-h5-finance-card"><div class="admin-h5-card-head"><div><strong>${esc(row.studentName||'-')}</strong><span>${esc(financeDateTimeDisplayText(row))}</span></div><span class="tms-tag">${esc(row.businessType||'-')}</span></div><div class="admin-h5-card-tags"><span class="tms-tag">${esc(row.payMethod||'-')}</span><span class="tms-tag">${esc(row.campusName||'-')}</span></div><div class="admin-h5-card-grid"><span><b>应收</b>${financeAmountText(row.receivableAmount)}</span><span><b>实收</b>${financeAmountText(row.actualAmount)}</span><span><b>差价</b>${financeSignedAmountText(row.priceDiff)}</span><span><b>操作人</b>${esc(financeOperatorDisplayText(row))}</span></div><p>${esc(financeHumanNote(row.notes)||row.priceDiffReason||'暂无备注')}</p></article>`).join(''):'<div class="tms-empty-state"><div class="tms-empty-title">暂无收入流水</div><div class="tms-empty-desc">调整搜索或筛选后再看</div></div>';
}
function jumpFinanceRevenuePage(value){
  financeRevenuePage=standardListPagination(financeRevenueRows().length,value,financeRevenuePageSize).page;
  renderFinanceRevenueReport();
}
function renderFinanceRevenuePager(total,pages){
  renderFinanceRevenuePageSizeFilter();
  const pager=document.querySelector('#page-finance #financeRevenuePanel .tms-pagination');
  if(pager)pager.style.display=total>0?'flex':'none';
  const info=document.getElementById('financeRevenuePagerInfo');
  if(info)info.innerHTML=renderPagerInfoHtml(total);
  const btns=document.getElementById('financeRevenuePagerBtns');
  if(!btns)return;
  btns.innerHTML=(!total||pages<=1)?'':renderStandardPaginationButtonsHtml(financeRevenuePage,pages,'setFinanceRevenuePage');
}
function renderFinanceRevenueReport(){
  const body=document.getElementById('financeRevenueTbody');
  const stats=document.getElementById('coachOpsRevenueStats');
  if(!body||!stats)return;
  const baseRows=financeRevenueBaseRows().filter(row=>globalDateWithinRange(row.purchaseDate));
  renderFinanceRevenueFilterDropdowns(baseRows);
  const rows=financeRevenueRows();
  const isMobileList=document.body.classList.contains('admin-mobile'),pageState=isMobileList?{total:rows.length,pages:1,page:1,pageSize:financeRevenuePageSize,slice:rows}:standardListSlice(rows,financeRevenuePage,financeRevenuePageSize);
  financeRevenuePage=pageState.page;
  financeRevenuePageSize=pageState.pageSize;
  const slice=pageState.slice;
  renderFinanceRevenuePager(pageState.total,pageState.pages);
  const metrics=financeStandardRevenueMetrics();
  stats.innerHTML=[
    {label:'成交笔数',value:`${metrics.tradeCount||0} <span>笔</span>`},
    {label:'实收合计',value:financeCardMoney(metrics.totalCash)},
    {label:'会员储值',value:financeInlineMoneyWithPercent(metrics.storedValueIncome,metrics.totalCash)},
    {label:'散客订场',value:financeInlineMoneyWithPercent(metrics.bookingIncome,metrics.totalCash)},
    {label:'课程流水',value:financeInlineMoneyWithPercent(metrics.courseIncome,metrics.totalCash)}
  ].map(financeStatCardHtml).join('');
  body.innerHTML=slice.length?slice.map(row=>`<tr><td style="padding-left:20px">${renderStandardCellText(financeDateTimeDisplayText(row),false)}</td><td>${renderStandardCellText(row.studentName,false)}</td><td>${renderStandardCellText(row.businessType,false)}</td><td>${renderStandardCellText(row.payMethod,false)}</td><td>${financeAmountText(row.receivableAmount)}</td><td>${financeAmountText(row.actualAmount)}</td><td>${financeSignedAmountText(row.priceDiff)}</td><td>${renderStandardCellText(row.priceDiffReason,false)}</td><td>${renderStandardCellText(row.campusName,false)}</td><td>${renderStandardCellText(financeOperatorDisplayText(row),false)}</td><td><div class="tms-text-remark finance-revenue-remark" title="${esc(financeHumanNote(row.notes))}">${esc(renderStandardEmptyText(financeHumanNote(row.notes)))}</div></td></tr>`).join(''):`<tr><td colspan="11"><div class="tms-empty-state"><div class="tms-empty-title">暂无收入流水</div><div class="tms-empty-desc">调整搜索或筛选后再看</div></div></td></tr>`;
  renderFinanceRevenueMobileCards(slice);
}
function financeConsumeBaseRows(sourceRows=aggregateHistoricalMonthlyLedgerRows(dedupeEntitlementLedgerForDisplay(entitlementLedger))){
  return sourceRows.filter(row=>{
    const ent=entitlements.find(e=>e.id===row.entitlementId)||{};
    const purchase=purchases.find(p=>p.id===ent.purchaseId)||{};
    const schedule=schedules.find(s=>s.id===row.scheduleId)||{};
    const campusName=financeCampusNameFromValue(schedule.campus||parseArr(ent.campusIds)[0]||purchase.campus||(students.find(s=>s.id===purchase.studentId)||{}).campus);
    if(!financeMatchesCampusName(campusName))return false;
    return true;
  }).sort((a,b)=>String(b.relatedDate||b.createdAt||'').localeCompare(String(a.relatedDate||a.createdAt||''))).map(row=>{
    const ent=entitlements.find(e=>e.id===row.entitlementId)||{};
    const purchase=purchases.find(p=>p.id===ent.purchaseId)||{};
    const schedule=schedules.find(s=>s.id===row.scheduleId)||{};
    const recognizedAmount=financeRecognizedAmountForConsumeRow(row,ent,purchase);
    const campusName=financeCampusNameFromValue(schedule.campus||parseArr(ent.campusIds)[0]||purchase.campus||(students.find(s=>s.id===purchase.studentId)||{}).campus);
    return {
      ...row,
      actionLabel:(Number(row.lessonDelta)||0)<0?'扣课':((Number(row.lessonDelta)||0)>0?'退回':'记录'),
      studentName:ent.studentName||purchase.studentName||schedule.studentName||'—',
      packageName:ent.packageName||purchase.packageName||'—',
      notes:row.notes||ent.notes||purchase.notes||'',
      scheduleTime:schedule.startTime||'',
      coach:coachName(schedule.coach||purchase.ownerCoach)||'—',
      courseType:scheduleCourseType(schedule)||ent.courseType||purchase.courseType||'—',
      campusName,
      recognizedAmount,
      confirmType:(Number(row.lessonDelta)||0)<0?'课程确认收入':'消耗回退',
      sourceProject:schedule.id?`${scheduleCourseType(schedule)||'课程'} ${fmtDt(schedule.startTime)}`:(row.reason||'历史导入'),
      debitTarget:standardPackageLabel(ent,true)||standardPackageLabel(purchase,true)||ent.packageName||purchase.packageName||'课包',
      systemStatus:row.scheduleId||row.importSource==='系统导入'?'已关联':'待补来源',
      relatedDocument:row.scheduleId?`排课 ${row.scheduleId}`:`课包流水 ${row.id}`
    };
  });
}
function financeRecognizedRows(){
  const q=String(document.getElementById('coachOpsConsumeSearch')?.value||'').trim().toLowerCase();
  return financeUnifiedRows().filter(row=>{
    if(!globalDateWithinRange(row.businessDate))return false;
    if(row.differenceReason)return false;
    if(!Number(row.recognizedRevenueDelta))return false;
    return searchHit(q,row.customer,row.businessType,row.paymentChannel,row.notes,row.sourceDocument,row.sourceProject,row.debitTarget,row.campusName);
  }).sort((a,b)=>String(b.businessDate||'').localeCompare(String(a.businessDate||''))).map(row=>({
    ...row,
    confirmType:row.businessType==='课程'
      ? (row.action==='回退'?'消耗回退':'课程确认收入')
      : (row.businessType==='会员订场'?'会员订场已入账':'订场确认收入'),
    sourceProject:financeUnifiedSourceProject(row),
    debitTarget:financeUnifiedDebitTarget(row)
  }));
}
function renderFinanceRecognizedPager(total,pages){
  renderFinanceRecognizedPageSizeFilter();
  const pager=document.querySelector('#page-finance #financeRecognizedPanel .tms-pagination');
  if(pager)pager.style.display=total>0?'flex':'none';
  const info=document.getElementById('financeRecognizedPagerInfo');
  if(info)info.innerHTML=renderPagerInfoHtml(total);
  const btns=document.getElementById('financeRecognizedPagerBtns');
  if(!btns)return;
  btns.innerHTML=(!total||pages<=1)?'':renderStandardPaginationButtonsHtml(financeRecognizedPage,pages,'setFinanceRecognizedPage');
}
function renderCoachOpsRevenueReport(){
  return renderFinanceRevenueReport();
}
function coachOpsConsumeRows(){
  const q=String(document.getElementById('coachOpsConsumeSearch')?.value||'').trim().toLowerCase();
  const ledgerRows=aggregateHistoricalMonthlyLedgerRows(dedupeEntitlementLedgerForDisplay(entitlementLedger));
  return financeConsumeBaseRows(ledgerRows).filter(row=>{
    if(!globalDateWithinRange(row.businessDate||row.relatedDate||row.createdAt))return false;
    return searchHit(q,row.reason,row.notes,row.operator,row.studentName,row.packageName,row.coach,row.courseType,row.campusName,row.sourceProject,row.debitTarget);
  }).sort((a,b)=>String(b.relatedDate||b.createdAt||'').localeCompare(String(a.relatedDate||a.createdAt||'')));
}
function renderFinanceConsumeReport(){
  const body=document.getElementById('financeConsumeTbody');
  const stats=document.getElementById('coachOpsConsumeStats');
  if(!body||!stats)return;
  const rows=financeRecognizedRows();
  const isMobileList=document.body.classList.contains('admin-mobile'),pageState=isMobileList?{total:rows.length,pages:1,page:1,pageSize:financeRecognizedPageSize,slice:rows}:standardListSlice(rows,financeRecognizedPage,financeRecognizedPageSize);
  financeRecognizedPage=pageState.page;
  financeRecognizedPageSize=pageState.pageSize;
  renderFinanceRecognizedPager(pageState.total,pageState.pages);
  const slice=pageState.slice;
  const metrics=financeStandardRecognizedMetrics();
  stats.innerHTML=[
    {label:'流水条数',value:`${rows.length} <span>条</span>`},
    {label:'确收合计',value:financeCardMoney(metrics.totalRecognized)},
    {label:'散客订场核销',value:financeInlineMoneyWithPercent(metrics.bookingRecognized,metrics.totalRecognized)},
    {label:'会员耗卡核销',value:financeInlineMoneyWithPercent(metrics.storedValueRecognized,metrics.totalRecognized)},
    {label:'课程已入账',value:financeInlineMoneyWithPercent(metrics.courseRecognized,metrics.totalRecognized)}
  ].map(financeStatCardHtml).join('');
  body.innerHTML=slice.length?slice.map(row=>`<tr><td style="padding-left:20px">${renderStandardCellText(financeDateTimeDisplayText(row),false)}</td><td>${renderStandardCellText(row.customer,false)}</td><td>${renderStandardCellText(row.displayBusinessType||row.businessType,false)}</td><td>${renderStandardCellText(row.normalizedPaymentMethod||row.paymentChannel||row.payMethod,false)}</td><td>${renderStandardCellText(row.debitTarget,false)}</td><td>${financeSignedAmountText(row.recognizedRevenueDelta)}</td><td>${renderStandardCellText(row.campusName,false)}</td><td>${renderStandardCellText(financeOperatorDisplayText(row),false)}</td><td><div class="tms-text-remark finance-ledger-remark" title="${esc(financeHumanNote(row.notes))}">${esc(renderStandardEmptyText(financeHumanNote(row.notes)))}</div></td></tr>`).join(''):`<tr><td colspan="9"><div class="tms-empty-state"><div class="tms-empty-title">暂无已入账流水</div><div class="tms-empty-desc">调整搜索或筛选后再看</div></div></td></tr>`;
  renderFinanceRecognizedMobileCards(slice);
}
function renderFinanceRecognizedMobileCards(rows){
  const host=document.getElementById('financeRecognizedMobileCards');if(!host)return;
  host.innerHTML=rows.length?rows.map(row=>`<article class="admin-h5-list-card admin-h5-finance-card"><div class="admin-h5-card-head"><div><strong>${esc(row.customer||'-')}</strong><span>${esc(financeDateTimeDisplayText(row))}</span></div><span class="tms-tag">${esc(row.displayBusinessType||row.businessType||'-')}</span></div><div class="admin-h5-card-tags"><span class="tms-tag">${esc(row.normalizedPaymentMethod||row.paymentChannel||row.payMethod||'-')}</span><span class="tms-tag">${esc(row.campusName||'-')}</span></div><div class="admin-h5-card-grid"><span><b>扣减标的</b>${esc(row.debitTarget||'-')}</span><span><b>确认收入</b>${financeSignedAmountText(row.recognizedRevenueDelta)}</span><span><b>操作人</b>${esc(financeOperatorDisplayText(row))}</span><span><b>状态</b>${esc(row.confirmType||'-')}</span></div><p>${esc(financeHumanNote(row.notes)||'暂无备注')}</p></article>`).join(''):'<div class="tms-empty-state"><div class="tms-empty-title">暂无已入账流水</div><div class="tms-empty-desc">调整搜索或筛选后再看</div></div>';
}
function renderCoachOpsConsumeReport(){
  return renderFinanceConsumeReport();
}
function exportCoachOpsRevenueCsv(){
  const rows=financeRevenueRows();
  let csv='交易时间,姓名,业务类型,支付方式,应收,实收,差价,差价说明,校区,操作人,备注\n';
  csv+=rows.map(row=>[financeDateTimeDisplayText(row),row.studentName||'',row.businessType||'',row.payMethod||'',row.receivableAmount||0,row.actualAmount||0,row.priceDiff||0,'"'+String(row.priceDiffReason||'').replace(/"/g,'""')+'"',row.campusName||'','"'+String(financeOperatorDisplayText(row)).replace(/"/g,'""')+'"','"'+String(financeHumanNote(row.notes)).replace(/"/g,'""')+'"'].join(',')).join('\n');
  const blob=new Blob(['\ufeff'+csv],{type:'text/csv;charset=utf-8;'});
  const a=document.createElement('a');a.href=URL.createObjectURL(blob);a.download='FlowTennis_收入表_'+today()+'.csv';a.click();toast('导出成功','success');
}
function exportCoachOpsConsumeCsv(){
  const rows=financeRecognizedRows();
  let csv='交易时间,姓名,业务类型,支付方式,扣减标的,确认收入,校区,操作人,备注\n';
  csv+=rows.map(row=>[financeDateTimeDisplayText(row),row.customer||'',row.displayBusinessType||row.businessType||'',row.normalizedPaymentMethod||row.paymentChannel||row.payMethod||'',row.debitTarget||'',row.recognizedRevenueDelta||0,row.campusName||'','"'+String(financeOperatorDisplayText(row)).replace(/"/g,'""')+'"','"'+String(financeHumanNote(row.notes)).replace(/"/g,'""')+'"'].join(',')).join('\n');
  const blob=new Blob(['\ufeff'+csv],{type:'text/csv;charset=utf-8;'});
  const a=document.createElement('a');a.href=URL.createObjectURL(blob);a.download='FlowTennis_消耗表_'+today()+'.csv';a.click();toast('导出成功','success');
}
function financePrepaidRows(){
  const rows=financePrepaidUnifiedRows().filter(row=>financeMatchesCampusName(row.campusName));
  const filteredRows=rows.filter(row=>{
    if(financePrepaidFilter==='lesson')return row.deferredType==='课包待确认';
    if(financePrepaidFilter==='stored')return row.deferredType==='会员储值待确认';
    return true;
  });
  return filteredRows.sort((a,b)=>Number(b.deferredAmount)-Number(a.deferredAmount));
}
function financeUnifiedRows(){
  const snapshotRows=financeNormalizedRows();
  if(loadedDatasets.has('financePage')){
    return snapshotRows.filter(row=>financeMatchesCampusName(row.campusName));
  }
  return [];
}
function financeLedgerBaseRows(){
  return financeUnifiedRows();
}
function financeLedgerRows(){
  const businessTypeFilter=String(document.getElementById('financeLedgerBusinessTypeFilter')?.value||'').trim();
  const transactionTypeFilter=String(document.getElementById('financeLedgerTransactionTypeFilter')?.value||'').trim();
  const payMethodFilter=String(document.getElementById('financeLedgerPayMethodFilter')?.value||'').trim();
  return financeLedgerBaseRows().filter(row=>{
    if(!globalDateWithinRange(row.businessDate))return false;
    if(row.differenceReason)return false;
    const q=String(document.getElementById('financeLedgerSearch')?.value||'').trim().toLowerCase();
    if(transactionTypeFilter&&row.transactionType!==transactionTypeFilter)return false;
    if(businessTypeFilter&&row.displayBusinessType!==businessTypeFilter)return false;
    if(payMethodFilter&&String(row.normalizedPaymentMethod||'其他')!==payMethodFilter)return false;
    return searchHit(q,row.customer,row.displayBusinessType,row.transactionType,row.normalizedPaymentMethod,row.notes,row.campusName);
  }).sort((a,b)=>financeLedgerSortKey(b).localeCompare(financeLedgerSortKey(a))||String(b.id||'').localeCompare(String(a.id||'')));
}
function financeLedgerDataReady(){
  return loadedDatasets.has('financePage');
}
function syncFinanceLedgerLoadingState(){
  const loading=document.getElementById('financeLedgerLoading');
  const ready=document.getElementById('financeLedgerReady');
  const showLoading=financePanel==='ledger'&&!financeLedgerDataReady();
  if(loading)loading.style.display=showLoading?'block':'none';
  if(ready)ready.style.display=showLoading?'none':'';
  return !showLoading;
}
function renderFinanceOverview(){
  const primaryHost=document.getElementById('financeOverviewPrimaryStats');
  const secondaryHost=document.getElementById('financeOverviewSecondaryStats');
  if(!primaryHost||!secondaryHost)return;
  if(!syncFinanceLedgerLoadingState())return;
  const metrics=financeStandardOverviewMetrics();
  primaryHost.innerHTML=[
    {label:'总实收',value:financeCardMoney(metrics.totalCash)},
    {label:'总核销确收',value:financeCardMoney(metrics.totalRecognized),caption:'筛选范围内核销金额'},
    {label:'会员储值',value:`${financeInlineMoneyWithPercent(metrics.storedValueIncome,metrics.totalCash)} <span class="finance-split-sep">｜</span> ${financeInlineMoneyOnly(metrics.storedValueRecognized)}`,caption:'会员实收 vs 会员已核销',split:true},
    {label:'散客订场',value:financeInlineMoneyWithPercent(metrics.bookingIncome,metrics.totalCash),caption:'散客订场/总实收比'},
    {label:'课程收入',value:`${financeInlineMoneyWithPercent(metrics.courseIncome,metrics.totalCash)} <span class="finance-split-sep">｜</span> ${financeInlineMoneyOnly(metrics.courseRecognized)}`,caption:'课程实收 vs 课程已核销',split:true}
  ].map(financeStatCardHtml).join('');
  if(typeof requestAnimationFrame==='function')requestAnimationFrame(financeFitOverviewStatValues);
  else setTimeout(financeFitOverviewStatValues,0);
  secondaryHost.innerHTML='';
  secondaryHost.style.display='none';
}
function renderFinanceLedgerFilterDropdowns(baseRows){
  const businessHost=document.getElementById('financeLedgerBusinessTypeFilterHost');
  const transactionHost=document.getElementById('financeLedgerTransactionTypeFilterHost');
  const payMethodHost=document.getElementById('financeLedgerPayMethodFilterHost');
  if(!businessHost||!transactionHost||!payMethodHost)return;
  const currentBusiness=String(document.getElementById('financeLedgerBusinessTypeFilter')?.value||'').trim();
  const currentTransaction=String(document.getElementById('financeLedgerTransactionTypeFilter')?.value||'').trim();
  const currentPayMethod=String(document.getElementById('financeLedgerPayMethodFilter')?.value||'').trim();
  const visibleRows=(baseRows||[]).filter(row=>!row.differenceReason);
  const transactionOrder=FlowTennisBusinessTaxonomy.TRANSACTION_TYPES;
  const transactionValues=Array.from(new Set(visibleRows.map(row=>row.transactionType).filter(Boolean))).filter(item=>transactionOrder.includes(item)).sort((a,b)=>transactionOrder.indexOf(a)-transactionOrder.indexOf(b));
  const linked=withLinkedFilterCounts([
    {key:'business',value:currentBusiness,options:[{ value:'', label:'全部', emptyDisplay:'业务类型' },...financeBusinessTypeFilterOptions(visibleRows,row=>row.displayBusinessType)],match:(row,value)=>row.displayBusinessType===value},
    {key:'transaction',value:currentTransaction,options:[{ value:'', label:'全部', emptyDisplay:'交易类型' },...transactionValues.map(item=>({ value:item, label:item }))],match:(row,value)=>row.transactionType===value},
    {key:'payMethod',value:currentPayMethod,options:[{ value:'', label:'全部', emptyDisplay:'支付方式' },...financePaymentMethodFilterOptions(visibleRows,row=>row.normalizedPaymentMethod||'其他')],match:(row,value)=>String(row.normalizedPaymentMethod||'其他')===String(value)}
  ],visibleRows);
  businessHost.innerHTML=renderStandardDropdownHtml('financeLedgerBusinessTypeFilter','业务类型',linked.business.options,linked.business.value,false,'renderFinanceLedgerFilterChange');
  transactionHost.innerHTML=renderStandardDropdownHtml('financeLedgerTransactionTypeFilter','交易类型',linked.transaction.options,linked.transaction.value,false,'renderFinanceLedgerFilterChange');
  payMethodHost.innerHTML=renderStandardDropdownHtml('financeLedgerPayMethodFilter','支付方式',linked.payMethod.options,linked.payMethod.value,false,'renderFinanceLedgerFilterChange');
}
function renderFinanceLedgerFilterChange(){
  financeLedgerPage=standardListFirstPage();
  renderFinanceLedger();
}
function renderFinanceLedgerPager(total,pages){
  const pager=document.querySelector('#page-finance #financeLedgerPanel .tms-pagination');
  if(pager)pager.style.display=total>0?'flex':'none';
  const pagerInfo=document.getElementById('financeLedgerPagerInfo');
  if(pagerInfo)pagerInfo.innerHTML=renderPagerInfoHtml(total);
  const pagerBtns=document.getElementById('financeLedgerPagerBtns');
  if(!pagerBtns)return;
  pagerBtns.innerHTML=(!total||pages<=1)?'':renderStandardPaginationButtonsHtml(financeLedgerPage,pages,'setFinanceLedgerPage');
}
function renderFinanceLedgerMobileCards(rows){
  const host=document.getElementById('financeLedgerMobileCards');if(!host)return;
  host.innerHTML=rows.length?rows.map(row=>`<article class="admin-h5-list-card admin-h5-finance-card"><div class="admin-h5-card-head"><div><strong>${esc(row.customer||'-')}</strong><span>${esc(financeDateTimeDisplayText(row))}</span></div><span class="tms-tag ${financeTagClassByText(row.transactionType,'action')}">${esc(row.transactionType||'-')}</span></div><div class="admin-h5-card-tags"><span class="tms-tag">${esc(row.displayBusinessType||'-')}</span><span class="tms-tag ${financeTagClassByText(row.normalizedPaymentMethod,'payment')}">${esc(row.normalizedPaymentMethod||'其他')}</span></div><div class="admin-h5-card-grid"><span><b>交易金额</b>${financeTransactionAmountHtml(row)}</span><span><b>校区</b>${esc(row.campusName||'-')}</span><span><b>操作人</b>${esc(financeOperatorDisplayText(row))}</span><span><b>业务类型</b>${esc(row.displayBusinessType||'-')}</span></div><p>${esc(financeHumanNote(row.notes)||'暂无备注')}</p></article>`).join(''):'<div class="tms-empty-state"><div class="tms-empty-title">暂无交易流水</div><div class="tms-empty-desc">调整搜索或筛选后再看</div></div>';
}
function renderFinanceLedger(){
  const body=document.getElementById('financeLedgerTbody');
  if(!body)return;
  if(!syncFinanceLedgerLoadingState())return;
  const baseRows=financeLedgerBaseRows().filter(row=>globalDateWithinRange(row.businessDate));
  renderFinanceLedgerFilterDropdowns(baseRows);
  renderFinanceLedgerPageSizeFilter();
  const rows=financeLedgerRows();
  const isMobileList=document.body.classList.contains('admin-mobile'),pageState=isMobileList?{total:rows.length,pages:1,page:1,pageSize:financeLedgerPageSize,slice:rows}:standardListSlice(rows,financeLedgerPage,financeLedgerPageSize);
  financeLedgerPage=pageState.page;
  financeLedgerPageSize=pageState.pageSize;
  const slice=pageState.slice;
  renderFinanceLedgerPager(pageState.total,pageState.pages);
  body.innerHTML=slice.length?slice.map(row=>`<tr><td style="padding-left:20px">${renderStandardCellText(financeDateTimeDisplayText(row),false)}</td><td>${renderStandardCellText(row.customer,false)}</td><td><span class="tms-tag ${financeTagClassByText(row.transactionType,'action')}">${esc(row.transactionType)}</span></td><td>${financeTransactionAmountHtml(row)}</td><td>${renderStandardCellText(row.displayBusinessType,false)}</td><td><span class="tms-tag ${financeTagClassByText(row.normalizedPaymentMethod,'payment')}">${esc(row.normalizedPaymentMethod||'其他')}</span></td><td>${renderStandardCellText(row.campusName,false)}</td><td>${renderStandardCellText(financeOperatorDisplayText(row),false)}</td><td><div class="tms-text-remark finance-ledger-remark" title="${esc(financeHumanNote(row.notes))}">${esc(renderStandardEmptyText(financeHumanNote(row.notes)))}</div></td></tr>`).join(''):`<tr><td colspan="9"><div class="empty"><p>暂无交易流水</p></div></td></tr>`;
  renderFinanceLedgerMobileCards(slice);
}
function renderFinancePrepaidBalance(){
  const body=document.getElementById('financePrepaidTbody');
  const stats=document.getElementById('financePrepaidStats');
  if(!body||!stats)return;
  const rows=financePrepaidRows();
  const summary=campus==='all'
    ? financePrepaidUnifiedSummary()
    : (financePrepaidView?.summaryByCampus?.[financeCampusNameFromValue(campus)]||{});
  stats.innerHTML=[
    ['待确认总额',Number(summary.totalDeferredAmount)||0,financeMoney],
    ['课包待确认',Number(summary.coursePrepaidAmount)||0,financeMoney],
    ['会员储值待确认',Number(summary.memberPrepaidAmount)||0,financeMoney],
    ['待确认客户数',Number(summary.customerCount)||0,val=>String(val)]
  ].map(([label,val,formatter])=>`<div class="tms-stat-card"><div class="tms-stat-label">${label}</div><div class="tms-stat-value">${formatter(val)}</div></div>`).join('');
  body.innerHTML=rows.length?rows.map(row=>`<tr><td style="padding-left:20px">${renderStandardCellText(row.customer,false)}</td><td>${renderStandardCellText(row.campusName,false)}</td><td>${renderStandardCellText(row.deferredType==='课包待确认'?'课包':'会员储值',false)}</td><td>${financeAmountText(row.deferredAmount)}</td><td>${renderStandardCellText(row.source,false)}</td><td><div class="tms-text-remark">${esc(renderStandardEmptyText(financeHumanNote(row.notes)))}</div></td></tr>`).join(''):`<tr><td colspan="6"><div class="empty"><p>暂无待确认收入</p></div></td></tr>`;
}
function financeSettlementRows(){
  const monthInput=document.getElementById('financeSettlementMonth');
  const monthValue=(monthInput?.value||today().slice(0,7)).slice(0,7);
  if(monthInput&&!monthInput.value)monthInput.value=monthValue;
  if(!loadedDatasets.has('financePage'))return [];
  return financeSettlementRowsFromSnapshot().filter(row=>String(row.month||'')===monthValue&&financeMatchesCampusName(row.campusName))
    .sort((a,b)=>{
      if((Number(b.lateFeeAmount)||0)!==(Number(a.lateFeeAmount)||0))return (Number(b.lateFeeAmount)||0)-(Number(a.lateFeeAmount)||0);
      return String(a.coach||'').localeCompare(String(b.coach||''),'zh-Hans-CN');
    });
}
function renderFinanceSettlementSummary(){
  const host=document.getElementById('financeSettlementStats');
  const body=document.getElementById('financeSettlementTbody');
  if(!host||!body)return;
  const rows=financeSettlementRows().filter(row=>financeSettlementMonthWithinGlobalRange(row.month));
  const coachCount=new Set(rows.map(row=>row.coach)).size;
  const totalLessons=rows.reduce((sum,row)=>sum+(Number(row.lessonUnits)||0),0);
  const totalLateCount=rows.reduce((sum,row)=>sum+(Number(row.lateCount)||0),0);
  const totalLateFee=rows.reduce((sum,row)=>sum+(Number(row.lateFeeAmount)||0),0);
  host.innerHTML=[
    ['结算教练数',coachCount,'人'],
    ['已完成课时数',lessonUnitsText(totalLessons),'节'],
    ['迟到记录',totalLateCount,'条'],
    ['承担场地费',`¥${fmt(totalLateFee)}`,'']
  ].map(([label,val,unit])=>`<div class="tms-stat-card"><div class="tms-stat-label">${label}</div><div class="tms-stat-value">${val}${unit?`<span>${unit}</span>`:''}</div></div>`).join('');
  body.innerHTML=rows.length?rows.map(row=>`<tr><td style="padding-left:20px">${renderStandardCellText(row.coach,false)}</td><td>${renderStandardCellText(row.campusName,false)}</td><td>${renderStandardCellText(`${lessonUnitsText(row.lessonUnits)} 节`,false)}</td><td>${renderStandardCellText(`${row.lateCount} 条`,false)}</td><td>${financeAmountText(row.lateFeeAmount)}</td></tr>`).join(''):`<tr><td colspan="5"><div class="empty"><p>当前月份暂无教练结算记录</p></div></td></tr>`;
}
