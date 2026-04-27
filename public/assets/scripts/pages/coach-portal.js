function workbenchScheduleState(schedule,prevSchedule,now){
  if(schedule?.workbenchState&&schedule.workbenchState.code&&schedule.workbenchState.label)return schedule.workbenchState;
  const start=dtObj(schedule.startTime),end=dtObj(schedule.endTime||schedule.startTime);
  const startDiff=start?durMin(now,start):-1;
  const travelGap=myScheduleTravelGap(prevSchedule,schedule);
  const ended=effectiveScheduleStatus(schedule,now)==='已结束';
  if(start&&end&&start<=now&&now<end){
    return {code:'live',label:'进行中'};
  }
  if(start&&start>now&&startDiff>=0&&startDiff<=30){
    return {code:'upcoming',label:'即将开始'};
  }
  if(start&&start>now&&travelGap>=0&&travelGap<60){
    return {code:'travel',label:'需换场',hint:`跨校区提醒：上一节下课到这节上课仅 ${travelGap} 分钟`};
  }
  if(ended&&!hasScheduleFeedback(schedule)){
    return {code:'pending',label:'待反馈'};
  }
  return null;
}
function workbenchMetricHelpHtml(){
  return `<div class="coach-wb-help-wrap"><button type="button" class="coach-wb-help-btn" aria-label="查看指标口径" onclick="toggleWorkbenchMetricHelp(event)"><span>?</span></button><div class="coach-wb-help-popover" id="workbenchMetricHelp"><div>本月课时 = 本月已结束课程课时数</div><div>本周课时 = 本周已结束课程课时数</div><div>今天课时 = 今天已结束课程课时数</div><div>本月反馈 = 本月已结束且已填写课后反馈的课程数</div><div>未反馈 = 已结束但未填写反馈的课程数</div><div>本月体验课转化率 = 本月已结束体验课中，后续已购买任意产品的学员占比</div></div></div>`;
}
function toggleWorkbenchMetricHelp(event){
  if(event)event.stopPropagation();
  const panel=document.getElementById('workbenchMetricHelp');
  if(!panel)return;
  panel.classList.toggle('open');
}
function workbenchTrialConvertedByPurchase(schedule){
  const studentId=parseArr(schedule?.studentIds)[0]||scheduleFeedback(schedule)?.studentId||schedule?.studentId||'';
  const studentName=String(scheduleStudentSummary(schedule)||schedule?.studentName||'').trim();
  const trialDate=String(schedule?.endTime||schedule?.startTime||'').slice(0,10);
  if(!trialDate)return false;
  return purchases.some(p=>{
    if(p?.status==='voided')return false;
    const purchaseDate=String(p.purchaseDate||p.createdAt||'').slice(0,10);
    if(!purchaseDate||purchaseDate<trialDate)return false;
    if(studentId)return String(p.studentId||'')===studentId;
    return studentName&&String(p.studentName||'').trim()===studentName;
  });
}
function workbenchSummaryCounts(rows,now){
  const completed=rows.filter(s=>{
    const end=dtObj(s.endTime||s.startTime);
    return end&&end<=now;
  }).length;
  const upcoming=rows.filter(s=>{
    const start=dtObj(s.startTime);
    const diff=start?durMin(now,start):-1;
    return start&&start>now&&diff>=0&&diff<=30;
  }).length;
  const pending=rows.filter(s=>effectiveScheduleStatus(s,now)==='已结束'&&!hasScheduleFeedback(s)).length;
  const trial=rows.filter(s=>scheduleIsTrial(s)&&effectiveScheduleStatus(s,now)==='已结束'&&!hasTrialConversionDecision(scheduleFeedback(s))).length;
  return {completed,upcoming,pending,trial};
}
function workbenchSection(title,rows,buttonText,now,meta={}){
  const sorted=rows.slice().sort((a,b)=>String(a.startTime||'').localeCompare(String(b.startTime||'')));
  const cards=sorted.map((s,i)=>{
    const state=workbenchScheduleState(s,sorted[i-1],now);
    if(!state)return '';
    const courseType=scheduleCourseType(s);
    const typeClass=courseType==='训练营'?'rust':courseType==='体验课'?'caramel':courseType==='班课'?'sage':'stone';
    const stateClass=state.code==='live'?'is-progress':(state.code==='upcoming'||state.code==='travel')?'is-upcoming':state.code==='pending'?'is-feedback':'is-normal';
    const badgeClass=state.code==='live'?'is-progress':(state.code==='upcoming'||state.code==='travel')?'is-upcoming':state.code==='pending'?'is-feedback':'is-normal';
    const alertText=state.code==='travel'?'⚠️ 跨校区，建议立即出发换场':state.code==='live'?'课程正在进行中':state.code==='pending'?'已下课，待填写反馈':(s.notes||'');
    const primaryLabel=state.code==='pending'?'填写反馈':state.code==='live'?'查看进度':'查看详情';
    const primaryClass=state.code==='pending'?'is-warning':(state.code==='live'||state.code==='upcoming')?'is-primary':'';
    const primaryAction=state.code==='pending'?`openFeedbackModal('${s.id}')`:`openScheduleDetail('${s.id}')`;
    const alertHtml=alertText?`<div class="coach-wb-row4"><div class="coach-wb-alert">${esc(alertText)}</div></div>`:'';
    return `<div class="coach-wb-card ${stateClass}"><div class="coach-wb-card-body"><div class="coach-wb-row1"><div class="coach-wb-time">${s.startTime.slice(11,16)}${s.endTime?` - ${s.endTime.slice(11,16)}`:''}</div><div class="coach-wb-badge ${badgeClass}">${state.label}</div></div><div class="coach-wb-name">${esc(scheduleStudentSummary(s))}</div><div class="coach-wb-row3"><span class="coach-wb-tag is-${typeClass}">${esc(courseType)}</span><span>${esc(scheduleLocationText(s))}</span></div>${alertHtml}</div><div class="coach-wb-card-footer"><button class="coach-wb-action" onclick="openScheduleDetail('${s.id}')">查看详情</button><button class="coach-wb-action ${primaryClass}" onclick="${primaryAction}">${primaryLabel}</button></div></div>`;
  }).join('');
  return `<div id="${esc(meta.anchor||'workbench-today')}"><div class="coach-wb-group-title">${esc(title)}</div>${cards?`<div class="coach-wb-grid">${cards}</div>`:'<div class="workbench-empty">今天暂无课程</div>'}</div>`;
}
function ensureWorkbenchTicker(){
  if(workbenchTicker)return;
  workbenchTicker=setInterval(()=>{if(currentPage==='workbench')renderWorkbench();},1000);
}
function renderWorkbench(){
  ensureWorkbenchTicker();
  const coach=getMyCoachName();
  const myRows=billableSchedules().filter(s=>coachName(s.coach)===coach).sort((a,b)=>String(a.startTime).localeCompare(String(b.startTime)));
  const now=shanghaiNow();
  const currentTimeText=`${now.getMonth()+1}/${now.getDate()} ${['周日','周一','周二','周三','周四','周五','周六'][now.getDay()]} ${now.toTimeString().slice(0,8)}`;
  const todayStr=localDateKey(now);
  const week=getWeekDates(0);
  const weekStart=week[0].toISOString().slice(0,10);
  const weekEnd=week[6].toISOString().slice(0,10);
  const weekRows=myRows.filter(s=>{const d=String(s.startTime||'').slice(0,10);return d>=weekStart&&d<=weekEnd;});
  const coachWorkbenchStats=window.coachWorkbenchStats||{};
  const host=document.getElementById('workbenchBody');
  if(!host)return;
  const statsHtml=[
    ['本月课时',lessonUnitsText(coachWorkbenchStats.monthFinishedLessonUnits||0),'节','以后端统计为准',false],
    ['本周课时',lessonUnitsText(coachWorkbenchStats.weekFinishedLessonUnits||0),'节','以后端统计为准',false],
    ['今天课时',lessonUnitsText(coachWorkbenchStats.todayFinishedLessonUnits||0),'节','以后端统计为准',false],
    ['本月反馈',coachWorkbenchStats.monthFeedbackCount||0,'节','以后端统计为准',false],
    ['未反馈',coachWorkbenchStats.pendingFeedbackCount||0,'节','以后端统计为准',(coachWorkbenchStats.pendingFeedbackCount||0)>0],
    ['本月体验课转化率',coachWorkbenchStats.trialConversionRate||0,'%', '以后端统计为准',false]
  ].map(([label,val,u,sub,accent])=>`<div class="coach-wb-stat-card"><div class="coach-wb-stat-label">${label}</div><div class="coach-wb-stat-value"${accent?' style="color:#8C4A32;"':''}>${val}<span>${u}</span></div><div class="coach-wb-stat-sub">${sub}</div></div>`).join('');
  const WDNAMES=['周一','周二','周三','周四','周五','周六','周日'];
  const weekBoardHtml=week.map((d,i)=>{
    const ds=d.toISOString().slice(0,10);
    const isToday=ds===todayStr;
    const isPast=ds<todayStr;
    const dayRows=weekRows.filter(s=>String(s.startTime||'').slice(0,10)===ds)
      .sort((a,b)=>String(a.startTime||'').localeCompare(String(b.startTime||'')));
    if(!dayRows.length&&!isToday)return'';
    const dayLabel=`${WDNAMES[i]} ${d.getMonth()+1}/${d.getDate()}${isToday?' · 今天':''}`;
    const cards=dayRows.map((s,idx)=>{
      const state=workbenchScheduleState(s,dayRows[idx-1],now);
      if(!state)return '';
      const courseType=scheduleCourseType(s);
      const typeClass=courseType==='训练营'?'rust':courseType==='体验课'?'caramel':courseType==='班课'?'sage':'stone';
      const stateClass=state.code==='live'?'is-progress':(state.code==='upcoming'||state.code==='travel')?'is-upcoming':state.code==='pending'?'is-feedback':'is-normal';
      const badgeClass=stateClass;
      const isAlertWarn=state.code==='travel'||state.code==='live'||state.code==='pending';
      const alertWarnText=state.code==='travel'?'⚠️ 跨校区，建议立即出发换场':state.code==='live'?'课程正在进行中':state.code==='pending'?'已下课，待填写反馈':'';
      const alertHtml=isAlertWarn&&alertWarnText?`<div class="coach-wb-row4"><div class="coach-wb-alert is-alert-warn">${esc(alertWarnText)}</div></div>`:s.notes?`<div class="coach-wb-row4"><div class="coach-wb-alert is-alert-note">${esc(s.notes)}</div></div>`:'';
      const primaryLabel=state.code==='pending'?'填写反馈':state.code==='live'?'查看进度':'查看详情';
      const primaryClass=state.code==='pending'?'is-warning':(state.code==='live'||state.code==='upcoming')?'is-primary':'';
      const primaryAction=state.code==='pending'?`openFeedbackModal('${s.id}')`:`openScheduleDetail('${s.id}')`;
      return `<div class="coach-wb-card ${stateClass}"><div class="coach-wb-card-body"><div class="coach-wb-row1"><div class="coach-wb-time">${s.startTime.slice(11,16)}${s.endTime?` - ${s.endTime.slice(11,16)}`:''}</div><div class="coach-wb-badge ${badgeClass}">${state.label}</div></div><div class="coach-wb-name">${esc(scheduleStudentSummary(s))}</div><div class="coach-wb-row3"><span class="coach-wb-tag is-${typeClass}">${esc(courseType)}</span><span>${esc(scheduleLocationText(s))}</span></div>${alertHtml}</div><div class="coach-wb-card-footer"><button class="coach-wb-action" onclick="openScheduleDetail('${s.id}')">查看详情</button><button class="coach-wb-action ${primaryClass}" onclick="${primaryAction}">${primaryLabel}</button></div></div>`;
    }).join('');
    const emptyTip=dayRows.length?'':isToday?'<div class="workbench-empty">今天暂无课程</div>':'';
    return `<div class="coach-wb-day-section${isToday?' is-today':isPast?' is-past':''}"><div class="coach-wb-day-label">${dayLabel}</div>${cards?`<div class="coach-wb-grid">${cards}</div>`:emptyTip}</div>`;
  }).join('');
  const weekLabel=`${week[0].getMonth()+1}/${week[0].getDate()} — ${week[6].getMonth()+1}/${week[6].getDate()}`;
  const renderKey=`${weekLabel}__${statsHtml}__${weekBoardHtml}`;
  if(host.dataset.workbenchRenderKey!==renderKey){
    host.innerHTML=`<div class="coach-wb-container"><div class="coach-wb-stats-row">${statsHtml}</div><div class="coach-wb-page-header"><div class="coach-wb-page-title">本周课程待办（${weekLabel}）${workbenchMetricHelpHtml()}</div><div class="coach-wb-current-time"><span class="live-dot"></span>${currentTimeText}</div></div><div class="coach-wb-board">${weekBoardHtml}</div></div>`;
    host.dataset.workbenchRenderKey=renderKey;
  }
  const currentTimeNode=host.querySelector('.coach-wb-current-time');
  if(currentTimeNode){
    currentTimeNode.textContent=currentTimeText;
    currentTimeNode.insertAdjacentHTML('afterbegin','<span class="live-dot"></span>');
  }
}
let myWeekOffset=0;
function getMyCoachName(){return coachName(currentUser?.coachName||currentUser?.name||'');}
function isCoachMobile(){return document.body.classList.contains('coach-mobile');}
function getWeekDates(offset){
  const now=new Date();now.setDate(now.getDate()+offset*7);
  const day=now.getDay(),diff=now.getDate()-day+(day===0?-6:1);
  const mon=new Date(now);mon.setDate(diff);
  return Array.from({length:7},(_,i)=>{const d=new Date(mon);d.setDate(mon.getDate()+i);return d;});
}
function myScheduleStatusClass(schedule){
  const ended=effectiveScheduleStatus(schedule)==='已结束';
  return ended&&!hasScheduleFeedback(schedule)?'pending':'';
}
function sortMyScheduleRows(rows=[]){
  return rows.slice().sort((a,b)=>{
    const aPending=effectiveScheduleStatus(a)==='已结束'&&!hasScheduleFeedback(a);
    const bPending=effectiveScheduleStatus(b)==='已结束'&&!hasScheduleFeedback(b);
    if(aPending!==bPending)return aPending?1:-1;
    return String(a.startTime||'').localeCompare(String(b.startTime||''));
  });
}
function myScheduleTravelGap(prev,current){
  if(!prev||!current||prev.campus===current.campus||!prev.endTime)return -1;
  return durMin(prev.endTime,current.startTime);
}
function myScheduleBlockTitle(schedule){
  const type=scheduleCourseType(schedule);
  if(type==='班课'||type==='训练营'||type==='大师课')return scheduleClassName(schedule);
  return scheduleStudentSummary(schedule);
}
function myScheduleTypeText(schedule){
  return schedule.scheduleSource==='订场陪打'?'陪打':scheduleCourseType(schedule);
}
function myStudentLessonRecordHtml(student){
  const coach=getMyCoachName();
  const rows=schedules
    .filter(s=>coachName(s.coach)===coach&&scheduleHasStudent(s,student)&&s.startTime)
    .sort((a,b)=>new Date(b.startTime)-new Date(a.startTime))
    .slice(0,12);
  if(!rows.length)return '暂无上课记录';
  return rows.map(s=>`${fmtDt(s.startTime)} · ${myScheduleTypeText(s)} · ${lessonUnitsText(scheduleLessonUnits(s))}节 · ${scheduleLocationText(s)} · ${effectiveScheduleStatus(s)}`).map(esc).join('<br>');
}
function renderMySchedule(){
  const cn2=getMyCoachName();
  const week=getWeekDates(myWeekOffset);
  const todayStr=today();
  const now=shanghaiNow();
  const WDNAMES=['周一','周二','周三','周四','周五','周六','周日'];
  const allMine=billableSchedules().filter(s=>coachName(s.coach)===cn2);
  let isTodayGrid=false;
  const m1=week[0],m2=week[6];
  document.getElementById('myWeekLabel').textContent=(m1.getMonth()+1)+'/'+m1.getDate()+' — '+(m2.getMonth()+1)+'/'+m2.getDate();
  const weekHeader=document.getElementById('myScheduleWeekHeader');
  if(weekHeader)weekHeader.innerHTML=`<div class="my-schedule-week-title">本周总览</div><div class="my-schedule-week-sub">看本周课程时间、类型和场地安排，点击课程块可直接查看详情。</div>`;
  const startH=7,endH=22;
  let html='<div class="wg-corner"></div>';
  week.forEach((d,i)=>{const ds=d.toISOString().slice(0,10);const isToday=ds===todayStr;html+=`<div class="wg-dayhead${isToday?' today':''}">${WDNAMES[i]}<br>${d.getDate()}日</div>`;});
  for(let h=startH;h<endH;h++){
    html+=`<div class="wg-hour">${String(h).padStart(2,'0')}:00</div>`;
    week.forEach((d,di)=>{
      const ds=d.toISOString().slice(0,10);const isToday=ds===todayStr;
      if(isToday)isTodayGrid=true;
      const cellScheds=allMine.filter(s=>s.startTime.slice(0,10)===ds);
      let blocks='';
      cellScheds.forEach(s=>{
        const sh=parseInt(s.startTime.slice(11,13)),sm=parseInt(s.startTime.slice(14,16));
        if(sh!==h)return;
        const dur=s.endTime?durMin(s.startTime,s.endTime):60;
        const topPx=sm/60*48,hPx=Math.max(dur/60*48,28);
        const cc=coachOpsCourseTypeTagClass(scheduleCourseType(s));
        const typeText=s.scheduleSource==='订场陪打'?'陪打':myScheduleTypeText(s);
        const blockTitle=myScheduleBlockTitle(s);
        blocks+=`<div class="wg-block ${cc}" style="top:${topPx}px;height:${hPx}px" onclick="openScheduleDetail('${s.id}')" title="${esc(blockTitle)} ${s.startTime.slice(11,16)}~${(s.endTime||'').slice(11,16)} ${esc(scheduleLocationText(s))}"><div class="wgb-top"><div class="wgb-time">${s.startTime.slice(11,16)}${s.endTime?' - '+s.endTime.slice(11,16):''}</div><div class="wgb-type">${esc(typeText)}</div></div><div class="wgb-name">${esc(blockTitle)}</div><div class="wgb-info">${esc(scheduleLocationText(s))}</div><div class="wgb-info">反馈：${scheduleFeedbackLabel(s)} · ${scheduleAbsentText(s)}</div></div>`;
      });
      const nowCellLine=isToday&&now.getHours()===h?`<div class="wg-now-line" style="top:${now.getMinutes()/60*48}px"></div>`:'';
      html+=`<div class="wg-cell${isToday?' today':''}">${nowCellLine}${blocks}</div>`;
    });
  }
  document.getElementById('myWeekGrid').innerHTML=html;
  const mobile=document.getElementById('myScheduleMobileList');
  if(mobile){
    const mobileHourHeight=56;
    const timelineHeight=(endH-startH)*mobileHourHeight;
    const timeRail=`<div class="coach-mobile-time-rail"><div class="coach-mobile-time-head"></div>${Array.from({length:endH-startH},(_,idx)=>`<div class="coach-mobile-time-label">${String(startH+idx).padStart(2,'0')}:00</div>`).join('')}</div>`;
    const dayColumns=week.map((d,i)=>{
      const ds=d.toISOString().slice(0,10);
      const rows=allMine.filter(s=>s.startTime.slice(0,10)===ds).sort((a,b)=>String(a.startTime).localeCompare(String(b.startTime)));
      const isToday=ds===todayStr;
      const nowLine=isToday&&now.getHours()>=startH&&now.getHours()<endH?`<div class="coach-mobile-now-line" style="top:${((now.getHours()-startH)*60+now.getMinutes())/60*mobileHourHeight}px"><span class="coach-mobile-now-dot"></span></div>`:'';
      const events=rows.map(s=>{
        const startMinutes=(parseInt(s.startTime.slice(11,13),10)-startH)*60+parseInt(s.startTime.slice(14,16),10);
        const topPx=startMinutes/60*mobileHourHeight;
        const heightPx=Math.max((scheduleDurMin(s)/60)*mobileHourHeight,70);
        const cc=coachOpsCourseTypeTagClass(scheduleCourseType(s));
        const typeText=s.scheduleSource==='订场陪打'?'陪打':myScheduleTypeText(s);
        return `<div class="coach-mobile-event ${cc}" style="top:${topPx}px;height:${heightPx}px" onclick="openScheduleDetail('${s.id}')"><div class="coach-mobile-event-time">${s.startTime.slice(11,16)}${s.endTime?' - '+s.endTime.slice(11,16):''}</div><div class="coach-mobile-event-title">${esc(myScheduleBlockTitle(s))}</div><div class="coach-mobile-event-meta">${esc(typeText)}<br>${esc(scheduleLocationText(s))}<br>反馈：${scheduleFeedbackLabel(s)} · ${scheduleAbsentText(s)}</div></div>`;
      }).join('');
      const emptyTip=rows.length?'':'<div class="coach-mobile-day-empty-tip">当天暂无课程</div>';
      return `<div class="coach-mobile-day-column${isToday?' today':''}"><div class="coach-mobile-day-head"><strong>${WDNAMES[i]}</strong><span>${ds}</span></div><div class="coach-mobile-day-body" style="height:${timelineHeight}px">${nowLine}${emptyTip}${events}</div></div>`;
    }).join('');
    mobile.innerHTML=`<div class="coach-mobile-week-timeline" id="cmwTimeline">${timeRail}<div class="coach-mobile-day-columns">${dayColumns}</div></div>`;
    setTimeout(()=>{
      const todayCol=mobile.querySelector('.coach-mobile-day-column.today');
      const container=mobile.querySelector('.coach-mobile-day-columns');
      const timeline=mobile.querySelector('.coach-mobile-day-body');
      if(todayCol&&container){
        container.scrollTo({left:Math.max(0,todayCol.offsetLeft-24),behavior:'smooth'});
      }
      // 垂直滚动到当前时间
      if(timeline){
        const nowHour=new Date().getHours();
        const startH=7; // 对应 renderMySchedule 中的 startH
        const hourHeight=56; // 对应 renderMySchedule 中的 mobileHourHeight
        if(nowHour>=startH&&nowHour<22){
          const scrollTarget=(nowHour-startH)*hourHeight-100;
          mobile.scrollTo({top:Math.max(0,scrollTarget),behavior:'smooth'});
        }
      }
    },200);
  }
}
function myStudentLessonCount(stu,coach){
  const scheduleUnits=sumScheduleLessonUnits(schedules.filter(s=>coachName(s.coach)===coach&&scheduleHasStudent(s,stu)&&effectiveScheduleStatus(s)==='已结束'));
  return lessonUnitsText(scheduleUnits+historicalImportedLessonUnitsForStudent(stu));
}
function myStudentLessonRows(stu,coach){
  return schedules.filter(s=>coachName(s.coach)===coach&&scheduleHasStudent(s,stu)&&s.startTime).sort((a,b)=>new Date(b.startTime)-new Date(a.startTime));
}
function myStudentLastLessonMeta(stu,coach){
  const row=myStudentLessonRows(stu,coach)[0];
  if(!row?.startTime)return {dateText:'-',fullText:'-'};
  const dateText=row.startTime.slice(0,10);
  const timeText=`${row.startTime.slice(11,16)}${row.endTime?` - ${row.endTime.slice(11,16)}`:''}`;
  return {dateText,fullText:`${dateText} ${timeText}`};
}
function myStudentPackageProgressMeta(stu){
  const rows=entitlements.filter(e=>e.studentId===stu?.id&&e.status!=='voided');
  if(!rows.length)return {progress:'-',remaining:'-'};
  const total=rows.reduce((sum,e)=>sum+lessonValue(e.totalLessons),0);
  const used=rows.reduce((sum,e)=>sum+lessonValue(e.usedLessons),0);
  const remaining=rows.reduce((sum,e)=>sum+lessonValue(e.remainingLessons),0);
  return {progress:total>0?`${lessonQty(used)}/${lessonQty(total)}`:'-',remaining:lessonQty(remaining)};
}
function myStudentOwnerCoachText(stu){
  const ownerSet=[...new Set(entitlements.filter(e=>e.studentId===stu?.id&&e.status!=='voided').map(e=>String(e.ownerCoach||'').trim()).filter(Boolean))];
  return ownerSet.join('、')||'未设置';
}
function myStudentEntitlementProgress(stu){
  const rows=entitlements.filter(e=>e.studentId===stu?.id&&e.status!=='voided');
  const total=rows.reduce((sum,e)=>sum+lessonValue(e.totalLessons),0);
  const used=rows.reduce((sum,e)=>sum+lessonValue(e.usedLessons),0);
  const remaining=rows.reduce((sum,e)=>sum+lessonValue(e.remainingLessons),0);
  return rows.length?`课包进度 ${lessonQty(used)}/${lessonQty(total)}，剩余课时 ${lessonQty(remaining)}`:'课包进度 —，剩余课时 0';
}
function renderMyStudents(){
  const cn2=getMyCoachName();
  const myCls=classes.filter(c=>c.coach===cn2);
  const myStus=students.filter(s=>coachName(s.primaryCoach)===cn2||myStudentLessonCount(s,cn2)>0);
  const visibleStudentCount=myStus.length;
  const ownerStudentCount=myStus.filter(s=>coachName(s.primaryCoach)===cn2).length;
  const substituteStudentCount=myStus.filter(s=>coachName(s.primaryCoach)!==cn2&&myStudentLessonCount(s,cn2)>0).length;
  const endedRows=schedules.filter(s=>coachName(s.coach)===cn2&&effectiveScheduleStatus(s)==='已结束');
  const monthPrefix=today().slice(0,7);
  const monthLessons=lessonUnitsText(sumScheduleLessonUnits(endedRows.filter(s=>String(s.startTime||'').slice(0,7)===monthPrefix)));
  const totalLessons=lessonUnitsText(sumScheduleLessonUnits(endedRows));
  const mobile=document.getElementById('myStudentMobileList');
  document.getElementById('myStudentStats').innerHTML=`<div class="tms-stat-card"><div class="tms-stat-label">可见学员</div><div class="tms-stat-value">${visibleStudentCount}<span>人</span></div></div><div class="tms-stat-card"><div class="tms-stat-label">负责学员</div><div class="tms-stat-value">${ownerStudentCount}<span>人</span></div></div><div class="tms-stat-card"><div class="tms-stat-label">代上学员</div><div class="tms-stat-value">${substituteStudentCount}<span>人</span></div></div><div class="tms-stat-card"><div class="tms-stat-label">本月 / 累计课时</div><div class="tms-stat-value">${monthLessons}<span>/ ${totalLessons}</span></div></div>`;
  document.getElementById('myStuTbody').innerHTML=myStus.length?myStus.map(s=>{
    const sc=myCls.filter(c=>parseArr(c.studentIds).includes(s.id));
    const cb=sc.map(c=>c.className||'-').join('、')||'-';
    const lastLesson=myStudentLastLessonMeta(s,cn2);
    const packageMeta=myStudentPackageProgressMeta(s);
    const recentFb=feedbacks.filter(f=>f.studentId===s.id||parseArr(f.studentIds).includes(s.id)).sort((a,b)=>String(b.updatedAt||'').localeCompare(String(a.updatedAt||'')))[0];
    const noteSummary=recentFb?.recommendedProductType?`推荐${recentFb.recommendedProductType}；${recentFb.mainIssues||recentFb.knowledgePoint||''}`:(recentFb?.mainIssues||recentFb?.knowledgePoint||s.remark||'');
    const primaryCoach=studentPrimaryCoachText(s);
    const ownerCoach=myStudentOwnerCoachText(s);
    const relationLabel=coachName(s.primaryCoach)===cn2?'负责学员':'代上学员';
    return `<tr><td style="padding-left:20px"><div class="tms-text-primary">${esc(s.name)}</div></td><td>${renderCourtCellText(cn(s.campus))}</td><td><div class="tms-text-primary" style="white-space:nowrap">${esc(renderCourtEmptyText(s.phone))}</div></td><td>${renderCourtCellText(s.type)}</td><td><div class="tms-text-remark" title="${esc(cb)}">${esc(cb)}</div></td><td>${renderCourtCellText(primaryCoach)}</td><td>${renderCourtCellText(ownerCoach)}</td><td>${renderCourtCellText(myStudentLessonCount(s,cn2),false)}</td><td><div class="tms-text-remark" title="${esc(lastLesson.fullText)}">${esc(lastLesson.dateText)}</div></td><td>${renderCourtCellText(packageMeta.progress,false)}</td><td>${renderCourtCellText(packageMeta.remaining,false)}</td><td><div class="tms-text-remark" title="${esc(noteSummary)}">${esc(renderCourtEmptyText(noteSummary))}</div></td><td class="tms-action-cell" style="width:72px;padding-right:20px;text-align:right"><span class="tms-action-link" onclick="openMyStudentDetail('${s.id}')">查看</span></td></tr>`;
  }).join(''):'<tr><td colspan="13"><div class="empty"><div class="empty-ico"><svg width="48" height="48" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5"><path d="M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2"/><circle cx="9" cy="7" r="4"/><path d="M23 21v-2a4 4 0 0 0-3-3.87"/><path d="M16 3.13a4 4 0 0 1 0 7.75"/></svg></div><p>暂无学员</p></div></td></tr>';
  if(mobile){
    mobile.innerHTML=myStus.length?`<div class="ios-list-group">${myStus.map(s=>{
      const sc=myCls.filter(c=>parseArr(c.studentIds).includes(s.id));
      const classText=sc.map(c=>c.className||'-').join('、')||'-';
      const lastLesson=myStudentLastLessonMeta(s,cn2);
      const packageMeta=myStudentPackageProgressMeta(s);
      const relationLabel=coachName(s.primaryCoach)===cn2?'负责学员':'代上学员';
      const tagColor=relationLabel==='负责学员'?'tms-tag-tier-gold':'tms-tag-tier-slate';
      return `<div class="ios-list-item" onclick="openMyStudentDetail('${s.id}')"><div class="ios-list-body"><div class="ios-list-title">${esc(renderCourtEmptyText(s.name))} <span class="tms-tag ${tagColor}" style="transform:scale(0.85);transform-origin:left center">${relationLabel}</span></div><div class="ios-list-sub">班次：${esc(classText)}<br>课包进度：${esc(packageMeta.progress)}，剩 ${esc(packageMeta.remaining)}时<br>最后上课：${esc(lastLesson.dateText)}</div></div><div class="ios-list-chevron"><svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="m9 18 6-6-6-6"/></svg></div></div>`;
    }).join('')}</div>`:'';
  }
}
function openMyStudentDetail(id){
  const s=students.find(x=>x.id===id);if(!s)return;
  const myCls=classes.filter(c=>c.coach===getMyCoachName()&&parseArr(c.studentIds).includes(s.id));
  const lastSchedule=schedules.filter(x=>x.coach===getMyCoachName()&&scheduleHasStudent(x,s)&&x.startTime).sort((a,b)=>new Date(b.startTime)-new Date(a.startTime))[0];
  const packageMeta=myStudentPackageProgressMeta(s);
  const body=`<div class="tms-section-header" style="margin-top:0;">基本信息</div><div class="tms-form-row"><div class="tms-form-item"><label class="tms-form-label">姓名</label><input class="finput tms-form-control" value="${esc(s.name)||'—'}" readonly></div><div class="tms-form-item"><label class="tms-form-label">手机号码</label><input class="finput tms-form-control" value="${esc(s.phone)||'—'}" readonly></div></div><div class="tms-form-row"><div class="tms-form-item"><label class="tms-form-label">学员类型</label><input class="finput tms-form-control" value="${esc(s.type)||'—'}" readonly></div><div class="tms-form-item"><label class="tms-form-label">所在校区</label><input class="finput tms-form-control" value="${cn(s.campus)||'—'}" readonly></div></div><div class="tms-section-header">教练视角摘要</div><div class="tms-form-row"><div class="tms-form-item"><label class="tms-form-label">负责教练</label><input class="finput tms-form-control" value="${esc(studentPrimaryCoachText(s))}" readonly></div><div class="tms-form-item"><label class="tms-form-label">归属教练</label><input class="finput tms-form-control" value="${esc(myStudentOwnerCoachText(s))}" readonly></div></div><div class="tms-form-row"><div class="tms-form-item"><label class="tms-form-label">所上班次</label><div class="finput tms-form-control" style="height:auto;min-height:54px;white-space:normal;line-height:1.7">${esc(myCls.map(c=>c.className||c.classNo).join('、'))||'—'}</div></div><div class="tms-form-item"><label class="tms-form-label">最近上课</label><input class="finput tms-form-control" value="${lastSchedule?.startTime?fmtDt(lastSchedule.startTime):'—'}" readonly></div></div><div class="tms-form-row"><div class="tms-form-item"><label class="tms-form-label">累计上课</label><input class="finput tms-form-control" value="${myStudentLessonCount(s,getMyCoachName())}" readonly></div><div class="tms-form-item"><label class="tms-form-label">课包进度 / 剩余课时</label><input class="finput tms-form-control" value="${packageMeta.progress} / ${packageMeta.remaining}" readonly></div></div><div class="tms-form-row"><div class="tms-form-item full-width"><label class="tms-form-label">上课记录</label><div class="finput tms-form-control" style="height:auto;min-height:72px;white-space:normal;line-height:1.7">${myStudentLessonRecordHtml(s)}</div></div></div><div class="tms-form-row" style="margin-bottom:0"><div class="tms-form-item full-width"><label class="tms-form-label">备注</label><div class="finput tms-form-control" style="height:auto;min-height:72px;white-space:normal;line-height:1.7">${esc(s.remark)||'—'}</div></div></div>`;
  const footer=`<button class="tms-btn tms-btn-default" onclick="closeModal()">关闭</button>`;
  setCourtModalFrame('学员详情',body,footer,'modal-tight');
}
function renderMyClasses(){
  const cn2=getMyCoachName();
  const myCls=classes.filter(c=>c.coach===cn2);
  const active=myCls.filter(c=>c.status==='已排班').length;
  const tL=myCls.reduce((s,c)=>s+lessonValue(c.totalLessons),0),uL=myCls.reduce((s,c)=>s+lessonValue(c.usedLessons),0);
  const mobile=document.getElementById('myClassMobileList');
  document.getElementById('myClassStats').innerHTML=`<div class="tms-stat-card"><div class="tms-stat-label">我的班次</div><div class="tms-stat-value">${myCls.length}<span>个</span></div><div class="tms-stat-sub">进行中 ${active}</div></div><div class="tms-stat-card"><div class="tms-stat-label">总课时 / 已上</div><div class="tms-stat-value">${lessonQty(tL)}<span>/ ${lessonQty(uL)}</span></div><div class="tms-stat-sub">剩余 ${lessonQty(tL-uL)} 节</div></div>`;
  const ss={'已排班':'b-blue','已取消':'b-gray','已结课':'b-green'};
  document.getElementById('myClsTbody').innerHTML=myCls.length?myCls.map(c=>{
    const prod=products.find(x=>x.id===c.productId);
    const ids=parseArr(c.studentIds);
    const names=ids.map(sid=>{const st=students.find(x=>x.id===sid);return st?esc(st.name):esc(sid);}).join('、')||'-';
    const tl=lessonValue(c.totalLessons),ul=lessonValue(c.usedLessons),rem=tl-ul;
    const pct=tl>0?Math.round(rem/tl*100):0,pc=pct>40?'pf-gold':pct>15?'pf-warn':'pf-red';
    return `<tr><td style="padding-left:20px"><div class="tms-text-primary">${esc(c.className)||'—'}</div><div class="tms-text-secondary">${esc(c.classNo)||''}</div></td><td>${renderCourtCellText(prod?prod.name:'—')}</td><td><div class="tms-text-remark" title="${names}">${names}</div></td><td><div class="prog-wrap"><div class="prog-track"><div class="prog-fill ${pc}" style="width:${pct}%"></div></div><span class="prog-txt">${ul}/${tl} 剩${rem}</span></div></td><td>${renderCourtCellText(`${c.startDate||'—'} ~ ${c.endDate||'—'}`,false)}</td><td><span class="tms-tag ${c.status==='已结课'?'tms-tag-green':c.status==='已取消'?'tms-tag-tier-slate':'tms-tag-tier-blue'}">${c.status||'已排班'}</span></td><td class="tms-action-cell" style="width:72px;padding-right:20px;text-align:right"><span class="tms-action-link" onclick="openMyClassDetail('${c.id}')">查看</span></td></tr>`;
  }).join(''):'<tr><td colspan="7"><div class="empty"><div class="empty-ico"><svg width="48" height="48" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5"><path d="M16 4h2a2 2 0 0 1 2 2v14a2 2 0 0 1-2 2H6a2 2 0 0 1-2-2V6a2 2 0 0 1 2-2h2"/><rect x="8" y="2" width="8" height="4" rx="1" ry="1"/></svg></div><p>暂无班次</p></div></td></tr>';
  if(mobile){
    mobile.innerHTML=myCls.length?`<div class="ios-list-group">${myCls.map(c=>{
      const prod=products.find(x=>x.id===c.productId);
      const studentText=parseArr(c.studentIds).map(sid=>students.find(s=>s.id===sid)?.name||sid).join('、')||'-';
      const tl=lessonValue(c.totalLessons),ul=lessonValue(c.usedLessons),rem=tl-ul;
      const ssc={'已排班':'tms-tag-blue','已取消':'tms-tag-tier-slate','已结课':'tms-tag-green'};
      return `<div class="ios-list-item" onclick="openMyClassDetail('${c.id}')"><div class="ios-list-body"><div class="ios-list-title">${esc(renderCourtEmptyText(c.className||c.classNo))} <span class="tms-tag ${ssc[c.status||'已排班']||'tms-tag-tier-slate'}" style="transform:scale(0.85);transform-origin:left center">${esc(renderCourtEmptyText(c.status||'已排班'))}</span></div><div class="ios-list-sub">课程：${esc(renderCourtEmptyText(prod?.name||c.productName))}<br>学员：${esc(studentText)}<br>进度：${ul}/${tl} 节，剩余 ${rem} 节</div></div><div class="ios-list-chevron"><svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="m9 18 6-6-6-6"/></svg></div></div>`;
    }).join('')}</div>`:'';
  }
}
function openMyClassDetail(id){
  const c=classes.find(x=>x.id===id);if(!c)return;
  const prod=products.find(x=>x.id===c.productId);
  const studentText=parseArr(c.studentIds).map(sid=>students.find(s=>s.id===sid)?.name||sid).join('、')||'—';
  const tl=lessonValue(c.totalLessons),ul=lessonValue(c.usedLessons),rem=tl-ul;
  const body=`<div class="tms-section-header" style="margin-top:0;">班次信息</div><div class="tms-form-row"><div class="tms-form-item"><label class="tms-form-label">班次名称</label><input class="finput tms-form-control" value="${esc(c.className)||'—'}" readonly></div><div class="tms-form-item"><label class="tms-form-label">班次编号</label><input class="finput tms-form-control" value="${esc(c.classNo)||'—'}" readonly></div></div><div class="tms-form-row"><div class="tms-form-item"><label class="tms-form-label">课程</label><input class="finput tms-form-control" value="${esc(prod?.name||c.productName)||'—'}" readonly></div><div class="tms-form-item"><label class="tms-form-label">状态</label><input class="finput tms-form-control" value="${esc(c.status)||'—'}" readonly></div></div><div class="tms-form-row"><div class="tms-form-item"><label class="tms-form-label">学员</label><div class="finput tms-form-control" style="height:auto;min-height:54px;white-space:normal;line-height:1.7">${esc(studentText)}</div></div><div class="tms-form-item"><label class="tms-form-label">日期</label><input class="finput tms-form-control" value="${esc(c.startDate||'—')} ~ ${esc(c.endDate||'—')}" readonly></div></div><div class="tms-form-row" style="margin-bottom:0"><div class="tms-form-item full-width"><label class="tms-form-label">课时进度</label><div class="finput tms-form-control" style="height:auto;min-height:54px;white-space:normal;line-height:1.7">总课时 ${lessonQty(tl)} 节；已上 ${lessonQty(ul)} 节；剩余 ${lessonQty(rem)} 节</div></div></div>`;
  const footer=`<button class="tms-btn tms-btn-default" onclick="closeModal()">关闭</button>`;
  setCourtModalFrame('查看班次',body,footer,'modal-tight');
}
