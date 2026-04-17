// ===== 教练运营 =====
function setCoachOpsPanel(panel){
  coachOpsPanel=panel==='workload'?'workload':'schedule';
  const schedulePanel=document.getElementById('coachOpsSchedulePanel');
  const workloadPanel=document.getElementById('coachOpsWorkloadPanel');
  const scheduleTab=document.getElementById('coachOpsTabSchedule');
  const workloadTab=document.getElementById('coachOpsTabWorkload');
  if(schedulePanel)schedulePanel.style.display=coachOpsPanel==='schedule'?'':'none';
  if(workloadPanel)workloadPanel.style.display=coachOpsPanel==='workload'?'':'none';
  if(scheduleTab)scheduleTab.classList.toggle('active',coachOpsPanel==='schedule');
  if(workloadTab)workloadTab.classList.toggle('active',coachOpsPanel==='workload');
}
function updateCoachOpsDateButton(){
  const btn=document.getElementById('coachOpsDateBtn');
  if(btn)btn.textContent=coachOpsDateLabel();
}
function closeCoachOpsPicker(){document.getElementById('coachOpsPicker')?.classList.remove('open');}
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
}
