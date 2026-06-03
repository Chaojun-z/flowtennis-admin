// ===== 排课表 =====
function onScheduleFilterChange(){schPage=1;renderSchedule();}
function syncScheduleFilterOptions(){
  const statusValue=document.getElementById('schStatusFilter')?.value||'';
  const coachValue=document.getElementById('schCoachFilter')?.value||'';
  const courseTypeValue=document.getElementById('schCourseTypeFilter')?.value||'';
  const baseRows=schedules.filter(s=>campus==='all'||sameCampusValue(s.campus,campus));
  const statusOptions=withStandardFilterCounts([{value:'',label:'全部',emptyDisplay:'状态'},{value:'已排课',label:'待上课'},{value:'已结束',label:'已下课'},{value:'已取消',label:'已取消'}],baseRows,(s,value)=>effectiveScheduleStatus(s)===value);
  const coachNames=[...new Set([...activeCoachNames(),...schedules.map(s=>coachName(s.coach)).filter(Boolean)])];
  const coachOptions=withStandardFilterCounts([{value:'',label:'全部',emptyDisplay:'教练'},...coachNames.map(name=>({value:name,label:name}))],baseRows,(s,value)=>coachName(s.coach)===value);
  const courseTypeOptions=withStandardFilterCounts([{value:'',label:'全部',emptyDisplay:'课程类型'},...PRODUCT_TYPES.map(t=>({value:t,label:t}))],baseRows,(s,value)=>scheduleCourseType(s)===value);
  [['schStatusFilterHost','schStatusFilter','状态',statusOptions,statusValue],['schCoachFilterHost','schCoachFilter','教练',coachOptions,coachValue],['schCourseTypeFilterHost','schCourseTypeFilter','课程类型',courseTypeOptions,courseTypeValue]].forEach(([hostId,id,label,options,value])=>{
    const host=document.getElementById(hostId);
    if(host)host.innerHTML=renderCourtDropdownHtml(id,label,options,value,false,'onScheduleFilterChange');
  });
}
function isExternalSchedule(s){
  return s?.locationType==='external'||s?.campus==='__external__';
}
function scheduleLocationText(s){
  if(isExternalSchedule(s)){
    const name=s.externalVenueName||String(s.venue||'').split(' · ')[0]||'校区外';
    const court=s.externalCourtName||String(s.venue||'').split(' · ').slice(1).join(' · ');
    return [name,court].filter(Boolean).join(' · ');
  }
  return `${cn(s?.campus)||'—'} · ${s?.venue||'—'}`;
}
function scheduleStatusLabel(status){
  if(status==='已结束')return '已下课';
  if(status==='已排课')return '待上课';
  return status||'待上课';
}
function scheduleStatusTagClass(status){
  return status==='已排课'?'tms-tag-tier-blue':status==='已结束'?'tms-tag-green':status==='已取消'?'tms-tag-tier-slate':'tms-tag-tier-slate';
}
function scheduleRepeatGroupRows(schedule){
  if(!schedule||schedule.scheduleSource!=='循环排课')return [];
  const key=scheduleRepeatIdentityKey(schedule);
  return schedules.filter(item=>item.scheduleSource==='循环排课'&&scheduleRepeatIdentityKey(item)===key)
    .sort((a,b)=>String(a.startTime||'').localeCompare(String(b.startTime||'')));
}
function scheduleRepeatDisplayText(schedule){
  if(!schedule||schedule.scheduleSource!=='循环排课')return '-';
  const count=scheduleRepeatGroupRows(schedule).length;
  return count>1?`循环${count}周`:'循环课';
}
function schedulePageNumbers(page,pages){
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
function renderSchedulePagerControls(total,pages){
  const pageSizeHost=document.getElementById('schPageSize');
  if(pageSizeHost)pageSizeHost.innerHTML=renderCourtDropdownHtml('schPageSizeValue',`${schPageSize}条/页`,[{value:'20',label:'20条/页'},{value:'50',label:'50条/页'},{value:'100',label:'100条/页'}],String(schPageSize),false,'setSchedulePageSize');
  const btns=document.getElementById('schPagerBtns');
  if(!btns)return;
  if(!total||pages<=1){btns.innerHTML='';return;}
  const pageBtns=schedulePageNumbers(schPage,pages).map(item=>item==='...'
    ?'<span class="tms-page-ellipsis">...</span>'
    :`<div class="tms-page-btn${item===schPage?' active':''}" onclick="schPage=${item};renderSchedule()">${item}</div>`
  ).join('');
  btns.innerHTML=`<div class="tms-page-btn" onclick="schPage=Math.max(1,schPage-1);renderSchedule()">上一页</div>${pageBtns}<div class="tms-page-btn" onclick="schPage=Math.min(${pages},schPage+1);renderSchedule()">下一页</div><span class="tms-page-jump">跳至 <input id="schPageJump" value="${schPage}" onkeydown="if(event.key==='Enter')jumpSchedulePage(this.value)"> 页</span>`;
}
function setSchedulePageSize(value){
  const next=parseInt(value,10);
  schPageSize=[20,50,100].includes(next)?next:20;
  schPage=1;
  renderSchedule();
}
function getFilteredSchedules(){
  const q=(document.getElementById('schSearch')?.value||'').toLowerCase();
  const sf=document.getElementById('schStatusFilter')?.value||'';
  const coachFilter=document.getElementById('schCoachFilter')?.value||'';
  const tf=document.getElementById('schCourseTypeFilter')?.value||'';
  const now=new Date();
  return schedules.filter(s=>{
    const cls=s.classId?classes.find(c=>c.id===s.classId):null;
    const effectiveStatus=effectiveScheduleStatus(s,now);
    const stuText=parseArr(s.studentIds).map(sid=>{const st=students.find(x=>x.id===sid);return `${st?.name||sid} ${st?.phone||''}`;}).join(' ');
    if(!searchHit(q,s.studentName,stuText,s.coach,s.venue,s.externalVenueName,s.externalNotes,effectiveStatus,scheduleStatusLabel(effectiveStatus),scheduleLocationText(s),cn(s.campus),s.notes,cls?.className,cls?.productName,fmtDt(s.startTime),fmtDt(s.endTime),s.cancelReason,s.scheduleSource))return false;
    if(campus!=='all'&&!sameCampusValue(s.campus,campus))return false;
    if(sf&&effectiveStatus!==sf)return false;
    if(coachFilter&&coachName(s.coach)!==coachFilter)return false;
    if(tf&&scheduleCourseType(s)!==tf)return false;
    return true;
  }).map(s=>({...s,_effectiveStatus:effectiveScheduleStatus(s,now)}));
}
function jumpSchedulePage(value){
  const total=getFilteredSchedules().length;
  const pages=Math.max(1,Math.ceil(total/schPageSize));
  schPage=Math.min(pages,Math.max(1,parseInt(value,10)||1));
  renderSchedule();
}
function scheduleHasActiveSearchOrFilter(){
  return !!((document.getElementById('schSearch')?.value||'').trim()||document.getElementById('schStatusFilter')?.value||document.getElementById('schCoachFilter')?.value||document.getElementById('schCourseTypeFilter')?.value);
}
function scheduleEmptyStateHtml(){
  const filtered=scheduleHasActiveSearchOrFilter();
  const title=filtered?'没有匹配的排课':'暂无排课';
  const desc=filtered?'调整搜索或筛选后再试':'点击右上角添加排课开始安排课程';
  return `<tr><td colspan="11"><div class="tms-empty-state"><div class="tms-empty-title">${title}</div><div class="tms-empty-desc">${desc}</div></div></td></tr>`;
}
function renderSchedule(){
  syncScheduleFilterOptions();
  let list=getFilteredSchedules().sort((a,b)=>new Date(b.startTime||0)-new Date(a.startTime||0));
  const total=list.length,pages=Math.max(1,Math.ceil(total/schPageSize));
  if(schPage>pages)schPage=pages;
  const slice=list.slice((schPage-1)*schPageSize,schPage*schPageSize);
  const pager=document.querySelector('#page-schedule .tms-pagination');
  if(pager)pager.style.display=total?'flex':'none';
  document.getElementById('schPagerInfo').textContent=`共 ${total} 条`;
  renderSchedulePagerControls(total,pages);
  document.getElementById('schTbody').innerHTML=slice.length?slice.map(s=>{
    const fb=scheduleFeedback(s);
    const status=s._effectiveStatus||effectiveScheduleStatus(s);
    const isCancelled=status==='已取消';
    const deleteAction=isCancelled||scheduleCanDeleteMistake(s);
    const dateText=String(s.startTime||'').slice(0,10)||'—';
    const timeText=s.startTime?`${s.startTime.slice(11,16)}-${(s.endTime||'').slice(11,16)}`:'—';
    return `<tr><td class="tms-sticky-l" style="padding-left:14px">${renderCourtCellText(dateText,false)}</td><td>${renderCourtCellText(timeText,false)}</td><td>${renderCourtCellText(scheduleDurationText(s),false)}</td><td><div class="tms-cell-text" title="${esc(s.externalNotes||scheduleLocationText(s))}">${esc(scheduleLocationText(s))}</div></td><td>${renderCourtCellText(coachName(s.coach),false)}</td><td><div class="tms-text-primary">${esc(scheduleListStudentSummary(s))}</div></td><td><span class="tms-tag ${productTypeTagClass(scheduleCourseType(s))}">${esc(scheduleCourseTypeLabel(s))}</span></td><td>${renderCourtCellText(scheduleRepeatDisplayText(s),false)}</td><td><span class="tms-action-link" onclick="openFeedbackModal('${s.id}')">${scheduleFeedbackStatusText(s)}</span></td><td><span class="tms-tag ${scheduleStatusTagClass(status)}">${scheduleStatusLabel(status)}</span>${status==='已取消'&&s.cancelReason?`<div class="tms-text-secondary" style="margin-top:6px">${esc(s.cancelReason)}</div>`:''}</td><td class="tms-sticky-r tms-action-cell schedule-action-cell"><span class="tms-action-link" onclick="openScheduleDetail('${s.id}')">查看</span><span class="tms-action-link" onclick="openScheduleModal('${s.id}')">编辑</span>${!isCancelled?`<span class="tms-action-link" onclick="openCancelScheduleModal('${s.id}')">取消</span>`:''}${deleteAction?`<span class="tms-action-link" onclick="confirmDel('${s.id}','误建排课','schedule')">删除</span>`:''}</td></tr>`;
  }).join(''):scheduleEmptyStateHtml();
}
function scheduleStudentTextByIds(ids){
  return parseArr(ids).map(id=>{
    const student=students.find(s=>s.id===id);
    if(!student)return id;
    return student.phone?`${student.name}（${student.phone}）`:student.name;
  }).join('、');
}
function scheduleSelectedStudentHomeCampusMeta(ids){
  const selected=parseArr(ids).map(id=>students.find(s=>s.id===id)).filter(Boolean);
  const campusIds=[...new Set(selected.map(s=>s.campus).filter(Boolean))];
  if(!selected.length)return {text:'归属校区：未选择学员',campus:''};
  if(!campusIds.length)return {text:'归属校区：未设置',campus:''};
  if(campusIds.length===1)return {text:`归属校区：${cn(campusIds[0])||campusIds[0]}`,campus:campusIds[0]};
  return {text:`归属校区：多个（${campusIds.map(id=>cn(id)||id).join('、')}）`,campus:''};
}
function scheduleSelectedStudentCoachMeta(ids){
  const selected=parseArr(ids).map(id=>students.find(s=>s.id===id)).filter(Boolean);
  const coaches=[...new Set(selected.map(s=>coachName(s.primaryCoach)).filter(Boolean))];
  if(!selected.length||coaches.length!==1)return {coach:''};
  return {coach:coaches[0]};
}
function scheduleStudentLastLessonBrief(student){
  const row=schedules.filter(s=>scheduleHasStudent(s,student)&&s.startTime).sort((a,b)=>new Date(b.startTime)-new Date(a.startTime))[0];
  if(!row?.startTime)return '无记录';
  const days=Math.max(0,Math.floor((Date.now()-new Date(row.startTime))/(86400000)));
  return days===0?'今天':`${days}天前`;
}
function scheduleStudentInlineMeta(student){
  return `归属：${cn(student?.campus)||'未设校区'} | 上次上课：${scheduleStudentLastLessonBrief(student)}`;
}
function campusOptionLabel(campusRecord){
  return campusRecord?.name||cn(campusRecord?.code||campusRecord?.id)||campusRecord?.code||campusRecord?.id||'—';
}
function scheduleVenueOptionsForCampus(campusCode){
  if(campusCode==='shilipu')return ['1号场','2号场','3号场','4号场','5号场'];
  return ['1号场','2号场','3号场','4号场'];
}
function scheduleCampusAllowsCustomVenue(campusCode){
  return true;
}
function renderScheduleVenueField(campusCode,venueValue=''){
  if(scheduleCampusAllowsCustomVenue(campusCode))return `<input class="finput tms-form-control" id="sch_venue" value="${esc(venueValue||'')}" placeholder="请直接填写场地">`;
  const venueOptions=scheduleVenueOptionsForCampus(campusCode).map(v=>({value:v,label:v}));
  const nextValue=venueOptions.some(item=>item.value===venueValue)?venueValue:(venueOptions[0]?.value||'');
  return renderCourtDropdownHtml('sch_venue','场地',venueOptions,nextValue,true);
}
function syncScheduleVenueField(preserveValue=''){
  const host=document.getElementById('sch_venueFieldHost');
  if(!host)return;
  const currentValue=preserveValue||document.getElementById('sch_venue')?.value||'';
  const campusValue=document.getElementById('sch_campus')?.value||'';
  host.innerHTML=renderScheduleVenueField(campusValue,currentValue);
}
function handleScheduleCampusChange(){
  refreshSchEntitlementOptions();
  syncScheduleVenueField();
}
function scheduleLessonUnitsFromFields(){
  const courseType=normalizeCourseType(document.getElementById('sch_courseType')?.value||'');
  const studentCount=parseArr(document.getElementById('sch_stuIds')?.value||'[]').length;
  if(courseType==='小班课'&&studentCount>=2){
    if(studentCount===2)return 1;
    if(studentCount===3)return 1.5;
    if(studentCount>=4)return 2;
  }
  const start=scheduleComposeDateTime('sch_date','sch_startTime');
  const end=scheduleComposeDateTime('sch_date','sch_endTime');
  if(!start||!end)return 1;
  const mins=durMin(start,end);
  if(!Number.isFinite(mins)||mins<=0)return 1;
  return Math.max(0.5,Math.round((mins/60)*10)/10);
}
function refreshScheduleTimeDerivedFields(){
  syncScheduleLessonCountFromTime();
}
function syncScheduleLessonCountFromTime(){
  const input=document.getElementById('sch_lc');
  if(!input)return;
  input.value=lessonUnitsText(scheduleLessonUnitsFromFields());
  refreshSchEntitlementOptions();
}
function syncScheduleHomeCampusFromStudents(ids,applyDefault=true){
  const meta=scheduleSelectedStudentHomeCampusMeta(ids);
  const summary=document.getElementById('sch_homeCampusSummary');
  if(summary)summary.textContent=meta.text;
  if(applyDefault&&meta.campus&&(document.getElementById('sch_locationType')?.value||'own')==='own'){
    setCourtDropdownValue('sch_campus',meta.campus,cn(meta.campus)||meta.campus);
    syncScheduleVenueField();
  }
}
function syncScheduleProfileFromStudents(ids,applyDefault=true){
  syncScheduleHomeCampusFromStudents(ids,applyDefault);
  const meta=scheduleSelectedStudentCoachMeta(ids);
  if(applyDefault&&meta.coach){const selectedCoach=coachName(meta.coach);setCourtDropdownValue('sch_coach',selectedCoach,selectedCoach);}
}
function renderScheduleStudentTags(selectedIds=[]){
  const picked=new Set(parseArr(selectedIds));
  const rows=students.filter(s=>picked.has(s.id));
  if(!rows.length)return '';
  return rows.map(s=>`<span class="schedule-student-tag">${esc(s.name)} <span>${esc(scheduleStudentInlineMeta(s))}</span><button type="button" onclick="removeScheduleStudent(${jsArg(s.id)})">×</button></span>`).join('');
}
function scheduleSelectedStudentSearchText(ids=[]){
  const picked=new Set(parseArr(ids));
  return students.filter(s=>picked.has(s.id)).map(s=>s.name).filter(Boolean).join(',');
}
function syncScheduleStudentSearchInput(ids=[]){
  const input=document.getElementById('sch_stuSearch');
  if(input)input.value=scheduleSelectedStudentSearchText(ids);
}
function scheduleStudentSearchKeyword(value='',ids=[]){
  const selectedText=scheduleSelectedStudentSearchText(ids);
  let keyword=String(value||'').trim();
  if(selectedText&&keyword.startsWith(selectedText))keyword=keyword.slice(selectedText.length).replace(/^,+/,'').trim();
  return keyword.split(',').pop().trim();
}
function renderScheduleStudentSuggestions(selectedIds=[],keyword=''){
  const picked=new Set(parseArr(selectedIds));
  const q=String(keyword||'').trim().toLowerCase();
  if(!q)return '';
  const pickedMatches=students.filter(s=>picked.has(s.id)&&[s.name,s.phone,cn(s.campus)].some(v=>String(v||'').toLowerCase().includes(q)));
  const rows=students.filter(s=>{
    if(picked.has(s.id))return false;
    return [s.name,s.phone,cn(s.campus)].some(v=>String(v||'').toLowerCase().includes(q));
  }).sort((a,b)=>String(a.name||'').localeCompare(String(b.name||''),'zh-CN')).slice(0,8);
  if(!rows.length)return pickedMatches.length?'':'<div class="schedule-student-suggest-empty">没有匹配到学员</div>';
  return `<div class="schedule-student-suggest-list">${rows.map(s=>`<button type="button" onclick="selectScheduleStudent(${jsArg(s.id)})"><strong>${esc(s.name)}</strong><span>${esc(s.phone||'-')} · ${esc(scheduleStudentInlineMeta(s))}</span></button>`).join('')}</div>`;
}
function updateScheduleStudentSummary(ids){
  const host=document.getElementById('sch_selectedStudentTags');
  if(host)host.innerHTML=renderScheduleStudentTags(ids);
}
function setScheduleStudentSelection(ids,keepKeyword=false,applyCampusDefault=true){
  const normalized=[...new Set(parseArr(ids).filter(Boolean))];
  const hidden=document.getElementById('sch_stuIds');
  if(hidden)hidden.value=JSON.stringify(normalized);
  updateScheduleStudentSummary(normalized);
  if(!keepKeyword)syncScheduleStudentSearchInput(normalized);
  const inputValue=document.getElementById('sch_stuSearch')?.value||'';
  const keyword=keepKeyword?scheduleStudentSearchKeyword(inputValue,normalized):'';
  const suggest=document.getElementById('sch_studentSuggest');
  if(suggest)suggest.innerHTML=renderScheduleStudentSuggestions(normalized,keyword);
  syncScheduleProfileFromStudents(normalized,applyCampusDefault);
  refreshScheduleTimeDerivedFields();
}
function applyScheduleStudentFilter(){
  const ids=parseArr(document.getElementById('sch_stuIds')?.value||'[]');
  setScheduleStudentSelection(ids,true,false);
}
function updateScheduleStudentSearch(){
  applyScheduleStudentFilter();
}
function selectScheduleStudent(studentId){
  const ids=parseArr(document.getElementById('sch_stuIds')?.value||'[]');
  setScheduleStudentSelection([...ids,studentId],false,true);
  syncScheduleStudentSearchInput([...ids,studentId]);
  const suggest=document.getElementById('sch_studentSuggest');
  if(suggest)suggest.innerHTML='';
  refreshSchEntitlementOptions();
}
function removeScheduleStudent(studentId){
  const ids=parseArr(document.getElementById('sch_stuIds')?.value||'[]').filter(id=>id!==studentId);
  const entitlement=document.getElementById('sch_entitlement');
  if(entitlement)delete entitlement.dataset.keep;
  setScheduleStudentSelection(ids,false,true);
  refreshSchEntitlementOptions();
}
function scheduleExternalVenueParts(s){
  const raw=String(s?.venue||'');
  const parts=raw.split(' · ');
  return {
    name:s?.externalVenueName||parts[0]||'',
    court:s?.externalCourtName||parts.slice(1).join(' · ')||''
  };
}
function toggleScheduleLocationType(){
  const type=document.getElementById('sch_locationType')?.value||'own';
  const own=document.getElementById('sch_ownLocationRow');
  const external=document.getElementById('sch_externalLocationRow');
  if(own)own.style.display=type==='external'?'none':'flex';
  if(external)external.style.display=type==='external'?'flex':'none';
  if(type==='own'){
    syncScheduleHomeCampusFromStudents(parseArr(document.getElementById('sch_stuIds')?.value||'[]'),!editId);
    syncScheduleVenueField();
  }
  refreshSchEntitlementOptions();
}
function toggleScheduleRepeatWeeks(){
  const wrap=document.getElementById('sch_repeatWeeksWrap');
  const checked=!!document.getElementById('sch_repeatEnabled')?.checked;
  if(wrap)wrap.style.display=checked?'':'none';
}
function scheduleAddMinutes(timeText,minutes){
  const [h,m]=String(timeText||'').split(':').map(n=>parseInt(n,10));
  if(!Number.isFinite(h)||!Number.isFinite(m))return '10:00';
  const total=Math.min(22*60,Math.max(7*60,h*60+m+minutes));
  const hh=String(Math.floor(total/60)).padStart(2,'0');
  const mm=String(total%60).padStart(2,'0');
  return `${hh}:${mm}`;
}
function handleScheduleStartTimeChange(){
  const start=document.getElementById('sch_startTime')?.value||'09:00';
  const courseType=normalizeCourseType(document.getElementById('sch_courseType')?.value||'');
  const count=parseArr(document.getElementById('sch_stuIds')?.value||'[]').length;
  const mins=courseType==='小班课'&&count>=2?(count>=4?120:count===3?90:60):60;
  const end=scheduleAddMinutes(start,mins);
  setCourtDropdownValue('sch_endTime',end,end);
  refreshScheduleTimeDerivedFields();
}
function scheduleEntitlementLabel(option){
  if(!option?.entitlementId)return option?.label||'自动匹配可用课包';
  return `${standardPackageLabel(option,true)||option.packageName} · 剩余${option.remainingLessons}/${option.totalLessons} · ${packageTimeBandShortLabel(option.timeBand||'全天')}${option.requiresFieldFee?' · 需补差价/场地费':''} · 到期${option.validUntil||'-'}`;
}
function renderScheduleEntitlementDropdown(options=[],value='',placeholder='自动匹配可用课包'){
  const list=options.length?options.map(x=>({value:x.entitlementId,label:scheduleEntitlementLabel(x)})):[{value:'',label:placeholder}];
  return renderCourtDropdownHtml('sch_entitlement','扣减课包',list,value,true,'handleScheduleEntitlementChange');
}
function setScheduleEntitlementDropdown(options=[],value='',placeholder='自动匹配可用课包'){
  const host=document.getElementById('sch_entitlementHost');
  const keep=document.getElementById('sch_entitlement')?.dataset.keep||'';
  if(host)host.innerHTML=renderScheduleEntitlementDropdown(options,value,placeholder);
  const input=document.getElementById('sch_entitlement');
  if(input&&keep)input.dataset.keep=keep;
}
function syncScheduleExperienceType(){
  const type=normalizeCourseType(document.getElementById('sch_courseType')?.value||'');
  const item=document.getElementById('sch_experienceTypeItem');
  if(item)item.style.display=type==='体验课'?'':'none';
}
function handleScheduleCourseTypeChange(){
  syncScheduleExperienceType();
  syncScheduleSmallClassType();
  refreshScheduleTimeDerivedFields();
  refreshSchEntitlementOptions();
}
function syncScheduleSmallClassType(){
  const type=normalizeCourseType(document.getElementById('sch_courseType')?.value||'');
  const item=document.getElementById('sch_smallClassTypeItem');
  if(item)item.style.display=type==='小班课'?'':'none';
  const repeat=document.getElementById('sch_repeatEnabled');
  const weeks=document.getElementById('sch_repeatWeeks');
  if(type==='小班课'&&(document.getElementById('sch_smallClassType')?.value||'')==='bootcamp'&&!editId){
    if(repeat)repeat.checked=true;
    if(weeks)weeks.value=6;
    toggleScheduleRepeatWeeks();
  }
}
function scheduleSettlementTypeLabel(value){
  return ({package:'课包扣减',direct:'直接收款',gift:'赠送/免费'})[value]||'课包扣减';
}
function currentScheduleSettlementType(){
  return document.getElementById('sch_settlementType')?.value||'package';
}
function toggleScheduleSettlementFields(){
  const type=currentScheduleSettlementType();
  const packageItem=document.getElementById('sch_packageSettlementItem');
  const directFields=document.getElementById('sch_directPaymentFields');
  if(packageItem)packageItem.style.display=type==='package'?'':'none';
  if(directFields)directFields.style.display=type==='direct'?'':'none';
  if(type!=='package'){setScheduleCourseTypeReadonly(false);setScheduleSmallClassTypeReadonly(false);}
  refreshSchEntitlementOptions();
  refreshScheduleFieldFeeFields();
}
// schedule modal field ids: id="sch_date" id="sch_startTime" id="sch_endTime" id="sch_cancelReason" id="sch_scheduleSource"
function openScheduleModal(id,seed={}){
  editId=id;
  const s=id?schedules.find(x=>x.id===id):(seed||null);
  const courseTypeForm=normalizeCourseTypeForForm(s||seed);
  const courseTypeOptions=PRODUCT_TYPES.map(t=>({value:t,label:t}));
  const coachOptions=[{value:'',label:'— 选择 —'},...activeCoachNames().map(c=>({value:c,label:c}))];
  const campusOptions=[{value:'',label:'— 选择 —'},...campuses.map(c=>({value:c.code||c.id,label:campusOptionLabel(c)}))];
  const cancelOptions=[{value:'',label:'— 未取消 —'},...SCH_CANCEL_REASONS.map(t=>({value:t,label:t}))];
  const selectedStudentIds=parseArr(rv(s,'studentIds','[]'));
  const expectedStudentIds=parseArr(rv(s,'expectedStudentIds','[]')).length?parseArr(rv(s,'expectedStudentIds','[]')):selectedStudentIds;
  const startRaw=String(rv(s,'startTime',seed.startTime||'')).trim().replace(' ','T');
  const endRaw=String(rv(s,'endTime',seed.endTime||'')).trim().replace(' ','T');
  const dateValue=startRaw?startRaw.slice(0,10):(endRaw?endRaw.slice(0,10):today());
  const startTimeValue=startRaw&&startRaw.length>=16?startRaw.slice(11,16):(seed.startTime?String(seed.startTime).slice(11,16):'09:00');
  const endTimeValue=endRaw&&endRaw.length>=16?endRaw.slice(11,16):(seed.endTime?String(seed.endTime).slice(11,16):scheduleAddMinutes(startTimeValue,60));
  const scheduleSource=rv(s,'scheduleSource',seed.scheduleSource||'排课表');
  const smallClassType=courseTypeForm.smallClassType||'single';
  const lateChecked=!!s?.coachLateFree;
  const locationType=isExternalSchedule(s)?'external':'own';
  const externalParts=scheduleExternalVenueParts(s);
  const scheduleExperienceType=courseTypeForm.experienceType||'私教体验课';
  const settlementType=rv(s,'settlementType',seed.settlementType||'package');
  const settlementOptions=[{value:'package',label:'课包扣减'},{value:'direct',label:'直接收款'},{value:'gift',label:'赠送/免费'}];
  const hiddenFields=`<input type="hidden" id="sch_stuIds" value="${rv(s,'studentIds','[]')}"><input type="hidden" id="sch_expectedStuIds" value="${esc(JSON.stringify(expectedStudentIds))}"><input type="hidden" id="sch_scheduleSource" value="${scheduleSource}"><input type="hidden" id="sch_status" value="${rv(s,'status','已排课')}">`;
  const smallClassOptions=[{value:'single',label:'单次'},{value:'bootcamp',label:'训练营'},{value:'dropin',label:'随到随学'}];
  const fieldFeeChecked=!!s?.requiresFieldFee&&parseFloat(s?.fieldFeeAmount)>0;
  const fieldFeeSection=`<div class="tms-form-row" id="sch_fieldFeeFields" style="display:none"><div class="tms-form-item"><label class="tms-form-label">是否收补差</label><div class="finput tms-form-control" style="display:flex;align-items:center;gap:10px"><input type="checkbox" class="tms-checkbox" id="sch_fieldFeeEnabled" ${fieldFeeChecked?'checked':''} onchange="refreshScheduleFieldFeeFields()"><span>非黄金课包排入黄金时段补差</span></div></div><div class="tms-form-item"><label class="tms-form-label">补差金额</label><input class="finput tms-form-control" id="sch_fieldFeeAmount" type="number" min="0" step="0.01" value="${rv(s,'fieldFeeAmount','')}" placeholder="补差金额"></div><div class="tms-form-item"><label class="tms-form-label">支付方式</label>${renderCourtDropdownHtml('sch_fieldFeePayMethod','支付方式',courseSurchargePayMethodOptions(),rv(s,'fieldFeePayMethod','微信'),true)}</div><div class="tms-form-item full-width"><label class="tms-form-label">补差说明</label><input class="finput tms-form-control" id="sch_fieldFeeNote" value="${esc(rv(s,'fieldFeeNote','非黄金课包排入黄金时段补差'))}" placeholder="非黄金课包排入黄金时段补差"></div></div>`;
  const studentSection=`<div class="tms-section-header" style="margin-top:0;">学员信息</div><div class="tms-form-row"><div class="tms-form-item full-width"><label class="tms-form-label">选择学员 *</label><input class="finput tms-form-control" id="sch_stuSearch" placeholder="搜索姓名 / 手机号" oninput="updateScheduleStudentSearch()" autocomplete="off"><div id="sch_studentSuggest" class="schedule-student-suggest"></div><div id="sch_selectedStudentTags" class="schedule-student-tags">${renderScheduleStudentTags(selectedStudentIds)}</div></div></div><div class="tms-form-row"><div class="tms-form-item"><label class="tms-form-label">结算方式</label>${renderCourtDropdownHtml('sch_settlementType','结算方式',settlementOptions,settlementType,true,'toggleScheduleSettlementFields')}</div><div class="tms-form-item" id="sch_packageSettlementItem"><label class="tms-form-label">扣减课包</label><div id="sch_entitlementHost">${renderScheduleEntitlementDropdown([],rv(s,'entitlementId',''),rv(s,'packageName','自动匹配可用课包')||'自动匹配可用课包')}</div><div id="sch_ent_hint" style="font-size:12px;color:var(--ts);margin-top:8px"></div></div><div class="tms-form-item" id="sch_directPaymentFields" style="display:none"><label class="tms-form-label">支付方式 / 金额</label><div class="tms-form-row" style="gap:10px;margin-bottom:0">${renderCourtDropdownHtml('sch_payMethod','支付方式',payMethodOptions(),rv(s,'payMethod','微信'),true)}<input class="finput tms-form-control" id="sch_paidAmount" type="number" min="0" step="0.01" value="${rv(s,'paidAmount','')}" placeholder="支付金额"></div></div><div class="tms-form-item"><label class="tms-form-label">课程类型</label>${renderCourtDropdownHtml('sch_courseType','课程类型',courseTypeOptions,courseTypeForm.courseType||PRODUCT_TYPES[0],true,'handleScheduleCourseTypeChange')}</div><div class="tms-form-item" id="sch_smallClassTypeItem" style="display:none"><label class="tms-form-label">小班类型</label>${renderCourtDropdownHtml('sch_smallClassType','小班类型',smallClassOptions,smallClassType,true,'syncScheduleSmallClassType')}</div><div class="tms-form-item" id="sch_experienceTypeItem" style="display:none"><label class="tms-form-label">体验课类型</label>${renderCourtDropdownHtml('sch_experienceType','体验课类型',experienceTypeOptions(),scheduleExperienceType,true)}</div></div>${fieldFeeSection}`;
  const lateSettings=`<details class="schedule-advanced schedule-late-settings"><summary>设置迟到</summary><div class="schedule-late-body"><div class="tms-form-row"><div class="tms-form-item"><label class="tms-form-label">教练迟到免费</label><div class="finput tms-form-control" style="display:flex;align-items:center;gap:10px"><input type="checkbox" class="tms-checkbox" id="sch_coachLateFree" ${lateChecked?'checked':''} onchange="refreshScheduleLateFee()"><span>本节不扣学员课时</span></div></div><div class="tms-form-item"><label class="tms-form-label">迟到分钟</label><input class="finput tms-form-control" id="sch_lateMinutes" type="number" min="0" value="${parseInt(rv(s,'lateMinutes',0))||0}"></div><div class="tms-form-item"><label class="tms-form-label">教练承担场地费</label><input class="finput tms-form-control" id="sch_lateFieldFee" type="number" min="0" value="${parseFloat(rv(s,'coachLateFieldFeeAmount',0))||0}"></div></div><div class="tms-form-row"><div class="tms-form-item"><label class="tms-form-label">取消原因</label>${renderCourtDropdownHtml('sch_cancelReason','取消原因',cancelOptions,rv(s,'cancelReason'),true)}</div><div class="tms-form-item"><label class="tms-form-label">迟到原因</label><input class="finput tms-form-control" id="sch_lateReason" value="${esc(rv(s,'lateReason'))}" placeholder="例如：教练迟到，本节课免费"></div></div></div></details>`;
  const lessonSection=`<div class="tms-section-header">上课信息</div><div class="tms-form-row schedule-time-course-row"><div class="tms-form-item schedule-time-field"><label class="tms-form-label">上课日期与时间 *</label>${scheduleTimeRangeControls(dateValue,startTimeValue,endTimeValue)}</div><div class="tms-form-item schedule-repeat-field"><label class="tms-form-label">循环排课</label><div class="finput tms-form-control schedule-repeat-control ${id?'is-disabled':''}" style="display:flex;align-items:center;gap:10px"><input type="checkbox" class="tms-checkbox" id="sch_repeatEnabled" ${id?'disabled':''} onchange="toggleScheduleRepeatWeeks()"><span>${id?'编辑时不支持批量重排':'每周循环'}</span></div></div><div class="tms-form-item" id="sch_repeatWeeksWrap" style="display:none"><label class="tms-form-label">连续周数</label><input class="finput tms-form-control" id="sch_repeatWeeks" type="number" min="1" max="12" value="1" ${id?'disabled':''}></div></div><div class="tms-form-row"><div class="tms-form-item"><label class="tms-form-label">消课节数</label><input class="finput tms-form-control" id="sch_lc" type="number" step="0.5" value="${rv(s,'lessonCount',seed.lessonCount||1)}" onchange="refreshSchEntitlementOptions()"></div><div class="tms-form-item"><label class="tms-form-label">上课教练 *</label>${renderCourtDropdownHtml('sch_coach','上课教练',coachOptions,coachName(rv(s,'coach')||seed.coach),true,'refreshSchEntitlementOptions')}</div></div><div class="tms-form-row schedule-late-row"><div class="tms-form-item full-width">${lateSettings}</div></div><div class="tms-form-row schedule-location-row"><div class="tms-form-item schedule-location-type"><label class="tms-form-label">地点类型</label>${renderCourtDropdownHtml('sch_locationType','地点类型',[{value:'own',label:'校区内'},{value:'external',label:'校区外'}],locationType,true,'toggleScheduleLocationType')}</div><div class="schedule-location-fields" id="sch_ownLocationRow"><div class="tms-form-item"><label class="tms-form-label">上课校区 *</label>${renderCourtDropdownHtml('sch_campus','上课校区',campusOptions,locationType==='own'?(rv(s,'campus')||seed.campus):'',true,'handleScheduleCampusChange')}</div><div class="tms-form-item"><label class="tms-form-label">场地 *</label><div id="sch_venueFieldHost">${renderScheduleVenueField(locationType==='own'?(rv(s,'campus')||seed.campus):'',locationType==='own'?rv(s,'venue','1号场'):'1号场')}</div></div></div><div class="schedule-location-fields" id="sch_externalLocationRow" style="display:none"><div class="tms-form-item"><label class="tms-form-label">外部场馆 *</label><input class="finput tms-form-control" id="sch_externalVenueName" value="${esc(externalParts.name)}" placeholder="例：奥森网球中心"></div><div class="tms-form-item"><label class="tms-form-label">场地号 *</label><input class="finput tms-form-control" id="sch_externalCourtName" value="${esc(externalParts.court)}" placeholder="例：A1 / 学员自订"></div><div class="tms-form-item"><label class="tms-form-label">说明</label><input class="finput tms-form-control" id="sch_externalNotes" value="${esc(rv(s,'externalNotes'))}" placeholder="可不填"></div></div></div>`;
  const body=[hiddenFields,studentSection,lessonSection,`<div class="tms-form-row" style="margin-bottom:0"><div class="tms-form-item full-width"><label class="tms-form-label">备注</label><textarea class="finput tms-form-control" id="sch_notes">${esc(rv(s,'notes'))}</textarea></div></div>`].join('');
  const scheduleModalCanDelete=id&&(effectiveScheduleStatus(s)==='已取消'||scheduleCanDeleteMistake(s));
  const footer=`<button class="tms-btn tms-btn-default" onclick="closeModal()">取消</button>${scheduleModalCanDelete?`<button class="tms-btn tms-btn-danger" onclick="confirmDel('${s.id}','误建排课','schedule')">误建删除</button>`:''}<button class="tms-btn tms-btn-primary" id="scheduleSaveBtn" onclick="saveSchedule()">保存</button>`;
  setCourtModalFrame(id?'编辑排课':'添加排课',body,footer,'modal-wide');
  setScheduleStudentSelection(selectedStudentIds,false,!id);
  updateScheduleStudentSummary(selectedStudentIds);
  toggleScheduleRepeatWeeks();
  toggleScheduleCancelReason();
  toggleScheduleLocationType();
  ['sch_startTime','sch_endTime'].forEach(fieldId=>document.getElementById(fieldId)?.addEventListener('change',refreshScheduleTimeDerivedFields));
  refreshScheduleTimeDerivedFields();
  syncScheduleExperienceType();
  syncScheduleSmallClassType();
  toggleScheduleSettlementFields();
  refreshSchEntitlementOptions();
  refreshScheduleFieldFeeFields();
}
function toggleScheduleCancelReason(){
  const el=document.getElementById('sch_cancelReason');
  if(!el)return;
  const isCancelled=document.getElementById('sch_status')?.value==='已取消';
  const row=el.closest('.tms-form-item');
  if(row)row.style.display=isCancelled?'':'none';
  refreshSchEntitlementOptions();
}
function openCancelScheduleModal(id){
  const s=schedules.find(x=>x.id===id);
  if(!s){toast('排课不存在','warn');return;}
  const repeatTargets=scheduleRepeatCancelableTargets(s);
  const repeatBlock=s.scheduleSource==='循环排课'?`<div class="tms-form-row"><div class="tms-form-item full-width"><label class="tms-form-label">取消范围</label><div class="schedule-cancel-scope"><label class="tms-checkbox-wrap"><input type="radio" name="sch_cancel_scope" value="single" checked> <span>只取消这一节</span></label><label class="tms-checkbox-wrap"><input type="radio" name="sch_cancel_scope" value="future"> <span>取消本节及后续未上课的循环课（共 ${repeatTargets.length+1} 节）</span></label><div class="schedule-cancel-help">已经上过课的不会动。循环课如果要整组取消，这里只会处理当前这节开始的未上课记录。</div></div></div></div>`:'';
  const body=`<div class="schedule-cancel-summary"><div>${esc(fmtDt(s.startTime))}</div><div>${esc(scheduleListStudentSummary(s))}</div><div>${esc(coachName(s.coach)||'—')}</div><div>${esc(scheduleLocationText(s))}</div></div><div class="tms-form-row"><div class="tms-form-item full-width"><label class="tms-form-label">取消原因 *</label>${renderCourtDropdownHtml('sch_cancelReasonQuick','取消原因',[{value:'',label:'— 选择取消原因 —'},...SCH_CANCEL_REASONS.map(t=>({value:t,label:t}))],'',true)}</div></div>${repeatBlock}`;
  const footer=`<button class="tms-btn tms-btn-default" onclick="closeModal()">返回</button><button class="tms-btn tms-btn-danger" id="scheduleCancelBtn" onclick="confirmScheduleCancel('${s.id}')">确认取消</button>`;
  setCourtModalFrame('取消排课',body,footer,'modal-tight modal-schedule-cancel');
}
function scheduleRepeatIdentityKey(s){
  return [
    s.classId||'',
    scheduleCourseType(s)||scheduleCourseTypeLabel(s)||'',
    s.coach||'',
    s.locationType||'own',
    s.campus||'',
    s.venue||'',
    s.externalVenueName||'',
    s.externalCourtName||'',
    lessonUnitsText(s.lessonCount||0),
    (parseArr(s.expectedStudentIds).length?parseArr(s.expectedStudentIds):parseArr(s.studentIds)).slice().sort().join('|'),
    String(s.startTime||'').slice(11,16),
    String(s.endTime||'').slice(11,16)
  ].join('::');
}
function scheduleRepeatCancelableTargets(schedule){
  if(!schedule||schedule.scheduleSource!=='循环排课')return [];
  const key=scheduleRepeatIdentityKey(schedule);
  const startMs=dateMs(schedule.startTime);
  return schedules.filter(item=>{
    if(item.id===schedule.id)return false;
    if(item.scheduleSource!=='循环排课')return false;
    if(scheduleRepeatIdentityKey(item)!==key)return false;
    if(effectiveScheduleStatus(item)!=='已排课')return false;
    return dateMs(item.startTime)>=startMs;
  }).sort((a,b)=>String(a.startTime||'').localeCompare(String(b.startTime||'')));
}
async function confirmScheduleCancel(id){
  const schedule=schedules.find(item=>item.id===id);
  if(!schedule){toast('排课不存在','warn');return;}
  const reason=document.getElementById('sch_cancelReasonQuick')?.value||'';
  if(!reason){toast('请选择取消原因','warn');return;}
  const scope=document.querySelector('input[name="sch_cancel_scope"]:checked')?.value||'single';
  const targets=scope==='future'?[schedule,...scheduleRepeatCancelableTargets(schedule)].filter(item=>effectiveScheduleStatus(item)==='已排课'):[schedule];
  if(!targets.length){toast('当前没有可取消的未上课排课','warn');return;}
  const btn=document.getElementById('scheduleCancelBtn');
  if(btn){btn.disabled=true;btn.textContent='取消中…';}
  try{
    for(const item of targets){
      const result=await apiCall('PUT','/schedule/'+item.id,{status:'已取消',cancelReason:reason});
      mergeScheduleSaveResult(result,item.id);
    }
    closeModal();
    toast(scope==='future'?'循环排课已取消 ✓':'排课已取消 ✓','success');
    renderSchedule();renderClasses();renderPlans();renderCoachOps();renderMySchedule();
  }catch(e){
    if(btn){btn.disabled=false;btn.textContent='确认取消';}
    toast('取消失败：'+e.message,'error');
  }
}
function onSchClassChange(){
  const cid=document.getElementById('sch_classId').value;if(!cid){updateSchClassHint();return;}
  const cls=classes.find(c=>c.id===cid);if(!cls){updateSchClassHint();return;}
  const ids=parseArr(cls.studentIds);
  const expected=document.getElementById('sch_expectedStuIds');
  if(expected)expected.value=JSON.stringify(ids);
  setScheduleStudentSelection(ids);
  const prod=products.find(p=>p.id===cls.productId);
  if(prod?.type)setCourtDropdownValue('sch_courseType',prod.type,prod.type);
  if(prod?.experienceType)setCourtDropdownValue('sch_experienceType',prod.experienceType,prod.experienceType);
  syncScheduleExperienceType();
  if(cls.coach){const classCoach=coachName(cls.coach);setCourtDropdownValue('sch_coach',classCoach,classCoach);}
  if(cls.campus)setCourtDropdownValue('sch_campus',cls.campus,cn(cls.campus)||cls.campus);
  syncScheduleVenueField();
  setCourtDropdownValue('sch_locationType','own','校区内');
  toggleScheduleLocationType();
  updateSchClassHint();
  refreshSchEntitlementOptions();
}
function updateSchClassHint(){
  const el=document.getElementById('sch_class_hint');if(!el)return;
  const cid=document.getElementById('sch_classId').value;
  const cls=classes.find(c=>c.id===cid);
  if(!cls){el.textContent='不关联班次则不会自动消课。';return;}
  const total=parseInt(cls.totalLessons)||0,used=parseInt(cls.usedLessons)||0;
  const count=parseArr(cls.studentIds).length;
  el.textContent=`当前班次课时：已上 ${used}/${total}，剩余 ${Math.max(0,total-used)} 节。共 ${count} 名学员，可取消勾选本次缺勤学员。`;
}
function mergeScheduleSaveResult(result,editingId){
  if(result?.schedule){
    const i=schedules.findIndex(x=>x.id===(editingId||result.schedule.id));
    if(i>=0)schedules[i]=result.schedule;else schedules.unshift(result.schedule);
  }
  const changedClasses=result?.classes||[result?.class].filter(Boolean);
  changedClasses.forEach(c=>{const i=classes.findIndex(x=>x.id===c.id);if(i>=0)classes[i]=c;});
  (result?.plans||[]).forEach(p=>{const i=plans.findIndex(x=>x.id===p.id);if(i>=0)plans[i]=p;else plans.unshift(p);});
  (result?.entitlements||[]).forEach(e=>{const i=entitlements.findIndex(x=>x.id===e.id);if(i>=0)entitlements[i]=e;else entitlements.unshift(e);});
  (result?.entitlementLedger||[]).forEach(l=>{const i=entitlementLedger.findIndex(x=>x.id===l.id);if(i<0)entitlementLedger.unshift(l);});
  (result?.financialLedger||[]).forEach(l=>{const i=financialLedger.findIndex(x=>x.id===l.id);if(i>=0)financialLedger[i]=l;else financialLedger.unshift(l);});
}
function scheduleConfirmRuleMeta(scheduleSource,startTime=''){
  const days=scheduleSource==='循环排课'?5:2;
  const start=startTime?new Date(String(startTime).replace(' ','T')):null;
  if(!start||Number.isNaN(start.getTime()))return {days,label:`提前${days}天确认`,dueText:'—'};
  const due=new Date(start.getTime()-days*24*60*60*1000);
  return {days,label:`提前${days}天确认`,dueText:fmtDt(due.toISOString().slice(0,16).replace('T',' '))};
}
async function refreshScheduleLateFee(){
  if(!document.getElementById('sch_coachLateFree')?.checked)return;
  const amountInput=document.getElementById('sch_lateFieldFee');
  if(!amountInput||parseFloat(amountInput.value)>0)return;
  const date=document.getElementById('sch_date')?.value||'';
  const startTime=document.getElementById('sch_startTime')?.value||'';
  const endTime=document.getElementById('sch_endTime')?.value||'';
  if((document.getElementById('sch_locationType')?.value||'own')==='external')return;
  const campus=document.getElementById('sch_campus')?.value||'';
  if(!date||!startTime||!endTime||!campus)return;
  try{
    const quote=await apiCall('POST','/price-plans/quote',{campus,date,startTime,endTime});
    amountInput.value=quote.finalAmount||quote.systemAmount||0;
  }catch(e){}
}
let schEntitlementRefreshTimer=0;
let schEntitlementRefreshSeq=0;
const schEntitlementCache=new Map();
const schEntitlementOptionCache=new Map();
function scheduleEntitlementCacheKey(payload){
  return JSON.stringify(payload);
}
function scheduleEntitlementUnavailableReason(items=[]){
  const warnings=(items||[]).flatMap(item=>item.warnings||[]).filter(Boolean);
  if(!warnings.length)return '没有匹配当前排课条件的课包';
  if(warnings.some(text=>/剩余课时不足/.test(text)))return '课包剩余节数不够本次扣课，请减少扣课节数或先续费';
  if(warnings.some(text=>/教练不匹配/.test(text)))return '这个课包不支持当前选择的教练';
  if(warnings.some(text=>/校区不匹配/.test(text)))return '这个课包不支持当前选择的校区';
  if(warnings.some(text=>/课程类型不匹配/.test(text)))return '这个课包不支持当前课程类型';
  if(warnings.some(text=>/日期范围/.test(text)))return '当前上课日期不在课包可用日期内';
  if(warnings.some(text=>/时间段/.test(text)))return '当前上课时间不在课包可用时间段内';
  if(warnings.some(text=>/人数不匹配/.test(text)))return '当前上课人数不符合课包限制';
  return '当前排课条件下没有可扣的课包';
}
function applySchEntitlementOptions(res,preferredId=''){
  const sel=document.getElementById('sch_entitlement');
  const hint=document.getElementById('sch_ent_hint');
  if(!sel||!hint)return;
  const options=(res.options||[]).filter(x=>x.selectable);
  schEntitlementOptionCache.clear();
  options.forEach(option=>{if(option.entitlementId)schEntitlementOptionCache.set(option.entitlementId,option);});
  const maxRemain=options.reduce((best,item)=>(Number(item.remainingLessons)||0)>(Number(best?.remainingLessons)||0)?item:best,null);
  const selected=options.find(x=>preferredId&&x.entitlementId===preferredId)||maxRemain;
  setScheduleEntitlementDropdown(options,selected?.entitlementId||'',options.length?'自动匹配可用课包':'无可用课包');
  const courseType=scheduleEntitlementCourseType(selected);
  if(courseType){
    setCourtDropdownValue('sch_courseType',courseType,courseType);
    const experienceType=scheduleEntitlementExperienceType(selected);
    if(experienceType)setCourtDropdownValue('sch_experienceType',experienceType,experienceType);
    const smallClassType=courseType==='小班课'?scheduleEntitlementSmallClassType(selected):'';
    if(smallClassType)setCourtDropdownValue('sch_smallClassType',smallClassType,scheduleSmallClassTypeLabel(smallClassType));
    syncScheduleExperienceType();
    syncScheduleSmallClassType();
    setScheduleCourseTypeReadonly(true);
    setScheduleSmallClassTypeReadonly(!!smallClassType);
  }else{
    syncScheduleExperienceType();
    syncScheduleSmallClassType();
    setScheduleCourseTypeReadonly(false);
    setScheduleSmallClassTypeReadonly(false);
  }
  hint.textContent=selected?`已自动匹配：${standardPackageLabel(selected,true)||selected.packageName}，剩余 ${selected.remainingLessons}/${selected.totalLessons}，${packageTimeBandShortLabel(selected.timeBand||'全天')}${selected.requiresFieldFee?'，需补差价/场地费':''}，到期 ${selected.validUntil||'-'}`:scheduleEntitlementUnavailableReason(res.options||[]);
  refreshScheduleFieldFeeFields();
}
function scheduleSelectedEntitlementOption(){
  const id=document.getElementById('sch_entitlement')?.value||'';
  if(!id)return null;
  return schEntitlementOptionCache.get(id)||entitlements.find(x=>x.id===id)||null;
}
function scheduleNeedsFieldFeeUi(){
  if(currentScheduleSettlementType()!=='package')return false;
  return !!scheduleSelectedEntitlementOption()?.requiresFieldFee;
}
function refreshScheduleFieldFeeFields(){
  const wrap=document.getElementById('sch_fieldFeeFields');
  if(!wrap)return;
  const needed=scheduleNeedsFieldFeeUi();
  wrap.style.display=needed?'flex':'none';
  const enabled=document.getElementById('sch_fieldFeeEnabled');
  if(!needed&&enabled)enabled.checked=false;
  const active=needed&&!!enabled?.checked;
  ['sch_fieldFeeAmount','sch_fieldFeeNote'].forEach(id=>{
    const el=document.getElementById(id);
    if(el)el.disabled=!active;
  });
  const dropdown=document.getElementById('sch_fieldFeePayMethod_dropdown');
  if(dropdown){dropdown.style.pointerEvents=active?'auto':'none';dropdown.style.opacity=active?'':'0.65';}
}
function scheduleEntitlementCourseType(option){
  if(!option)return '';
  const local=entitlements.find(e=>e.id===option.entitlementId||e.id===option.id);
  return normalizeCourseType(option.courseType||local?.courseType||local?.type);
}
function scheduleEntitlementExperienceType(option){
  if(!option)return '';
  const local=entitlements.find(e=>e.id===option.entitlementId||e.id===option.id);
  return normalizeExperienceType(option.experienceType||local?.experienceType||option.packageName||local?.packageName,'');
}
function scheduleSmallClassTypeLabel(value){
  return ({single:'单次',bootcamp:'训练营',dropin:'随到随学'})[value]||value||'';
}
function scheduleEntitlementSmallClassType(option){
  if(!option)return '';
  const local=entitlements.find(e=>e.id===option.entitlementId||e.id===option.id);
  const raw=String(option.smallClassType||option.packageSubType||option.subType||local?.smallClassType||local?.packageSubType||local?.subType||'').trim();
  if(raw)return raw;
  const text=String(option.packageName||local?.packageName||'');
  if(/训练营/.test(text))return 'bootcamp';
  if(/随到随学/.test(text))return 'dropin';
  if(/小班/.test(text))return 'single';
  return '';
}
function setScheduleCourseTypeReadonly(readonly){
  const dropdown=document.getElementById('sch_courseType_dropdown');
  if(!dropdown)return;
  dropdown.style.pointerEvents=readonly?'none':'auto';
  dropdown.style.opacity=readonly?'.72':'';
  dropdown.classList.toggle('tms-dropdown-readonly',!!readonly);
}
function setScheduleSmallClassTypeReadonly(readonly){
  const dropdown=document.getElementById('sch_smallClassType_dropdown');
  if(!dropdown)return;
  dropdown.style.pointerEvents=readonly?'none':'auto';
  dropdown.style.opacity=readonly?'.72':'';
  dropdown.classList.toggle('tms-dropdown-readonly',!!readonly);
}
function handleScheduleEntitlementChange(){
  const sel=document.getElementById('sch_entitlement');
  if(!sel)return;
  sel.dataset.keep=sel.value||'';
  const courseType=scheduleEntitlementCourseType({entitlementId:sel.value});
  if(courseType){
    setCourtDropdownValue('sch_courseType',courseType,courseType);
    const experienceType=scheduleEntitlementExperienceType({entitlementId:sel.value});
    if(experienceType)setCourtDropdownValue('sch_experienceType',experienceType,experienceType);
    const smallClassType=courseType==='小班课'?scheduleEntitlementSmallClassType({entitlementId:sel.value}):'';
    if(smallClassType)setCourtDropdownValue('sch_smallClassType',smallClassType,scheduleSmallClassTypeLabel(smallClassType));
    syncScheduleExperienceType();
    syncScheduleSmallClassType();
    setScheduleCourseTypeReadonly(true);
    setScheduleSmallClassTypeReadonly(!!smallClassType);
  }else{
    syncScheduleExperienceType();
    syncScheduleSmallClassType();
    setScheduleCourseTypeReadonly(false);
    setScheduleSmallClassTypeReadonly(false);
  }
}
function readSchEntitlementPayload(ids,startRaw,endRaw){
  const courseType=normalizeCourseType(document.getElementById('sch_courseType')?.value||'');
  const coachValue=document.getElementById('sch_coach')?.value||'';
  return {
    studentIds:ids,
    expectedStudentIds:parseArr(document.getElementById('sch_expectedStuIds')?.value||'[]'),
    courseType,
    experienceType:courseType==='体验课'?normalizeExperienceType(document.getElementById('sch_experienceType')?.value):'',
    smallClassType:courseType==='小班课'?(document.getElementById('sch_smallClassType')?.value||'single'):'',
    coach:coachValue,
    coachId:coachIdValue(coachValue),
    campus:document.getElementById('sch_campus')?.value||'',
    startTime:startRaw,
    endTime:endRaw,
    lessonCount:parseFloat(document.getElementById('sch_lc')?.value)||1,
    status:document.getElementById('sch_status')?.value||'已排课',
    scheduleId:editId||''
  };
}
function trimSchEntitlementCache(limit=24){
  while(schEntitlementCache.size>limit){
    const firstKey=schEntitlementCache.keys().next().value;
    schEntitlementCache.delete(firstKey);
  }
}
function coachLateSettlementRows(month){
  return schedules.filter(s=>s.coachLateFree&&String(s.startTime||'').slice(0,7)===(month||today().slice(0,7))).sort((a,b)=>String(a.startTime||'').localeCompare(String(b.startTime||'')));
}
function openCoachLateSettlementModal(month=today().slice(0,7)){
  const rows=coachLateSettlementRows(month);
  const total=rows.reduce((sum,s)=>sum+(parseFloat(s.coachLateFieldFeeAmount)||0),0);
  const lateMinutes=rows.reduce((sum,s)=>sum+(parseInt(s.lateMinutes)||0),0);
  const body=`<div class="late-settlement-head"><div class="tms-form-item"><label class="tms-form-label">月份</label><input class="finput tms-form-control" id="coachLateMonth" type="month" value="${esc(month)}" onchange="openCoachLateSettlementModal(this.value)"></div></div><div class="tms-readonly-panel late-settlement-summary"><div class="late-settlement-card"><div class="late-settlement-label">迟到次数</div><div class="late-settlement-value">${rows.length}<span> 次</span></div></div><div class="late-settlement-card"><div class="late-settlement-label">迟到分钟</div><div class="late-settlement-value">${lateMinutes}<span> 分钟</span></div></div><div class="late-settlement-card"><div class="late-settlement-label">承担合计</div><div class="late-settlement-value">¥${fmt(total)}</div></div></div><div class="tms-audit-note late-settlement-note">只统计已标记「教练迟到免费」的排课，用于月底让教练承担场地费。</div><div class="tms-table-card late-settlement-table"><div class="tms-table-wrapper"><table class="tms-table"><thead><tr><th style="width:110px;padding-left:20px">日期</th><th style="width:120px">时间</th><th style="width:110px">教练</th><th style="width:130px">学员</th><th>校区/场地</th><th style="width:90px">迟到</th><th style="width:110px;text-align:right;padding-right:20px">承担金额</th></tr></thead><tbody>${rows.map(s=>`<tr><td style="padding-left:20px">${esc(String(s.startTime||'').slice(0,10))}</td><td>${esc(String(s.startTime||'').slice(11,16))}-${esc(String(s.endTime||'').slice(11,16))}</td><td>${esc(coachName(s.coach)||'-')}</td><td>${esc(s.studentName||scheduleStudentSummary(s)||'-')}</td><td>${esc(scheduleLocationText(s))}</td><td>${parseInt(s.lateMinutes)||0} 分钟</td><td style="text-align:right;padding-right:20px">¥${fmt(parseFloat(s.coachLateFieldFeeAmount)||0)}</td></tr>`).join('')||'<tr><td colspan="7"><div class="late-settlement-empty">本月暂无迟到记录</div></td></tr>'}</tbody></table></div></div>`;
  setCourtModalFrame('迟到月结',body,'<button class="tms-btn tms-btn-primary" onclick="closeModal()">关闭</button>','modal-wide late-settlement-modal');
}
function buildRepeatScheduleSeeds(baseData){
  const enabled=!!document.getElementById('sch_repeatEnabled')?.checked;
  const weeks=Math.max(1,parseInt(document.getElementById('sch_repeatWeeks')?.value)||1);
  if(!enabled)return [baseData];
  const makeShift=(raw,offset)=>{
    const dt=new Date(String(raw||'').replace(' ','T'));
    if(Number.isNaN(dt.getTime()))return raw;
    dt.setDate(dt.getDate()+offset*7);
    return dt.toISOString().slice(0,16).replace('T',' ');
  };
  return Array.from({length:weeks},(_,idx)=>({
    ...baseData,
    startTime:makeShift(baseData.startTime,idx),
    endTime:makeShift(baseData.endTime,idx),
    expectedStudentIds:baseData.expectedStudentIds,
    absentStudentIds:baseData.absentStudentIds,
    smallClassType:baseData.smallClassType,
    scheduleSource:'循环排课'
  }));
}
async function refreshSchEntitlementOptions(){
  const sel=document.getElementById('sch_entitlement'),hint=document.getElementById('sch_ent_hint');
  if(!sel||!hint)return;
  if(currentScheduleSettlementType()!=='package'){
    setScheduleEntitlementDropdown([], '', currentScheduleSettlementType()==='direct'?'直接收款，不扣课包':'赠送/免费，不扣课包');
    hint.textContent='';
    setScheduleCourseTypeReadonly(false);
    setScheduleSmallClassTypeReadonly(false);
    return;
  }
  const ids=parseArr(document.getElementById('sch_stuIds')?.value||'[]');
  const startRaw=scheduleComposeDateTime('sch_date','sch_startTime');
  const endRaw=scheduleComposeDateTime('sch_date','sch_endTime');
  if(!ids.length||!startRaw||!endRaw){setScheduleEntitlementDropdown([], '', '自动匹配可用课包');hint.textContent='';setScheduleCourseTypeReadonly(false);setScheduleSmallClassTypeReadonly(false);return;}
  if(ids.length>1){setScheduleEntitlementDropdown([], '', '系统按参与学员自动扣课');hint.textContent='多人小班会按到场学员分别扣各自可用课包；训练营第 1 次请假免费，第 2 次起扣课。';setScheduleCourseTypeReadonly(false);setScheduleSmallClassTypeReadonly(false);return;}
  const keepValue=sel.dataset.keep||sel.value||'';
  const editId=window.editScheduleId||'';
  const payload={
    ...readSchEntitlementPayload(ids,startRaw,endRaw),
    lessonCount:parseFloat(document.getElementById('sch_lc')?.value)||1,
    scheduleId:editId||''
  };
  const cacheKey=scheduleEntitlementCacheKey(payload);
  const cached=schEntitlementCache.get(cacheKey);
  const now=Date.now();
  if(cached&&(now-cached.at)<30000){
    applySchEntitlementOptions(cached.value,keepValue);
    return;
  }
  clearTimeout(schEntitlementRefreshTimer);
  const refreshSeq=++schEntitlementRefreshSeq;
  setScheduleEntitlementDropdown([], '', '正在重新计算可用课包');
  hint.textContent='正在匹配可用课包…';
  schEntitlementRefreshTimer=setTimeout(async ()=>{
    try{
      const res=await apiCall('POST','/entitlements/recommend',payload);
      schEntitlementCache.set(cacheKey,{at:Date.now(),value:res});
      trimSchEntitlementCache();
      if(refreshSeq!==schEntitlementRefreshSeq)return;
      applySchEntitlementOptions(res,keepValue);
    }catch(e){
      if(refreshSeq!==schEntitlementRefreshSeq)return;
      setScheduleEntitlementDropdown([], '', '无可用课包');
      setScheduleCourseTypeReadonly(false);
      setScheduleSmallClassTypeReadonly(false);
      hint.textContent=e.message;
    }
  },300);
}
function scheduleSaveConfirmText(data,selectedEntitlement){
  const absent=parseArr(data.absentStudentIds);
  const packageText=data.settlementType==='direct'?`${data.payMethod} ¥${fmt(data.paidAmount||0)}`:data.settlementType==='gift'?'赠送/免费，收入 ¥0':(data.studentIds.length>1?'系统按参与学员自动扣课':(selectedEntitlement?(standardPackageLabel(selectedEntitlement,true)||selectedEntitlement.packageName):'未选择可用课包，本次不会扣减课包余额'));
  const chargeText=data.coachLateFree?'本节不扣课':`${data.lessonCount||0} 节`;
  const timeText=()=>{
    const start=fmtDt(data.startTime),end=fmtDt(data.endTime);
    const day=start.slice(0,10),startClock=start.slice(11),endClock=end.slice(11);
    return day&&startClock&&endClock?`${day} · ${startClock} - ${endClock}`:`${start} - ${end}`;
  };
  const row=(label,value,extra='')=>`<div class="schedule-confirm-row ${extra}"><span class="schedule-confirm-label">${esc(label)}</span><span class="schedule-confirm-value">${esc(value||'—')}</span></div>`;
  return `<div class="schedule-confirm-card">
    ${row('时间',timeText())}
    ${row('学员',scheduleStudentTextByIds(data.studentIds)||'—')}
    ${absent.length?row('本次缺勤',scheduleStudentTextByIds(absent),'schedule-confirm-warn'):''}
    ${row('教练',data.coach||'—')}
    ${row('场地',scheduleLocationText(data))}
    ${row('课程',courseTypeDisplayLabel(data)||'—')}
    ${row('结算方式',`${scheduleSettlementTypeLabel(data.settlementType)} · ${packageText}`)}
    <div class="schedule-confirm-charge"><span class="schedule-confirm-label">本次扣课</span><span class="schedule-confirm-charge-value">${esc(chargeText)}</span></div>
    ${data.requiresFieldFee?row('补差价',data.fieldFeeAmount>0?`${data.fieldFeePayMethod} ¥${fmt(data.fieldFeeAmount)}`:(data.fieldFeeReason||'需补差价/场地费'),'schedule-confirm-warn'):''}
    ${data.coachLateFree?row('迟到免费',`本节不扣学员课时，教练承担场地费 ¥${fmt(data.coachLateFieldFeeAmount||0)}`,'schedule-confirm-warn'):''}
    ${data.status==='已取消'?row('取消原因',data.cancelReason||'未填写','schedule-confirm-warn'):''}
  </div>`;
}
async function saveSchedule(){
  const startTime=scheduleComposeDateTime('sch_date','sch_startTime');
  const endTime=scheduleComposeDateTime('sch_date','sch_endTime');
  const status=document.getElementById('sch_status')?.value||'已排课';
  if(!startTime){toast('请选择上课时间','warn');return;}
  if(status!=='已取消'&&!endTime){toast('请选择下课时间，系统需要用它校验冲突','warn');return;}
  if(endTime&&endTime<=startTime){toast('下课时间不能早于上课时间','warn');return;}
  if(endTime&&startTime.slice(0,10)!==endTime.slice(0,10)){toast('上课时间不能跨天','warn');return;}
  const classId=document.getElementById('sch_classId')?.value||'';
  const lc=parseFloat(document.getElementById('sch_lc').value)||1;
  const studentIds=parseArr(document.getElementById('sch_stuIds').value);
  const expectedStudentIds=parseArr(document.getElementById('sch_expectedStuIds')?.value||'[]');
  const expectedBase=expectedStudentIds.length?expectedStudentIds:studentIds;
  const absentStudentIds=expectedBase.filter(id=>!studentIds.includes(id));
  const selectedEntitlementId=document.getElementById('sch_entitlement').value;
  const settlementType=currentScheduleSettlementType();
  if(!studentIds.length){toast('请先从学员库中选择学员','warn');return;}
  const coach=document.getElementById('sch_coach').value;
  const coachId=coachIdValue(coach);
  const locationType=document.getElementById('sch_locationType')?.value||'own';
  let campusValue=document.getElementById('sch_campus')?.value||'';
  let venue=document.getElementById('sch_venue')?.value.trim()||'';
  const externalVenueName=document.getElementById('sch_externalVenueName')?.value.trim()||'';
  const externalCourtName=document.getElementById('sch_externalCourtName')?.value.trim()||'';
  const externalNotes=document.getElementById('sch_externalNotes')?.value.trim()||'';
  if(locationType==='external'){
    campusValue='__external__';
    venue=[externalVenueName,externalCourtName].filter(Boolean).join(' · ');
  }
  if(!coach){toast('请选择教练','warn');return;}
  if(locationType==='own'&&!campusValue){toast('请选择校区','warn');return;}
  if(locationType==='external'&&!externalVenueName){toast('请填写外部场馆','warn');return;}
  if(locationType==='external'&&!externalCourtName){toast('请填写外部场地号或说明','warn');return;}
  if(!venue){toast('请选择场地','warn');return;}
  const selectedEntitlement=entitlements.find(x=>x.id===selectedEntitlementId);
  const paidAmount=settlementType==='direct'?parseFloat(document.getElementById('sch_paidAmount')?.value||'0'):0;
  const payMethod=settlementType==='direct'?(document.getElementById('sch_payMethod')?.value||''):(settlementType==='gift'?'赠送':'');
  if(settlementType==='direct'&&!payMethod){toast('请选择支付方式','warn');return;}
  if(settlementType==='direct'&&!(paidAmount>0)){toast('请输入支付金额','warn');return;}
  const fieldFeeRequired=settlementType==='package'&&!!selectedEntitlement?.requiresFieldFee;
  const fieldFeeEnabled=fieldFeeRequired&&!!document.getElementById('sch_fieldFeeEnabled')?.checked;
  const fieldFeeAmount=fieldFeeEnabled?parseFloat(document.getElementById('sch_fieldFeeAmount')?.value||'0'):0;
  const fieldFeePayMethod=fieldFeeEnabled?(document.getElementById('sch_fieldFeePayMethod')?.value||''):'';
  const fieldFeeNote=fieldFeeEnabled?(document.getElementById('sch_fieldFeeNote')?.value.trim()||'非黄金课包排入黄金时段补差'):'';
  if(fieldFeeEnabled&&!fieldFeePayMethod){toast('请选择补差支付方式','warn');return;}
  if(fieldFeeEnabled&&!(fieldFeeAmount>0)){toast('请输入补差金额','warn');return;}
  const cancelReason=document.getElementById('sch_cancelReason')?.value||'';
  if(status==='已取消'&&!cancelReason){toast('请选择取消原因','warn');return;}
  const selectedCourseType=normalizeCourseType(document.getElementById('sch_courseType').value);
  const selectedExperienceType=selectedCourseType==='体验课'?normalizeExperienceType(document.getElementById('sch_experienceType')?.value):'';
  const selectedSmallClassType=selectedCourseType==='小班课'?(document.getElementById('sch_smallClassType')?.value||'single'):'';
  if(selectedCourseType==='小班课'){
    if(studentIds.length<2){toast('小班课至少 2 人到场才能开课','warn');return;}
    if(studentIds.length>4){toast('小班课最多选择 4 名学员','warn');return;}
    if(selectedSmallClassType==='bootcamp'&&expectedBase.length&&expectedBase.length!==4){toast('训练营固定 4 人','warn');return;}
  }
  const coachLateFree=!!document.getElementById('sch_coachLateFree')?.checked;
  const lateReason=document.getElementById('sch_lateReason')?.value.trim()||'';
  if(coachLateFree&&!lateReason){toast('请填写迟到原因','warn');return;}
  const data={startTime,endTime,classId,studentIds,expectedStudentIds:expectedBase,absentStudentIds,studentName:scheduleStudentTextByIds(studentIds).replace(/（[^）]*）/g,''),courseType:selectedCourseType,experienceType:selectedExperienceType,smallClassType:selectedSmallClassType,courseTypeLevel2:courseTypeLevel2Label(selectedCourseType,selectedExperienceType,selectedSmallClassType),standardCourseType:standardCourseTypeLabel(selectedCourseType,selectedExperienceType,selectedSmallClassType),isTrial:selectedCourseType==='体验课',coach,coachId,locationType,venue,campus:campusKey(campusValue),externalVenueName:locationType==='external'?externalVenueName:'',externalCourtName:locationType==='external'?externalCourtName:'',externalNotes:locationType==='external'?externalNotes:'',lessonCount:lc,status,settlementType,payMethod,paidAmount:settlementType==='direct'?paidAmount:0,entitlementId:settlementType==='package'&&studentIds.length===1?selectedEntitlementId:'',packageName:settlementType==='package'&&studentIds.length===1?(selectedEntitlement?(standardPackageLabel(selectedEntitlement,true)||selectedEntitlement.packageName||''):''):'',purchaseId:settlementType==='package'&&studentIds.length===1?(selectedEntitlement?.purchaseId||''):'',timeBand:settlementType==='package'&&studentIds.length===1?(selectedEntitlement?.timeBand||''):'',requiresFieldFee:fieldFeeRequired,fieldFeeReason:settlementType==='package'?(selectedEntitlement?.fieldFeeReason||''):'',fieldFeeAmount:fieldFeeEnabled?fieldFeeAmount:0,fieldFeePayMethod,fieldFeeNote,cancelReason,notifyStatus:'',confirmStatus:'',scheduleSource:document.getElementById('sch_scheduleSource')?.value||'排课表',coachLateFree,lateMinutes:parseInt(document.getElementById('sch_lateMinutes')?.value)||0,lateReason,coachLateFieldFeeAmount:parseFloat(document.getElementById('sch_lateFieldFee')?.value)||0,coachLateHandledAt:coachLateFree?new Date().toISOString():'',coachLateHandledBy:coachLateFree?(currentUser?.name||''):'',notes:document.getElementById('sch_notes').value.trim()};
  if(!await appConfirm(scheduleSaveConfirmText(data,selectedEntitlement),{title:'确认排课',confirmText:'确认保存',html:true,hideIcon:true,boxClass:'schedule-confirm-box'}))return;
  const btn=document.getElementById('scheduleSaveBtn');if(btn){btn.disabled=true;btn.textContent='保存中…';}
  let result;
  try{
    if(editId){
      result=await apiCall('PUT','/schedule/'+editId,data);
      mergeScheduleSaveResult(result,editId);
    }else{
      const seeds=buildRepeatScheduleSeeds(data);
      let warnings=[];
      for(let i=0;i<seeds.length;i++){
        const currentSeed=seeds[i];
        const currentResult=await apiCall('POST','/schedule',currentSeed);
        mergeScheduleSaveResult(currentResult,'');
        warnings=warnings.concat(currentResult?.warnings||[]);
        if(i===0)result=currentResult;
      }
      if(result)result.warnings=warnings;
    }
  }catch(e){toast('保存失败：'+scheduleSaveErrorText(e),'error');resetScheduleSaveButton();return;}
  noteScheduleLocalMutation();
  closeModal();toast(editId?'修改成功 ✓':'排课成功 ✓','success');
  if(result?.warnings?.length)toast(result.warnings.join('；'),'warn');
  renderAfterScheduleMutation();
}
function renderAfterScheduleMutation(){
  try{renderSchedule();renderClasses();renderPlans();renderCoachOps();renderMySchedule();}catch(err){
    console.error('schedule post-save render failed:',err);
    toast('排课已保存，页面刷新异常，请手动刷新页面','warn');
  }
}
function resetScheduleSaveButton(){
  const btn=document.getElementById('scheduleSaveBtn');
  if(btn){btn.disabled=false;btn.textContent='保存';}
}
function scheduleRemainingLessons(s){
  const cls=s?.classId?classes.find(c=>c.id===s.classId):null;
  if(!cls)return '';
  return Math.max(0,(parseInt(cls.totalLessons)||0)-(parseInt(cls.usedLessons)||0));
}
function scheduleSaveErrorText(err){
  const raw=String(err?.message||err||'').replace(/\s*\[[^\]]+\]$/,'').trim();
  if(!raw)return '系统有点忙，请稍后再试';
  const exactMap={
    '请选择上课时间':'请选择上课时间，再保存',
    '请选择下课时间，系统需要用它校验冲突':'请选择下课时间，再保存',
    '上课时间不能跨天':'上课时间和下课时间不能跨天，请改成同一天',
    '下课时间不能早于上课时间':'下课时间要晚于上课时间，请重新选择',
    '学员此时间已有课程':'这个时间学员已经有课了，请换时间或换学员',
    '课程类型不匹配':'课程类型和课包不一致，请换课包或改课程类型',
    '体验课类型不匹配':'体验课类型不一致，请重新选择体验课类型',
    '课包可用校区不匹配':'这个校区不在课包可用范围内，请换校区或换课包',
    '课包可用教练不匹配':'这个教练不在课包可用范围内，请换教练或换课包',
    '课包可上课教练不匹配':'这个教练不在课包可用范围内，请换教练或换课包',
    '不在课包可用日期范围':'这节课不在课包可用日期内，请换时间或换课包',
    '不在课包可用时间段':'这节课不在课包可用时段内，请换时间或换课包',
    '课包适用人数不匹配':'这节课的人数和课包要求不一致，请重新选择课包',
    '小班课类型不匹配':'小班课类型和课包不一致，请重新选择课包',
    '课包余额不存在':'这个课包不可用，请重新选择课包',
    '课包余额不可用':'这个课包不可用，请重新选择课包',
    '课包剩余课时不足':'这个课包剩余课时不够，请换课包或减少课时',
    '关联班次不存在':'关联班次不存在，请重新选择班次',
    '该班次已取消，不能继续排课':'这个班次已经取消了，不能继续排课',
    '该班次已结课，不能继续排课':'这个班次已经结课了，不能继续排课',
    '小班课至少 2 人到场才能开课':'小班课至少要 2 人到场才能开课',
    '小班课最多选择 4 名学员':'小班课最多只能选 4 名学员',
    '训练营固定 4 人':'训练营必须固定 4 人',
    '请填写迟到原因':'请先填写迟到原因再保存',
    '请先从学员库中选择学员':'请先从学员库中选择学员',
    '请选择教练':'请先选择教练再保存',
    '请选择校区':'请先选择校区再保存',
    '请选择场地':'请先选择场地再保存',
    '请选择取消原因':'请先选择取消原因再保存'
  };
  if(exactMap[raw])return exactMap[raw];
  if(/^教练「.+」此时间已有课程$/.test(raw))return '这个时间教练已经有课了，请换教练或改时间';
  if(/^场地「.+」此时间已被占用$/.test(raw))return '这个时间场地已经被占用，请换场地或改时间';
  if(/^场地「.+」\d{2}:\d{2}-\d{2}:\d{2} 已被订场用户「.+」订场$/.test(raw))return '这个时间场地已经被占用，请换场地或改时间';
  return raw;
}
const FEEDBACK_POSTER_TEMPLATES={
  blueGreenDiagonal:{name:'蓝绿对角',type:'diagonalSplit',bg1:'#1F4287',bg2:'#278EA5',ink:'#FFFFFF',muted:'rgba(255,255,255,0.7)',accent:'#BCE84A',soft:'rgba(255,255,255,0.08)',cardTitle:'#BCE84A',highlight:'#BCE84A',nameColor:'#FFFFFF',subColor:'rgba(255,255,255,0.7)'},
  minimalDarkGreen:{name:'极简墨绿',type:'cleanSilhouette',bg1:'#F4F6F8',bg2:'#F4F6F8',ink:'#143D30',muted:'#76948A',accent:'#8DC63F',soft:'#FFFFFF',cardTitle:'#143D30',highlight:'#8DC63F',nameColor:'#143D30',subColor:'#76948A'},
  retroCourt:{name:'对角球场',type:'split',bg1:'#1E3D33',bg2:'#B35432',ink:'#1E3D33',muted:'#6D827A',accent:'#B35432',soft:'#F9F8F6',cardTitle:'#B35432',highlight:'#B35432',nameColor:'#F9F8F6',subColor:'rgba(249,248,246,0.7)'},
  blueprintBlue:{name:'线框蓝图',type:'wireframe',bg1:'#12355B',bg2:'#0D2744',ink:'#FFFFFF',muted:'rgba(255,255,255,0.6)',accent:'#D4F02E',soft:'rgba(0,0,0,0.3)',cardTitle:'#D4F02E',highlight:'#D4F02E',nameColor:'#FFFFFF',subColor:'rgba(255,255,255,0.6)'},
  minimalRacket:{name:'极简白框',type:'minimal',bg1:'#2F74B4',bg2:'#2F74B4',ink:'#12355B',muted:'#82A9CE',accent:'#D4F02E',soft:'rgba(255,255,255,0.95)',cardTitle:'#2F74B4',highlight:'#2F74B4',nameColor:'#FFFFFF',subColor:'#82A9CE'},
  activeGreen:{name:'活力绿(缝线)',type:'sport',bg1:'#064E3B',bg2:'#022C22',ink:'#F8FAFC',muted:'#6EE7B7',accent:'#10B981',soft:'rgba(255,255,255,0.08)',cardTitle:'#10B981',highlight:'#10B981',nameColor:'#F8FAFC',subColor:'#6EE7B7'}
};
let feedbackPosterState=null;
function feedbackPosterData(schedule,feedback){
  return {
    studentName:scheduleStudentSummary(schedule)||feedback?.studentName||'学员',
    date:String(feedback?.startTime||schedule?.startTime||feedback?.createdAt||'').slice(0,10)||today(),
    coach:feedback?.coach||schedule?.coach||'教练',
    practicedToday:feedback?.practicedToday||feedback?.template?.focus||'—',
    knowledgePoint:feedback?.knowledgePoint||'—',
    nextTraining:feedback?.nextTraining||feedback?.nextAdvice||'—'
  };
}
function posterRoundRect(ctx,x,y,w,h,r){
  ctx.beginPath();ctx.moveTo(x+r,y);ctx.lineTo(x+w-r,y);ctx.quadraticCurveTo(x+w,y,x+w,y+r);ctx.lineTo(x+w,y+h-r);ctx.quadraticCurveTo(x+w,y+h,x+w-r,y+h);ctx.lineTo(x+r,y+h);ctx.quadraticCurveTo(x,y+h,x,y+h-r);ctx.lineTo(x,y+r);ctx.quadraticCurveTo(x,y,x+r,y);ctx.closePath();
}
function posterDrawSpacedText(ctx,text,x,y,spacing){
  let currentX=x;
  Array.from(text||'').forEach(ch=>{ctx.fillText(ch,currentX,y);currentX+=ctx.measureText(ch).width+spacing;});
}
function posterDisplayDate(dateText){
  const raw=String(dateText||'').trim();
  const m=raw.match(/^(\d{4})-(\d{1,2})-(\d{1,2})/);
  if(!m)return raw||today();
  return `${m[1]}年${parseInt(m[2],10)}月${parseInt(m[3],10)}日`;
}
function posterEscapeRegExp(text){
  return String(text).replace(/[.*+?^${}()|[\]\\]/g,'\\$&');
}
function posterPushAutoGroups(groups,text){
  if(!text)return;
  const keywords=['回合对打','连续对打','10 多拍','10多拍','非常了不起','稳定','进步','节奏','重心','脚步','发力','引拍','击球点'];
  const pattern=new RegExp(`(${keywords.map(posterEscapeRegExp).join('|')})`,'g');
  String(text).split(pattern).filter(Boolean).forEach(part=>groups.push({text:part,highlight:keywords.includes(part)}));
}
function posterTextGroups(text){
  const raw=String(text||'—');
  const groups=[];
  let i=0;
  while(i<raw.length){
    if(raw[i]==='【'){
      const end=raw.indexOf('】',i+1);
      if(end>-1){groups.push({text:raw.slice(i+1,end),highlight:true});i=end+1;continue;}
    }
    if(raw[i]==='*'){
      const end=raw.indexOf('*',i+1);
      if(end>-1){groups.push({text:raw.slice(i+1,end),highlight:true});i=end+1;continue;}
    }
    let next=raw.length;
    const bracket=raw.indexOf('【',i+1);
    const star=raw.indexOf('*',i+1);
    if(bracket>-1)next=Math.min(next,bracket);
    if(star>-1)next=Math.min(next,star);
    posterPushAutoGroups(groups,raw.slice(i,next));
    i=next;
  }
  return groups.length?groups:[{text:'—',highlight:false}];
}
function posterContentFont(ctx,isHighlight){
  ctx.font=`${isHighlight?'600':'400'} 30px -apple-system,BlinkMacSystemFont,"PingFang SC","Microsoft YaHei",sans-serif`;
}
function posterTextLines(ctx,text,maxWidth,maxLines=Number.MAX_SAFE_INTEGER){
  const lines=[[]];
  posterTextGroups(text).forEach(group=>{
    posterContentFont(ctx,group.highlight);
    Array.from(group.text||'').forEach(ch=>{
      if(ch==='\n'){lines.push([]);return;}
      const width=ctx.measureText(ch).width;
      let line=lines[lines.length-1];
      const lineWidth=line.reduce((sum,item)=>sum+item.width,0);
      if(line.length&&lineWidth+width>maxWidth){lines.push([]);line=lines[lines.length-1];}
      line.push({ch,highlight:group.highlight,width});
    });
  });
  let kept=lines.filter(line=>line.length);
  if(!kept.length)kept=[[{ch:'—',highlight:false,width:ctx.measureText('—').width}]];
  if(kept.length>maxLines){
    kept=kept.slice(0,maxLines);
    const last=kept[kept.length-1];
    posterContentFont(ctx,false);
    const dotsWidth=ctx.measureText('…').width;
    while(last.length&&last.reduce((sum,item)=>sum+item.width,0)+dotsWidth>maxWidth)last.pop();
    while(last.length&&/[，。；、\s]/.test(last[last.length-1].ch))last.pop();
    last.push({ch:'…',highlight:false,width:dotsWidth});
  }
  return kept.map(line=>{
    const groups=[];
    line.forEach(item=>{
      const last=groups[groups.length-1];
      if(last&&last.highlight===item.highlight)last.text+=item.ch;
      else groups.push({text:item.ch,highlight:item.highlight});
    });
    return groups;
  });
}
function posterBlockHeight(lineCount){
  const paddingTop=32,paddingBottom=54,titleSpace=52,lineHeight=48;
  const safeCount=Math.max(1,Number(lineCount)||1);
  return paddingTop+titleSpace+(safeCount-1)*lineHeight+paddingBottom;
}
function measureFeedbackPosterLayout(ctx,data){
  const contentWidth=570;
  const gap=28;
  const startY=320;
  const lineCaps={practiced:12,knowledge:14,nextTraining:10};
  const practicedLines=posterTextLines(ctx,data.practicedToday,contentWidth,lineCaps.practiced);
  const practicedHeight=posterBlockHeight(practicedLines.length);
  const knowledgeY=startY+practicedHeight+gap;
  const knowledgeLines=posterTextLines(ctx,data.knowledgePoint,contentWidth,lineCaps.knowledge);
  const knowledgeHeight=posterBlockHeight(knowledgeLines.length);
  const nextTrainingY=knowledgeY+knowledgeHeight+gap;
  const nextTrainingLines=posterTextLines(ctx,data.nextTraining,contentWidth,lineCaps.nextTraining);
  const nextTrainingHeight=posterBlockHeight(nextTrainingLines.length);
  const footerTop=nextTrainingY+nextTrainingHeight+92;
  const footerBrandY=footerTop+56;
  const footerTaglineY=footerBrandY+35;
  const footerAccentY=footerTaglineY-10;
  const canvasHeight=Math.max(1334,footerTaglineY+64);
  return {
    contentWidth,
    canvasHeight,
    practiced:{y:startY,lines:practicedLines,boxHeight:practicedHeight},
    knowledge:{y:knowledgeY,lines:knowledgeLines,boxHeight:knowledgeHeight},
    nextTraining:{y:nextTrainingY,lines:nextTrainingLines,boxHeight:nextTrainingHeight},
    footer:{brandY:footerBrandY,taglineY:footerTaglineY,accentY:footerAccentY}
  };
}
function posterDrawTextBlock(ctx,tpl,label,x,y,w,lines,boxHeight){
  const paddingTop=32,titleSpace=52,lineHeight=48;
  const boxY=y-paddingTop-24;
  ctx.save();
  if(tpl.type==='diagonalSplit'){
    posterRoundRect(ctx,x-20,boxY,w+40,boxHeight,16);ctx.fillStyle=tpl.soft;ctx.fill();ctx.strokeStyle='rgba(255,255,255,0.4)';ctx.lineWidth=1.5;ctx.stroke();
  }else if(tpl.type==='cleanSilhouette'){
    ctx.shadowColor='rgba(20, 61, 48, 0.08)';ctx.shadowBlur=15;ctx.shadowOffsetY=8;posterRoundRect(ctx,x-20,boxY,w+40,boxHeight,16);ctx.fillStyle=tpl.soft;ctx.fill();ctx.shadowColor='transparent';ctx.strokeStyle='rgba(20, 61, 48, 0.1)';ctx.lineWidth=1;ctx.stroke();
  }else if(tpl.type==='brushSplash'||tpl.type==='sport'){
    ctx.save();posterRoundRect(ctx,x-20,boxY,w+40,boxHeight,12);ctx.fillStyle=tpl.soft;ctx.fill();ctx.clip();ctx.fillStyle=tpl.accent;ctx.fillRect(x-20,boxY,8,boxHeight);ctx.restore();
  }else if(tpl.type==='flatPopBlue'){
    ctx.shadowColor='#0A2E7A';ctx.shadowBlur=0;ctx.shadowOffsetX=6;ctx.shadowOffsetY=6;posterRoundRect(ctx,x-20,boxY,w+40,boxHeight,0);ctx.fillStyle=tpl.soft;ctx.fill();ctx.shadowColor='transparent';
  }else if(tpl.type==='split'||tpl.type==='minimal'){
    if(tpl.type==='split'){ctx.shadowColor='rgba(0,0,0,0.1)';ctx.shadowBlur=10;ctx.shadowOffsetY=4;}
    posterRoundRect(ctx,x-30,boxY,w+60,boxHeight,16);ctx.fillStyle=tpl.soft;ctx.fill();ctx.shadowColor='transparent';
  }else if(tpl.type==='wireframe'){
    posterRoundRect(ctx,x-20,boxY,w+40,boxHeight,12);ctx.fillStyle=tpl.soft;ctx.fill();ctx.strokeStyle='rgba(255,255,255,0.2)';ctx.lineWidth=1;ctx.stroke();
  }else if(tpl.type==='popart'){
    ctx.fillStyle='#111111';posterRoundRect(ctx,x-12,boxY+8,w+40,boxHeight,6);ctx.fill();ctx.fillStyle=tpl.soft;posterRoundRect(ctx,x-20,boxY,w+40,boxHeight,6);ctx.fill();ctx.strokeStyle='#111111';ctx.lineWidth=4;ctx.stroke();
  }else if(tpl.type==='magazine'){
    ctx.fillStyle=tpl.ink;ctx.fillRect(x-24,y-22,4,boxHeight-paddingTop+4);
  }
  ctx.fillStyle=tpl.cardTitle||tpl.accent;
  ctx.font='800 22px -apple-system,BlinkMacSystemFont,"PingFang SC","Microsoft YaHei",sans-serif';
  ctx.fillText(label,x,y);
  lines.forEach((lineGroups,i)=>{
    let currentX=x;
    lineGroups.forEach(group=>{
      posterContentFont(ctx,group.highlight);
      ctx.fillStyle=group.highlight?(tpl.highlight||tpl.accent):tpl.ink;
      ctx.fillText(group.text,currentX,y+titleSpace+i*lineHeight);
      currentX+=ctx.measureText(group.text).width;
    });
  });
  ctx.restore();
  return boxHeight+28;
}
function drawFeedbackPoster(canvas,data,templateKey='blueGreenDiagonal'){
  const tpl=FEEDBACK_POSTER_TEMPLATES[templateKey]||FEEDBACK_POSTER_TEMPLATES.blueGreenDiagonal;
  const ctx=canvas.getContext('2d');
  const layout=measureFeedbackPosterLayout(ctx,data);
  const canvasHeight=layout.canvasHeight;
  canvas.width=750;canvas.height=layout.canvasHeight;
  const grad=ctx.createLinearGradient(0,0,0,canvasHeight);grad.addColorStop(0,tpl.bg1);grad.addColorStop(1,tpl.bg2);ctx.fillStyle=grad;ctx.fillRect(0,0,750,canvasHeight);
  ctx.save();
  if(tpl.type==='diagonalSplit'){
    ctx.fillStyle=tpl.accent;ctx.beginPath();ctx.moveTo(0,Math.max(950,canvasHeight-384));ctx.lineTo(750,Math.max(1100,canvasHeight-234));ctx.lineTo(750,canvasHeight);ctx.lineTo(0,canvasHeight);ctx.fill();
    ctx.strokeStyle='#4A8DB7';ctx.lineWidth=14;ctx.beginPath();ctx.ellipse(650,450,160,220,Math.PI/5,0,Math.PI*2);ctx.stroke();ctx.beginPath();ctx.moveTo(560,630);ctx.lineTo(460,830);ctx.stroke();
    ctx.lineWidth=2;ctx.strokeStyle='rgba(74, 141, 183, 0.4)';for(let i=500;i<800;i+=25){ctx.beginPath();ctx.moveTo(i,200);ctx.lineTo(i-100,700);ctx.stroke();}
  }else if(tpl.type==='cleanSilhouette'){
    const racketY=Math.max(1150,canvasHeight-184);
    ctx.strokeStyle=tpl.ink;ctx.lineWidth=10;ctx.beginPath();ctx.ellipse(650,racketY,200,260,-Math.PI/6,0,Math.PI*2);ctx.stroke();ctx.beginPath();ctx.moveTo(550,racketY+200);ctx.lineTo(450,racketY+400);ctx.stroke();
    ctx.lineWidth=1.5;ctx.strokeStyle='rgba(20, 61, 48, 0.3)';for(let i=500;i<900;i+=20){ctx.beginPath();ctx.moveTo(i,Math.max(900,canvasHeight-434));ctx.lineTo(i-150,Math.max(1400,canvasHeight+66));ctx.stroke();}for(let i=900;i<Math.max(1400,canvasHeight+66);i+=20){ctx.beginPath();ctx.moveTo(400,i);ctx.lineTo(900,i-150);ctx.stroke();}
    ctx.fillStyle=tpl.accent;ctx.beginPath();ctx.arc(150,Math.max(1100,canvasHeight-234),45,0,Math.PI*2);ctx.fill();ctx.strokeStyle='#FFFFFF';ctx.lineWidth=3;ctx.beginPath();ctx.arc(120,Math.max(1100,canvasHeight-234),30,-Math.PI/3,Math.PI/3);ctx.stroke();
  }else if(tpl.type==='brushSplash'){
    ctx.lineCap='round';ctx.lineWidth=80;ctx.strokeStyle=tpl.accent;ctx.beginPath();ctx.moveTo(-50,180);ctx.quadraticCurveTo(300,300,500,80);ctx.stroke();ctx.strokeStyle='rgba(255,255,255,0.85)';ctx.beginPath();ctx.moveTo(-30,80);ctx.quadraticCurveTo(350,200,600,-50);ctx.stroke();ctx.strokeStyle='#00A8CC';ctx.beginPath();ctx.moveTo(800,1200);ctx.quadraticCurveTo(500,1150,300,1350);ctx.stroke();
    ctx.lineWidth=8;ctx.strokeStyle='#00A8CC';ctx.beginPath();ctx.ellipse(180,480,110,150,Math.PI/4,0,Math.PI*2);ctx.stroke();ctx.strokeStyle='#FF9D00';ctx.beginPath();ctx.ellipse(650,750,130,170,-Math.PI/6,0,Math.PI*2);ctx.stroke();ctx.fillStyle='#A3D953';ctx.beginPath();ctx.arc(380,650,40,0,Math.PI*2);ctx.fill();
  }else if(tpl.type==='flatPopBlue'){
    ctx.fillStyle='#FFFFFF';ctx.fillRect(520,0,14,canvasHeight);ctx.fillRect(0,Math.max(900,canvasHeight-434),750,14);ctx.shadowColor='#0A2E7A';ctx.shadowBlur=0;ctx.shadowOffsetX=8;ctx.shadowOffsetY=8;ctx.fillStyle='#FFFFFF';ctx.beginPath();ctx.ellipse(640,Math.max(1120,canvasHeight-214),110,140,Math.PI/5,0,Math.PI*2);ctx.fill();ctx.fillRect(520,Math.max(1220,canvasHeight-114),30,150);ctx.fillStyle=tpl.accent;ctx.beginPath();ctx.arc(120,180,35,0,Math.PI*2);ctx.fill();ctx.beginPath();ctx.arc(680,750,25,0,Math.PI*2);ctx.fill();ctx.shadowColor='transparent';
  }else if(tpl.type==='split'){
    ctx.fillStyle=tpl.bg2;ctx.beginPath();ctx.moveTo(0,canvasHeight);ctx.lineTo(750,canvasHeight);ctx.lineTo(750,450);ctx.lineTo(0,Math.max(950,canvasHeight-384));ctx.fill();ctx.strokeStyle='#FFFFFF';ctx.lineWidth=18;ctx.beginPath();ctx.moveTo(-50,Math.max(983,canvasHeight-351));ctx.lineTo(800,416);ctx.stroke();ctx.fillStyle='#D4F02E';ctx.beginPath();ctx.arc(580,430,70,0,Math.PI*2);ctx.fill();ctx.strokeStyle='#FFFFFF';ctx.lineWidth=6;ctx.beginPath();ctx.arc(540,430,40,-Math.PI/2,Math.PI/2);ctx.stroke();
  }else if(tpl.type==='wireframe'){
    ctx.strokeStyle='rgba(255,255,255,0.1)';ctx.lineWidth=2;for(let i=0;i<750;i+=40){ctx.beginPath();ctx.moveTo(i,0);ctx.lineTo(i,canvasHeight);ctx.stroke();}for(let i=0;i<canvasHeight;i+=40){ctx.beginPath();ctx.moveTo(0,i);ctx.lineTo(750,i);ctx.stroke();}
    ctx.strokeStyle='rgba(255,255,255,0.4)';ctx.lineWidth=6;ctx.beginPath();ctx.ellipse(600,300,220,280,Math.PI*.1,0,Math.PI*2);ctx.stroke();ctx.beginPath();ctx.moveTo(500,560);ctx.lineTo(300,1000);ctx.stroke();ctx.beginPath();ctx.moveTo(560,580);ctx.lineTo(360,1030);ctx.stroke();ctx.shadowColor='rgba(0,0,0,0.5)';ctx.shadowBlur=20;ctx.shadowOffsetX=10;ctx.shadowOffsetY=10;ctx.fillStyle=tpl.accent;ctx.beginPath();ctx.arc(480,380,50,0,Math.PI*2);ctx.fill();
  }else if(tpl.type==='popart'){
    ctx.fillStyle=tpl.accent;ctx.beginPath();ctx.moveTo(150,0);ctx.lineTo(750,0);ctx.lineTo(750,500);ctx.lineTo(0,canvasHeight);ctx.lineTo(0,800);ctx.fill();ctx.fillStyle='rgba(0,0,0,0.08)';ctx.font='900 240px -apple-system,BlinkMacSystemFont,sans-serif';ctx.fillText('TENNIS',-20,220);ctx.fillText('WINNER',10,Math.max(1280,canvasHeight-54));
  }else if(tpl.type==='minimal'){
    ctx.strokeStyle='rgba(255,255,255,0.7)';ctx.lineWidth=14;ctx.beginPath();ctx.ellipse(375,450,280,350,0,0,Math.PI*2);ctx.stroke();ctx.lineWidth=2;ctx.strokeStyle='rgba(255,255,255,0.3)';for(let i=120;i<650;i+=40){ctx.beginPath();ctx.moveTo(i,110);ctx.lineTo(i,790);ctx.stroke();}for(let i=120;i<Math.max(800,canvasHeight-274);i+=40){ctx.beginPath();ctx.moveTo(110,i);ctx.lineTo(640,i);ctx.stroke();}ctx.fillStyle=tpl.accent;ctx.beginPath();ctx.arc(375,200,55,0,Math.PI*2);ctx.fill();
  }else if(tpl.type==='magazine'){
    ctx.strokeStyle='rgba(0,0,0,0.02)';ctx.lineWidth=1;for(let i=0;i<750;i+=30){ctx.beginPath();ctx.moveTo(i,0);ctx.lineTo(i,canvasHeight);ctx.stroke();}for(let i=0;i<canvasHeight;i+=30){ctx.beginPath();ctx.moveTo(0,i);ctx.lineTo(750,i);ctx.stroke();}ctx.fillStyle='rgba(0,0,0,0.02)';ctx.font='900 180px -apple-system,BlinkMacSystemFont,sans-serif';ctx.fillText('TENNIS',-10,220);ctx.fillText('REPORT',140,Math.max(1260,canvasHeight-74));
  }else if(tpl.type==='sport'){
    ctx.strokeStyle='rgba(255,255,255,0.04)';ctx.lineWidth=14;ctx.beginPath();ctx.arc(750,Math.max(1000,canvasHeight-334),450,Math.PI,Math.PI*1.5);ctx.stroke();ctx.beginPath();ctx.arc(0,300,400,0,Math.PI*.5);ctx.stroke();
  }
  ctx.restore();
  const nameStr=data.studentName||'学员';
  ctx.fillStyle=tpl.nameColor||tpl.ink;
  ctx.font='900 68px -apple-system,BlinkMacSystemFont,"PingFang SC","Microsoft YaHei",sans-serif';
  ctx.fillText(nameStr,60,140);
  const nameWidth=ctx.measureText(nameStr).width;
  ctx.fillStyle=tpl.subColor||tpl.muted;
  ctx.font='600 32px -apple-system,BlinkMacSystemFont,"PingFang SC",sans-serif';
  ctx.fillText('训练反馈',Math.min(60+nameWidth+16,560),140);
  ctx.fillStyle=tpl.type==='cleanSilhouette'?(tpl.subColor||tpl.muted):tpl.accent;
  ctx.font='700 26px -apple-system,BlinkMacSystemFont,"PingFang SC",sans-serif';
  ctx.fillText(`上课日期：${posterDisplayDate(data.date)}`,60,195);
  if(!['sport','diagonalSplit','split'].includes(tpl.type)){ctx.fillStyle=tpl.subColor||tpl.muted;ctx.globalAlpha=.3;ctx.fillRect(60,235,630,2);ctx.globalAlpha=1;}
  posterDrawTextBlock(ctx,tpl,'今天练习了',90,layout.practiced.y,layout.contentWidth,layout.practiced.lines,layout.practiced.boxHeight);
  posterDrawTextBlock(ctx,tpl,'练习情况',90,layout.knowledge.y,layout.contentWidth,layout.knowledge.lines,layout.knowledge.boxHeight);
  posterDrawTextBlock(ctx,tpl,'下次练习',90,layout.nextTraining.y,layout.contentWidth,layout.nextTraining.lines,layout.nextTraining.boxHeight);
  ctx.fillStyle=tpl.nameColor||tpl.ink;
  ctx.font='900 34px -apple-system,BlinkMacSystemFont,"PingFang SC","Microsoft YaHei",sans-serif';
  ctx.fillText('网球兄弟',60,layout.footer.brandY);
  ctx.fillStyle=tpl.subColor||tpl.muted;
  ctx.font='500 18px -apple-system,BlinkMacSystemFont,"PingFang SC",sans-serif';
  ctx.fillText('用网球向生活发出邀请',60,layout.footer.taglineY);
  ctx.save();ctx.fillStyle=tpl.accent;
  if(tpl.type==='sport'){ctx.beginPath();ctx.moveTo(630,layout.footer.taglineY);ctx.lineTo(690,layout.footer.taglineY);ctx.lineTo(670,layout.footer.accentY-20);ctx.fill();}
  else if(tpl.type==='magazine'){ctx.fillRect(640,layout.footer.accentY-5,50,6);}
  else if(tpl.type==='popart'||tpl.type==='flatPopBlue'){ctx.fillRect(650,layout.footer.accentY-15,16,16);}
  else{ctx.beginPath();ctx.arc(670,layout.footer.accentY,10,0,Math.PI*2);ctx.fill();}
  ctx.restore();
}
function feedbackPosterFilename(){
  const d=feedbackPosterState?.data||{};
  return `网球兄弟-${String(d.studentName||'学员').replace(/[\\/:*?"<>|]/g,'')}-${d.date||today()}.png`;
}
function renderFeedbackPosterPreview(templateKey){
  if(!feedbackPosterState)return;
  feedbackPosterState.templateKey=templateKey;
  document.querySelectorAll('[data-poster-template]').forEach(btn=>btn.classList.toggle('active',btn.dataset.posterTemplate===templateKey));
  const canvas=document.getElementById('feedbackPosterCanvas');
  if(!canvas)return;
  drawFeedbackPoster(canvas,feedbackPosterState.data,templateKey);
  const img=document.getElementById('feedbackPosterImage');
  if(img)img.src=canvas.toDataURL('image/png');
}
function openFeedbackPosterModal(feedbackId,scheduleId){
  const s=schedules.find(x=>x.id===scheduleId);
  const fb=feedbacks.find(x=>x.id===feedbackId)||scheduleFeedback(s);
  if(!s||!fb){toast('找不到反馈记录','error');return;}
  feedbackPosterState={scheduleId:s.id,feedbackId:fb.id,templateKey:'blueGreenDiagonal',data:feedbackPosterData(s,fb)};
  const buttons=Object.entries(FEEDBACK_POSTER_TEMPLATES).map(([key,t])=>`<button class="poster-template-btn${key==='blueGreenDiagonal'?' active':''}" data-poster-template="${key}" onclick="renderFeedbackPosterPreview('${key}')">${esc(t.name)}</button>`).join('');
  const body=`<div class="poster-mobile-shell"><div class="poster-template-row">${buttons}</div><canvas id="feedbackPosterCanvas" class="feedback-poster-canvas" width="750" height="1334"></canvas><img id="feedbackPosterImage" class="feedback-poster-image" alt="课后反馈海报"><div class="poster-save-tip">电脑点“下载图片”会保存 PNG；手机若没有下载入口，请长按海报图片保存。</div></div>`;
  const footer=`<button class="tms-btn tms-btn-default" onclick="openFeedbackModal('${s.id}')">返回反馈</button><button class="tms-btn tms-btn-default" id="posterDownloadBtn" onclick="downloadFeedbackPoster()">下载图片</button><button class="tms-btn tms-btn-primary" id="posterShareBtn" onclick="shareFeedbackPoster()">分享图片</button>`;
  setCourtModalFrame('生成课后海报',body,footer,'modal-tight');
  requestAnimationFrame(()=>renderFeedbackPosterPreview('blueGreenDiagonal'));
}
function feedbackPosterBlob(canvas){
  return new Promise((resolve,reject)=>canvas.toBlob(blob=>blob?resolve(blob):reject(new Error('图片生成失败')),'image/png'));
}
async function downloadFeedbackPoster(){
  const canvas=document.getElementById('feedbackPosterCanvas');
  if(!canvas||!feedbackPosterState)return;
  const btn=document.getElementById('posterDownloadBtn');if(btn){btn.disabled=true;btn.textContent='生成中…';}
  try{
    const blob=await feedbackPosterBlob(canvas);
    const url=URL.createObjectURL(blob);
    const a=document.createElement('a');
    a.href=url;
    a.download=feedbackPosterFilename();
    document.body.appendChild(a);
    a.click();
    a.remove();
    setTimeout(()=>URL.revokeObjectURL(url),1000);
    toast('已生成下载；手机浏览器如未保存，请长按海报图片保存','success');
  }catch(e){toast('下载失败：'+e.message,'error');}
  finally{if(btn){btn.disabled=false;btn.textContent='下载图片';}}
}
async function shareFeedbackPoster(){
  const canvas=document.getElementById('feedbackPosterCanvas');
  if(!canvas||!feedbackPosterState)return;
  const btn=document.getElementById('posterShareBtn');if(btn){btn.disabled=true;btn.textContent='准备中…';}
  try{
    const blob=await feedbackPosterBlob(canvas);
    const file=window.File?new File([blob],feedbackPosterFilename(),{type:'image/png'}):null;
    const canCopyImage=window.isSecureContext&&navigator.clipboard&&typeof navigator.clipboard.write==='function'&&window.ClipboardItem&&!/Mobile|Android|iP(ad|hone|od)/i.test(navigator.userAgent||'');
    if(canCopyImage){
      try{
        await navigator.clipboard.write([new ClipboardItem({'image/png':blob})]);
        toast('已复制图片，可直接粘贴','success');
        return;
      }catch(copyErr){
        console.warn('clipboard image copy failed, fallback to share',copyErr);
      }
    }
    if(file&&navigator.share&&navigator.canShare&&navigator.canShare({files:[file]})){
      await navigator.share({files:[file],title:'网球兄弟课后反馈'});
      toast('已打开分享','success');
    }else{
      toast('当前浏览器不支持系统分享，请点“下载图片”或长按海报保存','warn');
    }
  }catch(e){
    if(e?.name==='AbortError'||/cancel/i.test(e?.message||'')){toast('已取消分享','warn');}
    else toast('分享失败：'+e.message,'error');
  }
  finally{if(btn){btn.disabled=false;btn.textContent='分享图片';}}
}
function openFeedbackModal(scheduleId){
  const s=schedules.find(x=>x.id===scheduleId);if(!s){toast('找不到排课记录','error');return;}
  const fb=scheduleFeedback(s)||{};
  const trial=scheduleIsTrial(s);
  editId=fb.id||null;
  document.getElementById('mTitle').textContent=fb.id?'编辑课后反馈':'课后反馈';
  const posterBtn=fb.id?`<button class="btn-sec" onclick="openFeedbackPosterModal('${fb.id}','${s.id}')">生成海报</button>`:'';
  const trialFieldsHtml=trial?`<div class="sec-ttl">体验课内部记录</div><div class="fgrid"><div class="fg"><div class="flabel">学员水平</div><select class="fselect" id="fb_player_level"><option value="">未判断</option><option value="1.0～1.5"${fb.playerLevel==='1.0～1.5'?' selected':''}>1.0～1.5</option><option value="1.5～2.0"${fb.playerLevel==='1.5～2.0'?' selected':''}>1.5～2.0</option><option value="2.0～2.5"${fb.playerLevel==='2.0～2.5'?' selected':''}>2.0～2.5</option><option value="2.5～3.0"${fb.playerLevel==='2.5～3.0'?' selected':''}>2.5～3.0</option><option value="3.0～3.5"${fb.playerLevel==='3.0～3.5'?' selected':''}>3.0～3.5</option><option value="3.5～4.0"${fb.playerLevel==='3.5～4.0'?' selected':''}>3.5～4.0</option></select></div><div class="fg"><div class="flabel">转化意愿</div><select class="fselect" id="fb_conversion_intent"><option value="">未判断</option><option value="高"${fb.conversionIntent==='高'?' selected':''}>高</option><option value="中"${fb.conversionIntent==='中'?' selected':''}>中</option><option value="低"${fb.conversionIntent==='低'?' selected':''}>低</option></select></div><div class="fg"><div class="flabel">推荐产品</div><select class="fselect" id="fb_recommended_product_type"><option value="">未推荐</option><option value="场地会员"${fb.recommendedProductType==='场地会员'?' selected':''}>场地会员</option><option value="私教课"${fb.recommendedProductType==='私教课'?' selected':''}>私教课</option><option value="训练营"${fb.recommendedProductType==='训练营'?' selected':''}>训练营</option><option value="继续观察"${fb.recommendedProductType==='继续观察'?' selected':''}>继续观察</option></select></div><div class="fg"><div class="flabel">是否需要跟进</div><select class="fselect" id="fb_need_ops_follow_up"><option value="否"${fb.needOpsFollowUp?'':' selected'}>否</option><option value="是"${fb.needOpsFollowUp?' selected':''}>是</option></select></div></div>`:'';
  document.getElementById('mBody').innerHTML=`<div style="background:rgba(217,119,6,0.08);border:0.5px solid rgba(217,119,6,0.2);border-radius:9px;padding:10px 13px;font-size:12px;color:var(--ts);margin-bottom:12px">${fmtDt(s.startTime)} · ${esc(scheduleStudentSummary(s))} · ${esc(coachName(s.coach))||'—'} · ${esc(scheduleLocationText(s))} · ${scheduleCourseTypeLabel(s)}</div><div class="sec-ttl">反馈内容</div><div class="fgrid"><div class="fg full"><div class="flabel">今天练习了 *</div><textarea class="finput ftextarea" id="fb_practiced">${esc(fb.practicedToday||fb.template?.focus||fb.performance)}</textarea></div><div class="fg full"><div class="flabel">练习情况（非必填）</div><textarea class="finput ftextarea" id="fb_knowledge">${esc(fb.knowledgePoint||fb.problems)}</textarea></div><div class="fg full"><div class="flabel">下次练习 *</div><textarea class="finput ftextarea" id="fb_next_training">${esc(fb.nextTraining||fb.nextAdvice)}</textarea></div></div>${trialFieldsHtml}<div class="mactions"><button class="btn-cancel" onclick="closeModal()">取消</button>${posterBtn}<button class="btn-save" onclick="saveFeedback('${s.id}')">保存反馈</button></div>`;
  document.getElementById('overlay').classList.add('open');
}
function feedbackDraftText(s){
  const v=id=>document.getElementById(id)?.value.trim()||'';
  const lines=[`${s.studentName||'学员'} ${fmtDt(s.startTime)} 课后反馈`,`今天练习了：${v('fb_practiced')||'—'}`,`练习情况：${v('fb_knowledge')||'—'}`,`下次练习：${v('fb_next_training')||'—'}`];
  if(scheduleIsTrial(s)){
    lines.push(`学员水平：${v('fb_player_level')||'—'}`,`转化意愿：${v('fb_conversion_intent')||'—'}`,`推荐产品：${v('fb_recommended_product_type')||'—'}`,`是否需要跟进：${v('fb_need_ops_follow_up')||'否'}`);
  }
  return lines.join('\n');
}
async function copyText(text){
  if(navigator.clipboard&&window.isSecureContext){await navigator.clipboard.writeText(text);return;}
  const ta=document.createElement('textarea');ta.value=text;document.body.appendChild(ta);ta.select();document.execCommand('copy');ta.remove();
}
async function copyFeedbackDraft(scheduleId){
  const s=schedules.find(x=>x.id===scheduleId);if(!s)return;
  try{await copyText(feedbackDraftText(s));toast('反馈文案已复制','success');}
  catch(e){toast('复制失败，请手动复制','error');}
}
async function saveFeedback(scheduleId){
  const s=schedules.find(x=>x.id===scheduleId);if(!s)return;
  const btn=document.querySelector('.btn-save');btn.disabled=true;btn.textContent='保存中…';
  const studentIds=parseArr(s.studentIds);
  const practicedToday=document.getElementById('fb_practiced').value.trim();
  const nextTraining=document.getElementById('fb_next_training').value.trim();
  if(!practicedToday||!nextTraining){toast('请填写「今天练习了」和「下次练习」','warn');btn.disabled=false;btn.textContent='保存反馈';return;}
  const isTrial=scheduleIsTrial(s);
  const data={scheduleId:s.id,studentId:studentIds[0]||'',studentIds,studentName:s.studentName||'',coach:s.coach||'',startTime:s.startTime||'',campus:s.campus||'',venue:s.venue||'',lessonCount:s.lessonCount||0,isTrial,remainingLessons:scheduleRemainingLessons(s),practicedToday,knowledgePoint:document.getElementById('fb_knowledge').value.trim(),nextTraining,playerLevel:isTrial?(document.getElementById('fb_player_level')?.value||''):'',goalType:'',experienceBackground:'',mainIssues:'',conversionIntent:isTrial?(document.getElementById('fb_conversion_intent')?.value||''):'',recommendedProductType:isTrial?(document.getElementById('fb_recommended_product_type')?.value||''):'',recommendedReason:'',needOpsFollowUp:isTrial&&((document.getElementById('fb_need_ops_follow_up')?.value||'否')==='是'),opsFollowUpPriority:'',opsFollowUpSuggestion:''};
  try{
    const saved=editId?await apiCall('PUT','/feedbacks/'+editId,data):await apiCall('POST','/feedbacks',data);
    const i=feedbacks.findIndex(f=>f.id===saved.id);if(i>=0)feedbacks[i]=saved;else feedbacks.unshift(saved);
    toast('反馈已保存 ✓','success');renderSchedule();renderCoachOps();renderWorkbench();renderMySchedule();renderMyStudents();openFeedbackModal(s.id);
  }catch(e){toast('保存失败：'+e.message,'error');btn.disabled=false;btn.textContent='保存反馈';}
}
function feedbackSummaryHtml(fb){
  if(!fb)return '—';
  const parts=[fb.practicedToday||fb.template?.focus,fb.knowledgePoint,fb.nextTraining||fb.nextAdvice,fb.mainIssues,fb.conversionIntent?`转化意愿 ${fb.conversionIntent}`:'',fb.recommendedProductType?`推荐 ${fb.recommendedProductType}`:''].filter(Boolean);
  return parts.length?parts.map(esc).join('；'):'已填写';
}
function openScheduleDetail(scheduleId){
  const s=schedules.find(x=>x.id===scheduleId);if(!s)return;
  const fb=scheduleFeedback(s);
  const ent=findEntitlementForSchedule(s);
  const studentNames=scheduleStudentSummary(s);
  const stuRecords=parseArr(s.studentIds).map(id=>students.find(st=>st.id===id)).filter(Boolean);
  const primaryCoachText=[...new Set(stuRecords.map(st=>studentPrimaryCoachText(st)).filter(Boolean))].join('、')||'未分配';
  const ownerCoachText=[...new Set(stuRecords.map(st=>myStudentOwnerCoachText(st)).filter(Boolean))].join('、')||'未设置';
  const studentNotes=stuRecords.map(st=>st.notes).filter(Boolean).join('；');
  const recentFeedback=stuRecords.flatMap(st=>feedbacks.filter(item=>item.studentId===st.id||parseArr(item.studentIds).includes(st.id))).filter(item=>item.id!==fb?.id).sort((a,b)=>String(b.updatedAt||'').localeCompare(String(a.updatedAt||''))).slice(0,2);
  const statusText=`${scheduleStatusLabel(effectiveScheduleStatus(s))}${s.cancelReason?` · ${s.cancelReason}`:''}`;
  const baseFields=[
    studentDetailFieldHtml('时间',`${fmtDt(s.startTime)}${s.endTime?` - ${fmtDt(s.endTime)}`:''}`),
    studentDetailFieldHtml('校区 / 场地',scheduleLocationText(s)),
    isExternalSchedule(s)&&s.externalNotes?studentDetailBlockHtml('外部场馆说明',esc(s.externalNotes),{hideEmpty:true}):'',
    studentDetailFieldHtml('课程类型',scheduleCourseTypeLabel(s)||courseTypeDisplayLabel(ent)||'-'),
    studentDetailFieldHtml('学员',studentNames),
    studentDetailFieldHtml('状态',statusText),
    studentDetailFieldHtml('上课教练',coachName(s.coach)||'-'),
    studentDetailFieldHtml('负责教练',primaryCoachText),
    studentDetailFieldHtml('归属教练',ownerCoachText),
    studentDetailFieldHtml('课包 / 权益',scheduleEntitlementSummary(s)),
    studentDetailFieldHtml('排课来源',s.scheduleSource||'排课表')
  ].filter(Boolean).join('');
  const preLessonFields=[
    studentNotes?studentDetailBlockHtml('学员备注',esc(studentNotes),{hideEmpty:true}):'',
    studentDetailBlockHtml('历史问题',esc(recentFeedback.map(item=>item.knowledgePoint||item.practicedToday).filter(Boolean).join('；')),{hideEmpty:true}),
    studentDetailBlockHtml('教练备注 / 本节关注点',`${esc(s.notes)||''}${fb?.nextTraining?`<br>${esc(fb.nextTraining)}`:''}`,{hideEmpty:true})
  ].filter(Boolean).join('');
  const afterLessonFields=[
    studentDetailFieldHtml('消耗课时',`${lessonQty(s.lessonCount)} 节`),
    studentDetailFieldHtml('班次剩余课时',scheduleRemainingLessons(s)===''?'-':`${scheduleRemainingLessons(s)} 节`),
    studentDetailBlockHtml('反馈摘要',esc(renderCourtEmptyText(feedbackSummaryHtml(fb))),{hideEmpty:true}),
    studentDetailBlockHtml('历史反馈',recentFeedback.length?recentFeedback.map(item=>`${String(item.updatedAt||'').slice(0,10)}：${item.practicedToday||item.knowledgePoint||'已填写'}`).map(esc).join('<br>'):'',{hideEmpty:true})
  ].filter(Boolean).join('');
  const lateSummary=s.coachLateFree?`<div class="tms-section-header">教练迟到处理</div><div class="tms-detail-grid">${studentDetailFieldHtml('处理结果','本节免费，不扣学员课时')}${studentDetailFieldHtml('迟到分钟',`${parseInt(s.lateMinutes)||0} 分钟`)}${studentDetailFieldHtml('教练承担场地费',`¥${fmt(parseFloat(s.coachLateFieldFeeAmount)||0)}`)}${studentDetailBlockHtml('原因',esc(s.lateReason),{hideEmpty:true})}</div>`:'';
  const trialSummary=fb&&scheduleIsTrial(s)?`<div class="tms-section-header">体验课内部记录</div><div class="tms-detail-grid">${studentDetailFieldHtml('学员水平',fb.playerLevel)}${studentDetailFieldHtml('转化意愿',fb.conversionIntent)}${studentDetailFieldHtml('推荐产品',fb.recommendedProductType)}${studentDetailFieldHtml('是否需要跟进',fb.needOpsFollowUp?'是':'否')}</div>`:'';
  const body=`<div class="tms-section-header" style="margin-top:0;">课程基础信息</div><div class="tms-detail-grid">${baseFields}</div>${preLessonFields?`<div class="tms-section-header">上课前信息</div><div class="tms-detail-grid">${preLessonFields}</div>`:''}<div class="tms-section-header">课后动作</div><div class="tms-detail-grid">${afterLessonFields}</div>${lateSummary}${trialSummary}`;
  const footer=`<button class="tms-btn tms-btn-default" onclick="closeModal()">关闭</button><button class="tms-btn tms-btn-primary" onclick="openFeedbackModal('${s.id}')">${fb?'查看/编辑反馈':'填写反馈'}</button>`;
  setCourtModalFrame('排课详情',body,footer,'modal-wide');
}
