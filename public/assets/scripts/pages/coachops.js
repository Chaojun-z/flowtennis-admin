// ===== 教练运营 =====
function setCoachOpsPanel(panel){
  coachOpsPanel=panel==='workload'?'workload':'schedule';
  const schedulePanel=document.getElementById('coachOpsSchedulePanel');
  const workloadPanel=document.getElementById('coachOpsWorkloadPanel');
  const scheduleTab=document.getElementById('coachOpsTabSchedule');
  const workloadTab=document.getElementById('coachOpsTabWorkload');
  const scheduleControls=document.getElementById('coachOpsScheduleControls');
  const legend=document.getElementById('coachOpsLegend');
  const quickBtn=document.getElementById('coachOpsQuickCreateBtn');
  if(schedulePanel)schedulePanel.style.display=coachOpsPanel==='schedule'?'':'none';
  if(workloadPanel)workloadPanel.style.display=coachOpsPanel==='workload'?'':'none';
  if(scheduleTab)scheduleTab.classList.toggle('active',coachOpsPanel==='schedule');
  if(workloadTab)workloadTab.classList.toggle('active',coachOpsPanel==='workload');
  if(scheduleControls)scheduleControls.style.display='flex';
  if(legend)legend.style.display='';
  if(quickBtn)quickBtn.style.display=coachOpsPanel==='schedule'?'':'none';
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
  host.innerHTML=renderCourtDropdownHtml('financeLedgerPageSizeValue',`${financeLedgerPageSize}条/页`,[{value:'20',label:'20条/页'},{value:'50',label:'50条/页'},{value:'100',label:'100条/页'}],String(financeLedgerPageSize),false,'setFinanceLedgerPageSize');
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
}
function closeCoachOpsPicker(){document.getElementById('coachOpsPicker')?.classList.remove('open');}
function ensureCoachOpsReportDateControls(){
  const yearStartValue='2025-01-01';
  const configs=[
    ['financeLedgerFromHost','financeLedgerFrom','开始日期',document.getElementById('financeLedgerFrom')?.value||yearStartValue,'resetFinanceLedgerPage();renderFinanceLedger()'],
    ['financeLedgerToHost','financeLedgerTo','结束日期',document.getElementById('financeLedgerTo')?.value||today(),'resetFinanceLedgerPage();renderFinanceLedger()'],
    ['coachOpsRevenueFromHost','coachOpsRevenueFrom','开始日期',document.getElementById('coachOpsRevenueFrom')?.value||yearStartValue,'renderFinanceRevenueReport()'],
    ['coachOpsRevenueToHost','coachOpsRevenueTo','结束日期',document.getElementById('coachOpsRevenueTo')?.value||today(),'renderFinanceRevenueReport()'],
    ['coachOpsConsumeFromHost','coachOpsConsumeFrom','开始日期',document.getElementById('coachOpsConsumeFrom')?.value||yearStartValue,'renderFinanceConsumeReport()'],
    ['coachOpsConsumeToHost','coachOpsConsumeTo','结束日期',document.getElementById('coachOpsConsumeTo')?.value||today(),'renderFinanceConsumeReport()']
  ];
  configs.forEach(([hostId,id,label,value,handler])=>{
    const host=document.getElementById(hostId);
    if(host)host.innerHTML=courtDateButtonHtml(id,value,label,handler);
  });
}
function toggleCoachOpsPicker(){
  const pop=document.getElementById('coachOpsPicker');if(!pop)return;
  coachOpsPickerMonth=monthStart(coachOpsInputDate());
  renderCoachOpsPicker();
  pop.classList.toggle('open');
}
function moveCoachOpsPickerMonth(step){coachOpsPickerMonth=addMonths(coachOpsPickerMonth||coachOpsInputDate(),step);renderCoachOpsPicker();}
function pickCoachOpsDate(value){
  const el=document.getElementById('coachOpsDate');if(!el)return;
  el.value=value;
  closeCoachOpsPicker();
  renderCoachOps();
}
function renderCoachOpsPicker(){
  const pop=document.getElementById('coachOpsPicker');if(!pop)return;
  const selected=coachOpsInputDate();
  const base=coachOpsPickerMonth||monthStart(selected);
  if(coachOpsMode==='month'){
    const months=Array.from({length:12},(_,i)=>{
      const active=selected.getFullYear()===base.getFullYear()&&selected.getMonth()===i;
      return `<button class="coach-picker-month ${active?'active':''}" onclick="pickCoachOpsDate('${base.getFullYear()}-${String(i+1).padStart(2,'0')}')">${i+1}月</button>`;
    }).join('');
    pop.innerHTML=`<div class="coach-picker-head"><button class="coach-picker-move" onclick="moveCoachOpsPickerMonth(-12)">‹</button><div class="coach-picker-title">${base.getFullYear()} 年</div><button class="coach-picker-move" onclick="moveCoachOpsPickerMonth(12)">›</button></div><div class="coach-picker-months">${months}</div>`;
    return;
  }
  const first=new Date(base.getFullYear(),base.getMonth(),1);
  const gridStart=addDays(first,-((first.getDay()+6)%7));
  const selectedKey=dateKey(selected);
  const weekKey=coachOpsMode==='week'?isoWeekValue(selected):'';
  const days=Array.from({length:42},(_,i)=>{
    const d=addDays(gridStart,i),ds=dateKey(d);
    const muted=d.getMonth()!==base.getMonth();
    const active=coachOpsMode==='day'&&ds===selectedKey;
    const weekActive=coachOpsMode==='week'&&isoWeekValue(d)===weekKey;
    const clickValue=coachOpsMode==='week'?isoWeekValue(d):ds;
    return `<button class="coach-picker-day ${muted?'muted':''} ${ds===today()?'today':''} ${active?'active':''} ${weekActive?'week-active':''}" onclick="pickCoachOpsDate('${clickValue}')">${d.getDate()}</button>`;
  }).join('');
  pop.innerHTML=`<div class="coach-picker-head"><button class="coach-picker-move" onclick="moveCoachOpsPickerMonth(-1)">‹</button><div class="coach-picker-title">${base.getFullYear()} 年 ${base.getMonth()+1} 月</div><button class="coach-picker-move" onclick="moveCoachOpsPickerMonth(1)">›</button></div><div class="coach-picker-weekdays"><span>一</span><span>二</span><span>三</span><span>四</span><span>五</span><span>六</span><span>日</span></div><div class="coach-picker-grid">${days}</div>`;
}
function ensureCoachOpsDate(){
  const el=document.getElementById('coachOpsDate');if(!el)return;
  if(!el.value)el.value=coachOpsInputValue(new Date(),coachOpsMode);
  updateCoachOpsDateButton();
}
function setCoachOpsMode(mode){
  const base=coachOpsInputDate();
  coachOpsMode=['day','week','month'].includes(mode)?mode:'day';
  const d=document.getElementById('coachOpsDate');if(d)d.value=coachOpsInputValue(base,coachOpsMode);
  closeCoachOpsPicker();
  renderCoachOps();
}
function setCoachOpsToday(){const el=document.getElementById('coachOpsDate');if(el)el.value=coachOpsInputValue(new Date(),coachOpsMode);renderCoachOps();}
function shiftCoachOpsDate(step){
  const el=document.getElementById('coachOpsDate');if(!el)return;
  const mode=coachOpsMode;
  const base=coachOpsInputDate();
  if(mode==='month')el.value=coachOpsInputValue(addMonths(base,step),mode);
  else if(mode==='week')el.value=coachOpsInputValue(addDays(base,step*7),mode);
  else el.value=dateKey(addDays(base,step));
  renderCoachOps();
}
function openCoachOpsDay(ds){coachOpsMode='day';const d=document.getElementById('coachOpsDate');if(d)d.value=ds;renderCoachOps();}
function coachOpsQuickCreate(){
  openScheduleModal(null,{scheduleSource:'教练运营'});
}
function coachOpsCourseTypeTagClass(type){
  const normalized=normalizeCourseType(type);
  if(normalized==='体验课')return 'type-trial';
  if(normalized==='训练营')return 'type-camp';
  if(normalized==='大师课')return 'type-master';
  if(normalized==='陪打')return 'type-partner';
  return 'type-private';
}
function openCoachOpsCreateSchedule(coach,date,startTime='09:00'){
  const h=Math.min(22,parseInt(startTime.slice(0,2))||9),m=startTime.slice(3,5)||'00';
  const endH=Math.min(23,h+1);
  const co=coaches.find(c=>coachName(c.name)===coachName(coach));
  openScheduleModal(null,{startTime:`${date} ${String(h).padStart(2,'0')}:${m}`,endTime:`${date} ${String(endH).padStart(2,'0')}:${m}`,coach:coachName(coach),campus:co?.campus||'',venue:'1号场',lessonCount:1,status:'已排课',scheduleSource:'教练运营'});
}
function openCoachOpsLineCreate(e,coach,date){
  if(e.target.closest('.coach-ops-block'))return;
  const rect=e.currentTarget.getBoundingClientRect();
  const pct=Math.max(0,Math.min(1,(e.clientX-rect.left)/rect.width));
  const minutes=Math.round((pct*(22-7)*60)/30)*30;
  const h=Math.min(22,7+Math.floor(minutes/60)),m=minutes%60;
  openCoachOpsCreateSchedule(coach,date,`${String(h).padStart(2,'0')}:${String(m).padStart(2,'0')}`);
}
function coachOpsRows(){
  const now=new Date(),todayStr=today();
  const ws=weekStart(now),we=new Date(ws);we.setDate(ws.getDate()+7);
  const ms=monthStart(now),me=new Date(now.getFullYear(),now.getMonth()+1,1);
  const range=rangeBounds(coachOpsMode);
  const all=billableSchedules();
  const names=[...new Set([...activeCoachNames(),...all.map(s=>coachName(s.coach)).filter(Boolean)])];
  return names.map(name=>{
    const mine=all.filter(s=>coachName(s.coach)===name);
    const todayRows=mine.filter(s=>s.startTime.slice(0,10)===todayStr);
    const weekRows=mine.filter(s=>inRange(s.startTime,ws,we));
    const monthRows=mine.filter(s=>inRange(s.startTime,ms,me));
    const rangeRows=mine.filter(s=>inRange(s.startTime,range.start,range.end));
    const campusMap={};
    rangeRows.forEach(s=>{if(s.campus)campusMap[s.campus]=(campusMap[s.campus]||0)+1});
    const mainCampus=Object.entries(campusMap).sort((a,b)=>b[1]-a[1])[0]?.[0]||'';
    return {name,todayRows,weekRows,monthRows,rangeRows,mainCampus,pending:pendingFeedbackCount(rangeRows),risks:coachRiskCount(rangeRows),conflicts:coachOverlapCount(rangeRows)};
  });
}
function renderCoachOpsRangeFilter(){
  const host=document.getElementById('coachOpsRangeHost');
  if(!host)return;
  host.innerHTML=renderCourtDropdownHtml('coachOpsRange','日视图',[
    {value:'day',label:'日视图'},
    {value:'week',label:'周视图'},
    {value:'month',label:'月视图'}
  ],coachOpsMode,false,'setCoachOpsMode');
}
function renderCoachOps(){
  const host=document.getElementById('coachOpsTimeline');if(!host)return;
  ensureCoachOpsReportDateControls();
  renderCoachOpsRangeFilter();
  ensureCoachOpsDate();
  setCoachOpsPanel(coachOpsPanel);
  const mode=coachOpsMode;
  setCourtDropdownValue('coachOpsRange',mode,mode==='day'?'日视图':mode==='week'?'周视图':'月视图');
  const range=rangeBounds(mode);
  const hourHost=document.getElementById('coachOpsHours');
  const opsStartH=7,opsEndH=22,opsTotalMin=(opsEndH-opsStartH)*60;
  if(hourHost){
    hourHost.classList.toggle('week',mode==='week'||mode==='month');
    hourHost.innerHTML=mode==='day'?Array.from({length:opsEndH-opsStartH+1},(_,i)=>`<span>${i+opsStartH}:00</span>`).join(''):(mode==='week'||mode==='month')?['周一','周二','周三','周四','周五','周六','周日'].map(d=>`<span>${d}</span>`).join(''):'';
  }
  const title=document.getElementById('coachOpsViewTitle');
  if(title)title.textContent=mode==='day'?`${range.label} 教练排课（7:00-22:00）`:mode==='week'?`${dateKey(range.start)} 至 ${dateKey(addDays(range.end,-1))} 教练周视图`:`${range.label} 教练月视图`;
  const rows=coachOpsRows();
  const todayTotal=lessonUnitsText(rows.reduce((n,r)=>n+sumScheduleLessonUnits(r.todayRows),0));
  const weekTotal=lessonUnitsText(rows.reduce((n,r)=>n+sumScheduleLessonUnits(r.weekRows),0));
  const rangeTotal=lessonUnitsText(rows.reduce((n,r)=>n+sumScheduleLessonUnits(r.rangeRows),0));
  const pending=rows.reduce((n,r)=>n+r.pending,0);
  document.getElementById('coachOpsStats').innerHTML=[
    [mode==='day'?'当日上课':'今日上课',mode==='day'?rangeTotal:todayTotal,'节','si-a'],
    ['本周上课',weekTotal,'节','si-b'],
    ['未反馈',pending,'节','si-e']
  ].map(([label,val,u])=>`<div class="tms-stat-card"><div class="tms-stat-label">${label}</div><div class="tms-stat-value">${val}<span>${u}</span></div></div>`).join('');
  host.innerHTML=rows.map(r=>{
    if(mode==='day'){
      const base=new Date(range.start);base.setHours(opsStartH,0,0,0);
      const blocks=r.rangeRows.sort((a,b)=>String(a.startTime).localeCompare(String(b.startTime))).map(s=>{
        const startMin=(dateMs(s.startTime)-base.getTime())/60000;
        const endMs=Number.isFinite(dateMs(s.endTime))?dateMs(s.endTime):dateMs(s.startTime)+60*60000;
        const endMin=(endMs-base.getTime())/60000;
        const left=Math.max(0,Math.min(99,startMin/opsTotalMin*100));
        const width=Math.max(2,(Math.min(opsTotalMin,endMin)-Math.max(0,startMin))/opsTotalMin*100);
        return `<div class="coach-ops-block ${coachOpsCourseTypeTagClass(scheduleCourseType(s))}" style="left:${left}%;width:${Math.min(width,100-left)}%" onclick="event.stopPropagation();openScheduleDetail('${s.id}')"><div class="coach-ops-time">${s.startTime.slice(11,16)}${s.endTime?' - '+s.endTime.slice(11,16):''}</div><div class="coach-ops-student">${esc(s.studentName)||esc(classes.find(c=>c.id===s.classId)?.className)||'—'}</div><div class="coach-ops-location">${esc(scheduleLocationText(s))}</div></div>`;
      }).join('');
      return `<div class="coach-ops-row"><div class="coach-ops-name">${esc(r.name)}</div><div class="coach-ops-line" onclick="openCoachOpsLineCreate(event,${jsArg(r.name)},'${dateKey(range.start)}')">${blocks||'<span class="coach-ops-empty">当日暂无课程</span>'}</div></div>`;
    }
    const days=[];
    const gridStart=mode==='month'?weekStart(range.start):range.start;
    const gridEnd=mode==='month'?addDays(weekStart(range.end),7):range.end;
    for(let d=new Date(gridStart);d<gridEnd;d=addDays(d,1))days.push(new Date(d));
    const cells=days.map(d=>{
      const ds=dateKey(d);
      const dayRows=r.rangeRows.filter(s=>s.startTime.slice(0,10)===ds).sort((a,b)=>String(a.startTime).localeCompare(String(b.startTime)));
      return `<div class="coach-ops-daycell ${dayRows.length?'has-course':''}" onclick="openCoachOpsCreateSchedule(${jsArg(r.name)},'${ds}')"><strong>${d.getMonth()+1}/${d.getDate()}</strong>${dayRows.length?`${dayRows.length}节<br>${dayRows.slice(0,2).map(s=>s.startTime.slice(11,16)+' '+(s.studentName||'')).join('<br>')}`:'无课'}</div>`;
    }).join('');
    return `<div class="coach-ops-row"><div class="coach-ops-name">${esc(r.name)}</div><div class="coach-ops-period-line ${mode==='week'?'coach-ops-week':'coach-ops-month'}">${cells}</div></div>`;
  }).join('');
  document.getElementById('coachOpsTbody').innerHTML=rows.map(r=>`<tr><td><div class="uname">${esc(r.name)}</div></td><td>${lessonUnitsText(sumScheduleLessonUnits(r.rangeRows))} 节</td><td>${r.rangeRows.reduce((n,s)=>n+scheduleDurMin(s),0)} 分钟</td><td><span class="badge ${r.pending?'b-red':'b-green'}">${r.pending}</span></td><td>${distText(r.rangeRows,s=>isExternalSchedule(s)?(s.externalVenueName||'外部场馆'):cn(s.campus))}</td><td>${distText(r.rangeRows,timeBand)}</td><td>${r.conflicts?`<span class="badge b-red">冲突 ${r.conflicts}</span>`:r.risks?`<span class="badge b-amber">跨校区紧 ${r.risks}</span>`:'<span class="badge b-green">正常</span>'}</td></tr>`).join('');
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
function financeCampusNameFromHints(...values){
  for(const value of values){
    const direct=financeCampusNameFromValue(value);
    if(direct)return direct;
  }
  const hintText=values.flatMap(value=>Array.isArray(value)?value:[value]).map(value=>String(value||'')).join(' ');
  if(/mabao|马坡/i.test(hintText))return '顺义马坡';
  if(/shilibao|十里堡/i.test(hintText))return '朝阳十里堡';
  if(/langcha|朗茶/i.test(hintText))return '朝瑶私教';
  return '';
}
function financeCampusNameForPurchase(purchase,entitlement={}){
  const entitlementCampus=parseArr(entitlement.campusIds)[0]||entitlement.campus||'';
  const studentCampus=(students.find(s=>s.id===purchase.studentId)||{}).campus||'';
  return financeCampusNameFromHints(
    entitlementCampus,
    purchase.campus,
    studentCampus,
    purchase.notes,
    purchase.packageName,
    purchase.productName
  );
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
      payMethod:row.paymentChannel||'—',
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
    if(incomeTypeFilter&&row.incomeType!==incomeTypeFilter)return false;
    if(payMethodFilter&&String(row.payMethod||'—')!==payMethodFilter)return false;
    return searchHit(q,row.studentName,row.incomeType,row.payMethod,row.notes,row.collector,row.campusName,row.relatedDocument,row.revenueCategory);
  });
}
function renderFinanceRevenueFilterDropdowns(baseRows){
  const typeHost=document.getElementById('financeRevenueTypeFilterHost');
  const payMethodHost=document.getElementById('financeRevenuePayMethodFilterHost');
  if(!typeHost||!payMethodHost)return;
  const currentType=String(document.getElementById('financeRevenueTypeFilter')?.value||'').trim();
  const currentPayMethod=String(document.getElementById('financeRevenuePayMethodFilter')?.value||'').trim();
  const typeOptions=[{ value:'', label:'全部收入类型' },...Array.from(new Set((baseRows||[]).map(row=>row.incomeType).filter(Boolean))).sort((a,b)=>String(a).localeCompare(String(b),'zh-Hans-CN')).map(item=>({ value:item, label:item }))];
  const payMethodOptions=[{ value:'', label:'全部支付方式' },...Array.from(new Set((baseRows||[]).map(row=>row.payMethod||'—').filter(Boolean))).sort((a,b)=>String(a).localeCompare(String(b),'zh-Hans-CN')).map(item=>({ value:item, label:item }))];
  const selectedType=typeOptions.some(item=>item.value===currentType)?currentType:'';
  const selectedPayMethod=payMethodOptions.some(item=>item.value===currentPayMethod)?currentPayMethod:'';
  typeHost.innerHTML=renderCourtDropdownHtml('financeRevenueTypeFilter','全部收入类型',typeOptions,selectedType,false,'renderFinanceRevenueFilterChange');
  payMethodHost.innerHTML=renderCourtDropdownHtml('financeRevenuePayMethodFilter','全部支付方式',payMethodOptions,selectedPayMethod,false,'renderFinanceRevenueFilterChange');
}
function renderFinanceRevenueFilterChange(){
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
function financeAmountText(value){
  const num=Math.round((Number(value)||0)*100)/100;
  return num?`¥${fmt(num)}`:'¥0';
}
function financeSignedAmountText(value){
  const num=Math.round((Number(value)||0)*100)/100;
  if(!num)return '¥0';
  return `${num>0?'+':''}¥${fmt(num)}`;
}
function financeDisplayBusinessType(type=''){
  const value=String(type||'').trim();
  if(['会员订场','散客订场','约球局'].includes(value))return '订场';
  return value||'其他';
}
function financeNeutralActionLabel(text=''){
  return /免费|赠送/.test(String(text||''))?'赠送':'记录';
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
function financeUnifiedRows(){
  const courseReceiptRows=financeCourseRevenueRows().map(row=>{
    const actualAmount=Number(row.actualAmount)||0;
    return {
      id:`purchase-${row.id}`,
      businessDate:row.purchaseDate||String(row.createdAt||'').slice(0,10),
      weekdayText:row.weekdayText||financeWeekdayText(row.purchaseDate||row.createdAt),
      timeText:row.timeText||'—',
      customer:row.studentName||'—',
      campusName:row.campusName||'—',
      businessType:row.differenceReason?'差异项':'课程',
      action:row.differenceReason?'差异':(actualAmount>0?'收款':financeNeutralActionLabel(`${row.notes||''} ${row.payMethod||''}`)),
      cashDelta:row.differenceReason?0:actualAmount,
      recognizedRevenueDelta:0,
      deferredRevenueDelta:row.differenceReason?0:actualAmount,
      paymentChannel:row.payMethod||'—',
      sourceDocument:row.relatedDocument,
      notes:row.differenceReason?`${row.differenceReason}；${row.notes||''}`:(row.notes||''),
      incomeType:row.incomeType||row.packageName||'课包购买',
      packageName:row.packageName||row.incomeType||'课包',
      collector:row.collector||'—',
      differenceReason:row.differenceReason||'',
      systemStatus:row.systemStatus||'正常',
      totalLessons:Number(row.totalLessons)||0,
      usedLessons:Number(row.usedLessons)||0,
      remainingLessons:Number(row.remainingLessons)||0,
      sourceProject:row.incomeType||'课包购买',
      debitTarget:row.packageName||row.incomeType||'课包'
    };
  });
  const membershipReceiptRows=financeMembershipRevenueRows().map(row=>{
    const actualAmount=Number(row.actualAmount)||0;
    return {
      id:`membership-${row.id}`,
      businessDate:row.purchaseDate||String(row.createdAt||'').slice(0,10),
      weekdayText:row.weekdayText||financeWeekdayText(row.purchaseDate||row.createdAt),
      timeText:'—',
      customer:row.studentName||'—',
      campusName:row.campusName||'—',
      businessType:row.differenceReason?'差异项':'会员储值',
      action:row.differenceReason?'差异':(actualAmount>0?'收款':financeNeutralActionLabel(`${row.notes||''} ${row.payMethod||''}`)),
      cashDelta:row.differenceReason?0:actualAmount,
      recognizedRevenueDelta:0,
      deferredRevenueDelta:row.differenceReason?0:actualAmount,
      paymentChannel:row.payMethod||'—',
      sourceDocument:row.relatedDocument,
      notes:row.differenceReason?`${row.differenceReason}；${row.notes||''}`:(row.notes||''),
      incomeType:'会员储值',
      collector:row.collector||'系统记录',
      differenceReason:row.differenceReason||'',
      systemStatus:row.systemStatus||'正常',
      sourceProject:'会员充值',
      debitTarget:'会员储值余额'
    };
  });
  const courseConsumeRows=financeConsumeBaseRows().map(row=>{
    const sign=row.actionLabel==='退回'?-1:1;
    const recognizedAmount=Math.max(0,Number(row.recognizedAmount)||0)*sign;
    return {
      id:`consume-${row.id}`,
      businessDate:String(row.relatedDate||row.createdAt||'').slice(0,10),
      weekdayText:financeWeekdayText(row.relatedDate||row.createdAt),
      timeText:financeTimeText(row.scheduleTime),
      customer:row.studentName||'—',
      campusName:row.campusName||'—',
      businessType:'课程',
      action:row.actionLabel==='退回'?'回退':'消耗',
      cashDelta:0,
      recognizedRevenueDelta:recognizedAmount,
      deferredRevenueDelta:-recognizedAmount,
      paymentChannel:'课包划扣',
      sourceDocument:row.relatedDocument,
      notes:row.notes||row.reason||'',
      incomeType:row.packageName||'课包消耗',
      packageName:row.packageName||'课包',
      collector:row.coach||row.operator||'系统记录',
      differenceReason:'',
      systemStatus:row.systemStatus||'已关联',
      sourceProject:row.sourceProject||'课包消耗',
      debitTarget:row.debitTarget||row.packageName||'课包'
    };
  });
  const courtRows=courts.flatMap(court=>{
    const baseCampusName=financeCampusNameFromHints(court.campus,court.campusName,court.name,court.notes);
    if(!financeMatchesCampusName(baseCampusName))return [];
    return normalizeCourtHistoryLocal(court.history).map(h=>{
      const noteText=`${h.note||''} ${h.category||''} ${h.sourceCategory||''} ${h.payMethod||''}`;
      const campusName=financeCampusNameFromHints(baseCampusName,h.campus,h.note,h.category,h.source,h.importSource,h.sourceCategory)||'—';
      if(!financeMatchesCampusName(campusName))return null;
      if(h.type==='充值'&&h.membershipOrderId)return null;
      const differenceReason=financeDifferenceReason(noteText);
      const businessType=financeCourtHistoryBusinessType(h);
      const amount=Math.round((Number(h.amount)||0)*100)/100;
      let action=financeNeutralActionLabel(noteText);
      let cashDelta=0;
      let recognizedRevenueDelta=0;
      let deferredRevenueDelta=0;
      if(h.type==='充值'){
        action=amount>0?'收款':action;
        cashDelta=amount;
        deferredRevenueDelta=amount;
      }else if(h.type==='消费'&&String(h.payMethod||'').trim()==='储值扣款'){
        action=amount>0?'已入账':action;
        recognizedRevenueDelta=amount;
        deferredRevenueDelta=-amount;
      }else if(h.type==='消费'){
        action=amount>0?'收款':action;
        cashDelta=amount;
        recognizedRevenueDelta=amount;
      }else if(h.type==='退款'&&String(h.payMethod||'').trim()==='储值退款'){
        action='退款';
        cashDelta=-amount;
        deferredRevenueDelta=-amount;
      }else if(h.type==='退款'){
        action='退款';
        cashDelta=-amount;
        recognizedRevenueDelta=-amount;
      }else if(h.type==='冲正'&&String(h.payMethod||'').trim()==='储值扣款'){
        action='冲回';
        recognizedRevenueDelta=-amount;
        deferredRevenueDelta=amount;
      }else if(h.type==='冲正'){
        action='冲回';
        cashDelta=-amount;
        recognizedRevenueDelta=-amount;
      }
      if(differenceReason){
        action='差异';
        cashDelta=0;
        recognizedRevenueDelta=0;
        deferredRevenueDelta=0;
      }
      return {
        id:`court-${court.id}-${h.id||h.date||uid()}`,
        businessDate:h.occurredDate||h.date||'',
        weekdayText:financeWeekdayText(h.occurredDate||h.date),
        timeText:h.startTime&&h.endTime?`${String(h.startTime).slice(11,16)}-${String(h.endTime).slice(11,16)}`:(h.time||'—'),
        customer:courtDisplayName(court)||court.name||court.id,
        campusName,
        businessType:differenceReason?'差异项':businessType,
        action,
        cashDelta,
        recognizedRevenueDelta,
        deferredRevenueDelta,
        paymentChannel:h.payMethod||'—',
        sourceDocument:`订场账户 ${court.id}`,
        notes:differenceReason?`${differenceReason}；${h.note||h.category||''}`:(h.note||h.category||''),
        incomeType:businessType,
        collector:h.operator||h.createdBy||'系统记录',
        differenceReason:differenceReason||'',
        systemStatus:differenceReason?'差异项':'正常',
        sourceProject:businessType,
        debitTarget:businessType==='会员储值'?'会员储值余额':(String(h.payMethod||'').trim()==='储值扣款'?'会员储值余额':'现场收款')
      };
    }).filter(Boolean);
  });
  return [...courseReceiptRows,...membershipReceiptRows,...courseConsumeRows,...courtRows];
}
function financeRecognizedRows(){
  const q=String(document.getElementById('coachOpsConsumeSearch')?.value||'').trim().toLowerCase();
  const from=document.getElementById('coachOpsConsumeFrom')?.value||'';
  const to=document.getElementById('coachOpsConsumeTo')?.value||'';
  return financeUnifiedRows().filter(row=>{
    if(!coachOpsDateWithinRange(row.businessDate,from,to))return false;
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
      sourceBusinessCategory:'课程',
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
      collector:p.operator||p.ownerCoach||'—',
      systemStatus:purchaseStatusText(p),
      relatedDocument:`购买记录 ${p.id}`,
      notes:p.notes||'',
      differenceReason:financeDifferenceReason(`${p.notes||''} ${p.packageName||''} ${p.productName||''}`)
    };
  }).filter(Boolean);
}
function financeMembershipRevenueRows(){
  return (membershipOrders||[]).filter(order=>String(order?.status||'active')!=='voided').map(order=>{
    const court=(courts||[]).find(item=>String(item.id||'')===String(order.courtId||''))||{};
    const campusName=financeCampusNameFromHints(court.campus,court.campusName,order.courtName,order.notes,order.membershipPlanName);
    if(!financeMatchesCampusName(campusName))return null;
    const amount=Number(order.rechargeAmount)||0;
    const differenceReason=financeDifferenceReason(`${order.notes||''} ${order.membershipPlanName||''}`);
    return {
      ...order,
      revenueCategory:differenceReason?'差异项':'会员储值',
      sourceBusinessCategory:'会员储值',
      campusName,
      purchaseDate:order.purchaseDate||String(order.createdAt||'').slice(0,10),
      weekdayText:financeWeekdayText(order.purchaseDate||order.createdAt),
      timeText:'—',
      studentName:order.courtName||courtDisplayName(court)||court.name||order.courtId||'—',
      incomeType:differenceReason?'差异项 · 会员储值':'会员储值',
      payMethod:order.payMethod||'会员充值',
      receivableAmount:amount,
      actualAmount:amount,
      priceDiff:0,
      priceDiffReason:differenceReason||'—',
      collector:order.operator||'系统记录',
      systemStatus:differenceReason?'差异项':'正常',
      relatedDocument:`会员订单 ${order.id}`,
      notes:differenceReason?`${differenceReason}；${order.notes||''}`:(order.notes||''),
      totalLessons:0,
      usedLessons:0,
      remainingLessons:0,
      differenceReason
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
  return '散客订场';
}
function financeDifferenceReason(text=''){
  const hint=String(text||'');
  if(/会员储值补足/.test(hint))return '系统补的会员储值来源，不计入三张业务表';
  if(/期初导入汇总/.test(hint))return '期初导入汇总，不计入三张业务表';
  return '';
}
function financeLedgerCampusName(row){
  const direct=financeCampusNameFromHints(
    row?.campusName,
    row?.campusId,
    row?.campus,
    row?.sourceId,
    row?.productSnapshotName,
    row?.ledgerType,
    row?.notes,
    row?.reason
  );
  if(direct)return direct;
  const meta=row?.productSnapshotMeta||{};
  const courtId=meta.courtId||(row?.userType==='court_customer'?row?.userId:'');
  if(courtId){
    const court=courts.find(item=>item.id===courtId);
    const courtCampus=financeCampusNameFromHints(court?.campus,court?.campusName,court?.notes,row?.sourceId,row?.productSnapshotName);
    if(courtCampus)return courtCampus;
  }
  return financeCampusNameFromHints(row?.notes,row?.reason,row?.sourceId,row?.productSnapshotName,row?.ledgerType);
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
    const baseCampusName=financeCampusNameFromHints(court.campus,court.campusName,court.name,court.notes);
    if(!financeMatchesCampusName(baseCampusName))return [];
    return normalizeCourtHistoryLocal(court.history).filter(h=>{
      if(String(h.category||'').includes('内部占用'))return false;
      if(h.type==='充值')return !!financeDifferenceReason(`${h.note||''} ${h.category||''} ${h.payMethod||''}`);
      if(['消费','退款','冲正'].includes(h.type)&&String(h.category||'').includes('订场'))return true;
      if(h.type==='消费'&&String(h.payMethod||'').trim()!=='储值扣款')return true;
      return false;
    }).map(h=>{
      const campusName=financeCampusNameFromHints(baseCampusName,h.campus,h.note,h.category,h.source,h.importSource,h.sourceCategory);
      if(!financeMatchesCampusName(campusName))return null;
      const isStoredValue=h.type==='充值';
      const signedAmount=(Number(h.amount)||0)*(h.type==='退款'||h.type==='冲正'?-1:1);
      const businessType=financeCourtHistoryBusinessType(h);
      const typeText=isStoredValue
        ? '会员储值'
        : ((businessType==='会员订场'||businessType==='散客订场'||businessType==='约球局')?businessType:(h.category||'课程收入'));
      const timeText=h.startTime&&h.endTime?`${String(h.startTime).slice(11,16)}-${String(h.endTime).slice(11,16)}`:(h.time||'—');
      const differenceReason=financeDifferenceReason(`${h.note||''} ${h.category||''} ${h.payMethod||''}`);
      const actualAmount=businessType==='会员订场'&&!differenceReason?0:signedAmount;
      return {
        id:`court-income-${court.id}-${h.id||h.date||uid()}`,
        revenueCategory:differenceReason?'差异项':(isStoredValue?'会员储值':businessType),
        sourceBusinessCategory:isStoredValue?'会员储值':businessType,
        campusName,
        purchaseDate:h.date||'',
        weekdayText:financeWeekdayText(h.date),
        timeText,
        studentName:courtDisplayName(court)||court.name||court.id,
        incomeType:differenceReason?`差异项 · ${typeText}`:typeText,
        payMethod:h.payMethod||'—',
        receivableAmount:signedAmount,
        actualAmount,
        priceDiff:Math.round((signedAmount-actualAmount)*100)/100,
        priceDiffReason:differenceReason||'—',
        collector:h.operator||h.createdBy||'系统记录',
        systemStatus:differenceReason?'差异项':'正常',
        relatedDocument:`订场账户 ${court.id}`,
        notes:differenceReason?`${differenceReason}；${h.note||h.category||''}`:(h.note||h.category||''),
        totalLessons:0,
        usedLessons:0,
        remainingLessons:0,
        differenceReason
      };
    }).filter(Boolean);
  });
}
function financeBookingOverviewRows(){
  return courts.flatMap(court=>{
    const baseCampusName=financeCampusNameFromHints(court.campus,court.campusName,court.name,court.notes);
    if(!financeMatchesCampusName(baseCampusName))return [];
    return normalizeCourtHistoryLocal(court.history).flatMap(h=>{
      const campusName=financeCampusNameFromHints(baseCampusName,h.campus,h.note,h.category,h.source,h.importSource,h.sourceCategory);
      if(!financeMatchesCampusName(campusName))return [];
      if(String(h.category||'').includes('内部占用'))return [];
      if(financeDifferenceReason(`${h.note||''} ${h.category||''} ${h.payMethod||''}`))return [];
      const businessType=financeCourtHistoryBusinessType(h);
      if(!['会员订场','散客订场','约球局'].includes(businessType))return [];
      const noteText=`${h.note||''} ${h.category||''}`;
      if(/期初导入汇总/.test(noteText))return [];
      const signed=(Number(h.amount)||0)*(h.type==='退款'||h.type==='冲正'?-1:1);
      if(!signed)return [];
      const payMethod=String(h.payMethod||'').trim();
      return [{
        businessDate:h.date||'',
        businessType,
        payMethod,
        incomeAmount:signed,
        recognizedAmount:payMethod==='代用户订场'?0:signed
      }];
    });
  });
}
function financeRevenueRows(){
  const from=document.getElementById('coachOpsRevenueFrom')?.value||'';
  const to=document.getElementById('coachOpsRevenueTo')?.value||'';
  return financeRevenueRowsByFilters(financeRevenueBaseRows().filter(row=>coachOpsDateWithinRange(row.purchaseDate,from,to)))
    .sort((a,b)=>String(b.purchaseDate||'').localeCompare(String(a.purchaseDate||'')));
}
function renderFinanceRevenueReport(){
  const body=document.getElementById('financeRevenueTbody');
  const stats=document.getElementById('coachOpsRevenueStats');
  if(!body||!stats)return;
  const from=document.getElementById('coachOpsRevenueFrom')?.value||'';
  const to=document.getElementById('coachOpsRevenueTo')?.value||'';
  const baseRows=financeRevenueBaseRows().filter(row=>coachOpsDateWithinRange(row.purchaseDate,from,to));
  renderFinanceRevenueFilterDropdowns(baseRows);
  const rows=financeRevenueRows();
  const businessRows=rows.filter(row=>!row.differenceReason);
  const diffRows=rows.filter(row=>row.differenceReason);
  const totalIncome=businessRows.reduce((sum,row)=>sum+(Number(row.actualAmount)||0),0);
  const courseIncome=businessRows.filter(row=>row.sourceBusinessCategory==='课程').reduce((sum,row)=>sum+(Number(row.actualAmount)||0),0);
  const bookingIncome=businessRows.filter(row=>['会员订场','散客订场','约球局'].includes(row.sourceBusinessCategory)).reduce((sum,row)=>sum+(Number(row.actualAmount)||0),0);
  const storedValueIncome=businessRows.filter(row=>row.sourceBusinessCategory==='会员储值').reduce((sum,row)=>sum+(Number(row.actualAmount)||0),0);
  stats.innerHTML=[
    ['成交笔数',rows.length,'笔'],
    ['实收合计',`¥${fmt(totalIncome)}`,''],
    ['课程收入',`¥${fmt(courseIncome)}`,''],
    ['订场收入',`¥${fmt(bookingIncome)}`,''],
    ['会员储值',`¥${fmt(storedValueIncome)}`,''],
    ['差异项',`¥${fmt(diffRows.reduce((sum,row)=>sum+(Number(row.actualAmount)||0),0))}`,'']
  ].map(([label,val,unit])=>`<div class="tms-stat-card"><div class="tms-stat-label">${label}</div><div class="tms-stat-value">${val}${unit?`<span>${unit}</span>`:''}</div></div>`).join('');
  body.innerHTML=rows.length?rows.map(row=>`<tr><td style="padding-left:20px">${renderCourtCellText(row.purchaseDate,false)}</td><td>${renderCourtCellText(row.weekdayText,false)}</td><td>${renderCourtCellText(row.timeText,false)}</td><td>${renderCourtCellText(row.studentName,false)}</td><td>${renderCourtCellText(row.incomeType,false)}</td><td>${renderCourtCellText(row.payMethod,false)}</td><td>${financeAmountText(row.receivableAmount)}</td><td>${financeAmountText(row.actualAmount)}</td><td>${financeSignedAmountText(row.priceDiff)}</td><td>${renderCourtCellText(row.priceDiffReason,false)}</td><td>${renderCourtCellText(row.collector,false)}</td><td><div class="tms-text-remark" title="${esc(row.notes||'')}">${esc(renderCourtEmptyText(row.notes))}</div></td><td>${renderCourtCellText(row.campusName,false)}</td><td><span class="tms-tag ${row.status==='voided'?'tms-tag-tier-slate':'tms-tag-green'}">${esc(row.systemStatus)}</span></td><td class="tms-sticky-r" style="padding-right:20px">${renderCourtCellText(row.relatedDocument,false)}</td></tr>`).join(''):`<tr><td colspan="15"><div class="empty"><p>暂无收入表记录</p></div></td></tr>`;
}
function financeConsumeBaseRows(){
  return aggregateHistoricalMonthlyLedgerRows(dedupeEntitlementLedgerForDisplay(entitlementLedger)).filter(row=>{
    const ent=entitlements.find(e=>e.id===row.entitlementId)||{};
    const purchase=purchases.find(p=>p.id===ent.purchaseId)||{};
    const schedule=schedules.find(s=>s.id===row.scheduleId)||{};
    const campusName=financeCampusNameFromValue(schedule.campus||parseArr(ent.campusIds)[0]||purchase.campus||(students.find(s=>s.id===purchase.studentId)||{}).campus);
    if(!financeMatchesCampusName(campusName))return false;
    return true;
  }).map(row=>{
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
      coach:schedule.coach||purchase.ownerCoach||'—',
      courseType:scheduleCourseType(schedule)||ent.courseType||purchase.courseType||'—',
      campusName,
      recognizedAmount,
      confirmType:(Number(row.lessonDelta)||0)<0?'课程确认收入':'消耗回退',
      sourceProject:schedule.id?`${scheduleCourseType(schedule)||'课程'} ${fmtDt(schedule.startTime)}`:(row.reason||'历史导入'),
      debitTarget:ent.packageName||purchase.packageName||'课包',
      systemStatus:row.scheduleId||row.importSource==='系统导入'?'已关联':'待补来源',
      relatedDocument:row.scheduleId?`排课 ${row.scheduleId}`:`课包流水 ${row.id}`
    };
  });
}
function financeConsumeRows(){
  const q=String(document.getElementById('coachOpsConsumeSearch')?.value||'').trim().toLowerCase();
  const from=document.getElementById('coachOpsConsumeFrom')?.value||'';
  const to=document.getElementById('coachOpsConsumeTo')?.value||'';
  return financeConsumeBaseRows().filter(row=>{
    if(!coachOpsDateWithinRange(row.relatedDate||row.createdAt,from,to))return false;
    return searchHit(q,row.reason,row.notes,row.operator,row.studentName,row.packageName,row.coach,row.courseType,row.campusName,row.sourceProject,row.debitTarget);
  }).sort((a,b)=>String(b.relatedDate||b.createdAt||'').localeCompare(String(a.relatedDate||a.createdAt||'')));
}
function renderFinanceConsumeReport(){
  const body=document.getElementById('financeConsumeTbody');
  const stats=document.getElementById('coachOpsConsumeStats');
  if(!body||!stats)return;
  const rows=financeRecognizedRows();
  const courseRows=rows.filter(row=>row.businessType==='课程');
  const bookingRows=rows.filter(row=>['会员订场','散客订场','约球局'].includes(row.businessType));
  const rollbackRows=rows.filter(row=>Number(row.recognizedRevenueDelta||0)<0);
  const recognizedRevenue=rows.reduce((sum,row)=>sum+(Number(row.recognizedRevenueDelta)||0),0);
  stats.innerHTML=[
    ['流水条数',rows.length,'条'],
    ['课程已入账',`¥${fmt(courseRows.reduce((sum,row)=>sum+(Number(row.recognizedRevenueDelta)||0),0))}`,''],
    ['订场已入账',`¥${fmt(bookingRows.reduce((sum,row)=>sum+(Number(row.recognizedRevenueDelta)||0),0))}`,''],
    ['已入账合计',`¥${fmt(recognizedRevenue)}`,''],
    ['回退/冲回',rollbackRows.length,'条']
  ].map(([label,val,unit])=>`<div class="tms-stat-card"><div class="tms-stat-label">${label}</div><div class="tms-stat-value">${val}<span>${unit}</span></div></div>`).join('');
  body.innerHTML=rows.length?rows.map(row=>`<tr><td style="padding-left:20px">${renderCourtCellText(row.businessDate,false)}</td><td>${renderCourtCellText(row.customer,false)}</td><td>${renderCourtCellText(row.confirmType,false)}</td><td>${renderCourtCellText(row.sourceProject,false)}</td><td>${renderCourtCellText(row.debitTarget,false)}</td><td>${financeSignedAmountText(row.recognizedRevenueDelta)}</td><td>${renderCourtCellText(row.campusName,false)}</td><td><span class="tms-tag ${Number(row.recognizedRevenueDelta||0)>=0?'tms-tag-green':'tms-tag-tier-slate'}">${esc(row.systemStatus||'已入账')}</span></td><td class="tms-sticky-r" style="padding-right:20px">${renderCourtCellText(row.sourceDocument,false)}</td></tr>`).join(''):`<tr><td colspan="9"><div class="empty"><p>暂无已入账流水</p></div></td></tr>`;
}
function exportCoachOpsRevenueCsv(){
  const rows=financeRevenueRows();
  let csv='日期,星期,时间,客户,收入类型,支付方式,应收,实收,差价,差价说明,收款人,备注,校区,系统状态,关联单据\n';
  csv+=rows.map(row=>[row.purchaseDate||'',row.weekdayText||'',row.timeText||'',row.studentName||'',row.incomeType||'',row.payMethod||'',row.receivableAmount||0,row.actualAmount||0,row.priceDiff||0,'"'+String(row.priceDiffReason||'').replace(/"/g,'""')+'"','"'+String(row.collector||'').replace(/"/g,'""')+'"','"'+String(row.notes||'').replace(/"/g,'""')+'"',row.campusName||'',row.systemStatus||'',row.relatedDocument||''].join(',')).join('\n');
  const blob=new Blob(['\ufeff'+csv],{type:'text/csv;charset=utf-8;'});
  const a=document.createElement('a');a.href=URL.createObjectURL(blob);a.download='FlowTennis_收入表_'+today()+'.csv';a.click();toast('导出成功','success');
}
function exportCoachOpsConsumeCsv(){
  const rows=financeRecognizedRows();
  let csv='业务日期,客户,确认类型,来源项目,扣减标的,已入账,校区,系统状态,关联单据\n';
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
function financeLedgerBaseRows(){
  return financeUnifiedRows();
}
function financeLedgerRows(){
  const businessTypeFilter=String(document.getElementById('financeLedgerBusinessTypeFilter')?.value||'').trim();
  const actionFilter=String(document.getElementById('financeLedgerActionFilter')?.value||'').trim();
  const payMethodFilter=String(document.getElementById('financeLedgerPayMethodFilter')?.value||'').trim();
  return financeLedgerBaseRows().filter(row=>{
    if(!coachOpsDateWithinRange(row.businessDate,document.getElementById('financeLedgerFrom')?.value||'',document.getElementById('financeLedgerTo')?.value||''))return false;
    const q=String(document.getElementById('financeLedgerSearch')?.value||'').trim().toLowerCase();
    if(businessTypeFilter&&row.businessType!==businessTypeFilter)return false;
    if(actionFilter&&row.action!==actionFilter)return false;
    if(payMethodFilter&&String(row.paymentChannel||'—')!==payMethodFilter)return false;
    return searchHit(q,row.customer,row.businessType,row.action,row.paymentChannel,row.sourceDocument,row.notes,row.campusName);
  }).sort((a,b)=>String(b.businessDate||'').localeCompare(String(a.businessDate||'')));
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
  const diffHost=document.getElementById('financeOverviewDiffSummary');
  const secondaryHost=document.getElementById('financeOverviewSecondaryStats');
  if(!primaryHost)return;
  if(!syncFinanceLedgerLoadingState())return;
  const from=document.getElementById('financeLedgerFrom')?.value||'';
  const to=document.getElementById('financeLedgerTo')?.value||'';
  const rows=financeUnifiedRows().filter(row=>coachOpsDateWithinRange(row.businessDate,from,to));
  const businessRows=rows.filter(row=>!row.differenceReason);
  const diffRows=rows.filter(row=>row.differenceReason);
  const positiveCashRows=businessRows.filter(row=>Number(row.cashDelta)>0);
  const finalPackageIncome=positiveCashRows.filter(row=>row.businessType==='课程').reduce((sum,row)=>sum+(Number(row.cashDelta)||0),0);
  const finalPackageRecognized=businessRows.filter(row=>row.businessType==='课程').reduce((sum,row)=>sum+(Number(row.recognizedRevenueDelta)||0),0);
  const finalStoredValueIncome=positiveCashRows.filter(row=>row.businessType==='会员储值').reduce((sum,row)=>sum+(Number(row.cashDelta)||0),0);
  const finalStoredValueRecognized=businessRows.filter(row=>row.businessType==='会员订场').reduce((sum,row)=>sum+(Number(row.recognizedRevenueDelta)||0),0);
  const finalBookingIncome=positiveCashRows.filter(row=>['散客订场','约球局'].includes(row.businessType)).reduce((sum,row)=>sum+(Number(row.cashDelta)||0),0);
  const finalBookingRecognized=businessRows.filter(row=>['散客订场','约球局'].includes(row.businessType)).reduce((sum,row)=>sum+(Number(row.recognizedRevenueDelta)||0),0);
  const finalCash=finalPackageIncome+finalStoredValueIncome+finalBookingIncome;
  const finalRecognized=finalPackageRecognized+finalStoredValueRecognized+finalBookingRecognized;
  const finalDeferred=finalCash-finalRecognized;
  const diffAmount=diffRows.reduce((sum,row)=>sum+(Number(row.cashDelta)||0),0);
  const renderStatCards=items=>items.map(item=>`<div class="tms-stat-card"><div class="tms-stat-label">${item.label}</div><div class="tms-stat-value${item.split?' finance-split-value':''}">${item.value}</div></div>`).join('');
  primaryHost.innerHTML=renderStatCards([
    {label:'总收入（实收）',value:financeCardValue(finalCash)},
    {label:'总已入账 / 总未入账',value:financeCardValue(finalRecognized,finalDeferred),split:true},
    {label:'课包收入 / 已入账',value:financeCardValue(finalPackageIncome,finalPackageRecognized),split:true},
    {label:'会员储值 / 已入账',value:financeCardValue(finalStoredValueIncome,finalStoredValueRecognized),split:true},
    {label:'订场收入 / 已入账',value:financeCardValue(finalBookingIncome,finalBookingRecognized),split:true}
  ]);
  const diffHtml=diffRows.length?`<strong>差异项已单列：</strong> ${diffRows.length} 笔。当前不计入【课包收入 / 会员储值 / 订场收入】3 类业务卡片。`:'';
  if(diffHost){
    if(diffHtml){
      diffHost.style.display='';
      diffHost.innerHTML=diffHtml;
    }else{
      diffHost.style.display='none';
      diffHost.innerHTML='';
    }
  }
  if(secondaryHost){
    if(diffHtml&&!diffHost){
      secondaryHost.innerHTML=`<div class="tms-audit-note">${diffHtml}</div>`;
    }else{
      secondaryHost.innerHTML='';
    }
  }
}
function renderFinanceLedgerFilterDropdowns(baseRows){
  const businessHost=document.getElementById('financeLedgerBusinessTypeFilterHost');
  const actionHost=document.getElementById('financeLedgerActionFilterHost');
  const payMethodHost=document.getElementById('financeLedgerPayMethodFilterHost');
  if(!businessHost||!actionHost||!payMethodHost)return;
  const currentBusiness=String(document.getElementById('financeLedgerBusinessTypeFilter')?.value||'').trim();
  const currentAction=String(document.getElementById('financeLedgerActionFilter')?.value||'').trim();
  const currentPayMethod=String(document.getElementById('financeLedgerPayMethodFilter')?.value||'').trim();
  const businessOptions=[{ value:'', label:'全部业务类型' },...Array.from(new Set((baseRows||[]).map(row=>row.businessType).filter(Boolean))).sort((a,b)=>String(a).localeCompare(String(b),'zh-Hans-CN')).map(item=>({ value:item, label:item }))];
  const actionOptions=[{ value:'', label:'全部动作' },...Array.from(new Set((baseRows||[]).map(row=>row.action).filter(Boolean))).sort((a,b)=>String(a).localeCompare(String(b),'zh-Hans-CN')).map(item=>({ value:item, label:item }))];
  const payMethodOptions=[{ value:'', label:'全部支付方式' },...Array.from(new Set((baseRows||[]).map(row=>row.paymentChannel||'—').filter(Boolean))).sort((a,b)=>String(a).localeCompare(String(b),'zh-Hans-CN')).map(item=>({ value:item, label:item }))];
  businessHost.innerHTML=renderCourtDropdownHtml('financeLedgerBusinessTypeFilter','全部业务类型',businessOptions,businessOptions.some(item=>item.value===currentBusiness)?currentBusiness:'',false,'renderFinanceLedgerFilterChange');
  actionHost.innerHTML=renderCourtDropdownHtml('financeLedgerActionFilter','全部动作',actionOptions,actionOptions.some(item=>item.value===currentAction)?currentAction:'',false,'renderFinanceLedgerFilterChange');
  payMethodHost.innerHTML=renderCourtDropdownHtml('financeLedgerPayMethodFilter','全部支付方式',payMethodOptions,payMethodOptions.some(item=>item.value===currentPayMethod)?currentPayMethod:'',false,'renderFinanceLedgerFilterChange');
}
function renderFinanceLedgerFilterChange(){
  resetFinanceLedgerPage();
  renderFinanceLedger();
}
function renderFinanceLedger(){
  const body=document.getElementById('financeLedgerTbody');
  if(!body)return;
  if(!syncFinanceLedgerLoadingState())return;
  const baseRows=financeLedgerBaseRows().filter(row=>coachOpsDateWithinRange(row.businessDate,document.getElementById('financeLedgerFrom')?.value||'',document.getElementById('financeLedgerTo')?.value||''));
  renderFinanceLedgerFilterDropdowns(baseRows);
  renderFinanceLedgerPageSizeFilter();
  const rows=financeLedgerRows();
  const total=rows.length;
  const pages=Math.max(1,Math.ceil(total/financeLedgerPageSize));
  if(financeLedgerPage>pages)financeLedgerPage=pages;
  const slice=rows.slice((financeLedgerPage-1)*financeLedgerPageSize,financeLedgerPage*financeLedgerPageSize);
  const pager=document.querySelector('#page-finance #financeLedgerPanel .tms-pagination');
  if(pager)pager.style.display=total>0?'flex':'none';
  const pagerInfo=document.getElementById('financeLedgerPagerInfo');
  if(pagerInfo)pagerInfo.textContent=`共 ${total} 条`;
  const pagerBtns=document.getElementById('financeLedgerPagerBtns');
  if(pagerBtns)pagerBtns.innerHTML=pages<=1?'':Array.from({length:pages},(_,i)=>`<div class="tms-page-btn${i+1===financeLedgerPage?' active':''}" onclick="setFinanceLedgerPage(${i+1})">${i+1}</div>`).join('');
  body.innerHTML=slice.length?slice.map(row=>`<tr><td style="padding-left:20px">${renderCourtCellText(row.businessDate,false)}</td><td>${renderCourtCellText(row.customer,false)}</td><td>${renderCourtCellText(row.campusName,false)}</td><td><span class="tms-tag ${financeTagClassByText(row.businessType,'business')}">${esc(row.businessType)}</span></td><td><span class="tms-tag ${financeTagClassByText(row.action,'action')}">${esc(row.action)}</span></td><td>${financeSignedAmountText(row.cashDelta)}</td><td>${financeSignedAmountText(row.recognizedRevenueDelta)}</td><td>${financeSignedAmountText(row.deferredRevenueDelta)}</td><td><span class="tms-tag ${financeTagClassByText(row.paymentChannel,'payment')}">${esc(renderCourtEmptyText(row.paymentChannel))}</span></td><td>${renderCourtCellText(row.sourceDocument,false)}</td><td><div class="tms-text-remark" title="${esc(row.notes||'')}">${esc(renderCourtEmptyText(row.notes))}</div></td></tr>`).join(''):`<tr><td colspan="11"><div class="empty"><p>暂无总账记录</p></div></td></tr>`;
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
  body.innerHTML=rows.length?rows.map(row=>`<tr><td style="padding-left:20px">${renderCourtCellText(row.customer,false)}</td><td>${renderCourtCellText(row.campusName,false)}</td><td>${renderCourtCellText(row.deferredType==='课包待确认'?'课包':'会员储值',false)}</td><td>${financeAmountText(row.deferredAmount)}</td><td>${renderCourtCellText(row.source,false)}</td><td><div class="tms-text-remark">${esc(renderCourtEmptyText(row.notes))}</div></td></tr>`).join(''):`<tr><td colspan="6"><div class="empty"><p>暂无待确认收入</p></div></td></tr>`;
}
function financeSettlementRows(){
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
function renderFinanceSettlementSummary(){
  const host=document.getElementById('financeSettlementStats');
  const body=document.getElementById('financeSettlementTbody');
  if(!host||!body)return;
  const rows=financeSettlementRows();
  const totalLessons=rows.reduce((sum,row)=>sum+(Number(row.lessonUnits)||0),0);
  const totalLateCount=rows.reduce((sum,row)=>sum+(Number(row.lateCount)||0),0);
  const totalLateFee=rows.reduce((sum,row)=>sum+(Number(row.lateFeeAmount)||0),0);
  host.innerHTML=[
    ['结算教练数',rows.length,'人'],
    ['已完成课时数',lessonUnitsText(totalLessons),'节'],
    ['迟到记录',totalLateCount,'条'],
    ['承担场地费',`¥${fmt(totalLateFee)}`,'']
  ].map(([label,val,unit])=>`<div class="tms-stat-card"><div class="tms-stat-label">${label}</div><div class="tms-stat-value">${val}${unit?`<span>${unit}</span>`:''}</div></div>`).join('');
  body.innerHTML=rows.length?rows.map(row=>`<tr><td style="padding-left:20px">${renderCourtCellText(row.coach,false)}</td><td>${renderCourtCellText(row.campusName,false)}</td><td>${renderCourtCellText(`${lessonUnitsText(row.lessonUnits)} 节`,false)}</td><td>${renderCourtCellText(`${row.lateCount} 条`,false)}</td><td>${financeAmountText(row.lateFeeAmount)}</td></tr>`).join(''):`<tr><td colspan="5"><div class="empty"><p>当前月份暂无教练结算记录</p></div></td></tr>`;
}
