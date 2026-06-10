// ===== 教练运营 =====
let coachOpsDraggedName='';
const COACH_OPS_COACH_FILTER_KEY='ft_coach_ops_coach_filter';
let coachOpsSelectedCoach=localStorage.getItem(COACH_OPS_COACH_FILTER_KEY)||'';
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
function renderFinanceLedgerPageSizeFilter(){
  const host=document.getElementById('financeLedgerPageSize');
  if(!host)return;
  host.innerHTML=renderPageSizeSelectorHtml('financeLedgerPageSizeValue',financeLedgerPageSize,'setFinanceLedgerPageSize');
}
function setFinanceLedgerPageSize(value){
  financeLedgerPageSize=parseInt(value,10)||20;
  financeLedgerPage=1;
  renderFinanceLedger();
}
function setFinanceLedgerPage(page){
  financeLedgerPage=Math.max(1,parseInt(page,10)||1);
  renderFinanceLedger();
}
function resetFinanceLedgerPage(){
  financeLedgerPage=1;
}
function financeLedgerExactTimeText(row){
  const businessDate=String(row?.businessDate||'').trim().replace('T',' ');
  if(/\d{4}-\d{2}-\d{2}\s+\d{2}:\d{2}:\d{2}/.test(businessDate))return businessDate.slice(11,19);
  if(/\d{4}-\d{2}-\d{2}\s+\d{2}:\d{2}/.test(businessDate))return `${businessDate.slice(11,16)}:00`;
  return '00:00:00';
}
function financeDateTimeDisplayText(row){
  const businessDate=String(row?.businessDate||'').trim().replace('T',' ');
  if(!businessDate)return '-';
  if(/\d{4}-\d{2}-\d{2}\s+\d{2}:\d{2}:\d{2}/.test(businessDate))return businessDate.slice(0,19);
  if(/\d{4}-\d{2}-\d{2}\s+\d{2}:\d{2}/.test(businessDate))return `${businessDate.slice(0,16)}:00`;
  return businessDate.slice(0,10);
}
function financeOperatorDisplayText(row){
  const collector=String(row?.collector||row?.operator||'').trim();
  const importHint=String(row?.importSource||'').trim()==='系统导入'||/导入/.test(`${row?.sourceProject||''} ${row?.notes||''} ${row?.sourceDocument||''}`);
  if(importHint)return '系统导入';
  if(collector&&collector!=='系统记录')return collector;
  return '-';
}
function financeLedgerSortKey(row){
  return `${String(row?.businessDate||'').slice(0,10)} ${financeLedgerExactTimeText(row)}`;
}
function financeLedgerPageNumbers(page,pages){
  return financeRevenuePageNumbers(page,pages);
}
function jumpFinanceLedgerPage(value){
  const total=financeLedgerRows().length;
  const pages=Math.max(1,Math.ceil(total/financeLedgerPageSize));
  financeLedgerPage=Math.min(pages,Math.max(1,parseInt(value,10)||1));
  renderFinanceLedger();
}
function renderFinanceRevenuePageSizeFilter(){
  const host=document.getElementById('financeRevenuePageSize');
  if(!host)return;
  host.innerHTML=renderPageSizeSelectorHtml('financeRevenuePageSizeValue',financeRevenuePageSize,'setFinanceRevenuePageSize');
}
function setFinanceRevenuePageSize(value){
  const next=parseInt(value,10);
  financeRevenuePageSize=[20,50,100].includes(next)?next:20;
  financeRevenuePage=1;
  renderFinanceRevenueReport();
}
function setFinanceRevenuePage(page){
  financeRevenuePage=Math.max(1,parseInt(page,10)||1);
  renderFinanceRevenueReport();
}
function resetFinanceRevenuePage(){
  financeRevenuePage=1;
}
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
function setCoachOpsMode(mode){
  const d=coachOpsDateInput();
  const base=mode==='day'&&d?.dataset?.coachOpsAutoDate==='1'?new Date():coachOpsInputDate();
  coachOpsMode=['day','week','month'].includes(mode)?mode:'day';
  if(d)d.value=coachOpsInputValue(base,coachOpsMode);
  closeCoachOpsPicker();
  renderCoachOps();
}
function setCoachOpsToday(){const el=coachOpsDateInput();if(el){el.value=coachOpsInputValue(new Date(),coachOpsMode);delete el.dataset.coachOpsAutoDate;}renderCoachOps();}
function shiftCoachOpsDate(step){
  const el=coachOpsDateInput();if(!el)return;
  const mode=coachOpsMode;
  const base=coachOpsInputDate();
  if(mode==='month')el.value=coachOpsInputValue(addMonths(base,step),mode);
  else if(mode==='week')el.value=coachOpsInputValue(addDays(base,step*7),mode);
  else el.value=dateKey(addDays(base,step));
  delete el.dataset.coachOpsAutoDate;
  renderCoachOps();
}
function openCoachOpsDay(ds){coachOpsMode='day';const d=coachOpsDateInput();if(d){d.value=ds;delete d.dataset.coachOpsAutoDate;}renderCoachOps();}
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
function openCoachOpsCreateSchedule(coach,date,startTime='09:00'){
  const h=Math.min(22,parseInt(startTime.slice(0,2))||9),m=startTime.slice(3,5)||'00';
  const endH=Math.min(23,h+1);
  const co=coaches.find(c=>coachName(c.name)===coachName(coach));
  openScheduleModal(null,{startTime:`${date} ${String(h).padStart(2,'0')}:${m}`,endTime:`${date} ${String(endH).padStart(2,'0')}:${m}`,coach:coachName(coach),campus:campus==='all'?(co?.campus||''):campus,venue:'1号场',lessonCount:1,status:'已排课',scheduleSource:'教练运营'});
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
  return String(s?.campus||'').trim()===campus;
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
  const coachIcon=typeof courtTopCoachIcon==='function'?courtTopCoachIcon():courtTopLocationIcon();
  return `<div class="court-top-filterbar"><div class="court-top-filter-item">${renderCourtTopDropdown('coachOpsTopCampus',campusOpts.find(opt=>opt.value===campus)?.label||'全部校区',courtTopLocationIcon(),campusMenu,'court-top-campus-menu')}</div><div class="court-top-filter-item">${renderCourtTopDropdown('coachOpsCoachFilter',coachLabel,coachIcon,coachMenu,'court-top-campus-menu')}</div></div>`;
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
  closeCourtTopDropdowns();
}
function selectCoachOpsCoachFilter(value,event){
  if(event)event.stopPropagation();
  coachOpsSelectedCoach=value||'';
  if(coachOpsSelectedCoach)localStorage.setItem(COACH_OPS_COACH_FILTER_KEY,coachOpsSelectedCoach);
  else localStorage.removeItem(COACH_OPS_COACH_FILTER_KEY);
  refreshCoachOpsTopFilters();
  renderCoachOps();
  closeCourtTopDropdowns();
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
  setCourtModalFrame('当天排课',body,'<button class="tms-btn tms-btn-default" onclick="closeModal()">关闭</button>','modal-tight');
}
function openCoachOpsMorePopover(el,coach,date,event){
  if(event)event.stopPropagation();
  document.querySelectorAll('.coach-ops-more-popover,.coach-ops-more-overlay').forEach(node=>node.remove());
  const rows=billableSchedules()
    .filter(s=>coachOpsCampusMatchesSchedule(s)&&coachName(s.coach)===coachName(coach)&&String(s.startTime||'').slice(0,10)===date)
    .sort((a,b)=>String(a.startTime).localeCompare(String(b.startTime)));
  const overlay=document.createElement('div');
  overlay.className='coach-ops-more-overlay';
  overlay.onclick=function(){document.querySelectorAll('.coach-ops-more-popover,.coach-ops-more-overlay').forEach(node=>node.remove());};
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
function openCoachOpsLineCreate(e,coach,date){
  if(e.target.closest('.coach-ops-block'))return;
  const rect=e.currentTarget.getBoundingClientRect();
  const pct=Math.max(0,Math.min(1,(e.clientX-rect.left)/rect.width));
  const minutes=Math.round((pct*(22-7)*60)/30)*30;
  const h=Math.min(22,7+Math.floor(minutes/60)),m=minutes%60;
  openCoachOpsCreateSchedule(coach,date,`${String(h).padStart(2,'0')}:${String(m).padStart(2,'0')}`);
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
    renderCoachOps();
    toast('教练排序已保存','success');
  }catch(err){
    toast('保存教练排序失败：'+err.message,'error');
    loadData(false).then(()=>(currentPage==='coachschedule'||currentPage==='coachops')&&renderCoachOps()).catch(()=>null);
  }
}
function coachOpsStudentKeys(s){
  const ids=[...parseArr(s.studentIds),s.studentId].map(v=>String(v||'').trim()).filter(Boolean);
  if(ids.length)return ids.map(id=>`id:${id}`);
  return String(s.studentName||'').split(/[、,，\s/]+/).map(v=>v.trim()).filter(Boolean).map(name=>`name:${name}`);
}
function purchaseMatchesCoachTrialStudent(p,key){
  if(key.startsWith('id:'))return String(p.studentId||'').trim()===key.slice(3);
  return String(p.studentName||'').trim()===key.slice(5);
}
function coachTrialConversionText(coach,rows){
  const coachKey=coachName(coach);
  const trialMap=new Map();
  rows.filter(s=>scheduleIsTrial(s)&&effectiveScheduleStatus(s)==='已结束').forEach(s=>{
    coachOpsStudentKeys(s).forEach(key=>{
      const date=String(s.startTime||'').slice(0,10);
      if(key&&!trialMap.has(key))trialMap.set(key,date);
    });
  });
  const total=trialMap.size;
  if(!total)return '-%';
  const converted=[...trialMap.entries()].filter(([key,trialDate])=>purchases.some(p=>{
    if(!purchaseMatchesCoachTrialStudent(p,key))return false;
    if(coachName(p.ownerCoach)!==coachKey)return false;
    if(['voided','refunded'].includes(String(p.status||'')))return false;
    const purchaseDate=String(p.purchaseDate||p.createdAt||'').slice(0,10);
    return !trialDate||!purchaseDate||purchaseDate>=trialDate;
  })).length;
  const percent=converted/total*100;
  const rate=Number.isInteger(percent)?percent:percent.toFixed(1);
  return `${converted}/${total} <span class="coach-workload-rate ${converted>=total?'up':converted>0?'up':'down'}">${rate}%</span>`;
}
function coachCourseTypeDistributionText(rows){
  const map=new Map();
  rows.forEach(s=>{
    const type=scheduleCourseType(s)||'未分类';
    map.set(type,(map.get(type)||0)+scheduleLessonUnits(s));
  });
  return [...map.entries()].sort((a,b)=>b[1]-a[1]).map(([type,count])=>`${type} ${lessonUnitsText(count)}`).join('｜')||'-';
}
function coachOpsHomeCampusCoachNames(){
  if(campus==='all')return activeCoachNames();
  return [...new Set(coaches.filter(c=>c.status==='active'&&String(c.campus||'').trim()===campus).map(c=>coachName(c.name)).filter(Boolean))];
}
function coachOpsComparisonText(coach,currentRows,range){
  const current=sumScheduleLessonUnits(currentRows);
  const span=range.end.getTime()-range.start.getTime();
  const prevStart=new Date(range.start.getTime()-span);
  const prevRows=billableSchedules().filter(s=>coachOpsCampusMatchesSchedule(s)&&coachName(s.coach)===coachName(coach)&&inRange(s.startTime,prevStart,range.start));
  const previous=sumScheduleLessonUnits(prevRows);
  if(!previous)return current?'<span class="coach-workload-compare up">新增</span>':'<span class="coach-workload-compare">-%</span>';
  const pct=(current-previous)/previous*100;
  const cls=pct>0?'up':pct<0?'down':'';
  return `<span class="coach-workload-compare ${cls}">${pct>0?'+':''}${pct.toFixed(2)}%</span>`;
}
function coachOpsRows(){
  const now=new Date(),todayStr=today();
  const ws=weekStart(now),we=new Date(ws);we.setDate(ws.getDate()+7);
  const ms=monthStart(now),me=new Date(now.getFullYear(),now.getMonth()+1,1);
  const range=rangeBounds(coachOpsMode);
  const all=billableSchedules().filter(coachOpsCampusMatchesSchedule);
  const currentRangeRows=all.filter(s=>inRange(s.startTime,range.start,range.end));
  const rangeScheduleCoachNames=currentRangeRows.map(s=>coachName(s.coach)).filter(Boolean);
  const nameSource=campus==='all'?[...activeCoachNames(),...all.map(s=>coachName(s.coach)).filter(Boolean)]:[...coachOpsHomeCampusCoachNames(),...rangeScheduleCoachNames];
  const names=[...new Set(nameSource)]
    .filter(name=>!coachOpsSelectedCoach||coachName(name)===coachName(coachOpsSelectedCoach))
    .sort((a,b)=>coachSortValue(a)-coachSortValue(b)||String(a).localeCompare(String(b),'zh-Hans-CN'));
  return names.map(name=>{
    const mine=all.filter(s=>coachName(s.coach)===name);
    const todayRows=mine.filter(s=>s.startTime.slice(0,10)===todayStr);
    const weekRows=mine.filter(s=>inRange(s.startTime,ws,we));
    const monthRows=mine.filter(s=>inRange(s.startTime,ms,me));
    const rangeRows=mine.filter(s=>inRange(s.startTime,range.start,range.end));
    const campusMap={};
    rangeRows.forEach(s=>{if(s.campus)campusMap[s.campus]=(campusMap[s.campus]||0)+1});
    const mainCampus=Object.entries(campusMap).sort((a,b)=>b[1]-a[1])[0]?.[0]||'';
    const completedRows=rangeRows.filter(s=>effectiveScheduleStatus(s)==='已结束');
    return {name,todayRows,weekRows,monthRows,rangeRows,mainCampus,pending:pendingFeedbackCount(rangeRows),feedback:completedRows.filter(hasScheduleFeedback).length,conflicts:coachOverlapCount(rangeRows),sortOrder:coachSortValue(name)};
  });
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
function renderCoachOps(){
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
  const nowLineLeft=showNowLine?nowMinutes/60*120:0;
  const nowLineHtml=showNowLine?`<span class="coach-ops-now-line" style="left:${nowLineLeft}px"></span>`:'';
  const nowHeadHtml=showNowLine?`<span class="coach-ops-now-head" style="left:${nowLineLeft}px"><i>${String(nowForGrid.getHours()).padStart(2,'0')}:${String(nowForGrid.getMinutes()).padStart(2,'0')}</i><b></b></span>`:'';
  const gridCard=document.querySelector('#page-coachschedule .coach-ops-grid-card');
  if(gridCard){
    gridCard.classList.toggle('mode-day',mode==='day');
    gridCard.classList.toggle('mode-week',mode==='week');
    gridCard.classList.toggle('mode-month',mode==='month');
  }
  const hourHost=document.getElementById('coachOpsHours');
  const opsStartH=7,opsEndH=22,opsTotalMin=(opsEndH-opsStartH)*60;
  if(hourHost){
    hourHost.classList.toggle('week',mode==='week'||mode==='month');
    hourHost.innerHTML=mode==='day'
      ?Array.from({length:opsEndH-opsStartH+1},(_,i)=>`<span>${i+opsStartH}:00</span>`).join('')+nowHeadHtml
      :mode==='week'
        ?Array.from({length:7},(_,i)=>{const d=addDays(range.start,i),ds=dateKey(d);return `<span class="${ds===todayKey?'is-today':''}">周${'一二三四五六日'[i]} ${d.getMonth()+1}/${d.getDate()}</span>`;}).join('')
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
  const rows=coachOpsRows();
  if(gridCard){
    gridCard.classList.toggle('is-compact',rows.length>0&&rows.length<=3);
    gridCard.classList.remove('is-loading');
  }
  const corner=document.querySelector('#page-coachschedule .coach-ops-corner');
  if(corner)corner.textContent='教练';
  const host=document.getElementById('coachOpsTimeline');
  if(host){
    const renderRows=rows;
    host.classList.toggle('is-skeleton',false);
    if(!renderRows.length){
      const emptyText=campus==='all'?'当前日期暂无教练排课':'当前筛选无教练排课';
      host.innerHTML=`<div class="coach-ops-empty-state"><strong>${emptyText}</strong><span>不是加载中，可切换校区或日期查看</span></div>`;
    }else{
      host.innerHTML=renderRows.map(r=>{
      const dragAttrs=`draggable="true" ondragstart="coachOpsDragStart(event,${jsArg(r.name)})" ondragover="coachOpsDragOver(event)" ondrop="coachOpsDrop(event,${jsArg(r.name)})"`;
      if(r.skeleton){
        const cells=mode==='day'
          ?`<div class="coach-ops-line coach-ops-skeleton-line"><span></span><span></span></div>`
          :`<div class="coach-ops-period-line ${mode==='week'?'coach-ops-week':'coach-ops-month'}">${Array.from({length:7},(_,i)=>`<div class="coach-ops-daycell skeleton-cell"><span></span>${i<3?'<i></i>':''}</div>`).join('')}</div>`;
        return `<div class="coach-ops-row coach-ops-skeleton-row"><div class="coach-ops-name"><span class="coach-ops-skeleton-dot"></span><span></span></div>${cells}</div>`;
      }
      if(mode==='day'){
        const base=new Date(range.start);base.setHours(opsStartH,0,0,0);
        const blocks=r.rangeRows.sort((a,b)=>String(a.startTime).localeCompare(String(b.startTime))).map(s=>{
          const startMin=(dateMs(s.startTime)-base.getTime())/60000;
          const endMs=Number.isFinite(dateMs(s.endTime))?dateMs(s.endTime):dateMs(s.startTime)+60*60000;
          const endMin=(endMs-base.getTime())/60000;
          const left=Math.max(0,startMin/60*120);
          const width=Math.max(24,(Math.min(opsTotalMin,endMin)-Math.max(0,startMin))/60*120);
          return `<div class="coach-ops-block ${coachOpsCourseTypeTagClass(scheduleCourseType(s))}" style="left:${left+2}px;width:${Math.min(width-4,1920-left-4)}px" onclick="event.stopPropagation();openScheduleDetail('${s.id}')"><div class="coach-ops-time"><span class="coach-ops-card-dot"></span>${s.startTime.slice(11,16)}${s.endTime?' - '+s.endTime.slice(11,16):''}</div><div class="coach-ops-student">${esc(coachOpsScheduleStudentTitle(s))}</div><div class="coach-ops-location">${esc(scheduleLocationText(s))}</div></div>`;
        }).join('');
        return `<div class="coach-ops-row" ${dragAttrs}><div class="coach-ops-name">${coachOpsDragIconHtml()}<span>${esc(r.name)}</span></div><div class="coach-ops-line ${dayIsToday?'is-today':''}" onclick="openCoachOpsLineCreate(event,${jsArg(r.name)},'${dateKey(range.start)}')">${nowLineHtml}${blocks||'<span class="coach-ops-empty">当日暂无课程</span>'}</div></div>`;
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
  const workloadBody=document.getElementById('coachOpsTbody');
  if(workloadBody)workloadBody.innerHTML=rows.map(r=>`<tr><td class="tms-sticky-l" style="padding-left:20px"><div class="tms-text-primary">${esc(r.name)}</div></td><td><div class="coach-workload-lessons">${lessonUnitsText(sumScheduleLessonUnits(r.rangeRows))}<span>节</span>${coachOpsComparisonText(r.name,r.rangeRows,range)}</div></td><td>${coachTrialConversionText(r.name,r.rangeRows)}</td><td><div class="tms-text-remark coach-workload-course-types coach-workload-wrap" title="${esc(coachCourseTypeDistributionText(r.rangeRows))}">${esc(coachCourseTypeDistributionText(r.rangeRows))}</div></td><td><span class="coach-workload-count">${r.feedback}</span></td><td><span class="coach-workload-count">${r.pending}</span></td><td><div class="coach-workload-wrap coach-workload-campus">${distText(r.rangeRows,s=>isExternalSchedule(s)?(s.externalVenueName||'外部场馆'):cn(s.campus))}</div></td><td><div class="coach-workload-wrap coach-workload-timeband">${distText(r.rangeRows,timeBand)}</div></td></tr>`).join('');
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
  const studentCampus=(students.find(s=>s.id===purchase.studentId)||{}).campus||'';
  return financeCampusNameFromValue(entitlementCampus||purchase.campus||studentCampus);
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
    if(value==='散客订场'||value==='约球局')return 'tms-tag-tier-blue';
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
    return ['课程','会员储值','散客订场','约球局'].includes(row.businessType);
  }).map(row=>{
    const actualAmount=Math.max(0,Number(row.cashDelta)||0);
    const receivableAmount=['散客订场','约球局'].includes(row.businessType)?actualAmount:Math.max(actualAmount,Number(row.deferredRevenueDelta)||0);
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
function renderFinanceRevenueFilterDropdowns(baseRows){
  const typeHost=document.getElementById('financeRevenueTypeFilterHost');
  const payMethodHost=document.getElementById('financeRevenuePayMethodFilterHost');
  if(!typeHost||!payMethodHost)return;
  const currentType=String(document.getElementById('financeRevenueTypeFilter')?.value||'').trim();
  const currentPayMethod=String(document.getElementById('financeRevenuePayMethodFilter')?.value||'').trim();
  const typeOptions=[{ value:'', label:'全部业务类型' },...Array.from(new Set((baseRows||[]).map(row=>row.businessType).filter(Boolean))).sort((a,b)=>String(a).localeCompare(String(b),'zh-Hans-CN')).map(item=>({ value:item, label:item }))];
  const payMethodOptions=[{ value:'', label:'全部支付方式' },...Array.from(new Set((baseRows||[]).map(row=>row.payMethod||'—').filter(Boolean))).sort((a,b)=>String(a).localeCompare(String(b),'zh-Hans-CN')).map(item=>({ value:item, label:item }))];
  const selectedType=typeOptions.some(item=>item.value===currentType)?currentType:'';
  const selectedPayMethod=payMethodOptions.some(item=>item.value===currentPayMethod)?currentPayMethod:'';
  typeHost.innerHTML=renderStandardDropdownHtml('financeRevenueTypeFilter','全部业务类型',typeOptions,selectedType,false,'renderFinanceRevenueFilterChange');
  payMethodHost.innerHTML=renderStandardDropdownHtml('financeRevenuePayMethodFilter','全部支付方式',payMethodOptions,selectedPayMethod,false,'renderFinanceRevenueFilterChange');
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
  const text=base?`${Math.round((Number(numerator||0)/base)*1000)/10}%`:'0.0%';
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
function financeStatCardHtml({label,value,caption='',split=false}){
  return `<div class="tms-stat-card"><div class="tms-stat-label">${label}</div><div class="tms-stat-value${split?' finance-split-value':''}">${value}</div>${caption?`<div class="tms-stat-sub">${caption}</div>`:''}</div>`;
}
function financeRowsSum(rows,field){
  return Math.round((rows||[]).reduce((total,row)=>total+(Number(row?.[field])||0),0)*100)/100;
}
function financeCurrentMetrics(rows=financeLedgerRows()){
  const businessRows=(rows||[]).filter(row=>!row.differenceReason&&row.transactionType!=='废弃');
  const courseRows=businessRows.filter(row=>row.businessTypeLevel1==='课程'||row.businessType==='课程');
  const directCourseRows=courseRows.filter(row=>row.transactionType==='收款'&&String(row.sourceDocument||'').startsWith('排课'));
  const directCourseRecognizedRows=courseRows.filter(row=>String(row.sourceDocument||'').startsWith('排课')&&Number(row.recognizedRevenueDelta));
  const packageReceiptRows=courseRows.filter(row=>row.transactionType==='收款'&&String(row.sourceDocument||'').startsWith('购买记录'));
  const packageRecognizedRows=courseRows.filter(row=>row.transactionType==='消耗'&&String(row.normalizedPaymentMethod||row.paymentChannel||'')==='课包划扣');
  const storedValueRows=businessRows.filter(row=>row.businessTypeLevel1==='储值'||row.businessType==='会员储值');
  const storedValueConsumedRows=businessRows.filter(row=>(row.businessTypeLevel1==='场地'&&row.businessTypeLevel2==='会员订场')||row.businessType==='会员订场');
  const bookingRows=businessRows.filter(row=>(row.businessTypeLevel1==='场地'&&['散客订场','约球局','课程订场'].includes(row.businessTypeLevel2))||['散客订场','约球局'].includes(row.businessType));
  const directCourseIncome=financeRowsSum(directCourseRows,'cashDelta');
  const directCourseRecognized=financeRowsSum(directCourseRecognizedRows,'recognizedRevenueDelta')||financeRowsSum(directCourseRows,'recognizedRevenueDelta');
  const packageIncome=financeRowsSum(packageReceiptRows,'cashDelta');
  const packageRecognized=financeRowsSum(packageRecognizedRows,'recognizedRevenueDelta');
  const courseIncome=directCourseIncome+packageIncome;
  const courseRecognized=directCourseRecognized+packageRecognized;
  const storedValueIncome=financeRowsSum(storedValueRows.filter(row=>row.transactionType==='收款'||row.action==='收款'),'cashDelta');
  const storedValueRecognized=financeRowsSum(storedValueConsumedRows,'recognizedRevenueDelta');
  const bookingIncome=financeRowsSum(bookingRows.filter(row=>row.transactionType==='收款'||row.action==='收款'),'cashDelta');
  const bookingRecognized=financeRowsSum(bookingRows,'recognizedRevenueDelta')||bookingIncome;
  const totalCash=directCourseIncome+packageIncome+storedValueIncome+bookingIncome;
  const totalRecognized=directCourseRecognized+packageRecognized+storedValueRecognized+bookingRecognized;
  return {businessRows,directCourseIncome,directCourseRecognized,packageIncome,packageRecognized,courseIncome,courseRecognized,storedValueIncome,storedValueRecognized,bookingIncome,bookingRecognized,totalCash,totalRecognized};
}
function financeCoursePackageMetrics(rows=[],overview=null){
  const businessRows=(rows||[]).filter(row=>!row.differenceReason);
  const courseRows=businessRows.filter(row=>row.businessType==='课程'||row.sourceBusinessCategory==='课程');
  if(courseRows.length){
    const packageReceiptRows=courseRows.filter(row=>row.action==='收款'&&String(row.sourceDocument||row.relatedDocument||'').startsWith('购买记录'));
    const packageRecognizedRows=courseRows.filter(row=>['消耗','回退','已入账'].includes(row.action)&&String(row.paymentChannel||row.payMethod||'')==='课包划扣');
    const directRows=courseRows.filter(row=>row.action==='收款'&&String(row.sourceDocument||row.relatedDocument||'').startsWith('排课'));
    const sum=(list,field)=>Math.round(list.reduce((total,row)=>total+(Number(row[field])||0),0)*100)/100;
    const packageIncome=sum(packageReceiptRows,'cashDelta')||sum(packageReceiptRows,'actualAmount');
    const packageRecognized=sum(packageRecognizedRows,'recognizedRevenueDelta');
    const directIncome=sum(directRows,'cashDelta')||sum(directRows,'actualAmount');
    const directRecognized=sum(directRows,'recognizedRevenueDelta');
    return {
      courseIncome:sum(courseRows,'cashDelta')||sum(courseRows,'actualAmount'),
      courseRecognized:sum(courseRows,'recognizedRevenueDelta'),
      packageIncome,
      packageRecognized,
      packageDeferred:Math.round((packageIncome-packageRecognized)*100)/100,
      directIncome,
      directRecognized
    };
  }
  const packageIncome=Number(overview?.packageIncome||0);
  const packageRecognized=Number(overview?.packageRecognized||0);
  const courseIncome=Number(overview?.courseIncome||overview?.packageIncome||0);
  const courseRecognized=Number(overview?.courseRecognized||overview?.packageRecognized||0);
  const directCourseIncome=Number(overview?.directCourseIncome)||Math.max(0,courseIncome-packageIncome);
  const directCourseRecognized=Number(overview?.directCourseRecognized)||Math.max(0,courseRecognized-packageRecognized);
  return {
    courseIncome,
    courseRecognized,
    packageIncome,
    packageRecognized,
    packageDeferred:Math.round((packageIncome-packageRecognized)*100)/100,
    directIncome:directCourseIncome,
    directRecognized:directCourseRecognized
  };
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
  if(['会员订场','散客订场','约球局'].includes(value))return '订场';
  return value||'其他';
}
function financeUnifiedRevenueType(row){
  const businessType=String(row?.businessType||'').trim();
  if(businessType==='课程')return row.incomeType||'课包购买';
  if(businessType==='会员储值')return '会员储值';
  if(businessType==='会员订场')return '会员订场';
  if(businessType==='约球局')return '约球局';
  if(businessType==='散客订场')return '散客订场';
  if(businessType==='差异项')return row.incomeType||'差异项';
  return row.incomeType||businessType||'其他';
}
function financeUnifiedSourceProject(row){
  if(row.sourceProject)return row.sourceProject;
  if(row.businessType==='课程')return row.incomeType||'课包购买';
  if(row.businessType==='会员储值')return '会员充值';
  if(['会员订场','散客订场','约球局'].includes(row.businessType))return row.incomeType||row.businessType;
  return row.businessType||'其他';
}
function financeUnifiedDebitTarget(row){
  if(row.debitTarget)return row.debitTarget;
  if(row.businessType==='课程')return row.packageName||row.incomeType||'课包';
  if(row.businessType==='会员储值')return '会员储值余额';
  if(row.businessType==='会员订场')return '会员储值余额';
  if(['散客订场','约球局'].includes(row.businessType))return '现场收款';
  return row.paymentChannel||'—';
}
function financeRecognizedAmountForConsumeRow(row,entitlement,purchase){
  const lessonDelta=Math.abs(Number(row.lessonDelta)||0);
  const totalLessons=Math.max(1,Number(entitlement?.totalLessons)||Number(purchase?.packageLessons)||lessonDelta||1);
  const amountPaid=Number(purchase?.amountPaid)||0;
  if(!amountPaid||!lessonDelta)return 0;
  return Math.round((amountPaid/totalLessons)*lessonDelta*100)/100;
}
function financeCourseRevenueRows(){
  return purchases.map(p=>{
    const ent=entitlements.find(e=>e.purchaseId===p.id)||{};
    const campusName=financeCampusNameForPurchase(p,ent);
    if(!financeMatchesCampusName(campusName))return null;
    const total=Number(ent.totalLessons)||Number(p.packageLessons)||0;
    const remaining=Number(ent.remainingLessons)||0;
    const used=Math.max(0,total-remaining);
    const receivable=Number(p.packagePrice)||Number(p.amountPaid)||0;
    const actual=Number(p.amountPaid)||0;
    return {
      ...p,
      revenueCategory:'课程',
      entitlement:ent,
      totalLessons:total,
      usedLessons:used,
      remainingLessons:remaining,
      campusName,
      purchaseDate:p.purchaseDate||String(p.createdAt||'').slice(0,10),
      weekdayText:financeWeekdayText(p.purchaseDate||p.createdAt),
      timeText:'—',
      incomeType:p.packageName||p.productName||'课包购买',
      payMethod:p.payMethod||'—',
      receivableAmount:receivable,
      actualAmount:actual,
      priceDiff:Math.round((receivable-actual)*100)/100,
      priceDiffReason:p.priceDiffReason||p.discountReason||'—',
      collector:p.operator||coachName(p.ownerCoach)||'—',
      systemStatus:purchaseStatusText(p),
      relatedDocument:`购买记录 ${p.id}`,
      notes:p.notes||''
    };
  }).filter(Boolean);
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
        : ((businessType==='会员订场'||businessType==='散客订场'||businessType==='约球局')?businessType:(h.category||'课程收入'));
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
      if(!['会员订场','散客订场','约球局'].includes(businessType))return [];
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
function financeRevenuePageNumbers(page,pages){
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
function jumpFinanceRevenuePage(value){
  const total=financeRevenueRows().length;
  const pages=Math.max(1,Math.ceil(total/financeRevenuePageSize));
  financeRevenuePage=Math.min(pages,Math.max(1,parseInt(value,10)||1));
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
  const total=rows.length;
  const pages=Math.max(1,Math.ceil(total/financeRevenuePageSize));
  if(financeRevenuePage>pages)financeRevenuePage=pages;
  const slice=rows.slice((financeRevenuePage-1)*financeRevenuePageSize,financeRevenuePage*financeRevenuePageSize);
  renderFinanceRevenuePager(total,pages);
  const businessRows=rows.filter(row=>!row.differenceReason);
  const totalIncome=businessRows.reduce((sum,row)=>sum+(Number(row.actualAmount)||0),0);
  const directCourseIncome=businessRows.filter(row=>row.sourceBusinessCategory==='课程'&&String(row.relatedDocument||'').startsWith('排课')).reduce((sum,row)=>sum+(Number(row.actualAmount)||0),0);
  const packageIncome=businessRows.filter(row=>row.sourceBusinessCategory==='课程'&&String(row.relatedDocument||'').startsWith('购买记录')).reduce((sum,row)=>sum+(Number(row.actualAmount)||0),0);
  const courseIncome=directCourseIncome+packageIncome;
  const bookingIncome=businessRows.filter(row=>['会员订场','散客订场','约球局'].includes(row.sourceBusinessCategory)).reduce((sum,row)=>sum+(Number(row.actualAmount)||0),0);
  const storedValueIncome=businessRows.filter(row=>row.sourceBusinessCategory==='会员储值').reduce((sum,row)=>sum+(Number(row.actualAmount)||0),0);
  stats.innerHTML=[
    {label:'成交笔数',value:`${rows.length} <span>笔</span>`},
    {label:'实收合计',value:financeCardMoney(totalIncome)},
    {label:'会员储值',value:financeInlineMoneyWithPercent(storedValueIncome,totalIncome)},
    {label:'散客订场',value:financeInlineMoneyWithPercent(bookingIncome,totalIncome)},
    {label:'课程流水',value:financeInlineMoneyWithPercent(courseIncome,totalIncome)}
  ].map(financeStatCardHtml).join('');
  body.innerHTML=slice.length?slice.map(row=>`<tr><td style="padding-left:20px">${renderStandardCellText(row.purchaseDate,false)}</td><td>${renderStandardCellText(row.weekdayText,false)}</td><td>${renderStandardCellText(row.timeText,false)}</td><td>${renderStandardCellText(row.studentName,false)}</td><td>${renderStandardCellText(row.businessType,false)}</td><td>${renderStandardCellText(row.payMethod,false)}</td><td>${financeAmountText(row.receivableAmount)}</td><td>${financeAmountText(row.actualAmount)}</td><td>${financeSignedAmountText(row.priceDiff)}</td><td>${renderStandardCellText(row.priceDiffReason,false)}</td><td>${renderStandardCellText(row.collector,false)}</td><td><div class="tms-text-remark finance-revenue-remark" title="${esc(row.notes||'')}">${esc(renderStandardEmptyText(row.notes))}</div></td><td>${renderStandardCellText(row.campusName,false)}</td><td><span class="tms-tag ${row.status==='voided'?'tms-tag-tier-slate':'tms-tag-green'}">${esc(row.systemStatus)}</span></td></tr>`).join(''):`<tr><td colspan="14"><div class="tms-empty-state"><div class="tms-empty-title">暂无收入流水</div><div class="tms-empty-desc">调整搜索或筛选后再看</div></div></td></tr>`;
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
function financeConsumeRows(){
  return financeConsumeBaseRows(aggregateHistoricalMonthlyLedgerRows(dedupeEntitlementLedgerForDisplay(entitlementLedger))).filter(row=>{
    const q=String(document.getElementById('coachOpsConsumeSearch')?.value||'').trim().toLowerCase();
    if(!globalDateWithinRange(row.businessDate||row.relatedDate||row.createdAt))return false;
    return searchHit(q,row.reason,row.notes,row.operator,row.studentName,row.packageName,row.coach,row.courseType,row.campusName,row.sourceProject,row.debitTarget);
  }).sort((a,b)=>String(b.relatedDate||b.createdAt||'').localeCompare(String(a.relatedDate||a.createdAt||'')));
}
function renderFinanceConsumeReport(){
  const body=document.getElementById('financeConsumeTbody');
  const stats=document.getElementById('coachOpsConsumeStats');
  if(!body||!stats)return;
  const rows=financeRecognizedRows();
  const courseRows=rows.filter(row=>row.businessType==='课程');
  const storedValueRows=rows.filter(row=>row.businessType==='会员订场');
  const bookingRows=rows.filter(row=>['散客订场','约球局'].includes(row.businessType));
  const directCourseRows=courseRows.filter(row=>String(row.sourceDocument||'').startsWith('排课'));
  const packageRows=courseRows.filter(row=>String(row.paymentChannel||row.payMethod||'')==='课包划扣');
  const directCourseRecognized=directCourseRows.reduce((sum,row)=>sum+(Number(row.recognizedRevenueDelta)||0),0);
  const packageRecognized=packageRows.reduce((sum,row)=>sum+(Number(row.recognizedRevenueDelta)||0),0);
  const courseRecognized=directCourseRecognized+packageRecognized;
  const storedValueRecognized=storedValueRows.reduce((sum,row)=>sum+(Number(row.recognizedRevenueDelta)||0),0);
  const bookingRecognized=bookingRows.reduce((sum,row)=>sum+(Number(row.recognizedRevenueDelta)||0),0);
  const recognizedRevenue=directCourseRecognized+packageRecognized+storedValueRecognized+bookingRecognized;
  stats.innerHTML=[
    {label:'流水条数',value:`${rows.length} <span>条</span>`},
    {label:'确收合计',value:financeCardMoney(recognizedRevenue)},
    {label:'散客订场核销',value:financeInlineMoneyWithPercent(bookingRecognized,recognizedRevenue)},
    {label:'会员耗卡核销',value:financeInlineMoneyWithPercent(storedValueRecognized,recognizedRevenue)},
    {label:'课程已入账',value:financeInlineMoneyWithPercent(courseRecognized,recognizedRevenue)}
  ].map(financeStatCardHtml).join('');
  body.innerHTML=rows.length?rows.map(row=>`<tr><td style="padding-left:20px">${renderStandardCellText(row.businessDate,false)}</td><td>${renderStandardCellText(row.customer,false)}</td><td>${renderStandardCellText(row.confirmType,false)}</td><td>${renderStandardCellText(row.sourceProject,false)}</td><td>${renderStandardCellText(row.debitTarget,false)}</td><td>${financeSignedAmountText(row.recognizedRevenueDelta)}</td><td>${renderStandardCellText(row.campusName,false)}</td><td><span class="tms-tag ${Number(row.recognizedRevenueDelta||0)>=0?'tms-tag-green':'tms-tag-tier-slate'}">${esc(row.systemStatus||'已入账')}</span></td><td class="tms-sticky-r" style="padding-right:20px">${renderStandardCellText(row.sourceDocument,false)}</td></tr>`).join(''):`<tr><td colspan="9"><div class="empty"><p>暂无已入账流水</p></div></td></tr>`;
}
function renderCoachOpsConsumeReport(){
  return renderFinanceConsumeReport();
}
function exportCoachOpsRevenueCsv(){
  const rows=financeRevenueRows();
  let csv='日期,星期,时间,客户,收入类型,支付方式,应收,实收,差价,差价说明,收款人,备注,校区,系统状态\n';
  csv+=rows.map(row=>[row.purchaseDate||'',row.weekdayText||'',row.timeText||'',row.studentName||'',row.incomeType||'',row.payMethod||'',row.receivableAmount||0,row.actualAmount||0,row.priceDiff||0,'"'+String(row.priceDiffReason||'').replace(/"/g,'""')+'"','"'+String(row.collector||'').replace(/"/g,'""')+'"','"'+String(row.notes||'').replace(/"/g,'""')+'"',row.campusName||'',row.systemStatus||''].join(',')).join('\n');
  const blob=new Blob(['\ufeff'+csv],{type:'text/csv;charset=utf-8;'});
  const a=document.createElement('a');a.href=URL.createObjectURL(blob);a.download='FlowTennis_收入表_'+today()+'.csv';a.click();toast('导出成功','success');
}
function exportCoachOpsConsumeCsv(){
  const rows=financeRecognizedRows();
  let csv='确认日期,客户,确认类型,来源项目,扣减标的,确认收入,校区,系统状态,关联单据\n';
  csv+=rows.map(row=>[row.businessDate||'',row.customer||'',row.confirmType||'',row.sourceProject||'',row.debitTarget||'',row.recognizedRevenueDelta||0,row.campusName||'',row.systemStatus||'',row.sourceDocument||''].join(',')).join('\n');
  const blob=new Blob(['\ufeff'+csv],{type:'text/csv;charset=utf-8;'});
  const a=document.createElement('a');a.href=URL.createObjectURL(blob);a.download='FlowTennis_消耗表_'+today()+'.csv';a.click();toast('导出成功','success');
}
function financeStoredValueRows(){
  return courts.filter(court=>{
    const campusName=financeCampusNameFromValue(court.campus);
    if(!financeMatchesCampusName(campusName))return false;
    return courtFinanceLocal(court).balance>0;
  }).map(court=>{
    const finance=courtFinanceLocal(court);
    return {
      id:court.id,
      customer:courtDisplayName(court)||court.name||court.id,
      campusName:financeCampusNameFromValue(court.campus),
      deferredType:'会员储值待确认',
      deferredAmount:finance.balance,
      source:'订场账户',
      notes:'储值余额'
    };
  });
}
function financeLessonDeferredRows(){
  return financeRevenueRows().filter(row=>Number(row.remainingLessons)>0&&Number(row.totalLessons)>0&&Number(row.actualAmount)>0).map(row=>({
    id:row.id,
    customer:row.studentName||'—',
    campusName:row.campusName,
    deferredType:'课包待确认',
    deferredAmount:Math.round((Number(row.actualAmount)||0)*(Number(row.remainingLessons)||0)/Math.max(1,Number(row.totalLessons)||1)*100)/100,
    source:row.incomeType||'课包购买',
    notes:row.relatedDocument
  }));
}
function financePrepaidRows(){
  const rows=[...financeLessonDeferredRows(),...financeStoredValueRows()];
  const filteredRows=rows.filter(row=>{
    if(financePrepaidFilter==='lesson')return row.deferredType==='课包待确认';
    if(financePrepaidFilter==='stored')return row.deferredType==='会员储值待确认';
    return true;
  });
  return filteredRows.sort((a,b)=>Number(b.deferredAmount)-Number(a.deferredAmount));
}
function financeLegacyUnifiedRows(){
  if(Array.isArray(financialLedger)&&financialLedger.length){
    return financialLedger.filter(row=>String(row?.status||'active')!=='voided').map(row=>({
      id:`financial-ledger-${row.id}`,
      businessDate:String(row.businessDate||row.createdAt||'').slice(0,10),
      campusName:financeLedgerCampusName(row)||'—',
      customer:row.userName||'—',
      businessType:financeLedgerBusinessTypeFromRow(row),
      action:financeLedgerActionFromRow(row),
      cashDelta:Number(row.cashDelta||0)/100,
      recognizedRevenueDelta:Number(row.recognizedRevenueDelta||0)/100,
      deferredRevenueDelta:Number(row.deferredRevenueDelta||0)/100,
      paymentChannel:row.paymentChannel||'—',
      sourceDocument:`${row.productSnapshotName||row.ledgerType||'账本记录'} ${row.sourceId||row.id}`,
      notes:row.notes||row.reason||''
    })).filter(row=>financeMatchesCampusName(row.campusName));
  }
  const courseReceiptRows=financeCourseRevenueRows().map(row=>({
    id:`purchase-${row.id}`,
    businessDate:row.purchaseDate||String(row.createdAt||'').slice(0,10),
    campusName:row.campusName,
    customer:row.studentName||'—',
    businessType:'课程',
    action:'收款',
    cashDelta:Number(row.actualAmount)||0,
    recognizedRevenueDelta:0,
    deferredRevenueDelta:Number(row.actualAmount)||0,
    paymentChannel:row.payMethod||'—',
    sourceDocument:row.relatedDocument,
    notes:row.notes||''
  }));
  const courseConsumeRows=financeConsumeRows().map(row=>({
    id:`consume-${row.id}`,
    businessDate:String(row.relatedDate||row.createdAt||'').slice(0,10),
    campusName:row.campusName,
    customer:row.studentName||'—',
    businessType:'课程',
    action:row.actionLabel==='退回'?'回退':'消耗',
    cashDelta:0,
    recognizedRevenueDelta:(row.actionLabel==='退回'?-1:1)*(Number(row.recognizedAmount)||0),
    deferredRevenueDelta:(row.actionLabel==='退回'?1:-1)*(Number(row.recognizedAmount)||0),
    paymentChannel:'课包划扣',
    sourceDocument:row.relatedDocument,
    notes:row.reason||row.notes||''
  }));
  const courtRows=courts.flatMap(court=>{
    const campusName=financeCampusNameFromValue(court.campus);
    if(!financeMatchesCampusName(campusName))return [];
    return normalizeCourtHistoryLocal(court.history).filter(h=>!String(h.category||'').includes('内部占用')).map(h=>{
      const amount=Number(h.amount)||0;
      const businessType=financeCourtHistoryBusinessType(h);
      let cashDelta=0,recognizedRevenueDelta=0,deferredRevenueDelta=0;
      if(h.type==='充值'){cashDelta=amount;deferredRevenueDelta=amount;}
      if(h.type==='消费'&&h.payMethod==='储值扣款'){recognizedRevenueDelta=amount;deferredRevenueDelta=-amount;}
      if(h.type==='消费'&&h.payMethod!=='储值扣款'){cashDelta=amount;recognizedRevenueDelta=amount;}
      if(h.type==='退款'&&h.payMethod==='储值退款'){cashDelta=-amount;deferredRevenueDelta=-amount;}
      if(h.type==='退款'&&h.payMethod!=='储值退款'){cashDelta=-amount;recognizedRevenueDelta=-amount;}
      if(h.type==='冲正'&&h.payMethod==='储值扣款'){recognizedRevenueDelta=-amount;deferredRevenueDelta=amount;}
      if(h.type==='冲正'&&h.payMethod!=='储值扣款'){cashDelta=-amount;recognizedRevenueDelta=-amount;}
      if(h.type==='退款'&&h.payMethod==='储值退款'&&businessType==='会员储值'){recognizedRevenueDelta=0;}
      return {
        id:`court-${court.id}-${h.id||h.date||Math.random()}`,
        businessDate:h.date||'',
        campusName,
        customer:courtDisplayName(court)||court.name||court.id,
        businessType:businessType,
        action:h.type==='充值'?'收款':(h.type==='消费'?(h.payMethod==='储值扣款'?'已入账':'收款'):(h.type==='退款'?'退款':(h.type==='冲正'?'冲回':'记录'))),
        cashDelta,
        recognizedRevenueDelta,
        deferredRevenueDelta,
        paymentChannel:h.payMethod||'—',
        sourceDocument:`订场账户 ${court.id}`,
        notes:h.note||h.category||''
      };
    });
  });
  return [...courseReceiptRows,...courseConsumeRows,...courtRows];
}
function financeUnifiedRows(){
  const snapshotRows=financeNormalizedRows();
  if(loadedDatasets.has('financePage')){
    return snapshotRows.filter(row=>financeMatchesCampusName(row.campusName));
  }
  return financeLegacyUnifiedRows();
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
  return loadedDatasets.has('financialLedger')||loadedDatasets.has('financePage');
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
  const metrics=financeCurrentMetrics(financeLedgerRows());
  primaryHost.innerHTML=[
    {label:'总实收',value:financeCardMoney(metrics.totalCash)},
    {label:'总核销确收',value:`${financeCardMoney(metrics.totalRecognized)} <span class="tms-stat-percent finance-card-percent">${financePercent(metrics.totalRecognized,metrics.totalCash)}</span>`,caption:'总核销金额 / 总实收占比'},
    {label:'会员储值',value:`${financeInlineMoneyWithPercent(metrics.storedValueIncome,metrics.totalCash)} <span class="finance-split-sep">｜</span> ${financeInlineMoneyWithPercent(metrics.storedValueRecognized,metrics.totalRecognized)}`,caption:'会员实收 vs 会员已核销',split:true},
    {label:'散客订场',value:financeInlineMoneyWithPercent(metrics.bookingIncome,metrics.totalCash),caption:'散客订场/总实收比'},
    {label:'课程收入',value:`${financeInlineMoneyWithPercent(metrics.courseIncome,metrics.totalCash)} <span class="finance-split-sep">｜</span> ${financeInlineMoneyWithPercent(metrics.courseRecognized,metrics.totalRecognized)}`,caption:'课程实收 vs 课程已核销',split:true}
  ].map(financeStatCardHtml).join('');
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
  const businessValues=Array.from(new Set(visibleRows.map(row=>row.displayBusinessType).filter(Boolean))).sort((a,b)=>String(a).localeCompare(String(b),'zh-Hans-CN'));
  const transactionOrder=['收款','消耗','退款','废弃'];
  const transactionValues=Array.from(new Set(visibleRows.map(row=>row.transactionType).filter(Boolean))).filter(item=>transactionOrder.includes(item)).sort((a,b)=>transactionOrder.indexOf(a)-transactionOrder.indexOf(b));
  const payMethodValues=Array.from(new Set(visibleRows.map(row=>row.normalizedPaymentMethod||'其他').filter(Boolean))).sort((a,b)=>String(a).localeCompare(String(b),'zh-Hans-CN'));
  const linked=withLinkedFilterCounts([
    {key:'business',value:currentBusiness,options:[{ value:'', label:'全部', emptyDisplay:'业务类型' },...businessValues.map(item=>({ value:item, label:item }))],match:(row,value)=>row.displayBusinessType===value},
    {key:'transaction',value:currentTransaction,options:[{ value:'', label:'全部', emptyDisplay:'交易类型' },...transactionValues.map(item=>({ value:item, label:item }))],match:(row,value)=>row.transactionType===value},
    {key:'payMethod',value:currentPayMethod,options:[{ value:'', label:'全部', emptyDisplay:'支付方式' },...payMethodValues.map(item=>({ value:item, label:item }))],match:(row,value)=>String(row.normalizedPaymentMethod||'其他')===String(value)}
  ],visibleRows);
  businessHost.innerHTML=renderStandardDropdownHtml('financeLedgerBusinessTypeFilter','业务类型',linked.business.options,linked.business.value,false,'renderFinanceLedgerFilterChange');
  transactionHost.innerHTML=renderStandardDropdownHtml('financeLedgerTransactionTypeFilter','交易类型',linked.transaction.options,linked.transaction.value,false,'renderFinanceLedgerFilterChange');
  payMethodHost.innerHTML=renderStandardDropdownHtml('financeLedgerPayMethodFilter','支付方式',linked.payMethod.options,linked.payMethod.value,false,'renderFinanceLedgerFilterChange');
}
function renderFinanceLedgerFilterChange(){
  resetFinanceLedgerPage();
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
function renderFinanceLedger(){
  const body=document.getElementById('financeLedgerTbody');
  if(!body)return;
  if(!syncFinanceLedgerLoadingState())return;
  const baseRows=financeLedgerBaseRows().filter(row=>globalDateWithinRange(row.businessDate));
  renderFinanceLedgerFilterDropdowns(baseRows);
  renderFinanceLedgerPageSizeFilter();
  const rows=financeLedgerRows();
  const total=rows.length;
  const pages=Math.max(1,Math.ceil(total/financeLedgerPageSize));
  if(financeLedgerPage>pages)financeLedgerPage=pages;
  const slice=rows.slice((financeLedgerPage-1)*financeLedgerPageSize,financeLedgerPage*financeLedgerPageSize);
  renderFinanceLedgerPager(total,pages);
  body.innerHTML=slice.length?slice.map(row=>`<tr><td style="padding-left:20px">${renderStandardCellText(financeDateTimeDisplayText(row),false)}</td><td>${renderStandardCellText(row.customer,false)}</td><td><span class="tms-tag ${financeTagClassByText(row.transactionType,'action')}">${esc(row.transactionType)}</span></td><td>${financeTransactionAmountHtml(row)}</td><td>${renderStandardCellText(row.displayBusinessType,false)}</td><td><span class="tms-tag ${financeTagClassByText(row.normalizedPaymentMethod,'payment')}">${esc(row.normalizedPaymentMethod||'其他')}</span></td><td>${renderStandardCellText(row.campusName,false)}</td><td>${renderStandardCellText(financeOperatorDisplayText(row),false)}</td><td><div class="tms-text-remark finance-ledger-remark" title="${esc(row.notes||'')}">${esc(renderStandardEmptyText(row.notes))}</div></td></tr>`).join(''):`<tr><td colspan="9"><div class="empty"><p>暂无交易流水</p></div></td></tr>`;
}
function renderFinancePrepaidBalance(){
  const body=document.getElementById('financePrepaidTbody');
  const stats=document.getElementById('financePrepaidStats');
  if(!body||!stats)return;
  const allRows=[...financeLessonDeferredRows(),...financeStoredValueRows()];
  const rows=financePrepaidRows();
  const lessonDeferred=allRows.filter(row=>row.deferredType==='课包待确认');
  const storedDeferred=allRows.filter(row=>row.deferredType==='会员储值待确认');
  stats.innerHTML=[
    ['待确认总额',allRows.reduce((sum,row)=>sum+(Number(row.deferredAmount)||0),0),financeMoney],
    ['课包待确认',lessonDeferred.reduce((sum,row)=>sum+(Number(row.deferredAmount)||0),0),financeMoney],
    ['会员储值待确认',storedDeferred.reduce((sum,row)=>sum+(Number(row.deferredAmount)||0),0),financeMoney],
    ['待确认客户数',allRows.length,val=>String(val)]
  ].map(([label,val,formatter])=>`<div class="tms-stat-card"><div class="tms-stat-label">${label}</div><div class="tms-stat-value">${formatter(val)}</div></div>`).join('');
  body.innerHTML=rows.length?rows.map(row=>`<tr><td style="padding-left:20px">${renderStandardCellText(row.customer,false)}</td><td>${renderStandardCellText(row.campusName,false)}</td><td>${renderStandardCellText(row.deferredType==='课包待确认'?'课包':'会员储值',false)}</td><td>${financeAmountText(row.deferredAmount)}</td><td>${renderStandardCellText(row.source,false)}</td><td><div class="tms-text-remark">${esc(renderStandardEmptyText(row.notes))}</div></td></tr>`).join(''):`<tr><td colspan="6"><div class="empty"><p>暂无待确认收入</p></div></td></tr>`;
}
function financeLegacySettlementRows(){
  const monthInput=document.getElementById('financeSettlementMonth');
  const monthValue=(monthInput?.value||today().slice(0,7)).slice(0,7);
  if(monthInput&&!monthInput.value)monthInput.value=monthValue;
  const coachMap=new Map();
  (schedules||[]).forEach(schedule=>{
    if(String(schedule.startTime||'').slice(0,7)!==monthValue)return;
    const campusName=financeCampusNameFromValue(schedule.campus);
    if(!financeMatchesCampusName(campusName))return;
    const coach=coachName(schedule.coach)||schedule.coach||'未分配';
    const key=`${coach}__${campusName||'未分配校区'}`;
    const current=coachMap.get(key)||{
      coach,
      campusName:campusName||'—',
      lessonUnits:0,
      lateCount:0,
      lateFeeAmount:0
    };
    if(effectiveScheduleStatus(schedule)==='已结束'){
      current.lessonUnits+=scheduleLessonUnits(schedule);
    }
    if(schedule.coachLateFree){
      current.lateCount+=1;
      current.lateFeeAmount+=Number(schedule.coachLateFieldFeeAmount)||0;
    }
    coachMap.set(key,current);
  });
  return Array.from(coachMap.values())
    .filter(row=>row.lessonUnits>0||row.lateCount>0||row.lateFeeAmount>0)
    .sort((a,b)=>{
      if((Number(b.lateFeeAmount)||0)!==(Number(a.lateFeeAmount)||0))return (Number(b.lateFeeAmount)||0)-(Number(a.lateFeeAmount)||0);
      return String(a.coach||'').localeCompare(String(b.coach||''),'zh-Hans-CN');
    });
}
function financeSettlementRows(){
  const monthInput=document.getElementById('financeSettlementMonth');
  const monthValue=(monthInput?.value||today().slice(0,7)).slice(0,7);
  if(monthInput&&!monthInput.value)monthInput.value=monthValue;
  if(loadedDatasets.has('financePage')){
    return financeSettlementRowsFromSnapshot().filter(row=>String(row.month||'')===monthValue&&financeMatchesCampusName(row.campusName))
      .sort((a,b)=>{
        if((Number(b.lateFeeAmount)||0)!==(Number(a.lateFeeAmount)||0))return (Number(b.lateFeeAmount)||0)-(Number(a.lateFeeAmount)||0);
        return String(a.coach||'').localeCompare(String(b.coach||''),'zh-Hans-CN');
      });
  }
  return financeLegacySettlementRows();
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
