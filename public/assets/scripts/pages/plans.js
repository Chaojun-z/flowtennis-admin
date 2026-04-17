function planClass(p){return classes.find(c=>c.id===p?.classId)||null;}
function planProduct(p){
  const cls=planClass(p);
  return (cls?.productId?products.find(x=>x.id===cls.productId):null)||products.find(x=>x.name===p?.productName)||null;
}
function planSchedules(p){
  return schedules.filter(s=>s.classId===p?.classId&&parseArr(s.studentIds).includes(p?.studentId)&&s.status!=='已取消'&&s.startTime).sort((a,b)=>new Date(String(b.startTime).replace(' ','T'))-new Date(String(a.startTime).replace(' ','T')));
}
function planLastLesson(p){
  const now=Date.now();
  return planSchedules(p).find(s=>new Date(String(s.startTime).replace(' ','T')).getTime()<=now)||null;
}
function planNextLesson(p){
  const now=Date.now();
  return planSchedules(p).slice().reverse().find(s=>new Date(String(s.startTime).replace(' ','T')).getTime()>=now)||null;
}
function planStage(p){
  const tl=parseInt(p?.totalLessons)||0,ul=parseInt(p?.usedLessons)||0,rem=tl-ul;
  if(ul<=0)return 'new';
  if(tl>0&&rem<=3)return 'ending';
  return 'ongoing';
}
function planEntitlementRows(p){
  const prod=planProduct(p);
  const base=entitlements.filter(e=>e.studentId===p?.studentId&&e.status==='active'&&(!e.validUntil||today()<=e.validUntil)&&(parseInt(e.remainingLessons)||0)>0);
  const matched=base.filter(e=>{
    if(e.productId&&planClass(p)?.productId)return e.productId===planClass(p).productId;
    if(e.productName&&p?.productName)return e.productName===p.productName;
    if(e.courseType&&prod?.type)return e.courseType===prod.type;
    return true;
  });
  return (matched.length?matched:base).sort((a,b)=>String(a.validUntil||'9999-12-31').localeCompare(String(b.validUntil||'9999-12-31')));
}
function planEntitlementSummary(p){
  const rows=planEntitlementRows(p);
  if(!rows.length)return '<span style="color:var(--td)">无可用权益</span>';
  const e=rows[0];
  return `${esc(e.packageName)||'课包'}<div class="udesc">剩 ${parseInt(e.remainingLessons)||0}/${parseInt(e.totalLessons)||0} · 到期 ${esc(e.validUntil)||'—'}</div>`;
}
function planFeedbackRows(p,limit=2){
  return feedbacks.filter(f=>f.studentId===p?.studentId||parseArr(f.studentIds).includes(p?.studentId)||planSchedules(p).some(s=>s.id===f.scheduleId)).sort((a,b)=>new Date(b.startTime||b.createdAt||0)-new Date(a.startTime||a.createdAt||0)).slice(0,limit);
}
function syncPlanFilterOptions(){
  const statusValue=document.getElementById('planStatusFilter')?.value||'';
  const campusValue=document.getElementById('planCampusFilter')?.value||'';
  const coachValue=document.getElementById('planCoachFilter')?.value||'';
  const typeValue=document.getElementById('planTypeFilter')?.value||'';
  const stageValue=document.getElementById('planStageFilter')?.value||'';
  const statusOptions=[{value:'',label:'全部状态'},{value:'active',label:'上课中'},{value:'已取消',label:'已取消'},{value:'已结课',label:'已结课'}];
  const campusOptions=[{value:'',label:'全部校区'},...campuses.map(c=>({value:c.code||c.id,label:c.name||c.code||c.id}))];
  const coachOptions=[{value:'',label:'全部教练'},...activeCoachNames().map(c=>({value:c,label:c}))];
  const typeOptions=[{value:'',label:'全部课程'},...PRODUCT_TYPES.map(t=>({value:t,label:t}))];
  const stageOptions=[{value:'',label:'全部阶段'},{value:'new',label:'刚开课'},{value:'ongoing',label:'进行中'},{value:'ending',label:'临近结课'}];
  const wrapMap=[
    ['planStatusFilterHost','planStatusFilter','全部状态',statusOptions,statusValue],
    ['planCampusFilterHost','planCampusFilter','全部校区',campusOptions,campusValue],
    ['planCoachFilterHost','planCoachFilter','全部教练',coachOptions,coachValue],
    ['planTypeFilterHost','planTypeFilter','全部课程',typeOptions,typeValue],
    ['planStageFilterHost','planStageFilter','全部阶段',stageOptions,stageValue]
  ];
  wrapMap.forEach(([hostId,id,label,options,value])=>{
    const host=document.getElementById(hostId);
    if(host)host.innerHTML=renderCourtDropdownHtml(id,label,options,value,false,'renderPlans');
  });
}
function openPlanStudent(planId){
  const p=plans.find(x=>x.id===planId);if(!p)return;
  openStudentDetail(p.studentId);
}
function openPlanClass(planId){
  const p=plans.find(x=>x.id===planId),cls=planClass(p);if(!cls)return;
  openClassModal(cls.id);
}
function openPlanSchedule(planId){
  const p=plans.find(x=>x.id===planId),cls=planClass(p),prod=planProduct(p);
  if(!p)return;
  openScheduleModal(null,{classId:p.classId,studentIds:[p.studentId],courseType:prod?.type||'',coach:cls?.coach||p.coach||'',campus:cls?.campus||p.campus||'',lessonCount:1,status:'已排课',scheduleSource:'学习计划'});
}
function openPlanDetail(planId){
  const p=plans.find(x=>x.id===planId);if(!p)return;
  const cls=planClass(p),last=planLastLesson(p),next=planNextLesson(p);
  const tl=parseInt(p.totalLessons)||0,ul=parseInt(p.usedLessons)||0,rem=tl-ul;
  const recent=planSchedules(p).slice(0,3);
  const feedbackRows=planFeedbackRows(p,2);
  const entitlementRows=planEntitlementRows(p).slice(0,3);
  const body=`<div class="tms-section-header" style="margin-top:0;">学习计划摘要</div><div class="tms-form-row"><div class="tms-form-item"><label class="tms-form-label">学员</label><input class="finput tms-form-control" value="${esc(p.studentName)||'—'}" readonly></div><div class="tms-form-item"><label class="tms-form-label">班次</label><input class="finput tms-form-control" value="${esc(p.className)||'—'}" readonly></div></div><div class="tms-form-row"><div class="tms-form-item"><label class="tms-form-label">教练</label><input class="finput tms-form-control" value="${esc(p.coach)||'—'}" readonly></div><div class="tms-form-item"><label class="tms-form-label">校区</label><input class="finput tms-form-control" value="${cn(p.campus)||'—'}" readonly></div></div><div class="tms-form-row"><div class="tms-form-item"><label class="tms-form-label">班次进度</label><input class="finput tms-form-control" value="${ul}/${tl}，剩余 ${Math.max(0,rem)} 节" readonly></div><div class="tms-form-item"><label class="tms-form-label">状态</label><input class="finput tms-form-control" value="${p.status==='active'?'上课中':esc(p.status)||'—'}" readonly></div></div><div class="tms-form-row"><div class="tms-form-item"><label class="tms-form-label">最近上课</label><input class="finput tms-form-control" value="${last?.startTime?fmtDt(last.startTime):'—'}" readonly></div><div class="tms-form-item"><label class="tms-form-label">下次课</label><input class="finput tms-form-control" value="${next?.startTime?fmtDt(next.startTime):'—'}" readonly></div></div><div class="tms-section-header">最近排课</div><div class="finput tms-form-control" style="height:auto;min-height:72px;white-space:normal;line-height:1.7">${recent.length?recent.map(s=>`${fmtDt(s.startTime)} · ${esc(s.coach)||'—'} · ${cn(s.campus)} ${esc(s.venue)||''} · ${parseInt(s.lessonCount)||1}节`).join('<br>'):'暂无排课记录'}</div><div class="tms-section-header">课包余额</div><div class="finput tms-form-control" style="height:auto;min-height:72px;white-space:normal;line-height:1.7">${entitlementRows.length?entitlementRows.map(e=>`${esc(e.packageName)||'课包'} · 剩 ${parseInt(e.remainingLessons)||0}/${parseInt(e.totalLessons)||0} · 到期 ${esc(e.validUntil)||'—'} · ${esc(e.timeBand)||'全天'}`).join('<br>'):'暂无可用课包'}</div><div class="tms-section-header">最近反馈</div><div class="finput tms-form-control" style="height:auto;min-height:72px;white-space:normal;line-height:1.7">${feedbackRows.length?feedbackRows.map(f=>`${String(f.startTime||f.createdAt||'').slice(0,10)}：${esc(f.knowledgePoint||f.nextTraining||f.practicedToday||'已填写反馈')}`).join('<br>'):'暂无课后反馈'}</div>`;
  const footer=`<button class="tms-btn tms-btn-default" onclick="closeModal()">关闭</button><button class="tms-btn tms-btn-default" onclick="openPlanStudent('${p.id}')">看学员</button><button class="tms-btn tms-btn-default" onclick="openPlanClass('${p.id}')">看班次</button><button class="tms-btn tms-btn-primary" onclick="openPlanSchedule('${p.id}')">去排课</button>`;
  setCourtModalFrame('学习计划详情',body,footer,'modal-wide');
}
function renderPlans(){
  syncPlanFilterOptions();
  const q=(document.getElementById('planSearch')?.value||'').toLowerCase();
  const sf=document.getElementById('planStatusFilter')?.value||'';
  const cf=document.getElementById('planCampusFilter')?.value||'';
  const coachF=document.getElementById('planCoachFilter')?.value||'';
  const typeF=document.getElementById('planTypeFilter')?.value||'';
  const stageF=document.getElementById('planStageFilter')?.value||'';
  let list=plans.filter(p=>{
    const stu=students.find(s=>s.id===p.studentId),prod=planProduct(p);
    const accountText=courtsForStudent(stu).map(c=>`${c.name} ${c.phone||''}`).join(' ');
    if(!searchHit(q,p.studentName,p.studentPhone,p.className,p.productName,prod?.type,p.coach,p.status,cn(p.campus),accountText,planEntitlementRows(p).map(e=>`${e.packageName} ${e.validUntil}`).join(' ')))return false;
    if(sf&&p.status!==sf)return false;
    if(cf&&p.campus!==cf)return false;
    if(coachF&&p.coach!==coachF)return false;
    if(typeF&&prod?.type!==typeF)return false;
    if(stageF&&planStage(p)!==stageF)return false;
    return true;
  });
  const total=list.length,pages=Math.ceil(total/PAGE_SIZE);
  if(planPage>Math.max(pages,1))planPage=1;
  const slice=list.slice((planPage-1)*PAGE_SIZE,planPage*PAGE_SIZE);
  const pager=document.querySelector('#page-plans .tms-pagination');
  if(pager)pager.style.display=pages>1?'flex':'none';
  document.getElementById('planPagerInfo').textContent=`共 ${total} 条`;
  document.getElementById('planPagerBtns').innerHTML=pages<=1?'':Array.from({length:pages},(_,i)=>`<div class="tms-page-btn${i+1===planPage?' active':''}" onclick="planPage=${i+1};renderPlans()">${i+1}</div>`).join('');
  const ss={'active':'tms-tag-green','已取消':'tms-tag-tier-slate','已结课':'tms-tag-tier-blue'};
  const sl={'active':'上课中','已取消':'已取消','已结课':'已结课'};
  document.getElementById('planTbody').innerHTML=slice.length?slice.map(p=>{
    const tl=parseInt(p.totalLessons)||0,ul=parseInt(p.usedLessons)||0,rem=tl-ul;
    const pct=tl>0?Math.round(ul/tl*100):0,pc=rem>3?'pf-gold':rem>1?'pf-warn':'pf-red';
    const w=p.status==='active'&&rem<=2;
    const last=planLastLesson(p);
    return `<tr class="${w?'warn-row':''}"><td style="padding-left:20px"><div class="tms-text-primary">${esc(p.studentName)||'—'}</div></td><td>${renderCourtCellText(p.studentPhone)}</td><td><div class="tms-text-primary">${esc(p.className)||'—'}</div></td><td><div class="tms-text-primary">${esc(p.productName)||'—'}</div><div class="tms-text-secondary">${esc(planProduct(p)?.type||'-')}</div></td><td>${renderCourtCellText(p.coach)}</td><td>${renderCourtCellText(last?.startTime?fmtDt(last.startTime):'-',false)}</td><td><div class="prog-wrap"><div class="prog-track"><div class="prog-fill ${pc}" style="width:${Math.max(0,Math.min(100,pct))}%"></div></div><span class="prog-txt">${ul}/${tl} ${w?'<span class="warn-txt">剩'+rem+'!</span>':'剩'+rem}</span></div></td><td><div class="tms-text-remark" style="max-width:240px" title="${esc(planEntitlementRows(p).map(e=>`${e.packageName||'课包'} 剩${parseInt(e.remainingLessons)||0}/${parseInt(e.totalLessons)||0}`).join('；')||'无可用权益')}">${planEntitlementSummary(p)}</div></td><td><span class="tms-tag ${ss[p.status]||'tms-tag-tier-slate'}">${sl[p.status]||p.status||'—'}</span></td><td class="tms-sticky-r tms-action-cell" style="width:180px;padding-right:20px"><span class="tms-action-link" onclick="openPlanDetail('${p.id}')">详情</span><span class="tms-action-link" onclick="openPlanStudent('${p.id}')">学员</span><span class="tms-action-link" onclick="openPlanSchedule('${p.id}')">排课</span></td></tr>`;
  }).join(''):'<tr><td colspan="10"><div class="empty"><div class="empty-ico">📚</div><p>暂无学习计划</p></div></td></tr>';
}
