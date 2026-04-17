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
  financePanel=['revenue','consume','settlement'].includes(panel)?panel:'revenue';
  const revenuePanel=document.getElementById('financeRevenuePanel');
  const consumePanel=document.getElementById('financeConsumePanel');
  const settlementPanel=document.getElementById('financeSettlementPanel');
  const revenueTab=document.getElementById('financeTabRevenue');
  const consumeTab=document.getElementById('financeTabConsume');
  const settlementTab=document.getElementById('financeTabSettlement');
  if(revenuePanel)revenuePanel.style.display=financePanel==='revenue'?'':'none';
  if(consumePanel)consumePanel.style.display=financePanel==='consume'?'':'none';
  if(settlementPanel)settlementPanel.style.display=financePanel==='settlement'?'':'none';
  if(revenueTab)revenueTab.classList.toggle('active',financePanel==='revenue');
  if(consumeTab)consumeTab.classList.toggle('active',financePanel==='consume');
  if(settlementTab)settlementTab.classList.toggle('active',financePanel==='settlement');
}
function renderFinanceCenter(){
  ensureCoachOpsReportDateControls();
  setFinancePanel(financePanel);
  renderCoachOpsRevenueReport();
  renderCoachOpsConsumeReport();
  renderFinanceSettlementSummary();
}
function updateCoachOpsDateButton(){
  const btn=document.getElementById('coachOpsDateBtn');
  if(btn)btn.textContent=coachOpsDateLabel();
}
function closeCoachOpsPicker(){document.getElementById('coachOpsPicker')?.classList.remove('open');}
function ensureCoachOpsReportDateControls(){
  const monthStartValue=today().slice(0,8)+'01';
  const configs=[
    ['coachOpsRevenueFromHost','coachOpsRevenueFrom','开始日期',document.getElementById('coachOpsRevenueFrom')?.value||monthStartValue,'renderCoachOpsRevenueReport()'],
    ['coachOpsRevenueToHost','coachOpsRevenueTo','结束日期',document.getElementById('coachOpsRevenueTo')?.value||today(),'renderCoachOpsRevenueReport()'],
    ['coachOpsConsumeFromHost','coachOpsConsumeFrom','开始日期',document.getElementById('coachOpsConsumeFrom')?.value||monthStartValue,'renderCoachOpsConsumeReport()'],
    ['coachOpsConsumeToHost','coachOpsConsumeTo','结束日期',document.getElementById('coachOpsConsumeTo')?.value||today(),'renderCoachOpsConsumeReport()']
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
  const todayTotal=rows.reduce((n,r)=>n+r.todayRows.length,0);
  const weekTotal=rows.reduce((n,r)=>n+r.weekRows.length,0);
  const rangeTotal=rows.reduce((n,r)=>n+r.rangeRows.length,0);
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
        return `<div class="coach-ops-block ${coachOpsCourseTypeTagClass(scheduleCourseType(s))}" style="left:${left}%;width:${Math.min(width,100-left)}%" onclick="event.stopPropagation();openScheduleDetail('${s.id}')"><div class="coach-ops-time">${s.startTime.slice(11,16)}${s.endTime?' - '+s.endTime.slice(11,16):''}</div><div class="coach-ops-student">${esc(s.studentName)||esc(classes.find(c=>c.id===s.classId)?.className)||'—'}</div><div class="coach-ops-location">${cn(s.campus)} · ${esc(s.venue)||'—'}</div></div>`;
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
  document.getElementById('coachOpsTbody').innerHTML=rows.map(r=>`<tr><td><div class="uname">${esc(r.name)}</div></td><td>${r.rangeRows.length} 节</td><td>${r.rangeRows.reduce((n,s)=>n+scheduleDurMin(s),0)} 分钟</td><td><span class="badge ${r.pending?'b-red':'b-green'}">${r.pending}</span></td><td>${distText(r.rangeRows,s=>cn(s.campus))}</td><td>${distText(r.rangeRows,timeBand)}</td><td>${r.conflicts?`<span class="badge b-red">冲突 ${r.conflicts}</span>`:r.risks?`<span class="badge b-amber">跨校区紧 ${r.risks}</span>`:'<span class="badge b-green">正常</span>'}</td></tr>`).join('');
  renderCoachOpsRevenueReport();
  renderCoachOpsConsumeReport();
}

function coachOpsDateWithinRange(value,from,to){
  const day=String(value||'').slice(0,10);
  if(!day)return false;
  if(from&&day<from)return false;
  if(to&&day>to)return false;
  return true;
}
function coachOpsRevenueRows(){
  const q=String(document.getElementById('coachOpsRevenueSearch')?.value||'').trim().toLowerCase();
  const from=document.getElementById('coachOpsRevenueFrom')?.value||'';
  const to=document.getElementById('coachOpsRevenueTo')?.value||'';
  return purchases.filter(p=>{
    if(!coachOpsDateWithinRange(p.purchaseDate||p.createdAt,from,to))return false;
    return searchHit(q,p.studentName,p.packageName,p.productName,p.ownerCoach,p.payMethod,p.notes);
  }).sort((a,b)=>String(b.purchaseDate||b.createdAt||'').localeCompare(String(a.purchaseDate||a.createdAt||''))).map(p=>{
    const ent=entitlements.find(e=>e.purchaseId===p.id)||{};
    const total=parseInt(ent.totalLessons)||parseInt(p.packageLessons)||0;
    const remaining=parseInt(ent.remainingLessons)||0;
    const used=Math.max(0,total-remaining);
    return {...p,entitlement:ent,totalLessons:total,usedLessons:used,remainingLessons:remaining};
  });
}
function renderCoachOpsRevenueReport(){
  const body=document.getElementById('coachOpsRevenueTbody');
  const stats=document.getElementById('coachOpsRevenueStats');
  if(!body||!stats)return;
  const rows=coachOpsRevenueRows();
  const totalIncome=rows.reduce((sum,row)=>sum+(Number(row.amountPaid)||0),0);
  const totalLessons=rows.reduce((sum,row)=>sum+(Number(row.totalLessons)||0),0);
  const usedLessons=rows.reduce((sum,row)=>sum+(Number(row.usedLessons)||0),0);
  stats.innerHTML=[
    ['成交笔数',rows.length,'笔'],
    ['实收合计',`¥${fmt(totalIncome)}`,''],
    ['售出课时',totalLessons,'节'],
    ['已消课时',usedLessons,'节']
  ].map(([label,val,unit])=>`<div class="tms-stat-card"><div class="tms-stat-label">${label}</div><div class="tms-stat-value">${val}${unit?`<span>${unit}</span>`:''}</div></div>`).join('');
  body.innerHTML=rows.length?rows.map(row=>`<tr><td style="padding-left:20px">${renderCourtCellText(row.purchaseDate,false)}</td><td>${renderCourtCellText(row.studentName,false)}</td><td><div class="tms-text-primary">${esc(renderCourtEmptyText(row.packageName))}</div><div class="tms-text-secondary">${esc(renderCourtEmptyText(row.entitlement?.timeBand||row.packageTimeBand||'全天'))}</div></td><td>${renderCourtCellText(row.productName,false)}</td><td>${renderCourtCellText(row.ownerCoach,false)}</td><td>¥${fmt(row.amountPaid)}</td><td>${row.totalLessons||0} 节</td><td>${row.usedLessons||0} 节</td><td>${row.remainingLessons||0} 节</td><td>${row.entitlement?.validFrom||'—'} - ${row.entitlement?.validUntil||'—'}</td><td>${renderCourtCellText(row.payMethod,false)}</td><td><span class="tms-tag ${row.status==='voided'?'tms-tag-tier-slate':'tms-tag-green'}">${purchaseStatusText(row)}</span></td><td class="tms-sticky-r tms-action-cell" style="width:110px;padding-right:20px"><span class="tms-action-link" onclick="openPurchaseDetailModal('${row.id}')">查看</span></td></tr>`).join(''):`<tr><td colspan="13"><div class="empty"><p>暂无收入课时记录</p></div></td></tr>`;
}
function coachOpsConsumeRows(){
  const q=String(document.getElementById('coachOpsConsumeSearch')?.value||'').trim().toLowerCase();
  const from=document.getElementById('coachOpsConsumeFrom')?.value||'';
  const to=document.getElementById('coachOpsConsumeTo')?.value||'';
  return entitlementLedger.filter(row=>{
    if(!coachOpsDateWithinRange(row.createdAt||row.relatedDate,from,to))return false;
    const ent=entitlements.find(e=>e.id===row.entitlementId)||{};
    const purchase=purchases.find(p=>p.id===ent.purchaseId)||{};
    const schedule=schedules.find(s=>s.id===row.scheduleId)||{};
    return searchHit(q,row.reason,row.operator,ent.studentName,ent.packageName,purchase.studentName,schedule.coach,schedule.studentName);
  }).sort((a,b)=>String(b.createdAt||b.relatedDate||'').localeCompare(String(a.createdAt||a.relatedDate||''))).map(row=>{
    const ent=entitlements.find(e=>e.id===row.entitlementId)||{};
    const purchase=purchases.find(p=>p.id===ent.purchaseId)||{};
    const schedule=schedules.find(s=>s.id===row.scheduleId)||{};
    return {
      ...row,
      actionLabel:(parseInt(row.lessonDelta)||0)<0?'扣课':'退回',
      studentName:ent.studentName||purchase.studentName||schedule.studentName||'—',
      packageName:ent.packageName||purchase.packageName||'—',
      scheduleTime:schedule.startTime||'',
      coach:schedule.coach||purchase.ownerCoach||'—',
      courseType:scheduleCourseType(schedule)||ent.courseType||purchase.courseType||'—'
    };
  });
}
function renderCoachOpsConsumeReport(){
  const body=document.getElementById('coachOpsConsumeTbody');
  const stats=document.getElementById('coachOpsConsumeStats');
  if(!body||!stats)return;
  const rows=coachOpsConsumeRows();
  const usedRows=rows.filter(row=>row.actionLabel==='扣课');
  const refundRows=rows.filter(row=>row.actionLabel==='退回');
  const usedLessons=usedRows.reduce((sum,row)=>sum+Math.abs(parseInt(row.lessonDelta)||0),0);
  stats.innerHTML=[
    ['流水条数',rows.length,'条'],
    ['扣课节数',usedLessons,'节'],
    ['退回记录',refundRows.length,'条'],
    ['异常风险',rows.filter(row=>!row.scheduleId).length,'条']
  ].map(([label,val,unit])=>`<div class="tms-stat-card"><div class="tms-stat-label">${label}</div><div class="tms-stat-value">${val}<span>${unit}</span></div></div>`).join('');
  body.innerHTML=rows.length?rows.map(row=>`<tr><td style="padding-left:20px">${fmtDt(row.createdAt||row.relatedDate)}</td><td><span class="tms-tag ${row.actionLabel==='扣课'?'tms-tag-tier-gold':'tms-tag-tier-slate'}">${row.actionLabel}</span></td><td>${renderCourtCellText(row.studentName,false)}</td><td>${renderCourtCellText(row.packageName,false)}</td><td>${Math.abs(parseInt(row.lessonDelta)||0)} 节</td><td>${renderCourtCellText(row.scheduleTime?fmtDt(row.scheduleTime):'—',false)}</td><td>${renderCourtCellText(row.coach,false)}</td><td>${renderCourtCellText(row.courseType,false)}</td><td>${renderCourtCellText(row.reason,false)}</td><td>${renderCourtCellText(row.operator,false)}</td><td class="tms-sticky-r tms-action-cell" style="width:100px;padding-right:20px">${row.scheduleId?`<span class="tms-action-link" onclick="openScheduleDetail('${row.scheduleId}')">排课</span>`:'—'}</td></tr>`).join(''):`<tr><td colspan="11"><div class="empty"><p>暂无消课记录</p></div></td></tr>`;
}
function exportCoachOpsRevenueCsv(){
  const rows=coachOpsRevenueRows();
  let csv='支付日期,学员,售卖课包,课程产品,主归属教练,实收金额,总课时,已消课时,剩余课时,有效开始,有效结束,支付方式,状态\n';
  csv+=rows.map(row=>[row.purchaseDate||'',row.studentName||'',row.packageName||'',row.productName||'',row.ownerCoach||'',Number(row.amountPaid)||0,row.totalLessons||0,row.usedLessons||0,row.remainingLessons||0,row.entitlement?.validFrom||'',row.entitlement?.validUntil||'',row.payMethod||'',purchaseStatusText(row)].join(',')).join('\n');
  const blob=new Blob(['\ufeff'+csv],{type:'text/csv;charset=utf-8;'});
  const a=document.createElement('a');a.href=URL.createObjectURL(blob);a.download='FlowTennis_收入课时表_'+today()+'.csv';a.click();toast('导出成功','success');
}
function exportCoachOpsConsumeCsv(){
  const rows=coachOpsConsumeRows();
  let csv='流水时间,类型,学员,课包,课时变动,排课时间,教练,课程类型,原因,操作人\n';
  csv+=rows.map(row=>[fmtDt(row.createdAt||row.relatedDate),row.actionLabel,row.studentName||'',row.packageName||'',Math.abs(parseInt(row.lessonDelta)||0),row.scheduleTime?fmtDt(row.scheduleTime):'',row.coach||'',row.courseType||'','"'+String(row.reason||'').replace(/"/g,'""')+'"',row.operator||''].join(',')).join('\n');
  const blob=new Blob(['\ufeff'+csv],{type:'text/csv;charset=utf-8;'});
  const a=document.createElement('a');a.href=URL.createObjectURL(blob);a.download='FlowTennis_消课记录_'+today()+'.csv';a.click();toast('导出成功','success');
}
function renderFinanceSettlementSummary(){
  const host=document.getElementById('financeSettlementStats');
  const top=document.getElementById('financeStatsRow');
  if(!host||!top)return;
  const revenueRows=coachOpsRevenueRows();
  const consumeRows=coachOpsConsumeRows();
  const lateRows=(schedules||[]).filter(s=>s.coachLateMinutes&&String(s.startTime||'').slice(0,7)===today().slice(0,7));
  top.innerHTML=[
    ['本月实收',`¥${fmt(revenueRows.reduce((sum,row)=>sum+(Number(row.amountPaid)||0),0))}`,''],
    ['本月消课',consumeRows.filter(row=>row.actionLabel==='扣课').reduce((sum,row)=>sum+Math.abs(parseInt(row.lessonDelta)||0),0),'节'],
    ['退款/退回',consumeRows.filter(row=>row.actionLabel==='退回').length,'条'],
    ['迟到待结',lateRows.length,'条']
  ].map(([label,val,unit])=>`<div class="tms-stat-card"><div class="tms-stat-label">${label}</div><div class="tms-stat-value">${val}${unit?`<span>${unit}</span>`:''}</div></div>`).join('');
  host.innerHTML=[
    ['本月迟到记录',lateRows.length,'条'],
    ['迟到分钟',lateRows.reduce((sum,row)=>sum+(parseInt(row.coachLateMinutes)||0),0),'分'],
    ['待承担场地费',`¥${fmt(lateRows.reduce((sum,row)=>sum+(Number(row.coachLateFeeAmount)||0),0))}`,''],
    ['结算状态','未锁定','']
  ].map(([label,val,unit])=>`<div class="tms-stat-card"><div class="tms-stat-label">${label}</div><div class="tms-stat-value">${val}${unit?`<span>${unit}</span>`:''}</div></div>`).join('');
}
