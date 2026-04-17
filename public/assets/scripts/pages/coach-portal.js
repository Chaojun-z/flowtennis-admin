function workbenchScheduleState(schedule,prevSchedule,now){
  const start=dtObj(schedule.startTime),end=dtObj(schedule.endTime||schedule.startTime);
  const startDiff=start?durMin(now,start):-1;
  const endDiff=end?durMin(now,end):-1;
  const travelGap=myScheduleTravelGap(prevSchedule,schedule);
  const ended=effectiveScheduleStatus(schedule,now)==='已结束';
  if(start&&end&&start<=now&&now<end){
    return {code:'live',label:'进行中',hint:`距下课 ${Math.max(0,endDiff)} 分钟`,priority:0};
  }
  if(start&&start>now&&startDiff>=0&&startDiff<=30){
    return {code:'upcoming',label:'即将开始',hint:`距开始 ${startDiff} 分钟`,priority:1};
  }
  if(start&&start>now&&travelGap>=0&&travelGap<60){
    return {code:'travel',label:'需换场',hint:`跨校区提醒：上一节下课到这节上课仅 ${travelGap} 分钟`,priority:2};
  }
  if(start&&start>now){
    return {code:'later',label:'今日后续',hint:`将于 ${start.toTimeString().slice(0,5)} 开始`,priority:3};
  }
  if(ended&&!hasScheduleFeedback(schedule)){
    return {code:'pending',label:'待反馈',hint:'已下课，待填写反馈',priority:4};
  }
  return {code:'done',label:'已完成',hint:'课程已结束并完成反馈',priority:5};
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
    const courseType=scheduleCourseType(s);
    const typeClass=courseType==='训练营'?'rust':courseType==='体验课'?'caramel':courseType==='班课'?'sage':'stone';
    const stateClass=state.code==='live'?'is-progress':(state.code==='upcoming'||state.code==='travel')?'is-upcoming':state.code==='pending'?'is-feedback':state.code==='done'?'is-done':'is-normal';
    const badgeClass=state.code==='live'?'is-progress':(state.code==='upcoming'||state.code==='travel')?'is-upcoming':state.code==='pending'?'is-feedback':state.code==='done'?'is-done':'is-normal';
    const alertText=state.code==='travel'?'⚠️ 跨校区，建议立即出发换场':state.code==='live'?'课程正在进行中':state.code==='pending'?'已下课，待填写反馈':(s.notes||'');
    const primaryLabel=state.code==='pending'?'填写反馈':state.code==='done'&&hasScheduleFeedback(s)?'查看反馈':state.code==='live'?'查看进度':state.code==='later'?'查看反馈':'查看详情';
    const primaryClass=state.code==='pending'?'is-warning':(state.code==='live'||state.code==='upcoming')?'is-primary':'';
    const primaryAction=state.code==='pending'||(state.code==='done'&&hasScheduleFeedback(s))||state.code==='later'?`openFeedbackModal('${s.id}')`:`openScheduleDetail('${s.id}')`;
    const alertHtml=alertText?`<div class="coach-wb-row4"><div class="coach-wb-alert">${esc(alertText)}</div></div>`:'';
    return `<div class="coach-wb-card ${stateClass}"><div class="coach-wb-card-body"><div class="coach-wb-row1"><div class="coach-wb-time">${s.startTime.slice(11,16)}${s.endTime?` - ${s.endTime.slice(11,16)}`:''}</div><div class="coach-wb-badge ${badgeClass}">${state.label}</div></div><div class="coach-wb-name">${esc(scheduleStudentSummary(s))}</div><div class="coach-wb-row3"><span class="coach-wb-tag is-${typeClass}">${esc(courseType)}</span><span>${cn(s.campus)} · ${esc(s.venue)||'—'}</span></div>${alertHtml}</div><div class="coach-wb-card-footer"><button class="coach-wb-action" onclick="openScheduleDetail('${s.id}')">查看详情</button><button class="coach-wb-action ${primaryClass}" onclick="${primaryAction}">${primaryLabel}</button></div></div>`;
  }).join('');
  return `<div id="${esc(meta.anchor||'workbench-today')}"><div class="coach-wb-group-title">${esc(title)}</div>${cards?`<div class="coach-wb-grid">${cards}</div>`:'<div class="workbench-empty">今天暂无课程</div>'}</div>`;
}
function ensureWorkbenchTicker(){
  if(workbenchTicker)return;
  workbenchTicker=setInterval(()=>{if(currentPage==='workbench')renderWorkbench();},60000);
}
function renderWorkbench(){
  ensureWorkbenchTicker();
  const coach=getMyCoachName();
  const myRows=billableSchedules().filter(s=>coachName(s.coach)===coach).sort((a,b)=>String(a.startTime).localeCompare(String(b.startTime)));
  const now=shanghaiNow();
  const todayStr=localDateKey(now);
  const todayRows=myRows.filter(s=>String(s.startTime||'').slice(0,10)===todayStr);
  const counts=workbenchSummaryCounts(todayRows,now);
  const host=document.getElementById('workbenchBody');
  const totalTitle=`今日全部课程（已上 ${counts.completed} / 共 ${todayRows.length} 节）`;
  const urgentRows=todayRows.filter((s,i,arr)=>{
    const sorted=arr.slice().sort((a,b)=>String(a.startTime||'').localeCompare(String(b.startTime||'')));
    const idx=sorted.findIndex(x=>x.id===s.id);
    const state=workbenchScheduleState(s,sorted[idx-1],now);
    return ['live','upcoming','travel','pending'].includes(state.code);
  });
  const laterRows=todayRows.filter((s,i,arr)=>{
    const sorted=arr.slice().sort((a,b)=>String(a.startTime||'').localeCompare(String(b.startTime||'')));
    const idx=sorted.findIndex(x=>x.id===s.id);
    return workbenchScheduleState(s,sorted[idx-1],now).code==='later';
  });
  const doneRows=todayRows.filter((s,i,arr)=>{
    const sorted=arr.slice().sort((a,b)=>String(a.startTime||'').localeCompare(String(b.startTime||'')));
    const idx=sorted.findIndex(x=>x.id===s.id);
    return workbenchScheduleState(s,sorted[idx-1],now).code==='done';
  });
  if(!host)return;
  const statsHtml=[
    ['今日课程',todayRows.length,'节',`已上 ${counts.completed} 节`,false],
    ['即将开始',counts.upcoming,'节',counts.upcoming?'当前有临近课程':'当前没有临近课程',false],
    ['待反馈',counts.pending,'节',counts.pending?'优先处理已结束课程':'优先处理已结束课程',true],
    ['体验课待判断',counts.trial,'节',counts.trial?'今天有待判断体验课':'今天没有待判断体验课',false]
  ].map(([label,val,u,sub,accent])=>`<div class="coach-wb-stat-card"><div class="coach-wb-stat-label">${label}</div><div class="coach-wb-stat-value"${accent?' style="color:#8C4A32;"':''}>${val}<span>${u}</span></div><div class="coach-wb-stat-sub">${sub}</div></div>`).join('');
  host.innerHTML=`<div class="coach-wb-container"><div class="coach-wb-stats-row">${statsHtml}</div><div class="coach-wb-page-header"><div class="coach-wb-page-title">${totalTitle}<span class="coach-wb-page-title-sub"></span></div><div class="coach-wb-current-time">⌚️ 当前时间 ${now.toTimeString().slice(0,5)}</div></div><div class="coach-wb-board">${workbenchSection('🔥 亟待处理 (进行中 / 即将开始 / 待反馈)',urgentRows,'填写反馈',now,{anchor:'workbench-urgent'})}${workbenchSection('📅 今日后续',laterRows,'查看详情',now,{anchor:'workbench-later'})}<div style="opacity:0.8;">${workbenchSection('✅ 已完成',doneRows,'查看反馈',now,{anchor:'workbench-done'})}</div></div></div>`;
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
function renderMySchedule(){
  const cn2=getMyCoachName();
  const week=getWeekDates(myWeekOffset);
  const todayStr=today();
  const now=shanghaiNow();
  const WDNAMES=['周一','周二','周三','周四','周五','周六','周日'];
  const allMine=billableSchedules().filter(s=>coachName(s.coach)===cn2);
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
      const cellScheds=allMine.filter(s=>s.startTime.slice(0,10)===ds);
      let blocks='';
      cellScheds.forEach(s=>{
        const sh=parseInt(s.startTime.slice(11,13)),sm=parseInt(s.startTime.slice(14,16));
        if(sh!==h)return;
        const dur=s.endTime?durMin(s.startTime,s.endTime):60;
        const topPx=sm/60*48,hPx=Math.max(dur/60*48,28);
        const cc=coachOpsCourseTypeTagClass(scheduleCourseType(s));
        const blockTitle=myScheduleBlockTitle(s);
        blocks+=`<div class="wg-block ${cc}" style="top:${topPx}px;height:${hPx}px" onclick="openScheduleDetail('${s.id}')" title="${esc(blockTitle)} ${s.startTime.slice(11,16)}~${(s.endTime||'').slice(11,16)} ${esc(s.venue)||''}"><div class="wgb-top"><div class="wgb-time">${s.startTime.slice(11,16)}${s.endTime?' - '+s.endTime.slice(11,16):''}</div><div class="wgb-type">${esc(scheduleCourseType(s))}</div></div><div class="wgb-name">${esc(blockTitle)}</div><div class="wgb-info">${cn(s.campus)} ${esc(s.venue)||'—'}</div><div class="wgb-info">反馈：${scheduleFeedbackLabel(s)} · ${scheduleAbsentText(s)}</div></div>`;
      });
      html+=`<div class="wg-cell${isToday?' today':''}">${blocks}</div>`;
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
        return `<div class="coach-mobile-event ${cc}" style="top:${topPx}px;height:${heightPx}px" onclick="openScheduleDetail('${s.id}')"><div class="coach-mobile-event-time">${s.startTime.slice(11,16)}${s.endTime?' - '+s.endTime.slice(11,16):''}</div><div class="coach-mobile-event-title">${esc(myScheduleBlockTitle(s))}</div><div class="coach-mobile-event-meta">${esc(scheduleCourseType(s))}<br>${cn(s.campus)} ${esc(s.venue)||'-'}<br>反馈：${scheduleFeedbackLabel(s)} · ${scheduleAbsentText(s)}</div></div>`;
      }).join('');
      const emptyTip=rows.length?'':'<div class="coach-mobile-day-empty-tip">当天暂无课程</div>';
      return `<div class="coach-mobile-day-column${isToday?' today':''}"><div class="coach-mobile-day-head"><strong>${WDNAMES[i]}</strong><span>${ds}</span></div><div class="coach-mobile-day-body" style="height:${timelineHeight}px">${nowLine}${emptyTip}${events}</div></div>`;
    }).join('');
    mobile.innerHTML=`<div class="coach-mobile-week-timeline">${timeRail}<div class="coach-mobile-day-columns">${dayColumns}</div></div>`;
  }
}
function myStudentLessonCount(stu,coach){
  return schedules.filter(s=>coachName(s.coach)===coach&&scheduleHasStudent(s,stu)&&effectiveScheduleStatus(s)==='已结束').length;
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
  const total=rows.reduce((sum,e)=>sum+(parseInt(e.totalLessons)||0),0);
  const used=rows.reduce((sum,e)=>sum+(parseInt(e.usedLessons)||0),0);
  const remaining=rows.reduce((sum,e)=>sum+(parseInt(e.remainingLessons)||0),0);
  return {progress:total>0?`${used}/${total}`:'-',remaining:String(remaining)};
}
function myStudentOwnerCoachText(stu){
  const ownerSet=[...new Set(entitlements.filter(e=>e.studentId===stu?.id&&e.status!=='voided').map(e=>purchases.find(p=>p.id===e.purchaseId)?.ownerCoach).map(v=>String(v||'').trim()).filter(Boolean))];
  return ownerSet.join('、')||'未设置';
}
function myStudentEntitlementProgress(stu){
  const rows=entitlements.filter(e=>e.studentId===stu?.id&&e.status!=='voided');
  const total=rows.reduce((sum,e)=>sum+(parseInt(e.totalLessons)||0),0);
  const used=rows.reduce((sum,e)=>sum+(parseInt(e.usedLessons)||0),0);
  const remaining=rows.reduce((sum,e)=>sum+(parseInt(e.remainingLessons)||0),0);
  return rows.length?`课包进度 ${used}/${total}，剩余课时 ${remaining}`:'课包进度 —，剩余课时 0';
}
function renderMyStudents(){
  const cn2=getMyCoachName();
  const myCls=classes.filter(c=>c.coach===cn2);
  const myStus=students;
  const visibleStudentCount=myStus.length;
  const ownerStudentCount=myStus.filter(s=>coachName(s.primaryCoach)===cn2).length;
  const substituteStudentCount=myStus.filter(s=>coachName(s.primaryCoach)!==cn2&&myStudentLessonCount(s,cn2)>0).length;
  const endedRows=schedules.filter(s=>coachName(s.coach)===cn2&&effectiveScheduleStatus(s)==='已结束');
  const monthPrefix=today().slice(0,7);
  const monthLessons=endedRows.filter(s=>String(s.startTime||'').slice(0,7)===monthPrefix).reduce((sum,s)=>sum+(parseInt(s.lessonCount)||0),0);
  const totalLessons=endedRows.reduce((sum,s)=>sum+(parseInt(s.lessonCount)||0),0);
  const mobile=document.getElementById('myStudentMobileList');
  document.getElementById('myStudentStats').innerHTML=`<div class="tms-stat-card"><div class="tms-stat-label">可见学员</div><div class="tms-stat-value">${visibleStudentCount}<span>人</span></div></div><div class="tms-stat-card"><div class="tms-stat-label">负责学员</div><div class="tms-stat-value">${ownerStudentCount}<span>人</span></div></div><div class="tms-stat-card"><div class="tms-stat-label">代上学员</div><div class="tms-stat-value">${substituteStudentCount}<span>人</span></div></div><div class="tms-stat-card"><div class="tms-stat-label">本月 / 累计课时</div><div class="tms-stat-value">${monthLessons}<span>/ ${totalLessons}</span></div></div>`;
  document.getElementById('myStuTbody').innerHTML=myStus.length?myStus.map(s=>{
    const sc=myCls.filter(c=>parseArr(c.studentIds).includes(s.id));
    const cb=sc.map(c=>c.className||'-').join('、')||'-';
    const lastLesson=myStudentLastLessonMeta(s,cn2);
    const packageMeta=myStudentPackageProgressMeta(s);
    const recentFb=feedbacks.filter(f=>f.studentId===s.id||parseArr(f.studentIds).includes(s.id)).sort((a,b)=>String(b.updatedAt||'').localeCompare(String(a.updatedAt||'')))[0];
    const noteSummary=recentFb?.recommendedProductType?`推荐${recentFb.recommendedProductType}；${recentFb.mainIssues||recentFb.knowledgePoint||''}`:(recentFb?.mainIssues||recentFb?.knowledgePoint||s.notes||'');
    const primaryCoach=studentPrimaryCoachText(s);
    const ownerCoach=myStudentOwnerCoachText(s);
    const relationLabel=coachName(s.primaryCoach)===cn2?'负责学员':'代上学员';
    return `<tr><td style="padding-left:20px"><div class="tms-text-primary">${esc(s.name)}</div></td><td>${renderCourtCellText(cn(s.campus))}</td><td><div class="tms-text-primary" style="white-space:nowrap">${esc(renderCourtEmptyText(s.phone))}</div></td><td>${renderCourtCellText(s.type)}</td><td><div class="tms-text-remark" title="${esc(cb)}">${esc(cb)}</div></td><td>${renderCourtCellText(primaryCoach)}</td><td>${renderCourtCellText(ownerCoach)}</td><td>${renderCourtCellText(myStudentLessonCount(s,cn2),false)}</td><td><div class="tms-text-remark" title="${esc(lastLesson.fullText)}">${esc(lastLesson.dateText)}</div></td><td>${renderCourtCellText(packageMeta.progress,false)}</td><td>${renderCourtCellText(packageMeta.remaining,false)}</td><td><div class="tms-text-remark" title="${esc(noteSummary)}">${esc(renderCourtEmptyText(noteSummary))}</div></td><td class="tms-action-cell" style="width:72px;padding-right:20px;text-align:right"><span class="tms-action-link" onclick="openMyStudentDetail('${s.id}')">查看</span></td></tr>`;
  }).join(''):'<tr><td colspan="13"><div class="empty"><div class="empty-ico">👥</div><p>暂无学员</p></div></td></tr>';
  if(mobile){
    mobile.innerHTML=myStus.length?myStus.map(s=>{
      const sc=myCls.filter(c=>parseArr(c.studentIds).includes(s.id));
      const classText=sc.map(c=>c.className||'-').join('、')||'-';
      const lastLesson=myStudentLastLessonMeta(s,cn2);
      const packageMeta=myStudentPackageProgressMeta(s);
      const noteText=renderCourtEmptyText(s.notes);
      const primaryCoach=studentPrimaryCoachText(s);
      const ownerCoach=myStudentOwnerCoachText(s);
      const relationLabel=coachName(s.primaryCoach)===cn2?'负责学员':'代上学员';
      return `<div class="coach-mobile-info-card"><div class="coach-mobile-info-head"><div class="coach-mobile-info-title">${esc(renderCourtEmptyText(s.name))}</div><div class="coach-mobile-info-badge">${relationLabel}</div></div><div class="coach-mobile-info-grid"><div class="coach-mobile-info-cell"><strong>校区</strong>${esc(renderCourtEmptyText(cn(s.campus)))}</div><div class="coach-mobile-info-cell"><strong>手机号</strong>${esc(renderCourtEmptyText(s.phone))}</div><div class="coach-mobile-info-cell"><strong>负责教练</strong>${esc(renderCourtEmptyText(primaryCoach))}</div><div class="coach-mobile-info-cell"><strong>归属教练</strong>${esc(renderCourtEmptyText(ownerCoach))}</div><div class="coach-mobile-info-cell"><strong>所上班次</strong>${esc(renderCourtEmptyText(classText))}</div><div class="coach-mobile-info-cell"><strong>累计上课</strong>${esc(renderCourtEmptyText(myStudentLessonCount(s,cn2)))}</div><div class="coach-mobile-info-cell"><strong>最后上课</strong>${esc(renderCourtEmptyText(lastLesson.dateText))}</div><div class="coach-mobile-info-cell"><strong>课包进度</strong>${esc(renderCourtEmptyText(packageMeta.progress))}</div><div class="coach-mobile-info-cell"><strong>剩余课时</strong>${esc(renderCourtEmptyText(packageMeta.remaining))}</div></div><div class="coach-mobile-info-note">备注：${esc(noteText)}</div><div class="coach-mobile-actions"><button class="tms-btn tms-btn-primary" onclick="openMyStudentDetail('${s.id}')">查看</button></div></div>`;
    }).join(''):'<div class="coach-mobile-empty">暂无学员</div>';
  }
}
function openMyStudentDetail(id){
  const s=students.find(x=>x.id===id);if(!s)return;
  const myCls=classes.filter(c=>c.coach===getMyCoachName()&&parseArr(c.studentIds).includes(s.id));
  const lastSchedule=schedules.filter(x=>x.coach===getMyCoachName()&&scheduleHasStudent(x,s)&&x.startTime).sort((a,b)=>new Date(b.startTime)-new Date(a.startTime))[0];
  const packageMeta=myStudentPackageProgressMeta(s);
  const body=`<div class="tms-section-header" style="margin-top:0;">基本信息</div><div class="tms-form-row"><div class="tms-form-item"><label class="tms-form-label">姓名</label><input class="finput tms-form-control" value="${esc(s.name)||'—'}" readonly></div><div class="tms-form-item"><label class="tms-form-label">手机号码</label><input class="finput tms-form-control" value="${esc(s.phone)||'—'}" readonly></div></div><div class="tms-form-row"><div class="tms-form-item"><label class="tms-form-label">学员类型</label><input class="finput tms-form-control" value="${esc(s.type)||'—'}" readonly></div><div class="tms-form-item"><label class="tms-form-label">所在校区</label><input class="finput tms-form-control" value="${cn(s.campus)||'—'}" readonly></div></div><div class="tms-section-header">教练视角摘要</div><div class="tms-form-row"><div class="tms-form-item"><label class="tms-form-label">负责教练</label><input class="finput tms-form-control" value="${esc(studentPrimaryCoachText(s))}" readonly></div><div class="tms-form-item"><label class="tms-form-label">归属教练</label><input class="finput tms-form-control" value="${esc(myStudentOwnerCoachText(s))}" readonly></div></div><div class="tms-form-row"><div class="tms-form-item"><label class="tms-form-label">所上班次</label><div class="finput tms-form-control" style="height:auto;min-height:54px;white-space:normal;line-height:1.7">${esc(myCls.map(c=>c.className||c.classNo).join('、'))||'—'}</div></div><div class="tms-form-item"><label class="tms-form-label">最近上课</label><input class="finput tms-form-control" value="${lastSchedule?.startTime?fmtDt(lastSchedule.startTime):'—'}" readonly></div></div><div class="tms-form-row"><div class="tms-form-item"><label class="tms-form-label">累计上课</label><input class="finput tms-form-control" value="${myStudentLessonCount(s,getMyCoachName())}" readonly></div><div class="tms-form-item"><label class="tms-form-label">课包进度 / 剩余课时</label><input class="finput tms-form-control" value="${packageMeta.progress} / ${packageMeta.remaining}" readonly></div></div><div class="tms-form-row" style="margin-bottom:0"><div class="tms-form-item full-width"><label class="tms-form-label">备注</label><div class="finput tms-form-control" style="height:auto;min-height:72px;white-space:normal;line-height:1.7">${esc(s.notes)||'—'}</div></div></div>`;
  const footer=`<button class="tms-btn tms-btn-default" onclick="closeModal()">关闭</button>`;
  setCourtModalFrame('学员详情',body,footer,'modal-tight');
}
function renderMyClasses(){
  const cn2=getMyCoachName();
  const myCls=classes.filter(c=>c.coach===cn2);
  const active=myCls.filter(c=>c.status==='已排班').length;
  const tL=myCls.reduce((s,c)=>s+(parseInt(c.totalLessons)||0),0),uL=myCls.reduce((s,c)=>s+(parseInt(c.usedLessons)||0),0);
  const mobile=document.getElementById('myClassMobileList');
  document.getElementById('myClassStats').innerHTML=`<div class="tms-stat-card"><div class="tms-stat-label">我的班次</div><div class="tms-stat-value">${myCls.length}<span>个</span></div><div class="tms-stat-sub">进行中 ${active}</div></div><div class="tms-stat-card"><div class="tms-stat-label">总课时 / 已上</div><div class="tms-stat-value">${tL}<span>/ ${uL}</span></div><div class="tms-stat-sub">剩余 ${tL-uL} 节</div></div>`;
  const ss={'已排班':'b-blue','已取消':'b-gray','已结课':'b-green'};
  document.getElementById('myClsTbody').innerHTML=myCls.length?myCls.map(c=>{
    const prod=products.find(x=>x.id===c.productId);
    const ids=parseArr(c.studentIds);
    const names=ids.map(sid=>{const st=students.find(x=>x.id===sid);return st?esc(st.name):esc(sid);}).join('、')||'-';
    const tl=parseInt(c.totalLessons)||0,ul=parseInt(c.usedLessons)||0,rem=tl-ul;
    const pct=tl>0?Math.round(rem/tl*100):0,pc=pct>40?'pf-gold':pct>15?'pf-warn':'pf-red';
    return `<tr><td style="padding-left:20px"><div class="tms-text-primary">${esc(c.className)||'—'}</div><div class="tms-text-secondary">${esc(c.classNo)||''}</div></td><td>${renderCourtCellText(prod?prod.name:'—')}</td><td><div class="tms-text-remark" title="${names}">${names}</div></td><td><div class="prog-wrap"><div class="prog-track"><div class="prog-fill ${pc}" style="width:${pct}%"></div></div><span class="prog-txt">${ul}/${tl} 剩${rem}</span></div></td><td>${renderCourtCellText(`${c.startDate||'—'} ~ ${c.endDate||'—'}`,false)}</td><td><span class="tms-tag ${c.status==='已结课'?'tms-tag-green':c.status==='已取消'?'tms-tag-tier-slate':'tms-tag-tier-blue'}">${c.status||'已排班'}</span></td><td class="tms-action-cell" style="width:72px;padding-right:20px;text-align:right"><span class="tms-action-link" onclick="openMyClassDetail('${c.id}')">查看</span></td></tr>`;
  }).join(''):'<tr><td colspan="7"><div class="empty"><div class="empty-ico">📋</div><p>暂无班次</p></div></td></tr>';
  if(mobile){
    mobile.innerHTML=myCls.length?myCls.map(c=>{
      const prod=products.find(x=>x.id===c.productId);
      const studentText=parseArr(c.studentIds).map(sid=>students.find(s=>s.id===sid)?.name||sid).join('、')||'-';
      const tl=parseInt(c.totalLessons)||0,ul=parseInt(c.usedLessons)||0,rem=tl-ul;
      return `<div class="coach-mobile-info-card"><div class="coach-mobile-info-head"><div class="coach-mobile-info-title">${esc(renderCourtEmptyText(c.className||c.classNo))}</div><div class="coach-mobile-info-badge">${esc(renderCourtEmptyText(c.status||'已排班'))}</div></div><div class="coach-mobile-info-grid"><div class="coach-mobile-info-cell"><strong>课程</strong>${esc(renderCourtEmptyText(prod?.name||c.productName))}</div><div class="coach-mobile-info-cell"><strong>学员</strong>${esc(renderCourtEmptyText(studentText))}</div><div class="coach-mobile-info-cell"><strong>日期</strong>${esc(renderCourtEmptyText(c.startDate))}</div><div class="coach-mobile-info-cell"><strong>结束</strong>${esc(renderCourtEmptyText(c.endDate))}</div><div class="coach-mobile-info-cell"><strong>总课时</strong>${tl||'-'}</div><div class="coach-mobile-info-cell"><strong>已上课时</strong>${ul||'-'}</div><div class="coach-mobile-info-cell"><strong>剩余课时</strong>${rem||'0'}</div></div><div class="coach-mobile-actions"><button class="tms-btn tms-btn-primary" onclick="openMyClassDetail('${c.id}')">查看</button></div></div>`;
    }).join(''):'<div class="coach-mobile-empty">暂无班次</div>';
  }
}
function openMyClassDetail(id){
  const c=classes.find(x=>x.id===id);if(!c)return;
  const prod=products.find(x=>x.id===c.productId);
  const studentText=parseArr(c.studentIds).map(sid=>students.find(s=>s.id===sid)?.name||sid).join('、')||'—';
  const tl=parseInt(c.totalLessons)||0,ul=parseInt(c.usedLessons)||0,rem=tl-ul;
  const body=`<div class="tms-section-header" style="margin-top:0;">班次信息</div><div class="tms-form-row"><div class="tms-form-item"><label class="tms-form-label">班次名称</label><input class="finput tms-form-control" value="${esc(c.className)||'—'}" readonly></div><div class="tms-form-item"><label class="tms-form-label">班次编号</label><input class="finput tms-form-control" value="${esc(c.classNo)||'—'}" readonly></div></div><div class="tms-form-row"><div class="tms-form-item"><label class="tms-form-label">课程</label><input class="finput tms-form-control" value="${esc(prod?.name||c.productName)||'—'}" readonly></div><div class="tms-form-item"><label class="tms-form-label">状态</label><input class="finput tms-form-control" value="${esc(c.status)||'—'}" readonly></div></div><div class="tms-form-row"><div class="tms-form-item"><label class="tms-form-label">学员</label><div class="finput tms-form-control" style="height:auto;min-height:54px;white-space:normal;line-height:1.7">${esc(studentText)}</div></div><div class="tms-form-item"><label class="tms-form-label">日期</label><input class="finput tms-form-control" value="${esc(c.startDate||'—')} ~ ${esc(c.endDate||'—')}" readonly></div></div><div class="tms-form-row" style="margin-bottom:0"><div class="tms-form-item full-width"><label class="tms-form-label">课时进度</label><div class="finput tms-form-control" style="height:auto;min-height:54px;white-space:normal;line-height:1.7">总课时 ${tl} 节；已上 ${ul} 节；剩余 ${rem} 节</div></div></div>`;
  const footer=`<button class="tms-btn tms-btn-default" onclick="closeModal()">关闭</button>`;
  setCourtModalFrame('查看班次',body,footer,'modal-tight');
}
