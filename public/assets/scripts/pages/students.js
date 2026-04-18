// ===== 学员信息 =====
function onStudentFilterChange(){stuPage=1;renderStudents();}
function renderStudentToolbarFilters(){
  const typeValue=document.getElementById('stuTypeFilter')?.value||'';
  const sourceValue=document.getElementById('stuSourceFilter')?.value||'';
  const coachValue=document.getElementById('stuCoachFilter')?.value||'';
  const typeOptions=[{value:'',label:'全部类型'},{value:'成人',label:'成人'},{value:'青少年',label:'青少年'}];
  const sourceOptions=[{value:'',label:'全部来源'},...SOURCES.map(t=>({value:t,label:t}))];
  const coachOptions=[{value:'',label:'全部负责教练'},{value:'__unassigned__',label:'未分配'},...activeCoachNames().map(name=>({value:name,label:name}))];
  const wrapMap=[
    ['stuTypeFilterHost','stuTypeFilter','全部类型',typeOptions,typeValue],
    ['stuSourceFilterHost','stuSourceFilter','全部来源',sourceOptions,sourceValue],
    ['stuCoachFilterHost','stuCoachFilter','全部负责教练',coachOptions,coachValue]
  ];
  wrapMap.forEach(([hostId,id,label,options,value])=>{
    const host=document.getElementById(hostId);
    if(host)host.innerHTML=renderCourtDropdownHtml(id,label,options,value,false,'onStudentFilterChange');
  });
}
function getStudentBaseList(){
  return students.filter(s=>campus==='all'||s.campus===campus);
}
function getFilteredStudents(){
  const q=(document.getElementById('stuSearch')?.value||'').toLowerCase();
  const tf=document.getElementById('stuTypeFilter')?.value||'';
  const sf=document.getElementById('stuSourceFilter')?.value||'';
  const coachFilter=document.getElementById('stuCoachFilter')?.value||'';
  return getStudentBaseList().filter(s=>{
    const accountText=courtsForStudent(s).map(c=>`${c.name} ${c.phone||''}`).join(' ');
    if(!searchHit(q,s.name,s.phone,s.type,s.source,s.activityRange,s.notes,cn(s.campus),accountText,s.primaryCoach))return false;
    if(tf&&s.type!==tf)return false;
    if(sf&&s.source!==sf)return false;
    if(coachFilter==='__unassigned__'&&String(s.primaryCoach||'').trim())return false;
    if(coachFilter&&coachFilter!=='__unassigned__'&&coachName(s.primaryCoach)!==coachFilter)return false;
    return true;
  });
}
function studentCompletedLessonCount(stu){
  const units=schedules
    .filter(x=>scheduleHasStudent(x,stu))
    .filter(x=>effectiveScheduleStatus(x)==='已结束')
    .reduce((sum,x)=>sum+scheduleLessonUnits(x),0);
  return lessonUnitsText(units);
}
function studentPageTrialConvertedByPurchase(schedule){
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
function studentPageStats(base){
  const now=shanghaiNow();
  const todayStr=localDateKey(now);
  const monthKey=todayStr.slice(0,7);
  const ws=weekStart(now),we=addDays(ws,7);
  const scopedRows=billableSchedules().filter(s=>campus==='all'||s.campus===campus);
  const endedRows=scopedRows.filter(s=>{const end=dtObj(s.endTime||s.startTime);return end&&end<=now;});
  const todayEndedRows=endedRows.filter(s=>String(s.startTime||'').slice(0,10)===todayStr);
  const weekEndedRows=endedRows.filter(s=>inRange(s.startTime,ws,we));
  const monthEndedRows=endedRows.filter(s=>String(s.startTime||'').slice(0,7)===monthKey);
  const monthTrialRows=monthEndedRows.filter(s=>scheduleIsTrial(s));
  const monthTrialConverted=monthTrialRows.filter(s=>studentPageTrialConvertedByPurchase(s)).length;
  return {
    total:base.length,
    todayLessons:lessonUnitsText(sumScheduleLessonUnits(todayEndedRows)),
    weekLessons:lessonUnitsText(sumScheduleLessonUnits(weekEndedRows)),
    monthLessons:lessonUnitsText(sumScheduleLessonUnits(monthEndedRows)),
    monthTrialRate:monthTrialRows.length?Math.round(monthTrialConverted/monthTrialRows.length*100):0,
    pendingConversion:base.filter(s=>studentNeedsConversion(s)).length
  };
}
function getStudentDuplicateCandidates(input,editingId=''){
  const name=String(input?.name||'').trim();
  const phone=String(input?.phone||'').replace(/\s+/g,'').trim();
  return students.filter(s=>{
    if(editingId&&s.id===editingId)return false;
    const samePhone=phone&&String(s.phone||'').replace(/\s+/g,'').trim()===phone;
    const sameName=name&&String(s.name||'').trim()===name;
    return samePhone||sameName;
  });
}
function renderStudents(){
  renderStudentToolbarFilters();
  let list=getFilteredStudents();
  const base=getStudentBaseList();
  const stats=studentPageStats(base);
  document.getElementById('studentStatsRow').innerHTML=`<div class="tms-stat-card"><div class="tms-stat-label">学员总数</div><div class="tms-stat-value">${stats.total}<span>人</span></div><div class="tms-stat-sub">当前校区口径</div></div><div class="tms-stat-card"><div class="tms-stat-label">今日课时</div><div class="tms-stat-value">${stats.todayLessons}<span>节</span></div></div><div class="tms-stat-card"><div class="tms-stat-label">本周课时</div><div class="tms-stat-value">${stats.weekLessons}<span>节</span></div></div><div class="tms-stat-card"><div class="tms-stat-label">本月课时</div><div class="tms-stat-value">${stats.monthLessons}<span>节</span></div></div><div class="tms-stat-card"><div class="tms-stat-label">本月体验课转化率</div><div class="tms-stat-value">${stats.monthTrialRate}<span>%</span></div></div><div class="tms-stat-card"><div class="tms-stat-label">待转化</div><div class="tms-stat-value">${stats.pendingConversion}<span>人</span></div><div class="tms-stat-sub">上过体验课且无购买/消耗</div></div>`;
  const total=list.length,pages=Math.ceil(total/PAGE_SIZE);
  if(stuPage>Math.max(pages,1))stuPage=1;
  const slice=list.slice((stuPage-1)*PAGE_SIZE,stuPage*PAGE_SIZE);
  const pager=document.querySelector('#page-students .tms-pagination');
  if(pager)pager.style.display=pages>1?'flex':'none';
  document.getElementById('stuPagerInfo').textContent=`共 ${total} 条`;
  document.getElementById('stuPagerBtns').innerHTML=pages<=1?'':Array.from({length:pages},(_,i)=>`<div class="tms-page-btn${i+1===stuPage?' active':''}" onclick="stuPage=${i+1};renderStudents()">${i+1}</div>`).join('');
  document.getElementById('stuTbody').innerHTML=slice.length?slice.map(s=>{
    const stuScheds=schedules.filter(x=>scheduleHasStudent(x,s)&&x.startTime).sort((a,b)=>new Date(b.startTime)-new Date(a.startTime));
    const lastLesson=stuScheds.length?stuScheds[0].startTime.slice(0,10):'';
    const primaryClass=studentPrimaryClass(s);
    const activeClasses=studentActiveClasses(s);
    const classText=primaryClass?`${primaryClass.className}${activeClasses.length>1?` · 另有${activeClasses.length-1}个`:''}`:'未入班';
    const coachText=studentPrimaryCoachText(s);
    const packageText=studentPackageLessonSummary(s);
    const bookingText=studentBookingMembershipSummary(s);
    const packageClass=packageText&&packageText!=='无课包'?' student-summary-strong':'';
    const bookingClass=bookingText&&bookingText!=='未关联'?' student-summary-strong':'';
    return `<tr><td class="tms-sticky-l" style="padding-left:20px"><div class="tms-text-primary">${esc(s.name)}</div></td><td>${renderCourtCellText(s.phone)}</td><td>${renderCourtCellText(s.type)}</td><td>${renderCourtCellText(cn(s.campus))}</td><td>${renderCourtCellText(classText)}</td><td>${renderCourtCellText(lastLesson?daysAgoText(lastLesson):'-',false)}</td><td>${renderCourtCellText(studentCompletedLessonCount(s),false)}</td><td>${renderCourtCellText(coachText)}</td><td><div class="tms-text-remark${packageClass}" title="${esc(packageText)}">${esc(renderCourtEmptyText(packageText))}</div></td><td><div class="tms-text-remark${bookingClass}" title="${esc(bookingText)}">${esc(renderCourtEmptyText(bookingText))}</div></td><td>${renderCourtCellText(s.source)}</td><td><div class="tms-text-remark" title="${esc(studentNoteSummary(s))}">${esc(renderCourtEmptyText(studentNoteSummary(s)))}</div></td><td class="tms-sticky-r tms-action-cell" style="width:150px;padding-right:20px"><span class="tms-action-link" onclick="openStudentDetail('${s.id}')">查看</span><span class="tms-action-link" onclick="openPurchaseModal('${s.id}')">课包</span><span class="tms-action-link" onclick="openStudentModal('${s.id}')">编辑</span></td></tr>`;
  }).join(''):'<tr><td colspan="13"><div class="empty"><div class="empty-ico">👥</div><p>暂无学员</p></div></td></tr>';
}
function studentFeedbackHistoryHtml(s){
  const rows=feedbacks.filter(f=>{
    const fIds=parseArr(f.studentIds);
    if(f.studentId===s.id||fIds.includes(s.id))return true;
    const sch=schedules.find(x=>x.id===f.scheduleId);
    if(sch&&parseArr(sch.studentIds).includes(s.id))return true;
    return !f.studentId&&!fIds.length&&String(f.studentName||'')===String(s.name||'');
  }).sort((a,b)=>new Date(b.startTime||b.createdAt||0)-new Date(a.startTime||a.createdAt||0)).slice(0,8);
  if(!rows.length)return '<div style="font-size:12px;color:var(--td)">暂无课后反馈</div>';
  return rows.map(f=>{
    const sch=schedules.find(x=>x.id===f.scheduleId)||{};
    const cls=sch.classId?classes.find(c=>c.id===sch.classId):null;
    const product=cls?.productName||products.find(p=>p.id===cls?.productId)?.name||'';
    const course=[cls?.className,product].filter(Boolean).join(' / ')||'—';
    const campus=f.campus||sch.campus,venue=f.venue||sch.venue;
    return `<div style="border-top:0.5px solid rgba(180,83,9,.12);padding:8px 0;font-size:12px;color:var(--tb)"><div style="font-weight:700;color:var(--th)">${fmtDt(f.startTime||sch.startTime)} · ${esc(f.coach||sch.coach)||'—'}</div><div style="margin-top:3px;color:var(--ts)">校区/场地：${cn(campus)||'—'} ${esc(venue)||''}；课程：${esc(course)}</div><div style="margin-top:3px">今天练习了：${esc(f.practicedToday)||'—'}</div><div style="margin-top:3px">练习情况：${esc(f.knowledgePoint)||'—'}</div><div style="margin-top:3px">下次练习：${esc(f.nextTraining)||'—'}</div></div>`;
  }).join('');
}
function studentRecentFeedbacks(stu,limit=2){
  return feedbacks.filter(f=>{
    const fIds=parseArr(f.studentIds);
    if(f.studentId===stu.id||fIds.includes(stu.id))return true;
    const sch=schedules.find(x=>x.id===f.scheduleId);
    if(sch&&parseArr(sch.studentIds).includes(stu.id))return true;
    return false;
  }).sort((a,b)=>new Date(b.startTime||b.createdAt||0)-new Date(a.startTime||a.createdAt||0)).slice(0,limit);
}
function studentLessonRecordHtml(stu){
  const rows=schedules
    .filter(x=>scheduleHasStudent(x,stu)&&x.startTime)
    .sort((a,b)=>new Date(b.startTime)-new Date(a.startTime))
    .slice(0,12);
  if(!rows.length)return '暂无上课记录';
  return rows.map(s=>`${String(s.startTime||'').replace('T',' ').slice(0,16)} · ${scheduleCourseType(s)} · ${scheduleClassName(s)} · ${s.coach||'—'} · ${lessonUnitsText(scheduleLessonUnits(s))}节 · ${cn(s.campus)||'—'} ${s.venue||''} · ${effectiveScheduleStatus(s)}`).map(esc).join('<br>');
}
function studentTeachingInfoHtml(stu){
  const status=studentStatusMeta(stu);
  const primaryClass=studentPrimaryClass(stu);
  const coachText=studentCoachSummary(stu);
  const recentSchedule=schedules.filter(x=>scheduleHasStudent(x,stu)&&x.startTime).sort((a,b)=>new Date(b.startTime)-new Date(a.startTime))[0];
  const recentFeedbacks=studentRecentFeedbacks(stu,2);
  return `<div class="tms-section-header">教学信息</div><div class="tms-form-row"><div class="tms-form-item"><label class="tms-form-label">当前状态</label><div class="finput tms-form-control"><span class="tms-tag ${status.badge==='b-green'?'tms-tag-green':status.badge==='b-red'?'tms-tag-red':'tms-tag-tier-blue'}">${status.label}</span></div></div><div class="tms-form-item"><label class="tms-form-label">当前班次</label><input class="finput tms-form-control" value="${esc(primaryClass?.className)||'未入班'}" readonly></div></div><div class="tms-form-row"><div class="tms-form-item"><label class="tms-form-label">负责教练</label><input class="finput tms-form-control" value="${esc(coachText)}" readonly></div><div class="tms-form-item"><label class="tms-form-label">最近上课</label><input class="finput tms-form-control" value="${recentSchedule?.startTime?daysAgoText(recentSchedule.startTime.slice(0,10)):'-'}" readonly></div></div><div class="tms-form-row"><div class="tms-form-item"><label class="tms-form-label">累计上课</label><input class="finput tms-form-control" value="${studentCompletedLessonCount(stu)}" readonly></div><div class="tms-form-item"><label class="tms-form-label">课包 / 课时</label><input class="finput tms-form-control" value="${esc(studentPackageLessonSummary(stu))}" readonly></div></div><div class="tms-form-row"><div class="tms-form-item full-width"><label class="tms-form-label">班次进度</label><div class="finput tms-form-control tms-readonly-text">${studentClassSummaryHtml(stu)}</div></div></div><div class="tms-form-row"><div class="tms-form-item full-width"><label class="tms-form-label">上课记录</label><div class="finput tms-form-control tms-readonly-text">${studentLessonRecordHtml(stu)}</div></div></div><div class="tms-form-row" style="margin-bottom:0"><div class="tms-form-item full-width"><label class="tms-form-label">最近2条课后反馈</label><div class="finput tms-form-control tms-readonly-text">${recentFeedbacks.length?recentFeedbacks.map(f=>`${String(f.startTime||f.createdAt||'').slice(0,10)}：${f.practicedToday||f.knowledgePoint||f.nextTraining||'已填写反馈'}`).map(esc).join('<br>'):'-'}</div></div></div>`;
}
function studentOpsInfoHtml(stu){
  const recentSchedule=schedules.filter(x=>scheduleHasStudent(x,stu)&&x.startTime).sort((a,b)=>new Date(b.startTime)-new Date(a.startTime))[0];
  const recentFeedback=studentRecentFeedbacks(stu,1)[0];
  const latestCourt=latestCourtUseDateForStudent(stu);
  const conversionSummary=recentFeedback?(recentFeedback.conversionIntent||recentFeedback.recommendedProductType||recentFeedback.needOpsFollowUp?'已形成转化判断':'未形成转化判断'):'暂无转化判断';
  const opsNeed=recentFeedback?.needOpsFollowUp?'需要运营跟进':'暂不需要运营跟进';
  return `<div class="tms-section-header">运营信息</div><div class="tms-form-row"><div class="tms-form-item"><label class="tms-form-label">来源</label><input class="finput tms-form-control" value="${esc(stu.source)||'—'}" readonly></div><div class="tms-form-item"><label class="tms-form-label">活动范围</label><input class="finput tms-form-control" value="${esc(stu.activityRange)||'—'}" readonly></div></div><div class="tms-form-row"><div class="tms-form-item"><label class="tms-form-label">最近活跃</label><input class="finput tms-form-control" value="${recentSchedule?.startTime?daysAgoText(recentSchedule.startTime.slice(0,10)):latestCourt?daysAgoText(latestCourt):'—'}" readonly></div><div class="tms-form-item"><label class="tms-form-label">最近订场</label><input class="finput tms-form-control" value="${latestCourt?daysAgoText(latestCourt):'—'}" readonly></div></div><div class="tms-form-row"><div class="tms-form-item"><label class="tms-form-label">转化判断</label><input class="finput tms-form-control" value="${esc(conversionSummary)}" readonly></div><div class="tms-form-item"><label class="tms-form-label">运营跟进</label><input class="finput tms-form-control" value="${esc(opsNeed)}" readonly></div></div><div class="tms-form-row"><div class="tms-form-item full-width"><label class="tms-form-label">最近反馈里的运营结论</label><div class="finput tms-form-control" style="height:auto;min-height:72px;white-space:normal;line-height:1.7">${recentFeedback?esc([recentFeedback.mainIssues,recentFeedback.recommendedReason,recentFeedback.opsFollowUpSuggestion].filter(Boolean).join('；'))||'—':'—'}</div></div></div><div class="tms-form-row" style="margin-bottom:0"><div class="tms-form-item full-width"><label class="tms-form-label">运营备注</label><div class="finput tms-form-control" style="height:auto;min-height:72px;white-space:normal;line-height:1.7">${esc(stu.notes)||'—'}</div></div></div>`;
}
function studentConsumptionInfoHtml(stu){
  const linkedCourts=courtsForStudent(stu);
  return `<div class="tms-section-header">消费与关联信息</div><div class="tms-form-row"><div class="tms-form-item"><label class="tms-form-label">订场 / 会员</label><input class="finput tms-form-control" value="${esc(studentBookingMembershipSummary(stu))}" readonly></div><div class="tms-form-item"><label class="tms-form-label">最近订场</label><input class="finput tms-form-control" value="${latestCourtUseDateForStudent(stu)?daysAgoText(latestCourtUseDateForStudent(stu)):'—'}" readonly></div></div><div class="tms-form-row"><div class="tms-form-item full-width"><label class="tms-form-label">订场账户摘要</label><div class="finput tms-form-control tms-readonly-text">${studentAccountSummaryHtml(stu)}</div><div class="tms-field-help">关联订场账户在「订场/会员」页面编辑用户时选择「关联学员」。</div></div></div><div class="tms-form-row"><div class="tms-form-item full-width"><label class="tms-form-label">会员摘要</label><div class="finput tms-form-control tms-readonly-text">${studentMembershipSummaryHtml(stu)}</div></div></div><div class="tms-form-row"><div class="tms-form-item full-width"><label class="tms-form-label">课包购买记录</label><div class="finput tms-form-control tms-readonly-text">${studentEntitlementSummaryHtml(stu)}</div></div></div><div class="tms-form-row"><div class="tms-form-item full-width"><label class="tms-form-label">课包消耗记录</label><div class="finput tms-form-control tms-readonly-text">${studentEntitlementLedgerHtml(stu)}</div></div></div>${linkedCourts.length?`<div class="tms-form-row" style="margin-bottom:0"><div class="tms-form-item full-width"><label class="tms-form-label">关联说明</label><div class="finput tms-form-control tms-readonly-text">${esc(linkedCourts.map(c=>c.name).join('、'))}</div></div></div>`:''}`;
}
function studentLinkedDetailHtml(s,showAccount=true){
  const latest=schedules.filter(x=>scheduleHasStudent(x,s)).sort((a,b)=>new Date(b.startTime||0)-new Date(a.startTime||0))[0];
  const canBuyPackage=currentUser?.role==='admin';
  return `<div class="sec-ttl">关联信息</div><div style="background:rgba(217,119,6,0.06);border:0.5px solid rgba(217,119,6,0.16);border-radius:8px;padding:10px 12px;margin-bottom:12px">${showAccount?`<div class="flabel">订场账户</div>${studentAccountSummaryHtml(s)}<div class="flabel" style="margin-top:8px">关联订场账户会员摘要</div>${studentMembershipSummaryHtml(s)}`:''}<div class="flabel" style="margin-top:${showAccount?8:0}px">所在班次</div>${studentClassSummaryHtml(s)}<div class="flabel" style="margin-top:8px">课包余额</div>${studentEntitlementSummaryHtml(s)}${canBuyPackage?`<div style="margin-top:8px"><button class="btn-sec" onclick="openPurchaseModal('${s.id}')">购买课包</button></div>`:''}<div class="flabel" style="margin-top:8px">最近记录</div><div style="font-size:12px;color:var(--tb)">最近上课：${latest?.startTime?.slice(0,10)||'—'}；最近订场：${latestCourtUseDateForStudent(s)||'—'}</div><div class="flabel" style="margin-top:8px">课后反馈</div>${studentFeedbackHistoryHtml(s)}</div>`;
}
function openStudentDetail(id){
  const s=students.find(x=>x.id===id);if(!s)return;
  const body=`<div class="tms-section-header" style="margin-top:0;">基本信息</div><div class="tms-form-row"><div class="tms-form-item"><label class="tms-form-label">姓名</label><input class="finput tms-form-control" value="${esc(s.name)||'—'}" readonly></div><div class="tms-form-item"><label class="tms-form-label">手机号</label><input class="finput tms-form-control" value="${esc(s.phone)||'—'}" readonly></div></div><div class="tms-form-row"><div class="tms-form-item"><label class="tms-form-label">学员类型</label><input class="finput tms-form-control" value="${esc(s.type)||'—'}" readonly></div><div class="tms-form-item"><label class="tms-form-label">所在校区</label><input class="finput tms-form-control" value="${cn(s.campus)||'—'}" readonly></div></div>${studentTeachingInfoHtml(s)}${studentOpsInfoHtml(s)}${studentConsumptionInfoHtml(s)}`;
  const footer=`<button class="tms-btn tms-btn-default" onclick="closeModal()">关闭</button><button class="tms-btn tms-btn-primary" onclick="openStudentModal('${s.id}')">编辑资料</button>`;
  setCourtModalFrame('学员详情',body,footer,'modal-wide');
}
function openStudentModal(id){
  editId=id;const s=id?students.find(x=>x.id===id):null;
  const typeOptions=[{value:'成人',label:'成人'},{value:'青少年',label:'青少年'}];
  const sourceOptions=[{value:'',label:'— 选择 —'},...SOURCES.map(t=>({value:t,label:t}))];
  const campusOptions=[{value:'',label:'-'},...campuses.map(c=>({value:c.code||c.id,label:c.name||c.code||c.id}))];
  const coachOptions=[{value:'',label:'— 未分配 —'},...activeCoachNames().map(name=>({value:name,label:name}))];
  const body=`<div class="tms-section-header" style="margin-top:0;">基本信息</div><div class="tms-form-row"><div class="tms-form-item"><label class="tms-form-label">姓名 *</label><input type="text" class="finput tms-form-control" id="s_name" value="${rv(s,'name')}" placeholder="学员姓名"></div><div class="tms-form-item"><label class="tms-form-label">手机号</label><input type="text" class="finput tms-form-control" id="s_phone" value="${rv(s,'phone')}" placeholder="13800138000"></div></div><div class="tms-form-row"><div class="tms-form-item"><label class="tms-form-label">负责教练</label>${renderCourtDropdownHtml('s_primaryCoach','负责教练',coachOptions,rv(s,'primaryCoach'),true)}</div><div class="tms-form-item"><label class="tms-form-label">学员类型</label>${renderCourtDropdownHtml('s_type','学员类型',typeOptions,rv(s,'type','成人'),true)}</div></div><div class="tms-form-row"><div class="tms-form-item"><label class="tms-form-label">来源</label>${renderCourtDropdownHtml('s_source','来源',sourceOptions,rv(s,'source'),true)}</div><div class="tms-form-item"><label class="tms-form-label">活动范围</label><input type="text" class="finput tms-form-control" id="s_range" value="${rv(s,'activityRange')}" placeholder="例：朝阳"></div></div><div class="tms-form-row"><div class="tms-form-item"><label class="tms-form-label">所在校区</label>${renderCourtDropdownHtml('s_campus','校区',campusOptions,rv(s,'campus'),true)}</div></div><div class="tms-form-row" style="margin-bottom:0"><div class="tms-form-item full-width"><label class="tms-form-label">备注</label><textarea class="finput tms-form-control" id="s_notes">${esc(rv(s,'notes'))}</textarea></div></div>`;
  const footer=id?`<button class="tms-btn tms-btn-default" onclick="closeModal()">取消</button><div style="display:flex;gap:12px;"><button class="tms-btn tms-btn-danger" onclick="confirmDel('${s.id}','${esc(s.name)}','student')">删除</button><button class="tms-btn tms-btn-primary" id="studentSaveBtn" onclick="saveStudent()">保存</button></div>`:`<div style="display:flex;gap:12px;margin-left:auto;"><button class="tms-btn tms-btn-default" onclick="closeModal()">取消</button><button class="tms-btn tms-btn-primary" id="studentSaveBtn" onclick="saveStudent()">保存</button></div>`;
  setCourtModalFrame(id?'编辑学员':'添加学员',body,footer,'modal-tight');
}
async function saveStudent(){
  const name=document.getElementById('s_name').value.trim();if(!name){toast('请输入姓名','warn');return;}
  const phone=document.getElementById('s_phone').value.trim();if(!validateCnPhone(phone)){toast('手机号格式不正确','warn');return;}
  const btn=document.getElementById('studentSaveBtn');if(btn){btn.disabled=true;btn.textContent='保存中…';}
  const data={name,phone,primaryCoach:document.getElementById('s_primaryCoach')?.value||'',type:document.getElementById('s_type').value,source:document.getElementById('s_source').value,activityRange:document.getElementById('s_range').value.trim(),campus:document.getElementById('s_campus').value,notes:document.getElementById('s_notes').value.trim(),updatedBy:currentUser?.name||''};
  const duplicates=getStudentDuplicateCandidates(data,editId);
  if(duplicates.length){
    const summary=duplicates.map(s=>`${s.name}${s.phone?`（${s.phone}）`:''}`).join('、');
    if(!confirm(`发现可能重复的学员：${summary}。是否继续保存？`)){
      if(btn){btn.disabled=false;btn.textContent='保存';}
      return;
    }
  }
  try{
    if(editId){const res=await apiCall('PUT','/students/'+editId,data);const i=students.findIndex(x=>x.id===editId);students[i]={...students[i],...data,id:editId};mergeLinkedUpdates(res.studentUpdates||{});}
    else{const r=await apiCall('POST','/students',data);students.unshift(r);}
    closeModal();toast(editId?'修改成功 ✓':'添加成功 ✓','success');renderStudents();renderPlans();renderSchedule();renderPurchases();renderEntitlements();renderMySchedule();
  }catch(e){toast('保存失败：'+e.message,'error');if(btn){btn.disabled=false;btn.textContent='保存';}}
}
function mergeLinkedUpdates(updates){
  (updates.plans||[]).forEach(r=>{const i=plans.findIndex(x=>x.id===r.id);if(i>=0)plans[i]=r;});
  (updates.schedule||[]).forEach(r=>{const i=schedules.findIndex(x=>x.id===r.id);if(i>=0)schedules[i]=r;});
  (updates.purchases||[]).forEach(r=>{const i=purchases.findIndex(x=>x.id===r.id);if(i>=0)purchases[i]=r;});
  (updates.entitlements||[]).forEach(r=>{const i=entitlements.findIndex(x=>x.id===r.id);if(i>=0)entitlements[i]=r;});
  (updates.feedbacks||[]).forEach(r=>{const i=feedbacks.findIndex(x=>x.id===r.id);if(i>=0)feedbacks[i]=r;});
  (updates.courts||[]).forEach(r=>{const i=courts.findIndex(x=>x.id===r.id);if(i>=0)courts[i]=r;});
}
function exportStudentCSV(){
  const d=getFilteredStudents();
  let csv='姓名,手机号,类型,来源,活动范围,校区,备注\n';
  csv+=d.map(s=>[csvEscapeCell(s.name),csvEscapeCell(s.phone||''),csvEscapeCell(s.type||''),csvEscapeCell(s.source||''),csvEscapeCell(s.activityRange||''),csvEscapeCell(cn(s.campus)),csvEscapeCell(s.notes||'')].join(',')).join('\n');
  const blob=new Blob(['\ufeff'+csv],{type:'text/csv;charset=utf-8;'});
  const a=document.createElement('a');a.href=URL.createObjectURL(blob);a.download='FlowTennis_学员_'+today()+'.csv';a.click();toast('导出成功','success');
}
